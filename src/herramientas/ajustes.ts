// HERRAMIENTA TEMPORAL DE CALIBRACIÓN. No forma parte del diseño del juego.
// Panel HTML encima del canvas, solo con ?ajustes en la dirección, para ajustar
// a ojo la forma de las pistas. Cambia los parámetros en memoria (los de
// src/config.ts no se tocan) y recalcula al momento las pistas abiertas y los
// proyectos. "Copiar valores" deja en el portapapeles el bloque de config.ts.
import { CONFIG } from '../config';
import { copiarBandas, type ColorPista, type PendienteObjetivo } from '../core/colores';
import { textoMapa } from '../core/editorMapa';
import { MAPA_INICIAL, type DefinicionNodo } from '../core/mapa';
import type { HerramientaMapa, Juego } from '../juego';
import { textoConfigEsquiador, textoConfigPista } from './textoConfig';

type ParametrosPista = Juego['red']['reglas']['pista'];

interface Deslizador {
  nombre: string;
  min: number;
  max: number;
  paso: number;
  decimales: number;
  unidad?: string;
  leer: (p: ParametrosPista) => number;
  escribir: (p: ParametrosPista, v: number) => void;
}

type ClaveNumerica = 'longitudOnda' | 'sinuosidadMaxima' | 'abombamientoLateral' | 'abombamientoNormal' | 'giroMaximo' | 'irregularidad' | 'temblor' | 'margenObstaculo' | 'distanciaMinimaPistas' | 'anguloMinimoSalida';

const simple = (clave: ClaveNumerica, nombre: string, min: number, max: number, paso: number, decimales: number, unidad?: string): Deslizador => ({
  nombre,
  min,
  max,
  paso,
  decimales,
  unidad,
  leer: (p) => p[clave],
  escribir: (p, v) => (p[clave] = v),
});

/** Extremo de la banda de un color; si se cruza con el otro extremo, lo arrastra. */
const banda = (color: ColorPista, extremo: 0 | 1, nombre: string): Deslizador => ({
  nombre,
  min: 0,
  max: 0.8,
  paso: 0.01,
  decimales: 2,
  leer: (p) => p.bandas[color][extremo],
  escribir: (p, v) => {
    const [lo, hi] = p.bandas[color];
    p.bandas[color] = extremo === 0 ? [v, Math.max(hi, v)] : [Math.min(lo, v), v];
  },
});

const DESLIZADORES: Deslizador[] = [
  simple('longitudOnda', 'Onda', 150, 1200, 10, 0, 'm'),
  simple('sinuosidadMaxima', 'Sinuosidad máx.', 1.2, 2.5, 0.05, 2),
  simple('abombamientoLateral', 'Abomb. lateral', 0, 0.3, 0.01, 2),
  simple('abombamientoNormal', 'Abomb. normal', 0, 0.2, 0.01, 2),
  simple('giroMaximo', 'Giro salida máx.', 0, 80, 10, 0, '°'),
  simple('irregularidad', 'Irregularidad', 0, 1, 0.05, 2),
  simple('temblor', 'Temblor', 0, 80, 1, 0, 'm'),
  simple('margenObstaculo', 'Margen plaza', 0, 100, 5, 0, 'm'),
  simple('distanciaMinimaPistas', 'Dist. mín. pistas', 0, 150, 5, 0, 'm'),
  simple('anguloMinimoSalida', 'Ángulo salida', 0, 90, 1, 0, '°'),
  banda('verde', 0, 'Verde mín.'),
  banda('verde', 1, 'Verde máx.'),
  banda('azul', 0, 'Azul mín.'),
  banda('azul', 1, 'Azul máx.'),
  banda('roja', 0, 'Roja mín.'),
  banda('roja', 1, 'Roja máx.'),
  banda('negra', 0, 'Negra mín.'),
  banda('negra', 1, 'Negra máx.'),
];

type ParametrosSim = Juego['parametrosSim'];

/** Deslizador de un parámetro de los esquiadores (bloque `esquiador` de config.ts). */
interface DeslizadorSim {
  nombre: string;
  min: number;
  max: number;
  paso: number;
  decimales: number;
  leer: (p: ParametrosSim) => number;
  escribir: (p: ParametrosSim, v: number) => void;
}

type ClaveSim = 'diversionSuNivel' | 'diversionForzada' | 'diversionPorNivelInferior' | 'umbralMarcha' | 'pesoSuNivel';

const sim = (clave: ClaveSim, nombre: string, min: number, max: number, paso: number, decimales: number): DeslizadorSim => ({
  nombre,
  min,
  max,
  paso,
  decimales,
  leer: (p) => p[clave],
  escribir: (p, v) => (p[clave] = v),
});

/** Peso de un nivel en la mezcla de llegadas (se normaliza al sortear). */
const peso = (nivel: number, nombre: string): DeslizadorSim => ({
  nombre,
  min: 0,
  max: 1,
  paso: 0.05,
  decimales: 2,
  leer: (p) => p.mezclaNiveles[nivel],
  escribir: (p, v) => (p.mezclaNiveles = p.mezclaNiveles.map((x, i) => (i === nivel ? v : x))),
});

const DESLIZADORES_SIM: DeslizadorSim[] = [
  peso(0, 'Peso verdes'),
  peso(1, 'Peso azules'),
  peso(2, 'Peso rojos'),
  peso(3, 'Peso negros'),
  sim('diversionSuNivel', 'Div. su nivel', 0, 0.5, 0.01, 2),
  sim('diversionForzada', 'Div. forzada', 0, 0.3, 0.01, 2),
  sim('diversionPorNivelInferior', 'Div. − por nivel', 0, 0.5, 0.01, 2),
  sim('umbralMarcha', 'Umbral marcha', 0, 1, 0.05, 2),
  sim('pesoSuNivel', 'Pref. su nivel', 1, 10, 0.5, 1),
];

// Franja compacta arriba, a todo lo ancho: en vertical, la parte alta del
// mapa es cielo vacío, así que no tapa las pistas mientras se ajustan.
const ESTILO = `
#ajustes { position: fixed; top: 56px; left: 8px; right: 8px; z-index: 10;
  font: 13px system-ui, sans-serif; color: #262a31; }
#ajustes summary { list-style: none; cursor: pointer; user-select: none; padding: 6px 12px;
  background: rgba(241,243,244,.95); border: 2px solid #262a31; border-radius: 10px; width: max-content; margin-left: auto; }
#ajustes summary::-webkit-details-marker { display: none; }
#ajustes .cuerpo { margin-top: 6px; box-sizing: border-box; padding: 6px 10px;
  background: rgba(241,243,244,.93); border: 2px solid #262a31; border-radius: 10px;
  max-height: 40vh; max-height: 40dvh; overflow-y: auto; max-width: 560px; margin-left: auto; }
#ajustes .fila { display: grid; grid-template-columns: 7.8em 1fr 4.2em; align-items: center; gap: 6px; min-height: 32px; white-space: nowrap; }
#ajustes .valor { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
#ajustes input[type=range] { width: 100%; margin: 0; }
#ajustes select { width: 100%; padding: 4px; font: inherit; }
#ajustes .fila.modo { grid-template-columns: 7.8em 1fr; }
#ajustes .botones { display: flex; gap: 8px; margin: 6px 0 2px; }
#ajustes button { flex: 1; padding: 8px 6px; font: inherit; font-weight: 600; border: 2px solid #262a31;
  border-radius: 8px; background: #fff; color: #262a31; }
#ajustes h3 { margin: 10px 0 2px; font-size: 13px; }
#ajustes .herramientas button { padding: 8px 2px; font-size: 12px; }
#ajustes button.activa { background: #262a31; color: #fff; }
#ajustes .nota { margin: 4px 0 2px; color: #5b616b; font-size: 11px; }
`;

const coma = (x: number, d: number) => x.toFixed(d).replace('.', ',');

/**
 * `alCambiarAltura` recibe los píxeles que ocupa el panel desde arriba cuando
 * está abierto (0 si está plegado), para encajar el mapa debajo.
 */
export function montarPanelAjustes(juego: Juego, alCambiarAltura: (px: number) => void): void {
  const pista = juego.red.reglas.pista;
  const iniciales = { ...pista, bandas: copiarBandas(pista.bandas) };

  const estilo = document.createElement('style');
  estilo.textContent = ESTILO;
  document.head.append(estilo);

  const panel = document.createElement('details');
  panel.id = 'ajustes';
  panel.innerHTML = `<summary>Ajustes</summary><div class="cuerpo"></div>`;
  const cuerpo = panel.querySelector('.cuerpo')!;

  // Un solo recálculo por fotograma aunque el deslizador mande muchos eventos.
  let pendiente = false;
  const recalcular = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      juego.recalcularPistas();
    });
  };

  const refrescos: (() => void)[] = [];
  for (const d of DESLIZADORES) {
    const fila = document.createElement('label');
    fila.className = 'fila';
    const valor = document.createElement('span');
    valor.className = 'valor';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.paso);
    const pintar = () => {
      input.value = String(d.leer(pista));
      valor.textContent = `${coma(d.leer(pista), d.decimales)}${d.unidad ? ' ' + d.unidad : ''}`;
    };
    input.addEventListener('input', () => {
      d.escribir(pista, Number(input.value));
      // Repinta todos: mover un extremo de banda puede arrastrar el otro.
      refrescos.forEach((f) => f());
      recalcular();
    });
    pintar();
    refrescos.push(pintar);
    fila.append(d.nombre, input, valor);
    cuerpo.append(fila);
  }

  const labelModo = document.createElement('label');
  labelModo.className = 'fila modo';
  labelModo.append('Pendiente obj.');
  const select = document.createElement('select');
  select.innerHTML = `<option value="central">Central de la banda</option><option value="cercana">La más cercana a la recta</option>`;
  const pintarModo = () => (select.value = pista.pendienteObjetivo);
  select.addEventListener('change', () => {
    pista.pendienteObjetivo = select.value as PendienteObjetivo;
    recalcular();
  });
  pintarModo();
  refrescos.push(pintarModo);
  labelModo.append(select);
  cuerpo.append(labelModo);

  // Esquiadores: niveles y diversión. Se aplican al momento, sin recalcular.
  const parametros = juego.parametrosSim;
  const inicialesSim = { ...parametros, mezclaNiveles: [...parametros.mezclaNiveles] };
  const tituloSim = document.createElement('h3');
  tituloSim.textContent = 'Esquiadores';
  cuerpo.append(tituloSim);
  for (const d of DESLIZADORES_SIM) {
    const fila = document.createElement('label');
    fila.className = 'fila';
    const valor = document.createElement('span');
    valor.className = 'valor';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(d.min);
    input.max = String(d.max);
    input.step = String(d.paso);
    const pintar = () => {
      input.value = String(d.leer(parametros));
      valor.textContent = coma(d.leer(parametros), d.decimales);
    };
    input.addEventListener('input', () => {
      d.escribir(parametros, Number(input.value));
      pintar();
    });
    pintar();
    refrescos.push(pintar);
    fila.append(d.nombre, input, valor);
    cuerpo.append(fila);
  }

  const botones = document.createElement('div');
  botones.className = 'botones';
  const copiar = document.createElement('button');
  copiar.textContent = 'Copiar valores';
  copiar.addEventListener('click', async () => {
    const claves = Object.keys(CONFIG.esquiador);
    const ok = await copiarTexto(textoConfigPista({ ...pista }) + '\n\n' + textoConfigEsquiador({ ...parametros }, claves));
    copiar.textContent = ok ? 'Copiado' : 'No se pudo copiar';
    setTimeout(() => (copiar.textContent = 'Copiar valores'), 1500);
  });
  const restablecer = document.createElement('button');
  restablecer.textContent = 'Restablecer';
  restablecer.addEventListener('click', () => {
    Object.assign(pista, { ...iniciales, bandas: copiarBandas(iniciales.bandas) });
    Object.assign(parametros, { ...inicialesSim, mezclaNiveles: [...inicialesSim.mezclaNiveles] });
    refrescos.forEach((f) => f());
    recalcular();
  });
  botones.append(copiar, restablecer);

  const nota = document.createElement('div');
  nota.className = 'nota';
  nota.textContent = `Herramienta temporal de calibración. Toca una pista para ver su color, s y pendiente; a trazos cortos, las que ya no caben en su color. «Copiar valores» copia los bloques pista y esquiador. En config.ts: onda ${CONFIG.pista.longitudOnda} m, s máx. ${coma(CONFIG.pista.sinuosidadMaxima, 2)}.`;
  cuerpo.append(botones, nota);
  montarEditorMapa(juego, cuerpo);

  document.body.append(panel);
  const avisarAltura = () => alCambiarAltura(panel.open ? panel.getBoundingClientRect().bottom + 6 : 0);
  panel.addEventListener('toggle', avisarAltura);
  window.addEventListener('resize', () => requestAnimationFrame(avisarAltura));
}

const CLAVE_MAPA = 'remontes.mapaPruebas';

/**
 * Editor del mapa de pruebas: mover, añadir y borrar puntos, y cambiar el
 * desnivel del terreno. El mapa se guarda en este navegador (si se puede) y
 * se copia como texto para pegarlo en src/core/mapa.ts.
 */
function montarEditorMapa(juego: Juego, cuerpo: Element): void {
  const cotaOriginal = juego.cotaMaxima;
  try {
    const guardado = localStorage.getItem(CLAVE_MAPA);
    if (guardado) {
      const { definicion, cotaMax } = JSON.parse(guardado) as { definicion: DefinicionNodo[]; cotaMax: number };
      if (Array.isArray(definicion) && definicion.length > 0 && cotaMax > 0) juego.cargarMapa(definicion, cotaMax);
    }
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): se empieza con el mapa original.
  }
  juego.alCambiarMapa = () => {
    try {
      localStorage.setItem(CLAVE_MAPA, JSON.stringify({ definicion: juego.definicion, cotaMax: juego.cotaMaxima }));
    } catch {
      // Sin almacenamiento: el mapa dura lo que la página.
    }
  };

  const titulo = document.createElement('h3');
  titulo.textContent = 'Mapa de pruebas';
  const herramientas = document.createElement('div');
  herramientas.className = 'botones herramientas';
  const opciones: [HerramientaMapa, string][] = [
    ['mover', 'Mover'],
    ['base', '+ Base'],
    ['intermedio', '+ Interm.'],
    ['cima', '+ Cima'],
    ['borrar', 'Borrar'],
  ];
  const botonesHerramienta = opciones.map(([h, texto]) => {
    const b = document.createElement('button');
    b.textContent = texto;
    b.addEventListener('click', () => {
      juego.herramientaMapa = juego.herramientaMapa === h ? null : h;
      pintarHerramientas();
    });
    return { h, b };
  });
  const pintarHerramientas = () => botonesHerramienta.forEach(({ h, b }) => b.classList.toggle('activa', juego.herramientaMapa === h));
  herramientas.append(...botonesHerramienta.map((x) => x.b));

  // Desnivel: la cota del pie se mantiene y el terreno se estira hasta la máxima.
  const fila = document.createElement('label');
  fila.className = 'fila';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1700';
  input.max = '4000';
  input.step = '50';
  const valor = document.createElement('span');
  valor.className = 'valor';
  const pintarCota = () => {
    input.value = String(juego.cotaMaxima);
    valor.textContent = `${juego.cotaMaxima} m`;
  };
  let pendiente = false;
  input.addEventListener('input', () => {
    valor.textContent = `${input.value} m`;
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      juego.cambiarDesnivel(Number(input.value));
    });
  });
  pintarCota();
  fila.append('Cota máx.', input, valor);

  const botones = document.createElement('div');
  botones.className = 'botones';
  const copiar = document.createElement('button');
  copiar.textContent = 'Copiar mapa';
  copiar.addEventListener('click', async () => {
    const texto = textoMapa(juego.definicion) + `// alturas.cotaMax en config.ts: ${juego.cotaMaxima}\n`;
    const ok = await copiarTexto(texto);
    copiar.textContent = ok ? 'Copiado' : 'No se pudo copiar';
    setTimeout(() => (copiar.textContent = 'Copiar mapa'), 1500);
  });
  const original = document.createElement('button');
  original.textContent = 'Mapa original';
  original.addEventListener('click', () => {
    juego.cargarMapa(MAPA_INICIAL, cotaOriginal);
    pintarCota();
  });
  botones.append(copiar, original);

  const nota = document.createElement('div');
  nota.className = 'nota';
  nota.textContent =
    'Mover o cambiar la cota máx. conserva lo construido (las pistas que ya no caben en su color quedan a trazos cortos). Añadir o borrar un punto rehace la red y omite lo que ya no se pueda construir. El mapa se guarda en este navegador; «Mapa original» lo vacía.';
  cuerpo.append(titulo, herramientas, fila, botones, nota);
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Alternativa para navegadores sin acceso al portapapeles asíncrono.
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
