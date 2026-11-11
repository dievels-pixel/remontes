// Mapa fijo del prototipo: posición y tipo de cada nodo, hecho a mano. Las
// cotas no se escriben aquí: salen del mapa de alturas.
import type { MapaAlturas } from './alturas';
import type { Nodo, TipoNodo } from './red';
import type { Punto } from './vector';

interface DefinicionNodo {
  tipo: TipoNodo;
  x: number;
  y: number;
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
  // Cimas.
  { tipo: 'cima', x: 980, y: 820 },
  { tipo: 'cima', x: 1850, y: 560 },
];

export function crearNodos(alturas: MapaAlturas): Nodo[] {
  return DEFINICION.map((d, id) => ({ id, ...d, cota: Math.round(alturas.cotaEn(d)) }));
}
