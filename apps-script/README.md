# Sapludu — Google Apps Script backend

Authentication bridge + account store + Google Sheets database. Deployed as a **Web app**
(*Execute as: Me*, *Who has access: Anyone*). The full setup walk-through is in the root [README](../README.md#3-google-apps-script--google-sheets-backend).

| File | Responsibility |
|---|---|
| `appsscript.json` | Manifest: V8 runtime, web-app access, OAuth scopes |
| `Config.gs` | Constants, **database schema**, script-property access |
| `Util.gs` | Ids, SHA-256, constant-time compare, validation, rate limiting, logging |
| `Db.gs` | Sheet table abstraction + `withLock_()` (LockService) |
| `Auth.gs` | Google ID-token verification, session issue / validation / revoke |
| `Users.gs` | Profile read/update/delete |
| `Games.gs` | Move-replay validation, Elo, achievements, game recording, history |
| `Leaderboard.gs` | Rank recomputation, all-time / daily / weekly / monthly / friends boards |
| `Social.gs` | Friends (by Player ID) and multiplayer invitations |
| `Admin.gs` | Admin stats, user moderation, reports, audit log |
| `Api.gs` | `doGet` / `doPost`, route table and per-route authorisation |
| `Setup.gs` | `setup()`, `generateServerSecret()`, `verifySchema()`, daily `maintenance()` |
| `tests/` | Node test-suite that runs these exact files against in-memory fakes |

## Script properties (Project Settings → Script properties)

| Property | Required | Meaning |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | OAuth Web client ID(s), comma separated. Tokens issued for any other audience are rejected |
| `SERVER_SECRET` | yes | ≥ 24 chars shared with the game server (`generateServerSecret()` creates one) |
| `ADMIN_EMAILS` | recommended | Google e-mails that are always administrators |
| `SESSION_TTL_HOURS` | no | Default 168 (7 days), sliding |
| `ALLOWED_EMAIL_DOMAINS` | no | e.g. `school.edu` to restrict sign-in; empty = any Google account |
| `SPREADSHEET_ID` | standalone only | Not needed when the script is bound to the spreadsheet |

## API (POST JSON as `text/plain`)

```jsonc
{ "action": "auth.me", "sessionToken": "…", "payload": {} }
// → { "ok": true, "data": { … } }  |  { "ok": false, "error": { "code": "AUTH_EXPIRED", "message": "…" } }
```

| Auth | Actions |
|---|---|
| none | `auth.login` (`{ idToken }`) |
| optional session | `leaderboard.get` |
| session | `auth.me` `auth.logout` `auth.logoutAll` `users.updateProfile` `users.deleteAccount` `games.history` `games.reportPractice` `achievements.list` `friends.list/request/respond/remove` `invites.list/respond` `reports.submit` |
| session + **admin role (checked in the database)** | `admin.stats` `admin.users` `admin.setUserStatus` `admin.setRole` `admin.games` `admin.reports` `admin.resolveReport` `admin.audit` |
| `serverSecret` | `server.verifySession` `server.gameStarted` `server.gameAborted` `server.recordGame` `server.createInvite` |

Error codes you may see: `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_INVALID_TOKEN`, `AUTH_WRONG_AUDIENCE`,
`AUTH_EMAIL_UNVERIFIED`, `AUTH_DOMAIN_NOT_ALLOWED`, `ACCOUNT_SUSPENDED`, `FORBIDDEN`, `VALIDATION`, `RATE_LIMITED`,
`BUSY` (lock contention — retry), `AUTH_UNAVAILABLE` (Google unreachable — retry), `DB_NOT_INITIALISED`, `INTERNAL`.

## Run the tests

```bash
npm run test:apps-script      # from the repository root
```
