/** Sapludu backend — Elo ranking and leaderboards (online, server-verified games only). */

/**
 * Recomputes Users.rank and rewrites the Leaderboard sheet.
 * MUST be called inside withLock_(). Cost grows linearly with the number of users.
 */
function recomputeLeaderboard_() {
  var users = tbl_('Users');
  var all = users.readAll();
  var rated = all.filter(function (u) { return u.totalGamesPlayed > 0 && u.status === 'active' && u.role !== 'admin'; });
  rated.sort(function (a, b) {
    return b.rating - a.rating || b.totalGamesWon - a.totalGamesWon || isoToMs_(a.createdAt) - isoToMs_(b.createdAt);
  });
  var rankOf = {};
  rated.forEach(function (u, i) { rankOf[u.playerId] = i + 1; });
  users.setColumn('rank', all.map(function (u) { return rankOf[u.playerId] || 0; }));

  var now = nowIso_();
  tbl_('Leaderboard').replaceAll(rated.slice(0, APP.LEADERBOARD_LIMIT).map(function (u, i) {
    return {
      rank: i + 1, playerId: u.playerId, displayName: u.displayName, picture: avatarPicture_(u), rating: u.rating,
      gamesPlayed: u.totalGamesPlayed, wins: u.totalGamesWon, losses: u.totalGamesLost,
      winRate: u.totalGamesPlayed > 0 ? Math.round((u.totalGamesWon / u.totalGamesPlayed) * 1000) / 10 : 0,
      updatedAt: now
    };
  }));
}

function periodStartMs_(period) {
  var d = new Date();
  if (period === 'daily') { d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
  if (period === 'weekly') {
    var day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (period === 'monthly') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return 0;
}

function friendIdsOf_(playerId) {
  return tbl_('Friends').readAll().filter(function (f) {
    return f.status === 'accepted' && (f.requesterId === playerId || f.addresseeId === playerId);
  }).map(function (f) { return f.requesterId === playerId ? f.addresseeId : f.requesterId; });
}

function leaderboard_get_(payload, ctx) {
  var p = payload || {};
  var period = reqOneOf_(p.period || 'all', 'period', ['all', 'daily', 'weekly', 'monthly']);
  var scope = reqOneOf_(p.scope || 'global', 'scope', ['global', 'friends']);
  var page = optInt_(p.page, 'page', 1, 1000, 1);
  var pageSize = 25;

  var allowed = null;
  if (scope === 'friends') {
    if (!ctx) throw new ApiError('AUTH_REQUIRED', 'Sign in to see the friends leaderboard', 401);
    allowed = {};
    friendIdsOf_(ctx.user.playerId).forEach(function (id) { allowed[id] = true; });
    allowed[ctx.user.playerId] = true;
  }

  var users = tbl_('Users').readAll();
  var byId = {};
  users.forEach(function (u) { byId[u.playerId] = u; });

  var entries;
  var mode;
  if (period === 'all') {
    mode = 'rating';
    entries = users.filter(function (u) {
      return u.totalGamesPlayed > 0 && u.status === 'active' && u.role !== 'admin' && (!allowed || allowed[u.playerId]);
    }).sort(function (a, b) { return b.rating - a.rating || b.totalGamesWon - a.totalGamesWon; })
      .map(function (u) { return entryOf_(u, 0); });
  } else {
    mode = 'period-wins';
    var since = periodStartMs_(period);
    var games = {};
    tbl_('Games').readAll().forEach(function (g) {
      if (g.mode === 'online' && g.status === 'completed' && isoToMs_(g.endedAt) >= since) games[g.gameId] = true;
    });
    var wins = {};
    tbl_('GamePlayers').readAll().forEach(function (r) {
      if (r.placement === 1 && r.playerId && games[r.gameId]) wins[r.playerId] = (wins[r.playerId] || 0) + 1;
    });
    entries = Object.keys(wins).filter(function (id) {
      var u = byId[id];
      return u && u.status === 'active' && u.role !== 'admin' && (!allowed || allowed[id]);
    }).map(function (id) { return entryOf_(byId[id], wins[id]); })
      .sort(function (a, b) { return b.periodWins - a.periodWins || b.rating - a.rating; });
  }
  entries.forEach(function (e, i) { e.rank = i + 1; });
  var pg = paginate_(entries, page, pageSize);
  var me = ctx ? entries.filter(function (e) { return e.id === ctx.user.playerId; })[0] || null : null;
  return { entries: pg.items, page: pg.page, pageSize: pg.pageSize, total: pg.total, mode: mode, me: me };
}

function entryOf_(u, periodWins) {
  return {
    id: u.playerId, displayName: u.displayName, picture: avatarPicture_(u), avatar: u.avatar || 'google',
    rating: u.rating, wins: u.totalGamesWon, losses: u.totalGamesLost, gamesPlayed: u.totalGamesPlayed,
    periodWins: periodWins, rank: 0
  };
}
