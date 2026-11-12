import { readFileSync } from 'node:fs';
import { decodificarPngGris } from '../scripts/png';
import { CONFIG } from '../src/config';
import { alturasDesdeGris, leerDatosMapa, type Mapa } from '../src/core/mapa';
import type { Bandas } from '../src/core/colores';
import { Red, type Nodo, type ReglasRed } from '../src/core/red';

/** Bandas sin solape con las que se escribieron las primeras pruebas. */
export const BANDAS_CLASICAS: Bandas = {
  verde: [0.05, 0.15],
  azul: [0.15, 0.25],
  roja: [0.25, 0.4],
  negra: [0.4, 0.6],
};

export const REGLAS: ReglasRed = {
  desnivelMinimoRemonte: CONFIG.remonte.desnivelMinimo,
  maxPistasPorPareja: CONFIG.pista.maxPorPareja,
  pista: CONFIG.pista,
  maxEstacionesPorNodo: CONFIG.estaciones.maxPorEmplazamiento,
};

/**
 * Red de prueba con proporciones de montaña: 0 y 1 bases, 2 intermedio,
 * 3 cima. Pendientes en recta entre 0,25 y 0,33.
 */
export function redPequena(): Red {
  const nodos: Nodo[] = [
    { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
    { id: 1, tipo: 'base', x: 300, y: 3000, cota: 1510 },
    { id: 2, tipo: 'intermedio', x: 200, y: 1500, cota: 1900 },
    { id: 3, tipo: 'cima', x: 400, y: 0, cota: 2400 },
  ];
  // Copia propia de los parámetros de pista: hay pruebas que los cambian.
  return new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista } });
}

/** Abre una pista con el primer color posible. */
export function abrir(red: Red, desde: number, hasta: number) {
  const lado = red.ladoLibre(desde, hasta) ?? 1;
  const c = red.colores(desde, hasta, lado).find((x) => x.factible);
  if (!c) throw new Error(`Sin color posible para ${desde}→${hasta}`);
  return red.abrirPista(desde, hasta, c.color);
}

/**
 * Fija los valores de pista con los que se escribieron algunas pruebas
 * (pendiente central de la banda, sinuosidad máxima 2 y bandas sin solape), para que no dependan
 * de la calibración de config.ts.
 */
export function conValoresClasicos(red: Red): Red {
  Object.assign(red.reglas.pista, { pendienteObjetivo: 'central', sinuosidadMaxima: 2, bandas: BANDAS_CLASICAS });
  return red;
}

/** Mapa del juego (mapas/inicial), leído del PNG y el JSON como en el navegador. */
export function mapaInicial(): Mapa {
  return cargarMapaPrueba('inicial');
}

/** Un mapa de mapas/<nombre>, leído del PNG y el JSON como en el navegador. */
export function cargarMapaPrueba(nombre: string): Mapa {
  const datos = leerDatosMapa(JSON.parse(readFileSync(`mapas/${nombre}/mapa.json`, 'utf8')));
  const png = decodificarPngGris(readFileSync(`mapas/${nombre}/alturas.png`));
  return { datos, alturas: alturasDesdeGris(datos, png.ancho, png.alto, png.gris) };
}
