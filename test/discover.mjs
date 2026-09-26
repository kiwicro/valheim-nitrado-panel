/**
 * Read-only discovery probe.
 *
 * Calls the Nitrado API with the token saved in data/config.json and writes the
 * raw responses to data/discovery/ so the panel can be built against what the
 * server ACTUALLY returns rather than what the docs imply.
 *
 * It only ever issues GET requests. Credentials in the responses (FTP/MySQL
 * passwords, websocket tokens) are redacted before anything is written.
 *
 *   node test/discover.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const OUT_DIR = path.join(DATA_DIR, 'discovery');
const BASE = process.env.NITRADO_BASE_URL || 'https://api.nitrado.net';

const REDACT_KEYS = new Set(['password', 'websocket_token', 'access_token', 'refresh_token', 'mysql_password']);

function redact(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) && v ? '<redacted>' : redact(v, k);
    }
    return out;
  }
  return value;
}

async function loadConfig() {
  const file = path.join(DATA_DIR, 'config.json');
  const raw = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!parsed.token) throw new Error(`No token in ${file}`);
  if (!parsed.serviceId) throw new Error(`No serviceId in ${file}`);
  return { token: parsed.token, serviceId: String(parsed.serviceId) };
}

const results = [];

async function run() {
  const { token, serviceId } = await loadConfig();
  console.log(`\nProbing service ${serviceId} (token ${token.slice(0, 4)}…${token.slice(-4)}, read-only)\n`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Rewrite probe to use the real token via closure.
  const authed = async (label, endpoint, opts = {}) => {
    const url = new URL(BASE + endpoint);
    if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, String(v));
    const started = Date.now();
    let status = 0;
    let body = null;
    let note = '';
    try {
      const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      status = res.status;
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = { _raw: text.slice(0, 2000) };
      }
    } catch (err) {
      note = err.message;
    }
    results.push({ label, endpoint, status, ms: Date.now() - started, note });
    await fs.writeFile(path.join(OUT_DIR, `${label}.json`), JSON.stringify(redact(body), null, 2));
    const flag = status === 200 ? 'ok  ' : 'FAIL';
    console.log(`  ${flag} ${String(status).padEnd(4)} ${label.padEnd(24)} ${endpoint}`);
    return body;
  };

  const S = `/services/${serviceId}`;

  await authed('identity', '/token');
  const services = await authed('services', '/services');
  await authed('service', S);
  const gs = await authed('gameserver', `${S}/gameservers`);
  await authed('valheim', `${S}/gameservers/games/valheim`);
  await authed('settings', `${S}/gameservers/settings`);
  await authed('settings_defaults', `${S}/gameservers/settings/defaults`);
  await authed('backups', `${S}/gameservers/backups`);
  await authed('backups_restore_possible', `${S}/gameservers/backups/restore_possible`);
  await authed('notifications', `${S}/notifications`);
  await authed('tasks', `${S}/tasks`);
  await authed('tasks_list', `${S}/tasks/list`);
  await authed('packages', `${S}/gameservers/packages`);
  await authed('stats', `${S}/gameservers/stats`, { query: { hours: 24 } });
  await authed('logs_activity', `${S}/logs`, { query: { page: 1 } });
  await authed('player_lists', `${S}/gameservers/games/players/lists`);
  await authed('players', `${S}/gameservers/games/players`);
  await authed('adminlist', `${S}/gameservers/games/adminlist`);
  await authed('banlist', `${S}/gameservers/games/banlist`);
  await authed('whitelist', `${S}/gameservers/games/whitelist`);
  await authed('bookmarks', `${S}/gameservers/file_server/bookmarks`);

  // Walk the filesystem using the paths Nitrado actually reports.
  // config_files/log_files come back RELATIVE to the ftproot directory, so the
  // parent of game_specific.path is the base they resolve against.
  const gamePath = gs?.data?.gameserver?.game_specific?.path || null;
  const ftproot = gamePath ? gamePath.replace(/[^/]+\/?$/, '') : null;

  const dirs = [
    ftproot,
    gamePath,
    ftproot && `${ftproot}valheim/savedata`,
    ftproot && `${ftproot}valheim/savedata/worlds_local`,
    ftproot && `${ftproot}valheim/BepInEx`,
    ftproot && `${ftproot}valheim/BepInEx/config`,
    ftproot && `${ftproot}valheim/logs`,
  ].filter(Boolean);

  for (const dir of dirs) {
    const label = 'dir_' + dir.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(-34);
    await authed(label, `${S}/gameservers/file_server/list`, { query: { dir } });
  }

  // Searches are the reliable way to find logs when log_files[] is empty.
  for (const pattern of ['.log', 'worlds_local', 'adminlist', '.db2', '.fwl2']) {
    const label = 'search_' + pattern.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    await authed(label, `${S}/gameservers/file_server/list`, { query: { dir: ftproot, search: pattern } });
  }

  // Read the small text files that matter (list files, restart log, configs).
  const smallFiles = [
    ftproot && `${ftproot}valheim/savedata/adminlist.txt`,
    ftproot && `${ftproot}valheim/savedata/bannedlist.txt`,
    ftproot && `${ftproot}valheim/savedata/permittedlist.txt`,
    ftproot && `${ftproot}restart.log`,
    ftproot && `${ftproot}valheim/BepInEx/config/valheim_plus.cfg`,
  ].filter(Boolean);

  for (const file of smallFiles) {
    const label = 'file_' + path.basename(file).replace(/[^a-z0-9.]+/gi, '_');
    const meta = await authed(`${label}_link`, `${S}/gameservers/file_server/download`, { query: { file } });
    const url = meta?.data?.token?.url;
    if (!url) continue;
    try {
      const res = await fetch(url);
      const text = await res.text();
      await fs.writeFile(path.join(OUT_DIR, `${label}.txt`), text.slice(0, 8192));
      console.log(`  read      ${label.padEnd(24)} ${text.length} bytes`);
    } catch (err) {
      console.log(`  read FAIL ${label} ${err.message}`);
    }
  }

  console.log('\n--- summary ---');
  for (const r of results) {
    if (r.status !== 200) console.log(`  ${String(r.status).padEnd(4)} ${r.label}${r.note ? '  ' + r.note : ''}`);
  }
  console.log(`\nRaw responses written to ${OUT_DIR}\n`);
}

run().catch((err) => {
  console.error('\nprobe failed:', err.message);
  process.exit(1);
});
