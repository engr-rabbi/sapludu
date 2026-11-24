/** Sapludu backend — user profiles. */

function effectiveRole_(u) {
  if (u.role === 'admin') return 'admin';
  return config_().adminEmails.indexOf(String(u.email).toLowerCase()) >= 0 ? 'admin' : 'player';
}

function avatarPicture_(u) {
  return u.avatar === 'google' || !u.avatar ? u.picture : '';
}

/** Full profile for the owner (includes e-mail) — or for admins. */
function publicUser_(u, includePrivate) {
  var played = u.totalGamesPlayed;
  var out = {
    id: u.playerId,
    displayName: u.displayName,
    picture: u.picture,
    avatar: u.avatar || 'google',
    language: u.language || 'en',
    role: effectiveRole_(u),
    status: u.status,
    rating: u.rating,
    rank: u.rank,
    gamesPlayed: played,
    wins: u.totalGamesWon,
    losses: u.totalGamesLost,
    winRate: played > 0 ? Math.round((u.totalGamesWon / played) * 1000) / 10 : 0,
    currentStreak: u.currentStreak,
    bestStreak: u.bestStreak,
    practiceGames: u.practiceGames,
    practiceWins: u.practiceWins,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin
  };
  if (includePrivate) out.email = u.email;
  return out;
}

/** What other players may see. */
function briefUser_(u) {
  return { id: u.playerId, displayName: u.displayName, picture: avatarPicture_(u), avatar: u.avatar || 'google', rating: u.rating };
}

function users_updateProfile_(payload, ctx) {
  var p = payload || {};
  var patch = {};

  if (p.displayName !== undefined) {
    var rawName = reqString_(p.displayName, 'displayName', 2, 40);
    if (/[<>]/.test(rawName)) throw new ApiError('VALIDATION', 'Display name contains invalid characters', 400);
    var name = cleanDisplayName_(rawName);
    if (!validDisplayName_(name)) {
      throw new ApiError('VALIDATION', 'Display name must be 2-24 characters: letters, numbers, spaces, . _ - \'', 400);
    }
    patch.displayName = name;
  }
  if (p.language !== undefined) patch.language = reqOneOf_(p.language, 'language', APP.LANGS);
  if (p.avatar !== undefined) patch.avatar = reqOneOf_(p.avatar, 'avatar', APP.AVATARS);
  if (Object.keys(patch).length === 0) throw new ApiError('VALIDATION', 'Nothing to update', 400);

  rateLimit_('profile:' + ctx.user.playerId, 20, 60);
  var updated = withLock_(function () {
    var users = tbl_('Users');
    var row = users.findRow('playerId', ctx.user.playerId);
    users.update(row, patch);
    return users.getRow(row);
  });
  return { user: publicUser_(updated, true) };
}

/** Permanently removes the caller's account data (GDPR-style self service). */
function users_deleteAccount_(payload, ctx) {
  if (!payload || payload.confirm !== 'DELETE') throw new ApiError('VALIDATION', 'Send confirm: "DELETE" to delete the account', 400);
  var pid = ctx.user.playerId;
  withLock_(function () {
    var users = tbl_('Users');
    var row = users.findRow('playerId', pid);
    if (row) users.deleteRows([row]);
    ['AuthSessions', 'Achievements'].forEach(function (name) {
      var t = tbl_(name);
      t.deleteRows(t.where('playerId', pid).map(function (r) { return r._row; }));
    });
    var fr = tbl_('Friends');
    fr.deleteRows(fr.readAll().filter(function (f) { return f.requesterId === pid || f.addresseeId === pid; }).map(function (f) { return f._row; }));
    // game history keeps anonymised rows (needed for other players' records)
    var gp = tbl_('GamePlayers');
    gp.where('playerId', pid).forEach(function (r) { gp.update(r._row, { playerId: '', name: 'Deleted player' }); });
    recomputeLeaderboard_();
  });
  return { deleted: true };
}
