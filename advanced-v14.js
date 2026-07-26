"use strict";

// FDN ÖSD Version 14 – Zieltempo, Cashflow, Abschlussprüfung und Tagesfreigabe.
function v14DashboardMarkup() {
  return `
    <section class="card v14-dashboard" id="v14-dashboard">
      <div class="card-heading"><div><h3>Tagesplan & Cashflow</h3><p>Zieltempo, offene Honorare und Tagesfreigabe.</p></div><span class="version-badge v14-badge">V14</span></div>
      <div class="v14-metrics">
        <div><span>🏃 Zieltempo</span><strong id="v14-pace">–</strong></div>
        <div><span>◎ Monat noch offen</span><strong id="v14-month-remaining">0,00 €</strong></div>
        <div><span>◷ Honorare offen</span><strong id="v14-open-invoices">0,00 €</strong></div>
        <div><span>⚑ Plan fertig gegen</span><strong id="v14-finish-time">–</strong></div>
      </div>
      <p class="v14-warning" id="v14-warning" hidden></p>
      <button class="secondary-button v14-share" id="v14-share-day">Tageszusammenfassung teilen</button>
    </section>`;
}

function v14SettingsMarkup() {
  return `
    <section class="card v14-settings" id="v14-settings">
      <div class="card-heading"><div><h3>Version-14-Abschlussprüfung</h3><p>Vor Monatsende siehst du sofort, was noch fehlt.</p></div><span class="version-badge v14-badge">14</span></div>
      <div class="v14-check-list" id="v14-check-list"></div>
      <div class="v14-cashflow" id="v14-cashflow"></div>
      <p class="share-hint">Verwendete Auftraggeber bleiben geschützt. Abgeschlossene Tage sperren auch Timer und Schnelleingaben.</p>
    </section>`;
}

function injectV14UI() {
  const dashboard = document.querySelector("#v13-dashboard");
  if (dashboard && !document.querySelector("#v14-dashboard")) dashboard.insertAdjacentHTML("afterend", v14DashboardMarkup());
  const settings = document.querySelector("#v13-settings");
  if (settings && !document.querySelector("#v14-settings")) settings.insertAdjacentHTML("beforebegin", v14SettingsMarkup());
  document.querySelector("#v14-share-day")?.addEventListener("click", shareV14Day);
}

function v14DaysRemainingInWeek(date = dateFromKey(state.selectedDate)) {
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  return Math.max(1, 8 - weekday);
}

function v14OpenSentInvoices() {
  return state.invoices.filter(item => item.status === "sent");
}

function v14InvoiceOverdue(invoice) {
  if (!invoice.sentAt) return false;
  const sent = new Date(invoice.sentAt);
  if (Number.isNaN(sent.getTime())) return false;
  sent.setDate(sent.getDate() + Math.max(0, Number(state.invoiceProfile.paymentDueDays) || 0));
  return sent < new Date();
}

function v14DailySummary() {
  const totals = totalsFor(state.selectedDate);
  const details = categories.map(category => ({ category, count: countFor(state.selectedDate, category.id) })).filter(item => item.count > 0)
    .map(item => `${item.category.title}: ${item.count}`).join(", ");
  const note = state.extensions.dailyNotes[state.selectedDate] || "";
  return [
    `FDN ÖSD · ${numericDate(state.selectedDate)}`,
    `Auftraggeber: ${clientForDate(state.selectedDate).shortName}`,
    `Aufträge: ${totals.count}${details ? ` (${details})` : ""}`,
    `Verdienst: ${euroFormatter.format(totals.cents / 100)}`,
    `Arbeitszeit: ${formatDuration(workedSecondsFor(state.selectedDate))}`,
    note ? `Notiz: ${note}` : ""
  ].filter(Boolean).join("\n");
}

async function shareV14Day() {
  const text = v14DailySummary();
  try {
    if (navigator.share) await navigator.share({ title: "FDN ÖSD Tageszusammenfassung", text });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); showToast("Tageszusammenfassung kopiert"); }
    else showToast("Teilen ist in diesem Browser nicht verfügbar.");
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Tageszusammenfassung konnte nicht geteilt werden.");
  }
}

function v14MissingBillingFields() {
  const checks = [["Name", state.invoiceProfile.senderName], ["Adresse", state.invoiceProfile.senderAddress], ["IBAN", state.invoiceProfile.iban], ["E-Mail", state.invoiceProfile.email]];
  return checks.filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
}

function renderV14Dashboard() {
  if (!document.querySelector("#v14-dashboard")) return;
  const week = v13WeekStats();
  const remaining = Math.max(0, state.extensions.weeklyTargetCount - week.count);
  const pace = remaining ? Math.ceil(remaining / v14DaysRemainingInWeek()) : 0;
  document.querySelector("#v14-pace").textContent = pace ? `${pace} pro Tag` : "Ziel erreicht";
  const selected = dateFromKey(state.selectedDate);
  const monthCents = totalsForMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12)).cents;
  document.querySelector("#v14-month-remaining").textContent = euroFormatter.format(Math.max(0, state.extensions.monthlyRevenueTargetCents - monthCents) / 100);
  const sent = v14OpenSentInvoices();
  document.querySelector("#v14-open-invoices").textContent = euroFormatter.format(sent.reduce((sum, item) => sum + item.totalCents, 0) / 100);
  const openMinutes = v13OpenMinutes();
  document.querySelector("#v14-finish-time").textContent = openMinutes ? new Date(Date.now() + openMinutes * 60000).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "Keine Aufträge";
  const overdue = sent.filter(v14InvoiceOverdue).length;
  const warning = document.querySelector("#v14-warning");
  warning.hidden = overdue === 0;
  warning.textContent = overdue ? `${overdue} Honorarnote(n) liegen über dem Zahlungsziel.` : "";
}

function renderV14Settings() {
  if (!document.querySelector("#v14-settings")) return;
  const missing = v14MissingBillingFields();
  const unclosed = Object.keys(state.entries).filter(date => totalsFor(date).count > 0 && !state.extensions.closedDayKeys.includes(date)).length;
  document.querySelector("#v14-check-list").innerHTML = `
    <div class="${missing.length ? "warning" : "good"}"><span>${missing.length ? "⚠" : "✓"}</span><div><strong>${missing.length ? `Es fehlen: ${escapeHTML(missing.join(", "))}` : "Rechnungsdaten vollständig"}</strong><small>Abschlussprüfung</small></div></div>
    <div class="${unclosed ? "warning" : "good"}"><span>${unclosed ? "◷" : "✓"}</span><div><strong>${unclosed} nicht abgeschlossene Arbeitstage</strong><small>Schutz vor vergessenen Einträgen</small></div></div>`;
  const open = state.invoices.filter(item => item.status !== "paid");
  document.querySelector("#v14-cashflow").innerHTML = `<div><span>Offene Honorarnoten</span><strong>${open.length}</strong></div><div><span>Offener Betrag</span><strong>${euroFormatter.format(open.reduce((sum, item) => sum + item.totalCents, 0) / 100)}</strong></div><div><span>Geplante Restzeit</span><strong>${formatDuration(v13OpenMinutes() * 60)}</strong></div>`;
}

function renderV14() { renderV14Dashboard(); renderV14Settings(); }

const v14BaseRenderAll = renderAll;
renderAll = function version14RenderAll() { v14BaseRenderAll(); renderV14(); };

const v14BaseRenderWorkday = renderWorkday;
renderWorkday = function version14RenderWorkday() { v14BaseRenderWorkday(); renderV14Dashboard(); };

const v14BaseRenderInvoiceArchive = renderInvoiceArchive;
renderInvoiceArchive = function version14RenderInvoiceArchive() { v14BaseRenderInvoiceArchive(); renderV14(); };

const v14BaseSwitchPage = switchPage;
switchPage = function version14SwitchPage(target) {
  v14BaseSwitchPage(target);
  if (target === "settings") renderV14Settings();
};

injectV14UI();
renderV14();
