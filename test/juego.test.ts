import { describe, expect, it } from 'vitest';
import { Juego } from '../src/juego';

describe('Juego: arrastre y velocidad', () => {
  it('si la estación bajo el dedo ya recibe un remonte, se toma su gemela', () => {
    const j = new Juego();
    const cima = j.red.nodos.find((n) => n.tipo === 'cima' && !n.desdoble)!;
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    j.red.construirRemonte(bases[0].id, cima.id);
    j.empezarArrastre(bases[1], 10);
    j.moverArrastre(cima, 10);
    expect(j.arrastre?.objetivo).toMatchObject({ nodo: cima.gemelo, tipo: 'remonte', motivo: 'ok' });
    j.soltarArrastre();
    expect(j.red.activo(cima.gemelo!)).toBe(true);
  });

  it('el desdoble está oculto y no se puede tocar hasta que hace falta', () => {
    const j = new Juego();
    const desdoble = j.red.nodos.find((n) => n.desdoble)!;
    const principal = j.red.nodo(desdoble.gemelo!);
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    expect(j.red.visible(desdoble.id)).toBe(false);
    // Aunque el dedo caiga justo sobre el desdoble, el destino es la principal.
    j.empezarArrastre(bases[0], 10);
    j.moverArrastre(desdoble, 200);
    expect(j.arrastre?.objetivo?.nodo).toBe(principal.id);
    j.soltarArrastre();
    expect(j.red.visible(desdoble.id)).toBe(false);
    // El segundo remonte al mismo pico desdobla la estación.
    j.empezarArrastre(bases[1], 10);
    j.moverArrastre(principal, 10);
    j.soltarArrastre();
    expect(j.red.visible(desdoble.id)).toBe(true);
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
