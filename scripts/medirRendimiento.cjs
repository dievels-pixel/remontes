// Mide el rendimiento con mucha gente en pantalla (etapa 5): en «Gran
// dominio», una estación de 5 remontes y unas 17 pistas (la de
// medirEleccion.mjs) con unos 250 esquiadores, en un móvil emulado (Pixel 7)
// con la CPU frenada para parecerse a un móvil de gama media.
//
// Uso: con `npx vite` en marcha, node scripts/medirRendimiento.cjs [frenado de CPU, 4] [llegadas/min, 80]
// Usa el Playwright y el Chromium preinstalados (require('playwright')).
const { chromium, devices } = require('playwright');

const FRENADO = Number(process.argv[2] ?? 4);
const LLEGADAS = Number(process.argv[3] ?? 80);
const URL = process.env.URL ?? 'http://localhost:5173/remontes/';

const resumen = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))] ?? 0;
  return `mediana ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  máx ${q(1).toFixed(1)}`;
};

(async () => {
  const navegador = await chromium.launch();
  const pagina = await (await navegador.newContext({ ...devices['Pixel 7'] })).newPage();
  pagina.on('pageerror', (e) => console.log('Error en la página:', e.message));
  await pagina.goto(URL);
  await pagina.waitForTimeout(2500);
  const cdp = await pagina.context().newCDPSession(pagina);

  // Estación de prueba y relleno de gente (sin frenar la CPU, para no tardar).
  console.log(
    'Montaje:',
    await pagina.evaluate((llegadas) => {
      const j = window.juego;
      const red = j.red;
      const nodo = (x, y) => red.nodos.find((n) => n.x === x && n.y === y).id;
      const [c, o, e] = [nodo(2000, 5500), nodo(1650, 5700), nodo(2350, 5700)];
      const remontes = [
        [c, nodo(2100, 2300)],
        [o, nodo(1500, 3700)],
        [e, nodo(2300, 3700)],
        [o, nodo(1600, 4850)],
      ];
      const usados = new Set();
      const abrir = (desde, cuantas) => {
        const a = red.nodo(desde);
        const destinos = red.nodos.filter((b) => b.cota < a.cota && red.viable(b.id)).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
        let n = 0;
        for (const b of destinos) {
          if (n >= cuantas) break;
          const ev = j.evaluarPista(desde, b.id);
          if (ev.motivo !== 'ok' || ev.espera) continue;
          const posibles = ev.colores.filter((x) => x.factible);
          const col = posibles.find((x) => !usados.has(`${desde}:${x.color}`)) ?? posibles[0];
          usados.add(`${desde}:${col.color}`);
          red.abrirPista(desde, b.id, col.color, ev.proyecto.lado, col.giro);
          n++;
        }
      };
      for (const [a, b] of [...remontes].sort((x, y) => red.nodo(x[1]).cota - red.nodo(y[1]).cota)) {
        red.construirRemonte(a, b);
        abrir(b, 3);
        abrir(b, 2);
      }
      red.construirRemonte(nodo(1500, 3700), nodo(1300, 2300));
      abrir(nodo(1300, 2300), 3);
      abrir(nodo(1300, 2300), 2);
      // Caudal constante y sin derrota: solo se mide el rendimiento.
      for (const r of red.remontes) r.tipo = 2; // telecabinas: sin colas enormes
      j.parametrosSim.afluencia = undefined;
      j.parametrosSim.medidor = undefined;
      j.parametrosSim.llegadasPorMinuto = llegadas;
      for (let t = 0; t < 240; t += 1 / 30) j.sim.paso(1 / 30);
      return { remontes: red.remontes.length, pistas: red.pistas.length, esquiadores: j.sim.poblacion };
    }, LLEGADAS),
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: FRENADO });

  const medir = async (titulo, segundos) => {
    await pagina.evaluate(() => {
      for (const v of Object.values(window.rendimiento)) v.length = 0;
    });
    const t0 = Date.now();
    await pagina.waitForTimeout(segundos * 1000);
    const r = await pagina.evaluate(() => ({ ...window.rendimiento, gente: window.juego.sim.poblacion }));
    const s = (Date.now() - t0) / 1000;
    const total = r.simulacion.map((x, i) => x + r.calentar[i] + r.dibujo[i]);
    console.log(`\n${titulo} (${r.gente} esquiadores, CPU ×${FRENADO}): ${(r.dibujo.length / s).toFixed(0)} fotogramas/s`);
    console.log(`  simulación ${resumen(r.simulacion)} ms (${resumen(r.pasos).split('  ')[0].replace('mediana ', '')} pasos/fotograma)`);
    console.log(`  calentar   ${resumen(r.calentar)} ms`);
    console.log(`  dibujo     ${resumen(r.dibujo)} ms`);
    console.log(`  total      ${resumen(total)} ms; fotogramas de más de 33 ms: ${total.filter((x) => x > 33).length}`);
  };

  await medir('Velocidad 1×', 10);
  await pagina.evaluate(() => (window.juego.velocidad = 2));
  await medir('Velocidad 2×', 10);
  await pagina.evaluate(() => (window.juego.velocidad = 1));
  // Una obra (un remonte nuevo desde la plaza): el calentamiento de cachés
  // empieza de nuevo.
  console.log(
    '\nObra:',
    await pagina.evaluate(() => {
      const j = window.juego;
      const red = j.red;
      const base = red.nodos.find((n) => n.x === 2350 && n.y === 5700).id;
      const destino = red.nodos.filter((n) => n.cota > red.nodo(base).cota && red.puedeConstruirRemonte(base, n.id) === 'ok').sort((a, b) => a.cota - b.cota)[0];
      red.construirRemonte(base, destino.id);
      return `remonte ${base} → ${destino.id}, versión de la red ${red.version}`;
    }),
  );
  await medir('Tras una obra, 1×', 5);
  await navegador.close();
})();
