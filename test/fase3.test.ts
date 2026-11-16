// Fase 3 del acabado: niveles como datos (índice y carpetas), parámetros por
// nivel, retos y progreso.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodificarPngGris } from '../scripts/png';
import { CONFIG } from '../src/config';
import { alturasDesdeGris } from '../src/core/mapa';
import { aplicarParametros, leerIndice, leerNivel } from '../src/core/nivel';
import { leerRetos, retoConseguido, textoReto, TIPOS_DE_RETO, type ResumenPartida, type Reto } from '../src/core/retos';
import { Juego } from '../src/juego';
import { evaluarPartida, type ProgresoNivel } from '../src/progreso';
import { mapaInicial } from './apoyo';

const indice = leerIndice(JSON.parse(readFileSync('niveles/indice.json', 'utf8')));

describe('Niveles desde datos', () => {
  it('el índice tiene al menos un nivel jugable y los bloqueados no necesitan carpeta', () => {
    expect(indice.some((n) => !n.bloqueado)).toBe(true);
    expect(new Set(indice.map((n) => n.id)).size).toBe(indice.length);
  });

  for (const entrada of indice.filter((n) => !n.bloqueado)) {
    describe(`nivel «${entrada.id}»`, () => {
      const carpeta = `niveles/${entrada.id}`;
      it('tiene sus tres archivos', () => {
        for (const f of ['nivel.json', 'alturas.png', 'miniatura.png']) expect(existsSync(`${carpeta}/${f}`), f).toBe(true);
      });

      it('su JSON es válido y se puede montar una partida con él', () => {
        const nivel = leerNivel(JSON.parse(readFileSync(`${carpeta}/nivel.json`, 'utf8')));
        const png = decodificarPngGris(readFileSync(`${carpeta}/alturas.png`));
        const alturas = alturasDesdeGris(nivel.mapa, png.ancho, png.alto, png.gris);
        const j = new Juego({ datos: nivel.mapa, alturas }, 1, nivel.parametros);
        expect(j.red.nodos.length).toBe(nivel.mapa.nodos.length);
        // Hay bases, cada una con algún punto más alto, y ningún punto dentro de la plaza.
        const bases = j.red.nodos.filter((n) => n.tipo === 'base');
        expect(bases.length).toBeGreaterThan(0);
        for (const b of bases) expect(j.red.nodos.some((n) => n.cota > b.cota + j.config.remonte.desnivelMinimo)).toBe(true);
        for (const n of j.red.nodos) expect(Math.hypot(n.x - nivel.mapa.plaza.x, n.y - nivel.mapa.plaza.y)).toBeGreaterThan(nivel.mapa.plaza.radio);
        // Se puede empezar: desde alguna base hay un remonte que se puede pagar y construir.
        const hay = bases.some((b) => j.red.nodos.some((d) => d.cota > b.cota && j.precioRemonteEntre(b.id, d.id) <= j.monedas && j.red.puedeConstruirRemonte(b.id, d.id) === 'ok'));
        expect(hay).toBe(true);
      });

      it('tiene tres retos válidos', () => {
        const nivel = leerNivel(JSON.parse(readFileSync(`${carpeta}/nivel.json`, 'utf8')));
        expect(nivel.retos).toHaveLength(3);
        for (const r of nivel.retos) expect(textoReto(r).length).toBeGreaterThan(5);
      });

      it('la miniatura es un PNG', () => {
        const mini = decodificarPngGris(readFileSync(`${carpeta}/miniatura.png`));
        expect(mini.ancho).toBeGreaterThan(50);
        expect(mini.alto).toBeGreaterThan(50);
      });
    });
  }

  it('un nivel mal escrito se rechaza diciendo por qué', () => {
    const base = { ancho: 1000, alto: 1000, cotaMin: 0, cotaMax: 100, plaza: { x: 500, y: 900, radio: 50 }, nodos: [{ tipo: 'base', x: 400, y: 800 }] };
    expect(leerNivel(base).retos).toEqual([]);
    expect(leerNivel(base).parametros).toEqual({});
    expect(() => leerNivel({ ...base, formato: 99 })).toThrow(/formato 99/);
    expect(() => leerNivel({ ...base, nodos: [{ tipo: 'base', x: 5000, y: 0 }] })).toThrow(/fuera del mapa/);
    expect(() => leerNivel({ ...base, nodos: [{ tipo: 'intermedio', x: 10, y: 10 }] })).toThrow(/al menos una base/);
    expect(() => leerNivel({ ...base, parametros: [] })).toThrow(/parametros/);
    expect(() => leerNivel({ ...base, retos: [{ tipo: 'volar', n: 3 }] })).toThrow(/tipo desconocido/);
    expect(() => leerNivel({ ...base, retos: [{ tipo: 'dias' }] })).toThrow(/n positivo/);
  });

  it('el índice se valida: ids correctos, sin repetir y con algún nivel jugable', () => {
    expect(leerIndice({ niveles: [{ id: 'a' }, { id: 'b', bloqueado: true, nombre: 'Otro' }] })).toEqual([
      { id: 'a', bloqueado: false, nombre: undefined },
      { id: 'b', bloqueado: true, nombre: 'Otro' },
    ]);
    expect(() => leerIndice({})).toThrow(/niveles/);
    expect(() => leerIndice({ niveles: [{ id: 'Con Espacios' }] })).toThrow(/id/);
    expect(() => leerIndice({ niveles: [{ id: 'a' }, { id: 'a' }] })).toThrow(/repetido/);
    expect(() => leerIndice({ niveles: [{ id: 'a', bloqueado: true }] })).toThrow(/jugable/);
  });
});

describe('Parámetros por nivel', () => {
  it('se mezclan sobre una copia de la configuración, sin tocar la original', () => {
    const c = aplicarParametros(CONFIG, { economia: { monedasIniciales: 999, mantenimiento: { porMetroYMinuto: 0.5 } }, afluencia: { mezcla: [{ minuto: 0, pesos: [1, 0, 0, 0] }] } });
    expect(c.economia.monedasIniciales).toBe(999);
    expect(c.economia.mantenimiento.porMetroYMinuto).toBe(0.5);
    expect(c.economia.mantenimiento.factorPorTipo).toEqual(CONFIG.economia.mantenimiento.factorPorTipo);
    expect(c.economia.precioPorMetro).toBe(CONFIG.economia.precioPorMetro);
    expect(c.afluencia.mezcla).toHaveLength(1);
    expect(CONFIG.economia.monedasIniciales).not.toBe(999);
    expect(c.economia).not.toBe(CONFIG.economia);
  });

  it('una clave que no existe es un error', () => {
    expect(() => aplicarParametros(CONFIG, { economia: { monedasInicales: 5 } })).toThrow(/parametros\.economia\.monedasInicales/);
    expect(() => aplicarParametros(CONFIG, { economia: 5 })).toThrow(/bloque/);
  });

  it('la partida usa los parámetros del nivel', () => {
    const j = new Juego(mapaInicial(), 1, { economia: { monedasIniciales: 777 }, dia: { duracion: 100 } });
    expect(j.monedas).toBe(777);
    j.sim.tiempoAbierta = 250;
    expect(j.dia).toBe(3);
    expect(new Juego(mapaInicial()).monedas).toBe(CONFIG.economia.monedasIniciales);
  });
});

describe('Retos', () => {
  const R: ResumenPartida = { dias: 6.4, satisfechos: 500, enfadados: 40, bajadasNegros: 120, maxRemontes: 9, maxTelecabinas: 1, pistasForzadas: 0 };

  it('cada tipo se comprueba con el resumen de la partida', () => {
    const casos: [Reto, boolean][] = [
      [{ tipo: 'dias', n: 6 }, true],
      [{ tipo: 'dias', n: 7 }, false],
      [{ tipo: 'satisfechos', n: 500 }, true],
      [{ tipo: 'satisfechos', n: 501 }, false],
      [{ tipo: 'bajadasNegros', n: 100 }, true],
      [{ tipo: 'bajadasNegros', n: 121 }, false],
      [{ tipo: 'sinTelecabinas' }, false],
      [{ tipo: 'maxRemontes', n: 9 }, true],
      [{ tipo: 'maxRemontes', n: 8 }, false],
      [{ tipo: 'maxRemontes', n: 9, dias: 7 }, false],
      [{ tipo: 'sinForzadas', dias: 6 }, true],
      [{ tipo: 'sinForzadas', dias: 7 }, false],
    ];
    for (const [reto, esperado] of casos) expect(retoConseguido(reto, R), JSON.stringify(reto)).toBe(esperado);
    expect(retoConseguido({ tipo: 'sinTelecabinas', dias: 5 }, { ...R, maxTelecabinas: 0 })).toBe(true);
    expect(retoConseguido({ tipo: 'sinForzadas' }, { ...R, pistasForzadas: 2 })).toBe(false);
    // Sin construir nada no se cumple «máximo de N remontes».
    expect(retoConseguido({ tipo: 'maxRemontes', n: 5 }, { ...R, maxRemontes: 0 })).toBe(false);
  });

  it('todos los tipos tienen texto y se leen del JSON', () => {
    const json = [
      { tipo: 'dias', n: 1 },
      { tipo: 'satisfechos', n: 300 },
      { tipo: 'bajadasNegros', n: 50 },
      { tipo: 'sinTelecabinas', dias: 5 },
      { tipo: 'maxRemontes', n: 8, dias: 6 },
      { tipo: 'sinForzadas' },
    ];
    const retos = leerRetos(json);
    expect(retos.map((r) => r.tipo)).toEqual([...TIPOS_DE_RETO]);
    expect(retos.map(textoReto)).toEqual(['Sobrevive 1 día', '300 esquiadores satisfechos', '50 bajadas de negros', '5 días sin telecabinas', '6 días con 8 remontes como máximo', 'Sin pistas forzadas']);
    expect(leerRetos(undefined)).toEqual([]);
    expect(() => leerRetos({})).toThrow(/lista/);
    expect(() => leerRetos([{ tipo: 'maxRemontes', n: 3, dias: -1 }])).toThrow(/dias positivo/);
  });

  it('el resumen de una partida sale del juego', () => {
    const j = new Juego(mapaInicial());
    j.sim.monedas = 1e6;
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const destino = j.red.nodos.find((n) => n.cota > base.cota && j.red.puedeConstruirRemonte(base.id, n.id) === 'ok')!;
    j.construirRemonte(base.id, destino.id);
    j.mejorarRemonte(0);
    j.mejorarRemonte(0);
    j.paso(1 / 60);
    // Deshacer no borra el máximo alcanzado.
    j.deshacer();
    const r = j.resumen();
    expect(r.maxRemontes).toBe(1);
    expect(r.maxTelecabinas).toBe(1);
    expect(r.pistasForzadas).toBe(0);
    expect(r.dias).toBe(0);
  });
});

describe('Progreso', () => {
  const retos: Reto[] = [{ tipo: 'dias', n: 4 }, { tipo: 'satisfechos', n: 600 }, { tipo: 'bajadasNegros', n: 1000 }];
  const partida = (dias: number, satisfechos: number): ResumenPartida => ({ dias, satisfechos, enfadados: 30, bajadasNegros: 10, maxRemontes: 5, maxTelecabinas: 0, pistasForzadas: 0 });
  const vacio: ProgresoNivel = { record: null, retos: [], partidas: 0 };

  it('la primera partida fija el récord y marca los retos conseguidos', () => {
    const { datos, nuevo } = evaluarPartida(vacio, partida(5.7, 200), retos);
    expect(datos.esRecord).toBe(true);
    expect(datos.recordAnterior).toBeNull();
    expect(datos.retos.map((r) => r.conseguido)).toEqual([true, false, false]);
    expect(nuevo).toEqual({ record: 5, retos: [true, false, false], partidas: 1 });
  });

  it('los retos conseguidos no se pierden y el récord solo sube', () => {
    const previo: ProgresoNivel = { record: 5, retos: [true, false, false], partidas: 1 };
    const peor = evaluarPartida(previo, partida(2.2, 700), retos);
    expect(peor.datos.esRecord).toBe(false);
    expect(peor.datos.recordAnterior).toBe(5);
    expect(peor.datos.retos.map((r) => [r.conseguido, r.antes])).toEqual([[false, true], [true, false], [false, false]]);
    expect(peor.nuevo).toEqual({ record: 5, retos: [true, true, false], partidas: 2 });
    const mejor = evaluarPartida(peor.nuevo, partida(8.9, 100), retos);
    expect(mejor.datos.esRecord).toBe(true);
    expect(mejor.nuevo.record).toBe(8);
    // Igualar el récord no es récord.
    expect(evaluarPartida(mejor.nuevo, partida(8.1, 100), retos).datos.esRecord).toBe(false);
  });

  it('una partida de cero días no es récord', () => {
    expect(evaluarPartida(vacio, partida(0.4, 0), retos).datos.esRecord).toBe(false);
  });
});
