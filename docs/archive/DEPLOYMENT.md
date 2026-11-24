# SAPLUDU Deployment Guide

| Field | Value |
| --- | --- |
| Version | 0.1.0 |
| Date | 2026-01-14 |
| Honesty status | The production guide below has **not been executed** in the development sandbox. It is a complete, actionable plan for a production VPS. |

---

## 1. What Actually Runs in the Development Sandbox

Be honest when describing this project's runtime: the following is what has been run and verified here, nothing more.

| Component | Reality in sandbox |
| --- | --- |
| Web app (Next.js 16 App Router) | Runs via `bun run dev` on port 3000 (plain HTTP, localhost) |
| Socket.IO game server | Planned to run via `cd mini-services/game-server && bun install && bun run dev` on port 3003; reached as `io('/?XTransformPort=3003')` |
| Database | SQLite file at `db/custom.db` via Prisma (`bun run db:push`) |
| Gateway | `Caddyfile` present for the `XTransformPort` WebSocket transform; full production TLS termination not exercised |
| Docker / Nginx / VPS | **Not executed** — this document describes the production path |
| PostgreSQL / Redis | **Not present** in sandbox |
| HTTPS / domains | **Not present** in sandbox |
| Android app | **Not built**; web is responsive and PWA-ready |

Consequences to remember:
- SQLite is single-writer; acceptable for development and small deployments, not for heavy production concurrency (see section 3 for the PostgreSQL path).
- The in-memory rate limiter and matchmaking queue are single-node scoped (see ARCHITECTURE.md §10 for the Redis path).

---

## 2. Production VPS Guide (Ubuntu + Docker Compose)

Target: a single Ubuntu 22.04+ VPS running the full stack under Docker Compose with HTTPS.

### 2.1 Topology

| Service | Image / build | Port (internal) | Notes |
| --- | --- | --- | --- |
| `web` | Built from repo (`next build` produces standalone output) | 3000 | Next.js app + REST `/api/v1` |
| `game-server` | Built from `mini-services/game-server/` | 3003 | Socket.IO authoritative server |
| `postgres` | `postgres:16-alpine` | 5432 | Production database |
| `redis` | `redis:7-alpine` | 6379 | Optional: rate limiting, matchmaking, Socket.IO adapter |
| `caddy` | `caddy:2` | 80, 443 | Reverse proxy, automatic TLS (or Nginx + Certbot, see 2.6) |

### 2.2 Environment variables

| Variable | Used by | Required | Example | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | web, game-server (via Prisma) | Yes | `postgresql://sapludu:CHANGE_ME@postgres:5432/sapludu` | In sandbox: `file:./db/custom.db` |
| `AUTH_SECRET` | web (jose JWT signing) | Yes | 32+ random bytes (`openssl rand -base64 32`) | Rotate carefully; invalidates sessions |
| `INTERNAL_SECRET` | web + game-server | Yes | `openssl rand -hex 32` | Protects `POST /api/v1/internal/game-result`; never expose to browsers |
| `GAME_SERVER_PORT` | game-server | No | `3003` | Default 3003 |
| `NODE_ENV` | web | No | `production` | Set by image build |
| `NEXT_PUBLIC_*` | — | None needed | — | The socket client uses same-origin `io('/?XTransformPort=3003')`; no public socket URL or public config is required |
| `REDIS_URL` | future scaling features | No | `redis://redis:6379` | Only once Redis-backed features land |

Secrets belong in `.env` on the VPS (chmod 600), never in the repository.

### 2.3 Caddy configuration (gateway + TLS)

```
sapludu.example.com {
    encode gzip

    handle /api/* {
        reverse_proxy web:3000
    }

    handle {
        reverse_proxy web:3000
    }

    # WebSocket transform: same-origin path with port hint -> game server
    handle_path /socket.io/* {
        reverse_proxy game-server:3003
    }
}
```

The client connection `io('/?XTransformPort=3003')` relies on the gateway routing `socket.io` traffic to port 3003; keep that mapping when swapping Caddy for Nginx.

### 2.4 Compose outline

```yaml
services:
  web:
    build: .
    env_file: .env
    expose: ["3000"]
    depends_on: [postgres]
    restart: unless-stopped
  game-server:
    build: ./mini-services/game-server
    env_file: .env
    expose: ["3003"]
    restart: unless-stopped
  postgres:
    image: postgres:16-alpine
    env_file: .env
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    restart: unless-stopped
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddydata:/data]
    depends_on: [web, game-server]
    restart: unless-stopped
volumes:
  pgdata:
  caddydata:
```

### 2.5 Database migration (SQLite to PostgreSQL)

1. Update `prisma/schema.prisma`: `provider = "postgresql"`.
2. Run `bun run db:push` (fresh install) or generate and apply a SQL migration against the Postgres instance.
3. Data backfill (if migrating real data): export SQLite tables to JSON, re-import through Prisma; JSON-string columns (`boardConfig`, `payloadJson`) carry over unchanged (optionally convert to `jsonb` later).
4. Verify `INTERNAL_SECRET` and `AUTH_SECRET` are set before first boot; the game server cannot ingest results without the secret.
5. Seed the admin account once (`db:seed`) and change its password immediately.

### 2.6 Nginx alternative (with Certbot)

- Install `nginx` and `certbot` (python3-certbot-nginx).
- Server block: proxy `/` and `/api/` to `web:3000`; proxy `/socket.io/` (with `Upgrade`/`Connection` headers for WebSocket) to `game-server:3003`.
- Obtain certificates: `certbot --nginx -d sapludu.example.com`; enable the renewal timer.

### 2.7 Health checks

| Endpoint | Component | Status |
| --- | --- | --- |
| `GET /api/health` (web) | web + DB reachability | Planned — implement and verify in Stage 14/15, tracked in PROGRESS.md |
| `GET /healthz` (game server) | socket service liveness | Planned — same |
| Compose-level | `depends_on` + restart policies | Documented above |

Do not wire monitoring against these endpoints until they exist and are verified.

### 2.8 Backup and restore (outline)

Backup (daily cron on the VPS):
```bash
#!/usr/bin/env bash
# scripts/backup.sh — outline, not yet provided in repo
set -euo pipefail
STAMP=$(date +%F-%H%M)
docker compose exec -T postgres pg_dump -U sapludu sapludu | gzip > "/backups/sapludu-${STAMP}.sql.gz"
# retain 14 days
find /backups -name 'sapludu-*.sql.gz' -mtime +14 -delete
```

Restore (drill before you need it):
```bash
gunzip -c sapludu-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T postgres psql -U sapludu -d sapludu
```

Also back up: `.env` (separately and securely), Caddy TLS data volume, and any uploaded assets. For the sandbox SQLite file, a plain file copy of `db/custom.db` while the server is stopped is sufficient.

### 2.9 Scaling reminders

Single-node first. Before adding a second game-server instance: Redis adapter for Socket.IO, sticky WebSocket sessions at the gateway, Redis-backed rate limiting and matchmaking (ARCHITECTURE.md §10).

---

## 3. Android / PWA Release Appendix (Outline — Not Executed)

The native Android app was not built in this sandbox. Two release paths are outlined; both are future work.

### 3.1 PWA route (recommended first)

1. Add `app/manifest` (via Next.js metadata) with name "Sapludu — সাপলুডু", icons (192/512), theme color, standalone display.
2. Add a service worker for the offline shell: cache app shell and game-engine assets so **local mode** works offline (online mode inherently requires connectivity).
3. Verify installability (Chrome DevTools > Application > Manifest), then record verification in PROGRESS.md.
4. Ship web updates continuously; store listing not required.

### 3.2 Native wrapper route (Capacitor or TWA)

1. Capacitor: wrap the deployed web app (`npx cap init`, android platform, `server.url` pointing to production domain) OR build a TWA with Bubblewrap using the PWA manifest + digital asset links.
2. Configure signing keys; enable `https` cleartext rules correctly; test deep state on device (pass-and-play rotation, vibration).
3. Play Store listing: bilingual store copy (EN/BN), screenshots from the responsive web app, privacy policy (data stored: account email, stats, ratings).
4. Release internally first (closed testing), then production track.

Honesty note: none of section 3 has been executed. Do not advertise store availability until it exists.

---

## 4. Post-Deployment Verification Checklist (for the operator)

- [ ] `https://sapludu.example.com` loads the landing view over TLS.
- [ ] Register/login works; session cookie is httpOnly.
- [ ] Two browsers can join one online room by 6-char code; a full game completes.
- [ ] Dice roll round trip works over the WebSocket transform (`/?XTransformPort=3003`).
- [ ] A completed online game writes stats, Elo, and achievements (check Postgres).
- [ ] `internal/game-result` rejects requests without the secret.
- [ ] Backup cron ran; restore drill succeeded on a scratch database.
- [ ] Health endpoints return 200 (once implemented).
