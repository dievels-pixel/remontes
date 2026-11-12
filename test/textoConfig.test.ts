import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { textoConfigEsquiador, textoConfigPista } from '../src/herramientas/textoConfig';

describe('Texto para copiar los ajustes', () => {
  it('reproduce el bloque pista con los valores actuales y sin ruido de coma flotante', () => {
    const t = textoConfigPista({ ...CONFIG.pista, sinuosidadMaxima: 0.1 + 0.2, pendienteObjetivo: 'cercana' });
    const [vlo, vhi] = CONFIG.pista.bandas.verde;
    expect(t.startsWith(`  pista: {\n    bandas: {\n      verde: [${vlo}, ${vhi}],`)).toBe(true);
    expect(t).toContain('    sinuosidadMaxima: 0.3,\n');
    expect(t).toContain(`    longitudOnda: ${CONFIG.pista.longitudOnda},\n`);
    expect(t).toContain("    pendienteObjetivo: 'cercana' as PendienteObjetivo,\n");
    expect(t).toContain(`    temblor: ${CONFIG.pista.temblor},\n`);
    expect(t.endsWith('  },')).toBe(true);
  });

  it('reproduce el bloque esquiador solo con sus claves, en su orden, y la mezcla como lista', () => {
    const t = textoConfigEsquiador({ umbralMarcha: 0.1 + 0.2, mezclaNiveles: [0.4, 0.3, 0.2, 0.1], velocidadRemonte: 160 }, ['mezclaNiveles', 'umbralMarcha']);
    expect(t).toBe('  esquiador: {\n    mezclaNiveles: [0.4, 0.3, 0.2, 0.1],\n    umbralMarcha: 0.3,\n  },');
  });
});
