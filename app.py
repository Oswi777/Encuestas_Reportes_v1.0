import os
import json
import sqlite3
import tempfile
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# ---------- DB path ----------
def resolve_db_path():
    # Si defines SQLITE_PATH en variables de entorno, se respeta.
    env_db = os.getenv("SQLITE_PATH")
    if env_db:
        return env_db
    # En plataformas PaaS el FS es efímero; ponemos el .db en /tmp
    if os.getenv("RENDER") or os.getenv("KOYEB") or os.getenv("PORT"):
        return os.path.join(tempfile.gettempdir(), "encuesta.db")
    # En local, junto al app.py
    return os.path.join(os.path.dirname(__file__), "encuesta.db")

DB = resolve_db_path()
ALLOWED_TIPOS = {"comedor", "transporte"}

# ---------- Flask app ----------
app = Flask(__name__)
# CORS solo para API; sirve frontend sin CORS
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Directorios base para servir páginas y assets
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENC_DIR  = os.path.join(BASE_DIR, "Encuestas")
REP_DIR  = os.path.join(BASE_DIR, "reportes")

# ---------- DB helpers ----------
def get_db():
    con = sqlite3.connect(DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    try:
        con.execute("PRAGMA journal_mode=WAL;")
        con.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    return con

def table_has_column(con, table, column):
    cur = con.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())

def init_db():
    con = get_db()
    con.execute("""
        CREATE TABLE IF NOT EXISTS respuestas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            sede TEXT,
            dispositivo_id TEXT,
            calificacion TEXT NOT NULL,
            motivo TEXT NOT NULL,
            meta TEXT,
            tipo TEXT
        )
    """)
    # Si la columna 'tipo' no existiera (por si vienes de una versión vieja)
    if not table_has_column(con, "respuestas", "tipo"):
        con.execute("ALTER TABLE respuestas ADD COLUMN tipo TEXT")
        con.execute("""
            UPDATE respuestas
            SET tipo = CASE
                WHEN lower(coalesce(dispositivo_id,'')) LIKE '%transporte%' THEN 'transporte'
                WHEN lower(coalesce(dispositivo_id,'')) LIKE '%comedor%'    THEN 'comedor'
                ELSE 'desconocido'
            END
            WHERE tipo IS NULL OR tipo = ''
        """)
        con.commit()

    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_created_at ON respuestas(created_at)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_tipo       ON respuestas(tipo)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_calif      ON respuestas(calificacion)")
    con.commit()
    con.close()

# ---------- Endpoints utilitarios ----------
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "service": "Encuestas_Reportes_v1.0"}), 200

@app.route("/api/health", methods=["GET"])
def health():
    return {"status": "ok"}

@app.route("/api/debug/echo", methods=["POST"])
def echo():
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return {"error": str(e)}, 400
    return {"echo": data}, 200

def normalize_tipo(tipo_raw, dispositivo_id=""):
    t = (tipo_raw or "").strip().lower()
    if t in ALLOWED_TIPOS:
        return t
    d = (dispositivo_id or "").lower()
    if "transporte" in d:
        return "transporte"
    if "comedor" in d:
        return "comedor"
    return "desconocido"

# ---------- API principal ----------
@app.route("/api/respuestas", methods=["POST"])
def crear_respuesta():
    data = request.get_json(force=True) or {}
    calificacion = (data.get("calificacion") or "").strip()
    motivo       = (data.get("motivo") or "").strip()
    sede         = (data.get("sede") or "").strip()
    disp         = (data.get("dispositivo_id") or "").strip()
    meta         = data.get("meta") or {}

    if calificacion not in ("Excelente", "Bueno", "Regular", "Malo"):
        return jsonify(error="calificacion invalida"), 400
    if not motivo:
        return jsonify(error="motivo requerido"), 400

    tipo = normalize_tipo(data.get("tipo"), disp)
    ts_iso = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    con = get_db()
    cur = con.execute("""
        INSERT INTO respuestas
        (created_at, sede, dispositivo_id, calificacion, motivo, meta, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (ts_iso, sede, disp, calificacion, motivo, json.dumps(meta), tipo))
    con.commit()
    rid = cur.lastrowid
    con.close()

    return jsonify(id=rid, created_at=ts_iso, tipo=tipo), 201

@app.route("/api/respuestas", methods=["GET"])
def listar_respuestas():
    """
    Filtros soportados (opcional):
      ?tipo=comedor|transporte
      ?desde=YYYY-MM-DD
      ?hasta=YYYY-MM-DD
    """
    tipo  = (request.args.get("tipo") or "").strip().lower() or None
    desde = (request.args.get("desde") or "").strip() or None
    hasta = (request.args.get("hasta") or "").strip() or None

    sql = "SELECT * FROM respuestas WHERE 1=1"
    args = []

    if tipo in ALLOWED_TIPOS:
        sql += " AND tipo = ?"
        args.append(tipo)

    # created_at en ISO "YYYY-MM-DDTHH:MM:SSZ" -> filtrar por fecha: substr(created_at,1,10)
    if desde:
        sql += " AND substr(created_at,1,10) >= ?"
        args.append(desde)
    if hasta:
        sql += " AND substr(created_at,1,10) <= ?"
        args.append(hasta)

    sql += " ORDER BY created_at DESC"

    con = get_db()
    cur = con.execute(sql, args)
    items = [dict(row) for row in cur.fetchall()]
    con.close()
    return jsonify(items)

@app.route("/api/resumen", methods=["GET"])
def resumen():
    tipo = request.args.get("tipo", "").strip().lower() or None
    desde = request.args.get("desde", "").strip() or None
    hasta = request.args.get("hasta", "").strip() or None

    sql = """
    SELECT substr(created_at,1,10) AS dia,
           tipo,
           calificacion,
           COUNT(*) AS n
    FROM respuestas
    WHERE 1=1
    """
    args = []
    if tipo in ALLOWED_TIPOS:
        sql += " AND tipo = ?"
        args.append(tipo)
    if desde:
        sql += " AND substr(created_at,1,10) >= ?"
        args.append(desde)
    if hasta:
        sql += " AND substr(created_at,1,10) <= ?"
        args.append(hasta)

    sql += " GROUP BY dia, tipo, calificacion ORDER BY dia"

    con = get_db()
    cur = con.execute(sql, args)
    rows = [dict(r) for r in cur.fetchall()]
    con.close()

    return jsonify(rows)

# ---------- Servido de páginas ----------
@app.route("/comedor")
def serve_comedor():
    """
    Sirve index_Comedor.html.
    Ajusta esta ruta si tu archivo vive dentro de /Encuestas.
    """
    # Si el archivo está en /Encuestas:
    # return send_from_directory(ENC_DIR, "index_Comedor.html")
    # Si el archivo está en la raíz del repo:
    return send_from_directory(BASE_DIR, "index_Comedor.html")

@app.route("/transporte")
def serve_transporte():
    """
    Sirve index_Transporte.html.
    Ajusta la línea según dónde esté realmente el archivo.
    """
    # return send_from_directory(ENC_DIR, "index_Transporte.html")
    return send_from_directory(BASE_DIR, "index_Transporte.html")

@app.route("/reportes")
def serve_reportes():
    """
    Sirve la vista principal de reportes desde /reportes/reportes.html
    """
    return send_from_directory(REP_DIR, "reportes.html")

# ---------- Servido de assets compartidos ----------
def _multi_send(subdirs, filename):
    for root in subdirs:
        full = os.path.join(root, filename)
        if os.path.isfile(full):
            return send_from_directory(root, filename)
    return jsonify({"error": "archivo no encontrado", "path": filename}), 404

# /assets/... -> primero Encuestas/assets, luego reportes/assets
@app.route("/assets/<path:filename>")
def serve_assets(filename):
    return _multi_send(
        [os.path.join(ENC_DIR, "assets"), os.path.join(REP_DIR, "assets")],
        filename
    )

# /js/... -> primero Encuestas/js, luego reportes/js
@app.route("/js/<path:filename>")
def serve_js(filename):
    return _multi_send(
        [os.path.join(ENC_DIR, "js"), os.path.join(REP_DIR, "js")],
        filename
    )

# --- Inicialización segura de la DB (compatible con Flask 3.x) ---
try:
    init_db()
except Exception as e:
    print("Warning: init_db failed:", e)

if __name__ == "__main__":
    # En local lee PORT si existe (compatibilidad), por defecto 8000
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
