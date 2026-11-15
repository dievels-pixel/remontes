import { CONFIG } from './config';
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

  /**
   * Franjas de pantalla libres arriba y abajo: el mapa se encaja entre ellas
   * para que los puntos de los bordes no queden bajo el texto de ayuda, los
   * botones o la zona de gestos del navegador (costaba tocarlos). Con el panel
   * de ajustes abierto, la de arriba crece hasta el panel.
   */
  const RESERVA_ARRIBA = 90; // tres líneas de texto (monedas, mantenimiento, llegados) y el medidor de quejas
  const RESERVA_ABAJO = 106; // botones de deshacer y velocidad, y encima los contadores por nivel (dos filas)
  const reserva = { arriba: RESERVA_ARRIBA, abajo: RESERVA_ABAJO };

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
        reserva.arriba = Math.max(arriba, RESERVA_ARRIBA);
        redimensionar();
      }),
    );
  }
  // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
  if (import.meta.env.DEV) Object.assign(window, { juego, camara });

  // Solo en desarrollo: tiempos de cada fotograma (ms) para medir el
  // rendimiento (scripts/medirRendimiento.cjs).
  const rendimiento = { simulacion: [] as number[], calentar: [] as number[], dibujo: [] as number[], pasos: [] as number[] };
  if (import.meta.env.DEV) Object.assign(window, { rendimiento });

  // Paso fijo de simulación, independiente de la frecuencia de pantalla.
  const DT = 1 / 60;
  let anterior = performance.now();
  let ultimoFotograma = anterior;
  let acumulado = 0;
  function fotograma(ahora: number): void {
    acumulado += Math.min((ahora - anterior) / 1000, 0.25) * juego.velocidad * CONFIG.tiempo.escala;
    anterior = ahora;
    const t0 = performance.now();
    let pasos = 0;
    while (acumulado >= DT) {
      juego.paso(DT);
      acumulado -= DT;
      pasos++;
    }
    const t1 = performance.now();
    // En segundo plano, unos milisegundos: lo que pedirá el próximo arrastre.
    juego.calentar();
    const t2 = performance.now();
    if (claveTerreno.alturas !== juego.alturas || claveTerreno.umbral !== juego.umbralRoca) {
      terreno = crearTerreno(juego.alturas, juego.umbralRoca);
      claveTerreno = { alturas: juego.alturas, umbral: juego.umbralRoca };
    }
    dibujar(ctx, juego, camara, terreno, ancho, alto);
    // Medias móviles para el panel de ajustes (cuestan nada).
    const intervalo = ahora - ultimoFotograma;
    ultimoFotograma = ahora;
    if (intervalo > 0 && intervalo < 1000) juego.rendimiento.fps += (1000 / intervalo - juego.rendimiento.fps) * 0.05;
    juego.rendimiento.ms += (performance.now() - t0 - juego.rendimiento.ms) * 0.05;
    if (import.meta.env.DEV) {
      rendimiento.simulacion.push(t1 - t0);
      rendimiento.calentar.push(t2 - t1);
      rendimiento.dibujo.push(performance.now() - t2);
      rendimiento.pasos.push(pasos);
      // Solo los últimos minutos: no crecer sin límite en una sesión larga.
      if (rendimiento.pasos.length > 7200) for (const v of Object.values(rendimiento)) v.splice(0, 3600);
    }
    requestAnimationFrame(fotograma);
  }
  requestAnimationFrame(fotograma);
}
