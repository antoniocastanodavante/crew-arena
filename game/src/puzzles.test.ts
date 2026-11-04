import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { Inventory } from "./inventory";
import { LabPuzzle, Keypad, KEYPAD_CODE } from "./puzzles";
import { Door } from "./door";
import type { Rect } from "./world";

describe("LabPuzzle", () => {
  it("solves with the order on the sign and gives a fuse", () => {
    const inv = new Inventory();
    const lab = new LabPuzzle(inv);
    lab.press("rojo");
    lab.press("azul");
    lab.press("verde");
    expect(lab.solved).toBe(true);
    expect(inv.has("fusible")).toBe(true);
  });

  it("resets when the order is wrong", () => {
    const inv = new Inventory();
    const lab = new LabPuzzle(inv);
    lab.press("rojo");
    lab.press("verde");
    expect(lab.progress).toBe(0);
    expect(lab.solved).toBe(false);
    expect(inv.has("fusible")).toBe(false);
  });
});

describe("Keypad", () => {
  it("accepts the code from the admission sheet", () => {
    const onNoise = vi.fn();
    const keypad = new Keypad(new THREE.Object3D(), () => {}, onNoise, { x: 0, z: 0 });
    expect(keypad.check(KEYPAD_CODE).ok).toBe(true);
    expect(keypad.solved).toBe(true);
    expect(onNoise).not.toHaveBeenCalled();
  });

  it("rejects a wrong code and makes noise", () => {
    const onNoise = vi.fn();
    const keypad = new Keypad(new THREE.Object3D(), () => {}, onNoise, { x: 1.8, z: -22.9 });
    expect(keypad.check("1234").ok).toBe(false);
    expect(keypad.solved).toBe(false);
    expect(onNoise).toHaveBeenCalledWith(1.8, -22.9, expect.any(Number));
  });
});

describe("Door gate", () => {
  function doorWithGate(gate: (() => string | null) | null) {
    const scene = new THREE.Scene();
    const rects: Rect[] = [];
    const door = new Door(
      scene,
      rects,
      new THREE.Vector3(0, 0, 0),
      new THREE.MeshBasicMaterial(),
      { axis: "x", fixed: 2, from: -24.6, to: -23.4, swing: 1 },
      () => {},
    );
    if (gate) door.setGate(gate);
    return { door, rects };
  }

  it("stays closed and shows the message while the gate blocks", () => {
    const { door, rects } = doorWithGate(() => "Cerrada con llave.");
    expect(door.use()).toBe("Cerrada con llave.");
    expect(rects).toHaveLength(1);
    expect(door.label()).toBe("abrir la puerta");
  });

  it("opens once the gate passes and stops being solid for the monster", () => {
    let unlocked = false;
    const { door, rects } = doorWithGate(() => (unlocked ? null : "Cerrada."));
    door.use();
    unlocked = true;
    expect(door.use()).toBeNull();
    expect(rects).toHaveLength(0);
  });
});
