"use strict";

// FDN ÖSD Version 13 – Ziele, Wochenfokus, Tagesabschluss und intelligente Einblicke.
function v13DashboardMarkup() {
  return `
    <section class="card v13-dashboard" id="v13-dashboard">
      <div class="card-heading"><div><h3>Wochenfokus</h3><p>Ziele, Arbeitspensum und der nächste sinnvolle Schritt.</p></div><span class="version-badge v13-badge">V13</span></div>
      <div class="v13-progress-row"><div><strong>Wochenziel</strong><span id="v13-week-label"></span></div><progress id="v13-week-progress" max="100"></progress></div>
      <div class="v13-progress-row"><div><strong>Monatsverdienstziel</strong><span id="v13-month-label"></span></div><progress id="v13-month-progress" max="100"></progress></div>
      <div class="v13-insights">
        <div><span>🔥 Produktive Serie</span><strong id="v13-streak">0 Tage</strong></div>
        <div><span>◴ Auslastung</span><strong id="v13-capacity">Frei</strong></div>
      </div>
      <div class="v13-focus" id="v13-focus"></div>
      <label class="v13-note"><span>Tagesnotiz</span><textarea id="v13-day-note" rows="3" maxlength="1000" placeholder="Rückfragen, Besonderheiten oder Übergabe …"></textarea></label>
      <div class="button-row"><button class="secondary-button" id="v13-save-note">Notiz speichern</button><button class="primary-button" id="v13-close-day">Arbeitstag abschließen</button></div>
      <p class="v13-closed-hint" id="v13-closed-hint" hidden>✓ Dieser Tag ist abgeschlossen und vor Änderungen geschützt.</p>
    </section>`;
}

function v13SettingsMarkup() {
  return `
    <section class="card v13-settings" id="v13-settings">
      <div class="card-heading"><div><h3>Version-13-Ziele & Einblicke</h3><p>Persönliche Ziele und Auftraggeber-Verteilung.</p></div><span class="version-badge v13-badge">13</span></div>
      <div class="v13-setting-grid">
        <label><span>Wochenziel (Aufträge)</span><input id="v13-week-target" type="number" min="1" max="4999" inputmode="numeric"></label>
        <label><span>Monatsverdienstziel (€)</span><input id="v13-month-target" type="number" min="0" max="1000000" step="10" inputmode="decimal"></label>
      </div>
      <div class="v13-week-summary" id="v13-week-summary"></div>
      <h4>Auftraggeber-Verteilung im Monat</h4>
      <div class="v13-client-bars" id="v13-client-bars"></div>
      <p class="share-hint" id="v13-protection-summary"></p>
    </section>`;
}

function injectV13UI() {
  const cockpit = document.querySelector("#v12-cockpit");
  if (cockpit && !document.querySelector("#v13-dashboard")) cockpit.insertAdjacentHTML("afterend", v13DashboardMarkup());
  const settings = document.querySelector("#v12-settings");
  if (settings && !document.querySelector("#v13-settings")) settings.insertAdjacentHTML("beforebegin", v13SettingsMarkup());
  bindV13Events();
}

function v13StartOfWeek(date) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = value.getDay() === 0 ? -6 : 1 - value.getDay();
  value.setDate(value.getDate() + offset);
  return value;
}

function v13WeekStats(date = dateFromKey(state.selectedDate)) {
  const start = v13StartOfWeek(date);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return Object.keys(state.entries).reduce((result, key) => {
    const value = dateFromKey(key);
    if (value >= start && value < end) {
      const totals = totalsFor(key); result.count += totals.count; result.cents += totals.cents;
    }
    return result;
  }, { count: 0, cents: 0 });
}

function v13ProductiveStreak(date = dateFromKey(state.selectedDate)) {
  const active = new Set(Object.keys(state.entries).filter(key => totalsFor(key).count > 0));
  let cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function v13OpenMinutes() {
  return state.tasks.filter(task => !task.isCompleted).reduce((sum, task) => sum + (task.estimatedMinutes || Math.max(1, Math.round(task.count * averageMinutesPerCorrection()))), 0);
}

function v13CapacityTitle(minutes) {
  if (minutes === 0) return "Frei";
  if (minutes <= 240) return "Entspannt";
  if (minutes <= 600) return "Gut gefüllt";
  return "Sehr hoch";
}

function v13MonthClientStats(date = dateFromKey(state.selectedDate)) {
  const prefix = dayKey(new Date(date.getFullYear(), date.getMonth(), 1, 12)).slice(0, 7);
  const totals = new Map(allClients().map(client => [client.id, 0]));
  for (const key of Object.keys(state.entries).filter(value => value.startsWith(prefix))) {
    const clientID = state.extensions.entryClients[key] || "osd";
    totals.set(clientID, (totals.get(clientID) || 0) + totalsFor(key).cents);
  }
  return allClients().map(client => ({ client, cents: totals.get(client.id) || 0 })).filter(item => item.cents > 0).sort((a, b) => b.cents - a.cents);
}

function renderV13Dashboard() {
  if (!document.querySelector("#v13-dashboard")) return;
  const week = v13WeekStats();
  const weekTarget = state.extensions.weeklyTargetCount;
  document.querySelector("#v13-week-label").textContent = `${week.count} / ${weekTarget}`;
  document.querySelector("#v13-week-progress").value = Math.min(100, week.count / Math.max(1, weekTarget) * 100);

  const selected = dateFromKey(state.selectedDate);
  const month = totalsForMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
  const monthTarget = state.extensions.monthlyRevenueTargetCents;
  document.querySelector("#v13-month-label").textContent = `${euroFormatter.format(month.cents / 100)} / ${euroFormatter.format(monthTarget / 100)}`;
  document.querySelector("#v13-month-progress").value = monthTarget > 0 ? Math.min(100, month.cents / monthTarget * 100) : 0;
  document.querySelector("#v13-streak").textContent = `${v13ProductiveStreak()} ${v13ProductiveStreak() === 1 ? "Tag" : "Tage"}`;

  const openMinutes = v13OpenMinutes();
  const capacity = document.querySelector("#v13-capacity");
  capacity.textContent = `${v13CapacityTitle(openMinutes)} · ${formatDuration(openMinutes * 60)}`;
  capacity.classList.toggle("warning", openMinutes > 600);

  const task = state.tasks.filter(item => !item.isCompleted).sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey))[0];
  const focus = document.querySelector("#v13-focus");
  if (task) {
    const category = categories.find(item => item.id === task.categoryID);
    focus.innerHTML = `<div><span>✨ Intelligenter Fokus</span><strong>Als Nächstes: ${task.count} × ${escapeHTML(category?.title || task.title)}</strong><small>Fällig ${numericDate(task.dueDateKey)} · ca. ${task.estimatedMinutes || Math.round(task.count * averageMinutesPerCorrection())} Min.</small></div><button class="text-button" id="v13-apply-focus">Heute übernehmen</button>`;
    document.querySelector("#v13-apply-focus").addEventListener("click", () => applyTask(task));
  } else {
    focus.innerHTML = `<div><span>✨ Intelligenter Fokus</span><strong>Keine offenen Aufträge</strong><small>Du kannst deinen nächsten Auftrag entspannt vormerken.</small></div>`;
  }

  document.querySelector("#v13-day-note").value = state.extensions.dailyNotes[state.selectedDate] || "";
  const closed = state.extensions.closedDayKeys.includes(state.selectedDate);
  document.querySelector("#v13-close-day").textContent = closed ? "Tag wieder öffnen" : "Arbeitstag abschließen";
  document.querySelector("#v13-closed-hint").hidden = !closed;
  document.querySelector("#counter-list").classList.toggle("v13-day-closed", closed);
  document.querySelectorAll("#counter-list button, #copy-last-day").forEach(button => { button.disabled = closed; });
  document.querySelector("#timer-toggle").disabled = closed && state.activeTimer?.date !== state.selectedDate;
  document.querySelector("#timer-plus").disabled = closed;
  if (closed) document.querySelector("#timer-minus").disabled = true;
}

function renderV13Settings() {
  if (!document.querySelector("#v13-settings")) return;
  document.querySelector("#v13-week-target").value = String(state.extensions.weeklyTargetCount);
  document.querySelector("#v13-month-target").value = String(state.extensions.monthlyRevenueTargetCents / 100);
  const week = v13WeekStats(new Date());
  document.querySelector("#v13-week-summary").innerHTML = `<div><span>Diese Woche</span><strong>${week.count} Aufträge</strong></div><div><span>Verdienst</span><strong>${euroFormatter.format(week.cents / 100)}</strong></div><div><span>Aktuelle Serie</span><strong>${v13ProductiveStreak(new Date())} Tage</strong></div>`;
  const clients = v13MonthClientStats(new Date());
  const maximum = Math.max(1, ...clients.map(item => item.cents));
  document.querySelector("#v13-client-bars").innerHTML = clients.length ? clients.map(item => `<div><div><span>${escapeHTML(item.client.shortName)}</span><strong>${euroFormatter.format(item.cents / 100)}</strong></div><i><b style="width:${item.cents / maximum * 100}%"></b></i></div>`).join("") : `<p class="share-hint">Noch keine Monatsdaten vorhanden.</p>`;
  document.querySelector("#v13-protection-summary").textContent = `${state.extensions.closedDayKeys.length} abgeschlossene Arbeitstage · ${Object.keys(state.extensions.dailyNotes).length} Tagesnotizen`;
}

function saveV13Note() {
  const note = document.querySelector("#v13-day-note").value.trim().slice(0, 1000);
  if (note) state.extensions.dailyNotes[state.selectedDate] = note; else delete state.extensions.dailyNotes[state.selectedDate];
  saveState(); showToast("Tagesnotiz gespeichert");
}

function toggleV13DayClosed() {
  const index = state.extensions.closedDayKeys.indexOf(state.selectedDate);
  if (index >= 0) state.extensions.closedDayKeys.splice(index, 1);
  else {
    if (totalsFor(state.selectedDate).count === 0) return showToast("Trage zuerst mindestens einen Auftrag ein.");
    if (state.activeTimer?.date === state.selectedDate) stopActiveTimer();
    state.extensions.closedDayKeys.push(state.selectedDate);
  }
  saveState(); renderWorkday(); renderV13Settings();
  showToast(index >= 0 ? "Arbeitstag wieder geöffnet" : "Arbeitstag sicher abgeschlossen");
}

function bindV13Events() {
  document.querySelector("#v13-save-note")?.addEventListener("click", saveV13Note);
  document.querySelector("#v13-day-note")?.addEventListener("change", saveV13Note);
  document.querySelector("#v13-close-day")?.addEventListener("click", toggleV13DayClosed);
  document.querySelector("#v13-week-target")?.addEventListener("change", event => {
    state.extensions.weeklyTargetCount = Math.max(1, Math.min(4999, Math.round(Number(event.target.value) || 80))); saveState(); renderV13();
  });
  document.querySelector("#v13-month-target")?.addEventListener("change", event => {
    state.extensions.monthlyRevenueTargetCents = Math.max(0, Math.min(100000000, Math.round((Number(event.target.value) || 0) * 100))); saveState(); renderV13();
  });
}

function renderV13() { renderV13Dashboard(); renderV13Settings(); }

const v13BaseSetCount = setCount;
setCount = function version13SetCount(date, categoryID, count) {
  if (state.extensions.closedDayKeys.includes(date)) { showToast("Dieser Arbeitstag ist abgeschlossen. Öffne ihn zuerst wieder."); return; }
  v13BaseSetCount(date, categoryID, count);
};

const v13BaseApplyTask = applyTask;
applyTask = function version13ApplyTask(task) {
  if (state.extensions.closedDayKeys.includes(state.selectedDate)) { showToast("Öffne den Arbeitstag zuerst wieder."); return; }
  v13BaseApplyTask(task);
};

const v13BaseCopyLatest = copyLatestWorkday;
copyLatestWorkday = function version13CopyLatest() {
  if (state.extensions.closedDayKeys.includes(state.selectedDate)) { showToast("Öffne den Arbeitstag zuerst wieder."); return; }
  v13BaseCopyLatest();
};

const v13BaseRenderAll = renderAll;
renderAll = function version13RenderAll() { v13BaseRenderAll(); renderV13(); };

const v13BaseRenderWorkday = renderWorkday;
renderWorkday = function version13RenderWorkday() { v13BaseRenderWorkday(); renderV13Dashboard(); };

const v13BaseSwitchPage = switchPage;
switchPage = function version13SwitchPage(target) {
  v13BaseSwitchPage(target);
  if (target === "settings") renderV13Settings();
};

injectV13UI();
renderV13();
