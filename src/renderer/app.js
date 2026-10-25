// MyBad Creator — démarrage, barre d'outils, fichiers, export, kit de marque, bibliothèque et mises à jour.
import { S, API, on, emit, change, setDoc, normalize, select, selected, layerById, undo, redo, canUndo, canRedo, flushHistory, setDirty, resetHistory, toast } from './state.js';
import { newDocument, applyTemplate, renderDoc, FORMATS, THEMES, setGameDefaults } from './engine/render.js';
import { TEMPLATES } from './engine/templates.js';
import { makeEnv, docImageUrls, whenLoaded, onImageLoaded } from './engine/assets.js';
import { GAMES, gameItems } from './engine/games.js';
import { $, $$, esc, icon } from './ui.js';
import { initEditor, requestRender, fit, zoomTo, getZoom, setTool, addLayer, pasteLayers, copySelected } from './editor.js';
import * as P from './panels.js';
import { initModels, modelEnv, modelProps, modelPropAction, newModelLayer, preloadModels } from './model3d.js';

// ---------------------------------------------------------------- environnement de rendu
function env(doc = S.doc, exporting = false, thumb = false) {
  return makeEnv(doc, S.library, { exporting, extraItems: S.extraItems, model3d: thumb ? null : modelEnv(doc, exporting) });
}
P.actions.env = (d, exp, thumb) => env(d, exp, thumb);

// ---------------------------------------------------------------- onglets & interface
let tab = 'props';
function setTab(t) {
  tab = t;
  $$('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== t; });
  refreshTab();
}
function refreshTab() {
  if (tab === 'props') P.renderProps();
  if (tab === 'content') P.renderContent();
  if (tab === 'theme') P.renderTheme();
  if (tab === 'library') P.renderLibrary();
}
function buildFormats() {
  $('#fmtSeg').innerHTML = Object.entries(FORMATS).map(([k, f]) => `<button data-k="${k}" class="${S.doc.fmt === k ? 'on' : ''}">${f.label}<small>${esc(f.hint)}</small></button>`).join('');
}
function buildGame() {
  $('#gameSeg').innerHTML = Object.values(GAMES).map(g => `<button data-g="${g.key}" class="${S.doc.game === g.key ? 'on' : ''}">${esc(g.name)}</button>`).join('');
}
function updateUndo() { $('#btnUndo').disabled = !canUndo(); $('#btnRedo').disabled = !canRedo(); }
function updateTitle() { $('#projName').textContent = S.projectName; $('#projName').classList.toggle('dirty', S.dirty); }
function updateStatus() {
  const F = FORMATS[S.doc.fmt];
  $('#stFmt').textContent = `${F.w} × ${F.h} px · ${TEMPLATES[S.doc.tpl].name} · ${GAMES[S.doc.game].name}`;
}

// ---------------------------------------------------------------- changements de modèle / format / jeu
function switchTemplate(key) {
  if (key === S.doc.tpl) return;
  change(d => applyTemplate(d, key), { immediate: true, full: true });
  select([]);
  P.markGallery(); updateStatus();
  if (tab === 'content') P.renderContent();
}
P.actions.switchTemplate = switchTemplate;
$('#fmtSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.k === S.doc.fmt) return;
  change(d => { d.fmt = b.dataset.k; applyTemplate(d, d.tpl); }, { immediate: true, full: true });
  buildFormats(); updateStatus(); P.scheduleThumbs();
  toast('Format changé : le modèle a été remis en page (Ctrl+Z pour revenir)');
});
$('#gameSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.dataset.g === S.doc.game) return;
  change(d => { setGameDefaults(d, b.dataset.g, S.kit); applyTemplate(d, d.tpl); }, { immediate: true, full: true });
  buildGame(); updateStatus(); P.scheduleThumbs(); refreshTab();
  toast(`Mode ${GAMES[b.dataset.g].name}`);
});

// ---------------------------------------------------------------- images
let pick = null;
function pickFile(accept, cb, multiple = false) {
  const fi = $('#fileInput'); fi.value = ''; fi.accept = accept; fi.multiple = multiple;
  pick = cb; fi.click();
}
$('#fileInput').addEventListener('change', e => { const files = [...e.target.files]; if (files.length && pick) pick(multiple() ? files : files[0]); });
const multiple = () => $('#fileInput').multiple;

export function fileToDataUrl(file, max = 2400) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const r = Math.min(1, max / Math.max(im.width, im.height));
        if (r === 1 && file.type !== 'image/gif') { res(fr.result); return; }
        const cv = document.createElement('canvas'); cv.width = Math.round(im.width * r); cv.height = Math.round(im.height * r);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        res(file.type === 'image/jpeg' ? cv.toDataURL('image/jpeg', 0.93) : cv.toDataURL('image/png'));
      };
      im.onerror = () => rej(new Error('image'));
      im.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
async function imageLayerFromFile(file, at) {
  if (!/^image\//.test(file.type)) { toast('Ce fichier n\'est pas une image (PNG, JPG, WEBP).', true); return; }
  const url = await fileToDataUrl(file);
  const id = 'img' + Date.now().toString(36);
  const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
  const W = S.doc.W, H = S.doc.H;
  const k = Math.min(W * 0.7 / im.width, H * 0.7 / im.height, 1);
  const w = im.width * k, h = im.height * k;
  change(d => { d.assets[id] = url; }, { immediate: false });
  addLayer({ type: 'image', name: file.name.replace(/\.[^.]+$/, '') || 'Image', asset: 'u:' + id, fit: 'contain', anchor: 'center', x: (at ? at[0] : W / 2) - w / 2, y: (at ? at[1] : H / 2) - h / 2, w, h });
}
P.actions.importImageLayer = () => pickFile('image/*', f => imageLayerFromFile(f));
P.actions.replaceImage = L => pickFile('image/*', async f => {
  const url = await fileToDataUrl(f); const id = 'img' + Date.now().toString(36);
  change(d => { d.assets[id] = url; const l = d.layers.find(x => x.id === L.id); l.asset = 'u:' + id; l.ph = l.ph === 'logo' ? 'logo' : undefined; }, { immediate: true });
  P.renderProps();
});
// coller une image du presse-papiers
window.addEventListener('paste', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const file = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
  if (file) { e.preventDefault(); imageLayerFromFile(file); return; }
  if (pasteLayers()) e.preventDefault();
});
// glisser-déposer
let dragDepth = 0;
window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
  if (e.target.closest('#layersList')) return;
  const files = [...e.dataTransfer.files];
  for (const f of files) {
    if (/\.mybad$/i.test(f.name)) { const p = API?.pathForFile(f); if (p) loadFrom(await API.openPath(p)); continue; }
    if (/\.(glb|gltf|zip)$/i.test(f.name)) { await P.actions.libraryAction('glbFile', S.doc.game, null, f); continue; }
    await imageLayerFromFile(f);
  }
});

// ---------------------------------------------------------------- détourage
P.actions.removeBg = async L => {
  const url = S.doc.assets[L.asset.slice(2)]; if (!url) return;
  const t = progressToast('Détourage en cours…');
  try {
    const { removeBackground } = await import('./bgremove.js');
    const out = await removeBackground(url, p => t.set(p));
    const id = 'img' + Date.now().toString(36);
    change(d => { d.assets[id] = out; const l = d.layers.find(x => x.id === L.id); l.asset = 'u:' + id; }, { immediate: true });
    t.done('Fond retiré');
  } catch (err) { console.error(err); t.fail('Le détourage a échoué : ' + (err.message || err)); }
};

// ---------------------------------------------------------------- bibliothèque (renders et modèles 3D)
async function refreshLibrary() {
  if (!API) return;
  const lib = await API.libraryList();
  S.library = new Map(Object.entries(lib.png || {}));
  S.libraryModels = new Map(Object.entries(lib.glb || {}));
  S.extraItems = lib.extra || [];
  requestRender(); P.scheduleThumbs();
  if (tab === 'library') P.renderLibrary();
}
function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, ''); }
P.actions.libraryAction = async (act, game, key, file) => {
  if (!API) return;
  const items = gameItems(game, S.extraItems);
  const save = async (k, f, kind) => {
    const p = API.pathForFile(f);
    try { await API.libraryImport({ game, key: k, kind, path: p }); }
    catch (err) { toast(`Import impossible (${f.name}) : ${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, true); throw err; }
  };
  if (act === 'png') pickFile('image/png,image/webp,image/jpeg', async f => { await save(key, f, 'png'); await refreshLibrary(); toast(`Render ajouté : ${items.find(i => i.key === key)?.name}`); });
  if (act === 'glb') pickFile('.glb,.gltf,.zip', async f => { await save(key, f, 'glb'); await refreshLibrary(); toast(`Modèle 3D ajouté : ${items.find(i => i.key === key)?.name}`); });
  if (act === 'del') { await API.libraryDelete({ game, key }); await refreshLibrary(); }
  if (act === 'folder' || act === 'glbFile') {
    const handle = async files => {
      let ok = 0; const miss = [];
      for (const f of [].concat(files)) {
        const n = norm(f.name.replace(/[-_ ](render|full|portrait|model)/i, ''));
        const it = items.find(i => norm(i.key) === n || norm(i.name) === n) || items.find(i => n.startsWith(norm(i.key)));
        if (!it) { miss.push(f.name); continue; }
        await save(it.key, f, /\.(glb|gltf|zip)$/i.test(f.name) ? 'glb' : 'png'); ok++;
      }
      await refreshLibrary();
      toast(`${ok} fichier${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}${miss.length ? ` · non reconnus : ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? '…' : ''}` : ''}`, !!miss.length && !ok);
    };
    if (file) await handle([file]);
    else pickFile('image/png,image/webp,.glb,.gltf,.zip', handle, true);
  }
  if (act === 'add') {
    openModal('Ajouter un élément', `<div class="field"><label for="newItem">Nom (${GAMES[game].itemLabel.toLowerCase()})</label><input class="input" id="newItem" placeholder="Ex. nouvel agent"></div>${game === 'valorant' ? `<div class="field"><label for="newRole">Rôle</label><select class="input" id="newRole"><option value="duelist">Duelist</option><option value="initiator">Initiator</option><option value="controller">Controller</option><option value="sentinel">Sentinel</option></select></div>` : ''}`,
      `<button class="primary-btn solo" id="newOk">Ajouter</button>`);
    $('#newOk').onclick = async () => {
      const name = $('#newItem').value.trim(); if (!name) return;
      const extra = [...S.extraItems, { game, key: norm(name), name, role: $('#newRole')?.value || 'car' }];
      await API.libraryExtra(extra); closeModal(); await refreshLibrary();
    };
  }
};

// ---------------------------------------------------------------- fichiers
function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'affiche'; }
const baseName = p => p.split(/[\\/]/).pop().replace(/\.mybad$/i, '');
function serialize() { return JSON.stringify(S.doc); }
async function saveProject(as = false) {
  if (!API) return false;
  flushHistory();
  const p = await API.saveProject({ filePath: as ? null : S.filePath, data: serialize(), suggested: slug(`${S.doc.T.org} ${TEMPLATES[S.doc.tpl].name}`) });
  if (!p) return false;
  S.filePath = p; S.projectName = baseName(p); setDirty(false); saveSession();
  toast(`Projet enregistré : ${S.projectName}.mybad`);
  return true;
}
async function loadFrom(res) {
  if (!res) return;
  if (res.error) { toast(res.error, true); return; }
  try {
    const d = JSON.parse(res.data);
    if (!d || (d.app !== 'mybad-creator' && d.app !== 'mybad-poster-studio')) throw new Error();
    const doc = normalize(d);
    S.filePath = res.filePath; S.projectName = baseName(res.filePath);
    await prepare(doc);
    setDoc(doc); setDirty(false); afterDocLoad();
    toast(`Projet ouvert : ${S.projectName}`);
  } catch { toast('Ce fichier n\'est pas un projet MyBad Creator valide.', true); }
}
async function prepare(doc) { await whenLoaded(docImageUrls(doc, S.library)); await preloadModels(doc); }
async function confirmDiscard() {
  if (!S.dirty || !API) return true;
  return API.confirm({ message: 'Abandonner les modifications non enregistrées ?', detail: 'Le projet en cours n\'a pas été enregistré dans un fichier.', ok: 'Abandonner' });
}
async function newProject() {
  if (!(await confirmDiscard())) return;
  const doc = newDocument(S.kit);
  S.filePath = null; S.projectName = 'Sans titre';
  await prepare(doc); setDoc(doc); setDirty(false); afterDocLoad();
}
async function openProject() { if (!(await confirmDiscard())) return; loadFrom(await API.openProject()); }
let sessionTimer = null;
function saveSession() {
  if (!API) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => API.storeSet('session', { doc: S.doc, filePath: S.filePath, projectName: S.projectName, dirty: S.dirty }), 1500);
}
function afterDocLoad() {
  buildFormats(); buildGame(); P.renderGallery(); updateStatus(); updateTitle(); refreshTab(); P.renderLayers(); fit();
}

// ---------------------------------------------------------------- export
let exportOpt = { type: 'png', scale: 1 };
async function exportCanvas(doc = S.doc, scale = exportOpt.scale) {
  await prepare(doc);
  const cv = document.createElement('canvas');
  renderDoc(cv, doc, env(doc, true), scale);
  return cv;
}
const toB64 = (cv, type) => cv.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png', 0.95).split(',')[1];
const exportName = (fmt = S.doc.fmt) => `${slug(S.doc.T.org)}-${slug(TEMPLATES[S.doc.tpl].name)}-${fmt}${exportOpt.scale === 2 ? '-hd' : ''}`;
async function exportPoster() {
  closeMenus(); if (!API) return;
  const t = progressToast('Préparation de l\'export…');
  const cv = await exportCanvas();
  t.close();
  const p = await API.exportImage({ base64: toB64(cv, exportOpt.type), name: exportName(), ext: exportOpt.type });
  if (p) toast(`Affiche exportée (${cv.width} × ${cv.height})`, false, { label: 'Afficher', fn: () => API.showInFolder(p) });
}
async function exportAll() {
  closeMenus(); if (!API) return;
  const folder = await API.pickFolder(); if (!folder) return;
  const t = progressToast('Export des 3 formats…');
  let last = null;
  for (const fmt of Object.keys(FORMATS)) {
    const d = JSON.parse(JSON.stringify({ ...S.doc, assets: {} })); d.assets = S.doc.assets;
    d.fmt = fmt; applyTemplate(d, d.tpl);
    const cv = await exportCanvas(d);
    last = await API.writeInFolder({ folder, name: `${exportName(fmt)}.${exportOpt.type}`, base64: toB64(cv, exportOpt.type) });
  }
  t.close();
  toast('3 formats exportés (mise en page du modèle pour chaque format)', false, { label: 'Afficher', fn: () => API.showInFolder(last) });
}
async function copyImage() {
  if (!API) return;
  const cv = await exportCanvas(S.doc, 1);
  await API.copyImage(cv.toDataURL('image/png'));
  toast('Affiche copiée : colle-la directement dans Discord ou X');
}
function closeMenus() { $$('.menu').forEach(m => { m.hidden = true; }); }
$('#btnExport').onclick = exportPoster;
$('#btnExportMenu').onclick = e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; };
$('#exportMenu').onclick = e => {
  e.stopPropagation();
  const b = e.target.closest('button'); if (!b) return;
  const s = b.parentElement;
  if (s.id === 'expType' || s.id === 'expScale') {
    $$('button', s).forEach(x => x.classList.toggle('on', x === b));
    if (s.id === 'expType') exportOpt.type = b.dataset.v; else exportOpt.scale = +b.dataset.v;
    API?.storeSet('exportOpt', exportOpt);
  }
};
$('#btnExportAll').onclick = exportAll;
document.addEventListener('click', closeMenus);
$('#btnCopy').onclick = copyImage;
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;

// ---------------------------------------------------------------- kit de marque
function openKit() {
  const k = JSON.parse(JSON.stringify(S.kit || { T: {}, rosters: {}, theme: 'nuit', game: 'valorant' }));
  k.rosters ||= {};
  const T = { org: S.doc.T.org, sig: S.doc.T.sig, coords: S.doc.T.coords, coach: S.doc.T.coach, live: S.doc.T.live, ...(k.T || {}) };
  const roster = g => {
    const r = k.rosters[g] || {}, n = GAMES[g].players, items = gameItems(g, S.extraItems);
    return `<div class="csec"><div class="csec-head"><span>Roster ${GAMES[g].name}</span></div>${Array.from({ length: n }, (_, i) => `<div class="prow"><b>${i + 1}</b><input class="input" data-kr="${g}.p${i + 1}" value="${esc(r['p' + (i + 1)] ?? (g === S.doc.game ? S.doc.T['p' + (i + 1)] : ''))}" placeholder="Pseudo"><input class="input" data-kr="${g}.r${i + 1}" value="${esc(r['r' + (i + 1)] ?? (g === S.doc.game ? S.doc.T['r' + (i + 1)] : ''))}" placeholder="Rôle"><select class="input" data-kr="${g}.a${i + 1}">${items.map(it => `<option value="${it.key}" ${(r['a' + (i + 1)] ?? (g === S.doc.game ? S.doc.T['a' + (i + 1)] : '')) === it.key ? 'selected' : ''}>${esc(it.name)}</option>`).join('')}</select></div>`).join('')}</div>`;
  };
  openModal('Kit de marque', `
    <div class="note">Le kit est repris à chaque <b>nouveau projet</b> et quand tu changes de jeu : nom de la structure, coach, lien de stream, rosters et ambiance par défaut.</div>
    <div class="cgrid">${[['org', 'Structure'], ['coach', 'Coach'], ['live', 'Lien de stream'], ['sig', 'Signature 1'], ['coords', 'Signature 2']].map(([f, l]) => `<div class="field ${f === 'org' ? 'full' : ''}"><label>${l}</label><input class="input" data-kt="${f}" value="${esc(T[f] ?? '')}"></div>`).join('')}</div>
    <div class="cgrid"><div class="field"><label>Jeu par défaut</label><select class="input" id="kGame">${Object.values(GAMES).map(g => `<option value="${g.key}" ${k.game === g.key ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>
    <div class="field"><label>Ambiance par défaut</label><select class="input" id="kTheme">${THEMES.map(t => `<option value="${t.id}" ${k.theme === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>
    ${roster('valorant')}${roster('rl')}`,
    `<button class="ghost-btn" id="kApply">Appliquer au projet</button><button class="primary-btn solo" id="kSave">Enregistrer le kit</button>`);
  const read = () => {
    k.T = { ...(k.T || {}) };
    $$('[data-kt]').forEach(el => { k.T[el.dataset.kt] = el.value; });
    $$('[data-kr]').forEach(el => { const [g, f] = el.dataset.kr.split('.'); (k.rosters[g] ||= {})[f] = el.value; });
    k.game = $('#kGame').value; k.theme = $('#kTheme').value;
    return k;
  };
  $('#kSave').onclick = async () => { S.kit = read(); await API?.storeSet('kit', S.kit); closeModal(); toast('Kit de marque enregistré'); };
  $('#kApply').onclick = () => {
    const kk = read();
    change(d => { Object.assign(d.T, kk.T, kk.rosters[d.game] || {}); }, { immediate: true });
    closeModal(); refreshTab(); toast('Kit appliqué au projet');
  };
}
P.actions.applyKitPlayers = () => {
  const r = S.kit?.rosters?.[S.doc.game];
  if (!r) { toast('Aucun roster dans le kit pour ce jeu. Ouvre « Kit de marque » pour le remplir.', true); return; }
  change(d => Object.assign(d.T, r), { immediate: true }); P.renderContent();
};
$('#btnKit').onclick = openKit;

// ---------------------------------------------------------------- modales, toasts
function openModal(title, body, foot = '', wide = false) {
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalFoot').innerHTML = foot;
  $('#modal .modal-card').classList.toggle('wide', wide);
  $('#modal').hidden = false;
  setTimeout(() => $('#modal').querySelector('input, select, button.primary-btn')?.focus(), 30);
}
function closeModal() { $('#modal').hidden = true; }
$('#modalClose').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
on('toast', ({ msg, err, action }) => {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); t.remove(); }; t.appendChild(b); }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), action ? 6500 : 3400);
});
function progressToast(msg) {
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span class="spin"></span><span class="pmsg">${esc(msg)}</span><span class="ppct"></span>`;
  $('#toasts').appendChild(t);
  return {
    set: p => { t.querySelector('.ppct').textContent = p != null ? Math.round(p * 100) + ' %' : ''; },
    close: () => t.remove(),
    done: m => { t.remove(); toast(m); },
    fail: m => { t.remove(); toast(m, true); },
  };
}
function showShortcuts() {
  const rows = [['Outil sélection', 'V'], ['Texte', 'T'], ['Rectangle', 'U'], ['Ellipse', 'O'], ['Ligne', 'L'], ['Étoile', 'S'], ['Main (déplacer la vue)', 'H / Espace'],
    ['Dupliquer', 'Ctrl+D'], ['Copier / Couper / Coller', 'Ctrl+C / Ctrl+X / Ctrl+V'], ['Supprimer', 'Suppr'], ['Tout sélectionner', 'Ctrl+A'], ['Déplacer finement', 'Flèches (Maj = 10 px)'],
    ['Avancer / reculer', 'Ctrl+] / Ctrl+['], ['Premier / arrière-plan', 'Ctrl+Maj+] / Ctrl+Maj+['], ['Annuler / Rétablir', 'Ctrl+Z / Ctrl+Y'],
    ['Zoom', 'Ctrl+molette'], ['Ajuster / 100 %', 'Ctrl+0 / Ctrl+1'], ['Enregistrer', 'Ctrl+S'], ['Exporter', 'Ctrl+E'], ['Copier l\'affiche', 'Ctrl+Maj+C'],
    ['Proportions libres / gardées', 'Maj en redimensionnant'], ['Depuis le centre', 'Alt'], ['Sans magnétisme', 'Alt en déplaçant'], ['Rotation par 15°', 'Maj en pivotant']];
  openModal('Raccourcis clavier', `<div class="kbd-list">${rows.map(([a, b]) => `<span>${a}</span><span>${b.split(' / ').map(x => `<kbd>${x}</kbd>`).join(' / ')}</span>`).join('')}</div>`, '', true);
}

// ---------------------------------------------------------------- mises à jour
let update = { state: 'idle' };
function renderUpdateBtn() {
  const b = $('#btnUpdate');
  b.hidden = !['available', 'downloading', 'downloaded'].includes(update.state);
  b.querySelector('span').textContent = update.state === 'downloading' ? `Téléchargement ${Math.round(update.percent || 0)} %` : update.state === 'downloaded' ? 'Redémarrer pour mettre à jour' : `Mise à jour ${update.version || ''}`;
  b.classList.toggle('ready', update.state === 'downloaded');
}
async function openUpdates() {
  const info = await API?.info();
  const st = {
    idle: 'Clique pour vérifier si une nouvelle version est disponible.',
    checking: 'Recherche en cours…', none: 'Tu as la dernière version.',
    available: `La version ${update.version} est disponible.`, downloading: `Téléchargement : ${Math.round(update.percent || 0)} %`,
    downloaded: `La version ${update.version} est prête. Redémarre pour l'installer.`, error: `Impossible de vérifier : ${update.error || 'erreur inconnue'}`, dev: 'Les mises à jour automatiques ne fonctionnent que dans la version installée.',
  }[update.state];
  openModal('Mises à jour', `<div class="about"><div class="about-logo"><img src="assets/logo-mark.svg" alt=""><div><h3>MyBad Creator</h3><span>Version installée : ${esc(info?.version || '?')}</span></div></div>
    <p class="upd-state">${esc(st)}</p>${update.notes ? `<div class="note">${update.notes}</div>` : ''}
    <p class="hint">Les nouvelles versions sont publiées sur github.com/mb-apollo/mybad-creator. Le logiciel vérifie au démarrage et te prévient avec un bouton dans la barre du haut.</p></div>`,
    update.state === 'downloaded' ? '<button class="primary-btn solo" id="updInstall">Redémarrer et installer</button>'
      : update.state === 'available' ? '<button class="primary-btn solo" id="updGet">Télécharger la mise à jour</button>'
        : '<button class="primary-btn solo" id="updCheck">Rechercher une mise à jour</button>');
  $('#updCheck')?.addEventListener('click', () => { update = { state: 'checking' }; openUpdates(); API?.updateCheck(); });
  $('#updGet')?.addEventListener('click', () => { API?.updateDownload(); update.state = 'downloading'; openUpdates(); });
  $('#updInstall')?.addEventListener('click', () => { flushHistory(); API?.storeSet('session', { doc: S.doc, filePath: S.filePath, projectName: S.projectName, dirty: S.dirty }).then(() => API?.updateInstall()); });
}
API?.onUpdate(u => {
  update = { ...update, ...u };
  renderUpdateBtn();
  if (u.state === 'available' && !u.silent) toast(`Nouvelle version ${u.version} disponible`, false, { label: 'Mettre à jour', fn: () => { API.updateDownload(); } });
  if (u.state === 'downloaded') toast(`Mise à jour ${u.version} prête`, false, { label: 'Redémarrer', fn: () => API.updateInstall() });
  if (!$('#modal').hidden && $('#modalTitle').textContent === 'Mises à jour') openUpdates();
});
$('#btnUpdate').onclick = () => { if (update.state === 'downloaded') API?.updateInstall(); else if (update.state === 'available') { API?.updateDownload(); } else openUpdates(); };

async function showAbout() { openUpdates(); }

// ---------------------------------------------------------------- menus & raccourcis globaux
const MENU = {
  new: newProject, open: openProject, save: () => saveProject(false), saveAs: () => saveProject(true),
  export: exportPoster, exportAll, copyImage, undo, redo,
  zoomFit: fit, zoomIn: () => zoomTo(getZoom() * 1.2), zoomOut: () => zoomTo(getZoom() / 1.2), zoom100: () => zoomTo(1),
  shortcuts: showShortcuts, about: showAbout, updates: openUpdates, kit: openKit,
  importImage: P.actions.importImageLayer,
};
API?.onMenu(cmd => {
  const a = document.activeElement;
  if ((cmd === 'undo' || cmd === 'redo') && a && /INPUT|TEXTAREA/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox') { document.execCommand(cmd); return; }
  MENU[cmd]?.();
});
API?.onOpenPath(async p => { if (await confirmDiscard()) loadFrom(await API.openPath(p)); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeMenus(); }
  if (!API && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
});

// ---------------------------------------------------------------- barre d'outils verticale
$('#tools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]'); if (b) { setTool(b.dataset.tool); return; }
  const a = e.target.closest('[data-add]'); if (a) P.addPreset(a.dataset.add);
});
on('tool', t => $$('#tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)));
$$('.tabs [data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#zoomIn').onclick = () => zoomTo(getZoom() * 1.2);
$('#zoomOut').onclick = () => zoomTo(getZoom() / 1.2);
$('#zoomVal').onclick = () => fit();
on('zoom', s => { $('#zoomVal').textContent = Math.round(s * 100) + ' %'; });
on('pointer', p => { $('#stPos').textContent = `${Math.round(p[0])}, ${Math.round(p[1])}`; });

// ---------------------------------------------------------------- réactions aux changements
let layersRaf = 0;
on('doc', o => {
  updateUndo(); saveSession();
  if (!layersRaf) layersRaf = requestAnimationFrame(() => { layersRaf = 0; P.renderLayers(); });
  if (o && o.live) return; // pendant un glisser, on ne reconstruit pas les panneaux
  if (tab === 'props' && !(o && o.noProps)) P.renderProps();
  if (!(o && o.live)) P.scheduleThumbs();
  if (o && o.full) { buildFormats(); buildGame(); P.markGallery(); updateStatus(); if (tab !== 'props') refreshTab(); }
});
on('selection', () => { P.renderLayers(); if (tab === 'props') P.renderProps(); else if (S.sel.length) setTab('props'); });
on('history', updateUndo);
on('dirty', updateTitle);
on('editText', () => { setTab('props'); setTimeout(P.focusText, 30); });
on('editImage', id => { const L = layerById(id); if (L?.asset?.startsWith('u:')) { setTab('props'); } else if (L) { setTab('props'); } });
onImageLoaded(() => requestRender());

// ---------------------------------------------------------------- démarrage
async function loadFonts() {
  const specs = [];
  const fams = { 'Space Grotesk': [300, 400, 500, 600, 700], 'Montserrat': [300, 400, 500, 600, 700, 800, 900], 'Barlow Condensed': [300, 400, 500, 600, 700, 800, 900], 'IBM Plex Mono': [400, 500, 600] };
  for (const [f, ws] of Object.entries(fams)) ws.forEach(w => { specs.push(`${w} 40px "${f}"`); if (f !== 'Space Grotesk' && f !== 'IBM Plex Mono') specs.push(`italic ${w} 40px "${f}"`); });
  ['Anton', 'Bebas Neue', 'Archivo Black', 'Titan One', 'Great Vibes', 'Allura', 'Pinyon Script'].forEach(f => specs.push(`400 40px "${f}"`));
  await Promise.allSettled(specs.map(s => document.fonts.load(s, 'AÉé0✦')));
}

async function boot() {
  await loadFonts();
  initEditor({ stage: $('#stage'), poster: $('#poster'), overlay: $('#overlay'), env: exp => env(S.doc, exp) });
  initModels({ requestRender, toast, actions: P.actions });
  P.actions.modelProps = modelProps;
  P.actions.onPropAction = modelPropAction;
  P.actions.addModelLayer = () => newModelLayer();
  P.initLayers(); P.initContent(); P.initTheme(); P.initLibrary(); P.initGallery();
  let doc = null;
  if (API) {
    S.kit = (await API.storeGet('kit')) || null;
    const eo = await API.storeGet('exportOpt'); if (eo) exportOpt = { ...exportOpt, ...eo };
    await refreshLibrary();
    const info = await API.info();
    const session = await API.storeGet('session');
    if (info.pendingOpen) {
      const res = await API.openPath(info.pendingOpen);
      try { doc = normalize(JSON.parse(res.data)); S.filePath = res.filePath; S.projectName = baseName(res.filePath); } catch { doc = null; }
    }
    if (!doc && session?.doc) {
      try { doc = normalize(session.doc); S.filePath = session.filePath || null; S.projectName = session.projectName || 'Sans titre'; S.dirty = !!session.dirty; } catch { doc = null; }
    }
  }
  if (!doc) doc = newDocument(S.kit);
  $$('#expType button').forEach(b => b.classList.toggle('on', b.dataset.v === exportOpt.type));
  $$('#expScale button').forEach(b => b.classList.toggle('on', +b.dataset.v === exportOpt.scale));
  await prepare(doc);
  $('#boot').hidden = true; $('#app').hidden = false;
  setDoc(doc);
  setDirty(S.dirty);
  afterDocLoad();
  setTab('content');
  setTool('select');
  if (API) setTimeout(() => API.updateCheck(true), 4000);
}
boot();

// Accès pour les tests automatisés
window.__creator = { S, change, select, applyTemplate, renderDoc, env, TEMPLATES, P, setTab, addLayer };
void copySelected; void selected; void resetHistory; void emit; void icon;
