// Desplazamiento de las pistas hacia las estaciones de los puntos desdoblados.
// Solo afecta al dibujo (el grafo, los colores y las confluencias no cambian),
// pero es lógica pura: devuelve, para cada longitud recorrida s de una pista,
// cuánto se desplaza en pantalla (px) la línea y los esquiadores que van por ella.
import type { Estacion, Pista, Red } from './red';
import type { Punto } from './vector';

export interface ParametrosDesplazamiento {
  /** Separación entre estaciones en pantalla, px. */
  separacionPx: number;
  /** Primer y último tramo que se desplaza hasta su estación, m. */
  tramoEstacion: number;
  /** Longitud del acuerdo con la pista a la que se une, m. */
  radioAcuerdo: number;
}

const suave = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mezclar = (a: Punto, b: Punto, t: number): Punto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Desplazamiento propio de una pista: el primer y el último tramo se llevan
 * suavemente desde el centro del punto hasta su estación. Las laterales se
 * desplazan a lo largo de toda la pista, como su remonte (que se dibuja de
 * estación a estación), para que la lente siga envolviéndolo.
 */
export function desplazamientoPropio(salida: Estacion, llegada: Estacion, L: number, lateral: boolean, p: ParametrosDesplazamiento): (s: number) => Punto {
  const sep = p.separacionPx;
  if (lateral) {
    return (s) => {
      const t = Math.min(Math.max(s / L, 0), 1);
      return { x: (salida.ox * (1 - t) + llegada.ox * t) * sep, y: (salida.oy * (1 - t) + llegada.oy * t) * sep };
    };
  }
  const tramo = Math.min(p.tramoEstacion, L / 2);
  return (s) => {
    const w0 = suave(1 - s / tramo);
    const w1 = suave(1 - (L - s) / tramo);
    return { x: (salida.ox * w0 + llegada.ox * w1) * sep, y: (salida.oy * w0 + llegada.oy * w1) * sep };
  };
}

/**
 * Desplazamiento de una pista teniendo en cuenta su confluencia: en el tramo
 * compartido usa el de la pista a la que se une (sus esquiadores van sobre la
 * línea que se ve, que es la de esa pista), y en los acuerdos de entrada y
 * salida pasa suavemente del suyo al de la otra, para que la línea no salte.
 */
export function desplazamientoPista(red: Red, pista: Pista, p: ParametrosDesplazamiento): (s: number) => Punto {
  const propio = desplazamientoPropio(red.estacionDePista(pista, 'salida'), red.estacionDePista(pista, 'llegada'), pista.trazado.longitud, pista.lateral, p);
  const c = pista.compartido;
  const otra = c ? red.pistas[c.pista] : undefined;
  if (!c || !otra) return propio;
  const deLaOtra = desplazamientoPista(red, otra, p);
  const enOtra = (s: number) => c.inicioPista + (s - c.inicio);
  const alEntrar = deLaOtra(enOtra(c.inicio));
  const alSalir = deLaOtra(enOtra(c.fin));
  const r = p.radioAcuerdo;
  return (s) => {
    if (s >= c.inicio && s <= c.fin) return deLaOtra(enOtra(s));
    if (s < c.inicio && s > c.inicio - r) return mezclar(propio(s), alEntrar, suave(1 - (c.inicio - s) / r));
    if (s > c.fin && s < c.fin + r) return mezclar(alSalir, propio(s), suave((s - c.fin) / r));
    return propio(s);
  };
}
