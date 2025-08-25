import os
import json
import sqlite3
import tempfile
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# ---------- DB path ----------
def resolve_db_path():
    env_db = os.getenv("SQLITE_PATH")
    if env_db:
        return env_db
    if os.getenv("RENDER") or os.getenv("KOYEB") or os.getenv("PORT"):
        return os.path.join(tempfile.gettempdir(), "encuesta.db")
    return os.path.join(os.path.dirname(__file__), "encuesta.db")

DB = resolve_db_path()
ALLOWED_TIPOS = {"comedor", "transporte"}

# ---------- Flask ----------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Estructura real
ENC_DIR  = os.path.join(BASE_DIR, "Encuestas")
ENC_ASSETS = os.path.join(ENC_DIR, "assets")
ENC_CSS    = os.path.join(ENC_DIR, "css")
ENC_JS     = os.path.join(ENC_DIR, "js")

REP_DIR  = os.path.join(BASE_DIR, "reportes")
REP_ASSETS = os.path.join(REP_DIR, "assets")
REP_CSS    = os.path.join(REP_DIR, "css")
REP_JS     = os.path.join(REP_DIR, "js")

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

# ---------- Util ----------
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

# ---------- API ----------
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
    tipo  = (request.args.get("tipo") or "").strip().lower() or None
    desde = (request.args.get("desde") or "").strip() or None
    hasta = (request.args.get("hasta") or "").strip() or None

    sql = "SELECT * FROM respuestas WHERE 1=1"
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

# ---------- Helpers de estáticos con fallback múltiple ----------
def _multi_send(candidates, filename):
    for root in candidates:
        full = os.path.join(root, filename)
        if os.path.isfile(full):
            return send_from_directory(root, filename)
    return jsonify({"error": "archivo no encontrado", "path": filename}), 404

# ---------- Páginas ----------
@app.route("/comedor")
def page_comedor():
    return send_from_directory(ENC_DIR, "index_Comedor.html")

@app.route("/transporte")
def page_transporte():
    return send_from_directory(ENC_DIR, "index_Transporte.html")

@app.route("/reportes")
def page_reportes():
    return send_from_directory(REP_DIR, "reportes.html")

# ---------- Assets compartidos ----------
@app.route("/assets/<path:filename>")
def static_assets(filename):
    return _multi_send([ENC_ASSETS, REP_ASSETS], filename)

@app.route("/css/<path:filename>")
def static_css(filename):
    return _multi_send([ENC_CSS, REP_CSS], filename)

@app.route("/js/<path:filename>")
def static_js(filename):
    return _multi_send([ENC_JS, REP_JS], filename)

# ---------- Init DB ----------
try:
    init_db()
except Exception as e:
    print("Warning: init_db failed:", e)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
