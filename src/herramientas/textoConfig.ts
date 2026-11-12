// Herramienta temporal de calibración: texto de los bloques `pista` y
// `esquiador` de src/config.ts con los valores actuales, para copiarlos y
// fijarlos después.
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

/** Bloque `esquiador`: solo las claves de `claves` (las de config.ts), en su orden. */
export function textoConfigEsquiador(p: Record<string, unknown>, claves: readonly string[]): string {
  const lineas = ['  esquiador: {'];
  for (const clave of claves) {
    const v = p[clave];
    lineas.push(`    ${clave}: ${Array.isArray(v) ? `[${v.map(numero).join(', ')}]` : numero(v)},`);
  }
  lineas.push('  },');
  return lineas.join('\n');
}
