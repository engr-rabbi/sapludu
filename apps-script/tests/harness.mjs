/**
 * Test harness: loads the real .gs sources into a Node vm context and provides in-memory fakes of the
 * Apps Script services (SpreadsheetApp, LockService, CacheService, PropertiesService, UrlFetchApp,
 * Utilities, ContentService, ScriptApp). No network, no Google account needed.
 *
 * The lock fake is NON-reentrant and throws on nested acquisition — exactly the situation that would
 * deadlock a real Apps Script execution — so accidental nested withLock_() calls are caught by the tests.
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC_ORDER = ['Config', 'Util', 'Db', 'Auth', 'Users', 'Games', 'Leaderboard', 'Social', 'Admin', 'Api', 'Setup'];

class MockRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.data[this.r - 1 + i] || [];
      const vals = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; vals.push(v === undefined ? '' : v); }
      out.push(vals);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error('setValues dimension mismatch');
    for (let i = 0; i < this.nr; i++) {
      const idx = this.r - 1 + i;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      for (let j = 0; j < this.nc; j++) this.sheet.data[idx][this.c - 1 + j] = vals[i][j];
    }
    return this;
  }
  setValue(v) { return this.setValues(Array.from({ length: this.nr }, () => Array(this.nc).fill(v))); }
  clearContent() {
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.data[this.r - 1 + i];
      if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = '';
    }
    this.sheet.trim();
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class MockSheet {
  constructor(name) { this.name = name; this.data = []; this.formats = 0; }
  trim() { while (this.data.length && this.data[this.data.length - 1].every((v) => v === '' || v === undefined)) this.data.pop(); }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getMaxRows() { return this.data.length + 100; }
  getRange(r, c, nr = 1, nc = 1) { return new MockRange(this, r, c, nr, nc); }
  appendRow(values) { this.data.push([...values]); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
}

export function createEnv(props = {}, opts = {}) {
  let clock = Date.parse('2026-11-22T10:00:00Z');
  const sheets = new Map();
  const properties = new Map(Object.entries({
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    SERVER_SECRET: 's'.repeat(40),
    ADMIN_EMAILS: 'boss@example.com',
    ...props
  }));
  const cacheStore = new Map();
  const env = {
    now: () => clock,
    advance: (ms) => { clock += ms; },
    sheets,
    properties,
    fetchLog: [],
    fetchHandler: () => ({ code: 500, body: '{}' }),
    lockHeld: false,
    lockFailures: 0,
    triggers: []
  };

  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new MockSheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name)
  };

  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opts.standalone ? null : ss),
      openById: (id) => { if (opts.standalone && id !== 'created-id') throw new Error('not found'); return ss; },
      create: () => { env.created = true; return { getId: () => 'created-id', getUrl: () => 'https://docs.google.com/spreadsheets/d/created-id', ...ss }; },
      getUi: () => { throw new Error('no ui'); }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (env.lockFailures > 0) { env.lockFailures--; throw new Error('lock timeout'); }
          if (env.lockHeld) throw new Error('NESTED LOCK: waitLock called while the script lock is already held');
          env.lockHeld = true;
        },
        releaseLock() { env.lockHeld = false; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get(k) { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= clock) { cacheStore.delete(k); return null; } return e.v; },
        put(k, v, ttl = 600) { cacheStore.set(k, { v: String(v), exp: clock + ttl * 1000 }); },
        remove(k) { cacheStore.delete(k); }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (properties.has(k) ? properties.get(k) : null),
        setProperty: (k, v) => properties.set(k, v)
      })
    },
    UrlFetchApp: {
      fetch(url, opts) {
        env.fetchLog.push({ url, opts });
        const r = env.fetchHandler(url, opts);
        if (r instanceof Error) throw r;
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algo, str) => [...crypto.createHash('sha256').update(String(str), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b))
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    ScriptApp: {
      getProjectTriggers: () => env.triggers,
      newTrigger: (fn) => {
        const t = { fn, getHandlerFunction: () => fn };
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, create: () => { env.triggers.push(t); return t; } };
        return b;
      }
    },
    encodeURIComponent
  };

  const ctx = vm.createContext(sandbox);
  // controllable clock for Date
  vm.runInContext(`
    var __RealDate = Date;
    var __clock = null;
    Date = class extends __RealDate {
      constructor(...a) { if (a.length === 0) super(__clock()); else super(...a); }
      static now() { return __clock(); }
    };
  `, ctx);
  ctx.__clock = () => clock;

  for (const name of SRC_ORDER) {
    const file = path.join(dir, '..', `${name}.gs`);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: `${name}.gs` });
  }

  env.ctx = ctx;
  env.run = (code) => vm.runInContext(code, ctx);

  /** Raw API call through doPost, exactly as the web app would receive it. */
  env.call = (action, payload = {}, extra = {}) => {
    const body = typeof extra.raw === 'string' ? extra.raw : JSON.stringify({ action, payload, ...extra });
    const out = ctx.doPost({ postData: { contents: body } });
    return JSON.parse(out.getContent());
  };
  env.ok = (action, payload, extra) => {
    const r = env.call(action, payload, extra);
    if (!r.ok) throw new Error(`${action} failed: ${r.error.code} ${r.error.message}`);
    return r.data;
  };

  // Google tokeninfo fake: tokens are "TOKEN.<json>.SIG" where json describes the identity
  env.fetchHandler = (url) => {
    const m = /id_token=([^&]+)/.exec(url);
    if (!m) return { code: 400, body: '{}' };
    const tok = decodeURIComponent(m[1]);
    const mid = tok.split('.')[1];
    let info;
    try { info = JSON.parse(Buffer.from(mid, 'base64url').toString()); } catch { return { code: 400, body: '{"error":"invalid_token"}' }; }
    if (info.__status) return { code: info.__status, body: '{}' };
    return { code: 200, body: JSON.stringify(info) };
  };

  env.setup = () => ctx.setup();
  return env;
}

/** Builds a fake Google ID token carrying `claims`. */
export function googleToken(claims = {}) {
  const info = {
    iss: 'https://accounts.google.com',
    aud: 'test-client.apps.googleusercontent.com',
    sub: 'sub-' + (claims.email || 'user'),
    email: 'user@example.com',
    email_verified: 'true',
    name: 'Test User',
    picture: 'https://lh3.googleusercontent.com/a/abc',
    exp: String(Math.floor(Date.parse('2026-11-22T10:00:00Z') / 1000) + 3600),
    ...claims
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64(info)}.${'x'.repeat(10)}`;
}
