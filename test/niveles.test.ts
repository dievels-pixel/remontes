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
  // Caudal constante fijado aquí (la curva de afluencia no se usa en la prueba).
  llegadasPorMinuto: 30,
  mezclaNiveles: [0.35, 0.35, 0.2, 0.1],
  // Elección de ruta fijada aquí (no los valores provisionales de config.ts).
  gustoPorDiferencia: [1, 0.5, 0.15, 0.03],
  factorRepeticion: 0.3,
  descuentoPorRemonte: 0.85,
  // Valores fijos para la prueba, no los provisionales de config.ts.
  aguanteMinimo: 180,
  aguanteMaximo: 360,
  contentoInicial: 3,
  memoriaVariedad: 2,
  aforoCola: 6,
  tiempoAnillo: 20,
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
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 0.5, 0, 0.5], llegadasPorMinuto: 600, aforoCola: 1000 }, ENTRADA, crearAzar(3));
    correr(sim, 30);
    const niveles = [...sim.perfiles.values()].map((p) => p.nivel);
    expect(niveles.length).toBeGreaterThan(100);
    expect(new Set(niveles)).toEqual(new Set([1, 3]));
    const azules = niveles.filter((n) => n === 1).length / niveles.length;
    expect(azules).toBeGreaterThan(0.4);
    expect(azules).toBeLessThan(0.6);
  });

  it('un verde sin bajadas de su nivel viene igual (afluencia exógena) y se va enfadado al llegar', () => {
    const red = redAzul();
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [1, 0, 0, 0] }, ENTRADA, crearAzar(1));
    correr(sim, 30);
    expect(sim.poblacion).toBe(0);
    expect(sim.quejas.sinPistas).toBeGreaterThan(0);
    expect(sim.marchasEnfadadas.length).toBeGreaterThan(0);
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

  it('tabla de aburrimiento: una pista un nivel por debajo no aburre; dos niveles, un punto por bajada', () => {
    // Rojos en una azul (un nivel por debajo): nadie se aburre.
    // Sin colas saturadas (también restan contento): aquí solo se mira el aburrimiento.
    const rojos = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 0, 1, 0], aforoCola: 1000 }, ENTRADA, crearAzar(2));
    correr(rojos, 150);
    expect(rojos.quejas.aburrimiento).toBe(0);
    for (const p of rojos.perfiles.values()) expect(p.contento).toBe(3);
    // Negros en una azul (dos niveles): −1 por bajada; a la tercera se van enfadados.
    const negros = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 0, 0, 1] }, ENTRADA, crearAzar(2));
    let minimo = 3;
    correr(negros, 170, () => negros.perfiles.forEach((p) => (minimo = Math.min(minimo, p.contento))));
    expect(minimo).toBeLessThan(3);
    expect(negros.quejas.aburrimiento).toBeGreaterThan(0);
  });

  it('se van cansados al agotar el aguante, sin queja', () => {
    const sim = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 1, 0, 0], aguanteMinimo: 40, aguanteMaximo: 60 }, ENTRADA, crearAzar(3));
    correr(sim, 150);
    expect(sim.cansados).toBeGreaterThan(0);
    expect(sim.enfadados).toBe(0);
  });
});

describe('Contento y variedad', () => {
  it('una pista de su nivel recupera un punto solo si no está entre las últimas', () => {
    // Red con dos azules desde la cima: 3 → 0 por los dos lados.
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    const a = red.abrirPista(3, 0, 'azul', 1);
    red.abrirPista(3, 0, 'azul', -1);
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 1, 0, 0], memoriaVariedad: 1 }, ENTRADA, crearAzar(5));
    const contentar = (sim as unknown as { contentar: (id: number, p: unknown) => boolean }).contentar.bind(sim);
    sim.perfiles.set(99, { nivel: 1, contento: 2, cansadoEn: 1e9, recientes: [] });
    contentar(99, a);
    expect(sim.perfiles.get(99)!.contento).toBe(3); // variedad: +1
    sim.perfiles.get(99)!.contento = 2;
    contentar(99, a);
    expect(sim.perfiles.get(99)!.contento).toBe(2); // la repite: no recupera
  });

  it('entre las pistas válidas prefiere la que no ha usado hace poco: con factor 0 nunca repite; con 0,3, poco', () => {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    const a = red.abrirPista(3, 0, 'azul', 1);
    const b = red.abrirPista(3, 0, 'azul', -1);
    // Con memoria de 1, dos pistas bastan para variar siempre.
    const medir = (factorRepeticion: number) => {
      const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 1, 0, 0], memoriaVariedad: 1, factorRepeticion, aguanteMinimo: 1e6, aguanteMaximo: 1e6 }, ENTRADA, crearAzar(6));
      const ultima = new Map<number, number>();
      let repeticiones = 0;
      let bajadas = 0;
      const enPista = new Map<number, number | null>();
      correr(sim, 200, () => {
        for (const e of sim.esquiadores.values()) {
          const ahora = e.estado === 'pista' ? e.pista : null;
          if (ahora !== null && enPista.get(e.id) == null) {
            // Empieza una bajada.
            if (ultima.get(e.id) === ahora) repeticiones++;
            if (ultima.has(e.id)) bajadas++;
            ultima.set(e.id, ahora);
          }
          enPista.set(e.id, ahora);
        }
      });
      expect([a.id, b.id].every((id) => [...ultima.values()].includes(id))).toBe(true);
      return { repeticiones, bajadas };
    };
    const sinRepetir = medir(0);
    expect(sinRepetir.bajadas).toBeGreaterThan(20);
    expect(sinRepetir.repeticiones).toBe(0);
    const conFactor = medir(0.3);
    // Esperado: 0,3 / 1,3 ≈ 23 % de repeticiones, con margen.
    expect(conFactor.repeticiones / conFactor.bajadas).toBeGreaterThan(0);
    expect(conFactor.repeticiones / conFactor.bajadas).toBeLessThan(0.4);
  });

});

describe('Cola saturada', () => {
  it('por encima del aforo el anillo se llena; lleno, toda la cola pierde un punto y el anillo vuelve a 0', () => {
    const red = redAzul();
    const sim = new Simulacion(red, { ...P, mezclaNiveles: [0, 1, 0, 0], llegadasPorMinuto: 600, aforoCola: 3, tiempoAnillo: 5, aguanteMinimo: 1e6, aguanteMaximo: 1e6 }, ENTRADA, crearAzar(8));
    // Hasta justo antes de llenarse el anillo por primera vez.
    let anterior = 0;
    let colaAntes: number[] = [];
    for (let t = 0; t < 30; t += DT) {
      colaAntes = [...(sim.colas[0] ?? [])];
      const contentos = new Map(colaAntes.map((id) => [id, sim.perfiles.get(id)!.contento]));
      anterior = sim.anillos[0] ?? 0;
      sim.paso(DT);
      if (anterior > 0.9 && (sim.anillos[0] ?? 0) < 0.1) {
        // Se ha llenado en este paso: los que esperaban pierden un punto.
        for (const id of colaAntes) {
          const p = sim.perfiles.get(id);
          if (p && sim.esquiadores.get(id)?.estado === 'cola') expect(p.contento).toBe(contentos.get(id)! - 1);
        }
        expect(sim.anillos[0]).toBeLessThan(0.1);
        break;
      }
    }
    expect(anterior).toBeGreaterThan(0.9);
    // Si sigue saturada, se llena otra vez: al tercer anillo se van enfadados.
    correr(sim, 30);
    expect(sim.quejas.cola).toBeGreaterThan(0);
    for (const p of sim.perfiles.values()) expect(p.contento).toBeGreaterThan(0);
  });

  it('con la cola por debajo del aforo el anillo no se llena', () => {
    const sim = new Simulacion(redAzul(), { ...P, mezclaNiveles: [0, 1, 0, 0], llegadasPorMinuto: 10, aforoCola: 50 }, ENTRADA, crearAzar(9));
    correr(sim, 60);
    expect(sim.anillos[0]).toBe(0);
    expect(sim.quejas.cola).toBe(0);
  });
});
