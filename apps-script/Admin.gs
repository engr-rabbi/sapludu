/**
 * Sapludu backend — administration. Every handler here is registered with auth:'admin' in Api.gs, which
 * re-checks the role on the SERVER for every call. A hidden button in the browser grants nothing.
 */

function writeAudit_(adminId, action, targetId, detail) {
  tbl_('AdminAudit').append({
    auditId: newId_('A'), adminId: adminId, action: action, targetId: targetId || '',
    detail: safeText_(detail || '', 300), createdAt: nowIso_()
  });
}

function adminUserView_(u) {
  var v = publicUser_(u, true);
  v.statusReason = u.statusReason;
  return v;
}

function admin_stats_() {
  var users = tbl_('Users').readAll();
  var games = tbl_('Games').readAll();
  var sessions = tbl_('Sessions').readAll();
  var weekAgo = nowMs_() - 7 * 86400000;
  var staleMs = APP.STALE_ACTIVE_SESSION_HOURS * 3600000;
  return {
    totalUsers: users.length,
    activeUsers: users.filter(function (u) { return u.status === 'active'; }).length,
    suspendedUsers: users.filter(function (u) { return u.status === 'suspended'; }).length,
    newUsers7d: users.filter(function (u) { return isoToMs_(u.createdAt) >= weekAgo; }).length,
    inactiveUsers90d: users.filter(function (u) { return isoToMs_(u.lastLogin) < nowMs_() - 90 * 86400000; }).length,
    totalGames: games.length,
    onlineGames: games.filter(function (g) { return g.mode === 'online'; }).length,
    games7d: games.filter(function (g) { return isoToMs_(g.endedAt) >= weekAgo; }).length,
    activeGames: sessions.filter(function (s) { return s.status === 'active' && nowMs_() - isoToMs_(s.startedAt) < staleMs; }).length,
    openReports: tbl_('Reports').readAll().filter(function (r) { return r.status === 'open'; }).length
  };
}

function admin_users_(payload) {
  var p = payload || {};
  var q = String(p.q || '').toLowerCase().slice(0, 60);
  var filter = p.filter || 'all';
  var users = tbl_('Users').readAll();
  if (q) users = users.filter(function (u) { return u.displayName.toLowerCase().indexOf(q) >= 0 || u.email.toLowerCase().indexOf(q) >= 0 || u.playerId.toLowerCase() === q; });
  if (filter === 'suspended') users = users.filter(function (u) { return u.status === 'suspended'; });
  if (filter === 'inactive') users = users.filter(function (u) { return isoToMs_(u.lastLogin) < nowMs_() - 90 * 86400000; });
  users.sort(function (a, b) { return isoToMs_(b.createdAt) - isoToMs_(a.createdAt); });
  var pg = paginate_(users, optInt_(p.page, 'page', 1, 100000, 1), 25);
  return { users: pg.items.map(adminUserView_), page: pg.page, pageSize: pg.pageSize, total: pg.total };
}

function admin_setUserStatus_(payload, ctx) {
  var id = reqString_(payload && payload.playerId, 'playerId', 3, 40);
  var status = reqOneOf_(payload && payload.status, 'status', ['active', 'suspended']);
  var reason = safeText_((payload && payload.reason) || '', 200);
  if (id === ctx.user.playerId) throw new ApiError('FORBIDDEN', 'You cannot change your own status', 403);
  var result = withLock_(function () {
    var users = tbl_('Users');
    var row = users.findRow('playerId', id);
    if (!row) throw new ApiError('NOT_FOUND', 'User not found', 404);
    var target = users.getRow(row);
    if (effectiveRole_(target) === 'admin') throw new ApiError('FORBIDDEN', 'Administrators cannot be suspended here', 403);
    users.update(row, { status: status, statusReason: status === 'suspended' ? reason : '' });
    writeAudit_(ctx.user.playerId, 'setUserStatus:' + status, id, reason);
    recomputeLeaderboard_();
    return users.getRow(row);
  });
  if (status === 'suspended') revokeAllSessions_(id);
  return { user: adminUserView_(result) };
}

function admin_setRole_(payload, ctx) {
  var id = reqString_(payload && payload.playerId, 'playerId', 3, 40);
  var role = reqOneOf_(payload && payload.role, 'role', ['player', 'admin']);
  if (id === ctx.user.playerId) throw new ApiError('FORBIDDEN', 'You cannot change your own role', 403);
  return withLock_(function () {
    var users = tbl_('Users');
    var row = users.findRow('playerId', id);
    if (!row) throw new ApiError('NOT_FOUND', 'User not found', 404);
    var target = users.getRow(row);
    if (role === 'player' && config_().adminEmails.indexOf(target.email) >= 0) {
      throw new ApiError('FORBIDDEN', 'This administrator is defined in the ADMIN_EMAILS script property', 403);
    }
    users.update(row, { role: role });
    writeAudit_(ctx.user.playerId, 'setRole:' + role, id, '');
    recomputeLeaderboard_();
    return { user: adminUserView_(users.getRow(row)) };
  });
}

function admin_games_(payload) {
  var p = payload || {};
  var mode = p.mode || 'all';
  var status = p.status || 'all';
  var rows = tbl_('Games').readAll();
  if (mode !== 'all') rows = rows.filter(function (g) { return g.mode === mode; });
  if (status !== 'all' && status !== 'active') rows = rows.filter(function (g) { return g.status === status; });
  rows.sort(function (a, b) { return isoToMs_(b.endedAt || b.createdAt) - isoToMs_(a.endedAt || a.createdAt); });
  var pg = paginate_(rows, optInt_(p.page, 'page', 1, 100000, 1), 25);
  var wanted = {};
  pg.items.forEach(function (g) { wanted[g.gameId] = []; });
  tbl_('GamePlayers').readAll().forEach(function (r) { if (wanted[r.gameId]) wanted[r.gameId].push(r); });
  var staleMs = APP.STALE_ACTIVE_SESSION_HOURS * 3600000;
  var active = tbl_('Sessions').readAll().filter(function (s) { return s.status === 'active' && nowMs_() - isoToMs_(s.startedAt) < staleMs; })
    .map(function (s) {
      var pls = [];
      try { pls = JSON.parse(s.players); } catch (e) {}
      return { gameId: s.gameId, roomCode: s.roomCode, startedAt: s.startedAt, players: pls };
    });
  return {
    games: pg.items.map(function (g) { return gameView_(g, wanted[g.gameId] || []); }),
    activeSessions: active, page: pg.page, pageSize: pg.pageSize, total: pg.total
  };
}

function admin_reports_(payload) {
  var status = (payload && payload.status) || 'open';
  var users = {};
  tbl_('Users').readAll().forEach(function (u) { users[u.playerId] = u; });
  var rows = tbl_('Reports').readAll().filter(function (r) { return status === 'all' || r.status === status; });
  rows.sort(function (a, b) { return isoToMs_(b.createdAt) - isoToMs_(a.createdAt); });
  return {
    reports: rows.slice(0, 100).map(function (r) {
      var u = users[r.playerId];
      return { id: r.reportId, kind: r.kind, message: r.message, context: r.context, status: r.status, createdAt: r.createdAt,
               reporter: u ? { id: u.playerId, displayName: u.displayName } : null, resolution: r.resolution, resolvedAt: r.resolvedAt };
    })
  };
}

function admin_resolveReport_(payload, ctx) {
  var id = reqString_(payload && payload.reportId, 'reportId', 3, 40);
  var note = safeText_((payload && payload.resolution) || '', 300);
  return withLock_(function () {
    var t = tbl_('Reports');
    var row = t.findRow('reportId', id);
    if (!row) throw new ApiError('NOT_FOUND', 'Report not found', 404);
    t.update(row, { status: 'resolved', resolvedBy: ctx.user.playerId, resolvedAt: nowIso_(), resolution: note });
    writeAudit_(ctx.user.playerId, 'resolveReport', id, note);
    return { resolved: true };
  });
}

function admin_audit_() {
  var rows = tbl_('AdminAudit').readAll();
  rows.sort(function (a, b) { return isoToMs_(b.createdAt) - isoToMs_(a.createdAt); });
  return { audit: rows.slice(0, 100) };
}

// ───────────── user-submitted technical reports ─────────────

function reports_submit_(payload, ctx) {
  var p = payload || {};
  var kind = reqOneOf_(p.kind || 'bug', 'kind', ['bug', 'cheating', 'abuse', 'other']);
  var message = safeText_(reqString_(p.message, 'message', 5, 1000), 1000);
  var context = safeText_(typeof p.context === 'string' ? p.context : '', 500);
  rateLimit_('report:' + ctx.user.playerId, 5, 600);
  return withLock_(function () {
    var rec = { reportId: newId_('R'), playerId: ctx.user.playerId, kind: kind, message: message, context: context, status: 'open', createdAt: nowIso_(), resolvedBy: '', resolvedAt: '', resolution: '' };
    tbl_('Reports').append(rec);
    return { reportId: rec.reportId };
  });
}
