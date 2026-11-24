/** Sapludu backend — friends and multiplayer invitations. Friend codes are Player IDs (no e-mail enumeration). */

function friendship_(a, b) {
  return tbl_('Friends').readAll().filter(function (f) {
    return (f.requesterId === a && f.addresseeId === b) || (f.requesterId === b && f.addresseeId === a);
  })[0] || null;
}

function friends_list_(payload, ctx) {
  var me = ctx.user.playerId;
  var users = {};
  tbl_('Users').readAll().forEach(function (u) { users[u.playerId] = u; });
  var friends = [], incoming = [], sent = [];
  tbl_('Friends').readAll().forEach(function (f) {
    if (f.requesterId !== me && f.addresseeId !== me) return;
    var otherId = f.requesterId === me ? f.addresseeId : f.requesterId;
    var o = users[otherId];
    if (!o || o.status !== 'active') return;
    var view = { friendshipId: f.friendshipId, id: o.playerId, displayName: o.displayName, picture: avatarPicture_(o), avatar: o.avatar || 'google', rating: o.rating, lastLogin: o.lastLogin };
    if (f.status === 'accepted') friends.push(view);
    else if (f.addresseeId === me) incoming.push(view);
    else sent.push(view);
  });
  return { friends: friends, incoming: incoming, sent: sent, myFriendCode: me };
}

function friends_request_(payload, ctx) {
  var target = reqString_(payload && payload.playerId, 'playerId', 3, 40);
  var me = ctx.user.playerId;
  if (target === me) throw new ApiError('VALIDATION', 'You cannot add yourself', 400);
  rateLimit_('friendreq:' + me, 20, 300);
  return withLock_(function () {
    var users = tbl_('Users');
    var trow = users.findRow('playerId', target);
    if (!trow || users.getRow(trow).status !== 'active') throw new ApiError('NOT_FOUND', 'No player with that friend code', 404);
    var existing = friendship_(me, target);
    var table = tbl_('Friends');
    if (existing) {
      if (existing.status === 'accepted') throw new ApiError('ALREADY_FRIENDS', 'You are already friends', 409);
      if (existing.requesterId === me) throw new ApiError('ALREADY_REQUESTED', 'Friend request already sent', 409);
      table.update(existing._row, { status: 'accepted', updatedAt: nowIso_() }); // they asked first → accept
      return { status: 'accepted' };
    }
    var now = nowIso_();
    table.append({ friendshipId: newId_('F'), requesterId: me, addresseeId: target, status: 'pending', createdAt: now, updatedAt: now });
    return { status: 'pending' };
  });
}

function friends_respond_(payload, ctx) {
  var id = reqString_(payload && payload.friendshipId, 'friendshipId', 3, 40);
  var accept = !!(payload && payload.accept);
  return withLock_(function () {
    var table = tbl_('Friends');
    var row = table.findRow('friendshipId', id);
    if (!row) throw new ApiError('NOT_FOUND', 'Request not found', 404);
    var f = table.getRow(row);
    if (f.addresseeId !== ctx.user.playerId || f.status !== 'pending') throw new ApiError('FORBIDDEN', 'Not your pending request', 403);
    if (accept) table.update(row, { status: 'accepted', updatedAt: nowIso_() });
    else table.deleteRows([row]);
    return { accepted: accept };
  });
}

function friends_remove_(payload, ctx) {
  var other = reqString_(payload && payload.playerId, 'playerId', 3, 40);
  return withLock_(function () {
    var f = friendship_(ctx.user.playerId, other);
    if (f) tbl_('Friends').deleteRows([f._row]);
    return { removed: !!f };
  });
}

// ───────────── invitations ─────────────

/** Called by the realtime server when a host invites a friend into a lobby. */
function server_createInvite_(payload) {
  var from = reqString_(payload && payload.fromPlayerId, 'fromPlayerId', 3, 40);
  var to = reqString_(payload && payload.toPlayerId, 'toPlayerId', 3, 40);
  var room = reqString_(payload && payload.roomCode, 'roomCode', 4, 12);
  rateLimit_('invite:' + from, 20, 60);
  return withLock_(function () {
    var f = friendship_(from, to);
    if (!f || f.status !== 'accepted') throw new ApiError('NOT_FRIENDS', 'You can only invite friends', 403);
    var users = tbl_('Users');
    var fromRow = users.findRow('playerId', from);
    var toRow = users.findRow('playerId', to);
    if (!fromRow || !toRow || users.getRow(toRow).status !== 'active') throw new ApiError('NOT_FOUND', 'Player not found', 404);
    var inv = tbl_('Invitations');
    var now = nowIso_();
    // one pending invite per (from,to,room)
    var dup = inv.readAll().filter(function (i) { return i.fromPlayerId === from && i.toPlayerId === to && i.roomCode === room && i.status === 'pending' && isoToMs_(i.expiresAt) > nowMs_(); })[0];
    if (dup) return { inviteId: dup.inviteId, duplicate: true, fromName: users.getRow(fromRow).displayName };
    var rec = { inviteId: newId_('I'), fromPlayerId: from, toPlayerId: to, roomCode: room, status: 'pending', createdAt: now, expiresAt: addMinutesIso_(APP.INVITE_TTL_MIN), respondedAt: '' };
    inv.append(rec);
    return { inviteId: rec.inviteId, expiresAt: rec.expiresAt, fromName: users.getRow(fromRow).displayName };
  });
}

function invites_list_(payload, ctx) {
  var users = {};
  tbl_('Users').readAll().forEach(function (u) { users[u.playerId] = u; });
  var items = tbl_('Invitations').readAll().filter(function (i) {
    return i.toPlayerId === ctx.user.playerId && i.status === 'pending' && isoToMs_(i.expiresAt) > nowMs_();
  }).map(function (i) {
    var f = users[i.fromPlayerId];
    return { inviteId: i.inviteId, roomCode: i.roomCode, from: f ? briefUser_(f) : null, expiresAt: i.expiresAt };
  });
  return { invites: items };
}

function invites_respond_(payload, ctx) {
  var id = reqString_(payload && payload.inviteId, 'inviteId', 3, 40);
  var accept = !!(payload && payload.accept);
  return withLock_(function () {
    var inv = tbl_('Invitations');
    var row = inv.findRow('inviteId', id);
    if (!row) throw new ApiError('NOT_FOUND', 'Invitation not found', 404);
    var i = inv.getRow(row);
    if (i.toPlayerId !== ctx.user.playerId) throw new ApiError('FORBIDDEN', 'Not your invitation', 403);
    if (i.status !== 'pending') throw new ApiError('INVITE_CLOSED', 'This invitation is no longer open', 409);
    if (isoToMs_(i.expiresAt) <= nowMs_()) {
      inv.update(row, { status: 'expired', respondedAt: nowIso_() });
      throw new ApiError('INVITE_EXPIRED', 'This invitation has expired', 410);
    }
    inv.update(row, { status: accept ? 'accepted' : 'declined', respondedAt: nowIso_() });
    return { accepted: accept, roomCode: accept ? i.roomCode : null };
  });
}
