// Economía: precio de los remontes y de sus mejoras, y pago por bajada (ver
// «Construcción y economía» y «Pago» en la especificación).
// Lógica pura: ni DOM ni canvas.

/** Tipos de remonte, de menos a más capacidad: el índice es el tipo. */
export const NOMBRES_TIPO = ['telesquí', 'telesilla', 'telecabina'] as const;
export const TIPO_MAXIMO = NOMBRES_TIPO.length - 1;

export interface ParametrosPrecios {
  precioPorMetro: number;
  /** Factor de precio de cada tipo (telesquí, telesilla, telecabina). */
  factorPrecioPorTipo: readonly number[];
}

export interface ParametrosPago {
  /** Tarifa de cada color de pista (verde, azul, roja, negra). */
  tarifas: readonly number[];
  /** Lo que sube el pago por cada bajada con variedad que lleva el esquiador. */
  multiplicadorVariedad: number;
  /**
   * Fracción que paga una bajada que no divierte (repetida, forzada o que le
   * aburre): 1 paga igual, 0 no paga. Sin él, 1.
   */
  factorSinDiversion?: number;
}

export interface ParametrosMantenimiento {
  /** Monedas por metro (en planta) y minuto de juego de un telesquí. */
  porMetroYMinuto: number;
  /** Monedas por minuto de cada remonte, sea cual sea su longitud y tipo (sus dos estaciones). Sin él, 0. */
  fijoPorMinuto?: number;
  /** Factor de mantenimiento de cada tipo (telesquí, telesilla, telecabina). */
  factorPorTipo: readonly number[];
}

/**
 * Mantenimiento de un remonte (monedas por minuto de juego): se paga siempre,
 * se use o no, y crece con el tipo más que la capacidad para que mejorar un
 * remonte sin cola no compense.
 */
export function mantenimientoRemonte(longitud: number, tipo: number, p: ParametrosMantenimiento): number {
  return (p.fijoPorMinuto ?? 0) + longitud * p.porMetroYMinuto * p.factorPorTipo[tipo];
}

/** Precio de un remonte de esa longitud (m, en planta) y tipo: entero, redondeado hacia arriba. */
export function precioRemonte(longitud: number, tipo: number, p: ParametrosPrecios): number {
  return Math.ceil(longitud * p.precioPorMetro * p.factorPrecioPorTipo[tipo]);
}

/** Lo que cuesta mejorar un remonte de `tipo` al siguiente (la diferencia de precio). */
export function precioMejora(longitud: number, tipo: number, p: ParametrosPrecios): number {
  return precioRemonte(longitud, tipo + 1, p) - precioRemonte(longitud, tipo, p);
}

/**
 * Pago de una bajada: tarifa del color de la pista (no del nivel del
 * esquiador) × (1 + multiplicador × bajadas con variedad que llevaba antes).
 */
export function pagoBajada(nivelColor: number, variedades: number, p: ParametrosPago): number {
  return p.tarifas[nivelColor] * (1 + p.multiplicadorVariedad * variedades);
}
