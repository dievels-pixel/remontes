// Lo que el juego pide al sonido. La música real está en musica.ts; en las
// pruebas y donde no hay audio se usa la nula.
export interface Sonido {
  silencio: boolean;
  despertar(): void;
  alternarSilencio(): void;
  apagar(cuanto: number): void;
  bolita(altura: number): void;
  remonte(alturaAbajo: number, alturaArriba: number): void;
  pista(alturaArriba: number): void;
  mejora(altura: number): void;
  enfado(): void;
  toque(valido?: boolean): void;
  derrota(): void;
}

export class MusicaNula implements Sonido {
  silencio = true;
  despertar(): void {}
  alternarSilencio(): void {
    this.silencio = !this.silencio;
  }
  apagar(): void {}
  bolita(): void {}
  remonte(): void {}
  pista(): void {}
  mejora(): void {}
  enfado(): void {}
  toque(): void {}
  derrota(): void {}
}
