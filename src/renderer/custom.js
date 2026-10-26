// Modèles d'affiches personnalisés : enregistrés sur l'ordinateur et rejoués comme les modèles d'origine
// (ils sont ajoutés au registre TEMPLATES sous la clé « custom:<id> »).
import { TEMPLATES, blankLayers } from './engine/templates.js';
import { S, toast } from './state.js';
import { uid } from './engine/scene.js';

const STORE = 'mbc.customTemplates';
let list = [];

const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch {
    toast('Pas assez de place pour enregistrer ce modèle (images trop lourdes ?)', true);
    return false;
  }
}
export const customKey = id => 'custom:' + id;
export const isCustom = key => typeof key === 'string' && key.startsWith('custom:');
export const customList = () => list;

const unitOf = (W, H) => Math.min(W, H * 0.8) / 1080;
function register(e) {
  TEMPLATES[customKey(e.id)] = {
    name: e.name, desc: 'Modèle personnalisé', custom: true, fields: e.fields, assets: e.assets,
    build: ctx => {
      const kx = ctx.W / e.W, ky = ctx.H / e.H, ku = ctx.u / unitOf(e.W, e.H);
      return e.layers.map(L => {
        const n = JSON.parse(JSON.stringify(L));
        for (const k of ['x', 'w']) if (typeof n[k] === 'number') n[k] *= kx;
        for (const k of ['y', 'h']) if (typeof n[k] === 'number') n[k] *= ky;
        if (n.type === 'text' && typeof n.size === 'number') n.size *= ku;
        return n;
      });
    },
  };
}
export function initCustom() { list = read(); list.forEach(register); }

// Copie les calques du document (sans identifiants) et les images qu'ils utilisent.
function snapshot() {
  const doc = S.doc, layers = JSON.parse(JSON.stringify(doc.layers)), assets = {};
  layers.forEach(L => {
    delete L.id; delete L.fromTpl;
    if (L.asset?.startsWith('u:') && L.asset !== 'u:logo' && doc.assets[L.asset]) assets[L.asset] = doc.assets[L.asset];
  });
  return { layers, assets };
}
function add(e) {
  list.push(e);
  if (!persist()) { list.pop(); return null; }
  register(e);
  return customKey(e.id);
}

// Nouveau modèle vierge : fond de la direction artistique et finition, rien d'autre.
export function createBlank() {
  const doc = S.doc, ctx = { W: doc.W, H: doc.H, u: unitOf(doc.W, doc.H) };
  const layers = JSON.parse(JSON.stringify(blankLayers(ctx)));
  return add({ id: uid(), name: `Modèle perso ${list.length + 1}`, W: doc.W, H: doc.H, fields: ['org', 'event'], layers, assets: {} });
}
// Enregistre l'affiche en cours comme nouveau modèle.
export function saveCurrent() {
  const doc = S.doc, src = TEMPLATES[doc.tpl], { layers, assets } = snapshot();
  return add({ id: uid(), name: `${src?.name || 'Affiche'} (perso)`, W: doc.W, H: doc.H, fields: src?.fields?.length ? src.fields : ['org', 'event'], layers, assets });
}
export function duplicateCustom(key) {
  const e = list.find(x => customKey(x.id) === key); if (!e) return null;
  return add({ ...JSON.parse(JSON.stringify(e)), id: uid(), name: `${e.name} (copie)` });
}
export function renameCustom(key, name) {
  const e = list.find(x => customKey(x.id) === key); if (!e || !name.trim()) return;
  e.name = name.trim().slice(0, 40);
  if (persist()) register(e);
}
export function deleteCustom(key) {
  list = list.filter(x => customKey(x.id) !== key);
  delete TEMPLATES[key];
  persist();
}

// Les modifications faites sur une affiche basée sur un modèle perso sont enregistrées dans ce modèle.
let timer = null;
export function scheduleSave() { clearTimeout(timer); timer = setTimeout(saveBack, 600); }
function saveBack() {
  const doc = S.doc; if (!doc || !isCustom(doc.tpl)) return;
  const e = list.find(x => customKey(x.id) === doc.tpl); if (!e) return;
  const { layers, assets } = snapshot();
  Object.assign(e, { W: doc.W, H: doc.H, layers, assets });
  if (persist()) register(e);
}
