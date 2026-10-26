// Résolution des images (renders de la bibliothèque, images importées) et repères visuels d'attente.
import { itemName } from './games.js';
import { rrect, rgba } from './util.js';
import { color } from './scene.js';

const CACHE = new Map(); // url -> HTMLImageElement
export function loadImage(url) {
  if (!url) return null;
  let im = CACHE.get(url);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    CACHE.set(url, im);
    im.onload = () => { for (const fn of LISTENERS) fn(url); };
    im.src = url;
  }
  return im.complete && im.naturalWidth ? im : null;
}
const LISTENERS = new Set();
export function onImageLoaded(fn) { LISTENERS.add(fn); return () => LISTENERS.delete(fn); }
export function whenLoaded(urls) {
  return Promise.all(urls.filter(Boolean).map(u => new Promise(res => {
    const im = CACHE.get(u) || (loadImage(u), CACHE.get(u));
    if (im.complete) res(); else { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); }
  })));
}

// Clé d'image d'un calque → URL à charger.
export function assetUrl(doc, asset, library) {
  if (!asset) return null;
  if (asset[0] === '@') {
    const item = doc.T[asset.slice(1)];
    return item ? library.get(`g:${doc.game}:${item}`) || null : null;
  }
  if (asset.startsWith('u:')) return doc.assets[asset.slice(2)] || null;
  if (asset.startsWith('g:')) return library.get(asset) || null;
  return null;
}
export function docImageUrls(doc, library) {
  return doc.layers.filter(L => L.type === 'image' && L.asset).map(L => assetUrl(doc, L.asset, library)).filter(Boolean);
}

export function makeEnv(doc, library, opts = {}) {
  return {
    exporting: !!opts.exporting,
    extraItems: opts.extraItems || [],
    model3d: opts.model3d || null,
    url: asset => assetUrl(doc, asset, library),
    image: asset => {
      if (opts.override && opts.override[asset]) return opts.override[asset];
      return loadImage(assetUrl(doc, asset, library));
    },
    placeholder(c, L, b) {
      if (this.exporting && L.ph !== 'logo') return;
      const th = doc.theme, u = Math.min(doc.W, doc.H * 0.8) / 1080;
      if (L.ph === 'logo') {
        const s = Math.min(b.w, b.h), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        c.save(); c.strokeStyle = color('$text', th); c.lineWidth = Math.max(2, s * 0.05); c.lineJoin = 'round';
        c.beginPath(); c.moveTo(cx - s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy - s * .42); c.lineTo(cx + s * .38, cy + s * .02);
        c.quadraticCurveTo(cx + s * .3, cy + s * .3, cx, cy + s * .46); c.quadraticCurveTo(cx - s * .3, cy + s * .3, cx - s * .38, cy + s * .02); c.closePath(); c.stroke();
        [-0.12, 0.08].forEach(oy => { c.beginPath(); c.moveTo(cx - s * .2, cy + s * oy - s * .06); c.lineTo(cx, cy + s * oy + s * .08); c.lineTo(cx + s * .2, cy + s * oy - s * .06); c.stroke(); });
        c.restore();
        return;
      }
      // Render manquant : cadre discret + nom de l'agent / de la voiture
      const key = L.asset && L.asset[0] === '@' ? doc.T[L.asset.slice(1)] : '';
      const name = (itemName(doc.game, key || (L.model && L.model[0] === '@' ? doc.T[L.model.slice(1)] : (L.model || '').split(':')[2]), this.extraItems) || (L.ph === 'model' ? 'Modèle 3D' : 'Render')).toUpperCase();
      c.save();
      c.setLineDash([10 * u, 8 * u]);
      c.strokeStyle = rgba(th.accent, 0.35); c.lineWidth = 2 * u;
      const ix = b.x + b.w * 0.12, iw = b.w * 0.76;
      rrect(c, ix, b.y + b.h * 0.08, iw, b.h * 0.9, 16 * u); c.stroke();
      c.setLineDash([]);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, rgba(th.glow, 0.12)); g.addColorStop(1, rgba(th.glow, 0.02));
      c.fillStyle = g; rrect(c, ix, b.y + b.h * 0.08, iw, b.h * 0.9, 16 * u); c.fill();
      c.translate(b.x + b.w / 2, b.y + b.h * 0.53); c.rotate(-Math.PI / 2);
      c.font = `700 ${Math.min(iw * 0.5, b.h * 0.12)}px "Space Grotesk"`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.letterSpacing = `${0.1 * Math.min(iw * 0.5, b.h * 0.12)}px`;
      c.strokeStyle = rgba(th.text, 0.35); c.lineWidth = 1.5 * u; c.strokeText(name, 0, 0);
      c.letterSpacing = '0px';
      c.restore();
      if (b.w < 300 * u) return;
      c.save();
      c.font = `500 ${15 * u}px "Space Grotesk"`; c.fillStyle = rgba(th.muted, 0.8); c.textAlign = 'center';
      c.fillText(L.ph === 'model' ? 'Ajoute le modèle .glb dans la Bibliothèque' : 'Ajoute ce render dans la Bibliothèque', b.x + b.w / 2, b.y + b.h * 0.95);
      c.restore();
    },
  };
}
