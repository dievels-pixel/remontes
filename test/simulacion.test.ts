import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { redPequena } from './apoyo';

const P: ParametrosSimulacion = {
  velocidadRemonte: CONFIG.remonte.velocidad,
  intervaloBolitas: CONFIG.remonte.intervaloBolitas,
  capacidadBolita: CONFIG.remonte.capacidad,
  ...CONFIG.esquiador,
};
const ENTRADA = { x: 150, y: 1100 };
const DT = 1 / 60;

function correr(sim: Simulacion, segundos: number, alPaso?: () => void) {
  for (let t = 0; t < segundos; t += DT) {
    sim.paso(DT);
    alPaso?.();
  }
}

describe('Simulación', () => {
  it('sin remontes en servicio no entra nadie ni salen bolitas', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(1));
    correr(sim, 30);
    expect(sim.poblacion).toBe(0);
    expect(sim.bolitas[0]).toEqual([]);
  });

  it('con remonte y pista los esquiadores suben, bajan y completan bajadas', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.abrirPista(3, 0);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(1));
    const vistos = new Set<string>();
    correr(sim, 60, () => sim.esquiadores.forEach((e) => vistos.add(e.estado)));
    expect(sim.poblacion).toBeGreaterThan(0);
    expect(sim.poblacion).toBeLessThanOrEqual(P.poblacionMaxima);
    expect(sim.bajadasCompletadas).toBeGreaterThan(0);
    expect(vistos).toEqual(new Set(['andando', 'cola', 'remonte', 'pista']));
  });

  it('nadie queda atascado en una red con varios caminos', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.abrirPista(2, 1); // baja a la base sin remonte: tendrá que cruzar la plaza
    red.construirRemonte(2, 3);
    red.abrirPista(3, 2);
    red.abrirPista(3, 0);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(3));
    correr(sim, 120, () => sim.esquiadores.forEach((e) => expect(e.estado).not.toBe('espera')));
    // Todos los esquiadores están en un solo sitio: o en una cola o fuera de ellas.
    const enCola = sim.colas.flat();
    expect(new Set(enCola).size).toBe(enCola.length);
    for (const id of enCola) expect(sim.esquiadores.get(id)?.estado).toBe('cola');
    const enBolitas = sim.bolitas.flat().flatMap((b) => b.pasajeros);
    for (const id of enBolitas) expect(sim.esquiadores.get(id)?.estado).toBe('remonte');
  });

  it('las bolitas salen con separación fija y no superan la capacidad', () => {
    const red = redPequena();
    const r = red.construirRemonte(0, 3);
    red.abrirPista(3, 0);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(5));
    correr(sim, 3);
    const b = sim.bolitas[r.id];
    expect(b.length).toBeGreaterThan(1);
    for (let i = 1; i < b.length; i++) {
      expect(b[i - 1].recorrido - b[i].recorrido).toBeCloseTo(P.velocidadRemonte * P.intervaloBolitas, 6);
      expect(b[i].pasajeros.length).toBeLessThanOrEqual(P.capacidadBolita);
    }
  });

  it('la velocidad en pista crece con la pendiente', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    const empinada = red.abrirPista(3, 0);
    const suave = red.abrirPista(2, 1);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(1));
    expect(empinada.pendiente).toBeGreaterThan(suave.pendiente);
    expect(sim.velocidadEnPista(empinada)).toBeGreaterThan(sim.velocidadEnPista(suave));
  });

  it('reconoce como contiguas las bases cercanas', () => {
    const sim = new Simulacion(redPequena(), P, ENTRADA, crearAzar(1));
    expect(sim.basesContiguas(0)).toEqual([1]);
    expect(new Simulacion(redPequena(), { ...P, distanciaBasesContiguas: 100 }, ENTRADA, crearAzar(1)).basesContiguas(0)).toEqual([]);
  });

  it('al acabar una bajada algunos esquiadores cambian a la base contigua', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    red.abrirPista(3, 0);
    red.abrirPista(2, 1);
    const sim = new Simulacion(red, P, ENTRADA, crearAzar(2));
    let cambios = 0;
    correr(sim, 120, () =>
      sim.esquiadores.forEach((e) => {
        if (e.estado === 'andando' && (e.origen.x !== ENTRADA.x || e.origen.y !== ENTRADA.y)) cambios++;
      }),
    );
    expect(cambios).toBeGreaterThan(0);
  });

  it('sin bases contiguas nadie cambia de base si la suya tiene remonte', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    red.abrirPista(3, 0);
    red.abrirPista(2, 1);
    const sim = new Simulacion(red, { ...P, distanciaBasesContiguas: 100 }, ENTRADA, crearAzar(2));
    correr(sim, 120, () =>
      sim.esquiadores.forEach((e) => {
        if (e.estado === 'andando') expect(e.origen).toEqual(ENTRADA);
      }),
    );
  });
});
