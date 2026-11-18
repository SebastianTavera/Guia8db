"""
Actividad 5 - Configuración compartida por la terminal (admin.py) y la web (app.py).

Lee las credenciales del archivo .env de la raíz del proyecto (nunca del código) y
crea las conexiones:
  - MySQL / MariaDB: un *pool* de conexiones (la web atiende varias peticiones a la vez).
  - MongoDB: un cliente con verificación inmediata (ping).
"""
import os
import re
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from mysql.connector import pooling
from pymongo import MongoClient

BASE = Path(__file__).resolve().parent
RAIZ = BASE.parents[1]
load_dotenv(RAIZ / ".env")
load_dotenv(BASE / ".env")

MYSQL = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "guia8"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "Guia_8"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
    "autocommit": False,
}
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017")
MONGO_DB = os.getenv("CAMPUS_MONGO_DB", "campus")

_pool = None


def pool_mysql(tamano=6):
    """Pool de conexiones a MySQL (se crea la primera vez que se pide)."""
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(pool_name="campus", pool_size=tamano, pool_reset_session=True, **MYSQL)
    return _pool


@contextmanager
def mysql_cursor(diccionario=True):
    """Entrega un cursor y garantiza commit/rollback y el cierre de la conexión.

        with mysql_cursor() as (conexion, cursor):
            cursor.execute("SELECT ... WHERE Id = %s", (valor,))
    """
    conexion = pool_mysql().get_connection()
    cursor = conexion.cursor(dictionary=diccionario)
    try:
        yield conexion, cursor
        conexion.commit()
    except Exception:
        conexion.rollback()
        raise
    finally:
        cursor.close()
        conexion.close()  # en un pool, close() devuelve la conexión al pool


def mongo_bd():
    """Base de datos de MongoDB de la plataforma (bitácora y preferencias)."""
    if "<" in MONGO_URI:
        raise RuntimeError("MONGO_URI en el .env todavía tiene un texto de ejemplo (<...>)")
    cliente = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6000, appname="campus-guia8")
    cliente.admin.command("ping")
    return cliente[MONGO_DB]


def _sentencias(nombre):
    sql = (BASE / "sql" / nombre).read_text(encoding="utf-8")
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in sql.split(";") if s.strip() and not s.strip().upper().startswith("USE ")]


def asegurar_esquema():
    """Crea las tablas nuevas si no existen (sql/usuarios.sql) y, una sola vez, carga la oferta
    académica ampliada (sql/oferta_ampliada.sql) si sus materias 206-250 todavía no están."""
    with mysql_cursor() as (_, cursor):
        for sentencia in _sentencias("usuarios.sql"):
            cursor.execute(sentencia)
        cursor.execute("SELECT COUNT(*) AS n FROM Materia WHERE IdMateria BETWEEN 206 AND 250")
        if cursor.fetchone()["n"] == 0:
            cursor.execute("SELECT COUNT(*) AS n FROM Programa WHERE IdPrograma BETWEEN 1 AND 5")
            if cursor.fetchone()["n"] == 5:  # la oferta usa los 5 programas de 02_Datos.sql
                for sentencia in _sentencias("oferta_ampliada.sql"):
                    cursor.execute(sentencia)
