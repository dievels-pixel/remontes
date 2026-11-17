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

## Calibrar

```
npm run calibrar                    # cinco jugadores automáticos, 5 partidas cada uno, y los criterios
npm run calibrar -- todas 7         # 7 partidas por jugador
npm run calibrar -- razonable 3 '{"afluencia":{"aceleracion":0.03}}' --detalle
```

El JSON del tercer argumento se mezcla sobre `src/config.ts` solo para esa ejecución. El script dice además en cuántas partidas consigue cada jugador los retos del nivel. Los criterios y cómo leerlos están en `CALIBRACION.md`.

## Añadir un nivel

Copia su carpeta a `niveles/<id>/` (`nivel.json`, `alturas.png`, `miniatura.png`) y añade `{ "id": "<id>" }` a `niveles/indice.json`. No hay que tocar código. `npm test` valida todos los niveles del índice y juega una partida automática en cada uno; `npm run miniatura -- <id>` genera la miniatura a partir del relieve. El formato completo está en `FORMATO_NIVEL.md`.

## Otras herramientas

```
npm run medir:eleccion     # por dónde bajan los esquiadores de cada nivel en una red fija
npm run medir:arrastre     # coste del primer arrastre tras una obra
node scripts/medirRendimiento.cjs 4 80   # tiempos por fotograma con ~350 esquiadores y la CPU frenada ×4 (con el servidor de desarrollo en marcha)
```
