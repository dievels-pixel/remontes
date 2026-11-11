import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/**
 * Versión visible en pantalla. Al fusionar, el commit de main se llama
 * "Merge pull request #N ...", así que la versión es el número de la petición
 * de fusión. Fuera de ese caso se usa el commit corto. Se añade la hora de
 * construcción (hora de España) para distinguir despliegues.
 */
function version(): string {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const asunto = git('git log -1 --pretty=%s');
  const pr = /^Merge pull request #(\d+)/.exec(asunto)?.[1];
  const id = pr ? `v${pr}` : git('git rev-parse --short HEAD') || 'local';
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
