// Lo que no debe romperse, comprobado sobre una partida real del jugador
// automático en cada nivel jugable: sin puntos ciegos y colores factibles.
// (La carga de niveles y los retos están en fase3.test.ts.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cargarNivelDeDisco } from '../scripts/nivelDisco';
import { ESTRATEGIAS } from '../src/bots/jugadores';
import { crearAzar } from '../src/core/azar';
import { COLORES, nivelDe } from '../src/core/colores';
import { leerIndice } from '../src/core/nivel';
import { Juego } from '../src/juego';

const TOLERANCIA = 0.012;

for (const entrada of leerIndice(JSON.parse(readFileSync('niveles/indice.json', 'utf8'))).filter((n) => !n.bloqueado)) {
  describe(`Partida en «${entrada.id}»`, () => {
    const { nivel, mapa } = cargarNivelDeDisco(`niveles/${entrada.id}`);
    const j = new Juego(mapa, 7, nivel.parametros);
    const azar = crearAzar(3);
    const memoria: Record<string, number> = {};
    const { red, sim } = j;
    /** Comprobaciones que deben cumplirse en cualquier momento de la partida. */
    const sinPuntosCiegos = () => {
      const activas = red.pistasActivas();
      for (const p of red.pistas) {
        // Una pista activa lleva a un punto con salida hasta la plaza; una en espera, no.
        expect(red.viable(p.hasta), `pista ${p.id} activa=${activas.has(p.id)}`).toBe(activas.has(p.id));
      }
      for (const r of red.remontes) {
        if (!red.enServicio(r)) continue;
        // Un remonte en servicio deja bajar: de su llegada sale una pista activa o un remonte en servicio.
        const { pistas, remontes } = red.salidas(r.hasta);
        expect(pistas.some((p) => activas.has(p.id)) || remontes.some((x) => red.enServicio(x)), `remonte ${r.id}`).toBe(true);
      }
      const viables = red.viablesPorNivel();
      for (const e of sim.esquiadores.values()) {
        const nivelEsquiador = sim.perfiles.get(e.id)!.nivel;
        if (e.estado === 'pista') {
          const p = red.pistas[e.pista];
          // Nadie baja por una pista más difícil que su nivel ni hacia un punto sin salida para él.
          expect(red.dificultad(p)).toBeLessThanOrEqual(nivelEsquiador);
          expect(viables[nivelEsquiador].has(p.hasta)).toBe(true);
        } else if (e.estado === 'cola' || e.estado === 'remonte') {
          // Nadie espera ni sube en un remonte parado o sin bajada para su nivel.
          const r = red.remontes[e.remonte];
          expect(red.enServicio(r)).toBe(true);
          expect(viables[nivelEsquiador].has(r.hasta)).toBe(true);
        }
      }
    };

    it('durante 16 minutos de juego no aparece ningún punto ciego', () => {
      const dt = 1 / 10;
      let siguiente = 0;
      let revisiones = 0;
      while (sim.tiempo < 16 * 60 && !sim.terminada) {
        if (sim.tiempo >= siguiente) {
          ESTRATEGIAS.razonable.decidir(j, azar, memoria);
          siguiente += 5;
          if (Math.round(sim.tiempo) % 60 === 0) {
            sinPuntosCiegos();
            revisiones++;
          }
        }
        j.paso(dt);
      }
      sinPuntosCiegos();
      expect(revisiones).toBeGreaterThan(10);
      expect(red.remontes.length).toBeGreaterThan(3);
      expect(red.pistas.length).toBeGreaterThan(6);
      expect(sim.bajadasCompletadas).toBeGreaterThan(200);
    });

    it('cada pista abierta cabe en la banda de su color y no supera la sinuosidad máxima', () => {
      const rp = red.reglas.pista;
      const fuera = red.pistas.filter((p) => p.pendiente < rp.bandas[p.color][0] - TOLERANCIA || p.pendiente > rp.bandas[p.color][1] + TOLERANCIA);
      // Las únicas que pueden salirse son las que se unen a otra pista: el
      // tramo común cambia su longitud (y manda la dificultad mayor).
      for (const p of fuera) expect(p.compartido, `pista ${p.id} ${p.color} con pendiente ${p.pendiente}`).not.toBeNull();
      for (const p of red.pistas.filter((x) => !x.compartido)) {
        const [min, max] = rp.bandas[p.color];
        expect(p.pendiente, `pista ${p.id} ${p.color}`).toBeGreaterThanOrEqual(min - TOLERANCIA);
        expect(p.pendiente, `pista ${p.id} ${p.color}`).toBeLessThanOrEqual(max + TOLERANCIA);
        expect(p.s).toBeLessThanOrEqual(rp.sinuosidadMaxima + 0.02);
        expect(p.s).toBeGreaterThanOrEqual(1);
        // La pista baja: su origen está más alto que su destino.
        expect(red.nodo(p.desde).cota).toBeGreaterThan(red.nodo(p.hasta).cota);
      }
    });

    it('los colores que ofrece el selector son los que caben por pendiente', () => {
      const rp = red.reglas.pista;
      let evaluadas = 0;
      for (const o of red.nodos.filter((n) => red.activo(n.id) && n.tipo !== 'base')) {
        for (const b of red.nodos.filter((n) => n.cota < o.cota).sort((a, c) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(c.x - o.x, c.y - o.y)).slice(0, 8)) {
          const e = j.evaluarPista(o.id, b.id);
          if (e.motivo !== 'ok') continue;
          evaluadas++;
          const recta = (o.cota - b.cota) / Math.hypot(o.x - b.x, o.y - b.y);
          for (const c of e.colores) {
            if (!c.factible) continue;
            const [min, max] = rp.bandas[c.color];
            // Factible: con alguna sinuosidad permitida la pendiente entra en su banda.
            expect(c.p).toBeGreaterThanOrEqual(min - TOLERANCIA);
            expect(c.p).toBeLessThanOrEqual(max + TOLERANCIA);
            expect(c.s).toBeLessThanOrEqual(rp.sinuosidadMaxima + 0.02);
            // Solo se fuerza hacia lo fácil: con curvas la pendiente nunca supera la de la recta.
            expect(c.p).toBeLessThanOrEqual(recta + TOLERANCIA);
            expect(nivelDe(c.color)).toBeLessThan(COLORES.length);
          }
        }
      }
      expect(evaluadas).toBeGreaterThan(10);
    });
  });
}
