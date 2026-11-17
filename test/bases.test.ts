// Cambio de base andando y colas comparadas por espera. Reproduce lo que vio
// el usuario el 2026-11-17: en Espot (bases a 403 y 700 m) la cola de la base
// de la izquierda crecía sin límite con las otras vacías, porque solo se
// podía ir andando a bases a menos de 400 m y nadie cambiaba nunca de base.
import { describe, expect, it } from 'vitest';
import { crearAzar } from '../src/core/azar';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import type { ParametrosNivel } from '../src/core/nivel';
import { Juego } from '../src/juego';
import { cargarMapaPrueba, COLAS_CLASICAS, conValoresClasicos, ESQUIADOR_CLASICO, redPequena, REMONTE_CLASICO } from './apoyo';

/**
 * En el mapa de pruebas grande (las mismas bases que Espot), un remonte corto
 * con su verde desde cada base; la base de la izquierda recibe además otras
 * dos pistas y es la única con telesquí (las otras, telecabinas).
 */
function estacionDesequilibrada(esquiador: Record<string, number>) {
  const parametros: ParametrosNivel = { esquiador, economia: { monedasIniciales: 1e6 } };
  const j = new Juego(cargarMapaPrueba('gran-dominio'), 3, parametros);
  const red = j.red;
  const bases = red.nodos.filter((n) => n.tipo === 'base');
  for (const b of bases) {
    const altos = red.nodos.filter((n) => n.cota > b.cota + 40).sort((x, y) => Math.hypot(x.x - b.x, x.y - b.y) - Math.hypot(y.x - b.x, y.y - b.y));
    for (const c of altos.slice(0, 6)) {
      if (j.construirRemonte(b.id, c.id) !== 'ok') continue;
      const e = j.evaluarPista(c.id, b.id);
      const color = e.motivo === 'ok' ? e.colores.find((x) => x.factible)?.color : undefined;
      if (color && j.abrirPista(c.id, b.id, color)) break;
      j.deshacer();
    }
  }
  const izquierda = bases.reduce((a, b) => (b.x < a.x ? b : a));
  for (const r of red.remontes) {
    if (r.desde === izquierda.id) continue;
    const e = j.evaluarPista(r.hasta, izquierda.id);
    const color = e.motivo === 'ok' ? e.colores.find((x) => x.factible)?.color : undefined;
    if (color) j.abrirPista(r.hasta, izquierda.id, color);
    j.mejorarRemonte(r.id);
    j.mejorarRemonte(r.id);
  }
  let andando = 0;
  const vistos = new Set<number>();
  let maxIzquierda = 0;
  let maxOtras = 0;
  for (let t = 0; t < 900; t += 1 / 20) {
    j.paso(1 / 20);
    for (const e of j.sim.esquiadores.values()) {
      if (e.estado === 'andando' && e.remonte === undefined && e.hacia >= 0 && !vistos.has(e.id)) {
        vistos.add(e.id);
        andando++;
      }
    }
    if (t > 600) {
      maxIzquierda = Math.max(maxIzquierda, j.sim.colaEnNodo(izquierda.id));
      for (const b of bases) if (b.id !== izquierda.id) maxOtras = Math.max(maxOtras, j.sim.colaEnNodo(b.id));
    }
  }
  return { andando, maxIzquierda, maxOtras, pistasIzquierda: red.pistas.filter((p) => p.hasta === izquierda.id).length };
}

describe('Cambio de base andando', () => {
  it('con el límite de 400 m de antes, nadie cambia de base y la cola de la izquierda se dispara', () => {
    const r = estacionDesequilibrada({ distanciaBasesContiguas: 400, exponenteCola: 1 });
    expect(r.pistasIzquierda).toBeGreaterThanOrEqual(2);
    expect(r.andando).toBe(0);
    expect(r.maxIzquierda).toBeGreaterThan(20);
  });

  it('con todas las bases de la plaza a pie y la cola comparada por espera, la gente se reparte', () => {
    const r = estacionDesequilibrada({ distanciaBasesContiguas: 1000, exponenteCola: 1.5 });
    expect(r.andando).toBeGreaterThan(100);
    expect(r.maxIzquierda).toBeLessThan(12);
  });
});

describe('Espera en un remonte', () => {
  it('se mide en bolitas: la misma cola espera menos en una telecabina', () => {
    const P: ParametrosSimulacion = { ...REMONTE_CLASICO, ...ESQUIADOR_CLASICO, ...COLAS_CLASICAS, llegadasPorMinuto: 0, mezclaNiveles: [1, 0, 0, 0], capacidadPorTipo: [1, 2, 4] };
    const red = conValoresClasicos(redPequena());
    red.construirRemonte(0, 3);
    red.abrirPista(3, 0, 'azul');
    const sim = new Simulacion(red, P, { x: 150, y: 3100 }, crearAzar(1));
    sim.paso(1 / 60);
    for (let i = 0; i < 12; i++) sim.colas[0].push(-1 - i);
    expect(sim.espera(red.remontes[0])).toBe(12);
    expect(sim.esperaEnNodo(0)).toBe(12);
    red.remontes[0].tipo = 2;
    expect(sim.espera(red.remontes[0])).toBe(3);
    // Un punto sin remontes no tiene espera.
    expect(sim.esperaEnNodo(3)).toBe(0);
  });
});
