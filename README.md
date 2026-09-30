# Valheim Control Panel (Nitrado)

A small local web panel for a Valheim dedicated server hosted on **Nitrado**. It
talks to Nitrado's REST API (the NitrAPI) so you can run the server from a
browser instead of clicking through the Nitrado web interface.

Everything runs on your own PC. Your API token never leaves the machine except
when the panel calls Nitrado directly.

![tabs](https://img.shields.io/badge/tabs-Dashboard%20%C2%B7%20Settings%20%C2%B7%20Players%20%C2%B7%20World%20map%20%C2%B7%20Backups%20%C2%B7%20Logs%20%C2%B7%20Files-e0a94a)

---

## What it does

| Tab | What you get |
| --- | --- |
| **Dashboard** | Live status (running / stopped / restarting…), one-click **Start**, **Restart**, **Stop**, players-online bar, world, connect address, server facts, 24h CPU / memory / player charts, and any Nitrado warnings. |
| **Server settings** | Edits the settings Nitrado exposes for your service (server name, password, world, public, crossplay, the difficulty preset, the five modifier dials and 13 world rules). Renders whatever your service actually returns, grouped into sections. |
| **Players & admins** | Everyone Nitrado has seen, with their platform ID and one-click **Make admin** / **Ban**, plus the raw list files Valheim actually reads. |
| **World map** | A **live map** of your world with player positions, served by the ValheimOne plugin on your server, plus an offline seed-generated map for when the server is stopped. |
| **Backups & schedule** | Worlds found in `worlds_local/`, Nitrado's world backups (with restore), and the cron-style scheduled tasks that handle daily restarts. |
| **Logs** | Nitrado's activity history, the server log files, and a reference of the in-game admin commands. |
| **Files** | Browse the server filesystem, open a text file, edit and save it, with shortcuts to `savedata`, `worlds_local` and the three player list files. |

---

## Starting it without a terminal (Windows)

You only need the terminal for the very first `npm install`. After that you can
launch the panel by double-clicking:

| File | What it does |
| --- | --- |
| **`Start Valheim Panel.vbs`** | Starts the panel with no console window and opens your browser. If it is already running it just opens the browser instead of starting a second copy. |
| **`Stop Valheim Panel.vbs`** | Stops the panel. Only the panel is stopped — other node processes are untouched. |
| **`Create Desktop Shortcut.vbs`** | Run once. Puts a **Valheim Control Panel** icon on your Desktop that starts everything. |

Run **Create Desktop Shortcut** once, then forget about the terminal entirely —
double-click the desktop icon, and the panel opens in your browser.

### Starting it when you sign in

To have the panel come up automatically at login, copy the desktop shortcut into:

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

Paste that path into the Explorer address bar to open the folder, then drop the
shortcut in. The panel starts hidden and serves quietly in the background; open
http://127.0.0.1:8420 whenever you want it.

### If something goes wrong

The launchers never fail silently. If the panel does not come up, you get a
dialog with the reason, and the full output is in **`data/launch.log`**. The
running server's own log is **`data/panel.log`**.

The panel also writes **`data/panel.pid`** while it is running, which is how the
stop script kills exactly the right process rather than every `node.exe` on the
machine.

### Where the icon comes from

`assets/panel.ico` is generated, not hand-drawn — `npm run icon` regenerates it
from `tools/make-icon.mjs` at 256/64/48/32/16 px. Edit the geometry in that file
if you want a different mark.

---

## Requirements

- **Node.js 20 or newer** (tested on Node 25).
- A Nitrado server that is a **gameserver** service.
- Optional, for the live map: the **`valheim_bepinex`** Nitrado addon. Everything
  else works without it.

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
- **World switching is done through a setting.** Set **World name** to an existing
  folder in `worlds_local` and restart. There is no separate endpoint for it, and
  changing the setting does not create the world until the next start.
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

## Valheim specifics the panel handles

These were verified against a real Nitrado Valheim service rather than assumed
from documentation, and they are the things most guides get wrong.

- **Valheim has no RCON.** Nitrado reports `has_application_server: false` for
  Valheim, so vanilla has no command channel at all. Admin commands (`save`,
  `kick`, `ban`, `setworldmodifier`, `setworldpreset`, `resetworldkeys`) either
  go through the F5 console in-game, or — with the ValheimOne plugin installed —
  through its browser console on the live map. The Logs tab otherwise shows the
  command reference rather than a box that would silently do nothing.
- **Cheat commands do not work on dedicated servers**, admin or not — `spawn`,
  `god` and `fly` are refused by vanilla. Only a mod such as Server devcommands
  unlocks them.
- **The password has startup rules.** Valheim needs at least 5 characters, and
  the password must not appear anywhere inside the server name — the server
  refuses to start otherwise (several hosts report the same for the world name).
  A public server also needs a non-empty password. The panel checks all of this
  live and blocks saving until the password is valid.
- **Player IDs need a platform prefix**: `Steam_76561197960287930`, not a bare
  17-digit ID, and case-sensitive. The panel detects a pasted bare SteamID and
  offers to add the prefix, and flags entries that cannot be valid.
- **The whitelist blocks everyone else.** `permittedlist.txt` is an allowlist —
  adding one name makes the server invite-only. The panel confirms before
  writing to it.
- **Valheim 1.0 worlds are folders.** `savedata/worlds_local/<WorldName>/`,
  not a `.db`/`.fwl` pair. The **World name** setting must match a folder
  exactly, or the server quietly generates a fresh world under that name — the
  Backups tab warns when it does not match.
- **World modifiers use `default`**, not `normal`, to mean "let the preset
  decide". The dropdowns send Nitrado's own casing.
- **Daily restarts are a scheduled task**, not a setting. They live in the
  Backups & schedule tab and are fully editable.
- **Backups can be listed and restored, but not created** through the API.
  Nitrado takes them on its own schedule; use the web interface for an
  on-demand one.

## The world map

The **World map** tab has two maps with different jobs.

### Live map (ValheimOne, server-side)

The primary map is served by the **[ValheimOne](https://github.com/humangenome/ValheimOne)**
BepInEx plugin running on your server. It re-draws from your world seed and
updates in real time — player positions, and optionally ships, carts, portals
and tombstones. It works with **vanilla clients**; players install nothing.

The panel reaches it two ways, both server-side: `GET /api/livemap` for the
status and player summary, and a **localhost proxy** that serves the map itself
into the tab. Neither the browser nor the URL ever carries the token. The mod
serves on its own TCP port (default **8790**) — not the game or query ports,
which are UDP.

**Player dots depend on in-game sharing.** ValheimOne respects each player's
"visible to other players" map setting, so players who have switched it off do
not appear.

### Seeing only what players have uncovered

Fog of war is a built-in plugin setting, controlled with **`tools/set-fog.mjs`**:

| Mode | What the map shows |
| --- | --- |
| `off` | the entire world |
| `trails` | only where players have walked |
| `explored` | trails **plus** anything revealed through cartography tables — closest to the in-game map |

```powershell
node tools/set-fog.mjs explored        # hide the unexplored world
node tools/set-fog.mjs explored --tint # translucent wash instead of a solid cover
node tools/set-fog.mjs off             # reveal everything again
node tools/set-fog.mjs                 # report the current setting
```

By default the unexplored area is a **solid cover** that also withholds region
names, spawn and trader markers until somewhere is explored. `--tint` leaves the
terrain faintly visible instead. The panel shows the active mode in the map
tab's stat chips (`Fog of war: explored · hidden`).

**Restart the server** for a change to take effect — the plugin reads its config
at startup. The live state is also served at `/api/status` under `map.fog`, so
the panel reports it rather than guessing.

Because `locked` is `false` for the admin view, you can still switch fog off from
the map's own controls for a quick look, without changing the server setting.

**A fresh world will look nearly empty.** Fog shows what has been explored, so
until players have actually covered ground the map is almost entirely blank —
`Explored 0%` in the chips means exactly that. That is the feature working, not a
fault.

**The map is locked behind an access token.** Without it, the port returns
`401 unauthorized` for the map page, every API and the console. See
[Getting the live map working](#getting-the-live-map-working) below for how that
is set up, and what it does and does not protect against.

### Offline map (seed only)

Secondary, and only generated when you press **Generate**: your browser draws
the whole world from the seed via the third-party site
[valheim-map.world](https://valheim-map.world). No mod needed and it works with
the server stopped, but it is static — no players. Your seed is sent to that
site when you use it.

The seed comes from the world's metadata file (`_main.N.fwl2`, ~200 bytes). The
layout was verified against a real world: a length-prefixed world name followed
by a length-prefixed seed, both readable strings. If the configured World name
has no folder yet — changing the setting does not create the world until the
next start — the tab falls back to the world actually on disk and says so.

## Getting the live map working

The plugin needs BepInEx, and BepInEx's Linux doorstop has to be **preloaded into
the server process** — which Nitrado controls. Uploading BepInEx over FTP alone
does **not** work; this was tested. Nitrado's own addon is the supported route:

1. In Nitrado, install the **`valheim_bepinex`** addon (not `valheimplus`, which
   also changes gameplay).
2. Start the server once. `BepInEx/LogOutput.log` appearing proves it loaded.
3. `node tools/install-mod.mjs --plugin-only` uploads just the plugin.
4. `node tools/set-livemap-token.mjs` generates the access token, saves it
   locally and writes it into the plugin's config. **Restart the server** for it
   to take effect.
5. The map is then at `http://127.0.0.1:8421` (the panel's local proxy), or in
   the World map tab.

`tools/install-mod.mjs` also takes `--list` to preview and `--remove` to undo
exactly what it uploaded.

ValheimOne leaves **every gameplay feature disabled by default** — only
`[Server]` and the map are on — so the world stays vanilla.

**The map is locked behind a token.** ValheimOne has no user accounts — only
shared secrets — and its port is reachable from the internet, so the token is
the whole security model:

| Request | Without token |
|---|---|
| The map page | `401 unauthorized` |
| `/api/status`, `/api/players` | `401 unauthorized` |
| `/api/console/exec` (kick/ban/save) | `401 unauthorized` |

`tools/set-livemap-token.mjs` generates a 32-character token, saves it to
`data/config.json`, and writes it into `valheimone.cfg` along with
`PublicView = false` so nothing on that port works without it.

**The token never reaches your browser.** ValheimOne's map uses absolute asset
paths and Server-Sent Events, so the panel runs a small localhost-only proxy on
port **8421** that forwards to the map and attaches the token as an
`X-LiveMap-Token` header. The map tab points at the proxy, which is why the
token stays out of your browser history, screenshots and referrer headers.
(`LIVEMAP_PROXY_PORT` overrides 8421, `LIVEMAP_PORT` overrides 8790.)

**What this does not give you.** There is no per-person identity: one token
grants admin to whoever holds it, there is no audit trail of who ran what, and
rotating the token is the only revocation. Real per-user login tied to
`adminlist.txt` would need a mod feature that does not exist. Adding a login
page in front of a proxy would be pointless, because anyone who knows the
server IP can bypass the proxy and talk to the mod directly.

Narrow `ConsoleWhitelist` in `valheimone.cfg` if you want a smaller command set —
it is `vo save kick ban unban banned lodbias sleep` by default.

## Security

There are **two separate tokens**, and it is worth keeping them distinct:

| Token | What it protects |
| --- | --- |
| **Nitrado API token** | Your whole Nitrado account, via the panel. |
| **Live map token** | The ValheimOne map port on your game server. |

Both are stored in `data/config.json`, which is git-ignored. The live map token
is covered under [Getting the live map working](#getting-the-live-map-working);
the rest of this section is about the Nitrado one.

- The panel binds to `127.0.0.1` by default, so only this PC can reach it.
- The Nitrado token is sent only to `api.nitrado.net`, from the server side — the
  browser never sees it.
- Neither token is **encrypted at rest**. Anyone who can read `data/config.json`
  can read both. See below for how to live with that.

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
  index.js        Express app: /api routes, file read/write, settings batching,
                  plus the localhost proxy in front of the live map
  nitrado.js      Thin NitrAPI client (auth, retries, transfer URLs)
  store.js        data/config.json persistence (Nitrado token + live map token)
public/
  index.html      Markup
  styles.css      Dark Valheim-ish theme
  app.js          All front-end logic (no build step)
  settings-schema.js  Friendly names, hover help, dropdown options and sections
tools/
  launch.mjs      Starts the panel detached and opens the browser
  stop.mjs        Stops the panel via data/panel.pid
  make-icon.mjs   Generates assets/panel.ico
  pull-world.mjs  Downloads a full local copy of savedata/ (world + list files)
  install-mod.mjs Uploads a BepInEx mod release over FTP; --list, --plugin-only,
                  --remove
  set-livemap-token.mjs  Generates the live map token and writes the plugin config
  set-fog.mjs            Sets the live map's fog of war (off / trails / explored)
  delete-world.mjs       Deletes an inactive world, refusing if it is the active
                         one or is not backed up
assets/
  panel.ico       Desktop shortcut icon (generated)
  icon-preview-256.png  Same icon as a PNG, for previewing
test/
  mock-nitrado.mjs  Fake Nitrado API shaped like a real Valheim service
  discover.mjs      Read-only probe: dumps real API responses to data/discovery
```

Runtime files, all under the git-ignored `data/`:

```
data/config.json    Nitrado token, service id, live map token
data/ftp.json       FTP credentials, written by the tooling above
data/world-backup/  Local world copies from tools/pull-world.mjs
data/panel.log      Running server output
data/launch.log     Launcher output, shown in a dialog if startup fails
data/panel.pid      Which process is the panel
data/discovery/     Raw API responses from tools/discover.mjs
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

### Live map

**The map tab says the live map is unavailable.** The game server must be
running with the plugin loaded. After a restart the map's own web server takes
**30–90 seconds** to come up, because it regenerates the world texture first —
the game can be `started` while the map is still warming up. Press Refresh.

**Everything on the map port returns `401 unauthorized`.** That is the lockdown
working. If the panel cannot see the map either, the saved token does not match
the one in `valheimone.cfg` — run `node tools/set-livemap-token.mjs` again and
restart the server.

**The map loads but shows no players.** ValheimOne honours each player's
"visible to other players" setting on the in-game map (press `M`). A player with
that switched off will not appear, by design.

**`LIVEMAP_PROXY_PORT` is already in use.** Something else has port 8421. Set a
different one in `.env`, or start with `$env:LIVEMAP_PROXY_PORT="8422"`.

**A world is still listed that you deleted.** Delete the world's folder with
`node tools/delete-world.mjs <Name>`, then press Refresh in the Backups tab.
Nitrado's API caches the world list for about a minute.
