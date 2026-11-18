// Campus — núcleo del portal: menú por rol, enrutador (#/seccion/parametro), periodo
// académico, acceso, catálogo, verificación de certificados, preferencias y notificaciones.
import {
  $, $$, ICONOS, RESORTE, SALIDA, aviso, capas, conectarEnVivo, deslizarIndicador, dur, esc, iniciarLuz, moneda, pedirJSON, sacudir,
} from "./comun.js";
import { rutasEstudiante } from "./estudiante.js";
import { rutasProfesor } from "./profesor.js";
import { rutasAcademico } from "./academico.js";
import { rutasComunidad } from "./comunidad.js";
import { rutasServicios } from "./servicios.js";

// ------------------------------------------------------------------ iconos
const svg = (d, t = 18) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const IC = {
  inicio: svg('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5M10 20v-5h4v5"/>'),
  libros: svg('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M9 4h4.5A1.5 1.5 0 0 1 15 5.5V20H9"/><path d="m15 6 3.2-.9a1.4 1.4 0 0 1 1.7 1l3 11.3"/>'),
  aula: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>'),
  calendario: svg('<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>'),
  historico: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 2"/>'),
  persona: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1.2-3.6 4-5.4 7.2-5.4s6 1.8 7.2 5.4"/>'),
  editar: svg('<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>'),
  foros: svg('<path d="M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 14V7A1.5 1.5 0 0 1 4 5.5Z"/><path d="M20.5 9v8.5h-1.5v2.5l-3-2.5h-5"/>'),
  inscribir: svg('<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h4M12 16.5h5M14.5 14v5"/>'),
  orden: svg('<path d="M6 3.5h9l3 3v14H6Z"/><path d="M14.5 3.5v3.5H18M9 11h6M9 14.5h6M9 18h3.5"/>'),
  baseDatos: svg('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>'),
  certificado: svg('<rect x="3.5" y="4" width="17" height="12.5" rx="2"/><path d="M7.5 8.5h9M7.5 12h5"/><circle cx="16.5" cy="17" r="2.6"/><path d="m15.2 19.2-.7 2.3 2-1 2 1-.7-2.3"/>'),
  registro: svg('<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5H5.5V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="m9 9 1.5 1.5L13.5 8M9 14h6M9 17.5h4"/>'),
  laboratorio: svg('<path d="M9.5 3.5h5M10.5 3.5v6L5 18.5a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9.5v-6"/><path d="M7.5 15h9"/>'),
  ciencias: svg('<circle cx="12" cy="12" r="1.8"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
  pagos: svg('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-1-1.6-1.5-2.8-1.5-1.6 0-2.8.9-2.8 2.1 0 2.9 5.9 1.6 5.9 4.4 0 1.2-1.3 2.1-3 2.1-1.4 0-2.6-.6-3.1-1.6M12 6v1.7M12 16.3V18"/>'),
  contrato: svg('<path d="M6 3.5h9l3 3v14H6Z"/><path d="M14.5 3.5v3.5H18M9 11h6M9 14.5h4"/><path d="m11 19 1.8-1.6 1.2 1 2-2"/>'),
  candado: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2"/>', 15),
  reconocimiento: svg('<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/><path d="m12 6.3.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3Z"/>'),
  catalogo: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
  corazon: svg('<path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.5 3.9 4.2 7.3 4.2c2 0 3.5 1.1 4.7 2.8 1.2-1.7 2.7-2.8 4.7-2.8 3.4 0 5.6 3.3 4.5 6.7-1.6 4.8-9.2 9.4-9.2 9.4Z"/>'),
  verificar: svg('<path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6Z"/><path d="m9 12 2 2 4-4"/>'),
  pizarra: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 9h6M7 12h4"/>'),
  campana: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  salir: svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>', 16),
  buscar: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>', 16),
  reloj: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 15),
  docente: svg('<circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5c1-3.2 3.6-4.8 6.5-4.8s5.5 1.6 6.5 4.8"/>', 15),
  creditos: svg('<path d="M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.5l-5.4 3 1.3-5.9-4.5-4 6-.6Z"/>', 15),
  lugar: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>', 15),
  ojo: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>', 16),
  cambiar: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>', 16),
  papelera: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>', 16),
  aviso: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>', 16),
  dinero: svg('<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'),
  grafico: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  imprimir: svg('<path d="M7 9V3.5h10V9M7 17H4.5V10h15v7H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>', 16),
  enviar: svg('<path d="M4 12 20 4l-4 16-4-6.5Z"/><path d="m12 13.5 8-9.5"/>', 16),
  enlace: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 16),
  tarea: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M8.5 12l2.5 2.5 4.5-5"/>'),
  material: svg('<path d="M6 3.5h8l4 4v13H6Z"/><path d="M14 3.5V8h4"/>'),
  anuncio: svg('<path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7l5 4V4.5l-5 4H5.5A1.5 1.5 0 0 0 4 10Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  abajo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" class="flecha-abrir"><path d="m6 9 6 6 6-6"/></svg>`,
};

// ------------------------------------------------------------------ estado y menús
export const estado = { usuario: null, preferencias: null, ruta: null, param: null, vista: null, pendientes: 0, periodo: null, periodos: [] };
const vista = $("#vista");
const ROLES = { estudiante: "Estudiante", profesor: "Docente", general: "Público general" };
const PLATAFORMA = { estudiante: "Campus Estudiantes", profesor: "Campus Docentes", general: "Campus Comunidad" };

const MENUS = {
  estudiante: [
    ["Académico", [["inicio", "Inicio", IC.inicio], ["asignaturas", "Asignaturas", IC.libros], ["inscripcion", "Inscripción", IC.inscribir],
      ["aula", "Aula virtual", IC.aula], ["horario", "Horario", IC.calendario], ["historicos", "Históricos", IC.historico], ["registro", "Registro académico", IC.registro]]],
    ["Trámites", [["orden", "Orden de matrícula", IC.orden], ["pagos", "Pagos en línea", IC.pagos], ["contrato", "Descargar contrato", IC.contrato],
      ["certificados", "Certificados académicos", IC.certificado]]],
    ["Comunidad y servicios", [["foros", "Foros", IC.foros], ["laboratorios", "Laboratorios", IC.laboratorio], ["ciencias", "Ciencias básicas", IC.ciencias],
      ["recursos", "Bases de datos en línea", IC.baseDatos], ["reconocimiento", "Reconocimiento docente", IC.reconocimiento]]],
    ["Cuenta", [["perfil", "Editar perfil", IC.editar]]],
  ],
  profesor: [
    ["Académico", [["inicio", "Inicio", IC.inicio], ["cursos", "Mis cursos", IC.pizarra], ["aula", "Aula virtual", IC.aula], ["horario", "Horario", IC.calendario]]],
    ["Comunidad y servicios", [["foros", "Foros", IC.foros], ["reconocimiento", "Reconocimiento docente", IC.reconocimiento], ["laboratorios", "Laboratorios", IC.laboratorio],
      ["ciencias", "Ciencias básicas", IC.ciencias], ["recursos", "Bases de datos en línea", IC.baseDatos]]],
    ["Explorar", [["catalogo", "Catálogo de cursos", IC.catalogo]]],
  ],
  general: [
    ["Explorar", [["inicio", "Inicio", IC.inicio], ["catalogo", "Catálogo de cursos", IC.catalogo], ["favoritos", "Favoritos", IC.corazon]]],
    ["Comunidad y servicios", [["foros", "Foros", IC.foros], ["ciencias", "Ciencias básicas", IC.ciencias], ["recursos", "Bases de datos en línea", IC.baseDatos],
      ["verificar", "Verificar certificado", IC.verificar]]],
    // Secciones del portal estudiantil: visibles con candado hasta vincular la cuenta
    ["Portal estudiantil", [["vincular", "Vincular mi cuenta", IC.persona], ["asignaturas", "Asignaturas", IC.libros, true], ["inscripcion", "Inscripción", IC.inscribir, true],
      ["horario", "Horario", IC.calendario, true], ["aula", "Aula virtual", IC.aula, true], ["historicos", "Históricos", IC.historico, true],
      ["registro", "Registro académico", IC.registro, true], ["orden", "Orden de matrícula", IC.orden, true], ["pagos", "Pagos en línea", IC.pagos, true],
      ["contrato", "Descargar contrato", IC.contrato, true], ["certificados", "Certificados académicos", IC.certificado, true],
      ["laboratorios", "Laboratorios", IC.laboratorio, true], ["reconocimiento", "Reconocimiento docente", IC.reconocimiento, true]]],
  ],
  invitado: [["Explorar", [["acceso", "Ingresar", IC.persona], ["catalogo", "Catálogo de cursos", IC.catalogo], ["verificar", "Verificar certificado", IC.verificar]]]],
};
const TITULOS = Object.fromEntries(Object.values(MENUS).flat().flatMap(([, items]) => items).map(([id, t]) => [id, t]));
Object.assign(TITULOS, { materia: "Asignatura", curso: "Curso", vincular: "Vincular mi cuenta" });

// ------------------------------------------------------------------ utilidades compartidas
export { moneda };
export const numero = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const iniciales = (t) => String(t || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
export const tono = (id) => Math.abs(Number(id) || 0) % 5;
export const codigoMatricula = (id) => `MAT-${String(id).padStart(6, "0")}`;
export const codigoCurso = (id) => `GR-${String(id).padStart(3, "0")}`;

// Horarios: el texto libre de la tabla Grupo ("Lunes y miércoles 9-11 am") se muestra uniforme
// ("Lun y Mié · 09:00–11:00"). Misma lectura que horarios.py en el servidor.
const DIA_NUM = { lunes: 1, lun: 1, martes: 2, mar: 2, miercoles: 3, mie: 3, mier: 3, jueves: 4, jue: 4, viernes: 5, vie: 5, sabado: 6, sab: 6, domingo: 7, dom: 7 };
const DIA_CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TOKEN_HORARIO = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mier|mie|jue|vie|sab|dom)\b|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|a|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/g;
const a24 = (h, suf) => (!suf ? h : suf.startsWith("p") ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function horarioCorto(texto, vacio = "Por definir") {
  if (!texto) return esc(vacio);
  const limpio = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tramos = new Map(); // "inicio-fin" -> [días]
  let pendientes = [];
  for (const t of limpio.matchAll(TOKEN_HORARIO)) {
    if (t[1]) { pendientes.push(DIA_NUM[t[1]]); continue; }
    if (!pendientes.length) continue;
    const fin = a24(Number(t[5]), t[7]) * 60 + Number(t[6] || 0);
    let inicio;
    if (t[4]) inicio = a24(Number(t[2]), t[4]) * 60 + Number(t[3] || 0);
    else if (t[7]?.startsWith("p")) { const c = a24(Number(t[2]), "pm") * 60 + Number(t[3] || 0); inicio = c < fin ? c : Number(t[2]) * 60 + Number(t[3] || 0); }
    else inicio = a24(Number(t[2]), t[7]) * 60 + Number(t[3] || 0);
    if (fin > inicio) {
      const clave = `${hhmm(inicio)}–${hhmm(fin)}`;
      tramos.set(clave, [...(tramos.get(clave) || []), ...pendientes]);
    }
    pendientes = [];
  }
  if (!tramos.size) return esc(texto);
  return [...tramos].map(([horas, dias]) => `${dias.map((d) => DIA_CORTO[d]).join(" y ")} · ${horas}`).join(", ");
}
export const fechaLarga = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "—");
export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const conPeriodo = (url) => `${url}${url.includes("?") ? "&" : "?"}periodo=${encodeURIComponent(estado.periodo || "")}`;

export function hace(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function detalleEvento(e) {
  const d = e.detalle || {};
  if (d.mensaje) return String(d.mensaje).replace(/^(EXITO|ERROR):\s*/i, "");
  if (e.accion === "matricula_cambiada") return `Del ${codigoCurso(d.anterior)} al ${codigoCurso(d.grupo)}`;
  if (d.titulo) return d.titulo;
  if (d.referencia) return `${d.referencia} · ${moneda(d.valor || 0)}`;
  if (d.laboratorio) return `${d.laboratorio} · ${d.fecha} · ${d.franja}`;
  if (d.materia) return d.materia;
  if (d.tipo && d.codigo) return `${d.tipo} · ${d.codigo}`;
  if (d.grupo) return `${codigoCurso(d.grupo)}${d.cantidad ? ` · ${d.cantidad} notas` : ""}${d.cupo ? ` · cupo ${d.cupo}` : ""}`;
  if (d.promedio != null) return `Promedio ${numero(d.promedio)} · ${d.clasificacion}`;
  if (d.periodo) return `Periodo ${d.periodo}`;
  if (d.campos) return d.campos.join(", ");
  return e.actor?.origen === "terminal" ? "Desde la administración" : "";
}

export function lineaTiempoHTML(eventos, nuevos = 0) {
  if (!eventos.length) return `<div class="vacio-bonito"><p>Aún no hay actividad.</p></div>`;
  return `<ol class="linea-tiempo">${eventos.map((e, i) => `
    <li class="${i < nuevos ? "nuevo" : ""}"><span class="punto"></span>
      <div><strong>${esc(e.texto)}</strong><span>${esc(detalleEvento(e))}${e.actor?.origen === "terminal" ? " · administración" : ""}</span></div>
      <time datetime="${esc(e.fecha)}">${hace(e.fecha)}</time></li>`).join("")}</ol>`;
}

export function cupoHTML(inscritos, cupo) {
  if (cupo == null) {
    return `<div class="cupo"><div class="cupo-texto"><span>Sin límite</span><span>${inscritos} inscritos</span></div>
      <div class="cupo-barra sin-limite"><i style="--p:100%"></i></div></div>`;
  }
  const p = cupo ? Math.min(100, (inscritos / cupo) * 100) : 0;
  const libres = Math.max(0, cupo - inscritos);
  return `<div class="cupo ${libres ? (p >= 85 ? "casi-lleno" : "") : "lleno"}"><div class="cupo-texto"><span>${libres ? `${libres} libres` : "Lleno"}</span><span>${inscritos}/${cupo}</span></div>
    <div class="cupo-barra"><i style="--p:${p.toFixed(1)}%"></i></div></div>`;
}

export function entrarEnCascada(selector, raiz = vista, retardo = 35) {
  $$(selector, raiz).forEach((el, i) =>
    el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: dur(480), delay: dur(20 + Math.min(i, 12) * retardo), easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
}

export const vacioHTML = (t, texto, boton = "") => `<div class="vacio-bonito"><h3>${esc(t)}</h3><p>${texto}</p>${boton}</div>`;

/** Pide JSON; si la sesión expiró, vuelve a la pantalla de acceso. */
export async function api(metodo, url, cuerpo) {
  try {
    return await pedirJSON(metodo, url, cuerpo);
  } catch (err) {
    if (err.estado === 401 && estado.usuario) {
      aviso("Tu sesión terminó", "Inicia sesión de nuevo", "error");
      establecerSesion(null, null);
    }
    throw err;
  }
}

/** Ventana emergente. Retorna { modal, cerrar, abierta }. Los elementos [data-cerrar] la cierran. */
export function abrirModal(html, { clase = "", alCerrar } = {}) {
  const capa = document.createElement("div");
  capa.className = "capa-modal";
  capa.innerHTML = `<div class="velo"></div><section class="modal glass glass-fuerte ${clase}" role="dialog" aria-modal="true">${html}</section>`;
  document.body.append(capa);
  const modal = $(".modal", capa);
  const velo = $(".velo", capa);
  let cerrada = false;
  async function cerrar() {
    if (cerrada) return;
    cerrada = true;
    capas.quitar(cerrar);
    alCerrar?.();
    velo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(200), easing: SALIDA, fill: "forwards" });
    await modal.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.98)" }],
      { duration: dur(180), easing: SALIDA, fill: "forwards" }).finished.catch(() => {});
    capa.remove();
  }
  capas.abrir(cerrar);
  velo.addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => e.target.closest("[data-cerrar]") && cerrar());
  velo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(220), fill: "both" });
  modal.animate([{ opacity: 0, transform: "translateY(16px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: dur(380), easing: RESORTE });
  return { modal, cerrar, abierta: () => !cerrada };
}

/** Imprime el documento visible (el usuario puede elegir "Guardar como PDF"). */
export function imprimir(dentroDeModal = false) {
  document.body.classList.toggle("imprimiendo-modal", dentroDeModal);
  print();
  setTimeout(() => document.body.classList.remove("imprimiendo-modal"), 500);
}

export const irA = (ruta) => (location.hash = `#/${ruta}`);

export function tituloPagina(texto) {
  document.title = `${texto} · Campus`;
}

/** Encabezado y pie de documento oficial (orden, contrato, certificados, recibos). */
export function documentoHTML({ titulo, numero: num, etiqueta = "Número", cuerpo, pie = "" }) {
  return `<article class="documento">
    <header class="documento-cabeza"><div><span class="marca"><span class="marca-logo" aria-hidden="true"></span><span class="marca-texto">Campus</span></span><h2>${esc(titulo)}</h2></div>
      ${num ? `<div class="doc-num">${esc(etiqueta)}<b>${esc(num)}</b></div>` : ""}</header>
    <div class="documento-cuerpo">${cuerpo}</div>
    <footer class="documento-pie">${pie || `<span>Documento generado por Campus el ${fechaHora(new Date().toISOString())}</span>`}</footer>
  </article>`;
}

// ------------------------------------------------------------------ preferencias (MongoDB)
let luz = null; // luz suave del puntero sobre los bordes del vidrio (comun.js · iniciarLuz)
function aplicarPreferencias(p) {
  const raiz = document.documentElement;
  raiz.dataset.tema = p?.tema === "opaco" ? "opaco" : "vidrio";
  raiz.classList.toggle("menu-superior", p?.menu === "superior");
  const conLuz = p?.luz !== false && matchMedia("(hover: hover)").matches;
  raiz.classList.toggle("sin-luz", !conLuz);
  if (conLuz && !luz) luz = iniciarLuz({ selector: ".glass, .nav-item, .boton-vidrio, .boton-solido, .franja", decorado: false });
}

export async function guardarPreferencias(cambios) {
  estado.preferencias = { ...estado.preferencias, ...cambios };
  aplicarPreferencias(estado.preferencias);
  try {
    estado.preferencias = (await api("PUT", "/api/preferencias", cambios)).preferencias;
    return true;
  } catch (err) {
    aviso("No se guardó la preferencia", err.message, "error");
    return false;
  }
}

// ------------------------------------------------------------------ sesión
async function establecerSesion(usuario, preferencias) {
  estado.usuario = usuario;
  estado.preferencias = preferencias;
  estado.pendientes = 0;
  aplicarPreferencias(preferencias);
  document.body.classList.toggle("invitado", !usuario);
  if (usuario && !estado.periodos.length) {
    try {
      const p = await pedirJSON("GET", "/api/periodos");
      estado.periodos = p.periodos;
      const guardado = sessionStorage.getItem("campus-periodo");
      estado.periodo = p.periodos.includes(guardado) ? guardado : p.actual;
    } catch { /* sin periodos */ }
  }
  pintarMarco();
  // Se conserva el enlace directo (p. ej. #/verificar/CÓDIGO o #/pagos); mostrar() valida si el rol puede verlo.
  const actual = location.hash.replace(/^#\/?/, "").split("/")[0];
  const destino = actual && !(usuario && actual === "acceso") ? location.hash.slice(2) : usuario ? "inicio" : "acceso";
  if (location.hash === `#/${destino}`) mostrar();
  else location.replace(`#/${destino}`);
  reconectar();
}

async function cerrarSesion() {
  await pedirJSON("POST", "/api/logout").catch(() => {});
  establecerSesion(null, null);
  aviso("Sesión cerrada", "¡Hasta pronto!");
}

// ------------------------------------------------------------------ marco: menú lateral, cabecera y banda
function gruposCerrados() {
  try { return JSON.parse(localStorage.getItem("campus-grupos-cerrados") || "[]"); } catch { return []; }
}
function guardarGruposCerrados(lista) {
  try { localStorage.setItem("campus-grupos-cerrados", JSON.stringify(lista)); } catch { /* sin almacenamiento local */ }
}
function cerrarDesplegables(excepto = null) {
  $$(".grupo-nav.abierto").forEach((g) => {
    if (g === excepto) return;
    g.classList.remove("abierto");
    $("[data-desplegar]", g)?.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", (e) => {
  const plegar = e.target.closest("[data-plegar]");
  if (plegar) {
    const grupo = plegar.closest(".nav-grupo");
    const cerrado = grupo.classList.toggle("cerrado");
    plegar.setAttribute("aria-expanded", String(!cerrado));
    const lista = gruposCerrados().filter((g) => g !== plegar.dataset.plegar);
    guardarGruposCerrados(cerrado ? [...lista, plegar.dataset.plegar] : lista);
    return;
  }
  const desplegar = e.target.closest("[data-desplegar]");
  if (desplegar) {
    const g = desplegar.closest(".grupo-nav");
    cerrarDesplegables(g);
    const abierto = g.classList.toggle("abierto");
    desplegar.setAttribute("aria-expanded", String(abierto));
    return;
  }
  if (!e.target.closest(".menu-grupo")) cerrarDesplegables();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarDesplegables());
function pintarMarco() {
  const u = estado.usuario;
  const menu = MENUS[u ? u.rol : "invitado"];
  const itemHTML = ([id, texto, icono, bloqueado]) => bloqueado
    ? `<a class="nav-item bloqueado" href="#/vincular/${id}" data-ruta="vincular-${id}" title="Vincula tu cuenta para abrir ${texto}">${icono}<span>${texto}</span>${IC.candado}</a>`
    : `<a class="nav-item" href="#/${id}" data-ruta="${id}">${icono}<span>${texto}</span><span class="nav-insignia" data-insignia="${id}" hidden></span></a>`;
  const cerrados = gruposCerrados();
  $("#nav-lateral").innerHTML = menu.map(([grupo, items]) => `<div class="nav-grupo ${cerrados.includes(grupo) ? "cerrado" : ""}" data-grupo="${grupo}">
      <p class="nav-titulo"><button type="button" data-plegar="${grupo}" aria-expanded="${!cerrados.includes(grupo)}">${grupo}${IC.abajo}</button></p>
      <div class="nav-items">${items.map(itemHTML).join("")}</div></div>`).join("");
  // Menú superior: "Inicio" directo y un desplegable por grupo (los grupos de una sola opción van directos)
  const superior = [];
  for (const [grupo, items] of menu) {
    const resto = items.filter(([id]) => id !== "inicio");
    if (resto.length !== items.length) superior.push(`<div class="grupo-nav" data-rutas="inicio"><a href="#/inicio" data-ruta="inicio">${IC.inicio}<span>Inicio</span></a></div>`);
    if (resto.length === 1 && !resto[0][3]) {
      const [id, texto, icono] = resto[0];
      superior.push(`<div class="grupo-nav" data-rutas="${id}"><a href="#/${id}" data-ruta="${id}">${icono}<span>${texto}</span></a></div>`);
    } else if (resto.length) {
      superior.push(`<div class="grupo-nav" data-rutas="${resto.map(([id, , , b]) => (b ? `vincular-${id}` : id)).join(" ")}">
        <button type="button" aria-haspopup="true" aria-expanded="false" data-desplegar>${esc(grupo)}<span class="flecha">${IC.abajo}</span></button>
        <div class="menu-grupo" role="menu">${resto.map(itemHTML).join("")}</div></div>`);
    }
  }
  $("#nav-superior").innerHTML = superior.join("");
  $("#perfil-lateral").innerHTML = u ? `
      <span class="avatar-grande">${esc(iniciales(u.nombre))}</span>
      <strong>${esc(u.nombre)}</strong><span>${esc(ROLES[u.rol])}${u.programa ? ` · ${esc(u.programa)}` : ""}</span>
      <button class="boton-salir" type="button" data-accion="salir">Cerrar sesión</button>`
    : `<span class="avatar-grande">?</span><strong>Campus</strong><span>Ingresa para ver tu portal</span>`;
  const selector = $("#selector-periodo");
  selector.hidden = !u || !["estudiante", "profesor"].includes(u.rol) || !estado.periodos.length;
  $("#periodo").innerHTML = estado.periodos.map((p) => `<option ${p === estado.periodo ? "selected" : ""}>${esc(p)}</option>`).join("");
  $("#cabecera-acciones").innerHTML = `
    <label class="buscador" data-buscador hidden><span class="visualmente-oculto">Buscar</span>${IC.buscar}<input id="buscar" type="search" placeholder="Buscar en esta sección" autocomplete="off"></label>
    ${u ? `<button class="boton-vidrio boton-redondo campana" type="button" data-accion="notificaciones" aria-label="Notificaciones">${IC.campana}<span class="bolsa-cuenta" hidden>0</span></button>
      <button class="boton-vidrio cuenta" type="button" data-accion="menu" aria-haspopup="true"><span class="avatar"><span class="inicial">${esc(iniciales(u.nombre))}</span></span><span class="cuenta-texto">${esc(u.nombre.split(/\s+/)[0])}</span></button>
      <button class="boton-vidrio" type="button" data-accion="salir">Cerrar sesión</button>`
      : `<button class="boton-solido" type="button" data-accion="ingresar">Ingresar</button>`}`;
  $("#buscar")?.addEventListener("input", (e) => estado.vista?.alBuscar?.(e.target.value.trim().toLowerCase()));
}

function pintarBanda(visible) {
  const banda = $("#banda");
  const u = estado.usuario;
  banda.hidden = !visible || !u;
  if (banda.hidden) return;
  banda.innerHTML = `<p>Hola, <b>${esc(u.nombre.split(/\s+/)[0])}</b>. Te damos la bienvenida a ${esc(PLATAFORMA[u.rol])}.</p>
    ${estado.periodo ? `<span class="chip">Período ${esc(estado.periodo)}</span>` : ""}`;
}

export function insignia(ruta, n) {
  $$(`[data-insignia="${ruta}"]`).forEach((b) => {
    b.hidden = !n;
    b.textContent = n;
  });
}

function contarPendiente() {
  const contador = $(".campana .bolsa-cuenta");
  if (!contador) return;
  contador.hidden = !estado.pendientes;
  contador.textContent = estado.pendientes;
  if (estado.pendientes) {
    const c = $(".campana");
    c.classList.remove("sonando");
    void c.offsetWidth;
    c.classList.add("sonando");
  }
}

function alternarMenu(abrir) {
  document.body.classList.toggle("menu-abierto", abrir);
  $("#boton-menu").setAttribute("aria-expanded", abrir);
}
$("#boton-menu").addEventListener("click", () => alternarMenu(!document.body.classList.contains("menu-abierto")));
document.addEventListener("click", (e) => {
  if (document.body.classList.contains("menu-abierto") && (e.target.closest(".nav-item") || (!e.target.closest(".lateral") && !e.target.closest("#boton-menu")))) alternarMenu(false);
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const a = b.dataset.accion;
  if (a === "salir") cerrarSesion();
  else if (a === "ingresar") irA("acceso");
  else if (a === "menu") abrirMenu(b);
  else if (a === "notificaciones") abrirNotificaciones(b);
  else if (a === "ayuda") abrirTextoInformativo("Ayuda", AYUDA);
  else if (a === "privacidad") abrirTextoInformativo("Privacidad y datos", PRIVACIDAD);
});

function abrirTextoInformativo(titulo, html) {
  abrirModal(`<div class="modal-cabeza"><div><h2>${titulo}</h2></div>
      <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    <div class="texto-legal">${html}</div>
    <div class="modal-pie"><button class="boton-solido" type="button" data-cerrar>Entendido</button></div>`);
}
const AYUDA = `
  <h3>¿Cómo entro por primera vez?</h3>
  <p>Estudiantes y docentes: <b>Activar cuenta</b> con el documento (o código docente) y el correo institucional. Público general: <b>Registrarse</b>.</p>
  <h3>¿Cómo inscribo o retiro una materia?</h3>
  <p>En <b>Inscripción</b> elige el curso y pulsa <b>Inscribir</b>. Arriba, en «Estoy inscrito en», puedes ver el comprobante, cambiarte de curso o retirar la materia mientras no tenga nota. Puedes tener hasta 9 materias por período.</p>
  <h3>¿Dónde veo mi horario y mis pagos?</h3>
  <p>En <b>Horario</b> está tu semana completa. En <b>Orden de matrícula</b> ves el valor y la fecha límite, y en <b>Pagos en línea</b> puedes pagar (pasarela de demostración).</p>
  <h3>¿Me registré como público general siendo estudiante?</h3>
  <p>Entra con esa cuenta y usa <b>Vincular mi cuenta</b>: con tu documento y correo institucional pasa a ser cuenta de estudiante.</p>
  <h3>¿Algo no funciona?</h3>
  <p>Escríbele a la administración académica; ellos gestionan el portal desde la consola de administración.</p>`;
const PRIVACIDAD = `
  <p>Campus usa tus datos solo para fines académicos y administrativos.</p>
  <ul>
    <li>Tu contraseña se guarda cifrada; nadie, ni la administración, puede leerla.</li>
    <li>Tus notas y matrículas solo las ven tú, tus docentes y la administración.</li>
    <li>Las evaluaciones de reconocimiento docente son anónimas.</li>
    <li>La verificación pública de certificados muestra tu documento parcialmente oculto.</li>
    <li>Los pagos son de demostración: no se piden ni se guardan datos de tarjetas.</li>
    <li>El registro de actividad de tu cuenta se borra automáticamente a los 180 días.</li>
  </ul>`;
$("#periodo").addEventListener("change", (e) => {
  estado.periodo = e.target.value;
  sessionStorage.setItem("campus-periodo", estado.periodo);
  aviso("Período académico", `Mostrando ${estado.periodo}`);
  mostrar();
});

// ------------------------------------------------------------------ enrutador
const RUTAS = {
  ...rutasComunidad, ...rutasAcademico, ...rutasServicios, ...rutasEstudiante, ...rutasProfesor,
  acceso: vistaAcceso, catalogo: () => vistaCatalogo(false), favoritos: () => vistaCatalogo(true), verificar: vistaVerificar,
  vincular: vistaVincular,
};

const ESQUELETO = `<div class="esqueleto" aria-busy="true" aria-label="Cargando"><i class="e-titulo"></i><i class="e-linea"></i>
  <div class="e-fila"><b></b><b></b><b></b><b></b></div><i class="e-bloque"></i></div>`;
async function mostrar() {
  const [ruta = "", param = null] = location.hash.replace(/^#\/?/, "").split("/");
  const u = estado.usuario;
  const permitidas = MENUS[u ? u.rol : "invitado"].flatMap(([, items]) => items.filter((i) => !i[3]).map((i) => i[0]));
  if (u?.rol === "estudiante") permitidas.push("materia");
  if (u?.rol === "profesor") permitidas.push("curso");
  if (!permitidas.includes(ruta)) {
    location.replace(`#/${permitidas[0]}`);
    return;
  }
  estado.ruta = ruta === "materia" ? "asignaturas" : ruta === "curso" ? "cursos" : ruta;
  estado.param = param;
  document.body.classList.toggle("pantalla-acceso", ruta === "acceso");
  $$(".nav-item").forEach((a) => (a.dataset.ruta === estado.ruta ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $$(".grupo-nav").forEach((g) => g.classList.toggle("activo", g.dataset.rutas.split(" ").includes(estado.ruta)));
  cerrarDesplegables();
  // el grupo plegado que contiene la sección actual se abre solo
  $(`.nav-item[aria-current="page"]`)?.closest(".nav-grupo.cerrado")?.classList.remove("cerrado");
  const buscador = $("[data-buscador]");
  if (buscador) {
    buscador.hidden = !["asignaturas", "inscripcion", "catalogo", "favoritos", "recursos", "foros"].includes(ruta);
    $("#buscar").value = "";
  }
  pintarBanda(ruta === "inicio");
  tituloPagina(TITULOS[ruta] || "Campus");
  vista.getAnimations().forEach((a) => a.cancel());
  vista.onclick = vista.oninput = vista.onchange = vista.onkeydown = vista.onsubmit = null; // cada vista instala los suyos
  vista.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: dur(300), easing: RESORTE });
  scrollTo({ top: 0 });
  vista.innerHTML = ESQUELETO;
  try {
    estado.vista = await RUTAS[ruta](vista, param);
  } catch (err) {
    vista.innerHTML = `<div class="panel glass">${vacioHTML("No se pudo cargar", esc(err.message))}</div>`;
  }
}
addEventListener("hashchange", mostrar);

// ------------------------------------------------------------------ acceso
async function vistaAcceso() {
  vista.innerHTML = `<section class="acceso-pantalla">
    <div class="acceso-marca">
      <span class="marca"><span class="marca-logo" aria-hidden="true"></span><span class="marca-texto">Campus</span></span>
      <h1>Tu universidad,<br><span>en un solo lugar.</span></h1>
      <p>Asignaturas, inscripción, horario, notas, pagos, certificados y servicios: todo tu proceso académico en un portal.</p>
      <ul class="beneficios-lista">
        <li><span>${IC.inscribir}</span><div><b>Inscripción en línea</b>Cupos en vivo, cruces de horario y comprobante</div></li>
        <li><span>${IC.certificado}</span><div><b>Trámites sin filas</b>Orden de matrícula, pagos, contrato y certificados</div></li>
        <li><span>${IC.aula}</span><div><b>Aula virtual y foros</b>Anuncios, material y conversación con tus profesores</div></li>
      </ul>
    </div>
    <div class="tarjeta-acceso">
      <h2 id="acceso-titulo">Ingresar</h2><p id="acceso-motivo"></p>
      <div class="segmentado pestañas" role="group" aria-label="Tipo de acceso"><span class="segmentado-indicador" aria-hidden="true"></span>
        <button type="button" data-modo="login">Ingresar</button><button type="button" data-modo="activar">Activar cuenta</button><button type="button" data-modo="registro">Registrarse</button></div>
      <form novalidate></form>
      <div class="enlaces-acceso"><a class="boton-texto" href="#/catalogo">Ver catálogo de cursos</a><a class="boton-texto" href="#/verificar">Verificar un certificado</a></div>
      <p class="acceso-legal">${ICONOS.candado}Contraseñas cifradas · sesión segura</p>
    </div></section>`;
  const tarjeta = $(".tarjeta-acceso", vista);
  const form = $("form", tarjeta);
  const pestanas = $(".pestañas", tarjeta);
  let modo = "login";
  let tipo = "estudiante";
  const TEXTOS = {
    login: ["Ingresar", "Usa el correo y la contraseña de tu cuenta.", "Ingresar"],
    activar: ["Activa tu cuenta", "Estudiantes y docentes: con tu documento y tu correo institucional.", "Activar cuenta"],
    registro: ["Crea tu cuenta", "Para aspirantes y público general.", "Crear cuenta"],
  };
  const clave = (auto) => `<label class="campo">Contraseña<span class="con-ojo"><input name="clave" type="password" autocomplete="${auto}" maxlength="128" required>
      <button type="button" class="ojo" aria-label="Mostrar contraseña" aria-pressed="false">${ICONOS.ojo}</button></span></label>`;
  const campos = () => modo === "login"
    ? `<label class="campo">Correo<input name="correo" type="email" autocomplete="email" required></label>${clave("current-password")}`
    : modo === "registro"
      ? `<label class="campo">Nombre completo<input name="nombre" autocomplete="name" maxlength="80" required></label>
        <label class="campo">Correo<input name="correo" type="email" autocomplete="email" required></label>${clave("new-password")}<p class="ayuda-clave">Mínimo 8 caracteres.</p>`
      : `<div class="segmentado tipo-cuenta" role="group" aria-label="Soy"><span class="segmentado-indicador" aria-hidden="true"></span>
          <button type="button" data-tipo="estudiante" aria-pressed="${tipo === "estudiante"}">Soy estudiante</button>
          <button type="button" data-tipo="profesor" aria-pressed="${tipo === "profesor"}">Soy docente</button></div>
        <label class="campo">${tipo === "estudiante" ? "Número de documento" : "Código de docente"}<input name="documento" inputmode="numeric" autocomplete="off" required></label>
        <label class="campo">Correo institucional<input name="correo" type="email" autocomplete="email" required></label>${clave("new-password")}
        <p class="ayuda-clave">Deben coincidir con tu registro académico. Contraseña de mínimo 8 caracteres.</p>`;
  function cambiar(nuevo, animar = true) {
    modo = nuevo;
    const [t, m, b] = TEXTOS[modo];
    $("#acceso-titulo", tarjeta).textContent = t;
    $("#acceso-motivo", tarjeta).textContent = m;
    $$("button[data-modo]", pestanas).forEach((x) => x.setAttribute("aria-pressed", x.dataset.modo === modo));
    deslizarIndicador($(".segmentado-indicador", pestanas), $(`button[data-modo="${modo}"]`, pestanas), animar);
    form.innerHTML = `${campos()}<p class="error-texto" role="alert"></p><button class="boton-solido grande enviar" type="submit"><span>${b}</span></button>`;
    const tipoNav = $(".tipo-cuenta", form);
    if (tipoNav) requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", tipoNav), $(`button[data-tipo="${tipo}"]`, tipoNav), false));
    if (animar) entrarEnCascada("form > *", tarjeta, 25);
  }
  pestanas.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-modo]");
    if (b && b.dataset.modo !== modo) cambiar(b.dataset.modo);
  });
  tarjeta.addEventListener("click", (e) => {
    const ojo = e.target.closest(".ojo");
    const t = e.target.closest("button[data-tipo]");
    if (ojo) {
      const ver = form.clave.type === "password";
      form.clave.type = ver ? "text" : "password";
      ojo.setAttribute("aria-pressed", ver);
    } else if (t && t.dataset.tipo !== tipo) {
      tipo = t.dataset.tipo;
      const previo = { correo: form.correo.value, clave: form.clave.value };
      cambiar("activar", false);
      form.correo.value = previo.correo;
      form.clave.value = previo.clave;
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $(".error-texto", form);
    const enviar = $(".enviar", form);
    const d = Object.fromEntries(new FormData(form).entries());
    const falla = modo === "registro" && (d.nombre || "").trim().length < 2 ? "Escribe tu nombre"
      : !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test((d.correo || "").trim()) ? "Escribe un correo válido"
      : modo === "activar" && !/^\d+$/.test((d.documento || "").trim()) ? "El documento debe ser numérico"
      : modo !== "login" && (d.clave || "").length < 8 ? "La contraseña debe tener al menos 8 caracteres"
      : !d.clave ? "Escribe tu contraseña" : "";
    if (falla) {
      error.textContent = falla;
      return sacudir(tarjeta);
    }
    enviar.disabled = true;
    enviar.classList.add("cargando");
    try {
      const url = { login: "/api/login", registro: "/api/registro", activar: "/api/activar" }[modo];
      const r = await pedirJSON("POST", url, modo === "activar" ? { ...d, tipo } : d);
      aviso(`Hola, ${r.usuario.nombre.split(/\s+/)[0]}`, modo === "login" ? "Sesión iniciada" : "Tu cuenta está lista");
      establecerSesion(r.usuario, r.preferencias);
    } catch (err) {
      error.textContent = err.message;
      sacudir(tarjeta);
      enviar.disabled = false;
      enviar.classList.remove("cargando");
    }
  });
  requestAnimationFrame(() => cambiar("login", false));
  entrarEnCascada(".acceso-marca > *, .tarjeta-acceso", vista, 50);
  return null;
}

// ------------------------------------------------------------------ verificar certificado (público)
async function vistaVerificar(v, param) {
  vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Verificar certificado</h2><p>Escribe el código de verificación impreso en el certificado para confirmar que es auténtico.</p></div></div>
    <div class="rejilla-panel"><form class="panel glass" id="verificar" novalidate>
      <div class="panel-cabeza"><h3>Código de verificación</h3></div>
      <div class="formulario"><label class="campo">Código<input name="codigo" placeholder="XXXX-XXXX-XXXX" maxlength="14" autocomplete="off" style="text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:.08em"></label>
        <div><button class="boton-solido" type="submit"><span>Verificar</span></button></div></div>
      <div id="resultado-verificacion" style="margin-top:14px"></div></form>
      <section class="panel glass"><div class="panel-cabeza"><h3>¿Cómo funciona?</h3></div>
        <p class="tenue" style="margin:0">Cada certificado que emite Campus tiene un código único. Al verificarlo se muestran el tipo, la fecha y el nombre del titular, con el documento parcialmente oculto.</p></section></div>`;
  const form = $("#verificar", vista);
  async function verificar(codigo) {
    const caja = $("#resultado-verificacion", vista);
    try {
      const r = await pedirJSON("GET", `/api/verificar/${encodeURIComponent(codigo)}`);
      caja.innerHTML = `<dl class="ficha"><span class="ficha-titulo">✓ Certificado auténtico</span>
        <div><dt>Tipo</dt><dd>${esc(r.titulo)}</dd></div><div><dt>Emitido</dt><dd>${fechaHora(r.fecha)}</dd></div>
        <div><dt>Titular</dt><dd>${esc(r.nombre)}</dd></div><div><dt>Documento</dt><dd>${esc(r.documento)}</dd></div>
        <div class="ancho"><dt>Programa</dt><dd>${esc(r.programa || "—")}</dd></div></dl>`;
    } catch {
      caja.innerHTML = `<div class="nota-aviso">${IC.aviso}<span><b>No encontramos ese código.</b> Revisa que esté bien escrito; el certificado podría no ser auténtico.</span></div>`;
      sacudir(form);
    }
    entrarEnCascada("#resultado-verificacion > *", vista);
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const codigo = form.codigo.value.trim().toUpperCase();
    if (codigo) verificar(codigo);
  });
  if (param) {
    form.codigo.value = param;
    verificar(param);
  }
  entrarEnCascada(".pagina-cabeza, .panel", vista);
  return null;
}

// ------------------------------------------------------------------ catálogo de cursos
async function vistaCatalogo(soloFavoritos) {
  let programas = (await api("GET", "/api/oferta")).programas;
  const abiertos = new Set(soloFavoritos ? programas.map((p) => p.id) : programas.filter((p) => p.materias.length).slice(0, 1).map((p) => p.id));
  const conFavoritos = estado.usuario?.rol === "general";
  let filtro = "";
  function filas(p) {
    const lista = [];
    for (const m of p.materias) for (const g of m.grupos) lista.push({ m, g });
    const visibles = lista.filter(({ m, g }) => !filtro || `${m.nombre} ${g.profesor} ${g.id} ${p.nombre}`.toLowerCase().includes(filtro));
    if (!visibles.length) return `<p class="cargando-texto">${lista.length ? "Sin resultados para la búsqueda" : "Este programa aún no publica cursos."}</p>`;
    return `<div class="tabla-envoltura"><table class="tabla tabla-responsiva"><thead><tr><th>Curso</th><th>Materia</th><th class="num">Créditos</th><th>Docente</th><th>Horario</th><th>Período</th><th>Cupo</th></tr></thead>
      <tbody>${visibles.map(({ m, g }) => `<tr data-grupo="${g.id}"><td><span class="codigo-curso">${codigoCurso(g.id)}</span></td><td><strong>${esc(m.nombre)}</strong></td>
        <td class="num ocultable">${m.creditos}</td><td class="ocultable">${esc(g.profesor || "Por asignar")}</td><td class="tenue">${horarioCorto(g.horario, "Por definir")}</td>
        <td class="tenue ocultable">${esc(g.periodo || "")}</td><td data-col="cupo">${cupoHTML(g.inscritos, g.cupo)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function pintar(animar) {
    const favs = new Set(estado.preferencias?.favoritos || []);
    const lista = soloFavoritos ? programas.filter((p) => favs.has(p.id)) : programas;
    const total = programas.reduce((s, p) => s + p.materias.reduce((t, m) => t + m.grupos.length, 0), 0);
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>${soloFavoritos ? "Programas favoritos" : "Catálogo de cursos"}</h2>
        <p>${soloFavoritos ? "Los programas que marcaste con el corazón." : `${programas.length} programas · ${total} cursos · cupos en tiempo real`}</p></div>
        ${!estado.usuario ? `<button class="boton-solido" type="button" data-accion="ingresar">Ingresar para inscribirme</button>` : ""}</div>
      ${lista.length ? lista.map((p) => `<article class="programa-bloque glass ${abiertos.has(p.id) ? "abierto" : ""}" data-id="${p.id}">
        <div class="programa-titulo" role="button" tabindex="0" aria-expanded="${abiertos.has(p.id)}">
          <div><h3>${esc(p.nombre)}</h3><p>${esc(p.facultad)} · ${p.duracion} semestres · ${p.materias.length} materias</p></div>
          ${conFavoritos ? `<button class="favorito-prog" type="button" aria-pressed="${favs.has(p.id)}" aria-label="Favorito">${IC.corazon}</button>` : "<span></span>"}${IC.abajo}
        </div><div class="programa-cuerpo"><div>${filas(p)}</div></div></article>`).join("")
        : `<div class="panel glass">${vacioHTML("Aún no tienes favoritos", "Marca con el corazón los programas que te interesan en el catálogo.", `<a class="boton-solido" href="#/catalogo">Ir al catálogo</a>`)}</div>`}`;
    if (animar) entrarEnCascada(".pagina-cabeza, .programa-bloque, .panel", vista, 40);
  }
  vista.onclick = async (e) => {
    const fav = e.target.closest(".favorito-prog");
    const cabeza = e.target.closest(".programa-titulo");
    if (fav) {
      e.stopPropagation();
      const id = Number(fav.closest(".programa-bloque").dataset.id);
      const lista = new Set(estado.preferencias?.favoritos || []);
      const ahora = !lista.has(id);
      ahora ? lista.add(id) : lista.delete(id);
      fav.setAttribute("aria-pressed", ahora);
      await guardarPreferencias({ favoritos: [...lista] });
      aviso(ahora ? "Guardado en favoritos" : "Quitado de favoritos", "");
      if (soloFavoritos) pintar(false);
    } else if (cabeza) {
      const art = cabeza.closest(".programa-bloque");
      const id = Number(art.dataset.id);
      const abrir = !abiertos.has(id);
      abrir ? abiertos.add(id) : abiertos.delete(id);
      art.classList.toggle("abierto", abrir);
      cabeza.setAttribute("aria-expanded", abrir);
    }
  };
  vista.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && e.target.classList.contains("programa-titulo") && (e.preventDefault(), e.target.click());
  pintar(true);
  return {
    alBuscar(texto) {
      filtro = texto;
      if (texto) programas.forEach((p) => abiertos.add(p.id));
      pintar(false);
    },
    async alEvento(ev) {
      if (!["matricula", "matricula_retirada", "matricula_cambiada", "cupo", "grupo_creado"].includes(ev.accion)) return;
      programas = (await api("GET", "/api/oferta")).programas;
      pintar(false);
      $$(`tr[data-grupo="${ev.detalle?.grupo}"]`, vista).forEach((tr) => tr.classList.add("actualizada"));
    },
  };
}

// ------------------------------------------------------------------ menú de cuenta, notificaciones y preferencias
let flotante = null;
function cerrarFlotante() {
  if (!flotante) return;
  const f = flotante;
  flotante = null;
  capas.quitar(cerrarFlotante);
  f.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-6px)" }], { duration: dur(150), easing: SALIDA, fill: "forwards" }).finished.then(() => f.remove(), () => f.remove());
}
function abrirFlotante(boton, clase, html) {
  cerrarFlotante();
  flotante = document.createElement("div");
  flotante.className = `${clase} glass glass-fuerte`;
  flotante.innerHTML = html;
  document.body.append(flotante);
  const r = boton.getBoundingClientRect();
  flotante.style.top = `${r.bottom + 10}px`;
  flotante.style.right = `${Math.max(10, innerWidth - r.right)}px`;
  capas.abrir(cerrarFlotante);
  flotante.animate([{ opacity: 0, transform: "translateY(-8px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: dur(280), easing: RESORTE });
  return flotante;
}
document.addEventListener("pointerdown", (e) => {
  if (flotante && !flotante.contains(e.target) && !e.target.closest("[data-accion='menu'], [data-accion='notificaciones']")) cerrarFlotante();
});

function abrirMenu(boton) {
  const u = estado.usuario;
  const m = abrirFlotante(boton, "menu-cuenta", `
    <div class="menu-usuario"><span class="avatar grande"><span class="inicial">${esc(iniciales(u.nombre))}</span></span>
      <div><strong>${esc(u.nombre)}</strong><span>${esc(u.correo)}</span></div></div>
    <button type="button" data-m="preferencias">Preferencias</button>
    <button type="button" data-m="salir">Cerrar sesión</button>`);
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    cerrarFlotante();
    b.dataset.m === "salir" ? cerrarSesion() : abrirPreferencias();
  });
}

async function abrirNotificaciones(boton) {
  const nuevos = estado.pendientes;
  estado.pendientes = 0;
  contarPendiente();
  const panel = abrirFlotante(boton, "panel-notifs", `<h3>Notificaciones</h3><p class="cargando-texto">Cargando…</p>`);
  try {
    const { eventos } = await api("GET", "/api/actividad");
    if (flotante === panel) panel.innerHTML = `<h3>Notificaciones</h3>${lineaTiempoHTML(eventos, nuevos)}`;
  } catch (err) {
    panel.innerHTML = `<h3>Notificaciones</h3><p class="cargando-texto">${esc(err.message)}</p>`;
  }
}

function abrirPreferencias() {
  const actual = estado.preferencias?.tema === "opaco" ? "opaco" : "vidrio";
  const conLuz = estado.preferencias?.luz !== false;
  const menuActual = estado.preferencias?.menu === "superior" ? "superior" : "lateral";
  const { modal } = abrirModal(`
    <div class="modal-cabeza"><div><h2>Preferencias</h2><p>Se guardan en tu cuenta y se aplican en cualquier dispositivo.</p></div>
      <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    <div class="opcion-pref"><div><strong>Vidrio</strong><span>Esmerilado translúcido, u opaco si tu equipo va lento</span></div>
      <div class="segmentado" id="pref-tema"><span class="segmentado-indicador"></span>
        ${[["vidrio", "Vidrio"], ["opaco", "Opaco"]].map(([v, t]) => `<button type="button" data-tema="${v}" aria-pressed="${actual === v}">${t}</button>`).join("")}</div></div>
    <div class="opcion-pref"><div><strong>Menú</strong><span>Barra superior con desplegables o barra lateral</span></div>
      <div class="segmentado" id="pref-menu"><span class="segmentado-indicador"></span>
        ${[["lateral", "Lateral"], ["superior", "Superior"]].map(([v, t]) => `<button type="button" data-menu="${v}" aria-pressed="${menuActual === v}">${t}</button>`).join("")}</div></div>
    <div class="opcion-pref"><div><strong>Luz del puntero</strong><span>Un brillo suave que sigue al mouse por los bordes</span></div>
      <button class="interruptor" type="button" role="switch" id="pref-luz" aria-checked="${conLuz}" aria-label="Luz del puntero"></button></div>
    <p class="acceso-legal" id="pref-estado" style="justify-content:flex-start;margin-top:10px">${ICONOS.check}Sincronizado</p>`);
  const temas = $("#pref-tema", modal);
  const guardar = async (cambios) => {
    $("#pref-estado", modal).textContent = "Guardando…";
    const ok = await guardarPreferencias(cambios);
    if (modal.isConnected) $("#pref-estado", modal).innerHTML = ok ? `${ICONOS.check}Guardado` : "No se pudo guardar";
  };
  requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", temas), $(`button[data-tema="${actual}"]`, temas), false));
  temas.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tema]");
    if (!b) return;
    $$("button", temas).forEach((x) => x.setAttribute("aria-pressed", x === b));
    deslizarIndicador($(".segmentado-indicador", temas), b);
    guardar({ tema: b.dataset.tema });
  });
  const menus = $("#pref-menu", modal);
  requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", menus), $(`button[data-menu="${menuActual}"]`, menus), false));
  menus.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-menu]");
    if (!b) return;
    $$("button", menus).forEach((x) => x.setAttribute("aria-pressed", x === b));
    deslizarIndicador($(".segmentado-indicador", menus), b);
    guardar({ menu: b.dataset.menu });
  });
  $("#pref-luz", modal).addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-checked") !== "true";
    e.currentTarget.setAttribute("aria-checked", String(on));
    guardar({ luz: on });
  });
}

// ------------------------------------------------------------------ vincular cuenta (público general -> estudiante o profesor)
async function vistaVincular(v, param) {
  const destino = param && TITULOS[param] ? TITULOS[param] : null;
  tituloPagina("Vincular mi cuenta");
  v.innerHTML = `<div class="pagina-cabeza"><div><h2>Vincular mi cuenta</h2>
      <p>${destino ? `<b>${esc(destino)}</b> es parte del portal estudiantil. ` : ""}Convierte tu cuenta de público general en cuenta de estudiante o docente para ver tus asignaturas, tu horario y todos los trámites.</p></div></div>
    <div class="rejilla-panel">
      <section class="panel glass"><div class="panel-cabeza"><h3>Datos institucionales</h3></div>
        <form class="formulario" novalidate>
          <div class="segmentado pestañas" role="group" aria-label="Tipo de cuenta"><span class="segmentado-indicador" aria-hidden="true"></span>
            <button type="button" data-tipo="estudiante" aria-pressed="true">Soy estudiante</button><button type="button" data-tipo="profesor" aria-pressed="false">Soy docente</button></div>
          <label class="campo"><span id="et-doc">Número de documento</span><input name="documento" inputmode="numeric" autocomplete="off" required></label>
          <label class="campo">Correo institucional<input name="correo" type="email" value="${esc(estado.usuario.correo)}" autocomplete="email" required></label>
          <label class="campo">Contraseña actual de Campus<input name="clave" type="password" autocomplete="current-password" required></label>
          <p class="error-texto" role="alert"></p>
          <button class="boton-solido grande" type="submit">${IC.persona}<span>Vincular cuenta</span></button>
        </form></section>
      <section class="panel glass"><div class="panel-cabeza"><h3>¿Por qué lo pedimos?</h3></div>
        <p class="tenue">El documento y el correo institucional deben coincidir con tu registro académico. Así nadie puede ver tus notas creando una cuenta con tu correo.
          La contraseña confirma que esta cuenta es tuya. Tu contraseña no cambia.</p>
        <ul class="lista-desbloqueo">${["Asignaturas e inscripción", "Horario semanal", "Orden de matrícula y pagos", "Certificados y registro académico", "Aula virtual y laboratorios"].map((t) => `<li>${IC.candado}<span>${t}</span></li>`).join("")}</ul></section>
    </div>`;
  const form = $("form", v);
  let tipo = "estudiante";
  const seg = $(".segmentado", form);
  requestAnimationFrame(() => deslizarIndicador($(".segmentado-indicador", seg), $("button", seg), false));
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]");
    if (!b) return;
    tipo = b.dataset.tipo;
    $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    deslizarIndicador($(".segmentado-indicador", seg), b);
    $("#et-doc", form).textContent = tipo === "estudiante" ? "Número de documento" : "Código de docente";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = $("button[type=submit]", form);
    boton.disabled = true;
    boton.classList.add("cargando");
    try {
      const r = await api("POST", "/api/vincular", { tipo, documento: form.documento.value, correo: form.correo.value, clave: form.clave.value });
      aviso("Cuenta vinculada", `Ahora entras como ${tipo === "estudiante" ? "estudiante" : "docente"}`);
      estado.periodos = [];
      location.replace("#/inicio");
      await establecerSesion(r.usuario, r.preferencias);
    } catch (err) {
      $(".error-texto", form).textContent = err.message;
      sacudir(form);
      boton.disabled = false;
      boton.classList.remove("cargando");
    }
  });
  entrarEnCascada(".pagina-cabeza, .panel", v, 50);
}

// ------------------------------------------------------------------ tiempo real
let canal = null;
let generacion = 0;
function reconectar() {
  const mia = ++generacion;
  canal?.cerrar();
  canal = conectarEnVivo({
    onEvento: (ev) => {
      if (mia !== generacion) return;
      if (ev.paraMi && estado.usuario) {
        if (ev.accion === "usuario_estado" && ev.detalle?.activa === false) {
          aviso("Tu cuenta fue desactivada", "Comunícate con la administración", "error");
          return establecerSesion(null, null);
        }
        if (!["login", "logout", "preferencias"].includes(ev.accion) && ev.actor?.id !== estado.usuario.id) {
          estado.pendientes += 1;
          contarPendiente();
          aviso(ev.texto, detalleEvento(ev));
        }
      }
      if (ev.accion === "publicacion" && estado.usuario) aviso("Nueva publicación", ev.detalle?.titulo || "");
      estado.vista?.alEvento?.(ev);
    },
  });
}

// ------------------------------------------------------------------ inicio
try {
  const r = await pedirJSON("GET", "/api/sesion");
  establecerSesion(r.usuario, r.preferencias);
} catch {
  establecerSesion(null, null);
}
