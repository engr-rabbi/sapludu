# SAPLUDU Master Specification

| Field | Value |
| --- | --- |
| Product | SAPLUDU (সাপলুডু) — Snakes and Ladders gaming platform |
| Tagline | Play. Climb. Win. |
| Document | MASTER_SPECIFICATION.md |
| Version | 0.1.0 |
| Date | 2026-01-14 |
| Status | Baseline — implementation tracked in PROGRESS.md |
| Companion documents | ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, GAME_RULES.md, DEPLOYMENT.md, AGENTS.md, PROGRESS.md, CHANGELOG.md |

---

## 1. Product Overview

SAPLUDU is a commercial-quality casual gaming platform for traditional Bangladeshi Snakes and Ladders (সাপলুডু). It offers three ways to play — local multiplayer on a single device, player-versus-computer, and server-authoritative online multiplayer — combined with accounts, statistics, Elo rating, achievements, friends, leaderboards, and an admin dashboard.

### 1.1 Goals

- G1. Deliver a polished, responsive 10x10 Snakes and Ladders game with a single authoritative rules engine.
- G2. Provide local (offline-capable), AI, and online multiplayer modes sharing one rules core.
- G3. Provide persistent player identity, statistics, Elo-based leaderboards, achievements, and social features.
- G4. Support English and Bangla with a one-click language switch.
- G5. Reach commercial "casual game" quality: animations, synthesized sound effects, confetti, mobile vibration feedback.
- G6. Remain honest about sandbox constraints and clearly separate implemented features from planned work.

### 1.2 Non-goals (current release)

- NG1. Google OAuth sign-in (requires external credentials; future work).
- NG2. Android native application / React Native build (future work; web app is fully responsive and PWA-ready).
- NG3. Automated unit/integration test suites (sandbox instruction forbids test code; verification via manual end-to-end browser checks).
- NG4. Blockchain, wagering, or any monetary feature.

---

## 2. Environment Constraints and Adopted Adaptations

The project is built inside a constrained development sandbox. The specification below documents each constraint, the adaptation adopted, and the production upgrade path. These adaptations are **decisions, not defects**; all documentation must state them honestly.

| # | Constraint | Adopted adaptation | Impact | Production upgrade path |
| --- | --- | --- | --- | --- |
| C-1 | No PostgreSQL service in sandbox | SQLite via Prisma ORM (`db/custom.db`), identical Prisma model surface | Single-writer database; acceptable for development | Swap `datasource db.provider` to `postgresql`, run migrations on VPS (see DEPLOYMENT.md) |
| C-2 | Single visible route requirement | Single-page client-side view system: only `/` is user-visible; views switch via Zustand store (`src/stores/ui`) | No route-based navigation, no Next.js page routing for views | None required; REST lives under `/api/v1/**` regardless |
| C-3 | WebSocket proxying via gateway transform | Socket.IO mini-service on port 3003 behind Caddy; client connects as `io('/?XTransformPort=3003')` | Client never hardcodes a socket host | Same pattern on VPS behind Caddy/Nginx |
| C-4 | Randomness environment | Online dice: Node `crypto.randomInt(1, 7)` on the server. Local/AI dice: client `Math.random()` | Online outcomes cannot be influenced by the client | None required |
| C-5 | No external OAuth credentials available | Email + password auth (bcryptjs) + JWT (jose) in httpOnly cookie; guest play supported. Google OAuth documented as future work | Registration requires email + password only | Add OAuth provider flow when credentials exist |
| C-6 | No test-code policy in sandbox | No automated unit tests written; verification performed with Agent Browser end-to-end manual scripts recorded in PROGRESS.md | Regression risk mitigated by checklists | Introduce Vitest/Playwright suites post-sandbox |
| C-7 | No Docker/VPS execution in sandbox | DEPLOYMENT.md contains a complete production guide (Ubuntu + Docker Compose + Caddy/Nginx + PostgreSQL) that was **not executed** here | Deployment is documented, not demonstrated | Execute guide on VPS |
| C-8 | No Android build toolchain | Native app documented as future work with build outline; web is responsive + PWA-ready | Mobile users use the responsive web app | Capacitor/TWA wrapper per DEPLOYMENT.md appendix |
| C-9 | i18n without external service dependency | Custom lightweight EN/BN dictionary via Zustand, persisted locally (equivalent of i18next) | Two locales, typed keys | Migrate to i18next if locale count grows |
| C-10 | No binary audio assets | Sound effects synthesized with Web Audio API; confetti via framer-motion particles; Vibration API on mobile | No asset downloads; consistent cross-platform output | Optional high-quality sampled SFX later |

---

## 3. System Architecture Requirements

- FR-ARC-1 (Done, decided). The Next.js application (App Router, TypeScript) serves exactly one user-visible route, `/`. All screens are views switched by the Zustand UI store.
- FR-ARC-2 (Done, decided). One shared, pure TypeScript game engine at `src/lib/game-engine/` is imported by the Next.js app (local/AI modes) and by the Socket.IO server (online mode). The engine is deterministic given (state, dice) and performs no I/O.
- FR-ARC-3 (Done, decided). Online play is served by a dedicated Socket.IO mini-service (`mini-services/game-server/`, port 3003). The server is authoritative for dice rolls, moves, turns, and completion.
- FR-ARC-4 (Done, decided). Game completion results flow from the Socket.IO server to the Next.js backend via `POST /api/v1/internal/game-result`, protected by a shared secret, with transactional database writes.
- FR-ARC-5 (Planned). The web app must be responsive across mobile/tablet/desktop and PWA-ready (manifest, offline shell for local mode).

---

## 4. Board and Rules Requirements

### 4.1 Board configuration (final adopted)

- FR-BRD-1. 10x10 grid, 100 squares, zigzag boustrophedon numbering (square 1 bottom-left, square 100 top-left; direction alternates per row).
- FR-BRD-2. All tokens start on square 1; any roll moves a token (no "need a 6 to enter" rule in the adopted configuration).
- FR-BRD-3. Ladders (7): 4→25, 13→46, 33→49, 42→63, 50→69, 62→81, 74→92.
- FR-BRD-4. Snakes (9): 27→5, 40→19, 54→31, 60→38, 70→48, 87→24, 93→68, 96→45, 99→72.
- FR-BRD-5. Landing exactly on 100 wins; the win requires an exact roll. Overshooting 100 leaves the token in place (move kind `overshoot`).
- FR-BRD-6. Rolling a 6 grants exactly one extra turn. No triple-six penalty exists in the adopted configuration.
- FR-BRD-7. Multiple tokens may occupy the same square; they co-exist with a visual offset. There is no blocking and no capture.

### 4.2 Board validation rules (enforced by the engine and the board config test at design time)

- FR-VAL-1. Every ladder target is strictly above its foot.
- FR-VAL-2. Every snake target is strictly below its head.
- FR-VAL-3. No two snakes or ladders share a start square.
- FR-VAL-4. No snake tail lands on a ladder foot (no chains).
- FR-VAL-5. Nothing starts or ends on square 100 except the exact win condition.

### 4.3 Move resolution

- FR-MOV-1. After a roll of d, a token at p < 100 moves to p + d if p + d ≤ 100; otherwise it stays (overshoot).
- FR-MOV-2. If the destination is a ladder foot, the token climbs to the ladder head; if it is a snake head, the token slides to the tail. The move payload reports `kind: normal | ladder | snake | overshoot` and a full `path[]` for animation.
- FR-MOV-3. A move that lands the token on 100 (by direct step, never via snake or ladder continuation beyond the win square) completes the game; the first player to reach 100 wins.

---

## 5. Game Modes

### 5.1 Mode A — Local multiplayer (2–4 players, one device)

- FR-LOC-1. 2 to 4 human players share one device, passing turns.
- FR-LOC-2. Fully client-side; works offline after load. Dice uses client `Math.random()`.
- FR-LOC-3. Games are recorded to personal statistics and achievements but never affect Elo or the leaderboard.

### 5.2 Mode B — Player vs Computer

- FR-AI-1. One human plus 1–3 AI opponents.
- FR-AI-2. Difficulties Easy / Normal / Hard differ **only** in think delay and expressive emotes. AI dice are always fair random — never manipulated.
- FR-AI-3. AI behavior is client-side, using the shared engine for legality of moves.
- FR-AI-4. As with local mode, stats and achievements update; Elo and leaderboard are untouched.

### 5.3 Mode C — Online multiplayer (server-authoritative)

- FR-ONL-1. Private rooms with 6-character join codes; public matchmaking queue.
- FR-ONL-2. Ready-up flow, host controls, and color picking per player.
- FR-ONL-3. Server-authoritative dice (`crypto.randomInt(1, 7)`), moves, turn order, and completion.
- FR-ONL-4. Turn timeout of 40 seconds with automatic roll for the timed-out player.
- FR-ONL-5. Disconnect detection broadcast plus a 90-second reconnection grace period with full state resync (`game:state_sync`).
- FR-ONL-6. Duplicate `dice:roll` within one turn is rejected (idempotency); game state carries a monotonically increasing version.
- FR-ONL-7. Players may forfeit (`game:forfeit`).
- FR-ONL-8. Guests may occupy room slots; human-vs-human online matches feed Elo.

---

## 6. Accounts, Identity, and Social

- FR-AUT-1. Registration and login with email + password; passwords hashed with bcryptjs; sessions via JWT (jose) stored in an httpOnly cookie.
- FR-AUT-2. Guest access for local/AI play without registration, and guest slots in online rooms. Guests are not stored as users.
- FR-AUT-3. OAuth (Google) is explicitly out of scope for this release (C-5).
- FR-USR-1. User profile fields: username (unique), displayName, avatar emoji id, language (`en | bn`), role (`player | admin`), status (`active | suspended`).
- FR-USR-2. Per-user counters: rating (start 1000), gamesPlayed, wins, losses, currentStreak, bestStreak.
- FR-SOC-1. Friendship model: request / accept / reject / remove, unique requester-addressee pair, status `pending | accepted`.
- FR-SOC-2. Notifications per user with type, payload JSON, read flag.

---

## 7. Rating, Leaderboards, Achievements

- FR-ELO-1. Elo rating with K = 32, starting rating 1000, applied **only** to online human-vs-human matches.
- FR-ELO-2. Local and AI matches update personal stats and achievements but never Elo or leaderboards.
- FR-ELO-3. RatingHistory rows record delta, before, and after for every rated game; per-opponent pair updates are part of the transactional result ingestion.
- FR-LDB-1. Leaderboard endpoint supports `period = all | daily | weekly | monthly` and `scope = global | friends`.
- FR-ACH-1. Seven achievements, bilingual names/descriptions: `first_victory`, `first_online`, `games_10`, `wins_10`, `streak_5`, `games_100`, `multiplayer_champion`.
- FR-ACH-2. Unlock records are unique per (user, achievement) pair.

---

## 8. Real-Time Protocol (Socket.IO)

Connection: client connects with `io('/?XTransformPort=3003')`; the gateway transforms this to the game server on port 3003.

### 8.1 Client → Server events

| Event | Payload | Notes |
| --- | --- | --- |
| `auth:hello` | `{ token? , guest?: { name } }` | First message after connect; establishes identity (JWT or guest) |
| `room:create` | `{ maxPlayers }` | Host creates room; returns 6-char code |
| `room:join` | `{ code }` | Join existing room |
| `room:leave` | `{}` | Voluntary leave |
| `room:ready` | `{ ready }` | Ready-up toggle |
| `room:color` | `{ color }` | Color picking within room |
| `game:start` | `{}` | Host-only |
| `dice:roll` | `{}` | Rejected when not the actor's turn or duplicated within a turn |
| `matchmaking:join` | `{}` | Public queue |
| `matchmaking:cancel` | `{}` | Leave queue |
| `game:forfeit` | `{}` | Abandon an active game |

### 8.2 Server → Client events

| Event | Payload | Notes |
| --- | --- | --- |
| `room:state` | room snapshot | Authoritative room view |
| `room:player_joined` / `room:player_left` | player info | Lobby updates |
| `room:ready` | `{ playerId, ready }` | Ready toggles |
| `game:start` | `{ state }` | Seeded server state with version |
| `dice:result` | `{ playerIndex, dice }` | Server rolled value |
| `player:moved` | `{ playerIndex, from, to, path[], kind }` | `kind: normal \| ladder \| snake \| overshoot` |
| `turn:changed` | `{ playerIndex, reason }` | Includes timeout-driven changes |
| `game:completed` | `{ winnerIndex, results }` | Includes final placements |
| `player:disconnected` / `player:reconnected` | player info | During grace window |
| `game:state_sync` | `{ state }` | Full resync after reconnect |
| `matchmaking:searching` / `matchmaking:matched` | `{}` / `{ code }` | Queue lifecycle |
| `error` | `{ code, message }` | Machine-readable error code |

### 8.3 Protocol invariants

- FR-RT-1. Idempotency: a duplicate `dice:roll` within one turn is rejected with an `error` event.
- FR-RT-2. Versioning: game state carries a monotonically increasing `version`; clients detect desync by version comparison.
- FR-RT-3. Authority: the server validates turn ownership, room membership, and all transitions via the shared engine.

---

## 9. Data Model (SQLite via Prisma in sandbox)

Models and key fields (full ER diagram in ARCHITECTURE.md):

- **User**: id (cuid), email (unique), passwordHash, username (unique), displayName, avatar (emoji id), language (`en|bn`), role (`player|admin`), rating (1000), gamesPlayed, wins, losses, currentStreak, bestStreak, status (`active|suspended`), timestamps.
- **Game**: id, mode (`local|ai|online`), status (`active|completed|aborted`), boardConfig (JSON string), winnerId (nullable), turnCount, startedAt, endedAt.
- **GamePlayer**: gameId, userId (nullable for guests), name, color, isAI, finalPosition, placement, ratingBefore/ratingAfter (nullable).
- **GameMove**: gameId, playerIndex, playerName, dice, fromPos, toPos, kind.
- **RatingHistory**: userId, gameId, delta, before, after.
- **UserAchievement**: userId, achievementId (string id), unlockedAt; unique per pair.
- **Friendship**: requesterId, addresseeId, status (`pending|accepted`); unique pair.
- **Notification**: userId, type, payloadJson, read, createdAt.

- FR-DAT-1. Guests never create User rows; GamePlayer.userId is nullable for them.
- FR-DAT-2. Result ingestion writes (stats, Elo, achievements, notifications) run inside a single transaction.
- FR-DAT-3. The board configuration is stored per game as JSON for auditability and replay support.

---

## 10. REST API (all under `/api/v1`)

| Endpoint | Method(s) | Purpose |
| --- | --- | --- |
| `auth/register` | POST | Create account |
| `auth/login` | POST | Issue JWT cookie |
| `auth/logout` | POST | Clear cookie |
| `auth/me` | GET | Current session user |
| `users/me` | PATCH | Update profile (displayName, avatar, language) |
| `users/me/stats` | GET | Personal statistics |
| `users/me/matches` | GET | Personal match history |
| `leaderboard` | GET | `?period=all|daily|weekly|monthly&scope=global|friends` |
| `achievements` | GET | Catalog + current user's unlocks |
| `friends` | GET / POST | List; action `request|accept|reject|remove` |
| `games` | GET | Game history |
| `games/[id]` | GET | Single game with moves and players |
| `admin/stats` | GET | Platform counters |
| `admin/users` | GET / POST | `q` search; actions `suspend|restore|makeAdmin|removeAdmin` |
| `admin/games` | GET | Games monitor |
| `internal/game-result` | POST | Secret-protected ingestion from game server |

- FR-API-1. All request bodies validated with Zod.
- FR-API-2. Auth via httpOnly JWT cookie; admin routes require role `admin`.
- FR-API-3. In-memory rate limiting applied to auth routes.
- FR-API-4. `internal/game-result` requires the shared `INTERNAL_SECRET`; it is never exposed to browsers.

---

## 11. Presentation and UX Requirements

- FR-UX-1. Views (single route `/`): Landing, Auth, Dashboard, PlaySetup, Online, Game, Profile, Leaderboard, Friends, Settings, Rules, Admin.
- FR-UX-2. Token movement animates along `path[]` returned by the engine/server; ladder climbs and snake slides are distinct animations.
- FR-UX-3. Sound effects are synthesized via Web Audio API (dice roll, move, ladder, snake, win, turn change); mutable in Settings.
- FR-UX-4. Win celebration uses framer-motion particle confetti.
- FR-UX-5. Vibration API feedback on supported mobile devices.
- FR-UX-6. Language switch (EN/BN) is one click, persisted, and covers all UI strings plus achievements.
- FR-UX-7. The Game view shows dice history, turn indicator, player panels with positions, and (online) connection state.

---

## 12. Admin Requirements

- FR-ADM-1. Role-based admin flag on User; a seeded admin account exists after seeding.
- FR-ADM-2. Admin dashboard view shows platform stats, user management (search, suspend, restore, grant/revoke admin), and a games monitor.
- FR-ADM-3. Basic audit visibility over completed games and result ingestion.

---

## 13. Non-Functional Requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-1 | Performance | Dice-to-animation latency imperceptible locally; online round trip (roll → `player:moved`) within normal LAN/VPS latency budget; board renders 60 fps target |
| NFR-2 | Security | httpOnly + SameSite cookie; bcrypt cost ≥ 10; Zod on all inputs; rate limiting on auth; server-side dice; internal endpoint secret; admin checks server-side |
| NFR-3 | Reliability | Online state resync on reconnect; version-based desync detection; 40 s turn timeout auto-roll |
| NFR-4 | Fairness | Dice randomness is never manipulable by clients and never biased for AI |
| NFR-5 | i18n | All user-facing strings bilingual; no hard-coded UI copy in components |
| NFR-6 | Portability | No binary assets required for core experience (synthesized audio) |
| NFR-7 | Observability | Server logs turns, timeouts, disconnects; PROGRESS.md records verification runs |
| NFR-8 | Honesty | Documentation never claims unimplemented features; Planned/Pending markers used consistently |

---

## 14. Definition of Done (acceptance checklist)

Implementation is "done" only when every item below is true and verified. Unchecked items are tracked in PROGRESS.md.

- [ ] Board renders 10x10 with boustrophedon numbering and all 7 ladders / 9 snakes at the specified squares.
- [ ] Engine passes the board validation rules (FR-VAL-1..5) and all edge cases (exact finish, overshoot, six extra turn).
- [ ] Local mode supports 2–4 players fully offline with correct stats/achievement updates and no Elo effect.
- [ ] AI modes Easy/Normal/Hard differ only in think delay and emotes; AI dice remain fair.
- [ ] Online rooms: create/join by 6-char code, ready-up, host controls, color picking all function.
- [ ] Matchmaking queue pairs two players and starts a game.
- [ ] Server roll → `dice:result` → `player:moved` → `turn:changed` sequence matches the contract; duplicate rolls rejected.
- [ ] 40 s turn timeout auto-roll verified; 90 s reconnect grace with `game:state_sync` verified.
- [ ] Forfeit ends the game correctly and reports placements.
- [ ] Auth: register, login, logout, `auth/me`; JWT in httpOnly cookie; guests play without accounts.
- [ ] Profile edits persist; stats and match history populate after games.
- [ ] Elo applied to online human-vs-human only; RatingHistory rows written; local/AI games never touch rating.
- [ ] Leaderboard periods and scopes return correct data.
- [ ] All 7 achievements unlock with bilingual text and are idempotent per user.
- [ ] Friends request/accept/reject/remove; friend scope leaderboard works.
- [ ] Admin dashboard: stats, user search, suspend/restore, admin grant/revoke, games monitor.
- [ ] EN/BN switch translates every view and persists across reloads.
- [ ] Sound toggles, confetti on win, vibration on mobile observed.
- [ ] Result ingestion transaction verified against `internal/game-result` with secret; rejected without it.
- [ ] Lint passes (`bun run lint`) and dev server boots clean (`bun run dev`).
- [ ] DEPLOYMENT.md reviewed end-to-end against the actual code paths.
- [ ] PROGRESS.md reflects the true state; no feature is marked DONE without verification evidence.

---

## 15. Out of Scope / Future Work

| Item | Reason | Reference |
| --- | --- | --- |
| Google OAuth | External credentials unavailable in sandbox | C-5; DEPLOYMENT.md future work |
| Android native app (React Native/Capacitor) | No build toolchain in sandbox; web is PWA-ready | C-8; DEPLOYMENT.md appendix |
| PostgreSQL + Docker Compose deployment | Cannot execute VPS provisioning in sandbox | C-1, C-7; DEPLOYMENT.md |
| Automated test suites | Sandbox instruction forbids test code | C-6; AGENTS.md |
| Redis-backed scaling (rate limits, matchmaking, Socket.IO adapter) | Not required for single-node sandbox | ARCHITECTURE.md scaling path |

---

## 16. Traceability

Each FR/NFR section maps to stages in IMPLEMENTATION_PLAN.md:

| Spec section | Stage(s) |
| --- | --- |
| §3 Architecture | 01, 02 |
| §9 Data model | 03 |
| §4 Board/rules, engine invariants | 04 |
| §5.1–5.2, §11 Presentation | 05, 06 |
| §6 Accounts | 07 |
| §5.2 AI | 08 |
| §5.3 Online, §8 Protocol | 09 |
| §7 Rating/achievements | 10 |
| §11 responsiveness, PWA | 11 |
| §12 Admin | 12 |
| §13 NFRs | 13 |
| Production rollout | 14, 15 |

Live status for every stage lives in PROGRESS.md — this document defines *what must be true*, not *what is finished*.
