// Qué se ve de cada punto del mapa en cada momento. Solo cambia lo que se
// ve; las reglas de qué se puede usar son las de la red.
// - Siempre, con su cota: los puntos en uso (con estaciones) y los de la plaza.
// - Un puntito gris, sin cota: donde ya se puede arrancar un remonte con algún
//   destino válido.
// - Mientras se arrastra desde un punto, con su cota: los destinos posibles
//   (más altos para un remonte, más bajos para una pista); los válidos,
//   marcados, y el resto, atenuados.
// - El resto, nada. En el editor de mapas (?ajustes) se ven todos.
import type { Motivo, MotivoTrazado, Red } from './red';

export type VistaPunto = { tipo: 'oculto' } | { tipo: 'discreto' } | { tipo: 'completo'; marca: 'valido' | 'invalido' | null };

export interface ArrastreVisible {
  origen: number;
  /** Punto bajo el dedo, ya evaluado a fondo (ver Juego.moverArrastre). */
  objetivo: { nodo: number; motivo: Motivo | MotivoTrazado } | null;
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
 * sin trazar. El punto bajo el dedo se evalúa entero aparte.
 */
export function destinoValido(red: Red, origen: number, destino: number): boolean {
  if (red.nodo(destino).cota > red.nodo(origen).cota) return red.puedeConstruirRemonte(origen, destino, false) === 'ok';
  return red.puedeAbrirPista(origen, destino) === 'ok';
}

export function vistaPunto(red: Red, id: number, arrastre: ArrastreVisible | null, editor: boolean): VistaPunto {
  const enUso = red.estacionesDe(id).length > 0 || red.nodo(id).tipo === 'base';
  if (arrastre && id !== arrastre.origen && esDestinoPosible(red, arrastre.origen, id)) {
    const bajoElDedo = arrastre.objetivo?.nodo === id ? arrastre.objetivo : null;
    const valido = bajoElDedo ? bajoElDedo.motivo === 'ok' : destinoValido(red, arrastre.origen, id);
    return { tipo: 'completo', marca: valido ? 'valido' : 'invalido' };
  }
  if (editor || enUso || id === arrastre?.origen) return { tipo: 'completo', marca: null };
  return red.tieneDestinoDeRemonte(id) ? { tipo: 'discreto' } : { tipo: 'oculto' };
}
