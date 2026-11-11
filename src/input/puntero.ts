// Entrada con pointer events: vale igual para dedo, lápiz y ratón.
import { CONFIG } from '../config';
import type { Juego } from '../juego';
import type { Camara } from '../render/camara';
import { layoutSelector, rectBotonDeshacer, rectBotonVelocidad } from '../render/escena';

export function conectarPuntero(lienzo: HTMLCanvasElement, juego: Juego, camara: Camara): void {
  let activo: number | null = null;
  const enMundo = (e: PointerEvent) => {
    const r = lienzo.getBoundingClientRect();
    return camara.aMundo({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const radio = () => CONFIG.entrada.radioToque / camara.escala;
  const sep = () => CONFIG.estaciones.separacionPx / camara.escala;

  lienzo.addEventListener('pointerdown', (e) => {
    if (activo !== null) return; // un solo dedo a la vez
    const r = lienzo.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dentro = (b: { x: number; y: number; ancho: number; alto: number }) => x >= b.x && x <= b.x + b.ancho && y >= b.y && y <= b.y + b.alto;
    if (dentro(rectBotonVelocidad(r.width, r.height))) {
      juego.cambiarVelocidad();
      e.preventDefault();
      return;
    }
    if (dentro(rectBotonDeshacer(r.height))) {
      juego.deshacer();
      e.preventDefault();
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
      e.preventDefault();
      return;
    }
    if (juego.empezarArrastre(enMundo(e), radio(), sep())) {
      activo = e.pointerId;
      lienzo.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    // Fuera de los nodos: un proyecto de pista abre el selector.
    juego.tocar(enMundo(e), CONFIG.entrada.toleranciaProyecto / camara.escala);
    e.preventDefault();
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activo) return;
    juego.moverArrastre(enMundo(e), radio(), sep());
  });
  lienzo.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activo) return;
    juego.moverArrastre(enMundo(e), radio(), sep());
    juego.soltarArrastre();
    activo = null;
  });
  lienzo.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== activo) return;
    juego.cancelarArrastre();
    activo = null;
  });
  lienzo.addEventListener('contextmenu', (e) => e.preventDefault());
}
