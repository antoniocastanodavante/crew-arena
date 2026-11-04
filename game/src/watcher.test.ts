import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { Watcher, type PlayerView } from "./watcher";
import type { Rect } from "./world";

// Monstruo en (0, -17), mirando a +Z. Jugador de prueba controlable.
function setup(rects: Rect[] = [], flashlightOn = false) {
  const scene = new THREE.Scene();
  const player: PlayerView & { position: THREE.Vector3 } = {
    position: new THREE.Vector3(0, 0, 3),
    hidden: false,
    flashlightOn,
  };
  const onCatch = vi.fn();
  const watcher = new Watcher({ scene, rects, doors: [], player, onCatch });
  return { watcher, player, onCatch };
}

function run(w: Watcher, seconds: number): void {
  const step = 1 / 60;
  for (let i = 0; i < seconds / step; i++) w.update(step, i * step);
}

describe("Watcher", () => {
  it("starts patrolling and does not know where the player is", () => {
    const { watcher } = setup();
    expect(watcher.state).toBe("patrol");
  });

  it("goes to investigate a noise inside its hearing radius", () => {
    const { watcher } = setup();
    watcher.hear(0, -30, 20);
    expect(watcher.state).toBe("investigate");
  });

  it("ignores a noise outside its hearing radius", () => {
    const { watcher } = setup();
    watcher.hear(0, -60, 5);
    expect(watcher.state).toBe("patrol");
  });

  it("chases a player it sees in front of it", () => {
    const { watcher, player } = setup([], false);
    player.position.set(0, 0, -12); // 5 m delante, dentro del alcance en la oscuridad
    run(watcher, 0.05);
    expect(watcher.state).toBe("chase");
  });

  it("does not see a player behind it", () => {
    const { watcher, player } = setup([], false);
    player.position.set(0, 0, -22); // 5 m detrás
    run(watcher, 0.05);
    expect(watcher.state).toBe("patrol");
  });

  it("does not see a player through a wall", () => {
    const wall: Rect = { minX: -1, maxX: 1, minZ: -14, maxZ: -13.8 };
    const { watcher, player } = setup([wall], false);
    player.position.set(0, 0, -12);
    run(watcher, 0.05);
    expect(watcher.state).toBe("patrol");
  });

  it("searches after losing sight, not before the grace time", () => {
    const { watcher, player } = setup([], false);
    player.position.set(0, 0, -12);
    run(watcher, 0.05);
    expect(watcher.state).toBe("chase");

    // Se va muy lejos, fuera de alcance
    player.position.set(0, 0, 20);
    run(watcher, 1.0);
    expect(watcher.state).toBe("chase");
    run(watcher, 1.5);
    expect(watcher.state).toBe("search");
  });

  it("calls onCatch when it reaches a chased player and resets", () => {
    const { watcher, player, onCatch } = setup([], false);
    player.position.set(0, 0, -12);
    // Avanza frame a frame hasta la captura y mira el estado en ese mismo frame.
    for (let i = 0; i < 600 && onCatch.mock.calls.length === 0; i++) {
      watcher.update(1 / 60, i / 60);
    }
    expect(onCatch).toHaveBeenCalledTimes(1);
    expect(watcher.state).toBe("patrol");
  });
});
