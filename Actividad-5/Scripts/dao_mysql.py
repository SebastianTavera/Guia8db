"""
Actividad 5 - Acceso a datos transaccionales en MySQL / MariaDB (patrón DAO).

Cada clase concentra las consultas de una entidad. La lógica de la aplicación
(app.py y admin.py) nunca escribe SQL: solo llama a estos métodos.

Seguridad:
  - TODAS las consultas que reciben datos usan parámetros (%s + tupla); el conector
    envía los valores aparte del SQL, así que no hay inyección SQL posible.
  - Los datos se validan antes de llegar a la base (tipos, longitudes, rangos).
  - Las contraseñas se guardan como hash; nunca en texto plano.
  - Los profesores solo pueden leer y calificar SUS cursos (se verifica en el WHERE).
"""
import re
from datetime import date, datetime
from decimal import Decimal

from werkzeug.security import check_password_hash, generate_password_hash

from config import mysql_cursor

ROLES = ("admin", "estudiante", "profesor", "general")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,24}$")


class ValidacionError(ValueError):
    """Dato inválido enviado por el usuario (se muestra tal cual)."""


# ------------------------------------------------------------------ utilidades
def texto(valor, campo, maximo, obligatorio=True):
    if valor is None:
        valor = ""
    if not isinstance(valor, str):
        raise ValidacionError(f"{campo}: debe ser texto")
    valor = valor.strip()
    if obligatorio and not valor:
        raise ValidacionError(f"{campo} es obligatorio")
    if len(valor) > maximo:
        raise ValidacionError(f"{campo}: máximo {maximo} caracteres")
    return valor or None


def entero(valor, campo, minimo=1, maximo=2_147_483_647):
    try:
        if isinstance(valor, bool):
            raise TypeError
        numero = int(str(valor).strip())
    except (TypeError, ValueError):
        raise ValidacionError(f"{campo} debe ser un número entero") from None
    if not minimo <= numero <= maximo:
        raise ValidacionError(f"{campo} debe estar entre {minimo} y {maximo}")
    return numero


def correo_valido(valor, campo="Correo"):
    valor = texto(valor, campo, 120).lower()
    if not EMAIL.match(valor):
        raise ValidacionError(f"{campo} no es válido")
    return valor


def clave_valida(clave):
    if not isinstance(clave, str) or not 8 <= len(clave) <= 128:
        raise ValidacionError("La contraseña debe tener entre 8 y 128 caracteres")
    return clave


def a_json(fila):
    """Convierte Decimal y fechas para poder enviarlas como JSON."""
    if fila is None:
        return None
    salida = {}
    for k, v in fila.items():
        if isinstance(v, Decimal):
            v = float(v)
        elif isinstance(v, (date, datetime)):
            v = v.isoformat()
        salida[k] = v
    return salida


# ------------------------------------------------------------------ usuarios
class UsuarioDAO:
    COLUMNAS = "IdUsuario, Correo, Nombre, Rol, IdEstudiante, IdProfesor, Activo, Creado, UltimoAcceso"

    def crear(self, nombre, correo, clave, rol, id_estudiante=None, id_profesor=None):
        """INSERT parametrizado. Retorna el IdUsuario nuevo."""
        if rol not in ROLES:
            raise ValidacionError("Rol inválido")
        nombre = texto(nombre, "Nombre", 80)
        correo = correo_valido(correo)
        clave_valida(clave)
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT 1 FROM Usuario WHERE Correo = %s", (correo,))
            if cur.fetchone():
                raise ValidacionError("Ya existe una cuenta con ese correo")
            if id_estudiante is not None:
                cur.execute("SELECT 1 FROM Usuario WHERE IdEstudiante = %s", (id_estudiante,))
                if cur.fetchone():
                    raise ValidacionError("Ese estudiante ya tiene una cuenta")
            if id_profesor is not None:
                cur.execute("SELECT 1 FROM Usuario WHERE IdProfesor = %s", (id_profesor,))
                if cur.fetchone():
                    raise ValidacionError("Ese profesor ya tiene una cuenta")
            cur.execute(
                "INSERT INTO Usuario (Correo, Nombre, ClaveHash, Rol, IdEstudiante, IdProfesor) VALUES (%s, %s, %s, %s, %s, %s)",
                (correo, nombre, generate_password_hash(clave), rol, id_estudiante, id_profesor),
            )
            return cur.lastrowid

    def autenticar(self, correo, clave, roles=None):
        """Verifica correo + contraseña (hash). Retorna el usuario o None."""
        if not isinstance(correo, str) or not isinstance(clave, str):
            return None
        with mysql_cursor() as (_, cur):
            cur.execute(f"SELECT {self.COLUMNAS}, ClaveHash FROM Usuario WHERE Correo = %s", (correo.strip().lower(),))
            fila = cur.fetchone()
            if not fila or not fila["Activo"] or not check_password_hash(fila.pop("ClaveHash"), clave):
                return None
            if roles and fila["Rol"] not in roles:
                return None
            cur.execute("UPDATE Usuario SET UltimoAcceso = NOW() WHERE IdUsuario = %s", (fila["IdUsuario"],))
            return fila

    def obtener(self, id_usuario):
        with mysql_cursor() as (_, cur):
            cur.execute(f"SELECT {self.COLUMNAS} FROM Usuario WHERE IdUsuario = %s AND Activo = 1", (id_usuario,))
            return cur.fetchone()

    def listar(self):
        with mysql_cursor() as (_, cur):
            cur.execute(f"SELECT {self.COLUMNAS} FROM Usuario ORDER BY Rol, Nombre")
            return cur.fetchall()

    def hay_admin(self):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT COUNT(*) AS n FROM Usuario WHERE Rol = 'admin' AND Activo = 1")
            return cur.fetchone()["n"] > 0

    @staticmethod
    def _persona(tipo, documento, correo):
        """Busca al estudiante o profesor cuyo documento Y correo institucional coinciden."""
        documento = entero(documento, "Documento")
        correo = correo_valido(correo, "Correo institucional")
        if tipo == "estudiante":
            sql = ("SELECT IdEstudiante AS Id, CONCAT_WS(' ', PrimerNombre, PrimerApellido) AS Nombre "
                   "FROM Estudiante WHERE IdEstudiante = %s AND LOWER(CorreoEstudiante) = %s")
        elif tipo == "profesor":
            sql = ("SELECT IdProfesor AS Id, CONCAT_WS(' ', PrimerNombreProfesor, PrimerApellidoProfesor) AS Nombre "
                   "FROM Profesor WHERE IdProfesor = %s AND LOWER(CorreoProfesor) = %s")
        else:
            raise ValidacionError("Tipo de cuenta inválido")
        with mysql_cursor() as (_, cur):
            cur.execute(sql, (documento, correo))
            persona = cur.fetchone()
        if not persona:
            raise ValidacionError("El documento y el correo institucional no coinciden con nuestros registros")
        return persona

    def vincular(self, id_usuario, tipo, documento, correo, clave):
        """Convierte una cuenta de público general en cuenta de estudiante o profesor.
        Pide la contraseña actual y el documento + correo institucional (igual que la activación)."""
        persona = self._persona(tipo, documento, correo)
        columna = "IdEstudiante" if tipo == "estudiante" else "IdProfesor"
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT Rol, ClaveHash FROM Usuario WHERE IdUsuario = %s FOR UPDATE", (id_usuario,))
            fila = cur.fetchone()
            if not fila or fila["Rol"] != "general":
                raise ValidacionError("Solo las cuentas de público general se pueden vincular")
            if not isinstance(clave, str) or not check_password_hash(fila["ClaveHash"], clave):
                raise ValidacionError("La contraseña actual no es correcta")
            cur.execute(f"SELECT 1 FROM Usuario WHERE {columna} = %s", (persona["Id"],))
            if cur.fetchone():
                raise ValidacionError(f"Ese {tipo} ya tiene una cuenta en Campus")
            cur.execute(f"UPDATE Usuario SET Rol = %s, {columna} = %s, Nombre = %s WHERE IdUsuario = %s",
                        (tipo, persona["Id"], persona["Nombre"], id_usuario))
        return persona

    def activar_cuenta(self, tipo, documento, correo, clave):
        """Un estudiante o profesor crea su cuenta demostrando que conoce su documento
        y su correo institucional (deben coincidir con el registro de la universidad)."""
        correo = correo_valido(correo, "Correo institucional")
        persona = self._persona(tipo, documento, correo)
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT Rol FROM Usuario WHERE Correo = %s", (correo,))
            existente = cur.fetchone()
        if existente and existente["Rol"] == "general":
            raise ValidacionError("Ya creaste una cuenta de público general con ese correo. Ingresa con ella y usa "
                                  "«Vincular mi cuenta» para convertirla en cuenta de " + tipo)
        return self.crear(persona["Nombre"], correo, clave, tipo,
                          id_estudiante=persona["Id"] if tipo == "estudiante" else None,
                          id_profesor=persona["Id"] if tipo == "profesor" else None)

    def cambiar_clave(self, id_usuario, clave):
        clave_valida(clave)
        with mysql_cursor() as (_, cur):
            cur.execute("UPDATE Usuario SET ClaveHash = %s WHERE IdUsuario = %s", (generate_password_hash(clave), id_usuario))
            return cur.rowcount == 1

    def cambiar_estado(self, id_usuario, activo):
        with mysql_cursor() as (_, cur):
            cur.execute("UPDATE Usuario SET Activo = %s WHERE IdUsuario = %s", (1 if activo else 0, id_usuario))
            return cur.rowcount == 1

    def eliminar(self, id_usuario):
        with mysql_cursor() as (_, cur):
            cur.execute("DELETE FROM Usuario WHERE IdUsuario = %s AND Rol <> 'admin'", (id_usuario,))
            return cur.rowcount == 1

    def ids_de_profesor(self, id_grupo):
        """IdUsuario del profesor asignado a un curso (para avisarle de inscripciones y retiros)."""
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT u.IdUsuario FROM Usuario u JOIN Grupo g ON g.IdProfesor = u.IdProfesor WHERE g.IdGrupo = %s",
                        (id_grupo,))
            return [f["IdUsuario"] for f in cur.fetchall()]

    def ids_de_estudiantes(self, ids_estudiante):
        """IdUsuario de las cuentas enlazadas a esos estudiantes (para notificarles)."""
        ids = [int(i) for i in ids_estudiante if i is not None]
        if not ids:
            return []
        marcas = ", ".join(["%s"] * len(ids))  # solo marcadores %s: los valores van aparte
        with mysql_cursor() as (_, cur):
            cur.execute(f"SELECT IdUsuario FROM Usuario WHERE IdEstudiante IN ({marcas})", tuple(ids))
            return [f["IdUsuario"] for f in cur.fetchall()]


# ------------------------------------------------------------------ oferta académica (pública)
class OfertaDAO:
    def programas(self):
        """Programas -> materias -> grupos, con cupos ocupados en vivo."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT p.IdPrograma, p.NombrePrograma, p.Facultad, p.Duracion,
                       m.IdMateria, m.NombreMateria, m.CreditosMateria,
                       g.IdGrupo, g.Periodo, g.Horario, g.Cupo,
                       CONCAT_WS(' ', pr.PrimerNombreProfesor, pr.PrimerApellidoProfesor) AS Profesor,
                       (SELECT COUNT(*) FROM Matricula x WHERE x.IdGrupo = g.IdGrupo) AS Inscritos
                FROM Programa p
                LEFT JOIN Materia m ON m.IdPrograma = p.IdPrograma
                LEFT JOIN Grupo g ON g.IdMateria = m.IdMateria
                LEFT JOIN Profesor pr ON pr.IdProfesor = g.IdProfesor
                ORDER BY p.Facultad, p.NombrePrograma, m.NombreMateria, g.IdGrupo
            """)
            filas = cur.fetchall()
        programas = {}
        for f in filas:
            prog = programas.setdefault(f["IdPrograma"], {
                "id": f["IdPrograma"], "nombre": f["NombrePrograma"], "facultad": f["Facultad"],
                "duracion": f["Duracion"], "materias": {}})
            if f["IdMateria"] is None:
                continue
            mat = prog["materias"].setdefault(f["IdMateria"], {
                "id": f["IdMateria"], "nombre": f["NombreMateria"], "creditos": f["CreditosMateria"], "grupos": []})
            if f["IdGrupo"] is not None:
                mat["grupos"].append({"id": f["IdGrupo"], "periodo": f["Periodo"], "horario": f["Horario"],
                                      "cupo": f["Cupo"], "inscritos": f["Inscritos"], "profesor": f["Profesor"]})
        salida = []
        for prog in programas.values():
            prog["materias"] = list(prog["materias"].values())
            salida.append(prog)
        return salida


# ------------------------------------------------------------------ estudiantes
class EstudianteDAO:
    CAMPOS = ("PrimerNombre", "SegundoNombre", "PrimerApellido", "SegundoApellido", "CorreoEstudiante",
              "PrefijoTelefono", "Telefono", "FechaNacimiento", "Direccion")

    def listar(self):
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT e.IdEstudiante, CONCAT_WS(' ', e.PrimerNombre, e.PrimerApellido) AS Nombre,
                       e.CorreoEstudiante, e.Telefono, e.Promedio, e.EstadoAcademico,
                       COUNT(m.IdMatricula) AS Materias,
                       (SELECT COUNT(*) FROM Usuario u WHERE u.IdEstudiante = e.IdEstudiante) AS TieneCuenta
                FROM Estudiante e LEFT JOIN Matricula m ON m.IdEstudiante = e.IdEstudiante
                GROUP BY e.IdEstudiante ORDER BY e.PrimerApellido, e.PrimerNombre
            """)
            return cur.fetchall()

    def obtener(self, id_estudiante):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT * FROM Estudiante WHERE IdEstudiante = %s", (id_estudiante,))
            return cur.fetchone()

    @staticmethod
    def validar(datos, parcial=False):
        reglas = {"PrimerNombre": (50, True), "SegundoNombre": (50, False), "PrimerApellido": (50, True),
                  "SegundoApellido": (50, False), "CorreoEstudiante": (80, True), "PrefijoTelefono": (5, False),
                  "Telefono": (15, True), "FechaNacimiento": (10, True), "Direccion": (80, False)}
        limpio = {}
        for campo, (maximo, obligatorio) in reglas.items():
            if campo not in datos and parcial:
                continue
            valor = texto(datos.get(campo), campo, maximo, obligatorio and not parcial)
            if campo == "CorreoEstudiante" and valor:
                valor = correo_valido(valor, "Correo")
            if campo == "Telefono" and valor and not re.fullmatch(r"[0-9 ]{7,15}", valor):
                raise ValidacionError("Teléfono: solo números (7 a 15 dígitos)")
            if campo == "FechaNacimiento" and valor:
                try:
                    datetime.strptime(valor, "%Y-%m-%d")
                except ValueError:
                    raise ValidacionError("Fecha de nacimiento: use el formato AAAA-MM-DD") from None
            limpio[campo] = valor
        return limpio

    def crear(self, id_estudiante, datos):
        limpio = self.validar(datos)
        limpio.setdefault("PrefijoTelefono", "+57")
        limpio["PrefijoTelefono"] = limpio["PrefijoTelefono"] or "+57"
        columnas = ", ".join(("IdEstudiante",) + tuple(limpio))
        marcas = ", ".join(["%s"] * (len(limpio) + 1))
        with mysql_cursor() as (_, cur):
            cur.execute(f"INSERT INTO Estudiante ({columnas}) VALUES ({marcas})", (id_estudiante, *limpio.values()))

    def actualizar(self, id_estudiante, datos):
        """UPDATE solo de los campos enviados (los nombres de columna vienen de la lista blanca)."""
        limpio = self.validar(datos, parcial=True)
        if not limpio:
            raise ValidacionError("No hay cambios")
        asignaciones = ", ".join(f"{c} = %s" for c in limpio)
        with mysql_cursor() as (_, cur):
            cur.execute(f"UPDATE Estudiante SET {asignaciones} WHERE IdEstudiante = %s", (*limpio.values(), id_estudiante))
            return cur.rowcount

    def eliminar(self, id_estudiante):
        with mysql_cursor() as (_, cur):
            cur.execute("DELETE FROM Estudiante WHERE IdEstudiante = %s", (id_estudiante,))
            return cur.rowcount == 1

    CONSULTA_MATRICULA = """
        SELECT mt.IdMatricula, mt.IdEstudiante, g.IdGrupo, m.IdMateria, m.NombreMateria, m.CreditosMateria,
               p.IdPrograma, p.NombrePrograma, p.Facultad, g.Periodo, g.Horario, g.Cupo,
               g.IdProfesor, CONCAT_WS(' ', pr.PrimerNombreProfesor, pr.PrimerApellidoProfesor) AS Profesor,
               pr.CorreoProfesor, mt.NotaFinal, mt.EstadoCurso, mt.ValorMatricula, mt.FechaMatricula,
               (SELECT COUNT(*) FROM Matricula x WHERE x.IdGrupo = g.IdGrupo) AS Inscritos,
               (SELECT COUNT(*) FROM Grupo g2 WHERE g2.IdMateria = g.IdMateria AND g2.IdGrupo <> g.IdGrupo) AS OtrosGrupos
        FROM Matricula mt
        JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
        JOIN Materia m ON m.IdMateria = g.IdMateria
        JOIN Programa p ON p.IdPrograma = m.IdPrograma
        LEFT JOIN Profesor pr ON pr.IdProfesor = g.IdProfesor
    """

    def materias(self, id_estudiante):
        with mysql_cursor() as (_, cur):
            cur.execute(self.CONSULTA_MATRICULA + " WHERE mt.IdEstudiante = %s ORDER BY m.NombreMateria", (id_estudiante,))
            return cur.fetchall()

    def matricula(self, id_estudiante, id_matricula):
        """Detalle completo de UNA matrícula del estudiante (el comprobante de inscripción)."""
        with mysql_cursor() as (_, cur):
            cur.execute(self.CONSULTA_MATRICULA + " WHERE mt.IdMatricula = %s AND mt.IdEstudiante = %s",
                        (id_matricula, id_estudiante))
            return cur.fetchone()

    def retirar(self, id_estudiante, id_matricula):
        """DELETE de la matrícula, solo si es del estudiante y aún no tiene nota ni cierre.
        Retorna el IdGrupo liberado, o lanza ValidacionError explicando por qué no se puede."""
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT IdGrupo, NotaFinal, EstadoCurso FROM Matricula WHERE IdMatricula = %s AND IdEstudiante = %s FOR UPDATE",
                        (id_matricula, id_estudiante))
            fila = cur.fetchone()
            if not fila:
                raise ValidacionError("Esa matrícula no existe o no es tuya")
            if fila["NotaFinal"] is not None or (fila["EstadoCurso"] or "Sin evaluar") != "Sin evaluar":
                raise ValidacionError("No puedes retirar una materia que ya tiene nota o está cerrada")
            cur.execute("DELETE FROM Matricula WHERE IdMatricula = %s AND IdEstudiante = %s", (id_matricula, id_estudiante))
            return fila["IdGrupo"]

    def alternativas(self, id_estudiante, id_matricula):
        """Otros cursos (grupos) de la misma materia a los que el estudiante podría cambiarse."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT g2.IdGrupo, g2.Periodo, g2.Horario, g2.Cupo,
                       CONCAT_WS(' ', pr.PrimerNombreProfesor, pr.PrimerApellidoProfesor) AS Profesor,
                       (SELECT COUNT(*) FROM Matricula x WHERE x.IdGrupo = g2.IdGrupo) AS Inscritos
                FROM Matricula mt
                JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
                JOIN Grupo g2 ON g2.IdMateria = g.IdMateria AND g2.IdGrupo <> g.IdGrupo
                LEFT JOIN Profesor pr ON pr.IdProfesor = g2.IdProfesor
                WHERE mt.IdMatricula = %s AND mt.IdEstudiante = %s
                ORDER BY g2.IdGrupo
            """, (id_matricula, id_estudiante))
            return cur.fetchall()

    def cambiar_grupo(self, id_estudiante, id_matricula, id_grupo_nuevo):
        """UPDATE de la matrícula a otro curso de la MISMA materia, validando cupo en una
        transacción (FOR UPDATE bloquea el curso mientras se cuenta). Retorna (grupo_anterior, grupo_nuevo)."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT mt.IdGrupo, mt.NotaFinal, g.IdMateria FROM Matricula mt JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
                WHERE mt.IdMatricula = %s AND mt.IdEstudiante = %s FOR UPDATE
            """, (id_matricula, id_estudiante))
            actual = cur.fetchone()
            if not actual:
                raise ValidacionError("Esa matrícula no existe o no es tuya")
            if actual["NotaFinal"] is not None:
                raise ValidacionError("No puedes cambiar de curso una materia que ya tiene nota")
            cur.execute("SELECT IdMateria, Cupo FROM Grupo WHERE IdGrupo = %s FOR UPDATE", (id_grupo_nuevo,))
            destino = cur.fetchone()
            if not destino or destino["IdMateria"] != actual["IdMateria"] or id_grupo_nuevo == actual["IdGrupo"]:
                raise ValidacionError("Solo puedes cambiarte a otro curso de la misma materia")
            cur.execute("SELECT COUNT(*) AS n FROM Matricula WHERE IdGrupo = %s", (id_grupo_nuevo,))
            if destino["Cupo"] is not None and cur.fetchone()["n"] >= destino["Cupo"]:
                raise ValidacionError("El curso elegido ya no tiene cupo")
            cur.execute("UPDATE Matricula SET IdGrupo = %s, FechaMatricula = CURDATE() WHERE IdMatricula = %s AND IdEstudiante = %s",
                        (id_grupo_nuevo, id_matricula, id_estudiante))
            return actual["IdGrupo"], id_grupo_nuevo

    def grupos_disponibles(self, id_estudiante):
        """Grupos en los que el estudiante aún no está matriculado."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT g.IdGrupo, m.IdMateria, m.NombreMateria, m.CreditosMateria, p.IdPrograma, p.NombrePrograma,
                       g.Periodo, g.Horario, g.Cupo, g.IdProfesor,
                       (200000 + m.CreditosMateria * 250000) AS ValorEstimado,
                       CONCAT_WS(' ', pr.PrimerNombreProfesor, pr.PrimerApellidoProfesor) AS Profesor,
                       (SELECT COUNT(*) FROM Matricula x WHERE x.IdGrupo = g.IdGrupo) AS Inscritos
                FROM Grupo g
                JOIN Materia m ON m.IdMateria = g.IdMateria
                JOIN Programa p ON p.IdPrograma = m.IdPrograma
                LEFT JOIN Profesor pr ON pr.IdProfesor = g.IdProfesor
                WHERE g.IdGrupo NOT IN (SELECT IdGrupo FROM Matricula WHERE IdEstudiante = %s)
                ORDER BY m.NombreMateria, g.IdGrupo
            """, (id_estudiante,))
            return cur.fetchall()

    def actualizar_contacto(self, id_estudiante, telefono, direccion):
        datos = {}
        if telefono is not None:
            datos["Telefono"] = telefono
        if direccion is not None:
            datos["Direccion"] = direccion
        return self.actualizar(id_estudiante, datos)


# ------------------------------------------------------------------ profesores
class ProfesorDAO:
    def listar(self):
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT p.IdProfesor, CONCAT_WS(' ', p.PrimerNombreProfesor, p.PrimerApellidoProfesor) AS Nombre,
                       p.CorreoProfesor, p.Especialidad, COUNT(g.IdGrupo) AS Cursos,
                       (SELECT COUNT(*) FROM Usuario u WHERE u.IdProfesor = p.IdProfesor) AS TieneCuenta
                FROM Profesor p LEFT JOIN Grupo g ON g.IdProfesor = p.IdProfesor
                GROUP BY p.IdProfesor ORDER BY p.PrimerApellidoProfesor
            """)
            return cur.fetchall()

    def crear(self, id_profesor, datos):
        nombre = texto(datos.get("PrimerNombreProfesor"), "Primer nombre", 50)
        apellido = texto(datos.get("PrimerApellidoProfesor"), "Primer apellido", 50)
        correo = correo_valido(datos.get("CorreoProfesor"))
        especialidad = texto(datos.get("Especialidad"), "Especialidad", 60, obligatorio=False)
        with mysql_cursor() as (_, cur):
            cur.execute("INSERT INTO Profesor (IdProfesor, PrimerNombreProfesor, PrimerApellidoProfesor, CorreoProfesor, Especialidad) "
                        "VALUES (%s, %s, %s, %s, %s)", (id_profesor, nombre, apellido, correo, especialidad))

    def eliminar(self, id_profesor):
        with mysql_cursor() as (_, cur):
            cur.execute("DELETE FROM Profesor WHERE IdProfesor = %s", (id_profesor,))
            return cur.rowcount == 1

    def cursos(self, id_profesor):
        """Grupos del profesor con estadísticas de sus estudiantes."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT g.IdGrupo, m.NombreMateria, m.CreditosMateria, p.NombrePrograma, g.Periodo, g.Horario, g.Cupo,
                       COUNT(mt.IdMatricula) AS Inscritos,
                       ROUND(AVG(mt.NotaFinal), 2) AS Promedio,
                       SUM(mt.NotaFinal >= 3.0) AS Aprobados,
                       SUM(mt.NotaFinal < 3.0) AS Reprobados,
                       SUM(mt.IdMatricula IS NOT NULL AND mt.NotaFinal IS NULL) AS Pendientes
                FROM Grupo g
                JOIN Materia m ON m.IdMateria = g.IdMateria
                JOIN Programa p ON p.IdPrograma = m.IdPrograma
                LEFT JOIN Matricula mt ON mt.IdGrupo = g.IdGrupo
                WHERE g.IdProfesor = %s
                GROUP BY g.IdGrupo ORDER BY m.NombreMateria
            """, (id_profesor,))
            return cur.fetchall()

    def lista_curso(self, id_profesor, id_grupo):
        """Estudiantes de un curso; vacío si el curso no es de ese profesor."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT mt.IdMatricula, e.IdEstudiante,
                       CONCAT_WS(' ', e.PrimerNombre, e.SegundoNombre, e.PrimerApellido, e.SegundoApellido) AS Nombre,
                       e.CorreoEstudiante, mt.NotaFinal, mt.EstadoCurso
                FROM Matricula mt
                JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
                JOIN Estudiante e ON e.IdEstudiante = mt.IdEstudiante
                WHERE mt.IdGrupo = %s AND g.IdProfesor = %s
                ORDER BY e.PrimerApellido, e.PrimerNombre
            """, (id_grupo, id_profesor))
            return cur.fetchall()

    def es_su_curso(self, id_profesor, id_grupo):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT 1 FROM Grupo WHERE IdGrupo = %s AND IdProfesor = %s", (id_grupo, id_profesor))
            return cur.fetchone() is not None

    def guardar_notas(self, id_profesor, id_grupo, notas):
        """Actualiza NotaFinal (0.00 a 5.00 o vacía). El JOIN con Grupo garantiza que el
        profesor solo califique matrículas de su propio curso. Retorna los estudiantes afectados."""
        if not isinstance(notas, list) or not 1 <= len(notas) <= 200:
            raise ValidacionError("No hay notas para guardar")
        limpias = []
        for n in notas:
            if not isinstance(n, dict):
                raise ValidacionError("Formato de notas inválido")
            id_mat = entero(n.get("idMatricula"), "Matrícula")
            valor = n.get("nota")
            if valor in (None, ""):
                nota = None
            else:
                try:
                    nota = round(float(valor), 2)
                except (TypeError, ValueError):
                    raise ValidacionError("Las notas deben ser números") from None
                if not 0 <= nota <= 5:
                    raise ValidacionError("Las notas van de 0.0 a 5.0")
            limpias.append((nota, id_mat))
        afectados = []
        with mysql_cursor() as (_, cur):
            for nota, id_mat in limpias:
                cur.execute("""
                    UPDATE Matricula mt JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
                    SET mt.NotaFinal = %s
                    WHERE mt.IdMatricula = %s AND mt.IdGrupo = %s AND g.IdProfesor = %s
                """, (nota, id_mat, id_grupo, id_profesor))
                if cur.rowcount:
                    cur.execute("SELECT IdEstudiante FROM Matricula WHERE IdMatricula = %s", (id_mat,))
                    afectados.append(cur.fetchone()["IdEstudiante"])
        return afectados


# ------------------------------------------------------------------ grupos (cursos)
class GrupoDAO:
    def listar(self):
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT g.IdGrupo, m.NombreMateria, g.Periodo, g.Horario, g.Cupo,
                       CONCAT_WS(' ', pr.PrimerNombreProfesor, pr.PrimerApellidoProfesor) AS Profesor,
                       (SELECT COUNT(*) FROM Matricula x WHERE x.IdGrupo = g.IdGrupo) AS Inscritos
                FROM Grupo g JOIN Materia m ON m.IdMateria = g.IdMateria
                LEFT JOIN Profesor pr ON pr.IdProfesor = g.IdProfesor
                ORDER BY g.IdGrupo
            """)
            return cur.fetchall()

    def materias(self):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT IdMateria, NombreMateria, CreditosMateria FROM Materia ORDER BY NombreMateria")
            return cur.fetchall()

    def crear(self, id_grupo, id_materia, id_profesor, periodo, horario, cupo):
        periodo = texto(periodo, "Periodo", 20)
        horario = texto(horario, "Horario", 40)
        with mysql_cursor() as (_, cur):
            cur.execute("INSERT INTO Grupo (IdGrupo, IdMateria, IdProfesor, Periodo, Horario, Cupo) VALUES (%s, %s, %s, %s, %s, %s)",
                        (id_grupo, id_materia, id_profesor, periodo, horario, cupo))

    def cambiar_cupo(self, id_grupo, cupo):
        with mysql_cursor() as (_, cur):
            cur.execute("UPDATE Grupo SET Cupo = %s WHERE IdGrupo = %s", (cupo, id_grupo))
            return cur.rowcount == 1

    def estudiantes(self, id_grupo):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT IdEstudiante FROM Matricula WHERE IdGrupo = %s", (id_grupo,))
            return [f["IdEstudiante"] for f in cur.fetchall()]


# ------------------------------------------------------------------ procedimientos almacenados (Actividad 3)
class ProcedimientosDAO:
    """callproc() envía los argumentos como parámetros; las posiciones OUT vuelven en la tupla."""

    MAXIMO_MATERIAS = 9  # por estudiante y por periodo

    def registrar_matricula(self, id_estudiante, id_grupo):
        """Valida el máximo de materias del periodo y llama a sp_registrar_matricula.
        El FOR UPDATE sobre el estudiante evita que dos inscripciones simultáneas pasen el límite."""
        with mysql_cursor(diccionario=False) as (_, cur):
            cur.execute("SELECT IdEstudiante FROM Estudiante WHERE IdEstudiante = %s FOR UPDATE", (id_estudiante,))
            cur.fetchall()
            cur.execute("""SELECT COUNT(*) FROM Matricula m JOIN Grupo g ON g.IdGrupo = m.IdGrupo
                           WHERE m.IdEstudiante = %s AND g.Periodo = (SELECT Periodo FROM Grupo WHERE IdGrupo = %s)""",
                        (id_estudiante, id_grupo))
            if cur.fetchone()[0] >= self.MAXIMO_MATERIAS:
                return f"Error: ya tienes {self.MAXIMO_MATERIAS} materias en este periodo (es el máximo permitido)"
            return cur.callproc("sp_registrar_matricula", [id_estudiante, id_grupo, ""])[2]

    def calcular_promedio(self, id_estudiante):
        with mysql_cursor(diccionario=False) as (_, cur):
            resultado = cur.callproc("sp_calcular_promedio", [id_estudiante, 0.0, ""])
            promedio = resultado[1]
            return (float(promedio) if promedio is not None else None), resultado[2]

    def actualizar_estado_curso(self, id_grupo):
        with mysql_cursor(diccionario=False) as (_, cur):
            return cur.callproc("sp_actualizar_estado_curso", [id_grupo, ""])[1]


# ------------------------------------------------------------------ periodos
def periodos():
    """Periodos académicos existentes (de los cursos), del más reciente al más antiguo."""
    with mysql_cursor() as (_, cur):
        cur.execute("SELECT DISTINCT Periodo FROM Grupo WHERE Periodo IS NOT NULL ORDER BY Periodo DESC")
        return [f["Periodo"] for f in cur.fetchall()]


# ------------------------------------------------------------------ pagos (pasarela simulada)
class PagoDAO:
    METODOS = ("PSE", "Tarjeta", "Efectivo")

    def estado_cuenta(self, id_estudiante, periodo):
        """Total de las matrículas del periodo, lo pagado y el saldo."""
        with mysql_cursor() as (_, cur):
            cur.execute("""
                SELECT COALESCE(SUM(mt.ValorMatricula), 0) AS Total, COUNT(*) AS Materias
                FROM Matricula mt JOIN Grupo g ON g.IdGrupo = mt.IdGrupo
                WHERE mt.IdEstudiante = %s AND g.Periodo = %s
            """, (id_estudiante, periodo))
            total = cur.fetchone()
            cur.execute("SELECT IdPago, Valor, Metodo, Banco, Referencia, Estado, Fecha FROM Pago "
                        "WHERE IdEstudiante = %s AND Periodo = %s ORDER BY Fecha DESC", (id_estudiante, periodo))
            pagos = cur.fetchall()
        pagado = sum(p["Valor"] for p in pagos if p["Estado"] == "Aprobado")
        return {"total": int(total["Total"]), "materias": total["Materias"], "pagado": pagado,
                "saldo": max(0, int(total["Total"]) - pagado), "pagos": pagos}

    def pagar(self, id_estudiante, periodo, valor, metodo, banco=None):
        """Registra un pago SIMULADO. La fila del estudiante se bloquea (FOR UPDATE) mientras se
        calcula el saldo, así dos pagos simultáneos no pueden superar lo que se debe."""
        import secrets
        from datetime import datetime as _dt
        valor = entero(valor, "Valor", 1, 100_000_000)
        if metodo not in self.METODOS:
            raise ValidacionError("Método de pago inválido")
        banco = texto(banco, "Banco", 60, obligatorio=False)
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT IdEstudiante FROM Estudiante WHERE IdEstudiante = %s FOR UPDATE", (id_estudiante,))
            if not cur.fetchone():
                raise ValidacionError("Estudiante no encontrado")
            cur.execute("""SELECT COALESCE(SUM(mt.ValorMatricula), 0) AS Total FROM Matricula mt
                           JOIN Grupo g ON g.IdGrupo = mt.IdGrupo WHERE mt.IdEstudiante = %s AND g.Periodo = %s""",
                        (id_estudiante, periodo))
            total = int(cur.fetchone()["Total"])
            cur.execute("SELECT COALESCE(SUM(Valor), 0) AS Pagado FROM Pago WHERE IdEstudiante = %s AND Periodo = %s AND Estado = 'Aprobado'",
                        (id_estudiante, periodo))
            saldo = total - int(cur.fetchone()["Pagado"])
            if saldo <= 0:
                raise ValidacionError("No tienes saldo pendiente en este periodo")
            if valor > saldo:
                raise ValidacionError(f"El valor supera tu saldo pendiente ({saldo:,})".replace(",", "."))
            referencia = f"PG-{_dt.now():%Y%m%d}-{secrets.token_hex(3).upper()}"
            cur.execute("INSERT INTO Pago (IdEstudiante, Periodo, Valor, Metodo, Banco, Referencia) VALUES (%s, %s, %s, %s, %s, %s)",
                        (id_estudiante, periodo, valor, metodo, banco, referencia))
            cur.execute("SELECT IdPago, Valor, Metodo, Banco, Referencia, Estado, Fecha FROM Pago WHERE IdPago = %s", (cur.lastrowid,))
            return cur.fetchone()

    def todos(self, limite=30):
        with mysql_cursor() as (_, cur):
            cur.execute("""SELECT p.Referencia, p.Fecha, p.Periodo, p.Valor, p.Metodo, p.Estado,
                                  CONCAT_WS(' ', e.PrimerNombre, e.PrimerApellido) AS Estudiante
                           FROM Pago p JOIN Estudiante e ON e.IdEstudiante = p.IdEstudiante
                           ORDER BY p.Fecha DESC LIMIT %s""", (int(limite),))
            return cur.fetchall()


# ------------------------------------------------------------------ reservas de laboratorio
class ReservaDAO:
    LABORATORIOS = {
        "fisica": "Laboratorio de Física", "quimica": "Laboratorio de Química", "electronica": "Laboratorio de Electrónica",
        "computo": "Sala de Cómputo", "redes": "Laboratorio de Redes", "simulacion": "Centro de Simulación",
    }
    FRANJAS = ("07:00-09:00", "09:00-11:00", "11:00-13:00", "14:00-16:00", "16:00-18:00", "18:00-20:00")
    MAXIMO_ACTIVAS = 3

    def ocupacion(self, desde, hasta):
        with mysql_cursor() as (_, cur):
            cur.execute("""SELECT r.IdReserva, r.IdUsuario, r.Laboratorio, r.Fecha, r.Franja, r.Motivo, u.Nombre
                           FROM ReservaLaboratorio r JOIN Usuario u ON u.IdUsuario = r.IdUsuario
                           WHERE r.Fecha BETWEEN %s AND %s""", (desde, hasta))
            return cur.fetchall()

    def mias(self, id_usuario):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT IdReserva, Laboratorio, Fecha, Franja, Motivo FROM ReservaLaboratorio "
                        "WHERE IdUsuario = %s AND Fecha >= CURDATE() ORDER BY Fecha, Franja", (id_usuario,))
            return cur.fetchall()

    def reservar(self, id_usuario, laboratorio, fecha, franja, motivo):
        from datetime import date as _d, datetime as _dt, timedelta as _td
        if laboratorio not in self.LABORATORIOS:
            raise ValidacionError("Laboratorio inválido")
        if franja not in self.FRANJAS:
            raise ValidacionError("Franja inválida")
        motivo = texto(motivo, "Motivo", 120)
        try:
            dia = _dt.strptime(str(fecha), "%Y-%m-%d").date()
        except ValueError:
            raise ValidacionError("Fecha inválida") from None
        hoy = _d.today()
        if not hoy <= dia <= hoy + _td(days=14):
            raise ValidacionError("Solo puedes reservar desde hoy y hasta 14 días adelante")
        if dia == hoy and _dt.now().strftime("%H:%M") >= franja[:5]:
            raise ValidacionError("Esa franja ya comenzó")
        if dia.isoweekday() == 7:
            raise ValidacionError("Los laboratorios no abren los domingos")
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT COUNT(*) AS n FROM ReservaLaboratorio WHERE IdUsuario = %s AND Fecha >= CURDATE()", (id_usuario,))
            if cur.fetchone()["n"] >= self.MAXIMO_ACTIVAS:
                raise ValidacionError(f"Puedes tener máximo {self.MAXIMO_ACTIVAS} reservas activas")
            try:
                cur.execute("INSERT INTO ReservaLaboratorio (IdUsuario, Laboratorio, Fecha, Franja, Motivo) VALUES (%s, %s, %s, %s, %s)",
                            (id_usuario, laboratorio, dia, franja, motivo))
            except Exception as err:  # 1062 = la restricción UNIQUE detectó que otra persona la reservó
                if getattr(err, "errno", None) == 1062:
                    raise ValidacionError("Alguien acaba de reservar esa franja. Elige otra.") from None
                raise
            return cur.lastrowid

    def cancelar(self, id_usuario, id_reserva):
        with mysql_cursor() as (_, cur):
            cur.execute("SELECT Laboratorio, Fecha, Franja FROM ReservaLaboratorio WHERE IdReserva = %s AND IdUsuario = %s AND Fecha >= CURDATE()",
                        (id_reserva, id_usuario))
            fila = cur.fetchone()
            if not fila:
                raise ValidacionError("Esa reserva no existe o ya pasó")
            cur.execute("DELETE FROM ReservaLaboratorio WHERE IdReserva = %s AND IdUsuario = %s", (id_reserva, id_usuario))
            return fila
