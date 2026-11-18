// Campus — profesor: sus cursos (tarjetas estilo Classroom) y la página de cada curso
// con la planilla de notas y el cierre (sp_actualizar_estado_curso, usa un cursor).
import { $, $$, ICONOS, aviso, esc, sacudir } from "./comun.js";
import {
  IC, codigoCurso, horarioCorto, abrirModal, api, cupoHTML, entrarEnCascada, estado, iniciales, irA, numero, tituloPagina, tono, vacioHTML,
} from "./campus.js";

const leerNota = (texto) => {
  const t = String(texto).trim().replace(",", ".");
  if (t === "") return { ok: true, valor: null };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? { ok: true, valor: Math.round(n * 100) / 100 } : { ok: false };
};
const RELEVANTES = ["matricula", "matricula_retirada", "matricula_cambiada", "curso_cerrado", "cupo", "notas"];

function cursoTarjeta(c) {
  return `<article class="clase glass" data-tono="${tono(c.IdGrupo)}" data-grupo="${c.IdGrupo}">
    <div class="clase-banner" data-abrir="${c.IdGrupo}" role="link" tabindex="0" aria-label="Abrir ${esc(c.NombreMateria)}">
      <h3>${esc(c.NombreMateria)}</h3><small>${codigoCurso(c.IdGrupo)} · ${esc(c.Periodo || "")}</small>
      <span class="clase-avatar">${esc(iniciales(estado.usuario.nombre))}</span>
    </div>
    <div class="clase-cuerpo">
      <div class="clase-fila">${IC.reloj}<span>${horarioCorto(c.Horario, "Horario por definir")}</span></div>
      <div class="clase-fila">${IC.creditos}<span>${c.CreditosMateria} crédito${c.CreditosMateria === 1 ? "" : "s"} · ${esc(c.NombrePrograma)}</span></div>
      ${cupoHTML(c.Inscritos, c.Cupo)}
      <div class="clase-nota"><span class="tenue">Promedio del curso</span><b class="${c.Promedio == null ? "vacia" : ""}">${c.Promedio == null ? "—" : numero(c.Promedio, 1)}</b></div>
    </div>
    <div class="clase-pie"><span class="codigo">${Number(c.Pendientes) || 0} por calificar · ${Number(c.Aprobados) || 0} aprobados</span>
      <div class="acciones"><button class="boton-icono" type="button" data-abrir="${c.IdGrupo}" title="Abrir planilla" aria-label="Abrir planilla">${IC.ojo}</button></div></div>
  </article>`;
}

// ------------------------------------------------------------------ panel: mis cursos
async function panel(vista) {
  tituloPagina("Mis cursos");
  let cursos = (await api("GET", "/api/profesor/cursos")).cursos;
  function pintar(animar = true, resaltar = null) {
    const estudiantes = cursos.reduce((s, c) => s + (c.Inscritos || 0), 0);
    const pendientes = cursos.reduce((s, c) => s + (Number(c.Pendientes) || 0), 0);
    const calificadas = cursos.reduce((s, c) => s + (Number(c.Aprobados) || 0) + (Number(c.Reprobados) || 0), 0);
    const suma = cursos.reduce((s, c) => s + (c.Promedio || 0) * ((Number(c.Aprobados) || 0) + (Number(c.Reprobados) || 0)), 0);
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Hola, ${esc(estado.usuario.nombre.split(/\s+/)[0])}</h2><p>Tus cursos del periodo. Abre uno para publicar notas o cerrarlo.</p></div></div>
      <section class="kpis">
        <article class="kpi glass destacado"><span class="etiqueta">Cursos</span><span class="valor">${cursos.length}</span><span class="sub">A tu cargo</span><span class="icono">${IC.pizarra}</span></article>
        <article class="kpi glass"><span class="etiqueta">Estudiantes</span><span class="valor">${estudiantes}</span><span class="sub">En todos tus cursos</span><span class="icono">${IC.persona}</span></article>
        <article class="kpi glass"><span class="etiqueta">Por calificar</span><span class="valor">${pendientes}</span><span class="sub">${pendientes ? "Matrículas sin nota" : "Todo al día"}</span><span class="icono">${IC.libros}</span></article>
        <article class="kpi glass"><span class="etiqueta">Promedio</span><span class="valor">${calificadas ? numero(suma / calificadas) : "—"}</span><span class="sub">De las notas publicadas</span><span class="icono">${IC.grafico}</span></article>
      </section>
      ${cursos.length ? `<div class="clases">${cursos.map(cursoTarjeta).join("")}</div>`
        : `<div class="panel glass">${vacioHTML("No tienes cursos asignados", "La administración asigna los cursos desde su consola.")}</div>`}`;
    if (animar) entrarEnCascada(".pagina-cabeza, .kpi, .clase, .panel", vista, 45);
    if (resaltar) $(`.clase[data-grupo="${resaltar}"]`, vista)?.classList.add("nueva");
  }
  vista.onclick = (e) => {
    const a = e.target.closest("[data-abrir]");
    if (a) irA(`curso/${a.dataset.abrir}`);
  };
  vista.onkeydown = (e) => e.key === "Enter" && e.target.matches("[data-abrir]") && irA(`curso/${e.target.dataset.abrir}`);
  pintar();
  return {
    async alEvento(ev) {
      if (!RELEVANTES.includes(ev.accion)) return;
      cursos = (await api("GET", "/api/profesor/cursos")).cursos;
      const grupo = Number(ev.detalle?.grupo);
      pintar(false, cursos.some((c) => c.IdGrupo === grupo) ? grupo : null);
    },
  };
}

// ------------------------------------------------------------------ página del curso: planilla y cierre
async function curso(vista, param) {
  const id = Number(param);
  let cursos = (await api("GET", "/api/profesor/cursos")).cursos;
  let c = cursos.find((x) => x.IdGrupo === id);
  if (!c) {
    tituloPagina("Curso no encontrado");
    vista.innerHTML = `<div class="panel glass">${vacioHTML("Ese curso no es tuyo", "Solo puedes ver los cursos que tienes asignados.", `<a class="boton-solido" href="#/cursos">Volver a mis cursos</a>`)}</div>`;
    return null;
  }
  tituloPagina(c.NombreMateria);
  let lista = (await api("GET", `/api/profesor/cursos/${id}`)).estudiantes;
  let originales = new Map(lista.map((e) => [e.IdMatricula, e.NotaFinal]));

  const cambios = () => $$(".nota-input", vista)
    .map((i) => ({ idMatricula: Number(i.dataset.matricula), lectura: leerNota(i.value) }))
    .filter((x) => !x.lectura.ok || x.lectura.valor !== (originales.get(x.idMatricula) ?? null));

  function chip(e) {
    if (e.EstadoCurso === "Aprobado") return `<span class="chip verde"><i></i>Aprobado</span>`;
    if (e.EstadoCurso === "Reprobado") return `<span class="chip alerta"><i></i>Reprobado</span>`;
    if (e.EstadoCurso === "Pendiente") return `<span class="chip"><i></i>Pendiente</span>`;
    return `<span class="chip rojo"><i></i>${e.NotaFinal == null ? "Inscrito" : "Calificado"}</span>`;
  }

  function pintar(animar = true, nuevos = []) {
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>${esc(c.NombreMateria)}</h2><p>${codigoCurso(c.IdGrupo)} · ${horarioCorto(c.Horario, "Horario por definir")} · ${esc(c.NombrePrograma)} · ${c.CreditosMateria} crédito${c.CreditosMateria === 1 ? "" : "s"}</p></div>
        <div style="display:flex;gap:8px"><a class="boton-vidrio" href="#/cursos">← Mis cursos</a><button class="boton-solido neutro" type="button" data-accion-curso="cerrar">Cerrar curso</button></div></div>
      <section class="kpis">
        <article class="kpi glass destacado"><span class="etiqueta">Estudiantes</span><span class="valor">${c.Inscritos}</span><span class="sub">${c.Cupo == null ? "Cupo sin límite" : `de ${c.Cupo} cupos`}</span><span class="icono">${IC.persona}</span></article>
        <article class="kpi glass"><span class="etiqueta">Promedio</span><span class="valor">${c.Promedio == null ? "—" : numero(c.Promedio, 1)}</span><span class="sub">Del curso</span><span class="icono">${IC.grafico}</span></article>
        <article class="kpi glass"><span class="etiqueta">Aprobados</span><span class="valor">${Number(c.Aprobados) || 0}</span><span class="sub">Nota ≥ 3,0</span><span class="icono">${IC.creditos}</span></article>
        <article class="kpi glass"><span class="etiqueta">Por calificar</span><span class="valor">${Number(c.Pendientes) || 0}</span><span class="sub">Sin nota</span><span class="icono">${IC.libros}</span></article>
      </section>
      <section class="panel glass">
        <div class="panel-cabeza"><h3>Planilla de notas</h3><span class="tenue" style="font-size:12px">0,0 a 5,0 · vacía = sin calificar · Enter pasa al siguiente</span></div>
        <div id="resultado"></div>
        ${lista.length ? `<div class="tabla-envoltura"><table class="tabla tabla-notas">
          <thead><tr><th>#</th><th>Estudiante</th><th>Documento</th><th>Matrícula</th><th>Estado</th><th class="num">Nota final</th></tr></thead>
          <tbody>${lista.map((e, i) => `<tr data-matricula="${e.IdMatricula}" class="${nuevos.includes(e.IdMatricula) ? "actualizada" : ""}">
            <td class="tenue">${i + 1}</td>
            <td><strong>${esc(e.Nombre)}</strong><span class="sub">${esc(e.CorreoEstudiante || "")}</span></td>
            <td class="tenue">${esc(e.IdEstudiante)}</td>
            <td class="tenue">MAT-${String(e.IdMatricula).padStart(6, "0")}</td>
            <td>${chip(e)}</td>
            <td class="num"><input class="nota-input" inputmode="decimal" data-matricula="${e.IdMatricula}" value="${e.NotaFinal == null ? "" : numero(e.NotaFinal, 1)}" aria-label="Nota de ${esc(e.Nombre)}" placeholder="—"></td>
          </tr>`).join("")}</tbody></table></div>` : vacioHTML("Aún no hay estudiantes", "Aparecerán aquí en vivo cuando se inscriban.")}
        <div class="barra-guardar glass glass-fuerte">
          <span class="cambios" id="cambios">Sin cambios</span>
          <button class="boton-texto" type="button" data-accion-curso="descartar">Descartar</button>
          <button class="boton-solido" type="button" data-accion-curso="guardar" disabled><span>Guardar notas</span></button>
        </div>
      </section>`;
    if (animar) entrarEnCascada(".pagina-cabeza, .kpi, .panel, .tabla-notas tbody tr", vista, 30);
    actualizarBarra();
  }

  function actualizarBarra() {
    const lista2 = cambios();
    const invalidas = lista2.filter((x) => !x.lectura.ok).length;
    const texto = $("#cambios", vista);
    if (!texto) return;
    texto.textContent = invalidas ? `${invalidas} ${invalidas === 1 ? "nota inválida" : "notas inválidas"} (0,0 a 5,0)`
      : lista2.length ? `${lista2.length} ${lista2.length === 1 ? "cambio" : "cambios"} sin guardar` : "Sin cambios";
    $("[data-accion-curso=guardar]", vista).disabled = !lista2.length || invalidas > 0;
    $$(".tabla-notas tbody tr", vista).forEach((tr) => {
      const cambio = lista2.find((x) => x.idMatricula === Number(tr.dataset.matricula));
      tr.classList.toggle("cambiada", !!cambio);
      $(".nota-input", tr)?.classList.toggle("invalida", !!cambio && !cambio.lectura.ok);
    });
  }

  async function recargar() {
    cursos = (await api("GET", "/api/profesor/cursos")).cursos;
    c = cursos.find((x) => x.IdGrupo === id) || c;
    const antes = new Set(lista.map((e) => e.IdMatricula));
    lista = (await api("GET", `/api/profesor/cursos/${id}`)).estudiantes;
    originales = new Map(lista.map((e) => [e.IdMatricula, e.NotaFinal]));
    return lista.filter((e) => !antes.has(e.IdMatricula)).map((e) => e.IdMatricula);
  }

  async function guardar(boton) {
    boton.disabled = true;
    boton.classList.add("cargando");
    try {
      const r = await api("PUT", `/api/profesor/cursos/${id}/notas`,
        { notas: cambios().map((x) => ({ idMatricula: x.idMatricula, nota: x.lectura.valor })) });
      aviso("Notas publicadas", `${r.actualizadas} ${r.actualizadas === 1 ? "estudiante notificado" : "estudiantes notificados"} en vivo`);
      await recargar();
      pintar(false);
    } catch (err) {
      aviso("No se guardaron las notas", err.message, "error");
      sacudir($(".barra-guardar", vista));
      boton.classList.remove("cargando");
      boton.disabled = false;
    }
  }

  function cerrarCurso() {
    if (cambios().length) {
      aviso("Guarda las notas primero", "El cierre usa las notas guardadas en la base de datos", "error");
      return sacudir($(".barra-guardar", vista));
    }
    const sinNota = lista.filter((e) => e.NotaFinal == null).length;
    const { modal, cerrar } = abrirModal(`
      <div class="modal-cabeza"><div><h2>Cerrar ${codigoCurso(id)}</h2><p>${esc(c.NombreMateria)} · ${lista.length} estudiantes</p></div>
        <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
      <div class="nota-aviso">${IC.aviso}<span>Al cerrar el curso, cada estudiante queda como Aprobado (nota ≥ 3,0), Reprobado o Pendiente (sin nota).${sinNota ? ` Hay <b>${sinNota}</b> sin nota: quedarán pendientes.` : ""}</span></div>
      <p class="error-texto" role="alert"></p>
      <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button>
        <button class="boton-solido" type="button" data-si><span>Cerrar curso</span></button></div>`);
    $("[data-si]", modal).addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.classList.add("cargando");
      try {
        const r = await api("POST", `/api/profesor/cursos/${id}/cerrar`);
        await cerrar();
        await recargar();
        pintar(false);
        const [, total = 0, ap = 0, rep = 0, pen = 0] = (r.mensaje.match(/(\d+) matriculas \((\d+) aprobadas, (\d+) reprobadas, (\d+) pendientes/) || []).map(Number);
        const caja = $("#resultado", vista);
        caja.innerHTML = `<div class="resultado-cierre">${[["Aprobadas", ap], ["Reprobadas", rep], ["Pendientes", pen]].map(([t, n]) =>
          `<div><b>${n}</b><span>${t}</span><i data-p="${total ? (n / total) * 100 : 0}"></i></div>`).join("")}</div>`;
        entrarEnCascada(".resultado-cierre > div", caja, 70);
        requestAnimationFrame(() => requestAnimationFrame(() => $$(".resultado-cierre i", caja).forEach((i) => (i.style.width = `${i.dataset.p}%`))));
        aviso("Curso cerrado", r.mensaje.replace(/^EXITO:\s*/, ""));
      } catch (err) {
        $(".error-texto", modal).textContent = err.message;
        sacudir(modal);
        b.disabled = false;
        b.classList.remove("cargando");
      }
    });
  }

  vista.onclick = (e) => {
    const a = e.target.closest("[data-accion-curso]")?.dataset.accionCurso;
    if (a === "guardar") guardar(e.target.closest("button"));
    else if (a === "descartar") pintar(false);
    else if (a === "cerrar") cerrarCurso();
  };
  vista.oninput = (e) => e.target.classList.contains("nota-input") && actualizarBarra();
  vista.onkeydown = (e) => {
    if (e.target.classList?.contains("nota-input") && e.key === "Enter") {
      e.preventDefault();
      const entradas = $$(".nota-input", vista);
      entradas[entradas.indexOf(e.target) + 1]?.focus();
    }
  };
  pintar();
  return {
    async alEvento(ev) {
      if (!RELEVANTES.includes(ev.accion)) return;
      const grupos = [Number(ev.detalle?.grupo), Number(ev.detalle?.anterior)];
      if (!grupos.includes(id) || cambios().length) return; // no pisar notas sin guardar
      const nuevos = await recargar();
      pintar(false, nuevos);
      if (ev.accion === "matricula" && nuevos.length) aviso("Nuevo estudiante inscrito", `${c.NombreMateria} · ${codigoCurso(id)}`);
    },
  };
}

export const rutasProfesor = { cursos: panel, curso };
