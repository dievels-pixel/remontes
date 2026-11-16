// Nivel como datos: una carpeta con el JSON del nivel (mapa, parámetros
// propios y retos), el PNG de alturas y una miniatura, listada en el índice
// de niveles. El formato está documentado en FORMATO_NIVEL.md. Aquí solo la
// parte pura: validar los JSON.
import { leerDatosMapa, type DatosMapa } from './mapa';
import { leerRetos, type Reto } from './retos';

/** Versión del formato que entiende este código. */
export const FORMATO_NIVEL = 1;

/** Parámetros de balance que el nivel cambia respecto a src/config.ts (parcial, por bloques). */
export type ParametrosNivel = Record<string, unknown>;

export interface DatosNivel {
  /** Mapa: nombre, tamaño, cotas, plaza y nodos. */
  mapa: DatosMapa;
  parametros: ParametrosNivel;
  retos: Reto[];
}

/** Entrada del índice de niveles. */
export interface EntradaIndice {
  /** Nombre de la carpeta del nivel dentro de niveles/. */
  id: string;
  /** Aún no se puede jugar: se muestra como «próximamente» y no tiene carpeta. */
  bloqueado: boolean;
  /** Nombre que se muestra si el nivel está bloqueado (los jugables lo llevan en su JSON). */
  nombre?: string;
}

const fallo = (m: string): never => {
  throw new Error(`Nivel no válido: ${m}`);
};

/** Comprueba el JSON de un nivel y lo devuelve tipado. */
export function leerNivel(json: unknown): DatosNivel {
  const o = json as Record<string, unknown>;
  if (typeof o !== 'object' || o === null) fallo('no es un objeto');
  if (o.formato !== undefined && o.formato !== FORMATO_NIVEL) fallo(`formato ${String(o.formato)} desconocido (este juego entiende el ${FORMATO_NIVEL})`);
  const mapa = leerDatosMapa(o);
  const parametros = o.parametros ?? {};
  if (typeof parametros !== 'object' || parametros === null || Array.isArray(parametros)) fallo('parametros debe ser un objeto');
  return { mapa, parametros: parametros as ParametrosNivel, retos: leerRetos(o.retos) };
}

/** Comprueba el índice de niveles. */
export function leerIndice(json: unknown): EntradaIndice[] {
  const o = json as Record<string, unknown>;
  if (typeof o !== 'object' || o === null || !Array.isArray(o.niveles)) fallo('el índice necesita una lista «niveles»');
  const vistos = new Set<string>();
  const entradas = (o.niveles as unknown[]).map((x, i) => {
    const e = x as Record<string, unknown>;
    if (typeof e?.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) fallo(`la entrada ${i} del índice necesita un id en minúsculas, cifras y guiones`);
    const id = e.id as string;
    if (vistos.has(id)) fallo(`el id «${id}» está repetido en el índice`);
    vistos.add(id);
    return { id, bloqueado: e.bloqueado === true, nombre: typeof e.nombre === 'string' ? e.nombre : undefined };
  });
  if (!entradas.some((e) => !e.bloqueado)) fallo('el índice necesita al menos un nivel jugable');
  return entradas;
}

/**
 * Mezcla los parámetros del nivel sobre una copia de la configuración: los
 * objetos se mezclan clave a clave; números, textos y listas se sustituyen.
 * Una clave que no existe en la configuración es un error (casi siempre, una
 * errata en el JSON).
 */
export function aplicarParametros<T extends object>(config: T, parametros: ParametrosNivel, ruta = 'parametros'): T {
  const copia = (Array.isArray(config) ? [...config] : { ...config }) as Record<string, unknown>;
  for (const [k, v] of Object.entries(copia)) if (v && typeof v === 'object') copia[k] = aplicarParametros(v as object, {}, `${ruta}.${k}`);
  for (const [k, v] of Object.entries(parametros)) {
    if (!(k in copia)) fallo(`${ruta}.${k} no existe en la configuración`);
    const actual = copia[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!actual || typeof actual !== 'object' || Array.isArray(actual)) fallo(`${ruta}.${k} no es un bloque`);
      copia[k] = aplicarParametros(actual as object, v as ParametrosNivel, `${ruta}.${k}`);
    } else {
      if (actual && typeof actual === 'object' && !Array.isArray(actual)) fallo(`${ruta}.${k} es un bloque, no un valor`);
      copia[k] = v;
    }
  }
  return copia as T;
}
