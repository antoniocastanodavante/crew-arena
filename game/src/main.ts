import * as THREE from "three";
import { createWorld } from "./world";
import { Player } from "./player";
import { Flashlight } from "./flashlight";
import { Input } from "./input";
import { Interactor } from "./interact";
import { createInteractables } from "./interactables";
import { Inventory } from "./inventory";
import { InventoryUI } from "./inventory-ui";
import { NoiseBus } from "./noise";
import { createHidingSpots } from "./hiding";
import { Watcher, type PlayerView } from "./watcher";
import { createPuzzles } from "./puzzles";
import { KeypadUI } from "./keypad-ui";
import {
  decideEnding,
  getEndings,
  hasFlag,
  hasSave,
  loadGame,
  loadSettings,
  recordEnding,
  registry,
  saveGame,
  saveSettings,
  type EndingId,
  type Settings,
} from "./save";
import { ENDING_TEXT } from "./endings";
import { sfx, type Zone } from "./audio";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("game");
const hud = byId<HTMLDivElement>("hud");
const batteryFill = byId<HTMLDivElement>("battery-fill");
const promptEl = byId<HTMLDivElement>("prompt");
const messageEl = byId<HTMLDivElement>("message");

const menuRoot = byId<HTMLDivElement>("start-screen");
const pauseRoot = byId<HTMLDivElement>("pause-screen");
const settingsRoot = byId<HTMLDivElement>("settings");
const endingsRoot = byId<HTMLDivElement>("endings");
const deathRoot = byId<HTMLDivElement>("death");
const endingRoot = byId<HTMLDivElement>("ending");
const inventoryRoot = byId<HTMLDivElement>("inventory");
const keypadRoot = byId<HTMLDivElement>("keypad");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// 1.5 como máximo: en pantallas de alta densidad el coste de píxeles crece muy rápido.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// PCF en vez de PCFSoft: la sombra se ve casi igual y cuesta menos por píxel.
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);
scene.fog = new THREE.FogExp2(0x030303, 0.09);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
scene.add(camera);

const world = createWorld(scene);
const player = new Player(camera, world.rects);
const flashlight = new Flashlight(camera);
const inventory = new Inventory();

/** Partida en curso (después de Nueva o Continuar). */
let started = false;
/** El mundo avanza solo mientras es true. */
let running = false;
/** Panel a pantalla completa abierto: inventario, teclado, muerte o final. */
let panelOpen: HTMLElement | null = null;
/** A dónde vuelve el panel de Configuración. */
let settingsBack: () => void = () => {};

let messageTimer = 0;
function notify(text: string): void {
  messageEl.textContent = text;
  messageEl.hidden = false;
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => {
    messageEl.hidden = true;
  }, 3500);
}

const noiseBus = new NoiseBus();

const { items, doors } = createInteractables({
  scene,
  rects: world.rects,
  world,
  playerPos: player.position,
  inventory,
  noise: (x, z, r) => noiseBus.emit(x, z, r),
});

const puzzles = createPuzzles({
  scene,
  rects: world.rects,
  world,
  inventory,
  noise: (x, z, r) => noiseBus.emit(x, z, r),
  doors,
  openKeypad: () => openKeypad(),
});

const interactables = [
  ...items,
  ...puzzles.items,
  ...createHidingSpots({ scene, rects: world.rects, player }),
];

const playerView: PlayerView = {
  position: player.position,
  get hidden() {
    return player.hidden;
  },
  get flashlightOn() {
    return flashlight.on;
  },
};

const watcher = new Watcher({
  scene,
  rects: world.rects,
  doors,
  player: playerView,
  onCatch: () => {
    sfx.hit();
    showDeath();
  },
});
noiseBus.on((x, z, r) => watcher.hear(x, z, r));

// Todo lo que tiene estado ya está creado: se fija el estado inicial para las nuevas partidas.
registry.captureInitial();

// Correr hace ruido cada poco. El monstruo lo oye dentro de 10 m.
let footstepTimer = 0;
const interactor = new Interactor(interactables, {
  onPrompt: (text) => {
    // Solo se toca el DOM cuando cambia la pista (esto se llama cada frame).
    const next = text ?? "";
    if (promptEl.textContent !== next) promptEl.textContent = next;
    if (promptEl.hidden !== (text === null)) promptEl.hidden = text === null;
  },
  onMessage: notify,
});

const inventoryUI = new InventoryUI(
  inventory,
  {
    grid: byId<HTMLElement>("inv-grid"),
    name: byId<HTMLElement>("inv-name"),
    desc: byId<HTMLElement>("inv-desc"),
    useBtn: byId<HTMLButtonElement>("inv-use"),
    feedback: byId<HTMLElement>("inv-feedback"),
  },
  (id) => {
    if (id !== "pila" || !inventory.remove("pila")) return "";
    flashlight.recharge(40);
    return "Pila colocada. La linterna tiene más batería.";
  },
);

const keypadUI = new KeypadUI(
  {
    pad: byId<HTMLElement>("keypad-pad"),
    display: byId<HTMLElement>("keypad-display"),
    feedback: byId<HTMLElement>("keypad-feedback"),
  },
  (code) => puzzles.keypad.check(code),
  () => {
    closePanel();
    notify("Puedes abrir la puerta del quirófano.");
  },
);

// ---------- Paneles y pantallas ----------

/** Abre un panel a pantalla completa. Suelta el ratón y para el mundo. */
function openPanel(el: HTMLElement): void {
  panelOpen = el;
  running = false;
  promptEl.hidden = true;
  el.hidden = false;
  input.releaseLock();
}

/** Cierra el panel y vuelve al juego, si el juego sigue activo. */
function closePanel(): void {
  if (!panelOpen) return;
  panelOpen.hidden = true;
  panelOpen = null;
  running = started;
  if (started) input.requestLock();
}

function openKeypad(): void {
  if (!started || !running) return;
  keypadUI.reset();
  openPanel(keypadRoot);
}

function openInventory(): void {
  if (!started || !running || player.hidden) return;
  inventoryUI.reset();
  openPanel(inventoryRoot);
}

function hideAllScreens(): void {
  for (const el of [menuRoot, pauseRoot, settingsRoot, endingsRoot, deathRoot, endingRoot, inventoryRoot, keypadRoot]) {
    el.hidden = true;
  }
  panelOpen = null;
}

function showMenu(): void {
  hideAllScreens();
  started = false;
  running = false;
  hud.hidden = true;
  promptEl.hidden = true;
  byId<HTMLButtonElement>("continue-btn").disabled = !hasSave();
  menuRoot.hidden = false;
  input.releaseLock();
}

/** Nueva partida (estado inicial) o continuar desde el último guardado. */
function startGame(fresh: boolean): void {
  if (fresh) {
    registry.reset();
  } else if (!loadGame()) {
    notify("No hay partida guardada.");
    return;
  }
  hideAllScreens();
  ended = false;
  started = true;
  running = true;
  hud.hidden = false;
  sfx.start();
  input.requestLock();
}

function showPause(): void {
  hideAllScreens();
  running = false;
  pauseRoot.hidden = false;
  sfx.suspend();
}

function showDeath(): void {
  hideAllScreens();
  openPanel(deathRoot);
}

function showEnding(kind: EndingId): void {
  recordEnding(kind);
  sfx.stinger();
  byId<HTMLElement>("ending-title").textContent = ENDING_TEXT[kind].title;
  byId<HTMLElement>("ending-text").textContent = ENDING_TEXT[kind].text;
  openPanel(endingRoot);
}

function showEndings(): void {
  hideAllScreens();
  const list = byId<HTMLUListElement>("endings-list");
  const found = new Set(getEndings());
  list.replaceChildren();
  for (const id of ["bueno", "malo", "secreto"] as EndingId[]) {
    const li = document.createElement("li");
    li.textContent = found.has(id)
      ? `${ENDING_TEXT[id].title}. ${ENDING_TEXT[id].text}`
      : "???";
    list.appendChild(li);
  }
  endingsRoot.hidden = false;
}

/** Configuración desde el menú o desde la pausa. Volver lleva a donde se abrió. */
function showSettings(back: () => void): void {
  hideAllScreens();
  settingsBack = back;
  syncSettingsUI(currentSettings);
  settingsRoot.hidden = false;
}

// ---------- Configuración ----------

let currentSettings: Settings = loadSettings();

function applySettings(s: Settings): void {
  currentSettings = s;
  player.sensitivity = s.sensitivity;
  player.bobScale = s.reduceMotion ? 0 : 1;
  sfx.setVolume(s.volume);
  document.body.classList.toggle("reduce-motion", s.reduceMotion);
}

function syncSettingsUI(s: Settings): void {
  const range = byId<HTMLInputElement>("set-sensitivity");
  range.value = String(s.sensitivity);
  byId<HTMLElement>("set-sensitivity-value").textContent = `${s.sensitivity.toFixed(1)}×`;
  byId<HTMLInputElement>("set-volume").value = String(s.volume);
  byId<HTMLElement>("set-volume-value").textContent = `${Math.round(s.volume * 100)} %`;
  byId<HTMLInputElement>("set-reduce-motion").checked = s.reduceMotion;
}

/** Zona según la posición: cambia el ambiente sonoro. */
function zoneAt(x: number, z: number, hidden: boolean): Zone {
  if (hidden) return "escondite";
  if (x > 2 && z < -22) return "quirofano";
  if ((x < -2 || x > 2) && z < -4) return "habitacion";
  return "pasillo";
}

byId<HTMLInputElement>("set-sensitivity").addEventListener("input", (e) => {
  const value = Number((e.target as HTMLInputElement).value);
  const next = { ...currentSettings, sensitivity: value };
  applySettings(next);
  saveSettings(next);
  byId<HTMLElement>("set-sensitivity-value").textContent = `${value.toFixed(1)}×`;
});

byId<HTMLInputElement>("set-volume").addEventListener("input", (e) => {
  const value = Number((e.target as HTMLInputElement).value);
  const next = { ...currentSettings, volume: value };
  applySettings(next);
  saveSettings(next);
  byId<HTMLElement>("set-volume-value").textContent = `${Math.round(value * 100)} %`;
});

byId<HTMLInputElement>("set-reduce-motion").addEventListener("change", (e) => {
  const next = { ...currentSettings, reduceMotion: (e.target as HTMLInputElement).checked };
  applySettings(next);
  saveSettings(next);
});

applySettings(currentSettings);

// ---------- Entrada ----------

// Esc libera el puntero en el navegador; eso dispara onLockChange(false) y abre la pausa.
const input = new Input(canvas, {
  onLockChange: (locked) => {
    if (!started || panelOpen) return;
    if (locked) {
      running = true;
      pauseRoot.hidden = true;
    } else {
      showPause();
    }
  },
  onAction: (code) => {
    if (panelOpen) {
      // Solo el inventario y el teclado se cierran con Esc o I. Muerte y final no.
      const closable = panelOpen === inventoryRoot || panelOpen === keypadRoot;
      if (closable && (code === "Escape" || (code === "KeyI" && panelOpen === inventoryRoot))) closePanel();
      return;
    }
    if (!running) return;
    if (code === "KeyF" && !player.hidden) flashlight.toggle();
    if (code === "KeyE") {
      // Dentro de un escondite, E sirve para salir.
      if (player.hidden) player.unhide();
      else interactor.use();
    }
    if (code === "KeyI" && !player.hidden) openInventory();
  },
});

// ---------- Botones ----------

byId<HTMLButtonElement>("new-btn").addEventListener("click", () => startGame(true));
byId<HTMLButtonElement>("continue-btn").addEventListener("click", () => startGame(false));
byId<HTMLButtonElement>("menu-settings-btn").addEventListener("click", () => showSettings(showMenu));
byId<HTMLButtonElement>("menu-endings-btn").addEventListener("click", () => showEndings());

byId<HTMLButtonElement>("resume-btn").addEventListener("click", () => {
  pauseRoot.hidden = true;
  running = true;
  sfx.resume();
  input.requestLock();
});
byId<HTMLButtonElement>("save-btn").addEventListener("click", () => {
  saveGame();
  notify("Partida guardada.");
});
byId<HTMLButtonElement>("pause-settings-btn").addEventListener("click", () =>
  showSettings(() => showPause()),
);
byId<HTMLButtonElement>("pause-menu-btn").addEventListener("click", () => showMenu());

byId<HTMLButtonElement>("settings-back").addEventListener("click", () => settingsBack());
byId<HTMLButtonElement>("endings-back").addEventListener("click", () => showMenu());

byId<HTMLButtonElement>("death-retry").addEventListener("click", () => {
  player.resetTo(0, 3);
  closePanel();
  notify("Vuelves a la entrada.");
});
byId<HTMLButtonElement>("death-menu").addEventListener("click", () => showMenu());
byId<HTMLButtonElement>("ending-menu").addEventListener("click", () => showMenu());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Bucle ----------

const EXIT_Z = 6.2;
let ended = false;

function checkExit(): void {
  if (ended || player.position.z < EXIT_Z) return;
  ended = true;
  const kind = decideEnding(
    { admision: inventory.has("doc_admision"), guardia: inventory.has("doc_guardia") },
    hasFlag("computerRead"),
  );
  showEnding(kind);
}

const clock = new THREE.Clock();
let stepTimer = 0;

function settingsReduceMotion(): boolean {
  return currentSettings.reduceMotion;
}

function frame(): void {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (running) {
    player.update(dt, input);
    sfx.setListener(player.position.x, player.position.z, player.facing);
    if (player.moving && !player.hidden) {
      stepTimer += dt;
      const interval = player.sprinting ? 0.32 : player.crouching ? 0.7 : 0.5;
      if (stepTimer > interval) {
        stepTimer = 0;
        sfx.step(player.sprinting, player.crouching);
      }
    } else {
      stepTimer = 0;
    }
    if (player.hidden) {
      // Dentro del escondite la linterna se apaga: la luz delataría al jugador.
      flashlight.on = false;
      promptEl.textContent = "Pulsa E para salir del escondite";
      promptEl.hidden = false;
    } else {
      interactor.update(camera);
    }
    flashlight.update(dt, t);

    footstepTimer = player.sprinting ? footstepTimer + dt : 0;
    if (footstepTimer > 0.6) {
      footstepTimer = 0;
      noiseBus.emit(player.position.x, player.position.z, 10);
    }

    watcher.update(dt, t);
    checkExit();

    // Sacudida de cámara cuando te persigue de cerca
    if (watcher.state === "chase" && !player.hidden) {
      const d = Math.hypot(watcher.x - player.position.x, watcher.z - player.position.z);
      if (d < 6 && !settingsReduceMotion()) {
        const amp = 0.02 * (1 - d / 6);
        camera.position.x += (Math.random() - 0.5) * amp;
        camera.position.y += (Math.random() - 0.5) * amp;
      }
    }
  }

  // Tensión: el monstruo cerca o persiguiendo sube la música y el latido.
  const dWatch = Math.hypot(watcher.x - player.position.x, watcher.z - player.position.z);
  const tension =
    watcher.state === "chase"
      ? 1
      : watcher.state === "investigate"
        ? 0.5
        : watcher.state === "search"
          ? 0.4
          : Math.max(0, Math.min(0.3, 1 - dWatch / 15));
  sfx.update(dt, {
    zone: zoneAt(player.position.x, player.position.z, player.hidden),
    tension,
    sprinting: player.sprinting,
    hidden: player.hidden,
  });
  document.body.classList.toggle("tense", tension > 0.6 && !settingsReduceMotion());

  for (const item of interactables) item.update?.(dt);
  world.update(t);

  const width = `${Math.round(flashlight.battery)}%`;
  if (batteryFill.style.width !== width) batteryFill.style.width = width;
  batteryFill.classList.toggle("low", flashlight.isLow);

  renderer.render(scene, camera);
}

// Modo de pruebas: ?debug expone el estado y atajos para probar sin recorrer todo el mapa.
if (new URLSearchParams(location.search).has("debug")) {
  const dbg = {
    state: () => ({
      started,
      running,
      panel: panelOpen?.id ?? null,
      x: player.position.x,
      z: player.position.z,
      hidden: player.hidden,
      battery: flashlight.battery,
      flashlightOn: flashlight.on,
      powered: world.isPowered(),
      fuse: world.hasFuse(),
      watcher: watcher.state,
      items: inventory.list().map((e) => `${e.id}x${e.count}`),
      message: messageEl.hidden ? null : messageEl.textContent,
      ending: !endingRoot.hidden,
    }),
    teleport: (x: number, z: number) => player.resetTo(x, z),
    look: (yaw: number, pitch: number) => player.setLook(yaw, pitch),
    give: (id: string) => inventory.add(id),
    newGame: () => startGame(true),
  };
  (window as unknown as { __shadows: typeof dbg }).__shadows = dbg;
}

showMenu();
frame();
