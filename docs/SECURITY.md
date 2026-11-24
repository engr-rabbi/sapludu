# Security notes

## What is enforced where

| Concern | Control |
|---|---|
| Who is this user? | Apps Script verifies the Google ID token with `oauth2.googleapis.com/tokeninfo`: audience ∈ `GOOGLE_CLIENT_ID`, issuer, expiry, `email_verified`, `sub`. The browser never supplies an e-mail or user id that is trusted. |
| Sessions | 244-bit random token; only its SHA-256 is stored; 7-day sliding expiry; ≤ 8 live sessions per user; logout / logout-everywhere / suspension revoke immediately; the user row is re-read on every call. |
| Admin | `role` is read from the `Users` sheet (or `ADMIN_EMAILS`) **on the server for each `admin.*` call**. Admins can't suspend or demote themselves or an `ADMIN_EMAILS` admin; every action is audited. |
| Game authority | Dice (`crypto.randomInt`), turn order, movement and win detection exist only on the game server. No socket event accepts a result. Turns are validated, duplicate rolls are impossible (synchronous handler) and flood-limited. |
| Result integrity | `server.recordGame` requires `SERVER_SECRET` (constant-time compare), then **replays every move** against the rules; wrong turn order, start squares, jumps, winners or final positions are rejected. Recording is idempotent per `gameId`. |
| Practice results | Browser-reported, replay-validated, rate-limited, and *only* affect separate practice counters — never rating/rank/leaderboard. |
| Input | Types, ranges, lengths and enums validated on the backend and the game server; display names restricted to letters/digits/space/`_.-'`; HTML characters rejected; payload size capped (600 KB). |
| Spreadsheet injection | Text columns are plain-text formatted; free text starting with `= + - @` is prefixed with `'`; names can't start with those characters. |
| Rate limits | Login (global + per Google account), API per user, profile, friend requests, invites, reports, practice reports, failed server-secret attempts; socket token bucket and minimum roll interval. |
| Transport | HTTPS everywhere; game-server CORS allow-list; WebSocket payload cap 16 KB. |
| Secrets | Only `NEXT_PUBLIC_*` public values are built into the web bundle. `SERVER_SECRET` lives in Script properties and the game-server environment. `.gitignore` excludes `.env*`. |

## Known trade-offs (please read)

1. **Session token in `localStorage`.** A static site on another origin cannot use httpOnly cookies with Apps Script. The token is
   opaque, revocable and short-lived, but any XSS on the site could read it. Mitigations: no `dangerouslySetInnerHTML`, React escaping, no third-party
   scripts other than Google Identity Services. A strict Content-Security-Policy cannot be set on GitHub Pages (no custom headers); if you host the
   static files elsewhere (Cloudflare Pages, Netlify, nginx) add one.
2. **No ID-token nonce.** A Google ID token stolen within its ~1 h lifetime could be replayed to `auth.login`. Obtaining it already requires
   compromising the user's browser; adding a server-issued nonce is a possible hardening.
3. **Apps Script cannot see IPs or headers**, so rate limits are per account/Google identity, not per IP. A flood of *anonymous* requests is
   bounded only by Google's own quotas.
4. **`ANYONE_ANONYMOUS` web app.** Required for browsers; all non-login routes demand a valid session or the server secret.
5. **Display-name moderation** is manual (admin suspend); there is no profanity filter.
6. **One game-server instance** holds rooms in memory. If it restarts, active games end; saved results are unaffected.
7. **Practice (offline) stats can be inflated by a determined user** — by design they are separate and non-competitive.

## Reporting vulnerabilities
Add your contact in `SECURITY.md` of your repository fork before going public.
