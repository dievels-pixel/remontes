// PNG en escala de grises para los mapas de alturas, fuera del navegador
// (scripts y pruebas). En el juego lo decodifica el navegador.
// Escribe grises de 8 bits; lee también color (toma el primer canal) y alfa,
// por si el mapa se retoca en un editor de imágenes que guarde en RGB.
import { deflateSync, inflateSync } from 'node:zlib';

const FIRMA = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo: string, datos: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(tipo);
  const r = new Uint8Array(12 + datos.length);
  const v = new DataView(r.buffer);
  v.setUint32(0, datos.length);
  r.set(t, 4);
  r.set(datos, 8);
  v.setUint32(8 + datos.length, crc(r.subarray(4, 8 + datos.length)));
  return r;
}

/** PNG gris de 8 bits sin filtros. `gris` tiene ancho × alto valores 0..255, por filas. */
export function codificarPngGris(ancho: number, alto: number, gris: Uint8Array): Uint8Array {
  if (gris.length !== ancho * alto) throw new Error('Tamaño incoherente');
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, ancho);
  v.setUint32(4, alto);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8 bits, gris, compresión, filtro y entrelazado estándar
  const crudo = new Uint8Array(alto * (ancho + 1));
  for (let y = 0; y < alto; y++) crudo.set(gris.subarray(y * ancho, (y + 1) * ancho), y * (ancho + 1) + 1);
  const partes = [FIRMA, trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo)), trozo('IEND', new Uint8Array())];
  const r = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    r.set(p, o);
    o += p.length;
  }
  return r;
}

const CANALES: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Lee un PNG de 8 bits sin entrelazar y devuelve el primer canal (el gris). */
export function decodificarPngGris(bytes: Uint8Array): { ancho: number; alto: number; gris: Uint8Array } {
  if (!FIRMA.every((b, i) => bytes[i] === b)) throw new Error('No es un PNG');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let ancho = 0;
  let alto = 0;
  let canales = 1;
  const idat: Uint8Array[] = [];
  while (o < bytes.length) {
    const largo = v.getUint32(o);
    const tipo = new TextDecoder().decode(bytes.subarray(o + 4, o + 8));
    const datos = bytes.subarray(o + 8, o + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = v.getUint32(o + 8);
      alto = v.getUint32(o + 12);
      const [profundidad, color, , , entrelazado] = datos.subarray(8, 13);
      if (profundidad !== 8 || entrelazado !== 0 || !(color in CANALES)) throw new Error('PNG no admitido: hace falta 8 bits, sin paleta ni entrelazado');
      canales = CANALES[color];
    } else if (tipo === 'IDAT') idat.push(datos);
    else if (tipo === 'IEND') break;
    o += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const actual = new Uint8Array(fila);
  let previa = new Uint8Array(fila);
  const gris = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    const f = crudo.subarray(y * (fila + 1) + 1, (y + 1) * (fila + 1));
    for (let i = 0; i < fila; i++) {
      const a = i >= canales ? actual[i - canales] : 0;
      const b = previa[i];
      const c = i >= canales ? previa[i - canales] : 0;
      let p = 0;
      if (filtro === 1) p = a;
      else if (filtro === 2) p = b;
      else if (filtro === 3) p = (a + b) >> 1;
      else if (filtro === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      actual[i] = (f[i] + p) & 0xff;
    }
    for (let x = 0; x < ancho; x++) gris[y * ancho + x] = actual[x * canales];
    previa = actual.slice();
  }
  return { ancho, alto, gris };
}
