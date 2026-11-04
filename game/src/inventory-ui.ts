import { KIND_LABELS, KIND_ORDER } from "./items";
import type { Inventory } from "./inventory";

export interface InventoryElements {
  grid: HTMLElement;
  name: HTMLElement;
  desc: HTMLElement;
  useBtn: HTMLButtonElement;
  feedback: HTMLElement;
}

/**
 * Pantalla del inventario. Muestra los objetos por sección, deja elegir uno
 * para leer su descripción y, si se puede usar, aplicarlo con el botón.
 */
export class InventoryUI {
  private selected: string | null = null;

  constructor(
    private readonly inv: Inventory,
    private readonly els: InventoryElements,
    private readonly onUse: (id: string) => string,
  ) {
    inv.onChange(() => this.render());
    els.useBtn.addEventListener("click", () => this.useSelected());
    this.render();
  }

  /** Vacía la selección y el mensaje. Se llama al abrir la pantalla. */
  reset(): void {
    this.els.feedback.textContent = "";
    this.render();
  }

  private useSelected(): void {
    if (!this.selected) return;
    const entry = this.inv.list().find((e) => e.id === this.selected);
    if (!entry || !entry.def.usable) return;
    this.els.feedback.textContent = this.onUse(entry.id);
    this.render();
  }

  private select(id: string): void {
    this.selected = id;
    this.els.feedback.textContent = "";
    this.render();
  }

  private render(): void {
    const entries = this.inv.list();
    if (this.selected && !entries.some((e) => e.id === this.selected)) {
      this.selected = null;
    }

    this.els.grid.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "inv-empty";
      empty.textContent = "No llevas nada encima.";
      this.els.grid.appendChild(empty);
    }

    for (const kind of KIND_ORDER) {
      const items = entries.filter((e) => e.def.kind === kind);
      if (items.length === 0) continue;

      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = KIND_LABELS[kind];
      section.appendChild(heading);

      const row = document.createElement("div");
      row.className = "inv-row";
      for (const entry of items) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "slot";
        slot.textContent = entry.count > 1 ? `${entry.def.name} ×${entry.count}` : entry.def.name;
        slot.setAttribute("aria-pressed", String(entry.id === this.selected));
        slot.addEventListener("click", () => this.select(entry.id));
        row.appendChild(slot);
      }
      section.appendChild(row);
      this.els.grid.appendChild(section);
    }

    this.renderDetail(entries.find((e) => e.id === this.selected));
  }

  private renderDetail(entry: { def: { name: string; description: string; usable: boolean } } | undefined): void {
    if (!entry) {
      this.els.name.textContent = "";
      this.els.desc.textContent = "Elige un objeto para examinarlo.";
      this.els.useBtn.hidden = true;
      return;
    }
    this.els.name.textContent = entry.def.name;
    this.els.desc.textContent = entry.def.description;
    this.els.useBtn.hidden = !entry.def.usable;
  }
}
