// Mapa de alturas en escala de grises (valores 0..1) generado con ruido de
// valor determinista más un desnivel general: el pie queda abajo y las
// cumbres arriba. De aquí salen las cotas de los nodos y el degradado.
import { crearAzar } from './azar';
import type { Punto } from './vector';

export interface ParametrosAlturas {
  columnas: number;
  filas: number;
  cotaMin: number;
  cotaMax: number;
  semilla: number;
  pesoPendienteGeneral: number;
  pesoRuido: number;
}

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

function suavizar(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ruido de valor en una rejilla de celdas, con interpolación suave. */
function ruidoValor(columnas: number, filas: number, celdas: number, semilla: number): Float32Array {
  const azar = crearAzar(semilla);
  const nx = celdas + 2;
  const ny = Math.ceil((celdas * filas) / columnas) + 2;
  const red = new Float32Array(nx * ny);
  for (let i = 0; i < red.length; i++) red[i] = azar();
  const salida = new Float32Array(columnas * filas);
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < columnas; x++) {
      const fx = (x / columnas) * celdas;
      const fy = (y / columnas) * celdas;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = suavizar(fx - x0);
      const ty = suavizar(fy - y0);
      const v = (i: number, j: number) => red[j * nx + i];
      const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
      const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
      salida[y * columnas + x] = a * (1 - ty) + b * ty;
    }
  }
  return salida;
}

export function generarMapaAlturas(p: ParametrosAlturas, ancho: number, alto: number): MapaAlturas {
  const { columnas, filas } = p;
  const octavas = [
    { celdas: 3, peso: 0.55 },
    { celdas: 6, peso: 0.3 },
    { celdas: 12, peso: 0.15 },
  ];
  const ruidos = octavas.map((o, i) => ruidoValor(columnas, filas, o.celdas, p.semilla * 101 + i));
  const gris = new Float32Array(columnas * filas);
  for (let y = 0; y < filas; y++) {
    // 0 en el borde inferior (pie de pistas), 1 en el superior.
    const subida = 1 - y / (filas - 1);
    const general = Math.pow(subida, 1.15);
    for (let x = 0; x < columnas; x++) {
      const i = y * columnas + x;
      let r = 0;
      for (let k = 0; k < octavas.length; k++) r += ruidos[k][i] * octavas[k].peso;
      // El ruido pesa menos en el valle para que la plaza quede casi llana.
      const v = general * p.pesoPendienteGeneral + r * p.pesoRuido * (0.35 + 0.65 * subida);
      gris[i] = Math.min(Math.max(v, 0), 1);
    }
  }
  return new MapaAlturas(columnas, filas, ancho, alto, p.cotaMin, p.cotaMax, gris);
}
