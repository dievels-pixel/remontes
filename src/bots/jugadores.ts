// Jugadores automáticos para calibrar el juego sin pantalla. Juegan con las
// mismas acciones y reglas que el jugador real (Juego.construirRemonte,
// abrirPista y mejorarRemonte): no ven nada que no vea una persona.
//
// - torpe: decide despacio y al azar, sin mirar colas ni colores.
// - razonable: alivia colas (mejora o remonte paralelo), cubre los colores
//   que piden los esquiadores, cierra circuitos en la zona alta y amplía.
// - de una sola idea (para comprobar que ninguna gana): todoVerde (siempre el
//   color más fácil que quepa), soloMejora (dos remontes y luego solo mejora)
//   y soloAmplia (nunca mejora).
import { mezclaEn } from '../core/afluencia';
import type { Azar } from '../core/azar';
import { COLORES, type ColorPista } from '../core/colores';
import type { Nodo, Remonte } from '../core/red';
import type { Juego } from '../juego';

export interface Estrategia {
  nombre: string;
  /** Segundos de juego entre decisiones. */
  intervalo: number;
  decidir(j: Juego, azar: Azar, memoria: Record<string, number>): void;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Pistas activas de cada color (verde, azul, roja, negra). */
function oferta(j: Juego): number[] {
  const n = [0, 0, 0, 0];
  const activas = j.red.pistasActivas();
  for (const p of j.red.pistas) if (activas.has(p.id)) n[COLORES.indexOf(p.color)]++;
  return n;
}

/** Mezcla de llegadas dentro de `segundos` (normalizada). */
function demanda(j: Juego, segundos = 0): number[] {
  const a = j.parametrosSim.afluencia;
  const m = a ? mezclaEn(j.sim.tiempoAbierta + segundos, a) : [...j.sim.mezclaActual];
  const t = m.reduce((x, y) => x + y, 0) || 1;
  return m.map((x) => x / t);
}

/** Niveles ordenados de más a menos déficit (demanda menos cuota de pistas). */
function porDeficit(j: Juego): number[] {
  const of = oferta(j);
  const total = of.reduce((x, y) => x + y, 0) || 1;
  const de = demanda(j, 90);
  return [0, 1, 2, 3].sort((a, b) => de[b] - of[b] / total - (de[a] - of[a] / total));
}

/**
 * Abre hasta `cuantas` pistas desde `desde` hacia sus puntos viables más
 * cercanos, con el primer color de `preferencia` que quepa en cada una.
 * `soloEsos`: no abrir si no cabe ninguno de la preferencia.
 */
function abrirDesde(j: Juego, desde: number, preferencia: ColorPista[], cuantas: number, alcance = 6): number {
  const red = j.red;
  const o = red.nodo(desde);
  const destinos = red.nodos
    .filter((b) => b.cota < o.cota && red.viable(b.id))
    .sort((a, b) => dist(a, o) - dist(b, o))
    .slice(0, alcance);
  let abiertas = 0;
  for (const b of destinos) {
    if (abiertas >= cuantas) break;
    const e = j.evaluarPista(desde, b.id);
    if (e.motivo !== 'ok' || e.espera) continue;
    const color = preferencia.find((c) => e.colores.some((x) => x.color === c && x.factible));
    if (color && j.abrirPista(desde, b.id, color)) abiertas++;
  }
  return abiertas;
}

const todos = (orden: number[]): ColorPista[] => orden.map((i) => COLORES[i]);
/** Del más fácil al más difícil: «todo verde forzado». */
const FACILES: ColorPista[] = ['verde', 'azul', 'roja', 'negra'];

/** Puntos desde los que el jugador puede arrancar un remonte ahora. */
function origenes(j: Juego): Nodo[] {
  const red = j.red;
  return red.nodos.filter((n) => n.tipo === 'base' || (n.tipo !== 'cima' && red.estacionesDe(n.id).length > 0 && red.viable(n.id)));
}

interface Candidato {
  desde: number;
  hasta: number;
  precio: number;
  valor: number;
}

/**
 * Mejor remonte nuevo que se puede pagar, según `valorar` (mayor es mejor;
 * ≤ 0 lo descarta). Solo mira los `alcance` puntos más altos más cercanos a
 * cada origen y comprueba las reglas del mejor al peor.
 */
function mejorRemonte(j: Juego, desde: Nodo[], valorar: (o: Nodo, d: Nodo, precio: number) => number, alcance = 7): Candidato | null {
  const red = j.red;
  const pares = new Set(red.remontes.map((r) => `${r.desde}:${r.hasta}`));
  const cands: Candidato[] = [];
  for (const o of desde) {
    const altos = red.nodos
      .filter((n) => n.cota > o.cota + j.config.remonte.desnivelMinimo && !pares.has(`${o.id}:${n.id}`))
      .sort((a, b) => dist(a, o) - dist(b, o))
      .slice(0, alcance);
    for (const d of altos) {
      const precio = j.precioRemonteEntre(o.id, d.id);
      if (precio > j.monedas) continue;
      const valor = valorar(o, d, precio);
      if (valor > 0) cands.push({ desde: o.id, hasta: d.id, precio, valor });
    }
  }
  cands.sort((a, b) => b.valor - a.valor);
  for (const c of cands.slice(0, 12)) if (red.puedeConstruirRemonte(c.desde, c.hasta) === 'ok') return c;
  return null;
}

/** Construye el candidato y abre pistas desde su llegada; si queda sin bajada, lo deshace. */
function construir(j: Juego, c: Candidato, preferencia: ColorPista[], pistas: number): boolean {
  if (j.construirRemonte(c.desde, c.hasta) !== 'ok') return false;
  const r = j.red.remontes[j.red.remontes.length - 1];
  abrirDesde(j, c.hasta, preferencia, pistas);
  if (!j.red.enServicio(r)) {
    j.deshacer();
    return false;
  }
  return true;
}

/**
 * Ampliación general: más desnivel por moneda (o, con `barato`, lo más
 * barato), mejor a un punto aún sin servir.
 */
function ampliar(j: Juego, preferencia: ColorPista[], pistas = 3, desde: Nodo[] = origenes(j), barato = false): boolean {
  const servidos = new Set(j.red.remontes.map((r) => r.hasta));
  const c = mejorRemonte(j, desde, (o, d, precio) => ((barato ? 300 : d.cota - o.cota) / precio) * (servidos.has(d.id) ? 0.4 : 1));
  return c !== null && construir(j, c, preferencia, pistas);
}

/**
 * Apertura común de los jugadores que no son torpes: un primer remonte corto
 * desde la plaza con bajada verde (sirve a todos los niveles).
 */
function apertura(j: Juego): boolean {
  if (j.red.remontes.length > 0) return false;
  const red = j.red;
  const c = mejorRemonte(j, origenes(j), (_o, d, precio) => (red.nodos.some((b) => b.tipo === 'base' && cabeColor(j, d, b, 0)) ? 1 / precio : 0));
  if (c) construir(j, c, FACILES, 3);
  return true;
}

/** Remonte con la cola más larga y su longitud. */
function peorCola(j: Juego): { r: Remonte; cola: number } | null {
  let peor: { r: Remonte; cola: number } | null = null;
  for (const r of j.red.remontes) {
    const cola = j.sim.colas[r.id]?.length ?? 0;
    if (!peor || cola > peor.cola) peor = { r, cola };
  }
  return peor;
}

/**
 * Alivia la peor cola si pasa del aforo: mejora el remonte o, si no llega,
 * pone otro desde la misma salida. Devuelve 'hecho', 'ahorra' (hay cola y no
 * llega el dinero: mejor no gastarlo en otra cosa) o 'nada'.
 */
function aliviarColas(j: Juego, preferencia: ColorPista[], todas = false): 'hecho' | 'ahorra' | 'nada' {
  // La peor primero; con `todas`, cada remonte con la cola por encima del aforo.
  const saturados = j.red.remontes
    .map((r) => ({ r, cola: j.sim.colas[r.id]?.length ?? 0 }))
    .filter((x) => x.cola > j.sim.p.aforoCola)
    .sort((a, b) => b.cola - a.cola)
    .slice(0, todas ? Infinity : 1);
  let hecho = false;
  let ahorra = false;
  for (const { r } of saturados) {
    if (j.mejorarRemonte(r.id) === 'ok' || ampliar(j, preferencia, 2, [j.red.nodo(r.desde)])) hecho = true;
    else if (j.precioMejoraDe(r.id) !== null) ahorra = true;
  }
  return hecho ? 'hecho' : ahorra ? 'ahorra' : 'nada';
}

/** ¿Cabe (por pendiente en recta) una pista de ese nivel entre dos puntos? */
function cabeColor(j: Juego, alto: Nodo, bajo: Nodo, nivel: number): boolean {
  const rp = j.red.reglas.pista;
  const [min, max] = rp.bandas[COLORES[nivel]];
  const recta = (alto.cota - bajo.cota) / dist(alto, bajo);
  // Con curvas la pendiente baja hasta recta / sinuosidad máxima.
  return recta >= min && recta / rp.sinuosidadMaxima <= max;
}

/** Una pista gratis del color que más falta, desde alguna llegada en servicio. */
function pistaQueFalta(j: Juego, orden: number[]): boolean {
  const red = j.red;
  const llegadas = [...new Set(red.remontes.filter((r) => red.enServicio(r)).map((r) => r.hasta))];
  for (const nivel of orden.slice(0, 2)) {
    // Para rojas y negras, primero desde arriba (más desnivel).
    const ordenadas = llegadas.sort((a, b) => (nivel >= 2 ? red.nodo(b).cota - red.nodo(a).cota : red.nodo(a).cota - red.nodo(b).cota));
    for (const desde of ordenadas) if (abrirDesde(j, desde, [COLORES[nivel]], 1) > 0) return true;
  }
  return false;
}

/**
 * Circuitos en la zona alta: una pista roja o negra que acaba en un punto
 * del que no sube ningún remonte obliga a seguir bajando por lo que haya
 * (verdes y azules, que aburren a esos niveles). Pone un remonte desde ese
 * punto de vuelta hacia arriba.
 */
function cerrarCircuito(j: Juego, preferencia: ColorPista[]): 'hecho' | 'ahorra' | 'nada' {
  const red = j.red;
  const activas = red.pistasActivas();
  let falta = false;
  for (const p of red.pistas) {
    if (!activas.has(p.id) || COLORES.indexOf(p.color) < 2) continue;
    const abajo = red.nodo(p.hasta);
    if (abajo.tipo !== 'intermedio' || red.remontes.some((r) => r.desde === p.hasta)) continue;
    const arriba = red.nodo(p.desde);
    // De vuelta al origen de la pista; si no se puede, al punto servido más cercano por encima.
    for (const d of [arriba, ...red.nodos.filter((n) => n.cota > abajo.cota + 100 && red.estacionesDe(n.id).length > 0).sort((a, b) => dist(a, abajo) - dist(b, abajo)).slice(0, 3)]) {
      if (red.puedeConstruirRemonte(abajo.id, d.id) !== 'ok') continue;
      if (j.construirRemonte(abajo.id, d.id) === 'ok') {
        if (!red.enServicio(red.remontes[red.remontes.length - 1])) abrirDesde(j, d.id, preferencia, 2);
        return 'hecho';
      }
      falta = true;
      break;
    }
  }
  return falta ? 'ahorra' : 'nada';
}

/** Un remonte nuevo desde cuya llegada quepa una pista del nivel que falta. */
function remonteParaColor(j: Juego, nivel: number, preferencia: ColorPista[]): boolean {
  const red = j.red;
  const viables = red.nodos.filter((n) => red.viable(n.id));
  const c = mejorRemonte(j, origenes(j), (o, d, precio) => {
    if (red.estacionesDe(d.id).length > 0) return 0;
    const caben = viables.filter((b) => b.cota < d.cota && dist(b, d) < 2500 && cabeColor(j, d, b, nivel)).length;
    return caben > 0 ? (caben + (d.cota - o.cota) / 400) / precio : 0;
  });
  return c !== null && construir(j, c, [COLORES[nivel], ...preferencia], 3);
}

export const razonable: Estrategia = {
  nombre: 'razonable',
  intervalo: 5,
  decidir(j, _azar, mem) {
    const red = j.red;
    const orden = porDeficit(j);
    const pref = todos(orden);
    mem.turno = (mem.turno ?? 0) + 1;
    // Lo gratis: que ningún remonte quede parado y, cada 20 s, una pista del color que falta.
    for (const r of red.remontes) if (!red.enServicio(r)) abrirDesde(j, r.hasta, pref, 2);
    if (mem.turno % 4 === 0) pistaQueFalta(j, orden);
    if (apertura(j)) return;
    // Lo que cuesta dinero, por orden de urgencia: todas las colas saturadas.
    const colas = aliviarColas(j, pref, true);
    if (colas === 'hecho') return;
    // Una cola que crece (más de medio aforo): guarda para poder aliviarla
    // antes de gastar en otra cosa.
    const peor = peorCola(j);
    if (peor && peor.cola > j.sim.p.aforoCola / 2) {
      const alivio = j.precioMejoraDe(peor.r.id);
      if (alivio !== null && j.monedas < alivio * 1.3) return;
    }
    const circuito = cerrarCircuito(j, pref);
    if (circuito === 'hecho') return;
    // Un nivel que ya llega (o llega en minuto y medio) sin apenas pistas de su color.
    const of = oferta(j);
    const total = of.reduce((x, y) => x + y, 0) || 1;
    const de = demanda(j, 90);
    const sinColor = orden.find((n) => de[n] > 0.04 && of[n] / total < de[n] * 0.5);
    if (sinColor !== undefined && !pistaQueFalta(j, [sinColor]) && remonteParaColor(j, sinColor, pref)) return;
    if (colas === 'ahorra' || circuito === 'ahorra') return;
    // Con holgura (el doble de lo que cuesta mantener todo cinco minutos) y
    // si lo que entra cubre lo que cuesta mantener lo que ya hay, ampliar.
    const cubre = red.remontes.length < 2 || j.sim.ingresosPorMinuto > j.sim.mantenimientoPorMinuto * 1.3;
    if (cubre && j.monedas > 150 + j.sim.mantenimientoPorMinuto * 2) ampliar(j, pref);
  },
};

export const torpe: Estrategia = {
  nombre: 'torpe',
  intervalo: 15,
  decidir(j, azar) {
    const red = j.red;
    // Si hay un remonte parado, le abre una pista cualquiera (sin eso no hay partida).
    for (const r of red.remontes) if (!red.enServicio(r)) abrirDesde(j, r.hasta, FACILES, 1);
    if (red.remontes.length > 0 && azar() < 0.5) return;
    if (azar() < 0.12 && red.remontes.length > 0) {
      j.mejorarRemonte(red.remontes[Math.floor(azar() * red.remontes.length)].id);
      return;
    }
    // Un remonte cualquiera que pueda pagar, con una sola pista del primer color que quepa.
    const c = mejorRemonte(j, origenes(j), () => 0.01 + azar());
    if (c) construir(j, c, azar() < 0.5 ? FACILES : [...FACILES].reverse(), 1);
  },
};

export const todoVerde: Estrategia = {
  nombre: 'todoVerde',
  intervalo: 5,
  decidir(j, _azar, mem) {
    const red = j.red;
    mem.turno = (mem.turno ?? 0) + 1;
    if (apertura(j)) return;
    for (const r of red.remontes) if (!red.enServicio(r)) abrirDesde(j, r.hasta, FACILES, 2);
    // Más pistas, siempre del color más fácil que quepa.
    if (mem.turno % 4 === 0) for (const r of red.remontes) if (red.enServicio(r) && abrirDesde(j, r.hasta, FACILES, 1) > 0) break;
    const colas = aliviarColas(j, FACILES);
    if (colas !== 'nada') return;
    if (j.monedas > 150 + j.sim.mantenimientoPorMinuto * 2) ampliar(j, FACILES);
  },
};

export const soloMejora: Estrategia = {
  nombre: 'soloMejora',
  intervalo: 5,
  decidir(j, _azar, mem) {
    const red = j.red;
    const pref = todos(porDeficit(j));
    mem.turno = (mem.turno ?? 0) + 1;
    for (const r of red.remontes) if (!red.enServicio(r)) abrirDesde(j, r.hasta, pref, 2);
    if (mem.turno % 4 === 0) pistaQueFalta(j, porDeficit(j));
    if (apertura(j)) return;
    if (red.remontes.length < 2) {
      ampliar(j, pref, 3, origenes(j), true);
      return;
    }
    // Solo mejora: primero donde hay más cola, luego cualquiera.
    const porCola = [...red.remontes].sort((a, b) => (j.sim.colas[b.id]?.length ?? 0) - (j.sim.colas[a.id]?.length ?? 0));
    for (const r of porCola) if (j.mejorarRemonte(r.id) === 'ok') return;
  },
};

export const soloAmplia: Estrategia = {
  nombre: 'soloAmplia',
  intervalo: 5,
  decidir(j, _azar, mem) {
    const red = j.red;
    const pref = todos(porDeficit(j));
    mem.turno = (mem.turno ?? 0) + 1;
    for (const r of red.remontes) if (!red.enServicio(r)) abrirDesde(j, r.hasta, pref, 2);
    if (mem.turno % 4 === 0) pistaQueFalta(j, porDeficit(j));
    if (apertura(j)) return;
    // Amplía en cuanto puede: lo más barato primero.
    ampliar(j, pref, 3, origenes(j), true);
  },
};

export const ESTRATEGIAS: Record<string, Estrategia> = { torpe, razonable, todoVerde, soloMejora, soloAmplia };
