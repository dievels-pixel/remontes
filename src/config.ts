import type { PendienteObjetivo } from './core/colores';

// Parámetros de balance y de ajuste. Único sitio donde se tocan.
// Los marcados PROVISIONAL corresponden a decisiones abiertas de docs/diseno.md
// o a valores que solo se pueden fijar jugando.

export const CONFIG = {
  // Mundo, en metros. Vista vertical 3:4. PROVISIONAL: la orientación de
  // pantalla es una decisión abierta.
  mundo: { ancho: 2400, alto: 3200 },

  // Mapa de alturas: rejilla de muestras y rango de cotas que representa el gris.
  alturas: {
    columnas: 96,
    filas: 128,
    cotaMin: 1400,
    cotaMax: 2900,
    semilla: 7,
    // Peso del desnivel general (pie abajo, cumbres arriba) frente al ruido.
    pesoPendienteGeneral: 0.78,
    pesoRuido: 0.22,
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
    // Proyectos propuestos por dirección (desde la cima, hacia la base).
    proyectosPorDireccion: 2,
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
    llegadasPorMinuto: 40,
    poblacionMaxima: 90,
    velocidadAndando: 60, // m/s de juego en la plaza
    // Al llegar a una base se puede ir andando a una base contigua si su cola
    // compensa. PROVISIONAL.
    distanciaBasesContiguas: 400, // m entre bases para considerarlas contiguas
    penalizacionAndar: 3, // equivale a esa cantidad de personas más en la cola
    // v = base + factor · pendiente
    velocidadBasePista: 70,
    factorPendiente: 380,
    // Niveles (etapa 3). PROVISIONAL: la mezcla será de los edificios en la
    // etapa 4; aquí, fija. Proporción de verdes, azules, rojos y negros.
    mezclaNiveles: [0.35, 0.35, 0.2, 0.1],
    // Diversión (0 a 1; 1 = color pleno, 0 = gris). Sube al bajar por una pista
    // de su nivel (poco si es forzada: empinada para su color), baja por cada
    // nivel que la pista queda por debajo del suyo. Por debajo del umbral, al
    // llegar a una base el esquiador se va. PROVISIONAL.
    diversionInicial: 1,
    diversionSuNivel: 0.2,
    diversionForzada: 0.05,
    diversionPorNivelInferior: 0.15,
    umbralMarcha: 0.25,
    // Preferencia por las pistas de su nivel frente a las más fáciles.
    pesoSuNivel: 3,
  },

  // Colas (etapa 3): el anillo de una estación se llena con este número de
  // esquiadores esperando y pasa del gris al rojo. PROVISIONAL: va ligado al
  // umbral de saturación de la derrota, una decisión abierta.
  colas: {
    umbralAnillo: 15,
  },

  // Entrada: interacción táctil.
  entrada: {
    radioToque: 34, // px de pantalla para acertar un nodo con el dedo
    toleranciaProyecto: 18, // px de pantalla para acertar un trazo de proyecto
  },
} as const;

export type Config = typeof CONFIG;
