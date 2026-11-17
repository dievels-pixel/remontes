// Carga un nivel de niveles/<id>/ desde el disco (pruebas y scripts): el
// mismo montaje que hace el navegador en src/niveles.ts, con mascara.png si
// la carpeta la trae.
import { existsSync, readFileSync } from 'node:fs';
import { montarMapa, type Mapa } from '../src/core/mapa';
import { leerNivel, type DatosNivel } from '../src/core/nivel';
import { decodificarPngGris } from './png';

export function cargarNivelDeDisco(carpeta: string): { nivel: DatosNivel; mapa: Mapa; columnas: number; filas: number } {
  const nivel = leerNivel(JSON.parse(readFileSync(`${carpeta}/nivel.json`, 'utf8')));
  const png = decodificarPngGris(readFileSync(`${carpeta}/alturas.png`));
  const mascara = existsSync(`${carpeta}/mascara.png`) ? decodificarPngGris(readFileSync(`${carpeta}/mascara.png`)) : null;
  if (mascara && (mascara.ancho !== png.ancho || mascara.alto !== png.alto)) throw new Error('Nivel no válido: mascara.png no tiene el tamaño de alturas.png');
  return { nivel, mapa: montarMapa(nivel.mapa, png.ancho, png.alto, png.gris, mascara?.gris), columnas: png.ancho, filas: png.alto };
}
