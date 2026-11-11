// Dibujo de la escena en Canvas 2D. Tamaños en px CSS, posiciones en metros
// convertidas con la cámara.
import { CONFIG } from '../config';
import { PLAZA } from '../core/mapa';
import type { Nodo, Pista } from '../core/red';
import { interpolar, type Punto } from '../core/vector';
import type { Juego } from '../juego';
import type { Camara } from './camara';
import { COLOR_FONDO } from './terreno';

const COLOR = {
  tinta: '#262a31',
  remonteParado: '#8b9298',
  hueco: '#f1f3f4',
  pista: '#7356c0', // PROVISIONAL: color neutro hasta que haya niveles (etapa 3)
  esquiador: '#262a31',
  plaza: 'rgba(240, 236, 226, 0.75)',
  valido: '#2f9e6a',
  invalido: '#b9473b',
};

const RADIO_NODO = 9;
const RADIO_PUNTO = 2.2;

export function dibujar(ctx: CanvasRenderingContext2D, juego: Juego, camara: Camara, terreno: HTMLCanvasElement, ancho: number, alto: number): void {
  const { red, sim } = juego;
  const P = (p: Punto) => camara.aPantalla(p);

  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, ancho, alto);
  const esquina = P({ x: 0, y: 0 });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const wT = CONFIG.mundo.ancho * camara.escala;
  const hT = CONFIG.mundo.alto * camara.escala;
  ctx.drawImage(terreno, esquina.x, esquina.y, wT, hT);
  // En pantallas más alargadas que el mundo se prolongan la primera y la última
  // fila del terreno para que no queden bandas planas.
  if (esquina.y > 0) {
    ctx.drawImage(terreno, 0, 0, terreno.width, 1, esquina.x, 0, wT, esquina.y + 1);
    ctx.drawImage(terreno, 0, terreno.height - 1, terreno.width, 1, esquina.x, esquina.y + hT - 1, wT, alto - esquina.y - hT + 1);
  }

  // Plaza del pie de pistas.
  const plaza = P(PLAZA);
  ctx.fillStyle = COLOR.plaza;
  ctx.beginPath();
  ctx.arc(plaza.x, plaza.y, PLAZA.radio * camara.escala, 0, Math.PI * 2);
  ctx.fill();

  // Pistas.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of red.pistas) dibujarPista(ctx, p, P, COLOR.pista, 3);

  // Remontes con sus bolitas.
  for (const r of red.remontes) {
    const enServicio = red.enServicio(r);
    dibujarRemonte(ctx, P(red.nodo(r.desde)), P(red.nodo(r.hasta)), enServicio ? COLOR.tinta : COLOR.remonteParado);
    for (const b of sim.bolitas[r.id] ?? []) {
      const q = P(interpolar(red.nodo(r.desde), red.nodo(r.hasta), b.recorrido / r.longitud));
      ctx.fillStyle = COLOR.hueco;
      ctx.strokeStyle = COLOR.tinta;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (b.pasajeros.length > 0) {
        ctx.fillStyle = COLOR.esquiador;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Vista previa del arrastre.
  const arr = juego.arrastre;
  if (arr) dibujarArrastre(ctx, juego, P);

  // Nodos.
  for (const n of red.nodos) {
    let marca: 'valido' | 'invalido' | null = null;
    if (arr && n.id !== arr.origen) marca = juego.evaluar(arr.origen, n.id).motivo === 'ok' ? 'valido' : 'invalido';
    dibujarNodo(ctx, n, P(n), red.activo(n.id), marca);
  }

  // Esquiadores: en cola alrededor del nodo, andando por la plaza y bajando.
  ctx.fillStyle = COLOR.esquiador;
  const porNodo = new Map<number, number>();
  const puntoEnRacimo = (nodo: number) => {
    const i = porNodo.get(nodo) ?? 0;
    porNodo.set(nodo, i + 1);
    // Espiral compacta alrededor del símbolo.
    const anillo = Math.floor(i / 12);
    const ang = (i % 12) * ((Math.PI * 2) / 12) + anillo * 0.26;
    const rad = RADIO_NODO + 6 + anillo * 5;
    const c = P(red.nodo(nodo));
    return { x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad };
  };
  for (const e of sim.esquiadores.values()) {
    let q: Punto | null = null;
    switch (e.estado) {
      case 'cola':
      case 'espera':
        q = puntoEnRacimo(e.nodo);
        break;
      case 'andando':
        q = P(interpolar(e.origen, red.nodo(e.hacia), Math.min(e.recorrido / e.largo, 1)));
        break;
      case 'pista':
        q = P(red.pistas[e.pista].trazado.puntoEn(e.recorrido));
        break;
      case 'remonte':
        break; // va dentro de su bolita
    }
    if (!q) continue;
    ctx.beginPath();
    ctx.arc(q.x, q.y, RADIO_PUNTO, 0, Math.PI * 2);
    ctx.fill();
  }

  dibujarTextos(ctx, juego, ancho);
}

function dibujarPista(ctx: CanvasRenderingContext2D, p: Pista, P: (p: Punto) => Punto, color: string, grosor: number): void {
  const L = p.trazado.longitud;
  const sep = Math.min(CONFIG.pista.separacionNodo, L * 0.2);
  const tramo = p.trazado.tramo(sep, L - sep).map(P);
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.beginPath();
  ctx.moveTo(tramo[0].x, tramo[0].y);
  for (let i = 1; i < tramo.length; i++) ctx.lineTo(tramo[i].x, tramo[i].y);
  ctx.stroke();
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

function dibujarArrastre(ctx: CanvasRenderingContext2D, juego: Juego, P: (p: Punto) => Punto): void {
  const arr = juego.arrastre!;
  const a = P(juego.red.nodo(arr.origen));
  const obj = arr.objetivo;
  if (obj && obj.motivo === 'ok') {
    const b = P(juego.red.nodo(obj.nodo));
    if (obj.tipo === 'remonte') dibujarRemonte(ctx, a, b, COLOR.tinta);
    else {
      ctx.strokeStyle = COLOR.pista;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }
  const b = obj ? P(juego.red.nodo(obj.nodo)) : P(arr.puntero);
  ctx.strokeStyle = obj ? COLOR.invalido : 'rgba(38, 42, 49, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function dibujarNodo(ctx: CanvasRenderingContext2D, n: Nodo, c: Punto, activo: boolean, marca: 'valido' | 'invalido' | null): void {
  ctx.save();
  ctx.globalAlpha = activo || marca === 'valido' ? 1 : marca === 'invalido' ? 0.2 : 0.4;
  if (marca === 'valido') {
    ctx.strokeStyle = COLOR.valido;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIO_NODO + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.hueco;
  ctx.strokeStyle = COLOR.tinta;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const r = RADIO_NODO;
  if (n.tipo === 'base') ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  else if (n.tipo === 'cima') {
    ctx.moveTo(c.x, c.y - r * 1.15);
    ctx.lineTo(c.x + r * 1.05, c.y + r * 0.7);
    ctx.lineTo(c.x - r * 1.05, c.y + r * 0.7);
    ctx.closePath();
  } else {
    ctx.rect(c.x - r * 0.8, c.y - r * 0.8, r * 1.6, r * 1.6);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.tinta;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n.cota), c.x + r + 4, c.y - r - 2);
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

