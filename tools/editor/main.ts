// Editor de mapas (herramienta, no forma parte del juego): genera niveles en
// el formato de FORMATO_NIVEL.md. Reutiliza el render del terreno del juego
// (src/render/terreno.ts) y su red de pistas para validar (vía validacion.ts).
// Se abre con `npm run editor` (en /remontes/tools/editor/ del servidor de
// desarrollo, el mismo origen que el juego, para poder probar el mapa).
import { CONFIG } from '../../src/config';
import { MASCARA } from '../../src/core/alturas';
import { COLORES } from '../../src/core/colores';
import { grisDeMascara } from '../../src/core/mapa';
import { leerNivel } from '../../src/core/nivel';
import type { TipoNodo } from '../../src/core/red';
import type { Punto } from '../../src/core/vector';
import { pintarTerreno } from '../../src/render/terreno';
import { ALEATORIO_POR_DEFECTO, generarJugable, type OpcionesAleatorio } from './aleatorio';
import {
  ajustarMascara,
  calcularRelieve,
  deserializar,
  nivelJson,
  parametrosNivel,
  pintarMascara,
  proyectoNuevo,
  rejillaDe,
  serializar,
  textoNivelJson,
  type ClasePunto,
  type Proyecto,
  type Relieve,
  type TipoLinea,
} from './proyecto';
import { validar, type Validacion } from './validacion';
import { crearZip } from './zip';

// ---- Estado ----

type Herramienta = 'mover' | 'punto' | 'cresta' | 'vaguada' | 'roca' | 'esquiable' | 'borrarMascara' | TipoNodo | 'plaza' | 'carretera';

type Seleccion =
  | { tipo: 'punto'; i: number }
  | { tipo: 'vertice'; linea: number; i: number }
  | { tipo: 'nodo'; i: number }
  | { tipo: 'carretera'; i: number }
  | { tipo: 'plaza' }
  | null;

const CLAVE_AUTOGUARDADO = 'editor.proyecto';
const COLOR_PISTA = { verde: '#3e9b5b', azul: '#2f6fc0', roja: '#d24a3c', negra: '#1d2026' } as const;

let p: Proyecto = cargarAutoguardado() ?? proyectoNuevo();
let relieve: Relieve | null = null;
let terreno: HTMLCanvasElement | null = null;
let capaMascara: HTMLCanvasElement | null = null;
let validacion: Validacion | null = null;
let validando: Generator<Validacion, Validacion> | null = null;
let herramienta: Herramienta = 'mover';
let seleccion: Seleccion = null;
let lineaEnCurso: number | null = null;
let clasePunto: ClasePunto = 'intermedio';
let radioPincel = 120;
let opacidadRelieve = 1;
let verParejas = true;
let verMascara = true;
let fondoImg: HTMLImageElement | null = null;
const vista = { escala: 0.12, x: 20, y: 20 }; // píxeles por metro y desplazamiento
const deshacer: string[] = [];
const rehacer: string[] = [];
let raton: Punto = { x: 0, y: 0 };
let arrastre: { tipo: 'mover' | 'vista' | 'pincel'; desde: Punto; vista0?: { x: number; y: number }; cambiado: boolean } | null = null;
let espacio = false;
let pendienteRecalculo: 'rapido' | 'completo' | null = null;
let aleatorio: OpcionesAleatorio = { ...ALEATORIO_POR_DEFECTO };

const lienzo = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = lienzo.getContext('2d')!;
const estado = document.getElementById('estado')!;

function cargarAutoguardado(): Proyecto | null {
  try {
    const t = localStorage.getItem(CLAVE_AUTOGUARDADO);
    return t ? deserializar(t) : null;
  } catch {
    return null;
  }
}

function autoguardar(): void {
  try {
    localStorage.setItem(CLAVE_AUTOGUARDADO, serializar(p));
  } catch {
    // Sin sitio (fondo muy grande): el proyecto se guarda a mano con «Guardar proyecto».
  }
}

/** Antes de cada cambio: guarda el estado para deshacer. */
function apuntar(): void {
  deshacer.push(serializar(p));
  if (deshacer.length > 80) deshacer.shift();
  rehacer.length = 0;
}

function restaurar(texto: string): void {
  p = deserializar(texto);
  seleccion = null;
  lineaEnCurso = null;
  cargarFondo();
  cambio('completo');
  pintarPanel();
}

/** Algo ha cambiado: recalcula el relieve (rápido mientras se arrastra) y la validación. */
function cambio(tipo: 'rapido' | 'completo' = 'completo'): void {
  if (pendienteRecalculo !== 'completo') pendienteRecalculo = tipo;
}

function recalcular(): void {
  if (!pendienteRecalculo) return;
  const rapido = pendienteRecalculo === 'rapido';
  pendienteRecalculo = null;
  const t0 = performance.now();
  try {
    // Mientras se arrastra, a media resolución (cuatro veces menos muestras) y sin validar.
    const q = rapido ? { ...p, resolucion: p.resolucion * 2, mascara: null } : p;
    relieve = calcularRelieve(q);
    const a = relieve.mapa.alturas;
    const rgba = pintarTerreno(a, p.umbralRoca);
    terreno = document.createElement('canvas');
    terreno.width = a.columnas;
    terreno.height = a.filas;
    terreno.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), a.columnas, a.filas), 0, 0);
    if (!rapido) {
      pintarCapaMascara();
      validacion = null;
      validando = validar(relieve.mapa, parametrosNivel(p));
      autoguardar();
    }
    mensaje(`Relieve: ${a.columnas}×${a.filas} muestras, cotas ${relieve.cotaMin}–${relieve.cotaMax} m (${Math.round(performance.now() - t0)} ms)`);
  } catch (e) {
    mensaje(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function pintarCapaMascara(): void {
  const { columnas, filas } = rejillaDe(p);
  capaMascara = null;
  if (!p.mascara || !p.mascara.some((v) => v !== MASCARA.auto)) return;
  capaMascara = document.createElement('canvas');
  capaMascara.width = columnas;
  capaMascara.height = filas;
  const img = new ImageData(columnas, filas);
  for (let i = 0; i < p.mascara.length; i++) {
    const v = p.mascara[i];
    if (v === MASCARA.roca) img.data.set([200, 30, 30, 110], i * 4);
    else if (v === MASCARA.esquiable) img.data.set([30, 170, 60, 110], i * 4);
  }
  capaMascara.getContext('2d')!.putImageData(img, 0, 0);
}

let textoEstado = '';
function mensaje(t: string): void {
  textoEstado = t;
}

// ---- Coordenadas ----

const aMundo = (q: Punto): Punto => ({ x: (q.x - vista.x) / vista.escala, y: (q.y - vista.y) / vista.escala });
const aPantalla = (q: Punto): Punto => ({ x: q.x * vista.escala + vista.x, y: q.y * vista.escala + vista.y });

function encajar(): void {
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  vista.escala = Math.min((w - 40) / p.ancho, (h - 40) / p.alto);
  vista.x = (w - p.ancho * vista.escala) / 2;
  vista.y = (h - p.alto * vista.escala) / 2;
}

function cotaEn(q: Punto): number {
  return relieve ? Math.round(relieve.mapa.alturas.cotaEn(q)) : 1500;
}

// ---- Selección y edición ----

/** Elemento editable bajo el ratón (radio en píxeles). */
function buscar(q: Punto, radioPx = 9): Seleccion {
  const r = radioPx / vista.escala;
  const cerca = (a: Punto) => Math.hypot(a.x - q.x, a.y - q.y) <= r;
  for (let i = p.nodos.length - 1; i >= 0; i--) if (cerca(p.nodos[i])) return { tipo: 'nodo', i };
  for (let i = p.puntos.length - 1; i >= 0; i--) if (cerca(p.puntos[i])) return { tipo: 'punto', i };
  for (let l = p.lineas.length - 1; l >= 0; l--) for (let i = 0; i < p.lineas[l].vertices.length; i++) if (cerca(p.lineas[l].vertices[i])) return { tipo: 'vertice', linea: l, i };
  for (let i = 0; i < p.carretera.length; i++) if (cerca(p.carretera[i])) return { tipo: 'carretera', i };
  if (cerca(p.plaza)) return { tipo: 'plaza' };
  return null;
}

function posicionDe(s: Seleccion): Punto | null {
  if (!s) return null;
  if (s.tipo === 'punto') return p.puntos[s.i];
  if (s.tipo === 'vertice') return p.lineas[s.linea]?.vertices[s.i] ?? null;
  if (s.tipo === 'nodo') return p.nodos[s.i];
  if (s.tipo === 'carretera') return p.carretera[s.i];
  return p.plaza;
}

function borrarSeleccion(): void {
  const s = seleccion;
  if (!s) return;
  apuntar();
  if (s.tipo === 'punto') p.puntos.splice(s.i, 1);
  else if (s.tipo === 'vertice') {
    const l = p.lineas[s.linea];
    l.vertices.splice(s.i, 1);
    if (l.vertices.length < 2) p.lineas.splice(s.linea, 1);
  } else if (s.tipo === 'nodo') p.nodos.splice(s.i, 1);
  else if (s.tipo === 'carretera') p.carretera.splice(s.i, 1);
  seleccion = null;
  cambio();
  pintarPanel();
}

/** Ajusta la cota del punto o vértice seleccionado. */
function cambiarCota(delta: number): void {
  const s = seleccion;
  if (s?.tipo === 'punto') p.puntos[s.i].z += delta;
  else if (s?.tipo === 'vertice') p.lineas[s.linea].vertices[s.i].z += delta;
  else return;
  cambio('rapido');
  pintarSeleccion();
}

// ---- Ratón ----

lienzo.addEventListener('contextmenu', (e) => e.preventDefault());
lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  // Mayúsculas + rueda: cota del punto seleccionado (±10 m; con Ctrl, ±50).
  if (e.shiftKey && (seleccion?.tipo === 'punto' || seleccion?.tipo === 'vertice')) {
    if (!deshacerRueda) apuntar();
    deshacerRueda = true;
    cambiarCota((e.deltaY < 0 ? 1 : -1) * (e.ctrlKey ? 50 : 10));
    clearTimeout(finRueda);
    finRueda = window.setTimeout(() => {
      deshacerRueda = false;
      cambio();
    }, 300);
    return;
  }
  const m = { x: e.offsetX, y: e.offsetY };
  const antes = aMundo(m);
  vista.escala = Math.min(4, Math.max(0.01, vista.escala * Math.exp(-e.deltaY * 0.0015)));
  vista.x = m.x - antes.x * vista.escala;
  vista.y = m.y - antes.y * vista.escala;
});
let deshacerRueda = false;
let finRueda = 0;

lienzo.addEventListener('mousedown', (e) => {
  const m = { x: e.offsetX, y: e.offsetY };
  const q = aMundo(m);
  // Mover la vista: botón central, derecho o espacio + izquierdo.
  if (e.button === 1 || e.button === 2 || espacio) {
    if (e.button === 2 && lineaEnCurso !== null) {
      terminarLinea();
      return;
    }
    arrastre = { tipo: 'vista', desde: m, vista0: { x: vista.x, y: vista.y }, cambiado: false };
    return;
  }
  if (e.button !== 0) return;
  const h = herramienta;
  if (h === 'mover') {
    seleccion = buscar(q);
    if (seleccion) arrastre = { tipo: 'mover', desde: q, cambiado: false };
    pintarSeleccion();
  } else if (h === 'punto') {
    const s = buscar(q);
    if (s?.tipo === 'punto') {
      seleccion = s;
      arrastre = { tipo: 'mover', desde: q, cambiado: false };
    } else {
      apuntar();
      p.puntos.push({ x: Math.round(q.x), y: Math.round(q.y), z: cotaEn(q), clase: clasePunto });
      seleccion = { tipo: 'punto', i: p.puntos.length - 1 };
      cambio();
    }
    pintarSeleccion();
    enfocarCota();
  } else if (h === 'cresta' || h === 'vaguada') {
    apuntar();
    const v = { x: Math.round(q.x), y: Math.round(q.y), z: cotaEn(q) };
    if (lineaEnCurso === null || p.lineas[lineaEnCurso]?.tipo !== h) {
      p.lineas.push({ tipo: h as TipoLinea, vertices: [v] });
      lineaEnCurso = p.lineas.length - 1;
    } else p.lineas[lineaEnCurso].vertices.push(v);
    seleccion = { tipo: 'vertice', linea: lineaEnCurso, i: p.lineas[lineaEnCurso].vertices.length - 1 };
    cambio();
    pintarSeleccion();
    enfocarCota();
  } else if (h === 'roca' || h === 'esquiable' || h === 'borrarMascara') {
    apuntar();
    pincel(q);
    arrastre = { tipo: 'pincel', desde: q, cambiado: true };
  } else if (h === 'base' || h === 'intermedio' || h === 'cima') {
    const s = buscar(q);
    apuntar();
    if (s?.tipo === 'nodo') p.nodos[s.i].tipo = h;
    else p.nodos.push({ tipo: h, x: Math.round(q.x), y: Math.round(q.y) });
    seleccion = s?.tipo === 'nodo' ? s : { tipo: 'nodo', i: p.nodos.length - 1 };
    cambio();
    pintarSeleccion();
  } else if (h === 'plaza') {
    apuntar();
    p.plaza = { ...p.plaza, x: Math.round(q.x), y: Math.round(q.y) };
    seleccion = { tipo: 'plaza' };
    cambio();
    pintarSeleccion();
  } else if (h === 'carretera') {
    apuntar();
    p.carretera.push({ x: Math.round(q.x), y: Math.round(q.y) });
    seleccion = { tipo: 'carretera', i: p.carretera.length - 1 };
    cambio();
    pintarSeleccion();
  }
});

lienzo.addEventListener('dblclick', () => terminarLinea());

window.addEventListener('mousemove', (e) => {
  const r = lienzo.getBoundingClientRect();
  const m = { x: e.clientX - r.left, y: e.clientY - r.top };
  raton = aMundo(m);
  const a = arrastre;
  if (!a) return;
  if (a.tipo === 'vista') {
    vista.x = a.vista0!.x + m.x - a.desde.x;
    vista.y = a.vista0!.y + m.y - a.desde.y;
  } else if (a.tipo === 'pincel') {
    pincel(raton);
  } else if (a.tipo === 'mover') {
    const pos = posicionDe(seleccion);
    if (!pos) return;
    if (!a.cambiado) apuntar();
    a.cambiado = true;
    pos.x = Math.round(raton.x);
    pos.y = Math.round(raton.y);
    // Los nodos de juego no cambian el relieve: no hace falta recalcularlo hasta soltar.
    if (seleccion?.tipo === 'punto' || seleccion?.tipo === 'vertice') cambio('rapido');
    pintarSeleccion();
  }
});

window.addEventListener('mouseup', () => {
  if (arrastre && arrastre.tipo !== 'vista' && arrastre.cambiado) cambio('completo');
  arrastre = null;
});

function pincel(q: Punto): void {
  const valor = herramienta === 'roca' ? MASCARA.roca : herramienta === 'esquiable' ? MASCARA.esquiable : MASCARA.auto;
  pintarMascara(p, q, radioPincel, valor);
  // La máscara no cambia el relieve: basta con repintar el terreno y la capa.
  pintarCapaMascara();
  cambio();
}

function terminarLinea(): void {
  if (lineaEnCurso !== null && p.lineas[lineaEnCurso]?.vertices.length < 2) p.lineas.splice(lineaEnCurso, 1);
  lineaEnCurso = null;
  cambio();
}

// ---- Teclado ----

const ATAJOS: Record<string, Herramienta> = {
  v: 'mover',
  p: 'punto',
  c: 'cresta',
  g: 'vaguada',
  r: 'roca',
  e: 'esquiable',
  x: 'borrarMascara',
  '1': 'base',
  '2': 'intermedio',
  '3': 'cima',
  z: 'plaza',
  t: 'carretera',
};

window.addEventListener('keydown', (e) => {
  const enCampo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (enCampo) return;
    e.preventDefault();
    const pila = e.shiftKey ? rehacer : deshacer;
    const otra = e.shiftKey ? deshacer : rehacer;
    const t = pila.pop();
    if (t) {
      otra.push(serializar(p));
      restaurar(t);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    const t = rehacer.pop();
    if (t) {
      deshacer.push(serializar(p));
      restaurar(t);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    guardarProyecto();
    return;
  }
  if (enCampo) return;
  if (e.key === ' ') {
    espacio = true;
    e.preventDefault();
  } else if (e.key === 'Escape' || e.key === 'Enter') {
    if (lineaEnCurso !== null) terminarLinea();
    else {
      seleccion = null;
      pintarSeleccion();
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    borrarSeleccion();
  } else if (e.key === '[' || e.key === ']') {
    radioPincel = Math.max(20, Math.min(1000, radioPincel * (e.key === ']' ? 1.25 : 0.8)));
    pintarPanel();
  } else if (e.key === 'f') {
    encajar();
  } else if (e.key === '+' || e.key === '-') {
    if (!deshacerRueda) apuntar();
    cambiarCota(e.key === '+' ? 10 : -10);
    cambio();
  } else if (ATAJOS[e.key.toLowerCase()]) {
    elegirHerramienta(ATAJOS[e.key.toLowerCase()]);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') espacio = false;
});

function elegirHerramienta(h: Herramienta): void {
  if (lineaEnCurso !== null && h !== herramienta) terminarLinea();
  herramienta = h;
  pintarHerramientas();
}

// ---- Dibujo ----

function dibujar(): void {
  const w = lienzo.clientWidth;
  const h = lienzo.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (lienzo.width !== Math.round(w * dpr) || lienzo.height !== Math.round(h * dpr)) {
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#bbb';
  ctx.fillRect(0, 0, w, h);
  const o = aPantalla({ x: 0, y: 0 });
  const W = p.ancho * vista.escala;
  const H = p.alto * vista.escala;
  ctx.imageSmoothingEnabled = true;
  if (terreno && opacidadRelieve > 0) {
    ctx.globalAlpha = opacidadRelieve;
    ctx.drawImage(terreno, o.x, o.y, W, H);
    ctx.globalAlpha = 1;
  }
  if (fondoImg && p.fondo.imagen && p.fondo.opacidad > 0) {
    const f = aPantalla({ x: p.fondo.x, y: p.fondo.y });
    ctx.globalAlpha = p.fondo.opacidad;
    ctx.drawImage(fondoImg, f.x, f.y, fondoImg.naturalWidth * p.fondo.escala * vista.escala, fondoImg.naturalHeight * p.fondo.escala * vista.escala);
    ctx.globalAlpha = 1;
  }
  if (capaMascara && verMascara) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(capaMascara, o.x, o.y, W, H);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(o.x, o.y, W, H);

  // Parejas de la validación, del color más difícil que cabe.
  const nodosCota = relieve ? p.nodos.map((n) => cotaEn(n)) : [];
  if (verParejas && validacion) {
    for (const par of validacion.parejas) {
      const a = p.nodos[par.desde];
      const b = p.nodos[par.hasta];
      if (!a || !b) continue;
      const pa = aPantalla(a);
      const pb = aPantalla(b);
      const color = par.colores.length > 0 ? COLOR_PISTA[par.colores[par.colores.length - 1]] : '#999';
      ctx.strokeStyle = color;
      ctx.globalAlpha = par.colores.length > 0 ? 0.75 : 0.5;
      ctx.lineWidth = par.colores.length > 0 ? 2 : 1;
      ctx.setLineDash(par.colores.length > 0 ? [] : [3, 4]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Líneas de cresta y vaguada.
  p.lineas.forEach((l, li) => {
    ctx.strokeStyle = l.tipo === 'cresta' ? '#8a4b10' : '#1060a0';
    ctx.lineWidth = 2.5;
    ctx.setLineDash(l.tipo === 'vaguada' ? [8, 5] : []);
    ctx.beginPath();
    l.vertices.forEach((v, i) => {
      const q = aPantalla(v);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    l.vertices.forEach((v, i) => {
      const q = aPantalla(v);
      const sel = seleccion?.tipo === 'vertice' && seleccion.linea === li && seleccion.i === i;
      ctx.fillStyle = sel ? '#ff0' : '#fff';
      ctx.fillRect(q.x - 3.5, q.y - 3.5, 7, 7);
      ctx.strokeStyle = ctx.strokeStyle = l.tipo === 'cresta' ? '#8a4b10' : '#1060a0';
      ctx.strokeRect(q.x - 3.5, q.y - 3.5, 7, 7);
      etiqueta(q, `${Math.round(v.z)}`, '#333');
    });
  });

  // Puntos de cota.
  p.puntos.forEach((pt, i) => {
    const q = aPantalla(pt);
    const sel = seleccion?.tipo === 'punto' && seleccion.i === i;
    ctx.fillStyle = sel ? '#ff0' : pt.clase === 'pico' ? '#a05020' : pt.clase === 'valle' ? '#2070c0' : '#609040';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (pt.clase === 'pico') {
      ctx.moveTo(q.x, q.y - 7);
      ctx.lineTo(q.x + 6, q.y + 4);
      ctx.lineTo(q.x - 6, q.y + 4);
    } else if (pt.clase === 'valle') {
      ctx.moveTo(q.x, q.y + 7);
      ctx.lineTo(q.x + 6, q.y - 4);
      ctx.lineTo(q.x - 6, q.y - 4);
    } else ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    etiqueta(q, `${Math.round(pt.z)}`, '#000');
  });

  // Plaza y carretera.
  const pl = aPantalla(p.plaza);
  ctx.fillStyle = 'rgba(240, 236, 226, 0.8)';
  ctx.strokeStyle = seleccion?.tipo === 'plaza' ? '#cc0' : '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pl.x, pl.y, p.plaza.radio * vista.escala, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.carretera.length > 0) {
    const ultimo = p.carretera[p.carretera.length - 1];
    const d = Math.hypot(ultimo.x - p.plaza.x, ultimo.y - p.plaza.y) || 1;
    const borde = { x: p.plaza.x + ((ultimo.x - p.plaza.x) / d) * p.plaza.radio, y: p.plaza.y + ((ultimo.y - p.plaza.y) / d) * p.plaza.radio };
    ctx.strokeStyle = '#777';
    ctx.lineWidth = Math.max(3, 26 * vista.escala);
    ctx.beginPath();
    [...p.carretera, borde].forEach((v, i) => {
      const q = aPantalla(v);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
    p.carretera.forEach((v, i) => {
      const q = aPantalla(v);
      ctx.fillStyle = seleccion?.tipo === 'carretera' && seleccion.i === i ? '#ff0' : '#ddd';
      ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
    });
  }

  // Nodos de juego, con su número y su cota (la del relieve).
  const conAviso = new Set(validacion?.avisos.filter((a) => a.grave).flatMap((a) => a.nodos) ?? []);
  p.nodos.forEach((n, i) => {
    const q = aPantalla(n);
    const sel = seleccion?.tipo === 'nodo' && seleccion.i === i;
    if (conAviso.has(i)) {
      ctx.strokeStyle = '#d00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = sel ? '#ff0' : '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (n.tipo === 'base') ctx.rect(q.x - 6, q.y - 6, 12, 12);
    else if (n.tipo === 'cima') {
      ctx.moveTo(q.x, q.y - 9);
      ctx.lineTo(q.x + 8, q.y + 6);
      ctx.lineTo(q.x - 8, q.y + 6);
      ctx.closePath();
    } else ctx.arc(q.x, q.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    etiqueta({ x: q.x + 4, y: q.y + 4 }, `${i}·${nodosCota[i] ?? ''}`, '#003');
  });

  // Pincel.
  if (herramienta === 'roca' || herramienta === 'esquiable' || herramienta === 'borrarMascara') {
    const q = aPantalla(raton);
    ctx.strokeStyle = herramienta === 'roca' ? '#c00' : herramienta === 'esquiable' ? '#080' : '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(q.x, q.y, radioPincel * vista.escala, 0, Math.PI * 2);
    ctx.stroke();
  }

  const progreso = validando && !validacion?.completa ? ' · validando…' : '';
  estado.textContent = `${Math.round(raton.x)}, ${Math.round(raton.y)} m · cota ${cotaEn(raton)} m · ${herramienta}${progreso} · ${textoEstado}`;
}

function etiqueta(q: Punto, texto: string, color: string): void {
  ctx.font = '11px system-ui';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(texto, q.x + 8, q.y - 6);
  ctx.fillStyle = color;
  ctx.fillText(texto, q.x + 8, q.y - 6);
}

function bucle(): void {
  recalcular();
  // La validación avanza unos milisegundos por fotograma.
  if (validando) {
    const t0 = performance.now();
    let r = validando.next();
    while (!r.done && performance.now() - t0 < 10) r = validando.next();
    validacion = r.value;
    if (r.done) validando = null;
    pintarValidacion();
  }
  dibujar();
  requestAnimationFrame(bucle);
}

// ---- Panel ----

const panel = document.getElementById('panel')!;
const barra = document.getElementById('herramientas')!;

function pintarHerramientas(): void {
  const grupos: [string, [Herramienta, string, string][]][] = [
    ['Editar', [['mover', 'Seleccionar', 'V']]],
    [
      'Relieve',
      [
        ['punto', 'Punto de cota', 'P'],
        ['cresta', 'Línea cresta', 'C'],
        ['vaguada', 'Línea vaguada', 'G'],
      ],
    ],
    [
      'Roca',
      [
        ['roca', 'Forzar roca', 'R'],
        ['esquiable', 'Forzar esquiable', 'E'],
        ['borrarMascara', 'Borrar pincel', 'X'],
      ],
    ],
    [
      'Juego',
      [
        ['base', 'Base', '1'],
        ['intermedio', 'Intermedio', '2'],
        ['cima', 'Cima', '3'],
        ['plaza', 'Plaza', 'Z'],
        ['carretera', 'Carretera', 'T'],
      ],
    ],
  ];
  barra.innerHTML = '';
  for (const [titulo, botones] of grupos) {
    const h = document.createElement('h4');
    h.textContent = titulo;
    barra.append(h);
    for (const [id, texto, tecla] of botones) {
      const b = document.createElement('button');
      b.innerHTML = `${texto}<kbd>${tecla}</kbd>`;
      if (id === herramienta) b.className = 'activa';
      b.onclick = () => elegirHerramienta(id);
      barra.append(b);
    }
  }
  const ayuda = document.createElement('p');
  ayuda.style.cssText = 'color:#666;font-size:11px;line-height:1.4';
  ayuda.innerHTML =
    'Rueda: zoom · botón central, derecho o espacio: mover la vista · F: encajar · Supr: borrar · Mayús+rueda o +/−: cota del punto · Intro, Esc o doble clic: terminar línea · [ ]: radio del pincel · Ctrl+Z / Ctrl+Mayús+Z · Ctrl+S: guardar proyecto';
  barra.append(ayuda);
}

/** Crea un campo numérico enlazado. */
function numero(contenedor: HTMLElement, texto: string, leer: () => number, escribir: (v: number) => void, paso = 1, alCambiar: () => void = () => cambio()): HTMLInputElement {
  const l = document.createElement('label');
  l.append(texto);
  const i = document.createElement('input');
  i.type = 'number';
  i.step = String(paso);
  i.value = String(Math.round(leer() * 1000) / 1000);
  i.onchange = () => {
    const v = Number(i.value);
    if (!Number.isFinite(v)) return;
    apuntar();
    escribir(v);
    alCambiar();
  };
  l.append(i);
  contenedor.append(l);
  return i;
}

function texto(contenedor: HTMLElement, etiquetaTexto: string, leer: () => string, escribir: (v: string) => void): void {
  const l = document.createElement('label');
  l.append(etiquetaTexto);
  const i = document.createElement('input');
  i.type = 'text';
  i.value = leer();
  i.onchange = () => {
    apuntar();
    escribir(i.value);
    cambio();
  };
  l.append(i);
  contenedor.append(l);
}

function boton(contenedor: HTMLElement, textoBoton: string, accion: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = textoBoton;
  b.onclick = accion;
  contenedor.append(b);
  return b;
}

function seccion(titulo: string): HTMLElement {
  const s = document.createElement('section');
  const h = document.createElement('h4');
  h.textContent = titulo;
  s.append(h);
  panel.append(s);
  return s;
}

let cajaSeleccion: HTMLElement;
let cajaValidacion: HTMLElement;
let campoCota: HTMLInputElement | null = null;

function pintarPanel(): void {
  panel.innerHTML = '';
  // Salida primero: es lo que más se usa.
  const salida = seccion('Probar y exportar');
  const filaSalida = document.createElement('div');
  filaSalida.className = 'fila';
  salida.append(filaSalida);
  boton(filaSalida, '▶ Probar en el juego', probarEnJuego);
  boton(filaSalida, 'Exportar a carpeta…', exportarCarpeta);
  boton(filaSalida, 'Descargar ZIP', descargarZip);
  boton(filaSalida, 'Guardar proyecto', guardarProyecto);
  boton(filaSalida, 'Abrir proyecto…', () => abrirArchivo('.json', (t) => {
    apuntar();
    restaurar(t);
    encajar();
  }));

  const nivel = seccion('Nivel');
  texto(nivel, 'Carpeta (id)', () => p.id, (v) => (p.id = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')));
  texto(nivel, 'Nombre', () => p.nombre, (v) => (p.nombre = v));
  const retos = document.createElement('textarea');
  retos.value = JSON.stringify(p.retos, null, 1);
  retos.title = 'Retos (ver FORMATO_NIVEL.md)';
  retos.onchange = () => {
    try {
      apuntar();
      p.retos = JSON.parse(retos.value);
      mensaje('Retos actualizados');
    } catch {
      mensaje('Retos: JSON no válido');
    }
  };
  nivel.append('Retos:', retos);
  const pars = document.createElement('textarea');
  pars.value = JSON.stringify(p.parametros, null, 1);
  pars.title = 'Parámetros del nivel (ver FORMATO_NIVEL.md); el umbral de roca va aparte';
  pars.onchange = () => {
    try {
      apuntar();
      p.parametros = JSON.parse(pars.value);
      cambio();
    } catch {
      mensaje('Parámetros: JSON no válido');
    }
  };
  nivel.append('Parámetros:', pars);

  const mapa = seccion('Mapa');
  const tamano = (escribir: (v: number) => void) => (v: number) => {
    const { columnas, filas } = rejillaDe(p);
    escribir(v);
    ajustarMascara(p, columnas, filas);
  };
  numero(mapa, 'Ancho (m)', () => p.ancho, tamano((v) => (p.ancho = Math.max(500, v))), 100);
  numero(mapa, 'Alto (m)', () => p.alto, tamano((v) => (p.alto = Math.max(500, v))), 100);
  numero(mapa, 'Resolución (m/muestra)', () => p.resolucion, tamano((v) => (p.resolucion = Math.max(5, v))), 5);
  numero(mapa, 'Suavizado', () => p.suavizado, (v) => (p.suavizado = Math.max(0, v)), 0.001);
  numero(mapa, 'Rugosidad (m)', () => p.rugosidad, (v) => (p.rugosidad = Math.max(0, v)), 5);
  numero(mapa, 'Onda rugosidad (m)', () => p.ondaRugosidad, (v) => (p.ondaRugosidad = Math.max(50, v)), 50);
  numero(mapa, 'Semilla', () => p.semilla, (v) => (p.semilla = Math.round(v)), 1);
  numero(mapa, 'Umbral de roca', () => p.umbralRoca, (v) => (p.umbralRoca = Math.max(0.1, v)), 0.05);
  const filaMapa = document.createElement('div');
  filaMapa.className = 'fila';
  mapa.append(filaMapa);
  boton(filaMapa, 'Borrar máscara', () => {
    apuntar();
    p.mascara = null;
    cambio();
  });
  boton(filaMapa, 'Borrar carretera', () => {
    apuntar();
    p.carretera = [];
    cambio();
  });
  boton(filaMapa, 'Encajar (F)', encajar);
  const ver = document.createElement('div');
  ver.className = 'fila';
  mapa.append(ver);
  casilla(ver, 'Parejas', () => verParejas, (v) => (verParejas = v));
  casilla(ver, 'Máscara', () => verMascara, (v) => (verMascara = v));
  rango(mapa, 'Opacidad relieve', () => opacidadRelieve, (v) => (opacidadRelieve = v));

  const herramientas = seccion('Herramientas');
  const l = document.createElement('label');
  l.append('Clase de punto nuevo');
  const sel = document.createElement('select');
  for (const c of ['pico', 'intermedio', 'valle'] as ClasePunto[]) sel.add(new Option(c, c, c === clasePunto, c === clasePunto));
  sel.onchange = () => (clasePunto = sel.value as ClasePunto);
  l.append(sel);
  herramientas.append(l);
  numero(herramientas, 'Radio del pincel (m)', () => radioPincel, (v) => (radioPincel = Math.max(10, v)), 10, () => undefined);

  const fondo = seccion('Fondo para calcar');
  boton(fondo, 'Cargar imagen…', () =>
    abrirArchivo('image/*', (dataUrl) => {
      apuntar();
      p.fondo.imagen = dataUrl;
      cargarFondo();
    }, true),
  );
  boton(fondo, 'Quitar', () => {
    apuntar();
    p.fondo.imagen = null;
    fondoImg = null;
  });
  numero(fondo, 'Escala (m/píxel)', () => p.fondo.escala, (v) => (p.fondo.escala = Math.max(0.01, v)), 0.1, () => undefined);
  numero(fondo, 'Posición x (m)', () => p.fondo.x, (v) => (p.fondo.x = v), 10, () => undefined);
  numero(fondo, 'Posición y (m)', () => p.fondo.y, (v) => (p.fondo.y = v), 10, () => undefined);
  rango(fondo, 'Opacidad', () => p.fondo.opacidad, (v) => (p.fondo.opacidad = v));

  cajaSeleccion = seccion('Selección');
  pintarSeleccion();

  cajaValidacion = seccion('Validación');
  pintarValidacion();

  const al = seccion('Mapa aleatorio');
  const nAl = (t: string, k: keyof OpcionesAleatorio, paso: number) => numero(al, t, () => aleatorio[k], (v) => (aleatorio[k] = v), paso, () => undefined);
  nAl('Ancho (m)', 'ancho', 100);
  nAl('Alto (m)', 'alto', 100);
  nAl('Semilla', 'semilla', 1);
  nAl('Cumbres', 'cimas', 1);
  nAl('Cota valle (m)', 'cotaValle', 50);
  nAl('Cota cumbres (m)', 'cotaCumbre', 50);
  nAl('Separación nodos (m)', 'separacion', 50);
  nAl('Rugosidad (m)', 'rugosidad', 5);
  boton(al, 'Generar (sustituye el proyecto)', () => {
    const t0 = performance.now();
    const r = generarJugable(aleatorio);
    apuntar();
    p = r.proyecto;
    seleccion = null;
    fondoImg = null;
    aleatorio.semilla = r.proyecto.semilla + 1;
    encajar();
    cambio();
    pintarPanel();
    const graves = r.validacion.avisos.filter((a) => a.grave).length;
    mensaje(`Aleatorio con semilla ${r.proyecto.semilla} (${r.intentos} intento${r.intentos > 1 ? 's' : ''}, ${Math.round(performance.now() - t0)} ms, ${graves} avisos graves)`);
  });

  const nuevo = seccion('Proyecto nuevo');
  boton(nuevo, 'Nuevo (con el ancho y alto del mapa)', () => {
    apuntar();
    p = proyectoNuevo(p.ancho, p.alto);
    seleccion = null;
    fondoImg = null;
    encajar();
    cambio();
    pintarPanel();
  });
}

function casilla(contenedor: HTMLElement, textoCasilla: string, leer: () => boolean, escribir: (v: boolean) => void): void {
  const l = document.createElement('label');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = leer();
  i.onchange = () => escribir(i.checked);
  l.append(i, textoCasilla);
  l.style.justifyContent = 'flex-start';
  contenedor.append(l);
}

function rango(contenedor: HTMLElement, textoRango: string, leer: () => number, escribir: (v: number) => void): void {
  const l = document.createElement('label');
  l.append(textoRango);
  const i = document.createElement('input');
  i.type = 'range';
  i.min = '0';
  i.max = '1';
  i.step = '0.05';
  i.value = String(leer());
  i.oninput = () => escribir(Number(i.value));
  l.append(i);
  contenedor.append(l);
}

function pintarSeleccion(): void {
  if (!cajaSeleccion) return;
  cajaSeleccion.querySelectorAll(':scope > :not(h4)').forEach((e) => e.remove());
  campoCota = null;
  const s = seleccion;
  if (!s) {
    cajaSeleccion.append('Nada seleccionado.');
    return;
  }
  const pos = posicionDe(s)!;
  const recalc = () => cambio();
  if (s.tipo === 'punto') {
    const pt = p.puntos[s.i];
    campoCota = numero(cajaSeleccion, 'Cota (m)', () => pt.z, (v) => (pt.z = v), 10, recalc);
    const l = document.createElement('label');
    l.append('Clase');
    const sel = document.createElement('select');
    for (const c of ['pico', 'intermedio', 'valle'] as ClasePunto[]) sel.add(new Option(c, c, c === pt.clase, c === pt.clase));
    sel.onchange = () => {
      apuntar();
      pt.clase = sel.value as ClasePunto;
    };
    l.append(sel);
    cajaSeleccion.append(l);
  } else if (s.tipo === 'vertice') {
    const v = p.lineas[s.linea].vertices[s.i];
    campoCota = numero(cajaSeleccion, `Cota vértice ${s.i} (${p.lineas[s.linea].tipo}) (m)`, () => v.z, (x) => (v.z = x), 10, recalc);
  } else if (s.tipo === 'nodo') {
    const n = p.nodos[s.i];
    const l = document.createElement('label');
    l.append(`Nodo ${s.i}`);
    const sel = document.createElement('select');
    for (const t of ['base', 'intermedio', 'cima'] as TipoNodo[]) sel.add(new Option(t, t, t === n.tipo, t === n.tipo));
    sel.onchange = () => {
      apuntar();
      n.tipo = sel.value as TipoNodo;
      cambio();
    };
    l.append(sel);
    cajaSeleccion.append(l);
    const d = document.createElement('div');
    d.className = 'dato';
    d.textContent = `Cota (del relieve): ${cotaEn(n)} m`;
    cajaSeleccion.append(d);
  } else if (s.tipo === 'plaza') {
    numero(cajaSeleccion, 'Radio de la plaza (m)', () => p.plaza.radio, (v) => (p.plaza.radio = Math.max(50, v)), 10, recalc);
  } else if (s.tipo === 'carretera') {
    cajaSeleccion.append(`Vértice ${s.i} de la carretera (el final se une solo al borde de la plaza).`);
  }
  numero(cajaSeleccion, 'x (m)', () => pos.x, (v) => (pos.x = v), 10, recalc);
  numero(cajaSeleccion, 'y (m)', () => pos.y, (v) => (pos.y = v), 10, recalc);
  boton(cajaSeleccion, 'Borrar (Supr)', borrarSeleccion);
}

function enfocarCota(): void {
  if (campoCota) {
    campoCota.focus();
    campoCota.select();
  }
}

let firmaValidacion = '';
function pintarValidacion(): void {
  if (!cajaValidacion) return;
  const v = validacion;
  const firma = v ? `${v.completa}|${v.parejas.length}|${v.avisos.length}|${v.remontesBase.size}` : 'nada';
  if (firma === firmaValidacion) return;
  firmaValidacion = firma;
  cajaValidacion.querySelectorAll(':scope > :not(h4)').forEach((e) => e.remove());
  if (!v) {
    cajaValidacion.append('…');
    return;
  }
  const res = document.createElement('div');
  res.className = 'dato';
  const posibles = v.parejas.filter((x) => x.colores.length > 0).length;
  res.innerHTML =
    `${v.completa ? '' : 'Validando… '}${v.parejas.length} parejas, ${posibles} con pista posible.<br>` +
    COLORES.map((c, i) => `<span style="color:${COLOR_PISTA[c]}">■</span> ${c} ${v.porColor[i]}`).join(' · ') +
    `<br>Remonte asequible más barato por base (de ${CONFIG.economia.monedasIniciales}): ` +
    ([...v.remontesBase].map(([b, pr]) => `${b}: ${pr ?? '—'}`).join(', ') || '…');
  cajaValidacion.append(res);
  const ul = document.createElement('ul');
  ul.id = 'avisos';
  if (v.completa && v.avisos.length === 0) {
    const li = document.createElement('li');
    li.className = 'bien';
    li.textContent = 'Sin avisos.';
    ul.append(li);
  }
  for (const a of [...v.avisos].sort((x, y) => Number(y.grave) - Number(x.grave))) {
    const li = document.createElement('li');
    if (a.grave) li.className = 'grave';
    li.textContent = a.texto;
    li.onclick = () => {
      const n = a.nodos[0];
      if (n === undefined || !p.nodos[n]) return;
      seleccion = { tipo: 'nodo', i: n };
      const q = p.nodos[n];
      vista.x = lienzo.clientWidth / 2 - q.x * vista.escala;
      vista.y = lienzo.clientHeight / 2 - q.y * vista.escala;
      pintarSeleccion();
    };
    ul.append(li);
  }
  cajaValidacion.append(ul);
}

// ---- Archivos ----

function abrirArchivo(acepta: string, alLeer: (contenido: string) => void, comoDataUrl = false): void {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = acepta;
  i.onchange = () => {
    const f = i.files?.[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        alLeer(String(lector.result));
      } catch (e) {
        mensaje(`No se ha podido abrir: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    if (comoDataUrl) lector.readAsDataURL(f);
    else lector.readAsText(f);
  };
  i.click();
}

function cargarFondo(): void {
  fondoImg = null;
  if (!p.fondo.imagen) return;
  const img = new Image();
  img.onload = () => (fondoImg = img);
  img.src = p.fondo.imagen;
}

function descargar(nombre: string, datos: BlobPart, tipo: string): void {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function guardarProyecto(): void {
  descargar(`${p.id}.proyecto.json`, serializar(p), 'application/json');
  mensaje('Proyecto guardado (descargado)');
}

/** Grises de 8 bits como PNG (RGB con los tres canales iguales). */
async function pngGris(columnas: number, filas: number, gris: Uint8Array): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = columnas;
  c.height = filas;
  const img = new ImageData(columnas, filas);
  for (let i = 0; i < gris.length; i++) img.data.set([gris[i], gris[i], gris[i], 255], i * 4);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return lienzoAPng(c);
}

function lienzoAPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('no se pudo crear el PNG'))), 'image/png'));
}

/** Miniatura: el terreno con los colores del juego y la plaza, 240 px de ancho. */
async function miniatura(r: Relieve): Promise<Blob> {
  const ancho = 240;
  const alto = Math.round((ancho * p.alto) / p.ancho);
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const a = r.mapa.alturas;
  const t = document.createElement('canvas');
  t.width = a.columnas;
  t.height = a.filas;
  t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pintarTerreno(a, p.umbralRoca)), a.columnas, a.filas), 0, 0);
  g.drawImage(t, 0, 0, ancho, alto);
  g.fillStyle = 'rgb(240, 236, 226)';
  g.beginPath();
  g.arc((p.plaza.x / p.ancho) * ancho, (p.plaza.y / p.alto) * alto, (p.plaza.radio / p.ancho) * ancho, 0, Math.PI * 2);
  g.fill();
  return lienzoAPng(c);
}

/** Los archivos de la carpeta del nivel, comprobados con el lector del juego. */
async function archivosNivel(): Promise<{ nombre: string; datos: Uint8Array }[]> {
  const r = calcularRelieve(p);
  const json = nivelJson(p, r);
  leerNivel(json); // si el formato no vale, falla aquí con el motivo
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  const archivos = [
    { nombre: 'nivel.json', datos: new TextEncoder().encode(textoNivelJson(json)) },
    { nombre: 'alturas.png', datos: await bytes(await pngGris(r.rejilla.columnas, r.rejilla.filas, r.gris)) },
    { nombre: 'miniatura.png', datos: await bytes(await miniatura(r)) },
  ];
  if (r.mapa.alturas.mascara) archivos.push({ nombre: 'mascara.png', datos: await bytes(await pngGris(r.rejilla.columnas, r.rejilla.filas, grisDeMascara(r.mapa.alturas.mascara))) });
  return archivos;
}

async function descargarZip(): Promise<void> {
  try {
    const archivos = await archivosNivel();
    descargar(`${p.id}.zip`, crearZip(archivos.map((a) => ({ nombre: `${p.id}/${a.nombre}`, datos: a.datos }))) as BlobPart, 'application/zip');
    mensaje(`ZIP con niveles/${p.id}/ descargado. Añade { "id": "${p.id}" } a niveles/indice.json.`);
  } catch (e) {
    mensaje(`No se puede exportar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function exportarCarpeta(): Promise<void> {
  const elegir = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!elegir) {
    mensaje('Este navegador no permite escribir carpetas: se descarga un ZIP.');
    return descargarZip();
  }
  try {
    const archivos = await archivosNivel();
    const raiz = await elegir({ mode: 'readwrite' });
    // Si se elige la carpeta niveles/ del juego (o cualquier otra), se crea <id>/ dentro.
    const destino = raiz.name === p.id ? raiz : await raiz.getDirectoryHandle(p.id, { create: true });
    for (const a of archivos) {
      const f = await destino.getFileHandle(a.nombre, { create: true });
      const w = await f.createWritable();
      await w.write(a.datos as BlobPart);
      await w.close();
    }
    mensaje(`Escrito ${destino.name}/ (${archivos.map((a) => a.nombre).join(', ')}). Añade { "id": "${p.id}" } a niveles/indice.json si es nuevo.`);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    mensaje(`No se puede exportar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Deja el nivel en el almacenamiento del navegador y abre el juego con ?prueba. */
async function probarEnJuego(): Promise<void> {
  try {
    const r = calcularRelieve(p);
    const json = nivelJson(p, r);
    leerNivel(json);
    const aDataUrl = (b: Blob) => new Promise<string>((ok) => {
      const l = new FileReader();
      l.onload = () => ok(String(l.result));
      l.readAsDataURL(b);
    });
    const alturas = await aDataUrl(await pngGris(r.rejilla.columnas, r.rejilla.filas, r.gris));
    const mascara = r.mapa.alturas.mascara ? await aDataUrl(await pngGris(r.rejilla.columnas, r.rejilla.filas, grisDeMascara(r.mapa.alturas.mascara))) : null;
    localStorage.setItem('remontes.nivelPrueba', JSON.stringify({ json, alturas, mascara }));
    window.open(new URL('../../?prueba', location.href).href, 'remontes-prueba');
    mensaje('Abierto en el juego (pestaña «remontes-prueba»).');
  } catch (e) {
    mensaje(`No se puede probar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---- Arranque ----

pintarHerramientas();
pintarPanel();
cargarFondo();
requestAnimationFrame(() => {
  encajar();
  cambio();
  bucle();
});
