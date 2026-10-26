// Calques « Modèle 3D » : rendu three.js de fichiers .glb/.gltf avec éclairage de scène.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { S, change } from './state.js';
import { section, range, toggle, select as sel, seg, colorCtl, pct, deg, icon, esc, getPath, setPath } from './ui.js';
import { color } from './engine/scene.js';
import { GAMES, gameItems } from './engine/games.js';
import { sceneDefaults } from './engine/templates.js';
import { addLayer } from './editor.js';
import { applyPose, facingOf, cleanSkinWeights, POSES, poseValues } from './pose3d.js';

let deps = {};
let renderer = null, loader = null, envTex = null;
const MODELS = new Map();     // url -> { status, gltf, error }
const INSTANCES = new Map();  // url|layerId -> { root, mixer, height, size }
const RENDERS = new Map();    // layerId -> { key, canvas }

export function initModels(d) { deps = d }

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
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const urls = doc.layers.filter(L => L.type === 'model' && L.visible !== false).flatMap(L => L.actors ? L.actors.map(a => modelUrl(doc, a.model)) : [modelUrl(doc, L.model)]).filter(Boolean);
  await Promise.all(urls.map(u => load(u).promise));
}

function instance(url, L, gltf) {
  // une seule instance par fichier : les rendus sont séquentiels, la pose est réappliquée à chaque fois
  const key = url;
  let inst = INSTANCES.get(key);
  if (inst) return inst;
  const root = gltf.scene;
  const aniso = getRenderer().capabilities.getMaxAnisotropy();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    for (const m of [].concat(o.material || [])) {
      m.side = THREE.FrontSide;
      // filtrage anisotrope : garde nets les détails fins (sourcils, lèvres) quand le visage est petit à l'écran
      for (const k in m) { const t = m[k]; if (t && t.isTexture) { t.anisotropy = aniso; t.needsUpdate = true; } }
    }
  });
  // normalisation : posé au sol, centré, hauteur 1
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  cleanSkinWeights(root); // après la mesure : la boîte englobante sert de repère de centrage et ne doit pas bouger
  const pivot = new THREE.Group();
  root.position.set(-center.x, -box.min.y, -center.z);
  pivot.add(root);
  const scale = 1 / Math.max(size.y, 1e-6);
  pivot.scale.setScalar(scale);
  pivot.updateMatrixWorld(true);
  const face = facingOf(root);
  inst = { pivot, root, face, baseScale: scale, baseYaw: face ? Math.atan2(face.x, face.z) : 0, size: size.clone().multiplyScalar(scale), mixer: gltf.animations?.length ? new THREE.AnimationMixer(root) : null, clips: gltf.animations || [] };
  INSTANCES.set(key, inst);
  return inst;
}

function renderModel(L, w, h, theme, exporting) {
  if (L.actors) return renderStage(L, w, h, theme, exporting);
  const url = modelUrl(S.doc_override || S.doc, L.model);
  if (!url) return null;
  const m = load(url);
  if (m.status !== 'ready') return null;
  const maxPx = exporting ? 4096 : 1400;
  const k = Math.min(1, maxPx / Math.max(w, h));
  const pw = Math.max(16, Math.round(w * k)), ph = Math.max(16, Math.round(h * k));
  const params = JSON.stringify([url, pw, ph, L.exposure, L.envLight, L.frame, L.pose, L.rotY, L.camPitch, L.zoom3d, L.target, L.fov, L.anim, L.animTime, L.key, L.rim, L.fill, L.ambient, L.offsetX, theme.glow, theme.accent, theme.text]);
  const cached = RENDERS.get(L.id);
  if (cached && cached.key === params) return cached.canvas;

  const inst = instance(url, L, m.gltf);
  const r = getRenderer();
  r.setSize(pw, ph, false);
  r.toneMappingExposure = L.exposure ?? 1.05;
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = L.envLight ?? 0.45;
  scene.add(inst.pivot);
  inst.pivot.scale.setScalar(inst.baseScale);
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
  const sz = inst.size;
  const targetY = sz.y * (L.target ?? 0.5);
  const fitH = sz.y / 2 / Math.tan(fov * Math.PI / 360);
  const fitW = Math.max(sz.x, sz.z) / 2 / Math.tan(fov * Math.PI / 360) / (pw / ph);
  const frameAll = L.frame ? L.frame === 'all' : (S.doc_override || S.doc).game === 'rl';
  const dist = (frameAll ? Math.max(fitH, fitW) : fitH) * 1.08 / (L.zoom3d || 1);
  const pitch = (L.camPitch ?? 6) * Math.PI / 180;
  const cam = new THREE.PerspectiveCamera(fov, pw / ph, 0.01, 100);
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
  if (L.actors) return sceneProps(L);
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
    + poseControls('pose', pz), clips.length > 0 || !!pz.on);
  h += section('Éclairage', `
    ${colorCtl('rim.color', 'Contre-jour', L.rim?.color || '$glow', th)}${range('rim.intensity', 'Intensité du contre-jour', L.rim?.intensity ?? 4, 0, 12, 0.1, v => v.toFixed(1))}${range('rim.angle', 'Direction du contre-jour', L.rim?.angle ?? 150, 90, 270, 1, deg)}
    ${colorCtl('key.color', 'Lumière principale', L.key?.color || '#ffffff', th)}${range('key.intensity', 'Intensité principale', L.key?.intensity ?? 1.4, 0, 6, 0.05, v => v.toFixed(2))}${range('key.angle', 'Direction principale', L.key?.angle ?? -35, -90, 90, 1, deg)}
    ${colorCtl('fill.color', 'Lumière de face', L.fill?.color || '$accent', th)}${range('fill.intensity', 'Intensité de face', L.fill?.intensity ?? 0.4, 0, 4, 0.05, v => v.toFixed(2))}
    ${range('exposure', 'Exposition', L.exposure ?? 1.05, 0.2, 2, 0.01, v => v.toFixed(2))}
    ${range('envLight', 'Reflets (matières brillantes)', L.envLight ?? 0.45, 0, 2, 0.01, pct)}
    ${colorCtl('ambient.color', 'Ambiance', L.ambient?.color || '$glow', th)}${range('ambient.intensity', 'Intensité d\'ambiance', L.ambient?.intensity ?? 0.6, 0, 3, 0.05, v => v.toFixed(2))}
    <button class="mini-btn" data-act="lightPreset">${icon('refresh')} Éclairage façon affiche roster</button>`);
  h += section('Sol', `${toggle('reflect', 'Reflet au sol', L.reflect)}${toggle('contact', 'Ombre au sol', L.contact)}`);
  void esc;
  return h;
}
export function modelPropAction(act, L, btn) {
  if (act === 'posePreset' && L) {
    const p = POSES.find(x => x[0] === btn.dataset.key);
    if (p) change(() => setPath(L, btn.dataset.prefix, { on: true, ...JSON.parse(JSON.stringify(p[2])) }), { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'poseReset' && L) { change(() => setPath(L, btn.dataset.prefix, { on: true }), { immediate: true }); deps.actions?.renderProps?.(); }
  if (act === 'poseMirror' && L) {
    change(() => { const P = getPath(L, btn.dataset.prefix); if (!P) return; const v = poseValues(P); P.armR = { ...v.armL }; P.legR = { ...v.legL }; }, { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'actorAdd' && L) {
    change(() => { const n = (L.actors ||= []).length; L.actors.push({ model: '@a' + Math.min(n + 1, GAMES[S.doc.game].players), x: 0, z: 0.3, rotY: 0, scale: 1 }); }, { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'actorDel' && L) {
    change(() => { L.actors.splice(+btn.dataset.i, 1); }, { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'lightPreset' && L) {
    change(() => { L.key = { color: '#cfd8ff', intensity: 0.9, angle: -30 }; L.rim = { color: '$glow', intensity: 6, angle: 160 }; L.fill = { color: '$glow', intensity: 0.8 }; L.ambient = { color: '$glow', intensity: 0.9 }; }, { immediate: true });
    deps.actions?.renderProps?.();
  }
}

// ---------------------------------------------------------------- scène 3D commune (sol, ombres, reflets)
let _floorTex = null, _glowTex = null;
function radialTex(solidUntil) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff'); g.addColorStop(solidUntil, '#fff'); g.addColorStop(1, '#000');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
// Opacité des matières d'un groupe (reflet) puis restauration.
function fadeMaterials(group, k, on) {
  group.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (on) { m.userData.o = { t: m.transparent, a: m.opacity }; m.transparent = true; m.opacity = m.opacity * k; }
      else if (m.userData.o) { m.transparent = m.userData.o.t; m.opacity = m.userData.o.a; delete m.userData.o; }
    }
  });
}

function renderStage(L, w, h, theme, exporting) {
  const doc = S.doc_override || S.doc;
  const list = (L.actors || []).map(a => ({ a, url: modelUrl(doc, a.model) })).filter(x => x.url);
  list.forEach(x => load(x.url));
  const ready = list.filter(x => MODELS.get(x.url)?.status === 'ready');
  if (!ready.length) return null;
  const maxPx = exporting ? 4096 : 1400, k = Math.min(1, maxPx / Math.max(w, h));
  const pw = Math.max(16, Math.round(w * k)), ph = Math.max(16, Math.round(h * k));
  const fl = L.floor || {};
  const params = JSON.stringify([pw, ph, ready.map(x => [x.url, x.a]), fl, L.exposure, L.envLight, L.camPitch, L.zoom3d, L.target, L.fov, L.offsetX, L.key, L.rim, L.fill, L.ambient, theme.glow, theme.accent, theme.text, theme.bg, theme.bg2]);
  const cached = RENDERS.get(L.id);
  if (cached && cached.key === params) return cached.canvas;

  const r = getRenderer();
  r.setSize(pw, ph, false);
  r.toneMappingExposure = L.exposure ?? 1.05;
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = L.envLight ?? 0.45;
  const group = new THREE.Group(); scene.add(group);

  let maxX = 0.4, maxH = 1;
  const used = [];
  ready.forEach(({ a, url }) => {
    const inst = instance(url, L, MODELS.get(url).gltf);
    if (used.includes(inst)) return; // un même fichier ne peut apparaître qu'une fois dans la scène
    used.push(inst);
    const pz = a.pose || {};
    if (inst.mixer && inst.clips.length) { inst.mixer.stopAllAction(); inst.mixer.clipAction(inst.clips[0]).play(); inst.mixer.setTime(0); }
    if (pz.on) applyPose(inst.root, { ...pz, forward: inst.face || undefined });
    else if (!inst.mixer) applyPose(inst.root, { mode: 'file' });
    inst.pivot.scale.setScalar(inst.baseScale * (a.scale || 1));
    inst.pivot.rotation.set(0, -inst.baseYaw + (a.rotY || 0) * Math.PI / 180, 0);
    inst.pivot.position.set(a.x || 0, 0, a.z || 0);
    inst.pivot.updateMatrixWorld(true);
    inst.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(inst.pivot);
    maxX = Math.max(maxX, Math.abs(a.x || 0) + 0.32 * (a.scale || 1)); maxH = Math.max(maxH, a.scale || 1);
  });

  // lumière : le contre-jour projette les ombres vers l'avant, sur le sol
  const col = c => new THREE.Color(color(c, theme) || '#ffffff');
  const amb = L.ambient || {}, key = L.key || {}, rim = L.rim || {}, fill = L.fill || {};
  scene.add(new THREE.HemisphereLight(col(amb.color || '$glow'), new THREE.Color('#05060c'), amb.intensity ?? 0.7));
  const kl = new THREE.DirectionalLight(col(key.color || '#ffffff'), key.intensity ?? 1.6);
  const ka = (key.angle ?? -35) * Math.PI / 180; kl.position.set(Math.sin(ka) * 3, 2.4, Math.cos(ka) * 3); scene.add(kl);
  const rl = new THREE.DirectionalLight(col(rim.color || '$glow'), rim.intensity ?? 4);
  const ra = (rim.angle ?? 150) * Math.PI / 180; rl.position.set(Math.sin(ra) * 3, 2.6, Math.cos(ra) * 3); scene.add(rl);
  if (fl.on) {
    rl.castShadow = true; rl.shadow.mapSize.set(2048, 2048); rl.shadow.bias = -0.0006; rl.shadow.radius = 6;
    const sc = rl.shadow.camera; sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 0.5; sc.far = 14;
  }
  const rl2 = new THREE.DirectionalLight(col(rim.color || '$glow'), (rim.intensity ?? 4) * 0.6);
  rl2.position.set(-Math.sin(ra) * 3, 1.8, Math.cos(ra) * 3); scene.add(rl2);
  if ((fill.intensity ?? 0.4) > 0) { const fli = new THREE.DirectionalLight(col(fill.color || '$accent'), fill.intensity ?? 0.4); fli.position.set(0, 0.3, 3); scene.add(fli); }

  // sol : disque sombre à bord fondu, lueur de la lumière, et plan récepteur d'ombres
  const floor = new THREE.Group(); scene.add(floor);
  const geo = new THREE.CircleGeometry(fl.size ?? 7, 64); geo.rotateX(-Math.PI / 2);
  const dark = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col(fl.color || '$bg2'), transparent: true, opacity: fl.opacity ?? 0.75, alphaMap: (_floorTex ||= radialTex(0.5)), depthWrite: false }));
  const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col('$glow'), transparent: true, opacity: fl.glow ?? 0.5, alphaMap: (_glowTex ||= radialTex(0)), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.45, 1, 0.45); glow.position.y = 0.001;
  const shadow = new THREE.Mesh(geo, new THREE.ShadowMaterial({ opacity: fl.shadow ?? 0.55 }));
  shadow.receiveShadow = true; shadow.position.y = 0.002;
  floor.add(dark, glow, shadow);
  floor.rotation.order = 'YXZ'; floor.rotation.set((fl.tilt || 0) * Math.PI / 180, (fl.rot || 0) * Math.PI / 180, 0);

  const fov = L.fov || 26, t = Math.tan(fov * Math.PI / 360);
  const fitH = maxH / 2 / t, fitW = maxX / t / (pw / ph);
  const dist = Math.max(fitH, fitW) * 1.08 / (L.zoom3d || 1);
  const pitch = (L.camPitch ?? 5) * Math.PI / 180, targetY = maxH * (L.target ?? 0.5), cx = L.offsetX || 0;
  const cam = new THREE.PerspectiveCamera(fov, pw / ph, 0.05, 100);
  cam.position.set(cx, targetY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  cam.lookAt(cx, targetY, 0);

  const show = (f, s, a) => { dark.visible = glow.visible = f; shadow.visible = s; group.visible = a; };
  r.autoClear = false; r.setClearColor(0x000000, 0); r.clear(true, true, true);
  if (fl.on && (fl.reflect ?? 0.3) > 0) {
    show(false, false, true);
    group.scale.y = -1; fadeMaterials(group, fl.reflect ?? 0.3, true);
    r.render(scene, cam);
    fadeMaterials(group, 0, false); group.scale.y = 1; r.clearDepth();
  }
  if (fl.on) { show(true, false, false); r.render(scene, cam); r.clearDepth(); }
  show(false, !!fl.on, true); r.render(scene, cam);
  r.autoClear = true;

  used.forEach(inst => { group.remove(inst.pivot); inst.pivot.scale.setScalar(inst.baseScale); inst.pivot.position.set(0, 0, 0); });
  geo.dispose(); dark.material.dispose(); glow.material.dispose(); shadow.material.dispose();

  const out = cached?.canvas || document.createElement('canvas');
  out.width = pw; out.height = ph;
  const c = out.getContext('2d'); c.clearRect(0, 0, pw, ph); c.drawImage(r.domElement, 0, 0);
  RENDERS.set(L.id, { key: params, canvas: out });
  return out;
}

export function newSceneLayer() {
  const doc = S.doc, W = doc.W, H = doc.H, n = GAMES[doc.game].players;
  return { type: 'model', name: 'Scène 3D', model: '@a1', ...sceneDefaults(n), x: 0, y: H * 0.28, w: W, h: H * 0.6, rot: 0 };
}

const lightSection = (L, th) => section('Éclairage', `
    ${colorCtl('rim.color', 'Contre-jour', L.rim?.color || '$glow', th)}${range('rim.intensity', 'Intensité du contre-jour', L.rim?.intensity ?? 4, 0, 12, 0.1, v => v.toFixed(1))}${range('rim.angle', 'Direction du contre-jour', L.rim?.angle ?? 150, 90, 270, 1, deg)}
    ${colorCtl('key.color', 'Lumière principale', L.key?.color || '#ffffff', th)}${range('key.intensity', 'Intensité principale', L.key?.intensity ?? 1.4, 0, 6, 0.05, v => v.toFixed(2))}${range('key.angle', 'Direction principale', L.key?.angle ?? -35, -90, 90, 1, deg)}
    ${colorCtl('fill.color', 'Lumière de face', L.fill?.color || '$accent', th)}${range('fill.intensity', 'Intensité de face', L.fill?.intensity ?? 0.4, 0, 4, 0.05, v => v.toFixed(2))}
    ${range('exposure', 'Exposition', L.exposure ?? 1.05, 0.2, 2, 0.01, v => v.toFixed(2))}
    ${range('envLight', 'Reflets (matières brillantes)', L.envLight ?? 0.45, 0, 2, 0.01, pct)}
    ${colorCtl('ambient.color', 'Ambiance', L.ambient?.color || '$glow', th)}${range('ambient.intensity', 'Intensité d\'ambiance', L.ambient?.intensity ?? 0.6, 0, 3, 0.05, v => v.toFixed(2))}
    <button class="mini-btn" data-act="lightPreset">${icon('refresh')} Éclairage façon affiche roster</button>`);

const POSE_ARM = [['out', 'Écart du bras', 0, 160], ['fwd', 'Bras vers l\'avant', -90, 150], ['elbow', 'Coude plié', 0, 150], ['roll', 'Sens du coude', -90, 180]];
const POSE_LEG = [['out', 'Écart de la jambe', 0, 45], ['fwd', 'Jambe vers l\'avant', -45, 90], ['knee', 'Genou plié', 0, 120]];
const POSE_GROUPS = [
  ['Bras gauche', 'armL', POSE_ARM], ['Bras droit', 'armR', POSE_ARM],
  ['Jambe gauche', 'legL', POSE_LEG], ['Jambe droite', 'legR', POSE_LEG],
  ['Buste', 'torso', [['bend', 'Penché en avant', -30, 45], ['lean', 'Penché sur le côté', -30, 30], ['twist', 'Rotation du buste', -60, 60]]],
  ['Tête', 'head', [['turn', 'Rotation de la tête', -70, 70], ['nod', 'Tête vers le bas', -35, 35], ['tilt', 'Inclinaison de la tête', -35, 35]]],
];
// Poses prédéfinies et réglage fin membre par membre (« gauche » et « droite » sont celles du personnage).
function poseControls(prefix, P) {
  const pz = P || {};
  const head = toggle(`${prefix}.on`, 'Régler la pose', pz.on);
  if (!pz.on) return head + '<p class="hint">Active pour choisir une pose prédéfinie puis ajuster chaque membre.</p>';
  const v = poseValues(pz);
  return head
    + `<div class="posegrid">${POSES.map(([k, label]) => `<button class="mini-btn" data-act="posePreset" data-key="${k}" data-prefix="${prefix}">${esc(label)}</button>`).join('')}</div>`
    + POSE_GROUPS.map(([title, key, rows]) => section(title, rows.map(([k, label, min, max]) => range(`${prefix}.${key}.${k}`, label, v[key][k], min, max, 1, deg)).join(''), false)).join('')
    + `<div class="btnrow"><button class="mini-btn" data-act="poseMirror" data-prefix="${prefix}">Copier gauche → droite</button><button class="mini-btn" data-act="poseReset" data-prefix="${prefix}">Réinitialiser la pose</button></div><p class="hint">Selon le squelette du modèle, certains réglages extrêmes peuvent déformer les mains : Ctrl+Z pour revenir.</p>`;
}

function sceneProps(L) {
  const doc = S.doc, th = doc.theme, fl = L.floor || {};
  const opts = [
    ...Array.from({ length: GAMES[doc.game].players }, (_, i) => [`@a${i + 1}`, `Joueur ${i + 1} (${doc.T['p' + (i + 1)] || '—'})`]),
    ...gameItems(doc.game, S.extraItems).map(i => [`g:${doc.game}:${i.key}`, i.name]),
  ];
  let h = section('Caméra', `${range('camPitch', 'Angle de caméra', L.camPitch ?? 5, -20, 60, 1, deg)}${range('zoom3d', 'Zoom', L.zoom3d || 1, 0.3, 3, 0.01, pct)}${range('target', 'Hauteur visée', L.target ?? 0.5, 0, 1, 0.01, pct)}${range('offsetX', 'Décalage caméra', L.offsetX || 0, -2, 2, 0.01, v => Math.round(v * 100))}${range('fov', 'Focale (perspective)', L.fov || 26, 10, 70, 1, v => v + '°')}`);
  h += section('Personnages', (L.actors || []).map((a, i) => `<div class="fadebox"><div class="fadehead"><b>Personnage ${i + 1}</b><button class="mini-btn danger" data-act="actorDel" data-i="${i}" title="Retirer de la scène">${icon('trash')}</button></div>
    ${sel(`actors.${i}.model`, 'Modèle', a.model, opts, { raw: true })}
    ${range(`actors.${i}.x`, 'Position gauche / droite', a.x || 0, -3, 3, 0.01, v => v.toFixed(2))}
    ${range(`actors.${i}.z`, 'Profondeur (vers la caméra)', a.z || 0, -3, 3, 0.01, v => v.toFixed(2))}
    ${range(`actors.${i}.rotY`, 'Angle du personnage', a.rotY || 0, -180, 180, 1, deg)}
    ${range(`actors.${i}.scale`, 'Taille', a.scale || 1, 0.4, 1.8, 0.01, pct)}</div>`).join('')
    + `<div class="btnrow"><button class="mini-btn" data-act="actorAdd">${icon('plus')} Ajouter un personnage</button></div>`);
  if (L.actors?.length) {
    const pi = Math.min(Math.max(0, L.poseActor ?? 0), L.actors.length - 1);
    h += section('Pose des personnages', `${sel('poseActor', 'Personnage à poser', pi, L.actors.map((a, i) => [i, `${i + 1} · ${(opts.find(o => o[0] === a.model) || [])[1] || a.model}`]))}${poseControls(`actors.${pi}.pose`, L.actors[pi].pose)}`, false);
  }
  h += section('Sol', `${toggle('floor.on', 'Afficher le sol (ombres et reflets)', fl.on)}${fl.on ? `
    ${colorCtl('floor.color', 'Couleur du sol', fl.color || '$bg2', th)}
    ${range('floor.opacity', 'Opacité du sol', fl.opacity ?? 0.75, 0, 1, 0.01, pct)}
    ${range('floor.reflect', 'Reflet du sol', fl.reflect ?? 0.3, 0, 1, 0.01, pct)}
    ${range('floor.glow', 'Lueur du sol', fl.glow ?? 0.5, 0, 1.5, 0.01, pct)}
    ${range('floor.shadow', 'Force des ombres', fl.shadow ?? 0.55, 0, 1, 0.01, pct)}
    ${range('floor.rot', 'Angle du sol', fl.rot || 0, -180, 180, 1, deg)}
    ${range('floor.tilt', 'Inclinaison du sol', fl.tilt || 0, -30, 30, 1, deg)}
    ${range('floor.size', 'Taille du sol', fl.size ?? 7, 2, 14, 0.1, v => v.toFixed(1))}
    <p class="hint">Les ombres viennent du contre-jour : change sa direction dans Éclairage pour les orienter.</p>` : ''}`);
  h += lightSection(L, th);
  return h;
}
