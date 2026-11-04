import { describe, it, expect } from "vitest";
import { assignSpots, ACCESS_SPOTS, ANY_SPOTS, rollCode, formatTime, setCode, getCode } from "./layout";
import { ITEMS } from "./items";

describe("rollCode", () => {
  it("returns four digits with an hour between 00 and 05", () => {
    for (let i = 0; i < 200; i++) {
      const c = rollCode();
      expect(c).toMatch(/^\d{4}$/);
      expect(Number(c.slice(0, 2))).toBeLessThan(6);
      expect(Number(c.slice(2))).toBeLessThan(60);
    }
  });

  it("uses the given random source", () => {
    expect(rollCode(() => 0)).toBe("0000");
    expect(formatTime("0317")).toBe("03:17");
  });
});

describe("setCode", () => {
  it("updates the code and the admission sheet text", () => {
    setCode("0542");
    expect(getCode()).toBe("0542");
    expect(ITEMS.doc_admision.description).toContain("05:42");
    setCode("0317");
  });
});

describe("assignSpots", () => {
  it("gives every request a different spot inside its pool", () => {
    const pools = ["any", "any", "any", "access", "access", "access", "access", "access"] as const;
    const spots = assignSpots([...pools], () => 0.37);
    expect(spots).toHaveLength(pools.length);
    expect(new Set(spots).size).toBe(spots.length);
    spots.forEach((s, i) => {
      const pool = pools[i] === "access" ? ACCESS_SPOTS : ANY_SPOTS;
      expect(pool).toContain(s);
    });
  });

  it("keeps access-only items out of the laboratory", () => {
    const rng = () => Math.random();
    for (let round = 0; round < 50; round++) {
      const spots = assignSpots(["access", "access", "access", "access", "any", "any"], rng);
      for (let i = 0; i < 4; i++) {
        expect(ACCESS_SPOTS).toContain(spots[i]);
      }
    }
  });
});
