// Validación de un mapa con las reglas del propio juego (sin duplicarlas):
// colores de pista posibles entre parejas cercanas, nodos que no sirven,
// parejas demasiado planas, si cabe alguna negra y si cada base tiene un
// remonte asequible con el dinero inicial. Va por pasos (generador) para que
// el editor pueda repartirla entre fotogramas. Lógica pura: sin DOM.
import { COLORES, type ColorPista } from '../../src/core/colores';
import type { Mapa } from '../../src/core/mapa';
import type { ParametrosNivel } from '../../src/core/nivel';
import { Juego } from '../../src/juego';

export interface Pareja {
  /** Índices de nodo (orden de la lista de nodos): de arriba abajo. */
  desde: number;
  hasta: number;
  /** Colores con trazado limpio (por cualquiera de los dos lados). */
  colores: ColorPista[];
  /** Pendiente en recta por debajo de la de una verde. */
  plana: boolean;
}

export interface Aviso {
  grave: boolean;
  texto: string;
  /** Nodos a los que se refiere (para resaltarlos). */
  nodos: number[];
}

export interface Validacion {
  parejas: Pareja[];
  avisos: Aviso[];
  /** Cuántas parejas admiten cada color (verde, azul, roja, negra). */
  porColor: number[];
  /** Base → precio del remonte asequible más barato (o null si no hay). */
  remontesBase: Map<number, number | null>;
  completa: boolean;
}

export interface OpcionesValidacion {
  /** Parejas por nodo: sus N puntos más bajos más cercanos. */
  vecinos: number;
  /** Distancia máxima de una pareja (m). */
  distanciaMaxima: number;
}

export const VALIDACION_POR_DEFECTO: OpcionesValidacion = { vecinos: 6, distanciaMaxima: 3000 };

/**
 * Valida paso a paso; cada `yield` devuelve la validación parcial. La última
 * tiene `completa: true`.
 */
export function* validar(mapa: Mapa, parametros: ParametrosNivel, opciones: OpcionesValidacion = VALIDACION_POR_DEFECTO): Generator<Validacion, Validacion> {
  const avisos: Aviso[] = [];
  const v: Validacion = { parejas: [], avisos, porColor: [0, 0, 0, 0], remontesBase: new Map(), completa: false };
  let j: Juego;
  try {
    j = new Juego(mapa, 1, parametros);
  } catch (e) {
    avisos.push({ grave: true, texto: `El juego no puede montar el mapa: ${e instanceof Error ? e.message : String(e)}`, nodos: [] });
    v.completa = true;
    return v;
  }
  const red = j.red;
  const nodos = red.nodos;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const bandas = red.reglas.pista.bandas;

  // Comprobaciones inmediatas.
  const bases = nodos.filter((n) => n.tipo === 'base');
  if (bases.length === 0) avisos.push({ grave: true, texto: 'No hay ninguna base.', nodos: [] });
  if (!nodos.some((n) => n.tipo === 'cima')) avisos.push({ grave: false, texto: 'No hay ninguna cima.', nodos: [] });
  for (const n of nodos) {
    if (dist(n, mapa.datos.plaza) <= mapa.datos.plaza.radio) avisos.push({ grave: true, texto: `El nodo ${n.id} está dentro de la plaza.`, nodos: [n.id] });
    if (mapa.alturas.esRoca(n, j.umbralRoca)) avisos.push({ grave: false, texto: `El nodo ${n.id} (${n.tipo}) está sobre roca.`, nodos: [n.id] });
  }
  for (let a = 0; a < nodos.length; a++) for (let b = a + 1; b < nodos.length; b++) if (dist(nodos[a], nodos[b]) < 80) avisos.push({ grave: false, texto: `Los nodos ${a} y ${b} están a menos de 80 m.`, nodos: [a, b] });
  yield v;

  // Parejas: cada punto que no es de la plaza con sus vecinos más bajos.
  const origenes = nodos.filter((n) => n.tipo !== 'base');
  for (const o of origenes) {
    const bajos = nodos
      .filter((b) => b.cota < o.cota && dist(b, o) <= opciones.distanciaMaxima)
      .sort((a, b) => dist(a, o) - dist(b, o))
      .slice(0, opciones.vecinos);
    for (const b of bajos) {
      const recta = (o.cota - b.cota) / dist(o, b);
      const colores = new Set<ColorPista>();
      for (const lado of [1, -1] as const) for (const c of red.coloresLimpios(o.id, b.id, lado)) if (c.factible) colores.add(c.color);
      const lista = COLORES.filter((c) => colores.has(c));
      v.parejas.push({ desde: o.id, hasta: b.id, colores: lista, plana: recta < bandas.verde[0] });
      lista.forEach((c) => v.porColor[COLORES.indexOf(c)]++);
      yield v;
    }
  }

  // Remonte asequible desde cada base con el dinero inicial (las reglas del
  // juego: sin cruces y con bajada desde la llegada).
  for (const base of bases) {
    let mejor: number | null = null;
    const altos = nodos.filter((n) => n.cota > base.cota).sort((a, b) => dist(a, base) - dist(b, base));
    for (const d of altos) {
      const precio = j.precioRemonteEntre(base.id, d.id);
      if (precio > j.monedas || (mejor !== null && precio >= mejor)) continue;
      if (red.puedeConstruirRemonte(base.id, d.id) === 'ok') mejor = precio;
    }
    v.remontesBase.set(base.id, mejor);
    yield v;
  }

  // Avisos a partir de las parejas.
  const conPista = new Set<number>();
  const llegan = new Set<number>();
  const salen = new Set<number>();
  for (const p of v.parejas) {
    if (p.colores.length === 0) continue;
    conPista.add(p.desde).add(p.hasta);
    salen.add(p.desde);
    llegan.add(p.hasta);
  }
  for (const n of nodos) {
    if (n.tipo === 'base' && !llegan.has(n.id)) avisos.push({ grave: true, texto: `A la base ${n.id} no llega ninguna pista posible desde sus vecinos.`, nodos: [n.id] });
    else if (n.tipo === 'cima' && !salen.has(n.id)) avisos.push({ grave: true, texto: `De la cima ${n.id} no sale ninguna pista posible: es inalcanzable para el juego.`, nodos: [n.id] });
    else if (n.tipo === 'intermedio' && !conPista.has(n.id)) avisos.push({ grave: true, texto: `El intermedio ${n.id} no tiene ninguna pista posible ni de llegada ni de salida.`, nodos: [n.id] });
  }
  const planas = v.parejas.filter((p) => p.plana && dist(nodos[p.desde], nodos[p.hasta]) < 1500);
  if (planas.length > 0) avisos.push({ grave: false, texto: `${planas.length} parejas cercanas demasiado planas para una verde (pendiente en recta menor que ${bandas.verde[0]}).`, nodos: [...new Set(planas.flatMap((p) => [p.desde, p.hasta]))] });
  if (v.porColor[3] === 0) avisos.push({ grave: true, texto: 'No cabe ninguna pista negra en todo el mapa.', nodos: [] });
  if (v.porColor[2] === 0) avisos.push({ grave: true, texto: 'No cabe ninguna pista roja en todo el mapa.', nodos: [] });
  if (v.porColor[0] === 0) avisos.push({ grave: true, texto: 'No cabe ninguna pista verde en todo el mapa.', nodos: [] });
  for (const [base, precio] of v.remontesBase) {
    if (precio === null) avisos.push({ grave: true, texto: `La base ${base} no tiene ningún remonte asequible con ${j.monedas} monedas (que tenga bajada desde su llegada).`, nodos: [base] });
  }
  v.completa = true;
  return v;
}

/** Valida de una vez (para las pruebas y el generador aleatorio). */
export function validarTodo(mapa: Mapa, parametros: ParametrosNivel, opciones?: OpcionesValidacion): Validacion {
  const g = validar(mapa, parametros, opciones);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}
