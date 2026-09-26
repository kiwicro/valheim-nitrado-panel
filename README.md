# Valheim Control Panel (Nitrado)

A small local web panel for a Valheim dedicated server hosted on **Nitrado**. It
talks to Nitrado's REST API (the NitrAPI) so you can run the server from a
browser instead of clicking through the Nitrado web interface.

Everything runs on your own PC. Your API token never leaves the machine except
when the panel calls Nitrado directly.

![tabs](https://img.shields.io/badge/tabs-Dashboard%20%C2%B7%20Settings%20%C2%B7%20Players%20%C2%B7%20Logs%20%C2%B7%20Files-e0a94a)

---

## What it does

| Tab | What you get |
| --- | --- |
| **Dashboard** | Live status (running / stopped / restarting…), one-click **Start**, **Restart**, **Stop**, players-online bar, world, connect address, server facts, 24h CPU / memory / player charts. |
| **Server settings** | Edits the settings Nitrado exposes for your server (server name, password, world, public, crossplay, save interval, world modifiers…). Renders whatever your service actually returns, grouped by category. |
| **Players & admins** | Who is online right now, plus add/remove entries in the **admin**, **ban** and **whitelist** lists. |
| **Logs & console** | Send a live console command, tail the server log file with auto-refresh, and browse Nitrado's activity log (restarts, edits…). |
| **Files** | Browse the server filesystem, open a text file, edit and save it (useful for `valheim_plus.cfg`-style configs). |

---

## Requirements

- **Node.js 20 or newer** (tested on Node 25).
- A Nitrado server that is a **gameserver** service.

## Setup (2 minutes)

```powershell
npm install
npm start
```

Then open <http://127.0.0.1:8420>.

On first run the panel asks for:

1. **A Nitrado API token** — open the **Developer Portal** at
   <https://server.nitrado.net/eng/developer/tokens> and create a
   **long-life token**. Tick the service permissions so every tab works:
   general control, settings (read + write), logs, file browser (read + write)
   and console. Backups is optional.
2. **Your Valheim server** — the panel lists your game servers and preselects the
   Valheim one.

Paste the token, click **Save & continue**, and the dashboard loads.

### Optional: pre-seed the config

Instead of using the setup screen you can copy `.env.example` to `.env` and set:

```
NITRADO_TOKEN=your-token-here
NITRADO_SERVICE_ID=123456
PORT=8420
HOST=127.0.0.1
```

Values entered in the panel are stored in `data/config.json` (git-ignored) and
take priority over `.env`.

---

## Things worth knowing

- **Restart to apply.** Nitrado applies most settings changes on the next server
  start. The Settings tab warns you when the server is running; stopping it and
  waiting a minute or two before saving is the most reliable order.
- **Settings are one-at-a-time.** The panel saves each changed setting in
  sequence and reports any that failed, because the Nitrado API only accepts one
  `category`/`key`/`value` per request.
- **Admin/ban lists use player IDs.** For Valheim these are Steam IDs (or
  platform IDs on crossplay). Some games don't support the whitelist endpoint, in
  which case that card just stays empty.
- **World switching is read-only.** The Nitrado API exposes the current world and
  the list of worlds, but has no endpoint to change it — so the panel shows them
  without pretending otherwise.
- **Log paths come from Nitrado.** `game_specific.log_files` tells the panel which
  files to offer. If your server reports none, choose *Custom path…* and enter a
  path such as `/games/<username>/ftproot/valheim/valheim-server.log`.
- **Rate limits.** Nitrado throttles at 429 and sometimes returns 503 during
  maintenance; the panel retries automatically and shows a banner if it can't
  recover.

## Customising the settings labels

The Settings tab does not show raw config keys. Every setting gets a friendly
name, a hover explanation, and — where only certain values are valid — a
dropdown that describes what each choice does.

That mapping lives in **`public/settings-schema.js`** and is just a list of
entries. To rename something, or explain a setting Nitrado reports that isn't
covered yet:

```js
my_setting: {
  aliases: ['my_setting', 'mySetting', 'My Setting'],  // any spelling Nitrado uses
  label: 'My setting',                                  // shown in the panel
  help: 'What it does, shown on hover.',
  type: 'enum',                                         // text | password | number | boolean | enum
  options: [
    { value: 'low',  label: 'Low',  help: 'Shown under the dropdown when picked.' },
    { value: 'high', label: 'High', help: 'Shown under the dropdown when picked.' },
  ],
},
```

Aliases are matched with punctuation and case ignored, so one entry covers
`save_interval`, `saveInterval` and `Save Interval`. Save the file and refresh —
no restart, no build step.

Two safety rules worth knowing:

- **Nitrado's own option lists win.** If a setting arrives with an `options`
  array attached, the panel builds a dropdown from it automatically, even for
  settings this file has never heard of.
- **An unrecognised value is never hidden.** If a setting is meant to be a
  dropdown but its stored value isn't one of the known choices, the panel falls
  back to a plain text field rather than silently changing your setting to
  something else.

Anything not listed still renders with a tidy name generated from the key and a
"no description yet" tooltip, so nothing is ever invisible.

## Security

- The panel binds to `127.0.0.1` by default, so only this PC can reach it.
- The token is sent only to `api.nitrado.net` from the server side — the browser
  never sees it.
- `data/config.json` holds the token and is git-ignored.

The token is **not encrypted at rest**. Anyone who can read `data/config.json`
can read your token. See below for how to live with that.

### Where the token is stored

When you paste a token into the panel it is written to **`data/config.json`** in
the project folder, and read back on every start. That file is git-ignored. It
survives restarts, updates and reboots — there is nothing else to set up.

If you would rather keep no token on disk, use the environment instead:

1. Delete `data/config.json` (or just its `token` line).
2. Copy `.env.example` to `.env` and set `NITRADO_TOKEN=...`.

Environment variables are only used as a fallback, so a token saved in the panel
always wins. To switch to `.env`, clear the file first.

### Locking the file down

On Windows, Node's `0600` file mode is **not** honoured — the file inherits the
permissions of the folder it sits in, so another local user account may be able
to read it. To restrict it to your account only:

```powershell
icacls "data\config.json" /inheritance:r /grant:r "$env:USERNAME:(R,W)"
```

On macOS and Linux the file is created with owner-only permissions already.

Either way, the token is **long-lived but revocable**: if you ever think it
leaked (a screenshot, a shared folder, a backup), delete it in the
[Nitrado Developer Portal](https://server.nitrado.net/eng/developer/tokens) and
generate a new one. The panel just asks for the new token.

If you ever want to reach the panel from another machine, change `HOST`, and put
it behind a reverse proxy with authentication first — the panel itself has no
login.

---

## Demo mode (no Nitrado account needed)

The repo ships a fake Nitrado API so you can try the panel without touching a
real server. In one terminal:

```powershell
npm run mock
```

In another:

```powershell
$env:NITRADO_BASE_URL="http://127.0.0.1:8490"; $env:NITRADO_TOKEN="test-token"; $env:PORT="8420"; npm start
```

Open <http://127.0.0.1:8420> — it will auto-pick the mock Valheim server.

---

## Project layout

```
server/
  index.js        Express app: /api routes, file read/write, settings batching
  nitrado.js      Thin NitrAPI client (auth, retries, transfer URLs)
  store.js        data/config.json persistence
public/
  index.html      Markup
  styles.css      Dark Valheim-ish theme
  app.js          All front-end logic (no build step)
  settings-schema.js  Friendly names, hover help and dropdown options for settings
test/
  mock-nitrado.mjs  Fake Nitrado API for development
```

## Troubleshooting

**"The provided access token is not valid"** — regenerate a long-life token and
update it via the **Setup** button in the sidebar.

**It asks for my token again after a restart** — the panel prints where it looks
for the token on startup:

```
  settings file: C:\...\data\config.json
  token:    loaded (saved in the panel)
```

If it says `NOT set`, check that `data/config.json` still exists and contains a
`token` line. If it says the file could not be read, the panel will have kept the
broken file as `config.json.unreadable-<timestamp>` and shown an orange warning in
the Setup screen — paste your token again and it will be rewritten.

A token can go missing if the file was deleted, the folder is inside a sync
service (OneDrive and friends) that rolled it back, or it was hand-edited into
invalid JSON. The panel no longer treats an unreadable file as "no token saved",
so a loss is now always reported rather than silent.

**Want the token out of the project folder entirely?** Point `NITRADO_DATA_DIR`
at somewhere else, or use `NITRADO_TOKEN` in `.env` instead (and delete
`data/config.json`).

**No servers appear in the picker** — the panel loads them automatically once the
token is saved, and jumps straight in if there's only one. If the list is still
empty, the token is probably missing the **service** permission. Expand
*"Can't see it? Enter the service ID by hand"* and paste the number from your
server's Nitrado page URL (`…/services/<strong>1234567</strong>`).

**Settings save but nothing changes** — stop the server, wait a couple of
minutes, save again, then start.

**A list card is empty** — that game/plan may not support the endpoint. Check
`GET /services/<id>/gameservers/games/players/lists` scopes on your token.

**Can't read a log file** — confirm the path exists in the Files tab and that
your token has the `ROLE_WEBINTERFACE_FILEBROWSER_READ` scope.
