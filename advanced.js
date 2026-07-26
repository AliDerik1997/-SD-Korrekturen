"use strict";

// FDN ÖSD Version 17 – erweiterte lokale Werkzeuge und optionale Dienste.
const advancedPrivateKey = "fdn-osd-private-v11";
const undoStorageKey = "fdn-osd-undo-v11";
let advancedPrivate = loadAdvancedPrivate();
let cloudPassphrase = sessionStorage.getItem("fdn-osd-e2e-passphrase") || "";
let undoRestoring = false;
let undoStack = loadUndoStack();
let redoStack = [];
let lastUndoSnapshot = stableBackupSnapshot();

function loadAdvancedPrivate() {
  try {
    return {
      mailEndpoint: "",
      mailToken: "",
      aiEndpoint: "",
      aiToken: "",
      aiCloudEnabled: false,
      encryptionEnabled: false,
      webAuthnCredentialID: "",
      webAuthnEnabled: false,
      ...(JSON.parse(localStorage.getItem(advancedPrivateKey)) || {})
    };
  } catch {
    return { mailEndpoint: "", mailToken: "", aiEndpoint: "", aiToken: "", aiCloudEnabled: false, encryptionEnabled: false, webAuthnCredentialID: "", webAuthnEnabled: false };
  }
}

function saveAdvancedPrivate() {
  localStorage.setItem(advancedPrivateKey, JSON.stringify(advancedPrivate));
}

function stableBackupSnapshot() {
  const backup = portableBackup();
  delete backup.exportedAt;
  delete backup.modifiedAt;
  return JSON.stringify(backup);
}

function loadUndoStack() {
  try {
    const saved = JSON.parse(localStorage.getItem(undoStorageKey));
    return Array.isArray(saved) ? saved.slice(-8) : [];
  } catch { return []; }
}

function persistUndoStack() {
  try {
    localStorage.setItem(undoStorageKey, JSON.stringify(undoStack.slice(-8)));
  } catch {
    undoStack = undoStack.slice(-3);
    try { localStorage.setItem(undoStorageKey, JSON.stringify(undoStack)); } catch { /* Daten selbst bleiben sicher. */ }
  }
}

const baseSaveState = saveState;
saveState = function advancedSaveState(touch = true) {
  const beforeSave = stableBackupSnapshot();
  if (!undoRestoring && beforeSave !== lastUndoSnapshot) {
    undoStack.push(lastUndoSnapshot);
    undoStack = undoStack.slice(-8);
    redoStack = [];
    persistUndoStack();
  }
  baseSaveState(touch);
  lastUndoSnapshot = stableBackupSnapshot();
  renderUndoControls();
};

function restoreSnapshot(snapshot, destination) {
  if (!snapshot) return;
  destination.push(stableBackupSnapshot());
  undoRestoring = true;
  applyImportedBackup(JSON.parse(snapshot), true);
  undoRestoring = false;
  lastUndoSnapshot = stableBackupSnapshot();
  persistUndoStack();
  renderAdvanced();
}

function undoLastChange() {
  const snapshot = undoStack.pop();
  if (!snapshot) return showToast("Keine frühere Änderung vorhanden.");
  restoreSnapshot(snapshot, redoStack);
  showToast("Letzte Änderung rückgängig gemacht");
}

function redoLastChange() {
  const snapshot = redoStack.pop();
  if (!snapshot) return showToast("Nichts zum Wiederholen vorhanden.");
  restoreSnapshot(snapshot, undoStack);
  showToast("Änderung wiederhergestellt");
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach(value => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function encryptionKey(passphrase, salt, usage) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("FDN ÖSD Cloud Backup v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

function requestCloudPassphrase(message) {
  if (cloudPassphrase) return cloudPassphrase;
  const value = prompt(message || "Verschlüsselungskennwort eingeben:") || "";
  if (value.length < 8) throw new Error("encryption-key-missing");
  cloudPassphrase = value;
  sessionStorage.setItem("fdn-osd-e2e-passphrase", value);
  return value;
}

async function encodeCloudPayload(backup) {
  if (!advancedPrivate.encryptionEnabled) return backup;
  const passphrase = requestCloudPassphrase("Kennwort für die verschlüsselte Cloud-Sicherung eingeben (mindestens 8 Zeichen):");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(passphrase, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(backup))));
  return { format: "fdn-osd-e2e-v1", salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function decodeCloudPayload(payload) {
  if (payload?.format !== "fdn-osd-e2e-v1") return payload;
  const passphrase = requestCloudPassphrase("Kennwort für diese Ende-zu-Ende-verschlüsselte Sicherung eingeben:");
  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const key = await encryptionKey(passphrase, salt, ["decrypt"]);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(payload.ciphertext));
    return JSON.parse(new TextDecoder().decode(clear));
  } catch {
    cloudPassphrase = "";
    sessionStorage.removeItem("fdn-osd-e2e-passphrase");
    throw new Error("Falsches Kennwort oder beschädigte Sicherung.");
  }
}

function advancedCardMarkup() {
  return `
    <section class="card advanced-capture-card" id="advanced-capture-card">
      <div class="card-heading"><div><h3>Intelligente Erfassung</h3><p>Aufträge aus einer ÖSD-E-Mail übernehmen und Belege zum gewählten Tag ablegen.</p></div><span class="feature-icon">✨</span></div>
      <details><summary><strong>ÖSD-E-Mail einlesen</strong><span>Text einfügen</span></summary>
        <textarea id="email-import-text" rows="5" placeholder="E-Mail-Text hier einfügen, z. B. 4 × A1, 2 × B2, Frist 18.07.2026"></textarea>
        <button class="primary-button" id="parse-email-orders">Aufträge erkennen</button>
      </details>
      <div class="attachment-tools">
        <label class="secondary-button file-button" for="day-attachment-input">Foto oder Dokument hinzufügen</label>
        <input id="day-attachment-input" type="file" accept="image/*,application/pdf,.pdf" multiple hidden>
        <div id="day-attachments" class="attachment-list"></div>
      </div>
    </section>`;
}

function settingsMarkup() {
  return `
    <section class="card advanced-settings-card" id="advanced-settings-card">
      <div class="card-heading"><div><h3>Automation & Sicherheit</h3><p>Monatsabschluss, Versand, Verschlüsselung, Erinnerungen und Geräteschutz.</p></div><span class="account-shield">12</span></div>
      <label class="preference-row"><span>Monat automatisch abschließen</span><input id="auto-month-close" type="checkbox"></label>
      <label class="preference-row"><span>Fristen auf diesem Gerät melden</span><input id="deadline-notifications" type="checkbox"></label>
      <label class="preference-row"><span>Cloud-Sicherungen Ende-zu-Ende verschlüsseln</span><input id="e2e-encryption" type="checkbox"></label>
      <div class="button-row"><button class="secondary-button" id="set-encryption-passphrase">Verschlüsselungskennwort setzen</button><button class="secondary-button" id="webauthn-toggle">Geräteschutz aktivieren</button></div>
      <hr>
      <label class="preference-row"><span>Monatsabrechnung automatisch per E-Mail senden</span><input id="auto-invoice-email" type="checkbox"></label>
      <label><span>Sicherer E-Mail-Webhook (HTTPS)</span><input id="mail-webhook" type="url" placeholder="https://…/send-invoice"></label>
      <label><span>Webhook-Token</span><input id="mail-token" type="password" autocomplete="off"></label>
      <div class="button-row"><button class="primary-button" id="send-month-now">Gewählten Monat jetzt senden</button><button class="secondary-button" id="test-mail-service">Verbindung testen</button></div>
      <p class="share-hint">Ohne eigenen E-Mail-Dienst bleibt das manuelle Teilen aktiv. Das Token wird nur auf diesem Gerät gespeichert und nie exportiert.</p>
    </section>
    <section class="card personalization-card" id="personalization-card">
      <div class="card-heading"><div><h3>Persönliche Oberfläche</h3><p>Farben, Textgröße und eine kompaktere Startseite.</p></div></div>
      <label class="preference-row"><span>Farbwelt</span><select id="accent-select"><option value="ocean">Ozean</option><option value="violet">Violett</option><option value="coral">Koralle</option><option value="forest">Wald</option></select></label>
      <label class="preference-row"><span>Textgröße</span><select id="font-scale-select"><option value="normal">Standard</option><option value="large">Groß</option><option value="xlarge">Sehr groß</option></select></label>
      <label class="preference-row"><span>Startseite kompakt anzeigen</span><input id="compact-home" type="checkbox"></label>
      <div class="button-row"><button class="secondary-button" id="undo-change">↶ Rückgängig</button><button class="secondary-button" id="redo-change">↷ Wiederholen</button></div>
      <p class="share-hint" id="version-status">Version 17.1 · geprüfte Checkpoints · stabilere Importe und Zeiterfassung</p>
    </section>`;
}

function historyMarkup() {
  const currentYear = new Date().getFullYear();
  const years = [...new Set(Object.keys(state.entries).map(key => key.slice(0, 4)))].sort().reverse();
  if (!years.includes(String(currentYear))) years.unshift(String(currentYear));
  return `
    <section class="card history-tools" id="history-tools">
      <label><span>Arbeitstage durchsuchen</span><input id="history-search" type="search" placeholder="Datum oder Niveau"></label>
      <div class="history-filter-row"><select id="history-category-filter"><option value="">Alle Niveaus</option>${categories.map(category => `<option value="${category.id}">${category.title}</option>`).join("")}</select><select id="history-year-filter">${years.map(year => `<option value="${year}">${year}</option>`).join("")}<option value="">Alle Jahre</option></select></div>
    </section>
    <section class="summary-card year-summary" id="year-summary"><div class="summary-label"><span>Jahresübersicht</span><strong id="year-summary-label">${currentYear}</strong></div><div class="summary-values"><div><span>Verdienst</span><strong id="year-earnings">0,00 €</strong></div><div class="align-right"><span>Aufträge</span><strong id="year-count">0</strong></div></div><div class="year-month-bars" id="year-month-bars"></div></section>`;
}

function paymentMarkup() {
  return `<section class="card payment-card" id="payment-card"><div class="card-heading"><div><h3>Zahlungen & Mahnungen</h3><p>Offene Honorarnoten und überschrittene Zahlungsziele.</p></div></div><div id="payment-reminders"></div></section>`;
}

function injectAdvancedUI() {
  const taskCard = document.querySelector(".tasks-card");
  if (taskCard && !document.querySelector("#advanced-capture-card")) taskCard.insertAdjacentHTML("afterend", advancedCardMarkup());
  const historyTitle = document.querySelector("#page-history .page-title");
  if (historyTitle && !document.querySelector("#history-tools")) historyTitle.insertAdjacentHTML("afterend", historyMarkup());
  const archiveCard = document.querySelector(".invoice-archive-card");
  if (archiveCard && !document.querySelector("#payment-card")) archiveCard.insertAdjacentHTML("afterend", paymentMarkup());
  const privacyCard = document.querySelector("#page-settings .privacy-card");
  if (privacyCard && !document.querySelector("#advanced-settings-card")) privacyCard.insertAdjacentHTML("beforebegin", settingsMarkup());
  bindAdvancedEvents();
}

function bindAdvancedEvents() {
  document.querySelector("#parse-email-orders")?.addEventListener("click", importOrdersFromEmail);
  document.querySelector("#day-attachment-input")?.addEventListener("change", importAttachments);
  document.querySelector("#history-search")?.addEventListener("input", filterHistory);
  document.querySelector("#history-category-filter")?.addEventListener("change", filterHistory);
  document.querySelector("#history-year-filter")?.addEventListener("change", () => { renderYearSummary(); filterHistory(); });
  document.querySelector("#auto-month-close")?.addEventListener("change", event => { state.extensions.autoMonthClose = event.target.checked; saveState(); if (event.target.checked) ensureMonthlyArchives(); });
  document.querySelector("#deadline-notifications")?.addEventListener("change", toggleDeadlineNotifications);
  document.querySelector("#e2e-encryption")?.addEventListener("change", event => { advancedPrivate.encryptionEnabled = event.target.checked; saveAdvancedPrivate(); if (event.target.checked) setEncryptionPassphrase(); });
  document.querySelector("#set-encryption-passphrase")?.addEventListener("click", setEncryptionPassphrase);
  document.querySelector("#webauthn-toggle")?.addEventListener("click", toggleWebAuthn);
  document.querySelector("#auto-invoice-email")?.addEventListener("change", event => { state.extensions.autoEmail = event.target.checked; saveState(); });
  document.querySelector("#mail-webhook")?.addEventListener("change", saveMailSettings);
  document.querySelector("#mail-token")?.addEventListener("change", saveMailSettings);
  document.querySelector("#send-month-now")?.addEventListener("click", () => sendMonthlyInvoice(invoiceMonth, false));
  document.querySelector("#test-mail-service")?.addEventListener("click", testMailService);
  document.querySelector("#accent-select")?.addEventListener("change", event => { state.extensions.accent = event.target.value; saveState(); applyPersonalization(); });
  document.querySelector("#font-scale-select")?.addEventListener("change", event => { state.extensions.fontScale = event.target.value; saveState(); applyPersonalization(); });
  document.querySelector("#compact-home")?.addEventListener("change", event => { state.extensions.compactHome = event.target.checked; saveState(); applyPersonalization(); });
  document.querySelector("#undo-change")?.addEventListener("click", undoLastChange);
  document.querySelector("#redo-change")?.addEventListener("click", redoLastChange);
}

function parseOrderEmail(text) {
  const dueMatch = text.match(/(?:Frist|fällig|retour|bis)\D{0,12}(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/i);
  const year = dueMatch ? Number(dueMatch[3].length === 2 ? `20${dueMatch[3]}` : dueMatch[3]) : new Date().getFullYear();
  const due = dueMatch ? dayKey(new Date(year, Number(dueMatch[2]) - 1, Number(dueMatch[1]), 12)) : state.selectedDate;
  const aliases = [
    { id: "b1-listening", pattern: /B1\s*(?:Hören|H|LH)/i },
    { id: "b1-reading", pattern: /B1\s*(?:Lesen|L)/i },
    { id: "b1-writing", pattern: /B1(?:\s*(?:Schreiben|S))?/i },
    { id: "b2-writing", pattern: /B2/i },
    { id: "a2-writing", pattern: /A2/i },
    { id: "a1-writing", pattern: /A1/i }
  ];
  const orders = [];
  for (const line of text.split(/\n|,|;/).map(item => item.trim()).filter(Boolean)) {
    const alias = aliases.find(item => item.pattern.test(line));
    if (!alias) continue;
    const before = line.match(/(\d+)\s*(?:x|×|Stück|Stk\.?|Aufträge?)?\s*(?=A1|A2|B1|B2)/i);
    const after = line.match(/(?:A1|A2|B1|B2)[^\d\n]{0,30}(\d+)/i);
    const count = Math.max(1, Number(before?.[1] || after?.[1] || 1));
    orders.push({ categoryID: alias.id, count, dueDateKey: due });
  }
  return orders;
}

function importOrdersFromEmail() {
  const text = document.querySelector("#email-import-text").value.trim();
  const orders = parseOrderEmail(text);
  if (!orders.length) return showToast("Keine Niveaus erkannt. Beispiel: 4 × A1, 2 × B2.");
  const client = state.extensions.clients.find(item => item.id !== "osd" && [item.name, item.shortName].some(name => name && text.toLocaleLowerCase("de").includes(name.toLocaleLowerCase("de")))) || clientForDate(state.selectedDate);
  const fingerprints = new Set(state.tasks.map(item => `${item.categoryID}|${item.count}|${item.dueDateKey}|${item.clientID || "osd"}`));
  let imported = 0;
  for (const order of orders) {
    const category = categories.find(item => item.id === order.categoryID);
    const fingerprint = `${order.categoryID}|${order.count}|${order.dueDateKey}|${client.id}`;
    if (fingerprints.has(fingerprint)) continue;
    const estimatedMinutes = Math.max(5, Math.round(order.count * averageMinutesPerCorrection()));
    state.tasks.push({ id: crypto.randomUUID(), title: `${client.shortName} ${category.title}`, ...order, isCompleted: false, createdAt: new Date().toISOString(), clientID: client.id, estimatedMinutes });
    recordAudit("import", "Auftrag aus E-Mail erkannt", `${order.count} × ${category.title} · fällig ${order.dueDateKey}`, client.id);
    fingerprints.add(fingerprint);
    imported += 1;
  }
  if (!imported) return showToast("Diese Auftragspositionen sind bereits vorgemerkt.");
  saveState();
  document.querySelector("#email-import-text").value = "";
  renderTasks();
  renderWorkday();
  showToast(`${imported} Auftragspositionen erkannt`);
}

async function importAttachments(event) {
  const files = [...event.target.files];
  for (const file of files) {
    if (file.size > 1_500_000) { showToast(`${file.name} ist größer als 1,5 MB.`); continue; }
    const dataURL = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    state.extensions.attachments.push({ id: crypto.randomUUID(), dateKey: state.selectedDate, name: file.name.slice(0, 120), type: file.type || "application/octet-stream", dataURL, createdAt: new Date().toISOString() });
  }
  state.extensions.attachments = state.extensions.attachments.slice(-30);
  saveState(); event.target.value = ""; renderAttachments();
}

function renderAttachments() {
  const list = document.querySelector("#day-attachments");
  if (!list) return;
  const attachments = state.extensions.attachments.filter(item => item.dateKey === state.selectedDate);
  list.innerHTML = attachments.length ? "" : "<p class=\"share-hint\">Noch keine Belege für diesen Tag.</p>";
  for (const attachment of attachments) {
    const row = document.createElement("div");
    row.className = "attachment-row";
    row.innerHTML = `<a href="${attachment.dataURL}" download="${escapeHTML(attachment.name)}"><span aria-hidden="true">${attachment.type.startsWith("image/") ? "🖼️" : "📄"}</span><strong>${escapeHTML(attachment.name)}</strong></a><button aria-label="Anhang löschen">×</button>`;
    row.querySelector("button").addEventListener("click", () => { state.extensions.attachments = state.extensions.attachments.filter(item => item.id !== attachment.id); saveState(); renderAttachments(); });
    list.append(row);
  }
}

function filterHistory() {
  const term = (document.querySelector("#history-search")?.value || "").trim().toLowerCase();
  const categoryID = document.querySelector("#history-category-filter")?.value || "";
  const year = document.querySelector("#history-year-filter")?.value || "";
  const category = categories.find(item => item.id === categoryID);
  document.querySelectorAll("#history-list .history-item").forEach(item => {
    const text = item.textContent.toLowerCase();
    const dateText = item.querySelector("h3")?.textContent || "";
    const matches = (!term || text.includes(term)) && (!category || text.includes(category.title.toLowerCase())) && (!year || dateText.includes(year));
    item.hidden = !matches;
  });
}

function renderYearSummary() {
  const select = document.querySelector("#history-year-filter");
  const year = select?.value || String(new Date().getFullYear());
  const keys = Object.keys(state.entries).filter(key => key.startsWith(`${year}-`));
  const total = keys.reduce((sum, key) => { const value = totalsFor(key); sum.count += value.count; sum.cents += value.cents; return sum; }, { count: 0, cents: 0 });
  document.querySelector("#year-summary-label").textContent = year;
  document.querySelector("#year-earnings").textContent = euroFormatter.format(total.cents / 100);
  document.querySelector("#year-count").textContent = String(total.count);
  const values = Array.from({ length: 12 }, (_, index) => totalsForMonth(new Date(Number(year), index, 1, 12)).cents);
  const max = Math.max(1, ...values);
  document.querySelector("#year-month-bars").innerHTML = values.map((value, index) => `<i style="height:${Math.max(4, value / max * 100)}%" title="${index + 1}/${year}: ${euroFormatter.format(value / 100)}"></i>`).join("");
}

function invoiceDueDate(record) {
  const created = new Date(record.sentAt || record.createdAt);
  created.setDate(created.getDate() + Number(state.invoiceProfile.paymentDueDays || 14));
  return created;
}

function renderPaymentReminders() {
  const container = document.querySelector("#payment-reminders");
  if (!container) return;
  const open = state.invoices.filter(item => item.status !== "paid");
  container.innerHTML = open.length ? "" : "<p class=\"share-hint\">Alle archivierten Honorarnoten sind bezahlt.</p>";
  for (const record of open.slice(0, 12)) {
    const due = invoiceDueDate(record);
    const overdue = due < new Date() && record.status === "sent";
    const row = document.createElement("div");
    row.className = `payment-row${overdue ? " overdue" : ""}`;
    const subject = `Zahlungserinnerung Honorarnote ${record.number}`;
    row.innerHTML = `<div><strong>${record.monthKey} · Nr. ${escapeHTML(record.number)}</strong><span>${overdue ? "Überfällig seit" : "Zahlungsziel"} ${due.toLocaleDateString("de-AT")} · ${euroFormatter.format(record.totalCents / 100)}</span></div><div><a class="secondary-button compact-button" href="mailto:${encodeURIComponent(state.invoiceProfile.email)}?subject=${encodeURIComponent(subject)}">Erinnern</a><button class="primary-button compact-button">Bezahlt</button></div>`;
    row.querySelector("button").addEventListener("click", () => updateInvoiceStatus(record, "paid"));
    container.append(row);
  }
}

async function toggleDeadlineNotifications(event) {
  if (event.target.checked && "Notification" in window) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { event.target.checked = false; showToast("Mitteilungen wurden nicht erlaubt."); }
  }
  state.extensions.deadlineNotifications = event.target.checked;
  saveState();
  if (event.target.checked) checkDeadlineNotifications();
}

async function checkDeadlineNotifications() {
  if (!state.extensions.deadlineNotifications || Notification.permission !== "granted") return;
  const today = dayKey(new Date());
  const urgent = state.tasks.filter(task => !task.isCompleted && task.dueDateKey <= today);
  if (!urgent.length || sessionStorage.getItem("fdn-osd-notified-day") === today) return;
  const registration = await navigator.serviceWorker?.ready;
  const options = { body: `${urgent.length} offene ÖSD-Aufträge sind heute fällig oder überfällig.`, icon: "icons/icon-192.png", tag: `fdn-deadlines-${today}` };
  if (registration) registration.showNotification("FDN ÖSD · Fristen", options); else new Notification("FDN ÖSD · Fristen", options);
  sessionStorage.setItem("fdn-osd-notified-day", today);
}

function setEncryptionPassphrase() {
  const value = prompt("Neues Verschlüsselungskennwort (mindestens 8 Zeichen). Gut merken – ohne dieses Kennwort können Cloud-Daten nicht geöffnet werden:") || "";
  if (value.length < 8) return showToast("Das Kennwort muss mindestens 8 Zeichen lang sein.");
  cloudPassphrase = value;
  sessionStorage.setItem("fdn-osd-e2e-passphrase", value);
  advancedPrivate.encryptionEnabled = true;
  saveAdvancedPrivate(); renderAdvancedSettings();
  showToast("Ende-zu-Ende-Verschlüsselung ist bereit");
}

function base64URL(bytes) { return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

async function toggleWebAuthn() {
  if (!window.PublicKeyCredential) return showToast("Geräteschutz wird von diesem Browser nicht unterstützt.");
  try {
    if (!advancedPrivate.webAuthnEnabled) {
      const credential = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "FDN ÖSD" }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "fdn-osd-local", displayName: "FDN ÖSD" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, timeout: 60_000 } });
      advancedPrivate.webAuthnCredentialID = base64URL(new Uint8Array(credential.rawId));
      advancedPrivate.webAuthnEnabled = true;
      showToast("Geräteschutz aktiviert");
    } else {
      advancedPrivate.webAuthnEnabled = false;
      advancedPrivate.webAuthnCredentialID = "";
      showToast("Geräteschutz deaktiviert");
    }
    saveAdvancedPrivate(); renderAdvancedSettings();
  } catch { showToast("Geräteschutz konnte nicht eingerichtet werden."); }
}

async function unlockWithWebAuthn() {
  if (!advancedPrivate.webAuthnEnabled || !advancedPrivate.webAuthnCredentialID) return true;
  const overlay = document.querySelector("#app-lock") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "app-lock", className: "app-lock", innerHTML: `<div><img src="icons/icon-192.png" alt=""><h2>FDN ÖSD ist geschützt</h2><p>Mit Face ID, Touch ID oder Gerätecode entsperren.</p><button class="primary-button">Entsperren</button></div>` }));
  overlay.hidden = false;
  const unlock = async () => {
    try {
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: base64ToBytes(advancedPrivate.webAuthnCredentialID.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(advancedPrivate.webAuthnCredentialID.length / 4) * 4, "=")) }], userVerification: "required", timeout: 60_000 } });
      overlay.hidden = true;
    } catch { showToast("Entsperren wurde abgebrochen."); }
  };
  overlay.querySelector("button").onclick = unlock;
  await unlock();
}

function saveMailSettings() {
  advancedPrivate.mailEndpoint = document.querySelector("#mail-webhook").value.trim().replace(/\/$/, "").slice(0, 600);
  advancedPrivate.mailToken = document.querySelector("#mail-token").value.trim().slice(0, 1000);
  saveAdvancedPrivate();
}

function monthReportPayload(month) {
  const previousInvoiceMonth = invoiceMonth;
  invoiceMonth = new Date(month);
  const html = buildWordDocument();
  const csv = buildExcelCSV();
  const totals = totalsForMonth(month);
  invoiceMonth = previousInvoiceMonth;
  const suffix = monthKey(month);
  return { to: state.invoiceProfile.email, subject: `FDN ÖSD Honorarnote ${suffix}`, month: suffix, totalCents: totals.cents, files: [{ name: `Honorarnote-${suffix}.html`, mimeType: "text/html", base64: btoa(unescape(encodeURIComponent(html))) }, { name: `Honorarnote-${suffix}.csv`, mimeType: "text/csv", base64: btoa(unescape(encodeURIComponent(csv))) }], createPDF: true };
}

async function sendMonthlyInvoice(month, quiet = false) {
  saveMailSettings();
  if (!advancedPrivate.mailEndpoint || !state.invoiceProfile.email) { if (!quiet) showToast("E-Mail-Adresse und sicherer Webhook fehlen."); return false; }
  try {
    const response = await fetch(advancedPrivate.mailEndpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(advancedPrivate.mailToken ? { Authorization: `Bearer ${advancedPrivate.mailToken}` } : {}) }, body: JSON.stringify(monthReportPayload(month)) });
    if (!response.ok) throw new Error(String(response.status));
    const record = archiveInvoice(month, true);
    if (record) updateInvoiceStatus(record, "sent");
    state.extensions.lastEmailedMonth = monthKey(month); saveState();
    if (!quiet) showToast("Honorarnote sicher an den E-Mail-Dienst übergeben");
    return true;
  } catch { if (!quiet) showToast("Versand fehlgeschlagen. Webhook und Token prüfen."); return false; }
}

async function testMailService() {
  saveMailSettings();
  if (!advancedPrivate.mailEndpoint) return showToast("Bitte zuerst eine HTTPS-Adresse eintragen.");
  try {
    const response = await fetch(advancedPrivate.mailEndpoint, { method: "OPTIONS", headers: advancedPrivate.mailToken ? { Authorization: `Bearer ${advancedPrivate.mailToken}` } : {} });
    showToast(response.ok || response.status === 204 ? "E-Mail-Dienst ist erreichbar" : `Dienst antwortet mit Status ${response.status}`);
  } catch { showToast("E-Mail-Dienst ist nicht erreichbar oder blockiert CORS."); }
}

function checkAutomaticMonthEmail() {
  if (!state.extensions.autoEmail || !state.extensions.autoMonthClose) return;
  const previous = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1, 12);
  if (state.extensions.lastEmailedMonth !== monthKey(previous) && totalsForMonth(previous).count > 0) sendMonthlyInvoice(previous, true);
}

function applyPersonalization() {
  document.documentElement.dataset.accent = state.extensions.accent;
  document.documentElement.dataset.fontScale = state.extensions.fontScale;
  document.body.classList.toggle("compact-home", state.extensions.compactHome);
}

function renderUndoControls() {
  const undo = document.querySelector("#undo-change");
  const redo = document.querySelector("#redo-change");
  if (undo) undo.disabled = undoStack.length === 0;
  if (redo) redo.disabled = redoStack.length === 0;
}

function renderAdvancedSettings() {
  const extension = state.extensions;
  const setChecked = (selector, value) => { const node = document.querySelector(selector); if (node) node.checked = Boolean(value); };
  setChecked("#auto-month-close", extension.autoMonthClose);
  setChecked("#deadline-notifications", extension.deadlineNotifications);
  setChecked("#e2e-encryption", advancedPrivate.encryptionEnabled);
  setChecked("#auto-invoice-email", extension.autoEmail);
  setChecked("#compact-home", extension.compactHome);
  document.querySelector("#mail-webhook").value = advancedPrivate.mailEndpoint || "";
  document.querySelector("#mail-token").value = advancedPrivate.mailToken || "";
  document.querySelector("#accent-select").value = extension.accent;
  document.querySelector("#font-scale-select").value = extension.fontScale;
  document.querySelector("#webauthn-toggle").textContent = advancedPrivate.webAuthnEnabled ? "Geräteschutz deaktivieren" : "Geräteschutz aktivieren";
  renderUndoControls();
}

function renderAdvanced() {
  renderAttachments();
  renderYearSummary();
  renderPaymentReminders();
  renderAdvancedSettings();
  applyPersonalization();
  filterHistory();
}

const baseRenderAll = renderAll;
renderAll = function advancedRenderAll() { baseRenderAll(); renderAdvanced(); };
const baseRenderWorkday = renderWorkday;
renderWorkday = function advancedRenderWorkday() { baseRenderWorkday(); renderAttachments(); };
const baseRenderInvoiceArchive = renderInvoiceArchive;
renderInvoiceArchive = function advancedRenderInvoiceArchive() { baseRenderInvoiceArchive(); renderPaymentReminders(); };

function monitorUpdates() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const status = document.querySelector("#version-status");
    if (status) status.innerHTML = `Eine neue sichere Version ist bereit. <button class="text-button" onclick="location.reload()">Jetzt aktualisieren</button>`;
  });
}

injectAdvancedUI();
renderAdvanced();
checkDeadlineNotifications();
checkAutomaticMonthEmail();
monitorUpdates();
window.setInterval(checkDeadlineNotifications, 15 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") unlockWithWebAuthn(); });
