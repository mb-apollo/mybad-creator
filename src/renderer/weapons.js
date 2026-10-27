// Armes tenues en main : placement dans la main droite d'après les repères du modèle d'arme (Root = poignée,
// Left_Hand_Target = prise de la main gauche), main gauche ramenée sur l'arme par cinématique inverse, et doigts
// pliés jusqu'à toucher la surface de l'arme.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WEAPONS } from './engine/games.js';
import { FINGERS, worldPos, worldQuat, reachArm, orientHand, setFingerCurl, facingOf, lateral } from './pose3d.js';

const RAD = Math.PI / 180, METERS_TALL = 1.75;
const CACHE = new Map(); // clé (calque + personnage + arme) -> instance clonée de l'arme

// Centre de la poignée par rapport au repère « Root » de l'arme (unités du modèle d'arme) : c'est là que se pose la paume.
export const HOLD = { x: 0.01, y: -0.05 };
// Distance (mètres) entre l'axe de la main et le centre de la poignée : épaisseur de paume + rayon de la poignée.
const PALM_GAP = 0.027;
// La poignée est tenue un peu devant le milieu de la paume (les doigts s'enroulent autour, paume contre l'arrière de la poignée).
const PALM_FWD = 0.02;
// Poignée = cylindre incliné vers l'arrière (axe vers le bas), rayon en unités du modèle d'arme.
export const HANDLE = { dir: new THREE.Vector3(0.3, -1, 0).normalize(), r: 0.028 };
export const weaponKind = key => WEAPONS.find(w => w.key === key)?.kind || 'rifle';

export function weaponInstance(cacheKey, gltf) {
  let w = CACHE.get(cacheKey);
  if (w) return w;
  const root = cloneSkinned(gltf.scene);
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  root.updateMatrixWorld(true);
  const find = re => { let f = null; root.traverse(o => { if (!f && re.test(o.name)) f = o; }); return f; };
  const inv = root.matrixWorld.clone().invert();
  const at = o => (o ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv) : new THREE.Vector3());
  // longueur réelle du modèle et échantillon de points de sa surface (pour que les doigts s'y posent)
  const box = new THREE.Box3(), pts = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox);
    const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 2200));
    for (let i = 0; i < p.count; i += step) pts.push(p.getX(i), p.getY(i), p.getZ(i));
  });
  const holder = new THREE.Group(); holder.add(root);
  const leftBone = find(/^Left_Hand_Target_\d+$/);
  w = { holder, root, grip: at(find(/^Root_\d+$/)), leftBone, left: at(leftBone), muzzle: at(find(/^MuzzlePoint_\d+$/)), length: Math.max(0.01, box.max.x - box.min.x), points: new Float32Array(pts) };
  CACHE.set(cacheKey, w);
  return w;
}

// Fusil placé par rapport au corps : la main droite rejoint le point voulu et prend la direction de l'arme.
// aim : x avant, y haut (depuis l'épaule droite), z vers la droite, en hauteurs de personnage ; pitch (canon vers le bas) et yaw (vers la gauche), en degrés.
export function aimHand(inst, a) {
  const rig = inst.root.userData.rig, f = facingOf(inst.root);
  if (!rig?.upperR || !rig.upperL || !rig.handR || !f) return;
  inst.root.updateMatrixWorld(true);
  const lat = lateral(rig.upperL, rig.upperR), UPV = new THREE.Vector3(0, 1, 0), H = inst.pivot.scale.x / inst.baseScale;
  const target = worldPos(rig.upperR).addScaledVector(f, (a.x || 0) * H).addScaledVector(UPV, (a.y || 0) * H).addScaledVector(lat, -(a.z || 0) * H);
  const yaw = (a.yaw || 0) * RAD, pitch = (a.pitch || 0) * RAD;
  const dir = f.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(lat, Math.sin(yaw)).multiplyScalar(Math.cos(pitch)).addScaledVector(UPV, -Math.sin(pitch));
  reachArm(rig, 'R', target, new THREE.Vector3(0, -1, 0).addScaledVector(lat, 0.5));
  orientHand(rig, 'R', dir, lat);
  rig.handR.updateWorldMatrix(true, true);
}

// Place l'arme dans la main : son avant (−X) suit les doigts, son haut (+Y) le côté de l'index.
// def : { key, scale, x, y, z (décalage en mètres), rx, ry, rz (degrés) }. Renvoie l'échelle utile pour les doigts.
export function placeWeapon(inst, def, w) {
  const rig = inst.root.userData.rig, side = def.hand === 'L' ? 'L' : 'R';
  const hand = rig?.['hand' + side], F = rig?.handFrame?.[side], mid = rig?.finger?.[side]?.Middle?.[0];
  if (!hand || !F) return null;
  // les os n'ont pas toujours la même unité que le modèle (exports Sketchfab) : on corrige par l'échelle de la main
  hand.updateWorldMatrix(true, false);
  const hs = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).x / (inst.pivot.scale.x || 1);
  const heightLocal = (1 / inst.baseScale) / hs;           // hauteur de l'agent, dans l'unité des os de la main
  const upm = heightLocal / METERS_TALL;                    // unités de la main par mètre « réel »
  const kind = weaponKind(def.key), frac = WEAPONS.find(x => x.key === def.key)?.frac || 0.4;
  const k = (frac * heightLocal / w.length) * (def.scale || 1);   // taille d'après les proportions du jeu
  const X = F.d.clone().negate(), Y = F.a.clone().addScaledVector(F.d, -F.a.dot(F.d)).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)));
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((def.rx || 0) * RAD, (def.ry || 0) * RAD, (def.rz || 0) * RAD, 'YXZ')));
  const palm = mid ? mid.position.clone().multiplyScalar(0.55) : new THREE.Vector3();
  const anchor = w.grip.clone().add(new THREE.Vector3(HOLD.x, HOLD.y, 0));
  const off = new THREE.Vector3((def.x || 0) - PALM_FWD, def.y || 0, (def.z || 0) + PALM_GAP).multiplyScalar(upm);
  w.holder.quaternion.copy(q);
  w.holder.scale.setScalar(k);
  w.holder.position.copy(palm).sub(anchor.multiplyScalar(k).applyQuaternion(q)).add(off.applyQuaternion(q));
  if (w.holder.parent !== hand) hand.add(w.holder);
  hand.updateWorldMatrix(true, true);
  return { k, upm, kind };
}

// Main gauche sur la prise de l'arme : fusil = paume sous le garde-main, doigts qui l'enveloppent par le côté ; pistolet = paume contre le côté de la crosse.
// La cible est le point d'appui de la PAUME : le poignet se place en retrait de la longueur de la paume.
export function gripWithLeftHand(inst, w, kind) {
  const rig = inst.root.userData.rig;
  const mid = rig?.finger?.L?.Middle?.[0];
  if (!rig || !w.leftBone || !rig.upperL || !rig.handL || !mid) return;
  const qw = worldQuat(w.holder);
  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(qw), up = new THREE.Vector3(0, 1, 0).applyQuaternion(qw);
  const right = new THREE.Vector3().crossVectors(fwd, up);
  const target = worldPos(w.leftBone);
  const dWant = kind === 'rifle' ? right.clone().addScaledVector(fwd, 0.25) : fwd.clone().addScaledVector(up, -0.35);
  const nWant = kind === 'rifle' ? up : right;
  const pole = new THREE.Vector3(0, -0.8, 0).addScaledVector(right, -0.6).addScaledVector(fwd, -0.15); // coude vers le bas et l'extérieur
  orientHand(rig, 'L', dWant, nWant);
  const palm = worldPos(mid).sub(worldPos(rig.handL)).multiplyScalar(0.55);   // du poignet au centre de la paume
  reachArm(rig, 'L', target.clone().sub(palm), pole);
  orientHand(rig, 'L', dWant, nWant);
  rig.handL.updateWorldMatrix(true, true);
}

// Chaque doigt se plie jusqu'à toucher la surface de l'arme (sans la traverser) ; sinon il garde sa flexion de départ.
export function wrapFingers(inst, w, side, geo, fallback, minCurl = 0, center = null, radius = 0.12, handle = null) {
  const rig = inst.root.userData.rig;
  if (!rig?.finger || !w.points.length) return;
  w.holder.updateWorldMatrix(true, true);
  const inv = w.holder.matrixWorld.clone().invert(), n0 = w.points.length / 3;
  let P = w.points;
  if (center) { // seuls les points proches de la zone saisie comptent (pas la culasse ni le canon)
    const sub = [], r2 = radius * radius;
    for (let i = 0; i < n0; i++) { const dx = P[i * 3] - center.x, dy = P[i * 3 + 1] - center.y, dz = P[i * 3 + 2] - center.z; if (dx * dx + dy * dy + dz * dz <= r2) sub.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
    if (sub.length > 30) P = new Float32Array(sub);
  }
  const n = P.length / 3;
  const rW = 0.0095 * geo.upm / geo.k;                       // rayon d'un doigt, dans l'unité de l'arme
  const v = new THREE.Vector3();
  const near = p => {
    v.copy(p).applyMatrix4(inv);
    if (handle) { const t = v.clone().sub(new THREE.Vector3(center.x, center.y, center.z)); t.addScaledVector(HANDLE.dir, -t.dot(HANDLE.dir)); return Math.max(0, t.length() - HANDLE.r); } // distance à la surface du cylindre
    let best = Infinity;
    for (let i = 0; i < n; i++) { const dx = P[i * 3] - v.x, dy = P[i * 3 + 1] - v.y, dz = P[i * 3 + 2] - v.z, d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; }
    return Math.sqrt(best);
  };
  for (const f of FINGERS) {
    const b = rig.finger[side][f]; if (!b[0] || !b[1] || !b[2]) continue;
    let chosen = null;
    for (let c = f === 'Thumb' ? 0 : minCurl; c <= 100; c += 5) {
      setFingerCurl(rig, side, f, c);
      const p1 = worldPos(b[1]), p2 = worldPos(b[2]), p0 = worldPos(b[0]);
      const tip = p2.clone().addScaledVector(p2.clone().sub(p1), 0.85);
      const mid = p2.clone().lerp(tip, 0.5);
      if (Math.min(near(tip), near(mid), near(p2)) <= rW * 1.05) { chosen = c; break; }
    }
    setFingerCurl(rig, side, f, chosen ?? Math.max(minCurl, fallback[f] ?? 40));
  }
}
