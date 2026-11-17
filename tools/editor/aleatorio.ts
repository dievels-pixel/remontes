// Generador de mapas aleatorios jugables: valle con la plaza abajo, una línea
// de cumbres arriba con collados entre ellas y vaguadas que bajan de los
// collados, más nodos repartidos por las laderas evitando la roca. Prueba
// semillas seguidas hasta que la validación del juego no da avisos graves.
// El resultado es un proyecto normal del editor: se puede retocar o no.
// Lógica pura: sin DOM.
import { crearAzar } from '../../src/core/azar';
import type { Punto } from '../../src/core/vector';
import { calcularRelieve, parametrosNivel, proyectoNuevo, type Linea, type Proyecto, type PuntoDeCota } from './proyecto';
import { validarTodo, type Validacion } from './validacion';

export interface OpcionesAleatorio {
  ancho: number;
  alto: number;
  semilla: number;
  /** Número de cumbres en la línea de arriba. */
  cimas: number;
  /** Cota del fondo del valle (m). */
  cotaValle: number;
  /** Cota media de las cumbres (m). */
  cotaCumbre: number;
  /** Separación orientativa entre puntos de juego (m). */
  separacion: number;
  /** Amplitud del ruido fractal (m). */
  rugosidad: number;
  /** Intentos (semillas seguidas) antes de quedarse con el mejor. */
  intentos: number;
}

export const ALEATORIO_POR_DEFECTO: OpcionesAleatorio = {
  ancho: 4000,
  alto: 6000,
  semilla: 1,
  cimas: 4,
  cotaValle: 1400,
  cotaCumbre: 2900,
  separacion: 650,
  rugosidad: 30,
  intentos: 6,
};

/** Un proyecto aleatorio con esa semilla (sin validar). */
export function proyectoAleatorio(o: OpcionesAleatorio): Proyecto {
  const azar = crearAzar(o.semilla * 7919 + 13);
  const entre = (a: number, b: number) => a + (b - a) * azar();
  const W = o.ancho;
  const H = o.alto;
  const p = proyectoNuevo(W, H);
  p.id = `aleatorio-${o.semilla}`;
  p.nombre = `Aleatorio ${o.semilla}`;
  p.semilla = o.semilla;
  p.rugosidad = o.rugosidad;
  const plaza = { x: W / 2 + entre(-0.12, 0.12) * W, y: H - 260, radio: 200 };
  p.plaza = plaza;
  p.nodos = [
    { tipo: 'base', x: plaza.x - 350, y: plaza.y - 80 },
    { tipo: 'base', x: plaza.x, y: plaza.y - 300 },
    { tipo: 'base', x: plaza.x + 350, y: plaza.y - 80 },
  ];
  const relieve = o.cotaCumbre - o.cotaValle;
  const puntos: PuntoDeCota[] = [
    // Fondo del valle y bordes bajos.
    { x: plaza.x, y: H - 80, z: o.cotaValle - 20, clase: 'valle' },
    { x: W * 0.12, y: H - 120, z: o.cotaValle + relieve * 0.08, clase: 'valle' },
    { x: W * 0.88, y: H - 120, z: o.cotaValle + relieve * 0.08, clase: 'valle' },
    { x: plaza.x + entre(-0.1, 0.1) * W, y: H * 0.72, z: o.cotaValle + relieve * entre(0.18, 0.28), clase: 'intermedio' },
  ];
  // Cumbres arriba, repartidas a lo ancho, con collados entre ellas.
  const cumbres: PuntoDeCota[] = [];
  for (let k = 0; k < o.cimas; k++) {
    const x = W * ((k + 0.5) / o.cimas) + entre(-0.08, 0.08) * W;
    cumbres.push({ x: Math.min(W - 150, Math.max(150, x)), y: H * entre(0.1, 0.3), z: o.cotaCumbre + entre(-0.12, 0.12) * relieve, clase: 'pico' });
  }
  puntos.push(...cumbres);
  const lineas: Linea[] = [];
  const collados: Punto[] = [];
  for (let k = 1; k < cumbres.length; k++) {
    const a = cumbres[k - 1];
    const b = cumbres[k];
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + H * entre(0.02, 0.07), z: Math.min(a.z, b.z) - relieve * entre(0.18, 0.3) };
    collados.push(c);
    lineas.push({ tipo: 'cresta', vertices: [{ x: a.x, y: a.y, z: a.z }, c, { x: b.x, y: b.y, z: b.z }] });
    // Vaguada que baja del collado hacia el valle: separa las laderas.
    const fin = { x: c.x + entre(-0.08, 0.08) * W, y: H * entre(0.6, 0.75), z: o.cotaValle + relieve * entre(0.15, 0.25) };
    const medio = { x: (c.x + fin.x) / 2 + entre(-0.05, 0.05) * W, y: (c.y + fin.y) / 2, z: (c.z + fin.z) / 2 - relieve * 0.05 };
    lineas.push({ tipo: 'vaguada', vertices: [{ x: c.x, y: c.y + H * 0.05, z: c.z - relieve * 0.06 }, medio, fin] });
  }
  // Bordes laterales a media altura: la placa no se dispara fuera de los puntos.
  for (const x of [0, W]) {
    puntos.push({ x, y: H * 0.35, z: o.cotaValle + relieve * 0.65, clase: 'intermedio' });
    puntos.push({ x, y: H * 0.7, z: o.cotaValle + relieve * 0.3, clase: 'intermedio' });
  }
  p.puntos = puntos;
  p.lineas = lineas;

  // Nodos de juego sobre el relieve: cimas en las cumbres y una rejilla
  // desordenada de intermedios por las laderas, fuera de la roca.
  const { mapa } = calcularRelieve(p);
  const alt = mapa.alturas;
  const libre = (q: Punto, min: number) => p.nodos.every((n) => Math.hypot(n.x - q.x, n.y - q.y) >= min) && Math.hypot(q.x - plaza.x, q.y - plaza.y) > plaza.radio + 250;
  const sinRoca = (q: Punto) => !alt.esRoca(q, p.umbralRoca * 0.9);
  for (const c of cumbres) {
    // El punto sin roca más alto cerca de la cumbre.
    let mejor: Punto | null = null;
    for (let k = 0; k < 40; k++) {
      const q = { x: c.x + entre(-250, 250), y: c.y + entre(-150, 250) };
      if (q.x < 60 || q.y < 60 || q.x > W - 60 || !sinRoca(q) || !libre(q, 300)) continue;
      if (!mejor || alt.cotaEn(q) > alt.cotaEn(mejor)) mejor = q;
    }
    if (mejor) p.nodos.push({ tipo: 'cima', x: mejor.x, y: mejor.y });
  }
  const s = o.separacion;
  for (let y = H * 0.18; y < H - 450; y += s * 0.87) {
    for (let x = s * 0.4; x < W - s * 0.3; x += s) {
      const q = { x: x + entre(-0.3, 0.3) * s, y: y + entre(-0.3, 0.3) * s };
      if (q.x < 80 || q.x > W - 80 || q.y < 80) continue;
      if (sinRoca(q) && libre(q, s * 0.6)) p.nodos.push({ tipo: 'intermedio', x: q.x, y: q.y });
    }
  }
  p.nodos = p.nodos.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) }));
  return p;
}

export interface ResultadoAleatorio {
  proyecto: Proyecto;
  validacion: Validacion;
  /** Semillas probadas hasta dar con este. */
  intentos: number;
}

/**
 * Proyecto aleatorio jugable: prueba semillas seguidas desde la pedida y se
 * queda con el primero sin avisos graves (o, si ninguno, con el que menos tenga).
 */
export function generarJugable(o: OpcionesAleatorio): ResultadoAleatorio {
  let mejor: ResultadoAleatorio | null = null;
  for (let k = 0; k < Math.max(1, o.intentos); k++) {
    const proyecto = proyectoAleatorio({ ...o, semilla: o.semilla + k });
    const validacion = validarTodo(calcularRelieve(proyecto).mapa, parametrosNivel(proyecto), { vecinos: 4, distanciaMaxima: 2500 });
    const graves = validacion.avisos.filter((a) => a.grave).length;
    if (!mejor || graves < mejor.validacion.avisos.filter((a) => a.grave).length) mejor = { proyecto, validacion, intentos: k + 1 };
    if (graves === 0) break;
  }
  return mejor!;
}
