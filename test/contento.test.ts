// Pistas forzadas (cuentan como repetidas) y medidor de quejas (derrota).
import { describe, expect, it } from 'vitest';
import { crearAzar } from '../src/core/azar';
import type { Red } from '../src/core/red';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { conValoresClasicos, redPequena } from './apoyo';

// Parámetros propios de la prueba, no los de config.ts.
const P: ParametrosSimulacion = {
  velocidadRemonte: 160,
  intervaloBolitas: 0.9,
  capacidadBolita: 1,
  llegadasPorMinuto: 30,
  mezclaNiveles: [0, 1, 0, 0],
  velocidadAndando: 60,
  distanciaBasesContiguas: 400,
  penalizacionAndar: 3,
  velocidadBasePista: 70,
  factorPendiente: 380,
  aguanteMinimo: 1e6,
  aguanteMaximo: 1e6,
  contentoInicial: 3,
  memoriaVariedad: 2,
  gustoPorDiferencia: [1, 0.5, 0.15, 0.03],
  factorRepeticion: 0.3,
  descuentoPorRemonte: 0.85,
  aforoCola: 1000,
  tiempoAnillo: 20,
};
const ENTRADA = { x: 150, y: 3100 };
const DT = 1 / 60;
const correr = (sim: Simulacion, s: number, alPaso?: () => void) => {
  for (let t = 0; t < s; t += DT) {
    sim.paso(DT);
    alPaso?.();
  }
};

/** Remonte 0 → 3 y una azul de vuelta; `forzada` mueve la banda roja para que lo sea. */
function redAzul(forzada: boolean): Red {
  const red = conValoresClasicos(redPequena());
  red.construirRemonte(0, 3);
  const p = red.abrirPista(3, 0, 'azul');
  // Bandas propias (las clásicas son compartidas entre pruebas).
  if (forzada) red.reglas.pista.bandas = { ...red.reglas.pista.bandas, roja: [0, red.reglas.pista.bandas.roja[1]] };
  expect(red.forzada(p)).toBe(forzada);
  return red;
}

describe('Pistas forzadas', () => {
  // Dos pistas en la memoria de variedad y una sola pista: tras la primera
  // bajada, solo la primera vez hay variedad. Con memoria 0 todas lo serían.
  const medir = (forzada: boolean) => {
    const sim = new Simulacion(redAzul(forzada), { ...P, memoriaVariedad: 0 }, ENTRADA, crearAzar(4));
    // Cada uno entra con 2 puntos: una bajada con variedad le devuelve el tercero.
    const tocados = new Set<number>();
    let bajo = 0;
    correr(sim, 120, () => {
      for (const [id, p] of sim.perfiles) {
        if (!tocados.has(id)) {
          tocados.add(id);
          p.contento = 2;
        }
      }
    });
    for (const p of sim.perfiles.values()) if (p.contento < 3) bajo++;
    return { sim, bajo, total: sim.perfiles.size };
  };

  it('una pista forzada de su nivel no recupera contento, pero tampoco lo resta', () => {
    const normal = medir(false);
    const forzada = medir(true);
    expect(normal.sim.bajadasCompletadas).toBeGreaterThan(20);
    expect(forzada.sim.bajadasCompletadas).toBeGreaterThan(20);
    // Sin forzar, quien ya ha bajado ha recuperado el punto; forzada, nadie.
    expect(normal.bajo).toBeLessThan(normal.total);
    expect(forzada.bajo).toBe(forzada.total);
    for (const p of forzada.sim.perfiles.values()) expect(p.contento).toBe(2);
    expect(forzada.sim.enfadados).toBe(0);
  });

  it('al elegir, una forzada pesa como una repetida', () => {
    const normal = redAzul(false);
    const forzada = redAzul(true);
    expect(normal.mejorGustoDesde(3, 1, P.gustoPorDiferencia, 1, 0.3)).toBe(1);
    expect(forzada.mejorGustoDesde(3, 1, P.gustoPorDiferencia, 1, 0.3)).toBeCloseTo(0.3);
  });
});

describe('Medidor de quejas', () => {
  // Verdes en una estación que solo tiene una azul: cada uno se va enfadado al llegar.
  const sinVerdes = (medidor: ParametrosSimulacion['medidor']) =>
    new Simulacion(redAzul(false), { ...P, mezclaNiveles: [1, 0, 0, 0], llegadasPorMinuto: 60, medidor }, ENTRADA, crearAzar(1));

  it('cada enfadado lo llena y, lleno, se acaba la partida y la simulación se para', () => {
    const sim = sinVerdes({ capacidad: 3, vaciadoPorMinuto: 0 });
    correr(sim, 2.5);
    expect(sim.enfadados).toBe(2);
    expect(sim.fraccionQuejas).toBeCloseTo(2 / 3);
    expect(sim.terminada).toBe(false);
    correr(sim, 1);
    expect(sim.terminada).toBe(true);
    const t = sim.tiempo;
    correr(sim, 5);
    expect(sim.tiempo).toBe(t);
    expect(sim.enfadados).toBe(3);
    // Todos en la plaza: ese es el cuello de botella.
    expect(sim.cuelloDeBotella()).toBe(-1);
  });

  it('se vacía solo con el tiempo', () => {
    const sim = sinVerdes({ capacidad: 100, vaciadoPorMinuto: 30 });
    correr(sim, 3.5);
    const lleno = sim.medidorQuejas;
    expect(lleno).toBeGreaterThan(1.5); // 3 enfadados menos lo que se ha vaciado
    sim.p.llegadasPorMinuto = 0;
    correr(sim, 2);
    expect(sim.medidorQuejas).toBeCloseTo(lleno - 1, 1);
  });

  it('sin medidor la partida no termina', () => {
    const sim = sinVerdes(undefined);
    correr(sim, 10);
    expect(sim.enfadados).toBeGreaterThan(5);
    expect(sim.terminada).toBe(false);
  });
});
