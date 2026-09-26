/**
 * A fake Nitrado API shaped like a REAL Valheim service, used to develop and
 * demo the panel without touching a live server. Captured from an actual
 * Nitrado Valheim service in September 2026.
 *
 *   node test/mock-nitrado.mjs
 *   NITRADO_BASE_URL=http://127.0.0.1:8490 NITRADO_TOKEN=test-token npm start
 */

import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.MOCK_PORT) || 8490;
const SERVICE_ID = 12345678;
const USER = 'ni1234567_1';
const EXPECTED_TOKEN = 'test-token';
const FTPROOT = `/games/${USER}/ftproot/`;
const GAME = `${FTPROOT}valheim/`;
const SAVEDATA = `${GAME}savedata/`;
const WORLDS = `${SAVEDATA}worlds_local/`;
const BASE = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------------- state */

let status = 'started';

// Exactly the keys a real Nitrado Valheim service returns, with Nitrado's casing.
const settings = {
  general: {
    ServerName: 'Nitrado.net Gameserver',
    Password: 'secret1',
    WorldName: 'Dedicated',
    Public: 'true',
    Crossplay: 'false',
    Preset: 'Normal',
    CombatModifier: 'default',
    DeathPenaltyModifier: 'default',
    ResourcesModifier: 'default',
    RaidsModifier: 'default',
    PortalsModifier: 'default',
    nobuildcost: 'false',
    nocraftcost: 'false',
    noworkbench: 'false',
    allpiecesunlocked: 'false',
    allrecipesunlocked: 'false',
    dungeonbuild: 'false',
    nobossportals: 'false',
    teleportall: 'false',
    nomap: 'false',
    noportals: 'false',
    passivemobs: 'false',
    playerevents: 'true',
    fire: 'false',
    deathkeepequip: 'false',
    deathdeleteunequipped: 'false',
    deathdeleteitems: 'false',
    deathskillsreset: 'false',
  },
};

const lists = {
  adminlist: [
    { name: 'demo_user', id: 'demo_user', id_type: 'demo_user' },
    { name: 'Kjell', id: 'Steam_76561197960287930', id_type: 'steam' },
  ],
  banlist: [{ name: 'Griefer', id: 'Steam_76561198000000099', id_type: 'steam' }],
  whitelist: [],
};

const LIST_HEADERS = {
  'adminlist.txt': '// List adminlist.txt players ID  ONE per line\n',
  'bannedlist.txt': '// List banned players ID  ONE per line\n',
  'permittedlist.txt': '// List permitted players ID ONE per line\n',
};

const files = new Map([
  [`${FTPROOT}restart.log`, '2026-09-26 09:48:07 Stopping server (NITRAPI)\n'],
  [`${SAVEDATA}adminlist.txt`, `${LIST_HEADERS['adminlist.txt']}demo_user\nSteam_76561197960287930\n`],
  [`${SAVEDATA}bannedlist.txt`, `${LIST_HEADERS['bannedlist.txt']}Steam_76561198000000099\n`],
  [`${SAVEDATA}permittedlist.txt`, LIST_HEADERS['permittedlist.txt']],
  [`${WORLDS}Dedicated/_main.1.fwl2`, 'seed:1234567890'],
  [`${WORLDS}Dedicated/_main.1.db2`, '<binary world data>'],
  [`${WORLDS}Dedicated/_main.1.chunks`, '<chunk index>'],
  [`${WORLDS}Dedicated/00_00__0_1.chunk`, '<terrain chunk>'],
  [`${WORLDS}Dedicated/_main.1.ok`, 'done'],
  [`${WORLDS}Midgard/_main.3.fwl2`, 'seed:99887766'],
  [`${WORLDS}Midgard/_main.3.db2`, '<binary world data>'],
]);

const dirs = new Set([
  FTPROOT,
  GAME,
  SAVEDATA,
  WORLDS,
  `${WORLDS}Dedicated`,
  `${WORLDS}Midgard`,
]);

const DIR_SIZES = {
  [WORLDS]: 4096,
  [`${WORLDS}Dedicated`]: 2_140_000,
  [`${WORLDS}Midgard`]: 890_000,
};

let tasks = [
  {
    id: 19869625,
    status: 'active',
    minute: '29',
    hour: '7',
    day: '*',
    month: '*',
    weekday: '*',
    next_run: '2026-09-27T07:29:00',
    last_run: '1970-01-01T02:00:00',
    timezone: 'Europe/Zagreb',
    action_method: 'game_server_restart',
    action_data: 'Automated server restart in progress...',
  },
];

let notifications = [
  {
    id: 1,
    level: 'WARNING',
    type: 'default',
    message: 'Server is currently stopped.',
    message_long: 'Start the server from the dashboard to let players connect.',
    created_at: '2026-09-26T11:48:07',
    dismissed: false,
  },
];

const backups = {
  database: {},
  gameserver: {
    valheim: [
      { backup_type: 'incremental', backup_timestamp: 1790416114, backup_number: 862, backup_size: 2_147_483_648, backup_file_size: 12_400_000 },
      { backup_type: 'incremental', backup_timestamp: 1790329714, backup_number: 861, backup_size: 2_130_000_000, backup_file_size: 9_800_000 },
      { backup_type: 'master', backup_timestamp: 1790243314, backup_number: 860, backup_size: 2_120_000_000, backup_file_size: 2_120_000_000 },
    ],
  },
};

/* ----------------------------------------------------------------- helpers */

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function gameserver() {
  return {
    status,
    last_status_change: 1790416114,
    must_be_started: false,
    websocket_token: 'mock-websocket-token',
    hostsystems: { linux: { hostname: 'ms1337.nitrado.net', servername: 'ms1337', status: 'online' } },
    username: USER,
    user_id: 1234567,
    service_id: SERVICE_ID,
    location_id: 2,
    minecraft_mode: true,
    ip: '203.0.113.10',
    ipv6: null,
    port: 10320,
    query_port: 10321,
    rcon_port: 10320,
    label: 'ni',
    type: 'Gameserver',
    memory: 'Standard',
    memory_mb: 1024,
    game: 'valheim',
    game_human: 'Valheim',
    slots: 10,
    location: 'DE',
    restrictions: [],
    game_specific: {
      path: GAME,
      update_status: 'up_to_date',
      last_update: null,
      path_available: true,
      features: {
        has_backups: true,
        has_world_backups: true,
        has_rcon: false,
        has_application_server: false,
        has_container_websocket: true,
        has_file_browser: true,
        has_ftp: true,
        has_expert_mode: false,
        has_packages: true,
        has_plugin_system: false,
        has_restart_message_support: false,
        has_database: false,
        has_playermanagement_feature: true,
      },
      // Empty in real life for Valheim, and relative paths like the real API.
      log_files: [],
      config_files: [
        'valheim/savedata/adminlist.txt',
        'valheim/savedata/bannedlist.txt',
        'valheim/savedata/permittedlist.txt',
        'valheim/BepInEx/config/valheim_plus.cfg',
      ],
      mod_quota_mb: 0,
    },
    modpacks: {},
    credentials: { ftp: { hostname: 'ms1337.gamedata.io', port: 21, username: USER, password: 'ftp-pass' }, mysql: null },
    settings,
    quota: null,
    query:
      status === 'started'
        ? {
            server_name: settings.general.ServerName,
            connect_ip: '203.0.113.10:10320',
            map: 'Dedicated',
            version: '0.221.4',
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
  for (const part of buffer.toString('utf8').split(`--${boundary}`)) {
    if (!/name="file"/.test(part)) continue;
    const idx = part.indexOf('\r\n\r\n');
    if (idx === -1) continue;
    return part.slice(idx + 4).replace(/\r\n$/, '').replace(/--$/, '');
  }
  return null;
}

/* ------------------------------------------------------------------ router */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;

  // Transfer URLs are unauthenticated, exactly like Nitrado's signed links.
  if (p === '/transfer/download') {
    const file = url.searchParams.get('file') || '';
    const content = files.get(file);
    if (content === undefined) return send(res, 500, { status: 'error', message: 'File not found' });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(content);
  }
  if (p === '/transfer/upload') {
    const file = url.searchParams.get('file') || '';
    const body = await readBody(req);
    files.set(file, parseMultipartFile(body, req.headers['content-type']) ?? '<unparsed upload>');
    return send(res, 200, { status: 'success' });
  }
  if (p === '/transfer/size') {
    const dir = url.searchParams.get('dir') || '';
    let total = DIR_SIZES[dir] ?? 0;
    for (const [file, content] of files) if (file.startsWith(dir + '/')) total += content.length;
    return send(res, 200, { status: 'success', data: { size: total } });
  }

  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${EXPECTED_TOKEN}`) {
    return send(res, 401, { status: 'error', message: 'The provided access token is not valid.' });
  }

  const form = async () => Object.fromEntries(new URLSearchParams((await readBody(req)).toString('utf8')));

  if (p === '/token') {
    return send(res, 200, {
      status: 'success',
      data: { token: { id: 1, user: { id: 1234567, username: 'demo_user' }, valid_until: '2038-01-19T04:14:06', scopes: ['service', 'user_info'] } },
    });
  }

  if (p === '/services') {
    return send(res, 200, {
      status: 'success',
      data: {
        services: [
          {
            id: SERVICE_ID,
            location_id: 2,
            status: 'active',
            type: 'gameserver',
            type_human: 'Gameserver 10 Slots',
            sub_type: 'public',
            comment: null,
            username: USER,
            owner_username: 'demo_user',
            roles: ['ROLE_OWNER'],
            details: { address: '203.0.113.10:10320', game: 'Valheim', folder_short: 'valheim', portlist_short: 'valheim', slots: 10 },
          },
        ],
      },
    });
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
          type_human: 'Gameserver 10 Slots',
          comment: null,
          username: USER,
          owner_username: 'demo_user',
          is_owner: true,
          roles: ['ROLE_OWNER'],
          start_date: '2026-09-26T11:41:33',
          details: { folder_short: 'valheim' },
        },
      },
    });
  }

  if (rest === '/gameservers') return send(res, 200, { status: 'success', data: { gameserver: gameserver() } });

  if (rest === '/gameservers/games/valheim') {
    return send(res, 200, {
      status: 'success',
      data: {
        valheim: {
          max_manual_backups: 10,
          current_world: settings.general.WorldName,
          all_worlds: [],
          valheimplus: false,
          bepinex: false,
        },
      },
    });
  }

  if (rest === '/notifications') return send(res, 200, { status: 'success', data: { notifications } });

  if (rest === '/tasks' && req.method === 'GET') return send(res, 200, { status: 'success', data: { tasks } });
  if (rest === '/tasks/list') {
    return send(res, 200, {
      status: 'success',
      data: {
        tasks: [
          { game_server_restart: { desc: 'Restart the gameserver', data_desc: 'restart message' } },
          { game_server_start: { desc: 'Start the gameserver' } },
          { game_server_stop: { desc: 'Stop the gameserver', data_desc: 'stop message' } },
        ],
      },
    });
  }
  if (rest === '/tasks' && req.method === 'POST') {
    const body = await form();
    tasks.push({
      id: Math.floor(Math.random() * 1e8),
      status: 'active',
      minute: body.minute,
      hour: body.hour,
      day: body.day,
      month: body.month,
      weekday: body.weekday,
      next_run: '2026-09-28T00:00:00',
      last_run: null,
      timezone: 'Europe/Zagreb',
      action_method: body.action_method,
      action_data: body.action_data || '',
    });
    return send(res, 200, { status: 'success', message: 'Task has been created.' });
  }
  const taskDel = rest.match(/^\/tasks\/(\d+)$/);
  if (taskDel) {
    tasks = tasks.filter((t) => String(t.id) !== taskDel[1]);
    return send(res, 200, { status: 'success', message: 'Task has been deleted.' });
  }

  if (rest === '/gameservers/backups') {
    return send(res, 200, { status: 'success', data: { backups } });
  }
  if (rest === '/gameservers/backups/restore_possible') {
    return send(res, 200, { status: 'success', data: { restore_possible: true } });
  }
  const restoreMatch = rest.match(/^\/gameservers\/backups\/(gameserver|database)$/);
  if (restoreMatch && req.method === 'POST') {
    const body = await form();
    return send(res, 200, { status: 'success', data: `Restore of backup ${body.backup} queued.` });
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
  if (rest === '/gameservers/app_server/command') {
    // Real Valheim services have has_application_server:false and never get here.
    return send(res, 404, { status: 'error', message: 'No application server for this service' });
  }

  if (rest === '/gameservers/settings' && req.method === 'GET') {
    return send(res, 200, { status: 'success', data: { settings } });
  }
  if (rest === '/gameservers/settings/defaults') {
    const defaults = JSON.parse(JSON.stringify(settings));
    defaults.general.ServerName = 'Nitrado.net Gameserver';
    defaults.general.Password = '';
    defaults.general.WorldName = 'Dedicated';
    defaults.general.Playerevents = 'true';
    return send(res, 200, { status: 'success', data: { settings: defaults } });
  }
  if (rest === '/gameservers/settings' && req.method === 'POST') {
    const body = await form();
    if (!body.category || !body.key) return send(res, 422, { status: 'error', message: 'category and key are required' });
    if (!settings[body.category]) settings[body.category] = {};
    settings[body.category][body.key] = body.value;
    if (body.key === 'WorldName') status = status; // world switch takes effect on restart
    return send(res, 200, { status: 'success', data: { settings } });
  }

  if (rest === '/gameservers/games/players/lists') {
    return send(res, 200, { status: 'success', data: { player_lists: ['whitelist', 'adminlist', 'banlist'], player_id_type: 'steam' } });
  }
  if (rest === '/gameservers/games/players') {
    return send(res, 200, {
      status: 'success',
      data: {
        players: [
          { name: 'Kjell', id: 'Steam_76561197960287930', id_type: 'steam', online: 'true' },
          { name: 'Astrid', id: 'Steam_76561198000000042', id_type: 'steam', online: 'true' },
          { name: 'Griefer', id: 'Steam_76561198000000099', id_type: 'steam', online: 'false' },
          { name: 'Mystery Guest', id: 'not-a-platform-id', id_type: 'steam', online: 'false' },
        ],
      },
    });
  }

  const listMatch = rest.match(/^\/gameservers\/games\/(adminlist|banlist|whitelist)$/);
  if (listMatch) {
    const name = listMatch[1];
    if (req.method === 'GET') return send(res, 200, { status: 'success', data: { [name]: lists[name] } });

    const params = req.method === 'DELETE' ? Object.fromEntries(url.searchParams) : await form();
    const incoming = String(params.identifier || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

    if (req.method === 'POST') {
      for (const identifier of incoming) lists[name].push({ name: identifier, id: identifier, id_type: 'steam' });
      return send(res, 200, { status: 'success', message: `Added to ${name}.`, data: { identifier: incoming } });
    }
    if (req.method === 'DELETE') {
      lists[name] = lists[name].filter((e) => !incoming.includes(e.id) && !incoming.includes(e.name));
      return send(res, 200, { status: 'success', message: `Removed from ${name}.`, data: { identifier: incoming } });
    }
  }

  if (rest === '/logs') {
    const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
    const all = [
      { user: 'demo_user', category: 'server', severity: 'info', message: 'Server stopped.', created_at: '2026-09-26T11:48:07', admin: false },
      { user: 'demo_user', category: 'settings', severity: 'info', message: 'Has edited the server settings', created_at: '2026-09-26T11:45:00', admin: false },
    ];
    return send(res, 200, {
      status: 'success',
      data: { current_page: page, logs_per_page: 40, page_count: 1, log_count: all.length, logs: all },
    });
  }

  if (rest === '/gameservers/file_server/bookmarks') {
    return send(res, 200, {
      status: 'success',
      data: { bookmarks: [FTPROOT, `${FTPROOT}valheim`, SAVEDATA, `${GAME}BepInEx/config`] },
    });
  }

  if (rest === '/gameservers/file_server/list') {
    const dir = (url.searchParams.get('dir') || GAME).replace(/\/+$/, '');
    const summarize = url.searchParams.get('summarize_folders') === 'true';
    const prefix = `${dir}/`;
    const entries = [];
    for (const d of dirs) {
      const normalized = d.replace(/\/+$/, '');
      if (normalized === dir || !d.startsWith(prefix)) continue;
      const rel = d.slice(prefix.length).replace(/\/+$/, '');
      if (!rel || rel.includes('/')) continue;
      entries.push({ type: 'dir', name: rel, path: d, size: summarize ? DIR_SIZES[d] ?? 4096 : undefined });
    }
    for (const [file, content] of files) {
      if (!file.startsWith(prefix) || file.slice(prefix.length).includes('/')) continue;
      entries.push({ type: 'file', name: file.slice(prefix.length), path: file, size: content.length, modified_at: Math.floor(Date.now() / 1000) - 3600 });
    }
    return send(res, 200, { status: 'success', data: { entries } });
  }

  if (rest === '/gameservers/file_server/download') {
    const file = url.searchParams.get('file');
    if (!files.has(file)) return send(res, 500, { status: 'error', message: 'File not found' });
    return send(res, 200, { status: 'success', data: { token: { url: `${BASE}/transfer/download?file=${encodeURIComponent(file)}` } } });
  }

  if (rest === '/gameservers/file_server/upload') {
    const body = await form();
    const file = `${String(body.path).replace(/\/+$/, '')}/${body.file}`;
    return send(res, 200, {
      status: 'success',
      data: { token: { url: `${BASE}/transfer/upload?file=${encodeURIComponent(file)}`, token: 'upload-token' } },
    });
  }

  if (rest === '/gameservers/stats') {
    const now = Math.floor(Date.now() / 1000);
    const make = (fn) => Array.from({ length: 24 }, (_, i) => [fn(i), now - (24 - i) * 3600]);
    return send(res, 200, {
      status: 'success',
      data: {
        stats: {
          cpuUsage: make((i) => Math.round(20 + 12 * Math.sin(i / 2))),
          memoryUsage: make((i) => Math.round(45 + 8 * Math.cos(i / 2))),
          currentPlayers: make((i) => Math.round(2 + 2 * Math.sin(i / 2))),
          maxPlayers: make(() => 10),
        },
      },
    });
  }

  return send(res, 404, { status: 'error', message: `No mock route for ${p}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Nitrado (Valheim shaped) on ${BASE} — token: ${EXPECTED_TOKEN}`);
});
