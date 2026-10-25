// Modèles d'affiches MyBad Creator. Chaque modèle génère des calques éditables,
// reliés aux champs du contenu ({event}, {p1}…) pour rester modifiables depuis le panneau Contenu.
import { EMBLEM_RATIO } from './scene.js';

// ---------------------------------------------------------------- fabriques de calques
const text = o => ({ type: 'text', name: o.name || 'Texte', fontRole: 'display', font: 'Space Grotesk', weight: 700, size: 40, color: '$text', align: 'center', spacing: 0, upper: false, autoFit: true, lineHeight: 1.1, x: 0, y: 0, w: 400, rot: 0, ...o });
const shape = o => ({ type: 'shape', name: o.name || 'Forme', fill: null, stroke: null, strokeWidth: 2, rot: 0, ...o });
const image = o => ({ type: 'image', name: o.name || 'Image', fit: 'contain', anchor: 'bottom', rot: 0, ...o });
const effect = o => ({ type: 'effect', name: o.name || 'Effet', locked: true, rot: 0, seed: 7, ...o });
const emblem = o => ({ type: 'emblem', name: 'Emblème MyBad', color: '$text', rot: 0, ...o });
const ctext = (cx, y, w, o) => text({ x: cx - w / 2, w, y, ...o });

const scriptT = (o) => text({ fontRole: 'script', font: 'Great Vibes', weight: 400, upper: false, ascent: 0.95, ...o });
const glowFx = (color = '$glow', blur = 28, opacity = 0.75) => ({ glow: { on: true, color, blur, opacity } });

// Fond commun à la DA : nuit profonde, halo discret, poussière d'étoiles, coins de cadre et mentions.
function base(ctx, o = {}) {
  const { W, H, u } = ctx;
  const L = [
    { type: 'bg', name: 'Fond', locked: true, mode: 'linear', c1: '$bg2', c2: '$bg', x: 0, y: 0, w: W, h: H },
    effect({ name: 'Halo', effect: 'glow', color: '$glow', amount: o.glow ?? 0.55, themed: true, x: W * 0.5 - W * 0.55, y: H * (o.glowY ?? 0.3) - W * 0.45, w: W * 1.1, h: W * 0.9 }),
    effect({ name: 'Poussière d\'étoiles', effect: 'stars', color: '$white', amount: o.stars ?? 0.4, seed: 21, full: true, x: 0, y: 0, w: W, h: H }),
  ];
  if (o.bottomGlow !== false) L.push(effect({ name: 'Halo bas', effect: 'glow', color: '$glow', amount: 0.22, themed: true, x: -W * 0.2, y: H * 0.78, w: W * 1.4, h: H * 0.4 }));
  return L;
}
function frame(ctx, labels = {}) {
  const { W, H, u } = ctx;
  const m = Math.min(W, H) * 0.046;
  const lab = { size: 22 * u, weight: 500, spacing: 0.16, color: '$muted', upper: true, fontRole: 'body' };
  const L = [shape({ name: 'Coins de cadre', shape: 'brackets', stroke: '$line', strokeWidth: 2.2, len: 46 * u / Math.min(W - 2 * m, H - 2 * m), x: m, y: m, w: W - 2 * m, h: H - 2 * m, locked: true })];
  const ix = m + 42 * u, iy = m + 40 * u, iw = W * 0.4;
  if (labels.tl) L.push(text({ name: 'Mention haut gauche', ...lab, align: 'left', x: ix, y: iy, w: iw, tpl: labels.tl }));
  if (labels.tr) L.push(text({ name: 'Mention haut droite', ...lab, align: 'right', x: W - ix - iw, y: iy, w: iw, tpl: labels.tr }));
  const by = H - m - 40 * u - 22 * u;
  if (labels.bl) {
    L.push(shape({ name: 'Étoile bas gauche', shape: 'star', fill: '$muted', x: ix - 4 * u, y: by + 2 * u, w: 16 * u, h: 20 * u }));
    L.push(text({ name: 'Mention bas gauche', ...lab, align: 'left', x: ix + 28 * u, y: by, w: iw, tpl: labels.bl }));
  }
  if (labels.br) {
    L.push(text({ name: 'Mention bas droite', ...lab, align: 'right', x: W - ix - 28 * u - iw, y: by, w: iw, tpl: labels.br }));
    L.push(shape({ name: 'Étoile bas droite', shape: 'star', fill: '$muted', x: W - ix - 12 * u, y: by + 2 * u, w: 16 * u, h: 20 * u }));
  }
  if (labels.bc !== false) L.push(shape({ name: 'Barres', shape: 'slashes', stroke: '$muted', strokeWidth: 1.6, count: 4, x: W / 2 - 28 * u, y: by + 1 * u, w: 56 * u, h: 22 * u }));
  return L;
}
const finish = ctx => [effect({ name: 'Grain', effect: 'grain', amount: 0.14, full: true, x: 0, y: 0, w: ctx.W, h: ctx.H })];
const gameName = ctx => (ctx.game === 'rl' ? 'ROCKET LEAGUE' : 'VALORANT');

// Titre à deux mots : variante manuscrite + gras, et variante classique (bascule globale).
function title2(ctx, cx, y, o) {
  const { W, u } = ctx;
  const w = o.w || W * 0.84, s = o.scale || 1, al = o.align || 'center';
  const x = al === 'center' ? cx - w / 2 : cx;
  return [
    scriptT({ name: 'Titre manuscrit', variant: 'script', tpl: o.w1, x, y: y - 190 * u * s, w, size: 200 * u * s, align: al, fx: glowFx('$white', 18, 0.45) }),
    text({ name: 'Titre gras', variant: 'script', tpl: o.w2, upper: true, x, y: y + 30 * u * s, w, size: 168 * u * s, weight: 700, align: al, spacing: 0.01 }),
    text({ name: 'Titre', variant: 'plain', tpl: o.plain, upper: true, x, y: y - 20 * u * s, w, size: 150 * u * s, weight: 700, align: al, fx: glowFx('$glow', 30, 0.6) }),
  ];
}

function emblemAt(cx, cy, h, o = {}) {
  const w = h * EMBLEM_RATIO;
  return emblem({ x: cx - w / 2, y: cy - h / 2, w, h, fx: o.glow === false ? undefined : glowFx('$glow', 40, 0.35), ...o });
}

function agentImage(ctx, field, box, o = {}) {
  if (ctx.use3d) {
    const car = ctx.game === 'rl';
    return {
      type: 'model', name: (o.name || 'Render').replace('Render', 'Modèle 3D'), model: '@' + field, ...box, rot: 0,
      rotY: o.rotY ?? (car ? 35 : 10), camPitch: car ? 12 : 4, zoom3d: 1, target: 0.5, fov: 28, anim: 0, animTime: 0,
      key: { color: '#cfd8ff', intensity: 1, angle: -30 }, rim: { color: '$glow', intensity: 5.5, angle: 160 }, fill: { color: '$glow', intensity: 0.7 }, ambient: { color: '$glow', intensity: 0.8 },
      reflect: !!o.reflect, contact: true, opacity: o.opacity, fx: o.fx,
    };
  }
  return image({ name: o.name || 'Render', asset: '@' + field, ph: 'agent', phField: field, ...box, ...o });
}

function playerPills(ctx, y, o = {}) {
  const { W, u } = ctx, n = ctx.nPlayers;
  const gap = 22 * u, total = Math.min(W * 0.82, n * 200 * u);
  const pw = (total - gap * (n - 1)) / n, ph = 78 * u;
  const L = [];
  for (let i = 0; i < n; i++) {
    const x = W / 2 - total / 2 + i * (pw + gap);
    L.push(shape({ name: `Cadre joueur ${i + 1}`, shape: 'rect', radius: 10, fill: '$panel', stroke: '$line', strokeWidth: 2, x, y, w: pw, h: ph }));
    L.push(text({ name: `Joueur ${i + 1}`, tpl: `{p${i + 1}}`, upper: true, size: 27 * u, weight: 700, spacing: 0.06, x: x + 14 * u, y: y + ph / 2 - 15 * u, w: pw - 28 * u, fontRole: 'body' }));
  }
  if (o.coach !== false) {
    const cw = Math.max(320 * u, W * 0.28), cy = y + ph + 36 * u;
    L.push(shape({ name: 'Cadre coach', shape: 'rect', radius: 10, fill: '$panel', stroke: '$line', strokeWidth: 2, x: W / 2 - cw / 2, y: cy, w: cw, h: ph }));
    L.push(text({ name: 'Coach', tpl: 'COACH — {coach}', upper: true, size: 25 * u, weight: 600, spacing: 0.12, color: '$accent', x: W / 2 - cw / 2 + 16 * u, y: cy + ph / 2 - 14 * u, w: cw - 32 * u, fontRole: 'body' }));
  }
  return L;
}

function playerRow(ctx, base0, o = {}) {
  let base = base0;
  const { W, H, u } = ctx, n = ctx.nPlayers;
  const big = Math.min(H, W * 1.25) * (o.h || 0.44);
  const spread = (o.spread || 0.168) * (n === 3 ? 1.45 : 1);
  const order = n === 5 ? [0, 4, 1, 3, 2] : [0, 2, 1];
  const mid = (n - 1) / 2;
  const car = ctx.game === 'rl';
  return order.map(i => {
    const h = car ? Math.min(H, W * 1.25) * (i === mid ? 0.27 : 0.22) : big * (i === mid ? 1 : 0.9);
    const w = car ? W * (i === mid ? 0.5 : 0.4) : h * 0.85;
    const cx = car ? W / 2 + (i - mid) * W * 0.29 : W / 2 + (i - mid) * W * spread;
    if (car) base = base0 + (i === mid ? 0 : -H * 0.06);
    return agentImage(ctx, `a${i + 1}`, { x: cx - w / 2, y: base - h, w, h }, {
      name: `Render joueur ${i + 1}`, reflect: true, rotY: car ? (i < mid ? 40 : i > mid ? -40 : 20) : undefined, fx: { glow: { on: true, color: '$glow', blur: 34, opacity: 0.55 }, fade: { on: true, dir: 'bottom', amount: 0.22 } },
    });
  });
}

// ================================================================= MODÈLES
function matchday(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.25 }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bl: '{org}', br: 'MATCH' }),
    emblemAt(W / 2, H * 0.205, H * 0.2),
    ...title2(ctx, W / 2, H * 0.43, { w1: '{mdW1}', w2: '{mdW2}', plain: '{mdPlain}' }),
    text({ name: 'Compétition', tpl: '{event} — {stage}', upper: true, size: 27 * u, weight: 500, spacing: 0.26, color: '$muted', x: W * 0.08, y: H * 0.585, w: W * 0.84, fontRole: 'body' }),
    text({ name: 'Affiche du match', x: W * 0.06, y: H * 0.618, w: W * 0.88, size: 50 * u, gap: 0.45, fontRole: 'body', upper: true,
      runs: [{ tpl: '{org}', color: '$accent', weight: 700 }, { text: 'vs', color: '$muted', weight: 500, scale: 0.7, upper: false }, { tpl: '{adv}', color: '$accent', weight: 700 }] }),
    text({ name: 'Infos', tpl: '{date}  ✦  {hour}  ✦  {live}', upper: true, size: 25 * u, weight: 500, spacing: 0.12, color: '$muted', x: W * 0.08, y: H * 0.676, w: W * 0.84, fontRole: 'body' }),
    shape({ name: 'Séparateur', shape: 'line', stroke: '$line', strokeWidth: 2, x: W * 0.385, y: H * 0.722, w: W * 0.23, h: 4 * u }),
    ...playerPills(ctx, H * 0.752),
    ...finish(ctx),
  ];
}

function roster(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.42, glow: 0.4 }),
    effect({ name: 'Faisceau', effect: 'beam', color: '$glow', amount: 0.55, themed: true, x: W * 0.05, y: 0, w: W * 0.9, h: H * 0.72 }),
    effect({ name: 'Grande étoile', effect: 'bigstar', color: '$glow', amount: 0.75, themed: true, x: W * 0.2, y: H * 0.17, w: W * 0.6, h: H * 0.52 }),
    effect({ name: 'Traînées', effect: 'streaks', color: '$glow', amount: 0.45, themed: true, seed: 11, x: 0, y: H * 0.52, w: W, h: H * 0.32 }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bl: '{org}', br: 'ROSTER' }),
    text({ name: 'Structure', tpl: '{org}', upper: true, align: 'left', size: 40 * u, weight: 700, spacing: 0.04, x: W * 0.12, y: H * 0.105, w: W * 0.6 }),
    shape({ name: 'Flèches', shape: 'arrows', fill: '$accent', count: 2, x: W * 0.12, y: H * 0.152, w: 40 * u, h: 18 * u }),
    shape({ name: 'Trait', shape: 'line', stroke: '$text', strokeWidth: 1.6, x: W * 0.12 + 56 * u, y: H * 0.152 + 7 * u, w: W * 0.12, h: 4 * u }),
    text({ name: 'Compétition', tpl: '{event} · {stage}', upper: true, align: 'left', size: 22 * u, weight: 600, spacing: 0.12, x: W * 0.12 + 76 * u + W * 0.12, y: H * 0.149, w: W * 0.88 - (W * 0.12 + 76 * u + W * 0.12), fontRole: 'body' }),
    scriptT({ name: 'Titre manuscrit', variant: 'script', tpl: '{rosW1}', x: W * 0.08, y: H * 0.18, w: W * 0.84, size: 190 * u, fx: glowFx('$white', 18, 0.45) }),
    text({ name: 'Titre gras', variant: 'script', tpl: '{rosW2}', upper: true, x: W * 0.08, y: H * 0.335, w: W * 0.84, size: 150 * u, fx: glowFx('$glow', 30, 0.6) }),
    text({ name: 'Titre', variant: 'plain', tpl: '{rosPlain}', upper: true, x: W * 0.08, y: H * 0.2, w: W * 0.84, size: 230 * u, fx: glowFx('$glow', 36, 0.7) }),
    text({ name: 'Titre (écho)', variant: 'plain', tpl: '{rosPlain}', upper: true, x: W * 0.08, y: H * 0.2 + 200 * u, w: W * 0.84, size: 230 * u, style: 'outline', strokeWidth: 1.4, strokeColor: '$text', opacity: 0.55 }),
    ...playerRow(ctx, H * 0.83),
    shape({ name: 'Sol', shape: 'rect', x: 0, y: H * 0.78, w: W, h: H * 0.22, grad: { on: true, angle: 90, from: 'rgba(0,0,0,0)', to: '$bg' } }),
    ...Array.from({ length: ctx.nPlayers }, (_, i) => {
      const n = ctx.nPlayers, cell = W * 0.84 / n, cx = W * 0.08 + cell * (i + 0.5);
      return [
        text({ name: `Joueur ${i + 1}`, tpl: `{p${i + 1}}`, upper: true, size: 30 * u, weight: 700, spacing: 0.04, x: cx - cell / 2 + 6 * u, y: H * 0.835, w: cell - 12 * u, fontRole: 'body' }),
        text({ name: `Rôle ${i + 1}`, tpl: `{r${i + 1}}`, upper: true, size: 17 * u, weight: 500, spacing: 0.16, color: '$accent', x: cx - cell / 2 + 6 * u, y: H * 0.866, w: cell - 12 * u, fontRole: 'body' }),
      ];
    }).flat(),
    ...finish(ctx),
  ];
}

function resultat(ctx) {
  const { W, H, u, T } = ctx;
  const win = T.resMode !== 'loss';
  const sfx = win ? 'W' : 'L';
  return [
    ...base(ctx, { glowY: 0.45, glow: 0.5 }),
    effect({ name: 'Barres lumineuses', effect: 'bars', color: '$glow', amount: 0.45, themed: true, seed: win ? 8 : 12, x: 0, y: 0, w: W, h: H * 0.8 }),
    agentImage(ctx, 'mvpAgent', { x: W * 0.42, y: H * 0.36, w: W * 0.66, h: H * 0.6 }, { name: 'Render MVP', opacity: 0.85, fx: { fade: { on: true, dir: 'bottom', amount: 0.35 }, glow: { on: true, color: '$glow', blur: 30, opacity: 0.4 } } }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bl: '{org}', br: win ? 'VICTOIRE' : 'RÉSULTAT' }),
    text({ name: 'Compétition', tpl: '{event} — {stage}', upper: true, size: 24 * u, weight: 500, spacing: 0.24, color: '$muted', x: W * 0.08, y: H * 0.115, w: W * 0.84, fontRole: 'body' }),
    ...title2(ctx, W / 2, H * 0.245, { w1: `{resW1${sfx}}`, w2: `{resW2${sfx}}`, plain: `{resPlain${sfx}}`, scale: 0.7 }),
    text({ name: 'Format', tpl: '{bo}', upper: true, size: 22 * u, weight: 500, spacing: 0.2, color: '$muted', x: W * 0.2, y: H * 0.345, w: W * 0.6, fontRole: 'body' }),
    text({ name: 'Notre score', tpl: '{s1}', size: 300 * u, weight: 700, x: W * 0.12, y: H * 0.39, w: W * 0.3, fx: glowFx('$glow', 40, 0.7) }),
    text({ name: 'Score adverse', tpl: '{s2}', size: 300 * u, weight: 700, color: win ? '$muted' : '$text', x: W * 0.58, y: H * 0.39, w: W * 0.3, fx: glowFx('$glow', 40, win ? 0.25 : 0.7) }),
    shape({ name: 'Séparateur score', shape: 'line', stroke: '$line', strokeWidth: 2, x: W / 2 - 60 * u, y: H * 0.5, w: 120 * u, h: 4 * u, rot: 90 }),
    text({ name: 'Équipes', x: W * 0.08, y: H * 0.62, w: W * 0.84, size: 36 * u, gap: 0.45, upper: true, fontRole: 'body',
      runs: [{ tpl: '{org}', color: '$accent', weight: 700 }, { text: 'vs', color: '$muted', weight: 500, scale: 0.7, upper: false }, { tpl: '{adv}', color: '$text', weight: 700 }] }),
    shape({ name: 'Pastille MVP', shape: 'rect', radius: 22, fill: '$accent', x: W / 2 - 60 * u, y: H * 0.7, w: 120 * u, h: 44 * u }),
    text({ name: 'Libellé MVP', text: 'MVP', size: 24 * u, weight: 700, spacing: 0.18, color: '$bg', x: W / 2 - 60 * u, y: H * 0.7 + 10 * u, w: 120 * u, fontRole: 'body' }),
    text({ name: 'MVP', tpl: '{mvp}', upper: true, size: 76 * u, weight: 700, x: W * 0.1, y: H * 0.745, w: W * 0.8, fx: glowFx('$glow', 24, 0.5) }),
    text({ name: 'Stats MVP', tpl: '{mvpStat}', upper: true, size: 24 * u, weight: 500, spacing: 0.14, color: '$muted', x: W * 0.1, y: H * 0.81, w: W * 0.8, fontRole: 'body' }),
    ...finish(ctx),
  ];
}

function gameday(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.35, glow: 0.7, bottomGlow: false }),
    effect({ name: 'Grande étoile', effect: 'bigstar', color: '$glow', amount: 0.6, themed: true, x: W * 0.38, y: H * 0.06, w: W * 0.56, h: H * 0.46 }),
    agentImage(ctx, 'featAgent', { x: -W * 0.05, y: H * 0.04, w: W * 1.0, h: H * 0.8 }, { name: 'Render principal', fx: { smear: 0.55, smearCut: 0.78, glow: { on: true, color: '$glow', blur: 40, opacity: 0.5 } } }),
    shape({ name: 'Dégradé bas', shape: 'rect', x: 0, y: H * 0.48, w: W, h: H * 0.52, grad: { on: true, angle: 90, from: 'rgba(0,0,0,0)', to: '$bg' } }),
    shape({ name: 'Chevrons', shape: 'chevrons', stroke: '$text', strokeWidth: 2.5, count: 3, x: W * 0.62, y: H * 0.33, w: 170 * u, h: 86 * u, opacity: 0.4 }),
    text({ name: 'Texte vertical', tpl: '{gdSide}', upper: true, style: 'outline', strokeColor: '$text', strokeWidth: 1.4, opacity: 0.3, size: 150 * u, x: W * 0.955 - H * 0.36, y: H * 0.42 - 75 * u, w: H * 0.72, rot: 90 }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bc: false }),
    text({ name: 'Infos', tpl: '{date} · {hour}', upper: true, align: 'left', size: 20 * u, weight: 500, spacing: 0.14, color: '$muted', x: W * 0.07, y: H * 0.565, w: W * 0.5, fontRole: 'body' }),
    text({ name: 'Affiche', tpl: '{org} vs {adv}', upper: true, align: 'left', size: 20 * u, weight: 600, spacing: 0.14, color: '$accent', x: W * 0.07, y: H * 0.59, w: W * 0.6, fontRole: 'body' }),
    scriptT({ name: 'Titre manuscrit', variant: 'script', tpl: '{gdW1}', align: 'left', x: W * 0.06, y: H * 0.635, w: W * 0.66, size: 190 * u, fx: glowFx('$white', 18, 0.45) }),
    text({ name: 'Titre gras', variant: 'script', tpl: '{gdW2}', upper: true, align: 'left', x: W * 0.07, y: H * 0.8, w: W * 0.66, size: 180 * u }),
    text({ name: 'Titre ligne 1', variant: 'plain', tpl: '{gdPlain1}', upper: true, align: 'left', x: W * 0.07, y: H * 0.68, w: W * 0.64, size: 190 * u }),
    text({ name: 'Titre ligne 2', variant: 'plain', tpl: '{gdPlain2}', upper: true, align: 'left', weight: 300, x: W * 0.07, y: H * 0.8, w: W * 0.64, size: 190 * u }),
    emblemAt(W * 0.83, H * 0.755, 60 * u, { glow: false }),
    text({ name: 'VS', text: 'VS', size: 20 * u, weight: 500, spacing: 0.3, color: '$muted', x: W * 0.83 - 50 * u, y: H * 0.81, w: 100 * u, fontRole: 'body' }),
    image({ name: 'Logo adverse', asset: 'u:logoAdv', ph: 'logo', fit: 'contain', anchor: 'center', x: W * 0.83 - 34 * u, y: H * 0.845, w: 68 * u, h: 68 * u }),
    ...finish(ctx),
  ];
}

function annonce(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.4, glow: 0.7 }),
    effect({ name: 'Constellation', effect: 'constellation', color: '$white', amount: 0.5, seed: 3, x: 0, y: 0, w: W, h: H * 0.7 }),
    text({ name: 'Texte vertical', tpl: '{anSide}', upper: true, style: 'outline', strokeColor: '$text', strokeWidth: 1.4, opacity: 0.22, size: 170 * u, x: W * 0.9 - H * 0.38, y: H * 0.42 - 85 * u, w: H * 0.76, rot: 90 }),
    emblemAt(W / 2, H * 0.08, 46 * u, { glow: false }),
    agentImage(ctx, 'anAgent1', { x: W * 0.06, y: H * 0.12, w: W * 0.5, h: H * 0.6 }, { name: 'Render 1', fx: { smear: 0.5, smearCut: 0.8, glow: { on: true, color: '$glow', blur: 36, opacity: 0.5 } } }),
    agentImage(ctx, 'anAgent2', { x: W * 0.44, y: H * 0.12, w: W * 0.5, h: H * 0.6 }, { name: 'Render 2', fx: { smear: 0.5, smearCut: 0.8, glow: { on: true, color: '$glow', blur: 36, opacity: 0.5 } } }),
    effect({ name: 'Traînées', effect: 'streaks', color: '$glow', amount: 0.3, themed: true, seed: 14, x: 0, y: H * 0.25, w: W, h: H * 0.4 }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bl: '{org}', br: 'ANNONCE' }),
    shape({ name: 'Flèches', shape: 'arrows', fill: '$accent', count: 3, x: W * 0.1, y: H * 0.728, w: 60 * u, h: 20 * u, variant: 'plain' }),
    text({ name: 'Mot d\'annonce', variant: 'plain', tpl: '{anW1}', upper: true, italic: true, weight: 300, fontRole: 'italic', font: 'Montserrat', align: 'left', size: 96 * u, x: W * 0.1 + 80 * u, y: H * 0.695, w: W * 0.75 }),
    scriptT({ name: 'Mot manuscrit', variant: 'script', tpl: '{anW1}', align: 'left', x: W * 0.09, y: H * 0.645, w: W * 0.82, size: 170 * u, fx: glowFx('$white', 18, 0.45) }),
    text({ name: 'Noms', tpl: '{anNames}', upper: true, align: 'left', size: 92 * u, weight: 700, x: W * 0.1, y: H * 0.8, w: W * 0.8, fx: glowFx('$glow', 24, 0.6) }),
    ...finish(ctx),
  ];
}

function nouveau(ctx) {
  const { W, H, u } = ctx;
  const echo = (i) => text({ name: `Écho ${i}`, tpl: '{nrL1}', upper: true, font: 'Anton', fontRole: 'impact', weight: 400, size: 200 * u, style: 'outline', strokeColor: '$text', strokeWidth: 1.3, opacity: 0.12 + 0.12 * (4 - i), x: W * 0.08, y: H * 0.23 - i * 160 * u, w: W * 0.84 });
  return [
    ...base(ctx, { glowY: 0.35, glow: 0.65 }),
    ...[4, 3, 2, 1].map(echo),
    text({ name: 'Titre ligne 1', tpl: '{nrL1}', upper: true, font: 'Anton', fontRole: 'impact', weight: 400, size: 200 * u, color: '$accent', x: W * 0.08, y: H * 0.23, w: W * 0.84, fx: glowFx('$accent', 30, 0.45) }),
    text({ name: 'Titre ligne 2', tpl: '{nrL2}', upper: true, font: 'Anton', fontRole: 'impact', weight: 400, size: 200 * u, color: '$accent', x: W * 0.08, y: H * 0.23 + 170 * u, w: W * 0.84, fx: glowFx('$accent', 30, 0.45) }),
    ...playerRow(ctx, H * 0.88, { h: 0.4 }),
    shape({ name: 'Sol', shape: 'rect', x: 0, y: H * 0.8, w: W, h: H * 0.2, grad: { on: true, angle: 90, from: 'rgba(0,0,0,0)', to: '$bg' } }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{event}', bc: false }),
    text({ name: 'Joueurs', tpl: Array.from({ length: ctx.nPlayers }, (_, i) => `{p${i + 1}}`).join('   ✦   '), upper: true, size: 24 * u, weight: 600, spacing: 0.08, x: W * 0.08, y: H * 0.905, w: W * 0.84, fontRole: 'body' }),
    ...finish(ctx),
  ];
}

function tournoi(ctx) {
  const { W, H, u } = ctx;
  const x0 = W * 0.09;
  return [
    ...base(ctx, { glowY: 0.5, glow: 0.6 }),
    effect({ name: 'Grille', effect: 'grid', color: '$glow', amount: 0.7, themed: true, horizon: 0.0, x: 0, y: H * 0.6, w: W, h: H * 0.4 }),
    agentImage(ctx, 'tAgent', { x: W * 0.4, y: H * 0.24, w: W * 0.62, h: H * 0.64 }, { name: 'Render', fx: { glow: { on: true, color: '$glow', blur: 40, opacity: 0.6 }, fade: { on: true, dir: 'bottom', amount: 0.25 } } }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{org}', bl: '{org}', br: 'TOURNOI' }),
    text({ name: 'Titre', tpl: '{tTitle}', upper: true, italic: true, font: 'Barlow Condensed', fontRole: 'condensed', weight: 900, align: 'left', size: 160 * u, color: '$accent', x: x0, y: H * 0.1, w: W * 0.82, fx: glowFx('$accent', 30, 0.5) }),
    text({ name: 'Sous-titre', tpl: '{tGame}', upper: true, font: 'Barlow Condensed', fontRole: 'condensed', weight: 700, align: 'left', size: 50 * u, x: x0, y: H * 0.225, w: W * 0.82 }),
    text({ name: 'Jour', tpl: '{tDay}', font: 'Barlow Condensed', fontRole: 'condensed', weight: 900, align: 'left', size: 250 * u, x: x0, y: H * 0.3, w: W * 0.4 }),
    text({ name: 'Mois', tpl: '{tMonth}', upper: true, font: 'Barlow Condensed', fontRole: 'condensed', weight: 800, align: 'left', size: 60 * u, x: x0, y: H * 0.47, w: W * 0.4 }),
    text({ name: 'Année et heure', tpl: '{tYear} · {tHour}', upper: true, align: 'left', size: 32 * u, weight: 600, color: '$accent', x: x0, y: H * 0.522, w: W * 0.4, fontRole: 'body' }),
    ...[1, 2].map((i) => {
      const y = H * (0.6 + (i - 1) * 0.058);
      return [
        shape({ name: `Cadre info ${i}`, shape: 'rect', radius: 10, fill: '$panel', stroke: '$line', strokeWidth: 2, x: x0, y, w: W * 0.42, h: 56 * u }),
        shape({ name: `Étoile info ${i}`, shape: 'star', fill: '$accent', x: x0 + 20 * u, y: y + 18 * u, w: 16 * u, h: 20 * u }),
        text({ name: `Info ${i}`, tpl: `{tInfo${i}}`, align: 'left', size: 24 * u, weight: 600, x: x0 + 50 * u, y: y + 15 * u, w: W * 0.42 - 66 * u, fontRole: 'body' }),
      ];
    }).flat(),
    shape({ name: 'Bloc cashprize', shape: 'rect', radius: 14, fill: '$accent', x: x0, y: H * 0.74, w: W * 0.36, h: 130 * u, fx: glowFx('$accent', 30, 0.35) }),
    text({ name: 'Cashprize', tpl: '{tPrize}', font: 'Barlow Condensed', fontRole: 'condensed', weight: 900, size: 84 * u, color: '$bg', x: x0 + 10 * u, y: H * 0.74 + 12 * u, w: W * 0.36 - 20 * u }),
    text({ name: 'Libellé cashprize', tpl: '{tPrizeLbl}', upper: true, size: 20 * u, weight: 700, spacing: 0.1, color: '$bg', x: x0 + 10 * u, y: H * 0.74 + 92 * u, w: W * 0.36 - 20 * u, fontRole: 'body' }),
    ...finish(ctx),
  ];
}

function planning(ctx) {
  const { W, H, u, T } = ctx;
  const rows = [1, 2, 3, 4, 5].filter(i => T[`pl${i}d`] || T[`pl${i}t`]);
  const top = H * 0.395, rh = Math.min(118 * u, H * 0.5 / Math.max(1, rows.length));
  return [
    ...base(ctx, { glowY: 0.18, glow: 0.5 }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{plWeek}', bl: '{org}', br: 'PLANNING' }),
    emblemAt(W / 2, H * 0.12, 90 * u),
    ...title2(ctx, W / 2, H * 0.25, { w1: '{plW1}', w2: '{plW2}', plain: '{plPlain}', scale: 0.7 }),
    text({ name: 'Semaine', tpl: '{plWeek}', upper: true, size: 24 * u, weight: 500, spacing: 0.24, color: '$muted', x: W * 0.1, y: H * 0.352, w: W * 0.8, fontRole: 'body' }),
    ...rows.map((i, k) => {
      const y = top + k * (rh + 16 * u), x = W * 0.09, w = W * 0.82;
      return [
        shape({ name: `Ligne ${i}`, shape: 'rect', radius: 12, fill: '$panel', stroke: '$line', strokeWidth: 2, x, y, w, h: rh }),
        text({ name: `Jour ${i}`, tpl: `{pl${i}d}`, upper: true, align: 'left', size: 34 * u, weight: 700, x: x + 30 * u, y: y + rh / 2 - 34 * u, w: w * 0.3 }),
        text({ name: `Heure ${i}`, tpl: `{pl${i}h}`, upper: true, align: 'left', size: 24 * u, weight: 600, spacing: 0.1, color: '$accent', x: x + 30 * u, y: y + rh / 2 + 6 * u, w: w * 0.3, fontRole: 'body' }),
        text({ name: `Programme ${i}`, tpl: `{pl${i}t}`, align: 'left', size: 30 * u, weight: 600, x: x + w * 0.32, y: y + rh / 2 - 16 * u, w: w * 0.46, fontRole: 'body' }),
        shape({ name: `Étiquette ${i}`, shape: 'rect', radius: 18, stroke: '$accent', strokeWidth: 2, x: x + w - 160 * u, y: y + rh / 2 - 20 * u, w: 132 * u, h: 40 * u }),
        text({ name: `Type ${i}`, tpl: `{pl${i}g}`, upper: true, size: 18 * u, weight: 700, spacing: 0.16, color: '$accent', x: x + w - 160 * u, y: y + rh / 2 - 10 * u, w: 132 * u, fontRole: 'body' }),
      ];
    }).flat(),
    ...finish(ctx),
  ];
}

function recrutement(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.2, glow: 0.6 }),
    ...frame(ctx, { tl: gameName(ctx), tr: 'RECRUTEMENT', bl: '{org}', br: 'LFP' }),
    emblemAt(W / 2, H * 0.16, H * 0.15),
    ...title2(ctx, W / 2, H * 0.36, { w1: '{recW1}', w2: '{recW2}', plain: '{recPlain}', scale: 0.85 }),
    text({ name: 'Sous-titre', tpl: '{recSub}', upper: true, size: 25 * u, weight: 500, spacing: 0.18, color: '$muted', x: W * 0.08, y: H * 0.475, w: W * 0.84, fontRole: 'body' }),
    ...[1, 2, 3, 4].map((i) => {
      const y = H * (0.535 + (i - 1) * 0.07);
      return [
        shape({ name: `Cadre poste ${i}`, shape: 'rect', radius: 12, fill: '$panel', stroke: '$line', strokeWidth: 2, x: W * 0.12, y, w: W * 0.76, h: 74 * u }),
        shape({ name: `Étoile poste ${i}`, shape: 'star', fill: '$accent', x: W * 0.12 + 28 * u, y: y + 25 * u, w: 20 * u, h: 24 * u }),
        text({ name: `Poste ${i}`, tpl: `{rec${i}}`, align: 'left', size: 28 * u, weight: 600, x: W * 0.12 + 70 * u, y: y + 22 * u, w: W * 0.76 - 96 * u, fontRole: 'body' }),
      ];
    }).flat(),
    shape({ name: 'Bouton candidature', shape: 'rect', radius: 40, fill: '$accent', x: W * 0.2, y: H * 0.81, w: W * 0.6, h: 80 * u, fx: glowFx('$accent', 30, 0.35) }),
    text({ name: 'Candidature', tpl: '{recCta}', upper: true, size: 26 * u, weight: 700, spacing: 0.06, color: '$bg', x: W * 0.22, y: H * 0.81 + 24 * u, w: W * 0.56, fontRole: 'body' }),
    text({ name: 'Note', tpl: '{recNote}', size: 20 * u, weight: 500, color: '$muted', x: W * 0.1, y: H * 0.81 + 100 * u, w: W * 0.8, fontRole: 'body' }),
    ...finish(ctx),
  ];
}

function carte(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.38, glow: 0.8 }),
    effect({ name: 'Grande étoile', effect: 'bigstar', color: '$glow', amount: 0.55, themed: true, x: W * 0.3, y: H * 0.08, w: W * 0.62, h: H * 0.56 }),
    agentImage(ctx, 'cardAgent', { x: W * 0.18, y: H * 0.08, w: W * 0.8, h: H * 0.66 }, { name: 'Render joueur', fx: { glow: { on: true, color: '$glow', blur: 40, opacity: 0.55 }, fade: { on: true, dir: 'bottom', amount: 0.3 } } }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{org}', bc: false }),
    emblemAt(W * 0.135, H * 0.15, 54 * u, { glow: false }),
    text({ name: 'Étiquette', tpl: '{cardTag}', upper: true, align: 'left', size: 22 * u, weight: 600, spacing: 0.3, color: '$accent', x: W * 0.09, y: H * 0.52, w: W * 0.5, fontRole: 'body' }),
    text({ name: 'Pseudo', tpl: '{cardName}', upper: true, align: 'left', size: 170 * u, weight: 700, x: W * 0.08, y: H * 0.545, w: W * 0.84, fx: glowFx('$glow', 30, 0.55) }),
    text({ name: 'Rôle', tpl: '{cardRole}', upper: true, align: 'left', size: 28 * u, weight: 500, spacing: 0.2, color: '$muted', x: W * 0.09, y: H * 0.69, w: W * 0.8, fontRole: 'body' }),
    ...[1, 2, 3, 4].map((i) => {
      const gap = 16 * u, cw = (W * 0.82 - gap * 3) / 4, x = W * 0.09 + (i - 1) * (cw + gap), y = H * 0.75;
      return [
        shape({ name: `Cadre stat ${i}`, shape: 'rect', radius: 12, fill: '$panel', stroke: '$line', strokeWidth: 2, x, y, w: cw, h: 150 * u }),
        text({ name: `Libellé stat ${i}`, tpl: `{st${i}l}`, upper: true, size: 18 * u, weight: 600, spacing: 0.2, color: '$muted', x: x + 10 * u, y: y + 26 * u, w: cw - 20 * u, fontRole: 'body' }),
        text({ name: `Valeur stat ${i}`, tpl: `{st${i}v}`, size: 50 * u, weight: 700, x: x + 10 * u, y: y + 64 * u, w: cw - 20 * u }),
      ];
    }).flat(),
    ...finish(ctx),
  ];
}

function live(ctx) {
  const { W, H, u } = ctx;
  return [
    ...base(ctx, { glowY: 0.45, glow: 0.7 }),
    agentImage(ctx, 'liveAgent', { x: W * 0.36, y: H * 0.2, w: W * 0.7, h: H * 0.62 }, { name: 'Render', opacity: 0.9, fx: { smear: 0.4, smearCut: 0.82, glow: { on: true, color: '$glow', blur: 36, opacity: 0.5 } } }),
    ...frame(ctx, { tl: gameName(ctx), tr: '{org}', bl: '{org}', br: 'LIVE' }),
    shape({ name: 'Point live', shape: 'ellipse', fill: '#FF3B4E', x: W * 0.09, y: H * 0.16, w: 30 * u, h: 30 * u, fx: glowFx('#FF3B4E', 24, 0.9) }),
    text({ name: 'Statut', text: 'EN DIRECT', align: 'left', size: 26 * u, weight: 700, spacing: 0.28, x: W * 0.09 + 48 * u, y: H * 0.157, w: W * 0.5, fontRole: 'body' }),
    ...title2(ctx, W * 0.08, H * 0.36, { w1: '{liveW1}', w2: '{liveW2}', plain: '{livePlain}', align: 'left', w: W * 0.84 }),
    text({ name: 'Titre du stream', tpl: '{liveTitle}', align: 'left', size: 40 * u, weight: 600, x: W * 0.09, y: H * 0.56, w: W * 0.6, lineHeight: 1.15, fontRole: 'body' }),
    shape({ name: 'Bouton Twitch', shape: 'rect', radius: 40, fill: '$panel', stroke: '$accent', strokeWidth: 2.5, x: W * 0.09, y: H * 0.8, w: W * 0.62, h: 84 * u, fx: glowFx('$accent', 24, 0.4) }),
    text({ name: 'Lien', tpl: '{liveUrl}', upper: true, size: 28 * u, weight: 700, spacing: 0.08, color: '$accent', x: W * 0.09 + 20 * u, y: H * 0.8 + 26 * u, w: W * 0.62 - 40 * u, fontRole: 'body' }),
    ...finish(ctx),
  ];
}

export const TEMPLATES = {
  matchday: { name: 'Matchday', desc: 'Annonce de match', build: matchday, fields: ['mdTitle', 'event', 'stage', 'org', 'adv', 'date', 'hour', 'live', 'players', 'coach'] },
  roster: { name: 'Roster', desc: 'Annonce du line-up', build: roster, fields: ['rosTitle', 'org', 'event', 'stage', 'players'] },
  resultat: { name: 'Résultat', desc: 'Victoire ou défaite', build: resultat, fields: ['resMode', 'resTitle', 's1', 's2', 'event', 'stage', 'bo', 'org', 'adv', 'mvp', 'mvpAgent', 'mvpStat'] },
  gameday: { name: 'Game Day', desc: 'Render plein cadre', build: gameday, fields: ['gdTitle', 'featAgent', 'gdSide', 'org', 'adv', 'event', 'date', 'hour'] },
  annonce: { name: 'Bienvenue / Merci', desc: 'Arrivée ou départ', build: annonce, fields: ['anTitle', 'anNames', 'anAgent1', 'anAgent2', 'anSide', 'org', 'event'] },
  nouveau: { name: 'Nouveau roster', desc: 'Titre en écho', build: nouveau, fields: ['nrL1', 'nrL2', 'players', 'event'] },
  tournoi: { name: 'Tournoi', desc: 'Événement et cashprize', build: tournoi, fields: ['tTitle', 'tGame', 'tDay', 'tMonth', 'tYear', 'tHour', 'tInfo1', 'tInfo2', 'tPrize', 'tPrizeLbl', 'tAgent', 'org'] },
  planning: { name: 'Planning', desc: 'Programme de la semaine', build: planning, fields: ['plTitle', 'plWeek', 'planning', 'org'] },
  recrutement: { name: 'Recrutement', desc: 'Annonce LFP / staff', build: recrutement, fields: ['recTitle', 'recSub', 'rec1', 'rec2', 'rec3', 'rec4', 'recCta', 'recNote', 'org'] },
  carte: { name: 'Carte joueur', desc: 'Profil et stats', build: carte, fields: ['cardName', 'cardTag', 'cardRole', 'cardAgent', 'stats', 'org'] },
  live: { name: 'Live', desc: 'On est en direct', build: live, fields: ['liveTitleW', 'liveTitle', 'liveUrl', 'liveAgent', 'org'] },
};
