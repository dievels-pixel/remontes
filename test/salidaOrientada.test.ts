import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas } from '../src/core/colores';
import { Polilinea } from '../src/core/polilinea';
import { proyectosDesde } from '../src/core/proyectos';
import { Red, type Pista } from '../src/core/red';
import type { Punto } from '../src/core/vector';

/**
 * Cima (300, 0) y base justo debajo (300, 3000), en una ladera que baja hacia
 * +y. Ya sale de la cima una pista a 120° (hacia abajo a la izquierda): la
 * recta a la base (90°) queda a menos de 45° de ella.
 */
function escenario(giroMaximo: number): Red {
  const red = new Red(
    [
      { id: 0, tipo: 'base', x: 300, y: 3000, cota: 1500 },
      { id: 1, tipo: 'cima', x: 300, y: 0, cota: 2400 },
      { id: 2, tipo: 'base', x: -1500, y: 3000, cota: 1500 },
    ],
    {
      desnivelMinimoRemonte: 30,
      maxPistasPorPareja: 2,
      maxEstacionesPorNodo: 3,
      cotaTerreno: (q) => 2400 - 0.3 * q.y,
      pista: {
        ...CONFIG.pista,
        bandas: copiarBandas(CONFIG.pista.bandas),
        temblor: 0,
        irregularidad: 0,
        distanciaMinimaPistas: 0,
        anguloMinimoSalida: 45,
        // Solo pistas casi rectas: así la salida depende del giro y no del
        // serpenteo de un color muy sinuoso.
        sinuosidadMaxima: 1.1,
        giroMaximo,
      },
    },
  );
  red.construirRemonte(2, 1); // activa la cima sin remonte desde la base 0
  const c = red.nodo(1);
  const ang = (120 * Math.PI) / 180;
  const fin: Punto = { x: c.x + Math.cos(ang) * 600, y: c.y + Math.sin(ang) * 600 };
  const existente: Pista = {
    id: 0,
    desde: 1,
    hasta: 2,
    lado: 1,
    color: 'azul',
    trazado: new Polilinea([c, fin]),
    compartido: null,
    lateral: false,
    s: 1,
    fueraDeRango: false,
    pendiente: 0.2,
  };
  red.pistas.push(existente);
  return red;
}

const direccion = (l: Polilinea) => {
  const a = l.puntos[0];
  const b = l.puntoEn(200);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
};

describe('Salida orientada', () => {
  it('sin giro de salida, la pista a la base no cabe por ningún lado', () => {
    const red = escenario(0);
    for (const lado of [1, -1] as const) expect(red.giroLimpio(1, 0, lado)).toBeNull();
    expect(proyectosDesde(red, 1, 3).some((p) => p.hasta === 0)).toBe(false);
  });

  it('saliendo girada, ocupa el hueco libre y se propone', () => {
    const red = escenario(60);
    const p = proyectosDesde(red, 1, 3).find((x) => x.hasta === 0);
    expect(p).toBeDefined();
    expect(p!.giro).toBeGreaterThan(0);
    const t = red.trazadoPrevisto(1, 0, p!.lado, p!.giro).trazado;
    // Sale hacia la derecha de la recta, separada al menos 45° de la existente (120°) y cuesta abajo.
    expect(120 - direccion(t)).toBeGreaterThanOrEqual(45 - 1e-6);
    expect(red.salidaSeparada(1, 0, t)).toBe(true);
  });

  it('elige el menor giro que vale', () => {
    const red = escenario(60);
    const p = proyectosDesde(red, 1, 3).find((x) => x.hasta === 0)!;
    for (let g = 10; g < p.giro!; g += 10) expect(red.coloresLimpios(1, 0, p.lado, g).some((c) => c.factible)).toBe(false);
  });

  it('la pista abierta conserva su giro al recalcular', () => {
    const red = escenario(60);
    const p = proyectosDesde(red, 1, 3).find((x) => x.hasta === 0)!;
    const c = red.coloresLimpios(1, 0, p.lado, p.giro).find((x) => x.factible)!;
    const abierta = red.abrirPista(1, 0, c.color, p.lado, p.giro);
    expect(abierta.giro).toBe(p.giro);
    const antes = direccion(abierta.trazado);
    red.recalcularPistas();
    expect(direccion(abierta.trazado)).toBeCloseTo(antes, 6);
  });
});
