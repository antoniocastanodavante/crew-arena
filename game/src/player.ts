import * as THREE from "three";
import type { Input } from "./input";
import type { Rect } from "./world";
import { circleBlocked } from "./collision";
import { registry } from "./save";

const RADIUS = 0.3;
const STAND_H = 1.65;
const CROUCH_H = 1.0;
const WALK_SPEED = 2.2;
const SPRINT_SPEED = 4.2;
const CROUCH_SPEED = 1.1;
const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = 1.45;
const NORMAL_FOV = 72;
const HIDE_FOV = 60;
const TWEEN_TIME = 0.5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

/** Punto donde el jugador se esconde: altura de los ojos dentro del escondite. */
export interface HideSpot {
  x: number;
  z: number;
  eye: number;
}

/** Jugador en primera persona con colisión contra las cajas del escenario. */
export class Player {
  readonly position = new THREE.Vector3(0, 0, 3);
  moving = false;
  sprinting = false;
  crouching = false;

  private _hidden = false;
  private hideSpot: HideSpot | null = null;
  private hideExit: { x: number; z: number } | null = null;
  /** Transición de cámara al entrar o salir de un escondite. */
  private tween: { from: THREE.Vector3; t: number } | null = null;

  /** Ajustes de Configuración. */
  sensitivity = 1;
  bobScale = 1;

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
    registry.register(
      "player",
      () => ({ x: this.position.x, z: this.position.z }),
      (v) => {
        const p = v as { x: number; z: number };
        this.resetTo(p.x, p.z);
      },
    );
  }

  get hidden(): boolean {
    return this._hidden;
  }

  /** Giro horizontal de la cámara, para el sonido espacial. */
  get facing(): number {
    return this.yaw;
  }

  /** Orienta la cámara. Solo lo usa el modo de pruebas (?debug). */
  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
  }

  get hidingSpot(): HideSpot | null {
    return this.hideSpot;
  }

  /** Se esconde en spot. Sale por exit cuando decida. */
  hide(spot: HideSpot, exit: { x: number; z: number }): void {
    if (this._hidden) return;
    this.beginTween();
    this._hidden = true;
    this.hideSpot = spot;
    this.hideExit = exit;
    this.position.set(spot.x, 0, spot.z);
    this.moving = false;
    this.sprinting = false;
    this.crouching = false;
  }

  unhide(): void {
    if (!this._hidden || !this.hideExit) return;
    this.beginTween();
    this._hidden = false;
    this.position.set(this.hideExit.x, 0, this.hideExit.z);
    this.hideSpot = null;
    this.hideExit = null;
  }

  update(dt: number, input: Input): void {
    const look = input.consumeLook();
    const k = LOOK_SENSITIVITY * this.sensitivity;
    this.yaw -= look.x * k;
    this.pitch = clamp(this.pitch - look.y * k, -MAX_PITCH, MAX_PITCH);

    // Escondido se puede mirar alrededor, pero no moverse.
    if (!this._hidden) {
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
    } else {
      this.moving = false;
      this.sprinting = false;
      this.crouching = false;
    }

    const targetEye = this._hidden && this.hideSpot
      ? this.hideSpot.eye
      : this.crouching ? CROUCH_H : STAND_H;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // Al esconderse la vista se cierra un poco, como si mirases por una rendija.
    const fovTarget = this._hidden ? HIDE_FOV : NORMAL_FOV;
    if (Math.abs(fovTarget - this.camera.fov) > 0.01) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }

    if (this.tween) {
      this.tween.t += dt / TWEEN_TIME;
      if (this.tween.t >= 1) this.tween = null;
    }

    if (this.moving) this.bobT += dt * (this.sprinting ? 13 : 8);
    const bob = this.moving ? Math.sin(this.bobT) * (this.sprinting ? 0.05 : 0.025) : 0;
    this.sync(bob * this.bobScale);
  }

  private sync(bob: number): void {
    const x = this.position.x;
    const y = this.eye + bob;
    const z = this.position.z;
    if (this.tween) {
      const k = smooth(Math.min(1, this.tween.t));
      const f = this.tween.from;
      this.camera.position.set(f.x + (x - f.x) * k, f.y + (y - f.y) * k, f.z + (z - f.z) * k);
    } else {
      this.camera.position.set(x, y, z);
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private beginTween(): void {
    this.tween = { from: this.camera.position.clone(), t: 0 };
  }

  /** Coloca al jugador en (x, z) sin comprobar colisiones. Saca de cualquier escondite. */
  resetTo(x: number, z: number): void {
    this._hidden = false;
    this.hideSpot = null;
    this.hideExit = null;
    this.tween = null;
    this.position.set(x, 0, z);
  }

  private moveTo(x: number, z: number): void {
    if (circleBlocked(x, z, RADIUS, this.rects, false)) return;
    this.position.x = x;
    this.position.z = z;
  }
}
