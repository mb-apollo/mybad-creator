// Livrées des voitures Rocket League. Une livrée est une définition JSON (couleurs de base, lueur, calques : logo, image, texte, étoile, bande)
// dessinée sur deux textures (flanc, dessus) projetées sur la carrosserie à partir de sa boîte englobante, avec un shader injecté dans la matière « Body ».
// Les livrées sont enregistrées dans le navigateur (localStorage « mbc.liveries ») ; « MyBad — Nuit » et « Azur » sont fournies et modifiables.
import * as THREE from 'three';
import TRACE from './assets/brand/logo-trace.json';

const KEY = 'mbc.liveries', SH = 800, TW = 1024;
export const FONTS = ['Montserrat', 'Arial Black', 'Impact', 'Georgia', 'Courier New'];
export const CARS = [['octane', 'Octane'], ['fennec', 'Fennec'], ['dominus', 'Dominus']];

// ------------------------------------------------------------------ définitions fournies
let LN = 0;
export const newLayer = (kind, o = {}) => {
  const base = {
    logo: { face: 'side', x: 0.5, y: 0.55, size: 0.45, rot: 0, color: '#ffffff', color2: '#9fe3ff', opacity: 1, glow: 0.3, star: false },
    star: { face: 'side', x: 0.5, y: 0.5, size: 0.1, rot: 0, color: '#ffffff', opacity: 1, glow: 1 },
    image: { face: 'side', x: 0.5, y: 0.5, size: 0.4, rot: 0, opacity: 1, glow: 0, src: '' },
    text: { face: 'side', x: 0.2, y: 0.2, size: 0.07, rot: 0, color: '#ffffff', opacity: 1, glow: 0.3, text: 'MYBAD', font: 'Montserrat', weight: 800, italic: true },
    stripe: { face: 'side', x: 0.5, y: 0.6, rot: -18, len: 1.2, thick: 6, color: '#8fdcff', opacity: 0.8, glow: 0.5 },
  }[kind];
  return { id: 'l' + Date.now().toString(36) + (++LN), kind, ...base, ...o };
};
const nuit = () => ({
  name: 'MyBad — Nuit', base: ['#070e30', '#03060f'], gloss: 0.7, metal: 0.45, glow: { color: '#3c96ff', amount: 0.38 },
  layers: [
    newLayer('stripe', { x: 0.5, y: 0.55, rot: -18, len: 1.3, thick: 5, opacity: 0.75, glow: 0.6 }),
    newLayer('stripe', { x: 0.5, y: 0.66, rot: -18, len: 1.3, thick: 2.5, opacity: 0.5, glow: 0.4 }),
    newLayer('stripe', { x: 0.5, y: 0.965, rot: 0, len: 1.1, thick: 4, opacity: 0.8, glow: 0.5 }),
    ...[[0.2, 0.3, 0.018], [0.3, 0.52, 0.012], [0.74, 0.62, 0.014], [0.86, 0.3, 0.01], [0.62, 0.2, 0.009]].map(([x, y, r]) => newLayer('star', { x, y, size: r * 2, glow: 0.8 })),
    newLayer('logo', { x: 0.47, y: 0.575, size: 0.45, color: '#9db9dc', color2: '#5f8fc4', opacity: 0.88, glow: 0,
      ov: { octane: { x: 0.47, y: 0.575, size: 0.46 }, fennec: { x: 0.45, y: 0.575, size: 0.43 }, dominus: { x: 0.45, y: 0.575, size: 0.41 } } }),
    newLayer('text', { x: 0.17, y: 0.2, size: 0.07, text: 'MYBAD ESPORT', color: '#9fc4e6', opacity: 0.9 }),
    newLayer('star', { face: 'top', x: 0.5, y: 0.25, size: 0.32, glow: 1 }),
    newLayer('stripe', { face: 'top', x: 0.461, y: 0.5, rot: 90, len: 1, thick: 12, opacity: 0.9, glow: 0.8 }),
    newLayer('stripe', { face: 'top', x: 0.539, y: 0.5, rot: 90, len: 1, thick: 12, opacity: 0.9, glow: 0.8 }),
  ],
});
const azur = () => ({
  name: 'MyBad — Azur', base: ['#2a6bff', '#0b3bc4'], gloss: 0.7, metal: 0.45, glow: { color: '#a8d4ff', amount: 0.3 },
  layers: [
    newLayer('stripe', { x: 0.5, y: 0.5, rot: -16, len: 1.3, thick: 14, color: '#06143f', opacity: 0.85, glow: 0 }),
    newLayer('stripe', { x: 0.5, y: 0.42, rot: -16, len: 1.3, thick: 5, color: '#e9f6ff', opacity: 0.95, glow: 0.6 }),
    newLayer('stripe', { x: 0.5, y: 0.965, rot: 0, len: 1.1, thick: 5, color: '#e9f6ff', opacity: 0.9, glow: 0.4 }),
    newLayer('logo', { x: 0.47, y: 0.575, size: 0.45, color: '#ffffff', color2: '#cfeaff', opacity: 1, glow: 0.2,
      ov: { fennec: { x: 0.45, y: 0.575, size: 0.43 }, dominus: { x: 0.45, y: 0.575, size: 0.41 } } }),
    newLayer('text', { x: 0.17, y: 0.2, size: 0.07, text: 'MYBAD ESPORT', color: '#ffffff', opacity: 0.95 }),
    newLayer('star', { face: 'top', x: 0.5, y: 0.25, size: 0.3, color: '#ffffff', glow: 1 }),
    newLayer('stripe', { face: 'top', x: 0.5, y: 0.5, rot: 90, len: 1, thick: 90, color: '#06143f', opacity: 0.8, glow: 0 }),
  ],
});
const BUILTIN = { nuit, azur };

// ------------------------------------------------------------------ enregistrement
let STORE = (() => { try { return { user: [], over: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { user: [], over: {} }; } })();
const write = () => { try { localStorage.setItem(KEY, JSON.stringify(STORE)); } catch (e) { console.error('Livrées : enregistrement impossible', e); } };
const REV = new Map(); let REVALL = 0;
const LISTEN = []; export const onLiveryChange = fn => LISTEN.push(fn);
const notify = () => LISTEN.forEach(f => { try { f(); } catch (e) { console.error(e); } });
const cloneJ = o => JSON.parse(JSON.stringify(o));
const CACHE = new Map();

export const isBuiltin = id => !!BUILTIN[id];
export const hasOverride = id => !!STORE.over[id];
export function getDef(id) {
  if (!id) return null;
  const u = STORE.user.find(x => x.id === id); if (u) return u.def;
  if (STORE.over[id]) return STORE.over[id];
  return BUILTIN[id] ? (BUILTIN[id]._c ||= BUILTIN[id]()) : null;
}
export const cloneDef = id => cloneJ(getDef(id) || nuit());
export const liveryKey = id => (id ? id + ':' + (REV.get(id) || 0) + ':' + REVALL : '');
export const liveryGloss = id => getDef(id)?.gloss;
export const liveryMetal = id => getDef(id)?.metal;
export const allLiveries = () => [
  ...Object.keys(BUILTIN).map(id => ({ id, name: getDef(id).name, builtin: true, modified: hasOverride(id) })),
  ...STORE.user.map(u => ({ id: u.id, name: u.def.name, builtin: false })),
];
export const liveriesList = () => [['', 'Peinture d\'origine'], ...allLiveries().map(l => [l.id, l.name])];

function dropTextures(id) { for (const k of [...CACHE.keys()]) if (k.startsWith(id + '|')) { const t = CACHE.get(k); t.side.dispose(); t.top.dispose(); CACHE.delete(k); } }
function bump(id) { REV.set(id, (REV.get(id) || 0) + 1); dropTextures(id); notify(); }
export function saveDef(id, def) {
  const u = STORE.user.find(x => x.id === id);
  if (u) u.def = cloneJ(def); else if (BUILTIN[id]) STORE.over[id] = cloneJ(def);
  write(); bump(id);
}
export function createLivery(name, from) {
  const id = 'u' + Date.now().toString(36), def = cloneJ(from || nuit()); def.name = name;
  STORE.user.push({ id, def }); write(); bump(id); return id;
}
export function renameLivery(id, name) { const d = cloneJ(getDef(id)); d.name = name; saveDef(id, d); }
export function deleteLivery(id) { STORE.user = STORE.user.filter(x => x.id !== id); write(); dropTextures(id); notify(); }
export function resetLivery(id) { delete STORE.over[id]; if (BUILTIN[id]) delete BUILTIN[id]._c; write(); bump(id); }
export const exportLiveries = () => JSON.stringify({ app: 'MyBad Creator', kind: 'liveries', version: 1, data: STORE }, null, 2);
export function importLiveries(text) {
  const j = JSON.parse(text);
  if (j?.kind !== 'liveries' || !j.data) throw new Error('Ce fichier n\'est pas une collection de livrées MyBad Creator.');
  (j.data.user || []).forEach(u => { STORE.user = STORE.user.filter(x => x.id !== u.id); STORE.user.push(u); });
  Object.assign(STORE.over, j.data.over || {});
  write(); REVALL++; CACHE.clear(); notify();
  return (j.data.user || []).length;
}

// ------------------------------------------------------------------ dessin
const IMGS = new Map();
function getImg(src) {
  let e = IMGS.get(src);
  if (!e) {
    e = { img: new Image(), ready: false }; IMGS.set(src, e);
    e.img.onload = () => { e.ready = true; REVALL++; CACHE.clear(); notify(); };
    e.img.src = src;
  }
  return e;
}
const val = (L, k, car) => L.ov?.[car]?.[k] ?? L[k];

function starPath(g, cx, cy, r, rot) {
  const k = 0.1; g.save(); g.translate(cx, cy); g.rotate(rot);
  g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * k, -r * k, r, 0); g.quadraticCurveTo(r * k, r * k, 0, r); g.quadraticCurveTo(-r * k, r * k, -r, 0); g.quadraticCurveTo(-r * k, -r * k, 0, -r); g.restore();
}
function drawLogoShape(g, cx, cy, width, rot, fill, withStar) {
  const sc = width / 1976;
  g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = fill;
  for (const p of TRACE.parts) {
    if (p.kind === 'star') continue;
    const path = new Path2D();
    p.pts.forEach(([x, y], i) => { const X = (x - 996) * sc, Y = (y - 1000) * sc; if (i) path.lineTo(X, Y); else path.moveTo(X, Y); });
    path.closePath(); g.fill(path);
  }
  if (withStar) {
    const b = TRACE.parts.find(p => p.kind === 'star').bbox, r = (b[3] - b[1]) / 2 * sc;
    g.save(); g.translate(((b[0] + b[2]) / 2 - 996) * sc, ((b[1] + b[3]) / 2 - 1000) * sc); starPath(g, 0, 0, r, 0); g.fillStyle = '#ffffff'; g.fill(); g.restore();
  }
  g.restore();
}
function drawLayer(g, L, car, W, H, unit) {
  const x = val(L, 'x', car) * W, y = val(L, 'y', car) * H, size = val(L, 'size', car) || 0, rot = (val(L, 'rot', car) || 0) * Math.PI / 180;
  const px = size * unit, glow = L.glow || 0;
  g.save(); g.globalAlpha = L.opacity ?? 1;
  if (glow > 0 && L.kind !== 'image') { g.shadowColor = L.color || '#8fdcff'; g.shadowBlur = Math.max(2, (L.kind === 'stripe' ? 18 : px * 0.12) * glow); }
  if (L.kind === 'stripe') {
    const len = (L.len || 1) * Math.max(W, H);
    g.translate(x, y); g.rotate(rot); g.strokeStyle = L.color; g.lineWidth = L.thick || 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
  } else if (L.kind === 'star') {
    starPath(g, x, y, px / 2, rot); g.fillStyle = L.color; g.fill(); if (glow > 0) g.fill();
  } else if (L.kind === 'text') {
    g.translate(x, y); g.rotate(rot); g.fillStyle = L.color; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = `${L.italic ? 'italic ' : ''}${L.weight || 800} ${Math.max(6, px)}px ${L.font || 'Montserrat'}, Arial, sans-serif`;
    g.fillText(L.text || '', 0, 0);
  } else if (L.kind === 'image') {
    const e = L.src ? getImg(L.src) : null;
    if (e?.ready) { const w = px, h = px * e.img.naturalHeight / e.img.naturalWidth; g.translate(x, y); g.rotate(rot); g.drawImage(e.img, -w / 2, -h / 2, w, h); }
  } else if (L.kind === 'logo') {
    const gr = g.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.5); gr.addColorStop(0, L.color); gr.addColorStop(1, L.color2 || L.color);
    drawLogoShape(g, x, y, px, rot, gr, !!L.star);
  }
  g.restore();
}
function paintFace(def, car, face, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  if (face === 'side') { gr.addColorStop(0, def.base[0]); gr.addColorStop(1, def.base[1]); } else { gr.addColorStop(0, def.base[1]); gr.addColorStop(1, def.base[0]); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (face === 'side' && def.glow?.amount > 0) {
    const gl = g.createLinearGradient(0, H, 0, H * 0.35), col = new THREE.Color(def.glow.color || '#3c96ff'), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    gl.addColorStop(0, `rgba(${rgb},${def.glow.amount})`); gl.addColorStop(0.5, `rgba(${rgb},${def.glow.amount * 0.24})`); gl.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
  }
  const unit = face === 'side' ? H : W;
  for (const L of def.layers || []) if ((L.face || 'side') === face && L.visible !== false) drawLayer(g, L, car, W, H, unit);
  return c;
}

function textures(id, car, dims) {
  const key = `${id}|${REV.get(id) || 0}|${car}|${REVALL}`;
  let t = CACHE.get(key);
  if (t) return t;
  const def = getDef(id);
  const mk = cv => { const x = new THREE.CanvasTexture(cv); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; return x; };
  const SW = Math.min(4096, Math.round(SH * dims.len / dims.hei)), TH = Math.min(4096, Math.round(TW * dims.len / dims.wid));
  t = { side: mk(paintFace(def, car, 'side', SW, SH)), top: mk(paintFace(def, car, 'top', TW, TH)) };
  CACHE.set(key, t);
  return t;
}

// Applique (ou retire) la livrée sur les matières « Body » d'un modèle de voiture.
export function applyLivery(inst, id, car) {
  const def = getDef(id);
  inst.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (!/body/i.test(m.name || '')) continue;
      const st = m.userData.livery ||= { tag: null };
      const tag = def ? liveryKey(id) + ':' + car : null;
      if (st.tag === tag) continue;
      st.tag = tag;
      if (!def) { m.onBeforeCompile = () => {}; delete m.customProgramCacheKey; m.needsUpdate = true; continue; }
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
      // axes de la carrosserie : le plus long = longueur, le plus court = hauteur
      const order = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a));
      const tx = textures(id, car, { len: size.getComponent(order[0]), wid: size.getComponent(order[1]), hei: size.getComponent(order[2]) });
      const unit = i => new THREE.Vector3().setComponent(i, 1);
      const U = { uMin: { value: bb.min.clone() }, uSize: { value: size.clone() }, uLen: { value: unit(order[0]) }, uWid: { value: unit(order[1]) }, uHei: { value: unit(order[2]) }, uSide: { value: tx.side }, uTop: { value: tx.top } };
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLvPos; varying vec3 vLvN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLvPos = position; vLvN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLvPos; varying vec3 vLvN; uniform vec3 uMin, uSize, uLen, uWid, uHei; uniform sampler2D uSide, uTop;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 p = (vLvPos - uMin) / uSize; vec3 n = normalize(vLvN);
            float u = dot(p, uLen), w = dot(p, uWid), h = dot(p, uHei);
            float sd = dot(n, uWid), up = dot(n, uHei);
            vec2 uvS = vec2(sd >= 0.0 ? u : 1.0 - u, h);
            vec4 s = texture2D(uSide, uvS);
            vec4 t = texture2D(uTop, vec2(w, u));
            float ws = smoothstep(0.30, 0.70, abs(sd));
            float wt = smoothstep(0.35, 0.80, up);
            vec3 col = diffuseColor.rgb;
            col = mix(col, s.rgb, ws * s.a);
            col = mix(col, t.rgb, wt * t.a);
            diffuseColor.rgb = col;
          }`);
      };
      m.customProgramCacheKey = () => 'livery-v2';
      m.needsUpdate = true;
    }
  });
}

// Brillance et effet métallisé de la carrosserie (0 = d'origine, 1 = vernis très brillant).
export function applyGloss(inst, gloss, metal) {
  const g = Math.max(0, Math.min(1, gloss || 0)), mt = Math.max(0, Math.min(1, metal ?? 0.45));
  inst.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (!/body|paint/i.test(m.name || '')) continue;
      const o0 = m.userData.gl0 ||= { r: m.roughness, mt: m.metalness, cc: m.clearcoat, ccr: m.clearcoatRoughness, ei: m.envMapIntensity };
      m.roughness = THREE.MathUtils.lerp(o0.r ?? 0.6, 0.16, g);
      m.metalness = THREE.MathUtils.lerp(o0.mt ?? 0, mt, g);
      if ('clearcoat' in m) { m.clearcoat = THREE.MathUtils.lerp(o0.cc ?? 0, 1, g); m.clearcoatRoughness = THREE.MathUtils.lerp(o0.ccr ?? 0.2, 0.03, g); }
      m.envMapIntensity = THREE.MathUtils.lerp(o0.ei ?? 1, 2.2, g);
    }
  });
}
