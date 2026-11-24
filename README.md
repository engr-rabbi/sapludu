# Sapludu (সাপলুডু) — Snakes & Ladders online

A complete, GitHub-hostable Snakes & Ladders platform: **Sign in with Google**, a **Google Sheets database**
behind **Google Apps Script**, **real-time online multiplayer for 2–4 players**, realistic animated snakes,
leaderboards, friends & invitations, an admin console, and an **installable PWA** ("Download for Your Mobile").

> **Read this first — what needs your own accounts.** The code is complete, but three things can only exist in
> *your* Google/hosting accounts: a Google OAuth client ID, an Apps Script deployment + spreadsheet, and a server
> that supports WebSockets. Sections 2–5 walk you through each (about 30–40 minutes). [docs/TESTING.md](docs/TESTING.md)
> lists exactly what has been verified automatically and what you must verify yourself after deploying.

---

## 1. Architecture

```
                    ┌───────────────────────────────┐
  Browser / PWA ───▶│  GitHub Pages (static export)  │   web/  — Next.js 16 + React 19
  (Android, iOS,    └───────────────────────────────┘
   desktop)               │            │
        │  Google ID token│            │ WebSocket (Socket.IO)
        ▼                 ▼            ▼
  ┌────────────┐   ┌───────────────────────┐   ┌──────────────────────────────┐
  │  Google    │   │  Google Apps Script   │◀──│  Game server (Node.js)       │
  │  Identity  │◀──│  Web app = auth +     │   │  server/ — authoritative     │
  │  Services  │   │  account API          │   │  dice, turns, moves, rooms   │
  └────────────┘   └──────────┬────────────┘   └──────────────────────────────┘
   verifies token             │ SpreadsheetApp                 hosted on Render / Fly / Railway / VPS
                              ▼
                     ┌─────────────────┐
                     │  Google Sheets  │  Users · AuthSessions · Games · GamePlayers · GameMoves
                     │   (database)    │  Leaderboard · Invitations · Sessions · Friends · …
                     └─────────────────┘
```

**Why four pieces?** GitHub Pages serves only static files, and Apps Script/Sheets cannot hold persistent
WebSocket connections or answer in milliseconds. So each part does what it is good at:

| Part | Responsibility | Authority over |
|---|---|---|
| **Web app** (`web/`) | UI, animation, PWA. Static HTML/JS on GitHub Pages | Nothing — it only displays state and sends *intents* |
| **Apps Script** (`apps-script/`) | Verifies the Google ID token, owns users/sessions/ratings, reads & writes Sheets | Identity, accounts, persisted results, Elo, admin rights |
| **Game server** (`server/`) | Rooms, turn order, dice, token movement, reconnects, live sync | Everything about an *active* online game |
| **Google Sheets** | Durable storage | — |

Sheets is **never used as a real-time transport**. The game server announces results instantly and saves them to
Sheets asynchronously (batched, with a persistent retry queue), so a slow Apps Script never slows a game down.
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Threat model: [docs/SECURITY.md](docs/SECURITY.md).

### Repository layout

```
sapludu/
├─ web/                 Next.js static-export front end (components, stores, i18n EN/বাংলা, PWA assets in public/)
├─ server/              Socket.IO multiplayer server (+ Dockerfile, tests)
├─ apps-script/         Google Apps Script backend (.gs files, manifest, tests)
├─ packages/engine/     Pure game engine shared by web + server (rules, board, AI) — one source of truth
├─ scripts/             Engine verification + browser e2e tooling
├─ docs/                Architecture, security, testing, game rules, archived planning notes
├─ .github/workflows/   CI and GitHub Pages deployment
└─ render.yaml          One-click Render blueprint for the game server
```

### Features

- **Google sign-in** (Google Identity Services) — first sign-in auto-registers, later sign-ins log in; logout, logout-everywhere, profile editing, account deletion
- **Server-verified identity**: the backend validates the ID token with Google; browser-supplied e-mails/ids are never trusted
- **Google Sheets database** with automatic schema creation, locking, validation, idempotent writes
- **Online multiplayer 2–4 players**: private rooms with 6-character codes, quick match, friend invitations, ready check, colours, reconnection, forfeit-on-timeout, winner announcement
- **Server-authoritative game**: dice come from `crypto.randomInt` on the server; clients can't send results
- **Profiles, history, achievements, Elo leaderboard** (all-time, daily, weekly, monthly, friends)
- **Realistic animated snakes**, ladders, 10 board themes, step-by-step token movement, 3-D dice, EN/বাংলা
- **Local pass-and-play and vs-computer** modes (work offline, no account needed)
- **PWA**: manifest, service worker, icons, installable, offline fallback, "Download for Your Mobile" bar
- **Admin console** (backend-enforced): users, suspend/restore, roles, games, live sessions, reported issues, audit log

---

## 2. Google Cloud: OAuth client ID

1. Open <https://console.cloud.google.com/> → create a project (e.g. `sapludu`).
2. **APIs & Services → OAuth consent screen**
   - User type **External** → fill app name (*Sapludu*), support e-mail, developer e-mail.
   - Scopes: only the defaults `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (non-sensitive → no Google verification review needed).
   - **Publishing status → "In production"** (click *Publish app*). If you leave it in *Testing*, only the ≤100 test users you list can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (origin only — no path, no trailing slash):
     - `https://YOUR-GITHUB-USERNAME.github.io`
     - `http://localhost:3000` (local development)
     - your custom domain, if you use one
   - *Authorized redirect URIs*: leave empty (the Google button uses a popup/ID-token flow).
4. Copy the **Client ID** (`123…abc.apps.googleusercontent.com`). It is public; you will use it in steps 3 and 5.

> No Google API needs to be *enabled* for the sign-in button itself. (The Apps Script project uses Sheets and
> UrlFetch through its own scopes, which Apps Script asks you to authorize in step 3.)

## 3. Google Apps Script + Google Sheets backend

1. Create a new **Google Sheet** (e.g. “Sapludu database”). Use a dedicated Google account if you can — the script runs *as you*.
2. In the sheet: **Extensions → Apps Script**. This creates a script *bound* to the spreadsheet (no `SPREADSHEET_ID` needed).
3. **Project Settings (⚙) → tick “Show `appsscript.json` manifest file in editor”**, then replace the manifest content with
   [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. Create one script file per `.gs` file in [`apps-script/`](apps-script/) (`Config`, `Util`, `Db`, `Auth`, `Users`, `Games`,
   `Leaderboard`, `Social`, `Admin`, `Api`, `Setup`) and paste each file's content. *(Or use [clasp](https://github.com/google/clasp):
   `npm i -g @google/clasp && clasp login`, copy `.clasp.json.example` to `.clasp.json` with your script id, `clasp push`.)*
5. **Project Settings → Script properties → Add**:

   | Property | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the client ID from step 2 |
   | `ADMIN_EMAILS` | your Google e-mail (comma separate several) — these accounts get the admin console |
   | `SERVER_SECRET` | leave empty for now — step 7 generates it |

   Optional: `SESSION_TTL_HOURS` (default 168), `ALLOWED_EMAIL_DOMAINS` (restrict sign-in to e.g. `school.edu`).
6. In the editor pick function **`setup`** → **Run**. Approve the permissions (Sheets, external requests, triggers).
   It creates all 13 sheets with headers, formats text columns as plain text (blocks formula injection / number mangling),
   installs the daily maintenance trigger and logs anything still missing (*View → Logs*).
7. Run **`generateServerSecret`** once. The secret is stored in Script properties and printed once in the execution log —
   copy it for the game server (`APPS_SCRIPT_SERVER_SECRET`). Run `setup` again; it should report *“Configuration looks complete.”*
8. **Deploy → New deployment → type: Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (the browser has no Google session for this URL; every call is authenticated by the session token inside the request)
   - Copy the **Web app URL** ending in `/exec`. Open it in a browser — you should see
     `{"ok":true,"data":{"service":"sapludu-backend","version":"1.0.0"}}`.
9. **Changing the code later:** *Deploy → Manage deployments → ✏ → Version: New version → Deploy*. The `/exec` URL stays the same.
   (Editing the script without creating a new version does **not** change the live web app.)

## 4. Multiplayer game server

GitHub Pages cannot run WebSockets, so the game server runs on any Node 20+ host with WebSocket support.

### Option A — Render (blueprint included)

1. Push this repository to GitHub (section 5).
2. Render → **New → Blueprint** → select the repo (uses [`render.yaml`](render.yaml)).
3. Set the three secret env vars when prompted:
   - `CORS_ORIGINS` = `https://YOUR-GITHUB-USERNAME.github.io` (comma-separate more; no paths, no trailing slashes)
   - `APPS_SCRIPT_URL` = the `/exec` URL from step 3.8
   - `APPS_SCRIPT_SERVER_SECRET` = the secret from step 3.7
4. After deploy, open `https://YOUR-SERVICE.onrender.com/health` → `{"ok":true,…}`.

> Render's **free** plan sleeps after ~15 min idle (first connection then takes ~30–60 s) and has an ephemeral disk.
> Use a paid always-on instance for real play. Rooms live in memory, so a restart ends active games
> (results of finished games are already queued/saved).

### Option B — Docker / any VPS / Fly.io / Railway

```bash
docker build -f server/Dockerfile -t sapludu-server .
docker run -d --name sapludu -p 3003:3003 \
  -e CORS_ORIGINS=https://YOUR-GITHUB-USERNAME.github.io \
  -e APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec \
  -e APPS_SCRIPT_SERVER_SECRET=... \
  -v sapludu-data:/app/data sapludu-server
```

Put it behind HTTPS (Caddy, nginx, the platform's TLS). **A page served over https must connect to a `wss://` /
`https://` game server** (browsers block mixed content). Variables: see [`server/.env.example`](server/.env.example).

Run without Docker: `npm ci && npm run build:server && node server/dist/index.js` with the env vars set.

## 5. Front end on GitHub Pages

1. Create a GitHub repository and push this project (`main` branch).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables** (public values — *not* secrets):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | OAuth client ID from step 2 |
   | `NEXT_PUBLIC_APPS_SCRIPT_URL` | the `/exec` URL from step 3 |
   | `NEXT_PUBLIC_GAME_SERVER_URL` | `https://YOUR-SERVICE.onrender.com` from step 4 |

4. Push to `main`. The *Deploy web to GitHub Pages* workflow builds the static export and publishes it to
   `https://USERNAME.github.io/REPO/`. The base path is detected automatically; the PWA manifest and service
   worker use relative URLs, so they work under `/REPO/` too.
5. Make sure the Pages **origin** (`https://USERNAME.github.io`) is in the OAuth client's *Authorized JavaScript origins*
   (step 2.3) **and** in the game server's `CORS_ORIGINS` (step 4).

**Local development**

```bash
npm ci
cp web/.env.example web/.env.local     # fill in the three NEXT_PUBLIC_* values
cp server/.env.example server/.env     # fill in APPS_SCRIPT_URL / APPS_SCRIPT_SERVER_SECRET / CORS_ORIGINS
set -a && . server/.env && set +a       # the server reads process.env (no dotenv dependency)
npm run dev:server                      # http://localhost:3003
npm run dev:web                         # http://localhost:3000
```

**Production builds:** `npm run build` (web → `web/out/`, server → `server/dist/`). Other commands: `npm run typecheck`,
`npm run lint`, `npm test`.

## 6. Test it (acceptance checklist)

Do these once after deploying; the automated suites cannot sign in to a real Google account for you.

1. **Google sign-in** — open the site, *Sign In → Continue with Google*. You land on the dashboard with “Account ready”.
   In the sheet, tab **Users** now has your row (Player ID, e-mail, name, picture, createdAt, lastLogin, rating 1000).
2. **Returning user** — sign out and in again: no second row appears; `lastLogin` changes.
3. **Profile** — Profile → change display name / avatar → reload → persisted (check **Users**).
4. **Admin** — with an `ADMIN_EMAILS` account the avatar menu shows *Admin*. A non-admin who opens the admin URL/endpoints gets *Admin access required*.
5. **Two-device multiplayer** — device A: *Play → Online → Create Private Room (2)*. Device B (other Google account, other network): enter the code → *Ready*. A presses *Start*. Both see identical dice and token moves.
6. **Reconnect** — on B, toggle airplane mode for ~10 s mid-game, or close and reopen the tab: B returns to the same position; a 90 s absence forfeits.
7. **Result persistence** — after the winner is shown, tabs **Games**, **GamePlayers**, **GameMoves**, **Leaderboard** fill and ratings change (+16 / −16 for two equal players).
8. **Invites** — add each other in *Friends* (share the Player ID), host a room, tap *Invite*; the friend gets a toast with *Join*.
9. **PWA** — see below.

## 7. Install as an app (PWA)

The green **“Download for Your Mobile”** bar sits at the very top of the site and disappears once the app is installed.

| Platform | How |
|---|---|
| Android Chrome / Edge / Samsung Internet | Tap the bar → native install prompt → *Install*. (Or ⋮ menu → *Install app* / *Add to Home screen*.) |
| iPhone / iPad (Safari) | Share ⬆︎ → *Add to Home Screen* (iOS has no install prompt API; the bar shows these steps). |
| Desktop Chrome / Edge | Tap the bar, or the install icon at the right end of the address bar. |
| Firefox | Android: menu → *Install*. Desktop Firefox cannot install web apps. |

The installed app launches full-screen (standalone). **Offline:** the app shell and local/computer games work; online
play, sign-in, friends and leaderboards show a clear *offline* notice and reconnect automatically — nothing is faked.
Installing requires HTTPS (GitHub Pages provides it).

## 8. Operations

### Backup & recovery
The spreadsheet **is** the database.
- **Version history:** *File → Version history* keeps automatic revisions; name a version before risky changes.
- **Scheduled copy:** add this to the Apps Script project and attach a weekly time trigger:
  ```js
  function backupDatabase() {
    var folder = DriveApp.getFolderById('PASTE_BACKUP_FOLDER_ID');
    var name = 'Sapludu backup ' + new Date().toISOString().slice(0, 10);
    DriveApp.getFileById(SpreadsheetApp.getActive().getId()).makeCopy(name, folder);
  }
  ```
  (needs the extra `https://www.googleapis.com/auth/drive` scope in `appsscript.json`).
- **Restore:** open a backup copy → copy its sheets over the live ones (or point `SPREADSHEET_ID` at the backup). Never edit the header rows; run `verifySchema()` after a restore.
- **Game server:** stateless except the retry queue file (`data/pending-results.json`); keep `/app/data` on a volume if you need results to survive a *crash while Google was down*.

### Limits to know (design constraints)
| Limit | Effect | Mitigation |
|---|---|---|
| Sheets: 10 million cells / spreadsheet | ≈ 10–12 k stored games (the move log is the bulk: ~7 cells per move, max 1000 moves/game stored) | Archive old `GameMoves` rows to another sheet |
| Apps Script web app: ~30 concurrent executions, URL-fetch & runtime quotas | Large launches may see `BUSY` retries | The server queues/retries; the browser retries reads |
| Every request reads whole sheets (no indexes) | Latency grows with users | Fine for thousands of users; beyond that move to a real DB |
| Rooms are in one server's memory | One game-server instance only | Use one instance (or sticky routing + shared state if you extend it) |
| `tokeninfo` verification per login | Google rate limits heavy bursts | Sessions last 7 days, so logins are infrequent |

### Rotating the server secret
Run `generateServerSecret()` again → update `APPS_SCRIPT_SERVER_SECRET` on the game server → restart it.

### Moderation
Admin console → *Users* → **Suspend** (sessions are revoked immediately, the player can't sign in) / **Restore**;
*Reports* shows issues submitted from *Profile → Report a problem*; every admin action is written to **AdminAudit**.

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Sign-in page says *not configured* | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_APPS_SCRIPT_URL` variables missing at **build** time → set them and re-run the workflow |
| Google button missing / `origin_mismatch` | Add the exact page origin to *Authorized JavaScript origins* (step 2.3); wait a few minutes |
| `AUTH_WRONG_AUDIENCE` | `GOOGLE_CLIENT_ID` script property ≠ the client ID in the web build |
| Access blocked: app not verified / only testers | OAuth consent screen is still *Testing* → publish it (step 2.2) |
| `DB_NOT_INITIALISED` | Run `setup()`; make sure the script is bound to (or `SPREADSHEET_ID` points to) the right sheet |
| Browser console: CORS error calling `/exec` | The deployment is not *Anyone*, or you opened an old deployment URL — redeploy as a new version |
| Online page says *Sign-in service unavailable* | Game server can't reach Apps Script: check `APPS_SCRIPT_URL` and that `APPS_SCRIPT_SERVER_SECRET` equals the `SERVER_SECRET` property |
| WebSocket blocked / mixed content | Game server must be `https://` when the site is `https://`; check `CORS_ORIGINS` has the Pages origin |
| Game ended but Sheets did not update | See the game-server log for `[queue] retry …`; fix the cause and the queued result is delivered automatically |
| Install prompt never appears | Needs HTTPS, a registered service worker (production build) and a browser that supports it; use the manual steps in section 7 |

## 10. Security summary
Identity is verified server-side with Google (audience, issuer, expiry, verified e-mail); session tokens are random
244-bit values stored only as SHA-256 hashes with sliding expiry and per-user caps; every backend call re-checks the account
status; admin rights are read from the database on each call; the game server is the sole authority for dice/turns/positions
and every saved game is **replayed against the rules** before it is stored; inputs are validated everywhere; rate limits exist
on login, API, profile, invites and socket events; spreadsheet cells are protected against formula injection.
No secret is in the repository — only the public OAuth client ID is shipped to browsers. Full analysis and known
trade-offs (e.g. the session token lives in `localStorage`): [docs/SECURITY.md](docs/SECURITY.md).

## 11. Existing game rules (preserved)
Unchanged from the original project and exhaustively verified by `npm run test:engine`: 10×10 zig-zag board, exact roll
needed to finish on 100, overshoot = stay, 7 ladders and 9 snakes, a roll of 6 grants another turn, 2–4 players. See
[docs/GAME_RULES.md](docs/GAME_RULES.md). Choose and add a `LICENSE` before publishing the repository.
