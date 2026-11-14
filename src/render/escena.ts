// Dibujo de la escena en Canvas 2D. Tamaños en px CSS, posiciones en metros
// convertidas con la cámara.
import { CONFIG } from '../config';
import { COLORES, pistaForzada, type ColorPista } from '../core/colores';
import type { Perfil } from '../core/simulacion';
import { desplazamientoPista as calcularDesplazamiento } from '../core/desplazamiento';
import type { Polilinea } from '../core/polilinea';
import type { Estacion, Pista, TipoEstacion } from '../core/red';
import { interpolar, type Punto } from '../core/vector';
import type { Juego } from '../juego';
import type { Camara } from './camara';
import { vistaPunto } from '../core/visibilidad';
import { COLOR_FONDO } from './terreno';

const COLOR = {
  tinta: '#262a31',
  remonteParado: '#8b9298',
  hueco: '#f1f3f4',
  proyecto: 'rgba(38, 42, 49, 0.6)',
  esquiador: '#262a31',
  plaza: 'rgba(240, 236, 226, 0.75)',
  carretera: 'rgba(128, 132, 136, 0.55)',
  valido: '#2f9e6a',
  invalido: '#b9473b',
  forzada: '#e8908a', // borde rojo suave del selector: color empinado para su nivel
  colaVacia: '#8b9298',
  colaLlena: '#d0453a',
  vacio: '#8b9298', // punto aún sin usar
};

export const COLOR_PISTA: Record<ColorPista, string> = {
  verde: '#3e9b5b',
  azul: '#2f6fc0',
  roja: '#d24a3c',
  negra: '#1d2026',
};

const RADIO_NODO = 9;
/** Radio de un punto aún sin usar: más pequeño que una estación. */
const RADIO_VACIO = 5.5;
/** Segundos que dura el destello rojo de un esquiador que se va enfadado. */
const DURACION_DESTELLO = 0.8;
const RADIO_PUNTO = 2.2;

export function dibujar(ctx: CanvasRenderingContext2D, juego: Juego, camara: Camara, terreno: HTMLCanvasElement, ancho: number, alto: number): void {
  const { red, sim } = juego;
  const P = (p: Punto) => camara.aPantalla(p);
  // Desplazamiento en pantalla de cada pista hacia sus estaciones de salida y
  // llegada (puntos desdoblados), calculado una vez por fotograma.
  const despPorPista = new Map<number, (s: number) => Punto>();
  const desplazamientoPista = (p: Pista): ((s: number) => Punto) => {
    let f = despPorPista.get(p.id);
    if (!f) {
      f = calcularDesplazamiento(red, p, {
        separacionPx: CONFIG.estaciones.separacionPx,
        tramoEstacion: CONFIG.pista.tramoEstacion,
        radioAcuerdo: red.reglas.pista.radioAcuerdo,
      });
      despPorPista.set(p.id, f);
    }
    return f;
  };
  // Posición en pantalla de una estación: su nodo más el desplazamiento en la
  // fila, en píxeles, para que queden pegadas en cualquier pantalla.
  const PE = (e: Pick<Estacion, 'nodo' | 'ox' | 'oy'>) => {
    const c = P(red.nodo(e.nodo));
    const sep = CONFIG.estaciones.separacionPx;
    return { x: c.x + e.ox * sep, y: c.y + e.oy * sep };
  };

  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, ancho, alto);
  const esquina = P({ x: 0, y: 0 });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const wT = juego.mapa.datos.ancho * camara.escala;
  const hT = juego.mapa.datos.alto * camara.escala;
  ctx.drawImage(terreno, esquina.x, esquina.y, wT, hT);
  // En pantallas más alargadas que el mundo se prolongan la primera y la última
  // fila del terreno para que no queden bandas planas.
  if (esquina.y > 0) {
    ctx.drawImage(terreno, 0, 0, terreno.width, 1, esquina.x, 0, wT, esquina.y + 1);
    ctx.drawImage(terreno, 0, terreno.height - 1, terreno.width, 1, esquina.x, esquina.y + hT - 1, wT, alto - esquina.y - hT + 1);
  }

  // Carretera de acceso y plaza del pie de pistas.
  ctx.save();
  ctx.strokeStyle = COLOR.carretera;
  ctx.lineWidth = Math.max(3, 26 * camara.escala);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  juego.carretera.forEach((p, i) => {
    const q = P(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.restore();
  const plaza = P(juego.plaza);
  ctx.fillStyle = COLOR.plaza;
  ctx.beginPath();
  ctx.arc(plaza.x, plaza.y, juego.plaza.radio * camara.escala, 0, Math.PI * 2);
  ctx.fill();

  // Pistas.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // El tramo compartido de una confluencia lo dibuja la pista a la que se une.
  // Una pista en espera (su destino aún no tiene salida) se ve a trazos, con
  // su color y más tenue; una cuyo color ya no cabe con los parámetros del
  // panel de ajustes, a trazos cortos.
  const activas = red.pistasActivas();
  for (const p of red.pistas) {
    const espera = !activas.has(p.id);
    if (espera) ctx.setLineDash([9, 7]);
    else if (p.fueraDeRango) ctx.setLineDash([3, 4]);
    ctx.globalAlpha = espera ? 0.7 : 1;
    dibujarTrazado(ctx, p.trazado, P, COLOR_PISTA[p.color], 3, p.compartido, desplazamientoPista(p));
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  // Pista por abrir con el selector de color abierto: su trazado previsto, a trazos.
  if (juego.selector) {
    ctx.setLineDash([6, 6]);
    dibujarTrazado(ctx, juego.trazadoProyecto(juego.selector.proyecto).trazado, P, COLOR.proyecto, 4);
    ctx.setLineDash([]);
  }

  // Remontes con sus bolitas.
  for (const r of red.remontes) {
    const enServicio = red.enServicio(r);
    const a = PE(red.estaciones[r.estacionDesde]);
    const b2 = PE(red.estaciones[r.estacionHasta]);
    dibujarRemonte(ctx, a, b2, enServicio ? COLOR.tinta : COLOR.remonteParado);
    for (const b of sim.bolitas[r.id] ?? []) {
      const q = interpolar(a, b2, b.recorrido / r.longitud);
      ctx.fillStyle = COLOR.hueco;
      ctx.strokeStyle = COLOR.tinta;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (b.pasajeros.length > 0) {
        ctx.fillStyle = colorEsquiador(sim.perfiles.get(b.pasajeros[0]));
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Vista previa del arrastre.
  const arr = juego.arrastre;
  if (arr) dibujarArrastre(ctx, juego, P, PE);

  // Puntos. Solo se ve lo útil en cada momento (las reglas no cambian):
  // - siempre, con su cota: los puntos en uso (con estaciones) y los de la plaza;
  // - un puntito gris, sin cota: donde ya se puede arrancar un remonte con
  //   algún destino válido;
  // - mientras se arrastra, con su cota: los destinos posibles (más altos para
  //   un remonte, más bajos para una pista), válidos marcados y el resto
  //   atenuados. El que está bajo el dedo, con su evaluación completa;
  // - el resto, nada. En ?ajustes (editor de mapas) se ven todos, con su tipo.
  for (const n of red.nodos) {
    const vista = vistaPunto(red, n.id, arr?.movido ? arr : null, juego.modoAjustes);
    if (vista.tipo === 'oculto') continue;
    const marca = vista.marca;
    const posiciones = red.estacionesDe(n.id).map((e) => ({ e, c: PE(e) }));
    const vacio = posiciones.length === 0;
    // Un punto con estaciones está en uso (también una base nueva en media
    // ladera, a la que aún no llega ningún remonte): se dibuja pleno.
    const activo = red.activo(n.id) || !vacio;
    if (vacio) dibujarPuntoVacio(ctx, P(n), marca, red.puedeArrancar(n.id));
    // Un punto desdoblado es un solo lugar para los esquiadores (quien llega
    // por cualquier triángulo baja por cualquier pista): sus estaciones van
    // dentro de una misma cápsula para que se lea así.
    if (posiciones.length > 1) dibujarCapsula(ctx, posiciones.map((p) => p.c), opacidad(activo, marca));
    for (const { e, c } of posiciones) dibujarEstacion(ctx, e.tipo, c, activo, marca);
    const derecha = vacio ? { c: P(n) } : posiciones.reduce((m, p) => (p.c.x > m.c.x ? p : m));
    const radio = vacio ? RADIO_VACIO : RADIO_NODO;
    ctx.save();
    ctx.globalAlpha = vacio ? (marca === 'invalido' ? 0.45 : 1) : opacidad(activo, marca);
    ctx.fillStyle = vacio ? COLOR.vacio : COLOR.tinta;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // En el modo de ajustes, el tipo oculto del punto (para el editor de mapas).
    const tipo = juego.modoAjustes && vacio ? ` ${n.tipo === 'base' ? 'B' : n.tipo === 'cima' ? 'C' : 'I'}` : '';
    ctx.fillText(`${n.cota}${tipo}`, derecha.c.x + radio + 4, derecha.c.y - radio - 2);
    ctx.restore();
  }


  // Editor del mapa de pruebas: el punto que se arrastra, con la cota que
  // tendría ahí, en verde si se puede soltar y en rojo si no.
  const an = juego.arrastreNodo;
  if (an) {
    const c = P(an.punto);
    const o = P(red.nodo(an.id));
    const color = an.valido ? COLOR.valido : COLOR.invalido;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIO_NODO + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(juego.alturas.cotaEn(an.punto))), c.x + RADIO_NODO + 6, c.y - RADIO_NODO - 4);
    ctx.restore();
  }

  // Anillo de cola en la estación de salida de cada remonte: se llena cuando
  // la cola pasa del aforo y pasa del gris al rojo, como el temporizador de
  // las estaciones de Mini Metro. Lleno, echa al último de la cola.
  for (const r of red.remontes) {
    const f = sim.anillos[r.id] ?? 0;
    if (f > 0 || (sim.colas[r.id]?.length ?? 0) > sim.p.aforoCola) dibujarAnilloCola(ctx, PE(red.estaciones[r.estacionDesde]), f);
  }

  // Destello rojo donde se acaba de ir un esquiador enfadado.
  for (const m of sim.marchasEnfadadas) {
    const t = (sim.tiempo - m.tiempo) / DURACION_DESTELLO;
    if (t < 0 || t > 1) continue;
    const c = P(m.nodo >= 0 ? red.nodo(m.nodo) : juego.plaza);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = COLOR.colaLlena;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIO_NODO + 4 + t * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Esquiadores: en cola alrededor del nodo, andando por la plaza y bajando.
  // Siempre del color de su nivel (el contento no cambia el color).
  // Cada cola se agrupa alrededor de la estación de salida de su remonte.
  const porEstacion = new Map<number, number>();
  const puntoEnRacimo = (estacion: number) => {
    const i = porEstacion.get(estacion) ?? 0;
    porEstacion.set(estacion, i + 1);
    // Espiral compacta alrededor del símbolo.
    const anillo = Math.floor(i / 12);
    const ang = (i % 12) * ((Math.PI * 2) / 12) + anillo * 0.26;
    const rad = RADIO_NODO + 6 + anillo * 5;
    const c = PE(red.estaciones[estacion]);
    return { x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad };
  };
  for (const e of sim.esquiadores.values()) {
    let q: Punto | null = null;
    switch (e.estado) {
      case 'cola':
        q = puntoEnRacimo(red.remontes[e.remonte].estacionDesde);
        break;
      case 'carretera':
        if (sim.carretera) q = P(sim.carretera.puntoEn(e.recorrido));
        break;
      case 'andando':
        q = P(interpolar(e.origen, red.nodo(e.hacia), Math.min(e.recorrido / e.largo, 1)));
        break;
      case 'pista':
        {
          // Sobre la misma curva desplazada hacia las estaciones que se dibuja.
          const pi = red.pistas[e.pista];
          const base = P(pi.trazado.puntoEn(e.recorrido));
          const d = desplazamientoPista(pi)(e.recorrido);
          q = { x: base.x + d.x, y: base.y + d.y };
        }
        break;
      case 'remonte':
        break; // va dentro de su bolita
    }
    if (!q) continue;
    ctx.fillStyle = colorEsquiador(sim.perfiles.get(e.id));
    ctx.beginPath();
    ctx.arc(q.x, q.y, RADIO_PUNTO, 0, Math.PI * 2);
    ctx.fill();
  }

  if (juego.selector) dibujarSelector(ctx, juego, P(juego.selector.punto), ancho, alto);
  if (juego.infoPista && red.pistas[juego.infoPista.pista]) dibujarInfoPista(ctx, juego, P(juego.infoPista.punto), ancho);
  dibujarTextos(ctx, juego, ancho);
  dibujarContadores(ctx, juego, ancho, alto);
  dibujarBotonVelocidad(ctx, juego, ancho, alto);
  dibujarBotonDeshacer(ctx, juego, alto);

  // Versión, pequeña y discreta, centrada abajo entre los dos botones.
  ctx.fillStyle = 'rgba(38, 42, 49, 0.55)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(__VERSION__, ancho / 2, alto - 8);
}

type Rect = { x: number; y: number; ancho: number; alto: number };

/** Botón de deshacer en la esquina inferior izquierda. */
export function rectBotonDeshacer(alto: number): Rect {
  return { x: 12, y: alto - 44 - 16, ancho: 110, alto: 44 };
}

function dibujarBotonDeshacer(ctx: CanvasRenderingContext2D, juego: Juego, alto: number): void {
  const b = rectBotonDeshacer(alto);
  ctx.save();
  ctx.globalAlpha = juego.red.puedeDeshacer ? 1 : 0.35;
  ctx.fillStyle = 'rgba(241, 243, 244, 0.9)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.ancho, b.alto, 10);
  ctx.fill();
  ctx.stroke();
  // Flecha curva hacia atrás.
  const cx = b.x + 22;
  const cy = b.y + b.alto / 2 + 2;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, Math.PI * 1.15, Math.PI * 2.1);
  ctx.stroke();
  ctx.fillStyle = COLOR.tinta;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - 5);
  ctx.lineTo(cx - 3, cy - 7);
  ctx.lineTo(cx - 8, cy + 1);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Deshacer', b.x + 38, b.y + b.alto / 2 + 1);
  ctx.restore();
}

/** Botón de velocidad en la esquina inferior derecha, con tamaño cómodo para el dedo. */
export function rectBotonVelocidad(ancho: number, alto: number): { x: number; y: number; ancho: number; alto: number } {
  const w = 64;
  const h = 44;
  return { x: ancho - w - 12, y: alto - h - 16, ancho: w, alto: h };
}

function dibujarBotonVelocidad(ctx: CanvasRenderingContext2D, juego: Juego, ancho: number, alto: number): void {
  const b = rectBotonVelocidad(ancho, alto);
  ctx.fillStyle = 'rgba(241, 243, 244, 0.9)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.ancho, b.alto, 10);
  ctx.fill();
  ctx.stroke();
  // Tantos triángulos como el multiplicador (1, 2 o 3 para 4×) y el número.
  const flechas = juego.velocidad === 4 ? 3 : juego.velocidad;
  const cy = b.y + b.alto / 2;
  ctx.fillStyle = COLOR.tinta;
  let x = b.x + 12;
  for (let i = 0; i < flechas; i++) {
    ctx.beginPath();
    ctx.moveTo(x, cy - 7);
    ctx.lineTo(x + 9, cy);
    ctx.lineTo(x, cy + 7);
    ctx.closePath();
    ctx.fill();
    x += 8;
  }
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${juego.velocidad}×`, b.x + b.ancho - 9, cy + 1);
}

function dibujarTrazado(
  ctx: CanvasRenderingContext2D,
  trazado: Polilinea,
  P: (p: Punto) => Punto,
  color: string,
  grosor: number,
  compartido: { inicio: number; fin: number } | null = null,
  desplazar?: (s: number) => Punto,
): void {
  // La pista empieza y acaba algo separada del nodo para que se lea mejor.
  const L = trazado.longitud;
  const sep = Math.min(CONFIG.pista.separacionNodo, L * 0.2);
  const tramos: [number, number][] = compartido
    ? [
        [sep, compartido.inicio],
        [compartido.fin, L - sep],
      ]
    : [[sep, L - sep]];
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  for (const [a, b] of tramos) {
    if (b <= a) continue;
    const tramo = puntosConLongitud(trazado, a, b).map(({ p, s }) => {
      const q = P(p);
      if (!desplazar) return q;
      const d = desplazar(s);
      return { x: q.x + d.x, y: q.y + d.y };
    });
    ctx.beginPath();
    ctx.moveTo(tramo[0].x, tramo[0].y);
    for (let i = 1; i < tramo.length; i++) ctx.lineTo(tramo[i].x, tramo[i].y);
    ctx.stroke();
  }
}

/** Puntos de la polilínea entre las longitudes a y b, con su longitud recorrida. */
function puntosConLongitud(l: Polilinea, a: number, b: number): { p: Punto; s: number }[] {
  const r = [{ p: l.puntoEn(a), s: a }];
  for (let i = 0; i < l.puntos.length; i++) if (l.acumulada[i] > a && l.acumulada[i] < b) r.push({ p: l.puntos[i], s: l.acumulada[i] });
  r.push({ p: l.puntoEn(b), s: b });
  return r;
}

/** Línea doble: gruesa del color de tinta con otra fina clara encima. */
function dibujarRemonte(ctx: CanvasRenderingContext2D, a: Punto, b: Punto, color: string): void {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = COLOR.hueco;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineCap = 'round';
}

function dibujarArrastre(
  ctx: CanvasRenderingContext2D,
  juego: Juego,
  P: (p: Punto) => Punto,
  PE: (e: Pick<Estacion, 'nodo' | 'ox' | 'oy'>) => Punto,
): void {
  const arr = juego.arrastre!;
  if (!arr.movido) return;
  const red = juego.red;
  const obj = arr.objetivo;
  if (obj && obj.tipo === 'pista') {
    // Pista: su trazado previsto a trazos si cabe; si no, una recta roja.
    const e = juego.evaluarPista(arr.origen, obj.nodo);
    if (e.motivo === 'ok') {
      ctx.setLineDash([6, 6]);
      dibujarTrazado(ctx, juego.trazadoProyecto(e.proyecto).trazado, P, COLOR.proyecto, 3);
      ctx.setLineDash([]);
      return;
    }
  } else if (obj && obj.motivo === 'ok') {
    // Estaciones que usaría el remonte; las nuevas se ven ya en su sitio.
    const ed = red.planearEstacion(arr.origen, 'salida', obj.nodo)!;
    const eh = red.planearEstacion(obj.nodo, 'llegada', arr.origen)!;
    const pos = (p: typeof ed) => ('id' in p ? red.estaciones[p.id] : p.nueva);
    dibujarRemonte(ctx, PE(pos(ed)), PE(pos(eh)), COLOR.tinta);
    for (const p of [ed, eh]) if ('nueva' in p) dibujarEstacion(ctx, p.nueva.tipo, PE(p.nueva), true, 'valido');
    return;
  }
  const a = P(red.nodo(arr.origen));
  const b = obj ? P(red.nodo(obj.nodo)) : P(arr.puntero);
  ctx.strokeStyle = obj ? COLOR.invalido : 'rgba(38, 42, 49, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

type Marca = 'valido' | 'espera' | 'invalido' | null;

function opacidad(activo: boolean, marca: Marca): number {
  return activo || marca === 'valido' || marca === 'espera' ? 1 : marca === 'invalido' ? 0.2 : 0.4;
}

/**
 * Aro de destino durante el arrastre: continuo si es un destino normal,
 * discontinuo si la pista quedaría en espera (el destino aún no tiene salida).
 */
function dibujarAroDestino(ctx: CanvasRenderingContext2D, c: Punto, radio: number, marca: Marca): void {
  if (marca !== 'valido' && marca !== 'espera') return;
  ctx.save();
  ctx.strokeStyle = COLOR.valido;
  ctx.lineWidth = 2.5;
  if (marca === 'espera') ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, radio, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Punto aún sin usar: círculo gris pequeño. Si ya se puede arrancar un
 * remonte en él (los de la plaza, o una futura base con una pista en espera),
 * el borde es oscuro.
 */
function dibujarPuntoVacio(ctx: CanvasRenderingContext2D, c: Punto, marca: Marca, arrancable: boolean): void {
  ctx.save();
  dibujarAroDestino(ctx, c, RADIO_VACIO + 7, marca);
  ctx.globalAlpha = marca === 'invalido' ? 0.4 : 1;
  ctx.fillStyle = COLOR.hueco;
  ctx.strokeStyle = arrancable ? COLOR.tinta : COLOR.vacio;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, RADIO_VACIO, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Cápsula que une las estaciones de un punto desdoblado (están en fila): un
 * trazo grueso entre las dos de los extremos, con borde, detrás de los símbolos.
 */
function dibujarCapsula(ctx: CanvasRenderingContext2D, centros: Punto[], alfa: number): void {
  let a = centros[0];
  let b = centros[1];
  for (const p of centros) {
    for (const q of centros) {
      if (Math.hypot(p.x - q.x, p.y - q.y) > Math.hypot(a.x - b.x, a.y - b.y)) {
        a = p;
        b = q;
      }
    }
  }
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2 * RADIO_NODO + 10;
  ctx.stroke();
  ctx.strokeStyle = COLOR.hueco;
  ctx.lineWidth = 2 * RADIO_NODO + 6;
  ctx.stroke();
  ctx.restore();
}

/** Símbolo según el tipo de estación: círculo sale, triángulo llega. */
function dibujarEstacion(ctx: CanvasRenderingContext2D, tipo: TipoEstacion, c: Punto, activo: boolean, marca: Marca): void {
  ctx.save();
  ctx.globalAlpha = opacidad(activo, marca);
  dibujarAroDestino(ctx, c, RADIO_NODO + 7, marca);
  ctx.fillStyle = COLOR.hueco;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const r = RADIO_NODO;
  if (tipo === 'salida') ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  else {
    ctx.moveTo(c.x, c.y - r * 1.15);
    ctx.lineTo(c.x + r * 1.05, c.y + r * 0.7);
    ctx.lineTo(c.x - r * 1.05, c.y + r * 0.7);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function dibujarTextos(ctx: CanvasRenderingContext2D, juego: Juego, ancho: number): void {
  const lineas = [juego.ayuda()];
  if (juego.mensaje && performance.now() < juego.mensaje.hasta) lineas.push(juego.mensaje.texto);
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = 12;
  for (const [i, t] of lineas.entries()) {
    const partes = partirTexto(ctx, t, Math.min(ancho - 32, 520));
    for (const p of partes) {
      const w = ctx.measureText(p).width;
      ctx.fillStyle = 'rgba(241, 243, 244, 0.85)';
      ctx.fillRect(ancho / 2 - w / 2 - 8, y - 3, w + 16, 21);
      ctx.fillStyle = i === 0 ? COLOR.tinta : COLOR.invalido;
      ctx.fillText(p, ancho / 2, y);
      y += 21;
    }
    y += 4;
  }
}

function partirTexto(ctx: CanvasRenderingContext2D, texto: string, max: number): string[] {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > max && actual) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}


type Caja = { x: number; y: number; ancho: number; alto: number };

/**
 * Posición del selector de color y de sus cuatro botones, encima del punto
 * tocado y dentro de la pantalla. La comparte la entrada para acertar el toque.
 */
export function layoutSelector(punto: Punto, ancho: number, alto: number): { panel: Caja; botones: { color: ColorPista; caja: Caja }[] } {
  const lado = 44;
  const hueco = 8;
  const w = COLORES.length * lado + (COLORES.length + 1) * hueco;
  const h = lado + 2 * hueco;
  const x = Math.min(Math.max(punto.x - w / 2, 8), ancho - w - 8);
  let y = punto.y - h - 24;
  if (y < 70) y = punto.y + 24;
  y = Math.min(y, alto - h - 70);
  return {
    panel: { x, y, ancho: w, alto: h },
    botones: COLORES.map((color, i) => ({ color, caja: { x: x + hueco + i * (lado + hueco), y: y + hueco, ancho: lado, alto: lado } })),
  };
}

function dibujarSelector(ctx: CanvasRenderingContext2D, juego: Juego, punto: Punto, ancho: number, alto: number): void {
  const sel = juego.selector!;
  const { panel, botones } = layoutSelector(punto, ancho, alto);
  ctx.save();
  ctx.fillStyle = 'rgba(241, 243, 244, 0.96)';
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.ancho, panel.alto, 12);
  ctx.fill();
  ctx.stroke();
  for (const { color, caja } of botones) {
    const factible = sel.colores.find((c) => c.color === color)!.factible;
    const cx = caja.x + caja.ancho / 2;
    const cy = caja.y + caja.alto / 2;
    ctx.globalAlpha = factible ? 1 : 0.22;
    ctx.fillStyle = COLOR_PISTA[color];
    ctx.beginPath();
    ctx.arc(cx, cy, caja.ancho / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    const f = sel.colores.find((c) => c.color === color)!;
    if (factible && pistaForzada(color, f.p, juego.red.reglas.pista.bandas)) {
      // Borde rojo suave: cabe, pero es empinada para su color y los
      // esquiadores de ese nivel se divertirán menos en ella.
      ctx.strokeStyle = COLOR.forzada;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, caja.ancho / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!factible) {
      // Aspa: este color no cabe con la pendiente de esa pareja.
      ctx.globalAlpha = 0.7;
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
  const coma = (x: number, d: number) => x.toFixed(d).replace('.', ',');
  const lineas = [
    `${NOMBRE_COLOR[p.color]}${p.fueraDeRango ? ' (fuera de rango)' : ''}${juego.red.forzada(p) ? ' · forzada' : ''}`,
    `dificultad efectiva: ${NOMBRE_COLOR[COLORES[juego.red.dificultad(p)]]}`,
    `s = ${coma(p.s, 2)} · pendiente ${coma(p.pendiente * 100, 1)} %`,
  ];
  if (p.compartido) lineas.push(`comparte ${Math.round(p.compartido.fin - p.compartido.inicio)} m`);
  ctx.save();
  ctx.font = '13px system-ui, sans-serif';
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

/** Mezcla dos colores hex: t = 0 da el primero, t = 1 el segundo. */
function mezclar(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

/** Color de un esquiador: el de su nivel (la especificación descarta cambiarlo con el contento). */
function colorEsquiador(perfil: Perfil | undefined): string {
  return perfil ? COLOR_PISTA[COLORES[perfil.nivel]] : COLOR.esquiador;
}

/**
 * Contadores por nivel, abajo en el centro, justo encima de los botones (entre
 * ellos no caben en un móvil estrecho). Una columna por color:
 * - arriba, un punto del color y cuántos de ese nivel hay en la estación;
 * - debajo, el contento medio de los presentes de ese nivel, como una barra
 *   de 3 segmentos (uno por punto de contento), y cuántos de ese nivel se han
 *   ido enfadados (✕, en rojo si hay alguno).
 */
function dibujarContadores(ctx: CanvasRenderingContext2D, juego: Juego, ancho: number, alto: number): void {
  const { sim } = juego;
  const n = sim.porNivel();
  const contento = sim.contentoMedioPorNivel();
  const tope = sim.p.contentoInicial;
  const paso = 76;
  const x0 = ancho / 2 - (paso * (n.length - 1)) / 2 - 22;
  const y1 = alto - 92;
  const y2 = alto - 74;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  n.forEach((v, i) => {
    const x = x0 + i * paso;
    const color = COLOR_PISTA[COLORES[i]];
    ctx.fillStyle = color;
    ctx.strokeStyle = COLOR.hueco;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = COLOR.tinta;
    ctx.fillText(String(v), x + 9, y1 + 1);
    // Contento medio: segmentos llenos en proporción (vacíos si no hay nadie).
    const seg = 7;
    const hueco = 2;
    const c = contento[i];
    for (let k = 0; k < tope; k++) {
      const sx = x - 5 + k * (seg + hueco);
      ctx.fillStyle = 'rgba(38, 42, 49, 0.15)';
      ctx.fillRect(sx, y2 - 2.5, seg, 5);
      const lleno = c === null ? 0 : Math.min(1, Math.max(0, c - k));
      if (lleno > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(sx, y2 - 2.5, seg * lleno, 5);
      }
    }
    const enfadados = sim.quejasPorNivel[i];
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = enfadados > 0 ? COLOR.colaLlena : COLOR.vacio;
    ctx.fillText(`✕${enfadados}`, x - 5 + tope * (seg + hueco) + 3, y2 + 1);
  });
  ctx.restore();
}

/** Anillo de cola alrededor de una estación: arco lleno en la fracción dada. */
function dibujarAnilloCola(ctx: CanvasRenderingContext2D, c: Punto, fraccion: number): void {
  const f = Math.min(1, Math.max(0, fraccion));
  const r = RADIO_NODO + 4;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(38, 42, 49, 0.15)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = mezclar(COLOR.colaVacia, COLOR.colaLlena, f);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
