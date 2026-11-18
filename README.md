# Remontes

Juego web minimalista de gestión en tiempo real, en la línea de Mini Metro, con remontes y pistas de esquí. Construyes remontes entre puntos de una montaña, abres pistas eligiendo su color y mantienes contentos a los esquiadores mientras la afluencia crece. Pierdes cuando se acumulan demasiadas quejas.

Hecho con TypeScript, Vite y Canvas 2D, sin librerías de juego. Pensado para pantalla táctil, en vertical y en horizontal.

## Ejecutar

Hace falta Node 22 o posterior.

```
npm ci             # instalar
npm run dev        # servidor de desarrollo (http://localhost:5173/remontes/)
npm test           # pruebas (Vitest)
npm run build      # comprobación de tipos y paquete en dist/
npm run preview    # servir dist/
```

Al subir a `main`, GitHub Actions pasa las pruebas, construye y publica en GitHub Pages.

Direcciones útiles en desarrollo:

- `/remontes/` abre el menú.
- `/remontes/?nivel=espot` abre directamente una partida en ese nivel.
- `/remontes/?ajustes` abre una partida con el panel de calibración (herramienta de desarrollo).
- `/remontes/tools/editor/` abre el editor de mapas (`npm run editor`). También está publicado en https://dievels-pixel.github.io/remontes/tools/editor/; el juego no lo enlaza.

## Cómo se juega

- **Remonte:** arrastra desde un punto de la plaza (o desde cualquier punto en uso que no sea una cima) hasta otro más alto. Cuesta monedas según su longitud.
- **Pista:** arrastra desde la llegada de un remonte hasta un punto más bajo y elige color. Las pistas son gratis. Los colores apagados no caben con esa pendiente.
- **Mejorar:** mantén pulsado un remonte para pasarlo a telesilla (2 plazas) y a telecabina (4). Cuesta la diferencia y sube su mantenimiento.
- **Cámara:** pellizca para acercar y arrastra el fondo para moverte.
- Cada esquiador baja por pistas de su nivel o más fáciles. Se aburre en pistas dos niveles por debajo, pierde contento en las colas saturadas y lo recupera variando pistas de su nivel. Si se queda sin contento, se va enfadado y llena el medidor de quejas.
- Arriba ves las monedas, el medidor de quejas y el día; abajo, los kilómetros de pista por color frente a la mezcla de esquiadores que llega, y cuántos hay de cada nivel.

En la primera partida, un dedo fantasma enseña cada gesto.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| **Todos los parámetros de balance** (afluencia, precios, tarifas, mantenimiento, capacidades, velocidades, bandas de pendiente, medidor de quejas, duración del día) | `src/config.ts`, comentado valor a valor |
| Parámetros propios de un nivel (se mezclan sobre los anteriores) | `parametros` en `niveles/<id>/nivel.json` |
| Valores calibrados, criterios y resultados | `CALIBRACION.md` |
| Especificación de diseño (manda sobre el código) | `docs/diseno-juego-remontes.md` |
| Formato de los niveles (para escribirlos con otra herramienta) | `FORMATO_NIVEL.md` |
| Qué está hecho y qué falta | `ESTADO.md` |
| Decisiones tomadas donde el encargo era ambiguo | `DECISIONES.md` |
| Notas técnicas e historia del desarrollo | `docs/diseno.md` |

Código:

| Carpeta o archivo | Contenido |
|---|---|
| `src/core/` | Lógica pura, sin DOM ni lienzo, con pruebas: red de remontes y pistas (`red.ts`), simulación de esquiadores (`simulacion.ts`), trazado y colores (`curva.ts`, `colores.ts`, `confluencia.ts`), afluencia, economía, retos y formato de nivel. |
| `src/juego.ts` | Estado de una partida y acciones del jugador (construir, abrir pista, mejorar, deshacer). |
| `src/partida.ts`, `src/menu.ts`, `src/main.ts` | Pantallas (partida y menú) y bucle principal. |
| `src/render/` | Dibujo: mundo (`escena.ts`), interfaz y su disposición (`interfaz.ts`), animaciones (`efectos.ts`), guía (`guia.ts`), cámara y terreno. |
| `src/input/puntero.ts` | Gestos táctiles (pointer events). |
| `src/audio/` | Música generativa con Web Audio. |
| `src/bots/` | Jugadores automáticos y partida sin pantalla, para calibrar. |
| `src/niveles.ts`, `src/progreso.ts`, `src/preferencias.ts` | Carga de niveles, récords y retos guardados, preferencias. |
| `niveles/` | Los niveles del juego (datos). |
| `mapas/` | Mapas de prueba para las pruebas automáticas; el juego no los carga. |
| `test/` | Pruebas. `cierre.test.ts` reúne lo que no debe romperse (sin puntos ciegos, colores factibles); `fase3.test.ts`, la carga de niveles y los retos. |
| `scripts/` | Calibración, medidas de rendimiento y generación de miniaturas y mapas de prueba. |
| `tools/editor/` | Editor de mapas (herramienta de desarrollo, fuera del juego). |

## Calibrar

```
npm run calibrar                    # cinco jugadores automáticos, 5 partidas cada uno, y los criterios
npm run calibrar -- todas 7         # 7 partidas por jugador
npm run calibrar -- razonable 3 '{"afluencia":{"aceleracion":0.03}}' --detalle
```

El JSON del tercer argumento se mezcla sobre `src/config.ts` solo para esa ejecución. El script dice además en cuántas partidas consigue cada jugador los retos del nivel. Los criterios y cómo leerlos están en `CALIBRACION.md`.

## Añadir un nivel

Copia su carpeta a `niveles/<id>/` (`nivel.json`, `alturas.png`, `miniatura.png`) y añade `{ "id": "<id>" }` a `niveles/indice.json`. No hay que tocar código. `npm test` valida todos los niveles del índice y juega una partida automática en cada uno; `npm run miniatura -- <id>` genera la miniatura a partir del relieve. El formato completo está en `FORMATO_NIVEL.md`.

## Editor de mapas

```
npm run editor     # abre http://localhost:5173/remontes/tools/editor/
```

Aplicación aparte para crear niveles con el ratón. Se publica con el juego en https://dievels-pixel.github.io/remontes/tools/editor/ (el juego no la enlaza) y en local se abre con el servidor de desarrollo. Reutiliza del juego el pintado del terreno (`src/render/terreno.ts`), la red de pistas y remontes y las reglas de factibilidad (`Juego`), así que lo que el editor da por posible es lo que el juego permite.

- **Relieve.** Puntos de cota (pico, intermedio, valle) con su altura en metros, y líneas de cresta y vaguada. La superficie es una placa delgada (*thin-plate spline*) que pasa por los puntos, con un suavizado ajustable y una rugosidad de ruido fractal con semilla. Se recalcula al soltar; mientras se arrastra, a media resolución.
- **Roca.** Automática por pendiente (umbral ajustable, se guarda en los parámetros del nivel si no es el del juego) y pinceles para forzar roca o esquiable; se exporta como `mascara.png`.
- **Juego.** Bases, intermedios y cimas (la cota sale del relieve), plaza y carretera.
- **Validación en directo.** Colores de pista posibles entre cada nodo y sus vecinos más bajos (las líneas del mapa, del color más difícil posible; a trazos grises si no cabe ninguno) y avisos: base sin pistas que lleguen, cima sin bajada, intermedio aislado, parejas cercanas demasiado planas, sin negras, sin rojas, sin verdes, base sin remonte asequible con el dinero inicial. Los avisos graves marcan el nodo en rojo; pulsar un aviso centra la vista.
- **Fondo para calcar.** Imagen semitransparente (plano de pistas, captura topográfica) con su escala en metros por píxel y su posición.
- **Mapa aleatorio.** Tamaño, semilla, número de cumbres, cotas de valle y cumbre, separación de nodos y rugosidad. Prueba semillas seguidas hasta dar con un mapa sin avisos graves. El resultado es un proyecto normal: se edita y se guarda.
- **Salida.** «Probar en el juego» abre el juego con el mapa (`/remontes/?prueba`, en el mismo navegador; no guarda récords). «Exportar a carpeta» escribe `nivel.json`, `alturas.png`, `miniatura.png` y, si hay, `mascara.png` en una carpeta elegida (en Chrome; si no, «Descargar ZIP»); luego se añade el `id` a `niveles/indice.json`. «Guardar proyecto» descarga un JSON con todo lo editable (puntos, líneas, máscara, fondo) para retomarlo con «Abrir proyecto». El proyecto se guarda también solo en el navegador.

Ratón y teclado:

| Acción | Cómo |
|---|---|
| Seleccionar y mover | V; arrastrar un punto, vértice, nodo o la plaza |
| Punto de cota, cresta, vaguada | P, C, G; las líneas se terminan con Intro, Esc, doble clic o botón derecho |
| Forzar roca, forzar esquiable, borrar pincel | R, E, X; `[` y `]` cambian el radio |
| Base, intermedio, cima | 1, 2, 3 |
| Plaza, carretera | Z, T |
| Cota del punto seleccionado | Mayús + rueda: ±10 m (con Ctrl, ±50 m); + y −: ±10 m |
| Borrar lo seleccionado | Supr |
| Zoom, desplazar, encajar | rueda; botón central, derecho o espacio; F |
| Deshacer, rehacer, guardar | Ctrl+Z, Ctrl+Mayús+Z o Ctrl+Y, Ctrl+S |

## Otras herramientas

```
npm run medir:eleccion     # por dónde bajan los esquiadores de cada nivel en una red fija
npm run medir:arrastre     # coste del primer arrastre tras una obra
node scripts/medirRendimiento.cjs 4 80   # tiempos por fotograma con ~350 esquiadores y la CPU frenada ×4 (con el servidor de desarrollo en marcha)
```
