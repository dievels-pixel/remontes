import { describe, expect, it } from 'vitest';
import { Juego } from '../src/juego';

describe('Juego: arrastre y velocidad', () => {
  it('el segundo remonte a una cima desdobla la estación y se puede arrastrar desde la base desdoblada', () => {
    const j = new Juego();
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    for (const b of bases.slice(0, 2)) {
      j.empezarArrastre(b, 10);
      j.moverArrastre(cima, 10);
      j.soltarArrastre();
    }
    expect(j.red.estacionesDe(cima.id).length).toBe(2);
    // Desde la base, el dedo sobre la estación nueva cuenta como esa base.
    j.empezarArrastre(bases[0], 10);
    j.moverArrastre(j.red.nodos.find((n) => n.tipo === 'intermedio')!, 10);
    j.soltarArrastre();
    const nueva = j.red.estacionesDe(bases[0].id)[1];
    const sep = 150;
    expect(j.nodoEn(j.posicionEstacion(nueva, sep), 40, sep)).toBe(bases[0].id);
  });

  it('la velocidad cicla entre 1×, 2× y 4×', () => {
    const j = new Juego();
    const vistas = [j.velocidad];
    for (let i = 0; i < 3; i++) {
      j.cambiarVelocidad();
      vistas.push(j.velocidad);
    }
    expect(vistas).toEqual([1, 2, 4, 1]);
  });

  it('tocar un proyecto abre el selector y elegir color abre la pista', () => {
    const j = new Juego();
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.empezarArrastre(base, 10);
    j.moverArrastre(cima, 10);
    j.soltarArrastre();
    const proyectos = j.proyectosVisibles();
    expect(proyectos.length).toBeGreaterThan(0);
    const pr = proyectos[0];
    const t = j.trazadoProyecto(pr).trazado;
    j.tocar(t.puntoEn(t.longitud / 2), 5);
    expect(j.selector?.proyecto).toEqual(pr);
    const color = j.selector!.colores.find((c) => c.factible)!.color;
    j.elegirColor(color);
    expect(j.red.pistas).toHaveLength(1);
    expect(j.red.pistas[0]).toMatchObject({ desde: pr.desde, hasta: pr.hasta, lado: pr.lado, color });
    expect(j.red.enServicio(j.red.remontes[0])).toBe(true);
  });

  it('tocar un nodo sin arrastrar muestra sus proyectos; tocar el vacío los oculta', () => {
    const j = new Juego();
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.red.construirRemonte(base.id, cima.id);
    j.empezarArrastre(cima, 10);
    j.soltarArrastre();
    expect(j.foco).toEqual({ tipo: 'nodo', id: cima.id });
    j.tocar({ x: 5, y: 5 }, 5);
    expect(j.foco).toBeNull();
  });
});
