// Calques « Modèle 3D » : rendu three.js de fichiers .glb/.gltf avec éclairage de scène.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { S, change } from './state.js';
import { section, range, toggle, select as sel, seg, colorCtl, pct, deg, icon, esc, getPath, setPath } from './ui.js';
import { color, finOf } from './engine/scene.js';
import { GAMES, gameItems, WEAPONS } from './engine/games.js';
import { weaponInstance, placeWeapon, aimHand, gripSecondary, wrapFingers, handsOf, HOLD } from './weapons.js';
import { sceneDefaults, DEFAULT_POSE } from './engine/templates.js';
import { LOGO_URL, makeLogoGltf, setLogoLook } from './logo3d.js';
import { applyLivery, applyGloss, applyZones, surfaceAt, liveriesList, liveryKey, liveryGloss, liveryMetal, liveryZone } from './livery.js';
import { addLayer } from './editor.js';
import { presetsList, stancePose, weaponDefaults, resolvePose, weaponOf, agentRotY } from './posereg.js';
import { rigOf, applyPose, facingOf, cleanSkinWeights, recordRestShape, cullStretched, WEAPON_STANCES, FACES, applyFace, applyWrist, poseValues, worldPos, solveArmParams, solveUpperArm, solveLegParams } from './pose3d.js';

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
// Clé de l'agent d'une référence de modèle (« @a1 » → agent du joueur 1, « g:valorant:jett » → jett).
export function agentKeyOf(doc, ref) {
  if (!ref) return null;
  if (ref[0] === '@') return doc.T[ref.slice(1)] || null;
  return ref.startsWith('g:') ? ref.split(':')[2] : null;
}
// Fige une pose / une arme « automatique » avant de la modifier (appelé dans change() par le panneau de propriétés).
export function materialize(L, path) {
  const m = /^(actors\.(\d+)\.)?(pose|weapon)\./.exec(path); if (!m) return;
  const owner = m[1] ? L.actors?.[+m[2]] : L; if (!owner) return;
  const doc = S.doc_override || S.doc, pzr = resolvePose(owner.pose, agentKeyOf(doc, owner.model));
  if (owner.pose?.auto) { const { auto, weapon, ...rest } = JSON.parse(JSON.stringify(pzr)); owner.pose = { ...rest, on: true }; if (owner.weapon === undefined && weapon) owner.weapon = weapon; }
  if (m[3] === 'weapon' && owner.weapon === undefined && pzr.weapon) owner.weapon = JSON.parse(JSON.stringify(pzr.weapon));
}
// Correctifs propres à certains modèles. Astra : ses cheveux (deux modèles fusionnés) traversent la capuche, on les masque,
// ainsi que les petites perles qui y étaient accrochées (morceaux isolés au-dessus de la tête).
function fixModel(url, gltf) {
  if (!/astra/i.test(url)) return;
  gltf.scene.traverse(o => {
    const g = o.geometry; if (!o.isMesh || !g?.index) return;
    if (/hair/i.test(o.material?.name || '')) { o.visible = false; return; }
    if (/eye/i.test(o.material?.name || '')) return;
    const pos = g.attributes.position, idx = g.index.array, n = pos.count, par = new Int32Array(n).map((_, k) => k);
    const find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
    for (let k = 0; k < idx.length; k += 3) { par[find(idx[k + 1])] = find(idx[k]); par[find(idx[k + 2])] = find(idx[k]); }
    const cnt = new Map(), minY = new Map();
    for (let v = 0; v < n; v++) { const r = find(v); cnt.set(r, (cnt.get(r) || 0) + 1); minY.set(r, Math.min(minY.get(r) ?? 1e9, pos.getY(v))); }
    const keep = [];
    for (let k = 0; k < idx.length; k += 3) { const r = find(idx[k]); if (!(cnt.get(r) < 600 && minY.get(r) > 2.02)) keep.push(idx[k], idx[k + 1], idx[k + 2]); }
    if (keep.length < idx.length) g.setIndex(keep);
  });
}
// Voitures : feux (allumés / éteints, pour les modèles dont les feux sont une matière à part : Dominus, Fennec) et couleur des jantes. Les réglages du fichier sont mémorisés dans chaque matière (userData.o0) puis rétablis.
// L.lights : 'auto' / vide = comme dans le fichier, 'on' = allumés, 'off' = éteints ; L.rimColor : couleur des jantes (vide = d'origine).
// Octane : ses feux sont peints dans la texture du châssis (anneaux et points clairs), mais éteints. On les allume en renforçant la lumière de la texture dans des disques
// (centre et rayon en pixels de la texture 2048, tels que le modèle les utilise), teintés : phares blancs chauds, feux arrière rouges.
const LAMPS = {
  octane: { tex: 2048, discs: [
    [482, 313, 48, [1, 0.95, 0.85], 9], [1859, 966, 30, [1, 0.95, 0.85], 9], [976, 1407, 40, [1, 0.95, 0.85], 9], [1586, 1545, 14, [1, 0.95, 0.85], 9], [1634, 1526, 14, [1, 0.95, 0.85], 9],
    [1209, 1074, 50, [1, 0.1, 0.08], 3.4], [1290, 1056, 35, [1, 0.1, 0.08], 3.4], [1408, 1913, 35, [1, 0.1, 0.08], 3.4], [1516, 1913, 35, [1, 0.1, 0.08], 3.4],
  ] },
};
function lampGlow(m, car, on) {
  const st = m.userData.lampOn ?? false; if (st === on) return;
  m.userData.lampOn = on;
  if (!on) { m.onBeforeCompile = () => {}; delete m.customProgramCacheKey; m.needsUpdate = true; return; }
  const { tex, discs } = LAMPS[car], f = v => v.toFixed(3);
  const code = discs.map(([cx, cy, r, c, k]) => `{ float d = length(tpx - vec2(${cx}.0, ${cy}.0)); float mk = 1.0 - smoothstep(${f(r * 0.85)}, ${f(r)}, d); float l = dot(texture2D(map, vMapUv).rgb, vec3(0.3333)); totalEmissiveRadiance += vec3(${c.map(f).join(',')}) * pow(l, 1.3) * mk * ${f(k)}; }`).join('\n');
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ vec2 tpx = vMapUv * ' + tex + '.0;\n' + code + '\n}');
  };
  m.customProgramCacheKey = () => 'lamps2-' + car;
  m.needsUpdate = true;
}
const DEFAULT_RIM = { fennec: '#0b0c12' };   // jantes d'origine trop voyantes : noires par défaut
function applyCarLook(inst, L, theme, car) {
  const rim = L.rimColor ? color(L.rimColor, theme) : (liveryZone(L.livery, 'rim') || DEFAULT_RIM[car] || null);
  applyLivery(inst, L.livery, car);
  applyZones(inst, L.livery);
  applyGloss(inst, L.gloss ?? liveryGloss(L.livery) ?? 0.7, liveryMetal(L.livery));
  // les verres des phares (matière « Headlights ») réutilisent le dessin des phares de l'atlas du châssis : anneaux et segments au lieu d'un disque blanc uni
  let chassisMap = null;
  inst.root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material || [])) if (/chassis/i.test(m.name || '') && m.map && !chassisMap) chassisMap = m.map; });
  inst.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const n = m.name || '';
      const isLamp = /headlight/i.test(n), isChassis = /chassis/i.test(n), isRim = /rim|cristiano/i.test(n);
      if (!isLamp && !isChassis && !isRim) continue;
      const o0 = m.userData.o0 ||= { emissive: m.emissive?.clone(), ei: m.emissiveIntensity, color: m.color?.clone(), map: m.map, emissiveMap: m.emissiveMap, metalness: m.metalness, roughness: m.roughness, hex: m.emissive?.getHex() || 0 };
      if (isLamp || isChassis) {
                m.emissive.copy(o0.emissive); m.emissiveMap = o0.emissiveMap; m.emissiveIntensity = o0.ei; m.color.copy(o0.color);
        if (isLamp && chassisMap) { m.map = chassisMap; m.emissiveMap = chassisMap; m.emissive.set('#ffffff'); m.emissiveIntensity = 1.5; m.color.set('#ffffff'); }
        if (L.lights === 'off') { m.emissiveIntensity = 0; if (isLamp) m.color.copy(o0.color).multiplyScalar(0.3); }
        if (isChassis && LAMPS[car]) lampGlow(m, car, L.lights === 'on');
        m.needsUpdate = true;
      }
      if (isRim) {
        if (rim) { m.map = null; m.color.set(rim); m.metalness = 0.9; m.roughness = 0.28; }
        else { m.map = o0.map; m.color.copy(o0.color); m.metalness = o0.metalness; m.roughness = o0.roughness; }
        m.needsUpdate = true;
      }
    }
  });
}
function load(url) {
  let m = MODELS.get(url);
  if (m) return m;
  if (url === LOGO_URL) { m = { status: 'ready', gltf: makeLogoGltf(), promise: Promise.resolve() }; MODELS.set(url, m); return m; }
  m = { status: 'loading' };
  MODELS.set(url, m);
  m.promise = new Promise(res => {
    getLoader().load(url, gltf => { m.status = 'ready'; m.gltf = gltf; fixModel(url, gltf); res(); deps.requestRender?.(); deps.actions?.scheduleThumbs?.(); },
      undefined, err => { m.status = 'error'; m.error = err; console.error('3D', url, err); deps.toast?.('Impossible de charger ce modèle 3D (format .glb ou .gltf attendu).', true); res(); });
  });
  return m;
}
export async function preloadModels(doc) {
  const urls = doc.layers.filter(L => L.type === 'model' && L.visible !== false).flatMap(L => L.actors ? L.actors.flatMap(a => [modelUrl(doc, a.model), weaponUrl(doc, a.weapon)]) : [modelUrl(doc, L.model), weaponUrl(doc, L.weapon)]).filter(Boolean);
  await Promise.all(urls.map(u => load(u).promise));
}

// ---------------------------------------------------------------- poignées de pose sur le personnage
const HANDLES = new Map(); // id du calque -> { cam, list: [{ key, actor, inst, world }] }
function recordHandles(L, cam, entries) {
  const list = [];
  for (const { inst, actor } of entries) {
    const rig = inst.root.userData.rig; if (!rig) continue;
    const add = (key, bone) => { if (bone) list.push({ key, actor, inst, world: worldPos(bone).clone() }); };
    add('handL', rig.handL); add('handR', rig.handR); add('elbowL', rig.foreL); add('elbowR', rig.foreR);
    add('head', rig.head); add('chest', rig.spine.length ? rig.spine[rig.spine.length - 1] : rig.chest);
    add('kneeL', rig.kneeL); add('kneeR', rig.kneeR); add('footL', rig.footL); add('footR', rig.footR);
  }
  HANDLES.set(L.id, { cam: cam.clone(), list });
}
// Poignées du calque, en coordonnées d'écran normalisées (−1..1).
export function poseHandles(L) {
  const rec = HANDLES.get(L.id);
  return rec ? rec.list.map(h => { const v = h.world.clone().project(rec.cam); return { key: h.key, actor: h.actor, x: v.x, y: v.y, ref: h }; }) : [];
}
const posePrefix = h => (h.actor == null ? 'pose' : `actors.${h.actor}.pose`);
// Pose réglable d'un calque ou d'un personnage : la pose automatique est remplacée par sa version résolue.
const editablePose = (L, prefix) => {
  const P = getPath(L, prefix) || {};
  if (!P.auto) return P;
  const owner = prefix === 'pose' ? L : L.actors?.[+prefix.split('.')[1]];
  const { auto, weapon, ...rest } = JSON.parse(JSON.stringify(resolvePose(P, agentKeyOf(S.doc_override || S.doc, owner?.model))));
  return rest;
};
export function startPoseDrag(L, h) {
  const P = editablePose(L, posePrefix(h.ref));
  return { values: JSON.parse(JSON.stringify(poseValues(P))), x: h.x, y: h.y };
}
// Déplace une poignée vers le point d'écran ndc (x, y) : cinématique inverse sur un plan face caméra.
export function dragPoseHandle(L, h, start, ndc) {
  const rec = HANDLES.get(L.id); if (!rec) return;
  const cam = rec.cam, ref = h.ref, rig = ref.inst.root.userData.rig, key = ref.key, side = key.slice(-1);
  const prefix = posePrefix(ref);
  const root = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam), camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const dir = root.sub(camPos).normalize(), nrm = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
  const T = new THREE.Vector3(); new THREE.Ray(camPos, dir).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, ref.world), T);
  const P = editablePose(L, prefix);
  const out = { ...JSON.parse(JSON.stringify(P)), on: true }, V = start.values;
  const set = (k, v) => { out[k] = { ...V[k], ...(out[k] || {}), ...v }; };
  const dx = ndc.x - start.x, dy = ndc.y - start.y;
  const tip = T.clone();
  try {
    if (key.startsWith('hand')) { const el = worldPos(rig['fore' + side]); set('arm' + side, solveArmParams(rig, side, tip, el.clone().sub(worldPos(rig['upper' + side])))); }
    else if (key.startsWith('elbow')) set('arm' + side, solveUpperArm(rig, side, tip));
    else if (key.startsWith('foot')) set('leg' + side, solveLegParams(rig, side, tip));
    else if (key.startsWith('knee')) { const up = solveUpperArm({ upperL: rig.thighL, upperR: rig.thighR, foreL: rig.kneeL, foreR: rig.kneeR }, side, tip); set('leg' + side, { out: Math.max(0, Math.min(45, up.out)), fwd: Math.max(-45, Math.min(90, up.fwd)) }); }
    else if (key === 'head') set('head', { turn: V.head.turn + dx * 80, nod: V.head.nod - dy * 50 });
    else if (key === 'chest') set('torso', { twist: V.torso.twist + dx * 60, bend: V.torso.bend - dy * 40 });
  } catch (e) { console.error('poignée', e); return; }
  setPath(L, prefix, out);
}

// ---------------------------------------------------------------- armes tenues en main
const weaponUrl = (doc, def) => (def?.key === 'mybad' ? LOGO_URL : def?.key ? S.libraryModels.get('g:weapons:' + def.key) || null : null);
const weaponKind = key => WEAPONS.find(w => w.key === key)?.kind || 'rifle';
function holdWeapon(doc, inst, def0, cacheKey, pz) {
  const def = def0 && { ...weaponDefaults(def0.key), ...def0 };   // placement du Studio de poses sous les réglages du calque
  const url = weaponUrl(doc, def);
  if (!url) return null;
  const m = load(url);
  if (m.status !== 'ready') return null;
  const w = weaponInstance(cacheKey + ':' + def.key, m.gltf);
  if (def.key === 'mybad') setLogoLook(w, def.mode, color(def.color || '$accent', doc.theme));
  const kind = weaponKind(def.key), { primary, both } = handsOf(def, kind), second = primary === 'R' ? 'L' : 'R';
  const V = poseValues(pz || {});
  if (def.aim) aimHand(inst, def.aim, V['hand' + primary], primary);
  const geo = placeWeapon(inst, def, w, primary);
  if (!geo) return null;
  if (both) gripSecondary(inst, w, kind, def, V['hand' + second], second);
  const fb = H => Object.fromEntries(['thumb', 'index', 'middle', 'ring', 'pinky'].map(f => [f.charAt(0).toUpperCase() + f.slice(1), H[f] ?? H.curl ?? 0]));
  wrapFingers(inst, w, primary, geo, fb(V['hand' + primary]), kind === 'pistol' ? 40 : 25, { x: w.grip.x + HOLD.x, y: w.grip.y + HOLD.y, z: 0 }, 0.11, true);
  if (both) wrapFingers(inst, w, second, geo, fb(V['hand' + second]), 25, w.left, 0.14);
  return w;
}
const dropWeapons = list => list.forEach(w => w && w.holder.parent && w.holder.parent.remove(w.holder));

// Hauteur (monde) de la cheville la plus basse ; sert à reposer le personnage sur le sol quand une pose lève une jambe ou fléchit les genoux.
function ankleY(rig) {
  if (!rig?.footL || !rig?.footR) return null;
  return Math.min(worldPos(rig.footL).y, worldPos(rig.footR).y);
}
// Décalage vertical (monde) à appliquer au pivot pour que le pied le plus bas touche le sol. Le pivot doit être à y = 0, à son échelle finale.
function groundDrop(inst) {
  const rig = inst.root.userData.rig; if (inst.footRest == null || !rig) return 0;
  inst.pivot.position.y = 0; inst.pivot.updateMatrixWorld(true);
  const y = ankleY(rig); if (y == null) return 0;
  return -(y - inst.footRest * (inst.pivot.scale.x / inst.baseScale));
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
  // centrage sur les hanches : le cadre englobant peut être faussé par des surfaces qui dépassent
  root.updateMatrixWorld(true);
  const rig0 = rigOf(root);
  if (rig0?.thighL && rig0?.thighR) { const m = worldPos(rig0.thighL).add(worldPos(rig0.thighR)).multiplyScalar(0.5); center.x = m.x; center.z = m.z; }
  cleanSkinWeights(root);
  recordRestShape(root); // forme de repos, pour repérer ensuite les triangles étirés par une pose
  const pivot = new THREE.Group();
  root.position.set(-center.x, -box.min.y, -center.z);
  pivot.add(root);
  const scale = 1 / Math.max(size.y, 1e-6);
  pivot.scale.setScalar(scale);
  pivot.updateMatrixWorld(true);
  const face = facingOf(root);
  inst = { footRest: ankleY(rig0), pivot, root, face, baseScale: scale, baseYaw: face ? Math.atan2(face.x, face.z) : 0, size: size.clone().multiplyScalar(scale), mixer: gltf.animations?.length ? new THREE.AnimationMixer(root) : null, clips: gltf.animations || [] };
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
  const wdoc = S.doc_override || S.doc, pzr = resolvePose(L.pose, agentKeyOf(wdoc, L.model)), wdef = weaponOf(L, pzr), wurl = weaponUrl(wdoc, wdef);
  if (wurl) load(wurl);
  const fin = finOf(wdoc), arot = agentRotY(agentKeyOf(wdoc, L.model));
  const params = JSON.stringify([url, pw, ph, wdef, wurl && MODELS.get(wurl)?.status, L.exposure, L.envLight, L.frame, pzr, L.face, L.rotY, arot, fin.exposure, fin.key, fin.rim, fin.ambient, L.camPitch, L.zoom3d, L.target, L.fov, L.anim, L.animTime, L.key, L.rim, L.fill, L.ambient, L.offsetX, L.lights, L.rimColor, liveryKey(L.livery), L.gloss, theme.glow, theme.accent, theme.text]);
  const cached = RENDERS.get(L.id);
  if (cached && cached.key === params) return cached.canvas;

  const inst = instance(url, L, m.gltf);
  const r = getRenderer();
  r.setSize(pw, ph, false);
  r.toneMappingExposure = (L.exposure ?? 1.05) * (fin.exposure ?? 1);
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = L.envLight ?? (wdoc.game === 'rl' ? 0.9 : 0.45);
  scene.add(inst.pivot);
  applyCarLook(inst, L, theme, agentKeyOf(wdoc, L.model));
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
  const pz = pzr;
  if (pz.on) applyPose(inst.root, { ...pz, forward: inst.face || undefined });
  else if (!inst.mixer) applyPose(inst.root, { mode: 'file' });
  applyFace(inst.root, L.face);
  const held = holdWeapon(wdoc, inst, wdef, 'L' + L.id, pz);
  cullStretched(inst.root);
  inst.pivot.rotation.set(0, -inst.baseYaw + ((L.rotY || 0) + arot) * Math.PI / 180, 0);
  inst.pivot.updateMatrixWorld(true);
  inst.pivot.position.y = groundDrop(inst); inst.pivot.updateMatrixWorld(true);
  const col = c => new THREE.Color(color(c, theme) || '#ffffff');
  const lit = (o, def, k) => ({ ...(o || {}), intensity: (o?.intensity ?? def) * (k ?? 1) });
  const amb = lit(L.ambient, 0.7, fin.ambient), key = lit(L.key, 1.6, fin.key), rim = lit(L.rim, 4, fin.rim), fill = lit(L.fill, 0.4, fin.ambient);
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
  recordHandles(L, cam, [{ inst, actor: null }]);
  dropWeapons([held]);
  scene.remove(inst.pivot);

  const out = cached?.canvas || document.createElement('canvas');
  out.width = pw; out.height = ph;
  const c = out.getContext('2d'); c.clearRect(0, 0, pw, ph); c.drawImage(r.domElement, 0, 0);
  RENDERS.set(L.id, { key: params, canvas: out, cam, inst });
  return out;
}

// Point de la carrosserie sous un point de l'aperçu (nx, ny entre 0 et 1) : face (flanc / dessus) et position dans sa texture, ou null.
export function pickBody(layerId, nx, ny) {
  const rec = RENDERS.get(layerId); if (!rec?.cam || !rec.inst) return null;
  const { cam, inst } = rec;
  cam.updateMatrixWorld(true); inst.pivot.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), cam);
  const meshes = []; inst.root.traverse(o => { if (o.isMesh && [].concat(o.material || []).some(m => /body/i.test(m.name || ''))) meshes.push(o); });
  const hit = rc.intersectObjects(meshes, false)[0]; if (!hit || !hit.face) return null;
  return surfaceAt(hit.object, hit.point, hit.face.normal);
}

// Fournit au moteur 2D la fonction de rendu des calques 3D.
// Rendu autonome d'un calque 3D (aperçu du Studio de poses) : null tant que les modèles se chargent.
export const renderModelPreview = (L, w, h, theme) => renderModel(L, w, h, theme, false);

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
    ...(isCar ? {} : { pose: DEFAULT_POSE(0) }),   // l'agent prend la pose réglée dans le Studio (ou la pose par défaut)
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
  const pz = resolvePose(L.pose, agentKeyOf(doc, L.model)), wsel = weaponOf(L, pz);
  h += section('Arme', weaponControls('weapon', wsel), !!wsel?.key);
  h += section('Pose', (clips.length ? `${sel('anim', 'Animation', L.anim ?? 0, [[-1, 'Pose du fichier'], ...clips.map((c, i) => [i, c.name || `Animation ${i + 1}`])])}${(L.anim ?? 0) >= 0 ? range('animTime', 'Moment de l\'animation', L.animTime || 0, 0, 1, 0.001, pct) : ''}` : '<p class="hint">Ce modèle n\'a pas d\'animation : il garde la pose de son fichier.</p>')
    + poseControls('pose', pz), clips.length > 0 || !!pz.on);
  if (doc.game === 'rl') h += section('Voiture', `${sel('lights', 'Feux', L.lights || 'auto', [['auto', 'Selon le modèle'], ['on', 'Allumés'], ['off', 'Éteints']], { raw: true })}<p class="hint">« Allumés » éclaire les phares et les feux arrière (Octane : phares blancs, feux rouges). « Éteints » les coupe sur Dominus et Fennec.</p>${sel('livery', 'Livrée', L.livery || '', liveriesList(), { raw: true })}<div class="btnrow"><button class="mini-btn" data-act="openLiveryLab" data-id="${esc(L.livery || '')}">Créateur de livrées</button></div>${range('gloss', 'Brillance de la carrosserie', L.gloss ?? liveryGloss(L.livery) ?? 0.7, 0, 1, 0.01, pct)}${colorCtl('rimColor', 'Couleur des jantes', L.rimColor || '#9aa6c4', th)}<div class="btnrow"><button class="mini-btn" data-act="rimReset">Jantes d'origine</button></div>`, true);
  else h += section('Visage', faceControls('face', L.face), !!(L.face && Object.keys(L.face).length));
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
  if (act === 'openPoseLab') deps.actions?.openPoseLab?.();
  if (act === 'openLiveryLab') deps.actions?.openLiveryLab?.(btn?.dataset?.id);
  if (act === 'poseEditToggle' && L) { deps.actions?.togglePoseEdit?.(L); deps.actions?.renderProps?.(); }
  if (act === 'weaponAuto' && L) {
    const prefix = btn.dataset.prefix, def = getPath(L, prefix);
    if (def?.key) {
      const kind = weaponKind(def.key), posePrefix = prefix.replace(/weapon$/, 'pose');
      const { both, aim, hand, weapon: _w, scale, x, y, z, rx, ry, rz, lx, ly, lz, lroll, ...pose } = stancePose(kind, btn.dataset.stance || 'pret');
      const place = { scale, x, y, z, rx, ry, rz, lx, ly, lz, lroll };
      change(() => { def.hand = hand || (both ? 'RL' : 'R'); def.both = def.hand === 'RL' || def.hand === 'LR'; def.aim = aim || null; for (const k in place) { if (place[k] != null) def[k] = place[k]; else delete def[k]; } setPath(L, posePrefix, { on: true, ...JSON.parse(JSON.stringify(pose)) }); }, { immediate: true });
    }
    deps.actions?.renderProps?.();
  }
  if (act === 'poseSave' && L) {
    const P = getPath(L, btn.dataset.prefix), input = document.getElementById('poseName');
    if (P?.on) {
      const name = (input?.value || '').trim() || `Ma pose ${loadPoses().length + 1}`;
      const { on, ...body } = JSON.parse(JSON.stringify(P));
      savePoses([...loadPoses(), { id: 'p' + Date.now().toString(36), name, pose: body }]);
      deps.toast?.(`Pose « ${name} » enregistrée`);
    } else deps.toast?.('Active d\'abord « Régler la pose ».', true);
    deps.actions?.renderProps?.();
  }
  if (act === 'poseUse' && L) {
    const p = loadPoses().find(x => x.id === btn.dataset.id);
    if (p) change(() => setPath(L, btn.dataset.prefix, { on: true, ...JSON.parse(JSON.stringify(p.pose)) }), { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'poseDel') { savePoses(loadPoses().filter(x => x.id !== btn.dataset.id)); deps.actions?.renderProps?.(); }
  if (act === 'posePreset' && L) {
    const p = presetsList().find(x => x[0] === btn.dataset.key);
    if (p) change(() => setPath(L, btn.dataset.prefix, { on: true, ...JSON.parse(JSON.stringify(p[2])) }), { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'facePreset' && L) {
    const p = FACES.find(f => f[0] === btn.dataset.key);
    if (p) change(() => setPath(L, btn.dataset.prefix, JSON.parse(JSON.stringify(p[2]))), { immediate: true });
    deps.actions?.renderProps?.();
  }
  if (act === 'poseAgent' && L) {
    const prefix = btn.dataset.prefix, cur = getPath(L, prefix) || {}, wp = prefix.replace(/pose$/, 'weapon');
    change(() => { setPath(L, prefix, { on: true, auto: true, side: cur.side || 0 }); const owner = prefix === 'pose' ? L : getPath(L, prefix.replace(/\.pose$/, '')); if (owner) delete owner.weapon; void wp; }, { immediate: true });
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
  if (act === 'rimReset' && L) { change(() => { delete L.rimColor; }, { immediate: true }); deps.actions?.renderProps?.(); }
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
      if (on) { if (m.userData.o) continue; /* matière partagée entre plusieurs maillages : une seule fois */ m.userData.o = { t: m.transparent, a: m.opacity }; m.transparent = true; m.opacity = m.opacity * k; }
      else if (m.userData.o) { m.transparent = m.userData.o.t; m.opacity = m.userData.o.a; delete m.userData.o; }
    }
  });
}

function renderStage(L, w, h, theme, exporting) {
  const doc = S.doc_override || S.doc;
  const list = (L.actors || []).map(a => { const pr = resolvePose(a.pose, agentKeyOf(doc, a.model)); return { a, pr, wd: weaponOf(a, pr), url: modelUrl(doc, a.model) }; }).filter(x => x.url);
  list.forEach(x => load(x.url));
  const ready = list.filter(x => MODELS.get(x.url)?.status === 'ready');
  if (!ready.length) return null;
  const maxPx = exporting ? 4096 : 1400, k = Math.min(1, maxPx / Math.max(w, h));
  const pw = Math.max(16, Math.round(w * k)), ph = Math.max(16, Math.round(h * k));
  const fl = L.floor || {}, fin = finOf(doc);
  ready.forEach(x => { x.arot = agentRotY(agentKeyOf(doc, x.a.model)); const u = weaponUrl(doc, x.wd); if (u) load(u); });
  const params = JSON.stringify([pw, ph, fin.exposure, fin.key, fin.rim, fin.ambient, ready.map(x => [x.url, { ...x.a, pose: x.pr, weapon: x.wd, arot: x.arot }, MODELS.get(weaponUrl(doc, x.wd))?.status]), fl, L.spread, L.exposure, L.envLight, L.camPitch, L.zoom3d, L.target, L.fov, L.offsetX, L.key, L.rim, L.fill, L.ambient, theme.glow, theme.accent, theme.text, theme.bg, theme.bg2]);
  const cached = RENDERS.get(L.id);
  if (cached && cached.key === params) return cached.canvas;

  const r = getRenderer();
  r.setSize(pw, ph, false);
  r.toneMappingExposure = (L.exposure ?? 1.05) * (fin.exposure ?? 1);
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = L.envLight ?? 0.45;
  const group = new THREE.Group(); scene.add(group);

  let maxX = 0.4, maxH = 1;
  const used = [], heldAll = [], handleEntries = [];
  ready.forEach(({ a, url, pr, wd, arot }, ai) => {
    const inst = instance(url, L, MODELS.get(url).gltf);
    if (used.includes(inst)) return; // un même fichier ne peut apparaître qu'une fois dans la scène
    used.push(inst);
    const pz = pr;
    if (inst.mixer && inst.clips.length) { inst.mixer.stopAllAction(); inst.mixer.clipAction(inst.clips[0]).play(); inst.mixer.setTime(0); }
    if (pz.on) applyPose(inst.root, { ...pz, forward: inst.face || undefined });
    else if (!inst.mixer) applyPose(inst.root, { mode: 'file' });
    applyFace(inst.root, a.face);
    heldAll.push(holdWeapon(doc, inst, wd, 'S' + L.id + ':' + ai, pz));
    handleEntries.push({ inst, actor: (L.actors || []).indexOf(a) });
    cullStretched(inst.root);
    inst.pivot.scale.setScalar(inst.baseScale * (a.scale || 1));
    inst.pivot.rotation.set(0, -inst.baseYaw + ((a.rotY || 0) + arot) * Math.PI / 180, 0);
    inst.pivot.position.set((a.x || 0) * (L.spread ?? 1), 0, a.z || 0);
    inst.pivot.updateMatrixWorld(true);
    inst.pivot.position.y = groundDrop(inst); inst.pivot.updateMatrixWorld(true);
    inst.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(inst.pivot);
    maxX = Math.max(maxX, Math.abs((a.x || 0) * (L.spread ?? 1)) + 0.32 * (a.scale || 1)); maxH = Math.max(maxH, a.scale || 1);
  });

  // lumière : le contre-jour projette les ombres vers l'avant, sur le sol
  const col = c => new THREE.Color(color(c, theme) || '#ffffff');
  const lit = (o, def, k) => ({ ...(o || {}), intensity: (o?.intensity ?? def) * (k ?? 1) });
  const amb = lit(L.ambient, 0.7, fin.ambient), key = lit(L.key, 1.6, fin.key), rim = lit(L.rim, 4, fin.rim), fill = lit(L.fill, 0.4, fin.ambient);
  scene.add(new THREE.HemisphereLight(col(amb.color || '$glow'), new THREE.Color('#05060c'), amb.intensity ?? 0.7));
  const kl = new THREE.DirectionalLight(col(key.color || '#ffffff'), key.intensity ?? 1.6);
  const ka = (key.angle ?? -35) * Math.PI / 180; kl.position.set(Math.sin(ka) * 3, 2.4, Math.cos(ka) * 3); scene.add(kl);
  const rl = new THREE.DirectionalLight(col(rim.color || '$glow'), rim.intensity ?? 4);
  const ra = (rim.angle ?? 150) * Math.PI / 180; rl.position.set(Math.sin(ra) * 3, 2.6, Math.cos(ra) * 3); scene.add(rl);
  if (fl.on) {
    // ombres : lumière dédiée placée pile derrière les personnages (contre-jour), pour que les ombres viennent droit vers nous, quel que soit l'angle de la lumière de bord
    const sl = new THREE.DirectionalLight(0xffffff, 0.0005); sl.position.set(0, 2.6, -2.6); sl.target.position.set(0, 0, 0); scene.add(sl, sl.target);
    sl.castShadow = true; sl.shadow.mapSize.set(2048, 2048); sl.shadow.bias = -0.0006; sl.shadow.radius = 6;
    const sc = sl.shadow.camera; sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 0.5; sc.far = 14;
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
  recordHandles(L, cam, handleEntries);
  dropWeapons(heldAll);

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

const pctFmt = v => Math.round(v) + ' %';
function HAND_ROWS() { return [['curl', 'Doigts pliés (tous)', 0, 100, pctFmt], ['thumb', 'Pouce plié', 0, 100, pctFmt], ['index', 'Index plié', 0, 100, pctFmt], ['middle', 'Majeur plié', 0, 100, pctFmt], ['ring', 'Annulaire plié', 0, 100, pctFmt], ['pinky', 'Auriculaire plié', 0, 100, pctFmt]]; }
const POSE_ARM = [['out', 'Écart du bras', 0, 160], ['fwd', 'Bras vers l\'avant', -90, 150], ['elbow', 'Coude plié', 0, 150], ['roll', 'Sens du coude', -90, 180]];
const POSE_LEG = [['out', 'Écart de la jambe', 0, 45], ['fwd', 'Jambe vers l\'avant', -45, 90], ['knee', 'Genou plié', 0, 120]];
const POSE_GROUPS = [
  ['Bras gauche', 'armL', POSE_ARM], ['Bras droit', 'armR', POSE_ARM],
  ['Jambe gauche', 'legL', POSE_LEG], ['Jambe droite', 'legR', POSE_LEG],
  ['Buste', 'torso', [['bend', 'Penché en avant', -30, 45], ['lean', 'Penché sur le côté', -30, 30], ['twist', 'Rotation du buste', -60, 60]]],
  ['Tête', 'head', [['turn', 'Rotation de la tête', -70, 70], ['nod', 'Tête vers le bas', -35, 35], ['tilt', 'Inclinaison de la tête', -35, 35]]],
  ['Main gauche (doigts)', 'handL', HAND_ROWS()], ['Main droite (doigts)', 'handR', HAND_ROWS()],
];
// Poses prédéfinies et réglage fin membre par membre (« gauche » et « droite » sont celles du personnage).
function poseControls(prefix, P) {
  const pz = P || {};
  const head = toggle(`${prefix}.on`, 'Régler la pose', pz.on) + `<div class="btnrow"><button class="mini-btn" data-act="poseAgent" data-prefix="${prefix}">${icon('refresh')} Pose par défaut de l'agent</button><button class="mini-btn" data-act="openPoseLab">${icon('hand')} Studio de poses</button></div>`;
  if (!pz.on) return head + '<p class="hint">Active pour choisir une pose prédéfinie puis ajuster chaque membre.</p>';
  const editing = deps.actions?.poseEditOn?.();
  const v = poseValues(pz);
  return head
    + `<div class="btnrow"><button class="mini-btn ${editing ? 'on' : ''}" data-act="poseEditToggle">${icon('hand')} ${editing ? 'Terminer la manipulation' : 'Bouger les membres sur le personnage'}</button></div>${editing ? '<p class="hint">Glisse les points du personnage : mains et pieds (le bras ou la jambe suit), coudes, genoux, tête et buste.</p>' : ''}`
    + `<div class="posegrid">${presetsList().map(([k, label]) => `<button class="mini-btn" data-act="posePreset" data-key="${k}" data-prefix="${prefix}">${esc(label)}</button>`).join('')}</div>`
    + POSE_GROUPS.map(([title, key, rows]) => section(title, rows.map(([k, label, min, max, fmt]) => range(`${prefix}.${key}.${k}`, label, v[key][k] ?? v[key].curl ?? 0, min, max, 1, fmt || deg)).join(''), false)).join('')
    + myPoses(prefix)
    + `<div class="btnrow"><button class="mini-btn" data-act="poseMirror" data-prefix="${prefix}">Copier gauche → droite</button><button class="mini-btn" data-act="poseReset" data-prefix="${prefix}">Réinitialiser la pose</button></div><p class="hint">Selon le squelette du modèle, certains réglages extrêmes peuvent déformer les mains : Ctrl+Z pour revenir.</p>`;
}

export const HANDS = [['R', 'Main droite'], ['L', 'Main gauche'], ['RL', 'Deux mains (droite principale)'], ['LR', 'Deux mains (gauche principale)']];
// Arme tenue : choix, taille, ajustements et pose adaptée.
function weaponControls(prefix, w) {
  const have = k => k === 'mybad' || S.libraryModels.has('g:weapons:' + k);
  let h = sel(`${prefix}.key`, 'Arme tenue', w?.key || '', [['', 'Aucune arme'], ...WEAPONS.map(x => [x.key, x.name + (have(x.key) ? '' : ' (à importer)')])], { raw: true });
  if (!w?.key) return h + '<p class="hint">Choisis une arme : la pose du personnage s\'adapte automatiquement.</p>';
  if (!have(w.key)) return h + '<p class="hint warn">Importe ce modèle dans Bibliothèque › Armes 3D.</p>';
  const hand = w.hand || ((w.both ?? weaponKind(w.key) === 'rifle') ? 'RL' : 'R');
  if (w.key === 'mybad') h += sel(`${prefix}.mode`, 'Matière du logo', w.mode || 'metal', [['metal', 'Métal brossé'], ['neon', 'Néon lumineux']], { raw: true }) + colorCtl(`${prefix}.color`, 'Couleur du logo', w.color || '$accent', S.doc.theme);
  return h + sel(`${prefix}.hand`, 'Mains', hand, HANDS, { raw: true })
    + range(`${prefix}.scale`, 'Taille de l\'arme', w.scale || 1, 0.5, 1.6, 0.01, pct)
    + range(`${prefix}.x`, 'Décalage avant / arrière', w.x || 0, -0.3, 0.3, 0.005, v => Math.round(v * 100))
    + range(`${prefix}.y`, 'Décalage haut / bas', w.y || 0, -0.3, 0.3, 0.005, v => Math.round(v * 100))
    + range(`${prefix}.z`, 'Décalage gauche / droite', w.z || 0, -0.3, 0.3, 0.005, v => Math.round(v * 100))
    + range(`${prefix}.rx`, 'Rotation de l\'arme (roulis)', w.rx || 0, -180, 180, 1, deg)
    + range(`${prefix}.ry`, 'Rotation de l\'arme (cap)', w.ry || 0, -180, 180, 1, deg)
    + range(`${prefix}.rz`, 'Rotation de l\'arme (tangage)', w.rz || 0, -180, 180, 1, deg)
    + `<p class="hint">Position de l'arme</p><div class="posegrid">${WEAPON_STANCES.map(([k, n]) => `<button class="mini-btn" data-act="weaponAuto" data-prefix="${prefix}" data-stance="${k}">${n}</button>`).join('')}</div>`;
}

// Visage : expressions prédéfinies et réglages fins (bouche, sourire, paupières, sourcils).
function faceControls(prefix, F) {
  const f = { mouth: 0, smile: 0, eyeL: 0, eyeR: 0, brows: 0, anger: 0, ...(F || {}) };
  const pc = v => v + ' %';
  return `<div class="posegrid">${FACES.map(([k, label]) => `<button class="mini-btn" data-act="facePreset" data-key="${k}" data-prefix="${prefix}">${esc(label)}</button>`).join('')}</div>`
    + range(`${prefix}.mouth`, 'Bouche ouverte', f.mouth, 0, 100, 1, pc)
    + range(`${prefix}.smile`, 'Sourire (négatif : moue)', f.smile, -100, 100, 1, pc)
    + range(`${prefix}.eyeL`, 'Œil gauche fermé', f.eyeL, 0, 100, 1, pc)
    + range(`${prefix}.eyeR`, 'Œil droit fermé', f.eyeR, 0, 100, 1, pc)
    + range(`${prefix}.brows`, 'Sourcils (haut / bas)', f.brows, -100, 100, 1, pc)
    + range(`${prefix}.anger`, 'Sourcils (froncés / tristes)', f.anger, -100, 100, 1, pc)
    + '<p class="hint">Les expressions utilisent les os du visage : un modèle qui n\'en a qu\'un petit nombre (ex. seulement la mâchoire) ne bouge que partiellement.</p>';
}

// Poses personnalisées : nommées, enregistrées sur l'ordinateur, applicables à n'importe quel personnage.
const POSE_STORE = 'mbc.poses';
const loadPoses = () => { try { return JSON.parse(localStorage.getItem(POSE_STORE) || '[]'); } catch { return []; } };
const savePoses = list => { try { localStorage.setItem(POSE_STORE, JSON.stringify(list)); } catch { deps.toast?.('Enregistrement impossible (stockage plein).', true); } };
function myPoses(prefix) {
  const list = loadPoses();
  return section('Mes poses', `<p class="hint">Enregistre la pose réglée ci-dessus sous un nom, puis applique-la à n'importe quel personnage.</p>
    <div class="themesave"><input class="input" id="poseName" placeholder="Nom de la pose" maxlength="30" spellcheck="false"><button class="mini-btn" data-act="poseSave" data-prefix="${prefix}">${icon('plus')} Enregistrer</button></div>
    ${list.map(p => `<div class="weaprow"><b>${esc(p.name)}</b><span></span><span></span><button class="mini-btn" data-act="poseUse" data-prefix="${prefix}" data-id="${esc(p.id)}">Appliquer</button><button class="mini-btn danger" data-act="poseDel" data-id="${esc(p.id)}">✕</button></div>`).join('')}`, list.length > 0);
}

function sceneProps(L) {
  const doc = S.doc, th = doc.theme, fl = L.floor || {};
  const opts = [
    ...Array.from({ length: GAMES[doc.game].players }, (_, i) => [`@a${i + 1}`, `Joueur ${i + 1} (${doc.T['p' + (i + 1)] || '—'})`]),
    ...gameItems(doc.game, S.extraItems).map(i => [`g:${doc.game}:${i.key}`, i.name]),
  ];
  let h = section('Caméra', `${range('camPitch', 'Angle de caméra', L.camPitch ?? 5, -20, 60, 1, deg)}${range('zoom3d', 'Zoom', L.zoom3d || 1, 0.3, 3, 0.01, pct)}${range('target', 'Hauteur visée', L.target ?? 0.5, 0, 1, 0.01, pct)}${range('offsetX', 'Décalage caméra', L.offsetX || 0, -2, 2, 0.01, v => Math.round(v * 100))}${range('fov', 'Focale (perspective)', L.fov || 26, 10, 70, 1, v => v + '°')}`);
  h += section('Personnages', range('spread', 'Écartement entre les personnages', L.spread ?? 1, 0.4, 2.2, 0.01, pct) + (L.actors || []).map((a, i) => `<div class="fadebox"><div class="fadehead"><b>Personnage ${i + 1}</b><button class="mini-btn danger" data-act="actorDel" data-i="${i}" title="Retirer de la scène">${icon('trash')}</button></div>
    ${sel(`actors.${i}.model`, 'Modèle', a.model, opts, { raw: true })}
    ${range(`actors.${i}.x`, 'Position gauche / droite', a.x || 0, -3, 3, 0.01, v => v.toFixed(2))}
    ${range(`actors.${i}.z`, 'Profondeur (vers la caméra)', a.z || 0, -3, 3, 0.01, v => v.toFixed(2))}
    ${range(`actors.${i}.rotY`, 'Angle du personnage', a.rotY || 0, -180, 180, 1, deg)}
    ${range(`actors.${i}.scale`, 'Taille', a.scale || 1, 0.4, 1.8, 0.01, pct)}</div>`).join('')
    + `<div class="btnrow"><button class="mini-btn" data-act="actorAdd">${icon('plus')} Ajouter un personnage</button></div>`);
  if (L.actors?.length) {
    const pi = Math.min(Math.max(0, L.poseActor ?? 0), L.actors.length - 1);
    const ap = resolvePose(L.actors[pi].pose, agentKeyOf(doc, L.actors[pi].model)), aw = weaponOf(L.actors[pi], ap);
    h += section('Pose des personnages', `${sel('poseActor', 'Personnage à poser', pi, L.actors.map((a, i) => [i, `${i + 1} · ${(opts.find(o => o[0] === a.model) || [])[1] || a.model}`]))}${poseControls(`actors.${pi}.pose`, ap)}`, false);
    h += section('Visage du personnage', faceControls(`actors.${pi}.face`, L.actors[pi].face), false);
    h += section('Arme du personnage', weaponControls(`actors.${pi}.weapon`, aw), !!aw?.key);
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
