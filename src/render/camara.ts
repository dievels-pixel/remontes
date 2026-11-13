import type { Punto } from '../core/vector';

/**
 * Pasa del mundo (metros) a la pantalla (px CSS) y al revés. Empieza con el
 * mundo entero encajado en la pantalla; el jugador puede acercar (hasta
 * `ZOOM_MAXIMO` veces) y desplazarse, sin que el mapa se salga de la vista.
 */
export class Camara {
  escala = 1;
  dx = 0;
  dy = 0;
  /** Escala con la que cabe el mundo entero: es el zoom mínimo. */
  private escalaEncaje = 1;
  private vista = { ancho: 0, alto: 0, arriba: 0, abajo: 0, anchoMundo: 1, altoMundo: 1 };
  private encajada = false;

  static readonly ZOOM_MAXIMO = 6;

  /**
   * `reservaArriba` y `reservaAbajo` (px) dejan franjas libres: el mundo se
   * encaja en el espacio que queda entre ellas (texto de ayuda, botones,
   * panel de ajustes). Si ya se había acercado, se conserva el zoom.
   */
  ajustar(anchoPantalla: number, altoPantalla: number, anchoMundo: number, altoMundo: number, reservaArriba = 0, reservaAbajo = 0): void {
    const margen = 0.98;
    const altoUtil = Math.max(altoPantalla - reservaArriba - reservaAbajo, 100);
    this.vista = { ancho: anchoPantalla, alto: altoPantalla, arriba: reservaArriba, abajo: reservaAbajo, anchoMundo, altoMundo };
    this.escalaEncaje = Math.min(anchoPantalla / anchoMundo, altoUtil / altoMundo) * margen;
    if (!this.encajada || this.escala < this.escalaEncaje) {
      this.escala = this.escalaEncaje;
      this.encajada = true;
    }
    this.limitar();
  }

  /** Acerca (factor > 1) o aleja manteniendo fijo el punto de pantalla `centro`. */
  zoom(factor: number, centro: Punto): void {
    const fijo = this.aMundo(centro);
    this.escala = Math.min(Math.max(this.escala * factor, this.escalaEncaje), this.escalaEncaje * Camara.ZOOM_MAXIMO);
    this.dx = centro.x - fijo.x * this.escala;
    this.dy = centro.y - fijo.y * this.escala;
    this.limitar();
  }

  /** Desplaza la vista lo que se ha movido el dedo (px). */
  desplazar(ddx: number, ddy: number): void {
    this.dx += ddx;
    this.dy += ddy;
    this.limitar();
  }

  /** ¿Está acercada (más que el encaje del mundo entero)? */
  get acercada(): boolean {
    return this.escala > this.escalaEncaje * 1.001;
  }

  /**
   * Mantiene el mapa a la vista: si cabe en una dirección, centrado en ella;
   * si no, sin dejar hueco entre su borde y el de la zona útil.
   */
  private limitar(): void {
    const { ancho, alto, arriba, abajo, anchoMundo, altoMundo } = this.vista;
    const w = anchoMundo * this.escala;
    const h = altoMundo * this.escala;
    const altoUtil = alto - arriba - abajo;
    this.dx = w <= ancho ? (ancho - w) / 2 : Math.min(0, Math.max(ancho - w, this.dx));
    this.dy = h <= altoUtil ? arriba + (altoUtil - h) / 2 : Math.min(arriba, Math.max(alto - abajo - h, this.dy));
  }

  aPantalla(p: Punto): Punto {
    return { x: p.x * this.escala + this.dx, y: p.y * this.escala + this.dy };
  }

  aMundo(p: Punto): Punto {
    return { x: (p.x - this.dx) / this.escala, y: (p.y - this.dy) / this.escala };
  }
}
