import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { textoConfigPista } from '../src/herramientas/textoConfig';

describe('Texto para copiar los ajustes', () => {
  it('reproduce el bloque pista con los valores actuales y sin ruido de coma flotante', () => {
    const t = textoConfigPista({ ...CONFIG.pista, sinuosidadMaxima: 0.1 + 0.2, pendienteObjetivo: 'cercana' });
    expect(t.startsWith('  pista: {\n    bandas: {\n      verde: [0.05, 0.15],')).toBe(true);
    expect(t).toContain('    sinuosidadMaxima: 0.3,\n');
    expect(t).toContain(`    longitudOnda: ${CONFIG.pista.longitudOnda},\n`);
    expect(t).toContain("    pendienteObjetivo: 'cercana' as PendienteObjetivo,\n");
    expect(t).toContain(`    temblor: ${CONFIG.pista.temblor},\n`);
    expect(t.endsWith('  },')).toBe(true);
  });
});
