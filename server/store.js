import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY = { token: '', serviceId: null, liveMapToken: '', liveMapAdminFog: true };

/**
 * Tiny JSON file store for the settings the user enters in the panel (API token
 * and chosen service). Environment variables act as a fallback, so the panel
 * works either way. Stored at data/config.json, which is git-ignored.
 *
 * Two things this deliberately does NOT do:
 *   - silently discard a config file it cannot parse. A corrupt or locked file
 *     is kept, reported, and surfaced in the UI instead of being treated as
 *     "no token saved".
 *   - write the file in place. It writes a temp file and swaps it in, so a crash
 *     mid-write can never leave half a JSON document behind.
 */
export function createStore(file) {
  let state = { ...EMPTY };
  let loaded = false;
  let problem = null;

  async function load() {
    state = { ...EMPTY };
    problem = null;
    loaded = true;

    let raw;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return state; // first run — nothing saved yet
      problem =
        `Your settings file could not be read (${err.message}). ` +
        `Expected at ${file}. The panel started without a token.`;
      return state;
    }

    try {
      // Tolerate a UTF-8 BOM, which some editors (and PowerShell) add.
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
      state = {
        token: typeof parsed.token === 'string' ? parsed.token : '',
        serviceId: parsed.serviceId ?? null,
        liveMapToken: typeof parsed.liveMapToken === 'string' ? parsed.liveMapToken : '',
        liveMapAdminFog: typeof parsed.liveMapAdminFog === 'boolean' ? parsed.liveMapAdminFog : true,
      };
    } catch (err) {
      // Keep the broken file rather than quietly losing it.
      let kept = null;
      try {
        kept = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        await fs.rename(file, kept);
      } catch {
        kept = null;
      }
      problem =
        `Your settings file could not be understood (${err.message}). ` +
        (kept ? `It was kept as ${kept}. ` : '') +
        'The panel started without a token.';
    }
    return state;
  }

  async function save(patch) {
    state = { ...state, ...patch };
    const json = JSON.stringify(state, null, 2);

    await fs.mkdir(path.dirname(file), { recursive: true });

    // Atomic swap: a reader (or a crash) never sees a half-written file.
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, json, { mode: 0o600 });
    try {
      await fs.rename(temp, file); // replaces the destination on Windows and POSIX
    } catch {
      // Some Windows setups (antivirus, sync clients) can block the rename.
      await fs.writeFile(file, json, { mode: 0o600 });
      await fs.rm(temp, { force: true });
    }

    // Make sure it really landed on disk before reporting success.
    const written = await fs.readFile(file, 'utf8');
    const check = JSON.parse(written.replace(/^\uFEFF/, ''));
    if (check.token !== state.token || check.liveMapToken !== state.liveMapToken) {
      throw new Error(`Could not confirm the settings were written to ${file}`);
    }
    problem = null;
    return state;
  }

  function get() {
    return state;
  }

  function resolve() {
    const envToken = process.env.NITRADO_TOKEN?.trim() || '';
    const envService = process.env.NITRADO_SERVICE_ID?.trim() || '';
    const token = state.token || envToken;
    const serviceId = state.serviceId || envService || null;
    return {
      token,
      serviceId: serviceId ? String(serviceId) : null,
      liveMapToken: state.liveMapToken || '',
      liveMapAdminFog: state.liveMapAdminFog !== false,
      tokenSource: state.token ? 'panel' : envToken ? 'env' : 'none',
      serviceSource: state.serviceId ? 'panel' : envService ? 'env' : 'none',
      loaded,
      configPath: file,
      problem,
    };
  }

  return { load, save, get, resolve };
}
