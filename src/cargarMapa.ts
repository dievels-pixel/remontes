// Carga en el navegador un mapa de mapas/<nombre>: el JSON va dentro del
// paquete y el PNG de alturas lo decodifica el propio navegador. Se elige con
// ?mapa=<nombre> en la dirección; sin él, el mapa por defecto.
import { alturasDesdeGris, leerDatosMapa, type Mapa } from './core/mapa';

const JSONS = import.meta.glob<unknown>('../mapas/*/mapa.json', { eager: true, import: 'default' });
const PNGS = import.meta.glob<string>('../mapas/*/alturas.png', { eager: true, query: '?url', import: 'default' });

/** Mapa que se carga si la dirección no pide otro. */
export const MAPA_POR_DEFECTO = 'dos-valles';

/** Nombres de carpeta de los mapas disponibles. */
export const MAPAS = Object.keys(JSONS).map((r) => r.split('/')[2]);

export async function cargarMapa(nombre: string): Promise<Mapa> {
  const json = JSONS[`../mapas/${nombre}/mapa.json`];
  const png = PNGS[`../mapas/${nombre}/alturas.png`];
  if (json === undefined || png === undefined) throw new Error(`no existe el mapa «${nombre}» (hay: ${MAPAS.join(', ')})`);
  const datos = leerDatosMapa(json);
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
  return { datos, alturas: alturasDesdeGris(datos, lienzo.width, lienzo.height, gris) };
}
