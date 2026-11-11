// Entrada con pointer events: vale igual para dedo, lápiz y ratón.
import { CONFIG } from '../config';
import type { Juego } from '../juego';
import type { Camara } from '../render/camara';

export function conectarPuntero(lienzo: HTMLCanvasElement, juego: Juego, camara: Camara): void {
  let activo: number | null = null;
  const enMundo = (e: PointerEvent) => {
    const r = lienzo.getBoundingClientRect();
    return camara.aMundo({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const radio = () => CONFIG.entrada.radioToque / camara.escala;

  lienzo.addEventListener('pointerdown', (e) => {
    if (activo !== null) return; // un solo dedo a la vez
    if (juego.empezarArrastre(enMundo(e), radio())) {
      activo = e.pointerId;
      lienzo.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activo) return;
    juego.moverArrastre(enMundo(e), radio());
  });
  lienzo.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activo) return;
    juego.moverArrastre(enMundo(e), radio());
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
