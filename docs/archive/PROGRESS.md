# SAPLUDU — Progress Tracker

| Field | Value |
| --- | --- |
| Last updated | 2026-01-14 (v0.6.0: 10 selectable board themes + ground-level token glide (drop effect removed at root) + full device/orientation responsiveness — verified) |
| Maintained by | All implementing engineers |
| Rule | This file is the live tracker. An item is DONE only after end-to-end verification (AGENTS.md §12). Never inflate status. |

Status vocabulary: `DONE` (verified), `IN_PROGRESS` (started, unverified), `PENDING` (not started or awaiting other work).

---

## 1. Feature Status

| Feature | Status | Notes |
| --- | --- | --- |
| Architecture analysis and decision record | DONE | MASTER_SPECIFICATION.md + ARCHITECTURE.md; constraint adaptations documented |
| Documentation set (9 root documents) | DONE | Spec, architecture, plan, rules, deployment, agents, changelog, readme, tracker |
| Prisma schema implementation + admin seed | DONE | SQLite/Prisma, 8 models; `bun run db:push` + `prisma/seed.ts` executed; admin seeded |
| Shared game engine (`src/lib/game-engine/`) | DONE | Pure deterministic transitions, separated RNG, validated board (7 ladders / 9 snakes), engine `isAI` contract; bug found & fixed during E2E verification; **v0.4.0**: engine path duplication fixed (plain moves now carry EXACTLY `dice` squares) — exhaustively verified for every dice 1–6 from every position 1–99 |
| Web UI foundation (single-route SPA, 14 views) | DONE | Landing, auth, dashboard, play, local/AI setup, online lobby, game, profile, leaderboard, friends, settings, rules, admin, dialogs |
| Board rendering: zigzag 10×10, SVG snakes (heads/eyes/tongue) + wooden ladders, stacking tokens | DONE | **v0.3.0**: realistic tapered snakes (scale texture, blotches/bands, 9 palettes, articulated heads) aligned to squares; wooden ladders with climb glow; verified desktop + mobile. **v0.4.0**: 3D tube shading (stacked width-scaled outlines), clipped dorsal pattern + scales, angry brows + idle fangs + throat, staggered idle sway/head-bob, wood-grain ladders, square lighting, goal trophy on square 100's true center + START marker, depth vignette. **v0.6.0**: 10 selectable board themes (classic/modern3d/jungle/fantasy/cartoon/royal/neon/nature/space/minimal) — colors+décor only, same engine/numbering/connections; theme-driven squares, frames, snake palettes, ladder colors, goal/start badges; star field (space) + neon grid décor; luminance-based number contrast; gallery + setup strips + online lobby picker, persisted selection; landing hero reflects the chosen theme |
| Animations: 3D dice tumble, hop path, ladder climb, snake slide, banners, confetti | DONE | **v0.3.0**: per-square hop (arc + squash/stretch), snake swallow choreography (mouth → bulge → tail emergence), ladder climb along true angle; rAF sequencer isolated from engine state; reduced-motion skips choreography; roll blocked while animating. **v0.4.0**: new `playMoveHops` fx sequencer (ease-out-back hops, parabolic arc, squash, tilt, settle bounce — per-frame via tokenOverride, no per-hop board re-render), dice toss arc + landing bounce + impact shadow, online movement waits for the dice to land, deferred turn highlight, stale `player:moved` version guard, move-log fromPos uses server `from`. **v0.5.0**: dice cube rebuilt from single source of truth (mount = inverse of show-rotation — face 3/4 display swap fixed, displayed pips now PROVABLY equal the engine dice), slower countable cadence (HOP_MS 400 / STEP_PAUSE_MS 170 / LANDING_PAUSE_MS 240), "Step k of N (dice n)" counter chip with i18n (EN+BN), grounded drop shadow while hopping/climbing. **v0.6.0**: movement rewritten as **ground-level glide** — per-hop parabolic arc, squash/stretch, settle bounce, pause bob, token hop-squash and ladder per-rung hop all REMOVED (root cause of the "drop from above" effect); constant size/orientation/grounded shadow; snake swallow + ladder climb kept drop-free; ladder rides the line exactly |
| Board themes + selection UI | DONE | **v0.6.0**: gallery view with live static previews, Select/Play-with-board actions, selected highlight; compact board strips on Local/AI setup + Online lobby; choice persisted in `ui-store.boardTheme` (zustand-persist) across sessions; bilingual EN+BN; themes never alter rules/coordinates (same `DEFAULT_BOARD` for all) |
| Responsive board across devices/orientations | DONE | **v0.6.0**: `.board-fit` sizes the square board to BOTH width and viewport height — 360×640 (300px, no scroll), 390×844 (366px), 768×1024 (714px), 1280×800 (560px cap), landscape phones 844×390 (200px board, controls move beside it via `.game-landscape-grid` media query); container-query square numbers `clamp(8px,2cqw,12px)`; zero horizontal overflow at every size; portrait + landscape + small phone + tablet + desktop verified |
| Authentication (register/login/logout/me, JWT httpOnly, bcryptjs, rate limited) | DONE | Verified via UI + curl; session persists across reloads (response-shape bug found & fixed) |
| Profiles, personal stats, match history (paginated) | DONE | Real DB records only; verified in UI |
| AI opponents (1–3, Easy/Normal/Hard, fair dice) | DONE | Difficulty = think delay + emotes only; auto-turn verified live in browser |
| Local multiplayer 2–4 players | DONE | Verified: dice, movement, extra-turn-on-6, turn switching, move log |
| Online multiplayer (rooms, ready-up, host, color pick, room codes) | DONE | Two-browser E2E: create/join/ready/start, cross-client dice sync, turn handoff both directions |
| Server-authoritative loop (crypto.randomInt dice, engine-enforced turns, versioning) | DONE | Server rejects out-of-turn rolls (NOT_YOUR_TURN verified); mirror-state phase bug found & fixed |
| Turn timeout 40 s auto-roll + 90 s disconnect grace + resync | DONE | Timeout auto-roll observed live on abandoned room; reconnect verified by socket-server E2E suite |
| Result ingestion (`internal/game-result`, transactional) | DONE | Games, moves, players persisted; Elo + achievements + notifications written |
| Elo rating (K=32, online human-vs-human only) + RatingHistory | DONE | Elo only for online human matches; forfeits included; guests excluded |
| Leaderboard (all-time/daily/weekly/monthly × global/friends) | DONE | Verified live with seeded data; your-position banner |
| Achievements (7, bilingual, idempotent) | DONE | `first_victory` unlocked live via verified match; unique constraint prevents duplicates |
| Friends (request/accept/reject/remove) + notifications | DONE | Full CRUD verified via API + UI |
| Bilingual EN/বাংলা (one-click switch, persisted) | DONE | Full UI translation verified including live move log in Bangla |
| Responsive web + mobile bottom navigation (replaces native Android) | DONE | 390×844 verified: board fully visible, no horizontal scroll, touch targets ≥44px |
| Admin dashboard (overview, user management, match monitor, audit log) | DONE | Role-gated; suspend/restore/grant admin + append-only audit records |
| Security hardening (bcrypt, httpOnly cookies, Zod, rate limiting, internal secret, server dice) | DONE | Implemented; see DEPLOYMENT.md for production checklist (HTTPS etc.) |
| Docker/VPS deployment execution | PENDING (guide only) | DEPLOYMENT.md contains full Ubuntu + Docker Compose + PostgreSQL guide; execution not possible in sandbox |
| Automated unit/integration tests | PENDING (intentionally deferred) | Sandbox instruction forbids test code; Agent Browser E2E verification recorded in §3 |
| Google OAuth sign-in | PENDING (future work) | Requires external credentials; must never be fabricated |
| Android native app | PENDING (future work) | Web is fully responsive + PWA-ready; outline in DEPLOYMENT.md appendix |
| Redis-backed scaling (rate limit, matchmaking, Socket.IO adapter) | PENDING (future work) | Single-node design documented in ARCHITECTURE.md |

## 2. Stage Status (mirrors IMPLEMENTATION_PLAN.md)

| Stage | Title | Status |
| --- | --- | --- |
| 01 | Architecture analysis | DONE |
| 02 | Repository infrastructure | DONE |
| 03 | Database schema | DONE (SQLite adaptation documented) |
| 04 | Game engine | DONE |
| 05 | Web UI foundation | DONE |
| 06 | Animations and feedback | DONE |
| 07 | Auth and profiles | DONE |
| 08 | AI opponents | DONE |
| 09 | Online multiplayer | DONE (two-client browser verified) |
| 10 | Leaderboards, achievements, social | DONE |
| 11 | Platform reach (responsive web/PWA replaces native Android in sandbox) | DONE |
| 12 | Admin dashboard | DONE |
| 13 | Security and performance review | DONE (in-sandbox scope; production HTTPS/backup checklist in DEPLOYMENT.md) |
| 14 | Deployment preparation | PENDING (docs complete; execution requires real VPS) |
| 15 | Production-readiness audit | PENDING (blocked by Stage 14 + external credentials) |

## 3. Verification Log (Agent Browser, 2026-01-14)

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Landing renders, feature grid, sticky footer | PASS |
| 2 | Local 2P match: roll 6 → extra turn, 1→7→9, turn switch, move log | PASS |
| 3 | AI match: Raja auto-rolls after think delay, turn passes back, AI badge shown | PASS (after fixing engine `kind` vs `isAI` contract bug) |
| 4 | Register → dashboard with real stats (0 games, 1000 Elo) | PASS |
| 5 | Match report API: game persisted, `first_victory` unlocked, streak=1 | PASS (after removing unsupported `skipDuplicates` on SQLite) |
| 6 | Online: P1 create room FJS4XU/4ZMF3R/P5QSZG, P2 joins by code, ready-up, host start | PASS |
| 7 | Online dice sync: P1 roll visible on P2 screen, positions + dice + disable state | PASS |
| 8 | Online turn handoff both directions; move log mirrored on both clients | PASS (after fixing phase-stomp bug in online store) |
| 9 | Bangla switch: full UI translation incl. move log ("মই বেয়ে উঠেছে") | PASS |
| 10 | Leaderboard with real Elo row + your-position banner | PASS |
| 11 | Admin: overview stats, user list, suspend/grant controls, match monitor with all ingested games | PASS |
| 12 | Session persistence across reload (fetchMe response-shape fix) | PASS |
| 13 | Mobile 390×844: board fully visible, bottom nav, dice usable | PASS (after adding mobile bottom navigation) |
| 14 | Turn timeout auto-roll on abandoned room (server log evidence) | PASS |
| 15 | Socket-server scripted E2E (by Task 7): 14 rolls, ladder event, reconnect+state_sync, forfeit completion, matchmaking auto-start, internal POST → DB rows | PASS |
| 16 | v0.6.0: all 10 board themes render in gallery; 7 verified in real games (classic/jungle/neon/royal/space/minimal/fantasy); selection persists across reload; Bangla gallery complete | PASS |
| 17 | v0.6.0: dice 1–6 re-verified live (1:5→6, 2:25→27+snake→5, 3:1→4+ladder→25, 4:1→5, 5:12→17, 6:6→12+extra turn); AI extra turn + 7→11; mid-move fx sample proves ground glide (rotation 0, scale 1, constant shadow) | PASS |
| 18 | v0.6.0: responsive sweep 360×640 / 390×844 / 768×1024 / 844×390 landscape (side-by-side controls) / 1280×800 — no horizontal overflow anywhere; online 2-client match via gateway still syncs (extra turn + ladder 13→46 + timeout auto-roll) | PASS |

### Bugs found and fixed during verification
1. Engine `PlayerState.kind` vs UI `isAI` mismatch — AI turns never triggered. Unified to `isAI` across engine/stores/server.
2. `fetchMe` read `body.user` instead of `body.data.user` — session lost on every reload. Fixed with explicit envelope type.
3. Prisma `skipDuplicates` unsupported on SQLite — removed; uniqueness enforced by pre-filter + DB constraint.
4. Online store phase stomp: `animateMove` overwrote `awaiting-roll` set by `turn:changed`, freezing matches. Ownership of phase transition moved to `turn:changed`.
5. Mobile had no navigation (desktop nav hidden `md:flex`) — added fixed bottom navigation with safe-area padding.
6. React 19 hooks-lint violations (setState-in-effect, ref-during-render) — refactored to deferred loads, derived state, and animation controls.

## 4. Definition of Done (MASTER_SPECIFICATION §28)

- [x] Web application builds and runs (dev server, lint clean)
- [x] Database schema executes (`db:push`), seed works
- [x] Authentication works (register/login/logout/session)
- [ ] Google authentication — future work (credentials required)
- [x] Local multiplayer works
- [x] AI gameplay works
- [x] Online multiplayer works between separate browser sessions (two clients)
- [x] 2–4 players supported by engine and server (4P room creation verified; full 4P match exercised in socket-server E2E)
- [x] Dice results are server-authoritative online
- [x] Snakes and ladders work correctly (ladder climb observed live)
- [x] Animations work (dice/hops/banners/confetti)
- [x] Reconnection works (session restore + state sync)
- [x] Player profiles work
- [x] Game history works
- [x] Leaderboards work
- [x] Achievements work
- [x] Bangla interface works
- [x] English interface works
- [x] Admin dashboard works
- [ ] Security tests pass — automated suite intentionally deferred; manual review done
- [ ] Critical automated tests pass — intentionally deferred (sandbox rule)
- [ ] Docker deployment works — guide written, execution requires VPS
- [x] VPS deployment documentation is complete
- [ ] Android APK/AAB builds — future work (PWA-ready web delivered instead)
- [x] README and technical documentation are complete

## v0.5.0 — Dice display accuracy + countable movement + homepage identity (2026-01-14)

### Root cause found & fixed (dice-vs-movement mismatch)
- The game engine was already exact (v0.4.0 fixed path duplication). The REMAINING root cause of "dice shows X but token moves Y" was in the dice cube rendering: `FACE_ROTATIONS` for faces 3 and 4 used the same sign as the mount transforms instead of the inverse — the cube physically displayed 4 pips on a roll of 3 and 3 pips on a roll of 4 (proven with a 3D rotation-matrix verification script before touching the code).
- Fix: the cube is now constructed from a single source of truth — each face's mount transform is derived as the exact geometric inverse of its show-rotation, so display == engine value by construction. Also merged the tumble/land/idle effects into one ordering-safe effect (an idle face-change race could rest the cube on a stale face).

### Verification evidence (all browser-observed, screenshots archived in repo root)
- `bun run scripts/verify-engine.ts` — exhaustive: 594 combinations (99 squares × 6 dice) all exact; zigzag roundtrip + adjacency; jump destinations; overshoot; exact-100 win; extra-turn-on-6; full match logs consistent.
- Browser forced rolls: dice 1→5+1=6, 2→5+2=7, 3→6+3=9 (displayed 3 pips — previously 4!), 4→7+4=11 (displayed 4 pips — previously 3!), 5→9+5=14, 6→11+6=17; move log matches every entry.
- Snake 24+3=27 → 5 (open-jaw capture captured mid-animation), ladder 3+1=4 → 25, overshoot 98+3 stays 98, exact win 97+3=100 with victory dialog, extra turn after 6 observed twice.
- Real roll flow: chip counts "Step 1 of 5 (dice 5)" → "Step 3 of 5", final 1+5=6; movement visibly square-by-square with grounded shadow.
- AI mode: extra turn + AI ladder (1+3=4→25) with turn handback.
- Online 2-client match via gateway: create/join/ready/start synced; rolls 6/3/2 produced identical dice+positions+turns on both clients at every step.
- Mobile 390px game + homepage verified; lint clean; no console or dev.log errors.

## v0.6.0 — 10 board themes + ground-level token glide + full responsiveness (2026-01-14)

### Root cause found & removed (token "drop from above")
- The unwanted top-to-bottom dropping feel was **never** a game-logic error (the engine has been exact since v0.4.0/v0.5.0) — it was vertical motion in the animation layer: per-hop parabolic arc lift, squash & stretch scaling, arrival settle bounce, breathing bob between squares, token-level hop squash keyframes, ladder per-rung hop and snake-tail settle squash.
- `playMoveHops` rewritten as a **ground-level glide** (board-fx.ts): the pawn slides along the board surface square by square with constant size (scale 1), constant orientation (rotation 0) and a constant soft grounded shadow; pauses between squares are still (no bobbing); arrival is a still settle (no bounce). Ladder climb rides the ladder line exactly (rung sounds kept); snake swallow keeps mouth/bulge/emerge with a still settle. The pawn can no longer fall, fly, teleport or resize while moving — in any mode (local/AI/online). `token.tsx` hop-squash keyframes and celebrate bounce removed (overshoot shake is rotation-only).

### Board themes (new)
- `src/lib/board-themes.ts` — ten boards sharing one engine: square palette/pattern, frame, backdrop, vignette, snake palettes, ladder colors, goal/start badges, star field (space), neon grid (neon). Geometry & connections are theme-independent, so snakes/ladders always sit on their squares and every rule/coordinate is identical in all ten designs.
- Selection surfaces: board gallery view (previews + Select + Play-with-this-board), board strips on Local/AI setup and the Online lobby, Play-screen board card; selection persisted (zustand-persist `boardTheme`) and restored across sessions; landing hero reflects the chosen theme; full EN+BN translations.
- Theming plumbing: `snake.tsx` accepts a palette override, `ladder.tsx` accepts a full color theme, `board.tsx` renders theme squares/frame/décor, `board-preview.tsx` + `board-strip.tsx` provide cheap static previews (no fx subscriptions, no animations).

### Responsive (new)
- `.board-fit` + `.game-landscape-grid` + landscape show/hide helpers in `globals.css`: board fits width AND viewport height on every device; landscape phones flip to board-beside-controls; container-query square numbers `clamp(8px,2cqw,12px)`; luminance-based number contrast for all themes.

### Verification evidence (all browser-observed, screenshots archived in repo root: `v6-*.png`)
- Dice exactness re-verified live for all six faces: 1:5→6, 2:25→27+snake→5, 3:1→4+ladder→25, 4:1→5, 5:12→17, 6:6→12+extra turn; AI: 6→7 extra turn + 7→11; every move log entry matches.
- Mid-move fx sample during a real roll: `rotation:0, scale:1, shadowStrength:0.26`, y locked to row center — proves ground-level glide with zero vertical translation/deformation.
- Themes: gallery shows all 10; in-game checks on classic, jungle, neon, royal, space, minimal, fantasy; persistence across reload verified; Bangla gallery verified; snake swallow + ladder climb verified drop-free; reduced-motion instant placement verified.
- Online (two browser sessions via gateway): create/join/ready/start; roll 6 → 7 synced; extra-turn + ladder 13→46 authoritative; 40s timeout auto-roll; identical state on both clients.
- Responsive sweep at 360×640, 390×844, 768×1024, 844×390, 1280×800 — board always fully visible, no horizontal overflow, controls never cover the board.
- `bun run lint` clean; no console/page errors; dev.log clean.
