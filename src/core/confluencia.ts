// Confluencias: si el trazado de una pista nueva se encuentra con una pista
// existente, se une a ella y comparten el tramo, como en las estaciones de
// verdad. Si no van al mismo destino, la nueva se separa más abajo con un
// ramal hacia el suyo. El grafo no cambia (la pista sigue yendo de su origen
// a su destino): solo cambia la geometría.
import { trazarPista } from './curva';
import { Polilinea } from './polilinea';
import { distancia, type Punto } from './vector';

/** Lo que la confluencia necesita saber de una pista existente. */
export interface PistaExistente {
  id: number;
  hasta: number;
  trazado: Polilinea;
  cotaDesde: number;
  cotaHasta: number;
}

export interface Confluencia {
  trazado: Polilinea;
  /** Tramo del trazado (por longitud recorrida) que comparte con otra pista. */
  compartido: { inicio: number; fin: number; pista: number } | null;
}

export interface ParametrosConfluencia {
  /** Longitud inicial sin buscar cruces (las pistas del mismo nodo salen juntas). */
  margenInicio: number;
  /** Tramo compartido mínimo para que la unión merezca la pena. */
  tramoMinimo: number;
  abombamientoRamal: number;
}

/** Corte de los segmentos ab y cd: parámetros t (en ab) y u (en cd), o null. */
function corte(a: Punto, b: Punto, c: Punto, d: Punto): { t: number; u: number } | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (den === 0) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Primer punto (por longitud de la nueva) donde toca a una pista existente. */
export function primerEncuentro(
  propio: Polilinea,
  existentes: PistaExistente[],
  margenInicio: number,
): { s: number; pista: PistaExistente; sPista: number } | null {
  const pp = propio.puntos;
  for (let i = 1; i < pp.length; i++) {
    if (propio.acumulada[i] < margenInicio) continue;
    let mejor: { s: number; pista: PistaExistente; sPista: number } | null = null;
    for (const e of existentes) {
      const ep = e.trazado.puntos;
      for (let j = 1; j < ep.length; j++) {
        const k = corte(pp[i - 1], pp[i], ep[j - 1], ep[j]);
        if (!k) continue;
        const s = propio.acumulada[i - 1] + k.t * (propio.acumulada[i] - propio.acumulada[i - 1]);
        if (s < margenInicio) continue;
        const sPista = e.trazado.acumulada[j - 1] + k.u * (e.trazado.acumulada[j] - e.trazado.acumulada[j - 1]);
        if (!mejor || s < mejor.s) mejor = { s, pista: e, sPista };
      }
    }
    if (mejor) return mejor;
  }
  return null;
}

export function confluir(
  propio: Polilinea,
  destino: Punto & { id: number; cota: number },
  existentes: PistaExistente[],
  p: ParametrosConfluencia,
): Confluencia {
  const encuentro = primerEncuentro(propio, existentes, p.margenInicio);
  if (!encuentro) return { trazado: propio, compartido: null };
  const { s, pista, sPista } = encuentro;
  const L = pista.trazado.longitud;
  const tramoPropio = propio.tramo(0, s);

  // Mismo destino: se queda en la existente hasta el final.
  if (pista.hasta === destino.id) {
    if (L - sPista < p.tramoMinimo) return { trazado: propio, compartido: null };
    const puntos = [...tramoPropio, ...pista.trazado.tramo(sPista, L).slice(1)];
    return { trazado: new Polilinea(puntos), compartido: { inicio: s, fin: s + (L - sPista), pista: pista.id } };
  }

  // Otro destino: sigue la existente hasta el punto más cercano a su destino
  // que aún quede por encima de él, y ahí sale un ramal.
  const cota = (sp: number) => pista.cotaDesde - (pista.cotaDesde - pista.cotaHasta) * (sp / L);
  let sSalida = sPista;
  let dMin = Infinity;
  const pasos = 60;
  for (let k = 0; k <= pasos; k++) {
    const sp = sPista + ((L - sPista) * k) / pasos;
    if (cota(sp) <= destino.cota + 20) break;
    const d = distancia(pista.trazado.puntoEn(sp), destino);
    if (d < dMin) {
      dMin = d;
      sSalida = sp;
    }
  }
  // Si apenas comparten, mejor no unirlas: se cruzan sin más.
  if (sSalida - sPista < p.tramoMinimo) return { trazado: propio, compartido: null };
  const salida = pista.trazado.puntoEn(sSalida);
  const ramal = trazarPista(salida, destino, { lado: 1, abombamiento: p.abombamientoRamal, ondas: 1 }, 0);
  const puntos = [...tramoPropio, ...pista.trazado.tramo(sPista, sSalida).slice(1), ...ramal.puntos.slice(1)];
  return { trazado: new Polilinea(puntos), compartido: { inicio: s, fin: s + (sSalida - sPista), pista: pista.id } };
}
