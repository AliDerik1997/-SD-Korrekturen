"use strict";

// FDN ÖSD Version 16 – datensparsamer KI-Assistent mit lokalem Offline-Modus.
let v16LastAnswer = "Wähle eine Analyse. Ohne Cloud-Verbindung arbeitet der Assistent vollständig lokal.";
let v16LastSource = "Lokal";
let v16Running = false;
let v16AnswerDate = "";

function v16DashboardMarkup() {
  return `
    <section class="card v16-ai-card" id="v16-ai-card">
      <div class="card-heading">
        <div><h3><span class="v16-spark">✦</span> FDN KI-Assistent</h3><p id="v16-ai-source">Lokal · keine Datenübertragung</p></div>
        <span class="version-badge v16-badge">V16</span>
      </div>
      <div class="v16-answer" id="v16-ai-answer" aria-live="polite"></div>
      <div class="v16-mode-grid">
        <button type="button" class="secondary-button" data-v16-mode="daily"><span>✦</span>Tag</button>
        <button type="button" class="secondary-button" data-v16-mode="month"><span>▦</span>Monat</button>
        <button type="button" class="secondary-button" data-v16-mode="email"><span>✉</span>E-Mail</button>
      </div>
      <div class="v16-privacy"><span>◉</span><p>Keine Namen, E-Mails, Bankdaten, Notizen oder Anhänge werden an die KI gesendet.</p></div>
      <button type="button" class="text-button" id="v16-copy-answer">Antwort kopieren</button>
    </section>`;
}

function v16SettingsMarkup() {
  return `
    <section class="card v16-settings" id="v16-settings">
      <div class="card-heading"><div><h3>KI & Datenschutz</h3><p>Offline sofort nutzbar; OpenAI optional über deinen privaten Server.</p></div><span class="version-badge v16-badge">16</span></div>
      <label class="preference-row"><span>Cloud-KI freiwillig aktivieren</span><input id="v16-cloud-enabled" type="checkbox"></label>
      <label><span>Privater KI-Gateway (HTTPS)</span><input id="v16-ai-endpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://…/fdn-ai"></label>
      <label><span>Gateway-Token (kein OpenAI-API-Key)</span><input id="v16-ai-token" type="password" autocomplete="off"></label>
      <div class="button-row"><button type="button" class="primary-button" id="v16-save-ai">Sicher speichern</button><button type="button" class="secondary-button" id="v16-test-ai">Verbindung testen</button></div>
      <div class="v16-data-list">
        <span class="allowed">✓ Anzahl, Beträge, Zeit, Ziele und Fristdaten</span>
        <span class="blocked">× Keine Namen, E-Mail, IBAN, Notizen oder Anhänge</span>
      </div>
      <p class="share-hint" id="v16-settings-status">Offline-Assistent ist einsatzbereit.</p>
      <p class="share-hint"><strong>Wichtig:</strong> Ein OpenAI-API-Schlüssel gehört niemals in diese Web-App. Er bleibt ausschließlich als Umgebungsvariable auf deinem privaten Gateway.</p>
    </section>`;
}

function injectV16UI() {
  const dashboard = document.querySelector("#v15-dashboard");
  if (dashboard && !document.querySelector("#v16-ai-card")) dashboard.insertAdjacentHTML("afterend", v16DashboardMarkup());
  const settings = document.querySelector("#v15-settings");
  if (settings && !document.querySelector("#v16-settings")) settings.insertAdjacentHTML("beforebegin", v16SettingsMarkup());
  bindV16Events();
}

function v16MonthForecast(monthDate, cents) {
  const now = new Date();
  if (monthDate.getFullYear() !== now.getFullYear() || monthDate.getMonth() !== now.getMonth()) return cents;
  const elapsed = Math.max(1, now.getDate());
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round(cents / elapsed * days);
}

function v16SafeContext() {
  const selected = dateFromKey(state.selectedDate);
  const month = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  const todayTotals = totalsFor(state.selectedDate);
  const monthTotals = totalsForMonth(month);
  const todayKey = dayKey(new Date());
  const openTasks = state.tasks.filter(task => !task.isCompleted);
  const allCount = Object.keys(state.entries).reduce((sum, date) => sum + totalsFor(date).count, 0);
  const allSeconds = Object.values(state.workSeconds || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const yearPrefix = `${selected.getFullYear()}-`;
  const openInvoiceCents = state.invoices
    .filter(invoice => invoice.status === "sent" && invoice.monthKey.startsWith(yearPrefix))
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalCents) || 0), 0);

  // Diese Whitelist ist der einzige Kontext, der den Browser verlassen darf.
  return Object.freeze({
    dateKey: state.selectedDate,
    todayCount: todayTotals.count,
    todayEarningsCents: todayTotals.cents,
    workedSeconds: workedSecondsFor(state.selectedDate),
    dailyTargetCount: state.extensions.dailyTargetCount,
    monthCount: monthTotals.count,
    monthEarningsCents: monthTotals.cents,
    monthlyTargetCents: state.extensions.monthlyRevenueTargetCents,
    predictedMonthEarningsCents: v16MonthForecast(month, monthTotals.cents),
    openOrderCount: openTasks.length,
    overdueOrderCount: openTasks.filter(task => task.dueDateKey < todayKey).length,
    nextDueDates: openTasks.map(task => task.dueDateKey).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().slice(0, 5),
    openInvoiceCents,
    averageMinutesPerCorrection: allCount > 0 && allSeconds > 0 ? allSeconds / 60 / allCount : 6
  });
}

function v16LocalAnalysis(mode, context) {
  const euro = cents => euroFormatter.format(cents / 100);
  if (mode === "daily") {
    if (!context.todayCount) {
      const next = context.nextDueDates[0] ? ` Die nächste gespeicherte Frist ist am ${context.nextDueDates[0]}.` : "";
      return `Für diesen Tag sind noch keine Korrekturen eingetragen. Dein Tagesziel liegt bei ${context.dailyTargetCount} Aufträgen.${next}`;
    }
    const progress = Math.min(999, Math.round(context.todayCount / Math.max(1, context.dailyTargetCount) * 100));
    const pace = context.workedSeconds > 0
      ? ` Das entspricht ungefähr ${euro(Math.round(context.todayEarningsCents * 3600 / context.workedSeconds))} pro Arbeitsstunde.`
      : " Starte die Zeiterfassung, damit die App auch deinen Stundenwert berechnen kann.";
    const warning = context.overdueOrderCount ? ` Achtung: ${context.overdueOrderCount} Auftrag/Aufträge sind überfällig.` : "";
    return `Du hast ${context.todayCount} Korrekturen erledigt und ${euro(context.todayEarningsCents)} verdient. Tagesziel: ${progress} %. Erfasste Zeit: ${formatDuration(context.workedSeconds)}.${pace}${warning}`;
  }
  if (mode === "month") {
    const remaining = Math.max(0, context.monthlyTargetCents - context.monthEarningsCents);
    const progress = context.monthlyTargetCents > 0 ? Math.min(999, Math.round(context.monthEarningsCents / context.monthlyTargetCents * 100)) : 0;
    const orders = context.openOrderCount
      ? ` Du hast noch ${context.openOrderCount} offene Aufträge; davon sind ${context.overdueOrderCount} überfällig.`
      : " Aktuell sind keine offenen Aufträge gespeichert.";
    return `Im Monat stehen ${context.monthCount} Korrekturen und ${euro(context.monthEarningsCents)}. Das Monatsziel ist zu ${progress} % erreicht; offen sind noch ${euro(remaining)}. Die Hochrechnung liegt bei ${euro(context.predictedMonthEarningsCents)}.${orders}`;
  }
  return `Betreff: Arbeitsstand vom ${context.dateKey}\n\nGuten Tag,\n\nam ${context.dateKey} habe ich ${context.todayCount} schriftliche Leistungen bearbeitet. Der erfasste Betrag beträgt ${euro(context.todayEarningsCents)}; die dokumentierte Arbeitszeit beträgt ${formatDuration(context.workedSeconds)}.\n\nFreundliche Grüße`;
}

async function v16CloudAnalysis(mode, context) {
  const endpoint = String(advancedPrivate.aiEndpoint || "").trim();
  if (!/^https:\/\//i.test(endpoint)) throw new Error("Bitte zuerst eine gültige HTTPS-Adresse eintragen.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(advancedPrivate.aiToken ? { Authorization: `Bearer ${advancedPrivate.aiToken}` } : {})
      },
      body: JSON.stringify({ mode, locale: "de-AT", context }),
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload.error || `HTTP ${response.status}`).slice(0, 240));
    const structured = v16StructuredContent(payload.data);
    const text = structured ? v16StructuredText(structured) : String(payload.text || "").trim();
    if (!text) throw new Error("Der KI-Dienst hat keine lesbare Antwort geliefert.");
    return text.slice(0, 4000);
  } finally {
    clearTimeout(timeout);
  }
}

function v16StructuredContent(value) {
  if (!value || typeof value !== "object") return null;
  const summary = String(value.summary || "").trim().slice(0, 1600);
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map(item => String(item || "").trim().slice(0, 300)).filter(Boolean).slice(0, 6)
    : [];
  const nextAction = String(value.nextAction || "").trim().slice(0, 500);
  const emailDraft = String(value.emailDraft || "").trim().slice(0, 2400);
  return summary || warnings.length || nextAction || emailDraft ? { summary, warnings, nextAction, emailDraft } : null;
}

function v16StructuredText(value) {
  const sections = [];
  if (value.summary) sections.push(value.summary);
  if (value.warnings.length) sections.push(`Hinweise:\n${value.warnings.map(item => `• ${item}`).join("\n")}`);
  if (value.nextAction) sections.push(`Nächster Schritt: ${value.nextAction}`);
  if (value.emailDraft) sections.push(value.emailDraft);
  return sections.join("\n\n").slice(0, 4000);
}

async function v16Run(mode, options = {}) {
  if (v16Running) return;
  v16Running = true;
  v16LastAnswer = "Analyse läuft …";
  renderV16Dashboard();
  const context = v16SafeContext();
  const requestDate = context.dateKey;
  try {
    if (advancedPrivate.aiCloudEnabled) {
      v16LastAnswer = await v16CloudAnalysis(mode, context);
      v16LastSource = "Cloud-KI · datensparsam";
    } else {
      v16LastAnswer = v16LocalAnalysis(mode, context);
      v16LastSource = "Lokal · keine Datenübertragung";
    }
    if (!options.quiet) showToast(advancedPrivate.aiCloudEnabled ? "Cloud-KI abgeschlossen" : "Lokale Analyse abgeschlossen");
    return true;
  } catch (error) {
    v16LastAnswer = v16LocalAnalysis(mode, context);
    v16LastSource = "Lokal · Cloud nicht erreichbar";
    if (!options.quiet) showToast(`Cloud nicht erreichbar – lokale Analyse aktiv: ${error.message}`);
    return false;
  } finally {
    v16AnswerDate = requestDate;
    v16Running = false;
    renderV16Dashboard();
  }
}

function renderV16Dashboard() {
  const answer = document.querySelector("#v16-ai-answer");
  if (!answer) return;
  if (v16AnswerDate && v16AnswerDate !== state.selectedDate && !v16Running) {
    v16LastAnswer = "Wähle eine Analyse. Ohne Cloud-Verbindung arbeitet der Assistent vollständig lokal.";
    v16LastSource = "Lokal · keine Datenübertragung";
    v16AnswerDate = "";
  }
  answer.textContent = v16LastAnswer;
  document.querySelector("#v16-ai-source").textContent = v16LastSource;
  document.querySelectorAll("[data-v16-mode]").forEach(button => { button.disabled = v16Running; });
}

function renderV16Settings() {
  const enabled = document.querySelector("#v16-cloud-enabled");
  if (!enabled) return;
  enabled.checked = advancedPrivate.aiCloudEnabled === true;
  document.querySelector("#v16-ai-endpoint").value = advancedPrivate.aiEndpoint || "";
  document.querySelector("#v16-ai-token").value = advancedPrivate.aiToken || "";
  document.querySelector("#v16-test-ai").disabled = !advancedPrivate.aiCloudEnabled || v16Running;
}

function v16SaveSettings() {
  const enabled = document.querySelector("#v16-cloud-enabled")?.checked === true;
  const endpoint = String(document.querySelector("#v16-ai-endpoint")?.value || "").trim().replace(/\/$/, "").slice(0, 600);
  const token = String(document.querySelector("#v16-ai-token")?.value || "").trim().slice(0, 1000);
  if (enabled && endpoint && !/^https:\/\//i.test(endpoint)) return showToast("Der KI-Gateway muss eine HTTPS-Adresse sein.");
  advancedPrivate.aiCloudEnabled = enabled;
  advancedPrivate.aiEndpoint = endpoint;
  advancedPrivate.aiToken = token;
  saveAdvancedPrivate();
  document.querySelector("#v16-settings-status").textContent = enabled ? "Cloud-Einstellungen nur auf diesem Gerät gespeichert." : "Offline-Assistent ist aktiv.";
  renderV16Settings();
  showToast("KI-Einstellungen gespeichert");
}

function bindV16Events() {
  document.querySelectorAll("[data-v16-mode]").forEach(button => button.addEventListener("click", () => v16Run(button.dataset.v16Mode)));
  document.querySelector("#v16-copy-answer")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(v16LastAnswer); showToast("KI-Antwort kopiert"); }
    catch { showToast("Kopieren ist in diesem Browser nicht verfügbar."); }
  });
  document.querySelector("#v16-save-ai")?.addEventListener("click", v16SaveSettings);
  document.querySelector("#v16-cloud-enabled")?.addEventListener("change", v16SaveSettings);
  document.querySelector("#v16-test-ai")?.addEventListener("click", async () => {
    v16SaveSettings();
    const status = document.querySelector("#v16-settings-status");
    status.textContent = "Verbindung wird geprüft …";
    const okay = await v16Run("daily", { quiet: true });
    status.textContent = okay && v16LastSource.startsWith("Cloud") ? "Cloud-KI ist erreichbar." : "Cloud nicht erreichbar; lokale KI bleibt aktiv.";
  });
}

function renderV16() { renderV16Dashboard(); renderV16Settings(); }

const v16BaseRenderAll = renderAll;
renderAll = function version16RenderAll() { v16BaseRenderAll(); renderV16(); };
const v16BaseRenderWorkday = renderWorkday;
renderWorkday = function version16RenderWorkday() { v16BaseRenderWorkday(); renderV16Dashboard(); };
const v16BaseSwitchPage = switchPage;
switchPage = function version16SwitchPage(target) { v16BaseSwitchPage(target); if (target === "settings") renderV16Settings(); };

injectV16UI();
renderV16();
