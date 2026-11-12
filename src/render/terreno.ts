// Fondo precalculado una sola vez: degradado de color según la cota del mapa
// de alturas (valle frío y grisáceo, cumbres casi blancas). Sin curvas de nivel.
import type { MapaAlturas } from '../core/alturas';

const PARADAS: [number, [number, number, number]][] = [
  [0.0, [150, 166, 164]],
  [0.35, [178, 190, 190]],
  [0.65, [208, 216, 220]],
  [1.0, [246, 248, 250]],
];

function colorDe(g: number): [number, number, number] {
  for (let i = 1; i < PARADAS.length; i++) {
    const [t1, c1] = PARADAS[i];
    const [t0, c0] = PARADAS[i - 1];
    if (g <= t1) {
      const t = (g - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return PARADAS[PARADAS.length - 1][1];
}

/** Color de la roca (terreno no esquiable): gris cálido, más oscuro que la ladera. */
const ROCA: [number, number, number] = [116, 112, 106];

/**
 * Una muestra por celda del mapa de alturas. La roca empieza justo en el
 * umbral (lo que se ve como roca es lo que no se puede esquiar) y se oscurece
 * a lo largo de 0,15 de pendiente, para que el borde no quede dentado.
 */
export function crearTerreno(mapa: MapaAlturas, umbralRoca: number): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = mapa.columnas;
  lienzo.height = mapa.filas;
  const ctx = lienzo.getContext('2d')!;
  const img = ctx.createImageData(mapa.columnas, mapa.filas);
  const dx = mapa.ancho / (mapa.columnas - 1);
  const dy = mapa.alto / (mapa.filas - 1);
  for (let i = 0; i < mapa.gris.length; i++) {
    const p = { x: (i % mapa.columnas) * dx, y: Math.floor(i / mapa.columnas) * dy };
    const t = Math.min(Math.max((mapa.pendienteEn(p) - umbralRoca) / 0.15, 0), 1) * 0.9;
    const [r, g, b] = colorDe(mapa.gris[i]).map((c, k) => c + (ROCA[k] - c) * t);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return lienzo;
}

export const COLOR_FONDO = 'rgb(150, 166, 164)';
