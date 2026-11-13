import { describe, expect, it } from 'vitest';
import { Red, type Nodo } from '../src/core/red';
import { abrir, REGLAS } from './apoyo';

/**
 * Red sintética del círculo vicioso:
 * - 0: base de la plaza (abajo); 1: cima A, con remonte desde la plaza y
 *   pista de vuelta.
 * - 2: intermedio G, gris, al que llega una pista desde A: se puede convertir
 *   en base.
 * - 3: cima C, al sureste de G. Entre C y la plaza hay un muro de roca de
 *   norte a sur (x ≈ 2100, de y = 1100 hacia abajo): desde C solo se baja a
 *   G, por el norte del muro, y G no tiene salida hasta la plaza.
 * - 4: cima D, al oeste de A, sin roca: desde ella se baja a la plaza.
 */
function red(conRoca = true): Red {
  const nodos: Nodo[] = [
    { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
    { id: 1, tipo: 'cima', x: 0, y: 0, cota: 2400 },
    { id: 2, tipo: 'intermedio', x: 1500, y: 700, cota: 1950 },
    { id: 3, tipo: 'cima', x: 3000, y: 1500, cota: 2400 },
    { id: 4, tipo: 'cima', x: -1500, y: 600, cota: 2450 },
  ];
  // Muro de roca entre C y la plaza.
  const esRoca = (p: { x: number; y: number }) => p.x > 2000 && p.x < 2200 && p.y > 1100;
  const r = new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista }, esRoca: conRoca ? esRoca : undefined });
  r.construirRemonte(0, 1);
  abrir(r, 1, 0);
  return r;
}

describe('Remontes que nunca arrancarían (círculo vicioso)', () => {
  it('reproducción: G se puede convertir en base y desde C solo se baja a G, que no tiene salida', () => {
    const r = red();
    expect(r.puedeArrancar(2)).toBe(true); // a G llega una pista desde A
    expect(r.pistaPosible(3, 2, false)).toBe(true); // de C a G cabe una pista...
    expect(r.pistaPosible(3, 0, false)).toBe(false); // de C a la plaza no (roca)
    expect(r.viable(2)).toBe(false); // ...pero G no lleva a la plaza
  });

  it('regla: no se puede construir un remonte cuya llegada no podría bajar a nada conectado con la plaza', () => {
    const r = red();
    expect(r.puedeConstruirRemonte(2, 3)).toBe('llegada-sin-bajada');
    // Sin la roca, desde C cabe una bajada a la plaza: entonces sí.
    expect(red(false).puedeConstruirRemonte(2, 3)).toBe('ok');
  });

  it('sigue permitido: un remonte paralelo a una cima que ya tiene pistas, o a otra cima con bajada', () => {
    const r = red();
    expect(r.puedeConstruirRemonte(2, 1)).toBe('ok'); // A ya tiene pista a la plaza
    expect(r.puedeConstruirRemonte(0, 4)).toBe('ok'); // D: cabe una bajada a la plaza
    expect(r.llegadaConBajada(4)).toBe(true);
    expect(r.llegadaConBajada(3)).toBe(false);
  });

  it('un punto gris solo cuenta como arrancable para mostrarlo si tendría algún destino válido', () => {
    const r = red();
    // G puede arrancar (C no vale, pero A sí).
    expect(r.tieneDestinoDeRemonte(2)).toBe(true);
    // Si A no existiera como destino (ya hay un remonte G→A... no: probamos con C sola).
    const sinA = red();
    sinA.construirRemonte(2, 1); // G ya sube a A
    expect(sinA.tieneDestinoDeRemonte(2)).toBe(true); // sigue pudiendo subir a D
  });
});
