/**
 * Sapludu backend — configuration, constants and the database schema.
 *
 * Secrets live ONLY in Script Properties (Project Settings → Script properties)
 * and are never returned to a client:
 *
 *   GOOGLE_CLIENT_ID       OAuth 2.0 Web client ID(s), comma separated (required)
 *   SERVER_SECRET          shared secret used by the realtime game server (required, 32+ chars)
 *   ADMIN_EMAILS           comma separated Google e-mails that are always administrators
 *   SESSION_TTL_HOURS      session lifetime, default 168 (7 days)
 *   ALLOWED_EMAIL_DOMAINS  optional comma separated domain allow-list (empty = any Google account)
 *   SPREADSHEET_ID         optional; needed only for a standalone (non container-bound) script
 */

var APP = {
  NAME: 'sapludu-backend',
  VERSION: '1.0.0',
  MAX_BODY_BYTES: 600000,
  MAX_MOVES_PER_GAME: 4000,
  MAX_SESSIONS_PER_USER: 8,
  INVITE_TTL_MIN: 10,
  STALE_ACTIVE_SESSION_HOURS: 6,
  LOG_RETENTION_DAYS: 30,
  START_RATING: 1000,
  ELO_K: 32,
  LEADERBOARD_LIMIT: 100,
  PAGE_SIZE: 20,
  LANGS: ['en', 'bn'],
  AVATARS: ['google', 'snake', 'ladder', 'dice', 'crown', 'rocket', 'fire', 'star', 'tiger', 'frog'],
  COLORS: ['red', 'green', 'yellow', 'purple'],
  MOVE_KINDS: ['normal', 'ladder', 'snake', 'overshoot']
};

/** The one and only board (must match packages/engine/src/board.ts DEFAULT_BOARD). */
var BOARD = {
  ladders: [[4, 25], [13, 46], [33, 49], [42, 63], [50, 69], [62, 81], [74, 92]],
  snakes: [[27, 5], [40, 19], [54, 31], [60, 38], [70, 48], [87, 24], [93, 68], [96, 45], [99, 72]]
};

/** Sheet name → ordered column headers. Anything not listed in NUMERIC_COLS is stored as text. */
var SCHEMA = {
  Users: ['playerId', 'email', 'googleSub', 'displayName', 'picture', 'avatar', 'language', 'role', 'status',
          'createdAt', 'lastLogin', 'totalGamesPlayed', 'totalGamesWon', 'totalGamesLost', 'rating', 'rank',
          'currentStreak', 'bestStreak', 'practiceGames', 'practiceWins', 'statusReason'],
  AuthSessions: ['sessionHash', 'playerId', 'createdAt', 'expiresAt', 'lastSeen', 'revoked', 'userAgent'],
  Games: ['gameId', 'roomCode', 'mode', 'status', 'createdAt', 'endedAt', 'winnerPlayerId', 'winnerName',
          'turnCount', 'forfeited', 'playerCount'],
  GamePlayers: ['gameId', 'seat', 'playerId', 'name', 'color', 'finalPosition', 'placement', 'ratingBefore', 'ratingAfter'],
  GameMoves: ['gameId', 'moveNo', 'seat', 'dice', 'fromPos', 'toPos', 'kind'],
  Leaderboard: ['rank', 'playerId', 'displayName', 'picture', 'rating', 'gamesPlayed', 'wins', 'losses', 'winRate', 'updatedAt'],
  Invitations: ['inviteId', 'fromPlayerId', 'toPlayerId', 'roomCode', 'status', 'createdAt', 'expiresAt', 'respondedAt'],
  Sessions: ['gameId', 'roomCode', 'status', 'players', 'startedAt', 'endedAt', 'serverId'],
  Friends: ['friendshipId', 'requesterId', 'addresseeId', 'status', 'createdAt', 'updatedAt'],
  Achievements: ['playerId', 'achievementId', 'unlockedAt'],
  Reports: ['reportId', 'playerId', 'kind', 'message', 'context', 'status', 'createdAt', 'resolvedBy', 'resolvedAt', 'resolution'],
  AdminAudit: ['auditId', 'adminId', 'action', 'targetId', 'detail', 'createdAt'],
  Logs: ['ts', 'level', 'action', 'message', 'playerId']
};

var NUMERIC_COLS = {
  totalGamesPlayed: 1, totalGamesWon: 1, totalGamesLost: 1, rating: 1, rank: 1, currentStreak: 1, bestStreak: 1,
  practiceGames: 1, practiceWins: 1, seat: 1, finalPosition: 1, placement: 1, ratingBefore: 1, ratingAfter: 1,
  turnCount: 1, playerCount: 1, moveNo: 1, dice: 1, fromPos: 1, toPos: 1, gamesPlayed: 1, wins: 1, losses: 1, winRate: 1
};

var ACHIEVEMENTS = [
  { id: 'first_victory', check: function (c) { return c.wins >= 1; } },
  { id: 'first_online', check: function (c) { return c.hasOnlineGame; } },
  { id: 'games_10', check: function (c) { return c.gamesPlayed >= 10; } },
  { id: 'wins_10', check: function (c) { return c.wins >= 10; } },
  { id: 'streak_5', check: function (c) { return c.bestStreak >= 5; } },
  { id: 'games_100', check: function (c) { return c.gamesPlayed >= 100; } },
  { id: 'multiplayer_champion', check: function (c) { return c.hasOnlineWin; } }
];

function prop_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? fallback : v;
}

function csvProp_(key) {
  var v = prop_(key, '');
  return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function config_() {
  return {
    clientIds: csvProp_('GOOGLE_CLIENT_ID'),
    serverSecret: prop_('SERVER_SECRET', ''),
    adminEmails: csvProp_('ADMIN_EMAILS').map(function (e) { return e.toLowerCase(); }),
    allowedDomains: csvProp_('ALLOWED_EMAIL_DOMAINS').map(function (e) { return e.toLowerCase(); }),
    sessionTtlHours: Math.max(1, Math.min(24 * 30, parseInt(prop_('SESSION_TTL_HOURS', '168'), 10) || 168))
  };
}
