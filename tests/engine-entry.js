import { newDocument, applyTemplate, renderDoc, FORMATS, setGameDefaults } from '../src/renderer/engine/render.js';
import { TEMPLATES } from '../src/renderer/engine/templates.js';
import { makeEnv } from '../src/renderer/engine/assets.js';
window.runTest = async (fmts, game) => {
  const fams = ['Space Grotesk','Montserrat','Anton','Barlow Condensed','Great Vibes','IBM Plex Mono'];
  await Promise.allSettled(fams.flatMap(f => [300,400,500,600,700,800,900].flatMap(w => [document.fonts.load(`${w} 40px "${f}"`), document.fonts.load(`italic ${w} 40px "${f}"`)])));
  const out = {};
  for (const fmt of fmts) for (const k of Object.keys(TEMPLATES)) for (const script of [true,false]) {
    if (!script && !['matchday','roster'].includes(k)) continue;
    const d = newDocument(); d.fmt = fmt; d.script = script; if (game) setGameDefaults(d, game);
    applyTemplate(d, k);
    const c = document.createElement('canvas'); const t0 = performance.now();
    renderDoc(c, d, makeEnv(d, new Map()), 0.5);
    out[`${fmt}-${k}${script?'':'-plain'}`] = { url: c.toDataURL('image/png'), ms: Math.round(performance.now()-t0) };
  }
  return out;
};
