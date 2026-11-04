import * as THREE from "three";
import { createWorld } from "./world";
import { Player } from "./player";
import { Flashlight } from "./flashlight";
import { Input } from "./input";
import { Interactor } from "./interact";
import { createInteractables } from "./interactables";

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

let started = false;
let running = false;

let messageTimer = 0;
function notify(text: string): void {
  messageEl.textContent = text;
  messageEl.hidden = false;
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => {
    messageEl.hidden = true;
  }, 3500);
}

const interactables = createInteractables({
  scene,
  rects: world.rects,
  world,
  playerPos: player.position,
});
const interactor = new Interactor(interactables, {
  onPrompt: (text) => {
    promptEl.textContent = text ?? "";
    promptEl.hidden = text === null;
  },
  onMessage: notify,
});

// Esc libera el puntero en el navegador; eso dispara onLockChange(false) y abre la pausa.
const input = new Input(canvas, {
  onLockChange: (locked) => {
    if (!started) return;
    running = locked;
    pauseScreen.hidden = locked;
  },
  onAction: (code) => {
    if (!running) return;
    if (code === "KeyF") flashlight.toggle();
    if (code === "KeyE") interactor.use();
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
    flashlight.update(dt, t);
    interactor.update(camera);
  }
  for (const item of interactables) item.update?.(dt);
  world.update(t);

  batteryFill.style.width = `${flashlight.battery}%`;
  batteryFill.classList.toggle("low", flashlight.isLow);

  renderer.render(scene, camera);
}

frame();
