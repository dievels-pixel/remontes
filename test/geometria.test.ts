import { describe, expect, it } from 'vitest';
import { evaluarColores, pendienteCentral } from '../src/core/colores';
import { pistaConSinuosidad, sinuosidadMinima, trazarPista, type FormaPista } from '../src/core/curva';
import { Polilinea } from '../src/core/polilinea';
import { segmentosSeCruzan } from '../src/core/vector';
import { BANDAS_CLASICAS } from './apoyo';

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

describe('Irregularidad de la serpentina', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 2000 };
  const base: FormaPista = { lado: 1, abombamiento: 0.1, ondas: 8 };

  it('con irregularidad 0 la forma es la de siempre', () => {
    const sin = trazarPista(a, b, base, 60);
    const cero = trazarPista(a, b, { ...base, irregularidad: 0, semilla: 1234 }, 60);
    expect(cero.puntos).toEqual(sin.puntos);
  });

  it('con irregularidad la forma cambia, es estable por semilla y sigue sin cruzar al otro lado', () => {
    const f = { ...base, irregularidad: 1, semilla: 77 };
    const p1 = trazarPista(a, b, f, 60);
    expect(p1.puntos).not.toEqual(trazarPista(a, b, base, 60).puntos);
    expect(trazarPista(a, b, f, 60).puntos).toEqual(p1.puntos);
    expect(trazarPista(a, b, { ...f, semilla: 78 }, 60).puntos).not.toEqual(p1.puntos);
    for (const q of p1.puntos) expect(q.x).toBeLessThanOrEqual(1e-9);
  });

  it('la bisección sigue alcanzando la sinuosidad pedida', () => {
    const p = pistaConSinuosidad(a, b, { ...base, irregularidad: 1, semilla: 5 }, 1.5)!;
    expect(p.longitud / 2000).toBeCloseTo(1.5, 2);
  });
});

describe('Temblor de la serpentina', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 2000 };
  const base: FormaPista = { lado: 1, abombamiento: 0.06, ondas: 3, irregularidad: 0.95, semilla: 9 };

  it('con temblor 0 la forma es idéntica a la de sin temblor', () => {
    for (const amp of [0, 40, 120]) {
      expect(trazarPista(a, b, { ...base, temblor: 0 }, amp).puntos).toEqual(trazarPista(a, b, base, amp).puntos);
    }
    expect(pistaConSinuosidad(a, b, { ...base, temblor: 0 }, 1.3)!.puntos).toEqual(pistaConSinuosidad(a, b, base, 1.3)!.puntos);
  });

  it('con temblor, la pista más directa ya no es lisa y la sinuosidad mínima sube', () => {
    const lisa = trazarPista(a, b, base, 0);
    const temblona = trazarPista(a, b, { ...base, temblor: 30 }, 0);
    expect(temblona.puntos).not.toEqual(lisa.puntos);
    expect(sinuosidadMinima(a, b, { ...base, temblor: 30 })).toBeGreaterThan(sinuosidadMinima(a, b, base));
  });

  it('con temblor nunca cruza al otro lado de su eje', () => {
    for (const temblor of [10, 40, 80]) {
      const f = { ...base, temblor };
      for (const p of [trazarPista(a, b, f, 0), pistaConSinuosidad(a, b, f, 1.4)!]) for (const q of p.puntos) expect(q.x).toBeLessThanOrEqual(1e-9);
    }
  });

  it('la bisección parte del temblor y sigue alcanzando la sinuosidad pedida', () => {
    const f = { ...base, temblor: 40 };
    for (const s of [sinuosidadMinima(a, b, f) + 0.01, 1.3, 1.55]) {
      const p = pistaConSinuosidad(a, b, f, s)!;
      expect(p.longitud / 2000).toBeCloseTo(s, 2);
    }
    // Por debajo de la sinuosidad que ya da el temblor, no hay curva posible.
    expect(pistaConSinuosidad(a, b, f, sinuosidadMinima(a, b, f) - 0.02)).toBeNull();
  });
});

describe('Colores por pendiente', () => {
  const bandas = BANDAS_CLASICAS;

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

describe('Pendiente objetivo «cercana»', () => {
  const bandas = BANDAS_CLASICAS;

  it('toma la pendiente de la banda más próxima a la recta, que pide menos sinuosidad', () => {
    // p en recta 0,3 con sMin 1,05: la azul [0,15–0,25] toma 0,25 (s = 1,2).
    const r = evaluarColores(600, 2000, 1.05, 2, bandas, 'cercana');
    const azul = r.find((c) => c.color === 'azul')!;
    expect(azul.p).toBeCloseTo(0.25, 10);
    expect(azul.s).toBeCloseTo(1.2, 10);
    const central = evaluarColores(600, 2000, 1.05, 2, bandas, 'central').find((c) => c.color === 'azul')!;
    expect(azul.s).toBeLessThan(central.s);
  });

  it('una banda que contiene la pendiente posible sale con la sinuosidad mínima', () => {
    // pRecta / sMin = 0,3 / 1,05 ≈ 0,286, dentro de la roja.
    const roja = evaluarColores(600, 2000, 1.05, 2, bandas, 'cercana').find((c) => c.color === 'roja')!;
    expect(roja.factible).toBe(true);
    expect(roja.s).toBeCloseTo(1.05, 10);
  });

  it('abre más colores que «central» en la misma pareja', () => {
    const n = (m: 'central' | 'cercana') => evaluarColores(600, 2000, 1.05, 2, bandas, m).filter((c) => c.factible).length;
    expect(n('cercana')).toBeGreaterThan(n('central'));
  });
});

describe('Bandas solapadas', () => {
  const solapadas = {
    verde: [0.05, 0.2],
    azul: [0.13, 0.3],
    roja: [0.22, 0.42],
    negra: [0.35, 0.6],
  } as const;

  it('una misma pendiente puede ser de dos colores, y una pareja admite más colores', () => {
    // Recta con pendiente 0,25 y sMin 1: azul y roja la aceptan tal cual (s = 1).
    const r = evaluarColores(500, 2000, 1, 1.55, solapadas, 'cercana');
    const f = Object.fromEntries(r.map((c) => [c.color, c]));
    expect(f.azul.factible && f.roja.factible).toBe(true);
    expect(f.azul.s).toBeCloseTo(1, 10);
    expect(f.roja.s).toBeCloseTo(1, 10);
    expect(f.verde.factible).toBe(true); // 0,2 con s = 1,25
    const sinSolape = evaluarColores(500, 2000, 1, 1.55, BANDAS_CLASICAS, 'cercana').filter((c) => c.factible).length;
    expect(r.filter((c) => c.factible).length).toBeGreaterThan(sinSolape);
  });
});
