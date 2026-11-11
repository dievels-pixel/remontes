// Trazado de pistas como Bézier cúbica muestreada. En la etapa 1 la amplitud
// lateral es fija (con una variación estable por pareja); la bisección para
// alcanzar una longitud objetivo llega en la etapa 2.
import { crearAzar } from './azar';
import { Polilinea } from './polilinea';
import type { Punto } from './vector';

export interface ParametrosCurva {
  amplitudRelativa: number;
  variacionAmplitud: number;
  muestras: number;
}

/**
 * Curva en forma de C entre a y b. `lado` = +1 o −1 elige a qué lado de la
 * recta se abomba, de modo que dos pistas con lados opuestos forman una lente.
 */
export function trazarPista(a: Punto, b: Punto, lado: 1 | -1, semilla: number, p: ParametrosCurva): Polilinea {
  const azar = crearAzar(semilla);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  // Normal unitaria a la recta a→b.
  const nx = -dy / d;
  const ny = dx / d;
  const amp = d * (p.amplitudRelativa + (azar() * 2 - 1) * p.variacionAmplitud) * lado;
  // Desequilibrio leve entre los dos puntos de control para que no sea simétrica.
  const k1 = 0.8 + azar() * 0.4;
  const k2 = 0.8 + azar() * 0.4;
  const c1 = { x: a.x + dx / 3 + nx * amp * k1, y: a.y + dy / 3 + ny * amp * k1 };
  const c2 = { x: a.x + (2 * dx) / 3 + nx * amp * k2, y: a.y + (2 * dy) / 3 + ny * amp * k2 };
  const puntos: Punto[] = [];
  for (let i = 0; i <= p.muestras; i++) {
    const t = i / p.muestras;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    puntos.push({
      x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
      y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
    });
  }
  return new Polilinea(puntos);
}
