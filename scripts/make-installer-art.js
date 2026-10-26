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
@font-face{font-family:M;font-weight:800;src:url('file:///${FONTS}/montserrat-latin-800-normal.woff2')}
@font-face{font-family:M;font-weight:600;src:url('file:///${FONTS}/montserrat-latin-600-normal.woff2')}
@font-face{font-family:M;font-weight:500;src:url('file:///${FONTS}/montserrat-latin-500-normal.woff2')}
@font-face{font-family:P;font-weight:500;src:url('file:///${FONTS}/ibm-plex-mono-latin-500-normal.woff2')}
</style><body style="margin:0"><canvas id="c"></canvas><script>
const S = ${S}, CY = '#35d6ff';
const rnd = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
async function art(kind, tagline) {
  await Promise.all(["800 10px M", "600 10px M", "500 10px M", "500 10px P"].map(f => document.fonts.load(f)));
  const icon = new Image(); icon.src = '${ICON}'; await icon.decode();
  const side = kind === 'side', W = (side ? 164 : 150) * S, H = (side ? 314 : 57) * S;
  const c = document.getElementById('c'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.scale(S, S);
  const w = W / S, h = H / S;
  const bg = x.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#080a15'); bg.addColorStop(0.55, '#0b1230'); bg.addColorStop(1, '#0a1f4a');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  const glow = x.createRadialGradient(w / 2, side ? 92 : 28, 0, w / 2, side ? 92 : 28, side ? 120 : 70);
  glow.addColorStop(0, 'rgba(53,214,255,.22)'); glow.addColorStop(1, 'rgba(53,214,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, w, h);
  const r = rnd(side ? 7 : 11);
  for (let i = 0; i < (side ? 46 : 14); i++) { x.fillStyle = 'rgba(190,225,255,' + (0.15 + r() * 0.5) + ')'; const s = r() < 0.15 ? 1.1 : 0.6; x.fillRect(r() * w, r() * h, s, s); }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  if (side) {
    const cx = w / 2, cy = 90;
    x.drawImage(icon, cx - 39, cy - 39, 78, 78);
    x.fillStyle = '#f5f7ff'; x.font = '800 30px M'; x.letterSpacing = '1px'; x.fillText('MYBAD', cx + 0.5, 172);
    x.fillStyle = CY; x.font = '600 10.5px M'; x.letterSpacing = '5px'; x.fillText('CREATOR', cx + 2.5, 192);
    x.fillStyle = 'rgba(53,214,255,.45)'; x.fillRect(cx - 14, 205, 28, 0.8);
    x.fillStyle = '#c9cfea'; x.font = '500 9.5px M'; x.letterSpacing = '0px';
    tagline.forEach((t, i) => x.fillText(t, cx, 226 + i * 14));
    x.fillStyle = '#5b6085'; x.font = '500 6.4px P'; x.letterSpacing = '0.6px'; x.fillText('POLARIS / NORTH STAR', cx, 293);
    x.fillText('MYBAD ESPORT', cx, 303);
  } else {
    x.drawImage(icon, 8, 11, 35, 35);
    x.textAlign = 'left';
    x.fillStyle = '#f5f7ff'; x.font = '800 15px M'; x.letterSpacing = '1px'; x.fillText('MYBAD', 50, 31);
    x.fillStyle = CY; x.font = '600 7.2px M'; x.letterSpacing = '3.4px'; x.fillText('CREATOR', 50, 43);
  }
  return c.toDataURL('image/png');
}
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 700, height: 1100, webPreferences: { offscreen: true } });
  fs.writeFileSync(path.join(__dirname, '.art.html'), PAGE);
  await win.loadFile(path.join(__dirname, '.art.html'));
  const jobs = [
    ['installerSidebar', 'side', ["L'éditeur d'affiches", 'de MyBad Esport'], 164, 314],
    ['uninstallerSidebar', 'side', ['À bientôt', 'sur le serveur MyBad'], 164, 314],
    ['installerHeader', 'head', [], 150, 57],
  ];
  for (const [name, kind, tag, w, h] of jobs) {
    const url = await win.webContents.executeJavaScript(`art(${JSON.stringify(kind)}, ${JSON.stringify(tag)})`);
    const img = nativeImage.createFromDataURL(url), size = img.getSize();
    fs.writeFileSync(path.join(ROOT, 'build', name + '.bmp'), bmp24(img.toBitmap(), size.width, size.height));
    console.log(name, size.width + 'x' + size.height, '(zone', w + 'x' + h + ')');
  }
  fs.unlinkSync(path.join(__dirname, '.art.html'));
  app.exit(0);
});
