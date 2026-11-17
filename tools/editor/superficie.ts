// Superficie del relieve: una placa delgada (función de base radial
// U(r) = r² log r, la que minimiza la energía de flexión) que pasa por los
// puntos de cota y por muestras de las líneas de cresta y vaguada, más un
// ruido fractal de baja amplitud con semilla. Lógica pura: sin DOM.

export interface PuntoCota {
  x: number;
  y: number;
  /** Cota en metros. */
  z: number;
}

export interface ParametrosSuperficie {
  /** Tamaño del mapa en metros. */
  ancho: number;
  alto: number;
  /** Metros entre muestras del mapa de alturas (alturas.png). */
  resolucion: number;
  /**
   * Suavizado (0 = pasa exactamente por cada punto). Valores pequeños, como
   * 0,01, evitan ondulaciones entre puntos muy juntos con cotas distintas.
   */
  suavizado: number;
  /** Amplitud del ruido fractal en metros (0 = sin ruido). */
  rugosidad: number;
  /** Longitud de onda de la primera octava del ruido, en metros. */
  ondaRugosidad: number;
  semilla: number;
}

export interface Rejilla {
  columnas: number;
  filas: number;
  /** Cota en metros de cada muestra, por filas. */
  z: Float32Array;
}

/** Columnas y filas del mapa de alturas para ese tamaño y resolución. */
export function tamanoRejilla(p: Pick<ParametrosSuperficie, 'ancho' | 'alto' | 'resolucion'>): { columnas: number; filas: number } {
  return { columnas: Math.max(8, Math.round(p.ancho / p.resolucion) + 1), filas: Math.max(8, Math.round(p.alto / p.resolucion) + 1) };
}

const U = (r2: number) => (r2 > 1e-12 ? 0.5 * r2 * Math.log(r2) : 0); // r² log r = ½ r² log r²

/**
 * Coeficientes de la placa delgada que pasa por los puntos (con suavizado λ).
 * Coordenadas normalizadas a [0, 1] para que el sistema esté bien condicionado.
 */
export function ajustarPlaca(puntos: readonly PuntoCota[], escala: number, suavizado: number): ((x: number, y: number) => number) | null {
  const n = puntos.length;
  if (n === 0) return null;
  const media = puntos.reduce((s, p) => s + p.z, 0) / n;
  if (n < 3) return () => media;
  const xs = puntos.map((p) => p.x / escala);
  const ys = puntos.map((p) => p.y / escala);
  const m = n + 3;
  // Sistema [K + λI  P; Pᵀ  0] [w; a] = [z; 0], con P = [1 x y].
  const A = new Float64Array(m * m);
  const b = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) A[i * m + k] = U((xs[i] - xs[k]) ** 2 + (ys[i] - ys[k]) ** 2);
    A[i * m + i] += suavizado;
    A[i * m + n] = 1;
    A[i * m + n + 1] = xs[i];
    A[i * m + n + 2] = ys[i];
    A[n * m + i] = 1;
    A[(n + 1) * m + i] = xs[i];
    A[(n + 2) * m + i] = ys[i];
    b[i] = puntos[i].z - media;
  }
  const sol = resolver(A, b, m);
  if (!sol) return () => media;
  return (x: number, y: number) => {
    const u = x / escala;
    const v = y / escala;
    let z = media + sol[n] + sol[n + 1] * u + sol[n + 2] * v;
    for (let i = 0; i < n; i++) z += sol[i] * U((u - xs[i]) ** 2 + (v - ys[i]) ** 2);
    return z;
  };
}

/** Eliminación gaussiana con pivoteo parcial; null si el sistema es singular. */
function resolver(A: Float64Array, b: Float64Array, m: number): Float64Array | null {
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r * m + c]) > Math.abs(A[piv * m + c])) piv = r;
    if (Math.abs(A[piv * m + c]) < 1e-12) return null;
    if (piv !== c) {
      for (let k = 0; k < m; k++) [A[c * m + k], A[piv * m + k]] = [A[piv * m + k], A[c * m + k]];
      [b[c], b[piv]] = [b[piv], b[c]];
    }
    const d = A[c * m + c];
    for (let r = c + 1; r < m; r++) {
      const f = A[r * m + c] / d;
      if (f === 0) continue;
      for (let k = c; k < m; k++) A[r * m + k] -= f * A[c * m + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < m; k++) s -= A[r * m + k] * x[k];
    x[r] = s / A[r * m + r];
  }
  return x;
}

/** Azar determinista entero → [0, 1). */
function hash(i: number, j: number, semilla: number): number {
  let h = (i * 374761393 + j * 668265263 + semilla * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ruido de valores suavizado en (x, y) en unidades de celda. */
function ruidoValor(x: number, y: number, semilla: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(i, j, semilla);
  const b2 = hash(i + 1, j, semilla);
  const c = hash(i, j + 1, semilla);
  const d = hash(i + 1, j + 1, semilla);
  const u = s(fx);
  const v = s(fy);
  return (a + (b2 - a) * u + (c - a) * v + (a - b2 - c + d) * u * v) * 2 - 1;
}

/** Ruido fractal (cinco octavas) en metros: entre −amplitud y +amplitud aproximadamente. */
export function ruidoFractal(x: number, y: number, amplitud: number, onda: number, semilla: number): number {
  if (amplitud <= 0) return 0;
  let total = 0;
  let a = 1;
  let f = 1 / Math.max(1, onda);
  let suma = 0;
  for (let o = 0; o < 5; o++) {
    total += a * ruidoValor(x * f, y * f, semilla + o * 101);
    suma += a;
    a *= 0.5;
    f *= 2;
  }
  return (total / suma) * amplitud;
}

/** Muestras de una polilínea cada `paso` metros (cotas interpoladas entre vértices). */
export function muestrearLinea(vertices: readonly PuntoCota[], paso: number): PuntoCota[] {
  if (vertices.length === 0) return [];
  const r: PuntoCota[] = [{ ...vertices[0] }];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(L / paso));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      r.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return r;
}

/** Superficie en la rejilla del mapa de alturas: placa delgada más ruido. */
export function calcularSuperficie(puntos: readonly PuntoCota[], p: ParametrosSuperficie): Rejilla {
  const { columnas, filas } = tamanoRejilla(p);
  const escala = Math.max(p.ancho, p.alto);
  const placa = ajustarPlaca(puntos, escala, p.suavizado);
  const z = new Float32Array(columnas * filas);
  const dx = p.ancho / (columnas - 1);
  const dy = p.alto / (filas - 1);
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      const x = i * dx;
      const y = j * dy;
      z[j * columnas + i] = (placa ? placa(x, y) : 1500) + ruidoFractal(x, y, p.rugosidad, p.ondaRugosidad, p.semilla);
    }
  }
  return { columnas, filas, z };
}

/**
 * Pasa la superficie a grises de 8 bits para alturas.png, con las cotas que
 * representan el negro y el blanco (las del JSON del nivel).
 */
export function aGrises(r: Rejilla): { gris: Uint8Array; cotaMin: number; cotaMax: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of r.z) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Redondeadas a 10 m y con un margen, para que el JSON quede limpio.
  const cotaMin = Math.floor((min - 5) / 10) * 10;
  const cotaMax = Math.max(cotaMin + 20, Math.ceil((max + 5) / 10) * 10);
  const gris = new Uint8Array(r.z.length);
  for (let i = 0; i < r.z.length; i++) gris[i] = Math.round(((r.z[i] - cotaMin) / (cotaMax - cotaMin)) * 255);
  return { gris, cotaMin, cotaMax };
}
