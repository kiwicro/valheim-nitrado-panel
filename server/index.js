import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import posix from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { createClient, NitradoError } from './nitrado.js';
import { createStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const store = createStore(
  path.join(
    process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data'),
    'config.json'
  )
);
await store.load();

const client = createClient({
  getToken: () => store.resolve().token,
  baseUrl: process.env.NITRADO_BASE_URL || 'https://api.nitrado.net',
});

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(ROOT, 'public')));

/* ------------------------------------------------------------------ helpers */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Swallow "this game does not support that endpoint" style failures while still
 * surfacing real problems (bad token, rate limits, outages).
 */
const tolerate = (statuses) => (err) => {
  if (statuses.includes(err.status)) return null;
  throw err;
};

function requireService() {
  const { serviceId } = store.resolve();
  if (!serviceId) {
    throw new NitradoError('No server selected yet. Pick your Valheim service in Setup.', { status: 428 });
  }
  return serviceId;
}

/** Normalise the several shapes Nitrado uses for file lists into {name, path}. */
function normalizeFileList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return { name: posix.basename(entry), path: entry };
      const p = entry?.path || entry?.file || entry?.value || '';
      return { ...entry, name: entry?.name || posix.basename(p), path: p };
    })
    .filter((e) => e.path);
}

function normalizeService(s) {
  return {
    id: s.id,
    status: s.status,
    comment: s.comment || null,
    typeHuman: s.type_human || null,
    username: s.username || null,
    locationId: s.location_id,
    game: s.details?.game || null,
    gameHuman: s.details?.game || null,
    folderShort: s.details?.folder_short || null,
    address: s.details?.address || null,
    slots: s.details?.slots ?? null,
    roles: s.roles || [],
  };
}

async function fetchServerStatus(id) {
  const [serviceRes, gsRes, valheimRes] = await Promise.all([
    client.get(`/services/${id}`).catch(tolerate([404])),
    client.get(`/services/${id}/gameservers`),
    client.get(`/services/${id}/gameservers/games/valheim`).catch(tolerate([404, 400])),
  ]);

  const service = serviceRes?.data?.service || null;
  const gs = gsRes?.data?.gameserver || {};
  const valheim = valheimRes?.data?.valheim || null;
  const q = gs.query || {};
  const specific = gs.game_specific || {};

  return {
    service: service && {
      id: service.id,
      status: service.status,
      typeHuman: service.type_human,
      comment: service.comment,
      locationId: service.location_id,
      startDate: service.start_date,
      username: service.username,
      isOwner: service.is_owner,
      roles: service.roles || [],
    },
    server: {
      status: gs.status || service?.status || 'unknown',
      mustBeStarted: gs.must_be_started ?? null,
      ip: gs.ip || null,
      port: gs.port ?? null,
      queryPort: gs.query_port ?? null,
      game: gs.game || null,
      gameHuman: gs.game_human || null,
      memory: gs.memory || null,
      memoryMb: gs.memory_mb ?? null,
      slots: gs.slots ?? null,
      location: gs.location || null,
      rootPath: specific.path || null,
      updateStatus: specific.update_status || null,
      lastUpdate: specific.last_update || null,
      features: specific.features || {},
      logFiles: normalizeFileList(specific.log_files),
      configFiles: normalizeFileList(specific.config_files),
      credentials: gs.credentials || null,
      quota: gs.quota || null,
      hostSystems: gs.hostsystems || null,
      query: {
        serverName: q.server_name || null,
        connectIp: q.connect_ip || null,
        map: q.map || null,
        version: q.version || null,
        playerCurrent: q.player_current ?? null,
        playerMax: q.player_max ?? null,
        players: Array.isArray(q.players) ? q.players : [],
      },
    },
    valheim: valheim && {
      allWorlds: Array.isArray(valheim.all_worlds) ? valheim.all_worlds : [],
      currentWorld: valheim.current_world || null,
      maxManualBackups: valheim.max_manual_backups ?? null,
    },
    fetchedAt: Date.now(),
  };
}

async function readServerFile(serviceId, file, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const j = await client.get(`/services/${serviceId}/gameservers/file_server/download`, { query: { file } });
  const url = j?.data?.token?.url;
  if (!url) throw new NitradoError('Nitrado did not return a download link for that file.', { status: 502 });
  const res = await client.transfer(url);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) {
    return { content: buf.subarray(0, maxBytes).toString('utf8'), truncated: true, size: buf.length };
  }
  return { content: buf.toString('utf8'), truncated: false, size: buf.length };
}

async function writeServerFile(serviceId, file, content) {
  const dir = posix.dirname(file);
  const name = posix.basename(file);
  const j = await client.post(`/services/${serviceId}/gameservers/file_server/upload`, {
    form: { path: dir, file: name },
  });
  const t = j?.data?.token;
  if (!t?.url) throw new NitradoError('Nitrado did not return an upload link.', { status: 502 });

  let url = t.url;
  if (t.token && !url.includes('token=')) {
    url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t.token);
  }

  const form = new FormData();
  if (t.token) form.append('token', t.token);
  form.append('file', new Blob([content], { type: 'text/plain' }), name);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (err) {
    throw new NitradoError(`Upload failed: ${err.message}`, { status: 0 });
  }
  if (!res.ok) throw new NitradoError(`Upload failed (${res.status})`, { status: res.status });
  return { ok: true };
}

/* ------------------------------------------------------------------- config */

app.get('/api/config', (req, res) => {
  const cfg = store.resolve();
  res.json({
    tokenConfigured: Boolean(cfg.token),
    tokenHint: cfg.token ? `${cfg.token.slice(0, 6)}…${cfg.token.slice(-4)}` : null,
    tokenSource: cfg.tokenSource,
    serviceId: cfg.serviceId,
    serviceSource: cfg.serviceSource,
    apiBase: process.env.NITRADO_BASE_URL || 'https://api.nitrado.net',
    configPath: cfg.configPath,
    problem: cfg.problem,
  });
});

app.post(
  '/api/config',
  wrap(async (req, res) => {
    const patch = {};
    if (typeof req.body?.token === 'string') patch.token = req.body.token.trim();
    if (req.body?.serviceId !== undefined) {
      patch.serviceId = req.body.serviceId === null || req.body.serviceId === '' ? null : String(req.body.serviceId);
    }
    await store.save(patch);
    res.json({ ok: true, ...store.resolve() });
  })
);

app.get(
  '/api/account',
  wrap(async (req, res) => {
    const j = await client.get('/token');
    const token = j?.data?.token || {};
    const user = token.user || {};
    res.json({
      username: user.username || null,
      userId: user.id ?? null,
      validUntil: token.valid_until || null,
      scopes: token.scopes || [],
    });
  })
);

app.get(
  '/api/services',
  wrap(async (req, res) => {
    const j = await client.get('/services');
    const all = j?.data?.services || [];
    const gameservers = all.filter((s) => s.type === 'gameserver');
    // Fall back to every service so the picker is never mysteriously empty.
    const list = gameservers.length ? gameservers : all;
    const services = list.map(normalizeService);
    res.json({
      services,
      total: all.length,
      gameserverCount: gameservers.length,
      valheimIds: services
        .filter((s) => /valheim/i.test(`${s.folderShort || ''} ${s.game || ''} ${s.typeHuman || ''} ${s.comment || ''}`))
        .map((s) => s.id),
    });
  })
);

/* ------------------------------------------------------------------- server */

app.get(
  '/api/server',
  wrap(async (req, res) => {
    res.json(await fetchServerStatus(requireService()));
  })
);

app.post(
  '/api/server/:action',
  wrap(async (req, res) => {
    const id = requireService();
    const action = req.params.action;

    if (action === 'restart') {
      const j = await client.post(`/services/${id}/gameservers/restart`, {
        form: { message: req.body?.message || '', restart_message: req.body?.restartMessage || '' },
      });
      return res.json({ ok: true, action, message: j.message || 'Server will be restarted.' });
    }

    if (action === 'stop') {
      const j = await client.post(`/services/${id}/gameservers/stop`, {
        form: { message: req.body?.message || '', stop_message: req.body?.stopMessage || '' },
      });
      return res.json({ ok: true, action, message: j.message || 'Server will be stopped.' });
    }

    if (action === 'start') {
      // Nitrado wants the game folder short (e.g. "valheim") to start the game.
      let folder = null;
      try {
        const svc = await client.get(`/services/${id}`);
        folder = svc?.data?.service?.details?.folder_short;
      } catch {
        /* fall through to the gameserver details */
      }
      if (!folder) {
        const gs = await client.get(`/services/${id}/gameservers`);
        folder = gs?.data?.gameserver?.game || null;
      }
      if (!folder) throw new NitradoError('Could not determine the game folder short for this service.', { status: 422 });
      const j = await client.post(`/services/${id}/gameservers/games/start`, { form: { game: folder } });
      return res.json({ ok: true, action, message: j.message || 'Game will be started.' });
    }

    throw new NitradoError(`Unknown action "${action}".`, { status: 400 });
  })
);

app.get(
  '/api/stats',
  wrap(async (req, res) => {
    const id = requireService();
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
    const j = await client.get(`/services/${id}/gameservers/stats`, { query: { hours } });
    res.json({ hours, stats: j?.data?.stats || {} });
  })
);

/* ----------------------------------------------------------------- settings */

app.get(
  '/api/settings',
  wrap(async (req, res) => {
    const id = requireService();
    const [settings, defaults] = await Promise.all([
      client.get(`/services/${id}/gameservers/settings`),
      client.get(`/services/${id}/gameservers/settings/defaults`).catch(tolerate([404, 400])),
    ]);
    res.json({
      settings: settings?.data?.settings || {},
      defaults: defaults?.data?.settings || {},
    });
  })
);

app.post(
  '/api/settings',
  wrap(async (req, res) => {
    const id = requireService();
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) throw new NitradoError('No setting changes were provided.', { status: 400 });

    // Nitrado's settings endpoint only accepts one category/key/value per call.
    const results = [];
    for (const update of updates) {
      const { category, key, value } = update || {};
      if (!category || !key) {
        results.push({ category, key, ok: false, error: 'Missing category or key.' });
        continue;
      }
      try {
        await client.post(`/services/${id}/gameservers/settings`, { form: { category, key, value: value ?? '' } });
        results.push({ category, key, ok: true });
      } catch (err) {
        results.push({ category, key, ok: false, error: err.message });
      }
    }

    const failed = results.filter((r) => !r.ok);
    res.json({ ok: failed.length === 0, results, failed: failed.length });
  })
);

app.get(
  '/api/settings/sets',
  wrap(async (req, res) => {
    const id = requireService();
    const j = await client.get(`/services/${id}/gameservers/settings/sets`);
    res.json({ sets: j?.data?.sets || [] });
  })
);

app.post(
  '/api/settings/sets',
  wrap(async (req, res) => {
    const id = requireService();
    const j = await client.post(`/services/${id}/gameservers/settings/sets`, { form: { name: req.body?.name } });
    res.json({ ok: true, message: j.message });
  })
);

/* ------------------------------------------------------------------ players */

app.get(
  '/api/players',
  wrap(async (req, res) => {
    const id = requireService();
    const safe = (p) => client.get(p).catch(tolerate([404, 400, 422, 500]));
    const [lists, admin, ban, white, players, status] = await Promise.all([
      safe(`/services/${id}/gameservers/games/players/lists`),
      safe(`/services/${id}/gameservers/games/adminlist`),
      safe(`/services/${id}/gameservers/games/banlist`),
      safe(`/services/${id}/gameservers/games/whitelist`),
      safe(`/services/${id}/gameservers/games/players`),
      fetchServerStatus(id).catch(tolerate([404])),
    ]);

    res.json({
      supportedLists: lists?.data?.player_lists || [],
      playerIdType: lists?.data?.player_id_type || null,
      adminlist: admin?.data?.adminlist || [],
      banlist: ban?.data?.banlist || [],
      whitelist: white?.data?.whitelist || [],
      players: players?.data?.players || [],
      online: status?.server?.query?.players || [],
      onlineCount: status?.server?.query?.playerCurrent ?? null,
      maxPlayers: status?.server?.query?.playerMax ?? null,
    });
  })
);

app.post(
  '/api/players/lists/:list',
  wrap(async (req, res) => {
    const id = requireService();
    const list = req.params.list;
    const identifiers = Array.isArray(req.body?.identifiers) ? req.body.identifiers : [req.body?.identifier].filter(Boolean);
    if (!identifiers.length) throw new NitradoError('No player identifier provided.', { status: 400 });
    const j = await client.post(`/services/${id}/gameservers/games/${list}`, { form: { identifier: identifiers } });
    res.json({ ok: true, message: j.message || 'Added.', identifiers });
  })
);

app.delete(
  '/api/players/lists/:list',
  wrap(async (req, res) => {
    const id = requireService();
    const list = req.params.list;
    const identifiers = Array.isArray(req.body?.identifiers) ? req.body.identifiers : [req.body?.identifier].filter(Boolean);
    if (!identifiers.length) throw new NitradoError('No player identifier provided.', { status: 400 });
    const j = await client.del(`/services/${id}/gameservers/games/${list}`, { query: { identifier: identifiers.join(',') } });
    res.json({ ok: true, message: j.message || 'Removed.', identifiers });
  })
);

/* --------------------------------------------------------------------- logs */

app.get(
  '/api/logs/activity',
  wrap(async (req, res) => {
    const id = requireService();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const j = await client.get(`/services/${id}/logs`, { query: { page } });
    res.json({
      page: j?.data?.current_page ?? page,
      pageCount: j?.data?.page_count ?? 1,
      logCount: j?.data?.log_count ?? 0,
      perPage: j?.data?.logs_per_page ?? 40,
      logs: j?.data?.logs || [],
    });
  })
);

app.get(
  '/api/logs/file',
  wrap(async (req, res) => {
    const id = requireService();
    const file = req.query.path;
    if (!file) throw new NitradoError('No log file path provided.', { status: 400 });
    const lines = Math.min(Math.max(Number(req.query.lines) || 300, 10), 5000);
    const { content, truncated, size } = await readServerFile(id, file);
    const allLines = content.split(/\r?\n/);
    res.json({
      path: file,
      size,
      truncated,
      totalLines: allLines.length,
      lines: allLines.slice(-lines),
    });
  })
);

app.post(
  '/api/console',
  wrap(async (req, res) => {
    const id = requireService();
    const command = String(req.body?.command || '').trim();
    if (!command) throw new NitradoError('No command provided.', { status: 400 });
    const j = await client.post(`/services/${id}/gameservers/app_server/command`, { form: { command } });
    res.json({ ok: true, message: j.message || 'Command sent.', command });
  })
);

/* -------------------------------------------------------------------- files */

app.get(
  '/api/files',
  wrap(async (req, res) => {
    const id = requireService();
    const dir = req.query.dir || undefined;
    const j = await client.get(`/services/${id}/gameservers/file_server/list`, { query: { dir } });
    const entries = (j?.data?.entries || []).map((e) => ({
      type: e.type,
      name: e.name,
      path: e.path,
      size: e.size ?? null,
      modifiedAt: e.modified_at ?? null,
    }));
    res.json({ dir: dir || null, entries });
  })
);

app.get(
  '/api/files/read',
  wrap(async (req, res) => {
    const id = requireService();
    const file = req.query.path;
    if (!file) throw new NitradoError('No file path provided.', { status: 400 });
    const { content, truncated, size } = await readServerFile(id, file);
    res.json({ path: file, content, truncated, size });
  })
);

app.post(
  '/api/files/write',
  wrap(async (req, res) => {
    const id = requireService();
    const file = req.body?.path;
    const content = req.body?.content;
    if (!file) throw new NitradoError('No file path provided.', { status: 400 });
    if (typeof content !== 'string') throw new NitradoError('No file content provided.', { status: 400 });
    await writeServerFile(id, file, content);
    res.json({ ok: true, path: file, bytes: Buffer.byteLength(content) });
  })
);

app.get(
  '/api/files/bookmarks',
  wrap(async (req, res) => {
    const id = requireService();
    const j = await client.get(`/services/${id}/gameservers/file_server/bookmarks`);
    res.json({ bookmarks: j?.data?.bookmarks || [] });
  })
);

/* ---------------------------------------------------------------- error sink */

app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown endpoint ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  const status = err instanceof NitradoError ? err.status || 500 : err.status || 500;
  if (!(err instanceof NitradoError)) console.error(err);
  res.status(status === 0 ? 502 : status).json({
    error: err.message || 'Unexpected error',
    detail: err.payload?.raw || undefined,
  });
});

/* -------------------------------------------------------------------- start */

const PORT = Number(process.env.PORT) || 8420;
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  const cfg = store.resolve();
  const source =
    cfg.tokenSource === 'panel' ? 'saved in the panel' : cfg.tokenSource === 'env' ? 'from the environment' : null;

  console.log('');
  console.log('  Valheim / Nitrado control panel');
  console.log(`  -> http://${HOST}:${PORT}`);
  console.log(`  settings file: ${cfg.configPath}`);
  console.log(`  token:    ${cfg.token ? `loaded (${source})` : 'NOT set - open the panel and paste one'}`);
  console.log(`  service:  ${cfg.serviceId || 'not selected'}`);
  if (cfg.problem) {
    console.log('');
    console.log(`  !  ${cfg.problem}`);
  }
  console.log('');
});
