// Editor de mapas (tools/editor): superficie, proyecto, validación, ZIP y
// mapa aleatorio; y lo que el juego lee de lo que exporta (máscara de roca,
// carretera y umbral de roca del nivel).
import { describe, expect, it } from 'vitest';
import { MASCARA, MapaAlturas } from '../src/core/alturas';
import { grisDeMascara, mascaraDesdeGris, montarMapa } from '../src/core/mapa';
import { leerNivel } from '../src/core/nivel';
import { Juego } from '../src/juego';
import { pintarTerreno } from '../src/render/terreno';
import { generarJugable, ALEATORIO_POR_DEFECTO } from '../tools/editor/aleatorio';
import { calcularRelieve, carreteraExportada, deserializar, nivelJson, pintarMascara, proyectoNuevo, rejillaDe, serializar, textoNivelJson } from '../tools/editor/proyecto';
import { aGrises, ajustarPlaca, calcularSuperficie, muestrearLinea, ruidoFractal } from '../tools/editor/superficie';
import { validarTodo } from '../tools/editor/validacion';
import { crc32, crearZip } from '../tools/editor/zip';

describe('Superficie del editor', () => {
  const puntos = [
    { x: 0, y: 0, z: 2000 },
    { x: 1000, y: 0, z: 1800 },
    { x: 0, y: 1000, z: 1500 },
    { x: 1000, y: 1000, z: 1400 },
    { x: 500, y: 400, z: 2400 },
  ];

  it('sin suavizado, la placa delgada pasa por sus puntos', () => {
    const f = ajustarPlaca(puntos, 1000, 0)!;
    for (const p of puntos) expect(f(p.x, p.y)).toBeCloseTo(p.z, 3);
  });

  it('con suavizado se aparta de los puntos pero poco, y entre puntos es continua', () => {
    const f = ajustarPlaca(puntos, 1000, 0.01)!;
    for (const p of puntos) expect(Math.abs(f(p.x, p.y) - p.z)).toBeLessThan(150);
    expect(Math.abs(f(500, 401) - f(500, 400))).toBeLessThan(2);
  });

  it('el ruido fractal es determinista por semilla y no pasa de su amplitud', () => {
    let maximo = 0;
    for (let i = 0; i < 400; i++) {
      const x = i * 37.3;
      const y = i * 11.1;
      expect(ruidoFractal(x, y, 30, 700, 7)).toBe(ruidoFractal(x, y, 30, 700, 7));
      maximo = Math.max(maximo, Math.abs(ruidoFractal(x, y, 30, 700, 7)));
    }
    expect(maximo).toBeLessThanOrEqual(30);
    expect(maximo).toBeGreaterThan(3);
    expect(ruidoFractal(123, 456, 30, 700, 7)).not.toBe(ruidoFractal(123, 456, 30, 700, 8));
  });

  it('las líneas se muestrean con sus vértices y cotas interpoladas', () => {
    const m = muestrearLinea([{ x: 0, y: 0, z: 100 }, { x: 1000, y: 0, z: 300 }], 250);
    expect(m.map((p) => p.x)).toEqual([0, 250, 500, 750, 1000]);
    expect(m[2].z).toBeCloseTo(200);
  });

  it('los grises ocupan el rango de cotas, redondeado a 10 m con margen', () => {
    const r = calcularSuperficie(puntos, { ancho: 1000, alto: 1000, resolucion: 50, suavizado: 0, rugosidad: 0, ondaRugosidad: 500, semilla: 1 });
    expect(r.columnas).toBe(21);
    const { gris, cotaMin, cotaMax } = aGrises(r);
    expect(cotaMin % 10).toBe(0);
    expect(cotaMax % 10).toBe(0);
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const z of r.z) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    expect(cotaMin).toBeLessThanOrEqual(zMin - 5);
    expect(cotaMax).toBeGreaterThanOrEqual(zMax + 5);
    expect(Math.max(...gris)).toBeGreaterThan(240);
    expect(Math.min(...gris)).toBeLessThan(15);
  });
});

describe('Proyecto del editor', () => {
  it('guardar y volver a abrir conserva puntos, líneas, nodos y máscara', () => {
    const p = proyectoNuevo();
    p.lineas.push({ tipo: 'cresta', vertices: [{ x: 100, y: 100, z: 2500 }, { x: 900, y: 200, z: 2400 }] });
    pintarMascara(p, { x: 2000, y: 3000 }, 200, MASCARA.roca);
    pintarMascara(p, { x: 1000, y: 1000 }, 100, MASCARA.esquiable);
    const q = deserializar(serializar(p));
    expect(q.puntos).toEqual(p.puntos);
    expect(q.lineas).toEqual(p.lineas);
    expect(q.nodos).toEqual(p.nodos);
    expect(Array.from(q.mascara!)).toEqual(Array.from(p.mascara!));
    expect(q.mascara!.filter((v) => v === MASCARA.roca).length).toBeGreaterThan(100);
  });

  it('nivel.json pasa la lectura del juego y la carretera acaba en el borde de la plaza', () => {
    const p = proyectoNuevo();
    p.carretera = [{ x: 3900, y: 5900 }, { x: 3000, y: 5600 }];
    const relieve = calcularRelieve(p);
    const texto = textoNivelJson(nivelJson(p, relieve));
    const nivel = leerNivel(JSON.parse(texto));
    expect(nivel.mapa.nodos.length).toBe(3);
    const c = nivel.mapa.carretera!;
    expect(c).toEqual(carreteraExportada(p));
    const fin = c[c.length - 1];
    expect(Math.hypot(fin.x - p.plaza.x, fin.y - p.plaza.y)).toBeCloseTo(p.plaza.radio, -1);
  });

  it('un umbral de roca distinto del del juego viaja en los parámetros del nivel y el juego lo usa', () => {
    const p = proyectoNuevo();
    p.umbralRoca = 0.55;
    const relieve = calcularRelieve(p);
    const nivel = leerNivel(nivelJson(p, relieve));
    expect(new Juego(relieve.mapa, 1, nivel.parametros).umbralRoca).toBe(0.55);
  });
});

describe('Máscara de roca en el juego', () => {
  function ladera(): MapaAlturas {
    // Plano suave (pendiente 0,1): sin máscara nada es roca.
    const columnas = 11;
    const filas = 11;
    const gris = new Float32Array(columnas * filas);
    for (let j = 0; j < filas; j++) for (let i = 0; i < columnas; i++) gris[j * columnas + i] = j / (filas - 1);
    return new MapaAlturas(columnas, filas, 1000, 1000, 1000, 1100, gris);
  }

  it('la máscara fuerza roca o esquiable sobre el umbral de pendiente', () => {
    const a = ladera();
    expect(a.esRoca({ x: 500, y: 500 }, 0.9)).toBe(false);
    expect(a.esRoca({ x: 500, y: 500 }, 0.05)).toBe(true);
    a.mascara = new Uint8Array(121);
    a.mascara[5 * 11 + 5] = MASCARA.roca;
    a.mascara[5 * 11 + 6] = MASCARA.esquiable;
    expect(a.esRoca({ x: 500, y: 500 }, 0.9)).toBe(true);
    expect(a.esRoca({ x: 600, y: 500 }, 0.05)).toBe(false);
    expect(a.esRoca({ x: 300, y: 500 }, 0.9)).toBe(false);
    // El render del terreno la pinta igual.
    const px = pintarTerreno(a, 0.9);
    const esRocaPintada = (i: number, j: number) => px[(j * 11 + i) * 4] !== pintarTerreno(ladera(), 0.9)[(j * 11 + i) * 4];
    expect(esRocaPintada(5, 5)).toBe(true);
    expect(esRocaPintada(3, 5)).toBe(false);
  });

  it('mascara.png ida y vuelta: negro automático, gris esquiable, blanco roca', () => {
    const m = new Uint8Array([MASCARA.auto, MASCARA.roca, MASCARA.esquiable, MASCARA.auto]);
    expect(Array.from(grisDeMascara(m))).toEqual([0, 255, 128, 0]);
    expect(Array.from(mascaraDesdeGris(2, 2, grisDeMascara(m)))).toEqual(Array.from(m));
    expect(() => mascaraDesdeGris(3, 2, grisDeMascara(m))).toThrow(/tamaño/);
  });

  it('el juego no deja trazar pistas por la roca forzada', () => {
    const p = proyectoNuevo();
    const sin = calcularRelieve(p);
    const j0 = new Juego(sin.mapa, 1, {});
    const muestra = { x: 2000, y: 3000 };
    expect(j0.red.reglas.esRoca!(muestra)).toBe(false);
    pintarMascara(p, muestra, 300, MASCARA.roca);
    const con = calcularRelieve(p);
    const datos = con.datos;
    const { columnas, filas } = rejillaDe(p);
    const mapa = montarMapa(datos, columnas, filas, con.gris, grisDeMascara(p.mascara!));
    expect(new Juego(mapa, 1, {}).red.reglas.esRoca!(muestra)).toBe(true);
  });
});

describe('Validación y mapa aleatorio', () => {
  it('un proyecto nuevo sin cimas tiene aviso grave', () => {
    const p = proyectoNuevo();
    const v = validarTodo(calcularRelieve(p).mapa, {});
    expect(v.completa).toBe(true);
    expect(v.avisos.some((a) => a.grave)).toBe(true);
  });

  it('el mapa aleatorio sale jugable: sin avisos graves, con negras y remonte asequible en cada base', () => {
    const r = generarJugable({ ...ALEATORIO_POR_DEFECTO, semilla: 3 });
    expect(r.validacion.avisos.filter((a) => a.grave)).toEqual([]);
    expect(r.validacion.porColor[3]).toBeGreaterThan(0);
    for (const precio of r.validacion.remontesBase.values()) expect(precio).not.toBeNull();
    // Y el juego lo carga desde lo que se exporta.
    const relieve = calcularRelieve(r.proyecto);
    const nivel = leerNivel(JSON.parse(textoNivelJson(nivelJson(r.proyecto, relieve))));
    const j = new Juego(relieve.mapa, 1, nivel.parametros);
    expect(j.red.nodos.length).toBe(r.proyecto.nodos.length);
  }, 30000);

  it('es determinista por semilla', () => {
    const a = generarJugable({ ...ALEATORIO_POR_DEFECTO, semilla: 5, intentos: 1 });
    const b = generarJugable({ ...ALEATORIO_POR_DEFECTO, semilla: 5, intentos: 1 });
    expect(serializar(a.proyecto)).toBe(serializar(b.proyecto));
  }, 30000);
});

describe('ZIP', () => {
  it('CRC32 de referencia', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('cabeceras y nombres correctos', () => {
    const zip = crearZip([{ nombre: 'nivel/nivel.json', datos: new TextEncoder().encode('{}') }]);
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 12, true)).toBe(1);
    expect(new TextDecoder().decode(zip.subarray(30, 30 + 16))).toBe('nivel/nivel.json');
  });
});
