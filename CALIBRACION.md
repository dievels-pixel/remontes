# Calibración

Valores finales de la fase 1 (2026-11-16) y resultados de las partidas automáticas que los justifican. Todos los parámetros están en `src/config.ts`; aquí solo se resumen los que se tocaron.

Para repetirla:

```
npm run calibrar                 # los cinco jugadores, 5 partidas cada uno, y los criterios
npm run calibrar -- todas 7      # 7 partidas por jugador (lo que se usó aquí)
npm run calibrar -- razonable 3 '{"afluencia":{"aceleracion":0.03}}' --detalle
```

El tercer argumento es un JSON que se mezcla sobre `CONFIG` solo para esa ejecución, así se prueban variantes sin tocar el archivo. `--detalle` imprime el minuto a minuto de la primera partida de cada jugador. Si algún criterio falla, el script termina con código de error.

Los minutos de los criterios son **reales a velocidad 1×**. El juego corre a 2 segundos de juego por segundo real (`CONFIG.tiempo.escala`), así que 12 a 20 minutos reales son de 24 a 40 de juego.

## Jugadores automáticos

Están en `src/bots/jugadores.ts` y juegan con las mismas acciones que una persona (`Juego.construirRemonte`, `abrirPista`, `mejorarRemonte`); la partida sin pantalla es `src/bots/partida.ts`.

| Jugador | Qué hace |
|---|---|
| torpe | Decide cada 15 s, al azar: un remonte cualquiera que pueda pagar con una sola pista del primer color que quepa; a veces mejora uno al azar. No mira colas ni colores. |
| razonable | Alivia la peor cola (mejora o remonte paralelo) y guarda dinero si ve una creciendo; pone un remonte de vuelta al pie de cada roja o negra que acaba a media ladera; busca el color que falta según la mezcla de llegadas (pista gratis o remonte nuevo donde quepa); con holgura, amplía. |
| todoVerde | Como el razonable en colas y ampliación, pero abre siempre el color más fácil que quepa (todo verde forzado) y no busca colores. |
| soloMejora | Dos remontes y, a partir de ahí, solo mejora (primero donde hay más cola). |
| soloAmplia | Nunca mejora: amplía con el remonte más barato en cuanto puede pagarlo. |

Todos menos el torpe comparten la apertura (un primer remonte corto desde la plaza con bajada verde), para que la comparación mida la estrategia y no el primer movimiento.

## Criterios y resultado

Siete partidas por jugador en el nivel jugable, con los valores finales:

| Criterio | Resultado | ¿Cumple? |
|---|---|---|
| Jugador razonable: partida de 12 a 20 minutos | mediana 17:58 (de 17:33 a 19:30) | Sí |
| Imposible perder en los 2 primeros minutos | la derrota más temprana de las 35 partidas, 5:07 | Sí |
| Todo verde forzado no gana (menos del 80 % del razonable) | mediana 10:45 (60 %) | Sí |
| Solo mejorar no gana | mediana 7:05 (39 %) | Sí |
| Solo expandir no gana | mediana 13:09 (73 %) | Sí |
| El torpe pierde antes que el razonable | mediana 11:03 (de 5:07 a 14:52) | Sí |
| La derrota llega en cadena: del medio medidor al final pasa al menos 1 minuto | mediana 1:07 | Sí |

De qué pierde cada uno (enfadados por aburrimiento / por cola):

- **razonable**: mezcla de las dos causas en todas las partidas (20/52, 43/39, 28/53, 49/29, 32/46, 38/35, 32/49). Acaba con 12 a 15 remontes (3 a 5 telecabinas) y unos 320 a 400 esquiadores.
- **todoVerde**: solo aburrimiento (64/0, 56/0): rojos y negros no tienen nada de su nivel y 16 de sus 34 pistas son forzadas.
- **soloMejora**: las dos, con dos telecabinas y cuatro pistas verdes: ni variedad ni colores.
- **soloAmplia**: casi solo colas (5/50, 2/52) con 25 telesquís: sin mejorar, los remontes de la plaza no dan abasto.
- **torpe**: colas y aburrimiento según la suerte; muy variable.

El criterio de «no gana» se fijó en «menos del 80 % de la mediana del razonable»: el que solo expande llega a 13 minutos porque en lo demás juega bien (abre los colores que faltan), pero siempre pierde 4 o 5 minutos antes que quien además mejora.

## Valores finales (frente a v46)

| Parámetro | Antes | Ahora | Por qué |
|---|---|---|---|
| `tiempo.escala` | 2 | 2 | Sin cambio. |
| `remonte.velocidad` | 160 m/s | 100 m/s | Ciclos más largos y bolitas más juntas. |
| `remonte.intervaloBolitas` | 0,9 s | 1,8 s | Un telesquí subía 67 personas por minuto y las colas no apretaban nunca; ahora 33 (telesilla 67, telecabina 133). |
| `afluencia.tasaInicial` | 12 /min | 6 /min | Arranque suave: con dos telesquís se aguantan los primeros minutos. |
| `afluencia.incremento` | 3 por minuto | 1,6 por minuto | Partida más larga. |
| `afluencia.aceleracion` | (no existía) | 0,026 por minuto² | La presión llega al final sin endurecer el principio: 48 llegadas por minuto en el minuto 20 de juego y 77 en el 30. |
| `afluencia.mezcla` | rojos desde el 4, negros desde el 8 | rojos desde el 6, negros desde el 12 (4 %), 10 % en el 20 y 15 % en el 30 | El mapa admite pocas negras: con más negros todas las derrotas eran por su aburrimiento. |
| `esquiador.memoriaVariedad` | 2 pistas | 1 pista | Con dos hacían falta tres pistas del propio color para recuperar contento (decisión abierta de la especificación). |
| `esquiador.gustoPorDiferencia` | 1 / 0,5 / 0,15 / 0,03 | 1 / 0,6 / 0,08 / 0,02 | Mínimo a lo que aburre. |
| `esquiador.factorRepeticion` | 0,3 | 0,4 | Repetir su color es mejor que aburrirse. |
| `esquiador.factorNovedad` | (no existía) | 2,5 | Una pista por la que aún no ha bajado pesa más: recorre la estación. |
| `esquiador.descuentoPorRemonte` | 0,85 (sobre el máximo) | 0,7 (sobre la suma) | El atractivo de un remonte es ahora la suma de lo que hay arriba, no lo mejor. |
| `colas.tiempoAnillo` | 20 s | 30 s | A escala 2 el anillo se llenaba en 10 s reales. |
| `quejas.capacidad` | 20 | 36 | Final menos brusco. |
| `quejas.gracia` | (no existía) | 240 s de juego | En los 2 primeros minutos reales los enfadados no llenan el medidor. |
| `economia.monedasIniciales` | 300 | 400 | Tres telesquís cortos de salida. |
| `economia.precioPorMetro` | 0,1 | 0,12 | Un telesquí de 1000 m cuesta 120. |
| `economia.mantenimiento.porMetroYMinuto` | 0,006 | 0,008 | Con los factores 1 / 4 / 10 de antes. |

## Retos de Espot

Con los valores finales, siete partidas por jugador (`npm run calibrar -- todas 7`), en cuántas se consigue cada reto:

| Reto | torpe | razonable | todoVerde | soloMejora | soloAmplia |
|---|---|---|---|---|---|
| Sobrevive 4 días (asequible) | 4/7 | 7/7 | 7/7 | 0/7 | 7/7 |
| 600 esquiadores satisfechos | 2/7 | 7/7 | 2/7 | 0/7 | 0/7 |
| 1000 bajadas de negros (exigente) | 0/7 | 3/7 | 0/7 | 0/7 | 0/7 |

Medianas del jugador razonable: 9,0 días, 1119 satisfechos, 893 bajadas de negros, 15 remontes como máximo y 4 telecabinas. Las del torpe: 5,5 días, 319 satisfechos y 81 bajadas de negros.

## Qué se probó y se descartó

- **Telesquís de 30 personas por minuto (intervalo 2,0 s)** o **mantenimiento de 0,012 a 0,02**: el arranque queda en el filo; quien no encadena tres remontes baratos en los primeros minutos pierde en el minuto 3 o 4, incluido el jugador razonable.
- **Mantenimiento bajo y precios de v46 con los remontes rápidos**: el razonable pasa de 30 minutos y acumula 30 000 monedas.
- **Subir solo el incremento lineal de la afluencia** (1,9 por minuto): acorta también el principio. Por eso la aceleración.
- **Medidor de 20 o 30 quejas**: del medio medidor a la derrota pasaban 50 s o menos.
- **Atractivo de un remonte como el máximo de lo que hay arriba** (v36): un remonte a un sector entero competía como una sola opción contra cada pista del punto.

## Gente en la zona baja

Parte de la gente que está en los remontes de la plaza o bajando hacia ella, media de la segunda mitad de la partida:

| | v46 (auditoría) | Ahora |
|---|---|---|
| Jugador de referencia (equilibrado / razonable) | 60 a 70 % | 51 % |
| Solo amplía (más remontes arriba) | — | 42 % |

Parte de esa concentración es inevitable: todo el que llega entra por los remontes de la plaza y, en este mapa, lo que cabe en la zona baja son verdes y azules. Lo que cambió es que ya no hay descuento que penalice subir, que el terreno de arriba atrae en proporción a sus pistas y que cada esquiador busca pistas que aún no ha hecho (`test/fase1.test.ts`: con un sector alto de tres pistas y una sola abajo, más de la mitad de las bajadas salen de arriba).

## Lo que queda flojo

- **El dinero sobra al final** (unas 10 000 monedas del razonable al perder). En el último tercio las mejoras ya están hechas donde importan y no hay en qué gastar. No decide la partida, pero el mantenimiento deja de sentirse.
- **Más de 300 esquiadores al final** (hasta unos 400 en el último minuto de las partidas más largas): por encima del objetivo de rendimiento de 300.
- **El torpe es muy variable** (de 5 a 15 minutos): depende de si su primer remonte al azar da bajada verde.
- Los resultados dependen de lo bien que juegan los jugadores automáticos. Una persona razonable construirá mejores circuitos para rojos y negros, pero más despacio.
