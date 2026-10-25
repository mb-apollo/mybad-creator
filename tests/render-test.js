// Lance l'app dans une fenêtre cachée, rend chaque modèle et enregistre des PNG + une planche.
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1500, height: 950, webPreferences: { contextIsolation: true } });
  const errors = [];
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await w.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 2500));
  const fmts = (process.env.FMTS || '4x5').split(',');
  const res = await w.webContents.executeJavaScript(`(async () => {
    const S = window.__studio; const out = {};
    for (const f of ${JSON.stringify(fmts)}) for (const k of Object.keys(S.TEMPLATES)) {
      const d = { ...S.doc, fmt: f };
      if (k === 'resultat' && '${process.env.LOSS||''}') d.T = { ...d.T, resMode: 'loss' };
      const c = document.createElement('canvas'); const t0 = performance.now();
      S.renderTo(c, d, S.images(), k, ${process.env.SCALE || 0.5});
      out[f + '-' + k] = { url: c.toDataURL('image/png'), ms: Math.round(performance.now() - t0) };
    }
    return out;
  })()`);
  for (const [k, v] of Object.entries(res)) { fs.writeFileSync(path.join(__dirname, '..', 'out', k + '.png'), Buffer.from(v.url.split(',')[1], 'base64')); console.log(k, v.ms + 'ms'); }
  const shot = await w.webContents.capturePage(); fs.writeFileSync(path.join(__dirname, '..', 'out', 'ui.png'), shot.toPNG());
  console.log('ERRORS', JSON.stringify(errors));
  app.quit();
});
