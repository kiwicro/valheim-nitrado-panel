/**
 * Sets the live map's fog of war so you only see what players have uncovered.
 *
 *   node tools/set-fog.mjs explored          # trails + cartography reveals
 *   node tools/set-fog.mjs trails            # only where players have walked
 *   node tools/set-fog.mjs off               # reveal the whole world
 *   node tools/set-fog.mjs explored --tint   # translucent tint instead of a solid cover
 *   node tools/set-fog.mjs --show            # report the current setting
 *
 * FogMode is the server-side default. Restart the server for a change to apply.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const REMOTE_CFG = '/valheim/BepInEx/config/valheimone.cfg';

const args = process.argv.slice(2);
const mode = args.find((a) => ['off', 'trails', 'explored'].includes(a));
const hide = !args.includes('--tint');

const ftp = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'ftp.json'), 'utf8'));
const client = new Client();
await client.access({ host: ftp.hostname, port: ftp.port, user: ftp.user || ftp.username, password: ftp.password, secure: false });

const local = path.join(process.env.TEMP, 'valheimone.cfg');
await client.downloadTo(local, REMOTE_CFG);
let conf = await fs.readFile(local, 'utf8');

function readInSection(text, section, key) {
  const lines = text.split(/\r?\n/);
  let inside = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[(.+)\]\s*$/);
    if (header) {
      inside = header[1].trim().toLowerCase() === section.toLowerCase();
      continue;
    }
    if (inside) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
      if (m) return m[1].trim();
    }
  }
  return null;
}

function setInSection(text, section, key, value) {
  const lines = text.split(/\r?\n/);
  let inside = false;
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^\s*\[(.+)\]\s*$/);
    if (header) {
      inside = header[1].trim().toLowerCase() === section.toLowerCase();
      continue;
    }
    if (inside && new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) lines[i] = `${key} = ${value}`;
  }
  return lines.join('\n');
}

if (!mode) {
  console.log('current settings:');
  for (const k of ['FogMode', 'FogHideUnexplored', 'SharedFog']) {
    console.log(`   ${k.padEnd(20)} ${readInSection(conf, 'LiveMap', k)}`);
  }
  client.close();
  process.exit(0);
}

conf = setInSection(conf, 'LiveMap', 'FogMode', mode);
conf = setInSection(conf, 'LiveMap', 'FogHideUnexplored', mode === 'off' ? 'false' : String(hide));
// Keep the shared view consistent if you ever hand the link out.
conf = setInSection(conf, 'LiveMap', 'SharedFog', mode === 'off' ? 'false' : 'true');

await fs.writeFile(local, conf, 'utf8');
await client.uploadFrom(local, REMOTE_CFG);
client.close();

console.log('updated valheimone.cfg:');
console.log(`   FogMode           = ${mode}`);
console.log(`   FogHideUnexplored = ${mode === 'off' ? 'false' : hide}${hide && mode !== 'off' ? '  (solid cover: unexplored areas, region names and markers hidden)' : mode !== 'off' ? '  (translucent tint)' : ''}`);
console.log(`   SharedFog         = ${mode === 'off' ? 'false' : 'true'}`);

if (mode !== 'off') {
  console.log('\nRestart the server for this to apply. Until players have explored, the map');
  console.log('will be almost entirely blank — that is the feature working.');
}
console.log('\nCheck the live state any time with:  node tools/set-fog.mjs');
