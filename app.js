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
const accountStorageKey = "fdn-osd-account-v1";
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
    extensions: defaultExtensions(),
    sync: { url: "", token: "", auto: false, lastSync: "" },
    lastModified: new Date().toISOString(),
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
    fresh.extensions = sanitizeExtensions(saved.extensions);
    for (const date of Object.keys(fresh.entries)) {
      if (!fresh.extensions.entryClients[date]) fresh.extensions.entryClients[date] = "osd";
    }
    fresh.sync = sanitizeSync(saved.sync);
    if (!Number.isNaN(Date.parse(saved.lastModified || ""))) fresh.lastModified = saved.lastModified;
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.selectedDate || "")) fresh.selectedDate = saved.selectedDate;
    fresh.invoiceProfile = sanitizeInvoiceProfile(saved.invoiceProfile);
    if (["system", "light", "dark"].includes(saved.preferences?.theme)) fresh.preferences.theme = saved.preferences.theme;
    fresh.preferences.hideAmounts = saved.preferences?.hideAmounts === true;
    return fresh;
  } catch {
    return defaultState();
  }
}

function defaultExtensions() {
  return {
    attachments: [],
    autoMonthClose: true,
    autoEmail: false,
    lastEmailedMonth: "",
    deadlineNotifications: false,
    accent: "ocean",
    fontScale: "normal",
    compactHome: false,
    year: new Date().getFullYear(),
    clients: [{ id: "osd", name: "Österreichisches Sprachdiplom Deutsch", shortName: "ÖSD", email: "", address: "Hörlgasse 12\n1090 Wien", invoicePrefix: "ÖSD", rateOverrides: {} }],
    entryClients: {},
    taxReservePercent: 25,
    dailyTargetCount: 20,
    onboardingCompleted: false,
    lastLocalRestorePoint: "",
    weeklyTargetCount: 80,
    monthlyRevenueTargetCents: 150000,
    dailyNotes: {},
    closedDayKeys: [],
    auditEvents: []
  };
}

function sanitizeExtensions(value) {
  const clean = defaultExtensions();
  if (!value || typeof value !== "object") return clean;
  clean.attachments = Array.isArray(value.attachments) ? value.attachments.map(item => {
    const type = String(item?.type || item?.mimeType || "application/octet-stream").slice(0, 100);
    const dataURL = typeof item?.dataURL === "string" ? item.dataURL : typeof item?.dataBase64 === "string" ? `data:${type};base64,${item.dataBase64}` : "";
    return { ...item, type, dataURL };
  }).filter(item =>
    item && /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey || "") && item.dataURL.length <= 2_200_000
  ).slice(-30).map(item => ({
    id: String(item.id || crypto.randomUUID()),
    dateKey: item.dateKey,
    name: String(item.name || "Beleg").slice(0, 120),
    type: String(item.type || "application/octet-stream").slice(0, 100),
    dataURL: item.dataURL,
    createdAt: String(item.createdAt || new Date().toISOString())
  })) : [];
  clean.autoMonthClose = value.autoMonthClose !== false;
  clean.autoEmail = value.autoEmail === true;
  clean.lastEmailedMonth = /^\d{4}-\d{2}$/.test(value.lastEmailedMonth || "") ? value.lastEmailedMonth : "";
  clean.deadlineNotifications = value.deadlineNotifications === true;
  clean.accent = ["ocean", "violet", "coral", "forest"].includes(value.accent) ? value.accent : "ocean";
  clean.fontScale = ["normal", "large", "xlarge"].includes(value.fontScale) ? value.fontScale : "normal";
  clean.compactHome = value.compactHome === true;
  clean.year = Math.max(2020, Math.min(2100, Math.round(Number(value.year) || new Date().getFullYear())));
  const clients = Array.isArray(value.clients) ? value.clients.slice(0, 20).map(item => ({
    id: String(item?.id || crypto.randomUUID()).slice(0, 100),
    name: String(item?.name || "Auftraggeber").slice(0, 120),
    shortName: String(item?.shortName || item?.name || "Kunde").slice(0, 24),
    email: String(item?.email || "").slice(0, 200),
    address: String(item?.address || "").slice(0, 300),
    invoicePrefix: String(item?.invoicePrefix || "HN").slice(0, 12),
    rateOverrides: Object.fromEntries(categories.flatMap(category => {
      const rate = Number(item?.rateOverrides?.[category.id]);
      return Number.isFinite(rate) && rate >= 0 ? [[category.id, Math.round(rate)]] : [];
    }))
  })) : [];
  if (!clients.some(item => item.id === "osd")) clients.unshift(defaultExtensions().clients[0]);
  clean.clients = clients;
  const validClientIDs = new Set(clients.map(item => item.id));
  clean.entryClients = {};
  if (value.entryClients && typeof value.entryClients === "object") {
    for (const [date, clientID] of Object.entries(value.entryClients)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && validClientIDs.has(clientID)) clean.entryClients[date] = clientID;
    }
  }
  clean.taxReservePercent = Math.max(0, Math.min(60, Math.round(Number(value.taxReservePercent ?? 25))));
  clean.dailyTargetCount = Math.max(1, Math.min(999, Math.round(Number(value.dailyTargetCount) || 20)));
  clean.onboardingCompleted = value.onboardingCompleted === true;
  clean.lastLocalRestorePoint = !Number.isNaN(Date.parse(value.lastLocalRestorePoint || "")) ? value.lastLocalRestorePoint : "";
  clean.weeklyTargetCount = Math.max(1, Math.min(4999, Math.round(Number(value.weeklyTargetCount) || 80)));
  clean.monthlyRevenueTargetCents = Math.max(0, Math.min(100000000, Math.round(Number(value.monthlyRevenueTargetCents) || 150000)));
  clean.dailyNotes = {};
  if (value.dailyNotes && typeof value.dailyNotes === "object") {
    for (const [date, note] of Object.entries(value.dailyNotes)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof note === "string" && note.trim()) clean.dailyNotes[date] = note.trim().slice(0, 1000);
    }
  }
  clean.closedDayKeys = Array.isArray(value.closedDayKeys)
    ? [...new Set(value.closedDayKeys.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(-1500)
    : [];
  clean.auditEvents = sanitizeAuditEvents(value.auditEvents);
  return clean;
}

function sanitizeAuditEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.filter(event => event && !Number.isNaN(Date.parse(event.timestamp || "")) && String(event.title || "").trim())
    .slice(-250)
    .map(event => ({
      id: String(event.id || crypto.randomUUID()).slice(0, 100),
      timestamp: String(event.timestamp),
      kind: String(event.kind || "change").slice(0, 30),
      title: String(event.title).slice(0, 120),
      detail: String(event.detail || "").slice(0, 300),
      clientID: typeof event.clientID === "string" ? event.clientID.slice(0, 100) : null
    }));
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
      createdAt: String(task.createdAt || new Date().toISOString()),
      clientID: typeof task.clientID === "string" ? task.clientID.slice(0, 100) : "osd",
      estimatedMinutes: Number.isFinite(Number(task.estimatedMinutes)) ? Math.max(1, Math.round(Number(task.estimatedMinutes))) : null
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
    paidAt: item.paidAt || null,
    clientID: typeof item.clientID === "string" ? item.clientID.slice(0, 100) : null
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

function defaultAccount() {
  return {
    serviceUrl: "",
    anonKey: "",
    auto: true,
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    user: null,
    lastRemoteUpdatedAt: "",
    lastSync: "",
    status: ""
  };
}

function loadAccount() {
  try {
    const saved = JSON.parse(localStorage.getItem(accountStorageKey));
    const clean = defaultAccount();
    if (!saved || typeof saved !== "object") return clean;
    clean.serviceUrl = typeof saved.serviceUrl === "string" ? saved.serviceUrl.slice(0, 500).replace(/\/$/, "") : "";
    clean.anonKey = typeof saved.anonKey === "string" ? saved.anonKey.slice(0, 1000) : "";
    clean.auto = saved.auto !== false;
    clean.accessToken = typeof saved.accessToken === "string" ? saved.accessToken : "";
    clean.refreshToken = typeof saved.refreshToken === "string" ? saved.refreshToken : "";
    clean.expiresAt = Number(saved.expiresAt) || 0;
    if (saved.user && typeof saved.user.id === "string") {
      clean.user = {
        id: saved.user.id.slice(0, 100),
        email: String(saved.user.email || "Apple-/Google-Konto").slice(0, 200),
        provider: ["apple", "google", "email"].includes(saved.user.provider) ? saved.user.provider : "account"
      };
    }
    clean.lastRemoteUpdatedAt = typeof saved.lastRemoteUpdatedAt === "string" ? saved.lastRemoteUpdatedAt : "";
    clean.lastSync = typeof saved.lastSync === "string" ? saved.lastSync : "";
    clean.status = typeof saved.status === "string" ? saved.status.slice(0, 240) : "";
    return clean;
  } catch {
    return defaultAccount();
  }
}

function saveAccount() {
  try {
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
  } catch {
    showToast("Kontoeinstellungen konnten nicht gespeichert werden.");
  }
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
let account = loadAccount();
let visibleMonth = new Date(dateFromKey(state.selectedDate).getFullYear(), dateFromKey(state.selectedDate).getMonth(), 1, 12);
let invoiceMonth = new Date(visibleMonth);
let invoiceClientFilter = "all";
let toastTimer;
let deferredInstallPrompt = null;
let cloudSyncTimer;
let accountSyncTimer;
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

function saveState(touch = true) {
  if (touch) state.lastModified = new Date().toISOString();
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    showToast("Speichern nicht möglich. Bitte Safari-Speicher prüfen.");
  }
  if (!suppressAutoSync && state.sync?.auto && state.sync?.url) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => uploadCloudBackup(true), 1400);
  }
  if (!suppressAutoSync && account.auto && account.user?.id) {
    clearTimeout(accountSyncTimer);
    accountSyncTimer = setTimeout(() => uploadAccountBackup(true), 1600);
  }
}

function recordAudit(kind, title, detail = "", clientID = null) {
  if (!state.extensions) state.extensions = defaultExtensions();
  if (!Array.isArray(state.extensions.auditEvents)) state.extensions.auditEvents = [];
  state.extensions.auditEvents.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    kind: String(kind || "change").slice(0, 30),
    title: String(title || "Änderung").slice(0, 120),
    detail: String(detail || "").slice(0, 300),
    clientID: typeof clientID === "string" ? clientID : null
  });
  state.extensions.auditEvents = state.extensions.auditEvents.slice(-250);
}

function rateFor(categoryId) {
  return state.rates[categoryId] ?? categories.find(category => category.id === categoryId)?.defaultRate ?? 0;
}

function clientForDate(date) {
  const clients = state.extensions?.clients || defaultExtensions().clients;
  const clientID = state.extensions?.entryClients?.[date] || "osd";
  return clients.find(client => client.id === clientID) || clients[0];
}

function rateForNewEntry(date, categoryId) {
  return clientForDate(date)?.rateOverrides?.[categoryId] ?? rateFor(categoryId);
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
    const clientID = state.extensions?.entryClients?.[date] || "osd";
    if (invoiceClientFilter !== "all" && clientID !== invoiceClientFilter) continue;
    for (const category of categories) {
      const count = countFor(date, category.id);
      if (count <= 0) continue;
      rows.push({
        date,
        category,
        count,
        rateCents: rateForEntry(date, category.id),
        amountCents: count * rateForEntry(date, category.id),
        clientID,
        client: state.extensions?.clients?.find(item => item.id === clientID) || defaultExtensions().clients[0]
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
    if (state.extensions.closedDayKeys.includes(state.selectedDate)) {
      showToast("Dieser Arbeitstag ist abgeschlossen. Öffne ihn zuerst wieder.");
      return;
    }
    if (state.activeTimer) stopActiveTimer();
    state.activeTimer = { date: state.selectedDate, startedAt: Date.now() };
    saveState();
  }
  renderTimer();
  haptic("medium");
}

function addWorkMinutes(minutes) {
  if (state.extensions.closedDayKeys.includes(state.selectedDate)) {
    showToast("Dieser Arbeitstag ist abgeschlossen. Öffne ihn zuerst wieder.");
    return;
  }
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
  const estimatedMinutes = Math.max(5, Math.min(1440, Math.round(Number(document.querySelector("#task-estimate").value) || 30)));
  state.tasks.push({ id: crypto.randomUUID(), title: title.slice(0, 80), categoryID, count, dueDateKey, isCompleted: false, createdAt: new Date().toISOString(), clientID: clientForDate(state.selectedDate).id, estimatedMinutes });
  saveState();
  event.target.reset();
  document.querySelector("#task-count").value = "1";
  document.querySelector("#task-estimate").value = "30";
  document.querySelector("#task-due").value = state.selectedDate;
  renderTasks();
  renderWorkday();
  showToast("Auftrag vorgemerkt");
}

function applyTask(task) {
  if (state.extensions?.clients?.some(client => client.id === task.clientID)) {
    state.extensions.entryClients[state.selectedDate] = task.clientID;
  }
  setCount(state.selectedDate, task.categoryID, countFor(state.selectedDate, task.categoryID) + task.count);
  task.isCompleted = true;
  saveState();
  renderTasks();
  renderWorkday();
  showToast("Auftrag übernommen und erledigt");
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter(task => task.id !== taskId);
  saveState();
  renderTasks();
  renderWorkday();
}

function nextInvoiceNumber() {
  const numbers = state.invoices.map(item => Number(String(item.number).replace(/\D/g, "")) || 0);
  const configured = Number(String(state.invoiceProfile.number).replace(/\D/g, "")) || 1;
  return String(Math.max(configured, (Math.max(0, ...numbers) || 0) + 1));
}

function currentInvoiceClientID() {
  return invoiceClientFilter === "all" ? null : invoiceClientFilter;
}

function invoiceRecordFor(monthDate, clientID = currentInvoiceClientID()) {
  const normalizedClientID = clientID || null;
  return state.invoices.find(item => item.monthKey === monthKey(monthDate) && (item.clientID || null) === normalizedClientID);
}

function archiveInvoice(monthDate, quiet = false) {
  const key = monthKey(monthDate);
  const clientID = currentInvoiceClientID();
  const totals = totalsForMonth(monthDate);
  if (!totals.count) {
    if (!quiet) showToast("Dieser Monat enthält keine Aufträge.");
    return null;
  }
  let record = invoiceRecordFor(monthDate, clientID);
  if (record) {
    if (record.status === "draft") Object.assign(record, { totalCents: totals.cents, totalCount: totals.count });
  } else {
    const client = clientID ? state.extensions.clients.find(item => item.id === clientID) : null;
    const baseNumber = nextInvoiceNumber();
    record = { id: crypto.randomUUID(), monthKey: key, number: client ? `${client.invoicePrefix || "HN"}-${baseNumber}` : baseNumber, status: "draft", totalCents: totals.cents, totalCount: totals.count, createdAt: new Date().toISOString(), sentAt: null, paidAt: null, clientID };
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
  if (state.extensions?.autoMonthClose === false) return;
  const current = monthKey(new Date());
  const past = [...new Set(Object.keys(state.entries).map(date => date.slice(0, 7)).filter(key => key < current))];
  for (const key of past) {
    if (!state.invoices.some(item => item.monthKey === key)) archiveInvoice(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 12), true);
  }
}

function portableBackup() {
  return {
    version: 9,
    exportedAt: new Date().toISOString(),
    modifiedAt: state.lastModified,
    rates: state.rates,
    entries: state.entries,
    entryRates: state.entryRates,
    invoiceProfile: state.invoiceProfile,
    workSeconds: state.workSeconds,
    tasks: state.tasks,
    presets: state.presets,
    invoices: state.invoices,
    extensions: state.extensions,
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
  nextState.extensions = sanitizeExtensions(imported.extensions);
  for (const date of Object.keys(nextState.entries)) {
    if (!nextState.extensions.entryClients[date]) nextState.extensions.entryClients[date] = "osd";
  }
  nextState.lastModified = !Number.isNaN(Date.parse(imported.modifiedAt || imported.exportedAt || ""))
    ? (imported.modifiedAt || imported.exportedAt)
    : new Date().toISOString();
  nextState.preferences = {
    theme: ["system", "light", "dark"].includes(imported.preferences?.theme) ? imported.preferences.theme : state.preferences.theme,
    hideAmounts: imported.preferences?.hideAmounts === true
  };
  nextState.selectedDate = state.selectedDate;
  if (preserveSync) nextState.sync = state.sync;
  suppressAutoSync = true;
  state = nextState;
  recordAudit("import", "Sicherung eingelesen", `Format v${Number(imported.version) || 1}`);
  saveState(false);
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
    if (!state.extensions.entryClients[date]) state.extensions.entryClients[date] = "osd";
    imported += 1;
  });
  if (imported) {
    recordAudit("import", "CSV importiert", `${imported} Zeile(n)`);
    saveState(); ensureMonthlyArchives(); renderAll();
  }
  return imported;
}

function validAccountConfiguration() {
  try {
    const url = new URL(account.serviceUrl);
    return url.protocol === "https:" && account.anonKey.length >= 20;
  } catch {
    return false;
  }
}

function accountEndpoint(path) {
  return `${account.serviceUrl.replace(/\/$/, "")}${path}`;
}

function accountProviderTitle(provider) {
  return provider === "apple" ? "Apple-ID" : provider === "google" ? "Google" : "Cloud-Konto";
}

function applyAccountSession(session, fallbackProvider = "account") {
  account.accessToken = String(session.access_token || "");
  account.refreshToken = String(session.refresh_token || account.refreshToken || "");
  account.expiresAt = Date.now() + Math.max(60, Number(session.expires_in) || 3600) * 1000;
  if (session.user?.id) {
    account.user = {
      id: String(session.user.id),
      email: String(session.user.email || "Apple-/Google-Konto"),
      provider: String(session.user.app_metadata?.provider || fallbackProvider)
    };
  }
  saveAccount();
}

async function ensureAccountToken() {
  if (account.accessToken && account.expiresAt > Date.now() + 60_000) return account.accessToken;
  if (!validAccountConfiguration() || !account.refreshToken) throw new Error("not-signed-in");
  const response = await fetch(accountEndpoint("/auth/v1/token?grant_type=refresh_token"), {
    method: "POST",
    headers: { apikey: account.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: account.refreshToken })
  });
  if (!response.ok) {
    clearAccountSession();
    throw new Error("session-expired");
  }
  applyAccountSession(await response.json(), account.user?.provider);
  return account.accessToken;
}

async function loadAccountUser() {
  const token = await ensureAccountToken();
  const response = await fetch(accountEndpoint("/auth/v1/user"), {
    headers: { apikey: account.anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("user-unavailable");
  const user = await response.json();
  account.user = {
    id: String(user.id),
    email: String(user.email || "Apple-/Google-Konto"),
    provider: String(user.app_metadata?.provider || account.user?.provider || "account")
  };
  saveAccount();
  return account.user;
}

function beginAccountLogin(provider) {
  account.serviceUrl = document.querySelector("#account-service-url").value.trim().replace(/\/$/, "").slice(0, 500);
  account.anonKey = document.querySelector("#account-anon-key").value.trim().slice(0, 1000);
  saveAccount();
  if (!validAccountConfiguration()) {
    document.querySelector(".account-setup").open = true;
    showToast("Bitte zuerst Cloud-Projektadresse und öffentlichen App-Schlüssel eintragen.");
    return;
  }
  sessionStorage.setItem("fdn-osd-auth-provider", provider);
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const url = new URL(accountEndpoint("/auth/v1/authorize"));
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
  window.location.assign(url.toString());
}

async function handleAccountCallback() {
  if (!window.location.hash.includes("access_token=") && !window.location.hash.includes("error_description=")) return false;
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const authError = parameters.get("error_description");
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  if (authError) {
    account.status = `Anmeldung abgebrochen: ${authError}`;
    saveAccount();
    renderAccountSettings();
    return true;
  }
  const provider = sessionStorage.getItem("fdn-osd-auth-provider") || "account";
  applyAccountSession({
    access_token: parameters.get("access_token"),
    refresh_token: parameters.get("refresh_token"),
    expires_in: parameters.get("expires_in")
  }, provider);
  await loadAccountUser();
  await initialAccountSync();
  return true;
}

function clearAccountSession() {
  account.accessToken = "";
  account.refreshToken = "";
  account.expiresAt = 0;
  account.user = null;
  account.lastRemoteUpdatedAt = "";
  account.lastSync = "";
  account.status = "Abgemeldet. Deine lokalen Daten bleiben auf diesem Gerät.";
  saveAccount();
  renderAccountSettings();
}

async function signOutAccount() {
  try {
    if (account.accessToken && validAccountConfiguration()) {
      await fetch(accountEndpoint("/auth/v1/logout"), {
        method: "POST",
        headers: { apikey: account.anonKey, Authorization: `Bearer ${account.accessToken}` }
      });
    }
  } catch {
    // Lokales Abmelden muss auch ohne Netzwerk funktionieren.
  }
  clearAccountSession();
  showToast("Du wurdest abgemeldet");
}

async function accountFetch(path, options = {}) {
  const token = await ensureAccountToken();
  const headers = {
    apikey: account.anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  return fetch(accountEndpoint(path), { ...options, headers, cache: "no-store" });
}

async function fetchAccountBackup() {
  if (!account.user?.id) throw new Error("not-signed-in");
  const query = new URLSearchParams({ select: "payload,updated_at", user_id: `eq.${account.user.id}`, limit: "1" });
  const response = await accountFetch(`/rest/v1/fdn_backups?${query}`);
  if (!response.ok) throw new Error(`backup-read-${response.status}`);
  return (await response.json())[0] || null;
}

function localHasMeaningfulData() {
  const defaults = defaultState();
  return Object.keys(state.entries).length > 0
    || Object.keys(state.workSeconds).length > 0
    || state.tasks.length > 0
    || state.presets.length > 0
    || state.invoices.length > 0
    || Object.keys(state.extensions.dailyNotes || {}).length > 0
    || (state.extensions.closedDayKeys || []).length > 0
    || state.extensions.weeklyTargetCount !== defaults.extensions.weeklyTargetCount
    || state.extensions.monthlyRevenueTargetCents !== defaults.extensions.monthlyRevenueTargetCents
    || JSON.stringify(state.rates) !== JSON.stringify(defaults.rates)
    || JSON.stringify(state.invoiceProfile) !== JSON.stringify(defaults.invoiceProfile);
}

function backupFingerprint(backup) {
  return JSON.stringify({
    rates: backup.rates,
    entries: backup.entries,
    entryRates: backup.entryRates,
    invoiceProfile: backup.invoiceProfile,
    workSeconds: backup.workSeconds,
    tasks: backup.tasks,
    presets: backup.presets,
    invoices: backup.invoices,
    preferences: backup.preferences,
    extensions: backup.extensions
  });
}

async function uploadAccountBackup(quiet = false, force = false) {
  if (!account.user?.id) {
    if (!quiet) showToast("Bitte zuerst mit Apple oder Google anmelden.");
    return false;
  }
  try {
    const remote = await fetchAccountBackup();
    const remoteBackup = remote ? await decodeCloudPayload(remote.payload) : null;
    const localBackup = portableBackup();
    const changedElsewhere = remote && (!account.lastRemoteUpdatedAt || remote.updated_at !== account.lastRemoteUpdatedAt)
      && backupFingerprint(remoteBackup) !== backupFingerprint(localBackup);
    if (changedElsewhere && !force) {
      account.status = "Cloud-Daten wurden auf einem anderen Gerät geändert. Bitte zuerst laden oder das Überschreiben bestätigen.";
      saveAccount();
      renderAccountSettings();
      if (quiet) return false;
      if (!confirm("In der Cloud liegen andere oder neuere Daten. Wirklich mit den lokalen Daten überschreiben?")) return false;
      return uploadAccountBackup(false, true);
    }
    const updatedAt = new Date().toISOString();
    const response = await accountFetch("/rest/v1/fdn_backups?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: account.user.id, payload: await encodeCloudPayload(localBackup), updated_at: updatedAt })
    });
    if (!response.ok) throw new Error(`backup-write-${response.status}`);
    const row = (await response.json())[0];
    account.lastRemoteUpdatedAt = row?.updated_at || updatedAt;
    account.lastSync = new Date().toISOString();
    account.status = "Alle Änderungen wurden sicher im Konto gespeichert.";
    saveAccount();
    renderAccountSettings();
    if (!quiet) showToast("Kontodaten sicher gespeichert");
    return true;
  } catch (error) {
    account.status = error.message === "session-expired"
      ? "Die Anmeldung ist abgelaufen. Bitte erneut anmelden."
      : "Kontosynchronisierung fehlgeschlagen. Cloud-Einrichtung und Verbindung prüfen.";
    saveAccount();
    renderAccountSettings();
    if (!quiet) showToast(account.status);
    return false;
  }
}

async function downloadAccountBackup(skipConfirmation = false) {
  if (!account.user?.id) return showToast("Bitte zuerst mit Apple oder Google anmelden.");
  try {
    const remote = await fetchAccountBackup();
    if (!remote) return showToast("Für dieses Konto gibt es noch keine Sicherung.");
    if (!skipConfirmation && localHasMeaningfulData() && !confirm("Lokale Daten durch die vollständige Kontosicherung ersetzen?")) return;
    const decoded = await decodeCloudPayload(remote.payload);
    suppressAutoSync = true;
    applyImportedBackup(decoded, true);
    suppressAutoSync = false;
    account.lastRemoteUpdatedAt = remote.updated_at;
    account.lastSync = new Date().toISOString();
    account.status = "Die vollständigen Kontodaten wurden unversehrt geladen.";
    saveAccount();
    renderAccountSettings();
    showToast("Kontodaten wiederhergestellt");
  } catch {
    suppressAutoSync = false;
    account.status = "Kontodaten konnten nicht geladen werden.";
    saveAccount();
    renderAccountSettings();
    showToast(account.status);
  }
}

async function initialAccountSync() {
  const remote = await fetchAccountBackup();
  if (!remote) {
    await uploadAccountBackup(false, true);
    return;
  }
  account.lastRemoteUpdatedAt = remote.updated_at;
  const remoteBackup = await decodeCloudPayload(remote.payload);
  if (!localHasMeaningfulData() || backupFingerprint(remoteBackup) === backupFingerprint(portableBackup())) {
    suppressAutoSync = true;
    applyImportedBackup(remoteBackup, true);
    suppressAutoSync = false;
    account.lastSync = new Date().toISOString();
    account.status = "Angemeldet – deine vollständigen Daten wurden automatisch geladen.";
    saveAccount();
    renderAccountSettings();
    return;
  }
  if (confirm("Auf diesem Gerät und in der Cloud liegen unterschiedliche Daten. Möchtest du jetzt die Cloud-Daten laden? Deine lokalen Daten werden nur nach deiner Bestätigung ersetzt.")) {
    await downloadAccountBackup(true);
  } else {
    account.status = "Angemeldet. Lokale Daten wurden nicht verändert; entscheide über Laden oder Sichern.";
    saveAccount();
    renderAccountSettings();
  }
}

async function handleAccountStartup() {
  try {
    if (await handleAccountCallback()) return;
    if (!account.accessToken || !validAccountConfiguration()) return;
    await loadAccountUser();
    renderAccountSettings();
  } catch {
    account.status = "Die Kontositzung konnte nicht wiederhergestellt werden. Bitte erneut anmelden.";
    saveAccount();
    renderAccountSettings();
  }
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
    const response = await fetch(state.sync.url, { method: "PUT", headers: cloudHeaders(), body: JSON.stringify(await encodeCloudPayload(portableBackup())) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.sync.lastSync = new Date().toISOString();
    suppressAutoSync = true; saveState(false); suppressAutoSync = false;
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
    const imported = await decodeCloudPayload(await response.json());
    if (!confirm("Lokale Daten durch die Cloud-Sicherung ersetzen?")) return;
    applyImportedBackup(imported, true);
    state.sync.lastSync = new Date().toISOString();
    suppressAutoSync = true; saveState(false); suppressAutoSync = false;
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
    ["Datum", "Auftraggeber", "Tätigkeit", "Stufe + Modul", "Anzahl", "Einheitshonorar EUR", "Betrag EUR"]
  ];
  for (const row of rows) {
    lines.push([
      numericDate(row.date),
      row.client?.name || "ÖSD",
      invoiceActivity(row),
      row.category.invoiceLevel,
      row.count,
      plainEuro(row.rateCents),
      plainEuro(row.amountCents)
    ]);
  }
  lines.push(["", "", "Gesamt brutto", "", totals.count, "", plainEuro(totals.cents)]);
  return `\uFEFF${lines.map(line => line.map(csvCell).join(";")).join("\r\n")}`;
}

function buildWordDocument() {
  const rows = rowsForMonth(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  const selectedClient = invoiceClientFilter === "all" ? null : state.extensions?.clients?.find(item => item.id === invoiceClientFilter);
  const profile = selectedClient ? {
    ...state.invoiceProfile,
    recipient: selectedClient.name,
    recipientAddress: selectedClient.address,
    email: selectedClient.email || state.invoiceProfile.email
  } : state.invoiceProfile;
  const archived = invoiceRecordFor(invoiceMonth);
  const invoiceNumber = archived?.number || (selectedClient ? `${selectedClient.invoicePrefix || "HN"}-${profile.number || "1"}` : profile.number || "1");
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
      state.entryRates[date][categoryId] = rateForNewEntry(date, categoryId);
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
  renderAccountSettings();
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
    row.innerHTML = `<div><strong>${escapeHTML(task.title)}</strong><span>${task.count} × ${escapeHTML(category?.title || task.categoryID)} · ${task.estimatedMinutes || Math.round(task.count * 6)} Min. · fällig ${numericDate(task.dueDateKey)}</span></div><div><button class="task-apply" type="button">Übernehmen</button><button class="task-delete" type="button" aria-label="Auftrag löschen">×</button></div>`;
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
  state.extensions.entryClients[state.selectedDate] = state.extensions.entryClients[source] || "osd";
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

function renderAccountSettings() {
  const signedIn = Boolean(account.user?.id && account.accessToken);
  document.querySelector("#account-service-url").value = account.serviceUrl || "";
  document.querySelector("#account-anon-key").value = account.anonKey || "";
  document.querySelector("#account-auto").checked = account.auto !== false;
  document.querySelector("#account-signed-out").hidden = signedIn;
  document.querySelector("#account-signed-in").hidden = !signedIn;
  document.querySelector("#account-upload").disabled = !signedIn;
  document.querySelector("#account-download").disabled = !signedIn;
  document.querySelector("#account-auto").disabled = !signedIn;
  if (signedIn) {
    document.querySelector("#account-email").textContent = account.user.email;
    document.querySelector("#account-provider").textContent = `Angemeldet mit ${accountProviderTitle(account.user.provider)}`;
    document.querySelector("#account-avatar").textContent = (account.user.email || "A").slice(0, 1).toUpperCase();
  }
  const status = document.querySelector("#account-status");
  status.classList.remove("is-success", "is-warning");
  if (account.status) {
    status.textContent = account.status;
    status.classList.add(account.status.includes("sicher") || account.status.includes("vollständig") || account.status.includes("automatisch") ? "is-success" : "is-warning");
  } else if (signedIn && account.lastSync) {
    status.textContent = `Letzter Kontenabgleich: ${new Date(account.lastSync).toLocaleString("de-AT")}`;
    status.classList.add("is-success");
  } else {
    status.textContent = signedIn ? "Angemeldet. Noch keine Kontosicherung vorhanden." : "Noch nicht angemeldet. Deine lokalen Daten bleiben unverändert.";
  }
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
  const current = invoiceRecordFor(invoiceMonth);
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
    const client = record.clientID ? state.extensions.clients.find(item => item.id === record.clientID) : null;
    row.innerHTML = `<span><i></i><strong>${monthFormatter.format(date)}${client ? ` · ${escapeHTML(client.shortName)}` : ""}</strong><small>Nr. ${escapeHTML(record.number)} · ${record.totalCount} Aufträge</small></span><span><em>${titles[record.status]}</em><b>${euroFormatter.format(record.totalCents / 100)}</b></span>`;
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
  const record = invoiceRecordFor(invoiceMonth);
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
document.querySelector("#account-login-apple").addEventListener("click", () => beginAccountLogin("apple"));
document.querySelector("#account-login-google").addEventListener("click", () => beginAccountLogin("google"));
document.querySelector("#account-logout").addEventListener("click", signOutAccount);
document.querySelector("#account-upload").addEventListener("click", () => uploadAccountBackup(false));
document.querySelector("#account-download").addEventListener("click", () => downloadAccountBackup(false));
document.querySelector("#account-auto").addEventListener("change", event => {
  account.auto = event.target.checked;
  saveAccount();
  renderAccountSettings();
  if (account.auto && account.user?.id) uploadAccountBackup(false);
});
for (const [selector, key] of [["#account-service-url", "serviceUrl"], ["#account-anon-key", "anonKey"]]) {
  document.querySelector(selector).addEventListener("change", event => {
    const previous = account[key];
    account[key] = key === "serviceUrl"
      ? event.target.value.trim().replace(/\/$/, "").slice(0, 500)
      : event.target.value.trim().slice(0, 1000);
    if (previous !== account[key] && account.user) {
      account.accessToken = "";
      account.refreshToken = "";
      account.expiresAt = 0;
      account.user = null;
      account.lastRemoteUpdatedAt = "";
      account.status = "Cloud-Einrichtung geändert. Bitte erneut anmelden.";
    }
    saveAccount();
    renderAccountSettings();
  });
}
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
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(() => { showToast("Offline-Modus konnte noch nicht aktiviert werden."); }));
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
handleAccountStartup();
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
      <p class="share-hint" id="version-status">Version 17 · geprüfte Checkpoints · strukturierte Offline-/Cloud-KI</p>
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
  const totalSeconds = Object.values(state.workSeconds || {}).reduce((sum, value) => sum + value, 0);
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


"use strict";

// FDN ÖSD Version 17 – IndexedDB-Checkpoints, Datenintegrität und Wartungscockpit.
const v17DatabaseName = "fdn-osd-v17";
const v17DatabaseStore = "snapshots";
let v17SnapshotTimer = 0;
let v17LastSnapshotAt = "";
let v17DatabaseError = "";
let v17MaintenanceRunning = false;

function v17DashboardMarkup() {
  return `
    <section class="card v17-health-card" id="v17-health-card">
      <div class="card-heading">
        <div><h3><span class="v17-health-symbol">✓</span> Systemqualität</h3><p id="v17-health-label">Datenprüfung wird vorbereitet …</p></div>
        <div class="v17-score" id="v17-score"><strong>–</strong><small>/100</small></div>
      </div>
      <div class="v17-metrics">
        <div><span>▤ Einträge</span><strong id="v17-entry-count">0</strong></div>
        <div><span>◷ Offen</span><strong id="v17-order-count">0</strong></div>
        <div><span>⚑ Prüfen</span><strong id="v17-issue-count">0</strong></div>
      </div>
      <div class="v17-database-line"><span id="v17-db-dot"></span><p id="v17-db-status">Lokale Datenbank wird geprüft.</p><span class="version-badge v17-badge">V17</span></div>
    </section>`;
}

function v17SettingsMarkup() {
  return `
    <section class="card v17-settings" id="v17-settings">
      <div class="card-heading"><div><h3>Version-17-Systemzentrale</h3><p>Checkpoints, Integritätsprüfung und Hintergrundwartung.</p></div><span class="version-badge v17-badge">17</span></div>
      <div class="v17-check-list" id="v17-check-list"></div>
      <div class="button-row v17-actions">
        <button type="button" class="primary-button" id="v17-create-checkpoint">Checkpoint erstellen</button>
        <button type="button" class="secondary-button" id="v17-run-repair">Daten prüfen</button>
      </div>
      <div class="button-row v17-actions">
        <button type="button" class="secondary-button" id="v17-restore-checkpoint">Checkpoint laden</button>
        <button type="button" class="secondary-button" id="v17-export-safety">Sicherheitskopie</button>
      </div>
      <p class="share-hint" id="v17-settings-status">Bis zu acht geprüfte Browser-Checkpoints werden lokal aufbewahrt.</p>
      <p class="share-hint"><strong>V17:</strong> Der bisherige Browser-Speicher bleibt kompatibel; IndexedDB ergänzt ihn als zweite, transaktionale Sicherung.</p>
    </section>`;
}

function injectV17UI() {
  const dashboard = document.querySelector("#v16-ai-card");
  if (dashboard && !document.querySelector("#v17-health-card")) dashboard.insertAdjacentHTML("afterend", v17DashboardMarkup());
  const settings = document.querySelector("#v16-settings");
  if (settings && !document.querySelector("#v17-settings")) settings.insertAdjacentHTML("beforebegin", v17SettingsMarkup());
  bindV17Events();
}

function v17Request(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB-Anfrage fehlgeschlagen"));
  });
}

function v17OpenDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.reject(new Error("IndexedDB wird nicht unterstützt"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(v17DatabaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(v17DatabaseStore)) {
        const store = database.createObjectStore(v17DatabaseStore, { keyPath: "id" });
        store.createIndex("modifiedAt", "modifiedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Datenbank konnte nicht geöffnet werden"));
  });
}

async function v17Checksum(text) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fallback-${(hash >>> 0).toString(16)}`;
}

async function v17AllSnapshots(database) {
  const transaction = database.transaction(v17DatabaseStore, "readonly");
  const records = await v17Request(transaction.objectStore(v17DatabaseStore).getAll());
  return records.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)));
}

async function v17CreateCheckpoint(announce = false) {
  try {
    const payload = JSON.stringify(portableBackup());
    if (new Blob([payload]).size > 30_000_000) throw new Error("Sicherung ist größer als 30 MB");
    const checksum = await v17Checksum(payload);
    const database = await v17OpenDatabase();
    const previous = (await v17AllSnapshots(database))[0];
    const now = new Date().toISOString();
    const record = previous?.checksum === checksum
      ? { ...previous, modifiedAt: now }
      : { id: crypto.randomUUID(), createdAt: now, modifiedAt: now, checksum, formatVersion: 9, payload };
    const write = database.transaction(v17DatabaseStore, "readwrite");
    write.objectStore(v17DatabaseStore).put(record);
    await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onerror = () => reject(write.error); write.onabort = () => reject(write.error); });

    const records = await v17AllSnapshots(database);
    if (records.length > 8) {
      const prune = database.transaction(v17DatabaseStore, "readwrite");
      for (const oldRecord of records.slice(8)) prune.objectStore(v17DatabaseStore).delete(oldRecord.id);
      await new Promise(resolve => { prune.oncomplete = resolve; prune.onerror = resolve; prune.onabort = resolve; });
    }
    database.close();
    v17LastSnapshotAt = now;
    v17DatabaseError = "";
    renderV17();
    if (announce) showToast("Geprüfter Datenbank-Checkpoint erstellt");
    return true;
  } catch (error) {
    v17DatabaseError = String(error?.message || "Datenbank nicht verfügbar").slice(0, 180);
    renderV17();
    if (announce) showToast(`Checkpoint nicht möglich: ${v17DatabaseError}`);
    return false;
  }
}

function v17ScheduleSnapshot() {
  clearTimeout(v17SnapshotTimer);
  v17SnapshotTimer = window.setTimeout(() => v17CreateCheckpoint(false), 500);
}

async function v17LatestSnapshot() {
  const database = await v17OpenDatabase();
  const latest = (await v17AllSnapshots(database))[0] || null;
  database.close();
  return latest;
}

async function v17LoadSnapshotMetadata() {
  try {
    const latest = await v17LatestSnapshot();
    v17LastSnapshotAt = latest?.modifiedAt || "";
    v17DatabaseError = "";
  } catch (error) {
    v17DatabaseError = String(error?.message || "Datenbank nicht verfügbar").slice(0, 180);
  }
  renderV17();
}

function v17DataIssues() {
  const issues = [];
  for (const [date, counts] of Object.entries(state.entries || {})) {
    const total = Object.values(counts || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total > 250) issues.push(`Ungewöhnlich hohe Anzahl am ${date}`);
    for (const [categoryID, count] of Object.entries(counts || {})) {
      if (Number(count) > 0 && !Number.isFinite(Number(state.entryRates?.[date]?.[categoryID]))) issues.push(`Historischer Preis fehlt am ${date}`);
    }
    if (!state.extensions?.entryClients?.[date]) issues.push(`Auftraggeber fehlt am ${date}`);
  }
  return issues.slice(0, 8);
}

function v17HealthReport() {
  const today = dayKey(new Date());
  const overdue = (state.tasks || []).filter(task => !task.isCompleted && task.dueDateKey < today).length;
  const dataIssues = v17DataIssues();
  const invoiceIssues = typeof v15InvoiceIssues === "function" ? v15InvoiceIssues() : [];
  const databaseReady = !v17DatabaseError && "indexedDB" in globalThis;
  const penalty = dataIssues.length * 8 + invoiceIssues.length * 7 + overdue * 5 + (databaseReady ? 0 : 15);
  return {
    score: Math.max(0, Math.min(100, 100 - penalty)),
    entries: Object.keys(state.entries || {}).length,
    openOrders: (state.tasks || []).filter(task => !task.isCompleted).length,
    overdue,
    dataIssues,
    invoiceIssues,
    databaseReady,
    issueCount: dataIssues.length + invoiceIssues.length + overdue
  };
}

function v17RepairData() {
  state.entries = sanitizeEntries(state.entries);
  state.entryRates = sanitizeEntryRates(state.entryRates, state.entries, state.rates);
  state.workSeconds = sanitizeWorkSeconds(state.workSeconds);
  state.tasks = sanitizeTasks(state.tasks);
  state.invoices = sanitizeInvoices(state.invoices);
  state.extensions = sanitizeExtensions(state.extensions);
  for (const date of Object.keys(state.entries)) {
    if (!state.extensions.entryClients[date]) state.extensions.entryClients[date] = "osd";
  }
  recordAudit("security", "V17-Datenintegrität geprüft", `${Object.keys(state.entries).length} Arbeitstage`);
  saveState();
  ensureMonthlyArchives();
  renderAll();
  showToast("Datenintegrität geprüft und repariert");
}

async function v17RestoreCheckpoint() {
  try {
    const latest = await v17LatestSnapshot();
    if (!latest) return showToast("Noch kein Checkpoint vorhanden.");
    if (await v17Checksum(latest.payload) !== latest.checksum) throw new Error("Prüfsumme stimmt nicht");
    if (!confirm(`Checkpoint vom ${new Date(latest.modifiedAt).toLocaleString("de-AT")} wiederherstellen?`)) return;
    applyImportedBackup(JSON.parse(latest.payload), true);
    showToast("Checkpoint erfolgreich wiederhergestellt");
  } catch (error) {
    showToast(`Wiederherstellung nicht möglich: ${String(error?.message || "ungültiger Checkpoint").slice(0, 140)}`);
  }
}

function v17ExportSafetyBackup() {
  const blob = new Blob([JSON.stringify(portableBackup(), null, 2)], { type: "application/json" });
  downloadBlob(blob, `FDN-OESD-V17-Sicherung-${dayKey(new Date())}.json`);
  showToast("V17-Sicherheitskopie erstellt");
}

function renderV17Dashboard() {
  if (!document.querySelector("#v17-health-card")) return;
  const report = v17HealthReport();
  document.querySelector("#v17-score strong").textContent = report.score;
  document.querySelector("#v17-entry-count").textContent = report.entries;
  document.querySelector("#v17-order-count").textContent = report.openOrders;
  document.querySelector("#v17-issue-count").textContent = report.issueCount;
  document.querySelector("#v17-health-label").textContent = report.score >= 92 ? "Ausgezeichnet · alle Kernprüfungen bestanden" : report.score >= 75 ? "Stabil · einzelne Angaben prüfen" : "Prüfung empfohlen";
  document.querySelector("#v17-health-card").classList.toggle("warning", report.score < 75);
  document.querySelector("#v17-db-dot").classList.toggle("ready", report.databaseReady);
  document.querySelector("#v17-db-status").textContent = report.databaseReady
    ? (v17LastSnapshotAt ? `IndexedDB gesichert · ${new Date(v17LastSnapshotAt).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "IndexedDB bereit · erster Checkpoint folgt automatisch")
    : `Datenbank nicht verfügbar${v17DatabaseError ? ` · ${v17DatabaseError}` : ""}`;
}

function renderV17Settings() {
  if (!document.querySelector("#v17-settings")) return;
  const report = v17HealthReport();
  const checks = [
    ["Browser-Datenbank", report.databaseReady, report.databaseReady ? "Transaktionale Checkpoints aktiv" : (v17DatabaseError || "Nicht verfügbar")],
    ["Datenintegrität", report.dataIssues.length === 0, report.dataIssues.length ? `${report.dataIssues.length} Hinweis(e)` : "Historische Preise und Zuordnungen plausibel"],
    ["Rechnungsprüfung", report.invoiceIssues.length === 0, report.invoiceIssues.length ? `${report.invoiceIssues.length} Pflichtangabe(n) offen` : "Pflichtangaben plausibel"],
    ["Offline-Betrieb", Boolean(navigator.serviceWorker), navigator.serviceWorker ? "Installierbare PWA mit Cache" : "Service Worker in diesem Browser nicht verfügbar"],
    ["Verbindung", navigator.onLine, navigator.onLine ? "Online; Cloud-Dienste möglich" : "Offline; lokale Funktionen bleiben aktiv"]
  ];
  document.querySelector("#v17-check-list").innerHTML = checks.map(([title, ready, detail]) => `
    <div class="${ready ? "good" : "warning"}"><span>${ready ? "✓" : "!"}</span><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(detail)}</small></div></div>`).join("");
  document.querySelector("#v17-restore-checkpoint").disabled = !v17LastSnapshotAt;
}

function renderV17() { renderV17Dashboard(); renderV17Settings(); }

function bindV17Events() {
  document.querySelector("#v17-create-checkpoint")?.addEventListener("click", () => v17CreateCheckpoint(true));
  document.querySelector("#v17-run-repair")?.addEventListener("click", v17RepairData);
  document.querySelector("#v17-restore-checkpoint")?.addEventListener("click", v17RestoreCheckpoint);
  document.querySelector("#v17-export-safety")?.addEventListener("click", v17ExportSafetyBackup);
}

const v17BaseSaveState = saveState;
saveState = function version17SaveState(touch = true) { v17BaseSaveState(touch); v17ScheduleSnapshot(); };
const v17BaseRenderAll = renderAll;
renderAll = function version17RenderAll() { v17BaseRenderAll(); renderV17(); };
const v17BaseRenderWorkday = renderWorkday;
renderWorkday = function version17RenderWorkday() { v17BaseRenderWorkday(); renderV17Dashboard(); };
const v17BaseSwitchPage = switchPage;
switchPage = function version17SwitchPage(target) { v17BaseSwitchPage(target); if (target === "settings") renderV17Settings(); };

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") v17CreateCheckpoint(false);
  else { ensureMonthlyArchives(); renderV17(); }
});
window.addEventListener("online", renderV17);
window.addEventListener("offline", renderV17);

injectV17UI();
renderV17();
v17LoadSnapshotMetadata();
v17ScheduleSnapshot();
