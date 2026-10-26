// Masques au pinceau des calques : un canvas dont l'opacité décide ce qui reste visible (opaque = visible).
// Le masque est enregistré en PNG dans les images du document (clé « mask-<id du calque> »).
const MASKS = new Map(); // id du calque -> { src (URL enregistrée), canvas, painting }
const SIZE = 768;        // taille du masque sur son grand côté

export const maskKey = L => 'mask-' + L.id;

// Canvas du masque d'un calque, rechargé depuis le document si l'historique l'a changé.
export function maskCanvas(L, env) {
  if (!L.mask) return null;
  const m = MASKS.get(L.id), url = env.url ? env.url(L.mask) : null;
  if (m && (m.painting || m.src === url)) return m.canvas;
  const im = env.image(L.mask);
  if (!im) return m ? m.canvas : null; // en chargement : on garde l'ancien le temps de décoder
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0);
  MASKS.set(L.id, { src: url, canvas: cv, painting: false });
  return cv;
}

// Canvas à peindre : créé (entièrement visible) au premier coup de pinceau.
export function paintableMask(L, b, env) {
  let cv = maskCanvas(L, env);
  if (!cv) {
    const k = SIZE / Math.max(b.w, b.h);
    cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.round(b.w * k)); cv.height = Math.max(8, Math.round(b.h * k));
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  }
  MASKS.set(L.id, { src: null, canvas: cv, painting: true });
  return cv;
}

// Un coup de pinceau rond à (lx, ly), coordonnées du calque depuis son centre, rayon r en pixels de l'affiche.
export function stamp(cv, b, lx, ly, r, erase, hard, flow) {
  const c = cv.getContext('2d'), sx = cv.width / b.w, sy = cv.height / b.h;
  c.save();
  c.translate((lx + b.w / 2) * sx, (ly + b.h / 2) * sy); c.scale(sx, sy);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(0,0,0,${flow})`); g.addColorStop(Math.min(0.99, hard), `rgba(0,0,0,${flow})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

// Fin du trait : le masque est écrit dans le document (appelé dans change()).
export function commitMask(L, doc, cv) {
  const url = cv.toDataURL('image/png');
  doc.assets = { ...doc.assets, [maskKey(L)]: url };
  L.mask = 'u:' + maskKey(L);
  MASKS.set(L.id, { src: url, canvas: cv, painting: false });
}
export function clearMask(L, doc) {
  const a = { ...doc.assets }; delete a[maskKey(L)]; doc.assets = a;
  L.mask = null; MASKS.delete(L.id);
}
