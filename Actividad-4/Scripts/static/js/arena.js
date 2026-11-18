// Fondo interactivo: arena blanca y negra iluminada por una linterna.
//
// Física (CPU, sobre una rejilla de alturas de 3 px por celda):
//   - El puntero actúa como un dedo: retira arena bajo la punta y la empuja
//     hacia los lados y hacia el frente (crestas y una pequeña "ola").
//   - Avalanchas: si la pendiente supera el ángulo de reposo de la arena seca
//     (~33°), el exceso se desliza cuesta abajo.
//   - Al moverse rápido salen granos proyectados (gravedad + arrastre del aire).
//   - Sin rastro: la arena removida vuelve a su forma original en ~1 s
//     (relajación exponencial), así que el fondo solo "se mueve" y se recompone.
//   - La linterna sigue al puntero con un resorte amortiguado (inercia de la mano).
//   - Todo usa el tiempo real entre cuadros: se ve igual a 60 Hz o a 120 Hz.
//
// Render (GPU, WebGL2): granos individuales (ruido celular) con albedo propio,
// normales del relieve y del grano, foco con cono suave, sombras por trazado de
// rayos, oclusión ambiental y destellos de cuarzo.
//
// Rendimiento en cualquier equipo:
//   - 3 niveles de calidad (pasos de sombra, oclusión, tamaño del lienzo); el
//     inicial se elige según el dispositivo y un regulador lo baja si los fps caen.
//   - Solo se simulan y suben a la GPU los bloques de arena que se están moviendo.
//   - Si nada se mueve, no se dibuja nada (0 % de GPU en reposo).
//   - Sin WebGL2, o si el contexto gráfico se pierde, queda el fondo CSS de respaldo.

const CELDA = 3; // px CSS por celda de la simulación
const ALTO = 7; // px CSS por unidad de altura
const RADIO = 5.2; // radio del dedo, en celdas
const PROFUNDIDAD = 1.25; // profundidad del surco, en unidades de altura
const TALUD = 0.33; // diferencia máxima de altura entre celdas vecinas (~33°)
const GRAVEDAD = 0.032; // unidades de altura por paso de 1/60 s
const RECUPERACION = 0.7; // constante de tiempo (s) con la que la arena vuelve a su forma
const BLOQUE = 24; // la física trabaja por bloques de 24×24 celdas
const PASO = 1 / 60; // paso fijo de la física

// Ajustes por nivel de calidad: 0 = baja, 1 = media, 2 = alta
const NIVELES = [
  { escalaMax: 0.75, pasosSombra: 3, ao: 0, vecinos: 2, granos: 500, avalanchas: 0, limiteFps: true },
  { escalaMax: 1.0, pasosSombra: 6, ao: 1, vecinos: 3, granos: 1200, avalanchas: 1, limiteFps: true },
  { escalaMax: 1.5, pasosSombra: 11, ao: 1, vecinos: 3, granos: 2400, avalanchas: 1, limiteFps: false },
];

// ------------------------------------------------------------------ shaders
const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const LUZ_GLSL = `
uniform vec3 uLuz;           // posición de la linterna (px CSS; z sobre la arena)
uniform vec2 uFoco;          // punto al que apunta (px CSS)
uniform float uOscuro;       // 1 = tema oscuro
float foco(vec3 P, out vec3 dirLuz) {
  vec3 L = uLuz - P;
  float dist = length(L);
  dirLuz = L / dist;
  vec3 eje = normalize(vec3(uFoco, 0.0) - uLuz);
  float c = dot(-dirLuz, eje);
  float cono = 0.26 * smoothstep(0.70, 0.90, c) + 0.74 * smoothstep(0.86, 0.975, c);
  return cono / (1.0 + dist * dist * 0.0000045);
}
float tono(float c) { return pow(clamp(c / (1.0 + c * 0.35), 0.0, 1.0), 0.8); }
float potencia() { return uOscuro > 0.5 ? 2.9 : 1.15; }`;

function fragmento(n) {
  const nivel = NIVELES[n];
  return `#version 300 es
precision highp float;
precision highp int;
#define PASOS_SOMBRA ${nivel.pasosSombra}
#define CON_AO ${nivel.ao}
#define VECINOS ${nivel.vecinos}
uniform sampler2D uAltura;   // r = altura, g = semilla del grano
uniform sampler2D uMancha;   // manchas de tono precalculadas (estáticas)
uniform vec2 uResol;         // tamaño del lienzo en px reales
uniform float uEscala;       // px reales por px CSS
uniform vec2 uRejilla;       // celdas
${LUZ_GLSL}
out vec4 salida;

const float CELDA = ${CELDA.toFixed(1)};
const float ALTO = ${ALTO.toFixed(1)};
const float GRANO = 3.0;     // tamaño del grano en px CSS

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float altura(vec2 uv) { return texture(uAltura, uv).r; }

void main() {
  vec2 css = vec2(gl_FragCoord.x, uResol.y - gl_FragCoord.y) / uEscala;
  vec2 aUv = 1.0 / (uRejilla * CELDA);    // px CSS -> coordenadas de textura
  vec2 uv = css * aUv;
  ivec2 maxCelda = ivec2(uRejilla) - 1;

  // ---- grano: punto característico más cercano (ruido celular)
  vec2 g = css / GRANO;
  ivec2 gi = ivec2(floor(g));
  vec2 gf = fract(g);
  float d1 = 9.0, d2 = 9.0;
  vec2 rel = vec2(0.0);
  uint hGanador = 0u;
#if VECINOS == 3
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 o2 = ivec2(i, j);
#else
  ivec2 lado = ivec2(gf.x < 0.5 ? -1 : 1, gf.y < 0.5 ? -1 : 1);
  for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
    ivec2 o2 = ivec2(i * lado.x, j * lado.y);
#endif
    ivec2 c = gi + o2;
    ivec2 celda = clamp(ivec2((vec2(c) + 0.5) * (GRANO / CELDA)), ivec2(0), maxCelda);
    uint semilla = uint(texelFetch(uAltura, celda, 0).g);
    uint h = pcg(uint(c.x) * 1973u + pcg(uint(c.y) * 9277u + semilla * 26699u));
    uint h2 = pcg(h);
    vec2 o = vec2(o2) + 0.12 + vec2(float(h & 65535u), float(h2 & 65535u)) * (0.76 / 65535.0) - gf;
    float d = dot(o, o);
    if (d < d1) { d2 = d1; d1 = d; rel = o; hGanador = h2; }
    else if (d < d2) { d2 = d; }
  }
  uint h3 = pcg(hGanador);
  float tipo = float(h3 & 65535u) / 65535.0;
  float var = float(h3 >> 16u) / 65535.0;
  float borde = smoothstep(0.0, 0.2, sqrt(d2) - sqrt(d1));       // grieta entre granos
  float radioGrano = 0.42 + var * 0.22;
  float cupula = clamp(1.0 - sqrt(d1) / radioGrano, 0.0, 1.0);

  // albedo: granos negros, blancos y cuarzo; las manchas amplias varían la mezcla
  float mancha = texture(uMancha, uv).r;
  float albedo, cuarzo;
  if (uOscuro > 0.5) {
    float claros = 0.30 + mancha * 0.22;
    albedo = tipo < 1.0 - claros ? 0.09 + var * 0.08 : (tipo < 0.975 ? 0.26 + var * 0.26 : 0.85);
    cuarzo = step(0.975, tipo);
  } else {
    float oscuros = 0.03 + (1.0 - mancha) * 0.04;
    albedo = tipo < oscuros ? 0.70 + var * 0.1 : (tipo < 0.985 ? 0.89 + var * 0.09 : 1.0);
    cuarzo = step(0.985, tipo);
  }
  albedo *= 0.93 + mancha * 0.14;

  // ---- relieve
  vec2 e = vec2(CELDA, 0.0) * aUv.x;
  vec2 f = vec2(0.0, CELDA) * aUv.y;
  float hc = altura(uv);
  float hx = altura(uv + e) - altura(uv - e);
  float hy = altura(uv + f) - altura(uv - f);
  vec3 nRelieve = normalize(vec3(-hx * ALTO / (2.0 * CELDA), -hy * ALTO / (2.0 * CELDA), 1.0));
  vec2 inclinGrano = -rel / radioGrano * (0.55 + 0.6 * cupula);
  vec3 n = normalize(nRelieve + vec3(inclinGrano * 0.75, 0.0));

  float ao = 1.0;
#if CON_AO == 1
  // oclusión ambiental: los surcos reciben menos luz que las crestas
  vec2 r1 = vec2(CELDA * 2.6) * aUv;
  float media = (altura(uv + r1) + altura(uv - r1) + altura(uv + vec2(r1.x, -r1.y)) + altura(uv + vec2(-r1.x, r1.y))) * 0.25;
  ao = clamp(1.0 + (hc - media) * (uOscuro > 0.5 ? 1.5 : 0.9), uOscuro > 0.5 ? 0.45 : 0.72, 1.1);
#endif

  // ---- linterna
  vec3 P = vec3(css, hc * ALTO);
  vec3 dirLuz;
  float intensidad = foco(P, dirLuz);

  float sombra = 1.0;
#if PASOS_SOMBRA > 0
  if (intensidad > 0.004) {
    // se avanza desde el punto hacia la linterna; si el relieve tapa el rayo, hay sombra
    vec2 haciaLuz = uLuz.xy - css;
    float distXY = max(length(haciaLuz), 1.0);
    float largo = 38.0 / float(PASOS_SOMBRA);
    vec2 paso = haciaLuz / distXY * largo * aUv;
    for (int k = 1; k <= PASOS_SOMBRA; k++) {
      float t = float(k) * largo;
      if (t > distXY) break;
      float rayo = P.z + (uLuz.z - P.z) * (t / distXY);
      float hq = altura(uv + paso * float(k)) * ALTO;
      sombra = min(sombra, 1.0 - clamp((hq - rayo) * 0.55, 0.0, 1.0));
    }
  }
#endif

  float difusa = max(dot(n, dirLuz), 0.0);
  vec3 mitad = normalize(dirLuz + vec3(0.0, 0.0, 1.0));
  float brillo = cuarzo > 0.5 ? pow(max(dot(normalize(vec3(inclinGrano * 1.6, 1.0)), mitad), 0.0), 70.0) * 6.0 : 0.0;
  float brilloSuave = pow(max(dot(n, mitad), 0.0), 18.0) * 0.18;

  // la luz ambiente solo "ve" el relieve; la textura fina del grano la revela la linterna
  float ambiente = uOscuro > 0.5 ? 0.05 + 0.035 * nRelieve.z : 1.3 + 0.12 * pow(nRelieve.z, 6.0);
  float pot = potencia();
  float luz = ambiente * ao + pot * intensidad * difusa * sombra * mix(0.8, 1.05, ao);
  float grieta = mix(mix(0.9, 0.62, clamp(intensidad * 1.6, 0.0, 1.0)), 1.0, borde);
  float col = albedo * luz * grieta + (brillo + brilloSuave) * intensidad * sombra * pot;
  salida = vec4(vec3(tono(col)), 1.0);
}`;
}

const VERT_GRANOS = `#version 300 es
in vec4 aGrano;              // x, y (px CSS), z (altura), albedo
uniform vec2 uLienzo;        // px CSS
uniform float uEscala;
${LUZ_GLSL}
out float vCol;
void main() {
  vec2 p = aGrano.xy;
  gl_Position = vec4(p.x / uLienzo.x * 2.0 - 1.0, 1.0 - p.y / uLienzo.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, (1.5 + aGrano.w * 0.9) * uEscala);
  vec3 dirLuz;
  float intensidad = foco(vec3(p, aGrano.z * ${ALTO.toFixed(1)}), dirLuz);
  float amb = uOscuro > 0.5 ? 0.09 : 1.35;
  vCol = tono(aGrano.w * (amb + potencia() * intensidad));
}`;

const FRAG_GRANOS = `#version 300 es
precision mediump float;
in float vCol;
out vec4 salida;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  salida = vec4(vec3(vCol * (1.1 - r * 1.6)), 1.0);
}`;

// ------------------------------------------------------------------ ruido para el terreno inicial
function crearRuido(semilla) {
  const p = new Uint8Array(512);
  let s = semilla >>> 0;
  const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const val = new Float32Array(256).map(() => azar());
  const ruido = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = val[p[(p[xi & 255] + yi) & 511]], b = val[p[(p[(xi + 1) & 255] + yi) & 511]];
    const c = val[p[(p[xi & 255] + yi + 1) & 511]], d = val[p[(p[(xi + 1) & 255] + yi + 1) & 511]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, octavas = 4) => {
    let t = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octavas; o++) {
      t += ruido(x * f, y * f) * amp;
      f *= 2.03;
      amp *= 0.5;
    }
    return t;
  };
}

function leerNivelGuardado() {
  try {
    const v = JSON.parse(localStorage.getItem("arena-calidad") || "null");
    return v && Date.now() - v.cuando < 3 * 864e5 ? v.nivel : null;
  } catch {
    return null;
  }
}
function guardarNivel(nivel) {
  try {
    localStorage.setItem("arena-calidad", JSON.stringify({ nivel, cuando: Date.now() }));
  } catch {
    /* sin almacenamiento */
  }
}

// ------------------------------------------------------------------ módulo
export function iniciarArena(contenedor) {
  const lienzo = document.createElement("canvas");
  lienzo.className = "arena";
  lienzo.setAttribute("aria-hidden", "true");
  const gl = lienzo.getContext("webgl2", {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: "default", preserveDrawingBuffer: false,
  });
  if (!gl) return false;

  const raiz = document.documentElement;
  const oscuro = matchMedia("(prefers-color-scheme: dark)");
  const movReducido = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------- nivel de calidad inicial
  function nivelInicial() {
    const tactil = matchMedia("(pointer: coarse)").matches;
    const nucleos = navigator.hardwareConcurrency || 4;
    const memoria = navigator.deviceMemory || 4;
    let n = 2;
    if (tactil || nucleos <= 4 || memoria <= 4) n = 1;
    if (memoria <= 2 || (tactil && nucleos <= 4)) n = 0;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|software|softpipe/i.test(gpu)) n = 0; // sin tarjeta gráfica real
    // ?arena=0|1|2 en la dirección fuerza un nivel (útil para comparar o depurar)
    const forzado = new URLSearchParams(location.search).get("arena");
    if (/^[012]$/.test(forzado ?? "")) return Number(forzado);
    const guardado = leerNivelGuardado(); // -1 = el equipo no pudo con la arena: fondo quieto
    return guardado == null ? n : Math.min(n, guardado);
  }
  let nivel = nivelInicial();
  if (nivel < 0) {
    raiz.classList.add("fondo-quieto");
    return false;
  }
  let apagado = false;
  let factor = 1; // reducción extra del lienzo que decide el regulador (0.5–1)

  // ---------------------------------------------------------------- recursos de GPU
  const programas = new Map(); // nivel -> programa del suelo
  let progGranos, vao, vaoGranos, bufGranos, texAltura, texMancha;

  const compilar = (tipo, fuente) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const programa = (v, f) => {
    const pr = gl.createProgram();
    gl.attachShader(pr, compilar(gl.VERTEX_SHADER, v));
    gl.attachShader(pr, compilar(gl.FRAGMENT_SHADER, f));
    gl.bindAttribLocation(pr, 0, v.includes("aGrano") ? "aGrano" : "aPos");
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(pr));
    const u = {};
    const total = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < total; i++) {
      const nombre = gl.getActiveUniform(pr, i).name;
      u[nombre] = gl.getUniformLocation(pr, nombre);
    }
    return { pr, u };
  };
  const programaSuelo = (n) => {
    if (!programas.has(n)) programas.set(n, programa(VERT, fragmento(n)));
    return programas.get(n);
  };

  function prepararGL() {
    programas.clear();
    programaSuelo(nivel);
    progGranos = programa(VERT_GRANOS, FRAG_GRANOS);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    vaoGranos = gl.createVertexArray();
    gl.bindVertexArray(vaoGranos);
    bufGranos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufGranos);
    gl.bufferData(gl.ARRAY_BUFFER, NIVELES[2].granos * 16, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const textura = (unidad) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unidad);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    texMancha = textura(1);
    texAltura = textura(0);
    if (datos) subirTodo();
  }

  // ---------------------------------------------------------------- estado de la simulación
  let W = 0, H = 0, BW = 0, BH = 0; // celdas y bloques
  let datos = null; // Float32Array intercalado: [altura, semilla, ...] (lo que se sube a la GPU)
  let base = null; // forma original de la arena (a la que vuelve)
  let mancha = null; // Uint8Array de manchas de tono (estático)
  let ancho = 0, alto = 0, escala = 1;
  const activos = new Set(); // bloques que se están moviendo
  let sucio = null; // rectángulo de celdas a subir a la GPU

  const MAX_GRANOS = NIVELES[2].granos;
  const granos = new Float32Array(MAX_GRANOS * 4); // x, y, z, albedo
  const velGranos = new Float32Array(MAX_GRANOS * 3);
  let nGranos = 0;
  let azarS = 12345;
  const azar = () => ((azarS = (azarS * 1664525 + 1013904223) >>> 0) / 4294967296);

  const puntero = { x: innerWidth * 0.62, y: innerHeight * 0.32, px: null, py: null, ultimo: 0 };
  const linterna = { x: puntero.x, y: puntero.y, vx: 0, vy: 0, tx: 0, ty: 0 };

  const unir = (r, x0, y0, x1, y1) => {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
    if (x1 < x0 || y1 < y0) return r;
    if (!r) return { x0, y0, x1, y1 };
    return { x0: Math.min(r.x0, x0), y0: Math.min(r.y0, y0), x1: Math.max(r.x1, x1), y1: Math.max(r.y1, y1) };
  };

  // ---------------------------------------------------------------- terreno inicial
  function generar() {
    const nuevoW = Math.ceil(ancho / CELDA) + 2;
    const nuevoH = Math.ceil(Math.max(alto, screen.height || 0) / CELDA) + 2;
    if (datos && nuevoW <= W && nuevoH <= H) return;
    W = Math.max(nuevoW, W);
    H = Math.max(nuevoH, H);
    BW = Math.ceil(W / BLOQUE);
    BH = Math.ceil(H / BLOQUE);
    activos.clear();
    datos = new Float32Array(W * H * 2);
    base = new Float32Array(W * H);
    mancha = new Uint8Array(W * H);

    // Los campos de baja frecuencia se calculan cada 4 celdas y se interpolan
    // (mucho más rápido en equipos lentos); solo los rizos se calculan por celda.
    const ruido = crearRuido(20261117);
    const ondas = crearRuido(777);
    const tonos = crearRuido(4242);
    const P = 4, GW = Math.ceil(W / P) + 2, GH = Math.ceil(H / P) + 2;
    const dunas = new Float32Array(GW * GH), deform = new Float32Array(GW * GH);
    const fuerza = new Float32Array(GW * GH), tono = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++) {
        const x = gx * P, y = gy * P, k = gy * GW + gx;
        dunas[k] = ruido(x / 95, y / 95, 4) * 2.2;
        deform[k] = ondas(x / 40, y / 40, 3) * 5.5;
        fuerza[k] = 0.07 + 0.15 * ondas(x / 70 + 9, y / 70 - 3, 2);
        tono[k] = tonos(x / 15.3, y / 15.3, 2) * 0.65 + tonos(x / 4.3 + 50, y / 4.3, 1) * 0.7;
      }
    const ang = -0.38, ca = Math.cos(ang), sa = Math.sin(ang);
    let k = 0, fx = 0, fy = 0;
    const mezcla = (c) => (c[k] * (1 - fx) + c[k + 1] * fx) * (1 - fy) + (c[k + GW] * (1 - fx) + c[k + GW + 1] * fx) * fy;
    for (let y = 0; y < H; y++) {
      const gy = Math.floor(y / P);
      fy = (y % P) / P;
      for (let x = 0; x < W; x++) {
        fx = (x % P) / P;
        k = gy * GW + Math.floor(x / P);
        // rizos de viento asimétricos (cresta marcada, valle suave)
        const fase = ((x * ca + y * sa) / 7.4 + mezcla(deform)) % 1;
        const f = fase < 0 ? fase + 1 : fase;
        const rizo = f < 0.68 ? f / 0.68 : (1 - f) / 0.32;
        const h = 2 + mezcla(dunas) + (rizo - 0.5) * mezcla(fuerza);
        const i = y * W + x;
        base[i] = h;
        datos[i * 2] = h;
        datos[i * 2 + 1] = Math.floor(azar() * 2000);
        mancha[i] = Math.max(0, Math.min(255, mezcla(tono) * 255));
      }
    }
    subirTodo();
  }

  function subirTodo() {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMancha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, mancha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texAltura);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, W, H, 0, gl.RG, gl.FLOAT, datos);
  }

  // ---------------------------------------------------------------- física
  function activar(x0, y0, x1, y1) {
    const bx0 = Math.max(0, Math.floor(x0 / BLOQUE)), by0 = Math.max(0, Math.floor(y0 / BLOQUE));
    const bx1 = Math.min(BW - 1, Math.floor(x1 / BLOQUE)), by1 = Math.min(BH - 1, Math.floor(y1 / BLOQUE));
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) activos.add(by * BW + bx);
  }

  function sumar(cx, cy, m, w) {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || w <= 0) return;
    const i = (cy * W + cx) * 2;
    datos[i] += m * w;
    if (w > 0.2 && azar() < 0.5) datos[i + 1] = (datos[i + 1] + 1 + ((azar() * 7) | 0)) % 2000;
  }
  function depositar(px, py, m) {
    // reparte la masa en las 4 celdas vecinas (bilineal) para que no queden picos
    const x = px - 0.5, y = py - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    sumar(x0, y0, m, (1 - fx) * (1 - fy));
    sumar(x0 + 1, y0, m, fx * (1 - fy));
    sumar(x0, y0 + 1, m, (1 - fx) * fy);
    sumar(x0 + 1, y0 + 1, m, fx * fy);
  }

  function empujar(cx, cy, mx, my, rapidez) {
    const R = RADIO, R2 = R * R;
    const lejos = R + 1.1 + Math.min(rapidez * 0.06, 1.8);
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
        const vx = x + 0.5 - cx, vy = y + 0.5 - cy;
        const d2 = vx * vx + vy * vy;
        if (d2 > R2) continue;
        const i = y * W + x;
        const objetivo = base[i] - PROFUNDIDAD * Math.sqrt(1 - d2 / R2);
        const exceso = datos[i * 2] - objetivo;
        if (exceso <= 0.002) continue;
        const m = exceso * 0.8;
        datos[i * 2] -= m;
        datos[i * 2 + 1] = (datos[i * 2 + 1] + 1 + ((azar() * 13) | 0)) % 2000;
        // hacia dónde va el material: afuera y, si está al frente, también adelante
        const d = Math.sqrt(d2);
        let nx = mx, ny = my;
        if (d > 0.35) { nx = vx / d; ny = vy / d; }
        const adelante = Math.max(nx * mx + ny * my, 0);
        const lado = Math.sign(nx * -my + ny * mx) || (azar() < 0.5 ? -1 : 1);
        let tx = -my * lado * 0.85 + mx * adelante * 0.95 + nx * 0.25;
        let ty = mx * lado * 0.85 + my * adelante * 0.95 + ny * 0.25;
        const t = Math.sqrt(tx * tx + ty * ty) || 1;
        const dist = (lejos * (0.9 + azar() * 0.25)) / t;
        depositar(cx + tx * dist, cy + ty * dist, m);
      }
    }
    sucio = unir(sucio, cx - lejos - 3, cy - lejos - 3, cx + lejos + 3, cy + lejos + 3);
    activar(cx - lejos - 3, cy - lejos - 3, cx + lejos + 3, cy + lejos + 3);
  }

  function lanzarGranos(cx, cy, mx, my, rapidez) {
    if (movReducido.matches) return;
    const max = NIVELES[nivel].granos;
    const n = Math.min(10, Math.floor((rapidez - 5) / 2.2));
    for (let k = 0; k < n && nGranos < max; k++) {
      const lado = (azar() - 0.5) * 2;
      const gx = cx + mx * RADIO * 0.8 - my * lado * RADIO * 0.7;
      const gy = cy + my * RADIO * 0.8 + mx * lado * RADIO * 0.7;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = (iy * W + ix) * 2;
      if (datos[i] - 0.022 < base[iy * W + ix] - PROFUNDIDAD) continue;
      datos[i] -= 0.022;
      activar(ix - 1, iy - 1, ix + 1, iy + 1);
      sucio = unir(sucio, ix - 1, iy - 1, ix + 1, iy + 1);
      const j = nGranos++;
      const empuje = rapidez * (0.12 + azar() * 0.3);
      granos[j * 4] = gx * CELDA;
      granos[j * 4 + 1] = gy * CELDA;
      granos[j * 4 + 2] = datos[i] + 0.2;
      const r = azar();
      granos[j * 4 + 3] = oscuro.matches ? (r < 0.62 ? 0.12 : 0.85) : (r < 0.2 ? 0.4 : 0.95);
      velGranos[j * 3] = mx * empuje - my * lado * (0.6 + azar() * 1.6);
      velGranos[j * 3 + 1] = my * empuje + mx * lado * (0.6 + azar() * 1.6);
      velGranos[j * 3 + 2] = 0.1 + azar() * 0.22 + rapidez * 0.006;
    }
  }

  function moverGranos() {
    let k = 0;
    for (let j = 0; j < nGranos; j++) {
      const vx = velGranos[j * 3] * 0.985, vy = velGranos[j * 3 + 1] * 0.985, vz = velGranos[j * 3 + 2] - GRAVEDAD;
      const x = granos[j * 4] + vx, y = granos[j * 4 + 1] + vy, z = granos[j * 4 + 2] + vz;
      const cx = x / CELDA, cy = y / CELDA;
      const ix = Math.floor(cx), iy = Math.floor(cy);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue; // salió de la pantalla
      if (z <= datos[(iy * W + ix) * 2] && vz < 0) {
        depositar(cx, cy, 0.022); // aterrizó
        sucio = unir(sucio, cx - 2, cy - 2, cx + 2, cy + 2);
        activar(cx - 2, cy - 2, cx + 2, cy + 2);
        continue;
      }
      granos[k * 4] = x; granos[k * 4 + 1] = y; granos[k * 4 + 2] = z; granos[k * 4 + 3] = granos[j * 4 + 3];
      velGranos[k * 3] = vx; velGranos[k * 3 + 1] = vy; velGranos[k * 3 + 2] = vz;
      k++;
    }
    nGranos = k;
  }

  /** Avalanchas en un bloque: reparte el exceso de pendiente entre vecinos
   *  (derecha, abajo y las dos diagonales de abajo; cada par una vez). */
  function avalanchas(x0, y0, x1, y1) {
    const T = TALUD, TD = TALUD * Math.SQRT2, d = datos, w2 = W * 2;
    const par = (i, j, lim) => {
      const diff = d[i] - d[j];
      if (diff > lim) { const t = (diff - lim) * 0.25; d[i] -= t; d[j] += t; }
      else if (diff < -lim) { const t = (-diff - lim) * 0.25; d[i] += t; d[j] -= t; }
    };
    for (let y = y0; y <= y1; y++) {
      const abajo = y < H - 1;
      for (let x = x0; x <= x1; x++) {
        const i = y * w2 + x * 2;
        if (x + 1 < W) par(i, i + 2, T);
        if (abajo) {
          par(i, i + w2, T);
          if (x + 1 < W) par(i, i + w2 + 2, TD);
          if (x > 0) par(i, i + w2 - 2, TD);
        }
      }
    }
  }

  /** La arena vuelve a su forma: acerca cada celda del bloque a su altura original.
   *  Devuelve true si el bloque ya quedó en reposo. */
  function recuperar(x0, y0, x1, y1, k) {
    let maxDesvio = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const desvio = (datos[i * 2] - base[i]) * k;
        datos[i * 2] = base[i] + desvio;
        const a = desvio < 0 ? -desvio : desvio;
        if (a > maxDesvio) maxDesvio = a;
      }
    }
    if (maxDesvio < 0.004) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) datos[(y * W + x) * 2] = base[y * W + x];
      return true;
    }
    return false;
  }

  function fisicaBloques(dt) {
    if (!activos.size) return;
    const k = Math.exp(-dt / RECUPERACION);
    const conAvalanchas = NIVELES[nivel].avalanchas && !movReducido.matches;
    for (const b of activos) {
      const bx = b % BW, by = (b - bx) / BW;
      const x0 = bx * BLOQUE, y0 = by * BLOQUE;
      const x1 = Math.min(W - 1, x0 + BLOQUE - 1), y1 = Math.min(H - 1, y0 + BLOQUE - 1);
      if (conAvalanchas) avalanchas(x0, y0, x1, y1);
      // las avalanchas tocan una celda fuera del bloque: también se recupera
      const ex0 = Math.max(0, x0 - 1), ex1 = Math.min(W - 1, x1 + 1), ey1 = Math.min(H - 1, y1 + 1);
      if (recuperar(ex0, y0, ex1, ey1, k)) activos.delete(b);
      sucio = unir(sucio, ex0, y0, ex1, ey1);
    }
  }

  // ---------------------------------------------------------------- entrada
  function alMover(e) {
    if (apagado) return;
    const x = e.clientX, y = e.clientY;
    puntero.ultimo = performance.now();
    if (puntero.px != null && datos) {
      const dx = x - puntero.px, dy = y - puntero.py;
      const largo = Math.sqrt(dx * dx + dy * dy);
      if (largo > 0.6 && largo < 400) {
        const mx = dx / largo, my = dy / largo;
        const pasos = Math.ceil(largo / (CELDA * 0.75));
        for (let s = 1; s <= pasos; s++) {
          empujar((puntero.px + dx * (s / pasos)) / CELDA, (puntero.py + dy * (s / pasos)) / CELDA, mx, my, largo);
        }
        if (largo > 6) lanzarGranos(x / CELDA, y / CELDA, mx, my, largo);
      }
    }
    puntero.x = puntero.px = x;
    puntero.y = puntero.py = y;
    arrancar();
  }
  addEventListener("pointermove", alMover, { passive: true });
  addEventListener("pointerdown", (e) => { puntero.px = e.clientX; puntero.py = e.clientY; alMover(e); }, { passive: true });
  raiz.addEventListener("pointerleave", () => (puntero.px = null));
  addEventListener("pointercancel", () => (puntero.px = null));
  addEventListener("blur", () => (puntero.px = null));

  // ---------------------------------------------------------------- tamaño y calidad
  function ajustar() {
    escala = Math.min(devicePixelRatio || 1, NIVELES[nivel].escalaMax) * factor;
    ancho = innerWidth;
    alto = innerHeight;
    lienzo.width = Math.max(1, Math.round(ancho * escala));
    lienzo.height = Math.max(1, Math.round(alto * escala));
    generar();
    raiz.dataset.calidadArena = nivel;
    arrancar();
  }
  let tAjuste;
  addEventListener("resize", () => {
    clearTimeout(tAjuste);
    tAjuste = setTimeout(ajustar, 150);
  });
  oscuro.addEventListener?.("change", arrancar);

  // Regulador: si los cuadros tardan demasiado, se reduce el lienzo y luego el nivel
  // (mide tiempo acumulado, así reacciona igual de rápido aunque el equipo vaya a 5 fps)
  const regulador = { media: 1000 / 60, lento: 0, rapido: 0, ultimoCambio: 0, desde: performance.now() + 2500 };
  function regular(ms, t) {
    if (t < regulador.desde) return; // la carga de la página siempre trae tirones: no cuentan
    ms = Math.min(ms, 1000);
    regulador.media += (ms - regulador.media) * 0.15;
    if (regulador.media > 25) { regulador.lento += ms; regulador.rapido = 0; }
    else if (regulador.media < 14) { regulador.rapido += ms; regulador.lento = 0; }
    else { regulador.lento = 0; regulador.rapido = 0; }
    if (regulador.lento > 800 && t - regulador.ultimoCambio > 1200) {
      if (factor > 0.62) factor *= 0.8;
      else if (nivel > 0) { nivel--; factor = 1; guardarNivel(nivel); }
      else if (regulador.media > 33 && regulador.lento > 2000) return desactivar();
      else return;
      regulador.ultimoCambio = t;
      regulador.lento = 0;
      regulador.media = 1000 / 60;
      ajustar();
    } else if (regulador.rapido > 6000 && factor < 1 && t - regulador.ultimoCambio > 8000) {
      factor = Math.min(1, factor * 1.15);
      regulador.ultimoCambio = t;
      regulador.rapido = 0;
      ajustar();
    }
  }

  /** Último recurso: el equipo no alcanza ni en el nivel más bajo -> fondo quieto. */
  function desactivar() {
    apagado = true;
    activo = false;
    guardarNivel(-1);
    lienzo.remove();
    raiz.classList.remove("con-arena");
    raiz.classList.add("fondo-quieto");
    delete raiz.dataset.calidadArena;
  }

  // ---------------------------------------------------------------- bucle
  let activo = false;
  let tAnterior = 0, tDibujo = 0, acumulado = 0;
  function arrancar() {
    if (!activo && !apagado && !document.hidden && !gl.isContextLost()) {
      activo = true;
      tAnterior = 0;
      tDibujo = 0; // el primer cuadro tras una pausa no cuenta para el regulador
      requestAnimationFrame(cuadro);
    }
  }
  document.addEventListener("visibilitychange", arrancar);

  function cuadro(t) {
    if (apagado || document.hidden || gl.isContextLost()) { activo = false; return; }
    const ms = tAnterior ? t - tAnterior : 1000 / 60;
    tAnterior = t;
    const dt = Math.min(ms, 50) / 1000;

    // pasos fijos de 1/60 s: linterna (resorte amortiguado) y granos en el aire
    acumulado = Math.min(acumulado + dt, PASO * 4);
    while (acumulado >= PASO) {
      acumulado -= PASO;
      if (movReducido.matches) {
        linterna.x = puntero.x; linterna.y = puntero.y; linterna.vx = linterna.vy = 0;
      } else {
        linterna.vx = (linterna.vx + (puntero.x - linterna.x) * 0.085) * 0.74;
        linterna.vy = (linterna.vy + (puntero.y - linterna.y) * 0.085) * 0.74;
        linterna.x += linterna.vx;
        linterna.y += linterna.vy;
      }
      // la mano se inclina según la velocidad
      linterna.tx += (Math.max(-90, Math.min(90, -linterna.vx * 7)) - linterna.tx) * 0.08;
      linterna.ty += (Math.max(-90, Math.min(90, -linterna.vy * 7)) - linterna.ty) * 0.08;
      if (nGranos) moverGranos();
    }
    fisicaBloques(dt);

    // en niveles bajos se dibuja como máximo a ~60 fps (pantallas de 90/120 Hz)
    const dibujar = !(NIVELES[nivel].limiteFps && t - tDibujo < 14);
    if (dibujar) {
      const previo = tDibujo;
      tDibujo = t;
      render(t);
      if (previo) regular(t - previo, t);
      if (apagado) return;
    }

    const quieta = Math.abs(puntero.x - linterna.x) < 0.25 && Math.abs(puntero.y - linterna.y) < 0.25 &&
      Math.abs(linterna.vx) + Math.abs(linterna.vy) < 0.05;
    if (quieta && !activos.size && !nGranos && t - puntero.ultimo > 600 && !sucio) {
      activo = false;
      return;
    }
    requestAnimationFrame(cuadro);
  }

  function render(t) {
    // subir solo la región de arena que cambió
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texAltura);
    if (sucio) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, W);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sucio.x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sucio.y0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, sucio.x0, sucio.y0, sucio.x1 - sucio.x0 + 1, sucio.y1 - sucio.y0 + 1, gl.RG, gl.FLOAT, datos);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      sucio = null;
    }

    // un temblor mínimo de la mano hace la luz más orgánica
    const s = t / 1000, temblor = movReducido.matches ? 0 : 1.2;
    const fx = linterna.x + (Math.sin(s * 1.7) + Math.sin(s * 2.9 + 1.3)) * temblor;
    const fy = linterna.y + (Math.sin(s * 2.3 + 0.7) + Math.sin(s * 3.7)) * temblor;
    const luz = [fx - 150 + linterna.tx, fy - 210 + linterna.ty, 300];
    const esOscuro = oscuro.matches ? 1 : 0;

    const suelo = programaSuelo(nivel);
    gl.viewport(0, 0, lienzo.width, lienzo.height);
    gl.useProgram(suelo.pr);
    gl.bindVertexArray(vao);
    gl.uniform1i(suelo.u.uAltura, 0);
    gl.uniform1i(suelo.u.uMancha, 1);
    gl.uniform2f(suelo.u.uResol, lienzo.width, lienzo.height);
    gl.uniform1f(suelo.u.uEscala, escala);
    gl.uniform2f(suelo.u.uRejilla, W, H);
    gl.uniform3f(suelo.u.uLuz, luz[0], luz[1], luz[2]);
    gl.uniform2f(suelo.u.uFoco, fx, fy);
    gl.uniform1f(suelo.u.uOscuro, esOscuro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (nGranos) {
      gl.useProgram(progGranos.pr);
      gl.bindVertexArray(vaoGranos);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufGranos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, granos, 0, nGranos * 4);
      gl.uniform2f(progGranos.u.uLienzo, ancho, alto);
      gl.uniform1f(progGranos.u.uEscala, escala);
      gl.uniform3f(progGranos.u.uLuz, luz[0], luz[1], luz[2]);
      gl.uniform2f(progGranos.u.uFoco, fx, fy);
      gl.uniform1f(progGranos.u.uOscuro, esOscuro);
      gl.drawArrays(gl.POINTS, 0, nGranos);
    }
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- pérdida del contexto (móviles)
  lienzo.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    activo = false;
    raiz.classList.remove("con-arena");
  });
  lienzo.addEventListener("webglcontextrestored", () => {
    try {
      prepararGL();
      raiz.classList.add("con-arena");
      arrancar();
    } catch (err) {
      console.warn("Arena desactivada:", err.message);
    }
  });

  // ---------------------------------------------------------------- inicio
  try {
    prepararGL();
  } catch (err) {
    console.warn("Arena desactivada:", err.message);
    return false;
  }
  contenedor.append(lienzo);
  ajustar();
  raiz.classList.add("con-arena");
  return true;
}
