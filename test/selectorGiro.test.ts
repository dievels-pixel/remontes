import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas, type ColorPista } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { Red } from '../src/core/red';
import { mapaInicial } from './apoyo';

/**
 * Estación del mapa del juego parecida a la de la captura del fallo (v21):
 * cima de 2443 m (5) con una roja lateral a 1618 m (1) y otra roja a 1964 m
 * (4). Parámetros de pista fijados aquí (los de v21, con 45° entre salidas),
 * para no depender de la calibración.
 */
function estacion(): Red {
  const { datos, alturas } = mapaInicial();
  const red = new Red(crearNodos(alturas, datos.nodos), {
    desnivelMinimoRemonte: 30,
    maxPistasPorPareja: 2,
    maxEstacionesPorNodo: 3,
    obstaculos: [datos.plaza],
    cotaTerreno: (p) => alturas.cotaEn(p),
    pista: {
      ...CONFIG.pista,
      bandas: copiarBandas({ verde: [0.05, 0.2], azul: [0.13, 0.3], roja: [0.22, 0.42], negra: [0.35, 0.6] }),
      sinuosidadMaxima: 1.55,
      abombamientoLateral: 0.1,
      abombamientoNormal: 0.06,
      giroMaximo: 60,
      longitudOnda: 720,
      irregularidad: 0.95,
      temblor: 20,
      pendienteObjetivo: 'cercana',
      anguloMinimoSalida: 45,
      distanciaMinimaPistas: 50,
      maxCrucesPistas: 1,
    },
  });
  const pista = (d: number, h: number, color: ColorPista) => {
    const lado = red.ladoLibre(d, h) ?? 1;
    const g = red.giroLimpio(d, h, lado);
    red.abrirPista(d, h, color, lado, typeof g === 'number' ? g : undefined);
  };
  red.construirRemonte(1, 5);
  pista(5, 1, 'roja');
  red.construirRemonte(2, 4);
  red.construirRemonte(4, 6);
  pista(6, 2, 'negra');
  red.construirRemonte(4, 5);
  pista(5, 4, 'roja');
  return red;
}

describe('Selector: cada color con su propio giro de salida', () => {
  it('reproduce el fallo: sin girar, la negra sale pegada a otra salida y solo quedan azul (forzada) y roja', () => {
    const red = estacion();
    const sinGiro = red.coloresLimpios(5, 0, 1);
    expect(sinGiro.filter((c) => c.factible).map((c) => c.color)).toEqual(['azul', 'roja']);
    // El giro común se paraba aquí: con algún color limpio, no buscaba más.
    expect(red.giroLimpio(5, 0, 1)).toBeUndefined();
  });

  it('con su propio giro, la negra también se ofrece', () => {
    const red = estacion();
    const elegibles = red.coloresElegibles(5, 0, 1);
    const negra = elegibles.find((c) => c.color === 'negra')!;
    expect(negra.factible).toBe(true);
    expect(negra.giro).toBe(10);
    expect(elegibles.find((c) => c.color === 'roja')!.giro).toBeUndefined();
    // Y se abre con ese giro, con trazado limpio.
    expect(red.puedeAbrirPista(5, 0, 'negra', 1, negra.giro)).toBe('ok');
    const p = red.abrirPista(5, 0, 'negra', 1, negra.giro);
    expect(p.giro).toBe(10);
  });

  it('un color que no cabe por pendiente sigue apagado', () => {
    const red = estacion();
    expect(red.coloresElegibles(5, 0, 1).find((c) => c.color === 'verde')!.factible).toBe(false);
  });
});
