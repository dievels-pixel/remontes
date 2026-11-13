// Mide en «Gran dominio» cuánto tarda el primer arrastre tras una obra, antes
// (cachés frías) y después del calentamiento en segundo plano.
//
// Uso: npm run medir:arrastre
//
// Monta una red pequeña (plaza → cima central con pista de vuelta, y plaza →
// un intermedio) y simula dos arrastres, pasando el dedo por cada destino:
// - de la plaza hacia los puntos más altos (remontes: bajada desde la llegada);
// - de la cima hacia los más bajos (pistas: evaluarPista).
// Para cada uno da el tiempo total y el del destino más lento. Después
// calienta (4 ms por fotograma, como el juego) y repite.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const cargar = (m) => servidor.ssrLoadModule(m);
const { decodificarPngGris } = await cargar('/scripts/png.ts');
const { alturasDesdeGris, leerDatosMapa } = await cargar('/src/core/mapa.ts');
const { Juego } = await cargar('/src/juego.ts');

function montar() {
  const datos = leerDatosMapa(JSON.parse(readFileSync('mapas/gran-dominio/mapa.json', 'utf8')));
  const png = decodificarPngGris(readFileSync('mapas/gran-dominio/alturas.png'));
  const j = new Juego({ datos, alturas: alturasDesdeGris(datos, png.ancho, png.alto, png.gris) });
  const r = j.red;
  const plaza = r.nodos.find((n) => n.tipo === 'base' && n.x === 2000);
  const cima = r.nodos.find((n) => n.tipo === 'cima' && n.x === 2100);
  r.construirRemonte(plaza.id, cima.id);
  const e = j.evaluarPista(cima.id, plaza.id);
  const c = e.colores.find((x) => x.factible);
  r.abrirPista(cima.id, plaza.id, c.color, e.proyecto.lado, c.giro);
  r.construirRemonte(plaza.id, r.nodos.find((n) => n.x === 2000 && n.y === 4500).id);
  return { j, plaza, cima };
}

/** Pasa el dedo por cada destino desde `origen`, como moverArrastre: total y peor destino (ms). */
function arrastre(j, origen) {
  const r = j.red;
  const o = r.nodo(origen);
  let total = 0;
  let peor = 0;
  for (const n of r.nodos) {
    if (n.id === origen) continue;
    const t = performance.now();
    if (n.cota > o.cota) j.evaluar(origen, n.id);
    else j.evaluarPista(origen, n.id);
    const ms = performance.now() - t;
    total += ms;
    peor = Math.max(peor, ms);
  }
  return { total: Math.round(total), peor: Math.round(peor) };
}

const f = (x) => `${String(x.total).padStart(5)} ms en total, el peor destino ${String(x.peor).padStart(4)} ms`;

// Antes: cachés frías, justo después de la obra.
const antes = montar();
const frioRemontes = arrastre(antes.j, antes.plaza.id);
const frioPistas = arrastre(antes.j, antes.cima.id);

// Después: el juego calienta en segundo plano, 4 ms por fotograma.
const despues = montar();
let fotogramas = 0;
let peorFotograma = 0;
const t0 = performance.now();
while (!despues.j.calentado) {
  const t = performance.now();
  despues.j.calentar(4);
  peorFotograma = Math.max(peorFotograma, performance.now() - t);
  fotogramas++;
}
const tiempoCalentar = performance.now() - t0;
const calienteRemontes = arrastre(despues.j, despues.plaza.id);
const calientePistas = arrastre(despues.j, despues.cima.id);

console.log('Arrastre en «Gran dominio» tras una obra');
console.log(`  Antes  · remontes desde la plaza: ${f(frioRemontes)}`);
console.log(`  Antes  · pistas desde la cima:    ${f(frioPistas)}`);
console.log(`  Calentamiento: ${fotogramas} fotogramas (${(fotogramas / 60).toFixed(1)} s a 60 fps), ${Math.round(tiempoCalentar)} ms de cálculo, fotograma más largo ${Math.round(peorFotograma)} ms`);
console.log(`  Después · remontes desde la plaza: ${f(calienteRemontes)}`);
console.log(`  Después · pistas desde la cima:    ${f(calientePistas)}`);
console.log('  (Los destinos más allá de los 16 más cercanos de cada origen no se calientan: se calculan al llegar el dedo.)');
await servidor.close();
