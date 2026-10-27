// MyBad Creator — processus principal : fenêtre, menus, fichiers, bibliothèque, mises à jour.
const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, nativeImage, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

app.setName('MyBad Creator');
app.setAppUserModelId('fr.mybadesport.creator');

protocol.registerSchemesAsPrivileged([{ scheme: 'mbc', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let win = null;
let dirty = false;
let pendingOpen = null;
const RENDERER = path.join(__dirname, '..', 'renderer');
const LIB = () => path.join(app.getPath('userData'), 'library');
const PACK = () => path.join(app.getPath('userData'), 'pack3d');
const PACK_URL = 'https://raw.githubusercontent.com/mb-apollo/mybad-creator/pack-3d/';
const STORE = () => path.join(app.getPath('userData'), 'store.json');
function readStore() { try { return JSON.parse(fs.readFileSync(STORE(), 'utf8')); } catch { return {}; } }
function writeStore(s) { fs.mkdirSync(path.dirname(STORE()), { recursive: true }); fs.writeFileSync(STORE(), JSON.stringify(s)); }
function fileFromArgs(argv) { return argv.find(a => /\.mybad$/i.test(a) && fs.existsSync(a)) || null; }

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const f = fileFromArgs(argv);
  if (f) win.webContents.send('open-path', f);
});

function send(cmd) { if (win) win.webContents.send('menu', cmd); }
function buildMenu() {
  const recent = (readStore().recent || []).slice(0, 8);
  const tpl = [
    { label: 'Fichier', submenu: [
      { label: 'Nouveau projet', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { label: 'Projets récents', submenu: recent.length ? recent.map(p => ({ label: p, click: () => win.webContents.send('open-path', p) })) : [{ label: 'Aucun', enabled: false }] },
      { type: 'separator' },
      { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
      { type: 'separator' },
      { label: 'Importer une image…', accelerator: 'CmdOrCtrl+I', click: () => send('importImage') },
      { label: 'Exporter l\'affiche…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
      { label: 'Exporter dans les 3 formats…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('exportAll') },
      { type: 'separator' },
      { label: 'Kit de marque…', click: () => send('kit') },
      { type: 'separator' },
      { label: 'Quitter', role: 'quit' },
    ] },
    { label: 'Édition', submenu: [
      { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
      { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
      { label: 'Rétablir ', accelerator: 'CmdOrCtrl+Shift+Z', visible: false, click: () => send('redo') },
      { type: 'separator' },
      { label: 'Couper', role: 'cut' }, { label: 'Copier', role: 'copy' }, { label: 'Coller', role: 'paste' },
      { type: 'separator' },
      { label: 'Copier l\'affiche (image)', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('copyImage') },
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Ajuster à la fenêtre', accelerator: 'CmdOrCtrl+0', click: () => send('zoomFit') },
      { label: 'Taille réelle (100 %)', click: () => send('zoom100') },
      { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', click: () => send('zoomIn') },
      { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: () => send('zoomOut') },
      { type: 'separator' },
      { label: 'Plein écran', role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ label: 'Outils de développement', role: 'toggleDevTools' }, { label: 'Recharger', role: 'reload' }]),
    ] },
    { label: 'Aide', submenu: [
      { label: 'Raccourcis clavier', accelerator: 'F1', click: () => send('shortcuts') },
      { label: 'Rechercher des mises à jour…', click: () => send('updates') },
      { label: 'Site MyBad Esport', click: () => shell.openExternal('https://mybadesport.fr') },
      { type: 'separator' },
      { label: `À propos de MyBad Creator (v${app.getVersion()})`, click: () => send('about') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
function addRecent(p) { const s = readStore(); s.recent = [p, ...(s.recent || []).filter(x => x !== p)].slice(0, 8); writeStore(s); buildMenu(); }

function createWindow() {
  win = new BrowserWindow({
    width: 1560, height: 940, minWidth: 1180, minHeight: 720,
    backgroundColor: '#06070D', show: false, title: 'MyBad Creator',
    icon: path.join(RENDERER, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL('mbc://app/index.html');
  win.once('ready-to-show', () => { win.maximize(); win.show(); if (process.env.MBC_SHOT) devShot(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('mbc://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('close', e => {
    if (!dirty || quittingForUpdate) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Quitter sans enregistrer', 'Annuler'], defaultId: 1, cancelId: 1,
      title: 'Modifications non enregistrées', message: 'Le projet contient des modifications non enregistrées.',
      detail: 'Ta session reste récupérable au prochain lancement, mais le fichier .mybad ne sera pas mis à jour.',
    });
    if (r !== 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // mbc://app/...      → fichiers de l'interface
  // mbc://app/lib/...  → bibliothèque de l'utilisateur (renders, modèles 3D)
  protocol.handle('mbc', req => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    let base = RENDERER;
    if (rel.startsWith('lib/')) { base = LIB(); rel = rel.slice(4); }
    else if (rel.startsWith('pack/')) { base = PACK(); rel = rel.slice(5); }
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(path.normalize(base))) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  pendingOpen = fileFromArgs(process.argv);
  buildMenu();
  createWindow();
  setupUpdater();
});
app.on('window-all-closed', () => app.quit());

// ---------------------------------------------------------------- IPC
const PROJECT_FILTER = [{ name: 'Projet MyBad Creator', extensions: ['mybad'] }];
ipcMain.handle('app:info', () => ({ version: app.getVersion(), pendingOpen, packaged: app.isPackaged }));
ipcMain.on('doc:dirty', (_e, v) => { dirty = !!v; });
ipcMain.on('win:title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.handle('store:get', (_e, key) => readStore()[key]);
ipcMain.handle('store:set', (_e, key, value) => { const s = readStore(); s[key] = value; writeStore(s); return true; });

ipcMain.handle('project:save', async (_e, { filePath, data, suggested }) => {
  let p = filePath;
  if (!p) {
    const r = await dialog.showSaveDialog(win, { title: 'Enregistrer le projet', defaultPath: path.join(app.getPath('documents'), (suggested || 'affiche') + '.mybad'), filters: PROJECT_FILTER });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  fs.writeFileSync(p, data, 'utf8'); addRecent(p); return p;
});
ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Ouvrir un projet', properties: ['openFile'], filters: PROJECT_FILTER });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0]; addRecent(p);
  return { filePath: p, data: fs.readFileSync(p, 'utf8') };
});
// Fichiers texte simples (configuration du Studio de poses)
ipcMain.handle('text:save', async (_e, { data, suggested }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Enregistrer la configuration de poses', defaultPath: path.join(app.getPath('documents'), suggested || 'poses-mybad.json'), filters: [{ name: 'Configuration de poses', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, data, 'utf8'); return r.filePath;
});
ipcMain.handle('text:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Importer une configuration de poses', properties: ['openFile'], filters: [{ name: 'Configuration de poses', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { filePath: r.filePaths[0], data: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('project:openPath', async (_e, p) => {
  try { const data = fs.readFileSync(p, 'utf8'); addRecent(p); return { filePath: p, data }; } catch { return { error: 'Fichier introuvable : ' + p }; }
});
ipcMain.handle('export:image', async (_e, { base64, name, ext }) => {
  const filters = ext === 'jpg' ? [{ name: 'Image JPEG', extensions: ['jpg'] }] : [{ name: 'Image PNG', extensions: ['png'] }];
  const s = readStore();
  const r = await dialog.showSaveDialog(win, { title: 'Exporter l\'affiche', defaultPath: path.join(s.exportDir || app.getPath('pictures'), name + '.' + ext), filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(base64, 'base64'));
  s.exportDir = path.dirname(r.filePath); writeStore(s);
  return r.filePath;
});
ipcMain.handle('export:pickFolder', async () => {
  const s = readStore();
  const r = await dialog.showOpenDialog(win, { title: 'Choisir le dossier d\'export', defaultPath: s.exportDir || app.getPath('pictures'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  s.exportDir = r.filePaths[0]; writeStore(s); return r.filePaths[0];
});
ipcMain.handle('export:writeInFolder', (_e, { folder, name, base64 }) => { const p = path.join(folder, name); fs.writeFileSync(p, Buffer.from(base64, 'base64')); return p; });
ipcMain.handle('shell:show', (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('clipboard:image', (_e, dataUrl) => { clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)); return true; });
ipcMain.handle('confirm', async (_e, { message, detail, ok }) => {
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: [ok || 'Continuer', 'Annuler'], defaultId: 0, cancelId: 1, message, detail });
  return r.response === 0;
});

// ---------------------------------------------------------------- bibliothèque
const safe = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
ipcMain.handle('library:list', () => {
  const out = { png: {}, glb: {}, extra: readStore().libraryExtra || [] };
  const add = (base, urlBase) => {
    if (!fs.existsSync(base)) return;
    for (const game of fs.readdirSync(base)) {
      const dir = path.join(base, game);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(/^(.+)\.(png|webp|jpg|glb|gltf)$/i); if (!m) continue;
        const st = fs.statSync(path.join(dir, f));
        const kind = /glb|gltf/i.test(m[2]) ? 'glb' : 'png';
        out[kind][`g:${game}:${m[1]}`] = `${urlBase}${game}/${encodeURIComponent(f)}?v=${Math.round(st.mtimeMs)}`;
      }
    }
  };
  add(path.join(RENDERER, 'assets', 'games'), 'mbc://app/assets/games/');
  add(PACK(), 'mbc://app/pack/');
  add(LIB(), 'mbc://app/lib/');
  return out;
});
ipcMain.handle('library:import', (_e, { game, key, kind, path: src }) => {
  const dir = path.join(LIB(), safe(game)); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    const isModel = /\.(glb|gltf)$/i.test(f);
    if (f.replace(/\.[^.]+$/, '') === safe(key) && (kind === 'glb') === isModel) fs.rmSync(path.join(dir, f));
  }
  if (/\.zip$/i.test(src)) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(src);
    const entries = zip.getEntries().filter(e => /\.(glb)$/i.test(e.entryName)).sort((a, b) => b.header.size - a.header.size);
    if (!entries.length) throw new Error('Aucun fichier .glb dans cette archive.');
    fs.writeFileSync(path.join(dir, safe(key) + '.glb'), entries[0].getData());
    return true;
  }
  const ext = path.extname(src).toLowerCase() || (kind === 'glb' ? '.glb' : '.png');
  fs.copyFileSync(src, path.join(dir, safe(key) + ext));
  return true;
});
ipcMain.handle('library:delete', (_e, { game, key }) => {
  const dir = path.join(LIB(), safe(game)); if (!fs.existsSync(dir)) return true;
  for (const f of fs.readdirSync(dir)) if (f.replace(/\.[^.]+$/, '') === safe(key)) fs.rmSync(path.join(dir, f));
  return true;
});
// ---------------------------------------------------------------- pack 3D (téléchargé depuis GitHub)
function packState() { try { return JSON.parse(fs.readFileSync(path.join(PACK(), 'installed.json'), 'utf8')); } catch { return null; } }
ipcMain.handle('pack:status', async () => {
  const local = packState();
  let remote = null;
  try { const r = await net.fetch(PACK_URL + 'index.json', { cache: 'no-store' }); if (r.ok) remote = await r.json(); } catch { /* hors ligne */ }
  const total = remote ? remote.files.reduce((s, f) => s + f.size, 0) : null;
  return { installed: local ? local.version : null, latest: remote ? remote.version : null, total, count: remote ? remote.files.length : null };
});
let packBusy = false;
ipcMain.handle('pack:download', async () => {
  if (packBusy) return { error: 'Téléchargement déjà en cours' };
  packBusy = true;
  const crypto = require('crypto');
  const send = d => win && win.webContents.send('pack-progress', d);
  try {
    const idx = await (await net.fetch(PACK_URL + 'index.json', { cache: 'no-store' })).json();
    const total = idx.files.reduce((s, f) => s + f.size, 0);
    let done = 0;
    for (const f of idx.files) {
      const dst = path.join(PACK(), f.game, f.key + '.glb');
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const ok = fs.existsSync(dst) && crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex') === f.sha256;
      if (!ok) {
        let buf = null;
        for (let attempt = 0; attempt < 3 && !buf; attempt++) {
          try {
            const r = await net.fetch(PACK_URL + f.path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const reader = r.body.getReader(); const chunks = []; let got = 0;
            for (;;) {
              const { done: end, value } = await reader.read(); if (end) break;
              chunks.push(Buffer.from(value)); got += value.length;
              send({ done: done + got, total, file: f.key });
            }
            const b = Buffer.concat(chunks);
            if (crypto.createHash('sha256').update(b).digest('hex') !== f.sha256) throw new Error('fichier corrompu');
            buf = b;
          } catch (e) { if (attempt === 2) throw new Error(`${f.key} : ${e.message}`); }
        }
        fs.writeFileSync(dst, buf);
      }
      done += f.size;
      send({ done, total, file: f.key });
    }
    fs.writeFileSync(path.join(PACK(), 'installed.json'), JSON.stringify({ version: idx.version, date: new Date().toISOString() }));
    return { ok: true, version: idx.version };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { packBusy = false; }
});

ipcMain.handle('library:extra', (_e, list) => { const s = readStore(); s.libraryExtra = list; writeStore(s); return true; });
ipcMain.handle('library:open', () => { fs.mkdirSync(LIB(), { recursive: true }); shell.openPath(LIB()); return true; });

// ---------------------------------------------------------------- mises à jour (GitHub Releases)
let quittingForUpdate = false;
function setupUpdater() {
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { console.error(e); }
  const friendly = msg => /404|latest\.yml|No published versions|Unable to find latest version/i.test(msg) ? 'aucune version n\'est encore publiée sur GitHub.'
    : /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::ERR/i.test(msg) ? 'pas de connexion internet.' : msg.split('\n')[0].slice(0, 160);
  const emit = d => win && win.webContents.send('update', d.error ? { ...d, error: friendly(d.error) } : d);
  let silent = false;
  ipcMain.handle('update:check', async (_e, isSilent) => {
    if (!app.isPackaged || !autoUpdater) { emit({ state: 'dev', silent: true }); return; }
    silent = !!isSilent;
    try { await autoUpdater.checkForUpdates(); } catch (err) { emit({ state: 'error', error: String(err.message || err), silent }); }
  });
  ipcMain.handle('update:download', async () => { try { await autoUpdater.downloadUpdate(); } catch (err) { emit({ state: 'error', error: String(err.message || err) }); } });
  ipcMain.handle('update:install', () => { quittingForUpdate = true; setImmediate(() => autoUpdater.quitAndInstall(false, true)); });
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', silent }));
  autoUpdater.on('update-available', i => emit({ state: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<script[\s\S]*?<\/script>/gi, '') : '', silent: false }));
  autoUpdater.on('update-not-available', () => emit({ state: 'none', silent }));
  autoUpdater.on('download-progress', p => emit({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', i => emit({ state: 'downloaded', version: i.version }));
  autoUpdater.on('error', err => emit({ state: 'error', error: String(err && err.message || err), silent }));
}

// Captures automatiques pour les tests (inactif en usage normal)
async function devShot() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(+process.env.MBC_WAIT || 5000);
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg.slice(0, 300)); });
  const steps = JSON.parse(process.env.MBC_STEPS || '[]');
  let i = 0;
  for (const st of steps) {
    try { if (st.js) await win.webContents.executeJavaScript(st.js); } catch (e) { console.log('JS ERR', e.message); }
    await wait(st.wait || 1200);
    if (st.shot) { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(process.env.MBC_SHOT, (st.name || ('shot' + i)) + '.png'), img.toPNG()); }
    i++;
  }
  app.exit(0);
}
