// Créateur de livrées (plein écran) pour les voitures Rocket League : couleurs, brillance, lueur, logo MyBad, images, textes, étoiles et bandes.
// Chaque modification est enregistrée tout de suite ; les livrées se choisissent ensuite dans l'onglet 3D (section Voiture) de chaque voiture.
import { S } from './state.js';
import { esc, setPath, getPath, section, range, select, toggle, textInput, syncRange, pct, deg } from './ui.js';
import { renderModelPreview } from './model3d.js';
import { allLiveries, getDef, cloneDef, saveDef, createLivery, renameLivery, deleteLivery, resetLivery, isBuiltin, hasOverride, newLayer, exportLiveries, importLiveries, onLiveryChange, FONTS, CARS } from './livery.js';

const API = window.studio;
const $ = (s, r = document) => r.querySelector(s);
const ST = { open: false, id: 'nuit', def: null, car: 'octane', cam: { rotY: 330, camPitch: 10, zoom3d: 0.95, target: 0.5, offsetX: 0 }, sel: null, perCar: false, rename: false, hist: [], hi: -1, raf: 0, tries: 0, t: 0 };
let root = null;

const KIND = { logo: 'Logo MyBad', star: 'Étoile', image: 'Image', text: 'Texte', stripe: 'Bande' };
const layerName = L => (L.kind === 'text' ? `Texte « ${(L.text || '').slice(0, 18)} »` : KIND[L.kind]) + ((L.face || 'side') === 'top' ? ' · dessus' : '');
const lv = (L, k) => L.ov?.[ST.car]?.[k] ?? L[k];
const PER_CAR = ['x', 'y', 'size', 'rot'];

function build() {
  root = document.createElement('div');
  root.id = 'liverylab'; root.hidden = true;
  root.innerHTML = `
    <div class="pl-top">
      <strong>Créateur de livrées</strong>
      <span class="pl-status" id="llStatus">Rocket League · tout est enregistré tout de suite</span>
      <span class="spacer"></span>
      <select class="input" id="llCar" title="Voiture d'aperçu">${CARS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <button class="ghost-btn" id="llUndo" title="Annuler (Ctrl+Z)">↶ Annuler</button>
      <button class="ghost-btn" id="llRedo" title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
      <button class="ghost-btn" id="llExport" title="Enregistrer toutes tes livrées dans un fichier">Exporter</button>
      <button class="ghost-btn" id="llImport" title="Reprendre un fichier exporté">Importer</button>
      <button class="ghost-btn" id="llClose">Fermer</button>
    </div>
    <div class="pl-body">
      <nav class="pl-list" id="llList"></nav>
      <div class="pl-view">
        <canvas id="llCanvas" width="640" height="520"></canvas>
        <div class="pl-cam" id="llCam"></div>
        <div class="pl-hint">Glisse pour tourner autour de la voiture, molette pour zoomer. Le flanc est le même des deux côtés.</div>
      </div>
      <div class="pl-ctl"><div class="pl-ctl-head" id="llHead"></div><div id="llControls"></div></div>
    </div>
    <input type="file" id="llFile" accept="image/*" hidden>`;
  document.body.appendChild(root);
  $('#llClose', root).onclick = closeLiveryLab;
  $('#llUndo', root).onclick = () => step(-1); $('#llRedo', root).onclick = () => step(1);
  $('#llExport', root).onclick = doExport; $('#llImport', root).onclick = doImport;
  $('#llCar', root).onchange = e => { ST.car = e.target.value; renderControls(); preview(); };

  $('#llList', root).onclick = e => {
    const n = e.target.closest('[data-new]');
    if (n) { const name = ($('#llNewName', root).value || '').trim() || 'Ma livrée'; const id = createLivery(name, ST.def); refreshList(); select_(id); return; }
    const b = e.target.closest('[data-id]'); if (b) select_(b.dataset.id);
  };
  $('#llList', root).onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'llNewName') $('[data-new]', root).click(); };

  const cv = $('#llCanvas', root);
  cv.onpointerdown = e => { try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ } cv._x = e.clientX; };
  cv.onpointermove = e => { if (cv._x == null) return; ST.cam.rotY = (ST.cam.rotY + (e.clientX - cv._x) * 0.6 + 360) % 360; cv._x = e.clientX; preview(); };
  cv.onpointerup = () => { cv._x = null; };
  cv.onwheel = e => { e.preventDefault(); ST.cam.zoom3d = Math.max(0.5, Math.min(3, ST.cam.zoom3d * (e.deltaY < 0 ? 1.08 : 0.92))); preview(); };
  $('#llCam', root).innerHTML = [['3/4', '330,10,0.95'], ['Profil', '0,6,0.95'], ['Autre flanc', '180,6,0.95'], ['Face', '270,10,1.05'], ['Dos', '90,10,1.05'], ['Dessus', '270,60,0.95']].map(([l, v]) => `<button class="mini-btn" data-v="${v}">${l}</button>`).join('');
  $('#llCam', root).onclick = e => { const b = e.target.closest('button[data-v]'); if (!b) return; const [rotY, camPitch, zoom3d] = b.dataset.v.split(',').map(Number); Object.assign(ST.cam, { rotY, camPitch, zoom3d }); preview(); };

  const ctl = $('#llControls', root);
  ctl.oninput = e => { const el = e.target; if (!el.dataset.p) return; if (el.type === 'range' || el.type === 'color' || el.type === 'text') apply(el, false); };
  ctl.onchange = e => { const el = e.target; if (!el.dataset.p || el.type === 'range' || el.type === 'color') return; apply(el, true); };
  ctl.onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, i = +b.dataset.i;
    const L = ST.def.layers;
    if (a.startsWith('add-')) { const k = a.slice(4); const nl = newLayer(k, k === 'text' ? { text: 'MYBAD' } : {}); L.push(nl); ST.sel = nl.id; if (k === 'image') { change(true); $('#llFile', root).click(); return; } change(true); return; }
    if (a === 'pick') { ST.sel = L[i].id; renderControls(); return; }
    if (a === 'vis') { L[i].visible = L[i].visible === false; change(true); return; }
    if (a === 'up' && i < L.length - 1) { [L[i], L[i + 1]] = [L[i + 1], L[i]]; change(true); return; }
    if (a === 'down' && i > 0) { [L[i], L[i - 1]] = [L[i - 1], L[i]]; change(true); return; }
    if (a === 'dup') { const c = JSON.parse(JSON.stringify(L[i])); c.id = newLayer('star').id; L.splice(i + 1, 0, c); ST.sel = c.id; change(true); return; }
    if (a === 'del') { L.splice(i, 1); if (!L.find(l => l.id === ST.sel)) ST.sel = null; change(true); return; }
    if (a === 'img') { $('#llFile', root).click(); return; }
    if (a === 'rename') { ST.rename = true; renderHead(); const inp = $('#llRename', root); inp?.focus(); inp?.select(); return; }
    if (a === 'renameOk') { const v = ($('#llRename', root).value || '').trim(); if (v) { ST.def.name = v; renameLivery(ST.id, v); } ST.rename = false; refreshList(); renderHead(); return; }
    if (a === 'reset') { resetLivery(ST.id); loadDef(); change(false, true); return; }
    if (a === 'delete') delLivery();
    if (a === 'dupLivery') { const id = createLivery(ST.def.name + ' (copie)', ST.def); refreshList(); select_(id); }
  };
  $('#llFile', root).onchange = e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 640 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const L = ST.def.layers.find(l => l.id === ST.sel && l.kind === 'image') || ST.def.layers.filter(l => l.kind === 'image').pop();
        if (L) { L.src = c.toDataURL('image/png'); ST.sel = L.id; change(true); }
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  };
  document.addEventListener('keydown', e => {
    if (!ST.open) return;
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !['range', 'checkbox', 'color'].includes(e.target.type);
    if ((e.ctrlKey || e.metaKey) && !typing && /^[zZ]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); step(e.shiftKey ? 1 : -1); }
    else if ((e.ctrlKey || e.metaKey) && !typing && /^[yY]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); step(1); }
    else if (e.key === 'Escape' && !ST.rename) closeLiveryLab();
  }, true);
  onLiveryChange(() => { if (ST.open) preview(); });
}

// ------------------------------------------------------------------ édition
function apply(el, structural) {
  const p = el.dataset.p; let v;
  if (p === 'x:perCar') { ST.perCar = el.checked; renderControls(); return; }
  if (el.type === 'checkbox') v = el.checked; else if (el.type === 'range') v = +el.value; else v = el.value;
  if (el.dataset.num) v = +v;
  const [scope, key] = [p.slice(0, 1), p.slice(2)];
  if (scope === 'd') setPath(ST.def, key, v);
  else {
    const L = ST.def.layers.find(l => l.id === ST.sel); if (!L) return;
    if (PER_CAR.includes(key) && ST.perCar) { ((L.ov ||= {})[ST.car] ||= {})[key] = v; }
    else { L[key] = v; if (L.ov?.[ST.car]) delete L.ov[ST.car][key]; }
  }
  if (el.type === 'range') syncRange(el, el.dataset.deg ? deg(v) : (el.dataset.px ? Math.round(v) + ' px' : pct(v)));
  if (el.type === 'text' && p === 'l:text') { const n = $('.ll-row.on .ll-name', root); if (n) n.textContent = layerName(ST.def.layers.find(l => l.id === ST.sel)); }
  change(structural && !(el.type === 'text'));
}
function change(rebuild, quiet) {
  if (!quiet) saveDef(ST.id, ST.def);
  clearTimeout(ST.t); ST.t = setTimeout(commit, 350);
  if (rebuild) renderControls();
  status(); preview();
}
function commit() {
  const s = JSON.stringify(ST.def);
  if (ST.hist[ST.hi] === s) return;
  ST.hist = ST.hist.slice(0, ST.hi + 1); ST.hist.push(s); if (ST.hist.length > 80) ST.hist.shift(); ST.hi = ST.hist.length - 1; status();
}
function step(d) {
  clearTimeout(ST.t); commit();
  const i = ST.hi + d; if (i < 0 || i >= ST.hist.length) return;
  ST.hi = i; ST.def = JSON.parse(ST.hist[i]); saveDef(ST.id, ST.def);
  if (!ST.def.layers.find(l => l.id === ST.sel)) ST.sel = null;
  renderControls(); status(); preview();
}
function status() {
  const u = $('#llUndo', root), r = $('#llRedo', root); if (!u) return;
  u.disabled = ST.hi <= 0; r.disabled = ST.hi >= ST.hist.length - 1;
}

// ------------------------------------------------------------------ liste et sélection
function refreshList() {
  const list = $('#llList', root), keep = list.scrollTop, all = allLiveries();
  const row = l => `<button data-id="${esc(l.id)}" class="${l.id === ST.id ? 'on' : ''} ${l.modified ? 'mod' : ''}">${esc(l.name)}</button>`;
  list.innerHTML = `<div class="pl-group">Livrées fournies</div>${all.filter(l => l.builtin).map(row).join('')}
    <div class="pl-group">Mes livrées</div>
    <div class="pl-new"><input class="input" id="llNewName" placeholder="Nom de la nouvelle livrée" maxlength="30" spellcheck="false"><button class="mini-btn" data-new>+ Créer</button></div>
    <p class="hint" style="padding:0 6px 6px">La nouvelle livrée est une copie de celle qui est ouverte.</p>
    ${all.filter(l => !l.builtin).map(row).join('') || '<p class="hint" style="padding:0 6px">Aucune pour l\'instant.</p>'}`;
  list.scrollTop = keep;
}
function loadDef() { ST.def = cloneDef(ST.id); ST.hist = [JSON.stringify(ST.def)]; ST.hi = 0; if (!ST.def.layers.find(l => l.id === ST.sel)) ST.sel = null; }
function select_(id) {
  if (!getDef(id)) id = 'nuit';
  ST.id = id; ST.rename = false; loadDef(); refreshList(); renderHead(); renderControls(); status(); preview();
}
async function delLivery() {
  const ok = API?.confirm ? await API.confirm({ message: `Supprimer la livrée « ${ST.def.name} » ?`, detail: 'Les voitures qui l\'utilisent reviennent à la peinture d\'origine.', ok: 'Supprimer' }) : confirm('Supprimer cette livrée ?');
  if (ok) { deleteLivery(ST.id); refreshList(); select_('nuit'); }
}

// ------------------------------------------------------------------ panneau de réglages
const colorRow = (p, label, v) => `<label class="llcol"><span>${esc(label)}</span><input type="color" data-p="${p}" value="${/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff'}"></label>`;
const rg = (p, label, v, min, max, step, o = {}) => range(p, label, v, min, max, step, o.deg ? deg : o.px ? (x => Math.round(x) + ' px') : pct).replace('<input type="range"', `<input type="range" data-p="${p}" ${o.deg ? 'data-deg="1"' : ''} ${o.px ? 'data-px="1"' : ''}`);
function renderHead() {
  const user = !isBuiltin(ST.id), mod = hasOverride(ST.id);
  $('#llHead', root).innerHTML = ST.rename
    ? `<div class="pl-ren"><input class="input" id="llRename" value="${esc(ST.def.name)}" maxlength="30" spellcheck="false"><button class="mini-btn" data-a="renameOk">OK</button></div>`
    : `<div><strong>${esc(ST.def.name)}</strong><small>${user ? 'Ta livrée' : 'Livrée fournie' + (mod ? ' · modifiée' : ' · modifiable')}</small></div>
       <div class="btnrow">${user ? '<button class="mini-btn" data-a="rename">Renommer</button>' : ''}<button class="mini-btn" data-a="dupLivery">Dupliquer</button>${user ? '<button class="mini-btn danger" data-a="delete">Supprimer</button>' : `<button class="mini-btn" data-a="reset" ${mod ? '' : 'disabled'}>Revenir à l'origine</button>`}</div>`;
}
function layerPanel(L) {
  const car = CARS.find(c => c[0] === ST.car)[1], side = (L.face || 'side') === 'side', big = L.kind === 'text' ? [0.02, 0.3] : [0.02, 1.2];
  let h = select('l:face', 'Placé sur', L.face || 'side', [['side', 'Flanc (les deux côtés)'], ['top', 'Dessus (toit et capot)']], { raw: true }).replace('<select', '<select data-p="l:face"');
  h += `<div class="hint">Sur le flanc, l'avant de la voiture est à droite${side ? '' : ' ; sur le dessus, l\'avant est en haut'}.</div>`;
  h += rg('l:x', 'Position horizontale', lv(L, 'x'), 0, 1, 0.005) + rg('l:y', 'Position verticale', lv(L, 'y'), 0, 1, 0.005);
  if (L.kind === 'stripe') h += rg('l:len', 'Longueur', L.len ?? 1, 0.05, 1.6, 0.01) + rg('l:thick', 'Épaisseur', L.thick ?? 6, 1, 160, 1, { px: 1 });
  else h += rg('l:size', L.kind === 'text' ? 'Taille du texte' : 'Taille', lv(L, 'size'), big[0], big[1], 0.002);
  h += rg('l:rot', 'Rotation', lv(L, 'rot') || 0, -180, 180, 1, { deg: 1 });
  if (L.kind !== 'image') h += colorRow('l:color', L.kind === 'logo' ? 'Couleur du logo (haut)' : 'Couleur', L.color);
  if (L.kind === 'logo') h += colorRow('l:color2', 'Couleur du logo (bas)', L.color2) + toggle('l:star', 'Avec l\'étoile', L.star).replace('<input', '<input data-p="l:star"');
  if (L.kind === 'text') h += textInput('l:text', 'Texte', L.text).replace('<input', '<input data-p="l:text"') + select('l:font', 'Police', L.font || 'Montserrat', FONTS.map(f => [f, f]), { raw: true }).replace('<select', '<select data-p="l:font"')
    + select('l:weight', 'Graisse', String(L.weight || 800), [['400', 'Normale'], ['700', 'Gras'], ['800', 'Très gras']], { raw: true }).replace('<select', '<select data-num="1" data-p="l:weight"') + toggle('l:italic', 'Italique', L.italic).replace('<input', '<input data-p="l:italic"');
  if (L.kind === 'image') h += `<div class="btnrow"><button class="mini-btn" data-a="img">${L.src ? 'Changer l\'image' : 'Choisir une image'}</button></div>` + (L.src ? `<img class="ll-thumb" src="${L.src}" alt="">` : '<p class="hint">Un PNG sans fond donne le meilleur résultat (logo d\'équipe, sponsor).</p>');
  h += rg('l:opacity', 'Opacité', L.opacity ?? 1, 0, 1, 0.01);
  if (L.kind !== 'image') h += rg('l:glow', 'Lueur', L.glow ?? 0, 0, 1, 0.01);
  h += toggle('perCar', `Réglage propre à ${car}`, ST.perCar).replace('<input', '<input data-p="x:perCar"') + `<div class="hint">Activé, la position, la taille et la rotation que tu changes ne valent que pour ${car} : utile pour recaler un logo qui tombe sur un pli de carrosserie.</div>`;
  return h;
}
function renderControls() {
  const d = ST.def; if (!d) return;
  const sel = d.layers.find(l => l.id === ST.sel);
  let h = section('Carrosserie', colorRow('d:base.0', 'Couleur du haut', d.base[0]) + colorRow('d:base.1', 'Couleur du bas', d.base[1])
    + rg('d:gloss', 'Brillance (vernis)', d.gloss ?? 0.7, 0, 1, 0.01) + rg('d:metal', 'Effet métallisé', d.metal ?? 0.45, 0, 1, 0.01)
    + colorRow('d:glow.color', 'Lueur du bas de caisse', d.glow?.color) + rg('d:glow.amount', 'Intensité de la lueur', d.glow?.amount ?? 0, 0, 1, 0.01), true);
  const rows = d.layers.map((L, i) => `<div class="ll-row ${L.id === ST.sel ? 'on' : ''} ${L.visible === false ? 'off' : ''}">
      <button data-a="vis" data-i="${i}" title="Afficher / masquer">${L.visible === false ? '○' : '●'}</button>
      <button class="ll-name" data-a="pick" data-i="${i}">${esc(layerName(L))}</button>
      <button data-a="up" data-i="${i}" title="Passer devant">↑</button><button data-a="down" data-i="${i}" title="Passer derrière">↓</button>
      <button data-a="dup" data-i="${i}" title="Dupliquer">⧉</button><button data-a="del" data-i="${i}" title="Supprimer">✕</button></div>`).reverse().join('');
  h += section('Calques (du dessus au dessous)', `<div class="ll-add">${Object.entries(KIND).map(([k, n]) => `<button class="mini-btn" data-a="add-${k}">+ ${n}</button>`).join('')}</div>${rows || '<p class="hint">Aucun calque.</p>'}`, true);
  if (sel) h += section('Calque sélectionné : ' + layerName(sel), layerPanel(sel), true);
  const box = $('#llControls', root), keep = box.scrollTop;
  box.innerHTML = h; box.scrollTop = keep;
  renderHead();
}

// ------------------------------------------------------------------ aperçu
function previewLayer() {
  return { id: 'livery-preview', type: 'model', model: 'g:rl:' + ST.car, x: 0, y: 0, w: 640, h: 520, rot: 0, ...ST.cam, fov: 30, anim: 0, animTime: 0, livery: ST.id, envLight: 0.9,
    key: { color: '#eef2ff', intensity: 1.7, angle: -45 }, rim: { color: '#7ab8ff', intensity: 2, angle: 160 }, fill: { color: '#c9d4ff', intensity: 0.6 }, ambient: { color: '#8ea3e8', intensity: 0.7 } };
}
function preview() {
  if (!ST.open || ST.raf) return;
  ST.raf = requestAnimationFrame(() => {
    ST.raf = 0;
    const cv = $('#llCanvas', root), ctx = cv.getContext('2d');
    let out = null;
    try { out = renderModelPreview(previewLayer(), 640, 520, S.doc.theme); } catch (err) { console.error('Créateur de livrées', err); }
    if (out) { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(out, 0, 0, cv.width, cv.height); ST.tries = 0; }
    else if (ST.tries++ < 60) setTimeout(() => { if (ST.open) preview(); }, 350);
  });
}

// ------------------------------------------------------------------ export / import
async function doExport() {
  const data = exportLiveries(), st = $('#llStatus', root);
  try {
    const p = API?.saveText ? await API.saveText({ data, suggested: 'liverees-mybad.json' }) : null;
    if (p) st.textContent = 'Exporté : ' + p;
    else if (!API?.saveText) { await navigator.clipboard.writeText(data); st.textContent = 'Livrées copiées dans le presse-papiers'; }
  } catch (err) { st.textContent = 'Export impossible : ' + err.message; }
}
async function doImport() {
  const st = $('#llStatus', root);
  try {
    const r = await API?.openText?.(); if (!r) return;
    const n = importLiveries(r.data); refreshList(); select_(getDef(ST.id) ? ST.id : 'nuit'); st.textContent = `Importé : ${n} livrée(s)`;
  } catch (err) { st.textContent = 'Import impossible : ' + err.message; }
}

export function openLiveryLab(id) {
  if (!root) build();
  ST.open = true; root.hidden = false;
  $('#llCar', root).value = ST.car;
  select_(id && getDef(id) ? id : (getDef(ST.id) ? ST.id : 'nuit'));
}
export function closeLiveryLab() {
  if (!root || !ST.open) return;
  clearTimeout(ST.t); root.hidden = true; ST.open = false;
  document.dispatchEvent(new CustomEvent('poselab:closed'));   // rafraîchit le panneau 3D et les affiches
}
void getPath;
