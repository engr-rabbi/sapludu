/**
 * Sapludu backend — Google identity verification and application sessions.
 *
 * Flow
 *   1. The browser obtains a Google ID token with Google Identity Services ("Sign in with Google").
 *   2. The browser sends ONLY that token to  auth.login .
 *   3. This script verifies the token with Google (signature, expiry, audience, issuer,
 *      verified e-mail) — the e-mail / user id sent by a browser is never trusted.
 *   4. The user row is created (first login) or updated (returning user), and an opaque,
 *      random session token is issued. Only its SHA-256 hash is stored in the AuthSessions sheet.
 *   5. Every later call presents the session token; it is validated, expiry-checked and
 *      the account status is re-read from the database on every request.
 *
 * Google passwords are never seen, requested or stored.
 */

var GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

function verifyGoogleIdToken_(idToken) {
  var token = reqString_(idToken, 'idToken', 5, 4096);
  if (!/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*$/.test(token)) {
    throw new ApiError('AUTH_INVALID_TOKEN', 'Malformed Google token', 401);
  }
  var cfg = config_();
  if (cfg.clientIds.length === 0) {
    throw new ApiError('SERVER_NOT_CONFIGURED', 'GOOGLE_CLIENT_ID script property is not set', 500);
  }

  var res;
  try {
    res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
      muteHttpExceptions: true,
      followRedirects: false
    });
  } catch (e) {
    throw new ApiError('AUTH_UNAVAILABLE', 'Could not reach Google to verify the sign-in, please retry', 503);
  }
  var code = res.getResponseCode();
  if (code >= 500) throw new ApiError('AUTH_UNAVAILABLE', 'Google verification is temporarily unavailable', 503);
  if (code !== 200) throw new ApiError('AUTH_INVALID_TOKEN', 'Google rejected the sign-in token (expired or invalid)', 401);

  var info;
  try { info = JSON.parse(res.getContentText()); } catch (e) { throw new ApiError('AUTH_INVALID_TOKEN', 'Unreadable Google response', 401); }

  if (cfg.clientIds.indexOf(String(info.aud)) < 0) throw new ApiError('AUTH_WRONG_AUDIENCE', 'Token was not issued for this application', 401);
  if (GOOGLE_ISSUERS.indexOf(String(info.iss)) < 0) throw new ApiError('AUTH_INVALID_TOKEN', 'Token issuer mismatch', 401);
  if (Number(info.exp) * 1000 <= nowMs_()) throw new ApiError('AUTH_EXPIRED', 'Google sign-in expired, please sign in again', 401);
  if (!(info.email_verified === true || info.email_verified === 'true')) throw new ApiError('AUTH_EMAIL_UNVERIFIED', 'Your Google e-mail address is not verified', 403);
  if (!info.sub || !info.email) throw new ApiError('AUTH_INVALID_TOKEN', 'Token is missing identity claims', 401);

  var email = String(info.email).toLowerCase();
  if (cfg.allowedDomains.length > 0) {
    var domain = email.split('@')[1] || '';
    if (cfg.allowedDomains.indexOf(domain) < 0) throw new ApiError('AUTH_DOMAIN_NOT_ALLOWED', 'This e-mail domain is not allowed', 403);
  }
  return { sub: String(info.sub), email: email, name: String(info.name || ''), picture: String(info.picture || '') };
}

function safePictureUrl_(url) {
  var u = String(url || '');
  return /^https:\/\/[a-z0-9.\-]+\.(googleusercontent\.com|google\.com)\//i.test(u) ? u.slice(0, 500) : '';
}

function defaultDisplayName_(g) {
  var n = cleanDisplayName_(g.name || g.email.split('@')[0]).slice(0, 24).trim();
  if (!validDisplayName_(n)) n = 'Player ' + String(Math.floor(1000 + Math.random() * 9000));
  return n;
}

function auth_login_(payload) {
  rateLimit_('login:global', 240, 60);
  var g = verifyGoogleIdToken_(payload && payload.idToken);
  rateLimit_('login:' + g.sub, 12, 60);

  var result = withLock_(function () {
    var users = tbl_('Users');
    var cfg = config_();
    var row = users.findRow('googleSub', g.sub) || users.findRow('email', g.email);
    var isNew = !row;
    var user;
    var now = nowIso_();

    if (isNew) {
      user = {
        playerId: newId_('P'),
        email: g.email,
        googleSub: g.sub,
        displayName: defaultDisplayName_(g),
        picture: safePictureUrl_(g.picture),
        avatar: 'google',
        language: 'en',
        role: 'player',
        status: 'active',
        createdAt: now,
        lastLogin: now,
        totalGamesPlayed: 0, totalGamesWon: 0, totalGamesLost: 0,
        rating: APP.START_RATING, rank: 0, currentStreak: 0, bestStreak: 0,
        practiceGames: 0, practiceWins: 0, statusReason: ''
      };
      users.append(user);
    } else {
      user = users.getRow(row);
      if (user.status === 'suspended') {
        throw new ApiError('ACCOUNT_SUSPENDED', 'This account has been suspended' + (user.statusReason ? ': ' + user.statusReason : ''), 403);
      }
      var patch = { lastLogin: now };
      if (!user.googleSub) patch.googleSub = g.sub;
      var pic = safePictureUrl_(g.picture);
      if (pic) patch.picture = pic;
      if (cfg.adminEmails.indexOf(user.email) >= 0 && user.role !== 'admin') patch.role = 'admin';
      users.update(row, patch);
      for (var k in patch) user[k] = patch[k];
    }
    var session = createSession_(user.playerId, payload.__ua);
    return { user: user, isNew: isNew, session: session };
  });

  return {
    sessionToken: result.session.token,
    expiresAt: result.session.expiresAt,
    isNew: result.isNew,
    user: publicUser_(result.user, true)
  };
}

function createSession_(playerId, userAgent) {
  var cfg = config_();
  var sessions = tbl_('AuthSessions');
  var token = newToken_();
  var hash = sha256Hex_(token);
  var now = nowIso_();
  var expiresAt = addHoursIso_(cfg.sessionTtlHours);
  sessions.append({
    sessionHash: hash, playerId: playerId, createdAt: now, expiresAt: expiresAt, lastSeen: now, revoked: '',
    userAgent: safeText_(userAgent || '', 120)
  });

  // keep at most MAX_SESSIONS_PER_USER live sessions per player: revoke the oldest ones
  var mine = sessions.where('playerId', playerId).filter(function (s) { return !s.revoked && isoToMs_(s.expiresAt) > nowMs_(); });
  if (mine.length > APP.MAX_SESSIONS_PER_USER) {
    mine.sort(function (a, b) { return isoToMs_(a.createdAt) - isoToMs_(b.createdAt); });
    var excess = mine.slice(0, mine.length - APP.MAX_SESSIONS_PER_USER);
    excess.forEach(function (s) {
      sessions.update(s._row, { revoked: '1' });
    });
  }
  return { token: token, expiresAt: expiresAt };
}

/**
 * Validates a session token and returns { user, session } or throws.
 * The user row is re-read every time, so suspensions take effect immediately.
 */
function requireSession_(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 200) {
    throw new ApiError('AUTH_REQUIRED', 'Please sign in', 401);
  }
  var hash = sha256Hex_(token);
  var sessions = tbl_('AuthSessions');
  var srow = sessions.findRow('sessionHash', hash);
  if (!srow) throw new ApiError('AUTH_EXPIRED', 'Your session has expired, please sign in again', 401);
  var session = sessions.getRow(srow);
  if (session.revoked) throw new ApiError('AUTH_EXPIRED', 'Your session was ended, please sign in again', 401);
  var exp = isoToMs_(session.expiresAt);
  if (exp <= nowMs_()) throw new ApiError('AUTH_EXPIRED', 'Your session has expired, please sign in again', 401);

  var users = tbl_('Users');
  var urow = users.findRow('playerId', session.playerId);
  if (!urow) throw new ApiError('AUTH_EXPIRED', 'Account not found', 401);
  var user = users.getRow(urow);
  if (user.status === 'suspended') {
    throw new ApiError('ACCOUNT_SUSPENDED', 'This account has been suspended' + (user.statusReason ? ': ' + user.statusReason : ''), 403);
  }

  // sliding expiration: extend when less than half of the lifetime is left
  var ttlMs = config_().sessionTtlHours * 3600000;
  if (exp - nowMs_() < ttlMs / 2) {
    var newExp = addHoursIso_(config_().sessionTtlHours);
    withLock_(function () { sessions.update(srow, { expiresAt: newExp, lastSeen: nowIso_() }); });
    session.expiresAt = newExp;
  }
  return { user: user, session: session, hash: hash };
}

function auth_me_(payload, ctx) {
  return { user: publicUser_(ctx.user, true), expiresAt: ctx.session.expiresAt };
}

function auth_logout_(payload, ctx) {
  withLock_(function () {
    var sessions = tbl_('AuthSessions');
    var row = sessions.findRow('sessionHash', ctx.hash);
    if (row) sessions.update(row, { revoked: '1' });
  });
  return { loggedOut: true };
}

function auth_logoutAll_(payload, ctx) {
  var n = revokeAllSessions_(ctx.user.playerId);
  return { revoked: n };
}

function revokeAllSessions_(playerId) {
  return withLock_(function () {
    var sessions = tbl_('AuthSessions');
    var mine = sessions.where('playerId', playerId).filter(function (s) { return !s.revoked; });
    mine.forEach(function (s) { sessions.update(s._row, { revoked: '1' }); });
    return mine.length;
  });
}

/** Called by the realtime server: resolve a browser session token to a trusted identity. */
function server_verifySession_(payload) {
  var token = payload && payload.sessionToken;
  var ctx = requireSession_(token);
  var u = ctx.user;
  return {
    playerId: u.playerId,
    displayName: u.displayName,
    picture: avatarPicture_(u),
    role: effectiveRole_(u),
    status: u.status,
    rating: u.rating,
    expiresAt: ctx.session.expiresAt
  };
}
