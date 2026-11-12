// Proyectos de pista: pistas posibles que se proponen a trazos para que el
// jugador las active eligiendo color. Solo se proponen las que se podrían
// abrir ya (origen activo, destino viable, algún color posible).
import { distancia } from './vector';
import type { Red, Remonte } from './red';

export interface Proyecto {
  desde: number;
  hasta: number;
  lado: 1 | -1;
  /**
   * Giro de salida (grados) de una salida orientada, cuando hace falta para
   * que quepa entre las salidas que ya hay. Sin él, sale sin girar.
   */
  giro?: number;
}

export function claveProyecto(p: Proyecto): string {
  return `${p.desde}>${p.hasta}:${p.lado}:${p.giro ?? ''}`;
}

/** Completa el proyecto con el giro de su salida, si lo necesita. */
function conSalida(red: Red, p: Proyecto): Proyecto {
  const ab = red.giroLimpio(p.desde, p.hasta, p.lado);
  return typeof ab === 'number' ? { ...p, giro: ab } : p;
}

/** Se puede abrir y su trazado previsto no enmaraña (ver Red.trazadoLimpio). */
function abrible(red: Red, p: Proyecto): boolean {
  return red.puedeAbrirPista(p.desde, p.hasta, undefined, p.lado) === 'ok' && red.trazadoLimpio(p.desde, p.hasta, p.lado);
}

/** Los `max` nodos más cercanos a `nodo` que cumplen el filtro. */
function cercanos(red: Red, nodo: number, filtro: (otro: number) => boolean, max: number): number[] {
  return red.nodos
    .filter((n) => n.id !== nodo && filtro(n.id))
    .sort((a, b) => distancia(a, red.nodo(nodo)) - distancia(b, red.nodo(nodo)))
    .slice(0, max)
    .map((n) => n.id);
}

/**
 * Pistas que saldrían de `nodo`: las dos laterales hacia la base de cada
 * remonte que llega a él (forma de lente) y, además, hacia los `max` nodos
 * más bajos y cercanos donde se puede abrir alguna.
 */
export function proyectosDesde(red: Red, nodo: number, max: number): Proyecto[] {
  const r: Proyecto[] = [];
  const bajadasDeRemonte = new Set(red.remontes.filter((x) => x.hasta === nodo).map((x) => x.desde));
  for (const x of bajadasDeRemonte) for (const lado of red.ladosLibres(nodo, x)) r.push({ desde: nodo, hasta: x, lado });
  const otros = cercanos(
    red,
    nodo,
    (h) => !bajadasDeRemonte.has(h) && red.ladoLibre(nodo, h) !== null && abrible(red, { desde: nodo, hasta: h, lado: ladoConSalida(red, nodo, h) }),
    max,
  );
  for (const h of otros) r.push({ desde: nodo, hasta: h, lado: ladoConSalida(red, nodo, h) });
  return r.filter((p) => abrible(red, p)).map((p) => conSalida(red, p));
}

/**
 * Lado de una pista que no es lateral: el preferido (ladoLibre) si con él
 * cabe su salida; si no, y la pareja aún no tiene pistas, el contrario, que
 * gira la salida hacia el otro lado.
 */
function ladoConSalida(red: Red, desde: number, hasta: number): 1 | -1 {
  const preferido = red.ladoLibre(desde, hasta)!;
  if (red.giroLimpio(desde, hasta, preferido) !== null) return preferido;
  const otro = -preferido as 1 | -1;
  return red.ladosLibres(desde, hasta).includes(otro) && red.giroLimpio(desde, hasta, otro) !== null ? otro : preferido;
}

/** Pistas que llegarían a `nodo` desde los `max` nodos más altos y cercanos. */
export function proyectosHacia(red: Red, nodo: number, max: number): Proyecto[] {
  const origenes = cercanos(
    red,
    nodo,
    (d) => red.ladoLibre(d, nodo) !== null && abrible(red, { desde: d, hasta: nodo, lado: ladoConSalida(red, d, nodo) }),
    max,
  );
  return origenes.map((d) => conSalida(red, { desde: d, hasta: nodo, lado: ladoConSalida(red, d, nodo) }));
}

/** Proyectos al construir un remonte X→T: desde T y hacia X. */
export function proyectosDeRemonte(red: Red, r: Remonte, max: number): Proyecto[] {
  const vistos = new Set<string>();
  const res: Proyecto[] = [];
  for (const p of [...proyectosDesde(red, r.hasta, max), ...proyectosHacia(red, r.desde, max)]) {
    const k = claveProyecto(p);
    if (!vistos.has(k)) {
      vistos.add(k);
      res.push(p);
    }
  }
  return res;
}
