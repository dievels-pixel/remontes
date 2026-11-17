// Mapa como datos: un PNG de alturas en escala de grises y un JSON con los
// nodos (tipo y posición; la cota sale del PNG) y los parámetros propios del
// mapa. Aquí solo la parte pura: validar el JSON y montar alturas y nodos a
// partir de los grises ya leídos (el PNG lo decodifica quien lo carga).
import { MapaAlturas, MASCARA } from './alturas';
import type { Nodo, TipoNodo } from './red';
import type { Punto } from './vector';

export interface DefinicionNodo {
  tipo: TipoNodo;
  x: number;
  y: number;
}

/** Contenido del JSON de un mapa. Distancias en metros. */
export interface DatosMapa {
  nombre: string;
  /** Tamaño del mundo que cubre el PNG de alturas. */
  ancho: number;
  alto: number;
  /** Cotas que representan el negro (0) y el blanco (255) del PNG. */
  cotaMin: number;
  cotaMax: number;
  /** Plaza del pie de pistas: punto de entrada y obstáculo para las pistas. */
  plaza: Punto & { radio: number };
  nodos: DefinicionNodo[];
  /**
   * Carretera de acceso (polilínea; el último punto es la entrada, en el
   * borde de la plaza). Si falta, el juego la traza desde el sureste.
   */
  carretera?: Punto[];
}

/** Mapa listo para jugar. */
export interface Mapa {
  datos: DatosMapa;
  alturas: MapaAlturas;
}

const TIPOS: readonly TipoNodo[] = ['base', 'intermedio', 'cima'];

/** Comprueba la forma del JSON y devuelve los datos tipados; si algo falla, explica qué. */
export function leerDatosMapa(json: unknown): DatosMapa {
  const fallo = (m: string): never => {
    throw new Error(`Mapa no válido: ${m}`);
  };
  const o = json as Record<string, unknown>;
  if (typeof o !== 'object' || o === null) fallo('no es un objeto');
  const num = (v: unknown, nombre: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fallo(`${nombre} debe ser un número`));
  const ancho = num(o.ancho, 'ancho');
  const alto = num(o.alto, 'alto');
  const cotaMin = num(o.cotaMin, 'cotaMin');
  const cotaMax = num(o.cotaMax, 'cotaMax');
  if (ancho <= 0 || alto <= 0) fallo('ancho y alto deben ser positivos');
  if (cotaMax <= cotaMin) fallo('cotaMax debe ser mayor que cotaMin');
  const p = o.plaza as Record<string, unknown>;
  if (typeof p !== 'object' || p === null) fallo('falta la plaza');
  const plaza = { x: num(p.x, 'plaza.x'), y: num(p.y, 'plaza.y'), radio: num(p.radio, 'plaza.radio') };
  if (!Array.isArray(o.nodos) || o.nodos.length === 0) fallo('faltan los nodos');
  const nodos = (o.nodos as unknown[]).map((n, i) => {
    const d = n as Record<string, unknown>;
    if (!TIPOS.includes(d?.tipo as TipoNodo)) fallo(`el nodo ${i} tiene un tipo desconocido (${String(d?.tipo)})`);
    const x = num(d.x, `nodos[${i}].x`);
    const y = num(d.y, `nodos[${i}].y`);
    if (x < 0 || y < 0 || x > ancho || y > alto) fallo(`el nodo ${i} está fuera del mapa`);
    return { tipo: d.tipo as TipoNodo, x, y };
  });
  if (!nodos.some((n) => n.tipo === 'base')) fallo('hace falta al menos una base');
  let carretera: Punto[] | undefined;
  if (o.carretera !== undefined) {
    if (!Array.isArray(o.carretera) || o.carretera.length < 2) fallo('carretera debe ser una lista de al menos dos puntos');
    carretera = (o.carretera as unknown[]).map((q, i) => {
      const c = q as Record<string, unknown>;
      return { x: num(c?.x, `carretera[${i}].x`), y: num(c?.y, `carretera[${i}].y`) };
    });
  }
  return { nombre: typeof o.nombre === 'string' ? o.nombre : 'Sin nombre', ancho, alto, cotaMin, cotaMax, plaza, nodos, ...(carretera ? { carretera } : {}) };
}

/**
 * Alturas a partir de los grises del PNG (0..255, por filas). Se suavizan con
 * un filtro [1 2 1] en cada dirección: con 8 bits cada nivel de gris son
 * varios metros, y sin suavizar, la pendiente local (y con ella la roca) sale
 * moteada en las laderas cercanas al umbral.
 */
export function alturasDesdeGris(datos: DatosMapa, columnas: number, filas: number, gris: ArrayLike<number>): MapaAlturas {
  if (gris.length !== columnas * filas) throw new Error('Mapa no válido: el PNG no tiene el tamaño que dice');
  const v = (x: number, y: number) => gris[Math.min(Math.max(y, 0), filas - 1) * columnas + Math.min(Math.max(x, 0), columnas - 1)];
  const h = new Float32Array(columnas * filas);
  for (let y = 0; y < filas; y++) for (let x = 0; x < columnas; x++) h[y * columnas + x] = (v(x - 1, y) + 2 * v(x, y) + v(x + 1, y)) / 4;
  const g = new Float32Array(columnas * filas);
  const hv = (x: number, y: number) => h[Math.min(Math.max(y, 0), filas - 1) * columnas + x];
  for (let y = 0; y < filas; y++) for (let x = 0; x < columnas; x++) g[y * columnas + x] = (hv(x, y - 1) + 2 * hv(x, y) + hv(x, y + 1)) / 4 / 255;
  return new MapaAlturas(columnas, filas, datos.ancho, datos.alto, datos.cotaMin, datos.cotaMax, g);
}

/**
 * Máscara de roca a partir de los grises de mascara.png (0..255, por filas):
 * negro, automático; blanco (más de 191), roca forzada; gris medio (de 64 a
 * 191), esquiable forzado. Debe tener el tamaño del PNG de alturas.
 */
export function mascaraDesdeGris(columnas: number, filas: number, gris: ArrayLike<number>): Uint8Array {
  if (gris.length !== columnas * filas) throw new Error('Nivel no válido: mascara.png no tiene el tamaño de alturas.png');
  const m = new Uint8Array(gris.length);
  for (let i = 0; i < gris.length; i++) m[i] = gris[i] > 191 ? MASCARA.roca : gris[i] >= 64 ? MASCARA.esquiable : MASCARA.auto;
  return m;
}

/** La máscara como grises para mascara.png (inversa de mascaraDesdeGris). */
export function grisDeMascara(m: ArrayLike<number>): Uint8Array {
  const g = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) g[i] = m[i] === MASCARA.roca ? 255 : m[i] === MASCARA.esquiable ? 128 : 0;
  return g;
}

/** Mapa listo para jugar a partir de los grises de alturas.png y, si hay, de mascara.png. */
export function montarMapa(datos: DatosMapa, columnas: number, filas: number, gris: ArrayLike<number>, grisMascara?: ArrayLike<number> | null): Mapa {
  const alturas = alturasDesdeGris(datos, columnas, filas, gris);
  if (grisMascara) alturas.mascara = mascaraDesdeGris(columnas, filas, grisMascara);
  return { datos, alturas };
}

export function crearNodos(alturas: MapaAlturas, definicion: readonly DefinicionNodo[]): Nodo[] {
  return definicion.map((d, id) => ({ id, ...d, cota: Math.round(alturas.cotaEn(d)) }));
}
