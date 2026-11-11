// Proyectos de pista: pistas posibles que se proponen a trazos para que el
// jugador las active eligiendo color. Solo se proponen las que se podrían
// abrir ya (origen activo, destino viable, algún color posible).
import { distancia } from './vector';
import type { Red, Remonte } from './red';

export interface Proyecto {
  desde: number;
  hasta: number;
  lado: 1 | -1;
}

export function claveProyecto(p: Proyecto): string {
  return `${p.desde}>${p.hasta}:${p.lado}`;
}

function abrible(red: Red, p: Proyecto): boolean {
  return red.puedeAbrirPista(p.desde, p.hasta, undefined, p.lado) === 'ok';
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
    (h) => !bajadasDeRemonte.has(h) && red.ladoLibre(nodo, h) !== null && abrible(red, { desde: nodo, hasta: h, lado: red.ladoLibre(nodo, h)! }),
    max,
  );
  for (const h of otros) r.push({ desde: nodo, hasta: h, lado: red.ladoLibre(nodo, h)! });
  return r.filter((p) => abrible(red, p));
}

/** Pistas que llegarían a `nodo` desde los `max` nodos más altos y cercanos. */
export function proyectosHacia(red: Red, nodo: number, max: number): Proyecto[] {
  const origenes = cercanos(
    red,
    nodo,
    (d) => red.ladoLibre(d, nodo) !== null && abrible(red, { desde: d, hasta: nodo, lado: red.ladoLibre(d, nodo)! }),
    max,
  );
  return origenes.map((d) => ({ desde: d, hasta: nodo, lado: red.ladoLibre(d, nodo)! }));
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
