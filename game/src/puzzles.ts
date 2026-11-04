import * as THREE from "three";
import type { Interactable } from "./interact";
import type { Inventory } from "./inventory";
import type { World, Rect } from "./world";
import type { Door, NoiseEmitter } from "./door";
import { registry } from "./save";
import { sfx } from "./audio";

/** Código del teclado: la hora de ingreso de la ficha de admisión. */
export const KEYPAD_CODE = "0317";
const KEYPAD_NOISE = 8;
/** Orden correcto de los tubos. Lo dice el cartel del laboratorio. */
const LAB_ORDER = ["rojo", "azul", "verde"];
const TUBE_COLORS: Record<string, string> = {
  rojo: "#8a1c1c",
  azul: "#1c3a8a",
  verde: "#1c6b2e",
};

/** Caja invisible para que el rayo pueda apuntar a algo pequeño. */
function hitbox(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function visual(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export interface KeypadCheck {
  ok: boolean;
  message: string;
}

/** Teclado junto a la puerta del quirófano. Abre un panel con los dígitos. */
export class Keypad implements Interactable {
  readonly targets: THREE.Object3D[];
  solved = false;

  constructor(
    hit: THREE.Object3D,
    private readonly onOpen: () => void,
    private readonly noise: NoiseEmitter,
    private readonly at: { x: number; z: number },
  ) {
    this.targets = [hit];
    registry.register(
      "keypad",
      () => this.solved,
      (v) => {
        this.solved = v === true;
      },
    );
  }

  label(): string | null {
    return this.solved ? null : "usar el teclado";
  }

  use(): string | null {
    if (!this.solved) this.onOpen();
    return null;
  }

  check(entry: string): KeypadCheck {
    if (entry === KEYPAD_CODE) {
      this.solved = true;
      sfx.lock();
      return { ok: true, message: "Clic. La cerradura cede." };
    }
    // Un código malo hace ruido: algo al otro lado se mueve.
    sfx.buzz();
    this.noise(this.at.x, this.at.z, KEYPAD_NOISE);
    return { ok: false, message: "Código incorrecto. Algo se mueve al otro lado." };
  }
}

/** Caja de fusibles del pasillo. Con el fusible puesto vuelve la corriente. */
class FuseBox implements Interactable {
  readonly targets: THREE.Object3D[];

  constructor(
    hit: THREE.Object3D,
    private readonly inventory: Inventory,
    private readonly world: World,
  ) {
    this.targets = [hit];
  }

  label(): string | null {
    return this.world.hasFuse() ? null : "meter el fusible";
  }

  use(): string | null {
    if (this.world.hasFuse()) return null;
    if (!this.inventory.remove("fusible")) return "La caja está vacía. Falta un fusible. Quizá lo hayas visto en el laboratorio.";
    this.world.installFuse();
    sfx.metal();
    return "El fusible encaja. Vuelve la luz.";
  }
}

/** Carro de curas. La llave está escondida bajo la bandeja. */
class Cart implements Interactable {
  readonly targets: THREE.Object3D[];
  private revealed = false;

  constructor(
    hit: THREE.Object3D,
    private readonly inventory: Inventory,
  ) {
    this.targets = [hit];
    registry.register(
      "cart",
      () => this.revealed,
      (v) => {
        this.revealed = v === true;
      },
    );
  }

  label(): string | null {
    return this.revealed ? null : "mirar bajo la bandeja";
  }

  use(): string | null {
    if (this.revealed) return null;
    this.revealed = true;
    this.inventory.add("llave_oxidada");
    return "Bajo la bandeja hay una llave oxidada.";
  }
}

/** Puzle del laboratorio: mezclar los tubos en el orden del cartel. */
export class LabPuzzle {
  progress = 0;
  solved = false;

  constructor(private readonly inventory: Inventory) {
    registry.register(
      "lab",
      () => ({ progress: this.progress, solved: this.solved }),
      (v) => {
        const s = v as { progress: number; solved: boolean };
        this.progress = s.progress;
        this.solved = s.solved;
      },
    );
  }

  press(color: string): string {
    if (this.solved) return "";
    if (color === LAB_ORDER[this.progress]) {
      this.progress++;
      if (this.progress === LAB_ORDER.length) {
        this.solved = true;
        this.inventory.add("fusible");
        return "La mezcla es estable. Has conseguido un fusible.";
      }
      return "Bien. Sigue con el siguiente.";
    }
    this.progress = 0;
    return "La mezcla humea. Empiezas otra vez.";
  }
}

class Tube implements Interactable {
  readonly targets: THREE.Object3D[];

  constructor(
    private readonly color: string,
    private readonly puzzle: LabPuzzle,
    hit: THREE.Object3D,
  ) {
    this.targets = [hit];
  }

  label(): string | null {
    return this.puzzle.solved ? null : `mezclar el tubo ${this.color}`;
  }

  use(): string | null {
    sfx.click();
    return this.puzzle.press(this.color) || null;
  }
}

/** Cartel que se puede leer. */
class Sign implements Interactable {
  readonly targets: THREE.Object3D[];

  constructor(
    hit: THREE.Object3D,
    private readonly text: string,
  ) {
    this.targets = [hit];
  }

  label(): string {
    return "leer el cartel";
  }

  use(): string {
    return this.text;
  }
}

export interface PuzzleDeps {
  scene: THREE.Scene;
  rects: Rect[];
  world: World;
  inventory: Inventory;
  noise: NoiseEmitter;
  /** Puertas del hospital en el orden de createInteractables: [A, B, C, D]. */
  doors: Door[];
  openKeypad: () => void;
}

export interface PuzzleSet {
  items: Interactable[];
  keypad: Keypad;
}

/**
 * Los cinco puzles del hospital:
 * 1. Código de cuatro cifras en el teclado del quirófano (ficha de admisión).
 * 2. Restaurar la corriente con el fusible.
 * 3. Llave escondida bajo la bandeja del carro.
 * 4. Mezcla de tubos en el laboratorio (orden del cartel) → fusible.
 * 5. Puerta de seguridad cerrada con la llave.
 * Cadena: tarjeta (quirófano, tras el teclado) abre el laboratorio.
 */
export function createPuzzles(deps: PuzzleDeps): PuzzleSet {
  const { scene, rects, world, inventory, noise, doors, openKeypad } = deps;
  const items: Interactable[] = [];
  const [, doorB, doorC, doorD] = doors;

  // 1. Teclado del quirófano
  const kbMat = new THREE.MeshStandardMaterial({ color: "#1d2024", roughness: 0.5 });
  visual(scene, new THREE.BoxGeometry(0.04, 0.3, 0.2), kbMat, 1.87, 1.3, -22.9);
  const keypad = new Keypad(hitbox(scene, 1.87, 1.3, -22.9, 0.2, 0.3, 0.3), openKeypad, noise, {
    x: 1.87,
    z: -22.9,
  });
  items.push(keypad);
  doorD.setGate(() => (keypad.solved ? null : "Un teclado junto a la puerta pide un código de cuatro cifras."));

  // Cartel junto al teclado con la pista del código
  visual(scene, new THREE.BoxGeometry(0.02, 0.3, 0.45), kbMat, 1.86, 1.75, -21.9);
  items.push(
    new Sign(
      hitbox(scene, 1.8, 1.75, -21.9, 0.3, 0.4, 0.5),
      "ACCESO RESTRINGIDO. El código de cuatro cifras es la hora de ingreso del paciente.",
    ),
  );

  // 2. Caja de fusibles junto al interruptor
  visual(scene, new THREE.BoxGeometry(0.04, 0.3, 0.25), kbMat, -1.87, 1.0, 0.3);
  items.push(new FuseBox(hitbox(scene, -1.85, 1.0, 0.3, 0.2, 0.3, 0.3), inventory, world));

  // 3. Llave escondida bajo la bandeja del carro de la corridor
  items.push(new Cart(hitbox(scene, 1.4, 0.95, -4, 0.6, 0.25, 0.9), inventory));

  // Puertas con condición
  doorB.setGate(() => (inventory.remove("llave_oxidada") ? null : "La puerta de seguridad está cerrada con llave."));
  doorC.setGate(() =>
    inventory.remove("tarjeta_seguridad") ? null : "Cerrada. Hace falta una tarjeta de seguridad. Alguien dejó una en la habitación A.",
  );

  // 4. Laboratorio: banco, tubos y cartel
  const metal = new THREE.MeshStandardMaterial({ color: "#8c949a", metalness: 0.6, roughness: 0.45 });
  visual(scene, new THREE.BoxGeometry(0.6, 0.9, 1.6), metal, 4.2, 0.45, -10.5);
  rects.push({ minX: 3.9, maxX: 4.5, minZ: -11.3, maxZ: -9.7 });

  const lab = new LabPuzzle(inventory);
  const tubeZ: Array<[string, number]> = [
    ["rojo", -10.1],
    ["azul", -10.5],
    ["verde", -10.9],
  ];
  for (const [color, z] of tubeZ) {
    const glass = new THREE.MeshStandardMaterial({ color: TUBE_COLORS[color], roughness: 0.2 });
    visual(scene, new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), glass, 4.2, 0.98, z);
    items.push(new Tube(color, lab, hitbox(scene, 4.2, 0.98, z, 0.15, 0.2, 0.15)));
  }

  const paper = new THREE.MeshStandardMaterial({ color: "#d8d4c4", roughness: 1 });
  visual(scene, new THREE.BoxGeometry(0.02, 0.4, 0.8), paper, 8.85, 1.6, -13.8);
  items.push(
    new Sign(
      hitbox(scene, 8.7, 1.6, -13.8, 0.3, 0.5, 0.9),
      "ORDEN DE MEZCLA: ROJO · AZUL · VERDE. Mezcla en ese orden.",
    ),
  );

  return { items, keypad };
}
