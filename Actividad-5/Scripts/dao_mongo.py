"""
Actividad 5 - Acceso a datos no estructurados en MongoDB (patrón DAO).

  bitacora      -> un documento por acción (quién, qué, cuándo, desde dónde y a quién
                   afecta). Cada acción tiene un "detalle" con forma distinta: por eso
                   va en MongoDB y no en una tabla.
  preferencias  -> un documento por usuario (_id = IdUsuario): tema, fondo, favoritos.

Seguridad: los filtros se arman con valores tipados y las preferencias pasan por una
lista blanca, así no se pueden inyectar operadores como {"$where": ...}.
"""
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from dao_mysql import ValidacionError

TODOS = "*"  # destinatario especial: todos los navegadores conectados

ACCIONES = {
    "login": "Inició sesión",
    "login_fallido": "Intento de acceso fallido",
    "logout": "Cerró sesión",
    "registro": "Creó una cuenta",
    "cuenta_activada": "Activó su cuenta institucional",
    "cuenta_vinculada": "Vinculó su cuenta institucional",
    "matricula": "Matrícula registrada",
    "matricula_rechazada": "Matrícula rechazada",
    "matricula_retirada": "Materia retirada",
    "pago": "Pago registrado",
    "reserva": "Laboratorio reservado",
    "reserva_cancelada": "Reserva de laboratorio cancelada",
    "monitoria": "Inscripción a monitoría",
    "monitoria_retiro": "Retiro de monitoría",
    "foro_hilo": "Nuevo tema en el foro",
    "foro_respuesta": "Nueva respuesta en el foro",
    "aula": "Nueva publicación en el aula virtual",
    "reconocimiento": "Evaluación docente enviada",
    "certificado": "Certificado emitido",
    "contrato": "Contrato de matrícula firmado",
    "publicacion": "Nueva publicación institucional",
    "matricula_cambiada": "Cambio de curso",
    "notas": "Notas publicadas",
    "curso_cerrado": "Curso cerrado",
    "promedio": "Promedio recalculado",
    "perfil": "Datos de contacto actualizados",
    "preferencias": "Preferencias actualizadas",
    "estudiante_creado": "Estudiante creado",
    "estudiante_editado": "Estudiante editado",
    "estudiante_eliminado": "Estudiante eliminado",
    "profesor_creado": "Profesor creado",
    "profesor_eliminado": "Profesor eliminado",
    "grupo_creado": "Curso creado",
    "cupo": "Cupo de curso modificado",
    "usuario_creado": "Cuenta creada por el administrador",
    "usuario_estado": "Cuenta activada o desactivada",
    "usuario_clave": "Contraseña restablecida",
    "usuario_eliminado": "Cuenta eliminada",
}


def actor(usuario, origen="web"):
    """Resumen del usuario que hace la acción (lo que se guarda en la bitácora)."""
    if not usuario:
        return {"id": None, "nombre": "Anónimo", "rol": "visitante", "origen": origen}
    return {"id": usuario["IdUsuario"], "nombre": usuario["Nombre"], "rol": usuario["Rol"], "origen": origen}


def evento_json(doc):
    return {
        "id": str(doc["_id"]),
        "fecha": doc["fecha"].replace(tzinfo=timezone.utc).isoformat(),
        "accion": doc["accion"],
        "texto": ACCIONES.get(doc["accion"], doc["accion"]),
        "actor": doc.get("actor", {}),
        "detalle": doc.get("detalle", {}),
    }


class BitacoraDAO:
    def __init__(self, bd):
        self.col = bd["bitacora"]
        self.col.create_index([("fecha", DESCENDING)])
        self.col.create_index([("actor.id", ASCENDING), ("fecha", DESCENDING)])
        self.col.create_index([("destinatarios", ASCENDING)])
        # Los eventos se borran solos a los 180 días (índice TTL)
        self.col.create_index([("creado", ASCENDING)], expireAfterSeconds=180 * 86400, name="ttl_creado")

    def registrar(self, accion, quien, detalle=None, destinatarios=None, ip=None):
        """insert_one de un evento. destinatarios = IdUsuario a notificar (o '*')."""
        ahora = datetime.now(timezone.utc)
        doc = {"fecha": ahora, "creado": ahora, "accion": accion, "actor": quien,
               "detalle": detalle or {}, "destinatarios": list(dict.fromkeys(destinatarios or []))}
        if ip:
            doc["ip"] = ip
        doc["_id"] = self.col.insert_one(doc).inserted_id
        return doc

    def recientes(self, limite=30, rol=None, accion=None, texto=None):
        filtro = {}
        if rol:
            filtro["actor.rol"] = str(rol)
        if accion:
            filtro["accion"] = str(accion)
        if texto:
            filtro["actor.nombre"] = {"$regex": _escapar(texto), "$options": "i"}
        return list(self.col.find(filtro).sort("fecha", DESCENDING).limit(int(limite)))

    def de_usuario(self, id_usuario, limite=12):
        """Lo que hizo el usuario y lo que le pasó (eventos donde es destinatario)."""
        filtro = {"$or": [{"actor.id": int(id_usuario)}, {"destinatarios": int(id_usuario)}]}
        return list(self.col.find(filtro).sort("fecha", DESCENDING).limit(int(limite)))

    def nuevos_desde(self, ultimo_id):
        filtro = {"_id": {"$gt": ultimo_id}} if ultimo_id else {}
        return list(self.col.find(filtro).sort("_id", ASCENDING).limit(200))

    def ultimo_id(self):
        doc = self.col.find_one({}, sort=[("_id", DESCENDING)], projection={"_id": 1})
        return doc["_id"] if doc else ObjectId.from_datetime(datetime.now(timezone.utc))

    def resumen(self, dias=7):
        """Agregación: cuántas veces ocurrió cada acción en los últimos días."""
        desde = datetime.now(timezone.utc) - timedelta(days=dias)
        return list(self.col.aggregate([
            {"$match": {"fecha": {"$gte": desde}}},
            {"$group": {"_id": "$accion", "total": {"$sum": 1}, "ultima": {"$max": "$fecha"}}},
            {"$sort": {"total": -1}},
        ]))


def _escapar(texto):
    import re
    return re.escape(str(texto)[:40])


class PreferenciaDAO:
    POR_DEFECTO = {"tema": "vidrio", "luz": True, "menu": "lateral", "favoritos": []}  # vidrio negro con luz del puntero
    TEMAS = ("vidrio", "opaco")
    MENUS = ("superior", "lateral")

    def __init__(self, bd):
        self.col = bd["preferencias"]

    def obtener(self, id_usuario):
        doc = self.col.find_one({"_id": int(id_usuario)}) or {}
        salida = {**self.POR_DEFECTO, **{k: v for k, v in doc.items() if k in self.POR_DEFECTO}}
        if salida["tema"] not in self.TEMAS:  # valores de versiones anteriores (claro/oscuro/sistema)
            salida["tema"] = "vidrio"
        return salida

    def guardar(self, id_usuario, cambios):
        """update_one con upsert, solo con campos y valores permitidos."""
        if not isinstance(cambios, dict) or not cambios:
            raise ValidacionError("No hay cambios")
        limpio = {}
        for clave, valor in cambios.items():
            if clave == "tema":
                if valor not in self.TEMAS:
                    raise ValidacionError("Tema inválido")
                limpio["tema"] = valor
            elif clave == "menu":
                if valor not in self.MENUS:
                    raise ValidacionError("Menú inválido")
                limpio["menu"] = valor
            elif clave == "luz":
                if not isinstance(valor, bool):
                    raise ValidacionError("La luz del puntero es sí o no")
                limpio["luz"] = valor
            elif clave == "favoritos":
                if not isinstance(valor, list) or len(valor) > 30 or any(
                        isinstance(v, bool) or not isinstance(v, int) for v in valor):
                    raise ValidacionError("Favoritos inválidos")
                limpio["favoritos"] = list(dict.fromkeys(valor))
            else:
                raise ValidacionError(f"Preferencia desconocida: {clave}")
        limpio["actualizado"] = datetime.now(timezone.utc)
        self.col.update_one({"_id": int(id_usuario)}, {"$set": limpio}, upsert=True)
        return self.obtener(id_usuario)


# ================================================================== Campus: colecciones de comunidad y servicios
import secrets as _secrets
from bson.errors import InvalidId as _InvalidId
from pymongo import ReturnDocument as _Retorno


def _txt(valor, campo, maximo, obligatorio=True):
    if valor is None:
        valor = ""
    if not isinstance(valor, str):
        raise ValidacionError(f"{campo}: debe ser texto")
    valor = valor.strip()
    if obligatorio and not valor:
        raise ValidacionError(f"{campo} es obligatorio")
    if len(valor) > maximo:
        raise ValidacionError(f"{campo}: máximo {maximo} caracteres")
    return valor


def _oid(texto):
    try:
        return ObjectId(str(texto))
    except (_InvalidId, TypeError):
        raise ValidacionError("Identificador inválido") from None


def a_json(doc):
    """Documento de MongoDB -> dict serializable (ObjectId y fechas a texto)."""
    if isinstance(doc, list):
        return [a_json(d) for d in doc]
    if isinstance(doc, dict):
        return {("id" if k == "_id" else k): a_json(v) for k, v in doc.items()}
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.replace(tzinfo=timezone.utc).isoformat()
    return doc


def _ahora():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ publicaciones (Inicio)
class PublicacionDAO:
    CATEGORIAS = ("Comunicado", "Calendario", "Bienestar", "Evento", "Encuesta")
    INICIALES = [
        {"titulo": "Bienvenida al periodo académico", "categoria": "Comunicado", "destacada": True,
         "cuerpo": "Te damos la bienvenida. Revisa tu horario, inscribe tus materias y descarga tu orden de matrícula desde el menú."},
        {"titulo": "Calendario: inscripciones y pagos", "categoria": "Calendario", "destacada": False,
         "cuerpo": "Las inscripciones están abiertas. La fecha límite de pago aparece en tu Orden de matrícula. Puedes pagar en línea desde Pagos en línea."},
        {"titulo": "Encuesta de caracterización", "categoria": "Encuesta", "destacada": False,
         "cuerpo": "Conocerte nos ayuda a acompañarte mejor. Responde la encuesta desde Bienestar; toma menos de cinco minutos."},
        {"titulo": "Monitorías de ciencias básicas", "categoria": "Bienestar", "destacada": False,
         "cuerpo": "Cálculo, álgebra, física y química: inscríbete a las monitorías gratuitas en la sección Ciencias básicas."},
    ]

    def __init__(self, bd):
        self.col = bd["publicaciones"]
        self.col.create_index([("fecha", DESCENDING)])
        if not self.col.estimated_document_count():
            for i, p in enumerate(self.INICIALES):
                self.col.insert_one({**p, "autor": "Administración", "fecha": _ahora() - timedelta(minutes=i)})

    def listar(self, limite=20):
        return list(self.col.find({}).sort([("destacada", DESCENDING), ("fecha", DESCENDING)]).limit(limite))

    def crear(self, titulo, cuerpo, categoria, autor, destacada=False):
        if categoria not in self.CATEGORIAS:
            raise ValidacionError("Categoría inválida")
        doc = {"titulo": _txt(titulo, "Título", 90), "cuerpo": _txt(cuerpo, "Texto", 600), "categoria": categoria,
               "destacada": bool(destacada), "autor": autor, "fecha": _ahora()}
        doc["_id"] = self.col.insert_one(doc).inserted_id
        return doc

    def eliminar(self, id_texto):
        return self.col.delete_one({"_id": _oid(id_texto)}).deleted_count == 1


# ------------------------------------------------------------------ foros
class ForoDAO:
    """Un hilo por documento; las respuestas van dentro del hilo (arreglo con $push)."""

    def __init__(self, bd):
        self.col = bd["foros"]
        self.col.create_index([("espacio", ASCENDING), ("actividad", DESCENDING)])

    def hilos(self, espacio):
        return list(self.col.find({"espacio": str(espacio)}, {"respuestas": {"$slice": -1}})
                    .sort("actividad", DESCENDING).limit(50))

    def contar(self, espacios):
        return {r["_id"]: r["n"] for r in self.col.aggregate([
            {"$match": {"espacio": {"$in": [str(e) for e in espacios]}}},
            {"$group": {"_id": "$espacio", "n": {"$sum": 1}}}])}

    def hilo(self, id_texto):
        return self.col.find_one({"_id": _oid(id_texto)})

    def crear(self, espacio, titulo, cuerpo, autor):
        ahora = _ahora()
        doc = {"espacio": str(espacio), "titulo": _txt(titulo, "Título", 120), "cuerpo": _txt(cuerpo, "Mensaje", 2000),
               "autor": autor, "fecha": ahora, "actividad": ahora, "respuestas": [], "total": 0}
        doc["_id"] = self.col.insert_one(doc).inserted_id
        return doc

    def responder(self, id_texto, cuerpo, autor):
        respuesta = {"id": str(ObjectId()), "cuerpo": _txt(cuerpo, "Respuesta", 2000), "autor": autor, "fecha": _ahora()}
        doc = self.col.find_one_and_update({"_id": _oid(id_texto)},
                                           {"$push": {"respuestas": respuesta}, "$inc": {"total": 1}, "$set": {"actividad": respuesta["fecha"]}},
                                           return_document=_Retorno.AFTER)
        if not doc:
            raise ValidacionError("Ese hilo no existe")
        return doc


# ------------------------------------------------------------------ aula virtual (anuncios, material y tareas por curso)
class AulaDAO:
    TIPOS = ("anuncio", "material", "tarea")

    def __init__(self, bd):
        self.col = bd["aula"]
        self.col.create_index([("grupo", ASCENDING), ("fecha", DESCENDING)])

    def de_cursos(self, grupos):
        return list(self.col.find({"grupo": {"$in": [int(g) for g in grupos]}}).sort("fecha", DESCENDING).limit(100))

    def publicar(self, grupo, tipo, titulo, cuerpo, enlace, entrega, autor):
        if tipo not in self.TIPOS:
            raise ValidacionError("Tipo de publicación inválido")
        enlace = _txt(enlace, "Enlace", 300, obligatorio=False)
        if enlace and not enlace.startswith(("https://", "http://")):
            raise ValidacionError("El enlace debe empezar por https://")
        doc = {"grupo": int(grupo), "tipo": tipo, "titulo": _txt(titulo, "Título", 120), "cuerpo": _txt(cuerpo, "Descripción", 2000, obligatorio=False),
               "enlace": enlace or None, "entrega": _txt(entrega, "Fecha de entrega", 10, obligatorio=False) or None,
               "autor": autor, "fecha": _ahora()}
        doc["_id"] = self.col.insert_one(doc).inserted_id
        return doc

    def eliminar(self, id_texto, id_autor):
        doc = self.col.find_one_and_delete({"_id": _oid(id_texto), "autor.id": int(id_autor)})
        if not doc:
            raise ValidacionError("Esa publicación no existe o no es tuya")
        return doc


# ------------------------------------------------------------------ reconocimiento docente
class ReconocimientoDAO:
    CRITERIOS = {"dominio": "Dominio del tema", "claridad": "Claridad al explicar", "puntualidad": "Puntualidad", "trato": "Trato y respeto"}

    def __init__(self, bd):
        self.col = bd["reconocimientos"]
        self.col.create_index([("grupo", ASCENDING), ("estudiante", ASCENDING)], unique=True)
        self.col.create_index([("profesor", ASCENDING)])

    def evaluados(self, id_usuario):
        return {d["grupo"] for d in self.col.find({"estudiante": int(id_usuario)}, {"grupo": 1})}

    def evaluar(self, id_usuario, grupo, id_profesor, periodo, puntajes, comentario):
        if not isinstance(puntajes, dict) or set(puntajes) != set(self.CRITERIOS):
            raise ValidacionError("Califica los cuatro criterios")
        limpio = {}
        for k, v in puntajes.items():
            if isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 5:
                raise ValidacionError("Cada criterio va de 1 a 5")
            limpio[k] = v
        doc = {"grupo": int(grupo), "profesor": int(id_profesor), "periodo": periodo, "estudiante": int(id_usuario),
               "puntajes": limpio, "comentario": _txt(comentario, "Comentario", 400, obligatorio=False), "fecha": _ahora()}
        try:
            self.col.insert_one(doc)
        except Exception as err:
            if "E11000" in str(err):
                raise ValidacionError("Ya evaluaste a este profesor en este curso") from None
            raise
        return doc

    def resultados(self, id_profesor):
        """Agregación: promedio por criterio y por curso (las respuestas son anónimas)."""
        filas = list(self.col.aggregate([
            {"$match": {"profesor": int(id_profesor)}},
            {"$group": {"_id": "$grupo", "n": {"$sum": 1}, **{k: {"$avg": f"$puntajes.{k}"} for k in self.CRITERIOS},
                        "comentarios": {"$push": "$comentario"}}},
            {"$sort": {"_id": 1}}]))
        for f in filas:
            f["comentarios"] = [c for c in f["comentarios"] if c][-8:]
        return filas

    def ranking(self):
        return list(self.col.aggregate([
            {"$group": {"_id": "$profesor", "n": {"$sum": 1},
                        "promedio": {"$avg": {"$avg": [f"$puntajes.{k}" for k in self.CRITERIOS]}}}},
            {"$sort": {"promedio": -1}}]))


# ------------------------------------------------------------------ ciencias básicas: monitorías
class MonitoriaDAO:
    INICIALES = [
        ("Cálculo diferencial", "Límites y derivadas", "Lunes", "16:00-18:00", "Bloque B · 204", "Presencial", 12),
        ("Álgebra lineal", "Matrices y sistemas de ecuaciones", "Martes", "14:00-16:00", "Virtual", "Virtual", 20),
        ("Física mecánica", "Cinemática y leyes de Newton", "Miércoles", "10:00-12:00", "Laboratorio de Física", "Presencial", 10),
        ("Química general", "Estequiometría", "Jueves", "16:00-18:00", "Bloque C · 101", "Presencial", 12),
        ("Estadística", "Probabilidad y distribuciones", "Viernes", "08:00-10:00", "Virtual", "Virtual", 25),
        ("Cálculo integral", "Integrales por partes y sustitución", "Sábado", "09:00-11:00", "Bloque B · 204", "Presencial", 12),
    ]
    MONITORES = ("Laura Ríos", "Daniel Cárdenas", "Sofía Mejía", "Andrés Pardo", "Valentina Ruiz", "Mateo Gil")

    def __init__(self, bd):
        self.col = bd["monitorias"]
        if not self.col.estimated_document_count():
            self.col.insert_many([{"materia": m, "tema": t, "dia": d, "hora": h, "lugar": l, "modalidad": mo, "cupo": c,
                                   "monitor": self.MONITORES[i], "inscritos": []}
                                  for i, (m, t, d, h, l, mo, c) in enumerate(self.INICIALES)])

    def listar(self):
        return list(self.col.find({}).sort("_id", ASCENDING))

    def inscribir(self, id_texto, id_usuario):
        """Operación atómica: solo agrega si no está inscrito y si queda cupo ($expr con $size)."""
        doc = self.col.find_one_and_update(
            {"_id": _oid(id_texto), "inscritos": {"$ne": int(id_usuario)}, "$expr": {"$lt": [{"$size": "$inscritos"}, "$cupo"]}},
            {"$push": {"inscritos": int(id_usuario)}}, return_document=_Retorno.AFTER)
        if not doc:
            raise ValidacionError("No hay cupo o ya estás inscrito en esta monitoría")
        return doc

    def retirar(self, id_texto, id_usuario):
        doc = self.col.find_one_and_update({"_id": _oid(id_texto)}, {"$pull": {"inscritos": int(id_usuario)}},
                                           return_document=_Retorno.AFTER)
        if not doc:
            raise ValidacionError("Esa monitoría no existe")
        return doc


# ------------------------------------------------------------------ bases de datos en línea (recursos)
class RecursoDAO:
    INICIALES = [
        ("Google Académico", "https://scholar.google.com", "Multidisciplinar", "Buscador de artículos, tesis y libros académicos."),
        ("SciELO", "https://scielo.org", "Multidisciplinar", "Revistas científicas de acceso abierto de Iberoamérica."),
        ("Redalyc", "https://www.redalyc.org", "Multidisciplinar", "Red de revistas científicas de América Latina, acceso abierto."),
        ("DOAJ", "https://doaj.org", "Multidisciplinar", "Directorio de revistas de acceso abierto revisadas por pares."),
        ("PubMed", "https://pubmed.ncbi.nlm.nih.gov", "Salud", "Literatura biomédica y de ciencias de la salud."),
        ("arXiv", "https://arxiv.org", "Ingeniería y ciencias", "Preprints de física, matemáticas y ciencias de la computación."),
        ("IEEE Xplore", "https://ieeexplore.ieee.org", "Ingeniería y ciencias", "Ingeniería eléctrica, electrónica y computación."),
        ("ERIC", "https://eric.ed.gov", "Educación y sociales", "Investigación en educación."),
        ("Biblioteca Digital Mundial", "https://www.loc.gov/collections/world-digital-library/", "Humanidades y artes", "Documentos y mapas históricos de todo el mundo."),
        ("Europeana", "https://www.europeana.eu", "Humanidades y artes", "Patrimonio cultural digital de Europa."),
    ]

    def __init__(self, bd):
        self.col = bd["recursos"]
        if not self.col.estimated_document_count():
            self.col.insert_many([{"nombre": n, "url": u, "area": a, "descripcion": d} for n, u, a, d in self.INICIALES])

    def listar(self):
        return list(self.col.find({}).sort([("area", ASCENDING), ("nombre", ASCENDING)]))


# ------------------------------------------------------------------ certificados con código de verificación
class CertificadoDAO:
    TIPOS = {"estudios": "Certificado de estudios", "notas": "Certificado de notas", "matricula": "Constancia de matrícula"}

    def __init__(self, bd):
        self.col = bd["certificados"]
        self.col.create_index([("codigo", ASCENDING)], unique=True)

    def emitir(self, tipo, id_usuario, datos):
        if tipo not in self.TIPOS:
            raise ValidacionError("Tipo de certificado inválido")
        codigo = "-".join(_secrets.token_hex(2).upper() for _ in range(3))
        doc = {"codigo": codigo, "tipo": tipo, "titulo": self.TIPOS[tipo], "usuario": int(id_usuario), "datos": datos, "fecha": _ahora()}
        doc["_id"] = self.col.insert_one(doc).inserted_id
        return doc

    def de_usuario(self, id_usuario):
        return list(self.col.find({"usuario": int(id_usuario)}, {"datos": 0}).sort("fecha", DESCENDING).limit(20))

    def obtener(self, codigo, id_usuario=None):
        filtro = {"codigo": str(codigo).upper()[:20]}
        if id_usuario is not None:
            filtro["usuario"] = int(id_usuario)
        return self.col.find_one(filtro)


# ------------------------------------------------------------------ firma del contrato de matrícula
class ContratoDAO:
    def __init__(self, bd):
        self.col = bd["contratos"]
        self.col.create_index([("usuario", ASCENDING), ("periodo", ASCENDING)], unique=True)

    def firma(self, id_usuario, periodo):
        return self.col.find_one({"usuario": int(id_usuario), "periodo": str(periodo)})

    def firmar(self, id_usuario, periodo, nombre, ip, resumen):
        doc = {"usuario": int(id_usuario), "periodo": str(periodo), "nombre": nombre, "ip": ip, "resumen": resumen,
               "codigo": _secrets.token_hex(4).upper(), "fecha": _ahora()}
        try:
            self.col.insert_one(doc)
        except Exception as err:
            if "E11000" in str(err):
                raise ValidacionError("Ya firmaste el contrato de este periodo") from None
            raise
        return doc
