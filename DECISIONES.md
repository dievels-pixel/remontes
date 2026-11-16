# Decisiones tomadas durante el acabado

Cada vez que el encargo era ambiguo o chocaba con el documento de diseño se eligió la opción más simple y se apuntó aquí. Ninguna es irreversible.

## Fase 0

1. **El nivel «Espot» usa el relieve de `gran-dominio`.** El encargo dice que solo existe el mapa de Espot, pero en el repositorio no hay ninguno con ese nombre: hay tres mapas sintéticos. Crear mapas nuevos está fuera de alcance, así que el nivel jugable se llamará Espot y tomará los datos del mapa grande que ya se usaba por defecto. Cuando la herramienta externa produzca el relieve real, bastará con sustituir la carpeta.
2. **Sin edificios.** El encargo pide «aparición animada de edificios», pero el documento de diseño los tiene en «Descartado» (se probaron en v38 y el usuario los quitó en v39). Manda el documento: no se reintroducen.
3. **La guía enseña el gesto actual, no «tocar el proyecto de pista».** Los proyectos de pista a trazos se sustituyeron en v31 por arrastrar de un punto alto a uno bajo. La guía resaltará: arrastra desde la base, arrastra hacia abajo desde la llegada, elige color.
4. **Los minutos de los criterios de calibración son minutos reales a velocidad 1×.** El juego corre a 2 segundos de juego por segundo real (v41), así que «partida de 12 a 20 minutos» son de 24 a 40 minutos de juego, y «los 2 primeros minutos» son los 4 primeros de juego con la estación abierta.
5. **Velocidades: pausa, 1× y 2×.** El 0,5× de v41 desaparece porque el encargo pide solo pausa y dos velocidades.
6. **Commit por fase.** `CLAUDE.md` pedía un commit por petición; para este encargo se hace uno por fase, como se pide.

## Fase 1

7. **«No gana» significa menos del 80 % de lo que aguanta el jugador razonable.** El juego no tiene victoria, así que «ninguna estrategia única gana» se midió como: la mediana de cada jugador de una sola idea queda por debajo del 80 % de la del razonable.
8. **«No de golpe» significa al menos 1 minuto real del medio medidor a la derrota** (mediana del jugador razonable).
9. **Periodo de gracia en vez de un límite matemático.** Para que sea imposible perder en los 2 primeros minutos, durante los primeros 240 s de juego con la estación abierta los enfadados se cuentan pero no llenan el medidor. Es lo más simple que lo garantiza con cualquier forma de jugar.
10. **Memoria de variedad de una pista.** La especificación lo tenía como decisión abierta (una o dos). Con dos hacían falta tres pistas del propio color para recuperar contento y todas las derrotas eran por los negros.
11. **El atractivo de un remonte es la suma de lo que hay arriba**, no lo mejor, y las pistas nuevas para el esquiador pesan más. Es la forma más simple de que la gente se reparta sin reglas de reparto.
12. **Afluencia con término cuadrático.** Subir solo la pendiente lineal acortaba también el principio.
13. **`scripts/jugarPartidas.mjs` se sustituye** por `src/bots/` (con tipos y pruebas) y `npm run calibrar`.
