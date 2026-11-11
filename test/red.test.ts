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

  it('cada emplazamiento empieza con una estación según su tipo', () => {
    const red = redPequena();
    expect(red.estaciones.map((e) => e.tipo)).toEqual(['salida', 'salida', 'paso', 'llegada']);
  });

  it('una base se desdobla en nuevas salidas, una por remonte', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(0, 3);
    const est = red.estacionesDe(0);
    expect(est.map((e) => e.tipo)).toEqual(['salida', 'salida']);
    expect(Math.hypot(est[1].ox, est[1].oy)).toBeCloseTo(1, 10);
  });

  it('a una cima llegan hasta tres remontes, cada uno a su triángulo', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(2, 3);
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 3);
    const est = red.estacionesDe(3);
    expect(est.map((e) => e.tipo)).toEqual(['llegada', 'llegada', 'llegada']);
    const posiciones = new Set(est.map((e) => `${e.ox.toFixed(3)},${e.oy.toFixed(3)}`));
    expect(posiciones.size).toBe(3);
    expect(new Set(red.remontes.filter((r) => r.hasta === 3).map((r) => r.estacionHasta)).size).toBe(3);
  });

  it('el triángulo nuevo se pega por el lado del que llega la línea', () => {
    const red = redPequena();
    red.construirRemonte(0, 3); // llega desde abajo a la izquierda
    red.construirRemonte(1, 3); // llega desde abajo a la derecha
    expect(red.estacionesDe(3)[1].ox).toBeGreaterThan(0);
    const otra = redPequena();
    otra.construirRemonte(1, 3);
    otra.construirRemonte(0, 3);
    expect(otra.estacionesDe(3)[1].ox).toBeLessThan(0);
  });

  it('un intermedio es de paso y se desdobla solo como salida o llegada', () => {
    const red = redPequena();
    red.construirRemonte(0, 2); // llega al cuadrado
    red.construirRemonte(2, 3); // sale del cuadrado
    red.construirRemonte(1, 2); // segunda llegada: triángulo nuevo
    expect(red.estacionesDe(2).map((e) => e.tipo)).toEqual(['paso', 'llegada']);
  });

  it('cuando el emplazamiento llega al máximo de estaciones se rechaza', () => {
    const red = new Red(redPequena().nodos.map((n) => ({ ...n })), { ...REGLAS, maxEstacionesPorNodo: 1 });
    red.construirRemonte(0, 2);
    expect(red.puedeConstruirRemonte(0, 3)).toBe('origen-lleno');
    expect(red.puedeConstruirRemonte(1, 2)).toBe('destino-lleno');
  });

  it('planear no modifica la red', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    expect(red.planearEstacion(1, 'llegada', 3)).not.toBeNull();
    red.puedeConstruirRemonte(1, 3);
    expect(red.estaciones.length).toBe(4);
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

  it('un remonte que pasa por un intermedio funciona entero con una pista arriba', () => {
    const red = redPequena();
    const abajo = red.construirRemonte(0, 2); // llega al cuadrado
    const arriba = red.construirRemonte(2, 3); // sale del cuadrado: misma línea
    red.abrirPista(3, 1);
    expect(red.enServicio(arriba)).toBe(true);
    expect(red.enServicio(abajo)).toBe(true);
  });

  it('un tramo que solo llega a un desdoble del intermedio no se activa por el de arriba', () => {
    const red = redPequena();
    red.construirRemonte(0, 2); // cuadrado: llegada
    red.construirRemonte(2, 3); // cuadrado: salida
    const otro = red.construirRemonte(1, 2); // triángulo de desdoble
    red.abrirPista(3, 0);
    expect(red.estaciones[otro.estacionHasta].tipo).toBe('llegada');
    expect(red.enServicio(otro)).toBe(false);
  });

  it('un remonte que llega a una cima que ya tiene pistas funciona desde el principio', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.abrirPista(3, 0);
    const nuevo = red.construirRemonte(1, 3);
    expect(red.enServicio(nuevo)).toBe(true);
  });
});
