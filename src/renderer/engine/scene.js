// Moteur de rendu par calques : chaque élément de l'affiche est un calque transformable.
import { rgba, mix, rnd, layer as pool, rrect } from './util.js';
import { starPath, smear } from './fx.js';

export const BLENDS = [
  ['source-over', 'Normal'], ['multiply', 'Produit'], ['screen', 'Écran'], ['overlay', 'Incrustation'],
  ['soft-light', 'Lumière tamisée'], ['hard-light', 'Lumière crue'], ['color-dodge', 'Densité couleur −'],
  ['color-burn', 'Densité couleur +'], ['lighten', 'Éclaircir'], ['darken', 'Obscurcir'], ['difference', 'Différence'],
  ['color', 'Couleur'], ['luminosity', 'Luminosité'], ['hue', 'Teinte'], ['saturation', 'Saturation'],
];

let UID = 1;
export const uid = () => 'l' + Date.now().toString(36) + (UID++).toString(36);

// ---------------------------------------------------------------- couleurs & textes
export function color(c, theme) {
  if (!c || c === 'none') return null;
  if (c[0] === '$') return theme[c.slice(1)] || '#ffffff';
  return c;
}
export function interp(s, T) { return String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => T[k] ?? ''); }
export function layerText(L, T) {
  let s = L.tpl ? interp(L.tpl, T) : (L.text ?? '');
  if (L.upper) s = s.toLocaleUpperCase('fr-FR');
  return s;
}

const MC = document.createElement('canvas').getContext('2d');
// Polices du document par rôle (titre manuscrit, titre, texte) : appliquées aux calques qui n'ont pas de police forcée.
let FONTS = {};
export function setDocFonts(f) { FONTS = f || {}; }
export function fontOf(L) { return (L.fontRole && !L.fontOverride && FONTS[L.fontRole]) || L.font || 'Space Grotesk'; }
function setFont(c, L, size) {
  c.font = `${L.italic ? 'italic ' : ''}${L.weight || 700} ${Math.max(1, size)}px "${fontOf(L)}", "Space Grotesk", "Segoe UI Symbol", "Segoe UI", sans-serif`;
  c.letterSpacing = `${(L.spacing || 0) * size}px`;
}
// Texte composé de plusieurs segments (couleurs/graisses différentes sur une même ligne)
function runsLayout(L, T) {
  let size = L.size || 40;
  const items = L.runs.map(r => {
    const R = { ...L, ...r, runs: null };
    let s = r.tpl ? interp(r.tpl, T) : (r.text ?? '');
    if (R.upper) s = s.toLocaleUpperCase('fr-FR');
    return { R, s, k: r.scale || 1 };
  });
  const measureAll = sz => items.map(it => { setFont(MC, it.R, sz * it.k); const sp = (it.R.spacing || 0) * sz * it.k; return it.s ? MC.measureText(it.s).width - sp : 0; });
  let ws = measureAll(size);
  const gap = (L.gap ?? 0.3) * size;
  let total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  if (L.autoFit !== false && total > L.w) { const k = L.w / total; size *= k; ws = measureAll(size); total = ws.reduce((a, b) => a + b, 0) + (L.gap ?? 0.3) * size * (items.length - 1); }
  MC.letterSpacing = '0px';
  const asc = size * (L.ascent || 0.8), desc = size * 0.24;
  return { runs: items, ws, total, size, gap: (L.gap ?? 0.3) * size, asc, h: asc + desc, lines: [items.map(i => i.s).join(' ')], widths: [total], lh: size };
}
export function textLayout(L, T) {
  if (L.runs && L.runs.length) return runsLayout(L, T);
  const lines = layerText(L, T).split('\n');
  let size = L.size || 40;
  setFont(MC, L, size);
  const sp = (L.spacing || 0) * size;
  let widths = lines.map(l => (l ? MC.measureText(l).width - sp : 0));
  const maxW = Math.max(1, ...widths);
  if (L.autoFit !== false && maxW > L.w) { const k = L.w / maxW; size *= k; widths = widths.map(w => w * k); }
  MC.letterSpacing = '0px';
  const lh = size * (L.lineHeight || 1.1);
  const asc = size * (L.ascent || 0.8), desc = size * 0.24;
  return { lines, size, widths, lh, asc, h: asc + desc + (lines.length - 1) * lh };
}

// Boîte englobante d'un calque (le texte calcule sa hauteur).
export function layerBox(L, T, doc) {
  if (L.type === 'bg' || L.full) return { x: 0, y: 0, w: doc.W, h: doc.H, rot: 0 };
  if (L.type === 'text') return { x: L.x, y: L.y, w: L.w, h: textLayout(L, T).h, rot: L.rot || 0 };
  return { x: L.x, y: L.y, w: L.w, h: L.h, rot: L.rot || 0 };
}

// ---------------------------------------------------------------- dessin des calques
function withLayerTransform(c, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  c.translate(cx, cy); c.rotate((b.rot || 0) * Math.PI / 180); c.translate(-cx, -cy);
}

function paint(c, L, env, b, fillKey = 'fill') {
  const th = env.theme;
  const g = L.grad;
  if (g && g.on) {
    const ang = (g.angle ?? 90) * Math.PI / 180;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(b.w, b.h) / 2;
    const gr = c.createLinearGradient(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    gr.addColorStop(0, color(g.from, th) || '#fff'); gr.addColorStop(1, color(g.to, th) || '#000');
    return gr;
  }
  return color(L[fillKey], th);
}

function drawRuns(c, L, env, b, lay) {
  let x = L.align === 'center' ? b.x + (b.w - lay.total) / 2 : L.align === 'right' ? b.x + b.w - lay.total : b.x;
  const y = b.y + lay.asc;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  lay.runs.forEach((it, i) => {
    setFont(c, it.R, lay.size * it.k);
    c.fillStyle = color(it.R.color, env.theme) || '#fff';
    c.fillText(it.s, x, y);
    x += lay.ws[i] + lay.gap;
  });
  c.letterSpacing = '0px';
}
function drawText(c, L, env, b) {
  const lay = textLayout(L, env.T);
  if (lay.runs) { drawRuns(c, L, env, b, lay); return; }
  const fill = paint(c, L, env, b, 'color');
  const strokeCol = color(L.strokeColor, env.theme) || '#fff';
  const sw = (L.strokeWidth ?? 2) * env.u;
  const mode = L.style || 'fill';
  const lineX = i => L.align === 'center' ? b.x + (b.w - lay.widths[i]) / 2 : L.align === 'right' ? b.x + b.w - lay.widths[i] : b.x;
  const each = fn => lay.lines.forEach((ln, i) => fn(ln, lineX(i), b.y + lay.asc + i * lay.lh));
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  setFont(c, L, lay.size);
  if (mode !== 'outline' && fill) { c.fillStyle = fill; each((t, x, y) => c.fillText(t, x, y)); }
  if (mode !== 'fill') {
    // contour propre : on trace un trait double puis on efface l'intérieur des lettres,
    // ce qui supprime aussi les tracés internes des glyphes qui se chevauchent.
    const tmp = pool('txt', env.W, env.H), tc = tmp.getContext('2d');
    tc.setTransform(c.getTransform());
    setFont(tc, L, lay.size); tc.textBaseline = 'alphabetic'; tc.textAlign = 'left';
    tc.lineJoin = 'round'; tc.lineWidth = sw * 2; tc.strokeStyle = strokeCol;
    each((t, x, y) => tc.strokeText(t, x, y));
    tc.globalCompositeOperation = 'destination-out'; tc.fillStyle = '#000';
    each((t, x, y) => tc.fillText(t, x, y));
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(tmp, 0, 0); c.restore();
  }
  c.letterSpacing = '0px';
}

// Emblème MyBad (repère d'origine 1932 × 1932, contenu entre x 8–1924 et y 92–1832)
const EMB = {
  wings: [[[8, 435], [780, 1072], [792, 1095], [915, 1730], [812, 1460], [712, 1108], [700, 1098], [195, 770]],
    [[218, 882], [680, 1110], [730, 1255], [350, 1080]], [[630, 1278], [738, 1308], [815, 1462], [912, 1732]]],
  diamond: [[968, 625], [1072, 1155], [966, 1820], [862, 1155]],
  box: { x: 8, y: 92, w: 1916, h: 1740 },
};
export const EMBLEM_RATIO = 1982 / 1799; // proportions du logo officiel MyBad
// Logo de la structure (image du Kit de marque). Sans logo : emplacement à remplir.
function drawEmblem(c, L, env, b) {
  const img = env.image(L.asset || 'u:logo');
  if (img) {
    const r = Math.min(b.w / img.width, b.h / img.height);
    const w = img.width * r, h = img.height * r;
    c.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
    return;
  }
  if (env.exporting) return;
  const u = env.u, s = Math.min(b.w, b.h);
  c.save();
  c.setLineDash([8 * u, 6 * u]); c.strokeStyle = rgba(color('$text', env.theme), 0.35); c.lineWidth = 2 * u;
  c.beginPath(); c.arc(b.x + b.w / 2, b.y + b.h / 2, s * 0.45, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);
  c.font = `600 ${Math.max(10, s * 0.13)}px "Space Grotesk"`; c.fillStyle = rgba(color('$text', env.theme), 0.45);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TON LOGO', b.x + b.w / 2, b.y + b.h / 2);
  c.restore();
}
function northStar(c, cx, cy, rv, rh, k = 0.13) {
  const T = [cx, cy - rv], R = [cx + rh, cy], B = [cx, cy + rv], Lf = [cx - rh, cy];
  const ctl = (a, b2) => [cx + (a[0] - cx + b2[0] - cx) * k, cy + (a[1] - cy + b2[1] - cy) * k];
  c.beginPath(); c.moveTo(...T);
  [[T, R], [R, B], [B, Lf], [Lf, T]].forEach(([a, b2]) => c.quadraticCurveTo(...ctl(a, b2), ...b2));
  c.closePath();
}

function drawShape(c, L, env, b) {
  const th = env.theme;
  const fill = paint(c, L, env, b, 'fill');
  const stroke = color(L.stroke, th);
  const sw = (L.strokeWidth ?? 2) * env.u;
  c.lineJoin = 'round'; c.lineCap = L.cap || 'butt';
  if (L.dash) c.setLineDash([L.dash * env.u, L.dash * env.u]);
  const fs = () => { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke && sw > 0) { c.strokeStyle = stroke; c.lineWidth = sw; c.stroke(); } };
  switch (L.shape) {
    case 'rect': rrect(c, b.x, b.y, b.w, b.h, (L.radius || 0) * env.u); fs(); break;
    case 'ellipse': c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); fs(); break;
    case 'line': c.beginPath(); c.moveTo(b.x, b.y + b.h / 2); c.lineTo(b.x + b.w, b.y + b.h / 2); c.strokeStyle = stroke || fill || '#fff'; c.lineWidth = Math.max(1, sw); c.stroke(); break;
    case 'star': northStar(c, b.x + b.w / 2, b.y + b.h / 2, b.h / 2, b.w / 2, L.inner ?? 0.13); fs(); break;
    case 'polygon': {
      const n = Math.max(3, L.sides || 6); c.beginPath();
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const x = b.x + b.w / 2 + Math.cos(a) * b.w / 2, y = b.y + b.h / 2 + Math.sin(a) * b.h / 2; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.closePath(); fs(); break;
    }
    case 'brackets': {
      const l = Math.min(b.w, b.h) * (L.len ?? 0.08);
      c.strokeStyle = stroke || fill || '#fff'; c.lineWidth = Math.max(1, sw); c.lineCap = 'square';
      [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach(([x, y, sx, sy]) => {
        c.beginPath(); c.moveTo(x, y + l * sy); c.lineTo(x, y); c.lineTo(x + l * sx, y); c.stroke();
      });
      break;
    }
    case 'arrows': {
      const n = L.count || 2, s = b.h; c.fillStyle = fill || stroke || '#fff';
      for (let i = 0; i < n; i++) { const ox = b.x + i * s * 1.05; c.beginPath(); c.moveTo(ox, b.y); c.lineTo(ox + s * 0.9, b.y + s / 2); c.lineTo(ox, b.y + s); c.closePath(); c.fill(); }
      break;
    }
    case 'chevrons': {
      const n = L.count || 3, s = b.h; c.strokeStyle = stroke || fill || '#fff'; c.lineWidth = Math.max(1, sw);
      for (let i = 0; i < n; i++) {
        const ox = b.x + i * s * 0.62;
        c.beginPath(); c.moveTo(ox, b.y); c.lineTo(ox + s * 0.45, b.y + s / 2); c.lineTo(ox, b.y + s); c.lineTo(ox + s * 0.22, b.y + s);
        c.lineTo(ox + s * 0.67, b.y + s / 2); c.lineTo(ox + s * 0.22, b.y); c.closePath(); c.stroke();
      }
      break;
    }
    case 'slashes': {
      const n = L.count || 4, gap = b.w / n; c.strokeStyle = stroke || fill || '#fff'; c.lineWidth = Math.max(1, sw);
      for (let i = 0; i < n; i++) { const x = b.x + i * gap; c.beginPath(); c.moveTo(x + gap * 0.2, b.y + b.h); c.lineTo(x + gap * 0.8, b.y); c.stroke(); }
      break;
    }
    case 'shield': {
      const s = Math.min(b.w, b.h), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.beginPath(); c.moveTo(cx - s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy + s * .02);
      c.quadraticCurveTo(cx + s * .3, cy + s * .3, cx, cy + s * .46); c.quadraticCurveTo(cx - s * .3, cy + s * .3, cx - s * .38, cy + s * .02); c.closePath();
      c.strokeStyle = stroke || fill || '#fff'; c.lineWidth = Math.max(2, s * 0.05); c.stroke();
      [-0.12, 0.08].forEach(oy => { c.beginPath(); c.moveTo(cx - s * .2, cy + s * oy - s * .06); c.lineTo(cx, cy + s * oy + s * .08); c.lineTo(cx + s * .2, cy + s * oy - s * .06); c.stroke(); });
      break;
    }
  }
  c.setLineDash([]);
}

function imageFilter(f) {
  if (!f) return 'none';
  const parts = [];
  if (f.brightness != null && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast != null && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate != null && f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
  if (f.invert) parts.push(`invert(${f.invert}%)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  return parts.join(' ') || 'none';
}
function drawImageLayer(c, L, env, b) {
  const img = env.image(L.asset);
  if (!img) { env.placeholder(c, L, b); return; }
  c.filter = imageFilter(L.filters);
  c.save();
  if (L.fit === 'cover') { c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip(); }
  const z = L.zoom || 1;
  const r = (L.fit === 'cover' ? Math.max(b.w / img.width, b.h / img.height) : Math.min(b.w / img.width, b.h / img.height)) * z;
  const w = img.width * r, h = img.height * r;
  let x = b.x + (b.w - w) / 2 + (L.panX || 0) * b.w, y = b.y + (b.h - h) / 2 + (L.panY || 0) * b.h;
  if (L.fit !== 'cover' && L.anchor === 'bottom') y = b.y + b.h - h + (L.panY || 0) * b.h;
  if (L.flipX) { c.translate(x + w / 2, 0); c.scale(-1, 1); c.translate(-(x + w / 2), 0); }
  c.drawImage(img, x, y, w, h);
  c.restore();
  c.filter = 'none';
}

function drawBg(c, L, env) {
  const th = env.theme, W = env.W, H = env.H;
  const c1 = color(L.c1, th) || '#000', c2 = color(L.c2, th) || c1;
  if (L.mode === 'solid') c.fillStyle = c1;
  else if (L.mode === 'radial') {
    const g = c.createRadialGradient(W * (L.cx ?? 0.5), H * (L.cy ?? 0.4), 0, W * (L.cx ?? 0.5), H * (L.cy ?? 0.4), Math.max(W, H) * (L.r ?? 0.8));
    g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g;
  } else {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g;
  }
  c.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- modèles 3D
function drawModel(c, L, env, b) {
  const cv = env.model3d ? env.model3d(L, b) : null;
  if (!cv) { env.placeholder(c, { ...L, ph: 'model' }, b); return; }
  if (L.contact) {
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.985, rx = b.w * 0.32, ry = Math.max(4, b.h * 0.025);
    c.save(); c.translate(cx, cy); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
  }
  if (L.reflect) {
    const rh = b.h * 0.4;
    const r = pool('refl', Math.max(1, Math.round(b.w)), Math.max(1, Math.round(rh))), rc = r.getContext('2d');
    rc.save(); rc.translate(0, 0); rc.scale(1, -1); rc.drawImage(cv, 0, -b.h, b.w, b.h); rc.restore();
    rc.globalCompositeOperation = 'destination-in';
    const g = rc.createLinearGradient(0, 0, 0, rh); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    rc.fillStyle = g; rc.fillRect(0, 0, b.w, rh);
    c.drawImage(r, b.x, b.y + b.h, b.w, rh);
  }
  c.drawImage(cv, b.x, b.y, b.w, b.h);
}

// ---------------------------------------------------------------- effets procéduraux
function drawEffect(c, L, env, b) {
  const th = env.theme, u = env.u;
  const col = color(L.color, th) || '#ffffff';
  const amt = (L.amount ?? 0.5) * (L.themed ? (th.light ?? 1) : 1);
  if (amt <= 0) return;
  const R = rnd(L.seed || 7);
  switch (L.effect) {
    case 'stars': {
      const n = Math.round(amt * b.w * b.h / 2600);
      for (let i = 0; i < n; i++) {
        const x = b.x + R() * b.w, y = b.y + R() * b.h, s = R();
        c.fillStyle = rgba(col, 0.12 + s * s * 0.7);
        c.beginPath(); c.arc(x, y, (0.6 + s * s * 1.8) * u, 0, 7); c.fill();
        if (s > 0.97) { c.fillStyle = rgba(col, 0.6); northStar(c, x, y, 7 * u, 5 * u); c.fill(); }
      }
      break;
    }
    case 'glow': {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(b.w, b.h) / 2;
      c.save(); c.translate(cx, cy); c.scale(b.w / (2 * r) || 1, b.h / (2 * r) || 1);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(col, Math.min(1, 0.55 * amt))); g.addColorStop(0.45, rgba(col, 0.2 * amt)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
      break;
    }
    case 'beam': {
      c.filter = `blur(${Math.round(22 * u)}px)`;
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, rgba(col, Math.min(1, 0.5 * amt))); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.beginPath();
      c.moveTo(b.x + b.w * 0.42, b.y); c.lineTo(b.x + b.w * 0.58, b.y); c.lineTo(b.x + b.w, b.y + b.h); c.lineTo(b.x, b.y + b.h); c.closePath(); c.fill();
      c.filter = 'none';
      break;
    }
    case 'bigstar': {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      northStar(c, cx, cy, b.h / 2, b.w / 2, 0.2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, rgba(mix(col, '#ffffff', 0.3), 0.75 * amt)); g.addColorStop(0.5, rgba(col, 0.45 * amt)); g.addColorStop(1, rgba(col, 0.03));
      c.fillStyle = g; c.shadowColor = rgba(col, 0.8); c.shadowBlur = 90 * u * amt; c.fill(); c.shadowBlur = 0;
      northStar(c, cx, cy, b.h * 0.31, b.w * 0.31, 0.2);
      c.strokeStyle = rgba(mix(col, '#ffffff', 0.6), 0.25 * amt); c.lineWidth = 2 * u; c.stroke();
      break;
    }
    case 'streaks': {
      c.filter = `blur(${Math.max(1, Math.round(2 * u))}px)`;
      const n = Math.round(15 + 80 * amt);
      for (let i = 0; i < n; i++) {
        const y = b.y + R() * b.h, h = Math.max(1, b.h * (0.003 + R() * 0.02));
        const len = b.w * (0.15 + R() * 0.7), x = b.x + R() * b.w * 1.2 - b.w * 0.2;
        const cc = R() < 0.3 ? '#ffffff' : col;
        const g = c.createLinearGradient(x, 0, x + len, 0);
        g.addColorStop(0, rgba(cc, 0)); g.addColorStop(0.5, rgba(cc, (0.05 + R() * 0.25) * amt)); g.addColorStop(1, rgba(cc, 0));
        c.fillStyle = g; c.fillRect(x, y, len, h);
      }
      c.filter = 'none';
      break;
    }
    case 'bars': {
      const n = Math.round(30 + 100 * amt);
      for (let i = 0; i < n; i++) {
        const x = b.x + R() * b.w, w = b.w * (0.002 + R() * R() * 0.05);
        const y0 = b.y + b.h * (R() * 0.55 - 0.1), h = b.h * (0.25 + R() * 0.75);
        const cc = R() < 0.2 ? '#ffffff' : col;
        const g = c.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, rgba(cc, 0)); g.addColorStop(0.5, rgba(cc, (0.03 + R() * 0.16) * amt)); g.addColorStop(1, rgba(cc, 0));
        c.fillStyle = g; c.fillRect(x, y0, w, h);
      }
      break;
    }
    case 'constellation': {
      const pts = Array.from({ length: Math.round(20 + 60 * amt) }, () => [b.x + R() * b.w, b.y + R() * b.h, R()]);
      c.strokeStyle = rgba(col, 0.08); c.lineWidth = Math.max(1, u);
      const d2 = (Math.min(b.w, b.h) * 0.14) ** 2;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
        if (dx * dx + dy * dy < d2) { c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[j][0], pts[j][1]); c.stroke(); }
      }
      pts.forEach(([x, y, s]) => { c.fillStyle = rgba(col, 0.15 + s * 0.45); c.beginPath(); c.arc(x, y, (0.8 + s * 1.8) * u, 0, 7); c.fill(); });
      break;
    }
    case 'grid': {
      const hz = b.y + b.h * (L.horizon ?? 0.35);
      c.strokeStyle = rgba(col, 0.35 * amt); c.lineWidth = Math.max(1, 1.2 * u);
      for (let i = 0; i <= 16; i++) { const t = i / 16, y = hz + (b.y + b.h - hz) * t * t; c.globalAlpha = 0.25 + 0.75 * t; c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke(); }
      c.globalAlpha = 1;
      for (let k = -14; k <= 14; k++) { c.beginPath(); c.moveTo(b.x + b.w / 2 + k * b.w * 0.04, hz); c.lineTo(b.x + b.w / 2 + k * b.w * 0.4, b.y + b.h); c.stroke(); }
      break;
    }
    case 'vignette': {
      const W = env.W, H = env.H;
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, Math.min(1, amt)));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      break;
    }
    case 'smoke': {
      // fumée : bruit fractal coloré, plus dense en bas et sur les côtés
      const fogc = pool('smoke', Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h))), fc = fogc.getContext('2d');
      fc.imageSmoothingEnabled = true;
      fc.globalAlpha = 1; fc.drawImage(fbm(L.seed || 5), 0, 0, b.w, b.h);
      fc.globalCompositeOperation = 'source-in'; fc.fillStyle = col; fc.fillRect(0, 0, b.w, b.h);
      fc.globalCompositeOperation = 'destination-in';
      const gv = fc.createLinearGradient(0, 0, 0, b.h);
      gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gv.addColorStop(1, '#000');
      fc.fillStyle = gv; fc.fillRect(0, 0, b.w, b.h);
      if ((L.sides ?? 0.7) > 0) {
        const gh = fc.createLinearGradient(0, 0, b.w, 0), k = L.sides ?? 0.7;
        gh.addColorStop(0, '#000'); gh.addColorStop(0.35, `rgba(0,0,0,${1 - k})`); gh.addColorStop(0.65, `rgba(0,0,0,${1 - k})`); gh.addColorStop(1, '#000');
        fc.fillStyle = gh; fc.fillRect(0, 0, b.w, b.h);
      }
      fc.globalCompositeOperation = 'source-over';
      c.save(); c.globalAlpha = Math.min(1, amt); c.globalCompositeOperation = 'screen'; c.drawImage(fogc, b.x, b.y, b.w, b.h); c.restore();
      break;
    }
    case 'floor': {
      // sol réfléchissant : dégradé depuis l'horizon + reflet lumineux du faisceau
      const hz = b.y;
      const g = c.createLinearGradient(0, hz, 0, b.y + b.h);
      g.addColorStop(0, rgba('#000000', 0)); g.addColorStop(0.3, rgba(mix(col, '#000000', 0.9), 0.45)); g.addColorStop(1, rgba('#000000', 0.9));
      c.fillStyle = g; c.fillRect(b.x, hz, b.w, b.h);
      c.save(); c.translate(b.x + b.w / 2, hz + b.h * 0.14); c.scale(1, 0.16);
      const r = b.w * 0.45, rg = c.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, rgba(col, 0.55 * amt)); rg.addColorStop(1, rgba(col, 0));
      c.fillStyle = rg; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
      const hl = c.createLinearGradient(b.x, 0, b.x + b.w, 0);
      hl.addColorStop(0, rgba(col, 0)); hl.addColorStop(0.5, rgba(mix(col, '#ffffff', 0.3), 0.5 * amt)); hl.addColorStop(1, rgba(col, 0));
      c.globalAlpha = 0.5; c.fillStyle = hl; c.fillRect(b.x, hz + b.h * 0.12, b.w, 1.5 * u); c.globalAlpha = 1;
      break;
    }
    case 'bloom': {
      // halo de lumière sur les zones claires (post-traitement)
      const src = c.canvas, W = src.width, H = src.height;
      const t = pool('bloom', Math.round(W / 4), Math.round(H / 4)), tc = t.getContext('2d');
      tc.filter = 'brightness(0.9) contrast(1.6)'; tc.drawImage(src, 0, 0, t.width, t.height); tc.filter = 'none';
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'screen';
      c.filter = `blur(${Math.round(18 * u)}px)`; c.globalAlpha = Math.min(1, amt * 0.7); c.drawImage(t, 0, 0, W, H);
      c.filter = `blur(${Math.round(60 * u)}px)`; c.globalAlpha = Math.min(1, amt * 0.5); c.drawImage(t, 0, 0, W, H);
      c.restore();
      break;
    }
    case 'grade': {
      // étalonnage : ombres teintées, contraste, saturation
      const src = c.canvas, W = src.width, H = src.height;
      const t = pool('grade', W, H), tc = t.getContext('2d');
      tc.filter = `contrast(${100 + 25 * amt}%) saturate(${100 + 15 * amt}%)`; tc.drawImage(src, 0, 0); tc.filter = 'none';
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1; c.drawImage(t, 0, 0);
      c.globalCompositeOperation = 'soft-light'; c.globalAlpha = Math.min(1, 0.55 * amt); c.fillStyle = col; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'multiply'; c.globalAlpha = Math.min(1, 0.25 * amt);
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffffff'); g.addColorStop(1, mix(col, '#000000', 0.6));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.restore();
      break;
    }
    case 'grain': {
      c.save(); c.globalAlpha = Math.min(1, amt * 0.35); c.globalCompositeOperation = 'overlay';
      const p = c.createPattern(noise(), 'repeat'); const s = Math.max(0.5, u);
      c.setTransform(s, 0, 0, s, 0, 0); c.fillStyle = p; c.fillRect(0, 0, env.W / s, env.H / s);
      c.restore();
      break;
    }
  }
}
// Bruit fractal (nuages) pour la fumée, mis en cache par graine.
const FBM = new Map();
function fbm(seed) {
  if (FBM.has(seed)) return FBM.get(seed);
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d'), R = rnd(seed);
  const oct = (size, alpha) => {
    const g = document.createElement('canvas'); g.width = g.height = size;
    const gx = g.getContext('2d'), d = gx.createImageData(size, size);
    for (let i = 0; i < d.data.length; i += 4) { const v = R() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    gx.putImageData(d, 0, 0);
    x.globalAlpha = alpha; x.imageSmoothingQuality = 'high'; x.drawImage(g, 0, 0, N, N);
  };
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  oct(4, 1); oct(8, 0.5); oct(16, 0.28); oct(32, 0.14); oct(64, 0.07);
  x.globalAlpha = 1; x.filter = 'blur(6px) contrast(1.6) brightness(0.85)'; x.drawImage(cv, 0, 0); x.filter = 'none';
  FBM.set(seed, cv);
  return cv;
}
let NOISE = null;
function noise() {
  if (NOISE) return NOISE;
  NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 256;
  const x = NOISE.getContext('2d'), d = x.createImageData(256, 256), R = rnd(9);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.floor(R() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); return NOISE;
}

// ---------------------------------------------------------------- composition d'un calque
function needsLayerCanvas(L) {
  const f = L.fx || {};
  return (f.shadow && f.shadow.on) || (f.glow && f.glow.on) || (f.stroke && f.stroke.on) || (f.fade && f.fade.on && f.fade.amount > 0)
    || (f.smear > 0) || (L.tint && L.tint.on) || (L.blend && L.blend !== 'source-over') || (L.opacity ?? 1) < 1;
}

function drawContent(c, L, env, b) {
  switch (L.type) {
    case 'bg': drawBg(c, L, env); break;
    case 'text': drawText(c, L, env, b); break;
    case 'shape': drawShape(c, L, env, b); break;
    case 'emblem': drawEmblem(c, L, env, b); break;
    case 'image': drawImageLayer(c, L, env, b); break;
    case 'effect': drawEffect(c, L, env, b); break;
    case 'model': drawModel(c, L, env, b); break;
  }
}

export function renderLayer(ctx, L, env) {
  if (L.visible === false) return;
  const b = layerBox(L, env.T, env);
  if (!needsLayerCanvas(L)) {
    ctx.save(); withLayerTransform(ctx, b);
    if (L.type === 'effect' && L.blendFx) ctx.globalCompositeOperation = L.blendFx;
    drawContent(ctx, L, env, b); ctx.restore();
    return;
  }
  const W = env.W, H = env.H, th = env.theme, u = env.u, f = L.fx || {};
  const lc = pool('lc', W, H), c = lc.getContext('2d');
  c.save(); withLayerTransform(c, b);
  drawContent(c, L, env, b);
  // teinte (images) : garde la luminosité, applique la couleur
  if (L.tint && L.tint.on) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const t2 = pool('tint', W, H), tc = t2.getContext('2d');
    tc.drawImage(lc, 0, 0);
    tc.globalCompositeOperation = L.tint.mode || 'color';
    tc.fillStyle = color(L.tint.color, th) || '#1EA7FF'; tc.globalAlpha = L.tint.amount ?? 0.6; tc.fillRect(0, 0, W, H);
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'destination-in'; tc.drawImage(lc, 0, 0);
    c.clearRect(0, 0, W, H); c.drawImage(t2, 0, 0); c.restore();
  }
  // fondu progressif sur un bord (masque dégradé, dans le repère du calque)
  if (f.fade && f.fade.on && f.fade.amount > 0) {
    const a = Math.min(1, f.fade.amount), d = f.fade.dir || 'bottom';
    let g;
    if (d === 'bottom') { g = c.createLinearGradient(0, b.y + b.h * (1 - a), 0, b.y + b.h); }
    else if (d === 'top') { g = c.createLinearGradient(0, b.y + b.h * a, 0, b.y); }
    else if (d === 'left') { g = c.createLinearGradient(b.x + b.w * a, 0, b.x, 0); }
    else { g = c.createLinearGradient(b.x + b.w * (1 - a), 0, b.x + b.w, 0); }
    g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-in'; c.fillStyle = g;
    c.fillRect(b.x - b.w, b.y - b.h, b.w * 3, b.h * 3);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  // fondu pixel (traînées verticales)
  if (f.smear > 0) {
    const src = pool('smsrc', W, H); src.getContext('2d').drawImage(lc, 0, 0);
    c.clearRect(0, 0, W, H);
    smear({ c, W, H }, src, b.y + b.h * (f.smearCut ?? 0.72), f.smear, L.seed || 3);
  }
  // contour autour de la silhouette (PNG détourés)
  if (f.stroke && f.stroke.on && f.stroke.width > 0) {
    const s2 = pool('strk', W, H), sc = s2.getContext('2d');
    const r = f.stroke.width * u, n = 16;
    for (let i = 0; i < n; i++) sc.drawImage(lc, Math.cos(i / n * 2 * Math.PI) * r, Math.sin(i / n * 2 * Math.PI) * r);
    sc.globalCompositeOperation = 'source-in'; sc.fillStyle = color(f.stroke.color, th) || '#fff'; sc.fillRect(0, 0, W, H);
    sc.globalCompositeOperation = 'source-over'; sc.drawImage(lc, 0, 0);
    c.clearRect(0, 0, W, H); c.drawImage(s2, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = L.opacity ?? 1;
  ctx.globalCompositeOperation = L.blend || 'source-over';
  const far = W * 3;
  // ombre portée seule (dessinée hors champ, seule l'ombre retombe dans l'image)
  if (f.shadow && f.shadow.on) {
    ctx.shadowColor = rgba(color(f.shadow.color, th) || '#000000', f.shadow.opacity ?? 0.6);
    ctx.shadowBlur = (f.shadow.blur ?? 20) * u;
    ctx.shadowOffsetX = far + (f.shadow.x ?? 0) * u; ctx.shadowOffsetY = (f.shadow.y ?? 10) * u;
    ctx.drawImage(lc, -far, 0);
  }
  if (f.glow && f.glow.on) {
    ctx.shadowColor = rgba(color(f.glow.color, th) || '#54D8FF', f.glow.opacity ?? 0.9);
    ctx.shadowBlur = (f.glow.blur ?? 30) * u; ctx.shadowOffsetX = far; ctx.shadowOffsetY = 0;
    ctx.drawImage(lc, -far, 0);
    if ((f.glow.strength ?? 1) > 1) ctx.drawImage(lc, -far, 0);
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.drawImage(lc, 0, 0);
  ctx.restore();
}

export function renderScene(canvas, doc, env0) {
  const W = Math.round(doc.W), H = Math.round(doc.H);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  const env = { ...env0, W, H, u: Math.min(W, H * 0.8) / 1080, theme: doc.theme, T: doc.T };
  for (const L of doc.layers) {
    try { renderLayer(ctx, L, env); } catch (e) { console.error('calque', L.name, e); }
  }
  return canvas;
}

// Haute définition : on rend à 2× en mettant à l'échelle tout le document.
export function scaledDoc(doc, k) {
  if (k === 1) return doc;
  const s = v => (typeof v === 'number' ? v * k : v);
  const layers = doc.layers.map(L => {
    const n = { ...L, x: s(L.x), y: s(L.y), w: s(L.w), h: s(L.h) };
    if (L.type === 'text') n.size = L.size * k;
    return n;
  });
  return { ...doc, W: doc.W * k, H: doc.H * k, layers };
}

export const EMB_GEOM = EMB;
void starPath;
