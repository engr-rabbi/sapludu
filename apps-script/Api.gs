/**
 * Sapludu backend — web-app entry points and request router.
 *
 * Protocol: the browser / game server POSTs a JSON string (Content-Type: text/plain, which avoids a CORS
 * preflight — Apps Script web apps cannot answer OPTIONS requests):
 *
 *   { "action": "auth.me", "sessionToken": "...", "payload": { ... } }
 *   { "action": "server.recordGame", "serverSecret": "...", "payload": { ... } }
 *
 * Reply:  { "ok": true, "data": ... }   or   { "ok": false, "error": { "code": "...", "message": "..." } }
 *
 * Apps Script cannot read HTTP headers or the caller's IP, so credentials travel in the JSON body.
 */

var ROUTES = {
  'auth.login':          { fn: auth_login_, auth: 'none' },
  'auth.me':             { fn: auth_me_, auth: 'user' },
  'auth.logout':         { fn: auth_logout_, auth: 'user' },
  'auth.logoutAll':      { fn: auth_logoutAll_, auth: 'user' },

  'users.updateProfile': { fn: users_updateProfile_, auth: 'user' },
  'users.deleteAccount': { fn: users_deleteAccount_, auth: 'user' },

  'games.history':       { fn: games_history_, auth: 'user' },
  'games.reportPractice': { fn: games_reportPractice_, auth: 'user' },
  'achievements.list':   { fn: achievements_list_, auth: 'user' },
  'leaderboard.get':     { fn: leaderboard_get_, auth: 'optional' },

  'friends.list':        { fn: friends_list_, auth: 'user' },
  'friends.request':     { fn: friends_request_, auth: 'user' },
  'friends.respond':     { fn: friends_respond_, auth: 'user' },
  'friends.remove':      { fn: friends_remove_, auth: 'user' },
  'invites.list':        { fn: invites_list_, auth: 'user' },
  'invites.respond':     { fn: invites_respond_, auth: 'user' },
  'reports.submit':      { fn: reports_submit_, auth: 'user' },

  'admin.stats':         { fn: admin_stats_, auth: 'admin' },
  'admin.users':         { fn: admin_users_, auth: 'admin' },
  'admin.setUserStatus': { fn: admin_setUserStatus_, auth: 'admin' },
  'admin.setRole':       { fn: admin_setRole_, auth: 'admin' },
  'admin.games':         { fn: admin_games_, auth: 'admin' },
  'admin.reports':       { fn: admin_reports_, auth: 'admin' },
  'admin.resolveReport': { fn: admin_resolveReport_, auth: 'admin' },
  'admin.audit':         { fn: admin_audit_, auth: 'admin' },

  'server.verifySession': { fn: server_verifySession_, auth: 'server' },
  'server.gameStarted':   { fn: server_gameStarted_, auth: 'server' },
  'server.gameAborted':   { fn: server_gameAborted_, auth: 'server' },
  'server.recordGame':    { fn: server_recordGame_, auth: 'server' },
  'server.createInvite':  { fn: server_createInvite_, auth: 'server' }
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function requireServer_(secret) {
  var expected = config_().serverSecret;
  if (!expected || expected.length < 24) {
    throw new ApiError('SERVER_NOT_CONFIGURED', 'SERVER_SECRET script property is missing or too short (min 24 chars)', 500);
  }
  if (!safeEqual_(secret, expected)) {
    rateLimit_('serverauth:fail', 30, 60); // throttles brute-force attempts on the shared secret
    throw new ApiError('FORBIDDEN', 'Invalid server credentials', 403);
  }
}

function handleRequest_(req) {
  if (!req || typeof req !== 'object' || typeof req.action !== 'string') throw new ApiError('BAD_REQUEST', 'Missing action', 400);
  if (!Object.prototype.hasOwnProperty.call(ROUTES, req.action)) throw new ApiError('UNKNOWN_ACTION', 'Unknown action', 404);
  var route = ROUTES[req.action];
  var payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
  var ctx = null;

  if (route.auth === 'server') {
    requireServer_(req.serverSecret);
  } else if (route.auth === 'user' || route.auth === 'admin') {
    ctx = requireSession_(req.sessionToken);
    if (route.auth === 'admin' && effectiveRole_(ctx.user) !== 'admin') {
      throw new ApiError('FORBIDDEN', 'Administrator access required', 403);
    }
    rateLimit_('api:' + ctx.user.playerId, 180, 60);
  } else if (route.auth === 'optional' && req.sessionToken) {
    try { ctx = requireSession_(req.sessionToken); } catch (e) { ctx = null; }
  }
  if (route.auth === 'none') payload.__ua = typeof req.ua === 'string' ? req.ua : '';
  return route.fn(payload, ctx, req);
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) throw new ApiError('BAD_REQUEST', 'Empty request', 400);
    if (raw.length > APP.MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Request is too large', 413);
    var req;
    try { req = JSON.parse(raw); } catch (parseErr) { throw new ApiError('BAD_REQUEST', 'Body must be JSON', 400); }
    var data = handleRequest_(req);
    return json_({ ok: true, data: data === undefined ? {} : data });
  } catch (err) {
    if (err instanceof ApiError || (err && err.name === 'ApiError')) {
      if (err.status >= 500) logEvent_('error', 'api', err.code + ': ' + err.message, '');
      return json_({ ok: false, error: { code: err.code, message: err.message } });
    }
    logEvent_('error', 'api', String(err && err.stack || err), '');
    return json_({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected server error' } });
  }
}

/** Health probe — reveals nothing but the service name and version. */
function doGet() {
  return json_({ ok: true, data: { service: APP.NAME, version: APP.VERSION } });
}
