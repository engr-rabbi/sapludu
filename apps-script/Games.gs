/**
 * Sapludu backend — game records, ratings and achievements.
 *
 * Online games are reported by the realtime game server (authenticated with SERVER_SECRET), which is the
 * only authority for dice, turns and positions. Every report is replayed here against the board rules
 * as defense in depth, and recording is idempotent per gameId.
 *
 * Practice (local / AI) games are reported by the browser and are therefore treated as UNVERIFIED:
 * they are replay-validated, but only feed the separate practice counters and non-competitive
 * achievements — never rating, rank or the leaderboard.
 */

var MAX_STORED_MOVES = 1000;

function jumpMap_() {
  var m = {};
  BOARD.ladders.forEach(function (l) { m[l[0]] = l[1]; });
  BOARD.snakes.forEach(function (s) { m[s[0]] = s[1]; });
  return m;
}

/**
 * Replays a move list against the Sapludu rules (mirrors packages/engine/src/engine.ts):
 * exact roll to finish on 100, overshoot stays, snakes/ladders resolve once, a six keeps the turn.
 * Throws ApiError if any move is inconsistent. Returns { positions, winnerSeat, turnSeat }.
 */
function replayMoves_(moves, playerCount) {
  var jumps = jumpMap_();
  var pos = [];
  for (var i = 0; i < playerCount; i++) pos.push(1);
  var current = 0;
  var winner = -1;
  for (var n = 0; n < moves.length; n++) {
    var m = moves[n];
    if (winner >= 0) throw new ApiError('REPLAY_INVALID', 'Move ' + (n + 1) + ' occurs after the game was won', 422);
    if (m.seat !== current) throw new ApiError('REPLAY_INVALID', 'Move ' + (n + 1) + ': wrong player turn', 422);
    if (m.fromPos !== pos[m.seat]) throw new ApiError('REPLAY_INVALID', 'Move ' + (n + 1) + ': wrong start square', 422);
    var raw = m.fromPos + m.dice;
    var to, kind;
    if (raw > 100) { to = m.fromPos; kind = 'overshoot'; }
    else if (jumps[raw] !== undefined) { to = jumps[raw]; kind = jumps[raw] > raw ? 'ladder' : 'snake'; }
    else { to = raw; kind = 'normal'; }
    if (m.toPos !== to || m.kind !== kind) throw new ApiError('REPLAY_INVALID', 'Move ' + (n + 1) + ': result does not match the rules', 422);
    pos[m.seat] = to;
    if (to === 100) winner = m.seat;
    else if (m.dice !== 6) current = (current + 1) % playerCount;
  }
  return { positions: pos, winnerSeat: winner, turnSeat: current };
}

function validateMoves_(raw, playerCount) {
  if (!Array.isArray(raw) || raw.length > APP.MAX_MOVES_PER_GAME) throw new ApiError('VALIDATION', 'moves must be an array (max ' + APP.MAX_MOVES_PER_GAME + ')', 400);
  return raw.map(function (m, i) {
    if (!m || typeof m !== 'object') throw new ApiError('VALIDATION', 'moves[' + i + '] invalid', 400);
    return {
      seat: reqInt_(m.seat, 'moves[' + i + '].seat', 0, playerCount - 1),
      dice: reqInt_(m.dice, 'moves[' + i + '].dice', 1, 6),
      fromPos: reqInt_(m.fromPos, 'moves[' + i + '].fromPos', 1, 100),
      toPos: reqInt_(m.toPos, 'moves[' + i + '].toPos', 1, 100),
      kind: reqOneOf_(m.kind, 'moves[' + i + '].kind', APP.MOVE_KINDS)
    };
  });
}

// ───────────── Elo ─────────────

function eloNew_(rating, opponent, score) {
  var expected = 1 / (1 + Math.pow(10, (opponent - rating) / 400));
  return Math.round(rating + APP.ELO_K * (score - expected));
}

function achievementCtx_(u, won, online) {
  return {
    gamesPlayed: u.totalGamesPlayed + u.practiceGames,
    wins: u.totalGamesWon + u.practiceWins,
    bestStreak: u.bestStreak,
    hasOnlineGame: online || u.totalGamesPlayed > 0,
    hasOnlineWin: (online && won) || u.totalGamesWon > 0
  };
}

function awardAchievements_(playerId, ctx) {
  var table = tbl_('Achievements');
  var have = {};
  table.where('playerId', playerId).forEach(function (a) { have[a.achievementId] = true; });
  var fresh = ACHIEVEMENTS.filter(function (a) { return !have[a.id] && a.check(ctx); }).map(function (a) { return a.id; });
  var now = nowIso_();
  table.appendMany(fresh.map(function (id) { return { playerId: playerId, achievementId: id, unlockedAt: now }; }));
  return fresh;
}

// ───────────── online games (server → backend) ─────────────

function server_gameStarted_(payload) {
  var p = payload || {};
  var gameId = reqString_(p.gameId, 'gameId', 6, 64);
  var roomCode = reqString_(p.roomCode, 'roomCode', 4, 12);
  var players = Array.isArray(p.players) ? p.players.slice(0, 4).map(function (x) {
    return { playerId: String(x.playerId || '').slice(0, 40), name: safeText_(x.name, 40) };
  }) : [];
  return withLock_(function () {
    var sessions = tbl_('Sessions');
    if (sessions.findRow('gameId', gameId)) return { duplicate: true };
    sessions.append({
      gameId: gameId, roomCode: roomCode, status: 'active', players: JSON.stringify(players),
      startedAt: nowIso_(), endedAt: '', serverId: safeText_(p.serverId || '', 40)
    });
    return { recorded: true };
  });
}

function server_gameAborted_(payload) {
  var gameId = reqString_(payload && payload.gameId, 'gameId', 6, 64);
  return withLock_(function () {
    var sessions = tbl_('Sessions');
    var row = sessions.findRow('gameId', gameId);
    if (row && sessions.getRow(row).status === 'active') sessions.update(row, { status: 'aborted', endedAt: nowIso_() });
    return { ok: true };
  });
}

function server_recordGame_(payload) {
  var p = payload || {};
  var gameId = reqString_(p.gameId, 'gameId', 6, 64);
  var roomCode = reqString_(p.roomCode, 'roomCode', 4, 12);
  if (!Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4) throw new ApiError('VALIDATION', 'players must have 2-4 entries', 400);
  var n = p.players.length;
  var forfeited = p.forfeited === true;
  var winnerSeat = reqInt_(p.winnerSeat, 'winnerSeat', 0, n - 1);

  var seatsSeen = {};
  var colorsSeen = {};
  var players = p.players.map(function (x, i) {
    var seat = reqInt_(x.seat, 'players[' + i + '].seat', 0, n - 1);
    if (seatsSeen[seat]) throw new ApiError('VALIDATION', 'duplicate seat ' + seat, 400);
    seatsSeen[seat] = true;
    var color = reqOneOf_(x.color, 'players[' + i + '].color', APP.COLORS);
    if (colorsSeen[color]) throw new ApiError('VALIDATION', 'duplicate color ' + color, 400);
    colorsSeen[color] = true;
    return {
      seat: seat,
      playerId: x.playerId ? reqString_(x.playerId, 'players[' + i + '].playerId', 3, 40) : '',
      name: safeText_(reqString_(x.name, 'players[' + i + '].name', 1, 60), 60),
      color: color,
      finalPosition: reqInt_(x.finalPosition, 'players[' + i + '].finalPosition', 1, 100),
      placement: reqInt_(x.placement, 'players[' + i + '].placement', 1, 4)
    };
  }).sort(function (a, b) { return a.seat - b.seat; });

  var moves = validateMoves_(p.moves, n);
  var replay = replayMoves_(moves, n);
  players.forEach(function (pl) {
    if (replay.positions[pl.seat] !== pl.finalPosition) throw new ApiError('REPLAY_INVALID', 'final position of seat ' + pl.seat + ' does not match the move history', 422);
  });
  if (!forfeited) {
    if (replay.winnerSeat !== winnerSeat) throw new ApiError('REPLAY_INVALID', 'winner does not match the move history', 422);
  } else if (replay.winnerSeat >= 0 && replay.winnerSeat !== winnerSeat) {
    throw new ApiError('REPLAY_INVALID', 'winner does not match the move history', 422);
  }
  var winners = players.filter(function (pl) { return pl.placement === 1; });
  if (winners.length !== 1 || winners[0].seat !== winnerSeat) throw new ApiError('VALIDATION', 'exactly the winner must have placement 1', 400);

  return withLock_(function () {
    var games = tbl_('Games');
    var existing = games.findRow('gameId', gameId);
    if (existing) return { duplicate: true, gameId: gameId };

    var users = tbl_('Users');
    var now = nowIso_();
    var registered = players.filter(function (pl) { return pl.playerId; });
    var userRows = {};
    registered.forEach(function (pl) {
      var row = users.findRow('playerId', pl.playerId);
      if (!row) throw new ApiError('UNKNOWN_PLAYER', 'Unknown playerId ' + pl.playerId, 422);
      userRows[pl.playerId] = users.getRow(row);
    });

    // Elo — only for completed (non-forfeited) games with 2+ registered humans, same convention as before
    var ratingAfter = {};
    registered.forEach(function (pl) { ratingAfter[pl.playerId] = userRows[pl.playerId].rating; });
    if (!forfeited && registered.length >= 2) {
      var win = registered.filter(function (pl) { return pl.placement === 1; })[0];
      var losers = registered.filter(function (pl) { return pl.placement !== 1; });
      if (win && losers.length >= 1) {
        var wBefore = userRows[win.playerId].rating;
        var avgLoser = losers.reduce(function (a, l) { return a + userRows[l.playerId].rating; }, 0) / losers.length;
        losers.forEach(function (l) { ratingAfter[l.playerId] = eloNew_(userRows[l.playerId].rating, wBefore, 0); });
        ratingAfter[win.playerId] = eloNew_(wBefore, avgLoser, 1);
      }
    }

    var achievementsOut = {};
    var playerRowsOut = [];
    players.forEach(function (pl) {
      var before = pl.playerId ? userRows[pl.playerId].rating : 0;
      var after = pl.playerId ? ratingAfter[pl.playerId] : 0;
      if (pl.playerId) {
        var u = userRows[pl.playerId];
        var won = pl.placement === 1;
        var streak = won ? u.currentStreak + 1 : 0;
        var patch = {
          totalGamesPlayed: u.totalGamesPlayed + 1,
          totalGamesWon: u.totalGamesWon + (won ? 1 : 0),
          totalGamesLost: u.totalGamesLost + (won ? 0 : 1),
          rating: after,
          currentStreak: streak,
          bestStreak: Math.max(u.bestStreak, streak)
        };
        users.update(u._row, patch);
        for (var k in patch) u[k] = patch[k];
        achievementsOut[pl.playerId] = awardAchievements_(pl.playerId, achievementCtx_(u, won, true));
      }
      playerRowsOut.push({
        gameId: gameId, seat: pl.seat, playerId: pl.playerId, name: pl.name, color: pl.color,
        finalPosition: pl.finalPosition, placement: pl.placement, ratingBefore: before, ratingAfter: after
      });
    });

    var winnerPl = players.filter(function (pl) { return pl.seat === winnerSeat; })[0];
    games.append({
      gameId: gameId, roomCode: roomCode, mode: 'online', status: 'completed',
      createdAt: safeIso_(p.startedAt, now), endedAt: safeIso_(p.endedAt, now),
      winnerPlayerId: winnerPl.playerId, winnerName: winnerPl.name,
      turnCount: moves.length, forfeited: forfeited ? '1' : '', playerCount: n
    });
    tbl_('GamePlayers').appendMany(playerRowsOut);
    tbl_('GameMoves').appendMany(moves.slice(0, MAX_STORED_MOVES).map(function (m, i) {
      return { gameId: gameId, moveNo: i + 1, seat: m.seat, dice: m.dice, fromPos: m.fromPos, toPos: m.toPos, kind: m.kind };
    }));

    var sessions = tbl_('Sessions');
    var srow = sessions.findRow('gameId', gameId);
    if (srow) sessions.update(srow, { status: 'completed', endedAt: now });
    else sessions.append({ gameId: gameId, roomCode: roomCode, status: 'completed', players: '[]', startedAt: safeIso_(p.startedAt, now), endedAt: now, serverId: '' });

    recomputeLeaderboard_();

    var ratings = {};
    registered.forEach(function (pl) { ratings[pl.playerId] = { before: userRows[pl.playerId].rating, after: ratingAfter[pl.playerId] }; });
    // after recompute the rating field of the cached rows is stale only for 'before'; fix it for the response
    registered.forEach(function (pl) { ratings[pl.playerId].before = playerRowsOut.filter(function (r) { return r.playerId === pl.playerId; })[0].ratingBefore; });
    return { gameId: gameId, ratings: ratings, achievements: achievementsOut };
  });
}

function safeIso_(v, fallback) {
  var t = Date.parse(String(v || ''));
  return isNaN(t) ? fallback : new Date(t).toISOString();
}

// ───────────── practice games (browser → backend, unverified) ─────────────

function games_reportPractice_(payload, ctx) {
  var p = payload || {};
  var mode = reqOneOf_(p.mode, 'mode', ['local', 'ai']);
  if (!Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4) throw new ApiError('VALIDATION', 'players must have 2-4 entries', 400);
  var n = p.players.length;
  var mySeat = optInt_(p.mySeat, 'mySeat', 0, n - 1, 0);
  if (p.players[mySeat] && p.players[mySeat].isAI) throw new ApiError('VALIDATION', 'mySeat must be a human player', 400);
  rateLimit_('practice:' + ctx.user.playerId, 12, 60);

  var moves = validateMoves_(p.moves, n);
  if (moves.length < 4) throw new ApiError('VALIDATION', 'Game is too short to record', 422);
  var replay = replayMoves_(moves, n);
  if (replay.winnerSeat < 0) throw new ApiError('REPLAY_INVALID', 'Practice game was not completed', 422);

  var won = replay.winnerSeat === mySeat;
  var gameId = newId_('G');
  var now = nowIso_();

  return withLock_(function () {
    var users = tbl_('Users');
    var row = users.findRow('playerId', ctx.user.playerId);
    var u = users.getRow(row);
    var patch = { practiceGames: u.practiceGames + 1, practiceWins: u.practiceWins + (won ? 1 : 0) };
    users.update(row, patch);
    u.practiceGames = patch.practiceGames;
    u.practiceWins = patch.practiceWins;
    var fresh = awardAchievements_(u.playerId, achievementCtx_(u, won, false));

    var order = replay.positions.map(function (pos, seat) { return { seat: seat, pos: pos }; })
      .sort(function (a, b) { return (b.seat === replay.winnerSeat ? 1000 : b.pos) - (a.seat === replay.winnerSeat ? 1000 : a.pos); });
    var placementOf = {};
    order.forEach(function (o, i) { placementOf[o.seat] = i + 1; });

    tbl_('Games').append({
      gameId: gameId, roomCode: '', mode: mode, status: 'completed', createdAt: now, endedAt: now,
      winnerPlayerId: won ? u.playerId : '', winnerName: safeText_(p.players[replay.winnerSeat].name, 60),
      turnCount: moves.length, forfeited: '', playerCount: n
    });
    tbl_('GamePlayers').appendMany(p.players.map(function (pl, seat) {
      return {
        gameId: gameId, seat: seat, playerId: seat === mySeat ? u.playerId : '', name: safeText_(pl.name || ('Player ' + (seat + 1)), 60),
        color: APP.COLORS.indexOf(pl.color) >= 0 ? pl.color : APP.COLORS[seat], finalPosition: replay.positions[seat],
        placement: placementOf[seat], ratingBefore: 0, ratingAfter: 0
      };
    }));
    return { gameId: gameId, achievements: fresh, user: publicUser_(u, true) };
  });
}

// ───────────── history & achievements (read) ─────────────

function gameView_(g, players) {
  return {
    id: g.gameId, roomCode: g.roomCode, mode: g.mode, status: g.status, endedAt: g.endedAt, turnCount: g.turnCount,
    winnerId: g.winnerPlayerId, forfeited: g.forfeited === '1',
    players: players.map(function (pl) {
      return {
        userId: pl.playerId || null, name: pl.name, color: pl.color, seat: pl.seat, finalPosition: pl.finalPosition,
        placement: pl.placement, ratingBefore: pl.ratingBefore || null, ratingAfter: pl.ratingAfter || null
      };
    }).sort(function (a, b) { return a.placement - b.placement; })
  };
}

function games_history_(payload, ctx) {
  var page = optInt_(payload && payload.page, 'page', 1, 10000, 1);
  var mine = tbl_('GamePlayers').where('playerId', ctx.user.playerId);
  var ids = {};
  mine.forEach(function (r) { ids[r.gameId] = true; });
  var games = tbl_('Games').readAll().filter(function (g) { return ids[g.gameId] && g.status === 'completed'; });
  games.sort(function (a, b) { return isoToMs_(b.endedAt) - isoToMs_(a.endedAt); });
  var pg = paginate_(games, page, 15);
  var allPlayers = tbl_('GamePlayers');
  var wanted = {};
  pg.items.forEach(function (g) { wanted[g.gameId] = [] ; });
  allPlayers.readAll().forEach(function (r) { if (wanted[r.gameId]) wanted[r.gameId].push(r); });
  return {
    games: pg.items.map(function (g) { return gameView_(g, wanted[g.gameId] || []); }),
    page: pg.page, pageSize: pg.pageSize, total: pg.total
  };
}

function achievements_list_(payload, ctx) {
  var have = {};
  tbl_('Achievements').where('playerId', ctx.user.playerId).forEach(function (a) { have[a.achievementId] = a.unlockedAt; });
  return {
    achievements: ACHIEVEMENTS.map(function (a) { return { id: a.id, unlockedAt: have[a.id] || null }; })
  };
}
