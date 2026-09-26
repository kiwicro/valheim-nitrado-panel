/**
 * Stops a panel started by tools/launch.mjs.
 *
 *   node tools/stop.mjs
 *
 * The server writes data/panel.pid on start, so this only ever kills the
 * process it started — not every node.exe on the machine.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const PID_FILE = path.join(DATA_DIR, 'panel.pid');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Guard against a recycled PID belonging to something else entirely. */
function looksLikeNode(pid) {
  if (process.platform !== 'win32') return true;
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /"node\.exe"/i.test(out);
  } catch {
    return false;
  }
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(PID_FILE, 'utf8');
  } catch {
    console.log('The panel does not appear to be running (no pid file).');
    return 0;
  }

  const pid = Number(raw.trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    await fs.rm(PID_FILE, { force: true });
    console.log('The pid file was unreadable, so it has been cleared.');
    return 0;
  }

  if (!isAlive(pid)) {
    await fs.rm(PID_FILE, { force: true });
    console.log('The panel is not running any more.');
    return 0;
  }

  if (!looksLikeNode(pid)) {
    await fs.rm(PID_FILE, { force: true });
    console.log(`Refused to stop pid ${pid}: it is not a node process, so the pid file was stale.`);
    return 0;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('exit', resolve);
    });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }

  await fs.rm(PID_FILE, { force: true });
  console.log(`Panel stopped (pid ${pid}).`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Could not stop the panel: ${err.message}`);
    process.exit(1);
  });
