// Fase 4: disposición del menú en distintas pantallas y modo para daltonismo.
import { describe, expect, it } from 'vitest';
import { disponerMenu } from '../src/menu';
import { ponerDaltonismo, preferencias } from '../src/preferencias';
import { aplicarPaleta, COLOR_PISTA } from '../src/render/escena';
import type { Rect } from '../src/render/interfaz';

const seSolapan = (a: Rect, b: Rect) => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;

describe('Disposición del menú', () => {
  for (const [nombre, ancho, alto] of [
    ['móvil en vertical', 412, 915],
    ['móvil pequeño en vertical', 360, 640],
    ['móvil en horizontal', 915, 412],
    ['móvil pequeño en horizontal', 640, 360],
    ['tableta', 1024, 768],
  ] as const) {
    it(`${nombre} (${ancho}×${alto}): título, tarjeta y ajustes caben sin pisarse`, () => {
      const d = disponerMenu(ancho, alto);
      const tarjeta: Rect = { x: ancho / 2 - d.tarjeta.ancho / 2, y: d.tarjeta.y, ancho: d.tarjeta.ancho, alto: d.tarjeta.alto };
      const titulo: Rect = { x: 0, y: d.titulo.cy - d.titulo.alto / 2, ancho, alto: d.titulo.alto };
      const botones = [d.ajustes.sonido, d.ajustes.daltonismo, d.ajustes.reiniciar];
      expect(titulo.y).toBeGreaterThanOrEqual(0);
      expect(seSolapan(titulo, tarjeta)).toBe(false);
      expect(tarjeta.x).toBeGreaterThan(0);
      expect(tarjeta.x + tarjeta.ancho).toBeLessThan(ancho);
      expect(d.tarjeta.alto).toBeGreaterThanOrEqual(170);
      expect(d.puntosY).toBeGreaterThan(tarjeta.y + tarjeta.alto);
      for (const b of botones) {
        expect(seSolapan(b, tarjeta)).toBe(false);
        expect(b.y).toBeGreaterThan(d.puntosY);
        expect(b.y + b.alto + (d.ajustes.etiquetas ? 22 : 0)).toBeLessThanOrEqual(alto);
        expect(b.ancho).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.ancho).toBeLessThanOrEqual(ancho);
      }
      for (let i = 0; i < 3; i++) for (let k = i + 1; k < 3; k++) expect(seSolapan(botones[i], botones[k])).toBe(false);
      // La tarjeta siguiente asoma por el borde: se ve que hay más.
      expect(ancho / 2 + d.tarjeta.paso - d.tarjeta.ancho / 2).toBeLessThan(ancho);
    });
  }
});

describe('Modo para daltonismo', () => {
  it('cambia la paleta y se puede volver a la normal', () => {
    const normal = { ...COLOR_PISTA };
    ponerDaltonismo(true);
    aplicarPaleta();
    expect(preferencias.daltonismo).toBe(true);
    expect(COLOR_PISTA.verde).not.toBe(normal.verde);
    expect(COLOR_PISTA.roja).not.toBe(normal.roja);
    expect(new Set(Object.values(COLOR_PISTA)).size).toBe(4);
    ponerDaltonismo(false);
    aplicarPaleta();
    expect(COLOR_PISTA).toEqual(normal);
  });
});
