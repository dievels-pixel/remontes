// Música generativa con Web Audio, como en Mini Metro: cada evento del juego
// dispara una nota de una escala pentatónica, así todo suena a la vez sin
// chocar. El tono depende de la cota del punto (más agudo cuanto más alto).
// Timbre suave de marimba y un ambiente discreto de fondo.
//
// El contexto de audio solo puede arrancar tras un gesto del usuario: se crea
// en la primera llamada a `despertar()`.

import type { Sonido } from './sonido';

const CLAVE_SILENCIO = 'remontes.silencio';
/** Do mayor pentatónica: semitonos de cada grado sobre la tónica. */
const GRADOS = [0, 2, 4, 7, 9];
const TONICA = 130.81; // do 3
const OCTAVAS = 3;

export class Musica implements Sonido {
  silencio = false;
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;
  private filtro: BiquadFilterNode | null = null;
  private ambiente: GainNode | null = null;
  private ultimaBolita = 0;
  private apagada = 0;

  constructor() {
    try {
      this.silencio = localStorage.getItem(CLAVE_SILENCIO) === '1';
    } catch {
      // Sin almacenamiento (modo privado): se empieza con sonido.
    }
  }

  /** Arranca el audio (hay que llamarlo desde un gesto del usuario). */
  despertar(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Clase = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return;
    try {
      const ctx = new Clase();
      this.ctx = ctx;
      this.salida = ctx.createGain();
      this.salida.gain.value = this.silencio ? 0 : 0.6;
      this.filtro = ctx.createBiquadFilter();
      this.filtro.type = 'lowpass';
      this.filtro.frequency.value = 3200;
      this.filtro.connect(this.salida).connect(ctx.destination);
      // Ambiente: dos notas graves muy tenues que respiran despacio.
      this.ambiente = ctx.createGain();
      this.ambiente.gain.value = 0.02;
      this.ambiente.connect(this.filtro);
      for (const [f, desafino] of [
        [TONICA / 2, 0],
        [(TONICA / 2) * 1.5, 4],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = desafino;
        o.connect(this.ambiente);
        o.start();
      }
      const lfo = ctx.createOscillator();
      const profundidad = ctx.createGain();
      lfo.frequency.value = 0.07;
      profundidad.gain.value = 0.012;
      lfo.connect(profundidad).connect(this.ambiente.gain);
      lfo.start();
    } catch {
      this.ctx = null;
    }
  }

  alternarSilencio(): void {
    this.silencio = !this.silencio;
    try {
      localStorage.setItem(CLAVE_SILENCIO, this.silencio ? '1' : '0');
    } catch {
      // Sin almacenamiento: vale para esta sesión.
    }
    if (this.ctx && this.salida) this.salida.gain.setTargetAtTime(this.silencio ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  /** Con el medidor de quejas alto, la música se apaga un poco (0 normal … 1 apagada). */
  apagar(cuanto: number): void {
    if (!this.ctx || !this.filtro || Math.abs(cuanto - this.apagada) < 0.05) return;
    this.apagada = cuanto;
    this.filtro.frequency.setTargetAtTime(3200 - 2300 * cuanto, this.ctx.currentTime, 0.4);
  }

  /** Frecuencia del grado de la escala que corresponde a una altura de 0 (abajo) a 1 (arriba). */
  private frecuencia(altura: number, desplazamiento = 0): number {
    const total = GRADOS.length * OCTAVAS;
    const i = Math.min(total - 1, Math.max(0, Math.round(altura * (total - 1)) + desplazamiento));
    const semitonos = Math.floor(i / GRADOS.length) * 12 + GRADOS[i % GRADOS.length];
    return TONICA * Math.pow(2, semitonos / 12);
  }

  /** Una nota de marimba: ataque rápido y caída exponencial. */
  private nota(frecuencia: number, volumen: number, duracion = 0.9, retraso = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.filtro || this.silencio || ctx.state !== 'running') return;
    const t = ctx.currentTime + retraso;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volumen, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    g.connect(this.filtro);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = frecuencia;
    o.connect(g);
    o.start(t);
    o.stop(t + duracion + 0.05);
    // Armónico agudo que se apaga enseguida: el golpe de la baqueta.
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(volumen * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    g2.connect(this.filtro);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = frecuencia * 4;
    o2.connect(g2);
    o2.start(t);
    o2.stop(t + 0.15);
  }

  /** Una bolita llega arriba: una nota tenue (como mucho unas diez por segundo). */
  bolita(altura: number): void {
    const ahora = performance.now();
    if (ahora - this.ultimaBolita < 95) return;
    this.ultimaBolita = ahora;
    this.nota(this.frecuencia(altura), 0.05, 0.7);
  }

  /** Remonte construido: de la nota de abajo a la de arriba. */
  remonte(alturaAbajo: number, alturaArriba: number): void {
    this.nota(this.frecuencia(alturaAbajo), 0.16, 0.9);
    this.nota(this.frecuencia(alturaArriba), 0.16, 1.1, 0.14);
  }

  /** Pista abierta: baja tres notas desde la de arriba. */
  pista(alturaArriba: number): void {
    for (let i = 0; i < 3; i++) this.nota(this.frecuencia(alturaArriba, -i), 0.13, 0.9, i * 0.09);
  }

  /** Remonte mejorado: un acorde que sube. */
  mejora(altura: number): void {
    for (let i = 0; i < 3; i++) this.nota(this.frecuencia(altura, i * 2), 0.14, 1.2, i * 0.07);
  }

  /** Alguien se va enfadado: una nota grave y corta (limitada para que no sature). */
  enfado(): void {
    const ahora = performance.now();
    if (ahora - this.ultimaBolita < 40) return;
    this.nota(TONICA * 0.75, 0.08, 0.35);
  }

  /** Toque en un botón o algo que no se puede hacer. */
  toque(valido = true): void {
    this.nota(valido ? TONICA * 4 : TONICA * 0.9, valido ? 0.05 : 0.09, valido ? 0.2 : 0.3);
  }

  /** Fin de la partida: cuatro notas que bajan. */
  derrota(): void {
    for (let i = 0; i < 4; i++) this.nota(this.frecuencia(0.6, -i * 2), 0.16, 1.6, i * 0.22);
  }
}
