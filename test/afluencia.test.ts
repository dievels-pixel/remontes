import { describe, expect, it } from 'vitest';
import {
  escalonEfectivo,
  escalonVisible,
  mezclaEn,
  mezclaEnMinuto,
  tasaEn,
  trazarCarretera,
  type ParametrosAfluencia,
} from '../src/core/afluencia';
import { crearAzar } from '../src/core/azar';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { abrir, redPequena } from './apoyo';

// Parámetros propios de la prueba, no los de config.ts.
const A: ParametrosAfluencia = {
  intervalo: 60,
  retraso: 15,
  tasaInicial: 10,
  incremento: 5,
  mezcla: [
    { minuto: 0, pesos: [1, 0, 0, 0] },
    { minuto: 2, pesos: [0, 1, 0, 0] },
  ],
};

describe('curva de afluencia', () => {
  it('sube un escalón por intervalo y la afluencia nueva llega con retraso', () => {
    expect(escalonVisible(0, A)).toBe(0);
    expect(escalonVisible(59.9, A)).toBe(0);
    expect(escalonVisible(60, A)).toBe(1);
    // El edificio aparece a los 60 s; la tasa cambia a los 75 s.
    expect(escalonEfectivo(70, A)).toBe(0);
    expect(tasaEn(74.9, A)).toBe(10);
    expect(tasaEn(75, A)).toBe(15);
    expect(tasaEn(135, A)).toBe(20);
  });

  it('interpola la mezcla entre minutos y la mantiene tras el último', () => {
    expect(mezclaEnMinuto(0, A.mezcla)).toEqual([1, 0, 0, 0]);
    expect(mezclaEnMinuto(1, A.mezcla)).toEqual([0.5, 0.5, 0, 0]);
    expect(mezclaEnMinuto(10, A.mezcla)).toEqual([0, 1, 0, 0]);
    // Cambia a la vez que la tasa: en el escalón efectivo.
    expect(mezclaEn(70, A)).toEqual([1, 0, 0, 0]);
    expect(mezclaEn(75, A)).toEqual([0.5, 0.5, 0, 0]);
  });
});

describe('carretera', () => {
  const plaza = { x: 2000, y: 5780, radio: 200 };
  const c = trazarCarretera(plaza, 4000, 6000);

  it('llega desde el sureste (borde derecho, por debajo de la plaza) hasta el borde de la plaza', () => {
    expect(c[0].x).toBe(4000);
    expect(c[0].y).toBeGreaterThan(plaza.y);
    const fin = c[c.length - 1];
    expect(Math.hypot(fin.x - plaza.x, fin.y - plaza.y)).toBeCloseTo(plaza.radio);
    expect(fin.x).toBeGreaterThan(plaza.x);
    expect(fin.y).toBeGreaterThan(plaza.y);
  });

  it('serpentea sin salirse del mapa', () => {
    for (const p of c) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(4000);
      expect(p.y).toBeLessThanOrEqual(6000);
    }
    // Cruza varias veces la recta que une sus extremos: curvas a uno y otro lado.
    const a = c[0];
    const b = c[c.length - 1];
    const lado = (p: { x: number; y: number }) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    let cambios = 0;
    for (let i = 2; i < c.length - 1; i++) if (lado(c[i]) !== 0 && lado(c[i]) !== lado(c[i - 1])) cambios++;
    expect(cambios).toBeGreaterThanOrEqual(2);
  });
});

describe('simulación con carretera y curva', () => {
  const P: ParametrosSimulacion = {
    velocidadRemonte: 160,
    intervaloBolitas: 0.9,
    capacidadBolita: 1,
    llegadasPorMinuto: 999, // no se usa: manda la curva
    mezclaNiveles: [0, 0, 0, 1], // no se usa: manda la curva
    velocidadAndando: 60,
    distanciaBasesContiguas: 400,
    penalizacionAndar: 3,
    velocidadBasePista: 70,
    factorPendiente: 380,
    aguanteMinimo: 1e6,
    aguanteMaximo: 1e6,
    contentoInicial: 1000,
    memoriaVariedad: 2,
    gustoPorDiferencia: [1, 0.5, 0.15, 0.03],
    factorRepeticion: 0.3,
    descuentoPorRemonte: 0.85,
    aforoCola: 1000,
    tiempoAnillo: 20,
    afluencia: A,
    velocidadCarretera: 100,
  };
  const DT = 1 / 60;
  const correr = (sim: Simulacion, s: number) => {
    for (let t = 0; t < s; t += DT) sim.paso(DT);
  };

  function estacion() {
    const red = redPequena();
    red.construirRemonte(0, 2);
    abrir(red, 2, 0);
    return red;
  }

  it('el reloj de la curva no corre hasta que hay un remonte en servicio', () => {
    const red = redPequena();
    const sim = new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(1));
    correr(sim, 30);
    expect(sim.tiempoAbierta).toBe(0);
    red.construirRemonte(0, 2);
    abrir(red, 2, 0);
    correr(sim, 30);
    expect(sim.tiempoAbierta).toBeCloseTo(30, 1);
  });

  it('las llegadas siguen la curva, no el caudal constante', () => {
    const sim = new Simulacion(estacion(), P, { x: 0, y: 3100 }, crearAzar(2));
    correr(sim, 60);
    // Primer minuto a 10 por minuto.
    expect(sim.poblacion).toBeGreaterThanOrEqual(9);
    expect(sim.poblacion).toBeLessThanOrEqual(10);
    expect(sim.llegadasPorMinuto).toBe(10);
    correr(sim, 16);
    expect(sim.llegadasPorMinuto).toBe(15);
  });

  it('los esquiadores recorren la carretera antes de entrar en la plaza y su aguante empieza ahí', () => {
    const carretera = [
      { x: 1000, y: 3100 },
      { x: 0, y: 3100 },
    ];
    const sim = new Simulacion(estacion(), { ...P, aguanteMinimo: 100, aguanteMaximo: 100 }, carretera[1], crearAzar(3), carretera);
    correr(sim, 6.05); // el primero llega a los 6 s y tarda 10 s en la carretera
    const e = [...sim.esquiadores.values()][0];
    expect(e.estado).toBe('carretera');
    expect(sim.perfiles.get(e.id)!.cansadoEn).toBe(Infinity);
    correr(sim, 10);
    expect(sim.esquiadores.get(e.id)!.estado).not.toBe('carretera');
    expect(sim.perfiles.get(e.id)!.cansadoEn).toBeCloseTo(sim.tiempo + 100, 0);
  });

  it('la mezcla de los que llegan es la de la curva', () => {
    const sim = new Simulacion(estacion(), { ...P, afluencia: { ...A, tasaInicial: 120 } }, { x: 0, y: 3100 }, crearAzar(4));
    correr(sim, 30);
    expect(sim.porNivel()).toEqual([sim.poblacion, 0, 0, 0]);
  });

  it('al entrar en la plaza elige el remonte con su criterio: el de menos cola, más a menudo, y va directo a su cola', () => {
    const red = redPequena();
    const a = red.construirRemonte(0, 2);
    const b = red.construirRemonte(1, 2);
    expect(a && b).toBeTruthy();
    abrir(red, 2, 0);
    const sim = new Simulacion(red, { ...P, afluencia: { ...A, tasaInicial: 6000 } }, { x: 150, y: 3100 }, crearAzar(7));
    sim.paso(DT);
    // Cola artificial de 9 en el primer remonte: pesa 1/10 frente a 1/1.
    const ra = red.remontes.find((r) => r.desde === 0)!;
    const rb = red.remontes.find((r) => r.desde === 1)!;
    for (let i = 0; i < 9; i++) sim.colas[ra.id].push(-1 - i);
    const elegido = new Map<number, number>();
    for (let t = 0; t < 1; t += DT) {
      sim.paso(DT);
      for (const e of sim.esquiadores.values()) if (e.estado === 'andando' && e.remonte !== undefined) elegido.set(e.id, e.remonte);
    }
    const n = elegido.size;
    const aA = [...elegido.values()].filter((r) => r === ra.id).length;
    expect(n).toBeGreaterThan(50);
    expect(aA / n).toBeGreaterThan(0.03);
    expect(aA / n).toBeLessThan(0.2);
    // Al llegar a la base, a la cola del remonte elegido sin volver a decidir.
    const id = [...elegido.entries()].find(([, r]) => r === rb.id)![0];
    for (let t = 0; t < 8 && sim.esquiadores.get(id)?.estado === 'andando'; t += DT) sim.paso(DT);
    const e = sim.esquiadores.get(id)!;
    expect(e.estado === 'cola' || e.estado === 'remonte').toBe(true);
    if (e.estado === 'cola') expect(e.remonte).toBe(rb.id);
  });

  it('cuenta los llegados y los enfadados por nivel', () => {
    const red = redPequena(); // sin remontes: nadie llega
    const sim = new Simulacion(estacion(), { ...P, afluencia: { ...A, tasaInicial: 120 } }, { x: 0, y: 3100 }, crearAzar(4));
    correr(sim, 10);
    expect(sim.llegados).toBeGreaterThanOrEqual(19);
    expect(new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(1)).llegados).toBe(0);
    expect(sim.contentoMedioPorNivel()).toEqual([1000, null, null, null]);
    expect(sim.quejasPorNivel.reduce((x, y) => x + y, 0)).toBe(sim.enfadados);
  });
});
