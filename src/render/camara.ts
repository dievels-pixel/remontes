import type { Punto } from '../core/vector';

/** Encaja el mundo (en metros) en la pantalla (en px CSS), centrado. */
export class Camara {
  escala = 1;
  dx = 0;
  dy = 0;

  ajustar(anchoPantalla: number, altoPantalla: number, anchoMundo: number, altoMundo: number): void {
    const margen = 0.98;
    this.escala = Math.min(anchoPantalla / anchoMundo, altoPantalla / altoMundo) * margen;
    this.dx = (anchoPantalla - anchoMundo * this.escala) / 2;
    this.dy = (altoPantalla - altoMundo * this.escala) / 2;
  }

  aPantalla(p: Punto): Punto {
    return { x: p.x * this.escala + this.dx, y: p.y * this.escala + this.dy };
  }

  aMundo(p: Punto): Punto {
    return { x: (p.x - this.dx) / this.escala, y: (p.y - this.dy) / this.escala };
  }
}
