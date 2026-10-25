// Effets visuels, fonds et éléments graphiques réutilisables.
import { mix, rgba, rnd, layer, text, rrect, drawContain } from './util.js';

// Étoile du Nord (✦) à branches concaves.
export function starPath(c, cx, cy, r, inner = 0.16) {
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2;
    const m = a + Math.PI / 4;
    const tip = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const a2 = a + Math.PI / 2;
    const next = [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r];
    if (i === 0) c.moveTo(...tip);
    c.quadraticCurveTo(cx + Math.cos(m) * r * inner, cy + Math.sin(m) * r * inner, ...next);
  }
  c.closePath();
}

export function fillBg(g, stops) {
  const { c, W, H } = g;
  const gr = c.createLinearGradient(0, 0, 0, H);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
}
export function radial(g, cx, cy, r, col, a) {
  const { c } = g;
  const gr = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
  c.fillStyle = gr; c.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// Faisceau de lumière qui tombe du haut.
export function beam(g, cx, y0, len, amt) {
  const { c, W, P, u } = g;
  if (amt <= 0) return;
  c.save();
  c.globalCompositeOperation = 'screen';
  c.filter = `blur(${Math.round(24 * u)}px)`;
  const tw = W * 0.16, bw = W * 1.0;
  const gr = c.createLinearGradient(0, y0, 0, y0 + len);
  gr.addColorStop(0, rgba(P.primary, 0.55 * amt));
  gr.addColorStop(1, rgba(P.primary, 0));
  c.fillStyle = gr;
  c.beginPath(); c.moveTo(cx - tw / 2, y0); c.lineTo(cx + tw / 2, y0);
  c.lineTo(cx + bw / 2, y0 + len); c.lineTo(cx - bw / 2, y0 + len); c.closePath(); c.fill();
  c.restore();
}

// Grande étoile lumineuse en arrière-plan (signature MyBad).
export function bigStar(g, cx, cy, r, amt) {
  const { c, P, u } = g;
  c.save();
  starPath(c, cx, cy, r, 0.2);
  const gr = c.createLinearGradient(0, cy - r, 0, cy + r);
  gr.addColorStop(0, rgba(mix(P.primary, '#ffffff', 0.35), 0.95));
  gr.addColorStop(0.45, rgba(P.primary, 0.75));
  gr.addColorStop(1, rgba(P.primary, 0.05));
  c.fillStyle = gr;
  c.shadowColor = rgba(P.primary, 0.9); c.shadowBlur = 120 * u * (0.3 + amt);
  c.fill();
  c.shadowBlur = 0;
  starPath(c, cx, cy, r * 0.62, 0.2);
  c.strokeStyle = rgba(mix(P.primary, '#ffffff', 0.6), 0.35); c.lineWidth = 3 * u; c.stroke();
  starPath(c, cx, cy, r * 0.3, 0.2);
  c.fillStyle = rgba('#ffffff', 0.18 + 0.25 * amt); c.fill();
  c.restore();
  radial(g, cx, cy - r * 0.55, r * 0.6, mix(P.primary, '#ffffff', 0.5), 0.35 * amt);
}

// Brouillard bas (sol de scène).
export function fog(g, y, amt = 1) {
  const { W, P } = g;
  const R = rnd(77);
  for (let i = 0; i < 7; i++) radial(g, W * (R() * 1.1 - 0.05), y + (R() - 0.5) * W * 0.12, W * (0.18 + R() * 0.2), P.primary, 0.16 * amt);
}

// Traînées horizontales façon motion blur.
export function hstreaks(g, amt, y0, y1, seed) {
  const { c, W, H, P, u } = g;
  if (amt <= 0) return;
  const R = rnd(seed);
  c.save(); c.globalCompositeOperation = 'screen';
  c.filter = `blur(${Math.max(1, Math.round(2 * u))}px)`;
  const n = Math.round(20 + 90 * amt);
  for (let i = 0; i < n; i++) {
    const y = y0 + R() * (y1 - y0), h = Math.max(1, H * (0.001 + R() * 0.008));
    const len = W * (0.15 + R() * 0.7), x = R() * W * 1.2 - W * 0.2;
    const col = R() < 0.3 ? P.text : P.primary;
    const gr = c.createLinearGradient(x, 0, x + len, 0);
    const a = (0.05 + R() * 0.3) * amt;
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    c.fillStyle = gr; c.fillRect(x, y, len, h);
  }
  c.restore();
}

// Barres lumineuses verticales (Matchday / Résultat).
export function vstreaks(g, amt, seed) {
  const { c, W, H, P } = g;
  if (amt <= 0) return;
  const R = rnd(seed);
  c.save(); c.globalCompositeOperation = 'screen';
  const n = Math.round(30 + 110 * amt);
  for (let i = 0; i < n; i++) {
    const x = R() * W, w = W * (0.002 + R() * R() * 0.05);
    const y0 = H * (R() * 0.55 - 0.1), h = H * (0.25 + R() * 0.75);
    const col = R() < 0.22 ? P.text : mix(P.primary, '#ffffff', R() * 0.3);
    const a = (0.04 + R() * 0.2) * amt;
    const gr = c.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    c.fillStyle = gr; c.fillRect(x, y0, w, h);
  }
  c.restore();
}

// Constellation discrète (univers spatial).
export function constellation(g, amt, seed) {
  const { c, W, H, P, u } = g;
  if (amt <= 0) return;
  const R = rnd(seed);
  const pts = Array.from({ length: 70 }, () => [R() * W, R() * H, R()]);
  c.save();
  c.strokeStyle = rgba(P.text, 0.07 * amt); c.lineWidth = Math.max(1, u);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
    if (dx * dx + dy * dy < (W * 0.11) ** 2) { c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[j][0], pts[j][1]); c.stroke(); }
  }
  pts.forEach(([x, y, s]) => { c.fillStyle = rgba(P.text, (0.15 + s * 0.4) * amt); c.beginPath(); c.arc(x, y, (0.8 + s * 2) * u, 0, 7); c.fill(); });
  c.restore();
}

// Grille en perspective (Tournoi).
export function perspectiveGrid(g, horizon, col, amt) {
  const { c, W, H, u } = g;
  c.save(); c.strokeStyle = rgba(col, 0.1 * amt); c.lineWidth = Math.max(1, 1.2 * u);
  const step = W / 18;
  for (let x = 0; x <= W; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, horizon); c.stroke(); }
  for (let y = 0; y <= horizon; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = rgba(col, 0.35 * amt); c.shadowColor = rgba(col, 0.8); c.shadowBlur = 8 * u;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, y = horizon + (H - horizon) * t * t;
    c.globalAlpha = 0.3 + 0.7 * t; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  c.globalAlpha = 1;
  for (let k = -14; k <= 14; k++) {
    c.beginPath(); c.moveTo(W / 2 + k * W * 0.04, horizon); c.lineTo(W / 2 + k * W * 0.4, H); c.stroke();
  }
  c.restore();
}

// Grain photo.
let NOISE = null;
function noiseCanvas() {
  if (NOISE) return NOISE;
  NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 256;
  const x = NOISE.getContext('2d'), d = x.createImageData(256, 256), R = rnd(9);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.floor(R() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return NOISE;
}
export function grain(g, amt) {
  const { c, W, H, u } = g;
  if (amt <= 0) return;
  c.save();
  c.globalAlpha = amt * 0.35; c.globalCompositeOperation = 'overlay';
  const p = c.createPattern(noiseCanvas(), 'repeat');
  const s = Math.max(0.5, u);
  c.scale(s, s); c.fillStyle = p; c.fillRect(0, 0, W / s, H / s);
  c.restore();
}

// Coins de cadre façon viseur.
export function frame(g, col, a = 0.75) {
  const { c, W, H, u } = g;
  const m = Math.min(W, H) * 0.045, l = Math.min(W, H) * 0.045;
  c.save(); c.strokeStyle = rgba(col, a); c.lineWidth = Math.max(1.5, 2.5 * u);
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    c.beginPath(); c.moveTo(x, y + l * sy); c.lineTo(x, y); c.lineTo(x + l * sx, y); c.stroke();
  });
  c.restore();
}

// Flèches ▶▶
export function arrows(g, x, y, s, col, n = 2) {
  const { c } = g;
  c.save(); c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const ox = x + i * s * 1.05;
    c.beginPath(); c.moveTo(ox, y - s / 2); c.lineTo(ox + s * 0.9, y); c.lineTo(ox, y + s / 2); c.closePath(); c.fill();
  }
  c.restore();
  return n * s * 1.05;
}

// Chevrons contour (Game Day).
export function chevrons(g, x, y, s, col, n = 3) {
  const { c, u } = g;
  c.save(); c.strokeStyle = col; c.lineWidth = Math.max(1.5, 3 * u); c.lineJoin = 'miter';
  for (let i = 0; i < n; i++) {
    const ox = x + i * s * 0.62;
    c.beginPath(); c.moveTo(ox, y - s / 2); c.lineTo(ox + s * 0.45, y); c.lineTo(ox, y + s / 2);
    c.lineTo(ox + s * 0.22, y + s / 2); c.lineTo(ox + s * 0.67, y); c.lineTo(ox + s * 0.22, y - s / 2); c.closePath(); c.stroke();
  }
  c.restore();
}

// Fondu « pixel » : l'image se dissout en traînées verticales sous la ligne de coupe.
export function smear(g, src, cutY, amt, seed) {
  const { c, W, H } = g;
  if (amt <= 0.01) { c.drawImage(src, 0, 0); return; }
  const band = H * 0.07, maxLen = H * (0.06 + 0.36 * amt);
  const a = layer('smA', W, H), ac = a.getContext('2d');
  ac.drawImage(src, 0, 0);
  ac.globalCompositeOperation = 'destination-in';
  let gr = ac.createLinearGradient(0, cutY - band, 0, cutY + band * 0.25);
  gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ac.fillStyle = gr; ac.fillRect(0, 0, W, H);

  const s = layer('smB', W, H), sc = s.getContext('2d');
  const R = rnd(seed);
  const step = Math.max(1, Math.round(W / 300));
  for (let x = 0; x < W; x += step) {
    const sy = Math.max(0, Math.min(H - 1, cutY - band * (0.1 + R() * 1.3)));
    const len = maxLen * (0.15 + 0.85 * R() * R()) + (cutY - sy);
    sc.drawImage(src, x, sy, step, 1, x, sy, step, len);
  }
  sc.globalCompositeOperation = 'destination-in';
  gr = sc.createLinearGradient(0, cutY - band, 0, cutY + maxLen);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.12, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fillStyle = gr; sc.fillRect(0, 0, W, H);
  c.drawImage(s, 0, 0); c.drawImage(a, 0, 0);
}

// Glitch : quelques tranches horizontales décalées.
export function glitch(g, src, amt, seed) {
  const { c, W, H } = g;
  if (amt <= 0.05) return;
  const R = rnd(seed);
  const n = Math.round(4 + amt * 10);
  c.save(); c.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    const y = R() * H, h = H * (0.003 + R() * 0.012), dx = (R() - 0.5) * W * 0.06 * amt;
    c.drawImage(src, 0, y, W, h, dx, y, W, h);
  }
  c.restore();
}

// ---------- Placeholders (quand aucune image n'est fournie) ----------
export function agent(g, c, cx, base, h, seed, tone = 0.55) {
  const { P, u } = g;
  const R = rnd(seed);
  const a = (R() - 0.5) * 0.05, wsc = 0.92 + R() * 0.2, lean = (R() - 0.5) * 0.03;
  const right = [[0, -0.8], [0.035, -0.8], [0.042, -0.772], [0.1, -0.76], [0.162, -0.748], [0.195, -0.722], [0.206, -0.68],
    [0.216 + a, -0.56], [0.226 + a, -0.46], [0.214 + a, -0.398], [0.186 + a, -0.394], [0.18 + a, -0.46], [0.158, -0.63],
    [0.136, -0.58], [0.12, -0.48], [0.132, -0.42], [0.122, -0.2], [0.108, -0.03], [0.128, -0.004], [0.116, 0], [0.04, 0],
    [0.034, -0.05], [0.028, -0.36], [0, -0.385]];
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  const pts = [...right, ...left].map(([x, y]) => [(x * wsc + lean * (1 + y)) * h, y * h]);
  c.save(); c.translate(cx, base);
  const gr = c.createLinearGradient(0, -h, 0, 0);
  gr.addColorStop(0, mix(P.primary, '#05060c', tone)); gr.addColorStop(1, mix(P.bg, '#000000', 0.25));
  c.fillStyle = gr;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  const hx = lean * 0.12 * h;
  c.moveTo(hx + h * 0.058, -0.875 * h);
  c.ellipse(hx, -0.875 * h, h * 0.058, h * 0.072, 0, 0, Math.PI * 2);
  c.shadowColor = rgba(P.primary, 0.7); c.shadowBlur = 24 * u;
  c.fill();
  c.shadowBlur = 0; c.strokeStyle = rgba(mix(P.primary, '#ffffff', 0.45), 0.5); c.lineWidth = Math.max(1, 1.6 * u); c.stroke();
  // reflet de contour côté lumière
  c.save(); c.clip(); const rim = c.createLinearGradient(-h * 0.25, 0, h * 0.25, 0);
  rim.addColorStop(0, rgba(P.primary, 0)); rim.addColorStop(0.8, rgba(P.primary, 0)); rim.addColorStop(1, rgba(mix(P.primary, '#ffffff', 0.4), 0.45));
  c.fillStyle = rim; c.fillRect(-h * 0.3, -h, h * 0.6, h); c.restore();
  c.restore();
}

export function keyartPlaceholder(g, c, x, y, w, h, seed, figures = 1) {
  const { P, u } = g;
  const R = rnd(seed);
  const gr = c.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, mix(P.primary, '#ffffff', 0.15)); gr.addColorStop(1, mix(P.primary, P.bg, 0.6));
  c.fillStyle = gr; c.fillRect(x, y, w, h);
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 16; i++) {
    c.fillStyle = rgba('#ffffff', 0.03 + R() * 0.1);
    const cx = x + w * R(), cy = y + h * R();
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + (R() - 0.5) * w * 0.9, cy + (R() - 0.5) * h * 0.9); c.lineTo(cx + (R() - 0.5) * w * 0.6, cy + (R() - 0.5) * h * 0.6); c.closePath(); c.fill();
  }
  c.restore();
  c.save(); starPath(c, x + w * 0.62, y + h * 0.35, w * 0.28, 0.2);
  c.fillStyle = rgba('#ffffff', 0.22); c.shadowColor = '#fff'; c.shadowBlur = 60 * u; c.fill(); c.restore();
  if (figures === 1) agent(g, c, x + w * 0.45, y + h * 1.05, h * 1.0, seed + 3, 0.35);
  else {
    const xs = figures === 2 ? [0.36, 0.64] : [0.24, 0.5, 0.76];
    xs.forEach((fx, i) => agent(g, c, x + w * fx, y + h * 1.02, h * (i === Math.floor(xs.length / 2) && xs.length === 3 ? 0.95 : 0.85), seed + i * 7, 0.4));
  }
}

// Logo MyBad par défaut : étoile du Nord.
export function brandMark(g, cx, cy, size) {
  const { c, P, u, IM } = g;
  if (IM.logo) { drawContain(c, IM.logo, cx, cy, size * 2, size * 2); return; }
  c.save();
  starPath(c, cx, cy, size, 0.16);
  c.fillStyle = P.text; c.shadowColor = rgba(P.accent, 0.9); c.shadowBlur = 18 * u; c.fill();
  c.restore();
}
export function advMark(g, cx, cy, size) {
  const { c, P, u, IM } = g;
  if (IM.logoAdv) { drawContain(c, IM.logoAdv, cx, cy, size * 2, size * 2); return; }
  const s = size * 2;
  c.save(); c.strokeStyle = P.text; c.lineWidth = Math.max(2, s * 0.05); c.lineJoin = 'round';
  c.beginPath(); c.moveTo(cx - s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy + s * .02);
  c.quadraticCurveTo(cx + s * .3, cy + s * .3, cx, cy + s * .46); c.quadraticCurveTo(cx - s * .3, cy + s * .3, cx - s * .38, cy + s * .02); c.closePath(); c.stroke();
  [[-0.12], [0.08]].forEach(([oy]) => { c.beginPath(); c.moveTo(cx - s * .2, cy + s * oy - s * .06); c.lineTo(cx, cy + s * oy + s * .08); c.lineTo(cx + s * .2, cy + s * oy - s * .06); c.stroke(); });
  c.restore();
  void u;
}
export function partnerMark(g, cx, cy, size) {
  const { c, IM } = g;
  if (IM.partner) drawContain(c, IM.partner, cx, cy, size * 2.6, size * 1.4);
}

// Faux QR (repère visuel) quand aucun QR code n'est fourni.
export function qrPlaceholder(g, x, y, s, col, bg) {
  const { c } = g;
  const R = rnd(31), n = 21, m = s / n;
  c.save(); c.fillStyle = bg; c.fillRect(x, y, s, s); c.fillStyle = col;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const finder = (i < 7 && j < 7) || (i > 13 && j < 7) || (i < 7 && j > 13);
    if (finder) {
      const fi = i > 13 ? i - 14 : i, fj = j > 13 ? j - 14 : j;
      const on = fi === 0 || fi === 6 || fj === 0 || fj === 6 || (fi > 1 && fi < 5 && fj > 1 && fj < 5);
      if (on) c.fillRect(x + i * m, y + j * m, m + 0.5, m + 0.5);
    } else if (R() < 0.45) c.fillRect(x + i * m, y + j * m, m + 0.5, m + 0.5);
  }
  c.restore();
}

// Convertit une image en encre une couleur (sérigraphie) — mis en cache.
const INK = new Map();
export function inkImage(img, key, ink, thr) {
  const id = `${key}|${ink}|${thr}|${img.width}`;
  if (INK.has(id)) return INK.get(id);
  const max = 1100, r = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
  const x = cv.getContext('2d'); x.drawImage(img, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data;
  const [ir, ig, ib] = [parseInt(ink.slice(1, 3), 16), parseInt(ink.slice(3, 5), 16), parseInt(ink.slice(5, 7), 16)];
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const a = Math.max(0, Math.min(1, (thr - l) / 28 + 0.5));
    p[i] = ir; p[i + 1] = ig; p[i + 2] = ib; p[i + 3] = Math.round(p[i + 3] * a);
  }
  x.putImageData(d, 0, 0);
  if (INK.size > 24) INK.clear();
  INK.set(id, cv);
  return cv;
}

// Micro-textes de bas de page (signature Polaris).
export function footer(g, opts = {}) {
  const { c, W, H, u, P, T, fx } = g;
  if (!fx.micro) return;
  const y = H - Math.min(W, H) * 0.06;
  const col = opts.col || rgba(P.text, 0.75);
  const o = { size: 15 * u, w: 500, fam: 'IBM Plex Mono', fill: col, sp: 0.04 };
  const x0 = Math.min(W, H) * 0.075;
  text(c, T.org, x0, y - 20 * u, o);
  text(c, T.game, x0, y, { ...o, fill: rgba(opts.col2 || P.text, 0.5) });
  text(c, T.sig, W - x0, y - 20 * u, { ...o, align: 'right' });
  text(c, T.coords, W - x0, y, { ...o, align: 'right', fill: rgba(opts.col2 || P.text, 0.5) });
  void rrect;
}
