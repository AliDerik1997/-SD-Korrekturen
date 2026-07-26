"use strict";

// FDN ÖSD Version 12 – Planung, Auftraggeber, OCR-Hilfe, Finanzprognose und einfacher Login.
const v12RestoreKey = "fdn-osd-restore-points-v12";
let onboardingPage = 0;

function v12Markup() {
  return `
    <section class="card v12-cockpit" id="v12-cockpit">
      <div class="card-heading"><div><h3>Arbeitscockpit</h3><p>Tagesziel, Planung, Prognose und Rücklage auf einen Blick.</p></div><span class="version-badge">V12</span></div>
      <label class="v12-client-select"><span>Auftraggeber für diesen Tag</span><select id="v12-day-client"></select></label>
      <div class="v12-target"><div><strong>Tagesziel</strong><span id="v12-target-label">0 / 20</span></div><progress id="v12-target-progress" max="100" value="0"></progress></div>
      <div class="v12-metrics">
        <div><span>Monatsprognose</span><strong id="v12-forecast">0,00 €</strong></div>
        <div><span>Steuer-Rücklage</span><strong id="v12-reserve">0,00 €</strong></div>
        <div><span>Voraussichtlich verfügbar</span><strong id="v12-available">0,00 €</strong></div>
        <div><span>Offene Arbeitszeit</span><strong id="v12-open-time">0 Min.</strong></div>
      </div>
      <p class="v12-quality" id="v12-quality"></p>
    </section>`;
}

function v12SettingsMarkup() {
  return `
    <section class="card v12-settings" id="v12-settings">
      <div class="card-heading"><div><h3>Version-12-Zentrale</h3><p>Finanzplanung, Auftraggeber, Datenprüfung und Wiederherstellung.</p></div><span class="version-badge">12</span></div>
      <div class="v12-setting-grid">
        <label><span>Steuer-Rücklage (%)</span><input id="v12-tax-percent" type="number" min="0" max="60" inputmode="numeric"></label>
        <label><span>Tagesziel (Aufträge)</span><input id="v12-daily-target" type="number" min="1" max="999" inputmode="numeric"></label>
      </div>
      <div class="card-heading compact-heading"><div><h3>Auftraggeber</h3><p>Eigene Kontaktdaten, Präfixe und Honorarsätze.</p></div><button class="secondary-button compact-button" id="v12-add-client">Hinzufügen</button></div>
      <div id="v12-client-list" class="v12-client-list"></div>
      <hr>
      <div class="sync-health" id="v12-sync-health"></div>
      <div class="button-row"><button class="secondary-button" id="v12-repair-data">Daten prüfen & reparieren</button><button class="secondary-button" id="v12-restore-last">Letzten Prüfpunkt laden</button></div>
      <button class="text-button" id="v12-show-onboarding">Einführung erneut zeigen</button>
    </section>`;
}

function v12ScannerMarkup() {
  return `
    <div class="v12-scanner" id="v12-scanner">
      <label class="primary-button file-button" for="v12-scan-image">Foto/Screenshot auf Aufträge prüfen</label>
      <input id="v12-scan-image" type="file" accept="image/*" capture="environment" hidden>
      <p class="share-hint">Wenn dein Browser Texterkennung unterstützt, wird der erkannte Text direkt übernommen. Auf dem iPhone steht zusätzlich Apples „Live Text“ zur Verfügung.</p>
      <img id="v12-scan-preview" alt="Vorschau des ausgewählten Dokuments" hidden>
    </div>`;
}

function v12LoginMarkup() {
  return `
    <div class="v12-email-login" id="v12-email-login">
      <label><span>E-Mail-Adresse</span><input id="v12-login-email" type="email" autocomplete="email" placeholder="name@beispiel.at"></label>
      <div class="button-row"><button class="primary-button" id="v12-send-code">E-Mail-Code senden</button><button class="secondary-button" id="v12-guest-mode">Ohne Konto weiter</button></div>
      <div id="v12-code-row" hidden><label><span>6-stelliger Code</span><input id="v12-login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></label><button class="primary-button" id="v12-verify-code">Mit Code anmelden</button></div>
      <p class="share-hint">Einfachste Anmeldung: kein Passwort, nur der Code aus deiner E-Mail.</p>
    </div>`;
}

function v12OnboardingMarkup() {
  return `
    <dialog class="v12-onboarding" id="v12-onboarding">
      <div class="v12-onboarding-icon" id="v12-onboarding-icon">📷</div>
      <p class="eyebrow">FDN ÖSD Version 15</p>
      <h2 id="v12-onboarding-title"></h2>
      <p id="v12-onboarding-text"></p>
      <div class="v12-onboarding-dots" id="v12-onboarding-dots"></div>
      <div class="button-row"><button class="text-button" id="v12-onboarding-skip">Überspringen</button><button class="primary-button" id="v12-onboarding-next">Weiter</button></div>
    </dialog>`;
}

function injectV12UI() {
  const summary = document.querySelector("#page-today .summary-card");
  if (summary && !document.querySelector("#v12-cockpit")) summary.insertAdjacentHTML("afterend", v12Markup());
  const capture = document.querySelector("#advanced-capture-card .card-heading");
  if (capture && !document.querySelector("#v12-scanner")) capture.insertAdjacentHTML("afterend", v12ScannerMarkup());
  const advancedSettings = document.querySelector("#advanced-settings-card");
  if (advancedSettings && !document.querySelector("#v12-settings")) advancedSettings.insertAdjacentHTML("beforebegin", v12SettingsMarkup());
  const signedOut = document.querySelector("#account-signed-out");
  if (signedOut && !document.querySelector("#v12-email-login")) signedOut.insertAdjacentHTML("afterbegin", v12LoginMarkup());
  const invoicePicker = document.querySelector(".invoice-month-picker");
  if (invoicePicker && !document.querySelector("#v12-invoice-client")) {
    invoicePicker.insertAdjacentHTML("afterend", `<label class="v12-invoice-filter"><span>Abrechnung für</span><select id="v12-invoice-client"></select></label>`);
  }
  if (!document.querySelector("#v12-onboarding")) document.body.insertAdjacentHTML("beforeend", v12OnboardingMarkup());
  bindV12Events();
}

function allClients() {
  return state.extensions.clients || defaultExtensions().clients;
}

function averageMinutesPerCorrection() {
  const totalCount = Object.keys(state.entries).reduce((sum, key) => sum + totalsFor(key).count, 0);
  const totalSeconds = totalWorkedSeconds();
  return totalCount > 0 && totalSeconds > 0 ? totalSeconds / 60 / totalCount : 6;
}

function predictedMonthCents(date = new Date()) {
  const total = totalsForMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12)).cents;
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
  return Math.round(total / Math.max(1, date.getDate()) * days);
}

function v12DataIssues() {
  const issues = [];
  for (const [date, counts] of Object.entries(state.entries)) {
    const count = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (count > 250) issues.push(`Ungewöhnlich hohe Anzahl am ${numericDate(date)}: ${count}`);
    if (!state.extensions.entryClients[date]) issues.push(`Auftraggeber am ${numericDate(date)} noch nicht bestätigt`);
    for (const category of categories) {
      if ((counts[category.id] || 0) > 0 && state.entryRates?.[date]?.[category.id] === undefined) issues.push(`Historischer Preis fehlt: ${numericDate(date)} · ${category.title}`);
    }
  }
  const today = dayKey(new Date());
  const overdue = state.tasks.find(task => !task.isCompleted && task.dueDateKey < today);
  if (overdue) issues.push(`Überfälliger Auftrag: ${overdue.title}`);
  return issues.slice(0, 8);
}

function renderV12Cockpit() {
  const select = document.querySelector("#v12-day-client");
  if (!select) return;
  const clients = allClients();
  select.innerHTML = clients.map(client => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.shortName)}</option>`).join("");
  select.value = state.extensions.entryClients[state.selectedDate] || "osd";
  const todayTotal = totalsFor(state.selectedDate).count;
  const target = state.extensions.dailyTargetCount;
  document.querySelector("#v12-target-label").textContent = `${todayTotal} / ${target}`;
  document.querySelector("#v12-target-progress").value = Math.min(100, todayTotal / Math.max(1, target) * 100);
  const selectedMonth = dateFromKey(state.selectedDate);
  const monthTotal = totalsForMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1, 12)).cents;
  const forecast = selectedMonth.getFullYear() === new Date().getFullYear() && selectedMonth.getMonth() === new Date().getMonth() ? predictedMonthCents() : monthTotal;
  const reserve = Math.round(monthTotal * state.extensions.taxReservePercent / 100);
  document.querySelector("#v12-forecast").textContent = euroFormatter.format(forecast / 100);
  document.querySelector("#v12-reserve").textContent = euroFormatter.format(reserve / 100);
  document.querySelector("#v12-available").textContent = euroFormatter.format(Math.max(0, monthTotal - reserve) / 100);
  const openMinutes = state.tasks.filter(task => !task.isCompleted).reduce((sum, task) => sum + (task.estimatedMinutes || Math.round(task.count * averageMinutesPerCorrection())), 0);
  document.querySelector("#v12-open-time").textContent = formatDuration(openMinutes * 60);
  const issues = v12DataIssues();
  const quality = document.querySelector("#v12-quality");
  quality.textContent = issues[0] || "✓ Datenprüfung ohne Auffälligkeiten";
  quality.classList.toggle("has-issue", Boolean(issues.length));
}

function renderV12Settings() {
  if (!document.querySelector("#v12-settings")) return;
  document.querySelector("#v12-tax-percent").value = String(state.extensions.taxReservePercent);
  document.querySelector("#v12-daily-target").value = String(state.extensions.dailyTargetCount);
  const list = document.querySelector("#v12-client-list");
  list.innerHTML = allClients().map(client => `
    <div class="v12-client-row" data-client="${escapeHTML(client.id)}">
      <div><strong>${escapeHTML(client.name)}</strong><span>${escapeHTML(client.invoicePrefix)} · ${Object.keys(client.rateOverrides || {}).length} eigene Preise</span></div>
      <div><button class="text-button edit-client">Bearbeiten</button>${client.id === "osd" ? "" : `<button class="text-button delete-client">Löschen</button>`}</div>
    </div>`).join("");
  list.querySelectorAll(".edit-client").forEach(button => button.addEventListener("click", () => editV12Client(button.closest(".v12-client-row").dataset.client)));
  list.querySelectorAll(".delete-client").forEach(button => button.addEventListener("click", () => deleteV12Client(button.closest(".v12-client-row").dataset.client)));
  const restorePoints = loadV12RestorePoints();
  const issues = v12DataIssues();
  document.querySelector("#v12-sync-health").innerHTML = `
    <div><span>Lokaler Speicher</span><strong>✓ Aktiv</strong></div>
    <div><span>Cloud-Konto</span><strong>${account.user?.id ? "✓ Angemeldet" : "Optional"}</strong></div>
    <div><span>Letzter Abgleich</span><strong>${account.lastSync ? new Date(account.lastSync).toLocaleString("de-AT") : "Noch keiner"}</strong></div>
    <div><span>Datenprüfung</span><strong class="${issues.length ? "warning" : ""}">${issues.length ? `${issues.length} Hinweis(e)` : "✓ In Ordnung"}</strong></div>
    <div><span>Lokale Prüfpunkte</span><strong>${restorePoints.length}</strong></div>`;
  document.querySelector("#v12-restore-last").disabled = restorePoints.length === 0;
  renderV12InvoiceFilter();
}

function renderV12InvoiceFilter() {
  const select = document.querySelector("#v12-invoice-client");
  if (!select) return;
  select.innerHTML = `<option value="all">Alle Auftraggeber</option>${allClients().map(client => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.shortName)}</option>`).join("")}`;
  select.value = invoiceClientFilter;
}

function editV12Client(clientID) {
  const existing = allClients().find(item => item.id === clientID);
  const id = existing?.id || crypto.randomUUID();
  const name = prompt("Name des Auftraggebers:", existing?.name || "")?.trim();
  if (!name) return;
  const shortName = (prompt("Kurzname:", existing?.shortName || name.slice(0, 12)) || name).trim().slice(0, 24);
  const email = (prompt("E-Mail für Abrechnungen:", existing?.email || "") || "").trim().slice(0, 200);
  const address = (prompt("Adresse:", existing?.address || "") || "").trim().slice(0, 300);
  const invoicePrefix = (prompt("Rechnungspräfix:", existing?.invoicePrefix || "HN") || "HN").trim().slice(0, 12);
  const rateOverrides = { ...(existing?.rateOverrides || {}) };
  if (confirm("Eigene Honorarsätze für diesen Auftraggeber bearbeiten?")) {
    for (const category of categories) {
      const current = (rateOverrides[category.id] ?? rateFor(category.id)) / 100;
      const value = prompt(`${category.title} in EUR:`, current.toFixed(2).replace(".", ","));
      if (value === null) continue;
      const amount = Number(value.replace(",", "."));
      if (Number.isFinite(amount) && amount >= 0) rateOverrides[category.id] = Math.round(amount * 100);
    }
  }
  const next = { id, name: name.slice(0, 120), shortName, email, address, invoicePrefix, rateOverrides };
  const index = state.extensions.clients.findIndex(item => item.id === id);
  if (index >= 0) state.extensions.clients[index] = next; else state.extensions.clients.push(next);
  saveState(); renderV12(); showToast("Auftraggeber gespeichert");
}

function deleteV12Client(clientID) {
  if (clientID === "osd") return;
  const inUse = Object.values(state.extensions.entryClients).includes(clientID)
    || state.tasks.some(item => item.clientID === clientID)
    || state.invoices.some(item => item.clientID === clientID);
  if (inUse) return showToast("Dieser Auftraggeber wird bereits verwendet und bleibt zum Schutz alter Abrechnungen erhalten.");
  if (!confirm("Diesen noch unbenutzten Auftraggeber löschen?")) return;
  state.extensions.clients = state.extensions.clients.filter(item => item.id !== clientID);
  if (invoiceClientFilter === clientID) invoiceClientFilter = "all";
  saveState(); renderV12();
}

async function requestV12EmailCode() {
  const email = document.querySelector("#v12-login-email").value.trim().toLowerCase();
  if (!validAccountConfiguration()) { document.querySelector(".account-setup").open = true; return showToast("Bitte zuerst die einmalige Cloud-Einrichtung ausfüllen."); }
  if (!email.includes("@")) return showToast("Bitte eine gültige E-Mail-Adresse eingeben.");
  try {
    const response = await fetch(accountEndpoint("/auth/v1/otp"), { method: "POST", headers: { apikey: account.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, create_user: true, options: { shouldCreateUser: true } }) });
    if (!response.ok) throw new Error(String(response.status));
    document.querySelector("#v12-code-row").hidden = false;
    showToast("Anmeldecode wurde per E-Mail gesendet");
  } catch { showToast("Code konnte nicht gesendet werden. Cloud-Einrichtung prüfen."); }
}

async function verifyV12EmailCode() {
  const email = document.querySelector("#v12-login-email").value.trim().toLowerCase();
  const token = document.querySelector("#v12-login-code").value.trim();
  if (token.length < 6) return showToast("Bitte den vollständigen Code eingeben.");
  try {
    const response = await fetch(accountEndpoint("/auth/v1/verify"), { method: "POST", headers: { apikey: account.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", email, token }) });
    if (!response.ok) throw new Error(String(response.status));
    applyAccountSession(await response.json(), "email");
    await loadAccountUser();
    await initialAccountSync();
    renderAccountSettings(); renderV12Settings();
    showToast("Sicher mit E-Mail-Code angemeldet");
  } catch { showToast("Der Code ist ungültig oder abgelaufen."); }
}

async function scanV12Image(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const preview = document.querySelector("#v12-scan-preview");
  preview.src = URL.createObjectURL(file); preview.hidden = false;
  try {
    if (!("TextDetector" in window)) {
      document.querySelector("#advanced-capture-card details").open = true;
      showToast("Browser-OCR nicht verfügbar: Nutze auf dem Foto „Text kopieren“ und füge ihn in das Textfeld ein.");
      return;
    }
    const bitmap = await createImageBitmap(file);
    const blocks = await new TextDetector().detect(bitmap);
    const text = blocks.map(block => block.rawValue).filter(Boolean).join("\n");
    if (!text) return showToast("Kein lesbarer Text erkannt.");
    document.querySelector("#email-import-text").value = text;
    document.querySelector("#advanced-capture-card details").open = true;
    showToast("Text erkannt – bitte prüfen und übernehmen");
  } catch { showToast("Foto konnte nicht automatisch gelesen werden."); }
}

function repairV12Data() {
  for (const [date, counts] of Object.entries(state.entries)) {
    if (!state.extensions.entryClients[date]) state.extensions.entryClients[date] = "osd";
    if (!state.entryRates[date]) state.entryRates[date] = {};
    for (const category of categories) {
      if ((counts[category.id] || 0) > 0 && state.entryRates[date][category.id] === undefined) state.entryRates[date][category.id] = rateForNewEntry(date, category.id);
    }
  }
  saveState(); renderAll(); showToast("Daten geprüft und fehlende Zuordnungen ergänzt");
}

function loadV12RestorePoints() {
  try { const value = JSON.parse(localStorage.getItem(v12RestoreKey)); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

function createV12RestorePoint() {
  try {
    const points = loadV12RestorePoints();
    const last = points.at(-1);
    if (last && Date.now() - new Date(last.createdAt).getTime() < 15 * 60 * 1000) return;
    const backup = portableBackup();
    if (backup.extensions) backup.extensions = { ...backup.extensions, attachments: [] };
    points.push({ createdAt: new Date().toISOString(), backup });
    localStorage.setItem(v12RestoreKey, JSON.stringify(points.slice(-3)));
    state.extensions.lastLocalRestorePoint = new Date().toISOString();
  } catch { /* Hauptdaten bleiben auch bei vollem Browser-Speicher erhalten. */ }
}

function restoreLastV12Point() {
  const point = loadV12RestorePoints().at(-1);
  if (!point || !confirm(`Stand vom ${new Date(point.createdAt).toLocaleString("de-AT")} wiederherstellen?`)) return;
  applyImportedBackup(point.backup, true);
  showToast("Lokaler Prüfpunkt wiederhergestellt");
}

const onboardingPages = [
  ["📷", "Aufträge schneller erfassen", "Scanne Fotos, übernimm E-Mail-Text oder nutze die Schnelleingabe."],
  ["📅", "Arbeit und Fristen planen", "Das Cockpit berechnet offene Arbeitszeit und zeigt dein Tagesziel."],
  ["📈", "Verdienst vorausplanen", "Prognose, Steuer-Rücklage und verfügbarer Betrag entstehen automatisch."],
  ["🔐", "Daten geschützt behalten", "Cloud-Status, Prüfpunkte und Geräteschutz helfen beim sicheren Gerätewechsel."]
];

function showV12Onboarding(reset = false) {
  if (state.extensions.onboardingCompleted && !reset) return;
  onboardingPage = 0; renderV12Onboarding(); document.querySelector("#v12-onboarding").showModal();
}

function renderV12Onboarding() {
  const page = onboardingPages[onboardingPage];
  document.querySelector("#v12-onboarding-icon").textContent = page[0];
  document.querySelector("#v12-onboarding-title").textContent = page[1];
  document.querySelector("#v12-onboarding-text").textContent = page[2];
  document.querySelector("#v12-onboarding-dots").innerHTML = onboardingPages.map((_, index) => `<i class="${index === onboardingPage ? "active" : ""}"></i>`).join("");
  document.querySelector("#v12-onboarding-next").textContent = onboardingPage === onboardingPages.length - 1 ? "Loslegen" : "Weiter";
}

function finishV12Onboarding() {
  state.extensions.onboardingCompleted = true; saveState(); document.querySelector("#v12-onboarding").close();
}

function bindV12Events() {
  document.querySelector("#v12-day-client")?.addEventListener("change", event => { state.extensions.entryClients[state.selectedDate] = event.target.value; saveState(); renderWorkday(); renderV12Cockpit(); });
  document.querySelector("#v12-tax-percent")?.addEventListener("change", event => { state.extensions.taxReservePercent = Math.max(0, Math.min(60, Math.round(Number(event.target.value) || 0))); saveState(); renderV12(); });
  document.querySelector("#v12-daily-target")?.addEventListener("change", event => { state.extensions.dailyTargetCount = Math.max(1, Math.min(999, Math.round(Number(event.target.value) || 20))); saveState(); renderV12(); });
  document.querySelector("#v12-add-client")?.addEventListener("click", () => editV12Client(null));
  document.querySelector("#v12-repair-data")?.addEventListener("click", repairV12Data);
  document.querySelector("#v12-restore-last")?.addEventListener("click", restoreLastV12Point);
  document.querySelector("#v12-show-onboarding")?.addEventListener("click", () => showV12Onboarding(true));
  document.querySelector("#v12-send-code")?.addEventListener("click", requestV12EmailCode);
  document.querySelector("#v12-verify-code")?.addEventListener("click", verifyV12EmailCode);
  document.querySelector("#v12-guest-mode")?.addEventListener("click", () => showToast("Gastmodus aktiv – deine Daten bleiben lokal auf diesem Gerät."));
  document.querySelector("#v12-scan-image")?.addEventListener("change", scanV12Image);
  document.querySelector("#v12-invoice-client")?.addEventListener("change", event => { invoiceClientFilter = event.target.value; renderInvoice(); renderV12Cockpit(); });
  document.querySelector("#v12-onboarding-next")?.addEventListener("click", () => { if (onboardingPage < onboardingPages.length - 1) { onboardingPage += 1; renderV12Onboarding(); } else finishV12Onboarding(); });
  document.querySelector("#v12-onboarding-skip")?.addEventListener("click", finishV12Onboarding);
}

function renderV12() {
  renderV12Cockpit();
  renderV12Settings();
}

const v12BaseSaveState = saveState;
saveState = function version12SaveState(touch = true) {
  v12BaseSaveState(touch);
  if (touch) createV12RestorePoint();
};

const v12BaseRenderAll = renderAll;
renderAll = function version12RenderAll() { v12BaseRenderAll(); renderV12(); };

const v12BaseRenderWorkday = renderWorkday;
renderWorkday = function version12RenderWorkday() { v12BaseRenderWorkday(); renderV12Cockpit(); };

const v12BaseProviderTitle = accountProviderTitle;
accountProviderTitle = function version12ProviderTitle(provider) { return provider === "email" ? "E-Mail-Code" : v12BaseProviderTitle(provider); };

injectV12UI();
createV12RestorePoint();
renderV12();
window.setTimeout(() => showV12Onboarding(false), 350);
