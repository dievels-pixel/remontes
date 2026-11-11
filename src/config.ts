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

  // Pistas. En la etapa 1 la curva usa una amplitud fija; el cálculo de la
  // sinuosidad por bisección es de la etapa 2.
  pista: {
    amplitudRelativa: 0.22, // desplazamiento lateral de la curva / distancia
    variacionAmplitud: 0.06, // variación estable por semilla de la pareja
    separacionNodo: 45, // m que la pista se separa del nodo en cada extremo
    maxPorPareja: 2, // forma de lente: una a cada lado
    muestras: 48,
  },

  // Esquiadores. PROVISIONAL: la afluencia creciente llega en la etapa 4; aquí
  // entra un caudal constante hasta un tope.
  esquiador: {
    llegadasPorMinuto: 40,
    poblacionMaxima: 90,
    velocidadAndando: 60, // m/s de juego en la plaza
    // v = base + factor · pendiente
    velocidadBasePista: 70,
    factorPendiente: 380,
  },

  // Entrada: interacción táctil.
  entrada: {
    radioToque: 34, // px de pantalla para acertar un nodo con el dedo
  },
} as const;

export type Config = typeof CONFIG;
