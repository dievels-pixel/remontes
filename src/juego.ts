// Estado de la partida y reglas de los gestos. Une la lógica pura (red,
// pistas y simulación) con la entrada; no dibuja.
//
// Gestos: arrastrar desde un punto hacia otro más alto construye un remonte;
// hacia uno más bajo, una pista (al soltar se elige el color).
import { CONFIG, type Config } from './config';
import { aplicarParametros, type ParametrosNivel } from './core/nivel';
import type { ResumenPartida } from './core/retos';
import { trazarCarretera } from './core/afluencia';
import { MapaAlturas } from './core/alturas';
import { NOMBRES_TIPO, TIPO_MAXIMO, precioMejora, precioRemonte } from './core/economia';
import { crearAzar } from './core/azar';
import { copiarBandas, type ColorPista } from './core/colores';
import type { Confluencia } from './core/confluencia';
import { idsIguales, idsTrasBorrar, reconstruirRed, sitioLibre, type LimitesMapa } from './core/editorMapa';
import { crearNodos, type DefinicionNodo, type Mapa } from './core/mapa';
import { tareasCalentamiento, type TareaCalentamiento } from './core/calentamiento';
import { claveProyecto, evaluarPista, type ColorElegible, type EvaluacionPista, type Proyecto } from './core/proyectos';
import { Red, type Estacion, type Motivo, type MotivoTrazado, type ReglasRed, type TipoNodo } from './core/red';
import { Simulacion, type ParametrosSimulacion } from './core/simulacion';
import { distancia, distanciaAPolilinea, type Punto } from './core/vector';

export interface Arrastre {
  origen: number;
  puntero: Punto;
  /** Se ha alejado del nodo de origen: ya no es un toque. */
  movido: boolean;
  /**
   * Nodo bajo el dedo (válido o no): si está más alto, un remonte; si está más
   * bajo, una pista. `motivo` dice si se podría construir y, si no, por qué.
   */
  objetivo: { nodo: number; tipo: 'remonte' | 'pista'; motivo: Motivo | MotivoTrazado; espera?: boolean } | null;
}

/** Lo que acaba de hacer el jugador (ver Juego.eventos). */
export type EventoJuego =
  | { tipo: 'remonte'; id: number }
  | { tipo: 'pista'; id: number }
  | { tipo: 'mejora'; id: number }
  | { tipo: 'deshacer' }
  /** Algo que no se puede hacer (se avisa con un texto corto). */
  | { tipo: 'aviso' };

export interface Selector {
  proyecto: Proyecto;
  /** Punto del mundo junto al que se coloca el selector. */
  punto: Punto;
  /** Cada color con su propio giro de salida (ver Red.coloresElegibles). */
  colores: ColorElegible[];
  /** El destino aún no tiene salida: la pista quedará en espera. */
  espera: boolean;
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

const TEXTO_MOTIVO: Partial<Record<Motivo | MotivoTrazado, string>> = {
  'destino-no-mas-alto': 'Los remontes solo suben: para una pista, arrastra hacia un punto más bajo.',
  'destino-base': 'Los remontes no terminan en un punto de inicio.',
  'origen-no-arranca': 'De una cima no arranca ningún remonte, y un punto gris solo sirve si le puede llegar una pista desde arriba.',
  'llegada-sin-bajada': 'Desde ese punto no se podría bajar a ningún sitio conectado: el remonte no llegaría a funcionar.',
  'ya-existe': 'Ya está construido.',
  'cruza-remonte': 'Los remontes no pueden cruzarse.',
  'origen-lleno': `De este punto ya salen todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
  'destino-lleno': `A este punto ya llegan todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
  // Pistas.
  'origen-inactivo': 'Las pistas salen de un punto al que llega o del que sale un remonte.',
  'pista-desde-base': 'De los puntos de la plaza no salen pistas.',
  'destino-no-viable': 'Ese punto no tiene salida: los esquiadores se quedarían atrapados. Ponle antes un remonte que funcione.',
  'demasiado-plana': 'Demasiado llano: ni una verde recta tendría pendiente suficiente.',
  'sin-color': 'No cabe ningún color: demasiado empinado incluso para una negra con todas las curvas posibles.',
  'destino-saturado': `A ese punto ya llegan ${CONFIG.pista.maxPistasLlegada} pistas.`,
  'pisa-roca': 'No cabe: pasaría por roca o por terreno más alto que su salida.',
  'pisa-plaza': 'No cabe: pasaría por la plaza.',
  'muy-cerca': 'No cabe: iría pegada a otra pista sin poder unirse a ella.',
  'cruza-pistas': 'No cabe: cruzaría demasiadas pistas.',
  'salida-ocupada': 'No cabe: no queda hueco para su salida (otras pistas salen muy cerca o sería cuesta arriba).',
};

export class Juego {
  // No son readonly: el editor del mapa de pruebas puede rehacerlos.
  alturas: MapaAlturas;
  red: Red;
  sim: Simulacion;
  /** Puntos del mapa (tipo y posición); las cotas salen del terreno. */
  definicion: DefinicionNodo[];
  /** Plaza del pie de pistas: entrada de esquiadores y obstáculo para las pistas. */
  readonly plaza: Mapa['datos']['plaza'];
  /** Carretera de acceso, del borde del mapa a la plaza (el último punto es la entrada). */
  readonly carretera: Punto[];
  /** Pendiente local a partir de la cual el terreno es roca (el panel de ajustes la cambia). */
  umbralRoca: number = CONFIG.terreno.umbralRoca;
  /** Límites del editor del mapa de pruebas. */
  private readonly limitesMapa: LimitesMapa;
  /** Editor del mapa de pruebas: herramienta activa, o null si está cerrado. */
  herramientaMapa: HerramientaMapa | null = null;
  arrastreNodo: ArrastreNodo | null = null;
  /** Aviso tras cambiar el mapa (para guardarlo, en el panel de ajustes). */
  alCambiarMapa: (() => void) | null = null;
  private readonly reglasRed: ReglasRed;
  /**
   * Parámetros de la simulación, compartidos por cada simulación nueva: el
   * panel de ajustes los cambia en memoria y se aplican al momento.
   */
  readonly parametrosSim: ParametrosSimulacion;
  arrastre: Arrastre | null = null;
  selector: Selector | null = null;
  mensaje: { texto: string; hasta: number } | null = null;
  /** Velocidad elegida (1× o 2×); el tiempo de juego va a `CONFIG.tiempo.escala` veces esto. */
  velocidad: number = CONFIG.tiempo.velocidades[0];
  /** Configuración de esta partida: la de config.ts con los parámetros del nivel encima. */
  readonly config: Config;
  /** Máximos alcanzados durante la partida (para los retos). */
  private maxRemontes = 0;
  private maxTelecabinas = 0;
  /** En pausa el tiempo no avanza, pero se puede construir. */
  pausado = false;
  /**
   * Obras recientes, para las animaciones y el sonido (quien dibuja vacía la
   * lista en cada fotograma; los de la simulación están en `sim.eventos`).
   */
  readonly eventos: EventoJuego[] = [];
  /** Mejora de un remonte pendiente de confirmar (pulsación larga sobre él). */
  mejora: { remonte: number; precio: number; punto: Punto } | null = null;
  /**
   * Modo de calibración (?ajustes en la dirección). Herramienta temporal: al
   * tocar una pista abierta muestra su color, sinuosidad y pendiente.
   */
  modoAjustes = false;
  /**
   * Medias móviles del bucle (las pone main.ts): fotogramas por segundo y
   * milisegundos de juego por fotograma (simulación, calentamiento y dibujo).
   * Para el panel de ajustes.
   */
  rendimiento = { fps: 0, ms: 0 };
  infoPista: { pista: number; punto: Punto } | null = null;

  constructor(
    readonly mapa: Mapa,
    /** Semilla del azar de la simulación (llegadas, niveles, elecciones). */
    private readonly semilla = 12345,
    /** Parámetros de balance propios del nivel: se mezclan sobre los de config.ts. */
    parametros: ParametrosNivel = {},
  ) {
    this.config = aplicarParametros(CONFIG, parametros);
    const { pista, remonte } = this.config;
    const { datos } = mapa;
    this.alturas = mapa.alturas;
    this.definicion = datos.nodos.map((d) => ({ ...d }));
    this.plaza = datos.plaza;
    this.carretera = trazarCarretera(datos.plaza, datos.ancho, datos.alto);
    this.limitesMapa = {
      ancho: datos.ancho,
      alto: datos.alto,
      separacion: 80,
      obstaculo: { ...datos.plaza, radio: datos.plaza.radio + 40 },
      prohibido: (p) => this.alturas.pendienteEn(p) > this.umbralRoca,
    };
    this.reglasRed = {
      desnivelMinimoRemonte: remonte.desnivelMinimo,
      maxPistasPorPareja: pista.maxPorPareja,
      // Copia modificable (bandas incluidas): el panel de ajustes la cambia en memoria.
      pista: { ...pista, bandas: copiarBandas(pista.bandas) },
      maxEstacionesPorNodo: this.config.estaciones.maxPorEmplazamiento,
      // La plaza del pie de pistas es un obstáculo para las pistas.
      obstaculos: [datos.plaza],
      // Para exigir que las pistas salgan cuesta abajo según el terreno.
      cotaTerreno: (p) => this.alturas.cotaEn(p),
      // Fuera del mapa cuenta como roca: ninguna pista se sale de él.
      esRoca: (p) => !this.alturas.dentro(p) || this.alturas.pendienteEn(p) > this.umbralRoca,
    };
    this.red = new Red(crearNodos(this.alturas, this.definicion), this.reglasRed);
    this.parametrosSim = {
      velocidadRemonte: remonte.velocidad,
      intervaloBolitas: remonte.intervaloBolitas,
      capacidadBolita: remonte.capacidad,
      capacidadPorTipo: [...remonte.capacidadPorTipo],
      factorVelocidadPorTipo: [...remonte.factorVelocidadPorTipo],
      pago: { tarifas: [...this.config.economia.tarifas], multiplicadorVariedad: this.config.economia.multiplicadorVariedad, factorSinDiversion: this.config.economia.factorSinDiversion },
      mantenimiento: { porMetroYMinuto: this.config.economia.mantenimiento.porMetroYMinuto, fijoPorMinuto: this.config.economia.mantenimiento.fijoPorMinuto, factorPorTipo: [...this.config.economia.mantenimiento.factorPorTipo] },
      ...this.config.esquiador,
      // Con la curva de afluencia, estos dos no se usan (la curva manda).
      llegadasPorMinuto: this.config.afluencia.tasaInicial,
      mezclaNiveles: [...this.config.afluencia.mezcla[0].pesos],
      afluencia: {
        ...this.config.afluencia,
        mezcla: this.config.afluencia.mezcla.map((m) => ({ minuto: m.minuto, pesos: [...m.pesos] })),
      },
      velocidadCarretera: this.config.afluencia.velocidadCarretera,
      medidor: { capacidad: this.config.quejas.capacidad, vaciadoPorMinuto: this.config.quejas.vaciadoPorMinuto, gracia: this.config.quejas.gracia },
      aforoCola: this.config.colas.aforo,
      tiempoAnillo: this.config.colas.tiempoAnillo,
    };
    this.sim = this.nuevaSimulacion();
  }

  private nuevaSimulacion(): Simulacion {
    const entrada = this.carretera[this.carretera.length - 1];
    const sim = new Simulacion(this.red, this.parametrosSim, entrada, crearAzar(this.semilla), this.carretera);
    sim.monedas = this.config.economia.monedasIniciales;
    return sim;
  }

  // ---- Economía ----

  /** Monedas disponibles (las lleva la simulación, que cobra las bajadas). */
  get monedas(): number {
    return this.sim.monedas;
  }

  /** Precio de un remonte nuevo (telesquí) entre dos puntos. */
  precioRemonteEntre(desde: number, hasta: number): number {
    return precioRemonte(distancia(this.red.nodo(desde), this.red.nodo(hasta)), 0, this.config.economia);
  }

  /** Precio del remonte que se soltaría ahora, si el arrastre apunta a uno válido. */
  precioArrastre(): { precio: number; alcanza: boolean } | null {
    const o = this.arrastre?.objetivo;
    if (!this.arrastre || !o || o.tipo !== 'remonte' || o.motivo !== 'ok') return null;
    const precio = this.precioRemonteEntre(this.arrastre.origen, o.nodo);
    return { precio, alcanza: precio <= this.monedas };
  }

  // ---- Acciones del jugador (las usan la interfaz y los jugadores automáticos) ----

  /**
   * Construye un telesquí de `desde` a `hasta` si las reglas lo permiten y
   * llegan las monedas (las cobra). Devuelve 'ok', el motivo de la red o
   * 'sin-monedas'.
   */
  construirRemonte(desde: number, hasta: number): Motivo | 'sin-monedas' {
    const motivo = this.red.puedeConstruirRemonte(desde, hasta);
    if (motivo !== 'ok') return motivo;
    const precio = this.precioRemonteEntre(desde, hasta);
    if (precio > this.monedas) return 'sin-monedas';
    const r = this.red.construirRemonte(desde, hasta);
    this.sim.monedas -= precio;
    this.ultimaObra = hasta;
    this.emitir({ tipo: 'remonte', id: r.id });
    return 'ok';
  }

  /**
   * Abre la pista de `desde` a `hasta` con ese color, por el lado y con el
   * giro que da su evaluación (como el selector). false si no cabe.
   */
  abrirPista(desde: number, hasta: number, color: ColorPista): boolean {
    const e = this.evaluarPista(desde, hasta);
    if (e.motivo !== 'ok') return false;
    const c = e.colores.find((x) => x.color === color);
    if (!c?.factible) return false;
    const { lado } = e.proyecto;
    if (this.red.puedeAbrirPista(desde, hasta, color, lado, c.giro) !== 'ok') return false;
    if (!this.red.coloresLimpios(desde, hasta, lado, c.giro).find((x) => x.color === color)?.factible) return false;
    const p = this.red.abrirPista(desde, hasta, color, lado, c.giro);
    this.ultimaObra = hasta;
    this.emitir({ tipo: 'pista', id: p.id });
    return true;
  }

  /** Precio de mejorar un remonte al tipo siguiente, o null si ya es del máximo. */
  precioMejoraDe(id: number): number | null {
    const r = this.red.remontes[id];
    return r && r.tipo < TIPO_MAXIMO ? precioMejora(r.longitud, r.tipo, this.config.economia) : null;
  }

  /** Mejora un remonte al tipo siguiente cobrando la diferencia. */
  mejorarRemonte(id: number): 'ok' | 'maximo' | 'sin-monedas' {
    const precio = this.precioMejoraDe(id);
    if (precio === null) return 'maximo';
    if (precio > this.monedas) return 'sin-monedas';
    this.red.mejorarRemonte(id, TIPO_MAXIMO);
    this.sim.monedas -= precio;
    this.emitir({ tipo: 'mejora', id });
    return 'ok';
  }

  /** Remonte cuyo cable pasa a menos de `tolerancia` (m) del punto, el más cercano. */
  remonteEn(p: Punto, tolerancia: number): number | null {
    let mejor: number | null = null;
    let min = tolerancia;
    for (const r of this.red.remontes) {
      const d = distanciaAPolilinea(p, [this.red.nodo(r.desde), this.red.nodo(r.hasta)]);
      if (d <= min) [mejor, min] = [r.id, d];
    }
    return mejor;
  }

  /**
   * Pulsación larga: si es sobre un remonte, pregunta si se quiere mejorar.
   * Si el dedo había empezado un arrastre desde un punto sin moverse, vale
   * solo si está más cerca del cable que del punto (y el arrastre se anula).
   */
  pulsacionLarga(p: Punto, tolerancia: number): boolean {
    const id = this.remonteEn(p, tolerancia);
    if (id === null) return false;
    const r = this.red.remontes[id];
    if (this.arrastre) {
      if (this.arrastre.movido) return false;
      const cable = distanciaAPolilinea(p, [this.red.nodo(r.desde), this.red.nodo(r.hasta)]);
      if (distancia(p, this.red.nodo(this.arrastre.origen)) < cable) return false;
      this.arrastre = null;
    }
    if (r.tipo >= TIPO_MAXIMO) {
      this.avisar(`Ya es una ${NOMBRES_TIPO[r.tipo]}: no se puede mejorar más.`);
      return true;
    }
    this.selector = null;
    this.mejora = { remonte: id, precio: precioMejora(r.longitud, r.tipo, this.config.economia), punto: p };
    return true;
  }

  /** Texto de la pregunta de mejora. */
  textoMejora(): string {
    if (!this.mejora) return '';
    const r = this.red.remontes[this.mejora.remonte];
    return `¿Mejorar el ${NOMBRES_TIPO[r.tipo]} a ${NOMBRES_TIPO[r.tipo + 1]} por ${this.mejora.precio} monedas?`;
  }

  confirmarMejora(): void {
    const m = this.mejora;
    this.mejora = null;
    if (!m) return;
    if (this.mejorarRemonte(m.remonte) === 'sin-monedas') this.avisar(`Faltan ${Math.ceil(m.precio - this.monedas)} monedas.`);
  }

  cancelarMejora(): void {
    this.mejora = null;
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
    this.cacheTrazados = null;
    this.cacheEvaluaciones = null;
    this.selector = null;
    this.infoPista = null;
    this.arrastre = null;
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
      if (!sitioLibre(this.definicion, p, this.limitesMapa)) {
        this.avisar('Ahí no: fuera del mapa, en la plaza, en roca o pegado a otro punto.');
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
    const n = this.red.remontes.length;
    if (n > this.maxRemontes) this.maxRemontes = n;
    let cabinas = 0;
    for (const r of this.red.remontes) if (r.tipo >= TIPO_MAXIMO) cabinas++;
    if (cabinas > this.maxTelecabinas) this.maxTelecabinas = cabinas;
  }

  /** Lo ocurrido en la partida hasta ahora, para los retos y el récord. */
  resumen(): ResumenPartida {
    return {
      dias: this.diasSobrevividos,
      satisfechos: this.sim.cansados,
      enfadados: this.sim.enfadados,
      bajadasNegros: this.sim.bajadasPorNivel[3],
      maxRemontes: Math.max(this.maxRemontes, this.red.remontes.length),
      maxTelecabinas: Math.max(this.maxTelecabinas, this.red.remontes.filter((r) => r.tipo >= TIPO_MAXIMO).length),
      pistasForzadas: this.red.pistas.filter((p) => this.red.forzada(p)).length,
    };
  }

  /** Se ha llenado el medidor de quejas. */
  get terminada(): boolean {
    return this.sim.terminada;
  }


  cambiarVelocidad(): void {
    const v: readonly number[] = this.config.tiempo.velocidades;
    this.velocidad = v[(v.indexOf(this.velocidad) + 1) % v.length];
  }

  private avisar(texto: string): void {
    this.mensaje = { texto, hasta: performance.now() + 2500 };
    this.emitir({ tipo: 'aviso' });
  }

  private emitir(e: EventoJuego): void {
    this.eventos.push(e);
    if (this.eventos.length > 100) this.eventos.splice(0, 50);
  }

  alternarPausa(): void {
    this.pausado = !this.pausado;
  }

  /** Día de la temporada (1, 2…) según el tiempo con la estación abierta. */
  get dia(): number {
    return Math.floor(this.sim.tiempoAbierta / this.config.dia.duracion) + 1;
  }

  /** Días completos sobrevividos, con decimales (puntuación). */
  get diasSobrevividos(): number {
    return this.sim.tiempoAbierta / this.config.dia.duracion;
  }

  /** Momento del día, de 0 (amanecer) a 1 (fin de la noche). */
  get horaDelDia(): number {
    return (this.sim.tiempoAbierta / this.config.dia.duracion) % 1;
  }

  // ---- Calentamiento de cachés en segundo plano ----

  /** Punto de la última obra: el calentamiento empieza por lo más cercano a él. */
  private ultimaObra: number | null = null;
  private calentamiento: { version: number; tareas: TareaCalentamiento[]; siguiente: number; enCurso: Generator<void, boolean> | null } | null = null;

  /** ¿Ha terminado el calentamiento para la versión actual de la red? */
  get calentado(): boolean {
    const c = this.calentamiento;
    return c !== null && c.version === this.red.version && c.siguiente >= c.tareas.length;
  }

  /**
   * Calcula de antemano, durante unos `ms` milisegundos, lo que pedirá el
   * próximo arrastre: la bajada desde cada punto, qué puntos grises pueden
   * arrancar y las pistas desde los puntos activos hacia los más cercanos
   * (ver tareasCalentamiento). Usa las mismas funciones y cachés que el
   * arrastre, así que no cambia ningún resultado. Si la red cambia, empieza
   * de nuevo. El tiempo se comprueba entre tareas: una tarea larga puede
   * pasarse del presupuesto. Si el dedo llega antes a un punto sin calcular,
   * se calcula en el momento, como siempre.
   */
  calentar(ms: number = this.config.calentamiento.msPorFotograma): void {
    const inicio = performance.now();
    if (this.calentamiento?.version !== this.red.version) {
      const obra = this.ultimaObra !== null && this.red.nodos[this.ultimaObra] ? this.red.nodo(this.ultimaObra) : this.plaza;
      this.calentamiento = { version: this.red.version, tareas: tareasCalentamiento(this.red, obra, this.config.calentamiento.destinosPorOrigen), siguiente: 0, enCurso: null };
    }
    const c = this.calentamiento;
    // Las tareas de bajada y de arranque prueban muchos candidatos: van por
    // pasos (un candidato cada vez) para no bloquear un fotograma entero.
    while ((c.enCurso || c.siguiente < c.tareas.length) && performance.now() - inicio < ms) {
      if (c.enCurso) {
        if (c.enCurso.next().done) c.enCurso = null;
        continue;
      }
      const t = c.tareas[c.siguiente++];
      if (t.tipo === 'bajada') c.enCurso = this.red.pasosLlegadaConBajada(t.nodo);
      else if (t.tipo === 'arranque') c.enCurso = this.red.pasosPuedeArrancar(t.nodo);
      else this.evaluarPista(t.desde, t.hasta);
    }
  }

  // ---- Pistas: el jugador elige inicio y destino ----

  private cacheEvaluaciones: { version: number; mapa: Map<string, EvaluacionPista> } | null = null;

  /** Evaluación de una pista de `desde` a `hasta` (ver evaluarPista), guardada hasta que cambia la red. */
  evaluarPista(desde: number, hasta: number): EvaluacionPista {
    if (this.cacheEvaluaciones?.version !== this.red.version) this.cacheEvaluaciones = { version: this.red.version, mapa: new Map() };
    const k = `${desde}>${hasta}`;
    let e = this.cacheEvaluaciones.mapa.get(k);
    if (!e) {
      e = evaluarPista(this.red, desde, hasta);
      this.cacheEvaluaciones.mapa.set(k, e);
    }
    return e;
  }

  private cacheTrazados: { version: number; mapa: Map<string, Confluencia> } | null = null;

  /** Trazado previsto de una pista por abrir (vista previa con el selector abierto). */
  trazadoProyecto(p: Proyecto): Confluencia {
    if (this.cacheTrazados?.version !== this.red.version) this.cacheTrazados = { version: this.red.version, mapa: new Map() };
    const k = claveProyecto(p);
    let t = this.cacheTrazados.mapa.get(k);
    if (!t) {
      t = this.red.trazadoPrevisto(p.desde, p.hasta, p.lado, p.giro);
      this.cacheTrazados.mapa.set(k, t);
    }
    return t;
  }

  /** Abre el selector de color para la pista `desde`→`hasta`, o avisa de por qué no cabe. */
  proponerPista(desde: number, hasta: number): void {
    const e = this.evaluarPista(desde, hasta);
    if (e.motivo !== 'ok') {
      this.avisar(TEXTO_MOTIVO[e.motivo] ?? 'Esa pista no se puede abrir.');
      return;
    }
    // El selector se coloca a media pista: así no tapa ni el inicio ni el destino.
    const t = this.trazadoProyecto(e.proyecto).trazado;
    this.selector = { proyecto: e.proyecto, punto: t.puntoEn(t.longitud / 2), colores: e.colores, espera: e.espera };
  }

  /** Toque fuera de los nodos (cierra lo abierto; en ajustes, informa de la pista tocada). */
  tocar(p: Punto, toleranciaMundo: number): void {
    this.infoPista = null;
    if (!this.modoAjustes) return;
    let cerca: number | null = null;
    let d = toleranciaMundo;
    for (const pi of this.red.pistas) {
      const di = distanciaAPolilinea(p, pi.trazado.puntos);
      if (di < d) {
        d = di;
        cerca = pi.id;
      }
    }
    if (cerca !== null) this.infoPista = { pista: cerca, punto: p };
  }

  elegirColor(color: ColorPista): void {
    const s = this.selector;
    this.selector = null;
    if (!s) return;
    const { desde, hasta, lado } = s.proyecto;
    // Cada color sale con su propio giro, el que le hizo limpio en el selector.
    const giro = s.colores.find((c) => c.color === color)?.giro;
    const motivo = this.red.puedeAbrirPista(desde, hasta, color, lado, giro);
    const limpio = this.red.coloresLimpios(desde, hasta, lado, giro).find((c) => c.color === color)?.factible;
    if (motivo !== 'ok' || !limpio) {
      this.avisar('Esa pista ya no se puede abrir.');
      return;
    }
    const p = this.red.abrirPista(desde, hasta, color, lado, giro);
    this.ultimaObra = hasta;
    this.emitir({ tipo: 'pista', id: p.id });
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

  /**
   * Nodo más cerca del punto que el radio dado, contando cada una de sus
   * estaciones o, si aún no tiene (círculo gris), su centro.
   */
  nodoEn(p: Punto, radioMundo: number, sepMundo = 0): number | null {
    let mejor: number | null = null;
    let dMin = radioMundo;
    const probar = (nodo: number, q: Punto) => {
      const d = distancia(p, q);
      if (d <= dMin) {
        dMin = d;
        mejor = nodo;
      }
    };
    for (const e of this.red.estaciones) probar(e.nodo, this.posicionEstacion(e, sepMundo));
    for (const n of this.red.nodos) if (this.red.estacionesDe(n.id).length === 0) probar(n.id, n);
    return mejor;
  }

  /**
   * Empieza un arrastre en un punto donde puede arrancar un remonte o del que
   * puede salir una pista. Si se arrastra a uno no válido, se marca y, al
   * soltar, se explica por qué.
   */
  empezarArrastre(p: Punto, radioMundo: number, sepMundo = 0): boolean {
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (n === null || !(this.red.activo(n) || this.red.puedeArrancar(n))) return false;
    this.arrastre = { origen: n, puntero: p, movido: false, objetivo: null };
    return true;
  }

  moverArrastre(p: Punto, radioMundo: number, sepMundo = 0): void {
    if (this.arrastreNodo) {
      this.arrastreNodo.punto = p;
      this.arrastreNodo.valido = sitioLibre(this.definicion, p, this.limitesMapa, this.arrastreNodo.id);
      return;
    }
    const a = this.arrastre;
    if (!a) return;
    a.puntero = p;
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (n !== a.origen) a.movido = true;
    if (n === null || n === a.origen) {
      a.objetivo = null;
      return;
    }
    // Más alto: remonte. Más bajo: pista.
    const subir = this.red.nodo(n).cota > this.red.nodo(a.origen).cota;
    a.objetivo = subir
      ? { nodo: n, tipo: 'remonte', motivo: this.evaluar(a.origen, n) }
      : (() => {
          const e = this.evaluarPista(a.origen, n);
          return { nodo: n, tipo: 'pista' as const, motivo: e.motivo, espera: e.motivo === 'ok' && e.espera };
        })();
  }

  /**
   * Al soltar sobre otro punto: construye el remonte (si sube) o abre el
   * selector de color de la pista (si baja); si no se puede, avisa de por
   * qué. Sin moverse, es un toque: recuerda cómo se usa.
   */
  soltarArrastre(): void {
    if (this.arrastreNodo) return this.soltarNodo();
    const a = this.arrastre;
    this.arrastre = null;
    if (!a) return;
    if (!a.movido) {
      this.avisar('Arrastra hacia un punto más alto para un remonte, o hacia uno más bajo para una pista.');
      return;
    }
    const o = a.objetivo;
    if (!o) return;
    if (o.tipo === 'pista') {
      this.proponerPista(a.origen, o.nodo);
      return;
    }
    if (o.motivo !== 'ok') {
      const texto = TEXTO_MOTIVO[o.motivo];
      if (texto) this.avisar(texto);
      return;
    }
    const precio = this.precioRemonteEntre(a.origen, o.nodo);
    if (this.construirRemonte(a.origen, o.nodo) === 'sin-monedas') {
      this.avisar(`Faltan ${Math.ceil(precio - this.monedas)} monedas para este remonte (${precio}).`);
      return;
    }
    if (this.red.remontes.length === 1) this.avisar('Mantén pulsado un remonte para mejorarlo a telesilla o telecabina.');
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
    this.mejora = null;
    const h = this.red.deshacer();
    if (!h) return;
    this.emitir({ tipo: 'deshacer' });
    this.sim.alDeshacer(h);
    // Deshacer un remonte devuelve todo lo pagado por él (con sus mejoras).
    if (h.tipo === 'remonte') this.sim.monedas += precioRemonte(h.remonte.longitud, h.remonte.tipo, this.config.economia);
  }

}
