// Registre des poses par défaut modifiables depuis le Studio de poses.
// Chaque élément (pose par défaut des affiches, poses prédéfinies, positions d'arme, placement d'une arme) a une valeur d'origine
// dans le code ; ce que l'utilisateur règle est mémorisé ici (localStorage) et prime. La configuration s'exporte en JSON pour
// être reprise comme nouvelles valeurs d'origine.
import { POSES, WEAPON_POSES } from './pose3d.js';
import { POSE_HOOK, baseDefaultPose } from './engine/templates.js';

const KEY = 'mbc.poselab';
// Placement d'origine de chaque arme (x/y/z m, rx/ry/rz °, scale, lx/ly/lz m, lroll °) : à remplir avec une configuration exportée du Studio.
const WEAPON_DEFAULTS = {};
const clone = o => JSON.parse(JSON.stringify(o));
let REG = read();

function read() {
  try { const r = JSON.parse(localStorage.getItem(KEY) || '{}'); return r && typeof r === 'object' ? r : {}; } catch { return {}; }
}
function write() { try { localStorage.setItem(KEY, JSON.stringify(REG)); } catch { /* stockage plein : le réglage reste valable jusqu'à la fermeture */ } }

// id : 'default' | 'preset:<clé>' | 'stance:<fusil|pistolet>:<position>' | 'weapon:<arme>'
function parse(id) {
  const [type, a, b] = id.split(':');
  return { type, a, b };
}
function stored(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') return REG.default;
  if (type === 'preset') return REG.presets?.[a];
  if (type === 'stance') return REG.stances?.[a]?.[b];
  if (type === 'weapon') return REG.weapons?.[a];
}
export function builtin(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') { const { on, ...p } = baseDefaultPose(0); return clone(p); }
  if (type === 'preset') { const p = POSES.find(x => x[0] === a); return clone(p ? p[2] : {}); }
  if (type === 'stance') return clone(WEAPON_POSES[a]?.[b] || {});
  if (type === 'weapon') return clone(WEAPON_DEFAULTS[a] || {});
  return {};
}
export const hasOverride = id => !!stored(id);
export const getItem = id => clone(stored(id) || builtin(id));
export function setItem(id, data) {
  const { type, a, b } = parse(id);
  const v = clone(data);
  if (type === 'default') REG.default = v;
  else if (type === 'preset') (REG.presets ||= {})[a] = v;
  else if (type === 'stance') ((REG.stances ||= {})[a] ||= {})[b] = v;
  else if (type === 'weapon') (REG.weapons ||= {})[a] = v;
  write();
}
export function resetItem(id) {
  const { type, a, b } = parse(id);
  if (type === 'default') delete REG.default;
  else if (type === 'preset') delete REG.presets?.[a];
  else if (type === 'stance') delete REG.stances?.[a]?.[b];
  else if (type === 'weapon') delete REG.weapons?.[a];
  write();
}
export function resetAll() { REG = {}; write(); }
export const overrideCount = () => (REG.default ? 1 : 0) + Object.keys(REG.presets || {}).length + Object.values(REG.stances || {}).reduce((n, o) => n + Object.keys(o).length, 0) + Object.keys(REG.weapons || {}).length;

// Export / import de toute la configuration.
export function exportConfig() { return JSON.stringify({ app: 'MyBad Creator', kind: 'poselab', version: 1, data: REG }, null, 2); }
export function importConfig(text) {
  const j = JSON.parse(text);
  if (j?.kind !== 'poselab' || typeof j.data !== 'object') throw new Error('Ce fichier n\'est pas une configuration de poses MyBad Creator.');
  REG = j.data; write();
}

// Accès pour le reste du logiciel.
export const presetsList = () => POSES.map(([k, label]) => [k, label, getItem('preset:' + k)]);
export const stancePose = (kind, stance) => getItem(`stance:${kind}:${stance}`);
export const weaponDefaults = key => clone(REG.weapons?.[key] || WEAPON_DEFAULTS[key] || {});

// La pose par défaut des personnages d'une affiche : celle du Studio si elle existe, avec le léger décalage propre à chaque côté.
export function installDefaultPose() {
  POSE_HOOK.fn = (side, base) => {
    const o = REG.default; if (!o) return base;
    const p = clone(o); p.on = true;
    p.torso = { ...p.torso, twist: (p.torso?.twist || 0) + side * 3 };
    p.head = { ...p.head, tilt: (p.head?.tilt || 0) + side * 1.5 };
    return p;
  };
}
