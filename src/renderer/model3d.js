// Calques « Modèle 3D » : rendu three.js de fichiers .glb/.gltf avec éclairage de scène.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { S, change } from './state.js';
import { section, range, toggle, select as sel, seg, colorCtl, pct, deg, icon, esc } from './ui.js';
import { color } from './engine/scene.js';
import { GAMES, gameItems } from './engine/games.js';
import { addLayer } from './editor.js';
import { applyPose, facingOf } from './pose3d.js';

let deps = {};
let renderer = null, loader = null, envTex = null;
const MODELS = new Map();     // url -> { status, gltf, error }
const INSTANCES = new Map();  // url|layerId -> { root, mixer, height, size }
const RENDERS = new Map();    // layerId -> { key, canvas }

export function initModels(d) { deps = d; }

function getLoader() {
  if (loader) return loader;
  loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath('vendor/draco/');
  loader.setDRACOLoader(draco);
  return loader;
}
function getRenderer() {
  if (renderer) return renderer;
  const cv = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  return renderer;
}

export function modelUrl(doc, ref) {
  if (!ref) return null;
  if (ref[0] === '@') { const item = doc.T[ref.slice(1)]; return item ? S.libraryModels.get(`g:${doc.game}:${item}`) || null : null; }
  if (ref.startsWith('g:')) return S.libraryModels.get(ref) || null;
  return null;
}
function load(url) {
  let m = MODELS.get(url);
  if (m) return m;
  m = { status: 'loading' };
  MODELS.set(url, m);
  m.promise = new Promise(res => {
    getLoader().load(url, gltf => { m.status = 'ready'; m.gltf = gltf; res(); deps.requestRender?.(); deps.actions?.scheduleThumbs?.(); },
      undefined, err => { m.status = 'error'; m.error = err; console.error('3D', url, err); deps.toast?.('Impossible de charger ce modèle 3D (format .glb ou .gltf attendu).', true); res(); });
  });
  return m;
}
export async function preloadModels(doc) {
  const urls = doc.layers.filter(L => L.type === 'model' && L.visible !== false).map(L => modelUrl(doc, L.model)).filter(Boolean);
  await Promise.all(urls.map(u => load(u).promise));
}

function instance(url, L, gltf) {
  // une seule instance par fichier : les rendus sont séquentiels, la pose est réappliquée à chaque fois
  const key = url;
  let inst = INSTANCES.get(key);
  if (inst) return inst;
  const root = gltf.scene;
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.side = THREE.FrontSide; } });
  // normalisation : posé au sol, centré, hauteur 1
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  root.position.set(-center.x, -box.min.y, -center.z);
  pivot.add(root);
  const scale = 1 / Math.max(size.y, 1e-6);
  pivot.scale.setScalar(scale);
  pivot.updateMatrixWorld(true);
  const face = facingOf(root);
  inst = { pivot, root, face, baseYaw: face ? Math.atan2(face.x, face.z) : 0, size: size.clone().multiplyScalar(scale), mixer: gltf.animations?.length ? new THREE.AnimationMixer(root) : null, clips: gltf.animations || [] };
  INSTANCES.set(key, inst);
  return inst;
}

function renderModel(L, w, h, theme, exporting) {
  const url = modelUrl(S.doc_override || S.doc, L.model);
  if (!url) return null;
  const m = load(url);
  if (m.status !== 'ready') return null;
  const maxPx = exporting ? 4096 : 1400;
  const k = Math.min(1, maxPx / Math.max(w, h));
  const pw = Math.max(16, Math.round(w * k)), ph = Math.max(16, Math.round(h * k));
  const params = JSON.stringify([url, pw, ph, L.envLight, L.frame, L.pose, L.rotY, L.camPitch, L.zoom3d, L.target, L.fov, L.anim, L.animTime, L.key, L.rim, L.fill, L.ambient, L.offsetX, theme.glow, theme.accent, theme.text]);
  const cached = RENDERS.get(L.id);
  if (cached && cached.key === params) return cached.canvas;

  const inst = instance(url, L, m.gltf);
  const r = getRenderer();
  r.setSize(pw, ph, false);
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = L.envLight ?? 0.45;
  scene.add(inst.pivot);
  inst.pivot.rotation.set(0, 0, 0);
  inst.pivot.position.set(0, 0, 0);
  inst.pivot.updateMatrixWorld(true);
  if (inst.mixer && inst.clips.length && (L.anim ?? 0) >= 0) {
    const clip = inst.clips[Math.min(inst.clips.length - 1, L.anim || 0)];
    inst.mixer.stopAllAction();
    const act = inst.mixer.clipAction(clip); act.play();
    inst.mixer.setTime((L.animTime || 0) * clip.duration);
  }
  const pz = L.pose || {};
  if (pz.on) applyPose(inst.root, { ...pz, forward: inst.face || undefined });
  else if (!inst.mixer) applyPose(inst.root, { mode: 'file' });
  inst.pivot.rotation.set(0, -inst.baseYaw + (L.rotY || 0) * Math.PI / 180, 0);
  inst.pivot.updateMatrixWorld(true);
  const col = c => new THREE.Color(color(c, theme) || '#ffffff');
  const amb = L.ambient || {}, key = L.key || {}, rim = L.rim || {}, fill = L.fill || {};
  scene.add(new THREE.HemisphereLight(col(amb.color || '$glow'), new THREE.Color('#05060c'), amb.intensity ?? 0.7));
  const kl = new THREE.DirectionalLight(col(key.color || '#ffffff'), key.intensity ?? 1.6);
  const ka = (key.angle ?? -35) * Math.PI / 180; kl.position.set(Math.sin(ka) * 3, 2.4, Math.cos(ka) * 3); scene.add(kl);
  const rl = new THREE.DirectionalLight(col(rim.color || '$glow'), rim.intensity ?? 4);
  const ra = (rim.angle ?? 150) * Math.PI / 180; rl.position.set(Math.sin(ra) * 3, 2.2, Math.cos(ra) * 3); scene.add(rl);
  const rl2 = new THREE.DirectionalLight(col(rim.color || '$glow'), (rim.intensity ?? 4) * 0.6);
  rl2.position.set(-Math.sin(ra) * 3, 1.8, Math.cos(ra) * 3); scene.add(rl2);
  if ((fill.intensity ?? 0.4) > 0) { const fl = new THREE.DirectionalLight(col(fill.color || '$accent'), fill.intensity ?? 0.4); fl.position.set(0, 0.3, 3); scene.add(fl); }

  const fov = L.fov || 28;
  const cam = new THREE.PerspectiveCamera(fov, pw / ph, 0.01, 100);
  const sz = inst.size;
  const targetY = sz.y * (L.target ?? 0.5);
  const fitH = sz.y / 2 / Math.tan(fov * Math.PI / 360);
  const fitW = Math.max(sz.x, sz.z) / 2 / Math.tan(fov * Math.PI / 360) / (pw / ph);
  const frameAll = L.frame ? L.frame === 'all' : (S.doc_override || S.doc).game === 'rl';
  const dist = (frameAll ? Math.max(fitH, fitW) : fitH) * 1.08 / (L.zoom3d || 1);
  const pitch = (L.camPitch ?? 6) * Math.PI / 180;
  cam.position.set((L.offsetX || 0) * sz.y, targetY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  cam.lookAt((L.offsetX || 0) * sz.y, targetY, 0);
  r.render(scene, cam);
  scene.remove(inst.pivot);

  const out = cached?.canvas || document.createElement('canvas');
  out.width = pw; out.height = ph;
  const c = out.getContext('2d'); c.clearRect(0, 0, pw, ph); c.drawImage(r.domElement, 0, 0);
  RENDERS.set(L.id, { key: params, canvas: out });
  return out;
}

// Fournit au moteur 2D la fonction de rendu des calques 3D.
export function modelEnv(doc, exporting) {
  return (L, b) => {
    S.doc_override = doc;
    try { return renderModel(L, b.w, b.h, doc.theme, exporting); } finally { S.doc_override = null; }
  };
}

export function newModelLayer() {
  const doc = S.doc, W = doc.W, H = doc.H;
  const firstModel = gameItems(doc.game, S.extraItems).find(i => S.libraryModels.has(`g:${doc.game}:${i.key}`));
  if (!firstModel) deps.toast?.('Ajoute d\'abord un modèle .glb dans la Bibliothèque (onglet Bibliothèque › bouton 3D).', true);
  const isCar = doc.game === 'rl';
  return {
    type: 'model', name: 'Modèle 3D', model: firstModel ? `g:${doc.game}:${firstModel.key}` : '@a1',
    x: W * (isCar ? 0.1 : 0.25), y: H * (isCar ? 0.35 : 0.2), w: W * (isCar ? 0.8 : 0.5), h: H * (isCar ? 0.35 : 0.65),
    rotY: isCar ? 35 : 15, camPitch: isCar ? 12 : 4, zoom3d: 1, target: 0.5, fov: 28, anim: 0, animTime: 0,
    key: { color: '#ffffff', intensity: 1.4, angle: -35 }, rim: { color: '$glow', intensity: 4, angle: 150 }, fill: { color: '$accent', intensity: 0.4 }, ambient: { color: '$glow', intensity: 0.6 },
    reflect: true, contact: true,
    fx: { glow: { on: true, color: '$glow', blur: 34, opacity: 0.45 } },
  };
}

export function modelProps(L) {
  const doc = S.doc, th = doc.theme;
  const items = gameItems(doc.game, S.extraItems);
  const opts = [
    ...Array.from({ length: GAMES[doc.game].players }, (_, i) => [`@a${i + 1}`, `Joueur ${i + 1} (${doc.T['p' + (i + 1)] || '—'})`]),
    ...items.map(i => [`g:${doc.game}:${i.key}`, i.name + (S.libraryModels.has(`g:${doc.game}:${i.key}`) ? '' : ' (pas de modèle)')]),
  ];
  const url = modelUrl(doc, L.model);
  const m = url ? MODELS.get(url) : null;
  const clips = m?.gltf?.animations || [];
  const status = !url ? '<p class="hint warn">Aucun modèle 3D pour ce choix. Importe un .glb dans la Bibliothèque.</p>' : m?.status === 'loading' ? '<p class="hint">Chargement du modèle…</p>' : m?.status === 'error' ? '<p class="hint warn">Ce fichier n\'a pas pu être lu.</p>' : '';
  let h = section('Modèle 3D', `${sel('model', 'Modèle', L.model, opts, { raw: true })}${status}
    ${seg('frame', L.frame || (doc.game === 'rl' ? 'all' : 'height'), [['height', 'Cadrer la hauteur'], ['all', 'Tout le modèle']], { small: true })}
    ${range('rotY', 'Rotation du modèle', L.rotY || 0, -180, 180, 1, deg)}
    ${range('camPitch', 'Angle de caméra', L.camPitch ?? 6, -20, 60, 1, deg)}
    ${range('zoom3d', 'Zoom', L.zoom3d || 1, 0.3, 4, 0.01, pct)}
    ${range('target', 'Hauteur visée', L.target ?? 0.5, 0, 1, 0.01, pct)}
    ${range('offsetX', 'Décalage caméra', L.offsetX || 0, -0.6, 0.6, 0.01, v => Math.round(v * 100))}
    ${range('fov', 'Focale (perspective)', L.fov || 28, 10, 70, 1, v => v + '°')}`);
  const pz = L.pose || {};
  h += section('Pose', (clips.length ? `${sel('anim', 'Animation', L.anim ?? 0, [[-1, 'Pose du fichier'], ...clips.map((c, i) => [i, c.name || `Animation ${i + 1}`])])}${(L.anim ?? 0) >= 0 ? range('animTime', 'Moment de l\'animation', L.animTime || 0, 0, 1, 0.001, pct) : ''}` : '<p class="hint">Ce modèle n\'a pas d\'animation : il garde la pose de son fichier.</p>')
    + toggle('pose.on', 'Ajuster la pose (expérimental)', pz.on)
    + (pz.on ? range('pose.armsDown', 'Bras abaissés', pz.armsDown ?? 72, 0, 90, 1, deg) + range('pose.armsForward', 'Bras vers l\'avant', pz.armsForward || 0, -40, 60, 1, deg) + range('pose.elbows', 'Coudes pliés', pz.elbows || 0, 0, 120, 1, deg) + range('pose.chest', 'Rotation du buste', pz.chest || 0, -45, 45, 1, deg) + range('pose.headTurn', 'Rotation de la tête', pz.headTurn || 0, -60, 60, 1, deg) + range('pose.headTilt', 'Inclinaison de la tête', pz.headTilt || 0, -30, 30, 1, deg) + '<p class="hint">Selon le squelette du modèle, certains réglages peuvent déformer les mains : reviens en arrière avec Ctrl+Z.</p>' : ''), clips.length > 0 || !!pz.on);
  h += section('Éclairage', `
    ${colorCtl('rim.color', 'Contre-jour', L.rim?.color || '$glow', th)}${range('rim.intensity', 'Intensité du contre-jour', L.rim?.intensity ?? 4, 0, 12, 0.1, v => v.toFixed(1))}${range('rim.angle', 'Direction du contre-jour', L.rim?.angle ?? 150, 90, 270, 1, deg)}
    ${colorCtl('key.color', 'Lumière principale', L.key?.color || '#ffffff', th)}${range('key.intensity', 'Intensité principale', L.key?.intensity ?? 1.4, 0, 6, 0.05, v => v.toFixed(2))}${range('key.angle', 'Direction principale', L.key?.angle ?? -35, -90, 90, 1, deg)}
    ${colorCtl('fill.color', 'Lumière de face', L.fill?.color || '$accent', th)}${range('fill.intensity', 'Intensité de face', L.fill?.intensity ?? 0.4, 0, 4, 0.05, v => v.toFixed(2))}
    ${range('envLight', 'Reflets (matières brillantes)', L.envLight ?? 0.45, 0, 2, 0.01, pct)}
    ${colorCtl('ambient.color', 'Ambiance', L.ambient?.color || '$glow', th)}${range('ambient.intensity', 'Intensité d\'ambiance', L.ambient?.intensity ?? 0.6, 0, 3, 0.05, v => v.toFixed(2))}
    <button class="mini-btn" data-act="lightPreset">${icon('refresh')} Éclairage façon affiche roster</button>`);
  h += section('Sol', `${toggle('reflect', 'Reflet au sol', L.reflect)}${toggle('contact', 'Ombre au sol', L.contact)}`);
  void esc;
  return h;
}
export function modelPropAction(act, L) {
  if (act === 'lightPreset' && L) {
    change(() => { L.key = { color: '#cfd8ff', intensity: 0.9, angle: -30 }; L.rim = { color: '$glow', intensity: 6, angle: 160 }; L.fill = { color: '$glow', intensity: 0.8 }; L.ambient = { color: '$glow', intensity: 0.9 }; }, { immediate: true });
    deps.actions?.renderProps?.();
  }
}
