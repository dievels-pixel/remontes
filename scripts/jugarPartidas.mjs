// Juega partidas completas sin pantalla en «Gran dominio» con un jugador
// automático sencillo, para calibrar la economía (precios, mantenimiento,
// tarifas) frente a la afluencia y el medidor de quejas.
//
// Uso: npm run jugar -- [estilo] ['{"economia":{"precioPorMetro":0.1}}'] [minutos]
//   estilo: equilibrado (por defecto), mejoraTodo, soloAmplia o todos.
//   El JSON se mezcla sobre CONFIG antes de crear la partida.
//
// El jugador decide cada 5 s de juego:
// - equilibrado: si la cola más larga pasa del aforo, mejora ese remonte (y
//   ahorra para ello); si ya es telecabina o no hay colas, amplía con el
//   remonte nuevo que más desnivel da por moneda, y abre desde su llegada
//   hasta 3 pistas del color que más falta según la mezcla de llegadas.
// - mejoraTodo: mejora todo lo que puede, sin mirar colas; amplía si no.
// - soloAmplia: nunca mejora.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const estiloPedido = process.argv[2] ?? 'equilibrado';
const ajustes = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const MINUTOS = Number(process.argv[4] ?? 30);
const SEMILLAS = Number(process.argv[5] ?? 1);

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const cargar = (m) => servidor.ssrLoadModule(m);
const { decodificarPngGris } = await cargar('/scripts/png.ts');
const { alturasDesdeGris, leerDatosMapa } = await cargar('/src/core/mapa.ts');
const { CONFIG } = await cargar('/src/config.ts');
const { Juego } = await cargar('/src/juego.ts');
const { COLORES } = await cargar('/src/core/colores.ts');
const { precioMejora, TIPO_MAXIMO } = await cargar('/src/core/economia.ts');
const { Simulacion } = await cargar('/src/core/simulacion.ts');
const { crearAzar } = await cargar('/src/core/azar.ts');

function mezclar(destino, origen) {
  for (const [k, v] of Object.entries(origen)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) mezclar(destino[k], v);
    else destino[k] = v;
  }
}
mezclar(CONFIG, ajustes);

const datos = leerDatosMapa(JSON.parse(readFileSync('mapas/gran-dominio/mapa.json', 'utf8')));
const png = decodificarPngGris(readFileSync('mapas/gran-dominio/alturas.png'));
const alturas = alturasDesdeGris(datos, png.ancho, png.alto, png.gris);

function jugar(estilo, semilla) {
  const j = new Juego({ datos, alturas });
  const red = j.red;
  // Otra semilla para el azar de la simulación (la del juego es fija).
  if (semilla > 0) {
    const s = new Simulacion(red, j.parametrosSim, j.sim.entrada, crearAzar(semilla), j.carretera);
    s.monedas = j.sim.monedas;
    j.sim = s;
  }
  const sim = j.sim;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let mejoras = 0;
  let gastado = 0;

  function mejorar(r) {
    const precio = precioMejora(r.longitud, r.tipo, CONFIG.economia);
    if (r.tipo >= TIPO_MAXIMO || precio > sim.monedas) return false;
    red.mejorarRemonte(r.id, TIPO_MAXIMO);
    sim.monedas -= precio;
    gastado += precio;
    mejoras++;
    return true;
  }

  // Color que más falta: demanda (mezcla actual) menos oferta (pistas activas).
  function ordenColores() {
    const mezcla = sim.mezclaActual;
    const total = mezcla.reduce((a, b) => a + b, 0) || 1;
    const oferta = [0, 0, 0, 0];
    for (const p of red.pistas) oferta[COLORES.indexOf(p.color)]++;
    const n = red.pistas.length || 1;
    return [0, 1, 2, 3].sort((a, b) => oferta[a] / n - mezcla[a] / total - (oferta[b] / n - mezcla[b] / total));
  }

  function abrirDesde(desde, cuantas) {
    const o = red.nodo(desde);
    const destinos = red.nodos
      .filter((b) => b.cota < o.cota && red.viable(b.id))
      .sort((a, b) => dist(a, o) - dist(b, o))
      .slice(0, 6);
    let abiertas = 0;
    for (const b of destinos) {
      if (abiertas >= cuantas) break;
      const e = j.evaluarPista(desde, b.id);
      if (e.motivo !== 'ok' || e.espera) continue;
      const orden = ordenColores();
      const c = orden.map((i) => e.colores.find((x) => x.color === COLORES[i] && x.factible)).find(Boolean);
      if (!c) continue;
      red.abrirPista(desde, b.id, c.color, e.proyecto.lado, c.giro);
      abiertas++;
    }
    return abiertas;
  }

  function ampliar(soloDesde = null) {
    // Orígenes: bases de la plaza y llegadas de remontes en servicio (no cimas).
    const origenes = red.nodos.filter(
      (n) => (soloDesde === null || n.id === soloDesde) && (n.tipo === 'base' || (red.estacionesDe(n.id).length > 0 && n.tipo !== 'cima' && red.viable(n.id))),
    );
    const usados = new Set(red.remontes.map((r) => r.hasta));
    const pares = new Set(red.remontes.map((r) => `${r.desde}:${r.hasta}`));
    let mejor = null;
    for (const o of origenes) {
      const altos = red.nodos.filter((n) => n.cota > o.cota + 50 && !pares.has(`${o.id}:${n.id}`)).sort((a, b) => dist(a, o) - dist(b, o)).slice(0, 6);
      for (const d of altos) {
        const precio = j.precioRemonteEntre(o.id, d.id);
        if (precio > sim.monedas) continue;
        // Un destino nuevo vale más que otro remonte a uno ya servido (desdoble).
        const valor = ((d.cota - o.cota) / precio) * (usados.has(d.id) ? 0.4 : 1);
        if (mejor && valor <= mejor.valor) continue;
        if (red.puedeConstruirRemonte(o.id, d.id) !== 'ok') continue;
        mejor = { o: o.id, d: d.id, precio, valor };
      }
    }
    if (!mejor) return false;
    red.construirRemonte(mejor.o, mejor.d);
    sim.monedas -= mejor.precio;
    gastado += mejor.precio;
    if (abrirDesde(mejor.d, 3) === 0 && !red.enServicio(red.remontes[red.remontes.length - 1])) {
      // Sin bajada propia: se deshace (devuelve lo pagado).
      j.deshacer();
      gastado -= mejor.precio;
      return false;
    }
    return true;
  }

  // Pistas gratis: desde una llegada con remonte, hacia destinos aún sin
  // pista desde ella, del color que más falta.
  function abrirMas() {
    for (const r of red.remontes) {
      if (!red.enServicio(r)) continue;
      if (abrirDesde(r.hasta, 1) > 0) return true;
    }
    return false;
  }

  function decidir() {
    // Cada medio minuto, una pista más si hay dónde (no cuesta dinero).
    if (Math.round(sim.tiempo) % 30 === 0) abrirMas();
    if (estilo !== 'soloAmplia') {
      const conCola = red.remontes
        .map((r) => ({ r, cola: sim.colas[r.id]?.length ?? 0 }))
        .sort((a, b) => b.cola - a.cola);
      if (estilo === 'mejoraTodo') {
        for (const { r } of conCola) if (mejorar(r)) return;
      } else {
        const peor = conCola[0];
        if (peor && peor.cola > sim.p.aforoCola) {
          // Mejorarlo si llega; si no, otro remonte desde la misma salida; si
          // tampoco, ahorra.
          if (peor.r.tipo < TIPO_MAXIMO && mejorar(peor.r)) return;
          if (ampliar(peor.r.desde)) return;
          if (peor.r.tipo < TIPO_MAXIMO) return;
        }
      }
    }
    ampliar();
  }

  const DT = 1 / 30;
  const filas = [];
  const monedasEn = [];
  let siguienteDecision = 0;
  let siguienteFila = 60;
  while (sim.tiempo < MINUTOS * 60 && !sim.terminada) {
    if (sim.tiempo >= siguienteDecision) {
      decidir();
      siguienteDecision += 5;
    }
    j.paso(DT);
    if (sim.tiempo >= siguienteFila) {
      siguienteFila += 60;
      const tipos = [0, 0, 0];
      for (const r of red.remontes) tipos[r.tipo]++;
      if ([6, 10, 14].includes(Math.round(sim.tiempo / 60))) monedasEn.push(Math.floor(sim.monedas));
      const colaMax = Math.max(0, ...red.remontes.map((r) => sim.colas[r.id]?.length ?? 0));
      filas.push(
        `${String(Math.round(sim.tiempo / 60)).padStart(3)} min  monedas ${String(Math.floor(sim.monedas)).padStart(5)}  ` +
          `+${String(Math.round(sim.ingresosPorMinuto)).padStart(4)} −${String(Math.round(sim.mantenimientoPorMinuto)).padStart(3)}/min  ` +
          `remontes ${tipos.join('/')}  pistas ${COLORES.map((c) => red.pistas.filter((p) => p.color === c).length).join('/')}  gente ${String(sim.poblacion).padStart(3)}  ` +
          `cola máx ${String(colaMax).padStart(3)}  quejas ${sim.medidorQuejas.toFixed(1)} (abu ${sim.quejas.aburrimiento}, cola ${sim.quejas.cola}, sin ${sim.quejas.sinPistas})`,
      );
    }
  }
  return { filas, monedasEn, tiempo: sim.tiempoAbierta, terminada: sim.terminada, mejoras, gastado, satisfechos: sim.cansados, enfadados: sim.enfadados };
}

const estilos = estiloPedido === 'todos' ? ['equilibrado', 'mejoraTodo', 'soloAmplia'] : [estiloPedido];
const reloj = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
for (const estilo of estilos) {
  const t0 = performance.now();
  const partidas = [];
  for (let k = 0; k < SEMILLAS; k++) partidas.push(jugar(estilo, k));
  console.log(`\n== ${estilo} ${JSON.stringify(ajustes)}`);
  if (SEMILLAS === 1) for (const f of partidas[0].filas) console.log(f);
  for (const r of partidas) {
    console.log(
      `${r.terminada ? 'Derrota' : 'Sigue'} a los ${reloj(r.tiempo)}. Satisfechos ${r.satisfechos}, enfadados ${r.enfadados}, mejoras ${r.mejoras}, gastado ${Math.round(r.gastado)}, ` +
        `monedas a los 6/10/14 min: ${r.monedasEn.join('/')}.`,
    );
  }
  const tiempos = partidas.map((r) => r.tiempo).sort((a, b) => a - b);
  console.log(`Mediana: ${reloj(tiempos[Math.floor(tiempos.length / 2)])} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
await servidor.close();
