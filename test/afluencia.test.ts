import { describe, expect, it } from 'vitest';
import {
  edificios,
  escalonEfectivo,
  escalonVisible,
  huecosPlaza,
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

describe('carretera y edificios', () => {
  const plaza = { x: 2000, y: 5780, radio: 200 };

  it('la carretera llega desde el borde lateral más cercano hasta el borde de la plaza', () => {
    const c = trazarCarretera(plaza, 4000);
    expect(c[0].x === 0 || c[0].x === 4000).toBe(true);
    const fin = c[c.length - 1];
    expect(Math.hypot(fin.x - plaza.x, fin.y - plaza.y)).toBeCloseTo(plaza.radio);
    expect(trazarCarretera({ ...plaza, x: 500 }, 4000)[0].x).toBe(0);
    expect(trazarCarretera({ ...plaza, x: 3500 }, 4000)[0].x).toBe(4000);
  });

  it('los huecos quedan dentro de la plaza y lejos de la entrada de la carretera', () => {
    const entrada = trazarCarretera(plaza, 4000)[1];
    const h = huecosPlaza(plaza, entrada, 8);
    expect(h).toHaveLength(8);
    for (const p of h) {
      expect(Math.hypot(p.x - plaza.x, p.y - plaza.y)).toBeLessThan(plaza.radio);
      expect(Math.hypot(p.x - entrada.x, p.y - entrada.y)).toBeGreaterThan(plaza.radio * 0.4);
    }
    // Se llenan de arriba abajo: los de abajo quedan junto al borde del mapa.
    for (let i = 1; i < h.length; i++) expect(h[i].y).toBeGreaterThanOrEqual(h[i - 1].y - 1e-9);
  });

  it('un edificio por escalón; llenos los huecos, mejoran en el mismo orden hasta el grado máximo', () => {
    expect(edificios(0, 3, 2, 60)).toEqual([]);
    expect(edificios(2, 3, 2, 60)).toEqual([
      { hueco: 0, grado: 0, desde: 60 },
      { hueco: 1, grado: 0, desde: 120 },
    ]);
    expect(edificios(4, 3, 2, 60)).toEqual([
      { hueco: 0, grado: 1, desde: 240 },
      { hueco: 1, grado: 0, desde: 120 },
      { hueco: 2, grado: 0, desde: 180 },
    ]);
    // Tope: 3 huecos × 3 grados = 9 escalones; después ya no cambia.
    expect(edificios(50, 3, 2, 60)).toEqual(edificios(9, 3, 2, 60));
    expect(edificios(9, 3, 2, 60).map((e) => e.grado)).toEqual([2, 2, 2]);
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
});
