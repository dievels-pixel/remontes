import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { copiarBandas } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { evaluarPista } from '../src/core/proyectos';
import { Red } from '../src/core/red';
import { vistaPunto } from '../src/core/visibilidad';
import { abrir, cargarMapaPrueba, redPequena } from './apoyo';

describe('Qué puntos se ven', () => {
  it('al empezar: solo la plaza; el resto no se dibuja', () => {
    const red = redPequena(); // 0 y 1 bases, 2 intermedio, 3 cima
    expect([0, 1, 2, 3].map((i) => vistaPunto(red, i, null, false).tipo)).toEqual(['completo', 'completo', 'oculto', 'oculto']);
  });

  it('con un remonte en servicio: la llegada se ve con cota; el gris al que llega una pista, discreto', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    expect(vistaPunto(red, 3, null, false).tipo).toBe('completo');
    expect(vistaPunto(red, 2, null, false).tipo).toBe('discreto'); // 3 → 2 cabe, y de 2 se sube a 3
  });

  it('arrastrando hacia arriba: los más altos aparecen, los válidos marcados y el resto atenuados', () => {
    const red = redPequena();
    const arr = { origen: 0, objetivo: null };
    expect(vistaPunto(red, 3, arr, false)).toEqual({ tipo: 'completo', marca: 'valido' });
    expect(vistaPunto(red, 1, arr, false)).toEqual({ tipo: 'completo', marca: 'invalido' }); // otra base: no
  });

  it('arrastrando hacia abajo desde una llegada: aparecen los más bajos; bajo el dedo manda la evaluación completa', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const arr = { origen: 3, objetivo: null };
    expect(vistaPunto(red, 0, arr, false)).toEqual({ tipo: 'completo', marca: 'valido' });
    expect(vistaPunto(red, 2, arr, false)).toEqual({ tipo: 'completo', marca: 'invalido' }); // sin salida
    const bajoElDedo = { origen: 3, objetivo: { nodo: 0, motivo: 'pisa-roca' as const } };
    expect(vistaPunto(red, 0, bajoElDedo, false)).toEqual({ tipo: 'completo', marca: 'invalido' });
  });

  it('en el editor de mapas se ven todos', () => {
    const red = redPequena();
    expect([0, 1, 2, 3].every((i) => vistaPunto(red, i, null, true).tipo === 'completo')).toBe(true);
  });
});

describe('«Gran dominio» con la regla de la bajada desde la llegada', () => {
  const { datos, alturas } = cargarMapaPrueba('gran-dominio');
  const nueva = () =>
    new Red(crearNodos(alturas, datos.nodos), {
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
    });

  it('se sigue pudiendo colonizar el valle norte: plaza → cima central, pista de vuelta, y desde el valle de nuevo a la cima', () => {
    const red = nueva();
    const plaza = red.nodos.find((n) => n.tipo === 'base' && n.x === 2000)!;
    const cima = red.nodos.find((n) => n.tipo === 'cima' && n.x === 2100)!;
    red.construirRemonte(plaza.id, cima.id);
    const e = evaluarPista(red, cima.id, plaza.id);
    expect(e.motivo).toBe('ok');
    if (e.motivo !== 'ok') return;
    const c = e.colores.find((x) => x.factible)!;
    red.abrirPista(cima.id, plaza.id, c.color, e.proyecto.lado, c.giro);
    const valleNorte = red.nodos.filter((n) => n.y < 1000);
    const arrancables = valleNorte.filter((n) => red.tieneDestinoDeRemonte(n.id));
    expect(arrancables.length).toBeGreaterThan(0);
    expect(arrancables.some((n) => red.puedeConstruirRemonte(n.id, cima.id) === 'ok')).toBe(true);
  });

  it('calcular qué se ve en todo el mapa cuesta poco, y la segunda vez (misma versión) casi nada', () => {
    const red = nueva();
    const plaza = red.nodos.find((n) => n.tipo === 'base' && n.x === 2000)!;
    const cima = red.nodos.find((n) => n.tipo === 'cima' && n.x === 2100)!;
    red.construirRemonte(plaza.id, cima.id);
    abrir(red, cima.id, plaza.id);
    let t = performance.now();
    for (const n of red.nodos) vistaPunto(red, n.id, null, false);
    const primera = performance.now() - t;
    t = performance.now();
    for (const n of red.nodos) vistaPunto(red, n.id, null, false);
    const segunda = performance.now() - t;
    expect(primera).toBeLessThan(3000);
    expect(segunda).toBeLessThan(primera / 5 + 5);
  }, 20000);
});
