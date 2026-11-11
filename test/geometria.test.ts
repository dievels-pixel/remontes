import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { trazarPista } from '../src/core/curva';
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
  const b = { x: 0, y: 1000 };

  it('empieza y acaba en los nodos', () => {
    const p = trazarPista(a, b, 1, 42, CONFIG.pista);
    expect(p.puntos[0]).toEqual(a);
    expect(p.puntos[p.puntos.length - 1]).toEqual(b);
  });

  it('es estable con la misma semilla', () => {
    const p1 = trazarPista(a, b, 1, 42, CONFIG.pista);
    const p2 = trazarPista(a, b, 1, 42, CONFIG.pista);
    expect(p1.puntos).toEqual(p2.puntos);
  });

  it('se abomba hacia el lado pedido y da sinuosidad moderada', () => {
    const izq = trazarPista(a, b, 1, 42, CONFIG.pista);
    const der = trazarPista(a, b, -1, 42, CONFIG.pista);
    const medio = (p: Polilinea) => p.puntoEn(p.longitud / 2).x;
    expect(Math.sign(medio(izq))).toBe(-Math.sign(medio(der)));
    const s = izq.longitud / 1000;
    expect(s).toBeGreaterThan(1.02);
    expect(s).toBeLessThan(1.6);
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
