// Indicadores de la estación para la pantalla (etapa 8 de la especificación):
// kilómetros de pista por color frente a la proporción de esquiadores de cada
// nivel que llegan. Lógica pura.
import { COLORES } from './colores';
import type { Red } from './red';

/** Kilómetros de pista activa de cada color (verde, azul, roja, negra). */
export function kmPorColor(red: Red): number[] {
  const km = [0, 0, 0, 0];
  const activas = red.pistasActivas();
  for (const p of red.pistas) if (activas.has(p.id)) km[COLORES.indexOf(p.color)] += p.trazado.longitud / 1000;
  return km;
}

/** Reparte en fracciones que suman 1 (todo ceros si no hay nada). */
export function fracciones(valores: readonly number[]): number[] {
  const total = valores.reduce((a, b) => a + b, 0);
  return valores.map((v) => (total > 0 ? v / total : 0));
}

/**
 * Nivel al que más le falta pista: mayor diferencia entre su parte de las
 * llegadas y la parte de kilómetros de su color. null si ninguno pasa del
 * umbral (o aún no llega nadie de ese nivel).
 */
export function colorQueFalta(km: readonly number[], mezcla: readonly number[], umbral = 0.1): number | null {
  const oferta = fracciones(km);
  const demanda = fracciones(mezcla);
  let peor: number | null = null;
  let max = umbral;
  demanda.forEach((d, i) => {
    if (d > 0 && d - oferta[i] > max) [peor, max] = [i, d - oferta[i]];
  });
  return peor;
}
