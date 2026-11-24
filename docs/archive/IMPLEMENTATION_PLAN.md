# SAPLUDU Implementation Plan

| Field | Value |
| --- | --- |
| Version | 0.1.0 |
| Date | 2026-01-14 |
| Stages | 15 |
| Live status tracker | PROGRESS.md (this file defines scope; PROGRESS.md defines truth) |

## How to read this plan

- Each stage lists Objective, Tasks, Acceptance Criteria, and a Status marker.
- Status markers: `PLANNED-COMPLETE` (stage deliverables are specified and accepted in planning — code landings are tracked in PROGRESS.md), `PENDING` (not started or in flight by other engineers), `DONE` (verified per AGENTS.md §12).
- Stages 01–03 are marked `PLANNED-COMPLETE`. All other stages are `PENDING`; other engineers are actively implementing them. Do not edit stage status here — the live tracker is PROGRESS.md.
- Environment constraints (SQLite, single-route SPA, port-3003 mini-service, no tests, no OAuth, no native Android) are decisions recorded in MASTER_SPECIFICATION.md §2; every stage below already incorporates them.

---

## Stage 01 — Architecture Analysis

**Status: PLANNED-COMPLETE**

**Objective.** Establish the authoritative architecture for SAPLUDU under sandbox constraints, and capture it in durable documents.

**Tasks.**
- [x] Analyze the existing Next.js 16 scaffold (App Router, Tailwind 4, shadcn/ui, Zustand, Prisma/SQLite).
- [x] Decide the single-route SPA model: `/` as view router driven by the Zustand `ui` store.
- [x] Decide the shared pure game engine module (`src/lib/game-engine/`) consumed by both the web app and the Socket.IO server.
- [x] Decide the Socket.IO mini-service topology (port 3003, gateway transform `/?XTransformPort=3003`).
- [x] Decide server-authoritative online play with idempotent rolls and state versioning.
- [x] Record constraint adaptations (SQLite, no OAuth, no tests, no native Android) with upgrade paths.
- [x] Write MASTER_SPECIFICATION.md, ARCHITECTURE.md, AGENTS.md.

**Acceptance criteria.**
- Architecture documents exist and internally agree (event contract, DB models, ports, module boundaries).
- Every constraint adaptation has a documented production upgrade path.
- A later engineer can implement any stage using only the docs set.

---

## Stage 02 — Repository Infrastructure

**Status: PLANNED-COMPLETE**

**Objective.** Prepare the repository skeleton, tooling, and conventions for all subsequent stages.

**Tasks.**
- [x] Confirm package.json scripts: `dev`, `build`, `start`, `lint`, `db:push`, `db:generate`, `db:migrate`, `db:reset` (bun-run).
- [x] Confirm ESLint 9 flat config and TypeScript strict settings; define "lint must pass" rule in AGENTS.md.
- [x] Reserve module directories: `src/lib/*` (game-engine, i18n, auth, elo, achievements, sound, socket-client, rate-limit, db), `src/stores/*`, `src/components/{board,game,views}`.
- [x] Reserve `mini-services/game-server/` for the Socket.IO service; document install/run commands.
- [x] Establish the gateway transform convention (`Caddyfile`, `/?XTransformPort=3003`).
- [x] Documentation set created in repo root (this plan, README, CHANGELOG, GAME_RULES, DEPLOYMENT, PROGRESS).

**Acceptance criteria.**
- `bun run dev` serves the scaffold on port 3000; `bun run lint` passes.
- Folder conventions documented and directory names stable.
- AGENTS.md instructs future agents on commands, ports, and honesty rules.

---

## Stage 03 — Database Schema

**Status: PLANNED-COMPLETE**

**Objective.** Define the full Prisma data model for users, games, ratings, achievements, social graph, notifications, and admin needs — on SQLite in the sandbox, PostgreSQL-ready for production.

**Tasks.**
- [x] Specify models: User, Game, GamePlayer, GameMove, RatingHistory, UserAchievement, Friendship, Notification (fields per MASTER_SPECIFICATION.md §9).
- [x] Decide guest policy: no User rows for guests; `GamePlayer.userId` nullable.
- [x] Decide Elo bookkeeping: `RatingHistory(delta, before, after)` per rated game; ratingBefore/after on GamePlayer.
- [x] Decide boardConfig persistence as JSON string per Game for audit/replay.
- [x] Specify the transactional ingestion contract for `POST /api/v1/internal/game-result`.
- [x] Document the SQLite → PostgreSQL provider swap path (DEPLOYMENT.md).
- [ ] Implementation of `prisma/schema.prisma` replacement and seed script (admin account) — **owned by implementing engineers, tracked in PROGRESS.md**.

**Acceptance criteria.**
- `bun run db:push` succeeds with the final schema; Prisma client regenerates.
- Unique constraints present: user email, user username, (user, achievement), friendship pair.
- Guest games persist without User rows; rated games persist rating history.

---

## Stage 04 — Game Engine

**Status: PENDING**

**Objective.** Implement the shared pure TypeScript engine: board model, movement, snakes/ladders, exact-finish, and state versioning.

**Tasks.**
- [ ] Encode the adopted board config (7 ladders, 9 snakes; validation rules FR-VAL-1..5).
- [ ] Implement `applyRoll(state, playerIndex, dice) -> { state, events }` with move kinds `normal | ladder | snake | overshoot` and full `path[]`.
- [ ] Implement exact-finish on 100, overshoot stay, six-extra-turn.
- [ ] Implement turn ordering for 2–4 players; support AI players as ordinary indices.
- [ ] Version stamp on every state transition (monotonic `version`).
- [ ] Zero I/O, zero randomness inside the engine (dice is an input).

**Acceptance criteria.**
- All board validation rules pass at construction time.
- Edge cases from GAME_RULES.md behave exactly as documented (98 + 5 stays at 98 with kind `overshoot`; 99 + 1 wins; 74 + 0-style climbs, etc.).
- The same module imports cleanly in the Next.js app and in `mini-services/game-server`.

---

## Stage 05 — Web UI Foundation

**Status: PENDING**

**Objective.** Build the single-route view system and all primary views.

**Tasks.**
- [ ] Zustand `ui` store view switching; `/` renders the active view.
- [ ] Views: Landing, Auth, Dashboard, PlaySetup, Online, Game, Profile, Leaderboard, Friends, Settings, Rules, Admin.
- [ ] Board component (10x10, boustrophedon numbering, ladder/snake art), token rendering with multi-token offset on shared squares.
- [ ] Dice component, turn indicator, player panels, dice history.
- [ ] EN/BN dictionary integration across all views.

**Acceptance criteria.**
- Every view reachable via store switches; no additional page routes.
- Board matches GAME_RULES.md layout exactly.
- `bun run lint` passes; navigation works at mobile and desktop widths.

---

## Stage 06 — Animations and Feedback

**Status: PENDING**

**Objective.** Commercial-quality motion and feedback: token movement along `path[]`, snake/ladder transitions, confetti, sound, vibration.

**Tasks.**
- [ ] Token walk animation consuming `path[]` from engine/server events.
- [ ] Distinct ladder climb and snake slide animations; overshoot "bounce" feedback.
- [ ] Web Audio API synthesized SFX (dice, move, ladder, snake, win, turn) with Settings mute.
- [ ] framer-motion confetti on win.
- [ ] Vibration API hooks on mobile.

**Acceptance criteria.**
- Animations follow authoritative events only (no client-invented movement).
- No binary audio assets introduced.
- Sound/vibration toggles persist.

---

## Stage 07 — Authentication and Profiles

**Status: PENDING**

**Objective.** Email+password auth with JWT cookie, guest play, profile management, personal stats and match history.

**Tasks.**
- [ ] `auth/register`, `auth/login`, `auth/logout`, `auth/me` (bcryptjs + jose, httpOnly cookie, Zod, in-memory rate limiting).
- [ ] `users/me` PATCH (displayName, avatar emoji id, language), `users/me/stats`, `users/me/matches`.
- [ ] Guest flow for local/AI and guest slots online (no User rows).
- [ ] Zustand `auth` store mirroring session state client-side.
- [ ] Admin seeding path (seeded admin account).

**Acceptance criteria.**
- Register → login → refresh keeps session; logout clears cookie.
- Guests can play without accounts; guests never create User rows.
- Stats/matches endpoints return real ingested data.

---

## Stage 08 — AI Opponents

**Status: PENDING**

**Objective.** 1–3 AI opponents with Easy/Normal/Hard differences limited to think delay and emotes; dice always fair.

**Tasks.**
- [ ] AI turn runner on top of the shared engine (client-side, local/AI mode).
- [ ] Difficulty tuning: think delays and emote frequency only.
- [ ] Explicit code review gate: no dice manipulation for AI (AGENTS.md §7.3).
- [ ] AI games recorded as mode `ai`, affecting stats/achievements only.

**Acceptance criteria.**
- Over a long observation run, AI dice distribution is statistically fair.
- Difficulties differ observably only in pacing/emotes.
- No Elo writes for AI games.

---

## Stage 09 — Online Multiplayer

**Status: PENDING**

**Objective.** Server-authoritative online play: rooms, matchmaking, turns, timeouts, reconnection.

**Tasks.**
- [ ] Socket.IO service skeleton on 3003 with `auth:hello` (JWT or guest) identity.
- [ ] Rooms: create/join/leave, 6-char codes, maxPlayers, ready-up, host controls, color picking, `room:*` broadcasts.
- [ ] Matchmaking queue: `matchmaking:join/cancel`, `searching`, `matched`.
- [ ] Game loop: `dice:roll` (server `crypto.randomInt`), `dice:result`, `player:moved`, `turn:changed`, `game:completed`; idempotency + version.
- [ ] Turn timeout 40 s auto-roll; disconnect detection; 90 s grace; `game:state_sync`; forfeit.
- [ ] Result ingestion POST to `/api/v1/internal/game-result` with `INTERNAL_SECRET`; transactional writes.
- [ ] `socket-client` module in `src/lib` with reconnect + resync handling.

**Acceptance criteria.**
- Full event contract from MASTER_SPECIFICATION.md §8 verified live.
- Duplicate roll rejected; state version monotonically increases.
- Disconnect/reconnect resync restores identical state (version match).
- Rated online human games produce Elo + RatingHistory + notifications.

---

## Stage 10 — Leaderboards, Achievements, Social

**Status: PENDING**

**Objective.** Elo leaderboard, 7 bilingual achievements, friends, notifications.

**Tasks.**
- [ ] Elo application (K=32, start 1000) restricted to online human-vs-human; pair updates transactional.
- [ ] `leaderboard?period&scope` (global/friends) with period filtering.
- [ ] Achievement engine: first_victory, first_online, games_10, wins_10, streak_5, games_100, multiplayer_champion; bilingual copy; idempotent unlocks.
- [ ] Friends: request/accept/reject/remove; friends list; notifications on events.

**Acceptance criteria.**
- Local/AI games never touch rating or leaderboard.
- All 7 achievements demonstrably unlock and render in EN/BN.
- Friend-scoped leaderboard matches friendship state.

---

## Stage 11 — Responsive Web and PWA (adapted from native Android)

**Status: PENDING**

**Objective.** Deliver the mobile experience through responsive web + PWA instead of a native Android app (sandbox constraint C-8).

**Tasks.**
- [ ] Responsive audit of all views at phone/tablet/desktop widths.
- [ ] Touch ergonomics: dice tap targets, pass-and-play rotation handling.
- [ ] PWA manifest, icons, theme color; offline shell adequate for local mode.
- [ ] Document the native Android (Capacitor/TWA) future path in DEPLOYMENT.md appendix.

**Acceptance criteria.**
- Full game playable on a phone viewport with no layout breakage.
- PWA installable; local mode usable offline after load.
- Native path documented honestly as future work (not executed).

---

## Stage 12 — Admin Dashboard

**Status: PENDING**

**Objective.** Role-protected admin view: platform stats, user management, games monitor, audit basics.

**Tasks.**
- [ ] `admin/stats`, `admin/users` (GET `q` search; POST suspend/restore/makeAdmin/removeAdmin), `admin/games`.
- [ ] Admin view gated server-side by `role === 'admin'`; seeded admin account usable.
- [ ] Games monitor listing recent games with mode, status, players.
- [ ] Basic audit visibility over result ingestion.

**Acceptance criteria.**
- Non-admins receive 403-equivalent errors, not just hidden UI.
- Suspend blocks login; restore re-enables.
- Admin actions are visible in the games/audit views.

---

## Stage 13 — Security and Performance Review

**Status: PENDING**

**Objective.** Systematic review against NFRs before deployment docs freeze.

**Tasks.**
- [ ] Auth surface review: cookie flags, bcrypt cost, rate limiter behavior, guest abuse limits.
- [ ] Socket surface review: payload validation (Zod), turn ownership checks, idempotency, version integrity.
- [ ] Internal endpoint: secret required, non-guessable, no browser exposure.
- [ ] Admin authorization checks server-side everywhere.
- [ ] Performance pass: board render profile, animation cost, Prisma query counts on ingestion.
- [ ] Fairness audit: confirm dice sources (`crypto.randomInt` server, `Math.random` client) and no AI bias.

**Acceptance criteria.**
- Findings fixed or explicitly deferred with notes in PROGRESS.md.
- No client path can influence online dice outcomes.
- Ingestion transaction completes under load-like bursts without partial writes.

---

## Stage 14 — Deployment Preparation (Documentation)

**Status: PENDING**

**Objective.** Finalize DEPLOYMENT.md as the executable production guide (Ubuntu VPS, Docker Compose, PostgreSQL, Caddy/Nginx TLS) — clearly marked as not executed in the sandbox.

**Tasks.**
- [ ] Docker Compose topology: web, postgres, redis, game-server, caddy (or nginx+certbot).
- [ ] Env var table finalized (DATABASE_URL, AUTH_SECRET, INTERNAL_SECRET; no NEXT_PUBLIC_* required).
- [ ] SQLite → PostgreSQL migration steps verified against the Prisma schema.
- [ ] Health check endpoints specified for web and game server.
- [ ] Backup/restore script outlines (pg_dump, restore drill, cron).
- [ ] Android/PWA release appendix outline.

**Acceptance criteria.**
- A competent operator could provision a VPS from DEPLOYMENT.md alone.
- Every command in the guide is consistent with actual scripts and ports.
- Guide honestly distinguishes sandbox-reality from production-plan.

---

## Stage 15 — Production-Readiness Audit

**Status: PENDING**

**Objective.** Final gate: verify the Definition of Done checklist and close the release.

**Tasks.**
- [ ] Walk MASTER_SPECIFICATION.md §14 checklist item by item with evidence links.
- [ ] Confirm PROGRESS.md statuses match reality; downgrade any unverified DONE.
- [ ] Confirm CHANGELOG.md completeness.
- [ ] Final lint + clean build check.
- [ ] Sign-off note in PROGRESS.md.

**Acceptance criteria.**
- Every DoD item checked with recorded verification, or explicitly listed as deferred with rationale.
- No documentation claims unimplemented features.

---

## Constraint Adaptations Embedded Across Stages

| Adaptation | Affects stages |
| --- | --- |
| SQLite instead of PostgreSQL | 03, 09, 14 |
| Single-route SPA via Zustand views | 05, 12 |
| Socket mini-service port 3003 + gateway transform | 02, 09 |
| No automated tests (Agent Browser verification) | all |
| No Google OAuth | 07 |
| No native Android (PWA instead) | 11, 14 |
| Client Math.random for local/AI; server crypto.randomInt online | 04, 08, 09 |
