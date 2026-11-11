// Simulación de esquiadores sobre la red: entran por la plaza, hacen cola en
// los remontes, suben en bolitas, bajan por pistas y vuelven a empezar.
// Lógica pura: ni DOM ni canvas.
import type { Azar } from './azar';
import type { Red, Remonte, Pista } from './red';
import { distancia, type Punto } from './vector';

export interface ParametrosSimulacion {
  velocidadRemonte: number;
  intervaloBolitas: number;
  capacidadBolita: number;
  llegadasPorMinuto: number;
  poblacionMaxima: number;
  velocidadAndando: number;
  velocidadBasePista: number;
  factorPendiente: number;
}

export type Esquiador =
  | { id: number; estado: 'andando'; origen: Punto; hacia: number; recorrido: number; largo: number }
  | { id: number; estado: 'cola'; nodo: number; remonte: number }
  | { id: number; estado: 'remonte'; remonte: number }
  | { id: number; estado: 'pista'; pista: number; recorrido: number }
  | { id: number; estado: 'espera'; nodo: number };

export interface Bolita {
  recorrido: number;
  pasajeros: number[];
}

export class Simulacion {
  readonly esquiadores = new Map<number, Esquiador>();
  /** Bolitas en movimiento por remonte (índice = id del remonte). */
  readonly bolitas: Bolita[][] = [];
  /** Cola de cada remonte, en orden de llegada. */
  readonly colas: number[][] = [];
  bajadasCompletadas = 0;
  tiempo = 0;
  private temporizadores: number[] = [];
  private llegadasPendientes = 0;
  private siguienteId = 0;

  constructor(
    readonly red: Red,
    readonly p: ParametrosSimulacion,
    readonly entrada: Punto,
    private readonly azar: Azar,
  ) {}

  get poblacion(): number {
    return this.esquiadores.size;
  }

  paso(dt: number): void {
    this.tiempo += dt;
    this.sincronizarRemontes();
    this.generarLlegadas(dt);
    this.moverRemontes(dt);
    for (const e of [...this.esquiadores.values()]) this.moverEsquiador(e, dt);
  }

  velocidadEnPista(pista: Pista): number {
    return this.p.velocidadBasePista + this.p.factorPendiente * pista.pendiente;
  }

  private sincronizarRemontes(): void {
    while (this.bolitas.length < this.red.remontes.length) {
      this.bolitas.push([]);
      this.colas.push([]);
      this.temporizadores.push(0);
    }
  }

  private basesEnServicio(): number[] {
    return this.red.nodos
      .filter((n) => n.tipo === 'base' && this.red.salidas(n.id).remontes.length > 0)
      .map((n) => n.id);
  }

  private generarLlegadas(dt: number): void {
    const bases = this.basesEnServicio();
    if (bases.length === 0) {
      this.llegadasPendientes = 0;
      return;
    }
    this.llegadasPendientes += (dt * this.p.llegadasPorMinuto) / 60;
    while (this.llegadasPendientes >= 1) {
      this.llegadasPendientes -= 1;
      if (this.poblacion >= this.p.poblacionMaxima) continue;
      const id = this.siguienteId++;
      this.caminarABase(id, this.entrada, bases);
    }
  }

  private caminarABase(id: number, origen: Punto, bases: number[]): void {
    const hacia = this.elegir(bases, (b) => 1 / (1 + this.colaEnNodo(b)));
    this.esquiadores.set(id, {
      id,
      estado: 'andando',
      origen: { x: origen.x, y: origen.y },
      hacia,
      recorrido: 0,
      largo: distancia(origen, this.red.nodo(hacia)),
    });
  }

  colaEnNodo(nodo: number): number {
    let n = 0;
    for (const r of this.red.remontes) if (r.desde === nodo) n += this.colas[r.id]?.length ?? 0;
    return n;
  }

  /** Decide qué hace un esquiador que acaba de llegar a un nodo. */
  private decidir(id: number, nodo: number): void {
    const { remontes, pistas } = this.red.salidas(nodo);
    type Opcion = { remonte: Remonte } | { pista: Pista };
    const opciones: Opcion[] = [...remontes.map((remonte) => ({ remonte })), ...pistas.map((pista) => ({ pista }))];
    if (opciones.length === 0) {
      if (this.red.nodo(nodo).tipo === 'base') {
        const bases = this.basesEnServicio();
        if (bases.length > 0) {
          this.caminarABase(id, this.red.nodo(nodo), bases);
          return;
        }
      }
      // No debería ocurrir gracias a la regla de nodo viable; se reintenta.
      this.esquiadores.set(id, { id, estado: 'espera', nodo });
      return;
    }
    // Reparto por cola, no por camino más corto: las colas largas disuaden.
    const o = this.elegir(opciones, (op) => ('remonte' in op ? 1 / (1 + this.colas[op.remonte.id].length) : 1));
    if ('remonte' in o) {
      this.colas[o.remonte.id].push(id);
      this.esquiadores.set(id, { id, estado: 'cola', nodo, remonte: o.remonte.id });
    } else {
      this.esquiadores.set(id, { id, estado: 'pista', pista: o.pista.id, recorrido: 0 });
    }
  }

  private moverRemontes(dt: number): void {
    const { velocidadRemonte: v, intervaloBolitas: intervalo, capacidadBolita } = this.p;
    for (const r of this.red.remontes) {
      const bolitas = this.bolitas[r.id];
      for (const b of bolitas) b.recorrido += v * dt;
      if (this.red.enServicio(r)) {
        this.temporizadores[r.id] += dt;
        while (this.temporizadores[r.id] >= intervalo) {
          this.temporizadores[r.id] -= intervalo;
          const cola = this.colas[r.id];
          const pasajeros = cola.splice(0, capacidadBolita);
          for (const id of pasajeros) this.esquiadores.set(id, { id, estado: 'remonte', remonte: r.id });
          // La bolita nace ya adelantada lo que le corresponde dentro del paso.
          bolitas.push({ recorrido: this.temporizadores[r.id] * v, pasajeros });
        }
      }
      while (bolitas.length > 0 && bolitas[0].recorrido >= r.longitud) {
        const b = bolitas.shift()!;
        for (const id of b.pasajeros) this.decidir(id, r.hasta);
      }
    }
  }

  private moverEsquiador(e: Esquiador, dt: number): void {
    switch (e.estado) {
      case 'andando':
        e.recorrido += this.p.velocidadAndando * dt;
        if (e.recorrido >= e.largo) this.decidir(e.id, e.hacia);
        break;
      case 'pista': {
        const pista = this.red.pistas[e.pista];
        e.recorrido += this.velocidadEnPista(pista) * dt;
        if (e.recorrido >= pista.trazado.longitud) {
          if (this.red.nodo(pista.hasta).tipo === 'base') this.bajadasCompletadas++;
          this.decidir(e.id, pista.hasta);
        }
        break;
      }
      case 'espera':
        this.decidir(e.id, e.nodo);
        break;
      case 'cola':
      case 'remonte':
        break;
    }
  }

  private elegir<T>(opciones: T[], peso: (o: T) => number): T {
    const pesos = opciones.map(peso);
    const total = pesos.reduce((a, b) => a + b, 0);
    let r = this.azar() * total;
    for (let i = 0; i < opciones.length; i++) {
      r -= pesos[i];
      if (r <= 0) return opciones[i];
    }
    return opciones[opciones.length - 1];
  }
}
