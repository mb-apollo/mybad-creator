// Banc de poses — détection des traversées (outil de développement, absent de l'interface).
// À partir du personnage posé (os en place, arme en main), on relève chaque sommet de la peau dans le monde, avec sa normale et la partie
// du corps à laquelle il appartient (d'après son os dominant), puis on cherche, partie contre partie, les sommets de l'une qui se
// retrouvent SOUS la surface de l'autre : le sommet le plus proche de l'autre partie est à moins de `rayon` et sa normale tourne le dos
// au point. Cela repère une main dans le torse, un avant-bras dans la cuisse, une arme dans une jambe, des doigts dans l'arme…
// Limites connues : un tissu modélisé d'une seule face (cape, pan de manteau) compte comme une surface — un bras juste derrière est
// signalé ; les vêtements à double épaisseur donnent quelques sommets en trop. Chaque signalement donne son centre, pour aller voir.
import * as THREE from 'three';
import { handsOf, weaponKind } from './weapons.js';

const REG = ['torso', 'head', 'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const R = Object.fromEntries(REG.map((k, i) => [k, i]));

// Sommets d'un objet (peau ou arme) dans le monde : positions, normales (moyenne des faces) et région de chaque sommet.
function lire(racine, garder, regionDe) {
  const pos = [], nor = [], reg = [], v = new THREE.Vector3();
  racine.traverse(o => {
    if (!o.isMesh || o.visible === false || !garder(o)) return;
    const g = o.geometry, P = g.attributes.position, n = P.count;
    o.updateWorldMatrix(true, false);
    let regs = null;
    if (o.isSkinnedMesh && regionDe && g.attributes.skinIndex) {
      const parOs = o.skeleton.bones.map(regionDe), si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      regs = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        let os = 0, poids = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > poids) { poids = w; os = si.getComponent(i, k); } }
        regs[i] = parOs[os] ?? 0;
      }
    }
    const W = new Float32Array(n * 3), N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(P, i);
      v.applyMatrix4(o.matrixWorld); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z;
    }
    const I = g.index ? g.index.array : null, nt = (I ? I.length : n) / 3;
    for (let t = 0; t < nt; t++) {
      const a = (I ? I[t * 3] : t * 3) * 3, b = (I ? I[t * 3 + 1] : t * 3 + 1) * 3, c = (I ? I[t * 3 + 2] : t * 3 + 2) * 3;
      const ux = W[b] - W[a], uy = W[b + 1] - W[a + 1], uz = W[b + 2] - W[a + 2], vx = W[c] - W[a], vy = W[c + 1] - W[a + 1], vz = W[c + 2] - W[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
      pos.push(W[i * 3], W[i * 3 + 1], W[i * 3 + 2]); nor.push(N[i * 3] / l, N[i * 3 + 1] / l, N[i * 3 + 2] / l); reg.push(regs ? regs[i] : 0);
    }
  });
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), reg: Uint8Array.from(reg), n: reg.length };
}

const cle = (x, y, z, pas) => (Math.floor(x / pas) * 73856093) ^ (Math.floor(y / pas) * 19349663) ^ (Math.floor(z / pas) * 83492791);
function grille(S, garder, pas) {
  const m = new Map();
  for (let i = 0; i < S.n; i++) {
    if (!garder(i)) continue;
    const k = cle(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2], pas);
    let l = m.get(k); if (!l) m.set(k, l = []);
    l.push(i);
  }
  return m;
}
// Sommets de A (retenus par garderA) passés sous la surface de B (grille G de pas `rayon`) : nombre, profondeur maximale, centre.
function sous(A, garderA, B, G, rayon, tol) {
  let nb = 0, prof = 0, cx = 0, cy = 0, cz = 0;
  const r2 = rayon * rayon;
  for (let i = 0; i < A.n; i++) {
    if (!garderA(i)) continue;
    const px = A.pos[i * 3], py = A.pos[i * 3 + 1], pz = A.pos[i * 3 + 2];
    let best = r2, bj = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = G.get(cle(px + dx * rayon, py + dy * rayon, pz + dz * rayon, rayon)); if (!l) continue;
      for (const j of l) { const ex = px - B.pos[j * 3], ey = py - B.pos[j * 3 + 1], ez = pz - B.pos[j * 3 + 2], d = ex * ex + ey * ey + ez * ez; if (d < best) { best = d; bj = j; } }
    }
    if (bj < 0) continue;
    const d = (px - B.pos[bj * 3]) * B.nor[bj * 3] + (py - B.pos[bj * 3 + 1]) * B.nor[bj * 3 + 1] + (pz - B.pos[bj * 3 + 2]) * B.nor[bj * 3 + 2];
    if (d < -tol) { nb++; if (-d > prof) prof = -d; cx += px; cy += py; cz += pz; }
  }
  return nb ? { n: nb, prof: +prof.toFixed(4), centre: [+(cx / nb).toFixed(3), +(cy / nb).toFixed(3), +(cz / nb).toFixed(3)] } : null;
}

// Relevé complet : { paires: [{ a, b, n, prof, centre }] } triées par profondeur (unités : hauteur du personnage = 1, donc 0.01 ≈ 1,75 cm).
export function traversees({ inst, arme, def }, opt = {}) {
  const rig = inst.root.userData.rig; if (!rig) throw new Error('modèle sans squelette : rien à mesurer');
  const rayon = opt.rayon ?? 0.035, tol = opt.tol ?? 0.006, mini = opt.mini ?? 6;
  inst.pivot.updateMatrixWorld(true);
  const os = { handL: rig.handL, handR: rig.handR, foreL: rig.foreL, foreR: rig.foreR, upperL: rig.upperL, upperR: rig.upperR, thighL: rig.thighL, thighR: rig.thighR, shinL: rig.kneeL, shinR: rig.kneeR, footL: rig.footL, footR: rig.footR, head: rig.head };
  const parOs = new Map(); for (const [k, b] of Object.entries(os)) if (b) parOs.set(b, R[k]);
  const regionDe = o => { for (let b = o; b; b = b.parent) { const r = parOs.get(b); if (r !== undefined) return r; } return 0; };
  const dansArme = o => { for (let p = o; p; p = p.parent) if (arme && p === arme.holder) return true; return false; };
  const C = lire(inst.root, o => !dansArme(o), regionDe);
  const A = arme ? lire(arme.holder, () => true, null) : null;
  const G = {}; for (const k of REG) G[k] = grille(C, i => C.reg[i] === R[k], rayon);
  const paires = [];
  const noter = (a, b, r) => { if (r && r.n >= mini) paires.push({ a, b, ...r }); };
  const corps = (a, b, t = tol) => noter(a, b, sous(C, i => C.reg[i] === R[a], C, G[b], rayon, t));
  for (const [s, o] of [['L', 'R'], ['R', 'L']]) {
    for (const a of ['fore' + s, 'hand' + s]) for (const b of ['torso', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'upper' + o, 'fore' + o, 'hand' + o]) corps(a, b);
    corps('thigh' + s, 'thigh' + o); corps('shin' + s, 'shin' + o); corps('shin' + s, 'thigh' + o); corps('foot' + s, 'foot' + o); corps('foot' + s, 'shin' + o);
  }
  if (A) {
    const { primary, both } = handsOf(def, weaponKind(def?.key));
    const tient = new Set(['hand' + primary, ...(both ? ['hand' + (primary === 'R' ? 'L' : 'R')] : [])]);
    const GA = grille(A, () => true, rayon);
    for (const k of REG) {
      if (!tient.has(k)) noter('arme', k, sous(A, () => true, C, G[k], rayon, k.startsWith('fore') ? tol * 1.6 : tol));   // l'arme dans le corps
      if (k.startsWith('hand')) noter(k, 'arme', sous(C, i => C.reg[i] === R[k], A, GA, rayon, tient.has(k) ? tol * 1.5 : tol));   // des doigts dans l'arme
    }
  }
  paires.sort((x, y) => y.prof - x.prof);
  // repères du squelette dans le monde (mains, coudes, tête, genoux, pieds) : pour mesurer de combien une retouche déplace une pose
  const v = new THREE.Vector3(), reperes = {};
  for (const [k, o] of Object.entries({ handL: rig.handL, handR: rig.handR, elbowL: rig.foreL, elbowR: rig.foreR, head: rig.head, kneeL: rig.kneeL, kneeR: rig.kneeR, footL: rig.footL, footR: rig.footR })) {
    if (!o) continue; o.updateWorldMatrix(true, false); v.setFromMatrixPosition(o.matrixWorld); reperes[k] = [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
  }
  // diagnostic des poids de peau (option peau) : sommets de la tête qui gardent une influence d'un os étranger à la tête
  let peau, exemples;
  if (opt.peau) {
    const cpt = new Map();
    inst.root.traverse(o => {
      if (!o.isSkinnedMesh || o.visible === false || dansArme(o) || !o.geometry.attributes.skinIndex) return;
      const bones = o.skeleton.bones, regs = bones.map(regionDe), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
      for (let i = 0; i < si.count; i++) {
        let os = 0, poids = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > poids) { poids = w; os = si.getComponent(i, k); } }
        if (regs[os] !== R.head) continue;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), b = si.getComponent(i, k); if (w > 0.02 && regs[b] !== R.head) { const n = bones[b].name + ' <- ' + bones[os].name; const e = cpt.get(n) || [0, 0]; e[0]++; e[1] += w; cpt.set(n, e); } }
      }
    });
    // et sommets situés DANS la tête (près de l'os Head) mais dominés par un os étranger à la tête
    const hp = new THREE.Vector3(); rig.head.updateWorldMatrix(true, false); hp.setFromMatrixPosition(rig.head.matrixWorld);
    const vv = new THREE.Vector3();
    inst.root.traverse(o => {
      if (!o.isSkinnedMesh || o.visible === false || dansArme(o) || !o.geometry.attributes.skinIndex) return;
      const bones = o.skeleton.bones, regs = bones.map(regionDe), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, P = o.geometry.attributes.position;
      for (let i = 0; i < si.count; i++) {
        vv.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);   // position de repos (non déformée)
        o.getVertexPosition(i, vv).applyMatrix4(o.matrixWorld);
        if (vv.y < hp.y - 0.01 || vv.distanceTo(hp) > 0.11) continue;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), b = si.getComponent(i, k); if (w > 0.02 && regs[b] !== R.head && !/neck/i.test(bones[b].name)) { const n = 'DANS LA TETE : ' + bones[b].name; const e = cpt.get(n) || [0, 0]; e[0]++; e[1] += w; cpt.set(n, e); } }
        if (!exemples) exemples = [];
        if (exemples.length < 6) { let etr = false; const det = []; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), b = si.getComponent(i, k); if (w > 0.02 && regs[b] !== R.head && !/neck/i.test(bones[b].name)) etr = true; const bpos = new THREE.Vector3().setFromMatrixPosition(o.skeleton.boneInverses[b].clone().invert()); det.push(`${bones[b].name} w=${w.toFixed(3)} os@[${bpos.x.toFixed(2)},${bpos.y.toFixed(2)},${bpos.z.toFixed(2)}]`); }
          if (etr) { const q = new THREE.Vector3().fromBufferAttribute(P, i); exemples.push(`sommet ${i} repos[${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}] ` + det.join(' | ') + ` maillage=${o.name} propre=${!!o.userData.skinClean}`); } }
      }
    });
    peau = [...cpt].sort((x, y) => y[1][0] - x[1][0]).slice(0, 25).map(([n, [c, w]]) => `${n} : ${c} sommets, poids moyen ${(w / c).toFixed(2)}`).concat(exemples || []);
  }
  return { sommets: C.n, arme: A ? A.n : 0, paires, reperes, peau };
}
