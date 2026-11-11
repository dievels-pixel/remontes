// Estado de la partida y reglas del gesto de arrastre. Une la lógica pura
// (red y simulación) con la entrada; no dibuja.
import { CONFIG } from './config';
import { generarMapaAlturas, type MapaAlturas } from './core/alturas';
import { crearAzar } from './core/azar';
import { crearNodos, PLAZA } from './core/mapa';
import { Red, type Motivo } from './core/red';
import { Simulacion } from './core/simulacion';
import { distancia, type Punto } from './core/vector';

export type Construccion = 'remonte' | 'pista';

export interface Arrastre {
  origen: number;
  puntero: Punto;
  /** Nodo bajo el dedo (válido o no) y qué se construiría. */
  objetivo: { nodo: number; tipo: Construccion; motivo: Motivo } | null;
}

const TEXTO_MOTIVO: Partial<Record<Motivo, string>> = {
  'destino-no-mas-alto': 'Los remontes solo suben.',
  'destino-base': 'Los remontes no terminan en un punto de inicio.',
  'ya-existe': 'Ya está construido.',
  'origen-ocupado': 'De este punto ya sale un remonte.',
  'destino-ocupado': 'A este punto ya llega un remonte.',
  'pista-desde-base': 'Desde un punto de inicio solo salen remontes.',
  'destino-no-viable': 'Ese punto aún no tiene salida: los esquiadores quedarían atrapados.',
};

export class Juego {
  readonly alturas: MapaAlturas;
  readonly red: Red;
  readonly sim: Simulacion;
  arrastre: Arrastre | null = null;
  mensaje: { texto: string; hasta: number } | null = null;

  constructor() {
    const { mundo, alturas, remonte, pista, esquiador } = CONFIG;
    this.alturas = generarMapaAlturas(alturas, mundo.ancho, mundo.alto);
    this.red = new Red(crearNodos(this.alturas), {
      desnivelMinimoRemonte: remonte.desnivelMinimo,
      maxPistasPorPareja: pista.maxPorPareja,
      curva: pista,
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

  /** Qué se construiría arrastrando de `origen` a `destino`. */
  evaluar(origen: number, destino: number): { tipo: Construccion; motivo: Motivo } {
    const a = this.red.nodo(origen);
    const b = this.red.nodo(destino);
    if (b.cota > a.cota) return { tipo: 'remonte', motivo: this.red.puedeConstruirRemonte(origen, destino) };
    return { tipo: 'pista', motivo: this.red.puedeAbrirPista(origen, destino) };
  }

  /** Nodo más cercano a un punto del mundo dentro del radio dado. */
  nodoEn(p: Punto, radioMundo: number): number | null {
    let mejor: number | null = null;
    let dMin = radioMundo;
    for (const n of this.red.nodos) {
      const d = distancia(p, n);
      if (d <= dMin) {
        dMin = d;
        mejor = n.id;
      }
    }
    return mejor;
  }

  empezarArrastre(p: Punto, radioMundo: number): boolean {
    const n = this.nodoEn(p, radioMundo);
    if (n === null || !this.red.activo(n)) return false;
    this.arrastre = { origen: n, puntero: p, objetivo: null };
    return true;
  }

  moverArrastre(p: Punto, radioMundo: number): void {
    if (!this.arrastre) return;
    this.arrastre.puntero = p;
    const n = this.nodoEn(p, radioMundo);
    this.arrastre.objetivo = n === null || n === this.arrastre.origen ? null : { nodo: n, ...this.evaluar(this.arrastre.origen, n) };
  }

  soltarArrastre(): void {
    const a = this.arrastre;
    this.arrastre = null;
    if (!a?.objetivo) return;
    const { nodo, tipo, motivo } = a.objetivo;
    if (motivo !== 'ok') {
      const texto = TEXTO_MOTIVO[motivo];
      if (texto) this.mensaje = { texto, hasta: performance.now() + 2500 };
      return;
    }
    if (tipo === 'remonte') this.red.construirRemonte(a.origen, nodo);
    else this.red.abrirPista(a.origen, nodo);
  }

  cancelarArrastre(): void {
    this.arrastre = null;
  }

  /** Indicación para el jugador según el estado de la red. */
  ayuda(): string {
    if (this.red.remontes.length === 0) return 'Arrastra desde un punto de inicio hasta un punto más alto para construir un remonte.';
    const parado = this.red.remontes.find((r) => !this.red.enServicio(r));
    if (parado) return 'El remonte gris no funciona: arrastra desde su llegada hacia un punto más bajo para abrir una pista.';
    return `Esquiadores: ${this.sim.poblacion} · Bajadas: ${this.sim.bajadasCompletadas}`;
  }
}
