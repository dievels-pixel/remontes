// Entrada con pointer events: vale igual para dedo, lápiz y ratón.
//
// Gestos:
// - Un dedo sobre un punto: arrastre de remonte (o la herramienta del editor).
// - Un dedo sobre el fondo: si se mueve, desplaza el mapa; si se levanta sin
//   moverse, es un toque (abre el selector de un proyecto, quita el foco…).
// - Dos dedos: pellizco para acercar o alejar, y desplazar a la vez. Si había
//   un arrastre de remonte a medias, se cancela.
// - Rueda del ratón (ordenador): acerca o aleja alrededor del cursor.
import { CONFIG } from '../config';
import type { Punto } from '../core/vector';
import type { Juego } from '../juego';
import type { Camara } from '../render/camara';
import { layoutSelector, rectBotonDeshacer, rectBotonVelocidad, rectNuevaPartida } from '../render/escena';

/** Píxeles que se puede mover el dedo sobre el fondo sin dejar de ser un toque. */
const UMBRAL_TOQUE = 8;

type Modo =
  | { tipo: 'nada' }
  | { tipo: 'arrastre'; id: number }
  | { tipo: 'fondo'; id: number; inicio: Punto; ultimo: Punto; movido: boolean }
  | { tipo: 'pellizco'; distancia: number; medio: Punto }
  /** Tras un pellizco, hasta que se levantan todos los dedos no se hace nada. */
  | { tipo: 'espera' };

export function conectarPuntero(lienzo: HTMLCanvasElement, juego: Juego, camara: Camara): void {
  const punteros = new Map<number, Punto>();
  let modo: Modo = { tipo: 'nada' };

  const enPantalla = (e: { clientX: number; clientY: number }): Punto => {
    const r = lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const enMundo = (p: Punto) => camara.aMundo(p);
  const radio = () => CONFIG.entrada.radioToque / camara.escala;
  const sep = () => CONFIG.estaciones.separacionPx / camara.escala;
  const dosDedos = () => {
    const [a, b] = [...punteros.values()];
    return { distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, medio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  lienzo.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = enPantalla(e);
    punteros.set(e.pointerId, p);
    lienzo.setPointerCapture(e.pointerId);

    // Segundo dedo: empieza el pellizco (y se cancela lo que hubiera a medias).
    if (punteros.size === 2) {
      if (modo.tipo === 'arrastre') juego.cancelarArrastre();
      modo = { tipo: 'pellizco', ...dosDedos() };
      return;
    }
    if (punteros.size > 2 || modo.tipo !== 'nada') return;

    const r = lienzo.getBoundingClientRect();
    const dentro = (b: { x: number; y: number; ancho: number; alto: number }) => p.x >= b.x && p.x <= b.x + b.ancho && p.y >= b.y && p.y <= b.y + b.alto;
    // Partida terminada: solo vale el botón «Nueva partida».
    if (juego.terminada) {
      if (dentro(rectNuevaPartida(r.width, r.height))) juego.nuevaPartida();
      modo = { tipo: 'espera' };
      return;
    }
    if (dentro(rectBotonVelocidad(r.width, r.height))) {
      juego.cambiarVelocidad();
      modo = { tipo: 'espera' };
      return;
    }
    if (dentro(rectBotonDeshacer(r.height))) {
      juego.deshacer();
      modo = { tipo: 'espera' };
      return;
    }
    // Con el selector de color abierto, el toque es para él: elegir un color
    // posible o, fuera del panel, cerrarlo.
    if (juego.selector) {
      const { panel, botones } = layoutSelector(camara.aPantalla(juego.selector.punto), r.width, r.height);
      const boton = botones.find((b) => dentro(b.caja));
      if (boton) {
        if (juego.selector.colores.find((c) => c.color === boton.color)!.factible) juego.elegirColor(boton.color);
      } else if (!dentro(panel)) {
        juego.cerrarSelector();
      }
      modo = { tipo: 'espera' };
      return;
    }
    // Editor del mapa de pruebas (?ajustes): el toque es para la herramienta.
    if (juego.herramientaMapa) {
      modo = juego.editarMapa(enMundo(p), radio(), sep()) ? { tipo: 'arrastre', id: e.pointerId } : { tipo: 'espera' };
      return;
    }
    if (juego.empezarArrastre(enMundo(p), radio(), sep())) {
      modo = { tipo: 'arrastre', id: e.pointerId };
      return;
    }
    // Fondo: aún no se sabe si es un toque o un desplazamiento.
    modo = { tipo: 'fondo', id: e.pointerId, inicio: p, ultimo: p, movido: false };
  });

  lienzo.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId)) return;
    const p = enPantalla(e);
    punteros.set(e.pointerId, p);
    if (modo.tipo === 'arrastre' && e.pointerId === modo.id) {
      juego.moverArrastre(enMundo(p), radio(), sep());
    } else if (modo.tipo === 'fondo' && e.pointerId === modo.id) {
      if (!modo.movido && Math.hypot(p.x - modo.inicio.x, p.y - modo.inicio.y) > UMBRAL_TOQUE) modo.movido = true;
      if (modo.movido) {
        camara.desplazar(p.x - modo.ultimo.x, p.y - modo.ultimo.y);
        modo.ultimo = p;
      }
    } else if (modo.tipo === 'pellizco' && punteros.size === 2) {
      const ahora = dosDedos();
      camara.zoom(ahora.distancia / modo.distancia, ahora.medio);
      camara.desplazar(ahora.medio.x - modo.medio.x, ahora.medio.y - modo.medio.y);
      modo.distancia = ahora.distancia;
      modo.medio = ahora.medio;
    }
  });

  const terminar = (e: PointerEvent, cancelado: boolean) => {
    if (!punteros.has(e.pointerId)) return;
    const p = enPantalla(e);
    punteros.delete(e.pointerId);
    if (modo.tipo === 'arrastre' && e.pointerId === modo.id) {
      if (cancelado) juego.cancelarArrastre();
      else {
        juego.moverArrastre(enMundo(p), radio(), sep());
        juego.soltarArrastre();
      }
      modo = { tipo: 'nada' };
    } else if (modo.tipo === 'fondo' && e.pointerId === modo.id) {
      // Un toque en el fondo: abre el selector de un proyecto o quita el foco.
      if (!modo.movido && !cancelado) juego.tocar(enMundo(modo.inicio), CONFIG.entrada.toleranciaProyecto / camara.escala);
      modo = { tipo: 'nada' };
    } else if (modo.tipo === 'pellizco') {
      modo = { tipo: 'espera' };
    }
    if (punteros.size === 0) modo = { tipo: 'nada' };
  };
  lienzo.addEventListener('pointerup', (e) => terminar(e, false));
  lienzo.addEventListener('pointercancel', (e) => terminar(e, true));

  lienzo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camara.zoom(Math.exp(-e.deltaY * 0.0015), enPantalla(e));
    },
    { passive: false },
  );
  lienzo.addEventListener('contextmenu', (e) => e.preventDefault());
}
