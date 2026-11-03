// First run: API URL and token, a connection test, then save and go home.
import { button, field, h, pageHead, textInput } from '../ui.js';
import { errorMessage, loadConfig, saveConfig, testConnection } from '../api.js';

function defaultUrl() {
  return location.hostname === 'localhost' ? `${location.origin}/api` : '';
}

function isWebUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function render(root, ctx) {
  const saved = loadConfig();
  const urlInput = textInput({
    value: saved?.url || defaultUrl(),
    type: 'url',
    dir: 'ltr',
    inputmode: 'url',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'https://script.google.com/macros/s/…/exec',
  });
  const tokenInput = textInput({
    value: saved?.token || '',
    type: 'password',
    dir: 'ltr',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const status = h('p', { class: 'status', role: 'status' });
  const setStatus = (state, text) => {
    status.dataset.state = state;
    status.textContent = text;
  };

  // Returns { url, token } when both fields are valid, otherwise shows the problem and returns null.
  function read() {
    const url = urlInput.value.trim();
    const token = tokenInput.value.trim();
    if (!isWebUrl(url)) {
      setStatus('error', 'Enter the full API URL');
      return null;
    }
    if (!token) {
      setStatus('error', 'Enter the token');
      return null;
    }
    return { url, token };
  }

  const testBtn = button({
    label: 'Test connection',
    variant: 'secondary',
    onClick: async () => {
      const cfg = read();
      if (!cfg) return;
      testBtn.disabled = true;
      setStatus('pending', 'Checking the connection');
      try {
        const { categories } = await testConnection(cfg);
        setStatus('ok', `Connected, ${categories.length} categories found`);
      } catch (err) {
        setStatus('error', errorMessage(err));
      } finally {
        testBtn.disabled = false;
      }
    },
  });

  const saveBtn = button({
    label: 'Save',
    variant: 'primary',
    onClick: () => {
      const cfg = read();
      if (!cfg) return;
      if (!saveConfig(cfg)) {
        setStatus('error', "Couldn't save on this device");
        return;
      }
      ctx.refreshBadge();
      ctx.navigate('#/home');
    },
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      pageHead('Connect', 'Paste the web app URL and the API token from Apps Script'),
      field({ label: 'API URL', control: urlInput }),
      field({ label: 'Token', control: tokenInput, hint: 'Stored as API_TOKEN in the script properties' }),
      status,
      h('div', { class: 'actions' }, testBtn, saveBtn)));
}
