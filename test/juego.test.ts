import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { crearAzar } from '../src/core/azar';
import { pistasCruzadas } from '../src/core/confluencia';
import { desplazamientoPista } from '../src/core/desplazamiento';
import { Juego } from '../src/juego';
import { mapaInicial } from './apoyo';

describe('Juego: arrastre y velocidad', () => {
  it('el segundo remonte a una cima desdobla la estación y se puede arrastrar desde la base desdoblada', () => {
    const j = new Juego(mapaInicial());
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
    const j = new Juego(mapaInicial());
    const vistas = [j.velocidad];
    for (let i = 0; i < 3; i++) {
      j.cambiarVelocidad();
      vistas.push(j.velocidad);
    }
    expect(vistas).toEqual([1, 2, 4, 1]);
  });

  it('arrastrar de una llegada hacia un punto más bajo abre el selector y elegir color abre la pista', () => {
    const j = new Juego(mapaInicial());
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.empezarArrastre(base, 10);
    j.moverArrastre(cima, 10);
    j.soltarArrastre();
    expect(j.red.remontes).toHaveLength(1);
    // Ahora, de la cima hacia la base: pista.
    j.empezarArrastre(cima, 10);
    j.moverArrastre(base, 10);
    expect(j.arrastre?.objetivo).toMatchObject({ nodo: base.id, tipo: 'pista', motivo: 'ok' });
    j.soltarArrastre();
    expect(j.selector?.proyecto).toMatchObject({ desde: cima.id, hasta: base.id });
    const color = j.selector!.colores.find((c) => c.factible)!.color;
    const lado = j.selector!.proyecto.lado;
    j.elegirColor(color);
    expect(j.red.pistas).toHaveLength(1);
    expect(j.red.pistas[0]).toMatchObject({ desde: cima.id, hasta: base.id, lado, color });
    expect(j.red.enServicio(j.red.remontes[0])).toBe(true);
  });

  it('si la pista no cabe, avisa de por qué y no abre el selector', () => {
    const j = new Juego(mapaInicial());
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    // Sin remonte a la cima: de ella no puede salir ninguna pista.
    j.empezarArrastre(base, 10);
    j.moverArrastre(cima, 10);
    j.soltarArrastre();
    const otraBase = j.red.nodos.filter((n) => n.tipo === 'base')[1];
    j.red.deshacer();
    j.proponerPista(cima.id, otraBase.id);
    expect(j.selector).toBeNull();
    expect(j.mensaje?.texto).toMatch(/remonte/);
  });

  it('tocar un punto sin arrastrar recuerda cómo se hacen remontes y pistas', () => {
    const j = new Juego(mapaInicial());
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    j.empezarArrastre(base, 10);
    j.soltarArrastre();
    expect(j.mensaje?.texto).toMatch(/más alto.*más bajo/);
  });

  it('en modo ajustes, tocar una pista abierta muestra sus datos; fuera de él, no', () => {
    const j = new Juego(mapaInicial());
    const base = j.red.nodos.find((n) => n.tipo === 'base')!;
    const cima = j.red.nodos.find((n) => n.tipo === 'cima')!;
    j.red.construirRemonte(base.id, cima.id);
    const lado = j.red.ladoLibre(cima.id, base.id)!;
    const color = j.red.colores(cima.id, base.id, lado).find((c) => c.factible)!.color;
    const p = j.red.abrirPista(cima.id, base.id, color, lado);
    const punto = p.trazado.puntoEn(p.trazado.longitud * 0.5);
    j.tocar(punto, 5);
    expect(j.infoPista).toBeNull();
    j.modoAjustes = true;
    j.tocar(punto, 5);
    expect(j.infoPista?.pista).toBe(p.id);
  });

  it('ninguna pista que cabe cruza, sin unirse, más pistas que el máximo, aunque se vaya llenando la estación', () => {
    const j = new Juego(mapaInicial());
    const bases = j.red.nodos.filter((n) => n.tipo === 'base');
    const altos = j.red.nodos.filter((n) => n.tipo !== 'base');
    // Unos cuantos remontes desde las bases y luego abrir proyectos uno a uno.
    for (const b of bases) for (const a of altos) if (j.red.puedeConstruirRemonte(b.id, a.id) === 'ok') j.red.construirRemonte(b.id, a.id);
    const n = j.red.nodos.length;
    for (let i = 0; i < 12; i++) {
      const ps = [];
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const e = j.evaluarPista(a, b);
          if (e.motivo === 'ok') ps.push({ ...e.proyecto, colores: e.colores });
        }
      }
      const existentes = j.red.pistas.map((q) => ({
        id: q.id,
        hasta: q.hasta,
        trazado: q.trazado,
        cotaDesde: j.red.nodo(q.desde).cota,
        cotaHasta: j.red.nodo(q.hasta).cota,
        compartido: q.compartido,
      }));
      const rp = j.red.reglas.pista;
      for (const p of ps) expect(pistasCruzadas(j.trazadoProyecto(p), existentes, rp.margenConfluencia, rp.radioAcuerdo)).toBeLessThanOrEqual(rp.maxCrucesPistas);
      if (ps.length === 0) continue;
      const p = ps[i % ps.length];
      const c = p.colores.find((x) => x.factible)!;
      j.red.abrirPista(p.desde, p.hasta, c.color, p.lado, c.giro);
    }
    expect(j.red.pistas.length).toBeGreaterThan(0);
  });

  it('estaciones al azar: ninguna pista unida queda suelta', () => {
    const P = { separacionPx: CONFIG.estaciones.separacionPx, tramoEstacion: CONFIG.pista.tramoEstacion, radioAcuerdo: CONFIG.pista.radioAcuerdo };
    const ESC = 0.168;
    let uniones = 0;
    for (let semilla = 1; semilla <= 12; semilla++) {
      const az = crearAzar(semilla);
      const j = new Juego(mapaInicial());
      const red = j.red;
      const n = red.nodos.length;
      for (let k = 0; k < 40; k++) {
        if (az() < 0.4) {
          const a = Math.floor(az() * n);
          const b = Math.floor(az() * n);
          if (red.puedeConstruirRemonte(a, b) === 'ok') red.construirRemonte(a, b);
          continue;
        }
        const e = j.evaluarPista(Math.floor(az() * n), Math.floor(az() * n));
        if (e.motivo !== 'ok') continue;
        const cs = e.colores.filter((c) => c.factible);
        expect(cs.length).toBeGreaterThan(0);
        const c = cs[Math.floor(az() * cs.length)];
        red.abrirPista(e.proyecto.desde, e.proyecto.hasta, c.color, e.proyecto.lado, c.giro);
      }
      // Ninguna pista unida queda suelta: su línea dibujada empalma con la de la otra.
      for (const pi of red.pistas) {
        const c = pi.compartido;
        if (!c) continue;
        uniones++;
        const otra = red.pistas[c.pista];
        const f = desplazamientoPista(red, pi, P);
        const g = desplazamientoPista(red, otra, P);
        for (const [s, so] of [
          [c.inicio, c.inicioPista],
          [c.fin, c.inicioPista + c.fin - c.inicio],
        ]) {
          const a = pi.trazado.puntoEn(s);
          const b = otra.trazado.puntoEn(so);
          const da = f(s);
          const db = g(so);
          expect(Math.hypot(a.x * ESC + da.x - b.x * ESC - db.x, a.y * ESC + da.y - b.y * ESC - db.y)).toBeLessThan(1);
        }
      }
    }
    expect(uniones).toBeGreaterThan(0);
  }, 20_000); // es lenta: construye 12 estaciones al azar con su salida orientada
});
