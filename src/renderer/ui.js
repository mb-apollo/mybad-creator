// Petits composants d'interface partagés par les panneaux (champs, curseurs, couleurs…).
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
export function setPath(o, p, v) {
  const ks = p.split('.'); let cur = o;
  ks.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}

let N = 0;
const nid = () => 'c' + (++N);

export function section(title, body, open = true, extra = '') {
  return `<details class="sec" ${open ? 'open' : ''}><summary><span>${esc(title)}</span>${extra}</summary><div class="sec-body">${body}</div></details>`;
}
export function num(path, label, value, o = {}) {
  const id = nid();
  return `<label class="num" for="${id}" title="${esc(o.title || label)}"><span>${esc(label)}</span><input id="${id}" type="number" data-path="${path}" value="${Number.isFinite(+value) ? Math.round(+value * (o.dec ? 100 : 1)) / (o.dec ? 100 : 1) : ''}" step="${o.step || 1}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}>${o.unit ? `<i>${o.unit}</i>` : ''}</label>`;
}
export function range(path, label, value, min, max, step, fmt = v => v, o = {}) {
  const id = nid(), v = value ?? min;
  const p = ((v - min) / (max - min)) * 100;
  return `<div class="range"><div class="range-top"><label for="${id}">${esc(label)}</label><output>${esc(fmt(+v))}</output></div><input type="range" id="${id}" data-path="${path}" data-fmt="${o.fmtKey || ''}" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${p}%"></div>`;
}
export function toggle(path, label, value) {
  const id = nid();
  return `<label class="toggle" for="${id}"><span>${esc(label)}</span><input type="checkbox" id="${id}" data-path="${path}" ${value ? 'checked' : ''}></label>`;
}
export function select(path, label, value, options, o = {}) {
  const id = nid();
  return `<div class="field"><label for="${id}">${esc(label)}</label><select class="input" id="${id}" data-path="${path}" ${o.raw ? 'data-raw="1"' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}
export function seg(path, value, options, o = {}) {
  return `<div class="seg wide ${o.small ? 'small' : ''}" data-seg="${path}">${options.map(([v, l, t]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(value) ? 'on' : ''}" ${t ? `title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
}
export function textInput(path, label, value, o = {}) {
  const id = nid();
  return `<div class="field ${o.half ? '' : 'full'}"><label for="${id}">${esc(label)}</label><input class="input" id="${id}" data-path="${path}" value="${esc(value)}" spellcheck="false" ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''}></div>`;
}

export const TOKENS = [['$text', 'Texte'], ['$muted', 'Secondaire'], ['$accent', 'Accent'], ['$accent2', 'Accent 2'], ['$glow', 'Lumière'], ['$line', 'Traits'], ['$panel', 'Panneau'], ['$bg', 'Fond'], ['$white', 'Blanc']];
export function colorCtl(path, label, value, theme, o = {}) {
  const resolved = value && value[0] === '$' ? theme[value.slice(1)] : value;
  const hex = /^#[0-9a-f]{6}$/i.test(resolved || '') ? resolved : '#ffffff';
  return `<div class="colorctl" data-color="${path}">
    <div class="cc-top"><span>${esc(label)}</span>${o.none ? `<button type="button" class="cc-none ${!value || value === 'none' ? 'on' : ''}" data-cv="none" title="Aucune">∅</button>` : ''}</div>
    <div class="cc-row">${TOKENS.map(([t, l]) => `<button type="button" class="chip ${value === t ? 'on' : ''}" data-cv="${t}" title="${l} (thème)" style="--c:${theme[t.slice(1)] || '#fff'}"></button>`).join('')}
      <input type="color" value="${hex}" data-cpick aria-label="${esc(label)} personnalisée"><input class="input hex" value="${value && value[0] !== '$' && value !== 'none' ? esc(value) : ''}" placeholder="#hex" maxlength="9" data-chex spellcheck="false"></div></div>`;
}
export function syncRange(el, out) {
  el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
  const o = el.closest('.range')?.querySelector('output'); if (o && out != null) o.textContent = out;
}
export const pct = v => Math.round(v * 100) + ' %';
export const px = v => Math.round(v) + ' px';
export const deg = v => Math.round(v) + '°';

export function icon(name) {
  const P = {
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    shape: '<rect x="3" y="3" width="8" height="8" rx="1"/><circle cx="17" cy="17" r="4"/>',
    effect: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    emblem: '<path d="M12 2 Q13 11 22 12 Q13 13 12 22 Q11 13 2 12 Q11 11 12 2Z"/>',
    bg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/>',
    model: '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    select: '<path d="m4 3 7 17 2.5-7.5L21 10Z"/>',
    rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
    line: '<path d="M4 20 20 4"/>',
    star: '<path d="M12 2 Q13 11 22 12 Q13 13 12 22 Q11 13 2 12 Q11 11 12 2Z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alignL: '<path d="M4 3v18M8 7h12v4H8zM8 14h7v4H8z"/>', alignHC: '<path d="M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z"/>', alignR: '<path d="M20 3v18M4 7h12v4H4zM9 14h7v4H9z"/>',
    alignT: '<path d="M3 4h18M7 8v12h4V8zM14 8v7h4V8z"/>', alignVC: '<path d="M3 12h18M7 6v12h4V6zM14 8.5v7h4v-7z"/>', alignB: '<path d="M3 20h18M7 4v12h4V4zM14 9v7h4V9z"/>',
    distH: '<path d="M4 3v18M20 3v18M10 7h4v10h-4z"/>', distV: '<path d="M3 4h18M3 20h18M7 10h10v4H7z"/>',
    front: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>', back: '<rect x="4" y="4" width="12" height="12" rx="1"/><path d="M20 8v12H8"/>',
    flip: '<path d="M12 3v18M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z"/>',
    wand: '<path d="m15 4 5 5L9 20l-5-5Z"/><path d="M12 7l5 5"/><path d="M5 3v4M3 5h4M19 15v4M17 17h4"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}
