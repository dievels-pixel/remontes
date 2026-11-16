// Preferencias del jugador que no son progreso: se guardan en el navegador.
// (El silencio lo guarda la música.)
import { guardar, leer } from './almacen';

export const preferencias = {
  /** Modo para daltonismo: paleta distinguible y un símbolo de forma por nivel. */
  daltonismo: leer<boolean>('daltonismo', false),
};

export function ponerDaltonismo(activo: boolean): void {
  preferencias.daltonismo = activo;
  guardar('daltonismo', activo);
}
