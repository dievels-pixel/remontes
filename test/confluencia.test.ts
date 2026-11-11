import { describe, expect, it } from 'vitest';
import { confluir, type PistaExistente } from '../src/core/confluencia';
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
const P = { margenInicio: 50, tramoMinimo: 100, abombamientoRamal: 0.05 };

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
    expect(c.compartido!.fin - c.compartido!.inicio).toBeCloseTo(500, 6);
    expect(c.trazado.puntoEn(c.compartido!.inicio + 100)).toEqual({ x: 0, y: 600 });
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
});
