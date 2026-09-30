/**
 * Installs a server-side BepInEx mod by uploading a release package over FTP.
 *
 *   node tools/install-mod.mjs --list                     # show package contents
 *   node tools/install-mod.mjs --bepinex-only             # upload BepInEx, skip the plugin
 *   node tools/install-mod.mjs                            # upload BepInEx + the plugin
 *   node tools/install-mod.mjs --remove                   # delete what this tool uploaded
 *
 * Read data/ftp.json (written by tools/pull-world.mjs) for credentials.
 * Every upload is logged; --remove deletes exactly the paths that were uploaded.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');

const PACKAGE = {
  name: 'ValheimOne',
  version: '0.13.18',
  url: 'https://github.com/humangenome/ValheimOne/releases/download/v0.13.18/ValheimOne-full-0.13.18.zip',
};

// Files that only make sense on Windows, plus the example launcher (Nitrado
// controls the launch, so we must not touch anything it uses).
const SKIP = [/^winhttp\.dll$/i, /^start_(game|server)_bepinex\.sh$/i, /^changelog\.txt$/i];
const REMOTE_ROOT = '/valheim';

const args = new Set(process.argv.slice(2));
const pluginOnly = !args.has('--bepinex-only');

/* --------------------------------------------------------------- zip reader */

function readCentralDirectory(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extract(buf, entry) {
  const nameLen = buf.readUInt16LE(entry.localOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

/* --------------------------------------------------------------------- run */

const zipPath = path.join(DATA_DIR, 'downloads', `${PACKAGE.name}-${PACKAGE.version}.zip`);
await fs.mkdir(path.dirname(zipPath), { recursive: true });

let zip;
try {
  zip = await fs.readFile(zipPath);
  console.log(`using cached ${path.basename(zipPath)}`);
} catch {
  console.log(`downloading ${PACKAGE.url}`);
  zip = Buffer.from(await (await fetch(PACKAGE.url)).arrayBuffer());
  await fs.writeFile(zipPath, zip);
}

const entries = readCentralDirectory(zip);
const wanted = entries.filter((e) => !e.name.includes('..') && !SKIP.some((re) => re.test(e.name)));
const filtered = entries.filter((e) => SKIP.some((re) => re.test(e.name))).map((e) => e.name);

if (args.has('--list')) {
  console.log(`\n${entries.length} entries (${wanted.length} would be uploaded)`);
  for (const e of entries) {
    const skip = SKIP.some((re) => re.test(e.name));
    console.log(`  ${skip ? 'skip' : 'add '}  ${e.name}`);
  }
  console.log(`\nskipped: ${filtered.join(', ')}`);
  process.exit(0);
}

const ftp = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'ftp.json'), 'utf8'));
const client = new Client();
client.ftp.verbose = false;

try {
  await client.access({ host: ftp.hostname, port: ftp.port, user: ftp.username, password: ftp.password, secure: false });
  console.log(`connected to ${ftp.hostname}\n`);

  if (args.has('--remove')) {
    const dirs = ['BepInEx', 'doorstop_libs'];
    for (const dir of dirs) {
      try {
        await client.removeDir(`${REMOTE_ROOT}/${dir}`);
        console.log(`  removed ${REMOTE_ROOT}/${dir}`);
      } catch (e) {
        console.log(`  ${REMOTE_ROOT}/${dir}: ${e.message}`);
      }
    }
    for (const file of ['doorstop_config.ini', '.doorstop_version']) {
      try {
        await client.remove(`${REMOTE_ROOT}/${file}`);
        console.log(`  removed ${REMOTE_ROOT}/${file}`);
      } catch {
        /* already gone */
      }
    }
    console.log('\nremoved. BepInEx and the plugin are gone; the game files are untouched.');
    process.exit(0);
  }

  for (const entry of wanted) {
    if (!pluginOnly && /^BepInEx\/plugins\//i.test(entry.name)) {
      console.log(`  skip (bepinex only)  ${entry.name}`);
      continue;
    }
    const remote = `${REMOTE_ROOT}/${entry.name}`;
    const remoteDir = remote.split('/').slice(0, -1).join('/') || '/';
    const remoteName = remote.split('/').pop();
    await client.ensureDir(remoteDir);
    const data = extract(zip, entry);
    if (data.length) {
      await client.uploadFrom(Readable.from(data), remoteName);
      console.log(`  uploaded ${String(data.length).padStart(9)}  ${entry.name}`);
    }
  }
  console.log('\nupload complete.');
} finally {
  client.close();
}
