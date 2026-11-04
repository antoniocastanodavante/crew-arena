import * as THREE from "three";

/** Algo que el jugador puede mirar y usar con E. */
export interface Interactable {
  /** Objetos que el rayo puede tocar. */
  readonly targets: THREE.Object3D[];
  /** Texto de la acción, por ejemplo "Abrir puerta". Null si no hay acción ahora. */
  label(): string | null;
  /** Se ejecuta al pulsar E. Devuelve un mensaje opcional para el jugador. */
  use(): string | null;
  /** Animación por frame, si la tiene. */
  update?(dt: number): void;
}

const REACH = 2.2;

export interface InteractorOptions {
  onPrompt(text: string | null): void;
  onMessage(text: string): void;
}

/** Lanza un rayo desde el centro de la pantalla y une el objeto mirado con su acción. */
export class Interactor {
  private readonly raycaster = new THREE.Raycaster();
  private readonly center = new THREE.Vector2(0, 0);
  private readonly owners = new Map<THREE.Object3D, Interactable>();
  private current: Interactable | null = null;

  constructor(
    private readonly items: Interactable[],
    private readonly opts: InteractorOptions,
  ) {
    this.raycaster.far = REACH;
  }

  update(camera: THREE.Camera): void {
    // Se recalcula cada frame: los objetos recogidos dejan de tener objetivo.
    this.owners.clear();
    const targets: THREE.Object3D[] = [];
    for (const item of this.items) {
      for (const target of item.targets) {
        targets.push(target);
        this.owners.set(target, item);
      }
    }

    this.raycaster.setFromCamera(this.center, camera);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    this.current = hit ? this.owners.get(hit.object) ?? null : null;
    const label = this.current?.label() ?? null;
    this.opts.onPrompt(label ? `Pulsa E para ${label.toLowerCase()}` : null);
  }

  use(): void {
    if (!this.current) return;
    const message = this.current.use();
    if (message) this.opts.onMessage(message);
  }
}
