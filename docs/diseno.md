# Notas técnicas y estado del desarrollo

> La especificación de diseño que manda es `docs/diseno-juego-remontes.md` (desde el 2026-11-12). Este documento queda como notas técnicas de lo implementado (cómo funciona por dentro lo ya hecho) y, al final, el estado del desarrollo. Si algo de aquí discrepa de la especificación, manda la especificación: en particular, el plan por etapas, la «Ampliación del dominio esquiable» (sustituida por «Abrir un valle»), la diversión (sustituida por aguante y contento) y los edificios (solo decoración) de este documento ya no valen.

Actualizado: 2026-11-12

El estado actual del desarrollo (qué está hecho, qué falta y qué está pendiente de decidir) está al final, en «Estado del desarrollo».

## Visión

Juego minimalista de gestión en tiempo real: el jugador construye remontes entre puntos fijos de una montaña y decide qué pistas abrir para que los esquiadores no se acumulen en las colas.

- Referencia: Mini Metro, por la conexión de puntos con líneas, la música generativa y la sensación relajante.
- Plataforma: web (TypeScript y Canvas 2D), pensada para pantalla táctil y para probarse desde el navegador del móvil. Si más adelante compensa, se porta a un motor para publicar en Android.
- Alcance del prototipo: un mapa fijo hecho a mano, sin economía ni niveles de esquiador al principio.
- Prioridad: encontrar primero algo que funcione y ajustar el resto probando.

## Elementos

El juego se compone de cuatro piezas: nodos, remontes, pistas y esquiadores.

- Nodos: puntos fijos, todos presentes en el mapa desde el inicio, cada uno con su cota. Tres tipos: base (cota baja; es un sumidero, los esquiadores terminan ahí y vuelven a la cola; las bases son los puntos de inicio agrupados alrededor de la plaza del pie de pistas), intermedio y cima. Solo están activos los nodos alcanzados por la red de remontes; los demás se ven atenuados.
- Remontes: los traza el jugador entre dos nodos, siempre de abajo hacia arriba. Se dibujan como línea doble para no confundirlos con las pistas negras. Los esquiadores suben en bolitas que desaparecen al llegar arriba, como si la estación las tragara.
- Estaciones y desdoble: cada emplazamiento (base, intermedio o cima) es un solo nodo para los esquiadores, pero los remontes empiezan y acaban en estaciones. Desde v24 ninguno tiene estación al principio (círculo gris pequeño): la primera se crea en el centro del punto al usarlo: círculo si arranca un remonte, triángulo si llega a una cima o si el remonte sigue de un cuadrado, y cuadrado si llega a un intermedio desde una base (punto de paso: llega uno y sale otro). Si se construye otro remonte desde o hacia un emplazamiento con su estación ocupada, se desdobla: aparece una estación nueva pegada a las demás (a pocos píxeles), por el lado del que viene la nueva línea. Los desdobles son siempre de salida (círculo) o de llegada (triángulo), nunca de paso. Como mucho 3 estaciones por emplazamiento (parámetro).
- Los remontes no pueden cruzarse entre sí (en planta). Sí pueden compartir emplazamiento. Remontes y pistas sí pueden cruzarse (cruce solo visual). Los cruces entre pistas están limitados (ver «Proyectos de pista»).
- Los remontes no terminan en una base y de las bases no salen pistas: las bases solo se comunican por la plaza.
- Línea que pasa por un intermedio: un remonte que llega al cuadrado de un intermedio y otro que sale de ese mismo cuadrado forman una sola línea. Basta una pista desde la llegada de arriba para que funcionen los dos tramos. No se aplica a los desdobles (un triángulo o un círculo nuevo del intermedio): esos tramos empiezan o acaban allí.
- Las pistas salen del emplazamiento, no de una estación: quien llega por cualquiera de los triángulos de un pico puede bajar por cualquier pista de ese pico, y un remonte entra en servicio con cualquier pista que salga de su emplazamiento de llegada.
- Aun así, en un punto desdoblado cada pista se dibuja saliendo (y llegando) por una estación, para que no salgan todas por la central. Las dos laterales de un remonte salen de la estación donde llega ese remonte y llegan a la estación de donde sale; el resto usan la estación del lado hacia el que van (o del que vienen), proyectando su dirección sobre la fila de estaciones. Es solo dibujo: el primer y el último tramo de la pista (unos 120 m) se desplazan suavemente desde el centro del punto hasta su estación, y los esquiadores se dibujan sobre esa misma curva. Las laterales se desplazan a lo largo de toda la pista, igual que su remonte (que se dibuja de estación a estación), para que la lente lo siga envolviendo. El grafo, los colores y las confluencias no cambian, y si el punto se desdobla después, la pista pasa a la estación que le toque. En el tramo compartido de una confluencia, la pista que se une usa el desplazamiento de la pista a la que se une, y en los acuerdos de entrada y salida pasa suavemente del suyo al de la otra: así sus esquiadores van sobre la línea que se ve y la línea no salta.
- Estados del remonte: activo o inactivo (en gris, sin subir a nadie). Un remonte recién construido está inactivo hasta que el jugador active al menos una pista desde su cima. Este mismo estado servirá más adelante para averías y mal tiempo.
- Tipos de remonte: telesquí (bolita pequeña, 1 persona, muy frecuente), telesilla (tamaño medio, varias personas) y telecabina (la más grande, más capacidad y más velocidad). Capacidades exactas por ajustar.
- Pistas: curvas sinuosas y descendentes entre un nodo alto y uno bajo. Cuatro colores de dificultad: verde, azul, roja y negra.
- Esquiadores: puntitos del color de su nivel. Un esquiador puede usar pistas cuya dificultad efectiva no pase de su nivel (una pista unida a otra más difícil cuenta con la dificultad mayor: el tramo común manda) y solo sube por remontes cuya llegada tenga bajada para él. Si no hay ninguna bajada de su nivel en toda la estación, no viene: es un cliente potencial que se pierde y la afluencia crece menos (decidido; no cuenta en «Se han ido»).

## Pie de pistas y crecimiento de la estación

El juego empieza en el pie de pistas: una plaza con varios puntos de inicio (bases) a su alrededor y una carretera de acceso por la que llegan los esquiadores.

- Inicio: los puntos de inicio rodean la plaza. Al tocar uno se iluminan los nodos que se pueden alcanzar desde él (en el boceto, las flechas rojas); no se dibujan todas a la vez. Se arrastra hasta uno de ellos y empieza la dinámica. Para el prototipo, 2 o 3 inicios.
- Entrada de esquiadores: llegan por la carretera, entran en la plaza y van al inicio que tenga remonte. Un único punto de entrada.
- Cambio de base: al terminar una bajada en una base, el esquiador puede ir andando a una base contigua si su cola compensa el paseo (la distancia de contigüidad y la penalización por andar son parámetros). Quien acaba de cambiar de base no vuelve a cambiar, para que no vaya y venga.
- Afluencia: una sola curva de esquiadores por minuto que crece con el tiempo y fija la dificultad. Es un parámetro en un único sitio para calibrarla.
- Edificios: casas y hoteles alrededor de la plaza representan visualmente la afluencia. Cuando la curva cruza un umbral aparece uno nuevo en un hueco predefinido, con una pequeña animación. Su aporte empieza unos 15 segundos después, como margen de reacción (igual que una estación nueva en Mini Metro).
- Cuando se llenan los huecos, los edificios mejoran (casa, hotel, gran hotel) en lugar de añadir más, de modo que la afluencia sigue creciendo en un espacio limitado.
- Más adelante, el tipo de edificio puede definir la mezcla de niveles: las casas aportan más verdes y azules, los hoteles de lujo más rojos y negros.
- Fase posterior: cuando la estación crezca mucho, puede haber varias carreteras de acceso, es decir, varios puntos de entrada. (Se adelanta en parte con la ampliación del dominio, siguiente sección.)

## Ampliación del dominio esquiable

Idea del usuario: la estación crece en extensión, no solo en afluencia. Al llegar con los remontes a una zona alta aparecen bases nuevas, desde las que se puede seguir construyendo. Es lo que hace crecer la estación a lo largo de la partida. Lo que sigue es una propuesta concreta, con sus decisiones abiertas al final.

- El mapa es mayor que lo que se ve al empezar. Se divide en zonas: la inicial, alrededor del pie de pistas, y otras ocultas o atenuadas más allá (otra ladera, un valle vecino, una meseta alta).
- Desbloqueo: ciertos puntos son puertas (un collado o una cima en el límite de la zona). Cuando un remonte llega a una puerta, se revela la zona siguiente: sus puntos, y en ella una base nueva.
- La base nueva es un pie de pistas secundario: un pueblo en el otro valle o una urbanización a media ladera. Tiene su plaza y su entrada de esquiadores, es sumidero de las bajadas como cualquier base y desde ella se construyen remontes.
- La cámara se aleja suavemente para que quepa la estación ampliada, como el mapa de Mini Metro al crecer. En el móvil, los símbolos y los esquiadores mantienen su tamaño en pantalla aunque el mapa se aleje.
- Una zona nueva da al jugador espacio para repartir la afluencia, que sigue creciendo, cuando la zona inicial se satura.

Choques con decisiones ya tomadas, a resolver al empezar la etapa:

- «Los nodos existen todos desde el principio»: pasa a ser cierto solo dentro de cada zona. Los de las zonas ocultas existen en los datos del mapa, pero no se ven ni se pueden usar hasta que se revela su zona.
- Base «de cota baja» y «de las bases no salen pistas»: una base a media ladera es alta y podría tener pistas que bajan al valle. Hay que decidir si una base alta es solo entrada y sumidero, como las de abajo, o también un punto del que salen pistas.

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

- Se limitan a los 2 o 3 candidatos más cercanos por dirección (2 en el prototipo).
- No se propone una pista que cruce sin unirse a ellas más de N pistas (N = 1). Los encuentros que acaban en confluencia no cuentan, porque no ensucian.
- Remontes y pistas sí pueden cruzarse, en los dos sentidos: una pista nueva puede pasar por debajo de un remonte y un remonte nuevo puede pasar por encima de pistas. Es un cruce solo visual, como un puente: los esquiadores de la pista y los del remonte no se afectan, y el grafo, la viabilidad y las confluencias no cambian. Prohibirlo quitaba mucha flexibilidad al construir. (La primera pista de una pareja sigue eligiendo, como preferencia, el lado que corta menos remontes.)
- Salidas de un punto por ángulo, sin tope de número: cada pista nueva tiene que salir con una dirección (la de sus primeros 200 m) separada al menos un ángulo mínimo (calibrado con el panel: 30°) de cada pista que ya sale de ese punto, y siempre cuesta abajo según el terreno (o, como mucho, en horizontal: se toleran 10 m de subida). En una ladera plana caben así hasta 7 salidas, de una horizontal a la otra. Las dos laterales de un mismo remonte no cuentan entre sí. Llegando a un punto, como mucho 4 pistas.
- Cada color tiene su propio giro de salida: su sinuosidad y su serpentina hacen que sus primeros 200 m apunten a sitios distintos, así que el selector busca para cada color el menor giro (sin girar o en pasos de 10° hasta el máximo) con el que su trazado es limpio. Antes (hasta v21) el giro era común y se paraba en el primero que valía para algún color, y a veces solo quedaba uno, forzado.
- Salida orientada: si la salida de una pista no cabe entre las que ya hay, puede salir girada hacia su lado (en pasos de 10°, hasta un giro máximo provisional de 60°) y volver enseguida a su eje: un gancho solo al principio, lado · tan(giro) · D · t · (1 − t)³, que apenas la alarga. Se elige el menor giro con el que la pista queda limpia, y para una pista que no es lateral se prueba también el otro lado. Así una pista puede salir por un hueco libre (por ejemplo, hacia el sureste) y luego bajar a su destino. El giro se guarda en la pista y se respeta al recalcular. Un abombamiento mayor no servía para esto: curva toda la pista, gira poco la salida y la alarga hasta salirse del rango de sinuosidad.
- Los cruces se comprueban con la pista real de cada color (con su sinuosidad y su confluencia), no con el trazado de sinuosidad mínima: en el selector se apagan los colores cuya pista entraría en la plaza, iría casi pegada a otra pista, cruzaría demasiadas o saldría poco separada de las demás. Un proyecto se propone si al menos un color da una pista limpia, y el trazo discontinuo muestra la pista real del color limpio que menos serpentea.
- Distancia mínima entre pistas: si el trazado previsto se acerca a otra pista a menos de una distancia (calibrado con el panel: 40 m), cuenta como encuentro y se une a ella (confluencia). Si no puede unirse (por ejemplo, porque el tramo compartido sería demasiado corto), no se propone. Así no quedan pistas paralelas casi pegadas.
- La plaza del pie de pistas es un obstáculo: no se propone ningún proyecto cuyo trazado previsto (tramo propio, compartido y ramal) entre en el círculo de la plaza más un margen (provisional 30 m, calibrable con el panel de ajustes). Las bases están en el borde, fuera de ese círculo, así que las llegadas a ellas no se ven afectadas. Con 30 m solo se pierde una lateral hacia la base de 1558 m; ninguna base se queda sin bajadas. Ojo: la base de 1618 m está a 230 m del centro de la plaza (radio 170 m), así que con un margen de más de unos 59 m queda dentro de la zona prohibida y se queda sin ninguna bajada posible.
- Los trazos solo se muestran para la última obra o al tocar un nodo (tocar sin arrastrar). Tocar el vacío los oculta.
- Solo se proponen pistas que salgan de nodos activos.

El remonte pasa a funcionar en cuanto el jugador activa cualquier pista que salga de su cima (no tiene por qué ser una de las dos que vuelven a X). Mientras tanto se ve en gris y los proyectos a trazos de su cima siguen visibles como recordatorio.

Al tocar un proyecto aparece el selector de color. Los colores inalcanzables para ese par de nodos salen deshabilitados, y al elegir uno la curva se calcula con la sinuosidad necesaria (ver siguiente sección). Las pistas empiezan y acaban algo separadas del nodo para que se lea bien con muchas líneas alrededor.

## Pendiente, sinuosidad y color

El color de una pista sale de su pendiente real, que depende de lo que serpentee: más curvas dan más longitud y menos pendiente. Una pista de pendiente alta en línea recta puede ser una azul o verde si se traza con curvas.

```
p = ΔH / L = ΔH / (s · D)
```

Con ΔH el desnivel entre nodos, D la distancia en el mapa, L la longitud real de la pista y s = L / D la sinuosidad (s = 1 es la recta).

- Rango factible: cada par de nodos admite una sinuosidad entre s_min y s_max. El techo de pendiente es el de s_min y el suelo el de s_max (calibrado con el panel de ajustes: s_max = 1,55).
- Efecto del temblor en los colores posibles del mapa actual: hasta 30 m no desaparece ninguno; con 40 a 50 m se pierde la única verde (entre los dos intermedios); con 80 m se pierden además dos negras y una roja.
- Consecuencia: el rango de sinuosidad es estrecho, así que una pareja abarca pocos colores contiguos. Con las bandas solapadas y la pendiente objetivo «cercana», en el mapa actual casi todas las parejas admiten tres colores, y hay verdes hacia o desde el intermedio de 1904 m y entre los dos intermedios.
- En las dos pistas laterales de T a X, s_min es algo mayor que 1 para que no se solapen con la línea del remonte.
- Cada color es una banda de pendiente, y las bandas se solapan: con la misma pendiente, una pista más ancha es más fácil, así que el color no depende solo de la pendiente sino también del grosor (anchura) de la pista. Una pendiente que cae en el solape de dos bandas puede ser de cualquiera de los dos colores; la de color más fácil se entiende más ancha. Provisional: verde 0,05–0,20, azul 0,13–0,30, roja 0,22–0,42, negra 0,35–0,60 (calibrables con el panel de ajustes).
- Grosor: todas las pistas se dibujan con el mismo grosor (decidido). La anchura que justifica el solape se traduce en diversión: una pista forzada (su pendiente entra en la banda del color siguiente, por ejemplo una verde más empinada que el mínimo de la azul) es de su color, pero divierte menos a los esquiadores de ese nivel. En el selector, un color forzado lleva un borde rojo suave. Para que salgan forzadas solo cuando no hay otra opción, cada color busca primero su parte limpia de la banda (ver el punto siguiente).
- Al elegir color se toma la pendiente de la banda más cercana a la de la recta, que es la que menos sinuosidad necesita (decidido con el panel de ajustes; la alternativa era la pendiente central de la banda). Se busca primero en la parte limpia de la banda, por debajo del mínimo del color siguiente (verde hasta 0,13, azul hasta 0,22, roja hasta 0,35); solo si ahí no cabe con s_max se usa el solape y la pista sale forzada. Se calcula L = ΔH / p y s = L / D, y el color es factible si s cae dentro del rango.
- Resultado (corregido en v21, antes solo la negra salía limpia en las laderas empinadas): con s_max 1,55 la gama posible de pendientes [p_recta / 1,55, p_recta] contiene casi siempre uno de los límites 0,13 / 0,22 / 0,35 (están a razón 1,59 o más), así que casi toda pareja ofrece dos colores limpios contiguos y, a menudo, un tercero forzado. La parte limpia del color más fácil pide más sinuosidad: es la pista más larga y serpenteante.
- Trazado: la recta entre nodos más un desplazamiento lateral desp(t) = lado · sen(πt) · (b · D + a · (1 − cos 2πnt)). El primer término es un abombamiento en C (b = 0,1 en las dos laterales de un remonte y 0,06 en el resto) y el segundo una serpentina de n ondas (una cada 720 m de distancia) y amplitud a, con amplitud y longitud de onda algo variables a lo largo de la pista (irregularidad 0,95), para que no parezca una sinusoide perfecta. La amplitud nunca baja de un mínimo, el temblor (provisional 20 m), para que las pistas más directas (s ≈ 1) no queden como una curva lisa; la sinuosidad mínima de una pareja ya lo incluye y la bisección busca a partir de él. Valores calibrados con el panel de ajustes. Ese desplazamiento siempre va hacia el mismo lado y es nulo en los extremos, así que una pista lateral nunca corta su remonte. Se muestrea como polilínea, se mide su longitud y se ajusta a por bisección hasta alcanzar L. La forma solo depende de la pareja y del lado, así que es estable.
- El lado de la primera pista de una pareja es el que menos remontes corta (a igualdad, por semilla); la segunda va al lado contrario.
- Se descartan pares cuya pendiente en recta ya esté por debajo del mínimo de verde: una pista demasiado plana no se puede corregir.
- La velocidad de los esquiadores depende de la pendiente efectiva, así que una pista negra se ve más rápida que una verde.

Los umbrales de pendiente de cada color son parámetros ajustables. Pendiente: contrastarlos con valores de referencia de estaciones reales.

## Sin puntos ciegos

Ningún esquiador puede quedar atrapado en un nodo sin salida. La garantía sale de dos definiciones y tres reglas.

- Un nodo está activo si ha sido alcanzado por un remonte (o es una base). Desde un nodo activo se pueden construir remontes.
- Un nodo es viable como destino de una pista si desde él se puede llegar a una base siguiendo pistas y remontes en servicio. Basta con que sea una base. (Antes bastaba con tener alguna salida operativa, pero eso permitía bucles cerrados, por ejemplo intermedio → cima por remonte y cima → intermedio por pista, de los que no se vuelve nunca a una base.) Al evaluar una pista se cuenta como ya abierta, porque puede poner en servicio el remonte que llega a su origen.

1. Los remontes solo salen de nodos activos.
2. Un remonte solo funciona cuando hay al menos una pista activa desde su cima, o cuando continúa por un punto de paso en otro remonte que funciona. Así nadie llega a una cima por remonte sin tener bajada. Un remonte que llega a un emplazamiento que ya tiene pistas funciona desde que se construye.
3. Solo se proponen pistas que terminen en un nodo viable. Un nodo activo desde el que aún no se llega a una base no recibe pistas hasta que se pueda.

Deshacer: un botón deshace la última construcción (remonte o pista), y pulsándolo varias veces se van deshaciendo en orden inverso. Como se deshace siempre lo último, la red vuelve exactamente a un estado anterior, que ya cumplía estas reglas, y no hace falta revalidar el grafo. Quien estaba en la cola o subiendo en un remonte deshecho se va de la estación; quien bajaba por una pista deshecha llega directamente a su destino. Si un remonte deja de funcionar, su cola busca otra salida, y quien llega a un punto sin salida se va. Demoler un elemento cualquiera, no el último, sí exigiría revalidar el grafo. Lo mismo para las averías futuras: la viabilidad de un nodo se vuelve a evaluar cuando un remonte cambia de estado.

## Cruces de pistas

El jugador solo activa proyectos de pista y elige color; no gestiona los cruces.

Confluencias (adelantado a petición del usuario, antes de la etapa 8): si el trazado de una pista nueva se encuentra con una pista existente, se une a ella y comparten el tramo, como en las estaciones de verdad. Si no van al mismo destino, la nueva sigue a la existente hasta el punto más cercano a su destino (siempre por encima de la cota de ese destino) y ahí sale un ramal. La unión y la salida del ramal no son en ángulo: un acuerdo curvo (Bézier, de unos 150 m) hace que la pista nueva emboque tangente a la existente y que el ramal salga tangente a ella. Si el tramo compartido fuera muy corto (por debajo de un mínimo), no se unen y se cruzan sin más. No se buscan encuentros en el tramo inicial, porque las pistas que salen del mismo nodo empiezan juntas. En el grafo no cambia nada: la pista sigue yendo de su origen a su destino, y solo cambia su geometría. Los proyectos a trazos ya muestran la confluencia que tendrán.

- Consecuencia: la longitud real de una pista unida a otra no es la que pedía su color, así que su pendiente media (y su velocidad) se recalcula con el trazado final y puede salirse algo de la banda del color elegido. El color se mantiene como etiqueta.
- La primera pista de una pareja va por el lado en que su curva corta menos remontes, para que no los cruce sin necesidad.

Los cruces que quedan (pistas que se cortan sin unirse) son solo visuales, como un puente: cada esquiador sigue su pista.

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
- Colas: un racimo de puntos alrededor de la estación de salida de cada remonte, con un anillo que se llena con la cola (provisional: lleno con 15 esquiadores) y pasa del gris al rojo, como el temporizador de las estaciones de Mini Metro. Si hay demasiados puntos en pantalla, cada punto pasará a representar varios esquiadores (etapa 6).
- Diversión (hecha en la etapa 3): cada esquiador tiene una diversión de 0 a 1 y se dibuja del color de su nivel, más gris cuanto menos se divierte. Al bajar por una pista de su nivel sube (0,2; solo 0,05 si es forzada); por una más fácil baja 0,15 por cada nivel de diferencia. Al llegar a una base con menos de 0,25, se va y no genera ingresos. Valores provisionales.
- Remontes frente a pistas negras: los remontes van en línea doble (línea gruesa negra con otra fina del color del fondo encima). Se prueba en el móvil con muchas líneas a la vez, y si ensucia se añaden marcas de pilonas.
- Daltonismo: verde y rojo son la combinación más problemática, así que cada nivel llevará una señal secundaria (grosor o un símbolo de forma). El grosor encaja con las bandas solapadas: un color más fácil es una pista más ancha.
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

1. (Hecha.) Prototipo mínimo: mapa fijo de 6 o 7 nodos sobre un mapa de alturas en escala de grises (de ahí salen las cotas), con un pie de pistas de 2 o 3 inicios (solo ellos activos), remontes creados arrastrando entre nodos (activan el nodo de destino y quedan en gris hasta activar una pista desde su cima), bolitas subiendo, pistas con curva y esquiadores como puntos bajando por el grafo. Fondo con degradado sencillo. Sin dinero ni niveles.
2. (Hecha, con añadidos: ver «Estado del desarrollo».) Proyectos de pista a trazos, selector de color con rango factible, cálculo de sinuosidad por bisección y regla de nodo viable.
3. (Hecha.) Niveles de esquiador, colores, aburrimiento (diversión) y colas con anillo.
4. Entrada de esquiadores por la carretera, curva de afluencia creciente y aparición de edificios alrededor de la plaza.
5. Ampliación del dominio: mapa por zonas, puntos puerta que al alcanzarse revelan una zona nueva con su base (pie de pistas secundario, con su entrada de esquiadores), y cámara que se aleja al crecer (ver «Ampliación del dominio esquiable»).
6. Prueba de densidad y rendimiento con 150 a 300 puntos en movimiento, ya con el mapa ampliado.
7. Economía: precio por longitud y tipo, ingresos por bajada completada, mejora de remontes y condición de derrota por colas saturadas.
8. Cruces con enlaces automáticos. (Las confluencias, que unen una pista nueva a la existente que toca, ya están hechas; queda el enlace en los cruces que no se unen.)
9. Pulido visual y sonoro: sombreado, texturas de bosque y roca, ciclo de día y música generativa.
10. Fases posteriores: más carreteras de acceso además de las de las zonas nuevas, agua y averías o mal tiempo que dejan remontes inactivos temporalmente.

Notas técnicas:

- Pistas como curvas muestreadas en polilíneas, que sirven para mover a los esquiadores (recorriendo la polilínea por longitud acumulada), medir la longitud y detectar cruces.
- Red como grafo dirigido, en lógica pura sin dependencia del navegador.
- Entrada con pointer events para que valga igual con dedo y ratón.
- Programación con Claude Code, con este documento como contexto fijo en el repositorio. Este archivo es la fuente de verdad del diseño.

## Herramienta temporal de calibración

No forma parte del diseño del juego. Con `?ajustes` en la dirección (por ejemplo `https://dievels-pixel.github.io/remontes/?ajustes`) aparece un panel plegable para ajustar a ojo la forma de las pistas:

- Deslizadores para la longitud de onda, la sinuosidad máxima, los abombamientos lateral y normal y la irregularidad, y un selector para la pendiente objetivo del color.
- Al mover un control se recalculan en el momento todas las pistas abiertas (en su orden de apertura, con sus confluencias) y los trazos de los proyectos. Si el color de una pista deja de caber, se dibuja a trazos cortos en vez de borrarse.
- Al tocar una pista abierta se ven su color, su sinuosidad s y su pendiente media.
- "Copiar valores" copia el bloque `pista` de `src/config.ts` con los valores actuales. Los parámetros siguen viviendo en `src/config.ts`: el panel solo los cambia en memoria.
- Con el panel abierto, el mapa se encaja debajo de él para no taparlo.

Parámetros nuevos que el panel expone (en `src/config.ts`):

- Irregularidad (0 a 1): la amplitud y la longitud de onda de la serpentina varían a lo largo de la pista (hasta ±40 % y ±50 %), de forma estable por pareja, para que no parezca una sinusoide perfecta. Con 0 la forma es la regular.
- Pendiente objetivo del color: "central" (centro de la banda) o "cercana" (la de la banda más próxima a la de la recta, que es la que menos sinuosidad necesita). Decidido: "cercana".
- Temblor (0 a 80 m): amplitud mínima de la serpentina, que se aplica siempre.
- Bandas de pendiente de cada color (mínimo y máximo, que se arrastran entre sí para no cruzarse).
- Margen de la plaza (0 a 100 m).
- Distancia mínima entre pistas (0 a 150 m), ángulo mínimo entre salidas (0 a 90°) y giro máximo de la salida orientada (0 a 80°).

Esquiadores (en el mismo panel, desde v22): peso de cada nivel en la mezcla de llegadas (se normaliza al sortear), subida de diversión por una pista de su nivel y por una forzada, bajada por cada nivel de diferencia, umbral de marcha y preferencia por las pistas de su nivel. Se aplican al momento. «Copiar valores» copia los bloques `pista` y `esquiador`.

Mapa de pruebas (en el mismo panel), para probar otras pendientes y disposiciones:

- Herramientas: mover un punto arrastrándolo (su cota sale del terreno y se ve mientras se arrastra), añadir una base, un intermedio o una cima tocando el mapa, y borrar un punto. No se puede poner un punto fuera del mapa, en la plaza (más 40 m) ni a menos de 80 m de otro.
- Cota máxima del terreno (1700 a 4000 m): la cota del pie se mantiene y el terreno se estira, así que todas las pendientes cambian a la vez.
- Mover un punto o cambiar la cota máxima conserva lo construido: remontes y pistas se rehacen en sitio y las pistas cuyo color ya no cabe quedan a trazos cortos. Añadir o borrar un punto rehace la red repitiendo las construcciones en orden y omite las que ya no se puedan hacer (las que usaban el punto borrado y las que dependían de ellas).
- El mapa se guarda en el navegador. "Copiar mapa" copia la lista de puntos para pegarla en `src/core/mapa.ts` (y la cota máxima, para `config.ts`); "Mapa original" vuelve al mapa del juego y vacía la red.

Cuando los valores queden fijados se puede retirar el panel.

## Decisiones tomadas

- Los nodos existen todos desde el principio y se activan al ser alcanzados por un remonte. (Con la ampliación del dominio, dentro de cada zona: los de una zona oculta aparecen al revelarse.)
- La estación crece también en extensión: al llegar a zonas altas se revelan zonas nuevas con bases nuevas (etapa 5).
- Los remontes se construyen arrastrando, con precio proporcional a la longitud y al tipo; las pistas son gratuitas.
- Los ingresos vienen de cada bajada completada.
- La derrota viene de las colas, no de la quiebra.
- El inicio es un pie de pistas con una plaza, varios puntos de inicio a su alrededor y una carretera de acceso por donde llegan los esquiadores.
- Los edificios alrededor de la plaza aparecen conforme crece la afluencia, que sube con el tiempo; cuando se llenan los huecos, mejoran de categoría.
- En fases posteriores puede haber varias carreteras de acceso.
- Un remonte recién construido no funciona (se ve en gris) hasta que el jugador activa una pista desde su cima. Más adelante el mismo estado inactivo se usará para averías y mal tiempo.
- Aspecto: vista en planta, limpia y suave; altura con degradado y sombreado, sin curvas de nivel; texturas de bosque y roca zonificadas por altitud; sin agua al principio.
- Cada estación admite un remonte por sentido y los emplazamientos se desdoblan en estaciones pegadas, hasta 3.
- Forma de las pistas calibrada con el panel: s_max 1,55, abombamientos 0,1 (lateral) y 0,06, onda 720 m, irregularidad 0,95 y pendiente objetivo «cercana». Temblor provisional 20 m.
- En un punto desdoblado, las pistas salen y llegan por las estaciones laterales (ver «Estaciones y desdoble»).
- Se limitan las propuestas de pista: como mucho 1 pista cruzada sin unirse y como mucho 4 llegando por punto (las salidas, por ángulo).
- Las pistas no cruzan la plaza del pie de pistas.
- Una pista que pasa cerca de otra (menos de 40 m) se une a ella; si no puede, no se propone.
- Salidas de un punto por ángulo (30° entre ellas, siempre cuesta abajo), sin tope de número; si no cabe, la pista puede salir girada hasta 60° hacia un hueco libre, con un giro propio para cada color.
- Un esquiador sin ninguna bajada de su nivel en la estación no viene (cliente potencial perdido); en pantalla se ve como «No vienen».
- Remontes y pistas pueden cruzarse (cruce visual, como un puente); lo que se limita son los cruces entre pistas, y los colores que darían una pista enmarañada no se pueden elegir.
- Las bandas de pendiente de los colores se solapan: con la misma pendiente, una pista más ancha es más fácil.
- Confluencias y dificultad: una pista puede unirse a otra más difícil, pero entonces su dificultad efectiva es la mayor (el tramo común manda).
- Todas las pistas con el mismo grosor; una pista forzada (empinada para su color) divierte menos a su nivel y se marca con un borde rojo suave en el selector.
- Los remontes no se cruzan entre sí.
- Botón de deshacer la última construcción, repetible; la demolición selectiva queda abierta.
- Botón de velocidad (1×, 2× y 4×) en la esquina inferior derecha.
- Los esquiadores pueden cambiar andando entre bases contiguas.
- Los remontes no terminan en una base y de las bases no salen pistas: las bases solo se comunican por la plaza.
- Un punto es viable si desde él se llega a una base (evita bucles cerrados).
- En pantalla se ve la versión desplegada (`vN · fecha y hora`), con N el número de la petición de fusión.
- Plataforma: web (TypeScript y Canvas 2D), para iterar rápido y probar desde el móvil. Portar a un motor solo si más adelante compensa.

## Decisiones abiertas

- [ ] Parámetros de la curva de afluencia y umbrales de aparición de edificios.
- [ ] Varias carreteras de acceso: ¿entran al mismo pie de pistas o dan acceso a otros?
- [ ] Averías y mal tiempo (fase posterior): qué ocurre con las colas y con los esquiadores en un remonte que pasa a inactivo.
- [ ] Agua (fase posterior): ¿decorativa u obstáculo para las pistas?
- [ ] Valores económicos: precio por unidad de longitud y por tipo, ingreso por bajada, coste de las mejoras.
- [ ] Umbral de saturación de cola para la derrota.
- [ ] Demolición selectiva (borrar un elemento cualquiera, no solo el último): exige revalidar el grafo de nodos viables. Por ahora solo hay deshacer.
- [ ] Umbrales de pendiente por color: contrastar con valores de referencia reales. Provisional (pendiente media ΔH / L), solapadas: verde 0,05–0,20, azul 0,13–0,30, roja 0,22–0,42, negra 0,35–0,60. Con el mapa actual casi todas las parejas admiten tres colores y hay verdes en varias parejas hacia o desde el intermedio de 1904 m. Desde v21 cada color busca su parte limpia (por debajo del mínimo del siguiente), así que dos colores ya no dan la misma pista salvo que uno salga forzado. Se pueden probar otras pendientes con el mapa de pruebas de `?ajustes`.
- [ ] Capacidades y velocidades de cada tipo de remonte.
- [ ] Contraste de las texturas del terreno: ajustar probando en el móvil.
- [ ] Orientación de pantalla (vertical u horizontal) y cómo se publicará en Android si el juego lo merece.
- [ ] ¿Deben poder cruzarse también los remontes entre sí? Hoy no pueden; los remontes y las pistas sí se cruzan.
- [ ] Rendimiento de los proyectos: con la salida orientada, recalcular los proyectos al tocar un punto tarda en el ordenador 8 ms de media y hasta unos 70 ms; en un móvil puede notarse un tirón. Optimizar si se nota jugando (por ejemplo, calcular los giros solo para los candidatos que se van a mostrar).
- [ ] Mapa: con 7 puntos hay poco que construir y la base de 1618 m queda muy cerca de la plaza. Se resuelve en buena parte con la ampliación del dominio (etapa 5), que necesita un mapa mayor dividido en zonas.
- [ ] Ampliación del dominio (etapa 5):
    - qué revela una zona: llegar a un punto puerta concreto, superar una cota, o una combinación con la afluencia;
    - qué aparece: una base en otro valle, una base a media ladera o las dos según la zona;
    - si una base alta es solo entrada y sumidero o también un punto del que salen pistas;
    - si cada base nueva tiene su propia afluencia o reparte la global;
    - cómo vuelve a su zona un esquiador que acaba en la base de otra (andando, en autobús, o se queda);
    - cuántas zonas tiene el prototipo (propuesta: la inicial y dos más) y cómo se dibujan las ocultas (atenuadas o con niebla).

## Estado del desarrollo

Actualizado el 2026-11-13 (v24: puntos grises y un intermedio por línea). Las etapas siguen el «Plan de desarrollo» de la especificación (`docs/diseno-juego-remontes.md`).

### Hecho

- **Etapa 1 de la especificación:** hecha (remontes arrastrando, estaciones que se desdoblan, bolitas, esquiadores, deshacer, velocidad y versión en pantalla).
- **Etapa 2, en parte:** proyectos de pista a trazos, selector de color con rango factible, sinuosidad por bisección y nodo viable. Con los añadidos pedidos jugando: forma de pista calibrada, bandas solapadas y pendiente «cercana», confluencias, límites contra la maraña (una pista cruzada, unión a 40 m, salidas a 30° con giro propio de cada color, 4 llegadas, plaza como obstáculo).
- **Etapa 3, con otro modelo:** niveles de esquiador, dificultad efectiva (el tramo común manda), colas con anillo. La diversión continua (0 a 1) que hay hoy no es la de la especificación (ver «Pendiente»).
- **Mapas como datos (v23):** `mapas/inicial/alturas.png` y `mapa.json`, cargados por el juego; el editor de `?ajustes` copia el JSON.
- **Mapa «Dos valles» y roca (v23):** mapa de pruebas por defecto (`?mapa=inicial` para el anterior) y máscara de terreno esquiable: la roca se pinta y ninguna pista la cruza, ni pasa por terreno más alto que su salida, ni se sale del mapa. Umbral de roca provisional 0,9 en `config.ts` y en el panel.
- **Puntos grises y un intermedio por línea (v24):** todos los puntos empiezan como círculos grises pequeños, sin estación; toman su símbolo al usarse (las estaciones se crean al construir). Un remonte arranca en una base o sigue una vez desde un cuadrado, y ese tramo acaba en triángulo. En `?ajustes`, junto a la cota de cada punto gris se ve su tipo oculto (B, I o C).
- **Herramienta temporal:** panel `?ajustes` (pistas, esquiadores y mapa de pruebas).

### Plan acordado (2026-11-12)

Pasos, cada uno jugable antes del siguiente:

1. Mapas como datos. Hecho (v23).
2. Recolorear sin coste y «muy forzada» (s / s_min). Aplazado: el usuario aún no lo tiene claro; no hacerlo hasta que lo pida.
3. Mapa nuevo con dos valles y roca, generado por script como datos; máscara de terreno esquiable. Hecho (v23).
4. Abrir un valle: desbloqueo de nodos bajos al activarse una cima. Con esto se cierra la etapa 2. Siguiente. En «Dos valles», los nodos del valle B son de tipo intermedio de momento; al hacerlo habrá que decidir si son un tipo propio.
5. Etapa 3 rehecha según la especificación: aguante, contento de 3 puntos con la tabla, variedad, aforo de cola 6 con anillo de 20 s que expulsa al último, destello al irse enfadado, puntos sin gris, quitar «No vienen» y el tope de población; contadores por color (puntito y número) y «Enfadados: N»; en `?ajustes`, desglose de quejas por causa.
6. Etapa 4: carretera, curvas de afluencia y de mezcla solo en función del tiempo, edificios decorativos (el nivel nuevo se aplica 15 s después).

### Pendiente que contradice la especificación (se arregla en el paso 5)

- Los puntos se vuelven grises con la diversión (descartado).
- «No vienen» hace depender la afluencia de lo construido (descartado).
- Diversión continua en vez de contento de 3 puntos; marcha por aburrimiento sin queja; sin aguante; tope de 90 esquiadores; anillo de 15 sin consecuencia.

### Cómo se trabaja

- Cada cambio va en una petición de fusión desde la rama de trabajo de Claude. El usuario la fusiona y se despliega sola en GitHub Pages. En pantalla se ve `vN`, con N el número de la petición, para saber qué versión está cargada.
- Los pasos de un plan que quede a medias se apuntan aquí, en este apartado, no solo en la conversación, para que la siguiente sesión pueda continuar.
