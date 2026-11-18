"""
Actividad 5 - Rutas de las secciones del portal (además de las de app.py).

  Académico (MySQL):   periodos, horario, horarios ideales, registro académico e históricos,
                       orden de matrícula, pagos en línea (simulados), contrato.
  Comunidad (MongoDB): publicaciones, foros, aula virtual, reconocimiento docente.
  Servicios:           laboratorios (MySQL, sin dobles reservas), monitorías de ciencias
                       básicas y bases de datos en línea (MongoDB), certificados verificables.

Todas las consultas usan parámetros; cada ruta revisa el rol y que la persona pertenezca
al curso que pide. Cada acción queda en la bitácora (MongoDB) y se notifica en vivo.
"""
from datetime import date, datetime, timedelta

from flask import g, jsonify, request

import horarios
from dao_mongo import (TODOS, AulaDAO, CertificadoDAO, ContratoDAO, ForoDAO, MonitoriaDAO, PublicacionDAO,
                       ReconocimientoDAO, RecursoDAO, a_json as mongo_json)
from dao_mysql import PagoDAO, ProcedimientosDAO, ReservaDAO, ValidacionError, a_json, entero, periodos


def registrar_rutas(app, ctx):
    """ctx: requiere, registrar, datos, usuarios, estudiantes, profesores, mongo."""
    requiere, registrar, datos = ctx.requiere, ctx.registrar, ctx.datos
    usuarios, estudiantes, profesores = ctx.usuarios, ctx.estudiantes, ctx.profesores
    publicaciones, foros, aula = PublicacionDAO(ctx.mongo), ForoDAO(ctx.mongo), AulaDAO(ctx.mongo)
    reconocimientos, monitorias = ReconocimientoDAO(ctx.mongo), MonitoriaDAO(ctx.mongo)
    recursos, certificados, contratos = RecursoDAO(ctx.mongo), CertificadoDAO(ctx.mongo), ContratoDAO(ctx.mongo)
    pagos, reservas = PagoDAO(), ReservaDAO()

    # ---------------------------------------------------------------- utilidades
    def periodo_pedido():
        lista = periodos()
        p = request.args.get("periodo") or (datos_opcionales().get("periodo") if request.is_json else None)
        return p if p in lista else (lista[0] if lista else "")

    def datos_opcionales():
        cuerpo = request.get_json(silent=True)
        return cuerpo if isinstance(cuerpo, dict) else {}

    def con_bloques(filas):
        salida = []
        for f in filas:
            x = a_json(f)
            x["Bloques"] = horarios.bloques(x.get("Horario"))
            salida.append(x)
        return salida

    def mis_cursos():
        """[(IdGrupo, NombreMateria)] de la persona con sesión (estudiante o profesor)."""
        u = g.usuario
        if u["Rol"] == "estudiante":
            return [(m["IdGrupo"], m["NombreMateria"]) for m in estudiantes.materias(u["IdEstudiante"])]
        if u["Rol"] == "profesor":
            return [(c["IdGrupo"], c["NombreMateria"]) for c in profesores.cursos(u["IdProfesor"])]
        return []

    def autor():
        return {"id": g.usuario["IdUsuario"], "nombre": g.usuario["Nombre"], "rol": g.usuario["Rol"]}

    def estudiante_datos():
        e = a_json(estudiantes.obtener(g.usuario["IdEstudiante"]))
        e["NombreCompleto"] = " ".join(x for x in (e["PrimerNombre"], e.get("SegundoNombre"), e["PrimerApellido"], e.get("SegundoApellido")) if x)
        return e

    def registro_academico():
        materias = [a_json(m) for m in estudiantes.materias(g.usuario["IdEstudiante"])]
        calificadas = [m for m in materias if m["NotaFinal"] is not None]
        creditos_cal = sum(m["CreditosMateria"] for m in calificadas)
        ponderado = round(sum(m["NotaFinal"] * m["CreditosMateria"] for m in calificadas) / creditos_cal, 2) if creditos_cal else None
        por_periodo = {}
        for m in materias:
            p = por_periodo.setdefault(m["Periodo"] or "Sin periodo", {"periodo": m["Periodo"] or "Sin periodo", "materias": [], "creditos": 0})
            p["materias"].append(m)
            p["creditos"] += m["CreditosMateria"]
        for p in por_periodo.values():
            cal = [m for m in p["materias"] if m["NotaFinal"] is not None]
            cr = sum(m["CreditosMateria"] for m in cal)
            p["promedio"] = round(sum(m["NotaFinal"] * m["CreditosMateria"] for m in cal) / cr, 2) if cr else None
        return {
            "estudiante": estudiante_datos(), "materias": materias,
            "programas": sorted({m["NombrePrograma"] for m in materias}),
            "resumen": {"promedioPonderado": ponderado, "creditosCursados": sum(m["CreditosMateria"] for m in materias),
                        "creditosAprobados": sum(m["CreditosMateria"] for m in calificadas if m["NotaFinal"] >= 3),
                        "materiasAprobadas": sum(1 for m in calificadas if m["NotaFinal"] >= 3), "materiasTotal": len(materias)},
            "periodos": sorted(por_periodo.values(), key=lambda p: p["periodo"]),
        }

    # ---------------------------------------------------------------- generales
    @app.get("/api/periodos")
    def ver_periodos():
        lista = periodos()
        return jsonify(periodos=lista, actual=lista[0] if lista else None)

    @app.get("/api/publicaciones")
    def ver_publicaciones():
        return jsonify(publicaciones=mongo_json(publicaciones.listar()))

    @app.get("/api/recursos")
    def ver_recursos():
        return jsonify(recursos=mongo_json(recursos.listar()))

    @app.get("/api/verificar/<codigo>")
    def verificar_certificado(codigo):
        """Pública: cualquiera puede confirmar que un certificado es auténtico."""
        doc = certificados.obtener(codigo)
        if not doc:
            return jsonify(valido=False), 404
        d = doc["datos"]
        documento = str(d.get("documento", ""))
        return jsonify(valido=True, titulo=doc["titulo"], codigo=doc["codigo"], fecha=mongo_json(doc["fecha"]),
                       nombre=d.get("nombre"), documento=("•" * max(0, len(documento) - 4)) + documento[-4:],
                       programa=", ".join(d.get("programas", [])))

    # ---------------------------------------------------------------- horario y horarios ideales
    @app.get("/api/estudiante/horario")
    @requiere("estudiante")
    def horario_estudiante():
        periodo = periodo_pedido()
        materias = [m for m in con_bloques(estudiantes.materias(g.usuario["IdEstudiante"])) if m["Periodo"] == periodo]
        return jsonify(periodo=periodo, materias=materias)

    @app.get("/api/profesor/horario")
    @requiere("profesor")
    def horario_profesor():
        periodo = periodo_pedido()
        cursos = [c for c in con_bloques(profesores.cursos(g.usuario["IdProfesor"])) if c["Periodo"] == periodo]
        return jsonify(periodo=periodo, materias=cursos)

    @app.get("/api/estudiante/horarios-ideales")
    @requiere("estudiante")
    def horarios_ideales():
        id_est = g.usuario["IdEstudiante"]
        periodo = periodo_pedido()
        inscritas = [m for m in con_bloques(estudiantes.materias(id_est)) if m["Periodo"] == periodo]
        disponibles = [x for x in con_bloques(estudiantes.grupos_disponibles(id_est))
                       if x["Periodo"] == periodo and (x["Cupo"] is None or x["Inscritos"] < x["Cupo"])]
        # Se priorizan los cursos de los programas del estudiante (si ya tiene alguno)
        programas = {m.get("IdPrograma") for m in estudiantes.materias(id_est)} - {None}
        propios = [x for x in disponibles if x["IdPrograma"] in programas] if programas else disponibles
        libres = ProcedimientosDAO.MAXIMO_MATERIAS - len(inscritas)
        sugerencia, cruces = horarios.horario_ideal(inscritas, propios or disponibles, maximo=max(0, min(6, libres)))
        return jsonify(periodo=periodo, inscritas=inscritas, disponibles=disponibles, sugerencia=sugerencia,
                       maximo=ProcedimientosDAO.MAXIMO_MATERIAS, cruces={str(k): v for k, v in cruces.items()})

    # ---------------------------------------------------------------- registro académico, históricos y certificados
    @app.get("/api/estudiante/registro")
    @requiere("estudiante")
    def ver_registro():
        return jsonify(registro_academico())

    @app.post("/api/estudiante/certificados")
    @requiere("estudiante")
    def emitir_certificado():
        tipo = datos().get("tipo")
        r = registro_academico()
        e = r["estudiante"]
        periodo = periodos()[0] if periodos() else ""
        base = {"nombre": e["NombreCompleto"], "documento": e["IdEstudiante"], "programas": r["programas"], "periodo": periodo}
        if tipo == "notas":
            base["materias"] = [{k: m[k] for k in ("NombreMateria", "Periodo", "CreditosMateria", "NotaFinal", "EstadoCurso")} for m in r["materias"]]
            base["resumen"] = r["resumen"]
        else:
            actuales = [m for m in r["materias"] if m["Periodo"] == periodo]
            if not actuales:
                raise ValidacionError(f"No tienes materias inscritas en el periodo {periodo}")
            base["materias"] = [{k: m[k] for k in ("NombreMateria", "IdGrupo", "CreditosMateria", "Horario", "ValorMatricula")} for m in actuales]
            base["creditos"] = sum(m["CreditosMateria"] for m in actuales)
        doc = certificados.emitir(tipo, g.usuario["IdUsuario"], base)
        registrar("certificado", {"tipo": doc["titulo"], "codigo": doc["codigo"]}, [g.usuario["IdUsuario"]])
        return jsonify(certificado=mongo_json(doc)), 201

    @app.get("/api/estudiante/certificados")
    @requiere("estudiante")
    def mis_certificados():
        return jsonify(certificados=mongo_json(certificados.de_usuario(g.usuario["IdUsuario"])))

    @app.get("/api/estudiante/certificados/<codigo>")
    @requiere("estudiante")
    def ver_certificado(codigo):
        doc = certificados.obtener(codigo, g.usuario["IdUsuario"])
        if not doc:
            return jsonify(error="Ese certificado no existe"), 404
        return jsonify(certificado=mongo_json(doc))

    # ---------------------------------------------------------------- orden de matrícula, pagos y contrato
    def materias_periodo(periodo):
        return [a_json(m) for m in estudiantes.materias(g.usuario["IdEstudiante"]) if m["Periodo"] == periodo]

    @app.get("/api/estudiante/orden")
    @requiere("estudiante")
    def orden_matricula():
        periodo = periodo_pedido()
        materias = materias_periodo(periodo)
        cuenta = pagos.estado_cuenta(g.usuario["IdEstudiante"], periodo)
        fechas = [date.fromisoformat(m["FechaMatricula"][:10]) for m in materias if m.get("FechaMatricula")]
        limite = (max(fechas) if fechas else date.today()) + timedelta(days=15)
        return jsonify(periodo=periodo, estudiante=estudiante_datos(), materias=materias,
                       total=cuenta["total"], pagado=cuenta["pagado"], saldo=cuenta["saldo"],
                       referencia=f"OM-{periodo.replace('-', '')}-{g.usuario['IdEstudiante']}",
                       fechaLimite=limite.isoformat(), emitida=date.today().isoformat())

    @app.get("/api/estudiante/pagos")
    @requiere("estudiante")
    def estado_cuenta():
        periodo = periodo_pedido()
        cuenta = pagos.estado_cuenta(g.usuario["IdEstudiante"], periodo)
        cuenta["pagos"] = [a_json(p) for p in cuenta["pagos"]]
        return jsonify(periodo=periodo, **cuenta)

    @app.post("/api/estudiante/pagos")
    @requiere("estudiante")
    def pagar():
        d = datos()
        periodo = d.get("periodo") if d.get("periodo") in periodos() else None
        if not periodo:
            raise ValidacionError("Periodo inválido")
        pago = a_json(pagos.pagar(g.usuario["IdEstudiante"], periodo, d.get("valor"), d.get("metodo"), d.get("banco")))
        registrar("pago", {"referencia": pago["Referencia"], "valor": pago["Valor"], "periodo": periodo}, [g.usuario["IdUsuario"]])
        return jsonify(pago=pago, estudiante=estudiante_datos()), 201

    @app.get("/api/estudiante/contrato")
    @requiere("estudiante")
    def ver_contrato():
        periodo = periodo_pedido()
        materias = materias_periodo(periodo)
        firma = contratos.firma(g.usuario["IdUsuario"], periodo)
        return jsonify(periodo=periodo, estudiante=estudiante_datos(), materias=materias,
                       total=sum(m["ValorMatricula"] or 0 for m in materias), programas=sorted({m["NombrePrograma"] for m in materias}),
                       firma=mongo_json(firma) if firma else None)

    @app.post("/api/estudiante/contrato/firmar")
    @requiere("estudiante")
    def firmar_contrato():
        d = datos()
        periodo = d.get("periodo") if d.get("periodo") in periodos() else None
        if not periodo or d.get("acepto") is not True:
            raise ValidacionError("Debes aceptar las condiciones del contrato")
        materias = materias_periodo(periodo)
        if not materias:
            raise ValidacionError("No tienes materias inscritas en ese periodo")
        resumen = {"materias": len(materias), "total": sum(m["ValorMatricula"] or 0 for m in materias)}
        firma = contratos.firmar(g.usuario["IdUsuario"], periodo, g.usuario["Nombre"], request.remote_addr, resumen)
        registrar("contrato", {"periodo": periodo}, [g.usuario["IdUsuario"]])
        return jsonify(firma=mongo_json(firma)), 201

    # ---------------------------------------------------------------- foros
    @app.get("/api/foros")
    @requiere()
    def espacios_foro():
        espacios = [{"id": "general", "nombre": "Foro general", "descripcion": "Para toda la comunidad"}]
        espacios += [{"id": f"curso-{gid}", "nombre": nombre, "descripcion": f"Curso {gid}"} for gid, nombre in mis_cursos()]
        conteo = foros.contar([e["id"] for e in espacios])
        for e in espacios:
            e["hilos"] = conteo.get(e["id"], 0)
        return jsonify(espacios=espacios)

    def puede_ver(espacio):
        if espacio == "general":
            return True
        return espacio.startswith("curso-") and espacio[6:].isdigit() and int(espacio[6:]) in {gid for gid, _ in mis_cursos()}

    @app.get("/api/foros/<espacio>")
    @requiere()
    def hilos_foro(espacio):
        if not puede_ver(espacio):
            return jsonify(error="No perteneces a ese curso"), 403
        return jsonify(hilos=mongo_json(foros.hilos(espacio)))

    @app.post("/api/foros/<espacio>")
    @requiere()
    def crear_hilo(espacio):
        if not puede_ver(espacio):
            return jsonify(error="No perteneces a ese curso"), 403
        d = datos()
        hilo = foros.crear(espacio, d.get("titulo"), d.get("cuerpo"), autor())
        registrar("foro_hilo", {"espacio": espacio, "hilo": str(hilo["_id"]), "titulo": hilo["titulo"]}, [TODOS])
        return jsonify(hilo=mongo_json(hilo)), 201

    @app.get("/api/foros/hilo/<id_hilo>")
    @requiere()
    def ver_hilo(id_hilo):
        hilo = foros.hilo(id_hilo)
        if not hilo or not puede_ver(hilo["espacio"]):
            return jsonify(error="Ese tema no existe"), 404
        return jsonify(hilo=mongo_json(hilo))

    @app.post("/api/foros/hilo/<id_hilo>")
    @requiere()
    def responder_hilo(id_hilo):
        previo = foros.hilo(id_hilo)
        if not previo or not puede_ver(previo["espacio"]):
            return jsonify(error="Ese tema no existe"), 404
        hilo = foros.responder(id_hilo, datos().get("cuerpo"), autor())
        destinos = [TODOS] + ([previo["autor"]["id"]] if previo["autor"]["id"] != g.usuario["IdUsuario"] else [])
        registrar("foro_respuesta", {"espacio": previo["espacio"], "hilo": id_hilo, "titulo": previo["titulo"]}, destinos)
        return jsonify(hilo=mongo_json(hilo))

    # ---------------------------------------------------------------- aula virtual
    @app.get("/api/aula")
    @requiere("estudiante", "profesor")
    def ver_aula():
        cursos = mis_cursos()
        return jsonify(cursos=[{"id": gid, "nombre": n} for gid, n in cursos],
                       publicaciones=mongo_json(aula.de_cursos([gid for gid, _ in cursos])))

    @app.post("/api/aula")
    @requiere("profesor")
    def publicar_aula():
        d = datos()
        grupo = entero(d.get("grupo"), "Curso")
        if not profesores.es_su_curso(g.usuario["IdProfesor"], grupo):
            return jsonify(error="Ese curso no es tuyo"), 403
        doc = aula.publicar(grupo, d.get("tipo"), d.get("titulo"), d.get("cuerpo"), d.get("enlace"), d.get("entrega"), autor())
        alumnos = [e["IdEstudiante"] for e in profesores.lista_curso(g.usuario["IdProfesor"], grupo)]
        registrar("aula", {"grupo": grupo, "tipo": doc["tipo"], "titulo": doc["titulo"]}, usuarios.ids_de_estudiantes(alumnos) + [g.usuario["IdUsuario"]])
        return jsonify(publicacion=mongo_json(doc)), 201

    @app.delete("/api/aula/<id_pub>")
    @requiere("profesor")
    def borrar_aula(id_pub):
        doc = aula.eliminar(id_pub, g.usuario["IdUsuario"])
        registrar("aula", {"grupo": doc["grupo"], "eliminada": True, "titulo": doc["titulo"]}, [g.usuario["IdUsuario"]])
        return jsonify(ok=True)

    # ---------------------------------------------------------------- reconocimiento docente
    @app.get("/api/reconocimiento")
    @requiere("estudiante")
    def ver_reconocimiento():
        ya = reconocimientos.evaluados(g.usuario["IdUsuario"])
        cursos = [{"IdGrupo": m["IdGrupo"], "NombreMateria": m["NombreMateria"], "Profesor": m["Profesor"], "IdProfesor": m["IdProfesor"],
                   "Periodo": m["Periodo"], "evaluado": m["IdGrupo"] in ya}
                  for m in estudiantes.materias(g.usuario["IdEstudiante"]) if m["IdProfesor"]]
        return jsonify(cursos=cursos, criterios=ReconocimientoDAO.CRITERIOS)

    @app.post("/api/reconocimiento")
    @requiere("estudiante")
    def evaluar_docente():
        d = datos()
        grupo = entero(d.get("grupo"), "Curso")
        m = next((x for x in estudiantes.materias(g.usuario["IdEstudiante"]) if x["IdGrupo"] == grupo), None)
        if not m or not m["IdProfesor"]:
            raise ValidacionError("Solo puedes evaluar a profesores de tus cursos")
        reconocimientos.evaluar(g.usuario["IdUsuario"], grupo, m["IdProfesor"], m["Periodo"], d.get("puntajes"), d.get("comentario"))
        prof = [u["IdUsuario"] for u in usuarios.listar() if u["IdProfesor"] == m["IdProfesor"]]
        registrar("reconocimiento", {"grupo": grupo}, [g.usuario["IdUsuario"], *prof])
        return jsonify(ok=True), 201

    @app.get("/api/profesor/reconocimiento")
    @requiere("profesor")
    def mis_resultados():
        nombres = {c["IdGrupo"]: c["NombreMateria"] for c in profesores.cursos(g.usuario["IdProfesor"])}
        filas = reconocimientos.resultados(g.usuario["IdProfesor"])
        for f in filas:
            f["materia"] = nombres.get(f["_id"], f"Curso {f['_id']}")
        return jsonify(resultados=mongo_json(filas), criterios=ReconocimientoDAO.CRITERIOS)

    # ---------------------------------------------------------------- laboratorios
    @app.get("/api/laboratorios")
    @requiere()
    def ver_laboratorios():
        hoy = date.today()
        dias = [hoy + timedelta(days=i) for i in range(15)]
        dias = [d for d in dias if d.isoweekday() != 7][:7]
        ocupadas = []
        for r in reservas.ocupacion(dias[0], dias[-1]):
            x = a_json(r)
            mia = r["IdUsuario"] == g.usuario["IdUsuario"]
            ocupadas.append({"id": x["IdReserva"] if mia else None, "laboratorio": x["Laboratorio"], "fecha": x["Fecha"][:10],
                             "franja": x["Franja"], "mia": mia, "por": x["Nombre"].split()[0] if not mia else "Tú",
                             "motivo": x["Motivo"] if mia else None})
        return jsonify(laboratorios=ReservaDAO.LABORATORIOS, franjas=ReservaDAO.FRANJAS, dias=[d.isoformat() for d in dias],
                       ocupadas=ocupadas, mias=[a_json(r) for r in reservas.mias(g.usuario["IdUsuario"])],
                       maximo=ReservaDAO.MAXIMO_ACTIVAS, ahora=datetime.now().strftime("%Y-%m-%d %H:%M"))

    @app.post("/api/laboratorios/reservas")
    @requiere()
    def reservar_laboratorio():
        d = datos()
        nuevo = reservas.reservar(g.usuario["IdUsuario"], d.get("laboratorio"), d.get("fecha"), d.get("franja"), d.get("motivo"))
        registrar("reserva", {"laboratorio": ReservaDAO.LABORATORIOS.get(d.get("laboratorio")), "fecha": d.get("fecha"), "franja": d.get("franja")},
                  [g.usuario["IdUsuario"], TODOS])
        return jsonify(ok=True, id=nuevo), 201

    @app.delete("/api/laboratorios/reservas/<int:id_reserva>")
    @requiere()
    def cancelar_reserva(id_reserva):
        fila = a_json(reservas.cancelar(g.usuario["IdUsuario"], id_reserva))
        registrar("reserva_cancelada", {"laboratorio": ReservaDAO.LABORATORIOS.get(fila["Laboratorio"]), "fecha": fila["Fecha"][:10],
                                        "franja": fila["Franja"]}, [g.usuario["IdUsuario"], TODOS])
        return jsonify(ok=True)

    # ---------------------------------------------------------------- ciencias básicas (monitorías)
    def monitoria_json(doc):
        x = mongo_json(doc)
        x["inscrito"] = g.usuario["IdUsuario"] in doc["inscritos"]
        x["ocupados"] = len(doc["inscritos"])
        x.pop("inscritos", None)  # no se expone quién más está inscrito
        return x

    @app.get("/api/monitorias")
    @requiere()
    def ver_monitorias():
        return jsonify(monitorias=[monitoria_json(m) for m in monitorias.listar()])

    @app.post("/api/monitorias/<id_m>")
    @requiere()
    def inscribir_monitoria(id_m):
        doc = monitorias.inscribir(id_m, g.usuario["IdUsuario"])
        registrar("monitoria", {"materia": doc["materia"], "monitoria": id_m}, [g.usuario["IdUsuario"], TODOS])
        return jsonify(monitoria=monitoria_json(doc))

    @app.delete("/api/monitorias/<id_m>")
    @requiere()
    def retirar_monitoria(id_m):
        doc = monitorias.retirar(id_m, g.usuario["IdUsuario"])
        registrar("monitoria_retiro", {"materia": doc["materia"], "monitoria": id_m}, [g.usuario["IdUsuario"], TODOS])
        return jsonify(monitoria=monitoria_json(doc))

    return {"publicaciones": publicaciones, "reconocimientos": reconocimientos, "pagos": pagos}
