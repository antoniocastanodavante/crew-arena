import * as THREE from "three";

/** Articulaciones del monstruo. Cada grupo rota alrededor de su articulación. */
export interface WatcherRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Material de los ojos: se enciende y parpadea durante la aparición. */
  eyes: THREE.MeshStandardMaterial;
}

/**
 * THE WATCHER: figura alta y delgada, hecha con primitivas.
 * Mira hacia +Z en su sistema local (la rotación Y la orienta).
 */
export function createWatcherModel(): WatcherRig {
  const root = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: "#1b1e1d", roughness: 0.85, metalness: 0.05 });
  const cloth = new THREE.MeshStandardMaterial({ color: "#0d0e0f", roughness: 1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#dfeeff", emissiveIntensity: 2 });

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const hips = new THREE.Group();
  hips.position.y = 1.05;
  root.add(hips);

  const makeLeg = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    hips.add(g);
    add(g, new THREE.BoxGeometry(0.12, 1.05, 0.12), cloth, 0, -0.52, 0);
    return g;
  };
  const legL = makeLeg(-0.13);
  const legR = makeLeg(0.13);

  const torso = new THREE.Group();
  torso.rotation.x = -0.12;
  hips.add(torso);
  add(torso, new THREE.BoxGeometry(0.4, 1.1, 0.22), cloth, 0, 0.55, 0);

  const makeArm = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 1.0, 0);
    torso.add(g);
    add(g, new THREE.BoxGeometry(0.1, 1.2, 0.1), skin, 0, -0.6, 0);
    // Tres dedos largos al final del brazo
    for (const fx of [-0.035, 0, 0.035]) {
      add(g, new THREE.BoxGeometry(0.03, 0.24, 0.03), skin, fx, -1.32, 0);
    }
    return g;
  };
  const armL = makeArm(-0.26);
  const armR = makeArm(0.26);

  const neck = new THREE.Group();
  neck.position.y = 1.12;
  torso.add(neck);

  const head = new THREE.Group();
  neck.add(head);
  // Cráneo alargado, con cuencas oscuras y ojos que brillan desde dentro
  const skull = add(head, new THREE.SphereGeometry(0.19, 18, 14), skin, 0, 0.3, 0);
  skull.scale.set(0.74, 1.55, 0.84);
  const socketMat = new THREE.MeshStandardMaterial({ color: "#000000", roughness: 1 });
  for (const sx of [-0.068, 0.068]) {
    add(head, new THREE.SphereGeometry(0.05, 10, 8), socketMat, sx, 0.36, 0.13);
    add(head, new THREE.SphereGeometry(0.028, 8, 6), eyeMat, sx, 0.36, 0.165);
  }
  // Mandíbula caída, en negro
  add(head, new THREE.BoxGeometry(0.15, 0.05, 0.16), socketMat, 0, 0.06, 0.1).rotation.x = 0.35;

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });

  return { root, hips, torso, head, armL, armR, legL, legR, eyes: eyeMat };
}
