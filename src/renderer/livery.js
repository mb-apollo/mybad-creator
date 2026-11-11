// Livrées des voitures Rocket League. Une livrée est une définition JSON (couleurs de base, lueur, calques : logo, image, texte, étoile, bande)
// dessinés sur trois textures (flanc gauche, flanc droit, dessus) projetées sur la carrosserie à partir de sa boîte englobante, avec un shader injecté dans la matière « Body »
// qui calcule aussi la couleur de la carrosserie (dégradé).
// Les livrées sont enregistrées dans le navigateur (localStorage « mbc.liveries »). Les livrées fournies, modifiables, sont « Heliance — Nuit » et « Azur »
// (ci-dessous) et celles de liveries-default.json : un export du créateur de livrées, dont les livrées deviennent des livrées fournies (même identifiant),
// dont la « Nuit » retouchée remplace celle du code, et dont la livrée active est posée d'office sur les nouvelles affiches.
import { versHeliance, texteHeliance } from './renom.js';
import * as THREE from 'three';
import TRACE from './assets/brand/logo-trace.json';
import FOURNIES from './liveries-default.json';

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
    text: { face: 'side', x: 0.2, y: 0.2, size: 0.07, rot: 0, color: '#ffffff', opacity: 1, glow: 0.3, text: 'HELIANCE', font: 'Montserrat', weight: 800, italic: true },
    stripe: { face: 'side', x: 0.5, y: 0.6, rot: -18, len: 1.2, thick: 6, color: '#8fdcff', opacity: 0.8, glow: 0.5 },
  }[kind];
  return { id: 'l' + Date.now().toString(36) + (++LN), kind, ...base, ...o };
};
const nuit = () => ({
  name: 'Heliance — Nuit', base: ['#070e30', '#03060f'], gloss: 0.7, metal: 0.45, glow: { color: '#3c96ff', amount: 0.38 }, zones: { chassis: '#0a1640' },
  layers: [
    newLayer('stripe', { x: 0.5, y: 0.55, rot: -18, len: 1.3, thick: 5, opacity: 0.75, glow: 0.6 }),
    newLayer('stripe', { x: 0.5, y: 0.66, rot: -18, len: 1.3, thick: 2.5, opacity: 0.5, glow: 0.4 }),
    newLayer('stripe', { x: 0.5, y: 0.965, rot: 0, len: 1.1, thick: 4, opacity: 0.8, glow: 0.5 }),
    ...[[0.2, 0.3, 0.018], [0.3, 0.52, 0.012], [0.74, 0.62, 0.014], [0.86, 0.3, 0.01], [0.62, 0.2, 0.009]].map(([x, y, r]) => newLayer('star', { x, y, size: r * 2, glow: 0.8 })),
    newLayer('logo', { x: 0.47, y: 0.575, size: 0.45, color: '#9db9dc', color2: '#5f8fc4', opacity: 0.88, glow: 0,
      ov: { octane: { x: 0.47, y: 0.575, size: 0.46 }, fennec: { x: 0.45, y: 0.575, size: 0.43 }, dominus: { x: 0.45, y: 0.575, size: 0.41 } } }),
    newLayer('text', { x: 0.17, y: 0.2, size: 0.07, text: 'HELIANCE ESPORT', color: '#9fc4e6', opacity: 0.9 }),
    newLayer('star', { face: 'top', x: 0.5, y: 0.25, size: 0.32, glow: 1 }),
    newLayer('stripe', { face: 'top', x: 0.461, y: 0.5, rot: 90, len: 1, thick: 12, opacity: 0.9, glow: 0.8 }),
    newLayer('stripe', { face: 'top', x: 0.539, y: 0.5, rot: 90, len: 1, thick: 12, opacity: 0.9, glow: 0.8 }),
  ],
});
const azur = () => ({
  name: 'Heliance — Azur', base: ['#2a6bff', '#0b3bc4'], gloss: 0.7, metal: 0.45, glow: { color: '#a8d4ff', amount: 0.3 }, zones: { chassis: '#164fd6' },
  layers: [
    newLayer('stripe', { x: 0.5, y: 0.5, rot: -16, len: 1.3, thick: 14, color: '#06143f', opacity: 0.85, glow: 0 }),
    newLayer('stripe', { x: 0.5, y: 0.42, rot: -16, len: 1.3, thick: 5, color: '#e9f6ff', opacity: 0.95, glow: 0.6 }),
    newLayer('stripe', { x: 0.5, y: 0.965, rot: 0, len: 1.1, thick: 5, color: '#e9f6ff', opacity: 0.9, glow: 0.4 }),
    newLayer('logo', { x: 0.47, y: 0.575, size: 0.45, color: '#ffffff', color2: '#cfeaff', opacity: 1, glow: 0.2,
      ov: { fennec: { x: 0.45, y: 0.575, size: 0.43 }, dominus: { x: 0.45, y: 0.575, size: 0.41 } } }),
    newLayer('text', { x: 0.17, y: 0.2, size: 0.07, text: 'HELIANCE ESPORT', color: '#ffffff', opacity: 0.95 }),
    newLayer('star', { face: 'top', x: 0.5, y: 0.25, size: 0.3, color: '#ffffff', glow: 1 }),
    newLayer('stripe', { face: 'top', x: 0.5, y: 0.5, rot: 90, len: 1, thick: 90, color: '#06143f', opacity: 0.8, glow: 0 }),
  ],
});
const F = FOURNIES?.data || {}, copie = o => JSON.parse(JSON.stringify(o));
const BUILTIN = { nuit: F.over?.nuit ? () => copie(F.over.nuit) : nuit, azur: F.over?.azur ? () => copie(F.over.azur) : azur, ...Object.fromEntries((F.user || []).map(u => [u.id, () => copie(u.def)])) };
const PAR_DEFAUT = F.active && BUILTIN[F.active] ? F.active : 'nuit';   // livrée posée d'office tant qu'on n'en a pas choisi

// ------------------------------------------------------------------ enregistrement
let STORE = (() => { try { return { user: [], over: {}, hidden: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { user: [], over: {}, hidden: [] }; } })();
const write = () => { try { localStorage.setItem(KEY, JSON.stringify(STORE)); } catch (e) { console.error('Livrées : enregistrement impossible', e); } };
// Livrées enregistrées avant le changement de nom : textes et noms « MyBad » → « Heliance » (une seule fois, marque STORE.renom)
if (!STORE.renom) {
  for (const d of [...STORE.user.map(u => u && u.def), ...Object.values(STORE.over || {})]) {
    if (!d || typeof d !== 'object') continue;
    versHeliance(d); delete d.renom;
    if (typeof d.name === 'string') d.name = texteHeliance(d.name);
  }
  STORE.renom = 1; write();
}
const REV = new Map(); let REVALL = 0;
const LISTEN = []; export const onLiveryChange = fn => LISTEN.push(fn);
const notify = () => LISTEN.forEach(f => { try { f(); } catch (e) { console.error(e); } });
const cloneJ = o => JSON.parse(JSON.stringify(o));
const CACHE = new Map();

const isUser = id => STORE.user.some(x => x.id === id);   // une livrée de l'utilisateur qui porte l'identifiant d'une livrée fournie la remplace (celui qui a fourni la sienne)
export const isBuiltin = id => !!BUILTIN[id] && !isUser(id);
export const hasOverride = id => !!STORE.over[id];
export function getDef(id) {
  if (!id) return null;
  const u = STORE.user.find(x => x.id === id); if (u) return u.def;
  if (STORE.hidden.includes(id)) return null;
  if (STORE.over[id]) return STORE.over[id];
  return BUILTIN[id] ? (BUILTIN[id]._c ||= BUILTIN[id]()) : null;
}
export const cloneDef = id => cloneJ(getDef(id) || nuit());
export const liveryKey = id => (id ? id + ':' + (REV.get(id) || 0) + ':' + REVALL : '');
export const liveryGloss = id => getDef(id)?.gloss;
export const liveryMetal = id => getDef(id)?.metal;
export const liveryZone = (id, k) => getDef(id)?.zones?.[k] || null;
export const liveryLamp = (id, k) => getDef(id)?.lamps?.[k] ?? null;
export const allLiveries = () => [
  ...Object.keys(BUILTIN).filter(id => !STORE.hidden.includes(id) && !isUser(id)).map(id => ({ id, name: getDef(id).name, builtin: true, modified: hasOverride(id) })),
  ...STORE.user.map(u => ({ id: u.id, name: u.def.name, builtin: false })),
];
export const hiddenCount = () => STORE.hidden.length;
export function restoreBuiltins() { STORE.hidden = []; write(); REVALL++; notify(); }
// Livrée posée d'office sur les voitures des nouvelles affiches (celle qu'on a « enregistrée »), celle du fichier fourni tant qu'on n'a rien choisi.
export const defaultLivery = () => { const a = STORE.active; return a === '' ? '' : (a && getDef(a) && !STORE.hidden.includes(a) ? a : (STORE.hidden.includes(PAR_DEFAUT) ? '' : PAR_DEFAUT)); };
export function setDefaultLivery(id) { STORE.active = id; write(); }
// Livrée réservée à une voiture (« Octane uniquement ») : sur les autres voitures, la peinture d'origine reste.
export const liveryOnly = id => getDef(id)?.only || '';
export const liveriesList = () => [['', 'Peinture d\'origine'], ...allLiveries().map(l => [l.id, l.name])];

const dispose = t => new Set(Object.values(t)).forEach(x => x.dispose());
function dropTextures(id) { for (const k of [...CACHE.keys()]) if (k.startsWith(id + '|')) { dispose(CACHE.get(k)); CACHE.delete(k); } }
function dropAll() { for (const t of CACHE.values()) dispose(t); CACHE.clear(); }
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
export function deleteLivery(id) {
  if (isUser(id)) STORE.user = STORE.user.filter(x => x.id !== id);
  else if (BUILTIN[id]) { if (!STORE.hidden.includes(id)) STORE.hidden.push(id); delete STORE.over[id]; delete BUILTIN[id]._c; }
  if (STORE.active === id) delete STORE.active;
  write(); dropTextures(id); REVALL++; notify();
}
export function resetLivery(id) { delete STORE.over[id]; if (BUILTIN[id]) delete BUILTIN[id]._c; write(); bump(id); }
export const exportLiveries = () => JSON.stringify({ app: 'Heliance Creator', kind: 'liveries', version: 1, data: STORE }, null, 2);
export function importLiveries(text) {
  const j0 = (() => { try { return JSON.parse(text); } catch { return null; } })(); if (j0?.data?.hidden) STORE.hidden = STORE.hidden.filter(h => j0.data.hidden.includes(h));
  const j = JSON.parse(text);
  if (j?.kind !== 'liveries' || !j.data) throw new Error('Ce fichier n\'est pas une collection de livrées Heliance Creator.');
  (j.data.user || []).forEach(u => { STORE.user = STORE.user.filter(x => x.id !== u.id); STORE.user.push(u); });
  Object.assign(STORE.over, j.data.over || {});
  write(); REVALL++; dropAll(); notify();
  return (j.data.user || []).length;
}


// ------------------------------------------------------------------ dessin
const IMGS = new Map();
function getImg(src) {
  let e = IMGS.get(src);
  if (!e) {
    e = { img: new Image(), ready: false }; IMGS.set(src, e);
    e.img.onload = () => { e.ready = true; REVALL++; dropAll(); notify(); };
    e.img.src = src;
  }
  return e;
}
const val = (L, k, car) => L.ov?.[car]?.[k] ?? L[k];

// Faces d'un calque : 'side' = les deux flancs, 'left' / 'right' = un seul flanc, 'top' = dessus (toit et capot).
// Un flanc se lit toujours de l'extérieur : l'avant de la voiture est à droite sur le flanc droit, à gauche sur le flanc gauche.
// Sur les deux flancs, « mirror » pose le calque au même endroit de la voiture des deux côtés (sinon : même place dans l'image, donc
// à l'arrière d'un côté et à l'avant de l'autre). Les réglages x, y et rot d'un calque sont ceux du flanc droit.
export const onFlank = (L, flank) => { const f = L.face || 'side'; return f === 'side' || f === flank; };
export const isMirrored = (L, flank) => flank === 'left' && !!L.mirror && (L.face || 'side') === 'side';

const ASPECT = new Map();   // voiture -> proportions des textures, relevées sur la carrosserie (longueur / hauteur, longueur / largeur)
export const faceAspect = (car, face) => { const a = ASPECT.get(car) || { side: 3, top: 2 }; return face === 'top' ? { ax: 1, ay: a.top } : { ax: a.side, ay: 1 }; };

// Boîte d'un calque autour de son point d'ancrage, dans l'unité de sa texture (hauteur du flanc, largeur du dessus) : largeur, hauteur et
// décalage du centre (le texte est ancré à gauche, le logo sans étoile est décentré). Sert au miroir, au retournement et aux poignées.
const LOGO = { h: [0.723, 0.905], cy: [0.086, -0.005] };   // sans étoile, avec étoile (tracé de 1976 de large, centré en 996 × 1000)
const fontOf = (L, px) => `${L.italic ? 'italic ' : ''}${L.weight || 800} ${px}px ${L.font || 'Montserrat'}, Arial, sans-serif`;
let MESURE = null;
export function layerBox(L, car, face = L.face || 'side') {
  const size = val(L, 'size', car) || 0, top = face === 'top', asp = faceAspect(car, top ? 'top' : 'side');
  if (L.kind === 'stripe') return { w: (L.len || 1) * Math.max(asp.ax, asp.ay), h: (L.thick || 4) / (top ? TW : SH), ox: 0, oy: 0 };
  if (L.kind === 'text') { MESURE ||= document.createElement('canvas').getContext('2d'); MESURE.font = fontOf(L, 100); const w = MESURE.measureText(L.text || '').width / 100 * size; return { w, h: size * 1.1, ox: w / 2, oy: 0 }; }
  if (L.kind === 'image') { const e = L.src ? getImg(L.src) : null; return { w: size, h: size * (e?.ready ? e.img.naturalHeight / e.img.naturalWidth : 1), ox: 0, oy: 0 }; }
  if (L.kind === 'logo') { const s = L.star ? 1 : 0; return { w: size, h: size * LOGO.h[s], ox: 0, oy: size * LOGO.cy[s] }; }
  return { w: size, h: size, ox: 0, oy: 0 };
}
// Centre de la boîte d'un calque posé en p = { x, y, rot } (positions de 0 à 1 dans la texture).
export function boxCenter(p, box, asp) {
  const a = p.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: p.x + (c * box.ox - s * box.oy) / asp.ax, y: p.y + (s * box.ox + c * box.oy) / asp.ay };
}
// Ancrage d'un calque dont le centre de la boîte est en c, pour une rotation donnée (l'inverse de boxCenter).
export function anchorOf(c, rot, box, asp) {
  const a = rot * Math.PI / 180, co = Math.cos(a), s = Math.sin(a);
  return { x: c.x - (co * box.ox - s * box.oy) / asp.ax, y: c.y - (s * box.ox + co * box.oy) / asp.ay, rot };
}
// Miroir d'un flanc à l'autre : la boîte passe au même endroit de la voiture, la rotation s'inverse, le contenu reste lisible. Appliqué deux fois, il rend la position de départ.
export function mirrorPos(p, box, asp) { const c = boxCenter(p, box, asp); return anchorOf({ x: 1 - c.x, y: c.y }, -p.rot, box, asp); }
// Position d'un calque sur une face donnée ('left', 'right' ou 'top').
export function placed(L, car, target, box = layerBox(L, car, target === 'top' ? 'top' : 'side')) {
  const p = { x: val(L, 'x', car), y: val(L, 'y', car), rot: val(L, 'rot', car) || 0 };
  return isMirrored(L, target) ? mirrorPos(p, box, faceAspect(car, 'side')) : p;
}

// Livrées d'avant la séparation des flancs (sans « fmt ») : leur dessus était dessiné retourné, un texte s'y lisait à l'envers. Elles sont dessinées
// telles quelles (calques du dessus retournés au vol) ; le créateur de livrées les met au format actuel en les ouvrant, sans changer leur aspect.
export function upgradeDef(def) {
  if (def.fmt >= 2) return def;
  for (const L of def.layers || []) {
    if (L.face !== 'top') continue;
    const conv = car => mirrorPos({ x: val(L, 'x', car), y: val(L, 'y', car), rot: val(L, 'rot', car) || 0 }, layerBox(L, car, 'top'), faceAspect(car, 'top'));
    const per = Object.keys(L.ov || {}).filter(c => ['x', 'y', 'rot'].some(k => L.ov[c][k] != null)).map(c => [c, conv(c)]), b = conv('');
    L.x = b.x; L.y = b.y; L.rot = b.rot;
    for (const [c, q] of per) Object.assign(L.ov[c], q);
  }
  def.fmt = 2;
  return def;
}

function starPath(g, cx, cy, r, rot) {
  const k = 0.1; g.save(); g.translate(cx, cy); g.rotate(rot);
  g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * k, -r * k, r, 0); g.quadraticCurveTo(r * k, r * k, 0, r); g.quadraticCurveTo(-r * k, r * k, -r, 0); g.quadraticCurveTo(-r * k, -r * k, 0, -r); g.restore();
}
function drawLogoShape(g, width, fill, withStar) {
  const sc = width / 1976;
  g.fillStyle = fill;
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
}
// Dessine un calque à la position p ; le repère est posé sur son ancrage et tourné, puis retourné autour du centre de sa boîte si demandé.
function drawLayer(g, L, car, W, H, unit, p, box) {
  const px = (val(L, 'size', car) || 0) * unit, glow = L.glow || 0;
  g.save(); g.globalAlpha = L.opacity ?? 1;
  if (glow > 0 && L.kind !== 'image') { g.shadowColor = L.color || '#8fdcff'; g.shadowBlur = Math.max(2, (L.kind === 'stripe' ? 18 : px * 0.12) * glow); }
  g.translate(p.x * W, p.y * H); g.rotate(p.rot * Math.PI / 180);
  if (L.flipX || L.flipY) { const bx = box.ox * unit, by = box.oy * unit; g.translate(bx, by); g.scale(L.flipX ? -1 : 1, L.flipY ? -1 : 1); g.translate(-bx, -by); }
  if (L.kind === 'stripe') {
    const len = (L.len || 1) * Math.max(W, H);
    g.strokeStyle = L.color; g.lineWidth = L.thick || 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
  } else if (L.kind === 'star') {
    starPath(g, 0, 0, px / 2, 0); g.fillStyle = L.color; g.fill(); if (glow > 0) g.fill();
  } else if (L.kind === 'text') {
    g.fillStyle = L.color; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = fontOf(L, Math.max(6, px));
    g.fillText(L.text || '', 0, 0);
  } else if (L.kind === 'image') {
    const e = L.src ? getImg(L.src) : null;
    if (e?.ready) { const w = px, h = px * e.img.naturalHeight / e.img.naturalWidth; g.drawImage(e.img, -w / 2, -h / 2, w, h); }
  } else if (L.kind === 'logo') {
    const gr = g.createLinearGradient(0, -px * 0.5, 0, px * 0.5); gr.addColorStop(0, L.color); gr.addColorStop(1, L.color2 || L.color);
    drawLogoShape(g, px, gr, !!L.star);
  }
  g.restore();
}
// Calques d'une face ('left', 'right' ou 'top') sur fond transparent : la couleur de la carrosserie est calculée par le shader.
function paintLayers(def, car, target, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const top = target === 'top', unit = top ? W : H;
  for (const L of def.layers || []) {
    if (L.visible === false || (top ? L.face !== 'top' : !onFlank(L, target))) continue;
    const box = layerBox(L, car, top ? 'top' : 'side'), p = placed(L, car, target, box);
    drawLayer(g, L, car, W, H, unit, top && !(def.fmt >= 2) ? mirrorPos(p, box, faceAspect(car, 'top')) : p, box);
  }
  return c;
}

// Dégradé de la carrosserie, défini sur la voiture vue de profil (il suit la carrosserie : les deux flancs, le toit et le capot le reçoivent au même endroit).
// type : 'lin' (angle : 0 = de haut en bas, 90 = de l'arrière vers l'avant), 'rad' (centre cx, cy et taille) ou 'flat' (couleur unie) ;
// stops : 2 à 6 couleurs avec leur position ; shift : décalage ; size : étendue ; hard : bandes nettes au lieu d'un fondu.
// Sans « grad », la livrée garde ses deux couleurs d'origine (haut, bas), et son dessus reste dégradé de l'avant vers l'arrière.
const hex6 = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000');
export function gradOf(def) {
  const g = def.grad, b = def.base || ['#000000', '#000000'];
  if (!g) return { type: 'lin', angle: 0, shift: 0, size: 1, cx: 0.5, cy: 0.5, hard: false, stops: [{ c: b[0], p: 0 }, { c: b[1], p: 1 }], legacy: true };
  return { type: g.type || 'lin', angle: g.angle ?? 0, shift: g.shift ?? 0, size: g.size || 1, cx: g.cx ?? 0.5, cy: g.cy ?? 0.5, hard: !!g.hard,
    stops: g.stops?.length ? g.stops : [{ c: b[0], p: 0 }, { c: b[1], p: 1 }] };
}
function rampCanvas(def) {
  const G = gradOf(def), c = document.createElement('canvas'); c.width = 256; c.height = 1; const g = c.getContext('2d');
  const st = [...G.stops].map(s => ({ c: hex6(s.c), p: Math.max(0, Math.min(1, +s.p || 0)) })).sort((a, b) => a.p - b.p);
  if (G.type === 'flat' || st.length < 2) { g.fillStyle = st[0]?.c || '#000000'; g.fillRect(0, 0, 256, 1); return c; }
  if (G.hard) { st.forEach((s, i) => { const x0 = i ? Math.round((s.p + st[i - 1].p) / 2 * 256) : 0; g.fillStyle = s.c; g.fillRect(x0, 0, 256 - x0, 1); }); return c; }
  const gr = g.createLinearGradient(0, 0, 256, 0); st.forEach(s => gr.addColorStop(s.p, s.c));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 1);
  return c;
}
// Coefficients du dégradé pour une carrosserie de proportion A (longueur / hauteur) : voir le shader.
function gradK(G, A) {
  if (G.type === 'rad') return [1, G.cx, G.cy, A, Math.max(0.02, G.size * A / 2)];
  const a = G.angle * Math.PI / 180, dx = Math.sin(a), dy = Math.cos(a), S = (Math.abs(dx) * A + Math.abs(dy)) * G.size;
  return [0, A * dx / S, dy / S, 0.5 - (A / 2 * dx + 0.5 * dy) / S - G.shift / G.size, 0];
}
// Couleur du dégradé en un point de la voiture vue de profil (u : de l'arrière à l'avant, h : de bas en haut), pour l'aperçu du panneau.
export function gradT(G, A, u, h) {
  const k = gradK(G, A);
  return Math.max(0, Math.min(1, k[0] ? Math.hypot((u - k[1]) * k[3], 1 - h - k[2]) / k[4] : u * k[1] + (1 - h) * k[2] + k[3]));
}
export const gradRamp = def => rampCanvas(def);
const rgb01 = c => { const h = new THREE.Color(c || '#000000').getHexString(); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };

function textures(id, car, dims) {
  const key = `${id}|${REV.get(id) || 0}|${car}|${REVALL}`;
  let t = CACHE.get(key);
  if (t) return t;
  const def = getDef(id);
  const mk = cv => { const x = new THREE.CanvasTexture(cv); x.colorSpace = THREE.NoColorSpace; x.premultiplyAlpha = true; x.anisotropy = 8; return x; };   // prémultipliées : pas de liseré sombre au bord des calques
  const SW = Math.min(4096, Math.round(SH * dims.len / dims.hei)), TH = Math.min(4096, Math.round(TW * dims.len / dims.wid));
  const two = (def.layers || []).some(L => L.visible !== false && (L.face === 'left' || L.face === 'right' || isMirrored(L, 'left')));
  const right = mk(paintLayers(def, car, 'right', SW, SH));
  const ramp = new THREE.CanvasTexture(rampCanvas(def)); ramp.colorSpace = THREE.NoColorSpace; ramp.generateMipmaps = false; ramp.minFilter = THREE.LinearFilter;
  t = { right, left: two ? mk(paintLayers(def, car, 'left', SW, SH)) : right, top: mk(paintLayers(def, car, 'top', TW, TH)), ramp };
  CACHE.set(key, t);
  return t;
}

// Carrosserie : boîte englobante, axes (le plus long = longueur, le plus court = hauteur) et côté du flanc gauche.
export function bodyDims(mesh) {
  let d = mesh.userData.lvDims;
  if (!d) {
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
    const order = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a));
    const e = i => new THREE.Vector3().setComponent(i, 1);
    mesh.updateWorldMatrix(true, false);
    // gauche = haut × avant ; un retournement dans la hiérarchie du modèle inverse le résultat
    const chir = e(order[2]).cross(e(order[0])).dot(e(order[1])) * mesh.matrixWorld.determinant() >= 0 ? 1 : -1;
    d = mesh.userData.lvDims = { bb, size, order, chir, len: size.getComponent(order[0]), wid: size.getComponent(order[1]), hei: size.getComponent(order[2]) };
  }
  return d;
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
      if (!def) { if (m.userData.livU) m.userData.livU.uLiv.value = 0; continue; }
      const d = bodyDims(o), unit = i => new THREE.Vector3().setComponent(i, 1);
      ASPECT.set(car, { side: d.len / d.hei, top: d.len / d.wid });
      const tx = textures(id, car, d), G = gradOf(def), k = gradK(G, d.len / d.hei);
      const first = !m.userData.livU;
      const U = m.userData.livU ||= { uLiv: { value: 1 }, uMin: { value: d.bb.min.clone() }, uSize: { value: d.size.clone() }, uLen: { value: unit(d.order[0]) }, uWid: { value: unit(d.order[1]) }, uHei: { value: unit(d.order[2]) }, uChir: { value: d.chir },
        uSideL: { value: tx.left }, uSideR: { value: tx.right }, uTop: { value: tx.top }, uRamp: { value: tx.ramp }, uGT: { value: 0 }, uGK: { value: new THREE.Vector4() }, uGTop: { value: 0 }, uGlow: { value: new THREE.Vector4() }, uCh: { value: new THREE.Color() } };
      U.uLiv.value = 1; U.uSideL.value = tx.left; U.uSideR.value = tx.right; U.uTop.value = tx.top; U.uRamp.value = tx.ramp;
      U.uGT.value = k[0]; U.uGK.value.set(k[1], k[2], k[3], k[4]); U.uGTop.value = G.legacy ? 1 : 0;
      U.uGlow.value.set(...rgb01(def.glow?.color || '#3c96ff'), Math.max(0, def.glow?.amount || 0));
      U.uCh.value.set(def.zones?.chassis || def.base[1]);
      if (!first) continue;
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLvPos; varying vec3 vLvN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLvPos = position; vLvN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vLvPos; varying vec3 vLvN; uniform float uLiv, uChir, uGT, uGTop; uniform vec3 uMin, uSize, uLen, uWid, uHei, uCh; uniform vec4 uGK, uGlow; uniform sampler2D uSideL, uSideR, uTop, uRamp;
          vec3 lvLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          if (uLiv > 0.5) {
            vec3 p = (vLvPos - uMin) / uSize; vec3 n = normalize(vLvN);
            float u = dot(p, uLen), w = dot(p, uWid), h = dot(p, uHei);
            float sd = dot(n, uWid) * uChir, up = dot(n, uHei);   // sd > 0 : flanc gauche
            float ws = smoothstep(0.30, 0.70, abs(sd));
            float wt = smoothstep(0.35, 0.80, up);
            // couleur de la carrosserie : dégradé vu de profil (linéaire ou radial), lu dans une rampe de couleurs
            float gt = uGT > 0.5 ? length(vec2((u - uGK.x) * uGK.z, 1.0 - h - uGK.y)) / uGK.w : dot(vec2(u, 1.0 - h), uGK.xy) + uGK.z;
            vec3 base = texture2D(uRamp, vec2(clamp(gt, 0.0, 1.0), 0.5)).rgb;
            // flanc : lueur du bas de caisse puis calques (un dessin par flanc, lu de l'extérieur), composés en sRGB comme sur une image
            float gl = clamp(h / 0.65, 0.0, 1.0);
            vec3 cs = mix(base, uGlow.rgb, uGlow.a * (gl < 0.5 ? mix(1.0, 0.24, gl * 2.0) : mix(0.24, 0.0, gl * 2.0 - 1.0)));
            vec4 sl = texture2D(uSideL, vec2(1.0 - u, h)), sr = texture2D(uSideR, vec2(u, h));
            vec4 s = sd >= 0.0 ? sl : sr;
            cs = cs * (1.0 - s.a) + s.rgb;
            // dessus (livrées d'avant le dégradé libre : dégradé de l'avant vers l'arrière)
            vec3 ct = texture2D(uRamp, vec2(clamp(mix(gt, u, uGTop), 0.0, 1.0), 0.5)).rgb;
            vec4 t = texture2D(uTop, vec2(uChir > 0.0 ? 1.0 - w : w, u));
            ct = ct * (1.0 - t.a) + t.rgb;
            vec3 col = mix(mix(lvLin(base), lvLin(cs), ws), lvLin(ct), wt);
            // pièces vues de face, de dos ou du dessous (arches, pare-chocs) et aileron : couleur de châssis
            float nei = smoothstep(0.35, 0.2, abs(sd)) * smoothstep(0.35, 0.2, abs(up));
            float under = smoothstep(-0.4, -0.7, up);
            float wing = smoothstep(0.15, 0.10, u) * smoothstep(0.66, 0.74, h);
            col = mix(col, uCh, max(max(nei, under), wing));
            diffuseColor.rgb = col;
          }`);
      };
      m.customProgramCacheKey = () => 'livery-v8';
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

// Pneus et vitres : couleur de la livrée (vide = d'origine).
export function applyZones(inst, id) {
  const z = getDef(id)?.zones || {};
  inst.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const n = m.name || '', key = /tread/i.test(n) ? 'tires' : /window/i.test(n) ? 'glass' : null;
      if (!key || !m.color) continue;
      const o0 = m.userData.z0 ||= { c: m.color.clone() };
      if (z[key]) m.color.set(z[key]); else m.color.copy(o0.c);
    }
  });
}

// Point d'une carrosserie touché par un rayon → face (dessus, ou flanc gauche / droit) et position dans sa texture (0..1) ; sert à déplacer les calques à la souris.
export function surfaceAt(mesh, pointWorld, normalLocal) {
  const d = bodyDims(mesh), [iL, iW, iH] = d.order;
  const p = mesh.worldToLocal(pointWorld.clone()).sub(d.bb.min).divide(d.size);
  const u = p.getComponent(iL), w = p.getComponent(iW), h = p.getComponent(iH);
  const sd = normalLocal.getComponent(iW) * d.chir, up = normalLocal.getComponent(iH);
  if (up > 0.55) return { face: 'top', x: d.chir > 0 ? 1 - w : w, y: 1 - u, ax: 1, ay: d.len / d.wid };
  return { face: 'side', flank: sd >= 0 ? 'left' : 'right', x: sd >= 0 ? 1 - u : u, y: 1 - h, ax: d.len / d.hei, ay: 1 };
}

// Relief de la voiture, relevé une fois sur ses triangles : pour chaque case des deux flancs et du dessus, la surface la plus à l'extérieur
// (celle qu'on voit de ce côté), toutes pièces confondues — sous un pare-brise, la carrosserie seule donnerait le plancher de l'habitacle.
// Sert au chemin inverse de surfaceAt : retrouver le point de la voiture qui porte une position de texture (cadre et poignées du calque sélectionné).
const NU = 96, NV = 40;
function relief(mesh, pieces = []) {
  if (mesh.userData.lvRelief) return mesh.userData.lvRelief;
  const d = bodyDims(mesh), [iL, iW, iH] = d.order;
  const plus = new Float32Array(NU * NV).fill(-1), minus = new Float32Array(NU * NV).fill(-1), top = new Float32Array(NU * NV).fill(-1);
  // remplit les cases dont le centre tombe dans le triangle (x vers les colonnes, y vers les lignes) avec la valeur interpolée, en gardant la plus grande
  const tri = (g, x0, y0, v0, x1, y1, v1, x2, y2, v2) => {
    const X0 = x0 * NU - 0.5, Y0 = y0 * NV - 0.5, X1 = x1 * NU - 0.5, Y1 = y1 * NV - 0.5, X2 = x2 * NU - 0.5, Y2 = y2 * NV - 0.5;
    const den = (Y1 - Y2) * (X0 - X2) + (X2 - X1) * (Y0 - Y2); if (Math.abs(den) < 1e-9) return;
    const i0 = Math.max(0, Math.ceil(Math.min(X0, X1, X2))), i1 = Math.min(NU - 1, Math.floor(Math.max(X0, X1, X2)));
    const j0 = Math.max(0, Math.ceil(Math.min(Y0, Y1, Y2))), j1 = Math.min(NV - 1, Math.floor(Math.max(Y0, Y1, Y2)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = ((Y1 - Y2) * (i - X2) + (X2 - X1) * (j - Y2)) / den, b = ((Y2 - Y0) * (i - X2) + (X0 - X2) * (j - Y2)) / den, c = 1 - a - b;
      if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
      const val = a * v0 + b * v1 + c * v2, k = j * NU + i; if (val > g[k]) g[k] = val;
    }
  };
  mesh.updateWorldMatrix(true, false);
  const inv = mesh.matrixWorld.clone().invert(), v = new THREE.Vector3(), M = new THREE.Matrix4();
  for (const o of new Set([mesh, ...pieces])) {
    const pos = o.geometry?.attributes?.position, idx = o.geometry?.index; if (!pos || o.isSkinnedMesh) continue;
    o.updateWorldMatrix(true, false); M.multiplyMatrices(inv, o.matrixWorld);   // pièce → repère de la carrosserie
    const P = new Float32Array(pos.count * 3);   // u (longueur), w (largeur), h (hauteur) de chaque sommet, de 0 à 1 sur la carrosserie
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (o !== mesh) v.applyMatrix4(M); v.sub(d.bb.min).divide(d.size); P[i * 3] = v.getComponent(iL); P[i * 3 + 1] = v.getComponent(iW); P[i * 3 + 2] = v.getComponent(iH); }
    const nt = Math.floor((idx ? idx.count : pos.count) / 3);
    for (let t = 0; t < nt; t++) {
      const a = (idx ? idx.getX(t * 3) : t * 3) * 3, b = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) * 3, c = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) * 3;
      tri(top, P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
      const w = (P[a + 1] + P[b + 1] + P[c + 1]) / 3;   // chaque flanc ne retient que les triangles de sa moitié de voiture
      if (w > 0.5) tri(plus, P[a], P[a + 2], P[a + 1], P[b], P[b + 2], P[b + 1], P[c], P[c + 2], P[c + 1]);
      else tri(minus, P[a], P[a + 2], 1 - P[a + 1], P[b], P[b + 2], 1 - P[b + 1], P[c], P[c + 2], 1 - P[c + 1]);
    }
  }
  const voisins = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const g of [plus, minus, top]) {
    for (let pass = 0; pass < 64; pass++) {   // cases sans surface (vitres, arches de roue, bords) : valeur des voisines
      let trous = 0; const n = g.slice();
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const k = j * NU + i; if (g[k] >= 0) continue;
        let sum = 0, c = 0;
        for (const [di, dj] of voisins) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < NU && y < NV && g[y * NU + x] >= 0) { sum += g[y * NU + x]; c++; } }
        if (c) n[k] = sum / c; else trous++;
      }
      g.set(n); if (!trous) break;
    }
    for (let k = 0; k < g.length; k++) g[k] = g[k] < 0 ? 1 : Math.min(g[k], 1.05);
  }
  return (mesh.userData.lvRelief = { plus, minus, top });
}
const lire = (g, a, b) => {   // lecture adoucie entre quatre cases
  const x = Math.max(0, Math.min(NU - 1, a * NU - 0.5)), y = Math.max(0, Math.min(NV - 1, b * NV - 0.5)), i = Math.min(NU - 2, Math.floor(x)), j = Math.min(NV - 2, Math.floor(y)), fx = x - i, fy = y - j;
  return (g[j * NU + i] * (1 - fx) + g[j * NU + i + 1] * fx) * (1 - fy) + (g[(j + 1) * NU + i] * (1 - fx) + g[(j + 1) * NU + i + 1] * fx) * fy;
};
// Point de la voiture (dans le monde) qui porte la position (x, y) de la texture d'une face ('left', 'right' ou 'top'), et direction vers l'extérieur.
// « pieces » : les autres maillages de la voiture (vitres, roues…), pour le relief.
export function surfacePoint(mesh, face, x, y, pieces) {
  const d = bodyDims(mesh), r = relief(mesh, pieces), [iL, iW, iH] = d.order, p = new THREE.Vector3(), n = new THREE.Vector3();
  if (face === 'top') {
    const w = d.chir > 0 ? 1 - x : x, u = 1 - y;
    p.setComponent(iL, u); p.setComponent(iW, w); p.setComponent(iH, lire(r.top, u, w)); n.setComponent(iH, 1);
  } else {
    const left = face === 'left', u = left ? 1 - x : x, h = 1 - y, plus = left === (d.chir > 0), out = lire(plus ? r.plus : r.minus, u, h);
    p.setComponent(iL, u); p.setComponent(iH, h); p.setComponent(iW, plus ? out : 1 - out); n.setComponent(iW, plus ? 1 : -1);
  }
  mesh.updateWorldMatrix(true, false);
  return { point: mesh.localToWorld(p.multiply(d.size).add(d.bb.min)), normal: n.transformDirection(mesh.matrixWorld) };
}
