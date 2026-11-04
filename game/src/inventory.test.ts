import { describe, it, expect } from "vitest";
import { Inventory } from "./inventory";
import { ITEMS } from "./items";

describe("Inventory", () => {
  it("starts empty", () => {
    const inv = new Inventory();
    expect(inv.list()).toHaveLength(0);
    expect(inv.has("pila")).toBe(false);
  });

  it("counts stacked items", () => {
    const inv = new Inventory();
    inv.add("pila");
    inv.add("pila");
    expect(inv.count("pila")).toBe(2);
    expect(inv.list()).toEqual([{ id: "pila", def: ITEMS.pila, count: 2 }]);
  });

  it("removes units and fails when there are not enough", () => {
    const inv = new Inventory();
    inv.add("pila");
    expect(inv.remove("pila", 2)).toBe(false);
    expect(inv.count("pila")).toBe(1);
    expect(inv.remove("pila")).toBe(true);
    expect(inv.has("pila")).toBe(false);
  });

  it("rejects unknown item ids", () => {
    const inv = new Inventory();
    expect(() => inv.add("no_existe")).toThrow();
  });

  it("notifies listeners on every change", () => {
    const inv = new Inventory();
    let calls = 0;
    inv.onChange(() => calls++);
    inv.add("pila");
    inv.remove("pila");
    expect(calls).toBe(2);
  });
});
