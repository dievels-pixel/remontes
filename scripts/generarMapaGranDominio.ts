// Genera el mapa «Gran dominio» (mapas/gran-dominio): PNG de alturas y JSON
// de nodos. No forma parte del juego: el juego solo carga los datos.
//
// Pensado para poder hacer pistas de todos los colores y para crecer:
// - Pie de pistas al sur con la plaza y tres bases, y una zona suave encima
//   (verdes) que se va empinando hacia el norte: media montaña (azules y
//   rojas) y caras bajo las cimas (negras). El oeste es más suave y el este
//   más empinado, así que a la misma altura hay colores distintos.
// - Un circo suave a media altura en el oeste.
// - Cordal con cinco cimas y, detrás, el valle norte (más alto) para
//   colonizar.
// - Un valle lateral al este, más hundido, al que se baja desde el cordal.
// - Roca: un cortado bajo la cima central-este y una banda a media ladera con
//   un paso.
//
// Uso: node scripts/generarMapaGranDominio.ts
import { writeFileSync } from 'node:fs';
import { codificarPngGris } from './png.ts';

const ANCHO = 4000;
const ALTO = 6000;
const COTA_MIN = 1300;
const COTA_MAX = 3200;
const CELDA = 25; // m por muestra
const columnas = ANCHO / CELDA + 1;
const filas = ALTO / CELDA + 1;

const g = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
const ss = (t: number) => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};
const sigmoide = (t: number) => 1 / (1 + Math.exp(-t));

// Ruido de valor suave y determinista, de poca amplitud.
function crearAzar(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PASO_RUIDO = 450;
const nx = Math.ceil(ANCHO / PASO_RUIDO) + 2;
const ny = Math.ceil(ALTO / PASO_RUIDO) + 2;
const azar = crearAzar(23);
const nudos = Array.from({ length: nx * ny }, () => azar() * 2 - 1);
function ruido(x: number, y: number): number {
  const fx = x / PASO_RUIDO;
  const fy = y / PASO_RUIDO;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = ss(fx - x0);
  const ty = ss(fy - y0);
  const v = (i: number, j: number) => nudos[j * nx + i];
  const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
  const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
  return a * (1 - ty) + b * ty;
}

// Ladera sur (valle principal): pendiente por tramos de y, de sur a norte,
// con transiciones suaves. [y desde, pendiente] en orden de y decreciente.
const Y_CORDAL = 2300;
const TRAMOS_SUR: [number, number][] = [
  [6000, 0.02], // plaza y pie de pistas
  [5500, 0.15], // zona de verdes
  [4700, 0.3], // media montaña: azules y rojas
  [3600, 0.45], // rojas y negras
  [2800, 0.52], // bajo las cimas: negras
];
// Ladera norte (valle norte): del cordal baja hasta el fondo del valle.
const TRAMOS_NORTE: [number, number][] = [
  [0, 0.06], // fondo del valle norte
  [800, 0.38], // ladera hasta el cordal
];

/** Pendiente media en y (con transición suave de 150 m entre tramos). */
function pendienteSur(y: number): number {
  let p = TRAMOS_SUR[0][1];
  for (let i = 1; i < TRAMOS_SUR.length; i++) {
    const [y0, pi] = TRAMOS_SUR[i];
    p += (pi - TRAMOS_SUR[i - 1][1]) * sigmoide((y0 - y) / 75);
  }
  return p;
}
function pendienteNorte(y: number): number {
  const [[, p0], [y1, p1]] = TRAMOS_NORTE;
  return p0 + (p1 - p0) * sigmoide((y - y1) / 75);
}

// Perfiles a lo largo de y, integrados una sola vez (paso de 5 m).
const PASO_Y = 5;
const perfilSur = new Float64Array(Math.ceil(ALTO / PASO_Y) + 2);
for (let i = perfilSur.length - 2; i >= 0; i--) perfilSur[i] = perfilSur[i + 1] + pendienteSur(i * PASO_Y) * PASO_Y;
const perfilNorte = new Float64Array(Math.ceil(Y_CORDAL / PASO_Y) + 2);
for (let i = 1; i < perfilNorte.length; i++) perfilNorte[i] = perfilNorte[i - 1] + pendienteNorte(i * PASO_Y) * PASO_Y;
const leer = (t: Float64Array, y: number) => {
  const f = Math.min(Math.max(y / PASO_Y, 0), t.length - 2);
  const i = Math.floor(f);
  return t[i] + (t[i + 1] - t[i]) * (f - i);
};

const COTA_PIE = 1500;
/** Factor de pendiente según x: el oeste más suave (0,75) y el este más empinado (1,1). */
const factorX = (x: number) => 0.75 + 0.35 * (x / ANCHO);

function cota(x: number, y: number): number {
  const k = factorX(x);
  const sur = COTA_PIE + k * leer(perfilSur, y);
  const cresta = COTA_PIE + k * leer(perfilSur, Y_CORDAL);
  let h: number;
  if (y >= Y_CORDAL) h = sur;
  else {
    // Valle norte: baja desde la cresta hacia el norte (más alto que el pie).
    const bajada = leer(perfilNorte, Y_CORDAL) - leer(perfilNorte, y);
    h = cresta - bajada * (0.9 + 0.2 * (x / ANCHO));
  }
  // Cimas: cinco picos sobre el cordal.
  for (const [cx, alto] of [
    [500, 140],
    [1300, 180],
    [2100, 200],
    [2900, 200],
    [3500, 160],
  ] as const) {
    h += alto * g(x - cx, 380) * g(y - Y_CORDAL, 380);
  }
  // Circo suave en el oeste, a media altura: un hueco amplio y llano.
  h -= 110 * g(x - 800, 450) * g(y - 3700, 380);
  // Valle lateral al este, más hundido, de y = 2700 a 5000.
  const tramoC = ss((y - 2700) / 300) * ss((5000 - y) / 300);
  h -= 250 * g(x - 3650, 420) * tramoC;
  // Cortado bajo la cima central-este, por su cara sur.
  const ventanaCortado = ss((x - 2400) / 120) * ss((3150 - x) / 120);
  h += 160 * ventanaCortado * sigmoide((2650 - y) / 25) * ss((y - 2350) / 150);
  // Banda de roca a media ladera (y ≈ 4200), de x = 1300 a 2500, con un paso en x ≈ 1900.
  const ventanaBanda = ss((x - 1300) / 150) * ss((2500 - x) / 150) * (1 - g(x - 1900, 140));
  h += 90 * ventanaBanda * sigmoide((4200 - y) / 18) * ss((y - 3850) / 350);
  h += 18 * ruido(x, y);
  return h;
}

const gris = new Uint8Array(columnas * filas);
for (let j = 0; j < filas; j++) {
  for (let i = 0; i < columnas; i++) {
    const v = (cota(i * CELDA, j * CELDA) - COTA_MIN) / (COTA_MAX - COTA_MIN);
    gris[j * columnas + i] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  }
}

const n = (tipo: string, x: number, y: number) => ({ tipo, x, y });
const mapa = {
  nombre: 'Gran dominio',
  ancho: ANCHO,
  alto: ALTO,
  cotaMin: COTA_MIN,
  cotaMax: COTA_MAX,
  plaza: { x: 2000, y: 5780, radio: 200 },
  nodos: [
    // Pie de pistas.
    n('base', 1650, 5700),
    n('base', 2000, 5500),
    n('base', 2350, 5700),
    // Zona de verdes.
    n('intermedio', 1250, 5250),
    n('intermedio', 2750, 5250),
    n('intermedio', 1600, 4850),
    n('intermedio', 2450, 4800),
    // Media montaña.
    n('intermedio', 800, 4400),
    n('intermedio', 2000, 4500),
    n('intermedio', 3050, 4500),
    n('intermedio', 800, 3700), // fondo del circo
    n('intermedio', 1500, 3700),
    n('intermedio', 2300, 3700),
    // Alta montaña.
    n('intermedio', 600, 3000),
    n('intermedio', 1400, 3000),
    n('intermedio', 2100, 3100),
    n('intermedio', 2900, 3200),
    // Cordal.
    n('cima', 500, 2300),
    n('cima', 1300, 2300),
    n('cima', 2100, 2300),
    n('cima', 2900, 2300),
    n('cima', 3582, 2217), // movida por el usuario con el editor: así se baja por los dos lados
    // Valle norte.
    n('intermedio', 900, 1500),
    n('intermedio', 2000, 1500),
    n('intermedio', 3100, 1500),
    n('intermedio', 600, 500),
    n('intermedio', 1600, 400),
    n('intermedio', 2600, 450),
    n('intermedio', 3500, 600),
    // Valle lateral del este.
    n('intermedio', 3650, 4600),
    n('intermedio', 3650, 3600),
  ],
};

writeFileSync('mapas/gran-dominio/alturas.png', codificarPngGris(columnas, filas, gris));
writeFileSync('mapas/gran-dominio/mapa.json', JSON.stringify(mapa, null, 2) + '\n');
console.log(`Escrito mapas/gran-dominio (${columnas}×${filas} muestras)`);
