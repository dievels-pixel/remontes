import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { Red, type Nodo, type ReglasRed } from '../src/core/red';
import { cargarMapaPrueba } from './apoyo';

/** Parámetros de pista fijados aquí (los calibrados en v22), para no depender de config.ts. */
const PISTA = {
  ...CONFIG.pista,
  bandas: copiarBandas({ verde: [0.05, 0.2], azul: [0.13, 0.3], roja: [0.22, 0.42], negra: [0.35, 0.6] }),
  sinuosidadMaxima: 1.55,
  abombamientoLateral: 0.1,
  abombamientoNormal: 0.06,
  giroMaximo: 60,
  longitudOnda: 720,
  irregularidad: 0.95,
  temblor: 20,
  pendienteObjetivo: 'cercana' as const,
  anguloMinimoSalida: 30,
  distanciaMinimaPistas: 40,
  maxCrucesPistas: 1,
  toleranciaHorizontal: 10,
};

const reglas = (extra: Partial<ReglasRed>): ReglasRed => ({
  desnivelMinimoRemonte: 30,
  maxPistasPorPareja: 2,
  maxEstacionesPorNodo: 3,
  pista: { ...PISTA, bandas: copiarBandas(PISTA.bandas) },
  ...extra,
});

/** Base abajo y cima arriba en una ladera uniforme de pendiente 0,3. */
const NODOS: Nodo[] = [
  { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
  { id: 1, tipo: 'cima', x: 0, y: 0, cota: 2400 },
];
const ladera = (p: { y: number }) => 2400 - 0.3 * p.y;
const algunColor = (red: Red) => [1, -1].some((lado) => red.coloresLimpios(1, 0, lado as 1 | -1).some((c) => c.factible));

describe('Terreno esquiable: roca y terreno más alto que la salida', () => {
  it('sin roca, la pista se propone', () => {
    expect(algunColor(new Red(NODOS.map((n) => ({ ...n })), reglas({ cotaTerreno: ladera })))).toBe(true);
  });

  it('una banda de roca que cruza toda la ladera cierra el paso a cualquier trazado', () => {
    const red = new Red(NODOS.map((n) => ({ ...n })), reglas({ cotaTerreno: ladera, esRoca: (p) => Math.abs(p.y - 1500) < 30 }));
    expect(algunColor(red)).toBe(false);
  });

  it('con un hueco en la banda, solo pasan los trazados que van por él', () => {
    const roca = (p: { x: number; y: number }) => Math.abs(p.y - 1500) < 30 && Math.abs(p.x) > 400;
    expect(algunColor(new Red(NODOS.map((n) => ({ ...n })), reglas({ cotaTerreno: ladera, esRoca: roca })))).toBe(true);
  });

  it('un cordal más alto que la salida, entre los dos nodos, también cierra el paso', () => {
    // La recta baja 900 m, pero a media ladera hay una loma 50 m por encima de la cima.
    const conLoma = (p: { x: number; y: number }) => ladera(p) + 1000 * Math.exp(-((p.y - 1500) ** 2) / (2 * 150 ** 2));
    expect(algunColor(new Red(NODOS.map((n) => ({ ...n })), reglas({ cotaTerreno: conLoma })))).toBe(false);
  });
});

describe('Mapa «Dos valles»', () => {
  const { datos, alturas } = cargarMapaPrueba('dos-valles');
  const nodos = crearNodos(alturas, datos.nodos);
  const roca = (p: { x: number; y: number }) => alturas.pendienteEn(p) > 0.9;
  const red = new Red(nodos, reglas({ obstaculos: [datos.plaza], cotaTerreno: (p) => alturas.cotaEn(p), esRoca: roca }));
  const cimas = nodos.filter((n) => n.tipo === 'cima');
  const valleB = nodos.filter((n) => n.y < 600);
  const bases = nodos.filter((n) => n.tipo === 'base');

  it('tiene tres cimas en el cordal, más altas que todo lo demás, y un valle B entre las bases y las cimas', () => {
    expect(cimas).toHaveLength(3);
    const otros = nodos.filter((n) => n.tipo !== 'cima');
    expect(Math.min(...cimas.map((c) => c.cota))).toBeGreaterThan(Math.max(...otros.map((n) => n.cota)));
    expect(valleB).toHaveLength(3);
    for (const n of valleB) expect(n.cota).toBeGreaterThan(Math.max(...bases.map((b) => b.cota)) + 300);
  });

  it('ningún punto está en roca; hay roca en el cortado del pico este y en la banda, y el paso de la banda es esquiable', () => {
    for (const n of nodos) expect(roca(n)).toBe(false);
    expect(roca({ x: 1950, y: 1300 })).toBe(true); // cortado norte del pico este
    expect(roca({ x: 1400, y: 2650 })).toBe(true); // banda, lado oeste
    expect(roca({ x: 2200, y: 2650 })).toBe(true); // banda, lado este
    expect(roca({ x: 1800, y: 2650 })).toBe(false); // paso
  });

  it('del pico este no se baja al valle B (cortado), aunque por pendiente cabría una negra', () => {
    const este = cimas.reduce((a, b) => (a.x > b.x ? a : b));
    const debajo = valleB.reduce((a, b) => (Math.abs(a.x - este.x) < Math.abs(b.x - este.x) ? a : b));
    const porPendiente = red.colores(este.id, debajo.id, 1).some((c) => c.factible);
    const limpio = [1, -1].some((l) => red.coloresElegibles(este.id, debajo.id, l as 1 | -1).some((c) => c.factible));
    expect(porPendiente).toBe(true);
    expect(limpio).toBe(false);
  });

  it('de la cima central sí se baja al valle B', () => {
    const centro = cimas.find((c) => c.x === 1200)!;
    const debajo = valleB.find((n) => n.x === 1250)!;
    expect([1, -1].some((l) => red.coloresElegibles(centro.id, debajo.id, l as 1 | -1).some((c) => c.factible))).toBe(true);
  });

  it('desde un intermedio del valle A no se puede cruzar el cordal hacia el valle B', () => {
    const intermedioA = nodos.find((n) => n.tipo === 'intermedio' && n.y > 1600 && n.cota > Math.max(...valleB.map((b) => b.cota)))!;
    for (const b of valleB) for (const l of [1, -1] as const) expect(red.coloresLimpios(intermedioA.id, b.id, l).some((c) => c.factible)).toBe(false);
  });
});
