import * as THREE from "three";
import type { Rect } from "./world";
import type { Interactable } from "./interact";
import { registry } from "./save";
import { sfx } from "./audio";

const OPEN_ANGLE = Math.PI * 0.5 * 0.9;
const WALL_MARGIN = 0.1;
const CLEARANCE = 0.35;
const NOISE_RADIUS = 12;

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

export type NoiseEmitter = (x: number, z: number, radius: number) => void;

/** Puerta de 2,1 m con bisagra. Cerrada bloquea al jugador; abierta no. */
export class Door implements Interactable {
  readonly targets: THREE.Object3D[];

  private isOpen = false;
  private angle = 0;
  /** Si existe, decide si el jugador puede abrir. Devuelve un mensaje cuando no puede. */
  private gate: (() => string | null) | null = null;
  /** Condición con la que la puerta empezó, para volver a cerrarla con llave al reiniciar. */
  private defaultGate: (() => string | null) | null = null;
  private readonly pivot = new THREE.Group();
  private readonly closedRect: Rect;
  private readonly cx: number;
  private readonly cz: number;

  constructor(
    scene: THREE.Scene,
    private readonly rects: Rect[],
    private readonly playerPos: THREE.Vector3,
    material: THREE.Material,
    private readonly opts: DoorOptions,
    private readonly onNoise: NoiseEmitter,
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
      this.closedRect = { minX: fixed - WALL_MARGIN, maxX: fixed + WALL_MARGIN, minZ: from, maxZ: to, door: true };
      this.cx = fixed;
      this.cz = (from + to) / 2;
    } else {
      this.pivot.position.set(from, 0, fixed);
      panel.position.set(len / 2, 1.05, 0);
      this.closedRect = { minX: from, maxX: to, minZ: fixed - WALL_MARGIN, maxZ: fixed + WALL_MARGIN, door: true };
      this.cx = (from + to) / 2;
      this.cz = fixed;
    }

    this.pivot.add(panel);
    scene.add(this.pivot);
    this.targets = [panel];
    this.rects.push(this.closedRect);

    registry.register(
      `door:${axis}:${fixed}:${from}`,
      () => ({ open: this.isOpen, unlocked: this.gate === null }),
      (v) => this.restoreState(v as { open: boolean; unlocked: boolean }),
    );
  }

  private restoreState(s: { open: boolean; unlocked: boolean }): void {
    this.gate = s.unlocked ? null : this.defaultGate;
    this.closedRect.door = this.gate === null;
    if (s.open) {
      this.gate = null;
      this.closedRect.door = true;
    }
    this.setOpenState(s.open);
  }

  private setOpenState(open: boolean): void {
    if (open === this.isOpen) return;
    this.isOpen = open;
    if (open) {
      const i = this.rects.indexOf(this.closedRect);
      if (i >= 0) this.rects.splice(i, 1);
    } else {
      this.rects.push(this.closedRect);
    }
  }

  label(): string {
    return this.isOpen ? "cerrar la puerta" : "abrir la puerta";
  }

  /**
   * Pone una condición para abrir (llave, tarjeta, código). null la quita.
   * Mientras hay condición la puerta es sólida también para el monstruo.
   */
  setGate(gate: (() => string | null) | null): void {
    if (gate) this.defaultGate = gate;
    this.gate = gate;
    this.closedRect.door = gate === null;
  }

  /** Lo usa el jugador con E. Abrir o cerrar hace ruido. */
  use(): string | null {
    if (this.isOpen) {
      if (this.playerNearDoorway()) return "No puedes cerrarla ahí.";
      this.isOpen = false;
      this.rects.push(this.closedRect);
      sfx.door();
    } else {
      if (this.gate) {
        const blocked = this.gate();
        if (blocked) return blocked;
        this.setGate(null);
      }
      this.open();
    }
    this.onNoise(this.cx, this.cz, NOISE_RADIUS);
    return null;
  }

  /** Abre la puerta sin hacer ruido. El monstruo la usa al pasar. */
  open(): void {
    if (this.isOpen || this.gate) return;
    this.isOpen = true;
    sfx.door();
    const i = this.rects.indexOf(this.closedRect);
    if (i >= 0) this.rects.splice(i, 1);
  }

  /** Distancia en planta desde (x, z) hasta el hueco de la puerta. */
  distanceTo(x: number, z: number): number {
    const r = this.closedRect;
    const cx = Math.min(r.maxX, Math.max(r.minX, x));
    const cz = Math.min(r.maxZ, Math.max(r.minZ, z));
    return Math.hypot(x - cx, z - cz);
  }

  update(dt: number): void {
    const target = (this.isOpen ? OPEN_ANGLE : 0) * this.opts.swing;
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
