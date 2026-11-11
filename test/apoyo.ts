import { CONFIG } from '../src/config';
import { Red, type Nodo, type ReglasRed } from '../src/core/red';

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
  return new Red(nodos, REGLAS);
}

/** Abre una pista con el primer color posible. */
export function abrir(red: Red, desde: number, hasta: number) {
  const lado = red.ladoLibre(desde, hasta) ?? 1;
  const c = red.colores(desde, hasta, lado).find((x) => x.factible);
  if (!c) throw new Error(`Sin color posible para ${desde}→${hasta}`);
  return red.abrirPista(desde, hasta, c.color);
}
