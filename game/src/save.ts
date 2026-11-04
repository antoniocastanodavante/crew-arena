/** Copia JSON-segura de un valor, para no compartir referencias con el guardado. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

interface Entry {
  get(): unknown;
  set(v: unknown): void;
  initial: unknown;
}

/**
 * Registro de todo el estado que se guarda. Cada objeto con estado se registra
 * al crearse con un id, cómo leer su estado y cómo restaurarlo.
 * Tras crear el escenario se llama a captureInitial(), que fija el estado de inicio.
 */
export class Registry {
  private readonly entries = new Map<string, Entry>();

  register(id: string, get: () => unknown, set: (v: unknown) => void): void {
    this.entries.set(id, { get, set, initial: undefined });
  }

  /** Guarda el estado inicial de todo lo registrado. Llamar una vez, tras crear el escenario. */
  captureInitial(): void {
    for (const e of this.entries.values()) e.initial = clone(e.get());
  }

  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, e] of this.entries) out[id] = clone(e.get());
    return out;
  }

  /** Aplica un guardado. Lo que no esté en el guardado vuelve al estado inicial. */
  restore(data: Record<string, unknown>): void {
    for (const [id, e] of this.entries) {
      e.set(clone(id in data ? data[id] : e.initial));
    }
  }

  /** Vuelve todo al estado inicial (nueva partida). */
  reset(): void {
    this.restore({});
  }
}

export const registry = new Registry();

/** Banderas de historia: documentos leídos, descubrimientos, etc. */
const flags: Record<string, boolean> = {};

export function setFlag(name: string): void {
  flags[name] = true;
}

export function hasFlag(name: string): boolean {
  return flags[name] === true;
}

registry.register(
  "flags",
  () => ({ ...flags }),
  (v) => {
    for (const k of Object.keys(flags)) delete flags[k];
    Object.assign(flags, v as Record<string, boolean>);
  },
);

const SAVE_KEY = "shadows.save";
const ENDINGS_KEY = "shadows.endings";
const SETTINGS_KEY = "shadows.settings";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function hasSave(): boolean {
  return storage()?.getItem(SAVE_KEY) != null;
}

export function saveGame(): void {
  storage()?.setItem(SAVE_KEY, JSON.stringify(registry.snapshot()));
}

/** Carga la partida guardada. Devuelve false si no hay guardado válido. */
export function loadGame(): boolean {
  const raw = storage()?.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    registry.restore(JSON.parse(raw) as Record<string, unknown>);
    return true;
  } catch {
    return false;
  }
}

export type EndingId = "bueno" | "malo" | "secreto";
const ENDING_IDS: EndingId[] = ["bueno", "malo", "secreto"];

export function getEndings(): EndingId[] {
  const raw = storage()?.getItem(ENDINGS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as string[];
    return ENDING_IDS.filter((id) => list.includes(id));
  } catch {
    return [];
  }
}

export function recordEnding(id: EndingId): void {
  const list = new Set(getEndings());
  list.add(id);
  storage()?.setItem(ENDINGS_KEY, JSON.stringify([...list]));
}

/**
 * Decide el final al salir. Secreto: leíste el registro del ordenador y tienes
 * las dos fichas. Bueno: tienes las dos fichas. Malo: el resto.
 */
export function decideEnding(docs: { admision: boolean; guardia: boolean }, computerRead: boolean): EndingId {
  if (docs.admision && docs.guardia && computerRead) return "secreto";
  if (docs.admision && docs.guardia) return "bueno";
  return "malo";
}

export interface Settings {
  /** Multiplicador de la sensibilidad del ratón. */
  sensitivity: number;
  /** Quita el balanceo de la cámara al andar. */
  reduceMotion: boolean;
}

const DEFAULT_SETTINGS: Settings = { sensitivity: 1, reduceMotion: false };

export function loadSettings(): Settings {
  const raw = storage()?.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      sensitivity: typeof s.sensitivity === "number" ? s.sensitivity : DEFAULT_SETTINGS.sensitivity,
      reduceMotion: s.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
}
