// Color de pista según su pendiente media efectiva p = ΔH / L = ΔH / (s · D).
// Cada color es una banda de pendiente; al elegirlo se toma una pendiente de
// la banda (la central o la más cercana a la recta) y de ahí sale la
// sinuosidad necesaria.

export const COLORES = ['verde', 'azul', 'roja', 'negra'] as const;
export type ColorPista = (typeof COLORES)[number];

export type Bandas = Record<ColorPista, readonly [number, number]>;

/** Copia independiente de unas bandas (para poder cambiarlas en memoria). */
export function copiarBandas(b: Bandas): Bandas {
  return Object.fromEntries(COLORES.map((c) => [c, [b[c][0], b[c][1]] as const])) as unknown as Bandas;
}

export function pendienteCentral(bandas: Bandas, color: ColorPista): number {
  const [a, b] = bandas[color];
  return (a + b) / 2;
}

/**
 * Qué pendiente de la banda se busca al elegir un color:
 * - 'central': la del centro de la banda;
 * - 'cercana': la de la banda más cercana a la de la recta, es decir, la que
 *   menos sinuosidad necesita.
 */
export type PendienteObjetivo = 'central' | 'cercana';

export interface Factibilidad {
  color: ColorPista;
  /** Pendiente buscada dentro de la banda. */
  p: number;
  /** Sinuosidad necesaria para esa pendiente. */
  s: number;
  factible: boolean;
}

/**
 * Colores posibles para un desnivel ΔH y una distancia en planta D, con la
 * sinuosidad acotada a [sMin, sMax]. Si la recta ya es más suave que el
 * mínimo del verde, la pareja se descarta (no hay color posible).
 */
export function evaluarColores(
  desnivel: number,
  distancia: number,
  sMin: number,
  sMax: number,
  bandas: Bandas,
  modo: PendienteObjetivo = 'central',
): Factibilidad[] {
  const pRecta = desnivel / distancia;
  const demasiadoPlana = pRecta < bandas.verde[0];
  const acotar = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  return COLORES.map((color, i) => {
    const [lo, hi] = bandas[color];
    let p: number;
    if (modo === 'central') {
      p = pendienteCentral(bandas, color);
    } else {
      // Con s ≥ sMin la pendiente no puede pasar de pRecta / sMin. Se busca
      // primero en la parte limpia de la banda (por debajo del mínimo del
      // color siguiente); solo si no cabe ahí, en el solape, y sale forzada.
      const siguiente = COLORES[i + 1];
      const hiLimpio = siguiente ? Math.min(hi, bandas[siguiente][0]) : hi;
      p = acotar(pRecta / sMin, lo, hiLimpio);
      if (pRecta / p > sMax) p = acotar(pRecta / sMin, lo, hi);
    }
    const s = pRecta / p;
    return { color, p, s, factible: !demasiadoPlana && s >= sMin * (1 - 1e-9) && s <= sMax };
  });
}

const TOLERANCIA_FORZADA = 0.003;

/** Nivel de un color: 0 verde, 1 azul, 2 roja, 3 negra. */
export function nivelDe(color: ColorPista): number {
  return COLORES.indexOf(color);
}

/**
 * Pista forzada: su pendiente cae en la parte alta de su banda, dentro del
 * solape con el color siguiente (por ejemplo, una verde más empinada que el
 * mínimo de la azul). Es de su color porque se supone más ancha, pero divierte
 * menos a los esquiadores de ese nivel. La negra nunca lo está.
 */
export function pistaForzada(color: ColorPista, pendiente: number, bandas: Bandas): boolean {
  const siguiente = COLORES[nivelDe(color) + 1];
  // Pequeña tolerancia: una pista buscada justo en el límite puede quedar unas
  // milésimas por encima al trazarla.
  return siguiente !== undefined && pendiente > bandas[siguiente][0] + TOLERANCIA_FORZADA;
}
