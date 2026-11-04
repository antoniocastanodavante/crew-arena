export type NoiseListener = (x: number, z: number, radius: number) => void;

/**
 * Sonidos del escenario: pasos al correr, puertas, etc.
 * Quien escucha decide si el sonido le llega según la distancia.
 */
export class NoiseBus {
  private readonly listeners: NoiseListener[] = [];

  on(fn: NoiseListener): void {
    this.listeners.push(fn);
  }

  emit(x: number, z: number, radius: number): void {
    for (const fn of this.listeners) fn(x, z, radius);
  }
}
