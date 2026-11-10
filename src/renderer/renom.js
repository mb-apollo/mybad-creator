// Changement de nom « MyBad Esport » → « Heliance Esport ».
// Le logiciel affiche déjà le nouveau nom, mais les données enregistrées AVANT le renommage gardent l'ancien :
// kit de marque, brouillon de session, projets .mybad, modèles personnalisés. Ce fichier les convertit une seule fois
// (marque « renom » posée sur l'objet converti, pour ne jamais réécrire un texte que quelqu'un retaperait exprès).
//
// On ne touche qu'aux TEXTES (champs « T », texte des calques, nom du kit) : jamais aux identifiants techniques
// (app « mybad-creator », extension .mybad, clé d'objet « mybad », chemins d'images), ni à l'adresse e-mail mybadesport@….

const casse = (ancien, nouveau) => (ancien === ancien.toUpperCase() ? nouveau.toUpperCase() : nouveau);

// Convertit une chaîne. Les formes collées à un @ . / - _ (e-mail, lien, nom de fichier) sont laissées telles quelles,
// sauf l'ancien lien Twitch, dont on connaît le remplaçant.
export function texteHeliance(s) {
  if (typeof s !== 'string' || s.length > 2000 || !/my\s?bad/i.test(s)) return s;
  return s
    .replace(/twitch\.tv\/mybad_?esport/gi, 'twitch.tv/heliance_esport')
    .replace(/Discord MyBad(?!\s?e-?sport)(?![\w@./-])/gi, 'Discord Heliance Esport')
    .replace(/(?<![\w@./-])my\s?bad\s+e-?sports?(?![\w@])/gi, m => casse(m, 'Heliance Esport'))
    .replace(/(?<![\w@./-])mybad(?![\w@./-])/gi, m => casse(m, 'Heliance'));
}

const CLES_TEXTE = new Set(['text']);

function parcourir(o, dansT) {
  if (!o || typeof o !== 'object') return false;
  let change = false;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') {
      if (dansT || CLES_TEXTE.has(k)) { const n = texteHeliance(v); if (n !== v) { o[k] = n; change = true; } }
    } else if (v && typeof v === 'object') {
      if (parcourir(v, dansT || k === 'T')) change = true;
    }
  }
  return change;
}

// Convertit sur place un document, un kit de marque ou un modèle personnalisé. Renvoie true si quelque chose a changé
// ou si la marque vient d'être posée (donc : à réenregistrer).
export function versHeliance(o) {
  if (!o || typeof o !== 'object' || o.renom) return false;
  parcourir(o, false);
  if (typeof o.name === 'string' && /^my\s?bad\s+e-?sports?$/i.test(o.name.trim())) o.name = casse(o.name.trim(), 'Heliance Esport'); // nom du kit
  o.renom = 1;
  return true;
}
