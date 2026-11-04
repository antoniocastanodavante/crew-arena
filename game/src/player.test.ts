import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Player } from "./player";
import type { Input } from "./input";

// Entrada falsa: solo W pulsada, sin mover el ratón.
function fakeInput(keys: string[] = []): Input {
  return {
    consumeLook: () => ({ x: 0, y: 0 }),
    isDown: (code: string) => keys.includes(code),
  } as unknown as Input;
}

function setup() {
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  const player = new Player(camera, []);
  return { camera, player };
}

describe("Player hiding", () => {
  it("moves to the hiding spot and reports hidden", () => {
    const { player } = setup();
    player.hide({ x: 1.65, z: -19.5, eye: 1.45 }, { x: 0.9, z: -19.5 });
    expect(player.hidden).toBe(true);
    expect(player.position.x).toBeCloseTo(1.65);
    expect(player.position.z).toBeCloseTo(-19.5);
  });

  it("does not move while hidden even if movement keys are held", () => {
    const { player } = setup();
    player.hide({ x: 1.65, z: -19.5, eye: 1.45 }, { x: 0.9, z: -19.5 });
    const before = player.position.clone();
    for (let i = 0; i < 60; i++) player.update(1 / 60, fakeInput(["KeyW"]));
    expect(player.position.distanceTo(before)).toBeCloseTo(0);
    expect(player.sprinting).toBe(false);
  });

  it("returns to the exit point when leaving", () => {
    const { player } = setup();
    player.hide({ x: 1.65, z: -19.5, eye: 1.45 }, { x: 0.9, z: -19.5 });
    player.unhide();
    expect(player.hidden).toBe(false);
    expect(player.position.x).toBeCloseTo(0.9);
    expect(player.hidingSpot).toBeNull();
  });

  it("resetTo leaves any hiding spot", () => {
    const { player } = setup();
    player.hide({ x: 1.65, z: -19.5, eye: 1.45 }, { x: 0.9, z: -19.5 });
    player.resetTo(0, 3);
    expect(player.hidden).toBe(false);
    expect(player.position.z).toBeCloseTo(3);
  });
});

describe("Player health", () => {
  it("starts at full health", () => {
    const { player } = setup();
    expect(player.health).toBe(100);
  });

  it("damage reports the moment of death and never goes below zero", () => {
    const { player } = setup();
    expect(player.damage(35)).toBe(false);
    expect(player.damage(35)).toBe(false);
    expect(player.damage(35)).toBe(true);
    expect(player.health).toBe(0);
    expect(player.damage(10)).toBe(false);
    expect(player.health).toBe(0);
  });

  it("heal never goes above the maximum", () => {
    const { player } = setup();
    player.damage(35);
    player.heal(40);
    expect(player.health).toBe(100);
    player.damage(70);
    player.heal(40);
    expect(player.health).toBe(70);
  });
});
