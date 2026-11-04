import * as THREE from "three";
import type { Interactable } from "./interact";
import type { Rect } from "./world";
import type { HideSpot, Player } from "./player";

const WARDROBE_OPEN = -1.7;
const DOOR_SPEED = 5;

/** Escondite con una pulsación de E. La salida se hace con E desde dentro. */
class HidingSpot implements Interactable {
  readonly targets: THREE.Object3D[];

  constructor(
    private readonly player: Player,
    readonly spot: HideSpot,
    private readonly exit: { x: number; z: number },
    private readonly labelText: string,
    targets: THREE.Object3D[],
    private readonly door: THREE.Object3D | null = null,
  ) {
    this.targets = targets;
  }

  label(): string | null {
    return this.player.hidden ? null : this.labelText;
  }

  use(): string | null {
    if (this.player.hidden) return null;
    this.player.hide(this.spot, this.exit);
    return "Te escondes. Respira despacio.";
  }

  update(dt: number): void {
    if (!this.door) return;
    // La puerta del armario se abre solo mientras hay alguien dentro.
    const occupied = this.player.hidingSpot === this.spot;
    const target = occupied ? WARDROBE_OPEN : 0;
    this.door.rotation.y += (target - this.door.rotation.y) * Math.min(1, dt * DOOR_SPEED);
  }
}

function box(
  parent: THREE.Scene,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

export interface HidingDeps {
  scene: THREE.Scene;
  rects: Rect[];
  player: Player;
}

/** Armario en el pasillo y hueco bajo la cama de la habitación B. */
export function createHidingSpots(deps: HidingDeps): Interactable[] {
  const { scene, rects, player } = deps;
  const wood = new THREE.MeshStandardMaterial({ color: "#3d2d20", roughness: 0.8 });

  // Armario: caja de 0,45 x 0,9 x 2 m con la puerta en el lado de la corridor (-X).
  const cx = 1.65;
  const cz = -19.5;
  box(scene, wood, 0.04, 2, 0.9, cx + 0.205, 1, cz); // fondo
  box(scene, wood, 0.45, 0.04, 0.9, cx, 1.98, cz); // techo
  box(scene, wood, 0.45, 0.04, 0.9, cx, 0.02, cz); // suelo
  box(scene, wood, 0.45, 2, 0.04, cx, 1, cz - 0.43); // lateral
  box(scene, wood, 0.45, 2, 0.04, cx, 1, cz + 0.43);
  rects.push({ minX: cx - 0.225, maxX: cx + 0.225, minZ: cz - 0.45, maxZ: cz + 0.45 });

  // Puerta: pivote en el borde de la bisagra; gira hacia fuera al ocultarse.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(cx - 0.225, 0, cz - 0.45);
  scene.add(doorPivot);
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2, 0.9), wood);
  doorPanel.position.set(0, 1, 0.45);
  doorPanel.castShadow = true;
  doorPanel.receiveShadow = true;
  doorPivot.add(doorPanel);

  const wardrobe = new HidingSpot(
    player,
    { x: cx, z: cz, eye: 1.45 },
    { x: 0.9, z: cz },
    "esconderse en el armario",
    [doorPanel],
    doorPivot,
  );

  // Cama de la habitación B: hueco por debajo, salida por el lado libre.
  const bedHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.5, 2.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  bedHitbox.position.set(-7.8, 0.45, -15.5);
  scene.add(bedHitbox);

  const underBed = new HidingSpot(
    player,
    { x: -7.8, z: -15.5, eye: 0.22 },
    { x: -6.4, z: -15.5 },
    "esconderse debajo de la cama",
    [bedHitbox],
  );

  return [wardrobe, underBed];
}
