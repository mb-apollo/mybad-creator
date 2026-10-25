// Panneaux de l'éditeur : calques, propriétés, contenu, thème, bibliothèque, modèles.
import { S, API, on, emit, change, select, toggleSelect, layerById, selected, toast } from './state.js';
import { $, $$, esc, getPath, setPath, section, num, range, toggle, select as sel, seg, textInput, colorCtl, syncRange, pct, px, deg, icon } from './ui.js';
import { THEMES, THEME_TOKENS, FORMATS, applyTemplate, setScriptMode, renderDoc, FONT_ROLES, FONT_LIST, setGameDefaults } from './engine/render.js';
import { TEMPLATES } from './engine/templates.js';
import { BLENDS, layerText, textLayout, uid } from './engine/scene.js';
import { GAMES, gameItems } from './engine/games.js';
import { align, distribute, arrange, deleteSelected, duplicateSelected, addLayer, requestRender } from './editor.js';

export const actions = {}; // fonctions fournies par app.js (importer une image, détourer, etc.)

// ================================================================ CALQUES
const TYPE_ICON = { text: 'text', image: 'image', shape: 'shape', effect: 'effect', emblem: 'emblem', bg: 'bg', model: 'model' };
let dragId = null;
export function renderLayers() {
  const box = $('#layersList'); if (!box || !S.doc) return;
  const rows = [...S.doc.layers].reverse();
  box.innerHTML = rows.map(L => `<div class="lrow ${S.sel.includes(L.id) ? 'on' : ''} ${L.visible === false ? 'hidden-l' : ''}" data-id="${L.id}" draggable="${L.type !== 'bg'}">
    <button class="lbtn" data-act="vis" title="${L.visible === false ? 'Afficher' : 'Masquer'}">${icon(L.visible === false ? 'eyeoff' : 'eye')}</button>
    <span class="ltype">${icon(TYPE_ICON[L.type] || 'shape')}</span>
    <span class="lname" title="Double-clic pour renommer">${esc(L.name || L.type)}</span>
    ${L.variant ? `<span class="ltag">${L.variant === 'script' ? 'manuscrit' : 'classique'}</span>` : ''}
    <button class="lbtn ${L.locked ? 'locked' : ''}" data-act="lock" title="${L.locked ? 'Déverrouiller' : 'Verrouiller'}">${icon(L.locked ? 'lock' : 'unlock')}</button>
  </div>`).join('');
  $('#layersCount').textContent = `${S.doc.layers.length} calques`;
}
export function initLayers() {
  const box = $('#layersList');
  box.addEventListener('click', e => {
    const row = e.target.closest('.lrow'); if (!row) return;
    const id = row.dataset.id, act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'vis') { change(d => { const L = d.layers.find(l => l.id === id); L.visible = L.visible === false; }, { immediate: true }); return; }
    if (act === 'lock') { change(d => { const L = d.layers.find(l => l.id === id); L.locked = !L.locked; }, { immediate: true }); return; }
    if (e.shiftKey || e.ctrlKey) toggleSelect(id); else select(id);
  });
  box.addEventListener('dblclick', e => {
    const nm = e.target.closest('.lname'); if (!nm) return;
    const id = nm.closest('.lrow').dataset.id, L = layerById(id);
    const inp = document.createElement('input'); inp.className = 'input lrename'; inp.value = L.name || '';
    nm.replaceWith(inp); inp.focus(); inp.select();
    const done = ok => { if (ok && inp.value.trim()) change(d => { d.layers.find(l => l.id === id).name = inp.value.trim(); }, { immediate: true }); else renderLayers(); };
    inp.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); ev.stopPropagation(); };
    inp.onblur = () => done(true);
  });
  box.addEventListener('dragstart', e => { dragId = e.target.closest('.lrow')?.dataset.id; e.dataTransfer.effectAllowed = 'move'; });
  box.addEventListener('dragover', e => { e.preventDefault(); const row = e.target.closest('.lrow'); $$('.lrow', box).forEach(r => r.classList.remove('drop-above', 'drop-below')); if (row && row.dataset.id !== dragId) { const r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below'); } });
  box.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.lrow'); $$('.lrow', box).forEach(r => r.classList.remove('drop-above', 'drop-below'));
    if (!row || !dragId || row.dataset.id === dragId) return;
    const above = e.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    const target = row.dataset.id, moving = dragId;
    change(d => {
      const L = d.layers.find(l => l.id === moving);
      d.layers = d.layers.filter(l => l.id !== moving);
      let idx = d.layers.findIndex(l => l.id === target);
      // la liste est affichée de haut en bas = ordre inverse du tableau
      idx = above ? idx + 1 : idx;
      if (d.layers[idx - 1]?.type === 'bg' && idx === 0) idx = 1;
      d.layers.splice(Math.max(1, idx), 0, L);
    }, { immediate: true });
    dragId = null;
  });
  $('#layersFoot').addEventListener('click', e => {
    const a = e.target.closest('[data-lact]')?.dataset.lact;
    if (a === 'dup') duplicateSelected();
    if (a === 'del') deleteSelected();
    if (a === 'up') arrange('up');
    if (a === 'down') arrange('down');
    if (a === 'add') toggleAddMenu();
  });
  $('#addMenu').addEventListener('click', e => {
    const k = e.target.closest('[data-add]')?.dataset.add; if (!k) return;
    $('#addMenu').hidden = true;
    addPreset(k);
  });
}
function toggleAddMenu() { $('#addMenu').hidden = !$('#addMenu').hidden; }
document.addEventListener('click', e => { if (!e.target.closest('#addMenu') && !e.target.closest('[data-lact="add"]')) { const m = $('#addMenu'); if (m) m.hidden = true; } });

export function addPreset(k) {
  const W = S.doc.W, H = S.doc.H, u = Math.min(W, H * 0.8) / 1080;
  const c = { x: W / 2, y: H / 2 };
  const P = {
    text: () => ({ type: 'text', name: 'Texte', text: 'Ton texte', fontRole: 'display', font: 'Space Grotesk', weight: 700, size: 72 * u, color: '$text', align: 'center', upper: false, autoFit: false, lineHeight: 1.1, x: c.x - 350 * u, y: c.y - 40 * u, w: 700 * u }),
    script: () => ({ type: 'text', name: 'Texte manuscrit', text: 'Manuscrit', fontRole: 'script', font: 'Great Vibes', weight: 400, size: 160 * u, color: '$text', align: 'center', ascent: 0.95, autoFit: false, x: c.x - 400 * u, y: c.y - 90 * u, w: 800 * u, fx: { glow: { on: true, color: '$white', blur: 18, opacity: 0.45 } } }),
    label: () => ({ type: 'text', name: 'Mention', text: 'MENTION', fontRole: 'body', font: 'Space Grotesk', weight: 500, size: 24 * u, spacing: 0.2, color: '$muted', align: 'center', upper: true, x: c.x - 250 * u, y: c.y, w: 500 * u }),
    pill: () => ({ type: 'shape', name: 'Cadre', shape: 'rect', radius: 10, fill: '$panel', stroke: '$line', strokeWidth: 2, x: c.x - 140 * u, y: c.y - 40 * u, w: 280 * u, h: 80 * u }),
    rect: () => ({ type: 'shape', name: 'Rectangle', shape: 'rect', radius: 0, fill: '$accent', x: c.x - 150 * u, y: c.y - 90 * u, w: 300 * u, h: 180 * u }),
    ellipse: () => ({ type: 'shape', name: 'Ellipse', shape: 'ellipse', fill: '$accent', x: c.x - 110 * u, y: c.y - 110 * u, w: 220 * u, h: 220 * u }),
    line: () => ({ type: 'shape', name: 'Ligne', shape: 'line', stroke: '$line', strokeWidth: 2, x: c.x - 160 * u, y: c.y, w: 320 * u, h: 6 * u }),
    star: () => ({ type: 'shape', name: 'Étoile du Nord', shape: 'star', fill: '$accent', x: c.x - 40 * u, y: c.y - 50 * u, w: 80 * u, h: 100 * u, fx: { glow: { on: true, color: '$accent', blur: 20, opacity: 0.7 } } }),
    arrows: () => ({ type: 'shape', name: 'Flèches', shape: 'arrows', fill: '$accent', count: 2, x: c.x - 25 * u, y: c.y - 10 * u, w: 50 * u, h: 20 * u }),
    chevrons: () => ({ type: 'shape', name: 'Chevrons', shape: 'chevrons', stroke: '$text', strokeWidth: 2.5, count: 3, x: c.x - 90 * u, y: c.y - 45 * u, w: 180 * u, h: 90 * u }),
    brackets: () => ({ type: 'shape', name: 'Coins de cadre', shape: 'brackets', stroke: '$text', strokeWidth: 2.5, len: 0.15, x: c.x - 200 * u, y: c.y - 200 * u, w: 400 * u, h: 400 * u }),
    slashes: () => ({ type: 'shape', name: 'Barres', shape: 'slashes', stroke: '$muted', strokeWidth: 1.6, count: 4, x: c.x - 30 * u, y: c.y - 11 * u, w: 60 * u, h: 22 * u }),
    polygon: () => ({ type: 'shape', name: 'Polygone', shape: 'polygon', sides: 6, fill: null, stroke: '$accent', strokeWidth: 3, x: c.x - 120 * u, y: c.y - 120 * u, w: 240 * u, h: 240 * u }),
    emblem: () => ({ type: 'emblem', name: 'Emblème MyBad', color: '$text', x: c.x - 220 * u, y: c.y - 200 * u, w: 440 * u, h: 400 * u, fx: { glow: { on: true, color: '$glow', blur: 40, opacity: 0.35 } } }),
    glow: () => ({ type: 'effect', name: 'Halo', effect: 'glow', color: '$glow', amount: 0.6, themed: true, x: c.x - 400 * u, y: c.y - 400 * u, w: 800 * u, h: 800 * u }),
    stars: () => ({ type: 'effect', name: 'Poussière d\'étoiles', effect: 'stars', color: '$white', amount: 0.5, seed: Math.floor(Math.random() * 999), x: 0, y: 0, w: W, h: H }),
    streaks: () => ({ type: 'effect', name: 'Traînées', effect: 'streaks', color: '$glow', amount: 0.5, seed: Math.floor(Math.random() * 999), themed: true, x: 0, y: H * 0.4, w: W, h: H * 0.3 }),
    bars: () => ({ type: 'effect', name: 'Barres lumineuses', effect: 'bars', color: '$glow', amount: 0.5, seed: Math.floor(Math.random() * 999), themed: true, x: 0, y: 0, w: W, h: H }),
    beam: () => ({ type: 'effect', name: 'Faisceau', effect: 'beam', color: '$glow', amount: 0.6, themed: true, x: W * 0.1, y: 0, w: W * 0.8, h: H * 0.7 }),
    bigstar: () => ({ type: 'effect', name: 'Grande étoile', effect: 'bigstar', color: '$glow', amount: 0.7, themed: true, x: W * 0.25, y: H * 0.2, w: W * 0.5, h: H * 0.5 }),
    constellation: () => ({ type: 'effect', name: 'Constellation', effect: 'constellation', color: '$white', amount: 0.6, seed: Math.floor(Math.random() * 999), x: 0, y: 0, w: W, h: H }),
    grid: () => ({ type: 'effect', name: 'Grille', effect: 'grid', color: '$glow', amount: 0.7, themed: true, horizon: 0, x: 0, y: H * 0.6, w: W, h: H * 0.4 }),
    vignette: () => ({ type: 'effect', name: 'Vignette', effect: 'vignette', color: '#000000', amount: 0.6, full: true, x: 0, y: 0, w: W, h: H }),
    grain: () => ({ type: 'effect', name: 'Grain', effect: 'grain', amount: 0.3, full: true, x: 0, y: 0, w: W, h: H }),
    image: () => { actions.importImageLayer?.(); return null; },
    agent: () => ({ type: 'image', name: `Render ${GAMES[S.doc.game].itemLabel.toLowerCase()}`, asset: 'g:' + S.doc.game + ':' + (gameItems(S.doc.game, S.extraItems)[0]?.key || ''), ph: 'agent', fit: 'contain', anchor: 'bottom', x: c.x - 250 * u, y: c.y - 350 * u, w: 500 * u, h: 700 * u, fx: { glow: { on: true, color: '$glow', blur: 34, opacity: 0.5 } } }),
    model: () => actions.addModelLayer?.() || null,
  };
  const L = P[k]?.();
  if (L) addLayer(L);
}

// ================================================================ PROPRIÉTÉS
const FONT_OPTS = () => [['', 'Police du thème'], ...FONT_LIST.map(f => [f, f])];
const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold'], [800, 'Extra-bold'], [900, 'Black']];
const EFFECTS = [['glow', 'Halo'], ['stars', 'Poussière d\'étoiles'], ['streaks', 'Traînées'], ['bars', 'Barres lumineuses'], ['beam', 'Faisceau'], ['bigstar', 'Grande étoile'], ['constellation', 'Constellation'], ['grid', 'Grille'], ['vignette', 'Vignette'], ['grain', 'Grain']];
const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['line', 'Ligne'], ['star', 'Étoile du Nord'], ['polygon', 'Polygone'], ['brackets', 'Coins de cadre'], ['arrows', 'Flèches'], ['chevrons', 'Chevrons'], ['slashes', 'Barres obliques'], ['shield', 'Bouclier']];

function alignBar() {
  const b = (a, i, t) => `<button class="icon-btn" data-align="${a}" title="${t}">${icon(i)}</button>`;
  return `<div class="alignbar">${b('left', 'alignL', 'Aligner à gauche')}${b('hcenter', 'alignHC', 'Centrer horizontalement')}${b('right', 'alignR', 'Aligner à droite')}<span class="sep"></span>${b('top', 'alignT', 'Aligner en haut')}${b('vcenter', 'alignVC', 'Centrer verticalement')}${b('bottom', 'alignB', 'Aligner en bas')}<span class="sep"></span>${b('dh', 'distH', 'Répartir horizontalement')}${b('dv', 'distV', 'Répartir verticalement')}<span class="sep"></span>${b('front', 'front', 'Premier plan (Ctrl+Maj+])')}${b('back', 'back', 'Arrière-plan (Ctrl+Maj+[)')}</div>`;
}

function fxSections(L, th) {
  const f = L.fx || {};
  const g = f.glow || {}, s = f.shadow || {}, st = f.stroke || {}, fd = f.fade || {};
  let h = '';
  h += section('Lueur', `${toggle('fx.glow.on', 'Activer', g.on)}${g.on ? colorCtl('fx.glow.color', 'Couleur', g.color || '$glow', th) + range('fx.glow.blur', 'Diffusion', g.blur ?? 30, 0, 120, 1, px) + range('fx.glow.opacity', 'Intensité', g.opacity ?? 0.9, 0, 1, 0.01, pct) + toggle('fx.glow.strength', 'Renforcer', (g.strength ?? 1) > 1) : ''}`, !!g.on);
  h += section('Ombre portée', `${toggle('fx.shadow.on', 'Activer', s.on)}${s.on ? colorCtl('fx.shadow.color', 'Couleur', s.color || '#000000', th) + range('fx.shadow.blur', 'Flou', s.blur ?? 20, 0, 120, 1, px) + range('fx.shadow.opacity', 'Opacité', s.opacity ?? 0.6, 0, 1, 0.01, pct) + `<div class="grid2">${num('fx.shadow.x', 'X', s.x ?? 0)}${num('fx.shadow.y', 'Y', s.y ?? 10)}</div>` : ''}`, !!s.on);
  if (L.type !== 'effect') h += section('Contour', `${toggle('fx.stroke.on', 'Activer', st.on)}${st.on ? colorCtl('fx.stroke.color', 'Couleur', st.color || '$text', th) + range('fx.stroke.width', 'Épaisseur', st.width ?? 4, 0, 40, 0.5, px) : ''}`, !!st.on);
  h += section('Fondu progressif', `${toggle('fx.fade.on', 'Activer', fd.on)}${fd.on ? seg('fx.fade.dir', fd.dir || 'bottom', [['bottom', 'Bas'], ['top', 'Haut'], ['left', 'Gauche'], ['right', 'Droite']], { small: true }) + range('fx.fade.amount', 'Longueur', fd.amount ?? 0.3, 0, 1, 0.01, pct) : ''}`, !!fd.on);
  if (L.type === 'image' || L.type === 'model' || L.type === 'emblem' || L.type === 'text') h += section('Fondu pixel', `${range('fx.smear', 'Intensité', f.smear || 0, 0, 1, 0.01, pct)}${(f.smear || 0) > 0 ? range('fx.smearCut', 'Début du fondu', f.smearCut ?? 0.72, 0.2, 1, 0.01, pct) + `<button class="mini-btn" data-act="reseed">Varier les traînées</button>` : ''}`, (f.smear || 0) > 0);
  return h;
}

function itemOptions(game) { return gameItems(game, S.extraItems).map(i => [i.key, i.name]); }

export function renderProps() {
  const box = $('#propsBody'); if (!box || !S.doc) return;
  const cur = selected(), th = S.doc.theme;
  if (!cur.length) {
    box.innerHTML = `<div class="empty-props">
      <p class="muted">Aucun calque sélectionné. Clique sur un élément de l'affiche ou dans la liste des calques.</p>
      ${section('Ajouter', `<div class="addgrid">${[['text', 'text', 'Texte'], ['script', 'text', 'Manuscrit'], ['image', 'image', 'Image'], ['agent', 'image', GAMES[S.doc.game].itemLabel], ['model', 'model', 'Modèle 3D'], ['emblem', 'emblem', 'Emblème'], ['pill', 'shape', 'Cadre'], ['star', 'star', 'Étoile'], ['glow', 'effect', 'Halo']].map(([k, i, l]) => `<button class="addbtn" data-addp="${k}">${icon(i)}<span>${l}</span></button>`).join('')}</div>`)}
      ${section('Raccourcis utiles', `<div class="kbd-mini"><span>Déplacer</span><kbd>Glisser</kbd><span>Garder les proportions / libre</span><kbd>Maj</kbd><span>Depuis le centre</span><kbd>Alt</kbd><span>Dupliquer</span><kbd>Ctrl+D</kbd><span>Déplacer la vue</span><kbd>Espace</kbd><span>Zoom</span><kbd>Ctrl+molette</kbd></div>`, false)}
    </div>`;
    bind(box, []);
    return;
  }
  if (cur.length > 1) {
    box.innerHTML = `${alignBar()}<p class="muted pad">${cur.length} calques sélectionnés</p>${section('Apparence', range('opacity', 'Opacité', cur[0].opacity ?? 1, 0, 1, 0.01, pct))}<div class="pad"><button class="mini-btn danger" data-act="delete">Supprimer la sélection</button></div>`;
    bind(box, cur);
    return;
  }
  const L = cur[0];
  let h = `<div class="props-head"><span class="ptype">${icon(TYPE_ICON[L.type])}</span><input class="input pname" data-path="name" value="${esc(L.name || '')}" aria-label="Nom du calque">${L.locked ? `<button class="mini-btn" data-act="unlock">${icon('unlock')} Déverrouiller</button>` : ''}</div>`;
  if (L.type !== 'bg' && !L.full) h += alignBar();
  if (L.type === 'text') {
    const linked = L.tpl && /^\{\w+\}$/.test(L.tpl);
    const txt = layerText({ ...L, upper: false }, S.doc.T);
    h += section('Texte', `
      ${L.runs ? `<p class="muted">Texte composé de plusieurs couleurs (champs du Contenu). Change les couleurs ci-dessous.</p>${L.runs.map((r, i) => colorCtl(`runs.${i}.color`, r.tpl ? `Segment « ${r.tpl.replace(/[{}]/g, '')} »` : `Segment « ${r.text} »`, r.color, th)).join('')}`
        : `<textarea class="input ptext" data-text rows="${Math.min(5, txt.split('\n').length + 1)}" spellcheck="false">${esc(txt)}</textarea>${L.tpl ? `<p class="hint">${linked ? 'Relié au champ du panneau Contenu.' : 'Composé à partir du Contenu : le modifier ici le rend indépendant.'}</p>` : ''}`}
      ${sel('font', 'Police', L.fontOverride ? L.font : '', FONT_OPTS(), { raw: true })}
      <div class="grid2">${sel('weight', 'Graisse', L.weight || 700, WEIGHTS)}${num('size', 'Taille', L.size, { min: 4 })}</div>
      ${colorCtl('color', 'Couleur', L.color, th)}
      ${seg('align', L.align || 'center', [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']], { small: true })}
      ${range('spacing', 'Espacement des lettres', L.spacing || 0, -0.1, 0.5, 0.005, v => (v * 100).toFixed(1))}
      ${range('lineHeight', 'Interligne', L.lineHeight || 1.1, 0.7, 2, 0.01, v => v.toFixed(2))}
      <div class="grid2">${toggle('italic', 'Italique', L.italic)}${toggle('upper', 'Majuscules', L.upper)}</div>
      ${toggle('autoFit', 'Réduire pour tenir dans la largeur', L.autoFit !== false)}`);
    h += section('Style du texte', `${seg('style', L.style || 'fill', [['fill', 'Plein'], ['outline', 'Contour'], ['both', 'Les deux']], { small: true })}
      ${L.style && L.style !== 'fill' ? colorCtl('strokeColor', 'Couleur du contour', L.strokeColor || '$text', th) + range('strokeWidth', 'Épaisseur du contour', L.strokeWidth ?? 2, 0.5, 20, 0.1, v => v.toFixed(1)) : ''}
      ${toggle('grad.on', 'Dégradé', L.grad?.on)}${L.grad?.on ? colorCtl('grad.from', 'Début', L.grad.from || '$text', th) + colorCtl('grad.to', 'Fin', L.grad.to || '$accent', th) + range('grad.angle', 'Angle', L.grad.angle ?? 90, 0, 360, 1, deg) : ''}`, !!(L.style && L.style !== 'fill') || !!L.grad?.on);
  }
  if (L.type === 'shape') {
    h += section('Forme', `${sel('shape', 'Type', L.shape, SHAPES)}
      ${colorCtl('fill', 'Remplissage', L.fill, th, { none: true })}
      ${colorCtl('stroke', 'Trait', L.stroke, th, { none: true })}
      ${range('strokeWidth', 'Épaisseur du trait', L.strokeWidth ?? 2, 0, 40, 0.5, v => v.toFixed(1))}
      ${L.shape === 'rect' ? range('radius', 'Arrondi', L.radius || 0, 0, 200, 1, px) : ''}
      ${['arrows', 'chevrons', 'slashes'].includes(L.shape) ? range('count', 'Nombre', L.count || 2, 1, 8, 1) : ''}
      ${L.shape === 'polygon' ? range('sides', 'Côtés', L.sides || 6, 3, 12, 1) : ''}
      ${L.shape === 'brackets' ? range('len', 'Longueur des coins', L.len ?? 0.08, 0.02, 0.5, 0.005, pct) : ''}
      ${L.shape === 'star' ? range('inner', 'Finesse des branches', L.inner ?? 0.13, 0.02, 0.6, 0.01, v => v.toFixed(2)) : ''}
      ${range('dash', 'Pointillés', L.dash || 0, 0, 40, 1, v => v ? v + ' px' : 'aucun')}
      ${toggle('grad.on', 'Remplissage en dégradé', L.grad?.on)}${L.grad?.on ? colorCtl('grad.from', 'Début', L.grad.from || '$accent', th) + colorCtl('grad.to', 'Fin', L.grad.to || '$bg', th) + range('grad.angle', 'Angle', L.grad.angle ?? 90, 0, 360, 1, deg) : ''}`);
  }
  if (L.type === 'emblem') {
    h += section('Emblème', `${colorCtl('color', 'Couleur des ailes', L.color, th)}${toggle('star', 'Étoile', L.star !== false)}${L.star !== false ? colorCtl('starColor', 'Couleur de l\'étoile', L.starColor && L.starColor !== 'gradient' ? L.starColor : null, th, { none: true }) + '<p class="hint">∅ = dégradé violet → cyan d\'origine</p>' : ''}${toggle('wings', 'Ailes', L.wings !== false)}`);
  }
  if (L.type === 'image') {
    const bound = L.asset && L.asset[0] === '@';
    const game = L.asset?.startsWith('g:') ? L.asset.split(':')[1] : S.doc.game;
    const gameKey = bound ? S.doc.T[L.asset.slice(1)] : L.asset?.startsWith('g:') ? L.asset.split(':')[2] : null;
    h += section('Image', `
      ${bound || L.asset?.startsWith('g:') ? sel(bound ? 'T.' + L.asset.slice(1) : 'gameItem', GAMES[game]?.itemLabel || 'Élément', gameKey, itemOptions(game)) : ''}
      <div class="btnrow"><button class="mini-btn" data-act="replaceImage">${icon('upload')} ${L.asset?.startsWith('u:') ? 'Remplacer' : 'Utiliser ma propre image'}</button>
      ${L.asset?.startsWith('u:') ? `<button class="mini-btn" data-act="removeBg">${icon('wand')} Détourer</button>` : ''}</div>
      ${seg('fit', L.fit || 'contain', [['contain', 'Contenir'], ['cover', 'Remplir le cadre']], { small: true })}
      ${range('zoom', 'Zoom dans le cadre', L.zoom || 1, 0.2, 4, 0.01, pct)}
      <div class="grid2">${range('panX', 'Décalage X', L.panX || 0, -1, 1, 0.005, v => Math.round(v * 100))}${range('panY', 'Décalage Y', L.panY || 0, -1, 1, 0.005, v => Math.round(v * 100))}</div>
      ${toggle('flipX', 'Miroir horizontal', L.flipX)}`);
    const f = L.filters || {};
    h += section('Réglages', `${range('filters.brightness', 'Luminosité', f.brightness ?? 100, 0, 200, 1, v => v + ' %')}${range('filters.contrast', 'Contraste', f.contrast ?? 100, 0, 200, 1, v => v + ' %')}${range('filters.saturate', 'Saturation', f.saturate ?? 100, 0, 200, 1, v => v + ' %')}${range('filters.hue', 'Teinte', f.hue || 0, -180, 180, 1, deg)}${range('filters.grayscale', 'Noir et blanc', f.grayscale || 0, 0, 100, 1, v => v + ' %')}${range('filters.blur', 'Flou', f.blur || 0, 0, 30, 0.5, v => v + ' px')}<button class="mini-btn" data-act="resetFilters">Réinitialiser les réglages</button>`, false);
    const t = L.tint || {};
    h += section('Coloration', `${toggle('tint.on', 'Colorer l\'image', t.on)}${t.on ? colorCtl('tint.color', 'Couleur', t.color || '$glow', th) + range('tint.amount', 'Intensité', t.amount ?? 0.6, 0, 1, 0.01, pct) + sel('tint.mode', 'Mode', t.mode || 'color', [['color', 'Couleur'], ['multiply', 'Produit'], ['screen', 'Écran'], ['overlay', 'Incrustation'], ['soft-light', 'Lumière tamisée'], ['source-atop', 'Aplat']]) : ''}`, !!t.on);
  }
  if (L.type === 'model') h += actions.modelProps ? actions.modelProps(L) : '';
  if (L.type === 'effect') {
    h += section('Effet', `${sel('effect', 'Type', L.effect, EFFECTS)}${L.effect !== 'grain' ? colorCtl('color', 'Couleur', L.color, th) : ''}${range('amount', 'Intensité', L.amount ?? 0.5, 0, 1.5, 0.01, pct)}${toggle('themed', 'Suit l\'intensité lumineuse du thème', L.themed)}${['stars', 'streaks', 'bars', 'constellation'].includes(L.effect) ? '<button class="mini-btn" data-act="reseed">Varier la disposition</button>' : ''}${L.effect === 'grid' ? range('horizon', 'Horizon', L.horizon ?? 0.35, 0, 0.9, 0.01, pct) : ''}`);
  }
  if (L.type === 'bg') {
    h += section('Fond', `${seg('mode', L.mode || 'linear', [['linear', 'Dégradé'], ['radial', 'Radial'], ['solid', 'Uni']], { small: true })}${colorCtl('c1', L.mode === 'radial' ? 'Centre' : 'Haut', L.c1, th)}${L.mode !== 'solid' ? colorCtl('c2', L.mode === 'radial' ? 'Bords' : 'Bas', L.c2, th) : ''}`);
  }
  if (L.type !== 'bg' && !L.full) {
    h += section('Position et taille', `<div class="grid2">${num('x', 'X', L.x)}${num('y', 'Y', L.y)}${num('w', 'L', L.w, { min: 1 })}${L.type === 'text' ? '' : num('h', 'H', L.h, { min: 1 })}${num('rot', 'Rotation', L.rot || 0, { unit: '°' })}</div>`);
  }
  if (L.type !== 'bg') {
    h += section('Apparence', `${range('opacity', 'Opacité', L.opacity ?? 1, 0, 1, 0.01, pct)}${sel('blend', 'Mode de fusion', L.blend || 'source-over', BLENDS)}`);
    h += fxSections(L, th);
  }
  h += `<div class="pad btnrow"><button class="mini-btn" data-act="duplicate">${icon('copy')} Dupliquer</button><button class="mini-btn danger" data-act="delete">${icon('trash')} Supprimer</button></div>`;
  const scroll = box.scrollTop;
  box.innerHTML = h;
  box.scrollTop = scroll;
  bind(box, cur);
}

// Liaison générique : tout champ [data-path] modifie les calques sélectionnés.
function bind(box, targets) {
  const apply = (path, value, live) => {
    if (path.startsWith('T.')) { change(d => { d.T[path.slice(2)] = value; }, { immediate: !live }); return; }
    if (path === 'gameItem') { change(() => targets.forEach(L => { const [, g] = L.asset.split(':'); L.asset = `g:${g}:${value}`; }), { immediate: true }); return; }
    if (path === 'font') { change(() => targets.forEach(L => { if (value) { L.font = value; L.fontOverride = true; } else { L.fontOverride = false; } }), { immediate: true }); return; }
    if (path === 'fx.glow.strength') value = value ? 2 : 1;
    if (path === 'starColor' && (value === 'none' || !value)) value = 'gradient';
    change(() => targets.forEach(L => setPath(L, path, value)), { immediate: !live, noProps: live });
  };
  box.oninput = e => {
    const el = e.target;
    if (el.dataset.text != null) { editText(targets[0], el.value); return; }
    if (el.dataset.chex != null) { const v = el.value.trim(); if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) apply(el.closest('[data-color]').dataset.color, v, true); return; }
    if (el.dataset.cpick != null) { apply(el.closest('[data-color]').dataset.color, el.value, true); const hx = el.parentElement.querySelector('[data-chex]'); if (hx) hx.value = el.value; el.closest('.colorctl').querySelectorAll('.on').forEach(c => c.classList.remove('on')); return; }
    const path = el.dataset.path; if (!path) return;
    if (el.type === 'range') { apply(path, +el.value, true); syncRange(el, el.closest('.range').querySelector('output') ? fmtOf(el) : null); return; }
    if (el.type === 'number') { if (el.value !== '') apply(path, +el.value, true); return; }
    if (el.tagName === 'INPUT' && el.type === 'text' || el.classList.contains('pname')) { apply(path, el.value, true); }
  };
  box.onchange = e => {
    const el = e.target, path = el.dataset.path;
    if (el.dataset.cpick != null || el.type === 'range' || el.type === 'number') { change(() => {}, { immediate: true }); return; }
    if (!path) return;
    if (el.type === 'checkbox') { apply(path, el.checked, false); renderProps(); return; }
    if (el.tagName === 'SELECT') { apply(path, el.dataset.raw ? el.value : (isNaN(+el.value) || el.value === '' ? el.value : +el.value), false); renderProps(); return; }
  };
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const segEl = b.closest('[data-seg]');
    if (segEl) { apply(segEl.dataset.seg, b.dataset.v, false); renderProps(); return; }
    const cc = b.closest('[data-color]');
    if (cc && b.dataset.cv) { apply(cc.dataset.color, b.dataset.cv === 'none' ? null : b.dataset.cv, false); renderProps(); return; }
    if (b.dataset.align) {
      const a = b.dataset.align;
      if (a === 'dh') distribute('h'); else if (a === 'dv') distribute('v'); else if (a === 'front' || a === 'back') arrange(a); else align(a);
      return;
    }
    if (b.dataset.addp) { addPreset(b.dataset.addp); return; }
    const act = b.dataset.act;
    if (act === 'delete') deleteSelected();
    if (act === 'duplicate') duplicateSelected();
    if (act === 'unlock') change(() => targets.forEach(L => { L.locked = false; }), { immediate: true });
    if (act === 'reseed') change(() => targets.forEach(L => { L.seed = Math.floor(Math.random() * 9999); }), { immediate: true });
    if (act === 'resetFilters') { change(() => targets.forEach(L => { L.filters = {}; }), { immediate: true }); renderProps(); }
    if (act === 'replaceImage') actions.replaceImage?.(targets[0]);
    if (act === 'removeBg') actions.removeBg?.(targets[0]);
    if (actions.onPropAction) actions.onPropAction(act, targets[0], b);
  };
}
function fmtOf(el) {
  const label = el.closest('.range').querySelector('label').textContent;
  const v = +el.value;
  if (/Opacité|Intensité|Longueur|Zoom|Début|coins/i.test(label) && el.max <= 4) return Math.round(v * 100) + ' %';
  if (/Diffusion|Flou|Épaisseur|Arrondi|Pointillés/.test(label)) return (Math.round(v * 10) / 10) + ' px';
  if (/Angle|Teinte/.test(label)) return Math.round(v) + '°';
  if (/Luminosité|Contraste|Saturation|Noir/.test(label)) return v + ' %';
  if (/Décalage/.test(label)) return Math.round(v * 100);
  if (/Espacement/.test(label)) return (v * 100).toFixed(1);
  return Math.round(v * 100) / 100;
}
function editText(L, value) {
  if (!L) return;
  if (L.tpl && /^\{(\w+)\}$/.test(L.tpl)) { const k = L.tpl.slice(1, -1); change(d => { d.T[k] = value; }); return; }
  change(() => { L.tpl = null; L.text = value; });
}
export function focusText() {
  const ta = $('#propsBody .ptext'); if (ta) { ta.focus(); ta.select(); }
}

// ================================================================ CONTENU
const F = {
  event: 'Compétition', stage: 'Phase / étape', org: 'Structure', adv: 'Équipe adverse', date: 'Date', hour: 'Heure', live: 'Lien de diffusion', coach: 'Coach',
  bo: 'Format', s1: 'Notre score', s2: 'Score adverse', mvp: 'MVP', mvpStat: 'Stats du MVP', gdSide: 'Texte vertical', anNames: 'Noms (séparés par ·)', anSide: 'Texte vertical',
  nrL1: 'Ligne 1', nrL2: 'Ligne 2', tTitle: 'Titre', tGame: 'Sous-titre', tDay: 'Jour', tMonth: 'Mois', tYear: 'Année', tHour: 'Heure', tInfo1: 'Info 1', tInfo2: 'Info 2', tPrize: 'Cashprize', tPrizeLbl: 'Libellé',
  plWeek: 'Semaine', recSub: 'Sous-titre', rec1: 'Poste 1', rec2: 'Poste 2', rec3: 'Poste 3', rec4: 'Poste 4', recCta: 'Bouton', recNote: 'Note',
  cardName: 'Pseudo', cardTag: 'Étiquette', cardRole: 'Rôle', liveTitle: 'Titre du stream', liveUrl: 'Lien',
};
const HALF = new Set(['date', 'hour', 's1', 's2', 'nrL1', 'nrL2', 'tDay', 'tMonth', 'tYear', 'tHour', 'tPrize', 'tPrizeLbl']);
const TITLES = {
  mdTitle: ['mdW1', 'mdW2', 'mdPlain'], rosTitle: ['rosW1', 'rosW2', 'rosPlain'], gdTitle: ['gdW1', 'gdW2', 'gdPlain1', 'gdPlain2'],
  anTitle: ['anW1'], plTitle: ['plW1', 'plW2', 'plPlain'], recTitle: ['recW1', 'recW2', 'recPlain'], liveTitleW: ['liveW1', 'liveW2', 'livePlain'],
};
const AGENT_FIELDS = { mvpAgent: 'du MVP', featAgent: 'principal', anAgent1: '1', anAgent2: '2', tAgent: '', cardAgent: 'du joueur', liveAgent: '' };

export function renderContent() {
  const box = $('#contentBody'); if (!box || !S.doc) return;
  const T = S.doc.T, tpl = TEMPLATES[S.doc.tpl], game = GAMES[S.doc.game], items = itemOptions(S.doc.game);
  const field = (k, label, half) => `<div class="field ${half ? '' : 'full'}"><label>${esc(label)}</label><input class="input" data-t="${k}" value="${esc(T[k] ?? '')}" spellcheck="false"></div>`;
  let h = `<div class="content-head"><div><b>${esc(tpl.name)}</b><span class="muted">${esc(tpl.desc)}</span></div><button class="mini-btn" data-act="reapply" title="Recrée les calques du modèle avec le contenu actuel (tes calques ajoutés sont gardés)">${icon('refresh')} Réinitialiser</button></div>`;
  const hasTitle = tpl.fields.some(f => TITLES[f] || f === 'resTitle');
  const hasRenders = tpl.fields.some(f => f === 'players' || AGENT_FIELDS[f] != null) && S.doc.tpl !== 'matchday';
  if (hasTitle || hasRenders) h += `<div class="pad">${hasTitle ? toggleRaw('script', 'Titre manuscrit + gras', S.doc.script) : ''}${hasRenders ? toggleRaw('use3d', 'Personnages en 3D (modèles .glb)', S.doc.use3d) : ''}</div>`;
  let grid = '';
  const flush = () => { if (grid) { h += `<div class="cgrid">${grid}</div>`; grid = ''; } };
  for (const f of tpl.fields) {
    if (TITLES[f]) {
      const [a, b, c, d] = TITLES[f];
      if (f === 'anTitle') grid += field(a, 'Mot d\'annonce');
      else if (S.doc.script) { grid += field(a, 'Mot manuscrit', true) + field(b, 'Mot en gras', true); }
      else { grid += field(c, d ? 'Titre ligne 1' : 'Titre', !!d); if (d) grid += field(d, 'Titre ligne 2', true); }
      continue;
    }
    if (f === 'resTitle') {
      const s = T.resMode === 'loss' ? 'L' : 'W';
      grid += S.doc.script ? field('resW1' + s, 'Mot manuscrit', true) + field('resW2' + s, 'Mot en gras', true) : field('resPlain' + s, 'Titre');
      continue;
    }
    if (f === 'resMode') { flush(); h += `<div class="pad"><div class="seg wide" data-mode><button data-v="win" class="${T.resMode !== 'loss' ? 'on' : ''}">Victoire</button><button data-v="loss" class="${T.resMode === 'loss' ? 'on' : ''}">Défaite</button></div></div>`; continue; }
    if (AGENT_FIELDS[f] != null) { grid += `<div class="field full"><label>${game.itemLabel} ${AGENT_FIELDS[f]}</label><select class="input" data-t="${f}">${items.map(([v, l]) => `<option value="${v}" ${T[f] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`; continue; }
    if (f === 'players') {
      flush();
      h += `<div class="csec"><div class="csec-head"><span>Joueurs · ${game.name}</span><button class="link-btn" data-act="kitPlayers">Reprendre ceux du kit</button></div>${Array.from({ length: game.players }, (_, i) => `<div class="prow"><b>${i + 1}</b><input class="input" data-t="p${i + 1}" value="${esc(T['p' + (i + 1)])}" placeholder="Pseudo" aria-label="Joueur ${i + 1}"><input class="input" data-t="r${i + 1}" value="${esc(T['r' + (i + 1)])}" placeholder="Rôle" aria-label="Rôle ${i + 1}"><select class="input" data-t="a${i + 1}" aria-label="${game.itemLabel} ${i + 1}">${items.map(([v, l]) => `<option value="${v}" ${T['a' + (i + 1)] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}</div>`;
      continue;
    }
    if (f === 'planning') {
      flush();
      h += `<div class="csec"><div class="csec-head"><span>Programme</span><span class="muted">laisser vide pour masquer une ligne</span></div>${[1, 2, 3, 4, 5].map(i => `<div class="plrow"><input class="input" data-t="pl${i}d" value="${esc(T[`pl${i}d`])}" placeholder="Jour"><input class="input" data-t="pl${i}h" value="${esc(T[`pl${i}h`])}" placeholder="Heure"><input class="input" data-t="pl${i}t" value="${esc(T[`pl${i}t`])}" placeholder="Programme"><input class="input" data-t="pl${i}g" value="${esc(T[`pl${i}g`])}" placeholder="Type"></div>`).join('')}</div>`;
      continue;
    }
    if (f === 'stats') {
      flush();
      h += `<div class="csec"><div class="csec-head"><span>Statistiques</span></div>${[1, 2, 3, 4].map(i => `<div class="strow"><input class="input" data-t="st${i}l" value="${esc(T[`st${i}l`])}" placeholder="Libellé"><input class="input" data-t="st${i}v" value="${esc(T[`st${i}v`])}" placeholder="Valeur"></div>`).join('')}</div>`;
      continue;
    }
    grid += field(f, F[f] || f, HALF.has(f));
  }
  flush();
  h += `<div class="csec"><div class="csec-head"><span>Signature (micro-textes)</span></div><div class="cgrid">${field('sig', 'Ligne 1', true)}${field('coords', 'Ligne 2', true)}</div></div>`;
  box.innerHTML = h;
}
function toggleRaw(id, label, v) { return `<label class="toggle"><span>${esc(label)}</span><input type="checkbox" data-c="${id}" ${v ? 'checked' : ''}></label>`; }
export function initContent() {
  const box = $('#contentBody');
  let plTimer = null;
  box.addEventListener('input', e => {
    const k = e.target.dataset.t; if (!k) return;
    const plBefore = S.doc.tpl === 'planning' ? planningRows() : null;
    change(d => { d.T[k] = e.target.value; });
    if (plBefore != null) { clearTimeout(plTimer); plTimer = setTimeout(() => { if (planningRows() !== plBefore) change(d => applyTemplate(d, d.tpl), { immediate: true, full: false }); }, 500); }
  });
  box.addEventListener('change', e => {
    if (e.target.dataset.c === 'use3d') { change(d => { d.use3d = e.target.checked; applyTemplate(d, d.tpl); }, { immediate: true, full: true }); renderContent(); toast(e.target.checked ? 'Modèles 3D activés : ajuste chaque modèle dans Propriétés' : 'Renders 2D réactivés'); return; }
    if (e.target.dataset.c === 'script') { change(d => setScriptMode(d, e.target.checked), { immediate: true }); renderContent(); renderLayers(); return; }
    if (e.target.tagName === 'SELECT') change(() => {}, { immediate: true });
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('[data-mode]')) {
      const v = b.dataset.v;
      const t = THEMES.find(x => x.id === (v === 'loss' ? 'defaite' : 'polaris'));
      change(d => { d.T.resMode = v; d.themeId = t.id; d.theme = { ...t.c }; applyTemplate(d, d.tpl); }, { immediate: true });
      renderContent();
      toast(v === 'loss' ? 'Thème « Défaite » appliqué' : 'Thème « Polaris » appliqué pour la victoire');
    }
    if (b.dataset.act === 'reapply') { change(d => applyTemplate(d, d.tpl), { immediate: true }); select([]); toast('Mise en page du modèle réinitialisée'); }
    if (b.dataset.act === 'kitPlayers') actions.applyKitPlayers?.();
  });
}
function planningRows() { return [1, 2, 3, 4, 5].map(i => (S.doc.T[`pl${i}d`] || S.doc.T[`pl${i}t`] ? 1 : 0)).join(''); }

// ================================================================ THÈME
export function renderTheme() {
  const box = $('#themeBody'); if (!box || !S.doc) return;
  const th = S.doc.theme;
  let h = section('Ambiance', `<div class="presets">${THEMES.map(t => `<button class="preset ${S.doc.themeId === t.id ? 'on' : ''}" data-theme="${t.id}"><div class="sw" style="background:radial-gradient(circle at 50% 30%, ${t.c.glow}88, transparent 60%), linear-gradient(180deg, ${t.c.bg2}, ${t.c.bg})"><i style="background:${t.c.accent}"></i></div><span>${esc(t.name)}</span></button>`).join('')}</div>
    ${range('light', 'Intensité lumineuse', th.light ?? 1, 0, 2, 0.01, pct)}`);
  h += section('Couleurs', `<div class="tokens">${THEME_TOKENS.map(([k, l]) => `<label class="token"><input type="color" data-token="${k}" value="${th[k]}"><span>${esc(l)}</span><code>${esc(th[k])}</code></label>`).join('')}</div>`);
  h += section('Polices', FONT_ROLES.map(([k, l]) => `<div class="field"><label>${esc(l)}</label><select class="input" data-font="${k}">${FONT_LIST.map(f => `<option ${S.doc.fonts[k] === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></div>`).join('') + '<p class="hint">Les calques sans police forcée suivent ces polices.</p>');
  box.innerHTML = h;
}
export function initTheme() {
  const box = $('#themeBody');
  box.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.token) { change(d => { d.theme[el.dataset.token] = el.value; d.themeId = 'custom'; }); el.parentElement.querySelector('code').textContent = el.value; $$('.preset', box).forEach(p => p.classList.remove('on')); }
    if (el.dataset.path === 'light') { change(d => { d.theme.light = +el.value; }); syncRange(el, pct(+el.value)); }
  });
  box.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.font) change(d => { d.fonts[el.dataset.font] = el.value; }, { immediate: true });
    if (el.dataset.token || el.type === 'range') change(() => {}, { immediate: true });
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-theme]'); if (!b) return;
    const t = THEMES.find(x => x.id === b.dataset.theme);
    change(d => { d.themeId = t.id; d.theme = { ...t.c }; }, { immediate: true });
    renderTheme();
  });
}

// ================================================================ BIBLIOTHÈQUE
let libGame = null;
export function renderLibrary() {
  const box = $('#libraryBody'); if (!box || !S.doc) return;
  libGame ||= S.doc.game;
  const g = GAMES[libGame], items = gameItems(libGame, S.extraItems);
  const done = items.filter(i => S.library.has(`g:${libGame}:${i.key}`)).length;
  const models = items.filter(i => S.libraryModels.has(`g:${libGame}:${i.key}`)).length;
  box.innerHTML = `<div class="pad">${seg('libGame', libGame, Object.values(GAMES).map(x => [x.key, x.name]), { small: true })}</div>
    <div class="lib-stats"><span><b>${done}</b> / ${items.length} renders</span><span><b>${models}</b> modèles 3D</span></div>
    <div class="pad btnrow"><button class="mini-btn" data-lib="folder">${icon('folder')} Importer plusieurs renders</button><button class="mini-btn" data-lib="add">${icon('plus')} Ajouter ${g.itemLabel === 'Agent' ? 'un agent' : 'une voiture'}</button></div>
    <p class="hint pad">Nomme tes fichiers comme l'${g.itemLabel === 'Agent' ? 'agent' : 'élément'} (jett.png, kayo.png…) pour un import automatique. Les modèles 3D (.glb, .gltf) s'importent de la même façon.</p>
    <div class="libgrid">${items.map(i => {
      const k = `g:${libGame}:${i.key}`, url = S.library.get(k), m = S.libraryModels.has(k);
      return `<div class="libitem ${url ? 'has' : ''}" data-key="${i.key}" title="${esc(i.name)}">
        <div class="lthumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span>${esc(i.name.slice(0, 2).toUpperCase())}</span>`}${m ? '<em class="m3d">3D</em>' : ''}</div>
        <b>${esc(i.name)}</b><small>${esc(g.roleLabels[i.role] || i.role === 'car' ? (g.roleLabels[i.role] || 'Voiture') : '')}</small>
        <div class="lacts"><button class="mini-btn" data-lib="png" title="Importer un render PNG">PNG</button><button class="mini-btn" data-lib="glb" title="Importer un modèle 3D">3D</button>${url || m ? `<button class="mini-btn danger" data-lib="del" title="Retirer">✕</button>` : ''}</div>
      </div>`;
    }).join('')}</div>`;
}
export function initLibrary() {
  const box = $('#libraryBody');
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('[data-seg="libGame"]')) { libGame = b.dataset.v; renderLibrary(); return; }
    const act = b.dataset.lib; if (!act) return;
    const key = b.closest('.libitem')?.dataset.key;
    actions.libraryAction?.(act, libGame, key);
  });
}

// ================================================================ MODÈLES (galerie)
export function renderGallery() {
  const box = $('#thumbs'); if (!box) return;
  box.innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<button class="thumb ${S.doc.tpl === k ? 'on' : ''}" data-key="${k}" title="${esc(t.desc)}"><canvas data-key="${k}"></canvas><span>${esc(t.name)}</span></button>`).join('');
  renderThumbs();
}
let thumbTimer = null;
export function scheduleThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbs, 700); }
function renderThumbs() {
  if (!S.doc) return;
  $$('#thumbs canvas').forEach(cv => {
    const d = JSON.parse(JSON.stringify({ ...S.doc, assets: {} }));
    d.assets = S.doc.assets; d.layers = [];
    applyTemplate(d, cv.dataset.key, { keepUser: false });
    try { renderDoc(cv, d, actions.env(d, true, true), 0.2); } catch (err) { console.error(err); }
  });
}
export function initGallery() {
  $('#thumbs').addEventListener('click', e => {
    const b = e.target.closest('.thumb'); if (!b) return;
    actions.switchTemplate?.(b.dataset.key);
  });
}
export function markGallery() { $$('#thumbs .thumb').forEach(t => t.classList.toggle('on', t.dataset.key === S.doc.tpl)); }

export { setGameDefaults, uid, requestRender, textLayout };
