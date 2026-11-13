import { describe, expect, it } from 'vitest';
import { evaluarPista } from '../src/core/proyectos';
import { Red } from '../src/core/red';
import { REGLAS, redPequena } from './apoyo';

describe('Pista elegida por el jugador (inicio y destino)', () => {
  it('desde la llegada de un remonte a un punto más bajo con salida: cabe, con su lado y sus colores', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const e = evaluarPista(red, 3, 0);
    expect(e.motivo).toBe('ok');
    if (e.motivo !== 'ok') return;
    expect(red.ladosLibres(3, 0)).toContain(e.proyecto.lado);
    expect(e.colores.some((c) => c.factible)).toBe(true);
    expect(e.proyecto).toMatchObject({ desde: 3, hasta: 0 });
  });

  it('explica por qué no: origen sin remonte o desde la plaza; hacia un punto sin salida, cabe en espera', () => {
    expect(evaluarPista(redPequena(), 3, 0).motivo).toBe('origen-inactivo');
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(2, 3); // 2 solo tiene salida por su remonte, que necesita pista en 3
    expect(evaluarPista(red, 0, 1).motivo).toBe('pista-desde-base');
    const e = evaluarPista(red, 3, 2);
    expect(e.motivo === 'ok' && e.espera).toBe(true);
  });

  it('si ningún trazado cabe, da el motivo del trazado (aquí, la plaza en medio)', () => {
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    const red = new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista, giroMaximo: 0 }, obstaculos: [{ x: 200, y: 1500, radio: 450 }] });
    red.construirRemonte(0, 3, false); // a propósito: desde 3 no cabe ninguna bajada
    expect(evaluarPista(red, 3, 0).motivo).toBe('pisa-plaza');
  });

  it('con una lateral ya abierta, la siguiente va por el otro lado', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const e1 = evaluarPista(red, 3, 0);
    if (e1.motivo !== 'ok') throw new Error(e1.motivo);
    const c = e1.colores.find((x) => x.factible)!;
    red.abrirPista(3, 0, c.color, e1.proyecto.lado, c.giro);
    const e2 = evaluarPista(red, 3, 0);
    if (e2.motivo === 'ok') expect(e2.proyecto.lado).toBe(-e1.proyecto.lado);
  });
});
