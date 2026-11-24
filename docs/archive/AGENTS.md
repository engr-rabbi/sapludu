# AGENTS.md — Operating Rules for AI Coding Agents

This document governs any AI agent (or human) continuing development of SAPLUDU (সাপলুডু). Read it fully before changing code. Violating these rules has caused churn in similar projects; treat them as hard constraints, not suggestions.

---

## 1. Project Identity

- Product: SAPLUDU (সাপলুডু) — Snakes and Ladders platform. Tagline: "Play. Climb. Win."
- Task numbering: the master work breakdown is IMPLEMENTATION_PLAN.md (15 stages). The live tracker is PROGRESS.md.
- Spec source of truth: MASTER_SPECIFICATION.md. If code and spec disagree, either fix the code or update the spec **and** PROGRESS.md with an explicit note. Never silently diverge.

## 2. Ground Truth Files

| File | Role |
| --- | --- |
| `prisma/schema.prisma` | Single source of truth for the data model |
| `src/lib/game-engine/` | Shared pure game engine (imported by web app AND game server) |
| `mini-services/game-server/index.ts` | Socket.IO authoritative server |
| `src/stores/*` | Zustand stores: `ui` (view switching), `auth`, `game`, `online`, `i18n` dictionary |
| `docs` root files | ARCHITECTURE.md, MASTER_SPECIFICATION.md, GAME_RULES.md, DEPLOYMENT.md, PROGRESS.md, CHANGELOG.md, IMPLEMENTATION_PLAN.md |

## 3. Environment and Commands

Package manager is **bun**. Do not introduce npm/yarn lockfiles.

```bash
# Web app (Next.js 16 App Router, port 3000)
bun install
bun run dev            # dev server, logs to dev.log
bun run lint           # eslint — must pass before you declare work done
bun run db:push        # push prisma/schema.prisma to SQLite (dev)
bun run db:generate    # regenerate Prisma client after schema edits

# Socket.IO game server (port 3003)
cd mini-services/game-server && bun install && bun run dev
```

- Database in the sandbox is SQLite (`db/custom.db`) via Prisma. Use `bun run db:push` for schema iteration. Do not hand-edit `db/custom.db`.
- Never commit or print secrets (`AUTH_SECRET`, `INTERNAL_SECRET`). Generate them locally when needed and keep them in `.env` only.

## 4. Stack Rules (do not substitute)

- Next.js 16 App Router + TypeScript (strict). React 19.
- Styling: Tailwind CSS 4 + shadcn/ui components already present in `src/components/ui`.
- State: Zustand for UI view switching, auth session mirror, game state, online state, i18n dictionary.
- Data access: Prisma only, via `src/lib/db.ts`. No raw SQL outside Prisma unless unavoidable (justify in PROGRESS.md).
- Validation: Zod on every API route body and every socket event payload.
- Auth: bcryptjs for password hashing, `jose` for JWT, delivered in an httpOnly cookie. Do not swap libraries.
- Real-time: Socket.IO. Do not replace with raw WebSocket, SSE, or polling for gameplay.
- Animation: framer-motion. Sound: Web Audio API synthesis (no binary audio files). Confetti: framer-motion particles. Vibration: Vibration API.

## 5. Single-Route SPA Rule

- The **only** user-visible route is `/` (`src/app/page.tsx`), which acts as the view router.
- All screens (Landing, Auth, Dashboard, PlaySetup, Online, Game, Profile, Leaderboard, Friends, Settings, Rules, Admin) are views switched via the Zustand `ui` store. Do NOT create new files under `src/app/` for pages.
- The only permitted route additions are API handlers under `src/app/api/v1/**` (and internal infrastructure routes such as health checks, if specified in DEPLOYMENT.md).
- Deep links are not required; if a future need arises, update this rule and ARCHITECTURE.md first.

## 6. Real-Time and Port Rules

- The Socket.IO mini-service runs on **port 3003** and lives in `mini-services/game-server/`. Never move game logic into Next.js API routes.
- The client must connect as `io('/?XTransformPort=3003')` — same-origin path with the transform query. Never hardcode `localhost:3003` or absolute socket URLs in client code.
- The game server is **authoritative** for online play: dice rolls, moves, turns, timeouts, completion. The client renders state; it never computes authoritative outcomes.
- Online dice must use Node `crypto.randomInt(1, 7)`. Never `Math.random()` on the server.
- Duplicate `dice:roll` within one turn must be rejected (idempotency). Game state carries a monotonically increasing `version`; include it in `game:start` and `game:state_sync`.
- Turn timeout: 40 s with auto-roll. Disconnect grace: 90 s, then forfeit handling; resync via `game:state_sync`.
- Result ingestion: the game server POSTs to `/api/v1/internal/game-result` with the shared `INTERNAL_SECRET`. That endpoint must reject requests without the secret. DB writes there must be transactional.

## 7. Honesty Rules (non-negotiable)

1. **PROGRESS.md must be truthful.** Update it with every task: what you actually verified, not what you intended. Use exactly `DONE`, `IN_PROGRESS`, `PENDING` statuses. A feature is `DONE` only after end-to-end verification described in the notes column.
2. **Never fabricate credentials or services.** Google OAuth is not implemented because external credentials are unavailable — document it as future work; do not stub fake providers or invent client IDs.
3. **Dice fairness.** AI difficulty affects only think delay and emotes. Never write code that biases dice for or against AI or local players. If you find such code, remove it and note the incident in PROGRESS.md.
4. **No fake test claims.** Automated tests are intentionally not written (sandbox policy). Never claim "tests pass"; instead record the manual Agent Browser verification steps you ran.
5. **Deployment honesty.** DEPLOYMENT.md documents a production guide that has not been executed in the sandbox. Do not mark deployment DONE until it has actually been run and verified.
6. **CHANGELOG.md** gets an entry for every user-visible change and every architecture decision; no silent edits.

## 8. Data and Elo Rules

- Guests are never stored as User rows; `GamePlayer.userId` is nullable for them.
- Elo (K=32, start 1000) applies **only** to online human-vs-human matches. Local/AI games update stats and achievements but must never write rating changes or leaderboard entries.
- Every rated game writes a `RatingHistory` row (delta, before, after) inside the ingestion transaction.
- Admin actions (suspend/restore/makeAdmin/removeAdmin) are server-checked against `role === 'admin'` — never gated in the UI alone.

## 9. i18n and Content Rules

- All user-facing strings come from the EN/BN dictionary in the Zustand i18n store. No hard-coded copy in components. Bengali copy is first-class, not a translation afterthought.
- No emojis in UI or docs except avatar emoji ids (which are data, not decoration).

## 10. Testing and Verification Policy

- Writing automated test code is forbidden in this sandbox. Do not add Vitest/Jest/Playwright files.
- Verification method: Agent Browser end-to-end manual runs. For each verified flow, record in PROGRESS.md: date, flow, steps, observed result.
- Minimum verification set before marking a stage DONE: the Definition of Done checklist in MASTER_SPECIFICATION.md §14.

## 11. Prohibited Actions

- Do not switch the database provider in the sandbox (SQLite is a constraint; PostgreSQL is documented for production in DEPLOYMENT.md).
- Do not add new page routes, new global CSS frameworks, or new state libraries.
- Do not add binary audio/image assets for core gameplay (synthesized SFX only; SVG/logo assets aside).
- Do not edit `docs` files to claim features that are PENDING.
- Do not run destructive DB commands (`db:reset`) against data you did not create.
- Do not expose internal endpoints publicly or weaken the secret check "temporarily".

## 12. Definition of a Completed Task

A task is complete when ALL of the following hold:

1. Code implements the spec section it maps to (see traceability table in MASTER_SPECIFICATION.md §16).
2. `bun run lint` passes and `bun run dev` (plus the game server when touched) boots without errors.
3. Agent Browser verification recorded in PROGRESS.md notes.
4. PROGRESS.md row(s) updated with honest status; CHANGELOG.md entry added for user-visible changes.
5. No violations of §4–§11 introduced.
