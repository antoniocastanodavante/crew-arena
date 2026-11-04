import * as THREE from "three";
import type { Rect, World } from "./world";
import type { Interactable } from "./interact";
import { Door, type NoiseEmitter } from "./door";
import { ITEMS } from "./items";
import type { Inventory } from "./inventory";
import { registry, setFlag } from "./save";
import { sfx } from "./audio";
import { assignSpots, formatTime, getCode, type SpotPool } from "./layout";

const DRAWER_TRAVEL = 0.35;

/** Objeto que se recoge al pulsar E. Desaparece y entra en el inventario. */
/** Orden de creación de los objetos recogibles: identifica cada uno en el guardado. */
let pickupSeq = 0;

export class Pickup implements Interactable {
  private collected = false;
  private readonly baseY: number;

  constructor(
    private readonly id: string,
    private readonly inventory: Inventory,
    private readonly visual: THREE.Mesh,
    private readonly hitbox: THREE.Mesh,
    /** Zona donde puede aparecer en cada partida nueva. null si la posición es fija. */
    readonly pool: SpotPool | null,
  ) {
    this.baseY = visual.position.y;
    const key = `pickup:${pickupSeq++}:${id}`;
    registry.register(
      key,
      () => ({ collected: this.collected, x: this.visual.position.x, z: this.visual.position.z }),
      (v) => {
        const s = v as { collected: boolean; x: number; z: number };
        this.collected = s.collected;
        this.visual.visible = !s.collected;
        this.moveTo(s.x, s.z);
      },
    );
  }

  moveTo(x: number, z: number): void {
    this.visual.position.set(x, this.baseY, z);
    this.hitbox.position.set(x, this.baseY, z);
  }

  get targets(): THREE.Object3D[] {
    return this.collected ? [] : [this.hitbox];
  }

  label(): string | null {
    return this.collected ? null : `recoger ${ITEMS[this.id].name.toLowerCase()}`;
  }

  use(): string | null {
    if (this.collected) return null;
    this.collected = true;
    this.visual.visible = false;
    this.inventory.add(this.id);
    sfx.pickup();
    return `Has recogido: ${ITEMS[this.id].name}.`;
  }
}

/** Cajón que se abre hacia fuera. El primer uso puede dar un mensaje y un objeto. */
class Drawer implements Interactable {
  readonly targets: THREE.Object3D[];
  private open = false;
  private offset = 0;
  private readonly basePos: THREE.Vector3;
  private seen = false;

  constructor(
    private readonly front: THREE.Mesh,
    private readonly dir: THREE.Vector3,
    private readonly firstOpenText: string,
  ) {
    this.targets = [front];
    this.basePos = front.position.clone();
    registry.register(
      "drawer",
      () => ({ open: this.open, seen: this.seen }),
      (v) => {
        const s = v as { open: boolean; seen: boolean };
        this.open = s.open;
        this.seen = s.seen;
        this.offset = s.open ? DRAWER_TRAVEL : 0;
        this.front.position.copy(this.basePos).addScaledVector(this.dir, this.offset);
      },
    );
  }

  label(): string {
    return this.open ? "cerrar el cajón" : "abrir el cajón";
  }

  use(): string | null {
    this.open = !this.open;
    sfx.drawer();
    if (this.open && !this.seen) {
      this.seen = true;
      return this.firstOpenText;
    }
    return null;
  }

  update(dt: number): void {
    const target = this.open ? DRAWER_TRAVEL : 0;
    this.offset += (target - this.offset) * Math.min(1, dt * 8);
    this.front.position.copy(this.basePos).addScaledVector(this.dir, this.offset);
  }
}

/** Interruptor general: apaga y enciende las luces del techo. */
class PowerSwitch implements Interactable {
  readonly targets: THREE.Object3D[];

  constructor(
    private readonly world: World,
    plate: THREE.Mesh,
  ) {
    this.targets = [plate];
  }

  label(): string {
    return this.world.isPowered() ? "apagar la luz general" : "encender la luz general";
  }

  use(): string {
    const on = !this.world.isPowered();
    if (on && !this.world.hasFuse()) return "No responde. Falta el fusible en la caja.";
    sfx.click();
    this.world.setPower(on);
    return on ? "La luz general vuelve a funcionar." : "Se hace la oscuridad.";
  }
}

/** Ordenador del despacho. Solo muestra la pantalla si hay corriente. */
class Computer implements Interactable {
  readonly targets: THREE.Object3D[];
  private on = false;

  constructor(
    private readonly screen: THREE.MeshStandardMaterial,
    private readonly world: World,
    hitbox: THREE.Mesh,
    private readonly text: () => string,
  ) {
    this.targets = [hitbox];
    registry.register(
      "computer",
      () => ({ on: this.on }),
      (v) => {
        this.on = (v as { on: boolean }).on;
      },
    );
  }

  label(): string {
    return this.on ? "apagar el ordenador" : "encender el ordenador";
  }

  use(): string | null {
    if (!this.on && !this.world.isPowered()) return "No hay corriente.";
    this.on = !this.on;
    if (this.on) {
      setFlag("computerRead");
      sfx.beep();
    }
    return this.on ? this.text() : null;
  }

  update(): void {
    const shown = this.on && this.world.isPowered();
    this.screen.emissiveIntensity = shown ? 0.9 : 0;
  }
}

export interface InteractableDeps {
  scene: THREE.Scene;
  rects: Rect[];
  world: World;
  playerPos: THREE.Vector3;
  inventory: Inventory;
  noise: NoiseEmitter;
}

export interface InteractableSet {
  items: Interactable[];
  doors: Door[];
}

/** Crea un objeto recogible con un hitbox invisible más grande para poder apuntarle. */
function addPickup(
  scene: THREE.Scene,
  inventory: Inventory,
  id: string,
  visualGeo: THREE.BufferGeometry,
  visualMat: THREE.Material,
  pos: [number, number, number],
  rotZ: number,
  pool: SpotPool | null,
): Pickup {
  const visual = new THREE.Mesh(visualGeo, visualMat);
  visual.position.set(...pos);
  visual.rotation.z = rotZ;
  scene.add(visual);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.2, 0.3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitbox.position.set(...pos);
  scene.add(hitbox);

  return new Pickup(id, inventory, visual, hitbox, pool);
}

/**
 * Reparte los objetos recogibles por el escenario para una partida nueva.
 * Los que tienen zona fija (el botiquín del quirófano) no se mueven.
 */
export function randomizePickups(items: Interactable[], rng: () => number = Math.random): void {
  const pickups = items.filter((i): i is Pickup => i instanceof Pickup && i.pool !== null);
  const spots = assignSpots(pickups.map((p) => p.pool as SpotPool), rng);
  pickups.forEach((p, k) => p.moveTo(spots[k].x, spots[k].z));
}

/** Crea todos los objetos interactuables del hospital y los coloca en el escenario. */
export function createInteractables(deps: InteractableDeps): InteractableSet {
  const { scene, rects, world, playerPos, inventory, noise } = deps;
  const items: Interactable[] = [];
  const doors: Door[] = [];

  const doorMat = new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 0.7 });
  const doorSpecs = [
    { axis: "x" as const, fixed: -2, from: -8.6, to: -7.4, swing: 1 as const },
    { axis: "x" as const, fixed: -2, from: -17.6, to: -16.4, swing: -1 as const },
    { axis: "x" as const, fixed: 2, from: -12.6, to: -11.4, swing: -1 as const },
    { axis: "x" as const, fixed: 2, from: -24.6, to: -23.4, swing: 1 as const },
  ];
  for (const spec of doorSpecs) {
    const door = new Door(scene, rects, playerPos, doorMat, spec, noise);
    doors.push(door);
    items.push(door);
  }

  // Interruptor general en la pared izquierda del pasillo
  const plateMat = new THREE.MeshStandardMaterial({ color: "#c8c4b0", roughness: 0.6 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.1), plateMat);
  plate.position.set(-1.87, 1.3, 0.9);
  scene.add(plate);
  items.push(new PowerSwitch(world, plate));

  // Cajón del armario metálico del pasillo
  const drawerMat = new THREE.MeshStandardMaterial({ color: "#5a5f63", metalness: 0.5, roughness: 0.5 });
  const drawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 1.0), drawerMat);
  drawerFront.position.set(-1.47, 1.0, -2.5);
  drawerFront.castShadow = true;
  scene.add(drawerFront);
  items.push(
    new Drawer(
      drawerFront,
      new THREE.Vector3(1, 0, 0),
      "Hojas de registro. La última anotación es de hoy, a las 03:12.",
    ),
  );

  // Ordenador del despacho (la pantalla está en world.ts)
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitbox.position.set(6.5, 0.95, -12.9);
  scene.add(hitbox);
  items.push(
    new Computer(
      world.computerScreen,
      world,
      hitbox,
      () =>
        `REGISTRO DE PACIENTES. Última entrada, 03:12: paciente 7 trasladado al sótano. Paciente 7: ingresó a las ${formatTime(getCode())}. Firma de ingreso: tu nombre.`,
    ),
  );

  // Objetos recogibles
  const paperMat = new THREE.MeshStandardMaterial({ color: "#d8d4c4", roughness: 1 });
  const battery = new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8);
  const batteryMat = new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.4, roughness: 0.5 });
  const doc = new THREE.BoxGeometry(0.22, 0.005, 0.3);
  const card = new THREE.BoxGeometry(0.08, 0.01, 0.05);
  const cardMat = new THREE.MeshStandardMaterial({ color: "#2a2f36", metalness: 0.3, roughness: 0.4 });
  const note = new THREE.BoxGeometry(0.2, 0.005, 0.15);

  // Las pilas, la ficha, la tarjeta, la nota y la pista cambian de sitio en cada partida.
  for (let k = 0; k < 3; k++) {
    items.push(addPickup(scene, inventory, "pila", battery, batteryMat, [0, 0.03, 0], Math.PI / 2, "any"));
  }
  items.push(addPickup(scene, inventory, "doc_admision", doc, paperMat, [0, 0.004, 0], 0, "access"));
  items.push(addPickup(scene, inventory, "doc_guardia", doc, paperMat, [0, 0.004, 0], 0, "access"));
  items.push(addPickup(scene, inventory, "tarjeta_seguridad", card, cardMat, [0, 0.005, 0], 0, "access"));
  items.push(addPickup(scene, inventory, "pista_papel", note, paperMat, [0, 0.004, 0], 0, "access"));

  // Botiquines: se guardan en el inventario y se usan cuando haga falta
  const kitMat = new THREE.MeshStandardMaterial({ color: "#e8e6e0", roughness: 0.6 });
  const kit = new THREE.BoxGeometry(0.2, 0.1, 0.14);
  // Dos botiquines por el mapa (cambian de sitio); uno fijo en la mesa del quirófano.
  items.push(addPickup(scene, inventory, "botiquin", kit, kitMat, [0, 0.05, 0], 0, "access"));
  items.push(addPickup(scene, inventory, "botiquin", kit, kitMat, [0, 0.05, 0], 0, "access"));
  items.push(addPickup(scene, inventory, "botiquin", kit, kitMat, [5.1, 0.95, -25.4], 0, null));

  // Posición inicial repartida: el guardado y las partidas nuevas la sobrescriben
  randomizePickups(items);

  return { items, doors };
}
