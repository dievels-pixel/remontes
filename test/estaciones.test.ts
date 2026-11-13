import { describe, expect, it } from 'vitest';
import { Red } from '../src/core/red';
import { abrir, REGLAS, redPequena } from './apoyo';

/** Red pequeña con una base más, lejos a la derecha (nodo 4). */
function red5(): Red {
  const nodos = redPequena().nodos.map((n) => ({ ...n }));
  nodos.push({ id: 4, tipo: 'base', x: 1200, y: 3000, cota: 1480 });
  return new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista } });
}

describe('Estación de salida y llegada de cada pista', () => {
  it('en un punto sin desdoblar, la única estación; en uno sin estaciones, su centro', () => {
    const red = red5();
    const r = red.construirRemonte(0, 3);
    const p = abrir(red, 3, 4);
    expect(red.estacionDePista(p, 'salida').id).toBe(r.estacionHasta);
    // La base 4 no tiene remonte: es un círculo gris y la pista llega a su centro.
    expect(red.estacionDePista(p, 'llegada')).toMatchObject({ nodo: 4, ox: 0, oy: 0 });
  });

  it('las laterales salen de la estación donde llega su remonte y llegan a la de donde sale', () => {
    const red = red5();
    const a = red.construirRemonte(0, 3);
    const b = red.construirRemonte(1, 3); // desdobla la cima
    const la = abrir(red, 3, 0);
    const lb = abrir(red, 3, 1);
    expect(red.estacionDePista(la, 'salida').id).toBe(a.estacionHasta);
    expect(red.estacionDePista(lb, 'salida').id).toBe(b.estacionHasta);
    expect(red.estacionDePista(lb, 'llegada').id).toBe(b.estacionDesde);
  });

  it('el resto sale por la estación del lado hacia el que va', () => {
    const red = red5();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 3); // la estación nueva queda a la derecha (ox > 0)
    const derecha = red.estacionesDe(3).find((e) => e.ox > 0)!;
    const p = abrir(red, 3, 4); // baja hacia la derecha
    expect(red.estacionDePista(p, 'salida').id).toBe(derecha.id);
  });

  it('al llegar a un punto desdoblado, por la estación de su lado', () => {
    const red = red5();
    red.construirRemonte(4, 3);
    red.construirRemonte(4, 2); // desdobla la base 4
    abrir(red, 3, 4);
    const p = abrir(red, 2, 4);
    // Viene de la izquierda (nodo 2, x = 200): la estación de 4 más a la izquierda.
    const est = red.estacionesDe(4);
    const masIzquierda = est.reduce((m, e) => (e.ox < m.ox ? e : m));
    expect(red.estacionDePista({ ...p, lateral: false }, 'llegada').id).toBe(masIzquierda.id);
  });

  it('si el punto se desdobla después de abrir la pista, la pista cambia de estación', () => {
    const red = red5();
    const r = red.construirRemonte(0, 3);
    const p = abrir(red, 3, 4);
    expect(red.estacionDePista(p, 'salida').id).toBe(r.estacionHasta);
    red.construirRemonte(1, 3);
    expect(red.estacionDePista(p, 'salida').ox).toBeGreaterThan(0);
  });
});
