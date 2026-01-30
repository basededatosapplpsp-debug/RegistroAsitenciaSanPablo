// ======= CONFIG DEL COLEGIO (CAMBIA ESTO) =======
const SCHOOL_LAT = 4.556189026908756;
const SCHOOL_LNG = -74.11154255367394;
const SCHOOL_RADIUS_METERS = 120;
const REQUIRED_ACCURACY_METERS = 50;

// ======= GOOGLE SHEETS (CAMBIA ESTO) =======
const GS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzqLGNfjp0CJi51woGWje8EmKT8rk7uBFhtCHCS-H_R9x4H5NICgYA-S9yu1K6mR7kc/exec"; // ej: https://script.google.com/macros/s/XXXX/exec
const GS_API_KEY = "deimerDh2191docentesRegistros2026appandoidios";        // igual que en Code.gs

// ======= UI =======
const $ = (id) => document.getElementById(id);

const teacherNameEl = $("teacherName");
const tbody = $("tbody");
const statusTitle = $("statusTitle");
const statusMsg = $("statusMsg");
const dot = $("dot");
const distEl = $("dist");
const accEl = $("acc");
const coordsEl = $("coords");

const btnEntrada = $("btnEntrada");
const btnSalida  = $("btnSalida");
const btnClear   = $("btnClear");
const btnExport  = $("btnExport");
const btnInstall = $("btnInstall");
const btnRefreshSW = $("btnRefreshSW");

const btnToggleRecords = $("btnToggleRecords");
const recordsPanel = $("recordsPanel");
const recordsList = $("recordsList");

// ======= Helpers =======
function pad(n){ return String(n).padStart(2,"0"); }
function nowParts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return { date:`${yyyy}-${mm}-${dd}`, time:`${hh}:${mi}:${ss}`, iso:d.toISOString() };
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function setStatus(kind, title, msg) {
  statusTitle.textContent = title;
  statusMsg.textContent = msg;
  dot.className = "dot" + (kind ? ` ${kind}` : "");
}

// ======= GEO =======
function toRad(x){ return x * Math.PI / 180; }
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function getPosition() {
  if (!("geolocation" in navigator)) throw new Error("Geolocalización no disponible.");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    });
  });
}

async function checkLocation() {
  setStatus("warn", "Verificando ubicación…", "Asegúrate de tener GPS/Ubicación activada.");
  const pos = await getPosition();
  const { latitude, longitude, accuracy } = pos.coords;
  const dist = distanceMeters(latitude, longitude, SCHOOL_LAT, SCHOOL_LNG);

  distEl.textContent = `${Math.round(dist)} m`;
  accEl.textContent = `${Math.round(accuracy)} m`;
  coordsEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  const accurateEnough = accuracy <= REQUIRED_ACCURACY_METERS;
  const inside = dist <= SCHOOL_RADIUS_METERS;

  if (!accurateEnough) {
    setStatus("warn", "Ubicación con baja precisión", `Precisión actual ${Math.round(accuracy)} m. Necesito ≤ ${REQUIRED_ACCURACY_METERS} m.`);
    return { ok:false, reason:"accuracy", dist, accuracy, latitude, longitude };
  }
  if (!inside) {
    setStatus("bad", "Fuera del colegio", `Estás a ~${Math.round(dist)} m. Debes estar dentro de ${SCHOOL_RADIUS_METERS} m.`);
    return { ok:false, reason:"outside", dist, accuracy, latitude, longitude };
  }

  setStatus("", "Ubicación validada", `Dentro del radio (${SCHOOL_RADIUS_METERS} m) y precisión OK.`);
  return { ok:true, dist, accuracy, latitude, longitude };
}

// ======= Google Sheets API (Apps Script Web App) =======
async function gsGetList(limit = 50) {
  const url = new URL(GS_WEBAPP_URL);
  url.searchParams.set("action", "list");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("key", GS_API_KEY);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "gs_list_failed");
  return data.records || [];
}

async function gsRegister(payload) {
  const res = await fetch(GS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, key: GS_API_KEY })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "gs_register_failed");
  return data;
}

async function gsClearCurrentMonth() {
  const d = new Date();
  const month = `${d.getFullYear()}-${pad(d.getMonth()+1)}`; // YYYY-MM

  const res = await fetch(GS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "clear_month", month, key: GS_API_KEY })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "gs_clear_failed");
  return data;
}

// ======= Render (desde Google Sheets) =======
let cachedRecords = [];

function render(records) {
  cachedRecords = records;

  // Tabla (desktop)
  tbody.innerHTML = records.map(r => `
    <tr class="${r.type === "ENTRADA" ? (r.late ? "late" : "ontime") : ""}">
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${escapeHtml(r.teacher)}</td>
      <td>${escapeHtml(r.type)}</td>
      <td>—</td>
      <td>—</td>
    </tr>
  `).join("");

  // Cards (mobile)
  if (!records.length) {
    recordsList.innerHTML = `<div class="muted small">No hay registros todavía.</div>`;
    return;
  }

  recordsList.innerHTML = records.map(r => {
    const badgeClass = (r.type === "ENTRADA")
      ? (r.late ? "badge badge-late" : "badge badge-ontime")
      : "badge badge-neutral";

    const rowClass = (r.type === "ENTRADA")
      ? (r.late ? "record-card late" : "record-card ontime")
      : "record-card";

    return `
      <div class="${rowClass}">
        <div class="top">
          <span class="teacher">${escapeHtml(r.teacher)}</span>
          <span class="${badgeClass}">${escapeHtml(r.type)}${r.type==="ENTRADA" ? (r.late ? " • TARDE" : " • A TIEMPO") : ""}</span>
        </div>
        <div class="meta">
          ${escapeHtml(r.date)} • ${escapeHtml(r.time)}
        </div>
      </div>
    `;
  }).join("");
}

async function refreshFromSheet() {
  try {
    setStatus("warn", "Cargando…", "Leyendo registros desde Google Sheets.");
    const records = await gsGetList(60);
    render(records);
    setStatus("", "Listo", "Datos sincronizados desde Google Sheets.");
  } catch (e) {
    setStatus("bad", "Error Google Sheets", "Revisa URL/clave del Web App y permisos.");
  }
}

// ======= Registrar =======
async function register(type) {
  const teacher = teacherNameEl.value.trim();
  if (!teacher) {
    setStatus("bad", "Falta el nombre", "Escribe el nombre del docente.");
    teacherNameEl.focus();
    return;
  }

  let geo;
  try { geo = await checkLocation(); }
  catch (e) {
    setStatus("bad", "No se pudo obtener ubicación", "Activa permisos de ubicación del navegador.");
    return;
  }
  if (!geo.ok) return;

  const t = nowParts();

  try {
    setStatus("warn", "Guardando…", "Enviando registro a Google Sheets.");
    await gsRegister({
      action: "register",
      teacher,
      type,
      iso: t.iso,
      distance_m: Math.round(geo.dist),
      accuracy_m: Math.round(geo.accuracy),
      lat: geo.latitude,
      lng: geo.longitude
    });
    await refreshFromSheet();
    setStatus("", "Guardado", `${type} registrada para ${teacher}.`);
  } catch (e) {
    setStatus("bad", "No se pudo guardar", "Revisa conexión y Apps Script.");
  }
}

// ======= CSV (desde lo que se ve en la app) =======
function csvCell(v){
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function exportCSV() {
  if (!cachedRecords.length) {
    setStatus("warn", "Sin datos", "No hay registros para exportar.");
    return;
  }
  const header = ["teacher","type","date","time","late","iso"];
  const lines = [header.join(",")].concat(
    cachedRecords.map(r => header.map(k => csvCell(r[k])).join(","))
  );

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `asistencia_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus("", "Exportado", "CSV descargado.");
}

// ======= INSTALL (A2HS) =======
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.hidden = false;
});
btnInstall.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

// ======= UI: Toggle registros =======
function setRecordsOpen(open) {
  recordsPanel.hidden = !open;
  btnToggleRecords.setAttribute("aria-expanded", String(open));
  btnToggleRecords.classList.toggle("open", open);
}
setRecordsOpen(false);
btnToggleRecords.addEventListener("click", () => setRecordsOpen(recordsPanel.hidden));

// ======= Reset / Refresh Service Worker + Cache =======
async function hardRefreshPWA() {
  try {
    setStatus("warn", "Actualizando…", "Borrando caché y recargando (puede tardar unos segundos).");

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    const url = new URL(location.href);
    url.searchParams.set("v", String(Date.now()));
    location.replace(url.toString());
  } catch (e) {
    setStatus("bad", "No se pudo actualizar", "Cierra la app y ábrela de nuevo.");
  }
}
btnRefreshSW.addEventListener("click", hardRefreshPWA);

// ======= SW register =======
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}

// ======= EVENTOS =======
btnEntrada.addEventListener("click", () => register("ENTRADA"));
btnSalida.addEventListener("click",  () => register("SALIDA"));

btnExport.addEventListener("click", exportCSV);

btnClear.addEventListener("click", async () => {
  try {
    setStatus("warn", "Borrando…", "Limpiando el mes actual en Google Sheets.");
    await gsClearCurrentMonth();
    await refreshFromSheet();
    setStatus("warn", "Borrado", "Se borraron los registros del mes actual.");
  } catch (e) {
    setStatus("bad", "No se pudo borrar", "Revisa Apps Script.");
  }
});

// Inicial
refreshFromSheet();
setStatus("warn", "Listo", "Para registrar, activa ubicación y escribe el nombre.");
