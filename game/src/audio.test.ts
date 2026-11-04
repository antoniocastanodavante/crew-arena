import { describe, it, expect } from "vitest";
import { GameAudio } from "./audio";

// En Node no hay AudioContext: todas las llamadas deben ser no-op sin lanzar errores.
describe("GameAudio without AudioContext", () => {
  it("does nothing and never throws", () => {
    const a = new GameAudio();
    expect(() => {
      a.start();
      a.setVolume(0.5);
      a.setListener(1, 2, 0.3);
      a.update(0.016, { zone: "pasillo", tension: 0.5, sprinting: true, hidden: false });
      a.step(true, false);
      a.monsterStep(0, -10);
      a.door();
      a.pickup();
      a.click();
      a.lock();
      a.buzz();
      a.drawer();
      a.metal();
      a.beep();
      a.hit();
      a.stinger();
      a.alertAt(0, -5);
      a.knockAt(0, -5);
      a.suspend();
      a.resume();
    }).not.toThrow();
  });
});
