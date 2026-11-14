// Mide cómo eligen los esquiadores en «Gran dominio»: con qué frecuencia cada
// nivel baja por pistas de su color, cómo se reparten las visitas según la
// distancia (en pasos) de cada punto a la plaza, y las quejas por causa.
//
// Uso: npm run medir:eleccion
//
// Monta siempre la misma estación: remontes desde la plaza a varios puntos y,
// desde cada llegada, pistas de colores variados hacia los puntos con salida
// más cercanos. Simula unos minutos con los parámetros de config.ts.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const MINUTOS = 6;
const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const cargar = (m) => servidor.ssrLoadModule(m);
const { decodificarPngGris } = await cargar('/scripts/png.ts');
const { alturasDesdeGris, leerDatosMapa } = await cargar('/src/core/mapa.ts');
const { Juego } = await cargar('/src/juego.ts');
const { COLORES } = await cargar('/src/core/colores.ts');

const datos = leerDatosMapa(JSON.parse(readFileSync('mapas/gran-dominio/mapa.json', 'utf8')));
const png = decodificarPngGris(readFileSync('mapas/gran-dominio/alturas.png'));
const j = new Juego({ datos, alturas: alturasDesdeGris(datos, png.ancho, png.alto, png.gris) });
const red = j.red;
// Caudal y mezcla constantes (los de antes de la curva de afluencia), para
// que las cifras se puedan comparar entre versiones.
j.parametrosSim.afluencia = undefined;
j.parametrosSim.medidor = undefined; // sin derrota: se mide la elección, no la partida
j.parametrosSim.llegadasPorMinuto = 30;
j.parametrosSim.mezclaNiveles = [0.35, 0.35, 0.2, 0.1];
const nodo = (x, y) => red.nodos.find((n) => n.x === x && n.y === y).id;

// Remontes desde la plaza: a la cima central, a dos intermedios de media
// montaña y a uno de la zona de verdes.
const plazaC = nodo(2000, 5500);
const plazaO = nodo(1650, 5700);
const plazaE = nodo(2350, 5700);
const remontes = [
  [plazaC, nodo(2100, 2300)],
  [plazaO, nodo(1500, 3700)],
  [plazaE, nodo(2300, 3700)],
  [plazaO, nodo(1600, 4850)],
];
// Pistas desde cada llegada hacia sus destinos con salida más cercanos,
// probando colores distintos para cubrir los cuatro.
const usados = new Set();
function abrirVariadas(desde, cuantas) {
  const o = red.nodo(desde);
  const destinos = red.nodos
    .filter((b) => b.cota < o.cota && red.viable(b.id))
    .sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y));
  let abiertas = 0;
  for (const b of destinos) {
    if (abiertas >= cuantas) break;
    const e = j.evaluarPista(desde, b.id);
    if (e.motivo !== 'ok' || e.espera) continue;
    const posibles = e.colores.filter((c) => c.factible);
    const c = posibles.find((x) => !usados.has(`${desde}:${x.color}`)) ?? posibles[0];
    usados.add(`${desde}:${c.color}`);
    red.abrirPista(desde, b.id, c.color, e.proyecto.lado, c.giro);
    abiertas++;
  }
}
// En orden de abajo arriba, para que las de arriba tengan destinos con salida.
for (const [a, b] of [...remontes].sort((x, y) => red.nodo(x[1]).cota - red.nodo(y[1]).cota)) {
  red.construirRemonte(a, b);
  abrirVariadas(b, 3);
  abrirVariadas(b, 2); // segunda pasada: otro lado u otro destino
}
// Un remonte encadenado desde una llegada de media montaña hasta otra cima:
// da puntos a dos pasos de la plaza.
red.construirRemonte(nodo(1500, 3700), nodo(1300, 2300));
abrirVariadas(nodo(1300, 2300), 3);
abrirVariadas(nodo(1300, 2300), 2);

// Distancia en pasos (pistas o remontes en servicio) de cada punto a la plaza.
const pasos = new Map(red.nodos.filter((n) => n.tipo === 'base').map((n) => [n.id, 0]));
const aristas = [
  ...red.pistas.filter((p) => red.pistaActiva(p)).map((p) => [p.desde, p.hasta]),
  ...red.remontes.filter((r) => red.enServicio(r)).map((r) => [r.desde, r.hasta]),
];
for (let cambio = true; cambio; ) {
  cambio = false;
  for (const [a, b] of aristas) {
    if (pasos.has(b) && (!pasos.has(a) || pasos.get(a) > pasos.get(b) + 1)) {
      pasos.set(a, pasos.get(b) + 1);
      cambio = true;
    }
  }
}

// Simulación: se observa el estado de cada esquiador en cada paso.
const sim = j.sim;
const bajadas = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); // [nivel][diferencia de niveles]
const visitas = new Map();
const anterior = new Map();
const DT = 1 / 60;
for (let t = 0; t < MINUTOS * 60; t += DT) {
  sim.paso(DT);
  for (const e of sim.esquiadores.values()) {
    const antes = anterior.get(e.id);
    const ahora = e.estado === 'pista' ? `p${e.pista}` : e.estado === 'remonte' || e.estado === 'cola' ? `r${e.remonte}` : 'a';
    if (ahora !== antes) {
      const perfil = sim.perfiles.get(e.id);
      if (e.estado === 'pista' && perfil) bajadas[perfil.nivel][perfil.nivel - red.dificultad(red.pistas[e.pista])]++;
      // Llegada a un punto: al terminar la bajada o al bajarse del remonte.
      if (antes?.startsWith('p')) visitas.set(red.pistas[+antes.slice(1)].hasta, (visitas.get(red.pistas[+antes.slice(1)].hasta) ?? 0) + 1);
      if (antes?.startsWith('r') && e.estado !== 'cola' && ahora !== antes) {
        const r = red.remontes[+antes.slice(1)];
        visitas.set(r.hasta, (visitas.get(r.hasta) ?? 0) + 1);
      }
      anterior.set(e.id, ahora);
    }
  }
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '–');
console.log(`Elección de los esquiadores en «Gran dominio» (${MINUTOS} min, ${red.remontes.length} remontes, ${red.pistas.length} pistas: ${COLORES.map((c) => `${red.pistas.filter((p) => p.color === c).length} ${c}`).join(', ')})`);
console.log('Bajadas por nivel: de su color / uno por debajo / dos / tres');
for (let n = 0; n < 4; n++) {
  const fila = bajadas[n];
  const total = fila.reduce((a, b) => a + b, 0);
  console.log(`  ${COLORES[n].padEnd(6)} ${String(total).padStart(5)} bajadas: ${fila.map((x) => pct(x, total).padStart(5)).join(' / ')}`);
}
const porPasos = new Map();
for (const [n, v] of visitas) {
  const k = pasos.get(n) ?? '∞';
  porPasos.set(k, (porPasos.get(k) ?? 0) + v);
}
const totalVisitas = [...visitas.values()].reduce((a, b) => a + b, 0);
console.log('Visitas por distancia a la plaza (pasos):');
for (const k of [...porPasos.keys()].sort()) console.log(`  ${String(k).padStart(2)} pasos: ${String(porPasos.get(k)).padStart(5)} (${pct(porPasos.get(k), totalVisitas)})`);
console.log(`Quejas: aburrimiento ${sim.quejas.aburrimiento}, cola ${sim.quejas.cola}, sin pistas de su nivel ${sim.quejas.sinPistas}; cansados ${sim.cansados}; bajadas completadas ${sim.bajadasCompletadas}`);
await servidor.close();
