// Arranque: un lienzo, un bucle y una pantalla activa (el menú o una
// partida). Las pantallas se crean y se destruyen sin recargar la página; el
// cambio entre ellas es un fundido.
import { Musica } from './audio/musica';
import { FONDO_MENU, PantallaMenu } from './menu';
import { cargarNivel, fichasDeNiveles, type NivelCargado } from './niveles';
import { PantallaPartida, type Pantalla } from './partida';
import { registrarPartida } from './progreso';

const lienzo = document.getElementById('juego') as HTMLCanvasElement;
const ctx = lienzo.getContext('2d')!;
const musica = new Musica();
let pantalla: Pantalla | null = null;
let ancho = 0;
let alto = 0;
/** Fundido entre pantallas: 1 negro del todo, 0 nada. */
let velo = 1;
let pendiente: (() => Pantalla) | null = null;

// Solo en desarrollo: tiempos de cada fotograma (ms) para medir el
// rendimiento (scripts/medirRendimiento.cjs).
const rendimiento = { simulacion: [] as number[], calentar: [] as number[], dibujo: [] as number[], pasos: [] as number[] };
if (import.meta.env.DEV) Object.assign(window, { rendimiento });

function redimensionar(): void {
  const dpr = window.devicePixelRatio || 1;
  ancho = lienzo.clientWidth;
  alto = lienzo.clientHeight;
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pantalla?.redimensionar(ancho, alto);
}
window.addEventListener('resize', redimensionar);

/** Cambia de pantalla con un fundido: se oscurece, se cambia y se aclara. */
function cambiar(crear: () => Pantalla): void {
  pendiente = crear;
}

function poner(crear: () => Pantalla): void {
  pantalla?.destruir();
  pantalla = crear();
  pantalla.redimensionar(ancho, alto);
  if (import.meta.env.DEV && pantalla instanceof PantallaPartida) Object.assign(window, { juego: pantalla.juego, camara: pantalla.camara, partida: pantalla });
}

function partida(nivel: NivelCargado): () => Pantalla {
  return () =>
    new PantallaPartida(lienzo, nivel.mapa, {
      sonido: musica,
      // Una semilla distinta en cada partida: las llegadas no se repiten.
      semilla: Math.floor(Math.random() * 1e9),
      parametros: nivel.parametros,
      alSalir: () => cambiar(menu(nivel.id)),
      alRepetir: () => cambiar(partida(nivel)),
      alTerminar: (juego) => registrarPartida(nivel.id, juego.resumen(), nivel.retos),
    });
}

/** El menú, abierto por la tarjeta del nivel dado. */
function menu(inicial?: string): () => Pantalla {
  return () =>
    new PantallaMenu(lienzo, {
      sonido: musica,
      fichas: fichasDeNiveles(),
      inicial,
      alJugar: (id) => {
        cargarNivel(id).then((nivel) => cambiar(partida(nivel)), fallo);
      },
    });
}

const fallo = (e: unknown) => {
  document.body.textContent = `No se ha podido cargar el nivel: ${e instanceof Error ? e.message : String(e)}`;
};

let anterior = performance.now();
function fotograma(ahora: number): void {
  const dt = Math.min((ahora - anterior) / 1000, 0.25);
  anterior = ahora;
  // Fundido: hacia negro si hay cambio pendiente; al llegar, se cambia.
  if (pendiente) {
    velo = Math.min(1, velo + dt / 0.25);
    if (velo >= 1) {
      poner(pendiente);
      pendiente = null;
    }
  } else velo = Math.max(0, velo - dt / 0.35);
  if (pantalla) {
    pantalla.fotograma(ctx, dt);
    if (import.meta.env.DEV && pantalla instanceof PantallaPartida) {
      const t = pantalla.tiempos;
      rendimiento.simulacion.push(t.simulacion);
      rendimiento.calentar.push(t.calentar);
      rendimiento.dibujo.push(t.dibujo);
      rendimiento.pasos.push(t.pasos);
      // Solo los últimos minutos: no crecer sin límite en una sesión larga.
      if (rendimiento.pasos.length > 7200) for (const v of Object.values(rendimiento)) v.splice(0, 3600);
    }
  }
  if (velo > 0.005) {
    ctx.fillStyle = FONDO_MENU;
    ctx.globalAlpha = velo;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(fotograma);
}

// Se entra por el menú. Con ?nivel=<id> (o con la herramienta ?ajustes) se
// abre directamente una partida, para las pruebas.
try {
  const consulta = new URLSearchParams(location.search);
  const directo = consulta.get('nivel') ?? (consulta.has('ajustes') ? fichasDeNiveles().find((n) => !n.bloqueado)!.id : null);
  redimensionar();
  if (directo) {
    cargarNivel(directo).then((nivel) => {
      poner(partida(nivel));
      requestAnimationFrame(fotograma);
    }, fallo);
  } else {
    poner(menu());
    requestAnimationFrame(fotograma);
  }
} catch (e) {
  fallo(e);
}
