// Bolsa de compras: panel lateral, cantidades, envío gratis y compra.
// La bolsa se recuerda en este navegador (localStorage); los precios siempre se
// leen del catálogo en vivo, así que un cambio del admin se refleja aquí también.
// Al finalizar, el servidor recalcula el total con los precios de MongoDB.
import {
  $, $$, ICONOS, RESORTE, SALIDA, almacen, animarNumero, aviso, capas, dur, esc, moneda, pedirJSON, precioFinal,
} from "./comun.js";
import { hexSeguro, svgPrenda } from "./prendas.js";
import { pedirSesion, sesion } from "./cuenta.js";

const ENVIO_GRATIS = 250000;
const COSTO_ENVIO = 12000;

let productos = new Map();
let lineas = almacen.leer("bolsa", []).filter((l) => l && typeof l.id === "string");
let abierta = null; // { capa, cajon, velo, vista }

const botonBolsa = $("#bolsa");
const cuenta = $("#bolsa-cuenta");

const guardar = () => almacen.guardar("bolsa", lineas);
const validas = () => lineas.filter((l) => productos.has(l.id));
const unidades = () => validas().reduce((s, l) => s + l.cantidad, 0);
const subtotal = () => validas().reduce((s, l) => s + precioFinal(productos.get(l.id)) * l.cantidad, 0);

export function iniciarBolsa(mapa) {
  productos = mapa;
  pintarContador(false);
}

function pintarContador(animar = true) {
  const n = unidades();
  cuenta.hidden = n === 0;
  cuenta.textContent = n;
  botonBolsa.setAttribute("aria-label", n ? `Abrir bolsa de compras, ${n} ${n === 1 ? "prenda" : "prendas"}` : "Abrir bolsa de compras");
  if (animar && n) cuenta.animate([{ transform: "scale(.2)" }, { transform: "scale(1)" }], { duration: dur(700), easing: RESORTE });
}

/** Agrega una prenda; si ya está con la misma talla y color, suma una unidad. */
export function agregar(p, talla, color, origen) {
  const existente = lineas.find((l) => l.id === p._id && l.talla === talla && l.color === color);
  if (existente) existente.cantidad = Math.min(10, existente.cantidad + 1);
  else lineas.push({ id: p._id, talla, color, cantidad: 1 });
  guardar();
  volarABolsa(origen, p, color);
  setTimeout(() => pintarContador(), dur(origen ? 620 : 0));
  aviso("Agregado a la bolsa", `${p.nombre} · ${talla} · ${p.colores[color]?.nombre ?? ""}`);
  if (abierta?.vista === "bolsa") pintarVista("bolsa", false);
}

/** Una copia pequeña de la prenda vuela en arco hasta el botón de la bolsa. */
function volarABolsa(origen, p, color) {
  if (!origen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = origen.getBoundingClientRect();
  const b = botonBolsa.getBoundingClientRect();
  if (!a.width) return;
  const vuelo = document.createElement("div");
  vuelo.className = "vuelo";
  vuelo.innerHTML = svgPrenda(p.prenda, hexSeguro(p.colores[color]?.hex));
  Object.assign(vuelo.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(vuelo);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const s = Math.max(0.06, 28 / a.width);
  vuelo.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(${(1 + s) / 2.4})`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2, filter: "blur(2px)" },
    ],
    { duration: 720, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" }
  ).finished.then(() => {
    vuelo.remove();
    botonBolsa.animate([{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }],
      { duration: 520, easing: RESORTE });
  });
}

/** Llamado cuando cambia el catálogo (precios en vivo). */
export function refrescarBolsa() {
  pintarContador(false);
  if (abierta?.vista === "bolsa") pintarVista("bolsa", false, true);
}

// ------------------------------------------------------------------ panel
export function abrirBolsa(vista = "bolsa") {
  if (abierta) {
    pintarVista(vista, true);
    return;
  }
  const capa = document.createElement("div");
  capa.className = "capa-cajon";
  capa.innerHTML = `<div class="velo"></div>
    <aside class="cajon glass glass-fuerte" role="dialog" aria-modal="true" aria-label="Bolsa de compras"></aside>`;
  document.body.append(capa);
  const cajon = $(".cajon", capa);
  const velo = $(".velo", capa);
  abierta = { capa, cajon, velo, vista };
  capas.abrir(cerrarBolsa);
  velo.addEventListener("click", cerrarBolsa);
  cajon.addEventListener("click", clicCajon);
  pintarVista(vista, true);
  velo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(420), easing: "ease-out", fill: "both" });
  cajon.animate([{ transform: "translateX(calc(100% + 40px))" }, { transform: "none" }], { duration: dur(820), easing: RESORTE });
}

export async function cerrarBolsa() {
  if (!abierta || abierta.cerrando) return;
  abierta.cerrando = true;
  const { capa, cajon, velo } = abierta;
  capas.quitar(cerrarBolsa);
  velo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(380), easing: SALIDA, fill: "forwards" });
  await cajon.animate([{ transform: "none" }, { transform: "translateX(calc(100% + 40px))" }],
    { duration: dur(420), easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }).finished.catch(() => {});
  capa.remove();
  abierta = null;
}

function cabecera(titulo, extra = "") {
  return `<header class="cajon-cabecera"><h2>${titulo}${extra}</h2>
    <button class="boton-vidrio boton-redondo" type="button" data-accion="cerrar" aria-label="Cerrar">${ICONOS.cerrar}</button></header>`;
}

function lineaHTML(l, i) {
  const p = productos.get(l.id);
  const c = p.colores[l.color] ?? p.colores[0];
  const unitario = precioFinal(p);
  return `<li class="linea" data-i="${i}">
    <div class="linea-mini">${svgPrenda(p.prenda, hexSeguro(c?.hex))}</div>
    <div class="linea-info">
      <strong>${esc(p.nombre)}</strong>
      <span>${esc(c?.nombre ?? "")} · Talla ${esc(l.talla)}</span>
      <div class="cantidad" role="group" aria-label="Cantidad">
        <button type="button" data-accion="menos" aria-label="Quitar una">−</button>
        <output>${l.cantidad}</output>
        <button type="button" data-accion="mas" aria-label="Agregar una">+</button>
      </div>
    </div>
    <div class="linea-precio">
      <span class="precio" data-valor="${unitario * l.cantidad}">${moneda(unitario * l.cantidad)}</span>
      ${p.descuento ? `<s class="antes">${moneda(p.precio * l.cantidad)}</s>` : ""}
      <button type="button" class="boton-texto quitar-linea" data-accion="quitar">Quitar</button>
    </div>
  </li>`;
}

function resumenHTML() {
  const sub = subtotal();
  const envio = sub >= ENVIO_GRATIS ? 0 : COSTO_ENVIO;
  const falta = Math.max(0, ENVIO_GRATIS - sub);
  return {
    progreso: `<div class="envio-progreso">
        <p>${falta ? `Te faltan <strong>${moneda(falta)}</strong> para el envío gratis` : `${ICONOS.check} Tu envío es <strong>gratis</strong>`}</p>
        <div class="barra-progreso"><i style="--p:${Math.min(100, (sub / ENVIO_GRATIS) * 100).toFixed(1)}%"></i></div>
      </div>`,
    pie: `<footer class="cajon-pie">
        <dl class="resumen">
          <dt>Subtotal</dt><dd><span class="precio" data-r="sub" data-valor="${sub}">${moneda(sub)}</span></dd>
          <dt>Envío</dt><dd>${envio ? moneda(envio) : "Gratis"}</dd>
          <dt class="total">Total</dt><dd class="total"><span class="precio" data-r="total" data-valor="${sub + envio}">${moneda(sub + envio)}</span></dd>
        </dl>
        <button class="boton-solido grande pagar" type="button" data-accion="pagar"><span>Finalizar compra</span>${ICONOS.flecha}</button>
        <p class="seguro">${ICONOS.candado} Pago seguro · Cambios gratis en 30 días</p>
      </footer>`,
  };
}

function pintarVista(vista, animar, conservarNumeros = false) {
  const { cajon } = abierta;
  abierta.vista = vista;
  // Conserva el valor mostrado para animar el cambio de precio
  const previos = conservarNumeros
    ? Object.fromEntries($$("[data-r]", cajon).map((el) => [el.dataset.r, el.dataset.valor]))
    : {};

  if (vista === "bolsa") {
    lineas = lineas.filter((l) => productos.has(l.id) || !productos.size);
    const items = validas();
    if (!items.length) {
      cajon.innerHTML = cabecera("Tu bolsa") + `<div class="cajon-vacio">
        <div class="vacio-icono">${svgPrenda("camiseta", "#8e8e93")}</div>
        <h3>Tu bolsa está vacía</h3><p>Explora la colección y agrega tus prendas favoritas.</p>
        <button class="boton-solido" type="button" data-accion="cerrar">Seguir comprando</button></div>`;
    } else {
      const r = resumenHTML();
      cajon.innerHTML = cabecera("Tu bolsa", ` <span>(${unidades()})</span>`) + r.progreso +
        `<ul class="lineas">${lineas.map((l, i) => (productos.has(l.id) ? lineaHTML(l, i) : "")).join("")}</ul>` + r.pie;
    }
  }
  if (conservarNumeros) {
    $$("[data-r]", cajon).forEach((el) => {
      if (previos[el.dataset.r] != null) {
        const destino = Number(el.dataset.valor);
        el.dataset.valor = previos[el.dataset.r];
        animarNumero(el, destino);
      }
    });
  }
  if (animar) {
    $$(".cajon-cabecera, .envio-progreso, .linea, .cajon-pie, .cajon-vacio > *, .exito > *, .pedido", cajon).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }],
        { duration: dur(700), delay: dur(80 + i * 45), easing: RESORTE, fill: "backwards" })
    );
  }
}

async function clicCajon(e) {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const accion = b.dataset.accion;
  const fila = b.closest(".linea");
  const l = fila ? lineas[Number(fila.dataset.i)] : null;

  if (accion === "cerrar") cerrarBolsa();
  else if (accion === "mas" && l) {
    if (l.cantidad >= 10) return aviso("Máximo 10 unidades por prenda", "", "error");
    l.cantidad += 1;
    cambioCantidad(fila, l);
  } else if (accion === "menos" && l) {
    if (l.cantidad === 1) return quitarLinea(fila, l);
    l.cantidad -= 1;
    cambioCantidad(fila, l);
  } else if (accion === "quitar" && l) quitarLinea(fila, l);
  else if (accion === "pagar") pagar(b);
}

function cambioCantidad(fila, l) {
  guardar();
  pintarContador();
  const out = $("output", fila);
  out.textContent = l.cantidad;
  out.animate([{ transform: "translateY(-6px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: dur(360), easing: RESORTE });
  pintarVista("bolsa", false, true);
}

async function quitarLinea(fila, l) {
  // La fila se desliza, luego colapsa su altura para que las demás suban suavemente
  const h = fila.offsetHeight;
  await fila.animate(
    [
      { opacity: 1, transform: "none", height: `${h}px` },
      { opacity: 0, transform: "translateX(48px)", height: `${h}px`, offset: 0.45 },
      { opacity: 0, transform: "translateX(48px)", height: "0px", paddingTop: "0px", paddingBottom: "0px", marginBottom: "-1px" },
    ],
    { duration: dur(560), easing: SALIDA, fill: "forwards" }
  ).finished.catch(() => {});
  lineas.splice(lineas.indexOf(l), 1);
  guardar();
  pintarContador(false);
  pintarVista("bolsa", !validas().length, true);
}

async function pagar(b) {
  if (!sesion.usuario) {
    const u = await pedirSesion("Inicia sesión o crea tu cuenta para finalizar la compra.");
    if (!u || !abierta) return;
  }
  b.disabled = true;
  b.classList.add("cargando");
  $("span", b).textContent = "Procesando pago…";
  try {
    const items = validas().map(({ id, talla, color, cantidad }) => ({ id, talla, color, cantidad }));
    const { pedido } = await pedirJSON("POST", "/api/pedidos", { items });
    lineas = [];
    guardar();
    pintarContador(false);
    mostrarExito(pedido);
  } catch (err) {
    aviso("No se pudo completar la compra", err.message, "error");
    if (abierta) pintarVista("bolsa", false);
  }
}

function mostrarExito(pedido) {
  if (!abierta) return;
  abierta.vista = "exito";
  const nombre = sesion.usuario?.nombre.split(/\s+/)[0] ?? "";
  abierta.cajon.innerHTML = cabecera("Compra confirmada") + `<div class="exito">
      <svg class="sello" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34"/><path d="M25 41.5 35.5 52 56 30"/></svg>
      <h3>¡Gracias${nombre ? `, ${esc(nombre)}` : ""}!</h3>
      <p>Tu pedido <strong>${esc(pedido.numero)}</strong> quedó confirmado y guardado en MongoDB.</p>
      <dl class="resumen">
        <dt>Prendas</dt><dd>${pedido.items.reduce((s, it) => s + it.cantidad, 0)}</dd>
        <dt>Envío</dt><dd>${pedido.envio ? moneda(pedido.envio) : "Gratis"}</dd>
        <dt class="total">Total pagado</dt><dd class="total">${moneda(pedido.total)}</dd>
      </dl>
      <button class="boton-solido grande" type="button" data-accion="cerrar">Seguir comprando</button>
    </div>`;
  $$(".exito > *", abierta.cajon).forEach((el, i) =>
    el.animate([{ opacity: 0, transform: "translateY(16px) scale(.98)" }, { opacity: 1, transform: "none" }],
      { duration: dur(700), delay: dur(i * 70), easing: RESORTE, fill: "backwards" })
  );
}

async function verPedidos() {
  if (!sesion.usuario) return;
  abrirBolsa("pedidos");
  abierta.vista = "pedidos";
  abierta.cajon.innerHTML = cabecera("Mis pedidos") + `<div class="pedidos"><p class="cargando-texto">Cargando…</p></div>`;
  try {
    const { pedidos } = await pedirJSON("GET", "/api/pedidos");
    if (!abierta || abierta.vista !== "pedidos") return;
    const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
    $(".pedidos", abierta.cajon).innerHTML = pedidos.length
      ? pedidos.map((p) => `<article class="pedido">
          <div class="pedido-cabeza"><strong>${esc(p.numero)}</strong><span class="chip-estado">${ICONOS.check}${esc(p.estado)}</span></div>
          <p>${fecha.format(new Date(p.creado))}</p>
          <ul>${p.items.map((it) => `<li><span>${it.cantidad} × ${esc(it.nombre)}</span><span>${esc(it.color)} · ${esc(it.talla)}</span></li>`).join("")}</ul>
          <div class="pedido-total"><span>Total</span><strong>${moneda(p.total)}</strong></div>
        </article>`).join("")
      : `<div class="cajon-vacio"><h3>Aún no tienes pedidos</h3><p>Cuando compres, aparecerán aquí.</p></div>`;
    $$(".pedido", abierta.cajon).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
        { duration: dur(650), delay: dur(i * 60), easing: RESORTE, fill: "backwards" })
    );
  } catch (err) {
    if (abierta) $(".pedidos", abierta.cajon).innerHTML = `<p class="cargando-texto">${esc(err.message)}</p>`;
  }
}

botonBolsa.addEventListener("click", () => (abierta ? cerrarBolsa() : abrirBolsa()));
document.addEventListener("ver-pedidos", verPedidos);
sesion.alCambiar((u) => {
  if (!u && abierta?.vista === "pedidos") cerrarBolsa();
});
