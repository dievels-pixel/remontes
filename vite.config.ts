import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/**
 * Versión visible en pantalla. Hasta la v26 era el número de la petición de
 * fusión; desde entonces los cambios se suben directamente a main, uno por
 * petición del usuario, y la versión sigue contando: 26 más los commits de
 * main (primer padre) desde la fusión de la #26. Sin ese commit en el
 * historial (copia parcial), se usa el commit corto. Se añade la hora de
 * construcción (hora de España) para distinguir despliegues.
 */
/** Fusión de la petición #26, la última antes de subir directamente a main. */
const BASE_VERSION = '381384f';

function version(): string {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const desde = git(`git rev-list --count --first-parent ${BASE_VERSION}..HEAD`);
  const id = desde !== '' ? `v${26 + Number(desde)}` : git('git rev-parse --short HEAD') || 'local';
  const hora = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${id} · ${hora}`;
}

// En GitHub Pages el juego se sirve desde https://<usuario>.github.io/remontes/
export default defineConfig({
  base: '/remontes/',
  define: {
    __VERSION__: JSON.stringify(version()),
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
