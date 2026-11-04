/** Zona donde está el jugador. Cambia el ambiente. */
export type Zone = "pasillo" | "habitacion" | "quirofano" | "escondite";

export interface AmbientState {
  zone: Zone;
  /** 0 tranquilo, 1 persecución. */
  tension: number;
  sprinting: boolean;
  hidden: boolean;
}

/**
 * Sonido sintetizado con Web Audio. No carga archivos: todo son osciladores y ruido.
 * Sin AudioContext (pruebas, navegadores viejos) todas las llamadas no hacen nada.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private breath: GainNode | null = null;
  private pad: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hum: GainNode | null = null;

  private volume = 0.8;
  private listener = { x: 0, z: 0, yaw: 0 };
  private eventTimer = 4;

  /** Llamar desde un gesto del usuario (clic en Empezar). */
  start(): void {
    const ctx = this.ensure();
    void ctx?.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  setListener(x: number, z: number, yaw: number): void {
    this.listener = { x, z, yaw };
  }

  /** Mantiene el ambiente al día. Llamar cada frame mientras se juega. */
  update(dt: number, s: AmbientState): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneGain || !this.droneFilter || !this.breath || !this.pad || !this.hum) return;
    const now = ctx.currentTime;

    const drone = s.zone === "habitacion" ? 0.12 : s.zone === "quirofano" ? 0.14 : 0.1;
    this.droneGain.gain.setTargetAtTime(drone, now, 0.8);
    this.droneFilter.frequency.setTargetAtTime(s.zone === "habitacion" ? 180 : 260, now, 1);

    // La respiración se oye al correr o escondido.
    this.breath.gain.setTargetAtTime(s.hidden ? 0.14 : s.sprinting ? 0.08 : 0, now, 0.3);

    // La música de tensión sube con el monstruo cerca.
    this.pad.gain.gain.setTargetAtTime(0.02 + s.tension * 0.16, now, 0.5);
    this.pad.filter.frequency.setTargetAtTime(280 + s.tension * 500, now, 0.5);

    this.hum.gain.setTargetAtTime(s.zone === "quirofano" ? 0.02 : 0, now, 1);

    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = Math.max(2, 5 + Math.random() * 7 - s.tension * 3);
      this.randomEvent(s.zone);
    }
  }

  // ---------- Efectos de juego ----------

  step(sprinting: boolean, crouching: boolean): void {
    const vol = crouching ? 0.12 : sprinting ? 0.42 : 0.3;
    this.noiseHit("lowpass", 500 + Math.random() * 250, 0.7, vol, 0.11, null);
    this.tone("sine", 70, 60, 0.12, vol * 0.8, null, 0);
  }

  /** Paso del monstruo, con sonido espacial. */
  monsterStep(x: number, z: number): void {
    const g = this.spatialGain(x, z);
    if (g <= 0) return;
    this.tone("sine", 60, 40, 0.25, 0.4 * g, this.panFor(x, z), 0);
    this.noiseHit("lowpass", 240, 0.7, 0.2 * g, 0.2, this.panFor(x, z));
  }

  door(): void {
    this.noiseHit("bandpass", 2500, 1, 0.12, 0.04, null);
    this.tone("sawtooth", 120, 190, 0.9, 0.08, null, 0);
  }

  pickup(): void {
    this.tone("sine", 660, 660, 0.08, 0.12, null, 0);
    this.tone("sine", 990, 990, 0.08, 0.12, null, 0.08);
  }

  click(): void {
    this.noiseHit("highpass", 2200, 0.7, 0.2, 0.03, null);
  }

  lock(): void {
    this.noiseHit("bandpass", 1400, 2, 0.25, 0.25, null);
    this.tone("sine", 60, 40, 0.3, 0.3, null, 0);
  }

  buzz(): void {
    this.tone("sawtooth", 150, 120, 0.35, 0.12, null, 0);
  }

  drawer(): void {
    this.noiseHit("bandpass", 900, 3, 0.15, 0.5, null);
  }

  metal(): void {
    this.tone("sine", 700, 700, 0.3, 0.12, null, 0);
    this.tone("sine", 1100, 1100, 0.25, 0.08, null, 0.02);
    this.noiseHit("highpass", 3000, 1, 0.15, 0.05, null);
  }

  beep(): void {
    this.tone("sine", 1200, 1200, 0.1, 0.06, null, 0);
  }

  /** Aparición del monstruo: golpe agudo y ruido seco. */
  scare(): void {
    this.noiseHit("highpass", 2000, 1, 0.5, 0.25, null);
    this.tone("sawtooth", 900, 200, 0.4, 0.25, null, 0);
  }

  /** Golpe al ser atrapado. */
  hit(): void {
    this.tone("sine", 55, 30, 0.6, 0.5, null, 0);
    this.noiseHit("lowpass", 900, 0.7, 0.4, 0.5, null);
  }

  /** Acorde final de los finales. */
  stinger(): void {
    this.tone("sawtooth", 55, 55, 4, 0.12, null, 0);
    this.tone("sawtooth", 58.3, 58.3, 4, 0.12, null, 0);
  }

  /** El monstruo te ha visto. */
  alertAt(x: number, z: number): void {
    const g = this.spatialGain(x, z);
    if (g <= 0) return;
    this.tone("sawtooth", 70, 70, 0.9, 0.14 * g, this.panFor(x, z), 0);
    this.noiseHit("bandpass", 400, 1, 0.12 * g, 0.9, this.panFor(x, z));
  }

  knockAt(x: number, z: number): void {
    const g = this.spatialGain(x, z);
    if (g <= 0) return;
    this.tone("sine", 90, 50, 0.3, 0.25 * g, this.panFor(x, z), 0);
    this.noiseHit("lowpass", 300, 0.7, 0.15 * g, 0.15, this.panFor(x, z));
  }

  // ---------- Ambiente aleatorio ----------

  private randomEvent(zone: Zone): void {
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (zone === "quirofano" && r < 0.4) {
      this.drip();
    } else if (r < 0.4) {
      // Voces de las habitaciones cerradas, detrás del jugador.
      this.noiseHit("bandpass", 1500, 4, 0.05, 1.4, pan);
    } else if (r < 0.7) {
      this.tone("sine", 700, 700, 0.3, 0.06, pan, 0);
      this.noiseHit("highpass", 3000, 1, 0.08, 0.05, pan);
    } else {
      this.tone("sine", 90, 50, 0.3, 0.12, pan, 0);
    }
  }

  private drip(): void {
    this.tone("sine", 1800, 1800, 0.05, 0.05, null, 0);
  }

  // ---------- Internos ----------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === "undefined") return null;

    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    this.master = master;

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(master);

    // Búfer de ruido blanco que se reutiliza.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const ambBus = ctx.createGain();
    ambBus.connect(master);

    // Drone grave continuo
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.7;
    droneFilter.connect(ambBus);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.1;
    droneGain.connect(droneFilter);
    for (const f of [55, 55.7, 82.4]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(droneGain);
      osc.start();
    }
    this.droneGain = droneGain;
    this.droneFilter = droneFilter;

    // Ruido de sala (zumbido de ventilación)
    const room = ctx.createBufferSource();
    room.buffer = buf;
    room.loop = true;
    const roomF = ctx.createBiquadFilter();
    roomF.type = "bandpass";
    roomF.frequency.value = 320;
    roomF.Q.value = 0.8;
    const roomG = ctx.createGain();
    roomG.gain.value = 0.05;
    room.connect(roomF).connect(roomG).connect(ambBus);
    room.start();

    // Respiración: ruido filtrado con un LFO lento que la hace subir y bajar
    const breathSrc = ctx.createBufferSource();
    breathSrc.buffer = buf;
    breathSrc.loop = true;
    const breathF = ctx.createBiquadFilter();
    breathF.type = "bandpass";
    breathF.frequency.value = 900;
    breathF.Q.value = 1.2;
    const breath = ctx.createGain();
    breath.gain.value = 0;
    breathSrc.connect(breathF).connect(breath).connect(ambBus);
    breathSrc.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(breath.gain);
    lfo.start();
    this.breath = breath;

    // Capa de tensión: dos sierras desafinadas por un semitono
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 280;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.02;
    padFilter.connect(padGain).connect(ambBus);
    for (const f of [110, 116.5]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.connect(padFilter);
      osc.start();
    }
    this.pad = { gain: padGain, filter: padFilter };

    // Zumbido de los monitores del quirófano
    const hum = ctx.createGain();
    hum.gain.value = 0;
    const humOsc = ctx.createOscillator();
    humOsc.type = "sine";
    humOsc.frequency.value = 1200;
    humOsc.connect(hum).connect(ambBus);
    humOsc.start();
    this.hum = hum;

    return ctx;
  }

  /** Paneo estéreo y volumen según la posición relativa al jugador. */
  private panFor(x: number, z: number): number {
    const { x: lx, z: lz, yaw } = this.listener;
    const dx = x - lx;
    const dz = z - lz;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    // Derecha de la cámara: (cos yaw, -sin yaw), igual que en player.ts
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d));
  }

  /** Volumen según la distancia. Cero si está fuera de alcance. */
  private spatialGain(x: number, z: number): number {
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    if (d > 18) return 0;
    return Math.max(0.15, 1 - d / 18);
  }

  private output(pan: number | null): AudioNode {
    const ctx = this.ctx!;
    const bus = this.sfxBus!;
    if (pan === null) return bus;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(bus);
    return p;
  }

  private noiseHit(
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    dur: number,
    pan: number | null,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.output(pan));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    pan: number | null,
    delay: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.output(pan));
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

/** Instancia compartida por todo el juego. */
export const sfx = new GameAudio();
