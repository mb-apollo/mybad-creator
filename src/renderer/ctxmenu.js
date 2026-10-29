// Menu clic droit sur l'affiche : copier / couper / coller, ordre des calques, verrouillage, alignement.
import { S, change, select, selected } from './state.js';
import { pickAt, copySelected, pasteLayers, duplicateSelected, deleteSelected, arrange, align, requestRender } from './editor.js';

let menu = null;
function close() { if (menu) { menu.remove(); menu = null; } }
function item(label, fn, o = {}) { return { label, fn, key: o.key, off: o.off, sep: o.sep }; }

export function initContextMenu(stage) {
  stage.addEventListener('contextmenu', e => {
    if (!S.doc) return;
    e.preventDefault();
    const L = pickAt(e), sel = selected(), has = sel.length > 0, locked = has && sel.every(l => l.locked);
    const flip = (k, v) => change(d => sel.forEach(x => { const t = d.layers.find(y => y.id === x.id); if (t) t[k] = v; }), { immediate: true });
    const rows = [
      item('Copier', () => copySelected(), { key: 'Ctrl+C', off: !has }),
      item('Couper', () => copySelected(true), { key: 'Ctrl+X', off: !has }),
      item('Coller', () => { if (!pasteLayers()) document.dispatchEvent(new CustomEvent('ctx:paste-image')); }, { key: 'Ctrl+V', off: !S.clipboard }),
      item('Dupliquer', () => duplicateSelected(), { key: 'Ctrl+D', off: !has }),
      item('Supprimer', () => deleteSelected(), { key: 'Suppr', off: !has || locked }),
      item('Tout sélectionner', () => select(S.doc.layers.filter(l => l.visible !== false && !l.locked && l.type !== 'bg' && !l.full).map(l => l.id)), { key: 'Ctrl+A', sep: true }),
      item('Passer au premier plan', () => arrange('front'), { key: 'Ctrl+Maj+]', off: !has, sep: true }),
      item("Monter d'un cran", () => arrange('up'), { key: 'Ctrl+]', off: !has }),
      item("Descendre d'un cran", () => arrange('down'), { key: 'Ctrl+[', off: !has }),
      item("Passer à l'arrière-plan", () => arrange('back'), { key: 'Ctrl+Maj+[', off: !has }),
      item(locked ? 'Déverrouiller' : 'Verrouiller', () => flip('locked', !locked), { off: !has, sep: true }),
      item('Masquer', () => { flip('visible', false); select([]); }, { off: !has }),
      item('Centrer horizontalement', () => align('hcenter'), { off: !has, sep: true }),
      item('Centrer verticalement', () => align('vcenter'), { off: !has }),
    ];
    close();
    menu = document.createElement('div'); menu.className = 'ctxmenu';
    menu.innerHTML = rows.map((r, i) => (r.sep ? '<div class="ctx-sep"></div>' : '') + `<button data-i="${i}" ${r.off ? 'disabled' : ''}><span>${r.label}</span><kbd>${r.key || ''}</kbd></button>`).join('');
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - h - 4)) + 'px';
    menu.onclick = ev => { const b = ev.target.closest('button[data-i]'); if (!b || b.disabled) return; const r = rows[+b.dataset.i]; close(); r.fn(); requestRender(); };
    void L;
  });
  window.addEventListener('pointerdown', e => { if (menu && !(e.target instanceof Node && menu.contains(e.target))) close(); }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
}
