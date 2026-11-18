"""
Actividad 4 - Capa de acceso a datos (patrón DAO) para MongoDB con pymongo.

Colecciones:
    productos  -> ProductoDAO  (insert_one, find, find_one, update_one, delete_one)
    usuarios   -> UsuarioDAO   (registro e inicio de sesión de clientes)
    pedidos    -> PedidoDAO    (compras confirmadas)
    meta       -> versión del catálogo inicial (migraciones)

Seguridad (equivalente NoSQL de las consultas parametrizadas):
  - Los filtros se construyen como diccionarios con valores tipados
    ({"_id": ObjectId(...)}), nunca concatenando texto del usuario.
  - validar_producto() solo acepta una lista blanca de campos y tipos, por lo que
    un atacante no puede colar operadores como {"$where": ...} o {"$gt": ""}.
  - Las contraseñas se guardan con hash (scrypt/pbkdf2 de Werkzeug), nunca en texto plano.
  - El precio de un pedido se calcula en el servidor con los datos de la BD;
    el navegador solo envía qué producto, talla, color y cantidad.
"""
import os
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash

PRENDAS = ("camisa", "camiseta", "buzo", "chaqueta", "abrigo", "pantalon", "falda", "vestido", "gorra")
CATEGORIAS = ("Camisas", "Camisetas", "Abrigos", "Pantalones", "Faldas", "Vestidos", "Accesorios")
GENEROS = ("Mujer", "Hombre")
TALLAS = ("XS", "S", "M", "L", "XL")
SPECS = ("material", "ajuste", "cuidado", "origen")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,24}$")
ENVIO_GRATIS_DESDE = 250_000
COSTO_ENVIO = 12_000
VERSION_CATALOGO = 2


class ValidacionError(ValueError):
    """Datos enviados por el cliente que no cumplen el esquema."""


# ---------------------------------------------------------------- conexión
def conectar():
    """Crea el cliente de MongoDB a partir de MONGO_URI y verifica con un ping."""
    uri = os.getenv("MONGO_URI")
    if uri and "<db_password>" in uri:
        raise RuntimeError(
            "En el archivo .env, dentro de MONGO_URI, reemplace <db_password> (con los signos < >)\n"
            "  por la clave real del usuario de base de datos de Atlas.")
    if not uri or "<" in uri:
        raise RuntimeError(
            "Falta la cadena de conexión de MongoDB.\n"
            "  Abra el archivo .env (en la raíz del proyecto) y defina MONGO_URI\n"
            "  (local: mongodb://127.0.0.1:27017 · Atlas: Connect > Drivers > Python).")
    cliente = MongoClient(uri, serverSelectionTimeoutMS=8000, appname="tienda-guia8")
    cliente.admin.command("ping")  # falla rápido si la URI o la red son incorrectas
    return cliente


# ---------------------------------------------------------------- validación
def _texto(valor, campo, maximo, obligatorio=True):
    if not isinstance(valor, str):
        raise ValidacionError(f"'{campo}' debe ser texto")
    valor = valor.strip()
    if obligatorio and not valor:
        raise ValidacionError(f"'{campo}' es obligatorio")
    if len(valor) > maximo:
        raise ValidacionError(f"'{campo}' admite máximo {maximo} caracteres")
    return valor


def _entero(valor, campo, minimo, maximo):
    # bool es subclase de int: se excluye explícitamente
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not minimo <= valor <= maximo:
        raise ValidacionError(f"'{campo}' debe ser un número entre {minimo} y {maximo}")
    return int(round(valor))


def _opcion(valor, campo, opciones):
    if valor not in opciones:
        raise ValidacionError(f"'{campo}' debe ser una de: {', '.join(opciones)}")
    return valor


def validar_producto(datos, parcial=False):
    """Devuelve un diccionario limpio solo con campos permitidos y tipos correctos.
    parcial=True se usa en actualizaciones (los campos ausentes no se exigen)."""
    if not isinstance(datos, dict):
        raise ValidacionError("Se esperaba un objeto JSON")

    permitidos = {"nombre", "genero", "categoria", "prenda", "descripcion", "precio",
                  "descuento", "colores", "tallas", "especificaciones"}
    desconocidos = set(datos) - permitidos
    if desconocidos:
        raise ValidacionError(f"Campos no permitidos: {', '.join(sorted(desconocidos))}")

    limpio = {}
    pedir = lambda campo: campo in datos or not parcial  # noqa: E731

    if pedir("nombre"):
        limpio["nombre"] = _texto(datos.get("nombre"), "nombre", 60)
    if pedir("descripcion"):
        limpio["descripcion"] = _texto(datos.get("descripcion", ""), "descripcion", 280, obligatorio=False)
    if pedir("genero"):
        limpio["genero"] = _opcion(datos.get("genero"), "genero", GENEROS)
    if pedir("categoria"):
        limpio["categoria"] = _opcion(datos.get("categoria"), "categoria", CATEGORIAS)
    if pedir("prenda"):
        limpio["prenda"] = _opcion(datos.get("prenda"), "prenda", PRENDAS)
    if pedir("precio"):
        limpio["precio"] = _entero(datos.get("precio"), "precio", 1, 50_000_000)
    if pedir("descuento"):
        limpio["descuento"] = _entero(datos.get("descuento", 0), "descuento", 0, 90)

    if pedir("colores"):
        colores = datos.get("colores")
        if not isinstance(colores, list) or not 1 <= len(colores) <= 8:
            raise ValidacionError("'colores' debe tener entre 1 y 8 colores")
        lista = []
        for c in colores:
            if not isinstance(c, dict) or not HEX.match(str(c.get("hex", ""))):
                raise ValidacionError("Cada color necesita un 'hex' con formato #RRGGBB")
            lista.append({"nombre": _texto(c.get("nombre"), "nombre del color", 30),
                          "hex": c["hex"].lower()})
        limpio["colores"] = lista

    if pedir("tallas"):
        tallas = datos.get("tallas")
        if not isinstance(tallas, list) or not tallas or any(t not in TALLAS for t in tallas):
            raise ValidacionError(f"'tallas' debe ser una lista con valores de: {', '.join(TALLAS)}")
        limpio["tallas"] = [t for t in TALLAS if t in tallas]  # orden canónico, sin duplicados

    if pedir("especificaciones"):
        specs = datos.get("especificaciones") or {}
        if not isinstance(specs, dict) or set(specs) - set(SPECS):
            raise ValidacionError(f"'especificaciones' solo admite: {', '.join(SPECS)}")
        limpio["especificaciones"] = {k: _texto(specs.get(k, ""), k, 80, obligatorio=False) for k in SPECS}

    if parcial and not limpio:
        raise ValidacionError("No se envió ningún cambio")
    return limpio


def a_json(doc):
    """Convierte un documento de MongoDB a un dict serializable en JSON.
    La calificación se calcula a partir de los acumulados (puntos / reseñas)."""
    if doc is None:
        return None
    salida = dict(doc)
    salida["_id"] = str(salida["_id"])
    for campo in ("creado", "actualizado"):
        if isinstance(salida.get(campo), datetime):
            salida[campo] = salida[campo].isoformat()
    resenas = int(salida.get("resenas") or 0)
    puntos = int(salida.pop("puntos", 0) or 0)
    salida["resenas"] = resenas
    salida["calificacion"] = round(puntos / resenas, 1) if resenas else 0
    salida.setdefault("genero", "Mujer")
    return salida


def _oid(id_texto, que="producto"):
    try:
        return ObjectId(id_texto)
    except (InvalidId, TypeError):
        raise ValidacionError(f"ID de {que} inválido") from None


def precio_final(producto):
    return int(round(producto["precio"] * (1 - (producto.get("descuento") or 0) / 100)))


# ---------------------------------------------------------------- productos
class ProductoDAO:
    def __init__(self, coleccion):
        self.col = coleccion

    def crear(self, datos, extra=None):
        """CREATE -> insert_one. Retorna el documento insertado."""
        doc = validar_producto(datos)
        ahora = datetime.now(timezone.utc)
        doc.update({"resenas": 0, "puntos": 0, "creado": ahora, "actualizado": ahora})
        doc.update(extra or {})
        resultado = self.col.insert_one(doc)
        doc["_id"] = resultado.inserted_id
        return doc

    def listar(self):
        """READ -> find (todos los productos, en orden de creación)."""
        return list(self.col.find({}).sort("creado", ASCENDING))

    def obtener(self, id_texto):
        """READ -> find_one por _id."""
        return self.col.find_one({"_id": _oid(id_texto)})

    def actualizar(self, id_texto, cambios):
        """UPDATE -> update_one con $set solo de los campos validados.
        Retorna el documento actualizado o None si no existe."""
        limpio = validar_producto(cambios, parcial=True)
        limpio["actualizado"] = datetime.now(timezone.utc)
        resultado = self.col.update_one({"_id": _oid(id_texto)}, {"$set": limpio})
        if resultado.matched_count == 0:
            return None
        return self.obtener(id_texto)

    def eliminar(self, id_texto):
        """DELETE -> delete_one. Retorna True si se eliminó."""
        return self.col.delete_one({"_id": _oid(id_texto)}).deleted_count == 1

    def sumar_calificacion(self, id_texto, estrellas):
        """UPDATE -> update_one con $inc (operación atómica en el servidor)."""
        self.col.update_one(
            {"_id": _oid(id_texto)},
            {"$inc": {"resenas": 1, "puntos": estrellas},
             "$set": {"actualizado": datetime.now(timezone.utc)}},
        )
        return self.obtener(id_texto)

    def preparar_catalogo(self):
        """Carga el catálogo inicial la primera vez y lo migra a la versión actual
        (agrega género y calificaciones a productos antiguos e inserta los nuevos).
        Retorna cuántos productos se insertaron."""
        meta = self.col.database["meta"]
        estado = meta.find_one({"_id": "catalogo"}) or {}
        if estado.get("version", 0) >= VERSION_CATALOGO:
            return 0

        insertados = 0
        for item in CATALOGO_INICIAL:
            datos = {k: v for k, v in item.items() if k not in ("calificacion", "resenas")}
            resenas = item["resenas"]
            extra = {"resenas": resenas, "puntos": round(item["calificacion"] * resenas)}
            existente = self.col.find_one({"nombre": item["nombre"]})
            if existente is None:
                self.crear(datos, extra)
                insertados += 1
            elif "genero" not in existente:
                cambios = {"genero": item["genero"], "categoria": item["categoria"], **extra}
                self.col.update_one({"_id": existente["_id"]}, {"$set": cambios})

        # Productos creados por el admin antes de la migración
        self.col.update_many({"genero": {"$exists": False}},
                             {"$set": {"genero": "Mujer", "resenas": 0, "puntos": 0}})
        meta.update_one({"_id": "catalogo"}, {"$set": {"version": VERSION_CATALOGO}}, upsert=True)
        return insertados


# ---------------------------------------------------------------- usuarios
def usuario_json(doc):
    return None if doc is None else {"id": str(doc["_id"]), "nombre": doc["nombre"], "email": doc["email"]}


class UsuarioDAO:
    def __init__(self, coleccion):
        self.col = coleccion
        self.col.create_index([("email", ASCENDING)], unique=True)

    def registrar(self, datos):
        """CREATE -> insert_one con la contraseña cifrada (hash)."""
        if not isinstance(datos, dict):
            raise ValidacionError("Se esperaba un objeto JSON")
        nombre = _texto(datos.get("nombre"), "nombre", 40)
        if len(nombre) < 2:
            raise ValidacionError("Escribe tu nombre")
        email = _texto(datos.get("email"), "correo", 254).lower()
        if not EMAIL.match(email):
            raise ValidacionError("El correo no es válido")
        clave = datos.get("clave")
        if not isinstance(clave, str) or not 8 <= len(clave) <= 128:
            raise ValidacionError("La contraseña debe tener entre 8 y 128 caracteres")
        doc = {"nombre": nombre, "email": email, "clave_hash": generate_password_hash(clave),
               "calificados": [], "creado": datetime.now(timezone.utc)}
        try:
            doc["_id"] = self.col.insert_one(doc).inserted_id
        except DuplicateKeyError:
            raise ValidacionError("Ya existe una cuenta con ese correo") from None
        return doc

    def autenticar(self, datos):
        """READ -> find_one por correo y verificación del hash. None si no coincide."""
        if not isinstance(datos, dict):
            raise ValidacionError("Se esperaba un objeto JSON")
        email, clave = datos.get("email"), datos.get("clave")
        if not isinstance(email, str) or not isinstance(clave, str):
            raise ValidacionError("Escribe tu correo y contraseña")
        doc = self.col.find_one({"email": email.strip().lower()})
        if doc is None or not check_password_hash(doc["clave_hash"], clave):
            return None
        return doc

    def obtener(self, id_texto):
        try:
            return self.col.find_one({"_id": ObjectId(id_texto)})
        except (InvalidId, TypeError):
            return None

    def marcar_calificado(self, id_usuario, id_producto):
        """UPDATE -> update_one con $addToSet. Retorna False si ya había calificado
        ese producto (el filtro $ne hace que la operación sea atómica)."""
        r = self.col.update_one({"_id": ObjectId(id_usuario), "calificados": {"$ne": id_producto}},
                                {"$addToSet": {"calificados": id_producto}})
        return r.modified_count == 1


# ---------------------------------------------------------------- pedidos
class PedidoDAO:
    def __init__(self, coleccion, productos):
        self.col = coleccion
        self.productos = productos

    def crear(self, usuario, datos):
        """CREATE -> insert_one. Los precios se toman de la BD, no del navegador."""
        items = datos.get("items") if isinstance(datos, dict) else None
        if not isinstance(items, list) or not 1 <= len(items) <= 30:
            raise ValidacionError("La bolsa está vacía")
        lineas = []
        for it in items:
            if not isinstance(it, dict):
                raise ValidacionError("Producto inválido en la bolsa")
            p = self.productos.obtener(it.get("id"))
            if p is None:
                raise ValidacionError("Uno de los productos ya no está disponible")
            talla = _opcion(it.get("talla"), "talla", tuple(p.get("tallas", ())))
            color = _entero(it.get("color", 0), "color", 0, len(p["colores"]) - 1)
            cantidad = _entero(it.get("cantidad", 1), "cantidad", 1, 10)
            unitario = precio_final(p)
            lineas.append({"producto_id": p["_id"], "nombre": p["nombre"], "talla": talla,
                           "color": p["colores"][color]["nombre"], "cantidad": cantidad,
                           "precio_unitario": unitario, "total": unitario * cantidad})
        subtotal = sum(linea["total"] for linea in lineas)
        envio = 0 if subtotal >= ENVIO_GRATIS_DESDE else COSTO_ENVIO
        pedido = {"usuario_id": usuario["_id"], "cliente": usuario["nombre"], "items": lineas,
                  "subtotal": subtotal, "envio": envio, "total": subtotal + envio,
                  "estado": "confirmado", "creado": datetime.now(timezone.utc)}
        pedido["_id"] = self.col.insert_one(pedido).inserted_id
        return pedido

    def recientes(self, usuario_id, limite=5):
        return list(self.col.find({"usuario_id": usuario_id}).sort("creado", DESCENDING).limit(limite))


def pedido_json(doc):
    return {
        "numero": "MC-" + str(doc["_id"])[-6:].upper(),
        "items": [{k: v for k, v in it.items() if k != "producto_id"} for it in doc["items"]],
        "subtotal": doc["subtotal"], "envio": doc["envio"], "total": doc["total"],
        "estado": doc["estado"], "creado": doc["creado"].isoformat(),
    }


# ---------------------------------------------------------------- catálogo inicial
def _p(nombre, genero, categoria, prenda, precio, descuento, calificacion, resenas, descripcion,
       colores, tallas, material, ajuste, cuidado, origen="Hecho en Colombia"):
    return {
        "nombre": nombre, "genero": genero, "categoria": categoria, "prenda": prenda,
        "precio": precio, "descuento": descuento, "descripcion": descripcion,
        "calificacion": calificacion, "resenas": resenas,
        "colores": [{"nombre": n, "hex": h} for n, h in colores],
        "tallas": tallas,
        "especificaciones": {"material": material, "ajuste": ajuste, "cuidado": cuidado, "origen": origen},
    }


TODAS = ["XS", "S", "M", "L", "XL"]
CATALOGO_INICIAL = [
    # ------------------------------------------------------------ Hombre
    _p("Camisa Oxford", "Hombre", "Camisas", "camisa", 189000, 0, 4.7, 231,
       "Corte recto en algodón oxford de trama cerrada. Cuello con botones y puño ajustable.",
       [("Blanco hueso", "#f2f0eb"), ("Celeste", "#b9cde0"), ("Grafito", "#4a4c50")], ["S", "M", "L", "XL"],
       "100 % algodón oxford", "Regular", "Lavar a 30 °C, planchar tibio"),
    _p("Camiseta Esencial", "Hombre", "Camisetas", "camiseta", 79000, 15, 4.8, 518,
       "Tejido de punto pesado de 220 g con cuello acanalado que no se deforma.",
       [("Negro", "#1c1c1e"), ("Blanco", "#f5f5f4"), ("Arena", "#d8cbb4")], TODAS,
       "Algodón peinado 220 g/m²", "Oversize", "Lavar del revés"),
    _p("Buzo Capota", "Hombre", "Abrigos", "buzo", 239000, 0, 4.6, 174,
       "Felpa perchada por dentro, bolsillo canguro y capota de doble capa.",
       [("Gris jaspe", "#9a9a9c"), ("Carbón", "#2b2b2e"), ("Salvia", "#a3b09a")], ["S", "M", "L", "XL"],
       "80 % algodón, 20 % poliéster", "Relajado", "No usar secadora"),
    _p("Chaqueta Técnica", "Hombre", "Abrigos", "chaqueta", 459000, 20, 4.7, 92,
       "Cortavientos repelente al agua con cremallera sellada y forro de malla.",
       [("Negro mate", "#151517"), ("Oliva", "#5d6248"), ("Piedra", "#c8c4bb")], ["S", "M", "L"],
       "Nylon ripstop con DWR", "Regular", "Lavar a mano en frío", "Importado"),
    _p("Pantalón Sastre", "Hombre", "Pantalones", "pantalon", 269000, 0, 4.5, 108,
       "Pierna recta con pinza frontal y pretina interna antideslizante.",
       [("Antracita", "#3a3b3f"), ("Camel", "#b58e62"), ("Marfil", "#e9e4d8")], ["S", "M", "L", "XL"],
       "Lana fría y elastano", "Recto", "Lavado en seco"),
    _p("Gorra Seis Paneles", "Hombre", "Accesorios", "gorra", 89000, 0, 4.4, 66,
       "Visera curva, correa de cuero trasera y ojales bordados.",
       [("Negro", "#18181a"), ("Hueso", "#ece8df"), ("Azul marino", "#2d3a52")], ["M"],
       "Sarga de algodón", "Ajustable", "Limpiar con paño húmedo"),
    _p("Abrigo Merino", "Hombre", "Abrigos", "abrigo", 689000, 10, 4.9, 58,
       "Abrigo largo cruzado en paño de lana merino, con cinturón y forro satinado.",
       [("Carbón", "#26262a"), ("Camel", "#a88761"), ("Gris perla", "#bdbcbc")], ["S", "M", "L", "XL"],
       "70 % lana merino, 30 % poliamida", "Recto", "Lavado en seco", "Importado"),
    _p("Camisa Lino", "Hombre", "Camisas", "camisa", 209000, 0, 4.6, 83,
       "Lino lavado de caída suave, cuello italiano y bajo redondeado.",
       [("Blanco", "#f4f3ef"), ("Arena", "#d9cdb8"), ("Azul humo", "#7f8b99")], ["S", "M", "L", "XL"],
       "100 % lino europeo", "Relajado", "Lavar a 30 °C, secar a la sombra"),
    _p("Camiseta Pima", "Hombre", "Camisetas", "camiseta", 99000, 0, 4.7, 190,
       "Algodón pima de fibra extra larga: más suave, más fresco y sin bolitas.",
       [("Blanco óptico", "#fafafa"), ("Gris medio", "#8d8d91"), ("Negro", "#141416")], TODAS,
       "100 % algodón pima", "Slim", "Lavar en frío", "Importado"),
    _p("Chaqueta Denim", "Hombre", "Abrigos", "chaqueta", 299000, 0, 4.5, 137,
       "Denim rígido de 13 oz con lavado medio, botones metálicos y bolsillos de parche.",
       [("Índigo", "#3b4a66"), ("Negro lavado", "#2f2f33"), ("Crudo", "#e3dccb")], ["S", "M", "L", "XL"],
       "100 % algodón denim 13 oz", "Regular", "Lavar del revés en frío"),
    _p("Pantalón Chino", "Hombre", "Pantalones", "pantalon", 199000, 30, 4.4, 256,
       "Gabardina elástica con bolsillos al sesgo y bota ligeramente cónica.",
       [("Caqui", "#bfae8a"), ("Azul noche", "#25304a"), ("Verde musgo", "#5b5f45")], ["S", "M", "L", "XL"],
       "98 % algodón, 2 % elastano", "Slim", "Lavar a 30 °C"),
    # ------------------------------------------------------------ Mujer
    _p("Vestido Lino", "Mujer", "Vestidos", "vestido", 319000, 10, 4.8, 212,
       "Silueta fluida en lino lavado con tirantes ajustables y falda al bies.",
       [("Crudo", "#ede6d6"), ("Terracota", "#b8674a"), ("Noche", "#24262d")], ["XS", "S", "M", "L"],
       "100 % lino lavado", "Fluido", "Lavar a 30 °C, secar a la sombra"),
    _p("Vestido Satén Midi", "Mujer", "Vestidos", "vestido", 389000, 0, 4.7, 96,
       "Satén de viscosa con brillo sutil, escote recto y largo a media pierna.",
       [("Champaña", "#d9c8a9"), ("Negro", "#121214"), ("Verde botella", "#2e4a3e")], ["XS", "S", "M", "L"],
       "100 % viscosa satinada", "Al cuerpo", "Lavar a mano en frío"),
    _p("Falda Plisada", "Mujer", "Faldas", "falda", 199000, 0, 4.6, 143,
       "Plisado permanente que se mueve contigo, pretina elástica oculta.",
       [("Gris plata", "#b8b8bc"), ("Negro", "#17171a"), ("Rosa empolvado", "#d8b9b4")], ["XS", "S", "M", "L"],
       "Poliéster reciclado plisado", "Midi", "Lavar en frío, no planchar"),
    _p("Falda Lana Midi", "Mujer", "Faldas", "falda", 229000, 15, 4.5, 61,
       "Paño de lana con corte en A, abertura posterior y forro interior.",
       [("Camel", "#b48d63"), ("Gris oscuro", "#3d3d42"), ("Crema", "#ece5d5")], ["XS", "S", "M", "L"],
       "60 % lana, 40 % poliéster", "Corte A", "Lavado en seco"),
    _p("Blusa Seda Lavada", "Mujer", "Camisas", "camisa", 179000, 0, 4.7, 88,
       "Tacto de seda lavada, cuello camisero suave y puños con doble botón.",
       [("Marfil", "#efe9dc"), ("Negro", "#151517"), ("Azul cielo", "#b7c9db")], ["XS", "S", "M", "L"],
       "100 % viscosa efecto seda", "Relajado", "Lavar a mano"),
    _p("Camisa Popelina", "Mujer", "Camisas", "camisa", 159000, 20, 4.4, 154,
       "Popelina de algodón crujiente en corte oversize con hombro caído.",
       [("Blanco", "#f7f7f5"), ("Rayas azules", "#a9b7c9"), ("Arena", "#dccfb7")], TODAS,
       "100 % algodón popelina", "Oversize", "Lavar a 30 °C"),
    _p("Camiseta Rib", "Mujer", "Camisetas", "camiseta", 59000, 0, 4.6, 402,
       "Punto acanalado elástico que se ajusta al cuerpo sin transparentar.",
       [("Blanco", "#f5f5f3"), ("Negro", "#161618"), ("Moca", "#8a7462")], ["XS", "S", "M", "L"],
       "95 % algodón, 5 % elastano", "Ajustado", "Lavar en frío"),
    _p("Trench Clásico", "Mujer", "Abrigos", "abrigo", 549000, 0, 4.9, 77,
       "Gabardina cruzada con charreteras, cinturón y forro a cuadros.",
       [("Beige", "#cdb894"), ("Negro", "#19191b"), ("Gris piedra", "#a4a19a")], ["XS", "S", "M", "L"],
       "Gabardina de algodón impermeable", "Recto", "Lavado en seco", "Importado"),
    _p("Buzo Cropped", "Mujer", "Abrigos", "buzo", 189000, 25, 4.3, 119,
       "Felpa francesa liviana en largo corto, capota y puños acanalados.",
       [("Gris claro", "#c9c9cc"), ("Lavanda", "#b9b2c9"), ("Negro", "#1a1a1c")], ["XS", "S", "M", "L"],
       "100 % algodón felpa francesa", "Cropped", "No usar secadora"),
    _p("Pantalón Wide Leg", "Mujer", "Pantalones", "pantalon", 249000, 0, 4.7, 180,
       "Tiro alto, pierna amplia y pliegues frontales que estilizan la figura.",
       [("Negro", "#141416"), ("Hueso", "#e8e2d6"), ("Chocolate", "#5a4334")], ["XS", "S", "M", "L"],
       "Crepé con elastano", "Pierna ancha", "Lavar a 30 °C"),
    _p("Gorra Lino", "Mujer", "Accesorios", "gorra", 79000, 0, 4.2, 45,
       "Gorra de seis paneles en lino natural con hebilla metálica.",
       [("Natural", "#e2d8c3"), ("Negro", "#19191b"), ("Salvia", "#a7b29e")], ["M"],
       "100 % lino", "Ajustable", "Limpiar con paño húmedo"),
]
