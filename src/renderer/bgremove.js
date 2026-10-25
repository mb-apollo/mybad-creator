// Détourage automatique hors ligne (modèle ISNet via onnxruntime-web, fichiers fournis avec le logiciel).
import { removeBackground as imgly } from '@imgly/background-removal';

export async function removeBackground(dataUrl, onProgress) {
  const blob = await (await fetch(dataUrl)).blob();
  const publicPath = new URL('bgremoval/', location.href).href;
  let last = 0;
  const out = await imgly(blob, {
    debug: !!window.__bgdebug,
    publicPath, model: 'small', proxyToWorker: false,
    output: { format: 'image/png', quality: 1 },
    progress: (key, cur, total) => {
      const p = key.startsWith('fetch') ? 0.5 * cur / total : key.startsWith('compute') ? 0.5 + 0.5 * cur / total : last;
      last = p; onProgress?.(p);
    },
  });
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(out); });
}
