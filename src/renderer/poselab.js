// Studio de poses : règle toutes les poses du logiciel (pose par défaut, pose de chaque agent, poses prédéfinies, poses génériques à toi,
// positions d'arme, placement de chaque arme) avec un aperçu 3D en direct. Chaque pose peut tenir une arme dans une main ou deux.
// Les réglages sont mémorisés par posereg.js et s'appliquent aussitôt ; « Exporter » les écrit dans un fichier pour les reprendre
// comme valeurs d'origine du logiciel.
import { S } from './state.js';
import { esc, setPath, getPath, section, syncRange } from './ui.js';
import { gameItems, WEAPONS } from './engine/games.js';
import { renderModelPreview, HANDS } from './model3d.js';
import { WEAPON_STANCES, poseValues } from './pose3d.js';
import { getItem, setItem, resetItem, resetAll, hasOverride, overrideCount, exportConfig, importConfig, presetsList, customList, addCustom, renameCustom, deleteCustom, beginDraft, saveDraft, endDraft, isDirty, undoDraft, redoDraft, canUndoDraft, canRedoDraft } from './posereg.js';

const API = window.studio;
const $ = (s, r = document) => r.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------ éléments réglables
const KINDS = [['rifle', 'Fusils d\'assaut'], ['pistol', 'Pistolets']];
const allAgents = () => gameItems('valorant', S.extraItems);
const hasModel = key => S.libraryModels.has('g:valorant:' + key);
const POSE_TYPES = ['pose', 'agent', 'custom'];
function items() {
  return [
    { id: 'default', group: 'Pose par défaut (tous les agents)', label: 'Pose par défaut', type: 'pose' },
    { id: '', group: 'Mes poses génériques', label: '', type: 'newcustom' },
    ...customList().map(c => ({ id: 'custom:' + c.id, group: 'Mes poses génériques', label: c.name, type: 'custom', cid: c.id })),
    ...allAgents().map(a => ({ id: 'agent:' + a.key, group: 'Poses par agent', label: a.name, type: 'agent', agent: a.key })),
    ...presetsList().filter(p => !p[0].startsWith('custom:')).map(([k, label]) => ({ id: 'preset:' + k, group: 'Poses prédéfinies (boutons du panneau 3D)', label, type: 'pose' })),
    ...KINDS.flatMap(([kind, title]) => WEAPON_STANCES.map(([k, label]) => ({ id: `stance:${kind}:${k}`, group: 'Positions d\'arme — ' + title, label, type: 'stance', kind, stance: k }))),
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
const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const rows = (key, defs, v) => defs.map(([k, l, min, max, u]) => rg(`${key}.${k}`, l, v[key]?.[k] ?? (key.startsWith('hand') && FINGER_KEYS.includes(k) ? v[key]?.curl : 0) ?? 0, min, max, u || '°')).join('');
const selp = (path, label, value, options) => { const id = 'pl' + (++nid); return `<div class="field"><label for="${id}">${esc(label)}</label><select class="input" id="${id}" data-path="${path}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`; };
const chk = (path, label, value) => { const id = 'pl' + (++nid); return `<label class="toggle" for="${id}"><span>${esc(label)}</span><input type="checkbox" id="${id}" data-path="${path}" ${value ? 'checked' : ''}></label>`; };

function poseControls(data) {
  const v = poseValues(data);
  const hand = (s, title) => section(title, rows('hand' + s, HAND_MAIN, v) + rows('hand' + s, WRIST, v) + section('Articulations des doigts (avancé)', rows('hand' + s, JOINTS, v), false), false);
  return [
    section('Bras gauche', rows('armL', ARM, v), false), section('Bras droit', rows('armR', ARM, v), false),
    section('Épaules', section('Épaule gauche', rows('shL', SHOULDER, v), true) + section('Épaule droite', rows('shR', SHOULDER, v), true), false),
    section('Buste', rows('torso', [['bend', 'Penché en avant', -30, 45], ['lean', 'Penché sur le côté', -30, 30], ['twist', 'Rotation du buste', -60, 60]], v), false),
    section('Tête', rows('head', [['turn', 'Rotation de la tête', -70, 70], ['nod', 'Tête vers le bas', -35, 35], ['tilt', 'Inclinaison de la tête', -35, 35]], v) + '<p class="hint">Regard : les yeux tournent dans le repère de la tête.</p>' + rows('head', [['eyeYaw', 'Regard vers la gauche du perso (+) / la droite (−)', -35, 35], ['eyePitch', 'Regard vers le haut (+) / le bas (−)', -20, 20]], v), false),
    hand('L', 'Main gauche — poignet et doigts'), hand('R', 'Main droite — poignet et doigts'),
    section('Jambes', section('Jambe gauche', rows('legL', LEG, v), true) + section('Jambe droite', rows('legR', LEG, v), true), false),
    section('Pieds', section('Pied gauche', rows('footL', FOOT, v), true) + section('Pied droit', rows('footR', FOOT, v), true), false),
    `<div class="btnrow"><button class="mini-btn" data-act="mirrorLR">Copier gauche → droite</button><button class="mini-btn" data-act="mirrorRL">Copier droite → gauche</button></div>`,
  ].join('');
}
// Visée du fusil par rapport au corps (prefix : « aim » ou « weapon.aim »).
function aimControls(prefix, a) {
  return chk(prefix + '.__on', 'Placer l\'arme par rapport au corps (visée)', !!a)
    + (a ? rg(prefix + '.x', 'Arme vers l\'avant', a.x ?? 0, -0.3, 0.6, '', 0.005) + rg(prefix + '.y', 'Arme en hauteur', a.y ?? 0, -0.6, 0.3, '', 0.005) + rg(prefix + '.z', 'Arme vers la droite', a.z ?? 0, -0.3, 0.3, '', 0.005)
      + rg(prefix + '.pitch', 'Canon vers le bas', a.pitch ?? 0, -90, 90) + rg(prefix + '.yaw', 'Canon vers la gauche', a.yaw ?? 0, -90, 90)
      : '<p class="hint">Désactivé : l\'arme suit la direction de la main qui la tient.</p>');
}
// Arme portée par la pose : arme, mains, visée.
function poseWeaponControls(d) {
  const w = d.weapon;
  let h = selp('weapon.key', 'Arme tenue', w?.key || '', [['', 'Aucune arme'], ...WEAPONS.map(x => [x.key, x.name])]);
  if (w?.key) h += selp('weapon.hand', 'Mains', w.hand || (WEAPONS.find(x => x.key === w.key)?.kind === 'rifle' ? 'RL' : 'R'), HANDS) + aimControls('weapon.aim', w.aim)
    + section('Déplacer l\'arme dans la main', placementControls(w, 'weapon.'), false) + section('Main secondaire', secondaryControls(w, 'weapon.'), false);
  return h;
}
function placementControls(d, p = '') {
  return rg(p + 'scale', 'Taille de l\'arme', d.scale ?? 1, 0.5, 2.4, '×', 0.01)
    + rg(p + 'x', 'Décalage avant / arrière', d.x ?? 0, -0.3, 0.3, ' m', 0.005) + rg(p + 'y', 'Décalage haut / bas', d.y ?? 0, -0.3, 0.3, ' m', 0.005) + rg(p + 'z', 'Décalage gauche / droite', d.z ?? 0, -0.3, 0.3, ' m', 0.005)
    + rg(p + 'rx', 'Roulis de l\'arme', d.rx ?? 0, -180, 180) + rg(p + 'ry', 'Cap de l\'arme', d.ry ?? 0, -180, 180) + rg(p + 'rz', 'Tangage de l\'arme', d.rz ?? 0, -180, 180);
}
function secondaryControls(d, p = '') {
  return rg(p + 'lx', 'Main secondaire avant / arrière', d.lx ?? 0, -0.3, 0.3, ' m', 0.005) + rg(p + 'ly', 'Main secondaire haut / bas', d.ly ?? 0, -0.3, 0.3, ' m', 0.005) + rg(p + 'lz', 'Main secondaire côté', d.lz ?? 0, -0.3, 0.3, ' m', 0.005)
    + rg(p + 'lroll', 'Rotation de la main secondaire', d.lroll ?? 0, -180, 180);
}

// ------------------------------------------------------------------ état et interface
const ST = { open: false, id: 'default', data: {}, agent: null, weapon: { rifle: 'vandal', pistol: 'classic' }, previewStance: 'pret', cam: { rotY: -25, camPitch: 3, zoom3d: 1, target: 0.5, offsetX: 0 }, raf: 0, tries: 0, rename: false };
let root = null;
const previewAgents = () => allAgents().filter(i => hasModel(i.key));

function build() {
  root = document.createElement('div');
  root.id = 'poselab'; root.hidden = true;
  root.innerHTML = `
    <div class="pl-top">
      <strong>Studio de poses</strong>
      <span class="pl-status" id="plStatus"></span>
      <span class="spacer"></span>
      <select class="input" id="plAgent" title="Personnage d'aperçu"></select>
      <button class="ghost-btn" id="plUndo" title="Annuler (Ctrl+Z)">↶ Annuler</button>
      <button class="ghost-btn" id="plRedo" title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
      <button class="primary-btn" id="plSave" title="Applique tes réglages à toutes les affiches">Enregistrer</button>
      <button class="ghost-btn" id="plExport" title="Enregistrer tous les réglages dans un fichier">Exporter</button>
      <button class="ghost-btn" id="plImport" title="Reprendre un fichier exporté (fusionne avec tes réglages)">Importer</button>
      <button class="ghost-btn" id="plResetAll" title="Revenir aux poses d'origine du logiciel">Tout réinitialiser</button>
      <button class="ghost-btn" id="plClose">Fermer</button>
    </div>
    <div class="pl-body">
      <nav class="pl-list" id="plList"></nav>
      <div class="pl-view">
        <canvas id="plCanvas" width="640" height="800"></canvas>
        <div class="pl-cam" id="plCam"></div>
        <div class="pl-hint">Glisse pour tourner autour du personnage, molette pour zoomer. <b>Maj + glisser</b> déplace l'arme (pose avec arme et visée activée).</div>
      </div>
      <div class="pl-ctl"><div class="pl-ctl-head" id="plHead"></div><div id="plControls"></div></div>
    </div>`;
  document.body.appendChild(root);
  $('#plClose', root).onclick = () => closePoseLab();
  $('#plSave', root).onclick = () => { saveDraft(); status(); refreshList(); };
  $('#plUndo', root).onclick = () => stepHistory(undoDraft);
  $('#plRedo', root).onclick = () => stepHistory(redoDraft);
  $('#plExport', root).onclick = doExport; $('#plImport', root).onclick = doImport;
  $('#plResetAll', root).onclick = async () => {
    const ok = API?.confirm ? await API.confirm({ message: 'Revenir aux poses d\'origine ?', detail: 'Tous tes réglages du Studio (poses, poses génériques, armes) seront effacés. Pense à les exporter avant.', ok: 'Tout réinitialiser' }) : confirm('Tout réinitialiser ?');
    if (ok) { resetAll(); if (!find(ST.id)) ST.id = 'default'; refreshList(); selectItem(ST.id); status(); }
  };
  $('#plAgent', root).onchange = e => { ST.agent = e.target.value; preview(); };
  $('#plList', root).onclick = e => {
    const add = e.target.closest('[data-newcustom]');
    if (add) { const inp = $('#plNewName', root), name = (inp.value || '').trim() || `Ma pose ${customList().length + 1}`; const { weapon, ...p } = getItem(ST.id.startsWith('custom:') || ST.id.startsWith('agent:') || ST.id === 'default' ? ST.id : 'default'); const id = addCustom(name, p); refreshList(); selectItem('custom:' + id); return; }
    const b = e.target.closest('[data-id]'); if (b) selectItem(b.dataset.id);
  };
  $('#plList', root).onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'plNewName') $('[data-newcustom]', root).click(); };
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
      if (path.endsWith('.__on')) { const p = path.slice(0, -5); if (el.checked) setPath(ST.data, p, { x: 0.1, y: -0.1, z: 0, pitch: 0, yaw: 0 }); else deepDelete(ST.data, p); }
      else setPath(ST.data, path, el.checked);
      persist(); renderControls();
    } else if (el.tagName === 'SELECT') {
      if (path === '__stance') { ST.previewStance = el.value; preview(); return; }
      if (path === 'weapon.key') { if (el.value) { ST.data.weapon = { ...(ST.data.weapon || {}), key: el.value }; const k = WEAPONS.find(x => x.key === el.value)?.kind; ST.data.weapon.hand ||= k === 'rifle' ? 'RL' : 'R'; ST.data.weapon.aim ||= { x: 0.1, y: -0.1, z: 0, pitch: 0, yaw: 0 }; } else delete ST.data.weapon; }
      else setPath(ST.data, path, el.value);
      persist(); renderControls();
    }
  };
  ctl.onclick = e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'mirrorLR' || b.dataset.act === 'mirrorRL') mirror(b.dataset.act === 'mirrorLR' ? ['L', 'R'] : ['R', 'L']);
  };
  $('#plHead', root).onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const a = b.dataset.act, it = find(ST.id);
    if (a === 'resetItem') { resetItem(ST.id); refreshList(); selectItem(ST.id); }
    if (a === 'fromDefault') { const { weapon, ...p } = getItem('default'); ST.data = { ...p, ...(ST.data.weapon ? { weapon: ST.data.weapon } : {}) }; persist(); renderControls(); }
    if (a === 'rename') { ST.rename = true; renderControls(); const i = $('#plRename', root); i?.focus(); i?.select(); }
    if (a === 'renameOk') { const v = ($('#plRename', root).value || '').trim(); if (v) renameCustom(it.cid, v); ST.rename = false; refreshList(); renderControls(); }
    if (a === 'delete') {
      const ok = API?.confirm ? await API.confirm({ message: `Supprimer la pose « ${it.label} » ?`, detail: 'Elle disparaît des boutons du panneau 3D.', ok: 'Supprimer' }) : confirm('Supprimer ?');
      if (ok) { deleteCustom(it.cid); refreshList(); selectItem('default'); }
    }
  };
  // caméra : glisser pour tourner, molette pour zoomer
  const cv = $('#plCanvas', root);
  cv.onpointerdown = e => { try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ } cv._x = e.clientX; cv._y = e.clientY; cv._mv = e.shiftKey && !!aimTarget(); };
  cv.onpointermove = e => {
    if (cv._x == null) return;
    if (cv._mv) { dragWeapon(e.clientX - cv._x, e.clientY - cv._y, cv); cv._x = e.clientX; cv._y = e.clientY; return; }
    ST.cam.rotY = Math.max(-180, Math.min(180, ST.cam.rotY + (e.clientX - cv._x) * 0.5)); cv._x = e.clientX; preview();
  };
  cv.onpointerup = () => { cv._x = null; cv._mv = false; };
  cv.onwheel = e => { e.preventDefault(); ST.cam.zoom3d = Math.max(0.5, Math.min(4, ST.cam.zoom3d * (e.deltaY < 0 ? 1.08 : 0.92))); preview(); };
  $('#plCam', root).onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const [rotY, camPitch, zoom3d, target, offsetX] = b.dataset.v.split(',').map(Number);
    Object.assign(ST.cam, { rotY, camPitch, zoom3d, target, offsetX }); preview();
  };
  $('#plCam', root).innerHTML = [['Face', '0,3,1,0.5,0'], ['3/4', '-30,3,1,0.5,0'], ['Profil', '-90,3,1,0.5,0'], ['Dos', '180,3,1,0.5,0'], ['Dessus', '-30,55,1,0.5,0'], ['Buste', '-25,3,1.9,0.72,0'], ['Mains', '-40,10,2.6,0.6,0']].map(([l, v]) => `<button class="mini-btn" data-v="${v}">${l}</button>`).join('');
  document.addEventListener('keydown', e => {
    if (!ST.open) return;
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); stepHistory(e.shiftKey ? redoDraft : undoDraft); }
    else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); stepHistory(redoDraft); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); saveDraft(); status(); refreshList(); }
    else if (e.key === 'Escape' && !ST.rename) closePoseLab();
  }, true);
}
function deepDelete(o, path) { const ks = path.split('.'), last = ks.pop(); const p = ks.reduce((a, k) => a?.[k], o); if (p) delete p[last]; }

function stepHistory(fn) { if (!fn()) return; if (!find(ST.id)) ST.id = 'default'; refreshList(); selectItem(ST.id); }
const status = () => {
  $('#plStatus', root).textContent = overrideCount() + ' élément(s) personnalisé(s) · ' + (isDirty() ? 'modifications non enregistrées' : 'tout est enregistré');
  $('#plStatus', root).classList.toggle('warn', isDirty());
  $('#plSave', root).disabled = !isDirty(); $('#plUndo', root).disabled = !canUndoDraft(); $('#plRedo', root).disabled = !canRedoDraft();
};
function persist() {
  // un élément « poseur » (agent / générique) garde uniquement ses réglages
  setItem(ST.id, ST.data);
  const el = $(`[data-id="${CSS.escape(ST.id)}"]`, root); if (el) el.classList.add('mod');
  status(); preview();
}
function refreshList() {
  const list = $('#plList', root), keep = list.scrollTop; let g = '', h = '';
  for (const it of items()) {
    if (it.group !== g) { g = it.group; h += `<div class="pl-group">${esc(g)}</div>`; }
    if (it.type === 'newcustom') { h += `<div class="pl-new"><input class="input" id="plNewName" placeholder="Nom de la nouvelle pose" maxlength="30" spellcheck="false"><button class="mini-btn" data-newcustom>+ Créer</button></div>`; continue; }
    h += `<button data-id="${esc(it.id)}" class="${it.id === ST.id ? 'on' : ''} ${hasOverride(it.id) || it.type === 'custom' ? 'mod' : ''}">${esc(it.label)}${it.type === 'agent' && !hasModel(it.agent) ? ' <small>(sans modèle)</small>' : ''}</button>`;
  }
  list.innerHTML = h; list.scrollTop = keep; status();
}
function selectItem(id) {
  ST.id = id; ST.rename = false; ST.data = getItem(id);
  const it = find(id);
  if (!it) { ST.id = 'default'; ST.data = getItem('default'); return selectItem('default'); }
  if (it.type === 'agent' && hasModel(it.agent)) { ST.agent = it.agent; const sel = $('#plAgent', root); if (sel) sel.value = it.agent; }
  $('#plList', root).querySelectorAll('[data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  renderControls(); preview();
}
function renderControls() {
  const it = find(ST.id), d = ST.data;
  const btn = (act, label, dis, danger) => `<button class="mini-btn ${danger ? 'danger' : ''}" data-act="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
  let head;
  if (it.type === 'custom') head = ST.rename
    ? `<div class="pl-ren"><input class="input" id="plRename" value="${esc(it.label)}" maxlength="30" spellcheck="false"> ${btn('renameOk', 'OK')}</div>`
    : `<div><strong>${esc(it.label)}</strong><small>${esc(it.group)} · apparaît dans les boutons de pose du panneau 3D</small></div><div class="btnrow">${btn('fromDefault', 'Partir de la pose par défaut')}${btn('rename', 'Renommer')}${btn('delete', 'Supprimer', false, true)}</div>`;
  else if (it.type === 'agent') head = `<div><strong>${esc(it.label)}</strong><small>Pose de cet agent quand tu ne la règles pas à la main${hasOverride(ST.id) ? '' : ' · pour l\'instant : la pose par défaut'}</small></div><div class="btnrow">${btn('fromDefault', 'Partir de la pose par défaut')}${btn('resetItem', 'Revenir à l\'origine', !hasOverride(ST.id))}</div>`;
  else head = `<div><strong>${esc(it.label)}</strong><small>${esc(it.group)}</small></div>${btn('resetItem', 'Revenir à l\'origine', !hasOverride(ST.id))}`;
  $('#plHead', root).innerHTML = head;
  const stanceSel = `<div class="field"><label>Position utilisée pour l'aperçu</label><select class="input" data-path="__stance">${[...WEAPON_STANCES].map(([k, l]) => `<option value="${k}" ${k === ST.previewStance ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  let h = '';
  if (POSE_TYPES.includes(it.type) || it.id.startsWith('preset:')) h = (it.type === 'agent' ? section('Orientation par défaut', rg('rotY', 'Rotation de l\'agent dans une scène', d.rotY ?? 0, -180, 180) + '<p class="hint">S\'ajoute à la rotation réglée sur le personnage quand cet agent est placé dans une affiche.</p>', true) : '') + section('Arme de la pose', poseWeaponControls(d), !!d.weapon?.key) + poseControls(d);
  else if (it.type === 'stance') {
    const prev = WEAPONS.filter(w => w.kind === it.kind).map(w => `<option value="${w.key}" ${ST.weapon[it.kind] === w.key ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
    const hand = d.hand || (d.both ?? it.kind === 'rifle' ? 'RL' : 'R');
    h = `<div class="field"><label>Arme d'aperçu</label><select class="input" id="plWeapon">${prev}</select></div>`
      + section('Arme', selp('hand', 'Mains', hand, HANDS) + aimControls('aim', d.aim), true)
      + section('Déplacer l\'arme dans la main', placementControls(d), false) + section('Main secondaire', secondaryControls(d), false) + poseControls(d);
  } else if (it.type === 'weapon') {
    h = stanceSel + section('Placement dans la main principale', placementControls(d), true) + section('Main secondaire', secondaryControls(d), true)
      + `<p class="hint">Ces réglages s'appliquent à toutes les affiches. Pour régler les doigts, choisis une pose ou une position d'arme dans la liste.</p>`;
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
const PLACE = ['scale', 'x', 'y', 'z', 'rx', 'ry', 'rz', 'lx', 'ly', 'lz', 'lroll'];
const placeOf = d => Object.fromEntries(PLACE.filter(k => d[k] != null).map(k => [k, d[k]]));
function previewLayer() {
  const it = find(ST.id), d = ST.data, ag = ST.agent;
  let pose, weapon = null;
  if (it.type === 'stance') { const { both, aim, hand, ...p } = d; pose = { on: true, ...p }; weapon = { ...placeOf(d), key: ST.weapon[it.kind], hand: hand || (both ?? it.kind === 'rifle' ? 'RL' : 'R'), both, aim }; }
  else if (it.type === 'weapon') { const { both, aim, hand, ...p } = getItem(`stance:${it.kind}:${ST.previewStance}`); pose = { on: true, ...p }; weapon = { ...d, key: it.key, hand: hand || (both ?? it.kind === 'rifle' ? 'RL' : 'R'), both, aim }; }
  else { const { weapon: w, ...p } = d; pose = { on: true, ...p }; weapon = w?.key ? w : null; }
  return { id: 'poselab-preview', type: 'model', model: 'g:valorant:' + ag, x: 0, y: 0, w: 640, h: 800, rot: 0, ...ST.cam, fov: 28, anim: 0, animTime: 0,
    key: { color: '#ffffff', intensity: 1.5, angle: -35 }, rim: { color: '#7ab8ff', intensity: 2, angle: 150 }, fill: { color: '#ffffff', intensity: 0.7 }, ambient: { color: '#ffffff', intensity: 0.8 }, pose, weapon };
}
// Objet « visée » de l'élément en cours (pose avec arme, ou position d'arme), sinon null.
function aimTarget() {
  const it = find(ST.id); if (!it) return null;
  if (it.type === 'stance') return ST.data.aim ? ST.data : null;
  if (POSE_TYPES.includes(it.type) || it.id.startsWith('preset:')) return ST.data.weapon?.aim ? ST.data.weapon : null;
  return null;
}
// Déplace l'arme avec la souris : le glissé est converti en mètres dans le repère du personnage (avant, haut, côté) selon l'angle de caméra.
function dragWeapon(dx, dy, cv) {
  const t = aimTarget(); if (!t) return;
  const a = t.aim, r = cv.getBoundingClientRect(), k = (cv.width / r.width) / (680 * ST.cam.zoom3d); // pixels d'écran → hauteurs de personnage
  const ux = dx * k, uy = -dy * k, ry = (ST.cam.rotY * Math.PI) / 180;
  a.z = (a.z ?? 0) - ux * Math.cos(ry); a.x = (a.x ?? 0) + ux * Math.sin(ry); a.y = (a.y ?? 0) + uy;
  persist(); renderControls();
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
    const what = importConfig(r.data, r.filePath, allAgents().map(a => a.key));
    refreshList(); selectItem(find(ST.id) ? ST.id : 'default');
    $('#plStatus', root).textContent = `Importé (${what.join(', ') || 'rien de nouveau'}) : ${r.filePath}`;
  } catch (err) { $('#plStatus', root).textContent = 'Import impossible : ' + err.message; }
}

export function openPoseLab() {
  if (!root) build();
  const list = previewAgents();
  if (!list.length) { alert('Ajoute d\'abord un personnage 3D (Bibliothèque ou pack 3D) pour utiliser le Studio de poses.'); return; }
  if (!ST.open) beginDraft();
  ST.open = true; root.hidden = false;
  if (!ST.agent || !list.find(a => a.key === ST.agent)) ST.agent = (list.find(a => a.key === 'jett') || list[0]).key;
  $('#plAgent', root).innerHTML = list.map(a => `<option value="${a.key}" ${a.key === ST.agent ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  refreshList(); selectItem(find(ST.id) ? ST.id : 'default');
}
export async function closePoseLab() {
  if (!root || !ST.open) return;
  if (isDirty()) {
    const ask = o => (API?.confirm ? API.confirm(o) : Promise.resolve(confirm(o.message)));
    if (await ask({ message: 'Enregistrer tes changements ?', detail: 'Ils s\'appliqueront à toutes les affiches. Sinon ils seront perdus.', ok: 'Enregistrer' })) endDraft(true);
    else if (await ask({ message: 'Abandonner tes changements ?', detail: 'Les réglages non enregistrés seront perdus.', ok: 'Abandonner' })) endDraft(false);
    else return;
  } else endDraft(false);
  root.hidden = true; ST.open = false;
  document.dispatchEvent(new CustomEvent('poselab:closed'));   // les poses ont pu changer : l'application rafraîchit ses listes et ses affiches
}
void getPath;
