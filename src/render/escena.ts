// Dibujo del mundo en Canvas 2D (terreno, pistas, remontes, puntos y
// esquiadores). Tamaños en px CSS, posiciones en metros convertidas con la
// cámara. La interfaz (barras, botones y paneles) está en interfaz.ts.
import { CONFIG } from '../config';
import { COLORES, type ColorPista } from '../core/colores';
import type { Perfil } from '../core/simulacion';
import { desplazamientoPista as calcularDesplazamiento } from '../core/desplazamiento';
import type { Polilinea } from '../core/polilinea';
import type { Estacion, Pista, TipoEstacion } from '../core/red';
import { interpolar, type Punto } from '../core/vector';
import type { Juego } from '../juego';
import type { Camara } from './camara';
import { vistaPunto } from '../core/visibilidad';
import { DURACION, frenar, limitar01, rebotar, tinteDia, type Efectos } from './efectos';
import { preferencias } from '../preferencias';
import { COLOR_FONDO } from './terreno';

export const COLOR = {
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
  mejora: '#f2b84b', // pulso al mejorar un remonte
  moneda: '#8a5a00', // texto de los cobros
};

const PALETA_NORMAL: Record<ColorPista, string> = { verde: '#3e9b5b', azul: '#2f6fc0', roja: '#d24a3c', negra: '#1d2026' };
/**
 * Paleta para daltonismo (Okabe e Ito): verde azulado, azul y bermellón se
 * distinguen entre sí con las formas más comunes de daltonismo.
 */
const PALETA_DALTONISMO: Record<ColorPista, string> = { verde: '#009e73', azul: '#0072b2', roja: '#d55e00', negra: '#1d2026' };

/** Colores de pista y de esquiador en uso (cambian con el modo para daltonismo). */
export const COLOR_PISTA: Record<ColorPista, string> = { ...PALETA_NORMAL };

/** Pone la paleta según las preferencias. Hay que llamarlo al cambiar el modo y al arrancar. */
export function aplicarPaleta(): void {
  Object.assign(COLOR_PISTA, preferencias.daltonismo ? PALETA_DALTONISMO : PALETA_NORMAL);
}
aplicarPaleta();

/**
 * Símbolo de forma de cada nivel, como señal secundaria al color (modo para
 * daltonismo): círculo verde, cuadrado azul, rombo rojo y doble rombo negro.
 * Deja el trazado listo; quien llama rellena o perfila.
 */
export function trazarSimbolo(ctx: CanvasRenderingContext2D, nivel: number, x: number, y: number, r: number): void {
  ctx.beginPath();
  const rombo = (cx: number, rr: number) => {
    ctx.moveTo(cx, y - rr);
    ctx.lineTo(cx + rr, y);
    ctx.lineTo(cx, y + rr);
    ctx.lineTo(cx - rr, y);
    ctx.closePath();
  };
  if (nivel === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (nivel === 1) ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (nivel === 2) rombo(x, r * 1.15);
  else {
    rombo(x - r * 0.6, r * 0.85);
    rombo(x + r * 0.6, r * 0.85);
  }
}

export const RADIO_NODO = 9;
/** Radio de un punto aún sin usar: más pequeño que una estación. */
const RADIO_VACIO = 5.5;
const RADIO_PUNTO = 2.2;

export function dibujar(ctx: CanvasRenderingContext2D, juego: Juego, camara: Camara, terreno: HTMLCanvasElement, ancho: number, alto: number, fx: Efectos): void {
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

  // Y en pantallas más anchas (móvil en horizontal), la primera y la última
  // columna hacia los lados.
  if (esquina.x > 0) {
    ctx.drawImage(terreno, 0, 0, 1, terreno.height, 0, esquina.y, esquina.x + 1, hT);
    ctx.drawImage(terreno, terreno.width - 1, 0, 1, terreno.height, esquina.x + wT - 1, esquina.y, ancho - esquina.x - wT + 1, hT);
  }

  // Ciclo de día: un tinte muy lento sobre el terreno (solo visual).
  const tinte = tinteDia(juego.horaDelDia);
  if (tinte.a > 0.005) {
    ctx.fillStyle = `rgba(${tinte.r}, ${tinte.g}, ${tinte.b}, ${tinte.a.toFixed(3)})`;
    ctx.fillRect(0, 0, ancho, alto);
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
  // Aviso del medidor de quejas: la plaza se tiñe de rojo con un pulso lento.
  if (sim.fraccionQuejas >= juego.config.quejas.aviso) {
    const pulso = 0.5 + 0.5 * Math.sin(fx.ahora * 2);
    ctx.fillStyle = `rgba(208, 69, 58, ${0.18 + 0.17 * pulso})`;
    ctx.fill();
  }

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
    // Recién abierta, se traza de arriba abajo.
    const trazada = frenar(fx.progreso(`pista:${p.id}`, DURACION.pista));
    dibujarTrazado(ctx, p.trazado, P, COLOR_PISTA[p.color], 3, p.compartido, desplazamientoPista(p), trazada);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    // Modo para daltonismo: el símbolo de su nivel a media pista.
    if (preferencias.daltonismo && trazada >= 1) {
      const medio = p.compartido ? Math.min(p.trazado.longitud / 2, p.compartido.inicio * 0.6) : p.trazado.longitud / 2;
      const q = P(p.trazado.puntoEn(medio));
      const d = desplazamientoPista(p)(medio);
      ctx.fillStyle = COLOR.hueco;
      ctx.beginPath();
      ctx.arc(q.x + d.x, q.y + d.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR_PISTA[p.color];
      trazarSimbolo(ctx, COLORES.indexOf(p.color), q.x + d.x, q.y + d.y, 4.5);
      ctx.fill();
    }
    // Al abrirse o al pasar de espera a activa: un brillo que se apaga.
    const brillo = Math.min(fx.progreso(`pista:${p.id}`, DURACION.pista + DURACION.activacion), fx.progreso(`activa:${p.id}`, DURACION.activacion));
    if (brillo < 1) {
      ctx.globalAlpha = (1 - brillo) * 0.55;
      dibujarTrazado(ctx, p.trazado, P, '#ffffff', 3 + 6 * (1 - brillo), p.compartido, desplazamientoPista(p), trazada);
      ctx.globalAlpha = 1;
    }
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
    // Recién construido, el cable crece desde la salida; al entrar en
    // servicio pasa del gris a la tinta; al mejorarlo, un pulso lo recorre.
    const crecido = frenar(fx.progreso(`remonte:${r.id}`, DURACION.remonte));
    const punta = interpolar(a, b2, crecido);
    const servicio = enServicio ? fx.progreso(`servicio:${r.id}`, 0.5) : 0;
    dibujarRemonte(ctx, a, punta, enServicio ? mezclar(COLOR.remonteParado, COLOR.tinta, servicio) : COLOR.remonteParado);
    const mejora = fx.progreso(`mejora:${r.id}`, DURACION.mejora);
    if (mejora < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - mejora) * 0.8;
      ctx.strokeStyle = COLOR.mejora;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6 + 10 * (1 - mejora);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const frente = interpolar(a, b2, frenar(mejora * 1.6));
      ctx.lineTo(frente.x, frente.y);
      ctx.stroke();
      ctx.restore();
    }
    const angulo = Math.atan2(b2.y - a.y, b2.x - a.x);
    // Las bolitas salen de la estación de abajo y la de arriba se las traga:
    // crecen al salir y encogen al llegar.
    const margen = Math.min(90, r.longitud * 0.2);
    for (const b of sim.bolitas[r.id] ?? []) {
      const q = interpolar(a, b2, b.recorrido / r.longitud);
      const escala = frenar(Math.min(b.recorrido, r.longitud - b.recorrido) / margen);
      if (escala > 0.05) dibujarBolita(ctx, q, angulo, r.tipo, b.pasajeros.map((id) => colorEsquiador(sim.perfiles.get(id))), escala);
    }
  }

  // Vista previa del arrastre.
  const arr = juego.arrastre;
  if (arr) dibujarArrastre(ctx, juego, P, PE);
  // Las marcas de los destinos entran y salen con suavidad.
  const marcas = fx.valor('marcas');

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
    // Un punto sin usar que solo se ve durante el arrastre aparece poco a poco.
    const soloMarca = posiciones.length === 0 && marca !== null && !juego.modoAjustes;
    if (soloMarca) {
      ctx.save();
      ctx.globalAlpha = marcas;
    }
    const vacio = posiciones.length === 0;
    // Un punto con estaciones está en uso (también una base nueva en media
    // ladera, a la que aún no llega ningún remonte): se dibuja pleno.
    const activo = red.activo(n.id) || !vacio;
    if (vacio) dibujarPuntoVacio(ctx, P(n), marca, red.puedeArrancar(n.id));
    // Un punto desdoblado es un solo lugar para los esquiadores (quien llega
    // por cualquier triángulo baja por cualquier pista): sus estaciones van
    // dentro de una misma cápsula para que se lea así.
    if (posiciones.length > 1) dibujarCapsula(ctx, posiciones.map((p) => p.c), opacidad(activo, marca));
    for (const { e, c } of posiciones) dibujarEstacion(ctx, e.tipo, c, activo, marca, rebotar(fx.progreso(`estacion:${e.id}`, DURACION.estacion)));
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
    if (soloMarca) ctx.restore();
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
  // las estaciones de Mini Metro. Lleno, toda la cola pierde un punto: un
  // destello lo marca.
  for (const r of red.remontes) {
    const f = sim.anillos[r.id] ?? 0;
    const c = PE(red.estaciones[r.estacionDesde]);
    if (f > 0 || (sim.colas[r.id]?.length ?? 0) > sim.p.aforoCola) dibujarAnilloCola(ctx, c, f, fx.ahora);
    const lleno = fx.progreso(`anillo:${r.id}`, 0.6);
    if (lleno < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - lleno;
      ctx.strokeStyle = COLOR.colaLlena;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(c.x, c.y, RADIO_NODO + 6 + frenar(lleno) * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Despedidas: quien se va satisfecho sube y se desvanece con su color;
  // quien se va enfadado deja un destello rojo.
  for (const m of fx.salidas) {
    const t = limitar01((fx.ahora - m.inicio) / DURACION.salida);
    const c = P(m.nodo >= 0 && red.nodos[m.nodo] ? red.nodo(m.nodo) : juego.plaza);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    if (m.enfadado) {
      ctx.strokeStyle = COLOR.colaLlena;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, RADIO_NODO + 4 + frenar(t) * 16, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const ang = m.fase * 2.4;
      ctx.fillStyle = COLOR_PISTA[COLORES[m.nivel]];
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(ang) * (RADIO_NODO + 5), c.y + Math.sin(ang) * (RADIO_NODO + 5) - frenar(t) * 16, RADIO_PUNTO * (1 - 0.4 * t), 0, Math.PI * 2);
      ctx.fill();
    }
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
  // Por lotes: un trazo por color (con 300 puntos, uno a uno se nota).
  const parpadeo = Math.floor(fx.ahora / 0.3) % 2 === 0;
  const lotes: number[][] = [[], [], [], [], []]; // cuatro niveles y los que parpadean en blanco
  for (const e of sim.esquiadores.values()) {
    let x = 0;
    let y = 0;
    switch (e.estado) {
      case 'cola': {
        const q = puntoEnRacimo(red.remontes[e.remonte].estacionDesde);
        x = q.x;
        y = q.y;
        break;
      }
      case 'carretera': {
        if (!sim.carretera) continue;
        const q = P(sim.carretera.puntoEn(e.recorrido));
        x = q.x;
        y = q.y;
        break;
      }
      case 'andando': {
        const q = P(interpolar(e.origen, e.hacia >= 0 ? red.nodo(e.hacia) : juego.plaza, Math.min(e.recorrido / (e.largo || 1), 1)));
        x = q.x;
        y = q.y;
        break;
      }
      case 'pista': {
        // Sobre la misma curva desplazada hacia las estaciones que se dibuja.
        const pi = red.pistas[e.pista];
        const base = P(pi.trazado.puntoEn(e.recorrido));
        const d = desplazamientoPista(pi)(e.recorrido);
        x = base.x + d.x;
        y = base.y + d.y;
        break;
      }
      default:
        continue; // en remonte: va dentro de su bolita
    }
    if (x < -8 || y < -8 || x > ancho + 8 || y > alto + 8) continue;
    const perfil = sim.perfiles.get(e.id);
    // A un punto de irse: parpadea en blanco.
    const lote = parpadeo && perfil?.contento === 1 && sim.p.contentoInicial > 1 ? 4 : (perfil?.nivel ?? 0);
    lotes[lote].push(x, y);
  }
  const TAU = Math.PI * 2;
  lotes.forEach((xy, i) => {
    if (xy.length === 0) return;
    ctx.beginPath();
    for (let k = 0; k < xy.length; k += 2) {
      ctx.moveTo(xy[k] + RADIO_PUNTO, xy[k + 1]);
      ctx.arc(xy[k], xy[k + 1], RADIO_PUNTO, 0, TAU);
    }
    // Contorno claro fino para que se lean sobre pistas de su color.
    ctx.strokeStyle = i === 4 ? COLOR.tinta : COLOR.hueco;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = i === 4 ? COLOR.hueco : COLOR_PISTA[COLORES[i]];
    ctx.fill();
  });

  // Cobros: las monedas de las bajadas suben desde el punto y se desvanecen.
  ctx.save();
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cobro of fx.cobros) {
    if (!red.nodos[cobro.nodo]) continue;
    const t = limitar01((fx.ahora - cobro.inicio) / DURACION.cobro);
    const c = P(red.nodo(cobro.nodo));
    const texto = `+${cobro.cantidad >= 10 ? Math.round(cobro.cantidad) : cobro.cantidad.toFixed(1).replace('.', ',')}`;
    const y = c.y - RADIO_NODO - 10 - frenar(t) * 20;
    ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - limitar01((t - 0.5) / 0.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(241, 243, 244, 0.9)';
    ctx.strokeText(texto, c.x, y);
    ctx.fillStyle = COLOR.moneda;
    ctx.fillText(texto, c.x, y);
  }
  ctx.restore();
}

export function dibujarTrazado(
  ctx: CanvasRenderingContext2D,
  trazado: Polilinea,
  P: (p: Punto) => Punto,
  color: string,
  grosor: number,
  compartido: { inicio: number; fin: number } | null = null,
  desplazar?: (s: number) => Punto,
  /** Parte de la pista que se dibuja, desde arriba (para trazarla al abrirla). */
  fraccion = 1,
): void {
  // La pista empieza y acaba algo separada del nodo para que se lea mejor.
  const L = trazado.longitud;
  const sep = Math.min(CONFIG.pista.separacionNodo, L * 0.2);
  const limite = sep + (L - 2 * sep) * fraccion;
  const tramos: [number, number][] = compartido
    ? [
        [sep, compartido.inicio],
        [compartido.fin, L - sep],
      ]
    : [[sep, L - sep]];
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  for (const [a, hasta] of tramos) {
    const b = Math.min(hasta, limite);
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
export function dibujarRemonte(ctx: CanvasRenderingContext2D, a: Punto, b: Punto, color: string, grosor = 6): void {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = COLOR.hueco;
  ctx.lineWidth = grosor / 3;
  ctx.stroke();
  ctx.lineCap = 'round';
}

/**
 * Bolita de un remonte con sus pasajeros, del tamaño justo para ellos:
 * telesquí, un círculo con 1; telesilla, una cápsula (dos semicírculos unidos
 * por dos rectas tangentes) con 2, atravesada al cable, como una silla; telecabina, un cuadrado de bordes redondeados con 4 (2 × 2).
 */
export function dibujarBolita(ctx: CanvasRenderingContext2D, q: Punto, angulo: number, tipo: number, pasajeros: string[], escala = 1): void {
  const d = 2.6; // separación de los puntos respecto al centro
  // El eje x va a lo largo del cable: los dos de la telesilla, en el eje y.
  const sitios: Punto[] = tipo === 0 ? [{ x: 0, y: 0 }] : tipo === 1 ? [{ x: 0, y: -d }, { x: 0, y: d }] : [{ x: -d, y: -d }, { x: d, y: -d }, { x: -d, y: d }, { x: d, y: d }];
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.rotate(angulo);
  if (escala !== 1) ctx.scale(escala, escala);
  ctx.fillStyle = COLOR.hueco;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (tipo === 0) ctx.arc(0, 0, 4, 0, Math.PI * 2);
  else if (tipo === 1) ctx.roundRect(-4, -6.6, 8, 13.2, 4); // radio = medio ancho: semicírculos y rectas tangentes
  else ctx.roundRect(-6, -6, 12, 12, 3.5);
  ctx.fill();
  ctx.stroke();
  pasajeros.slice(0, sitios.length).forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sitios[i].x, sitios[i].y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
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
    // En rojo si no llegan las monedas; el precio, junto al dedo.
    const precio = juego.precioArrastre();
    const alcanza = !precio || precio.alcanza;
    dibujarRemonte(ctx, PE(pos(ed)), PE(pos(eh)), alcanza ? COLOR.tinta : COLOR.invalido);
    for (const p of [ed, eh]) if ('nueva' in p) dibujarEstacion(ctx, p.nueva.tipo, PE(p.nueva), true, 'valido');
    if (precio) {
      const c = P(arr.puntero);
      const texto = `${precio.precio} monedas`;
      ctx.save();
      ctx.font = '600 13px system-ui, sans-serif';
      const w = ctx.measureText(texto).width + 14;
      // Encima del dedo, para que no lo tape.
      const x = c.x - w / 2;
      const y = c.y - 64;
      ctx.fillStyle = 'rgba(241, 243, 244, 0.92)';
      ctx.strokeStyle = alcanza ? COLOR.tinta : COLOR.invalido;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 22, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = alcanza ? COLOR.tinta : COLOR.invalido;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, c.x, y + 11.5);
      ctx.restore();
    }
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
function dibujarEstacion(ctx: CanvasRenderingContext2D, tipo: TipoEstacion, c: Punto, activo: boolean, marca: Marca, escala = 1): void {
  ctx.save();
  ctx.globalAlpha = opacidad(activo, marca);
  dibujarAroDestino(ctx, c, RADIO_NODO + 7, marca);
  ctx.fillStyle = COLOR.hueco;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  // Recién creada, crece con un pequeño rebote.
  const r = RADIO_NODO * Math.max(0.05, escala);
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

/** Mezcla dos colores hex: t = 0 da el primero, t = 1 el segundo. */
export function mezclar(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

/** Color de un esquiador: el de su nivel (la especificación descarta cambiarlo con el contento). */
export function colorEsquiador(perfil: Perfil | undefined): string {
  return perfil ? COLOR_PISTA[COLORES[perfil.nivel]] : COLOR.esquiador;
}

/**
 * Anillo de cola alrededor de una estación: una pista gris de fondo y un arco
 * que se llena del gris al rojo. Cerca de llenarse, late.
 */
function dibujarAnilloCola(ctx: CanvasRenderingContext2D, c: Punto, fraccion: number, ahora: number): void {
  const f = Math.min(1, Math.max(0, fraccion));
  const late = f > 0.7 ? 1 + 0.5 * Math.sin(ahora * 9) * (f - 0.7) / 0.3 : 1;
  const r = RADIO_NODO + 5.5;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(241, 243, 244, 0.85)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4 * late;
  ctx.strokeStyle = mezclar(COLOR.colaVacia, COLOR.colaLlena, f);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
