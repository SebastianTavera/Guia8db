// Campus — estudiante: panel, mis materias, inscripción (CRUD de la matrícula),
// comprobante y perfil. La inscripción usa sp_registrar_matricula y los cupos
// se actualizan en vivo con cada inscripción, retiro o cambio de curso.
import { $, ICONOS, SALIDA, animarNumero, aviso, deslizarIndicador, dur, esc, sacudir } from "./comun.js";
import {
  IC, codigoCurso, horarioCorto, abrirModal, api, codigoMatricula, cupoHTML, entrarEnCascada, estado, fechaLarga, iniciales, insignia, irA,
  lineaTiempoHTML, moneda, numero, tituloPagina, tono, vacioHTML,
} from "./campus.js";

let datos = null; // resumen del estudiante (se comparte entre pantallas)
async function cargar() {
  datos = await api("GET", "/api/estudiante/resumen");
  // la insignia dice cuántas materias llevas en el periodo, de las 9 permitidas
  const delPeriodo = datos.materias.filter((m) => !estado.periodo || m.Periodo === estado.periodo).length;
  insignia("inscripcion", `${delPeriodo}/${datos.maximo}`);
  return datos;
}
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const conCupo = (g) => g.Cupo == null || g.Inscritos < g.Cupo;
const nombreCompleto = (e) => [e.PrimerNombre, e.SegundoNombre, e.PrimerApellido, e.SegundoApellido].filter(Boolean).join(" ");
const RELEVANTES = ["notas", "curso_cerrado", "matricula", "matricula_retirada", "matricula_cambiada", "promedio", "estudiante_editado", "cupo", "grupo_creado"];
let modalEnVivo = null; // actualiza el cupo dentro de la ventana de confirmación

// ------------------------------------------------------------------ piezas reutilizables
function chipEstado(m) {
  if (m.EstadoCurso === "Aprobado") return `<span class="chip verde"><i></i>Aprobado</span>`;
  if (m.EstadoCurso === "Reprobado") return `<span class="chip alerta"><i></i>Reprobado</span>`;
  if (m.EstadoCurso === "Pendiente") return `<span class="chip"><i></i>Pendiente</span>`;
  if (m.NotaFinal != null) return `<span class="chip"><i></i>Calificada</span>`;
  return `<span class="chip"><i></i>Inscrita</span>`;
}

const modificable = (m) => m.NotaFinal == null && (m.EstadoCurso || "Sin evaluar") === "Sin evaluar";

function claseHTML(m) {
  const ok = modificable(m);
  return `<article class="clase glass" data-tono="${tono(m.IdMateria)}" data-matricula="${m.IdMatricula}" data-grupo="${m.IdGrupo}">
    <div class="clase-banner" data-ver="${m.IdMatricula}" role="link" tabindex="0" aria-label="Ver ${esc(m.NombreMateria)}">
      <h3>${esc(m.NombreMateria)}</h3><small>${codigoCurso(m.IdGrupo)} · ${esc(m.Periodo || "")}</small>
      <span class="clase-avatar" title="${esc(m.Profesor || "Por asignar")}">${esc(iniciales(m.Profesor || "?"))}</span>
    </div>
    <div class="clase-cuerpo">
      <div class="clase-fila">${IC.docente}<span>${esc(m.Profesor || "Profesor por asignar")}</span></div>
      <div class="clase-fila">${IC.reloj}<span>${horarioCorto(m.Horario, "Horario por definir")}</span></div>
      <div class="clase-fila">${IC.creditos}<span>${m.CreditosMateria} crédito${m.CreditosMateria === 1 ? "" : "s"} · ${esc(m.NombrePrograma)}</span></div>
      <div class="clase-nota"><div>${chipEstado(m)}</div><b class="${m.NotaFinal == null ? "vacia" : ""}">${m.NotaFinal == null ? "—" : numero(m.NotaFinal, 1)}</b></div>
    </div>
    <div class="clase-pie"><span class="codigo">${codigoMatricula(m.IdMatricula)}</span>
      <div class="acciones">
        <button class="boton-icono" type="button" data-ver="${m.IdMatricula}" title="Ver comprobante" aria-label="Ver comprobante">${IC.ojo}</button>
        <button class="boton-icono" type="button" data-cambiar="${m.IdMatricula}" title="Cambiar de curso" aria-label="Cambiar de curso" ${ok ? "" : "disabled"}>${IC.cambiar}</button>
        <button class="boton-icono peligro" type="button" data-retirar="${m.IdMatricula}" title="Retirar materia" aria-label="Retirar materia" ${ok ? "" : "disabled"}>${IC.papelera}</button>
      </div></div>
  </article>`;
}

/** Fichas con todos los datos de una inscripción (al confirmar y en el comprobante). */
function fichasHTML(c) {
  const fila = (t, v, ancho = false) => `<div class="${ancho ? "ancho" : ""}"><dt>${t}</dt><dd>${v}</dd></div>`;
  const e = datos.estudiante;
  const estadoTexto = c.NotaFinal != null ? `Calificada (${numero(c.NotaFinal, 1)})` : !c.EstadoCurso || c.EstadoCurso === "Sin evaluar" ? "Inscrita" : c.EstadoCurso;
  return `<dl class="ficha"><span class="ficha-titulo">Estudiante</span>
      ${fila("Nombre", esc(nombreCompleto(e)))}${fila("Documento (ID)", esc(e.IdEstudiante))}
      ${fila("Correo institucional", esc(e.CorreoEstudiante || ""), true)}</dl>
    <dl class="ficha"><span class="ficha-titulo">Curso</span>
      ${fila("Materia", esc(c.NombreMateria))}${fila("Curso (grupo)", codigoCurso(c.IdGrupo))}
      ${fila("Programa", esc(c.NombrePrograma))}${fila("Créditos", esc(c.CreditosMateria))}
      ${fila("Profesor asignado", esc(c.Profesor || "Por asignar"))}${fila("Periodo", esc(c.Periodo || "—"))}
      ${fila("Horario", horarioCorto(c.Horario, "Por definir"), true)}</dl>
    <dl class="ficha"><span class="ficha-titulo">Matrícula</span>
      ${fila("Valor", moneda(c.ValorMatricula ?? c.ValorEstimado ?? 0))}${fila("Fecha", fechaLarga(c.FechaMatricula || hoyLocal()))}
      ${c.IdMatricula ? fila("Número", codigoMatricula(c.IdMatricula)) + fila("Estado", esc(estadoTexto)) : ""}</dl>`;
}

function comprobanteHTML(c, { nueva = false, acciones = true } = {}) {
  const ok = modificable(c);
  return `<article class="comprobante glass glass-fuerte">
    <header class="comprobante-cabeza">
      <div><span class="marca"><span class="marca-logo" aria-hidden="true"></span><span class="marca-texto">Campus</span></span>
        <h3>${nueva ? "Inscripción confirmada" : "Comprobante de inscripción"}</h3></div>
      <div class="comprobante-numero">${nueva ? `<svg class="sello-ok" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/><path d="M14 22.5 19.5 28 30 16.5"/></svg>` : ""}
        <small>Matrícula</small><b>${codigoMatricula(c.IdMatricula)}</b></div>
    </header>
    <div class="comprobante-cuerpo">${fichasHTML(c)}</div>
    <footer class="comprobante-pie"><span>Inscripción confirmada el ${fechaLarga(c.FechaMatricula)}</span>
      ${acciones ? `<div class="no-imprimir" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="boton-vidrio" type="button" data-imprimir>Imprimir</button>
        <button class="boton-vidrio" type="button" data-cambiar="${c.IdMatricula}" ${ok ? "" : "disabled"}>${IC.cambiar} Cambiar de curso</button>
        <button class="boton-vidrio boton-peligro" type="button" data-retirar="${c.IdMatricula}" ${ok ? "" : "disabled"}>${IC.papelera} Retirar</button>
      </div>` : ""}</footer>
  </article>`;
}

// ------------------------------------------------------------------ CRUD de la matrícula
/** CREATE: confirmación con la ficha completa, cupo en vivo y comprobante al terminar. */
function confirmarInscripcion(grupo, alTerminar) {
  let vivo = { ...grupo };
  const textoBoton = (g) => (conCupo(g) ? `Confirmar inscripción · ${moneda(g.ValorEstimado)}` : "Sin cupo");
  const ventana = abrirModal(`
    <div class="modal-cabeza"><div><h2>Confirmar inscripción</h2><p>Revisa los datos antes de inscribirte.</p></div>
      <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    ${fichasHTML(vivo)}
    <div style="margin-top:12px" id="cupo-vivo">${cupoHTML(vivo.Inscritos, vivo.Cupo)}</div>
    ${vivo.Cruces?.length ? `<div class="nota-aviso cruce">${IC.aviso}<span><b>Cruce de horario</b> con ${vivo.Cruces.map(esc).join(", ")}. Puedes inscribirte, pero revisa tu <a href="#/horario">horario</a>.</span></div>` : ""}
    <div class="nota-aviso">${IC.aviso}<span>Al confirmar se reserva tu cupo al instante. Puedes cambiar de curso o retirar la materia mientras no tenga nota.</span></div>
    <p class="error-texto" role="alert"></p>
    <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button>
      <button class="boton-solido" type="button" data-confirmar ${conCupo(vivo) ? "" : "disabled"}><span>${textoBoton(vivo)}</span></button></div>`,
  { alCerrar: () => (modalEnVivo = null) });
  const { modal } = ventana;

  modalEnVivo = async (ev) => {
    if (!["matricula", "matricula_retirada", "matricula_cambiada", "cupo"].includes(ev.accion)) return;
    const g = (await api("GET", "/api/estudiante/resumen")).disponibles.find((x) => x.IdGrupo === grupo.IdGrupo);
    const b = $("[data-confirmar]", modal);
    if (!g || !ventana.abierta() || !b) return;
    vivo = g;
    $("#cupo-vivo", modal).innerHTML = cupoHTML(g.Inscritos, g.Cupo);
    $("#cupo-vivo .cupo", modal).classList.add("cambio");
    b.disabled = !conCupo(g);
    $("span", b).textContent = textoBoton(g);
  };

  modal.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-confirmar]");
    if (b) {
      b.disabled = true;
      b.classList.add("cargando");
      $("span", b).textContent = "Inscribiendo…";
      try {
        const r = await api("POST", "/api/estudiante/matricular", { idGrupo: grupo.IdGrupo });
        modalEnVivo = null;
        await cargar();
        modal.innerHTML = `${comprobanteHTML(r.comprobante, { nueva: true, acciones: false })}
          <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Seguir inscribiendo</button>
            <button class="boton-vidrio" type="button" data-imprimir>Imprimir</button>
            <button class="boton-solido" type="button" data-ir-materias>Ver mis materias</button></div>`;
        entrarEnCascada(".ficha, .modal-pie", modal, 60);
        // sin aviso flotante: la ventana ya muestra la confirmación y el comprobante
        alTerminar?.(r.comprobante);
      } catch (err) {
        $(".error-texto", modal).textContent = String(err.message).replace(/^ERROR:\s*/, "");
        sacudir(modal);
        b.classList.remove("cargando");
        b.disabled = false;
        $("span", b).textContent = "Intentar de nuevo";
      }
    } else if (e.target.closest("[data-imprimir]")) print();
    else if (e.target.closest("[data-ir-materias]")) {
      await ventana.cerrar();
      irA("asignaturas");
    }
  });
}

/** DELETE: retirar una materia sin nota ni cierre. */
function retirarMateria(idMatricula, alTerminar) {
  const m = datos.materias.find((x) => x.IdMatricula === idMatricula);
  if (!m) return;
  const { modal, cerrar } = abrirModal(`
    <div class="modal-cabeza"><div><h2>Retirar materia</h2><p>${esc(m.NombreMateria)} · ${codigoCurso(m.IdGrupo)} · ${codigoMatricula(m.IdMatricula)}</p></div>
      <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    <div class="nota-aviso">${IC.aviso}<span>Se eliminará tu matrícula y el cupo quedará libre para otro estudiante. Solo se puede retirar una materia <b>sin nota</b> y <b>sin cierre</b>.</span></div>
    <p class="error-texto" role="alert"></p>
    <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button>
      <button class="boton-solido" type="button" data-si><span>Sí, retirar materia</span></button></div>`);
  $("[data-si]", modal).addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.classList.add("cargando");
    try {
      await api("DELETE", `/api/estudiante/matriculas/${idMatricula}`);
      await cerrar();
      aviso("Materia retirada", `${m.NombreMateria} · el cupo quedó libre`);
      const tarjeta = $(`.clase[data-matricula="${idMatricula}"]`);
      await tarjeta?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.92)", filter: "blur(8px)" }],
        { duration: dur(380), easing: SALIDA, fill: "forwards" }).finished;
      await cargar();
      alTerminar?.();
    } catch (err) {
      $(".error-texto", modal).textContent = err.message;
      sacudir(modal);
      b.disabled = false;
      b.classList.remove("cargando");
    }
  });
}

/** UPDATE: cambiarse a otro curso (grupo) de la misma materia. */
async function cambiarCurso(idMatricula, alTerminar) {
  const m = datos.materias.find((x) => x.IdMatricula === idMatricula);
  if (!m) return;
  const { grupos } = await api("GET", `/api/estudiante/matriculas/${idMatricula}/alternativas`);
  const { modal, cerrar } = abrirModal(`
    <div class="modal-cabeza"><div><h2>Cambiar de curso</h2><p>${esc(m.NombreMateria)} · hoy en el ${codigoCurso(m.IdGrupo)} con ${esc(m.Profesor || "profesor por asignar")}</p></div>
      <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    ${grupos.length ? `<div class="opciones-grupo">${grupos.map((g) => `<label class="opcion-grupo ${conCupo(g) ? "" : "deshabilitada"}">
        <input type="radio" name="grupo" value="${g.IdGrupo}" ${conCupo(g) ? "" : "disabled"}>
        <div><strong>${codigoCurso(g.IdGrupo)} · ${esc(g.Profesor || "Por asignar")}</strong><div class="tenue">${horarioCorto(g.Horario, "Horario por definir")} · ${esc(g.Periodo || "")}</div></div>
        ${cupoHTML(g.Inscritos, g.Cupo)}</label>`).join("")}</div>`
      : vacioHTML("No hay otros cursos de esta materia", "Esta materia tiene un solo curso abierto en este periodo. Cuando la administración abra otro, podrás cambiarte aquí.")}
    <p class="error-texto" role="alert"></p>
    <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button>
      ${grupos.length ? `<button class="boton-solido" type="button" data-si disabled><span>Cambiar de curso</span></button>` : ""}</div>`);
  modal.addEventListener("change", () => ($("[data-si]", modal).disabled = !$("input[name=grupo]:checked", modal)));
  $("[data-si]", modal)?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.classList.add("cargando");
    try {
      const r = await api("PATCH", `/api/estudiante/matriculas/${idMatricula}`, { idGrupo: Number($("input[name=grupo]:checked", modal).value) });
      await cerrar();
      aviso("Cambio de curso realizado", `${r.comprobante.NombreMateria} · ahora en el ${codigoCurso(r.comprobante.IdGrupo)}`);
      await cargar();
      alTerminar?.();
    } catch (err) {
      $(".error-texto", modal).textContent = err.message;
      sacudir(modal);
      b.disabled = false;
      b.classList.remove("cargando");
    }
  });
}

/** Clics comunes de tarjetas y comprobantes (READ, UPDATE, DELETE, imprimir). */
function accionesComunes(e, refrescar) {
  const ver = e.target.closest("[data-ver]");
  const cambiar = e.target.closest("[data-cambiar]");
  const retirar = e.target.closest("[data-retirar]");
  if (e.target.closest("[data-imprimir]")) return print();
  if (cambiar) return !cambiar.disabled && cambiarCurso(Number(cambiar.dataset.cambiar), refrescar);
  if (retirar) return !retirar.disabled && retirarMateria(Number(retirar.dataset.retirar), refrescar);
  if (ver) irA(`materia/${ver.dataset.ver}`);
}

// ------------------------------------------------------------------ pantallas
async function panel(vista) {
  await cargar();
  const e = datos.estudiante;
  tituloPagina("Panel");
  async function pintar(animar = true) {
    const pendientes = datos.materias.filter((m) => m.NotaFinal == null).length;
    const programas = [...new Set(datos.materias.map((m) => m.NombrePrograma))];
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Hola, ${esc(e.PrimerNombre)}</h2>
        <p>Documento ${esc(e.IdEstudiante)}${programas.length ? ` · ${esc(programas.join(", "))}` : ""}</p></div>
        <a class="boton-solido" href="#/inscripcion">${IC.inscribir} Inscribir materias</a></div>
      <section class="kpis">
        <article class="kpi glass destacado"><span class="etiqueta">Promedio</span><span class="valor" id="kpi-promedio">${datos.promedio == null ? "—" : "0,00"}</span><span class="sub">${esc(datos.clasificacion || "Sin calificar")}</span><span class="icono">${IC.grafico}</span></article>
        <article class="kpi glass"><span class="etiqueta">Materias</span><span class="valor">${datos.materias.length}</span><span class="sub">${pendientes} sin nota</span><span class="icono">${IC.libros}</span></article>
        <article class="kpi glass"><span class="etiqueta">Créditos</span><span class="valor">${datos.creditos}</span><span class="sub">Inscritos</span><span class="icono">${IC.creditos}</span></article>
        <article class="kpi glass"><span class="etiqueta">Matrícula</span><span class="valor">${moneda(datos.valor)}</span><span class="sub">Valor total</span><span class="icono">${IC.dinero}</span></article>
      </section>
      <div class="rejilla-panel">
        <div class="columna">
          <section class="panel glass"><div class="panel-cabeza"><h3>Mis materias</h3><a href="#/asignaturas">Ver todas (${datos.materias.length})</a></div>
            ${datos.materias.length ? `<div class="clases">${datos.materias.slice(0, 4).map(claseHTML).join("")}</div>`
              : vacioHTML("Aún no tienes materias", "Inscribe tus cursos para verlos aquí.", `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}
          </section>
        </div>
        <div class="columna">
          <section class="panel glass"><div class="panel-cabeza"><h3>Disponibles para inscribir</h3><a href="#/inscripcion">Ver todos</a></div>
            ${datos.disponibles.length ? `<div class="tabla-envoltura"><table class="tabla"><tbody>${datos.disponibles.slice(0, 4).map((g) => `<tr>
              <td><strong>${esc(g.NombreMateria)}</strong><span class="sub">${codigoCurso(g.IdGrupo)} · ${esc(g.Profesor || "Por asignar")}</span></td>
              <td style="width:118px">${cupoHTML(g.Inscritos, g.Cupo)}</td></tr>`).join("")}</tbody></table></div>`
              : `<p class="tenue">Ya estás inscrito en todos los cursos abiertos.</p>`}
          </section>
          <section class="panel glass"><div class="panel-cabeza"><h3>Actividad reciente</h3></div>
            <div id="actividad"><p class="cargando-texto">Cargando…</p></div></section>
        </div>
      </div>`;
    if (animar) entrarEnCascada(".pagina-cabeza, .kpi, .panel, .clase", vista, 40);
    if (datos.promedio != null) animarNumero($("#kpi-promedio", vista), datos.promedio, (v) => numero(v));
    try {
      const { eventos } = await api("GET", "/api/actividad");
      const caja = $("#actividad", vista);
      if (caja) caja.innerHTML = lineaTiempoHTML(eventos.slice(0, 7));
    } catch { /* la bitácora es opcional para ver el panel */ }
  }
  vista.onclick = (ev) => accionesComunes(ev, () => pintar(false));
  vista.onkeydown = (ev) => ev.key === "Enter" && ev.target.matches(".clase-banner") && irA(`materia/${ev.target.dataset.ver}`);
  await pintar();
  return {
    async alEvento(ev) {
      modalEnVivo?.(ev);
      if (!RELEVANTES.includes(ev.accion)) return;
      await cargar();
      await pintar(false);
      if (ev.paraMi && ev.detalle?.grupo) $(`.clase[data-grupo="${ev.detalle.grupo}"]`, vista)?.classList.add(ev.accion === "notas" ? "destello" : "nueva");
    },
  };
}

async function materias(vista) {
  await cargar();
  tituloPagina("Mis materias");
  let filtro = "todas";
  let busqueda = "";
  function pintar(animar = true, nueva = null) {
    const lista = datos.materias
      .filter((m) => filtro === "todas" || (filtro === "curso" ? m.NotaFinal == null : m.NotaFinal != null))
      .filter((m) => !busqueda || `${m.NombreMateria} ${m.Profesor} ${m.IdGrupo}`.toLowerCase().includes(busqueda));
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Mis materias</h2><p>${datos.materias.length} materias · ${datos.creditos} créditos · ${moneda(datos.valor)}</p></div>
        <a class="boton-solido" href="#/inscripcion">${IC.inscribir} Inscribir otra materia</a></div>
      <div class="filtros-barra">
        <div class="segmentado" id="filtro-materias"><span class="segmentado-indicador"></span>
          ${[["todas", "Todas"], ["curso", "En curso"], ["calificadas", "Calificadas"]].map(([v, t]) => `<button type="button" data-filtro="${v}" aria-pressed="${filtro === v}">${t}</button>`).join("")}
        </div>
        <span class="contador-resultados">${lista.length} de ${datos.materias.length}</span>
      </div>
      ${lista.length ? `<div class="clases">${lista.map(claseHTML).join("")}</div>`
        : `<div class="panel glass">${vacioHTML(datos.materias.length ? "Sin resultados" : "Aún no tienes materias",
          datos.materias.length ? "Prueba con otro filtro o búsqueda." : "Ve a Inscripción para inscribir tus cursos.",
          datos.materias.length ? "" : `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}</div>`}`;
    const seg = $("#filtro-materias", vista);
    requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", seg), $(`button[data-filtro="${filtro}"]`, seg), false));
    if (animar) entrarEnCascada(".pagina-cabeza, .clase, .panel", vista, 40);
    if (nueva) $(`.clase[data-grupo="${nueva}"]`, vista)?.classList.add("nueva");
  }
  vista.onclick = (e) => {
    const f = e.target.closest("[data-filtro]");
    if (f) {
      filtro = f.dataset.filtro;
      return pintar(true);
    }
    accionesComunes(e, () => pintar(false));
  };
  vista.onkeydown = (e) => e.key === "Enter" && e.target.matches(".clase-banner") && irA(`materia/${e.target.dataset.ver}`);
  pintar();
  return {
    alBuscar(texto) {
      busqueda = texto;
      pintar(false);
    },
    async alEvento(ev) {
      modalEnVivo?.(ev);
      if (!RELEVANTES.includes(ev.accion)) return;
      await cargar();
      pintar(false, ev.paraMi ? ev.detalle?.grupo : null);
    },
  };
}

async function inscripcion(vista) {
  await cargar();
  tituloPagina("Inscripción de materias");
  let programa = "";
  let vistaFiltro = "todas"; // todas | inscritas | cupo
  let busqueda = "";
  let abiertos = null; // programas desplegados (por defecto, los del estudiante)
  const delPeriodo = (x) => !estado.periodo || x.Periodo === estado.periodo;

  function filas() {
    // Una sola tabla: los cursos en los que ya estás (con Retirar) y los disponibles (con Inscribir)
    const mias = datos.materias.filter(delPeriodo).map((m) => ({ ...m, inscrito: true }));
    const materiasMias = new Map(mias.map((m) => [m.IdMateria, m]));
    const libres = datos.disponibles.filter(delPeriodo).map((g) => ({ ...g, yaTiene: materiasMias.get(g.IdMateria) || null }));
    return [...mias, ...libres].sort((x, y) => x.NombreMateria.localeCompare(y.NombreMateria, "es") || (y.inscrito ? 1 : 0) - (x.inscrito ? 1 : 0) || x.IdGrupo - y.IdGrupo);
  }

  function accionHTML(g, lleno) {
    if (g.inscrito) {
      return modificable(g)
        ? `<button class="boton-vidrio boton-peligro" type="button" data-retirar="${g.IdMatricula}">${IC.papelera}<span>Retirar</span></button>`
        : `<span class="chip">${g.NotaFinal != null ? "Calificada" : esc(g.EstadoCurso)}</span>`;
    }
    if (g.yaTiene) return `<button class="boton-vidrio" type="button" data-cambiar="${g.yaTiene.IdMatricula}" ${modificable(g.yaTiene) ? "" : "disabled"}>${IC.cambiar}<span>Cambiarme</span></button>`;
    if (lleno) return `<button class="boton-solido" type="button" disabled>Límite ${datos.maximo}</button>`;
    return `<button class="boton-vidrio claro" type="button" data-inscribir="${g.IdGrupo}" ${conCupo(g) ? "" : "disabled"}>${conCupo(g) ? "Inscribir" : "Sin cupo"}</button>`;
  }

  function pintar(animar = true, cambiado = null) {
    const todas = filas();
    const mias = todas.filter((g) => g.inscrito);
    const lleno = mias.length >= datos.maximo;
    const programas = [...new Map(todas.map((g) => [g.IdPrograma, g.NombrePrograma])).entries()].sort((x, y) => x[1].localeCompare(y[1], "es"));
    const lista = todas
      .filter((g) => !programa || String(g.IdPrograma) === programa)
      .filter((g) => vistaFiltro === "todas" || (vistaFiltro === "inscritas" ? g.inscrito : !g.inscrito && conCupo(g)))
      .filter((g) => !busqueda || `${g.NombreMateria} ${g.Profesor} ${g.IdGrupo} ${g.NombrePrograma}`.toLowerCase().includes(busqueda));
    const creditos = mias.reduce((t, m) => t + (m.CreditosMateria || 0), 0);
    if (!abiertos) abiertos = new Set(datos.materias.map((m) => String(m.IdPrograma)));
    const todosAbiertos = Boolean(busqueda) || vistaFiltro !== "todas" || Boolean(programa);
    const grupos = [...new Map(lista.map((g) => [String(g.IdPrograma), g.NombrePrograma])).entries()].sort((x, y) => x[1].localeCompare(y[1], "es"));
    const filaHTML = (g) => `<tr data-grupo="${g.IdGrupo}" class="${g.inscrito ? "fila-inscrita" : ""} ${cambiado === g.IdGrupo ? "actualizada" : ""}">
            <td><span class="codigo-curso">${codigoCurso(g.IdGrupo)}</span></td>
            <td><strong>${esc(g.NombreMateria)}</strong>${g.inscrito ? ` <span class="chip solido">✓ Inscrito</span>` : g.yaTiene ? ` <span class="chip">Inscrita en el ${codigoCurso(g.yaTiene.IdGrupo)}</span>` : ""}
              <span class="sub">${esc(g.Periodo || "")} · ${g.CreditosMateria} crédito${g.CreditosMateria === 1 ? "" : "s"}</span></td>
            <td class="ocultable">${esc(g.Profesor || "Por asignar")}</td>
            <td class="tenue ocultable">${horarioCorto(g.Horario, "Por definir")}${!g.inscrito && g.Cruces?.length ? `<span class="sub aviso-cruce">⚠ Cruce con ${esc(g.Cruces.join(", "))}</span>` : ""}</td>
            <td data-col="cupo" style="min-width:130px">${cupoHTML(g.Inscritos, g.Cupo)}</td>
            <td class="num ocultable">${moneda(g.inscrito ? g.ValorMatricula : g.ValorEstimado)}</td>
            <td data-col="accion" class="num">${accionHTML(g, lleno)}</td>
          </tr>`;
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Inscripción de materias</h2>
        <p>Período ${esc(estado.periodo || "")} · cupos en tiempo real · máximo <b>${datos.maximo} materias</b>. </p></div>
        <a class="boton-vidrio" href="#/horario">${IC.calendario} Ver mi horario</a></div>
      <section class="panel glass mis-inscritas ${lleno ? "lleno" : ""}">
        <div class="panel-cabeza"><h3>Estoy inscrito en</h3><span class="chip ${lleno ? "alerta" : ""}">${mias.length} de ${datos.maximo} materias · ${creditos} créditos</span></div>
        <div class="medidor-materias" style="--p:${Math.min(100, (mias.length / datos.maximo) * 100)}%"><i></i></div>
        ${mias.length ? `<div class="inscritas-lista">${mias.map((m) => `<article class="inscrita ${cambiado === m.IdGrupo ? "nueva" : ""}" data-tono="${tono(m.IdMateria)}">
            <span class="codigo-curso">${codigoCurso(m.IdGrupo)}</span>
            <div><strong>${esc(m.NombreMateria)}</strong><span>${esc(m.Profesor || "Por asignar")}</span><span>${horarioCorto(m.Horario, "Horario por definir")}</span></div>
            <div class="inscrita-acciones">
              <button class="boton-icono" type="button" data-ver="${m.IdMatricula}" title="Ver comprobante" aria-label="Ver comprobante de ${esc(m.NombreMateria)}">${IC.ojo}</button>
              <button class="boton-icono" type="button" data-cambiar="${m.IdMatricula}" title="Cambiar de curso" aria-label="Cambiar de curso" ${modificable(m) ? "" : "disabled"}>${IC.cambiar}</button>
              <button class="boton-icono peligro" type="button" data-retirar="${m.IdMatricula}" title="Retirar materia" aria-label="Retirar ${esc(m.NombreMateria)}" ${modificable(m) ? "" : "disabled"}>${IC.papelera}</button>
            </div></article>`).join("")}</div>`
          : `<p class="tenue">Aún no tienes materias en este período. Elige tus cursos en la tabla de abajo.</p>`}
      </section>
      <section class="panel glass">
        <div class="filtros-barra">
          <div class="segmentado" id="f-vista"><span class="segmentado-indicador"></span>
            ${[["todas", "Todos los cursos"], ["inscritas", `Inscritas (${mias.length})`], ["cupo", "Con cupo"]].map(([v, t]) => `<button type="button" data-vista="${v}" aria-pressed="${vistaFiltro === v}">${t}</button>`).join("")}</div>
          <label class="selector"><span class="visualmente-oculto">Programa</span><select id="f-programa"><option value="">Todos los programas</option>
            ${programas.map(([id, n]) => `<option value="${id}" ${String(id) === programa ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
          <span class="contador-resultados">${lista.length} cursos</span>
        </div>
        ${lista.length ? grupos.map(([id, nombre]) => {
          const filas = lista.filter((g) => String(g.IdPrograma) === id);
          const mis = filas.filter((g) => g.inscrito).length;
          return `<details class="grupo-oferta" data-programa="${id}" ${todosAbiertos || abiertos.has(id) ? "open" : ""}>
            <summary><h4>${esc(nombre)}</h4><span class="tenue">${filas.length} cursos${mis ? ` · ${mis} inscrita${mis === 1 ? "" : "s"}` : ""}</span><span class="flecha">${IC.abajo}</span></summary>
            <div class="tabla-envoltura"><table class="tabla tabla-responsiva">
              <thead><tr><th>Curso</th><th>Materia</th><th>Profesor asignado</th><th>Horario</th><th>Cupo</th><th class="num">Valor</th><th></th></tr></thead>
              <tbody>${filas.map(filaHTML).join("")}</tbody></table></div></details>`;
        }).join("")
          : vacioHTML("Sin resultados", "Prueba con otro filtro, otro programa u otra búsqueda.")}
      </section>`;
    const seg = $("#f-vista", vista);
    requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", seg), $(`button[data-vista="${vistaFiltro}"]`, seg), false));
    if (animar) entrarEnCascada(".pagina-cabeza, .panel", vista, 50);
  }
  vista.onclick = (e) => {
    const b = e.target.closest("[data-inscribir]");
    const v = e.target.closest("[data-vista]");
    if (v) {
      vistaFiltro = v.dataset.vista;
      return pintar(false);
    }
    if (b && !b.disabled) return confirmarInscripcion(datos.disponibles.find((x) => x.IdGrupo === Number(b.dataset.inscribir)), () => pintar(false));
    accionesComunes(e, () => pintar(false));
  };
  vista.onchange = (e) => {
    if (e.target.id === "f-programa") programa = e.target.value;
    pintar(false);
  };
  vista.addEventListener("toggle", (e) => {
    const d = e.target.closest?.(".grupo-oferta");
    if (d && abiertos) d.open ? abiertos.add(d.dataset.programa) : abiertos.delete(d.dataset.programa);
  }, true);
  pintar();
  return {
    alBuscar(texto) {
      busqueda = texto;
      pintar(false);
    },
    async alEvento(ev) {
      modalEnVivo?.(ev);
      if (!RELEVANTES.includes(ev.accion)) return;
      await cargar();
      pintar(false, Number(ev.detalle?.grupo) || null);
    },
  };
}

/** "Mis materias" del periodo dentro de otra pantalla (el inicio): tarjetas con ver, cambiar y retirar. */
export async function montarMisMaterias(caja, alCambiar) {
  await cargar();
  const lista = datos.materias.filter((m) => !estado.periodo || m.Periodo === estado.periodo);
  const creditos = lista.reduce((t, m) => t + (m.CreditosMateria || 0), 0);
  caja.innerHTML = `<div class="pagina-cabeza"><div><h2>Mis materias · ${esc(estado.periodo || "")}</h2>
      <p>${lista.length} de ${datos.maximo} materias · ${creditos} créditos</p></div>
      <div class="acciones-cabeza"><a class="boton-vidrio" href="#/horario">${IC.calendario} Mi horario</a><a class="boton-solido" href="#/inscripcion">${IC.inscribir} Inscribir materias</a></div></div>
    ${lista.length ? `<div class="clases">${lista.map(claseHTML).join("")}</div>`
      : `<div class="panel glass">${vacioHTML("Aún no tienes materias en este período", "Inscribe tus cursos y aparecerán aquí con su profesor y horario.", `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}</div>`}`;
  entrarEnCascada(".pagina-cabeza, .clase, .panel", caja, 35);
  caja.onclick = (e) => accionesComunes(e, async () => { await montarMisMaterias(caja, alCambiar); alCambiar?.(); });
  caja.onkeydown = (e) => e.key === "Enter" && e.target.matches(".clase-banner") && irA(`materia/${e.target.dataset.ver}`);
}

async function materia(vista, param) {
  await cargar();
  const id = Number(param);
  async function pintar(animar = true) {
    let c;
    try {
      c = (await api("GET", `/api/estudiante/matriculas/${id}`)).comprobante;
    } catch {
      tituloPagina("Matrícula no encontrada");
      vista.innerHTML = `<div class="panel glass">${vacioHTML("Esta matrícula ya no existe", "Puede que la hayas retirado.", `<a class="boton-solido" href="#/asignaturas">Volver a mis materias</a>`)}</div>`;
      return;
    }
    tituloPagina(c.NombreMateria);
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>${esc(c.NombreMateria)}</h2><p>${codigoCurso(c.IdGrupo)} · ${esc(c.Profesor || "Profesor por asignar")} · ${horarioCorto(c.Horario, "")}</p></div>
        <a class="boton-vidrio" href="#/asignaturas">← Mis materias</a></div>
      <div class="rejilla-panel">
        <div class="columna">${comprobanteHTML(c)}</div>
        <div class="columna">
          <section class="panel glass"><div class="panel-cabeza"><h3>Calificación</h3></div>
            <div class="clase-nota"><div>${chipEstado(c)}</div><b class="${c.NotaFinal == null ? "vacia" : ""}" style="font-size:30px">${c.NotaFinal == null ? "—" : numero(c.NotaFinal, 1)}</b></div>
            <p class="tenue" style="margin:10px 0 0;font-size:12.5px">La publica ${esc(c.Profesor || "el profesor")}. Te llegará una notificación en vivo.</p></section>
          <section class="panel glass"><div class="panel-cabeza"><h3>Ocupación del curso</h3></div>${cupoHTML(c.Inscritos, c.Cupo)}
            <p class="tenue" style="margin:10px 0 0;font-size:12.5px">${c.OtrosGrupos ? `${c.OtrosGrupos} curso(s) más de esta materia disponibles para cambio.` : "Esta materia tiene un solo curso abierto."}</p></section>
        </div>
      </div>`;
    if (animar) entrarEnCascada(".pagina-cabeza, .comprobante, .panel", vista, 60);
  }
  vista.onclick = (e) => accionesComunes(e, () => (datos.materias.some((m) => m.IdMatricula === id) ? pintar(false) : irA("asignaturas")));
  await pintar();
  return {
    async alEvento(ev) {
      if (!ev.paraMi || !RELEVANTES.includes(ev.accion)) return;
      await cargar();
      await pintar(false);
    },
  };
}

async function perfil(vista) {
  await cargar();
  const e = datos.estudiante;
  tituloPagina("Perfil");
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>${esc(nombreCompleto(e))}</h2><p>Estudiante · documento ${esc(e.IdEstudiante)}</p></div></div>
    <div class="rejilla-panel">
      <form class="panel glass" id="perfil" novalidate>
        <div class="panel-cabeza"><h3>Datos personales</h3></div>
        <div class="formulario">
          <div class="dos"><label class="campo">Documento<input value="${esc(e.IdEstudiante)}" readonly></label>
            <label class="campo">Fecha de nacimiento<input value="${esc(e.FechaNacimiento || "")}" readonly></label></div>
          <label class="campo">Correo institucional<input value="${esc(e.CorreoEstudiante || "")}" readonly></label>
          <div class="dos"><label class="campo">Teléfono<input name="telefono" inputmode="tel" maxlength="15" value="${esc(e.Telefono || "")}"></label>
            <label class="campo">Dirección<input name="direccion" maxlength="80" value="${esc(e.Direccion || "")}"></label></div>
          <p class="error-texto" role="alert"></p>
          <div><button class="boton-solido" type="submit"><span>Guardar cambios</span></button></div>
        </div>
      </form>
      <section class="panel glass"><div class="panel-cabeza"><h3>Tu cuenta</h3></div>
        <div class="opcion-pref"><div><strong>${esc(estado.usuario.correo)}</strong><span>Correo de acceso</span></div></div>
        <div class="opcion-pref"><div><strong>Preferencias</strong><span>Tema: menú de tu cuenta, arriba a la derecha</span></div></div>
        <div class="opcion-pref"><div><strong>¿Olvidaste tu contraseña?</strong><span>La administración la restablece desde su consola</span></div></div>
      </section>
    </div>`;
  entrarEnCascada(".pagina-cabeza, .panel", vista, 60);
  $("#perfil", vista).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const boton = $("button[type=submit]", form);
    const telefono = form.telefono.value.trim();
    if (!/^[0-9 ]{7,15}$/.test(telefono)) {
      $(".error-texto", form).textContent = "Teléfono: solo números, de 7 a 15 dígitos";
      return sacudir(form);
    }
    boton.disabled = true;
    boton.classList.add("cargando");
    try {
      await api("PATCH", "/api/estudiante/contacto", { telefono, direccion: form.direccion.value.trim() });
      $(".error-texto", form).textContent = "";
      aviso("Datos actualizados", "Tus cambios quedaron guardados");
    } catch (err) {
      $(".error-texto", form).textContent = err.message;
      sacudir(form);
    } finally {
      boton.disabled = false;
      boton.classList.remove("cargando");
    }
  });
  return null;
}

export const rutasEstudiante = { asignaturas: materias, inscripcion, materia, perfil };
export { panel as panelEstudiante };

/** Abre la confirmación de inscripción de un curso desde otra sección (p. ej. Horarios ideales). */
export async function inscribirCurso(idGrupo, alTerminar) {
  await cargar();
  const g = datos.disponibles.find((x) => x.IdGrupo === Number(idGrupo));
  if (!g) return aviso("Ese curso ya no está disponible", "", "error");
  confirmarInscripcion(g, alTerminar);
}
