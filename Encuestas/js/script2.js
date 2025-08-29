// ===============================
// Config
// ===============================
//let API_URL   = "http://localhost:8000";
let API_URL   = "https://encuestas-reportes.onrender.com";
let DEVICE_ID = "tablet-transporte-01";
let SEDE      = "Saltillo";
const APP_TIPO  = "transporte";
const APP_ID    = "transporte";     // namespace por app
const QUEUE_KEY = "queue_transporte";

// ===============================
const contenedor    = document.getElementById("contenedor");
const preguntaEl    = document.getElementById("pregunta");
const btnBack       = document.getElementById("btnBack");
const btnFullscreen = document.getElementById("btnFullscreen");

// ===============================
const opcionesNegativas = ["Retraso", "Conducción brusca", "Suciedad", "Sobrecupo", "Ruta incorrecta", "Otro"];
const opcionesPositivas = ["Puntualidad", "Confort", "Amabilidad", "Seguridad", "Limpieza", "Otro"];
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

// Scheduler único
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
function setPreguntaPrincipal(){ preguntaEl && (preguntaEl.textContent="¿Qué tal estuvo el servicio de transporte?"); btnBack && btnBack.classList.add("oculto"); }
function setPreguntaSecundaria(){ preguntaEl && (preguntaEl.textContent=`¿Por qué calificaste “${seleccionPrincipal}”?`); btnBack && btnBack.classList.remove("oculto"); }

// ===== Formulario “Otro” =====
// ===== Formulario “Otro” con soporte Enter (iPad/iOS) =====
// ===== Formulario “Otro” con soporte Enter (iPad + Android) =====
function openOtroDialog(onSubmit){
  const wrap = document.createElement("div");
  wrap.style.position="fixed"; wrap.style.inset="0"; wrap.style.zIndex="200";
  wrap.innerHTML = `
    <div class="ux-modal-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>
    <div role="dialog" aria-modal="true"
         style="position:absolute;inset:0;margin:auto;width:min(520px,92%);
                background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
                border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px;color:#eaf0f7;
                box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:calc(100dvh - 20px);overflow:auto;">
      <h3 style="margin:0 0 10px;font-size:18px">Cuéntanos más</h3>

      <form id="otro-form" autocomplete="off" novalidate style="display:grid;gap:10px">
        <label style="font-size:12px;color:#cfe3ff;display:grid;gap:4px">
          Número de empleado (requerido)
          <input id="otro-emp" type="tel" inputmode="numeric" pattern="[0-9]*"
                 enterkeyhint="next" autocapitalize="off" autocorrect="off" spellcheck="false"
                 style="background:#0b1726;color:#eaf0f7;border:1px solid #22314a;border-radius:10px;padding:10px 12px;outline:none;font-size:16px" />
        </label>

        <label style="font-size:12px;color:#cfe3ff;display:grid;gap:4px">
          Comentario (requerido)
          <input id="otro-com" maxlength="200"
                 enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false"
                 style="background:#0b1726;color:#eaf0f7;border:1px solid #22314a;border-radius:10px;padding:10px 12px;outline:none;font-size:16px" />
        </label>

        <div id="otro-msg" style="min-height:18px;color:#ffdca8;font-size:12px"></div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button type="button" id="otro-cancel" class="btn-aux">Cancelar</button>
          <button type="submit" id="otro-ok" class="btn-aux">Guardar</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(wrap);

  const form = wrap.querySelector("#otro-form");
  const emp  = wrap.querySelector("#otro-emp");
  const com  = wrap.querySelector("#otro-com");
  const msg  = wrap.querySelector("#otro-msg");
  const btnCancel = wrap.querySelector("#otro-cancel");

  function close(){ wrap.remove(); }

  // No cerramos por tocar el fondo para evitar perder el formulario
  btnCancel.onclick = close;

  // Foco inicial (Android/iOS)
  setTimeout(()=>{
    emp.focus({ preventScroll:false });
    emp.scrollIntoView({ block:"center", behavior:"smooth" });
  }, 50);

  // Utilidad: detectar tecla Enter en distintos navegadores/teclados
  function isEnter(ev){
    return ev.key === "Enter" || ev.keyCode === 13;
  }

  // Enter en EMPLEADO -> pasa a COMENTARIO si válido
  const goToComment = ()=>{
    const v = emp.value.trim();
    if (!v || !/^[0-9]+$/.test(v)){
      msg.textContent = "Ingresa un número de empleado válido.";
      emp.focus();
      return;
    }
    com.focus({ preventScroll:false });
    com.scrollIntoView({ block:"center", behavior:"smooth" });
  };
  emp.addEventListener("keydown", (ev)=>{ if (isEnter(ev)) { ev.preventDefault(); goToComment(); } });
  // Fallback para teclados que solo disparan keyup
  emp.addEventListener("keyup",   (ev)=>{ if (isEnter(ev)) { ev.preventDefault(); } });

  // Enter en COMENTARIO -> submit
  const trySubmit = ()=>{
    // Dispara submit estándar (compatible iOS/Android)
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", {cancelable:true, bubbles:true}));
  };
  com.addEventListener("keydown", (ev)=>{ if (isEnter(ev)) { ev.preventDefault(); trySubmit(); } });
  com.addEventListener("keyup",   (ev)=>{ if (isEnter(ev)) { ev.preventDefault(); } });

  // Submit (click Guardar o Enter en comentario)
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const empVal = emp.value.trim();
    const comVal = com.value.trim();

    if (!empVal || !/^[0-9]+$/.test(empVal)){
      msg.textContent = "Ingresa un número de empleado válido.";
      emp.focus();
      return;
    }
    if (!comVal || comVal.length < 3){
      msg.textContent = "Escribe un comentario (mín. 3 caracteres).";
      com.focus();
      return;
    }

    onSubmit({ empleado: empVal, comentario: comVal });
    close();
  });
}


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

      if (opcion === "Otro"){
        openOtroDialog((extra)=>{ showThankYou(opcion, extra); });
      }else{
        showThankYou(opcion, null);
      }
    };
    contenedor.appendChild(btn);
  });
}

function showThankYou(motivo, extraMeta){
  state=STATE.THANKYOU;
  setInteraction(false);
  enviarRespuesta(seleccionPrincipal, motivo, extraMeta);
  contenedor.innerHTML=`
    <div class="mensaje-agradecimiento">
      ¡Gracias por tu opinión!<br/><small>${seleccionPrincipal} · ${motivo}${extraMeta? " · #" + extraMeta.empleado : ""}</small>
    </div>`;
  scheduleReset(1500);
}

// ===============================
async function enviarRespuesta(principal, motivo, extraMeta){
  const payload = {
    sede:SEDE, dispositivo_id:DEVICE_ID, tipo:APP_TIPO,
    calificacion:principal, motivo,
    meta:{
      ua:navigator.userAgent,
      screen:`${screen.width}x${screen.height}`,
      ts:new Date().toISOString(),
      ...(extraMeta ? { otro: { empleado: String(extraMeta.empleado||"").trim(), comentario: String(extraMeta.comentario||"").trim() } } : {})
    }
  };
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
