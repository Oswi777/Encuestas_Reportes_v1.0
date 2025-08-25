from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3, json
from datetime import datetime

DB = "encuesta.db"

ALLOWED_TIPOS = {"comedor", "transporte"}

app = Flask(__name__)
# Mientras pruebas dejar abierto; en prod limitar orígenes
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---------- DB helpers ----------
def get_db():
    con = sqlite3.connect(DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
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
            meta TEXT
        )
    """)
    # Migración: columna 'tipo'
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

    # Índices
    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_created_at ON respuestas(created_at)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_tipo       ON respuestas(tipo)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_calif      ON respuestas(calificacion)")
    con.commit()
    con.close()

# ---------- Utils ----------
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

    # created_at está en ISO "YYYY-MM-DDTHH:MM:SSZ"
    # comparamos por fecha truncada: substr(created_at,1,10)
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

    with sqlite3.connect(DB) as con:
        con.row_factory = sqlite3.Row
        cur = con.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()]

    return jsonify(rows)

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=8000, debug=True)
