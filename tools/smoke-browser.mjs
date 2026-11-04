// Prueba de humo en un navegador Chromium headless (Edge por defecto) v�a CDP.
// Uso: npm run smoke   (variables opcionales: SHADOWS_URL, BROWSER_PATH)
// Requiere el modo ?debug del juego (expone window.__shadows).
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";

const CHROME = process.env.BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const SCRATCH = process.env.KIROCREW_SCRATCH ?? tmpdir();
const PROFILE = `${SCRATCH}\\smoke-profile`;
const URL = `${process.env.SHADOWS_URL ?? "https://antoniocastanodavante.github.io/crew-arena/"}?debug`;

const KEYS = {
  KeyW: 87, KeyS: 83, KeyA: 65, KeyD: 68, KeyF: 70, KeyE: 69, KeyI: 73,
  ShiftLeft: 16, ControlLeft: 17, Escape: 27,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = {};

const proc = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--window-size=1280,720",
  "about:blank",
], { stdio: "ignore" });

let version = null;
for (let i = 0; i < 40 && !version; i++) {
  try {
    version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  } catch {
    await sleep(500);
  }
}
if (!version) throw new Error("Edge no arrancó con depuración remota");

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push(`EXCEPCION: ${d.exception?.description ?? d.text}`);
  } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    errors.push(`CONSOLA ${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    errors.push(`LOG: ${msg.params.entry.text}`);
  }
};
await new Promise((r) => (ws.onopen = r));

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evalJS(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r.result.result.value;
}

async function frames(n = 3) {
  for (let i = 0; i < n; i++) await evalJS("new Promise(r => requestAnimationFrame(() => r(true)))");
}

async function key(code, down) {
  await send("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    code,
    key: code.replace("Key", "").replace("Left", ""),
    windowsVirtualKeyCode: KEYS[code],
  });
}

const check = (name, ok, detail = "") => {
  results[name] = { ok: Boolean(ok), detail };
  console.log(`${ok ? "OK  " : "FALLO"} ${name} ${detail}`);
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.navigate", { url: URL });
  // Espera a que el módulo del juego haya arrancado (el modo de pruebas es lo último que expone).
  for (let i = 0; i < 80; i++) {
    if ((await evalJS("Boolean(window.__shadows)")) === true) break;
    await sleep(500);
  }

  const s0 = await evalJS("window.__shadows ? window.__shadows.state() : null");
  check("carga el juego y el modo de pruebas", s0 && s0.started === false, JSON.stringify(s0));

  await evalJS("document.getElementById('new-btn').click()");
  await sleep(800);
  let s = await evalJS("__shadows.state()");
  check("nueva partida arranca", s.started && s.running, `panel=${s.panel}`);

  // Fotogramas por segundo en esta máquina (headless por software: será bajo)
  const fps = await evalJS(
    "new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); })",
  );
  check("fotogramas por segundo medidos", true, `${Number(fps).toFixed(1)} FPS (headless por software)`);

  // Caminar hacia delante (-Z)
  const z0 = s.z;
  await key("KeyW", true);
  await sleep(1000);
  await key("KeyW", false);
  s = await evalJS("__shadows.state()");
  const walked = z0 - s.z;
  check("W avanza", walked > 0.3, `recorrido ${walked.toFixed(2)} m`);

  // Correr: misma ventana de tiempo que andar, así que se compara la proporción
  const z1 = s.z;
  await key("ShiftLeft", true);
  await key("KeyW", true);
  await sleep(1000);
  await key("KeyW", false);
  await key("ShiftLeft", false);
  s = await evalJS("__shadows.state()");
  const ran = z1 - s.z;
  check("Shift corre más que andar", ran > walked * 1.4, `andar ${walked.toFixed(2)} m, correr ${ran.toFixed(2)} m`);

  // Linterna y batería
  await key("KeyF", true);
  await key("KeyF", false);
  await sleep(2000);
  s = await evalJS("__shadows.state()");
  check("F enciende la linterna y gasta batería", s.flashlightOn && s.battery < 100, `batería ${s.battery.toFixed(1)}`);
  await key("KeyF", true);
  await key("KeyF", false);

  // Caja de fusibles: sin fusible no hay corriente
  await evalJS("__shadows.give('fusible')");
  await evalJS("__shadows.teleport(-0.9, 0.3)");
  await evalJS("__shadows.look(Math.PI / 2, -0.6)");
  await frames(4);
  await key("KeyE", true);
  await key("KeyE", false);
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("el fusible enciende la corriente", s.powered && s.fuse, `mensaje: ${s.message}`);

  // Teclado del quirófano: ficha no tomada, código equivocado y luego el bueno
  await evalJS("__shadows.teleport(0.9, -22.9)");
  await evalJS("__shadows.look(-Math.PI / 2, -0.35)");
  await frames(4);
  await key("KeyE", true);
  await key("KeyE", false);
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("E abre el teclado", s.panel === "keypad", `panel=${s.panel}`);

  const press = (label) =>
    evalJS(`[...document.querySelectorAll('#keypad-pad button')].find(b => b.textContent === '${label}').click(), true`);
  for (const d of ["1", "2", "3", "4"]) await press(d);
  await press("OK");
  await sleep(200);
  s = await evalJS("__shadows.state()");
  check("código malo no abre", s.panel === "keypad", `mensaje: ${await evalJS("document.getElementById('keypad-feedback').textContent")}`);

  for (const d of ["C"]) await press(d);
  for (const d of ["0", "3", "1", "7"]) await press(d);
  await press("OK");
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("código bueno cierra el teclado y desbloquea", s.panel === null, `mensaje: ${s.message}`);

  // Puerta del quirófano: ya no debe pedir código
  await evalJS("__shadows.teleport(1.2, -24)");
  await evalJS("__shadows.look(-Math.PI / 2, 0)");
  await frames(4);
  await key("KeyE", true);
  await key("KeyE", false);
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("la puerta del quirófano se abre", !(s.message || "").includes("código"), `mensaje: ${s.message}`);

  // Armario del pasillo: entrar y salir del escondite
  await evalJS("__shadows.teleport(0.9, -19.5)");
  await evalJS("__shadows.look(-Math.PI / 2, 0)");
  await frames(4);
  await key("KeyE", true);
  await key("KeyE", false);
  await frames(6);
  s = await evalJS("__shadows.state()");
  check("E se esconde en el armario", s.hidden === true, `hidden=${s.hidden}`);
  await key("KeyE", true);
  await key("KeyE", false);
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("E vuelve a salir del armario", s.hidden === false, `hidden=${s.hidden}`);

  // Pantalla de muerte: volver a intentar devuelve al juego
  await evalJS("__shadows.die()");
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("pantalla de muerte aparece", s.panel === "death", `panel=${s.panel}`);
  await evalJS("document.getElementById('death-retry').click()");
  await frames(4);
  s = await evalJS("__shadows.state()");
  check("volver a intentar reanuda la partida", s.panel === null && s.running, `z=${s.z.toFixed(1)}`);

  // Salida sin las fichas: final malo
  await evalJS("__shadows.teleport(0, 6.5)");
  await frames(6);
  s = await evalJS("__shadows.state()");
  check("salir sin fichas da el final malo", s.ending, `final visible=${s.ending}`);
  const endings = await evalJS("localStorage.getItem('shadows.endings')");
  check("el final se guarda", (endings || "").includes("malo"), `endings=${endings}`);
} catch (err) {
  check("ejecución de la prueba", false, String(err));
} finally {
  console.log("\nErrores de consola/excepciones:", errors.length ? "" : "ninguno");
  for (const e of errors.slice(0, 30)) console.log(" -", e);
  ws.close();
  proc.kill();
  await sleep(1000);
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    // el perfil puede seguir bloqueado un instante; no es crítico
  }
  const failed = Object.values(results).filter((r) => !r.ok).length;
  console.log(`\nResultado: ${Object.keys(results).length - failed} OK, ${failed} fallos`);
  process.exit(0);
}
