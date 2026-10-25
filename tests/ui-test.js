const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1500, height: 950 });
  const errors = [];
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await w.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 2500));
  const run = js => w.webContents.executeJavaScript(js);
  // image de test : photo dégradée avec formes
  await run(`(async()=>{const c=document.createElement('canvas');c.width=900;c.height=1100;const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,900,1100);g.addColorStop(0,'#ff4fa0');g.addColorStop(1,'#3020ff');x.fillStyle=g;x.fillRect(0,0,900,1100);
    x.fillStyle='#ffe2c0';x.beginPath();x.arc(450,380,160,0,7);x.fill();x.fillStyle='#222';x.fillRect(250,560,400,540);
    const S=window.__studio; const d=S.doc; d.images.keyart=c.toDataURL('image/png'); d.tpl='gameday'; S.doc=d; await S.ensureImages(); S.buildAll(); S.requestRender(); })()`);
  await new Promise(r => setTimeout(r, 800));
  for (const t of ['images','images']) {
    await run(`document.querySelector('.tabs [data-tab="${t}"]').click()`);
    await new Promise(r => setTimeout(r, 600));
    fs.writeFileSync(path.join(__dirname, '..', 'out', 'ui-' + t + '.png'), (await w.webContents.capturePage()).toPNG());
  }
  console.log('ERRORS', JSON.stringify(errors));
  app.quit();
});
