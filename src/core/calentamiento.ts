// Calentamiento de cachés: tras cada cambio de la red (red.version) se vacían
// las cachés de evaluarPista, llegadaConBajada y alcanzablePorPista, y el
// primer arrastre hacia un destino era lento. Aquí solo se decide QUÉ
// calcular y en qué orden; lo ejecuta el juego en segundo plano, unos
// milisegundos por fotograma (ver Juego.calentar). Las tareas llaman a las
// mismas funciones que el arrastre, con las mismas cachés: no cambian
// ninguna regla ni ningún resultado, solo cuándo se calculan.
import type { Red } from './red';
import { distancia, type Punto } from './vector';

export type TareaCalentamiento =
  /** ¿Se podría bajar desde este punto? (llegada de un remonte; Red.llegadaConBajada) */
  | { tipo: 'bajada'; nodo: number }
  /** ¿Puede arrancar un remonte en este punto gris? (Red.alcanzablePorPista) */
  | { tipo: 'arranque'; nodo: number }
  /** Evaluación de la pista desde → hasta (evaluarPista). */
  | { tipo: 'pista'; desde: number; hasta: number };

/**
 * Tareas en orden, empezando por lo más cercano a `obra` (la última obra, o
 * la plaza): primero la bajada desde cada punto (la usa cada destino de un
 * remonte), luego qué puntos grises pueden arrancar, y después las pistas
 * desde cada punto activo hacia sus `maxDestinos` puntos más bajos más
 * cercanos, por turnos entre orígenes (el más cercano de cada origen, luego
 * el segundo…), para que ningún origen se quede sin nada si no da tiempo.
 */
export function tareasCalentamiento(red: Red, obra: Punto, maxDestinos: number): TareaCalentamiento[] {
  const cerca = (a: { x: number; y: number }, b: { x: number; y: number }) => distancia(a, obra) - distancia(b, obra);
  const nodos = [...red.nodos].sort(cerca);
  const tareas: TareaCalentamiento[] = [];
  for (const n of nodos) if (n.tipo !== 'base') tareas.push({ tipo: 'bajada', nodo: n.id });
  for (const n of nodos) if (n.tipo !== 'base' && red.estacionesDe(n.id).length === 0) tareas.push({ tipo: 'arranque', nodo: n.id });
  const origenes = nodos.filter((n) => n.tipo !== 'base' && red.activo(n.id));
  const destinos = origenes.map((o) =>
    red.nodos
      .filter((b) => b.cota < o.cota)
      .sort((a, b) => distancia(a, o) - distancia(b, o))
      .slice(0, maxDestinos),
  );
  for (let k = 0; k < maxDestinos; k++) {
    origenes.forEach((o, i) => {
      const b = destinos[i][k];
      if (b) tareas.push({ tipo: 'pista', desde: o.id, hasta: b.id });
    });
  }
  return tareas;
}
