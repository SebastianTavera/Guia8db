// Utilidades compartidas por la tienda y el panel de administración.
import { iniciarArena } from "./arena.js";

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const movReducido = matchMedia("(prefers-reduced-motion: reduce)");
export const dur = (ms) => (movReducido.matches ? 1 : ms);

// Curvas tipo resorte (CSS linear()); si el navegador no las soporta, cubic-bezier.
const conLinear = CSS.supports("transition-timing-function", "linear(0, 1)");
export const RESORTE = conLinear
  ? "linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001)"
  : "cubic-bezier(.2,.9,.25,1)";
export const SALIDA = "cubic-bezier(.4,0,.2,1)";
const REBOTE = "linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1)";
if (conLinear) {
  document.documentElement.style.setProperty("--resorte", RESORTE);
  document.documentElement.style.setProperty("--resorte-rebote", REBOTE);
}

const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
export const moneda = (v) => pesos.format(Math.round(v));
export const precioFinal = (p) => Math.round(p.precio * (1 - (p.descuento || 0) / 100));

/** Escapa texto antes de insertarlo como HTML (los datos vienen de la BD). */
export function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

/** Anima un número (precio) desde el valor mostrado hasta el nuevo. */
export function animarNumero(el, hasta, formato = moneda) {
  const desde = Number(el.dataset.valor ?? hasta);
  el.dataset.valor = hasta;
  if (desde === hasta || movReducido.matches) {
    el.textContent = formato(hasta);
    return;
  }
  const t0 = performance.now();
  const T = 700;
  cancelAnimationFrame(el._raf);
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / T);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = formato(desde + (hasta - desde) * e);
    if (k < 1) el._raf = requestAnimationFrame(paso);
  };
  el._raf = requestAnimationFrame(paso);
}

// ------------------------------------------------------------------ luz
// Un halo difuso sigue al puntero por detrás del vidrio (el vidrio lo refracta)
// y cada elemento .glass visible recibe --mx/--my/--prox para iluminar su borde
// según la cercanía del puntero. Para que sea fluido:
//   - solo se procesan los elementos visibles (IntersectionObserver),
//   - se leen todas las posiciones y luego se escriben (sin "layout thrashing"),
//   - el bucle se detiene cuando el puntero está quieto.
export function iniciarLuz() {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="fondo" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></div>
     <div class="halo" aria-hidden="true"></div>
     <div class="grano" aria-hidden="true"></div>`
  );
  // Fondo de arena interactiva (WebGL2); si no está disponible quedan las manchas difusas
  try {
    iniciarArena($(".fondo"));
  } catch (err) {
    console.warn("Arena desactivada:", err);
  }
  const halo = $(".halo");
  const objetivo = { x: innerWidth * 0.5, y: innerHeight * 0.3 };
  const pos = { ...objetivo };
  const visibles = new Set();
  const observados = new WeakSet();
  let activo = false;
  let ultimoMovimiento = 0;
  let pendienteObservar = false;

  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visibles.add(e.target);
        else {
          visibles.delete(e.target);
          e.target.style.setProperty("--prox", "0");
        }
      }
      arrancar();
    },
    { rootMargin: "240px" }
  );
  const observar = () => {
    pendienteObservar = false;
    for (const el of document.querySelectorAll(".glass")) {
      if (!observados.has(el)) {
        observados.add(el);
        io.observe(el);
      }
    }
  };
  new MutationObserver(() => {
    if (!pendienteObservar) {
      pendienteObservar = true;
      requestAnimationFrame(observar);
    }
  }).observe(document.body, { childList: true, subtree: true });
  observar();

  const marcar = (x, y) => {
    objetivo.x = x;
    objetivo.y = y;
    ultimoMovimiento = performance.now();
    document.documentElement.classList.add("con-puntero");
    arrancar();
  };
  addEventListener("pointermove", (e) => e.pointerType === "mouse" && marcar(e.clientX, e.clientY), { passive: true });
  addEventListener("pointerdown", (e) => marcar(e.clientX, e.clientY), { passive: true });
  addEventListener("scroll", arrancar, { passive: true });
  addEventListener("resize", arrancar);
  document.documentElement.addEventListener("pointerleave", () => document.documentElement.classList.remove("con-puntero"));

  function arrancar() {
    if (!activo) {
      activo = true;
      requestAnimationFrame(cuadro);
    }
  }

  function cuadro(t) {
    // Suavizado: el halo "persigue" al puntero con algo de inercia
    const k = movReducido.matches ? 1 : 0.16;
    pos.x += (objetivo.x - pos.x) * k;
    pos.y += (objetivo.y - pos.y) * k;
    halo.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;

    // 1) lecturas
    const lecturas = [];
    for (const el of visibles) {
      if (!el.isConnected) {
        visibles.delete(el);
        io.unobserve(el);
        continue;
      }
      lecturas.push([el, el.getBoundingClientRect()]);
    }
    // 2) escrituras
    for (const [el, r] of lecturas) {
      if (!r.width) continue;
      const dx = Math.max(r.left - pos.x, 0, pos.x - r.right);
      const dy = Math.max(r.top - pos.y, 0, pos.y - r.bottom);
      const prox = Math.max(0, 1 - Math.hypot(dx, dy) / 380);
      const previa = el._prox ?? -1;
      if (prox === 0 && previa === 0) continue;
      el._prox = prox;
      el.style.setProperty("--mx", `${(pos.x - r.left).toFixed(1)}px`);
      el.style.setProperty("--my", `${(pos.y - r.top).toFixed(1)}px`);
      el.style.setProperty("--prox", prox.toFixed(3));
    }

    const quieto = Math.abs(objetivo.x - pos.x) < 0.3 && Math.abs(objetivo.y - pos.y) < 0.3;
    // Se mantiene vivo un momento tras el último movimiento (animaciones en curso)
    if (quieto && t - ultimoMovimiento > 1400) {
      activo = false;
      return;
    }
    requestAnimationFrame(cuadro);
  }

  // Mantener actualizadas las luces mientras corren animaciones de la UI
  document.addEventListener("animationstart", arrancar, true);
  document.addEventListener("transitionrun", arrancar, true);
  arrancar();
  return { refrescar: () => { ultimoMovimiento = performance.now(); arrancar(); } };
}

// ------------------------------------------------------------------ tienda
/** Estrellas con relleno parcial (un solo elemento con máscara). */
export function estrellasHTML(valor, clase = "") {
  const v = Math.max(0, Math.min(5, Number(valor) || 0));
  return `<span class="estrellas ${clase}" style="--v:${v}" role="img" aria-label="${v.toFixed(1)} de 5 estrellas"></span>`;
}

/** Texto de cuotas sin interés (3 cuotas desde $60.000). */
export function cuotasTexto(total) {
  if (total < 60000) return "";
  return `o 3 cuotas de ${moneda(Math.ceil(total / 3 / 100) * 100)} sin interés`;
}

/** fetch JSON con mensaje de error del servidor. */
export async function pedirJSON(metodo, url, cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: cuerpo ? { "Content-Type": "application/json" } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    credentials: "same-origin",
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(datos.error || `Error ${r.status}`);
    err.estado = r.status;
    throw err;
  }
  return datos;
}

/** Lee/escribe en localStorage sin romper si no está disponible. */
export const almacen = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem(clave);
      return v == null ? defecto : JSON.parse(v);
    } catch {
      return defecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

// ------------------------------------------------------------------ avisos
export function aviso(titulo, detalle = "", tipo = "info") {
  let pila = $(".avisos");
  if (!pila) {
    pila = document.createElement("div");
    pila.className = "avisos";
    pila.setAttribute("role", "status");
    pila.setAttribute("aria-live", "polite");
    document.body.append(pila);
  }
  const el = document.createElement("div");
  el.className = `aviso glass ${tipo}`;
  el.innerHTML = `<span class="aviso-punto"></span><div><strong>${esc(titulo)}</strong>${
    detalle ? `<span>${esc(detalle)}</span>` : ""
  }</div>`;
  pila.append(el);
  while (pila.children.length > 3) pila.firstElementChild.remove();
  el.animate(
    [
      { opacity: 0, transform: "translateY(18px) scale(.94)", filter: "blur(8px)" },
      { opacity: 1, transform: "none", filter: "blur(0)" },
    ],
    { duration: dur(600), easing: RESORTE, fill: "both" }
  );
  setTimeout(async () => {
    await el.animate(
      [{ opacity: 1 }, { opacity: 0, transform: "translateY(-6px) scale(.97)", filter: "blur(6px)" }],
      { duration: dur(320), easing: SALIDA, fill: "forwards" }
    ).finished.catch(() => {});
    el.remove();
  }, 3400);
}

// ------------------------------------------------------------------ tiempo real
/**
 * Abre el canal Server-Sent Events. onEvento recibe cada cambio de MongoDB,
 * onEstado recibe "conectando" | "change-stream" | "local".
 * onReconexion se llama cada vez que el canal se reabre (para resincronizar).
 */
export function conectarEnVivo({ onEvento, onEstado, onReconexion }) {
  let fuente;
  let abierto = false;
  const abrir = () => {
    fuente = new EventSource("/api/stream");
    fuente.onopen = () => {
      if (abierto) onReconexion?.();
      abierto = true;
    };
    fuente.onmessage = (e) => {
      let ev;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      if (ev.tipo === "estado") onEstado?.(ev.modo);
      else if (ev.tipo === "recargar") onReconexion?.();
      else onEvento?.(ev);
    };
    fuente.onerror = () => onEstado?.("conectando");
  };
  abrir();
  addEventListener("pagehide", () => fuente?.close());
}

export function pintarEstado(el, modo) {
  const textos = {
    "change-stream": "En vivo · Change Streams",
    local: "En vivo · local",
    iniciando: "Conectando…",
    conectando: "Reconectando…",
  };
  el.dataset.modo = modo;
  el.querySelector("span:last-child").textContent = textos[modo] || "Conectando…";
}

// ------------------------------------------------------------------ FLIP
/**
 * Anima suavemente los elementos que cambian de posición en una cuadrícula.
 * mutar() hace el cambio del DOM; luego cada elemento se desliza desde su lugar anterior.
 */
export function reacomodar(elementos, mutar) {
  const antes = new Map(elementos().map((el) => [el, el.getBoundingClientRect()]));
  mutar();
  for (const el of elementos()) {
    const a = antes.get(el);
    if (!a || !a.width || el.hidden) continue; // los que estaban ocultos entran con su propia animación
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: dur(650),
      easing: RESORTE,
      composite: "add",
    });
  }
}

/** Pequeña sacudida para indicar un error en un control. */
export function sacudir(el) {
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-7px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: dur(420), easing: "ease-out" }
  );
}

// ------------------------------------------------------------------ capas (modales)
// Pila de capas abiertas: Escape cierra solo la de arriba y el scroll se
// bloquea mientras haya alguna abierta.
const pila = [];
export const capas = {
  abrir(cerrar) {
    pila.push(cerrar);
    document.documentElement.classList.add("sin-scroll");
  },
  quitar(cerrar) {
    const i = pila.lastIndexOf(cerrar);
    if (i >= 0) pila.splice(i, 1);
    if (!pila.length) document.documentElement.classList.remove("sin-scroll");
  },
  get abiertas() {
    return pila.length;
  },
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pila.length) {
    e.preventDefault();
    pila[pila.length - 1]();
  }
});

/** Desliza la "píldora" de un control segmentado hasta el botón activo. */
export function deslizarIndicador(indicador, boton, animar = true) {
  if (!indicador || !boton) return;
  if (!animar) indicador.style.transition = "none";
  indicador.style.width = `${boton.offsetWidth}px`;
  indicador.style.transform = `translateX(${boton.offsetLeft}px)`;
  if (!animar) {
    void indicador.offsetWidth;
    indicador.style.transition = "";
  }
}

export const ICONOS = {
  cerrar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  corazon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.5 3.9 4.2 7.3 4.2c2 0 3.5 1.1 4.7 2.8 1.2-1.7 2.7-2.8 4.7-2.8 3.4 0 5.6 3.3 4.5 6.7-1.6 4.8-9.2 9.4-9.2 9.4Z"/></svg>`,
  camion: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>`,
  cambio: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/></svg>`,
  candado: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>`,
  estrella: `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"/></svg>`,
  flecha: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  ojo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
};
