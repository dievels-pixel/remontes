// Estado de la partida y reglas de los gestos. Une la lógica pura (red,
// proyectos y simulación) con la entrada; no dibuja.
import { CONFIG } from './config';
import { generarMapaAlturas, MapaAlturas } from './core/alturas';
import { crearAzar } from './core/azar';
import { copiarBandas, type ColorPista, type Factibilidad } from './core/colores';
import type { Confluencia } from './core/confluencia';
import { idsIguales, idsTrasBorrar, reconstruirRed, sitioLibre, type LimitesMapa } from './core/editorMapa';
import { crearNodos, MAPA_INICIAL, PLAZA, type DefinicionNodo } from './core/mapa';
import { claveProyecto, proyectosDeRemonte, proyectosDesde, type Proyecto } from './core/proyectos';
import { Red, type Estacion, type Motivo, type ReglasRed, type TipoNodo } from './core/red';
import { Simulacion } from './core/simulacion';
import { distancia, distanciaAPolilinea, type Punto } from './core/vector';

export interface Arrastre {
  origen: number;
  puntero: Punto;
  /** Se ha alejado del nodo de origen: ya no es un toque. */
  movido: boolean;
  /** Nodo bajo el dedo (válido o no) y si se podría construir el remonte. */
  objetivo: { nodo: number; motivo: Motivo } | null;
}

/** De dónde salen los proyectos que se ven: la última obra o un nodo tocado. */
export type Foco = { tipo: 'remonte'; id: number } | { tipo: 'nodo'; id: number } | null;

export interface Selector {
  proyecto: Proyecto;
  /** Punto del mundo donde se tocó, para colocar el selector. */
  punto: Punto;
  colores: Factibilidad[];
}

/** Herramientas del editor del mapa de pruebas (?ajustes). */
export type HerramientaMapa = 'mover' | TipoNodo | 'borrar';

/** Punto que se arrastra con la herramienta «mover». */
export interface ArrastreNodo {
  id: number;
  punto: Punto;
  /** Se puede soltar ahí (dentro del mapa, fuera de la plaza, no pegado a otro). */
  valido: boolean;
}

const LIMITES_MAPA: LimitesMapa = {
  ancho: CONFIG.mundo.ancho,
  alto: CONFIG.mundo.alto,
  separacion: 80,
  obstaculo: { ...PLAZA, radio: PLAZA.radio + 40 },
};

const TEXTO_MOTIVO: Partial<Record<Motivo, string>> = {
  'destino-no-mas-alto': 'Los remontes solo suben. Las pistas se abren tocando los trazos discontinuos.',
  'destino-base': 'Los remontes no terminan en un punto de inicio.',
  'ya-existe': 'Ya está construido.',
  'cruza-remonte': 'Los remontes no pueden cruzarse.',
  'origen-lleno': `De este punto ya salen todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
  'destino-lleno': `A este punto ya llegan todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
};

export class Juego {
  // No son readonly: el editor del mapa de pruebas puede rehacerlos.
  alturas: MapaAlturas;
  red: Red;
  sim: Simulacion;
  /** Puntos del mapa (tipo y posición); las cotas salen del terreno. */
  definicion: DefinicionNodo[] = MAPA_INICIAL.map((d) => ({ ...d }));
  /** Editor del mapa de pruebas: herramienta activa, o null si está cerrado. */
  herramientaMapa: HerramientaMapa | null = null;
  arrastreNodo: ArrastreNodo | null = null;
  /** Aviso tras cambiar el mapa (para guardarlo, en el panel de ajustes). */
  alCambiarMapa: (() => void) | null = null;
  private readonly reglasRed: ReglasRed;
  arrastre: Arrastre | null = null;
  foco: Foco = null;
  selector: Selector | null = null;
  mensaje: { texto: string; hasta: number } | null = null;
  /** Multiplicador de tiempo: 1×, 2× o 4×. */
  velocidad: 1 | 2 | 4 = 1;
  /**
   * Modo de calibración (?ajustes en la dirección). Herramienta temporal: al
   * tocar una pista abierta muestra su color, sinuosidad y pendiente.
   */
  modoAjustes = false;
  infoPista: { pista: number; punto: Punto } | null = null;

  constructor() {
    const { mundo, alturas, pista, remonte } = CONFIG;
    this.alturas = generarMapaAlturas(alturas, mundo.ancho, mundo.alto);
    this.reglasRed = {
      desnivelMinimoRemonte: remonte.desnivelMinimo,
      maxPistasPorPareja: pista.maxPorPareja,
      // Copia modificable (bandas incluidas): el panel de ajustes la cambia en memoria.
      pista: { ...pista, bandas: copiarBandas(pista.bandas) },
      maxEstacionesPorNodo: CONFIG.estaciones.maxPorEmplazamiento,
      // La plaza del pie de pistas es un obstáculo para las pistas.
      obstaculos: [PLAZA],
      // Para exigir que las pistas salgan cuesta abajo según el terreno.
      cotaTerreno: (p) => this.alturas.cotaEn(p),
    };
    this.red = new Red(crearNodos(this.alturas, this.definicion), this.reglasRed);
    this.sim = this.nuevaSimulacion();
  }

  private nuevaSimulacion(): Simulacion {
    const { remonte, esquiador } = CONFIG;
    return new Simulacion(
      this.red,
      {
        velocidadRemonte: remonte.velocidad,
        intervaloBolitas: remonte.intervaloBolitas,
        capacidadBolita: remonte.capacidad,
        ...esquiador,
      },
      PLAZA,
      crearAzar(12345),
    );
  }

  // ---- Editor del mapa de pruebas (?ajustes) ----

  get cotaMaxima(): number {
    return this.alturas.cotaMax;
  }

  /** Rehace la red sobre otra lista de puntos, repitiendo lo construido. */
  private rehacer(definicion: DefinicionNodo[], ids: readonly (number | null)[]): void {
    const vieja = this.red;
    this.definicion = definicion;
    this.red = new Red(crearNodos(this.alturas, definicion), this.reglasRed);
    const { omitidas } = reconstruirRed(vieja, this.red, ids);
    this.sim = this.nuevaSimulacion();
    this.trasCambiarMapa();
    if (omitidas > 0) this.avisar(`No se han podido rehacer ${omitidas} construcciones.`);
  }

  private trasCambiarMapa(): void {
    this.cacheProyectos = null;
    this.selector = null;
    this.infoPista = null;
    this.arrastre = null;
    if (this.foco?.tipo === 'remonte' && !this.red.remontes[this.foco.id]) this.foco = null;
    if (this.foco?.tipo === 'nodo' && !this.red.nodos[this.foco.id]) this.foco = null;
    this.alCambiarMapa?.();
  }

  /** Cambia el desnivel del terreno: la cota de abajo se mantiene y se estira hasta `cotaMax`. */
  cambiarDesnivel(cotaMax: number): void {
    const a = this.alturas;
    this.alturas = new MapaAlturas(a.columnas, a.filas, a.ancho, a.alto, a.cotaMin, cotaMax, a.gris);
    this.red.actualizarNodos(this.red.nodos.map((n) => ({ ...n, cota: Math.round(this.alturas.cotaEn(n)) })));
    this.trasCambiarMapa();
  }

  /** Carga un mapa guardado (o el original) y vacía la red. */
  cargarMapa(definicion: readonly DefinicionNodo[], cotaMax: number): void {
    const a = this.alturas;
    this.alturas = new MapaAlturas(a.columnas, a.filas, a.ancho, a.alto, a.cotaMin, cotaMax, a.gris);
    this.definicion = definicion.map((d) => ({ ...d }));
    this.red = new Red(crearNodos(this.alturas, this.definicion), this.reglasRed);
    this.sim = this.nuevaSimulacion();
    this.foco = null;
    this.trasCambiarMapa();
  }

  /**
   * Toque con una herramienta del editor. Devuelve true si empieza a
   * arrastrar un punto (herramienta «mover»).
   */
  editarMapa(p: Punto, radioMundo: number, sepMundo: number): boolean {
    const h = this.herramientaMapa;
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (h === 'mover') {
      if (n === null) return false;
      this.arrastreNodo = { id: n, punto: p, valido: true };
      return true;
    }
    if (h === 'borrar') {
      if (n !== null) this.rehacer(this.definicion.filter((_, i) => i !== n), idsTrasBorrar(this.definicion.length, n));
      return false;
    }
    if (h) {
      if (!sitioLibre(this.definicion, p, LIMITES_MAPA)) {
        this.avisar('Ahí no: fuera del mapa, en la plaza o pegado a otro punto.');
        return false;
      }
      this.rehacer([...this.definicion, { tipo: h, x: Math.round(p.x), y: Math.round(p.y) }], idsIguales(this.definicion.length));
    }
    return false;
  }

  private soltarNodo(): void {
    const a = this.arrastreNodo;
    this.arrastreNodo = null;
    if (!a || !a.valido) return;
    const x = Math.round(a.punto.x);
    const y = Math.round(a.punto.y);
    this.definicion[a.id] = { ...this.definicion[a.id], x, y };
    this.red.actualizarNodos([{ id: a.id, x, y, cota: Math.round(this.alturas.cotaEn({ x, y })) }]);
    this.trasCambiarMapa();
  }

  paso(dt: number): void {
    this.sim.paso(dt);
  }

  cambiarVelocidad(): void {
    this.velocidad = this.velocidad === 1 ? 2 : this.velocidad === 2 ? 4 : 1;
  }

  private avisar(texto: string): void {
    this.mensaje = { texto, hasta: performance.now() + 2500 };
  }

  // ---- Proyectos de pista ----

  /**
   * Proyectos a la vista: los de la última obra o del nodo tocado, más los
   * que salen de la llegada de cada remonte aún parado, como recordatorio.
   */
  proyectosVisibles(): Proyecto[] {
    // Se recalculan solo si cambia la red o el foco: el dibujo los pide en
    // cada fotograma y las confluencias son caras.
    const clave = `${this.red.version}|${JSON.stringify(this.foco)}`;
    if (this.cacheProyectos?.clave !== clave) this.cacheProyectos = { clave, lista: this.calcularProyectos(), trazados: new Map() };
    return this.cacheProyectos.lista;
  }

  private cacheProyectos: { clave: string; lista: Proyecto[]; trazados: Map<string, Confluencia> } | null = null;

  private calcularProyectos(): Proyecto[] {
    const max = CONFIG.pista.proyectosPorDireccion;
    const lista: Proyecto[] = [];
    const f = this.foco;
    if (f?.tipo === 'remonte' && this.red.remontes[f.id]) lista.push(...proyectosDeRemonte(this.red, this.red.remontes[f.id], max));
    if (f?.tipo === 'nodo') lista.push(...proyectosDesde(this.red, f.id, max));
    for (const r of this.red.remontes) if (!this.red.enServicio(r)) lista.push(...proyectosDesde(this.red, r.hasta, max));
    const vistos = new Set<string>();
    return lista.filter((p) => {
      const k = claveProyecto(p);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }

  /** Trazado a trazos de un proyecto: su sinuosidad mínima y su confluencia. */
  trazadoProyecto(p: Proyecto): Confluencia {
    this.proyectosVisibles(); // asegura que la caché corresponde a la red actual
    const cache = this.cacheProyectos!.trazados;
    const k = claveProyecto(p);
    let t = cache.get(k);
    if (!t) {
      t = this.red.trazadoPrevisto(p.desde, p.hasta, p.lado, p.giro);
      cache.set(k, t);
    }
    return t;
  }

  /** Toque fuera de los nodos: abre el selector si cae sobre un proyecto. */
  tocar(p: Punto, toleranciaMundo: number): void {
    let mejor: Proyecto | null = null;
    let dMin = toleranciaMundo;
    for (const pr of this.proyectosVisibles()) {
      const d = distanciaAPolilinea(p, this.trazadoProyecto(pr).trazado.puntos);
      if (d < dMin) {
        dMin = d;
        mejor = pr;
      }
    }
    this.infoPista = null;
    if (mejor) {
      // Colores apagados: los que no caben por pendiente y los que darían una
      // pista que enmaraña (corta remontes, cruza demasiadas pistas...).
      this.selector = { proyecto: mejor, punto: p, colores: this.red.coloresLimpios(mejor.desde, mejor.hasta, mejor.lado, mejor.giro) };
      return;
    }
    if (this.modoAjustes) {
      let cerca: number | null = null;
      let d = toleranciaMundo;
      for (const pi of this.red.pistas) {
        const di = distanciaAPolilinea(p, pi.trazado.puntos);
        if (di < d) {
          d = di;
          cerca = pi.id;
        }
      }
      if (cerca !== null) {
        this.infoPista = { pista: cerca, punto: p };
        return;
      }
    }
    this.foco = null;
  }

  elegirColor(color: ColorPista): void {
    const s = this.selector;
    this.selector = null;
    if (!s) return;
    const { desde, hasta, lado, giro } = s.proyecto;
    const motivo = this.red.puedeAbrirPista(desde, hasta, color, lado, giro);
    const limpio = this.red.coloresLimpios(desde, hasta, lado, giro).find((c) => c.color === color)?.factible;
    if (motivo !== 'ok' || !limpio) {
      this.avisar('Esa pista ya no se puede abrir.');
      return;
    }
    this.red.abrirPista(desde, hasta, color, lado, giro);
  }

  /** Tras cambiar parámetros de pista (panel de ajustes): rehace todo. */
  recalcularPistas(): void {
    this.selector = null;
    this.red.recalcularPistas();
  }

  cerrarSelector(): void {
    this.selector = null;
  }

  // ---- Remontes: arrastre ----

  /** ¿Se podría construir un remonte de `origen` a `destino`? */
  evaluar(origen: number, destino: number): Motivo {
    return this.red.puedeConstruirRemonte(origen, destino);
  }

  /**
   * Posición en el mundo de una estación. `sepMundo` es la separación entre
   * estaciones pasada a metros con la escala actual de la cámara.
   */
  posicionEstacion(e: Pick<Estacion, 'nodo' | 'ox' | 'oy'>, sepMundo: number): Punto {
    const n = this.red.nodo(e.nodo);
    return { x: n.x + e.ox * sepMundo, y: n.y + e.oy * sepMundo };
  }

  /** Nodo con alguna estación más cerca del punto que el radio dado. */
  nodoEn(p: Punto, radioMundo: number, sepMundo = 0): number | null {
    let mejor: number | null = null;
    let dMin = radioMundo;
    for (const e of this.red.estaciones) {
      const d = distancia(p, this.posicionEstacion(e, sepMundo));
      if (d <= dMin) {
        dMin = d;
        mejor = e.nodo;
      }
    }
    return mejor;
  }

  empezarArrastre(p: Punto, radioMundo: number, sepMundo = 0): boolean {
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (n === null || !this.red.activo(n)) return false;
    this.arrastre = { origen: n, puntero: p, movido: false, objetivo: null };
    return true;
  }

  moverArrastre(p: Punto, radioMundo: number, sepMundo = 0): void {
    if (this.arrastreNodo) {
      this.arrastreNodo.punto = p;
      this.arrastreNodo.valido = sitioLibre(this.definicion, p, LIMITES_MAPA, this.arrastreNodo.id);
      return;
    }
    const a = this.arrastre;
    if (!a) return;
    a.puntero = p;
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (n !== a.origen) a.movido = true;
    a.objetivo = n === null || n === a.origen ? null : { nodo: n, motivo: this.evaluar(a.origen, n) };
  }

  /** Al soltar: construye el remonte o, si no se movió, es un toque al nodo. */
  soltarArrastre(): void {
    if (this.arrastreNodo) return this.soltarNodo();
    const a = this.arrastre;
    this.arrastre = null;
    if (!a) return;
    if (!a.movido) {
      this.foco = { tipo: 'nodo', id: a.origen };
      if (proyectosDesde(this.red, a.origen, CONFIG.pista.proyectosPorDireccion).length === 0 && this.red.nodo(a.origen).tipo !== 'base') {
        this.avisar('Desde aquí no se puede abrir ninguna pista ahora.');
      }
      return;
    }
    if (!a.objetivo) return;
    if (a.objetivo.motivo !== 'ok') {
      const texto = TEXTO_MOTIVO[a.objetivo.motivo];
      if (texto) this.avisar(texto);
      return;
    }
    const r = this.red.construirRemonte(a.origen, a.objetivo.nodo);
    this.foco = { tipo: 'remonte', id: r.id };
  }

  cancelarArrastre(): void {
    this.arrastre = null;
    this.arrastreNodo = null;
  }

  /** Deshace la última construcción (remonte o pista). */
  deshacer(): void {
    this.arrastre = null;
    this.selector = null;
    this.infoPista = null;
    const h = this.red.deshacer();
    if (h) this.sim.alDeshacer(h);
    if (this.foco?.tipo === 'remonte' && !this.red.remontes[this.foco.id]) this.foco = null;
  }

  /** Indicación para el jugador según el estado de la red. */
  ayuda(): string {
    const h = this.herramientaMapa;
    if (h === 'mover') return 'Editor: arrastra un punto para moverlo. Su cota sale del terreno.';
    if (h === 'borrar') return 'Editor: toca un punto para borrarlo, con lo que se apoyaba en él.';
    if (h) return `Editor: toca el mapa para añadir ${h === 'base' ? 'una base' : h === 'cima' ? 'una cima' : 'un intermedio'}.`;
    if (this.red.remontes.length === 0) return 'Arrastra desde un punto de inicio hasta un punto más alto para construir un remonte.';
    if (this.selector) return 'Elige el color de la pista. Los apagados no caben con esa pendiente o enmarañarían las pistas.';
    const parado = this.red.remontes.find((r) => !this.red.enServicio(r));
    if (parado) return 'El remonte gris necesita una bajada: toca un trazo discontinuo y elige color.';
    return `Esquiadores: ${this.sim.poblacion} · Bajadas: ${this.sim.bajadasCompletadas} · Se han ido: ${this.sim.seFueron}`;
  }
}
