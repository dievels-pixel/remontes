import { describe, expect, it } from 'vitest';
import { proyectosDeRemonte, proyectosDesde } from '../src/core/proyectos';
import { abrir, redPequena } from './apoyo';

describe('Proyectos de pista', () => {
  it('al construir un remonte propone las dos laterales de vuelta y otras bajadas', () => {
    const red = redPequena();
    const r = red.construirRemonte(0, 3);
    const ps = proyectosDeRemonte(red, r, 2);
    const laterales = ps.filter((p) => p.desde === 3 && p.hasta === 0);
    expect(laterales.map((p) => p.lado).sort()).toEqual([-1, 1]);
    expect(ps.some((p) => p.desde === 3 && p.hasta === 1)).toBe(true);
    for (const p of ps) expect(red.puedeAbrirPista(p.desde, p.hasta, undefined, p.lado)).toBe('ok');
  });

  it('abierta una lateral, queda propuesta solo la del otro lado', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const p = abrir(red, 3, 0);
    const ps = proyectosDesde(red, 3, 2).filter((x) => x.hasta === 0);
    expect(ps).toEqual([{ desde: 3, hasta: 0, lado: -p.lado }]);
  });

  it('no propone pistas hacia nodos no viables ni desde nodos inactivos', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(2, 3);
    expect(proyectosDesde(red, 3, 3).some((p) => p.hasta === 2)).toBe(false);
    expect(proyectosDesde(redPequena(), 3, 3)).toEqual([]);
  });

  it('limita las propuestas a las más cercanas por dirección', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    abrir(red, 3, 0);
    // Quedan 3→1 y 3→2 (si fuera viable): con máximo 1 solo se propone una.
    expect(proyectosDesde(red, 3, 1).length).toBeLessThanOrEqual(1);
  });
});
