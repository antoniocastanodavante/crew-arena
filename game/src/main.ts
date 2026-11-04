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

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("game");
const hud = byId<HTMLDivElement>("hud");
const batteryFill = byId<HTMLDivElement>("battery-fill");
const startScreen = byId<HTMLDivElement>("start-screen");
const pauseScreen = byId<HTMLDivElement>("pause-screen");
const startBtn = byId<HTMLButtonElement>("start-btn");
const resumeBtn = byId<HTMLButtonElement>("resume-btn");
const promptEl = byId<HTMLDivElement>("prompt");
const messageEl = byId<HTMLDivElement>("message");
const inventoryRoot = byId<HTMLDivElement>("inventory");
const keypadRoot = byId<HTMLDivElement>("keypad");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

let started = false;
let running = false;
/** Panel a pantalla completa abierto (inventario o teclado). Mientras hay uno, el mundo está parado. */
let panelOpen: HTMLElement | null = null;

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
    player.resetTo(0, 3);
    notify("Te ha atrapado. Vuelves a la entrada.");
  },
});
noiseBus.on((x, z, r) => watcher.hear(x, z, r));

// Correr hace ruido cada poco. El monstruo lo oye dentro de 10 m.
let footstepTimer = 0;
const interactor = new Interactor(interactables, {
  onPrompt: (text) => {
    promptEl.textContent = text ?? "";
    promptEl.hidden = text === null;
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

function openPanel(el: HTMLElement): void {
  panelOpen = el;
  running = false;
  promptEl.hidden = true;
  el.hidden = false;
  input.releaseLock();
}

function closePanel(): void {
  if (!panelOpen) return;
  panelOpen.hidden = true;
  panelOpen = null;
  running = true;
  input.requestLock();
}

function openInventory(): void {
  if (!started || !running || player.hidden) return;
  inventoryUI.reset();
  openPanel(inventoryRoot);
}

function openKeypad(): void {
  if (!started || !running) return;
  keypadUI.reset();
  openPanel(keypadRoot);
}

// Esc libera el puntero en el navegador; eso dispara onLockChange(false) y abre la pausa.
const input = new Input(canvas, {
  onLockChange: (locked) => {
    if (!started || panelOpen) return;
    running = locked;
    pauseScreen.hidden = locked;
  },
  onAction: (code) => {
    if (panelOpen) {
      if (code === "Escape" || (code === "KeyI" && panelOpen === inventoryRoot)) closePanel();
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

startBtn.addEventListener("click", () => {
  started = true;
  running = true;
  startScreen.hidden = true;
  hud.hidden = false;
  input.requestLock();
});

resumeBtn.addEventListener("click", () => input.requestLock());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function frame(): void {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (running) {
    player.update(dt, input);
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
  }
  for (const item of interactables) item.update?.(dt);
  world.update(t);

  batteryFill.style.width = `${flashlight.battery}%`;
  batteryFill.classList.toggle("low", flashlight.isLow);

  renderer.render(scene, camera);
}

frame();
