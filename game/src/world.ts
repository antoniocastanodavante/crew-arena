import * as THREE from "three";

/** Caja en planta (XZ) contra la que choca el jugador. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Puerta cerrada: el monstruo puede atravesarla abriéndola. */
  door?: boolean;
}

export interface World {
  rects: Rect[];
  /** Material de la pantalla del ordenador del despacho. */
  computerScreen: THREE.MeshStandardMaterial;
  update(t: number): void;
  isPowered(): boolean;
  setPower(on: boolean): void;
}

interface Flicker {
  light: THREE.PointLight;
  material: THREE.MeshStandardMaterial;
  base: number;
  phase: number;
  broken: boolean;
  nextDip: number;
  dimUntil: number;
}

const CEIL_H = 3.2;
const WALL_T = 0.2;

/** Textura procedural con manchas, para no usar imágenes externas. */
function noiseTexture(base: string, speck: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No se pudo crear el contexto 2D");

  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    g.globalAlpha = Math.random() * 0.4;
    g.fillStyle = speck;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Divide [lo, hi] en tramos sólidos, dejando libres los huecos (puertas). */
function runs(lo: number, hi: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = lo;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cursor) out.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < hi) out.push([cursor, hi]);
  return out;
}

export function createWorld(scene: THREE.Scene): World {
  const rects: Rect[] = [];
  const flickers: Flicker[] = [];
  let powered = true;

  const floorTex = noiseTexture("#3b3a35", "#0c0c0a");
  floorTex.repeat.set(4, 6);
  const wallTex = noiseTexture("#5d5c54", "#1d1c18");
  wallTex.repeat.set(2, 1);

  const m = {
    wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: "#3a3c39", roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: "#8c949a", metalness: 0.6, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: "#cfcfc9", roughness: 0.7 }),
    sheet: new THREE.MeshStandardMaterial({ color: "#8f9a92", roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: "#1c1d1f", roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: "#081018", emissive: "#1f4a5c", emissiveIntensity: 0.7 }),
    blood: new THREE.MeshStandardMaterial({ color: "#3a0b0b", roughness: 0.35 }),
    paper: new THREE.MeshStandardMaterial({ color: "#b9b6a8", roughness: 1, side: THREE.DoubleSide }),
  };

  /** Caja con la base en y0. Si solid, bloquea al jugador. */
  function box(
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    solid = true,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (solid) rects.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  function cylinder(x: number, y0: number, z: number, r: number, h: number, mat: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
    mesh.position.set(x, y0 + h / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
  }

  /** Mancha o papel plano sobre el suelo. */
  function flat(x: number, z: number, geo: THREE.BufferGeometry, mat: THREE.Material, rotZ = 0): void {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(-Math.PI / 2, 0, rotZ);
    mesh.position.set(x, 0.006, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /** Pared a lo largo del eje Z, en la coordenada x. */
  function wallAlongZ(x: number, zA: number, zB: number, gaps: [number, number][] = []): void {
    const lo = Math.min(zA, zB);
    const hi = Math.max(zA, zB);
    for (const [a, b] of runs(lo, hi, gaps)) {
      box(x, 0, (a + b) / 2, WALL_T, CEIL_H, b - a, m.wall);
    }
  }

  /** Pared a lo largo del eje X, en la coordenada z. */
  function wallAlongX(z: number, xA: number, xB: number, gaps: [number, number][] = []): void {
    const lo = Math.min(xA, xB);
    const hi = Math.max(xA, xB);
    for (const [a, b] of runs(lo, hi, gaps)) {
      box((a + b) / 2, 0, z, b - a, CEIL_H, WALL_T, m.wall);
    }
  }

  function gurney(x: number, z: number): void {
    box(x, 0, z, 0.6, 0.7, 1.8, m.metal);
    box(x, 0.7, z, 0.6, 0.1, 1.8, m.sheet, false);
    box(x, 0.8, z + 0.6, 0.4, 0.1, 0.35, m.white, false);
  }

  function wheelchair(x: number, z: number): void {
    box(x, 0.45, z, 0.5, 0.06, 0.5, m.metal);
    box(x, 0.5, z - 0.24, 0.5, 0.7, 0.05, m.metal, false);
    for (const wx of [x - 0.28, x + 0.28]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), m.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.2, z);
      scene.add(wheel);
    }
  }

  function hospitalBed(x: number, z: number): void {
    box(x, 0.3, z, 1.0, 0.3, 2.0, m.metal);
    box(x, 0.6, z, 0.9, 0.12, 1.9, m.sheet, false);
    box(x, 0.3, z - 1.05, 1.0, 0.8, 0.08, m.metal, false);
  }

  /** Lámpara con parpadeo opcional. Devuelve el material emisivo para el panel. */
  function lamp(x: number, y: number, z: number, base: number, broken: boolean): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: "#d9dcd6",
      emissive: "#fff0d2",
      emissiveIntensity: 1,
    });
    const light = new THREE.PointLight(0xffe0b0, base, 9, 2);
    light.position.set(x, y, z);
    scene.add(light);
    flickers.push({
      light,
      material,
      base,
      phase: Math.random() * 10,
      broken,
      nextDip: Math.random() * 4,
      dimUntil: 0,
    });
    return material;
  }

  function ceilingPanel(x: number, z: number, material: THREE.MeshStandardMaterial): void {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.4), material);
    panel.position.set(x, CEIL_H - 0.02, z);
    scene.add(panel);
  }

  // Suelo y techo
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 40), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -11);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(20, 40), m.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL_H, -11);
  scene.add(ceiling);

  // Pasillo principal: x entre -2 y 2, z entre 6 y -30.
  // Los huecos son las puertas de las habitaciones.
  // Huecos de 1,2 m: aquí van las puertas (ver interactables.ts).
  wallAlongZ(-2, 6, -30, [[-8.6, -7.4], [-17.6, -16.4]]);
  wallAlongZ(2, 6, -30, [[-12.6, -11.4], [-24.6, -23.4]]);
  wallAlongX(6, -2, 2);
  wallAlongX(-30, -2, 2);

  // Habitación A (izquierda, paciente)
  wallAlongX(-5, -8, -2);
  wallAlongX(-11, -8, -2);
  wallAlongZ(-8, -5, -11);

  // Habitación B (izquierda, dos camas)
  wallAlongX(-14, -9, -2);
  wallAlongX(-20, -9, -2);
  wallAlongZ(-9, -14, -20);

  // Habitación C (derecha, despacho con ordenador)
  wallAlongX(-9, 2, 9);
  wallAlongX(-15, 2, 9);
  wallAlongZ(9, -9, -15);

  // Quirófano (derecha, fondo)
  wallAlongX(-22, 2, 8);
  wallAlongX(-28, 2, 8);
  wallAlongZ(8, -22, -28);

  // Props del pasillo
  gurney(1.1, 3);
  wheelchair(-1.2, -1.5);
  box(-1.7, 0, -2.5, 0.4, 1.9, 1.2, m.metal);
  box(1.4, 0, -4, 0.5, 0.9, 0.8, m.metal);
  box(1.4, 0.9, -4, 0.55, 0.04, 0.85, m.metal, false);
  flat(-0.4, -3.6, new THREE.PlaneGeometry(0.22, 0.3), m.paper, 0.4);
  flat(0.6, -8.2, new THREE.PlaneGeometry(0.22, 0.3), m.paper, -0.7);
  flat(-0.9, -19.4, new THREE.CircleGeometry(0.5, 18), m.blood);

  // Habitación A
  hospitalBed(-5.2, -8);
  box(-7.6, 0, -10.3, 0.6, 1.6, 1.0, m.metal);
  cylinder(-6.5, 0, -6.5, 0.02, 1.8, m.metal);
  flat(-4.2, -9.8, new THREE.CircleGeometry(0.5, 18), m.blood);

  // Habitación B
  hospitalBed(-7.8, -15.5);
  hospitalBed(-4.5, -18.3);
  box(-5.8, 0, -16.8, 0.45, 0.5, 0.45, m.wood);
  flat(-6.4, -19.2, new THREE.PlaneGeometry(0.22, 0.3), m.paper, 1.1);

  // Habitación C (escritorio con ordenador antiguo)
  box(6.5, 0, -12.5, 1.4, 0.75, 0.7, m.wood);
  box(6.5, 0.75, -12.9, 0.5, 0.4, 0.05, m.dark, false);
  box(6.5, 0.8, -12.87, 0.44, 0.32, 0.01, m.screen, false);
  box(7.6, 0, -13.8, 0.3, 0.5, 0.6, m.dark);
  box(6.5, 0, -11.1, 0.45, 0.42, 0.45, m.dark);
  box(8.65, 0, -10, 0.3, 2.0, 2.5, m.metal);

  // Quirófano: mesa de operaciones y lámpara quirúrgica
  box(5, 0.85, -25, 0.7, 0.06, 1.8, m.metal);
  cylinder(5, 0, -25, 0.2, 0.85, m.metal);
  flat(5.2, -25.3, new THREE.CircleGeometry(0.4, 18), m.blood);
  cylinder(5, 0, -22.8, 0.03, 2.3, m.metal);
  const surgeryLampMat = lamp(5, 2.1, -22.8, 14, true);
  box(5, 2.25, -22.8, 0.5, 0.12, 0.5, surgeryLampMat, false);

  // Luces del techo
  for (const z of [4, -1, -6, -11, -16, -21, -26]) {
    ceilingPanel(0, z, lamp(0, CEIL_H - 0.35, z, 18, z === -6 || z === -21));
  }
  ceilingPanel(-5, -8, lamp(-5, CEIL_H - 0.35, -8, 14, false));
  ceilingPanel(-5.5, -17, lamp(-5.5, CEIL_H - 0.35, -17, 14, true));
  ceilingPanel(5.5, -12, lamp(5.5, CEIL_H - 0.35, -12, 14, false));

  // Luz roja de emergencia en el pasillo
  const redLight = new THREE.PointLight(0xff2a1a, 2, 7, 2);
  redLight.position.set(0, 2.85, -15);
  scene.add(redLight);
  box(0, CEIL_H - 0.12, -15, 0.3, 0.1, 0.15,
    new THREE.MeshStandardMaterial({ color: "#400", emissive: "#ff2a1a", emissiveIntensity: 1 }), false);

  // Luz ambiental muy tenue
  scene.add(new THREE.AmbientLight(0x1b2024, 0.35));

  // Polvo flotando en el aire del pasillo
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 350;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 4;
    dustPos[i * 3 + 1] = Math.random() * 3;
    dustPos[i * 3 + 2] = 6 - Math.random() * 36;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xb8b4a6, size: 0.025, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  scene.add(dust);

  return {
    rects,
    computerScreen: m.screen,
    isPowered: () => powered,
    setPower(on: boolean): void {
      powered = on;
    },
    update(t: number): void {
      const p = powered ? 1 : 0;
      for (const f of flickers) {
        let k = 1 + 0.03 * Math.sin(t * 9 + f.phase);
        if (f.broken) {
          if (t >= f.nextDip) {
            f.dimUntil = t + 0.05 + Math.random() * 0.12;
            f.nextDip = t + 1.5 + Math.random() * 5;
          }
          if (t < f.dimUntil) k = 0.05;
        }
        f.light.intensity = f.base * k * p;
        f.material.emissiveIntensity = k * p;
      }
      redLight.intensity = 1.6 + Math.sin(t * 2.2) * 1.0;
      dust.position.y = Math.sin(t * 0.1) * 0.05;
    },
  };
}
