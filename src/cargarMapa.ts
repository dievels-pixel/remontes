// Carga en el navegador el mapa del juego: el JSON va dentro del paquete y el
// PNG de alturas lo decodifica el propio navegador.
import datosInicial from '../mapas/inicial/mapa.json';
import pngInicial from '../mapas/inicial/alturas.png?url';
import { alturasDesdeGris, leerDatosMapa, type Mapa } from './core/mapa';

export async function cargarMapaInicial(): Promise<Mapa> {
  const datos = leerDatosMapa(datosInicial);
  const img = new Image();
  img.src = pngInicial;
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
