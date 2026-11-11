// Trazado de pistas. La curva es la recta entre los dos nodos más un
// desplazamiento lateral, siempre hacia el mismo lado y nulo en los extremos:
//   desp(t) = lado · sen(πt) · (abombamiento · D + a · (1 − cos 2πnt))
// El primer término es el abombamiento en C, que separa la pista del remonte
// (las dos laterales a cada lado forman la lente) y fija la sinuosidad mínima.
// El segundo es una serpentina de n ondas y amplitud a que alarga la pista sin
// cruzar nunca al otro lado. La amplitud a se ajusta por bisección hasta
// alcanzar la longitud objetivo.
import { Polilinea } from './polilinea';
import type { Punto } from './vector';

export interface FormaPista {
  /** Lado del abombamiento: +1 o −1. */
  lado: 1 | -1;
  /** Abombamiento máximo relativo a la distancia entre nodos. */
  abombamiento: number;
  /** Número de ondas de la serpentina. */
  ondas: number;
}

const MUESTRAS_POR_ONDA = 28;

/** Curva con la forma dada y amplitud de serpentina `a` (m). */
export function trazarPista(a: Punto, b: Punto, forma: FormaPista, amplitud: number): Polilinea {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const nx = -dy / d;
  const ny = dx / d;
  const muestras = Math.max(48, forma.ondas * MUESTRAS_POR_ONDA);
  const puntos: Punto[] = [];
  for (let i = 0; i <= muestras; i++) {
    const t = i / muestras;
    const desp =
      forma.lado * Math.sin(Math.PI * t) * (forma.abombamiento * d + amplitud * (1 - Math.cos(2 * Math.PI * forma.ondas * t)));
    puntos.push({ x: a.x + dx * t + nx * desp, y: a.y + dy * t + ny * desp });
  }
  return new Polilinea(puntos);
}

/** Sinuosidad mínima de una forma: la de la curva sin serpentina. */
export function sinuosidadMinima(a: Punto, b: Punto, forma: FormaPista): number {
  return trazarPista(a, b, forma, 0).longitud / Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Curva con sinuosidad s = L / D, ajustando por bisección la amplitud de la
 * serpentina. null si s queda fuera de lo que la forma permite.
 */
export function pistaConSinuosidad(a: Punto, b: Punto, forma: FormaPista, s: number, tolerancia = 0.002): Polilinea | null {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const objetivo = s * d;
  let lo = 0;
  let hi = d; // amplitud máxima razonable
  if (trazarPista(a, b, forma, lo).longitud > objetivo * (1 + tolerancia)) return null;
  if (trazarPista(a, b, forma, hi).longitud < objetivo) return null;
  let mejor = trazarPista(a, b, forma, lo);
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    mejor = trazarPista(a, b, forma, m);
    const err = mejor.longitud / objetivo - 1;
    if (Math.abs(err) <= tolerancia) break;
    if (err < 0) lo = m;
    else hi = m;
  }
  return mejor;
}
