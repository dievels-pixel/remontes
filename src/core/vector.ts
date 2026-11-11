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
