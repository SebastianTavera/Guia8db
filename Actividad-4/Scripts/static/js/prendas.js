// Ilustraciones SVG de las prendas. Cada una tiene partes animables:
//   .mi / .md   -> manga o pierna izquierda / derecha (se "abren" al ver el detalle)
//   .falda      -> vuelo del vestido
//   .visera     -> visera de la gorra
// La clase .plegada en el <svg> cierra esas partes; al quitarla se despliegan.

const tela = (d) => `<path class="tela" d="${d}"/><path class="vol" d="${d}"/>`;
const costura = (d) => `<path class="costura" d="${d}"/>`;
const boton = (x, y, r = 2) => `<circle class="boton" cx="${x}" cy="${y}" r="${r}"/>`;
const grupo = (clase, ox, oy, contenido) =>
  `<g class="${clase}" style="transform-origin:${ox}px ${oy}px">${contenido}</g>`;

const DIBUJOS = {
  camisa: {
    cierre: 18,
    svg: () =>
      grupo("mi", 60, 48, tela("M60 46 Q44 70 30 122 L47 129 Q56 100 62 84 Z") + costura("M32 115 L49 122")) +
      grupo("md", 140, 48, tela("M140 46 Q156 70 170 122 L153 129 Q144 100 138 84 Z") + costura("M168 115 L151 122")) +
      tela("M84 34 Q100 44 116 34 L140 46 Q143 120 142 202 Q100 210 58 202 Q57 120 60 46 Z") +
      costura("M100 54 L100 205") + costura("M110 82 h18 v15 q-9 4 -18 0 Z") +
      [76, 100, 124, 148, 172].map((y) => boton(103.5, y)).join("") +
      tela("M84 34 L100 54 L91 63 L77 41 Z") + tela("M116 34 L100 54 L109 63 L123 41 Z"),
  },
  camiseta: {
    cierre: 22,
    svg: () =>
      grupo("mi", 61, 44, tela("M60 42 L33 74 L49 90 L62 76 Z") + costura("M37 70 L52 85")) +
      grupo("md", 139, 44, tela("M140 42 L167 74 L151 90 L138 76 Z") + costura("M163 70 L148 85")) +
      tela("M80 32 Q100 46 120 32 L140 42 Q141 120 139 198 Q100 204 61 198 Q59 120 60 42 Z") +
      costura("M83 34 Q100 51 117 34") + costura("M63 189 Q100 195 137 189"),
  },
  buzo: {
    cierre: 16,
    svg: () =>
      tela("M76 46 Q76 10 100 8 Q124 10 124 46 Q100 32 76 46 Z") +
      grupo("mi", 58, 52, tela("M58 50 Q42 80 30 150 L48 154 Q56 112 64 90 Z") + tela("M30 150 L48 154 L46 166 L27 162 Z")) +
      grupo("md", 142, 52, tela("M142 50 Q158 80 170 150 L152 154 Q144 112 136 90 Z") + tela("M170 150 L152 154 L154 166 L173 162 Z")) +
      tela("M78 40 Q100 52 122 40 L142 50 Q145 120 143 196 L57 196 Q55 120 58 50 Z") +
      tela("M57 196 L143 196 L142 209 Q100 213 58 209 Z") +
      costura("M80 42 Q100 57 120 42") + costura("M72 142 L128 142 L136 178 L64 178 Z") +
      costura("M93 52 L91 86") + costura("M107 52 L109 86") + boton(91, 88, 2.4) + boton(109, 88, 2.4),
  },
  chaqueta: {
    cierre: 15,
    svg: () =>
      grupo("mi", 58, 48, tela("M58 46 Q40 80 28 156 L47 160 Q56 116 64 88 Z") + costura("M30 148 L49 152")) +
      grupo("md", 142, 48, tela("M142 46 Q160 80 172 156 L153 160 Q144 116 136 88 Z") + costura("M170 148 L151 152")) +
      tela("M82 30 L118 30 L142 46 Q146 120 144 202 L56 202 Q54 120 58 46 Z") +
      tela("M80 18 L120 18 L119 31 L81 31 Z") +
      costura("M100 18 L100 202") + costura("M66 142 L82 128") + costura("M134 142 L118 128") +
      costura("M56 192 L144 192") + costura("M112 70 L130 70") +
      `<rect class="boton" x="97.5" y="38" width="5" height="9" rx="1.5"/>`,
  },
  abrigo: {
    cierre: 12,
    svg: () =>
      grupo("mi", 60, 46, tela("M60 44 Q42 84 30 170 L49 174 Q57 122 66 90 Z") + costura("M32 162 L50 166")) +
      grupo("md", 140, 46, tela("M140 44 Q158 84 170 170 L151 174 Q143 122 134 90 Z") + costura("M168 162 L150 166")) +
      tela("M82 28 L118 28 L140 44 Q146 128 150 212 Q100 218 50 212 Q54 128 60 44 Z") +
      costura("M100 80 L100 214") + costura("M64 162 L80 155") + costura("M136 162 L120 155") +
      costura("M52 202 Q100 208 148 202") +
      tela("M82 28 L100 80 L88 88 L70 40 Z") + tela("M118 28 L100 80 L112 88 L130 40 Z") +
      tela("M56 126 L144 126 L145 138 L55 138 Z") +
      `<rect class="hebilla" x="93" y="123.5" width="14" height="17" rx="2.5"/>` +
      [100, 114].map((y) => boton(89, y, 2.4) + boton(111, y, 2.4)).join(""),
  },
  falda: {
    cierre: 0,
    svg: () =>
      grupo("falda", 100, 60,
        tela("M65 60 L135 60 L166 194 Q100 207 34 194 Z") +
        costura("M80 62 L60 198") + costura("M92 62 L84 202") + costura("M108 62 L116 202") + costura("M120 62 L140 198") +
        costura("M37 186 Q100 199 163 186")) +
      tela("M64 44 L136 44 L136 60 L64 60 Z") + costura("M64 52 L136 52") + boton(100, 52, 2.2),
  },
  pantalon: {
    cierre: 3.5,
    svg: () =>
      grupo("mi", 100, 42, tela("M59 42 L100 42 L100 84 L92 208 L55 208 Z") + costura("M78 62 L74 206")) +
      grupo("md", 100, 42, tela("M100 42 L141 42 L145 208 L108 208 L100 84 Z") + costura("M122 62 L126 206")) +
      tela("M59 26 L141 26 L141 42 L59 42 Z") +
      costura("M96 42 Q96 72 100 84") + costura("M64 42 Q73 56 67 70") + costura("M136 42 Q127 56 133 70") +
      boton(100, 34, 2.4) +
      [70, 86, 114, 130].map((x) => `<rect class="presilla" x="${x - 1.5}" y="25" width="3" height="18" rx="1"/>`).join(""),
  },
  vestido: {
    cierre: 0,
    svg: () =>
      tela("M80 18 L84 18 L87 52 L82 52 Z") + tela("M120 18 L116 18 L113 52 L118 52 Z") +
      grupo("falda", 100, 100,
        tela("M74 100 Q100 106 126 100 L168 206 Q100 219 32 206 Z") +
        costura("M90 106 L74 210") + costura("M110 106 L126 210") + costura("M100 107 L100 214")) +
      tela("M78 48 Q100 58 122 48 L126 101 Q100 107 74 101 Z") +
      costura("M74 101 Q100 107 126 101") + costura("M84 52 Q100 66 116 52"),
  },
  gorra: {
    cierre: 0,
    svg: () =>
      `<g transform="translate(0 22)">` +
      tela("M46 128 Q46 62 100 58 Q154 62 154 128 Z") +
      costura("M100 60 L100 126") + costura("M73 66 Q66 96 70 126") + costura("M127 66 Q134 96 130 126") +
      boton(84, 84, 1.8) + boton(116, 84, 1.8) +
      grupo("visera", 100, 128, tela("M38 128 Q100 112 162 128 L170 146 Q100 130 30 146 Z") + costura("M42 133 Q100 119 158 133")) +
      tela("M95 56 a5 4 0 0 1 10 0 Z") +
      `</g>`,
  },
};

/** Acepta solo colores #rrggbb (los datos podrían editarse fuera de la app). */
export const hexSeguro = (hex) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#8e8e93");

/** Devuelve true si el color es oscuro (para decidir el color de costuras). */
function esOscuro(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/** Variables CSS que tiñen la prenda. */
export function estiloColor(hex) {
  hex = hexSeguro(hex);
  return `--c:${hex};--costura:${esOscuro(hex) ? "rgb(255 255 255 / .24)" : "rgb(0 0 0 / .22)"}`;
}

/** Aplica un nuevo color a un <svg> de prenda ya existente (con transición). */
export function teñir(svg, hex) {
  hex = hexSeguro(hex);
  svg.style.setProperty("--c", hex);
  svg.style.setProperty("--costura", esOscuro(hex) ? "rgb(255 255 255 / .24)" : "rgb(0 0 0 / .22)");
}

/** Genera el SVG de una prenda. */
export function svgPrenda(tipo, hex, clases = "") {
  const dibujo = DIBUJOS[tipo] || DIBUJOS.camiseta;
  return `<svg class="prenda ${clases}" data-tipo="${tipo in DIBUJOS ? tipo : "camiseta"}" viewBox="0 0 200 220"
    style="${estiloColor(hex)};--cierre:${dibujo.cierre}deg" aria-hidden="true" focusable="false">${dibujo.svg()}</svg>`;
}

/** Definiciones compartidas (degradado de volumen). Se insertan una sola vez. */
export function insertarDefs() {
  if (document.getElementById("defs-prendas")) return;
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg id="defs-prendas" width="0" height="0" style="position:absolute" aria-hidden="true">
      <defs>
        <linearGradient id="g-volumen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".30"/>
          <stop offset=".42" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".7" stop-color="#000" stop-opacity=".06"/>
          <stop offset="1" stop-color="#000" stop-opacity=".30"/>
        </linearGradient>
      </defs>
    </svg>`
  );
}
