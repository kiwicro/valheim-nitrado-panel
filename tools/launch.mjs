/**
 * Starts the control panel detached, waits until it answers, then opens the
 * browser. Invoked by "Start Valheim Panel.vbs" so no console window appears.
 *
 *   node tools/launch.mjs
 *
 * Exits 0 on success. On failure it prints the tail of data/panel.log so the
 * launcher can show it in a dialog — a silent failure would be worse than an
 * ugly one.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NITRADO_DATA_DIR ? path.resolve(process.env.NITRADO_DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 8420;
const PANEL_URL = `http://127.0.0.1:${PORT}`;
const LOG_FILE = path.join(DATA_DIR, 'panel.log');
const READY_TIMEOUT_MS = 30000;

async function panelAnswers() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${PANEL_URL}/api/config`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openBrowser(url) {
  const opts = { detached: true, stdio: 'ignore', windowsHide: true };
  if (process.platform === 'win32') {
    // The empty "" is the window title that `start` would otherwise eat.
    spawn('cmd', ['/c', 'start', '', url], opts).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], opts).unref();
  } else {
    spawn('xdg-open', [url], opts).unref();
  }
}

async function logTail(lines = 25) {
  try {
    const text = await fs.readFile(LOG_FILE, 'utf8');
    return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return `(no log file at ${LOG_FILE})`;
  }
}

async function main() {
  // Already up? Just show it — do not start a second copy.
  if (await panelAnswers()) {
    console.log('The panel is already running.');
    openBrowser(PANEL_URL);
    return 0;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });

  // Keep the log bounded across restarts.
  try {
    const stat = await fs.stat(LOG_FILE);
    if (stat.size > 1024 * 1024) await fs.rm(LOG_FILE, { force: true });
  } catch {
    /* no log yet */
  }

  const log = await fs.open(LOG_FILE, 'a');
  await log.write(`\n--- panel started ${new Date().toISOString()} ---\n`);

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd],
    env: process.env,
  });
  child.unref();
  await log.close();

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(400);
    if (await panelAnswers()) {
      console.log(`Panel ready at ${PANEL_URL}`);
      openBrowser(PANEL_URL);
      return 0;
    }
  }

  console.error(`The panel did not respond within ${READY_TIMEOUT_MS / 1000} seconds.`);
  console.error(`Port ${PORT} may be in use, or the server crashed.`);
  console.error('');
  console.error(await logTail());
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error(`Launcher failed: ${err.message}`);
    console.error('');
    console.error(await logTail());
    process.exit(1);
  });
