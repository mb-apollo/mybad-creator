// Outils de base du moteur de rendu : couleurs, aléatoire déterministe, texte, calques.

export function rgb(h) {
  h = String(h || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function rgba(h, a) {
  const [r, g, b] = rgb(h);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
export function rnd(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Pool de calques hors écran, réutilisés d'un rendu à l'autre.
const POOL = {};
export function layer(key, W, H) {
  let c = POOL[key];
  if (!c) c = POOL[key] = document.createElement('canvas');
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.filter = 'none'; x.shadowBlur = 0; x.shadowColor = 'transparent';
  x.clearRect(0, 0, W, H);
  return c;
}

// ---------- Texte ----------
export function font(o) {
  return `${o.it ? 'italic ' : ''}${o.w || 700} ${Math.max(1, o.size)}px "${o.fam || 'Space Grotesk'}", "Space Grotesk", "Segoe UI", Arial, sans-serif`;
}
export function measure(c, s, o) {
  s = String(s ?? '');
  c.save(); c.font = font(o);
  const sp = (o.sp || 0) * o.size;
  let w;
  if (!sp) w = c.measureText(s).width;
  else { w = 0; for (const ch of s) w += c.measureText(ch).width; w += sp * Math.max(0, [...s].length - 1); }
  c.restore();
  return w;
}
// Taille de police qui fait tenir le texte dans maxW (sans dépasser o.size).
export function fit(c, s, maxW, o) {
  const w = measure(c, s, o);
  return w > maxW && w > 0 ? o.size * maxW / w : o.size;
}
// Dessine un texte avec espacement, contour, halo. Retourne la largeur.
export function text(c, s, x, y, o) {
  s = String(s ?? '');
  if (!s) return 0;
  c.save();
  c.font = font(o);
  c.textBaseline = o.base || 'alphabetic';
  c.textAlign = 'left';
  const w = measure(c, s, o);
  const sx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  if (o.alpha != null) c.globalAlpha = o.alpha;
  const sp = (o.sp || 0) * o.size;
  const each = fn => {
    if (!sp) fn(s, sx);
    else { let cx = sx; for (const ch of s) { fn(ch, cx); cx += c.measureText(ch).width + sp; } }
  };
  if (o.shadow) { // ombre portée décalée (style rétro)
    c.fillStyle = o.shadow; const d = o.shadowD || 4;
    if (o.stroke) { c.strokeStyle = o.shadow; c.lineWidth = o.lw || 2; c.lineJoin = 'round'; each((t, xx) => c.strokeText(t, xx + d, y + d)); }
    each((t, xx) => c.fillText(t, xx + d, y + d));
  }
  if (o.stroke) {
    c.strokeStyle = o.stroke; c.lineWidth = o.lw || 2; c.lineJoin = 'round';
    if (o.sglow) { c.shadowColor = o.sglowc || o.stroke; c.shadowBlur = o.sglow; }
    each((t, xx) => c.strokeText(t, xx, y));
    c.shadowBlur = 0;
  }
  if (o.fill) {
    c.fillStyle = o.fill;
    if (o.glow) { c.shadowColor = o.glowc || o.fill; c.shadowBlur = o.glow; }
    each((t, xx) => c.fillText(t, xx, y));
  }
  c.restore();
  return w;
}
export function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------- Images ----------
export function drawCover(c, img, x, y, w, h, s = 1, ox = 0, oy = 0) {
  const r = Math.max(w / img.width, h / img.height) * s;
  const dw = img.width * r, dh = img.height * r;
  c.drawImage(img, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
}
export function drawContain(c, img, cx, cy, mw, mh) {
  const r = Math.min(mw / img.width, mh / img.height);
  const w = img.width * r, h = img.height * r;
  c.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
// Personnage détouré, ancré en bas au centre.
export function drawFigure(c, img, cx, base, h) {
  const r = h / img.height, w = img.width * r;
  c.drawImage(img, cx - w / 2, base - h, w, h);
}
