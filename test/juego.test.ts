import { describe, expect, it } from 'vitest';
import { Juego } from '../src/juego';

describe('Juego: arrastre y velocidad', () => {
  it('el segundo remonte a una cima desdobla la estación y se puede arrastrar desde la base desdoblada', () => {
    const j = new Juego();
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    for (const b of bases.slice(0, 2)) {
      j.empezarArrastre(b, 10);
      j.moverArrastre(cima, 10);
      j.soltarArrastre();
    }
    expect(j.red.estacionesDe(cima.id).length).toBe(2);
    // Desde la base, el dedo sobre la estación nueva cuenta como esa base.
    j.empezarArrastre(bases[0], 10);
    j.moverArrastre(j.red.nodos.find((n) => n.tipo === 'intermedio')!, 10);
    j.soltarArrastre();
    const nueva = j.red.estacionesDe(bases[0].id)[1];
    const sep = 150;
    expect(j.nodoEn(j.posicionEstacion(nueva, sep), 40, sep)).toBe(bases[0].id);
  });

  it('la velocidad cicla entre 1×, 2× y 4×', () => {
    const j = new Juego();
    const vistas = [j.velocidad];
    for (let i = 0; i < 3; i++) {
      j.cambiarVelocidad();
      vistas.push(j.velocidad);
    }
    expect(vistas).toEqual([1, 2, 4, 1]);
  });

  it('tocar un proyecto abre el selector y elegir color abre la pista', () => {
    const j = new Juego();
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.empezarArrastre(base, 10);
    j.moverArrastre(cima, 10);
    j.soltarArrastre();
    const proyectos = j.proyectosVisibles();
    expect(proyectos.length).toBeGreaterThan(0);
    const pr = proyectos[0];
    const t = j.trazadoProyecto(pr).trazado;
    j.tocar(t.puntoEn(t.longitud / 2), 5);
    expect(j.selector?.proyecto).toEqual(pr);
    const color = j.selector!.colores.find((c) => c.factible)!.color;
    j.elegirColor(color);
    expect(j.red.pistas).toHaveLength(1);
    expect(j.red.pistas[0]).toMatchObject({ desde: pr.desde, hasta: pr.hasta, lado: pr.lado, color });
    expect(j.red.enServicio(j.red.remontes[0])).toBe(true);
  });

  it('tocar un nodo sin arrastrar muestra sus proyectos; tocar el vacío los oculta', () => {
    const j = new Juego();
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.red.construirRemonte(base.id, cima.id);
    j.empezarArrastre(cima, 10);
    j.soltarArrastre();
    expect(j.foco).toEqual({ tipo: 'nodo', id: cima.id });
    j.tocar({ x: 5, y: 5 }, 5);
    expect(j.foco).toBeNull();
  });

  it('en modo ajustes, tocar una pista abierta muestra sus datos; fuera de él, no', () => {
    const j = new Juego();
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.red.construirRemonte(base.id, cima.id);
    const lado = j.red.ladoLibre(cima.id, base.id)!;
    const color = j.red.colores(cima.id, base.id, lado).find((c) => c.factible)!.color;
    const p = j.red.abrirPista(cima.id, base.id, color, lado);
    j.foco = null;
    const punto = p.trazado.puntoEn(p.trazado.longitud * 0.5);
    j.tocar(punto, 5);
    expect(j.infoPista).toBeNull();
    j.modoAjustes = true;
    j.tocar(punto, 5);
    expect(j.infoPista?.pista).toBe(p.id);
  });

  it('ningún proyecto propuesto corta un remonte, aunque se vaya llenando la estación', () => {
    const j = new Juego();
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    const altos = j.red.nodos.filter((n) => n.tipo !== 'base');
    // Unos cuantos remontes desde las bases y luego abrir proyectos uno a uno.
    for (const b of bases) for (const a of altos) if (j.red.puedeConstruirRemonte(b.id, a.id) === 'ok') j.red.construirRemonte(b.id, a.id);
    for (let i = 0; i < 12; i++) {
      j.foco = j.red.remontes.length ? { tipo: 'remonte', id: i % j.red.remontes.length } : null;
      const ps = j.proyectosVisibles();
      for (const p of ps) expect(j.red.crucesConRemontes(j.trazadoProyecto(p).trazado)).toBe(0);
      if (ps.length === 0) continue;
      const p = ps[0];
      const c = j.red.colores(p.desde, p.hasta, p.lado).find((x) => x.factible)!;
      j.red.abrirPista(p.desde, p.hasta, c.color, p.lado);
    }
    expect(j.red.pistas.length).toBeGreaterThan(0);
  });
});
