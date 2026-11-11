import { CONFIG } from '../src/config';
import { Red, type Nodo, type ReglasRed } from '../src/core/red';

export const REGLAS: ReglasRed = {
  desnivelMinimoRemonte: CONFIG.remonte.desnivelMinimo,
  maxPistasPorPareja: CONFIG.pista.maxPorPareja,
  curva: CONFIG.pista,
};

/** Red de prueba: 0 y 1 bases, 2 intermedio, 3 cima. */
export function redPequena(): Red {
  const nodos: Nodo[] = [
    { id: 0, tipo: 'base', x: 0, y: 1000, cota: 1500 },
    { id: 1, tipo: 'base', x: 300, y: 1000, cota: 1510 },
    { id: 2, tipo: 'intermedio', x: 100, y: 500, cota: 1900 },
    { id: 3, tipo: 'cima', x: 200, y: 0, cota: 2400 },
  ];
  return new Red(nodos, REGLAS);
}
