import type { PendienteObjetivo } from './core/colores';

// Parámetros de balance y de ajuste. Único sitio donde se tocan.
// Los marcados PROVISIONAL corresponden a decisiones abiertas de docs/diseno.md
// o a valores que solo se pueden fijar jugando.

export const CONFIG = {
  // El tamaño del mundo, las cotas y la plaza son del mapa (mapas/<nombre>/mapa.json).

  // Terreno esquiable. Donde la pendiente local del mapa de alturas pasa de
  // este umbral, el terreno es roca o precipicio: se pinta como roca y ninguna
  // pista lo cruza. Bastante mayor que la de una negra, porque una pista que
  // serpentea cruza la ladera con menos pendiente que la del terreno.
  // PROVISIONAL (decisión abierta de la especificación).
  terreno: {
    umbralRoca: 0.9,
  },

  // Tiempo: segundos de juego por segundo real a la velocidad «1×» (v41: el
  // antiguo 2× pasa a ser el normal). Los botones dan pausa, 1× y 2×.
  tiempo: {
    escala: 2,
    velocidades: [1, 2],
  },

  // Ciclo de día: solo visual (un tinte del amanecer a la noche) y unidad de
  // puntuación (días sobrevividos). No hay cierre de jornada. Un día dura
  // 2 minutos reales a 1×, así que una partida razonable son unos 9 días.
  dia: {
    duracion: 240, // s de juego
  },

  // Remontes. Se construye siempre un telesquí y se mejora a telesilla y a
  // telecabina (pulsación larga), pagando la diferencia. Por tipo (telesquí,
  // telesilla, telecabina): personas por bolita (2 y 4 los decidió el usuario;
  // la especificación decía 4 y 8) y velocidad relativa (la telecabina, más
  // rápida). PROVISIONAL las velocidades.
  remonte: {
    velocidad: 100, // m/s de juego del telesquí (tiempo comprimido)
    // s entre bolitas, igual en los tres tipos: un telesquí sube 33 personas
    // por minuto, una telesilla 67 y una telecabina 133 (calibrado en la fase 1).
    intervaloBolitas: 1.8,
    capacidad: 1, // personas por bolita del telesquí (= capacidadPorTipo[0])
    capacidadPorTipo: [1, 2, 4],
    factorVelocidadPorTipo: [1, 1, 1.3],
    desnivelMinimo: 30, // m; evita remontes casi horizontales
  },

  // Economía (etapa 6). Precio de un remonte = longitud en planta × precio por
  // metro × factor del tipo; mejorar paga la diferencia y deshacer devuelve lo
  // pagado. Cada bajada paga la tarifa del color de la pista × (1 +
  // multiplicadorVariedad × bajadas con variedad que lleva el esquiador).
  // Calibrado en v42 con partidas automáticas (npm run jugar): con estos
  // valores el dinero va justo los primeros 10-12 minutos y un jugador que
  // mejora donde hay cola aguanta unos 14 min (mediana de 7), uno que nunca
  // mejora, unos 11. PROVISIONAL: por ajustar jugando.
  economia: {
    monedasIniciales: 450,
    precioPorMetro: 0.12, // un telesquí de 1000 m cuesta 120
    factorPrecioPorTipo: [1, 2.5, 5],
    tarifas: [1, 1.5, 2, 3], // verde, azul, roja, negra (especificación)
    multiplicadorVariedad: 0.1, // la especificación decía 0,2: inflaba los ingresos
    // Fracción que paga una bajada que no divierte (repetida, forzada o que le
    // aburre). Decidido por el usuario en v45, a prueba: la mitad.
    factorSinDiversion: 0.5,
    // Mantenimiento de cada remonte, por minuto: longitud × porMetroYMinuto ×
    // factor del tipo. Se paga se use o no; las monedas no bajan de 0. Crece
    // más que la capacidad (1, 2, 4 personas frente a 1, 4, 10 de coste), así
    // que mejorar un remonte sin cola pierde dinero: un telesquí de 1200 m
    // cuesta 7/min; como telecabina, 72/min.
    mantenimiento: {
      porMetroYMinuto: 0.008,
      // Y además esto por cada remonte, sea cual sea su longitud y tipo (sus
      // dos estaciones): llenar el mapa de telesquís baratos sale caro.
      fijoPorMinuto: 2,
      factorPorTipo: [1, 4, 10],
    },
  },

  // Estaciones: cada emplazamiento se desdobla en estaciones pegadas, una por
  // remonte y sentido. PROVISIONAL.
  estaciones: {
    maxPorEmplazamiento: 3,
    separacionPx: 22, // px de pantalla entre centros (símbolo de 19 px + hueco)
  },

  // Pistas. Color por pendiente media efectiva p = ΔH / L. Las bandas se
  // solapan: con la misma pendiente, una pista más ancha es más fácil.
  // PROVISIONAL: por calibrar con el panel de ajustes.
  pista: {
    bandas: {
      verde: [0.05, 0.2],
      azul: [0.13, 0.3],
      roja: [0.22, 0.42],
      negra: [0.35, 0.6],
    },
    sinuosidadMaxima: 1.55, // s = L / D; calibrado con el panel de ajustes
    // Abombamiento lateral / distancia: separa de su remonte las dos laterales
    // (lente); el resto apenas se separa de la recta. Calibrado con el panel.
    abombamientoLateral: 0.1,
    abombamientoNormal: 0.06,
    // Salida orientada: si la salida de una pista no cabe entre las que ya
    // hay, puede salir girada hacia su lado (en pasos de 10°, hasta este
    // máximo) y volver enseguida a su eje. PROVISIONAL.
    giroMaximo: 60, // grados
    // m por oscilación de la serpentina. Más corta da zigzags más cerrados y
    // menos anchos para la misma longitud: las pistas se salen menos de su eje.
    longitudOnda: 720, // calibrado con el panel de ajustes
    // 0 a 1: variación de amplitud y longitud de onda de la serpentina, para
    // que no parezca una sinusoide perfecta. 0 = regular.
    irregularidad: 0.95, // calibrado con el panel de ajustes
    // Amplitud mínima de la serpentina (m), aunque el color no pida alargar la
    // pista: da un poco de temblor a las más directas. 0 = curva lisa.
    // PROVISIONAL: por ajustar con el panel.
    temblor: 20,
    // Pendiente que se busca al elegir color: 'central' (centro de la banda) o
    // 'cercana' (la de la banda más próxima a la recta: menos sinuosidad).
    // Elegida con el panel de ajustes: 'cercana'.
    pendienteObjetivo: 'cercana' as PendienteObjetivo,
    // Confluencias: tramo inicial en que no se buscan cruces (las pistas que
    // salen del mismo nodo empiezan juntas) y tramo compartido mínimo.
    margenConfluencia: 120, // m
    tramoCompartidoMinimo: 100, // m
    separacionNodo: 45, // m que la pista se separa del nodo en cada extremo
    // En un punto desdoblado, longitud del primer y el último tramo de la pista
    // que se desplaza (solo al dibujar) hasta su estación.
    tramoEstacion: 120, // m
    maxPorPareja: 2, // forma de lente: una a cada lado
    // Para no enmarañar: no se propone una pista cuyo trazado cruce (sin
    // unirse) más pistas que este máximo. Remontes y pistas sí pueden cruzarse:
    // es un cruce solo visual, como un puente.
    maxCrucesPistas: 1,
    // Salidas de una cima o intermedio: sin tope de número, pero cada una
    // separada de las demás al menos este ángulo y siempre cuesta abajo (o en
    // horizontal). En una ladera plana caben 7 con 30°. Calibrado con el panel.
    anguloMinimoSalida: 30, // grados
    toleranciaHorizontal: 10, // m que puede subir la salida y contar como horizontal
    longitudDireccionSalida: 200, // m con los que se mide la dirección de salida
    // Tope de pistas llegando a un punto (base o intermedio), donde peor se lee
    // la maraña.
    maxPistasLlegada: 4,
    // Acuerdo curvo al unirse a otra pista o separarse de ella, para que
    // emboque tangente y no en perpendicular.
    radioAcuerdo: 150, // m
    // Margen alrededor de la plaza del pie de pistas: ningún proyecto de pista
    // puede entrar en el círculo de la plaza más este margen. PROVISIONAL.
    margenObstaculo: 30, // m
    // Si el trazado previsto se acerca a otra pista a menos de esto, cuenta como
    // encuentro y se une a ella; si no puede unirse, no se propone. Calibrado
    // con el panel.
    distanciaMinimaPistas: 40, // m
  },

  // Afluencia: curva por escalones en función del tiempo con la estación
  // abierta (desde que hay algún remonte en servicio), sin depender de lo
  // construido. Cada `intervalo` s sube un escalón, que se aplica `retraso` s
  // después (era el margen tras el edificio que lo anunciaba; los edificios
  // se quitaron en v39). Ver src/core/afluencia.ts.
  // PROVISIONAL todo salvo el retraso (15 s en la especificación): por
  // calibrar con la simulación.
  afluencia: {
    intervalo: 60, // s entre escalones
    retraso: 15, // s de retraso de cada escalón
    tasaInicial: 6, // llegadas por minuto al abrir
    incremento: 1.6, // llegadas por minuto más en cada escalón
    // y además esto por el cuadrado del número de escalón: el final aprieta
    // sin endurecer el principio (minuto 20: 48 por minuto; minuto 30: 77).
    aceleracion: 0.026,
    // Mezcla de niveles (pesos de verdes, azules, rojos y negros) en algunos
    // minutos; se interpola entre ellos y se mantiene tras el último. Al
    // principio, mayoría de verdes y azules; rojos desde unos 4 minutos y
    // negros desde unos 8.
    mezcla: [
      { minuto: 0, pesos: [0.6, 0.4, 0, 0] },
      { minuto: 6, pesos: [0.5, 0.38, 0.12, 0] },
      { minuto: 12, pesos: [0.42, 0.34, 0.2, 0.04] },
      { minuto: 20, pesos: [0.36, 0.31, 0.23, 0.1] },
      { minuto: 30, pesos: [0.32, 0.29, 0.24, 0.15] },
    ],
    velocidadCarretera: 150, // m/s de juego por la carretera de acceso
  },

  esquiador: {
    velocidadAndando: 60, // m/s de juego en la plaza
    // Al llegar a una base se puede ir andando a una base contigua si su cola
    // compensa. Con 1000 m, todas las bases de la plaza son contiguas (en Espot
    // están a 403 y 700 m; con los 400 m de antes nadie cambiaba nunca de base
    // y la cola de una base podía crecer sin límite con las otras vacías).
    distanciaBasesContiguas: 1000, // m entre bases para considerarlas contiguas
    penalizacionAndar: 3, // equivale a esa cantidad de personas más en la cola
    // v = base + factor · pendiente
    velocidadBasePista: 70,
    factorPendiente: 380,
    // Aguante (s de juego), al azar entre los dos valores: al agotarlo el
    // esquiador se va cansado, sin queja. Hipótesis de la especificación: de
    // 3 a 6 minutos. PROVISIONAL.
    aguanteMinimo: 180,
    aguanteMaximo: 360,
    // Contento al entrar (y tope). A 0 se va enfadado. Especificación: 3.
    contentoInicial: 3,
    // Pistas que recuerda para la variedad. Especificación: 2. PROVISIONAL.
    memoriaVariedad: 1,
    // Elección de ruta (por nivel, variedad y cola): peso = gusto × repetición
    // × 1 / (1 + cola). Gusto de una pista según cuántos niveles queda por
    // debajo del esquiador: su nivel, uno, dos (empieza el aburrimiento) y
    // tres por debajo. PROVISIONAL: por calibrar con la simulación.
    gustoPorDiferencia: [1, 0.6, 0.08, 0.02],
    // Peso de una pista entre sus últimas bajadas (no se descarta, pesa
    // menos; no resta contento). PROVISIONAL.
    factorRepeticion: 0.4,
    // Gusto de un remonte: el de lo mejor que hay tras su llegada, por este
    // factor por cada remonte que haya que coger. PROVISIONAL.
    descuentoPorRemonte: 0.7,
    // Cuánto espanta una cola al elegir: el peso de cada opción se divide por
    // (1 + espera) elevado a esto, con la espera en bolitas (cola entre las
    // plazas de cada bolita). Con 1 (hasta el 2026-11-17), una cola de 17
    // frente a otra vacía aún la elegía uno de cada cinco.
    exponenteCola: 1.5,
    // Gusto por una pista por la que aún no ha bajado en su visita: le lleva a
    // recorrer toda la estación en vez de quedarse abajo.
    factorNovedad: 2.5,
  },

  // Colas: con más gente que el aforo, el anillo del remonte se llena en
  // `tiempoAnillo` s; lleno, el último se va enfadado y el anillo baja a la
  // mitad. Hipótesis de la especificación: 6 y 20 s. PROVISIONAL.
  colas: {
    aforo: 6,
    tiempoAnillo: 30,
  },

  // Medidor de quejas (fin de partida): cada esquiador que se va enfadado lo
  // llena en 1 y se vacía solo a `vaciadoPorMinuto`; con `capacidad` quejas
  // dentro se acaba la partida. Por encima de `aviso` (fracción) la plaza se
  // tiñe de rojo. PROVISIONAL todo. Vaciado: con la regla de la
  // especificación (un enfadado por cada cuatro satisfechos es tolerable) y
  // 12 llegadas/min al abrir, unas 2,4 quejas/min; como la afluencia sube y el
  // vaciado no, la tensión crece sola.
  quejas: {
    capacidad: 36,
    vaciadoPorMinuto: 2,
    aviso: 0.7,
    // Segundos de estación abierta en los que los enfadados aún no llenan el
    // medidor: no se puede perder en los 2 primeros minutos reales (4 de juego).
    gracia: 240,
  },

  // Rendimiento: calentamiento de cachés en segundo plano tras cada obra
  // (ver src/core/calentamiento.ts). No es balance: no cambia ninguna regla.
  calentamiento: {
    msPorFotograma: 4, // presupuesto por fotograma (se comprueba entre tareas)
    destinosPorOrigen: 16, // pistas que se precalculan desde cada punto activo: las más cercanas
  },

  // Entrada: interacción táctil.
  entrada: {
    radioToque: 34, // px de pantalla para acertar un nodo con el dedo
    toleranciaProyecto: 18, // px de pantalla para acertar una pista al tocarla (panel de ajustes)
  },
} as const;

export type Config = typeof CONFIG;
