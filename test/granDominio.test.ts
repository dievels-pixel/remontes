import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas, type ColorPista } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { Red } from '../src/core/red';
import { cargarMapaPrueba } from './apoyo';

/**
 * Mapa «Gran dominio»: tiene que dar pistas de todos los colores en muchos
 * sitios. Parámetros de pista fijados aquí (los calibrados), no los de config.ts.
 */
describe('Mapa «Gran dominio»', () => {
  const { datos, alturas } = cargarMapaPrueba('gran-dominio');
  const nodos = crearNodos(alturas, datos.nodos);
  const roca = (p: { x: number; y: number }) => !alturas.dentro(p) || alturas.pendienteEn(p) > 0.9;
  const red = new Red(nodos, {
    desnivelMinimoRemonte: 30,
    maxPistasPorPareja: 2,
    maxEstacionesPorNodo: 3,
    obstaculos: [datos.plaza],
    cotaTerreno: (p) => alturas.cotaEn(p),
    esRoca: roca,
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
  });

  it('ningún punto está en roca y las bases de la plaza son los puntos más bajos del valle principal', () => {
    for (const n of nodos) expect(roca(n)).toBe(false);
    const bases = nodos.filter((n) => n.tipo === 'base');
    expect(bases).toHaveLength(3);
    const cimas = nodos.filter((n) => n.tipo === 'cima');
    expect(cimas).toHaveLength(5);
    expect(Math.min(...cimas.map((c) => c.cota))).toBeGreaterThan(Math.max(...nodos.filter((n) => n.tipo !== 'cima').map((n) => n.cota)));
  });

  it('hay pistas limpias de los cuatro colores en muchas parejas de puntos', () => {
    const cuenta: Record<ColorPista, number> = { verde: 0, azul: 0, roja: 0, negra: 0 };
    for (const a of nodos) {
      for (const b of nodos) {
        if (a.tipo === 'base' || b.cota >= a.cota || Math.hypot(a.x - b.x, a.y - b.y) > 2200) continue;
        const colores = new Set<ColorPista>();
        for (const l of [1, -1] as const) for (const c of red.coloresLimpios(a.id, b.id, l)) if (c.factible) colores.add(c.color);
        for (const c of colores) cuenta[c]++;
      }
    }
    expect(cuenta.verde).toBeGreaterThan(60);
    expect(cuenta.azul).toBeGreaterThan(60);
    expect(cuenta.roja).toBeGreaterThan(40);
    expect(cuenta.negra).toBeGreaterThan(20);
  }, 60000);
});
