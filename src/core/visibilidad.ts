// Qué se ve de cada punto del mapa en cada momento. Solo cambia lo que se
// ve; las reglas de qué se puede usar son las de la red.
// - En reposo, solo lo construido, con su cota: los puntos en uso (con
//   estaciones), los de la plaza y los destinos de pistas (también los de una
//   pista en espera: futuras bases). Ningún punto sin usar.
// - Mientras se arrastra desde un punto, con su cota: los destinos posibles
//   (más altos para un remonte, más bajos para una pista); los válidos,
//   marcados (los de una pista que quedaría en espera, de otra forma), y el
//   resto, atenuados.
// - En el editor de mapas (?ajustes) se ven todos.
import type { Motivo, MotivoTrazado, Red } from './red';

export type MarcaDestino = 'valido' | 'espera' | 'invalido';

export type VistaPunto = { tipo: 'oculto' } | { tipo: 'completo'; marca: MarcaDestino | null };

export interface ArrastreVisible {
  origen: number;
  /** Punto bajo el dedo, ya evaluado a fondo (ver Juego.moverArrastre). */
  objetivo: { nodo: number; motivo: Motivo | MotivoTrazado; espera?: boolean } | null;
}

/**
 * ¿Se muestra `destino` mientras se arrastra desde `origen`? Los más altos si
 * de él puede arrancar un remonte; los más bajos si de él pueden salir pistas.
 */
export function esDestinoPosible(red: Red, origen: number, destino: number): boolean {
  if (origen === destino) return false;
  const o = red.nodo(origen);
  if (red.nodo(destino).cota > o.cota) return red.puedeArrancar(origen);
  return o.tipo !== 'base' && red.activo(origen);
}

/**
 * Marca barata de un destino durante el arrastre: si sube, las reglas del
 * remonte salvo la bajada desde la llegada (cara); si baja, las de la pareja
 * sin trazar, y 'espera' si el destino aún no tiene salida. El punto bajo el
 * dedo se evalúa entero aparte.
 */
export function marcaDestino(red: Red, origen: number, destino: number): MarcaDestino {
  if (red.nodo(destino).cota > red.nodo(origen).cota) return red.puedeConstruirRemonte(origen, destino, false) === 'ok' ? 'valido' : 'invalido';
  if (red.puedeAbrirPista(origen, destino) !== 'ok') return 'invalido';
  return red.viable(destino) ? 'valido' : 'espera';
}

export function vistaPunto(red: Red, id: number, arrastre: ArrastreVisible | null, editor: boolean): VistaPunto {
  if (arrastre && id !== arrastre.origen && esDestinoPosible(red, arrastre.origen, id)) {
    const bajoElDedo = arrastre.objetivo?.nodo === id ? arrastre.objetivo : null;
    const marca: MarcaDestino = bajoElDedo ? (bajoElDedo.motivo !== 'ok' ? 'invalido' : bajoElDedo.espera ? 'espera' : 'valido') : marcaDestino(red, arrastre.origen, id);
    return { tipo: 'completo', marca };
  }
  const enUso = red.estacionesDe(id).length > 0 || red.nodo(id).tipo === 'base' || red.pistas.some((p) => p.hasta === id);
  return editor || enUso || id === arrastre?.origen ? { tipo: 'completo', marca: null } : { tipo: 'oculto' };
}
