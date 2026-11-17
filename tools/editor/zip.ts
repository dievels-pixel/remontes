// ZIP mínimo sin compresión (almacenado), suficiente para descargar la carpeta
// de un nivel de una vez. Lógica pura.

const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archivo ZIP con esos archivos (nombre con carpeta, p. ej. «mi-nivel/nivel.json»). */
export function crearZip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const cod = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = cod.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new Uint8Array(30 + nombre.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // nombres en UTF-8
    l.setUint16(8, 0, true); // almacenado
    l.setUint32(14, crc, true);
    l.setUint32(18, a.datos.length, true);
    l.setUint32(22, a.datos.length, true);
    l.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    locales.push(local, a.datos);
    centrales.push(central);
    desplazamiento += local.length + a.datos.length;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);
  const partes = [...locales, ...centrales, fin];
  const r = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of partes) {
    r.set(x, o);
    o += x.length;
  }
  return r;
}
