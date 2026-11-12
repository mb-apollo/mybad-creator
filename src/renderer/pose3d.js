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
  toeR: [/^R_Toe(_\d+)?$/i, /RightToeBase(_\d+)?$/i, /^ball_r(_\d+)?$/i],
  clavL: [/^L_Clavicle(_\d+)?$/i, /^clavicle_l(_\d+)?$/i, /mixamorig.?LeftShoulder(_\d+)?$/i],
  clavR: [/^R_Clavicle(_\d+)?$/i, /^clavicle_r(_\d+)?$/i, /mixamorig.?RightShoulder(_\d+)?$/i],
  thighR: [/^R_Hip(_\d+)?$/i, /RightUpLeg(_\d+)?$/i, /^thigh_r(_\d+)?$/i],
  kneeL: [/^L_Knee(_\d+)?$/i, /LeftLeg(_\d+)?$/i, /^calf_l(_\d+)?$/i],
  kneeR: [/^R_Knee(_\d+)?$/i, /RightLeg(_\d+)?$/i, /^calf_r(_\d+)?$/i],
  footR: [/^R_Foot(_\d+)?$/i, /RightFoot(_\d+)?$/i, /^foot_r(_\d+)?$/i],
};
const SPINE = [[/^Spine1(_\d+)?$/i, /mixamorig.?Spine(_\d+)?$/i, /^spine_01(_\d+)?$/i], [/^Spine2(_\d+)?$/i, /mixamorig.?Spine1(_\d+)?$/i, /^spine_02(_\d+)?$/i], [/^Spine3(_\d+)?$/i, /mixamorig.?Spine2(_\d+)?$/i, /^spine_03(_\d+)?$/i], [/^Spine4(_\d+)?$/i, /^spine_04(_\d+)?$/i]];
export const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const fingerPat = (s, f, j) => [new RegExp('^' + s + '_' + f + j + '(_\\d+)?$', 'i'), new RegExp((s === 'L' ? 'Left' : 'Right') + 'Hand' + f + j + '(_\\d+)?$', 'i'), new RegExp('^' + f + '_0' + j + '_' + s + '(_\\d+)?$', 'i')];   // Valorant, Mixamo, Unreal (index_01_l)
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
  // os de vrille de l'avant-bras (enfants directs du coude, nommés …_Twst1…3), avec leur position entre le coude (0) et le poignet (1)
  rig.twist = {};
  for (const s of ['L', 'R']) {
    const fore = rig['fore' + s], hand = rig['hand' + s];
    if (!fore || !hand || hand.parent !== fore) continue;
    const ax = hand.position.clone(), L2 = ax.lengthSq(); if (L2 < 1e-18) continue;
    rig.twist[s] = fore.children.filter(b => b.isBone && b !== hand && (/_Twst\d+$/i.test(b.name || '') || /^lowerarm_twist_\d+_[lr](_\d+)?$/i.test(b.name || ''))).map(b => [b, Math.max(0, Math.min(1, b.position.dot(ax) / L2))]).filter(x => x[1] > 0.02);
  }
  root.updateMatrixWorld(true);
  const lat0 = lateral(rig.upperL, rig.upperR);
  for (const s of ['L', 'R']) {
    for (const f of FINGERS) rig.finger[s][f] = [1, 2, 3].map(j => findBone(root, fingerPat(s, f, j)));
    // certains squelettes n'ont que trois doigts (pouce, index, annulaire : Chamber) : l'annulaire tient lieu de majeur et d'auriculaire pour le repère de la main
    const F0 = k => rig.finger[s][k][0];
    const hand = rig['hand' + s], idx = F0('Index'), pin = F0('Pinky') || F0('Ring'), mid = F0('Middle') || F0('Ring') || idx;
    if (!hand || !mid || !idx || !pin) continue;
    const hp = worldPos(hand), hq = worldQuat(hand), hqi = hq.clone().invert();
    const d = worldPos(mid).sub(hp).normalize();
    const a = worldPos(idx).sub(worldPos(pin)); a.addScaledVector(d, -a.dot(d)); a.normalize();
    const n = new THREE.Vector3().crossVectors(a, d).normalize();
    const inward = lat0.clone().multiplyScalar(s === 'L' ? -1 : 1); // la paume regarde vers le corps dans la pose du fichier
    if (n.dot(inward) < 0) n.negate();
    rig.handFrame[s] = { d: d.clone().applyQuaternion(hqi), a: a.clone().applyQuaternion(hqi), n: n.clone().applyQuaternion(hqi) };
    { const F = rig.handFrame[s]; F.sgnFlex = Math.sign(new THREE.Vector3().crossVectors(F.a, F.d).dot(F.n)) || 1; F.sgnSide = Math.sign(new THREE.Vector3().crossVectors(F.n, F.d).dot(F.a)) || 1; }
    rig.fingerN ||= { L: {}, R: {} };
    for (const f of FINGERS) {
      const b0 = rig.finger[s][f][0];
      rig.fingerN[s][f] = b0 ? n.clone().applyQuaternion(worldQuat(b0).invert()) : null;
      rig.fingerAxis[s][f] = rig.finger[s][f].map((b, j) => {
        if (!b) return null;
        const nxt = rig.finger[s][f][j + 1], prv = rig.finger[s][f][j - 1];
        const dir = nxt ? worldPos(nxt).sub(worldPos(b)) : prv ? worldPos(b).sub(worldPos(prv)) : null;
        if (!dir || dir.lengthSq() < 1e-12) return null;
        // le pouce se replie en travers de la paume (vers l'auriculaire) autant que vers la paume : sa direction de pliure est inclinée
        const dn = dir.normalize(), wi = worldQuat(b).invert();
        if (f === 'Thumb') (rig.thumbAcross ||= { L: [], R: [] })[s][j] = new THREE.Vector3().crossVectors(dn, a.clone().negate()).normalize().applyQuaternion(wi);   // pliure en travers de la paume (vers l'auriculaire)
        return new THREE.Vector3().crossVectors(dn, n).normalize().applyQuaternion(wi); // une courbure positive rapproche le doigt de la paume (+n)
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
    // Sommets liés à une cible de cinématique inverse (L_IK_FootTarget : sangles de cheville, bas de pantalon) : cet os reste au sol
    // quand la jambe bouge. On les rattache à l'os du pied ou de la main qu'il représente.
    const ik = bones.map(b => { const m = /^([LR])_IK_(Foot|Hand)Target/i.exec(b.name || ''); return m ? bones.findIndex(x => new RegExp('^' + m[1] + '_' + m[2] + '$', 'i').test(x.name || '')) : -1; });
    if (ik.some(x => x >= 0)) {
      for (let v = 0; v < idx.count; v++) for (let k = 0; k < 4; k++) { const t = ik[idx.getComponent(v, k)]; if (t >= 0 && wt.getComponent(v, k) > 0) idx.setComponent(v, k, t); }
      idx.needsUpdate = true;
    }
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
    const far = (box.max.y - box.min.y) * 0.035, loin = (box.max.y - box.min.y) * 0.2;
    let recolle = false;
    // os qui portent réellement de la peau : seuls candidats pour rattacher un sommet perdu (pas les cibles de cinématique inverse,
    // repères d'arme ou de caméra, qui restent immobiles quand le corps bouge)
    const porte = new Uint8Array(bones.length);
    for (let v = 0; v < idx.count; v++) for (let k = 0; k < 4; k++) if (wt.getComponent(v, k) > 0) porte[idx.getComponent(v, k)]++;
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
      // Sommet qui ne tient plus qu'à un os lointain (influences perdues à l'export : sur Reyna, environ 300 sommets du visage ne sont
      // liés qu'à l'os n° 0, au bassin, et restent en arrière dès que la tête ou le buste bouge). On le rattache à l'os le plus proche,
      // s'il y en a un nettement plus près.
      if (near >= 0 && ds[near] > loin) {
        let b = -1, bd = Infinity;
        for (let j = 0; j < bp.length; j++) { if (!porte[j]) continue; const d = p.distanceTo(bp[j]); if (d < bd) { bd = d; b = j; } }
        if (bd < ds[near] / 5) { idx.setComponent(v, 0, b); wt.setComponent(v, 0, 1); for (let k = 1; k < 4; k++) wt.setComponent(v, k, 0); recolle = true; continue; }
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
    // Îlots de sommets liés à un seul os sans rapport avec ce qui les entoure (indices d'os perdus à l'export, rabattus sur un os parfois
    // proche : gant droit de Reyna lié au bassin, à 30 cm de la main). Ils restent en arrière dès que le membre bouge. Chaque sommet
    // reprend les poids de son voisin de maillage le plus proche qui, lui, est lié à cette partie du corps ; l'îlot se comble de proche en proche.
    const I = o.geometry.index ? o.geometry.index.array : null;
    if (I) {
      const n = idx.count, seul = new Int32Array(n).fill(-1), dom = new Int32Array(n);
      for (let v = 0; v < n; v++) {
        let b = -1, w = 0, un = true;
        for (let k = 0; k < 4; k++) { const x = wt.getComponent(v, k); if (x <= 0) continue; const j = idx.getComponent(v, k); if (b >= 0 && j !== b && x > 0.02) un = false; if (x > w) { w = x; b = j; } }
        dom[v] = b; if (un && b >= 0) seul[v] = b;
      }
      const vois = new Map();
      for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = I[t + e], b = I[t + (e + 1) % 3];
        if (seul[a] >= 0) { let l = vois.get(a); if (!l) vois.set(a, l = []); l.push(b); }
        if (seul[b] >= 0) { let l = vois.get(b); if (!l) vois.set(b, l = []); l.push(a); }
      }
      const q = new THREE.Vector3();
      for (let passe = 0, fait = true; fait && passe < 12; passe++) {
        fait = false;
        const maj = [];
        for (const [v, l] of vois) {
          if (seul[v] < 0) continue;
          let best = -1, bd = Infinity, proche = false;
          p.fromBufferAttribute(pos, v);
          const dv = p.distanceTo(bp[seul[v]]);
          if (dv <= far) continue;                                       // le sommet est contre son os : il est à sa place
          for (const y of l) {
            if (dom[y] < 0 || dom[y] === seul[v]) continue;
            if (hops(seul[v], dom[y]) <= 5) { proche = true; break; }   // voisin d'une partie du corps liée à cet os : le sommet est à sa place
            if (p.distanceTo(bp[dom[y]]) * 3 > dv) continue;             // l'os du voisin n'est pas nettement plus près : rien ne dit que c'est le sommet qui est mal lié
            const d = p.distanceTo(q.fromBufferAttribute(pos, y)); if (d < bd) { bd = d; best = y; }
          }
          if (!proche && best >= 0) maj.push([v, best]);
        }
        for (const [v, y] of maj) {
          for (let k = 0; k < 4; k++) { idx.setComponent(v, k, idx.getComponent(y, k)); wt.setComponent(v, k, wt.getComponent(y, k)); }
          dom[v] = dom[y]; seul[v] = -1; fait = true; recolle = true;
        }
      }
    }
    wt.needsUpdate = true;
    if (recolle) idx.needsUpdate = true;
  });
}

// Garde-fou contre les triangles étirés : certains modèles ont des surfaces repliées à plat dans leur pose
// d'origine (lames, rabats…) ou des sommets liés à un os sans rapport (cape cousue aux doigts, orbe au pouce), qui s'étirent en
// pointes dès qu'un membre bouge. On mémorise les longueurs d'arêtes de la pose d'origine, puis, après chaque pose, on masque les
// triangles dont une arête est devenue démesurée ET relie deux parties du corps sans lien direct (os dominants éloignés dans le
// squelette). Entre os voisins (aisselle, coude, cou), un tissu qui s'étire est une déformation normale : le masquer y creusait des trous.
const STRETCH_HOPS = 5;   // au-delà de ce nombre de liens entre les deux os, l'arête étirée est une anomalie
export function recordRestShape(root) {
  root.updateMatrixWorld(true);
  let H = 0;
  root.traverse(o => {
    if (!o.isSkinnedMesh || !o.geometry.index) return;
    if (!o.userData.stretch) {
      // référence = forme d'origine du maillage (sans déformation), pas la pose du fichier qui peut déjà être étirée
      const P0 = o.geometry.attributes.position, n = P0.count, rest = new Float32Array(n * 3);
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { rest[i * 3] = P0.getX(i); rest[i * 3 + 1] = P0.getY(i); rest[i * 3 + 2] = P0.getZ(i); min = Math.min(min, P0.getY(i)); max = Math.max(max, P0.getY(i)); }
      // squelette dont la pose de liaison n'est pas à l'échelle du maillage (certains modèles Fortnite : os mis à l'échelle 0,1 sous le maillage) :
      // la forme brute n'est pas comparable à la forme déformée, on prend alors la forme de la pose du fichier comme référence
      const v = new THREE.Vector3(); let s0 = Infinity, s1 = -Infinity;
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); s0 = Math.min(s0, v.y); s1 = Math.max(s1, v.y); }
      const k = (s1 - s0) / Math.max(max - min, 1e-12);
      if (k > 1.25 || k < 0.8) { for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z; } min = s0; max = s1; }
      // os dominant de chaque sommet (après nettoyage des poids)
      const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, dom = new Uint16Array(n);
      if (si && sw) for (let i = 0; i < n; i++) { let b = 0, w = -1; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } } dom[i] = b; }
      o.userData.stretch = { rest, orig: o.geometry.index.array.slice(), H0: max - min, H: max - min, pos: new Float32Array(n * 3), cur: null, dom, hops: new Map() };
    }
    H = Math.max(H, o.userData.stretch.H0);
  });
  // hauteur du personnage : celle de son plus grand maillage (un maillage partiel — tête, accessoire — ne doit pas abaisser le seuil)
  root.traverse(o => { if (o.isSkinnedMesh && o.userData.stretch) o.userData.stretch.H = H; });
}
export function cullStretched(root) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const st = o.isSkinnedMesh && o.userData.stretch; if (!st) return;
    const n = st.rest.length / 3, v = new THREE.Vector3(), P = st.pos, R = st.rest, I = st.orig, bones = o.skeleton.bones;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const len = (A, a, b) => Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1], A[a * 3 + 2] - A[b * 3 + 2]);
    const hops = (x, y) => {
      if (x === y) return 0;
      const key = x < y ? x * 65536 + y : y * 65536 + x; let d = st.hops.get(key);
      if (d !== undefined) return d;
      const up = new Map(); let i = 0; for (let p = bones[x]; p; p = p.parent) up.set(p, i++);
      d = 99; i = 0; for (let p = bones[y]; p; p = p.parent, i++) { const k = up.get(p); if (k !== undefined) { d = k + i; break; } }
      st.hops.set(key, d); return d;
    };
    const minLen = st.H * 0.06, maxLen = st.H * 0.22, keep = [];
    const bad = (a, b) => { const p = len(P, a, b); return p > minLen && p > 2 * len(R, a, b) && (p > maxLen || hops(st.dom[a], st.dom[b]) > STRETCH_HOPS); };
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
// Os des globes oculaires (pas toujours sous la tête dans le squelette) ; vide si le modèle n'en a pas.
function eyesOf(rig, head) {
  if (!rig.eyes) { rig.eyes = []; let top = head; while (top.parent) top = top.parent; top.traverse(o => { if (/^[LR]_Eyeball(_[0-9]+)?$/i.test(o.name || '')) rig.eyes.push(o); }); }
  return rig.eyes;
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
//   head  : turn (rotation à gauche), nod (regard vers le bas), tilt (inclinaison à gauche), eyeYaw / eyePitch (regard des yeux : gauche / haut)
// Les anciens réglages (armsDown, armsForward, elbows, chest, headTurn, headTilt, stance) restent compris.
function settings(P) {
  const A0 = { out: Math.max(0, 90 - (P.armsDown ?? 72)), fwd: P.armsForward || 0, elbow: P.elbows || 0, roll: 0 };
  const L0 = { out: P.stance || 0, fwd: 0, knee: 0 };
  return {
    armL: { ...A0, ...P.armL }, armR: { ...A0, ...P.armR },
    legL: { ...L0, ...P.legL }, legR: { ...L0, ...P.legR },
    torso: { bend: 0, lean: 0, twist: P.chest || 0, ...P.torso },
    head: { turn: P.headTurn || 0, nod: 0, tilt: P.headTilt || 0, eyeYaw: 0, eyePitch: 0, ...P.head },
    handL: { curl: 0, ...P.handL }, handR: { curl: 0, ...P.handR },
    shL: { up: 0, fwd: 0, ...P.shL }, shR: { up: 0, fwd: 0, ...P.shR },
    footL: { pitch: 0, yaw: 0, ...P.footL }, footR: { pitch: 0, yaw: 0, ...P.footR },
  };
}

export const poseValues = settings;

// Tourne un os autour d'un axe du monde ; un angle positif rapproche le point sonde de la direction voulue.
function turnToward(bone, axis, ang, probe, want) {
  if (!bone || !ang || !probe) return;
  const p0 = worldPos(probe); rotateWorld(bone, axis, 0.1);
  const d = worldPos(probe).sub(p0); rotateWorld(bone, axis, -0.1);
  rotateWorld(bone, axis, (d.dot(want) >= 0 ? 1 : -1) * ang);
}
// Poignet : flexion (vers la paume), inclinaison (vers le pouce) et rotation de la main, dans le repère de la main.
export function applyWrist(rig, s, H) {
  const hand = rig['hand' + s], F = rig.handFrame?.[s];
  if (hand && F && (H.flex || H.side || H.twist)) {
    const q = new THREE.Quaternion().setFromAxisAngle(F.a, (H.flex || 0) * RAD * F.sgnFlex)
      .multiply(new THREE.Quaternion().setFromAxisAngle(F.n, (H.side || 0) * RAD * F.sgnSide))
      .multiply(new THREE.Quaternion().setFromAxisAngle(F.d, (H.twist || 0) * RAD));
    hand.quaternion.multiply(q);
    hand.updateWorldMatrix(true, true);
  }
  spreadForearmTwist(rig, s);   // dernière étape de toute orientation de la main : l'avant-bras accompagne
}

// Vrille de l'avant-bras : quand la main tourne autour de l'avant-bras (paume vers le haut, arme tenue de côté), toute la rotation se
// concentrait au poignet, qui se tordait « en papillote ». Les modèles ont des os de vrille le long de l'avant-bras (Elbow_Twst1…3,
// enfants du coude) : chacun prend la part de la rotation qui correspond à sa position entre le coude et le poignet.
export function spreadForearmTwist(rig, s) {
  const tw = rig.twist?.[s], hand = rig['hand' + s], q0 = hand && rig.rest.get(hand);
  if (!tw?.length || !q0) return;
  const L = hand.position.length(); if (L < 1e-9) return;
  const ax = hand.position.clone().normalize();                           // axe de l'avant-bras, dans le repère du coude
  const d = hand.quaternion.clone().multiply(q0.clone().invert());        // rotation de la main depuis le repos, dans ce repère
  let t = 2 * Math.atan2(d.x * ax.x + d.y * ax.y + d.z * ax.z, d.w);
  if (t > Math.PI) t -= 2 * Math.PI; else if (t < -Math.PI) t += 2 * Math.PI;
  const q = new THREE.Quaternion();
  for (const [b, f] of tw) { b.quaternion.copy(q.setFromAxisAngle(ax, t * f)).multiply(rig.rest.get(b)); b.updateWorldMatrix(false, true); }
}

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
  // épaules : montée et avancée des clavicules (avant que les bras visent)
  for (const s of ['L', 'R']) {
    const c = rig['clav' + s], G = S['sh' + s], probe = rig['upper' + s];
    if (!c || !probe || (!G.up && !G.fwd)) continue;
    turnToward(c, fwd0, G.up * RAD, probe, UP);
    turnToward(c, UP, G.fwd * RAD, probe, fwd0);
  }
  if (rig.head) {
    const hq0 = worldQuat(rig.head).clone();
    rotateWorld(rig.head, UP, S.head.turn * RAD);
    rotateWorld(rig.head, lat0, S.head.nod * RAD);
    rotateWorld(rig.head, fwd0.clone().negate(), S.head.tilt * RAD);
    // regard : les yeux tournent dans le repère de la tête (eyeYaw : vers la gauche du personnage, eyePitch : vers le haut)
    if (S.head.eyeYaw || S.head.eyePitch) {
      const dq = worldQuat(rig.head).clone().multiply(hq0.invert()), yawAx = UP.clone().applyQuaternion(dq), pitAx = lat0.clone().applyQuaternion(dq);
      eyesOf(rig, rig.head).forEach(e => { rotateWorld(e, yawAx, (S.head.eyeYaw || 0) * RAD); rotateWorld(e, pitAx, -(S.head.eyePitch || 0) * RAD); });
    }
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
  // pieds : pointe levée / baissée et ouverture
  if (hipsLat) for (const [s, sign] of [['L', 1], ['R', -1]]) {
    const foot = rig['foot' + s], toe = rig['toe' + s], G = S['foot' + s];
    if (!foot || !toe || (!G.pitch && !G.yaw)) continue;
    turnToward(foot, hipsLat, G.pitch * RAD, toe, UP);
    turnToward(foot, UP, G.yaw * RAD, toe, hipsLat.clone().multiplyScalar(sign));
  }
  for (const s of ['L', 'R']) applyWrist(rig, s, S['hand' + s]);
  root.updateMatrixWorld(true);
  applyFingers(rig, S);
  return true;
}

// Flexion des doigts (0 = ouverts, 100 = poing). curl règle tous les doigts, chaque doigt peut être précisé.
const THUMB_TILT = [75, 45, 20];   // inclinaison (°) de la pliure de chaque articulation du pouce, de la paume vers l'auriculaire
const CURL = { Thumb: [75, 55, 55], Index: [62, 88, 60], Middle: [66, 90, 62], Ring: [68, 92, 64], Pinky: [70, 92, 64] };
// Écartement des doigts (degrés pour 100 %) : positif = les doigts s'écartent, éventail autour du majeur.
const SPREAD = { Thumb: 0, Index: 1, Middle: 0, Ring: -1, Pinky: -2 }, SPREAD_DEG = 9;
// Plie un doigt à une valeur absolue (0 = ouvert, 100 = poing), à partir de sa pose de repos, avec l'écartement et les
// ajustements d'articulations de la main (rig.handExtra).
export function setFingerCurl(rig, s, f, c) {
  const q = new THREE.Quaternion(), ex = rig.handExtra?.[s], key = f.toLowerCase();
  rig.finger[s][f].forEach((b, j) => {
    if (!b) return;
    b.quaternion.copy(rig.rest.get(b) || b.quaternion);
    if (j === 0 && ex?.spread && SPREAD[f] && rig.fingerN?.[s]?.[f]) b.quaternion.multiply(q.setFromAxisAngle(rig.fingerN[s][f], SPREAD[f] * (ex.spread / 100) * SPREAD_DEG * RAD * (rig.handFrame?.[s]?.sgnSide || 1)));
    let ax = rig.fingerAxis[s][f]?.[j];   // main sans repère (doigts manquants) : le doigt garde sa pose de repos
    const cj = (c + (ex?.H?.[key + (j + 1)] || 0)) / 100;
    if (f === 'Thumb' && ax && rig.thumbAcross?.[s]?.[j]) { const phi = (THUMB_TILT[j]) * RAD; ax = ax.clone().multiplyScalar(Math.cos(phi)).addScaledVector(rig.thumbAcross[s][j], Math.sin(phi)).normalize(); }
    if (ax && cj) b.quaternion.multiply(q.setFromAxisAngle(ax, CURL[f][j] * cj * RAD));
    b.updateMatrix();
  });
  const first = rig.finger[s][f].find(Boolean); if (first) first.updateWorldMatrix(true, true);
}
export function applyFingers(rig, S) {
  if (!rig.finger) return;
  rig.handExtra = { L: { spread: S.handL.spread || 0, H: S.handL }, R: { spread: S.handR.spread || 0, H: S.handR } };
  for (const s of ['L', 'R']) {
    const H = S['hand' + s];
    for (const f of FINGERS) setFingerCurl(rig, s, f, H[f.toLowerCase()] ?? H.curl ?? 0);
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
// Plante les pieds au sol : un pied un peu levé (jambe en avant, genou plié) descend jusqu'à la hauteur de repos de sa cheville, par une cinématique inverse de la jambe
// (hanche → genou → cheville) ; l'orientation du pied est conservée. rest : hauteurs de repos [footL, footR, …] ; k : échelle du personnage par rapport à son échelle de base ; un pied levé de plus de maxLift (en hauteurs de personnage) reste levé exprès.
export function plantFeet(root, rest, k, maxLift = 0.12) {
  const rig = rigOf(root); if (!rig || !rest) return;
  [['L', 0], ['R', 1]].forEach(([s, i]) => {
    const thigh = rig['thigh' + s], knee = rig['knee' + s], foot = rig['foot' + s];
    if (!thigh || !knee || !foot || rest[i] == null) return;
    const F = worldPos(foot), lift = F.y - rest[i] * k;
    if (lift < 0.003 * k || lift > maxLift * k) return;
    const H = worldPos(thigh), K0 = worldPos(knee), l1 = H.distanceTo(K0), l2 = K0.distanceTo(F), q0 = worldQuat(foot).clone();
    const T = new THREE.Vector3(F.x, rest[i] * k, F.z);
    // jambe trop courte pour atteindre le sol à cet endroit : le pied glisse un peu vers la hanche (quelques millimètres) plutôt que de rester en l'air
    const hv = H.y - T.y, reach = Math.sqrt(Math.max(0, (l1 + l2) * (l1 + l2) * 0.9995 - hv * hv)), hx = T.x - H.x, hz = T.z - H.z, hl = Math.hypot(hx, hz);
    if (hl > reach && hl > 1e-6) { T.x = H.x + hx * reach / hl; T.z = H.z + hz * reach / hl; }
    const to = T.clone().sub(H), dir = to.clone().normalize();
    const d = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const a = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const kv = K0.clone().sub(H), pole = kv.addScaledVector(dir, -kv.dot(dir));
    if (pole.lengthSq() < 1e-10) return;
    pole.normalize();
    const E = H.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    aim(thigh, knee, E.clone().sub(H));
    aim(knee, foot, H.clone().addScaledVector(dir, d).sub(worldPos(knee)));
    setWorldQuat(foot, q0);
  });
}
export { worldPos, worldQuat, aim, lateral };

// ---------------------------------------------------------------- visage
// Expressions par os du visage (aucun morph target dans les modèles) : bouche (mâchoire), sourire (coins des lèvres),
// paupières (une par œil) et sourcils (hauteur + froncement). Deux familles de squelettes : « riche » (Jett, Reyna…, paupières et
// sourcils en plusieurs os) et « simple » (Jaw, EyeLids, Brows, MouthCorner) ; sans os correspondant, le réglage est ignoré.
const findAll = (root, re) => { const out = []; root.traverse(o => { if (o.name && re.test(o.name)) out.push(o); }); return out; };
function faceOf(root, rig) {
  if (rig.face) return rig.face;
  const f = { rest: new Map(), lip: { L: [], R: [] }, up: { L: [], R: [] }, low: { L: [], R: [] }, brow: { L: [], R: [] } };
  f.jaw = findAll(root, /^Jaw(_\d+)?$/i)[0] || null;
  for (const s of ['L', 'R']) {
    f.lip[s] = [...findAll(root, new RegExp('^' + s + '_LipCorner(_\\d+)?$', 'i'))];
    f.up[s] = [...findAll(root, new RegExp('^' + s + '_Eyelid_Up_(Base|In|Mid|Out)(_\\d+)?$', 'i')), ...findAll(root, new RegExp('^' + s + '_EyeLids(_\\d+)?$', 'i'))];
    f.low[s] = [...findAll(root, new RegExp('^' + s + '_Eyelid_Bot_(Base|In|Mid|Out)(_\\d+)?$', 'i')), ...findAll(root, new RegExp('^' + s + '_Lower_EyeLid(_\\d+)?$', 'i'))];
    for (const b of findAll(root, new RegExp('^' + s + '_Brow_(In|Mid|Out)_\\d+(_\\d+)?$', 'i'))) f.brow[s].push({ b, zone: /_In_/i.test(b.name) ? 'in' : /_Out_/i.test(b.name) ? 'out' : 'mid' });
    for (const b of findAll(root, new RegExp('^' + s + '_Brows(_\\d+)?$', 'i'))) f.brow[s].push({ b, zone: 'all' });
  }
  f.corner = findAll(root, /^MouthCorner(_\d+)?$/i);
  const all = [f.jaw, ...f.corner, ...['L', 'R'].flatMap(s => [...f.lip[s], ...f.up[s], ...f.low[s], ...f.brow[s].map(x => x.b)])].filter(Boolean);
  all.forEach(b => f.rest.set(b, b.position.clone()));
  rig.face = f;
  return f;
}
export const FACE_KEYS = ['mouth', 'smile', 'eyeL', 'eyeR', 'brows', 'anger'];
export function applyFace(root, F) {
  const rig = rigOf(root);
  if (!rig || !rig.head || !rig.footL) return;
  const fc = faceOf(root, rig);
  fc.rest.forEach((p, b) => { b.position.copy(p); const q = rig.rest.get(b); if (q) b.quaternion.copy(q); });
  root.updateMatrixWorld(true);
  if (!F) return;
  const v = { mouth: 0, smile: 0, eyeL: 0, eyeR: 0, brows: 0, anger: 0, ...F };
  if (!FACE_KEYS.some(k => v[k])) return;
  const H = (worldPos(rig.head).y - worldPos(rig.footL).y) * 1.12, lat = lateral(rig.upperL, rig.upperR), fwd = facingOf(root) || V3(0, 0, 1);
  const move = (b, d) => { if (!b.parent) return; const p = worldPos(b).add(d); b.parent.updateWorldMatrix(true, false); b.position.copy(b.parent.worldToLocal(p)); b.updateWorldMatrix(false, true); };
  const side = { L: 1, R: -1 };
  if (fc.jaw && v.mouth) {
    const j = fc.jaw, tip = j.children.find(c => c.isObject3D), ang = (v.mouth / 100) * 24 * RAD;
    if (tip) { const y0 = worldPos(tip).y; rotateWorld(j, lat, ang); if (worldPos(tip).y > y0) { rotateWorld(j, lat, -2 * ang); } }
    else rotateWorld(j, lat, ang);
  }
  const sm = v.smile / 100;
  if (sm) {
    for (const s of ['L', 'R']) fc.lip[s].forEach(b => move(b, UP.clone().multiplyScalar(H * 0.009 * sm).addScaledVector(lat, side[s] * H * 0.006 * sm)));
    fc.corner.forEach(b => move(b, UP.clone().multiplyScalar(H * 0.004 * sm)));
  }
  for (const s of ['L', 'R']) {
    const c = (s === 'L' ? v.eyeL : v.eyeR) / 100;
    if (c) {
      fc.up[s].forEach(b => move(b, UP.clone().multiplyScalar(-H * 0.0034 * c)));
      fc.low[s].forEach(b => move(b, UP.clone().multiplyScalar(H * 0.001 * c)));
    }
    const lift = v.brows / 100, ang = v.anger / 100, tilt = Math.sign(new THREE.Vector3().crossVectors(fwd, lat).y) || 1;
    for (const { b, zone } of fc.brow[s]) {
      let dy = H * 0.008 * lift;
      if (zone === 'in') dy -= H * 0.006 * ang; else if (zone === 'out') dy += H * 0.003 * ang;
      if (dy) move(b, UP.clone().multiplyScalar(dy));
      if (zone === 'all' && ang) rotateWorld(b, fwd, side[s] * tilt * ang * 0.35);
    }
  }
}
// Expressions prédéfinies (chacune se règle ensuite à la main).
export const FACES = [
  ['neutre', 'Neutre', {}],
  ['content', 'Content', { smile: 65, mouth: 12, eyeL: 14, eyeR: 14, brows: 20 }],
  ['triste', 'Triste / fatigué', { smile: -50, eyeL: 45, eyeR: 45, brows: 5, anger: -60 }],
  ['colere', 'Colère / concentré', { smile: -30, mouth: 8, eyeL: 28, eyeR: 28, brows: -40, anger: 75 }],
  ['surprise', 'Surprise', { smile: 10, mouth: 55, brows: 85 }],
  ['clin', 'Clin d\'œil', { smile: 55, mouth: 10, eyeL: 100, brows: 15 }],
];

// Poses prédéfinies (chacune se règle ensuite à la main).
const SAME = a => ({ armL: { ...a }, armR: { ...a } });
// Poses adaptées à l'arme tenue, par type d'arme et par position : prêt (arme baissée comme en jeu), visée (épaulée),
// détendu (arme le long du corps) et présentation (arme tendue vers la caméra). 'both' : main gauche sur l'arme.
export const WEAPON_STANCES = [['pret', 'Prêt'], ['vise', 'Visée'], ['detendu', 'Détendu'], ['presentation', 'Présentation'], ['libre', 'Bras libres']];
export const WEAPON_POSES = {
  rifle: {
    pret: { both: true, aim: { x: 0.09, y: -0.16, z: 0.02, pitch: 26, yaw: 0 }, armR: { out: 14, fwd: 30, elbow: 75, roll: 60 }, armL: { out: 20, fwd: 42, elbow: 62, roll: 40 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 70 }, torso: { twist: -6 } },
    vise: { both: true, aim: { x: 0.1, y: -0.08, z: 0, pitch: 0, yaw: -4 }, armR: { out: 12, fwd: 62, elbow: 105, roll: 70 }, armL: { out: 24, fwd: 80, elbow: 30, roll: 40 }, handR: { curl: 85, index: 40, thumb: 55 }, handL: { curl: 70 }, torso: { twist: -10, bend: 2 }, head: { tilt: 5, turn: -4 } },
    detendu: { both: false, aim: { x: 0.06, y: -0.3, z: 0.05, pitch: 80, yaw: 0 }, armR: { out: 12, fwd: 14, elbow: 40, roll: 55 }, armL: { out: 16, fwd: 4, elbow: 14, roll: 8 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 12 }, torso: { twist: -2 } },
    presentation: { both: true, aim: { x: 0.16, y: -0.1, z: 0.03, pitch: 12, yaw: 38 }, armR: { out: 18, fwd: 52, elbow: 62, roll: 60 }, armL: { out: 28, fwd: 62, elbow: 40, roll: 40 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 70 }, torso: { twist: 10 }, head: { turn: 6 } },
    libre: { both: true, armR: { out: 12, fwd: 18, elbow: 85, roll: 25 }, armL: { out: 20, fwd: 42, elbow: 62, roll: 40 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 70 }, torso: { twist: -6 } },
  },
  pistol: {
    pret: { both: false, armR: { out: 12, fwd: 18, elbow: 85, roll: 25 }, armL: { out: 14, fwd: 8, elbow: 20, roll: 10 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 10 }, torso: { twist: -4 } },
    vise: { both: true, armR: { out: 8, fwd: 84, elbow: 6, roll: 20 }, armL: { out: 14, fwd: 78, elbow: 24, roll: 30 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 60 }, torso: { twist: -8 }, head: { tilt: 4 } },
    detendu: { both: false, armR: { out: 12, fwd: 6, elbow: 14, roll: 20 }, armL: { out: 14, fwd: 8, elbow: 20, roll: 10 }, handR: { curl: 85, index: 40, thumb: 55 }, handL: { curl: 10 }, torso: { twist: -2 } },
    presentation: { both: false, armR: { out: 20, fwd: 50, elbow: 70, roll: 20 }, armL: { out: 14, fwd: 8, elbow: 20, roll: 10 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 10 }, torso: { twist: 10 }, head: { turn: 6 } },
    libre: { both: false, armR: { out: 12, fwd: 18, elbow: 85, roll: 25 }, armL: { out: 14, fwd: 8, elbow: 20, roll: 10 }, handR: { curl: 85, index: 45, thumb: 55 }, handL: { curl: 10 } },
  },
};
export const POSES = [
  ['neutre', 'Neutre', { armL: { out: 18, fwd: 0, elbow: 0, roll: 0 }, armR: { out: 18, fwd: 0, elbow: 0, roll: 0 }, handL: { curl: 18, thumb: 10 }, handR: { curl: 18, thumb: 10 } }],
  ['detendu', 'Décontracté', { ...SAME({ out: 12, fwd: 8, elbow: 22, roll: 20 }), torso: { twist: 4 }, head: { tilt: 3 }, handL: { curl: 24, thumb: 12 }, handR: { curl: 24, thumb: 12 } }],
  ['hanches', 'Mains sur les hanches', { ...SAME({ out: 36, fwd: -10, elbow: 108, roll: 118 }), legL: { out: 5 }, legR: { out: 5 }, handL: { curl: 30, thumb: 20 }, handR: { curl: 30, thumb: 20 } }],
  ['hanche', 'Une main sur la hanche', { armL: { out: 36, fwd: -10, elbow: 108, roll: 118 }, armR: { out: 14, fwd: 6, elbow: 18, roll: 10 }, torso: { lean: 4, twist: -6 }, head: { tilt: -4 }, handL: { curl: 30, thumb: 20 }, handR: { curl: 18, thumb: 10 } }],
  ['croises', 'Bras croisés', { ...SAME({ out: 10, fwd: 52, elbow: 128, roll: 88 }), legL: { out: 4 }, legR: { out: 4 }, handL: { curl: 55, thumb: 30 }, handR: { curl: 55, thumb: 30 } }],
  ['garde', 'Garde (poings)', { ...SAME({ out: 22, fwd: 38, elbow: 108, roll: 36 }), torso: { bend: 6 }, handL: { curl: 100, thumb: 70 }, handR: { curl: 100, thumb: 70 } }],
  ['pointer', 'Pointer vers la caméra', { armL: { out: 14, fwd: 4, elbow: 18, roll: 10 }, armR: { out: 24, fwd: 88, elbow: 6, roll: 0 }, torso: { twist: -8 }, head: { turn: 6 }, handL: { curl: 18, thumb: 10 }, handR: { curl: 90, index: 0, thumb: 40 } }],
  ['dos', 'Mains dans le dos', { ...SAME({ out: 8, fwd: -28, elbow: 52, roll: 150 }), torso: { bend: -4 }, handL: { curl: 35, thumb: 20 }, handR: { curl: 35, thumb: 20 } }],
  ['pas', 'Pas en avant', { ...SAME({ out: 14, fwd: 10, elbow: 24, roll: 10 }), legL: { fwd: 16, knee: 10 }, legR: { fwd: -6, out: 4 }, torso: { twist: 6 }, handL: { curl: 24, thumb: 12 }, handR: { curl: 24, thumb: 12 } }],
];
