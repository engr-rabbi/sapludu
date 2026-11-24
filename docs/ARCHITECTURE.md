# Architecture

## Components and trust boundaries

| Component | Trust level | Runs on |
|---|---|---|
| Browser (web app, PWA) | **Untrusted** — anything it sends can be forged | user device |
| Game server | Trusted for game state; authenticates to Apps Script with `SERVER_SECRET` | Render / Docker / VPS |
| Apps Script web app | Trusted for identity & persistence; the only component that touches Sheets | Google |
| Google Identity Services | Root of identity | Google |

## Sign-in sequence

```
Browser                         Google                 Apps Script                      Sheets
  │  Sign in with Google          │                         │                              │
  │──────────────────────────────▶│                         │                              │
  │◀──── signed ID token (JWT) ───│                         │                              │
  │  POST {action:"auth.login", payload:{idToken}} ────────▶│                              │
  │                               │◀── GET /tokeninfo?id_token ── verify signature/exp     │
  │                               │──── {aud, iss, exp, sub, email, email_verified} ──────▶│
  │                               │                         │ check aud ∈ GOOGLE_CLIENT_ID,│
  │                               │                         │ iss, exp, email_verified     │
  │                               │                         │──── lock; find/create Users ▶│
  │                               │                         │──── append AuthSessions(hash)│
  │◀──────────── {sessionToken (random), user, isNew} ──────│                              │
```

Only the SHA-256 hash of the session token is stored. Each later call carries `sessionToken`; Apps Script looks up the hash,
checks revocation and expiry, re-reads the user row (suspension takes effect immediately) and extends the session when
more than half its lifetime has passed.

## Multiplayer sequence

```
Browser A / B                        Game server                          Apps Script
  │ hello {sessionToken} ───────────────▶│── server.verifySession ───────────────▶│ (cached 60 s)
  │◀──── hello:ok {playerId} ────────────│◀── {playerId, name, picture, status} ──│
  │ room:create / room:join {code} ─────▶│  rooms live in memory
  │ game:start ─────────────────────────▶│── server.gameStarted (queued) ─────────▶ Sessions row "active"
  │ dice:roll ──────────────────────────▶│  crypto.randomInt → shared engine.applyRoll
  │◀── dice:result, player:moved, turn:changed (broadcast to the room) ──│
  │            … repeat …                │
  │◀── game:completed (instant) ─────────│── server.recordGame (queued, retried) ─▶ replay + Elo + sheets
  │◀── game:rated {ratings, achievements}│◀──────────────────────────────────────── result
```

* Clients send **intents only** (`dice:roll`, `room:*`, `game:forfeit`). There is no event that carries a dice value or position.
* `applyRoll` is the same pure function the single-player game and the tests use (`packages/engine`).
* Turn timer: an idle player is auto-rolled after 40 s. Disconnect: seat kept, 90 s then forfeit. Reconnect = new `hello` with the
  same session token → `room:state` + `game:state_sync` (full authoritative state, no replay needed).
* A second login of the same account replaces the first connection (`session:replaced`) so a seat can never be duplicated.
* The result queue is sequential (one Apps Script call at a time), exponential back-off 2 s → 5 min, 12 attempts, persisted to
  `PENDING_FILE`. Permanent errors (validation/replay) are dropped and logged; transient ones (`BUSY`, 5xx, network) are retried.

## Data model (Google Sheets)

| Sheet | Key columns | Purpose |
|---|---|---|
| `Users` | `playerId`, `email`, `googleSub`, `displayName`, `picture`, `avatar`, `language`, `role`, `status`, `createdAt`, `lastLogin`, `totalGamesPlayed/Won/Lost`, `rating`, `rank`, streaks, `practiceGames/Wins` | Profiles & stats |
| `AuthSessions` | `sessionHash`, `playerId`, `expiresAt`, `revoked` | Login sessions (hash only) |
| `Games` | `gameId`, `roomCode`, `mode`, `status`, `endedAt`, `winnerPlayerId`, `turnCount`, `forfeited` | One row per finished game |
| `GamePlayers` | `gameId`, `seat`, `playerId`, `name`, `color`, `finalPosition`, `placement`, `ratingBefore/After` | Participants |
| `GameMoves` | `gameId`, `moveNo`, `seat`, `dice`, `fromPos`, `toPos`, `kind` | Dice results & token movement history |
| `Leaderboard` | `rank`, `playerId`, `rating`, `wins`, … | Top-100 snapshot (rewritten after each game) |
| `Invitations` | `inviteId`, `fromPlayerId`, `toPlayerId`, `roomCode`, `status`, `expiresAt` | Multiplayer invitations (10 min) |
| `Sessions` | `gameId`, `roomCode`, `status`, `players`, `startedAt`, `serverId` | Active game sessions / connection metadata |
| `Friends`, `Achievements`, `Reports`, `AdminAudit`, `Logs` | | Social graph, unlocks, issue reports, audit trail, server errors |

*Concurrency:* every mutation runs inside `LockService.getScriptLock()`; the lock is non-reentrant in tests so nested locking
bugs are caught. *Duplicates:* users are matched on Google `sub` then e-mail inside the lock; games are idempotent per `gameId`.
*Integrity:* ids are generated server-side; text columns use plain-text format; free text is prefixed against formula injection.

## Ratings
Elo K = 32, start 1000. Winner vs the average of the registered losers; each loser vs the winner. Forfeited games record
a win/loss but **do not change ratings**. Only server-verified online games affect rating, rank and the leaderboard.
Local/AI results (reported by the browser) are replay-validated but counted in separate *practice* counters.

## Front end
Next.js 16 static export (`output: "export"`). State: Zustand stores (`auth`, `online`, `game`, `ui`, `board-fx`). The board is
DOM + SVG: squares, a number layer, ladder and snake SVG overlay (geometry computed from square centres so heads/tails sit on their squares),
then tokens. The animation engine in `online-store` plays the *server-confirmed* path hop by hop, then ladder/snake choreography;
the final server state always wins (`game:state_sync`).
Service worker (`web/public/sw.js`): network-first pages with offline fallback, cache-first hashed assets, stale-while-revalidate icons,
never intercepts cross-origin requests (Google, Apps Script, sockets).
