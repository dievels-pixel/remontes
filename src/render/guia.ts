// Guía de la primera partida, sin texto: resalta el gesto que toca con un
// «dedo» fantasma que lo repite en bucle. Pasos: arrastra desde una base de la
// plaza hasta un punto más alto (remonte), arrastra desde su llegada hacia
// abajo (pista), elige un color y, cuando aparezca la primera cola, mantén
// pulsado el remonte (mejora). Se da por hecha al mejorar un remonte o tras
// diez minutos de juego, y no vuelve a salir.
import { guardar, leer } from '../almacen';
import { COLORES } from '../core/colores';
import type { Punto } from '../core/vector';
import type { Juego } from '../juego';
import { frenar, suavizar, type Efectos } from './efectos';
import { COLOR, RADIO_NODO } from './escena';

export type PasoGuia =
  | { tipo: 'remonte'; desde: number; hasta: number }
  | { tipo: 'pista'; desde: number; hasta: number }
  | { tipo: 'color' }
  | { tipo: 'mejora'; remonte: number }
  | null;

const CLAVE = 'guia';

export class Guia {
  activa: boolean;
  private cache: { version: number; monedas: boolean; paso: PasoGuia } | null = null;

  constructor(forzar = false) {
    this.activa = forzar || !leer<boolean>(CLAVE, false);
  }

  private terminar(): void {
    this.activa = false;
    guardar(CLAVE, true);
  }

  /** Qué gesto toca enseñar ahora, o null. */
  paso(j: Juego): PasoGuia {
    if (!this.activa || j.terminada || j.modoAjustes) return null;
    const { red, sim } = j;
    if (red.remontes.some((r) => r.tipo > 0) || sim.tiempoAbierta > 600) {
      this.terminar();
      return null;
    }
    if (j.selector) return { tipo: 'color' };
    if (j.mejora) return null;
    // La sugerencia de remonte o de pista solo cambia cuando cambia la red.
    if (this.cache?.version !== red.version) this.cache = { version: red.version, monedas: true, paso: this.sugerir(j) };
    if (this.cache.paso) return this.cache.paso;
    // Primera cola que pasa del aforo: enseñar la mejora.
    const conCola = red.remontes.find((r) => (sim.colas[r.id]?.length ?? 0) > sim.p.aforoCola && (j.precioMejoraDe(r.id) ?? Infinity) <= j.monedas);
    return conCola ? { tipo: 'mejora', remonte: conCola.id } : null;
  }

  private sugerir(j: Juego): PasoGuia {
    const red = j.red;
    const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
    const parado = red.remontes.find((r) => !red.enServicio(r));
    if (parado) {
      // Una bajada desde su llegada: primero a su propia salida, luego a lo más cercano.
      const o = red.nodo(parado.hasta);
      const destinos = red.nodos.filter((b) => b.cota < o.cota && red.viable(b.id)).sort((a, b) => Number(b.id === parado.desde) - Number(a.id === parado.desde) || dist(a, o) - dist(b, o));
      for (const b of destinos.slice(0, 6)) {
        const e = j.evaluarPista(parado.hasta, b.id);
        if (e.motivo === 'ok' && !e.espera) return { tipo: 'pista', desde: parado.hasta, hasta: b.id };
      }
      return null;
    }
    if (red.remontes.length > 0) return null;
    // Primer remonte: el más barato desde la plaza desde cuya llegada quepa una verde de vuelta.
    const rp = red.reglas.pista;
    const [min, max] = rp.bandas[COLORES[0]];
    let mejor: { desde: number; hasta: number; precio: number } | null = null;
    for (const base of red.nodos.filter((n) => n.tipo === 'base')) {
      const altos = red.nodos.filter((n) => n.cota > base.cota).sort((a, b) => dist(a, base) - dist(b, base)).slice(0, 6);
      for (const d of altos) {
        const recta = (d.cota - base.cota) / dist(d, base);
        if (recta < min || recta / rp.sinuosidadMaxima > max) continue;
        const precio = j.precioRemonteEntre(base.id, d.id);
        if (precio > j.monedas || (mejor && precio >= mejor.precio)) continue;
        if (red.puedeConstruirRemonte(base.id, d.id) === 'ok') mejor = { desde: base.id, hasta: d.id, precio };
      }
    }
    return mejor ? { tipo: 'remonte', desde: mejor.desde, hasta: mejor.hasta } : null;
  }
}

function dedo(ctx: CanvasRenderingContext2D, p: Punto, alfa: number, radio = 11): void {
  ctx.globalAlpha = alfa * 0.85;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Dibuja el resaltado del paso (los colores del selector los resalta la interfaz). */
export function dibujarGuia(ctx: CanvasRenderingContext2D, juego: Juego, paso: PasoGuia, fx: Efectos, aPantalla: (p: Punto) => Punto, alfa: number): void {
  if (!paso || paso.tipo === 'color' || alfa <= 0.01) return;
  const red = juego.red;
  ctx.save();
  if (paso.tipo === 'mejora') {
    const r = red.remontes[paso.remonte];
    if (!r) {
      ctx.restore();
      return;
    }
    const a = aPantalla(red.nodo(r.desde));
    const b = aPantalla(red.nodo(r.hasta));
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Mantener pulsado: un aro que se cierra sobre el dedo, en bucle.
    const t = (fx.ahora % 1.6) / 1.6;
    ctx.globalAlpha = alfa * (1 - t * 0.4);
    ctx.strokeStyle = COLOR.tinta;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 30 - 17 * frenar(t), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t * 1.3));
    ctx.stroke();
    dedo(ctx, c, alfa);
    ctx.restore();
    return;
  }
  const a = aPantalla(red.nodo(paso.desde));
  const b = aPantalla(red.nodo(paso.hasta));
  // Halos en el origen y el destino, y una línea tenue entre los dos.
  const late = (fx.ahora % 1.2) / 1.2;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.globalAlpha = alfa * (1 - late) * 0.7;
  ctx.beginPath();
  ctx.arc(a.x, a.y, RADIO_NODO + 4 + late * 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = alfa * 0.35;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = alfa * 0.6;
  ctx.beginPath();
  ctx.arc(b.x, b.y, RADIO_NODO + 6, 0, Math.PI * 2);
  ctx.stroke();
  // El dedo: pulsa en el origen, arrastra y suelta en el destino.
  const t = (fx.ahora % 2.4) / 2.4;
  const viaje = suavizar((t - 0.15) / 0.6);
  const p = { x: a.x + (b.x - a.x) * viaje, y: a.y + (b.y - a.y) * viaje };
  const visible = t < 0.08 ? t / 0.08 : t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.12) : 1;
  dedo(ctx, p, alfa * visible, t < 0.15 ? 11 + 3 * (1 - t / 0.15) : 11);
  ctx.restore();
}
