// Herramienta temporal de calibración: texto del bloque `pista` de
// src/config.ts con los valores actuales, para copiarlo y fijarlo después.
import type { ReglasPista } from '../core/red';

type ParametrosPista = ReglasPista & Record<string, unknown>;

function numero(x: unknown): string {
  // Sin ruido de coma flotante (0.30000000000000004 → 0.3).
  return typeof x === 'number' ? String(Number(x.toFixed(4))) : JSON.stringify(x);
}

export function textoConfigPista(p: ParametrosPista): string {
  const lineas = ['  pista: {', '    bandas: {'];
  for (const [color, [a, b]] of Object.entries(p.bandas)) lineas.push(`      ${color}: [${numero(a)}, ${numero(b)}],`);
  lineas.push('    },');
  for (const [clave, valor] of Object.entries(p)) {
    if (clave === 'bandas') continue;
    if (clave === 'pendienteObjetivo') lineas.push(`    pendienteObjetivo: '${String(valor)}' as PendienteObjetivo,`);
    else lineas.push(`    ${clave}: ${numero(valor)},`);
  }
  lineas.push('  },');
  return lineas.join('\n');
}
