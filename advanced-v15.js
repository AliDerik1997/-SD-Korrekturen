"use strict";

// FDN ÖSD Version 15 – Finanzzentrale, Rechnungsampel, Audit-Protokoll und Einrichtungsdiagnose.
function v15DashboardMarkup() {
  return `
    <section class="card v15-dashboard" id="v15-dashboard">
      <div class="card-heading"><div><h3>Finanzzentrale</h3><p>Jahresumsatz, Zahlungen und Rücklage auf einen Blick.</p></div><span class="version-badge v15-badge">V15</span></div>
      <div class="v15-metrics">
        <div><span>↗ Umsatz <b id="v15-year"></b></span><strong id="v15-earned">0,00 €</strong></div>
        <div><span>✓ Bezahlt</span><strong id="v15-paid">0,00 €</strong></div>
        <div><span>◷ Versendet & offen</span><strong id="v15-open">0,00 €</strong></div>
        <div><span>€ Nach Rücklage</span><strong id="v15-available">0,00 €</strong></div>
      </div>
      <p class="v15-readiness" id="v15-readiness"></p>
    </section>`;
}

function v15SettingsMarkup() {
  return `
    <section class="card v15-settings" id="v15-settings">
      <div class="card-heading"><div><h3>Version-15-Kontrollzentrum</h3><p>Rechnungen, Automatisierung und Änderungen nachvollziehen.</p></div><span class="version-badge v15-badge">15</span></div>
      <h4>Automatisierungsdiagnose</h4><div class="v15-setup-list" id="v15-setup-list"></div>
      <h4>Letzte Änderungen</h4><div class="v15-audit-list" id="v15-audit-list"></div>
      <p class="share-hint">TestFlight und App Store benötigen zusätzlich ein Apple-Developer-Konto. Cloud und Mail werden nach Eintragung deiner eigenen Zugangsdaten aktiv.</p>
    </section>`;
}

function v15InvoiceMarkup() {
  return `
    <section class="card v15-invoice-check" id="v15-invoice-check">
      <div class="card-heading"><div><h3>Rechnungsampel</h3><p>Pflichtangaben werden vor jedem Export geprüft.</p></div><span id="v15-invoice-status" class="v15-status-pill"></span></div>
      <div class="v15-issue-list" id="v15-invoice-issues"></div>
    </section>`;
}

function injectV15UI() {
  const dashboard = document.querySelector("#v14-dashboard");
  if (dashboard && !document.querySelector("#v15-dashboard")) dashboard.insertAdjacentHTML("afterend", v15DashboardMarkup());
  const settings = document.querySelector("#v14-settings");
  if (settings && !document.querySelector("#v15-settings")) settings.insertAdjacentHTML("beforebegin", v15SettingsMarkup());
  const actions = document.querySelector(".invoice-actions-card");
  if (actions && !document.querySelector("#v15-invoice-check")) actions.insertAdjacentHTML("beforebegin", v15InvoiceMarkup());
}

function v15ClientProfile() {
  if (invoiceClientFilter === "all") return null;
  return state.extensions.clients.find(client => client.id === invoiceClientFilter) || null;
}

function v15InvoiceIssues() {
  const profile = state.invoiceProfile;
  const client = v15ClientProfile();
  const recipient = client?.name || profile.recipient;
  const address = client?.address || profile.recipientAddress;
  const email = client?.email || profile.email;
  const iban = String(profile.iban || "").replace(/\s/g, "").toUpperCase();
  const issues = [];
  if (!String(profile.senderName || "").trim()) issues.push("Dein Name fehlt");
  if (!String(profile.senderAddress || "").trim()) issues.push("Deine Adresse fehlt");
  if (!String(recipient || "").trim()) issues.push("Empfänger fehlt");
  if (!String(address || "").trim()) issues.push("Empfängeradresse fehlt");
  if (!String(email || "").includes("@")) issues.push("E-Mail-Adresse ist unvollständig");
  if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) issues.push("IBAN ist unvollständig");
  if (!String(profile.number || "").trim()) issues.push("Rechnungsnummer fehlt");
  const rowClientIDs = new Set(rowsForMonth(invoiceMonth).map(row => row.clientID));
  if (invoiceClientFilter === "all" && rowClientIDs.size > 1) issues.unshift("Bitte einen einzelnen Auftraggeber auswählen");
  const current = invoiceRecordFor(invoiceMonth);
  const number = current?.number || (client ? `${client.invoicePrefix || "HN"}-${profile.number || "1"}` : profile.number || "1");
  if (state.invoices.some(item => item.id !== current?.id && item.number === number)) issues.push("Rechnungsnummer ist bereits vergeben");
  return issues;
}

function v15CanExport(showMessage = true) {
  if (!rowsForMonth(invoiceMonth).length) {
    if (showMessage) showToast("Für diesen Monat sind keine Aufträge vorhanden.");
    return false;
  }
  const issues = v15InvoiceIssues();
  if (issues.length) {
    if (showMessage) showToast(`Bitte zuerst korrigieren: ${issues.join(", ")}`);
    renderV15Invoice();
    return false;
  }
  return true;
}

function v15YearStats(year = new Date().getFullYear()) {
  const prefix = `${year}-`;
  const earned = Object.keys(state.entries).filter(date => date.startsWith(prefix)).reduce((sum, date) => sum + totalsFor(date).cents, 0);
  const paid = state.invoices.filter(item => item.monthKey.startsWith(prefix) && item.status === "paid").reduce((sum, item) => sum + item.totalCents, 0);
  const open = state.invoices.filter(item => item.monthKey.startsWith(prefix) && item.status === "sent").reduce((sum, item) => sum + item.totalCents, 0);
  const reserve = Math.round(earned * state.extensions.taxReservePercent / 100);
  return { earned, paid, open, reserve, available: earned - reserve };
}

function v15SetupItems() {
  const cloud = validAccountConfiguration();
  const sync = Boolean(account.user?.id || /^https:\/\//.test(state.sync.url || ""));
  const mail = /^https:\/\//.test(advancedPrivate.mailEndpoint || "") && state.invoiceProfile.email.includes("@");
  const deviceLock = advancedPrivate.webAuthnEnabled === true;
  return [
    ["Cloud-Anmeldung", cloud, cloud ? "Projekt verbunden" : "Projektadresse und App-Schlüssel fehlen"],
    ["Geräteabgleich", sync, sync ? "Sync verfügbar" : "Konto oder HTTPS-Sync einrichten"],
    ["Automatischer Mailversand", mail, mail ? "Webhook vollständig" : "HTTPS-Webhook und E-Mail fehlen"],
    ["Geräteschutz", deviceLock, deviceLock ? "Face ID / Touch ID aktiv" : "Unter Automation & Werkzeuge aktivierbar"]
  ];
}

function renderV15Dashboard() {
  if (!document.querySelector("#v15-dashboard")) return;
  const year = new Date().getFullYear();
  const stats = v15YearStats(year);
  document.querySelector("#v15-year").textContent = String(year);
  document.querySelector("#v15-earned").textContent = euroFormatter.format(stats.earned / 100);
  document.querySelector("#v15-paid").textContent = euroFormatter.format(stats.paid / 100);
  document.querySelector("#v15-open").textContent = euroFormatter.format(stats.open / 100);
  document.querySelector("#v15-available").textContent = euroFormatter.format(stats.available / 100);
  const issues = v15InvoiceIssues();
  const readiness = document.querySelector("#v15-readiness");
  readiness.classList.toggle("warning", issues.length > 0);
  readiness.textContent = issues.length ? `${issues.length} Rechnungsangabe(n) prüfen` : "✓ Rechnungsprüfung bestanden";
}

function renderV15Invoice() {
  if (!document.querySelector("#v15-invoice-check")) return;
  const issues = v15InvoiceIssues();
  const status = document.querySelector("#v15-invoice-status");
  status.textContent = issues.length ? `${issues.length} offen` : "Bereit";
  status.classList.toggle("warning", issues.length > 0);
  document.querySelector("#v15-invoice-issues").innerHTML = issues.length
    ? issues.map(issue => `<div class="warning"><span>!</span><strong>${escapeHTML(issue)}</strong></div>`).join("")
    : `<div class="good"><span>✓</span><strong>Pflichtangaben, IBAN und Rechnungsnummer sind plausibel.</strong></div>`;
}

function renderV15Settings() {
  if (!document.querySelector("#v15-settings")) return;
  document.querySelector("#v15-setup-list").innerHTML = v15SetupItems().map(([title, ready, detail]) => `
    <div class="${ready ? "good" : "warning"}"><span>${ready ? "✓" : "○"}</span><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(detail)}</small></div></div>`).join("");
  const audit = state.extensions.auditEvents || [];
  document.querySelector("#v15-audit-list").innerHTML = audit.length ? audit.slice(-20).reverse().map(event => `
    <div><span class="v15-audit-icon">${event.kind === "invoice" ? "€" : event.kind === "task" ? "✓" : event.kind === "import" ? "↥" : "•"}</span><div><strong>${escapeHTML(event.title)}</strong><small>${escapeHTML(event.detail || "")} · ${new Date(event.timestamp).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></div></div>`).join("") : `<p class="share-hint">Das Protokoll beginnt mit deinen nächsten Änderungen.</p>`;
}

function renderV15() { renderV15Dashboard(); renderV15Invoice(); renderV15Settings(); }

const v15BaseSetCount = setCount;
setCount = function version15SetCount(date, categoryID, nextCount) {
  const before = countFor(date, categoryID);
  v15BaseSetCount(date, categoryID, nextCount);
  const after = countFor(date, categoryID);
  if (before !== after) {
    const category = categories.find(item => item.id === categoryID);
    recordAudit("work", `${category?.title || categoryID} aktualisiert`, `${date}: ${before} → ${after}`, clientForDate(date)?.id);
    saveState(); renderV15();
  }
};

const v15BaseApplyTask = applyTask;
applyTask = function version15ApplyTask(task) {
  const wasCompleted = task.isCompleted;
  v15BaseApplyTask(task);
  if (!wasCompleted && task.isCompleted) { recordAudit("task", "Auftrag übernommen", `${task.title} · ${state.selectedDate}`, task.clientID); saveState(); renderV15(); }
};

const v15BaseDeleteTask = deleteTask;
deleteTask = function version15DeleteTask(taskID) {
  const task = state.tasks.find(item => item.id === taskID);
  v15BaseDeleteTask(taskID);
  if (task) { recordAudit("task", "Auftrag gelöscht", task.title, task.clientID); saveState(); renderV15(); }
};

const v15BaseArchiveInvoice = archiveInvoice;
archiveInvoice = function version15ArchiveInvoice(monthDate, quiet = false) {
  const existing = invoiceRecordFor(monthDate);
  const record = v15BaseArchiveInvoice(monthDate, quiet);
  if (record && !existing) { recordAudit("invoice", "Rechnungsentwurf erstellt", `${record.number} · ${euroFormatter.format(record.totalCents / 100)}`, record.clientID); saveState(); renderV15(); }
  return record;
};

const v15BaseUpdateInvoiceStatus = updateInvoiceStatus;
updateInvoiceStatus = function version15UpdateInvoiceStatus(record, status) {
  if (record.status === status) return;
  v15BaseUpdateInvoiceStatus(record, status);
  recordAudit("invoice", `Rechnungsstatus: ${status === "paid" ? "Bezahlt" : status === "sent" ? "Versendet" : "Entwurf"}`, record.number, record.clientID);
  saveState(); renderV15();
};

const v15BaseSendMonthlyInvoice = sendMonthlyInvoice;
sendMonthlyInvoice = async function version15SendMonthlyInvoice(month, quiet = false) {
  const previous = invoiceMonth;
  invoiceMonth = new Date(month);
  const valid = v15CanExport(!quiet);
  invoiceMonth = previous;
  if (!valid) return false;
  return v15BaseSendMonthlyInvoice(month, quiet);
};

document.querySelector("#task-form")?.addEventListener("submit", () => {
  const categoryID = document.querySelector("#task-category")?.value;
  const count = Math.max(1, Math.floor(Number(document.querySelector("#task-count")?.value) || 1));
  const category = categories.find(item => item.id === categoryID);
  recordAudit("task", "Auftrag vorgemerkt", `${count} × ${category?.title || categoryID}`, clientForDate(state.selectedDate)?.id);
}, true);

document.querySelector("#v13-close-day")?.addEventListener("click", () => {
  const closed = state.extensions.closedDayKeys.includes(state.selectedDate);
  if (!closed && totalsFor(state.selectedDate).count === 0) return;
  recordAudit("day", closed ? "Arbeitstag wieder geöffnet" : "Arbeitstag abgeschlossen", state.selectedDate, clientForDate(state.selectedDate)?.id);
}, true);

for (const selector of ["#download-word", "#download-excel", "#print-pdf", "#share-invoice"]) {
  document.querySelector(selector)?.addEventListener("click", event => {
    if (!v15CanExport(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}

const v15BaseRenderAll = renderAll;
renderAll = function version15RenderAll() { v15BaseRenderAll(); renderV15(); };
const v15BaseRenderWorkday = renderWorkday;
renderWorkday = function version15RenderWorkday() { v15BaseRenderWorkday(); renderV15Dashboard(); };
const v15BaseRenderInvoice = renderInvoice;
renderInvoice = function version15RenderInvoice() { v15BaseRenderInvoice(); renderV15Invoice(); };
const v15BaseRenderInvoiceArchive = renderInvoiceArchive;
renderInvoiceArchive = function version15RenderInvoiceArchive() { v15BaseRenderInvoiceArchive(); renderV15(); };
const v15BaseSwitchPage = switchPage;
switchPage = function version15SwitchPage(target) { v15BaseSwitchPage(target); if (target === "settings") renderV15Settings(); if (target === "invoice") renderV15Invoice(); };

for (const selector of Object.values(invoiceFieldMap)) document.querySelector(selector)?.addEventListener("input", renderV15Invoice);

injectV15UI();
renderV15();
