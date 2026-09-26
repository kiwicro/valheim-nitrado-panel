/**
 * A tiny fake Nitrado API used to develop and demo the panel without touching a
 * real server. It implements just enough of the NitrAPI for the panel's
 * Valheim workflows.
 *
 *   node test/mock-nitrado.mjs            # listens on 8490
 *   NITRADO_BASE_URL=http://127.0.0.1:8490 NITRADO_TOKEN=test-token npm start
 */

import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.MOCK_PORT) || 8490;
const SERVICE_ID = 12345;
const EXPECTED_TOKEN = 'test-token';
const ROOT = '/games/ni12345_1/ftproot/valheim';
const BASE = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------------- state */

let status = 'started';

const settings = {
  general: {
    server_name: 'Midgard',
    server_password: 'hunter2',
    world_name: 'Midgard',
    public: 'true',
    crossplay: 'false',
    server_id: '9012345678901234567',
  },
  config: {
    save_interval: '1800',
    backup_interval: '60',
    backups_to_keep: '5',
    daily_restart: 'true',
    restart_time: '05:00',
  },
  world: {
    preset: 'normal',
    combat: 'hard',
    deathpenalty: 'casual',
    resources: 'more',
    raids: 'less',
    portals: 'casual',
    nobuildcost: 'false',
    passivemobs: 'false',
    nomap: 'false',
    noportals: 'false',
    fire: 'false',
  },
  custom: {
    PlayerDamage: '100',
    EnemyDamage: '100',
    ResourceRate: '150',
    // An unknown key that carries its own option list from Nitrado.
    channel: { type: 'string', value: 'beta', options: ['stable', 'beta', 'experimental'] },
    // A key the schema has never heard of, with a plain boolean value.
    mystery_flag: 'true',
  },
  legacy: {
    // In the schema as a dropdown, but the stored value is not one of the
    // known choices - it should fall back to a text field, not a lie.
    combat: 'impossible',
  },
};

const lists = {
  adminlist: [{ name: 'Kjell', id: '76561198000000001', id_type: 'steamid' }],
  banlist: [{ name: 'Griefer', id: '76561198000000099', id_type: 'steamid' }],
  whitelist: [],
};

const files = new Map([
  [`${ROOT}/valheim-server.log`, 'Valheim server log\nStarted on port 2456\nWorld Midgard loaded\n'],
  [`${ROOT}/BepInEx/config/valheim_plus.cfg`, '[Server]\nenabled = true\nserverName = Midgard\n'],
]);

const dirs = new Set([ROOT, `${ROOT}/BepInEx`, `${ROOT}/BepInEx/config`]);

const activity = Array.from({ length: 45 }, (_, i) => ({
  user: 'Kiwi',
  category: i % 5 === 0 ? 'server' : 'filebrowser',
  severity: i % 7 === 0 ? 'error' : 'info',
  message: i % 5 === 0 ? 'Restart' : 'Has edited a file',
  created_at: new Date(Date.now() - i * 3600_000).toISOString(),
  admin: false,
}));

function statsSeries(hours) {
  const points = Math.max(8, Math.min(hours, 24));
  const now = Math.floor(Date.now() / 1000);
  const make = (fn) => Array.from({ length: points }, (_, i) => [fn(i), now - (points - i) * 3600]);
  return {
    currentPlayers: make((i) => Math.round(2 + 2 * Math.sin(i / 2))),
    maxPlayers: make(() => 10),
    cpuUsage: make((i) => Math.round(18 + 12 * Math.sin(i / 1.7))),
    memoryUsage: make((i) => Math.round(45 + 8 * Math.cos(i / 2.3))),
  };
}

/* ----------------------------------------------------------------- helpers */

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function gameserver() {
  return {
    must_be_started: false,
    status,
    websocket_token: 'mock-websocket-token',
    hostsystems: { linux: { hostname: 'ms123.nitrado.net', status: 'online' } },
    username: 'ni12345_1',
    service_id: SERVICE_ID,
    location_id: 2,
    ip: '1.2.3.4',
    port: 2456,
    query_port: 2457,
    label: 'ni',
    type: 'Gameserver',
    memory: 'Standard',
    memory_mb: 4096,
    game: 'valheim',
    game_human: 'Valheim',
    slots: 10,
    location: 'DE',
    credentials: {
      ftp: { hostname: 'ftp.nitrado.net', port: 21, username: 'ni12345_1', password: 'ftp-pass' },
    },
    game_specific: {
      path: `${ROOT}/`,
      update_status: 'up_to_date',
      last_update: null,
      path_available: true,
      features: {
        has_backups: true,
        has_application_server: true,
        has_container_websocket: false,
        has_file_browser: true,
        has_ftp: true,
        has_expert_mode: true,
        has_restart_message_support: true,
        has_database: false,
        has_rcon: false,
      },
      log_files: [`${ROOT}/valheim-server.log`],
      config_files: [`${ROOT}/BepInEx/config/valheim_plus.cfg`],
    },
    quota: { block_usage: 12_400_000, block_softlimit: 20_480_000, block_hardlimit: 25_600_000 },
    query:
      status === 'started'
        ? {
            server_name: 'Midgard',
            connect_ip: '1.2.3.4:2456',
            map: 'Midgard',
            version: '0.217.46',
            player_current: 2,
            player_max: 10,
            players: [
              { id: 1, name: 'Kjell', ping: 23, bot: false },
              { id: 2, name: 'Astrid', ping: 41, bot: false },
            ],
          }
        : {},
  };
}

/* ------------------------------------------------------------- file helpers */

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseMultipartFile(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = match?.[1] || match?.[2];
  if (!boundary) return null;
  const parts = buffer.toString('utf8').split(`--${boundary}`);
  for (const part of parts) {
    if (!/name="file"/.test(part)) continue;
    const idx = part.indexOf('\r\n\r\n');
    if (idx === -1) continue;
    return part
      .slice(idx + 4)
      .replace(/\r\n$/, '')
      .replace(/--$/, '');
  }
  return null;
}

/* ------------------------------------------------------------------ router */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;

  // Transfer URLs are unauthenticated (that is how Nitrado's signed links work).
  if (p === '/transfer/download') {
    const file = url.searchParams.get('file') || '';
    const content = files.get(file);
    if (content === undefined) return send(res, 404, { status: 'error', message: 'File not found' });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(content);
  }
  if (p === '/transfer/upload') {
    const file = url.searchParams.get('file') || '';
    const body = await readBody(req);
    const content = parseMultipartFile(body, req.headers['content-type']);
    files.set(file, content ?? '<unparsed upload>');
    return send(res, 200, { status: 'success' });
  }

  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${EXPECTED_TOKEN}`) {
    return send(res, 401, { status: 'error', message: 'The provided access token is not valid.' });
  }

  const json = () => readBody(req).then((b) => {
    try {
      return JSON.parse(b.toString('utf8') || '{}');
    } catch {
      return {};
    }
  });
  const form = (b) => Object.fromEntries(new URLSearchParams(b.toString('utf8')));

  // --- identity
  if (p === '/token') {
    return send(res, 200, {
      status: 'success',
      data: { token: { id: 1, user: { id: 7, username: 'Kiwi' }, valid_until: '2035-01-01T00:00:00', scopes: ['service'] } },
    });
  }

  // --- services
  if (p === '/services') {
    const services = process.env.MOCK_EMPTY_SERVICES === '1' ? [] : [
      {
        id: SERVICE_ID,
        location_id: 2,
        status: 'active',
        type: 'gameserver',
        type_human: 'Valheim 10 Slots',
        sub_type: 'public',
        comment: 'Valheim with the crew',
        username: 'ni12345_1',
        roles: ['ROLE_OWNER'],
        details: { address: '1.2.3.4:2456', game: 'Valheim', folder_short: 'valheim', portlist_short: 'valheim', slots: 10 },
      },
    ];
    return send(res, 200, { status: 'success', data: { services } });
  }

  const idMatch = p.match(/^\/services\/(\d+)(\/.*)?$/);
  if (!idMatch) return send(res, 404, { status: 'error', message: `No mock route for ${p}` });
  const rest = idMatch[2] || '';

  if (rest === '') {
    return send(res, 200, {
      status: 'success',
      data: {
        service: {
          id: SERVICE_ID,
          location_id: 2,
          status: 'active',
          type: 'gameserver',
          type_human: 'Valheim 10 Slots',
          comment: 'Valheim with the crew',
          username: 'ni12345_1',
          is_owner: true,
          roles: ['ROLE_OWNER'],
          start_date: '2026-01-05T12:00:00',
          details: { folder_short: 'valheim' },
        },
      },
    });
  }

  if (rest === '/gameservers') {
    return send(res, 200, { status: 'success', data: { gameserver: gameserver() } });
  }

  if (rest === '/gameservers/games/valheim') {
    return send(res, 200, {
      status: 'success',
      data: { valheim: { all_worlds: ['Midgard', 'Test'], max_manual_backups: 10, current_world: 'Midgard' } },
    });
  }

  if (rest === '/gameservers/games/start') {
    status = 'started';
    return send(res, 200, { status: 'success', message: 'Game will be started now.' });
  }
  if (rest === '/gameservers/restart') {
    status = 'restarting';
    setTimeout(() => (status = 'started'), 4000);
    return send(res, 200, { status: 'success', message: 'Server will be restarted now.' });
  }
  if (rest === '/gameservers/stop') {
    status = 'stopped';
    return send(res, 200, { status: 'success', message: 'Server will be stopped now.' });
  }

  if (rest === '/gameservers/stats') {
    return send(res, 200, { status: 'success', data: { stats: statsSeries(Number(url.searchParams.get('hours')) || 24) } });
  }

  if (rest === '/gameservers/settings' && req.method === 'GET') {
    return send(res, 200, { status: 'success', data: { settings } });
  }
  if (rest === '/gameservers/settings/defaults') {
    return send(res, 200, {
      status: 'success',
      data: {
        settings: {
          general: {
            server_name: 'Valheim Server',
            server_password: '',
            world_name: 'Dedicated',
            public: 'true',
            crossplay: 'false',
            server_id: '',
          },
          config: {
            save_interval: '1800',
            backup_interval: '60',
            backups_to_keep: '5',
            daily_restart: 'true',
            restart_time: '05:00',
          },
          world: {
            preset: 'normal',
            combat: 'normal',
            deathpenalty: 'normal',
            resources: 'normal',
            raids: 'normal',
            portals: 'normal',
            nobuildcost: 'false',
            passivemobs: 'false',
            nomap: 'false',
            noportals: 'false',
            fire: 'false',
          },
          custom: {
            PlayerDamage: '100',
            EnemyDamage: '100',
            ResourceRate: '100',
            channel: { type: 'string', value: 'stable', options: ['stable', 'beta', 'experimental'] },
            mystery_flag: 'false',
          },
        },
      },
    });
  }
  if (rest === '/gameservers/settings' && req.method === 'POST') {
    const body = form(await readBody(req));
    if (!body.category || !body.key) return send(res, 422, { status: 'error', message: 'category and key are required' });
    if (!settings[body.category]) settings[body.category] = {};
    const existing = settings[body.category][body.key];
    // Settings that carry metadata keep it; only the value changes.
    if (existing && typeof existing === 'object' && 'value' in existing) existing.value = body.value;
    else settings[body.category][body.key] = body.value;
    return send(res, 200, { status: 'success', data: { settings } });
  }

  if (rest === '/gameservers/games/players/lists') {
    return send(res, 200, { status: 'success', data: { player_lists: ['adminlist', 'banlist', 'whitelist'], player_id_type: 'steamid' } });
  }
  if (rest === '/gameservers/games/players') {
    const known = [...lists.adminlist, ...lists.banlist].map((e) => ({ name: e.name, id: e.id, id_type: e.id_type, online: 'false' }));
    return send(res, 200, { status: 'success', data: { players: known } });
  }

  const listMatch = rest.match(/^\/gameservers\/games\/(adminlist|banlist|whitelist)$/);
  if (listMatch) {
    const name = listMatch[1];
    if (!lists[name]) lists[name] = [];
    if (req.method === 'GET') return send(res, 200, { status: 'success', data: { [name]: lists[name] } });

    const raw = (await readBody(req)).toString('utf8');
    const body = req.method === 'DELETE' ? Object.fromEntries(url.searchParams) : form(raw);
    const incoming = String(body.identifier || '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (req.method === 'POST') {
      for (const identifier of incoming) lists[name].push({ name: identifier, id: identifier, id_type: 'steamid' });
      return send(res, 200, { status: 'success', message: `Added to ${name}.`, data: { identifier: incoming } });
    }
    if (req.method === 'DELETE') {
      lists[name] = lists[name].filter((e) => !incoming.includes(e.id) && !incoming.includes(e.name));
      return send(res, 200, { status: 'success', message: `Removed from ${name}.`, data: { identifier: incoming } });
    }
  }

  if (rest === '/logs') {
    const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
    const perPage = 40;
    const start = (page - 1) * perPage;
    return send(res, 200, {
      status: 'success',
      data: {
        current_page: page,
        logs_per_page: perPage,
        page_count: Math.ceil(activity.length / perPage),
        log_count: activity.length,
        logs: activity.slice(start, start + perPage),
      },
    });
  }

  if (rest === '/gameservers/file_server/bookmarks') {
    return send(res, 200, { status: 'success', data: { bookmarks: [`${ROOT}/`] } });
  }

  if (rest === '/gameservers/file_server/list') {
    const dir = (url.searchParams.get('dir') || ROOT).replace(/\/+$/, '');
    const prefix = `${dir}/`;
    const entries = [];
    for (const d of dirs) {
      if (d !== dir && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) {
        entries.push({ type: 'dir', name: d.slice(prefix.length), path: d });
      }
    }
    for (const [file] of files) {
      if (file.startsWith(prefix) && !file.slice(prefix.length).includes('/')) {
        entries.push({ type: 'file', name: file.slice(prefix.length), path: file, size: files.get(file).length, modified_at: Math.floor(Date.now() / 1000) });
      }
    }
    return send(res, 200, { status: 'success', data: { entries } });
  }

  if (rest === '/gameservers/file_server/download') {
    const file = url.searchParams.get('file');
    if (!files.has(file)) return send(res, 404, { status: 'error', message: 'File not found' });
    return send(res, 200, { status: 'success', data: { token: { url: `${BASE}/transfer/download?file=${encodeURIComponent(file)}` } } });
  }

  if (rest === '/gameservers/file_server/upload') {
    const body = form(await readBody(req));
    const file = `${String(body.path).replace(/\/+$/, '')}/${body.file}`;
    return send(res, 200, {
      status: 'success',
      data: { token: { url: `${BASE}/transfer/upload?file=${encodeURIComponent(file)}`, token: 'upload-token' } },
    });
  }

  if (rest === '/gameservers/app_server/command') {
    const body = form(await readBody(req));
    files.set(`${ROOT}/valheim-server.log`, `${files.get(`${ROOT}/valheim-server.log`) || ''}> ${body.command}\n`);
    return send(res, 200, { status: 'success', message: 'Command successfully sent to the application server' });
  }

  return send(res, 404, { status: 'error', message: `No mock route for ${p}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Nitrado API listening on ${BASE} (token: ${EXPECTED_TOKEN})`);
});
