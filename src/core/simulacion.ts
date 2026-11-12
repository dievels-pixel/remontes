// Simulación de esquiadores sobre la red: entran por la plaza, hacen cola en
// los remontes, suben en bolitas, bajan por pistas y vuelven a empezar.
// Cada esquiador tiene un nivel (verde, azul, roja o negra) y una diversión:
// solo baja por pistas de su nivel o más fáciles, se divierte en las de su
// nivel y se aburre en las más fáciles; muy aburrido, se va.
// Lógica pura: ni DOM ni canvas.
import type { Azar } from './azar';
import type { Hecho, Red, Remonte, Pista } from './red';
import { distancia, type Punto } from './vector';

export interface ParametrosSimulacion {
  velocidadRemonte: number;
  intervaloBolitas: number;
  capacidadBolita: number;
  llegadasPorMinuto: number;
  poblacionMaxima: number;
  velocidadAndando: number;
  distanciaBasesContiguas: number;
  penalizacionAndar: number;
  velocidadBasePista: number;
  factorPendiente: number;
  /** Proporción de cada nivel entre los que llegan: verde, azul, roja, negra. */
  mezclaNiveles: readonly number[];
  diversionInicial: number;
  diversionSuNivel: number;
  diversionForzada: number;
  diversionPorNivelInferior: number;
  umbralMarcha: number;
  pesoSuNivel: number;
}

export type Esquiador =
  | { id: number; estado: 'andando'; origen: Punto; hacia: number; recorrido: number; largo: number }
  | { id: number; estado: 'cola'; nodo: number; remonte: number }
  | { id: number; estado: 'remonte'; remonte: number }
  | { id: number; estado: 'pista'; pista: number; recorrido: number };

/** Lo que distingue a cada esquiador y no cambia con su estado. */
export interface Perfil {
  /** 0 verde, 1 azul, 2 roja, 3 negra. */
  nivel: number;
  /** 0 a 1: 1 = color pleno, 0 = gris. */
  diversion: number;
}

export interface Bolita {
  recorrido: number;
  pasajeros: number[];
}

export class Simulacion {
  readonly esquiadores = new Map<number, Esquiador>();
  readonly perfiles = new Map<number, Perfil>();
  /** Bolitas en movimiento por remonte (índice = id del remonte). */
  readonly bolitas: Bolita[][] = [];
  /** Cola de cada remonte, en orden de llegada. */
  readonly colas: number[][] = [];
  bajadasCompletadas = 0;
  /** Esquiadores que se han ido: aburridos o sin salida. */
  seFueron = 0;
  /**
   * Clientes potenciales que no han venido porque para su nivel no hay ninguna
   * bajada (decisión 2b): la afluencia crece menos. No cuentan como idos.
   */
  noVinieron = 0;
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
    for (const e of [...this.esquiadores.values()]) {
      // Puede haber cambiado de estado o haberse ido durante este mismo paso.
      if (this.esquiadores.get(e.id) === e) this.moverEsquiador(e, dt);
    }
  }

  /** Ajusta la simulación tras deshacer una construcción en la red. */
  alDeshacer(h: Hecho): void {
    if (h.tipo === 'remonte') {
      // Quien esperaba o subía en el remonte deshecho se va de la estación.
      const id = h.remonte.id;
      for (const e of this.colas[id] ?? []) this.irse(e);
      for (const b of this.bolitas[id] ?? []) for (const e of b.pasajeros) this.irse(e);
      this.colas.length = this.bolitas.length = this.temporizadores.length = id;
    } else {
      // Quien bajaba por la pista deshecha llega de golpe a su destino.
      for (const e of [...this.esquiadores.values()]) {
        if (e.estado === 'pista' && e.pista === h.pista.id) this.decidir(e.id, h.pista.hasta);
      }
    }
  }

  velocidadEnPista(pista: Pista): number {
    return this.p.velocidadBasePista + this.p.factorPendiente * pista.pendiente;
  }

  private irse(id: number): void {
    if (this.esquiadores.delete(id)) this.seFueron++;
    this.perfiles.delete(id);
  }

  private sincronizarRemontes(): void {
    while (this.bolitas.length < this.red.remontes.length) {
      this.bolitas.push([]);
      this.colas.push([]);
      this.temporizadores.push(0);
    }
  }

  /**
   * Bases desde las que un esquiador de ese nivel puede esquiar: con algún
   * remonte en servicio cuya llegada tenga bajada para su nivel.
   */
  basesPara(nivel: number): number[] {
    const viables = this.red.viablesPorNivel()[nivel];
    return this.red.nodos
      .filter((n) => n.tipo === 'base' && this.red.salidas(n.id).remontes.some((r) => viables.has(r.hasta)))
      .map((n) => n.id);
  }

  private sortearNivel(): number {
    const m = this.p.mezclaNiveles;
    const total = m.reduce((a, b) => a + b, 0);
    let r = this.azar() * total;
    for (let i = 0; i < m.length; i++) {
      r -= m[i];
      if (r <= 0) return i;
    }
    return m.length - 1;
  }

  private generarLlegadas(dt: number): void {
    if (!this.red.remontes.some((r) => this.red.enServicio(r))) {
      this.llegadasPendientes = 0;
      return;
    }
    this.llegadasPendientes += (dt * this.p.llegadasPorMinuto) / 60;
    while (this.llegadasPendientes >= 1) {
      this.llegadasPendientes -= 1;
      if (this.poblacion >= this.p.poblacionMaxima) continue;
      const nivel = this.sortearNivel();
      const bases = this.basesPara(nivel);
      // Si para su nivel no hay ninguna bajada, no viene: la estación no
      // ofrece nada para él y la afluencia es menor.
      if (bases.length === 0) {
        this.noVinieron++;
        continue;
      }
      const id = this.siguienteId++;
      this.perfiles.set(id, { nivel, diversion: this.p.diversionInicial });
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

  /** Bases distintas de `base` a una distancia no mayor que la de contigüidad. */
  basesContiguas(base: number): number[] {
    const b = this.red.nodo(base);
    return this.red.nodos
      .filter((n) => n.tipo === 'base' && n.id !== base && distancia(n, b) <= this.p.distanciaBasesContiguas)
      .map((n) => n.id);
  }

  /**
   * Decide qué hace un esquiador que acaba de llegar a un nodo, según su nivel:
   * solo remontes cuya llegada tenga bajada para él y pistas de su nivel o más
   * fáciles. Quien llega a una base andando no vuelve a cambiar de base, para
   * que no vaya y venga. Al llegar a una base, si está muy aburrido, se va.
   */
  private decidir(id: number, nodo: number, puedeAndar = true): void {
    const perfil = this.perfiles.get(id);
    if (!perfil) {
      this.irse(id);
      return;
    }
    const enBase = this.red.nodo(nodo).tipo === 'base';
    if (enBase && perfil.diversion < this.p.umbralMarcha) {
      this.irse(id);
      return;
    }
    const viables = this.red.viablesPorNivel()[perfil.nivel];
    const { remontes, pistas } = this.red.salidas(nodo);
    type Opcion = { remonte: Remonte } | { pista: Pista } | { andar: number };
    const opciones: Opcion[] = [
      ...remontes.filter((r) => viables.has(r.hasta)).map((remonte) => ({ remonte })),
      ...pistas.filter((p) => this.red.dificultad(p) <= perfil.nivel && viables.has(p.hasta)).map((pista) => ({ pista })),
    ];
    if (enBase && puedeAndar) {
      const suyas = new Set(this.basesPara(perfil.nivel));
      for (const b of this.basesContiguas(nodo)) if (suyas.has(b)) opciones.push({ andar: b });
    }
    if (opciones.length === 0) {
      if (enBase) {
        const bases = this.basesPara(perfil.nivel);
        if (bases.length > 0) {
          this.caminarABase(id, this.red.nodo(nodo), bases);
          return;
        }
      }
      // Sin salida para su nivel (sin pistas de su nivel, o tras deshacer
      // algo): el esquiador se va de la estación.
      this.irse(id);
      return;
    }
    // Reparto por cola y por nivel, no por camino más corto: las colas largas
    // disuaden y las pistas de su nivel atraen más que las fáciles.
    const o = this.elegir(opciones, (op) => {
      if ('remonte' in op) return 1 / (1 + this.colas[op.remonte.id].length);
      if ('andar' in op) return 1 / (1 + this.colaEnNodo(op.andar) + this.p.penalizacionAndar);
      return this.red.dificultad(op.pista) === perfil.nivel ? this.p.pesoSuNivel : 1;
    });
    if ('remonte' in o) {
      this.colas[o.remonte.id].push(id);
      this.esquiadores.set(id, { id, estado: 'cola', nodo, remonte: o.remonte.id });
    } else if ('pista' in o) {
      this.esquiadores.set(id, { id, estado: 'pista', pista: o.pista.id, recorrido: 0 });
    } else {
      this.caminarABase(id, this.red.nodo(nodo), [o.andar]);
    }
  }

  /**
   * Diversión tras bajar una pista: sube si es de su nivel (poco si está
   * forzada) y baja por cada nivel que la pista queda por debajo del suyo.
   */
  private divertirse(id: number, pista: Pista): void {
    const perfil = this.perfiles.get(id);
    if (!perfil) return;
    const diferencia = perfil.nivel - this.red.dificultad(pista);
    let cambio = 0;
    if (diferencia <= 0) cambio = this.red.forzada(pista) ? this.p.diversionForzada : this.p.diversionSuNivel;
    else cambio = -this.p.diversionPorNivelInferior * diferencia;
    perfil.diversion = Math.min(1, Math.max(0, perfil.diversion + cambio));
  }

  private moverRemontes(dt: number): void {
    const { velocidadRemonte: v, intervaloBolitas: intervalo, capacidadBolita } = this.p;
    for (const r of this.red.remontes) {
      const bolitas = this.bolitas[r.id];
      for (const b of bolitas) b.recorrido += v * dt;
      if (!this.red.enServicio(r) && this.colas[r.id].length > 0) {
        // El remonte ha dejado de funcionar (por deshacer su pista): su cola
        // busca otra salida.
        for (const id of this.colas[r.id].splice(0)) this.decidir(id, r.desde);
      }
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
        if (e.recorrido >= e.largo) this.decidir(e.id, e.hacia, false);
        break;
      case 'pista': {
        const pista = this.red.pistas[e.pista];
        e.recorrido += this.velocidadEnPista(pista) * dt;
        if (e.recorrido >= pista.trazado.longitud) {
          if (this.red.nodo(pista.hasta).tipo === 'base') this.bajadasCompletadas++;
          this.divertirse(e.id, pista);
          this.decidir(e.id, pista.hasta);
        }
        break;
      }
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
