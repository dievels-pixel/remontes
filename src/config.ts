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

  // Remontes (en la etapa 1 todos son telesquí). PROVISIONAL: capacidades y
  // velocidades por tipo son decisión abierta.
  remonte: {
    velocidad: 160, // m/s de juego (tiempo comprimido)
    intervaloBolitas: 0.9, // s entre bolitas
    capacidad: 1, // personas por bolita
    desnivelMinimo: 30, // m; evita remontes casi horizontales
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

  // Esquiadores. PROVISIONAL: la afluencia creciente llega en la etapa 4; aquí
  // entra un caudal constante hasta un tope.
  esquiador: {
    // Afluencia constante hasta la etapa 4 (curva en función del tiempo).
    // PROVISIONAL.
    llegadasPorMinuto: 30,
    velocidadAndando: 60, // m/s de juego en la plaza
    // Al llegar a una base se puede ir andando a una base contigua si su cola
    // compensa. PROVISIONAL.
    distanciaBasesContiguas: 400, // m entre bases para considerarlas contiguas
    penalizacionAndar: 3, // equivale a esa cantidad de personas más en la cola
    // v = base + factor · pendiente
    velocidadBasePista: 70,
    factorPendiente: 380,
    // Proporción de verdes, azules, rojos y negros entre los que llegan.
    // PROVISIONAL: en la etapa 4 la fija la curva del tiempo.
    mezclaNiveles: [0.35, 0.35, 0.2, 0.1],
    // Aguante (s de juego), al azar entre los dos valores: al agotarlo el
    // esquiador se va cansado, sin queja. Hipótesis de la especificación: de
    // 3 a 6 minutos. PROVISIONAL.
    aguanteMinimo: 180,
    aguanteMaximo: 360,
    // Contento al entrar (y tope). A 0 se va enfadado. Especificación: 3.
    contentoInicial: 3,
    // Pistas que recuerda para la variedad. Especificación: 2. PROVISIONAL.
    memoriaVariedad: 2,
    // Elección de ruta (por nivel, variedad y cola): peso = gusto × repetición
    // × 1 / (1 + cola). Gusto de una pista según cuántos niveles queda por
    // debajo del esquiador: su nivel, uno, dos (empieza el aburrimiento) y
    // tres por debajo. PROVISIONAL: por calibrar con la simulación.
    gustoPorDiferencia: [1, 0.5, 0.15, 0.03],
    // Peso de una pista entre sus últimas bajadas (no se descarta, pesa
    // menos; no resta contento). PROVISIONAL.
    factorRepeticion: 0.3,
    // Gusto de un remonte: el de lo mejor que hay tras su llegada, por este
    // factor por cada remonte que haya que coger. PROVISIONAL.
    descuentoPorRemonte: 0.85,
  },

  // Colas: con más gente que el aforo, el anillo del remonte se llena en
  // `tiempoAnillo` s; lleno, el último se va enfadado y el anillo baja a la
  // mitad. Hipótesis de la especificación: 6 y 20 s. PROVISIONAL.
  colas: {
    aforo: 6,
    tiempoAnillo: 20,
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
