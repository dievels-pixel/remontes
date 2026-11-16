// Retos de un nivel: se definen en su JSON y se comprueban al acabar la
// partida a partir de un resumen de lo ocurrido. Lógica pura.

export type Reto =
  /** Sobrevivir N días. */
  | { tipo: 'dias'; n: number }
  /** N esquiadores satisfechos (los que se van cansados, sin queja). */
  | { tipo: 'satisfechos'; n: number }
  /** N bajadas completadas por esquiadores negros. */
  | { tipo: 'bajadasNegros'; n: number }
  /** No tener nunca una telecabina (habiendo sobrevivido `dias`, si se indica). */
  | { tipo: 'sinTelecabinas'; dias?: number }
  /** No pasar nunca de N remontes a la vez (habiendo sobrevivido `dias`, si se indica). */
  | { tipo: 'maxRemontes'; n: number; dias?: number }
  /** Acabar sin ninguna pista forzada (habiendo sobrevivido `dias`, si se indica). */
  | { tipo: 'sinForzadas'; dias?: number };

export const TIPOS_DE_RETO = ['dias', 'satisfechos', 'bajadasNegros', 'sinTelecabinas', 'maxRemontes', 'sinForzadas'] as const;

/** Lo que se sabe de una partida al acabar. */
export interface ResumenPartida {
  /** Días sobrevividos (con decimales). */
  dias: number;
  satisfechos: number;
  enfadados: number;
  bajadasNegros: number;
  /** Máximo de remontes a la vez durante la partida. */
  maxRemontes: number;
  /** Máximo de telecabinas a la vez durante la partida. */
  maxTelecabinas: number;
  /** Pistas forzadas abiertas al acabar. */
  pistasForzadas: number;
}

export function retoConseguido(r: Reto, p: ResumenPartida): boolean {
  const aguanto = (dias?: number) => dias === undefined || p.dias >= dias;
  switch (r.tipo) {
    case 'dias':
      return p.dias >= r.n;
    case 'satisfechos':
      return p.satisfechos >= r.n;
    case 'bajadasNegros':
      return p.bajadasNegros >= r.n;
    case 'sinTelecabinas':
      return p.maxTelecabinas === 0 && aguanto(r.dias);
    case 'maxRemontes':
      return p.maxRemontes <= r.n && p.maxRemontes > 0 && aguanto(r.dias);
    case 'sinForzadas':
      return p.pistasForzadas === 0 && aguanto(r.dias);
  }
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Texto corto del reto para la pantalla. */
export function textoReto(r: Reto): string {
  const con = (d?: number) => (d === undefined ? '' : `${dias(d)} `);
  switch (r.tipo) {
    case 'dias':
      return `Sobrevive ${dias(r.n)}`;
    case 'satisfechos':
      return `${r.n} esquiadores satisfechos`;
    case 'bajadasNegros':
      return `${r.n} bajadas de negros`;
    case 'sinTelecabinas':
      return `${con(r.dias)}sin telecabinas`.replace(/^./, (c) => c.toUpperCase());
    case 'maxRemontes':
      return `${con(r.dias)}con ${r.n} remontes como máximo`.replace(/^./, (c) => c.toUpperCase());
    case 'sinForzadas':
      return `${con(r.dias)}sin pistas forzadas`.replace(/^./, (c) => c.toUpperCase());
  }
}

/** Valida los retos del JSON de un nivel; si algo falla, explica qué. */
export function leerRetos(json: unknown): Reto[] {
  if (json === undefined) return [];
  const fallo = (m: string): never => {
    throw new Error(`Nivel no válido: ${m}`);
  };
  if (!Array.isArray(json)) return fallo('retos debe ser una lista');
  return json.map((x, i) => {
    const o = x as Record<string, unknown>;
    const tipo = o?.tipo as Reto['tipo'];
    if (!TIPOS_DE_RETO.includes(tipo)) fallo(`el reto ${i} tiene un tipo desconocido (${String(o?.tipo)})`);
    const positivo = (v: unknown, nombre: string) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallo(`el reto ${i} necesita ${nombre} positivo`));
    const opcional = (v: unknown) => (v === undefined ? undefined : positivo(v, 'dias'));
    switch (tipo) {
      case 'dias':
      case 'satisfechos':
      case 'bajadasNegros':
        return { tipo, n: positivo(o.n, 'n') };
      case 'maxRemontes':
        return { tipo, n: positivo(o.n, 'n'), dias: opcional(o.dias) };
      default:
        return { tipo, dias: opcional(o.dias) };
    }
  });
}
