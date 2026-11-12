import { cargarMapa, MAPA_POR_DEFECTO } from './cargarMapa';
import { conectarPuntero } from './input/puntero';
import type { Mapa } from './core/mapa';
import { Juego } from './juego';
import { Camara } from './render/camara';
import { dibujar } from './render/escena';
import { crearTerreno } from './render/terreno';

// El mapa (PNG de alturas y JSON de nodos) se carga antes de empezar.
cargarMapa(new URLSearchParams(location.search).get('mapa') ?? MAPA_POR_DEFECTO).then(iniciar, (e: unknown) => {
  document.body.textContent = `No se ha podido cargar el mapa: ${e instanceof Error ? e.message : String(e)}`;
});

function iniciar(mapa: Mapa): void {
  const lienzo = document.getElementById('juego') as HTMLCanvasElement;
  const ctx = lienzo.getContext('2d')!;
  const juego = new Juego(mapa);
  const camara = new Camara();
  // El fondo se rehace si cambian las alturas (cota máx. del editor) o el
  // umbral de roca (panel de ajustes).
  let terreno = crearTerreno(juego.alturas, juego.umbralRoca);
  let claveTerreno = { alturas: juego.alturas, umbral: juego.umbralRoca };
  let ancho = 0;
  let alto = 0;

  /** Franjas de pantalla ocupadas por el panel de ajustes, si está abierto. */
  const reserva = { arriba: 0, abajo: 0 };

  function redimensionar(): void {
    const dpr = window.devicePixelRatio || 1;
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camara.ajustar(ancho, alto, juego.mapa.datos.ancho, juego.mapa.datos.alto, reserva.arriba, reserva.abajo);
  }
  window.addEventListener('resize', redimensionar);
  redimensionar();
  conectarPuntero(lienzo, juego, camara);

  // Herramienta temporal de calibración: solo con ?ajustes en la dirección.
  if (new URLSearchParams(location.search).has('ajustes')) {
    juego.modoAjustes = true;
    import('./herramientas/ajustes').then((m) =>
      m.montarPanelAjustes(juego, (arriba) => {
        // Con el panel abierto, el mapa se encaja debajo de él y por encima de
        // los botones, para no tapar nada mientras se ajusta.
        reserva.arriba = arriba;
        reserva.abajo = arriba > 0 ? 70 : 0;
        redimensionar();
      }),
    );
  }
  // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
  if (import.meta.env.DEV) Object.assign(window, { juego, camara });

  // Paso fijo de simulación, independiente de la frecuencia de pantalla.
  const DT = 1 / 60;
  let anterior = performance.now();
  let acumulado = 0;
  function fotograma(ahora: number): void {
    acumulado += Math.min((ahora - anterior) / 1000, 0.25) * juego.velocidad;
    anterior = ahora;
    while (acumulado >= DT) {
      juego.paso(DT);
      acumulado -= DT;
    }
    if (claveTerreno.alturas !== juego.alturas || claveTerreno.umbral !== juego.umbralRoca) {
      terreno = crearTerreno(juego.alturas, juego.umbralRoca);
      claveTerreno = { alturas: juego.alturas, umbral: juego.umbralRoca };
    }
    dibujar(ctx, juego, camara, terreno, ancho, alto);
    requestAnimationFrame(fotograma);
  }
  requestAnimationFrame(fotograma);
}
