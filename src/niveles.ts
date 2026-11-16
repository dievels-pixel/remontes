// Cargador único de niveles en el navegador. Los niveles son carpetas de
// datos en niveles/<id>/ (nivel.json, alturas.png y miniatura.png) listadas
// en niveles/indice.json: añadir uno es copiar una carpeta y añadir una línea
// al índice. El código no sabe nada de ningún nivel concreto. El formato está
// en FORMATO_NIVEL.md.
import { alturasDesdeGris, type Mapa } from './core/mapa';
import { leerIndice, leerNivel, type ParametrosNivel } from './core/nivel';
import type { Reto } from './core/retos';

const INDICE = import.meta.glob<unknown>('../niveles/indice.json', { eager: true, import: 'default' });
const JSONS = import.meta.glob<unknown>('../niveles/*/nivel.json', { eager: true, import: 'default' });
const ALTURAS = import.meta.glob<string>('../niveles/*/alturas.png', { eager: true, query: '?url', import: 'default' });
const MINIATURAS = import.meta.glob<string>('../niveles/*/miniatura.png', { eager: true, query: '?url', import: 'default' });

/** Lo que el menú necesita de cada entrada del índice. */
export interface FichaNivel {
  id: string;
  nombre: string;
  bloqueado: boolean;
  /** Dirección de la miniatura, o null si no tiene (los bloqueados). */
  miniatura: string | null;
  retos: Reto[];
}

export interface NivelCargado {
  id: string;
  nombre: string;
  mapa: Mapa;
  parametros: ParametrosNivel;
  retos: Reto[];
}

/** Las entradas del índice, en su orden. Un nivel jugable sin carpeta es un error. */
export function fichasDeNiveles(): FichaNivel[] {
  return leerIndice(INDICE['../niveles/indice.json']).map((e) => {
    if (e.bloqueado) return { id: e.id, nombre: e.nombre ?? '', bloqueado: true, miniatura: null, retos: [] };
    const json = JSONS[`../niveles/${e.id}/nivel.json`];
    if (json === undefined) throw new Error(`El índice lista el nivel «${e.id}», pero no existe niveles/${e.id}/nivel.json`);
    const nivel = leerNivel(json);
    return { id: e.id, nombre: nivel.mapa.nombre, bloqueado: false, miniatura: MINIATURAS[`../niveles/${e.id}/miniatura.png`] ?? null, retos: nivel.retos };
  });
}

/** Carga un nivel jugable: valida su JSON y decodifica su PNG de alturas. */
export async function cargarNivel(id: string): Promise<NivelCargado> {
  const json = JSONS[`../niveles/${id}/nivel.json`];
  const png = ALTURAS[`../niveles/${id}/alturas.png`];
  if (json === undefined || png === undefined) throw new Error(`no existe el nivel «${id}» (falta nivel.json o alturas.png en niveles/${id}/)`);
  const { mapa: datos, parametros, retos } = leerNivel(json);
  const img = new Image();
  img.src = png;
  await img.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = img.naturalWidth;
  lienzo.height = img.naturalHeight;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
  // El gris es el canal rojo (en un PNG gris los tres canales coinciden).
  const gris = new Uint8Array(lienzo.width * lienzo.height);
  for (let i = 0; i < gris.length; i++) gris[i] = rgba[i * 4];
  return { id, nombre: datos.nombre, mapa: { datos, alturas: alturasDesdeGris(datos, lienzo.width, lienzo.height, gris) }, parametros, retos };
}
