import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { copiarBandas } from '../src/core/colores';
import { Red } from '../src/core/red';
import { Simulacion, pesoPista, type ParametrosSimulacion } from '../src/core/simulacion';
import { abrir, conValoresClasicos, REGLAS, redPequena } from './apoyo';

/** Plaza 0 y cima 1 en una ladera de pendiente 0,3, con parámetros de pista fijados aquí: caben azul y verde. */
function ladera(): Red {
  return new Red(
    [
      { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
      { id: 1, tipo: 'cima', x: 0, y: 0, cota: 2400 },
    ],
    {
      ...REGLAS,
      pista: {
        ...REGLAS.pista,
        bandas: copiarBandas({ verde: [0.05, 0.2], azul: [0.13, 0.3], roja: [0.22, 0.42], negra: [0.35, 0.6] }),
        sinuosidadMaxima: 1.55,
        pendienteObjetivo: 'cercana',
      },
    },
  );
}

/** Parámetros fijados aquí, no los provisionales de config.ts. */
const P: ParametrosSimulacion = {
  velocidadRemonte: 160,
  intervaloBolitas: 0.9,
  capacidadBolita: 1,
  ...CONFIG.esquiador,
  // Caudal constante fijado aquí (la curva de afluencia no se usa en la prueba).
  mezclaNiveles: [0.35, 0.35, 0.2, 0.1],
  llegadasPorMinuto: 30,
  aguanteMinimo: 1e6,
  aguanteMaximo: 1e6,
  contentoInicial: 1000, // que nadie se vaya: aquí solo se mira qué eligen
  memoriaVariedad: 2,
  gustoPorDiferencia: [1, 0.5, 0.15, 0.03],
  factorRepeticion: 0.3,
  descuentoPorRemonte: 0.85,
  aforoCola: 1000,
  tiempoAnillo: 20,
};
const ENTRADA = { x: 150, y: 3100 };
const correr = (sim: Simulacion, s: number, alPaso: () => void) => {
  for (let t = 0; t < s; t += 1 / 60) {
    sim.paso(1 / 60);
    alPaso();
  }
};

describe('Elección de ruta por nivel, variedad y cola', () => {
  it('peso: una pista más difícil que su nivel no se elige nunca; con colas iguales, la suya pesa más que una más fácil', () => {
    expect(pesoPista(1, 2, false, 0, P)).toBe(0); // azul en una roja
    expect(pesoPista(0, 3, false, 0, P)).toBe(0); // verde en una negra
    const suya = pesoPista(2, 2, false, 3, P);
    const unaMenos = pesoPista(2, 1, false, 3, P);
    const dosMenos = pesoPista(2, 0, false, 3, P);
    expect(suya).toBeGreaterThan(unaMenos);
    expect(unaMenos).toBeGreaterThan(dosMenos);
    expect(dosMenos).toBeGreaterThan(0);
    // La repetición pesa menos, pero no descarta; la cola también resta.
    expect(pesoPista(2, 2, true, 3, P)).toBeLessThan(suya);
    expect(pesoPista(2, 2, true, 3, P)).toBeGreaterThan(0);
    expect(pesoPista(2, 2, false, 10, P)).toBeLessThan(suya);
  });

  it('en la simulación nadie baja por una más difícil, y con una azul y una verde desde la misma cima los azules prefieren la azul', () => {
    const red = ladera();
    red.construirRemonte(0, 1);
    const azul = red.abrirPista(1, 0, 'azul', 1);
    const verde = red.abrirPista(1, 0, 'verde', -1);
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0.5, 0.5, 0, 0] }, ENTRADA, crearAzar(3));
    const cuenta = { azulEnAzul: 0, azulEnVerde: 0, verdeEnAzul: 0 };
    const enPista = new Map<number, number | null>();
    correr(sim, 300, () => {
      for (const e of sim.esquiadores.values()) {
        const ahora = e.estado === 'pista' ? e.pista : null;
        if (ahora !== null && enPista.get(e.id) == null) {
          const nivel = sim.perfiles.get(e.id)!.nivel;
          if (nivel === 0 && ahora === azul.id) cuenta.verdeEnAzul++;
          if (nivel === 1) ahora === azul.id ? cuenta.azulEnAzul++ : cuenta.azulEnVerde++;
        }
        enPista.set(e.id, ahora);
      }
    });
    expect(cuenta.verdeEnAzul).toBe(0);
    expect(cuenta.azulEnAzul + cuenta.azulEnVerde).toBeGreaterThan(30);
    expect(cuenta.azulEnAzul / (cuenta.azulEnAzul + cuenta.azulEnVerde)).toBeGreaterThan(0.55);
    expect(cuenta.azulEnVerde).toBeGreaterThan(0); // preferencia, no filtro: a veces baja por la fácil
    void verde;
  });

  it('el gusto de un remonte es el de lo mejor tras su llegada, con un descuento por cada remonte más', () => {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 2);
    red.construirRemonte(2, 3);
    abrir(red, 3, 0); // azul con los valores clásicos
    const g = [1, 0.5, 0.15, 0.03];
    expect(red.mejorGustoDesde(3, 1, g, 0.85)).toBe(1); // azul en su pista
    expect(red.mejorGustoDesde(2, 1, g, 0.85)).toBeCloseTo(0.85, 10); // un remonte más
    expect(red.mejorGustoDesde(0, 1, g, 0.85)).toBeCloseTo(0.85 * 0.85, 10); // dos
    expect(red.mejorGustoDesde(3, 3, g, 0.85)).toBeCloseTo(0.15, 10); // negro: dos niveles por debajo
  });

  it('equilibrio: en un punto con pista de su nivel y remonte hacia otra de su nivel, se usan los dos', () => {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 2);
    const arriba = red.construirRemonte(2, 3);
    const baja = red.abrirPista(2, 1, 'azul');
    red.abrirPista(3, 0, 'azul');
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 1, 0, 0] }, ENTRADA, crearAzar(5));
    let porPista = 0;
    let subieron = 0;
    const antes = new Map<number, string>();
    correr(sim, 300, () => {
      for (const e of sim.esquiadores.values()) {
        const ahora = e.estado === 'pista' ? `p${e.pista}` : e.estado === 'cola' || e.estado === 'remonte' ? `r${e.remonte}` : 'a';
        if (ahora !== antes.get(e.id)) {
          if (ahora === `p${baja.id}`) porPista++;
          if (ahora === `r${arriba.id}`) subieron++;
        }
        antes.set(e.id, ahora);
      }
    });
    const total = porPista + subieron;
    expect(total).toBeGreaterThan(30);
    expect(porPista / total).toBeGreaterThan(0.2);
    expect(subieron / total).toBeGreaterThan(0.2);
  });
});
