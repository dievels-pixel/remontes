// Progreso del jugador: récord (días) y retos conseguidos de cada nivel. Se
// guarda en localStorage (con red de seguridad: si no se puede, vale solo
// para la sesión) y se puede reiniciar desde los ajustes.
import { borrar, guardar, leer } from './almacen';
import { retoConseguido, textoReto, type ResumenPartida, type Reto } from './core/retos';
import type { DatosFin } from './render/interfaz';

export interface ProgresoNivel {
  /** Mejor marca en días completos, o null si aún no se ha jugado. */
  record: number | null;
  /** Retos conseguidos alguna vez, en el orden del nivel. */
  retos: boolean[];
  partidas: number;
}

type Progreso = Record<string, ProgresoNivel>;
const CLAVE = 'progreso';
const VACIO: ProgresoNivel = { record: null, retos: [], partidas: 0 };

/** Progreso guardado de un nivel (vacío si no hay o si lo guardado no vale). */
export function progresoDe(id: string): ProgresoNivel {
  const p = leer<Progreso>(CLAVE, {})[id];
  if (!p || typeof p !== 'object') return { ...VACIO, retos: [] };
  return {
    record: typeof p.record === 'number' ? p.record : null,
    retos: Array.isArray(p.retos) ? p.retos.map(Boolean) : [],
    partidas: typeof p.partidas === 'number' ? p.partidas : 0,
  };
}

/**
 * Resultado de una partida frente a lo que había: qué retos se consiguen, si
 * hay récord y el progreso que queda. Pura, para poder probarla.
 */
export function evaluarPartida(previo: ProgresoNivel, resumen: ResumenPartida, retos: readonly Reto[]): { datos: DatosFin; nuevo: ProgresoNivel } {
  const dias = Math.floor(resumen.dias);
  const conseguidos = retos.map((r) => retoConseguido(r, resumen));
  const esRecord = previo.record === null ? dias > 0 : dias > previo.record;
  return {
    datos: {
      retos: retos.map((r, i) => ({ texto: textoReto(r), conseguido: conseguidos[i], antes: previo.retos[i] === true })),
      recordAnterior: previo.record,
      esRecord,
    },
    nuevo: {
      record: previo.record === null ? dias : Math.max(previo.record, dias),
      retos: retos.map((_, i) => conseguidos[i] || previo.retos[i] === true),
      partidas: previo.partidas + 1,
    },
  };
}

/** Apunta una partida acabada y devuelve lo que muestra el panel final. */
export function registrarPartida(id: string, resumen: ResumenPartida, retos: readonly Reto[]): DatosFin {
  const { datos, nuevo } = evaluarPartida(progresoDe(id), resumen, retos);
  guardar(CLAVE, { ...leer<Progreso>(CLAVE, {}), [id]: nuevo });
  return datos;
}

/** Borra récords, retos y la guía de la primera partida. */
export function reiniciarProgreso(): void {
  borrar(CLAVE);
  borrar('guia');
}
