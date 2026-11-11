// Estado de la partida y reglas de los gestos. Une la lógica pura (red,
// proyectos y simulación) con la entrada; no dibuja.
import { CONFIG } from './config';
import { generarMapaAlturas, type MapaAlturas } from './core/alturas';
import { crearAzar } from './core/azar';
import type { ColorPista, Factibilidad } from './core/colores';
import { trazarPista } from './core/curva';
import { crearNodos, PLAZA } from './core/mapa';
import type { Polilinea } from './core/polilinea';
import { claveProyecto, proyectosDeRemonte, proyectosDesde, type Proyecto } from './core/proyectos';
import { Red, type Estacion, type Motivo } from './core/red';
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

const TEXTO_MOTIVO: Partial<Record<Motivo, string>> = {
  'destino-no-mas-alto': 'Los remontes solo suben. Las pistas se abren tocando los trazos discontinuos.',
  'destino-base': 'Los remontes no terminan en un punto de inicio.',
  'ya-existe': 'Ya está construido.',
  'cruza-remonte': 'Los remontes no pueden cruzarse.',
  'origen-lleno': `De este punto ya salen todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
  'destino-lleno': `A este punto ya llegan todos los remontes posibles (${CONFIG.estaciones.maxPorEmplazamiento} estaciones).`,
};

export class Juego {
  readonly alturas: MapaAlturas;
  readonly red: Red;
  readonly sim: Simulacion;
  arrastre: Arrastre | null = null;
  foco: Foco = null;
  selector: Selector | null = null;
  mensaje: { texto: string; hasta: number } | null = null;
  /** Multiplicador de tiempo: 1×, 2× o 4×. */
  velocidad: 1 | 2 | 4 = 1;

  constructor() {
    const { mundo, alturas, remonte, pista, esquiador } = CONFIG;
    this.alturas = generarMapaAlturas(alturas, mundo.ancho, mundo.alto);
    this.red = new Red(crearNodos(this.alturas), {
      desnivelMinimoRemonte: remonte.desnivelMinimo,
      maxPistasPorPareja: pista.maxPorPareja,
      pista,
      maxEstacionesPorNodo: CONFIG.estaciones.maxPorEmplazamiento,
    });
    this.sim = new Simulacion(
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

  /** Trazado a trazos de un proyecto: la curva con su sinuosidad mínima. */
  trazadoProyecto(p: Proyecto): Polilinea {
    return trazarPista(this.red.nodo(p.desde), this.red.nodo(p.hasta), this.red.forma(p.desde, p.hasta, p.lado), 0);
  }

  /** Toque fuera de los nodos: abre el selector si cae sobre un proyecto. */
  tocar(p: Punto, toleranciaMundo: number): void {
    let mejor: Proyecto | null = null;
    let dMin = toleranciaMundo;
    for (const pr of this.proyectosVisibles()) {
      const d = distanciaAPolilinea(p, this.trazadoProyecto(pr).puntos);
      if (d < dMin) {
        dMin = d;
        mejor = pr;
      }
    }
    if (mejor) {
      this.selector = { proyecto: mejor, punto: p, colores: this.red.colores(mejor.desde, mejor.hasta, mejor.lado) };
    } else {
      this.foco = null;
    }
  }

  elegirColor(color: ColorPista): void {
    const s = this.selector;
    this.selector = null;
    if (!s) return;
    const { desde, hasta, lado } = s.proyecto;
    const motivo = this.red.puedeAbrirPista(desde, hasta, color, lado);
    if (motivo !== 'ok') {
      this.avisar('Esa pista ya no se puede abrir.');
      return;
    }
    this.red.abrirPista(desde, hasta, color, lado);
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
    const a = this.arrastre;
    if (!a) return;
    a.puntero = p;
    const n = this.nodoEn(p, radioMundo, sepMundo);
    if (n !== a.origen) a.movido = true;
    a.objetivo = n === null || n === a.origen ? null : { nodo: n, motivo: this.evaluar(a.origen, n) };
  }

  /** Al soltar: construye el remonte o, si no se movió, es un toque al nodo. */
  soltarArrastre(): void {
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
  }

  /** Deshace la última construcción (remonte o pista). */
  deshacer(): void {
    this.arrastre = null;
    this.selector = null;
    const h = this.red.deshacer();
    if (h) this.sim.alDeshacer(h);
    if (this.foco?.tipo === 'remonte' && !this.red.remontes[this.foco.id]) this.foco = null;
  }

  /** Indicación para el jugador según el estado de la red. */
  ayuda(): string {
    if (this.red.remontes.length === 0) return 'Arrastra desde un punto de inicio hasta un punto más alto para construir un remonte.';
    if (this.selector) return 'Elige el color de la pista. Los colores apagados no caben con esa pendiente.';
    const parado = this.red.remontes.find((r) => !this.red.enServicio(r));
    if (parado) return 'El remonte gris necesita una bajada: toca un trazo discontinuo y elige color.';
    return `Esquiadores: ${this.sim.poblacion} · Bajadas: ${this.sim.bajadasCompletadas}`;
  }
}
