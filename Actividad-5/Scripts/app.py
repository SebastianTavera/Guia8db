"""
Actividad 5 - Campus: plataforma web para estudiantes, profesores y público general.

  python app.py   ->  http://127.0.0.1:5050/

Roles en la web (el administrador NO entra por aquí: usa la terminal, admin.py):
  - estudiante: ve su promedio y notas, se matricula (procedimiento almacenado) y
                actualiza su contacto.
  - profesor:   ve sus cursos, publica notas y cierra cursos (procedimiento con cursor).
  - general:    explora la oferta académica y guarda programas favoritos.

Datos:
  - MySQL  (dao_mysql.py): usuarios, estudiantes, matrículas, notas, procedimientos.
  - MongoDB (dao_mongo.py): bitácora de cada acción y preferencias de cada usuario.

Tiempo real: un hilo revisa la bitácora de MongoDB cada segundo y reenvía cada
evento a los navegadores afectados por Server-Sent Events (/api/stream). Como la
terminal del administrador también escribe en la bitácora, sus cambios llegan en
vivo a la web aunque sea otro programa.
"""
import json
import os
import re
import queue
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from functools import wraps

import mimetypes
from flask import Flask, Response, g, jsonify, request, send_from_directory, session
from mysql.connector import Error as ErrorMySQL
from pymongo.errors import PyMongoError

import config
import horarios
import rutas_campus
from types import SimpleNamespace
from dao_mongo import TODOS, BitacoraDAO, PreferenciaDAO, actor, evento_json
from dao_mysql import (EstudianteDAO, OfertaDAO, ProcedimientosDAO, ProfesorDAO, UsuarioDAO, ValidacionError,
                       a_json, entero, texto)

mimetypes.add_type("text/javascript", ".js")

app = Flask(__name__, static_folder=str(config.BASE / "static"), static_url_path="/static")
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,  # el JavaScript de la página no puede leer la cookie
    SESSION_COOKIE_SAMESITE="Lax",  # la cookie no viaja en peticiones POST de otros sitios
    SESSION_COOKIE_NAME="campus_sesion",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
)

# ------------------------------------------------------------------ conexión inicial
try:
    config.asegurar_esquema()
    mongo = config.mongo_bd()
except ErrorMySQL as err:
    raise SystemExit(f"[ERROR] MySQL: {err}\n  Revise DB_USER / DB_PASSWORD en el .env y que MariaDB esté iniciado.") from None
except (PyMongoError, RuntimeError) as err:
    raise SystemExit(f"[ERROR] MongoDB: {err}\n  Revise MONGO_URI en el .env y que MongoDB esté iniciado.") from None

usuarios = UsuarioDAO()
oferta = OfertaDAO()
estudiantes = EstudianteDAO()
profesores = ProfesorDAO()
procedimientos = ProcedimientosDAO()
bitacora = BitacoraDAO(mongo)
preferencias = PreferenciaDAO(mongo)


# ------------------------------------------------------------------ notificaciones en vivo
class Difusor:
    """Una cola por navegador conectado; cada una sabe de qué usuario es."""

    def __init__(self):
        self._colas = {}
        self._lock = threading.Lock()

    def suscribir(self, id_usuario):
        cola = queue.Queue(maxsize=100)
        with self._lock:
            self._colas[cola] = id_usuario
        return cola

    def desuscribir(self, cola):
        with self._lock:
            self._colas.pop(cola, None)

    def enviar(self, doc):
        destinos = set(doc.get("destinatarios") or [])
        if not destinos:
            return
        evento = evento_json(doc)
        with self._lock:
            for cola, id_usuario in list(self._colas.items()):
                para_mi = id_usuario is not None and id_usuario in destinos
                if not para_mi and TODOS not in destinos:
                    continue
                try:
                    cola.put_nowait(json.dumps({**evento, "paraMi": para_mi}, ensure_ascii=False))
                except queue.Full:
                    self._colas.pop(cola, None)


difusor = Difusor()


def vigilar_bitacora():
    """Revisa los eventos nuevos de MongoDB (de la web o de la terminal) y los reparte."""
    ultimo = None
    while True:
        try:
            if ultimo is None:
                ultimo = bitacora.ultimo_id()
            for doc in bitacora.nuevos_desde(ultimo):
                ultimo = doc["_id"]
                difusor.enviar(doc)
        except PyMongoError as err:
            app.logger.warning("Bitácora no disponible: %s", err)
            time.sleep(3)
        time.sleep(0.8)


threading.Thread(target=vigilar_bitacora, daemon=True).start()


def registrar(accion, detalle=None, destinatarios=None, quien=None):
    """Guarda el evento en MongoDB. Si MongoDB falla, la acción principal no se pierde."""
    try:
        bitacora.registrar(accion, quien or actor(g.get("usuario")), detalle, destinatarios, request.remote_addr)
    except PyMongoError as err:
        app.logger.error("No se pudo registrar en la bitácora: %s", err)


# ------------------------------------------------------------------ sesión y permisos
_intentos = defaultdict(deque)
_intentos_lock = threading.Lock()


def demasiados_intentos(ip, sumar=False):
    """Máximo 8 intentos fallidos de acceso cada 5 minutos por IP."""
    ahora = time.monotonic()
    with _intentos_lock:
        cola = _intentos[ip]
        while cola and ahora - cola[0] > 300:
            cola.popleft()
        if sumar:
            cola.append(ahora)
        return len(cola) >= 8


def usuario_json(u):
    datos_u = {"id": u["IdUsuario"], "nombre": u["Nombre"], "correo": u["Correo"], "rol": u["Rol"],
               "idEstudiante": u["IdEstudiante"], "idProfesor": u["IdProfesor"], "programa": None}
    if u["IdEstudiante"]:
        # El programa principal es el que más créditos suma entre sus materias
        creditos = {}
        for m in estudiantes.materias(u["IdEstudiante"]):
            creditos[m["NombrePrograma"]] = creditos.get(m["NombrePrograma"], 0) + (m["CreditosMateria"] or 0)
        datos_u["programa"] = max(creditos, key=creditos.get) if creditos else None
    return datos_u


@app.after_request
def sin_cache_vieja(resp):
    """La página y sus archivos (JS, CSS) se revalidan en cada carga: tras actualizar Campus
    el navegador no se queda con la versión anterior (si no cambió, responde 304 sin reenviarla)."""
    if request.path == "/" or request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.before_request
def cargar_usuario():
    uid = session.get("uid")
    g.usuario = usuarios.obtener(uid) if uid else None
    if uid and not g.usuario:
        session.clear()  # la cuenta fue desactivada o eliminada desde la terminal


def requiere(*roles):
    def decorador(funcion):
        @wraps(funcion)
        def envoltura(*args, **kwargs):
            if not g.usuario:
                return jsonify(error="Inicia sesión para continuar"), 401
            if roles and g.usuario["Rol"] not in roles:
                return jsonify(error="No tienes permiso para esta sección"), 403
            return funcion(*args, **kwargs)
        return envoltura
    return decorador


def iniciar_sesion(u):
    session.clear()
    session.permanent = True
    session["uid"] = u["IdUsuario"]
    g.usuario = u


def datos():
    cuerpo = request.get_json(silent=True)
    if not isinstance(cuerpo, dict):
        raise ValidacionError("Se esperaba un objeto JSON")
    return cuerpo


@app.errorhandler(ValidacionError)
def error_validacion(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(ErrorMySQL)
def error_mysql(err):
    app.logger.error("MySQL: %s", err)
    return jsonify(error="No se pudo completar la operación en la base de datos"), 503


@app.errorhandler(PyMongoError)
def error_mongo(err):
    app.logger.error("MongoDB: %s", err)
    return jsonify(error="El servicio de preferencias no está disponible"), 503


# ------------------------------------------------------------------ página
@app.get("/")
def inicio():
    return send_from_directory(app.static_folder, "campus.html")


# ------------------------------------------------------------------ cuentas
@app.get("/api/sesion")
def sesion_actual():
    if not g.usuario:
        return jsonify(usuario=None, preferencias=None)
    return jsonify(usuario=usuario_json(g.usuario), preferencias=preferencias.obtener(g.usuario["IdUsuario"]))


@app.post("/api/login")
def login():
    ip = request.remote_addr or "?"
    if demasiados_intentos(ip):
        return jsonify(error="Demasiados intentos. Espera unos minutos."), 429
    d = datos()
    u = usuarios.autenticar(d.get("correo"), d.get("clave"))
    if u and u["Rol"] == "admin":
        return jsonify(error="El administrador ingresa por la terminal (admin.py)"), 403
    if not u:
        demasiados_intentos(ip, sumar=True)
        registrar("login_fallido", {"correo": str(d.get("correo"))[:120]})
        return jsonify(error="Correo o contraseña incorrectos"), 401
    iniciar_sesion(u)
    registrar("login")
    return jsonify(usuario=usuario_json(u), preferencias=preferencias.obtener(u["IdUsuario"]))


@app.post("/api/registro")
def registro():
    d = datos()
    nuevo = usuarios.crear(d.get("nombre"), d.get("correo"), d.get("clave"), "general")
    u = usuarios.obtener(nuevo)
    iniciar_sesion(u)
    registrar("registro")
    return jsonify(usuario=usuario_json(u), preferencias=preferencias.obtener(nuevo)), 201


@app.post("/api/activar")
def activar():
    d = datos()
    nuevo = usuarios.activar_cuenta(d.get("tipo"), d.get("documento"), d.get("correo"), d.get("clave"))
    u = usuarios.obtener(nuevo)
    iniciar_sesion(u)
    registrar("cuenta_activada", {"tipo": u["Rol"]})
    return jsonify(usuario=usuario_json(u), preferencias=preferencias.obtener(nuevo)), 201


@app.post("/api/vincular")
@requiere("general")
def vincular():
    """Público general -> estudiante o profesor (documento + correo institucional + contraseña actual)."""
    ip = request.remote_addr or "?"
    if demasiados_intentos(ip):
        return jsonify(error="Demasiados intentos. Espera unos minutos."), 429
    d = datos()
    try:
        usuarios.vincular(g.usuario["IdUsuario"], d.get("tipo"), d.get("documento"), d.get("correo"), d.get("clave"))
    except ValidacionError:
        demasiados_intentos(ip, sumar=True)
        raise
    u = usuarios.obtener(g.usuario["IdUsuario"])
    iniciar_sesion(u)
    registrar("cuenta_vinculada", {"tipo": u["Rol"]})
    return jsonify(usuario=usuario_json(u), preferencias=preferencias.obtener(u["IdUsuario"]))


@app.post("/api/logout")
def logout():
    if g.usuario:
        registrar("logout")
    session.clear()
    return jsonify(ok=True)


# ------------------------------------------------------------------ público
@app.get("/api/oferta")
def ver_oferta():
    return jsonify(programas=oferta.programas())


# ------------------------------------------------------------------ preferencias y actividad (MongoDB)
@app.get("/api/preferencias")
@requiere()
def ver_preferencias():
    return jsonify(preferencias=preferencias.obtener(g.usuario["IdUsuario"]))


@app.put("/api/preferencias")
@requiere()
def guardar_preferencias():
    cambios = datos()
    nuevas = preferencias.guardar(g.usuario["IdUsuario"], cambios)
    registrar("preferencias", {"campos": sorted(cambios)})
    return jsonify(preferencias=nuevas)


@app.get("/api/actividad")
@requiere()
def actividad():
    return jsonify(eventos=[evento_json(e) for e in bitacora.de_usuario(g.usuario["IdUsuario"], 15)])


# ------------------------------------------------------------------ estudiante
@app.get("/api/estudiante/resumen")
@requiere("estudiante")
def resumen_estudiante():
    id_est = g.usuario["IdEstudiante"]
    promedio, clasificacion = procedimientos.calcular_promedio(id_est)  # sp_calcular_promedio
    materias = [a_json(m) for m in estudiantes.materias(id_est)]
    for m in materias:
        m["Bloques"] = horarios.bloques(m.get("Horario"))
    disponibles = [a_json(x) for x in estudiantes.grupos_disponibles(id_est)]
    for x in disponibles:
        # Cruces de horario con las materias que ya tiene (aviso, no bloqueo)
        x["Bloques"] = horarios.bloques(x.get("Horario"))
        x["Cruces"] = [m["NombreMateria"] for m in materias
                       if m["Periodo"] == x["Periodo"] and horarios.se_cruzan(x["Bloques"], m["Bloques"])]
    persona = a_json(estudiantes.obtener(id_est))
    return jsonify(
        estudiante={k: persona.get(k) for k in ("IdEstudiante", "PrimerNombre", "SegundoNombre", "PrimerApellido",
                                                "SegundoApellido", "CorreoEstudiante", "PrefijoTelefono",
                                                "Telefono", "Direccion", "FechaNacimiento")},
        promedio=promedio, clasificacion=clasificacion, materias=materias,
        disponibles=disponibles, maximo=ProcedimientosDAO.MAXIMO_MATERIAS,
        creditos=sum(m["CreditosMateria"] or 0 for m in materias),
        valor=sum(m["ValorMatricula"] or 0 for m in materias),
    )


def comprobante(fila):
    """Matrícula + datos del estudiante: todo lo que lleva un comprobante de inscripción."""
    if not fila:
        return None
    c = a_json(fila)
    c["Estudiante"] = g.usuario["Nombre"]
    c["CorreoEstudiante"] = g.usuario["Correo"]
    return c


@app.post("/api/estudiante/matricular")  # CREATE (procedimiento almacenado)
@requiere("estudiante")
def matricular():
    id_grupo = entero(datos().get("idGrupo"), "Curso")
    mensaje = procedimientos.registrar_matricula(g.usuario["IdEstudiante"], id_grupo)  # sp_registrar_matricula
    exito = str(mensaje).startswith("EXITO")
    registrar("matricula" if exito else "matricula_rechazada", {"grupo": id_grupo, "mensaje": mensaje},
              [g.usuario["IdUsuario"], TODOS, *usuarios.ids_de_profesor(id_grupo)] if exito else [g.usuario["IdUsuario"]])
    if not exito:
        return jsonify(ok=False, mensaje=mensaje), 409
    numero = re.search(r"matricula (\d+)", str(mensaje))
    detalle = estudiantes.matricula(g.usuario["IdEstudiante"], int(numero.group(1))) if numero else None
    return jsonify(ok=True, mensaje=mensaje, comprobante=comprobante(detalle))


@app.get("/api/estudiante/matriculas/<int:id_matricula>")  # READ (comprobante)
@requiere("estudiante")
def ver_matricula(id_matricula):
    detalle = estudiantes.matricula(g.usuario["IdEstudiante"], id_matricula)
    if not detalle:
        return jsonify(error="Esa matrícula no existe o no es tuya"), 404
    return jsonify(comprobante=comprobante(detalle))


@app.get("/api/estudiante/matriculas/<int:id_matricula>/alternativas")
@requiere("estudiante")
def alternativas(id_matricula):
    return jsonify(grupos=[a_json(x) for x in estudiantes.alternativas(g.usuario["IdEstudiante"], id_matricula)])


@app.patch("/api/estudiante/matriculas/<int:id_matricula>")  # UPDATE (cambio de curso)
@requiere("estudiante")
def cambiar_grupo(id_matricula):
    nuevo = entero(datos().get("idGrupo"), "Curso")
    anterior, nuevo = estudiantes.cambiar_grupo(g.usuario["IdEstudiante"], id_matricula, nuevo)
    registrar("matricula_cambiada", {"grupo": nuevo, "anterior": anterior, "matricula": id_matricula},
              [g.usuario["IdUsuario"], TODOS, *usuarios.ids_de_profesor(anterior), *usuarios.ids_de_profesor(nuevo)])
    return jsonify(ok=True, comprobante=comprobante(estudiantes.matricula(g.usuario["IdEstudiante"], id_matricula)))


@app.delete("/api/estudiante/matriculas/<int:id_matricula>")  # DELETE (retirar materia)
@requiere("estudiante")
def retirar(id_matricula):
    id_grupo = estudiantes.retirar(g.usuario["IdEstudiante"], id_matricula)
    registrar("matricula_retirada", {"grupo": id_grupo, "matricula": id_matricula},
              [g.usuario["IdUsuario"], TODOS, *usuarios.ids_de_profesor(id_grupo)])
    return jsonify(ok=True)


@app.patch("/api/estudiante/contacto")
@requiere("estudiante")
def contacto():
    d = datos()
    telefono = texto(d.get("telefono"), "Teléfono", 15, obligatorio=False) if "telefono" in d else None
    direccion = texto(d.get("direccion"), "Dirección", 80, obligatorio=False) if "direccion" in d else None
    estudiantes.actualizar_contacto(g.usuario["IdEstudiante"], telefono, direccion)
    registrar("perfil", {"campos": [c for c in ("telefono", "direccion") if c in d]})
    return jsonify(ok=True)


# ------------------------------------------------------------------ profesor
@app.get("/api/profesor/cursos")
@requiere("profesor")
def cursos_profesor():
    return jsonify(cursos=[a_json(c) for c in profesores.cursos(g.usuario["IdProfesor"])])


@app.get("/api/profesor/cursos/<int:id_grupo>")
@requiere("profesor")
def lista_curso(id_grupo):
    if not profesores.es_su_curso(g.usuario["IdProfesor"], id_grupo):
        return jsonify(error="Ese curso no es tuyo"), 404
    return jsonify(estudiantes=[a_json(e) for e in profesores.lista_curso(g.usuario["IdProfesor"], id_grupo)])


@app.put("/api/profesor/cursos/<int:id_grupo>/notas")
@requiere("profesor")
def guardar_notas(id_grupo):
    if not profesores.es_su_curso(g.usuario["IdProfesor"], id_grupo):
        return jsonify(error="Ese curso no es tuyo"), 404
    afectados = profesores.guardar_notas(g.usuario["IdProfesor"], id_grupo, datos().get("notas"))
    registrar("notas", {"grupo": id_grupo, "cantidad": len(afectados)}, usuarios.ids_de_estudiantes(afectados))
    return jsonify(ok=True, actualizadas=len(afectados))


@app.post("/api/profesor/cursos/<int:id_grupo>/cerrar")
@requiere("profesor")
def cerrar_curso(id_grupo):
    if not profesores.es_su_curso(g.usuario["IdProfesor"], id_grupo):
        return jsonify(error="Ese curso no es tuyo"), 404
    mensaje = procedimientos.actualizar_estado_curso(id_grupo)  # sp_actualizar_estado_curso (cursor)
    exito = str(mensaje).startswith("EXITO")
    if exito:
        afectados = profesores.lista_curso(g.usuario["IdProfesor"], id_grupo)
        registrar("curso_cerrado", {"grupo": id_grupo, "mensaje": mensaje},
                  usuarios.ids_de_estudiantes([e["IdEstudiante"] for e in afectados]))
    return jsonify(ok=exito, mensaje=mensaje), 200 if exito else 409


# ------------------------------------------------------------------ secciones del portal (rutas_campus.py)
extra = rutas_campus.registrar_rutas(app, SimpleNamespace(
    requiere=requiere, registrar=registrar, datos=datos, usuarios=usuarios, estudiantes=estudiantes,
    profesores=profesores, mongo=mongo))


# ------------------------------------------------------------------ tiempo real
@app.get("/api/stream")
def stream():
    cola = difusor.suscribir(g.usuario["IdUsuario"] if g.usuario else None)

    def generar():
        try:
            yield "retry: 2000\n\n"
            while True:
                try:
                    yield f"data: {cola.get(timeout=15)}\n\n"
                except queue.Empty:
                    yield ": latido\n\n"
        finally:
            difusor.desuscribir(cola)

    return Response(generar(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    puerto = int(os.getenv("CAMPUS_PORT", "5050"))
    print(f"[OK] Campus:  http://127.0.0.1:{puerto}/")
    print("[OK] Administración: ejecute  python admin.py  en otra terminal")
    app.run(host="127.0.0.1", port=puerto, threaded=True, debug=False)
