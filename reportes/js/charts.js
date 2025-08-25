// PR/reportes/js/charts.js
// Defaults globales Chart.js (look corporativo)
Chart.defaults.color = "#eaf0f7";
Chart.defaults.font.family = "Montserrat, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
Chart.defaults.borderColor = "rgba(255,255,255,.08)";

// ==================== Helpers de fecha ====================
function localDateKeyFromISO(isoUtc, timeZone) {
  // Devuelve "YYYY-MM-DD" del día LOCAL para ese ISO UTC
  const d = new Date(isoUtc);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // ej: 2025-08-18
}

// ==================== Gráficas existentes ====================
export function renderCharts(dataFiltered){
  // --- Ratings ---
  const counts = {Excelente:0, Bueno:0, Regular:0, Malo:0};
  for (const r of dataFiltered){ if(counts[r.calificacion]!=null) counts[r.calificacion]++; }

  const ratingsCanvas = document.getElementById("chartRatings");
  const old1 = Chart.getChart(ratingsCanvas);
  if (old1) old1.destroy();

  new Chart(ratingsCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["Excelente","Bueno","Regular","Malo"],
      datasets: [{
        label: "Respuestas",
        data: [counts.Excelente, counts.Bueno, counts.Regular, counts.Malo],
        backgroundColor: ["#27ae60","#2d9cdb","#f2c94c","#eb5757"],
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.12)"
      }]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      resizeDelay:150,
      scales:{ y:{ beginAtZero:true, grid:{color:"rgba(255,255,255,.1)"} },
               x:{ grid:{display:false} } },
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:"rgba(7,12,20,.95)",
          borderColor:"rgba(255,255,255,.08)",
          borderWidth:1,
          padding:10,
          titleColor:"#eaf0f7",
          bodyColor:"#cfe3ff"
        }
      }
    }
  });

  // --- Daily stacked ---
  const byDay = {};
  for (const r of dataFiltered){
    const d = (r.created_at||"").slice(0,10);
    byDay[d] = byDay[d] || {Excelente:0,Bueno:0,Regular:0,Malo:0};
    byDay[d][r.calificacion] = (byDay[d][r.calificacion]||0) + 1;
  }
  const days = Object.keys(byDay).sort();
  const dsEx = days.map(d=>byDay[d].Excelente||0);
  const dsBu = days.map(d=>byDay[d].Bueno||0);
  const dsRe = days.map(d=>byDay[d].Regular||0);
  const dsMa = days.map(d=>byDay[d].Malo||0);

  const dailyCanvas = document.getElementById("chartDaily");
  const old2 = Chart.getChart(dailyCanvas);
  if (old2) old2.destroy();

  new Chart(dailyCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: days,
      datasets: [
        { label:"Excelente", data: dsEx, backgroundColor:"#27ae60", stack:"s", borderRadius:6, borderWidth:1, borderColor:"rgba(255,255,255,.12)" },
        { label:"Bueno",     data: dsBu, backgroundColor:"#2d9cdb", stack:"s", borderRadius:6, borderWidth:1, borderColor:"rgba(255,255,255,.12)" },
        { label:"Regular",   data: dsRe, backgroundColor:"#f2c94c", stack:"s", borderRadius:6, borderWidth:1, borderColor:"rgba(255,255,255,.12)" },
        { label:"Malo",      data: dsMa, backgroundColor:"#eb5757", stack:"s", borderRadius:6, borderWidth:1, borderColor:"rgba(255,255,255,.12)" }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      resizeDelay:150,
      scales:{
        x:{ stacked:true, grid:{display:false} },
        y:{ stacked:true, beginAtZero:true, grid:{color:"rgba(255,255,255,.1)"} }
      },
      plugins:{
        legend:{ labels:{ color:"#eaf0f7" } },
        tooltip:{
          backgroundColor:"rgba(7,12,20,.95)",
          borderColor:"rgba(255,255,255,.08)",
          borderWidth:1,
          padding:10,
          titleColor:"#eaf0f7",
          bodyColor:"#cfe3ff"
        }
      }
    }
  });
}

// ==================== NUEVO: Tendencia por día (LOCAL) ====================
export function renderTrendDailyLocal(dataFiltered, timeZone){
  const califs = ["Excelente","Bueno","Regular","Malo"];
  const color = { Excelente:"#27ae60", Bueno:"#2d9cdb", Regular:"#f2c94c", Malo:"#eb5757" };

  // Agrupar por día LOCAL
  const byLocalDay = {}; // { 'YYYY-MM-DD': {Excelente:n, ...} }
  for (const r of dataFiltered){
    if (!r.created_at) continue;
    const key = localDateKeyFromISO(r.created_at, timeZone);
    byLocalDay[key] = byLocalDay[key] || {Excelente:0,Bueno:0,Regular:0,Malo:0};
    if (byLocalDay[key][r.calificacion] !== undefined) {
      byLocalDay[key][r.calificacion]++;
    }
  }
  const days = Object.keys(byLocalDay).sort();

  const datasets = califs.map(c => ({
    label: c,
    data: days.map(d => byLocalDay[d][c] || 0),
    borderColor: color[c],
    backgroundColor: color[c],
    borderWidth: 2,
    pointRadius: 2,
    tension: 0.25,
    fill: false
  }));

  const el = document.getElementById("tendenciaChart");
  if (!el) return;
  const old = Chart.getChart(el);
  if (old) old.destroy();

  new Chart(el.getContext("2d"), {
    type: "line",
    data: { labels: days, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 150,
      plugins: {
        legend: { labels: { color: "#eaf0f7" } },
        tooltip:{
          backgroundColor:"rgba(7,12,20,.95)",
          borderColor:"rgba(255,255,255,.08)",
          borderWidth:1,
          padding:10,
          titleColor:"#eaf0f7",
          bodyColor:"#cfe3ff"
        }
      },
      scales: {
        x: { grid: { display:false } },
        y: { beginAtZero:true, grid:{ color:"rgba(255,255,255,.1)" } }
      }
    }
  });
}

// ==================== NUEVAS: Comparativa / Top negativos ====================
export function renderComparativaSatisfaccion(dataFiltered){
  const tipos = ["comedor","transporte"];
  const clases = { pos: ["Excelente","Bueno"], neg: ["Regular","Malo"] };

  function satCounts(tipo){
    const subset = dataFiltered.filter(r => inferTipoLocal(r) === tipo);
    let pos = 0, neg = 0;
    for (const r of subset){
      if (clases.pos.includes(r.calificacion)) pos++;
      else if (clases.neg.includes(r.calificacion)) neg++;
    }
    return { pos, neg };
  }

  function inferTipoLocal(r){
    if (r.tipo) return normalizeTipo(r.tipo);
    const d = (r.dispositivo_id||"").toLowerCase();
    if (d.includes("transporte")) return "transporte";
    if (d.includes("comedor")) return "comedor";
    return "desconocido";
  }
  function normalizeTipo(v){ const s=(""+v).toLowerCase(); if (s.includes("trans")) return "transporte"; if (s.includes("comedor")) return "comedor"; return s; }

  const c = tipos.map(t => satCounts(t));
  const labels = ["Comedor","Transporte"];
  const dataPos = [c[0].pos, c[1].pos];
  const dataNeg = [c[0].neg, c[1].neg];

  const el = document.getElementById("chartCompare");
  if (!el) return;
  const old = Chart.getChart(el);
  if (old) old.destroy();

  new Chart(el.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label:"Satisfechos",    data: dataPos, backgroundColor:"#27ae60", stack:"x", borderRadius:8 },
        { label:"No satisfechos", data: dataNeg, backgroundColor:"#eb5757", stack:"x", borderRadius:8 }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, grid:{ color:"rgba(255,255,255,.1)" } },
        y: { grid:{ display:false } }
      },
      plugins: {
        legend: { labels: { color: "#eaf0f7" } },
        tooltip:{
          backgroundColor:"rgba(7,12,20,.95)",
          borderColor:"rgba(255,255,255,.08)",
          borderWidth:1,
          padding:10,
          titleColor:"#eaf0f7",
          bodyColor:"#cfe3ff"
        }
      }
    }
  });
}

export function renderTopMotivosNegativos(dataFiltered){
  const NEG = new Set(["Regular","Malo"]);
  const freq = {};
  for (const r of dataFiltered){
    if (NEG.has(r.calificacion)){
      const m = r.motivo || "—";
      freq[m] = (freq[m]||0) + 1;
    }
  }
  const top = Object.entries(freq)
    .sort((a,b)=> b[1]-a[1])
    .slice(0,5);

  const labels = top.map(([m]) => m);
  const values = top.map(([,n]) => n);

  const el = document.getElementById("chartTopNeg");
  if (!el) return;
  const old = Chart.getChart(el);
  if (old) old.destroy();

  new Chart(el.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label:"Respuestas", data: values, backgroundColor:"#f2c94c", borderRadius:8 }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x:{ beginAtZero:true, grid:{ color:"rgba(255,255,255,.1)"} }, y:{ grid:{ display:false } } },
      plugins: { legend:{ display:false } }
    }
  });
}
