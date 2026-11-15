import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { nivelDe } from '../src/core/colores';
import { mantenimientoRemonte, pagoBajada, precioMejora, precioRemonte, TIPO_MAXIMO } from '../src/core/economia';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { Juego } from '../src/juego';
import { abrir, conValoresClasicos, mapaInicial, redPequena } from './apoyo';

// Parámetros propios de la prueba, no los de config.ts.
const PRECIOS = { precioPorMetro: 0.04, factorPrecioPorTipo: [1, 2.5, 5] };
const PAGO = { tarifas: [1, 1.5, 2, 3], multiplicadorVariedad: 0.2 };

describe('Precios y pago', () => {
  it('precio por longitud y tipo; mejorar paga la diferencia', () => {
    expect(precioRemonte(1500, 0, PRECIOS)).toBe(60);
    expect(precioRemonte(1500, 1, PRECIOS)).toBe(150);
    expect(precioRemonte(1500, 2, PRECIOS)).toBe(300);
    expect(precioMejora(1500, 0, PRECIOS)).toBe(90);
    expect(precioMejora(1500, 1, PRECIOS)).toBe(150);
    expect(precioRemonte(1501, 0, PRECIOS)).toBe(61); // redondeo hacia arriba
  });

  it('mantenimiento por longitud y tipo: mejorar un remonte lo encarece más que su capacidad', () => {
    const M = { porMetroYMinuto: 0.006, factorPorTipo: [1, 4, 10] };
    expect(mantenimientoRemonte(1000, 0, M)).toBeCloseTo(6);
    expect(mantenimientoRemonte(1000, 2, M)).toBeCloseTo(60);
  });

  it('pago por color de la pista con el multiplicador de variedad', () => {
    expect(pagoBajada(0, 0, PAGO)).toBe(1);
    expect(pagoBajada(3, 0, PAGO)).toBe(3);
    expect(pagoBajada(1, 5, PAGO)).toBeCloseTo(3);
  });
});

describe('Simulación con economía', () => {
  const P: ParametrosSimulacion = {
    velocidadRemonte: 160,
    intervaloBolitas: 0.9,
    capacidadBolita: 1,
    llegadasPorMinuto: 600,
    mezclaNiveles: [0, 1, 0, 0],
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
    capacidadPorTipo: [1, 2, 4],
    factorVelocidadPorTipo: [1, 1, 1.3],
    pago: PAGO,
  };
  const DT = 1 / 60;
  const correr = (sim: Simulacion, s: number) => {
    for (let t = 0; t < s; t += DT) sim.paso(DT);
  };
  function estacion() {
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    return red;
  }

  it('cada bajada cobra la tarifa de su color; la primera, sin multiplicador', () => {
    const red = estacion();
    const sim = new Simulacion(red, P, { x: 150, y: 3100 }, crearAzar(1));
    let antes = 0;
    for (let t = 0; t < 120 && sim.bajadasCompletadas === 0; t += DT) {
      antes = sim.monedas;
      sim.paso(DT);
    }
    expect(sim.bajadasCompletadas).toBe(1);
    expect(sim.monedas - antes).toBe(PAGO.tarifas[nivelDe(red.pistas[0].color)]);
  });

  it('el mantenimiento se cobra siempre (también sin gente), sin bajar de 0; los ingresos se cuentan por minuto', () => {
    const M = { porMetroYMinuto: 0.01, factorPorTipo: [1, 4, 10] };
    const red = estacion();
    const vacia = new Simulacion(red, { ...P, llegadasPorMinuto: 0, mantenimiento: M }, { x: 150, y: 3100 }, crearAzar(1));
    vacia.monedas = 1000;
    const porMinuto = mantenimientoRemonte(red.remontes[0].longitud, 0, M);
    expect(vacia.mantenimientoPorMinuto).toBeCloseTo(porMinuto);
    correr(vacia, 60);
    expect(vacia.monedas).toBeCloseTo(1000 - porMinuto, 0);
    vacia.monedas = 1;
    correr(vacia, 60);
    expect(vacia.monedas).toBe(0);
    // Con gente: los ingresos del último minuto suman lo cobrado en él.
    const llena = new Simulacion(estacion(), { ...P, llegadasPorMinuto: 60 }, { x: 150, y: 3100 }, crearAzar(3));
    correr(llena, 90);
    expect(llena.ingresosPorMinuto).toBeGreaterThan(0);
    const antes = llena.monedas;
    correr(llena, 60);
    expect(llena.ingresosPorMinuto).toBeCloseTo(llena.monedas - antes, 0);
  });

  it('una telesilla sube el doble de gente que un telesquí; una telecabina, el cuádruple', () => {
    const subidos = (tipo: number) => {
      const red = estacion();
      red.remontes[0].tipo = tipo;
      const sim = new Simulacion(red, P, { x: 150, y: 3100 }, crearAzar(2));
      let n = 0;
      correr(sim, 20);
      for (const b of sim.bolitas[0]) n = Math.max(n, b.pasajeros.length);
      return n;
    };
    expect([subidos(0), subidos(1), subidos(2)]).toEqual([1, 2, 4]);
  });
});

describe('Juego con economía', () => {
  function conRemonte(monedas: number) {
    const j = new Juego(mapaInicial());
    j.sim.monedas = monedas;
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const destino = j.red.nodos.filter((n) => n.cota > base.cota && j.red.puedeConstruirRemonte(base.id, n.id) === 'ok')[0];
    const precio = j.precioRemonteEntre(base.id, destino.id);
    j.empezarArrastre(base, 10);
    j.moverArrastre(destino, 10);
    expect(j.precioArrastre()).toEqual({ precio, alcanza: precio <= monedas });
    j.soltarArrastre();
    return { j, precio };
  }

  it('construir cobra el precio; sin monedas no se construye; deshacer lo devuelve', () => {
    const { j, precio } = conRemonte(1000);
    expect(j.red.remontes).toHaveLength(1);
    expect(j.monedas).toBe(1000 - precio);
    j.deshacer();
    expect(j.monedas).toBe(1000);
    const pobre = conRemonte(precio - 1);
    expect(pobre.j.red.remontes).toHaveLength(0);
    expect(pobre.j.monedas).toBe(precio - 1);
  });

  it('pulsación larga sobre el remonte: pregunta, cobra la diferencia y mejora; deshacer devuelve todo', () => {
    const { j, precio } = conRemonte(10000);
    const r = j.red.remontes[0];
    const medio = { x: (j.red.nodo(r.desde).x + j.red.nodo(r.hasta).x) / 2, y: (j.red.nodo(r.desde).y + j.red.nodo(r.hasta).y) / 2 };
    expect(j.pulsacionLarga({ x: medio.x + 2000, y: medio.y }, 20)).toBe(false);
    expect(j.pulsacionLarga(medio, 20)).toBe(true);
    const mejora = precioMejora(r.longitud, 0, CONFIG.economia);
    expect(j.mejora?.precio).toBe(mejora);
    expect(j.textoMejora()).toContain('telesilla');
    j.confirmarMejora();
    expect(r.tipo).toBe(1);
    expect(j.monedas).toBe(10000 - precio - mejora);
    // Cancelar no cobra.
    j.pulsacionLarga(medio, 20);
    j.cancelarMejora();
    expect(r.tipo).toBe(1);
    // Hasta la telecabina; después no se puede más.
    j.pulsacionLarga(medio, 20);
    j.confirmarMejora();
    expect(r.tipo).toBe(TIPO_MAXIMO);
    j.pulsacionLarga(medio, 20);
    expect(j.mejora).toBeNull();
    j.deshacer();
    expect(j.monedas).toBe(10000);
  });

  it('sin monedas para la mejora, no mejora', () => {
    const { j, precio } = conRemonte(0);
    expect(j.red.remontes).toHaveLength(0);
    const rico = conRemonte(precio);
    const r = rico.j.red.remontes[0];
    const medio = { x: (rico.j.red.nodo(r.desde).x + rico.j.red.nodo(r.hasta).x) / 2, y: (rico.j.red.nodo(r.desde).y + rico.j.red.nodo(r.hasta).y) / 2 };
    rico.j.pulsacionLarga(medio, 20);
    rico.j.confirmarMejora();
    expect(r.tipo).toBe(0);
    expect(rico.j.monedas).toBe(0);
  });
});
