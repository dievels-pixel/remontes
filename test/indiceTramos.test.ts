import { describe, expect, it } from 'vitest';
import { crearAzar } from '../src/core/azar';
import { IndiceTramos, puntoMasCercano } from '../src/core/confluencia';
import { Polilinea } from '../src/core/polilinea';

/** Polilínea al azar: un paseo de `n` tramos de unos 30 m. */
function paseo(azar: () => number, n: number): Polilinea {
  const p = [{ x: azar() * 1500, y: azar() * 1500 }];
  let ang = azar() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    ang += (azar() - 0.5) * 1.2;
    const u = p[p.length - 1];
    p.push({ x: u.x + Math.cos(ang) * 30, y: u.y + Math.sin(ang) * 30 });
  }
  return new Polilinea(p);
}

/** ¿Se cortan los segmentos ab y cd? (como en confluencia.ts) */
function seCortan(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (den === 0) return false;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

describe('Índice espacial de tramos', () => {
  it('no se pierde ningún corte ni ningún punto cercano respecto a mirarlo todo', () => {
    const azar = crearAzar(11);
    const lineas = Array.from({ length: 12 }, () => paseo(azar, 60));
    const indice = new IndiceTramos(lineas);
    const propia = paseo(azar, 80);
    const D = 40;
    let cortes = 0;
    let cercanos = 0;
    for (let i = 1; i < propia.puntos.length; i++) {
      const a = propia.puntos[i - 1];
      const b = propia.puntos[i];
      const cands = indice.candidatos(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      const claves = new Set(cands.map((c) => `${c.k}:${c.j}`));
      // Ordenados por polilínea y tramo.
      for (let n = 1; n < cands.length; n++) expect(cands[n].k * 1e4 + cands[n].j).toBeGreaterThan(cands[n - 1].k * 1e4 + cands[n - 1].j);
      lineas.forEach((l, k) => {
        for (let j = 1; j < l.puntos.length; j++) {
          if (seCortan(a, b, l.puntos[j - 1], l.puntos[j])) {
            cortes++;
            expect(claves.has(`${k}:${j}`)).toBe(true);
          }
        }
        // El más cercano, si está a menos de D, sale igual con el índice.
        const total = puntoMasCercano(l, b);
        if (total.d < D) {
          cercanos++;
          const js = indice.candidatos(b.x - D, b.y - D, b.x + D, b.y + D).filter((c) => c.k === k).map((c) => c.j);
          expect(IndiceTramos.masCercano(l, js, b)).toEqual(total);
        }
      });
    }
    // Que la prueba haya visto casos de verdad.
    expect(cortes).toBeGreaterThan(3);
    expect(cercanos).toBeGreaterThan(3);
  });
});
