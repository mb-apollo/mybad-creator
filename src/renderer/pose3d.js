// Pose des modèles 3D : remet les bras le long du corps (modèles en T-pose ou A-pose),
// plie les coudes et oriente tête et buste, quel que soit le squelette (Valorant, Mixamo, générique).
import * as THREE from 'three';

const PAT = {
  upperL: [/^L_Shoulder(_\d+)?$/i, /LeftArm(_\d+)?$/i, /^upperarm_l(_\d+)?$/i, /left.?upper.?arm/i, /^L_?UpperArm/i, /^Arm\.L(_\d+)?$/i],
  upperR: [/^R_Shoulder(_\d+)?$/i, /RightArm(_\d+)?$/i, /^upperarm_r(_\d+)?$/i, /right.?upper.?arm/i, /^R_?UpperArm/i, /^Arm\.R(_\d+)?$/i],
  foreL: [/^L_Elbow(_\d+)?$/i, /LeftForeArm(_\d+)?$/i, /^lowerarm_l(_\d+)?$/i, /left.?(fore|lower).?arm/i, /^ForeArm\.L(_\d+)?$/i],
  foreR: [/^R_Elbow(_\d+)?$/i, /RightForeArm(_\d+)?$/i, /^lowerarm_r(_\d+)?$/i, /right.?(fore|lower).?arm/i, /^ForeArm\.R(_\d+)?$/i],
  handL: [/^L_Hand(_\d+)?$/i, /LeftHand(_\d+)?$/i, /^hand_l(_\d+)?$/i, /^Hand\.L(_\d+)?$/i],
  handR: [/^R_Hand(_\d+)?$/i, /RightHand(_\d+)?$/i, /^hand_r(_\d+)?$/i, /^Hand\.R(_\d+)?$/i],
  head: [/^Head(_\d+)?$/i, /mixamorig.?Head(_\d+)?$/i, /^head(_\d+)?$/i],
  chest: [/^Spine3(_\d+)?$/i, /mixamorig.?Spine2(_\d+)?$/i, /^spine_03(_\d+)?$/i],
  thighL: [/^L_Hip(_\d+)?$/i, /LeftUpLeg(_\d+)?$/i, /^thigh_l(_\d+)?$/i],
  footL: [/^L_Foot(_\d+)?$/i, /LeftFoot(_\d+)?$/i, /^foot_l(_\d+)?$/i],
  toeL: [/^L_Toe(_\d+)?$/i, /LeftToeBase(_\d+)?$/i, /^ball_l(_\d+)?$/i],
  thighR: [/^R_Hip(_\d+)?$/i, /RightUpLeg(_\d+)?$/i, /^thigh_r(_\d+)?$/i],
  kneeL: [/^L_Knee(_\d+)?$/i, /LeftLeg(_\d+)?$/i, /^calf_l(_\d+)?$/i],
  kneeR: [/^R_Knee(_\d+)?$/i, /RightLeg(_\d+)?$/i, /^calf_r(_\d+)?$/i],
  footR: [/^R_Foot(_\d+)?$/i, /RightFoot(_\d+)?$/i, /^foot_r(_\d+)?$/i],
};
const SPINE = [[/^Spine1(_\d+)?$/i, /mixamorig.?Spine(_\d+)?$/i, /^spine_01(_\d+)?$/i], [/^Spine2(_\d+)?$/i, /mixamorig.?Spine1(_\d+)?$/i, /^spine_02(_\d+)?$/i], [/^Spine3(_\d+)?$/i, /mixamorig.?Spine2(_\d+)?$/i, /^spine_03(_\d+)?$/i], [/^Spine4(_\d+)?$/i, /^spine_04(_\d+)?$/i]];
export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const fingerPat = (s, f, j) => [new RegExp('^' + s + '_' + f + j + '(_\\d+)?$', 'i'), new RegExp((s === 'L' ? 'Left' : 'Right') + 'Hand' + f + j + '(_\\d+)?$', 'i')];
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
  rig.finger = { L: {}, R: {} }; rig.fingerAxis = { L: {}, R: {} }; rig.handFrame = {};
  root.updateMatrixWorld(true);
  const lat0 = lateral(rig.upperL, rig.upperR);
  for (const s of ['L', 'R']) {
    for (const f of FINGERS) rig.finger[s][f] = [1, 2, 3].map(j => findBone(root, fingerPat(s, f, j)));
    const hand = rig['hand' + s], mid = rig.finger[s].Middle[0], idx = rig.finger[s].Index[0], pin = rig.finger[s].Pinky[0];
    if (!hand || !mid || !idx || !pin) continue;
    const hp = worldPos(hand), hq = worldQuat(hand), hqi = hq.clone().invert();
    const d = worldPos(mid).sub(hp).normalize();
    const a = worldPos(idx).sub(worldPos(pin)); a.addScaledVector(d, -a.dot(d)); a.normalize();
    const n = new THREE.Vector3().crossVectors(a, d).normalize();
    const inward = lat0.clone().multiplyScalar(s === 'L' ? -1 : 1); // la paume regarde vers le corps dans la pose du fichier
    if (n.dot(inward) < 0) n.negate();
    rig.handFrame[s] = { d: d.clone().applyQuaternion(hqi), a: a.clone().applyQuaternion(hqi), n: n.clone().applyQuaternion(hqi) };
    for (const f of FINGERS) {
      rig.fingerAxis[s][f] = rig.finger[s][f].map((b, j) => {
        if (!b) return null;
        const nxt = rig.finger[s][f][j + 1], prv = rig.finger[s][f][j - 1];
        const dir = nxt ? worldPos(nxt).sub(worldPos(b)) : prv ? worldPos(b).sub(worldPos(prv)) : null;
        if (!dir || dir.lengthSq() < 1e-12) return null;
        return new THREE.Vector3().crossVectors(n, dir.normalize()).normalize().applyQuaternion(worldQuat(b).invert());
      });
    }
  }
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
    for (let v = 0; v < pos.count; v++) box.expandByPoint(p.fromBufferAttribute(pos, v));
    const far = (box.max.y - box.min.y) * 0.035;
    for (let v = 0; v < idx.count; v++) {
      p.fromBufferAttribute(pos, v);
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

// Garde-fou contre les triangles étirés : certains modèles ont des surfaces repliées à plat dans leur pose
// d'origine (lames, rabats…) qui s'étirent en pointes dès qu'un membre bouge. On mémorise les longueurs d'arêtes
// de la pose d'origine, puis, après chaque pose, on masque les triangles dont une arête est devenue démesurée.
export function recordRestShape(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.index || o.userData.stretch) return;
    // référence = forme d'origine du maillage (sans déformation), pas la pose du fichier qui peut déjà être étirée
    const P0 = o.geometry.attributes.position, n = P0.count, rest = new Float32Array(n * 3);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) { rest[i * 3] = P0.getX(i); rest[i * 3 + 1] = P0.getY(i); rest[i * 3 + 2] = P0.getZ(i); min = Math.min(min, P0.getY(i)); max = Math.max(max, P0.getY(i)); }
    o.userData.stretch = { rest, orig: o.geometry.index.array.slice(), H: max - min, pos: new Float32Array(n * 3), cur: null };
  });
}
export function cullStretched(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const st = o.isSkinnedMesh && o.userData.stretch; if (!st) return;
    const n = st.rest.length / 3, v = new THREE.Vector3(), P = st.pos, R = st.rest, I = st.orig;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const len = (A, a, b) => Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1], A[a * 3 + 2] - A[b * 3 + 2]);
    const minLen = st.H * 0.06, keep = [];
    const bad = (a, b) => { const p = len(P, a, b); return p > minLen && p > 2 * len(R, a, b); };
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (!(bad(a, b) || bad(b, c) || bad(c, a))) keep.push(a, b, c);
    }
    const dropped = keep.length < I.length;
    if (!dropped && !st.cur) return;
    o.geometry.setIndex(new THREE.BufferAttribute(dropped ? new I.constructor(keep) : I.slice(), 1));
    st.cur = dropped;
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
    handL: { curl: 0, ...P.handL }, handR: { curl: 0, ...P.handR },
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
  applyFingers(rig, S);
  return true;
}

// Flexion des doigts (0 = ouverts, 100 = poing). curl règle tous les doigts, chaque doigt peut être précisé.
const CURL = { Thumb: [22, 30, 42], Index: [62, 88, 60], Middle: [66, 90, 62], Ring: [68, 92, 64], Pinky: [70, 92, 64] };
export function applyFingers(rig, S) {
  if (!rig.finger) return;
  const q = new THREE.Quaternion();
  for (const s of ['L', 'R']) {
    const H = S['hand' + s];
    for (const f of FINGERS) {
      const c = (H[f.toLowerCase()] ?? H.curl ?? 0) / 100;
      if (!c) continue;
      rig.finger[s][f].forEach((b, j) => { const ax = rig.fingerAxis[s][f][j]; if (b && ax) b.quaternion.multiply(q.setFromAxisAngle(ax, CURL[f][j] * c * RAD)); });
    }
  }
  rig.finger.L.Index[0]?.updateWorldMatrix(true, true); rig.finger.R.Index[0]?.updateWorldMatrix(true, true);
}

// Le bras atteint un point du monde (épaule → coude → main), le coude plie du côté de poleHint.
export function reachArm(rig, s, target, poleHint) {
  const up = rig['upper' + s], fo = rig['fore' + s], ha = rig['hand' + s];
  if (!up || !fo || !ha) return;
  const S0 = worldPos(up), l1 = S0.distanceTo(worldPos(fo)), l2 = worldPos(fo).distanceTo(worldPos(ha));
  const to = target.clone().sub(S0), dir = to.clone().normalize();
  const d = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pole = poleHint.clone().addScaledVector(dir, -poleHint.dot(dir)).normalize();
  const E = S0.clone().addScaledVector(dir, a).addScaledVector(pole, h);
  aim(up, fo, E.clone().sub(S0));
  aim(fo, ha, S0.clone().addScaledVector(dir, d).sub(worldPos(fo)));
}
// La main prend l'orientation voulue : ses doigts vers wantD, sa paume vers wantN.
export function orientHand(rig, s, wantD, wantN) {
  const F = rig.handFrame?.[s], hand = rig['hand' + s];
  if (!F || !hand) return;
  const loc = new THREE.Matrix4().makeBasis(F.d, F.n, new THREE.Vector3().crossVectors(F.d, F.n));
  const d = wantD.clone().normalize(), n = wantN.clone().addScaledVector(d, -wantN.dot(d)).normalize();
  const wor = new THREE.Matrix4().makeBasis(d, n, new THREE.Vector3().crossVectors(d, n));
  setWorldQuat(hand, new THREE.Quaternion().setFromRotationMatrix(wor.multiply(loc.transpose())));
}
// Réglages (en degrés) d'une chaîne épaule/hanche → coude/genou → main/pied qui atteint la cible T.
// pole : direction vers laquelle plie le coude (ou le genou). Reprend les conventions de applyPose.
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function solveChain(root0, mid0, end0, T, pole, lat, sign) {
  const S0 = worldPos(root0), M0 = worldPos(mid0), E0 = worldPos(end0);
  const l1 = S0.distanceTo(M0), l2 = M0.distanceTo(E0);
  const to = T.clone().sub(S0), dist = clampN(to.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4), dir = to.clone().normalize();
  const A = Math.acos(clampN((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const ud = dir.clone().multiplyScalar(Math.cos(A)).addScaledVector(p, Math.sin(A)).normalize();
  const M = S0.clone().addScaledVector(ud, l1), E = S0.clone().addScaledVector(dir, dist);
  const fd = E.clone().sub(M).normalize();
  const f = new THREE.Vector3().crossVectors(lat, UP), outward = lat.clone().multiplyScalar(sign);
  return { ud, fd, f, outward, out: Math.atan2(ud.dot(outward), Math.hypot(ud.dot(f), ud.y)) / RAD, fwd: Math.atan2(ud.dot(f), -ud.y) / RAD };
}
export function solveArmParams(rig, s, T, pole) {
  const sign = s === 'L' ? 1 : -1, lat = lateral(rig.upperL, rig.upperR);
  const r = solveChain(rig['upper' + s], rig['fore' + s], rig['hand' + s], T, pole, lat, sign);
  const fp = r.f.clone().addScaledVector(r.ud, -r.f.dot(r.ud)).normalize();
  const ip = r.outward.clone().negate(); ip.addScaledVector(r.ud, -ip.dot(r.ud)); ip.addScaledVector(fp, -ip.dot(fp)); ip.normalize();
  const perp = r.fd.clone().addScaledVector(r.ud, -r.fd.dot(r.ud));
  let roll = Math.atan2(perp.dot(ip), perp.dot(fp)) / RAD; if (roll < -90) roll += 360;
  return { out: clampN(r.out, -20, 160), fwd: clampN(r.fwd, -90, 150), elbow: clampN(Math.acos(clampN(r.ud.dot(r.fd), -1, 1)) / RAD, 0, 150), roll: clampN(roll, -90, 180) };
}
// Direction de l'épaule vers un point : règle seulement l'écart et l'avancée du bras (le coude garde son pli).
export function solveUpperArm(rig, s, M) {
  const sign = s === 'L' ? 1 : -1, lat = lateral(rig.upperL, rig.upperR), f = new THREE.Vector3().crossVectors(lat, UP);
  const ud = M.clone().sub(worldPos(rig['upper' + s])).normalize(), outward = lat.clone().multiplyScalar(sign);
  return { out: clampN(Math.atan2(ud.dot(outward), Math.hypot(ud.dot(f), ud.y)) / RAD, -20, 160), fwd: clampN(Math.atan2(ud.dot(f), -ud.y) / RAD, -90, 150) };
}
export function solveLegParams(rig, s, T) {
  const sign = s === 'L' ? 1 : -1, lat = lateral(rig.thighL, rig.thighR), f = new THREE.Vector3().crossVectors(lat, UP);
  const r = solveChain(rig['thigh' + s], rig['knee' + s], rig['foot' + s], T, f, lat, sign);
  const knee = Math.atan2(new THREE.Vector3().crossVectors(r.ud, r.fd).dot(lat), r.ud.dot(r.fd)) / RAD;
  return { out: clampN(r.out, 0, 45), fwd: clampN(r.fwd, -45, 90), knee: clampN(knee, 0, 120) };
}
export { worldPos, worldQuat, aim, lateral };

// Poses prédéfinies (chacune se règle ensuite à la main).
const SAME = a => ({ armL: { ...a }, armR: { ...a } });
// Poses adaptées à l'arme tenue : fusil à deux mains (main gauche sur le garde-main), pistolet à une main.
export const WEAPON_POSES = {
  rifle: { armR: { out: 14, fwd: 35, elbow: 80, roll: 60 }, armL: { out: 20, fwd: 40, elbow: 60, roll: 40 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 70 }, torso: { twist: -6 } },
  pistol: { armR: { out: 14, fwd: 58, elbow: 34, roll: 25 }, armL: { out: 14, fwd: 8, elbow: 20, roll: 10 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 10 } },
};
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
