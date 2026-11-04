import { describe, it, expect } from "vitest";
import { Registry, decideEnding } from "./save";

describe("Registry", () => {
  it("snapshots and restores registered state", () => {
    const r = new Registry();
    let value = 1;
    r.register("a", () => value, (v) => {
      value = v as number;
    });
    r.captureInitial();

    value = 5;
    const snap = r.snapshot();
    expect(snap).toEqual({ a: 5 });

    value = 9;
    r.restore(snap);
    expect(value).toBe(5);
  });

  it("reset returns to the state captured at start", () => {
    const r = new Registry();
    let value = 1;
    r.register("a", () => value, (v) => {
      value = v as number;
    });
    r.captureInitial();
    value = 7;
    r.reset();
    expect(value).toBe(1);
  });

  it("ids missing from a save go back to the initial state", () => {
    const r = new Registry();
    let a = 0;
    let b = 0;
    r.register("a", () => a, (v) => {
      a = v as number;
    });
    r.register("b", () => b, (v) => {
      b = v as number;
    });
    b = 2;
    r.captureInitial();
    a = 4;
    b = 8;
    r.restore({ a: 3 });
    expect(a).toBe(3);
    expect(b).toBe(2);
  });

  it("copies values so later changes do not alter the snapshot", () => {
    const r = new Registry();
    let list: number[] = [1];
    r.register("l", () => list, (v) => {
      list = v as number[];
    });
    r.captureInitial();
    const snap = r.snapshot();
    list.push(2);
    expect(snap.l).toEqual([1]);
  });
});

describe("decideEnding", () => {
  it("good ending needs both documents", () => {
    expect(decideEnding({ admision: true, guardia: true }, false)).toBe("bueno");
  });

  it("secret ending needs both documents and the computer record", () => {
    expect(decideEnding({ admision: true, guardia: true }, true)).toBe("secreto");
  });

  it("anything less is the bad ending", () => {
    expect(decideEnding({ admision: true, guardia: false }, true)).toBe("malo");
    expect(decideEnding({ admision: false, guardia: false }, false)).toBe("malo");
  });
});
