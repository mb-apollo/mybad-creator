// Registre des poses par défaut modifiables depuis le Studio de poses.
// Chaque élément (pose par défaut, pose d'un agent, poses prédéfinies, poses génériques, positions d'arme, placement d'une arme) a une
// valeur d'origine ; ce que l'utilisateur règle est mémorisé ici (localStorage) et prime. Les valeurs d'origine proviennent du code et
// de poses-default.json (fichier fourni avec le logiciel, issu d'une configuration exportée du Studio).
import { POSES, WEAPON_POSES } from './pose3d.js';
import { baseDefaultPose } from './engine/templates.js';
import BUNDLED_FILE from './poses-default.json';

const KEY = 'mbc.poselab';
const BUNDLED = BUNDLED_FILE?.data || {};
const clone = o => JSON.parse(JSON.stringify(o));
let REG = read();

function read() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || '{}'); return r && typeof r === 'object' ? r : {}; } catch { return {}; }
}
let DRAFT = false;                       // le Studio est ouvert : REG est un brouillon, SAVED la dernière version enregistrée
let SAVED = null, HIST = { stack: [], i: -1, t: 0 };
function store() { try { localStorage.setItem(KEY, JSON.stringify(REG)); } catch { /* stockage plein : le réglage reste valable jusqu'à la fermeture */ } }
function write() { if (DRAFT) histPush(); else store(); }

// ------------------------------------------------------------------ brouillon du Studio : enregistrer, annuler / rétablir
const snap = () => JSON.stringify(REG);
function histCommit() { clearTimeout(HIST.t); HIST.t = 0; const j = snap(); if (HIST.stack[HIST.i] === j) return; HIST.stack = HIST.stack.slice(0, HIST.i + 1); HIST.stack.push(j); if (HIST.stack.length > 200) HIST.stack.shift(); HIST.i = HIST.stack.length - 1; }
function histPush() { clearTimeout(HIST.t); HIST.t = setTimeout(histCommit, 350); }   // un glissé de curseur = un seul pas d'historique
export function beginDraft() { SAVED = snap(); DRAFT = true; HIST = { stack: [SAVED], i: 0, t: 0 }; }
export function saveDraft() { histCommit(); SAVED = snap(); store(); }
export function endDraft(save) { if (save) saveDraft(); else { REG = JSON.parse(SAVED); } DRAFT = false; SAVED = null; clearTimeout(HIST.t); }
export const isDirty = () => DRAFT && snap() !== SAVED;
export function undoDraft() { histCommit(); if (HIST.i <= 0) return false; REG = JSON.parse(HIST.stack[--HIST.i]); return true; }
export function redoDraft() { histCommit(); if (HIST.i >= HIST.stack.length - 1) return false; REG = JSON.parse(HIST.stack[++HIST.i]); return true; }
export const canUndoDraft = () => { histCommit(); return HIST.i > 0; };
export const canRedoDraft = () => { histCommit(); return HIST.i < HIST.stack.length - 1; };

// id : 'default' | 'agent:<clé>' | 'custom:<id>' | 'preset:<clé>' | 'stance:<fusil|pistolet>:<position>' | 'weapon:<arme>'
const parse = id => { const [type, a, b] = id.split(':'); return { type, a, b }; };
function stored(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') return REG.default;
  if (type === 'agent') return REG.agents?.[a];
  if (type === 'custom') return (REG.custom || []).find(c => c.id === a)?.data;
  if (type === 'preset') return REG.presets?.[a];
  if (type === 'stance') return REG.stances?.[a]?.[b];
  if (type === 'weapon') return REG.weapons?.[a];
}
// Valeur d'origine : fichier fourni avec le logiciel, sinon valeur du code.
export function builtin(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') { if (BUNDLED.default) return clone(BUNDLED.default); const { on, ...p } = baseDefaultPose(0); return clone(p); }
  if (type === 'agent') return clone(BUNDLED.agents?.[a] || builtin('default'));
  if (type === 'custom') return clone((BUNDLED.custom || []).find(c => c.id === a)?.data || {});
  if (type === 'preset') { if (BUNDLED.presets?.[a]) return clone(BUNDLED.presets[a]); const p = POSES.find(x => x[0] === a); return clone(p ? p[2] : {}); }
  if (type === 'stance') return clone(BUNDLED.stances?.[a]?.[b] || WEAPON_POSES[a]?.[b] || {});
  if (type === 'weapon') return clone(BUNDLED.weapons?.[a] || {});
  return {};
}
// Un élément « modifié » : réglé par l'utilisateur, ou propre à l'agent (fichier fourni).
export const hasOverride = id => !!stored(id) || (parse(id).type === 'agent' && !!BUNDLED.agents?.[parse(id).a]);
export const getItem = id => clone(stored(id) || builtin(id));
export function setItem(id, data) {
  const { type, a, b } = parse(id);
  const v = clone(data);
  if (type === 'default') REG.default = v;
  else if (type === 'agent') (REG.agents ||= {})[a] = v;
  else if (type === 'custom') { const c = (REG.custom || []).find(x => x.id === a); if (c) c.data = v; }
  else if (type === 'preset') (REG.presets ||= {})[a] = v;
  else if (type === 'stance') ((REG.stances ||= {})[a] ||= {})[b] = v;
  else if (type === 'weapon') (REG.weapons ||= {})[a] = v;
  write();
}
export function resetItem(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') delete REG.default;
  else if (type === 'agent') delete REG.agents?.[a];
  else if (type === 'preset') delete REG.presets?.[a];
  else if (type === 'stance') delete REG.stances?.[a]?.[b];
  else if (type === 'weapon') delete REG.weapons?.[a];
  write();
}
export function resetAll() { REG = {}; write(); }
export const overrideCount = () => (REG.default ? 1 : 0) + Object.keys(REG.agents || {}).length + (REG.custom || []).length + Object.keys(REG.presets || {}).length
  + Object.values(REG.stances || {}).reduce((n, o) => n + Object.keys(o).length, 0) + Object.keys(REG.weapons || {}).length;

// Poses génériques créées par l'utilisateur (disponibles pour tous les agents, boutons du panneau 3D).
export const customList = () => [...(BUNDLED.custom || []).filter(b => !(REG.custom || []).some(c => c.id === b.id)), ...(REG.custom || [])].map(c => ({ id: c.id, name: c.name }));
export function addCustom(name, data) {
  const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 99).toString(36);
  (REG.custom ||= []).push({ id, name: name || 'Ma pose', data: clone(data || {}) }); write();
  return id;
}
export function renameCustom(id, name) { const c = (REG.custom || []).find(x => x.id === id); if (c && name) { c.name = name; write(); } }
export function deleteCustom(id) { REG.custom = (REG.custom || []).filter(c => c.id !== id); write(); }

// Export / import : l'import fusionne (un fichier par agent est possible). Un fichier qui ne contient que « default » et dont le nom est
// celui d'un agent (ex. Jett.json) devient la pose de cet agent.
export function exportConfig() { return JSON.stringify({ app: 'MyBad Creator', kind: 'poselab', version: 2, data: REG }, null, 2); }
export function importConfig(text, fileName = '', agentKeys = []) {
  const j = JSON.parse(text);
  if (j?.kind !== 'poselab' || typeof j.data !== 'object') throw new Error('Ce fichier n\'est pas une configuration de poses MyBad Creator.');
  const d = clone(j.data), base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').toLowerCase();
  if (d.default && !d.agents && agentKeys.includes(base)) { d.agents = { [base]: d.default }; delete d.default; }
  if (d.default) REG.default = d.default;
  for (const k of ['agents', 'presets', 'weapons']) if (d[k]) REG[k] = { ...(REG[k] || {}), ...d[k] };
  if (d.stances) for (const kind of Object.keys(d.stances)) REG.stances = { ...(REG.stances || {}), [kind]: { ...(REG.stances?.[kind] || {}), ...d.stances[kind] } };
  if (d.custom) { const ids = new Set(d.custom.map(c => c.id)); REG.custom = [...(REG.custom || []).filter(c => !ids.has(c.id)), ...d.custom]; }
  write();
  return Object.keys(d).filter(k => d[k] && (typeof d[k] !== 'object' || Object.keys(d[k]).length)).map(k => (k === 'agents' ? Object.keys(d.agents).join(', ') : k));
}

// ------------------------------------------------------------------ accès pour le reste du logiciel
export const presetsList = () => [
  ...POSES.map(([k]) => [k, POSES.find(x => x[0] === k)[1], getItem('preset:' + k)]),
  ...customList().map(c => ['custom:' + c.id, c.name, getItem('custom:' + c.id)]),
];
export const stancePose = (kind, stance) => getItem(`stance:${kind}:${stance}`);
// Orientation par défaut d'un agent quand il est placé dans une scène (degrés, s'ajoute à la rotation du personnage).
export const agentRotY = agent => (agent ? (REG.agents?.[agent]?.rotY ?? BUNDLED.agents?.[agent]?.rotY ?? 0) : 0);
export const weaponDefaults = key => clone(REG.weapons?.[key] || BUNDLED.weapons?.[key] || {});

// Pose « automatique » d'un personnage (calque neuf) : la pose de son agent si elle existe, sinon la pose par défaut, avec le léger décalage de son côté.
export function resolvePose(pz, agent) {
  if (!pz || !pz.auto) return pz || {};
  const src = REG.agents?.[agent] || BUNDLED.agents?.[agent] || REG.default || getItem('default');
  const p = clone(src), side = pz.side || 0;
  p.on = true;
  p.torso = { ...p.torso, twist: (p.torso?.twist || 0) + side * 3 };
  p.head = { ...p.head, tilt: (p.head?.tilt || 0) + side * 1.5 };
  return p;
}
// Arme du personnage : celle réglée sur le calque (même « aucune »), sinon celle de sa pose.
export const weaponOf = (owner, pzr) => (owner.weapon !== undefined ? owner.weapon : (pzr?.weapon || null));
