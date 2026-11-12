import { describe, expect, it } from 'vitest';
import { idsIguales, idsTrasBorrar, reconstruirRed, sitioLibre, textoMapa } from '../src/core/editorMapa';
import { Red, type Nodo } from '../src/core/red';
import { abrir, REGLAS, redPequena } from './apoyo';

/** Red nueva con los nodos de `red` cambiados por `cambio` (misma copia de reglas). */
function conNodos(red: Red, cambio: (n: Nodo[]) => Nodo[]): Red {
  const nodos = cambio(red.nodos.map((n) => ({ ...n })));
  return new Red(nodos.map((n, i) => ({ ...n, id: i })), { ...REGLAS, pista: red.reglas.pista });
}

describe('Editor del mapa de pruebas', () => {
  it('rehace la misma red si el mapa no cambia', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1);
    const nueva = conNodos(red, (n) => n);
    const r = reconstruirRed(red, nueva, idsIguales(4));
    expect(r).toEqual({ hechas: 4, omitidas: 0 });
    expect(nueva.remontes.map((x) => [x.desde, x.hasta])).toEqual([[0, 3], [1, 2]]);
    expect(nueva.pistas.map((p) => [p.desde, p.hasta, p.color])).toEqual(red.pistas.map((p) => [p.desde, p.hasta, p.color]));
  });

  it('al bajar la cima por debajo de su base, omite el remonte y lo que colgaba de él', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    const nueva = conNodos(red, (n) => {
      n[3].cota = 1400;
      return n;
    });
    expect(reconstruirRed(red, nueva, idsIguales(4))).toEqual({ hechas: 0, omitidas: 2 });
  });

  it('al borrar un punto, renumera los demás y omite lo que lo usaba', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    abrir(red, 2, 0);
    red.construirRemonte(1, 3);
    abrir(red, 3, 1);
    // Se borra el 2 (intermedio): la cima pasa a ser el 2.
    const nueva = conNodos(red, (n) => n.filter((x) => x.id !== 2));
    const r = reconstruirRed(red, nueva, idsTrasBorrar(4, 2));
    expect(r).toEqual({ hechas: 2, omitidas: 2 });
    expect(nueva.remontes.map((x) => [x.desde, x.hasta])).toEqual([[1, 2]]);
    expect(nueva.pistas.map((p) => [p.desde, p.hasta])).toEqual([[2, 1]]);
  });

  it('con más desnivel la misma pista conserva su color y se alarga (o queda fuera de rango)', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const p = abrir(red, 3, 0);
    const longitud = p.trazado.longitud;
    const r0 = red.remontes[0].longitud;
    red.actualizarNodos([{ ...red.nodo(3), cota: red.nodo(3).cota + 100, y: -100 }]);
    expect(red.pistas[0].color).toBe(p.color);
    expect(red.pistas[0].fueraDeRango || red.pistas[0].trazado.longitud > longitud).toBe(true);
    expect(red.remontes[0].longitud).toBeGreaterThan(r0);
  });

  it('no deja colocar puntos fuera del mapa, en la plaza ni pegados a otro', () => {
    const def = [{ tipo: 'base' as const, x: 500, y: 500 }];
    const l = { ancho: 1000, alto: 1000, separacion: 80, obstaculo: { x: 900, y: 900, radio: 100 } };
    expect(sitioLibre(def, { x: 700, y: 500 }, l)).toBe(true);
    expect(sitioLibre(def, { x: 550, y: 500 }, l)).toBe(false);
    expect(sitioLibre(def, { x: 550, y: 500 }, l, 0)).toBe(true); // es el que se mueve
    expect(sitioLibre(def, { x: 880, y: 880 }, l)).toBe(false);
    expect(sitioLibre(def, { x: -5, y: 500 }, l)).toBe(false);
  });

  it('escribe la definición lista para pegar en mapa.ts', () => {
    expect(textoMapa([{ tipo: 'cima', x: 980.4, y: 820 }])).toBe(
      "export const MAPA_INICIAL: readonly DefinicionNodo[] = [\n  { tipo: 'cima', x: 980, y: 820 },\n];\n",
    );
  });
});
