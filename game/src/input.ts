export interface InputHandlers {
  /** Se llama cuando el puntero entra o sale del bloqueo (Esc lo libera). */
  onLockChange(locked: boolean): void;
  /** Se llama una vez por pulsación de tecla (sin repetición automática). */
  onAction(code: string): void;
}

/**
 * Teclado y ratón. El ratón solo cuenta cuando el puntero está bloqueado,
 * así la cámara en primera persona no se mueve en el menú.
 */
export class Input {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private locked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    handlers: InputHandlers,
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      handlers.onAction(e.code);
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    // Si la ventana pierde el foco, no queremos teclas "pegadas".
    window.addEventListener("blur", () => this.keys.clear());

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
      handlers.onLockChange(this.locked);
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
  }

  requestLock(): void {
    void this.canvas.requestPointerLock();
  }

  releaseLock(): void {
    document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Devuelve el movimiento de ratón acumulado desde la última llamada. */
  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }
}
