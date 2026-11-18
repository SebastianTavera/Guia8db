// Campus — secciones académicas y trámites: horario, históricos, registro académico,
// certificados, orden de matrícula, pagos en línea (simulados) y contrato.
import { $, $$, ICONOS, aviso, dur, esc, sacudir } from "./comun.js";
import {
  IC, codigoCurso, horarioCorto, abrirModal, api, conPeriodo, documentoHTML, entrarEnCascada, estado, fechaHora, fechaLarga, imprimir, moneda, numero,
  tituloPagina, tono, vacioHTML,
} from "./campus.js";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Una sola acción para imprimir o guardar en PDF; si hay otra acción principal (p. ej. pagar), esta pasa a secundaria
const barraDocumento = (extra = "") => `<div class="barra-documento no-imprimir">${extra}
  <button class="${extra ? "boton-vidrio" : "boton-solido"}" type="button" data-imprimir title="Imprimir o guardar como PDF">${IC.imprimir} Imprimir o PDF</button></div>`;
const avisoPDF = () => aviso("Guardar como PDF", "En la ventana de impresión elige «Guardar como PDF»");

function estadoCurso(m) {
  if (m.EstadoCurso === "Aprobado") return `<span class="chip verde"><i></i>Aprobado</span>`;
  if (m.EstadoCurso === "Reprobado") return `<span class="chip alerta"><i></i>Reprobado</span>`;
  if (m.NotaFinal != null) return m.NotaFinal >= 3 ? `<span class="chip verde"><i></i>Aprobando</span>` : `<span class="chip alerta"><i></i>En riesgo</span>`;
  return `<span class="chip"><i></i>En curso</span>`;
}

function filaDatos(pares) {
  return `<dl class="datos-doc">${pares.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

// ------------------------------------------------------------------ horario semanal
export function semanaHTML(materias, { sugeridos = [] } = {}) {
  const bloques = materias.flatMap((m) => (m.Bloques || []).map((b) => ({ ...b, m })))
    .concat(sugeridos.flatMap((m) => (m.Bloques || []).map((b) => ({ ...b, m, sugerido: true }))));
  const desde = Math.min(7 * 60, ...bloques.map((b) => Math.floor(b.inicio / 60) * 60));
  const hasta = Math.max(19 * 60, ...bloques.map((b) => Math.ceil(b.fin / 60) * 60));
  const horas = [];
  for (let h = desde; h <= hasta; h += 60) horas.push(h);
  const alto = 46;
  const hoy = new Date().getDay(); // 0 domingo
  const ahora = new Date().getHours() * 60 + new Date().getMinutes();
  const choque = (b) => bloques.some((o) => o !== b && !o.sugerido && !b.sugerido && o.dia === b.dia && o.inicio < b.fin && b.inicio < o.fin);
  return `<div class="tabla-envoltura"><div class="semana" style="--hora-alto:${alto}px">
    <div class="semana-cabeza"></div>${DIAS.map((d, i) => `<div class="semana-cabeza ${hoy === i + 1 ? "hoy" : ""}">${d}</div>`).join("")}
    <div class="semana-horas" style="height:${(horas.length - 1) * alto}px">${horas.slice(0, -1).map((h) => `<span>${hhmm(h)}</span>`).join("")}</div>
    ${DIAS.map((_, i) => `<div class="semana-dia ${hoy === i + 1 ? "hoy" : ""}" style="height:${(horas.length - 1) * alto}px">
      ${bloques.filter((b) => b.dia === i + 1).map((b) => `<div class="bloque-clase ${b.sugerido ? "sugerido" : ""} ${choque(b) ? "choque" : ""}" data-tono="${tono(b.m.IdMateria ?? b.m.IdGrupo)}"
        style="top:${((b.inicio - desde) / 60) * alto + 2}px;height:${((b.fin - b.inicio) / 60) * alto - 4}px" title="${esc(b.m.NombreMateria)} · ${hhmm(b.inicio)}–${hhmm(b.fin)}">
        <b>${esc(b.m.NombreMateria)}</b><span>${hhmm(b.inicio)}–${hhmm(b.fin)} · ${codigoCurso(b.m.IdGrupo)}${b.sugerido ? " · sugerido" : ""}</span></div>`).join("")}
      ${hoy === i + 1 && ahora >= desde && ahora <= hasta ? `<span class="linea-ahora" style="top:${((ahora - desde) / 60) * alto}px"></span>` : ""}
    </div>`).join("")}
  </div></div>`;
}

async function horario(vista) {
  const esProfesor = estado.usuario.rol === "profesor";
  const r = await api("GET", conPeriodo(esProfesor ? "/api/profesor/horario" : "/api/estudiante/horario"));
  const sinHorario = r.materias.filter((m) => !m.Bloques.length);
  const horasSemana = r.materias.reduce((s, m) => s + m.Bloques.reduce((t, b) => t + (b.fin - b.inicio), 0), 0) / 60;
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>Horario</h2><p>Período ${esc(r.periodo)} · ${r.materias.length} ${esProfesor ? "cursos a cargo" : "materias inscritas"} · ${numero(horasSemana, 0)} horas por semana</p></div>
      <button class="boton-vidrio" type="button" data-imprimir>${IC.imprimir} Imprimir horario</button></div>
    <section class="panel glass">
      ${r.materias.length ? semanaHTML(r.materias) : vacioHTML("No hay clases en este período", esProfesor ? "No tienes cursos asignados en este período." : "Inscribe materias para ver tu horario.", esProfesor ? "" : `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}
      ${r.materias.length ? `<div class="leyenda">${r.materias.map((m) => `<span><i class="bloque-clase" style="position:static;padding:0" data-tono="${tono(m.IdMateria ?? m.IdGrupo)}"></i>${esc(m.NombreMateria)} · ${horarioCorto(m.Horario, "")}</span>`).join("")}</div>` : ""}
      ${sinHorario.length ? `<div class="nota-aviso">${IC.aviso}<span>Sin horario reconocible: ${sinHorario.map((m) => esc(m.NombreMateria)).join(", ")}.</span></div>` : ""}
    </section>`;
  vista.onclick = (e) => e.target.closest("[data-imprimir]") && imprimir();
  entrarEnCascada(".pagina-cabeza, .panel, .bloque-clase", vista, 30);
  return null;
}

// ------------------------------------------------------------------ históricos (por período)
async function historicos(vista) {
  const r = await api("GET", "/api/estudiante/registro");
  const maximo = 5;
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>Históricos</h2><p>Tu desempeño período a período. Promedios ponderados por créditos.</p></div></div>
    <section class="kpis">
      <article class="kpi glass destacado"><span class="etiqueta">Promedio acumulado</span><span class="valor">${numero(r.resumen.promedioPonderado)}</span><span class="sub">Ponderado por créditos</span><span class="icono">${IC.grafico}</span></article>
      <article class="kpi glass"><span class="etiqueta">Períodos</span><span class="valor">${r.periodos.length}</span><span class="sub">Cursados</span><span class="icono">${IC.historico}</span></article>
      <article class="kpi glass"><span class="etiqueta">Créditos aprobados</span><span class="valor">${r.resumen.creditosAprobados}</span><span class="sub">de ${r.resumen.creditosCursados} cursados</span><span class="icono">${IC.creditos}</span></article>
      <article class="kpi glass"><span class="etiqueta">Materias aprobadas</span><span class="valor">${r.resumen.materiasAprobadas}</span><span class="sub">de ${r.resumen.materiasTotal}</span><span class="icono">${IC.libros}</span></article>
    </section>
    <section class="panel glass"><div class="panel-cabeza"><h3>Promedio por período</h3></div>
      ${r.periodos.length ? `<div class="grafica">${r.periodos.map((p) => `<div class="barra-grafica"><b>${numero(p.promedio)}</b>
        <div class="columna-g" data-alto="${p.promedio ? (p.promedio / maximo) * 100 : 2}"></div><span>${esc(p.periodo)}</span></div>`).join("")}</div>` : vacioHTML("Sin historial", "Aún no tienes materias registradas.")}
    </section>
    ${r.periodos.slice().reverse().map((p) => `<section class="panel glass" style="margin-top:16px"><div class="panel-cabeza"><h3>Período ${esc(p.periodo)}</h3>
        <span class="chip ${p.promedio != null && p.promedio < 3 ? "solido" : "rojo"}">Promedio ${numero(p.promedio)} · ${p.creditos} créditos</span></div>
      <div class="tabla-envoltura"><table class="tabla tabla-responsiva"><thead><tr><th>Materia</th><th>Docente</th><th class="num">Créditos</th><th>Estado</th><th class="num">Nota</th></tr></thead>
        <tbody>${p.materias.map((m) => `<tr><td><strong>${esc(m.NombreMateria)}</strong><span class="sub">${codigoCurso(m.IdGrupo)} · ${esc(m.NombrePrograma)}</span></td>
          <td class="ocultable">${esc(m.Profesor || "—")}</td><td class="num ocultable">${m.CreditosMateria}</td><td>${estadoCurso(m)}</td><td class="num"><strong>${numero(m.NotaFinal, 1)}</strong></td></tr>`).join("")}</tbody></table></div></section>`).join("")}`;
  entrarEnCascada(".pagina-cabeza, .kpi, .panel", vista, 40);
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".columna-g", vista).forEach((c) => (c.style.height = `${c.dataset.alto}%`))));
  return null;
}

// ------------------------------------------------------------------ registro académico
async function registro(vista) {
  const r = await api("GET", "/api/estudiante/registro");
  const e = r.estudiante;
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>Registro académico</h2><p>Expediente completo con todas tus materias, notas y créditos.</p></div></div>
    ${barraDocumento()}
    ${documentoHTML({
      titulo: "Registro académico", numero: e.IdEstudiante, etiqueta: "Documento",
      cuerpo: `${filaDatos([["Estudiante", esc(e.NombreCompleto)], ["Documento", esc(e.IdEstudiante)], ["Correo", esc(e.CorreoEstudiante)],
          ["Programa(s)", esc(r.programas.join(", ") || "—")], ["Promedio ponderado", `<b style="color:#c8102e">${numero(r.resumen.promedioPonderado)}</b>`],
          ["Créditos", `${r.resumen.creditosAprobados} aprobados de ${r.resumen.creditosCursados}`]])}
        ${r.periodos.map((p) => `<h4>Período ${esc(p.periodo)}</h4>
          <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Código</th><th>Materia</th><th class="num">Créd.</th><th>Estado</th><th class="num">Nota</th></tr></thead>
          <tbody>${p.materias.map((m) => `<tr><td>${m.IdMateria}-${m.IdGrupo}</td><td>${esc(m.NombreMateria)}</td><td class="num">${m.CreditosMateria}</td>
            <td>${esc(m.EstadoCurso && m.EstadoCurso !== "Sin evaluar" ? m.EstadoCurso : m.NotaFinal != null ? "Calificada" : "En curso")}</td><td class="num">${numero(m.NotaFinal, 1)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="2">Promedio del período</td><td class="num">${p.creditos}</td><td></td><td class="num">${numero(p.promedio)}</td></tr></tfoot></table></div>`).join("")}`,
    })}`;
  vista.onclick = (ev) => ev.target.closest("[data-imprimir]") && (avisoPDF(), imprimir());
  entrarEnCascada(".pagina-cabeza, .barra-documento, .documento", vista, 60);
  return null;
}

// ------------------------------------------------------------------ certificados
function certificadoHTML(c) {
  const d = c.datos;
  const url = `${location.origin}/#/verificar/${c.codigo}`;
  let cuerpo = `<p>La plataforma académica <b>Campus</b> certifica que <b>${esc(d.nombre)}</b>, identificado(a) con documento número <b>${esc(d.documento)}</b>,
    ${c.tipo === "notas" ? `cursó las siguientes asignaturas en ${esc(d.programas.join(", ") || "sus programas")}, con los resultados que se relacionan:`
      : `se encuentra matriculado(a) en el período académico <b>${esc(d.periodo)}</b> en ${esc(d.programas.join(", ") || "sus programas")}, con ${d.creditos} créditos inscritos en las siguientes asignaturas:`}</p>`;
  if (c.tipo === "notas") {
    cuerpo += `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Asignatura</th><th>Período</th><th class="num">Créd.</th><th class="num">Nota</th></tr></thead>
      <tbody>${d.materias.map((m) => `<tr><td>${esc(m.NombreMateria)}</td><td>${esc(m.Periodo || "")}</td><td class="num">${m.CreditosMateria}</td><td class="num">${numero(m.NotaFinal, 1)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Promedio ponderado</td><td class="num">${numero(d.resumen?.promedioPonderado)}</td></tr></tfoot></table></div>`;
  } else {
    cuerpo += `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Curso</th><th>Asignatura</th><th class="num">Créd.</th><th>Horario</th>${c.tipo === "matricula" ? `<th class="num">Valor</th>` : ""}</tr></thead>
      <tbody>${d.materias.map((m) => `<tr><td>${codigoCurso(m.IdGrupo)}</td><td>${esc(m.NombreMateria)}</td><td class="num">${m.CreditosMateria}</td><td>${horarioCorto(m.Horario, "")}</td>${c.tipo === "matricula" ? `<td class="num">${moneda(m.ValorMatricula || 0)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }
  cuerpo += `<p>Se expide a solicitud del interesado el ${fechaLarga(c.fecha)}.</p>
    <div class="firma"><span class="trazo">Campus</span><span class="linea-firma">Registro y Control Académico · firma digital</span></div>`;
  return documentoHTML({ titulo: c.titulo, numero: c.codigo, etiqueta: "Código de verificación", cuerpo,
    pie: `<span class="verificacion">Verifique en <b>${esc(url)}</b></span><span>Emitido ${fechaHora(c.fecha)}</span>` });
}

async function certificados(vista) {
  const TIPOS = [["estudios", "Certificado de estudios", "Acredita que estás matriculado(a) en el período actual.", IC.certificado],
    ["notas", "Certificado de notas", "Todas tus asignaturas con sus calificaciones y el promedio ponderado.", IC.registro],
    ["matricula", "Constancia de matrícula", "Detalle de las asignaturas inscritas y su valor.", IC.orden]];
  async function lista() {
    const { certificados: c } = await api("GET", "/api/estudiante/certificados");
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Certificados académicos</h2><p>Se generan al instante con un código único que cualquiera puede verificar en <b>Verificar certificado</b>.</p></div></div>
      <div class="tarjetas-servicio">${TIPOS.map(([id, t, d, ic]) => `<article class="servicio glass"><div class="servicio-cabeza"><span class="tipo-icono">${ic}</span>
        <div><h3>${t}</h3><p>${d}</p></div></div><button class="boton-solido" type="button" data-emitir="${id}"><span>Generar certificado</span></button></article>`).join("")}</div>
      <section class="panel glass" style="margin-top:16px"><div class="panel-cabeza"><h3>Certificados emitidos</h3></div>
        ${c.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Tipo</th><th>Código</th><th>Emitido</th><th></th></tr></thead>
          <tbody>${c.map((x) => `<tr><td><strong>${esc(x.titulo)}</strong></td><td style="font-family:ui-monospace,monospace">${esc(x.codigo)}</td><td class="tenue">${fechaHora(x.fecha)}</td>
            <td class="num"><button class="boton-vidrio" type="button" data-ver="${esc(x.codigo)}">Ver</button></td></tr>`).join("")}</tbody></table></div>`
          : vacioHTML("Aún no has generado certificados", "Elige un tipo arriba para generar el primero.")}</section>`;
    entrarEnCascada(".pagina-cabeza, .servicio, .panel", vista, 40);
  }
  async function ver(codigo) {
    const { certificado } = await api("GET", `/api/estudiante/certificados/${encodeURIComponent(codigo)}`);
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>${esc(certificado.titulo)}</h2><p>Código ${esc(certificado.codigo)}</p></div>
      <button class="boton-vidrio" type="button" data-volver>← Certificados</button></div>${barraDocumento()}${certificadoHTML(certificado)}`;
    entrarEnCascada(".pagina-cabeza, .barra-documento, .documento", vista, 50);
  }
  vista.onclick = async (e) => {
    const emitir = e.target.closest("[data-emitir]");
    const verB = e.target.closest("[data-ver]");
    if (e.target.closest("[data-imprimir]")) return avisoPDF(), imprimir();
    if (e.target.closest("[data-volver]")) return lista();
    if (verB) return ver(verB.dataset.ver);
    if (emitir) {
      emitir.disabled = true;
      emitir.classList.add("cargando");
      try {
        const { certificado } = await api("POST", "/api/estudiante/certificados", { tipo: emitir.dataset.emitir });
        aviso("Certificado generado", `${certificado.titulo} · ${certificado.codigo}`);
        await ver(certificado.codigo);
      } catch (err) {
        aviso("No se pudo generar", err.message, "error");
        emitir.disabled = false;
        emitir.classList.remove("cargando");
      }
    }
  };
  await lista();
  return null;
}

// ------------------------------------------------------------------ orden de matrícula
async function orden(vista) {
  const r = await api("GET", conPeriodo("/api/estudiante/orden"));
  const e = r.estudiante;
  const vencida = r.saldo > 0 && r.fechaLimite < new Date().toISOString().slice(0, 10);
  const sello = !r.materias.length ? "" : r.saldo <= 0 ? `<span class="sello-pagado">PAGADA</span>` : `<span class="sello-pagado sello-pendiente">${vencida ? "VENCIDA" : "PENDIENTE"}</span>`;
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>Orden de matrícula</h2><p>Liquidación del período ${esc(r.periodo)} con tu referencia de pago.</p></div></div>
    ${barraDocumento(r.saldo > 0 ? `<a class="boton-solido" href="#/pagos">${IC.pagos} Pagar en línea</a>` : "")}
    ${r.materias.length ? documentoHTML({
      titulo: "Orden de matrícula", numero: r.referencia, etiqueta: "Referencia de pago",
      cuerpo: `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">${filaDatos([["Estudiante", esc(e.NombreCompleto)], ["Documento", esc(e.IdEstudiante)], ["Período", esc(r.periodo)],
          ["Emitida", fechaLarga(r.emitida)], ["Fecha límite de pago", `<b style="color:${vencida ? "#c8102e" : "inherit"}">${fechaLarga(r.fechaLimite)}</b>`], ["Estado", r.saldo <= 0 ? "Pagada" : vencida ? "Vencida" : "Pendiente de pago"]])}${sello}</div>
        <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Curso</th><th>Asignatura</th><th>Programa</th><th class="num">Créditos</th><th class="num">Valor</th></tr></thead>
          <tbody>${r.materias.map((m) => `<tr><td>${codigoCurso(m.IdGrupo)}</td><td>${esc(m.NombreMateria)}</td><td>${esc(m.NombrePrograma)}</td><td class="num">${m.CreditosMateria}</td><td class="num">${moneda(m.ValorMatricula || 0)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="3">Total matrícula</td><td class="num">${r.materias.reduce((s, m) => s + m.CreditosMateria, 0)}</td><td class="num">${moneda(r.total)}</td></tr>
            <tr><td colspan="4">Pagos aplicados</td><td class="num">− ${moneda(r.pagado)}</td></tr>
            <tr><td colspan="4">Saldo a pagar</td><td class="num" style="color:#c8102e">${moneda(r.saldo)}</td></tr></tfoot></table></div>
        <p style="font-size:12.5px;color:#6b6b72">Valor por asignatura: $200.000 + $250.000 por crédito . Paga en línea con la referencia de esta orden.</p>`,
    }) : `<div class="panel glass">${vacioHTML("No hay materias en este período", "Inscribe materias para generar tu orden de matrícula.", `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}</div>`}`;
  vista.onclick = (ev) => ev.target.closest("[data-imprimir]") && (avisoPDF(), imprimir());
  entrarEnCascada(".pagina-cabeza, .barra-documento, .documento, .panel", vista, 50);
  return { alEvento: (ev) => ev.paraMi && ["pago", "matricula", "matricula_retirada"].includes(ev.accion) && orden(vista) };
}

// ------------------------------------------------------------------ pagos en línea (pasarela simulada)
function reciboHTML(p, e) {
  return documentoHTML({
    titulo: "Recibo de pago", numero: p.Referencia, etiqueta: "Referencia",
    cuerpo: `<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">${filaDatos([["Estudiante", esc(e?.NombreCompleto || estado.usuario.nombre)],
        ["Documento", esc(e?.IdEstudiante || "")], ["Fecha", fechaHora(p.Fecha)], ["Método", esc(p.Metodo)], ["Entidad", esc(p.Banco || "—")], ["Estado", esc(p.Estado)]])}
      <span class="sello-pagado">${p.Estado === "Aprobado" ? "APROBADO" : "RECHAZADO"}</span></div>
      <div class="tabla-envoltura"><table class="tabla"><tbody><tr><td>Pago de matrícula</td><td class="num"><b>${moneda(p.Valor)}</b></td></tr></tbody></table></div>
      <p style="font-size:12px;color:#6b6b72">Pasarela de pago <b>simulada</b> para el proyecto académico: no se realizó ningún cobro real.</p>`,
  });
}

async function pagos(vista) {
  const BANCOS = ["Banco Andino (demo)", "Banco del Valle (demo)", "Cooperativa Central (demo)", "Banco Capital (demo)"];
  async function pintar() {
    const r = await api("GET", conPeriodo("/api/estudiante/pagos"));
    vista.innerHTML = `
      <div class="pagina-cabeza"><div><h2>Pagos en línea</h2><p>Estado de cuenta del período ${esc(r.periodo)}.</p></div></div>
      <section class="kpis">
        <article class="kpi glass"><span class="etiqueta">Total matrícula</span><span class="valor">${moneda(r.total)}</span><span class="sub">${r.materias} materias</span><span class="icono">${IC.orden}</span></article>
        <article class="kpi glass"><span class="etiqueta">Pagado</span><span class="valor">${moneda(r.pagado)}</span><span class="sub">${r.pagos.length} pagos</span><span class="icono">${IC.pagos}</span></article>
        <article class="kpi glass destacado"><span class="etiqueta">Saldo pendiente</span><span class="valor">${moneda(r.saldo)}</span><span class="sub">${r.saldo ? "Por pagar" : "¡Al día!"}</span><span class="icono">${IC.dinero}</span></article>
      </section>
      <div class="rejilla-panel">
        <form class="panel glass" id="form-pago" novalidate>
          <div class="panel-cabeza"><h3>Realizar un pago</h3><span class="chip rojo">Pasarela simulada</span></div>
          ${r.saldo > 0 ? `<div class="formulario">
            <div class="metodos">${[["PSE", "PSE · débito", IC.dinero], ["Tarjeta", "Tarjeta", IC.pagos], ["Efectivo", "Efectivo", IC.orden]].map(([v, t, ic], i) =>
              `<label class="metodo"><input type="radio" name="metodo" value="${v}" ${i === 0 ? "checked" : ""}>${ic}<span>${t}</span></label>`).join("")}</div>
            <div class="dos"><label class="campo">Entidad<span class="selector" style="display:block"><select name="banco" style="width:100%">${BANCOS.map((b) => `<option>${b}</option>`).join("")}</select></span></label>
              <label class="campo">Valor a pagar<input name="valor" inputmode="numeric" value="${r.saldo}"></label></div>
            <p class="aviso-simulado">${ICONOS.candado} Simulación académica: no se piden datos de tarjeta ni se realiza ningún cobro real.</p>
            <p class="error-texto" role="alert"></p>
            <div><button class="boton-solido grande" type="submit"><span>Pagar ${moneda(r.saldo)}</span></button></div></div>`
          : vacioHTML("No tienes saldo pendiente", "Tu matrícula de este período está al día.")}
        </form>
        <section class="panel glass"><div class="panel-cabeza"><h3>Historial de pagos</h3></div>
          ${r.pagos.length ? `<div class="tabla-envoltura"><table class="tabla"><tbody>${r.pagos.map((p) => `<tr><td><strong>${moneda(p.Valor)}</strong><span class="sub">${esc(p.Referencia)} · ${fechaHora(p.Fecha)}</span></td>
            <td class="num"><button class="boton-vidrio" type="button" data-recibo="${esc(p.Referencia)}">Recibo</button></td></tr>`).join("")}</tbody></table></div>`
            : `<p class="tenue">Aún no hay pagos en este período.</p>`}</section>
      </div>`;
    entrarEnCascada(".pagina-cabeza, .kpi, .panel", vista, 40);
    const form = $("#form-pago", vista);
    form.querySelector("input[name=valor]")?.addEventListener("input", (e) => {
      const v = Number(String(e.target.value).replace(/\D/g, "")) || 0;
      $("button[type=submit] span", form).textContent = `Pagar ${moneda(v)}`;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form).entries());
      const valor = Number(String(d.valor).replace(/\D/g, ""));
      if (!valor || valor > r.saldo) {
        $(".error-texto", form).textContent = `El valor debe estar entre $1 y ${moneda(r.saldo)}`;
        return sacudir(form);
      }
      const b = $("button[type=submit]", form);
      b.disabled = true;
      b.classList.add("cargando");
      $("span", b).textContent = "Conectando con la pasarela…";
      await new Promise((ok) => setTimeout(ok, dur(900)));
      try {
        const res = await api("POST", "/api/estudiante/pagos", { periodo: r.periodo, valor, metodo: d.metodo, banco: d.metodo === "Efectivo" ? "Punto de recaudo (demo)" : d.banco });
        aviso("Pago aprobado", `${moneda(res.pago.Valor)} · ${res.pago.Referencia}`);
        const { modal } = abrirModal(`${reciboHTML(res.pago, res.estudiante)}<div class="modal-pie"><button class="boton-vidrio" type="button" data-imprimir-modal>${IC.imprimir} Imprimir recibo</button>
          <button class="boton-solido" type="button" data-cerrar>Listo</button></div>`, { clase: "modal-documento", alCerrar: pintar });
        modal.style.width = "min(820px, 100%)";
        modal.addEventListener("click", (ev) => ev.target.closest("[data-imprimir-modal]") && imprimir(true));
      } catch (err) {
        $(".error-texto", form).textContent = err.message;
        sacudir(form);
        b.disabled = false;
        b.classList.remove("cargando");
        $("span", b).textContent = `Pagar ${moneda(valor)}`;
      }
    });
    vista.onclick = (e) => {
      const rec = e.target.closest("[data-recibo]");
      if (!rec) return;
      const p = r.pagos.find((x) => x.Referencia === rec.dataset.recibo);
      const { modal } = abrirModal(`${reciboHTML(p, null)}<div class="modal-pie"><button class="boton-vidrio" type="button" data-imprimir-modal>${IC.imprimir} Imprimir</button>
        <button class="boton-solido" type="button" data-cerrar>Cerrar</button></div>`);
      modal.style.width = "min(820px, 100%)";
      modal.addEventListener("click", (ev) => ev.target.closest("[data-imprimir-modal]") && imprimir(true));
    };
  }
  await pintar();
  return null;
}

// ------------------------------------------------------------------ contrato de matrícula
async function contrato(vista) {
  const r = await api("GET", conPeriodo("/api/estudiante/contrato"));
  const e = r.estudiante;
  const clausulas = [
    ["Objeto", `La plataforma Campus presta el servicio educativo en las asignaturas relacionadas para el período ${esc(r.periodo)}.`],
    ["Valor", `El estudiante se obliga a pagar ${moneda(r.total)} según la orden de matrícula del período, dentro de la fecha límite indicada.`],
    ["Obligaciones del estudiante", "Cumplir el reglamento estudiantil, asistir a las clases y presentar las evaluaciones en las fechas establecidas."],
    ["Retiro de asignaturas", "Podrá retirar una asignatura mientras no tenga nota final ni cierre de curso; el cupo se libera de inmediato."],
    ["Datos personales", "El estudiante autoriza el tratamiento de sus datos para fines académicos y administrativos, conforme a la ley de protección de datos."],
  ];
  vista.innerHTML = `
    <div class="pagina-cabeza"><div><h2>Contrato de matrícula</h2><p>Período ${esc(r.periodo)} · léelo, fírmalo y descárgalo en PDF.</p></div></div>
    ${barraDocumento()}
    ${r.materias.length ? documentoHTML({
      titulo: "Contrato de matrícula", numero: r.firma ? r.firma.codigo : "Sin firmar", etiqueta: r.firma ? "Firma digital" : "Estado",
      cuerpo: `${filaDatos([["Estudiante", esc(e.NombreCompleto)], ["Documento", esc(e.IdEstudiante)], ["Período", esc(r.periodo)], ["Programa(s)", esc(r.programas.join(", "))],
          ["Asignaturas", r.materias.length], ["Valor total", moneda(r.total)]])}
        ${clausulas.map(([t, c], i) => `<p><b>Cláusula ${i + 1}. ${t}.</b> ${c}</p>`).join("")}
        <div class="firma">${r.firma ? `<span class="trazo">${esc(r.firma.nombre)}</span><span class="linea-firma">Firmado electrónicamente el ${fechaHora(r.firma.fecha)} · código ${esc(r.firma.codigo)}</span>`
          : `<span class="linea-firma">Firma del estudiante (pendiente)</span>`}</div>`,
    }) : `<div class="panel glass">${vacioHTML("No hay materias en este período", "El contrato se genera cuando inscribes materias.", `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}</div>`}
    ${r.materias.length && !r.firma ? `<form class="panel glass no-imprimir" id="firmar" style="max-width:860px;margin:16px auto 0">
      <div class="panel-cabeza"><h3>Firmar contrato</h3></div>
      <label class="check-filtro" style="height:auto;padding:12px 14px"><input type="checkbox" name="acepto"> He leído y acepto las cláusulas del contrato de matrícula.</label>
      <p class="error-texto" role="alert" style="margin-top:8px"></p>
      <button class="boton-solido" type="submit"><span>Firmar electrónicamente</span></button></form>` : ""}`;
  vista.onclick = (ev) => ev.target.closest("[data-imprimir]") && (avisoPDF(), imprimir());
  $("#firmar", vista)?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!form.acepto.checked) {
      $(".error-texto", form).textContent = "Debes aceptar las cláusulas para firmar";
      return sacudir(form);
    }
    try {
      await api("POST", "/api/estudiante/contrato/firmar", { periodo: r.periodo, acepto: true });
      aviso("Contrato firmado", "Tu firma quedó registrada");
      contrato(vista);
    } catch (err) {
      $(".error-texto", form).textContent = err.message;
      sacudir(form);
    }
  });
  entrarEnCascada(".pagina-cabeza, .barra-documento, .documento, .panel", vista, 50);
  return null;
}

export const rutasAcademico = { horario, historicos, registro, certificados, orden, pagos, contrato };
export { estadoCurso };
