// Préréglages de réglages d'ambiance (onglet Réglages › « Cette affiche »), par modèle d'affiche.
// Chaque modèle a un préréglage fourni « MyBad Esport » (= ses réglages d'origine, ceux du premier lancement) ; les tiens sont enregistrés dans le navigateur.
import { TEMPLATES } from './engine/templates.js';

const KEY = 'mbc.lookpresets';
export const BASE_ID = 'base', BASE_NAME = 'MyBad Esport';
let STORE = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } })();
const write = () => { try { localStorage.setItem(KEY, JSON.stringify(STORE)); } catch (e) { console.error('Préréglages : enregistrement impossible', e); } };
const clone = o => JSON.parse(JSON.stringify(o));

// Réglages d'origine d'un modèle (dépendent du jeu : les voitures n'ont pas les réglages des personnages).
export const baseLook = (tpl, doc) => clone(TEMPLATES[tpl]?.look?.(doc) || {});
export const listPresets = (tpl, doc) => [{ id: BASE_ID, name: BASE_NAME, builtin: true, look: baseLook(tpl, doc) }, ...(STORE[tpl] || []).map(p => ({ ...p, builtin: false }))];
export const findPreset = (tpl, id, doc) => listPresets(tpl, doc).find(p => p.id === id) || null;
export function savePreset(tpl, name, look) {
  const id = 'p' + Date.now().toString(36);
  (STORE[tpl] ||= []).push({ id, name, look: clone(look) }); write(); return id;
}
export function updatePreset(tpl, id, look) { const p = (STORE[tpl] || []).find(x => x.id === id); if (p) { p.look = clone(look); write(); } return !!p; }
export function deletePreset(tpl, id) { STORE[tpl] = (STORE[tpl] || []).filter(x => x.id !== id); write(); }
export function renamePreset(tpl, id, name) { const p = (STORE[tpl] || []).find(x => x.id === id); if (p && name) { p.name = name; write(); } }
// Le préréglage dont les valeurs sont celles de l'affiche (pour l'afficher sélectionné), sinon null.
export function matchPreset(tpl, doc) {
  const cur = JSON.stringify(Object.entries(doc.finish || {}).sort());
  return listPresets(tpl, doc).find(p => JSON.stringify(Object.entries(p.look).sort()) === cur)?.id || null;
}
