import { describe, expect, it } from 'vitest';
import { Red } from '../src/core/red';
import { REGLAS, redPequena } from './apoyo';

describe('Red: activación y reglas de construcción', () => {
  it('al empezar solo están activas las bases', () => {
    const red = redPequena();
    expect([0, 1, 2, 3].map((i) => red.activo(i))).toEqual([true, true, false, false]);
  });

  it('los remontes solo salen de nodos activos y siempre suben', () => {
    const red = redPequena();
    expect(red.puedeConstruirRemonte(2, 3)).toBe('origen-inactivo');
    expect(red.puedeConstruirRemonte(0, 1)).toBe('destino-base'); // entre bases no hay remontes
    expect(red.puedeConstruirRemonte(0, 0)).toBe('mismo-nodo');
    expect(red.puedeConstruirRemonte(0, 2)).toBe('ok');
  });

  it('construir un remonte activa el destino y no admite duplicados', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    expect(red.activo(2)).toBe(true);
    expect(red.puedeConstruirRemonte(0, 2)).toBe('ya-existe');
    expect(red.puedeConstruirRemonte(2, 3)).toBe('ok');
    red.construirRemonte(2, 3);
    expect(red.puedeConstruirRemonte(3, 2)).toBe('destino-no-mas-alto');
  });

  it('de cada nodo sale como mucho un remonte y a cada nodo llega como mucho uno', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    expect(red.puedeConstruirRemonte(0, 3)).toBe('origen-ocupado');
    expect(red.puedeConstruirRemonte(1, 2)).toBe('destino-ocupado');
    expect(red.puedeConstruirRemonte(1, 3)).toBe('ok');
    red.construirRemonte(2, 3); // el intermedio: uno llega y otro sale
    expect(red.puedeConstruirRemonte(1, 3)).toBe('destino-ocupado');
  });

  it('el remonte nace inactivo y entra en servicio con cualquier pista desde su cima', () => {
    const red = redPequena();
    const r = red.construirRemonte(0, 2);
    expect(red.enServicio(r)).toBe(false);
    red.abrirPista(2, 1); // no vuelve a su base, pero sale de su cima
    expect(red.enServicio(r)).toBe(true);
  });

  it('las pistas bajan, salen de nodos activos y no salen de bases', () => {
    const red = redPequena();
    expect(red.puedeAbrirPista(3, 0)).toBe('origen-inactivo');
    expect(red.puedeAbrirPista(1, 0)).toBe('pista-desde-base');
    red.construirRemonte(0, 2);
    expect(red.puedeAbrirPista(2, 3)).toBe('destino-no-mas-bajo');
    expect(red.puedeAbrirPista(2, 0)).toBe('ok');
  });

  it('solo se abren pistas hacia nodos viables (sin puntos ciegos)', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    // El intermedio está activo pero su único remonte saliente no existe: no es viable.
    expect(red.viable(2)).toBe(false);
    expect(red.puedeAbrirPista(3, 2)).toBe('destino-no-viable');
    red.abrirPista(2, 0);
    expect(red.viable(2)).toBe(true);
    expect(red.puedeAbrirPista(3, 2)).toBe('ok');
  });

  it('admite dos pistas por pareja, a lados opuestos (lente)', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const a = red.abrirPista(3, 0);
    const b = red.abrirPista(3, 0);
    expect(b.lado).toBe(-a.lado);
    expect(red.puedeAbrirPista(3, 0)).toBe('ya-existe');
  });

  it('la pendiente efectiva es ΔH / L con L la longitud real de la curva', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const p = red.abrirPista(3, 0);
    expect(p.pendiente).toBeCloseTo(900 / p.trazado.longitud, 10);
    const recta = Math.hypot(200, 1000);
    expect(p.trazado.longitud).toBeGreaterThan(recta);
  });

  it('entre estaciones gemelas no hay remontes ni pistas', () => {
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    nodos.push({ id: 4, tipo: 'cima', x: 350, y: 0, cota: 2460, gemelo: 3 });
    nodos[3].gemelo = 4;
    const red = new Red(nodos, REGLAS);
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 4);
    expect(red.puedeConstruirRemonte(3, 4)).toBe('gemelos');
    expect(red.puedeAbrirPista(4, 3)).toBe('gemelos');
  });
});
