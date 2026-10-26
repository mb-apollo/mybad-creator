// Zone de travail : affichage, zoom, outils, sélection, poignées de transformation et repères magnétiques.
import { S, emit, on, change, select, toggleSelect, layerById, selected, toast } from './state.js';
import { renderDoc } from './engine/render.js';
import { layerBox, uid, EMBLEM_RATIO } from './engine/scene.js';
import { maskCanvas, paintableMask, stamp, commitMask, clearMask, maskKey } from './engine/mask.js';

const view = { s: 0.5, ox: 0, oy: 0, fit: true };
let stage, poster, overlay, octx, envFactory;
let poseApi = null;
let hover = null, guides = [], marquee = null, preview = null, spaceDown = false, drag = null;
const DPR = () => window.devicePixelRatio || 1;
const ACCENT = '#54D8FF', GUIDE = '#FF4FA0';

export function initEditor(opts) {
  poseApi = opts.poseApi || null;
  stage = opts.stage; poster = opts.poster; overlay = opts.overlay; envFactory = opts.env;
  octx = overlay.getContext('2d');
  new ResizeObserver(() => { sizeOverlay(); if (view.fit) fit(); else layout(); }).observe(stage);
  stage.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  stage.addEventListener('dblclick', onDbl);
  stage.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); } });
  on('doc', o => { if (o && o.full) { fit(); } requestRender(); });
  on('selection', () => { if (poseEdit && (S.sel.length !== 1 || S.sel[0] !== poseEdit.id)) poseEdit = null; if (paint && (S.sel.length !== 1 || S.sel[0] !== paint.id)) paint = null; updateCursor(); drawOverlay(); });
  sizeOverlay();
}

// ---------------------------------------------------------------- rendu
let raf = 0;
export function requestRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!S.doc) return;
    try { renderDoc(poster, S.doc, envFactory(false)); } catch (e) { console.error(e); }
    layout();
  });
}
function sizeOverlay() {
  const r = stage.getBoundingClientRect();
  overlay.width = Math.round(r.width * DPR()); overlay.height = Math.round(r.height * DPR());
  overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px';
}
function layout() {
  if (!S.doc) return;
  poster.style.width = S.doc.W * view.s + 'px';
  poster.style.height = S.doc.H * view.s + 'px';
  poster.style.left = view.ox + 'px';
  poster.style.top = view.oy + 'px';
  drawOverlay();
  emit('zoom', view.s);
}
export function fit() {
  if (!S.doc || !stage) return;
  const r = stage.getBoundingClientRect();
  const s = Math.max(0.05, Math.min((r.width - 80) / S.doc.W, (r.height - 80) / S.doc.H));
  view.s = s; view.ox = (r.width - S.doc.W * s) / 2; view.oy = (r.height - S.doc.H * s) / 2; view.fit = true;
  layout();
}
export function zoomTo(s, cx, cy) {
  const r = stage.getBoundingClientRect();
  cx ??= r.width / 2; cy ??= r.height / 2;
  s = Math.max(0.05, Math.min(4, s));
  view.ox = cx - (cx - view.ox) * s / view.s; view.oy = cy - (cy - view.oy) * s / view.s;
  view.s = s; view.fit = false; layout();
}
export const getZoom = () => view.s;

// ---------------------------------------------------------------- géométrie
const env = () => S.doc;
function box(L) { return layerBox(L, S.doc.T, env()); }
function rotP(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
function corners(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = (b.rot || 0) * Math.PI / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const [x, y] = rotP(sx * b.w / 2, sy * b.h / 2, a); return [cx + x, cy + y]; });
}
function aabb(b) {
  const c = corners(b), xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}
function toLocal(b, p) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return rotP(p[0] - cx, p[1] - cy, -(b.rot || 0) * Math.PI / 180);
}
const selectable = L => L.visible !== false && !L.locked && L.type !== 'bg' && !L.full;
function hitTest(p) {
  const pad = 6 / view.s;
  for (let i = S.doc.layers.length - 1; i >= 0; i--) {
    const L = S.doc.layers[i];
    if (!selectable(L)) continue;
    const b = box(L), [lx, ly] = toLocal(b, p);
    if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= Math.max(b.h / 2, 8 / view.s) + pad) return L;
  }
  return null;
}
function toDoc(e) {
  const r = stage.getBoundingClientRect();
  return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s];
}
function toScreen([x, y]) { return [x * view.s + view.ox, y * view.s + view.oy]; }
const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
function handleAt(L, p) {
  const b = box(L), [lx, ly] = toLocal(b, p), t = 9 / view.s;
  if (Math.abs(lx) < t && Math.abs(ly + b.h / 2 + 30 / view.s) < t) return { rotate: true };
  if (L.type === 'text' || L.type === 'image' || L.type === 'shape' || L.type === 'emblem' || L.type === 'effect' || L.type === 'model') {
    for (const [hx, hy] of HANDLES) {
      if (L.type === 'text' && hy !== 0 && hx === 0) continue;
      if (Math.abs(lx - hx * b.w / 2) < t && Math.abs(ly - hy * b.h / 2) < t) return { hx, hy };
    }
  }
  return null;
}

// ---------------------------------------------------------------- calque superposé (sélection, poignées)
function drawOverlay() {
  if (!octx || !S.doc) return;
  const d = DPR();
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.setTransform(d, 0, 0, d, 0, 0);
  const poly = pts => { octx.beginPath(); pts.map(toScreen).forEach((q, i) => (i ? octx.lineTo(...q) : octx.moveTo(...q))); octx.closePath(); };
  if (hover && !S.sel.includes(hover.id)) {
    const L = layerById(hover.id);
    if (L) { poly(corners(box(L))); octx.strokeStyle = 'rgba(84,216,255,.55)'; octx.lineWidth = 1; octx.setLineDash([4, 3]); octx.stroke(); octx.setLineDash([]); }
  }
  const sel = selected();
  sel.forEach(L => { poly(corners(box(L))); octx.strokeStyle = ACCENT; octx.lineWidth = 1.5; octx.stroke(); });
  if (sel.length === 1 && !sel[0].locked && sel[0].type !== 'bg' && !sel[0].full) {
    const L = sel[0], b = box(L), cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = (b.rot || 0) * Math.PI / 180;
    const P = (lx, ly) => { const [x, y] = rotP(lx, ly, a); return toScreen([cx + x, cy + y]); };
    const top = P(0, -b.h / 2), rh = P(0, -b.h / 2 - 30 / view.s);
    octx.beginPath(); octx.moveTo(...top); octx.lineTo(...rh); octx.strokeStyle = ACCENT; octx.lineWidth = 1; octx.stroke();
    octx.beginPath(); octx.arc(rh[0], rh[1], 5.5, 0, 7); octx.fillStyle = '#fff'; octx.fill(); octx.strokeStyle = ACCENT; octx.lineWidth = 1.5; octx.stroke();
    HANDLES.forEach(([hx, hy]) => {
      if (L.type === 'text' && hy !== 0 && hx === 0) return;
      const [x, y] = P(hx * b.w / 2, hy * b.h / 2);
      octx.fillStyle = '#fff'; octx.fillRect(x - 4.5, y - 4.5, 9, 9); octx.strokeStyle = ACCENT; octx.lineWidth = 1.5; octx.strokeRect(x - 4.5, y - 4.5, 9, 9);
    });
  }
  if (sel.length > 1) {
    const bb = sel.map(L => aabb(box(L)));
    const g = { x: Math.min(...bb.map(b => b.x)), y: Math.min(...bb.map(b => b.y)), r: Math.max(...bb.map(b => b.r)), b: Math.max(...bb.map(b => b.b)) };
    poly([[g.x, g.y], [g.r, g.y], [g.r, g.b], [g.x, g.b]]); octx.setLineDash([6, 4]); octx.strokeStyle = ACCENT; octx.lineWidth = 1; octx.stroke(); octx.setLineDash([]);
  }
  drawPaintOverlay();
  drawPoseHandles();
  drawGuidesAndRulers();
  guides.forEach(gd => {
    octx.beginPath();
    if (gd.v != null) { const [x] = toScreen([gd.v, 0]); octx.moveTo(x, 0); octx.lineTo(x, overlay.height); }
    else { const [, y] = toScreen([0, gd.h]); octx.moveTo(0, y); octx.lineTo(overlay.width, y); }
    octx.strokeStyle = GUIDE; octx.lineWidth = 1; octx.stroke();
  });
  const rect = marquee || preview;
  if (rect) {
    const [x1, y1] = toScreen([rect.x, rect.y]), [x2, y2] = toScreen([rect.x + rect.w, rect.y + rect.h]);
    octx.fillStyle = 'rgba(84,216,255,.08)'; octx.fillRect(x1, y1, x2 - x1, y2 - y1);
    octx.strokeStyle = ACCENT; octx.lineWidth = 1; octx.setLineDash([4, 3]); octx.strokeRect(x1, y1, x2 - x1, y2 - y1); octx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- magnétisme
function snapTargets(excludeIds) {
  const W = S.doc.W, H = S.doc.H;
  const v = [0, W / 2, W], h = [0, H / 2, H];
  (S.doc.guides || []).forEach(g => (g.axis === 'v' ? v : h).push(g.pos));
  S.doc.layers.forEach(L => {
    if (excludeIds.includes(L.id) || L.visible === false || L.type === 'bg' || L.full || L.type === 'effect') return;
    const a = aabb(box(L)); v.push(a.x, (a.x + a.r) / 2, a.r); h.push(a.y, (a.y + a.b) / 2, a.b);
  });
  return { v, h };
}
function snapMove(dx, dy, startBoxes, ids, free) {
  guides = [];
  if (free) return [dx, dy];
  const t = 6 / view.s, tg = snapTargets(ids);
  const g = { x: Math.min(...startBoxes.map(b => b.x)) + dx, y: Math.min(...startBoxes.map(b => b.y)) + dy, r: Math.max(...startBoxes.map(b => b.r)) + dx, b: Math.max(...startBoxes.map(b => b.b)) + dy };
  const xs = [g.x, (g.x + g.r) / 2, g.r], ys = [g.y, (g.y + g.b) / 2, g.b];
  let best = null;
  xs.forEach(x => tg.v.forEach(v => { const d = v - x; if (Math.abs(d) < t && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v }; }));
  if (best) { dx += best.d; guides.push({ v: best.v }); }
  best = null;
  ys.forEach(y => tg.h.forEach(h => { const d = h - y; if (Math.abs(d) < t && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, h }; }));
  if (best) { dy += best.d; guides.push({ h: best.h }); }
  return [dx, dy];
}

// ---------------------------------------------------------------- souris
function onDown(e) {
  if (!S.doc || e.target.closest('.stage-ui')) return;
  stage.setPointerCapture?.(e.pointerId);
  const p = toDoc(e);
  if (e.button === 1 || S.tool === 'hand' || spaceDown) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }; updateCursor(); return; }
  if (e.button !== 0) return;
  { const gi = (S.doc.guides || []).findIndex(g => Math.abs(g.pos - p[g.axis === 'v' ? 0 : 1]) < 6 / view.s); if (gi >= 0 && S.tool === 'select') { drag = { mode: 'guide', i: gi }; return; } }
  if (poseEdit && poseApi) {
    const PL = layerById(poseEdit.id), hit = PL && poseHandleAt(PL, p);
    if (hit) { drag = { mode: 'poseh', id: PL.id, h: hit, st: poseApi.start(PL, hit) }; return; }
  }
  if (paint) {
    const PL = layerById(paint.id);
    if (PL && !PL.locked) {
      const pb = box(PL), cv = paintableMask(PL, pb, envFactory(false));
      PL.mask = 'u:' + maskKey(PL); // le masque existe dès le premier trait ; il est enregistré au relâchement
      drag = { mode: 'paint', id: PL.id, b: pb, cv, last: null };
      strokeTo(p, e); return;
    }
  }
  if (['text', 'rect', 'ellipse', 'line', 'star'].includes(S.tool)) { drag = { mode: 'create', start: p }; return; }
  const sel = selected();
  if (sel.length === 1 && !sel[0].locked) {
    const h = handleAt(sel[0], p);
    if (h) {
      const L = sel[0];
      drag = { mode: h.rotate ? 'rotate' : 'resize', h, start: p, id: L.id, orig: JSON.parse(JSON.stringify(L)), b: box(L) };
      return;
    }
  }
  const hit = hitTest(p);
  if (hit) {
    if (e.shiftKey || e.ctrlKey) toggleSelect(hit.id);
    else if (!S.sel.includes(hit.id)) select(hit.id);
    const ids = S.sel.filter(id => !layerById(id)?.locked);
    drag = { mode: 'move', start: p, ids, orig: ids.map(id => ({ id, x: layerById(id).x, y: layerById(id).y })), boxes: ids.map(id => aabb(box(layerById(id)))), moved: false };
  } else {
    if (!e.shiftKey) select([]);
    drag = { mode: 'marquee', start: p, base: [...S.sel] };
  }
}

function onMove(e) {
  if (!S.doc) return;
  if (!drag) {
    if (!stage.contains(e.target) && e.target !== stage) return;
    const p = toDoc(e);
    if (paint) { brushAt = p; drawOverlay(); }
    const h = hitTest(p);
    const id = h ? h.id : null;
    if (id !== (hover && hover.id)) { hover = h; drawOverlay(); }
    const sel = selected();
    const hd = sel.length === 1 && !sel[0].locked ? handleAt(sel[0], p) : null;
    stage.style.cursor = paint ? 'none' : spaceDown || S.tool === 'hand' ? 'grab' : hd ? (hd.rotate ? 'crosshair' : cursorFor(hd, sel[0])) : S.tool !== 'select' ? 'crosshair' : 'default';
    emit('pointer', p);
    return;
  }
  const p = toDoc(e);
  if (drag.mode === 'paint') { strokeTo(p, e); return; }
  if (drag.mode === 'guide') { const g = S.doc.guides[drag.i]; if (g) { g.pos = p[g.axis === 'v' ? 0 : 1]; drawOverlay(); } return; }
  if (drag.mode === 'poseh') {
    const L = layerById(drag.id); if (!L) return;
    poseApi.drag(L, drag.h, drag.st, docToNdc(box(L), p));
    emit('doc', { live: true }); requestRender(); return;
  }
  if (drag.mode === 'pan') { view.ox = drag.ox + e.clientX - drag.sx; view.oy = drag.oy + e.clientY - drag.sy; view.fit = false; layout(); return; }
  if (drag.mode === 'create') {
    const x = Math.min(drag.start[0], p[0]), y = Math.min(drag.start[1], p[1]);
    preview = { x, y, w: Math.abs(p[0] - drag.start[0]), h: Math.abs(p[1] - drag.start[1]) };
    if (e.shiftKey) preview.h = preview.w;
    drawOverlay(); return;
  }
  if (drag.mode === 'marquee') {
    marquee = { x: Math.min(drag.start[0], p[0]), y: Math.min(drag.start[1], p[1]), w: Math.abs(p[0] - drag.start[0]), h: Math.abs(p[1] - drag.start[1]) };
    const ids = S.doc.layers.filter(L => selectable(L)).filter(L => { const a = aabb(box(L)); return a.x < marquee.x + marquee.w && a.r > marquee.x && a.y < marquee.y + marquee.h && a.b > marquee.y; }).map(L => L.id);
    S.sel = [...new Set([...drag.base, ...ids])]; emit('selection'); return;
  }
  if (drag.mode === 'move') {
    let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
    if (!drag.moved && Math.hypot(dx, dy) * view.s < 3) return;
    drag.moved = true;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    [dx, dy] = snapMove(dx, dy, drag.boxes, drag.ids, e.altKey);
    drag.orig.forEach(o => { const L = layerById(o.id); if (L) { L.x = o.x + dx; L.y = o.y + dy; } });
    emit('doc', { live: true }); return;
  }
  const L = layerById(drag.id); if (!L) return;
  const o = drag.orig, b = drag.b;
  if (drag.mode === 'rotate') {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let a = Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI + 90;
    if (e.shiftKey) a = Math.round(a / 15) * 15;
    a = ((a % 360) + 540) % 360 - 180;
    if (Math.abs(a) < 1.5) a = 0;
    L.rot = Math.round(a * 10) / 10;
    emit('doc', { live: true }); return;
  }
  if (drag.mode === 'resize') resize(L, o, b, drag.h, p, e);
}

function resize(L, o, b, h, p, e) {
  const a = (b.rot || 0) * Math.PI / 180;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const [lx, ly] = rotP(p[0] - cx, p[1] - cy, -a);
  const fromCenter = e.altKey;
  let left = -b.w / 2, right = b.w / 2, top = -b.h / 2, bottom = b.h / 2;
  if (h.hx === 1) right = lx; if (h.hx === -1) left = lx;
  if (h.hy === 1) bottom = ly; if (h.hy === -1) top = ly;
  if (fromCenter) { if (h.hx) { right = Math.abs(lx); left = -right; } if (h.hy) { bottom = Math.abs(ly); top = -bottom; } }
  let w = Math.max(4, right - left), hh = Math.max(4, bottom - top);
  const ratioLocked = (L.type === 'image' || L.type === 'emblem' || L.type === 'model' || L.type === 'text') ? !e.shiftKey : e.shiftKey;
  if (h.hx && h.hy && ratioLocked) {
    const k = Math.max(w / b.w, hh / b.h);
    w = b.w * k; hh = b.h * k;
    if (!fromCenter) { if (h.hx === 1) right = left + w; else left = right - w; if (h.hy === 1) bottom = top + hh; else top = bottom - hh; }
    else { right = w / 2; left = -w / 2; bottom = hh / 2; top = -hh / 2; }
  }
  const [dcx, dcy] = rotP((left + right) / 2, (top + bottom) / 2, a);
  const ncx = cx + dcx, ncy = cy + dcy;
  if (L.type === 'text') {
    if (h.hx && h.hy) { const k = w / b.w; L.size = Math.max(4, o.size * k); }
    L.w = w; L.x = ncx - w / 2;
    const nb = layerBox(L, S.doc.T, S.doc); L.y = ncy - nb.h / 2;
  } else {
    L.w = w; L.h = hh; L.x = ncx - w / 2; L.y = ncy - hh / 2;
  }
  emit('doc', { live: true });
}
function cursorFor(h, L) {
  const ang = ((L.rot || 0) + (h.hx && h.hy ? (h.hx === h.hy ? 45 : 135) : h.hx ? 0 : 90)) % 180;
  return ang < 22.5 || ang >= 157.5 ? 'ew-resize' : ang < 67.5 ? 'nwse-resize' : ang < 112.5 ? 'ns-resize' : 'nesw-resize';
}

function onUp(e) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.mode === 'create') {
    const p = toDoc(e);
    let r = preview; preview = null;
    if (!r || r.w * view.s < 6) r = null;
    createAt(S.tool, d.start, r);
    setTool('select');
  } else if (d.mode === 'guide') {
    const g = S.doc.guides[d.i], lim = g && (g.axis === 'v' ? S.doc.W : S.doc.H);
    change(doc => { if (g && (g.pos < 0 || g.pos > lim)) doc.guides.splice(d.i, 1); }, { immediate: true });
  } else if (d.mode === 'paint') {
    change(doc => { const L = doc.layers.find(x => x.id === d.id); if (L) commitMask(L, doc, d.cv); }, { immediate: true });
  } else if (d.mode === 'marquee') { marquee = null; drawOverlay(); }
  else if (d.mode === 'pan') updateCursor();
  else if (d.mode === 'move' && !d.moved) { /* simple clic */ }
  else change(() => {}, { immediate: true });
  guides = []; drawOverlay();
  void e;
}

function onDbl(e) {
  const hit = hitTest(toDoc(e));
  if (hit && hit.type === 'text') { select(hit.id); emit('editText', hit.id); }
  else if (hit && hit.type === 'image') { select(hit.id); emit('editImage', hit.id); }
}
function onWheel(e) {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomTo(view.s * Math.pow(1.0018, -e.deltaY), e.clientX - r.left, e.clientY - r.top);
  else { view.ox -= e.shiftKey ? e.deltaY : e.deltaX; view.oy -= e.shiftKey ? 0 : e.deltaY; view.fit = false; layout(); }
}

// ---------------------------------------------------------------- outils & création
export function setTool(t) { S.tool = t; emit('tool', t); updateCursor(); }
function updateCursor() { if (stage) stage.style.cursor = paint ? 'none' : spaceDown || S.tool === 'hand' ? (drag?.mode === 'pan' ? 'grabbing' : 'grab') : S.tool === 'select' ? 'default' : 'crosshair'; }
const u = () => Math.min(S.doc.W, S.doc.H * 0.8) / 1080;

export function addLayer(L, opts = {}) {
  const layer = { id: uid(), visible: true, locked: false, rot: 0, ...L };
  change(d => {
    if (opts.index != null) d.layers.splice(opts.index, 0, layer);
    else d.layers.push(layer);
  }, { immediate: true });
  select(layer.id);
  return layer;
}
function createAt(tool, p, r) {
  const k = u();
  if (tool === 'text') {
    const w = r ? r.w : 700 * k;
    addLayer({ type: 'text', name: 'Texte', text: 'Ton texte', font: 'Space Grotesk', fontRole: 'display', weight: 700, size: r ? Math.max(20, r.h * 0.8) : 72 * k, color: '$text', align: 'center', spacing: 0, upper: false, autoFit: false, lineHeight: 1.1, x: r ? r.x : p[0] - w / 2, y: r ? r.y : p[1] - 40 * k, w });
    emit('editText', S.sel[0]);
    return;
  }
  const def = { rect: { w: 300, h: 180 }, ellipse: { w: 220, h: 220 }, line: { w: 360, h: 8 }, star: { w: 120, h: 150 } }[tool];
  const b = r || { x: p[0] - def.w * k / 2, y: p[1] - def.h * k / 2, w: def.w * k, h: def.h * k };
  const names = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Ligne', star: 'Étoile' };
  addLayer({
    type: 'shape', name: names[tool], shape: tool, x: b.x, y: tool === 'line' ? b.y + b.h / 2 - 4 * k : b.y, w: b.w, h: tool === 'line' ? 8 * k : b.h,
    fill: tool === 'line' ? null : (tool === 'star' ? '$accent' : '$panel'), stroke: tool === 'line' ? '$text' : (tool === 'star' ? null : '$line'), strokeWidth: 2, radius: tool === 'rect' ? 12 : 0,
  });
}

// ---------------------------------------------------------------- opérations sur la sélection
export function deleteSelected() {
  const ids = S.sel.filter(id => !layerById(id)?.locked);
  if (!ids.length) return;
  change(d => { d.layers = d.layers.filter(L => !ids.includes(L.id)); }, { immediate: true });
  select([]);
}
export function duplicateSelected(offset = true) {
  const sel = selected(); if (!sel.length) return;
  const k = offset ? 20 * u() : 0;
  const copies = sel.map(L => ({ ...JSON.parse(JSON.stringify(L)), id: uid(), name: L.name + ' (copie)', fromTpl: false, x: L.x + k, y: L.y + k, locked: false }));
  change(d => {
    copies.forEach((c, i) => { const idx = d.layers.findIndex(L => L.id === sel[i].id); d.layers.splice(idx + 1 + i, 0, c); });
  }, { immediate: true });
  select(copies.map(c => c.id));
}
export function copySelected(cut = false) {
  const sel = selected(); if (!sel.length) return;
  S.clipboard = JSON.parse(JSON.stringify(sel));
  if (cut) deleteSelected();
  toast(cut ? 'Calque coupé' : `${sel.length > 1 ? sel.length + ' calques copiés' : 'Calque copié'}`);
}
export function pasteLayers() {
  if (!S.clipboard) return false;
  const k = 24 * u();
  const copies = S.clipboard.map(L => ({ ...JSON.parse(JSON.stringify(L)), id: uid(), fromTpl: false, x: L.x + k, y: L.y + k }));
  S.clipboard = copies.map(c => ({ ...c }));
  change(d => { d.layers.push(...copies); }, { immediate: true });
  select(copies.map(c => c.id));
  return true;
}
export function arrange(dir) {
  const ids = S.sel; if (!ids.length) return;
  change(d => {
    const L = d.layers;
    const picked = L.filter(l => ids.includes(l.id));
    const rest = L.filter(l => !ids.includes(l.id));
    if (dir === 'front') d.layers = [...rest, ...picked];
    else if (dir === 'back') { const bg = rest.filter(l => l.type === 'bg'); d.layers = [...bg, ...picked, ...rest.filter(l => l.type !== 'bg')]; }
    else {
      const arr = [...L];
      const order = dir === 'up' ? [...arr.keys()].reverse() : [...arr.keys()];
      order.forEach(i => {
        if (!ids.includes(arr[i].id)) return;
        const j = dir === 'up' ? i + 1 : i - 1;
        if (j < 0 || j >= arr.length || ids.includes(arr[j].id) || arr[j].type === 'bg') return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      });
      d.layers = arr;
    }
  }, { immediate: true });
}
export function align(how) {
  const sel = selected().filter(L => !L.locked); if (!sel.length) return;
  const boxes = sel.map(L => aabb(box(L)));
  const ref = sel.length === 1 ? { x: 0, y: 0, r: S.doc.W, b: S.doc.H } : { x: Math.min(...boxes.map(b => b.x)), y: Math.min(...boxes.map(b => b.y)), r: Math.max(...boxes.map(b => b.r)), b: Math.max(...boxes.map(b => b.b)) };
  change(() => {
    sel.forEach((L, i) => {
      const b = boxes[i];
      if (how === 'left') L.x += ref.x - b.x;
      if (how === 'hcenter') L.x += (ref.x + ref.r) / 2 - (b.x + b.r) / 2;
      if (how === 'right') L.x += ref.r - b.r;
      if (how === 'top') L.y += ref.y - b.y;
      if (how === 'vcenter') L.y += (ref.y + ref.b) / 2 - (b.y + b.b) / 2;
      if (how === 'bottom') L.y += ref.b - b.b;
    });
  }, { immediate: true });
}
export function distribute(axis) {
  const sel = selected().filter(L => !L.locked); if (sel.length < 3) { toast('Sélectionne au moins 3 calques pour les répartir.', true); return; }
  const items = sel.map(L => ({ L, b: aabb(box(L)) })).sort((a, b) => axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y);
  const first = items[0].b, last = items[items.length - 1].b;
  const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.r - it.b.x : it.b.b - it.b.y), 0);
  const space = ((axis === 'h' ? last.r - first.x : last.b - first.y) - total) / (items.length - 1);
  change(() => {
    let pos = axis === 'h' ? first.x : first.y;
    items.forEach(it => {
      const size = axis === 'h' ? it.b.r - it.b.x : it.b.b - it.b.y;
      if (axis === 'h') it.L.x += pos - it.b.x; else it.L.y += pos - it.b.y;
      pos += size + space;
    });
  }, { immediate: true });
}
export function nudge(dx, dy) {
  const sel = selected().filter(L => !L.locked); if (!sel.length) return;
  change(() => sel.forEach(L => { L.x += dx; L.y += dy; }));
}

// ---------------------------------------------------------------- clavier
function typing() {
  const a = document.activeElement;
  return a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox') || a?.isContentEditable;
}
function onKey(e) {
  if (!S.doc || typing() || document.querySelector('.modal:not([hidden])')) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.code === 'Space' && !spaceDown) { spaceDown = true; updateCursor(); e.preventDefault(); return; }
  if (ctrl) {
    if (k === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (k === 'a') { e.preventDefault(); select(S.doc.layers.filter(selectable).map(L => L.id)); }
    else if (k === 'c' && !e.shiftKey) { if (S.sel.length) { e.preventDefault(); copySelected(); } }
    else if (k === 'x') { if (S.sel.length) { e.preventDefault(); copySelected(true); } }
    else if (e.key === ']' || e.code === 'BracketRight') { e.preventDefault(); arrange(e.shiftKey ? 'front' : 'up'); }
    else if (e.key === '[' || e.code === 'BracketLeft') { e.preventDefault(); arrange(e.shiftKey ? 'back' : 'down'); }
    else if (k === '1') { e.preventDefault(); zoomTo(1); }
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (e.key === 'Escape') { select([]); setTool('select'); }
  else if (e.key === 'Enter' && S.sel.length === 1 && layerById(S.sel[0])?.type === 'text') emit('editText', S.sel[0]);
  else {
    const map = { v: 'select', t: 'text', u: 'rect', o: 'ellipse', l: 'line', s: 'star', h: 'hand' };
    if (map[k]) setTool(map[k]);
  }
}
export { EMBLEM_RATIO };

// ---------------------------------------------------------------- pinceau de masque
let paint = null; // { id, mode: 'erase' | 'restore', size, hard, flow } tant que le pinceau est actif
let brushAt = null;
const tintCv = document.createElement('canvas');
export const getPaint = () => paint;
export function startPaint(L) { paint = { id: L.id, mode: 'erase', size: 140, hard: 0.5, flow: 0.8 }; updateCursor(); drawOverlay(); }
export function stopPaint() { paint = null; brushAt = null; updateCursor(); drawOverlay(); }
export function setPaintOpt(k, v) { if (paint) { paint[k] = v; drawOverlay(); } }
export function resetMask(L) { change(d => { const T = d.layers.find(x => x.id === L.id); if (T) clearMask(T, d); }, { immediate: true }); requestRender(); }

function strokeTo(p, e) {
  const [lx, ly] = toLocal(drag.b, p), r = paint.size / 2, erase = (paint.mode === 'erase') !== !!e.altKey;
  const last = drag.last || [lx, ly], n = Math.max(1, Math.ceil(Math.hypot(lx - last[0], ly - last[1]) / Math.max(1, r * 0.25)));
  for (let i = 1; i <= n; i++) stamp(drag.cv, drag.b, last[0] + (lx - last[0]) * i / n, last[1] + (ly - last[1]) * i / n, r, erase, paint.hard, paint.flow * 0.5);
  drag.last = [lx, ly]; brushAt = p;
  requestRender(); drawOverlay();
}
// Zones masquées en rose sur le calque peint, et cercle du pinceau sous la souris.
function drawPaintOverlay() {
  if (!paint) return;
  const L = layerById(paint.id); if (!L) return;
  const b = box(L), mk = L.mask && maskCanvas(L, envFactory(false));
  if (mk) {
    tintCv.width = mk.width; tintCv.height = mk.height;
    const tc = tintCv.getContext('2d');
    tc.globalCompositeOperation = 'source-over'; tc.fillStyle = 'rgba(255,70,120,.45)'; tc.fillRect(0, 0, tintCv.width, tintCv.height);
    tc.globalCompositeOperation = 'destination-out'; tc.drawImage(mk, 0, 0);
    const [cx, cy] = toScreen([b.x + b.w / 2, b.y + b.h / 2]);
    octx.save(); octx.translate(cx, cy); octx.rotate((b.rot || 0) * Math.PI / 180); octx.scale(view.s, view.s);
    octx.drawImage(tintCv, -b.w / 2, -b.h / 2, b.w, b.h); octx.restore();
  }
  if (brushAt) {
    const [x, y] = toScreen(brushAt), r = paint.size / 2 * view.s;
    octx.beginPath(); octx.arc(x, y, r, 0, 7); octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; octx.stroke();
    octx.beginPath(); octx.arc(x, y, Math.max(1, r * paint.hard), 0, 7); octx.setLineDash([3, 3]); octx.strokeStyle = 'rgba(255,255,255,.6)'; octx.lineWidth = 1; octx.stroke(); octx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- poignées de pose sur le personnage
let poseEdit = null; // { id } : le calque dont on déplace les membres directement
export const getPoseEdit = () => poseEdit;
export function togglePoseEdit(L) { poseEdit = poseEdit ? null : { id: L.id }; drawOverlay(); }
const ndcToDoc = (b, h) => [b.x + (h.x + 1) / 2 * b.w, b.y + (1 - h.y) / 2 * b.h];
const docToNdc = (b, p) => ({ x: (p[0] - b.x) / b.w * 2 - 1, y: 1 - (p[1] - b.y) / b.h * 2 });
function poseHandleAt(L, p) {
  const b = box(L), r = 11 / view.s;
  let best = null, bd = Infinity;
  for (const h of poseApi.handles(L)) { const [x, y] = ndcToDoc(b, h), d = Math.hypot(x - p[0], y - p[1]); if (d < r && d < bd) { best = h; bd = d; } }
  return best;
}
const HANDLE_COLOR = { hand: '#54D8FF', elbow: '#ffffff', head: '#FF4FA0', chest: '#FFD873', knee: '#9AF0B0', foot: '#9AF0B0' };
function drawPoseHandles() {
  if (!poseEdit || !poseApi) return;
  const L = layerById(poseEdit.id); if (!L) return;
  const b = box(L);
  for (const h of poseApi.handles(L)) {
    const [x, y] = toScreen(ndcToDoc(b, h)), kind = h.key.replace(/[LR]$/, '');
    octx.beginPath(); octx.arc(x, y, 7, 0, 7); octx.fillStyle = HANDLE_COLOR[kind] || '#fff'; octx.globalAlpha = 0.9; octx.fill(); octx.globalAlpha = 1;
    octx.lineWidth = 2; octx.strokeStyle = '#04101a'; octx.stroke();
  }
}

// ---------------------------------------------------------------- repères et règles
let rulers = false;
export function toggleRulers() { rulers = !rulers; drawOverlay(); }
export function addGuide(axis) {
  change(d => { (d.guides ||= []).push({ axis, pos: axis === 'v' ? d.W / 2 : d.H / 2 }); }, { immediate: true });
  toast('Repère ajouté : glisse-le pour le placer, ou hors de l\'affiche pour le retirer');
}
function drawGuidesAndRulers() {
  if (!S.doc) return;
  octx.save(); octx.lineWidth = 1; octx.strokeStyle = '#7ADFFF'; octx.setLineDash([5, 4]);
  for (const g of S.doc.guides || []) {
    octx.beginPath();
    if (g.axis === 'v') { const [x] = toScreen([g.pos, 0]); octx.moveTo(x, 0); octx.lineTo(x, overlay.height); }
    else { const [, y] = toScreen([0, g.pos]); octx.moveTo(0, y); octx.lineTo(overlay.width, y); }
    octx.stroke();
  }
  octx.setLineDash([]); octx.restore();
  if (!rulers) return;
  const w = overlay.width / DPR(), h = overlay.height / DPR();
  octx.save(); octx.fillStyle = 'rgba(12,16,29,.88)'; octx.fillRect(0, 0, w, 16); octx.fillRect(0, 0, 16, h);
  octx.fillStyle = '#9AA0B8'; octx.strokeStyle = '#2C3352'; octx.font = '9px sans-serif';
  const step = view.s > 0.8 ? 50 : view.s > 0.35 ? 100 : 200;
  for (let v = 0; v <= S.doc.W; v += step / 2) { const [x] = toScreen([v, 0]); octx.beginPath(); octx.moveTo(x, v % step ? 11 : 6); octx.lineTo(x, 16); octx.stroke(); if (!(v % step)) octx.fillText(String(v), x + 2, 9); }
  for (let v = 0; v <= S.doc.H; v += step / 2) { const [, y] = toScreen([0, v]); octx.beginPath(); octx.moveTo(v % step ? 11 : 6, y); octx.lineTo(16, y); octx.stroke(); if (!(v % step)) octx.fillText(String(v), 1, y - 2); }
  octx.restore();
}
