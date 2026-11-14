import type { WbElement } from "./types";

const clone = (els: WbElement[]): WbElement[] => JSON.parse(JSON.stringify(els));

/** Pilha de estados da cena. Guarda cópias, nunca referências. */
export class History {
  private states: WbElement[][];
  private index = 0;

  constructor(initial: WbElement[], private limit = 100) {
    this.states = [clone(initial)];
  }

  push(elements: WbElement[]): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(clone(elements));
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
  }

  undo(): WbElement[] | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return clone(this.states[this.index]);
  }

  redo(): WbElement[] | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return clone(this.states[this.index]);
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  reset(elements: WbElement[]): void {
    this.states = [clone(elements)];
    this.index = 0;
  }
}
