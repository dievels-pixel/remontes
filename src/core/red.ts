// Red de la estación como grafo dirigido: nodos fijos, remontes (suben) y
// pistas (bajan). Aplica las reglas de "sin puntos ciegos" de docs/diseno.md.
import { hashPareja } from './azar';
import { trazarPista, type ParametrosCurva } from './curva';
import type { Polilinea } from './polilinea';
import { distancia } from './vector';

export type TipoNodo = 'base' | 'intermedio' | 'cima';

export interface Nodo {
  id: number;
  tipo: TipoNodo;
  x: number;
  y: number;
  cota: number;
}

/**
 * Estación: punto concreto de un emplazamiento (nodo) donde empieza o acaba
 * un remonte. 'salida' admite un remonte que sale (círculo), 'llegada' uno
 * que llega (triángulo) y 'paso' uno de cada (cuadrado).
 *
 * Las estaciones de un emplazamiento van en fila, pegadas: (ox, oy) es el
 * desplazamiento respecto al nodo en "huecos" (vector unitario × posición en
 * la fila). El dibujo lo multiplica por una separación en píxeles, para que
 * queden pegadas en cualquier pantalla.
 */
export type TipoEstacion = 'salida' | 'llegada' | 'paso';

export interface Estacion {
  id: number;
  nodo: number;
  tipo: TipoEstacion;
  ox: number;
  oy: number;
}

/** Estación existente (id) o nueva por crear. */
export type EstacionPlaneada = { id: number } | { nueva: Omit<Estacion, 'id'> };

export interface Remonte {
  id: number;
  desde: number;
  hasta: number;
  estacionDesde: number;
  estacionHasta: number;
  longitud: number;
}

export interface Pista {
  id: number;
  desde: number;
  hasta: number;
  lado: 1 | -1;
  trazado: Polilinea;
  /** Pendiente media efectiva: ΔH / L. */
  pendiente: number;
}

export interface ReglasRed {
  desnivelMinimoRemonte: number;
  maxPistasPorPareja: number;
  curva: ParametrosCurva;
  maxEstacionesPorNodo: number;
}

export type Motivo =
  | 'ok'
  | 'mismo-nodo'
  | 'origen-inactivo'
  | 'destino-no-mas-alto'
  | 'destino-base'
  | 'destino-no-mas-bajo'
  | 'ya-existe'
  | 'origen-lleno'
  | 'destino-lleno'
  | 'pista-desde-base'
  | 'destino-no-viable';

export class Red {
  readonly nodos: readonly Nodo[];
  readonly remontes: Remonte[] = [];
  readonly pistas: Pista[] = [];
  readonly estaciones: Estacion[] = [];

  constructor(nodos: Nodo[], readonly reglas: ReglasRed) {
    nodos.forEach((n, i) => {
      if (n.id !== i) throw new Error('Los id de nodo deben coincidir con su índice');
    });
    this.nodos = nodos;
    // Estación principal de cada emplazamiento, según su tipo.
    const principal: Record<TipoNodo, TipoEstacion> = { base: 'salida', cima: 'llegada', intermedio: 'paso' };
    for (const n of nodos) this.estaciones.push({ id: this.estaciones.length, nodo: n.id, tipo: principal[n.tipo], ox: 0, oy: 0 });
  }

  estacionesDe(nodo: number): Estacion[] {
    return this.estaciones.filter((e) => e.nodo === nodo);
  }

  /**
   * Estación donde empezaría (sentido 'salida') o acabaría ('llegada') un
   * remonte en `nodo` hacia o desde `otro`: una existente con hueco o, si no
   * la hay, una nueva pegada a las demás. null si el emplazamiento está lleno.
   */
  planearEstacion(nodo: number, sentido: 'salida' | 'llegada', otro: number): EstacionPlaneada | null {
    const propias = this.estacionesDe(nodo);
    const libre = propias.find((e) => {
      if (e.tipo !== 'paso' && e.tipo !== sentido) return false;
      return sentido === 'salida'
        ? !this.remontes.some((r) => r.estacionDesde === e.id)
        : !this.remontes.some((r) => r.estacionHasta === e.id);
    });
    if (libre) return { id: libre.id };
    if (propias.length >= this.reglas.maxEstacionesPorNodo) return null;
    // Desdoble: la fila de estaciones va en perpendicular al primer remonte
    // del emplazamiento, y la nueva se pega por el lado del que viene la línea.
    const n = this.nodos[nodo];
    const unitario = (o: Nodo) => {
      const d = distancia(n, o) || 1;
      return { x: (o.x - n.x) / d, y: (o.y - n.y) / d };
    };
    const primero = this.remontes.find((r) => r.desde === nodo || r.hasta === nodo);
    const ref = unitario(this.nodos[primero ? (primero.desde === nodo ? primero.hasta : primero.desde) : otro]);
    const eje = { x: -ref.y, y: ref.x };
    const nueva = unitario(this.nodos[otro]);
    const lado = nueva.x * eje.x + nueva.y * eje.y >= 0 ? 1 : -1;
    // Posición en la fila de cada estación existente, proyectada sobre el eje.
    const posiciones = propias.map((e) => Math.round(e.ox * eje.x + e.oy * eje.y));
    const k = lado > 0 ? Math.max(...posiciones) + 1 : Math.min(...posiciones) - 1;
    return { nueva: { nodo, tipo: sentido, ox: eje.x * k, oy: eje.y * k } };
  }

  private materializar(p: EstacionPlaneada): number {
    if ('id' in p) return p.id;
    const e: Estacion = { id: this.estaciones.length, ...p.nueva };
    this.estaciones.push(e);
    return e.id;
  }

  nodo(id: number): Nodo {
    return this.nodos[id];
  }

  /** Activo: es una base o lo alcanza algún remonte. */
  activo(id: number): boolean {
    return this.nodos[id].tipo === 'base' || this.remontes.some((r) => r.hasta === id);
  }

  /**
   * Un remonte funciona si hay al menos una pista activa desde su llegada. Si
   * llega a un punto de paso y sigue desde ahí, los dos tramos son la misma
   * línea: el de abajo funciona en cuanto funciona el de arriba.
   */
  enServicio(r: Remonte): boolean {
    if (this.pistas.some((p) => p.desde === r.hasta)) return true;
    if (this.estaciones[r.estacionHasta].tipo !== 'paso') return false;
    const sigue = this.remontes.find((s) => s.estacionDesde === r.estacionHasta);
    return sigue !== undefined && this.enServicio(sigue);
  }

  /** Viable como destino de pista: base o con alguna salida operativa. */
  viable(id: number): boolean {
    if (this.nodos[id].tipo === 'base') return true;
    return this.pistas.some((p) => p.desde === id) || this.remontes.some((r) => r.desde === id && this.enServicio(r));
  }

  puedeConstruirRemonte(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[hasta].tipo === 'base') return 'destino-base';
    if (this.nodos[hasta].cota < this.nodos[desde].cota + this.reglas.desnivelMinimoRemonte) return 'destino-no-mas-alto';
    if (this.remontes.some((r) => r.desde === desde && r.hasta === hasta)) return 'ya-existe';
    // Cada estación admite un remonte por sentido; el emplazamiento se desdobla
    // hasta el máximo de estaciones.
    if (!this.planearEstacion(desde, 'salida', hasta)) return 'origen-lleno';
    if (!this.planearEstacion(hasta, 'llegada', desde)) return 'destino-lleno';
    return 'ok';
  }

  puedeAbrirPista(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[desde].tipo === 'base') return 'pista-desde-base';
    if (this.nodos[hasta].cota >= this.nodos[desde].cota) return 'destino-no-mas-bajo';
    if (this.pistasEntre(desde, hasta).length >= this.reglas.maxPistasPorPareja) return 'ya-existe';
    if (!this.viable(hasta)) return 'destino-no-viable';
    return 'ok';
  }

  construirRemonte(desde: number, hasta: number): Remonte {
    const motivo = this.puedeConstruirRemonte(desde, hasta);
    if (motivo !== 'ok') throw new Error(`No se puede construir el remonte: ${motivo}`);
    const estacionDesde = this.materializar(this.planearEstacion(desde, 'salida', hasta)!);
    const estacionHasta = this.materializar(this.planearEstacion(hasta, 'llegada', desde)!);
    const r: Remonte = {
      id: this.remontes.length,
      desde,
      hasta,
      estacionDesde,
      estacionHasta,
      longitud: distancia(this.nodos[desde], this.nodos[hasta]),
    };
    this.remontes.push(r);
    return r;
  }

  abrirPista(desde: number, hasta: number): Pista {
    const motivo = this.puedeAbrirPista(desde, hasta);
    if (motivo !== 'ok') throw new Error(`No se puede abrir la pista: ${motivo}`);
    const semilla = hashPareja(desde, hasta);
    const existentes = this.pistasEntre(desde, hasta);
    // La primera pista de la pareja elige lado por semilla; la segunda va al
    // lado contrario, formando la lente alrededor del remonte.
    const lado: 1 | -1 = existentes.length > 0 ? (-existentes[0].lado as 1 | -1) : semilla & 1 ? 1 : -1;
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const trazado = trazarPista(a, b, lado, semilla + existentes.length, this.reglas.curva);
    const p: Pista = {
      id: this.pistas.length,
      desde,
      hasta,
      lado,
      trazado,
      pendiente: (a.cota - b.cota) / trazado.longitud,
    };
    this.pistas.push(p);
    return p;
  }

  pistasEntre(desde: number, hasta: number): Pista[] {
    return this.pistas.filter((p) => p.desde === desde && p.hasta === hasta);
  }

  /** Salidas operativas de un nodo: remontes en servicio y pistas. */
  salidas(id: number): { remontes: Remonte[]; pistas: Pista[] } {
    return {
      remontes: this.remontes.filter((r) => r.desde === id && this.enServicio(r)),
      pistas: this.pistas.filter((p) => p.desde === id),
    };
  }
}
