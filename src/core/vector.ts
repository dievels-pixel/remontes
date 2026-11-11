export interface Punto {
  x: number;
  y: number;
}

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function interpolar(a: Punto, b: Punto, t: number): Punto {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Cruce propio de los segmentos ab y cd: se cortan en un punto interior de
 * ambos. Tocarse en un extremo o ser colineales no cuenta como cruce.
 */
export function segmentosSeCruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const orient = (p: Punto, q: Punto, r: Punto) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
