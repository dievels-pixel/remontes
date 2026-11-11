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

## Sobre el usuario

Es ingeniero de estructuras, con conocimientos técnicos avanzados, y quiere un colaborador crítico: señala incoherencias del diseño y alternativas más simples, y no des explicaciones básicas. Prefiere soluciones prácticas y sencillas frente a las complejas.
