import { defineConfig } from 'vitest/config';

// En GitHub Pages el juego se sirve desde https://<usuario>.github.io/remontes/
export default defineConfig({
  base: '/remontes/',
  test: {
    include: ['test/**/*.test.ts'],
  },
});
