// Banc de poses — outil de développement, absent de l'interface.
// Rend un agent dans une pose donnée sous plusieurs angles (face, trois-quarts, profils, dos, dessus, gros plan sur chaque main) et
// assemble une planche, avec l'image de référence à côté si on en fournit une. Sert à régler une pose par essais successifs sans
// passer par le Studio : on donne les réglages, on regarde le résultat, on corrige.
// Piloté par le processus principal (main.js › devBanc, variable MBC_BANC) et par scripts/banc-poses.js ; rien n'est écrit dans le
// registre des poses : la pose essayée n'existe que le temps du rendu.
import { S } from './state.js';
import { renderModelPreview, poseHandles, preloadModels } from './model3d.js';
import { agentRotY, getItem, presetsList } from './posereg.js';
import { poseValues } from './pose3d.js';

// rotY > 0 : le personnage tourne vers sa gauche (on voit son côté droit). « main » : gros plan sur la main gauche (L) ou droite (R).
export const VUES = {
  face: { rotY: 0 },
  'tq-droit': { rotY: 35 },
  'tq-gauche': { rotY: -35 },
  'profil-droit': { rotY: 90 },
  'profil-gauche': { rotY: -90 },
  dos: { rotY: 180 },
  dessus: { rotY: 0, camPitch: 55 },
  'main-gauche': { main: 'L' },
  'main-droite': { main: 'R' },
};
const PAR_DEFAUT = ['face', 'tq-droit', 'tq-gauche', 'profil-droit', 'profil-gauche', 'dos', 'main-gauche', 'main-droite'];
const FOND = '#232834', ENCRE = '#e8ebfa';
// éclairage neutre et blanc (celui de l'aperçu du Studio de poses) : on juge une silhouette, pas une ambiance
const LUM = { key: { color: '#ffffff', intensity: 1.5, angle: -35 }, rim: { color: '#7ab8ff', intensity: 2, angle: 150 }, fill: { color: '#ffffff', intensity: 0.7 }, ambient: { color: '#ffffff', intensity: 0.8 } };

const pause = ms => new Promise(r => setTimeout(r, ms));
const agentsDispo = () => [...S.libraryModels.keys()].filter(k => k.startsWith('g:valorant:')).map(k => k.split(':')[2]).sort();

function calque(nom, agent, pose, vue, w, h) {
  const { weapon, rotY, on, auto, side, ...p } = pose;   // rotY (orientation de l'agent dans une scène) n'entre pas dans la silhouette
  return {
    id: 'banc-' + nom, type: 'model', model: 'g:valorant:' + agent, x: 0, y: 0, w, h, rot: 0,
    rotY: (vue.rotY || 0) - agentRotY(agent),   // « face » = le personnage regarde la caméra, quelle que soit l'orientation enregistrée pour l'agent
    camPitch: vue.camPitch ?? 3, zoom3d: vue.zoom3d ?? 0.9, target: vue.target ?? 0.5, offsetX: vue.offsetX || 0, fov: vue.fov || 28,
    frame: 'height', envLight: vue.reflets ?? 0.45, exposure: vue.exposition, anim: 0, animTime: 0, ...LUM,
    pose: { on: true, ...p }, weapon: weapon?.key ? weapon : null, face: vue.visage,
  };
}
async function rendre(L, w, h) {
  await preloadModels({ layers: [L], T: {}, game: 'valorant' });
  for (let i = 0; i < 80; i++) {
    const cv = renderModelPreview(L, w, h, S.doc.theme);
    if (cv) return cv;
    await pause(150);
  }
  throw new Error('modèle 3D illisible : ' + L.model);
}
function figer(cv, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = FOND; x.fillRect(0, 0, w, h); x.drawImage(cv, 0, 0, w, h);
  return c;
}
// Positions des articulations dans l'image (pixels), pour comparer avec une référence autrement qu'à l'œil.
const poignees = (L, w, h) => Object.fromEntries(poseHandles(L).map(p => [p.key, [Math.round((p.x + 1) / 2 * w), Math.round((1 - p.y) / 2 * h)]]));

async function vueDe(nom, def, agent, pose, w, h) {
  let L = calque(nom, agent, pose, def, w, h);
  const cible = def.cible || (def.main && 'hand' + def.main);   // gros plan sur une articulation : main (L / R) ou « cible » (head, chest, footL, kneeR…)
  if (cible) {
    // un premier rendu situe l'articulation dans l'espace, le second la cadre (longue focale, pour qu'une main tendue vers la caméra ne grossisse pas)
    await rendre({ ...L, id: L.id + '-rep' }, w, h);
    const m = poseHandles({ id: L.id + '-rep' }).find(p => p.key === cible);
    if (!m) throw new Error('articulation introuvable sur ce modèle : ' + cible);
    L = { ...L, target: m.ref.world.y + (def.decalY || 0), offsetX: m.ref.world.x, zoom3d: def.zoom3d ?? (def.main ? 4.2 : 3.4), fov: def.fov || 8 };
  }
  const cv = await rendre(L, w, h);
  return { nom, image: figer(cv, w, h), poignees: poignees(L, w, h) };
}

const charger = url => new Promise((ok, non) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => non(new Error('image de référence illisible')); i.src = url; });
function planche(vues, ref, w, h) {
  const cases = [...(ref ? [{ nom: 'référence', ref }] : []), ...vues];
  const cols = Math.min(cases.length, cases.length <= 4 ? cases.length : Math.ceil(cases.length / 2)), ligs = Math.ceil(cases.length / cols), g = 6;
  const c = document.createElement('canvas'); c.width = cols * w + (cols + 1) * g; c.height = ligs * h + (ligs + 1) * g;
  const x = c.getContext('2d'); x.fillStyle = '#0b0e16'; x.fillRect(0, 0, c.width, c.height);
  cases.forEach((v, i) => {
    const px = g + (i % cols) * (w + g), py = g + Math.floor(i / cols) * (h + g);
    x.fillStyle = FOND; x.fillRect(px, py, w, h);
    if (v.ref) { const k = Math.min(w / v.ref.width, h / v.ref.height), rw = v.ref.width * k, rh = v.ref.height * k; x.drawImage(v.ref, px + (w - rw) / 2, py + (h - rh) / 2, rw, rh); }
    else x.drawImage(v.image, px, py, w, h);
    x.font = '600 15px "Space Grotesk", sans-serif'; x.textBaseline = 'top';
    const t = v.nom, tw = x.measureText(t).width;
    x.fillStyle = 'rgba(8,10,18,.72)'; x.fillRect(px, py, tw + 16, 26);
    x.fillStyle = ENCRE; x.fillText(t, px + 8, py + 6);
  });
  return c;
}

// Demande : { action, agent, pose, vues, taille, refData, id }. Réponse : { images: [{ nom, url }], … } (les images sont écrites par main.js).
export async function banc(req = {}) {
  const action = req.action || 'rendre';
  if (action === 'agents') return { agents: agentsDispo() };
  if (action === 'lire') { const pose = getItem(req.id || 'default'); return { id: req.id || 'default', pose, valeurs: poseValues(pose) }; }
  if (action === 'presets') return { presets: presetsList().map(([cle, nom, pose]) => ({ cle, nom, pose })), vues: VUES };
  if (action !== 'rendre') throw new Error('action inconnue : ' + action);

  const agent = String(req.agent || '').toLowerCase(), dispo = agentsDispo();
  if (!dispo.includes(agent)) throw new Error(`pas de modèle 3D pour « ${agent} ». Agents disponibles : ${dispo.join(', ') || 'aucun (pack 3D absent)'}`);
  const pose = req.pose || getItem(req.poseId || 'agent:' + agent);   // sans pose : celle du registre (pose de l'agent, sinon pose par défaut)
  const [w, h] = req.taille || [600, 800];
  const defs = (req.vues?.length ? req.vues : PAR_DEFAUT).map(v => {
    if (typeof v !== 'string') return [v.nom || 'vue', v];
    if (!VUES[v]) throw new Error(`vue inconnue : ${v}. Vues : ${Object.keys(VUES).join(', ')}`);
    return [v, VUES[v]];
  });
  const vues = [];
  for (const [nom, def] of defs) vues.push(await vueDe(nom, def, agent, pose, w, h));
  const ref = req.refData ? await charger(req.refData) : null;
  const k = req.reduction ?? 0.6;
  return {
    agent, valeurs: poseValues(pose),
    vues: Object.fromEntries(vues.map(v => [v.nom, { poignees: v.poignees }])),
    images: [{ nom: 'planche', url: planche(vues, ref, Math.round(w * k), Math.round(h * k)).toDataURL('image/png') }, ...vues.map(v => ({ nom: v.nom, url: v.image.toDataURL('image/png') }))],
  };
}
