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

## Fase 2

14. **Un día dura 240 s de juego** (2 minutos reales a 1×) y la puntuación son los días completos. Así una partida razonable son unos 9 días y los retos de «sobrevivir N días» tienen números manejables.
15. **Los avisos cortos se quedan.** «Aprendizaje sin texto» se aplica a la enseñanza (no hay textos de ayuda ni ventanas de tutorial), pero cuando algo no se puede hacer sigue saliendo un aviso de una línea con el motivo: sin él, los fallos de trazado no se entienden.
16. **Los cobros se agrupan.** Con cientos de bajadas por minuto, un «+N» por bajada taparía el mapa: las que llegan al mismo punto en medio segundo suman en un solo número.
17. **En horizontal se empieza acercado al pie de pistas.** Los mapas son más altos que anchos; entero en una pantalla apaisada se ve muy pequeño. Se puede alejar con el pellizco.
18. **La guía se guarda como hecha** al mejorar un remonte o a los diez minutos de juego, lo que ocurra antes.
19. **Hasta la fase 4, «Menú» y «volver» empiezan otra partida** (aún no hay menú al que volver).
20. **Rendimiento: 60 fps se comprobó como tiempo de cálculo por fotograma**, no como fotogramas reales: el entorno de pruebas pinta sin GPU. Con 330 a 370 esquiadores y la CPU frenada ×4, simulación más dibujo son unos 8 ms; el precálculo tras cada obra alarga algunos fotogramas durante unos segundos.

## Fase 3

21. **`mapas/` se queda como mapas de prueba.** Las pruebas automáticas usan coordenadas concretas de esos tres mapas; si dependieran del nivel jugable, se romperían el día que llegue el relieve real de Espot. El juego solo carga `niveles/`. El nivel Espot es una copia de los datos de `mapas/gran-dominio` (decisión 1).
22. **Los retos con restricción llevan un mínimo de días opcional.** «Sin telecabinas», «máximo de N remontes» y «ninguna pista forzada» se cumplirían perdiendo enseguida; con `dias` se pide además haber sobrevivido. Es opcional para no imponer nada a la herramienta externa.
23. **«Sin telecabinas» y «máximo de N remontes» miran el máximo alcanzado durante la partida**, no el estado final (deshacer al final no cuenta). «Ninguna pista forzada» mira el estado final.
24. **El récord son días completos** y una partida de cero días no es récord.
25. **Parámetros por nivel con la misma estructura que `src/config.ts`.** Una clave desconocida es un error, para detectar erratas del JSON.
26. **Tercer reto de Espot: 1000 bajadas de negros.** El jugador automático razonable lo consigue en 3 de 7 partidas y el torpe en ninguna. Un reto de restricción (por ejemplo, «8 días con 12 remontes como máximo») sería más interesante, pero ningún jugador automático lo intenta y no se pudo comprobar que fuera posible.
27. **Cinco entradas `proximo-N` bloqueadas en el índice**, sin nombre: el selector las mostrará como «próximamente».

## Fase 4

28. **El título se dibuja con trazos, no con una fuente.** No se añaden fuentes web (peso y licencias) y Android no trae ninguna geométrica; trazado con líneas gruesas tiene el mismo aspecto en todos los dispositivos. El resto de textos usa Futura, Century Gothic o Avenir si existen y, si no, la del sistema.
29. **Daltonismo: paleta y formas, no formas en cada esquiador.** Con 300 puntos de 2 px de radio una forma no se lee; el modo cambia la paleta y pone el símbolo del nivel donde hay sitio.
30. **Reiniciar el progreso pide un segundo toque** en 3,5 s, en vez de una ventana de confirmación. Borra récords, retos y la guía.
31. **Se entra por el menú**; `?nivel=<id>` y `?ajustes` abren una partida directamente (pruebas y calibración).
32. **Transición por fundido** al color del menú, con la tarjeta elegida creciendo un instante.

## Fase 5

33. **«A mano en el navegador» se hizo con gestos reales emulados** (Playwright con un Pixel 7, en vertical y horizontal) y con el jugador automático razonable jugando dentro de la página. No hay acceso a un móvil físico.
34. **Las pruebas de cierre juegan una partida de 16 minutos de juego en cada nivel jugable** y comprueban cada minuto que no hay puntos ciegos (pistas activas solo hacia puntos viables, remontes en servicio con bajada, nadie en una pista o cola que no le corresponde) y que los colores ofrecidos caben por pendiente.
35. **Las pistas con tramo común quedan fuera de la comprobación de banda**: al unirse a otra cambia su longitud y su pendiente media puede salirse de la banda de su color. Se anota como punto flojo.

## Revisión del 2026-11-17

36. **Todas las bases de la plaza son contiguas a pie** (1000 m), en vez de cambiar la geometría de Espot: es lo que espera quien juega (que el esquiador pueda ir a otra base si la suya tiene mucha cola) y vale para cualquier nivel.
37. **Las colas se comparan por espera, no por número de personas**, y pesan más (exponente 1,5). Se eligió 1,5 y no 2 porque con 2 el jugador razonable perdía antes sin que el reparto mejorase de forma visible.
38. **Coste fijo por remonte de 2 monedas por minuto y 450 monedas iniciales** para que «solo ampliar» siga sin alcanzar al razonable.
