// Cargador único de niveles en el navegador. Los niveles son carpetas de
// datos en niveles/<id>/ (nivel.json, alturas.png, miniatura.png y, si hay
// roca pintada a mano, mascara.png) listadas
// en niveles/indice.json: añadir uno es copiar una carpeta y añadir una línea
// al índice. El código no sabe nada de ningún nivel concreto. El formato está
// en FORMATO_NIVEL.md.
import { montarMapa, type Mapa } from './core/mapa';
import { leerIndice, leerNivel, type ParametrosNivel } from './core/nivel';
import type { Reto } from './core/retos';

const INDICE = import.meta.glob<unknown>('../niveles/indice.json', { eager: true, import: 'default' });
const JSONS = import.meta.glob<unknown>('../niveles/*/nivel.json', { eager: true, import: 'default' });
const ALTURAS = import.meta.glob<string>('../niveles/*/alturas.png', { eager: true, query: '?url', import: 'default' });
const MASCARAS = import.meta.glob<string>('../niveles/*/mascara.png', { eager: true, query: '?url', import: 'default' });
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

/** Decodifica un PNG (dirección o data URL) y devuelve su primer canal. */
export async function grisDePng(url: string): Promise<{ ancho: number; alto: number; gris: Uint8Array }> {
  const img = new Image();
  img.src = url;
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
  return { ancho: lienzo.width, alto: lienzo.height, gris };
}

/** Monta un nivel a partir de su JSON y de las direcciones de sus PNG. */
export async function montarNivel(id: string, json: unknown, alturasUrl: string, mascaraUrl: string | null): Promise<NivelCargado> {
  const { mapa: datos, parametros, retos } = leerNivel(json);
  const png = await grisDePng(alturasUrl);
  let mascara: Uint8Array | null = null;
  if (mascaraUrl) {
    const m = await grisDePng(mascaraUrl);
    if (m.ancho !== png.ancho || m.alto !== png.alto) throw new Error(`Nivel no válido: mascara.png (${m.ancho}×${m.alto}) no tiene el tamaño de alturas.png (${png.ancho}×${png.alto})`);
    mascara = m.gris;
  }
  return { id, nombre: datos.nombre, mapa: montarMapa(datos, png.ancho, png.alto, png.gris, mascara), parametros, retos };
}

/** Carga un nivel jugable: valida su JSON y decodifica sus PNG. */
export async function cargarNivel(id: string): Promise<NivelCargado> {
  const json = JSONS[`../niveles/${id}/nivel.json`];
  const png = ALTURAS[`../niveles/${id}/alturas.png`];
  if (json === undefined || png === undefined) throw new Error(`no existe el nivel «${id}» (falta nivel.json o alturas.png en niveles/${id}/)`);
  return montarNivel(id, json, png, MASCARAS[`../niveles/${id}/mascara.png`] ?? null);
}

/**
 * Nivel en pruebas que deja el editor de mapas (tools/editor) en el
 * almacenamiento del navegador, para abrirlo con ?prueba. Solo en desarrollo.
 */
export async function cargarNivelEnPruebas(): Promise<NivelCargado> {
  const texto = localStorage.getItem('remontes.nivelPrueba');
  if (!texto) throw new Error('no hay ningún nivel en pruebas (ábrelo desde el editor de mapas)');
  const d = JSON.parse(texto) as { json: unknown; alturas: string; mascara: string | null };
  return montarNivel('prueba', d.json, d.alturas, d.mascara);
}
