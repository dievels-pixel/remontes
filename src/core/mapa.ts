// Mapa fijo del prototipo: posición y tipo de cada nodo, hecho a mano. Las
// cotas no se escriben aquí: salen del mapa de alturas.
import type { MapaAlturas } from './alturas';
import type { Nodo, TipoNodo } from './red';
import type { Punto } from './vector';

interface DefinicionNodo {
  tipo: TipoNodo;
  x: number;
  y: number;
  /** Índice de la otra estación del mismo pico, si la hay. */
  gemelo?: number;
}

/** Centro de la plaza del pie de pistas y punto único de entrada. */
export const PLAZA: Punto & { radio: number } = { x: 1200, y: 2930, radio: 170 };

const DEFINICION: DefinicionNodo[] = [
  // Inicios alrededor de la plaza.
  { tipo: 'base', x: 930, y: 2840 },
  { tipo: 'base', x: 1200, y: 2700 },
  { tipo: 'base', x: 1470, y: 2840 },
  // Intermedios.
  { tipo: 'intermedio', x: 620, y: 1950 },
  { tipo: 'intermedio', x: 1700, y: 1800 },
  // Cimas. Cada pico tiene dos estaciones gemelas, porque a cada nodo solo
  // llega un remonte y así un pico admite dos.
  { tipo: 'cima', x: 980, y: 820, gemelo: 7 },
  { tipo: 'cima', x: 1850, y: 560, gemelo: 8 },
  { tipo: 'cima', x: 1180, y: 840, gemelo: 5 },
  { tipo: 'cima', x: 1650, y: 580, gemelo: 6 },
];

export function crearNodos(alturas: MapaAlturas): Nodo[] {
  return DEFINICION.map((d, id) => ({ id, ...d, cota: Math.round(alturas.cotaEn(d)) }));
}
