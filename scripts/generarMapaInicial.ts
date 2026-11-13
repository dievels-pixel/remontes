// Genera los datos del mapa inicial (mapas/inicial): el PNG de alturas y el
// JSON de nodos. No forma parte del juego: el juego solo carga los datos. Es
// el mismo ruido con que se hizo el mapa de las etapas 1 a 3, para que el
// mapa no cambie al pasar a datos.
//
// Uso: node scripts/generarMapaInicial.ts
import { writeFileSync } from 'node:fs';
import { codificarPngGris } from './png.ts';

const columnas = 96;
const filas = 128;
const semilla = 7;
const pesoPendienteGeneral = 0.78;
const pesoRuido = 0.22;

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

const suavizar = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor en una rejilla de celdas, con interpolación suave. */
function ruidoValor(celdas: number, s: number): Float32Array {
  const azar = crearAzar(s);
  const nx = celdas + 2;
  const ny = Math.ceil((celdas * filas) / columnas) + 2;
  const red = new Float32Array(nx * ny);
  for (let i = 0; i < red.length; i++) red[i] = azar();
  const salida = new Float32Array(columnas * filas);
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < columnas; x++) {
      const fx = (x / columnas) * celdas;
      const fy = (y / columnas) * celdas;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = suavizar(fx - x0);
      const ty = suavizar(fy - y0);
      const v = (i: number, j: number) => red[j * nx + i];
      const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
      const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
      salida[y * columnas + x] = a * (1 - ty) + b * ty;
    }
  }
  return salida;
}

const octavas = [
  { celdas: 3, peso: 0.55 },
  { celdas: 6, peso: 0.3 },
  { celdas: 12, peso: 0.15 },
];
const ruidos = octavas.map((o, i) => ruidoValor(o.celdas, semilla * 101 + i));
const gris = new Uint8Array(columnas * filas);
for (let y = 0; y < filas; y++) {
  // 0 en el borde inferior (pie de pistas), 1 en el superior.
  const subida = 1 - y / (filas - 1);
  const general = Math.pow(subida, 1.15);
  for (let x = 0; x < columnas; x++) {
    const i = y * columnas + x;
    let r = 0;
    for (let k = 0; k < octavas.length; k++) r += ruidos[k][i] * octavas[k].peso;
    // El ruido pesa menos en el valle para que la plaza quede casi llana.
    const v = general * pesoPendienteGeneral + r * pesoRuido * (0.35 + 0.65 * subida);
    gris[i] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  }
}

const mapa = {
  nombre: 'Inicial',
  ancho: 2400,
  alto: 3200,
  cotaMin: 1400,
  cotaMax: 2900,
  plaza: { x: 1200, y: 2930, radio: 170 },
  nodos: [
    { tipo: 'base', x: 930, y: 2840 },
    { tipo: 'base', x: 1200, y: 2700 },
    { tipo: 'base', x: 1470, y: 2840 },
    { tipo: 'intermedio', x: 620, y: 1950 },
    { tipo: 'intermedio', x: 1700, y: 1800 },
    { tipo: 'cima', x: 980, y: 820 },
    { tipo: 'cima', x: 1850, y: 560 },
  ],
};

writeFileSync('mapas/inicial/alturas.png', codificarPngGris(columnas, filas, gris));
writeFileSync('mapas/inicial/mapa.json', JSON.stringify(mapa, null, 2) + '\n');
console.log('Escrito mapas/inicial/alturas.png y mapas/inicial/mapa.json');
