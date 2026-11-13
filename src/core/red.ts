// Red de la estación como grafo dirigido: nodos fijos, remontes (suben) y
// pistas (bajan). Aplica las reglas de "sin puntos ciegos" de docs/diseno.md.
import { hashPareja } from './azar';
import { evaluarColores, nivelDe, pistaForzada, type Bandas, type ColorPista, type Factibilidad, type PendienteObjetivo } from './colores';
import { confluir, demasiadoCerca, pistasCruzadas, type Confluencia } from './confluencia';
import { pistaConSinuosidad, sinuosidadMinima, trazarPista, type FormaPista } from './curva';
import type { Polilinea } from './polilinea';
import { distancia, distanciaAPolilinea, segmentosSeCruzan, type Punto } from './vector';

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
  /** Tramo del trazado que comparte con otra pista (confluencia), si lo hay. */
  compartido: Confluencia['compartido'];
  /** Si al abrirla era una de las laterales de vuelta a la base de su remonte. */
  lateral: boolean;
  /** Sinuosidad real del trazado final: L / D. */
  s: number;
  /**
   * Tras recalcular con otros parámetros, su color ya no cabe en esa pareja.
   * Se mantiene (no se borra) y se traza con la sinuosidad posible más cercana.
   */
  fueraDeRango: boolean;
  /**
   * Giro de salida (grados) si se abrió con una salida orientada, para ocupar
   * un hueco libre entre las salidas de su punto. Sin él, sale sin girar.
   */
  giro?: number;
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
  /** Giro de salida máximo (grados) para orientar una pista hacia un hueco libre. */
  giroMaximo: number;
  /** Longitud de cada oscilación de la serpentina, en metros. */
  longitudOnda: number;
  margenConfluencia: number;
  tramoCompartidoMinimo: number;
  radioAcuerdo: number;
  maxCrucesPistas: number;
  maxPistasLlegada: number;
  /** 0 a 1: variación de amplitud y longitud de onda de la serpentina. */
  irregularidad: number;
  /** Amplitud mínima de la serpentina, en metros. */
  temblor: number;
  /** Margen (m) alrededor de los obstáculos que tampoco pueden pisar las pistas. */
  margenObstaculo: number;
  /** Acercarse a otra pista a menos de esto (m) cuenta como encuentro. */
  distanciaMinimaPistas: number;
  /** Ángulo mínimo (grados) entre la salida de una pista y las demás de su punto. */
  anguloMinimoSalida: number;
  /** Desnivel (m) que se tolera hacia arriba para considerar horizontal una salida. */
  toleranciaHorizontal: number;
  /** Longitud inicial (m) con la que se mide la dirección de salida. */
  longitudDireccionSalida: number;
  pendienteObjetivo: PendienteObjetivo;
}

export interface ReglasRed {
  desnivelMinimoRemonte: number;
  maxPistasPorPareja: number;
  pista: ReglasPista;
  maxEstacionesPorNodo: number;
  /**
   * Zonas que ninguna pista propuesta puede atravesar (la plaza del pie de
   * pistas). Se les suma el margen `margenObstaculo` de las reglas de pista.
   */
  obstaculos?: { x: number; y: number; radio: number }[];
  /**
   * Cota del terreno (mapa de alturas), para exigir que las pistas salgan
   * cuesta abajo y que no pasen por terreno más alto que su salida.
   */
  cotaTerreno?: (p: Punto) => number;
  /** Terreno no esquiable (roca o precipicio): ninguna pista lo cruza. */
  esRoca?: (p: Punto) => boolean;
}

export type Motivo =
  | 'ok'
  | 'origen-no-arranca'
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
  | 'color-imposible'
  | 'destino-saturado';

/** Construcción registrada en el historial. */
export type Hecho = { tipo: 'remonte'; remonte: Remonte; estacionesNuevas: number } | { tipo: 'pista'; pista: Pista };

/** Metros entre comprobaciones del terreno a lo largo de una pista (ver pisaTerrenoProhibido). */
const PASO_TERRENO = 20;

export class Red {
  readonly nodos: readonly Nodo[];
  readonly remontes: Remonte[] = [];
  readonly pistas: Pista[] = [];
  readonly estaciones: Estacion[] = [];
  /** Cambia con cada construcción o deshacer: sirve para cachés de la interfaz. */
  version = 0;
  /** Construcciones en orden, para deshacer la última. */
  private readonly historial: Hecho[] = [];

  constructor(nodos: Nodo[], readonly reglas: ReglasRed) {
    nodos.forEach((n, i) => {
      if (n.id !== i) throw new Error('Los id de nodo deben coincidir con su índice');
    });
    this.nodos = nodos;
    // Sin estaciones al empezar: cada punto es un círculo gris hasta que un
    // remonte arranca, llega o pasa por él (ver planearEstacion).
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
    // Primera estación del punto, en su centro. Un remonte que llega a un
    // intermedio lo convierte en punto de paso (cuadrado), desde el que puede
    // seguir otro tramo, salvo que ya venga de un punto de paso: una línea
    // tiene como mucho un punto intermedio, así que ese llega a un triángulo.
    if (propias.length === 0) {
      const continuacion = this.estacionesDe(otro).some((e) => e.tipo === 'paso' && !this.remontes.some((r) => r.estacionDesde === e.id));
      const paso = sentido === 'llegada' && this.nodos[nodo].tipo === 'intermedio' && !continuacion;
      return { nueva: { nodo, tipo: paso ? 'paso' : sentido, ox: 0, oy: 0 } };
    }
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

  /**
   * Estación por la que sale (o llega) una pista en un punto desdoblado. Solo
   * afecta al dibujo: el grafo, los colores y las confluencias no cambian.
   * - Las laterales (las que vuelven a la base de su remonte) salen de la
   *   estación donde llega ese remonte y llegan a la estación de donde sale.
   * - El resto, por la estación que queda del lado hacia el que va la pista
   *   (o del que viene), proyectando su dirección sobre la fila de estaciones.
   * Se calcula cada vez: si el punto se desdobla después, la pista cambia de
   * estación.
   */
  estacionDePista(p: Pick<Pista, 'desde' | 'hasta' | 'lateral'>, extremo: 'salida' | 'llegada'): Estacion {
    const nodo = extremo === 'salida' ? p.desde : p.hasta;
    const otro = extremo === 'salida' ? p.hasta : p.desde;
    const propias = this.estacionesDe(nodo);
    // Punto sin estaciones (una base a la que llegan pistas sin remonte): su centro.
    if (propias.length === 0) return { id: -1, nodo, tipo: 'salida', ox: 0, oy: 0 };
    if (propias.length === 1) return propias[0];
    const remonte = this.remontes.find((r) => r.desde === p.hasta && r.hasta === p.desde);
    if (p.lateral && remonte) return this.estaciones[extremo === 'salida' ? remonte.estacionHasta : remonte.estacionDesde];
    const n = this.nodos[nodo];
    const o = this.nodos[otro];
    const d = distancia(n, o) || 1;
    const dir = { x: (o.x - n.x) / d, y: (o.y - n.y) / d };
    // La de mayor proyección hacia ese lado; a igualdad, la más central.
    let mejor = propias[0];
    let valor = -Infinity;
    for (const e of propias) {
      const v = e.ox * dir.x + e.oy * dir.y - 1e-6 * Math.hypot(e.ox, e.oy);
      if (v > valor) {
        valor = v;
        mejor = e;
      }
    }
    return mejor;
  }

  /**
   * ¿Puede arrancar un remonte en este punto?
   * - En un punto de inicio de la plaza (base), siempre, desdoblándose.
   * - En un punto que ya es base (tiene un círculo de salida), también.
   * - En un punto gris al que podría llegar una pista desde un punto más alto
   *   al que ya llega un remonte: arrancar ahí lo convierte en base. Así se
   *   abren pistas desde media ladera y se coloniza otro valle.
   * - En un cuadrado, una sola vez, como continuación de su línea.
   * De un triángulo no arranca ninguno.
   */
  puedeArrancar(id: number): boolean {
    if (this.nodos[id].tipo === 'base') return true;
    const propias = this.estacionesDe(id);
    if (propias.some((e) => e.tipo === 'salida')) return true;
    if (propias.length === 0) return this.alcanzablePorPista(id);
    return propias.some((e) => e.tipo === 'paso' && !this.remontes.some((r) => r.estacionDesde === e.id));
  }

  private cacheAlcanzables: { version: number; clave: string; valores: Map<number, boolean> } | null = null;

  /**
   * ¿Podría llegar una pista a este punto desde otro más alto al que ya llega
   * un remonte? Se mira si cabe alguna con trazado limpio, sin exigir que el
   * punto sea viable (aún no tiene salida: la tendrá con su remonte). Se
   * guarda hasta que cambia la red o los parámetros de pista.
   */
  alcanzablePorPista(id: number): boolean {
    const clave = JSON.stringify(this.reglas.pista);
    if (this.cacheAlcanzables?.version !== this.version || this.cacheAlcanzables.clave !== clave) {
      this.cacheAlcanzables = { version: this.version, clave, valores: new Map() };
    }
    const cache = this.cacheAlcanzables.valores;
    let r = cache.get(id);
    if (r === undefined) {
      const llegadas = new Set(this.remontes.map((x) => x.hasta));
      r = [...llegadas].some((a) => this.nodos[a].cota > this.nodos[id].cota && this.pistaPosible(a, id));
      cache.set(id, r);
    }
    return r;
  }

  /** ¿Cabe alguna pista limpia de `desde` a `hasta`, aunque `hasta` aún no sea viable? */
  pistaPosible(desde: number, hasta: number): boolean {
    if (this.motivoPista(desde, hasta, undefined, undefined, undefined, false) !== 'ok') return false;
    return this.ladosLibres(desde, hasta).some((l) => this.giroLimpio(desde, hasta, l) !== null);
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
   * Dificultad efectiva de una pista (0 verde … 3 negra): la de su color o, si
   * se une a otra, la mayor de las dos (el tramo común manda). Un esquiador
   * solo la coge si su nivel llega a esta dificultad.
   */
  dificultad(p: Pista): number {
    const propia = nivelDe(p.color);
    const otra = p.compartido ? this.pistas[p.compartido.pista] : undefined;
    return otra ? Math.max(propia, this.dificultad(otra)) : propia;
  }

  /** ¿Es una pista forzada (empinada para su color)? Divierte menos a su nivel. */
  forzada(p: Pista): boolean {
    return pistaForzada(p.color, p.pendiente, this.reglas.pista.bandas);
  }

  private cacheViables: { version: number; porNivel: Set<number>[] } | null = null;

  /**
   * Puntos desde los que un esquiador de cada nivel (0 verde … 3 negra) puede
   * llegar a una base: por remontes en servicio y por pistas de dificultad
   * efectiva no mayor que su nivel. Se recalcula cuando cambia la red.
   */
  viablesPorNivel(): Set<number>[] {
    if (this.cacheViables?.version === this.version) return this.cacheViables.porNivel;
    const porNivel = [0, 1, 2, 3].map((nivel) => {
      const aristas: [number, number][] = this.pistas.filter((p) => this.dificultad(p) <= nivel).map((p) => [p.desde, p.hasta]);
      for (const r of this.remontes) if (this.enServicio(r)) aristas.push([r.desde, r.hasta]);
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
      return alcanza;
    });
    this.cacheViables = { version: this.version, porNivel };
    return porNivel;
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
  /** ¿Sería una de las laterales de vuelta a la base de un remonte? */
  esLateral(desde: number, hasta: number): boolean {
    return this.remontes.some((r) => r.desde === hasta && r.hasta === desde);
  }

  /** Abombamiento de las reglas para la pareja: el de las laterales o el normal. */
  abombamientoBase(desde: number, hasta: number, lateral = this.esLateral(desde, hasta)): number {
    return lateral ? this.reglas.pista.abombamientoLateral : this.reglas.pista.abombamientoNormal;
  }

  /**
   * Forma de la pista. `giro` (grados) hace salir la pista girada hacia su
   * lado (salida orientada, ver giroLimpio).
   */
  forma(desde: number, hasta: number, lado: 1 | -1, lateral = this.esLateral(desde, hasta), giro?: number): FormaPista {
    const rp = this.reglas.pista;
    const d = distancia(this.nodos[desde], this.nodos[hasta]);
    return {
      lado,
      abombamiento: this.abombamientoBase(desde, hasta, lateral),
      giro,
      ondas: Math.max(1, Math.round(d / rp.longitudOnda)),
      irregularidad: rp.irregularidad,
      temblor: rp.temblor,
      semilla: hashPareja(desde, hasta) + (lado > 0 ? 1 : 0),
    };
  }

  /**
   * Lado libre para una pista nueva entre la pareja. La primera va por el lado
   * en que su curva corta menos remontes (a igualdad, por semilla) y la
   * segunda por el contrario (lente). null si no queda.
   */
  ladoLibre(desde: number, hasta: number): 1 | -1 | null {
    const existentes = this.pistasEntre(desde, hasta);
    if (existentes.length >= this.reglas.maxPistasPorPareja) return null;
    if (existentes.length > 0) return -existentes[0].lado as 1 | -1;
    const porSemilla: 1 | -1 = hashPareja(desde, hasta) & 1 ? 1 : -1;
    const cruces = (lado: 1 | -1) =>
      this.crucesConRemontes(trazarPista(this.nodos[desde], this.nodos[hasta], this.forma(desde, hasta, lado), 0));
    const a = cruces(porSemilla);
    if (a === 0) return porSemilla;
    return cruces(-porSemilla as 1 | -1) < a ? (-porSemilla as 1 | -1) : porSemilla;
  }

  /** ¿Entra la polilínea en algún obstáculo (más su margen)? */
  pisaObstaculo(l: Polilinea): boolean {
    const m = this.reglas.pista.margenObstaculo;
    return (this.reglas.obstaculos ?? []).some((o) => distanciaAPolilinea(o, l.puntos) < o.radio + m);
  }

  /**
   * ¿Pisa el trazado terreno no esquiable, o pasa por terreno más alto que la
   * cota de su salida (más la tolerancia de `toleranciaHorizontal`)? Se
   * comprueba cada `PASO_TERRENO` metros. Un cordal o una banda de roca cierran
   * así el paso de verdad, aunque la recta entre los nodos baje.
   */
  pisaTerrenoProhibido(desde: number, l: Polilinea): boolean {
    const { esRoca, cotaTerreno } = this.reglas;
    if (!esRoca && !cotaTerreno) return false;
    const techo = this.nodos[desde].cota + this.reglas.pista.toleranciaHorizontal;
    for (let s = 0; s <= l.longitud; s += PASO_TERRENO) {
      const p = l.puntoEn(s);
      if (esRoca?.(p)) return true;
      if (cotaTerreno && cotaTerreno(p) > techo) return true;
    }
    return false;
  }

  /** Número de veces que una polilínea corta la línea de algún remonte. */
  crucesConRemontes(l: Polilinea): number {
    let n = 0;
    for (const r of this.remontes) {
      const a = this.nodos[r.desde];
      const b = this.nodos[r.hasta];
      for (let i = 1; i < l.puntos.length; i++) if (segmentosSeCruzan(l.puntos[i - 1], l.puntos[i], a, b)) n++;
    }
    return n;
  }

  /** Lados disponibles: los dos si la pareja no tiene pistas, si no el contrario. */
  ladosLibres(desde: number, hasta: number): (1 | -1)[] {
    const primero = this.ladoLibre(desde, hasta);
    if (primero === null) return [];
    if (this.pistasEntre(desde, hasta).length > 0 || this.reglas.maxPistasPorPareja < 2) return [primero];
    return [primero, -primero as 1 | -1];
  }

  /** Factibilidad de cada color para la pareja y el lado. */
  colores(desde: number, hasta: number, lado: 1 | -1, lateral = this.esLateral(desde, hasta), giro?: number): Factibilidad[] {
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const rp = this.reglas.pista;
    const sMin = sinuosidadMinima(a, b, this.forma(desde, hasta, lado, lateral, giro));
    return evaluarColores(a.cota - b.cota, distancia(a, b), sMin, rp.sinuosidadMaxima, rp.bandas, rp.pendienteObjetivo);
  }

  puedeConstruirRemonte(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.puedeArrancar(desde)) return 'origen-no-arranca';
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
  puedeAbrirPista(desde: number, hasta: number, color?: ColorPista, lado?: 1 | -1, giro?: number): Motivo {
    return this.motivoPista(desde, hasta, color, lado, giro, true);
  }

  /** Como puedeAbrirPista; con `exigirViable` false no mira si el destino tiene salida. */
  private motivoPista(desde: number, hasta: number, color: ColorPista | undefined, lado: 1 | -1 | undefined, giro: number | undefined, exigirViable: boolean): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[desde].tipo === 'base') return 'pista-desde-base';
    if (this.nodos[hasta].cota >= this.nodos[desde].cota) return 'destino-no-mas-bajo';
    const libres = this.ladosLibres(desde, hasta);
    if (libres.length === 0 || (lado !== undefined && !libres.includes(lado))) return 'ya-existe';
    // Tope de pistas llegando a un punto. Las salidas se limitan por ángulo
    // (ver salidaSeparada), al proponer.
    if (this.pistas.filter((p) => p.hasta === hasta).length >= this.reglas.pista.maxPistasLlegada) return 'destino-saturado';
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    if ((a.cota - b.cota) / distancia(a, b) < this.reglas.pista.bandas.verde[0]) return 'demasiado-plana';
    const colores = this.colores(desde, hasta, lado ?? libres[0], undefined, giro);
    if (!colores.some((c) => c.factible)) return 'sin-color';
    if (color && !colores.find((c) => c.color === color)!.factible) return 'color-imposible';
    if (exigirViable && !this.viable(hasta, { desde, hasta })) return 'destino-no-viable';
    return 'ok';
  }

  /** Dirección de salida de un trazado: la de sus primeros metros. */
  private direccionSalida(l: Polilinea): Punto {
    const a = l.puntos[0];
    const b = l.puntoEn(Math.min(this.reglas.pista.longitudDireccionSalida, l.longitud / 2));
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  }

  /**
   * ¿Sale el trazado de `desde` cuesta abajo (o, como mucho, en horizontal) y
   * con una dirección separada al menos el ángulo mínimo de cada pista que ya
   * sale de ese punto? Sin tope de número: en una ladera plana caben hasta
   * 180° / ángulo + 1 salidas (5 con 45°). Las dos laterales de un mismo
   * remonte no cuentan entre sí.
   */
  salidaSeparada(desde: number, hasta: number, trazado: Polilinea): boolean {
    const rp = this.reglas.pista;
    const dir = this.direccionSalida(trazado);
    const terreno = this.reglas.cotaTerreno;
    if (terreno) {
      const n = this.nodos[desde];
      const lejos = { x: n.x + dir.x * rp.longitudDireccionSalida, y: n.y + dir.y * rp.longitudDireccionSalida };
      if (terreno(lejos) > terreno(n) + rp.toleranciaHorizontal) return false;
    }
    const minimo = (rp.anguloMinimoSalida * Math.PI) / 180;
    const lateral = this.esLateral(desde, hasta);
    return this.pistas
      .filter((q) => q.desde === desde)
      .every((q) => {
        if (lateral && q.lateral && q.hasta === hasta) return true; // su pareja de lente
        const d = this.direccionSalida(q.trazado);
        return Math.acos(Math.min(1, Math.max(-1, dir.x * d.x + dir.y * d.y))) >= minimo - 1e-9;
      });
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
    this.version++;
    this.historial.push({ tipo: 'remonte', remonte: r, estacionesNuevas: this.estaciones.length - antes });
    return r;
  }

  /** `giro`: el de una salida orientada (ver giroLimpio); si no, el de las reglas. */
  abrirPista(desde: number, hasta: number, color: ColorPista, lado?: 1 | -1, giro?: number): Pista {
    const motivo = this.puedeAbrirPista(desde, hasta, color, lado, giro);
    if (motivo !== 'ok') throw new Error(`No se puede abrir la pista: ${motivo}`);
    const l = lado ?? this.ladoLibre(desde, hasta)!;
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const lateral = this.esLateral(desde, hasta);
    const s = this.colores(desde, hasta, l, lateral, giro).find((c) => c.color === color)!.s;
    const { trazado, compartido } = this.confluir(hasta, pistaConSinuosidad(a, b, this.forma(desde, hasta, l, lateral, giro), s)!);
    const p: Pista = {
      id: this.pistas.length,
      desde,
      hasta,
      lado: l,
      color,
      trazado,
      compartido,
      lateral,
      giro,
      s: trazado.longitud / distancia(a, b),
      fueraDeRango: false,
      pendiente: (a.cota - b.cota) / trazado.longitud,
    };
    this.pistas.push(p);
    this.version++;
    this.historial.push({ tipo: 'pista', pista: p });
    return p;
  }

  /** Une el trazado propio a la primera pista existente que toque. */
  private confluir(hasta: number, propio: Polilinea, previas: Pista[] = this.pistas): Confluencia {
    const rp = this.reglas.pista;
    const existentes = previas.map((p) => ({
      id: p.id,
      hasta: p.hasta,
      trazado: p.trazado,
      cotaDesde: this.nodos[p.desde].cota,
      cotaHasta: this.nodos[p.hasta].cota,
    }));
    return confluir(propio, this.nodos[hasta], existentes, {
      margenInicio: rp.margenConfluencia,
      tramoMinimo: rp.tramoCompartidoMinimo,
      radioAcuerdo: rp.radioAcuerdo,
      distanciaMinima: rp.distanciaMinimaPistas,
    });
  }

  /**
   * Recalcula, en su orden de apertura, todas las pistas abiertas con los
   * parámetros actuales (forma, sinuosidad y confluencias con las anteriores).
   * Si su color ya no cabe, la marca como fuera de rango y la traza con la
   * sinuosidad posible más cercana, sin borrarla.
   */
  recalcularPistas(): void {
    const rp = this.reglas.pista;
    for (const p of this.pistas) {
      const a = this.nodos[p.desde];
      const b = this.nodos[p.hasta];
      const forma = this.forma(p.desde, p.hasta, p.lado, p.lateral, p.giro);
      const f = this.colores(p.desde, p.hasta, p.lado, p.lateral, p.giro).find((c) => c.color === p.color)!;
      const sMin = sinuosidadMinima(a, b, forma);
      const sObjetivo = f.factible ? f.s : Math.min(Math.max(f.s, sMin), rp.sinuosidadMaxima);
      const propio = pistaConSinuosidad(a, b, forma, Math.max(sObjetivo, sMin)) ?? trazarPista(a, b, forma, 0);
      const { trazado, compartido } = this.confluir(p.hasta, propio, this.pistas.slice(0, p.id));
      p.trazado = trazado;
      p.compartido = compartido;
      p.fueraDeRango = !f.factible;
      p.s = trazado.longitud / distancia(a, b);
      p.pendiente = (a.cota - b.cota) / trazado.longitud;
    }
    this.version++;
  }

  /** Trazado real que tendría la pista con ese color (sinuosidad del color y confluencia). */
  trazadoReal(desde: number, hasta: number, lado: 1 | -1, color: ColorPista, giro?: number): Confluencia | null {
    const f = this.colores(desde, hasta, lado, undefined, giro).find((c) => c.color === color)!;
    if (!f.factible) return null;
    const propio = pistaConSinuosidad(this.nodos[desde], this.nodos[hasta], this.forma(desde, hasta, lado, undefined, giro), f.s);
    return propio ? this.confluir(hasta, propio) : null;
  }

  /**
   * ¿Enmaraña este trazado? Limpio si no entra en la plaza, no va casi pegado
   * a otra pista sin unirse, no cruza sin unirse más pistas que el máximo y
   * sale cuesta abajo separado de las demás salidas. Cortar remontes sí se
   * permite: es un cruce solo visual, como un puente.
   */
  trazadoLimpioDe(desde: number, hasta: number, conf: Confluencia): boolean {
    const rp = this.reglas.pista;
    // Ni el tramo propio ni el compartido ni el ramal pueden entrar en la plaza.
    if (this.pisaObstaculo(conf.trazado)) return false;
    if (this.pisaTerrenoProhibido(desde, conf.trazado)) return false;
    const existentes = this.pistas.map((p) => ({
      id: p.id,
      hasta: p.hasta,
      trazado: p.trazado,
      cotaDesde: this.nodos[p.desde].cota,
      cotaHasta: this.nodos[p.hasta].cota,
      compartido: p.compartido,
    }));
    // Si se acerca a otra a menos de la distancia mínima y no ha podido unirse,
    // iría casi pegada a ella.
    if (demasiadoCerca(conf, existentes, rp.distanciaMinimaPistas, rp.margenConfluencia, rp.radioAcuerdo)) return false;
    if (pistasCruzadas(conf, existentes, rp.margenConfluencia, rp.radioAcuerdo) > rp.maxCrucesPistas) return false;
    return this.salidaSeparada(desde, hasta, conf.trazado);
  }

  private cacheLimpios = new Map<string, Factibilidad[]>();

  /**
   * Colores de la pareja que se pueden elegir: posibles por pendiente y con un
   * trazado real (el de ese color) que no enmaraña. Se guardan hasta que
   * cambia la red.
   */
  coloresLimpios(desde: number, hasta: number, lado: 1 | -1, giro?: number): Factibilidad[] {
    // La clave incluye los parámetros de pista: el panel de ajustes (y las
    // pruebas) los cambian en memoria.
    const clave = `${this.version}|${desde}|${hasta}|${lado}|${giro ?? ''}|${JSON.stringify(this.reglas.pista)}`;
    let r = this.cacheLimpios.get(clave);
    if (!r) {
      if (this.cacheLimpios.size > 2000) this.cacheLimpios.clear();
      r = this.colores(desde, hasta, lado, undefined, giro).map((c) => {
        if (!c.factible) return c;
        const conf = this.trazadoReal(desde, hasta, lado, c.color, giro);
        return { ...c, factible: conf !== null && this.trazadoLimpioDe(desde, hasta, conf) };
      });
      this.cacheLimpios.set(clave, r);
    }
    return r;
  }

  /**
   * Salida orientada: el menor giro de salida (en pasos de 10°, hasta
   * `giroMaximo`) con el que la pista tiene algún color limpio. Si su salida
   * no cabe entre las que ya hay, la pista sale girada hacia su lado y vuelve
   * enseguida a su eje: así ocupa un hueco libre (sale de lado y luego baja).
   * Devuelve undefined si vale sin girar, y null si no vale ningún giro.
   */
  giroLimpio(desde: number, hasta: number, lado: 1 | -1): number | undefined | null {
    if (this.coloresLimpios(desde, hasta, lado).some((c) => c.factible)) return undefined;
    for (let g = 10; g <= this.reglas.pista.giroMaximo + 1e-9; g += 10) {
      if (this.coloresLimpios(desde, hasta, lado, g).some((c) => c.factible)) return g;
    }
    return null;
  }

  /**
   * Colores que ofrece el selector, cada uno con su propio giro de salida: el
   * menor (sin girar, o en pasos de 10° hasta `giroMaximo`) con el que ese
   * color da un trazado limpio. Cada color tiene su sinuosidad y su
   * serpentina, así que sus primeros metros apuntan a sitios distintos: un
   * giro que vale para uno puede no valer para otro.
   */
  coloresElegibles(desde: number, hasta: number, lado: 1 | -1): (Factibilidad & { giro?: number })[] {
    const giros: (number | undefined)[] = [undefined];
    for (let g = 10; g <= this.reglas.pista.giroMaximo + 1e-9; g += 10) giros.push(g);
    const base = this.coloresLimpios(desde, hasta, lado);
    return base.map((c, i) => {
      for (const g of giros) {
        const f = g === undefined ? c : this.coloresLimpios(desde, hasta, lado, g)[i];
        if (f.factible) return g === undefined ? f : { ...f, giro: g };
      }
      return c;
    });
  }

  /** ¿Se puede proponer este proyecto? Si algún color da un trazado limpio, con alguna salida. */
  trazadoLimpio(desde: number, hasta: number, lado: 1 | -1): boolean {
    return this.giroLimpio(desde, hasta, lado) !== null;
  }

  /**
   * Trazado que se muestra a trazos para un proyecto: el real del color limpio
   * que menos serpentea, para que lo que se ve sea lo que se abrirá. Si no hay
   * ninguno, el de sinuosidad mínima.
   */
  trazadoPrevisto(desde: number, hasta: number, lado: 1 | -1, giro?: number): Confluencia {
    const limpios = this.coloresLimpios(desde, hasta, lado, giro).filter((c) => c.factible);
    if (limpios.length > 0) {
      const mejor = limpios.reduce((m, c) => (c.s < m.s ? c : m));
      const conf = this.trazadoReal(desde, hasta, lado, mejor.color, giro);
      if (conf) return conf;
    }
    return this.confluir(hasta, trazarPista(this.nodos[desde], this.nodos[hasta], this.forma(desde, hasta, lado, undefined, giro), 0));
  }

  /**
   * Editor del mapa de pruebas: cambia la posición o la cota de unos nodos y
   * rehace en sitio remontes y pistas (las que ya no caben en su color quedan
   * fuera de rango, como al recalcular desde el panel de ajustes).
   */
  actualizarNodos(cambios: readonly Pick<Nodo, 'id' | 'x' | 'y' | 'cota'>[]): void {
    for (const c of cambios) Object.assign(this.nodos[c.id], { x: c.x, y: c.y, cota: c.cota });
    for (const r of this.remontes) r.longitud = distancia(this.nodos[r.desde], this.nodos[r.hasta]);
    this.recalcularPistas();
  }

  /** Construcciones en el orden en que se hicieron. */
  get construcciones(): readonly Hecho[] {
    return this.historial;
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
    this.version++;
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
