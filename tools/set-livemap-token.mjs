/**
 * Generates a live-map access token, stores it locally, and writes it into
 * valheimone.cfg on the server — the token itself never reaches a browser.
 *
 *   node tools/set-livemap-token.mjs                 # lock down (PublicView off)
 *   node tools/set-livemap-token.mjs --keep-public   # keep the read-only map public
 *   node tools/set-livemap-token.mjs --show          # just print where things stand
 *
 * Restart the server afterwards for the config change to take effect.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const REMOTE_CFG = '/valheim/BepInEx/config/valheimone.cfg';

const args = new Set(process.argv.slice(2));
const keepPublic = args.has('--keep-public');
const showOnly = args.has('--show');

const store = JSON.parse((await fs.readFile(CONFIG_FILE, 'utf8')).replace(/^\uFEFF/, ''));

if (showOnly) {
  console.log(`local token saved : ${store.liveMapToken ? 'yes' : 'no'}`);
  process.exit(0);
}

/* --------------------------------------------------------- generate + store */

const token = crypto.randomBytes(24).toString('base64url'); // 32 chars, URL-safe
store.liveMapToken = token;
await fs.writeFile(CONFIG_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
console.log(`generated a ${token.length}-character token and saved it to ${CONFIG_FILE}`);

/* ------------------------------------------------------ update the mod config */

const ftp = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'ftp.json'), 'utf8'));
const client = new Client();
await client.access({ host: ftp.hostname, port: ftp.port, user: ftp.user || ftp.username, password: ftp.password, secure: false });

const local = path.join(process.env.TEMP, 'valheimone.cfg');
await client.downloadTo(local, REMOTE_CFG);
let conf = await fs.readFile(local, 'utf8');

/** Replace `key = ...` inside `[section]`, creating the line if missing. */
function setInSection(text, section, key, value) {
  const lines = text.split(/\r?\n/);
  let inside = false;
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^\s*\[(.+)\]\s*$/);
    if (header) {
      inside = header[1].trim().toLowerCase() === section.toLowerCase();
      continue;
    }
    if (inside && new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) {
      lines[i] = `${key} = ${value}`;
      found = true;
    }
  }
  if (!found) {
    // Append at the end of the section.
    const out = [];
    let inTarget = false;
    for (const line of lines) {
      const header = line.match(/^\s*\[(.+)\]\s*$/);
      out.push(line);
      if (header) inTarget = header[1].trim().toLowerCase() === section.toLowerCase();
      else if (inTarget && !found) {
        out.push(`${key} = ${value}`);
        found = true;
      }
    }
    return out.join('\n');
  }
  return lines.join('\n');
}

conf = setInSection(conf, 'LiveMap', 'AccessToken', token);
conf = setInSection(conf, 'LiveMap', 'PublicView', keepPublic ? 'true' : 'false');
conf = setInSection(conf, 'LiveMap', 'PublicPins', 'false');
conf = setInSection(conf, 'LiveMap', 'StatusPublic', keepPublic ? 'true' : 'false');
conf = setInSection(conf, 'LiveMap', 'ConsoleEnabled', 'true');

await fs.writeFile(local, conf, 'utf8');
await client.uploadFrom(local, REMOTE_CFG);
client.close();

console.log('\nupdated valheimone.cfg on the server:');
console.log(`   AccessToken   = <${token.length} chars, hidden>`);
console.log(`   PublicView    = ${keepPublic ? 'true (map stays readable without the token)' : 'false (map requires the token)'}`);
console.log(`   StatusPublic  = ${keepPublic ? 'true' : 'false'}`);
console.log('   ConsoleEnabled = true');
console.log('\nRestart the server for this to take effect:');
console.log('   the panel will proxy the map and inject the token itself, so it never lands in your browser.');
