// Pantalla de partida: une el juego (reglas y simulación), la cámara, las
// animaciones, el sonido, la guía y la entrada. No sabe de menús ni de
// niveles: quien la crea le da el mapa y lo que hay que hacer al salir.
import { MusicaNula, type Sonido } from './audio/sonido';
import { CONFIG } from './config';
import type { Mapa } from './core/mapa';
import { conectarPuntero, type ReceptorEntrada } from './input/puntero';
import { Juego } from './juego';
import { Camara } from './render/camara';
import { Efectos, frenar } from './render/efectos';
import { dibujar } from './render/escena';
import { dibujarGuia, Guia } from './render/guia';
import { dibujarFin, dibujarInterfaz, disponer, layoutFin, nuevaMemoria, type DatosFin, type NombreBoton } from './render/interfaz';
import { crearTerreno } from './render/terreno';

export interface Pantalla {
  redimensionar(ancho: number, alto: number): void;
  /** Avanza y dibuja un fotograma; `dt` son segundos reales. */
  fotograma(ctx: CanvasRenderingContext2D, dt: number): void;
  destruir(): void;
}

export interface OpcionesPartida {
  sonido?: Sonido;
  semilla?: number;
  /** Volver al menú (botón de salir y del panel final). */
  alSalir(): void;
  /** Otra partida en el mismo nivel. */
  alRepetir(): void;
  /** Al acabar: retos y récord que muestra el panel final (y se guardan). */
  alTerminar?(juego: Juego): DatosFin;
}

/** Paso fijo de simulación, independiente de la frecuencia de pantalla. */
const DT = 1 / 60;

export class PantallaPartida implements Pantalla, ReceptorEntrada {
  readonly juego: Juego;
  readonly camara = new Camara();
  readonly fx = new Efectos();
  readonly guia = new Guia();
  /** Tiempos del último fotograma (ms), para medir el rendimiento. */
  readonly tiempos = { simulacion: 0, calentar: 0, dibujo: 0, pasos: 0 };
  private readonly sonido: Sonido;
  private readonly memoria = nuevaMemoria();
  private readonly desconectar: () => void;
  private terreno: HTMLCanvasElement;
  private claveTerreno: { alturas: unknown; umbral: number };
  private ancho = 0;
  private alto = 0;
  private acumulado = 0;
  private primerFotograma = true;
  private fin: DatosFin | null = null;
  /** Franja extra arriba (panel de ajustes abierto). */
  private reservaExtra = 0;
  private encuadrada = false;

  constructor(
    lienzo: HTMLCanvasElement,
    mapa: Mapa,
    private readonly opciones: OpcionesPartida,
  ) {
    this.juego = new Juego(mapa, opciones.semilla);
    this.sonido = opciones.sonido ?? new MusicaNula();
    this.terreno = crearTerreno(this.juego.alturas, this.juego.umbralRoca);
    this.claveTerreno = { alturas: this.juego.alturas, umbral: this.juego.umbralRoca };
    this.desconectar = conectarPuntero(lienzo, this);
    // Herramienta temporal de calibración: solo con ?ajustes en la dirección.
    if (new URLSearchParams(location.search).has('ajustes')) {
      this.juego.modoAjustes = true;
      void import('./herramientas/ajustes').then((m) =>
        m.montarPanelAjustes(this.juego, (arriba) => {
          this.reservaExtra = arriba;
          this.redimensionar(this.ancho, this.alto);
        }),
      );
    }
  }

  redimensionar(ancho: number, alto: number): void {
    this.ancho = ancho;
    this.alto = alto;
    const d = disponer(ancho, alto);
    const { datos } = this.juego.mapa;
    this.camara.ajustar(ancho, alto, datos.ancho, datos.alto, Math.max(d.arriba, this.reservaExtra), d.abajo);
    // En horizontal el mapa entero se ve pequeño: se empieza acercado al pie de pistas.
    if (!this.encuadrada && ancho > 0) {
      this.encuadrada = true;
      if (d.horizontal) this.camara.zoom(2.4, this.camara.aPantalla(this.juego.plaza));
    }
  }

  destruir(): void {
    this.desconectar();
    document.getElementById('ajustes')?.remove();
  }

  // ---- Entrada ----

  alTocar(): void {
    this.sonido.despertar();
  }

  alBoton(nombre: NombreBoton): void {
    const j = this.juego;
    this.fx.nacer(`boton:${nombre}`);
    if (nombre === 'deshacer') {
      this.sonido.toque(j.red.puedeDeshacer);
      j.deshacer();
    } else if (nombre === 'pausa') {
      j.alternarPausa();
      this.sonido.toque();
    } else if (nombre === 'velocidad') {
      j.cambiarVelocidad();
      this.sonido.toque();
    } else if (nombre === 'sonido') {
      this.sonido.alternarSilencio();
      this.sonido.toque();
    } else {
      this.opciones.alSalir();
    }
  }

  alFin(boton: 'repetir' | 'menu'): void {
    this.sonido.toque();
    if (boton === 'repetir') this.opciones.alRepetir();
    else this.opciones.alSalir();
  }

  retosEnFin(): number {
    return this.fin?.retos.length ?? 0;
  }

  finListo(): boolean {
    return this.fin !== null && this.fx.valor('fin') > 0.9;
  }

  // ---- Bucle ----

  fotograma(ctx: CanvasRenderingContext2D, dt: number): void {
    const j = this.juego;
    const { fx, sonido } = this;
    const t0 = performance.now();
    let pasos = 0;
    if (!j.pausado && !j.terminada) {
      this.acumulado += Math.min(dt, 0.25) * j.velocidad * CONFIG.tiempo.escala;
      while (this.acumulado >= DT) {
        j.paso(DT);
        this.acumulado -= DT;
        pasos++;
      }
    }
    const t1 = performance.now();
    // En segundo plano, unos milisegundos: lo que pedirá el próximo arrastre.
    j.calentar();
    const t2 = performance.now();

    // Sonido de lo que acaba de pasar.
    const { red, sim } = j;
    const rango = Math.max(1, j.mapa.datos.cotaMax - j.mapa.datos.cotaMin);
    const altura = (nodo: number) => (red.nodos[nodo] ? (red.nodo(nodo).cota - j.mapa.datos.cotaMin) / rango : 0);
    for (const e of j.eventos) {
      if (e.tipo === 'remonte' && red.remontes[e.id]) sonido.remonte(altura(red.remontes[e.id].desde), altura(red.remontes[e.id].hasta));
      else if (e.tipo === 'pista' && red.pistas[e.id]) sonido.pista(altura(red.pistas[e.id].desde));
      else if (e.tipo === 'mejora' && red.remontes[e.id]) sonido.mejora(altura(red.remontes[e.id].hasta));
      else if (e.tipo === 'aviso') sonido.toque(false);
    }
    for (const e of sim.eventos) {
      if (e.tipo === 'bolita' && red.remontes[e.remonte]) sonido.bolita(altura(red.remontes[e.remonte].hasta));
      else if (e.tipo === 'enfadado') sonido.enfado();
    }
    sonido.apagar(Math.max(0, (sim.fraccionQuejas - CONFIG.quejas.aviso) / (1 - CONFIG.quejas.aviso)));

    fx.sincronizar(j, dt, this.primerFotograma);
    this.primerFotograma = false;
    j.eventos.length = 0;
    sim.eventos.length = 0;
    fx.mezcla('marcas', j.arrastre?.movido === true, dt, 0.15);

    // Fin de la partida: la vista vuelve al mapa entero y entra el panel.
    if (j.terminada && !this.fin) {
      this.fin = this.opciones.alTerminar?.(j) ?? { retos: [], recordAnterior: null, esRecord: false };
      j.cancelarArrastre();
      j.cerrarSelector();
      j.cancelarMejora();
      sonido.derrota();
    }
    if (this.fin) {
      // El mapa se recoloca por encima del panel final (en vertical) mientras
      // la vista se aleja hasta verse entero.
      const d0 = disponer(this.ancho, this.alto);
      const entra = frenar(fx.valor('fin'));
      const panel = layoutFin(this.ancho, this.alto, this.fin.retos.length).panel;
      const abajo = d0.horizontal ? 12 : panel.alto + 28;
      const { datos } = j.mapa;
      this.camara.ajustar(this.ancho, this.alto, datos.ancho, datos.alto, d0.arriba + (12 - d0.arriba) * entra, d0.abajo + (abajo - d0.abajo) * entra);
      this.camara.haciaEncaje(dt * 3);
    }

    if (this.claveTerreno.alturas !== j.alturas || this.claveTerreno.umbral !== j.umbralRoca) {
      this.terreno = crearTerreno(j.alturas, j.umbralRoca);
      this.claveTerreno = { alturas: j.alturas, umbral: j.umbralRoca };
    }
    const { ancho, alto, camara } = this;
    const aPantalla = (p: { x: number; y: number }) => camara.aPantalla(p);
    dibujar(ctx, j, camara, this.terreno, ancho, alto, fx);
    const paso = this.guia.paso(j);
    const alfaGuia = fx.mezcla('guia', paso !== null && paso.tipo !== 'color' && !j.arrastre?.movido, dt, 0.3);
    if (paso && paso.tipo !== 'color') this.ultimoPaso = paso;
    dibujarGuia(ctx, j, this.ultimoPaso, fx, aPantalla, alfaGuia);
    const d = disponer(ancho, alto);
    const alfaFin = fx.mezcla('fin', this.fin !== null, dt, 0.5);
    if (alfaFin < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - alfaFin;
      dibujarInterfaz(ctx, j, fx, d, this.memoria, { silencio: this.sonido.silencio, guiaColor: paso?.tipo === 'color' }, aPantalla, ancho, alto, dt);
      ctx.restore();
    }
    if (this.fin && alfaFin > 0.01) dibujarFin(ctx, j, fx, this.fin, aPantalla, ancho, alto, alfaFin);

    this.tiempos.simulacion = t1 - t0;
    this.tiempos.calentar = t2 - t1;
    this.tiempos.dibujo = performance.now() - t2;
    this.tiempos.pasos = pasos;
    j.rendimiento.ms += (performance.now() - t0 - j.rendimiento.ms) * 0.05;
    if (dt > 0 && dt < 1) j.rendimiento.fps += (1 / dt - j.rendimiento.fps) * 0.05;
  }

  private ultimoPaso: ReturnType<Guia['paso']> = null;
}
