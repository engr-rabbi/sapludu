/**
 * Sapludu backend — Google Sheets database layer.
 *
 * Every entity lives in its own sheet (see SCHEMA in Config.gs). Rows are addressed
 * through column names, never positional indexes, so adding columns at the END of a
 * sheet is backwards compatible. All mutations must run inside withLock_() so that
 * concurrent web-app executions cannot interleave their read-modify-write cycles.
 */

var _ssCache = null;
var _tableCache = {};

function spreadsheet_() {
  if (_ssCache) return _ssCache;
  var id = prop_('SPREADSHEET_ID', '');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new ApiError('DB_UNAVAILABLE', 'Spreadsheet is not configured (container-bind the script or set SPREADSHEET_ID)', 500);
  _ssCache = ss;
  return ss;
}

function tbl_(name) {
  if (!_tableCache[name]) _tableCache[name] = new Table_(name);
  return _tableCache[name];
}

/** Serialises writers across all concurrent web-app executions. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new ApiError('BUSY', 'The server is busy, please retry in a moment', 503);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function Table_(name) {
  var cols = SCHEMA[name];
  if (!cols) throw new Error('Unknown table ' + name);
  this.name = name;
  this.cols = cols;
  this.idx = {};
  for (var i = 0; i < cols.length; i++) this.idx[cols[i]] = i;
  this.sheet = spreadsheet_().getSheetByName(name);
  if (!this.sheet) {
    throw new ApiError('DB_NOT_INITIALISED', 'Sheet "' + name + '" is missing — run setup() from the Apps Script editor', 500);
  }
}

Table_.prototype.lastRow = function () { return this.sheet.getLastRow(); };

Table_.prototype.count = function () { return Math.max(0, this.lastRow() - 1); };

Table_.prototype.toObj = function (vals, rowNum) {
  var o = { _row: rowNum };
  for (var i = 0; i < this.cols.length; i++) {
    var c = this.cols[i];
    var v = vals[i];
    if (NUMERIC_COLS[c]) o[c] = Number(v) || 0;
    else if (v instanceof Date) o[c] = v.toISOString(); // only if someone re-formatted a text column by hand
    else o[c] = v === null || v === undefined ? '' : String(v);
  }
  return o;
};

Table_.prototype.toCell = function (col, v) {
  if (NUMERIC_COLS[col]) return Number(v) || 0;
  return v === null || v === undefined ? '' : String(v);
};

Table_.prototype.readAll = function () {
  var n = this.count();
  if (n === 0) return [];
  var values = this.sheet.getRange(2, 1, n, this.cols.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) out.push(this.toObj(values[i], i + 2));
  return out;
};

Table_.prototype.column = function (col) {
  var n = this.count();
  if (n === 0) return [];
  return this.sheet.getRange(2, this.idx[col] + 1, n, 1).getValues().map(function (r) { return r[0]; });
};

Table_.prototype.getRow = function (rowNum) {
  var vals = this.sheet.getRange(rowNum, 1, 1, this.cols.length).getValues()[0];
  return this.toObj(vals, rowNum);
};

/** Row number (>=2) of the first row whose `col` equals `value`, or 0. Reads one column only. */
Table_.prototype.findRow = function (col, value) {
  var vals = this.column(col);
  var target = String(value);
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i]) === target) return i + 2;
  }
  return 0;
};

Table_.prototype.find = function (col, value) {
  var r = this.findRow(col, value);
  return r ? this.getRow(r) : null;
};

/** All rows whose `col` equals `value`. */
Table_.prototype.where = function (col, value) {
  var vals = this.column(col);
  var target = String(value);
  var hits = [];
  for (var i = 0; i < vals.length; i++) if (String(vals[i]) === target) hits.push(i + 2);
  if (hits.length === 0) return [];
  if (hits.length > 25) {
    return this.readAll().filter(function (o) { return String(o[col]) === target; });
  }
  var self = this;
  return hits.map(function (r) { return self.getRow(r); });
};

Table_.prototype.rowValues = function (obj) {
  var self = this;
  return this.cols.map(function (c) { return self.toCell(c, obj[c]); });
};

Table_.prototype.append = function (obj) {
  this.sheet.appendRow(this.rowValues(obj));
};

Table_.prototype.appendMany = function (objs) {
  if (!objs || objs.length === 0) return;
  var self = this;
  var start = this.lastRow() + 1;
  var values = objs.map(function (o) { return self.rowValues(o); });
  this.sheet.getRange(start, 1, values.length, this.cols.length).setValues(values);
};

/** Merge `patch` into the row (only the given columns change). */
Table_.prototype.update = function (rowNum, patch) {
  var range = this.sheet.getRange(rowNum, 1, 1, this.cols.length);
  var cur = range.getValues()[0];
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && this.idx[k] !== undefined) {
      cur[this.idx[k]] = this.toCell(k, patch[k]);
    }
  }
  range.setValues([cur]);
};

Table_.prototype.setColumn = function (col, values) {
  if (values.length === 0) return;
  var self = this;
  this.sheet.getRange(2, this.idx[col] + 1, values.length, 1)
    .setValues(values.map(function (v) { return [self.toCell(col, v)]; }));
};

Table_.prototype.deleteRows = function (rowNums) {
  var sorted = rowNums.slice().sort(function (a, b) { return b - a; });
  for (var i = 0; i < sorted.length; i++) this.sheet.deleteRow(sorted[i]);
};

/** Replace every data row (header stays). */
Table_.prototype.replaceAll = function (objs) {
  var n = this.count();
  if (n > 0) this.sheet.getRange(2, 1, n, this.cols.length).clearContent();
  this.appendMany(objs);
};

// ───────────── paging helper ─────────────

function paginate_(items, page, pageSize) {
  var size = pageSize || APP.PAGE_SIZE;
  var total = items.length;
  var p = Math.max(1, Math.min(page || 1, Math.max(1, Math.ceil(total / size))));
  return { page: p, pageSize: size, total: total, items: items.slice((p - 1) * size, p * size) };
}
