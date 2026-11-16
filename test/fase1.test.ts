// Fase 1 del acabado: elección de ruta que reparte a la gente por la
// estación, periodo de gracia del medidor, afluencia acelerada, indicadores
// y jugadores automáticos.
import { describe, expect, it } from 'vitest';
import { ESTRATEGIAS } from '../src/bots/jugadores';
import { jugarPartida } from '../src/bots/partida';
import { tasaEn } from '../src/core/afluencia';
import { crearAzar } from '../src/core/azar';
import { colorQueFalta, fracciones, kmPorColor } from '../src/core/indicadores';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { Juego } from '../src/juego';
import { cargarMapaPrueba, COLAS_CLASICAS, conValoresClasicos, ESQUIADOR_CLASICO, mapaInicial, redPequena, REMONTE_CLASICO } from './apoyo';

const P: ParametrosSimulacion = {
  ...REMONTE_CLASICO,
  ...ESQUIADOR_CLASICO,
  ...COLAS_CLASICAS,
  llegadasPorMinuto: 40,
  mezclaNiveles: [0, 1, 0, 0],
  aguanteMinimo: 1e6,
  aguanteMaximo: 1e6,
  contentoInicial: 1000,
  aforoCola: 1000,
};
const ENTRADA = { x: 150, y: 3100 };
const DT = 1 / 30;

describe('Elección de ruta: la gente sube al sector alto', () => {
  // Base → medio → cima, todo azul: una pista del medio a la base y tres
  // desde la cima (dos al medio y una a la otra base).
  function red() {
    const r = conValoresClasicos(redPequena());
    r.construirRemonte(0, 2);
    r.abrirPista(2, 0, 'azul');
    r.construirRemonte(2, 3);
    r.abrirPista(3, 2, 'azul');
    r.abrirPista(3, 2, 'azul');
    r.abrirPista(3, 1, 'azul');
    return r;
  }
  /** Bajadas empezadas desde la cima y desde el punto medio. */
  function medir(extra: Partial<ParametrosSimulacion>) {
    const r = red();
    const sim = new Simulacion(r, { ...P, ...extra }, ENTRADA, crearAzar(5));
    const antes = new Map<number, number>();
    let cima = 0;
    let medio = 0;
    for (let t = 0; t < 240; t += DT) {
      sim.paso(DT);
      for (const e of sim.esquiadores.values()) {
        if (e.estado !== 'pista') {
          antes.delete(e.id);
          continue;
        }
        if (antes.get(e.id) === e.pista) continue;
        antes.set(e.id, e.pista);
        if (r.pistas[e.pista].desde === 3) cima++;
        else medio++;
      }
    }
    return cima / (cima + medio);
  }

  it('un sector con más terreno atrae más: la mayoría de las bajadas salen de la cima', () => {
    const conSuma = medir({ descuentoPorRemonte: 0.7, factorNovedad: 2.5 });
    expect(conSuma).toBeGreaterThan(0.5);
  });

  it('con más descuento por remonte sube menos gente', () => {
    expect(medir({ descuentoPorRemonte: 0.1 })).toBeLessThan(medir({ descuentoPorRemonte: 1 }));
  });

  it('una pista nueva pesa más, una ya hecha pesa lo normal y una reciente, menos', () => {
    const r = red();
    const sim = new Simulacion(r, { ...P, factorNovedad: 2.5, factorRepeticion: 0.4 }, ENTRADA, crearAzar(9));
    const pista = r.pistas[0];
    const perfil = { nivel: 1, contento: 3, cansadoEn: 1e9, recientes: [] as number[], variedades: 0, hechas: new Set<number>() };
    expect(sim.gustoPista(perfil, pista)).toBeCloseTo(2.5);
    perfil.hechas.add(pista.id);
    expect(sim.gustoPista(perfil, pista)).toBeCloseTo(1);
    perfil.recientes.push(pista.id);
    expect(sim.gustoPista(perfil, pista)).toBeCloseTo(0.4);
    // Más difícil que su nivel: nunca.
    expect(sim.gustoPista({ ...perfil, nivel: 0 }, pista)).toBe(0);
  });
});

describe('Medidor de quejas: periodo de gracia', () => {
  it('durante la gracia los enfadados se cuentan pero no llenan el medidor', () => {
    const r = conValoresClasicos(redPequena());
    r.construirRemonte(0, 3);
    r.abrirPista(3, 0, 'azul');
    // Solo llegan verdes y no hay verdes: todos se van enfadados al llegar.
    const sim = new Simulacion(r, { ...P, mezclaNiveles: [1, 0, 0, 0], llegadasPorMinuto: 60, medidor: { capacidad: 5, vaciadoPorMinuto: 0, gracia: 20 } }, ENTRADA, crearAzar(1));
    for (let t = 0; t < 19; t += DT) sim.paso(DT);
    expect(sim.enfadados).toBeGreaterThan(10);
    expect(sim.medidorQuejas).toBe(0);
    expect(sim.terminada).toBe(false);
    for (let t = 0; t < 10; t += DT) sim.paso(DT);
    expect(sim.terminada).toBe(true);
    expect(sim.tiempoAbierta).toBeGreaterThan(20);
  });
});

describe('Afluencia acelerada', () => {
  it('suma el cuadrado del escalón', () => {
    const a = { intervalo: 60, retraso: 0, tasaInicial: 6, incremento: 2, aceleracion: 0.5, mezcla: [] };
    expect(tasaEn(0, a)).toBe(6);
    expect(tasaEn(60, a)).toBe(6 + 2 + 0.5);
    expect(tasaEn(600, a)).toBe(6 + 20 + 50);
    expect(tasaEn(600, { ...a, aceleracion: undefined })).toBe(26);
  });
});

describe('Indicadores', () => {
  it('kilómetros de pista activa por color y color que falta', () => {
    const r = conValoresClasicos(redPequena());
    r.construirRemonte(0, 3);
    const p = r.abrirPista(3, 0, 'azul');
    const km = kmPorColor(r);
    expect(km[1]).toBeCloseTo(p.trazado.longitud / 1000);
    expect(km[0] + km[2] + km[3]).toBe(0);
    expect(fracciones(km)).toEqual([0, 1, 0, 0]);
    expect(fracciones([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    // Llegan verdes y azules a partes iguales y todo es azul: faltan verdes.
    expect(colorQueFalta(km, [0.5, 0.5, 0, 0])).toBe(0);
    expect(colorQueFalta(km, [0, 1, 0, 0])).toBeNull();
  });
});

describe('Acciones del jugador en Juego', () => {
  it('construir, abrir pista y mejorar devuelven por qué no se puede', () => {
    const j = new Juego(mapaInicial());
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const destino = j.red.nodos.find((n) => n.cota > base.cota && j.red.puedeConstruirRemonte(base.id, n.id) === 'ok')!;
    j.sim.monedas = 0;
    expect(j.construirRemonte(base.id, destino.id)).toBe('sin-monedas');
    expect(j.construirRemonte(destino.id, base.id)).not.toBe('ok');
    j.sim.monedas = 1e6;
    expect(j.construirRemonte(base.id, destino.id)).toBe('ok');
    const e = j.evaluarPista(destino.id, base.id);
    expect(e.motivo).toBe('ok');
    const color = e.motivo === 'ok' ? e.colores.find((c) => c.factible)!.color : 'verde';
    const no = e.motivo === 'ok' ? e.colores.find((c) => !c.factible)?.color : undefined;
    if (no) expect(j.abrirPista(destino.id, base.id, no)).toBe(false);
    expect(j.abrirPista(destino.id, base.id, color)).toBe(true);
    expect(j.red.enServicio(j.red.remontes[0])).toBe(true);
    expect(j.mejorarRemonte(0)).toBe('ok');
    expect(j.mejorarRemonte(0)).toBe('ok');
    expect(j.mejorarRemonte(0)).toBe('maximo');
    expect(j.precioMejoraDe(0)).toBeNull();
  });
});

describe('Jugadores automáticos', () => {
  const mapa = cargarMapaPrueba('gran-dominio');
  for (const nombre of ['razonable', 'torpe', 'soloAmplia']) {
    it(`${nombre}: juega seis minutos sin perder, con remontes en servicio`, () => {
      const r = jugarPartida(mapa, ESTRATEGIAS[nombre], { semilla: 1, minutosMaximos: 6, dt: 1 / 10 });
      expect(r.terminada).toBe(false);
      expect(r.remontes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
      expect(r.pistas.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
      expect(r.minutos).toHaveLength(6);
      expect(r.satisfechos + r.enfadados + r.minutos[5].gente).toBeGreaterThan(10);
    });
  }
});
