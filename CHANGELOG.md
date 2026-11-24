# Changelog

## 1.0.1 — Token drop fix
- **Fixed the "pawn falls from above" effect.** When a move finished (and when the board first rendered), the pawn was re-created as a new
  element with no starting position, so Framer Motion animated it in from the board's top-left corner down to its square. The re-created pawn now
  starts exactly on the square where the glide ended (`web/src/components/board/token.tsx`, `initial` prop). Movement speed, step-by-step glide,
  square counting, snake/ladder choreography, dice and all rules are untouched.

## 1.0.0 — Google-powered online platform
- Replaced e-mail/password + SQLite/Prisma with **Sign in with Google** + **Google Apps Script** + **Google Sheets**.
- New monorepo: `web` (static export), `server` (Socket.IO), `apps-script`, shared `packages/engine`.
- Game server rewritten around verified identities, async persistence with retry queue, friend invitations, lobby grace period, rate limits.
- Backend replays every game before recording; Elo, achievements, leaderboards, friends, reports and admin tooling in Apps Script.
- PWA: manifest, service worker, icons, offline fallback, "Download for Your Mobile" bar, update banner.
- Phones (<640px): the install shortcut is now a large button inside the landing hero, directly above the headline; the board moves up (≈110–210 px) because the CTAs are compacted and links/chips sit below it. Tablet/desktop layout and the slim top install bar are unchanged.
- `setup()` now creates (and remembers) the spreadsheet when the Apps Script project is standalone instead of failing.
- Board: numbers drawn above snakes/ladders with a halo, 30 % larger snake heads.
- TypeScript errors are no longer ignored at build time; ESLint clean.
- Removed: Prisma, next-auth, bcrypt, SQLite, API routes, Caddy/sandbox scripts, 50 MB of screenshots, unused UI components and dependencies.
