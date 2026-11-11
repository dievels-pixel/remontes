// Entrada con pointer events: vale igual para dedo, lápiz y ratón.
import { CONFIG } from '../config';
import type { Juego } from '../juego';
import type { Camara } from '../render/camara';
import { rectBotonVelocidad } from '../render/escena';

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
    const b = rectBotonVelocidad(r.width, r.height);
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x >= b.x && x <= b.x + b.ancho && y >= b.y && y <= b.y + b.alto) {
      juego.cambiarVelocidad();
      e.preventDefault();
      return;
    }
    if (juego.empezarArrastre(enMundo(e), radio(), sep())) {
      activo = e.pointerId;
      lienzo.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
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
