// Animaciones de respuesta: nada aparece ni desaparece de golpe. Todo va en
// tiempo real (no de juego), para que también se mueva en pausa. Este módulo
// solo lleva la cuenta de «cuándo nació cada cosa» y de valores que se
// acercan suavemente a su objetivo; quien dibuja pregunta el progreso.
import type { Juego } from '../juego';

export const limitar01 = (t: number): number => Math.min(1, Math.max(0, t));
/** Frena al llegar. */
export const frenar = (t: number): number => 1 - Math.pow(1 - limitar01(t), 3);
/** Acelera y frena. */
export const suavizar = (t: number): number => {
  const x = limitar01(t);
  return x * x * (3 - 2 * x);
};
/** Frena pasándose un poco (rebote suave). */
export const rebotar = (t: number): number => {
  const x = limitar01(t) - 1;
  const k = 1.7;
  return 1 + (k + 1) * x * x * x + k * x * x;
};

/** Monedas que suben desde un punto al cobrar varias bajadas seguidas. */
export interface CobroFlotante {
  nodo: number;
  cantidad: number;
  inicio: number;
}

/** Esquiador que se acaba de ir (satisfecho o enfadado), para despedirlo. */
export interface Salida {
  nodo: number;
  nivel: number;
  enfadado: boolean;
  inicio: number;
  /** Desplazamiento fijo para que varias salidas seguidas no se tapen. */
  fase: number;
}

export const DURACION = {
  remonte: 0.45,
  pista: 0.7,
  estacion: 0.35,
  mejora: 0.9,
  cobro: 1.1,
  salida: 0.7,
  panel: 0.18,
  boton: 0.18,
  activacion: 0.8,
};

export class Efectos {
  /** Segundos reales desde que empezó la pantalla. */
  ahora = 0;
  readonly cobros: CobroFlotante[] = [];
  readonly salidas: Salida[] = [];
  /** Monedas que se muestran: persiguen a las reales para que el número ruede. */
  monedasMostradas = 0;
  private readonly nacimientos = new Map<string, number>();
  private readonly mezclas = new Map<string, number>();
  private remontes = 0;
  private pistas = 0;
  private estaciones = 0;
  private activas = new Set<number>();
  private enServicio = new Set<number>();
  private contador = 0;

  /** Marca el nacimiento de algo (si ya había nacido, vuelve a empezar). */
  nacer(clave: string): void {
    this.nacimientos.set(clave, this.ahora);
  }

  /** Segundos desde que nació, o infinito si nunca se marcó. */
  edad(clave: string): number {
    const t = this.nacimientos.get(clave);
    return t === undefined ? Infinity : this.ahora - t;
  }

  /** Progreso de 0 a 1 de una animación de `duracion` segundos (1 si no hay ninguna en marcha). */
  progreso(clave: string, duracion: number): number {
    return limitar01(this.edad(clave) / duracion);
  }

  /**
   * Valor que se acerca a 1 mientras `objetivo` es verdadero y a 0 cuando no,
   * en `duracion` segundos: para lo que entra y sale (paneles, marcas).
   */
  mezcla(clave: string, objetivo: boolean, dt: number, duracion = DURACION.panel): number {
    const v = this.mezclas.get(clave) ?? 0;
    const paso = duracion > 0 ? dt / duracion : 1;
    const n = objetivo ? Math.min(1, v + paso) : Math.max(0, v - paso);
    this.mezclas.set(clave, n);
    return n;
  }

  /** Último valor de una mezcla, sin moverla. */
  valor(clave: string): number {
    return this.mezclas.get(clave) ?? 0;
  }

  /**
   * Pone al día las animaciones con el estado del juego: lo construido desde
   * el último fotograma nace ahora; los eventos de la simulación dejan cobros
   * y despedidas. `sinAnimar`: da por viejo todo lo que ya hay (al entrar).
   */
  sincronizar(juego: Juego, dt: number, sinAnimar = false): void {
    this.ahora += dt;
    const { red, sim } = juego;
    // Lo deshecho deja de existir; lo nuevo nace.
    for (const [tipo, antes, ahora] of [
      ['remonte', this.remontes, red.remontes.length],
      ['pista', this.pistas, red.pistas.length],
      ['estacion', this.estaciones, red.estaciones.length],
    ] as const) {
      for (let i = ahora; i < antes; i++) this.nacimientos.delete(`${tipo}:${i}`);
      if (!sinAnimar) for (let i = antes; i < ahora; i++) this.nacer(`${tipo}:${i}`);
    }
    this.remontes = red.remontes.length;
    this.pistas = red.pistas.length;
    this.estaciones = red.estaciones.length;
    // Pistas que pasan de espera a activas y remontes que entran en servicio.
    const activas = red.pistasActivas();
    if (!sinAnimar) for (const id of activas) if (!this.activas.has(id) && this.edad(`pista:${id}`) > DURACION.pista) this.nacer(`activa:${id}`);
    this.activas = new Set(activas);
    const servicio = new Set(red.remontes.filter((r) => red.enServicio(r)).map((r) => r.id));
    if (!sinAnimar) for (const id of servicio) if (!this.enServicio.has(id)) this.nacer(`servicio:${id}`);
    this.enServicio = servicio;

    for (const e of juego.eventos) if (e.tipo === 'mejora') this.nacer(`mejora:${e.id}`);
    for (const e of sim.eventos) {
      if (e.tipo === 'cobro') {
        // Varias bajadas seguidas en el mismo punto suman en un solo número.
        const previo = this.cobros.find((c) => c.nodo === e.nodo && this.ahora - c.inicio < 0.5);
        if (previo) previo.cantidad += e.cantidad;
        else this.cobros.push({ nodo: e.nodo, cantidad: e.cantidad, inicio: this.ahora });
      } else if (e.tipo === 'cansado' || e.tipo === 'enfadado') {
        this.salidas.push({ nodo: e.nodo, nivel: e.nivel, enfadado: e.tipo === 'enfadado', inicio: this.ahora, fase: this.contador++ });
      } else if (e.tipo === 'anillo') {
        this.nacer(`anillo:${e.remonte}`);
      }
    }
    while (this.cobros.length > 0 && this.ahora - this.cobros[0].inicio > DURACION.cobro) this.cobros.shift();
    while (this.salidas.length > 0 && this.ahora - this.salidas[0].inicio > DURACION.salida) this.salidas.shift();
    if (this.salidas.length > 80) this.salidas.splice(0, this.salidas.length - 80);

    // El número de monedas rueda hacia el real (rápido si la diferencia es grande).
    const real = sim.monedas;
    if (sinAnimar) this.monedasMostradas = real;
    else this.monedasMostradas += (real - this.monedasMostradas) * Math.min(1, dt * 8);
    if (Math.abs(real - this.monedasMostradas) < 0.5) this.monedasMostradas = real;
  }
}

/** Tinte del ciclo de día: color y opacidad según la hora (0 amanecer … 1 fin de la noche). */
export function tinteDia(hora: number): { r: number; g: number; b: number; a: number } {
  // Amanecer cálido, día sin tinte, atardecer anaranjado y noche azulada.
  const claves: [number, number, number, number, number][] = [
    [0, 255, 196, 150, 0.16],
    [0.1, 255, 220, 190, 0],
    [0.58, 255, 200, 150, 0],
    [0.72, 240, 150, 95, 0.2],
    [0.82, 40, 55, 110, 0.3],
    [0.94, 40, 55, 110, 0.3],
    [1, 255, 196, 150, 0.16],
  ];
  const h = ((hora % 1) + 1) % 1;
  for (let i = 1; i < claves.length; i++) {
    if (h <= claves[i][0]) {
      const a = claves[i - 1];
      const b = claves[i];
      const t = suavizar((h - a[0]) / (b[0] - a[0]));
      const m = (k: number) => a[k] + (b[k] - a[k]) * t;
      return { r: Math.round(m(1)), g: Math.round(m(2)), b: Math.round(m(3)), a: m(4) };
    }
  }
  return { r: 255, g: 196, b: 150, a: 0.16 };
}
