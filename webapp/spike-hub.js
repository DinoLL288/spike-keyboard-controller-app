// Web port of lego_hub.py - SPIKE Prime / LWP3 over Web Bluetooth.
// Communicates with the hub through Web Bluetooth (Chrome / Edge / Safari 17+).

(function (global) {
  'use strict';

  const C = CONFIG;

  // ---------------------------------------------------------------------
  // CRC-32 (zlib / binascii.crc32 compatible) with SPIKE's 4-byte padding.
  // ---------------------------------------------------------------------
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(data, seed) {
    let crc = (seed >>> 0) ^ 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = (CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function crc32Padded(data, seed) {
    let buf = data;
    const rem = data.length % 4;
    if (rem) {
      buf = new Uint8Array(data.length + (4 - rem));
      buf.set(data);
    }
    return crc32(buf, seed || 0);
  }

  // ---------------------------------------------------------------------
  // SPIKE Prime 3.x COBS encode / decode
  // ---------------------------------------------------------------------
  function cobsEncode(data) {
    const buffer = [];
    let codeIndex = 0;
    let block = 0;

    const beginBlock = () => {
      codeIndex = buffer.length;
      buffer.push(C.NO_DELIMITER);
      block = 1;
    };

    beginBlock();
    for (const byte of data) {
      if (byte > C.DELIMITER) {
        buffer.push(byte);
        block += 1;
      }
      if (byte <= C.DELIMITER || block > C.MAX_BLOCK_SIZE) {
        if (byte <= C.DELIMITER) {
          const delimiterBase = byte * C.MAX_BLOCK_SIZE;
          buffer[codeIndex] = delimiterBase + block + C.COBS_CODE_OFFSET;
        }
        beginBlock();
      }
    }
    buffer[codeIndex] = block + C.COBS_CODE_OFFSET;
    return new Uint8Array(buffer);
  }

  function cobsDecode(data) {
    const buffer = [];
    let value = null;
    let block = 0;

    const unescape = (code) => {
      if (code === 0xFF) return [null, C.MAX_BLOCK_SIZE + 1];
      const base = code - C.COBS_CODE_OFFSET;
      let b = base % C.MAX_BLOCK_SIZE;
      let v = Math.floor(base / C.MAX_BLOCK_SIZE);
      if (b === 0) {
        b = C.MAX_BLOCK_SIZE;
        v -= 1;
      }
      return [v, b];
    };

    [value, block] = unescape(data[0]);
    for (let i = 1; i < data.length; i++) {
      block -= 1;
      if (block > 0) {
        buffer.push(data[i]);
        continue;
      }
      if (value !== null) buffer.push(value);
      [value, block] = unescape(data[i]);
    }
    return new Uint8Array(buffer);
  }

  function packPrimeMessage(data) {
    const buffer = cobsEncode(data);
    for (let i = 0; i < buffer.length; i++) buffer[i] ^= C.XOR;
    const out = new Uint8Array(buffer.length + 1);
    out.set(buffer);
    out[buffer.length] = C.DELIMITER;
    return out;
  }

  function unpackPrimeFrame(frame) {
    if (!frame || !frame.length) return null;
    let start = 0;
    if (frame[0] === 0x01) start += 1;
    if (frame.length <= start) return null;
    if (frame[frame.length - 1] !== 0x02) return null;
    const unframed = new Uint8Array(frame.length - start - 1);
    for (let i = start; i < frame.length - 1; i++) unframed[i - start] = frame[i] ^ C.XOR;
    return cobsDecode(unframed);
  }

  // ---------------------------------------------------------------------
  // Drive profile
  // ---------------------------------------------------------------------
  class DriveProfile {
    constructor(opts) {
      opts = opts || {};
      this.mode = opts.mode || C.DEFAULT_DRIVE_MODE;
      this.front_ports = (opts.front_ports || C.FRONT_SLOT_PORTS).map(normPort);
      this.back_ports = (opts.back_ports || C.BACK_SLOT_PORTS).map(normPort);
      this.reversed = new Set((opts.reversed_ports || []).map(normPort).filter(Boolean));
    }
    get left_ports() { return this.front_ports[0] ? [this.front_ports[0]] : []; }
    get right_ports() { return this.front_ports[1] ? [this.front_ports[1]] : []; }
    get all_ports() {
      const ports = this.front_ports.filter(Boolean).slice();
      if (this.mode === '4WD') ports.push(...this.back_ports.filter(Boolean));
      return ports;
    }
    is_reversed(port) { return this.reversed.has(normPort(port)); }
    effective_speed(port, speed) {
      return this.is_reversed(port) ? -speed : speed;
    }
  }

  function normPort(p) {
    if (p === null || p === undefined) return null;
    return String(p).trim().toUpperCase();
  }

  // ---------------------------------------------------------------------
  // The hub
  // ---------------------------------------------------------------------
  class WebSpikeHub {
    constructor() {
      this._device = null;
      this._server = null;
      this._connected = false;
      this._protocol = null;      // 'prime' | 'lwp3'
      this._hubChar = null;       // LWP3 characteristic
      this._rxChar = null;        // prime write characteristic
      this._txChar = null;        // prime notify characteristic
      this._bridgeLoaded = false;
      this._maxPacketSize = 200;
      this._maxChunkSize = 128;
      this._pending = {};         // msg id -> {resolve, timer}
      this._motors = {};
      this._state = {};
      this._rxBuffer = [];
      this.profile = new DriveProfile();
      this.connectedName = '';
      this.onLog = null;
      this.onAttach = null;
      this.onState = null;
    }

    get is_connected() { return this._connected; }
    get protocol() { return this._protocol; }

    setProfile(opts) { this.profile = new DriveProfile(opts); }

    onLogInfo(msg) {
      if (this.onLog) { try { this.onLog(msg); } catch (e) {} }
    }

    static supported() {
      return typeof navigator !== 'undefined' && !!navigator.bluetooth;
    }

    // ----- scanning ----------------------------------------------------
    // Web Bluetooth has no passive scan; requestDevice opens the OS chooser.
    async pickDevice() {
      if (!WebSpikeHub.supported()) throw new Error('This browser has no Web Bluetooth. Use Chrome, Edge or Safari 17+ on a Mac.');
      const options = {
        filters: [
          { services: [C.SPIKE_SERVICE_UUID] },
          { services: [C.LEGO_HUB_SERVICE_UUID] },
        ],
        optionalServices: [C.SPIKE_SERVICE_UUID, C.LEGO_HUB_SERVICE_UUID],
      };
      this._device = await navigator.bluetooth.requestDevice(options);
      const name = this._device.name || 'Hub';
      this.connectedName = name;
      return {
        id: this._device.id || name,
        name: name,
        kind: name.toLowerCase().indexOf('spike') >= 0 ? 'spike' : 'hub',
        is_prime: true,
      };
    }

    // ----- connect -----------------------------------------------------
    async connect() {
      await this.disconnect();
      if (!this._device) throw new Error('Scan first');
      this.onLogInfo('Connecting...');
      this._server = await timedout(
        this._device.gatt.connect(), C.CONNECT_TIMEOUT);
      await this._discoverChars();
      if (this._hubChar) {
        this._protocol = 'lwp3';
      } else if (this._rxChar && this._txChar) {
        this._protocol = 'prime';
      } else {
        throw new Error('Hub does not expose a known LEGO interface');
      }
      this._connected = true;
      this._bridgeLoaded = false;
      this._pending = {};

      if (this._protocol === 'prime') {
        const ok = await this._prepareBridge();
        if (!ok) throw new Error('Failed to install the motor bridge on the hub.');
        this.onLogInfo(`Connected to ${this.connectedName || 'Hub'} (SPIKE Prime)`);
      } else {
        this.onLogInfo(`Connected to ${this.connectedName || 'Hub'} (LWP3)`);
      }
      return true;
    }

    async _discoverChars() {
      this._hubChar = null;
      this._rxChar = null;
      this._txChar = null;
      try {
        const service = await this._server.getPrimaryService(C.SPIKE_SERVICE_UUID);
        this._rxChar = await service.getCharacteristic(C.SPIKE_RX_UUID);
        this._txChar = await service.getCharacteristic(C.SPIKE_TX_UUID);
        await this._txChar.startNotifications();
        this._txChar.addEventListener('characteristicvaluechanged',
          (ev) => this._onPrimeData(ev.target.value));
        return;
      } catch (e) {
        // not a prime hub - fall through to the LWP3 service
      }
      try {
        const service = await this._server.getPrimaryService(C.LEGO_HUB_SERVICE_UUID);
        this._hubChar = await service.getCharacteristic(C.LEGO_HUB_CHARACTERISTIC_UUID);
      } catch (e) { /* none */ }
    }

    // ----- RX handling -------------------------------------------------
    _onPrimeData(view) {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      for (const b of bytes) this._rxBuffer.push(b);
      // frames end with the 0x02 delimiter; reassemble any cut values
      while (this._rxBuffer.length) {
        const idx = this._rxBuffer.indexOf(C.DELIMITER);
        if (idx < 0) break;
        const frame = this._rxBuffer.splice(0, idx + 1);
        this._handleFrame(frame);
      }
    }

    _handleFrame(frame) {
      let payload;
      try { payload = unpackPrimeFrame(frame); } catch (e) { return; }
      if (!payload || !payload.length) return;
      const msgType = payload[0];
      const pending = this._pending[msgType];
      if (pending) {
        delete this._pending[msgType];
        if (pending.timer) clearTimeout(pending.timer);
        try { pending.resolve(payload); } catch (e) {}
        return;
      }
      if (msgType === C.PRIME_MSG_CONSOLE) {
        const text = bytesToString(payload.slice(1)).replace(/\0+$/, '');
        if (text) this.onLogInfo('hub> ' + text);
      } else if (msgType === C.PRIME_MSG_TUNNEL ||
                 msgType === C.PRIME_MSG_TUNNEL_RESPONSE) {
        this._handleTunnelPayload(payload);
      }
    }

    _handleTunnelPayload(payload) {
      const body = payload.slice(1);
      const candidates = [body];
      if (body.length >= 2) {
        const sz = body[0] | (body[1] << 8);
        if (sz >= 0 && sz <= body.length - 2) candidates.unshift(body.slice(2, 2 + sz));
      }
      for (const text of candidates) {
        const decoded = bytesToString(text).replace(/\0+$/, '').trim();
        if (!decoded) continue;
        if (decoded.startsWith('attach:')) { this._storeMotors(decoded); break; }
        if (decoded.startsWith('state:')) { this._storeState(decoded); break; }
        this.onLogInfo(`hub> tunnel: ${JSON.stringify(decoded)}`);
        break;
      }
    }

    _storeState(text) {
      const state = {};
      for (const piece of text.slice(6).split(',')) {
        if (!piece.includes('=')) continue;
        const [key, raw] = piece.split('=');
        const v = parseInt(parseFloat(raw), 10);
        if (isNaN(v)) continue;
        const k = key.trim().toUpperCase();
        if (k === 'B') state.battery = v;
        else if (k === 'T') state.temperature = v;
        else if (k.length === 1 && 'ABCDEF'.includes(k)) state[k] = v;
      }
      this._state = state;
      if (this.onState) { try { this.onState(state); } catch (e) {} }
    }

    _storeMotors(text) {
      const motors = {};
      for (const piece of text.slice(7).split(',')) {
        if (!piece.includes('=')) continue;
        const [letter, raw] = piece.split('=');
        const v = parseInt(raw, 10);
        if (!isNaN(v)) motors[letter.trim().toUpperCase()] = v;
      }
      this._motors = motors;
      const attached = Object.keys(motors).filter((l) => motors[l] > 0).sort();
      if (attached.length) {
        this.onLogInfo('Motors detected: ' + attached
          .map((l) => `${l} (id ${motors[l]})`).join(', '));
      } else {
        this.onLogInfo('Motors detected: none');
      }
      const missing = this.profile.all_ports
        .filter((p) => (motors[p] == null ? -1 : motors[p]) <= 0);
      if (missing.length) {
        this.onLogInfo('Check motors: no device detected on configured port(s) ' +
          missing.join(', ') + ' - plug in a motor and reconnect.');
      }
      if (this.onAttach) { try { this.onAttach(motors); } catch (e) {} }
    }

    // ----- writes ------------------------------------------------------
    _writePacketSize() {
      let mtu = 0;
      try { mtu = this._device.gatt ? 0 : 0; } catch (e) {}
      return Math.max(20, this._maxPacketSize);
    }

    async _writeRx(data) {
      if (!this._rxChar) return;
      const size = this._writePacketSize();
      for (let i = 0; i < data.length; i += size) {
        await this._rxChar.writeValueWithoutResponse(data.slice(i, i + size));
      }
    }

    async _writeFrame(data) {
      if (!this._connected) return;
      if (this._protocol === 'lwp3' && this._hubChar) {
        await this._hubChar.writeValueWithoutResponse(data);
      } else if (this._protocol === 'prime' && this._rxChar) {
        await this._writeRx(data);
      }
    }

    _primeMessage(data) { return packPrimeMessage(data); }
    _primeTunnel(cmd) {
      const payload = new Uint8Array(3 + cmd.length);
      payload[0] = C.PRIME_MSG_TUNNEL;
      payload[1] = cmd.length & 0xFF;
      payload[2] = (cmd.length >> 8) & 0xFF;
      payload.set(cmd, 3);
      return this._primeMessage(payload);
    }

    _sendReq(data, expected, timeoutMs) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          delete this._pending[expected];
          resolve(null);
        }, timeoutMs || 4000);
        this._pending[expected] = { resolve, timer };
        this._writeFrame(this._primeMessage(data)).catch(() => {});
      });
    }

    // ----- bridge upload ----------------------------------------------
    async _prepareBridge() {
      if (this._bridgeLoaded) return true;
      this.onLogInfo('Installing motor bridge on hub (step 1/5: handshake)...');

      let info = await this._sendReq(new Uint8Array([0x00]), C.PRIME_MSG_INFO_RESPONSE, 4000);
      if (info === null || info.length < 17) {
        this.onLogInfo('No InfoResponse from hub.');
        return false;
      }
      const dv = new DataView(info.buffer, info.byteOffset, info.byteLength);
      const fw_major = dv.getUint8(4), fw_minor = dv.getUint8(5), fw_build = dv.getUint8(6);
      const max_packet = dv.getUint16(7, true);
      const max_message = dv.getUint16(9, true);
      const max_chunk = dv.getUint16(11, true);
      this._maxPacketSize = max_packet || 200;
      this._maxChunkSize = max_chunk || 128;
      this.onLogInfo(`Hub info: fw ${fw_major}.${fw_minor}.${fw_build} ` +
        `max_packet=${this._maxPacketSize} max_chunk=${this._maxChunkSize}`);

      this.onLogInfo('Bridge step 2/5: clearing program slot...');
      let resp = await this._sendReq(
        new Uint8Array([C.PRIME_MSG_CLEAR_SLOT, C.PROGRAM_SLOT]),
        C.PRIME_MSG_CLEAR_SLOT_RESPONSE, 4000);
      if (resp !== null && resp[1] !== 0x00) {
        this.onLogInfo('ClearSlot not acknowledged (slot may be empty).');
      }

      this.onLogInfo('Bridge step 3/5: starting file upload...');
      const script = new TextEncoder().encode(C.HUB_BRIDGE_SCRIPT);
      const fullCrc = crc32Padded(script, 0);
      const nameBytes = new TextEncoder().encode('program.py\u0000');
      const start = new Uint8Array(1 + nameBytes.length + 1 + 4);
      start[0] = C.PRIME_MSG_START_FILE_UPLOAD;
      start.set(nameBytes, 1);
      start[1 + nameBytes.length] = C.PROGRAM_SLOT;
      const dv2 = new DataView(start.buffer);
      dv2.setUint32(1 + nameBytes.length + 1, fullCrc, true);
      resp = await this._sendReq(start, C.PRIME_MSG_START_FILE_UPLOAD_RESPONSE, 4000);
      if (resp === null || resp[1] !== 0x00) {
        this.onLogInfo('StartFileUpload not acknowledged.');
        return false;
      }

      let runningCrc = 0;
      const total = Math.ceil(script.length / this._maxChunkSize);
      for (let i = 0; i < script.length; i += this._maxChunkSize) {
        const idx = i / this._maxChunkSize;
        this.onLogInfo(`Bridge step 4/5: uploading chunk ${idx + 1}/${total}...`);
        const chunk = script.slice(i, i + this._maxChunkSize);
        runningCrc = crc32Padded(chunk, runningCrc);
        const payload = new Uint8Array(1 + 4 + 2 + chunk.length);
        payload[0] = C.PRIME_MSG_TRANSFER_CHUNK;
        const dvc = new DataView(payload.buffer);
        dvc.setUint32(1, runningCrc, true);
        dvc.setUint16(5, chunk.length, true);
        payload.set(chunk, 7);
        let acked = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          resp = await this._sendReq(payload, C.PRIME_MSG_TRANSFER_CHUNK_RESPONSE, 10000);
          if (resp !== null && resp[1] === 0x00) { acked = true; break; }
          this.onLogInfo(`Chunk ${idx + 1} attempt ${attempt + 1} not acknowledged; retrying.`);
        }
        if (!acked) { this.onLogInfo(`Chunk transfer ${idx + 1} failed.`); return false; }
      }

      this.onLogInfo('Bridge step 5/5: starting program...');
      resp = await this._sendReq(
        new Uint8Array([C.PRIME_MSG_PROGRAM_FLOW, 0x00, C.PROGRAM_SLOT]),
        C.PRIME_MSG_PROGRAM_FLOW_RESPONSE, 4000);
      if (resp === null || resp[1] !== 0x00) {
        this.onLogInfo('ProgramFlow not acknowledged.');
        return false;
      }

      await sleep(500);
      this._bridgeLoaded = true;
      this.onLogInfo('Motor bridge installed and running.');
      for (const probe of ['P1', 'P2', 'P3']) {
        await this._writeFrame(this._primeTunnel(new TextEncoder().encode(probe)));
        this.onLogInfo(`Tunnel probe sent: ${probe}`);
      }
      await this._writeFrame(this._primeTunnel(new TextEncoder().encode('st?')));
      return true;
    }

    // ----- LWP3 --------------------------------------------------------
    _lwp3MotorFrame(port, speed) {
      const pid = C.LWP3_PORT_IDS[normPort(port)];
      const payload = [
        pid,
        C.LWP3_START_IMMEDIATE | C.LWP3_END_NO_ACTION,
        C.LWP3_PORT_OUTPUT_WRITE_DIRECT_MODE_DATA,
        C.LWP3_MOTOR_MODE_SPEED,
        speed & 0xFF,
      ];
      const length = 3 + payload.length;
      return new Uint8Array([length, 0x00, C.LWP3_MSG_PORT_OUTPUT_CMD, ...payload]);
    }

    // ----- motor commands ----------------------------------------------
    async startMotor(port, speed, log = true) {
      const letter = normPort(port);
      speed = clamp(round(speed), -100, 100);
      speed = this.profile.effective_speed(letter, speed);
      if (!this._connected || !this._protocol) return;
      if (log) this.onLogInfo(`Motor command: ${letter}=${speed}`);
      if (this._protocol === 'lwp3') {
        await this._writeFrame(this._lwp3MotorFrame(letter, speed));
      } else {
        const cmd = `1${letter}${speed >= 0 ? '+' : '-'}${String(Math.abs(speed)).padStart(3, '0')}`;
        await this._writeFrame(this._primeTunnel(new TextEncoder().encode(cmd)));
      }
    }

    async stopMotor(port) { await this.startMotor(port, 0, false); }

    async drive(leftSpeed, rightSpeed, backSpeed) {
      leftSpeed = clamp(round(leftSpeed || 0), -100, 100);
      rightSpeed = clamp(round(rightSpeed || 0), -100, 100);
      backSpeed = clamp(round(backSpeed == null ? 0 : backSpeed), -100, 100);
      if (!this._connected || !this._protocol) return;

      const profile = this.profile;
      const slots = [];
      profile.left_ports.forEach((p) => slots.push([p, leftSpeed]));
      profile.right_ports.forEach((p) => slots.push([p, rightSpeed]));
      if (profile.mode === '4WD') {
        profile.back_ports.forEach((p) => { if (p) slots.push([p, backSpeed]); });
      }

      if (this._protocol === 'lwp3') {
        for (const [port, sp] of slots) {
          await this._writeFrame(
            this._lwp3MotorFrame(port, this.profile.effective_speed(port, sp)));
        }
      } else {
        const parts = slots.map(([port, sp]) => {
          const e = this.profile.effective_speed(port, sp);
          return `${port}${e >= 0 ? '+' : '-'}${String(Math.abs(e)).padStart(3, '0')}`;
        });
        const cmd = String(parts.length) + parts.join('');
        await this._writeFrame(this._primeTunnel(new TextEncoder().encode(cmd)));
      }
      this.onLogInfo('Motor command: ' +
        slots.map(([p, sp]) => `${p}=${this.profile.effective_speed(p, sp)}`).join(' '));
    }

    async stop() { await this.drive(0, 0); }
    state() { return this._state; }

    // ----- disconnect --------------------------------------------------
    async disconnect() {
      if (this._connected) {
        try { await this.drive(0, 0); } catch (e) {}
        await sleep(50);
      }
      this._connected = false;
      this._protocol = null;
      for (const key of Object.keys(this._pending)) {
        clearTimeout(this._pending[key].timer);
      }
      this._pending = {};
      try {
        if (this._txChar) await this._txChar.stopNotifications();
      } catch (e) {}
      try {
        if (this._server && this._device) await this._device.gatt.disconnect();
      } catch (e) {}
      this._server = null;
      this._rxChar = null;
      this._txChar = null;
      this._hubChar = null;
      this._bridgeLoaded = false;
      this._rxBuffer = [];
    }
  }

  // ---- helpers --------------------------------------------------------
  function bytesToString(bytes) {
    // TextDecoder decodes the utf-8 ASCII hub messages fine.
    try { return new TextDecoder('utf-8').decode(bytes); }
    catch (e) { return ''; }
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v) { return Math.round(v); }

  function timedout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out connecting (is the Hub on and in range?)')), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); });
    });
  }

  // ---- export ---------------------------------------------------------
  global.SPIKE = {
    WebSpikeHub,
    DriveProfile,
    packPrimeMessage,
    unpackPrimeFrame,
    crc32,
    crc32Padded,
    normPort,
    helpers: { sleep, bytesToString },
  };
})(typeof window !== 'undefined' ? window : globalThis);