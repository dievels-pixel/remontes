// Red de la estación como grafo dirigido: nodos fijos, remontes (suben) y
// pistas (bajan). Aplica las reglas de "sin puntos ciegos" de docs/diseno.md.
import { hashPareja } from './azar';
import { evaluarColores, type Bandas, type ColorPista, type Factibilidad } from './colores';
import { pistaConSinuosidad, sinuosidadMinima, type FormaPista } from './curva';
import type { Polilinea } from './polilinea';
import { distancia, segmentosSeCruzan } from './vector';

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
  color: ColorPista;
  trazado: Polilinea;
  /** Pendiente media efectiva: ΔH / L. */
  pendiente: number;
}

export interface ReglasPista {
  bandas: Bandas;
  sinuosidadMaxima: number;
  /** Abombamiento de las dos pistas que vuelven a la base de su remonte. */
  abombamientoLateral: number;
  /** Abombamiento del resto de pistas. */
  abombamientoNormal: number;
  /** Longitud de cada oscilación de la serpentina, en metros. */
  longitudOnda: number;
}

export interface ReglasRed {
  desnivelMinimoRemonte: number;
  maxPistasPorPareja: number;
  pista: ReglasPista;
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
  | 'cruza-remonte'
  | 'origen-lleno'
  | 'destino-lleno'
  | 'pista-desde-base'
  | 'destino-no-viable'
  | 'demasiado-plana'
  | 'sin-color'
  | 'color-imposible';

/** Construcción registrada en el historial. */
export type Hecho = { tipo: 'remonte'; remonte: Remonte; estacionesNuevas: number } | { tipo: 'pista'; pista: Pista };

export class Red {
  readonly nodos: readonly Nodo[];
  readonly remontes: Remonte[] = [];
  readonly pistas: Pista[] = [];
  readonly estaciones: Estacion[] = [];
  /** Construcciones en orden, para deshacer la última. */
  private readonly historial: Hecho[] = [];

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
   * `extra` es el origen de una pista hipotética, para evaluar antes de abrirla.
   */
  enServicio(r: Remonte, extra?: number): boolean {
    if (r.hasta === extra || this.pistas.some((p) => p.desde === r.hasta)) return true;
    if (this.estaciones[r.estacionHasta].tipo !== 'paso') return false;
    const sigue = this.remontes.find((s) => s.estacionDesde === r.estacionHasta);
    return sigue !== undefined && this.enServicio(sigue, extra);
  }

  /**
   * Viable como destino de pista: desde él se puede llegar a una base por
   * pistas y remontes en servicio. Así no hay puntos ciegos ni bucles de los
   * que no se vuelve. `extra` es una pista hipotética que se cuenta como abierta.
   */
  viable(id: number, extra?: { desde: number; hasta: number }): boolean {
    const aristas: [number, number][] = this.pistas.map((p) => [p.desde, p.hasta]);
    if (extra) aristas.push([extra.desde, extra.hasta]);
    for (const r of this.remontes) if (this.enServicio(r, extra?.desde)) aristas.push([r.desde, r.hasta]);
    // Búsqueda hacia atrás desde las bases.
    const alcanza = new Set(this.nodos.filter((n) => n.tipo === 'base').map((n) => n.id));
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const [a, b] of aristas) {
        if (alcanza.has(b) && !alcanza.has(a)) {
          alcanza.add(a);
          cambio = true;
        }
      }
    }
    return alcanza.has(id);
  }

  /** Forma de la pista desde→hasta por el lado dado (estable por pareja). */
  forma(desde: number, hasta: number, lado: 1 | -1): FormaPista {
    const lateral = this.remontes.some((r) => r.desde === hasta && r.hasta === desde);
    const rp = this.reglas.pista;
    const d = distancia(this.nodos[desde], this.nodos[hasta]);
    return {
      lado,
      abombamiento: lateral ? rp.abombamientoLateral : rp.abombamientoNormal,
      ondas: Math.max(1, Math.round(d / rp.longitudOnda)),
    };
  }

  /**
   * Lado libre para una pista nueva entre la pareja: la primera elige por
   * semilla y la segunda va al contrario (lente). null si no queda.
   */
  ladoLibre(desde: number, hasta: number): 1 | -1 | null {
    const existentes = this.pistasEntre(desde, hasta);
    if (existentes.length >= this.reglas.maxPistasPorPareja) return null;
    if (existentes.length > 0) return -existentes[0].lado as 1 | -1;
    return hashPareja(desde, hasta) & 1 ? 1 : -1;
  }

  /** Lados disponibles: los dos si la pareja no tiene pistas, si no el contrario. */
  ladosLibres(desde: number, hasta: number): (1 | -1)[] {
    const primero = this.ladoLibre(desde, hasta);
    if (primero === null) return [];
    if (this.pistasEntre(desde, hasta).length > 0 || this.reglas.maxPistasPorPareja < 2) return [primero];
    return [primero, -primero as 1 | -1];
  }

  /** Factibilidad de cada color para la pareja y el lado. */
  colores(desde: number, hasta: number, lado: 1 | -1): Factibilidad[] {
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const sMin = sinuosidadMinima(a, b, this.forma(desde, hasta, lado));
    return evaluarColores(a.cota - b.cota, distancia(a, b), sMin, this.reglas.pista.sinuosidadMaxima, this.reglas.pista.bandas);
  }

  puedeConstruirRemonte(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[hasta].tipo === 'base') return 'destino-base';
    if (this.nodos[hasta].cota < this.nodos[desde].cota + this.reglas.desnivelMinimoRemonte) return 'destino-no-mas-alto';
    if (this.remontes.some((r) => r.desde === desde && r.hasta === hasta)) return 'ya-existe';
    if (this.cruzaRemonte(desde, hasta)) return 'cruza-remonte';
    // Cada estación admite un remonte por sentido; el emplazamiento se desdobla
    // hasta el máximo de estaciones.
    if (!this.planearEstacion(desde, 'salida', hasta)) return 'origen-lleno';
    if (!this.planearEstacion(hasta, 'llegada', desde)) return 'destino-lleno';
    return 'ok';
  }

  /** Sin color, comprueba si hay alguno posible; con color, ese en concreto. */
  puedeAbrirPista(desde: number, hasta: number, color?: ColorPista, lado?: 1 | -1): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[desde].tipo === 'base') return 'pista-desde-base';
    if (this.nodos[hasta].cota >= this.nodos[desde].cota) return 'destino-no-mas-bajo';
    const libres = this.ladosLibres(desde, hasta);
    if (libres.length === 0 || (lado !== undefined && !libres.includes(lado))) return 'ya-existe';
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    if ((a.cota - b.cota) / distancia(a, b) < this.reglas.pista.bandas.verde[0]) return 'demasiado-plana';
    const colores = this.colores(desde, hasta, lado ?? libres[0]);
    if (!colores.some((c) => c.factible)) return 'sin-color';
    if (color && !colores.find((c) => c.color === color)!.factible) return 'color-imposible';
    if (!this.viable(hasta, { desde, hasta })) return 'destino-no-viable';
    return 'ok';
  }

  /**
   * ¿La recta desde→hasta corta algún remonte existente? Los que comparten
   * emplazamiento con ella no cuentan: salen o llegan al mismo sitio.
   */
  cruzaRemonte(desde: number, hasta: number): boolean {
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    return this.remontes.some((r) => {
      if (r.desde === desde || r.desde === hasta || r.hasta === desde || r.hasta === hasta) return false;
      return segmentosSeCruzan(a, b, this.nodos[r.desde], this.nodos[r.hasta]);
    });
  }

  construirRemonte(desde: number, hasta: number): Remonte {
    const motivo = this.puedeConstruirRemonte(desde, hasta);
    if (motivo !== 'ok') throw new Error(`No se puede construir el remonte: ${motivo}`);
    const antes = this.estaciones.length;
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
    this.historial.push({ tipo: 'remonte', remonte: r, estacionesNuevas: this.estaciones.length - antes });
    return r;
  }

  abrirPista(desde: number, hasta: number, color: ColorPista, lado?: 1 | -1): Pista {
    const motivo = this.puedeAbrirPista(desde, hasta, color, lado);
    if (motivo !== 'ok') throw new Error(`No se puede abrir la pista: ${motivo}`);
    const l = lado ?? this.ladoLibre(desde, hasta)!;
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const s = this.colores(desde, hasta, l).find((c) => c.color === color)!.s;
    const trazado = pistaConSinuosidad(a, b, this.forma(desde, hasta, l), s)!;
    const p: Pista = {
      id: this.pistas.length,
      desde,
      hasta,
      lado: l,
      color,
      trazado,
      pendiente: (a.cota - b.cota) / trazado.longitud,
    };
    this.pistas.push(p);
    this.historial.push({ tipo: 'pista', pista: p });
    return p;
  }

  get puedeDeshacer(): boolean {
    return this.historial.length > 0;
  }

  /**
   * Deshace la última construcción. Al ir en orden inverso, la red vuelve
   * exactamente a un estado anterior, que ya era válido (sin puntos ciegos).
   * Devuelve lo deshecho para que la simulación retire a quien lo usaba.
   */
  deshacer(): Hecho | null {
    const h = this.historial.pop();
    if (!h) return null;
    if (h.tipo === 'remonte') {
      this.remontes.pop();
      this.estaciones.splice(this.estaciones.length - h.estacionesNuevas, h.estacionesNuevas);
    } else {
      this.pistas.pop();
    }
    return h;
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
