// Génère les visuels de l'installateur NSIS (build/*.bmp) en haute définition (×3) avec les polices de la marque.
// L'assistant NSIS (Modern UI 2) étire ces bitmaps à la taille de leur zone : un ×3 reste net sur les écrans à forte densité.
// Usage : npx electron scripts/make-installer-art.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const S = 3; // facteur de définition
const FONTS = path.join(ROOT, 'src', 'renderer', 'fonts').replace(/\\/g, '/');
const ICON = 'file:///' + path.join(ROOT, 'build', 'icon.png').replace(/\\/g, '/');

// BMP 24 bits (lignes du bas vers le haut, alignées sur 4 octets) à partir d'un bitmap BGRA.
function bmp24(bgra, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4, size = row * h, out = Buffer.alloc(54 + size);
  out.write('BM', 0); out.writeUInt32LE(54 + size, 2); out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14); out.writeInt32LE(w, 18); out.writeInt32LE(h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28);
  out.writeUInt32LE(size, 34); out.writeInt32LE(2835, 38); out.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3;
    out[d] = bgra[s]; out[d + 1] = bgra[s + 1]; out[d + 2] = bgra[s + 2];
  }
  return out;
}

const PAGE = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:P;font-weight:500;src:url('file:///${FONTS}/ibm-plex-mono-latin-500-normal.woff2')}
</style><body style="margin:0"><canvas id="c"></canvas><script>
const S = ${S};
const UI = "'Segoe UI Variable Display','Segoe UI Variable Text','Segoe UI',sans-serif";
// Visuels de l'installateur : même matière que le logiciel (kit Liquid Glass) : bleu nuit, halos flous, morceau de verre avec liseré lumineux.
function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function halo(x, cx, cy, r, rgb, a) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
function glass(x, X, Y, W, H, R) {
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 20; x.shadowOffsetY = 9; rr(x, X, Y, W, H, R); x.fillStyle = 'rgba(14,22,52,.7)'; x.fill(); x.restore();
  rr(x, X, Y, W, H, R); const g = x.createLinearGradient(X, Y, X + W * 0.7, Y + H);
  g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.5, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,.13)'); x.fillStyle = g; x.fill();
  x.save(); rr(x, X, Y, W, H, R); x.clip();
  const b = x.createLinearGradient(0, Y + H - H * 0.4, 0, Y + H); b.addColorStop(0, 'rgba(84,216,255,0)'); b.addColorStop(1, 'rgba(84,216,255,.26)'); x.fillStyle = b; x.fillRect(X, Y + H - H * 0.4, W, H * 0.4);
  const t = x.createRadialGradient(X + W * 0.25, Y - 4, 0, X + W * 0.25, Y - 4, W * 0.95); t.addColorStop(0, 'rgba(255,255,255,.34)'); t.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = t; x.fillRect(X, Y, W, H);
  x.restore();
  rr(x, X + 0.5, Y + 0.5, W - 1, H - 1, R); const r = x.createLinearGradient(X, Y, X + W, Y + H);
  r.addColorStop(0, 'rgba(255,255,255,.85)'); r.addColorStop(0.3, 'rgba(255,255,255,.16)'); r.addColorStop(0.7, 'rgba(255,255,255,.07)'); r.addColorStop(1, 'rgba(160,230,255,.6)');
  x.strokeStyle = r; x.lineWidth = 1.1; x.stroke();
}
async function art(kind, tagline) {
  await Promise.all(['500 10px P', "600 10px 'Segoe UI Variable Display'", "400 10px 'Segoe UI Variable Text'"].map(f => document.fonts.load(f)));
  const icon = new Image(); icon.src = '${ICON}'; await icon.decode();
  const side = kind === 'side', W = (side ? 164 : 150) * S, H = (side ? 314 : 57) * S;
  const c = document.getElementById('c'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.scale(S, S);
  const w = W / S, h = H / S;
  x.fillStyle = '#090B17'; x.fillRect(0, 0, w, h);
  if (side) {
    halo(x, -10, 20, 150, '30,167,255', 0.55); halo(x, w + 30, 150, 120, '84,216,255', 0.34); halo(x, 50, h + 10, 150, '122,107,255', 0.4);
    halo(x, w / 2, 100, 74, '84,216,255', 0.3);
    glass(x, w / 2 - 44, 56, 88, 88, 24);
    x.drawImage(icon, w / 2 - 28, 72, 56, 56);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#F5F7FF'; x.font = '600 19px ' + UI; x.letterSpacing = '-0.2px'; x.fillText('Heliance Creator', w / 2, 188);
    x.fillStyle = 'rgba(232,235,250,.66)'; x.font = '400 9.6px ' + UI; x.letterSpacing = '0px';
    tagline.forEach((t, i) => x.fillText(t, w / 2, 208 + i * 14));
    x.fillStyle = 'rgba(165,171,203,.7)'; x.font = '500 6.2px P'; x.letterSpacing = '1.6px'; x.fillText('HELIANCE ESPORT', w / 2, 296);
  } else {
    halo(x, 22, 28, 70, '30,167,255', 0.5); halo(x, w - 10, 40, 60, '122,107,255', 0.32);
    glass(x, 10, 9, 39, 39, 12);
    x.drawImage(icon, 15, 14, 29, 29);
    x.textAlign = 'left'; x.fillStyle = '#F5F7FF'; x.font = '600 12.5px ' + UI; x.letterSpacing = '-0.1px'; x.fillText('Heliance Creator', 58, 32);
  }
  return c.toDataURL('image/png');
}
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 700, height: 1100, webPreferences: { offscreen: true } });
  fs.writeFileSync(path.join(__dirname, '.art.html'), PAGE);
  await win.loadFile(path.join(__dirname, '.art.html'));
  const jobs = [
    ['installerSidebar', 'side', ["L'éditeur d'affiches", 'de Heliance Esport'], 164, 314],
    ['uninstallerSidebar', 'side', ['À bientôt', 'sur le serveur Heliance Esport'], 164, 314],
    ['installerHeader', 'head', [], 150, 57],
  ];
  for (const [name, kind, tag, w, h] of jobs) {
    const url = await win.webContents.executeJavaScript(`art(${JSON.stringify(kind)}, ${JSON.stringify(tag)})`);
    const img = nativeImage.createFromDataURL(url), size = img.getSize();
    fs.writeFileSync(path.join(ROOT, 'build', name + '.bmp'), bmp24(img.toBitmap(), size.width, size.height));
    if (process.env.ART_PREVIEW) fs.writeFileSync(path.join(process.env.ART_PREVIEW, name + '.png'), img.toPNG());
    console.log(name, size.width + 'x' + size.height, '(zone', w + 'x' + h + ')');
  }
  fs.unlinkSync(path.join(__dirname, '.art.html'));
  app.exit(0);
});
