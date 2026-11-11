import { describe, expect, it } from 'vitest';
import { Juego } from '../src/juego';

describe('Juego: arrastre y velocidad', () => {
  it('si la estación bajo el dedo ya recibe un remonte, se toma su gemela', () => {
    const j = new Juego();
    const cima = j.red.nodos.find((n) => n.tipo === 'cima' && n.gemelo !== undefined)!;
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    j.red.construirRemonte(bases[0].id, cima.id);
    j.empezarArrastre(bases[1], 10);
    j.moverArrastre(cima, 10);
    expect(j.arrastre?.objetivo).toMatchObject({ nodo: cima.gemelo, tipo: 'remonte', motivo: 'ok' });
    j.soltarArrastre();
    expect(j.red.activo(cima.gemelo!)).toBe(true);
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
});
