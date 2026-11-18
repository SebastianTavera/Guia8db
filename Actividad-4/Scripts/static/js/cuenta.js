// Cuenta del cliente: sesión, ventana de inicio de sesión / registro y menú.
// La sesión vive en una cookie HttpOnly firmada por el servidor; aquí solo se
// guarda en memoria el nombre y el correo para pintarlos.
import { $, $$, ICONOS, RESORTE, SALIDA, aviso, capas, deslizarIndicador, dur, esc, pedirJSON, sacudir } from "./comun.js";

let usuario = null;
const oyentes = new Set();

export const sesion = {
  get usuario() {
    return usuario;
  },
  alCambiar(fn) {
    oyentes.add(fn);
  },
};

const boton = $("#cuenta");
const texto = $("#cuenta-texto");
const avatar = $("#avatar");
const ICONO_USUARIO = avatar.innerHTML;

function pintarBoton() {
  boton.classList.toggle("con-sesion", !!usuario);
  if (usuario) {
    texto.textContent = usuario.nombre.split(/\s+/)[0];
    avatar.innerHTML = `<span class="inicial">${esc(usuario.nombre.trim()[0]?.toUpperCase() ?? "")}</span>`;
    boton.setAttribute("aria-label", `Cuenta de ${usuario.nombre}`);
  } else {
    texto.textContent = "Ingresar";
    avatar.innerHTML = ICONO_USUARIO;
    boton.setAttribute("aria-label", "Iniciar sesión");
  }
}

function establecer(u) {
  usuario = u;
  pintarBoton();
  oyentes.forEach((fn) => fn(u));
}

export async function cargarSesion() {
  try {
    establecer((await pedirJSON("GET", "/api/sesion")).usuario);
  } catch {
    establecer(null);
  }
}

// ------------------------------------------------------------------ ventana de acceso
/** Abre la ventana de acceso. Resuelve con el usuario o null si se cierra. */
export function pedirSesion(motivo = "") {
  if (usuario) return Promise.resolve(usuario);
  return new Promise((resolver) => abrirAcceso(motivo, resolver));
}

function abrirAcceso(motivo, resolver) {
  const capa = document.createElement("div");
  capa.className = "capa-modal";
  capa.innerHTML = `
    <div class="velo"></div>
    <section class="modal-acceso glass glass-fuerte" role="dialog" aria-modal="true" aria-labelledby="acceso-titulo">
      <button class="boton-vidrio boton-redondo cerrar" type="button" aria-label="Cerrar">${ICONOS.cerrar}</button>
      <span class="marca-logo grande" aria-hidden="true"></span>
      <h2 id="acceso-titulo">Hola de nuevo</h2>
      <p class="acceso-motivo">${esc(motivo || "Inicia sesión para comprar y calificar tus prendas favoritas.")}</p>
      <div class="segmentado pestañas" role="group" aria-label="Tipo de acceso">
        <span class="segmentado-indicador" aria-hidden="true"></span>
        <button type="button" data-modo="login" aria-pressed="true">Iniciar sesión</button>
        <button type="button" data-modo="registro" aria-pressed="false">Crear cuenta</button>
      </div>
      <form novalidate>
        <div class="plegable" id="plegable-nombre"><div>
          <label class="campo">Nombre<input name="nombre" autocomplete="name" maxlength="40" tabindex="-1"></label>
        </div></div>
        <label class="campo">Correo electrónico<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
        <label class="campo">Contraseña
          <span class="con-ojo">
            <input name="clave" type="password" autocomplete="current-password" maxlength="128" required>
            <button type="button" class="ojo" aria-label="Mostrar contraseña" aria-pressed="false">${ICONOS.ojo}</button>
          </span>
        </label>
        <p class="ayuda-clave" hidden>Mínimo 8 caracteres.</p>
        <p class="error-texto" role="alert"></p>
        <button class="boton-solido grande enviar" type="submit"><span>Iniciar sesión</span></button>
      </form>
      <p class="acceso-legal">${ICONOS.candado}Tu contraseña se guarda cifrada en MongoDB.</p>
    </section>`;
  document.body.append(capa);

  const modal = $(".modal-acceso", capa);
  const velo = $(".velo", capa);
  const form = $("form", modal);
  const pestañas = $(".pestañas", modal);
  const indicador = $(".segmentado-indicador", pestañas);
  const plegable = $("#plegable-nombre", modal);
  const error = $(".error-texto", modal);
  const enviar = $(".enviar", modal);
  let modo = "login";
  let cerrada = false;

  const activa = () => $(`button[data-modo="${modo}"]`, pestañas);
  requestAnimationFrame(() => deslizarIndicador(indicador, activa(), false));

  function cambiarModo(nuevo) {
    if (nuevo === modo) return;
    modo = nuevo;
    $$("button[data-modo]", pestañas).forEach((b) => b.setAttribute("aria-pressed", b.dataset.modo === modo));
    deslizarIndicador(indicador, activa());
    const registro = modo === "registro";
    plegable.classList.toggle("abierto", registro);
    form.nombre.tabIndex = registro ? 0 : -1;
    form.clave.autocomplete = registro ? "new-password" : "current-password";
    $(".ayuda-clave", modal).hidden = !registro;
    $("#acceso-titulo", modal).textContent = registro ? "Crea tu cuenta" : "Hola de nuevo";
    const etiqueta = $("span", enviar);
    etiqueta.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: dur(380), easing: RESORTE });
    etiqueta.textContent = registro ? "Crear cuenta" : "Iniciar sesión";
    error.textContent = "";
    // Se enfoca cuando el campo ya se desplegó (si no, el navegador desplaza su contenido)
    setTimeout(() => (registro ? form.nombre : form.email).focus({ preventScroll: true }), dur(registro ? 380 : 0));
  }

  pestañas.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-modo]");
    if (b) cambiarModo(b.dataset.modo);
  });

  $(".ojo", modal).addEventListener("click", (e) => {
    const b = e.currentTarget;
    const ver = form.clave.type === "password";
    form.clave.type = ver ? "text" : "password";
    b.setAttribute("aria-pressed", ver);
    b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = { email: form.email.value.trim(), clave: form.clave.value };
    if (modo === "registro") datos.nombre = form.nombre.value.trim();
    const falla = validar(datos);
    if (falla) {
      mostrarError(falla);
      return;
    }
    enviar.disabled = true;
    enviar.classList.add("cargando");
    try {
      const r = await pedirJSON("POST", modo === "registro" ? "/api/registro" : "/api/login", datos);
      establecer(r.usuario);
      aviso(modo === "registro" ? `Bienvenido, ${r.usuario.nombre.split(/\s+/)[0]}` : `Hola, ${r.usuario.nombre.split(/\s+/)[0]}`,
        "Sesión iniciada");
      cerrar(r.usuario);
    } catch (err) {
      mostrarError(err.message);
    } finally {
      enviar.disabled = false;
      enviar.classList.remove("cargando");
    }
  });

  function validar(d) {
    if (modo === "registro" && d.nombre.length < 2) return "Escribe tu nombre";
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(d.email)) return "Escribe un correo válido";
    if (modo === "registro" && d.clave.length < 8) return "La contraseña debe tener al menos 8 caracteres";
    if (!d.clave) return "Escribe tu contraseña";
    return "";
  }

  function mostrarError(msg) {
    error.textContent = msg;
    sacudir(modal);
  }

  async function cerrar(resultado = null) {
    if (cerrada) return;
    cerrada = true;
    capas.quitar(cerrarCapa);
    velo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(320), easing: SALIDA, fill: "forwards" });
    await modal.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px) scale(.96)", filter: "blur(8px)" }],
      { duration: dur(300), easing: SALIDA, fill: "forwards" }
    ).finished.catch(() => {});
    capa.remove();
    resolver(resultado);
  }
  const cerrarCapa = () => cerrar(null);

  capas.abrir(cerrarCapa);
  velo.addEventListener("click", cerrarCapa);
  $(".cerrar", modal).addEventListener("click", cerrarCapa);

  velo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(420), easing: "ease-out", fill: "both" });
  modal.animate(
    [
      { opacity: 0, transform: "translateY(26px) scale(.94)", filter: "blur(12px)" },
      { opacity: 1, transform: "none", filter: "blur(0)" },
    ],
    { duration: dur(760), easing: RESORTE }
  );
  $$("form > *, .pestañas, .acceso-motivo", modal).forEach((el, i) =>
    el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
      { duration: dur(600), delay: dur(120 + i * 45), easing: RESORTE, fill: "backwards" })
  );
  setTimeout(() => form.email.focus({ preventScroll: true }), 60);
}

// ------------------------------------------------------------------ menú de la cuenta
let menu = null;

function cerrarMenu() {
  if (!menu) return;
  const m = menu;
  menu = null;
  capas.quitar(cerrarMenu);
  boton.setAttribute("aria-expanded", "false");
  m.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px) scale(.97)" }],
    { duration: dur(200), easing: SALIDA, fill: "forwards" }).finished.then(() => m.remove(), () => m.remove());
}

function abrirMenu() {
  menu = document.createElement("div");
  menu.className = "menu-cuenta glass glass-fuerte";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <div class="menu-usuario"><span class="avatar grande"><span class="inicial">${esc(usuario.nombre.trim()[0]?.toUpperCase() ?? "")}</span></span>
      <div><strong>${esc(usuario.nombre)}</strong><span>${esc(usuario.email)}</span></div></div>
    <button type="button" role="menuitem" data-accion="pedidos">Mis pedidos</button>
    <button type="button" role="menuitem" data-accion="salir">Cerrar sesión</button>`;
  document.body.append(menu);
  const r = boton.getBoundingClientRect();
  menu.style.top = `${r.bottom + 10}px`;
  menu.style.right = `${Math.max(12, innerWidth - r.right)}px`;
  boton.setAttribute("aria-expanded", "true");
  capas.abrir(cerrarMenu);
  menu.animate(
    [{ opacity: 0, transform: "translateY(-10px) scale(.95)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: dur(520), easing: RESORTE }
  );
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    cerrarMenu();
    if (b.dataset.accion === "salir") {
      await pedirJSON("POST", "/api/logout").catch(() => {});
      establecer(null);
      aviso("Sesión cerrada", "¡Vuelve pronto!");
    } else document.dispatchEvent(new CustomEvent("ver-pedidos"));
  });
}

boton.addEventListener("click", (e) => {
  e.stopPropagation();
  if (menu) cerrarMenu();
  else if (usuario) abrirMenu();
  else pedirSesion();
});
document.addEventListener("pointerdown", (e) => {
  if (menu && !menu.contains(e.target) && !boton.contains(e.target)) cerrarMenu();
});
addEventListener("resize", cerrarMenu);
