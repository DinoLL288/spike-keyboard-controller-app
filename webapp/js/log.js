// ==========================================================================
// Block Studio diagnostic logger
// ==========================================================================
// Purpose : capture EVERYTHING that happens on the Block Studio page so a
//           student can press "Save log" and send one file for debugging.
//
// Loaded  : as the FIRST <script> in block-studio.html (classic, not a
//           module) so it is installed before Blockly, config, the hub and
//           the page module load. That means even a failure to load one of
//           those files is recorded.
//
// Exposes : window.BSLOG
//             .debug(msg, data)  .info(msg, data)
//             .warn(msg, data)   .error(msg, data)   .log(msg, data)
//             .entries()          copy of all entries (oldest first)
//             .onEntry(fn)        called for each new entry
//             .setContext(fn)     fn() -> current program JSON (for the dump)
//             .clear()            wipe the stored log
//             .download()         save log.txt + log.json as a .zip
//             .text() / .toJson() the two payloads (also used by download)
//
// Captures
//   - messages from the page, the engine, and the hub
//   - console.log/info/warn/error/debug (original console still works)
//   - window "error" events (runtime errors AND failed script/img loads)
//   - "unhandledrejection" (unawaited async failures)
//   - a session marker on every page load
//
// Persistence
//   Entries are kept in localStorage under bs_log_v2 (capped), so a crash or
//   reload does not lose the run-up to the problem. Nothing leaves the
//   machine until the student presses Save log.
// --------------------------------------------------------------------------

(function (global) {
  'use strict';

  var STORAGE_KEY = 'bs_log_v2';
  var MAX_ENTRIES = 3000;
  var MAX_STORED_BYTES = 1500000; // ~1.5 MB of JSON in localStorage
  var MAX_DATA_CHARS = 6000;      // per-entry detail cap

  var entries = [];
  var seq = 0;
  var persistTimer = null;
  var entryHook = null;
  var contextFn = null;

  // ---- small helpers -----------------------------------------------------
  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function stamp(d) {
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  function safeString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function trimData(data) {
    if (data == null) return undefined;
    var v = data;
    if (v instanceof Error) v = { name: v.name, message: v.message, stack: v.stack };
    var s;
    try { s = (typeof v === 'string') ? v : JSON.stringify(v); }
    catch (e) { s = String(v); }
    if (s == null) s = String(v);
    if (s.length > MAX_DATA_CHARS) s = s.slice(0, MAX_DATA_CHARS) + '\u2026[truncated]';
    return s;
  }

  // ---- core: add one entry ----------------------------------------------
  function add(level, msg, data) {
    var e = {
      i: ++seq,
      t: nowIso(),
      level: level || 'info',
      msg: (msg == null ? '' : String(msg)),
    };
    var d = trimData(data);
    if (d !== undefined) e.data = d;

    entries.push(e);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

    schedulePersist();
    if (entryHook) { try { entryHook(e); } catch (ignored) {} }
    return e;
  }

  // ---- persistence -------------------------------------------------------
  function persist() {
    try {
      var s = JSON.stringify(entries);
      if (s.length > MAX_STORED_BYTES) {
        // Drop the oldest half, then try again (never throw on quota).
        entries.splice(0, Math.floor(entries.length / 2));
        s = JSON.stringify(entries);
      }
      global.localStorage.setItem(STORAGE_KEY, s);
    } catch (ignored) {
      // Private mode / quota / disabled storage: logging still works in memory.
    }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = global.setTimeout(function () {
      persistTimer = null;
      persist();
    }, 400);
  }

  function restore() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      entries = arr.slice(-MAX_ENTRIES);
      for (var k = 0; k < entries.length; k++) {
        var n = entries[k] && entries[k].i;
        if (n > seq) seq = n;
      }
    } catch (ignored) {
      entries = [];
    }
  }

  // ---- environment / program snapshot ------------------------------------
  function environment() {
    var env = {
      generatedAt: nowIso(),
      url: '',
      title: '',
      userAgent: '',
      platform: '',
      language: '',
      languages: '',
      online: null,
      cookieEnabled: null,
      screen: '',
      viewport: '',
      devicePixelRatio: null,
      timezone: '',
      connection: null,
      appVersion: '',
    };
    try { env.url = global.location.href; } catch (e) {}
    try { env.title = global.document.title; } catch (e) {}
    try { env.userAgent = global.navigator.userAgent; } catch (e) {}
    try { env.platform = global.navigator.platform || ''; } catch (e) {}
    try { env.language = global.navigator.language || ''; } catch (e) {}
    try { env.languages = (global.navigator.languages || []).join(', '); } catch (e) {}
    try { env.online = !!global.navigator.onLine; } catch (e) {}
    try { env.cookieEnabled = !!global.navigator.cookieEnabled; } catch (e) {}
    try { env.screen = global.screen.width + 'x' + global.screen.height; } catch (e) {}
    try { env.viewport = global.innerWidth + 'x' + global.innerHeight; } catch (e) {}
    try { env.devicePixelRatio = global.devicePixelRatio; } catch (e) {}
    try { env.timezone = global.Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    try { env.appVersion = global.navigator.appVersion || ''; } catch (e) {}
    try {
      var c = global.navigator.connection;
      if (c) {
        env.connection = {
          type: c.type || '',
          effectiveType: c.effectiveType || '',
          downlink: c.downlink,
          rtt: c.rtt,
        };
      }
    } catch (e) {}
    return env;
  }

  function programSnapshot() {
    if (!contextFn) return null;
    try { return contextFn(); } catch (e) { return { error: safeString(e) }; }
  }

  // ---- text + json payloads ---------------------------------------------
  function buildText() {
    var env = environment();
    var lines = [];
    lines.push('SPIKE Block Studio \u2014 diagnostic log');
    lines.push('=====================================');
    lines.push('Generated : ' + env.generatedAt);
    lines.push('URL       : ' + env.url);
    lines.push('Title     : ' + env.title);
    lines.push('User agent: ' + env.userAgent);
    lines.push('Platform  : ' + env.platform);
    lines.push('Language  : ' + env.language + ' (' + env.languages + ')');
    lines.push('Screen    : ' + env.screen + '  viewport ' + env.viewport +
      '  dpr ' + env.devicePixelRatio);
    lines.push('Online    : ' + env.online + '  cookies ' + env.cookieEnabled);
    lines.push('Timezone  : ' + env.timezone);
    if (env.connection) {
      lines.push('Network   : ' + safeString(env.connection));
    }
    lines.push('');
    lines.push('=== LOG (' + entries.length + ' entries, oldest first) ===');
    for (var k = 0; k < entries.length; k++) {
      var e = entries[k];
      var line = e.t + '  ' + String(e.level || 'info').toUpperCase() + '  ' + e.msg;
      if (e.data) line += '  |  ' + e.data;
      lines.push(line);
    }
    lines.push('');
    lines.push('=== CURRENT PROGRAM (Blockly JSON) ===');
    var prog = programSnapshot();
    lines.push(prog ? JSON.stringify(prog, null, 2) : '(unavailable)');
    return lines.join('\n');
  }

  function buildJson() {
    return JSON.stringify({
      generatedAt: nowIso(),
      environment: environment(),
      entries: entries,
      program: programSnapshot(),
    }, null, 2);
  }

  // ---- tiny store-only ZIP writer (no compression, no dependency) --------
  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
  }
  function crc32(bytes) {
    var t = crcTable();
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) |
      ((Math.floor(d.getSeconds() / 2)) & 31);
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) & 127) << 9) |
      (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  }

  function makeZip(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var time = dosTime(now);
    var date = dosDate(now);
    var chunks = [];
    var central = [];
    var offset = 0;

    for (var f = 0; f < files.length; f++) {
      var nameBytes = enc.encode(files[f].name);
      var data = files[f].bytes;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   // local file header
      lv.setUint16(4, 20, true);           // version needed
      lv.setUint16(6, 0x0800, true);       // general purpose flags: UTF-8
      lv.setUint16(8, 0, true);            // method: store
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true); // compressed size
      lv.setUint32(22, data.length, true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);           // extra length
      local.set(nameBytes, 30);
      chunks.push(local);
      chunks.push(data);

      var cen = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory header
      cv.setUint16(4, 20, true);           // version made by
      cv.setUint16(6, 20, true);           // version needed
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + data.length;
    }

    var centralSize = 0;
    for (var c = 0; c < central.length; c++) centralSize += central[c].length;

    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);     // end of central directory
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    var out = new Uint8Array(offset + centralSize + eocd.length);
    var p = 0;
    for (var a = 0; a < chunks.length; a++) { out.set(chunks[a], p); p += chunks[a].length; }
    for (var b = 0; b < central.length; b++) { out.set(central[b], p); p += central[b].length; }
    out.set(eocd, p);
    return out;
  }

  // ---- public download ---------------------------------------------------
  function download() {
    add('info', 'Diagnostic log: Save log pressed');
    var txt = new TextEncoder().encode(buildText());
    var json = new TextEncoder().encode(buildJson());
    var zip = makeZip([
      { name: 'log.txt', bytes: txt },
      { name: 'log.json', bytes: json },
    ]);
    var filename = 'spike-block-studio-log-' + stamp(new Date()) + '.zip';
    var blob = new Blob([zip], { type: 'application/zip' });
    var url = global.URL.createObjectURL(blob);
    var a = global.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    global.setTimeout(function () { try { global.URL.revokeObjectURL(url); } catch (e) {} }, 10000);
    return filename;
  }

  function clear() {
    entries = [];
    seq = 0;
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    return add('info', 'Diagnostic log cleared by the user');
  }

  // ---- install global capture hooks --------------------------------------
  function install() {
    restore();

    add('info', '=== session start ===', {
      url: (function () { try { return global.location.href; } catch (e) { return ''; } })(),
      ua: (function () { try { return global.navigator.userAgent; } catch (e) { return ''; } })(),
    });

    // Wrap the console so anything logged by Blockly, the hub or the engine
    // is also captured. The original console output is preserved.
    try {
      var methods = ['log', 'info', 'warn', 'error', 'debug'];
      for (var m = 0; m < methods.length; m++) {
        (function (name) {
          var orig = global.console[name];
          if (typeof orig !== 'function') return;
          global.console[name] = function () {
            try { orig.apply(global.console, arguments); } catch (e) {}
            var parts = [];
            for (var i = 0; i < arguments.length; i++) parts.push(safeString(arguments[i]));
            var level = name === 'error' ? 'error' : (name === 'warn' ? 'warn' :
              (name === 'debug' ? 'debug' : 'info'));
            add(level, 'console.' + name, parts.join(' '));
          };
        })(methods[m]);
      }
    } catch (ignored) {}

    // Runtime errors + failed resource loads (script/img/css).
    try {
      global.addEventListener('error', function (ev) {
        if (ev && ev.message) {
          add('error', 'Uncaught error: ' + ev.message, {
            source: ev.filename || '',
            line: ev.lineno || 0,
            column: ev.colno || 0,
            stack: (ev.error && (ev.error.stack || ev.error.message)) || '',
          });
          return;
        }
        var t = ev && ev.target;
        if (t && t.tagName) {
          add('error', 'Failed to load ' + t.tagName.toLowerCase() + ': ' +
            (t.src || t.href || t.getAttribute && t.getAttribute('src') || '(unknown)'), {
            tag: t.tagName,
          });
        }
      }, true);
    } catch (ignored) {}

    try {
      global.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        add('error', 'Unhandled promise rejection: ' +
          (r && (r.message || r) || '(empty)'), {
          stack: (r && (r.stack || r.message)) || '',
        });
      });
    } catch (ignored) {}

    // Make sure the tail of the log is on disk before the tab goes away.
    try { global.addEventListener('pagehide', persist); } catch (ignored) {}
    try { global.addEventListener('beforeunload', persist); } catch (ignored) {}
  }

  // ---- export ------------------------------------------------------------
  var api = {
    version: 1,
    debug: function (m, d) { return add('debug', m, d); },
    info: function (m, d) { return add('info', m, d); },
    warn: function (m, d) { return add('warn', m, d); },
    error: function (m, d) { return add('error', m, d); },
    log: function (m, d) { return add('info', m, d); },
    entries: function () { return entries.slice(); },
    onEntry: function (fn) { entryHook = (typeof fn === 'function') ? fn : null; },
    setContext: function (fn) { contextFn = (typeof fn === 'function') ? fn : null; },
    clear: clear,
    download: download,
    text: buildText,
    toJson: buildJson,
    environment: environment,
    _makeZip: makeZip, // exposed for the offline test harness
  };

  global.BSLOG = api;
  install();
})(typeof window !== 'undefined' ? window : globalThis);
