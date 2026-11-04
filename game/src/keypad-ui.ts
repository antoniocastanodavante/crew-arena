import type { KeypadCheck } from "./puzzles";

export interface KeypadElements {
  pad: HTMLElement;
  display: HTMLElement;
  feedback: HTMLElement;
}

const CODE_LENGTH = 4;

/** Panel del teclado numérico. Confirma con OK y cierra cuando el código es bueno. */
export class KeypadUI {
  private entry = "";

  constructor(
    private readonly els: KeypadElements,
    private readonly submit: (code: string) => KeypadCheck,
    private readonly onSolved: () => void,
  ) {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"];
    for (const key of keys) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key";
      btn.textContent = key;
      btn.addEventListener("click", () => this.press(key));
      els.pad.appendChild(btn);
    }
    this.render();
  }

  reset(): void {
    this.entry = "";
    this.els.feedback.textContent = "";
    this.render();
  }

  private press(key: string): void {
    if (key === "C") {
      this.entry = "";
    } else if (key === "OK") {
      if (this.entry.length < CODE_LENGTH) {
        this.els.feedback.textContent = "Faltan cifras.";
        return;
      }
      const result = this.submit(this.entry);
      this.els.feedback.textContent = result.message;
      if (result.ok) {
        this.onSolved();
        return;
      }
      this.entry = "";
    } else if (this.entry.length < CODE_LENGTH) {
      this.entry += key;
      this.els.feedback.textContent = "";
    }
    this.render();
  }

  private render(): void {
    const slots = Array.from({ length: CODE_LENGTH }, (_, i) => this.entry[i] ?? "_");
    this.els.display.textContent = slots.join(" ");
  }
}
