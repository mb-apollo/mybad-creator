// Armes tenues en main : placement dans la main droite d'après les repères du modèle d'arme (Root = poignée,
// Left_Hand_Target = prise de la main gauche), et main gauche ramenée sur l'arme par cinématique inverse.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { worldPos, worldQuat, reachArm, orientHand } from './pose3d.js';

const RAD = Math.PI / 180, METERS_TALL = 1.75;
const CACHE = new Map(); // clé (calque + personnage + arme) -> instance clonée de l'arme

export function weaponInstance(cacheKey, gltf) {
  let w = CACHE.get(cacheKey);
  if (w) return w;
  const root = cloneSkinned(gltf.scene);
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  root.updateMatrixWorld(true);
  const find = re => { let f = null; root.traverse(o => { if (!f && re.test(o.name)) f = o; }); return f; };
  const inv = root.matrixWorld.clone().invert();
  const at = o => (o ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv) : new THREE.Vector3());
  const holder = new THREE.Group(); holder.add(root);
  w = { holder, root, grip: at(find(/^Root_\d+$/)), leftBone: find(/^Left_Hand_Target_\d+$/), muzzle: at(find(/^MuzzlePoint_\d+$/)) };
  CACHE.set(cacheKey, w);
  return w;
}

// Place l'arme dans la main : son avant (−X) suit les doigts, son haut (+Y) le côté de l'index.
// def : { scale, x, y, z (décalage en mètres), rx, ry, rz (degrés) }
export function placeWeapon(inst, def, w) {
  const rig = inst.root.userData.rig, side = def.hand === 'L' ? 'L' : 'R';
  const hand = rig?.['hand' + side], F = rig?.handFrame?.[side], mid = rig?.finger?.[side]?.Middle?.[0];
  if (!hand || !F) return false;
  // les os n'ont pas toujours la même unité que le modèle (exports Sketchfab) : on corrige par l'échelle de la main
  hand.updateWorldMatrix(true, false);
  const hs = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).x / (inst.pivot.scale.x || 1);
  const upm = (1 / inst.baseScale) / METERS_TALL / hs, k = upm * (def.scale || 1);
  const X = F.d.clone().negate(), Y = F.a.clone().addScaledVector(F.d, -F.a.dot(F.d)).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)));
  q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((def.rx || 0) * RAD, (def.ry || 0) * RAD, (def.rz || 0) * RAD, 'YXZ')));
  const palm = mid ? mid.position.clone().multiplyScalar(0.55) : new THREE.Vector3();
  const off = new THREE.Vector3(def.x || 0, def.y || 0, def.z || 0).multiplyScalar(upm);
  w.holder.quaternion.copy(q);
  w.holder.scale.setScalar(k);
  w.holder.position.copy(palm).sub(w.grip.clone().multiplyScalar(k).applyQuaternion(q)).add(off.applyQuaternion(q));
  if (w.holder.parent !== hand) hand.add(w.holder);
  hand.updateWorldMatrix(true, true);
  return true;
}

// Main gauche sur la prise de l'arme (garde-main d'un fusil, soutien d'un pistolet).
export function gripWithLeftHand(inst, w, kind) {
  const rig = inst.root.userData.rig;
  if (!rig || !w.leftBone || !rig.upperL || !rig.handL) return;
  const target = worldPos(w.leftBone);
  const qw = worldQuat(w.holder);
  const fwd = new THREE.Vector3(-1, 0, 0).applyQuaternion(qw), up = new THREE.Vector3(0, 1, 0).applyQuaternion(qw);
  const right = new THREE.Vector3().crossVectors(fwd, up);
  const pole = new THREE.Vector3(0, -0.8, 0).addScaledVector(right, -0.6).addScaledVector(fwd, -0.15); // coude vers le bas et l'extérieur
  reachArm(rig, 'L', target, pole);
  orientHand(rig, 'L', fwd, kind === 'rifle' ? up : right);
  rig.handL.updateWorldMatrix(true, true);
}
