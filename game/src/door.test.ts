import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Door } from "./door";
import type { Rect } from "./world";

// Puerta en la pared x = -2, hueco entre z -8.6 y -7.4, bisagra en -8.6.
function setup(px: number, pz: number) {
  const scene = new THREE.Scene();
  const rects: Rect[] = [];
  const playerPos = new THREE.Vector3(px, 0, pz);
  const door = new Door(scene, rects, playerPos, new THREE.MeshBasicMaterial(), {
    axis: "x",
    fixed: -2,
    from: -8.6,
    to: -7.4,
    swing: 1,
  });
  return { door, rects, scene };
}

describe("Door", () => {
  it("starts closed and blocks the player", () => {
    const { door, rects } = setup(0, 0);
    expect(rects).toHaveLength(1);
    expect(door.label()).toBe("abrir la puerta");
  });

  it("opening removes the collider", () => {
    const { door, rects } = setup(0, 0);
    expect(door.use()).toBeNull();
    expect(rects).toHaveLength(0);
    expect(door.label()).toBe("cerrar la puerta");
  });

  it("closing restores the collider when nobody is in the doorway", () => {
    const { door, rects } = setup(0, 0);
    door.use();
    expect(door.use()).toBeNull();
    expect(rects).toHaveLength(1);
  });

  it("refuses to close while the player stands in the doorway", () => {
    const { door, rects } = setup(-2, -8);
    door.use();
    expect(door.use()).toBe("No puedes cerrarla ahí.");
    expect(rects).toHaveLength(0);
  });

  it("swings toward the open angle over time", () => {
    const { door } = setup(0, 0);
    door.use();
    for (let i = 0; i < 120; i++) door.update(1 / 60);
    const pivot = door.targets[0].parent;
    expect(pivot).not.toBeNull();
    expect(pivot!.rotation.y).toBeCloseTo(Math.PI * 0.5 * 0.9, 2);
  });
});
