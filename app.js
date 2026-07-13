"use strict";

const categories = [
  { id: "a1-writing", title: "A1", detail: "Schriftliches Prüfungsmodul", invoiceLevel: "ZA1", defaultRate: 450, icon: "icon-a1", accent: "#42d7c1", accentRGB: "66,215,193" },
  { id: "a2-writing", title: "A2", detail: "Schriftliches Prüfungsmodul", invoiceLevel: "ZA2", defaultRate: 550, icon: "icon-a2", accent: "#8b7cf6", accentRGB: "139,124,246" },
  { id: "b1-reading", title: "B1 Lesen", detail: "Auswertung", invoiceLevel: "ZB1 (Lesen)", defaultRate: 50, icon: "icon-reading", accent: "#ffbd5c", accentRGB: "255,189,92" },
  { id: "b1-listening", title: "B1 Hören", detail: "Auswertung", invoiceLevel: "ZB1 (LH)", defaultRate: 50, icon: "icon-listening", accent: "#ff7d8b", accentRGB: "255,125,139" },
  { id: "b1-writing", title: "B1 Schreiben", detail: "Korrektur und Bewertung", invoiceLevel: "ZB1 (Schreiben)", defaultRate: 1000, icon: "icon-writing", accent: "#087bbf", accentRGB: "8,123,191" },
  { id: "b2-writing", title: "B2", detail: "Schriftliches Prüfungsmodul", invoiceLevel: "ZB2", defaultRate: 1500, icon: "icon-b2", accent: "#073b66", accentRGB: "7,59,102" }
];

const storageKey = "osd-korrektur-web-v1";
const euroFormatter = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const monthFormatter = new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDayFormatter = new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "short" });

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function defaultState() {
  return {
    rates: Object.fromEntries(categories.map(category => [category.id, category.defaultRate])),
    entries: {},
    entryRates: {},
    workSeconds: {},
    activeTimer: null,
    tasks: [],
    presets: [],
    invoices: [],
    sync: { url: "", token: "", auto: false, lastSync: "" },
    preferences: { theme: "system", hideAmounts: false },
    selectedDate: dayKey(new Date()),
    invoiceProfile: defaultInvoiceProfile()
  };
}

function defaultInvoiceProfile() {
  return {
    number: "1",
    email: "",
    recipient: "Österreichisches Sprachdiplom Deutsch",
    recipientAddress: "Hörlgasse 12\n1090 Wien",
    senderName: "",
    senderAddress: "",
    city: "Wien",
    bank: "",
    iban: "",
    bic: "",
    taxNote: "",
    paymentDueDays: 14
  };
}

function sanitizeInvoiceProfile(profile) {
  const clean = defaultInvoiceProfile();
  if (!profile || typeof profile !== "object") return clean;
  for (const key of Object.keys(clean)) {
    if (typeof clean[key] === "string" && typeof profile[key] === "string") clean[key] = profile[key].slice(0, 300);
    if (key === "paymentDueDays") clean[key] = Math.max(0, Math.min(90, Math.round(Number(profile[key]) || 14)));
  }
  return clean;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== "object") return defaultState();
    const fresh = defaultState();
    for (const category of categories) {
      const rate = Number(saved.rates?.[category.id]);
      if (Number.isFinite(rate) && rate >= 0) fresh.rates[category.id] = Math.round(rate);
    }
    fresh.entries = sanitizeEntries(saved.entries);
    fresh.entryRates = sanitizeEntryRates(saved.entryRates, fresh.entries, fresh.rates);
    fresh.workSeconds = sanitizeWorkSeconds(saved.workSeconds);
    fresh.activeTimer = sanitizeActiveTimer(saved.activeTimer);
    fresh.tasks = sanitizeTasks(saved.tasks);
    fresh.presets = sanitizePresets(saved.presets);
    fresh.invoices = sanitizeInvoices(saved.invoices);
    fresh.sync = sanitizeSync(saved.sync);
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.selectedDate || "")) fresh.selectedDate = saved.selectedDate;
    fresh.invoiceProfile = sanitizeInvoiceProfile(saved.invoiceProfile);
    if (["system", "light", "dark"].includes(saved.preferences?.theme)) fresh.preferences.theme = saved.preferences.theme;
    fresh.preferences.hideAmounts = saved.preferences?.hideAmounts === true;
    return fresh;
  } catch {
    return defaultState();
  }
}

function sanitizeWorkSeconds(values) {
  const clean = {};
  if (!values || typeof values !== "object") return clean;
  for (const [date, seconds] of Object.entries(values)) {
    const value = Number(seconds);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0) clean[date] = Math.floor(value);
  }
  return clean;
}

function sanitizeActiveTimer(timer) {
  if (!timer || !/^\d{4}-\d{2}-\d{2}$/.test(timer.date || "") || !Number.isFinite(Number(timer.startedAt))) return null;
  return { date: timer.date, startedAt: Number(timer.startedAt) };
}

function sanitizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter(task => task && categories.some(category => category.id === task.categoryID) && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDateKey || ""))
    .map(task => ({
      id: String(task.id || crypto.randomUUID()),
      title: String(task.title || "ÖSD-Auftrag").slice(0, 80),
      categoryID: task.categoryID,
      count: Math.max(1, Math.floor(Number(task.count) || 1)),
      dueDateKey: task.dueDateKey,
      isCompleted: task.isCompleted === true,
      createdAt: String(task.createdAt || new Date().toISOString())
    }));
}

function sanitizePresets(presets) {
  if (!Array.isArray(presets)) return [];
  return presets.map(preset => ({
    id: String(preset?.id || crypto.randomUUID()),
    title: String(preset?.title || "Vorlage").slice(0, 40),
    counts: sanitizeEntries({ "2020-01-01": preset?.counts })["2020-01-01"] || {}
  })).filter(preset => Object.keys(preset.counts).length);
}

function sanitizeInvoices(invoices) {
  if (!Array.isArray(invoices)) return [];
  return invoices.filter(item => item && /^\d{4}-\d{2}$/.test(item.monthKey || "")).map(item => ({
    id: String(item.id || crypto.randomUUID()),
    monthKey: item.monthKey,
    number: String(item.number || "1").slice(0, 30),
    status: ["draft", "sent", "paid"].includes(item.status) ? item.status : "draft",
    totalCents: Math.max(0, Math.round(Number(item.totalCents) || 0)),
    totalCount: Math.max(0, Math.round(Number(item.totalCount) || 0)),
    createdAt: String(item.createdAt || new Date().toISOString()),
    sentAt: item.sentAt || null,
    paidAt: item.paidAt || null
  }));
}

function sanitizeSync(sync) {
  return {
    url: typeof sync?.url === "string" ? sync.url.slice(0, 500) : "",
    token: typeof sync?.token === "string" ? sync.token.slice(0, 500) : "",
    auto: sync?.auto === true,
    lastSync: typeof sync?.lastSync === "string" ? sync.lastSync : ""
  };
}

function sanitizeEntries(entries) {
  const clean = {};
  if (!entries || typeof entries !== "object") return clean;
  for (const [date, counts] of Object.entries(entries)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !counts || typeof counts !== "object") continue;
    const cleanCounts = {};
    for (const category of categories) {
      const count = Number(counts[category.id]);
      if (Number.isFinite(count) && count > 0) cleanCounts[category.id] = Math.floor(count);
    }
    if (Object.keys(cleanCounts).length) clean[date] = cleanCounts;
  }
  return clean;
}

function sanitizeEntryRates(entryRates, entries, rates) {
  const clean = {};
  for (const [date, counts] of Object.entries(entries)) {
    const dayRates = {};
    for (const category of categories) {
      if (!(counts[category.id] > 0)) continue;
      const savedRate = Number(entryRates?.[date]?.[category.id]);
      dayRates[category.id] = Number.isFinite(savedRate) && savedRate >= 0
        ? Math.round(savedRate)
        : rates[category.id] ?? category.defaultRate;
    }
    if (Object.keys(dayRates).length) clean[date] = dayRates;
  }
  return clean;
}

let state = loadState();
let visibleMonth = new Date(dateFromKey(state.selectedDate).getFullYear(), dateFromKey(state.selectedDate).getMonth(), 1, 12);
let invoiceMonth = new Date(visibleMonth);
let toastTimer;
let deferredInstallPrompt = null;
let cloudSyncTimer;
let suppressAutoSync = false;

function haptic(strength = "light") {
  if (!("vibrate" in navigator)) return;
  const pattern = strength === "success" ? [12, 28, 18] : strength === "medium" ? 18 : 8;
  navigator.vibrate(pattern);
}

function pulseElement(element) {
  if (!element) return;
  element.classList.remove("haptic-pop");
  requestAnimationFrame(() => element.classList.add("haptic-pop"));
  window.setTimeout(() => element.classList.remove("haptic-pop"), 240);
}

document.body.addEventListener("click", event => {
  const control = event.target.closest("button, .file-button");
  if (!control || control.disabled) return;
  const strength = control.classList.contains("equals") || control.classList.contains("primary-button") ? "medium" : "light";
  haptic(strength);
  pulseElement(control);
}, true);

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    showToast("Speichern nicht möglich. Bitte Safari-Speicher prüfen.");
  }
  if (!suppressAutoSync && state.sync?.auto && state.sync?.url) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => uploadCloudBackup(true), 1400);
  }
}

function rateFor(categoryId) {
  return state.rates[categoryId] ?? categories.find(category => category.id === categoryId)?.defaultRate ?? 0;
}

function rateForEntry(date, categoryId) {
  if (countFor(date, categoryId) > 0) {
    return state.entryRates?.[date]?.[categoryId] ?? rateFor(categoryId);
  }
  return rateFor(categoryId);
}

function countFor(date, categoryId) {
  return state.entries[date]?.[categoryId] ?? 0;
}

function totalsFor(date) {
  const counts = state.entries[date] ?? {};
  return categories.reduce((total, category) => {
    const count = counts[category.id] ?? 0;
    total.count += count;
    total.cents += count * rateForEntry(date, category.id);
    return total;
  }, { count: 0, cents: 0 });
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function rowsForMonth(monthDate) {
  const prefix = `${monthKey(monthDate)}-`;
  const rows = [];
  for (const date of Object.keys(state.entries).filter(key => key.startsWith(prefix)).sort()) {
    for (const category of categories) {
      const count = countFor(date, category.id);
      if (count <= 0) continue;
      rows.push({
        date,
        category,
        count,
        rateCents: rateForEntry(date, category.id),
        amountCents: count * rateForEntry(date, category.id)
      });
    }
  }
  return rows;
}

function totalsForMonth(monthDate) {
  return rowsForMonth(monthDate).reduce((total, row) => {
    total.count += row.count;
    total.cents += row.amountCents;
    return total;
  }, { count: 0, cents: 0 });
}

function workedSecondsFor(date, now = Date.now()) {
  let seconds = Math.max(0, Number(state.workSeconds?.[date]) || 0);
  if (state.activeTimer?.date === date) seconds += Math.max(0, Math.floor((now - state.activeTimer.startedAt) / 1000));
  return seconds;
}

function workedSecondsForMonth(monthDate) {
  const prefix = `${monthKey(monthDate)}-`;
  return Object.entries(state.workSeconds || {}).filter(([date]) => date.startsWith(prefix)).reduce((sum, [, seconds]) => sum + seconds, 0);
}

function formatDuration(seconds, withSeconds = false) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (withSeconds) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`;
}

function stopActiveTimer() {
  if (!state.activeTimer) return;
  const elapsed = Math.max(1, Math.floor((Date.now() - state.activeTimer.startedAt) / 1000));
  state.workSeconds[state.activeTimer.date] = (state.workSeconds[state.activeTimer.date] || 0) + elapsed;
  state.activeTimer = null;
  saveState();
}

function toggleTimer() {
  if (state.activeTimer?.date === state.selectedDate) stopActiveTimer();
  else {
    if (state.activeTimer) stopActiveTimer();
    state.activeTimer = { date: state.selectedDate, startedAt: Date.now() };
    saveState();
  }
  renderTimer();
  haptic("medium");
}

function addWorkMinutes(minutes) {
  const current = state.workSeconds[state.selectedDate] || 0;
  state.workSeconds[state.selectedDate] = Math.max(0, current + minutes * 60);
  if (!state.workSeconds[state.selectedDate]) delete state.workSeconds[state.selectedDate];
  saveState();
  renderTimer();
  renderHistory();
}

function saveCurrentPreset() {
  const counts = state.entries[state.selectedDate] || {};
  if (!Object.values(counts).some(value => value > 0)) {
    showToast("Dieser Tag enthält noch keine Aufträge.");
    return;
  }
  const title = prompt("Name der Vorlage:", `Vorlage ${state.presets.length + 1}`)?.trim();
  if (!title) return;
  state.presets.push({ id: crypto.randomUUID(), title: title.slice(0, 40), counts: { ...counts } });
  saveState();
  renderPresets();
  renderPresetManagement();
  showToast("Schnellvorlage gespeichert");
}

function applyPreset(preset) {
  for (const [categoryId, count] of Object.entries(preset.counts)) {
    setCount(state.selectedDate, categoryId, countFor(state.selectedDate, categoryId) + count);
  }
  showToast(`${preset.title} übernommen`);
}

function addPlannedTask(event) {
  event.preventDefault();
  const title = document.querySelector("#task-title").value.trim() || "ÖSD-Auftrag";
  const categoryID = document.querySelector("#task-category").value;
  const count = Math.max(1, Math.floor(Number(document.querySelector("#task-count").value) || 1));
  const dueDateKey = document.querySelector("#task-due").value || state.selectedDate;
  state.tasks.push({ id: crypto.randomUUID(), title: title.slice(0, 80), categoryID, count, dueDateKey, isCompleted: false, createdAt: new Date().toISOString() });
  saveState();
  event.target.reset();
  document.querySelector("#task-count").value = "1";
  document.querySelector("#task-due").value = state.selectedDate;
  renderTasks();
  showToast("Auftrag vorgemerkt");
}

function applyTask(task) {
  setCount(state.selectedDate, task.categoryID, countFor(state.selectedDate, task.categoryID) + task.count);
  task.isCompleted = true;
  saveState();
  renderTasks();
  showToast("Auftrag übernommen und erledigt");
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter(task => task.id !== taskId);
  saveState();
  renderTasks();
}

function nextInvoiceNumber() {
  const numbers = state.invoices.map(item => Number(String(item.number).replace(/\D/g, "")) || 0);
  const configured = Number(String(state.invoiceProfile.number).replace(/\D/g, "")) || 1;
  return String(Math.max(configured, (Math.max(0, ...numbers) || 0) + 1));
}

function archiveInvoice(monthDate, quiet = false) {
  const key = monthKey(monthDate);
  const totals = totalsForMonth(monthDate);
  if (!totals.count) {
    if (!quiet) showToast("Dieser Monat enthält keine Aufträge.");
    return null;
  }
  let record = state.invoices.find(item => item.monthKey === key);
  if (record) {
    if (record.status === "draft") Object.assign(record, { totalCents: totals.cents, totalCount: totals.count });
  } else {
    record = { id: crypto.randomUUID(), monthKey: key, number: nextInvoiceNumber(), status: "draft", totalCents: totals.cents, totalCount: totals.count, createdAt: new Date().toISOString(), sentAt: null, paidAt: null };
    state.invoices.push(record);
    state.invoices.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }
  saveState();
  renderInvoiceArchive();
  if (!quiet) showToast("Monat als Rechnungsentwurf archiviert");
  return record;
}

function updateInvoiceStatus(record, status) {
  record.status = status;
  if (status === "sent" && !record.sentAt) record.sentAt = new Date().toISOString();
  if (status === "paid" && !record.paidAt) record.paidAt = new Date().toISOString();
  saveState();
  renderInvoiceArchive();
}

function ensureMonthlyArchives() {
  const current = monthKey(new Date());
  const past = [...new Set(Object.keys(state.entries).map(date => date.slice(0, 7)).filter(key => key < current))];
  for (const key of past) {
    if (!state.invoices.some(item => item.monthKey === key)) archiveInvoice(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 12), true);
  }
}

function portableBackup() {
  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    rates: state.rates,
    entries: state.entries,
    entryRates: state.entryRates,
    invoiceProfile: state.invoiceProfile,
    workSeconds: state.workSeconds,
    tasks: state.tasks,
    presets: state.presets,
    invoices: state.invoices,
    preferences: state.preferences
  };
}

function applyImportedBackup(imported, preserveSync = true) {
  const nextState = defaultState();
  nextState.entries = sanitizeEntries(imported.entries);
  for (const category of categories) {
    const rate = Number(imported.rates?.[category.id]);
    if (Number.isFinite(rate) && rate >= 0) nextState.rates[category.id] = Math.round(rate);
  }
  nextState.entryRates = sanitizeEntryRates(imported.entryRates, nextState.entries, nextState.rates);
  nextState.invoiceProfile = sanitizeInvoiceProfile(imported.invoiceProfile);
  nextState.workSeconds = sanitizeWorkSeconds(imported.workSeconds);
  nextState.tasks = sanitizeTasks(imported.tasks);
  nextState.presets = sanitizePresets(imported.presets);
  nextState.invoices = sanitizeInvoices(imported.invoices);
  nextState.preferences = {
    theme: ["system", "light", "dark"].includes(imported.preferences?.theme) ? imported.preferences.theme : state.preferences.theme,
    hideAmounts: imported.preferences?.hideAmounts === true
  };
  nextState.selectedDate = state.selectedDate;
  if (preserveSync) nextState.sync = state.sync;
  suppressAutoSync = true;
  state = nextState;
  saveState();
  suppressAutoSync = false;
  ensureMonthlyArchives();
  renderAll();
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { cells.push(value); value = ""; }
    else value += character;
  }
  cells.push(value);
  return cells.map(cell => cell.trim().replace(/^"|"$/g, ""));
}

function normalizedImportDate(value) {
  const clean = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
}

function importCSVText(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return 0;
  const delimiter = lines[0].includes(";") ? ";" : ",";
  let imported = 0;
  lines.forEach((line, index) => {
    const cells = parseDelimitedLine(line, delimiter);
    if (index === 0 && cells[0]?.toLowerCase().includes("datum")) return;
    const date = normalizedImportDate(cells[0] || "");
    const categoryText = String(cells[1] || "").toLowerCase();
    const category = categories.find(item => [item.id, item.title, item.invoiceLevel].map(value => value.toLowerCase()).includes(categoryText));
    const count = Math.floor(Number(cells[2]));
    if (!date || !category || !Number.isFinite(count) || count <= 0) return;
    const rateValue = Number(String(cells[3] || "").replace("€", "").trim().replace(".", "").replace(",", "."));
    if (!state.entries[date]) state.entries[date] = {};
    if (!state.entryRates[date]) state.entryRates[date] = {};
    state.entries[date][category.id] = (state.entries[date][category.id] || 0) + count;
    if (state.entryRates[date][category.id] === undefined) state.entryRates[date][category.id] = Number.isFinite(rateValue) && rateValue >= 0 ? Math.round(rateValue * 100) : rateFor(category.id);
    imported += 1;
  });
  if (imported) { saveState(); ensureMonthlyArchives(); renderAll(); }
  return imported;
}

function cloudHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.sync.token) headers.Authorization = `Bearer ${state.sync.token}`;
  return headers;
}

async function uploadCloudBackup(quiet = false) {
  if (!state.sync.url) {
    if (!quiet) showToast("Bitte zuerst eine private Sync-Adresse eintragen.");
    return;
  }
  try {
    const response = await fetch(state.sync.url, { method: "PUT", headers: cloudHeaders(), body: JSON.stringify(portableBackup()) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.sync.lastSync = new Date().toISOString();
    suppressAutoSync = true; saveState(); suppressAutoSync = false;
    renderSyncStatus();
    if (!quiet) showToast("Cloud-Sicherung aktualisiert");
  } catch {
    if (!quiet) showToast("Cloud-Abgleich fehlgeschlagen. Adresse, Token und CORS prüfen.");
  }
}

async function downloadCloudBackup() {
  if (!state.sync.url) return showToast("Bitte zuerst eine private Sync-Adresse eintragen.");
  try {
    const response = await fetch(state.sync.url, { method: "GET", headers: cloudHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const imported = await response.json();
    if (!confirm("Lokale Daten durch die Cloud-Sicherung ersetzen?")) return;
    applyImportedBackup(imported, true);
    state.sync.lastSync = new Date().toISOString();
    suppressAutoSync = true; saveState(); suppressAutoSync = false;
    showToast("Cloud-Sicherung geladen");
  } catch {
    showToast("Cloud-Sicherung konnte nicht geladen werden.");
  }
}

function invoicePeriod(monthDate) {
  const dates = [...new Set(rowsForMonth(monthDate).map(row => row.date))].sort();
  if (dates.length) return { first: dates[0], last: dates[dates.length - 1] };
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  return {
    first: dayKey(new Date(year, month, 1, 12)),
    last: dayKey(new Date(year, month + 1, 0, 12))
  };
}

function plainEuro(cents) {
  return new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function numericDate(key) {
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(dateFromKey(key));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeWithBreaks(value) {
  return escapeHTML(value).replaceAll("\n", "<br>");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function invoiceActivity(row) {
  return `Bewertung (retour am ${numericDate(row.date)}) à ${plainEuro(row.rateCents)} €`;
}

function buildExcelCSV() {
  const rows = rowsForMonth(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  const lines = [
    ["Datum", "Tätigkeit", "Stufe + Modul", "Anzahl", "Einheitshonorar EUR", "Betrag EUR"]
  ];
  for (const row of rows) {
    lines.push([
      numericDate(row.date),
      invoiceActivity(row),
      row.category.invoiceLevel,
      row.count,
      plainEuro(row.rateCents),
      plainEuro(row.amountCents)
    ]);
  }
  lines.push(["", "Gesamt brutto", "", totals.count, "", plainEuro(totals.cents)]);
  return `\uFEFF${lines.map(line => line.map(csvCell).join(";")).join("\r\n")}`;
}

function buildWordDocument() {
  const rows = rowsForMonth(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  const profile = state.invoiceProfile;
  const invoiceNumber = state.invoices.find(item => item.monthKey === monthKey(invoiceMonth))?.number || profile.number || "1";
  const period = invoicePeriod(invoiceMonth);
  const year = invoiceMonth.getFullYear();
  const created = numericDate(dayKey(new Date()));
  const tableRows = rows.length ? rows.map((row, index) => `
    <tr${index === 0 || rows[index - 1].date !== row.date ? ' class="new-day"' : ""}>
      <td>${escapeHTML(invoiceActivity(row))}</td>
      <td>${escapeHTML(row.category.invoiceLevel)}</td>
      <td class="number">${row.count}</td>
      <td class="money">${plainEuro(row.amountCents)}</td>
    </tr>`).join("") : `<tr><td colspan="4">Keine Aufträge in diesem Monat.</td></tr>`;
  const bankRows = [
    profile.bank ? `<p><b>Bank:</b> ${escapeHTML(profile.bank)}</p>` : "",
    profile.iban ? `<p><b>IBAN:</b> ${escapeHTML(profile.iban)}</p>` : "",
    profile.bic ? `<p><b>BIC:</b> ${escapeHTML(profile.bic)}</p>` : ""
  ].join("");
  const senderLine = [profile.senderName, String(profile.senderAddress || "").replaceAll("\n", " · ")].filter(Boolean).map(escapeHTML).join(" · ");
  const dueDate = new Date(Date.now() + Math.max(0, Number(profile.paymentDueDays) || 0) * 86400000);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Honorarnote ${escapeHTML(invoiceNumber)}/${year}</title>
  <style>
    @page { size: A4; margin: 20mm; } body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #111; }
    .sender { font-size: 9pt; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 2mm; margin-bottom: 8mm; }
    .recipient { margin-bottom: 27mm; } .date { text-align: right; margin-bottom: 18mm; } h1 { text-align: center; font-size: 22pt; margin: 0 0 14mm; }
    table { width: 100%; border-collapse: collapse; margin: 8mm 0; } th, td { border: 1px solid #333; padding: 7px; vertical-align: top; } th { text-align: left; }
    th:nth-child(1) { width: 50%; } th:nth-child(2) { width: 18%; } th:nth-child(3) { width: 10%; } th:nth-child(4) { width: 22%; text-align: right; }
    td.number { text-align: center; } td.money { text-align: right; } tr.new-day td { border-top-width: 2px; } tfoot th { font-weight: bold; } .bank { margin-top: 10mm; }
    .signature { margin-top: 18mm; width: 60%; border-bottom: 1px dotted #111; padding-bottom: 4px; } .signature-label { font-size: 9pt; }
  </style></head><body>
    ${senderLine ? `<div class="sender">${senderLine}</div>` : ""}
    <div class="recipient"><b>${escapeHTML(profile.recipient)}</b><br>${escapeWithBreaks(profile.recipientAddress)}</div>
    <div class="date">${escapeHTML(profile.city || "Wien")}, ${created}</div>
    <h1>Honorarnote &nbsp; ${escapeHTML(invoiceNumber)} / ${year}</h1>
    <p>Für meine Tätigkeit vom <u>${numericDate(period.first)}</u> bis <u>${numericDate(period.last)}</u> erlaube ich mir, folgenden Betrag in Rechnung zu stellen:</p>
    <table><thead><tr><th>Tätigkeit</th><th>Stufe + Modul</th><th>Anzahl</th><th>EUR</th></tr></thead><tbody>${tableRows}</tbody>
      <tfoot><tr><th colspan="3">Gesamt brutto</th><th style="text-align:right">${plainEuro(totals.cents)}</th></tr></tfoot></table>
    <p>Detailaufstellung und Belege liegen bei.</p>
    ${bankRows ? `<div class="bank"><p>Ich ersuche höflich um Überweisung auf das nachfolgende Konto:</p>${bankRows}</div>` : ""}
    <p><b>Zahlungsziel:</b> ${numericDate(dayKey(dueDate))}</p>
    ${profile.taxNote ? `<p>${escapeWithBreaks(profile.taxNote)}</p>` : ""}
    <div class="signature">${escapeHTML(profile.senderName)}</div><div class="signature-label">Name &amp; Unterschrift</div>
  </body></html>`;
}

function monthlyReportFiles() {
  const suffix = monthKey(invoiceMonth);
  const wordBlob = new Blob(["\uFEFF", buildWordDocument()], { type: "application/msword;charset=utf-8" });
  const excelBlob = new Blob([buildExcelCSV()], { type: "text/csv;charset=utf-8" });
  return {
    wordBlob,
    excelBlob,
    wordFile: new File([wordBlob], `Honorarabrechnung-${suffix}.doc`, { type: "application/msword" }),
    excelFile: new File([excelBlob], `Honorarabrechnung-${suffix}.csv`, { type: "text/csv" })
  };
}

function setCount(date, categoryId, nextCount) {
  const safeCount = Math.max(0, Math.floor(nextCount));
  const previousCount = countFor(date, categoryId);
  if (!state.entries[date]) state.entries[date] = {};
  if (!state.entryRates) state.entryRates = {};
  if (!state.entryRates[date]) state.entryRates[date] = {};
  if (safeCount === 0) {
    delete state.entries[date][categoryId];
    delete state.entryRates[date][categoryId];
  } else {
    state.entries[date][categoryId] = safeCount;
    if (previousCount === 0 || state.entryRates[date][categoryId] === undefined) {
      state.entryRates[date][categoryId] = rateFor(categoryId);
    }
  }
  if (!Object.keys(state.entries[date]).length) {
    delete state.entries[date];
    delete state.entryRates[date];
  }
  saveState();
  renderWorkday();
  renderCalendar();
  renderHistory();
  renderCalculatorDay();
  renderInvoice();
}

function renderAll() {
  renderCalendar();
  renderWorkday();
  renderHistory();
  renderRates();
  renderCalculatorDay();
  renderInvoice();
  renderInvoiceProfile();
  renderPreferences();
  renderTimer();
  renderPresets();
  renderTasks();
  renderInvoiceArchive();
  renderPresetManagement();
  renderSyncSettings();
}

function renderCalendar() {
  const title = document.querySelector("#calendar-title");
  const grid = document.querySelector("#calendar-grid");
  title.textContent = monthFormatter.format(visibleMonth);
  grid.replaceChildren();

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const leadingEmptyDays = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const numberOfDays = new Date(year, month + 1, 0, 12).getDate();

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-empty";
    grid.append(empty);
  }

  const today = dayKey(new Date());
  for (let day = 1; day <= numberOfDays; day += 1) {
    const date = new Date(year, month, day, 12);
    const key = dayKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (key === today) button.classList.add("today");
    if (key === state.selectedDate) button.classList.add("selected");
    if (totalsFor(key).count > 0) button.classList.add("has-work");
    button.textContent = String(day);
    button.setAttribute("aria-label", dayFormatter.format(date));
    if (key === state.selectedDate) button.setAttribute("aria-current", "date");
    button.addEventListener("click", () => selectDate(key));
    grid.append(button);
  }
}

function selectDate(key) {
  state.selectedDate = key;
  const selected = dateFromKey(key);
  visibleMonth = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  saveState();
  renderCalendar();
  renderWorkday();
  renderTimer();
  renderTasks();
}

function renderWorkday() {
  const totals = totalsFor(state.selectedDate);
  document.querySelector("#today-earnings").textContent = euroFormatter.format(totals.cents / 100);
  document.querySelector("#today-count").textContent = String(totals.count);
  document.querySelector("#selected-date-label").textContent = shortDayFormatter.format(dateFromKey(state.selectedDate));
  renderMonthReminder();

  const list = document.querySelector("#counter-list");
  list.replaceChildren();
  for (const category of categories) {
    const count = countFor(state.selectedDate, category.id);
    const effectiveRate = rateForEntry(state.selectedDate, category.id);
    const card = document.createElement("article");
    card.className = `counter-card card${count ? " has-count" : ""}`;
    card.style.cssText = `--accent:${category.accent};--accent-rgb:${category.accentRGB}`;
    card.innerHTML = `
      <div class="counter-main">
        <span class="category-icon" aria-hidden="true"><svg><use href="#${category.icon}"></use></svg></span>
        <div class="counter-info">
          <div class="counter-title"><h3>${category.title}</h3><span class="rate-badge">${euroFormatter.format(effectiveRate / 100)}</span></div>
          <p>${category.detail}</p>
          ${count ? `<p class="subtotal">${euroFormatter.format(count * effectiveRate / 100)}</p>` : ""}
        </div>
      </div>
      <div class="stepper">
        <button type="button" class="decrease" aria-label="${category.title}: einen Auftrag entfernen" ${count === 0 ? "disabled" : ""}>−</button>
        <strong>${count}</strong>
        <button type="button" class="increase" aria-label="${category.title}: einen Auftrag hinzufügen">+</button>
      </div>`;
    card.querySelector(".decrease").addEventListener("click", () => setCount(state.selectedDate, category.id, count - 1));
    card.querySelector(".increase").addEventListener("click", () => setCount(state.selectedDate, category.id, count + 1));
    list.append(card);
  }
}

function renderTimer() {
  const seconds = workedSecondsFor(state.selectedDate);
  const running = state.activeTimer?.date === state.selectedDate;
  const hourly = seconds > 0 ? Math.round(totalsFor(state.selectedDate).cents * 3600 / seconds) : null;
  document.querySelector("#timer-display").textContent = formatDuration(seconds, true);
  document.querySelector("#timer-hourly").textContent = hourly === null
    ? "Starte den Timer oder ergänze Minuten."
    : `${euroFormatter.format(hourly / 100)} pro Stunde`;
  const toggle = document.querySelector("#timer-toggle");
  toggle.textContent = running ? "Timer stoppen" : "Timer starten";
  toggle.classList.toggle("danger", running);
  document.querySelector("#timer-minus").disabled = seconds < 900 || running;
}

function renderPresets() {
  const list = document.querySelector("#preset-list");
  list.replaceChildren();
  if (!state.presets.length) {
    list.innerHTML = "<p>Erfasse einen typischen Arbeitstag und speichere ihn als Vorlage.</p>";
    return;
  }
  for (const preset of state.presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-chip";
    button.innerHTML = `<strong>${escapeHTML(preset.title)}</strong><span>${Object.values(preset.counts).reduce((sum, value) => sum + value, 0)} Aufträge</span>`;
    button.addEventListener("click", () => applyPreset(preset));
    list.append(button);
  }
}

function renderPresetManagement() {
  const list = document.querySelector("#preset-management");
  list.replaceChildren();
  if (!state.presets.length) {
    list.innerHTML = "<p>Noch keine Schnellvorlagen gespeichert.</p>";
    return;
  }
  for (const preset of state.presets) {
    const row = document.createElement("div");
    row.className = "management-row";
    row.innerHTML = `<span><strong>${escapeHTML(preset.title)}</strong><small>${Object.values(preset.counts).reduce((sum, value) => sum + value, 0)} Aufträge</small></span><button type="button" aria-label="${escapeHTML(preset.title)} löschen">Löschen</button>`;
    row.querySelector("button").addEventListener("click", () => {
      state.presets = state.presets.filter(item => item.id !== preset.id);
      saveState(); renderPresets(); renderPresetManagement();
    });
    list.append(row);
  }
}

function renderTasks() {
  const categorySelect = document.querySelector("#task-category");
  if (!categorySelect.options?.length) {
    categorySelect.innerHTML = categories.map(category => `<option value="${category.id}">${category.title}</option>`).join("");
  }
  const due = document.querySelector("#task-due");
  if (!due.value) due.value = state.selectedDate;
  const tasks = state.tasks.filter(task => !task.isCompleted).sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey));
  document.querySelector("#task-open-count").textContent = `${tasks.length} offen`;
  const list = document.querySelector("#task-list");
  list.replaceChildren();
  if (!tasks.length) {
    list.innerHTML = "<p class=\"share-hint\">Keine offenen Aufträge. Neue Lieferungen kannst du unten mit Frist vormerken.</p>";
    return;
  }
  for (const task of tasks) {
    const category = categories.find(item => item.id === task.categoryID);
    const row = document.createElement("div");
    row.className = `task-row${task.dueDateKey < dayKey(new Date()) ? " overdue" : ""}`;
    row.innerHTML = `<div><strong>${escapeHTML(task.title)}</strong><span>${task.count} × ${escapeHTML(category?.title || task.categoryID)} · fällig ${numericDate(task.dueDateKey)}</span></div><div><button class="task-apply" type="button">Übernehmen</button><button class="task-delete" type="button" aria-label="Auftrag löschen">×</button></div>`;
    row.querySelector(".task-apply").addEventListener("click", () => applyTask(task));
    row.querySelector(".task-delete").addEventListener("click", () => deleteTask(task.id));
    list.append(row);
  }
}

function renderHistory() {
  const keys = Object.keys(state.entries).filter(key => totalsFor(key).count > 0).sort().reverse();
  const grandTotal = keys.reduce((sum, key) => {
    const totals = totalsFor(key);
    sum.count += totals.count;
    sum.cents += totals.cents;
    return sum;
  }, { count: 0, cents: 0 });
  document.querySelector("#history-total-count").textContent = String(grandTotal.count);
  document.querySelector("#history-total-earnings").textContent = euroFormatter.format(grandTotal.cents / 100);
  renderDashboard(keys);

  const list = document.querySelector("#history-list");
  list.replaceChildren();
  if (!keys.length) {
    list.innerHTML = `<div class="empty-state card"><strong>Noch keine Einträge</strong>Deine ausgefüllten Arbeitstage erscheinen hier automatisch.</div>`;
    return;
  }

  for (const key of keys) {
    const totals = totalsFor(key);
    const details = document.createElement("details");
    details.className = "history-item card";
    const rows = categories
      .filter(category => countFor(key, category.id) > 0)
      .map(category => {
        const count = countFor(key, category.id);
        const rate = rateForEntry(key, category.id);
        return `<div class="history-detail-row"><span>${category.title}</span><span>${count} × ${euroFormatter.format(rate / 100)} = ${euroFormatter.format(count * rate / 100)}</span></div>`;
      }).join("");
    details.innerHTML = `
      <summary class="history-summary">
        <div><h3>${dayFormatter.format(dateFromKey(key))}</h3><p>${totals.count} Aufträge</p></div>
        <strong>${euroFormatter.format(totals.cents / 100)}</strong>
      </summary>
      <div class="history-details">${rows}</div>`;
    list.append(details);
  }
}

function renderDashboard(keys) {
  const favorite = document.querySelector("#history-favorite");
  const chart = document.querySelector("#history-chart");
  const categoryTotals = categories.map(category => ({
    category,
    count: keys.reduce((sum, key) => sum + countFor(key, category.id), 0)
  })).sort((left, right) => right.count - left.count);
  const winner = categoryTotals[0];
  favorite.innerHTML = winner?.count
    ? `<span class="category-icon" style="--accent:${winner.category.accent};--accent-rgb:${winner.category.accentRGB}"><svg><use href="#${winner.category.icon}"></use></svg></span><div><small>Am häufigsten</small><strong>${winner.category.title}</strong><span>${winner.count} Aufträge</span></div>`
    : `<p>Noch keine Statistik verfügbar.</p>`;

  const months = [...new Set(keys.map(key => key.slice(0, 7)))].sort().slice(-6);
  const values = months.map(key => ({
    key,
    label: new Intl.DateTimeFormat("de-AT", { month: "short" }).format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 12)),
    cents: keys.filter(date => date.startsWith(`${key}-`)).reduce((sum, date) => sum + totalsFor(date).cents, 0)
  }));
  const maximum = Math.max(1, ...values.map(value => value.cents));
  chart.innerHTML = values.length
    ? `<div class="chart-title"><strong>Verdienst</strong><span>letzte ${values.length} Monate</span></div><div class="chart-bars">${values.map(value => `<div class="chart-column" title="${value.label}: ${euroFormatter.format(value.cents / 100)}"><span>${euroFormatter.format(value.cents / 100)}</span><i style="height:${Math.max(8, value.cents / maximum * 100)}%"></i><small>${value.label}</small></div>`).join("")}</div>`
    : "";

  const totalSeconds = Object.values(state.workSeconds || {}).reduce((sum, value) => sum + value, 0);
  const allCents = keys.reduce((sum, key) => sum + totalsFor(key).cents, 0);
  document.querySelector("#history-work-time").textContent = formatDuration(totalSeconds);
  document.querySelector("#history-day-average").textContent = euroFormatter.format((keys.length ? allCents / keys.length : 0) / 100);
  document.querySelector("#history-hourly-rate").textContent = totalSeconds > 0 ? euroFormatter.format((allCents * 3600 / totalSeconds) / 100) : "–";
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  const previousMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1, 12);
  const currentValue = totalsForMonth(currentMonth).cents;
  const previousValue = totalsForMonth(previousMonth).cents;
  const change = previousValue > 0 ? Math.round((currentValue - previousValue) / previousValue * 100) : currentValue > 0 ? 100 : null;
  document.querySelector("#history-month-change").textContent = change === null ? "–" : `${change >= 0 ? "+" : ""}${change} %`;

  const categoryChart = document.querySelector("#category-chart");
  const categoryMaximum = Math.max(1, ...categoryTotals.map(item => item.count));
  categoryChart.innerHTML = categoryTotals.filter(item => item.count > 0).map(item => `<div class="category-bar"><span>${item.category.title}</span><i><b style="width:${item.count / categoryMaximum * 100}%;background:${item.category.accent}"></b></i><strong>${item.count}</strong></div>`).join("") || "<p>Noch keine Aufträge.</p>";
}

function renderMonthReminder() {
  const reminder = document.querySelector("#month-reminder");
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const totals = totalsForMonth(currentMonth);
  const shouldShow = now.getDate() >= 25 && totals.count > 0;
  reminder.hidden = !shouldShow;
  if (shouldShow) {
    document.querySelector("#month-reminder-text").textContent = `${totals.count} Aufträge und ${euroFormatter.format(totals.cents / 100)} sind bereit für die Abrechnung.`;
  }
}

function copyLatestWorkday() {
  const source = Object.keys(state.entries)
    .filter(key => key !== state.selectedDate && totalsFor(key).count > 0)
    .sort()
    .reverse()[0];
  if (!source) {
    showToast("Noch kein früherer Arbeitstag zum Kopieren vorhanden.");
    return;
  }
  state.entries[state.selectedDate] = { ...state.entries[source] };
  state.entryRates[state.selectedDate] = { ...(state.entryRates[source] || {}) };
  saveState();
  renderAll();
  haptic("success");
  showToast("Letzten Arbeitstag übernommen");
}

function renderPreferences() {
  const preferences = state.preferences || { theme: "system", hideAmounts: false };
  document.querySelector("#theme-select").value = preferences.theme;
  document.querySelector("#privacy-values").checked = preferences.hideAmounts;
  if (document.documentElement) document.documentElement.dataset.theme = preferences.theme;
  document.body.classList.toggle("privacy-values", preferences.hideAmounts);
  const themeColor = preferences.theme === "dark" ? "#09121f" : "#073b66";
  document.querySelector('meta[name="theme-color"]').content = themeColor;
}

function renderSyncSettings() {
  document.querySelector("#sync-url").value = state.sync.url || "";
  document.querySelector("#sync-token").value = state.sync.token || "";
  document.querySelector("#sync-auto").checked = state.sync.auto === true;
  renderSyncStatus();
}

function renderSyncStatus() {
  const status = document.querySelector("#sync-status");
  if (!state.sync.lastSync) {
    status.textContent = "Noch nicht synchronisiert. Token und Daten bleiben lokal in diesem Browser.";
    return;
  }
  const date = new Date(state.sync.lastSync);
  status.textContent = `Letzter erfolgreicher Abgleich: ${date.toLocaleString("de-AT")}`;
}

function renderInvoice() {
  const rows = rowsForMonth(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  document.querySelector("#invoice-month-label").textContent = monthFormatter.format(invoiceMonth);
  document.querySelector("#invoice-total-count").textContent = String(totals.count);
  document.querySelector("#invoice-total-earnings").textContent = euroFormatter.format(totals.cents / 100);
  document.querySelector("#invoice-table-total").textContent = plainEuro(totals.cents);

  const body = document.querySelector("#invoice-table-body");
  body.replaceChildren();
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index === 0 || rows[index - 1].date !== row.date) tr.classList.add("new-day");
    const values = [invoiceActivity(row), row.category.invoiceLevel, String(row.count), plainEuro(row.amountCents)];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  });
  document.querySelector("#invoice-empty").hidden = rows.length > 0;
  document.querySelector(".invoice-table-wrap").hidden = rows.length === 0;
  renderInvoiceArchive();
}

function renderInvoiceArchive() {
  const current = state.invoices.find(item => item.monthKey === monthKey(invoiceMonth));
  const status = document.querySelector("#invoice-status");
  status.disabled = !current;
  status.value = current?.status || "draft";
  document.querySelector("#archive-invoice").textContent = current ? `Honorarnote ${current.number} aktualisieren` : "Monat archivieren";
  const list = document.querySelector("#invoice-archive-list");
  list.replaceChildren();
  if (!state.invoices.length) {
    list.innerHTML = "<p class=\"share-hint\">Noch keine Monatsabrechnung archiviert.</p>";
    return;
  }
  const titles = { draft: "Entwurf", sent: "Versendet", paid: "Bezahlt" };
  for (const record of state.invoices.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = `archive-row status-${record.status}`;
    const date = new Date(Number(record.monthKey.slice(0, 4)), Number(record.monthKey.slice(5, 7)) - 1, 1, 12);
    row.innerHTML = `<span><i></i><strong>${monthFormatter.format(date)}</strong><small>Nr. ${escapeHTML(record.number)} · ${record.totalCount} Aufträge</small></span><span><em>${titles[record.status]}</em><b>${euroFormatter.format(record.totalCents / 100)}</b></span>`;
    list.append(row);
  }
}

function renderInvoiceProfile() {
  const fieldMap = {
    number: "#invoice-number",
    email: "#invoice-email",
    recipient: "#invoice-recipient",
    recipientAddress: "#invoice-recipient-address",
    senderName: "#invoice-sender-name",
    senderAddress: "#invoice-sender-address",
    city: "#invoice-city",
    bank: "#invoice-bank",
    iban: "#invoice-iban",
    bic: "#invoice-bic",
    taxNote: "#invoice-tax-note",
    paymentDueDays: "#invoice-payment-days"
  };
  for (const [key, selector] of Object.entries(fieldMap)) {
    document.querySelector(selector).value = state.invoiceProfile[key] ?? "";
  }
}

function renderRates() {
  const list = document.querySelector("#rate-list");
  list.replaceChildren();
  for (const category of categories) {
    const row = document.createElement("label");
    row.className = "rate-row";
    row.innerHTML = `
      <span><strong>${category.title}</strong><small>${category.detail}</small></span>
      <span class="rate-input-wrap"><input type="text" inputmode="decimal" value="${(rateFor(category.id) / 100).toFixed(2).replace(".", ",")}" aria-label="Honorar für ${category.title}"><span>€</span></span>`;
    const input = row.querySelector("input");
    input.addEventListener("input", () => {
      const value = Number(input.value.trim().replace(",", "."));
      if (!Number.isFinite(value) || value < 0) return;
      state.rates[category.id] = Math.round(value * 100);
      saveState();
      renderWorkday();
      renderHistory();
      renderCalculatorDay();
      renderInvoice();
    });
    input.addEventListener("blur", () => {
      const value = Number(input.value.trim().replace(",", "."));
      if (!Number.isFinite(value) || value < 0) {
        input.value = (rateFor(category.id) / 100).toFixed(2).replace(".", ",");
        showToast("Bitte einen gültigen positiven Betrag eingeben.");
        return;
      }
      input.value = (rateFor(category.id) / 100).toFixed(2).replace(".", ",");
      haptic("success");
      showToast("Honorar gespeichert");
    });
    list.append(row);
  }
}

function switchPage(target) {
  document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.dataset.page === target));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.target === target));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (target === "history") renderHistory();
  if (target === "calculator") renderCalculatorDay();
  if (target === "invoice") renderInvoice();
}

document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => switchPage(item.dataset.target)));
document.querySelector("#copy-last-day").addEventListener("click", copyLatestWorkday);
document.querySelector("#timer-toggle").addEventListener("click", toggleTimer);
document.querySelector("#timer-plus").addEventListener("click", () => addWorkMinutes(15));
document.querySelector("#timer-minus").addEventListener("click", () => addWorkMinutes(-15));
document.querySelector("#save-preset").addEventListener("click", saveCurrentPreset);
document.querySelector("#task-form").addEventListener("submit", addPlannedTask);
document.querySelector("#archive-invoice").addEventListener("click", () => archiveInvoice(invoiceMonth));
document.querySelector("#invoice-status").addEventListener("change", event => {
  const record = state.invoices.find(item => item.monthKey === monthKey(invoiceMonth));
  if (record) updateInvoiceStatus(record, event.target.value);
});
document.querySelector("#previous-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1, 12);
  renderCalendar();
});
document.querySelector("#next-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1, 12);
  renderCalendar();
});
document.querySelector("#calendar-today").addEventListener("click", () => selectDate(dayKey(new Date())));
document.querySelector("#invoice-previous-month").addEventListener("click", () => {
  invoiceMonth = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() - 1, 1, 12);
  renderInvoice();
});
document.querySelector("#invoice-next-month").addEventListener("click", () => {
  invoiceMonth = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 1, 12);
  renderInvoice();
});

const invoiceFieldMap = {
  number: "#invoice-number",
  email: "#invoice-email",
  recipient: "#invoice-recipient",
  recipientAddress: "#invoice-recipient-address",
  senderName: "#invoice-sender-name",
  senderAddress: "#invoice-sender-address",
  city: "#invoice-city",
  bank: "#invoice-bank",
  iban: "#invoice-iban",
  bic: "#invoice-bic",
  taxNote: "#invoice-tax-note",
  paymentDueDays: "#invoice-payment-days"
};
for (const [key, selector] of Object.entries(invoiceFieldMap)) {
  document.querySelector(selector).addEventListener("input", event => {
    state.invoiceProfile[key] = key === "paymentDueDays"
      ? Math.max(0, Math.min(90, Math.round(Number(event.target.value) || 0)))
      : event.target.value.slice(0, 300);
    saveState();
  });
}

document.querySelector("#theme-select").addEventListener("change", event => {
  state.preferences.theme = event.target.value;
  saveState();
  renderPreferences();
});
document.querySelector("#privacy-values").addEventListener("change", event => {
  state.preferences.hideAmounts = event.target.checked;
  saveState();
  renderPreferences();
});
document.querySelector("#sync-url").addEventListener("change", event => {
  state.sync.url = event.target.value.trim().slice(0, 500);
  saveState();
});
document.querySelector("#sync-token").addEventListener("change", event => {
  state.sync.token = event.target.value.slice(0, 500);
  saveState();
});
document.querySelector("#sync-auto").addEventListener("change", event => {
  state.sync.auto = event.target.checked;
  saveState();
  if (state.sync.auto) uploadCloudBackup(false);
});
document.querySelector("#sync-upload").addEventListener("click", () => uploadCloudBackup(false));
document.querySelector("#sync-download").addEventListener("click", downloadCloudBackup);

document.querySelector("#reset-rates").addEventListener("click", () => {
  if (!confirm("Alle Honorare auf die sechs Vertragspreise zurücksetzen?")) return;
  state.rates = Object.fromEntries(categories.map(category => [category.id, category.defaultRate]));
  saveState();
  renderAll();
  showToast("Vertragspreise wiederhergestellt");
});

document.querySelector("#export-data").addEventListener("click", () => {
  const exportObject = portableBackup();
  const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `OSD-Korrektur-Sicherung-${dayKey(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Datensicherung erstellt");
});

document.querySelector("#import-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!confirm("Aktuelle Daten durch diese Sicherung ersetzen?")) return;
    applyImportedBackup(imported, true);
    showToast("Datensicherung wiederhergestellt");
  } catch {
    showToast("Diese Sicherungsdatei ist ungültig.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#csv-import-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = importCSVText(await file.text());
    showToast(imported ? `${imported} CSV-Zeilen importiert` : "Keine gültigen CSV-Zeilen gefunden");
  } catch {
    showToast("CSV-Datei konnte nicht gelesen werden.");
  } finally {
    event.target.value = "";
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

document.querySelector("#download-word").addEventListener("click", () => {
  archiveInvoice(invoiceMonth, true);
  const files = monthlyReportFiles();
  downloadBlob(files.wordBlob, files.wordFile.name);
  showToast("Word-Abrechnung erstellt");
});

document.querySelector("#download-excel").addEventListener("click", () => {
  archiveInvoice(invoiceMonth, true);
  const files = monthlyReportFiles();
  downloadBlob(files.excelBlob, files.excelFile.name);
  showToast("Excel-Liste erstellt");
});

document.querySelector("#print-pdf").addEventListener("click", () => {
  archiveInvoice(invoiceMonth, true);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("PDF-Fenster wurde blockiert. Bitte Pop-ups erlauben.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildWordDocument());
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 450);
});

document.querySelector("#share-invoice").addEventListener("click", async () => {
  const archivedRecord = archiveInvoice(invoiceMonth, true);
  const files = monthlyReportFiles();
  const monthName = monthFormatter.format(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  const subject = `Honorarnote ${archivedRecord?.number || state.invoiceProfile.number || "1"}/${invoiceMonth.getFullYear()} – ${monthName}`;
  const message = `Guten Tag,\n\nim Anhang sende ich meine Honorarabrechnung für ${monthName}. Gesamt brutto: ${euroFormatter.format(totals.cents / 100)}.\n\nMit freundlichen Grüßen\n${state.invoiceProfile.senderName}`;
  const shareFiles = [files.wordFile, files.excelFile];

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: shareFiles }))) {
      await navigator.share({ title: subject, text: message, files: shareFiles });
      if (archivedRecord) updateInvoiceStatus(archivedRecord, "sent");
      showToast("Abrechnung zum Teilen bereitgestellt");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }

  downloadBlob(files.wordBlob, files.wordFile.name);
  downloadBlob(files.excelBlob, files.excelFile.name);
  const recipient = encodeURIComponent(state.invoiceProfile.email.trim());
  window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\nDie beiden gespeicherten Dateien bitte als Anhang hinzufügen.`)}`;
  showToast("Dateien gespeichert – bitte in Mail anhängen");
});

// Calculator
let calculatorDisplay = "0";
let calculatorStoredValue = null;
let calculatorOperation = null;
let calculatorStartsNewNumber = true;
const calculatorDateInput = document.querySelector("#calculator-date");
calculatorDateInput.value = dayKey(new Date());

const operations = {
  add: { symbol: "+", run: (left, right) => left + right },
  subtract: { symbol: "−", run: (left, right) => left - right },
  multiply: { symbol: "×", run: (left, right) => left * right },
  divide: { symbol: "÷", run: (left, right) => right === 0 ? NaN : left / right }
};

const calculatorKeys = [
  { label: "AC", action: "clear", style: "utility" },
  { label: "±", action: "sign", style: "utility" },
  { label: "%", action: "percent", style: "utility" },
  { label: "÷", action: "operation", value: "divide", style: "operation" },
  { label: "7", action: "digit" }, { label: "8", action: "digit" }, { label: "9", action: "digit" },
  { label: "×", action: "operation", value: "multiply", style: "operation" },
  { label: "4", action: "digit" }, { label: "5", action: "digit" }, { label: "6", action: "digit" },
  { label: "−", action: "operation", value: "subtract", style: "operation" },
  { label: "1", action: "digit" }, { label: "2", action: "digit" }, { label: "3", action: "digit" },
  { label: "+", action: "operation", value: "add", style: "operation" },
  { label: "0", action: "digit", style: "zero" },
  { label: ",", action: "decimal" },
  { label: "=", action: "equals", style: "equals" }
];

function buildCalculator() {
  const grid = document.querySelector("#calculator-grid");
  for (const key of calculatorKeys) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calculator-key ${key.style || ""}`;
    button.textContent = key.label;
    button.dataset.action = key.action;
    button.dataset.value = key.value || key.label;
    button.addEventListener("click", handleCalculatorKey);
    grid.append(button);
  }
}

function handleCalculatorKey(event) {
  const { action, value } = event.currentTarget.dataset;
  if (action === "digit") calculatorInputDigit(value);
  if (action === "decimal") calculatorInputDecimal();
  if (action === "operation") calculatorChooseOperation(value);
  if (action === "equals") calculatorEquals();
  if (action === "clear") calculatorClear();
  if (action === "sign") calculatorApply(value => -value);
  if (action === "percent") calculatorApply(value => value / 100);
  renderCalculatorDisplay();
}

function calculatorNumber() {
  const number = Number(calculatorDisplay.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function calculatorInputDigit(digit) {
  if (calculatorDisplay === "Fehler" || calculatorStartsNewNumber) {
    calculatorDisplay = digit;
    calculatorStartsNewNumber = false;
  } else if (calculatorDisplay.length < 14) {
    calculatorDisplay = calculatorDisplay === "0" ? digit : calculatorDisplay + digit;
  }
}

function calculatorInputDecimal() {
  if (calculatorDisplay === "Fehler" || calculatorStartsNewNumber) {
    calculatorDisplay = "0,";
    calculatorStartsNewNumber = false;
  } else if (!calculatorDisplay.includes(",")) calculatorDisplay += ",";
}

function calculatorChooseOperation(operation) {
  if (calculatorOperation && !calculatorStartsNewNumber) calculatorEquals();
  calculatorStoredValue = calculatorNumber();
  calculatorOperation = operation;
  calculatorStartsNewNumber = true;
}

function calculatorEquals() {
  const right = calculatorNumber();
  if (calculatorStoredValue === null || right === null || !calculatorOperation) return;
  const result = operations[calculatorOperation].run(calculatorStoredValue, right);
  if (!Number.isFinite(result)) {
    calculatorDisplay = "Fehler";
  } else calculatorDisplay = formatCalculatorNumber(result);
  calculatorStoredValue = null;
  calculatorOperation = null;
  calculatorStartsNewNumber = true;
}

function calculatorClear() {
  calculatorDisplay = "0";
  calculatorStoredValue = null;
  calculatorOperation = null;
  calculatorStartsNewNumber = true;
}

function calculatorApply(transform) {
  const value = calculatorNumber();
  if (value === null) return;
  calculatorDisplay = formatCalculatorNumber(transform(value));
  calculatorStartsNewNumber = true;
}

function formatCalculatorNumber(value) {
  return new Intl.NumberFormat("de-AT", { useGrouping: false, maximumFractionDigits: 8 }).format(value);
}

function renderCalculatorDisplay() {
  document.querySelector("#calculator-display").textContent = calculatorDisplay;
  document.querySelector("#calculator-operation").textContent = calculatorOperation ? operations[calculatorOperation].symbol : "\u00a0";
  document.querySelectorAll(".calculator-key.operation").forEach(button => {
    button.classList.toggle("selected-operation", calculatorStartsNewNumber && button.dataset.value === calculatorOperation);
  });
}

function renderCalculatorDay() {
  const key = calculatorDateInput.value || dayKey(new Date());
  const totals = totalsFor(key);
  document.querySelector("#calculator-day-count").textContent = String(totals.count);
  document.querySelector("#calculator-day-earnings").textContent = euroFormatter.format(totals.cents / 100);
}

calculatorDateInput.addEventListener("change", renderCalculatorDay);
document.querySelector("#use-day-earnings").addEventListener("click", () => {
  const totals = totalsFor(calculatorDateInput.value || dayKey(new Date()));
  calculatorDisplay = formatCalculatorNumber(totals.cents / 100);
  calculatorStoredValue = null;
  calculatorOperation = null;
  calculatorStartsNewNumber = true;
  renderCalculatorDisplay();
  showToast("Tagesverdienst übernommen");
});

// Installation and offline support
const installDialog = document.querySelector("#install-dialog");
document.querySelector("#install-help-button").addEventListener("click", () => installDialog.showModal());
document.querySelector("#close-install-dialog").addEventListener("click", () => installDialog.close());
installDialog.addEventListener("click", event => {
  if (event.target === installDialog) installDialog.close();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#native-install-button").hidden = false;
});

document.querySelector("#native-install-button").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installDialog.close();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {
    showToast("Offline-Modus konnte noch nicht aktiviert werden.");
  }));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

buildCalculator();
renderCalculatorDisplay();
ensureMonthlyArchives();
renderAll();
if (typeof window.setInterval === "function") {
  window.setInterval(() => {
    if (state.activeTimer) renderTimer();
  }, 1000);
}

const launchAction = typeof URLSearchParams === "function" ? new URLSearchParams(window.location.search || "").get("action") : null;
if (launchAction === "add-a1") {
  setCount(state.selectedDate, "a1-writing", countFor(state.selectedDate, "a1-writing") + 1);
  showToast("1 A1-Auftrag hinzugefügt");
}
