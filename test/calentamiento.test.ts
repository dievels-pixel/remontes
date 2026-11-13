import { describe, expect, it } from 'vitest';
import { tareasCalentamiento } from '../src/core/calentamiento';
import { Juego } from '../src/juego';
import { cargarMapaPrueba } from './apoyo';

/** «Gran dominio» con una red pequeña: plaza → cima central con pista de vuelta, y plaza → un intermedio. */
function juego(): Juego {
  const j = new Juego(cargarMapaPrueba('gran-dominio'));
  const r = j.red;
  const plaza = r.nodos.find((n) => n.tipo === 'base' && n.x === 2000)!;
  const cima = r.nodos.find((n) => n.tipo === 'cima' && n.x === 2100)!;
  r.construirRemonte(plaza.id, cima.id);
  const e = j.evaluarPista(cima.id, plaza.id);
  if (e.motivo !== 'ok') throw new Error(e.motivo);
  const c = e.colores.find((x) => x.factible)!;
  r.abrirPista(cima.id, plaza.id, c.color, e.proyecto.lado, c.giro);
  r.construirRemonte(plaza.id, r.nodos.find((n) => n.x === 2000 && n.y === 4500)!.id);
  return j;
}

/** Todo lo que puede pedir un arrastre: remontes, pistas, arranques y bajadas. */
function todo(j: Juego) {
  const r = j.red;
  const ids = r.nodos.map((n) => n.id);
  return {
    remontes: ids.flatMap((a) => ids.map((b) => r.puedeConstruirRemonte(a, b))),
    pistas: ids.flatMap((a) => ids.map((b) => j.evaluarPista(a, b))),
    arranques: ids.map((a) => r.puedeArrancar(a)),
    bajadas: ids.map((a) => r.llegadaConBajada(a)),
  };
}

describe('Calentamiento de cachés', () => {
  it('con calentamiento el resultado es idéntico al de sin él', () => {
    const caliente = juego();
    let fotogramas = 0;
    while (!caliente.calentado) {
      caliente.calentar(4);
      fotogramas++;
    }
    expect(fotogramas).toBeGreaterThan(1); // se reparte en varios fotogramas
    const frio = juego();
    expect(todo(caliente)).toEqual(todo(frio));
  }, 120000);

  it('si la red cambia antes de terminar, empieza de nuevo', () => {
    const j = juego();
    j.calentar(4);
    expect(j.calentado).toBe(false);
    j.red.deshacer();
    j.calentar(1e9);
    expect(j.calentado).toBe(true);
    j.red.deshacer();
    expect(j.calentado).toBe(false);
  }, 60000);

  it('empieza por lo más cercano a la última obra y reparte las pistas por turnos, con tope de destinos', () => {
    const j = juego();
    const r = j.red;
    const cima = r.nodos.find((n) => n.tipo === 'cima' && n.x === 2100)!;
    const tareas = tareasCalentamiento(r, cima, 3);
    const bajadas = tareas.filter((t) => t.tipo === 'bajada').map((t) => (t.tipo === 'bajada' ? t.nodo : -1));
    expect(bajadas[0]).toBe(cima.id); // la obra misma primero
    const pistas = tareas.filter((t) => t.tipo === 'pista');
    const porOrigen = new Map<number, number>();
    for (const t of pistas) if (t.tipo === 'pista') porOrigen.set(t.desde, (porOrigen.get(t.desde) ?? 0) + 1);
    expect([...porOrigen.values()].every((n) => n <= 3)).toBe(true);
    expect(porOrigen.size).toBe(2); // la cima y el intermedio
    // Por turnos: los dos orígenes aparecen antes de que ninguno repita.
    const primeros = pistas.slice(0, 2).map((t) => (t.tipo === 'pista' ? t.desde : -1));
    expect(new Set(primeros).size).toBe(2);
  });
});
