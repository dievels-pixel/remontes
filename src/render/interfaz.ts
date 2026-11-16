// Interfaz de la partida sobre el mundo: barra superior (monedas, quejas y
// día), contadores por color, botones, selector de color, pregunta de mejora,
// avisos y fin de partida. La disposición (dónde va cada cosa según el tamaño
// y la orientación de la pantalla) es común al dibujo y a la entrada.
import { COLORES, pistaForzada, type ColorPista } from '../core/colores';
import { fracciones, kmPorColor } from '../core/indicadores';
import type { Punto } from '../core/vector';
import type { Juego, Selector } from '../juego';
import { frenar, limitar01, rebotar, type Efectos } from './efectos';
import { preferencias } from '../preferencias';
import { COLOR, COLOR_PISTA, mezclar, RADIO_NODO, trazarSimbolo } from './escena';

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export const dentro = (p: Punto, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.ancho && p.y >= r.y && p.y <= r.y + r.alto;

export type NombreBoton = 'deshacer' | 'salir' | 'sonido' | 'pausa' | 'velocidad';

export interface Disposicion {
  horizontal: boolean;
  /** Franjas que ocupa la interfaz arriba y abajo: el mapa se encaja entre ellas. */
  arriba: number;
  abajo: number;
  monedas: Punto;
  medidor: Rect;
  /** Ancla derecha del día. */
  dia: Punto;
  /** Renglón de detalle (ingresos, mantenimiento…): centro y línea base. */
  detalle: { x: number; y: number; alineado: CanvasTextAlign; anchoMaximo: number };
  botones: Record<NombreBoton, Rect>;
  contadores: { x0: number; paso: number; y1: number; y2: number; km: Rect };
  version: Punto;
}

const PASO_CONTADOR = 76;

/** Dónde va cada elemento según el tamaño de la pantalla (vertical u horizontal). */
export function disponer(ancho: number, alto: number): Disposicion {
  const horizontal = ancho > alto;
  const m = 12;
  const hb = 44;
  const yb = alto - m - hb;
  const deshacer = { x: m, y: yb, ancho: 52, alto: hb };
  const salir = { x: deshacer.x + deshacer.ancho + 8, y: yb, ancho: 44, alto: hb };
  const velocidad = { x: ancho - m - 60, y: yb, ancho: 60, alto: hb };
  const pausa = { x: velocidad.x - 8 - 52, y: yb, ancho: 52, alto: hb };
  const sonido = { x: pausa.x - 8 - 44, y: yb, ancho: 44, alto: hb };
  const anchoContadores = PASO_CONTADOR * 3 + 60;
  const x0 = ancho / 2 - anchoContadores / 2 + 8;
  if (horizontal) {
    // Todo en una fila arriba; abajo, los contadores entre los botones,
    // centrados en el hueco que dejan (y más juntos si el hueco es estrecho).
    const izquierda = salir.x + salir.ancho + 8;
    const hueco = sonido.x - 8 - izquierda;
    const paso = Math.max(52, Math.min(PASO_CONTADOR, (hueco - 24 - 60) / 3));
    const anchoContadores = paso * 3 + 60;
    const centro = izquierda + hueco / 2;
    const x0 = centro - anchoContadores / 2 + 8;
    const y1 = yb + 12;
    return {
      horizontal,
      arriba: 40,
      abajo: hb + m + 40,
      monedas: { x: m + 2, y: 22 },
      medidor: { x: ancho * 0.44, y: 17, ancho: ancho * 0.26, alto: 10 },
      dia: { x: ancho - m, y: 22 },
      detalle: { x: 118, y: 23, alineado: 'left', anchoMaximo: ancho * 0.44 - 118 - 70 },
      botones: { deshacer, salir, sonido, pausa, velocidad },
      contadores: { x0, paso, y1, y2: y1 + 18, km: { x: centro - anchoContadores / 2, y: yb - 6, ancho: anchoContadores, alto: 6 } },
      version: { x: ancho / 2, y: alto - 2 },
    };
  }
  const y2 = yb - 16;
  const y1 = y2 - 18;
  return {
    horizontal,
    arriba: 60,
    abajo: alto - (y1 - 30),
    monedas: { x: m + 2, y: 24 },
    medidor: { x: Math.max(150, ancho * 0.36), y: 19, ancho: ancho - Math.max(150, ancho * 0.36) - 86, alto: 10 },
    dia: { x: ancho - m, y: 24 },
    detalle: { x: ancho / 2, y: 47, alineado: 'center', anchoMaximo: ancho - 2 * m },
    botones: { deshacer, salir, sonido, pausa, velocidad },
    contadores: { x0, paso: PASO_CONTADOR, y1, y2, km: { x: ancho / 2 - anchoContadores / 2, y: y1 - 20, ancho: anchoContadores, alto: 6 } },
    version: { x: ancho / 2, y: alto - 2 },
  };
}

/** Lo que la interfaz recuerda entre fotogramas para que los paneles salgan con suavidad. */
export interface MemoriaInterfaz {
  selector: { sel: Selector; punto: Punto } | null;
  mejora: { texto: string; alcanza: boolean } | null;
  aviso: string;
}

export const nuevaMemoria = (): MemoriaInterfaz => ({ selector: null, mejora: null, aviso: '' });

export interface EstadoInterfaz {
  silencio: boolean;
  /** La guía de la primera partida pide elegir un color. */
  guiaColor: boolean;
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const PANEL = 'rgba(241, 243, 244, 0.92)';

function pastilla(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(241, 243, 244, 0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

const coma = (x: number, d = 0) => x.toFixed(d).replace('.', ',');

/** Barra superior, contadores, botones, selector, mejora y avisos. */
export function dibujarInterfaz(
  ctx: CanvasRenderingContext2D,
  juego: Juego,
  fx: Efectos,
  d: Disposicion,
  mem: MemoriaInterfaz,
  estado: EstadoInterfaz,
  aPantalla: (p: Punto) => Punto,
  ancho: number,
  alto: number,
  dt: number,
): void {
  const { sim, red } = juego;
  const abierta = red.remontes.length > 0;
  ctx.save();
  ctx.textBaseline = 'middle';

  // Monedas: el número rueda hacia el valor real.
  ctx.font = `700 17px ${FUENTE}`;
  const monedas = String(Math.floor(fx.monedasMostradas));
  const wm = ctx.measureText(monedas).width;
  pastilla(ctx, d.monedas.x - 6, d.monedas.y - 14, wm + 44, 28);
  dibujarMoneda(ctx, d.monedas.x + 9, d.monedas.y, 8);
  ctx.fillStyle = COLOR.tinta;
  ctx.textAlign = 'left';
  ctx.fillText(monedas, d.monedas.x + 24, d.monedas.y + 1);

  // Día, con una esfera pequeña que marca la hora.
  ctx.font = `700 14px ${FUENTE}`;
  const dia = `Día ${juego.dia}`;
  const wd = ctx.measureText(dia).width;
  pastilla(ctx, d.dia.x - wd - 34, d.dia.y - 14, wd + 40, 28);
  ctx.fillStyle = COLOR.tinta;
  ctx.textAlign = 'right';
  ctx.fillText(dia, d.dia.x - 6, d.dia.y + 1);
  const ex = d.dia.x - wd - 20;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ex, d.dia.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, d.dia.y);
  ctx.arc(ex, d.dia.y, 7, -Math.PI / 2, -Math.PI / 2 + juego.horaDelDia * Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // Medidor de quejas y renglón de detalle: aparecen al abrir la estación.
  const visible = fx.mezcla('abierta', abierta, dt, 0.4);
  if (visible > 0.01) {
    ctx.globalAlpha = visible;
    const f = sim.fraccionQuejas;
    const m = d.medidor;
    pastilla(ctx, m.x - 54, m.y - 7, m.ancho + 62, m.alto + 14);
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = COLOR.tinta;
    ctx.textAlign = 'right';
    ctx.fillText('Quejas', m.x - 6, m.y + m.alto / 2 + 0.5);
    ctx.fillStyle = 'rgba(38, 42, 49, 0.15)';
    ctx.beginPath();
    ctx.roundRect(m.x, m.y, m.ancho, m.alto, m.alto / 2);
    ctx.fill();
    if (f > 0) {
      const late = f >= juego.config.quejas.aviso ? 0.75 + 0.25 * Math.sin(fx.ahora * 5) : 1;
      ctx.globalAlpha = visible * late;
      ctx.fillStyle = mezclar(COLOR.colaVacia, COLOR.colaLlena, Math.max(0, (f - 0.4) / 0.6));
      ctx.beginPath();
      ctx.roundRect(m.x, m.y, Math.max(m.alto, m.ancho * f), m.alto, m.alto / 2);
      ctx.fill();
      ctx.globalAlpha = visible;
    }
    // Detalle: ingresos, mantenimiento, diversión, llegadas y satisfechos.
    const div = sim.fraccionConDiversion;
    const partes = [
      `+${Math.round(sim.ingresosPorMinuto)}/min`,
      `−${Math.round(sim.mantenimientoPorMinuto)}/min`,
      `diversión ${div === null ? '–' : `${Math.round(div * 100)} %`}`,
      `llegan ${Math.round(sim.llegadasPorMinuto)}/min`,
      `satisfechos ${sim.cansados}`,
    ];
    ctx.font = `600 11px ${FUENTE}`;
    let texto = partes.join('  ·  ');
    while (partes.length > 2 && ctx.measureText(texto).width > d.detalle.anchoMaximo - 16) {
      partes.pop();
      texto = partes.join('  ·  ');
    }
    const wt = ctx.measureText(texto).width;
    const xt = d.detalle.alineado === 'center' ? d.detalle.x - wt / 2 : d.detalle.x;
    pastilla(ctx, xt - 8, d.detalle.y - 9, wt + 16, 18);
    ctx.fillStyle = 'rgba(38, 42, 49, 0.82)';
    ctx.textAlign = 'left';
    ctx.fillText(texto, xt, d.detalle.y + 0.5);
    ctx.globalAlpha = 1;
  }

  dibujarContadores(ctx, juego, d, visible);

  // Botones.
  boton(ctx, fx, 'deshacer', d.botones.deshacer, red.puedeDeshacer, (c) => iconoDeshacer(ctx, c));
  boton(ctx, fx, 'salir', d.botones.salir, true, (c) => iconoSalir(ctx, c));
  boton(ctx, fx, 'sonido', d.botones.sonido, true, (c) => iconoSonido(ctx, c, !estado.silencio));
  boton(ctx, fx, 'pausa', d.botones.pausa, true, (c) => iconoPausa(ctx, c, juego.pausado), juego.pausado);
  boton(ctx, fx, 'velocidad', d.botones.velocidad, true, (c) => iconoVelocidad(ctx, c, juego.velocidad));

  // Versión, pequeña y discreta.
  ctx.fillStyle = 'rgba(38, 42, 49, 0.4)';
  ctx.font = `10px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(__VERSION__, d.version.x, d.version.y);
  ctx.textBaseline = 'middle';

  // Selector de color: entra y sale con un pequeño cambio de tamaño.
  if (juego.selector) mem.selector = { sel: juego.selector, punto: juego.selector.punto };
  const aSel = fx.mezcla('selector', juego.selector !== null, dt);
  if (aSel > 0.01 && mem.selector) dibujarSelector(ctx, juego, mem.selector.sel, aPantalla(mem.selector.punto), ancho, alto, aSel, estado.guiaColor && juego.selector !== null ? fx.ahora : null);

  // Etiqueta de una pista (solo en el modo de ajustes).
  if (juego.infoPista && red.pistas[juego.infoPista.pista]) dibujarInfoPista(ctx, juego, aPantalla(juego.infoPista.punto), ancho);

  // Pregunta de mejora.
  if (juego.mejora) mem.mejora = { texto: juego.textoMejora(), alcanza: juego.mejora.precio <= juego.monedas };
  const aMej = fx.mezcla('mejora', juego.mejora !== null, dt);
  if (aMej > 0.01 && mem.mejora) dibujarMejora(ctx, mem.mejora, d, ancho, alto, aMej);

  // Aviso corto (por qué algo no se puede hacer).
  const hayAviso = juego.mensaje !== null && performance.now() < juego.mensaje.hasta;
  if (hayAviso) mem.aviso = juego.mensaje!.texto;
  const aAviso = fx.mezcla('aviso', hayAviso, dt);
  if (aAviso > 0.01 && mem.aviso) dibujarAviso(ctx, mem.aviso, d, ancho, aAviso);
  ctx.restore();
}

function dibujarMoneda(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#e9b949';
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r - 3.2, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Contadores por nivel: un punto del color y cuántos hay; debajo, cuántos
 * están a un punto de irse (punto blanco, como el parpadeo del mapa) y
 * cuántos se han ido enfadados (✕). Encima, la barra de kilómetros de pista
 * por color con las marcas de la mezcla de llegadas.
 */
function dibujarContadores(ctx: CanvasRenderingContext2D, juego: Juego, d: Disposicion, alfa: number): void {
  if (alfa <= 0.01) return;
  const { sim } = juego;
  const c = d.contadores;
  const n = sim.porNivel();
  const enRiesgo = sim.aPuntoDeIrsePorNivel();
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.fillStyle = 'rgba(241, 243, 244, 0.82)';
  ctx.beginPath();
  ctx.roundRect(c.km.x - 12, c.km.y - 12, c.km.ancho + 24, c.y2 - c.km.y + 24, 14);
  ctx.fill();
  const km = kmPorColor(juego.red);
  if (km.some((k) => k > 0)) {
    const oferta = fracciones(km);
    const demanda = fracciones(sim.mezclaActual);
    let x = c.km.x;
    oferta.forEach((f, i) => {
      ctx.fillStyle = COLOR_PISTA[COLORES[i]];
      ctx.fillRect(x, c.km.y, c.km.ancho * f, c.km.alto);
      x += c.km.ancho * f;
    });
    let acumulada = 0;
    ctx.fillStyle = COLOR.tinta;
    for (let i = 0; i < demanda.length - 1; i++) {
      acumulada += demanda[i];
      if (acumulada >= 0.999) break;
      const xm = c.km.x + c.km.ancho * acumulada;
      ctx.beginPath();
      ctx.moveTo(xm, c.km.y - 1);
      ctx.lineTo(xm - 3.5, c.km.y - 6);
      ctx.lineTo(xm + 3.5, c.km.y - 6);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  n.forEach((v, i) => {
    const x = c.x0 + i * c.paso;
    ctx.fillStyle = COLOR_PISTA[COLORES[i]];
    ctx.strokeStyle = COLOR.hueco;
    ctx.lineWidth = 1.5;
    // En el modo para daltonismo, la forma del nivel en vez del punto.
    if (preferencias.daltonismo) trazarSimbolo(ctx, i, x, c.y1, 5.5);
    else {
      ctx.beginPath();
      ctx.arc(x, c.y1, 5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.font = `700 12px ${FUENTE}`;
    ctx.fillStyle = COLOR.tinta;
    ctx.fillText(String(v), x + 9, c.y1 + 1);
    // A un punto de irse.
    ctx.fillStyle = COLOR.hueco;
    ctx.strokeStyle = COLOR.vacio;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, c.y2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = enRiesgo[i] > 0 ? COLOR.tinta : COLOR.vacio;
    ctx.fillText(String(enRiesgo[i]), x + 7, c.y2 + 1);
    const enfadados = sim.quejasPorNivel[i];
    ctx.fillStyle = enfadados > 0 ? COLOR.colaLlena : COLOR.vacio;
    ctx.fillText(`✕${enfadados}`, x + 9 + ctx.measureText(String(enRiesgo[i])).width + 8, c.y2 + 1);
  });
  ctx.restore();
}

/** Botón redondeado con su icono; al pulsarlo se hunde un instante. */
function boton(ctx: CanvasRenderingContext2D, fx: Efectos, nombre: string, r: Rect, activo: boolean, icono: (c: Punto) => void, marcado = false): void {
  const pulsado = 1 - 0.08 * (1 - frenar(fx.progreso(`boton:${nombre}`, 0.18)));
  const c = { x: r.x + r.ancho / 2, y: r.y + r.alto / 2 };
  ctx.save();
  ctx.globalAlpha = activo ? 1 : 0.35;
  ctx.translate(c.x, c.y);
  ctx.scale(pulsado, pulsado);
  ctx.translate(-c.x, -c.y);
  ctx.fillStyle = marcado ? COLOR.tinta : PANEL;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.ancho, r.alto, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = marcado ? COLOR.hueco : COLOR.tinta;
  ctx.strokeStyle = marcado ? COLOR.hueco : COLOR.tinta;
  icono(c);
  ctx.restore();
}

export function iconoDeshacer(ctx: CanvasRenderingContext2D, c: Punto): void {
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c.x + 1, c.y + 2, 8, Math.PI * 1.05, Math.PI * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x - 12, c.y - 5);
  ctx.lineTo(c.x - 4, c.y - 5);
  ctx.lineTo(c.x - 9, c.y + 3);
  ctx.closePath();
  ctx.fill();
}

function iconoSalir(ctx: CanvasRenderingContext2D, c: Punto): void {
  // Volver al menú: una flecha hacia la izquierda.
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x + 3, c.y - 8);
  ctx.lineTo(c.x - 5, c.y);
  ctx.lineTo(c.x + 3, c.y + 8);
  ctx.stroke();
}

export function iconoSonido(ctx: CanvasRenderingContext2D, c: Punto, suena: boolean): void {
  ctx.beginPath();
  ctx.moveTo(c.x - 10, c.y - 4);
  ctx.lineTo(c.x - 5, c.y - 4);
  ctx.lineTo(c.x + 1, c.y - 9);
  ctx.lineTo(c.x + 1, c.y + 9);
  ctx.lineTo(c.x - 5, c.y + 4);
  ctx.lineTo(c.x - 10, c.y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (suena) {
    ctx.arc(c.x + 2, c.y, 6, -0.9, 0.9);
    ctx.moveTo(c.x + 2 + 10 * Math.cos(-0.9), c.y + 10 * Math.sin(-0.9));
    ctx.arc(c.x + 2, c.y, 10, -0.9, 0.9);
  } else {
    ctx.moveTo(c.x + 5, c.y - 5);
    ctx.lineTo(c.x + 12, c.y + 5);
    ctx.moveTo(c.x + 12, c.y - 5);
    ctx.lineTo(c.x + 5, c.y + 5);
  }
  ctx.stroke();
}

function iconoPausa(ctx: CanvasRenderingContext2D, c: Punto, pausado: boolean): void {
  if (pausado) {
    // En pausa, el botón ofrece seguir.
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y - 9);
    ctx.lineTo(c.x + 9, c.y);
    ctx.lineTo(c.x - 6, c.y + 9);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(c.x - 8, c.y - 9, 5.5, 18);
    ctx.fillRect(c.x + 2.5, c.y - 9, 5.5, 18);
  }
}

function iconoVelocidad(ctx: CanvasRenderingContext2D, c: Punto, velocidad: number): void {
  const flechas = velocidad >= 2 ? 2 : 1;
  let x = c.x - 22;
  for (let i = 0; i < flechas; i++) {
    ctx.beginPath();
    ctx.moveTo(x, c.y - 7);
    ctx.lineTo(x + 9, c.y);
    ctx.lineTo(x, c.y + 7);
    ctx.closePath();
    ctx.fill();
    x += 8;
  }
  ctx.font = `700 13px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${velocidad}×`, c.x + 23, c.y + 1);
}

/**
 * Posición del selector de color y de sus cuatro botones, encima del punto
 * dado y dentro de la pantalla. La comparte la entrada para acertar el toque.
 */
export function layoutSelector(punto: Punto, ancho: number, alto: number): { panel: Rect; botones: { color: ColorPista; caja: Rect }[] } {
  const lado = 44;
  const hueco = 8;
  const w = COLORES.length * lado + (COLORES.length + 1) * hueco;
  const h = lado + 2 * hueco;
  const d = disponer(ancho, alto);
  const x = Math.min(Math.max(punto.x - w / 2, 8), ancho - w - 8);
  let y = punto.y - h - 24;
  if (y < d.arriba + 8) y = punto.y + 24;
  y = Math.min(y, alto - h - d.abajo - 4);
  return {
    panel: { x, y, ancho: w, alto: h },
    botones: COLORES.map((color, i) => ({ color, caja: { x: x + hueco + i * (lado + hueco), y: y + hueco, ancho: lado, alto: lado } })),
  };
}

function dibujarSelector(ctx: CanvasRenderingContext2D, juego: Juego, sel: Selector, punto: Punto, ancho: number, alto: number, alfa: number, guia: number | null): void {
  const { panel, botones } = layoutSelector(punto, ancho, alto);
  const cx0 = panel.x + panel.ancho / 2;
  const cy0 = panel.y + panel.alto / 2;
  const escala = 0.85 + 0.15 * rebotar(alfa);
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.translate(cx0, cy0);
  ctx.scale(escala, escala);
  ctx.translate(-cx0, -cy0);
  ctx.fillStyle = 'rgba(241, 243, 244, 0.96)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.ancho, panel.alto, 12);
  ctx.fill();
  ctx.stroke();
  for (const { color, caja } of botones) {
    const f = sel.colores.find((c) => c.color === color)!;
    const factible = f.factible;
    const cx = caja.x + caja.ancho / 2;
    const cy = caja.y + caja.alto / 2;
    ctx.globalAlpha = alfa * (factible ? 1 : 0.22);
    ctx.fillStyle = COLOR_PISTA[color];
    ctx.beginPath();
    ctx.arc(cx, cy, caja.ancho / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    if (preferencias.daltonismo) {
      ctx.fillStyle = COLOR.hueco;
      trazarSimbolo(ctx, COLORES.indexOf(color), cx, cy, 7);
      ctx.fill();
    }
    if (factible && pistaForzada(color, f.p, juego.red.reglas.pista.bandas)) {
      // Borde rojo suave: cabe, pero es forzada (se baja sin divertir).
      ctx.strokeStyle = COLOR.forzada;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, caja.ancho / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (factible && guia !== null) {
      // Guía de la primera partida: los colores que se pueden elegir laten.
      const t = (guia * 1.2) % 1;
      ctx.globalAlpha = alfa * (1 - t) * 0.8;
      ctx.strokeStyle = COLOR.tinta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, caja.ancho / 2 - 2 + t * 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!factible) {
      // Aspa: este color no cabe con la pendiente de esa pareja.
      ctx.globalAlpha = alfa * 0.7;
      ctx.strokeStyle = COLOR.tinta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 9);
      ctx.lineTo(cx + 9, cy + 9);
      ctx.moveTo(cx + 9, cy - 9);
      ctx.lineTo(cx - 9, cy + 9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const NOMBRE_COLOR: Record<ColorPista, string> = { verde: 'Verde', azul: 'Azul', roja: 'Roja', negra: 'Negra' };

/** Etiqueta con los datos de una pista (solo en el modo de ajustes). */
function dibujarInfoPista(ctx: CanvasRenderingContext2D, juego: Juego, punto: Punto, ancho: number): void {
  const p = juego.red.pistas[juego.infoPista!.pista];
  const lineas = [
    `${NOMBRE_COLOR[p.color]}${p.fueraDeRango ? ' (fuera de rango)' : ''}${juego.red.forzada(p) ? ' · forzada' : ''}`,
    `dificultad efectiva: ${NOMBRE_COLOR[COLORES[juego.red.dificultad(p)]]}`,
    `s = ${coma(p.s, 2)} · pendiente ${coma(p.pendiente * 100, 1)} %`,
  ];
  if (p.compartido) lineas.push(`comparte ${Math.round(p.compartido.fin - p.compartido.inicio)} m`);
  ctx.save();
  ctx.font = `13px ${FUENTE}`;
  const w = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 20;
  const h = lineas.length * 18 + 12;
  const x = Math.min(Math.max(punto.x - w / 2, 8), ancho - w - 8);
  const y = Math.max(punto.y - h - 16, 70);
  ctx.fillStyle = 'rgba(241, 243, 244, 0.96)';
  ctx.strokeStyle = COLOR_PISTA[p.color];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.tinta;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lineas.forEach((l, i) => ctx.fillText(l, x + 10, y + 8 + i * 18));
  ctx.restore();
}

function partirTexto(ctx: CanvasRenderingContext2D, texto: string, max: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const p of texto.split(' ')) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > max && actual) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Panel de la pregunta de mejora y sus dos botones, encima de los contadores. */
export function layoutMejora(ancho: number, alto: number): { panel: Rect; si: Rect; no: Rect } {
  const d = disponer(ancho, alto);
  const w = Math.min(ancho - 32, 340);
  const h = 120;
  const panel = { x: ancho / 2 - w / 2, y: Math.max(d.arriba + 8, alto - d.abajo - h - 12), ancho: w, alto: h };
  const bw = (w - 16 * 3) / 2;
  const by = panel.y + h - 44 - 14;
  return {
    panel,
    si: { x: panel.x + 16, y: by, ancho: bw, alto: 44 },
    no: { x: panel.x + 32 + bw, y: by, ancho: bw, alto: 44 },
  };
}

function botonTexto(ctx: CanvasRenderingContext2D, b: Rect, texto: string, activo = true, principal = false): void {
  ctx.save();
  ctx.globalAlpha *= activo ? 1 : 0.45;
  ctx.fillStyle = principal ? COLOR.tinta : COLOR.hueco;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.ancho, b.alto, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = principal ? COLOR.hueco : COLOR.tinta;
  ctx.font = `700 14px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, b.x + b.ancho / 2, b.y + b.alto / 2 + 1);
  ctx.restore();
}

function dibujarMejora(ctx: CanvasRenderingContext2D, m: { texto: string; alcanza: boolean }, _d: Disposicion, ancho: number, alto: number, alfa: number): void {
  const { panel, si, no } = layoutMejora(ancho, alto);
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.translate(0, (1 - frenar(alfa)) * 16);
  ctx.fillStyle = 'rgba(241, 243, 244, 0.96)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.ancho, panel.alto, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.tinta;
  ctx.font = `14px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  partirTexto(ctx, m.texto, panel.ancho - 24).forEach((l, i) => ctx.fillText(l, panel.x + panel.ancho / 2, panel.y + 22 + i * 19));
  botonTexto(ctx, si, m.alcanza ? 'Mejorar' : 'Faltan monedas', m.alcanza, true);
  botonTexto(ctx, no, 'Cancelar');
  ctx.restore();
}

function dibujarAviso(ctx: CanvasRenderingContext2D, texto: string, d: Disposicion, ancho: number, alfa: number): void {
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.font = `600 13px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineas = partirTexto(ctx, texto, Math.min(ancho - 48, 440));
  const w = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 28;
  const h = lineas.length * 18 + 14;
  const y = d.arriba + 10 - (1 - frenar(alfa)) * 10;
  ctx.fillStyle = 'rgba(38, 42, 49, 0.9)';
  ctx.beginPath();
  ctx.roundRect(ancho / 2 - w / 2, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = COLOR.hueco;
  lineas.forEach((l, i) => ctx.fillText(l, ancho / 2, y + 16 + i * 18));
  ctx.restore();
}

// ---- Fin de partida ----

/** Un reto del nivel, con si se ha conseguido en esta partida. */
export interface RetoMostrado {
  texto: string;
  conseguido: boolean;
  /** Ya estaba conseguido en una partida anterior. */
  antes?: boolean;
}

export interface DatosFin {
  retos: RetoMostrado[];
  /** Récord anterior del nivel en días, o null si no había. */
  recordAnterior: number | null;
  esRecord: boolean;
}

/** Panel del fin de partida: abajo en vertical, a la derecha en horizontal, para que se vea la red. */
export function layoutFin(ancho: number, alto: number, retos: number): { panel: Rect; repetir: Rect; menu: Rect } {
  const horizontal = ancho > alto;
  const w = Math.min(ancho - 24, horizontal ? 340 : 400);
  const h = Math.min(alto - 24, 174 + retos * 26 + (retos > 0 ? 10 : 0));
  const x = horizontal ? ancho - w - 16 : ancho / 2 - w / 2;
  const y = horizontal ? Math.max(12, alto / 2 - h / 2) : alto - h - 16;
  const bw = (w - 16 * 3) / 2;
  const by = y + h - 44 - 16;
  return {
    panel: { x, y, ancho: w, alto: h },
    repetir: { x: x + 16, y: by, ancho: bw, alto: 44 },
    menu: { x: x + 32 + bw, y: by, ancho: bw, alto: 44 },
  };
}

/**
 * Fin de partida: la red entera oscurecida de fondo, el punto donde más
 * esquiadores se han ido enfadados resaltado (cuello de botella) y un panel
 * con los días sobrevividos, los satisfechos, los retos y los botones.
 */
export function dibujarFin(
  ctx: CanvasRenderingContext2D,
  juego: Juego,
  fx: Efectos,
  datos: DatosFin,
  aPantalla: (p: Punto) => Punto,
  ancho: number,
  alto: number,
  alfa: number,
): void {
  const { sim, red } = juego;
  ctx.save();
  ctx.fillStyle = `rgba(28, 32, 40, ${0.38 * alfa})`;
  ctx.fillRect(0, 0, ancho, alto);
  const cuello = sim.cuelloDeBotella();
  if (cuello !== null) {
    const c = aPantalla(cuello >= 0 && red.nodos[cuello] ? red.nodo(cuello) : juego.plaza);
    const pulso = 0.5 + 0.5 * Math.sin(fx.ahora * 3);
    ctx.globalAlpha = alfa;
    ctx.strokeStyle = COLOR.colaLlena;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIO_NODO + 10 + 7 * pulso, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alfa * 0.25;
    ctx.fillStyle = COLOR.colaLlena;
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIO_NODO + 10 + 7 * pulso, 0, Math.PI * 2);
    ctx.fill();
  }
  const { panel, repetir, menu } = layoutFin(ancho, alto, datos.retos.length);
  ctx.globalAlpha = alfa;
  ctx.translate(0, (1 - frenar(alfa)) * 40);
  ctx.fillStyle = 'rgba(241, 243, 244, 0.97)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.ancho, panel.alto, 16);
  ctx.fill();
  ctx.stroke();
  const cx = panel.x + panel.ancho / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(38, 42, 49, 0.7)';
  ctx.font = `600 12px ${FUENTE}`;
  ctx.fillText('FIN DE LA TEMPORADA', cx, panel.y + 22);
  const dias = Math.floor(juego.diasSobrevividos);
  ctx.fillStyle = COLOR.tinta;
  ctx.font = `800 30px ${FUENTE}`;
  ctx.fillText(`${dias} ${dias === 1 ? 'día' : 'días'}`, cx, panel.y + 52);
  ctx.font = `600 12px ${FUENTE}`;
  ctx.fillStyle = datos.esRecord ? '#8a5a00' : 'rgba(38, 42, 49, 0.7)';
  ctx.fillText(datos.esRecord ? 'Nuevo récord' : datos.recordAnterior !== null ? `Récord: ${datos.recordAnterior} ${datos.recordAnterior === 1 ? 'día' : 'días'}` : 'sobrevividos', cx, panel.y + 76);
  ctx.fillStyle = COLOR.tinta;
  ctx.font = `600 13px ${FUENTE}`;
  ctx.fillText(`${sim.cansados} satisfechos  ·  ${sim.enfadados} enfadados`, cx, panel.y + 100);
  // Retos del nivel.
  let y = panel.y + 128;
  ctx.textAlign = 'left';
  for (const r of datos.retos) {
    const x = panel.x + 28;
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.tinta;
    ctx.fillStyle = r.conseguido ? COLOR.tinta : 'transparent';
    ctx.globalAlpha = alfa * (r.conseguido || r.antes ? 1 : 0.55);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    if (r.conseguido) ctx.fill();
    ctx.stroke();
    if (r.conseguido || r.antes) {
      ctx.strokeStyle = r.conseguido ? COLOR.hueco : COLOR.tinta;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y + 0.5);
      ctx.lineTo(x - 1, y + 3);
      ctx.lineTo(x + 4, y - 3);
      ctx.stroke();
    }
    ctx.fillStyle = COLOR.tinta;
    ctx.font = `${r.conseguido ? 700 : 500} 13px ${FUENTE}`;
    ctx.fillText(r.texto, x + 16, y + 1);
    y += 26;
  }
  ctx.globalAlpha = alfa;
  botonTexto(ctx, repetir, 'Repetir', true, true);
  botonTexto(ctx, menu, 'Menú');
  ctx.restore();
}

/** Para las pruebas de disposición: todos los rectángulos tocables de la partida. */
export function zonasTocables(ancho: number, alto: number): Rect[] {
  return Object.values(disponer(ancho, alto).botones);
}

export { limitar01 };
