#!/usr/bin/env node
// Banc de poses (outil de développement) : règle une pose d'agent par essais successifs, sans ouvrir le Studio.
//
//   node scripts/banc-poses.js lancer                         ouvre Creator caché, dans un profil à part (à laisser tourner)
//   node scripts/banc-poses.js rendre --agent jett --pose p.json [--ref image.png] [--vues face,dos] [--sortie dossier]
//   node scripts/banc-poses.js traversees --agent jett --pose p.json   mesure ce qui se traverse (main dans le torse, arme dans une jambe…)
//   node scripts/banc-poses.js lire [--id agent:jett]         réglages enregistrés d'une pose (par défaut : pose par défaut)
//   node scripts/banc-poses.js agents                         agents qui ont un modèle 3D
//   node scripts/banc-poses.js presets                        poses prédéfinies et vues disponibles
//   node scripts/banc-poses.js fichier --agent jett --pose p.json --vers poses.json
//                                                             écrit / complète un fichier à importer dans le Studio de poses
//   node scripts/banc-poses.js js --code essai.js [--sortie dossier] [--capture nom]   exécute un bout de code dans la fenêtre du banc (essais des studios)
//   node scripts/banc-poses.js arreter
//
// « rendre » écrit une image par vue et une planche (toutes les vues, avec l'image de référence si --ref) et affiche leur chemin.
// Un fichier de pose contient soit les réglages seuls ({ "armL": {…}, … }), soit un export du Studio (la pose de l'agent y est lue).
// Le profil du banc (dossier MBC_BANC, par défaut <temp>/heliance-banc) est séparé de l'installation : aucune donnée réelle n'est
// modifiée. Au premier lancement, le pack 3D et la bibliothèque sont copiés depuis l'installation pour disposer des modèles.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');

const RACINE = path.join(__dirname, '..');
const BANC = path.resolve(process.env.MBC_BANC || path.join(os.tmpdir(), 'heliance-banc'));
const PROFIL = path.join(BANC, 'profil');
const [cmd, ...reste] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < reste.length; i++) if (reste[i].startsWith('--')) opt[reste[i].slice(2)] = reste[i + 1] && !reste[i + 1].startsWith('--') ? reste[++i] : true;

const fin = (msg, code = 1) => { console.error(msg); process.exit(code); };
const lireJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const pause = ms => new Promise(r => setTimeout(r, ms));
const enMarche = () => { try { process.kill(lireJson(path.join(BANC, 'pret.json')).pid, 0); return true; } catch { return false; } };

// Réglages d'une pose à partir d'un fichier : réglages seuls, ou export du Studio (kind « poselab »).
function poseDe(fichier, agent) {
  const j = lireJson(fichier);
  if (j && j.kind === 'poselab') { const p = j.data?.agents?.[agent] || j.data?.default; if (!p) fin(`${fichier} ne contient pas de pose pour « ${agent} ».`); return p; }
  return j;
}

async function demander(req, delai = 180000) {
  if (!enMarche()) fin('Le banc n\'est pas lancé : node scripts/banc-poses.js lancer');
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const dem = path.join(BANC, `demande-${id}.json`), rep = path.join(BANC, `reponse-${id}.json`);
  fs.writeFileSync(dem + '.tmp', JSON.stringify(req)); fs.renameSync(dem + '.tmp', dem);
  for (const t0 = Date.now(); Date.now() - t0 < delai;) {
    if (fs.existsSync(rep)) { const r = lireJson(rep); fs.unlinkSync(rep); return r; }
    await pause(100);
  }
  fin('Pas de réponse du banc (délai dépassé).');
}

function copierModeles() {
  const source = path.join(process.env.APPDATA || '', 'MyBad Creator');
  for (const d of ['pack3d', 'library']) {
    const de = path.join(source, d), vers = path.join(PROFIL, d);
    if (fs.existsSync(de) && !fs.existsSync(vers)) { console.log('copie de', d, '…'); fs.cpSync(de, vers, { recursive: true, filter: f => !/\.bak$/i.test(f) }); }
  }
}

(async () => {
  if (cmd === 'lancer') {
    if (enMarche()) fin('Le banc tourne déjà.', 0);
    fs.mkdirSync(PROFIL, { recursive: true });
    try { fs.unlinkSync(path.join(BANC, 'pret.json')); } catch { /* pas de lancement précédent */ }
    copierModeles();
    if (!opt['sans-assemblage']) await new Promise((ok, non) => spawn(process.execPath, [path.join(RACINE, 'node_modules', 'esbuild', 'bin', 'esbuild'), 'src/renderer/app.js', '--bundle', '--format=iife', '--outfile=src/renderer/dist/app.js', '--minify', '--legal-comments=none', '--log-level=warning'], { cwd: RACINE, stdio: 'inherit' }).on('exit', c => (c ? non(new Error('assemblage impossible')) : ok())));
    const e = spawn(require('electron'), ['.', '--user-data-dir=' + PROFIL], { cwd: RACINE, stdio: 'inherit', env: { ...process.env, MBC_BANC: BANC } });
    e.on('exit', c => process.exit(c || 0));
    return;
  }
  if (cmd === 'arreter') { if (!enMarche()) fin('Le banc ne tourne pas.', 0); await demander({ action: 'quitter' }, 10000); console.log('banc arrêté'); return; }
  if (cmd === 'agents' || cmd === 'presets') { console.log(JSON.stringify(await demander({ action: cmd }), null, 1)); return; }
  if (cmd === 'js') {   // essais d'un studio : exécute le fichier donné dans la fenêtre du banc (il se termine par « return { … } »)
    if (!opt.code) fin('Il manque --code <fichier.js>.');
    const r = await demander({ action: 'js', code: fs.readFileSync(path.resolve(opt.code), 'utf8'), sortie: opt.sortie && path.resolve(opt.sortie), capture: opt.capture }, 600000);
    console.log(JSON.stringify(r, null, 1)); return;
  }
  if (cmd === 'lire') { console.log(JSON.stringify(await demander({ action: 'lire', id: opt.id }), null, 1)); return; }
  if (cmd === 'traversees') {
    if (!opt.agent) fin('Il manque --agent.');
    const req = { action: 'traversees', agent: opt.agent };
    if (opt.pose) req.pose = poseDe(path.resolve(opt.pose), opt.agent);
    if (opt.poses) req.poses = lireJson(path.resolve(opt.poses));   // fichier contenant une liste de poses : une mesure par pose
    if (opt.rot !== undefined) req.rotY = +opt.rot;
    if (opt.peau) req.options = { peau: true };
    if (opt.etire) req.options = { ...req.options, etire: true };   // arêtes de la peau étirées (tissu déchiré en pointe)
    const r = await demander(req, 600000);
    if (!r.ok) fin('Échec : ' + r.erreur);
    console.log(JSON.stringify(r.resultats ? { resultats: r.resultats } : { rotY: r.rotY, sommets: r.sommets, arme: r.arme, paires: r.paires, reperes: r.reperes, peau: r.peau, etire: r.etire, trous: r.trous, doigts: r.doigts, poignets: r.poignets }));
    return;
  }
  if (cmd === 'rendre') {
    if (!opt.agent) fin('Il manque --agent.');
    const req = { action: 'rendre', agent: opt.agent };
    if (opt.pose) req.pose = poseDe(path.resolve(opt.pose), opt.agent);
    if (opt.ref) { req.ref = path.resolve(opt.ref); if (!fs.existsSync(req.ref)) fin('Image de référence introuvable : ' + req.ref); }
    if (opt.vues) req.vues = String(opt.vues).split(',').map(v => (v.includes(':') ? JSON.parse(fs.readFileSync(path.resolve(v.split(':').slice(1).join(':')), 'utf8')) : v)).flat();
    if (opt.sortie) req.sortie = path.resolve(opt.sortie);
    if (opt.taille) req.taille = String(opt.taille).split('x').map(Number);
    const r = await demander(req);
    if (!r.ok) fin('Échec : ' + r.erreur);
    if (opt.detail) console.log(JSON.stringify({ valeurs: r.valeurs, vues: r.vues }, null, 1));
    r.images.forEach(i => console.log(i));
    return;
  }
  if (cmd === 'fichier') {
    if (!opt.agent || !opt.pose || !opt.vers) fin('Il faut --agent, --pose et --vers.');
    const vers = path.resolve(opt.vers), j = fs.existsSync(vers) ? lireJson(vers) : { app: 'Heliance Creator', kind: 'poselab', version: 2, data: {} };
    if (j.kind !== 'poselab') fin(vers + ' n\'est pas un fichier de poses Heliance Creator.');
    (j.data.agents ||= {})[opt.agent] = poseDe(path.resolve(opt.pose), opt.agent);
    fs.writeFileSync(vers, JSON.stringify(j, null, 2));
    console.log(`${vers} : pose de « ${opt.agent} » écrite (${Object.keys(j.data.agents).length} agent(s) dans le fichier).`);
    return;
  }
  fin('Commandes : lancer, rendre, lire, agents, presets, fichier, arreter (voir l\'en-tête de ce fichier).');
})();
