import type { Rect } from "./world";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Un círculo de radio r en (x, z) toca alguna caja.
 * Con ignoreDoors, las puertas cerradas no bloquean (el monstruo las abre).
 */
export function circleBlocked(x: number, z: number, r: number, rects: Rect[], ignoreDoors: boolean): boolean {
  for (const rc of rects) {
    if (ignoreDoors && rc.door) continue;
    const cx = clamp(x, rc.minX, rc.maxX);
    const cz = clamp(z, rc.minZ, rc.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

export function pointInside(x: number, z: number, rects: Rect[]): boolean {
  for (const rc of rects) {
    if (x >= rc.minX && x <= rc.maxX && z >= rc.minZ && z <= rc.maxZ) return true;
  }
  return false;
}

/** Línea de visión libre entre dos puntos: ninguna caja (ni puerta cerrada) en medio. */
export function lineClear(x0: number, z0: number, x1: number, z1: number, rects: Rect[]): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(d / 0.1));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (pointInside(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rects)) return false;
  }
  return true;
}
