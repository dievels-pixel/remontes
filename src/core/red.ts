// Red de la estación como grafo dirigido: nodos fijos, remontes (suben) y
// pistas (bajan). Aplica las reglas de "sin puntos ciegos" de docs/diseno.md.
import { hashPareja } from './azar';
import { trazarPista, type ParametrosCurva } from './curva';
import type { Polilinea } from './polilinea';
import { distancia } from './vector';

export type TipoNodo = 'base' | 'intermedio' | 'cima';

export interface Nodo {
  id: number;
  tipo: TipoNodo;
  x: number;
  y: number;
  cota: number;
  /** Otra estación del mismo pico: entre gemelos no hay remontes ni pistas. */
  gemelo?: number;
  /** Estación de desdoble de un pico: oculta hasta que la alcanza un remonte. */
  desdoble?: boolean;
}

export interface Remonte {
  id: number;
  desde: number;
  hasta: number;
  longitud: number;
}

export interface Pista {
  id: number;
  desde: number;
  hasta: number;
  lado: 1 | -1;
  trazado: Polilinea;
  /** Pendiente media efectiva: ΔH / L. */
  pendiente: number;
}

export interface ReglasRed {
  desnivelMinimoRemonte: number;
  maxPistasPorPareja: number;
  curva: ParametrosCurva;
}

export type Motivo =
  | 'ok'
  | 'mismo-nodo'
  | 'gemelos'
  | 'origen-inactivo'
  | 'destino-no-mas-alto'
  | 'destino-base'
  | 'destino-no-mas-bajo'
  | 'ya-existe'
  | 'origen-ocupado'
  | 'destino-ocupado'
  | 'pista-desde-base'
  | 'destino-no-viable';

export class Red {
  readonly nodos: readonly Nodo[];
  readonly remontes: Remonte[] = [];
  readonly pistas: Pista[] = [];

  constructor(nodos: Nodo[], readonly reglas: ReglasRed) {
    nodos.forEach((n, i) => {
      if (n.id !== i) throw new Error('Los id de nodo deben coincidir con su índice');
      if (n.gemelo !== undefined && nodos[n.gemelo]?.gemelo !== i) throw new Error('Gemelos no recíprocos');
    });
    this.nodos = nodos;
  }

  nodo(id: number): Nodo {
    return this.nodos[id];
  }

  /** Activo: es una base o lo alcanza algún remonte. */
  activo(id: number): boolean {
    return this.nodos[id].tipo === 'base' || this.remontes.some((r) => r.hasta === id);
  }

  /** Se muestra y se puede tocar: todo nodo salvo un desdoble aún sin remonte. */
  visible(id: number): boolean {
    return !this.nodos[id].desdoble || this.activo(id);
  }

  /** Un remonte funciona si hay al menos una pista activa desde su cima. */
  enServicio(r: Remonte): boolean {
    return this.pistas.some((p) => p.desde === r.hasta);
  }

  /** Viable como destino de pista: base o con alguna salida operativa. */
  viable(id: number): boolean {
    if (this.nodos[id].tipo === 'base') return true;
    return this.pistas.some((p) => p.desde === id) || this.remontes.some((r) => r.desde === id && this.enServicio(r));
  }

  puedeConstruirRemonte(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (this.nodos[desde].gemelo === hasta) return 'gemelos';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[hasta].tipo === 'base') return 'destino-base';
    if (this.nodos[hasta].cota < this.nodos[desde].cota + this.reglas.desnivelMinimoRemonte) return 'destino-no-mas-alto';
    if (this.remontes.some((r) => r.desde === desde && r.hasta === hasta)) return 'ya-existe';
    // Cada nodo admite como mucho un remonte que salga y uno que llegue.
    if (this.remontes.some((r) => r.desde === desde)) return 'origen-ocupado';
    if (this.remontes.some((r) => r.hasta === hasta)) return 'destino-ocupado';
    return 'ok';
  }

  puedeAbrirPista(desde: number, hasta: number): Motivo {
    if (desde === hasta) return 'mismo-nodo';
    if (this.nodos[desde].gemelo === hasta) return 'gemelos';
    if (!this.activo(desde)) return 'origen-inactivo';
    if (this.nodos[desde].tipo === 'base') return 'pista-desde-base';
    if (this.nodos[hasta].cota >= this.nodos[desde].cota) return 'destino-no-mas-bajo';
    if (this.pistasEntre(desde, hasta).length >= this.reglas.maxPistasPorPareja) return 'ya-existe';
    if (!this.viable(hasta)) return 'destino-no-viable';
    return 'ok';
  }

  construirRemonte(desde: number, hasta: number): Remonte {
    const motivo = this.puedeConstruirRemonte(desde, hasta);
    if (motivo !== 'ok') throw new Error(`No se puede construir el remonte: ${motivo}`);
    const r: Remonte = {
      id: this.remontes.length,
      desde,
      hasta,
      longitud: distancia(this.nodos[desde], this.nodos[hasta]),
    };
    this.remontes.push(r);
    return r;
  }

  abrirPista(desde: number, hasta: number): Pista {
    const motivo = this.puedeAbrirPista(desde, hasta);
    if (motivo !== 'ok') throw new Error(`No se puede abrir la pista: ${motivo}`);
    const semilla = hashPareja(desde, hasta);
    const existentes = this.pistasEntre(desde, hasta);
    // La primera pista de la pareja elige lado por semilla; la segunda va al
    // lado contrario, formando la lente alrededor del remonte.
    const lado: 1 | -1 = existentes.length > 0 ? (-existentes[0].lado as 1 | -1) : semilla & 1 ? 1 : -1;
    const a = this.nodos[desde];
    const b = this.nodos[hasta];
    const trazado = trazarPista(a, b, lado, semilla + existentes.length, this.reglas.curva);
    const p: Pista = {
      id: this.pistas.length,
      desde,
      hasta,
      lado,
      trazado,
      pendiente: (a.cota - b.cota) / trazado.longitud,
    };
    this.pistas.push(p);
    return p;
  }

  pistasEntre(desde: number, hasta: number): Pista[] {
    return this.pistas.filter((p) => p.desde === desde && p.hasta === hasta);
  }

  /** Salidas operativas de un nodo: remontes en servicio y pistas. */
  salidas(id: number): { remontes: Remonte[]; pistas: Pista[] } {
    return {
      remontes: this.remontes.filter((r) => r.desde === id && this.enServicio(r)),
      pistas: this.pistas.filter((p) => p.desde === id),
    };
  }
}
