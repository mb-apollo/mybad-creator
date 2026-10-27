// MyBad Creator — démarrage, barre d'outils, fichiers, export, kit de marque, bibliothèque et mises à jour.
import { S, API, on, emit, change, setDoc, normalize, select, selected, layerById, undo, redo, canUndo, canRedo, flushHistory, setDirty, resetHistory, toast } from './state.js';
import { newDocument, applyTemplate, renderDoc, FORMATS, THEMES, setGameDefaults, MYBAD_KIT } from './engine/render.js';
import { TEMPLATES } from './engine/templates.js';
import { makeEnv, docImageUrls, whenLoaded, onImageLoaded } from './engine/assets.js';
import { GAMES, gameItems } from './engine/games.js';
import { $, $$, esc, icon } from './ui.js';
import { initEditor, requestRender, fit, zoomTo, getZoom, setTool, addLayer, pasteLayers, copySelected, togglePoseEdit, getPoseEdit, startPaint, addGuide, toggleRulers } from './editor.js';
import * as P from './panels.js';
import { initCustom, isCustom, scheduleSave as saveCustomModel } from './custom.js';
initCustom();
import { initModels, materialize, modelEnv, modelProps, modelPropAction, newModelLayer, newSceneLayer, preloadModels, poseHandles, startPoseDrag, dragPoseHandle } from './model3d.js';
import { openPoseLab } from './poselab.js';

// ---------------------------------------------------------------- environnement de rendu
function env(doc = S.doc, exporting = false, thumb = false) {
  return makeEnv(doc, S.library, { exporting, extraItems: S.extraItems, model3d: thumb ? null : modelEnv(doc, exporting) });
}
P.actions.env = (d, exp, thumb) => env(d, exp, thumb);
P.actions.setTab = t => setTab(t);

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
  if (tab === 'model3d') P.renderModel3d();
  if (tab === 'content') P.renderContent();
  if (tab === 'theme') P.renderTheme();
  if (tab === 'look') P.renderLook();
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
        const it = items.find(i => norm(i.key) === n || norm(i.name) === n) || items.find(i => n.startsWith(norm(i.key))) || (game === 'weapons' ? items.find(i => n.includes(norm(i.key))) : null);
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

// ---------------------------------------------------------------- pack 3D de base
let pack = { installed: null, latest: null, total: null, count: null, busy: false, done: 0 };
const mo = b => (b / 1048576).toFixed(0) + ' Mo';
async function refreshPack() {
  if (!API) return;
  try { Object.assign(pack, await API.packStatus()); } catch { /* hors ligne */ }
  if (tab === 'library') P.renderLibrary();
}
P.actions.packBanner = () => {
  if (!API) return '';
  const pct = pack.total ? Math.round(pack.done / pack.total * 100) : 0;
  if (pack.busy) return `<div class="packcard busy"><div><b>Téléchargement du pack 3D…</b><small>${mo(pack.done)} / ${mo(pack.total || 0)}</small></div><div class="pbar"><i style="width:${pct}%"></i></div></div>`;
  if (pack.installed && pack.latest && pack.installed >= pack.latest) return `<div class="packcard ok"><div><b>Pack 3D installé</b><small>${pack.count || ''} modèles de base · version ${pack.installed}</small></div></div>`;
  if (pack.installed && pack.latest) return `<div class="packcard"><div><b>Nouveaux modèles 3D disponibles</b><small>Pack version ${pack.latest}</small></div><button class="primary-btn solo" data-pack="download">Mettre à jour</button></div>`;
  if (!pack.latest) return `<div class="packcard"><div><b>Pack 3D indisponible</b><small>Vérifie ta connexion internet</small></div><button class="mini-btn" data-pack="retry">Réessayer</button></div>`;
  return `<div class="packcard"><div><b>Pack 3D de base</b><small>${pack.count} agents et voitures · ${mo(pack.total)}</small></div><button class="primary-btn solo" data-pack="download">Télécharger</button></div>`;
};
async function downloadPack() {
  if (pack.busy || !API) return;
  pack.busy = true; pack.done = 0;
  if (tab === 'library') P.renderLibrary();
  renderPackModal();
  const r = await API.packDownload();
  pack.busy = false;
  if (r.error) toast('Téléchargement du pack interrompu : ' + r.error, true);
  else toast('Pack 3D installé : les modèles sont prêts');
  await refreshPack(); await refreshLibrary();
  if (S.doc) { await prepare(S.doc); requestRender(); }
  if (!$('#modal').hidden && $('#modalTitle').textContent === 'Pack 3D') closeModal();
}
P.actions.downloadPack = downloadPack;
P.actions.retryPack = refreshPack;
API?.onPackProgress(d => {
  pack.done = d.done; pack.total = d.total;
  const bar = $('#packBar'); if (bar) { bar.style.width = Math.round(d.done / d.total * 100) + '%'; $('#packTxt').textContent = `${mo(d.done)} / ${mo(d.total)}`; }
  if (tab === 'library') { const lb = document.querySelector('.packcard .pbar i'); if (lb) lb.style.width = Math.round(d.done / d.total * 100) + '%'; const s = document.querySelector('.packcard small'); if (s) s.textContent = `${mo(d.done)} / ${mo(d.total)}`; }
});
function renderPackModal() {
  openModal('Pack 3D', `<div class="packmodal"><p>Le pack contient les modèles 3D de base : <b>${pack.count || ''} agents Valorant et voitures Rocket League</b>, prêts à être placés dans tes affiches.</p>
    ${pack.busy ? `<div class="pbar big"><i id="packBar" style="width:0%"></i></div><p class="hint" id="packTxt">Préparation…</p>` : `<p class="hint">Téléchargement unique de ${mo(pack.total || 0)}. Tu peux continuer à travailler pendant ce temps.</p>`}</div>`,
    pack.busy ? '<button class="ghost-btn" id="packHide">Continuer en arrière-plan</button>' : '<button class="ghost-btn" id="packLater">Plus tard</button><button class="primary-btn solo" id="packGo">Télécharger</button>');
  $('#packHide')?.addEventListener('click', closeModal);
  $('#packLater')?.addEventListener('click', () => { API?.storeSet('packDeclined', true); closeModal(); toast('Tu pourras télécharger le pack dans l\'onglet Bibliothèque'); });
  $('#packGo')?.addEventListener('click', downloadPack);
}
async function maybeOfferPack() {
  if (!API) return;
  await refreshPack();
  if (pack.installed && pack.latest && pack.installed < pack.latest) { toast('Nouveaux modèles 3D disponibles', false, { label: 'Télécharger', fn: downloadPack }); return; }
  if (pack.installed || !pack.latest) return;
  if (await API.storeGet('packDeclined')) return;
  if ($('#modal').hidden) renderPackModal();
}

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

// ---------------------------------------------------------------- kit de marque & assistant de démarrage
const KIT_FIELDS = [['org', 'Nom de la structure', 'Ex. MYBAD ESPORT'], ['live', 'Lien de stream', 'twitch.tv/ta-chaine'], ['coach', 'Coach', ''], ['sig', 'Signature (ligne 1)', 'Facultatif'], ['coords', 'Signature (ligne 2)', 'Facultatif']];
function kitForm(k, wizard) {
  const T = k.T || {};
  const roster = g => {
    const r = (k.rosters || {})[g] || {}, n = GAMES[g].players, items = gameItems(g, S.extraItems);
    return `<details class="csec kit-roster" ${wizard ? '' : 'open'}><summary class="csec-head"><span>Roster ${GAMES[g].name}</span><span class="muted">facultatif</span></summary>${Array.from({ length: n }, (_, i) => `<div class="prow"><b>${i + 1}</b><input class="input" data-kr="${g}.p${i + 1}" value="${esc(r['p' + (i + 1)] ?? '')}" placeholder="Pseudo"><input class="input" data-kr="${g}.r${i + 1}" value="${esc(r['r' + (i + 1)] ?? '')}" placeholder="Rôle"><select class="input" data-kr="${g}.a${i + 1}"><option value="">${GAMES[g].itemLabel} par défaut</option>${items.map(it => `<option value="${it.key}" ${(r['a' + (i + 1)] ?? '') === it.key ? 'selected' : ''}>${esc(it.name)}</option>`).join('')}</select></div>`).join('')}</details>`;
  };
  const accent = (k.themeColors && k.themeColors.accent) || (THEMES.find(t => t.id === (k.theme || 'nuit')) || THEMES[0]).c.accent;
  const glow = (k.themeColors && k.themeColors.glow) || (THEMES.find(t => t.id === (k.theme || 'nuit')) || THEMES[0]).c.glow;
  return `
    ${wizard ? `<div class="wiz-hero"><img src="assets/logo-mark.png" alt=""><div><h3>Bienvenue dans MyBad Creator</h3><p>Configure ta structure une fois : son nom, son logo et ses couleurs seront repris dans toutes tes affiches. Tu pourras tout changer plus tard dans <b>Kit de marque</b>.</p></div></div>
      <button class="kit-mybad" id="kUseMyBad"><img src="assets/brand/mybad-logo.png" alt=""><span><b>Je fais partie de MyBad Esport</b><small>Remplir avec le kit officiel (logo, nom, signature, ambiance)</small></span></button>
      <div class="wiz-or"><span>ou configure ta structure</span></div>` : ''}
    <div class="kit-top">
      <div class="kit-logo"><div class="kit-logo-prev" id="kLogoPrev">${k.logo ? `<img src="${esc(k.logo)}" alt="">` : '<span>Logo</span>'}</div>
        <div class="btnrow"><button class="mini-btn" id="kLogoPick">${k.logo ? 'Changer' : 'Importer le logo'}</button>${k.logo ? '<button class="mini-btn danger" id="kLogoDel">Retirer</button>' : ''}</div>
        <p class="hint">PNG sans fond conseillé</p></div>
      <div class="cgrid kit-fields">${KIT_FIELDS.map(([f, l, ph]) => `<div class="field ${f === 'org' ? 'full' : ''}"><label>${l}</label><input class="input" data-kt="${f}" value="${esc(T[f] ?? '')}" placeholder="${esc(ph)}"></div>`).join('')}</div>
    </div>
    <div class="cgrid">
      <div class="field"><label>Jeu principal</label><select class="input" id="kGame">${Object.values(GAMES).map(g => `<option value="${g.key}" ${k.game === g.key ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>
      <div class="field"><label>Ambiance</label><select class="input" id="kTheme">${THEMES.map(t => `<option value="${t.id}" ${(k.theme || 'nuit') === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <label class="kit-color"><input type="color" id="kAccent" value="${accent}"><span>Couleur d'accent</span></label>
      <label class="kit-color"><input type="color" id="kGlow" value="${glow}"><span>Couleur de la lumière</span></label>
    </div>
    ${roster('valorant')}${roster('rl')}`;
}
function readKit(k) {
  k.T = { ...(k.T || {}) }; k.rosters = { ...(k.rosters || {}) };
  $$('[data-kt]').forEach(el => { k.T[el.dataset.kt] = el.value.trim(); if (el.dataset.kt === 'live') k.T.liveUrl = el.value.trim(); });
  $$('[data-kr]').forEach(el => { const [g, f] = el.dataset.kr.split('.'); (k.rosters[g] ||= {}); if (el.value.trim()) k.rosters[g][f] = el.value.trim(); else delete k.rosters[g][f]; });
  k.game = $('#kGame').value; k.theme = $('#kTheme').value;
  const base = (THEMES.find(t => t.id === k.theme) || THEMES[0]).c;
  k.themeColors = {};
  if ($('#kAccent').value.toLowerCase() !== base.accent.toLowerCase()) k.themeColors.accent = $('#kAccent').value;
  if ($('#kGlow').value.toLowerCase() !== base.glow.toLowerCase()) k.themeColors.glow = $('#kGlow').value;
  for (const f of Object.keys(k.T)) if (!k.T[f]) delete k.T[f];
  k.v = 2;
  return k;
}
function bindKitForm(k, rerender) {
  $('#kLogoPick').onclick = () => pickFile('image/png,image/webp,image/svg+xml,image/jpeg', async f => {
    readKit(k);
    k.logo = /svg/.test(f.type) ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : await fileToDataUrl(f, 1600);
    rerender();
  });
  $('#kLogoDel')?.addEventListener('click', () => { readKit(k); k.logo = null; rerender(); });
  $('#kTheme').onchange = () => { const c = (THEMES.find(t => t.id === $('#kTheme').value) || THEMES[0]).c; $('#kAccent').value = c.accent; $('#kGlow').value = c.glow; };
  $('#kUseMyBad')?.addEventListener('click', () => { Object.assign(k, JSON.parse(JSON.stringify(MYBAD_KIT)), { rosters: k.rosters || {} }); rerender(); toast('Kit MyBad Esport chargé : vérifie et valide'); });
}
async function applyKitToDoc(k) {
  const t = THEMES.find(x => x.id === (k.theme || 'nuit')) || THEMES[0];
  change(d => {
    Object.assign(d.T, k.T || {}, (k.rosters || {})[d.game] || {});
    if (k.logo) d.assets.logo = k.logo; else delete d.assets.logo;
    d.themeId = t.id; d.theme = { ...t.c, ...(k.themeColors || {}) };
  }, { immediate: true, full: true });
  await prepare(S.doc); requestRender(); refreshTab();
}
function openKit() {
  const k = JSON.parse(JSON.stringify(S.kit || { T: {}, rosters: {}, theme: 'nuit', game: 'valorant' }));
  const render = () => {
    openModal('Kit de marque', `<div class="note">Le kit est repris dans chaque <b>nouveau projet</b> et quand tu changes de jeu.</div>${kitForm(k, false)}`,
      `<button class="ghost-btn" id="kWizard">Recommencer l'assistant</button><span class="spacer"></span><button class="ghost-btn" id="kApply">Appliquer au projet</button><button class="primary-btn solo" id="kSave">Enregistrer le kit</button>`, true);
    bindKitForm(k, render);
    $('#kSave').onclick = async () => { S.kit = readKit(k); await API?.storeSet('kit', S.kit); closeModal(); toast('Kit de marque enregistré'); };
    $('#kApply').onclick = async () => { S.kit = readKit(k); await API?.storeSet('kit', S.kit); closeModal(); await applyKitToDoc(S.kit); toast('Kit appliqué au projet'); };
    $('#kWizard').onclick = () => openWizard();
  };
  render();
}
function openWizard() {
  const k = JSON.parse(JSON.stringify(S.kit || { T: {}, rosters: {}, theme: 'nuit', game: 'valorant' }));
  const render = () => {
    openModal('Configurer ta structure', kitForm(k, true), `<button class="ghost-btn" id="wSkip">Plus tard</button><span class="spacer"></span><button class="primary-btn solo" id="wDone">Commencer</button>`, true);
    $('#modal').classList.add('locked');
    bindKitForm(k, render);
    const finish = async save => {
      $('#modal').classList.remove('locked');
      if (save) { S.kit = readKit(k); }
      else S.kit = { v: 2, T: {}, rosters: {}, theme: 'nuit', game: 'valorant', skipped: true };
      await API?.storeSet('kit', S.kit);
      closeModal();
      const doc = newDocument(S.kit);
      S.filePath = null; S.projectName = 'Sans titre';
      await prepare(doc); setDoc(doc); setDirty(false); afterDocLoad();
      if (save) toast(`Kit de ${S.kit.T?.org || 'ta structure'} enregistré`);
      maybeOfferPack();
    };
    $('#wDone').onclick = () => finish(true);
    $('#wSkip').onclick = () => finish(false);
  };
  render();
}
P.actions.openKit = openKit;
P.actions.applyKitPlayers = () => {
  const r = S.kit?.rosters?.[S.doc.game];
  if (!r || !Object.keys(r).length) { toast('Aucun roster dans le kit pour ce jeu. Ouvre « Kit de marque » pour le remplir.', true); return; }
  change(d => Object.assign(d.T, r), { immediate: true }); P.renderContent();
};
$('#btnKit').onclick = openKit;
$('#btnPoseLab').onclick = openPoseLab;
P.actions.openPoseLab = openPoseLab;
P.actions.materialize = materialize;

// ---------------------------------------------------------------- modales, toasts
function openModal(title, body, foot = '', wide = false) {
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalFoot').innerHTML = foot;
  $('#modal .modal-card').classList.toggle('wide', wide);
  $('#modal').hidden = false;
  setTimeout(() => $('#modal').querySelector('input, select, button.primary-btn')?.focus(), 30);
}
function closeModal() { $('#modal').hidden = true; }
// Petite fenêtre « saisis un nom » (window.prompt n'existe pas dans Electron).
P.actions.askName = (title, value, cb) => {
  openModal(title, `<div class="field full"><input class="input" id="askNameInput" value="${esc(value)}" maxlength="40" spellcheck="false"></div>`, '<button class="ghost-btn" id="askNameNo">Annuler</button><span class="spacer"></span><button class="primary-btn solo" id="askNameOk">Valider</button>');
  const input = $('#askNameInput'), done = ok => { closeModal(); if (ok && input.value.trim()) cb(input.value.trim()); };
  $('#askNameOk').onclick = () => done(true); $('#askNameNo').onclick = () => done(false);
  input.onkeydown = e => { if (e.key === 'Enter') done(true); };
  input.select();
};
$('#modalClose').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal' && !$('#modal').classList.contains('locked')) closeModal(); };
// Une seule notification à la fois : la nouvelle remplace la précédente.
let toastEl = null, toastTimer = null;
on('toast', ({ msg, err, action }) => {
  if (!toastEl || !toastEl.isConnected) { toastEl = document.createElement('div'); $('#toasts').appendChild(toastEl); }
  const t = toastEl;
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); t.remove(); }; t.appendChild(b); }
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 6500 : 3400);
});
function progressToast(msg) {
  if (toastEl) { toastEl.remove(); toastEl = null; }
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
  const label = {
    checking: 'Recherche…', available: `Mettre à jour (${update.version || ''})`,
    downloading: `Téléchargement ${Math.round(update.percent || 0)} %`, downloaded: 'Redémarrer pour installer',
  }[update.state] || 'Mises à jour';
  b.querySelector('span').textContent = label;
  b.classList.toggle('has-update', ['available', 'downloading'].includes(update.state));
  b.classList.toggle('ready', update.state === 'downloaded');
  b.classList.toggle('spinning', update.state === 'checking');
  if (!$('#modal').hidden && $('#modalTitle').textContent === 'Mises à jour') openUpdates(true);
}
const RELEASES = 'https://github.com/mb-apollo/mybad-creator/releases';
async function openUpdates(refreshOnly = false) {
  const info = await API?.info();
  const pct = Math.round(update.percent || 0);
  const st = {
    idle: ['Aucune vérification pour le moment.', ''], checking: ['Recherche d\'une nouvelle version…', ''],
    none: ['Tu as la dernière version.', 'ok'], available: [`La version ${update.version} est disponible.`, 'new'],
    downloading: [`Téléchargement de la version ${update.version}…`, 'new'], downloaded: [`La version ${update.version} est prête à être installée.`, 'ok'],
    error: [`Vérification impossible : ${update.error || 'erreur inconnue'}`, 'err'], dev: ['Les mises à jour automatiques fonctionnent dans la version installée du logiciel.', ''],
  }[update.state] || ['', ''];
  const body = `<div class="about"><div class="about-logo"><img src="assets/logo-mark.png" alt=""><div><h3>MyBad Creator</h3><span>Version installée : <b>${esc(info?.version || '?')}</b>${update.version && update.state !== 'none' ? ` · disponible : <b>${esc(update.version)}</b>` : ''}</span></div></div>
    <div class="upd-card ${st[1]}"><p class="upd-state">${esc(st[0])}</p>
    ${update.state === 'downloading' ? `<div class="pbar big"><i style="width:${pct}%"></i></div><p class="hint">${pct} %</p>` : ''}
    ${update.lastCheck ? `<p class="hint">Dernière vérification : ${new Date(update.lastCheck).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</p>` : ''}</div>
    ${update.notes ? `<div class="note upd-notes"><b>Nouveautés</b>${update.notes}</div>` : ''}
    <p class="hint">Le logiciel vérifie automatiquement au démarrage. Ton projet en cours est conservé pendant la mise à jour.</p>
    <p class="hint">Historique des versions : <a href="${RELEASES}" target="_blank" rel="noopener">${RELEASES.replace('https://', '')}</a></p></div>`;
  const foot = update.state === 'downloaded' ? '<button class="primary-btn solo" id="updInstall">Redémarrer et installer</button>'
    : update.state === 'available' ? '<button class="ghost-btn" id="updCheck">Revérifier</button><button class="primary-btn solo" id="updGet">Télécharger et installer</button>'
      : update.state === 'downloading' ? '<button class="ghost-btn" id="updHide">Continuer à travailler</button>'
        : `<button class="primary-btn solo" id="updCheck" ${update.state === 'checking' ? 'disabled' : ''}>Rechercher une mise à jour</button>`;
  if (refreshOnly) { $('#modalBody').innerHTML = body; $('#modalFoot').innerHTML = foot; }
  else openModal('Mises à jour', body, foot);
  $('#updCheck')?.addEventListener('click', () => { update = { ...update, state: 'checking' }; renderUpdateBtn(); API?.updateCheck(false); });
  $('#updGet')?.addEventListener('click', () => { update.state = 'downloading'; update.percent = 0; renderUpdateBtn(); API?.updateDownload(); });
  $('#updHide')?.addEventListener('click', closeModal);
  $('#updInstall')?.addEventListener('click', installUpdate);
}
async function installUpdate() {
  flushHistory();
  await API?.storeSet('session', { doc: S.doc, filePath: S.filePath, projectName: S.projectName, dirty: S.dirty });
  API?.updateInstall();
}
API?.onUpdate(u => {
  const before = update.state;
  update = { ...update, ...u };
  if (['none', 'available', 'error'].includes(u.state)) update.lastCheck = Date.now();
  if (u.state === 'error' && u.silent) update.state = before === 'checking' ? 'idle' : before;
  renderUpdateBtn();
  if (u.state === 'available' && before !== 'available') toast(`Nouvelle version ${u.version} disponible`, false, { label: 'Voir', fn: () => openUpdates() });
  if (u.state === 'downloaded') toast(`Mise à jour ${u.version} prête`, false, { label: 'Redémarrer', fn: installUpdate });
});
$('#btnUpdate').onclick = () => { if (update.state === 'downloaded') installUpdate(); else openUpdates(); };

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
  if (e.key === 'Escape') { if (!$('#modal').classList.contains('locked')) closeModal(); closeMenus(); }
  if (!API && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
});

// ---------------------------------------------------------------- barre d'outils verticale
// largeur du panneau d'outils : repliée (icônes) ou étendue (noms), réglable à la souris et mémorisée
const workEl = $('.work'), toolsEl = $('#tools');
function setToolsWidth(w, save = true) {
  w = Math.max(48, Math.min(260, Math.round(w)));
  if (w < 90) w = 48;
  workEl.style.setProperty('--toolw', w + 'px'); toolsEl.classList.toggle('open', w > 110);
  if (save) try { localStorage.setItem('mbc.toolw', String(w)); } catch { /* sans stockage */ }
  return w;
}
try { setToolsWidth(+localStorage.getItem('mbc.toolw') || 48, false); } catch { /* sans stockage */ }
$('#toolsToggle').onclick = () => setToolsWidth(toolsEl.classList.contains('open') ? 48 : 184);
$('#toolsResize').addEventListener('pointerdown', e => {
  e.preventDefault(); const move = ev => setToolsWidth(ev.clientX - workEl.getBoundingClientRect().left, false);
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setToolsWidth(parseFloat(getComputedStyle(workEl).getPropertyValue('--toolw'))); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});
// pipette : prend une couleur n'importe où à l'écran
async function eyedrop() {
  if (!window.EyeDropper) { toast("La pipette n'est pas disponible sur cette version.", true); return; }
  let hex; try { hex = (await new window.EyeDropper().open()).sRGBHex; } catch { return; }
  const targets = selected().filter(L => ['text', 'shape', 'effect'].includes(L.type));
  if (targets.length) { change(() => targets.forEach(L => { if (L.type === 'text') L.color = hex; else if (L.type === 'shape') L.fill = hex; else L.color = hex; }), { immediate: true }); toast(`Couleur ${hex} appliquée`); }
  else { try { await navigator.clipboard.writeText(hex); } catch { /* presse-papiers indisponible */ } toast(`Couleur ${hex} copiée (sélectionne un texte ou une forme pour l'appliquer)`); }
}
$('#tools').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) {
    const sel = selected();
    if (act === 'eyedrop') eyedrop();
    else if (act === 'guideV') addGuide('v');
    else if (act === 'guideH') addGuide('h');
    else if (act === 'rulers') toggleRulers();
    else if (act === 'maskPaint') {
      if (sel.length === 1 && !['bg', 'effect'].includes(sel[0].type)) { setTab('props'); startPaint(sel[0]); P.openSection('Masque au pinceau'); toast('Peins sur l\'affiche : effacer ou restaurer, réglages dans Propriétés'); }
      else toast('Sélectionne d\'abord un calque (image, modèle 3D, texte…).', true);
    }
    else if (act === 'crop') {
      if (sel.length === 1 && sel[0].type === 'image') { setTab('props'); P.openSection('Recadrage'); }
      else toast('Sélectionne d\'abord une image à recadrer.', true);
    }
    return;
  }
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
  if ((tab === 'props' || tab === 'model3d') && !(o && o.noProps)) P.renderProps();
  if (!(o && o.live)) { P.scheduleThumbs(); if (tab === 'theme') P.scheduleThemeThumbs(); if (S.doc && isCustom(S.doc.tpl)) saveCustomModel(); }
  if (o && o.full) { buildFormats(); buildGame(); P.markGallery(); updateStatus(); if (tab !== 'props') refreshTab(); }
});
on('selection', () => { P.renderLayers(); if (tab === 'props' || tab === 'model3d') P.renderProps(); else if (S.sel.length) setTab('props'); });
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
  initEditor({ stage: $('#stage'), poster: $('#poster'), overlay: $('#overlay'), env: exp => env(S.doc, exp), poseApi: { handles: poseHandles, start: startPoseDrag, drag: dragPoseHandle } });
  initModels({ requestRender, toast, actions: P.actions });
  P.actions.modelProps = modelProps;
  P.actions.onPropAction = modelPropAction;
  P.actions.addModelLayer = () => newModelLayer();
  P.actions.addSceneLayer = () => newSceneLayer();
  P.initLayers(); P.initContent(); P.initTheme(); P.initLook(); P.initLibrary(); P.initGallery();
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
  if (API && (!S.kit || !S.kit.v)) setTimeout(openWizard, 300);
  else maybeOfferPack();
  if (API) setTimeout(() => API.updateCheck(true), 4000);
}
boot();

// Accès pour les tests automatisés
window.__creator = { exportCanvas, modelPropAction, S, change, select, applyTemplate, renderDoc, env, TEMPLATES, P, setTab, addLayer, poseHandles };
P.actions.togglePoseEdit = togglePoseEdit;
P.actions.poseEditOn = () => !!getPoseEdit();
void copySelected; void selected; void resetHistory; void emit; void icon;
