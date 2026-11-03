// Boot, config check, hash router, tab bar and inbox badge, service worker registration.
import { apiGet, loadConfig } from './api.js';
import { h, errorState, tabLinks } from './ui.js';

const SCREENS = ['home', 'inbox', 'transactions', 'insights', 'settings', 'setup'];
const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

let current = 'home';
let badge = 0;

function routeName() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return SCREENS.includes(name) ? name : 'home';
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function drawTabs(name, cfg) {
  tabbar.hidden = !cfg || name === 'setup';
  tabbar.replaceChildren(...tabLinks({ current: name, badge }));
}

async function refreshBadge() {
  try {
    badge = Number((await apiGet('pending_count')).count) || 0;
  } catch {
    // keep the last count
  }
  drawTabs(current, loadConfig());
}

async function route() {
  const cfg = loadConfig();
  const name = routeName();
  if (!cfg && name !== 'setup') {
    navigate('#/setup');
    return;
  }
  current = name;
  // A fresh root per navigation: a slow render for the previous screen writes into a detached node.
  const root = h('div', { class: 'screen' });
  view.replaceChildren(root);
  window.scrollTo(0, 0);
  drawTabs(name, cfg);
  try {
    const mod = await import(`./screens/${name}.js`);
    await mod.render(root, { navigate, refreshBadge, cfg });
  } catch {
    root.replaceChildren(errorState({ message: 'This screen failed to load', onRetry: () => route() }));
  }
}

function registerServiceWorker() {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if (secure && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

window.addEventListener('hashchange', route);
registerServiceWorker();
route();
if (loadConfig()) refreshBadge();
