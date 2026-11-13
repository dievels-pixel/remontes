import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { Red, type ReglasRed } from '../src/core/red';
import { crearAzar } from '../src/core/azar';
import { Simulacion } from '../src/core/simulacion';
import { abrir, cargarMapaPrueba, REGLAS } from './apoyo';

/**
 * Base 0 abajo, intermedio 1 a media ladera (gris), cima 2 arriba y otro
 * intermedio 3 entre 1 y la cima, en una ladera recta de pendiente 0,3.
 */
function ladera(): Red {
  return new Red(
    [
      { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
      { id: 1, tipo: 'intermedio', x: 600, y: 2000, cota: 1800 },
      { id: 2, tipo: 'cima', x: 0, y: 0, cota: 2400 },
      { id: 3, tipo: 'intermedio', x: 650, y: 1000, cota: 2100 },
    ],
    { ...REGLAS, pista: { ...REGLAS.pista } },
  );
}

describe('Arrancar un remonte en un punto gris al que puede llegar una pista', () => {
  it('al empezar solo arrancan los de la plaza', () => {
    const red = ladera();
    expect([0, 1, 2, 3].map((i) => red.puedeArrancar(i))).toEqual([true, false, false, false]);
  });

  it('con un remonte a la cima, un punto gris más bajo al que cabe una pista se puede convertir en base', () => {
    const red = ladera();
    red.construirRemonte(0, 2);
    expect(red.pistaPosible(2, 1)).toBe(true);
    expect(red.puedeArrancar(1)).toBe(true);
    expect(red.puedeArrancar(2)).toBe(false); // el triángulo no
    expect(red.puedeConstruirRemonte(1, 3)).toBe('ok');
  });

  it('el punto convertido es base: círculo de salida, su remonte hace cuadrado en un intermedio y admite más remontes', () => {
    const red = ladera();
    red.construirRemonte(0, 2);
    red.construirRemonte(1, 3);
    expect(red.estacionesDe(1).map((e) => e.tipo)).toEqual(['salida']);
    expect(red.estacionesDe(3).map((e) => e.tipo)).toEqual(['paso']);
    expect(red.puedeArrancar(1)).toBe(true); // ya es base: puede desdoblarse
  });

  it('con una pista abierta hasta el punto nuevo, los esquiadores tienen salida: el punto es viable', () => {
    const red = ladera();
    red.construirRemonte(0, 2);
    abrir(red, 2, 0); // la cima tiene bajada a la plaza
    red.construirRemonte(1, 2); // remonte desde el punto convertido a la misma cima, ya en servicio
    expect(red.viable(1)).toBe(true);
    expect(red.puedeAbrirPista(2, 1)).toBe('ok');
  });

  it('sin ningún remonte que llegue más arriba, el punto sigue sin poder arrancar', () => {
    const red = ladera();
    red.construirRemonte(0, 1); // llega a 1, que es el más alto alcanzado
    expect(red.puedeArrancar(3)).toBe(false); // 3 está por encima de 1
  });
});

describe('Colonizar el valle B de «Dos valles»', () => {
  const { datos, alturas } = cargarMapaPrueba('dos-valles');
  const reglas: ReglasRed = {
    desnivelMinimoRemonte: 30,
    maxPistasPorPareja: 2,
    maxEstacionesPorNodo: 3,
    obstaculos: [datos.plaza],
    cotaTerreno: (p) => alturas.cotaEn(p),
    esRoca: (p) => !alturas.dentro(p) || alturas.pendienteEn(p) > 0.9,
    pista: {
      ...CONFIG.pista,
      bandas: copiarBandas({ verde: [0.05, 0.2], azul: [0.13, 0.3], roja: [0.22, 0.42], negra: [0.35, 0.6] }),
      sinuosidadMaxima: 1.55,
      pendienteObjetivo: 'cercana',
      anguloMinimoSalida: 30,
      distanciaMinimaPistas: 40,
      maxCrucesPistas: 1,
      toleranciaHorizontal: 10,
    },
  };

  it('desde la cima central se convierte en base el punto central del valle B, y desde él se sube a la cima', () => {
    const red = new Red(crearNodos(alturas, datos.nodos), reglas);
    const centro = red.nodos.find((n) => n.tipo === 'cima' && n.x === 1200)!;
    const valleB = red.nodos.find((n) => n.x === 1250 && n.y < 600)!;
    const plaza = red.nodos.find((n) => n.tipo === 'base' && n.x === 1200)!;
    expect(red.puedeArrancar(valleB.id)).toBe(false);
    red.construirRemonte(plaza.id, centro.id);
    expect(red.puedeArrancar(valleB.id)).toBe(true);
    expect(red.puedeConstruirRemonte(valleB.id, centro.id)).toBe('ok');
  });
});

describe('Pistas que nacen en una base de media ladera', () => {
  /** Ladera con un intermedio bajo (4) al que llega un remonte desde la plaza. */
  function conIntermedioBajo(): Red {
    return new Red(
      [
        { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
        { id: 1, tipo: 'intermedio', x: 600, y: 2000, cota: 1800 },
        { id: 2, tipo: 'cima', x: 0, y: 0, cota: 2400 },
        { id: 3, tipo: 'intermedio', x: 650, y: 1000, cota: 2100 },
        { id: 4, tipo: 'intermedio', x: -500, y: 2500, cota: 1650 },
      ],
      { ...REGLAS, pista: { ...REGLAS.pista } },
    );
  }

  it('desde una base nueva salen pistas hacia la plaza y hacia la llegada de un remonte más bajo', () => {
    const red = conIntermedioBajo();
    red.construirRemonte(0, 2);
    abrir(red, 2, 0);
    red.construirRemonte(0, 4); // remonte inferior: cuadrado en 4
    abrir(red, 4, 0);
    red.construirRemonte(1, 2); // 1 se convierte en base y sube a la cima
    expect(red.activo(1)).toBe(true);
    expect(red.puedeAbrirPista(1, 0)).toBe('ok');
    expect(red.puedeAbrirPista(1, 4)).toBe('ok');
  });

  it('los esquiadores bajan por las pistas de la base nueva y nadie se queda atascado en ella', () => {
    const red = conIntermedioBajo();
    red.construirRemonte(0, 2);
    abrir(red, 2, 0);
    red.construirRemonte(0, 4);
    abrir(red, 4, 0);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1); // llegan a la base nueva desde la cima
    const desdeBase = abrir(red, 1, 4); // y siguen hacia la llegada del remonte inferior
    const P = {
      velocidadRemonte: 160,
      intervaloBolitas: 0.9,
      capacidadBolita: 1,
      ...CONFIG.esquiador,
      mezclaNiveles: [0, 0, 0.5, 0.5],
      diversionPorNivelInferior: 0,
      umbralMarcha: 0,
    };
    const sim = new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(5));
    let porLaNueva = 0;
    for (let t = 0; t < 240; t += 1 / 60) {
      sim.paso(1 / 60);
      for (const e of sim.esquiadores.values()) if (e.estado === 'pista' && e.pista === desdeBase.id) porLaNueva++;
    }
    expect(porLaNueva).toBeGreaterThan(0);
    expect(sim.bajadasCompletadas).toBeGreaterThan(20);
  });

  it('un punto gris sin remonte sigue sin poder abrir pistas', () => {
    const red = conIntermedioBajo();
    red.construirRemonte(0, 2);
    expect(red.puedeAbrirPista(1, 0)).toBe('origen-inactivo');
  });
});
