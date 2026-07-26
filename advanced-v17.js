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
