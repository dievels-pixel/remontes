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

  // Pistas. Color por pendiente media efectiva p = ΔH / L. PROVISIONAL: las
  // bandas son una decisión abierta (contrastar con estaciones reales).
  pista: {
    bandas: {
      verde: [0.05, 0.15],
      azul: [0.15, 0.25],
      roja: [0.25, 0.4],
      negra: [0.4, 0.6],
    },
    sinuosidadMaxima: 2.0, // s = L / D; el diseño la sitúa entre 1,6 y 2
    // Abombamiento lateral / distancia. 0,2 da s ≈ 1,1 en las laterales de un
    // remonte (lente); el resto apenas se separa de la recta.
    abombamientoLateral: 0.2,
    abombamientoNormal: 0.06,
    longitudOnda: 650, // m por oscilación de la serpentina
    separacionNodo: 45, // m que la pista se separa del nodo en cada extremo
    maxPorPareja: 2, // forma de lente: una a cada lado
    // Proyectos propuestos por dirección (desde la cima, hacia la base).
    proyectosPorDireccion: 2,
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
  },

  // Entrada: interacción táctil.
  entrada: {
    radioToque: 34, // px de pantalla para acertar un nodo con el dedo
    toleranciaProyecto: 18, // px de pantalla para acertar un trazo de proyecto
  },
} as const;

export type Config = typeof CONFIG;
