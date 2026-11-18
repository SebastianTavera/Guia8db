// Panel de administración: crea, edita (precios, colores, descuentos) y elimina productos.
// Cada cambio se guarda en MongoDB y la tienda lo recibe en tiempo real.
import {
  $, $$, RESORTE, SALIDA, aviso, animarNumero, conectarEnVivo, dur, esc, iniciarLuz,
  moneda, pintarEstado, precioFinal, reacomodar, sacudir,
} from "./comun.js";
import { hexSeguro, insertarDefs, svgPrenda, teñir } from "./prendas.js";

const CATEGORIAS = ["Camisas", "Camisetas", "Abrigos", "Pantalones", "Faldas", "Vestidos", "Accesorios"];
const GENEROS = ["Mujer", "Hombre"];
const PRENDAS = { camisa: "Camisa", camiseta: "Camiseta", buzo: "Buzo", chaqueta: "Chaqueta", abrigo: "Abrigo largo", pantalon: "Pantalón", falda: "Falda", vestido: "Vestido", gorra: "Gorra" };
const TALLAS = ["XS", "S", "M", "L", "XL"];
const SPECS = { material: "Material", ajuste: "Ajuste", cuidado: "Cuidado", origen: "Origen" };
const CAMPOS = ["nombre", "genero", "categoria", "prenda", "descripcion", "precio", "descuento", "colores", "tallas", "especificaciones"];

const productos = new Map();
let seleccion = null; // id del producto o "nuevo"
let original = null; // copia del producto tal como está en la BD
let borrador = null; // copia editable
let vistaColor = 0;
let clave = "";

const items = $("#items");
const editor = $("#editor");
const estado = $("#estado");
const acceso = $("#acceso");

insertarDefs();
const luz = iniciarLuz();

const clonar = (o) => structuredClone(o);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ acceso
try { clave = sessionStorage.getItem("clave-admin") || ""; } catch { /* almacenamiento no disponible */ }

async function verificar(c) {
  const r = await fetch("/api/admin/verificar", { method: "POST", headers: { "X-Admin-Key": c } });
  return r.ok;
}

function pedirClave(mensaje = "") {
  acceso.hidden = false;
  $("#error-acceso").textContent = mensaje;
  const form = $("form", acceso);
  form.animate([{ opacity: 0, transform: "scale(.94)", filter: "blur(10px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: dur(700), easing: RESORTE });
  setTimeout(() => $("#clave").focus(), 50);
}

$("#form-acceso").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = $("#clave").value;
  if (await verificar(c).catch(() => false)) {
    clave = c;
    try { sessionStorage.setItem("clave-admin", c); } catch { /* ignorado */ }
    await acceso.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(350), easing: SALIDA }).finished;
    acceso.hidden = true;
    $("#clave").value = "";
    iniciar();
  } else {
    $("#error-acceso").textContent = "Clave incorrecta";
    sacudir($("form", acceso));
  }
});

$("#salir").addEventListener("click", () => {
  try { sessionStorage.removeItem("clave-admin"); } catch { /* ignorado */ }
  clave = "";
  location.reload();
});

async function api(metodo, url, cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json", "X-Admin-Key": clave },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401) {
    pedirClave("La sesión expiró, ingresa la clave de nuevo");
    throw new Error("No autorizado");
  }
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

// ------------------------------------------------------------------ lista
function filaHTML(p) {
  return `<button class="fila-prod" type="button" data-id="${esc(p._id)}" aria-current="${p._id === seleccion}">
    <span class="fila-mini">${svgPrenda(p.prenda, hexSeguro(p.colores?.[0]?.hex))}</span>
    <span><strong>${esc(p.nombre)}</strong><span>${esc(p.genero || "—")} · ${esc(p.categoria)}${p.resenas ? ` · ★ ${Number(p.calificacion).toFixed(1)}` : ""}</span></span>
    <span class="fila-precio">${moneda(precioFinal(p))}${p.descuento ? `<em>−${p.descuento} %</em>` : ""}</span>
  </button>`;
}

function pintarLista() {
  items.innerHTML = [...productos.values()].map(filaHTML).join("");
  $("#conteo").textContent = productos.size;
}

const fila = (id) => items.querySelector(`.fila-prod[data-id="${CSS.escape(id)}"]`);

function marcarSeleccion() {
  $$(".fila-prod", items).forEach((f) => f.setAttribute("aria-current", f.dataset.id === seleccion));
}

items.addEventListener("click", (e) => {
  const f = e.target.closest(".fila-prod");
  if (f && f.dataset.id !== seleccion) seleccionar(f.dataset.id);
});

$("#nuevo").addEventListener("click", () => seleccionar("nuevo"));

// ------------------------------------------------------------------ editor
function cambiosPendientes() {
  if (!borrador) return [];
  if (seleccion === "nuevo") return CAMPOS;
  return CAMPOS.filter((k) => !igual(borrador[k], original[k]));
}

function seleccionar(id, forzar = false) {
  if (!forzar && seleccion && cambiosPendientes().length && seleccion !== id) {
    sacudir($(".pie-editor", editor));
    aviso("Tienes cambios sin guardar", "Guárdalos o descártalos primero", "error");
    return;
  }
  seleccion = id;
  vistaColor = 0;
  if (id === "nuevo") {
    original = null;
    borrador = {
      nombre: "", genero: "Mujer", categoria: "Camisas", prenda: "camisa", descripcion: "",
      precio: 120000, descuento: 0,
      colores: [{ nombre: "Negro", hex: "#1c1c1e" }],
      tallas: ["S", "M", "L"],
      especificaciones: { material: "", ajuste: "", cuidado: "", origen: "" },
    };
  } else {
    const p = productos.get(id);
    if (!p) return;
    original = Object.fromEntries(CAMPOS.map((k) => [k, clonar(p[k] ?? (k === "especificaciones" ? {} : ""))]));
    original.especificaciones = { material: "", ajuste: "", cuidado: "", origen: "", ...original.especificaciones };
    borrador = clonar(original);
  }
  marcarSeleccion();
  pintarEditor(true);
}

function opciones(lista, actual) {
  return lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? "selected" : ""}>${esc(t)}</option>`).join("");
}

function pintarEditor(animar) {
  if (!borrador) {
    editor.innerHTML = `<p class="vacio">Selecciona un producto para editarlo.</p>`;
    return;
  }
  const b = borrador;
  const nuevo = seleccion === "nuevo";
  editor.innerHTML = `
    <div class="editor-cabecera">
      <div class="editor-vista">${svgPrenda(b.prenda, hexSeguro(b.colores[vistaColor]?.hex), "reposo")}</div>
      <div class="editor-titulo">
        <p class="sobretitulo" style="margin:0">${nuevo ? "Nuevo producto" : "Editando producto"}</p>
        <input class="campo-nombre" data-campo="nombre" value="${esc(b.nombre)}" placeholder="Nombre del producto" maxlength="60" aria-label="Nombre del producto">
        <div class="tres">
          <label class="campo">Género<select data-campo="genero">${opciones(GENEROS.map((g) => [g, g]), b.genero)}</select></label>
          <label class="campo">Categoría<select data-campo="categoria">${opciones(CATEGORIAS.map((c) => [c, c]), b.categoria)}</select></label>
          <label class="campo">Silueta<select data-campo="prenda">${opciones(Object.entries(PRENDAS), b.prenda)}</select></label>
        </div>
      </div>
    </div>

    <section class="seccion">
      <h3>Precio y descuento</h3>
      <div class="precio-panel">
        <label class="campo">Precio base (COP)
          <span class="con-prefijo"><input type="number" inputmode="numeric" min="1" max="50000000" step="1000" data-campo="precio" value="${Number.isFinite(b.precio) ? b.precio : ""}"></span>
        </label>
        <div class="campo">
          <div class="descuento-lectura"><span>Descuento</span><output id="lectura-desc">${b.descuento} %</output></div>
          <input type="range" class="deslizador" min="0" max="90" step="1" data-campo="descuento" value="${b.descuento}" aria-label="Descuento en porcentaje">
        </div>
      </div>
      <div class="resumen-precio"><span>Precio en tienda</span><s class="antes" id="res-antes"></s><strong id="res-final"></strong></div>
    </section>

    <section class="seccion">
      <h3>Colores</h3>
      <div class="colores-admin" id="colores"></div>
      <div class="nuevo-color">
        <input type="color" class="selector-nativo" id="nuevo-hex" value="#7a7a80" aria-label="Elegir color">
        <label class="campo">Nombre del color<input id="nuevo-nombre" maxlength="30" placeholder="Ej. Gris perla"></label>
        <button class="boton-vidrio" id="agregar-color" type="button" style="align-self:end;height:44px">Agregar</button>
      </div>
    </section>

    <section class="seccion">
      <h3>Tallas</h3>
      <div class="tallas" id="tallas">${TALLAS.map((t) => `<button type="button" class="chip" data-talla="${t}" aria-pressed="${b.tallas.includes(t)}">${t}</button>`).join("")}</div>
    </section>

    <section class="seccion">
      <h3>Especificaciones</h3>
      <div class="specs-admin">
        ${Object.entries(SPECS).map(([k, et]) => `<label class="campo">${et}<input data-spec="${k}" maxlength="80" value="${esc(b.especificaciones[k])}"></label>`).join("")}
      </div>
      <label class="campo">Descripción<textarea data-campo="descripcion" maxlength="280">${esc(b.descripcion)}</textarea></label>
    </section>

    <div class="pie-editor glass glass-fuerte">
      <span class="cambios" id="cambios"></span>
      <span id="zona-eliminar">${nuevo ? "" : `<button class="boton-texto" id="eliminar" type="button">Eliminar</button>`}</span>
      <button class="boton-vidrio" id="descartar" type="button">${nuevo ? "Cancelar" : "Descartar"}</button>
      <button class="boton-solido" id="guardar" type="button">${nuevo ? "Crear producto" : "Guardar cambios"}</button>
    </div>`;

  pintarColores();
  actualizarDerivados();

  const svg = $(".editor-vista .prenda", editor);
  setTimeout(() => svg.classList.remove("reposo"), dur(animar ? 220 : 0));
  if (animar) {
    $$(".editor-cabecera, .seccion", editor).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(14px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
        { duration: dur(650), delay: dur(i * 55), easing: RESORTE, fill: "backwards" })
    );
  }
  luz.refrescar();
}

function pintarColores() {
  $("#colores", editor).innerHTML = borrador.colores
    .map((c, i) => `<span class="color-admin" aria-pressed="${i === vistaColor}">
        <button type="button" class="pastilla" data-ver="${i}" style="--c:${hexSeguro(c.hex)}" aria-label="Previsualizar ${esc(c.nombre)}"></button>
        ${esc(c.nombre)}
        <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar ${esc(c.nombre)}">×</button>
      </span>`)
    .join("");
}

/** Recalcula la vista previa, el precio final y el contador de cambios. */
function actualizarDerivados() {
  const b = borrador;
  const desliz = $(".deslizador", editor);
  desliz.style.setProperty("--p", `${(b.descuento / 90) * 100}%`);
  $("#lectura-desc", editor).textContent = `${b.descuento} %`;

  const valido = Number.isFinite(b.precio) && b.precio > 0;
  const final = $("#res-final", editor);
  if (valido) {
    animarNumero(final, precioFinal(b));
    $("#res-antes", editor).textContent = b.descuento ? moneda(b.precio) : "";
  } else {
    final.textContent = "Precio inválido";
    delete final.dataset.valor;
    $("#res-antes", editor).textContent = "";
  }

  const n = cambiosPendientes().length;
  const nuevo = seleccion === "nuevo";
  $("#cambios", editor).textContent = nuevo ? "Producto sin publicar" : n ? `${n} ${n === 1 ? "cambio" : "cambios"} sin guardar` : "Sin cambios";
  $("#guardar", editor).disabled = !valido || !b.nombre.trim() || !b.colores.length || !b.tallas.length || (!nuevo && !n);
}

editor.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.campo) {
    const campo = t.dataset.campo;
    if (campo === "precio") borrador.precio = t.value === "" ? NaN : Math.round(Number(t.value));
    else if (campo === "descuento") borrador.descuento = Number(t.value);
    else borrador[campo] = t.value;
  } else if (t.dataset.spec) {
    borrador.especificaciones[t.dataset.spec] = t.value;
  }
  actualizarDerivados();
});

editor.addEventListener("change", (e) => {
  if (e.target.dataset.campo === "prenda") {
    const vista = $(".editor-vista", editor);
    vista.innerHTML = svgPrenda(borrador.prenda, hexSeguro(borrador.colores[vistaColor]?.hex), "reposo");
    const svg = $(".prenda", vista);
    svg.animate([{ opacity: 0, transform: "scale(.85)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: dur(650), easing: RESORTE });
    setTimeout(() => svg.classList.remove("reposo"), dur(200));
  }
});

editor.addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;

  if (t.dataset.ver !== undefined) {
    vistaColor = Number(t.dataset.ver);
    pintarColores();
    teñir($(".editor-vista .prenda", editor), borrador.colores[vistaColor].hex);
  } else if (t.dataset.quitar !== undefined) {
    if (borrador.colores.length === 1) {
      sacudir($("#colores", editor));
      aviso("Se necesita al menos un color", "", "error");
      return;
    }
    const i = Number(t.dataset.quitar);
    const chip = t.closest(".color-admin");
    await chip.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.7)", filter: "blur(6px)" }],
      { duration: dur(260), easing: SALIDA, fill: "forwards" }).finished;
    borrador.colores.splice(i, 1);
    if (vistaColor >= borrador.colores.length) vistaColor = 0;
    reacomodar(() => $$(".color-admin", editor), pintarColores);
    teñir($(".editor-vista .prenda", editor), borrador.colores[vistaColor].hex);
    actualizarDerivados();
  } else if (t.id === "agregar-color") {
    agregarColor();
  } else if (t.dataset.talla) {
    const talla = t.dataset.talla;
    borrador.tallas = borrador.tallas.includes(talla)
      ? borrador.tallas.filter((x) => x !== talla)
      : TALLAS.filter((x) => x === talla || borrador.tallas.includes(x));
    t.setAttribute("aria-pressed", borrador.tallas.includes(talla));
    actualizarDerivados();
  } else if (t.id === "guardar") {
    guardar(t);
  } else if (t.id === "descartar") {
    if (seleccion === "nuevo") {
      borrador = null;
      seleccionar([...productos.keys()][0] ?? null, true);
      if (!productos.size) pintarEditor(false);
    } else {
      borrador = clonar(original);
      vistaColor = 0;
      pintarEditor(false);
      aviso("Cambios descartados");
    }
  } else if (t.id === "eliminar") {
    $("#zona-eliminar", editor).innerHTML = `<span class="confirmar">
      <button class="boton-vidrio peligro" id="si-eliminar" type="button">Sí, eliminar</button>
      <button class="boton-texto" id="no-eliminar" type="button">No</button></span>`;
    $(".confirmar", editor).animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: dur(450), easing: RESORTE });
  } else if (t.id === "no-eliminar") {
    $("#zona-eliminar", editor).innerHTML = `<button class="boton-texto" id="eliminar" type="button">Eliminar</button>`;
  } else if (t.id === "si-eliminar") {
    eliminar(t);
  }
});

editor.addEventListener("keydown", (e) => {
  if (e.target.id === "nuevo-nombre" && e.key === "Enter") {
    e.preventDefault();
    agregarColor();
  }
});

function agregarColor() {
  const nombre = $("#nuevo-nombre", editor).value.trim();
  const hex = $("#nuevo-hex", editor).value.toLowerCase();
  if (!nombre) {
    sacudir($("#nuevo-nombre", editor));
    $("#nuevo-nombre", editor).focus();
    return;
  }
  if (borrador.colores.length >= 8) {
    aviso("Máximo 8 colores por producto", "", "error");
    return;
  }
  if (borrador.colores.some((c) => c.hex === hex)) {
    aviso("Ese color ya está en la lista", "", "error");
    return;
  }
  borrador.colores.push({ nombre, hex });
  vistaColor = borrador.colores.length - 1;
  pintarColores();
  const chip = $$(".color-admin", editor).at(-1);
  chip.animate([{ opacity: 0, transform: "scale(.6)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: dur(650), easing: RESORTE });
  teñir($(".editor-vista .prenda", editor), hex);
  $("#nuevo-nombre", editor).value = "";
  actualizarDerivados();
}

async function guardar(boton) {
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = "Guardando…";
  try {
    let p;
    if (seleccion === "nuevo") {
      ({ producto: p } = await api("POST", "/api/productos", borrador));
      aviso("Producto creado", `${p.nombre} ya aparece en la tienda`);
    } else {
      const cambios = Object.fromEntries(cambiosPendientes().map((k) => [k, borrador[k]]));
      ({ producto: p } = await api("PATCH", `/api/productos/${encodeURIComponent(seleccion)}`, cambios));
      aviso("Cambios guardados", "La tienda ya muestra la actualización");
    }
    recibir(p, true);
    borrador = null;
    seleccionar(p._id, true);
  } catch (err) {
    aviso("No se pudo guardar", err.message, "error");
    boton.textContent = textoOriginal;
    actualizarDerivados();
  }
}

async function eliminar(boton) {
  boton.disabled = true;
  const id = seleccion;
  const nombre = productos.get(id)?.nombre;
  try {
    await api("DELETE", `/api/productos/${encodeURIComponent(id)}`);
    aviso("Producto eliminado", nombre);
    borrador = null;
    retirar(id);
  } catch (err) {
    aviso("No se pudo eliminar", err.message, "error");
    boton.disabled = false;
  }
}

// ------------------------------------------------------------------ cambios en vivo
function destellarFila(f) {
  f?.animate([{ backgroundColor: "rgba(140, 140, 150, .28)" }, { backgroundColor: "rgba(140, 140, 150, 0)" }], { duration: dur(1200), easing: SALIDA });
}

function recibir(p, propio = false) {
  const previo = productos.get(p._id);
  if (previo && igual(previo, p)) return;
  productos.set(p._id, p);
  const f = fila(p._id);
  if (f) {
    f.outerHTML = filaHTML(p);
    destellarFila(fila(p._id));
  } else {
    items.insertAdjacentHTML("beforeend", filaHTML(p));
    fila(p._id).animate([{ opacity: 0, transform: "translateX(-14px)" }, { opacity: 1, transform: "none" }], { duration: dur(600), easing: RESORTE });
    $("#conteo").textContent = productos.size;
  }
  if (!propio && seleccion === p._id) {
    if (!cambiosPendientes().length) {
      seleccionar(p._id, true);
    } else {
      aviso("Este producto cambió en otra sesión", "Al guardar, tus cambios sobrescribirán esos campos", "error");
    }
  }
}

function retirar(id) {
  if (!productos.has(id)) return;
  productos.delete(id);
  const f = fila(id);
  if (f) reacomodar(() => $$(".fila-prod", items), () => f.remove());
  $("#conteo").textContent = productos.size;
  if (seleccion === id) {
    borrador = null;
    seleccion = null;
    const siguiente = [...productos.keys()][0];
    if (siguiente) seleccionar(siguiente, true);
    else pintarEditor(false);
  }
}

async function sincronizar() {
  try {
    const r = await fetch("/api/productos");
    const { productos: lista, modo } = await r.json();
    pintarEstado(estado, modo);
    const ids = new Set(lista.map((p) => p._id));
    [...productos.keys()].filter((id) => !ids.has(id)).forEach(retirar);
    lista.forEach((p) => recibir(p));
  } catch { /* se reintenta en la próxima reconexión */ }
}

// ------------------------------------------------------------------ inicio
let iniciado = false;
async function iniciar() {
  if (iniciado) return;
  iniciado = true;
  try {
    const r = await fetch("/api/productos");
    const { productos: lista, modo } = await r.json();
    pintarEstado(estado, modo);
    lista.forEach((p) => productos.set(p._id, p));
    pintarLista();
    $$(".fila-prod", items).forEach((f, i) =>
      f.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
        { duration: dur(600), delay: dur(i * 45), easing: RESORTE, fill: "backwards" })
    );
    if (lista.length) seleccionar(lista[0]._id);
    else pintarEditor(false);
  } catch {
    editor.innerHTML = `<p class="vacio">No se pudo conectar con el servidor.</p>`;
  }
  conectarEnVivo({
    onEstado: (modo) => pintarEstado(estado, modo),
    onReconexion: sincronizar,
    onEvento: (ev) => {
      if (ev.tipo === "upsert" && ev.producto) recibir(ev.producto);
      else if (ev.tipo === "delete") retirar(ev.id);
    },
  });
}

addEventListener("beforeunload", (e) => {
  if (cambiosPendientes().length && seleccion !== "nuevo") e.preventDefault();
});

if (clave && (await verificar(clave).catch(() => false))) iniciar();
else pedirClave();
