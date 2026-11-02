// Construit l'installateur sur mesure : compile Installateur.cs (csc.exe de Windows, rien à installer) et y embarque le vrai installateur NSIS.
// Usage : node installer-ui/build.js <installateur-NSIS.exe> [--config <electron-builder.yml>] [--sortie <fichier.exe>] [--apercu <page> <png>]
//   Les mises à jour automatiques continuent d'utiliser l'installateur NSIS tel quel ; cet exe est celui qu'on donne pour une première installation.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const racine = path.join(__dirname, '..');
const args = process.argv.slice(2);
const val = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
const moteur = args.find(a => !a.startsWith('--') && /\.exe$/i.test(a));
if (!moteur || !fs.existsSync(moteur)) { console.error("Donne l'installateur NSIS à embarquer : node installer-ui/build.js <MyBad-Creator-Setup-x.y.z.exe>"); process.exit(1); }

const config = val('--config', path.join(racine, 'electron-builder.yml'));
const yml = fs.readFileSync(config, 'utf8');
const lire = (cle, defaut) => { const m = new RegExp('^\\s*' + cle + ':\\s*(.+?)\\s*$', 'm').exec(yml); return m ? m[1].replace(/^["']|["']$/g, '') : defaut; };
const appId = lire('appId', 'fr.mybadesport.creator');
const executable = lire('executableName', 'MyBadCreator');
const nomRaccourci = lire('shortcutName', lire('productName', 'MyBad Creator'));
const version = require(path.join(racine, 'package.json')).version;

// identifiant de la clé de registre du logiciel : UUID v5 de l'appId (même calcul qu'electron-builder)
function uuid5(nom, ns) {
  const nsb = Buffer.from(ns.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1').update(nsb).update(Buffer.from(nom, 'utf8')).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const guid = uuid5(appId, '50e065bc-3134-11e6-9bab-38c9862bdaf3');

// taille installée (pour la barre de progression) : le dossier « win-unpacked » de la construction, sinon une estimation
function taille(dir) { let t = 0; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); t += f.isDirectory() ? taille(p) : fs.statSync(p).size; } return t; }
const unpacked = path.join(path.dirname(moteur), 'win-unpacked');
const octets = fs.existsSync(unpacked) ? taille(unpacked) : 350000000;

const sortie = val('--sortie', path.join(path.dirname(moteur), `MyBad-Creator-Installateur-${version}.exe`));
const travail = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mbc-inst-'));
const constantes = path.join(travail, 'Constantes.cs');
fs.writeFileSync(constantes, `namespace MyBadInstallateur { static class K {
  public const string Version = "${version}"; public const string Guid = "${guid}"; public const long Octets = ${octets}L;
  public const string Dossier = "${executable}"; public const string Exe = "${executable}.exe"; public const string Raccourci = "${nomRaccourci.replace(/"/g, '')}";
} }\n`);

const net = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319';
const csc = path.join(net, 'csc.exe');
if (!fs.existsSync(csc)) { console.error('csc.exe introuvable : le .NET Framework 4.x est requis (il est fourni avec Windows).'); process.exit(1); }
const wpf = path.join(net, 'WPF');
const refs = ['PresentationFramework', 'PresentationCore', 'WindowsBase'].map(n => `/r:${path.join(wpf, n + '.dll')}`)
  .concat([`/r:${path.join(net, 'System.Xaml.dll')}`, `/r:${path.join(net, 'System.Windows.Forms.dll')}`, `/r:${path.join(net, 'System.Drawing.dll')}`]);
const r = spawnSync(csc, ['/nologo', '/target:winexe', '/optimize+', `/out:${sortie}`, `/win32icon:${path.join(racine, 'build', 'icon.ico')}`, ...refs,
  `/resource:${moteur},moteur.exe`, `/resource:${path.join(racine, 'build', 'icon.png')},icone.png`,
  path.join(__dirname, 'Installateur.cs'), constantes], { encoding: 'utf8' });
fs.rmSync(travail, { recursive: true, force: true });
if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(r.status || 1); }
console.log(`Installateur créé : ${sortie}  (${(fs.statSync(sortie).size / 1048576).toFixed(0)} Mo, installé ≈ ${(octets / 1048576).toFixed(0)} Mo, clé ${guid})`);
