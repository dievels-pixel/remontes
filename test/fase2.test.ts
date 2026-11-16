// Fase 2 del acabado: animaciones, disposición de la interfaz, guía sin
// texto, eventos de la simulación, pausa y ciclo de día.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { Juego } from '../src/juego';
import { DURACION, Efectos, frenar, rebotar, suavizar, tinteDia } from '../src/render/efectos';
import { Guia } from '../src/render/guia';
import { dentro, disponer, layoutFin, layoutMejora, layoutSelector, type Rect } from '../src/render/interfaz';
import { COLAS_CLASICAS, conValoresClasicos, ESQUIADOR_CLASICO, mapaInicial, redPequena, REMONTE_CLASICO } from './apoyo';

const seSolapan = (a: Rect, b: Rect) => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;
const PANTALLAS: [string, number, number][] = [
  ['móvil en vertical', 412, 915],
  ['móvil pequeño en vertical', 360, 640],
  ['móvil en horizontal', 915, 412],
  ['móvil pequeño en horizontal', 640, 360],
  ['tableta', 1024, 768],
];

describe('Disposición de la interfaz', () => {
  for (const [nombre, ancho, alto] of PANTALLAS) {
    it(`${nombre} (${ancho}×${alto}): todo cabe y nada se pisa`, () => {
      const d = disponer(ancho, alto);
      const pantalla = { x: 0, y: 0, ancho, alto };
      const botones = Object.values(d.botones);
      for (const b of botones) {
        expect(dentro({ x: b.x, y: b.y }, pantalla) && dentro({ x: b.x + b.ancho, y: b.y + b.alto }, pantalla)).toBe(true);
        // Tamaño cómodo para el dedo.
        expect(Math.min(b.ancho, b.alto)).toBeGreaterThanOrEqual(44);
      }
      for (let i = 0; i < botones.length; i++) for (let k = i + 1; k < botones.length; k++) expect(seSolapan(botones[i], botones[k])).toBe(false);
      // Los contadores (con su barra) no pisan los botones.
      const c = d.contadores;
      const cajaContadores = { x: c.km.x - 12, y: c.km.y - 12, ancho: c.km.ancho + 24, alto: c.y2 - c.km.y + 24 };
      for (const b of botones) expect(seSolapan(cajaContadores, b)).toBe(false);
      expect(cajaContadores.x).toBeGreaterThanOrEqual(0);
      expect(cajaContadores.x + cajaContadores.ancho).toBeLessThanOrEqual(ancho);
      // El medidor no pisa las monedas ni el día.
      expect(d.medidor.ancho).toBeGreaterThan(60);
      expect(d.medidor.x - 54).toBeGreaterThan(d.monedas.x + 70);
      expect(d.medidor.x + d.medidor.ancho + 8).toBeLessThan(d.dia.x - 60);
      // Queda mapa: las franjas no se comen más de la mitad de la pantalla.
      expect(d.arriba + d.abajo).toBeLessThan(alto * 0.5);
    });

    it(`${nombre}: los paneles caben en la pantalla`, () => {
      const pantalla = { x: 0, y: 0, ancho, alto };
      const cabe = (r: Rect) => dentro({ x: r.x, y: r.y }, pantalla) && dentro({ x: r.x + r.ancho, y: r.y + r.alto }, pantalla);
      for (const retos of [0, 3]) {
        const f = layoutFin(ancho, alto, retos);
        expect(cabe(f.panel)).toBe(true);
        expect(cabe(f.repetir) && cabe(f.menu)).toBe(true);
        expect(seSolapan(f.repetir, f.menu)).toBe(false);
      }
      const m = layoutMejora(ancho, alto);
      expect(cabe(m.panel) && cabe(m.si) && cabe(m.no)).toBe(true);
      // El selector se mantiene dentro aunque el punto esté en una esquina.
      for (const p of [{ x: 0, y: 0 }, { x: ancho, y: alto }, { x: ancho / 2, y: alto / 2 }]) expect(cabe(layoutSelector(p, ancho, alto).panel)).toBe(true);
    });
  }
});

describe('Animaciones', () => {
  it('las curvas de suavizado empiezan en 0 y acaban en 1', () => {
    for (const f of [frenar, suavizar, rebotar]) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
      expect(f(-3)).toBeCloseTo(0);
      expect(f(7)).toBeCloseTo(1);
    }
    // El rebote se pasa un poco antes de asentarse.
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(rebotar))).toBeGreaterThan(1);
  });

  it('el tinte del día es continuo: nada de día, oscuro de noche y sin salto al empezar otro día', () => {
    expect(tinteDia(0.3).a).toBeCloseTo(0);
    expect(tinteDia(0.88).a).toBeGreaterThan(0.2);
    expect(tinteDia(0.9999).a).toBeCloseTo(tinteDia(0).a, 1);
    for (let h = 0; h < 1; h += 0.01) expect(Math.abs(tinteDia(h + 0.01).a - tinteDia(h).a)).toBeLessThan(0.05);
  });

  it('lo construido nace al sincronizar y lo que ya había al entrar no se anima', () => {
    const j = new Juego(mapaInicial());
    j.sim.monedas = 1e6;
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const destino = j.red.nodos.find((n) => n.cota > base.cota && j.red.puedeConstruirRemonte(base.id, n.id) === 'ok')!;
    const fx = new Efectos();
    fx.sincronizar(j, 0.016, true);
    expect(fx.monedasMostradas).toBe(1e6);
    j.construirRemonte(base.id, destino.id);
    fx.sincronizar(j, 0.016);
    expect(fx.progreso('remonte:0', DURACION.remonte)).toBeLessThan(0.1);
    expect(fx.edad('estacion:0')).toBeLessThan(0.1);
    for (let i = 0; i < 60; i++) fx.sincronizar(j, 0.016);
    expect(fx.progreso('remonte:0', DURACION.remonte)).toBe(1);
    // El número de monedas rueda hacia el real sin saltar.
    expect(fx.monedasMostradas).toBeCloseTo(j.monedas, 0);
    // Otra pantalla que entra con la red ya hecha: nada nace.
    const otra = new Efectos();
    otra.sincronizar(j, 0.016, true);
    expect(otra.edad('remonte:0')).toBe(Infinity);
    // Deshacer borra el nacimiento.
    j.deshacer();
    fx.sincronizar(j, 0.016);
    expect(fx.edad('remonte:0')).toBe(Infinity);
  });

  it('una mezcla entra y sale poco a poco', () => {
    const fx = new Efectos();
    expect(fx.mezcla('panel', true, 0.05, 0.2)).toBeCloseTo(0.25);
    for (let i = 0; i < 10; i++) fx.mezcla('panel', true, 0.05, 0.2);
    expect(fx.valor('panel')).toBe(1);
    expect(fx.mezcla('panel', false, 0.05, 0.2)).toBeCloseTo(0.75);
  });
});

describe('Eventos de la simulación', () => {
  const P: ParametrosSimulacion = { ...REMONTE_CLASICO, ...ESQUIADOR_CLASICO, ...COLAS_CLASICAS, llegadasPorMinuto: 60, mezclaNiveles: [0, 1, 0, 0], aguanteMinimo: 40, aguanteMaximo: 60, pago: { tarifas: [1, 1.5, 2, 3], multiplicadorVariedad: 0.1 } };

  it('avisa de bolitas que llegan, cobros y salidas, y la lista no crece sin límite', () => {
    const r = conValoresClasicos(redPequena());
    r.construirRemonte(0, 3);
    r.abrirPista(3, 0, 'azul');
    const sim = new Simulacion(r, P, { x: 150, y: 3100 }, crearAzar(2));
    const vistos = new Set<string>();
    for (let t = 0; t < 200; t += 1 / 30) {
      sim.paso(1 / 30);
      for (const e of sim.eventos) vistos.add(e.tipo);
      expect(sim.eventos.length).toBeLessThanOrEqual(400);
    }
    expect(vistos.has('bolita')).toBe(true);
    expect(vistos.has('cobro')).toBe(true);
    expect(vistos.has('cansado')).toBe(true);
    const cobro = sim.eventos.find((e) => e.tipo === 'cobro');
    if (cobro?.tipo === 'cobro') expect(cobro.nodo).toBe(0);
    expect(sim.bajadasPorNivel[1]).toBe(sim.bajadasCompletadas);
  });
});

describe('Guía de la primera partida', () => {
  it('propone el primer remonte desde la plaza, luego su bajada y luego el color', () => {
    const j = new Juego(mapaInicial());
    const guia = new Guia(true);
    const p1 = guia.paso(j);
    expect(p1?.tipo).toBe('remonte');
    if (p1?.tipo !== 'remonte') return;
    expect(j.red.nodo(p1.desde).tipo).toBe('base');
    expect(j.construirRemonte(p1.desde, p1.hasta)).toBe('ok');
    const p2 = guia.paso(j);
    expect(p2?.tipo).toBe('pista');
    if (p2?.tipo !== 'pista') return;
    expect(p2.desde).toBe(p1.hasta);
    j.proponerPista(p2.desde, p2.hasta);
    expect(j.selector).not.toBeNull();
    expect(guia.paso(j)).toEqual({ tipo: 'color' });
    j.elegirColor(j.selector!.colores.find((c) => c.factible)!.color);
    expect(j.red.enServicio(j.red.remontes[0])).toBe(true);
    // Con la estación en marcha y sin colas, la guía calla.
    expect(guia.paso(j)).toBeNull();
    // Al mejorar un remonte se da por aprendida.
    j.sim.monedas = 1e6;
    j.mejorarRemonte(0);
    expect(guia.paso(j)).toBeNull();
    expect(guia.activa).toBe(false);
  });
});

describe('Día y pausa', () => {
  it('el día avanza con el tiempo de estación abierta', () => {
    const j = new Juego(mapaInicial());
    expect(j.dia).toBe(1);
    j.sim.tiempoAbierta = CONFIG.dia.duracion * 2.5;
    expect(j.dia).toBe(3);
    expect(j.horaDelDia).toBeCloseTo(0.5);
    expect(j.diasSobrevividos).toBeCloseTo(2.5);
  });
});
