import { CONFIG } from './config';
import { conectarPuntero } from './input/puntero';
import { Juego } from './juego';
import { Camara } from './render/camara';
import { dibujar } from './render/escena';
import { crearTerreno } from './render/terreno';

const lienzo = document.getElementById('juego') as HTMLCanvasElement;
const ctx = lienzo.getContext('2d')!;
const juego = new Juego();
const camara = new Camara();
const terreno = crearTerreno(juego.alturas);
let ancho = 0;
let alto = 0;

function redimensionar(): void {
  const dpr = window.devicePixelRatio || 1;
  ancho = lienzo.clientWidth;
  alto = lienzo.clientHeight;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camara.ajustar(ancho, alto, CONFIG.mundo.ancho, CONFIG.mundo.alto);
}
window.addEventListener('resize', redimensionar);
redimensionar();
conectarPuntero(lienzo, juego, camara);

// Paso fijo de simulación, independiente de la frecuencia de pantalla.
const DT = 1 / 60;
let anterior = performance.now();
let acumulado = 0;
function fotograma(ahora: number): void {
  acumulado += Math.min((ahora - anterior) / 1000, 0.25);
  anterior = ahora;
  while (acumulado >= DT) {
    juego.paso(DT);
    acumulado -= DT;
  }
  dibujar(ctx, juego, camara, terreno, ancho, alto);
  requestAnimationFrame(fotograma);
}
requestAnimationFrame(fotograma);
