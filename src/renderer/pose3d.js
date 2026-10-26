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
  kneeL: [/^L_Knee$/i, /LeftLeg(_\d+)?$/i, /^calf_l$/i],
  kneeR: [/^R_Knee$/i, /RightLeg(_\d+)?$/i, /^calf_r$/i],
  footR: [/^R_Foot$/i, /RightFoot(_\d+)?$/i, /^foot_r$/i],
};
const SPINE = [[/^Spine1$/i, /mixamorig.?Spine(_\d+)?$/i, /^spine_01$/i], [/^Spine2$/i, /mixamorig.?Spine1(_\d+)?$/i, /^spine_02$/i], [/^Spine3$/i, /mixamorig.?Spine2(_\d+)?$/i, /^spine_03$/i], [/^Spine4$/i, /^spine_04$/i]];
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
  rig.spine = SPINE.map(l => findBone(root, l)).filter(Boolean);
  rig.rest = new Map();
  root.traverse(o => { if (o.isBone) rig.rest.set(o, o.quaternion.clone()); });
  root.userData.rig = rig;
  return rig;
}

// Les modèles du pack ont des poids de peau parasites : certains sommets (dents, langue, doigts, pieds, ceinture)
// sont liés à la clavicule, invisible dans la pose du fichier, mais ils s'étirent en pointes dès qu'un membre
// bouge. On écarte les influences d'os éloignés du sommet (pose de liaison) qui ne sont pas voisins dans le squelette.
export function cleanSkinWeights(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isSkinnedMesh || o.userData.skinClean) return;
    o.userData.skinClean = true;
    const bones = o.skeleton.bones, inv = o.skeleton.boneInverses;
    const pos = o.geometry.attributes.position, idx = o.geometry.attributes.skinIndex, wt = o.geometry.attributes.skinWeight;
    if (!idx || !wt || !inv.length) return;
    const bp = inv.map(m => new THREE.Vector3().setFromMatrixPosition(m.clone().invert()));
    const chain = bones.map(b => { const c = []; for (let p = b; p; p = p.parent) c.push(p); return c; });
    const cache = new Map();
    const hops = (a, b) => {
      const key = a * 4096 + b; let d = cache.get(key);
      if (d !== undefined) return d;
      const up = new Map(chain[a].map((x, i) => [x, i])); d = 99;
      for (let i = 0; i < chain[b].length; i++) { const k = up.get(chain[b][i]); if (k !== undefined) { d = k + i; break; } }
      cache.set(key, d); return d;
    };
    const p = new THREE.Vector3(), box = new THREE.Box3();
    for (let v = 0; v < pos.count; v++) box.expandByPoint(p.fromBufferAttribute(pos, v).applyMatrix4(o.bindMatrix));
    const far = (box.max.y - box.min.y) * 0.035;
    for (let v = 0; v < idx.count; v++) {
      p.fromBufferAttribute(pos, v).applyMatrix4(o.bindMatrix);
      const ks = [], ds = [];
      let near = -1;
      for (let k = 0; k < 4; k++) {
        if (wt.getComponent(v, k) <= 0) continue;
        const d = p.distanceTo(bp[idx.getComponent(v, k)]);
        ks.push(k); ds.push(d);
        if (near < 0 || d < ds[near]) near = ks.length - 1;
      }
      if (ks.length < 2) continue;
      const nearBone = idx.getComponent(v, ks[near]);
      let sum = 0;
      for (let i = 0; i < ks.length; i++) {
        const bone = idx.getComponent(v, ks[i]);
        if (i !== near && hops(nearBone, bone) > 2 && ds[i] > ds[near] + far) wt.setComponent(v, ks[i], 0);
        else sum += wt.getComponent(v, ks[i]);
      }
      if (sum > 0) for (let k = 0; k < 4; k++) wt.setComponent(v, k, wt.getComponent(v, k) / sum);
    }
    wt.needsUpdate = true;
  });
}

const RAD = Math.PI / 180;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0), DOWN = V3(0, -1, 0);
function worldPos(o, out = new THREE.Vector3()) { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); }
function worldQuat(o) { o.updateWorldMatrix(true, false); return o.getWorldQuaternion(new THREE.Quaternion()); }
// Impose une orientation exprimée dans le repère du monde à un os (ses enfants suivent).
function setWorldQuat(bone, q) {
  const pq = new THREE.Quaternion();
  if (bone.parent) { bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(pq); }
  bone.quaternion.copy(pq.invert().multiply(q));
  bone.updateWorldMatrix(false, true);
}
function rotateWorld(bone, axis, angle) {
  if (!bone || !angle) return;
  setWorldQuat(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(worldQuat(bone)));
}
// Oriente un os pour que la direction os → extrémité pointe vers target.
function aim(bone, tip, target) {
  const d = worldPos(tip).sub(worldPos(bone));
  if (d.lengthSq() < 1e-10) return;
  setWorldQuat(bone, new THREE.Quaternion().setFromUnitVectors(d.normalize(), target.clone().normalize()).multiply(worldQuat(bone)));
}
// Axe horizontal qui va de l'épaule droite à l'épaule gauche du personnage (L_ = gauche du personnage).
function lateral(a, b) {
  const l = worldPos(a).sub(worldPos(b)); l.y = 0;
  return l.lengthSq() > 1e-8 ? l.normalize() : V3(1, 0, 0);
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

// Réglages d'une pose (tous en degrés) :
//   armL / armR : out (écart latéral, 0 = le long du corps, 90 = à l'horizontale), fwd (vers l'avant),
//                 elbow (pliure), roll (sens de la pliure : 0 avant, 90 vers le corps, 180 arrière)
//   legL / legR : out (écart), fwd (jambe vers l'avant), knee (genou plié)
//   torso : bend (penché en avant), lean (penché à gauche), twist (rotation à gauche)
//   head  : turn (rotation à gauche), nod (regard vers le bas), tilt (inclinaison à gauche)
// Les anciens réglages (armsDown, armsForward, elbows, chest, headTurn, headTilt, stance) restent compris.
function settings(P) {
  const A0 = { out: Math.max(0, 90 - (P.armsDown ?? 72)), fwd: P.armsForward || 0, elbow: P.elbows || 0, roll: 0 };
  const L0 = { out: P.stance || 0, fwd: 0, knee: 0 };
  return {
    armL: { ...A0, ...P.armL }, armR: { ...A0, ...P.armR },
    legL: { ...L0, ...P.legL }, legR: { ...L0, ...P.legR },
    torso: { bend: 0, lean: 0, twist: P.chest || 0, ...P.torso },
    head: { turn: P.headTurn || 0, nod: 0, tilt: P.headTilt || 0, ...P.head },
  };
}

export const poseValues = settings;

export function applyPose(root, P) {
  const rig = rigOf(root);
  if (!rig) return false;
  rig.rest.forEach((q, b) => b.quaternion.copy(q));
  root.updateMatrixWorld(true);
  if (!P || P.mode === 'file') return true;
  const S = settings(P);

  // jambes : cuisse puis tibia, pieds remis à plat
  const hipsLat = rig.thighL && rig.thighR ? lateral(rig.thighL, rig.thighR) : null;
  const flat = { L: rig.footL && worldQuat(rig.footL), R: rig.footR && worldQuat(rig.footR) };
  if (hipsLat) {
    const swing = hipsLat.clone().negate(); // rotation positive autour de cet axe : vers l'avant
    for (const [s, sign] of [['L', 1], ['R', -1]]) {
      const thigh = rig['thigh' + s], knee = rig['knee' + s], foot = rig['foot' + s], G = S['leg' + s];
      if (!thigh || !knee || !foot || (!G.out && !G.fwd && !G.knee)) continue;
      const t = DOWN.clone().multiplyScalar(Math.cos(G.out * RAD)).addScaledVector(hipsLat, sign * Math.sin(G.out * RAD)).applyAxisAngle(swing, G.fwd * RAD).normalize();
      aim(thigh, knee, t);
      aim(knee, foot, t.clone().applyAxisAngle(hipsLat, G.knee * RAD));
      if (flat[s]) setWorldQuat(foot, flat[s]);
    }
  }

  // buste (réparti sur la colonne) et tête
  const spine = rig.spine.length ? rig.spine : (rig.chest ? [rig.chest] : []);
  const lat0 = lateral(rig.upperL, rig.upperR), fwd0 = new THREE.Vector3().crossVectors(lat0, UP);
  spine.forEach(b => {
    rotateWorld(b, lat0, S.torso.bend * RAD / spine.length);
    rotateWorld(b, fwd0.clone().negate(), S.torso.lean * RAD / spine.length);
    rotateWorld(b, UP, S.torso.twist * RAD / spine.length);
  });
  if (rig.head) {
    rotateWorld(rig.head, UP, S.head.turn * RAD);
    rotateWorld(rig.head, lat0, S.head.nod * RAD);
    rotateWorld(rig.head, fwd0.clone().negate(), S.head.tilt * RAD);
  }

  // bras : l'épaule vise une direction (écart puis balancement avant), le coude plie dans le sens choisi
  const lat = lateral(rig.upperL, rig.upperR), f = new THREE.Vector3().crossVectors(lat, UP), swing = lat.clone().negate();
  for (const [s, sign] of [['L', 1], ['R', -1]]) {
    const upper = rig['upper' + s], fore = rig['fore' + s], hand = rig['hand' + s], A = S['arm' + s];
    const tip = fore || hand; if (!upper || !tip) continue;
    const outward = lat.clone().multiplyScalar(sign);
    const ud = DOWN.clone().multiplyScalar(Math.cos(A.out * RAD)).addScaledVector(outward, Math.sin(A.out * RAD)).applyAxisAngle(swing, A.fwd * RAD).normalize();
    aim(upper, tip, ud);
    if (fore && hand && A.elbow) {
      const fp = f.clone().addScaledVector(ud, -f.dot(ud)).normalize();
      const ip = outward.clone().negate(); ip.addScaledVector(ud, -ip.dot(ud)); ip.addScaledVector(fp, -ip.dot(fp)); ip.normalize();
      const perp = fp.multiplyScalar(Math.cos(A.roll * RAD)).addScaledVector(ip, Math.sin(A.roll * RAD));
      aim(fore, hand, ud.clone().multiplyScalar(Math.cos(A.elbow * RAD)).addScaledVector(perp, Math.sin(A.elbow * RAD)));
    }
  }
  root.updateMatrixWorld(true);
  return true;
}

// Poses prédéfinies (chacune se règle ensuite à la main).
const SAME = a => ({ armL: { ...a }, armR: { ...a } });
export const POSES = [
  ['neutre', 'Neutre', { armL: { out: 18, fwd: 0, elbow: 0, roll: 0 }, armR: { out: 18, fwd: 0, elbow: 0, roll: 0 } }],
  ['detendu', 'Décontracté', { ...SAME({ out: 12, fwd: 8, elbow: 22, roll: 20 }), torso: { twist: 4 }, head: { tilt: 3 } }],
  ['hanches', 'Mains sur les hanches', { ...SAME({ out: 36, fwd: -10, elbow: 108, roll: 118 }), legL: { out: 5 }, legR: { out: 5 } }],
  ['hanche', 'Une main sur la hanche', { armL: { out: 36, fwd: -10, elbow: 108, roll: 118 }, armR: { out: 14, fwd: 6, elbow: 18, roll: 10 }, torso: { lean: 4, twist: -6 }, head: { tilt: -4 } }],
  ['croises', 'Bras croisés', { ...SAME({ out: 10, fwd: 52, elbow: 128, roll: 88 }), legL: { out: 4 }, legR: { out: 4 } }],
  ['garde', 'Garde (poings)', { ...SAME({ out: 22, fwd: 38, elbow: 108, roll: 36 }), torso: { bend: 6 } }],
  ['pointer', 'Pointer vers la caméra', { armL: { out: 14, fwd: 4, elbow: 18, roll: 10 }, armR: { out: 24, fwd: 88, elbow: 6, roll: 0 }, torso: { twist: -8 }, head: { turn: 6 } }],
  ['dos', 'Mains dans le dos', { ...SAME({ out: 8, fwd: -28, elbow: 52, roll: 150 }), torso: { bend: -4 } }],
  ['pas', 'Pas en avant', { ...SAME({ out: 14, fwd: 10, elbow: 24, roll: 10 }), legL: { fwd: 16, knee: 10 }, legR: { fwd: -6, out: 4 }, torso: { twist: 6 } }],
];
