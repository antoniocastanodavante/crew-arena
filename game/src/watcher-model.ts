import * as THREE from "three";

/** Articulaciones del fantasma. Cada grupo rota alrededor de su articulación. */
export interface WatcherRig {
  root: THREE.Group;
  /** Base del cuerpo: el vestido se balancea desde aquí. */
  hips: THREE.Group;
  /** Hombros. Se inclina al abalanzarse. */
  torso: THREE.Group;
  /** Cabeza con el pelo largo. */
  head: THREE.Group;
  /** Pelo de la espalda: se mece. */
  hair: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Restos del vestido a cada lado: no tiene piernas, flota. */
  legL: THREE.Group;
  legR: THREE.Group;
  /** Material de los ojos: parpadea durante la aparición. */
  eyes: THREE.MeshStandardMaterial;
  /** Luz pálida propia: solo se enciende cuando es visible, para que se vea bien. */
  glow: THREE.PointLight;
}

/**
 * El fantasma de película de terror: figura pálida y alta, vestido blanco roto
 * que flota, pelo negro y largo que le tapa la cara y brazos largos con dedos finos.
 * Mira hacia +Z en su sistema local (la rotación Y la orienta).
 */
export function createWatcherModel(): WatcherRig {
  const root = new THREE.Group();

  const dress = new THREE.MeshStandardMaterial({
    color: "#b9bdc9",
    roughness: 0.95,
    emissive: "#1a1f2b",
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.93,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: "#cfd3dd",
    roughness: 0.8,
    emissive: "#2a2f3a",
    emissiveIntensity: 0.35,
  });
  const hairMat = new THREE.MeshStandardMaterial({ color: "#07080a", roughness: 0.9 });
  const socketMat = new THREE.MeshStandardMaterial({ color: "#000000", roughness: 1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#cfe7ff", emissiveIntensity: 2 });

  const add = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Cuerpo: el vestido abierto por abajo, sin piernas
  const hips = new THREE.Group();
  root.add(hips);
  add(hips, new THREE.CylinderGeometry(0.16, 0.46, 1.3, 14, 1, true), dress, 0, 0.65, 0).castShadow = false;

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.1, 0.2, 0);
  legR.position.set(0.1, 0.2, 0);
  hips.add(legL, legR);

  // Hombros, cuello y cabeza
  const torso = new THREE.Group();
  torso.position.set(0, 1.3, 0);
  torso.rotation.x = -0.12;
  hips.add(torso);
  add(torso, new THREE.CylinderGeometry(0.045, 0.05, 0.18, 10), skin, 0, 0.09, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.22, 0);
  torso.add(head);
  add(head, new THREE.SphereGeometry(0.14, 18, 14), skin, 0, 0.13, 0).scale.set(0.9, 1.1, 0.95);

  // Ojos: se ven bajo el pelo, que tapa la frente
  for (const sx of [-0.05, 0.05]) {
    add(head, new THREE.SphereGeometry(0.04, 8, 6), socketMat, sx, 0.11, 0.11);
    add(head, new THREE.SphereGeometry(0.018, 8, 6), eyeMat, sx, 0.11, 0.135);
  }

  // Flequillo que cae sobre la cara
  add(head, new THREE.BoxGeometry(0.24, 0.2, 0.05), hairMat, 0, 0.25, 0.12);
  // Pelo de la coronilla y los lados
  add(head, new THREE.SphereGeometry(0.165, 16, 12), hairMat, 0, 0.16, -0.02).scale.set(1.0, 1.0, 1.05);

  // Pelo largo de la espalda, que se mece
  const hair = new THREE.Group();
  hair.position.set(0, 0, -0.08);
  head.add(hair);
  add(hair, new THREE.CylinderGeometry(0.2, 0.09, 1.0, 12), hairMat, 0, -0.45, 0);

  // Brazos largos con dedos finos
  const makeArm = (x: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, 1.22, 0);
    torso.add(g);
    add(g, new THREE.BoxGeometry(0.07, 0.75, 0.07), skin, 0, -0.37, 0);
    add(g, new THREE.BoxGeometry(0.06, 0.4, 0.06), skin, 0, -0.95, 0);
    for (const fx of [-0.03, 0, 0.03]) {
      add(g, new THREE.BoxGeometry(0.02, 0.22, 0.02), skin, fx, -1.2, 0);
    }
    return g;
  };
  const armL = makeArm(-0.2);
  const armR = makeArm(0.2);

  // Luz pálida propia. Apagada hasta que el fantasma aparece.
  const glow = new THREE.PointLight(0xc8e0ff, 0, 4, 2);
  glow.position.set(0, 1.4, 0.6);
  root.add(glow);

  return { root, hips, torso, head, hair, armL, armR, legL, legR, eyes: eyeMat, glow };
}
