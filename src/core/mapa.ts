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
  /** Estación de desdoble: no se muestra hasta que la alcanza un remonte. */
  desdoble?: boolean;
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
  // Cimas. A cada nodo solo llega un remonte, así que cada pico tiene una
  // estación de desdoble pegada a la principal. Está oculta hasta que llega a
  // ella un segundo remonte; entonces el pico se ve con dos triángulos.
  { tipo: 'cima', x: 980, y: 820, gemelo: 7 },
  { tipo: 'cima', x: 1850, y: 560, gemelo: 8 },
  { tipo: 'cima', x: 1100, y: 826, gemelo: 5, desdoble: true },
  { tipo: 'cima', x: 1730, y: 566, gemelo: 6, desdoble: true },
];

export function crearNodos(alturas: MapaAlturas): Nodo[] {
  return DEFINICION.map((d, id) => ({ id, ...d, cota: Math.round(alturas.cotaEn(d)) }));
}
