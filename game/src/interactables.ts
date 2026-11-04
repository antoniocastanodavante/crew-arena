import * as THREE from "three";
import type { Rect, World } from "./world";
import type { Interactable } from "./interact";
import { Door } from "./door";

const DRAWER_TRAVEL = 0.35;

/** Cajón que se abre hacia fuera. El primer uso puede dar un mensaje. */
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
  }

  label(): string {
    return this.open ? "cerrar el cajón" : "abrir el cajón";
  }

  use(): string | null {
    this.open = !this.open;
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
    private readonly text: string,
  ) {
    this.targets = [hitbox];
  }

  label(): string {
    return this.on ? "apagar el ordenador" : "encender el ordenador";
  }

  use(): string | null {
    if (!this.on && !this.world.isPowered()) return "No hay corriente.";
    this.on = !this.on;
    return this.on ? this.text : null;
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
}

/** Crea todos los objetos interactuables del hospital y los coloca en el escenario. */
export function createInteractables(deps: InteractableDeps): Interactable[] {
  const { scene, rects, world, playerPos } = deps;
  const items: Interactable[] = [];

  const doorMat = new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 0.7 });
  const doorSpecs = [
    { axis: "x" as const, fixed: -2, from: -8.6, to: -7.4, swing: 1 as const },
    { axis: "x" as const, fixed: -2, from: -17.6, to: -16.4, swing: -1 as const },
    { axis: "x" as const, fixed: 2, from: -12.6, to: -11.4, swing: -1 as const },
    { axis: "x" as const, fixed: 2, from: -24.6, to: -23.4, swing: 1 as const },
  ];
  for (const spec of doorSpecs) {
    items.push(new Door(scene, rects, playerPos, doorMat, spec));
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
      "REGISTRO DE PACIENTES. Última entrada, 03:12: paciente 7 trasladado al sótano.",
    ),
  );

  return items;
}
