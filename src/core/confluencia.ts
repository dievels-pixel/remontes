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
  /** Acercarse a otra pista a menos de esta distancia (m) cuenta como encuentro. */
  distanciaMinima?: number;
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

/** Punto de la polilínea más cercano a p: distancia y longitud recorrida hasta él. */
export function puntoMasCercano(l: Polilinea, p: Punto): { d: number; s: number } {
  let mejor = { d: Infinity, s: 0 };
  for (let j = 1; j < l.puntos.length; j++) {
    const a = l.puntos[j - 1];
    const b = l.puntos[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0), 1) : 0;
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < mejor.d) mejor = { d, s: l.acumulada[j - 1] + t * (l.acumulada[j] - l.acumulada[j - 1]) };
  }
  return mejor;
}

/**
 * Índice espacial de los tramos de varias polilíneas: una rejilla en la que
 * cada tramo se apunta en las casillas que toca su caja. Sirve para comparar
 * un tramo o un punto solo con los tramos cercanos en vez de con todos (antes
 * se comparaba todo con todo y era lo que más tardaba al evaluar una pista).
 * Los candidatos salen en el mismo orden que el recorrido completo (polilínea
 * k y tramo j crecientes), así que los resultados, desempates incluidos, son
 * los mismos.
 */
export class IndiceTramos {
  /** Índice global del primer tramo de cada polilínea (el tramo j es el que acaba en el punto j). */
  private readonly inicio: number[] = [];
  private readonly k: number[] = [];
  private readonly j: number[] = [];
  private readonly celdas = new Map<number, number[]>();
  private readonly marca: Int32Array;
  private consulta = 0;

  constructor(
    readonly lineas: readonly Polilinea[],
    private readonly celda = 100,
  ) {
    let g = 0;
    lineas.forEach((l, k) => {
      this.inicio.push(g);
      for (let j = 1; j < l.puntos.length; j++, g++) {
        this.k.push(k);
        this.j.push(j);
        const a = l.puntos[j - 1];
        const b = l.puntos[j];
        this.recorrer(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), (c) => {
          let lista = this.celdas.get(c);
          if (!lista) this.celdas.set(c, (lista = []));
          lista.push(g);
        });
      }
    });
    this.marca = new Int32Array(g);
  }

  private recorrer(x0: number, y0: number, x1: number, y1: number, f: (c: number) => void): void {
    const c = this.celda;
    const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c), j0 = Math.floor(y0 / c), j1 = Math.floor(y1 / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f((i + 10000) * 20000 + (j + 10000));
  }

  /**
   * Tramos cuya caja comparte casilla con el rectángulo dado, ordenados por
   * polilínea y tramo: { k, j } (el tramo j va del punto j-1 al j).
   */
  candidatos(x0: number, y0: number, x1: number, y1: number): { k: number; j: number }[] {
    const id = ++this.consulta;
    const gs: number[] = [];
    this.recorrer(x0, y0, x1, y1, (c) => {
      const lista = this.celdas.get(c);
      if (!lista) return;
      for (const g of lista) {
        if (this.marca[g] === id) continue;
        this.marca[g] = id;
        gs.push(g);
      }
    });
    gs.sort((a, b) => a - b);
    return gs.map((g) => ({ k: this.k[g], j: this.j[g] }));
  }

  /**
   * Punto más cercano a p de la polilínea k entre los candidatos dados (los de
   * esa polilínea, en orden): igual que puntoMasCercano si el más cercano está
   * dentro del rectángulo consultado; si no hay candidatos, d = Infinity.
   */
  static masCercano(l: Polilinea, js: readonly number[], p: Punto): { d: number; s: number } {
    let mejor = { d: Infinity, s: 0 };
    for (const j of js) {
      const a = l.puntos[j - 1];
      const b = l.puntos[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0), 1) : 0;
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
      if (d < mejor.d) mejor = { d, s: l.acumulada[j - 1] + t * (l.acumulada[j] - l.acumulada[j - 1]) };
    }
    return mejor;
  }
}

/**
 * Índice de los trazados de estas pistas: se reutiliza el último mientras sean
 * exactamente los mismos objetos (casi siempre, todas las pistas de la red),
 * porque se consulta varias veces por cada pista que se evalúa.
 */
let ultimoIndice: IndiceTramos | null = null;
function indiceDe(existentes: readonly { trazado: Polilinea }[]): IndiceTramos {
  const u = ultimoIndice;
  if (u && u.lineas.length === existentes.length && existentes.every((e, k) => e.trazado === u.lineas[k])) return u;
  return (ultimoIndice = new IndiceTramos(existentes.map((e) => e.trazado)));
}

/** Agrupa candidatos { k, j } (ya ordenados) por polilínea: k → tramos j. */
function porLinea(cands: { k: number; j: number }[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const { k, j } of cands) {
    let js = m.get(k);
    if (!js) m.set(k, (js = []));
    js.push(j);
  }
  return m;
}

/** Caja que envuelve la polilínea, ampliada un margen. */
function caja(l: Polilinea, m: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of l.puntos) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
}

/**
 * Primer punto (por longitud de la nueva) donde se encuentra con una pista
 * existente: donde la cruza o, antes, donde se le acerca a menos de
 * `distanciaMinima` (así no quedan pistas paralelas casi pegadas).
 */
export function primerEncuentro(
  propio: Polilinea,
  existentes: PistaExistente[],
  margenInicio: number,
  distanciaMinima = 0,
): { s: number; pista: PistaExistente; sPista: number } | null {
  const pp = propio.puntos;
  const cajas = existentes.map((e) => caja(e.trazado, distanciaMinima));
  const indice = indiceDe(existentes);
  for (let i = 1; i < pp.length; i++) {
    if (propio.acumulada[i] < margenInicio) continue;
    let mejor: { s: number; pista: PistaExistente; sPista: number } | null = null;
    // Solo los tramos cerca de este (la caja del tramo, ampliada la distancia
    // mínima, cubre los cortes y el acercamiento del punto i).
    const a = pp[i - 1];
    const b = pp[i];
    const m = distanciaMinima;
    const cerca = porLinea(indice.candidatos(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m));
    for (const [k, js] of cerca) {
      const e = existentes[k];
      for (const j of js) {
        const ep = e.trazado.puntos;
        const c = corte(a, b, ep[j - 1], ep[j]);
        if (!c) continue;
        const s = propio.acumulada[i - 1] + c.t * (propio.acumulada[i] - propio.acumulada[i - 1]);
        if (s < margenInicio) continue;
        const sPista = e.trazado.acumulada[j - 1] + c.u * (e.trazado.acumulada[j] - e.trazado.acumulada[j - 1]);
        if (!mejor || s < mejor.s) mejor = { s, pista: e, sPista };
      }
      // Acercamiento: el punto i a menos de la distancia mínima.
      const cj = cajas[k];
      if (distanciaMinima > 0 && b.x >= cj.x0 && b.x <= cj.x1 && b.y >= cj.y0 && b.y <= cj.y1) {
        const mc = IndiceTramos.masCercano(e.trazado, js, b);
        if (mc.d < distanciaMinima && (!mejor || propio.acumulada[i] < mejor.s)) mejor = { s: propio.acumulada[i], pista: e, sPista: mc.s };
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
  const encuentro = primerEncuentro(propio, existentes, p.margenInicio, p.distanciaMinima ?? 0);
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
  // Con el índice: para cada tramo propio, solo los tramos existentes cerca.
  const indice = indiceDe(existentes);
  const cruzadas = new Set<number>();
  for (let i = 1; i < t.puntos.length; i++) {
    const sMedio = (t.acumulada[i - 1] + t.acumulada[i]) / 2;
    if (excluido(sMedio)) continue;
    const a = t.puntos[i - 1];
    const b = t.puntos[i];
    for (const { k, j } of indice.candidatos(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y))) {
      if (cruzadas.has(k)) continue;
      const e = existentes[k];
      const et = e.trazado;
      const visible = !e.compartido || (et.acumulada[j - 1] + et.acumulada[j]) / 2 < e.compartido.inicio || (et.acumulada[j - 1] + et.acumulada[j]) / 2 > e.compartido.fin;
      if (visible && corte(a, b, et.puntos[j - 1], et.puntos[j])) cruzadas.add(k);
    }
  }
  return cruzadas.size;
}

/**
 * ¿Queda alguna pista existente a menos de `distancia` del trazado, fuera de
 * los tramos inicial y final y de la zona de su propia confluencia? Si es así,
 * la pista iría casi pegada a otra sin unirse a ella.
 */
export function demasiadoCerca(
  conf: Confluencia,
  existentes: (PistaExistente & { compartido: Confluencia['compartido'] })[],
  distancia: number,
  margen: number,
  radioAcuerdo: number,
): boolean {
  if (distancia <= 0) return false;
  const t = conf.trazado;
  const L = t.longitud;
  const excluido = (s: number) =>
    s < margen ||
    s > L - margen ||
    (conf.compartido !== null && s > conf.compartido.inicio - 3 * radioAcuerdo && s < conf.compartido.fin + 2 * radioAcuerdo);
  // Con el índice: para cada punto, solo los tramos a menos de `distancia`
  // (si el más cercano de una pista está más lejos, no cuenta de todos modos).
  const indice = indiceDe(existentes);
  for (let i = 0; i < t.puntos.length; i++) {
    const q = t.puntos[i];
    if (excluido(t.acumulada[i])) continue;
    for (const [k, js] of porLinea(indice.candidatos(q.x - distancia, q.y - distancia, q.x + distancia, q.y + distancia))) {
      const e = existentes[k];
      const m = IndiceTramos.masCercano(e.trazado, js, q);
      const visible = !e.compartido || m.s < e.compartido.inicio || m.s > e.compartido.fin;
      if (visible && m.d < distancia) return true;
    }
  }
  return false;
}
