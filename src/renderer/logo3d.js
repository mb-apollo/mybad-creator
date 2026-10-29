// Logo MyBad en 3D (ailes + étoile), tenu en main comme une arme : objet fabriqué ici, sans fichier .glb.
// Les ailes viennent du contour du logo (assets/brand/logo-trace.json, en pixels d'une image de 2000 px), l'étoile est dessinée à la main.
// Repère d'une arme : l'avant est −X, le haut +Y ; le centre de la poignée est l'origine (nœud « Root_01 »).
import * as THREE from 'three';
import TRACE from './assets/brand/logo-trace.json';

export const LOGO_URL = 'builtin:mybad-logo';
const F = 0.30 / 1976;                       // mètres par pixel : le logo mesure 30 cm d'envergure
const CX = 996, GRIP_Y = 1500;               // centre du logo (px) et hauteur de la poignée sur la lame centrale
const X = px => (px - CX) * F, Y = py => -(py - GRIP_Y) * F;
const DEPTH = 0.012;

function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function star(b) {
  // étoile à quatre branches aux flancs creux
  const cx = X((b[0] + b[2]) / 2), cy = Y((b[1] + b[3]) / 2), rx = (b[2] - b[0]) / 2 * F, ry = (b[3] - b[1]) / 2 * F, k = 0.1;
  const s = new THREE.Shape();
  s.moveTo(cx, cy + ry);
  s.quadraticCurveTo(cx + rx * k, cy + ry * k, cx + rx, cy);
  s.quadraticCurveTo(cx + rx * k, cy - ry * k, cx, cy - ry);
  s.quadraticCurveTo(cx - rx * k, cy - ry * k, cx - rx, cy);
  s.quadraticCurveTo(cx - rx * k, cy + ry * k, cx, cy + ry);
  return s;
}

export function makeLogoGltf() {
  const root = new THREE.Group(); root.name = 'MyBadLogo';
  const add = (geo, part) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); m.userData.part = part; root.add(m); return m; };
  for (const p of TRACE.parts) {
    if (p.kind === 'star') { add(extrude(star(p.bbox), DEPTH * 0.8, 0.0012), 'star'); continue; }
    const pts = p.pts.map(([x, y]) => new THREE.Vector2(X(x), Y(y)));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    add(extrude(new THREE.Shape(pts), DEPTH, 0.0018), 'wing');
  }
  // poignée : un cylindre qui traverse la lame centrale, sous la main
  const grip = add(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 24), 'grip'); grip.position.set(0, 0, 0);
  const rootNode = new THREE.Object3D(); rootNode.name = 'Root_01'; root.add(rootNode);
  const muzzle = new THREE.Object3D(); muzzle.name = 'MuzzlePoint_03'; muzzle.position.set(-0.15, 0.06, 0); root.add(muzzle);
  return { scene: root, animations: [] };
}

// Matière : « metal » (chrome bleuté, l'étoile prend la couleur) ou « neon » (émissif à la couleur choisie).
const MATS = new Map();
function material(mode, hex, part) {
  const key = mode + '|' + hex + '|' + part;
  let m = MATS.get(key);
  if (m) return m;
  const c = new THREE.Color(hex);
  if (part === 'grip') m = new THREE.MeshStandardMaterial({ color: '#141a2b', metalness: 0.6, roughness: 0.55 });
  else if (mode === 'neon') m = new THREE.MeshStandardMaterial({ color: '#080c18', emissive: part === 'star' ? c.clone().lerp(new THREE.Color('#ffffff'), 0.45) : c, emissiveIntensity: part === 'star' ? 2.6 : 2.0, metalness: 0.2, roughness: 0.5 });
  else m = new THREE.MeshStandardMaterial({ color: part === 'star' ? c : '#c4d0ee', metalness: 1, roughness: part === 'star' ? 0.22 : 0.3 });
  MATS.set(key, m);
  return m;
}
export function setLogoLook(w, mode, hex) {
  w.root.traverse(o => { if (o.isMesh && o.userData.part) o.material = material(mode === 'neon' ? 'neon' : 'metal', hex || '#54d8ff', o.userData.part); });
}
