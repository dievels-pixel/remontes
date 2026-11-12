// Editor del mapa de pruebas (herramienta de calibración, ?ajustes): al mover,
// añadir o borrar un punto, o al cambiar el desnivel, se rehace la red sobre
// el mapa nuevo repitiendo las construcciones en su orden. Las que ya no se
// pueden hacer (el punto se borró, el remonte ya no sube, la pista no cabe) se
// omiten, y con ellas las que dependían de ellas.
import type { DatosMapa, DefinicionNodo } from './mapa';
import type { Red } from './red';
import { distancia, type Punto } from './vector';

export interface ResultadoReconstruccion {
  hechas: number;
  omitidas: number;
}

/**
 * Repite en `nueva` las construcciones de `antigua`. `ids[i]` es el id en la
 * red nueva del nodo `i` de la antigua, o null si se ha borrado.
 */
export function reconstruirRed(antigua: Red, nueva: Red, ids: readonly (number | null)[]): ResultadoReconstruccion {
  let hechas = 0;
  let omitidas = 0;
  for (const h of antigua.construcciones) {
    const x = h.tipo === 'remonte' ? h.remonte : h.pista;
    const desde = ids[x.desde];
    const hasta = ids[x.hasta];
    let ok = false;
    if (desde !== null && desde !== undefined && hasta !== null && hasta !== undefined) {
      if (h.tipo === 'remonte') {
        if (nueva.puedeConstruirRemonte(desde, hasta) === 'ok') {
          nueva.construirRemonte(desde, hasta);
          ok = true;
        }
      } else {
        const { color, lado } = h.pista;
        // El giro de salida era para la geometría vieja: si con él ya no queda
        // limpia, se busca otro. Si ninguno vale, se abre igualmente (es una
        // herramienta de pruebas: mejor conservar la red que perderla).
        let giro = h.pista.giro;
        const limpia = (g?: number) => nueva.coloresLimpios(desde, hasta, lado, g).find((c) => c.color === color)?.factible;
        if (!limpia(giro)) {
          const g = nueva.giroLimpio(desde, hasta, lado);
          giro = typeof g === 'number' ? g : undefined;
        }
        if (nueva.puedeAbrirPista(desde, hasta, color, lado, giro) === 'ok') {
          nueva.abrirPista(desde, hasta, color, lado, giro);
          ok = true;
        }
      }
    }
    if (ok) hechas++;
    else omitidas++;
  }
  return { hechas, omitidas };
}

/** Correspondencia de ids tras borrar el nodo `borrado` de `n` nodos. */
export function idsTrasBorrar(n: number, borrado: number): (number | null)[] {
  return Array.from({ length: n }, (_, i) => (i === borrado ? null : i < borrado ? i : i - 1));
}

/** Correspondencia identidad (mover un punto, añadir uno al final, desnivel). */
export function idsIguales(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export interface LimitesMapa {
  ancho: number;
  alto: number;
  /** Distancia mínima a otro punto. */
  separacion: number;
  /** Zona prohibida (la plaza), con su margen ya sumado al radio. */
  obstaculo: Punto & { radio: number };
}

/** ¿Se puede colocar un punto en `p`? `ignorar`: el que se está moviendo. */
export function sitioLibre(def: readonly DefinicionNodo[], p: Punto, l: LimitesMapa, ignorar?: number): boolean {
  if (p.x < 0 || p.y < 0 || p.x > l.ancho || p.y > l.alto) return false;
  if (distancia(p, l.obstaculo) < l.obstaculo.radio) return false;
  return def.every((d, i) => i === ignorar || distancia(d, p) >= l.separacion);
}

/**
 * JSON del mapa con los puntos y la cota máxima editados, listo para guardar
 * como mapas/<nombre>/mapa.json (el PNG de alturas no cambia).
 */
export function textoMapa(datos: DatosMapa, nodos: readonly DefinicionNodo[], cotaMax: number): string {
  const limpios = nodos.map((d) => ({ tipo: d.tipo, x: Math.round(d.x), y: Math.round(d.y) }));
  return JSON.stringify({ ...datos, cotaMax, nodos: limpios }, null, 2) + '\n';
}
