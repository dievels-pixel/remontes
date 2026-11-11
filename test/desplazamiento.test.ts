import { describe, expect, it } from 'vitest';
import { copiarBandas } from '../src/core/colores';
import { desplazamientoPista, desplazamientoPropio } from '../src/core/desplazamiento';
import { Red, type Pista } from '../src/core/red';
import { REGLAS } from './apoyo';

const PARAMS = { separacionPx: 22, tramoEstacion: 120, radioAcuerdo: 150 };
const ESCALA = 0.168; // px por metro, como en el móvil en vertical

/**
 * Escenario del fallo: cima desdoblada, laterales de un remonte que llega a un
 * triángulo lateral (desplazadas en toda su longitud) y una pista desde un
 * intermedio que se une a una de ellas.
 */
function escenario(): { red: Red; nueva: Pista; otra: Pista } {
  const red = new Red(
    [
      { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
      { id: 1, tipo: 'base', x: 600, y: 3000, cota: 1500 },
      { id: 2, tipo: 'cima', x: 300, y: 0, cota: 2400 },
      { id: 3, tipo: 'intermedio', x: 1500, y: 1400, cota: 2000 },
    ],
    { ...REGLAS, pista: { ...REGLAS.pista, bandas: copiarBandas(REGLAS.pista.bandas) } },
  );
  const abrir = (d: number, h: number, lado?: 1 | -1) => {
    const l = lado ?? red.ladoLibre(d, h)!;
    const c = red.colores(d, h, l).filter((x) => x.factible).pop()!;
    return red.abrirPista(d, h, c.color, l);
  };
  red.construirRemonte(0, 2);
  red.construirRemonte(1, 2);
  abrir(2, 1, 1);
  abrir(2, 1, -1);
  red.construirRemonte(1, 3);
  abrir(3, 1);
  for (const lado of [-1, 1] as const) {
    const nueva = abrir(3, 0, lado);
    if (nueva.compartido && red.pistas[nueva.compartido.pista].lateral) return { red, nueva, otra: red.pistas[nueva.compartido.pista] };
    red.deshacer();
  }
  throw new Error('El escenario no produce la confluencia esperada');
}

/** Posición en pantalla (px) de un punto de la pista con su desplazamiento. */
const enPantalla = (p: Pista, s: number, f: (s: number) => { x: number; y: number }) => {
  const q = p.trazado.puntoEn(s);
  const d = f(s);
  return { x: q.x * ESCALA + d.x, y: q.y * ESCALA + d.y };
};

describe('Desplazamiento hacia las estaciones en las confluencias', () => {
  it('reproduce el fallo: con solo su desplazamiento propio, los esquiadores del tramo compartido se salen de la línea', () => {
    const { red, nueva, otra } = escenario();
    const c = nueva.compartido!;
    const propia = desplazamientoPropio(red.estacionDePista(nueva, 'salida'), red.estacionDePista(nueva, 'llegada'), nueva.trazado.longitud, nueva.lateral, PARAMS);
    const deOtra = desplazamientoPista(red, otra, PARAMS);
    let max = 0;
    for (let s = c.inicio; s <= c.fin; s += 10) {
      const a = enPantalla(nueva, s, propia);
      const b = enPantalla(otra, c.inicioPista + (s - c.inicio), deOtra);
      max = Math.max(max, Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(max).toBeGreaterThan(3);
  });

  it('en el tramo compartido, los esquiadores van exactamente sobre la línea dibujada de la otra pista', () => {
    const { red, nueva, otra } = escenario();
    const c = nueva.compartido!;
    const f = desplazamientoPista(red, nueva, PARAMS);
    const g = desplazamientoPista(red, otra, PARAMS);
    for (let s = c.inicio; s <= c.fin; s += 5) {
      const a = enPantalla(nueva, s, f);
      const b = enPantalla(otra, c.inicioPista + (s - c.inicio), g);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
    }
  });

  it('la línea de la que se une no salta al entrar ni al salir del tramo compartido', () => {
    const { red, nueva } = escenario();
    const f = desplazamientoPista(red, nueva, PARAMS);
    let anterior = enPantalla(nueva, 0, f);
    for (let s = 2; s <= nueva.trazado.longitud; s += 2) {
      const q = enPantalla(nueva, s, f);
      expect(Math.hypot(q.x - anterior.x, q.y - anterior.y)).toBeLessThan(2); // 2 m ≈ 0,34 px más el cambio de desplazamiento
      anterior = q;
    }
  });
});
