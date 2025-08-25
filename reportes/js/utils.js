// PR/reportes/js/utils.js
export const TIME_ZONE = "America/Mexico_City";


export function fmt(n) {
  return (n ?? 0).toLocaleString("es-MX");
}

export function getInputValues() {
  return {
    api: document.querySelector("#api").value.replace(/\/+$/, ''),
    tipo: document.querySelector("#fTipo").value.trim().toLowerCase(), // "", "comedor", "transporte"
    desde: document.querySelector("#desde").value,  // yyyy-mm-dd (LOCAL)
    hasta: document.querySelector("#hasta").value,  // yyyy-mm-dd (LOCAL)
    turno: document.querySelector("#fTurno") ? document.querySelector("#fTurno").value.trim() : "",
    sede: (document.querySelector("#fSede")?.value || "").trim().toLowerCase(),
    disp: (document.querySelector("#fDispositivo")?.value || "").trim().toLowerCase(),
    texto: (document.querySelector("#fTexto")?.value || "").trim().toLowerCase()
  };
}

/** Muestra un ISO (UTC) como fecha/hora LOCAL America/Chicago */
export function formatLocal(isoUtc) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc); // UTC parse
  // Ej: 18/08/2025 12:19 p. m.
  return d.toLocaleString("es-MX", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true
  });
}

/**
 * Convierte un yyyy-mm-dd (interpretado en zona LOCAL solicitada) a límite inferior/superior.
 * Devuelve objetos Date con hora local (sin 'Z'), que el motor convierte a epoch correctamente.
 */
export function localDayStart(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`); // local midnight
}
export function localDayEnd(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T23:59:59`); // local end of day
}

// ===== Tipo helpers =====
export function inferTipo(r){
  if (r.tipo) return normalizeTipo(r.tipo);
  if (r.encuesta) return normalizeTipo(r.encuesta);
  if (r.origen) return normalizeTipo(r.origen);
  if (r.proyecto) return normalizeTipo(r.proyecto);
  if (r.app) return normalizeTipo(r.app);

  const d = (r.dispositivo_id || "").toLowerCase();
  if (d.includes("transporte")) return "transporte";
  if (d.includes("comedor")) return "comedor";
  return "desconocido";
}

function normalizeTipo(v){
  const s = (""+v).toLowerCase();
  if (s.includes("trans")) return "transporte";
  if (s.includes("comedor")) return "comedor";
  return s;
}

export function downloadCSV(rows) {
  const headers = ["created_at","calificacion","motivo","dispositivo_id","sede","tipo"];
  const lines = [headers.join(",")];
  for (const r of rows){
    const tipo = inferTipo(r) || "";
    const createdLocal = formatLocal(r.created_at).replace(/,/g,""); // legible en Excel
    const row = [
      `"${createdLocal.replace(/"/g,'""')}"`,
      `"${(r.calificacion ?? "").toString().replace(/"/g,'""')}"`,
      `"${(r.motivo ?? "").toString().replace(/"/g,'""')}"`,
      `"${(r.dispositivo_id ?? "").toString().replace(/"/g,'""')}"`,
      `"${(r.sede ?? "").toString().replace(/"/g,'""')}"`,
      `"${tipo.toString().replace(/"/g,'""')}"`
    ].join(",");
    lines.push(row);
  }
  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "reporte_encuesta.csv"; a.click();
  URL.revokeObjectURL(url);
}


// ===================== Turnos (horarios) =====================
// Convierte "HH:MM AM/PM" a minutos desde 00:00 (zona local del navegador)
export function toMinutes(hhmmAP) {
  const s = hhmmAP.trim().toUpperCase();
  const ampm = s.endsWith("AM") || s.endsWith("PM") ? s.slice(-2) : null;
  const core = ampm ? s.slice(0, -2).trim() : s;
  const [hStr, mStr = "0"] = core.split(":");
  let h = parseInt(hStr, 10); const m = parseInt(mStr, 10);
  if (ampm) {
    if (ampm === "AM") { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
  }
  return h * 60 + m;
}

// Minutos locales del Date
export function dateToMinutesLocal(d) {
  return d.getHours() * 60 + d.getMinutes();
}

// Definiciones exactas de turnos
export const SHIFT_DEFS = {
  T1:    { label: "1° Turno", startMin: toMinutes("6:00 AM"),  endMin: toMinutes("2:00 PM"),  overnight: false },
  T2:    { label: "2° Turno", startMin: toMinutes("2:00 PM"),  endMin: toMinutes("11:00 PM"), overnight: false },
  T3:    { label: "3° Turno", startMin: toMinutes("11:00 PM"), endMin: toMinutes("6:00 AM"),  overnight: true  },
  MIXTO: { label: "Mixto",    startMin: toMinutes("8:24 AM"),  endMin: toMinutes("6:00 PM"),  overnight: false },
  "4X3": { label: "4X3",      startMin: toMinutes("6:00 AM"),  endMin: toMinutes("6:00 PM"),  overnight: false }
};

// ¿Un minuto cae dentro del turno? [inicio, fin) para no duplicar en fronteras
export function isMinuteInShift(min, def) {
  const { startMin, endMin, overnight } = def;
  if (!overnight) return min >= startMin && min < endMin;
  // Cruza medianoche: [start, 1440) U [0, end)
  return (min >= startMin && min < 1440) || (min >= 0 && min < endMin);
}

// ¿Un Date local cae dentro del turno?
export function isDateInShiftLocal(d, def) {
  if (!(d instanceof Date) || isNaN(d)) return false;
  return isMinuteInShift(dateToMinutesLocal(d), def);
}

