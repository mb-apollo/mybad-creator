// Installe la version MyBad de la page d'assistant NSIS (pages sombres) avant la construction.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'build', 'nsis', 'assistedInstaller.nsh');
const dst = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'assistedInstaller.nsh');
const orig = dst + '.orig';
if (!fs.existsSync(orig)) fs.copyFileSync(dst, orig);
fs.copyFileSync(src, dst);
// Page « Pour qui installer ? » : on l'assombrit aussi avant son affichage
const mu = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'multiUserUi.nsh');
const muOrig = mu + '.orig';
if (!fs.existsSync(muOrig)) fs.copyFileSync(mu, muOrig);
let txt = fs.readFileSync(muOrig, 'utf8');
txt = txt.replace(/(\n(\s*)nsDialogs::Show)/, '\n$2!ifmacrodef MB_DARK_INNER\n$2  !insertmacro MB_DARK_INNER\n$2!endif$1');
fs.writeFileSync(mu, txt);
console.log('Assistant NSIS MyBad installé');
