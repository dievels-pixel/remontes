// Pista elegida por el jugador: arrastra desde un punto hacia otro más bajo y,
// al soltar, se evalúa si cabe, por qué lado y con qué colores. Si no cabe
// ninguna, se dice por qué. (Hasta v30 el juego proponía pistas a trazos; ya
// no: el jugador elige el inicio y el destino.)
import type { Factibilidad } from './colores';
import type { Motivo, MotivoTrazado, Red } from './red';

/** Pareja y lado de una pista por abrir. */
export interface Proyecto {
  desde: number;
  hasta: number;
  lado: 1 | -1;
  /** Giro de salida (grados) con el que se dibuja su vista previa, si lo necesita. */
  giro?: number;
}

export function claveProyecto(p: Proyecto): string {
  return `${p.desde}>${p.hasta}:${p.lado}:${p.giro ?? ''}`;
}

/** Color con su propio giro de salida (ver Red.coloresElegibles). */
export type ColorElegible = Factibilidad & { giro?: number };

export type EvaluacionPista =
  | { motivo: 'ok'; proyecto: Proyecto; colores: ColorElegible[] }
  | { motivo: Exclude<Motivo, 'ok'> | MotivoTrazado };

/**
 * ¿Se puede abrir una pista de `desde` a `hasta`? Primero las reglas de la
 * pareja (origen activo, destino más bajo y con salida, pendiente…). Después,
 * de los lados libres se elige el que deja más colores limpios. Si ninguno
 * deja ninguno, el motivo es el fallo más repetido entre los trazados reales
 * de los colores que caben por pendiente (roca, plaza, cruces…).
 */
export function evaluarPista(red: Red, desde: number, hasta: number): EvaluacionPista {
  const motivo = red.puedeAbrirPista(desde, hasta);
  if (motivo !== 'ok') return { motivo };
  let mejor: { lado: 1 | -1; colores: ColorElegible[]; n: number } | null = null;
  for (const lado of red.ladosLibres(desde, hasta)) {
    const colores = red.coloresElegibles(desde, hasta, lado);
    const n = colores.filter((c) => c.factible).length;
    if (!mejor || n > mejor.n) mejor = { lado, colores, n };
  }
  if (mejor && mejor.n > 0) {
    // La vista previa, con el giro del color limpio que menos serpentea.
    const limpio = mejor.colores.filter((c) => c.factible).reduce((m, c) => (c.s < m.s ? c : m));
    return { motivo: 'ok', proyecto: { desde, hasta, lado: mejor.lado, giro: limpio.giro }, colores: mejor.colores };
  }
  const cuenta = new Map<MotivoTrazado, number>();
  for (const lado of red.ladosLibres(desde, hasta)) {
    for (const c of red.colores(desde, hasta, lado)) {
      if (!c.factible) continue;
      const conf = red.trazadoReal(desde, hasta, lado, c.color);
      if (!conf) continue;
      const m = red.motivoTrazado(desde, hasta, conf);
      if (m !== 'ok') cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    }
  }
  const peor = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  return { motivo: peor ? peor[0] : 'sin-color' };
}
