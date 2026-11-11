// Confluencias: si el trazado de una pista nueva se encuentra con una pista
// existente, se une a ella y comparten el tramo, como en las estaciones de
// verdad. Si no van al mismo destino, la nueva se separa más abajo con un
// ramal hacia el suyo. El grafo no cambia (la pista sigue yendo de su origen
// a su destino): solo cambia la geometría.
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
  /**
   * Tramo del trazado (por longitud recorrida) que comparte con otra pista.
   * `inicioPista` es dónde empieza ese tramo medido sobre la otra pista.
   */
  compartido: { inicio: number; fin: number; pista: number; inicioPista: number } | null;
}

export interface ParametrosConfluencia {
  /** Longitud inicial sin buscar cruces (las pistas del mismo nodo salen juntas). */
  margenInicio: number;
  /** Tramo compartido mínimo para que la unión merezca la pena. */
  tramoMinimo: number;
  /** Longitud del acuerdo curvo al unirse (m), para que emboque tangente. */
  radioAcuerdo: number;
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

/** Dirección unitaria de la polilínea en la longitud s. */
function tangente(l: Polilinea, s: number): Punto {
  const e = Math.min(10, l.longitud / 4);
  const a = l.puntoEn(Math.max(s - e, 0));
  const b = l.puntoEn(Math.min(s + e, l.longitud));
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/** Bézier cúbica de a a b que sale con dirección ta y llega con dirección tb. */
function acuerdo(a: Punto, ta: Punto, b: Punto, tb: Punto, muestras = 16): Punto[] {
  const k = distancia(a, b) / 3;
  const c1 = { x: a.x + ta.x * k, y: a.y + ta.y * k };
  const c2 = { x: b.x - tb.x * k, y: b.y - tb.y * k };
  const r: Punto[] = [];
  for (let i = 0; i <= muestras; i++) {
    const t = i / muestras;
    const u = 1 - t;
    r.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return r;
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
  const r = p.radioAcuerdo;
  // Acuerdo de entrada: la nueva deja su trazado algo antes del encuentro y
  // entra en la existente algo después, tangente a las dos.
  const sA = Math.max(s - r, s * 0.5);
  const sB = Math.min(sPista + r, L);
  const entrada = [...propio.tramo(0, sA), ...acuerdo(propio.puntoEn(sA), tangente(propio, sA), pista.trazado.puntoEn(sB), tangente(pista.trazado, sB)).slice(1)];
  const inicio = new Polilinea(entrada).longitud;

  // Mismo destino: se queda en la existente hasta el final.
  if (pista.hasta === destino.id) {
    if (L - sB < p.tramoMinimo) return { trazado: propio, compartido: null };
    const puntos = [...entrada, ...pista.trazado.tramo(sB, L).slice(1)];
    return { trazado: new Polilinea(puntos), compartido: { inicio, fin: inicio + (L - sB), pista: pista.id, inicioPista: sB } };
  }

  // Otro destino: sigue la existente hasta el punto más cercano a su destino
  // que aún quede por encima de él, y ahí sale un ramal tangente.
  const cota = (sp: number) => pista.cotaDesde - (pista.cotaDesde - pista.cotaHasta) * (sp / L);
  let sSalida = sB;
  let dMin = Infinity;
  const pasos = 60;
  for (let k = 0; k <= pasos; k++) {
    const sp = sB + ((L - sB) * k) / pasos;
    if (cota(sp) <= destino.cota + 20) break;
    const d = distancia(pista.trazado.puntoEn(sp), destino);
    if (d < dMin) {
      dMin = d;
      sSalida = sp;
    }
  }
  // Si apenas comparten, mejor no unirlas: se cruzan sin más.
  if (sSalida - sB < p.tramoMinimo) return { trazado: propio, compartido: null };
  const salida = pista.trazado.puntoEn(sSalida);
  const haciaDestino = { x: destino.x - salida.x, y: destino.y - salida.y };
  const dd = Math.hypot(haciaDestino.x, haciaDestino.y) || 1;
  const ramal = acuerdo(salida, tangente(pista.trazado, sSalida), destino, { x: haciaDestino.x / dd, y: haciaDestino.y / dd }, 24);
  const puntos = [...entrada, ...pista.trazado.tramo(sB, sSalida).slice(1), ...ramal.slice(1)];
  return { trazado: new Polilinea(puntos), compartido: { inicio, fin: inicio + (sSalida - sB), pista: pista.id, inicioPista: sB } };
}

/**
 * Pistas existentes (distintas) que el trazado cruza sin unirse a ellas.
 * No cuentan el tramo inicial y el final (las pistas que salen o llegan al
 * mismo nodo se juntan ahí) ni la zona de la confluencia, ni los tramos que
 * las existentes comparten con otras (esos los dibuja la pista principal).
 */
export function pistasCruzadas(
  conf: Confluencia,
  existentes: (PistaExistente & { compartido: Confluencia['compartido'] })[],
  margen: number,
  radioAcuerdo: number,
): number {
  const t = conf.trazado;
  const L = t.longitud;
  const excluido = (s: number) =>
    s < margen ||
    s > L - margen ||
    (conf.compartido !== null && s > conf.compartido.inicio - 3 * radioAcuerdo && s < conf.compartido.fin + 2 * radioAcuerdo);
  let n = 0;
  for (const e of existentes) {
    const et = e.trazado;
    const visible = (s: number) => !e.compartido || s < e.compartido.inicio || s > e.compartido.fin;
    let cruza = false;
    for (let i = 1; i < t.puntos.length && !cruza; i++) {
      const sMedio = (t.acumulada[i - 1] + t.acumulada[i]) / 2;
      if (excluido(sMedio)) continue;
      for (let j = 1; j < et.puntos.length; j++) {
        if (!visible((et.acumulada[j - 1] + et.acumulada[j]) / 2)) continue;
        if (corte(t.puntos[i - 1], t.puntos[i], et.puntos[j - 1], et.puntos[j])) {
          cruza = true;
          break;
        }
      }
    }
    if (cruza) n++;
  }
  return n;
}
