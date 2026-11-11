import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { generarMapaAlturas } from '../src/core/alturas';
import { crearNodos } from '../src/core/mapa';

const { ancho, alto } = CONFIG.mundo;

describe('Mapa de alturas y nodos', () => {
  const mapa = generarMapaAlturas(CONFIG.alturas, ancho, alto);

  it('es determinista y queda en 0..1', () => {
    const otro = generarMapaAlturas(CONFIG.alturas, ancho, alto);
    expect(otro.gris).toEqual(mapa.gris);
    expect(Math.min(...mapa.gris)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...mapa.gris)).toBeLessThanOrEqual(1);
  });

  it('sube de forma general del pie a las cumbres', () => {
    expect(mapa.cotaEn({ x: ancho / 2, y: alto * 0.1 })).toBeGreaterThan(mapa.cotaEn({ x: ancho / 2, y: alto * 0.9 }) + 600);
  });

  it('tiene 7 emplazamientos con 2 o 3 bases y cotas coherentes con su tipo', () => {
    const nodos = crearNodos(mapa);
    const gemelos = nodos.filter((n) => n.gemelo !== undefined);
    expect(nodos.length - gemelos.length / 2).toBe(7);
    const cotas = (t: string) => nodos.filter((n) => n.tipo === t).map((n) => n.cota);
    const bases = cotas('base');
    expect(bases.length).toBeGreaterThanOrEqual(2);
    expect(bases.length).toBeLessThanOrEqual(3);
    expect(Math.max(...bases)).toBeLessThan(Math.min(...cotas('intermedio')) - CONFIG.remonte.desnivelMinimo);
    expect(Math.max(...cotas('intermedio'))).toBeLessThan(Math.min(...cotas('cima')) - CONFIG.remonte.desnivelMinimo);
  });

  it('cada pico tiene dos estaciones gemelas, recíprocas y cercanas', () => {
    const nodos = crearNodos(mapa);
    for (const n of nodos.filter((m) => m.tipo === 'cima')) {
      expect(n.gemelo).toBeDefined();
      const g = nodos[n.gemelo!];
      expect(g.gemelo).toBe(n.id);
      expect(g.tipo).toBe('cima');
      expect(Math.hypot(g.x - n.x, g.y - n.y)).toBeLessThan(300);
    }
  });
});
