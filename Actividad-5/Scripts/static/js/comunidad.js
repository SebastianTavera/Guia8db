// Campus — comunidad: inicio (publicaciones y horarios ideales), foros, aula virtual
// y reconocimiento docente. Todo en MongoDB y con actualizaciones en vivo.
import { $, $$, ICONOS, aviso, deslizarIndicador, esc, sacudir } from "./comun.js";
import {
  IC, codigoCurso, horarioCorto, abrirModal, api, conPeriodo, entrarEnCascada, estado, fechaHora, fechaLarga, hace, iniciales, moneda, numero, tono, vacioHTML,
} from "./campus.js";
import { semanaHTML } from "./academico.js";
import { inscribirCurso, montarMisMaterias } from "./estudiante.js";

const iconoCategoria = (c) => ({ Comunicado: IC.anuncio, Calendario: IC.calendario, Bienestar: IC.reconocimiento, Evento: IC.aula, Encuesta: IC.registro })[c];

// ------------------------------------------------------------------ inicio
async function inicio(vista) {
  const rol = estado.usuario.rol;
  let pestana = rol === "estudiante" ? "materias" : "publicaciones";

  async function kpisHTML() {
    try {
      if (rol === "estudiante") {
        const d = await api("GET", "/api/estudiante/resumen");
        const pendientes = d.materias.filter((m) => m.NotaFinal == null).length;
        return `<section class="kpis">
          <article class="kpi glass destacado"><span class="etiqueta">Promedio</span><span class="valor">${numero(d.promedio)}</span><span class="sub">${esc(d.clasificacion || "Sin calificar")}</span><span class="icono">${IC.grafico}</span></article>
          <article class="kpi glass"><span class="etiqueta">Asignaturas</span><span class="valor">${d.materias.length}</span><span class="sub">${pendientes} en curso</span><span class="icono">${IC.libros}</span></article>
          <article class="kpi glass"><span class="etiqueta">Créditos</span><span class="valor">${d.creditos}</span><span class="sub">Inscritos</span><span class="icono">${IC.creditos}</span></article>
          <article class="kpi glass"><span class="etiqueta">Matrícula</span><span class="valor">${moneda(d.valor)}</span><span class="sub"><a href="#/orden" style="color:inherit">Ver orden de matrícula →</a></span><span class="icono">${IC.dinero}</span></article></section>`;
      }
      if (rol === "profesor") {
        const { cursos } = await api("GET", "/api/profesor/cursos");
        const estudiantes = cursos.reduce((s, c) => s + (c.Inscritos || 0), 0);
        const pendientes = cursos.reduce((s, c) => s + (Number(c.Pendientes) || 0), 0);
        return `<section class="kpis">
          <article class="kpi glass destacado"><span class="etiqueta">Cursos</span><span class="valor">${cursos.length}</span><span class="sub">A tu cargo</span><span class="icono">${IC.pizarra}</span></article>
          <article class="kpi glass"><span class="etiqueta">Estudiantes</span><span class="valor">${estudiantes}</span><span class="sub">En tus cursos</span><span class="icono">${IC.persona}</span></article>
          <article class="kpi glass"><span class="etiqueta">Por calificar</span><span class="valor">${pendientes}</span><span class="sub"><a href="#/cursos" style="color:inherit">Ir a mis cursos →</a></span><span class="icono">${IC.libros}</span></article></section>`;
      }
      if (rol === "general") {
        return `<section class="panel glass vincular-banda"><div><h3>¿Eres estudiante o docente?</h3>
          <p>Tu cuenta es de <b>público general</b>, por eso no ves tus asignaturas, tu horario ni los trámites. Vincúlala con tu documento y tu correo institucional y tendrás el portal completo.</p></div>
          <a class="boton-solido grande" href="#/vincular">${IC.persona} Vincular mi cuenta</a></section>`;
      }
    } catch { /* los indicadores son opcionales */ }
    return "";
  }

  async function pintar() {
    const tabs = rol === "estudiante"
      ? [["materias", "Mis materias"], ["horario", "Mi horario"], ["publicaciones", "Publicaciones"], ["ideales", "Horarios ideales"]]
      : [["publicaciones", "Publicaciones"]];
    vista.innerHTML = `${await kpisHTML()}
      <nav class="pestanas-vista" role="tablist">${tabs.map(([id, t]) => `<button type="button" role="tab" data-pestana="${id}" aria-selected="${pestana === id}">${t}</button>`).join("")}</nav>
      <div id="contenido-inicio"><p class="cargando-texto">Cargando…</p></div>`;
    entrarEnCascada(".kpi, .vincular-banda, .pestanas-vista", vista, 40);
    await pintarPestana();
  }

  async function pintarPestana() {
    const caja = $("#contenido-inicio", vista);
    caja.onclick = caja.onkeydown = null;
    if (pestana === "materias") return montarMisMaterias(caja);
    if (pestana === "horario") {
      const r = await api("GET", conPeriodo("/api/estudiante/horario"));
      caja.innerHTML = `<div class="pagina-cabeza"><div><h2>Mi horario · ${esc(r.periodo)}</h2><p>${r.materias.length} materias inscritas. Las clases de hoy están resaltadas.</p></div>
          <a class="boton-vidrio" href="#/horario">${IC.imprimir} Ver e imprimir</a></div>
        <section class="panel glass">${r.materias.length ? semanaHTML(r.materias)
          : vacioHTML("Aún no tienes clases", "Inscribe materias para ver tu horario.", `<a class="boton-solido" href="#/inscripcion">Ir a inscripción</a>`)}</section>`;
      return entrarEnCascada(".pagina-cabeza, .panel, .bloque-clase", caja, 25);
    }
    if (pestana === "publicaciones") {
      const { publicaciones } = await api("GET", "/api/publicaciones");
      caja.innerHTML = publicaciones.length ? `<div class="publicaciones">${publicaciones.map((p, i) => `
        <article class="publicacion glass ${p.destacada && i === 0 ? "destacada" : ""}" data-cat="${esc(p.categoria)}">
          <div class="publicacion-banda">${p.destacada && i === 0 ? `<span class="chip" style="background:rgb(255 255 255 / .18);color:#fff">Destacado</span><strong>${esc(p.titulo)}</strong>` : `<span class="chip" style="background:rgb(255 255 255 / .18);color:#fff">${esc(p.categoria)}</span>${iconoCategoria(p.categoria) || ""}`}</div>
          <div class="publicacion-cuerpo">${p.destacada && i === 0 ? "" : `<h3>${esc(p.titulo)}</h3>`}<p>${esc(p.cuerpo)}</p><small>${esc(p.autor)} · ${hace(p.fecha)}</small></div>
        </article>`).join("")}</div>` : `<div class="panel glass">${vacioHTML("Sin publicaciones", "La administración publica los comunicados desde su consola.")}</div>`;
      entrarEnCascada(".publicacion, .panel", caja, 50);
    } else {
      const r = await api("GET", conPeriodo("/api/estudiante/horarios-ideales"));
      const sugeridos = r.disponibles.filter((g) => r.sugerencia.includes(g.IdGrupo));
      const otros = r.disponibles.filter((g) => !r.sugerencia.includes(g.IdGrupo));
      const creditos = sugeridos.reduce((s, g) => s + g.CreditosMateria, 0);
      caja.innerHTML = `<div class="pagina-cabeza"><div><h2>Horarios ideales</h2>
          <p>La combinación de cursos disponibles <b>sin cruces</b> con tu horario actual que te da más créditos. Los bloques rayados son la sugerencia.</p></div></div>
        <section class="panel glass">${semanaHTML(r.inscritas, { sugeridos })}</section>
        <div class="rejilla-mitades" style="margin-top:16px">
          <section class="panel glass"><div class="panel-cabeza"><h3>Sugerencia · ${sugeridos.length} cursos · ${creditos} créditos</h3></div>
            ${sugeridos.length ? `<div class="tabla-envoltura"><table class="tabla"><tbody>${sugeridos.map((g) => `<tr><td><strong>${esc(g.NombreMateria)}</strong>
              <span class="sub">${codigoCurso(g.IdGrupo)} · ${esc(g.Profesor || "Por asignar")} · ${horarioCorto(g.Horario, "")}</span></td>
              <td class="num"><button class="boton-vidrio claro" type="button" data-inscribir="${g.IdGrupo}">Inscribir</button></td></tr>`).join("")}</tbody></table></div>`
              : vacioHTML("No hay más cursos compatibles", r.disponibles.length ? "Los cursos disponibles se cruzan con tu horario." : "Ya estás inscrito en todos los cursos abiertos.")}</section>
          <section class="panel glass"><div class="panel-cabeza"><h3>Otros cursos disponibles</h3></div>
            ${otros.length ? `<div class="tabla-envoltura"><table class="tabla"><tbody>${otros.map((g) => `<tr><td><strong>${esc(g.NombreMateria)}</strong>
              <span class="sub">${r.cruces[g.IdGrupo] ? `⚠ Se cruza con ${esc(r.cruces[g.IdGrupo].join(", "))}` : `${codigoCurso(g.IdGrupo)} · ${horarioCorto(g.Horario, "")}`}</span></td></tr>`).join("")}</tbody></table></div>`
              : `<p class="tenue">No hay otros cursos.</p>`}</section></div>`;
      entrarEnCascada(".pagina-cabeza, .panel, .bloque-clase", caja, 30);
    }
  }

  vista.onclick = (e) => {
    const t = e.target.closest("[data-pestana]");
    const ins = e.target.closest("[data-inscribir]");
    if (t && t.dataset.pestana !== pestana) {
      pestana = t.dataset.pestana;
      $$("[data-pestana]", vista).forEach((b) => b.setAttribute("aria-selected", b === t));
      pintarPestana();
    } else if (ins) inscribirCurso(ins.dataset.inscribir, () => pintarPestana());
  };
  await pintar();
  return {
    alEvento(ev) {
      if (ev.accion === "publicacion" && pestana === "publicaciones") pintarPestana();
      if (["ideales", "materias", "horario"].includes(pestana) && ["matricula", "matricula_retirada", "matricula_cambiada", "notas", "cupo", "grupo_creado"].includes(ev.accion)) pintarPestana();
    },
  };
}

// ------------------------------------------------------------------ foros
async function foros(vista) {
  let espacios = (await api("GET", "/api/foros")).espacios;
  let espacio = espacios[0]?.id;
  let hiloAbierto = null;
  let filtro = "";

  function marco() {
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Foros</h2><p>Conversa con tus compañeros y docentes. Las respuestas llegan en vivo.</p></div>
        <button class="boton-solido" type="button" data-nuevo>${IC.foros} Nuevo tema</button></div>
      <div class="rejilla-panel" style="grid-template-columns:300px minmax(0,1fr)">
        <section class="panel glass"><div class="panel-cabeza"><h3>Espacios</h3></div><div class="foro-espacios" id="espacios"></div></section>
        <section class="panel glass" id="foro-contenido"><p class="cargando-texto">Cargando…</p></section></div>`;
    pintarEspacios();
    entrarEnCascada(".pagina-cabeza, .panel", vista, 40);
  }
  function pintarEspacios() {
    $("#espacios", vista).innerHTML = espacios.map((e) => `<button class="foro-espacio" type="button" data-espacio="${esc(e.id)}" aria-current="${e.id === espacio}">
      <span class="icono-esp">${e.id === "general" ? "G" : esc(e.id.slice(6))}</span><div><strong>${esc(e.nombre)}</strong><span>${esc(e.descripcion)}</span></div>
      <span class="chip">${e.hilos}</span></button>`).join("");
  }
  async function pintarHilos(animar = true) {
    hiloAbierto = null;
    const { hilos } = await api("GET", `/api/foros/${espacio}`);
    const e = espacios.find((x) => x.id === espacio);
    const lista = hilos.filter((h) => !filtro || `${h.titulo} ${h.cuerpo} ${h.autor.nombre}`.toLowerCase().includes(filtro));
    $("#foro-contenido", vista).innerHTML = `<div class="panel-cabeza"><h3>${esc(e?.nombre || "Foro")}</h3><span class="tenue" style="font-size:12px">${hilos.length} temas</span></div>
      ${lista.length ? lista.map((h) => `<article class="hilo" data-hilo="${esc(h.id)}" tabindex="0">
        <span class="avatar-mini ${h.autor.rol === "profesor" ? "profesor" : ""}">${esc(iniciales(h.autor.nombre))}</span>
        <div><h4>${esc(h.titulo)}</h4><p>${esc(h.cuerpo)}</p><div class="meta">${esc(h.autor.nombre)}${h.autor.rol === "profesor" ? " · docente" : ""} · ${hace(h.fecha)}${h.respuestas?.length ? ` · última respuesta de ${esc(h.respuestas[0].autor.nombre)} ${hace(h.respuestas[0].fecha)}` : ""}</div></div>
        <span class="respuestas-num"><b>${h.total || 0}</b><span>resp.</span></span></article>`).join("")
        : vacioHTML(hilos.length ? "Sin resultados" : "Aún no hay temas", hilos.length ? "Prueba con otra búsqueda." : "Sé el primero en abrir una conversación.", hilos.length ? "" : `<button class="boton-solido" type="button" data-nuevo>Nuevo tema</button>`)}`;
    if (animar) entrarEnCascada(".hilo", vista, 30);
  }
  async function pintarHilo(id, nuevoMensaje = null) {
    const { hilo } = await api("GET", `/api/foros/hilo/${id}`);
    hiloAbierto = id;
    const mensaje = (m, original = false, idm = "") => `<div class="mensaje ${original ? "original" : ""} ${idm && idm === nuevoMensaje ? "nuevo" : ""}">
      <span class="avatar-mini ${m.autor.rol === "profesor" ? "profesor" : ""}">${esc(iniciales(m.autor.nombre))}</span>
      <div class="mensaje-cuerpo"><div class="mensaje-autor">${esc(m.autor.nombre)}${m.autor.rol === "profesor" ? ` <span class="chip blanco">Docente</span>` : ""}<time>${fechaHora(m.fecha)}</time></div><p>${esc(m.cuerpo)}</p></div></div>`;
    $("#foro-contenido", vista).innerHTML = `<div class="panel-cabeza"><h3>${esc(hilo.titulo)}</h3><button class="enlace" type="button" data-volver>← Todos los temas</button></div>
      ${mensaje(hilo, true)}${hilo.respuestas.map((r) => mensaje(r, false, r.id)).join("")}
      <form class="formulario" id="responder" style="margin-top:14px"><label class="campo">Tu respuesta<textarea name="cuerpo" maxlength="2000" required placeholder="Escribe una respuesta…"></textarea></label>
        <p class="error-texto" role="alert"></p><div><button class="boton-solido" type="submit">${IC.enviar}<span>Responder</span></button></div></form>`;
    $("#responder", vista).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const cuerpo = form.cuerpo.value.trim();
      if (!cuerpo) return sacudir(form);
      try {
        const r = await api("POST", `/api/foros/hilo/${id}`, { cuerpo });
        await pintarHilo(id, r.hilo.respuestas.at(-1)?.id);
      } catch (err) {
        $(".error-texto", form).textContent = err.message;
      }
    });
  }
  function nuevoTema() {
    const e = espacios.find((x) => x.id === espacio);
    const { modal, cerrar } = abrirModal(`<div class="modal-cabeza"><div><h2>Nuevo tema</h2><p>En ${esc(e?.nombre || "el foro")}</p></div>
        <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
      <form class="formulario" novalidate><label class="campo">Título<input name="titulo" maxlength="120" required></label>
        <label class="campo">Mensaje<textarea name="cuerpo" maxlength="2000" required></textarea></label><p class="error-texto" role="alert"></p>
        <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button><button class="boton-solido" type="submit">Publicar</button></div></form>`);
    $("form", modal).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      try {
        const r = await api("POST", `/api/foros/${espacio}`, { titulo: f.titulo.value, cuerpo: f.cuerpo.value });
        await cerrar();
        espacios = (await api("GET", "/api/foros")).espacios;
        pintarEspacios();
        await pintarHilo(r.hilo.id);
      } catch (err) {
        $(".error-texto", f).textContent = err.message;
        sacudir(modal);
      }
    });
    setTimeout(() => $("input", modal).focus(), 60);
  }
  vista.onclick = (e) => {
    const esp = e.target.closest("[data-espacio]");
    const h = e.target.closest("[data-hilo]");
    if (e.target.closest("[data-nuevo]")) nuevoTema();
    else if (e.target.closest("[data-volver]")) pintarHilos();
    else if (esp) {
      espacio = esp.dataset.espacio;
      pintarEspacios();
      pintarHilos();
    } else if (h) pintarHilo(h.dataset.hilo);
  };
  vista.onkeydown = (e) => e.key === "Enter" && e.target.matches("[data-hilo]") && pintarHilo(e.target.dataset.hilo);
  marco();
  if (espacio) await pintarHilos();
  return {
    alBuscar(t) {
      filtro = t;
      if (!hiloAbierto) pintarHilos(false);
    },
    async alEvento(ev) {
      if (!["foro_hilo", "foro_respuesta"].includes(ev.accion)) return;
      if (ev.actor?.id === estado.usuario.id) return;
      espacios = (await api("GET", "/api/foros")).espacios;
      pintarEspacios();
      if (hiloAbierto && ev.detalle?.hilo === hiloAbierto) await pintarHilo(hiloAbierto, "__ultimo");
      else if (!hiloAbierto && ev.detalle?.espacio === espacio) await pintarHilos(false);
    },
  };
}

// ------------------------------------------------------------------ aula virtual
async function aula(vista) {
  const esProfesor = estado.usuario.rol === "profesor";
  let datos = await api("GET", "/api/aula");
  let curso = "";
  let tipo = "anuncio";
  const ICONO = { anuncio: IC.anuncio, material: IC.material, tarea: IC.tarea };
  const NOMBRE = { anuncio: "Anuncio", material: "Material", tarea: "Tarea" };
  const nombreCurso = (g) => datos.cursos.find((c) => c.id === g)?.nombre || `${codigoCurso(g)}`;

  function pintar(animar = true) {
    const lista = datos.publicaciones.filter((p) => !curso || String(p.grupo) === curso);
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Aula virtual</h2><p>${esProfesor ? "Publica anuncios, material y tareas para tus cursos. Tus estudiantes reciben una notificación al instante." : "Anuncios, material y tareas de tus cursos."}</p></div>
        <label class="selector"><select id="f-curso"><option value="">Todos mis cursos</option>${datos.cursos.map((c) => `<option value="${c.id}" ${String(c.id) === curso ? "selected" : ""}>${esc(c.nombre)} · ${c.id}</option>`).join("")}</select></label></div>
      <div class="${esProfesor ? "rejilla-panel" : ""}" style="${esProfesor ? "grid-template-columns:minmax(0,1fr) 360px" : ""}">
        <section class="panel glass"><div class="panel-cabeza"><h3>Novedades</h3><span class="tenue" style="font-size:12px">${lista.length} publicaciones</span></div>
          ${lista.length ? lista.map((p) => `<article class="publicacion-aula" data-id="${esc(p.id)}"><span class="tipo-icono ${p.tipo}">${ICONO[p.tipo]}</span>
            <div><h4>${esc(p.titulo)}</h4>${p.cuerpo ? `<p>${esc(p.cuerpo)}</p>` : ""}
              <div class="meta"><span class="chip ${p.tipo === "tarea" ? "solido" : "rojo"}">${NOMBRE[p.tipo]}</span><span>${esc(nombreCurso(p.grupo))}</span><span>${esc(p.autor.nombre)} · ${hace(p.fecha)}</span>
                ${p.entrega ? `<span><b>Entrega: ${fechaLarga(p.entrega)}</b></span>` : ""}${p.enlace ? `<a href="${esc(p.enlace)}" target="_blank" rel="noopener noreferrer">${IC.enlace} Abrir enlace</a>` : ""}</div></div>
            ${esProfesor && p.autor.id === estado.usuario.id ? `<button class="boton-icono peligro" type="button" data-borrar="${esc(p.id)}" title="Eliminar" aria-label="Eliminar">${IC.papelera}</button>` : "<span></span>"}</article>`).join("")
            : vacioHTML("Sin publicaciones", esProfesor ? "Usa el formulario para publicar en tus cursos." : "Tus docentes aún no han publicado en tus cursos.")}</section>
        ${esProfesor ? `<form class="panel glass" id="publicar" novalidate><div class="panel-cabeza"><h3>Publicar</h3></div><div class="formulario">
          <label class="campo">Curso<span class="selector" style="display:block"><select name="grupo" style="width:100%">${datos.cursos.map((c) => `<option value="${c.id}">${esc(c.nombre)} · ${c.id}</option>`).join("")}</select></span></label>
          <div class="segmentado" id="tipo-pub"><span class="segmentado-indicador"></span>${Object.entries(NOMBRE).map(([v, t]) => `<button type="button" data-tipo="${v}" aria-pressed="${v === tipo}">${t}</button>`).join("")}</div>
          <label class="campo">Título<input name="titulo" maxlength="120" required></label>
          <label class="campo">Descripción<textarea name="cuerpo" maxlength="2000"></textarea></label>
          <label class="campo">Enlace (opcional)<input name="enlace" type="url" placeholder="https://"></label>
          <label class="campo" id="campo-entrega" ${tipo === "tarea" ? "" : "hidden"}>Fecha de entrega<input name="entrega" type="date"></label>
          <p class="error-texto" role="alert"></p><div><button class="boton-solido" type="submit">${IC.enviar}<span>Publicar</span></button></div></div></form>` : ""}
      </div>`;
    const seg = $("#tipo-pub", vista);
    if (seg) requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", seg), $(`[data-tipo="${tipo}"]`, seg), false));
    if (animar) entrarEnCascada(".pagina-cabeza, .panel, .publicacion-aula", vista, 30);
    $("#publicar", vista)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const d = Object.fromEntries(new FormData(f).entries());
      try {
        await api("POST", "/api/aula", { ...d, grupo: Number(d.grupo), tipo, entrega: tipo === "tarea" ? d.entrega : "" });
        aviso("Publicado en el aula", "Tus estudiantes fueron notificados");
        datos = await api("GET", "/api/aula");
        pintar(false);
      } catch (err) {
        $(".error-texto", f).textContent = err.message;
        sacudir(f);
      }
    });
  }
  vista.onclick = async (e) => {
    const t = e.target.closest("[data-tipo]");
    const borrar = e.target.closest("[data-borrar]");
    if (t) {
      tipo = t.dataset.tipo;
      $$("[data-tipo]", vista).forEach((b) => b.setAttribute("aria-pressed", b === t));
      deslizarIndicador($("#tipo-pub .segmentado-indicador", vista), t);
      $("#campo-entrega", vista).hidden = tipo !== "tarea";
    } else if (borrar) {
      await api("DELETE", `/api/aula/${borrar.dataset.borrar}`);
      aviso("Publicación eliminada", "");
      datos = await api("GET", "/api/aula");
      pintar(false);
    }
  };
  vista.onchange = (e) => {
    if (e.target.id === "f-curso") {
      curso = e.target.value;
      pintar(false);
    }
  };
  pintar();
  return {
    async alEvento(ev) {
      if (ev.accion !== "aula" || ev.actor?.id === estado.usuario.id) return;
      datos = await api("GET", "/api/aula");
      pintar(false);
    },
  };
}

// ------------------------------------------------------------------ reconocimiento docente
async function reconocimiento(vista) {
  if (estado.usuario.rol === "profesor") {
    const { resultados, criterios } = await api("GET", "/api/profesor/reconocimiento");
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Reconocimiento docente</h2><p>Resultados anónimos de la evaluación de tus estudiantes.</p></div></div>
      ${resultados.length ? `<div class="rejilla-mitades">${resultados.map((r) => {
        const promedio = Object.keys(criterios).reduce((s, k) => s + r[k], 0) / Object.keys(criterios).length;
        return `<section class="panel glass"><div class="panel-cabeza"><h3>${esc(r.materia)} · ${codigoCurso(r.id)}</h3><span class="chip solido">${numero(promedio, 1)} / 5</span></div>
          ${Object.entries(criterios).map(([k, t]) => `<div class="fila-medidor"><span>${t}</span><div class="medidor"><i style="--p:${(r[k] / 5) * 100}%"></i></div><b>${numero(r[k], 1)}</b></div>`).join("")}
          <p class="tenue" style="margin:10px 0 8px;font-size:12.5px">${r.n} ${r.n === 1 ? "evaluación" : "evaluaciones"}</p>
          <div style="display:grid;gap:8px">${r.comentarios.map((c) => `<p class="comentario">“${esc(c)}”</p>`).join("")}</div></section>`;
      }).join("")}</div>` : `<div class="panel glass">${vacioHTML("Aún no tienes evaluaciones", "Cuando tus estudiantes te evalúen, aquí verás los resultados.")}</div>`}`;
    entrarEnCascada(".pagina-cabeza, .panel", vista, 50);
    return { alEvento: (ev) => ev.accion === "reconocimiento" && ev.paraMi && reconocimiento(vista) };
  }
  const { cursos, criterios } = await api("GET", "/api/reconocimiento");
  const pendientes = cursos.filter((c) => !c.evaluado).length;
  vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Reconocimiento docente</h2><p>Evalúa a tus docentes. Tus respuestas son anónimas y ayudan a reconocer la buena enseñanza.</p></div>
      <span class="chip ${pendientes ? "solido" : "verde"}">${pendientes ? `${pendientes} por evaluar` : "Todo evaluado"}</span></div>
    <div class="tarjetas-servicio">${cursos.map((c) => `<article class="servicio glass ${c.evaluado ? "" : ""}"><div class="servicio-cabeza"><span class="avatar-mini profesor">${esc(iniciales(c.Profesor))}</span>
      <div><h3>${esc(c.Profesor)}</h3><p>${esc(c.NombreMateria)} · ${codigoCurso(c.IdGrupo)} · ${esc(c.Periodo || "")}</p></div></div>
      ${c.evaluado ? `<span class="chip verde" style="justify-self:start"><i></i>Evaluado · ¡gracias!</span>` : `<button class="boton-solido" type="button" data-evaluar="${c.IdGrupo}">${IC.reconocimiento}<span>Evaluar docente</span></button>`}</article>`).join("")}</div>`;
  entrarEnCascada(".pagina-cabeza, .servicio", vista, 40);
  vista.onclick = (e) => {
    const b = e.target.closest("[data-evaluar]");
    if (!b) return;
    const c = cursos.find((x) => x.IdGrupo === Number(b.dataset.evaluar));
    const puntajes = {};
    const { modal, cerrar } = abrirModal(`<div class="modal-cabeza"><div><h2>Evaluar a ${esc(c.Profesor)}</h2><p>${esc(c.NombreMateria)} · ${codigoCurso(c.IdGrupo)}</p></div>
        <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
      <div>${Object.entries(criterios).map(([k, t]) => `<div class="criterio"><strong>${t}</strong><div class="puntos" data-criterio="${k}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join("")}</div></div>`).join("")}</div>
      <label class="campo" style="margin-top:12px">Comentario (opcional, anónimo)<textarea name="comentario" maxlength="400"></textarea></label>
      <p class="error-texto" role="alert"></p>
      <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button><button class="boton-solido" type="button" data-enviar>Enviar evaluación</button></div>`);
    modal.addEventListener("click", async (ev) => {
      const p = ev.target.closest("[data-n]");
      if (p) {
        const grupo = p.closest("[data-criterio]");
        puntajes[grupo.dataset.criterio] = Number(p.dataset.n);
        $$("button", grupo).forEach((x) => x.classList.toggle("activo", Number(x.dataset.n) <= Number(p.dataset.n)));
      }
      if (ev.target.closest("[data-enviar]")) {
        if (Object.keys(puntajes).length < Object.keys(criterios).length) {
          $(".error-texto", modal).textContent = "Califica los cuatro criterios";
          return sacudir(modal);
        }
        try {
          await api("POST", "/api/reconocimiento", { grupo: c.IdGrupo, puntajes, comentario: $("textarea", modal).value });
          await cerrar();
          aviso("Evaluación enviada", `Gracias por evaluar a ${c.Profesor}`);
          reconocimiento(vista);
        } catch (err) {
          $(".error-texto", modal).textContent = err.message;
          sacudir(modal);
        }
      }
    });
  };
  return null;
}

export const rutasComunidad = { inicio, foros, aula, reconocimiento };
