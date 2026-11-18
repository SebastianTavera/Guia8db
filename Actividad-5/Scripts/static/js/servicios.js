// Campus — servicios: laboratorios (reservas en MySQL, sin dobles reservas),
// ciencias básicas (monitorías en MongoDB) y bases de datos en línea.
import { $, ICONOS, aviso, esc, sacudir } from "./comun.js";
import { IC, abrirModal, api, cupoHTML, entrarEnCascada, estado, fechaLarga, vacioHTML } from "./campus.js";

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaTexto = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${DIA_CORTO[d.getDay()]} ${d.getDate()}`;
};

// ------------------------------------------------------------------ laboratorios
async function laboratorios(vista) {
  let d = await api("GET", "/api/laboratorios");
  let lab = Object.keys(d.laboratorios)[0];
  let resaltar = null;

  function estadoCelda(fecha, franja) {
    const o = d.ocupadas.find((x) => x.laboratorio === lab && x.fecha === fecha && x.franja === franja);
    if (o) return o.mia ? { clase: "mia", texto: "Tu reserva", o } : { clase: "ocupada", texto: `Ocupado · ${o.por}`, o };
    if (`${fecha} ${franja.slice(0, 5)}` <= d.ahora) return { clase: "pasada", texto: "—" };
    return { clase: "libre", texto: "Reservar" };
  }

  function pintar(animar = true) {
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Laboratorios</h2><p>Reserva una franja de 2 horas en los próximos días. Máximo ${d.maximo} reservas activas. La ocupación se actualiza en vivo.</p></div>
        <label class="selector"><select id="f-lab">${Object.entries(d.laboratorios).map(([k, n]) => `<option value="${k}" ${k === lab ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label></div>
      <div class="lab-pila">
        <section class="panel glass"><div class="panel-cabeza"><h3>${esc(d.laboratorios[lab])}</h3>
          <span class="leyenda" style="margin:0"><span><i style="--banner:var(--hundido);box-shadow:var(--hueco)"></i>Ocupado</span><span><i style="--banner:var(--rojo)"></i>Tuya</span></span></div>
          <div class="tabla-envoltura"><table class="tabla reservas-tabla"><thead><tr><th>Franja</th>${d.dias.map((f) => `<th style="text-align:center">${diaTexto(f)}</th>`).join("")}</tr></thead>
            <tbody>${d.franjas.map((fr) => `<tr><td><strong>${fr.replace("-", " – ")}</strong></td>${d.dias.map((f) => {
              const c = estadoCelda(f, fr);
              const nueva = resaltar && resaltar.fecha === f && resaltar.franja === fr && resaltar.laboratorio === lab;
              return `<td class="celda"><button class="franja ${c.clase} ${nueva ? "nueva" : ""}" type="button" data-fecha="${f}" data-franja="${fr}" ${c.clase === "ocupada" || c.clase === "pasada" ? "disabled" : ""}
                title="${esc(c.texto)}">${esc(c.texto)}</button></td>`;
            }).join("")}</tr>`).join("")}</tbody></table></div></section>
        <section class="panel glass"><div class="panel-cabeza"><h3>Mis reservas</h3><span class="chip rojo">${d.mias.length}/${d.maximo}</span></div>
          ${d.mias.length ? `<div class="mis-reservas">${d.mias.map((r) => `<article><span class="tipo-icono">${IC.laboratorio}</span><div><strong>${esc(d.laboratorios[r.Laboratorio])}</strong>
            <span class="sub">${fechaLarga(r.Fecha)} · ${esc(r.Franja)}</span><span class="sub">${esc(r.Motivo)}</span></div>
            <button class="boton-icono peligro" type="button" data-cancelar="${r.IdReserva}" title="Cancelar" aria-label="Cancelar reserva">${IC.papelera}</button></article>`).join("")}</div>`
            : `<p class="tenue">No tienes reservas activas.</p>`}</section>
      </div>`;
    if (animar) entrarEnCascada(".pagina-cabeza, .panel", vista, 40);
  }

  async function recargar(nueva = null) {
    d = await api("GET", "/api/laboratorios");
    resaltar = nueva;
    pintar(false);
  }

  vista.onchange = (e) => {
    if (e.target.id === "f-lab") {
      lab = e.target.value;
      pintar(false);
    }
  };
  vista.onclick = async (e) => {
    const celda = e.target.closest(".franja.libre");
    const mia = e.target.closest(".franja.mia");
    const cancelar = e.target.closest("[data-cancelar]");
    if (celda) {
      const { fecha, franja } = celda.dataset;
      const { modal, cerrar } = abrirModal(`<div class="modal-cabeza"><div><h2>Reservar laboratorio</h2><p>${esc(d.laboratorios[lab])} · ${fechaLarga(fecha)} · ${esc(franja)}</p></div>
          <button class="boton-vidrio boton-redondo cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
        <form class="formulario" novalidate><label class="campo">Motivo de la reserva<input name="motivo" maxlength="120" required placeholder="Ej. Práctica de circuitos para Electrónica I"></label>
          <div class="nota-aviso">${IC.aviso}<span>Si otra persona reserva esta misma franja al mismo tiempo, solo una reserva queda confirmada.</span></div>
          <p class="error-texto" role="alert"></p>
          <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Cancelar</button><button class="boton-solido" type="submit">Confirmar reserva</button></div></form>`);
      $("form", modal).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.currentTarget;
        try {
          await api("POST", "/api/laboratorios/reservas", { laboratorio: lab, fecha, franja, motivo: f.motivo.value });
          await cerrar();
          aviso("Laboratorio reservado", `${d.laboratorios[lab]} · ${fechaLarga(fecha)} · ${franja}`);
          await recargar({ laboratorio: lab, fecha, franja });
        } catch (err) {
          $(".error-texto", f).textContent = err.message;
          sacudir(modal);
          recargar();
        }
      });
      setTimeout(() => $("input", modal).focus(), 60);
    } else if (mia || cancelar) {
      const id = cancelar ? Number(cancelar.dataset.cancelar) : d.ocupadas.find((o) => o.mia && o.fecha === mia.dataset.fecha && o.franja === mia.dataset.franja && o.laboratorio === lab)?.id;
      if (!id) return;
      const { modal, cerrar } = abrirModal(`<div class="modal-cabeza"><div><h2>Cancelar reserva</h2><p>La franja quedará libre para otras personas.</p></div></div>
        <div class="modal-pie"><button class="boton-vidrio" type="button" data-cerrar>Volver</button><button class="boton-solido" type="button" data-si>Cancelar reserva</button></div>`);
      $("[data-si]", modal).addEventListener("click", async () => {
        try {
          await api("DELETE", `/api/laboratorios/reservas/${id}`);
          await cerrar();
          aviso("Reserva cancelada", "");
          recargar();
        } catch (err) {
          aviso("No se pudo cancelar", err.message, "error");
        }
      });
    }
  };
  pintar();
  return {
    async alEvento(ev) {
      if (!["reserva", "reserva_cancelada"].includes(ev.accion) || ev.actor?.id === estado.usuario.id) return;
      await recargar();
    },
  };
}

// ------------------------------------------------------------------ ciencias básicas: monitorías
async function ciencias(vista) {
  let lista = (await api("GET", "/api/monitorias")).monitorias;
  function pintar(animar = true, cambiada = null) {
    const mias = lista.filter((m) => m.inscrito).length;
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Ciencias básicas</h2><p>Monitorías gratuitas de matemáticas, física y química. Inscríbete para reservar tu cupo; los cupos se actualizan en vivo.</p></div>
        <span class="chip ${mias ? "solido" : ""}">${mias} ${mias === 1 ? "inscripción" : "inscripciones"}</span></div>
      <div class="tarjetas-servicio">${lista.map((m) => {
        const lleno = m.ocupados >= m.cupo;
        return `<article class="servicio glass ${m.inscrito ? "inscrito" : ""} ${cambiada === m.id ? "nueva" : ""}" data-id="${esc(m.id)}">
          <div class="servicio-cabeza"><span class="tipo-icono ${m.modalidad === "Virtual" ? "material" : ""}">${IC.ciencias}</span><div><h3>${esc(m.materia)}</h3><p>${esc(m.tema)}</p></div></div>
          <div class="meta"><span>${IC.docente}Monitor(a): ${esc(m.monitor)}</span><span>${IC.reloj}${esc(m.dia)} · ${esc(m.hora)}</span><span>${IC.lugar}${esc(m.lugar)} · ${esc(m.modalidad)}</span></div>
          ${cupoHTML(m.ocupados, m.cupo)}
          ${m.inscrito ? `<button class="boton-vidrio boton-peligro" type="button" data-retirar="${esc(m.id)}">Retirarme</button>`
            : `<button class="boton-vidrio claro" type="button" data-inscribir="${esc(m.id)}" ${lleno ? "disabled" : ""}>${lleno ? "Sin cupo" : "Inscribirme"}</button>`}</article>`;
      }).join("")}</div>`;
    if (animar) entrarEnCascada(".pagina-cabeza, .servicio", vista, 40);
  }
  vista.onclick = async (e) => {
    const ins = e.target.closest("[data-inscribir]");
    const ret = e.target.closest("[data-retirar]");
    const b = ins || ret;
    if (!b || b.disabled) return;
    b.disabled = true;
    b.classList.add("cargando");
    try {
      const id = b.dataset.inscribir || b.dataset.retirar;
      const { monitoria } = await api(ins ? "POST" : "DELETE", `/api/monitorias/${id}`);
      aviso(ins ? "Inscripción confirmada" : "Te retiraste de la monitoría", `${monitoria.materia} · ${monitoria.dia} ${monitoria.hora}`);
      lista = (await api("GET", "/api/monitorias")).monitorias;
      pintar(false, id);
    } catch (err) {
      aviso("No se pudo completar", err.message, "error");
      lista = (await api("GET", "/api/monitorias")).monitorias;
      pintar(false);
    }
  };
  pintar();
  return {
    async alEvento(ev) {
      if (!["monitoria", "monitoria_retiro"].includes(ev.accion) || ev.actor?.id === estado.usuario.id) return;
      lista = (await api("GET", "/api/monitorias")).monitorias;
      pintar(false, ev.detalle?.monitoria);
    },
  };
}

// ------------------------------------------------------------------ bases de datos en línea
async function recursos(vista) {
  const { recursos: lista } = await api("GET", "/api/recursos");
  let filtro = "";
  function pintar(animar = true) {
    const visibles = lista.filter((r) => !filtro || `${r.nombre} ${r.descripcion} ${r.area}`.toLowerCase().includes(filtro));
    const areas = [...new Set(visibles.map((r) => r.area))];
    vista.innerHTML = `<div class="pagina-cabeza"><div><h2>Bases de datos en línea</h2><p>Recursos académicos de acceso abierto para tus investigaciones. Se abren en una pestaña nueva.</p></div>
        <span class="chip rojo">${visibles.length} recursos</span></div>
      ${visibles.length ? areas.map((a) => `<p class="area-titulo">${esc(a)}</p><div class="tarjetas-servicio">${visibles.filter((r) => r.area === a).map((r) => `
        <article class="servicio glass"><div class="servicio-cabeza"><span class="tipo-icono">${IC.baseDatos}</span><div><h3>${esc(r.nombre)}</h3><p>${esc(r.descripcion)}</p></div></div>
          <a class="boton-vidrio" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${IC.enlace} Abrir ${esc(new URL(r.url).hostname.replace(/^www\./, ""))}</a></article>`).join("")}</div>`).join("")
        : `<div class="panel glass">${vacioHTML("Sin resultados", "Prueba con otra palabra en el buscador.")}</div>`}`;
    if (animar) entrarEnCascada(".pagina-cabeza, .area-titulo, .servicio, .panel", vista, 30);
  }
  pintar();
  return {
    alBuscar(t) {
      filtro = t;
      pintar(false);
    },
  };
}

export const rutasServicios = { laboratorios, ciencias, recursos };
