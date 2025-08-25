/* ux.js — utilidades UI sin interferencia entre pestañas
   - NO usa localStorage/BroadcastChannel para resets
   - Config por appId (namespaced)
   - Inactividad local (solo timers y eventos en la pestaña)
*/
(function(){
  function storageKey(appId){ return `kiosk_cfg_${appId||"default"}`; }

  function loadConfig({ apiUrl, sede, deviceId, appId="default" }){
    try{
      const saved = JSON.parse(localStorage.getItem(storageKey(appId)) || "{}");
      return {
        apiUrl:   saved.apiUrl   ?? apiUrl,
        sede:     saved.sede     ?? sede,
        deviceId: saved.deviceId ?? deviceId,
        pin:      saved.pin      ?? "1234",
      };
    }catch{ return { apiUrl, sede, deviceId, pin:"1234" }; }
  }

  function saveConfig(appId, cfg){
    const key = storageKey(appId);
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...cur, ...cfg }));
  }

  // Efecto ligero en botones
  function enhanceButtons(root=document){
    root.addEventListener("click", (e)=>{
      const btn = e.target.closest(".boton-grande, .btn-aux, button");
      if (!btn) return;
      if (navigator.vibrate) { try{ navigator.vibrate(8); }catch{} }
      const circle = document.createElement("span");
      circle.className = "ux-ripple";
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      circle.style.width = circle.style.height = size+"px";
      const x = e.clientX - rect.left - size/2;
      const y = e.clientY - rect.top  - size/2;
      circle.style.left = x+"px";
      circle.style.top  = y+"px";
      btn.appendChild(circle);
      setTimeout(()=>circle.remove(), 420);
    }, { passive:true });
  }

  // Inactividad local (sin señales cross-tab)
  function setupInactivityReset(cb, idleMs=30000){
    let t=null, disposed=false;
    const arm = ()=>{
      if (disposed) return;
      if (t) clearTimeout(t);
      t = setTimeout(()=>{ t=null; cb && cb(); }, idleMs);
    };
    const listener = ()=>arm();
    ["click","touchstart","keydown","mousemove","wheel"].forEach(ev=>{
      document.addEventListener(ev, listener, { passive:true });
    });
    arm();
    return {
      dispose(){
        disposed=true;
        if (t) clearTimeout(t);
        ["click","touchstart","keydown","mousemove","wheel"].forEach(ev=>{
          document.removeEventListener(ev, listener, { passive:true });
        });
      },
      kick: arm,
      trigger(){ cb && cb(); }
    };
  }

  // Chip online/offline simple (opcional)
  function setupNetworkChip(getQueueSizeFn){
    let chip = document.getElementById("ux-chip");
    if (!chip){
      chip = document.createElement("div");
      chip.id = "ux-chip";
      chip.className = "ux-chip";
      document.body.appendChild(chip);
    }
    function render(){
      const online = navigator.onLine;
      const q = Number(getQueueSizeFn ? getQueueSizeFn() : 0) || 0;
      chip.textContent = online ? (q ? `En línea · Cola ${q}` : "En línea") : `Sin conexión · Cola ${q}`;
      chip.dataset.state = online ? "online" : "offline";
    }
    window.addEventListener("online",  render);
    window.addEventListener("offline", render);
    setInterval(render, 5000);
    render();
  }

  // Menú admin (long-press esquina) con appId
  function setupAdminMenu({ defaults, onSave, appId="default" }){
    let modal = document.getElementById("ux-modal");
    if (!modal){
      modal = document.createElement("div");
      modal.id = "ux-modal";
      modal.innerHTML = `
        <div class="ux-modal-backdrop" data-close></div>
        <div class="ux-modal-card" role="dialog" aria-modal="true">
          <h3>Configuración del kiosco</h3>
          <div class="ux-form">
            <label>PIN actual<input type="password" id="ux-pin"/></label>
            <label>API URL<input type="text" id="ux-api"/></label>
            <label>SEDE<input type="text" id="ux-sede"/></label>
            <label>DISPOSITIVO ID<input type="text" id="ux-device"/></label>
            <label>Nuevo PIN (opcional)<input type="password" id="ux-newpin"/></label>
          </div>
          <div class="ux-actions">
            <button id="ux-test" class="btn-aux">Probar API</button>
            <button id="ux-save" class="btn-aux">Guardar</button>
            <button id="ux-cancel" class="btn-aux">Cancelar</button>
          </div>
          <div id="ux-msg" class="ux-msg muted"></div>
        </div>`;
      document.body.appendChild(modal);
      const hide = ()=> modal.classList.remove("open");
      const msg  = (t)=> modal.querySelector("#ux-msg").textContent = t;

      modal.querySelector("[data-close]").addEventListener("click", hide);
      modal.querySelector("#ux-cancel").addEventListener("click", hide);

      modal.querySelector("#ux-save").addEventListener("click", ()=>{
        const cur = loadConfig({ ...defaults, appId });
        const pin = modal.querySelector("#ux-pin").value.trim();
        if (pin !== (cur.pin||"1234")) return msg("PIN incorrecto");
        const apiUrl  = modal.querySelector("#ux-api").value.trim();
        const sede    = modal.querySelector("#ux-sede").value.trim();
        const device  = modal.querySelector("#ux-device").value.trim();
        const newPin  = modal.querySelector("#ux-newpin").value.trim();
        if (!apiUrl) return msg("API URL es requerida");
        saveConfig(appId, { apiUrl, sede, deviceId: device, pin: newPin || cur.pin });
        onSave && onSave(loadConfig({ ...defaults, appId }));
        msg("Guardado ✓"); setTimeout(hide, 550);
      });

      modal.querySelector("#ux-test").addEventListener("click", async ()=>{
        const api = modal.querySelector("#ux-api").value.trim().replace(/\/+$/,'');
        try{
          const r = await fetch(`${api}/api/health`, { cache:"no-store" });
          if (!r.ok) throw 0; msg("API OK ✓");
        }catch{ msg("Error al probar API"); }
      });
    }

    function show(){
      const latest = loadConfig({ ...defaults, appId });
      modal.querySelector("#ux-api").value    = latest.apiUrl || "";
      modal.querySelector("#ux-sede").value   = latest.sede   || "";
      modal.querySelector("#ux-device").value = latest.deviceId || "";
      modal.querySelector("#ux-pin").value    = "";
      modal.querySelector("#ux-newpin").value = "";
      modal.classList.add("open");
    }

    const hot = document.getElementById("ux-hotcorner") || (()=>{ const d=document.createElement("div"); d.id="ux-hotcorner"; document.body.appendChild(d); return d; })();
    let pressTimer=null;
    const start = ()=>{ pressTimer=setTimeout(show, 1200); };
    const cancel= ()=>{ if (pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };
    ["touchstart","mousedown"].forEach(ev=>hot.addEventListener(ev,start));
    ["touchend","touchmove","mouseleave","mouseup","blur"].forEach(ev=>hot.addEventListener(ev,cancel));

    return { show, loadConfig:(defs)=>loadConfig({ ...defs, appId }), saveConfig:(cfg)=>saveConfig(appId,cfg) };
  }

  window.UX = { loadConfig, saveConfig:(appId,cfg)=>saveConfig(appId,cfg), enhanceButtons, setupInactivityReset, setupNetworkChip, setupAdminMenu };
})();

