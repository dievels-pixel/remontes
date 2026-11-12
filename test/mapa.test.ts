import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codificarPngGris, decodificarPngGris } from '../scripts/png';
import { CONFIG } from '../src/config';
import { alturasDesdeGris, crearNodos, leerDatosMapa } from '../src/core/mapa';
import { mapaInicial } from './apoyo';

describe('Mapa como datos (PNG de alturas y JSON de nodos)', () => {
  const { datos, alturas } = mapaInicial();

  it('el PNG se lee entero y cubre el mundo del JSON', () => {
    expect(alturas.columnas * alturas.filas).toBe(alturas.gris.length);
    expect(alturas.ancho).toBe(datos.ancho);
    expect(Math.min(...alturas.gris)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...alturas.gris)).toBeLessThanOrEqual(1);
  });

  it('sube de forma general del pie a las cumbres', () => {
    const { ancho, alto } = datos;
    expect(alturas.cotaEn({ x: ancho / 2, y: alto * 0.1 })).toBeGreaterThan(alturas.cotaEn({ x: ancho / 2, y: alto * 0.9 }) + 600);
  });

  it('tiene 6 o 7 nodos con 2 o 3 bases y cotas coherentes con su tipo', () => {
    const nodos = crearNodos(alturas, datos.nodos);
    expect(nodos.length).toBeGreaterThanOrEqual(6);
    expect(nodos.length).toBeLessThanOrEqual(7);
    const cotas = (t: string) => nodos.filter((n) => n.tipo === t).map((n) => n.cota);
    const bases = cotas('base');
    expect(bases.length).toBeGreaterThanOrEqual(2);
    expect(bases.length).toBeLessThanOrEqual(3);
    expect(Math.max(...bases)).toBeLessThan(Math.min(...cotas('intermedio')) - CONFIG.remonte.desnivelMinimo);
    expect(Math.max(...cotas('intermedio'))).toBeLessThan(Math.min(...cotas('cima')));
  });

  it('conserva las cotas del mapa anterior (generado por código) con un error de 3 m como mucho', () => {
    const anteriores = [1553, 1618, 1558, 1904, 1964, 2443, 2453];
    const nodos = crearNodos(alturas, datos.nodos);
    nodos.forEach((n, i) => expect(Math.abs(n.cota - anteriores[i])).toBeLessThanOrEqual(3));
  });

  it('el PNG se escribe y se lee igual (gris de 8 bits)', () => {
    const gris = Uint8Array.from({ length: 12 }, (_, i) => i * 20);
    const r = decodificarPngGris(codificarPngGris(4, 3, gris));
    expect(r).toEqual({ ancho: 4, alto: 3, gris });
    expect(decodificarPngGris(readFileSync('mapas/inicial/alturas.png')).gris.length).toBe(alturas.gris.length);
  });

  it('rechaza un JSON mal formado con un mensaje claro', () => {
    expect(() => leerDatosMapa({ ...datos, cotaMax: 'alta' })).toThrow('cotaMax debe ser un número');
    expect(() => leerDatosMapa({ ...datos, nodos: [{ tipo: 'collado', x: 1, y: 1 }] })).toThrow('tipo desconocido (collado)');
    expect(() => leerDatosMapa({ ...datos, nodos: [{ tipo: 'cima', x: 1, y: 1 }] })).toThrow('al menos una base');
    expect(() => leerDatosMapa({ ...datos, nodos: [{ tipo: 'base', x: -5, y: 1 }] })).toThrow('fuera del mapa');
    expect(() => alturasDesdeGris(datos, 3, 3, [0, 1])).toThrow('no tiene el tamaño');
  });
});
