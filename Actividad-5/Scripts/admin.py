"""
Actividad 5 - Campus · Consola de administración (terminal).

  python admin.py

El administrador solo trabaja por aquí (la web no le permite entrar). Desde la consola:
  - Estudiantes y profesores: listar, ver, crear, editar y eliminar (MySQL, consultas parametrizadas).
  - Cursos: crear, cambiar cupo, matricular (sp_registrar_matricula), cerrar (sp_actualizar_estado_curso).
  - Cuentas de la web: crear, activar/desactivar, restablecer contraseña, eliminar.
  - Bitácora (MongoDB): últimos eventos con filtros, resumen agregado y vista en vivo.

Cada cambio se registra en la bitácora de MongoDB; la web la vigila, así que la persona
afectada recibe una notificación en vivo en su navegador.
"""
import sys
import time
from datetime import timezone

from mysql.connector import Error as ErrorMySQL
from pymongo.errors import PyMongoError
from rich import box
from rich.align import Align
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.prompt import Confirm, IntPrompt, Prompt
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

import config
from dao_mongo import ACCIONES, TODOS, BitacoraDAO, PublicacionDAO, ReconocimientoDAO, actor
from dao_mysql import (EstudianteDAO, GrupoDAO, PagoDAO, ProcedimientosDAO, ProfesorDAO, UsuarioDAO, ValidacionError,
                       entero)

consola = Console(theme=Theme({
    "titulo": "bold bright_white", "tenue": "grey50", "ok": "bold white", "error": "bold white on grey23",
    "aviso": "italic grey70", "clave": "bold bright_white", "borde": "grey42",
}), highlight=False)

usuarios, estudiantes, profesores = UsuarioDAO(), EstudianteDAO(), ProfesorDAO()
grupos, procedimientos, pagos = GrupoDAO(), ProcedimientosDAO(), PagoDAO()
bitacora = publicaciones = reconocimientos = None
admin = None  # usuario administrador con sesión iniciada


# ------------------------------------------------------------------ utilidades de pantalla
def encabezado(subtitulo=""):
    consola.clear()
    titulo = Text.assemble(("◐  CAMPUS", "titulo"), ("  ·  Consola de administración", "tenue"))
    lineas = [titulo]
    if admin:
        lineas.append(Text.assemble(("Sesión: ", "tenue"), (admin["Nombre"], "clave"), (f"  ({admin['Correo']})", "tenue")))
    if subtitulo:
        lineas.append(Text(subtitulo.upper(), style="tenue"))
    consola.print(Panel(Group(*lineas), box=box.ROUNDED, border_style="borde", padding=(0, 2)))


def ok(mensaje):
    consola.print(f"[ok]✓[/ok] {mensaje}")


def error(mensaje):
    consola.print(f"[error] ✕ [/error] {mensaje}")


def pausa():
    Prompt.ask("\n[tenue]Enter para continuar[/tenue]", default="", show_default=False)


def tabla(*columnas, titulo=None):
    t = Table(box=box.SIMPLE_HEAVY, header_style="bold", border_style="borde", title=titulo,
              title_style="tenue", title_justify="left", pad_edge=False)
    for c in columnas:
        if isinstance(c, tuple):
            t.add_column(c[0], justify=c[1])
        else:
            t.add_column(c)
    return t


def barra(valor, total, ancho=12):
    if total is None:  # cupo NULL = sin límite (así lo trata sp_registrar_matricula)
        return Text(f"{valor} {'inscrito' if valor == 1 else 'inscritos'} · sin límite", style="tenue")
    if not total:
        return Text("—", style="tenue")
    llenos = min(ancho, round(ancho * valor / total))
    return Text.assemble(("█" * llenos, "white"), ("░" * (ancho - llenos), "grey30"), (f" {valor}/{total}", "tenue"))


def nota_texto(nota):
    if nota is None:
        return Text("—", style="tenue")
    return Text(f"{float(nota):.2f}", style="bold" if nota >= 3 else "italic")


def menu(opciones, titulo="¿Qué quieres hacer?"):
    t = Table.grid(padding=(0, 2))
    for clave, texto in opciones:
        t.add_row(Text(f" {clave} ", style="reverse"), texto)
    consola.print(Panel(t, title=titulo, title_align="left", border_style="borde", box=box.ROUNDED, padding=(1, 2)))
    return Prompt.ask("[clave]Opción[/clave]", choices=[c for c, _ in opciones], show_choices=False)


def pedir_entero(etiqueta, minimo=1, maximo=2_147_483_647):
    while True:
        valor = IntPrompt.ask(etiqueta)
        if minimo <= valor <= maximo:
            return valor
        error(f"Debe estar entre {minimo} y {maximo}")


def registrar(accion, detalle=None, destinatarios=None):
    try:
        bitacora.registrar(accion, actor(admin, "terminal"), detalle, destinatarios)
    except PyMongoError as err:
        consola.print(f"[aviso]No se pudo registrar en la bitácora: {err}[/aviso]")


def ejecutar(funcion):
    """Muestra los errores de forma clara sin cerrar la consola."""
    try:
        funcion()
    except ValidacionError as err:
        error(str(err))
        pausa()
    except ErrorMySQL as err:
        if err.errno == 1451:
            error("No se puede eliminar: tiene registros asociados (matrículas, cursos o cuentas).")
        elif err.errno == 1062:
            error("Ya existe un registro con ese identificador.")
        elif err.errno == 1452:
            error("Alguno de los identificadores no existe (materia, profesor o estudiante).")
        else:
            error(f"MySQL: {err.msg}")
        pausa()
    except PyMongoError as err:
        error(f"MongoDB: {err}")
        pausa()
    except KeyboardInterrupt:
        consola.print("\n[tenue]Cancelado.[/tenue]")
        time.sleep(0.4)


# ------------------------------------------------------------------ acceso
def crear_primer_admin():
    encabezado("Primera ejecución")
    consola.print(Panel("No hay ningún administrador todavía.\nCrea la cuenta con la que vas a entrar a esta consola.",
                        border_style="borde", box=box.ROUNDED))
    nombre = Prompt.ask("Nombre completo")
    correo = Prompt.ask("Correo")
    while True:
        clave = Prompt.ask("Contraseña (mínimo 8 caracteres)", password=True)
        if clave == Prompt.ask("Repite la contraseña", password=True):
            break
        error("Las contraseñas no coinciden")
    usuarios.crear(nombre, correo, clave, "admin")
    ok("Administrador creado. Ahora inicia sesión.")
    time.sleep(1)


def iniciar_sesion():
    global admin
    for intento in range(3):
        encabezado("Inicio de sesión")
        correo = Prompt.ask("Correo")
        clave = Prompt.ask("Contraseña", password=True)
        with consola.status("Verificando…", spinner="dots"):
            u = usuarios.autenticar(correo, clave, roles=("admin",))
        if u:
            admin = u
            registrar("login")
            return True
        bitacora.registrar("login_fallido", actor(None, "terminal"), {"correo": correo[:120]})
        error(f"Credenciales inválidas o la cuenta no es de administrador ({2 - intento} intentos restantes)")
        time.sleep(1.2)
    return False


# ------------------------------------------------------------------ tablero
def tablero():
    encabezado("Tablero")
    ests, profs, gr, cuentas = estudiantes.listar(), profesores.listar(), grupos.listar(), usuarios.listar()
    matriculas = sum(g["Inscritos"] for g in gr)
    tarjetas = Table.grid(padding=(0, 3))
    for etiqueta, valor in (("Estudiantes", len(ests)), ("Profesores", len(profs)), ("Cursos", len(gr)),
                            ("Matrículas", matriculas), ("Cuentas web", sum(1 for u in cuentas if u["Rol"] != "admin"))):
        tarjetas.add_column(justify="center")
    tarjetas.add_row(*[Panel(Align.center(Text(str(v), style="titulo")), title=e, border_style="borde", width=17, box=box.ROUNDED)
                       for e, v in (("Estudiantes", len(ests)), ("Profesores", len(profs)), ("Cursos", len(gr)),
                                    ("Matrículas", matriculas), ("Cuentas web", sum(1 for u in cuentas if u["Rol"] != "admin")))])
    consola.print(tarjetas)
    t = tabla("Hace", "Quién", "Acción", "Detalle", titulo="Actividad reciente (MongoDB)")
    for e in bitacora.recientes(8):
        t.add_row(hace(e["fecha"]), quien_texto(e), ACCIONES.get(e["accion"], e["accion"]), detalle_texto(e))
    consola.print(t)
    pausa()


def hace(fecha):
    segundos = max(0, time.time() - fecha.replace(tzinfo=timezone.utc).timestamp())
    if segundos < 60:
        return f"{int(segundos)} s"
    if segundos < 3600:
        return f"{int(segundos // 60)} min"
    if segundos < 86400:
        return f"{int(segundos // 3600)} h"
    return f"{int(segundos // 86400)} d"


def quien_texto(e):
    a = e.get("actor", {})
    origen = "⌨" if a.get("origen") == "terminal" else "◎"
    return Text.assemble((f"{origen} ", "tenue"), a.get("nombre", "?"), (f" · {a.get('rol', '')}", "tenue"))


def detalle_texto(e):
    d = e.get("detalle") or {}
    partes = [f"{k}: {v}" for k, v in d.items() if k != "mensaje"]
    if "mensaje" in d:
        partes.append(str(d["mensaje"]))
    return Text(" · ".join(partes)[:70], style="tenue")


# ------------------------------------------------------------------ estudiantes
def menu_estudiantes():
    while True:
        encabezado("Estudiantes")
        listar_estudiantes()
        op = menu([("1", "Ver detalle y materias"), ("2", "Crear estudiante"), ("3", "Editar contacto"),
                   ("4", "Recalcular promedio (sp_calcular_promedio)"), ("5", "Eliminar estudiante"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar({"1": ver_estudiante, "2": crear_estudiante, "3": editar_estudiante,
                  "4": recalcular_promedio, "5": eliminar_estudiante}[op])


def listar_estudiantes():
    t = tabla("Documento", "Nombre", "Correo", ("Materias", "right"), ("Promedio", "right"), "Estado", "Cuenta web")
    for e in estudiantes.listar():
        t.add_row(str(e["IdEstudiante"]), e["Nombre"], Text(e["CorreoEstudiante"] or "", style="tenue"), str(e["Materias"]),
                  nota_texto(e["Promedio"]), e["EstadoAcademico"] or "—", "✓" if e["TieneCuenta"] else Text("—", style="tenue"))
    consola.print(t)


def ver_estudiante():
    id_est = pedir_entero("Documento del estudiante")
    e = estudiantes.obtener(id_est)
    if not e:
        error("No existe ese estudiante")
        return pausa()
    nombre = " ".join(x for x in (e["PrimerNombre"], e["SegundoNombre"], e["PrimerApellido"], e["SegundoApellido"]) if x)
    info = Table.grid(padding=(0, 2))
    for k, v in (("Documento", e["IdEstudiante"]), ("Correo", e["CorreoEstudiante"]),
                 ("Teléfono", f"{e['PrefijoTelefono'] or ''} {e['Telefono'] or ''}"), ("Dirección", e["Direccion"] or "—"),
                 ("Nacimiento", e["FechaNacimiento"]), ("Promedio", e.get("Promedio") or "—"), ("Estado", e.get("EstadoAcademico"))):
        info.add_row(Text(k, style="tenue"), str(v))
    consola.print(Panel(info, title=nombre, title_align="left", border_style="borde", box=box.ROUNDED))
    t = tabla("Curso", "Materia", "Profesor", "Horario", ("Nota", "right"), "Estado")
    for m in estudiantes.materias(id_est):
        t.add_row(str(m["IdGrupo"]), m["NombreMateria"], m["Profesor"] or "—", m["Horario"] or "—", nota_texto(m["NotaFinal"]), m["EstadoCurso"])
    consola.print(t)
    pausa()


def crear_estudiante():
    consola.print("[tenue]Deja vacío lo opcional. Ctrl+C cancela.[/tenue]")
    id_est = pedir_entero("Documento (número)")
    datos = {
        "PrimerNombre": Prompt.ask("Primer nombre"), "SegundoNombre": Prompt.ask("Segundo nombre", default=""),
        "PrimerApellido": Prompt.ask("Primer apellido"), "SegundoApellido": Prompt.ask("Segundo apellido", default=""),
        "CorreoEstudiante": Prompt.ask("Correo institucional"), "PrefijoTelefono": Prompt.ask("Prefijo", default="+57"),
        "Telefono": Prompt.ask("Teléfono"), "FechaNacimiento": Prompt.ask("Fecha de nacimiento (AAAA-MM-DD)"),
        "Direccion": Prompt.ask("Dirección", default=""),
    }
    estudiantes.crear(id_est, datos)
    registrar("estudiante_creado", {"estudiante": id_est})
    ok(f"Estudiante {id_est} creado. Puede activar su cuenta en la web con su documento y correo.")
    pausa()


def editar_estudiante():
    id_est = pedir_entero("Documento del estudiante")
    e = estudiantes.obtener(id_est)
    if not e:
        error("No existe ese estudiante")
        return pausa()
    consola.print("[tenue]Enter conserva el valor actual.[/tenue]")
    cambios = {}
    for campo, etiqueta in (("CorreoEstudiante", "Correo"), ("Telefono", "Teléfono"), ("Direccion", "Dirección")):
        nuevo = Prompt.ask(etiqueta, default=e[campo] or "")
        if nuevo != (e[campo] or ""):
            cambios[campo] = nuevo
    if not cambios:
        return consola.print("[tenue]Sin cambios.[/tenue]") or pausa()
    estudiantes.actualizar(id_est, cambios)
    registrar("estudiante_editado", {"estudiante": id_est, "campos": sorted(cambios)},
              usuarios.ids_de_estudiantes([id_est]))
    ok("Datos actualizados")
    pausa()


def recalcular_promedio():
    id_est = pedir_entero("Documento del estudiante")
    with consola.status("Ejecutando sp_calcular_promedio…"):
        promedio, clasificacion = procedimientos.calcular_promedio(id_est)
    if promedio is None and str(clasificacion).startswith("ERROR"):
        error(clasificacion)
    else:
        consola.print(Panel(Text.assemble(("Promedio  ", "tenue"), (f"{promedio:.2f}" if promedio is not None else "—", "titulo"),
                                          ("     Clasificación  ", "tenue"), (str(clasificacion), "titulo")),
                            title="Parámetros OUT", border_style="borde", box=box.ROUNDED))
        registrar("promedio", {"estudiante": id_est, "promedio": promedio, "clasificacion": clasificacion},
                  usuarios.ids_de_estudiantes([id_est]))
    pausa()


def eliminar_estudiante():
    id_est = pedir_entero("Documento del estudiante a eliminar")
    if not Confirm.ask(f"¿Eliminar al estudiante {id_est}? (también su cuenta web)", default=False):
        return
    if estudiantes.eliminar(id_est):
        registrar("estudiante_eliminado", {"estudiante": id_est})
        ok("Estudiante eliminado")
    else:
        error("No existe ese estudiante")
    pausa()


# ------------------------------------------------------------------ profesores
def menu_profesores():
    while True:
        encabezado("Profesores")
        t = tabla("Código", "Nombre", "Correo", "Especialidad", ("Cursos", "right"), "Cuenta web")
        for p in profesores.listar():
            t.add_row(str(p["IdProfesor"]), p["Nombre"], Text(p["CorreoProfesor"] or "", style="tenue"),
                      (p["Especialidad"] or "—")[:34], str(p["Cursos"]), "✓" if p["TieneCuenta"] else Text("—", style="tenue"))
        consola.print(t)
        op = menu([("1", "Crear profesor"), ("2", "Eliminar profesor"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar(crear_profesor if op == "1" else eliminar_profesor)


def crear_profesor():
    id_prof = pedir_entero("Código del profesor")
    profesores.crear(id_prof, {"PrimerNombreProfesor": Prompt.ask("Primer nombre"),
                               "PrimerApellidoProfesor": Prompt.ask("Primer apellido"),
                               "CorreoProfesor": Prompt.ask("Correo institucional"),
                               "Especialidad": Prompt.ask("Especialidad", default="")})
    registrar("profesor_creado", {"profesor": id_prof})
    ok("Profesor creado")
    pausa()


def eliminar_profesor():
    id_prof = pedir_entero("Código del profesor a eliminar")
    if Confirm.ask(f"¿Eliminar al profesor {id_prof}?", default=False):
        if profesores.eliminar(id_prof):
            registrar("profesor_eliminado", {"profesor": id_prof})
            ok("Profesor eliminado")
        else:
            error("No existe ese profesor")
        pausa()


# ------------------------------------------------------------------ cursos y matrículas
def menu_cursos():
    while True:
        encabezado("Cursos y matrículas")
        t = tabla(("Curso", "right"), "Materia", "Profesor", "Periodo", "Horario", "Ocupación")
        for g in grupos.listar():
            t.add_row(str(g["IdGrupo"]), g["NombreMateria"], g["Profesor"] or "—", g["Periodo"] or "—", g["Horario"] or "—",
                      barra(g["Inscritos"], g["Cupo"]))
        consola.print(t)
        op = menu([("1", "Matricular estudiante (sp_registrar_matricula)"), ("2", "Cerrar curso (sp_actualizar_estado_curso)"),
                   ("3", "Crear curso"), ("4", "Cambiar cupo"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar({"1": matricular, "2": cerrar_curso, "3": crear_curso, "4": cambiar_cupo}[op])


def matricular():
    id_est = pedir_entero("Documento del estudiante")
    id_grupo = pedir_entero("Curso")
    with consola.status("Ejecutando sp_registrar_matricula…"):
        mensaje = procedimientos.registrar_matricula(id_est, id_grupo)
    if str(mensaje).startswith("EXITO"):
        ok(mensaje)
        registrar("matricula", {"grupo": id_grupo, "estudiante": id_est, "mensaje": mensaje},
                  usuarios.ids_de_estudiantes([id_est]) + [TODOS])
    else:
        error(mensaje)
    pausa()


def cerrar_curso():
    id_grupo = pedir_entero("Curso a cerrar")
    if not Confirm.ask("Se calcula Aprobado/Reprobado/Pendiente para cada matrícula. ¿Continuar?", default=True):
        return
    with consola.status("Ejecutando sp_actualizar_estado_curso…"):
        mensaje = procedimientos.actualizar_estado_curso(id_grupo)
    if str(mensaje).startswith("EXITO"):
        ok(mensaje)
        registrar("curso_cerrado", {"grupo": id_grupo, "mensaje": mensaje},
                  usuarios.ids_de_estudiantes(grupos.estudiantes(id_grupo)))
    else:
        error(mensaje)
    pausa()


def crear_curso():
    t = tabla(("Id", "right"), "Materia", ("Créditos", "right"), titulo="Materias")
    for m in grupos.materias():
        t.add_row(str(m["IdMateria"]), m["NombreMateria"], str(m["CreditosMateria"]))
    consola.print(t)
    id_grupo = pedir_entero("Número del nuevo curso")
    id_materia = pedir_entero("Id de la materia")
    id_prof = pedir_entero("Código del profesor")
    periodo = Prompt.ask("Periodo", default="2026-1")
    horario = Prompt.ask("Horario (ej. Lun-Mie 7:00-9:00)")
    cupo = pedir_entero("Cupo", 1, 500)
    grupos.crear(id_grupo, id_materia, id_prof, periodo, horario, cupo)
    registrar("grupo_creado", {"grupo": id_grupo, "materia": id_materia}, [TODOS])
    ok(f"Curso {id_grupo} creado: ya aparece en la oferta de la web")
    pausa()


def cambiar_cupo():
    id_grupo = pedir_entero("Curso")
    cupo = pedir_entero("Nuevo cupo", 1, 500)
    if grupos.cambiar_cupo(id_grupo, cupo):
        registrar("cupo", {"grupo": id_grupo, "cupo": cupo}, [TODOS])
        ok("Cupo actualizado (la web lo muestra en vivo)")
    else:
        error("No existe ese curso o el cupo es el mismo")
    pausa()


# ------------------------------------------------------------------ cuentas de la web
def menu_cuentas():
    while True:
        encabezado("Cuentas de la plataforma")
        t = tabla(("Id", "right"), "Nombre", "Correo", "Rol", "Enlace", "Estado", "Último acceso")
        for u in usuarios.listar():
            enlace = u["IdEstudiante"] or u["IdProfesor"] or "—"
            t.add_row(str(u["IdUsuario"]), u["Nombre"], Text(u["Correo"], style="tenue"), u["Rol"], str(enlace),
                      "activa" if u["Activo"] else Text("inactiva", style="italic"),
                      Text(str(u["UltimoAcceso"] or "nunca"), style="tenue"))
        consola.print(t)
        op = menu([("1", "Crear cuenta"), ("2", "Activar / desactivar"), ("3", "Restablecer contraseña"),
                   ("4", "Eliminar cuenta"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar({"1": crear_cuenta, "2": alternar_cuenta, "3": restablecer_clave, "4": eliminar_cuenta}[op])


def crear_cuenta():
    rol = Prompt.ask("Rol", choices=["estudiante", "profesor", "general", "admin"], default="estudiante")
    id_est = id_prof = None
    if rol == "estudiante":
        id_est = pedir_entero("Documento del estudiante")
        e = estudiantes.obtener(id_est)
        if not e:
            raise ValidacionError("No existe ese estudiante")
        nombre, correo = f"{e['PrimerNombre']} {e['PrimerApellido']}", e["CorreoEstudiante"]
    elif rol == "profesor":
        id_prof = pedir_entero("Código del profesor")
        p = next((x for x in profesores.listar() if x["IdProfesor"] == id_prof), None)
        if not p:
            raise ValidacionError("No existe ese profesor")
        nombre, correo = p["Nombre"], p["CorreoProfesor"]
    else:
        nombre, correo = Prompt.ask("Nombre"), Prompt.ask("Correo")
    clave = Prompt.ask("Contraseña inicial (mínimo 8)", password=True)
    nuevo = usuarios.crear(nombre, correo, clave, rol, id_est, id_prof)
    registrar("usuario_creado", {"usuario": nuevo, "rol": rol})
    ok(f"Cuenta {nuevo} creada para {nombre} <{correo}>")
    pausa()


def alternar_cuenta():
    id_u = pedir_entero("Id de la cuenta")
    activa = Confirm.ask("¿Dejarla activa? (No = desactivar: no podrá iniciar sesión)", default=False)
    if usuarios.cambiar_estado(id_u, activa):
        registrar("usuario_estado", {"usuario": id_u, "activa": activa}, [id_u])
        ok("Cuenta " + ("activada" if activa else "desactivada: se cerrará su sesión en la web"))
    else:
        error("No existe esa cuenta o ya estaba así")
    pausa()


def restablecer_clave():
    id_u = pedir_entero("Id de la cuenta")
    clave = Prompt.ask("Nueva contraseña (mínimo 8)", password=True)
    if usuarios.cambiar_clave(id_u, clave):
        registrar("usuario_clave", {"usuario": id_u}, [id_u])
        ok("Contraseña restablecida")
    else:
        error("No existe esa cuenta")
    pausa()


def eliminar_cuenta():
    id_u = pedir_entero("Id de la cuenta a eliminar")
    if Confirm.ask("¿Eliminar la cuenta? (los datos académicos no se borran)", default=False):
        if usuarios.eliminar(id_u):
            registrar("usuario_eliminado", {"usuario": id_u})
            ok("Cuenta eliminada")
        else:
            error("No existe o es una cuenta de administrador")
        pausa()


# ------------------------------------------------------------------ bitácora (MongoDB)
def menu_bitacora():
    while True:
        encabezado("Bitácora · MongoDB")
        op = menu([("1", "Últimos eventos"), ("2", "Filtrar por rol, acción o nombre"),
                   ("3", "Resumen de los últimos 7 días (agregación)"), ("4", "Ver en vivo"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar({"1": lambda: ver_eventos(), "2": filtrar_eventos, "3": resumen_bitacora, "4": bitacora_en_vivo}[op])


def tabla_eventos(eventos, titulo=None):
    t = tabla("Hace", "Origen · Quién", "Acción", "Detalle", titulo=titulo)
    for e in eventos:
        t.add_row(hace(e["fecha"]), quien_texto(e), ACCIONES.get(e["accion"], e["accion"]), detalle_texto(e))
    return t


def ver_eventos(**filtro):
    consola.print(tabla_eventos(bitacora.recientes(25, **filtro)))
    consola.print("[tenue]⌨ terminal   ◎ web[/tenue]")
    pausa()


def filtrar_eventos():
    rol = Prompt.ask("Rol", choices=["", "estudiante", "profesor", "general", "admin", "visitante"], default="")
    accion = Prompt.ask("Acción", choices=[""] + sorted(ACCIONES), default="", show_choices=False)
    texto = Prompt.ask("Nombre contiene", default="")
    ver_eventos(rol=rol or None, accion=accion or None, texto=texto or None)


def resumen_bitacora():
    t = tabla("Acción", ("Veces", "right"), "", "Última vez", titulo="Últimos 7 días")
    filas = bitacora.resumen(7)
    maximo = max((f["total"] for f in filas), default=1)
    for f in filas:
        t.add_row(ACCIONES.get(f["_id"], f["_id"]), str(f["total"]), barra(f["total"], maximo, 18), hace(f["ultima"]))
    consola.print(t)
    pausa()


def bitacora_en_vivo():
    consola.print("[tenue]Mostrando eventos en vivo. Ctrl+C para volver.[/tenue]")
    try:
        with Live(tabla_eventos(bitacora.recientes(15), "En vivo"), console=consola, refresh_per_second=2) as vivo:
            while True:
                time.sleep(1)
                vivo.update(tabla_eventos(bitacora.recientes(15), f"En vivo · {time.strftime('%H:%M:%S')}"))
    except KeyboardInterrupt:
        pass


# ------------------------------------------------------------------ publicaciones (inicio de la web)
def menu_publicaciones():
    while True:
        encabezado("Publicaciones · se muestran en el inicio de la web")
        lista = publicaciones.listar(30)
        t = tabla(("#", "right"), "Fecha", "Categoría", "Título", "")
        for i, p in enumerate(lista, 1):
            t.add_row(str(i), p["fecha"].replace(tzinfo=timezone.utc).astimezone().strftime("%d/%m %H:%M"), p["categoria"],
                      p["titulo"], "★ destacada" if p.get("destacada") else "")
        consola.print(t)
        op = menu([("1", "Publicar"), ("2", "Eliminar"), ("0", "Volver")])
        if op == "0":
            return
        ejecutar(lambda: crear_publicacion() if op == "1" else eliminar_publicacion(lista))


def crear_publicacion():
    titulo = Prompt.ask("Título")
    cuerpo = Prompt.ask("Texto")
    categoria = Prompt.ask("Categoría", choices=list(PublicacionDAO.CATEGORIAS), default="Comunicado")
    destacada = Confirm.ask("¿Destacada (arriba de todo)?", default=False)
    doc = publicaciones.crear(titulo, cuerpo, categoria, "Administración", destacada)
    registrar("publicacion", {"titulo": doc["titulo"], "categoria": categoria}, [TODOS])
    ok("Publicada. Aparece al instante en el inicio de todos los usuarios conectados.")
    pausa()


def eliminar_publicacion(lista):
    if not lista:
        error("No hay publicaciones")
        return pausa()
    p = lista[pedir_entero("Número de la publicación", 1, len(lista)) - 1]
    if Confirm.ask(f"¿Eliminar «{p['titulo']}»?", default=False) and publicaciones.eliminar(str(p["_id"])):
        registrar("publicacion", {"titulo": p["titulo"], "eliminada": True}, [TODOS])
        ok("Publicación eliminada.")
    pausa()


# ------------------------------------------------------------------ reconocimiento docente y pagos
def ver_reconocimiento():
    encabezado("Reconocimiento docente · agregación en MongoDB")
    nombres = {p["IdProfesor"]: p["Nombre"] for p in profesores.listar()}
    t = tabla(("#", "right"), "Profesor", ("Evaluaciones", "right"), "Promedio (1 a 5)")
    for i, f in enumerate(reconocimientos.ranking(), 1):
        t.add_row(str(i), nombres.get(f["_id"], f"Profesor {f['_id']}"), str(f["n"]), barra(round(f["promedio"], 2), 5, 15))
    consola.print(t if t.row_count else "[tenue]Aún no hay evaluaciones de los estudiantes.[/tenue]")
    pausa()


def ver_pagos():
    encabezado("Pagos en línea (simulados) · MySQL")
    t = tabla("Referencia", "Fecha", "Estudiante", "Periodo", "Método", ("Valor", "right"), "Estado")
    for p in pagos.todos(40):
        t.add_row(p["Referencia"], p["Fecha"].strftime("%d/%m/%Y %H:%M"), p["Estudiante"], p["Periodo"], p["Metodo"],
                  f"$ {p['Valor']:,.0f}".replace(",", "."), p["Estado"])
    consola.print(t if t.row_count else "[tenue]Todavía no se ha registrado ningún pago.[/tenue]")
    pausa()


# ------------------------------------------------------------------ principal
def principal():
    global bitacora, publicaciones, reconocimientos
    encabezado()
    with consola.status("Conectando con MySQL y MongoDB…", spinner="dots"):
        try:
            config.asegurar_esquema()
            bd = config.mongo_bd()
            bitacora, publicaciones, reconocimientos = BitacoraDAO(bd), PublicacionDAO(bd), ReconocimientoDAO(bd)
        except ErrorMySQL as err:
            error(f"MySQL: {err.msg}\n   Revise DB_USER / DB_PASSWORD en el .env y que MariaDB esté iniciado.")
            sys.exit(1)
        except (PyMongoError, RuntimeError) as err:
            error(f"MongoDB: {err}\n   Revise MONGO_URI en el .env y que MongoDB esté iniciado.")
            sys.exit(1)
    if not usuarios.hay_admin():
        ejecutar(crear_primer_admin)
    if not iniciar_sesion():
        error("Demasiados intentos. Hasta luego.")
        sys.exit(1)
    while True:
        encabezado()
        op = menu([("1", "Tablero"), ("2", "Estudiantes"), ("3", "Profesores"), ("4", "Cursos y matrículas"),
                   ("5", "Cuentas de la web"), ("6", "Bitácora (MongoDB)"), ("7", "Publicaciones del inicio"),
                   ("8", "Reconocimiento docente"), ("9", "Pagos en línea"), ("0", "Salir")], "Menú principal")
        if op == "0":
            registrar("logout")
            consola.print("[tenue]Sesión cerrada.[/tenue]")
            return
        ejecutar({"1": tablero, "2": menu_estudiantes, "3": menu_profesores, "4": menu_cursos,
                  "5": menu_cuentas, "6": menu_bitacora, "7": menu_publicaciones, "8": ver_reconocimiento,
                  "9": ver_pagos}[op])


if __name__ == "__main__":
    try:
        principal()
    except (KeyboardInterrupt, EOFError):
        consola.print("\n[tenue]Hasta luego.[/tenue]")
