// État central de l'éditeur : document, sélection, historique, bibliothèque et notifications.
import { newDocument, applyTemplate, FORMATS, THEMES, TEXT_DEFAULTS, DEFAULT_FONTS } from './engine/render.js';
import { TEMPLATES } from './engine/templates.js';
import { setDocFonts, uid } from './engine/scene.js';

export const API = window.studio || null;

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= new Set()).add(fn); return () => listeners[ev].delete(fn); }
export function emit(ev, data) { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(ev, e); } }); }

export const S = {
  doc: null,
  sel: [],            // ids des calques sélectionnés
  tool: 'select',
  filePath: null,
  projectName: 'Sans titre',
  dirty: false,
  kit: null,
  library: new Map(), // 'g:valorant:jett' -> url
  libraryModels: new Map(), // 'g:valorant:jett' -> url .glb
  extraItems: [],     // éléments de jeu ajoutés (nouvel agent…)
  clipboard: null,
};

// ---------------------------------------------------------------- document
export function setDoc(doc, opts = {}) {
  S.doc = doc;
  setDocFonts(doc.fonts);
  S.sel = [];
  if (opts.resetHistory !== false) resetHistory();
  emit('doc', { full: true });
  emit('selection');
}
export function normalize(d) {
  if (!d || d.app !== 'mybad-creator' || !Array.isArray(d.layers)) {
    // ancien projet MyBad Poster Studio : on garde les textes et on reconstruit
    const doc = newDocument(S.kit);
    if (d && d.T) Object.assign(doc.T, d.T);
    if (d && d.images) { doc.assets = { ...doc.assets }; if (d.images.logoAdv) doc.assets.logoAdv = d.images.logoAdv; }
    applyTemplate(doc, TEMPLATES[d?.tpl] ? d.tpl : 'matchday');
    return doc;
  }
  const base = newDocument(S.kit);
  const doc = { ...base, ...d, T: { ...TEXT_DEFAULTS, ...d.T }, fonts: { ...DEFAULT_FONTS, ...(d.fonts || {}) }, theme: { ...base.theme, ...(d.theme || {}) }, assets: d.assets || {} };
  if (!FORMATS[doc.fmt]) doc.fmt = '4x5';
  doc.layers = d.layers.map(L => ({ id: L.id || uid(), ...L }));
  return doc;
}

export function layerById(id) { return S.doc.layers.find(L => L.id === id); }
export function selected() { return S.sel.map(layerById).filter(Boolean); }
export function select(ids, add = false) {
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  S.sel = add ? [...new Set([...S.sel, ...list])] : list;
  emit('selection');
}
export function toggleSelect(id) {
  S.sel = S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id];
  emit('selection');
}

// change(fn) : applique une modification, marque le projet modifié, l'enregistre dans l'historique.
export function change(fn, opts = {}) {
  fn(S.doc);
  setDocFonts(S.doc.fonts);
  setDirty(true);
  commit(opts.immediate, opts.label);
  emit('doc', opts);
}

// ---------------------------------------------------------------- historique
const H = { stack: [], index: -1, timer: null };
function snap() { return { json: JSON.stringify({ ...S.doc, assets: undefined }), assets: { ...S.doc.assets }, sel: [...S.sel] }; }
function same(a, b) {
  if (!a || a.json !== b.json) return false;
  const ka = Object.keys(a.assets), kb = Object.keys(b.assets);
  return ka.length === kb.length && ka.every(k => a.assets[k] === b.assets[k]);
}
export function commit(immediate = false) {
  clearTimeout(H.timer);
  const push = () => {
    H.timer = null;
    const s = snap();
    if (same(H.stack[H.index], s)) return;
    H.stack = H.stack.slice(0, H.index + 1);
    H.stack.push(s);
    if (H.stack.length > 150) H.stack.shift();
    H.index = H.stack.length - 1;
    emit('history');
  };
  if (immediate) push(); else H.timer = setTimeout(push, 320);
}
export function flushHistory() { if (H.timer) { clearTimeout(H.timer); commit(true); } }
function restore(s) {
  S.doc = { ...JSON.parse(s.json), assets: { ...s.assets } };
  setDocFonts(S.doc.fonts);
  S.sel = s.sel.filter(id => S.doc.layers.some(L => L.id === id));
  setDirty(true);
  emit('doc', { full: true }); emit('selection'); emit('history');
}
export function undo() { flushHistory(); if (H.index > 0) restore(H.stack[--H.index]); }
export function redo() { flushHistory(); if (H.index < H.stack.length - 1) restore(H.stack[++H.index]); }
export function canUndo() { return H.index > 0; }
export function canRedo() { return H.index < H.stack.length - 1; }
export function resetHistory() { H.stack = []; H.index = -1; commit(true); }

export function setDirty(v) {
  S.dirty = v;
  API?.setDirty(v);
  API?.setTitle(`${S.projectName}${v ? ' •' : ''} — MyBad Creator`);
  emit('dirty');
}

// ---------------------------------------------------------------- notifications
export function toast(msg, err = false, action = null) { emit('toast', { msg, err, action }); }

export { THEMES, FORMATS, TEMPLATES };
