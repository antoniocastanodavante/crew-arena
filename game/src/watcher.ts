import * as THREE from "three";
import type { Rect } from "./world";
import type { Door } from "./door";
import { createWatcherModel, type WatcherRig } from "./watcher-model";
import { circleBlocked, lineClear } from "./collision";
import { registry } from "./save";
import { sfx } from "./audio";

export type WatcherState = "patrol" | "investigate" | "chase" | "search";

/** Lo que el monstruo puede percibir del jugador. Nada más. */
export interface PlayerView {
  readonly position: THREE.Vector3;
  readonly hidden: boolean;
  readonly flashlightOn: boolean;
}

export interface WatcherDeps {
  scene: THREE.Scene;
  rects: Rect[];
  doors: Door[];
  player: PlayerView;
  onCatch(): void;
}

interface Point {
  x: number;
  z: number;
}

/** Ruta de patrulla por pasillo y habitaciones. Las puertas están en los huecos. */
const ROUTE: Point[] = [
  { x: 0, z: 4 },
  { x: 0, z: -6 },
  { x: 0, z: -8 },
  { x: -4, z: -8 },
  { x: 0, z: -8 },
  { x: 0, z: -17 },
  { x: -4, z: -17 },
  { x: 0, z: -17 },
  { x: 0, z: -12 },
  { x: 4, z: -12 },
  { x: 0, z: -12 },
  { x: 0, z: -24 },
  { x: 4, z: -24 },
  { x: 0, z: -24 },
  { x: 0, z: -4 },
];
const START_INDEX = 7;

const RADIUS = 0.35;
const PATROL_SPEED = 1.2;
const INVESTIGATE_SPEED = 1.8;
const SEARCH_SPEED = 1.4;
const CHASE_SPEED = 3.0;
const CATCH_DIST = 0.9;

const SIGHT_RANGE_BEAM = 14;
const SIGHT_RANGE_DARK = 6;
/** Cos del ángulo de visión: 0,5 equivale a 60° a cada lado. */
const CONE_COS = 0.5;
const HIDDEN_RANGE = 2;
const HIDDEN_DETECT_PER_SEC = 0.5;

const LOST_SIGHT_GRACE = 1.5;
const INVESTIGATE_WAIT = 3;
const SEARCH_TIME = 10;
const SEARCH_RADIUS = 3.5;
const STUCK_TIME = 1.2;

/**
 * THE WATCHER. Máquina de estados:
 * patrol -> investigate (oye un ruido) -> chase (lo ve) -> search (lo pierde) -> patrol.
 * Solo usa lo que percibe: si no lo ve ni lo oye, no sabe dónde está el jugador.
 */
export class Watcher {
  private readonly rig: WatcherRig;
  private _state: WatcherState = "patrol";
  private waypoint = START_INDEX;
  private target: Point | null = null;
  private lastSeen: Point | null = null;
  private graceT = 0;
  private timer = 0;
  private stuckT = 0;
  private yaw = 0;
  private animT = 0;
  private stepT = 0;
  private moveSpeed = 0;

  constructor(private readonly deps: WatcherDeps) {
    this.rig = createWatcherModel();
    deps.scene.add(this.rig.root);
    this.placeAt(ROUTE[START_INDEX]);
    // El monstruo no se guarda: al cargar una partida empieza otra vez su ruta.
    registry.register(
      "watcher",
      () => null,
      () => this.reset(),
    );
  }

  get state(): WatcherState {
    return this._state;
  }

  get x(): number {
    return this.rig.root.position.x;
  }

  get z(): number {
    return this.rig.root.position.z;
  }

  /** Sonido en (x, z). Si llega hasta el monstruo, va a investigarlo. */
  hear(x: number, z: number, radius: number): void {
    if (this._state === "chase") return;
    if (Math.hypot(x - this.x, z - this.z) > radius) return;
    this._state = "investigate";
    this.target = { x, z };
    this.timer = INVESTIGATE_WAIT;
    this.stuckT = 0;
  }

  update(dt: number, t: number): void {
    this.moveSpeed = 0;
    const p = this.deps.player.position;
    const seen = this.canSee(dt, p);

    if (seen) {
      this.lastSeen = { x: p.x, z: p.z };
      this.graceT = 0;
      if (this._state !== "chase") {
        this._state = "chase";
        this.target = null;
        sfx.alertAt(this.x, this.z);
      }
    }

    switch (this._state) {
      case "patrol":
        this.patrol(dt);
        break;
      case "investigate":
        this.investigate(dt);
        break;
      case "chase":
        this.chase(dt, seen);
        break;
      case "search":
        this.search(dt);
        break;
    }

    this.openNearbyDoors();
    this.animate(dt, t);

    if (this._state === "chase" && Math.hypot(p.x - this.x, p.z - this.z) < CATCH_DIST) {
      this.reset();
      this.deps.onCatch();
    }
  }

  /** Vuelve al inicio de la ruta. Se usa tras atrapar al jugador. */
  reset(): void {
    this._state = "patrol";
    this.target = null;
    this.lastSeen = null;
    this.graceT = 0;
    this.timer = 0;
    this.stuckT = 0;
    this.waypoint = START_INDEX;
    this.placeAt(ROUTE[START_INDEX]);
  }

  private placeAt(p: Point): void {
    this.rig.root.position.set(p.x, 0, p.z);
    this.yaw = 0;
    this.rig.root.rotation.y = 0;
  }

  /** Percepción: la visión depende del estado, la distancia, la linterna y los muros. */
  private canSee(dt: number, p: THREE.Vector3): boolean {
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);

    if (this.deps.player.hidden) {
      // Escondido, solo lo descubre si está muy cerca, y no siempre.
      return d < HIDDEN_RANGE && Math.random() < HIDDEN_DETECT_PER_SEC * dt;
    }

    const range = this.deps.player.flashlightOn ? SIGHT_RANGE_BEAM : SIGHT_RANGE_DARK;
    if (d > range) return false;

    // Persiguiendo ya lo tiene en el punto de mira; antes necesita verlo delante.
    if (this._state !== "chase" && d > 0) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      if ((dx * fx + dz * fz) / d < CONE_COS) return false;
    }

    return lineClear(this.x, this.z, p.x, p.z, this.deps.rects);
  }

  private patrol(dt: number): void {
    const wp = ROUTE[this.waypoint];
    const arrived = this.moveTo(wp, PATROL_SPEED, dt);
    if (arrived || this.stuckT > STUCK_TIME) {
      this.waypoint = (this.waypoint + 1) % ROUTE.length;
      this.stuckT = 0;
    }
  }

  private investigate(dt: number): void {
    if (!this.target) {
      this.setPatrol();
      return;
    }
    const arrived = this.moveTo(this.target, INVESTIGATE_SPEED, dt);
    if (arrived) {
      // Llegó: mira alrededor un rato y luego vuelve a patrullar.
      this.yaw += dt * 1.5;
      this.timer -= dt;
      if (this.timer <= 0) this.setPatrol();
    } else if (this.stuckT > STUCK_TIME) {
      this.setPatrol();
    }
  }

  private chase(dt: number, seen: boolean): void {
    if (seen && this.lastSeen) {
      const p = this.deps.player.position;
      this.moveTo({ x: p.x, z: p.z }, CHASE_SPEED, dt);
      return;
    }

    // Lo perdió de vista: sigue hasta donde lo vio por última vez.
    if (this.lastSeen) this.moveTo(this.lastSeen, CHASE_SPEED, dt);
    this.graceT += dt;
    if (this.graceT > LOST_SIGHT_GRACE) {
      this._state = "search";
      this.target = this.lastSeen;
      this.timer = SEARCH_TIME;
      this.stuckT = 0;
    }
  }

  private search(dt: number): void {
    if (!this.target) this.target = this.randomNear(this.lastSeen ?? { x: this.x, z: this.z });
    const arrived = this.moveTo(this.target, SEARCH_SPEED, dt);
    if (arrived || this.stuckT > STUCK_TIME) {
      this.target = this.randomNear(this.lastSeen ?? { x: this.x, z: this.z });
      this.stuckT = 0;
    }
    this.timer -= dt;
    if (this.timer <= 0) this.setPatrol();
  }

  private setPatrol(): void {
    this._state = "patrol";
    this.target = null;
    this.lastSeen = null;
    this.stuckT = 0;
    // Retoma la ruta desde el punto más cercano, no desde donde estaba antes.
    let best = 0;
    let bestD = Infinity;
    ROUTE.forEach((p, i) => {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.waypoint = best;
  }

  /** Punto libre cerca de c, para registrar la zona. */
  private randomNear(c: Point): Point {
    for (let i = 0; i < 12; i++) {
      const x = c.x + (Math.random() * 2 - 1) * SEARCH_RADIUS;
      const z = c.z + (Math.random() * 2 - 1) * SEARCH_RADIUS;
      if (!circleBlocked(x, z, RADIUS, this.deps.rects, true)) return { x, z };
    }
    return c;
  }

  /**
   * Avanza hacia el punto. Devuelve true si ya está llegado.
   * Se desliza por las paredes. Las puertas cerradas no lo frenan.
   */
  private moveTo(target: Point, speed: number, dt: number): boolean {
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;

    // Gira hacia el objetivo (el modelo mira a +Z).
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 6);

    const step = Math.min(d, speed * dt);
    const nx = this.x + (dx / d) * step;
    const nz = this.z + (dz / d) * step;
    const rects = this.deps.rects;
    const oldX = this.x;
    const oldZ = this.z;

    if (!circleBlocked(nx, nz, RADIUS, rects, true)) {
      this.setXZ(nx, nz);
    } else if (!circleBlocked(nx, this.z, RADIUS, rects, true)) {
      this.setXZ(nx, this.z);
    } else if (!circleBlocked(this.x, nz, RADIUS, rects, true)) {
      this.setXZ(this.x, nz);
    }

    const moved = Math.hypot(this.x - oldX, this.z - oldZ);
    this.moveSpeed = moved / dt;
    this.stuckT = moved < step * 0.25 ? this.stuckT + dt : 0;
    return false;
  }

  private setXZ(x: number, z: number): void {
    this.rig.root.position.set(x, 0, z);
  }

  /** Abre las puertas cerradas que tiene al lado. */
  private openNearbyDoors(): void {
    for (const door of this.deps.doors) {
      if (door.distanceTo(this.x, this.z) < 1.0) door.open();
    }
  }

  /** Animación procedural: paso, brazos al perseguir, cabeza al buscar. */
  private animate(dt: number, t: number): void {
    const rig = this.rig;
    const chasing = this._state === "chase";
    const looking = this._state === "search" || this._state === "investigate";

    this.animT += dt * this.moveSpeed * 3;
    const stride = Math.sin(this.animT) * 0.5 * Math.min(1, this.moveSpeed / 1.5);
    rig.legL.rotation.x = stride;
    rig.legR.rotation.x = -stride;

    const raise = chasing ? -1.3 : 0;
    rig.armL.rotation.x = raise - stride * 0.6;
    rig.armR.rotation.x = raise + stride * 0.6;

    rig.torso.rotation.x = chasing ? -0.35 : -0.12;
    rig.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.01;

    const headYaw = looking ? Math.sin(t * 1.1) * 0.7 : 0;
    rig.head.rotation.y += (headYaw - rig.head.rotation.y) * Math.min(1, dt * 4);
    rig.head.rotation.x = chasing ? 0.25 : 0.1;

    rig.root.rotation.y = this.yaw;

    // Pasos pesados: se oyen más rápido cuando corre.
    if (this.moveSpeed > 0.2) {
      this.stepT += dt;
      const interval = chasing ? 0.35 : 0.6;
      if (this.stepT > interval) {
        this.stepT = 0;
        sfx.monsterStep(this.x, this.z);
      }
    }
  }
}
