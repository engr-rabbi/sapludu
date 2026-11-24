/**
 * Sapludu backend — one-time setup and maintenance. Run setup() once from the Apps Script editor.
 */

function setup() {
  var report = ensureSchema_();
  var cfg = config_();
  var problems = [];
  if (cfg.clientIds.length === 0) problems.push('GOOGLE_CLIENT_ID is not set');
  if (!cfg.serverSecret || cfg.serverSecret.length < 24) problems.push('SERVER_SECRET is missing or shorter than 24 characters (run generateServerSecret())');
  if (cfg.adminEmails.length === 0) problems.push('ADMIN_EMAILS is empty — nobody will be able to open the admin dashboard');
  installTriggers_();
  Logger.log('Database ready: ' + JSON.stringify(report));
  Logger.log(problems.length ? 'ACTION NEEDED:\n - ' + problems.join('\n - ') : 'Configuration looks complete.');
  return { schema: report, problems: problems };
}

/** Creates every sheet + header row that is missing; never touches existing data. */
function ensureSchema_() {
  var ss = spreadsheet_();
  var report = {};
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sheet = ss.getSheetByName(name);
    var created = false;
    if (!sheet) { sheet = ss.insertSheet(name); created = true; }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      created = true;
    }
    var header = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
    var ok = cols.every(function (c, i) { return header[i] === c; });
    if (created) {
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#e8f5e9');
      cols.forEach(function (c, i) {
        // text columns are stored as plain text: no formula evaluation, no date/number auto-conversion
        if (!NUMERIC_COLS[c]) sheet.getRange(2, i + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
      });
    }
    report[name] = created ? 'created' : (ok ? 'ok' : 'HEADER MISMATCH — do not edit header rows');
  });
  // remove the default empty sheet of a brand-new spreadsheet
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  return report;
}

function verifySchema() {
  var ss = spreadsheet_();
  var bad = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { bad.push(name + ': missing'); return; }
    var header = sheet.getRange(1, 1, 1, SCHEMA[name].length).getValues()[0];
    SCHEMA[name].forEach(function (c, i) { if (header[i] !== c) bad.push(name + ': column ' + (i + 1) + ' should be "' + c + '"'); });
  });
  Logger.log(bad.length ? bad.join('\n') : 'Schema OK');
  return bad;
}

/** Generates a strong random SERVER_SECRET, stores it in Script Properties and logs it ONCE. */
function generateServerSecret() {
  var secret = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('SERVER_SECRET', secret);
  Logger.log('SERVER_SECRET stored. Copy this value into the game server environment (APPS_SCRIPT_SERVER_SECRET), then clear the execution log:\n' + secret);
  return 'stored (see log)';
}

function installTriggers_() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'maintenance'; });
  if (existing.length === 0) ScriptApp.newTrigger('maintenance').timeBased().everyDays(1).atHour(3).create();
}

/** Daily housekeeping (installed as a time-driven trigger by setup()). */
function maintenance() {
  return withLock_(function () {
    var out = {};
    var now = nowMs_();

    var sessions = tbl_('AuthSessions');
    var dead = sessions.readAll().filter(function (s) { return isoToMs_(s.expiresAt) < now - 86400000 || (s.revoked && isoToMs_(s.lastSeen) < now - 86400000); });
    sessions.deleteRows(dead.slice(0, 500).map(function (s) { return s._row; }));
    out.sessionsPurged = Math.min(dead.length, 500);

    var logs = tbl_('Logs');
    var oldLogs = logs.readAll().filter(function (l) { return isoToMs_(l.ts) < now - APP.LOG_RETENTION_DAYS * 86400000; });
    logs.deleteRows(oldLogs.slice(0, 500).map(function (l) { return l._row; }));
    out.logsPurged = Math.min(oldLogs.length, 500);

    var inv = tbl_('Invitations');
    var oldInv = inv.readAll().filter(function (i) { return isoToMs_(i.expiresAt) < now - 86400000; });
    inv.deleteRows(oldInv.slice(0, 500).map(function (i) { return i._row; }));
    out.invitesPurged = Math.min(oldInv.length, 500);

    var gs = tbl_('Sessions');
    var stale = gs.readAll().filter(function (s) { return s.status === 'active' && now - isoToMs_(s.startedAt) > APP.STALE_ACTIVE_SESSION_HOURS * 3600000; });
    stale.forEach(function (s) { gs.update(s._row, { status: 'abandoned', endedAt: nowIso_() }); });
    out.sessionsAbandoned = stale.length;
    return out;
  });
}

/** Convenience menu when the script is container-bound to the spreadsheet. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Sapludu').addItem('Initialize database (setup)', 'setup').addItem('Verify schema', 'verifySchema').addToUi();
  } catch (e) { /* standalone script: no UI */ }
}
