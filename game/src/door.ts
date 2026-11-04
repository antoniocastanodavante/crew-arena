import * as THREE from "three";
import type { Rect } from "./world";
import type { Interactable } from "./interact";

const OPEN_ANGLE = Math.PI * 0.5 * 0.9;
const WALL_MARGIN = 0.1;
const CLEARANCE = 0.35;

export interface DoorOptions {
  /** "x": pared a lo largo de Z en x = fixed. "z": pared a lo largo de X en z = fixed. */
  axis: "x" | "z";
  fixed: number;
  /** Extremos del hueco. "from" es el lado donde está la bisagra. */
  from: number;
  to: number;
  /** 1 o -1: hacia qué lado se abre. */
  swing: 1 | -1;
}

/** Puerta de 2,1 m con bisagra. Cerrada bloquea al jugador; abierta no. */
export class Door implements Interactable {
  readonly targets: THREE.Object3D[];

  private open = false;
  private angle = 0;
  private readonly pivot = new THREE.Group();
  private readonly closedRect: Rect;

  constructor(
    scene: THREE.Scene,
    private readonly rects: Rect[],
    private readonly playerPos: THREE.Vector3,
    material: THREE.Material,
    private readonly opts: DoorOptions,
  ) {
    const len = opts.to - opts.from;
    const { axis, fixed, from, to } = opts;

    const geo =
      axis === "x"
        ? new THREE.BoxGeometry(0.06, 2.1, len)
        : new THREE.BoxGeometry(len, 2.1, 0.06);
    const panel = new THREE.Mesh(geo, material);
    panel.castShadow = true;
    panel.receiveShadow = true;

    if (axis === "x") {
      this.pivot.position.set(fixed, 0, from);
      panel.position.set(0, 1.05, len / 2);
      this.closedRect = { minX: fixed - WALL_MARGIN, maxX: fixed + WALL_MARGIN, minZ: from, maxZ: to };
    } else {
      this.pivot.position.set(from, 0, fixed);
      panel.position.set(len / 2, 1.05, 0);
      this.closedRect = { minX: from, maxX: to, minZ: fixed - WALL_MARGIN, maxZ: fixed + WALL_MARGIN };
    }

    this.pivot.add(panel);
    scene.add(this.pivot);
    this.targets = [panel];
    this.rects.push(this.closedRect);
  }

  label(): string {
    return this.open ? "cerrar la puerta" : "abrir la puerta";
  }

  use(): string | null {
    if (this.open) {
      if (this.playerNearDoorway()) return "No puedes cerrarla ahí.";
      this.open = false;
      this.rects.push(this.closedRect);
    } else {
      this.open = true;
      const i = this.rects.indexOf(this.closedRect);
      if (i >= 0) this.rects.splice(i, 1);
    }
    return null;
  }

  update(dt: number): void {
    const target = (this.open ? OPEN_ANGLE : 0) * this.opts.swing;
    this.angle += (target - this.angle) * Math.min(1, dt * 6);
    this.pivot.rotation.y = this.angle;
  }

  private playerNearDoorway(): boolean {
    const r = this.closedRect;
    const p = this.playerPos;
    return (
      p.x > r.minX - CLEARANCE &&
      p.x < r.maxX + CLEARANCE &&
      p.z > r.minZ - CLEARANCE &&
      p.z < r.maxZ + CLEARANCE
    );
  }
}
