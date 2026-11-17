# Estado del proyecto

Auditoría del 2026-11-16 (v46), antes de empezar las fases de acabado. La referencia de diseño es `docs/diseno-juego-remontes.md`; las notas técnicas de lo implementado están en `docs/diseno.md`.

Este archivo se actualiza al cerrar cada fase (ver «Fases de acabado» al final).

## Etapas del plan de la especificación

| Etapa | Estado | Notas |
|---|---|---|
| 1. Prototipo mínimo | Hecha | Remontes arrastrando, estaciones que se desdoblan, bolitas, esquiadores. |
| 2. Pistas, color libre, sinuosidad, nodo viable, roca | Hecha | El jugador elige inicio y destino (v31); pistas en espera para abrir valles (v33). Recolorear sin coste sigue aplazado. |
| 3. Niveles, aguante, contento, variedad, colas | Hecha | La cola saturada resta 1 punto a toda la cola (v40). |
| 4. Carretera, afluencia y mezcla por tiempo | Hecha | Sin edificios: se probaron y están en «Descartado» (v39). |
| 5. Densidad, rendimiento y legibilidad | A medias | Rendimiento medido y arreglado (v46). Falta la prueba de legibilidad de puntos y pistas. |
| 6. Economía, quejas y derrota | Hecha | Precio, pago, mejora de remontes, mantenimiento, medidor y fin de partida (v40 a v45). |
| 7. Simulación sin gráficos para calibrar | Hecha (fase 1) | `npm run calibrar`, `src/bots/`, criterios en `CALIBRACION.md`. |
| 8. Indicadores en pantalla | Hecha (fase 1) | Contadores por color y barra de kilómetros de pista por color con la mezcla de llegadas. |
| 9. Cruces con enlaces automáticos | Hecha | Confluencias con acuerdo tangente y límite de cruces. |
| 10. Pulido visual y sonoro | Hecha en lo esencial (fase 2) | Animaciones, ciclo de día y música. El terreno sigue con degradado y sombreado sencillos, sin texturas de bosque. |
| 11. Fases posteriores | Sin empezar | Varias carreteras, agua, averías, boca a boca. |

## Partida automática (estado actual)

Jugador «equilibrado» de `npm run jugar` en el único mapa grande, tres partidas:

- Pierde a los 13:24, 14:07 y 15:40 de juego. Con el tiempo a escala 2 (v41) son unos 7 minutos reales: corta.
- Todas las derrotas son por aburrimiento de rojos y negros (enfadados por nivel, verde/azul/rojo/negro: 0/0/26/13, 0/3/17/17, 0/0/19/15). Las colas no deciden nada.
- La gente se queda abajo: de 170 a 180 esquiadores, entre 104 y 124 están en los remontes que salen de la plaza, aunque dos tercios de los remontes están más arriba (4 de 18 salen de la plaza). Los valles altos quedan casi vacíos.
- Los enfados ocurren en las bases de la plaza: rojos y negros bajan hasta abajo por verdes y azules (lo único que cabe en la zona baja), pierden contento y se van.
- El dinero va justo hasta el minuto 10 a 12 y luego sobra (1200 a 1800 monedas sin gastar al perder).
- Entre el 49 % y el 70 % de las bajadas «divierten».

Qué falla o aburre:

1. No hay motivo para subir ni para ir a los valles nuevos: la elección de ruta descuenta cada remonte de más (0,85) y con dos pistas en memoria se puede variar siempre sin salir de la zona baja.
2. La derrota tiene una sola causa (aburrimiento de los niveles altos); la gestión de colas y el dinero dejan de importar a media partida.
3. Los dos primeros minutos son frágiles: un primer remonte cuya llegada solo da pistas azules echa a todos los verdes al llegar («sin pistas de su nivel») y el medidor puede llenarse en unos 4 minutos de juego.
4. El final es brusco para quien juega (el medidor sube de 10 a 20 en dos minutos) y la pantalla final es un panel de texto.
5. No hay sonido ni respuesta visual a las acciones; todo aparece y desaparece de golpe.

## Errores conocidos

- «Nueva partida» recarga la página (se pierde el zoom y no hay menú al que volver).
- La parte baja de la plaza y la carretera quedan cerca de los contadores inferiores.
- En el mapa entero, el cable de un remonte pasa cerca de puntos: la pulsación larga para mejorar compite con el arrastre (resuelto con una regla de cercanía, sin probar en móvil real).
- El texto superior ocupa tres renglones y los textos de ayuda son largos (contradice el aprendizaje sin texto).
- No está comprobada la orientación horizontal.
- Sin señal secundaria para daltonismo.

## Deuda que bloquea lo siguiente

- **Sin pantallas ni ciclo de vida de partida.** `src/main.ts` carga un mapa por `?mapa=` y crea un único `Juego` para siempre. Para menú, repetir y volver hace falta poder crear y destruir partidas, y separar el bucle de dibujo del estado.
- **Mapas, no niveles.** `mapas/<nombre>/` con PNG y JSON, sin índice, sin parámetros por nivel, sin retos ni miniatura. Hay tres mapas sintéticos (`gran-dominio`, `dos-valles`, `inicial`) y ninguno se llama Espot. `src/cargarMapa.ts` tiene el mapa por defecto escrito en el código.
- **Jugadores automáticos fuera del código con tipos.** `scripts/jugarPartidas.mjs` no se puede probar ni reutilizar para ajustar retos.
- **`src/render/escena.ts` (más de 1000 líneas)** dibuja mapa, interfaz y paneles en una sola función sin estado de animación: no hay dónde colgar transiciones.
- **Tiempo sin pausa.** Velocidades 1×, 2× y 0,5×; no existe pausa ni construir en pausa.
- **Herramienta `?ajustes` y editor de mapas** mezclados en `Juego` (`herramientaMapa`, `arrastreNodo`, `modoAjustes`). Quedan fuera de alcance; no se amplían.
- Algunas pruebas antiguas toman valores de `src/config.ts` (`CONFIG.esquiador`, `CONFIG.remonte`): al recalibrar pueden moverse.

## Fases de acabado

| Fase | Estado |
|---|---|
| 0. Auditoría | Hecha (este documento) |
| 1. Cerrar el núcleo y calibrarlo | Hecha: ver `CALIBRACION.md`. Elección de ruta por novedad y suma, periodo de gracia, afluencia acelerada, barra de kilómetros por color, jugadores automáticos en `src/bots/` y `npm run calibrar`. |
| 2. Animación, sonido y sensación | Hecha: animaciones (`src/render/efectos.ts`), mundo e interfaz separados (`escena.ts`, `interfaz.ts`), música (`src/audio/`), guía sin texto (`src/render/guia.ts`), pausa y 1×/2×, ciclo de día, fin de partida y pantalla de partida que se crea y se destruye sin recargar (`src/partida.ts`, `src/main.ts`). |
| 3. Niveles y retos | Hecha: `niveles/` (índice y carpeta de Espot), cargador único (`src/niveles.ts`), parámetros por nivel (`Juego.config`), retos (`src/core/retos.ts`), progreso (`src/progreso.ts`) y `FORMATO_NIVEL.md`. |
| 4. Pantalla inicial | Hecha: `src/menu.ts` (fondo animado, título, selector desde el índice, ajustes), `src/preferencias.ts` y modo para daltonismo. |
| 5. Cierre | Hecha: partidas completas en el navegador (vertical y horizontal), pruebas de cierre (`test/cierre.test.ts`), README y resumen final (abajo). |

## Pendiente tras la fase 2

- El precálculo en segundo plano tras cada obra todavía alarga algunos fotogramas (cada tarea, hasta unos 8 ms en un ordenador).
- La prueba de legibilidad de puntos y pistas de la etapa 5 no se hizo como pantalla de prueba: los puntos llevan ya contorno claro fino.
- Los errores «Nueva partida recarga la página» y «textos de ayuda largos» de la auditoría están resueltos.

## Resumen final (2026-11-17)

**Hecho.** El juego se abre en un menú (fondo animado, selector de niveles desde el índice, ajustes de sonido, daltonismo y reinicio), entra con un fundido a la partida y vuelve igual. La partida tiene economía con mantenimiento, mejora de remontes, medidor de quejas con periodo de gracia, ciclo de día, animaciones de respuesta, música pentatónica, pausa y 1×/2×, guía sin texto y pantalla final con la red, el cuello de botella, los retos y el récord. Los niveles son datos (`niveles/`, `FORMATO_NIVEL.md`) y Espot es el único jugable. La calibración con cinco jugadores automáticos cumple los criterios pedidos (`CALIBRACION.md`).

**Comprobado en el navegador (Pixel 7 emulado, vertical y horizontal).** Partidas completas con el jugador razonable dentro de la página: 8 a 9 días, sin errores en consola, progreso guardado. Gestos reales: arrastres, selector de color, pulsación larga para mejorar, botones, fin de partida, repetir y volver al menú.

**Flojo:**
- Sin probar en un móvil real: fotogramas por segundo, sonido en iOS y gestos con el dedo. En el entorno emulado el juego gasta de 2 a 8 ms por fotograma con 300 a 430 esquiadores, pero se pinta sin GPU.
- Al final de la partida pueden juntarse más de 400 esquiadores, por encima del objetivo de 300.
- El dinero sobra en el último tercio de la partida.
- Una pista que se une a otra puede quedar con pendiente fuera de la banda de su color (manda la dificultad del tramo común, pero el número no cuadra).
- El terreno es un degradado sin texturas de bosque ni roca.
- El relieve de Espot es sintético (decisión 1).
- El tercer reto de Espot depende de una sola variable (bajadas de negros).

**Qué probaría a cambiar:**
- Tope de afluencia o salida de esquiadores al llenarse la plaza, para limitar el número en pantalla al final.
- Un sumidero de dinero tardío (mantenimiento que crece con los días o mejoras de estación).
- Un reto de restricción en Espot («N días con M remontes como máximo») cuando haya un jugador automático que lo intente.
- Texturas de bosque y roca en el terreno, y probar el modo para daltonismo con personas que lo necesiten.
