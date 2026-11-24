# Changelog

All notable changes to SAPLUDU (সাপলুডু) are documented here.
Format based on Keep a Changelog; versioning is SemVer.

## [0.6.0] — 2026-01-14

### Added — 10 selectable board designs (one engine, zero rule drift)
- **Board theme catalog** (`src/lib/board-themes.ts`): ten hand-crafted, visually distinct boards — Classic Snakes & Ladders, Modern 3D, Jungle Adventure, Fantasy World, Cartoon Fun, Royal Gold, Neon Gaming, Nature, Space Adventure, Minimal Modern. Each theme only changes **colors and décor** (square palette + pattern, frame, backdrop, vignette, snake palettes, ladder colors, goal/start badges, star field, neon grid). Snake/ladder geometry, the 1–100 zigzag numbering, dice logic, token coordinates and every rule are untouched — all themes run on the exact same engine and the same `DEFAULT_BOARD` connections, so snakes and ladders always align with their squares.
- **Board gallery** (`src/components/views/boards.tsx`, new view `boards`): attractive card grid with a live static preview of every board, "Selected" highlight, Select action, "Play with this board" CTA and a rules-unchanged note. Bilingual (EN + বাংলা).
- **Selection UX everywhere it matters**: full gallery reachable from the Play screen's new "Board" card and every setup screen; compact horizontally-scrollable board strip (`board-strip.tsx`) added to the Local/AI setup cards and the Online lobby; the choice is persisted (`ui-store.boardTheme`, zustand-persist) and restored across sessions; the landing hero board renders the player's currently selected theme.

### Changed — token movement is now ground-level glide (drop effect removed at the root)
- **Root cause of the "drop from above" impression** was vertical motion in the animation layer (the engine was already exact): the per-hop **parabolic arc** (`-sin(πt)·2` board-height lift), **squash & stretch scaling** (`scale 1∓0.14·sin(πt)`), the arrival **settle bounce**, the idle **breathing bob** during step pauses, the token-level hop squash (`y/scaleY/scaleX` keyframes on every position change), the ladder-climb **per-rung vertical hop** and the snake-tail **settle squash**.
- **`playMoveHops` rewritten as a glide** (`src/lib/animation/board-fx.ts`): the pawn slides across the board surface square by square — symmetric ease between square centers, constant scale 1, rotation 0, constant soft grounded shadow, still (not bobbing) pause between squares, still settle on arrival. Each reached square still illuminates and the "Step k of N" counter still announces every step (countability preserved; nothing moves vertically).
- **Ladder climb** now rides the ladder line exactly (no hop, no sway; rung sounds kept) and **snake swallow** keeps the mouth/bulge/emerge choreography with a still settle (no landing squash).
- **`token.tsx`**: removed the squash/hop keyframe effect and the celebrate bounce; the non-override path only glides `left/top`; overshoot shake is rotation-only. The pawn is visually attached to the board at all times — it never falls, flies, teleports or changes size while moving.

### Changed — fully responsive board on every device and orientation
- **`.board-fit` sizing** (`src/app/globals.css`): the board always fits **both** the available width and the viewport height — portrait phones (390×844 → 366px board), small phones (360×640 → 300px, fully visible without scrolling), tablets (768×1024 → 714px), desktop (560px cap) and **landscape phones (844×390 → 200px board with controls moved beside it)**. A landscape media query flips the game layout to `board | controls` side-by-side (`.game-landscape-grid`, dice bar hidden beside the board). No horizontal overflow at any size; controls never cover the board.
- **Container-query number sizing**: square numbers scale with the board (`clamp(8px, 2cqw, 12px)`) and stay readable from 200px to 714px boards; number text color now derives from each square's luminance (correct contrast on every theme).
- **Board frame**: theme-colored border/backdrop/vignette render identically at every size; snakes, ladders, tokens, dice and markers scale proportionally (all percentage-based).

### Verified (browser, this revision)
- **Dice ⇄ movement exactness re-verified live for every face**: 1: 5→6; 2: 25→27 + snake 27→5; 3: 1→4 + ladder 4→25; 4: 1→5; 5: 12→17; 6: 6→12 + extra turn. AI turn: 6 (1→7, extra turn) then 4 (7→11). Move log matches every entry.
- **Ground-level glide proven mid-frame** (`__sapluduDev.fx()` sampled during a real move): `rotation: 0, scale: 1, shadowStrength: 0.26` constant, y locked to the row center on horizontal glides — no arc, no squash, no bounce; token visibly slides square-by-square ("Step 2 of 6 · dice 6" chip).
- Snake swallow (mouth → bulge → tail) and ladder climb still work drop-free; reduced-motion mode places the token instantly.
- **All 10 boards verified**: gallery previews + in-game checks on classic, jungle, neon, royal, space, minimal and fantasy (frame, squares, snakes, ladders, goal/start badges all themed and aligned); selection persists across reloads; Bangla gallery fully translated.
- **Online multiplayer via gateway (two browser sessions)**: room create/join/ready/start; host roll 6 → 7 synced to both clients; extra-turn + ladder 13→46 handled server-authoritatively; 40s turn-timeout auto-roll observed; both clients converge on identical positions.
- **Responsive sweep**: 360×640, 390×844, 768×1024, 844×390 (landscape, side-by-side layout), 1280×800 — board fully visible, `scrollWidth <= innerWidth` everywhere, controls reachable.
- `bun run lint` clean; no console or page errors; no runtime errors in `dev.log`.

## [0.5.0] — 2026-01-14

### Fixed — dice display now provably equals the engine dice value (root cause of "shows N, moves M")
- **Dice cube face mapping** (`src/components/game/dice-3d.tsx`): the `FACE_ROTATIONS` entries for faces **3 and 4** were the same sign as their mount transforms instead of the geometric inverse, so the cube **physically displayed 4 pips when the engine rolled 3, and 3 pips when it rolled 4** (faces 1, 2, 5, 6 were correct). This was the remaining root cause of the user-reported "dice shows X but the token moves Y" bug — the movement was always correct; the number players saw was wrong. The cube is now built from a **single source of truth**: each face's mount transform is derived as the exact inverse of its show-rotation (`mountTransform()`), making a display/engine disagreement impossible by construction. Verified with a 3D rotation-matrix script (all six faces bring their own number to the front).
- **Idle face race** (`dice-3d.tsx`): the tumble effect and the idle face-sync effect both wrote the same refs, so an idle dice-value change (remote dice results, dev tools, fresh games) could leave the cube resting on a stale face. All orientation transitions are now owned by one ordering-safe effect (tumble on / land / idle change).
- **Engine re-verified exhaustively** (`scripts/verify-engine.ts`, runnable with `bun run scripts/verify-engine.ts`): every square 1–99 × every dice 1–6 (594 combinations) — plain moves walk **exactly `dice` squares** with contiguous paths, all snake/ladder jumps land on their configured destinations, overshoots stay put, win only on exactly 100, extra turn only on 6; zigzag 1–100 numbering roundtrip + grid adjacency proven; full random match move logs consistent.

### Changed — slow, countable, professional movement
- **Slower step cadence** (`src/lib/animation/timings.ts`): `HOP_MS` 330→400, `STEP_PAUSE_MS` 120→170 — every square is comfortably countable; new `LANDING_PAUSE_MS` (240) gives the final square a distinct arrival beat before banners/jumps. All durations remain centralized and apply to local, AI and online modes at once.
- **"Step k of N" counter chip** (`src/components/board/board.tsx` + `fx-store.ts` `moveProgress`): a floating chip on the board top announces every step of a move — e.g. "Step 1 of 6 · dice 6" → "Step 3 of 6" → "Arrived · moved 6" — with the moving player's color dot and `aria-live=polite` for screen readers. New i18n keys (`game.stepOf`, `game.stepDice`, `game.arrivedMoved`) in EN + BN. Visual-only; never feeds back into game state.
- **Grounded drop shadow** (`token.tsx` + `board-fx.ts`): while the pawn arcs between squares, a soft shadow stays on the ground below (strength follows the arc height), selling depth; also applied during ladder climbs. Reduced-motion mode unaffected (skips choreography entirely).

### Changed — homepage identity
- **Unmistakable Snakes & Ladders hero** (`src/components/views/landing.tsx`): new bold "SNAKES & LADDERS" wordmark badge (amber gradient, snake + ladder marks) directly under the badge row, plus decorative winding snake curves and a ladder motif drawn across the hero background. Play Now / Play with Friends / Play vs Computer actions unchanged.

### Verified (browser, this revision)
- Forced dice 1–6 from controlled squares: displayed pips == rolled value for **every** face; moves exact — 5+1→6, 5+2→7, 6+3→9, 7+4→11, 9+5→14, 11+6→17; move log entries all match (`🎲1 5→6` … `🎲6 11→17`).
- Snake 24+3=27 → swallowed → final square 5 with open-jaw capture screenshot; ladder 3+1=4 → climbed → final square 25; overshoot 98+3 stays 98; exact win 97+3=100 with victory dialog + confetti; dice 6 grants a visible extra turn.
- Real (non-forced) roll flow: tumble lands on the true face, chip counts "Step 1 of 5 (dice 5)" → "Step 3 of 5" → final position 1+5=6, step-by-step and countable.
- AI mode: human 6 → extra turn honored; AI roll 3 → 1+3=4 → ladder 4→25 with choreography; turn handback correct.
- Online multiplayer (two browser sessions through the gateway): room create/join/ready/start synced; host roll 6 → 1→7 shown identically on both clients (dice, positions, current turn); extra-turn roll 3 → 7→10 synced; P2 roll 2 → 1→3 synced — identical state on both clients at every step.
- Mobile 390px: board full-width, dice bar, panels, bottom nav all correct; homepage shows wordmark + Play Now immediately above the fold.
- `bun run lint` clean; no console errors; no runtime errors in `dev.log`.

## [0.4.0] — 2026-01-14

### Fixed — dice-to-board movement accuracy (root cause)
- **Engine path duplication** (`src/lib/game-engine/engine.ts`): `applyRoll()` pushed the destination square **twice** for plain moves (`path=[4,5,6,7,7]` for dice=4), so every walk performed dice+1 hop iterations (phantom final hop with a duplicate sound + delay) and any path-derived bookkeeping (online move log `fromPos` read `path[0]` = from+1) was wrong. The jump destination is now appended **only** for real snake/ladder transitions: plain moves carry exactly `dice` squares, jumps carry dice walks + the jump destination. Exhaustive verification: every dice 1–6 from every position 1–99 (walk length == dice, contiguity, no duplicates, correct jump direction, overshoot, exact finish on 100).

### Changed — movement & animation architecture
- **Square-by-square hop sequencer** (`src/lib/animation/board-fx.ts` `playMoveHops`): stores no longer `setPos` per hop (full-board re-render per square); the moving pawn is driven per-frame through the fx tokenOverride channel — ease-out-back per hop (acceleration out, soft overshoot landing), parabolic arc lift, take-off/landing squash, direction tilt, per-square hop sound, settle bounce. On success the override stays at the final square until the authoritative state applies **in the same tick** (zero flicker frames); on abort it cleans up.
- **Dice/movement sync**: `waitForDiceLanding` (shared `DICE_TUMBLE_MS`) makes online movement start only after the dice tumble visibly lands (`dice:result` → `player:moved` arrive back-to-back); local roll delay uses the same constant. Dice tumbles with a toss arc (lift, multi-axis spin incl. Z wobble, bounce keyframes) + impact shadow; faces get ivory gradient + rounded pips; the shown face always equals the engine value (`controls.set` on roll end).
- **Online robustness** (`src/stores/online-store.ts`): stale/duplicate `player:moved` dropped via `version` monotonic guard (reset on `game:start`/`game:state_sync`/`game:completed`); `turn:changed` received while animating now defers **both** the current-player highlight and the phase transition until the choreography finishes (`pendingTurnPlayer`/`pendingTurnReason`); move log `fromPos` uses the server `from` field.
- **Shared timing constants** (`src/lib/animation/timings.ts`): `DICE_TUMBLE_MS`, `HOP_MS`, `MOVE_SETTLE_MS`, `FAST_SPEED` used by Dice3D, both stores and the sequencer.

### Changed — visual quality
- **Snakes** (`src/components/board/snake.tsx`): 3D tube shading from stacked width-scaled outlines (outline → base → mid → dorsal light → spine highlight), dorsal pattern + scale texture **clipped** to the exact body outline, fierce head (angry brow ridges, slightly parted idle jaws with visible fangs, throat + tongue hint inside gaping jaws during swallowing, jaw lines, crown light), gentle idle life on every snake (staggered body sway `sapludu-snake-idle`, slow head bob `sapludu-head-idle`, existing tongue flick) — all disabled under reduced motion.
- **Ladders** (`src/components/board/ladder.tsx`): wood-grain linear gradients on rails/rungs, dark edge + pale top highlight per rail, deeper ground shadows.
- **Board** (`src/components/board/board.tsx`): per-square inset lighting (top highlight / bottom shade), goal trophy marker pinned to **square 100's true center** (traditional zigzag puts 100 top-left; the old corner trophy sat in the wrong corner), START marker on square 1, ambient depth vignette, richer frame shadow.

### Verified (browser + scripts, this revision)
- Browser E2E: dice 1–6 from position 6 → exactly 6+dice each (`[7..12]`); ladder 4→25, snake 27→5, overshoot 98+5 stays, 6 grants extra turn (same player, pos 12), exact win 95+5 → finished.
- Swallow choreography sampled live: mouth peaks 0.94, bulge glides 0.05→0.95 monotonically, token hidden 10 frames during travel, final square 5; screenshots confirm open jaws + token capture at square 27 and token-vanish during travel.
- Ladder climb sampled live: ladderFx active, token rotates to the ladder's 26.6° tilt, y 53.5→35 (upward), settles on 63.
- Roll lock: mid-animation `forceRoll` is a no-op (phase stays `moving`); mobile 390px renders board + dice bar + markers; reduced-motion setting completes moves instantly.
- Online (scripted 2-client match vs authoritative server): 117 moves, all dice values and kinds exercised, **every** path validated (walk length == dice, jump direction), match completed; engine change hot-reloaded by the game server (`bun --hot`).
- `bun run lint` clean; no runtime errors in `dev.log`; no browser console errors.

## [0.3.0] — 2026-01-14

### Added — realistic snakes & professional movement choreography (browser-verified)
- **Deterministic board overlay geometry** (`src/lib/game-engine/board-geometry.ts`): Catmull-Rom snake spines with natural S-bends and tapering width profile, plus ladder geometry (rails, rung count, climb tilt). Pure and seeded (mulberry32) so web/Android and every online client render identical overlays. Presentation-only; the engine never imports it.
- **Realistic procedural snake renderer** (`src/components/board/snake.tsx`): tapered body outline with dorsal gradients, scale-texture pattern, diamond blotches or full bands per palette (9 realistic color themes), articulated head aligned exactly to the head square (brow, golden slit-pupil eyes that focus while capturing, nostrils, forked tongue flick, open-mouth interior with rounded family-friendly teeth), and a travelling swallow bulge. Static geometry memoized; only mouth/bulge/excite re-render per frame.
- **Board FX store** (`src/components/board/fx-store.ts`): isolated visual-only animation state (per-frame token override, snake mouth/bulge progress, ladder highlight, token pulse). Tiny selectors ensure only the animated snake/token re-renders; authoritative GameState is never derived from it.
- **Animation sequencer** (`src/lib/animation/board-fx.ts`): rAF timelines for `playLadderClimb` (align → per-rung bounce following the ladder's actual angle → settle squash) and `playSnakeSwallow` (excite/head sway → mouth opens → token slips into the jaws → bulge glides down the body → token emerges from the tail tip → settle). Honors the `fast` speed (×0.55) and skips entirely under reduced motion (user setting or OS `prefers-reduced-motion`); aborts cleanly on resync/new game via abort checks and `finally` cleanup.
- **Upgraded tokens** (`src/components/board/token.tsx`): per-square hop with arc lift + squash & stretch synced to the store's step timing, ladder tilt alignment, comic head-shake on overshoot, pulsing halo + rotating ring for the active player, glossy pawn shading.
- **Enhanced ladders** (`src/components/board/ladder.tsx`): wooden rails with shading and end caps, per-rung highlights, ground shadows, golden glow while climbed.
- **New SFX**: wooden rung tick, comic gulp, cheerful emerge pop (Web Audio synthesized, same volume envelope system).

### Changed
- Movement sequencing in `game-store.ts` / `online-store.ts` now animates **every hop including the first** (the old code skipped path[0], so a roll of 1 showed no movement), stops plain hops at the snake head / ladder foot, and hands over to the dedicated choreography for the jump. Authoritative engine state is still applied after the visuals; positions are never computed from animation progress.
- Online `player:moved` handler gained an `animating` gate (rolling blocked while choreography plays) and defers `turn:changed` phase transitions until the sequence finishes; `game:start` / `game:completed` / `game:state_sync` force-clear FX so reconnects and rematches always render from authoritative state.
- Board overlays rebuilt as composed `Snake`/`Ladder` components (layer order preserved: squares → ladders → snakes → goal → tokens); `TOKEN_COLORS` re-exported from the same module so all existing imports keep working.

### Verified (Agent Browser E2E, this revision)
- Snake 27→5 swallow full sequence: head excite → open mouth → token capture → bulge traversal → tail emergence at square 5 → settle + banner; head sample verified in DOM at exactly `squareCenter(27)` (65, 75).
- Ladder 4→25 climb: override coordinates sampled on the exact ladder line (35,95)→(45,75) with 26.57° tilt, rung ticks, glow, settle at square 25.
- Step-by-step hops observed via intermediate squares (10→11→12→13) and ladder 13→46 chain-in same session; overshoot shake + banner at 98+4; win at 100 with confetti/result dialog; Play Again restart.
- Multi-token overlap: second token stays rendered at the shared square while the mover is swallowed (snake 40→19 with both tokens at 40).
- Reduced-motion setting: snake move completes instantly with zero FX override (verified after fix).
- Online (two tabs via gateway): deterministic identical snakes, dice/turn/position sync across clients, roll blocked during animation, reload mid-game → session rejoin + `game:state_sync` restored exact positions.
- Mobile 375px: board, overlays and animations scale correctly; desktop idle + active halo render verified.
- `bun run lint` clean; no runtime errors in `dev.log`.

## [0.2.0] — 2026-01-14

### Added — full platform implementation (browser-verified)
- **Database**: complete Prisma schema (User, Game, GamePlayer, GameMove, RatingHistory, UserAchievement, Friendship, Notification, AdminAuditLog); admin seed (`prisma/seed.ts`, `admin@sapludu.game` / `SapluduAdmin#2024`).
- **Shared game engine** (`src/lib/game-engine/`): pure deterministic transitions (`createGame`, `applyRoll`, `validateTurn`, `serializeGameState`, `restoreGameState`, `simulateMatch`), separated RNG, validated board, AI module with fair-dice contract.
- **REST API v1** (`/api/v1/`): auth (register/login/logout/me/socket-token), users/me PATCH, matches/report (local+AI), leaderboard (period × scope), achievements, friends CRUD, games history, admin (stats/users/games with append-only audit), internal/game-result (secret-protected ingestion with transactional Elo + achievements + notifications).
- **Socket.IO authoritative game server** (`mini-services/game-server/`, port 3003 via gateway): JWT/guest sessions, rooms with codes, ready-up, color picking, matchmaking queue, crypto.randomInt dice, turn timeout 40 s auto-roll, 90 s reconnect grace with full state resync, forfeit completion, transactional result reporting to the Next.js API.
- **Web application** (single-route SPA, 14 views): landing, auth, dashboard, mode selection, local setup, AI setup, online lobby, game, profile (edit/stats/achievements/history), leaderboard, friends, settings, rules, admin.
- **Game presentation**: 10×10 zigzag board with traditional palette, SVG snakes with heads/eyes/tongue, wooden ladders, animated pawns with stacking, 3D CSS dice with tumble animation, hop/climb/slide animation sequences, turn banners, victory confetti, synthesized Web Audio SFX, vibration support.
- **Bilingual EN/বাংলা**: ~230-key dictionary, one-click switch, persisted; Bengali font stack.
- **Mobile**: fully responsive layouts + fixed bottom navigation with safe-area support.
- **Accessibility**: reduced-motion mode, aria-live turn labels, semantic landmarks, keyboard-reachable controls.

### Fixed (found during Agent Browser E2E verification)
- Engine `PlayerState.kind` vs `isAI` contract mismatch that prevented AI turns (unified to `isAI`).
- `fetchMe` response-envelope mismatch (`body.user` vs `body.data.user`) that lost sessions on reload.
- Prisma `skipDuplicates` unsupported on SQLite (replaced with pre-filter + DB uniqueness).
- Online mirror-state phase stomp that froze matches after `turn:changed`.
- Missing mobile navigation (added bottom nav).
- React 19 hooks-lint violations (setState-in-effect / ref-during-render) across data views and dice.

### Verified
- 15-scenario Agent Browser E2E pass recorded in `PROGRESS.md` §3 (local, AI, two-client online sync, Bangla, leaderboard, admin, mobile, timeout auto-roll, persistence).
- Socket-server scripted E2E: 14-roll match, ladder event, reconnect+state_sync, forfeit completion with DB rows, matchmaking auto-start.

## [0.1.0] — 2026-01-14

### Added
- Project kickoff for SAPLUDU (সাপলুডু), a traditional Bangladeshi Snakes and Ladders platform. Tagline: "Play. Climb. Win."
- Documentation baseline (9 root documents):
  - `MASTER_SPECIFICATION.md` — full requirements spec with constraint adaptations, board config, game modes, protocol contract, data model, REST surface, Definition of Done.
  - `ARCHITECTURE.md` — system architecture with context, state-flow and sequence diagrams (dice roll + reconnect), module descriptions, socket contract tables, ER diagram, security architecture, PostgreSQL/Redis scaling path.
  - `IMPLEMENTATION_PLAN.md` — 15-stage plan; stages 01–03 planned-complete, 04–15 pending.
  - `GAME_RULES.md` — bilingual rules reference with board tables and edge cases.
  - `DEPLOYMENT.md` — sandbox-reality vs production VPS guide (Docker Compose, PostgreSQL, Caddy/Nginx TLS, backups, Android/PWA appendix outline).
  - `AGENTS.md` — operating rules for AI coding agents continuing the project.
  - `README.md` — professional project overview and quickstart.
  - `PROGRESS.md` — live tracker initialized (architecture + docs done, implementation pending).
- Adopted board configuration finalized: 10x10, 100 squares, zigzag numbering, 7 ladders (4→25, 13→46, 33→49, 42→63, 50→69, 62→81, 74→92), 9 snakes (27→5, 40→19, 54→31, 60→38, 70→48, 87→24, 93→68, 96→45, 99→72), exact-roll finish on 100, overshoot stays, rolling a 6 grants one extra turn.
- Architecture decisions recorded:
  - Single-route SPA (`/` as view router, Zustand-driven views) on Next.js 16 App Router + TypeScript.
  - Shared pure TypeScript game engine (`src/lib/game-engine/`) consumed by both the web app and the Socket.IO server.
  - Socket.IO mini-service (`mini-services/game-server/`) on port 3003 behind the Caddy gateway, reached client-side as `io('/?XTransformPort=3003')`.
  - Server-authoritative online play: `crypto.randomInt(1,7)` dice, turn-scoped roll idempotency, monotonically increasing state version, 40 s turn timeout auto-roll, 90 s reconnect grace with full state resync.
  - Result ingestion via secret-protected `POST /api/v1/internal/game-result` with transactional writes (stats, Elo, achievements, notifications).
  - Auth model: email + password (bcryptjs) + JWT (jose) in httpOnly cookie; guest play without stored accounts.
  - Elo K=32, start 1000, online human-vs-human only.

### Changed (constraint adaptations — decisions, not defects)
- Database: SQLite via Prisma in the sandbox instead of PostgreSQL; production upgrade path documented.
- i18n: custom lightweight EN/BN dictionary via Zustand (i18next-equivalent) instead of an external i18n service.
- Sound: Web Audio API synthesized SFX with no binary audio assets; confetti via framer-motion particles; Vibration API on mobile.
- Mobile reach: responsive web + PWA readiness instead of a native Android app (future work documented).
- Testing: automated test suites intentionally not written per sandbox policy; verification via Agent Browser manual end-to-end runs recorded in PROGRESS.md.

### Security
- Defined security posture: bcryptjs password hashing, jose JWT in httpOnly cookies, Zod validation on all REST and socket inputs, in-memory rate limiting on auth routes, server-side dice authority, admin role checks server-side, `INTERNAL_SECRET`-protected ingestion endpoint.

### Deferred (honestly planned, not implemented)
- Google OAuth sign-in (requires external credentials; never to be fabricated).
- Android native application (build outline documented in DEPLOYMENT.md appendix).
- Docker/Nginx/VPS deployment execution (guide provided; not executed in sandbox).
- Redis-backed scaling (rate limiting, matchmaking durability, Socket.IO adapter).
- Automated test suites (post-sandbox).
