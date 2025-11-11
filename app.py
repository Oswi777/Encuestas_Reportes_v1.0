import os
import json
import sqlite3
import tempfile
import traceback
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# ---------- Postgres opcional ----------
try:
    import psycopg2
except Exception:
    psycopg2 = None


def is_postgres():
    url = os.getenv("DATABASE_URL") or ""
    return url.startswith("postgres://") or url.startswith("postgresql://")


def connect_sqlite():
    env_db = os.getenv("SQLITE_PATH")
    if env_db:
        db_path = env_db
    elif os.getenv("RENDER") or os.getenv("KOYEB") or os.getenv("PORT"):
        db_path = os.path.join(tempfile.gettempdir(), "encuesta.db")
    else:
        db_path = os.path.join(os.path.dirname(__file__), "encuesta.db")
    con = sqlite3.connect(db_path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    try:
        con.execute("PRAGMA journal_mode=WAL;")
        con.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    return con


def connect_postgres():
    """
    Conexión Postgres compatible con Supabase:
    - Respeta parámetros de la URL; añade sslmode=require solo si no viene.
    - Keepalives para conexiones estables en PaaS.
    """
    if not psycopg2:
        raise RuntimeError("psycopg2-binary no instalado")
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL no definida")

    # Añade sslmode=require sólo si no está presente
    if "sslmode=" not in dsn:
        dsn += ("&" if "?" in dsn else "?") + "sslmode=require"

    return psycopg2.connect(
        dsn,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )


def get_db():
    return connect_postgres() if is_postgres() else connect_sqlite()


def q(sql: str) -> str:
    """Placeholder adapter: SQLite usa ?, Postgres usa %s."""
    return sql.replace("?", "%s") if is_postgres() else sql


def table_has_column(con, table, column):
    if is_postgres():
        with con.cursor() as cur:
            cur.execute("""
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = %s AND column_name = %s
            """, (table, column))
            return cur.fetchone() is not None
    else:
        cur = con.execute(f"PRAGMA table_info({table})")
        return any(row[1] == column for row in cur.fetchall())


def init_db():
    con = get_db()
    if is_postgres():
        con.autocommit = True
        with con.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS respuestas (
                    id SERIAL PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    sede TEXT,
                    dispositivo_id TEXT,
                    calificacion TEXT NOT NULL,
                    motivo TEXT NOT NULL,
                    meta TEXT,
                    tipo TEXT
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_created_at ON respuestas(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_tipo       ON respuestas(tipo)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_calif      ON respuestas(calificacion)")
            if not table_has_column(con, "respuestas", "tipo"):
                cur.execute("ALTER TABLE respuestas ADD COLUMN tipo TEXT")
                cur.execute("""
                    UPDATE respuestas
                    SET tipo = CASE
                        WHEN lower(coalesce(dispositivo_id,'')) LIKE '%transporte%' THEN 'transporte'
                        WHEN lower(coalesce(dispositivo_id,'')) LIKE '%comedor%'    THEN 'comedor'
                        ELSE 'desconocido'
                    END
                    WHERE tipo IS NULL OR tipo = ''
                """)
        con.close()
    else:
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
        con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_created_at ON respuestas(created_at)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_tipo       ON respuestas(tipo)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_respuestas_calif      ON respuestas(calificacion)")
        con.commit()
        con.close()


# ---------- Flask & estáticos ----------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENC_DIR  = os.path.join(BASE_DIR, "Encuestas")
REP_DIR  = os.path.join(BASE_DIR, "reportes")
ENC_ASSETS, ENC_CSS, ENC_JS = [os.path.join(ENC_DIR, p) for p in ("assets", "css", "js")]
REP_ASSETS, REP_CSS, REP_JS = [os.path.join(REP_DIR, p) for p in ("assets", "css", "js")]


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


ALLOWED_TIPOS = {"comedor", "transporte"}


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
    if is_postgres():
        con.autocommit = True
        with con.cursor() as cur:
            cur.execute(q("""
                INSERT INTO respuestas (created_at, sede, dispositivo_id, calificacion, motivo, meta, tipo)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """), (ts_iso, sede, disp, calificacion, motivo, json.dumps(meta), tipo))
            rid = cur.fetchone()[0]
        con.close()
    else:
        cur = con.execute(q("""
            INSERT INTO respuestas (created_at, sede, dispositivo_id, calificacion, motivo, meta, tipo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (ts_iso, sede, disp, calificacion, motivo, json.dumps(meta), tipo))
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
        sql += " AND tipo = ?"; args.append(tipo)
    if desde:
        sql += " AND substr(created_at,1,10) >= ?"; args.append(desde)
    if hasta:
        sql += " AND substr(created_at,1,10) <= ?"; args.append(hasta)
    sql += " ORDER BY created_at DESC"

    con = get_db()
    if is_postgres():
        with con.cursor() as cur:
            cur.execute(q(sql), tuple(args))
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        con.close()
    else:
        cur = con.execute(q(sql), args)
        rows = [dict(r) for r in cur.fetchall()]
        con.close()
    return jsonify(rows)


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
        sql += " AND tipo = ?"; args.append(tipo)
    if desde:
        sql += " AND substr(created_at,1,10) >= ?"; args.append(desde)
    if hasta:
        sql += " AND substr(created_at,1,10) <= ?"; args.append(hasta)
    sql += " GROUP BY dia, tipo, calificacion ORDER BY dia"

    con = get_db()
    if is_postgres():
        with con.cursor() as cur:
            cur.execute(q(sql), tuple(args))
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        con.close()
    else:
        cur = con.execute(q(sql), args)
        rows = [dict(r) for r in cur.fetchall()]
        con.close()
    return jsonify(rows)


# ---------- Páginas ----------
@app.route("/comedor")
def page_comedor():
    return send_from_directory(os.path.join(BASE_DIR, "Encuestas"), "index_Comedor.html")


@app.route("/transporte")
def page_transporte():
    return send_from_directory(os.path.join(BASE_DIR, "Encuestas"), "index_Transporte.html")


@app.route("/reportes")
def page_reportes():
    return send_from_directory(os.path.join(BASE_DIR, "reportes"), "reportes.html")


# ---------- Assets con fallback (Encuestas -> reportes) ----------
def _multi_send(candidates, filename):
    for root in candidates:
        full = os.path.join(root, filename)
        if os.path.isfile(full):
            return send_from_directory(root, filename)
    return jsonify({"error": "archivo no encontrado", "path": filename}), 404


@app.route("/assets/<path:filename>")
def static_assets(filename):
    return _multi_send([os.path.join(ENC_DIR, "assets"), os.path.join(REP_DIR, "assets")], filename)


@app.route("/css/<path:filename>")
def static_css(filename):
    return _multi_send([os.path.join(ENC_DIR, "css"), os.path.join(REP_DIR, "css")], filename)


@app.route("/js/<path:filename>")
def static_js(filename):
    return _multi_send([os.path.join(ENC_DIR, "js"), os.path.join(REP_DIR, "js")], filename)


@app.route("/api/debug/dbinfo")
def dbinfo():
    info = {
        "engine": "Postgres" if is_postgres() else "SQLite",
        "has_DATABASE_URL": bool(os.getenv("DATABASE_URL")),
        "render": bool(os.getenv("RENDER")),
    }
    # Si es SQLite, muestra la ruta del archivo
    if not is_postgres():
        env_db = os.getenv("SQLITE_PATH")
        if env_db:
            info["sqlite_path"] = env_db
        elif os.getenv("RENDER") or os.getenv("KOYEB") or os.getenv("PORT"):
            import tempfile as _tmp, os as _os
            info["sqlite_path"] = _os.path.join(_tmp.gettempdir(), "encuesta.db")
        else:
            import os as _os
            info["sqlite_path"] = _os.path.join(_os.path.dirname(__file__), "encuesta.db")
    return jsonify(info), 200


# ---------- Boot ----------
try:
    init_db()
    print("DB init OK (engine:", "Postgres" if is_postgres() else "SQLite", ")")
except Exception as e:
    print("ERROR: init_db failed:", e)
    traceback.print_exc()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
