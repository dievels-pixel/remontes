# remontes

Juego web minimalista de gestión en tiempo real, tipo Mini Metro, con remontes y pistas de esquí. El diseño completo está en `docs/diseno.md`, que es la fuente de verdad: léelo antes de programar.

## Pila

- TypeScript, Vite y Canvas 2D, sin librerías de juego (PixiJS solo si una prueba de rendimiento lo justifica).
- Despliegue automático a GitHub Pages con GitHub Actions al fusionar en `main`, para poder probar el juego desde el navegador del móvil.
- Pensado para táctil: usar pointer events, no eventos de ratón.

## Reglas de trabajo

- Implementa solo la etapa del plan que se pida. No adelantes etapas posteriores.
- Cada etapa debe poder abrirse y jugarse en el navegador antes de pasar a la siguiente.
- Lógica pura (grafo, sinuosidad, nodos viables, cruces, colas, afluencia) en `src/core`, sin tocar DOM ni canvas, y con pruebas (Vitest). Dibujo en `src/render`, entrada en `src/input`.
- Todos los parámetros de balance (afluencia, precios, umbrales de pendiente, capacidades, velocidades) en un único archivo, `src/config.ts`.
- Las decisiones abiertas de `docs/diseno.md` no se inventan: pon un valor provisional en `src/config.ts` y señálalo al terminar.
- Trabaja en una rama por etapa y deja el cambio listo para fusionar; el usuario lo revisa y lo fusiona desde el móvil o el ordenador.
- Si cambia una decisión de diseño, actualiza `docs/diseno.md` en el mismo cambio.
- Comentarios y textos visibles para el jugador en español de España.
- Al terminar, explica qué debería verse al abrir la página, qué has dejado fuera a propósito y qué has probado de verdad (pruebas automáticas) frente a lo que solo se puede comprobar jugando.
- Lee la sección «Estado del desarrollo» al final de `docs/diseno.md`: dice qué está hecho, qué falta y qué decisiones están pendientes. Actualízala al cerrar cada cambio, y apunta ahí los pasos de un plan que quede a medias: los planes de la conversación no se conservan entre sesiones.

## Convenciones del proyecto

- Cada petición del usuario termina en una petición de fusión. Tras fusionarse, la rama de trabajo se recrea desde `main` antes del siguiente cambio. En pantalla se ve `vN · fecha` (N = número de la petición de fusión), para que el usuario sepa qué versión tiene cargada; si ve algo raro, comprueba primero la versión.
- Antes de arreglar un fallo que describe el usuario, reprodúcelo (con un script o una prueba que use la lógica real) y deja una prueba que lo cubra.
- Las pruebas no deben depender de los valores calibrados de `src/config.ts`: cada red de prueba lleva su propia copia de los parámetros (`test/apoyo.ts`), y las que se escribieron con valores concretos los fijan (`conValoresClasicos`, `BANDAS_CLASICAS`).
- Para probar en el navegador: `npx vite` y Playwright con un móvil emulado (Pixel 7). En desarrollo, `window.juego` y `window.camara` están expuestos para guiar las pruebas.
- `?ajustes` abre un panel temporal de calibración (`src/herramientas/ajustes.ts`), que no forma parte del juego. Los valores que el usuario fija con él se copian a `src/config.ts`.

# Diseño del juego

La especificación completa está en docs/diseno-juego-remontes.md. Léela al empezar cualquier tarea y respétala; manda sobre suposiciones propias. No reintroduzcas lo que figura en su sección "Descartado".
