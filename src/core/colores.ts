// Color de pista según su pendiente media efectiva p = ΔH / L = ΔH / (s · D).
// Cada color es una banda de pendiente; al elegirlo se toma la pendiente
// central de la banda y de ahí sale la sinuosidad necesaria.

export const COLORES = ['verde', 'azul', 'roja', 'negra'] as const;
export type ColorPista = (typeof COLORES)[number];

export type Bandas = Record<ColorPista, readonly [number, number]>;

export function pendienteCentral(bandas: Bandas, color: ColorPista): number {
  const [a, b] = bandas[color];
  return (a + b) / 2;
}

export interface Factibilidad {
  color: ColorPista;
  /** Sinuosidad necesaria para la pendiente central de la banda. */
  s: number;
  factible: boolean;
}

/**
 * Colores posibles para un desnivel ΔH y una distancia en planta D, con la
 * sinuosidad acotada a [sMin, sMax]. Si la recta ya es más suave que el
 * mínimo del verde, la pareja se descarta (no hay color posible).
 */
export function evaluarColores(desnivel: number, distancia: number, sMin: number, sMax: number, bandas: Bandas): Factibilidad[] {
  const demasiadoPlana = desnivel / distancia < bandas.verde[0];
  return COLORES.map((color) => {
    const s = desnivel / pendienteCentral(bandas, color) / distancia;
    return { color, s, factible: !demasiadoPlana && s >= sMin && s <= sMax };
  });
}
