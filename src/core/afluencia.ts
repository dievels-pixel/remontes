// Afluencia de esquiadores: curva por escalones en función del tiempo, mezcla
// de niveles también en función del tiempo, carretera de acceso y edificios
// decorativos alrededor de la plaza (ver «Pie de pistas y afluencia» en la
// especificación). Nada de esto depende de lo construido.
//
// El tiempo es el de la estación abierta: cuenta desde que hay algún remonte
// en servicio (antes no llega nadie).
//
// Cada `intervalo` segundos la curva sube un escalón: aparece un edificio y,
// `retraso` segundos después, se aplica la afluencia nueva (margen de
// reacción, como una estación nueva en Mini Metro).
// Lógica pura: ni DOM ni canvas.
import type { Punto } from './vector';

export interface ParametrosAfluencia {
  /** Segundos entre escalones. */
  intervalo: number;
  /** Segundos entre que aparece el edificio y se aplica el escalón. */
  retraso: number;
  /** Llegadas por minuto del escalón 0. */
  tasaInicial: number;
  /** Llegadas por minuto que suma cada escalón. */
  incremento: number;
  /**
   * Mezcla de niveles (pesos de verde, azul, roja y negra) en algunos
   * minutos; entre ellos se interpola y después del último se mantiene.
   */
  mezcla: readonly { minuto: number; pesos: readonly number[] }[];
}

/** Escalones alcanzados en el instante t (edificios que se ven): 0 al abrir. */
export function escalonVisible(t: number, p: ParametrosAfluencia): number {
  return Math.max(0, Math.floor(t / p.intervalo));
}

/** Escalón que manda en la afluencia en el instante t (el visible, con retraso). */
export function escalonEfectivo(t: number, p: ParametrosAfluencia): number {
  return Math.max(0, Math.floor((t - p.retraso) / p.intervalo));
}

/** Llegadas por minuto en el instante t. */
export function tasaEn(t: number, p: ParametrosAfluencia): number {
  return p.tasaInicial + p.incremento * escalonEfectivo(t, p);
}

/**
 * Mezcla de niveles en el instante t: la de la curva en el minuto en que
 * empezó el escalón efectivo, para que cambie a la vez que la tasa.
 */
export function mezclaEn(t: number, p: ParametrosAfluencia): number[] {
  return mezclaEnMinuto((escalonEfectivo(t, p) * p.intervalo) / 60, p.mezcla);
}

export function mezclaEnMinuto(minuto: number, claves: ParametrosAfluencia['mezcla']): number[] {
  if (claves.length === 0) return [1, 0, 0, 0];
  if (minuto <= claves[0].minuto) return [...claves[0].pesos];
  for (let i = 1; i < claves.length; i++) {
    const a = claves[i - 1];
    const b = claves[i];
    if (minuto <= b.minuto) {
      const f = (minuto - a.minuto) / (b.minuto - a.minuto);
      return a.pesos.map((w, k) => w + (b.pesos[k] - w) * f);
    }
  }
  return [...claves[claves.length - 1].pesos];
}

/**
 * Carretera de acceso: recta desde el borde lateral más cercano del mapa
 * hasta el borde de la plaza, entrando algo por debajo de su centro (las
 * bases están por encima y a los lados). El último punto es la entrada.
 */
export function trazarCarretera(plaza: Punto & { radio: number }, anchoMapa: number): Punto[] {
  const haciaDerecha = anchoMapa - plaza.x <= plaza.x;
  const dy = plaza.radio * 0.5;
  const dx = Math.sqrt(plaza.radio * plaza.radio - dy * dy) * (haciaDerecha ? 1 : -1);
  const y = plaza.y + dy;
  return [
    { x: haciaDerecha ? anchoMapa : 0, y },
    { x: plaza.x + dx, y },
  ];
}

/**
 * Huecos predefinidos para los edificios: repartidos en un anillo dentro de
 * la plaza, sin tapar la entrada de la carretera. Se devuelven en el orden en
 * que se llenan: los de arriba primero.
 */
export function huecosPlaza(plaza: Punto & { radio: number }, entrada: Punto, cuantos: number): Punto[] {
  const angEntrada = Math.atan2(entrada.y - plaza.y, entrada.x - plaza.x);
  const libre = (Math.PI * 2) / (cuantos + 1); // un hueco de más, el de la carretera
  const r = plaza.radio * 0.7;
  const anillo: Punto[] = [];
  for (let i = 1; i <= cuantos; i++) {
    const a = angEntrada + i * libre;
    anillo.push({ x: plaza.x + Math.cos(a) * r, y: plaza.y + Math.sin(a) * r });
  }
  // Orden de llenado: de arriba abajo (la parte baja de la plaza queda cerca
  // del borde del mapa y de los botones), y a igual altura del centro afuera.
  return anillo.sort((a, b) => a.y - b.y || Math.abs(a.x - plaza.x) - Math.abs(b.x - plaza.x));
}
/** Edificio decorativo: en un hueco, con su grado (0 casa, 1 hotel, 2 gran hotel). */
export interface Edificio {
  hueco: number;
  grado: number;
  /** Instante (s de estación abierta) en que apareció o mejoró por última vez. */
  desde: number;
}

/**
 * Edificios en el escalón e: uno por escalón a partir del primero. Cuando se
 * llenan los huecos, los edificios mejoran de aspecto en el mismo orden,
 * hasta el grado máximo.
 */
export function edificios(e: number, huecos: number, gradoMaximo: number, intervalo: number): Edificio[] {
  const res: Edificio[] = [];
  if (huecos <= 0) return res;
  const total = Math.min(e, huecos * (gradoMaximo + 1));
  for (let h = 0; h < Math.min(total, huecos); h++) {
    // Escalones que han tocado este hueco: h+1, h+1+huecos, h+1+2·huecos…
    const veces = Math.floor((total - 1 - h) / huecos) + 1;
    res.push({ hueco: h, grado: veces - 1, desde: (h + 1 + (veces - 1) * huecos) * intervalo });
  }
  return res;
}
