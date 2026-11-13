// Simulación de esquiadores sobre la red: entran por la plaza, hacen cola en
// los remontes, suben en bolitas, bajan por pistas y vuelven a empezar.
// Cada esquiador tiene un nivel (verde, azul, roja o negra), un aguante en
// tiempo y un contento de 3 puntos (ver «Esquiadores: aguante, contento y
// pago» en la especificación). Solo baja por pistas de su nivel o más
// fáciles; se va cansado al agotar su aguante y enfadado si su contento
// llega a 0 o le echa una cola saturada.
// Lógica pura: ni DOM ni canvas.
import type { Azar } from './azar';
import type { Hecho, Red, Remonte, Pista } from './red';
import { distancia, type Punto } from './vector';

export interface ParametrosSimulacion {
  velocidadRemonte: number;
  intervaloBolitas: number;
  capacidadBolita: number;
  llegadasPorMinuto: number;
  velocidadAndando: number;
  distanciaBasesContiguas: number;
  penalizacionAndar: number;
  velocidadBasePista: number;
  factorPendiente: number;
  /** Proporción de cada nivel entre los que llegan: verde, azul, roja, negra. */
  mezclaNiveles: readonly number[];
  /** Aguante de cada esquiador, al azar entre estos dos valores (s de juego). */
  aguanteMinimo: number;
  aguanteMaximo: number;
  /** Contento al entrar y tope (puntos). */
  contentoInicial: number;
  /** Cuántas pistas recuerda para la variedad. */
  memoriaVariedad: number;
  /**
   * Gusto de una pista según cuántos niveles queda por debajo del esquiador:
   * [su nivel, uno por debajo, dos, tres]. El nivel es una preferencia, no
   * solo un filtro (una pista más difícil que su nivel no se elige nunca).
   */
  gustoPorDiferencia: readonly number[];
  /** Multiplica el peso de una pista que está entre sus últimas bajadas. */
  factorRepeticion: number;
  /** Multiplica el gusto de lo que hay tras cada remonte más que haya que coger. */
  descuentoPorRemonte: number;
  /** Personas en cola a partir de las que el anillo empieza a llenarse. */
  aforoCola: number;
  /** Segundos que tarda el anillo en llenarse (y en vaciarse) por completo. */
  tiempoAnillo: number;
}

/**
 * Peso de una pista en la elección de un esquiador: gusto (por diferencia de
 * niveles) × repetición (si la ha usado hace poco) × 1 / (1 + cola en su
 * destino). 0 si es más difícil que su nivel. Los remontes usan la misma
 * escala (ver Simulacion.decidir), para que pistas y remontes se comparen.
 */
export function pesoPista(nivel: number, dificultad: number, reciente: boolean, cola: number, p: Pick<ParametrosSimulacion, 'gustoPorDiferencia' | 'factorRepeticion'>): number {
  const d = nivel - dificultad;
  if (d < 0) return 0;
  const gusto = p.gustoPorDiferencia[Math.min(d, p.gustoPorDiferencia.length - 1)];
  return (gusto * (reciente ? p.factorRepeticion : 1)) / (1 + cola);
}

/** Por qué se va enfadado un esquiador (cada una suma una queja). */
export type CausaQueja = 'aburrimiento' | 'cola' | 'sinPistas';

export type Esquiador =
  | { id: number; estado: 'andando'; origen: Punto; hacia: number; recorrido: number; largo: number }
  | { id: number; estado: 'cola'; nodo: number; remonte: number }
  | { id: number; estado: 'remonte'; remonte: number }
  | { id: number; estado: 'pista'; pista: number; recorrido: number };

/** Lo que distingue a cada esquiador y no cambia con su estado. */
export interface Perfil {
  /** 0 verde, 1 azul, 2 roja, 3 negra. */
  nivel: number;
  /** Puntos de contento: a 0 se va enfadado. */
  contento: number;
  /** Instante (s de simulación) en que se le agota el aguante. */
  cansadoEn: number;
  /** Últimas pistas por las que ha bajado (ids), la más reciente al final. */
  recientes: number[];
}

/** Un esquiador que se acaba de ir enfadado, para el destello rojo. */
export interface MarchaEnfadada {
  nodo: number;
  tiempo: number;
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
  /** Anillo de cada remonte (0 a 1): se llena con la cola por encima del aforo. */
  readonly anillos: number[] = [];
  bajadasCompletadas = 0;
  /** Se han ido al agotar su aguante: la salida normal, sin queja. */
  cansados = 0;
  /** Se han ido enfadados, por causa. Cada uno es una queja. */
  readonly quejas: Record<CausaQueja, number> = { aburrimiento: 0, cola: 0, sinPistas: 0 };
  /** Marchas enfadadas recientes (las de los últimos segundos), para dibujarlas. */
  readonly marchasEnfadadas: MarchaEnfadada[] = [];
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

  /** Total de enfadados (quejas). */
  get enfadados(): number {
    return this.quejas.aburrimiento + this.quejas.cola + this.quejas.sinPistas;
  }

  /** Esquiadores presentes de cada nivel (verde, azul, roja, negra). */
  porNivel(): number[] {
    const n = [0, 0, 0, 0];
    for (const id of this.esquiadores.keys()) n[this.perfiles.get(id)?.nivel ?? 0]++;
    return n;
  }

  paso(dt: number): void {
    this.tiempo += dt;
    this.sincronizarRemontes();
    this.generarLlegadas(dt);
    this.moverRemontes(dt);
    this.llenarAnillos(dt);
    while (this.marchasEnfadadas.length > 0 && this.tiempo - this.marchasEnfadadas[0].tiempo > 2) this.marchasEnfadadas.shift();
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
      this.colas.length = this.bolitas.length = this.temporizadores.length = this.anillos.length = id;
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

  /** Sale de la estación sin contar (tras deshacer lo que usaba). */
  private irse(id: number): void {
    this.esquiadores.delete(id);
    this.perfiles.delete(id);
  }

  private irseCansado(id: number): void {
    if (this.esquiadores.has(id)) this.cansados++;
    this.irse(id);
  }

  /** Se va enfadado en `nodo`: suma una queja de esa causa. */
  private irseEnfadado(id: number, nodo: number, causa: CausaQueja): void {
    this.quejas[causa]++;
    this.marchasEnfadadas.push({ nodo, tiempo: this.tiempo });
    this.irse(id);
  }

  private sincronizarRemontes(): void {
    while (this.bolitas.length < this.red.remontes.length) {
      this.bolitas.push([]);
      this.colas.push([]);
      this.temporizadores.push(0);
      this.anillos.push(0);
    }
  }

  /**
   * Cola saturada: con más gente que el aforo, el anillo del remonte se llena
   * en `tiempoAnillo` segundos (y se vacía al mismo ritmo si baja). Lleno, el
   * último de la cola se va enfadado y el anillo baja a la mitad.
   */
  private llenarAnillos(dt: number): void {
    const { aforoCola, tiempoAnillo } = this.p;
    for (const r of this.red.remontes) {
      const cola = this.colas[r.id];
      const sube = cola.length > aforoCola;
      this.anillos[r.id] = Math.max(0, this.anillos[r.id] + (sube ? dt : -dt) / tiempoAnillo);
      if (this.anillos[r.id] >= 1) {
        const ultimo = cola.pop();
        if (ultimo !== undefined) this.irseEnfadado(ultimo, r.desde, 'cola');
        this.anillos[r.id] = 0.5;
      }
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
      const nivel = this.sortearNivel();
      const id = this.siguienteId++;
      const { aguanteMinimo: a, aguanteMaximo: b } = this.p;
      this.perfiles.set(id, { nivel, contento: this.p.contentoInicial, cansadoEn: this.tiempo + a + this.azar() * (b - a), recientes: [] });
      const bases = this.basesPara(nivel);
      // La afluencia no depende de lo construido: viene igual. Si para su
      // nivel no hay ninguna bajada, se va enfadado al llegar (PROVISIONAL:
      // decisión abierta de la especificación).
      if (bases.length === 0) {
        this.esquiadores.set(id, { id, estado: 'andando', origen: { ...this.entrada }, hacia: -1, recorrido: 0, largo: 0 });
        this.irseEnfadado(id, -1, 'sinPistas');
        continue;
      }
      this.caminarABase(id, this.entrada, bases);
    }
  }

  /** Lo mejor que puede hacer un esquiador de ese nivel desde un punto (ver Red.mejorGustoDesde). */
  private gustoDesde(nodo: number, nivel: number): number {
    return this.red.mejorGustoDesde(nodo, nivel, this.p.gustoPorDiferencia, this.p.descuentoPorRemonte);
  }

  private caminarABase(id: number, origen: Punto, bases: number[]): void {
    // Hacia la base que lleva a lo que más le gusta, con menos cola.
    const nivel = this.perfiles.get(id)?.nivel ?? 0;
    const hacia = this.elegir(bases, (b) => (this.gustoDesde(b, nivel) || 1e-3) / (1 + this.colaEnNodo(b)));
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
   * que no vaya y venga. Si se le ha agotado el aguante, se va cansado
   * (PROVISIONAL: se va en el primer punto al que llega, sin bajar a la plaza).
   */
  private decidir(id: number, nodo: number, puedeAndar = true): void {
    const perfil = this.perfiles.get(id);
    if (!perfil) {
      this.irse(id);
      return;
    }
    if (this.tiempo >= perfil.cansadoEn) {
      this.irseCansado(id);
      return;
    }
    const enBase = this.red.nodo(nodo).tipo === 'base';
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
      // Sin salida para su nivel (tras deshacer algo): se va sin contar.
      this.irse(id);
      return;
    }
    // Elección por nivel, variedad y cola (azar ponderado):
    // peso = gusto × repetición × 1 / (1 + cola). El gusto de una pista sale de
    // la diferencia de niveles; el de un remonte (o de ir andando a otra base),
    // de lo mejor que hay tras él, con un descuento por cada remonte más. Así
    // pistas y remontes están en la misma escala y se puede subir o bajar.
    const nivel = perfil.nivel;
    const o = this.elegir(opciones, (op) => {
      if ('remonte' in op) return (this.gustoDesde(op.remonte.hasta, nivel) * this.p.descuentoPorRemonte) / (1 + this.colas[op.remonte.id].length);
      if ('andar' in op) return this.gustoDesde(op.andar, nivel) / (1 + this.colaEnNodo(op.andar) + this.p.penalizacionAndar);
      return pesoPista(nivel, this.red.dificultad(op.pista), perfil.recientes.includes(op.pista.id), this.colaEnNodo(op.pista.hasta), this.p);
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
   * Contento tras bajar una pista (especificación): resta max(0, diferencia
   * de niveles − 1), así que solo aburre una pista dos niveles o más por
   * debajo; una de su nivel recupera 1 punto (tope el inicial) si hubo
   * variedad, es decir, si no estaba entre sus últimas pistas. La pista
   * «muy forzada» (−1) está aplazada. Devuelve false si se queda sin contento.
   */
  private contentar(id: number, pista: Pista): boolean {
    const perfil = this.perfiles.get(id);
    if (!perfil) return true;
    const diferencia = perfil.nivel - this.red.dificultad(pista);
    const variedad = !perfil.recientes.includes(pista.id);
    if (diferencia >= 2) perfil.contento -= diferencia - 1;
    else if (diferencia === 0 && variedad) perfil.contento = Math.min(this.p.contentoInicial, perfil.contento + 1);
    perfil.recientes.push(pista.id);
    while (perfil.recientes.length > this.p.memoriaVariedad) perfil.recientes.shift();
    return perfil.contento > 0;
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
          this.bajadasCompletadas++;
          if (!this.contentar(e.id, pista)) this.irseEnfadado(e.id, pista.hasta, 'aburrimiento');
          else this.decidir(e.id, pista.hasta);
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
