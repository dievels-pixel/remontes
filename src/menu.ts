// Pantalla inicial: fondo animado (un remonte muy grueso en diagonal con
// cabinas subiendo y tres pistas gruesas con puntos bajando, con el mismo
// código de dibujo del juego a escala grande), título, selector de niveles
// deslizable generado desde el índice y ajustes (sonido, daltonismo y
// reiniciar el progreso).
import type { Sonido } from './audio/sonido';
import { COLORES, type ColorPista } from './core/colores';
import { trazarPista } from './core/curva';
import type { Polilinea } from './core/polilinea';
import type { Punto } from './core/vector';
import type { FichaNivel } from './niveles';
import type { Pantalla } from './partida';
import { ponerDaltonismo, preferencias } from './preferencias';
import { progresoDe, reiniciarProgreso, type ProgresoNivel } from './progreso';
import { frenar, limitar01 } from './render/efectos';
import { aplicarPaleta, COLOR, COLOR_PISTA, dibujarBolita, dibujarRemonte, dibujarTrazado, trazarSimbolo } from './render/escena';
import { dentro, iconoDeshacer, iconoSonido, type Rect } from './render/interfaz';
import { textoReto } from './core/retos';

export interface OpcionesMenu {
  sonido: Sonido;
  fichas: FichaNivel[];
  /** Empezar una partida en ese nivel. */
  alJugar(id: string): void;
  /** Tarjeta con la que se abre (la del último nivel jugado). */
  inicial?: string;
}

export const FONDO_MENU = '#e8ebe9';
const FUENTE = 'Futura, "Century Gothic", "Avenir Next", Avenir, "Trebuchet MS", system-ui, sans-serif';
const TARJETA = '#f7f8f6';

export interface DisposicionMenu {
  /** Tarjetas sin textos de reto (pantallas bajas). */
  compacta: boolean;
  titulo: { cx: number; cy: number; alto: number };
  tarjeta: { ancho: number; alto: number; y: number; paso: number };
  puntosY: number;
  ajustes: { sonido: Rect; daltonismo: Rect; reiniciar: Rect; etiquetas: boolean };
}

/** Dónde va cada cosa del menú según el tamaño de la pantalla. */
export function disponerMenu(ancho: number, alto: number): DisposicionMenu {
  const horizontal = ancho > alto;
  const lado = horizontal ? 44 : 52;
  const hueco = horizontal ? 18 : 34;
  const yAjustes = alto - (horizontal ? 12 : 46) - lado;
  const x0 = ancho / 2 - (lado * 3 + hueco * 2) / 2;
  const boton = (i: number): Rect => ({ x: x0 + i * (lado + hueco), y: yAjustes, ancho: lado, alto: lado });
  const tituloAlto = horizontal ? Math.min(40, Math.max(24, alto * 0.095)) : Math.min(52, Math.max(30, alto * 0.058));
  const cyTitulo = horizontal ? alto * 0.12 : alto * 0.115;
  const arriba = cyTitulo + tituloAlto / 2 + (horizontal ? 18 : 40);
  const libre = yAjustes - 34 - arriba;
  const altoTarjeta = Math.max(170, Math.min(390, libre));
  const anchoTarjeta = Math.min(ancho * 0.66, altoTarjeta * (horizontal ? 0.8 : 0.66), 270);
  return {
    compacta: altoTarjeta < 290,
    titulo: { cx: ancho / 2, cy: cyTitulo, alto: tituloAlto },
    tarjeta: { ancho: anchoTarjeta, alto: altoTarjeta, y: arriba + Math.max(0, (libre - altoTarjeta) / 2), paso: anchoTarjeta + 18 },
    puntosY: arriba + Math.max(0, (libre - altoTarjeta) / 2) + altoTarjeta + 16,
    ajustes: { sonido: boton(0), daltonismo: boton(1), reiniciar: boton(2), etiquetas: !horizontal },
  };
}

/** Letras del título, trazadas con líneas en una cuadrícula de 6 de alto: [ancho, trazos]. */
const LETRAS: Record<string, [number, number[][]]> = {
  R: [4, [[0, 6, 0, 0, 2.6, 0, 4, 1.4, 4, 1.9, 2.6, 3.3, 0, 3.3], [2.2, 3.3, 4, 6]]],
  E: [3.6, [[3.6, 0, 0, 0, 0, 6, 3.6, 6], [0, 3, 2.8, 3]]],
  M: [5, [[0, 6, 0, 0, 2.5, 3.6, 5, 0, 5, 6]]],
  N: [4.2, [[0, 6, 0, 0, 4.2, 6, 4.2, 0]]],
  T: [4, [[0, 0, 4, 0], [2, 0, 2, 6]]],
  S: [3.8, [[3.8, 1.1, 2.7, 0, 1.1, 0, 0, 1.1, 0, 1.9, 1.1, 3, 2.7, 3, 3.8, 4.1, 3.8, 4.9, 2.7, 6, 1.1, 6, 0, 4.9]]],
  O: [5, []],
};

function dibujarTitulo(ctx: CanvasRenderingContext2D, texto: string, cx: number, cy: number, alto: number, anchoMaximo: number): void {
  const separacion = 1.5;
  const total = [...texto].reduce((s, l) => s + LETRAS[l][0], 0) + separacion * (texto.length - 1);
  const u = Math.min(alto / 6, anchoMaximo / total);
  let x = cx - (total * u) / 2;
  const y = cy - 3 * u;
  ctx.save();
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = u * 1.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const letra of texto) {
    const [w, trazos] = LETRAS[letra];
    ctx.beginPath();
    if (letra === 'O') ctx.ellipse(x + (w * u) / 2, y + 3 * u, (w * u) / 2, 3 * u, 0, 0, Math.PI * 2);
    for (const t of trazos) {
      ctx.moveTo(x + t[0] * u, y + t[1] * u);
      for (let i = 2; i < t.length; i += 2) ctx.lineTo(x + t[i] * u, y + t[i + 1] * u);
    }
    ctx.stroke();
    x += (w + separacion) * u;
  }
  ctx.restore();
}

interface PistaFondo {
  color: ColorPista;
  trazado: Polilinea;
}

export class PantallaMenu implements Pantalla {
  private ancho = 0;
  private alto = 0;
  private tiempo = 0;
  /** Posición del carrusel en tarjetas (con decimales mientras se desliza). */
  private posicion = 0;
  private objetivo = 0;
  private arrastre: { id: number; x0: number; posicion0: number; movido: boolean; ultimoX: number; ultimoT: number; velocidad: number } | null = null;
  private progresos: ProgresoNivel[];
  private readonly imagenes = new Map<string, HTMLImageElement>();
  private readonly corte = new AbortController();
  private pistas: PistaFondo[] = [];
  private elegida: { indice: number; inicio: number; avisado: boolean } | null = null;
  private sacudida: { indice: number; inicio: number } | null = null;
  private confirmarHasta = 0;
  private borradoHasta = 0;
  private readonly pulsados = new Map<string, number>();

  constructor(
    private readonly lienzo: HTMLCanvasElement,
    private readonly opciones: OpcionesMenu,
  ) {
    aplicarPaleta();
    this.progresos = opciones.fichas.map((f) => progresoDe(f.id));
    const inicial = Math.max(0, opciones.fichas.findIndex((f) => f.id === opciones.inicial));
    this.posicion = this.objetivo = inicial;
    for (const f of opciones.fichas) {
      if (!f.miniatura) continue;
      const img = new Image();
      img.src = f.miniatura;
      this.imagenes.set(f.id, img);
    }
    const o = { signal: this.corte.signal };
    lienzo.addEventListener('pointerdown', (e) => this.abajo(e), o);
    lienzo.addEventListener('pointermove', (e) => this.mover(e), o);
    lienzo.addEventListener('pointerup', (e) => this.arriba(e, false), o);
    lienzo.addEventListener('pointercancel', (e) => this.arriba(e, true), o);
    lienzo.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) > 4) this.irA(this.objetivo + Math.sign(d));
      },
      { passive: false, signal: this.corte.signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'ArrowRight') this.irA(this.objetivo + 1);
        else if (e.key === 'ArrowLeft') this.irA(this.objetivo - 1);
        else if (e.key === 'Enter' || e.key === ' ') this.elegir(this.objetivo);
      },
      o,
    );
  }

  destruir(): void {
    this.corte.abort();
  }

  redimensionar(ancho: number, alto: number): void {
    this.ancho = ancho;
    this.alto = alto;
    // Tres pistas gruesas que cruzan la pantalla de arriba abajo, con sus curvas.
    const forma = (lado: 1 | -1, semilla: number) => ({ lado, abombamiento: 0.1, ondas: 2, irregularidad: 0.6, semilla, temblor: 0 });
    const m = Math.min(ancho, alto);
    this.pistas = [
      { color: 'verde' as const, trazado: trazarPista({ x: ancho * 1.05, y: alto * 0.05 }, { x: ancho * 0.18, y: alto * 1.08 }, forma(1, 3), m * 0.07) },
      { color: 'azul' as const, trazado: trazarPista({ x: ancho * 0.62, y: -alto * 0.06 }, { x: -ancho * 0.08, y: alto * 0.72 }, forma(-1, 7), m * 0.06) },
      { color: 'roja' as const, trazado: trazarPista({ x: ancho * 1.08, y: alto * 0.42 }, { x: ancho * 0.6, y: alto * 1.08 }, forma(-1, 11), m * 0.05) },
    ];
  }

  // ---- Entrada ----

  private punto(e: PointerEvent): Punto {
    const r = this.lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private irA(indice: number): void {
    const n = this.opciones.fichas.length;
    const i = Math.max(0, Math.min(n - 1, indice));
    if (i !== this.objetivo) this.opciones.sonido.toque();
    this.objetivo = i;
  }

  private rectTarjeta(indice: number, d: DisposicionMenu): Rect {
    const cx = this.ancho / 2 + (indice - this.posicion) * d.tarjeta.paso;
    return { x: cx - d.tarjeta.ancho / 2, y: d.tarjeta.y, ancho: d.tarjeta.ancho, alto: d.tarjeta.alto };
  }

  private abajo(e: PointerEvent): void {
    e.preventDefault();
    this.opciones.sonido.despertar();
    if (this.elegida || this.arrastre) return;
    const p = this.punto(e);
    const d = disponerMenu(this.ancho, this.alto);
    const { sonido } = this.opciones;
    if (dentro(p, d.ajustes.sonido)) {
      this.pulsados.set('sonido', this.tiempo);
      sonido.alternarSilencio();
      sonido.toque();
      return;
    }
    if (dentro(p, d.ajustes.daltonismo)) {
      this.pulsados.set('daltonismo', this.tiempo);
      ponerDaltonismo(!preferencias.daltonismo);
      aplicarPaleta();
      sonido.toque();
      return;
    }
    if (dentro(p, d.ajustes.reiniciar)) {
      this.pulsados.set('reiniciar', this.tiempo);
      // Dos toques: el primero pregunta, el segundo borra.
      if (this.tiempo < this.confirmarHasta) {
        reiniciarProgreso();
        this.progresos = this.opciones.fichas.map((f) => progresoDe(f.id));
        this.confirmarHasta = 0;
        this.borradoHasta = this.tiempo + 2;
        sonido.toque();
      } else {
        this.confirmarHasta = this.tiempo + 3.5;
        sonido.toque(false);
      }
      return;
    }
    this.lienzo.setPointerCapture(e.pointerId);
    this.arrastre = { id: e.pointerId, x0: p.x, posicion0: this.posicion, movido: false, ultimoX: p.x, ultimoT: performance.now(), velocidad: 0 };
  }

  private mover(e: PointerEvent): void {
    const a = this.arrastre;
    if (!a || a.id !== e.pointerId) return;
    const p = this.punto(e);
    const d = disponerMenu(this.ancho, this.alto);
    if (!a.movido && Math.abs(p.x - a.x0) > 8) a.movido = true;
    if (a.movido) {
      const n = this.opciones.fichas.length;
      // Con resistencia al pasarse de los extremos.
      let pos = a.posicion0 - (p.x - a.x0) / d.tarjeta.paso;
      if (pos < 0) pos *= 0.35;
      if (pos > n - 1) pos = n - 1 + (pos - (n - 1)) * 0.35;
      this.posicion = pos;
      const ahora = performance.now();
      if (ahora > a.ultimoT) a.velocidad = (-(p.x - a.ultimoX) / d.tarjeta.paso / (ahora - a.ultimoT)) * 1000;
      a.ultimoX = p.x;
      a.ultimoT = ahora;
    }
  }

  private arriba(e: PointerEvent, cancelado: boolean): void {
    const a = this.arrastre;
    if (!a || a.id !== e.pointerId) return;
    this.arrastre = null;
    if (a.movido || cancelado) {
      // Al soltar, a la tarjeta hacia la que iba.
      this.objetivo = Math.max(0, Math.min(this.opciones.fichas.length - 1, Math.round(this.posicion + a.velocidad * 0.18)));
      return;
    }
    const p = this.punto(e);
    const d = disponerMenu(this.ancho, this.alto);
    const tocada = this.opciones.fichas.findIndex((_, i) => dentro(p, this.rectTarjeta(i, d)));
    if (tocada < 0) return;
    if (tocada === Math.round(this.posicion)) this.elegir(tocada);
    else this.irA(tocada);
  }

  private elegir(indice: number): void {
    const ficha = this.opciones.fichas[indice];
    if (!ficha || this.elegida) return;
    if (ficha.bloqueado) {
      this.sacudida = { indice, inicio: this.tiempo };
      this.opciones.sonido.toque(false);
      return;
    }
    this.opciones.sonido.pista(0.8);
    this.elegida = { indice, inicio: this.tiempo, avisado: false };
  }

  // ---- Dibujo ----

  fotograma(ctx: CanvasRenderingContext2D, dt: number): void {
    this.tiempo += dt;
    const { ancho, alto } = this;
    if (!this.arrastre) this.posicion += (this.objetivo - this.posicion) * Math.min(1, dt * 11);
    if (this.elegida && !this.elegida.avisado && this.tiempo - this.elegida.inicio > 0.22) {
      this.elegida.avisado = true;
      this.opciones.alJugar(this.opciones.fichas[this.elegida.indice].id);
    }
    ctx.fillStyle = FONDO_MENU;
    ctx.fillRect(0, 0, ancho, alto);
    this.dibujarFondo(ctx);
    const d = disponerMenu(ancho, alto);
    dibujarTitulo(ctx, 'REMONTES', d.titulo.cx, d.titulo.cy, d.titulo.alto, ancho - 48);
    // Tarjetas: primero las de los lados, la central encima.
    const orden = this.opciones.fichas.map((_, i) => i).sort((a, b) => Math.abs(b - this.posicion) - Math.abs(a - this.posicion));
    for (const i of orden) {
      const r = this.rectTarjeta(i, d);
      if (r.x > ancho + 20 || r.x + r.ancho < -20) continue;
      this.dibujarTarjeta(ctx, i, r, d);
    }
    // Puntos del carrusel.
    const n = this.opciones.fichas.length;
    for (let i = 0; i < n; i++) {
      const cerca = Math.max(0, 1 - Math.abs(i - this.posicion));
      ctx.fillStyle = COLOR.tinta;
      ctx.globalAlpha = 0.25 + 0.75 * cerca;
      ctx.beginPath();
      ctx.arc(ancho / 2 + (i - (n - 1) / 2) * 14, d.puntosY, 3 + cerca * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.dibujarAjustes(ctx, d);
    ctx.fillStyle = 'rgba(38, 42, 49, 0.4)';
    ctx.font = `10px ${FUENTE}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(__VERSION__, 8, alto - 4);
  }

  /** El remonte en diagonal con cabinas subiendo y las pistas con puntos bajando. */
  private dibujarFondo(ctx: CanvasRenderingContext2D): void {
    const { ancho, alto, tiempo } = this;
    const m = Math.min(ancho, alto);
    const grosor = Math.max(16, Math.min(30, m * 0.06));
    const identidad = (p: Punto) => p;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.pistas) {
      dibujarTrazado(ctx, p.trazado, identidad, COLOR_PISTA[p.color], grosor * 0.62, null, undefined, 1);
      // Puntos que bajan despacio, en bucle.
      const L = p.trazado.longitud;
      const paso = Math.max(150, m * 0.32);
      const cuantos = Math.ceil(L / paso);
      const radio = grosor * 0.36;
      for (let k = 0; k < cuantos; k++) {
        const s = ((tiempo * (34 + COLORES.indexOf(p.color) * 9) + k * paso) % (cuantos * paso)) - radio * 2;
        if (s < 0 || s > L) continue;
        const q = p.trazado.puntoEn(s);
        ctx.fillStyle = COLOR.tinta;
        ctx.strokeStyle = TARJETA;
        ctx.lineWidth = Math.max(2, grosor * 0.1);
        ctx.beginPath();
        ctx.arc(q.x, q.y, radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // Remonte: línea doble muy gruesa, de abajo a la izquierda a arriba a la derecha.
    const a = { x: -ancho * 0.12, y: alto * 0.93 };
    const b = { x: ancho * 1.12, y: alto * 0.2 };
    dibujarRemonte(ctx, a, b, COLOR.tinta, grosor);
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    const angulo = Math.atan2(b.y - a.y, b.x - a.x);
    const separacion = Math.max(170, m * 0.36);
    const cabinas = Math.ceil(largo / separacion) + 1;
    const escala = (grosor / 6) * 0.82;
    const colores = [COLOR_PISTA.verde, COLOR_PISTA.azul, COLOR_PISTA.roja, COLOR_PISTA.negra];
    for (let k = 0; k < cabinas; k++) {
      const s = (tiempo * 26 + k * separacion) % (cabinas * separacion);
      if (s > largo) continue;
      const q = { x: a.x + ((b.x - a.x) * s) / largo, y: a.y + ((b.y - a.y) * s) / largo };
      // Cada cabina lleva una combinación fija de pasajeros.
      const pasajeros = [0, 1, 2, 3].filter((i) => (k * 7 + i * 3) % 5 !== 0).map((i) => colores[(k + i) % 4]);
      dibujarBolita(ctx, q, angulo, 2, pasajeros, escala);
    }
    ctx.restore();
  }

  private dibujarTarjeta(ctx: CanvasRenderingContext2D, indice: number, r: Rect, d: DisposicionMenu): void {
    const ficha = this.opciones.fichas[indice];
    const progreso = this.progresos[indice];
    const lejos = Math.min(1, Math.abs(indice - this.posicion));
    let escala = 1 - 0.1 * lejos;
    let dx = 0;
    if (this.elegida?.indice === indice) escala *= 1 + 0.06 * frenar((this.tiempo - this.elegida.inicio) / 0.22);
    if (this.sacudida?.indice === indice) {
      const t = (this.tiempo - this.sacudida.inicio) / 0.4;
      if (t < 1) dx = Math.sin(t * Math.PI * 6) * 7 * (1 - t);
    }
    const cx = r.x + r.ancho / 2 + dx;
    const cy = r.y + r.alto / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(escala, escala);
    ctx.translate(-r.ancho / 2, -r.alto / 2);
    const w = r.ancho;
    const h = r.alto;
    const radio = 20;
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.tinta;
    ctx.lineJoin = 'round';
    const hm = Math.round(h * (d.compacta ? 0.44 : 0.4));
    if (ficha.bloqueado) {
      // Nivel por llegar: la misma tarjeta, vacía y a trazos, con un candado.
      ctx.fillStyle = '#dde1de';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, radio);
      ctx.fill();
      ctx.setLineDash([10, 9]);
      ctx.stroke();
      ctx.setLineDash([]);
      const yc = h * 0.42;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, yc - 10, 13, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = COLOR.tinta;
      ctx.beginPath();
      ctx.roundRect(w / 2 - 20, yc - 10, 40, 32, 7);
      ctx.fill();
      ctx.fillStyle = '#dde1de';
      ctx.beginPath();
      ctx.arc(w / 2, yc + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.tinta;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${d.compacta ? 15 : 17}px ${FUENTE}`;
      ctx.fillText(ficha.nombre || 'Próximamente', w / 2, yc + 52, w - 24);
      if (ficha.nombre) {
        ctx.font = `500 12px ${FUENTE}`;
        ctx.globalAlpha *= 0.7;
        ctx.fillText('Próximamente', w / 2, yc + 74, w - 24);
      }
      ctx.restore();
      return;
    }
    ctx.fillStyle = TARJETA;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, radio);
    ctx.fill();
    // Miniatura, recortada a la parte alta de la tarjeta.
    const img = this.imagenes.get(ficha.id);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, hm, [radio, radio, 0, 0]);
    ctx.clip();
    ctx.fillStyle = '#b9c4c5';
    ctx.fillRect(0, 0, w, hm);
    if (img && img.complete && img.naturalWidth > 0) {
      const k = Math.max(w / img.naturalWidth, hm / img.naturalHeight);
      const iw = img.naturalWidth * k;
      const ih = img.naturalHeight * k;
      // Hacia abajo: el pie de pistas suele estar en la parte baja del mapa.
      ctx.drawImage(img, (w - iw) / 2, hm - ih, iw, ih);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, hm);
    ctx.lineTo(w, hm);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, radio);
    ctx.stroke();
    // Nombre, récord y retos.
    const m = 16;
    ctx.fillStyle = COLOR.tinta;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${d.compacta ? 18 : 22}px ${FUENTE}`;
    ctx.fillText(ficha.nombre, m, hm + (d.compacta ? 20 : 26), w - 2 * m);
    ctx.font = `500 12px ${FUENTE}`;
    ctx.fillStyle = 'rgba(38, 42, 49, 0.7)';
    const record = progreso.record === null ? 'Sin jugar' : `Récord: ${progreso.record} ${progreso.record === 1 ? 'día' : 'días'}`;
    const yRecord = hm + (d.compacta ? 40 : 50);
    ctx.fillText(record, m, yRecord, w - 2 * m);
    const marca = (x: number, y: number, hecho: boolean, rr: number) => {
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.tinta;
      ctx.fillStyle = COLOR.tinta;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      if (hecho) ctx.fill();
      ctx.stroke();
      if (hecho) {
        ctx.strokeStyle = TARJETA;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - rr * 0.45, y + rr * 0.05);
        ctx.lineTo(x - rr * 0.1, y + rr * 0.4);
        ctx.lineTo(x + rr * 0.5, y - rr * 0.35);
        ctx.stroke();
      }
    };
    const altoBoton = d.compacta ? 34 : 40;
    const yBoton = h - altoBoton - 14;
    if (d.compacta) {
      // Sin sitio para los textos: las tres marcas en fila, a la derecha del récord.
      ficha.retos.slice(0, 3).forEach((_, i) => marca(w - m - 8 - (2 - i) * 22, yRecord, progreso.retos[i] === true, 7));
    } else {
      const y0 = yRecord + 26;
      const paso = Math.min(22, (yBoton - 8 - y0) / Math.max(1, ficha.retos.length - 1 || 1));
      ficha.retos.slice(0, 3).forEach((reto, i) => {
        const y = y0 + i * paso;
        const hecho = progreso.retos[i] === true;
        marca(m + 7, y, hecho, 6.5);
        ctx.fillStyle = hecho ? COLOR.tinta : 'rgba(38, 42, 49, 0.75)';
        ctx.font = `${hecho ? 700 : 500} 12px ${FUENTE}`;
        ctx.fillText(textoReto(reto), m + 22, y + 0.5, w - 2 * m - 22);
      });
    }
    // Botón de jugar.
    ctx.fillStyle = COLOR.tinta;
    ctx.beginPath();
    ctx.roundRect(m, yBoton, w - 2 * m, altoBoton, altoBoton / 2);
    ctx.fill();
    ctx.fillStyle = TARJETA;
    ctx.font = `700 15px ${FUENTE}`;
    ctx.textAlign = 'center';
    const yt = yBoton + altoBoton / 2;
    ctx.fillText('Jugar', w / 2 + 8, yt + 1);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 30, yt - 7);
    ctx.lineTo(w / 2 - 19, yt);
    ctx.lineTo(w / 2 - 30, yt + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private dibujarAjustes(ctx: CanvasRenderingContext2D, d: DisposicionMenu): void {
    const { sonido } = this.opciones;
    const confirmando = this.tiempo < this.confirmarHasta;
    const botones: [string, Rect, boolean, string, (c: Punto) => void][] = [
      ['sonido', d.ajustes.sonido, !sonido.silencio, 'Sonido', (c) => iconoSonido(ctx, c, !sonido.silencio)],
      [
        'daltonismo',
        d.ajustes.daltonismo,
        preferencias.daltonismo,
        'Daltonismo',
        (c) => {
          // Las tres formas de los niveles.
          for (const [nivel, dx] of [
            [0, -10],
            [1, 0],
            [2, 10],
          ]) {
            trazarSimbolo(ctx, nivel, c.x + dx, c.y + (nivel === 1 ? -5 : 4), 4);
            ctx.fill();
          }
        },
      ],
      ['reiniciar', d.ajustes.reiniciar, false, confirmando ? '¿Borrar todo?' : this.tiempo < this.borradoHasta ? 'Borrado' : 'Reiniciar', (c) => iconoDeshacer(ctx, c)],
    ];
    ctx.save();
    for (const [nombre, r, activo, etiqueta, icono] of botones) {
      const pulsado = 1 - 0.1 * (1 - frenar(limitar01((this.tiempo - (this.pulsados.get(nombre) ?? -9)) / 0.2)));
      const c = { x: r.x + r.ancho / 2, y: r.y + r.alto / 2 };
      const peligro = nombre === 'reiniciar' && confirmando;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(pulsado, pulsado);
      ctx.translate(-c.x, -c.y);
      ctx.fillStyle = activo ? COLOR.tinta : TARJETA;
      ctx.strokeStyle = peligro ? COLOR.colaLlena : COLOR.tinta;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r.ancho / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = activo ? TARJETA : peligro ? COLOR.colaLlena : COLOR.tinta;
      ctx.strokeStyle = ctx.fillStyle;
      icono(c);
      ctx.restore();
      if (d.ajustes.etiquetas) {
        ctx.fillStyle = peligro ? COLOR.colaLlena : COLOR.tinta;
        ctx.font = `${peligro ? 700 : 500} 11px ${FUENTE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(etiqueta, c.x, r.y + r.alto + 14);
      }
    }
    ctx.restore();
  }
}
