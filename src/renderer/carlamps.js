// Feux des voitures Rocket League : lumière émise par les phares et les feux arrière (dessin de la texture renforcé et teinté, par shader)
// et halos lumineux (sprites additifs) placés sur chaque feu. Couleur des feux avant et arrière réglable séparément.
import * as THREE from 'three';

export const LAMP_DEFAULT = { front: '#e8f4ff', rear: '#ff1a12', glow: 1 };

// Octane : les feux sont peints dans la texture du châssis (centre et rayon en pixels de l'atlas 2048), mais éteints : on renforce leur lumière dans des disques.
// kind : 'f' phare avant, 'r' feu arrière. Dominus / Fennec : feux arrière lus dans la texture, dans une zone arrière (x < rx, z > zmin).
const SHADER = {
  octane: { tex: 2048, discs: [[482, 313, 48, 'f', 9], [1859, 966, 30, 'f', 9], [976, 1407, 40, 'f', 9], [1586, 1545, 14, 'f', 9], [1634, 1526, 14, 'f', 9], [1209, 1074, 50, 'r', 3.4], [1290, 1056, 35, 'r', 3.4], [1408, 1913, 35, 'r', 3.4], [1516, 1913, 35, 'r', 3.4]] },
  fennec: { rear: { rx: -0.5, zmin: -0.2, from: 'map' } },
  dominus: { rear: { rx: -0.45, zmin: 0.0, from: 'map' } },
};

// Halos : positions dans le repère du maillage du châssis (x avant, y côté, z haut), taille en unités du modèle ; y est répété des deux côtés.
// kind 'f' / 'r', s : diamètre du halo, core : diamètre du cœur, streak : longueur d'un trait de lumière horizontal.
const HALOS = {
  octane: [
    { k: 'f', p: [0.79, 0.165, 0.0], s: 0.26, core: 0.07, streak: 0.5, mirror: true },
    { k: 'f', p: [0.80, 0.04, -0.075], s: 0.12, core: 0.04, mirror: true },
    { k: 'r', p: [-0.53, 0.245, 0.21], s: 0.22, core: 0.06, mirror: true },
    { k: 'r', p: [-0.53, 0.295, 0.20], s: 0.15, core: 0.045, mirror: true },
  ],
  fennec: [
    { k: 'f', p: [0.74, 0.22, 0.06], s: 0.3, core: 0.08, streak: 0.55, mirror: true },
    { k: 'r', p: [-0.63, 0.2, 0.03], s: 0.2, core: 0.06, mirror: true },
    { k: 'r', p: [-0.63, 0.0, 0.14], s: 0.14, core: 0.0, streak: 0.7, wide: true },
  ],
  dominus: [
    { k: 'f', p: [0.865, 0.295, -0.055], s: 0.24, core: 0.07, streak: 0.5, mirror: true },
    { k: 'f', p: [0.865, 0.29, 0.015], s: 0.22, core: 0.065, mirror: true },
    { k: 'r', p: [-0.59, 0.23, 0.09], s: 0.26, core: 0.07, mirror: true },
  ],
};

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  TEX = {
    halo: mk(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.55)'); r.addColorStop(0.5, 'rgba(255,255,255,0.14)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }),
    streak: mk(256, 32, (g, w, h) => { const r = g.createLinearGradient(0, 0, w, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, '#000'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h); }),
  };
  return TEX;
}

// Un shader par matière de châssis : uniformes de couleur partagés (mis à jour à chaque rendu, sans recompiler).
function shaderFor(m, car, U) {
  const cfg = SHADER[car]; if (!cfg) return;
  if (m.userData.lampShader === car) return;
  m.userData.lampShader = car;
  const f = v => v.toFixed(3);
  const discs = (cfg.discs || []).map(([cx, cy, r, kd, k]) => `{ float d = length(tpx - vec2(${cx}.0, ${cy}.0)); float mk = 1.0 - smoothstep(${f(r * 0.85)}, ${f(r)}, d); float l = dot(texture2D(map, vMapUv).rgb, vec3(0.3333)); totalEmissiveRadiance += ${kd === 'f' ? 'uLF' : 'uLR'} * pow(l, 1.3) * mk * ${f(k)} * uLon; }`).join('\n');
  const rr = cfg.rear;
  const rear = rr ? `{ float rz = step(vLpPos.x, ${f(rr.rx)}) * step(${f(rr.zmin)}, vLpPos.z);
    vec3 tc = ${rr.from === 'emissive' ? 'totalEmissiveRadiance' : 'texture2D(map, vMapUv).rgb'};
    float rd = smoothstep(0.05, 0.35, tc.r - max(tc.g, tc.b)) * rz;
    float lum = ${rr.from === 'emissive' ? 'tc.r * 1.2' : '(0.35 + tc.r) * 2.2 * uLon'};
    totalEmissiveRadiance = mix(totalEmissiveRadiance, uLR * lum, rd); }` : '';
  m.onBeforeCompile = sh => {
    sh.uniforms.uLF = U.uLF; sh.uniforms.uLR = U.uLR; sh.uniforms.uLon = U.uLon;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLpPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLpPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLpPos; uniform vec3 uLF; uniform vec3 uLR; uniform float uLon;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ vec2 tpx = vMapUv * ' + (cfg.tex || 2048) + '.0;\n' + discs + '\n' + rear + '\n}');
  };
  m.customProgramCacheKey = () => 'lamps3-' + car;
  m.needsUpdate = true;
}

function buildHalos(chassis, car) {
  const T = textures(), g = new THREE.Group(); g.name = 'lampHalos'; g.renderOrder = 10;
  const sp = (map, k, p, w, h) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    s.position.set(...p); s.scale.set(w, h, 1); s.userData.k = k; g.add(s); return s;
  };
  for (const d of HALOS[car] || []) for (const sy of d.mirror ? [1, -1] : [1]) {
    const p = [d.p[0], d.p[1] * sy, d.p[2]];
    const bloom = sp(T.halo, d.k, p, d.s * 2.8, d.s * 2.8); bloom.userData.base = 0.18;
    const halo = sp(T.halo, d.k, p, d.s, d.s); halo.userData.base = 0.55;
    if (d.core) { const c = sp(T.halo, d.k, p, d.core, d.core); c.userData.base = 1; c.userData.white = 0.7; }
    if (d.streak) { const t = sp(T.streak, d.k, p, d.streak, d.streak * (d.wide ? 0.07 : 0.12)); t.userData.base = d.wide ? 0.5 : 0.35; }
  }
  chassis.add(g);
  return g;
}

// L.lights : 'on' allume ; col : { front, rear, glow } (couleurs CSS, glow = force des halos).
export function applyLamps(inst, car, on, col) {
  const front = new THREE.Color(col.front || LAMP_DEFAULT.front), rear = new THREE.Color(col.rear || LAMP_DEFAULT.rear), glow = col.glow ?? LAMP_DEFAULT.glow;
  let chassis = null;
  inst.root.traverse(o => { if (!chassis && o.isMesh && [].concat(o.material || []).some(m => /chassis/i.test(m.name || ''))) chassis = o; });
  if (!chassis) return;
  const mat = [].concat(chassis.material).find(m => /chassis/i.test(m.name || ''));
  const U = (mat.userData.lampU ||= { uLF: { value: new THREE.Color() }, uLR: { value: new THREE.Color() }, uLon: { value: 0 } });
  U.uLF.value.copy(front); U.uLR.value.copy(rear); U.uLon.value = on ? 1 : 0;
  if (SHADER[car]) { if (on && !mat.userData.lampShader) shaderFor(mat, car, U); }
  // le shader reste compilé une fois allumé ; uLon coupe les disques (Octane, Dominus) ; la recoloration des feux arrière ne se fait qu'allumé
  if (SHADER[car]?.rear && mat.userData.lampShader) { /* uLon pilote déjà l'intensité */ }
  const halos = chassis.userData.halos ||= buildHalos(chassis, car);
  halos.visible = !!on && glow > 0;
  if (on) for (const s of halos.children) {
    const c = (s.userData.k === 'f' ? front : rear).clone();
    if (s.userData.white) c.lerp(new THREE.Color('#ffffff'), s.userData.white);
    s.material.color.copy(c); s.material.opacity = Math.min(1, s.userData.base * glow);
  }
  return { mat, front, rear };
}
