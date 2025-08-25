// ===============================
// Config
// ===============================
let API_URL   = "http://localhost:8000";
let DEVICE_ID = "tablet-comedor-01";
let SEDE      = "Saltillo";
const APP_TIPO  = "comedor";
const APP_ID    = "comedor";       // namespace por app
const QUEUE_KEY = "queue_comedor";

// ===============================
const contenedor    = document.getElementById("contenedor");
const preguntaEl    = document.getElementById("pregunta");
const btnBack       = document.getElementById("btnBack");
const btnFullscreen = document.getElementById("btnFullscreen");

// ===============================
const opcionesNegativas = ["Comida fría","Cruda","Mal sabor","Poca variedad","Tardanza en servir","Otro"];
const opcionesPositivas = ["Sabor","Variedad","Atención","Ambiente","Raciones adecuadas","Otro"];
const opcionesPrincipales = [
  { texto:"Excelente", tipo:"positivo" },
  { texto:"Bueno",     tipo:"positivo" },
  { texto:"Regular",   tipo:"negativo" },
  { texto:"Malo",      tipo:"negativo" }
];

// ===============================
const STATE = { HOME:"home", SECONDARY:"secondary", THANKYOU:"thankyou" };
let state = STATE.HOME;
let seleccionPrincipal = null;
let clickLock = false, wakeLock=null;

// Scheduler único para cualquier reset (gracias/inactividad/back)
let resetTimer=null;
function scheduleReset(ms){
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(()=>{ resetTimer=null; forceHome(); }, ms);
}
function cancelScheduledReset(){ if (resetTimer){ clearTimeout(resetTimer); resetTimer=null; } }

let lastActionAt=0;
function guardFast(minMs=350){ const n=Date.now(); if (n-lastActionAt<minMs) return false; lastActionAt=n; return true; }
function lockClicks(ms=400){ clickLock=true; setTimeout(()=>clickLock=false, ms); }
function setInteraction(on){ if (contenedor) contenedor.style.pointerEvents = on ? "auto" : "none"; }

// ===============================
function setPreguntaPrincipal(){ preguntaEl && (preguntaEl.textContent="¿Qué tal estuvo el servicio de comedor?"); btnBack && btnBack.classList.add("oculto"); }
function setPreguntaSecundaria(){ preguntaEl && (preguntaEl.textContent=`¿Por qué calificaste “${seleccionPrincipal}”?`); btnBack && btnBack.classList.remove("oculto"); }

// ===============================
function forceHome(){
  state = STATE.HOME;
  cancelScheduledReset();
  setInteraction(true);
  seleccionPrincipal=null;
  setPreguntaPrincipal();
  contenedor.innerHTML="";
  opcionesPrincipales.forEach(op=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className=`boton-grande ${op.tipo==="positivo"?"boton-positivo":"boton-negativo"}`;
    btn.textContent=op.texto;
    btn.onclick=()=>{
      if (clickLock) return;
      if (!guardFast()) return;
      lockClicks(); cancelScheduledReset();
      seleccionPrincipal=op.texto;
      showSecondary(op.tipo);
    };
    contenedor.appendChild(btn);
  });

  // Si el botón de fullscreen está oculto es porque ya estuvimos en fullscreen.
  // Re-solicítalo si el navegador lo perdió durante un reset de UI.
  if (!document.fullscreenElement && btnFullscreen?.classList.contains("oculto")) {
    enterFullscreen();
  }
}

function showSecondary(tipo){
  state=STATE.SECONDARY; cancelScheduledReset(); setInteraction(true);
  setPreguntaSecundaria(); contenedor.innerHTML="";
  (tipo==="negativo"?opcionesNegativas:opcionesPositivas).forEach(opcion=>{
    const btn=document.createElement("button");
    btn.type="button"; btn.className="boton-grande"; btn.textContent=opcion;
    btn.onclick=()=>{
      if (clickLock) return;
      if (!guardFast()) return;
      lockClicks(); cancelScheduledReset();
      showThankYou(opcion);
    };
    contenedor.appendChild(btn);
  });
}

function showThankYou(motivo){
  state=STATE.THANKYOU;
  setInteraction(false);
  enviarRespuesta(seleccionPrincipal, motivo);
  contenedor.innerHTML=`
    <div class="mensaje-agradecimiento">
      ¡Gracias por tu opinión!<br/><small>${seleccionPrincipal} · ${motivo}</small>
    </div>`;
  scheduleReset(1500);
}

// ===============================
async function enviarRespuesta(principal, motivo){
  const payload = { sede:SEDE, dispositivo_id:DEVICE_ID, tipo:APP_TIPO, calificacion:principal, motivo,
    meta:{ ua:navigator.userAgent, screen:`${screen.width}x${screen.height}`, ts:new Date().toISOString() } };
  try{
    const r = await fetch(`${API_URL}/api/respuestas`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
    if (!r.ok) throw 0;
  }catch{
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); q.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }
}
async function flushQueue(){
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (!q.length) return;
  const rest=[];
  for (const item of q){
    try{
      const r=await fetch(`${API_URL}/api/respuestas`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(item) });
      if (!r.ok) throw 0;
    }catch{ rest.push(item); }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
}

// ===============================
async function enterFullscreen(){
  try{
    const el=document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    btnFullscreen?.classList.add("oculto");
  }catch{}
}
function setupFullscreen(){
  if (!btnFullscreen) return;
  btnFullscreen.addEventListener("click", enterFullscreen);
  document.addEventListener("fullscreenchange", ()=>{
    if (!btnFullscreen) return;
    if (document.fullscreenElement) btnFullscreen.classList.add("oculto");
    else btnFullscreen.classList.remove("oculto");
  });
}
async function requestWakeLock(){ try{ if ("wakeLock" in navigator){ wakeLock=await navigator.wakeLock.request("screen"); } }catch{} }
function setupWakeLock(){ document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible" && !wakeLock) requestWakeLock(); }); }
function setupBack(){ if (!btnBack) return; btnBack.addEventListener("click", ()=>{ if (clickLock) return; if (!guardFast()) return; lockClicks(); cancelScheduledReset(); forceHome(); }); }

// ===============================
function init(){
  const cfg = (window.UX && UX.loadConfig) ? UX.loadConfig({ apiUrl:API_URL, sede:SEDE, deviceId:DEVICE_ID, appId:APP_ID }) : { apiUrl:API_URL, sede:SEDE, deviceId:DEVICE_ID };
  API_URL=cfg.apiUrl; SEDE=cfg.sede; DEVICE_ID=cfg.deviceId;

  forceHome(); setupBack(); setupFullscreen(); setupWakeLock(); requestWakeLock();
  flushQueue(); window.addEventListener("online", flushQueue); setInterval(flushQueue, 30000);

  if (window.UX){
    UX.enhanceButtons?.(document);
    // Inactividad: usa el MISMO scheduler y respeta THANKYOU
    UX.setupInactivityReset?.(()=>{ if (state!==STATE.THANKYOU) scheduleReset(30000); }, 30000);
    UX.setupNetworkChip?.(()=> (JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]").length));
    UX.setupAdminMenu?.({
      defaults:{ apiUrl:API_URL, sede:SEDE, deviceId:DEVICE_ID },
      onSave:(ncfg)=>{ API_URL=ncfg.apiUrl; SEDE=ncfg.sede; DEVICE_ID=ncfg.deviceId; },
      appId: APP_ID
    });
  }
}
document.addEventListener("DOMContentLoaded", init);
