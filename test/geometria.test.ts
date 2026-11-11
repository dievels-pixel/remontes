import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { evaluarColores, pendienteCentral } from '../src/core/colores';
import { pistaConSinuosidad, sinuosidadMinima, trazarPista, type FormaPista } from '../src/core/curva';
import { Polilinea } from '../src/core/polilinea';
import { segmentosSeCruzan } from '../src/core/vector';

describe('Polilínea', () => {
  const l = new Polilinea([
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 3, y: 10 },
  ]);

  it('mide la longitud acumulada', () => {
    expect(l.longitud).toBeCloseTo(11, 12);
  });

  it('devuelve el punto a una distancia dada y recorta fuera de rango', () => {
    expect(l.puntoEn(2.5)).toEqual({ x: 1.5, y: 2 });
    expect(l.puntoEn(8)).toEqual({ x: 3, y: 7 });
    expect(l.puntoEn(-1)).toEqual({ x: 0, y: 0 });
    expect(l.puntoEn(99)).toEqual({ x: 3, y: 10 });
  });

  it('extrae un tramo con sus extremos', () => {
    const t = l.tramo(2.5, 8);
    expect(t[0]).toEqual({ x: 1.5, y: 2 });
    expect(t[1]).toEqual({ x: 3, y: 4 });
    expect(t[t.length - 1]).toEqual({ x: 3, y: 7 });
  });
});

describe('Trazado de pista', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 2000 };
  const forma: FormaPista = { lado: 1, abombamiento: 0.2, ondas: 3 };

  it('empieza y acaba en los nodos', () => {
    const p = trazarPista(a, b, forma, 150);
    expect(p.puntos[0]).toEqual(a);
    expect(p.puntos[p.puntos.length - 1].x).toBeCloseTo(b.x, 9);
    expect(p.puntos[p.puntos.length - 1].y).toBeCloseTo(b.y, 9);
  });

  it('se abomba hacia el lado pedido', () => {
    const medio = (l: 1 | -1) => {
      const p = trazarPista(a, b, { ...forma, lado: l }, 0);
      return p.puntoEn(p.longitud / 2).x;
    };
    expect(Math.sign(medio(1))).toBe(-Math.sign(medio(-1)));
  });

  it('nunca cruza al otro lado de la recta entre nodos (no corta su remonte)', () => {
    for (const s of [1.3, 1.6, 2.0]) {
      const p = pistaConSinuosidad(a, b, forma, s)!;
      // Con a→b vertical hacia abajo, el lado +1 es x < 0.
      for (const q of p.puntos) expect(q.x).toBeLessThanOrEqual(1e-9);
    }
  });

  it('con abombamiento lateral 0,2 la sinuosidad mínima ronda 1,1', () => {
    expect(sinuosidadMinima(a, b, forma)).toBeGreaterThan(1.07);
    expect(sinuosidadMinima(a, b, forma)).toBeLessThan(1.13);
  });

  it('la bisección alcanza la sinuosidad pedida', () => {
    for (const s of [1.2, 1.5, 1.9]) {
      const p = pistaConSinuosidad(a, b, forma, s)!;
      expect(p.longitud / 2000).toBeCloseTo(s, 2);
    }
  });

  it('devuelve null si la sinuosidad no cabe en la forma', () => {
    expect(pistaConSinuosidad(a, b, forma, 1.0)).toBeNull(); // por debajo de la mínima
    expect(pistaConSinuosidad(a, b, forma, 50)).toBeNull();
  });
});

describe('Colores por pendiente', () => {
  const bandas = CONFIG.pista.bandas;

  it('la sinuosidad necesaria es ΔH / (p_central · D)', () => {
    const r = evaluarColores(600, 2000, 1, 2, bandas);
    const azul = r.find((c) => c.color === 'azul')!;
    expect(azul.s).toBeCloseTo(600 / (pendienteCentral(bandas, 'azul') * 2000), 10);
  });

  it('solo son factibles los colores con s dentro del rango', () => {
    // p en recta 0,3: azul (s = 1,5) cabe; verde (s = 3) y negra (s < 1) no.
    const r = evaluarColores(600, 2000, 1.05, 2, bandas);
    const f = Object.fromEntries(r.map((c) => [c.color, c.factible]));
    expect(f).toEqual({ verde: false, azul: true, roja: false, negra: false });
  });

  it('descarta una pareja más plana que el mínimo del verde', () => {
    const r = evaluarColores(40, 2000, 0.5, 2, bandas);
    expect(r.every((c) => !c.factible)).toBe(true);
  });
});

describe('Cruce de segmentos', () => {
  const p = (x: number, y: number) => ({ x, y });
  it('detecta un cruce en X', () => {
    expect(segmentosSeCruzan(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });
  it('no cuenta segmentos separados, paralelos ni que se tocan en un extremo', () => {
    expect(segmentosSeCruzan(p(0, 0), p(1, 1), p(5, 0), p(6, 1))).toBe(false);
    expect(segmentosSeCruzan(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBe(false);
    expect(segmentosSeCruzan(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBe(false);
  });
});
