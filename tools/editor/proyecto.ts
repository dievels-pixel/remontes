// Proyecto del editor: todo lo editable (puntos de cota, líneas, nodos,
// plaza, carretera, máscara, fondo, retos) y cómo se convierte en el mapa del
// juego y en la carpeta del nivel. Lógica pura: sin DOM.
import { CONFIG } from '../../src/config';
import { MASCARA } from '../../src/core/alturas';
import { montarMapa, type DatosMapa, type Mapa } from '../../src/core/mapa';
import { FORMATO_NIVEL, type ParametrosNivel } from '../../src/core/nivel';
import type { TipoNodo } from '../../src/core/red';
import type { Reto } from '../../src/core/retos';
import type { Punto } from '../../src/core/vector';
import { aGrises, calcularSuperficie, muestrearLinea, tamanoRejilla, type ParametrosSuperficie, type PuntoCota, type Rejilla } from './superficie';

export type ClasePunto = 'pico' | 'intermedio' | 'valle';
export type TipoLinea = 'cresta' | 'vaguada';

export interface PuntoDeCota extends PuntoCota {
  clase: ClasePunto;
}

export interface Linea {
  tipo: TipoLinea;
  vertices: PuntoCota[];
}

export interface Fondo {
  /** Imagen como data URL, o null. */
  imagen: string | null;
  /** Metros por píxel de la imagen (escala del plano que se calca). */
  escala: number;
  /** Posición de su esquina superior izquierda en el mapa (m). */
  x: number;
  y: number;
  opacidad: number;
}

export interface Proyecto extends ParametrosSuperficie {
  version: 1;
  /** Carpeta del nivel (niveles/<id>/). */
  id: string;
  nombre: string;
  /** Umbral de pendiente de la roca automática (se guarda en parametros.terreno si cambia). */
  umbralRoca: number;
  puntos: PuntoDeCota[];
  lineas: Linea[];
  nodos: { tipo: TipoNodo; x: number; y: number }[];
  plaza: Punto & { radio: number };
  /** Carretera (sin el punto final, que se pega al borde de la plaza). Vacía: la calcula el juego. */
  carretera: Punto[];
  /** Máscara de roca en la rejilla del mapa de alturas (ver MASCARA), o null. */
  mascara: Uint8Array | null;
  fondo: Fondo;
  retos: Reto[];
  /** Otros parámetros de balance del nivel (ver FORMATO_NIVEL.md). */
  parametros: ParametrosNivel;
}

export const RETOS_POR_DEFECTO: Reto[] = [
  { tipo: 'dias', n: 4 },
  { tipo: 'satisfechos', n: 600 },
  { tipo: 'bajadasNegros', n: 1000 },
];

export function proyectoNuevo(ancho = 4000, alto = 6000): Proyecto {
  const plaza = { x: ancho / 2, y: alto - 260, radio: 200 };
  return {
    version: 1,
    id: 'nuevo',
    nombre: 'Nuevo',
    ancho,
    alto,
    resolucion: 20,
    suavizado: 0.002,
    rugosidad: 25,
    ondaRugosidad: 700,
    semilla: 1,
    umbralRoca: CONFIG.terreno.umbralRoca,
    puntos: [
      { x: ancho / 2, y: alto - 150, z: 1400, clase: 'valle' },
      { x: ancho / 2, y: alto * 0.2, z: 2600, clase: 'pico' },
      { x: ancho * 0.15, y: alto * 0.6, z: 1900, clase: 'intermedio' },
      { x: ancho * 0.85, y: alto * 0.6, z: 1900, clase: 'intermedio' },
    ],
    lineas: [],
    nodos: [
      { tipo: 'base', x: plaza.x - 350, y: plaza.y - 80 },
      { tipo: 'base', x: plaza.x, y: plaza.y - 300 },
      { tipo: 'base', x: plaza.x + 350, y: plaza.y - 80 },
    ],
    plaza,
    carretera: [],
    mascara: null,
    fondo: { imagen: null, escala: 5, x: 0, y: 0, opacidad: 0.5 },
    retos: RETOS_POR_DEFECTO.map((r) => ({ ...r })),
    parametros: {},
  };
}

/** Puntos de control de la superficie: los de cota y las muestras de las líneas. */
export function puntosDeControl(p: Proyecto): PuntoCota[] {
  const paso = Math.max(120, p.resolucion * 6);
  return [...p.puntos.map(({ x, y, z }) => ({ x, y, z })), ...p.lineas.flatMap((l) => muestrearLinea(l.vertices, paso))];
}

/** Columnas y filas del mapa de alturas del proyecto. */
export function rejillaDe(p: Proyecto): { columnas: number; filas: number } {
  return tamanoRejilla(p);
}

/** La máscara redimensionada (vecino más cercano) a la rejilla actual, si cambió el tamaño. */
export function ajustarMascara(p: Proyecto, columnasAntes: number, filasAntes: number): void {
  const { columnas, filas } = rejillaDe(p);
  if (!p.mascara || (columnas === columnasAntes && filas === filasAntes)) return;
  const nueva = new Uint8Array(columnas * filas);
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      const ia = Math.min(columnasAntes - 1, Math.round((i / (columnas - 1)) * (columnasAntes - 1)));
      const ja = Math.min(filasAntes - 1, Math.round((j / (filas - 1)) * (filasAntes - 1)));
      nueva[j * columnas + i] = p.mascara[ja * columnasAntes + ia];
    }
  }
  p.mascara = nueva;
}

/** Pinta la máscara en un círculo (m). `valor`: MASCARA.roca, MASCARA.esquiable o MASCARA.auto (borrar). */
export function pintarMascara(p: Proyecto, centro: Punto, radio: number, valor: number): void {
  const { columnas, filas } = rejillaDe(p);
  if (!p.mascara || p.mascara.length !== columnas * filas) p.mascara = new Uint8Array(columnas * filas);
  const dx = p.ancho / (columnas - 1);
  const dy = p.alto / (filas - 1);
  const i0 = Math.max(0, Math.floor((centro.x - radio) / dx));
  const i1 = Math.min(columnas - 1, Math.ceil((centro.x + radio) / dx));
  const j0 = Math.max(0, Math.floor((centro.y - radio) / dy));
  const j1 = Math.min(filas - 1, Math.ceil((centro.y + radio) / dy));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((i * dx - centro.x) ** 2 + (j * dy - centro.y) ** 2 <= radio * radio) p.mascara[j * columnas + i] = valor;
}

export interface Relieve {
  rejilla: Rejilla;
  gris: Uint8Array;
  cotaMin: number;
  cotaMax: number;
  datos: DatosMapa;
  /** El mapa tal como lo verá el juego (grises de 8 bits, mismo suavizado, máscara). */
  mapa: Mapa;
}

/** Carretera tal como se exporta: la dibujada más un punto final en el borde de la plaza. */
export function carreteraExportada(p: Proyecto): Punto[] | undefined {
  if (p.carretera.length === 0) return undefined;
  const ultimo = p.carretera[p.carretera.length - 1];
  const d = Math.hypot(ultimo.x - p.plaza.x, ultimo.y - p.plaza.y) || 1;
  const borde = { x: p.plaza.x + ((ultimo.x - p.plaza.x) / d) * p.plaza.radio, y: p.plaza.y + ((ultimo.y - p.plaza.y) / d) * p.plaza.radio };
  const r = (q: Punto) => ({ x: Math.round(q.x), y: Math.round(q.y) });
  return [...p.carretera.map(r), r(borde)];
}

/** Datos del mapa (los campos de mapa de nivel.json). */
export function datosMapa(p: Proyecto, cotaMin: number, cotaMax: number): DatosMapa {
  const r = (v: number) => Math.round(v);
  const carretera = carreteraExportada(p);
  return {
    nombre: p.nombre,
    ancho: r(p.ancho),
    alto: r(p.alto),
    cotaMin,
    cotaMax,
    plaza: { x: r(p.plaza.x), y: r(p.plaza.y), radio: r(p.plaza.radio) },
    nodos: p.nodos.map((n) => ({ tipo: n.tipo, x: r(n.x), y: r(n.y) })),
    ...(carretera ? { carretera } : {}),
  };
}

/** Parámetros del nivel: los del proyecto más el umbral de roca si no es el del juego. */
export function parametrosNivel(p: Proyecto): ParametrosNivel {
  const parametros = structuredClone(p.parametros) as ParametrosNivel;
  if (Math.abs(p.umbralRoca - CONFIG.terreno.umbralRoca) > 1e-9) parametros.terreno = { ...((parametros.terreno as object) ?? {}), umbralRoca: p.umbralRoca };
  return parametros;
}

/** Relieve completo: superficie, grises, datos del mapa y el mapa como lo verá el juego. */
export function calcularRelieve(p: Proyecto): Relieve {
  const rejilla = calcularSuperficie(puntosDeControl(p), p);
  const { gris, cotaMin, cotaMax } = aGrises(rejilla);
  const datos = datosMapa(p, cotaMin, cotaMax);
  const mapa = montarMapa(datos, rejilla.columnas, rejilla.filas, gris);
  if (p.mascara && p.mascara.length === gris.length && p.mascara.some((v) => v !== MASCARA.auto)) mapa.alturas.mascara = p.mascara;
  return { rejilla, gris, cotaMin, cotaMax, datos, mapa };
}

/** Contenido de nivel.json. */
export function nivelJson(p: Proyecto, relieve: Pick<Relieve, 'cotaMin' | 'cotaMax'>): Record<string, unknown> {
  const { nodos, ...mapa } = datosMapa(p, relieve.cotaMin, relieve.cotaMax);
  return { formato: FORMATO_NIVEL, ...mapa, parametros: parametrosNivel(p), retos: p.retos, nodos };
}

/** nivel.json como texto, con un nodo por línea (como el de Espot). */
export function textoNivelJson(json: Record<string, unknown>): string {
  const { nodos, ...resto } = json as { nodos: unknown[] };
  const cabeza = JSON.stringify(resto, null, 2);
  return `${cabeza.slice(0, -2)},\n  "nodos": [\n${nodos.map((n) => `    ${JSON.stringify(n)}`).join(',\n')}\n  ]\n}\n`;
}

// ---- Guardar y abrir el proyecto ----

/** Máscara comprimida por tramos (valor, longitud), en texto. */
function comprimir(m: Uint8Array): string {
  const r: number[] = [];
  for (let i = 0; i < m.length; ) {
    let k = i;
    while (k < m.length && m[k] === m[i]) k++;
    r.push(m[i], k - i);
    i = k;
  }
  return r.join(',');
}

function descomprimir(texto: string, longitud: number): Uint8Array {
  const m = new Uint8Array(longitud);
  const v = texto.split(',').map(Number);
  let o = 0;
  for (let i = 0; i + 1 < v.length; i += 2) {
    m.fill(v[i], o, Math.min(longitud, o + v[i + 1]));
    o += v[i + 1];
  }
  return m;
}

/** Proyecto como JSON para guardarlo y retomarlo. */
export function serializar(p: Proyecto): string {
  const { mascara, ...resto } = p;
  const { columnas, filas } = rejillaDe(p);
  return JSON.stringify({ ...resto, mascara: mascara ? { columnas, filas, tramos: comprimir(mascara) } : null });
}

/** Lee un proyecto guardado; completa lo que falte con los valores de un proyecto nuevo. */
export function deserializar(texto: string): Proyecto {
  const o = JSON.parse(texto) as Partial<Proyecto> & { mascara?: { columnas: number; filas: number; tramos: string } | null };
  if (o.version !== 1) throw new Error('No es un proyecto del editor de mapas (falta "version": 1)');
  const base = proyectoNuevo(o.ancho, o.alto);
  const { mascara, ...resto } = o;
  const p: Proyecto = { ...base, ...resto, fondo: { ...base.fondo, ...(o.fondo ?? {}) }, mascara: null } as Proyecto;
  if (mascara) {
    p.mascara = descomprimir(mascara.tramos, mascara.columnas * mascara.filas);
    ajustarMascara(p, mascara.columnas, mascara.filas);
  }
  return p;
}
