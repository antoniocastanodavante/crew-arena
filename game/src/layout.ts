import { ITEMS } from "./items";
import { registry } from "./save";

/** Código por defecto (partidas guardadas antiguas y tests). */
export const DEFAULT_CODE = "0317";

export interface Spot {
  x: number;
  z: number;
}

/**
 * Zonas donde puede aparecer un objeto. Se puede llegar a todas sin llaves o
 * con la llave del carro, así que cualquier combinación sigue siendo resoluble.
 */
export type SpotPool = "access" | "any";

/** Pasillo, habitación A y habitación B. Todo sitio alcanzable sin pasar el laboratorio. */
export const ACCESS_SPOTS: Spot[] = [
  { x: -0.8, z: 1.0 },
  { x: 0.6, z: -2.0 },
  { x: -0.6, z: -6.5 },
  { x: 1.0, z: -10.5 },
  { x: -0.5, z: -20.5 },
  { x: 0.5, z: -27.0 },
  { x: -3.2, z: -7.0 },
  { x: -3.2, z: -9.5 },
  { x: -4.0, z: -5.8 },
  { x: -6.5, z: -9.2 },
  { x: -3.5, z: -10.5 },
  { x: -6.4, z: -18.5 },
  { x: -3.0, z: -15.0 },
  { x: -6.6, z: -14.5 },
  { x: -3.2, z: -19.0 },
  { x: -8.4, z: -18.5 },
];

/** Además, el laboratorio (solo se llega con la tarjeta). */
export const ANY_SPOTS: Spot[] = [
  ...ACCESS_SPOTS,
  { x: 3.0, z: -13.0 },
  { x: 5.5, z: -13.8 },
  { x: 6.2, z: -10.0 },
];

/**
 * Reparte un punto distinto a cada petición, dentro de su zona.
 * Ninguno se repite. rng debe devolver números en [0, 1).
 */
export function assignSpots(pools: SpotPool[], rng: () => number = Math.random): Spot[] {
  const taken = new Set<Spot>();
  const out: Spot[] = new Array(pools.length);
  // Primero las zonas de acceso, que son las más restringidas, para que no se queden sin sitio
  const order = pools.map((p, i) => ({ p, i })).sort((a, b) => (a.p === b.p ? 0 : a.p === "access" ? -1 : 1));
  for (const { p, i } of order) {
    const spots = p === "access" ? ACCESS_SPOTS : ANY_SPOTS;
    const free = spots.filter((s) => !taken.has(s));
    if (free.length === 0) throw new Error("No hay sitio libre para un objeto");
    const pick = free[Math.floor(rng() * free.length)];
    taken.add(pick);
    out[i] = pick;
  }
  return out;
}

// ---------- Código del teclado y la hora de ingreso ----------

let code = DEFAULT_CODE;

export function getCode(): string {
  return code;
}

/** "0317" -> "03:17" */
export function formatTime(c: string): string {
  return `${c.slice(0, 2)}:${c.slice(2)}`;
}

/** Hora de ingreso al azar de madrugada, en formato HHMM. */
export function rollCode(rng: () => number = Math.random): string {
  const hh = Math.floor(rng() * 6);
  const mm = Math.floor(rng() * 60);
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
}

function applyCode(c: string): void {
  code = c;
  ITEMS.doc_admision.description =
    `Nombre del paciente borrado. Hora de ingreso: ${formatTime(c)}. Destino: quirófano. Firma ilegible.`;
}

export function setCode(c: string): void {
  applyCode(c);
}

applyCode(DEFAULT_CODE);

registry.register(
  "layout",
  () => ({ code }),
  (v) => applyCode((v as { code: string }).code),
);
