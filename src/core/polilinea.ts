// Polilínea con longitud acumulada: sirve para mover esquiadores por
// distancia recorrida, medir la longitud real y (más adelante) detectar cruces.
import type { Punto } from './vector';

export class Polilinea {
  readonly puntos: readonly Punto[];
  readonly acumulada: Float64Array;
  readonly longitud: number;

  constructor(puntos: Punto[]) {
    if (puntos.length < 2) throw new Error('Una polilínea necesita al menos dos puntos');
    this.puntos = puntos;
    this.acumulada = new Float64Array(puntos.length);
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1];
      const b = puntos[i];
      this.acumulada[i] = this.acumulada[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.longitud = this.acumulada[puntos.length - 1];
  }

  /** Punto a distancia s del inicio, recortado a [0, longitud]. */
  puntoEn(s: number): Punto {
    const d = Math.min(Math.max(s, 0), this.longitud);
    // Búsqueda binaria del segmento.
    let lo = 0;
    let hi = this.puntos.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.acumulada[m] <= d) lo = m;
      else hi = m;
    }
    const largo = this.acumulada[hi] - this.acumulada[lo];
    const t = largo > 0 ? (d - this.acumulada[lo]) / largo : 0;
    const a = this.puntos[lo];
    const b = this.puntos[hi];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Subpolilínea entre las distancias s0 y s1. */
  tramo(s0: number, s1: number): Punto[] {
    const r: Punto[] = [this.puntoEn(s0)];
    for (let i = 0; i < this.puntos.length; i++) {
      if (this.acumulada[i] > s0 && this.acumulada[i] < s1) r.push(this.puntos[i]);
    }
    r.push(this.puntoEn(s1));
    return r;
  }
}
