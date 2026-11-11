import { describe, expect, it } from 'vitest';
import { confluir, demasiadoCerca, pistasCruzadas, type PistaExistente } from '../src/core/confluencia';
import { Polilinea } from '../src/core/polilinea';
import { abrir, redPequena } from './apoyo';

// Pista existente recta de (0,0) a (0,1000), del nodo 7 al 9.
const existente: PistaExistente = {
  id: 0,
  hasta: 9,
  trazado: new Polilinea(Array.from({ length: 21 }, (_, i) => ({ x: 0, y: i * 50 }))),
  cotaDesde: 2000,
  cotaHasta: 1000,
};
// Pista nueva recta que la cruza en (0,500).
const propio = new Polilinea([
  { x: -500, y: 200 },
  { x: 500, y: 800 },
]);
const P = { margenInicio: 50, tramoMinimo: 100, radioAcuerdo: 100 };

describe('Confluencias', () => {
  it('sin encuentro, el trazado no cambia', () => {
    const lejos = new Polilinea([
      { x: 100, y: 0 },
      { x: 600, y: 1000 },
    ]);
    expect(confluir(lejos, { id: 9, x: 600, y: 1000, cota: 1000 }, [existente], P)).toEqual({ trazado: lejos, compartido: null });
  });

  it('con el mismo destino, se une y sigue la existente hasta el final', () => {
    const c = confluir(propio, { id: 9, x: 0, y: 1000, cota: 1000 }, [existente], P);
    const fin = c.trazado.puntos[c.trazado.puntos.length - 1];
    expect(fin).toEqual({ x: 0, y: 1000 });
    expect(c.compartido?.pista).toBe(0);
    // Entra en la existente un radio de acuerdo más abajo del encuentro (0,500).
    expect(c.compartido!.fin - c.compartido!.inicio).toBeCloseTo(400, 6);
    const q = c.trazado.puntoEn(c.compartido!.inicio + 100);
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.y).toBeCloseTo(700, 6);
  });

  it('con otro destino, comparte un tramo y sale un ramal hasta el suyo', () => {
    const destino = { id: 8, x: 300, y: 1100, cota: 900 };
    const c = confluir(propio, destino, [existente], P);
    const fin = c.trazado.puntos[c.trazado.puntos.length - 1];
    expect(fin.x).toBeCloseTo(300, 6);
    expect(fin.y).toBeCloseTo(1100, 6);
    const salida = c.trazado.puntoEn(c.compartido!.fin);
    expect(salida.x).toBeCloseTo(0, 6); // el ramal sale de la existente
    expect(c.compartido!.fin - c.compartido!.inicio).toBeGreaterThanOrEqual(P.tramoMinimo);
  });

  it('el ramal no sale por debajo de la cota de su destino', () => {
    // Destino a 1600 m: la existente baja de 2000 a 1000, así que el ramal
    // tiene que salir antes de la mitad de su recorrido.
    const c = confluir(propio, { id: 8, x: 300, y: 1100, cota: 1600 }, [existente], P);
    if (c.compartido) {
      const salida = c.trazado.puntoEn(c.compartido.fin);
      expect(2000 - (salida.y / 1000) * 1000).toBeGreaterThan(1600);
    }
  });

  it('no se une si el encuentro cae en el tramo inicial', () => {
    const corta = new Polilinea([
      { x: -20, y: 480 },
      { x: 500, y: 800 },
    ]);
    expect(confluir(corta, { id: 9, x: 0, y: 1000, cota: 1000 }, [existente], { ...P, margenInicio: 200 }).compartido).toBeNull();
  });

  it('en la red, la pista que toca a otra la comparte y acaba en su destino', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1);
    const vistas = [abrir(red, 3, 0), abrir(red, 3, 0)];
    for (const p of vistas) {
      const fin = p.trazado.puntos[p.trazado.puntos.length - 1];
      expect(fin.x).toBeCloseTo(red.nodo(p.hasta).x, 6);
      expect(fin.y).toBeCloseTo(red.nodo(p.hasta).y, 6);
      expect(p.pendiente).toBeCloseTo((2400 - 1500) / p.trazado.longitud, 10);
    }
  });

  it('entra tangente a la existente, no en perpendicular', () => {
    // La nueva corta la existente casi en perpendicular: (−500,450)→(500,550).
    const perpendicular = new Polilinea([
      { x: -500, y: 450 },
      { x: 500, y: 550 },
    ]);
    const c = confluir(perpendicular, { id: 9, x: 0, y: 1000, cota: 1000 }, [existente], P);
    const i = c.compartido!.inicio;
    const a = c.trazado.puntoEn(i - 8);
    const b = c.trazado.puntoEn(i);
    const angulo = Math.abs(Math.atan2(b.x - a.x, b.y - a.y)); // 0 = misma dirección que la existente (eje y)
    expect(angulo).toBeLessThan((15 * Math.PI) / 180);
  });

  it('el ramal sale tangente a la existente', () => {
    const c = confluir(propio, { id: 8, x: 300, y: 1100, cota: 900 }, [existente], P);
    const f = c.compartido!.fin;
    const a = c.trazado.puntoEn(f);
    const b = c.trazado.puntoEn(f + 8);
    expect(Math.abs(Math.atan2(b.x - a.x, b.y - a.y))).toBeLessThan((15 * Math.PI) / 180);
  });

  it('cuenta las pistas cruzadas sin unirse, una vez cada una', () => {
    const otra = { ...existente, id: 1, trazado: new Polilinea(Array.from({ length: 21 }, (_, i) => ({ x: 100, y: i * 50 }))) };
    const horizontal = new Polilinea(Array.from({ length: 41 }, (_, i) => ({ x: -500 + i * 25, y: 500 })));
    const lista = [
      { ...existente, compartido: null },
      { ...otra, compartido: null },
    ];
    expect(pistasCruzadas({ trazado: horizontal, compartido: null }, lista, 50, 100)).toBe(2);
    // Si el encuentro con la primera acaba en confluencia, la zona de la unión
    // no cuenta (aquí también cae dentro el cruce con la segunda, a 100 m).
    expect(pistasCruzadas({ trazado: horizontal, compartido: { inicio: 500, fin: 520, pista: 0, inicioPista: 500 } }, lista, 50, 100)).toBe(0);
  });

  it('acercarse a menos de la distancia mínima cuenta como encuentro y se une', () => {
    // Paralela a la existente (x = 0) a 30 m, sin llegar a cruzarla.
    const paralela = new Polilinea(Array.from({ length: 21 }, (_, i) => ({ x: -200 + Math.min(i * 17, 170), y: i * 50 })));
    expect(confluir(paralela, { id: 9, x: -30, y: 1000, cota: 1000 }, [existente], P).compartido).toBeNull();
    const c = confluir(paralela, { id: 9, x: -30, y: 1000, cota: 1000 }, [existente], { ...P, distanciaMinima: 50 });
    expect(c.compartido?.pista).toBe(0);
  });

  it('detecta una pista casi pegada que no se ha unido', () => {
    const paralela = new Polilinea(Array.from({ length: 21 }, (_, i) => ({ x: 30, y: i * 50 })));
    const lista = [{ ...existente, compartido: null }];
    expect(demasiadoCerca({ trazado: paralela, compartido: null }, lista, 50, 50, 100)).toBe(true);
    expect(demasiadoCerca({ trazado: paralela, compartido: null }, lista, 20, 50, 100)).toBe(false);
    expect(demasiadoCerca({ trazado: paralela, compartido: null }, lista, 0, 50, 100)).toBe(false);
  });
});
