// ======= CONFIG DEL COLEGIO (CAMBIA ESTO) =======
const SCHOOL_LAT = 4.556189026908756;        // <-- pon la latitud real
const SCHOOL_LNG = -74.11154255367394;      // <-- pon la longitud real
const SCHOOL_RADIUS_METERS = 120;   // radio permitido (ej: 80-200m)
const REQUIRED_ACCURACY_METERS = 50; // exige precisión GPS <= 50m (ajústalo)

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



// ======= STORAGE =======
const KEY = "asistencia_registros_v1";

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(KEY, JSON.stringify(records));
}

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

function render() {
  const records = loadRecords().slice().reverse();

  // ===== Tabla (desktop) =====
  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.teacher}</td>
      <td>${r.type}</td>
      <td>${r.distance_m ?? "—"}</td>
      <td>${r.accuracy_m ?? "—"}</td>
    </tr>
  `).join("");

  // ===== Lista (mobile) =====
  const list = document.getElementById("recordsList");
  list.innerHTML = records.map(r => `
    <div class="record-card">
      <div class="top">
        <span>${r.teacher}</span>
        <span class="type ${r.type}">${r.type}</span>
      </div>
      <div class="meta">
        ${r.date} • ${r.time}<br>
        Dist: ${r.distance_m ?? "—"} m · Prec: ${r.accuracy_m ?? "—"} m
      </div>
    </div>
  `).join("");
}


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

// ======= GEO =======
function toRad(x){ return x * Math.PI / 180; }
function distanceMeters(lat1, lon1, lat2, lon2) {
  // Haversine
  const R = 6371000;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function setStatus(kind, title, msg) {
  statusTitle.textContent = title;
  statusMsg.textContent = msg;
  dot.className = "dot" + (kind ? ` ${kind}` : "");
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

// ======= REGISTRO =======
async function register(type) {
  const teacher = teacherNameEl.value.trim();
  if (!teacher) {
    setStatus("bad", "Falta el nombre", "Escribe el nombre del docente.");
    teacherNameEl.focus();
    return;
  }

  let geo;
  try {
    geo = await checkLocation();
  } catch (e) {
    setStatus("bad", "No se pudo obtener ubicación", "En iPhone: Ajustes > Privacidad > Localización > Safari: Mientras se usa.");
    return;
  }

  if (!geo.ok) return;

  const t = nowParts();
  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type, // "ENTRADA" o "SALIDA"
    teacher,
    date: t.date,
    time: t.time,
    iso: t.iso,
    distance_m: Math.round(geo.dist),
    accuracy_m: Math.round(geo.accuracy),
    lat: geo.latitude,
    lng: geo.longitude
  };

  const records = loadRecords();
  records.push(record);
  saveRecords(records);
  render();
  setStatus("", "Guardado", `${type} registrada para ${teacher}.`);
}

// ======= CSV =======
function exportCSV() {
  const rows = loadRecords();
  if (!rows.length) {
    setStatus("warn", "Sin datos", "No hay registros para exportar.");
    return;
  }

  const header = ["id","type","teacher","date","time","iso","distance_m","accuracy_m","lat","lng"];
  const lines = [header.join(",")].concat(
    rows.map(r => header.map(k => csvCell(r[k])).join(","))
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

function csvCell(v){
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
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

// iOS no dispara beforeinstallprompt, se instala desde "Compartir > Añadir a pantalla de inicio"

// ======= SW =======
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {}
  });
}

// ======= EVENTOS =======
btnEntrada.addEventListener("click", () => register("ENTRADA"));
btnSalida.addEventListener("click",  () => register("SALIDA"));

btnClear.addEventListener("click", () => {
  localStorage.removeItem(KEY);
  render();
  setStatus("warn", "Borrado", "Se eliminaron todos los registros del dispositivo.");
});

btnExport.addEventListener("click", exportCSV);

// ======= UI: Mostrar/Ocultar panel de registros (sin tocar lógica) =======
const btnToggleRecords = document.getElementById("btnToggleRecords");
const recordsPanel = document.getElementById("recordsPanel");

function setRecordsOpen(open) {
  recordsPanel.hidden = !open;
  btnToggleRecords.textContent = open ? "Ocultar registros" : "Ver registros";
}

setRecordsOpen(false);

btnToggleRecords.addEventListener("click", () => {
  setRecordsOpen(recordsPanel.hidden); // si está oculto, lo abre; si está abierto, lo oculta
});

// ======= Reset / Refresh Service Worker + Cache (solo UI/mantenimiento) =======
async function hardRefreshPWA() {
  try {
    setStatus("warn", "Actualizando…", "Borrando caché y recargando (puede tardar unos segundos).");

    // 1) borrar caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 2) desregistrar service workers
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    // 3) recargar con cache-bust
    const url = new URL(location.href);
    url.searchParams.set("v", String(Date.now()));
    location.replace(url.toString());
  } catch (e) {
    setStatus("bad", "No se pudo actualizar", "Intenta cerrar la app y abrirla de nuevo.");
  }
}

btnRefreshSW.addEventListener("click", hardRefreshPWA);



// Render inicial
render();
setStatus("warn", "Listo", "Para registrar, activa ubicación y escribe el nombre.");
