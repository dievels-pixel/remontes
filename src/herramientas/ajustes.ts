// HERRAMIENTA TEMPORAL DE CALIBRACIÓN. No forma parte del diseño del juego.
// Panel HTML encima del canvas, solo con ?ajustes en la dirección, para ajustar
// a ojo la forma de las pistas. Cambia los parámetros en memoria (los de
// src/config.ts no se tocan) y recalcula al momento las pistas abiertas y los
// proyectos. "Copiar valores" deja en el portapapeles el bloque de config.ts.
import { CONFIG } from '../config';
import { copiarBandas, type ColorPista, type PendienteObjetivo } from '../core/colores';
import type { Juego } from '../juego';
import { textoConfigPista } from './textoConfig';

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

type ClaveNumerica = 'longitudOnda' | 'sinuosidadMaxima' | 'abombamientoLateral' | 'abombamientoNormal' | 'irregularidad' | 'temblor' | 'margenObstaculo' | 'distanciaMinimaPistas' | 'anguloMinimoSalida';

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
  simple('irregularidad', 'Irregularidad', 0, 1, 0.05, 2),
  simple('temblor', 'Temblor', 0, 80, 1, 0, 'm'),
  simple('margenObstaculo', 'Margen plaza', 0, 100, 5, 0, 'm'),
  simple('distanciaMinimaPistas', 'Dist. mín. pistas', 0, 150, 5, 0, 'm'),
  simple('anguloMinimoSalida', 'Ángulo salida', 0, 60, 1, 0, '°'),
  banda('verde', 0, 'Verde mín.'),
  banda('verde', 1, 'Verde máx.'),
  banda('azul', 0, 'Azul mín.'),
  banda('azul', 1, 'Azul máx.'),
  banda('roja', 0, 'Roja mín.'),
  banda('roja', 1, 'Roja máx.'),
  banda('negra', 0, 'Negra mín.'),
  banda('negra', 1, 'Negra máx.'),
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

  const botones = document.createElement('div');
  botones.className = 'botones';
  const copiar = document.createElement('button');
  copiar.textContent = 'Copiar valores';
  copiar.addEventListener('click', async () => {
    const ok = await copiarTexto(textoConfigPista({ ...pista }));
    copiar.textContent = ok ? 'Copiado' : 'No se pudo copiar';
    setTimeout(() => (copiar.textContent = 'Copiar valores'), 1500);
  });
  const restablecer = document.createElement('button');
  restablecer.textContent = 'Restablecer';
  restablecer.addEventListener('click', () => {
    Object.assign(pista, { ...iniciales, bandas: copiarBandas(iniciales.bandas) });
    refrescos.forEach((f) => f());
    recalcular();
  });
  botones.append(copiar, restablecer);

  const nota = document.createElement('div');
  nota.className = 'nota';
  nota.textContent = `Herramienta temporal de calibración. Toca una pista para ver su color, s y pendiente; a trazos cortos, las que ya no caben en su color. En config.ts: onda ${CONFIG.pista.longitudOnda} m, s máx. ${coma(CONFIG.pista.sinuosidadMaxima, 2)}.`;
  cuerpo.append(botones, nota);

  document.body.append(panel);
  const avisarAltura = () => alCambiarAltura(panel.open ? panel.getBoundingClientRect().bottom + 6 : 0);
  panel.addEventListener('toggle', avisarAltura);
  window.addEventListener('resize', () => requestAnimationFrame(avisarAltura));
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
