import { ITEMS, type ItemDef } from "./items";
import { registry } from "./save";

export interface InventoryEntry {
  id: string;
  def: ItemDef;
  count: number;
}

/** Objetos que lleva el jugador. Cada id cuenta cuántas unidades hay. */
export class Inventory {
  private readonly counts = new Map<string, number>();
  private readonly listeners: Array<() => void> = [];

  constructor() {
    registry.register(
      "inventory",
      () => [...this.counts.entries()],
      (v) => {
        this.counts.clear();
        for (const [id, n] of v as Array<[string, number]>) this.counts.set(id, n);
        this.emit();
      },
    );
  }

  add(id: string): void {
    if (!ITEMS[id]) throw new Error(`Objeto desconocido: ${id}`);
    this.counts.set(id, this.count(id) + 1);
    this.emit();
  }

  count(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  has(id: string): boolean {
    return this.count(id) > 0;
  }

  /** Quita n unidades. Devuelve false si no hay suficientes. */
  remove(id: string, n = 1): boolean {
    const current = this.count(id);
    if (current < n) return false;
    if (current === n) this.counts.delete(id);
    else this.counts.set(id, current - n);
    this.emit();
    return true;
  }

  list(): InventoryEntry[] {
    return [...this.counts.entries()].map(([id, count]) => ({ id, def: ITEMS[id], count }));
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
