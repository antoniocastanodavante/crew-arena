import * as THREE from "three";

const MAX_BATTERY = 100;
/** Unidades de batería por segundo con la linterna encendida (~2,5 min). */
const DRAIN_PER_SEC = 0.67;
const LOW_THRESHOLD = 25;
const INTENSITY = 70;

/** Linterna sujeta a la cámara, con batería limitada y parpadeo al final. */
export class Flashlight {
  readonly light: THREE.SpotLight;
  battery = MAX_BATTERY;
  on = false;

  private flickerUntil = 0;
  private nextFlicker = 0;

  constructor(camera: THREE.Camera) {
    this.light = new THREE.SpotLight(0xfff0d0, 0, 30, Math.PI / 6.5, 0.4, 1.6);
    // Un poco abajo y a la derecha, como si la sostuviera la mano.
    this.light.position.set(0.15, -0.12, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.0008;

    // El objetivo va delante de la cámara para que la luz apunte hacia donde miras.
    const target = new THREE.Object3D();
    target.position.set(0, 0, -5);
    camera.add(target);
    this.light.target = target;

    camera.add(this.light);
  }

  get isLow(): boolean {
    return this.battery < LOW_THRESHOLD;
  }

  toggle(): void {
    if (this.battery <= 0) return;
    this.on = !this.on;
  }

  update(dt: number, t: number): void {
    if (this.on) {
      this.battery = Math.max(0, this.battery - DRAIN_PER_SEC * dt);
      if (this.battery === 0) this.on = false;
    }

    let k = 1;
    if (this.on && this.isLow) {
      if (t >= this.nextFlicker) {
        this.flickerUntil = t + 0.05 + Math.random() * 0.2;
        this.nextFlicker = t + 0.2 + Math.random() * 1.2;
      }
      k = t < this.flickerUntil ? 0.15 : 0.75 + Math.random() * 0.25;
    }

    this.light.intensity = this.on ? INTENSITY * k : 0;
  }
}
