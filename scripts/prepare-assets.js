// Copie les fichiers lourds depuis node_modules (détourage hors ligne, décodeur 3D) avant la construction.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const nm = p => path.join(root, 'node_modules', p);

const bgSrc = nm('@imgly/background-removal-data/dist');
const bgDst = path.join(root, 'src/renderer/bgremoval');
const keep = ['/models/small', '/onnxruntime-web/ort-wasm-simd.wasm', '/onnxruntime-web/ort-wasm-simd-threaded.wasm', '/onnxruntime-web/ort-wasm.wasm'];
const res = JSON.parse(fs.readFileSync(path.join(bgSrc, 'resources.json'), 'utf8'));
fs.mkdirSync(bgDst, { recursive: true });
const out = {};
for (const k of keep) {
  out[k] = res[k];
  for (const c of res[k].chunks) {
    const dst = path.join(bgDst, c.hash);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(bgSrc, c.hash), dst);
  }
}
fs.writeFileSync(path.join(bgDst, 'resources.json'), JSON.stringify(out));

const dracoDst = path.join(root, 'src/renderer/vendor/draco');
fs.mkdirSync(dracoDst, { recursive: true });
for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) fs.copyFileSync(nm('three/examples/jsm/libs/draco/' + f), path.join(dracoDst, f));
console.log('Ressources préparées');
