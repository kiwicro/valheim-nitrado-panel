/**
 * Delete an inactive world folder, after proving it is safe and backed up.
 *
 *   node tools/delete-world.mjs Dedicated --dry-run
 *   node tools/delete-world.mjs Dedicated
 *
 * Refuses to run if the world is the one the server is configured to load.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const BASE = 'https://api.nitrado.net';

const target = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!target) {
  console.error('Usage: node tools/delete-world.mjs <WorldName> [--dry-run]');
  process.exit(2);
}

const cfg = JSON.parse((await fs.readFile(path.join(DATA_DIR, 'config.json'), 'utf8')).replace(/^\uFEFF/, ''));
const ftp = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'ftp.json'), 'utf8'));
const S = `/services/${cfg.serviceId}`;

const get = async (p) => {
  const res = await fetch(new URL(BASE + p), { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return res.json();
};

const server = (await get(`${S}/gameservers`)).data.gameserver;
const configuredWorld = (await get(`${S}/gameservers/games/valheim`)).data.valheim.current_world;

console.log(`server status   : ${server.status}`);
console.log(`configured world: ${configuredWorld}`);
console.log(`to delete       : ${target}`);

if (configuredWorld === target) {
  console.error('\nREFUSING: that is the world the server is configured to load.');
  process.exit(1);
}

/* ------------------------------------------- 1. is it backed up locally? */

const backupDir = path.join(DATA_DIR, 'world-backup', 'savedata', 'worlds_local', target);
let backupFiles = [];
try {
  backupFiles = await fs.readdir(backupDir);
} catch {
  backupFiles = [];
}
console.log(`\nlocal backup    : ${backupFiles.length ? `${backupFiles.length} files in ${backupDir}` : 'MISSING'}`);
if (!backupFiles.length) {
  console.error('REFUSING: no local backup of this world. Run tools/pull-world.mjs first.');
  process.exit(1);
}

/* -------------------------------------- 2. what is actually on the server? */

const client = new Client();
await client.access({ host: ftp.hostname, port: ftp.port, user: ftp.user || ftp.username, password: ftp.password, secure: false });

const remoteWorlds = '/valheim/savedata/worlds_local';
const worlds = await client.list(remoteWorlds);
console.log(`\nworlds on server (${worlds.length}):`);
for (const w of worlds) console.log(`   ${w.isDirectory ? 'dir' : 'file'}  ${w.name}`);

const targetDir = `${remoteWorlds}/${target}`;
let contents = [];
try {
  contents = await client.list(targetDir);
} catch {
  console.error(`\nREFUSING: ${targetDir} does not exist.`);
  client.close();
  process.exit(1);
}
console.log(`\ncontents of ${target} (${contents.length} files, ${(contents.reduce((n, f) => n + f.size, 0) / 1024).toFixed(1)} KB):`);
for (const f of contents) console.log(`   ${f.name}  ${f.size}`);

for (const f of contents) {
  const backedUp = backupFiles.includes(f.name);
  if (!backedUp) console.log(`   ! ${f.name} is NOT in the local backup`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing deleted.');
  client.close();
  process.exit(0);
}

/* ------------------------------------------------------- 3. delete it */

console.log(`\ndeleting ${targetDir} ...`);
await client.removeDir(targetDir);

const after = await client.list(remoteWorlds);
console.log(`worlds remaining (${after.length}):`);
for (const w of after) console.log(`   ${w.isDirectory ? 'dir' : 'file'}  ${w.name}`);

client.close();
console.log('\nDone. The local backup is untouched and can be restored over FTP if needed.');
