// Modèle de document MyBad Creator : formats, thèmes (DA), champs, application des modèles.
import { renderScene, scaledDoc, uid, setDocFonts } from './scene.js';
import { TEMPLATES } from './templates.js';
import { GAMES } from './games.js';

export const FORMATS = {
  '4x5': { w: 1080, h: 1350, label: '4:5', hint: 'Post Instagram / X' },
  '1x1': { w: 1080, h: 1080, label: '1:1', hint: 'Carré' },
  '9x16': { w: 1080, h: 1920, label: '9:16', hint: 'Story / TikTok' },
};

const BASE = { text: '#F5F7FF', muted: '#9AA0B8', line: '#2C3352', panel: '#0B0F1D', white: '#FFFFFF' };
export const THEMES = [
  { id: 'nuit', name: 'Nuit MyBad', c: { ...BASE, bg: '#05070E', bg2: '#0C1226', accent: '#54D8FF', accent2: '#7A6BFF', glow: '#1E8FFF', light: 1 } },
  { id: 'nuitpure', name: 'Nuit pure', c: { ...BASE, bg: '#05060C', bg2: '#0A0D1A', accent: '#54D8FF', accent2: '#7A6BFF', glow: '#1E8FFF', light: 0.45 } },
  { id: 'polaris', name: 'Polaris (victoire)', c: { ...BASE, bg: '#06050F', bg2: '#120E2C', accent: '#A99DFF', accent2: '#54D8FF', glow: '#7A6BFF', light: 1.1 } },
  { id: 'defaite', name: 'Défaite', c: { ...BASE, bg: '#07050A', bg2: '#170A12', accent: '#FF6B7A', accent2: '#FF9AA4', glow: '#D52C3D', light: 0.8 } },
  { id: 'glace', name: 'Glace', c: { ...BASE, bg: '#040A10', bg2: '#0A1B26', accent: '#8FE6FF', accent2: '#54D8FF', glow: '#2AB8F0', light: 1 } },
  { id: 'or', name: 'Finale (or)', c: { ...BASE, bg: '#070604', bg2: '#17120A', accent: '#FFD873', accent2: '#E9A92B', glow: '#E9A92B', light: 0.9 } },
];
export const THEME_TOKENS = [
  ['bg', 'Fond'], ['bg2', 'Fond (haut)'], ['text', 'Texte'], ['muted', 'Texte secondaire'],
  ['accent', 'Accent'], ['accent2', 'Accent 2'], ['glow', 'Lumière'], ['line', 'Traits'],
];

export const DEFAULT_FONTS = { display: 'Space Grotesk', body: 'Space Grotesk', script: 'Great Vibes', impact: 'Anton', condensed: 'Barlow Condensed', italic: 'Montserrat' };
export const FONT_ROLES = [['display', 'Titres'], ['body', 'Textes'], ['script', 'Manuscrite'], ['impact', 'Impact (écho)'], ['condensed', 'Condensée'], ['italic', 'Italique fine']];
export const FONT_LIST = ['Space Grotesk', 'Montserrat', 'Anton', 'Bebas Neue', 'Archivo Black', 'Barlow Condensed', 'IBM Plex Mono', 'Great Vibes', 'Allura', 'Pinyon Script', 'Titan One'];

export const TEXT_DEFAULTS = {
  org: 'MYBAD ESPORT', event: 'Spike Series 2026', stage: 'Open Qualifier #1',
  p1: 'Bambino', p2: 'Nissa', p3: 'Siproni', p4: 'Matrix', p5: 'Ismo',
  a1: 'omen', a2: 'jett', a3: 'killjoy', a4: 'raze', a5: 'sova',
  r1: 'Smoker', r2: 'Duelist', r3: 'Sentinel', r4: 'Duelist', r5: 'Initiator',
  coach: 'VirusXV3',
  adv: 'Équipe adverse', date: 'Samedi', hour: '20H00', live: 'twitch.tv/mybad_esport',
  // titres (mot manuscrit + mot en gras)
  rosW1: 'Roster', rosW2: 'UPDATE', rosPlain: 'ROSTER',
  mdW1: 'Match', mdW2: 'DAY', mdPlain: 'MATCHDAY',
  resMode: 'win', resW1W: 'Victoire', resW2W: 'GG', resPlainW: 'VICTOIRE', resW1L: 'Défaite', resW2L: 'NEXT', resPlainL: 'DÉFAITE',
  s1: '2', s2: '0', bo: 'Best of 3', mvp: 'Nissa', mvpAgent: 'jett', mvpStat: '24 / 12 / 6 · ACS 312',
  gdW1: 'Game', gdW2: 'DAY', gdPlain1: 'GAME', gdPlain2: 'DAY', gdSide: 'MATCHDAY', featAgent: 'jett',
  anW1: 'Bienvenue', anNames: 'Bambino · Nissa', anSide: 'WELCOME', anAgent1: 'omen', anAgent2: 'jett',
  nrL1: 'NOUVEAU', nrL2: 'ROSTER',
  tTitle: 'TOURNOI', tGame: 'MyBad Cup · Valorant 5v5', tDay: '15', tMonth: 'Novembre', tYear: '2026', tHour: 'à 20H',
  tInfo1: 'Inscription gratuite', tInfo2: '16 équipes · BO1 puis BO3', tPrize: '100€', tPrizeLbl: 'de cashprize', tAgent: 'reyna',
  plW1: 'Planning', plW2: 'SEMAINE', plPlain: 'PLANNING', plWeek: 'Semaine du 27 octobre',
  pl1d: 'Lundi', pl1h: '21H00', pl1t: 'Scrim vs Team Nova', pl1g: 'SCRIM',
  pl2d: 'Mercredi', pl2h: '20H00', pl2t: 'Spike Series · Round 1', pl2g: 'MATCH',
  pl3d: 'Jeudi', pl3h: '21H00', pl3t: 'Stream communauté', pl3g: 'LIVE',
  pl4d: 'Samedi', pl4h: '18H00', pl4t: 'Spike Series · Round 2', pl4g: 'MATCH',
  pl5d: '', pl5h: '', pl5t: '', pl5g: '',
  recW1: 'On', recW2: 'RECRUTE', recPlain: 'ON RECRUTE', recSub: 'Roster Valorant · objectif ligue française',
  rec1: 'Initiator — Immortal 3 minimum', rec2: 'Flex — expérience LAN appréciée', rec3: 'Coach — disponible 3 soirs / semaine', rec4: 'Caster / créateur de contenu',
  recCta: 'Candidature sur discord.gg/mybad', recNote: 'Structure associative · ambiance sérieuse et bienveillante',
  cardName: 'Nissa', cardRole: 'Duelist', cardAgent: 'jett', cardTag: 'JOUEUR',
  st1l: 'ACS', st1v: '268', st2l: 'K/D', st2v: '1.34', st3l: 'HS%', st3v: '27%', st4l: 'RANG', st4v: 'Immortal 3',
  liveW1: 'En', liveW2: 'LIVE', livePlain: 'EN LIVE', liveTitle: 'Spike Series · on commente le match', liveUrl: 'twitch.tv/mybad_esport', liveAgent: 'sage',
  sig: 'POLARIS / NORTH STAR', coords: '48.8566° N — 2.3522° E',
};
export const RL_DEFAULTS = {
  p1: 'Joueur 1', p2: 'Joueur 2', p3: 'Joueur 3', a1: 'octane', a2: 'fennec', a3: 'dominus',
  r1: 'Striker', r2: 'Midfield', r3: 'Keeper', mvpAgent: 'octane', featAgent: 'octane', anAgent1: 'octane', anAgent2: 'fennec',
  tAgent: 'dominus', cardAgent: 'octane', cardRole: 'Striker', liveAgent: 'fennec',
  mvpStat: '3 buts · 2 passes · 520 pts', tGame: 'MyBad Cup · Rocket League 3v3',
  st1l: 'BUTS', st1v: '42', st2l: 'PASSES', st2v: '18', st3l: 'ARRÊTS', st3v: '35', st4l: 'RANG', st4v: 'Champion II',
  recSub: 'Roster Rocket League · 3v3', rec1: 'Joueur — Champion II minimum', rec2: 'Remplaçant', rec3: 'Coach Rocket League', rec4: 'Caster / créateur de contenu',
};

export function newDocument(kit) {
  const k = kit || {};
  const theme = THEMES.find(t => t.id === (k.theme || 'nuit')) || THEMES[0];
  const doc = {
    app: 'mybad-creator', version: 2,
    fmt: '4x5', W: 1080, H: 1350, game: k.game || 'valorant', tpl: 'matchday',
    themeId: theme.id, theme: { ...theme.c },
    script: true,
    use3d: true,
    fonts: { ...DEFAULT_FONTS },
    T: { ...TEXT_DEFAULTS, ...(k.T || {}), ...((k.rosters && k.rosters[k.game || 'valorant']) || {}) },
    layers: [], assets: { ...(k.assets || {}) },
  };
  applyTemplate(doc, 'matchday');
  return doc;
}

export function setGameDefaults(doc, game, kit) {
  doc.game = game;
  const roster = kit?.rosters?.[game];
  if (game === 'rl') Object.assign(doc.T, RL_DEFAULTS, roster || {});
  else {
    const vk = Object.keys(RL_DEFAULTS);
    vk.forEach(key => { doc.T[key] = TEXT_DEFAULTS[key]; });
    Object.assign(doc.T, roster || {});
  }
}

// (Ré)applique un modèle : les calques du modèle sont recréés, les calques ajoutés à la main sont gardés.
export function applyTemplate(doc, key, opts = {}) {
  const F = FORMATS[doc.fmt] || FORMATS['4x5'];
  const oldH = doc.H;
  doc.W = F.w; doc.H = F.h; doc.tpl = key;
  const tpl = TEMPLATES[key];
  const ctx = {
    W: doc.W, H: doc.H, u: Math.min(doc.W, doc.H * 0.8) / 1080, T: doc.T, game: doc.game,
    nPlayers: GAMES[doc.game]?.players || 5, script: doc.script, use3d: !!doc.use3d,
  };
  setDocFonts(doc.fonts);
  const built = tpl.build(ctx).map(L => ({ id: uid(), visible: true, locked: false, ...L, fromTpl: true }));
  built.forEach(L => { if (L.variant) L.visible = (L.variant === 'script') === !!doc.script; });
  const keep = opts.keepUser === false ? [] : doc.layers.filter(L => !L.fromTpl).map(L => (oldH && oldH !== doc.H ? { ...L, y: L.y * doc.H / oldH } : L));
  doc.layers = [...built, ...keep];
  return doc;
}

export function setScriptMode(doc, on) {
  doc.script = !!on;
  doc.layers.forEach(L => { if (L.variant) L.visible = (L.variant === 'script') === doc.script; });
}

export function renderDoc(canvas, doc, env, scale = 1) {
  setDocFonts(doc.fonts);
  return renderScene(canvas, scale === 1 ? doc : scaledDoc(doc, scale), env);
}
