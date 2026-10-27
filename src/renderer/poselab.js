// Studio de poses : règle toutes les poses par défaut du logiciel (pose des personnages, poses prédéfinies, positions d'arme,
// placement de chaque arme) avec un aperçu 3D en direct. Les réglages sont mémorisés par posereg.js et s'appliquent aussitôt ;
// « Exporter » les écrit dans un fichier pour les reprendre comme valeurs d'origine du logiciel.
import { S } from './state.js';
import { esc, getPath, setPath, section, syncRange } from './ui.js';
import { gameItems, WEAPONS } from './engine/games.js';
import { renderModelPreview } from './model3d.js';
import { WEAPON_STANCES, poseValues } from './pose3d.js';
import { getItem, setItem, resetItem, resetAll, hasOverride, overrideCount, exportConfig, importConfig, presetsList } from './posereg.js';

const API = window.studio;
const $ = (s, r = document) => r.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ éléments réglables
const KINDS = [['rifle', 'Fusils d\'assaut'], ['pistol', 'Pistolets']];
function items() {
  return [
    { id: 'default', group: 'Pose des personnages dans les affiches', label: 'Pose par défaut', type: 'pose' },
    ...presetsList().map(([k, label]) => ({ id: 'preset:' + k, group: 'Poses prédéfinies (boutons du panneau 3D)', label, type: 'pose' })),
    ...KINDS.flatMap(([kind, title]) => WEAPON_STANCES.map(([k, label]) => ({ id: `stance:${kind}:${k}`, group: 'Positions — ' + title, label, type: 'stance', kind, stance: k }))),
    ...WEAPONS.map(w => ({ id: 'weapon:' + w.key, group: 'Placement des armes dans la main', label: w.name, type: 'weapon', kind: w.kind, key: w.key })),
  ];
}
const find = id => items().find(i => i.id === id);

// ------------------------------------------------------------------ curseurs
const ARM = [['out', 'Écart du bras', 0, 160], ['fwd', 'Bras vers l\'avant', -90, 150], ['elbow', 'Coude plié', 0, 150], ['roll', 'Sens du coude', -90, 180]];
const LEG = [['out', 'Écart de la jambe', 0, 45], ['fwd', 'Jambe vers l\'avant', -45, 90], ['knee', 'Genou plié', 0, 120]];
const SHOULDER = [['up', 'Épaule levée', -30, 40], ['fwd', 'Épaule vers l\'avant', -30, 40]];
const FOOT = [['pitch', 'Pointe levée / baissée', -45, 45], ['yaw', 'Pointe ouverte / fermée', -45, 45]];
const FINGERS = [['thumb', 'Pouce'], ['index', 'Index'], ['middle', 'Majeur'], ['ring', 'Annulaire'], ['pinky', 'Auriculaire']];
const HAND_MAIN = [['curl', 'Tous les doigts pliés', 0, 100, '%'], ...FINGERS.map(([k, l]) => [k, l + ' plié', 0, 100, '%']), ['spread', 'Écartement des doigts', -100, 100, '%']];
const WRIST = [['flex', 'Poignet plié (vers la paume)', -70, 70], ['side', 'Poignet incliné (vers le pouce)', -35, 35], ['twist', 'Rotation de la main', -90, 90]];
const JOINTS = FINGERS.flatMap(([k, l]) => [1, 2, 3].map(j => [k + j, `${l} — ${['base', 'milieu', 'bout'][j - 1]}`, -100, 100, '%']));

let nid = 0;
function rg(path, label, value, min, max, unit = '°', step = 1) {
  const id = 'pl' + (++nid), v = value ?? 0;
  return `<div class="range"><div class="range-top"><label for="${id}">${esc(label)}</label><output>${Math.round(v * 100) / 100}${unit}</output></div><input type="range" id="${id}" data-path="${path}" data-u="${unit}" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${((v - min) / (max - min)) * 100}%"></div>`;
}
const chk = (path, label, value) => { const id = 'pl' + (++nid); return `<label class="toggle" for="${id}"><span>${esc(label)}</span><input type="checkbox" id="${id}" data-path="${path}" ${value ? 'checked' : ''}></label>`; };
const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const rows = (key, defs, v) => defs.map(([k, l, min, max, u]) => rg(`${key}.${k}`, l, v[key]?.[k] ?? (key.startsWith('hand') && FINGER_KEYS.includes(k) ? v[key]?.curl : 0) ?? 0, min, max, u || '°')).join('');

function poseControls(data) {
  const v = poseValues(data);
  const hand = (s, title) => section(title, rows('hand' + s, HAND_MAIN, v) + rows('hand' + s, WRIST, v) + section('Articulations des doigts (avancé)', rows('hand' + s, JOINTS, v), false), false);
  return [
    section('Bras gauche', rows('armL', ARM, v), false), section('Bras droit', rows('armR', ARM, v), false),
    section('Épaules', section('Épaule gauche', rows('shL', SHOULDER, v), true) + section('Épaule droite', rows('shR', SHOULDER, v), true), false),
    section('Buste', rows('torso', [['bend', 'Penché en avant', -30, 45], ['lean', 'Penché sur le côté', -30, 30], ['twist', 'Rotation du buste', -60, 60]], v), false),
    section('Tête', rows('head', [['turn', 'Rotation de la tête', -70, 70], ['nod', 'Tête vers le bas', -35, 35], ['tilt', 'Inclinaison de la tête', -35, 35]], v), false),
    hand('L', 'Main gauche — poignet et doigts'), hand('R', 'Main droite — poignet et doigts'),
    section('Jambes', section('Jambe gauche', rows('legL', LEG, v), true) + section('Jambe droite', rows('legR', LEG, v), true), false),
    section('Pieds', section('Pied gauche', rows('footL', FOOT, v), true) + section('Pied droit', rows('footR', FOOT, v), true), false),
    `<div class="btnrow"><button class="mini-btn" data-act="mirrorLR">Copier gauche → droite</button><button class="mini-btn" data-act="mirrorRL">Copier droite → gauche</button></div>`,
  ].join('');
}
function aimControls(data) {
  const a = data.aim;
  return chk('__aimOn', 'Placer l\'arme par rapport au corps (visée)', !!a)
    + (a ? rg('aim.x', 'Arme vers l\'avant', a.x ?? 0, -0.3, 0.6, '', 0.005) + rg('aim.y', 'Arme en hauteur', a.y ?? 0, -0.6, 0.3, '', 0.005) + rg('aim.z', 'Arme vers la droite', a.z ?? 0, -0.3, 0.3, '', 0.005)
      + rg('aim.pitch', 'Canon vers le bas', a.pitch ?? 0, -90, 90) + rg('aim.yaw', 'Canon vers la gauche', a.yaw ?? 0, -90, 90)
      : '<p class="hint">Désactivé : l\'arme suit la direction de l\'avant-bras de la main droite.</p>');
}
function placementControls(d) {
  return rg('scale', 'Taille de l\'arme', d.scale ?? 1, 0.5, 1.6, '×', 0.01)
    + rg('x', 'Décalage avant / arrière', d.x ?? 0, -0.3, 0.3, ' m', 0.005) + rg('y', 'Décalage haut / bas', d.y ?? 0, -0.3, 0.3, ' m', 0.005) + rg('z', 'Décalage gauche / droite', d.z ?? 0, -0.3, 0.3, ' m', 0.005)
    + rg('rx', 'Roulis de l\'arme', d.rx ?? 0, -180, 180) + rg('ry', 'Cap de l\'arme', d.ry ?? 0, -180, 180) + rg('rz', 'Tangage de l\'arme', d.rz ?? 0, -180, 180);
}
function leftHandControls(d) {
  return rg('lx', 'Main gauche avant / arrière', d.lx ?? 0, -0.3, 0.3, ' m', 0.005) + rg('ly', 'Main gauche haut / bas', d.ly ?? 0, -0.3, 0.3, ' m', 0.005) + rg('lz', 'Main gauche gauche / droite', d.lz ?? 0, -0.3, 0.3, ' m', 0.005)
    + rg('lroll', 'Rotation de la main gauche', d.lroll ?? 0, -180, 180);
}

// ------------------------------------------------------------------ état et interface
const ST = { open: false, id: 'default', data: {}, agent: null, weapon: { rifle: 'vandal', pistol: 'classic' }, previewStance: 'pret', cam: { rotY: -25, camPitch: 3, zoom3d: 1, target: 0.5, offsetX: 0 }, raf: 0, tries: 0 };
let root = null;

function agents() { return gameItems('valorant', S.extraItems).filter(i => S.libraryModels.has('g:valorant:' + i.key)); }

function build() {
  root = document.createElement('div');
  root.id = 'poselab'; root.hidden = true;
  root.innerHTML = `
    <div class="pl-top">
      <strong>Studio de poses</strong>
      <span class="pl-status" id="plStatus"></span>
      <span class="spacer"></span>
      <select class="input" id="plAgent" title="Personnage d'aperçu"></select>
      <button class="ghost-btn" id="plExport" title="Enregistrer tous les réglages dans un fichier">Exporter</button>
      <button class="ghost-btn" id="plImport" title="Reprendre un fichier exporté">Importer</button>
      <button class="ghost-btn" id="plResetAll" title="Revenir aux poses d'origine du logiciel">Tout réinitialiser</button>
      <button class="primary-btn" id="plClose">Fermer</button>
    </div>
    <div class="pl-body">
      <nav class="pl-list" id="plList"></nav>
      <div class="pl-view">
        <canvas id="plCanvas" width="640" height="800"></canvas>
        <div class="pl-cam" id="plCam"></div>
        <div class="pl-hint">Glisse sur l'aperçu pour tourner autour du personnage, molette pour zoomer.</div>
      </div>
      <div class="pl-ctl"><div class="pl-ctl-head" id="plHead"></div><div id="plControls"></div></div>
    </div>`;
  document.body.appendChild(root);
  $('#plClose', root).onclick = closePoseLab;
  $('#plExport', root).onclick = doExport; $('#plImport', root).onclick = doImport;
  $('#plResetAll', root).onclick = async () => {
    const ok = API?.confirm ? await API.confirm({ message: 'Revenir aux poses d\'origine ?', detail: 'Tous tes réglages du Studio seront effacés (pense à les exporter avant).', ok: 'Tout réinitialiser' }) : confirm('Tout réinitialiser ?');
    if (ok) { resetAll(); selectItem(ST.id); refreshList(); }
  };
  $('#plAgent', root).onchange = e => { ST.agent = e.target.value; preview(); };
  $('#plList', root).onclick = e => { const b = e.target.closest('[data-id]'); if (b) selectItem(b.dataset.id); };
  const ctl = $('#plControls', root);
  ctl.oninput = e => {
    const el = e.target, path = el.dataset.path; if (!path || el.type !== 'range') return;
    setPath(ST.data, path, +el.value);
    syncRange(el, (Math.round(+el.value * 100) / 100) + (el.dataset.u || ''));
    persist();
  };
  ctl.onchange = e => {
    const el = e.target, path = el.dataset.path; if (!path) return;
    if (el.type === 'checkbox') {
      if (path === '__aimOn') { if (el.checked) ST.data.aim = { x: 0.1, y: -0.1, z: 0, pitch: 0, yaw: 0 }; else delete ST.data.aim; }
      else setPath(ST.data, path, el.checked);
      persist(); renderControls();
    } else if (el.tagName === 'SELECT') { ST.previewStance = el.value; preview(); }
  };
  ctl.onclick = e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'mirrorLR' || b.dataset.act === 'mirrorRL') mirror(b.dataset.act === 'mirrorLR' ? ['L', 'R'] : ['R', 'L']);
    if (b.dataset.act === 'resetItem') { resetItem(ST.id); selectItem(ST.id); refreshList(); }
  };
  // caméra : glisser pour tourner, molette pour zoomer
  const cv = $('#plCanvas', root);
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cv._x = e.clientX; };
  cv.onpointermove = e => { if (cv._x == null) return; ST.cam.rotY = Math.max(-180, Math.min(180, ST.cam.rotY + (e.clientX - cv._x) * 0.5)); cv._x = e.clientX; preview(); };
  cv.onpointerup = () => { cv._x = null; };
  cv.onwheel = e => { e.preventDefault(); ST.cam.zoom3d = Math.max(0.5, Math.min(4, ST.cam.zoom3d * (e.deltaY < 0 ? 1.08 : 0.92))); preview(); };
  $('#plCam', root).onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const [rotY, camPitch, zoom3d, target, offsetX] = b.dataset.v.split(',').map(Number);
    Object.assign(ST.cam, { rotY, camPitch, zoom3d, target, offsetX }); preview();
  };
  $('#plCam', root).innerHTML = [['Face', '0,3,1,0.5,0'], ['3/4', '-30,3,1,0.5,0'], ['Profil', '-90,3,1,0.5,0'], ['Dos', '180,3,1,0.5,0'], ['Dessus', '-30,55,1,0.5,0'], ['Buste', '-25,3,1.9,0.72,0'], ['Mains', '-40,10,2.6,0.6,0']].map(([l, v]) => `<button class="mini-btn" data-v="${v}">${l}</button>`).join('');
  document.addEventListener('keydown', e => { if (ST.open && e.key === 'Escape') closePoseLab(); });
}

function persist() {
  setItem(ST.id, ST.data);
  const el = $(`[data-id="${CSS.escape(ST.id)}"]`, root); if (el) el.classList.add('mod');
  $('#plStatus', root).textContent = overrideCount() + ' élément(s) personnalisé(s) · enregistré automatiquement';
  preview();
}
function refreshList() {
  const list = $('#plList', root); let g = '', h = '';
  for (const it of items()) {
    if (it.group !== g) { g = it.group; h += `<div class="pl-group">${esc(g)}</div>`; }
    h += `<button data-id="${esc(it.id)}" class="${it.id === ST.id ? 'on' : ''} ${hasOverride(it.id) ? 'mod' : ''}">${esc(it.label)}</button>`;
  }
  list.innerHTML = h;
  $('#plStatus', root).textContent = overrideCount() + ' élément(s) personnalisé(s) · enregistré automatiquement';
}
function selectItem(id) {
  ST.id = id; ST.data = getItem(id);
  const it = find(id);
  // un fusil / pistolet d'aperçu cohérent avec l'élément
  if (it?.kind && !WEAPONS.find(w => w.key === ST.weapon[it.kind])) ST.weapon[it.kind] = WEAPONS.find(w => w.kind === it.kind)?.key;
  $('#plList', root).querySelectorAll('[data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  renderControls(); preview();
}
function renderControls() {
  const it = find(ST.id), d = ST.data;
  $('#plHead', root).innerHTML = `<div><strong>${esc(it.label)}</strong><small>${esc(it.group)}</small></div><button class="mini-btn" data-act="resetItem" ${hasOverride(ST.id) ? '' : 'disabled'}>Revenir à l'origine</button>`;
  const stanceSel = `<div class="field"><label>Position utilisée pour l'aperçu</label><select class="input" data-path="__stance">${[...WEAPON_STANCES].map(([k, l]) => `<option value="${k}" ${k === ST.previewStance ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  let h = '';
  if (it.type === 'pose') h = poseControls(d);
  else if (it.type === 'stance') {
    const prev = WEAPONS.filter(w => w.kind === it.kind).map(w => `<option value="${w.key}" ${ST.weapon[it.kind] === w.key ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
    h = `<div class="field"><label>Arme d'aperçu</label><select class="input" id="plWeapon">${prev}</select></div>`
      + section('Arme', chk('both', 'Deux mains (main gauche sur l\'arme)', d.both ?? it.kind === 'rifle') + aimControls(d), true) + poseControls(d);
  } else if (it.type === 'weapon') {
    h = stanceSel + section('Placement dans la main droite', placementControls(d), true) + section('Main gauche', leftHandControls(d), true)
      + `<p class="hint">Ces réglages s'appliquent à toutes les affiches. Pour régler les doigts, choisis une position (fusil ou pistolet) dans la liste.</p>`;
  }
  $('#plControls', root).innerHTML = h;
  const ws = $('#plWeapon', root); if (ws) ws.onchange = () => { ST.weapon[it.kind] = ws.value; preview(); };
}
function mirror([from, to]) {
  const d = ST.data;
  for (const k of ['arm', 'leg', 'hand', 'sh', 'foot']) if (d[k + from]) d[k + to] = clone(d[k + from]);
  persist(); renderControls();
}

// ------------------------------------------------------------------ aperçu 3D
function previewLayer() {
  const it = find(ST.id), d = ST.data, ag = ST.agent;
  let pose, weapon = null;
  if (it.type === 'stance') { const { both, aim, ...p } = d; pose = { on: true, ...p }; weapon = { key: ST.weapon[it.kind], both, aim }; }
  else if (it.type === 'weapon') { const { both, aim, ...p } = getItem(`stance:${it.kind}:${ST.previewStance}`); pose = { on: true, ...p }; weapon = { ...d, key: it.key, both, aim }; }
  else pose = { on: true, ...d };
  return { id: 'poselab-preview', type: 'model', model: 'g:valorant:' + ag, x: 0, y: 0, w: 640, h: 800, rot: 0, ...ST.cam, fov: 28, anim: 0, animTime: 0,
    key: { color: '#ffffff', intensity: 1.5, angle: -35 }, rim: { color: '#7ab8ff', intensity: 2, angle: 150 }, fill: { color: '#ffffff', intensity: 0.7 }, ambient: { color: '#ffffff', intensity: 0.8 }, pose, weapon };
}
function preview() {
  if (!ST.open || ST.raf) return;
  ST.raf = requestAnimationFrame(() => {
    ST.raf = 0;
    const cv = $('#plCanvas', root), ctx = cv.getContext('2d');
    let out = null;
    try { out = renderModelPreview(previewLayer(), 640, 800, S.doc.theme); } catch (err) { console.error('Studio de poses', err); }
    if (out) { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(out, 0, 0, cv.width, cv.height); ST.tries = 0; }
    else if (ST.tries++ < 60) setTimeout(() => { if (ST.open) preview(); }, 350); // modèles encore en chargement
  });
}

// ------------------------------------------------------------------ export / import
async function doExport() {
  const data = exportConfig();
  try {
    const p = API?.saveText ? await API.saveText({ data, suggested: 'poses-mybad.json' }) : null;
    if (p) $('#plStatus', root).textContent = 'Exporté : ' + p;
    else if (!API?.saveText) { await navigator.clipboard.writeText(data); $('#plStatus', root).textContent = 'Configuration copiée dans le presse-papiers'; }
  } catch (err) { $('#plStatus', root).textContent = 'Export impossible : ' + err.message; }
}
async function doImport() {
  try {
    const r = await API?.openText?.(); if (!r) return;
    importConfig(r.data); selectItem(ST.id); refreshList();
    $('#plStatus', root).textContent = 'Configuration importée : ' + r.filePath;
  } catch (err) { $('#plStatus', root).textContent = 'Import impossible : ' + err.message; }
}

export function openPoseLab() {
  if (!root) build();
  const list = agents();
  if (!list.length) { alert('Ajoute d\'abord un personnage 3D (Bibliothèque ou pack 3D) pour utiliser le Studio de poses.'); return; }
  ST.open = true; root.hidden = false;
  if (!ST.agent || !list.find(a => a.key === ST.agent)) ST.agent = (list.find(a => a.key === 'jett') || list[0]).key;
  $('#plAgent', root).innerHTML = list.map(a => `<option value="${a.key}" ${a.key === ST.agent ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  refreshList(); selectItem(ST.id);
}
export function closePoseLab() { if (root) root.hidden = true; ST.open = false; }
