/* ============================================================================
 * Valheim / Nitrado control panel — front-end
 * Plain DOM, no build step. Talks only to the local backend under /api.
 * ==========================================================================*/

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* --------------------------------------------------------------- utilities */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(3)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function toast(message, kind = 'info', ttl = 4500) {
  const node = el('div', { class: `toast ${kind}` }, message);
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s';
    setTimeout(() => node.remove(), 260);
  }, ttl);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const date = typeof seconds === 'number' && seconds < 1e12 ? new Date(seconds * 1000) : new Date(seconds);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function humanize(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ------------------------------------------------------------------- state */

const state = {
  config: null,
  setupServices: null,
  setupDiagnostics: null,
  server: null,
  stats: null,
  settings: { settings: {}, defaults: {} },
  settingMeta: new Map(),
  dirty: new Map(),
  players: null,
  playersRaw: null,
  logSources: [],
  hasConsole: false,
  hasContainerConsole: false,
  backups: null,
  worlds: null,
  tasks: null,
  notifications: [],
  activity: { page: 1, pageCount: 1 },
  logPath: null,
  logCustom: false,
  fileDir: null,
  editorPath: null,
  editorClean: '',
  tab: 'dashboard',
  busy: false,
  lastStatsAt: 0,
  loadedTabs: new Set(),
};

/* ------------------------------------------------------------ status model */

const STATUS_MAP = {
  started: { level: 'online', label: 'Running' },
  stopped: { level: 'offline', label: 'Stopped' },
  stopping: { level: 'busy', label: 'Stopping…' },
  restarting: { level: 'busy', label: 'Restarting…' },
  suspended: { level: 'offline', label: 'Suspended' },
  guardian_locked: { level: 'offline', label: 'Guardian locked' },
  gs_installation: { level: 'busy', label: 'Installing game…' },
  backup_restore: { level: 'busy', label: 'Restoring backup…' },
  backup_creation: { level: 'busy', label: 'Creating backup…' },
  chunkfix: { level: 'busy', label: 'Running chunk fix…' },
  unknown: { level: 'unknown', label: 'Unknown' },
};

function statusInfo(raw) {
  const key = String(raw || 'unknown').toLowerCase();
  return STATUS_MAP[key] || { level: 'unknown', label: humanize(key) };
}

function applyStatusDot(node, level) {
  node.className = `dot dot-${level}`;
}

/* -------------------------------------------------------------------- setup */

function showSetup() {
  clearInterval(pollTimer);
  $('#app').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  renderSetupUI();
}

function setupError(message, kind = 'error') {
  const box = $('#setup-error');
  if (!message) {
    box.classList.add('hidden');
    return;
  }
  box.textContent = message;
  box.className = `alert ${kind}`;
}

function isValheimService(svc) {
  return /valheim/i.test(`${svc.folderShort || ''} ${svc.game || ''} ${svc.typeHuman || ''} ${svc.comment || ''}`);
}

/** Keep the setup card honest about what the user can do next. */
function renderSetupUI() {
  const tokenReady = Boolean(state.config?.tokenConfigured);
  const button = $('#setup-save');
  const reload = $('#setup-load');
  const configPath = state.config?.configPath;

  // A config file the panel could not read must never look like "no token yet".
  const problem = $('#setup-problem');
  if (state.config?.problem) {
    problem.textContent = state.config.problem;
    problem.className = 'alert warn';
  } else {
    problem.className = 'alert warn hidden';
  }

  const done = $('#setup-token-done');
  done.classList.toggle('hidden', !tokenReady);
  if (tokenReady) {
    done.textContent = `A token is already saved${configPath ? ` in ${configPath}` : ''} and is reused after every restart. Paste a new one to replace it.`;
  }

  const pathNote = $('#setup-token-path');
  if (pathNote) {
    pathNote.textContent = tokenReady
      ? ''
      : configPath
        ? `Saved to ${configPath} and reused after every restart.`
        : '';
  }

  $('#setup-token').placeholder = tokenReady
    ? 'Paste a new token to replace the saved one'
    : 'Paste your long-life API token';
  $('#setup-service-step').classList.toggle('hidden', !tokenReady);

  if (!tokenReady) {
    button.textContent = 'Save token';
    reload.classList.add('hidden');
    return;
  }
  if (!state.setupServices) {
    button.textContent = 'Load my servers';
    reload.classList.add('hidden');
    return;
  }
  if (!state.setupServices.length) {
    button.textContent = 'Use this service ID';
    reload.classList.remove('hidden');
    return;
  }
  button.textContent = 'Enter panel';
  reload.classList.remove('hidden');
}

async function loadSetupServices() {
  const select = $('#setup-service');
  const hint = $('#setup-service-hint');
  hint.textContent = 'Loading your Nitrado servers…';
  select.textContent = '';
  select.append(el('option', { value: '' }, 'Loading…'));

  const data = await api('/api/services');
  state.setupServices = data.services || [];
  state.setupDiagnostics = {
    total: data.total ?? state.setupServices.length,
    gameserverCount: data.gameserverCount ?? state.setupServices.length,
  };

  select.textContent = '';
  if (!state.setupServices.length) {
    select.append(el('option', { value: '' }, 'No servers found'));
    hint.textContent = 'Nothing came back for this account.';
    $('#setup-manual').classList.remove('hidden');
    return state.setupServices;
  }

  select.append(el('option', { value: '' }, 'Select a server…'));
  for (const svc of state.setupServices) {
    const bits = [`#${svc.id}`, svc.game || svc.folderShort || 'unknown'];
    if (svc.typeHuman) bits.push(svc.typeHuman);
    if (svc.status) bits.push(svc.status);
    if (svc.comment) bits.push(svc.comment);
    select.append(el('option', { value: svc.id }, bits.join(' · ')));
  }

  const current = state.config?.serviceId;
  if (current && state.setupServices.some((s) => String(s.id) === String(current))) {
    select.value = String(current);
  } else {
    const valheim = state.setupServices.filter(isValheimService);
    if (valheim.length === 1) select.value = String(valheim[0].id);
  }

  hint.textContent = `${state.setupServices.length} server(s) on this account.`;
  $('#setup-manual').classList.add('hidden');
  return state.setupServices;
}

/** The one button in the setup card: save the token, list servers, or enter. */
async function setupPrimary() {
  const button = $('#setup-save');
  const tokenInput = $('#setup-token').value.trim();

  // Token is already in place and the list is loaded and untouched: this is a "go".
  if (state.config?.tokenConfigured && state.setupServices && !tokenInput) {
    return setupFinish();
  }

  button.disabled = true;
  setupError(null);
  try {
    if (tokenInput) await api('/api/config', { method: 'POST', body: { token: tokenInput } });
    await refreshConfig();
    if (!state.config.tokenConfigured) throw new Error('Paste your Nitrado API token to continue.');

    state.setupServices = null;
    await loadSetupServices();

    if (!state.setupServices.length) {
      const total = state.setupDiagnostics?.total ?? 0;
      throw new Error(
        `Your token works, but Nitrado returned ${total} service(s) and none could be used. ` +
          'Make sure the token has the "service" permission, or enter the service ID below.'
      );
    }

    $('#setup-manual').classList.add('hidden');

    // One server on the account? Go straight in, no extra click.
    if (state.setupServices.length === 1) return setupFinish();

    const valheim = state.setupServices.filter(isValheimService);
    if (valheim.length === 1) $('#setup-service').value = String(valheim[0].id);

    setupError(
      valheim.length === 1
        ? 'Found your Valheim server — press "Enter panel" to continue.'
        : 'Pick your server, then press "Enter panel".',
      'info'
    );
  } catch (err) {
    if (state.config?.tokenConfigured) $('#setup-manual').classList.remove('hidden');
    setupError(err.message);
  } finally {
    button.disabled = false;
    renderSetupUI();
  }
}

async function setupFinish() {
  const button = $('#setup-save');
  const manual = $('#setup-manual-id')?.value.trim() || '';
  const selected = manual || $('#setup-service').value;

  if (!selected) {
    setupError('Pick your server from the list, or enter its service ID below.');
    return;
  }
  if (!/^\d+$/.test(String(selected))) {
    setupError('A Nitrado service ID is a number, for example 1234567.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Checking…';
  setupError(null);
  try {
    await api('/api/config', { method: 'POST', body: { serviceId: selected } });
    await refreshConfig();
    await api('/api/server'); // verify the server is reachable before entering
    await enterApp();
  } catch (err) {
    setupError(`Could not use service ${selected}: ${err.message}`);
  } finally {
    button.disabled = false;
    renderSetupUI();
  }
}

/* ------------------------------------------------------------------- config */

async function refreshConfig() {
  state.config = await api('/api/config');
  return state.config;
}

/* ----------------------------------------------------------- server polling */

function renderStatusCard() {
  const server = state.server?.server;
  const info = statusInfo(server?.status);
  applyStatusDot($('#status-dot'), info.level);
  applyStatusDot($('.side-status .dot'), info.level);
  $('#status-label').textContent = info.label;
  $('.side-status-text').textContent = info.label;

  const parts = [];
  if (server?.gameHuman) parts.push(server.gameHuman);
  if (server?.query?.playerCurrent !== null && server?.query?.playerCurrent !== undefined) {
    parts.push(`${server.query.playerCurrent}/${server.query.playerMax ?? '?'} online`);
  }
  $('#status-sub').textContent = parts.join(' · ') || '—';
}

function renderDashboard() {
  const { server, service, valheim } = state.server || {};
  if (!server) return;

  renderStatusCard();

  // players
  const current = server.query?.playerCurrent;
  const max = server.query?.playerMax;
  $('#players-online').textContent = current ?? '–';
  $('#players-max').textContent = max ? ` / ${max}` : '';
  const pct = current && max ? Math.min(100, Math.round((current / max) * 100)) : 0;
  $('#players-bar .bar-fill').style.width = `${pct}%`;

  // world
  $('#stat-world').textContent = valheim?.currentWorld || server.query?.map || '—';
  $('#stat-worlds').textContent = valheim?.allWorlds?.length ? `Available: ${valheim.allWorlds.join(', ')}` : '';

  // connect
  const address = server.query?.connectIp || (server.ip ? `${server.ip}:${server.port}` : '—');
  $('#stat-connect').textContent = address;

  // facts
  const facts = $('#server-facts');
  facts.textContent = '';
  const rows = [
    ['Service ID', service?.id ?? state.config?.serviceId ?? '—'],
    ['Game', server.gameHuman || server.game || '—'],
    ['Slots', server.slots ?? '—'],
    ['Memory', server.memoryMb ? `${server.memoryMb} MB (${server.memory || ''})`.trim() : server.memory || '—'],
    ['Location', server.location || service?.locationId || '—'],
    ['Host', server.hostSystems?.linux?.hostname || Object.values(server.hostSystems || {})[0]?.hostname || '—'],
    ['World file', valheim?.currentWorld || '—'],
    ['Server root', server.rootPath || '—'],
    ['Query', server.query?.version || '—'],
    ['FTP host', server.credentials?.ftp?.hostname || '—'],
  ];
  for (const [label, value] of rows) {
    facts.append(el('dt', {}, label), el('dd', {}, String(value)));
  }

  // update badge
  const badge = $('#upd-badge');
  const upd = server.updateStatus;
  const updMap = {
    up_to_date: ['Up to date', 'ok'],
    'up to date': ['Up to date', 'ok'],
    outdated: ['Update available', 'warn'],
    updating: ['Updating…', 'warn'],
  };
  const mapped = updMap[String(upd || '').toLowerCase()];
  if (mapped) {
    badge.textContent = mapped[0];
    badge.className = `badge ${mapped[1]}`;
  } else {
    badge.className = 'badge hidden';
  }

  // online players
  const online = server.query?.players || [];
  $('#online-count').textContent = online.length ? `${online.length} player(s)` : '';
  const list = $('#online-list');
  list.textContent = '';
  if (!online.length) {
    list.append(el('div', { class: 'empty' }, server.status === 'started' ? 'Nobody is playing right now.' : 'Server is not running.'));
  } else {
    for (const p of online) {
      list.append(
        el(
          'div',
          { class: 'player-chip' },
          el('span', { class: 'avatar' }, String(p.name || '?').slice(0, 1).toUpperCase()),
          el('span', {}, p.name || p.id || 'unknown')
        )
      );
    }
  }

  // sidebar
  $('#side-server').textContent = `${server.query?.serverName || server.gameHuman || 'Valheim'} · ${address}`;
}

function renderCharts() {
  const container = $('#charts');
  container.textContent = '';
  const stats = state.stats?.stats;
  if (!stats) {
    container.append(el('div', { class: 'empty' }, 'No performance data yet.'));
    return;
  }

  const wanted = [
    ['cpuUsage', 'CPU usage', '%'],
    ['memoryUsage', 'Memory', '%'],
    ['currentPlayers', 'Players', ''],
    ['maxPlayers', 'Peak players', ''],
  ];

  let drawn = 0;
  for (const [key, title, suffix] of wanted) {
    const series = stats[key];
    if (!Array.isArray(series) || !series.length) continue;
    const points = series.map((p) => (Array.isArray(p) ? [Number(p[0]), p[1]] : [Number(p), 0]));
    const values = points.map((p) => p[0]).filter((n) => !Number.isNaN(n));
    if (!values.length) continue;
    const latest = values[values.length - 1];
    drawn += 1;

    const chart = el('div', { class: 'chart' });
    chart.append(el('div', { class: 'chart-title' }, title));
    chart.append(el('div', { class: 'chart-value' }, suffix ? `${latest.toFixed(0)}${suffix}` : String(latest)));
    chart.append(el('div', { html: sparkline(values) }));
    container.append(chart);
  }

  if (!drawn) container.append(el('div', { class: 'empty' }, 'No performance series returned for this server.'));
}

function sparkline(values, width = 240, height = 46) {
  if (values.length < 2) return `<svg viewBox="0 0 ${width} ${height}"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = height - 5 - ((v - min) / range) * (height - 10);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <defs><linearGradient id="g${Math.random().toString(36).slice(2, 7)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e0a94a" stop-opacity="0.35"/><stop offset="100%" stop-color="#e0a94a" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="rgba(224,169,74,0.12)"/>
    <path d="${line}" fill="none" stroke="#e0a94a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

async function refreshServer({ silent = false } = {}) {
  try {
    state.server = await api('/api/server');
    renderDashboard();
    $('#last-updated').textContent = `updated ${new Date().toLocaleTimeString()}`;
    hideBanner();

    const now = Date.now();
    if (now - state.lastStatsAt > 60000) {
      state.lastStatsAt = now;
      api('/api/stats?hours=24')
        .then((data) => {
          state.stats = data;
          if (state.tab === 'dashboard') renderCharts();
        })
        .catch(() => {});
      refreshNotifications();
    }
  } catch (err) {
    if (err.status === 401) {
      await refreshConfig().catch(() => {});
      state.setupServices = null;
      setupError('Your Nitrado token was rejected. Paste a fresh one to continue.');
      showSetup();
      return;
    }
    if (err.status === 428) {
      // Only a real "no server chosen" should send the user back to setup.
      await refreshConfig().catch(() => {});
      if (!state.config?.tokenConfigured) return; // still in first-run setup
      if (!state.config.serviceId) {
        state.setupServices = null;
        setupError('Select your server to continue.');
        showSetup();
      } else {
        showBanner('Nitrado was not ready for that request yet — it will retry automatically.', 'warn');
      }
      return;
    }
    if (!silent) toast(err.message, 'error');
    showBanner(err.message, 'error');
  }
}

function showBanner(message, kind = 'warn') {
  const banner = $('#banner');
  banner.textContent = message;
  banner.className = `banner ${kind}`;
}

function hideBanner() {
  $('#banner').classList.add('hidden');
}

/* ------------------------------------------------------------------ actions */

async function runAction(action) {
  if (state.busy) return;
  const labels = { start: 'started', stop: 'stopped', restart: 'restarted' };
  state.busy = true;
  const buttons = $$('.controls .btn');
  buttons.forEach((b) => (b.disabled = true));
  $('#action-note').textContent = `Sending ${action} command…`;
  try {
    const res = await api(`/api/server/${action}`, { method: 'POST', body: {} });
    toast(res.message || `Server will be ${labels[action]}.`, 'ok');
    $('#action-note').textContent = res.message || '';
    setTimeout(() => refreshServer({ silent: true }), 2500);
  } catch (err) {
    toast(err.message, 'error');
    $('#action-note').textContent = err.message;
  } finally {
    setTimeout(() => {
      state.busy = false;
      buttons.forEach((b) => (b.disabled = false));
    }, 1200);
  }
}

/* ----------------------------------------------------------------- settings */

const SCHEMA = window.SETTINGS_SCHEMA || {};
const CATEGORY_LABELS = window.SETTINGS_CATEGORY_LABELS || {};

function normalizeKey(key) {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** alias -> schema entry, built once at load. */
const SCHEMA_INDEX = (() => {
  const index = new Map();
  for (const entry of Object.values(SCHEMA)) {
    for (const name of [entry.id, ...(entry.aliases || [])]) {
      const norm = normalizeKey(name);
      if (norm) index.set(norm, entry);
    }
  }
  return index;
})();

function schemaFor(key) {
  const parts = String(key ?? '').split('.');
  return (
    SCHEMA_INDEX.get(normalizeKey(key)) ||
    SCHEMA_INDEX.get(normalizeKey(parts[parts.length - 1])) ||
    null
  );
}

function categoryLabel(category) {
  return CATEGORY_LABELS[String(category).toLowerCase()] || humanize(category);
}

/** Pull an option list out of whatever Nitrado attached to the setting. */
function optionsFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return [];
  const raw =
    meta.options ?? meta.values ?? meta.allowed_values ?? meta.allowedValues ??
    meta.choices ?? meta.possible_values;
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((option) => {
        if (option && typeof option === 'object') {
          const value = option.value ?? option.key ?? option.id ?? '';
          return {
            value: String(value),
            label: String(option.label ?? option.name ?? value),
            help: option.description || option.help || '',
          };
        }
        return { value: String(option), label: String(option), help: '' };
      })
      .filter((option) => option.value !== '');
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([value, label]) => ({ value: String(value), label: String(label), help: '' }));
  }
  return [];
}

const META_TYPES = {
  bool: 'boolean', boolean: 'boolean', switch: 'boolean', checkbox: 'boolean',
  int: 'number', integer: 'number', number: 'number', float: 'number', double: 'number', numeric: 'number',
  select: 'enum', enum: 'enum', list: 'enum', dropdown: 'enum',
  password: 'password', string: 'text', text: 'text',
};

/**
 * Work out how a setting should be rendered. Nitrado's own metadata wins, then
 * the schema in settings-schema.js, then we infer it from the stored value.
 */
function resolveField(key, meta, rawValue) {
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  const schema = schemaFor(key);

  const provided = optionsFromMeta(meta);
  if (provided.length) return { schema, kind: 'enum', options: provided, value };

  let kind = schema?.type || META_TYPES[String(meta?.type || '').toLowerCase()] || null;

  if (!kind) {
    if (value === 'true' || value === 'false') kind = 'boolean';
    else if (/password|secret|token/i.test(key)) kind = 'password';
    else kind = 'text';
  }

  if (kind === 'boolean') return { schema, kind: 'boolean', value };

  if (kind === 'enum') {
    const options = schema?.options || [];
    const matches = options.some((option) => String(option.value).toLowerCase() === value.toLowerCase());
    if (value === '' || matches) return { schema, kind: 'enum', options, value };
    // The stored value is not one of the choices we know about, so a dropdown
    // would be a lie — fall back to a free field.
    kind = /^-?\d+(\.\d+)?$/.test(value.trim()) ? 'number' : 'text';
  }

  if (kind === 'number') {
    return {
      schema, kind: 'number', value,
      unit: schema?.unit, min: schema?.min, max: schema?.max, step: schema?.step,
      placeholder: schema?.placeholder,
    };
  }
  if (kind === 'password') return { schema, kind: 'password', value };
  return {
    schema, kind: 'text', value,
    suggestions: schema?.suggestions, placeholder: schema?.placeholder,
  };
}

function toLeaf(value) {
  if (value === null) return { leaf: true, value: '' };
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return { leaf: true, value: String(value) };
  if (Array.isArray(value)) return { leaf: true, value: JSON.stringify(value) };
  if (type === 'object' && 'value' in value && (value.value === null || typeof value.value !== 'object')) {
    return { leaf: true, value: value.value === null ? '' : String(value.value), meta: value };
  }
  return { leaf: false };
}

function flattenSettings(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const { leaf, value: scalar, meta } = toLeaf(value);
    if (leaf) out.push({ key: path, value: scalar, meta });
    else if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...flattenSettings(value, path));
    else out.push({ key: path, value: String(value) });
  }
  return out;
}

function settingId(category, key) {
  return `${category}::${key}`;
}

function renderSettings() {
  const body = $('#settings-body');
  body.textContent = '';
  state.settingMeta.clear();
  state.dirty.clear();

  const settings = state.settings.settings || {};
  const defaults = state.settings.defaults || {};
  const categories = Object.keys(settings);

  if (!categories.length) {
    body.append(el('div', { class: 'empty' }, 'Nitrado returned no settings for this server.'));
    return;
  }

  for (const category of categories) {
    const categorySettings = settings[category];
    if (!categorySettings || typeof categorySettings !== 'object' || Array.isArray(categorySettings)) continue;
    const entries = flattenSettings(categorySettings);
    if (!entries.length) continue;

    const group = el('section', { class: 'settings-group' });
    group.append(
      el(
        'header',
        {},
        el('span', {}, categoryLabel(category)),
        el('span', { class: 'muted' }, `${entries.length} setting${entries.length === 1 ? '' : 's'}`)
      )
    );

    const fields = el('div', { class: 'settings-fields' });
    for (const entry of entries) {
      fields.append(renderSettingField(category, entry, defaults[category]));
    }
    group.append(fields);
    body.append(group);
  }

  // Escape hatch: let the user see the exact payload Nitrado returned.
  const details = el('details', {});
  details.append(el('summary', { class: 'muted small' }, 'Show raw settings JSON'));
  details.append(el('pre', { class: 'log-view' }, JSON.stringify(settings, null, 2)));
  body.append(details);
}

/** A label with a hover explanation and the raw Nitrado key called out. */
function labelWithTip(text, help, rawKey, id) {
  const label = el('label', { class: 'field-label' });
  label.append(el('span', { class: 'field-name' }, text));
  if (id) label.append(el('span', { class: 'changed hidden', dataset: { for: id } }, 'changed'));

  if (help || rawKey) {
    const tip = el('span', { class: 'tip', tabindex: '0', role: 'note', 'aria-label': help || `Nitrado key: ${rawKey}` });
    tip.append(el('span', { class: 'tip-icon' }, 'i'));
    const body = el('span', { class: 'tip-body' });
    if (help) body.append(el('span', { class: 'tip-text' }, help));
    if (rawKey) body.append(el('span', { class: 'tip-key mono' }, `Nitrado key: ${rawKey}`));
    tip.append(body);
    label.append(tip);
  }
  return label;
}

function renderSettingField(category, entry, categoryDefaults) {
  const id = settingId(category, entry.key);
  const resolved = resolveField(entry.key, entry.meta, entry.value);
  const schema = resolved.schema;
  const label = schema?.label || humanize(String(entry.key).split('.').pop());
  const help = schema?.help || 'Nitrado reports this setting, but no description has been written for it yet.';
  const value = resolved.value;

  state.settingMeta.set(id, { category, key: entry.key, original: value });

  let defaultValue;
  if (categoryDefaults) {
    const match = flattenSettings(categoryDefaults).find((d) => d.key === entry.key);
    if (match) defaultValue = match.value;
  }

  const hints = [];
  if (resolved.kind === 'number' && resolved.unit) hints.push(`in ${resolved.unit}`);
  if (resolved.kind === 'text' && resolved.suggestions?.length) hints.push(`typical: ${resolved.suggestions.join(', ')}`);
  if (defaultValue !== undefined && String(defaultValue) !== String(value)) {
    hints.push(`default: ${defaultValue === '' ? '(empty)' : defaultValue}`);
  }

  const build = (control, extra) => {
    const holder = el('div', { class: 'field' });
    holder.append(labelWithTip(label, help, entry.key, id), control);
    if (extra) holder.append(extra);
    if (hints.length) holder.append(el('span', { class: 'hint' }, hints.join(' · ')));
    return holder;
  };

  if (resolved.kind === 'boolean') {
    const holder = el('div', { class: 'field switch' });
    holder.append(labelWithTip(label, help, entry.key, id));
    holder.append(
      el('input', {
        type: 'checkbox',
        checked: value === 'true',
        onchange: (event) => markDirty(id, event.target.checked ? 'true' : 'false'),
      })
    );
    return holder;
  }

  if (resolved.kind === 'enum') {
    const options = resolved.options.slice();
    // Never hide a value we don't recognise — offer it back as-is.
    if (value !== '' && !options.some((o) => o.value === value)) {
      options.push({ value, label: `${value} (current value)`, help: '' });
    }

    const optionHelp = el('span', { class: 'option-help hidden' });
    const showOptionHelp = (selected) => {
      const found = options.find((o) => o.value === selected);
      optionHelp.textContent = found?.help || '';
      optionHelp.classList.toggle('hidden', !found?.help);
    };

    const select = el('select', {
      onchange: (event) => {
        markDirty(id, event.target.value);
        showOptionHelp(event.target.value);
      },
    });
    if (value === '') select.append(el('option', { value: '' }, '— not set —'));
    for (const option of options) {
      select.append(el('option', { value: option.value, selected: option.value === value }, option.label));
    }
    showOptionHelp(value);
    return build(select, optionHelp);
  }

  if (resolved.kind === 'number') {
    return build(
      el('input', {
        type: 'number',
        value,
        min: resolved.min ?? null,
        max: resolved.max ?? null,
        step: resolved.step ?? 'any',
        inputmode: 'numeric',
        placeholder: resolved.placeholder || '',
        oninput: (event) => markDirty(id, event.target.value),
      })
    );
  }

  if (resolved.kind === 'password') {
    return build(
      el('input', {
        type: 'password',
        value,
        autocomplete: 'new-password',
        spellcheck: 'false',
        oninput: (event) => markDirty(id, event.target.value),
      })
    );
  }

  if (value.length > 90 || value.includes('\n')) {
    return build(
      el('textarea', { rows: 3, spellcheck: 'false', oninput: (event) => markDirty(id, event.target.value) }, value)
    );
  }

  return build(
    el('input', {
      type: 'text',
      value,
      spellcheck: 'false',
      placeholder: resolved.placeholder || '',
      oninput: (event) => markDirty(id, event.target.value),
    })
  );
}

function markDirty(id, value) {
  const meta = state.settingMeta.get(id);
  if (!meta) return;
  if (String(value) === String(meta.original)) state.dirty.delete(id);
  else state.dirty.set(id, value);

  const badge = $(`[data-for="${CSS.escape(id)}"]`);
  if (badge) badge.classList.toggle('hidden', !state.dirty.has(id));

  const count = state.dirty.size;
  $('#settings-dirty').textContent = count ? `${count} unsaved change${count === 1 ? '' : 's'}` : '';
  $('#settings-save').disabled = count === 0;
}

async function refreshSettings() {
  const body = $('#settings-body');
  body.textContent = '';
  body.append(el('div', { class: 'loading' }, 'Loading settings…'));
  try {
    state.settings = await api('/api/settings');
    renderSettings();

    const server = state.server?.server;
    const warn = $('#settings-warning');
    if (server && server.status === 'started') {
      warn.textContent =
        'The server is running. Nitrado applies settings reliably when the server is stopped — stop it and wait a couple of minutes before saving.';
      warn.className = 'alert warn';
    } else {
      warn.className = 'alert warn hidden';
    }
    $('#settings-save').disabled = true;
    $('#settings-dirty').textContent = '';
  } catch (err) {
    body.textContent = '';
    body.append(el('div', { class: 'empty' }, `Could not load settings: ${err.message}`));
  }
}

async function saveSettings() {
  if (!state.dirty.size) return;
  const updates = [];
  for (const [id, value] of state.dirty) {
    const meta = state.settingMeta.get(id);
    if (!meta) continue;
    updates.push({ category: meta.category, key: meta.key, value });
  }

  const button = $('#settings-save');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const res = await api('/api/settings', { method: 'POST', body: { updates } });
    if (res.failed) {
      const first = res.results.find((r) => !r.ok);
      toast(`Saved ${updates.length - res.failed} of ${updates.length}. ${first?.key}: ${first?.error}`, 'error', 8000);
    } else {
      toast(`Saved ${updates.length} setting${updates.length === 1 ? '' : 's'}. Restart the server to apply.`, 'ok');
    }
    await refreshSettings();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.textContent = 'Save changes';
  }
}

/* ------------------------------------------------------------------ players */

const LIST_LABELS = { adminlist: 'Admins', banlist: 'Banned', whitelist: 'Whitelist' };

async function refreshPlayers({ silent = false } = {}) {
  try {
    state.players = await api('/api/players');
    renderPlayers();
  } catch (err) {
    if (!silent) toast(err.message, 'error');
  }
}

function renderPlayers() {
  const data = state.players;
  if (!data) return;

  const container = $('#online-players');
  container.textContent = '';
  const online = data.online || [];
  if (!online.length) {
    container.append(el('div', { class: 'empty' }, state.server?.server?.status === 'started' ? 'Nobody is online right now.' : 'Server is not running.'));
  } else {
    for (const p of online) {
      container.append(
        el(
          'div',
          { class: 'player-chip' },
          el('span', { class: 'avatar' }, String(p.name || '?').slice(0, 1).toUpperCase()),
          el('span', {}, p.name || p.id),
          p.ping ? el('span', { class: 'muted small' }, `${p.ping}ms`) : null
        )
      );
    }
  }

  for (const listName of ['adminlist', 'banlist', 'whitelist']) {
    const ul = $(`#list-${listName}`);
    ul.textContent = '';
    const entries = data[listName] || [];

    if (!entries.length) {
      ul.append(el('li', { class: 'muted small' }, 'Nobody here yet.'));
      continue;
    }
    for (const entry of entries) {
      const name = entry.name || entry.id || String(entry);
      const identifier = entry.id || entry.name || String(entry);
      ul.append(
        el(
          'li',
          {},
          el('div', {}, el('div', {}, name), entry.id && entry.name ? el('div', { class: 'id' }, entry.id) : null),
          el(
            'button',
            {
              class: 'icon-btn',
              title: `Remove from ${LIST_LABELS[listName]}`,
              onclick: () => removeFromList(listName, identifier),
            },
            el('span', { html: '<svg class="ico"><use href="#i-trash"/></svg>' })
          )
        )
      );
    }
  }
}

async function addToList(listName) {
  const input = $(`[data-add-input="${listName}"]`);
  const raw = input.value.trim();
  if (!raw) return;

  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const ids = parts.map((p) => normalizePlayerId(p));
  const warnings = ids.map((i) => i.warning).filter(Boolean);
  const identifiers = ids.map((i) => i.value);

  if (warnings.length) {
    const proceed = confirm(`${warnings.join('\n\n')}\n\nAdd anyway?`);
    if (!proceed) return;
  }

  if (listName === 'whitelist') {
    const ok = confirm(
      'Adding anyone to the whitelist makes the server invite-only — every player NOT on this list is blocked from joining.\n\nContinue?'
    );
    if (!ok) return;
  }

  try {
    const res = await api(`/api/players/lists/${listName}`, { method: 'POST', body: { identifiers } });
    const prefixed = ids.find((i) => i.changed);
    toast(prefixed ? `${res.message} (${prefixed.warning})` : res.message || `Added to ${LIST_LABELS[listName]}.`, 'ok', prefixed ? 8000 : 4500);
    input.value = '';
    await Promise.all([refreshPlayers(), refreshPlayersRaw({ silent: true })]);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeFromList(listName, identifier) {
  try {
    await api(`/api/players/lists/${listName}`, { method: 'DELETE', body: { identifiers: [identifier] } });
    toast(`Removed from ${LIST_LABELS[listName]}.`, 'ok');
    await Promise.all([refreshPlayers(), refreshPlayersRaw({ silent: true })]);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/**
 * Valheim wants [Platform]_[UserID] (e.g. Steam_76561197960287930), copied from
 * the in-game F2 panel. Bare 17-digit SteamID64s are a common paste and silently
 * fail, so offer to add the prefix.
 */
function normalizePlayerId(raw) {
  const value = String(raw || '').trim();
  if (!value) return { value, warning: null };
  if (/^[A-Za-z]+_\d+$/.test(value)) return { value, warning: null };
  if (/^\d{17}$/.test(value)) {
    return { value: `Steam_${value}`, warning: `Added the Steam_ prefix — Valheim needs the platform prefix, not a bare ID.`, changed: true };
  }
  if (/^\d{5,}$/.test(value)) {
    return { value, warning: 'No platform prefix. Valheim normally wants Steam_<id> or V_<id> — check the F2 panel.', changed: false };
  }
  return { value, warning: `"${value}" does not look like a platform ID. Admin rights will not apply to it.`, changed: false };
}

async function refreshPlayersRaw({ silent = false } = {}) {
  try {
    state.playersRaw = await api('/api/players/raw');
    renderPlayersRaw();
  } catch (err) {
    if (!silent) toast(err.message, 'error');
  }
}

function renderPlayersRaw() {
  const data = state.playersRaw;
  const box = $('#raw-lists');
  box.textContent = '';
  if (!data) return;

  if (data.savedata) $('#raw-savedata').textContent = `${data.savedata}/`;

  for (const file of data.files || []) {
    const body = file.content === null
      ? el('div', { class: 'empty' }, `Could not read it: ${file.error}`)
      : el('pre', { class: 'log-view', style: 'max-height:150px' }, file.content.trim() || '(empty)');

    // Flag entries that cannot possibly be a platform ID — Valheim will ignore them.
    const suspicious = (file.content || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))
      .filter((l) => !/^[A-Za-z]+_\d+$/.test(l));

    const card = el('div', { class: 'raw-file' });
    card.append(el('div', { class: 'card-head' }, el('h2', {}, file.name), el('span', { class: 'muted small mono' }, file.path)));
    card.append(body);
    if (suspicious.length) {
      card.append(
        el('div', { class: 'alert warn' },
          `${suspicious.length} entr${suspicious.length === 1 ? 'y' : 'ies'} will be ignored by Valheim because they are not in ` +
          `[Platform]_[UserID] form: ${suspicious.slice(0, 4).join(', ')}${suspicious.length > 4 ? '…' : ''}`
        )
      );
    }
    box.append(card);
  }
}

/* --------------------------------------------------------------------- logs */

async function loadLogSources() {
  try {
    const data = await api('/api/logs/sources');
    state.logSources = data.sources || [];
    state.hasConsole = Boolean(data.hasConsole);
    state.hasContainerConsole = Boolean(data.hasContainerConsole);
  } catch {
    state.logSources = [];
    state.hasConsole = false;
  }
  buildLogFileOptions();
  toggleCustomLogInput();
}

function buildLogFileOptions() {
  const select = $('#log-file-select');
  select.textContent = '';
  const files = state.logSources || [];

  if (!files.length) {
    select.append(el('option', { value: '' }, 'No log files reported — enter a path below'));
  }
  for (const file of files) {
    const label = file.nitrado ? `${file.name} (Nitrado)` : file.name || file.path;
    select.append(el('option', { value: file.path }, label));
  }
  select.append(el('option', { value: '__custom__' }, 'Custom path…'));

  const preferred = files[0]?.path || '';
  select.value = state.logPath && files.some((f) => f.path === state.logPath) ? state.logPath : preferred;
  state.logPath = select.value === '__custom__' ? state.logPath : select.value;
}

/**
 * Valheim has no RCON and Nitrado reports has_application_server:false for it,
 * so there is no command channel. Show what actually works instead of a box
 * that silently does nothing.
 */
function renderConsolePanel() {
  const body = $('#console-body');
  const note = $('#console-note');
  body.textContent = '';

  if (state.hasConsole) {
    note.textContent = 'Send a command to the running server';
    const row = el('div', { class: 'console-row' });
    const input = el('input', { id: 'console-input', class: 'mono', placeholder: 'e.g. save   ·   help   ·   info', spellcheck: 'false' });
    const button = el('button', { id: 'console-send', class: 'btn btn-primary' }, el('span', { html: '<svg class="ico"><use href="#i-send"/></svg>' }), ' Send');
    row.append(input, button);
    body.append(row, el('div', { id: 'console-log', class: 'muted small' }));
    button.addEventListener('click', sendCommand);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendCommand();
    });
    return;
  }

  note.textContent = 'No command channel on this service';
  body.append(
    el('div', { class: 'alert info', style: 'margin-bottom:14px' },
      'Valheim has no RCON, and Nitrado reports no application console for this service, so commands cannot be sent from here. ' +
      'Admin commands have to be run in-game: press F5, and your ID must be on the admin list below.'
    )
  );

  const commands = [
    ['save', 'Force an immediate world save. The safest thing to run before a restart.'],
    ['kick <name|steamid>', 'Remove a player from the server.'],
    ['ban <name|steamid>', 'Ban a player.'],
    ['unban <name|steamid>', 'Lift a ban.'],
    ['banned', 'List every banned player.'],
    ['setworldmodifier <name> <value>', 'Change one world dial live, without a restart.'],
    ['setworldpreset <name>', 'Apply a preset live, resetting the others.'],
    ['resetworldkeys', 'Reset world modifiers to default. Leaves boss progress alone.'],
  ];
  const card = el('div', { class: 'group-block' });
  card.append(el('div', { class: 'card-head' }, el('h2', {}, 'Admin commands that do work'), el('span', { class: 'muted small' }, 'run in-game with F5')));
  const table = el('table', { class: 'file-table' });
  table.append(el('thead', {}, el('tr', {}, el('th', {}, 'Command'), el('th', {}, 'What it does'))));
  const tbody = el('tbody');
  for (const [cmd, desc] of commands) {
    tbody.append(el('tr', {}, el('td', { class: 'mono' }, cmd), el('td', { class: 'muted' }, desc)));
  }
  table.append(tbody);
  card.append(table);
  body.append(card);

  body.append(
    el('p', { class: 'muted small', style: 'margin-top:12px' },
      'Cheat commands (spawn, god, fly) are refused by every vanilla dedicated server, admin or not. ' +
      'Only a mod such as Server devcommands can unlock them.'
    )
  );
}

async function refreshNotifications() {
  try {
    const data = await api('/api/notifications');
    state.notifications = data.notifications || [];
    renderNotifications();
  } catch {
    /* notifications are optional; never block the dashboard on them */
  }
}

function renderNotifications() {
  const box = $('#notifications');
  box.textContent = '';
  const items = (state.notifications || []).filter((n) => !n.dismissed);
  box.classList.toggle('hidden', items.length === 0);
  if (!items.length) return;

  const rank = { SEVERE: 0, ERROR: 0, WARNING: 1, WARN: 1, INFO: 2, SUCCESS: 3, DEBUG: 4 };
  items
    .slice()
    .sort((a, b) => (rank[a.level] ?? 2) - (rank[b.level] ?? 2))
    .forEach((n) => {
      const kind = ['SEVERE', 'ERROR'].includes(n.level) ? 'error' : n.level === 'WARNING' ? 'warn' : 'info';
      box.append(
        el('div', { class: `alert ${kind}`, style: 'margin:0' },
          el('strong', {}, n.level === 'SEVERE' ? 'Problem' : humanize(n.level.toLowerCase())),
          ' — ', n.message,
          n.messageLong ? el('div', { class: 'muted small' }, n.messageLong) : null
        )
      );
    });
}

/* ---------------------------------------------------------------- backups */

async function refreshBackups({ silent = false } = {}) {
  const body = $('#backups-body');
  try {
    const data = await api('/api/backups');
    state.backups = data;
    renderBackups();
  } catch (err) {
    if (!silent) {
      body.textContent = '';
      body.append(el('div', { class: 'empty' }, `Could not load backups: ${err.message}`));
    }
  }
}

function renderBackups() {
  const data = state.backups;
  const body = $('#backups-body');
  const note = $('#backups-note');
  body.textContent = '';
  if (!data) return;

  const groups = data.groups || [];
  note.textContent = data.maxManualBackups ? `${data.total} available · up to ${data.maxManualBackups} kept` : `${data.total} available`;

  if (!data.total) {
    body.append(
      el('div', { class: 'empty' },
        'No backups yet. Nitrado creates these on its own schedule once the server has been running — the API can restore them but cannot create one.'
      )
    );
    return;
  }

  const restoreAllowed = data.restorePossible !== false;
  for (const group of groups) {
    const card = el('div', { class: 'group-block' });
    card.append(
      el('div', { class: 'card-head' },
        el('h2', {}, group.kind === 'database' ? 'Database' : 'Game files'),
        el('span', { class: 'muted small mono' }, group.folder)
      )
    );
    const table = el('table', { class: 'file-table' });
    table.append(el('thead', {}, el('tr', {}, el('th', {}, 'Taken'), el('th', {}, 'Type'), el('th', {}, 'Size'), el('th', {}, ''))));
    const tbody = el('tbody');
    for (const backup of group.backups) {
      tbody.append(
        el('tr', {},
          el('td', {}, backup.timestamp ? fmtTime(backup.timestamp) : '—'),
          el('td', { class: 'muted' }, backup.type || '—'),
          el('td', { class: 'size' }, fmtBytes(backup.size)),
          el('td', {},
            el('button', {
              class: 'btn btn-ghost btn-sm',
              disabled: !restoreAllowed,
              title: restoreAllowed ? 'Restore this backup — the server will stop and be rolled back' : 'Restore is not currently possible',
              onclick: () => restoreBackup(group, backup),
            }, 'Restore')
          )
        )
      );
    }
    table.append(tbody);
    card.append(table);
    body.append(card);
  }

  if (!restoreAllowed) {
    body.append(el('div', { class: 'alert warn' }, 'Nitrado reports that a restore is not possible right now.'));
  }
}

async function restoreBackup(group, backup) {
  const when = backup.timestamp ? fmtTime(backup.timestamp) : `#${backup.number}`;
  if (!confirm(`Restore the backup from ${when}?\n\nThe server will be stopped and rolled back to that point. Anything built since then is lost.`)) return;
  try {
    const res = await api('/api/backups/restore', { method: 'POST', body: { folder: group.folder, backup: backup.number, kind: group.kind } });
    toast(res.message || 'Restore started.', 'ok');
    setTimeout(() => refreshServer({ silent: true }), 2000);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ----------------------------------------------------------------- worlds */

async function refreshWorlds() {
  try {
    const data = await api('/api/worlds');
    state.worlds = data;
    renderWorlds();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderWorlds() {
  const data = state.worlds;
  const tbody = $('#worlds-list');
  tbody.textContent = '';
  if (!data) return;

  $('#worlds-note').textContent = data.savedata ? data.savedata : '';

  const alert = $('#worlds-alert');
  if (data.mismatch) {
    alert.textContent =
      `The World name setting is "${data.activeWorld}", but no folder with that name exists in worlds_local. ` +
      'The server will generate a brand new world under that name on next start instead of loading an existing one.';
    alert.className = 'alert warn';
  } else {
    alert.className = 'alert warn hidden';
  }

  if (!data.worlds?.length && !data.legacy?.length) {
    tbody.append(el('tr', {}, el('td', { colspan: 4, class: 'muted' }, 'No worlds found in savedata/worlds_local.')));
    return;
  }

  for (const world of data.worlds || []) {
    const active = world.name === data.activeWorld;
    tbody.append(
      el('tr', {},
        el('td', {}, el('span', { class: 'mono' }, world.name), active ? el('span', { class: 'badge ok', style: 'margin-left:8px' }, 'active') : null),
        el('td', { class: 'size' }, world.size ? fmtBytes(world.size) : '—'),
        el('td', { class: 'mod' }, world.modifiedAt ? fmtTime(world.modifiedAt) : '—'),
        el('td', {}, el('button', { class: 'btn btn-ghost btn-sm', onclick: () => refreshFiles(world.path) }, 'Browse'))
      )
    );
  }

  for (const file of data.legacy || []) {
    tbody.append(
      el('tr', {},
        el('td', {}, el('span', { class: 'mono' }, file.name), el('span', { class: 'badge warn', style: 'margin-left:8px' }, 'pre-1.0')),
        el('td', { class: 'size' }, fmtBytes(file.size)),
        el('td', { class: 'mod' }, file.modifiedAt ? fmtTime(file.modifiedAt) : '—'),
        el('td', {}, '')
      )
    );
  }
}

/* ------------------------------------------------------------------ tasks */

async function refreshTasks() {
  try {
    const data = await api('/api/tasks');
    state.tasks = data;
    renderTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function describeCron(cron) {
  const pad = (v) => String(v).padStart(2, '0');
  if (cron.day === '*' && cron.month === '*' && cron.weekday === '*') {
    return `Every day at ${pad(cron.hour)}:${pad(cron.minute)}`;
  }
  return `At ${pad(cron.minute)} ${cron.hour} on day ${cron.day}/${cron.month}`;
}

function renderTasks() {
  const data = state.tasks;
  const list = $('#tasks-list');
  const select = $('#task-action');
  list.textContent = '';
  if (!data) return;

  $('#tasks-note').textContent = data.tasks?.length ? `${data.tasks.length} scheduled` : '';

  select.textContent = '';
  for (const action of data.actions || []) {
    select.append(el('option', { value: action.method }, action.description));
  }

  if (!data.tasks?.length) {
    list.append(el('li', { class: 'muted small' }, 'No scheduled tasks. Add a daily restart below — it is worth having one.'));
    return;
  }

  for (const task of data.tasks) {
    const action = (data.actions || []).find((a) => a.method === task.action)?.description || humanize(task.action || 'task');
    list.append(
      el('li', {},
        el('div', {},
          el('div', {}, el('strong', {}, action), task.data ? el('span', { class: 'muted small' }, ` — ${task.data}`) : null),
          el('div', { class: 'id' }, `${describeCron(task.cron)} · ${task.timezone || 'server time'}${task.nextRun ? ` · next ${fmtTime(task.nextRun)}` : ''}`)
        ),
        el('div', { class: 'row-actions' },
          el('span', { class: `badge ${task.status === 'active' ? 'ok' : 'warn'}` }, task.status),
          el('button', { class: 'icon-btn', title: 'Delete this task', onclick: () => deleteTask(task) }, el('span', { html: '<svg class="ico"><use href="#i-trash"/></svg>' }))
        )
      )
    );
  }
}

async function createTask() {
  const action = $('#task-action').value;
  const hour = String($('#task-hour').value || '5').trim();
  const minute = String($('#task-minute').value || '0').trim();
  const data = $('#task-data').value.trim();

  if (!/^\d{1,2}$/.test(hour) || Number(hour) > 23) return toast('Hour must be 0-23.', 'error');
  if (!/^\d{1,2}$/.test(minute) || Number(minute) > 59) return toast('Minute must be 0-59.', 'error');

  try {
    const res = await api('/api/tasks', {
      method: 'POST',
      body: { action, data, minute, hour, day: '*', month: '*', weekday: '*' },
    });
    toast(`${res.message} Runs daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`, 'ok');
    $('#task-data').value = '';
    await refreshTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteTask(task) {
  if (!confirm('Delete this scheduled task?')) return;
  try {
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    toast('Task deleted.', 'ok');
    await refreshTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function toggleCustomLogInput() {
  let wrapper = $('#log-custom-wrap');
  if (state.logCustom) {
    if (!wrapper) {
      wrapper = el('div', { id: 'log-custom-wrap', class: 'row-actions', style: 'margin-bottom:12px' });
      wrapper.append(
        el('input', {
          id: 'log-custom-input',
          class: 'mono',
          placeholder: '/games/<user>/ftproot/valheim/…',
          spellcheck: 'false',
          value: state.logPath && state.logPath !== '__custom__' ? state.logPath : '',
          oninput: (event) => {
            state.logPath = event.target.value;
          },
          onchange: () => refreshLogFile(),
        })
      );
      $('#log-file-select').closest('.card-head').after(wrapper);
    }
    wrapper.classList.remove('hidden');
  } else if (wrapper) {
    wrapper.classList.add('hidden');
  }
}

async function refreshLogFile({ silent = false } = {}) {
  if (state.logCustom) {
    const input = $('#log-custom-input');
    if (input) state.logPath = input.value.trim();
  }
  const path = state.logPath;
  const view = $('#log-view');
  if (!path || path === '__custom__') {
    view.textContent = 'No log file selected. Pick one above, or use a custom path.';
    $('#log-path').textContent = '';
    return;
  }
  try {
    const data = await api(`/api/logs/file?lines=400&path=${encodeURIComponent(path)}`);
    $('#log-path').textContent = `${data.path}${data.truncated ? ' (truncated)' : ''} · ${fmtBytes(data.size)} · ${data.totalLines} lines`;
    view.textContent = data.lines.join('\n') || '(empty)';
    view.scrollTop = view.scrollHeight;
  } catch (err) {
    if (!silent) {
      view.textContent = `Could not read ${path}\n${err.message}`;
      toast(err.message, 'error');
    }
  }
}

async function refreshActivity(page = state.activity.page) {
  try {
    const data = await api(`/api/logs/activity?page=${page}`);
    state.activity.page = data.page;
    state.activity.pageCount = data.pageCount;
    $('#activity-page').textContent = `page ${data.page} / ${data.pageCount}`;
    $('#activity-prev').disabled = data.page <= 1;
    $('#activity-next').disabled = data.page >= data.pageCount;

    const list = $('#activity-list');
    list.textContent = '';
    if (!data.logs.length) {
      list.append(el('li', { class: 'muted small' }, 'No activity recorded.'));
      return;
    }
    for (const entry of data.logs) {
      list.append(
        el(
          'li',
          {},
          el('span', { class: `sev ${String(entry.severity || '').toLowerCase()}` }),
          el(
            'div',
            {},
            el('div', {}, entry.message),
            el('div', { class: 'cat' }, [entry.category, entry.user, entry.admin ? 'admin' : null].filter(Boolean).join(' · '))
          ),
          el('time', {}, fmtTime(entry.created_at))
        )
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function sendCommand() {
  const input = $('#console-input');
  if (!input) return;
  const command = input.value.trim();
  if (!command) return;
  try {
    await api('/api/console', { method: 'POST', body: { command } });
    const log = $('#console-log');
    log.prepend(el('div', { class: 'line mono' }, `→ ${command}`));
    while (log.children.length > 8) log.lastChild.remove();
    input.value = '';
    toast('Command sent. Output appears in the server log above.', 'ok');
  } catch (err) {
    if (err.status === 409) {
      // Nitrado says there is no command channel — swap to the honest view.
      state.hasConsole = false;
      renderConsolePanel();
      toast(err.message, 'warn', 9000);
      return;
    }
    toast(err.message, 'error');
  }
}

/* -------------------------------------------------------------------- files */

async function refreshFiles(dir = state.fileDir) {
  try {
    const data = await api(`/api/files${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`);
    state.fileDir = data.dir || dir || state.server?.server?.rootPath || '';
    $('#files-path').textContent = state.fileDir || '(root)';

    const tbody = $('#files-list');
    tbody.textContent = '';
    const entries = data.entries.slice().sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    if (!entries.length) {
      tbody.append(el('tr', {}, el('td', { colspan: 3, class: 'muted' }, 'Empty directory.')));
      return;
    }

    for (const entry of entries) {
      const isDir = entry.type === 'dir';
      const nameCell = el(
        'td',
        {},
        el(
          'div',
          {
            class: `name ${isDir ? 'dir' : ''}`,
            onclick: () => (isDir ? refreshFiles(entry.path) : openFile(entry.path)),
          },
          el('span', { html: `<svg class="ico"><use href="#i-${isDir ? 'folder' : 'logs'}"/></svg>` }),
          entry.name
        )
      );
      tbody.append(
        el(
          'tr',
          {},
          nameCell,
          el('td', { class: 'size' }, isDir ? '—' : fmtBytes(entry.size)),
          el('td', { class: 'mod' }, entry.modifiedAt ? fmtTime(entry.modifiedAt) : '—')
        )
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openFile(path) {
  try {
    const data = await api(`/api/files/read?path=${encodeURIComponent(path)}`);
    state.editorPath = path;
    state.editorClean = data.content;
    $('#editor-path').textContent = path + (data.truncated ? ' (truncated)' : '');
    $('#editor-title').textContent = `Editor — ${path.split('/').pop()}`;
    const editor = $('#editor');
    editor.value = data.content;
    editor.disabled = false;
    editor.scrollTop = 0;
    $('#editor-save').disabled = true;
    if (data.truncated) toast('File is large — showing the first 2 MB only.', 'warn');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveFile() {
  if (!state.editorPath) return;
  const content = $('#editor').value;
  const button = $('#editor-save');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await api('/api/files/write', { method: 'POST', body: { path: state.editorPath, content } });
    state.editorClean = content;
    toast('File saved.', 'ok');
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error', 8000);
  } finally {
    button.textContent = 'Save file';
    button.disabled = false;
  }
}

/* --------------------------------------------------------------------- tabs */

const TAB_META = {
  dashboard: ['Dashboard', 'Control and monitor your Valheim server'],
  settings: ['Server settings', 'Edit the settings Nitrado applies to your server'],
  players: ['Players & admins', 'See who is online and manage admin, ban and whitelist entries'],
  backups: ['Backups & schedule', 'World backups, world files and scheduled restarts'],
  logs: ['Logs', 'Server and Nitrado activity history'],
  files: ['Files', 'Browse and edit files on the server'],
};

function switchTab(tab) {
  state.tab = tab;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
  const [title, sub] = TAB_META[tab] || ['', ''];
  $('#page-title').textContent = title;
  $('#page-sub').textContent = sub;
  onTabEnter(tab);
}

async function onTabEnter(tab) {
  if (tab === 'dashboard') {
    renderCharts();
    if (state.server) renderDashboard();
  }
  if (tab === 'settings' && !state.loadedTabs.has('settings')) {
    state.loadedTabs.add('settings');
    await refreshSettings();
  }
  if (tab === 'players') {
    await refreshPlayers({ silent: true });
    if (!state.playersRaw) await refreshPlayersRaw({ silent: true });
  }
  if (tab === 'backups') {
    if (!state.loadedTabs.has('backups')) {
      state.loadedTabs.add('backups');
      await Promise.all([refreshWorlds(), refreshBackups(), refreshTasks()]);
    }
  }
  if (tab === 'logs') {
    if (!state.loadedTabs.has('logs')) {
      state.loadedTabs.add('logs');
      await loadLogSources();
      renderConsolePanel();
    }
    await Promise.all([refreshLogFile({ silent: true }), refreshActivity()]);
  }
  if (tab === 'files' && !state.loadedTabs.has('files')) {
    state.loadedTabs.add('files');
    await refreshFiles(state.server?.server?.rootPath || undefined);
  }
}

/* -------------------------------------------------------------- boot / wiring */

function wireEvents() {
  // setup
  $('#setup-save').addEventListener('click', setupPrimary);
  $('#setup-load').addEventListener('click', async () => {
    setupError(null);
    state.setupServices = null;
    try {
      await loadSetupServices();
      if (!state.setupServices.length) setupError('Still nothing found — enter the service ID below.', 'warn');
      else if (state.setupServices.length === 1) return setupFinish();
      else setupError('Servers reloaded — pick one, then press "Enter panel".', 'info');
    } catch (err) {
      setupError(err.message);
    } finally {
      renderSetupUI();
    }
  });
  $('#setup-token').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setupPrimary();
  });
  $('#setup-service').addEventListener('change', () => setupError(null));
  $('#setup-manual-id').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setupFinish();
  });
  $('#setup-manual-id').addEventListener('input', () => setupError(null));

  // nav
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // global
  $('#refresh').addEventListener('click', async () => {
    state.loadedTabs.delete('settings');
    await refreshServer();
    await onTabEnter(state.tab);
    toast('Refreshed.', 'ok', 1500);
  });
  $('#open-setup').addEventListener('click', async () => {
    state.setupServices = null;
    $('#setup-token').value = '';
    $('#setup-manual-id').value = '';
    setupError(null);
    await refreshConfig().catch(() => {});
    showSetup();
    if (state.config?.tokenConfigured) {
      try {
        await loadSetupServices();
      } catch (err) {
        setupError(err.message);
      }
      renderSetupUI();
    }
  });

  // controls
  $$('.controls .btn').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.action)));
  $('#copy-connect').addEventListener('click', async () => {
    const text = $('#stat-connect').textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast('Address copied.', 'ok', 1800);
    } catch {
      toast(text, 'info', 6000);
    }
  });

  // settings
  $('#settings-reload').addEventListener('click', refreshSettings);
  $('#settings-save').addEventListener('click', saveSettings);

  // players
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addToList(b.dataset.add)));
  $$('[data-add-input]').forEach((input) =>
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addToList(input.dataset.addInput);
    })
  );
  $$('[data-load="players"]').forEach((b) => b.addEventListener('click', () => refreshPlayers()));
  $$('[data-load="players-raw"]').forEach((b) => b.addEventListener('click', () => refreshPlayersRaw()));
  $$('[data-load="backups"]').forEach((b) => b.addEventListener('click', () => refreshBackups()));
  $$('[data-load="worlds"]').forEach((b) => b.addEventListener('click', () => refreshWorlds()));
  $$('[data-load="tasks"]').forEach((b) => b.addEventListener('click', () => refreshTasks()));
  $('#task-create').addEventListener('click', createTask);

  // logs
  $('#log-refresh').addEventListener('click', () => refreshLogFile());
  $('#log-file-select').addEventListener('change', (event) => {
    state.logCustom = event.target.value === '__custom__';
    state.logPath = state.logCustom ? $('#log-custom-input')?.value || '' : event.target.value;
    toggleCustomLogInput();
    refreshLogFile();
  });
  $('#activity-prev').addEventListener('click', () => refreshActivity(Math.max(1, state.activity.page - 1)));
  $('#activity-next').addEventListener('click', () => refreshActivity(state.activity.page + 1));
  // The console box is built by renderConsolePanel() and wires its own handlers,
  // because for Valheim there is no command channel at all.

  // files
  $('#files-refresh').addEventListener('click', () => refreshFiles());
  $('#files-up').addEventListener('click', () => {
    if (!state.fileDir) return;
    const parent = state.fileDir.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/';
    refreshFiles(parent);
  });
  $('#editor-save').addEventListener('click', saveFile);
  $('#editor').addEventListener('input', () => {
    $('#editor-save').disabled = $('#editor').value === state.editorClean;
  });
  $('#editor').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!$('#editor-save').disabled) saveFile();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && panelReady()) refreshServer({ silent: true });
  });
}

async function renderQuickFiles() {
  const container = $('#files-quick');
  container.textContent = '';
  const server = state.server?.server;
  const shortcuts = [];
  if (server?.rootPath) shortcuts.push({ label: 'Server root', path: server.rootPath });
  for (const file of server?.configFiles || []) shortcuts.push({ label: `⚙ ${file.name}`, path: file.path });
  for (const file of server?.logFiles || []) shortcuts.push({ label: `≡ ${file.name}`, path: file.path });

  if (!shortcuts.length) {
    container.append(el('span', { class: 'muted small' }, 'No config or log shortcuts reported by Nitrado.'));
    return;
  }
  for (const item of shortcuts) {
    container.append(el('button', { onclick: () => (item.path.endsWith('/') ? refreshFiles(item.path) : openFile(item.path)) }, item.label));
  }
}

let pollTimer = null;

/** True once a token and a server are both configured and the panel is on screen. */
function panelReady() {
  return Boolean(state.config?.tokenConfigured && state.config?.serviceId) && $('#setup').classList.contains('hidden');
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden || !panelReady()) return;
    await refreshServer({ silent: true });
    if (state.tab === 'logs' && $('#log-follow').checked) await refreshLogFile({ silent: true });
    if (state.tab === 'players') await refreshPlayers({ silent: true });
  }, 5000);
}

async function enterApp() {
  $('#setup').classList.add('hidden');
  $('#app').classList.remove('hidden');
  state.loadedTabs.clear();
  await refreshServer();
  // A bad/expired token makes refreshServer surface the setup screen again.
  if (!$('#setup').classList.contains('hidden')) return;
  await renderQuickFiles();
  switchTab('dashboard');
  startPolling();
}

async function init() {
  wireEvents();
  try {
    await refreshConfig();
  } catch (err) {
    showSetup();
    setupError(`Could not reach the panel backend: ${err.message}`);
    return;
  }

  if (!state.config.tokenConfigured) {
    showSetup();
    setupError('Paste your Nitrado API token to get started.', 'info');
    return;
  }

  if (!state.config.serviceId) {
    showSetup();
    setupError('Loading your Nitrado servers…', 'info');
    try {
      await loadSetupServices();
      if (state.setupServices.length === 1) {
        // Only one server on the account: just use it.
        await setupFinish();
        return;
      }
      setupError(
        state.setupServices.length
          ? 'Choose your server to continue.'
          : 'No servers came back for this account — enter the service ID below.',
        state.setupServices.length ? 'info' : 'warn'
      );
    } catch (err) {
      setupError(err.message);
    }
    renderSetupUI();
    return;
  }

  await enterApp();
}

init();
