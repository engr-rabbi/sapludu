/** Sapludu backend — small shared helpers (ids, hashing, validation, rate limiting). */

function ApiError(code, message, status) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message || code;
  this.status = status || 400;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function nowIso_() { return new Date().toISOString(); }
function nowMs_() { return Date.now(); }
function addMinutesIso_(min) { return new Date(Date.now() + min * 60000).toISOString(); }
function addHoursIso_(h) { return new Date(Date.now() + h * 3600000).toISOString(); }
function isoToMs_(iso) { var t = Date.parse(iso); return isNaN(t) ? 0 : t; }

function newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
}

function newToken_() {
  // two random UUIDv4 values = 244 bits of entropy; only its SHA-256 is stored
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}

/** Constant-time string comparison (secrets, tokens). */
function safeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ───────────── validation ─────────────

function reqString_(v, name, min, max) {
  if (typeof v !== 'string') throw new ApiError('VALIDATION', name + ' must be a string', 400);
  var s = v.trim();
  if (s.length < min || s.length > max) {
    throw new ApiError('VALIDATION', name + ' must be ' + min + '-' + max + ' characters', 400);
  }
  return s;
}

function reqInt_(v, name, min, max) {
  if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < min || v > max) {
    throw new ApiError('VALIDATION', name + ' must be an integer between ' + min + ' and ' + max, 400);
  }
  return v;
}

function reqOneOf_(v, name, list) {
  if (list.indexOf(v) < 0) throw new ApiError('VALIDATION', name + ' must be one of: ' + list.join(', '), 400);
  return v;
}

function optInt_(v, name, min, max, dflt) {
  return v === undefined || v === null ? dflt : reqInt_(v, name, min, max);
}

/** Display names: unicode letters/numbers, spaces and _ . - ' only; never starts with a spreadsheet-formula char. */
function cleanDisplayName_(raw) {
  var s = String(raw === undefined || raw === null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^[=+\-@'\t\r]+/, '').trim();
  return s;
}

function validDisplayName_(name) {
  return /^[\p{L}\p{N}][\p{L}\p{N} _.'\-]{1,23}$/u.test(name);
}

function safeText_(v, max) {
  // neutralise formula injection + control chars for free-text cells
  var s = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, max || 500);
}

// ───────────── rate limiting (CacheService, best effort) ─────────────

function rateLimit_(key, limit, windowSec) {
  var cache = CacheService.getScriptCache();
  var k = 'rl:' + key;
  var n = parseInt(cache.get(k) || '0', 10);
  if (n >= limit) throw new ApiError('RATE_LIMITED', 'Too many requests, slow down', 429);
  cache.put(k, String(n + 1), windowSec);
}

// ───────────── logging ─────────────

function logEvent_(level, action, message, playerId) {
  try {
    console.log('[' + level + '] ' + action + ': ' + message);
    if (level === 'error' || level === 'warn') {
      tbl_('Logs').append({ ts: nowIso_(), level: level, action: action, message: safeText_(message, 400), playerId: playerId || '' });
    }
  } catch (e) {
    console.error('logEvent_ failed: ' + e);
  }
}
