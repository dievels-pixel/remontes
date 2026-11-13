# Diseño del juego de remontes y pistas de esquí

Actualizado: 2026-11-12

## Resumen para empezar a programar

Juego web minimalista de gestión en tiempo real, tipo Mini Metro: el jugador construye remontes entre puntos fijos de una montaña, activa pistas eligiendo su color y mantiene contentos a los esquiadores mientras la afluencia crece. Pierde cuando se acumulan demasiados esquiadores que se van enfadados.

Lo esencial del sistema, decidido en la sesión de diseño del 12 de noviembre:

- Dos números en pantalla: monedas (se ganan por bajada completada y se gastan en remontes) y quejas (medidor de derrota).
- Los esquiadores tienen un aguante propio, medido en minutos de juego. Al agotarlo se van cansados, sin quejas. No hay cierre de jornada.
- Cada esquiador tiene un contento de 3 puntos. Se aburre en pistas dos niveles o más por debajo del suyo, y solo recupera contento con variedad de pistas de su nivel. Si llega a 0 se va enfadado y suma una queja.
- El color de las pistas es libre (entre los colores factibles). Una pista forzada con curvas para ser más fácil de lo que da su pendiente natural resta contento si está muy forzada.
- El pago por bajada depende del color de la pista y crece con cada bajada con variedad.
- La afluencia total sube con el tiempo; la mezcla de colores de los esquiadores también la fija la curva del tiempo, no lo que construya el jugador. Los edificios son solo decoración.
- Crecer hacia otro valle es gratis: al activarse una cima se desbloquean los nodos bajos cercanos, y el jugador solo paga el remonte que sube desde ellos. Las pistas de bajada son gratuitas.
- El relieve cuenta: un mapa de alturas define valles y cimas, y las zonas de pendiente excesiva son roca o precipicio por donde no pasa ninguna pista. Los mapas son datos (PNG de alturas y JSON de nodos) que más adelante podrá producir un editor.
- Todas las cifras de este documento son hipótesis a calibrar con una simulación sin gráficos antes de pulir nada.

Qué cambia respecto a la versión anterior del documento: ver la sección "Descartado" al final.

## Visión

Juego minimalista de gestión en tiempo real: el jugador construye remontes entre puntos fijos de una montaña y decide qué pistas abrir para que los esquiadores no se acumulen en las colas.

- Referencia: Mini Metro, por la conexión de puntos con líneas, la música generativa y la sensación relajante.
- Plataforma: web, pensado para pantalla táctil. El stack concreto se decide en el repositorio; el documento no depende de ningún motor.
- Alcance del prototipo: un mapa fijo hecho a mano, sin economía ni niveles de esquiador al principio.
- Prioridad: encontrar primero algo que funcione y ajustar el resto probando.

## Elementos

El juego se compone de cuatro piezas: nodos, remontes, pistas y esquiadores.

- Nodos: puntos fijos, todos presentes en el mapa desde el inicio, cada uno con su cota. Tres tipos: base (cota baja; es un sumidero, los esquiadores terminan ahí y vuelven a la cola; las bases son los puntos de inicio agrupados alrededor de la plaza del pie de pistas), intermedio y cima. Solo están activos los nodos alcanzados por la red de remontes; los demás se ven atenuados, salvo los desbloqueados (nodos bajos cercanos a una cima activa), que se ven resaltados (ver "Abrir un valle"). El tipo es un dato del mapa que no se ve al empezar: todos los puntos se dibujan como círculos grises pequeños y toman su símbolo al usarse (ver "Estaciones y desdoble").
- Remontes: los traza el jugador entre dos nodos, siempre de abajo hacia arriba. Se dibujan como línea doble para no confundirlos con las pistas negras. Los esquiadores suben en bolitas que desaparecen al llegar arriba, como si la estación las tragara.
- Estados del remonte: activo o inactivo (en gris, sin subir a nadie). Un remonte recién construido está inactivo hasta que el jugador active al menos una pista desde su cima. Este mismo estado servirá más adelante para averías y mal tiempo.
- Tipos de remonte: telesquí (bolita pequeña, 1 persona, muy frecuente), telesilla (tamaño medio, varias personas) y telecabina (la más grande, más capacidad y más velocidad).
- Pistas: curvas sinuosas y descendentes entre un nodo alto y uno bajo. Cuatro colores de dificultad: verde, azul, roja y negra. Las pistas no tienen capacidad propia.
- Esquiadores: puntitos del color de su nivel. Un esquiador puede usar pistas de su nivel o inferiores. En una confluencia (ver "Cruces de pistas") manda el tramo común: una pista unida a otra más difícil cuenta con la dificultad mayor.

Detalles ya implementados y decididos jugando (etapas 1 a 3 del prototipo):

- Puntos sin usar (decidido el 2026-11-13): al empezar, todos los puntos son círculos grises pequeños, sin estación. Un punto toma su símbolo cuando un remonte arranca en él (círculo de salida), llega a él (triángulo si es un punto alto, es decir, una cima; cuadrado si se puede seguir subiendo, es decir, un intermedio) o pasa por él. Un remonte solo arranca en un punto de inicio (base) o, una sola vez, como continuación desde un cuadrado; de un triángulo no arranca ninguno. Una línea tiene como mucho un punto intermedio, así que el tramo que sigue de un cuadrado acaba siempre en triángulo, aunque llegue a un intermedio.
- Estaciones y desdoble: cada emplazamiento es un solo nodo para los esquiadores, pero los remontes empiezan y acaban en estaciones (círculo de salida, triángulo de llegada, cuadrado de paso en los intermedios). Si llega o sale otro remonte, el emplazamiento se desdobla en otra estación pegada, por el lado del que viene la línea nueva, hasta 3 por emplazamiento. Las pistas salen del emplazamiento (cualquiera vale para quien llega por cualquier triángulo), aunque se dibujan saliendo por la estación del lado hacia el que van.
- Línea que pasa por un intermedio: un remonte que llega al cuadrado de un intermedio y otro que sale de él forman una sola línea; basta una pista desde la llegada de arriba para que funcionen los dos tramos.
- Los remontes no se cruzan entre sí en planta. Remontes y pistas sí pueden cruzarse (cruce solo visual, como un puente).
- Cambio de base: al terminar en una base, un esquiador puede ir andando a una base contigua si su cola compensa el paseo.
- Interfaz: botón de deshacer la última construcción, velocidad 1×/2×/4× y versión en pantalla.

## Esquiadores: aguante, contento y pago

Esta sección define lo que le ocurre a cada esquiador desde que entra hasta que se va.

### Ciclo

Llega por la carretera, espera en la plaza, sube por un remonte, baja por una pista y repite hasta que se va. Hay dos formas de irse:

- Cansado: se le agota el aguante. No suma quejas. Es la salida normal.
- Enfadado: su contento llega a 0 o se llena el anillo de la cola en la que espera. Suma una queja y deja de pagar.

### Aguante

Cada esquiador tiene un aguante individual medido en minutos de juego (hipótesis: de 3 a 6, al azar). Se mide en tiempo y no en bajadas por tres razones: en estaciones grandes de pistas largas no se queda corto, las colas consumen su tiempo (menos bajadas, menos ingresos) y las pistas forzadas, al ser más largas, rinden menos sin necesitar regla aparte. El número de bajadas que hace cada uno sale solo de ese tiempo. No hay cierre de jornada, como en Mini Metro.

### Contento

Cada esquiador tiene un contento de 3 puntos al entrar. Lo modifican estos eventos:

- Aburrimiento: al bajar por una pista, resta max(0, diferencia de niveles menos 1) puntos. Solo aburre una pista dos niveles o más por debajo del esquiador.

| Esquiador \ Pista | Verde | Azul | Roja | Negra |
|---|---|---|---|---|
| Verde | 0 | | | |
| Azul | 0 | 0 | | |
| Rojo | 1 | 0 | 0 | |
| Negro | 2 | 1 | 0 | 0 |

- Recuperación: una bajada por una pista de su propio nivel recupera 1 punto (tope 3), pero solo si hubo variedad (ver más abajo).
- Pista muy forzada: resta 1 punto. El umbral de lo que cuenta como muy forzada es un parámetro (ver "Proyectos de pista").
- Cola saturada: cada nodo con espera tiene un aforo visible (hipótesis: unos 6 puntos). Si se supera, se llena un anillo en unos 20 segundos. Al llenarse, el último de la cola se va enfadado y el anillo baja a la mitad.
- A 0 puntos de contento, el esquiador se va enfadado.

Los puntos no cambian de color según su contento (ver "Movimiento y aspecto visual").

### Variedad

El esquiador recuerda sus dos últimas pistas (parámetro; con una sola bastaría con dos pistas para variar siempre). Bajar por una pista distinta a esas dos cuenta como variedad. Repetir no castiga con quejas, pero no avanza: no se recupera contento y el multiplicador de precio no sube.

Al elegir ruta, el esquiador prefiere entre las pistas válidas la que no ha usado hace poco, y desempata por la cola. Así se reparte la gente sin reglas extra y la cantidad de pistas importa: más pistas de un nivel dan más variedad y más ingresos por esquiador. Una telecabina que descargue en una sola pista tiene penalización natural, porque todos repiten y el precio no sube. Por eso no se añade una regla de velocidad por densidad en pista (descartada por ahora; se podría recuperar si aparecen pistas saturadas que molesten).

### Pago

Cada bajada completada paga la tarifa del color de la pista por la que se baja, multiplicada por (1 + 0,2 × n), con n el número de bajadas con variedad que lleva ese esquiador (hipótesis). Con el aguante limitado no hace falta tope.

- Tarifas de ejemplo: verde 1, azul 1,5, roja 2, negra 3.
- Se cobra por el color de la pista, no por el nivel del esquiador (un negro en una verde cobra tarifa verde y además se aburre), ni por remonte cogido (premiaría construir muchos remontes cortos y cobraría dos veces) ni por longitud de pista (premiaría forzar curvas) ni por tamaño de estación.
- Regla de calibración: tarifa × proporción de llegadas de ese color debe ser aproximadamente constante, para que ningún color sea una apuesta claramente mejor. Con una mezcla de ejemplo 40/30/20/10 y tarifas 1/1,5/2/3 aportan 0,40, 0,45, 0,40 y 0,30.
- Posible variante futura: cobrar según el desnivel de la pista, que no se puede inflar con curvas.

## Pie de pistas y afluencia

El juego empieza en el pie de pistas: una plaza con varios puntos de inicio (bases) a su alrededor y una carretera de acceso por la que llegan los esquiadores.

- Inicio: los puntos de inicio rodean la plaza. Al tocar uno se iluminan los nodos que se pueden alcanzar desde él (en el boceto, las flechas rojas); no se dibujan todas a la vez. Se arrastra hasta uno de ellos y empieza la dinámica. Para el prototipo, 2 o 3 inicios.
- Entrada de esquiadores: llegan por la carretera, entran en la plaza y van al inicio que tenga remonte. Un único punto de entrada.
- Afluencia total: una sola curva de esquiadores por minuto que crece con el tiempo y fija la dificultad. Es un parámetro en un único sitio para calibrarla. No depende de la reputación, de las quejas ni de lo construido, para evitar un efecto elástico en el que el juego se autorregula y nunca se pierde.
- Mezcla de niveles: la fija la curva del tiempo (hipótesis: al principio mayoría de verdes y azules, y más peso de rojos y negros con el tiempo). Es independiente de las pistas que construya el jugador; si la demanda dependiera de la oferta, no habría reto en equilibrar los colores. Conviene contrastar las proporciones con datos reales de estaciones. Más adelante se podría probar un boca a boca suave (los satisfechos de un color atraen un poco más de ese color, con tope de ±20% y lento), solo si el juego resulta demasiado rígido.
- Edificios: casas y hoteles alrededor de la plaza son solo decoración y no entran en la mecánica. Aparecen cuando la curva cruza un umbral, en un hueco predefinido y con una pequeña animación, como señal visual de que la afluencia sube. El nuevo nivel de afluencia se aplica unos 15 segundos después, como margen de reacción (igual que una estación nueva en Mini Metro). Cuando se llenan los huecos, los edificios mejoran de aspecto (casa, hotel, gran hotel).
- Fase posterior: cuando la estación crezca mucho, puede haber varias carreteras de acceso, es decir, varios puntos de entrada.

## Construcción y economía

Todos los nodos existen desde el principio, pero solo se activan al ser alcanzados por un remonte. Al empezar, solo están activas las bases (los puntos de inicio del pie de pistas).

- Recursos: monedas (ingresos por bajada, se gastan en remontes) y quejas (medidor de derrota). No hay categoría de estación, estrellas ni reputación que suba.
- Construir un remonte: se pulsa un punto de inicio (o un cuadrado que aún no sigue) y se arrastra hasta un nodo más alto (o, desde un nodo desbloqueado, hasta una cima activa; ver "Abrir un valle"). La línea sigue al dedo y el precio se actualiza en directo. Si no llega el dinero, la línea se pone roja y no se puede soltar. Al soltar sobre un nodo válido se construye y el nodo de destino se activa. Los nodos que no son válidos (más bajos que el origen) se atenúan durante el arrastre.
- El remonte recién construido aparece en gris y no funciona hasta que el jugador activa una pista desde su cima. El dinero ya está pagado desde el momento de construirlo.
- Precio del remonte = longitud × factor del tipo (hipótesis: telesquí ×1, telesilla ×2,5, telecabina ×5). Siempre se construye un telesquí y se mejora tocándolo, pagando solo la diferencia. Capacidades de ejemplo: 1, 4 y unas 8 personas, con la telecabina más rápida.
- Mejorar un remonte solo compensa cuando se forma cola: la capacidad se convierte en el cuello de botella que el jugador va resolviendo.
- Las pistas son gratuitas en dinero. Su coste es el reparto de colores y el forzado (ver "Proyectos de pista").
- Ingresos: ver "Pago" en la sección de esquiadores.
- El dinero no puede quedar en negativo y solo frena la expansión. La derrota viene de las quejas, no de la quiebra.
- Dilema central: gastar en expandir (más valles, más reparto) o en mejorar (más capacidad donde ya está la gente), mientras se ahorra con la presión encima.
- Riesgo conocido: colas largas dan menos bajadas, menos ingresos y menos capacidad de mejorar (espiral). Se probará en simulación. Si resulta demasiado dura, se puede añadir un ingreso mínimo por esquiador que llega a una cima.

### Abrir un valle (gratis)

Crecer hacia otra vertiente o valle no cuesta nada por sí mismo: el único coste es el remonte que sube desde allí.

- Al activarse una cima (un remonte llega a ella), se desbloquean los nodos bajos cercanos que aún no están activos (hipótesis: los 2 o 3 más próximos y más bajos que ella, con la misma limitación que los proyectos de pista, y solo aquellos a los que pueda bajar una pista factible, es decir, sin roca por medio). Se ven resaltados. Cuáles son depende del relieve (ver "Relieve y terreno esquiable").
- Desde un nodo desbloqueado el jugador arrastra hacia arriba hasta una cima activa y paga el remonte, con el precio normal por longitud y tipo (se construye un telesquí y se mejora después, como siempre). Al soltar, el nodo bajo se activa.
- Con ese remonte en marcha (funciona si la cima tiene pistas activas), el nodo ya es viable y se proponen las pistas de bajada de la cima hacia él, que el jugador activa eligiendo color (gratis).
- Desde ese nodo ya activo se pueden construir remontes a otras cimas, que a su vez desbloquean nuevos nodos bajos, y así sucesivamente: la red crece alternando valles y cimas.
- Los remontes siempre suben, así que el jugador paga la subida; la bajada es gratuita y solo exige elegir color.

Resuelve el problema de orden: un nodo desbloqueado no recibe esquiadores ni pistas hasta que su remonte funciona, así que nadie puede quedar atrapado en él.

## Proyectos de pista

Las pistas no se generan solas: al construir un remonte aparecen proyectos de pista a trazos, y el jugador los activa tocando y eligiendo color.

Al crear un remonte de X (punto bajo) a T (punto alto) se proponen:

- Hasta dos pistas de T a X, una a cada lado del remonte (forma de lente, como en los bocetos), según el terreno: con una cara de roca puede haber solo una.
- Pistas desde T hacia otros nodos más bajos que sean viables.
- Pistas desde otros nodos más altos hacia X.

Para evitar una maraña de trazos:

- Se limitan a los 2 candidatos más cercanos por dirección.
- Los trazos solo se muestran para la última obra o al tocar un nodo.
- Solo se proponen pistas que salgan de nodos activos.

Límites del trazado (decididos y calibrados jugando). Cada color se comprueba con su trazado real, y los que no cumplen salen apagados en el selector:

- Como mucho una pista cruzada sin unirse a ella.
- Si el trazado pasa a menos de 40 m de otra pista, se une a ella (confluencia, ver "Cruces de pistas"); si no puede unirse, no se propone.
- Salidas de un punto por ángulo, sin tope de número: cada pista sale (en sus primeros 200 m) separada al menos 30° de las que ya salen de ese punto y siempre cuesta abajo según el terreno (se toleran 10 m de subida). Si no cabe, la pista puede salir girada hacia su lado, en pasos de 10° hasta 60°, y volver enseguida a su eje; cada color busca su propio giro, porque su serpentina apunta a sitios distintos.
- Como mucho 4 pistas llegando a un punto.
- La plaza del pie de pistas es un obstáculo: ninguna pista entra en ella más un margen de 30 m.

El remonte pasa a funcionar en cuanto el jugador activa cualquier pista que salga de su cima (no tiene por qué ser una de las dos que vuelven a X). Mientras tanto se ve en gris y los proyectos a trazos de su cima siguen visibles como recordatorio.

Al tocar un proyecto aparece el selector de color. Los colores inalcanzables para ese par de nodos salen deshabilitados, y al elegir uno la curva se calcula con la sinuosidad necesaria (ver siguiente sección). Las pistas empiezan y acaban algo separadas del nodo para que se lea bien con muchas líneas alrededor.

### Color libre y pistas forzadas

- El color es libre entre los colores factibles y se puede cambiar sin coste, lo que encaja con la sensación relajante: reorganizar es parte del juego.
- Color natural de un par de nodos: el de la pendiente de la línea más recta posible (s_min).
- Pista forzada: pista cuyo color elegido es más fácil que el natural y por tanto necesita curvas. Solo se puede forzar hacia lo fácil, nunca hacia lo difícil, así que las negras dependen de los desniveles del mapa.
- Grado de forzado: la sinuosidad añadida respecto a la mínima del par (s dividido por s_min). Una azul casi recta apenas está forzada, y una verde sacada de una ladera negra lo está mucho. Una pista cuenta como "muy forzada" cuando su grado supera un umbral (parámetro a calibrar), y entonces resta 1 punto de contento a los esquiadores que bajan por ella.
- Por qué existe esta penalización: sin ella, forzar todo a verde sería siempre la mejor opción, y sin coste real la elección de color no tendría tensión.

### Oferta de pistas

La oferta de cada color se mide por longitud real de pista (kilómetros por color), como hacen las estaciones reales, y no por número de pistas. La estación perfecta no es un 25% de cada color, sino una oferta que siga la mezcla de llegadas de esquiadores.

## Pendiente, sinuosidad y color

El color de una pista sale de su pendiente real, que depende de lo que serpentee: más curvas dan más longitud y menos pendiente. Una pista de pendiente alta en línea recta puede ser una azul o verde si se traza con curvas.

```
p = ΔH / L = ΔH / (s · D)
```

Con ΔH el desnivel entre nodos, D la distancia en el mapa, L la longitud real de la pista y s = L / D la sinuosidad (s = 1 es la recta).

- Rango factible: cada par de nodos admite una sinuosidad entre s_min y s_max. El techo de pendiente es el de s_min y el suelo el de s_max. Calibrado jugando: s_max = 1,55.
- En las dos pistas laterales de T a X, s_min es algo mayor que 1: se abomban más (abombamiento 0,1 de la distancia, frente a 0,06 del resto) para no solaparse con la línea del remonte.
- Cada color es una banda de pendiente, y las bandas se solapan (calibrado jugando): verde 0,05–0,20, azul 0,13–0,30, roja 0,22–0,42, negra 0,35–0,60. Con la misma pendiente, una pista más ancha es más fácil, así que una pendiente del solape puede ser de dos colores.
- Al elegir color se toma, dentro de la banda, la pendiente más cercana a la de la recta (la que menos sinuosidad pide; calibrado jugando, en vez de la central). Primero se busca en la parte de la banda por debajo del mínimo del color siguiente; solo si ahí no cabe se usa el solape. Se calcula L = ΔH / p y s = L / D, y el color es factible si s cae dentro del rango. Con s_max 1,55 casi todo par ofrece dos colores sin entrar en el solape y a menudo un tercero en él.
- Trazado: recta entre nodos más un desplazamiento lateral: un abombamiento en C y una serpentina (una onda cada 720 m, con amplitud y longitud de onda algo irregulares, irregularidad 0,95, y una amplitud mínima o temblor de 20 m para que ninguna pista quede como una curva lisa). Se muestrea como polilínea, se mide su longitud y se ajusta la amplitud por bisección hasta alcanzar L. La forma depende solo de la pareja y del lado, así que es estable al recolorear. Valores calibrados con el panel de ajustes.
- Se descartan pares cuya pendiente en recta ya esté por debajo del mínimo de verde: una pista demasiado plana no se puede corregir.
- La velocidad de los esquiadores depende de la pendiente efectiva, así que una pista negra se ve más rápida que una verde.

Los umbrales de pendiente de cada color son parámetros ajustables. Pendiente: contrastarlos con valores de referencia de estaciones reales.

## Relieve y terreno esquiable

El relieve del mapa de alturas define valles, cimas y cordales, y condiciona qué se puede conectar.

- Colocación de nodos: las bases y los fondos de valle van en mínimos locales, las cimas en máximos locales y los intermedios en collados o laderas. Las cotas de los nodos salen del propio mapa de alturas.
- Terreno esquiable: se calcula una máscara a partir de la pendiente local del mapa. Donde supera un umbral (parámetro, bastante mayor que el de una pista negra, porque una pista que serpentea cruza la ladera con menos pendiente efectiva que la del terreno), el terreno es roca o precipicio y ninguna pista lo cruza.
- Regla de trazado: una pista nunca atraviesa terreno más alto que su cota de salida ni terreno no esquiable. Al muestrear su polilínea se comprueban ambas cosas; si alguna falla, se limita la amplitud de las curvas o se descarta ese color para el par. Los cordales y la roca limitan así de verdad por dónde pueden ir las pistas.
- Montañas rocosas: una cima con roca por un lado solo tiene pistas por la ladera esquiable. La cima se alcanza igualmente con un remonte, porque los remontes son cables y cruzan cualquier terreno.
- Consecuencias en las reglas: la lente de dos pistas por remonte pasa a ser "hasta dos, según el terreno", y un nodo bajo solo se desbloquea desde una cima si existe una pista factible entre ambos. Si no, se desbloquearía un valle al que no puede bajar nadie.
- El mismo umbral pinta la roca en el terreno (ver "Terreno"), de modo que lo que se ve como roca es lo que no se puede esquiar.
- Implementado (paso 3 del plan): umbral provisional 0,9, con la pendiente medida a dos celdas a cada lado (80 m en «Dos valles»). La regla se comprueba cada 20 m del trazado real de cada color; el que la incumple sale apagado (se descarta el color, no se limita la amplitud). Se tolera que el terreno quede 10 m por encima de la salida. Fuera del mapa cuenta como roca. El editor de pruebas no deja poner un punto en roca.
- Fuera de pista (idea futura, sin diseñar): la máscara ya distingue el terreno esquiable, así que más adelante podría haber rutas libres fuera de pista, por ejemplo para esquiadores negros.

## Mapas y editor

- Formato: un mapa de alturas en escala de grises (PNG) y un archivo (JSON) con los nodos (tipo y posición, con la cota sacada del mapa) y los parámetros propios del mapa (por ejemplo su curva de afluencia). Implementado en `mapas/<nombre>/`: `alturas.png` (8 bits; el negro es `cotaMin` y el blanco `cotaMax`) y `mapa.json` con `nombre`, `ancho` y `alto` del mundo en metros, `cotaMin`, `cotaMax`, la `plaza` (centro y radio) y los `nodos`. Con 8 bits y 1500 m de desnivel, cada nivel de gris son unos 6 m: basta para las cotas y el degradado.
- El mapa inicial (`mapas/inicial`) lo escribe un script (`npm run mapa:inicial`) con el mismo ruido con que se hizo el de las primeras etapas. El script no forma parte del juego: el juego solo carga datos.
- Al cargar, los grises se suavizan con un filtro [1 2 1] en cada dirección: con 8 bits, sin suavizar, la pendiente local (y con ella la roca) sale moteada.
- Mapa de pruebas «Dos valles» (`mapas/dos-valles`, por defecto; `npm run mapa:dos-valles`): valle A al sur con el pie de pistas, cordal con tres cimas (oeste 2650, centro 2840, este 2917 m), valle B al norte con tres nodos bajos (unos 2070 m) para probar «Abrir un valle», un cortado en la cara norte del pico este (desde él no se baja al valle B) y una banda de roca a media ladera del valle A con un paso de unos 250 m. Se elige mapa con `?mapa=<carpeta>` en la dirección (`?mapa=inicial` para el anterior). Los puntos se retocan con el editor de `?ajustes` y se copian como JSON.
- El primer prototipo carga un mapa hecho a mano en cualquier editor de imágenes. Un editor integrado en el juego, que escriba el mismo formato, llega después de tener un prototipo jugable; antes de eso retrasaría lo importante, que es probar la dinámica.
- Generador procedural: descartado por ahora.
- Estaciones reales: replicar estaciones reales, como hace Mini Metro con ciudades, usando datos abiertos de elevación (revisar la licencia de la fuente concreta) y presentándolas como "inspiradas en", sin el nombre comercial. Además permitiría calibrar los umbrales de pendiente por color con datos reales.

## Sin puntos ciegos

Ningún esquiador puede quedar atrapado en un nodo sin salida. La garantía sale de dos definiciones y tres reglas.

- Un nodo está activo si ha sido alcanzado por un remonte (o es una base). Desde un nodo activo se pueden construir remontes.
- Un nodo es viable como destino de una pista si es una base o tiene alguna salida operativa: una pista activa que salga de él o un remonte en servicio que salga de él.
- Un nodo está desbloqueado si es uno de los nodos bajos cercanos a una cima activa, con una pista factible desde ella, y todavía no está activo. Desde él solo se puede construir un remonte hacia una cima activa. No recibe pistas ni esquiadores hasta activarse.

1. Los remontes salen de los puntos de inicio, como continuación de un cuadrado (una vez) y, además, de nodos desbloqueados con destino en una cima activa.
2. Un remonte solo funciona cuando hay al menos una pista activa desde su cima. Así nadie llega a una cima por remonte sin tener bajada.
3. Solo se proponen pistas que terminen en un nodo viable. Un nodo activo cuya cima aún no tiene salida operativa no recibe pistas hasta que la tenga.

Con el desbloqueo de valles, un nodo bajo solo se activa al construirse su remonte hacia una cima activa, y ese remonte funciona porque su cima ya tiene pistas. Hasta entonces no recibe pistas ni esquiadores, así que la garantía no se rompe.

La garantía vale mientras no se puedan demoler remontes o pistas; si se permite, habrá que revalidar el grafo al borrar. Lo mismo para las averías futuras: la viabilidad de un nodo se vuelve a evaluar cuando un remonte cambia de estado.

## Cruces de pistas

El jugador solo activa proyectos de pista y elige color; no gestiona los cruces. En el prototipo los cruces son solo visuales, como un puente: cada esquiador sigue su pista.

Confluencias (adelantadas a petición del usuario): si el trazado de una pista nueva se encuentra con una existente, o pasa a menos de 40 m, se une a ella y comparten el tramo, como en las estaciones de verdad. Si van a destinos distintos, la nueva sigue a la existente hasta el punto más cercano a su destino y sale con un ramal. La unión y el ramal son tangentes (acuerdo curvo de unos 150 m). En el grafo no cambia nada: solo la geometría. En el tramo común manda la dificultad mayor.

En una segunda fase pueden convertirse en enlaces automáticos (atajos) cuando sean compatibles:

- Cada dirección se evalúa por separado. Pasar de la pista A a la B en el cruce solo es válido si el nodo de destino de B está más bajo que la altura de A en ese punto.
- La altura a lo largo de una pista se interpola linealmente con la longitud recorrida s:

```
h(s) = h_T - (h_T - h_N) · s / L
```

- Con esa regla nunca se sube, no hay bucles y no aparecen callejones sin salida.
- Se respeta el nivel: un esquiador azul no puede pasar a una pista roja.
- Cada enlace se marca con un punto pequeño para que el jugador lo lea.

Detección: las pistas son polilíneas muestreadas, y los cruces se calculan comparando segmentos entre pistas, una sola vez al activar una pista (intersección segmento con segmento).

## Movimiento y aspecto visual

El movimiento es lo que da la sensación Mini Metro: todo fluye de forma continua y suave.

- Remontes: funcionan como un bucle continuo. Las bolitas aparecen abajo con separación fija, suben y desaparecen al entrar en la estación superior. Su tamaño depende del tipo y llevan dentro tantos puntitos como personas transportan. Un remonte inactivo se ve en gris y sin bolitas.
- Esquiadores: puntos del color de su nivel que bajan por la curva con velocidad según la pendiente. Eligen su ruta por nivel, variedad y cola, no por el camino más corto, para que no todos hagan lo mismo.
- Colas: un racimo de puntos alrededor del nodo, con un anillo que se llena y se enrojece, como el temporizador de las estaciones de Mini Metro. Si hay demasiados puntos en pantalla, cada punto pasa a representar varios esquiadores.
- Remontes frente a pistas negras: los remontes van en línea doble (línea gruesa negra con otra fina del color del fondo encima). Se prueba en el móvil con muchas líneas a la vez, y si ensucia se añaden marcas de pilonas.
- Daltonismo: verde y rojo son la combinación más problemática, así que cada nivel llevará una señal secundaria (grosor o un símbolo de forma).
- Símbolos de nodo: círculo gris pequeño mientras no se usa; círculo de salida, triángulo de llegada o cuadrado de paso cuando un remonte arranca, llega o pasa por él. Siempre con la cota en un número pequeño.

### Legibilidad de puntos y pistas

Los puntos de un color sobre pistas de su mismo color se leen mal. En lugar de engordar los puntos (con 150 a 300 en pantalla llenaría el mapa), se separa la lectura por luminosidad:

- Los puntos llevan relleno saturado con el color pleno de su nivel y un anillo fino de contorno (blanco si el fondo es claro). Su diámetro es aproximadamente el doble del grosor de la pista.
- Las pistas se dibujan más suaves (menos saturadas o con algo de transparencia) y finas, para que el punto sea siempre lo más vivo.
- Las pistas negras en gris oscuro y no en negro puro; el anillo blanco evita que los puntos negros desaparezcan sobre ellas.
- Contorno y nivel de suavidad se deciden probando: pantalla de prueba con 3 o 4 combinaciones a tamaño real de móvil y 200 puntos moviéndose.

### Contento en pantalla

- Los puntos mantienen siempre el color de su nivel. No cambian de color según su contento (se confundiría con el nivel y no se leería con tantos puntos).
- Cuando un esquiador se va enfadado, un pequeño destello rojo y desaparece.
- Cuatro indicadores pequeños de contento, uno por color, muestran dónde falla la estación (media del contento de los esquiadores de ese nivel).
- Una barra apilada con los kilómetros de pista por color, con una marca que indique la proporción de esquiadores de cada nivel en llegadas.
- Opcional, segunda pasada: un anillo rojo fino solo en los esquiadores a un punto de irse.

Prueba temprana de densidad: 150 a 300 puntos en movimiento, antes de añadir más reglas.

### Terreno

Vista en planta estilizada (no ilustración en perspectiva), limpia, suave y relajante, como el fondo de Mini Metro.

- Altura representada con un degradado de color según la cota (valles en un tono frío y grisáceo, cumbres casi blancas) y un sombreado de relieve muy sutil. Sin curvas de nivel visibles: evitan la incoherencia visual con pistas que serpentean.
- Texturas zonificadas por altitud: valle con bosque denso, zona media con bosque más ralo, zona alta con roca y nieve por encima del límite del arbolado. La roca aparece también donde la pendiente del mapa de alturas es fuerte, con el mismo umbral que la máscara de terreno esquiable (ver "Relieve y terreno esquiable"): lo que se ve como roca es lo que no se puede esquiar.
- Contraste bajo en las texturas para que los esquiadores (puntos pequeños) y las líneas se lean bien. El bosque en un verde grisáceo y apagado, para que no compita con las pistas verdes.
- Sin agua al principio. Más adelante se decidirá si es decorativa o si condiciona el trazado de pistas.
- Ciclo de día muy lento: un tinte sobre el fondo del amanecer al atardecer. Es solo visual y sirve como unidad de puntuación (días sobrevividos); no hay cierre de jornada ni salida masiva.
- Técnica: un mapa de alturas en escala de grises (dibujado a mano o generado con ruido) del que salen las cotas de los nodos, el degradado y el sombreado. Árboles y rocas como marcas diminutas colocadas una sola vez al cargar el mapa y dibujadas todas de golpe.

## Sonido

Música generativa como en Mini Metro: cada evento dispara una nota de una escala pentatónica, de modo que todo suena a la vez sin chocar.

- Eventos que suenan: llegada de una bolita a la estación superior, activación de una pista, construcción de un remonte.
- Timbre suave (piano o marimba) y un ambiente discreto de fondo.
- El tono depende de la cota del nodo: más agudo cuanto más alto.
- Se resuelve alterando la altura de una nota base según los grados de la escala (en web, con Web Audio).

## Derrota y puntuación

- Un único medidor de quejas. Cada esquiador que se va enfadado (por contento a 0 o por anillo de cola lleno) lo llena un poco, y se vacía despacio con el tiempo. Si se llena, se pierde. Es la lógica de Mini Metro: sin parte positiva y sin reputación que suba.
- Aviso opcional por encima de cierto nivel: plaza tintada y música más apagada, sin alarmas.
- Puntuación: días sobrevividos (ciclo de día visual) y esquiadores satisfechos (los que se van cansados).
- Pantalla final: dibujo de la red con el cuello de botella resaltado.
- Condición de equilibrio inicial: con +0 por salida cansado y una queja por cada enfadado, hay que calibrar cuántas quejas por minuto vacía el medidor para que un abandono por cada cuatro satisfechos sea tolerable.

## Ejemplo de partida (ilustrativo, cifras inventadas)

- Minuto 0: 100 monedas, telesquí de la base a T1 por 60. Una verde de T1 a la base lo activa. Unos 10 de ingreso por minuto.
- Minuto 3: con unas 70 monedas se construye, desde el nodo bajo del valle B (desbloqueado gratis al activarse T1), un telesquí hasta T1 por 55. La pista de bajada, empinada, sale azul forzada con muchas curvas.
- Minuto 8: llegan los primeros rojos y se aburren en verdes y azules. Se activa una roja natural.
- Minuto 11: el anillo del telesquí de la base se llena. Hay 90 monedas: mejorar a telesilla (90) o abrir otro valle (80). Se mejora y se queda casi a cero. Quejas al 20%.
- Minuto 14: aparecen los negros y no hay pista negra. Se aburren y se van. Quejas al 45%.
- Minuto 17: el telesquí de retorno del valle B, de baja capacidad, se llena; se van enfadados; caen los ingresos y no llega para mejorarlo. Quejas al 75%.
- Minuto 20: medidor lleno. Derrota con 1,7 días sobrevividos. La cadena de decisiones razonables, no un descuido, es lo que se quiere lograr: gastar en capacidad en un sitio deja otro sin cubrir.

## Plan de desarrollo

Se construye por etapas, y cada una debe poder jugarse antes de pasar a la siguiente.

1. Prototipo mínimo: mapa fijo de 6 o 7 nodos sobre un mapa de alturas en escala de grises (de ahí salen las cotas), con un pie de pistas de 2 o 3 inicios (solo ellos activos), remontes creados arrastrando entre nodos (activan el nodo de destino y quedan en gris hasta activar una pista desde su cima), bolitas subiendo, pistas con curva y esquiadores como puntos bajando por el grafo. Fondo con degradado sencillo. Sin dinero ni niveles.
2. Proyectos de pista a trazos, selector de color libre con rango factible, cálculo de sinuosidad por bisección, regla de nodo viable, desbloqueo de nodos bajos al activarse una cima y máscara de terreno esquiable.
3. Niveles de esquiador, aguante, contento, aburrimiento por tabla, variedad y colas con anillo.
4. Entrada de esquiadores por la carretera, curva de afluencia creciente con mezcla de colores y aparición de edificios decorativos alrededor de la plaza.
5. Prueba de densidad y rendimiento con 150 a 300 puntos en movimiento y prueba de legibilidad de puntos y pistas.
6. Economía: precio por longitud y tipo, pago por color con multiplicador, mejora de remontes, medidor de quejas y derrota.
7. Simulación sin gráficos que corra miles de esquiadores con todos los parámetros en un único archivo de configuración, para calibrar antes de pulir. Los cuatro parámetros que más pesan: aguante, penalización por abandono, tarifas y curva de afluencia.
8. Indicadores en pantalla: barra de kilómetros por color e indicadores de contento por nivel.
9. Cruces con enlaces automáticos.
10. Pulido visual y sonoro: sombreado, texturas de bosque y roca, ciclo de día y música generativa.
11. Fases posteriores: varias carreteras de acceso, agua, averías o mal tiempo que dejan remontes inactivos temporalmente, boca a boca de afluencia, variante de cobro por desnivel, editor de mapas integrado en el juego (después del primer prototipo jugable), estaciones reales inspiradas y fuera de pista.

Notas técnicas:

- Pistas como curvas muestreadas en polilíneas, que sirven para mover a los esquiadores, medir la longitud y detectar cruces.
- Red como grafo dirigido; el movimiento sobre cada pista por seguimiento de camino (interpolación a lo largo de la polilínea).
- Programación con Claude Code, con este documento como contexto fijo en el repositorio.

## Decisiones tomadas

- Los nodos existen todos desde el principio y se activan al ser alcanzados por un remonte.
- Los remontes se construyen arrastrando, con precio proporcional a la longitud y al tipo; las pistas son gratuitas en dinero.
- El inicio es un pie de pistas con una plaza, varios puntos de inicio a su alrededor y una carretera de acceso por donde llegan los esquiadores. En fases posteriores puede haber varias carreteras.
- Un remonte recién construido no funciona (se ve en gris) hasta que el jugador activa una pista desde su cima. Más adelante el mismo estado inactivo se usará para averías y mal tiempo.
- Aspecto: vista en planta, limpia y suave; altura con degradado y sombreado, sin curvas de nivel; texturas de bosque y roca zonificadas por altitud; sin agua al principio.
- El juego es web.
- Abrir un valle es gratis: al activarse una cima se desbloquean los nodos bajos cercanos, y el jugador solo paga el remonte que sube desde ellos hasta una cima activa. Después se proponen las pistas de bajada, también gratuitas.
- Los mapas se hacen a mano con un formato de datos (PNG de alturas y JSON de nodos); un editor integrado llega después del primer prototipo jugable. No hay generador procedural por ahora.
- El relieve condiciona las pistas: la pendiente local define un terreno esquiable (roca o precipicio por encima del umbral), y una pista no cruza terreno más alto que su origen ni terreno no esquiable.
- Con roca, la lente de dos pistas por remonte pasa a ser "hasta dos", y un nodo solo se desbloquea si hay una pista factible hasta él.
- Dos recursos: monedas y quejas. La derrota viene del medidor de quejas, no de la quiebra ni de una reputación.
- La afluencia total es solo función del tiempo, sin depender de lo que construya el jugador. La mezcla de colores de los esquiadores es exógena.
- Los edificios (casas, hoteles) son solo decoración y no afectan a la mecánica.
- Los esquiadores tienen aguante individual medido en tiempo, y se van cansados. No hay cierre de jornada.
- Contento de 3 puntos, con aburrimiento por la tabla (solo aburren pistas dos niveles o más por debajo) y recuperación con variedad.
- El contento no cambia el color de los puntos.
- El color de las pistas es libre y recolorear no cuesta. Las pistas muy forzadas restan contento.
- Se cobra por bajada, según el color de la pista, con un multiplicador que crece solo con variedad.
- La variedad es la forma de que importe la cantidad de pistas; no se añade velocidad por densidad en el primer prototipo.
- Los puntos llevan anillo de contorno y las pistas se dibujan más suaves para leerse bien.
- Se calibra con una simulación sin gráficos antes de pulir.
- Calibrado jugando (se mantiene): bandas de color solapadas (verde 0,05–0,20, azul 0,13–0,30, roja 0,22–0,42, negra 0,35–0,60), pendiente más cercana a la recta dentro de la banda, s_max 1,55, forma de pista (abombamientos 0,1 y 0,06, onda 720 m, irregularidad 0,95, temblor 20 m).
- Límites del trazado: una pista cruzada sin unirse como mucho, unión a menos de 40 m, salidas separadas 30° y cuesta abajo con giro de hasta 60° propio de cada color, 4 llegadas por punto y la plaza como obstáculo.
- Confluencias: una pista que toca a otra se une a ella con acuerdo tangente; en el tramo común manda la dificultad mayor.
- Puntos que empiezan como círculos grises y toman su símbolo al usarse; remontes que arrancan solo en puntos de inicio o siguen una vez desde un cuadrado (como mucho un intermedio por línea). Estaciones que se desdoblan (hasta 3 por emplazamiento), línea que pasa por un intermedio, remontes que no se cruzan, cambio de base andando, deshacer y velocidad 1×/2×/4×.
- Mapas en `mapas/<nombre>/` (PNG de alturas de 8 bits y JSON); el inicial lo genera un script, no el juego.

## Descartado

Para que no se reintroduzca por error:

- Categoría de estación o estrellas, y reputación como número que sube y baja.
- Jornada fija de 3 a 6 bajadas (sustituida por aguante en tiempo) y cierre de jornada con salida masiva.
- Afluencia por color que dependa de las pistas construidas (la oferta no atrae demanda).
- Edificios que definan la mezcla de niveles de los esquiadores.
- Cambio de color de los puntos según su contento.
- Velocidad de bajada por densidad en la pista (queda como opción si hiciera falta más adelante).
- Cobro por remonte cogido, por longitud de pista, por nivel del esquiador o por tamaño de la estación.
- Precios fijados por el jugador.
- Generador procedural de mapas (por ahora).

## Decisiones abiertas

- [ ] Umbral de pendiente local a partir del cual el terreno es roca o precipicio (bastante mayor que el de una pista negra). Provisional 0,9, ajustable en `?ajustes`.
- [ ] Precio de los remontes: longitud en planta (lo más simple) o longitud real en 3D.
- [ ] Fuera de pista (idea futura): rutas libres por terreno esquiable sin pista, por ejemplo para esquiadores negros.
- [ ] Cuántos nodos bajos se desbloquean por cima (hipótesis: los 2 o 3 más cercanos y más bajos).
- [ ] Todos los parámetros marcados como hipótesis: aguante, tarifas, multiplicador de variedad, factores y capacidades de remonte, aforo y tiempo del anillo, umbral de pista muy forzada, tasa de vaciado de quejas, mezcla de colores y curva de afluencia.
- [ ] Recuerdo de variedad: dos pistas o una.
- [ ] Un azul en una verde: 0 puntos (decisión actual) o medio punto.
- [ ] Umbral de aviso del medidor de quejas, si se incluye.
- [ ] Demolición: ¿se pueden borrar remontes o pistas? Exige revalidar el grafo de nodos viables. Recomendación para la primera versión: no permitirla, o devolver el 50% al demoler un remonte sin esquiadores.
- [ ] Ingreso mínimo para suavizar la espiral de colas, solo si resulta demasiado dura.
- [ ] Boca a boca de afluencia por color (±20%), solo si el juego resulta rígido.
- [ ] Varias carreteras de acceso: ¿entran al mismo pie de pistas o dan acceso a otros?
- [ ] Averías y mal tiempo (fase posterior): qué ocurre con las colas y con los esquiadores en un remonte que pasa a inactivo.
- [ ] Agua (fase posterior): ¿decorativa u obstáculo para las pistas?
- [ ] Umbrales de pendiente por color: contrastar con valores de referencia reales.
- [ ] Contraste de las texturas del terreno y de la legibilidad de puntos y pistas: ajustar probando en el móvil.
- [ ] Orientación de pantalla.
- [ ] Esquiador sin ninguna pista de su nivel o inferior en la estación (un verde sin verdes no puede bajar por nada). Propuesta: se va enfadado al llegar (queja).
- [ ] Cuándo se va un esquiador cuyo contento llega a 0. Propuesta: al terminar la bajada, no a media pista.
- [ ] Color natural con bandas solapadas: es ambiguo. Como el grado de forzado se mide solo con s / s_min, se puede prescindir del término o definirlo como el color más difícil que admite la recta.
- [ ] Recolorear sin coste y "muy forzada" (s / s_min por encima de un umbral): pendiente de decidir por el usuario antes de implementarlo. Hasta entonces, el prototipo marca como forzada la pista cuya pendiente entra en el solape con la banda siguiente.
