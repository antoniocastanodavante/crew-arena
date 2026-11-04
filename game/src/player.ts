import * as THREE from "three";
import type { Input } from "./input";
import type { Rect } from "./world";

const RADIUS = 0.3;
const STAND_H = 1.65;
const CROUCH_H = 1.0;
const WALK_SPEED = 2.2;
const SPRINT_SPEED = 4.2;
const CROUCH_SPEED = 1.1;
const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = 1.45;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Jugador en primera persona con colisión contra las cajas del escenario. */
export class Player {
  readonly position = new THREE.Vector3(0, 0, 3);
  moving = false;
  sprinting = false;
  crouching = false;

  private yaw = 0;
  private pitch = 0;
  private eye = STAND_H;
  private bobT = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly rects: Rect[],
  ) {
    camera.rotation.order = "YXZ";
    this.sync(0);
  }

  update(dt: number, input: Input): void {
    const look = input.consumeLook();
    this.yaw -= look.x * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch - look.y * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);

    this.crouching = input.isDown("ControlLeft") || input.isDown("ControlRight");
    const wantsSprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight");

    const forward = (input.isDown("KeyW") ? 1 : 0) - (input.isDown("KeyS") ? 1 : 0);
    const strafe = (input.isDown("KeyD") ? 1 : 0) - (input.isDown("KeyA") ? 1 : 0);
    this.moving = forward !== 0 || strafe !== 0;
    this.sprinting = this.moving && wantsSprint && !this.crouching;

    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    if (this.moving) {
      // Con yaw 0 la cámara mira a -Z y su derecha es +X.
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      let dx = -sin * forward + cos * strafe;
      let dz = -cos * forward - sin * strafe;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      // Mover por ejes por separado para deslizar contra las paredes.
      this.moveTo(this.position.x + dx * speed * dt, this.position.z);
      this.moveTo(this.position.x, this.position.z + dz * speed * dt);
    }

    const targetEye = this.crouching ? CROUCH_H : STAND_H;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    if (this.moving) this.bobT += dt * (this.sprinting ? 13 : 8);
    this.sync(this.moving ? Math.sin(this.bobT) * (this.sprinting ? 0.05 : 0.025) : 0);
  }

  private sync(bob: number): void {
    this.camera.position.set(this.position.x, this.eye + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private moveTo(x: number, z: number): void {
    if (this.blocked(x, z)) return;
    this.position.x = x;
    this.position.z = z;
  }

  /** Comprueba si un círculo de radio RADIUS en (x, z) toca alguna caja. */
  private blocked(x: number, z: number): boolean {
    for (const r of this.rects) {
      const cx = clamp(x, r.minX, r.maxX);
      const cz = clamp(z, r.minZ, r.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }
}
