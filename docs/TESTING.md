# Testing — what was verified, and what is on you

## Automated (run from the repository root)

| Command | What it covers | Result when this release was assembled |
|---|---|---|
| `npm run test:engine` | Every square × every dice value (594 combinations): exact movement, zig-zag numbering, jumps, overshoot, win only on 100, extra turn only on 6 | pass |
| `npm run test:apps-script` | **43 tests** running the real `.gs` files on in-memory fakes of Sheets, LockService, CacheService, UrlFetchApp: first/returning login, no duplicates, token audience/issuer/expiry/unverified e-mail/Google outage, session expiry/sliding/logout/suspension, profile validation & injection, admin authorisation, server-secret protection, Elo/streaks/achievements, replay validation (forged winner/dice/positions rejected), idempotency, friends/invitations, reports, maintenance, lock contention, rate limits | 43 / 43 pass |
| `npm run test:server` | **15 end-to-end tests**: a real Socket.IO server + real clients + the real Apps Script code behind an HTTP shim: auth required, rooms/colours/ready/host rules, server-authoritative dice (client-supplied values ignored), identical results for all players, full 2- and 4-player games persisted with Elo, reconnect/take-over, forfeit on timeout, turn timeout, **Apps Script outage with retry**, queue surviving a restart, invitations, quick match, lobby grace, flood/garbage resistance | 15 / 15 pass (4 consecutive runs) |
| `npm run typecheck`, `npm run lint` | TypeScript strict (no `ignoreBuildErrors`), ESLint | clean |
| `npm run build` | Static export of the web app + bundled game server | succeeds |

### Browser end-to-end (manual tooling in `scripts/e2e/`)
`npm run mock:stack` starts the real Apps Script code (in-memory), the real game server and a static server for `web/out`
(build the web app with `NEXT_PUBLIC_*` pointing at `127.0.0.1:8787/3003`). `scripts/e2e/browser_multiplayer.py` and
`browser_pwa.py` (Python Playwright; `pip install playwright && playwright install chromium`, run e.g. `python3 scripts/e2e/browser_multiplayer.py`) then drive the **production bundle** in headless Chromium with a fake Google button:

* sign-in → account created → dashboard; two browsers (desktop + Pixel 7 viewport) create/join a room by code, ready, start,
  play a full game through the UI, and the result, ratings and 37 move rows land in the "Sheets" store;
* PWA: manifest valid, **Chromium reports no installability errors**, service worker controls the page, caches populated,
  page loads **offline** from cache, install bar hides in standalone mode, install-help dialog shows platform instructions.

## What automated tests could NOT cover (verify after deploying)
These need real accounts/infrastructure — follow README §6:

1. **Real Google sign-in** with a real OAuth client ID (the tests use a fake token issuer; the audience/issuer/expiry logic is tested, the Google endpoint itself is not).
2. **Real Google Sheets / Apps Script behaviour** (quotas, latency, lock timeouts, cell-format conversions). The fakes follow documented semantics but are fakes.
3. **Two physical devices on different networks**, Android browsers and the native install prompt (`beforeinstallprompt`), iOS Safari "Add to Home Screen".
4. **Hosting-specific** behaviour (Render cold starts, TLS, WebSocket proxies).
5. Visual quality on your actual devices — screenshots were reviewed in Chromium only.
