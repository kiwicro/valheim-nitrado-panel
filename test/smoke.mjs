/**
 * Smoke test — boots the fake Nitrado API and the panel against it, then checks
 * that the main endpoints answer with the shape the UI expects. No real Nitrado
 * account, credentials or outbound network access are involved.
 *
 *   npm test
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_ID = '12345678';

const children = [];
let stopping = false;
let checks = 0;
let failures = 0;
let tempDataDir = null;

function check(name, ok, detail = '') {
  checks += 1;
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function start(script, env, label) {
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  child.on('exit', (code) => {
    if (!stopping && code !== 0) console.error(`\n${label} exited with code ${code}:\n${output}\n`);
  });
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function stopAll() {
  stopping = true;
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('close', resolve);
          child.kill('SIGTERM');
          // Escalate only if a child ignores the polite request.
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 2000).unref();
        })
    )
  );
}

async function main() {
  const mockPort = await freePort();
  const panelPort = await freePort();
  const proxyPort = await freePort();
  const base = `http://127.0.0.1:${panelPort}`;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valheim-panel-smoke-'));
  tempDataDir = dataDir;

  const get = async (pathname) => {
    const res = await fetch(base + pathname);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  console.log(`\nSmoke test — mock API on :${mockPort}, panel on :${panelPort}\n`);

  start('test/mock-nitrado.mjs', { MOCK_PORT: String(mockPort) }, 'mock-nitrado');
  start(
    'server/index.js',
    {
      PORT: String(panelPort),
      LIVEMAP_PROXY_PORT: String(proxyPort),
      HOST: '127.0.0.1',
      NITRADO_DATA_DIR: dataDir,
      NITRADO_BASE_URL: `http://127.0.0.1:${mockPort}`,
      NITRADO_TOKEN: 'test-token',
      NITRADO_SERVICE_ID: SERVICE_ID,
    },
    'panel'
  );

  const ready = await waitFor(`${base}/api/config`);
  check('panel comes up and answers /api/config', ready);
  if (!ready) return;

  const home = await fetch(base + '/');
  check('serves the UI at /', home.ok && (await home.text()).includes('Valheim Control Panel'));

  const config = await get('/api/config');
  check('config reports the token from the environment', config.body?.tokenConfigured === true);
  check('config reports the selected service', config.body?.serviceId === SERVICE_ID, `got ${config.body?.serviceId}`);

  const account = await get('/api/account');
  check('account resolves through the API client', account.status === 200 && account.body?.username === 'demo_user');

  const services = await get('/api/services');
  check(
    'service list detects the Valheim server',
    services.status === 200 && Boolean(services.body?.valheimIds?.map(String).includes(SERVICE_ID))
  );

  const server = await get('/api/server');
  check(
    'server status loads',
    server.status === 200 && typeof server.body?.server?.status === 'string',
    `status ${server.status}`
  );

  const settings = await get('/api/settings');
  check(
    'settings load',
    settings.status === 200 && settings.body?.settings && Object.keys(settings.body.settings).length > 0
  );

  const stats = await get('/api/stats');
  check('stats load', stats.status === 200 && stats.body?.stats && 'cpuUsage' in stats.body.stats);
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.error(`\nSmoke test crashed: ${err.stack || err.message}\n`);
} finally {
  await stopAll();
  if (tempDataDir) await fs.rm(tempDataDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`);
// Set the code and let the event loop drain, so child handles close cleanly
// instead of racing a forced exit (which asserts on Windows).
process.exitCode = failures === 0 ? 0 : 1;
