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
    city: "Wien",
    bank: "",
    iban: "",
    bic: ""
  };
}

function sanitizeInvoiceProfile(profile) {
  const clean = defaultInvoiceProfile();
  if (!profile || typeof profile !== "object") return clean;
  for (const key of Object.keys(clean)) {
    if (typeof profile[key] === "string") clean[key] = profile[key].slice(0, 300);
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.selectedDate || "")) fresh.selectedDate = saved.selectedDate;
    fresh.invoiceProfile = sanitizeInvoiceProfile(saved.invoiceProfile);
    return fresh;
  } catch {
    return defaultState();
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

let state = loadState();
let visibleMonth = new Date(dateFromKey(state.selectedDate).getFullYear(), dateFromKey(state.selectedDate).getMonth(), 1, 12);
let invoiceMonth = new Date(visibleMonth);
let toastTimer;
let deferredInstallPrompt = null;

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
}

function rateFor(categoryId) {
  return state.rates[categoryId] ?? categories.find(category => category.id === categoryId)?.defaultRate ?? 0;
}

function countFor(date, categoryId) {
  return state.entries[date]?.[categoryId] ?? 0;
}

function totalsFor(date) {
  const counts = state.entries[date] ?? {};
  return categories.reduce((total, category) => {
    const count = counts[category.id] ?? 0;
    total.count += count;
    total.cents += count * rateFor(category.id);
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
        rateCents: rateFor(category.id),
        amountCents: count * rateFor(category.id)
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Honorarnote ${escapeHTML(profile.number)}/${year}</title>
  <style>
    @page { size: A4; margin: 20mm; } body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; color: #111; }
    .recipient { margin-bottom: 34mm; } .date { text-align: right; margin-bottom: 22mm; } h1 { text-align: center; font-size: 22pt; margin: 0 0 14mm; }
    table { width: 100%; border-collapse: collapse; margin: 8mm 0; } th, td { border: 1px solid #333; padding: 7px; vertical-align: top; } th { text-align: left; }
    th:nth-child(1) { width: 50%; } th:nth-child(2) { width: 18%; } th:nth-child(3) { width: 10%; } th:nth-child(4) { width: 22%; text-align: right; }
    td.number { text-align: center; } td.money { text-align: right; } tr.new-day td { border-top-width: 2px; } tfoot th { font-weight: bold; } .bank { margin-top: 10mm; }
    .signature { margin-top: 18mm; width: 60%; border-bottom: 1px dotted #111; padding-bottom: 4px; } .signature-label { font-size: 9pt; }
  </style></head><body>
    <div class="recipient"><b>${escapeHTML(profile.recipient)}</b><br>${escapeWithBreaks(profile.recipientAddress)}</div>
    <div class="date">${escapeHTML(profile.city || "Wien")}, ${created}</div>
    <h1>Honorarnote &nbsp; ${escapeHTML(profile.number || "1")} / ${year}</h1>
    <p>Für meine Tätigkeit vom <u>${numericDate(period.first)}</u> bis <u>${numericDate(period.last)}</u> erlaube ich mir, folgenden Betrag in Rechnung zu stellen:</p>
    <table><thead><tr><th>Tätigkeit</th><th>Stufe + Modul</th><th>Anzahl</th><th>EUR</th></tr></thead><tbody>${tableRows}</tbody>
      <tfoot><tr><th colspan="3">Gesamt brutto</th><th style="text-align:right">${plainEuro(totals.cents)}</th></tr></tfoot></table>
    <p>Detailaufstellung und Belege liegen bei.</p>
    ${bankRows ? `<div class="bank"><p>Ich ersuche höflich um Überweisung auf das nachfolgende Konto:</p>${bankRows}</div>` : ""}
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
  if (!state.entries[date]) state.entries[date] = {};
  if (safeCount === 0) delete state.entries[date][categoryId];
  else state.entries[date][categoryId] = safeCount;
  if (!Object.keys(state.entries[date]).length) delete state.entries[date];
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
}

function renderWorkday() {
  const totals = totalsFor(state.selectedDate);
  document.querySelector("#today-earnings").textContent = euroFormatter.format(totals.cents / 100);
  document.querySelector("#today-count").textContent = String(totals.count);
  document.querySelector("#selected-date-label").textContent = shortDayFormatter.format(dateFromKey(state.selectedDate));

  const list = document.querySelector("#counter-list");
  list.replaceChildren();
  for (const category of categories) {
    const count = countFor(state.selectedDate, category.id);
    const card = document.createElement("article");
    card.className = `counter-card card${count ? " has-count" : ""}`;
    card.style.cssText = `--accent:${category.accent};--accent-rgb:${category.accentRGB}`;
    card.innerHTML = `
      <div class="counter-main">
        <span class="category-icon" aria-hidden="true"><svg><use href="#${category.icon}"></use></svg></span>
        <div class="counter-info">
          <div class="counter-title"><h3>${category.title}</h3><span class="rate-badge">${euroFormatter.format(rateFor(category.id) / 100)}</span></div>
          <p>${category.detail}</p>
          ${count ? `<p class="subtotal">${euroFormatter.format(count * rateFor(category.id) / 100)}</p>` : ""}
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
        return `<div class="history-detail-row"><span>${category.title}</span><span>${count} × ${euroFormatter.format(rateFor(category.id) / 100)} = ${euroFormatter.format(count * rateFor(category.id) / 100)}</span></div>`;
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
}

function renderInvoiceProfile() {
  const fieldMap = {
    number: "#invoice-number",
    email: "#invoice-email",
    recipient: "#invoice-recipient",
    recipientAddress: "#invoice-recipient-address",
    senderName: "#invoice-sender-name",
    city: "#invoice-city",
    bank: "#invoice-bank",
    iban: "#invoice-iban",
    bic: "#invoice-bic"
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
  city: "#invoice-city",
  bank: "#invoice-bank",
  iban: "#invoice-iban",
  bic: "#invoice-bic"
};
for (const [key, selector] of Object.entries(invoiceFieldMap)) {
  document.querySelector(selector).addEventListener("input", event => {
    state.invoiceProfile[key] = event.target.value.slice(0, 300);
    saveState();
  });
}

document.querySelector("#reset-rates").addEventListener("click", () => {
  if (!confirm("Alle Honorare auf die sechs Vertragspreise zurücksetzen?")) return;
  state.rates = Object.fromEntries(categories.map(category => [category.id, category.defaultRate]));
  saveState();
  renderAll();
  showToast("Vertragspreise wiederhergestellt");
});

document.querySelector("#export-data").addEventListener("click", () => {
  const exportObject = { version: 2, exportedAt: new Date().toISOString(), rates: state.rates, entries: state.entries, invoiceProfile: state.invoiceProfile };
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
    const nextState = defaultState();
    nextState.entries = sanitizeEntries(imported.entries);
    for (const category of categories) {
      const rate = Number(imported.rates?.[category.id]);
      if (Number.isFinite(rate) && rate >= 0) nextState.rates[category.id] = Math.round(rate);
    }
    nextState.invoiceProfile = sanitizeInvoiceProfile(imported.invoiceProfile);
    if (!confirm("Aktuelle Daten durch diese Sicherung ersetzen?")) return;
    nextState.selectedDate = state.selectedDate;
    state = nextState;
    saveState();
    renderAll();
    showToast("Datensicherung wiederhergestellt");
  } catch {
    showToast("Diese Sicherungsdatei ist ungültig.");
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
  const files = monthlyReportFiles();
  downloadBlob(files.wordBlob, files.wordFile.name);
  showToast("Word-Abrechnung erstellt");
});

document.querySelector("#download-excel").addEventListener("click", () => {
  const files = monthlyReportFiles();
  downloadBlob(files.excelBlob, files.excelFile.name);
  showToast("Excel-Liste erstellt");
});

document.querySelector("#share-invoice").addEventListener("click", async () => {
  const files = monthlyReportFiles();
  const monthName = monthFormatter.format(invoiceMonth);
  const totals = totalsForMonth(invoiceMonth);
  const subject = `Honorarnote ${state.invoiceProfile.number || "1"}/${invoiceMonth.getFullYear()} – ${monthName}`;
  const message = `Guten Tag,\n\nim Anhang sende ich meine Honorarabrechnung für ${monthName}. Gesamt brutto: ${euroFormatter.format(totals.cents / 100)}.\n\nMit freundlichen Grüßen\n${state.invoiceProfile.senderName}`;
  const shareFiles = [files.wordFile, files.excelFile];

  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: shareFiles }))) {
      await navigator.share({ title: subject, text: message, files: shareFiles });
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
renderAll();
