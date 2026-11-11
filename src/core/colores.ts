// Color de pista según su pendiente media efectiva p = ΔH / L = ΔH / (s · D).
// Cada color es una banda de pendiente; al elegirlo se toma la pendiente
// central de la banda y de ahí sale la sinuosidad necesaria.

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
  return COLORES.map((color) => {
    const [lo, hi] = bandas[color];
    // Con s ≥ sMin la pendiente no puede pasar de pRecta / sMin.
    const p = modo === 'central' ? pendienteCentral(bandas, color) : Math.max(lo, Math.min(hi, pRecta / sMin));
    const s = pRecta / p;
    return { color, p, s, factible: !demasiadoPlana && s >= sMin * (1 - 1e-9) && s <= sMax };
  });
}
