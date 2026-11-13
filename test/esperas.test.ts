import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { copiarBandas } from '../src/core/colores';
import { crearNodos } from '../src/core/mapa';
import { evaluarPista } from '../src/core/proyectos';
import { Red } from '../src/core/red';
import { Simulacion, type ParametrosSimulacion } from '../src/core/simulacion';
import { vistaPunto } from '../src/core/visibilidad';
import { abrir, cargarMapaPrueba, REGLAS, redPequena } from './apoyo';

/** Abre la pista que evalúa evaluarPista, con su primer color posible. */
function abrirEvaluada(red: Red, desde: number, hasta: number) {
  const e = evaluarPista(red, desde, hasta);
  if (e.motivo !== 'ok') throw new Error(`No cabe ${desde}→${hasta}: ${e.motivo}`);
  const c = e.colores.find((x) => x.factible)!;
  return { pista: red.abrirPista(desde, hasta, c.color, e.proyecto.lado, c.giro), espera: e.espera };
}

const P: ParametrosSimulacion = {
  velocidadRemonte: 160,
  intervaloBolitas: 0.9,
  capacidadBolita: 1,
  ...CONFIG.esquiador,
  mezclaNiveles: [0.25, 0.25, 0.25, 0.25],
  aguanteMinimo: 1e6,
  aguanteMaximo: 1e6,
  contentoInicial: 1000,
  aforoCola: 1000,
  tiempoAnillo: 20,
};
const correr = (sim: Simulacion, s: number, alPaso?: () => void) => {
  for (let t = 0; t < s; t += 1 / 60) {
    sim.paso(1 / 60);
    alPaso?.();
  }
};

describe('Mapa en reposo', () => {
  it('solo se ven la plaza y los puntos usados; ningún gris', () => {
    const red = redPequena(); // 0 y 1 bases, 2 intermedio, 3 cima
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    expect([0, 1, 2, 3].map((i) => vistaPunto(red, i, null, false).tipo)).toEqual(['completo', 'completo', 'oculto', 'completo']);
  });
});

describe('Pistas en espera', () => {
  it('hacia un punto gris sin salida se crea en espera: no lleva esquiadores, no hace viable el destino ni pone en servicio el remonte', () => {
    const red = redPequena();
    const r = red.construirRemonte(0, 3);
    const { pista, espera } = abrirEvaluada(red, 3, 2); // 2: gris, sin salida
    expect(espera).toBe(true);
    expect(red.pistaActiva(pista)).toBe(false);
    expect(red.viable(2)).toBe(false);
    expect(red.enServicio(r)).toBe(false); // la única pista desde 3 está en espera
    // El destino queda visible, como futura base.
    expect(vistaPunto(red, 2, null, false).tipo).toBe('completo');
    expect(red.puedeArrancar(2)).toBe(true);
  });

  it('nadie entra en una pista en espera', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    const { pista } = abrirEvaluada(red, 3, 2);
    const sim = new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(1));
    let enEspera = 0;
    correr(sim, 180, () => sim.esquiadores.forEach((e) => e.estado === 'pista' && e.pista === pista.id && enEspera++));
    expect(sim.bajadasCompletadas).toBeGreaterThan(10);
    expect(enEspera).toBe(0);
  });

  it('al construir desde el punto un remonte que funcione, la pista se activa sola y los esquiadores la usan', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    const { pista } = abrirEvaluada(red, 3, 2);
    red.construirRemonte(2, 3); // de la futura base a la cima, que ya tiene bajada
    expect(red.pistaActiva(pista)).toBe(true);
    expect(red.viable(2)).toBe(true);
    const sim = new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(2));
    let usos = 0;
    correr(sim, 240, () => sim.esquiadores.forEach((e) => e.estado === 'pista' && e.pista === pista.id && usos++));
    expect(usos).toBeGreaterThan(0);
  });

  it('deshacer va en orden: quitar el remonte devuelve la pista a espera; después se quita la pista', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    const { pista } = abrirEvaluada(red, 3, 2);
    red.construirRemonte(2, 3);
    expect(red.pistaActiva(pista)).toBe(true);
    expect(red.deshacer()).toMatchObject({ tipo: 'remonte' });
    expect(red.pistaActiva(pista)).toBe(false);
    expect(red.deshacer()).toMatchObject({ tipo: 'pista', pista: { id: pista.id } });
    expect(red.pistas).toHaveLength(1);
  });
});

describe('Pistas provisionales encadenadas', () => {
  /** Plaza 0, cima 1 (A), y dos puntos grises: G a media ladera y H más abajo, a un lado. */
  function ladera(): Red {
    const r = new Red(
      [
        { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
        { id: 1, tipo: 'cima', x: 0, y: 0, cota: 2400 },
        { id: 2, tipo: 'intermedio', x: 700, y: 1000, cota: 2100 },
        { id: 3, tipo: 'intermedio', x: 1100, y: 2000, cota: 1800 },
      ],
      { ...REGLAS, pista: { ...REGLAS.pista } },
    );
    r.construirRemonte(0, 1);
    abrir(r, 1, 0);
    return r;
  }

  it('desde el final de una pista en espera sale otra; al enlazar el final con un remonte conectado, funcionan todas', () => {
    const red = ladera();
    const { pista: aG } = abrirEvaluada(red, 1, 2); // A → G, en espera
    expect(red.activo(2)).toBe(true); // de G pueden salir pistas aunque solo le llegue una en espera
    const { pista: gH, espera } = abrirEvaluada(red, 2, 3); // G → H, también en espera
    expect(espera).toBe(true);
    expect([red.pistaActiva(aG), red.pistaActiva(gH)]).toEqual([false, false]);
    expect(red.puedeArrancar(3)).toBe(true); // el final de la cadena puede enlazarse
    red.construirRemonte(3, 1); // H → A, que tiene bajada a la plaza
    expect([red.pistaActiva(aG), red.pistaActiva(gH)]).toEqual([true, true]);
    const sim = new Simulacion(red, P, { x: 0, y: 3100 }, crearAzar(4));
    const usadas = new Set<number>();
    correr(sim, 300, () => sim.esquiadores.forEach((e) => e.estado === 'pista' && usadas.add(e.pista)));
    expect(usadas.has(aG.id) && usadas.has(gH.id)).toBe(true);
  });
});

describe('Colonizar el valle norte de «Gran dominio»: cima → pista en espera → remonte desde el punto', () => {
  it('funciona de principio a fin', () => {
    const { datos, alturas } = cargarMapaPrueba('gran-dominio');
    const red = new Red(crearNodos(alturas, datos.nodos), {
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
    const plaza = red.nodos.find((n) => n.tipo === 'base' && n.x === 2000)!;
    const cima = red.nodos.find((n) => n.tipo === 'cima' && n.x === 2100)!;
    red.construirRemonte(plaza.id, cima.id);
    abrirEvaluada(red, cima.id, plaza.id);
    // Un punto del valle norte, gris y sin salida, al que cabe una pista desde la cima.
    const destino = red.nodos.filter((n) => n.y < 1000).find((n) => evaluarPista(red, cima.id, n.id).motivo === 'ok')!;
    expect(destino).toBeDefined();
    const { pista, espera } = abrirEvaluada(red, cima.id, destino.id);
    expect(espera).toBe(true);
    expect(red.pistaActiva(pista)).toBe(false);
    expect(red.puedeConstruirRemonte(destino.id, cima.id)).toBe('ok');
    red.construirRemonte(destino.id, cima.id);
    expect(red.pistaActiva(pista)).toBe(true);
    expect(red.viable(destino.id)).toBe(true);
  });
});
