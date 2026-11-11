# Diseño del juego de remontes y pistas de esquí

Actualizado: 2026-11-11

## Visión

Juego minimalista de gestión en tiempo real: el jugador construye remontes entre puntos fijos de una montaña y decide qué pistas abrir para que los esquiadores no se acumulen en las colas.

- Referencia: Mini Metro, por la conexión de puntos con líneas, la música generativa y la sensación relajante.
- Como mucho un remonte sale de cada nodo y uno llega a cada nodo. Los picos tienen dos estaciones gemelas para admitir dos remontes.
- Botón de velocidad (1×, 2× y 4×) en la esquina inferior derecha.
- Los esquiadores pueden cambiar andando entre bases contiguas.
- Los remontes no terminan en una base y de las bases no salen pistas: las bases solo se comunican por la plaza.
- Plataforma: web (TypeScript y Canvas 2D), pensada para pantalla táctil y para probarse desde el navegador del móvil. Si más adelante compensa, se porta a un motor para publicar en Android.
- Alcance del prototipo: un mapa fijo hecho a mano, sin economía ni niveles de esquiador al principio.
- Prioridad: encontrar primero algo que funcione y ajustar el resto probando.

## Elementos

El juego se compone de cuatro piezas: nodos, remontes, pistas y esquiadores.

- Nodos: puntos fijos, todos presentes en el mapa desde el inicio, cada uno con su cota. Tres tipos: base (cota baja; es un sumidero, los esquiadores terminan ahí y vuelven a la cola; las bases son los puntos de inicio agrupados alrededor de la plaza del pie de pistas), intermedio y cima. Solo están activos los nodos alcanzados por la red de remontes; los demás se ven atenuados.
- Remontes: los traza el jugador entre dos nodos, siempre de abajo hacia arriba. Se dibujan como línea doble para no confundirlos con las pistas negras. Los esquiadores suben en bolitas que desaparecen al llegar arriba, como si la estación las tragara.
- Un remonte por nodo en cada sentido: de cada nodo sale como mucho un remonte y a cada nodo llega como mucho uno. Una base tiene un solo remonte, una cima recibe uno solo y por un intermedio pasa uno solo (llega uno y sale otro). La capacidad de ese remonte, y no el número de remontes, es lo que el jugador mejora.
- Picos con dos estaciones: cada cima del mapa tiene dos triángulos gemelos muy juntos, para que a un mismo pico puedan llegar dos remontes sin romper la regla anterior. Entre gemelos no hay remontes ni pistas. Si se suelta un remonte sobre una estación que ya recibe uno, se usa su gemela.
- Estados del remonte: activo o inactivo (en gris, sin subir a nadie). Un remonte recién construido está inactivo hasta que el jugador active al menos una pista desde su cima. Este mismo estado servirá más adelante para averías y mal tiempo.
- Tipos de remonte: telesquí (bolita pequeña, 1 persona, muy frecuente), telesilla (tamaño medio, varias personas) y telecabina (la más grande, más capacidad y más velocidad). Capacidades exactas por ajustar.
- Pistas: curvas sinuosas y descendentes entre un nodo alto y uno bajo. Cuatro colores de dificultad: verde, azul, roja y negra.
- Esquiadores: puntitos del color de su nivel. Un esquiador puede usar pistas de su nivel o inferiores.

## Pie de pistas y crecimiento de la estación

El juego empieza en el pie de pistas: una plaza con varios puntos de inicio (bases) a su alrededor y una carretera de acceso por la que llegan los esquiadores.

- Inicio: los puntos de inicio rodean la plaza. Al tocar uno se iluminan los nodos que se pueden alcanzar desde él (en el boceto, las flechas rojas); no se dibujan todas a la vez. Se arrastra hasta uno de ellos y empieza la dinámica. Para el prototipo, 2 o 3 inicios.
- Entrada de esquiadores: llegan por la carretera, entran en la plaza y van al inicio que tenga remonte. Un único punto de entrada.
- Cambio de base: al terminar una bajada en una base, el esquiador puede ir andando a una base contigua si su cola compensa el paseo (la distancia de contigüidad y la penalización por andar son parámetros). Quien acaba de cambiar de base no vuelve a cambiar, para que no vaya y venga.
- Afluencia: una sola curva de esquiadores por minuto que crece con el tiempo y fija la dificultad. Es un parámetro en un único sitio para calibrarla.
- Edificios: casas y hoteles alrededor de la plaza representan visualmente la afluencia. Cuando la curva cruza un umbral aparece uno nuevo en un hueco predefinido, con una pequeña animación. Su aporte empieza unos 15 segundos después, como margen de reacción (igual que una estación nueva en Mini Metro).
- Cuando se llenan los huecos, los edificios mejoran (casa, hotel, gran hotel) en lugar de añadir más, de modo que la afluencia sigue creciendo en un espacio limitado.
- Más adelante, el tipo de edificio puede definir la mezcla de niveles: las casas aportan más verdes y azules, los hoteles de lujo más rojos y negros.
- Fase posterior: cuando la estación crezca mucho, puede haber varias carreteras de acceso, es decir, varios puntos de entrada.

## Construcción y economía

Todos los nodos existen desde el principio, pero solo se activan al ser alcanzados por un remonte. Al empezar, solo están activas las bases (los puntos de inicio del pie de pistas).

- Construir un remonte: se pulsa un nodo activo y se arrastra hasta un nodo más alto. La línea sigue al dedo y el precio se actualiza en directo. Al soltar sobre un nodo válido se construye y el nodo de destino se activa. Los nodos que no son válidos (más bajos que el origen) se atenúan durante el arrastre.
- El remonte recién construido aparece en gris y no funciona hasta que el jugador activa una pista desde su cima. El dinero ya está pagado desde el momento de construirlo.
- Precio del remonte = longitud × factor del tipo. Siempre se construye un telesquí y se mejora tocándolo (telesilla, telecabina) pagando solo la diferencia. Así la capacidad se convierte en el cuello de botella que el jugador va resolviendo.
- Las pistas son gratuitas: son proyectos que se activan al elegir color.
- Ingresos: cada bajada completada por un esquiador genera dinero (valores por ajustar).
- El dinero no puede quedar en negativo y solo frena la expansión. La derrota viene de las colas saturadas, no de la quiebra.

## Proyectos de pista

Las pistas no se generan solas: al construir un remonte aparecen proyectos de pista a trazos, y el jugador los activa tocando y eligiendo color.

Al crear un remonte de X (punto bajo) a T (punto alto) se proponen:

- Como mínimo dos pistas de T a X, una a cada lado del remonte (forma de lente, como en los bocetos).
- Pistas desde T hacia otros nodos más bajos que sean viables.
- Pistas desde otros nodos más altos hacia X.

Para evitar una maraña de trazos:

- Se limitan a los 2 o 3 candidatos más cercanos por dirección.
- Los trazos solo se muestran para la última obra o al tocar un nodo.
- Solo se proponen pistas que salgan de nodos activos.

El remonte pasa a funcionar en cuanto el jugador activa cualquier pista que salga de su cima (no tiene por qué ser una de las dos que vuelven a X). Mientras tanto se ve en gris y los proyectos a trazos de su cima siguen visibles como recordatorio.

Al tocar un proyecto aparece el selector de color. Los colores inalcanzables para ese par de nodos salen deshabilitados, y al elegir uno la curva se calcula con la sinuosidad necesaria (ver siguiente sección). Las pistas empiezan y acaban algo separadas del nodo para que se lea bien con muchas líneas alrededor.

## Pendiente, sinuosidad y color

El color de una pista sale de su pendiente real, que depende de lo que serpentee: más curvas dan más longitud y menos pendiente. Una pista de pendiente alta en línea recta puede ser una azul o verde si se traza con curvas.

```
p = ΔH / L = ΔH / (s · D)
```

Con ΔH el desnivel entre nodos, D la distancia en el mapa, L la longitud real de la pista y s = L / D la sinuosidad (s = 1 es la recta).

- Rango factible: cada par de nodos admite una sinuosidad entre s_min y s_max. El techo de pendiente es el de s_min y el suelo el de s_max (orientativo: s_max entre 1,6 y 2, por ajustar).
- En las dos pistas laterales de T a X, s_min es algo mayor que 1 (por ejemplo 1,1) para que no se solapen con la línea del remonte.
- Cada color es una banda de pendiente. Al elegir color se toma la pendiente central de la banda, se calcula L = ΔH / p y s = L / D, y el color es factible si s cae dentro del rango.
- Trazado: curva Bézier cúbica (o serpentina sinusoidal) con puntos de control desplazados lateralmente una amplitud a. Se muestrea como polilínea, se mide su longitud y se ajusta a por bisección hasta alcanzar L. Una semilla fija por pareja de nodos mantiene la forma estable.
- Se descartan pares cuya pendiente en recta ya esté por debajo del mínimo de verde: una pista demasiado plana no se puede corregir.
- La velocidad de los esquiadores depende de la pendiente efectiva, así que una pista negra se ve más rápida que una verde.

Los umbrales de pendiente de cada color son parámetros ajustables. Pendiente: contrastarlos con valores de referencia de estaciones reales.

## Sin puntos ciegos

Ningún esquiador puede quedar atrapado en un nodo sin salida. La garantía sale de dos definiciones y tres reglas.

- Un nodo está activo si ha sido alcanzado por un remonte (o es una base). Desde un nodo activo se pueden construir remontes.
- Un nodo es viable como destino de una pista si es una base o tiene alguna salida operativa: una pista activa que salga de él o un remonte en servicio que salga de él.

1. Los remontes solo salen de nodos activos.
2. Un remonte solo funciona cuando hay al menos una pista activa desde su cima. Así nadie llega a una cima por remonte sin tener bajada.
3. Solo se proponen pistas que terminen en un nodo viable. Un nodo activo cuya cima aún no tiene salida operativa no recibe pistas hasta que la tenga.

La garantía vale mientras no se puedan demoler remontes o pistas; si se permite, habrá que revalidar el grafo al borrar. Lo mismo para las averías futuras: la viabilidad de un nodo se vuelve a evaluar cuando un remonte cambia de estado.

## Cruces de pistas

El jugador solo activa proyectos de pista y elige color; no gestiona los cruces. En el prototipo los cruces son solo visuales, como un puente: cada esquiador sigue su pista.

En una segunda fase pueden convertirse en enlaces automáticos (atajos) cuando sean compatibles:

- Cada dirección se evalúa por separado. Pasar de la pista A a la B en el cruce solo es válido si el nodo de destino de B está más bajo que la altura de A en ese punto.
- La altura a lo largo de una pista se interpola linealmente con la longitud recorrida s:

```
h(s) = h_T - (h_T - h_N) · s / L
```

- Con esa regla nunca se sube, no hay bucles y no aparecen callejones sin salida.
- Se respeta el nivel: un esquiador azul no puede pasar a una pista roja.
- Cada enlace se marca con un punto pequeño para que el jugador lo lea.

Detección: las pistas son polilíneas muestreadas, y los cruces se calculan comparando segmentos entre pistas, una sola vez al activar una pista (intersección segmento-segmento, implementada en la lógica pura).

## Movimiento y aspecto visual

El movimiento es lo que da la sensación Mini Metro: todo fluye de forma continua y suave.

- Remontes: funcionan como un bucle continuo. Las bolitas aparecen abajo con separación fija, suben y desaparecen al entrar en la estación superior. Su tamaño depende del tipo y llevan dentro tantos puntitos como personas transportan. Un remonte inactivo se ve en gris y sin bolitas.
- Esquiadores: puntos del color de su nivel que bajan por la curva con velocidad según la pendiente. Eligen su ruta por nivel y por cola, no por el camino más corto, para que no todos hagan lo mismo.
- Colas: un racimo de puntos alrededor del nodo, con un anillo que se llena y se enrojece, como el temporizador de las estaciones de Mini Metro. Si hay demasiados puntos en pantalla, cada punto pasa a representar varios esquiadores.
- Aburrimiento (propuesta): el puntito pierde color y se vuelve gris si baja pistas inferiores a su nivel, y se recupera con una de su nivel. Si se vuelve muy gris, se va y no genera ingresos.
- Remontes frente a pistas negras: los remontes van en línea doble (línea gruesa negra con otra fina del color del fondo encima). Se prueba en el móvil con muchas líneas a la vez, y si ensucia se añaden marcas de pilonas.
- Daltonismo: verde y rojo son la combinación más problemática, así que cada nivel llevará una señal secundaria (grosor o un símbolo de forma).
- Símbolos de nodo: círculo para base, triángulo para cima y una forma intermedia para los intermedios, con la cota en un número pequeño.

Prueba temprana de densidad: 150 a 300 puntos en movimiento, antes de añadir más reglas.

### Terreno

Vista en planta estilizada (no ilustración en perspectiva), limpia, suave y relajante, como el fondo de Mini Metro.

- Altura representada con un degradado de color según la cota (valles en un tono frío y grisáceo, cumbres casi blancas) y un sombreado de relieve muy sutil. Sin curvas de nivel visibles: evitan la incoherencia visual con pistas que serpentean.
- Texturas zonificadas por altitud: valle con bosque denso, zona media con bosque más ralo, zona alta con roca y nieve por encima del límite del arbolado. La roca aparece también donde la pendiente del mapa de alturas es fuerte.
- Contraste bajo en las texturas para que los esquiadores (puntos pequeños) y las líneas se lean bien. El bosque en un verde grisáceo y apagado, para que no compita con las pistas verdes.
- Sin agua al principio. Más adelante se decidirá si es decorativa o si condiciona el trazado de pistas.
- Ciclo de día muy lento: un tinte sobre el fondo del amanecer al atardecer.
- Técnica: un mapa de alturas en escala de grises (dibujado a mano o generado con ruido) del que salen las cotas de los nodos, el degradado y el sombreado. El fondo se precalcula una sola vez en un canvas fuera de pantalla. Árboles y rocas como marcas diminutas colocadas una sola vez al cargar el mapa y dibujadas todas de golpe.

## Sonido

Música generativa como en Mini Metro: cada evento dispara una nota de una escala pentatónica, de modo que todo suena a la vez sin chocar.

- Eventos que suenan: llegada de una bolita a la estación superior, activación de una pista, construcción de un remonte.
- Timbre suave (piano o marimba) y un ambiente discreto de fondo.
- El tono depende de la cota del nodo: más agudo cuanto más alto.
- En web se resuelve con Web Audio: muestras o osciladores con la frecuencia tomada de los grados de la escala. El audio en el navegador móvil solo se activa tras un primer toque del usuario.

## Plan de desarrollo

Se construye por etapas, y cada una debe poder jugarse antes de pasar a la siguiente.

1. Prototipo mínimo: mapa fijo de 6 o 7 nodos sobre un mapa de alturas en escala de grises (de ahí salen las cotas), con un pie de pistas de 2 o 3 inicios (solo ellos activos), remontes creados arrastrando entre nodos (activan el nodo de destino y quedan en gris hasta activar una pista desde su cima), bolitas subiendo, pistas con curva y esquiadores como puntos bajando por el grafo. Fondo con degradado sencillo. Sin dinero ni niveles.
   - Provisional de la etapa 1 (hasta que lleguen los proyectos de la etapa 2): las pistas se abren con el mismo gesto que los remontes, arrastrando desde un nodo activo hacia uno más bajo, con un color neutro y una curva de amplitud fija. Ya se aplica la regla de nodo viable, porque sin ella los esquiadores podían quedar atrapados.
2. Proyectos de pista a trazos, selector de color con rango factible, cálculo de sinuosidad por bisección y regla de nodo viable.
3. Niveles de esquiador, colores, aburrimiento y colas con anillo.
4. Entrada de esquiadores por la carretera, curva de afluencia creciente y aparición de edificios alrededor de la plaza.
5. Prueba de densidad y rendimiento con 150 a 300 puntos en movimiento.
6. Economía: precio por longitud y tipo, ingresos por bajada completada, mejora de remontes y condición de derrota por colas saturadas.
7. Cruces con enlaces automáticos.
8. Pulido visual y sonoro: sombreado, texturas de bosque y roca, ciclo de día y música generativa.
9. Fases posteriores: varias carreteras de acceso, agua y averías o mal tiempo que dejan remontes inactivos temporalmente.

Notas técnicas:

- Pistas como curvas muestreadas en polilíneas, que sirven para mover a los esquiadores (recorriendo la polilínea por longitud acumulada), medir la longitud y detectar cruces.
- Red como grafo dirigido, en lógica pura sin dependencia del navegador.
- Entrada con pointer events para que valga igual con dedo y ratón.
- Programación con Claude Code, con este documento como contexto fijo en el repositorio. Este archivo es la fuente de verdad del diseño.

## Decisiones tomadas

- Los nodos existen todos desde el principio y se activan al ser alcanzados por un remonte.
- Los remontes se construyen arrastrando, con precio proporcional a la longitud y al tipo; las pistas son gratuitas.
- Los ingresos vienen de cada bajada completada.
- La derrota viene de las colas, no de la quiebra.
- El inicio es un pie de pistas con una plaza, varios puntos de inicio a su alrededor y una carretera de acceso por donde llegan los esquiadores.
- Los edificios alrededor de la plaza aparecen conforme crece la afluencia, que sube con el tiempo; cuando se llenan los huecos, mejoran de categoría.
- En fases posteriores puede haber varias carreteras de acceso.
- Un remonte recién construido no funciona (se ve en gris) hasta que el jugador activa una pista desde su cima. Más adelante el mismo estado inactivo se usará para averías y mal tiempo.
- Aspecto: vista en planta, limpia y suave; altura con degradado y sombreado, sin curvas de nivel; texturas de bosque y roca zonificadas por altitud; sin agua al principio.
- Como mucho un remonte sale de cada nodo y uno llega a cada nodo. Los picos tienen dos estaciones gemelas para admitir dos remontes.
- Botón de velocidad (1×, 2× y 4×) en la esquina inferior derecha.
- Los esquiadores pueden cambiar andando entre bases contiguas.
- Los remontes no terminan en una base y de las bases no salen pistas: las bases solo se comunican por la plaza.
- Plataforma: web (TypeScript y Canvas 2D), para iterar rápido y probar desde el móvil. Portar a un motor solo si más adelante compensa.

## Decisiones abiertas

- [ ] Parámetros de la curva de afluencia y umbrales de aparición de edificios.
- [ ] Varias carreteras de acceso: ¿entran al mismo pie de pistas o dan acceso a otros?
- [ ] Averías y mal tiempo (fase posterior): qué ocurre con las colas y con los esquiadores en un remonte que pasa a inactivo.
- [ ] Agua (fase posterior): ¿decorativa u obstáculo para las pistas?
- [ ] Valores económicos: precio por unidad de longitud y por tipo, ingreso por bajada, coste de las mejoras.
- [ ] Umbral de saturación de cola para la derrota.
- [ ] Demolición: ¿se pueden borrar remontes o pistas? Exige revalidar el grafo de nodos viables.
- [ ] Umbrales de pendiente por color: contrastar con valores de referencia reales.
- [ ] Capacidades y velocidades de cada tipo de remonte.
- [ ] Contraste de las texturas del terreno: ajustar probando en el móvil.
- [ ] Orientación de pantalla (vertical u horizontal) y cómo se publicará en Android si el juego lo merece.
