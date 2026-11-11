import type { Punto } from '../core/vector';

/** Encaja el mundo (en metros) en la pantalla (en px CSS), centrado. */
export class Camara {
  escala = 1;
  dx = 0;
  dy = 0;

  /**
   * `reservaArriba` y `reservaAbajo` (px) dejan franjas libres: el mundo se
   * encaja en el espacio que queda entre ellas (lo usa el panel de ajustes).
   */
  ajustar(anchoPantalla: number, altoPantalla: number, anchoMundo: number, altoMundo: number, reservaArriba = 0, reservaAbajo = 0): void {
    const margen = 0.98;
    const altoUtil = Math.max(altoPantalla - reservaArriba - reservaAbajo, 100);
    this.escala = Math.min(anchoPantalla / anchoMundo, altoUtil / altoMundo) * margen;
    this.dx = (anchoPantalla - anchoMundo * this.escala) / 2;
    this.dy = reservaArriba + (altoUtil - altoMundo * this.escala) / 2;
  }

  aPantalla(p: Punto): Punto {
    return { x: p.x * this.escala + this.dx, y: p.y * this.escala + this.dy };
  }

  aMundo(p: Punto): Punto {
    return { x: (p.x - this.dx) / this.escala, y: (p.y - this.dy) / this.escala };
  }
}
