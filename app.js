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

// ======= LOGIN MODAL UI =======
const loginModal = $("loginModal");
const loginNameEl = $("loginName");
const loginEmailEl = $("loginEmail");
const loginCourseEl = $("loginCourse");
const btnLoginSave = $("btnLoginSave");
const loginHint = $("loginHint");

const deviceIdTextEl = $("deviceIdText");
const btnCopyDevice = $("btnCopyDevice");

const btnRequestAuth = $("btnRequestAuth");




const btnEntrada = $("btnEntrada");
const btnSalida  = $("btnSalida");
const btnExport  = $("btnExport");
const btnInstall = $("btnInstall");
const btnRefreshSW = $("btnRefreshSW");
const btnLogout = $("btnLogout");

const btnUserMenu = $("btnUserMenu");
const userMenu = $("userMenu");
const userInitialsEl = $("userInitials");



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

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")                 // separa tildes
    .replace(/[\u0300-\u036f]/g, "")  // quita tildes
    .replace(/\s+/g, " ");            // colapsa espacios
}




function setStatus(kind, title, msg) {
  statusTitle.textContent = title;
  statusMsg.textContent = msg;
  dot.className = "dot" + (kind ? ` ${kind}` : "");
}


let __loadingCount = 0;

function setLoading(isLoading, title = "Procesando…", msg = "Por favor espera…") {
  if (isLoading) __loadingCount++;
  else __loadingCount = Math.max(0, __loadingCount - 1);

  const on = __loadingCount > 0;

  // Deshabilitar botones principales para evitar dobles registros
  btnEntrada.disabled = on;
  btnSalida.disabled = on;
  btnExport.disabled = on;

  // Mensaje visual
  if (on) setStatus("warn", title, msg);
}



// ======= PERFIL + DEVICE ID =======
const LS_PROFILE_KEY = "asistencia_profile_v1";
const LS_DEVICE_KEY  = "asistencia_device_id_v1";

function getDeviceId() {
  let id = localStorage.getItem(LS_DEVICE_KEY);
  if (!id) {
    // UUID seguro: evita ReferenceError si crypto no existe
    const c = (typeof window !== "undefined") ? window.crypto : null;
    id = (c && typeof c.randomUUID === "function")
      ? c.randomUUID()
      : "dev-" + Math.random().toString(16).slice(2) + Date.now().toString(16);

    localStorage.setItem(LS_DEVICE_KEY, id);
  }
  return id;
}


function loadProfile() {
  try {
    const raw = localStorage.getItem(LS_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile));
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = (parts.length > 1 ? parts[parts.length - 1][0] : "") || "";
  return (first + last).toUpperCase();
}

function setMenuOpen(open) {
  if (!btnUserMenu || !userMenu) return;
  userMenu.hidden = !open;
  btnUserMenu.setAttribute("aria-expanded", String(open));
}

function updateUserInitials(profile) {
  if (!userInitialsEl) return;
  if (profile && profile.name) userInitialsEl.textContent = getInitials(profile.name);
  else userInitialsEl.textContent = "?";
}



function applySessionUI(profile) {
  if (profile && profile.name) {
    teacherNameEl.value = profile.name;

    // input bloqueado y grande
    teacherNameEl.disabled = true;
    teacherNameEl.classList.add("is-locked");

    // iniciales en el botón circular
    updateUserInitials(profile);

    // mostrar botón/menu solo si hay sesión
    if (btnUserMenu) btnUserMenu.hidden = false;
  } else {
    teacherNameEl.disabled = false;
    teacherNameEl.classList.remove("is-locked");

    updateUserInitials(null);

    if (btnUserMenu) btnUserMenu.hidden = true;
    setMenuOpen(false);
  }
}


function logout() {
  // borrar perfil
  localStorage.removeItem(LS_PROFILE_KEY);

  // limpiar UI
  applySessionUI(null);

  // abrir modal de login
  loginModal.hidden = false;
  updateDeviceIdUI();
  loginHint.textContent = "Sesión cerrada. Inicia sesión para continuar.";

  // opcional: mensaje en status
  setStatus("warn", "Sesión cerrada", "Vuelve a iniciar sesión para registrar.");
}


function requireLogin() {
  const p = loadProfile();
  if (p && p.name && p.email && p.course) return p;

  // Mostrar modal y bloquear uso hasta guardar
 loginModal.hidden = false;
updateDeviceIdUI();
loginHint.textContent = "Completa tus datos para continuar.";
return null;

}


function updateDeviceIdUI() {
  if (!deviceIdTextEl) return;
  deviceIdTextEl.textContent = getDeviceId();
}

if (btnCopyDevice) {
  btnCopyDevice.addEventListener("click", async () => {
    try {
      const id = getDeviceId();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        // fallback antiguo
        const ta = document.createElement("textarea");
        ta.value = id;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      loginHint.textContent = "ID copiado. Pégalo en la hoja DISPOSITIVOS para autorizar.";
    } catch (e) {
      loginHint.textContent = "No se pudo copiar. Copia el ID manualmente.";
    }
  });
}

// Toggle del menú al tocar el botón circular
if (btnUserMenu) {
  btnUserMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = userMenu && !userMenu.hidden;
    setMenuOpen(!isOpen);
  });
}

// Cerrar menú al tocar fuera
document.addEventListener("click", () => setMenuOpen(false));

// Cerrar menú al tocar una opción
if (userMenu) {
  userMenu.addEventListener("click", () => setMenuOpen(false));
}



btnLoginSave.addEventListener("click", async () => {
  const name = (loginNameEl.value || "").trim();
  const email = (loginEmailEl.value || "").trim().toLowerCase();
  const course = (loginCourseEl.value || "").trim();

  if (!name || !email || !course) {
    loginHint.textContent = "Faltan datos. Nombre, correo y curso son obligatorios.";
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    loginHint.textContent = "Correo inválido.";
    return;
  }

  try {
    setLoading(true, "Verificando…", "Comprobando si este teléfono ya está autorizado.");
    loginHint.textContent = "Verificando autorización…";

    const chk = await gsCheckDeviceAuth({
      action: "check_device_auth",
      email,
      device_id: getDeviceId()
    });

    // Normaliza por si alguna vez llegara como string (por cambios futuros)
    const authorized = (chk && (chk.authorized === true || String(chk.authorized).toLowerCase() === "true"));

    if (!authorized) {
      const msg = (chk && chk.msg) ? chk.msg : "Aún no autorizado. Usa 'Solicitar autorización' y espera aprobación.";
      loginHint.textContent = msg;

      // ✅ Aviso visible (no solo hint)
      setStatus("bad", "No autorizado", msg);

      // Mantener modal abierto
      loginModal.hidden = false;
      return;
    }

    // ✅ Autorizado: guardar perfil y cerrar modal
    const profile = { name, email, course };
saveProfile(profile);

applySessionUI(profile);
loginModal.hidden = true;


    loginHint.textContent = "";
    

    setStatus("", "Sesión iniciada", "Dispositivo autorizado ✅ Ya puedes registrar asistencia.");

    await refreshFromSheet();


  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    loginHint.textContent = msg;
    setStatus("bad", "Error de verificación", msg);
  } finally {
    setLoading(false);
  }
});





if (!btnRequestAuth) {
  console.warn("btnRequestAuth NO encontrado en el HTML");
} else {
  btnRequestAuth.addEventListener("click", async () => {
    const name = (loginNameEl.value || "").trim();
    const email = (loginEmailEl.value || "").trim().toLowerCase();
    const course = (loginCourseEl.value || "").trim();

    if (!name || !email || !course) {
      loginHint.textContent = "Primero completa Nombre, Correo y Curso, luego solicita autorización.";
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      loginHint.textContent = "Correo inválido.";
      return;
    }

    try {
      setLoading(true, "Enviando solicitud…", "Registrando este teléfono para aprobación.");
      loginHint.textContent = "Enviando solicitud…";

      const resp = await gsRequestDeviceAuth({
        action: "request_device_auth",
        name,
        email,
        course,
        device_id: getDeviceId()
      });

      // ✅ Mensaje claro con respuesta del servidor
      loginHint.textContent = resp.msg || "Solicitud enviada ✅. Espera aprobación del administrador.";
    } catch (e) {
      // ✅ Mostrar error real
      loginHint.textContent = String(e && e.message ? e.message : e);
    } finally {
      setLoading(false);
    }
  });
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
    // NO headers: evita preflight CORS
    body: JSON.stringify({ ...payload, key: GS_API_KEY })
  });

  let data = null;
  try { data = await res.json(); }
  catch { throw new Error("Respuesta inválida del servidor"); }

  // ✅ IMPORTANTE: si el servidor envía msg, lo usamos
  if (!data.ok) {
    throw new Error(data.msg || data.error || "gs_register_failed");
  }
  return data;
}


async function gsRequestDeviceAuth(payload) {
  const res = await fetch(GS_WEBAPP_URL, {
    method: "POST",
    // NO headers: evita preflight CORS
    body: JSON.stringify({ ...payload, key: GS_API_KEY })
  });

  let data = null;
  try { data = await res.json(); }
  catch { throw new Error("Respuesta inválida del servidor"); }

  if (!data.ok) throw new Error(data.msg || data.error || "request_auth_failed");
  return data;
}

async function gsCheckDeviceAuth(payload) {
  const res = await fetch(GS_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify({ ...payload, key: GS_API_KEY })
  });

  let data = null;
  try { data = await res.json(); }
  catch { throw new Error("Respuesta inválida del servidor"); }

  if (!data.ok) throw new Error(data.msg || data.error || "check_auth_failed");
  return data;
}


async function gsClearCurrentMonth() {
  const d = new Date();
  const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; // YYYY-MM

  const res = await fetch(GS_WEBAPP_URL, {
    method: "POST",
    // NO headers: evita preflight CORS
    body: JSON.stringify({ action: "clear_month", month, key: GS_API_KEY })
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "gs_clear_failed");
  return data;
}


// ======= Render (desde Google Sheets) =======
let cachedRecords = [];

function render(records) {
  const p = loadProfile();
  const myNameKey = normalizeKey(p && p.name ? p.name : "");

  const filtered = myNameKey
    ? (records || []).filter(r => normalizeKey(r.teacher) === myNameKey)
    : (records || []);

  cachedRecords = filtered;

  // Tabla (desktop)
  tbody.innerHTML = filtered.map(r => `
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
  if (!filtered.length) {
    recordsList.innerHTML = `<div class="muted small">No hay registros para este docente.</div>`;
    return;
  }

  recordsList.innerHTML = filtered.map(r => {
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
    setLoading(true, "Cargando…", "Leyendo registros desde Google Sheets.");
    const records = await gsGetList(60);
    render(records);
    setStatus("", "Listo", "Datos sincronizados desde Google Sheets.");
  } catch (e) {
    setStatus("bad", "Error Google Sheets", String(e && e.message ? e.message : "Revisa URL/clave del Web App y permisos."));
  } finally {
    setLoading(false);
  }
}


// ======= Registrar =======
// ======= Registrar =======
async function register(type) {
  const profile = requireLogin();
  if (!profile) return;

  const teacher = (teacherNameEl.value.trim() || profile.name);
  if (!teacher) {
    setStatus("bad", "Falta el nombre", "Escribe el nombre del docente.");
    teacherNameEl.focus();
    return;
  }

  let geo;
  try {
    geo = await checkLocation();
  } catch (e) {
    setStatus("bad", "No se pudo obtener ubicación", "Activa permisos de ubicación del navegador.");
    return;
  }
  if (!geo.ok) return;

  const t = nowParts();

  try {
    setLoading(true, "Guardando…", "Enviando registro a Google Sheets.");

    await gsRegister({
      action: "register",
      teacher,
      type,
      iso: t.iso,
      email: profile.email,
      course: profile.course,
      device_id: getDeviceId(),
      distance_m: Math.round(geo.dist),
      accuracy_m: Math.round(geo.accuracy),
      lat: geo.latitude,
      lng: geo.longitude
    });

       await refreshFromSheet();

    // ✅ abrir panel para que el usuario vea el registro de inmediato
    setRecordsOpen(true);

    setStatus("", "Guardado", `${type} registrada para ${teacher}.`);


  } catch (e) {
    // ✅ Mostrar el mensaje real (si viene del servidor)
    const msg = String(e && e.message ? e.message : e);

    // Si quieres títulos más bonitos según el caso:
    if (msg.toLowerCase().includes("no está autorizado") || msg.includes("device_not_authorized")) {
      setStatus("bad", "Teléfono no autorizado", msg);
    } else if (msg.toLowerCase().includes("ya existe") || msg.includes("already_registered")) {
      setStatus("warn", "Registro duplicado", msg);
    } else if (msg.includes("unauthorized")) {
      setStatus("bad", "Sin permisos", "Clave incorrecta o permisos del WebApp.");
    } else {
      setStatus("bad", "No se pudo guardar", msg || "Revisa conexión y Apps Script.");
    }

  } finally {
    setLoading(false);
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
    setStatus("warn", "Actualizando…", "Borrando caché y reiniciando la app.");

    // 🔥 orden de suicidio al SW activo
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.active) {
        reg.active.postMessage("KILL_SW");
      }
    }

    // 🧹 borrar caches desde la app
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 🔄 romper caché del navegador
    const url = new URL(location.href);
    url.searchParams.set("v", Date.now().toString());
    location.replace(url.toString());

  } catch (e) {
    setStatus("bad", "No se pudo actualizar", "Cierra la app y ábrela de nuevo.");
  }
}

btnRefreshSW.addEventListener("click", hardRefreshPWA);
if (btnLogout) {
  btnLogout.addEventListener("click", logout);
}


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



// Inicial
refreshFromSheet();
setStatus("warn", "Listo", "Para registrar, activa ubicación y escribe el nombre.");

// ✅ Mostrar login al abrir (si no hay perfil guardado)
const _p = requireLogin();
if (_p) {
  applySessionUI(_p);
} else {
  applySessionUI(null);
}



