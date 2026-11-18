// Tienda (vista del cliente). Lee el catálogo de MongoDB y escucha los cambios
// en tiempo real (Change Streams / Server-Sent Events).
import {
  $, $$, ICONOS, RESORTE, SALIDA, almacen, animarNumero, aviso, capas, conectarEnVivo, cuotasTexto,
  deslizarIndicador, dur, esc, estrellasHTML, iniciarLuz, moneda, pedirJSON, precioFinal, reacomodar, sacudir,
} from "./comun.js";
import { hexSeguro, insertarDefs, svgPrenda, teñir } from "./prendas.js";
import { cargarSesion, pedirSesion, sesion } from "./cuenta.js";
import { agregar, iniciarBolsa, refrescarBolsa } from "./bolsa.js";

const ORDEN_CATEGORIAS = ["Camisas", "Camisetas", "Abrigos", "Pantalones", "Faldas", "Vestidos", "Accesorios"];
const PORTADAS = {
  Mujer: { sobre: "Colección Mujer · Otoño 2026", titulo: "Esenciales <span>que perduran.</span>" },
  Hombre: { sobre: "Colección Hombre · Otoño 2026", titulo: "Lo básico, <span>bien hecho.</span>" },
};

const productos = new Map(); // id -> producto
let genero = almacen.leer("genero", "Mujer");
if (!(genero in PORTADAS)) genero = "Mujer";
let filtro = "Todo";
let orden = "destacados";
let abierto = null; // { id, det, velo, origen, color, talla }
const favoritos = new Set(almacen.leer("favoritos", []));
const vitrina = { id: null, color: 0, temporizador: null };

const rejilla = $("#rejilla");
const filtros = $("#filtros");
const selectorGenero = $("#genero");
const selectorOrden = $("#orden");
const vitrinaEl = $("#vitrina");

insertarDefs();
const luz = iniciarLuz();
iniciarBolsa(productos);

// ------------------------------------------------------------------ plantillas
const colorDe = (p, i = 0) => hexSeguro(p.colores?.[i]?.hex);
/** Firma estable de un objeto (llaves ordenadas) para comparar versiones de un producto. */
const firma = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x);
const puntaje = (p) => (p.calificacion || 0) * Math.log10((p.resenas || 0) + 10);
const numero = (v) => (Number(v) || 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function muestrasHTML(p) {
  return (p.colores || [])
    .slice(0, 5)
    .map((c, i) => `<button class="muestra" type="button" data-color="${i}" style="--c:${hexSeguro(c.hex)}"
        aria-label="Ver en ${esc(c.nombre)}"></button>`)
    .join("");
}

function preciosHTML(p) {
  const final = precioFinal(p);
  return `<span class="precio" data-valor="${final}">${moneda(final)}</span>${
    p.descuento ? `<s class="antes">${moneda(p.precio)}</s>` : ""
  }`;
}

function insigniasHTML(p) {
  const lista = [];
  if (p.descuento) lista.push(`<span class="insignia">−${p.descuento} %</span>`);
  if (p.calificacion >= 4.8 && p.resenas >= 50) lista.push(`<span class="insignia clara">Mejor valorado</span>`);
  return lista.join("");
}

const valoracionMiniHTML = (p) =>
  p.resenas
    ? `${estrellasHTML(p.calificacion, "chicas")}<b>${numero(p.calificacion)}</b><span>(${p.resenas})</span>`
    : `<span>Sin reseñas</span>`;

function rapidoHTML(p) {
  const tallas = p.tallas || [];
  const botones = tallas.length === 1
    ? `<button type="button" class="ancho" data-rapido="${esc(tallas[0])}">Agregar · Talla única</button>`
    : tallas.map((t) => `<button type="button" data-rapido="${esc(t)}" aria-label="Agregar talla ${esc(t)}">${esc(t)}</button>`).join("");
  return `<div class="rapido glass glass-fuerte"><span>Agregar rápido</span><div class="rapido-tallas">${botones}</div></div>`;
}

function tarjetaHTML(p) {
  const fav = favoritos.has(p._id);
  return `<article class="tarjeta glass" data-id="${esc(p._id)}" data-color="0" tabindex="0" role="button" aria-label="Ver ${esc(p.nombre)}">
    <div class="escenario">
      ${svgPrenda(p.prenda, colorDe(p), "reposo")}
      <div class="insignias">${insigniasHTML(p)}</div>
      <button class="favorito" type="button" aria-pressed="${fav}" aria-label="${fav ? "Quitar de" : "Guardar en"} favoritos">${ICONOS.corazon}</button>
      ${rapidoHTML(p)}
    </div>
    <div class="info">
      <div class="info-sup"><p class="cat">${esc(p.categoria)}</p><span class="valoracion-mini">${valoracionMiniHTML(p)}</span></div>
      <h3>${esc(p.nombre)}</h3>
      <div class="fila">
        <div class="precios">${preciosHTML(p)}</div>
        <div class="muestras">${muestrasHTML(p)}</div>
      </div>
      <p class="cuotas">${cuotasTexto(precioFinal(p))}</p>
    </div>
    <span class="destello" aria-hidden="true"></span>
  </article>`;
}

const tarjeta = (id) => rejilla.querySelector(`.tarjeta[data-id="${CSS.escape(id)}"]`);
const tarjetas = () => $$(".tarjeta", rejilla);
const coincide = (p) => p && p.genero === genero && (filtro === "Todo" || p.categoria === filtro);
const enPantalla = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
};

// ------------------------------------------------------------------ aparición al hacer scroll
let colaRevelar = [];
let revelarProgramado = false;
const revelador = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        revelador.unobserve(e.target);
        colaRevelar.push(e.target);
      }
    }
    if (colaRevelar.length && !revelarProgramado) {
      revelarProgramado = true;
      requestAnimationFrame(() => {
        revelarProgramado = false;
        const lote = colaRevelar
          .map((el) => [el, el.getBoundingClientRect()])
          .sort(([, a], [, b]) => a.top - b.top || a.left - b.left)
          .map(([el]) => el);
        colaRevelar = [];
        lote.forEach((el, i) => revelar(el, i));
      });
    }
  },
  { rootMargin: "0px 0px -4% 0px", threshold: 0.06 }
);

function revelar(el, i) {
  if (!el.hasAttribute("data-revelar")) return;
  el.removeAttribute("data-revelar");
  el.animate(
    [{ opacity: 0, transform: "translateY(36px) scale(.965)" }, { opacity: 1, transform: "none" }],
    { duration: dur(950), delay: dur(Math.min(i, 8) * 75), easing: RESORTE, fill: "backwards" }
  );
  luz.refrescar();
}

function prepararRevelado(elementos) {
  for (const el of elementos) {
    el.setAttribute("data-revelar", "");
    revelador.observe(el);
  }
}

// ------------------------------------------------------------------ catálogo
async function cargar() {
  const r = await fetch("/api/productos");
  if (!r.ok) throw new Error("No se pudo cargar el catálogo");
  return (await r.json()).productos;
}

const COMPARAR = {
  destacados: null, // orden de creación
  valorados: (a, b) => b.calificacion - a.calificacion || b.resenas - a.resenas,
  menor: (a, b) => precioFinal(a) - precioFinal(b),
  mayor: (a, b) => precioFinal(b) - precioFinal(a),
  descuento: (a, b) => (b.descuento || 0) - (a.descuento || 0) || precioFinal(a) - precioFinal(b),
};

function ordenarDOM() {
  const lista = [...productos.values()];
  if (COMPARAR[orden]) lista.sort(COMPARAR[orden]);
  for (const p of lista) {
    const el = tarjeta(p._id);
    if (el) rejilla.append(el);
  }
}

function pintarCatalogo(lista) {
  productos.clear();
  lista.forEach((p) => productos.set(p._id, p));
  rejilla.innerHTML = lista.map(tarjetaHTML).join("");
  ordenarDOM();
  tarjetas().forEach((el) => (el.hidden = !coincide(productos.get(el.dataset.id))));
  prepararRevelado(tarjetas().filter((el) => !el.hidden));
  pintarFiltros(false);
  pintarConteo();
  pintarVitrina(true);
  refrescarBolsa();
}

function pintarConteo() {
  const n = [...productos.values()].filter(coincide).length;
  $("#conteo").textContent = n ? `${n} ${n === 1 ? "prenda" : "prendas"}` : "Sin prendas en esta categoría";
  if (!productos.size) rejilla.innerHTML = `<p class="vacio">Aún no hay productos.</p>`;
}

async function sincronizar() {
  try {
    const lista = await cargar();
    const ids = new Set(lista.map((p) => p._id));
    [...productos.keys()].filter((id) => !ids.has(id)).forEach((id) => quitar(id, false));
    lista.forEach((p) => insertarOActualizar(p, false));
  } catch {
    /* se reintentará en la próxima reconexión */
  }
}

// ------------------------------------------------------------------ género, filtros y orden
function pintarSelectorGenero(animar) {
  const btn = $$("button", selectorGenero).find((b) => b.dataset.genero === genero);
  $$("button", selectorGenero).forEach((b) => b.setAttribute("aria-pressed", b === btn));
  deslizarIndicador($(".segmentado-indicador", selectorGenero), btn, animar);
  $("#catalogo-titulo").textContent = genero;
}

async function cambiarTexto(el, html) {
  await el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-8px)", filter: "blur(6px)" }],
    { duration: dur(200), easing: SALIDA, fill: "forwards" }).finished.catch(() => {});
  el.innerHTML = html;
  el.animate([{ opacity: 0, transform: "translateY(12px)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: dur(700), easing: RESORTE, fill: "forwards" });
}

async function cambiarGenero(nuevo) {
  if (nuevo === genero) return;
  genero = nuevo;
  almacen.guardar("genero", genero);
  pintarSelectorGenero(true);
  cambiarTexto($("#portada-sobre"), esc(PORTADAS[genero].sobre));
  cambiarTexto($("#portada-titulo"), PORTADAS[genero].titulo);
  pintarVitrina(true);

  const salientes = tarjetas().filter((el) => !el.hidden && enPantalla(el));
  const animaciones = salientes.map((el, i) =>
    el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-12px) scale(.98)" }],
      { duration: dur(240), delay: dur(i * 22), easing: SALIDA, fill: "forwards" })
  );
  await Promise.all(animaciones.map((a) => a.finished.catch(() => {})));

  filtro = "Todo";
  ordenarDOM();
  tarjetas().forEach((el) => (el.hidden = !coincide(productos.get(el.dataset.id))));
  animaciones.forEach((a) => a.cancel());
  prepararRevelado(tarjetas().filter((el) => !el.hidden));
  pintarFiltros(false);
  pintarConteo();
  const catalogo = $("#catalogo");
  if (scrollY > catalogo.offsetTop) catalogo.scrollIntoView({ behavior: "smooth" });
}

selectorGenero.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-genero]");
  if (b) cambiarGenero(b.dataset.genero);
});

function pintarFiltros(animar = true) {
  const delGenero = [...productos.values()].filter((p) => p.genero === genero);
  const presentes = ORDEN_CATEGORIAS.filter((c) => delGenero.some((p) => p.categoria === c));
  const lista = ["Todo", ...presentes];
  if (!lista.includes(filtro)) filtro = "Todo";
  const actual = $$("button", filtros).map((b) => b.dataset.cat).join("|");
  if (actual !== lista.join("|")) {
    $$("button", filtros).forEach((b) => b.remove());
    filtros.insertAdjacentHTML(
      "beforeend",
      lista.map((c) => `<button type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join("")
    );
    animar = false;
  }
  const activo = $$("button", filtros).find((b) => b.dataset.cat === filtro);
  $$("button", filtros).forEach((b) => b.setAttribute("aria-pressed", b === activo));
  deslizarIndicador($(".filtros-indicador", filtros), activo, animar);
}

filtros.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-cat]");
  if (!btn || btn.dataset.cat === filtro) return;
  filtro = btn.dataset.cat;
  pintarFiltros(true);
  btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  aplicarVista();
});

selectorOrden.addEventListener("change", () => {
  orden = selectorOrden.value;
  aplicarVista();
});

/** Reacomoda la rejilla (FLIP) tras cambiar filtro u orden. */
function aplicarVista() {
  const nuevas = [];
  reacomodar(tarjetas, () => {
    ordenarDOM();
    tarjetas().forEach((el) => {
      const ver = coincide(productos.get(el.dataset.id));
      if (ver && el.hidden) nuevas.push(el);
      el.hidden = !ver;
    });
  });
  prepararRevelado(nuevas);
  pintarConteo();
  luz.refrescar();
}

// ------------------------------------------------------------------ vitrina (destacado)
function elegirDestacado() {
  return [...productos.values()].filter((p) => p.genero === genero).sort((a, b) => puntaje(b) - puntaje(a))[0];
}

function vitrinaInfoHTML(p) {
  return `<p class="cat">Destacado · ${esc(p.categoria)}</p>
    <h3>${esc(p.nombre)}</h3>
    <div class="valoracion">${estrellasHTML(p.calificacion)}<span>${numero(p.calificacion)} · ${p.resenas} reseñas</span></div>
    <p class="vitrina-desc">${esc(p.descripcion)}</p>
    <div class="vitrina-pie">
      <div class="precios">${preciosHTML(p)}</div>
      <span class="vitrina-ver">Ver prenda ${ICONOS.flecha}</span>
    </div>
    <div class="vitrina-colores">${(p.colores || []).map((c, i) =>
      `<i style="--c:${hexSeguro(c.hex)}" class="${i === vitrina.color ? "activo" : ""}" title="${esc(c.nombre)}"></i>`).join("")}</div>`;
}

async function pintarVitrina(animar) {
  const p = elegirDestacado();
  if (!p) {
    vitrinaEl.hidden = true;
    return;
  }
  vitrinaEl.hidden = false;
  const mismo = vitrina.id === p._id && $(".vitrina-info", vitrinaEl);
  if (mismo && !animar) {
    $(".vitrina-info", vitrinaEl).innerHTML = vitrinaInfoHTML(p);
    const svg = $(".vitrina-escenario .prenda", vitrinaEl);
    if (svg.dataset.tipo !== p.prenda) svg.outerHTML = svgPrenda(p.prenda, colorDe(p, vitrina.color), "flota");
    else teñir(svg, colorDe(p, vitrina.color));
    return;
  }
  if (animar && vitrinaEl.childElementCount) {
    await vitrinaEl.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.97)", filter: "blur(10px)" }],
      { duration: dur(240), easing: SALIDA, fill: "forwards" }).finished.catch(() => {});
  }
  if (vitrina.id !== p._id) vitrina.color = 0;
  vitrina.id = p._id;
  vitrinaEl.innerHTML = `<div class="vitrina-escenario">${svgPrenda(p.prenda, colorDe(p, vitrina.color), "reposo")}
      <span class="vitrina-etiqueta">${esc(p.genero)} · Nº 1</span></div>
    <div class="vitrina-info">${vitrinaInfoHTML(p)}</div>`;
  vitrinaEl.setAttribute("aria-label", `Ver ${p.nombre}`);
  if (animar) {
    vitrinaEl.animate([{ opacity: 0, transform: "scale(.96) translateY(14px)", filter: "blur(12px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: dur(900), easing: RESORTE, fill: "forwards" });
    $$(".vitrina-info > *", vitrinaEl).forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
        { duration: dur(700), delay: dur(160 + i * 55), easing: RESORTE, fill: "backwards" }));
  }
  const svg = $(".vitrina-escenario .prenda", vitrinaEl);
  setTimeout(() => {
    svg.classList.remove("reposo");
    svg.classList.add("flota");
  }, dur(350));
  cicloVitrina();
}

function cicloVitrina() {
  clearInterval(vitrina.temporizador);
  vitrina.temporizador = setInterval(() => {
    if (document.hidden || abierto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = productos.get(vitrina.id);
    if (!p || (p.colores || []).length < 2) return;
    vitrina.color = (vitrina.color + 1) % p.colores.length;
    const svg = $(".vitrina-escenario .prenda", vitrinaEl);
    teñir(svg, colorDe(p, vitrina.color));
    $$(".vitrina-colores i", vitrinaEl).forEach((d, i) => d.classList.toggle("activo", i === vitrina.color));
  }, 3400);
}

vitrinaEl.addEventListener("click", () => vitrina.id && abrir(vitrina.id, vitrina.color, vitrinaEl));
vitrinaEl.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target === vitrinaEl) {
    e.preventDefault();
    vitrina.id && abrir(vitrina.id, vitrina.color, vitrinaEl);
  }
});

// ------------------------------------------------------------------ cambios en vivo
function destellar(el) {
  el.classList.remove("actualizada");
  void el.offsetWidth; // reinicia la animación
  el.classList.add("actualizada");
  el.addEventListener("animationend", () => el.classList.remove("actualizada"), { once: true });
  luz.refrescar();
}

function actualizarTarjeta(el, p, previo) {
  $(".cat", el).textContent = p.categoria;
  $("h3", el).textContent = p.nombre;
  el.setAttribute("aria-label", `Ver ${p.nombre}`);
  $(".valoracion-mini", el).innerHTML = valoracionMiniHTML(p);
  $(".cuotas", el).textContent = cuotasTexto(precioFinal(p));

  const precios = $(".precios", el);
  const precio = $(".precio", precios);
  precios.querySelector(".antes")?.remove();
  if (p.descuento) precios.insertAdjacentHTML("beforeend", `<s class="antes">${moneda(p.precio)}</s>`);
  animarNumero(precio, precioFinal(p));

  const insignias = $(".insignias", el);
  insignias.innerHTML = insigniasHTML(p);
  if (p.descuento !== previo?.descuento && p.descuento)
    insignias.firstElementChild?.animate([{ transform: "scale(.4)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: dur(700), easing: RESORTE });

  if (firma(p.tallas) !== firma(previo?.tallas)) $(".rapido", el).outerHTML = rapidoHTML(p);
  $(".muestras", el).innerHTML = muestrasHTML(p);
  if (Number(el.dataset.color) >= (p.colores || []).length) el.dataset.color = 0;
  const svg = $(".escenario .prenda", el);
  if (svg.dataset.tipo !== p.prenda) svg.outerHTML = svgPrenda(p.prenda, colorDe(p, Number(el.dataset.color)), "reposo");
  else teñir(svg, colorDe(p, Number(el.dataset.color)));
  if (!el.hidden) destellar(el);
}

const SOLO_RESENAS = (a, b) => {
  const limpio = (x) => firma({ ...x, resenas: 0, calificacion: 0, actualizado: 0 });
  return limpio(a) === limpio(b);
};

function describirCambio(p, previo) {
  if (!previo) return ["Nueva prenda", `${p.nombre} · ${p.genero}`];
  if (SOLO_RESENAS(p, previo)) return null;
  if (previo.descuento !== p.descuento)
    return p.descuento
      ? [`${p.descuento} % de descuento`, `${p.nombre} · ahora ${moneda(precioFinal(p))}`]
      : ["Descuento finalizado", `${p.nombre} · ${moneda(precioFinal(p))}`];
  if (previo.precio !== p.precio)
    return ["Nuevo precio", `${p.nombre} · ${moneda(precioFinal(previo))} → ${moneda(precioFinal(p))}`];
  if (firma(previo.colores) !== firma(p.colores))
    return ["Nuevos colores", `${p.nombre} · ${p.colores.map((c) => c.nombre).join(", ")}`];
  return ["Prenda actualizada", p.nombre];
}

function insertarOActualizar(p, avisar = true) {
  const previo = productos.get(p._id);
  if (previo && firma(previo) === firma(p)) return;
  productos.set(p._id, p);
  $(".vacio", rejilla)?.remove();
  const el = tarjeta(p._id);
  if (el) {
    actualizarTarjeta(el, p, previo);
    const reubicar = previo?.genero !== p.genero || previo?.categoria !== p.categoria || (COMPARAR[orden] && !SOLO_RESENAS(p, previo));
    if (reubicar) {
      pintarFiltros(false);
      aplicarVista();
    }
  } else {
    rejilla.insertAdjacentHTML("beforeend", tarjetaHTML(p));
    const nueva = tarjeta(p._id);
    nueva.hidden = !coincide(p);
    pintarFiltros(false);
    aplicarVista();
    if (!nueva.hidden) prepararRevelado([nueva]);
  }
  pintarConteo();
  if (vitrina.id === p._id || elegirDestacado()?._id !== vitrina.id) pintarVitrina(elegirDestacado()?._id !== vitrina.id);
  if (abierto?.id === p._id) actualizarDetalle(p, previo);
  refrescarBolsa();
  const texto = avisar && describirCambio(p, previo);
  if (texto) aviso(...texto);
}

async function quitar(id, avisar = true) {
  const p = productos.get(id);
  if (abierto?.id === id) {
    await cerrar();
    if (avisar) aviso("Prenda retirada", `${p?.nombre ?? "Esta prenda"} ya no está disponible`);
    avisar = false;
  }
  productos.delete(id);
  const el = tarjeta(id);
  if (el) {
    if (!el.hidden)
      await el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9)", filter: "blur(10px)" }],
        { duration: dur(420), easing: SALIDA, fill: "forwards" }).finished.catch(() => {});
    reacomodar(tarjetas, () => el.remove());
  }
  pintarFiltros(false);
  pintarConteo();
  if (vitrina.id === id) pintarVitrina(true);
  refrescarBolsa();
  if (avisar && p) aviso("Prenda retirada", p.nombre);
}

// ------------------------------------------------------------------ interacción con tarjetas
function alternarFavorito(id, boton) {
  const ahora = !favoritos.has(id);
  if (ahora) favoritos.add(id);
  else favoritos.delete(id);
  almacen.guardar("favoritos", [...favoritos]);
  $$(`.tarjeta[data-id="${CSS.escape(id)}"] .favorito, .detalle .favorito`).forEach((b) => {
    if (b.closest(".detalle") && abierto?.id !== id) return;
    b.setAttribute("aria-pressed", ahora);
    b.setAttribute("aria-label", `${ahora ? "Quitar de" : "Guardar en"} favoritos`);
  });
  boton.animate(
    ahora
      ? [{ transform: "scale(1)" }, { transform: "scale(.7)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }]
      : [{ transform: "scale(1)" }, { transform: "scale(.85)" }, { transform: "scale(1)" }],
    { duration: dur(ahora ? 620 : 360), easing: RESORTE }
  );
  const p = productos.get(id);
  aviso(ahora ? "Guardado en favoritos" : "Quitado de favoritos", p?.nombre ?? "");
}

rejilla.addEventListener("click", (e) => {
  const el = e.target.closest(".tarjeta");
  if (!el) return;
  const p = productos.get(el.dataset.id);
  const fav = e.target.closest(".favorito");
  const rapido = e.target.closest("[data-rapido]");
  if (fav) return alternarFavorito(p._id, fav);
  if (rapido) return agregar(p, rapido.dataset.rapido, Number(el.dataset.color), $(".escenario .prenda", el));
  if (e.target.closest(".rapido")) return;
  const muestra = e.target.closest(".muestra");
  abrir(el.dataset.id, muestra ? Number(muestra.dataset.color) : Number(el.dataset.color), el);
});
rejilla.addEventListener("keydown", (e) => {
  const el = e.target.closest(".tarjeta");
  if (el && e.target === el && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    abrir(el.dataset.id, Number(el.dataset.color), el);
  }
});
// Vista previa del color al pasar sobre una muestra
rejilla.addEventListener("pointerover", (e) => {
  const muestra = e.target.closest(".muestra");
  const el = e.target.closest(".tarjeta");
  if (!muestra || !el) return;
  const p = productos.get(el.dataset.id);
  el.dataset.color = muestra.dataset.color;
  teñir($(".escenario .prenda", el), colorDe(p, Number(muestra.dataset.color)));
});
// Inclinación 3D sutil según la posición del puntero (una vez por cuadro)
let inclinacion = null;
rejilla.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest(".tarjeta");
  if (!el) return;
  const pendiente = inclinacion;
  inclinacion = { el, x: e.clientX, y: e.clientY };
  if (pendiente) return;
  requestAnimationFrame(() => {
    const { el: t, x, y } = inclinacion;
    inclinacion = null;
    const r = t.getBoundingClientRect();
    t.style.setProperty("--rx", `${((0.5 - (y - r.top) / r.height) * 6).toFixed(2)}deg`);
    t.style.setProperty("--ry", `${(((x - r.left) / r.width - 0.5) * 7).toFixed(2)}deg`);
  });
});
rejilla.addEventListener("pointerout", (e) => {
  const el = e.target.closest(".tarjeta");
  if (el && !el.contains(e.relatedTarget)) {
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  }
});

// ------------------------------------------------------------------ detalle
const ETIQUETAS = { material: "Material", ajuste: "Ajuste", cuidado: "Cuidado", origen: "Origen" };
const GUIA_TALLAS = { XS: "34", S: "36", M: "38", L: "40", XL: "42" };

function detalleHTML(p, color) {
  const fav = favoritos.has(p._id);
  return `
    <button class="boton-vidrio boton-redondo cerrar" type="button" aria-label="Cerrar">${ICONOS.cerrar}</button>
    <div class="detalle-escenario">
      ${svgPrenda(p.prenda, colorDe(p, color), "reposo")}
      <div class="detalle-pie-escenario"><span>${esc(p.genero)}</span><span>Ref. ${esc(p._id.slice(-6).toUpperCase())}</span></div>
    </div>
    <div class="detalle-info">
      <div class="aparece" data-zona="titulo">${tituloHTML(p)}</div>
      <div class="valoracion aparece" data-zona="valoracion">${valoracionHTML(p)}</div>
      <div class="aparece"><div class="precio-grande">${precioGrandeHTML(p)}</div><p class="cuotas">${cuotasTexto(precioFinal(p))}</p></div>
      <p class="desc aparece">${esc(p.descripcion)}</p>
      <div class="bloque aparece"><h4>Color<span class="nombre-color">${esc(p.colores?.[color]?.nombre)}</span></h4>
        <div class="selector-color">${coloresHTML(p, color)}</div></div>
      <div class="bloque aparece"><h4>Talla<span class="guia-talla" id="guia-talla"></span></h4><div class="tallas">${tallasHTML(p, null)}</div></div>
      <div class="acciones-detalle aparece">
        <button class="boton-solido grande agregar" type="button"><span class="agregar-texto">Agregar a la bolsa</span><span class="agregar-precio">${moneda(precioFinal(p))}</span></button>
        <button class="boton-vidrio boton-redondo grande favorito" type="button" aria-pressed="${fav}" aria-label="${fav ? "Quitar de" : "Guardar en"} favoritos">${ICONOS.corazon}</button>
      </div>
      <ul class="garantias aparece">
        <li>${ICONOS.camion}<span><strong>Envío gratis</strong> en compras desde $250.000</span></li>
        <li>${ICONOS.cambio}<span><strong>Cambios gratis</strong> durante 30 días</span></li>
      </ul>
      <div class="bloque aparece"><h4>Especificaciones</h4><dl class="specs">${specsHTML(p)}</dl></div>
      <div class="bloque calificar aparece"><h4>Califica esta prenda</h4>
        <div class="calificar-estrellas" role="radiogroup" aria-label="Tu calificación">${[1, 2, 3, 4, 5].map((n) =>
          `<button type="button" role="radio" aria-checked="false" data-estrellas="${n}" aria-label="${n} ${n === 1 ? "estrella" : "estrellas"}">${ICONOS.estrella}</button>`).join("")}</div>
        <p class="calificar-nota">${notaCalificar()}</p>
      </div>
    </div>`;
}
const notaCalificar = () => (sesion.usuario ? "Toca una estrella para dejar tu calificación" : "Inicia sesión para calificar");
const tituloHTML = (p) => `<p class="cat">${esc(p.genero)} · ${esc(p.categoria)}</p><h2 id="titulo-detalle">${esc(p.nombre)}</h2>`;
const valoracionHTML = (p) =>
  p.resenas
    ? `${estrellasHTML(p.calificacion, "medianas")}<b>${numero(p.calificacion)}</b><span>${p.resenas} ${p.resenas === 1 ? "reseña" : "reseñas"}</span>`
    : `${estrellasHTML(0, "medianas")}<span>Aún sin reseñas · sé el primero</span>`;
function precioGrandeHTML(p) {
  const final = precioFinal(p);
  return `<span class="precio" data-valor="${final}">${moneda(final)}</span>${
    p.descuento ? `<s class="antes">${moneda(p.precio)}</s><span class="etiqueta-desc">−${p.descuento} %</span>` : ""
  }`;
}
const coloresHTML = (p, sel) =>
  (p.colores || [])
    .map((c, i) => `<button type="button" data-color="${i}" style="--c:${hexSeguro(c.hex)}" aria-pressed="${i === sel}"
        aria-label="${esc(c.nombre)}" title="${esc(c.nombre)}"></button>`)
    .join("");
const tallasHTML = (p, sel) =>
  (p.tallas || []).map((t) => `<button type="button" data-talla="${esc(t)}" aria-pressed="${t === sel}">${esc(t)}</button>`).join("");
const specsHTML = (p) =>
  Object.entries(ETIQUETAS)
    .filter(([k]) => p.especificaciones?.[k])
    .map(([k, et]) => `<dt>${et}</dt><dd>${esc(p.especificaciones[k])}</dd>`)
    .join("");

function pintarGuiaTalla(talla) {
  const guia = abierto && $("#guia-talla", abierto.det);
  if (guia) guia.textContent = talla ? `${talla} · equivale a talla ${GUIA_TALLAS[talla] ?? "única"}` : "";
}

function abrir(id, color = 0, origen = null) {
  if (abierto) return;
  const p = productos.get(id);
  origen = origen ?? tarjeta(id);
  if (!p || !origen) return;
  if (!(color >= 0 && color < (p.colores || []).length)) color = 0;

  const svgOrigen = $(".prenda", origen);
  const r0 = origen.getBoundingClientRect();
  const g0 = svgOrigen.getBoundingClientRect();
  const radio0 = parseFloat(getComputedStyle(origen).borderTopLeftRadius) || 26;

  const velo = document.createElement("div");
  velo.className = "velo";
  const det = document.createElement("section");
  det.className = "detalle glass glass-fuerte";
  det.setAttribute("role", "dialog");
  det.setAttribute("aria-modal", "true");
  det.setAttribute("aria-labelledby", "titulo-detalle");
  det.innerHTML = detalleHTML(p, color);
  document.body.append(velo, det);

  const talla = p.tallas?.length === 1 ? p.tallas[0] : null;
  abierto = { id, det, velo, origen, color, talla };
  if (talla) $(".tallas", det).innerHTML = tallasHTML(p, talla);
  pintarGuiaTalla(talla);
  capas.abrir(cerrar);

  const r1 = det.getBoundingClientRect();
  const svgDet = $(".detalle-escenario .prenda", det);
  const g1 = svgDet.getBoundingClientRect();
  origen.classList.add("origen");

  // 1) El panel crece desde la tarjeta (recorte animado, sin deformar el contenido)
  det.animate(
    [
      { clipPath: `inset(${r0.top - r1.top}px ${r1.right - r0.right}px ${r1.bottom - r0.bottom}px ${r0.left - r1.left}px round ${radio0}px)` },
      { clipPath: "inset(0px 0px 0px 0px round 34px)" },
    ],
    { duration: dur(820), easing: RESORTE }
  );
  velo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(500), easing: "ease-out", fill: "both" });

  // 2) La prenda "vuela" desde la tarjeta hasta su lugar y luego se despliega
  svgDet.animate(
    [
      { transform: `translate(${g0.left - g1.left}px, ${g0.top - g1.top}px) scale(${g0.width / g1.width})` },
      { transform: "none" },
    ],
    { duration: dur(900), easing: RESORTE }
  );
  setTimeout(() => svgDet.classList.remove("reposo"), dur(280));
  setTimeout(() => svgDet.isConnected && svgDet.classList.add("flota"), dur(1150));

  // 3) La información aparece en cascada
  $$(".aparece", det).forEach((el, i) =>
    el.animate(
      [{ opacity: 0, transform: "translateY(18px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: dur(720), delay: dur(160 + i * 50), easing: RESORTE, fill: "both" }
    )
  );

  luz.refrescar();
  velo.addEventListener("click", cerrar);
  $(".cerrar", det).addEventListener("click", cerrar);
  det.addEventListener("click", clicDetalle);
  const estrellas = $(".calificar-estrellas", det);
  estrellas.addEventListener("pointerover", (e) => {
    const b = e.target.closest("[data-estrellas]");
    if (b) iluminarEstrellas(Number(b.dataset.estrellas));
  });
  estrellas.addEventListener("pointerleave", () => iluminarEstrellas(abierto?.miNota ?? 0));
  $(".cerrar", det).focus({ preventScroll: true });
}

function iluminarEstrellas(n) {
  if (!abierto) return;
  $$(".calificar-estrellas button", abierto.det).forEach((b, i) => b.classList.toggle("encendida", i < n));
}

async function calificar(n) {
  const p = productos.get(abierto.id);
  if (!sesion.usuario) {
    const u = await pedirSesion("Inicia sesión para calificar esta prenda.");
    if (!u || !abierto || abierto.id !== p._id) return;
  }
  const { det } = abierto;
  const nota = $(".calificar-nota", det);
  try {
    const r = await pedirJSON("POST", `/api/productos/${encodeURIComponent(p._id)}/calificar`, { estrellas: n });
    if (abierto?.id !== p._id) return;
    abierto.miNota = n;
    iluminarEstrellas(n);
    $$(".calificar-estrellas button", det).forEach((b, i) => {
      b.setAttribute("aria-checked", i + 1 === n);
      if (i < n) b.animate([{ transform: "scale(.6)" }, { transform: "scale(1.2)" }, { transform: "none" }],
        { duration: dur(520), delay: dur(i * 60), easing: RESORTE });
    });
    nota.textContent = `¡Gracias! Calificaste esta prenda con ${n} ${n === 1 ? "estrella" : "estrellas"}.`;
    insertarOActualizar(r.producto, false);
    aviso("¡Gracias por tu calificación!", `${p.nombre} · ${n} ${n === 1 ? "estrella" : "estrellas"}`);
  } catch (err) {
    nota.textContent = err.estado === 409 ? "Ya calificaste esta prenda. ¡Gracias!" : err.message;
    sacudir($(".calificar-estrellas", det));
  }
}

function clicDetalle(e) {
  if (!abierto) return;
  const p = productos.get(abierto.id);
  const botonColor = e.target.closest(".selector-color button");
  const botonTalla = e.target.closest(".tallas button");
  const estrella = e.target.closest("[data-estrellas]");
  if (botonColor) elegirColor(p, Number(botonColor.dataset.color));
  else if (botonTalla) {
    abierto.talla = botonTalla.dataset.talla;
    $$(".tallas button", abierto.det).forEach((b) => b.setAttribute("aria-pressed", b === botonTalla));
    pintarGuiaTalla(abierto.talla);
  } else if (estrella) calificar(Number(estrella.dataset.estrellas));
  else if (e.target.closest(".favorito")) alternarFavorito(p._id, e.target.closest(".favorito"));
  else if (e.target.closest(".agregar")) agregarDesdeDetalle(p, e.target.closest(".agregar"));
}

function elegirColor(p, i) {
  const { det } = abierto;
  abierto.color = i;
  $$(".selector-color button", det).forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.color) === i));
  $(".nombre-color", det).textContent = p.colores[i]?.nombre ?? "";
  const svg = $(".detalle-escenario .prenda", det);
  teñir(svg, colorDe(p, i));
  // Las mangas "respiran" al cambiar de color
  svg.classList.add("reposo");
  setTimeout(() => svg.classList.remove("reposo"), dur(260));
}

function agregarDesdeDetalle(p, boton) {
  const { det, talla, color } = abierto;
  if (!talla) {
    sacudir($(".tallas", det));
    aviso("Elige una talla", "Selecciona tu talla para continuar", "error");
    return;
  }
  agregar(p, talla, color, $(".detalle-escenario .prenda", det));
  boton.classList.add("hecho");
  $(".agregar-texto", boton).textContent = "Agregado a la bolsa";
  clearTimeout(boton._t);
  boton._t = setTimeout(() => {
    boton.classList.remove("hecho");
    $(".agregar-texto", boton).textContent = "Agregar a la bolsa";
  }, 1800);
}

function actualizarDetalle(p, previo) {
  const { det } = abierto;
  const zonaTitulo = $('[data-zona="titulo"]', det);
  if (previo?.nombre !== p.nombre || previo?.categoria !== p.categoria || previo?.genero !== p.genero) zonaTitulo.innerHTML = tituloHTML(p);
  $('[data-zona="valoracion"]', det).innerHTML = valoracionHTML(p);
  $(".desc", det).textContent = p.descripcion;
  $(".detalle-info .cuotas", det).textContent = cuotasTexto(precioFinal(p));
  $(".agregar-precio", det).textContent = moneda(precioFinal(p));

  const zonaPrecio = $(".precio-grande", det);
  const anterior = Number($(".precio", zonaPrecio).dataset.valor);
  zonaPrecio.innerHTML = precioGrandeHTML(p);
  const precio = $(".precio", zonaPrecio);
  precio.dataset.valor = anterior;
  animarNumero(precio, precioFinal(p));
  if (anterior !== precioFinal(p))
    zonaPrecio.animate([{ filter: "blur(4px)", opacity: 0.4 }, { filter: "blur(0)", opacity: 1 }], { duration: dur(500), easing: SALIDA });

  // Conserva el color/talla elegidos si siguen existiendo
  const hexActual = colorDe(previo || p, abierto.color);
  const idx = (p.colores || []).findIndex((c) => hexSeguro(c.hex) === hexActual);
  abierto.color = idx >= 0 ? idx : 0;
  $(".selector-color", det).innerHTML = coloresHTML(p, abierto.color);
  $(".nombre-color", det).textContent = p.colores?.[abierto.color]?.nombre ?? "";
  if (!p.tallas?.includes(abierto.talla)) abierto.talla = p.tallas?.length === 1 ? p.tallas[0] : null;
  $(".tallas", det).innerHTML = tallasHTML(p, abierto.talla);
  pintarGuiaTalla(abierto.talla);
  $(".specs", det).innerHTML = specsHTML(p);

  const svg = $(".detalle-escenario .prenda", det);
  if (svg.dataset.tipo !== p.prenda) svg.outerHTML = svgPrenda(p.prenda, colorDe(p, abierto.color), "flota");
  else teñir(svg, colorDe(p, abierto.color));
}

async function cerrar() {
  if (!abierto || abierto.cerrando) return;
  abierto.cerrando = true;
  capas.quitar(cerrar);
  const { det, velo, origen, color, id } = abierto;
  const svgDet = $(".detalle-escenario .prenda", det);
  const p = productos.get(id);
  const sigueVisible = origen.isConnected && !origen.hidden && p && enPantalla(origen);

  svgDet.classList.remove("flota");
  svgDet.classList.add("reposo");
  $$(".aparece", det).forEach((el) =>
    el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" }], {
      duration: dur(200), easing: SALIDA, fill: "forwards",
    })
  );
  velo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(560), easing: SALIDA, fill: "forwards" });

  let animaciones;
  if (sigueVisible) {
    // El origen adopta el color que se eligió en el detalle
    const svgOrigen = $(".prenda", origen);
    teñir(svgOrigen, colorDe(p, color));
    if (origen === vitrinaEl) {
      vitrina.color = color;
      $$(".vitrina-colores i", vitrinaEl).forEach((d, i) => d.classList.toggle("activo", i === color));
    } else origen.dataset.color = color;
    const radio0 = parseFloat(getComputedStyle(origen).borderTopLeftRadius) || 26;
    const r0 = origen.getBoundingClientRect();
    const g0 = svgOrigen.getBoundingClientRect();
    const r1 = det.getBoundingClientRect();
    const g1 = svgDet.getBoundingClientRect();
    animaciones = [
      det.animate(
        [
          { clipPath: "inset(0px 0px 0px 0px round 34px)" },
          { clipPath: `inset(${r0.top - r1.top}px ${r1.right - r0.right}px ${r1.bottom - r0.bottom}px ${r0.left - r1.left}px round ${radio0}px)` },
        ],
        { duration: dur(640), easing: RESORTE, fill: "forwards" }
      ),
      svgDet.animate(
        [{ transform: "none" }, { transform: `translate(${g0.left - g1.left}px, ${g0.top - g1.top}px) scale(${g0.width / g1.width})` }],
        { duration: dur(640), easing: RESORTE, fill: "forwards" }
      ),
    ];
  } else {
    animaciones = [
      det.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.96)", filter: "blur(10px)" }], {
        duration: dur(380), easing: SALIDA, fill: "forwards",
      }),
    ];
  }
  await Promise.all(animaciones.map((a) => a.finished.catch(() => {})));
  origen.classList.remove("origen");
  det.remove();
  velo.remove();
  abierto = null;
  if (sigueVisible) origen.focus({ preventScroll: true });
  luz.refrescar();
}

sesion.alCambiar(() => {
  if (abierto && !abierto.miNota) $(".calificar-nota", abierto.det).textContent = notaCalificar();
});

addEventListener("resize", () => {
  pintarFiltros(false);
  pintarSelectorGenero(false);
});

// ------------------------------------------------------------------ inicio
pintarSelectorGenero(false);
$("#portada-sobre").textContent = PORTADAS[genero].sobre;
$("#portada-titulo").innerHTML = PORTADAS[genero].titulo;
$$(".portada-texto > *").forEach((el, i) =>
  el.animate([{ opacity: 0, transform: "translateY(22px)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: dur(1000), delay: dur(60 + i * 80), easing: RESORTE, fill: "backwards" })
);
$("#barra").animate([{ opacity: 0, transform: "translateY(-14px) scale(.98)" }, { opacity: 1, transform: "none" }],
  { duration: dur(900), easing: RESORTE });

cargarSesion();
try {
  pintarCatalogo(await cargar());
} catch (err) {
  rejilla.innerHTML = `<p class="vacio">No se pudo conectar con el servidor. ${esc(err.message)}</p>`;
}

conectarEnVivo({
  onReconexion: sincronizar,
  onEvento: (ev) => {
    if (ev.tipo === "upsert" && ev.producto) insertarOActualizar(ev.producto);
    else if (ev.tipo === "delete") quitar(ev.id);
  },
});
