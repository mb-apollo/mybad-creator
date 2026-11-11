// Créateur de livrées (plein écran) pour les voitures Rocket League : peinture (couleur unie, dégradé libre), brillance, lueur, et calques
// (logo Heliance, images, textes, étoiles, bandes) posés sur un flanc, sur les deux, ou sur le dessus, comme dans un logiciel de dessin :
// on clique un calque sur la voiture, on le déplace, on l'agrandit et on le tourne avec ses poignées, on change l'ordre dans la liste.
// Chaque voiture a ses livrées (onglets Octane / Fennec / Dominus) et sa livrée par défaut, portée par les voitures des affiches réglées sur « Automatique ».
// Chaque modification est enregistrée tout de suite ; les livrées se choisissent ensuite dans l'onglet 3D (section Voiture) de chaque voiture.
import { S, change as docChange, toast } from './state.js';
import { esc, setPath, section, range, select, toggle, textInput, syncRange, pct, deg } from './ui.js';
import { renderModelPreview, pickBody, projectBody, viewScale, agentKeyOf, solActif, solRegler, solStudio, fitCanvas } from './model3d.js';
import { hiddenCount, restoreBuiltins, setDefaultLivery, defaultLivery, allLiveries, getDef, cloneDef, saveDef, createLivery, renameLivery, deleteLivery, resetLivery, isBuiltin, hasOverride, newLayer, exportLiveries, importLiveries, onLiveryChange, FONTS, CARS,
  upgradeDef, layerBox, placed, mirrorPos, boxCenter, anchorOf, isMirrored, onFlank, faceAspect, gradOf, gradRamp, gradT } from './livery.js';

const API = window.studio;
const $ = (s, r = document) => r.querySelector(s);
const PV = 'livery-preview';
const ST = { lights: 'on', drag: null, open: false, id: 'nuit', def: null, car: 'octane', cam: { rotY: 330, camPitch: 10, zoom3d: 0.95, target: 0.5, offsetX: 0 }, sel: null, perCar: false, rename: false, hist: [], hi: -1, raf: 0, tries: 0, t: 0,
  handles: [], flank: 'right', shut: {}, nameEdit: null, dnd: null };
let root = null;

const KIND = { logo: 'Logo Heliance', star: 'Étoile', image: 'Image', text: 'Texte', stripe: 'Bande' };
const GLYPH = { logo: 'H', star: '✦', image: '▣', text: 'T', stripe: '▬' };
const FACES = [['left', 'Flanc gauche'], ['right', 'Flanc droit'], ['side', 'Les deux flancs'], ['top', 'Dessus']];
const BADGE = { left: 'Gauche', right: 'Droit', side: '2 flancs', top: 'Dessus' };
const faceOf = L => L.face || 'side';
const layerName = L => L.name || (L.kind === 'text' ? `Texte « ${(L.text || '').slice(0, 18)} »` : KIND[L.kind]);
const lv = (L, k) => L.ov?.[ST.car]?.[k] ?? L[k];
const vl = (L, k, car) => L.ov?.[car]?.[k] ?? L[k];
const PER_CAR = ['x', 'y', 'size', 'rot'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const selected = () => ST.def?.layers.find(l => l.id === ST.sel) || null;

function build() {
  root = document.createElement('div');
  root.id = 'liverylab'; root.hidden = true;
  root.innerHTML = `
    <div class="pl-top">
      <strong>Créateur de livrées</strong>
      <span class="pl-status" id="llStatus">Rocket League · tout est enregistré tout de suite</span>
      <span class="spacer"></span>
      <select class="input" id="llLights" title="Feux de la voiture (aperçu seulement)"><option value="on">Feux allumés</option><option value="off">Feux éteints</option><option value="auto">Feux : selon le modèle</option></select>
      <div class="seg" id="llCar" title="Chaque voiture a ses propres livrées">${CARS.map(([k, n]) => `<button type="button" data-car="${k}">${n}</button>`).join('')}</div>
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
        <canvas id="llOver" width="640" height="520"></canvas>
        <button class="mini-btn ll-see" id="llSee" hidden>Ce calque est sur une face cachée · Le montrer</button>
        <div class="pl-cam" id="llCam"></div>
        <div class="pl-hint">Clique un élément pour le sélectionner, glisse-le pour le déplacer (même du flanc vers le toit) ; ses poignées l'agrandissent et le tournent. Glisse à côté pour tourner la voiture, molette pour zoomer, clic droit (ou Maj) + glisser pour déplacer la vue.</div>
      </div>
      <div class="pl-ctl"><div class="pl-ctl-head" id="llHead"></div><div id="llControls"></div></div>
    </div>
    <input type="file" id="llFile" accept="image/*" hidden>`;
  document.body.appendChild(root);
  $('#llClose', root).onclick = closeLiveryLab;
  $('#llUndo', root).onclick = () => step(-1); $('#llRedo', root).onclick = () => step(1);
  $('#llExport', root).onclick = doExport; $('#llImport', root).onclick = doImport;
  $('#llLights', root).onchange = e => { ST.lights = e.target.value; preview(); };
  $('#llCar', root).onclick = e => { const b = e.target.closest('[data-car]'); if (b) setCar(b.dataset.car); };
  $('#llSee', root).onclick = () => { const L = selected(); if (L) showLayer(L, true); };

  $('#llList', root).onclick = e => {
    const n = e.target.closest('[data-new]');
    if (n) {   // nouvelle livrée, faite pour la voiture de l'onglet, à partir de la livrée choisie (même celle d'une autre voiture) ou d'une peinture simple
      const name = ($('#llNewName', root).value || '').trim() || 'Livrée ' + carName(), from = $('#llFrom', root)?.value;
      const depart = from === VIERGE ? vierge() : (from === ST.id && ST.def ? ST.def : upgradeDef(cloneDef(from)));
      ST.from = null; const id = createLivery(name, { ...depart, only: ST.car }); refreshList(); select_(id); return;
    }
    const b = e.target.closest('[data-id]'); if (b) select_(b.dataset.id);
  };
  $('#llList', root).onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'llNewName') $('[data-new]', root).click(); };
  $('#llList', root).onchange = e => { if (e.target.id === 'llFrom') ST.from = e.target.value; };

  const cv = $('#llCanvas', root);
  new ResizeObserver(() => { if (ST.open) preview(); }).observe(cv);   // l'aperçu remplit toute la tuile : on redessine quand elle change de taille
  const at = e => { const r = cv.getBoundingClientRect(); return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height, x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height, k: cv.width / r.width }; };
  const surface = e => { const q = at(e); return pickBody(PV, q.nx, q.ny); };
  const handleAt = e => { const q = at(e); let best = null, bd = 13 * q.k; for (const h of ST.handles) { const d = Math.hypot(h.x - q.x, h.y - q.y); if (d < bd) { bd = d; best = h; } } return best; };
  cv.onpointerdown = e => {
    if (!ST.def) return;
    try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur synthétique */ }
    if (e.button) { cv._x = e.clientX; cv._y = e.clientY; cv._moved = true; cv._pan = true; cv.style.cursor = 'all-scroll'; return; }   // clic droit ou molette : déplacer la vue
    const h = handleAt(e), L0 = h && selected();
    if (L0) {   // poignée du calque sélectionné : taille, rotation, longueur ou épaisseur
      const q = at(e), G = geo(L0);
      ST.drag = { mode: h.kind, id: L0.id, G, c: h.c, d0: Math.max(8, Math.hypot(q.x - h.c.x, q.y - h.c.y)), a0: Math.atan2(q.y - h.c.y, q.x - h.c.x), size0: lv(L0, 'size') || 0, len0: L0.len ?? 1, thick0: L0.thick ?? 4 };
      cv.style.cursor = CURSOR[h.kind]; return;
    }
    const sf = surface(e), hit = sf && hitLayer(sf);
    if (hit) { ST.drag = { mode: 'move', id: hit.L.id, ox: hit.ox, oy: hit.oy }; if (ST.sel !== hit.L.id) { ST.sel = hit.L.id; renderControls(); preview(); } cv.style.cursor = 'grabbing'; }
    else { cv._x = e.clientX; cv._y = e.clientY; cv._moved = false; cv._pan = e.shiftKey; }
  };
  cv.onpointermove = e => {
    const d = ST.drag;
    if (d) {
      const L = ST.def.layers.find(l => l.id === d.id); if (!L) return;
      if (d.mode === 'move') { const sf = surface(e); if (sf) moveTo(L, sf, d); } else dragHandle(L, d, at(e), e.shiftKey);
      return;
    }
    if (cv._x == null) { const h = ST.def && handleAt(e), sf = !h && ST.def && surface(e); cv.style.cursor = h ? CURSOR[h.kind] : (sf && hitLayer(sf) ? 'move' : 'grab'); return; }
    if (Math.abs(e.clientX - cv._x) + Math.abs(e.clientY - cv._y) > 2) cv._moved = true;
    if (cv._pan) { const s = (viewScale(PV) || 0.002) * at(e).k; ST.cam.offsetX = clamp(ST.cam.offsetX - (e.clientX - cv._x) * s, -2.5, 2.5); ST.cam.target = clamp(ST.cam.target + (e.clientY - cv._y) * s, -0.5, 1.5); }
    else { ST.cam.rotY = (ST.cam.rotY + (e.clientX - cv._x) * 0.6 + 360) % 360; ST.cam.camPitch = clamp(ST.cam.camPitch + (e.clientY - cv._y) * 0.35, -4, 80); }
    cv._x = e.clientX; cv._y = e.clientY; preview();
  };
  cv.onpointerup = () => {
    if (cv._x != null && !cv._moved && !cv._pan && ST.sel) { ST.sel = null; renderControls(); preview(); }   // clic dans le vide : plus de sélection
    cv._x = null; cv._pan = false;
    if (ST.drag) { const st = ST.drag.structural; ST.drag = null; cv.style.cursor = 'grab'; clearTimeout(ST.t); commit(); if (st) renderControls(); }
  };
  cv.oncontextmenu = e => e.preventDefault();
  cv.onwheel = e => { e.preventDefault(); ST.cam.zoom3d = clamp(ST.cam.zoom3d * (e.deltaY < 0 ? 1.08 : 0.92), 0.5, 6); preview(); };
  $('#llCam', root).innerHTML = [['3/4', '330,10,0.95'], ['Flanc droit', '0,6,0.95'], ['Flanc gauche', '180,6,0.95'], ['Face', '270,10,1.05'], ['Dos', '90,10,1.05'], ['Dessus', '90,62,0.62']].map(([l, v]) => `<button class="mini-btn" data-v="${v}">${l}</button>`).join('') + `<button class="mini-btn ${solActif() ? 'on' : ''}" data-sol title="Afficher ou masquer le sol (ombres et reflet)">Sol</button>`;
  $('#llCam', root).onclick = e => { const s = e.target.closest('button[data-sol]'); if (s) { const on = !solActif(); solRegler(on); s.classList.toggle('on', on); preview(); return; } const b = e.target.closest('button[data-v]'); if (!b) return; const [rotY, camPitch, zoom3d] = b.dataset.v.split(',').map(Number); Object.assign(ST.cam, { rotY, camPitch, zoom3d, target: 0.5, offsetX: 0 }); preview(); };

  const ctl = $('#llControls', root);
  ctl.oninput = e => { const el = e.target; if (!el.dataset.p) return; if (el.type === 'range' || el.type === 'color' || el.type === 'text') apply(el, false); };
  ctl.onchange = e => { const el = e.target; if (el.id === 'llLayerName') { nameDone(el.value); return; } if (!el.dataset.p || el.type === 'range' || el.type === 'color') return; apply(el, true); };
  ctl.addEventListener('toggle', e => { const k = e.target.dataset?.k; if (k) ST.shut[k] = !e.target.open; }, true);   // sections repliées : gardées d'un redessin à l'autre
  const onAction = e => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, i = +b.dataset.i;
    if (a === 'restoreB') { restoreBuiltins(); refreshList(); if (!ST.def) openCar(); status_('Livrées fournies restaurées'); return; }
    if (!ST.def) return;
    const L = ST.def.layers, sel = selected();
    if (a.startsWith('add-')) { addLayer(a.slice(4)); return; }
    if (a === 'zone-reset') { delete ST.def.zones?.[b.dataset.k]; change(true); return; }
    if (a === 'pick') { if (ST.sel !== L[i].id) { ST.sel = L[i].id; renderControls(); showLayer(L[i]); preview(); } return; }
    if (a === 'vis') { L[i].visible = L[i].visible === false; change(true); return; }
    if (a === 'lock') { L[i].locked = !L[i].locked; change(true); return; }
    if (a === 'up' || a === 'down') { raise(a === 'up' ? 1 : -1); return; }
    if (a === 'dup') { duplicate(); return; }
    if (a === 'del') { remove(); return; }
    if (a === 'img') { $('#llFile', root).click(); return; }
    if (a === 'face' && sel) { setFace(sel, b.dataset.v); change(true); showLayer(sel); return; }
    if (a === 'other' && sel) { setFace(sel, faceOf(sel) === 'left' ? 'right' : 'left'); change(true); showLayer(sel); return; }
    if ((a === 'cx' || a === 'cy') && sel) { center(sel, a === 'cx'); return; }
    if ((a === 'flipX' || a === 'flipY') && sel) { sel[a] = !sel[a]; change(true); return; }
    if (a === 'see' && sel) { showLayer(sel, true); return; }
    if (a === 'g-type') { grad().type = b.dataset.v; gradChanged(true); return; }
    if (a === 'g-dir') { grad().angle = +b.dataset.v; gradChanged(true); return; }
    if (a === 'g-add') { const G = grad(), st = [...G.stops].sort((x, y) => x.p - y.p); if (st.length >= 6) return; let k = 0; for (let j = 1; j < st.length - 1; j++) if (st[j + 1].p - st[j].p > st[k + 1].p - st[k].p) k = j; G.stops.push({ c: mixHex(st[k].c, st[k + 1].c), p: Math.round((st[k].p + st[k + 1].p) * 50) / 100 }); G.stops.sort((x, y) => x.p - y.p); gradChanged(true); return; }
    if (a === 'g-del') { const G = grad(); if (G.stops.length > 2) { G.stops.splice(i, 1); gradChanged(true); } return; }
    if (a === 'g-rev') { const G = grad(); G.stops.forEach(s => { s.p = Math.round((1 - s.p) * 100) / 100; }); G.stops.sort((x, y) => x.p - y.p); gradChanged(true); return; }
    if (a === 'rename') { ST.rename = true; renderHead(); const inp = $('#llRename', root); inp?.focus(); inp?.select(); return; }
    if (a === 'renameOk') { const v = ($('#llRename', root).value || '').trim(); if (v) { ST.def.name = v; renameLivery(ST.id, v); } ST.rename = false; refreshList(); renderHead(); return; }
    if (a === 'reset') { resetLivery(ST.id); loadDef(); change(false, true); renderControls(); return; }
    if (a === 'delete') delLivery();
    if (a === 'save') saveAndApply();
    if (a === 'dupLivery') { const id = createLivery(ST.def.name + ' (copie)', ST.def); refreshList(); select_(id); }
  };
  ctl.onclick = onAction;
  ctl.ondblclick = e => { const b = e.target.closest('.ll-name'); if (!b || !ST.def) return; ST.sel = ST.def.layers[+b.dataset.i].id; ST.nameEdit = ST.sel; renderControls(); const inp = $('#llLayerName', root); inp?.focus(); inp?.select(); };
  ctl.addEventListener('keydown', e => { if (e.target.id !== 'llLayerName') return; if (e.key === 'Enter') { e.preventDefault(); nameDone(e.target.value); } else if (e.key === 'Escape') { e.stopPropagation(); ST.nameEdit = null; renderControls(); } });
  ctl.addEventListener('focusout', e => { if (e.target.id === 'llLayerName' && ST.nameEdit) nameDone(e.target.value); });
  // liste des calques : on glisse une ligne pour changer l'ordre
  ctl.addEventListener('dragstart', e => { const r = e.target.closest?.('.ll-row'); if (!r) return; ST.dnd = +r.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'calque'); r.classList.add('drag'); });
  ctl.addEventListener('dragover', e => { const r = e.target.closest?.('.ll-row'); if (ST.dnd == null || !r) return; e.preventDefault(); const b = r.getBoundingClientRect(), before = e.clientY < b.top + b.height / 2; ctl.querySelectorAll('.ll-row').forEach(x => x.classList.remove('drop-a', 'drop-b')); r.classList.add(before ? 'drop-a' : 'drop-b'); });
  ctl.addEventListener('drop', e => {
    const r = e.target.closest?.('.ll-row'); if (ST.dnd == null || !r) return; e.preventDefault();
    const L = ST.def.layers, from = ST.dnd, to = +r.dataset.i, b = r.getBoundingClientRect(), above = e.clientY < b.top + b.height / 2; ST.dnd = null;
    if (from === to) { renderControls(); return; }
    const cible = L[to], [m] = L.splice(from, 1), j = L.indexOf(cible);
    L.splice(above ? j + 1 : j, 0, m); ST.sel = m.id; change(true);   // la liste est affichée du dessus au dessous : « au-dessus » d'une ligne = après elle dans le tableau
  });
  ctl.addEventListener('dragend', () => { ST.dnd = null; ctl.querySelectorAll('.ll-row').forEach(x => x.classList.remove('drag', 'drop-a', 'drop-b')); });
  $('#llHead', root).onclick = onAction;
  $('#llList', root).addEventListener('click', e => { if (e.target.closest('[data-a="restoreB"]')) onAction(e); });
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
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !['range', 'checkbox', 'color'].includes(e.target.type), mod = e.ctrlKey || e.metaKey, L = selected();
    if (mod && !typing && /^[zZ]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); step(e.shiftKey ? 1 : -1); }
    else if (mod && !typing && /^[yY]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); step(1); }
    else if (e.key === 'Escape' && !ST.rename && !ST.nameEdit) { if (ST.sel) { ST.sel = null; renderControls(); preview(); } else closeLiveryLab(); }
    else if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !L) return;
    else if (/^Arrow/.test(e.key)) { e.preventDefault(); const s = e.shiftKey ? 0.02 : 0.004; nudge(L, e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (mod && /^[dD]$/.test(e.key)) { e.preventDefault(); duplicate(); }
    else if (mod && (e.key === ']' || e.key === '[')) { e.preventDefault(); raise(e.key === ']' ? 1 : -1); }
  }, true);
  onLiveryChange(() => { if (ST.open) preview(); });
}

// ------------------------------------------------------------------ calques : géométrie sur la voiture
const CURSOR = { scale: 'nwse-resize', rot: 'crosshair', len: 'ew-resize', thick: 'ns-resize' };
const aspOf = target => faceAspect(ST.car, target === 'top' ? 'top' : 'side');
// Face où l'on voit le calque dans la vue actuelle : le dessus, son flanc, ou (calque des deux flancs) le flanc tourné vers la caméra.
const shownOn = L => (faceOf(L) === 'side' ? ST.flank : faceOf(L));
// Place du calque sur cette face : boîte, position (retournée sur le flanc gauche s'il est en symétrie), centre.
function geo(L, target = shownOn(L)) {
  const box = layerBox(L, ST.car, target === 'top' ? 'top' : 'side'), a = aspOf(target), p = placed(L, ST.car, target, box);
  return { target, box, a, p, c: boxCenter(p, box, a) };
}
// Enregistre une position donnée sur une face (sur le flanc gauche d'un calque en symétrie, elle est ramenée au flanc droit).
function store(L, G, p, box = G.box) {
  const s = isMirrored(L, G.target) ? mirrorPos(p, box, G.a) : p;
  setVals(L, { x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1), rot: ((s.rot + 180) % 360 + 360) % 360 - 180 });
}
function setVals(L, o) {
  for (const [k, v] of Object.entries(o)) {
    if (PER_CAR.includes(k) && ST.perCar) ((L.ov ||= {})[ST.car] ||= {})[k] = v;
    else { L[k] = v; if (L.ov?.[ST.car]) delete L.ov[ST.car][k]; }
  }
}
function syncInputs(L) {
  for (const k of ['x', 'y', 'size', 'rot', 'len', 'thick']) {
    const el = $('#llControls input[data-p="l:' + k + '"]', root); if (!el) continue;
    const v = PER_CAR.includes(k) ? lv(L, k) ?? 0 : L[k]; el.value = v; syncRange(el, k === 'rot' ? deg(v) : k === 'thick' ? Math.round(v) + ' px' : pct(v));
  }
}
function hitLayer(sf) {
  const layers = ST.def.layers, target = sf.face === 'top' ? 'top' : sf.flank;
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i]; if (L.visible === false || L.locked || (target === 'top' ? faceOf(L) !== 'top' : !onFlank(L, target))) continue;
    const G = geo(L, target), a = G.p.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const dx = (sf.x - G.c.x) * sf.ax, dy = (sf.y - G.c.y) * sf.ay, along = dx * c + dy * sn, perp = -dx * sn + dy * c;
    if (Math.abs(along) <= Math.max(G.box.w / 2, 0.02) + 0.01 && Math.abs(perp) <= Math.max(G.box.h / 2, 0.02) + 0.01) return { L, ox: sf.x - G.p.x, oy: sf.y - G.p.y };
  }
  return null;
}
// Déplacement à la souris : le calque suit le curseur, et change de face quand le curseur passe sur une autre (du flanc au toit, d'un flanc à l'autre).
function moveTo(L, sf, d) {
  const target = sf.face === 'top' ? 'top' : sf.flank;
  if (target === 'top' ? faceOf(L) !== 'top' : !onFlank(L, target)) { setFace(L, target, { x: sf.x, y: sf.y }); d.ox = d.oy = 0; d.structural = true; }
  const G = geo(L, target);
  store(L, G, { x: sf.x - d.ox, y: sf.y - d.oy, rot: G.p.rot });
  syncInputs(L); change(false);
}
function dragHandle(L, d, q, shift) {
  const G = d.G, k = Math.hypot(q.x - d.c.x, q.y - d.c.y) / d.d0;
  if (d.mode === 'rot') {
    let rot = G.p.rot + (Math.atan2(q.y - d.c.y, q.x - d.c.x) - d.a0) * 180 / Math.PI;
    if (shift) rot = Math.round(rot / 15) * 15;
    store(L, G, anchorOf(G.c, rot, G.box, G.a));   // le centre de la boîte ne bouge pas
  } else if (d.mode === 'len') L.len = clamp(d.len0 * k, 0.05, 1.6);
  else if (d.mode === 'thick') L.thick = clamp(d.thick0 * k, 1, 160);
  else if (L.kind === 'stripe') { L.len = clamp(d.len0 * k, 0.05, 1.6); L.thick = clamp(d.thick0 * k, 1, 160); }
  else {
    const lim = L.kind === 'text' ? [0.02, 0.3] : [0.02, 1.2], size = clamp(d.size0 * k, lim[0], lim[1]), kk = size / (d.size0 || 1e-6);
    const box = { w: G.box.w * kk, h: G.box.h * kk, ox: G.box.ox * kk, oy: G.box.oy * kk };
    setVals(L, { size }); store(L, G, anchorOf(G.c, G.p.rot, box, G.a), box);
  }
  syncInputs(L); change(false);
}
function nudge(L, dx, dy) {
  const G = geo(L);
  store(L, G, { x: G.p.x + dx / G.a.ax, y: G.p.y + dy / G.a.ay, rot: G.p.rot });   // même pas réel dans les deux sens
  syncInputs(L); change(false);
}
function center(L, horiz) {
  const G = geo(L), c = { ...G.c }; if (horiz) c.x = 0.5; else c.y = 0.5;
  store(L, G, anchorOf(c, G.p.rot, G.box, G.a)); change(true);
}
// Change la face d'un calque. D'un flanc à l'autre, il reste au même endroit de la voiture ; entre flanc et dessus, il garde sa taille réelle
// (l'unité d'un flanc est la hauteur de la voiture, celle du dessus sa largeur). « at » : position voulue sur la nouvelle face (glisser à la souris).
function convPos(L, fn) {
  const per = Object.keys(L.ov || {}).filter(c => ['x', 'y', 'rot'].some(k => L.ov[c][k] != null)).map(c => [c, fn(c)]), b = fn('');
  Object.assign(L, b); for (const [c, q] of per) Object.assign(L.ov[c], q);
}
const mirrorOf = (L, car) => mirrorPos({ x: vl(L, 'x', car), y: vl(L, 'y', car), rot: vl(L, 'rot', car) || 0 }, layerBox(L, car, 'side'), faceAspect(car || ST.car, 'side'));
function setFace(L, face, at) {
  const from = faceOf(L); if (from === face) return;
  if ((from === 'top') !== (face === 'top')) {
    const k = faceAspect(ST.car, 'top').ay / faceAspect(ST.car, 'side').ax, f = face === 'top' ? k : 1 / k;   // hauteur / largeur de la voiture
    if (L.size != null) L.size = clamp(L.size * f, 0.02, 1.2);
    for (const o of Object.values(L.ov || {})) { if (o.size != null) o.size = clamp(o.size * f, 0.02, 1.2); delete o.x; delete o.y; }
    if (L.thick != null) L.thick = clamp(L.thick * f * (face === 'top' ? 1.28 : 1 / 1.28), 1, 160);
    L.face = face; if (face !== 'side') delete L.mirror;
    const p = at || (face === 'top' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.55 });
    if (at) { L.x = clamp(p.x, 0, 1); L.y = clamp(p.y, 0, 1); } else { const G = geo(L, face === 'side' ? 'right' : face); store(L, G, anchorOf(p, G.p.rot, G.box, G.a)); }
    return;
  }
  const mir = from === 'side' ? !!L.mirror : false;
  // position en vigueur sur le flanc gauche → nouveau réglage (ou l'inverse) : seul un passage par l'autre flanc demande un miroir
  const flip = (from === 'right' && face === 'left') || (from === 'left' && face !== 'left') || (from === 'side' && face === 'left' && mir);
  if (flip) convPos(L, car => mirrorOf(L, car));
  L.face = face;
  if (face === 'side') L.mirror = true; else delete L.mirror;
  if (at) { L.x = clamp(at.x, 0, 1); L.y = clamp(at.y, 0, 1); }
}
// Tourne la voiture pour montrer la face d'un calque (seulement si elle est cachée, sauf « force »).
function showLayer(L, force) {
  const f = faceOf(L), c = ST.cam;
  if (f === 'top') { if (force || c.camPitch < 30) Object.assign(c, { rotY: 90, camPitch: 62, zoom3d: 0.62 }); }
  else {
    const flat = c.camPitch > 45, want = f === 'side' ? ST.flank : f;
    if (force || flat || want !== ST.flank) Object.assign(c, { rotY: want === 'left' ? 150 : 330, camPitch: flat ? 10 : c.camPitch, zoom3d: flat ? 0.95 : c.zoom3d });
  }
  preview();
}
function addLayer(kind) {
  // posé sur ce qu'on regarde : le dessus en vue de dessus, sinon les deux flancs (au même endroit de la voiture des deux côtés)
  const top = ST.cam.camPitch > 45, nl = newLayer(kind, kind === 'text' ? { text: 'HELIANCE' } : {});
  if (top) Object.assign(nl, { face: 'top', x: 0.5, y: 0.5 }); else nl.mirror = true;
  if (kind === 'text') { const G = geo(nl, top ? 'top' : 'right'); Object.assign(nl, anchorOf({ x: 0.5, y: top ? 0.5 : 0.45 }, 0, G.box, G.a)); }
  ST.def.layers.push(nl); ST.sel = nl.id; change(true);
  if (kind === 'image') $('#llFile', root).click();
}
function duplicate() {
  const L = ST.def.layers, i = L.findIndex(l => l.id === ST.sel); if (i < 0) return;
  const c = JSON.parse(JSON.stringify(L[i])); c.id = newLayer('star').id; c.x = clamp((c.x ?? 0.5) + 0.03, 0, 1); c.y = clamp((c.y ?? 0.5) + 0.03, 0, 1); delete c.locked;
  L.splice(i + 1, 0, c); ST.sel = c.id; change(true);
}
function remove() {
  const L = ST.def.layers, i = L.findIndex(l => l.id === ST.sel); if (i < 0) return;
  L.splice(i, 1); ST.sel = null; change(true);
}
function raise(d) {
  const L = ST.def.layers, i = L.findIndex(l => l.id === ST.sel), j = i + d; if (i < 0 || j < 0 || j >= L.length) return;
  [L[i], L[j]] = [L[j], L[i]]; change(true);
}
function nameDone(v) {
  const L = ST.def?.layers.find(l => l.id === ST.nameEdit); ST.nameEdit = null; if (!L) return;
  v = (v || '').trim(); if (v) L.name = v.slice(0, 40); else delete L.name;
  change(true);
}

// Cadre et poignées du calque sélectionné, dessinés par-dessus l'aperçu : chaque point de la boîte est reporté sur la carrosserie puis à l'écran.
function drawOverlay() {
  const ov = $('#llOver', root), cv = $('#llCanvas', root), see = $('#llSee', root);
  if (ov.width !== cv.width || ov.height !== cv.height) { ov.width = cv.width; ov.height = cv.height; }
  const g = ov.getContext('2d'), W = ov.width, H = ov.height, k = W / (cv.getBoundingClientRect().width || W);
  g.clearRect(0, 0, W, H); ST.handles = []; see.hidden = true;
  const fr = projectBody(PV, 'right', 0.5, 0.5); if (!fr) return;
  ST.flank = fr.vu ? 'right' : 'left';
  const L = selected(); if (!L || L.visible === false) return;
  const G = geo(L), r = G.p.rot * Math.PI / 180, co = Math.cos(r), sn = Math.sin(r);
  const P = (lx, ly) => { const q = projectBody(PV, G.target, G.c.x + (co * lx - sn * ly) / G.a.ax, G.c.y + (sn * lx + co * ly) / G.a.ay); return { x: q.nx * W, y: q.ny * H, vu: q.vu }; };
  const c = P(0, 0);
  if (!c.vu) { see.hidden = false; return; }   // calque sur une face que la caméra ne voit pas
  const hw = Math.max(G.box.w / 2, 0.012) + 0.012, hh = Math.max(G.box.h / 2, 0.012) + 0.012, N = 10, ring = [];
  const coins = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  coins.forEach((a, i) => { const b = coins[(i + 1) % 4]; for (let j = 0; j < N; j++) { const t = j / N; ring.push(P((a[0] + (b[0] - a[0]) * t) * hw, (a[1] + (b[1] - a[1]) * t) * hh)); } });
  const trace = () => { g.beginPath(); ring.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  g.lineJoin = 'round'; g.setLineDash([]);
  trace(); g.strokeStyle = 'rgba(4,10,24,.75)'; g.lineWidth = 3.2 * k; g.stroke();
  trace(); g.strokeStyle = '#ffffff'; g.lineWidth = 1.3 * k; g.setLineDash([6 * k, 4 * k]); g.stroke(); g.setLineDash([]);
  if (L.locked) return;
  const accent = getComputedStyle(root).getPropertyValue('--da-accent').trim() || getComputedStyle(root).getPropertyValue('--cyan').trim() || '#54d8ff';
  const add = (kind, p, rond) => {
    ST.handles.push({ kind, x: p.x, y: p.y, c });
    g.beginPath(); if (rond) g.arc(p.x, p.y, 5.5 * k, 0, 7); else g.rect(p.x - 4.5 * k, p.y - 4.5 * k, 9 * k, 9 * k);
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = accent; g.lineWidth = 2 * k; g.stroke();
  };
  // poignée de rotation : au-dessus de la boîte
  const top = P(0, -hh), rot = P(0, -hh - 0.07);
  g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(rot.x, rot.y); g.strokeStyle = '#ffffff'; g.lineWidth = 1.3 * k; g.stroke();
  if (L.kind === 'stripe') {
    // bande : poignées de longueur (ramenées sur la voiture quand la bande la dépasse) et d'épaisseur
    const dans = s => { let t = hw; for (let i = 0; i < 12 && t > 0.05; i++) { const x = G.c.x + co * s * t / G.a.ax, y = G.c.y + sn * s * t / G.a.ay; if (x > 0.03 && x < 0.97 && y > 0.03 && y < 0.97) break; t *= 0.8; } return t; };
    add('len', P(dans(1), 0)); add('len', P(-dans(-1), 0)); add('thick', P(0, hh)); add('thick', P(0, -hh));
  } else coins.forEach(a => add('scale', P(a[0] * hw, a[1] * hh)));
  add('rot', rot, true);
}

// ------------------------------------------------------------------ édition
function apply(el, structural) {
  const p = el.dataset.p; let v;
  if (p === 'x:perCar') { ST.perCar = el.checked; renderControls(); return; }
  if (el.type === 'checkbox') v = el.checked; else if (el.type === 'range') v = +el.value; else v = el.value;
  if (el.dataset.num) v = +v;
  const [scope, key] = [p.slice(0, 1), p.slice(2)];
  if (scope === 'g') {   // dégradé de la carrosserie
    const G = grad(), m = /^(c|p)\.(\d+)$/.exec(key);
    if (m) G.stops[+m[2]][m[1]] = v; else G[key] = v;
    if (el.type === 'range') syncRange(el, el.dataset.deg ? deg(v) : pct(v));
    gradChanged(structural); return;
  }
  if (p === 'd:only') {   // la livrée change de voiture : on la suit dans son onglet
    ST.def.only = v; if (v && v !== ST.car) { ST.car = v; syncCar(); }
    change(true); refreshList(); return;
  }
  if (scope === 'd') setPath(ST.def, key, v);
  else {
    const L = selected(); if (!L) return;
    if (PER_CAR.includes(key) && ST.perCar) { ((L.ov ||= {})[ST.car] ||= {})[key] = v; }
    else { L[key] = v; if (L.ov?.[ST.car]) delete L.ov[ST.car][key]; }
  }
  if (el.type === 'range') syncRange(el, el.dataset.deg ? deg(v) : (el.dataset.px ? Math.round(v) + ' px' : pct(v)));
  if (el.type === 'text' && p === 'l:text') { const n = $('.ll-row.on .ll-name', root), L = selected(); if (n && L) n.textContent = layerName(L); }
  change(structural && !(el.type === 'text'));
}
function change(rebuild, quiet) {
  if (!quiet) saveDef(ST.id, ST.def);
  clearTimeout(ST.t); if (rebuild && !ST.drag) commit(); else ST.t = setTimeout(commit, 350);
  if (rebuild) renderControls();
  status(); preview();
}
function commit() {
  if (!ST.def) return;
  const s = JSON.stringify(ST.def);
  if (ST.hist[ST.hi] === s) return;
  ST.hist = ST.hist.slice(0, ST.hi + 1); ST.hist.push(s); if (ST.hist.length > 80) ST.hist.shift(); ST.hi = ST.hist.length - 1; status();
}
function step(d) {
  if (!ST.def) return;
  clearTimeout(ST.t); commit();
  const i = ST.hi + d; if (i < 0 || i >= ST.hist.length) return;
  ST.hi = i; ST.def = JSON.parse(ST.hist[i]); saveDef(ST.id, ST.def);
  if (!selected()) ST.sel = null;
  renderControls(); status(); preview();
}
function status() {
  const u = $('#llUndo', root), r = $('#llRedo', root); if (!u) return;
  u.disabled = ST.hi <= 0; r.disabled = ST.hi >= ST.hist.length - 1;
}

// ------------------------------------------------------------------ peinture : dégradé
// Le dégradé n'est écrit dans la livrée qu'à sa première retouche : jusque-là elle garde ses deux couleurs d'origine, telles qu'elles étaient dessinées.
function grad() {
  if (!ST.def.grad) { const G = gradOf(ST.def); ST.def.grad = { type: G.type, angle: G.angle, shift: G.shift, size: G.size, cx: G.cx, cy: G.cy, hard: G.hard, stops: G.stops.map(s => ({ ...s })) }; }
  return ST.def.grad;
}
function gradChanged(rebuild) {
  const G = ST.def.grad, st = [...G.stops].sort((a, b) => a.p - b.p);
  ST.def.base = G.type === 'flat' ? [G.stops[0].c, G.stops[0].c] : [st[0].c, st[st.length - 1].c];   // couleurs extrêmes : châssis « comme la carrosserie », anciennes versions
  change(rebuild); if (!rebuild) drawGrad();
}
const mixHex = (a, b) => '#' + [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('');
// Aperçu du dégradé sur le flanc droit, à plat (l'avant de la voiture à droite).
function drawGrad() {
  const c = $('#llGrad', root); if (!c || !ST.def) return;
  const G = gradOf(ST.def), A = faceAspect(ST.car, 'side').ax, ramp = gradRamp(ST.def).getContext('2d').getImageData(0, 0, 256, 1).data, g = c.getContext('2d'), W = c.width, H = c.height, im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = Math.round(gradT(G, A, x / (W - 1), 1 - y / (H - 1)) * 255) * 4, o = (y * W + x) * 4;
    im.data[o] = ramp[i]; im.data[o + 1] = ramp[i + 1]; im.data[o + 2] = ramp[i + 2]; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

// ------------------------------------------------------------------ liste et sélection
const carName = (car = ST.car) => (CARS.find(c => c[0] === car) || [])[1] || car;
const syncCar = () => root.querySelectorAll('#llCar [data-car]').forEach(b => { const on = b.dataset.car === ST.car; b.classList.toggle('on', on); b.classList.toggle('actif', on); });
// Onglet d'une voiture : ses livrées, sa livrée par défaut. Une livrée faite pour une autre voiture ne reste pas ouverte.
function setCar(car) {
  if (car === ST.car) return;
  ST.car = car; syncCar();
  if (!ST.def || (ST.def.only && ST.def.only !== car)) { openCar(); return; }
  refreshList(); renderControls(); preview();
}
// Ouvre la livrée par défaut de la voiture de l'onglet, sinon une livrée qui lui va, sinon l'onglet vide.
function openCar() {
  const id = [defaultLivery(ST.car), ...allLiveries().filter(l => !l.only || l.only === ST.car).map(l => l.id)].find(x => x && getDef(x));
  if (id) select_(id); else showEmpty();
}
// Onglet sans livrée : aucune ne va à cette voiture. Elle s'affiche en peinture d'origine ; on en crée une à gauche, au besoin à partir d'une autre voiture.
function showEmpty() {
  Object.assign(ST, { id: '', def: null, sel: null, rename: false, nameEdit: null, hist: [], hi: -1, from: null });
  syncCar(); refreshList(); status();
  $('#llHead', root).innerHTML = `<div><strong>${esc(carName())}</strong><small>Aucune livrée pour cette voiture</small></div>`;
  $('#llControls', root).innerHTML = `<p class="hint" style="padding:12px">Aucune livrée n'est faite pour ${esc(carName())} pour l'instant : elle garde sa peinture d'origine.<br><br>Crée-en une à gauche avec « + Créer ». Dans « À partir de », tu peux choisir une livrée faite pour une autre voiture : elle est copiée, puis tu l'ajustes pour ${esc(carName())}.</p>`;
  preview();
}
const VIERGE = '_vierge';
const vierge = () => ({ name: '', base: ['#1b3fd1', '#0a1a66'], gloss: 0.7, metal: 0.45, glow: { color: '#3c96ff', amount: 0 }, zones: {}, layers: [], fmt: 2 });
function refreshList() {
  const list = $('#llList', root), keep = list.scrollTop, all = allLiveries(), def = defaultLivery(ST.car), nom = carName();
  const row = l => `<button data-id="${esc(l.id)}" class="${l.id === ST.id ? 'on' : ''} ${l.modified ? 'mod' : ''}" title="${l.id === def ? 'Livrée par défaut des ' + esc(nom) + ' (affiches en « Automatique »)' : ''}">${esc(l.name)}${l.id === def ? ' <small class="ll-def">★ par défaut</small>' : ''}${l.builtin ? ' <small>fournie</small>' : ''}</button>`;
  const siennes = all.filter(l => l.only === ST.car), toutes = all.filter(l => !l.only);
  // livrée de départ d'une nouvelle livrée : par défaut celle qui est ouverte ; toutes les livrées sont proposées, rangées par voiture
  const choix = ST.from && (ST.from === VIERGE || all.some(l => l.id === ST.from)) ? ST.from : (ST.id || all[0]?.id || VIERGE);
  const opt = l => `<option value="${esc(l.id)}" ${l.id === choix ? 'selected' : ''}>${esc(l.name)}${l.only && l.only !== ST.car ? ' (' + esc(carName(l.only)) + ')' : ''}</option>`;
  const depart = [...CARS.map(([k, n]) => [n, all.filter(l => l.only === k)]), ['Toutes les voitures', toutes]].filter(g => g[1].length).map(([n, ls]) => `<optgroup label="${esc(n)}">${ls.map(opt).join('')}</optgroup>`).join('')
    + `<option value="${VIERGE}" ${choix === VIERGE ? 'selected' : ''}>Livrée vierge (peinture simple)</option>`;
  list.innerHTML = `<div class="pl-group">Livrées ${esc(nom)}</div>
    ${siennes.map(row).join('') || `<p class="hint" style="padding:0 6px">Aucune livrée faite pour ${esc(nom)} pour l'instant.</p>`}
    <div class="pl-new"><input class="input" id="llNewName" placeholder="Nouvelle livrée ${esc(nom)}" maxlength="30" spellcheck="false"><button class="mini-btn" data-new>+ Créer</button></div>
    <div class="field ll-from"><label for="llFrom">À partir de</label><select class="input" id="llFrom">${depart}</select></div>
    <p class="hint" style="padding:0 6px 6px">La nouvelle livrée est réservée à ${esc(nom)}. Tu peux partir d'une livrée faite pour une autre voiture, puis l'ajuster.</p>
    ${toutes.length ? `<div class="pl-group">Pour toutes les voitures</div>${toutes.map(row).join('')}` : ''}${hiddenCount() ? '<div class="btnrow" style="padding:8px 6px"><button class="mini-btn" data-a="restoreB">Restaurer les livrées fournies</button></div>' : ''}`;
  list.scrollTop = keep;
}
function loadDef() { ST.def = upgradeDef(cloneDef(ST.id)); ST.hist = [JSON.stringify(ST.def)]; ST.hi = 0; if (!selected()) ST.sel = null; }
function select_(id) {
  if (!getDef(id)) id = allLiveries().find(l => !l.only || l.only === ST.car)?.id;
  if (!getDef(id)) { showEmpty(); return; }
  ST.id = id; ST.rename = false; ST.nameEdit = null; ST.from = null; loadDef();
  if (ST.def.only && ST.def.only !== ST.car) ST.car = ST.def.only;   // livrée faite pour une autre voiture : on passe dans son onglet
  syncCar(); refreshList(); renderHead(); renderControls(); status(); preview();
}
const status_ = msg => { const st = $('#llStatus', root); if (st) st.textContent = msg; toast(msg); };
// Enregistre la livrée, en fait la livrée par défaut de la voiture de l'onglet (affiches en « Automatique », nouvelles affiches) et la pose sur les
// voitures de ce modèle dans l'affiche ouverte. Les autres voitures ne sont pas touchées : chacune a sa livrée par défaut.
function saveAndApply() {
  clearTimeout(ST.t); commit(); saveDef(ST.id, ST.def); setDefaultLivery(ST.id, ST.car);
  const doc = S.doc, nom = carName();
  const hit = doc && doc.game === 'rl' ? doc.layers.filter(L => L.type === 'model' && !L.actors && agentKeyOf(doc, L.model) === ST.car) : [];
  if (hit.length) docChange(d => { for (const L of d.layers) if (hit.some(h => h.id === L.id)) L.livery = ST.id; }, { immediate: true });
  refreshList(); renderControls();
  status_(`Livrée par défaut des ${nom}` + (hit.length ? `, posée sur ${hit.length} ${nom} de l'affiche` : ' ; elle sera posée sur les ' + nom + ' des affiches Rocket League'));
}
async function delLivery() {
  const ok = API?.confirm ? await window.Dialogue.confirmer({ danger: true, message: `Supprimer la livrée « ${ST.def.name} » ?`, detail: (isBuiltin(ST.id) ? 'Elle disparaît de la liste (un bouton permet de restaurer les livrées fournies). ' : '') + 'Les voitures qui l\'utilisent reviennent à la peinture d\'origine.', ok: 'Supprimer' }) : confirm('Supprimer cette livrée ?');
  if (!ok) return;
  deleteLivery(ST.id); openCar();   // la voiture de l'onglet garde la main : une autre de ses livrées, ou l'onglet vide
}

// ------------------------------------------------------------------ panneau de réglages
const colorRow = (p, label, v) => `<label class="llcol"><span>${esc(label)}</span><input type="color" data-p="${p}" value="${/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff'}"></label>`;
const rg = (p, label, v, min, max, step, o = {}) => range(p, label, v, min, max, step, o.deg ? deg : o.px ? (x => Math.round(x) + ' px') : pct).replace('<input type="range"', `<input type="range" data-p="${p}" ${o.deg ? 'data-deg="1"' : ''} ${o.px ? 'data-px="1"' : ''}`);
const sec = (k, title, body) => section(title, body, !ST.shut[k]).replace('<details', `<details data-k="${k}"`);
const segBtns = (a, value, options) => `<div class="seg wide small">${options.map(([v, l, t]) => `<button type="button" data-a="${a}" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}" ${t ? `title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
const ZONE_ORIGIN = { rim: true, glass: true, tires: true };
function zoneRow(k, label, fallback) {
  const v = ST.def.zones?.[k];
  return `<div class="llzone">${colorRow('d:zones.' + k, label, v || fallback)}${v && (ZONE_ORIGIN[k] || k === 'chassis') ? `<button class="mini-btn" data-a="zone-reset" data-k="${k}">${k === 'chassis' ? 'Comme la carrosserie' : 'Origine'}</button>` : ''}</div>`;
}
function renderHead() {
  const user = !isBuiltin(ST.id), mod = hasOverride(ST.id);
  $('#llHead', root).innerHTML = ST.rename
    ? `<div class="pl-ren"><input class="input" id="llRename" value="${esc(ST.def.name)}" maxlength="30" spellcheck="false"><button class="mini-btn" data-a="renameOk">OK</button></div>`
    : `<div><strong>${esc(ST.def.name)}</strong><small>${user ? 'Ta livrée' : 'Livrée fournie' + (mod ? ' · modifiée' : ' · modifiable')}</small></div>
       <div class="btnrow"><button class="mini-btn" data-a="rename">Renommer</button><button class="mini-btn" data-a="dupLivery">Dupliquer</button><button class="mini-btn danger" data-a="delete">Supprimer</button>${user ? '' : `<button class="mini-btn" data-a="reset" ${mod ? '' : 'disabled'}>Revenir à l'origine</button>`}</div>`;
}
function paintPanel(d) {
  const G = gradOf(d), flat = G.type === 'flat', rad = G.type === 'rad';
  let h = segBtns('g-type', G.type, [['flat', 'Couleur unie'], ['lin', 'Dégradé'], ['rad', 'Dégradé rond']]);
  h += `<canvas class="ll-grad" id="llGrad" width="300" height="${Math.round(300 / faceAspect(ST.car, 'side').ax)}" title="Aperçu sur le flanc droit, à plat"></canvas><div class="ll-gradleg"><span>arrière</span><span>avant</span></div>`;
  if (flat) h += colorRow('g:c.0', 'Couleur', G.stops[0].c);
  else {
    h += G.stops.map((s, i) => `<div class="range ll-stop"><input type="color" data-p="g:c.${i}" value="${/^#[0-9a-f]{6}$/i.test(s.c || '') ? s.c : '#000000'}" title="Couleur ${i + 1}"><input type="range" data-p="g:p.${i}" min="0" max="1" step="0.01" value="${s.p}" style="--p:${s.p * 100}%" title="Place de cette couleur dans le dégradé"><output>${pct(s.p)}</output><button class="mini-btn" data-a="g-del" data-i="${i}" title="Retirer cette couleur" ${G.stops.length > 2 ? '' : 'disabled'}>✕</button></div>`).join('');
    h += `<div class="btnrow"><button class="mini-btn" data-a="g-add" ${G.stops.length < 6 ? '' : 'disabled'}>+ Ajouter une couleur</button><button class="mini-btn" data-a="g-rev">⇅ Inverser</button></div>`;
    if (rad) h += rg('g:cx', 'Centre : de l\'arrière vers l\'avant', G.cx, 0, 1, 0.01) + rg('g:cy', 'Centre : de haut en bas', G.cy, 0, 1, 0.01) + rg('g:size', 'Taille du rond', G.size, 0.1, 2.5, 0.01);
    else {
      const dirs = [[0, '↓', 'De haut en bas'], [45, '↘', 'En diagonale, vers l\'avant et le bas'], [90, '→', 'De l\'arrière vers l\'avant'], [135, '↗', 'En diagonale, vers l\'avant et le haut'], [180, '↑', 'De bas en haut'], [270, '←', 'De l\'avant vers l\'arrière']];
      h += `<div class="hint" style="margin:0">Sens du dégradé</div>` + segBtns('g-dir', G.angle, dirs);
      h += rg('g:angle', 'Angle', G.angle, 0, 360, 1, { deg: 1 }) + rg('g:shift', 'Décalage', G.shift, -0.5, 0.5, 0.01) + rg('g:size', 'Étendue du fondu', G.size, 0.05, 2, 0.01);
    }
    h += toggle('hard', 'Bandes nettes (sans fondu)', G.hard).replace('<input', '<input data-p="g:hard"');
    h += `<div class="hint">Le dégradé suit la carrosserie : il est le même des deux côtés, et le toit et le capot le prolongent.</div>`;
  }
  return h + rg('d:gloss', 'Brillance (vernis)', d.gloss ?? 0.7, 0, 1, 0.01) + rg('d:metal', 'Effet métallisé', d.metal ?? 0.45, 0, 1, 0.01)
    + colorRow('d:glow.color', 'Lueur du bas de caisse', d.glow?.color) + rg('d:glow.amount', 'Intensité de la lueur', d.glow?.amount ?? 0, 0, 1, 0.01);
}
function layerPanel(L) {
  const car = CARS.find(c => c[0] === ST.car)[1], f = faceOf(L), big = L.kind === 'text' ? [0.02, 0.3] : [0.02, 1.2];
  let h = `<div class="hint" style="margin:0">Placé sur</div>` + segBtns('face', f, FACES);
  if (f === 'side') h += toggle('mirror', 'Symétrie : même endroit des deux côtés', L.mirror).replace('<input', '<input data-p="l:mirror"') + `<div class="hint">${L.mirror ? 'Le calque est posé au même endroit de la voiture à gauche et à droite (un texte reste lisible des deux côtés).' : 'Sans symétrie, le même dessin est posé sur les deux flancs : ce qui est à l\'arrière d\'un côté se retrouve à l\'avant de l\'autre.'}</div>`;
  h += `<div class="btnrow">${f === 'left' || f === 'right' ? `<button class="mini-btn" data-a="other" title="Même endroit de la voiture, sur l'autre flanc">⇄ Passer de l'autre côté</button>` : ''}<button class="mini-btn" data-a="cx" title="Centrer dans la longueur${f === 'top' ? ' (largeur de la voiture)' : ''}">Centrer ↔</button><button class="mini-btn" data-a="cy">Centrer ↕</button><button class="mini-btn" data-a="see" title="Tourner la voiture pour voir ce calque">Voir</button></div>`;
  h += `<div class="hint">${f === 'top' ? 'Sur le dessus, l\'avant de la voiture est en haut.' : f === 'left' ? 'Sur le flanc gauche, l\'avant de la voiture est à gauche.' : 'Sur le flanc droit, l\'avant de la voiture est à droite.'}</div>`;
  h += rg('l:x', 'Position horizontale', lv(L, 'x'), 0, 1, 0.005) + rg('l:y', 'Position verticale', lv(L, 'y'), 0, 1, 0.005);
  if (L.kind === 'stripe') h += rg('l:len', 'Longueur', L.len ?? 1, 0.05, 1.6, 0.01) + rg('l:thick', 'Épaisseur', L.thick ?? 6, 1, 160, 1, { px: 1 });
  else h += rg('l:size', L.kind === 'text' ? 'Taille du texte' : 'Taille', lv(L, 'size'), big[0], big[1], 0.002);
  h += rg('l:rot', 'Rotation', lv(L, 'rot') || 0, -180, 180, 1, { deg: 1 });
  if (L.kind !== 'stripe' && L.kind !== 'star') h += `<div class="btnrow"><button class="mini-btn ${L.flipX ? 'on' : ''}" data-a="flipX">Retourner ↔</button><button class="mini-btn ${L.flipY ? 'on' : ''}" data-a="flipY">Retourner ↕</button></div>`;
  if (L.kind !== 'image') h += colorRow('l:color', L.kind === 'logo' ? 'Couleur du logo (haut)' : 'Couleur', L.color);
  if (L.kind === 'logo') h += colorRow('l:color2', 'Couleur du logo (bas)', L.color2) + toggle('l:star', 'Avec l\'étoile', L.star).replace('<input', '<input data-p="l:star"');
  if (L.kind === 'text') h += textInput('l:text', 'Texte', L.text).replace('<input', '<input data-p="l:text"') + select('l:font', 'Police', L.font || 'Montserrat', FONTS.map(x => [x, x]), { raw: true }).replace('<select', '<select data-p="l:font"')
    + select('l:weight', 'Graisse', String(L.weight || 800), [['400', 'Normale'], ['700', 'Gras'], ['800', 'Très gras']], { raw: true }).replace('<select', '<select data-num="1" data-p="l:weight"') + toggle('l:italic', 'Italique', L.italic).replace('<input', '<input data-p="l:italic"');
  if (L.kind === 'image') h += `<div class="btnrow"><button class="mini-btn" data-a="img">${L.src ? 'Changer l\'image' : 'Choisir une image'}</button></div>` + (L.src ? `<img class="ll-thumb" src="${L.src}" alt="">` : '<p class="hint">Un PNG sans fond donne le meilleur résultat (logo d\'équipe, sponsor).</p>');
  h += rg('l:opacity', 'Opacité', L.opacity ?? 1, 0, 1, 0.01);
  if (L.kind !== 'image') h += rg('l:glow', 'Lueur', L.glow ?? 0, 0, 1, 0.01);
  h += toggle('perCar', `Réglage propre à ${car}`, ST.perCar).replace('<input', '<input data-p="x:perCar"') + `<div class="hint">Activé, la position, la taille et la rotation que tu changes ne valent que pour ${car} : utile pour recaler un logo qui tombe sur un pli de carrosserie.</div>`;
  return h;
}
function layerRows(d) {
  return d.layers.map((L, i) => {
    const on = L.id === ST.sel, f = faceOf(L);
    const chip = L.kind === 'image' && L.src ? `<img class="ll-chip" src="${L.src}" alt="">` : `<i class="ll-chip" style="color:${/^#[0-9a-f]{6}$/i.test(L.color || '') ? L.color : '#ffffff'}">${GLYPH[L.kind]}</i>`;
    const name = ST.nameEdit === L.id ? `<input class="input ll-rename" id="llLayerName" value="${esc(layerName(L))}" maxlength="40" spellcheck="false">` : `<button class="ll-name" data-a="pick" data-i="${i}" title="Double-clic : renommer">${esc(layerName(L))}</button>`;
    return `<div class="ll-row ${on ? 'on' : ''} ${L.visible === false ? 'off' : ''}" data-i="${i}" draggable="${ST.nameEdit === L.id ? 'false' : 'true'}">
      <span class="ll-grip" title="Glisser pour changer l'ordre">⠿</span>
      <button class="ll-ico" data-a="vis" data-i="${i}" title="${L.visible === false ? 'Afficher' : 'Masquer'}">${L.visible === false ? '○' : '●'}</button>
      ${chip}${name}
      <span class="ll-face f-${f}" title="${esc(FACES.find(x => x[0] === f)[1])}${f === 'side' && L.mirror ? ' · en symétrie' : ''}">${BADGE[f]}${f === 'side' && L.mirror ? ' ⇄' : ''}</span>
      <button class="ll-ico ${L.locked ? 'lock' : ''}" data-a="lock" data-i="${i}" title="${L.locked ? 'Déverrouiller' : 'Verrouiller : le calque ne bouge plus à la souris'}"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="${L.locked ? 'M6 10V8a6 6 0 0 1 12 0v2h1.5v11h-15V10zm2.2 0h7.6V8a3.8 3.8 0 0 0-7.6 0z' : 'M4.5 10h9.3V7a3.8 3.8 0 0 1 7.6 0v2h-2.2V7a1.6 1.6 0 0 0-3.2 0v3h3.5v11h-15z'}"/></svg></button></div>`;
  }).reverse().join('');
}
function renderControls() {
  const d = ST.def; if (!d) return;
  const sel = selected(), i = sel ? d.layers.indexOf(sel) : -1;
  const estDefaut = defaultLivery(ST.car) === ST.id;
  let h = `<div class="pad llsave">${select('d:only', 'Cette livrée est faite pour', d.only || '', [...CARS.map(([k, n]) => [k, n + ' uniquement']), ['', 'Toutes les voitures']], { raw: true }).replace('<select', '<select data-p="d:only"')}<button class="primary-btn solo" data-a="save" title="Enregistre la livrée, en fait la livrée par défaut des ${carName()} et la pose sur les ${carName()} de l'affiche ouverte">Enregistrer et appliquer aux ${carName()}</button><div class="hint" style="margin:0">${estDefaut ? '★ Livrée par défaut des ' + carName() + ' : les ' + carName() + ' des affiches réglées sur « Automatique » la portent.' : 'Ce bouton en fait la livrée par défaut des ' + carName() + '. Dans une affiche, chaque voiture ne propose que les livrées faites pour elle.'}</div></div>`;
  const tools = `<div class="ll-tools"><button class="mini-btn" data-a="up" ${sel && i < d.layers.length - 1 ? '' : 'disabled'} title="Passer devant (Ctrl+])">↑ Devant</button><button class="mini-btn" data-a="down" ${sel && i > 0 ? '' : 'disabled'} title="Passer derrière (Ctrl+[)">↓ Derrière</button><button class="mini-btn" data-a="dup" ${sel ? '' : 'disabled'} title="Dupliquer (Ctrl+D)">⧉ Dupliquer</button><button class="mini-btn danger" data-a="del" ${sel ? '' : 'disabled'} title="Supprimer (Suppr)">✕ Supprimer</button></div>`;
  h += sec('calques', 'Calques', `<div class="ll-add">${Object.entries(KIND).map(([k, n]) => `<button class="mini-btn" data-a="add-${k}">+ ${n}</button>`).join('')}</div><div class="ll-rows">${layerRows(d) || '<p class="hint">Aucun calque.</p>'}</div>${tools}<div class="hint">Le calque du haut de la liste passe devant les autres. Glisse une ligne pour changer l'ordre ; double-clic pour la renommer.</div>`);
  if (sel) h += sec('calque', 'Calque : ' + layerName(sel), layerPanel(sel));
  h += sec('peinture', 'Peinture de la carrosserie', paintPanel(d));
  h += sec('feux', 'Feux', colorRow('d:lamps.front', 'Couleur des feux avant', d.lamps?.front || '#e8f4ff') + colorRow('d:lamps.rear', 'Couleur des feux arrière', d.lamps?.rear || '#ff1a12') + rg('d:lamps.glow', 'Force du halo', d.lamps?.glow ?? 1, 0, 2, 0.01) + '<div class="hint">Réglages par défaut de cette livrée ; chaque voiture peut les changer dans l\'onglet 3D. Allume les feux avec le sélecteur en haut pour voir le rendu.</div>');
  h += sec('zones', 'Châssis, jantes, vitres, pneus', zoneRow('chassis', 'Châssis, aileron, pare-chocs', d.base[1]) + zoneRow('rim', 'Jantes', '#0b0c12') + zoneRow('glass', 'Vitres', '#05070e') + zoneRow('tires', 'Pneus', '#050505')
    + '<div class="hint">Châssis : les pièces vues de face, de dos ou du dessous (arches de pare-chocs…) et l\'aileron. « Origine » rend la couleur du modèle.</div>');
  const box = $('#llControls', root), keep = box.scrollTop;
  box.innerHTML = h; box.scrollTop = keep;
  drawGrad();
  renderHead();
}

// ------------------------------------------------------------------ aperçu
const CADRAGE = 0.5;   // la voiture occupe la moitié de la tuile environ : elle tient entière, sous tous les angles
function previewLayer(w = 640, h = 520) {
  return { id: PV, type: 'model', model: 'g:rl:' + ST.car, x: 0, y: 0, w, h, rot: 0, ...ST.cam, zoom3d: ST.cam.zoom3d * CADRAGE, frame: 'all', floor: solStudio(), fov: 30, anim: 0, animTime: 0, livery: ST.id, lights: ST.lights, envLight: 0.9,
    key: { color: '#eef2ff', intensity: 1.7, angle: -45 }, rim: { color: '#7ab8ff', intensity: 2, angle: 160 }, fill: { color: '#c9d4ff', intensity: 0.6 }, ambient: { color: '#8ea3e8', intensity: 0.7 } };
}
function preview() {
  if (!ST.open || ST.raf) return;
  ST.raf = requestAnimationFrame(() => {
    ST.raf = 0;
    const cv = $('#llCanvas', root), ctx = cv.getContext('2d');
    fitCanvas(cv);
    let out = null;
    try { out = renderModelPreview(previewLayer(cv.width, cv.height), cv.width, cv.height, S.doc.theme); } catch (err) { console.error('Créateur de livrées', err); }
    if (out) { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(out, 0, 0, cv.width, cv.height); ST.tries = 0; try { drawOverlay(); } catch (err) { console.error('Créateur de livrées : cadre du calque', err); } }
    else if (ST.tries++ < 60) setTimeout(() => { if (ST.open) preview(); }, 350);
  });
}

// ------------------------------------------------------------------ export / import
async function doExport() {
  const data = exportLiveries(), st = $('#llStatus', root);
  try {
    const p = API?.saveText ? await API.saveText({ data, suggested: 'livrees-heliance.json' }) : null;
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

export const labState = () => ST;   // banc d'essai (développement) : état du créateur, poignées du calque sélectionné
// id : livrée à ouvrir ; car : voiture de l'affiche d'où l'on vient (son onglet s'ouvre).
export function openLiveryLab(id, car) {
  if (!root) build();
  ST.open = true; root.hidden = false; window.Transitions?.entrer(root);
  if (car && CARS.some(c => c[0] === car)) ST.car = car;
  const va = x => x && getDef(x) && (!getDef(x).only || getDef(x).only === ST.car || !car);
  if (va(id)) select_(id); else if (va(ST.id)) select_(ST.id); else openCar();   // à défaut : la dernière livrée ouverte (dans son onglet), sinon l'onglet de la voiture
}
export function closeLiveryLab() {
  if (!root || !ST.open) return;
  clearTimeout(ST.t); if (window.Transitions) window.Transitions.sortir(root, () => { root.hidden = true; }); else root.hidden = true; ST.open = false;
  document.dispatchEvent(new CustomEvent('poselab:closed'));   // rafraîchit le panneau 3D et les affiches
}
