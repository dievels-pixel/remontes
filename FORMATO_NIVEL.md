# Formato de un nivel

Un nivel es una carpeta de datos dentro de `niveles/`. El juego no contiene nada propio de ningún nivel: los descubre por el índice y los carga con un único cargador (`src/niveles.ts`; la validación está en `src/core/nivel.ts`, `src/core/mapa.ts` y `src/core/retos.ts`).

**Añadir un nivel** es copiar su carpeta a `niveles/<id>/` y añadir una línea a `niveles/indice.json`. No hay que tocar código.

```
niveles/
  indice.json
  <id>/
    nivel.json       mapa, parámetros propios y retos
    alturas.png      relieve
    miniatura.png    imagen para el selector de niveles
```

Si algo no cumple el formato, el juego no arranca ese nivel y muestra un mensaje que dice qué falla (por ejemplo, «Nivel no válido: el nodo 7 está fuera del mapa»). `npm test` comprueba todos los niveles del índice.

## `niveles/indice.json`

```json
{
  "niveles": [
    { "id": "espot" },
    { "id": "proximo-1", "bloqueado": true }
  ]
}
```

| Campo | Tipo | Obligatorio | Significado |
|---|---|---|---|
| `id` | texto | sí | Nombre de la carpeta. Solo minúsculas, cifras y guiones. No se puede repetir. También es la clave con la que se guarda el progreso: si se cambia, se pierden el récord y los retos de ese nivel. |
| `bloqueado` | booleano | no (por defecto `false`) | `true`: el nivel aún no existe. Se muestra en el selector como «próximamente» y no necesita carpeta. |
| `nombre` | texto | no | Solo para los bloqueados, si se quiere anunciar su nombre. Los jugables lo llevan en su `nivel.json`. |

El orden de la lista es el orden del selector. Tiene que haber al menos un nivel jugable; el primero es el que se abre por defecto.

## `nivel.json`

```json
{
  "formato": 1,
  "nombre": "Espot",
  "ancho": 4000,
  "alto": 6000,
  "cotaMin": 1300,
  "cotaMax": 3200,
  "plaza": { "x": 2000, "y": 5780, "radio": 200 },
  "parametros": {},
  "retos": [
    { "tipo": "dias", "n": 4 },
    { "tipo": "satisfechos", "n": 600 },
    { "tipo": "bajadasNegros", "n": 1000 }
  ],
  "nodos": [
    { "tipo": "base", "x": 1650, "y": 5700 },
    { "tipo": "intermedio", "x": 1250, "y": 5250 },
    { "tipo": "cima", "x": 2100, "y": 2300 }
  ]
}
```

Todas las distancias van en metros. El origen (0, 0) es la esquina superior izquierda del PNG; `x` crece hacia la derecha y `y` hacia abajo.

| Campo | Tipo | Obligatorio | Significado |
|---|---|---|---|
| `formato` | número | no | Versión del formato. Hoy, `1`. Si se indica otra, el nivel se rechaza. |
| `nombre` | texto | no (por defecto «Sin nombre») | Nombre que se muestra. |
| `ancho`, `alto` | número > 0 | sí | Tamaño del mundo que cubre el PNG de alturas, en metros. |
| `cotaMin`, `cotaMax` | número | sí | Cotas (m) que representan el negro (0) y el blanco (255) del PNG. `cotaMax` debe ser mayor. |
| `plaza` | `{ x, y, radio }` | sí | Pie de pistas: por su borde entran los esquiadores (la carretera llega desde el borde derecho del mapa, por debajo de la plaza) y ninguna pista puede cruzarla. |
| `nodos` | lista | sí, no vacía | Puntos del mapa (ver abajo). |
| `parametros` | objeto | no | Cambios de balance solo para este nivel (ver abajo). |
| `retos` | lista | no | Retos del nivel (ver abajo). El selector muestra tres marcas: conviene que sean tres. |

### Nodos

```json
{ "tipo": "intermedio", "x": 1250, "y": 5250 }
```

| Campo | Valores | Significado |
|---|---|---|
| `tipo` | `"base"`, `"intermedio"`, `"cima"` | **base**: punto de inicio junto a la plaza; de ahí arrancan los primeros remontes y ahí terminan los esquiadores. Hace falta al menos una; lo normal son 2 o 3 alrededor de la plaza. **intermedio**: punto de media ladera; puede recibir y dar remontes y pistas. **cima**: punto final; a ella llegan remontes y de ella salen pistas, pero no arranca ningún remonte. |
| `x`, `y` | número dentro del mapa | Posición en metros. |

La cota de cada nodo **no se escribe**: sale del PNG de alturas en su posición. El orden de la lista no importa para el juego, pero el número de orden es el identificador del nodo en los mensajes de error.

Recomendaciones para que el nivel se pueda jugar (el juego no las exige):

- Las bases, en la zona baja, a unos 300 o 400 m del centro de la plaza y a menos de 400 m entre sí (así los esquiadores pueden cambiar de base andando).
- Al menos un punto intermedio a menos de 1000 m de una base desde el que quepa una pista verde de vuelta (pendiente en recta entre 0,05 y unos 0,30): es el primer remonte de cualquier partida.
- Nodos separados al menos 80 m entre sí y fuera de la plaza.
- Variedad de pendientes entre parejas de nodos: verde de 0,05 a 0,20, azul de 0,13 a 0,30, roja de 0,22 a 0,42 y negra de 0,35 a 0,60 (desnivel entre distancia en planta; con curvas, una pista puede bajar su pendiente hasta dividirla por 1,55).

### Parámetros del nivel

`parametros` repite la estructura de `src/config.ts` solo con lo que el nivel cambia. Los bloques se mezclan clave a clave; los números, textos y listas se sustituyen enteros. Una clave que no existe en `src/config.ts` es un error (casi siempre, una errata).

```json
"parametros": {
  "economia": { "monedasIniciales": 600 },
  "afluencia": { "tasaInicial": 8, "aceleracion": 0.03 },
  "quejas": { "capacidad": 30 }
}
```

Los bloques con sentido para un nivel son `afluencia` (ritmo de llegadas y mezcla de niveles en el tiempo), `economia` (monedas iniciales, precios, tarifas y mantenimiento), `quejas` (medidor de derrota y periodo de gracia), `colas`, `esquiador`, `remonte`, `pista` (bandas de pendiente por color), `terreno` (umbral de roca) y `dia`. El significado y las unidades de cada valor están comentados en `src/config.ts`. Un nivel sin `parametros` usa los valores calibrados (ver `CALIBRACION.md`).

### Retos

Cada reto se comprueba al acabar la partida. Los conseguidos se guardan y no se pierden.

| `tipo` | Campos | Se consigue si… |
|---|---|---|
| `dias` | `n` | se sobreviven `n` días o más. Un día son 240 s de juego (2 minutos reales a velocidad normal). |
| `satisfechos` | `n` | `n` esquiadores o más se van satisfechos (cansados, sin queja). |
| `bajadasNegros` | `n` | los esquiadores negros completan `n` bajadas o más. |
| `sinTelecabinas` | `dias` (opcional) | no ha habido ninguna telecabina en toda la partida. |
| `maxRemontes` | `n`, `dias` (opcional) | no se ha pasado de `n` remontes a la vez en ningún momento (y se ha construido al menos uno). |
| `sinForzadas` | `dias` (opcional) | al acabar no hay ninguna pista forzada (una cuya pendiente entra en la banda del color siguiente). |

En los tres últimos, `dias` exige además haber sobrevivido ese número de días; sin él, el reto se cumpliría perdiendo enseguida, así que conviene ponerlo. `n` y `dias` deben ser números positivos.

Para ajustar los números de un nivel: `npm run calibrar -- todas 7 '{}' <id>` juega partidas con los jugadores automáticos y dice en cuántas consigue cada uno cada reto, además de las medianas de días, satisfechos, bajadas de negros, remontes y telecabinas. Criterio usado en el primer nivel: el primer reto lo consigue a veces el jugador torpe; el segundo, siempre el razonable y rara vez el torpe; el tercero, el razonable menos de la mitad de las veces.

## `alturas.png`

- PNG de 8 bits sin entrelazar. Se lee el primer canal: lo normal es escala de grises (también vale RGB o RGBA con los tres canales iguales).
- Negro (0) es `cotaMin` y blanco (255) es `cotaMax`, lineal.
- Cubre el rectángulo `ancho` × `alto` del nivel; la primera fila es el norte (y = 0). Conviene que las proporciones del PNG sean las del mapa.
- Resolución orientativa: una muestra cada 15 a 25 m (el primer nivel usa 200 × 300 muestras para 4000 × 6000 m). El juego suaviza las alturas con un filtro pequeño; con 8 bits, más resolución no da más detalle útil.
- Del relieve salen las cotas de los nodos, el color del fondo y el terreno no esquiable: donde la pendiente local supera el umbral de roca (0,9 por defecto, `terreno.umbralRoca`), se pinta como roca y ninguna pista pasa. Una pista tampoco cruza terreno más alto que su salida ni se sale del mapa.

## `miniatura.png`

- PNG para el selector de niveles. Tamaño orientativo: 240 px de ancho con las proporciones del mapa (el primer nivel, 240 × 360). Se recorta al marco del selector centrada.
- Puede ser cualquier imagen. `npm run miniatura -- <id>` genera una a partir de `alturas.png` con los colores de terreno del juego y la plaza marcada.
- Si falta, el selector muestra el nivel sin imagen.

## Progreso guardado

Por cada nivel se guarda en el navegador (`localStorage`, clave `remontes.progreso`) el récord en días completos, qué retos se han conseguido (por posición en la lista `retos`) y el número de partidas. Si se cambia el orden de los retos de un nivel ya publicado, las marcas guardadas se referirán a otros retos: mejor añadir al final o cambiar el `id`.

## Mapas de prueba

La carpeta `mapas/` no son niveles: son mapas pequeños con coordenadas fijas que usan las pruebas automáticas y los scripts de medida (`mapa.json` con los mismos campos de mapa que `nivel.json`, sin `parametros` ni `retos`). El juego no los carga.
