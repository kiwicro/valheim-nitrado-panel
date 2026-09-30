/**
 * Downloads a complete copy of your world and its list files to
 * data/world-backup/, so you have a local snapshot that does not depend on
 * Nitrado's backup schedule.
 *
 *   node tools/pull-world.mjs
 *
 * Read-only: it never writes anything to the server.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const OUT = path.join(DATA_DIR, 'world-backup');
const BASE = process.env.NITRADO_BASE_URL || 'https://api.nitrado.net';

const config = JSON.parse((await fs.readFile(path.join(DATA_DIR, 'config.json'), 'utf8')).replace(/^\uFEFF/, ''));
if (!config.token) throw new Error('No Nitrado token saved yet.');
const serviceId = String(config.serviceId);

async function get(endpoint, query) {
  const url = new URL(BASE + endpoint);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${endpoint} -> HTTP ${res.status}`);
  return res.json();
}

const S = `/services/${serviceId}`;
const server = (await get(`${S}/gameservers`)).data.gameserver;
const savedata = `${server.game_specific.path}savedata`;

await fs.mkdir(OUT, { recursive: true });

let files = 0;
let bytes = 0;

async function save(remotePath, label) {
  const link = await get(`${S}/gameservers/file_server/download`, { file: remotePath });
  const url = link?.data?.token?.url;
  if (!url) throw new Error(`no download link for ${remotePath}`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const dest = path.join(OUT, label);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  files += 1;
  bytes += buf.length;
  console.log(`  ${label.padEnd(52)} ${String(buf.length).padStart(9)} bytes`);
}

async function walk(dir, prefix = '') {
  const listing = await get(`${S}/gameservers/file_server/list`, { dir });
  for (const entry of listing?.data?.entries || []) {
    const label = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'dir') await walk(entry.path, label);
    else await save(entry.path, label);
  }
}

console.log(`Backing up ${server.game_specific.path}savedata -> ${OUT}\n`);
await walk(savedata, 'savedata');

await fs.writeFile(
  path.join(OUT, 'README.txt'),
  [
    `Local backup of service ${serviceId} (${server.game_human})`,
    `Taken: ${new Date().toISOString()}`,
    `Server status at the time: ${server.status}`,
    `Files: ${files}, total ${bytes} bytes`,
    '',
    'This is a raw copy of savedata/, including worlds_local/ and the three',
    'player list files. To restore, upload these back over FTP with the server',
    'stopped. Never restore a world folder partially - copy the whole folder.',
    '',
  ].join('\n')
);

console.log(`\nDone: ${files} files, ${(bytes / 1024).toFixed(1)} KB -> ${OUT}`);
if (server.status !== 'stopped') {
  console.log('NOTE: the server was running, so the world may have been mid-save. Back up again with it stopped for a clean copy.');
}
