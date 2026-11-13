// Shared modal factory: a dimmed backdrop with one cream panel (header + close button + body).
import { html } from './format.js';
import { ICON } from './icons.js';

const modals = [];
export function makeModal({ title, icon, cls = '', sticky = false }) {
  const el = html(`
    <div class="backdrop ${cls}" data-ui>
      <div class="panel" data-ui>
        <div class="panel-head">
          <span class="ph-icon">${icon || ''}</span><h2>${title}</h2>
          <button class="x-btn pressable" data-ui aria-label="Close">${ICON.x}</button>
        </div>
        <div class="panel-body"></div>
      </div>
    </div>`);
  const m = {
    el, body: el.querySelector('.panel-body'), sticky,
    onOpen: null, onClose: null,
    get isOpen() { return el.classList.contains('open'); },
    open() {
      modals.forEach((o) => { if (o !== m && o.isOpen && !o.keep) o.close(); });
      el.classList.add('open'); m.onOpen && m.onOpen();
    },
    close() { if (!m.isOpen) return; el.classList.remove('open'); m.onClose && m.onClose(); },
  };
  el.querySelector('.x-btn').addEventListener('click', () => m.close());
  if (!sticky) el.addEventListener('click', (e) => { if (e.target === el) m.close(); });
  modals.push(m);
  document.getElementById('ui').appendChild(el);
  return m;
}


/** Close the open panel the player could close themselves (Esc key). Returns true if one was open. */
export function closeOpenModal() {
  const m = modals.find((o) => o.isOpen && !o.sticky);
  if (!m) return false;
  m.close();
  return true;
}
