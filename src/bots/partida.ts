// Partida completa sin pantalla con un jugador automático: avanza el juego a
// paso fijo, deja decidir a la estrategia cada cierto tiempo y devuelve las
// medidas que usa la calibración (CALIBRACION.md) y el ajuste de los retos.
import { crearAzar } from '../core/azar';
import { COLORES } from '../core/colores';
import type { Mapa } from '../core/mapa';
import type { ParametrosNivel } from '../core/nivel';
import type { ResumenPartida } from '../core/retos';
import { Juego } from '../juego';
import type { Estrategia } from './jugadores';

export interface OpcionesPartida {
  semilla?: number;
  /** Minutos de juego como máximo (la partida puede no acabar). */
  minutosMaximos?: number;
  /** Paso de simulación (s). */
  dt?: number;
  /** Parámetros de balance propios del nivel. */
  parametros?: ParametrosNivel;
}

export interface Minuto {
  minuto: number;
  monedas: number;
  ingresos: number;
  mantenimiento: number;
  remontes: number[];
  pistas: number[];
  gente: number;
  colaMaxima: number;
  /** Medidor de quejas, de 0 a 1. */
  quejas: number;
  /** Parte de la gente que está en los remontes de la plaza o bajando hacia ella. */
  abajo: number;
}

export interface ResultadoPartida {
  estrategia: string;
  semilla: number;
  /** Segundos de juego con la estación abierta al acabar. */
  tiempo: number;
  terminada: boolean;
  /** Último instante (s) en que el medidor estaba por debajo de la mitad antes de acabar, o null si nunca la pasó. */
  mitadMedidor: number | null;
  satisfechos: number;
  enfadados: number;
  quejas: { aburrimiento: number; cola: number; sinPistas: number };
  quejasPorNivel: number[];
  /** Enfadados antes de acabar el periodo de gracia. */
  enfadadosEnGracia: number;
  remontes: number[];
  pistas: number[];
  pistasForzadas: number;
  mejoras: number;
  bajadasPorNivel: number[];
  monedas: number;
  /** Media, desde la mitad de la partida, de la parte de la gente que está abajo. */
  abajo: number;
  /** Parte de las bajadas que han divertido. */
  divierten: number;
  minutos: Minuto[];
  /** Resumen para comprobar retos. */
  resumen: ResumenPartida;
}

/** Remontes que hay que coger desde la plaza para llegar a cada punto. */
function profundidades(j: Juego): Map<number, number> {
  const red = j.red;
  const prof = new Map<number, number>(red.nodos.filter((n) => n.tipo === 'base').map((n) => [n.id, 0]));
  for (let cambia = true; cambia; ) {
    cambia = false;
    for (const r of red.remontes) {
      const d = prof.get(r.desde);
      if (d !== undefined && (prof.get(r.hasta) ?? Infinity) > d + 1) {
        prof.set(r.hasta, d + 1);
        cambia = true;
      }
    }
    for (const p of red.pistas) {
      const d = prof.get(p.desde);
      if (d !== undefined && !prof.has(p.hasta)) {
        prof.set(p.hasta, d);
        cambia = true;
      }
    }
  }
  return prof;
}

/** Parte de la gente en la zona baja: en remontes que salen de la plaza o en pistas que llegan a ella. */
export function fraccionAbajo(j: Juego): number {
  const red = j.red;
  const prof = profundidades(j);
  let abajo = 0;
  let total = 0;
  for (const e of j.sim.esquiadores.values()) {
    if (e.estado === 'cola' || e.estado === 'remonte') {
      total++;
      if (prof.get(red.remontes[e.remonte].desde) === 0) abajo++;
    } else if (e.estado === 'pista') {
      total++;
      if (red.nodo(red.pistas[e.pista].hasta).tipo === 'base') abajo++;
    }
  }
  return total > 0 ? abajo / total : 0;
}

export function jugarPartida(mapa: Mapa, estrategia: Estrategia, opciones: OpcionesPartida = {}): ResultadoPartida {
  const semilla = opciones.semilla ?? 1;
  const dt = opciones.dt ?? 1 / 20;
  const limite = (opciones.minutosMaximos ?? 60) * 60;
  const j = new Juego(mapa, 1000 + semilla, opciones.parametros);
  const azar = crearAzar(77 + semilla);
  const memoria: Record<string, number> = {};
  const sim = j.sim;
  const red = j.red;
  const gracia = sim.p.medidor?.gracia ?? 0;
  const minutos: Minuto[] = [];
  let siguienteDecision = 0;
  let siguienteMinuto = 60;
  let ultimoBajoMitad = 0;
  let pasoMitad = false;
  let enfadadosEnGracia = 0;
  let mejoras = 0;
  let tiposAntes = 0;
  let sumaAbajo = 0;
  let muestrasAbajo = 0;

  const porTipo = () => {
    const n = [0, 0, 0];
    for (const r of red.remontes) n[r.tipo]++;
    return n;
  };
  const porColor = () => COLORES.map((c) => red.pistas.filter((p) => p.color === c).length);

  while (sim.tiempo < limite && !sim.terminada) {
    if (sim.tiempo >= siguienteDecision) {
      estrategia.decidir(j, azar, memoria);
      siguienteDecision += estrategia.intervalo;
      const tipos = red.remontes.reduce((x, r) => x + r.tipo, 0);
      if (tipos > tiposAntes) mejoras += tipos - tiposAntes;
      tiposAntes = tipos;
    }
    j.paso(dt);
    if (sim.fraccionQuejas < 0.5) ultimoBajoMitad = sim.tiempoAbierta;
    else pasoMitad = true;
    if (sim.tiempoAbierta <= gracia) enfadadosEnGracia = sim.enfadados;
    if (sim.tiempo >= siguienteMinuto) {
      siguienteMinuto += 60;
      const abajo = fraccionAbajo(j);
      minutos.push({
        minuto: Math.round(sim.tiempo / 60),
        monedas: Math.floor(sim.monedas),
        ingresos: Math.round(sim.ingresosPorMinuto),
        mantenimiento: Math.round(sim.mantenimientoPorMinuto),
        remontes: porTipo(),
        pistas: porColor(),
        gente: sim.poblacion,
        colaMaxima: Math.max(0, ...red.remontes.map((r) => sim.colas[r.id]?.length ?? 0)),
        quejas: sim.fraccionQuejas,
        abajo,
      });
      sumaAbajo += abajo;
      muestrasAbajo++;
    }
  }
  // La media de «abajo» solo cuenta la segunda mitad de la partida (red ya crecida).
  const mitad = minutos.slice(Math.floor(minutos.length / 2));
  const [si, no] = sim.bajadasPorDiversion;
  return {
    estrategia: estrategia.nombre,
    semilla,
    tiempo: sim.tiempoAbierta,
    terminada: sim.terminada,
    mitadMedidor: pasoMitad ? ultimoBajoMitad : null,
    satisfechos: sim.cansados,
    enfadados: sim.enfadados,
    quejas: { ...sim.quejas },
    quejasPorNivel: [...sim.quejasPorNivel],
    enfadadosEnGracia,
    remontes: porTipo(),
    pistas: porColor(),
    pistasForzadas: red.pistas.filter((p) => red.forzada(p)).length,
    mejoras,
    bajadasPorNivel: [...sim.bajadasPorNivel],
    monedas: Math.floor(sim.monedas),
    abajo: mitad.length > 0 ? mitad.reduce((x, m) => x + m.abajo, 0) / mitad.length : muestrasAbajo > 0 ? sumaAbajo / muestrasAbajo : 0,
    divierten: si / Math.max(1, si + no),
    minutos,
    resumen: j.resumen(),
  };
}
