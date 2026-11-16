// Calibración sin pantalla: juega partidas con los jugadores automáticos de
// src/bots y comprueba los criterios de CALIBRACION.md.
//
// Uso: npm run calibrar -- [estrategias separadas por comas | todas] [partidas por estrategia, 5]
//                          ['{json que se mezcla sobre CONFIG}'] [nivel, el primero del índice]
//   --detalle: imprime además el minuto a minuto de la primera partida de cada estrategia.
//
// Los minutos de los criterios son reales a velocidad 1× (CONFIG.tiempo.escala
// segundos de juego por segundo real).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const detalle = process.argv.includes('--detalle');
const pedidas = args[0] ?? 'todas';
const PARTIDAS = Number(args[1] ?? 5);
const ajustes = args[2] ? JSON.parse(args[2]) : {};

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const cargar = (m) => servidor.ssrLoadModule(m);
const { decodificarPngGris } = await cargar('/scripts/png.ts');
const { alturasDesdeGris } = await cargar('/src/core/mapa.ts');
const { CONFIG } = await cargar('/src/config.ts');
const { ESTRATEGIAS } = await cargar('/src/bots/jugadores.ts');
const { jugarPartida } = await cargar('/src/bots/partida.ts');

function mezclar(destino, origen) {
  for (const [k, v] of Object.entries(origen)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) mezclar(destino[k], v);
    else destino[k] = v;
  }
}
mezclar(CONFIG, ajustes);

// Nivel: el cuarto argumento o, sin él, el primero jugable del índice.
const { leerNivel, leerIndice } = await cargar('/src/core/nivel.ts');
const { retoConseguido, textoReto } = await cargar('/src/core/retos.ts');
const idNivel = args[3] ?? leerIndice(JSON.parse(readFileSync('niveles/indice.json', 'utf8'))).find((n) => !n.bloqueado).id;
const carpeta = `niveles/${idNivel}`;
const nivel = leerNivel(JSON.parse(readFileSync(`${carpeta}/nivel.json`, 'utf8')));
const datos = nivel.mapa;
const png = decodificarPngGris(readFileSync(`${carpeta}/alturas.png`));
const mapa = { datos, alturas: alturasDesdeGris(datos, png.ancho, png.alto, png.gris) };
console.log(`Nivel «${datos.nombre}» (${carpeta})`);

const ESCALA = CONFIG.tiempo.escala;
const real = (s) => s / ESCALA / 60; // minutos reales a 1×
const reloj = (min) => `${Math.floor(min)}:${String(Math.floor((min % 1) * 60)).padStart(2, '0')}`;
const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const LIMITE_REAL = 30; // minutos reales como máximo por partida

const nombres = pedidas === 'todas' ? Object.keys(ESTRATEGIAS) : pedidas.split(',');
const resumen = {};
for (const nombre of nombres) {
  const t0 = performance.now();
  const rs = [];
  for (let k = 0; k < PARTIDAS; k++) rs.push(jugarPartida(mapa, ESTRATEGIAS[nombre], { semilla: k + 1, minutosMaximos: LIMITE_REAL * ESCALA, parametros: nivel.parametros }));
  resumen[nombre] = rs;
  const t = rs.map((r) => real(r.tiempo));
  const subida = rs.filter((r) => r.terminada && r.mitadMedidor !== null).map((r) => real(r.tiempo - r.mitadMedidor));
  console.log(
    `\n== ${nombre}: mediana ${reloj(mediana(t))} min reales (de ${reloj(Math.min(...t))} a ${reloj(Math.max(...t))}); ` +
      `del medio medidor a la derrota, mediana ${subida.length ? reloj(mediana(subida)) : '–'}; ` +
      `abajo ${Math.round(mediana(rs.map((r) => r.abajo)) * 100)} %; divierten ${Math.round(mediana(rs.map((r) => r.divierten)) * 100)} %  (${((performance.now() - t0) / 1000).toFixed(0)} s)`,
  );
  for (const r of rs) {
    console.log(
      `  ${r.terminada ? 'derrota' : 'sigue  '} ${reloj(real(r.tiempo))}  satisf. ${String(r.satisfechos).padStart(4)}  enfad. ${String(r.enfadados).padStart(3)} ` +
        `(abu ${r.quejas.aburrimiento}, cola ${r.quejas.cola}, sin ${r.quejas.sinPistas}; niveles ${r.quejasPorNivel.join('/')})  ` +
        `remontes ${r.remontes.join('/')}  pistas ${r.pistas.join('/')} (${r.pistasForzadas} forz.)  monedas ${r.monedas}  bajadas negros ${r.bajadasPorNivel[3]}`,
    );
  }
  // Retos del nivel: en cuántas partidas los consigue este jugador.
  if (nivel.retos.length > 0) {
    console.log('  retos: ' + nivel.retos.map((reto) => `${textoReto(reto)} ${rs.filter((r) => retoConseguido(reto, r.resumen)).length}/${rs.length}`).join('  ·  '));
    const m = (f) => mediana(rs.map((r) => f(r.resumen)));
    console.log(`  medianas: ${m((x) => x.dias).toFixed(1)} días, ${m((x) => x.satisfechos)} satisfechos, ${m((x) => x.bajadasNegros)} bajadas de negros, ${m((x) => x.maxRemontes)} remontes como máximo, ${m((x) => x.maxTelecabinas)} telecabinas, ${m((x) => x.pistasForzadas)} pistas forzadas`);
  }
  if (detalle) {
    for (const m of rs[0].minutos) {
      if (m.minuto % 2 && m.minuto > 10) continue;
      console.log(
        `    ${String(m.minuto).padStart(3)} min juego  monedas ${String(m.monedas).padStart(5)}  +${String(m.ingresos).padStart(4)} −${String(m.mantenimiento).padStart(3)}  ` +
          `remontes ${m.remontes.join('/')}  pistas ${m.pistas.join('/')}  gente ${String(m.gente).padStart(3)}  cola máx ${String(m.colaMaxima).padStart(3)}  ` +
          `quejas ${Math.round(m.quejas * 100)} %  abajo ${Math.round(m.abajo * 100)} %`,
      );
    }
  }
}

// Criterios.
if (pedidas === 'todas') {
  const med = (n) => mediana(resumen[n].map((r) => real(r.tiempo)));
  const todasLas = Object.values(resumen).flat();
  const raz = resumen.razonable;
  const subidas = raz.filter((r) => r.terminada && r.mitadMedidor !== null).map((r) => real(r.tiempo - r.mitadMedidor));
  const criterios = [
    ['Razonable: mediana entre 12 y 20 min', med('razonable') >= 12 && med('razonable') <= 20, reloj(med('razonable'))],
    ['Nadie pierde en los 2 primeros minutos', todasLas.every((r) => !r.terminada || real(r.tiempo) > 2), reloj(Math.min(...todasLas.map((r) => real(r.tiempo))))],
    ...['todoVerde', 'soloMejora', 'soloAmplia'].map((n) => [`${n} no gana (mediana por debajo del 80 % de la del razonable)`, med(n) < 0.8 * med('razonable'), reloj(med(n))]),
    ['Torpe pierde antes que el razonable', med('torpe') < med('razonable'), reloj(med('torpe'))],
    ['Derrota en cadena: del medio medidor al final, al menos 1 min (mediana del razonable)', subidas.length > 0 && mediana(subidas) >= 1, subidas.length ? reloj(mediana(subidas)) : '–'],
  ];
  console.log('\nCriterios:');
  for (const [texto, ok, valor] of criterios) console.log(`  ${ok ? 'SÍ' : 'NO'}  ${texto}: ${valor}`);
  if (criterios.some(([, ok]) => !ok)) process.exitCode = 1;
}
await servidor.close();
