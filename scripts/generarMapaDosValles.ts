// Genera el mapa de pruebas «Dos valles» (mapas/dos-valles): PNG de alturas y
// JSON de nodos. No forma parte del juego: el juego solo carga los datos.
//
// Pensado para probar lo hablado en la especificación:
// - Valle A (sur, abajo): pie de pistas con la plaza y tres bases. Laderas con
//   zonas suaves (verdes) cerca del fondo y empinadas (negras) bajo los picos.
// - Cordal en el centro con tres cimas (oeste, centro y este, de menos a más).
// - Valle B (norte, arriba): valle alto con nodos bajos, para «Abrir un valle».
// - Roca: un cortado en la cara norte del pico este (desde él no se baja al
//   valle B) y una banda rocosa a media ladera en el valle A, con un paso
//   estrecho por el que sí cabe una pista.
//
// Uso: node scripts/generarMapaDosValles.ts
import { writeFileSync } from 'node:fs';
import { codificarPngGris } from './png.ts';

const ANCHO = 2400;
const ALTO = 4200;
const COTA_MIN = 1400;
const COTA_MAX = 3100;
const CELDA = 20; // m por muestra
const columnas = ANCHO / CELDA + 1;
const filas = ALTO / CELDA + 1;

const g = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
const ss = (t: number) => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};
/** Perfil de ladera: mezcla de recta y curva suave (pendiente máxima 1,2 veces la media). */
const perfil = (t: number) => 0.6 * Math.min(Math.max(t, 0), 1) + 0.4 * ss(t);
const sigmoide = (t: number) => 1 / (1 + Math.exp(-t));

// Ruido de valor suave y determinista, de poca amplitud, para que no parezca sintético.
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
const PASO_RUIDO = 400; // m entre nudos del ruido
const nx = Math.ceil(ANCHO / PASO_RUIDO) + 2;
const ny = Math.ceil(ALTO / PASO_RUIDO) + 2;
const azar = crearAzar(11);
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

// Geometría del relieve (m).
const Y_VALLE_B = 250; // fondo del valle B
const Y_CORDAL = 1500;
const Y_VALLE_A = 3900; // fondo del valle A
const COTA_VALLE_B = 2050;
const COTA_VALLE_A = 1500;

/** Cota de la cresta del cordal según x: tres picos y collados entre ellos. */
const cresta = (x: number) => 2350 + 220 * g(x - 450, 320) + 420 * g(x - 1200, 380) + 520 * g(x - 1950, 380);
/** El valle A es un cuenco: sus lados quedan algo más altos que el centro. */
const fondoA = (x: number) => COTA_VALLE_A + 150 * ((x - 1200) / 1200) ** 2;

function cota(x: number, y: number): number {
  let h: number;
  if (y <= Y_CORDAL) h = COTA_VALLE_B + (cresta(x) - COTA_VALLE_B) * perfil((y - Y_VALLE_B) / (Y_CORDAL - Y_VALLE_B));
  else h = fondoA(x) + (cresta(x) - fondoA(x)) * perfil((Y_VALLE_A - y) / (Y_VALLE_A - Y_CORDAL));
  // Cortado en la cara norte del pico este: 320 m de caída en unos 150 m. El
  // hundimiento se recupera hacia el norte (de y = 1300 a 700), para que el
  // valle B no quede hundido entero bajo el pico.
  if (y < Y_CORDAL) {
    const ventanaEste = ss((x - 1550) / 250) * ss((2350 - x) / 250);
    h -= 320 * ventanaEste * sigmoide((1330 - y) / 35) * ss((y - 700) / 600);
  }
  // Banda rocosa a media ladera del valle A (y ≈ 2650), de x = 1200 a 2400,
  // con un paso de unos 250 m hacia x = 1800: 110 m de escalón en unos 60 m. Por
  // encima, el terreno vuelve a su altura en unos 400 m (es un escalón, no una
  // meseta).
  const ventanaBanda = ss((x - 1150) / 200) * ss((2450 - x) / 200) * (1 - g(x - 1800, 150));
  h += 110 * ventanaBanda * sigmoide((2650 - y) / 18) * ss((y - 2250) / 400);
  h += 22 * ruido(x, y);
  return h;
}

const gris = new Uint8Array(columnas * filas);
for (let j = 0; j < filas; j++) {
  for (let i = 0; i < columnas; i++) {
    const v = (cota(i * CELDA, j * CELDA) - COTA_MIN) / (COTA_MAX - COTA_MIN);
    gris[j * columnas + i] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  }
}

const mapa = {
  nombre: 'Dos valles',
  ancho: ANCHO,
  alto: ALTO,
  cotaMin: COTA_MIN,
  cotaMax: COTA_MAX,
  plaza: { x: 1200, y: 4060, radio: 170 },
  nodos: [
    // Valle A: bases alrededor de la plaza.
    { tipo: 'base', x: 930, y: 3970 },
    { tipo: 'base', x: 1200, y: 3830 },
    { tipo: 'base', x: 1470, y: 3970 },
    // Valle A: intermedios. Los dos bajos dan verdes; el de (1800, 3000) queda
    // justo debajo del paso de la banda rocosa.
    { tipo: 'intermedio', x: 600, y: 3450 },
    { tipo: 'intermedio', x: 1800, y: 3420 },
    { tipo: 'intermedio', x: 450, y: 2850 },
    { tipo: 'intermedio', x: 1000, y: 2700 },
    { tipo: 'intermedio', x: 1800, y: 3000 },
    { tipo: 'intermedio', x: 800, y: 2100 },
    // Cordal: tres cimas.
    { tipo: 'cima', x: 450, y: 1500 },
    { tipo: 'cima', x: 1200, y: 1480 },
    { tipo: 'cima', x: 1950, y: 1520 },
    // Valle B: nodos bajos (se abrirán con «Abrir un valle», paso 4).
    { tipo: 'intermedio', x: 500, y: 300 },
    { tipo: 'intermedio', x: 1250, y: 250 },
    { tipo: 'intermedio', x: 1950, y: 300 },
  ],
};

writeFileSync('mapas/dos-valles/alturas.png', codificarPngGris(columnas, filas, gris));
writeFileSync('mapas/dos-valles/mapa.json', JSON.stringify(mapa, null, 2) + '\n');
console.log(`Escrito mapas/dos-valles (${columnas}×${filas} muestras)`);
