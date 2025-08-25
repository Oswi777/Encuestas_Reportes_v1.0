// PR/reportes/js/reportes.js
import { getInputValues, fmt, downloadCSV, inferTipo, formatLocal, localDayStart, localDayEnd, TIME_ZONE, SHIFT_DEFS, isDateInShiftLocal } from "./utils.js";
import { renderCharts, renderComparativaSatisfaccion, renderTopMotivosNegativos, renderTrendDailyLocal } from "./charts.js";

const cfg = window.APP_CONFIG;
const FILTER_KEY = "reportes_filters_v3";

// DOM refs (igual que antes)...
const estado = document.getElementById("estado");
const apiInput = document.getElementById("api");
const fTipo = document.getElementById("fTipo");
const desde = document.getElementById("desde");
const hasta = document.getElementById("hasta");
const fTurno = document.getElementById("fTurno");
const fSede = document.getElementById("fSede");
const fDisp = document.getElementById("fDispositivo");
const fTexto = document.getElementById("fTexto");
const btnCargar = document.getElementById("btnCargar");
const btnCSV = document.getElementById("btnCSV");
const btnExportPDF = document.getElementById("btnExportPDF");
const auto = document.getElementById("auto");

const kpiTotal = document.getElementById("kpiTotal");
const kpiRango = document.getElementById("kpiRango");
const kpiSat = document.getElementById("kpiSat");
const kpiNoSat = document.getElementById("kpiNoSat");
const kpiMotivo = document.getElementById("kpiMotivo");

const tbody = document.querySelector("#tabla tbody");
const lblRangoTabla = document.getElementById("lblRangoTabla");
const lblTotalTabla = document.getElementById("lblTotalTabla");
const lblPagina = document.getElementById("lblPagina");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");

let dataAll = [];
let dataFiltered = [];
let page = 1;
let timer = null;

// ==== persistencia de filtros ====
function restoreFilters(){
  const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}");
  apiInput.value = saved.api || cfg.apiBase;
  if (saved.tipo !== undefined) fTipo.value = saved.tipo || "";
  if (saved.desde) desde.value = saved.desde;
  if (saved.hasta) hasta.value = saved.hasta;
  if (fTurno && saved.turno !== undefined) fTurno.value = saved.turno || "";
  if (fSede && saved.sede) fSede.value = saved.sede;
  if (fDisp && saved.disp) fDisp.value = saved.disp;
  if (fTexto && saved.texto) fTexto.value = saved.texto;

  if (!desde.value || !hasta.value){
    const today = new Date();
    const past = new Date(Date.now() - 6*86400000);
    if (!desde.value) desde.value = past.toISOString().slice(0,10);
    if (!hasta.value) hasta.value = today.toISOString().slice(0,10);
  }
  auto.checked = !!saved.auto;
}
function persistFilters(){
  const v = getInputValues();
  localStorage.setItem(FILTER_KEY, JSON.stringify({ ...v, auto: auto.checked }));
}

// ==== auto refresh controlado ====
function setAutoTimer(enabled){
  if (timer){ clearInterval(timer); timer = null; }
  if (enabled){ timer = setInterval(fetchData, cfg.autoRefreshMs); }
}

// ==== fetch ====
async function fetchData(){
  const { api, tipo, desde: dStr, hasta: hStr } = getInputValues();
  estado.textContent = "Cargando...";
  try{
    const qs = new URLSearchParams();
    if (tipo) qs.set("tipo", tipo);
    if (dStr) qs.set("desde", dStr);
    if (hStr) qs.set("hasta", hStr);

    const url = `${api}/api/respuestas${qs.toString() ? `?${qs.toString()}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(res.status);
    dataAll = await res.json();

    estado.textContent = "OK";
    applyFilters();
  }catch(e){
    estado.textContent = "Error: " + e.message;
    dataAll = [];
    applyFilters();
  }
}

// ==== filtros + render ====


function applyFilters(){
  const { tipo, desde: dStr, hasta: hStr, turno, sede, disp, texto } = getInputValues();

  const d0 = localDayStart(dStr);
  const d1 = localDayEnd(hStr);

  dataFiltered = dataAll.filter(r => {
    const t = new Date(r.created_at);
    if (d0 && t < d0) return false;
    if (d1 && t > d1) return false;
    if (turno) {
  const def = SHIFT_DEFS[turno];
  if (def) {
    if (!isDateInShiftLocal(t, def)) return false;
  }
  // si no hay definición (turno=""), no se filtra.
}


    if (tipo){
      const rt = inferTipo(r);
      if (rt !== tipo) return false;
    }
    if (sede && (r.sede||"").toLowerCase().indexOf(sede) === -1) return false;
    if (disp && (r.dispositivo_id||"").toLowerCase().indexOf(disp) === -1) return false;

    if (texto){
      const blob = `${r.calificacion||""} ${r.motivo||""}`.toLowerCase();
      if (blob.indexOf(texto) === -1) return false;
    }
    return true;
  });

  page = 1;
  renderAll();
}

function renderAll(){
  renderKPIs();

  const c1 = Chart.getChart("chartRatings"); if (c1) c1.destroy();
  const c2 = Chart.getChart("chartDaily");   if (c2) c2.destroy();
  renderCharts(dataFiltered);

  // ⬇️ Tendencia por día LOCAL (arregla que no graficaba)
  const ct = Chart.getChart("tendenciaChart"); if (ct) ct.destroy();
  renderTrendDailyLocal(dataFiltered, TIME_ZONE);

  const c3 = Chart.getChart("chartCompare"); if (c3) c3.destroy();
  const c4 = Chart.getChart("chartTopNeg");  if (c4) c4.destroy();
  if (document.getElementById("chartCompare"))  renderComparativaSatisfaccion(dataFiltered);
  if (document.getElementById("chartTopNeg"))   renderTopMotivosNegativos(dataFiltered);

  renderTable();
}

function renderKPIs(){
  const n = dataFiltered.length;
  kpiTotal.textContent = fmt(n);
  kpiRango.textContent = `${desde.value || "—"} a ${hasta.value || "—"}`;

  const counts = {Excelente:0, Bueno:0, Regular:0, Malo:0};
  const motivos = {};
  for (const r of dataFiltered){
    if (counts[r.calificacion] != null) counts[r.calificacion]++;
    const m = r.motivo || "—";
    motivos[m] = (motivos[m]||0) + 1;
  }
  const pos = counts.Excelente + counts.Bueno;
  const neg = counts.Regular + counts.Malo;
  const total = pos + neg || 1;
  kpiSat.textContent = Math.round(pos*100/total) + "%";
  kpiNoSat.textContent = Math.round(neg*100/total) + "%";

  let topMotivo = "—", topCount = 0;
  for (const [m, c] of Object.entries(motivos)){
    if (c > topCount){ topCount = c; topMotivo = m; }
  }
  kpiMotivo.textContent = topMotivo;
}

function renderTable(){
  const total = dataFiltered.length;
  const perPage = cfg.perPage;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(page, pages);
  const start = (page-1)*perPage;
  const end = Math.min(start + perPage, total);

  lblRangoTabla.textContent = total ? `${start+1}–${end}` : "0–0";
  lblTotalTabla.textContent = fmt(total);
  lblPagina.textContent = `Página ${page} / ${pages}`;

  tbody.innerHTML = dataFiltered.slice(start, end).map(r => {
    const tipo = inferTipo(r);
    return `
      <tr>
        <td>${formatLocal(r.created_at)}</td>
        <td>${r.calificacion ?? ""}</td>
        <td>${r.motivo ?? ""}</td>
        <td>${r.dispositivo_id || "-"}</td>
        <td>${r.sede || "-"}</td>
        <td>${tipo === "desconocido" ? "—" : tipo}</td>
      </tr>
    `;
  }).join("");

  btnPrev.disabled = page<=1;
  btnNext.disabled = page>=pages;
}

// ==== eventos ====
btnCargar.addEventListener("click", () => { persistFilters(); fetchData(); });
btnCSV.addEventListener("click", () => downloadCSV(dataFiltered));
btnExportPDF?.addEventListener("click", () => {
  // (tu exportación PDF si la tienes implementada)
});
[apiInput, fTipo, desde, hasta, fTurno, fSede, fDisp, fTexto].forEach(el => {
  el?.addEventListener("change", () => { persistFilters(); applyFilters(); });
});
fTexto?.addEventListener("keyup", () => { persistFilters(); applyFilters(); });

btnPrev.addEventListener("click", ()=>{ page=Math.max(1,page-1); renderTable(); });
btnNext.addEventListener("click", ()=>{ page=page+1; renderTable(); });

auto.addEventListener("change", ()=>{
  persistFilters();
  setAutoTimer(auto.checked);
});

// ==== init ====
(function init(){
  restoreFilters();
  applyFilters();
  fetchData();
  setAutoTimer(auto.checked);
})();
