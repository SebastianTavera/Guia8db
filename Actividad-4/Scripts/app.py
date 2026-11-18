"""
Actividad 4 - Tienda de ropa en tiempo real con MongoDB Atlas + pymongo.

  /        -> Tienda (vista del cliente, se actualiza sola)
  /admin   -> Panel de administración (precios, colores, descuentos)

Colecciones: productos, usuarios (clientes con contraseña cifrada), pedidos.
Los clientes inician sesión para comprar y calificar; la sesión se guarda en
una cookie firmada (SECRET_KEY) que solo contiene el id del usuario.

Tiempo real:
  1. El admin modifica un producto  -> update_one en MongoDB Atlas.
  2. Un hilo escucha la colección con un Change Stream (coleccion.watch()).
  3. Cada cambio se reenvía a todos los navegadores abiertos por
     Server-Sent Events (/api/stream).
  Así, cualquier cambio (incluso hecho desde Atlas o Compass) llega a la tienda
  sin recargar la página. Si el servidor de MongoDB no soporta Change Streams
  (instancia local sin replica set), se notifica directamente desde la API.

Ejecutar:  python app.py   (lee MONGO_URI y ADMIN_PASSWORD del archivo .env)
"""
import hmac
import json
import mimetypes
import os
import queue
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory, session
from pymongo.errors import OperationFailure, PyMongoError

from tienda_dao import (PedidoDAO, ProductoDAO, UsuarioDAO, ValidacionError, a_json, conectar,
                        pedido_json, usuario_json)

BASE = Path(__file__).resolve().parent
RAIZ = BASE.parents[1]

# .env en la raíz del repositorio (o en esta carpeta)
load_dotenv(RAIZ / ".env")
load_dotenv(BASE / ".env")

# Windows a veces registra .js como text/plain y el navegador rechaza los módulos
mimetypes.add_type("text/javascript", ".js")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
if not os.getenv("ADMIN_PASSWORD"):
    print(f"[AVISO] ADMIN_PASSWORD no está definida. Clave temporal de esta sesión: {ADMIN_PASSWORD}")

app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")
# Cookie de sesión firmada: HttpOnly (JS no la lee) y SameSite=Lax (no viaja en POST de otros sitios)
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
)


# ------------------------------------------------------------ difusión SSE
class Difusor:
    """Mantiene una cola por navegador conectado y reparte los eventos."""

    def __init__(self):
        self._colas = set()
        self._lock = threading.Lock()

    def suscribir(self):
        cola = queue.Queue(maxsize=200)
        with self._lock:
            self._colas.add(cola)
        return cola

    def desuscribir(self, cola):
        with self._lock:
            self._colas.discard(cola)

    def publicar(self, evento):
        mensaje = json.dumps(evento, ensure_ascii=False, sort_keys=True)
        with self._lock:
            for cola in list(self._colas):
                try:
                    cola.put_nowait(mensaje)
                except queue.Full:  # cliente que no lee: se descarta
                    self._colas.discard(cola)


difusor = Difusor()
estado = {"modo": "iniciando"}  # "change-stream" | "local"


def evento_cambio(tipo, id_texto, doc=None):
    return {"tipo": tipo, "id": id_texto, "producto": a_json(doc)}


def vigilar_cambios(coleccion):
    """Hilo que escucha el Change Stream de la colección y difunde cada cambio."""
    while True:
        try:
            with coleccion.watch(full_document="updateLookup") as stream:
                if estado["modo"] != "change-stream":
                    estado["modo"] = "change-stream"
                    print("[OK] Change Stream activo: escuchando cambios en tiempo real")
                    difusor.publicar({"tipo": "estado", "modo": "change-stream"})
                for cambio in stream:
                    op = cambio["operationType"]
                    if op in ("insert", "update", "replace"):
                        doc = cambio.get("fullDocument")
                        if doc is not None:
                            difusor.publicar(evento_cambio("upsert", str(doc["_id"]), doc))
                    elif op == "delete":
                        difusor.publicar(evento_cambio("delete", str(cambio["documentKey"]["_id"])))
                    elif op in ("drop", "invalidate", "dropDatabase"):
                        difusor.publicar({"tipo": "recargar"})
        except (OperationFailure, NotImplementedError) as err:
            # Ej.: MongoDB local sin replica set (código 40573). Se usa difusión local.
            estado["modo"] = "local"
            print(f"[AVISO] Change Streams no disponibles ({err}). Se notificará desde la API.")
            difusor.publicar({"tipo": "estado", "modo": "local"})
            return
        except PyMongoError as err:
            print(f"[AVISO] Se perdió el Change Stream ({err}). Reintentando en 3 s...")
            time.sleep(3)
        except Exception as err:  # el driver/servidor no implementa watch()
            estado["modo"] = "local"
            print(f"[AVISO] Change Streams no soportados ({err!r}). Se notificará desde la API.")
            difusor.publicar({"tipo": "estado", "modo": "local"})
            return


def notificar_si_local(evento):
    """Sin Change Streams, la propia API avisa a los navegadores."""
    if estado["modo"] != "change-stream":
        difusor.publicar(evento)


# ------------------------------------------------------------ conexión
try:
    cliente = conectar()
except (RuntimeError, PyMongoError) as err:
    raise SystemExit(f"[ERROR] No se pudo conectar a MongoDB: {err}") from None
bd = cliente[os.getenv("MONGO_DB", "tienda_ropa")]
coleccion = bd["productos"]
dao = ProductoDAO(coleccion)
usuarios = UsuarioDAO(bd["usuarios"])
pedidos = PedidoDAO(bd["pedidos"], dao)
sembrados = dao.preparar_catalogo()
if sembrados:
    print(f"[OK] Catálogo actualizado: {sembrados} productos nuevos")
threading.Thread(target=vigilar_cambios, args=(coleccion,), daemon=True).start()


# ------------------------------------------------------------ utilidades
def requiere_admin():
    """Compara la clave del encabezado X-Admin-Key en tiempo constante."""
    clave = request.headers.get("X-Admin-Key", "")
    return hmac.compare_digest(clave.encode(), ADMIN_PASSWORD.encode())


# Límite simple de intentos de inicio de sesión por IP (10 cada 5 minutos)
_intentos = defaultdict(deque)
_intentos_lock = threading.Lock()


def demasiados_intentos(ip, registrar=False):
    ahora = time.monotonic()
    with _intentos_lock:
        cola = _intentos[ip]
        while cola and ahora - cola[0] > 300:
            cola.popleft()
        if registrar:
            cola.append(ahora)
        return len(cola) >= 10


def usuario_actual():
    uid = session.get("uid")
    return usuarios.obtener(uid) if uid else None


def iniciar_sesion(doc):
    session.clear()
    session.permanent = True
    session["uid"] = str(doc["_id"])


@app.errorhandler(ValidacionError)
def error_validacion(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(PyMongoError)
def error_mongo(err):
    app.logger.error("Error de MongoDB: %s", err)
    return jsonify(error="Error al comunicarse con la base de datos"), 503


# ------------------------------------------------------------ páginas
@app.get("/")
def tienda():
    return send_from_directory(app.static_folder, "tienda.html")


@app.get("/admin")
def admin():
    return send_from_directory(app.static_folder, "admin.html")


# ------------------------------------------------------------ API
@app.get("/api/productos")
def listar():
    return jsonify(productos=[a_json(p) for p in dao.listar()], modo=estado["modo"])


@app.post("/api/admin/verificar")
def verificar_admin():
    if not requiere_admin():
        return jsonify(error="Clave incorrecta"), 401
    return jsonify(ok=True)


@app.post("/api/productos")
def crear():
    if not requiere_admin():
        return jsonify(error="No autorizado"), 401
    doc = dao.crear(request.get_json(silent=True))
    notificar_si_local(evento_cambio("upsert", str(doc["_id"]), doc))
    return jsonify(producto=a_json(doc)), 201


@app.patch("/api/productos/<id_producto>")
def actualizar(id_producto):
    if not requiere_admin():
        return jsonify(error="No autorizado"), 401
    doc = dao.actualizar(id_producto, request.get_json(silent=True))
    if doc is None:
        return jsonify(error="Producto no encontrado"), 404
    notificar_si_local(evento_cambio("upsert", id_producto, doc))
    return jsonify(producto=a_json(doc))


@app.delete("/api/productos/<id_producto>")
def eliminar(id_producto):
    if not requiere_admin():
        return jsonify(error="No autorizado"), 401
    if not dao.eliminar(id_producto):
        return jsonify(error="Producto no encontrado"), 404
    notificar_si_local(evento_cambio("delete", id_producto))
    return jsonify(ok=True)


# ------------------------------------------------------------ clientes
@app.get("/api/sesion")
def sesion_actual():
    return jsonify(usuario=usuario_json(usuario_actual()))


@app.post("/api/registro")
def registro():
    doc = usuarios.registrar(request.get_json(silent=True))
    iniciar_sesion(doc)
    return jsonify(usuario=usuario_json(doc)), 201


@app.post("/api/login")
def login():
    ip = request.remote_addr or "?"
    if demasiados_intentos(ip):
        return jsonify(error="Demasiados intentos. Espera unos minutos."), 429
    doc = usuarios.autenticar(request.get_json(silent=True))
    if doc is None:
        demasiados_intentos(ip, registrar=True)
        return jsonify(error="Correo o contraseña incorrectos"), 401
    iniciar_sesion(doc)
    return jsonify(usuario=usuario_json(doc))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.post("/api/productos/<id_producto>/calificar")
def calificar(id_producto):
    usuario = usuario_actual()
    if usuario is None:
        return jsonify(error="Inicia sesión para calificar"), 401
    datos = request.get_json(silent=True) or {}
    estrellas = datos.get("estrellas")
    if isinstance(estrellas, bool) or not isinstance(estrellas, int) or not 1 <= estrellas <= 5:
        raise ValidacionError("La calificación debe estar entre 1 y 5 estrellas")
    if dao.obtener(id_producto) is None:
        return jsonify(error="Producto no encontrado"), 404
    if not usuarios.marcar_calificado(usuario["_id"], id_producto):
        return jsonify(error="Ya calificaste este producto"), 409
    doc = dao.sumar_calificacion(id_producto, estrellas)
    notificar_si_local(evento_cambio("upsert", id_producto, doc))
    return jsonify(producto=a_json(doc))


@app.post("/api/pedidos")
def crear_pedido():
    usuario = usuario_actual()
    if usuario is None:
        return jsonify(error="Inicia sesión para finalizar la compra"), 401
    pedido = pedidos.crear(usuario, request.get_json(silent=True))
    return jsonify(pedido=pedido_json(pedido)), 201


@app.get("/api/pedidos")
def mis_pedidos():
    usuario = usuario_actual()
    if usuario is None:
        return jsonify(error="Inicia sesión"), 401
    return jsonify(pedidos=[pedido_json(p) for p in pedidos.recientes(usuario["_id"])])


@app.get("/api/stream")
def stream():
    """Canal Server-Sent Events: el navegador lo abre con EventSource."""
    cola = difusor.suscribir()

    def generar():
        try:
            yield "retry: 2000\n\n"
            yield f"data: {json.dumps({'tipo': 'estado', 'modo': estado['modo']})}\n\n"
            while True:
                try:
                    yield f"data: {cola.get(timeout=15)}\n\n"
                except queue.Empty:
                    yield ": latido\n\n"  # mantiene viva la conexión
        finally:
            difusor.desuscribir(cola)

    return Response(generar(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    puerto = int(os.getenv("PORT", "5000"))
    print(f"[OK] Tienda:  http://127.0.0.1:{puerto}/")
    print(f"[OK] Admin:   http://127.0.0.1:{puerto}/admin")
    app.run(host="127.0.0.1", port=puerto, threaded=True, debug=False)
