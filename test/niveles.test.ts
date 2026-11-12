import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { nivelDe, pistaForzada } from '../src/core/colores';
import type { Red } from '../src/core/red';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { BANDAS_CLASICAS, conValoresClasicos, redPequena } from './apoyo';

const P: ParametrosSimulacion = {
  velocidadRemonte: CONFIG.remonte.velocidad,
  intervaloBolitas: CONFIG.remonte.intervaloBolitas,
  capacidadBolita: CONFIG.remonte.capacidad,
  ...CONFIG.esquiador,
  // Valores fijos para la prueba, no los provisionales de config.ts.
  diversionInicial: 1,
  diversionSuNivel: 0.2,
  diversionForzada: 0.05,
  diversionPorNivelInferior: 0.15,
  umbralMarcha: 0.25,
  pesoSuNivel: 3,
};
const ENTRADA = { x: 150, y: 3100 };
const DT = 1 / 60;

function correr(sim: Simulacion, segundos: number, alPaso?: () => void) {
  for (let t = 0; t < segundos; t += DT) {
    sim.paso(DT);
    alPaso?.();
  }
}

/** Red pequeña con una sola bajada, azul con los valores clásicos: 3 → 0. */
function redAzul(): Red {
  const red = conValoresClasicos(redPequena());
  red.construirRemonte(0, 3);
  const p = red.abrirPista(3, 0, 'azul');
  expect(red.dificultad(p)).toBe(1);
  return red;
}

describe('Colores, niveles y pistas forzadas', () => {
  it('el nivel de cada color', () => {
    expect(['verde', 'azul', 'roja', 'negra'].map((c) => nivelDe(c as never))).toEqual([0, 1, 2, 3]);
  });

  it('una pista es forzada si su pendiente entra en la banda del color siguiente', () => {
    const b = { verde: [0.05, 0.2], azul: [0.13, 0.3], roja: [0.22, 0.42], negra: [0.35, 0.6] } as const;
    expect(pistaForzada('verde', 0.1, b)).toBe(false);
    expect(pistaForzada('verde', 0.15, b)).toBe(true); // > 0,13, mínimo de la azul
    expect(pistaForzada('azul', 0.25, b)).toBe(true);
    expect(pistaForzada('roja', 0.3, b)).toBe(false);
    expect(pistaForzada('negra', 0.59, b)).toBe(false);
    expect(pistaForzada('azul', 0.2, BANDAS_CLASICAS)).toBe(false); // sin solape, nunca
  });
});

describe('Dificultad efectiva y viabilidad por nivel', () => {
  it('una pista unida a otra más difícil hereda su dificultad (el tramo común manda)', () => {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    const a = red.abrirPista(3, 0, 'azul');
    // Pista fingida de color verde que comparte tramo con la azul.
    const b = { ...a, id: red.pistas.length, color: 'verde' as const, compartido: { inicio: 0, fin: 10, pista: a.id, inicioPista: 0 } };
    red.pistas.push(b);
    expect(red.dificultad(b)).toBe(1);
    expect(red.dificultad({ ...b, compartido: null })).toBe(0);
  });

  it('con solo una bajada azul, la cima es viable para azules y más, no para verdes', () => {
    const red = redAzul();
    const v = red.viablesPorNivel();
    expect(v[0].has(3)).toBe(false);
    expect(v[1].has(3) && v[2].has(3) && v[3].has(3)).toBe(true);
    for (const n of [0, 1, 2, 3]) expect(v[n].has(0)).toBe(true); // las bases siempre
  });
});

describe('Esquiadores con nivel', () => {
  it('llegan en la proporción de la mezcla', () => {
    const red = redAzul();
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 0.5, 0, 0.5], poblacionMaxima: 1000, llegadasPorMinuto: 600 }, ENTRADA, crearAzar(3));
    correr(sim, 30);
    const niveles = [...sim.perfiles.values()].map((p) => p.nivel);
    expect(niveles.length).toBeGreaterThan(100);
    expect(new Set(niveles)).toEqual(new Set([1, 3]));
    const azules = niveles.filter((n) => n === 1).length / niveles.length;
    expect(azules).toBeGreaterThan(0.4);
    expect(azules).toBeLessThan(0.6);
  });

  it('un verde sin bajadas de su nivel no viene: la afluencia es menor, pero no cuenta como ido', () => {
    const red = redAzul();
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [1, 0, 0, 0] }, ENTRADA, crearAzar(1));
    correr(sim, 30);
    expect(sim.poblacion).toBe(0);
    expect(sim.seFueron).toBe(0);
    expect(sim.noVinieron).toBeGreaterThan(0);
  });

  it('con una mezcla de verdes y azules sin bajada verde, solo vienen los azules', () => {
    const red = redAzul();
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0.5, 0.5, 0, 0], poblacionMaxima: 1000, llegadasPorMinuto: 600 }, ENTRADA, crearAzar(4));
    correr(sim, 20);
    const niveles = [...sim.perfiles.values()].map((p) => p.nivel);
    expect(niveles.length).toBeGreaterThan(50);
    expect(niveles.every((n) => n === 1)).toBe(true);
    expect(sim.noVinieron / (sim.noVinieron + niveles.length)).toBeGreaterThan(0.35);
  });

  it('nadie baja por una pista más difícil que su nivel', () => {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    red.abrirPista(2, 1, 'azul');
    red.abrirPista(3, 0, 'azul');
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0.25, 0.25, 0.25, 0.25] }, ENTRADA, crearAzar(7));
    correr(sim, 90, () => {
      for (const e of sim.esquiadores.values()) {
        if (e.estado === 'pista') expect(red.dificultad(red.pistas[e.pista])).toBeLessThanOrEqual(sim.perfiles.get(e.id)!.nivel);
      }
    });
  });

  it('en pistas de su nivel se mantienen; en pistas fáciles se aburren y acaban yéndose', () => {
    const azules = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 1, 0, 0] }, ENTRADA, crearAzar(2));
    correr(azules, 120);
    expect(azules.seFueron).toBe(0);
    for (const p of azules.perfiles.values()) expect(p.diversion).toBe(1);

    const negros = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 0, 0, 1] }, ENTRADA, crearAzar(2));
    let minimo = 1;
    // Cada vuelta dura unos 45 s y hacen falta tres bajadas para bajar del umbral.
    correr(negros, 240, () => negros.perfiles.forEach((p) => (minimo = Math.min(minimo, p.diversion))));
    expect(minimo).toBeLessThan(1); // dos niveles por debajo: −0,3 por bajada
    expect(negros.seFueron).toBeGreaterThan(0);
  });
});
