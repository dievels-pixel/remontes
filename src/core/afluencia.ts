// Afluencia de esquiadores: curva por escalones en función del tiempo, mezcla
// de niveles también en función del tiempo y carretera de acceso (ver «Pie de
// pistas y afluencia» en la especificación). Nada de esto depende de lo construido.
//
// El tiempo es el de la estación abierta: cuenta desde que hay algún remonte
// en servicio (antes no llega nadie).
//
// Cada `intervalo` segundos la curva sube un escalón, que se aplica `retraso`
// segundos después.
// Lógica pura: ni DOM ni canvas.
import type { Punto } from './vector';

export interface ParametrosAfluencia {
  /** Segundos entre escalones. */
  intervalo: number;
  /** Segundos de retraso con que se aplica cada escalón. */
  retraso: number;
  /** Llegadas por minuto del escalón 0. */
  tasaInicial: number;
  /** Llegadas por minuto que suma cada escalón. */
  incremento: number;
  /**
   * Mezcla de niveles (pesos de verde, azul, roja y negra) en algunos
   * minutos; entre ellos se interpola y después del último se mantiene.
   */
  mezcla: readonly { minuto: number; pesos: readonly number[] }[];
}

/** Escalones alcanzados en el instante t (sin el retraso): 0 al abrir. */
export function escalonVisible(t: number, p: ParametrosAfluencia): number {
  return Math.max(0, Math.floor(t / p.intervalo));
}

/** Escalón que manda en la afluencia en el instante t (el visible, con retraso). */
export function escalonEfectivo(t: number, p: ParametrosAfluencia): number {
  return Math.max(0, Math.floor((t - p.retraso) / p.intervalo));
}

/** Llegadas por minuto en el instante t. */
export function tasaEn(t: number, p: ParametrosAfluencia): number {
  return p.tasaInicial + p.incremento * escalonEfectivo(t, p);
}

/**
 * Mezcla de niveles en el instante t: la de la curva en el minuto en que
 * empezó el escalón efectivo, para que cambie a la vez que la tasa.
 */
export function mezclaEn(t: number, p: ParametrosAfluencia): number[] {
  return mezclaEnMinuto((escalonEfectivo(t, p) * p.intervalo) / 60, p.mezcla);
}

export function mezclaEnMinuto(minuto: number, claves: ParametrosAfluencia['mezcla']): number[] {
  if (claves.length === 0) return [1, 0, 0, 0];
  if (minuto <= claves[0].minuto) return [...claves[0].pesos];
  for (let i = 1; i < claves.length; i++) {
    const a = claves[i - 1];
    const b = claves[i];
    if (minuto <= b.minuto) {
      const f = (minuto - a.minuto) / (b.minuto - a.minuto);
      return a.pesos.map((w, k) => w + (b.pesos[k] - w) * f);
    }
  }
  return [...claves[claves.length - 1].pesos];
}

/**
 * Carretera de acceso: llega desde el sureste (el borde derecho del mapa, por
 * debajo de la plaza) serpenteando hasta el borde de la plaza, por el que
 * entra algo por debajo de su centro (las bases están por encima y a los
 * lados). Las curvas se amortiguan en los dos extremos y no se salen del
 * mapa. El último punto es la entrada.
 */
export function trazarCarretera(plaza: Punto & { radio: number }, anchoMapa: number, altoMapa: number): Punto[] {
  const amplitud = plaza.radio * 0.6;
  const onda = 600; // m entre dos curvas hacia el mismo lado
  const angEntrada = Math.PI / 6; // 30° por debajo de la horizontal, hacia la derecha
  const fin = { x: plaza.x + Math.cos(angEntrada) * plaza.radio, y: plaza.y + Math.sin(angEntrada) * plaza.radio };
  const inicio = { x: anchoMapa, y: Math.max(fin.y, altoMapa - 30 - amplitud) };
  const largo = Math.hypot(fin.x - inicio.x, fin.y - inicio.y);
  // Normal a la recta inicio–fin.
  const nx = -(fin.y - inicio.y) / largo;
  const ny = (fin.x - inicio.x) / largo;
  const ondas = Math.max(1, Math.round(largo / onda)) - 0.5; // termina a media curva
  const n = Math.max(2, Math.ceil(largo / 20));
  const puntos: Punto[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const desvio = amplitud * Math.sin(2 * Math.PI * ondas * t) * Math.pow(Math.sin(Math.PI * t), 0.7);
    puntos.push({
      x: inicio.x + (fin.x - inicio.x) * t + nx * desvio,
      y: Math.min(altoMapa - 15, inicio.y + (fin.y - inicio.y) * t + ny * desvio),
    });
  }
  puntos[puntos.length - 1] = fin;
  return puntos;
}
