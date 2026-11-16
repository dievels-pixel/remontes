// Almacenamiento local con red de seguridad: en modo privado o sin permiso,
// leer devuelve el valor por defecto y escribir no hace nada.
const PREFIJO = 'remontes.';

export function leer<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(PREFIJO + clave);
    return v === null ? porDefecto : (JSON.parse(v) as T);
  } catch {
    return porDefecto;
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento: el valor vale solo para esta sesión.
  }
}

export function borrar(clave: string): void {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    // Nada que borrar.
  }
}
