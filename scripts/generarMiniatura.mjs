// Genera la miniatura de un nivel (niveles/<id>/miniatura.png) a partir de su
// PNG de alturas, con los mismos colores de terreno que el juego y la plaza
// marcada. Una herramienta externa puede escribir su propia miniatura: este
// script es solo una forma cómoda de obtenerla.
//
// Uso: npm run miniatura -- <id del nivel> [ancho en px, 240]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const id = process.argv[2];
const anchoPx = Number(process.argv[3] ?? 240);
if (!id) throw new Error('Falta el id del nivel: npm run miniatura -- <id>');
const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const cargar = (m) => servidor.ssrLoadModule(m);
const { codificarPngRGB } = await cargar('/scripts/png.ts');
const { pintarTerreno } = await cargar('/src/render/terreno.ts');
const { CONFIG } = await cargar('/src/config.ts');

const carpeta = `niveles/${id}`;
const { cargarNivelDeDisco } = await cargar('/scripts/nivelDisco.ts');
const { nivel, mapa: montado, columnas, filas } = cargarNivelDeDisco(carpeta);
const mapa = nivel.mapa;
const png = { ancho: columnas, alto: filas };
const umbral = nivel.parametros.terreno?.umbralRoca ?? CONFIG.terreno.umbralRoca;
const rgba = pintarTerreno(montado.alturas, umbral);

// Reducción por promedio de bloques, manteniendo la proporción del mapa.
const altoPx = Math.round((anchoPx * mapa.alto) / mapa.ancho);
const rgb = new Uint8Array(anchoPx * altoPx * 3);
for (let y = 0; y < altoPx; y++) {
  for (let x = 0; x < anchoPx; x++) {
    const x0 = Math.floor((x * png.ancho) / anchoPx);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * png.ancho) / anchoPx));
    const y0 = Math.floor((y * png.alto) / altoPx);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * png.alto) / altoPx));
    const suma = [0, 0, 0];
    let n = 0;
    for (let v = y0; v < Math.min(y1, png.alto); v++) {
      for (let u = x0; u < Math.min(x1, png.ancho); u++) {
        const i = (v * png.ancho + u) * 4;
        suma[0] += rgba[i];
        suma[1] += rgba[i + 1];
        suma[2] += rgba[i + 2];
        n++;
      }
    }
    // La plaza, como en el juego: un círculo claro.
    const mx = ((x + 0.5) * mapa.ancho) / anchoPx;
    const my = ((y + 0.5) * mapa.alto) / altoPx;
    const enPlaza = Math.hypot(mx - mapa.plaza.x, my - mapa.plaza.y) <= mapa.plaza.radio;
    const o = (y * anchoPx + x) * 3;
    for (let k = 0; k < 3; k++) rgb[o + k] = enPlaza ? [240, 236, 226][k] : Math.round(suma[k] / Math.max(1, n));
  }
}
writeFileSync(`${carpeta}/miniatura.png`, codificarPngRGB(anchoPx, altoPx, rgb));
console.log(`Escrito ${carpeta}/miniatura.png (${anchoPx}×${altoPx})`);
await servidor.close();
