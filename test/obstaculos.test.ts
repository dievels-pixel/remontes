import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Polilinea } from '../src/core/polilinea';
import { proyectosDesde } from '../src/core/proyectos';
import { Red } from '../src/core/red';
import { Juego } from '../src/juego';
import { mapaInicial, REGLAS, redPequena } from './apoyo';

/** Red pequeña con un obstáculo circular. */
function conObstaculo(o: { x: number; y: number; radio: number }): Red {
  const nodos = redPequena().nodos.map((n) => ({ ...n }));
  return new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista }, obstaculos: [o] });
}

describe('La plaza como obstáculo para las pistas', () => {
  it('no se propone una pista cuyo trazado previsto entre en la plaza', () => {
    // Plaza en mitad de la bajada 3 (400,0) → 0 (0,3000).
    const red = conObstaculo({ x: 200, y: 1500, radio: 450 }); // tapa las dos laterales (se abomban ~300 m)
    // Sin salida orientada: saliendo girada, la pista podría rodear la plaza.
    red.reglas.pista.giroMaximo = 0;
    red.construirRemonte(0, 3);
    for (const lado of [1, -1] as const) expect(red.trazadoLimpio(3, 0, lado)).toBe(false);
    expect(proyectosDesde(red, 3, 3).some((p) => p.hasta === 0)).toBe(false);
  });

  it('el margen cuenta: justo fuera del círculo pero dentro del margen, tampoco', () => {
    const red = conObstaculo({ x: 0, y: 1500, radio: 100 });
    const linea = new Polilinea([
      { x: 130, y: 0 },
      { x: 130, y: 3000 },
    ]); // pasa a 130 m del centro: 30 m fuera del círculo
    red.reglas.pista.margenObstaculo = 40;
    expect(red.pisaObstaculo(linea)).toBe(true);
    red.reglas.pista.margenObstaculo = 20;
    expect(red.pisaObstaculo(linea)).toBe(false);
  });

  it('las llegadas a una base en el borde de la plaza no se ven afectadas', () => {
    // Plaza al pie de la base 0 (0,3000), por debajo de ella.
    const red = conObstaculo({ x: -50, y: 3250, radio: 170 });
    red.construirRemonte(0, 3);
    expect(Math.hypot(50, 250)).toBeGreaterThan(170 + red.reglas.pista.margenObstaculo);
    expect(proyectosDesde(red, 3, 3).some((p) => p.hasta === 0)).toBe(true);
  });

  it('en el mapa real, ningún proyecto propuesto entra en la plaza', () => {
    const j = new Juego(mapaInicial());
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    const altos = j.red.nodos.filter((n) => n.tipo !== 'base');
    for (const b of bases) for (const a of altos) if (j.red.puedeConstruirRemonte(b.id, a.id) === 'ok') j.red.construirRemonte(b.id, a.id);
    expect(j.red.reglas.obstaculos).toHaveLength(1);
    const plaza = j.red.reglas.obstaculos![0];
    for (const n of j.red.nodos) {
      j.foco = { tipo: 'nodo', id: n.id };
      for (const p of j.proyectosVisibles()) {
        const d = Math.min(...j.trazadoProyecto(p).trazado.puntos.map((q) => Math.hypot(q.x - plaza.x, q.y - plaza.y)));
        expect(d).toBeGreaterThanOrEqual(plaza.radio + CONFIG.pista.margenObstaculo);
      }
    }
  });
});
