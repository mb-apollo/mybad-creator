// Pose des modèles 3D : remet les bras le long du corps (modèles en T-pose ou A-pose),
// plie les coudes et oriente tête et buste, quel que soit le squelette (Valorant, Mixamo, générique).
import * as THREE from 'three';

const PAT = {
  upperL: [/^L_Shoulder$/i, /LeftArm(_\d+)?$/i, /^upperarm_l$/i, /left.?upper.?arm/i, /^L_?UpperArm/i, /^Arm\.L$/i],
  upperR: [/^R_Shoulder$/i, /RightArm(_\d+)?$/i, /^upperarm_r$/i, /right.?upper.?arm/i, /^R_?UpperArm/i, /^Arm\.R$/i],
  foreL: [/^L_Elbow$/i, /LeftForeArm(_\d+)?$/i, /^lowerarm_l$/i, /left.?(fore|lower).?arm/i, /^ForeArm\.L$/i],
  foreR: [/^R_Elbow$/i, /RightForeArm(_\d+)?$/i, /^lowerarm_r$/i, /right.?(fore|lower).?arm/i, /^ForeArm\.R$/i],
  handL: [/^L_Hand$/i, /LeftHand(_\d+)?$/i, /^hand_l$/i, /^Hand\.L$/i],
  handR: [/^R_Hand$/i, /RightHand(_\d+)?$/i, /^hand_r$/i, /^Hand\.R$/i],
  head: [/^Head$/i, /mixamorig.?Head(_\d+)?$/i, /^head$/i],
  chest: [/^Spine3$/i, /mixamorig.?Spine2(_\d+)?$/i, /^spine_03$/i],
  thighL: [/^L_Hip$/i, /LeftUpLeg(_\d+)?$/i, /^thigh_l$/i],
  footL: [/^L_Foot$/i, /LeftFoot(_\d+)?$/i, /^foot_l$/i],
  toeL: [/^L_Toe$/i, /LeftToeBase(_\d+)?$/i, /^ball_l$/i],
  thighR: [/^R_Hip$/i, /RightUpLeg(_\d+)?$/i, /^thigh_r$/i],
};
function findBone(root, list) {
  let found = null;
  for (const re of list) {
    root.traverse(o => { if (!found && (o.isBone || o.type === 'Bone' || o.isObject3D) && o.name && re.test(o.name.replace(/[:]/g, ':'))) found = o; });
    if (found) return found;
  }
  return null;
}

// Mémorise la pose d'origine (une fois par instance).
export function rigOf(root) {
  if (root.userData.rig !== undefined) return root.userData.rig;
  const rig = {};
  for (const k of Object.keys(PAT)) rig[k] = findBone(root, PAT[k]);
  if (!rig.upperL || !rig.upperR) { root.userData.rig = null; return null; }
  rig.rest = new Map();
  root.traverse(o => { if (o.isBone) rig.rest.set(o, o.quaternion.clone()); });
  root.userData.rig = rig;
  return rig;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function worldPos(o, out) { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); }
// Applique une rotation exprimée dans le repère du monde à un os.
function rotateWorld(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.updateWorldMatrix(true, false);
  const parentQ = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentQ);
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  _q.setFromAxisAngle(axis, angle);
  const newWorld = _q.multiply(worldQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateWorldMatrix(false, true);
}
// Angle du bras par rapport à l'horizontale (0 = T-pose, 90 = le long du corps)
function armDrop(upper, child) {
  const p = worldPos(upper, new THREE.Vector3()), c = worldPos(child, new THREE.Vector3());
  const d = c.sub(p).normalize();
  return Math.asin(Math.max(-1, Math.min(1, -d.y))) * 180 / Math.PI;
}

// Direction vers laquelle regarde le personnage (d'après pied → orteils), à plat.
export function facingOf(root) {
  const rig = rigOf(root);
  if (!rig || !rig.footL || !rig.toeL) return null;
  root.updateMatrixWorld(true);
  const f = worldPos(rig.footL, new THREE.Vector3()), t = worldPos(rig.toeL, new THREE.Vector3());
  const d = t.sub(f); d.y = 0;
  return d.lengthSq() > 1e-8 ? d.normalize() : null;
}

export function applyPose(root, P) {
  const rig = rigOf(root);
  if (!rig) return false;
  rig.rest.forEach((q, b) => b.quaternion.copy(q));
  root.updateMatrixWorld(true);
  if (!P || P.mode === 'file') return true;
  const forward = (P.forward || new THREE.Vector3(0, 0, 1)).clone();
  const up = new THREE.Vector3(0, 1, 0);
  const sides = [['L', 1], ['R', -1]];
  for (const [s] of sides) {
    const upper = rig['upper' + s], fore = rig['fore' + s], hand = rig['hand' + s];
    const tip = fore || hand; if (!upper || !tip) continue;
    // 1. bras : on abaisse jusqu'à l'angle voulu (mesuré depuis l'horizontale)
    const target = P.armsDown ?? 72;
    const cur = armDrop(upper, tip);
    const p = worldPos(upper, _a.clone()), c = worldPos(tip, _b.clone());
    const dir = c.sub(p).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, up.clone().negate()).normalize();
    if (axis.lengthSq() > 0.5) rotateWorld(upper, axis, (target - cur) * Math.PI / 180);
    // bras vers l'avant / l'arrière
    if (P.armsForward) {
      const p2 = worldPos(upper, new THREE.Vector3()), c2 = worldPos(tip, new THREE.Vector3());
      const d2 = c2.sub(p2).normalize();
      const ax2 = new THREE.Vector3().crossVectors(d2, forward).normalize();
      rotateWorld(upper, ax2, (P.armsForward || 0) * Math.PI / 180);
    }
    // 2. coude : plie l'avant-bras vers l'avant du personnage
    if (fore && hand && P.elbows) {
      const e = worldPos(fore, new THREE.Vector3()), h = worldPos(hand, new THREE.Vector3());
      const fd = h.sub(e).normalize();
      const ax = new THREE.Vector3().crossVectors(fd, forward).normalize();
      // le signe est choisi pour que la main parte vers l'avant (z+)
      const before = worldPos(hand, new THREE.Vector3()).dot(forward);
      rotateWorld(fore, ax, P.elbows * Math.PI / 180);
      const after = worldPos(hand, new THREE.Vector3()).dot(forward);
      if (after < before) { rotateWorld(fore, ax, -2 * P.elbows * Math.PI / 180); }
    }
  }
  // 3. jambes : écartement léger
  if (P.stance) {
    for (const [s, sign] of sides) {
      const th = rig['thigh' + s]; if (!th) continue;
      const pos = worldPos(th, new THREE.Vector3());
      const sgn = pos.x >= 0 ? 1 : -1;
      rotateWorld(th, forward, sgn * P.stance * Math.PI / 180 * (sign ? 1 : 1));
    }
  }
  // 4. buste et tête
  if (P.chest && rig.chest) rotateWorld(rig.chest, up, P.chest * Math.PI / 180);
  if (P.headTurn && rig.head) rotateWorld(rig.head, up, P.headTurn * Math.PI / 180);
  if (P.headTilt && rig.head) rotateWorld(rig.head, new THREE.Vector3(1, 0, 0), P.headTilt * Math.PI / 180);
  root.updateMatrixWorld(true);
  void _v; void _q2;
  return true;
}
