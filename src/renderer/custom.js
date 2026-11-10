// Modèles d'affiches personnalisés : enregistrés sur l'ordinateur et rejoués comme les modèles d'origine
// (ils sont ajoutés au registre TEMPLATES sous la clé « custom:<id> »).
import { TEMPLATES, blankLayers } from './engine/templates.js';
import { S, toast } from './state.js';
import { uid } from './engine/scene.js';
import { applyTemplate } from './engine/render.js';
import { versHeliance } from './renom.js';

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
  const key = customKey(e.id);
  // Un modèle personnalisé ne prend jamais la place d'un modèle par défaut (clé toujours préfixée « custom: »).
  if (TEMPLATES[key] && !TEMPLATES[key].custom) return;
  TEMPLATES[key] = {
    name: e.name, desc: 'Modèle personnalisé', custom: true, fields: e.fields, assets: e.assets, origin: e.origin,
    ...(e.finish ? { look: () => JSON.parse(JSON.stringify(e.finish)) } : {}),
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
export function initCustom() {
  list = read();
  // modèles enregistrés avant le changement de nom : « MyBad Esport » devient « Heliance Esport » (une seule fois)
  if (list.map(versHeliance).some(Boolean)) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* stockage plein : la conversion sera refaite au prochain lancement */ } }
  list.forEach(register);
}

// Copie les calques du document (sans identifiants) et les images qu'ils utilisent.
function snapshot(doc = S.doc) {
  const layers = JSON.parse(JSON.stringify(doc.layers)), assets = {};
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
  return add({ id: uid(), name: `${src?.name || 'Affiche'} (perso)`, W: doc.W, H: doc.H, fields: src?.fields?.length ? src.fields : ['org', 'event'], layers, assets, finish: JSON.parse(JSON.stringify(doc.finish || {})) });
}
// Duplique n'importe quel modèle (fourni ou perso) en modèle personnalisé : mise en page actuelle de ce modèle + ses réglages d'ambiance.
export function duplicateTemplate(key) {
  const src = TEMPLATES[key]; if (!src) return null;
  const d = JSON.parse(JSON.stringify(S.doc)); d.layers = []; d.assets = S.doc.assets;
  d.finishFor = undefined; d.finish = {};
  applyTemplate(d, key, { keepUser: false });
  const { layers, assets } = snapshot(d);
  return add({ id: uid(), name: `${src.name} (copie)`, W: d.W, H: d.H, fields: src.fields?.length ? src.fields : ['org', 'event'], layers, assets, finish: JSON.parse(JSON.stringify(d.finish || {})) });
}
// Fourche automatique : la première modification d'un modèle par défaut (dossier « MODÈLES ») part dans une
// copie personnelle sous « Modèles personnalisés », sans jamais toucher à l'original (figé dans l'application).
export function forkFromDefault() {
  const doc = S.doc; if (!doc || isCustom(doc.tpl)) return null;
  const src = TEMPLATES[doc.tpl]; if (!src) return null;
  const { layers, assets } = snapshot(doc);
  const key = add({ id: uid(), name: `${src.name} (modifié)`, W: doc.W, H: doc.H, fields: src.fields?.length ? src.fields : ['org', 'event'], layers, assets, finish: JSON.parse(JSON.stringify(doc.finish || {})), origin: doc.tpl });
  if (key) doc.tpl = key;
  return key;
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

// Vérifie les données locales liées aux modèles et répare ce qui est corrompu (JSON invalide, entrée sans
// calques…), sans réinstallation : les modèles par défaut viennent toujours du bundle de l'application, jamais
// de là, donc rien ici ne peut les abîmer — mais une entrée cassée pourrait empêcher la galerie de s'afficher.
export function repairDefaults() {
  const fixed = [];
  const checkJSON = (key, fallback) => {
    const raw = localStorage.getItem(key);
    if (raw == null) return;
    try { JSON.parse(raw); } catch { try { localStorage.setItem(key, JSON.stringify(fallback)); fixed.push(key); } catch { /* stockage indisponible */ } }
  };
  checkJSON('mbc.look', {});
  checkJSON('mbc.themes', []);
  checkJSON('mbc.lookpresets', {});
  checkJSON(STORE, []);
  const before = JSON.stringify(list);
  list = read().filter(e => e && e.id && Array.isArray(e.layers));
  for (const key of Object.keys(TEMPLATES)) if (isCustom(key) && !list.some(e => customKey(e.id) === key)) delete TEMPLATES[key];
  list.forEach(register);
  if (JSON.stringify(list) !== before) { persist(); fixed.push(STORE); }
  return [...new Set(fixed)];
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
