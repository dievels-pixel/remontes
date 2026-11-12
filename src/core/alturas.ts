// Mapa de alturas en escala de grises (valores 0..1), leído del PNG del mapa
// (ver mapa.ts). De aquí salen las cotas de los nodos y el degradado.
import type { Punto } from './vector';

export class MapaAlturas {
  readonly gris: Float32Array;

  constructor(
    readonly columnas: number,
    readonly filas: number,
    readonly ancho: number,
    readonly alto: number,
    readonly cotaMin: number,
    readonly cotaMax: number,
    gris: Float32Array,
  ) {
    if (gris.length !== columnas * filas) throw new Error('Tamaño de rejilla incoherente');
    this.gris = gris;
  }

  /** Gris (0..1) interpolado bilinealmente en coordenadas del mundo. */
  grisEn(p: Punto): number {
    const fx = Math.min(Math.max((p.x / this.ancho) * (this.columnas - 1), 0), this.columnas - 1);
    const fy = Math.min(Math.max((p.y / this.alto) * (this.filas - 1), 0), this.filas - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, this.columnas - 1);
    const y1 = Math.min(y0 + 1, this.filas - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const g = (x: number, y: number) => this.gris[y * this.columnas + x];
    const a = g(x0, y0) * (1 - tx) + g(x1, y0) * tx;
    const b = g(x0, y1) * (1 - tx) + g(x1, y1) * tx;
    return a * (1 - ty) + b * ty;
  }

  /** Cota en metros. */
  cotaEn(p: Punto): number {
    return this.cotaMin + this.grisEn(p) * (this.cotaMax - this.cotaMin);
  }
}
