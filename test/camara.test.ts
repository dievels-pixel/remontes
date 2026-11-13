import { describe, expect, it } from 'vitest';
import { Camara } from '../src/render/camara';

/** Pantalla de móvil vertical (400 × 800 px) y mundo de 4000 × 6000 m. */
function camara(): Camara {
  const c = new Camara();
  c.ajustar(400, 800, 4000, 6000, 60, 90);
  return c;
}

describe('Cámara: zoom y desplazamiento', () => {
  it('empieza con el mundo entero a la vista, entre las franjas reservadas', () => {
    const c = camara();
    const a = c.aPantalla({ x: 0, y: 0 });
    const b = c.aPantalla({ x: 4000, y: 6000 });
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(400);
    expect(a.y).toBeGreaterThanOrEqual(60);
    expect(b.y).toBeLessThanOrEqual(800 - 90);
    expect(c.acercada).toBe(false);
  });

  it('el zoom mantiene fijo el punto bajo los dedos', () => {
    const c = camara();
    const centro = { x: 200, y: 400 };
    const antes = c.aMundo(centro);
    c.zoom(2, centro);
    const despues = c.aMundo(centro);
    expect(despues.x).toBeCloseTo(antes.x, 6);
    expect(despues.y).toBeCloseTo(antes.y, 6);
    expect(c.acercada).toBe(true);
  });

  it('no aleja más allá del mundo entero ni acerca más del máximo', () => {
    const c = camara();
    const inicial = c.escala;
    c.zoom(0.2, { x: 200, y: 400 });
    expect(c.escala).toBeCloseTo(inicial, 10);
    c.zoom(100, { x: 200, y: 400 });
    expect(c.escala).toBeCloseTo(inicial * Camara.ZOOM_MAXIMO, 10);
  });

  it('acercada, se desplaza pero el mapa no deja hueco en los bordes', () => {
    const c = camara();
    c.zoom(4, { x: 200, y: 400 });
    c.desplazar(10000, 10000); // hacia la esquina superior izquierda, más de la cuenta
    expect(c.aPantalla({ x: 0, y: 0 })).toEqual({ x: 0, y: 60 });
    c.desplazar(-100000, -100000);
    const fin = c.aPantalla({ x: 4000, y: 6000 });
    expect(fin.x).toBeCloseTo(400, 6);
    expect(fin.y).toBeCloseTo(800 - 90, 6);
  });

  it('al reajustar (girar la pantalla, abrir el panel) conserva el zoom', () => {
    const c = camara();
    c.zoom(3, { x: 200, y: 400 });
    const e = c.escala;
    c.ajustar(400, 800, 4000, 6000, 200, 90);
    expect(c.escala).toBeCloseTo(e, 10);
  });
});
