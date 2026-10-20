// ==========================================================================
// Block Studio page controller (module)
// ==========================================================================
// Purpose : drives the whole block-code page: Blockly workspace, hub connection UI, save/load panel, run/stop, and sound phrases.
// Depends : js/config.js (CONFIG global) — classic script
// Depends : js/hub/spike-hub.js (SPIKE global) — classic script
// Depends : js/save_loader.js (OpenSpike global) — classic script
// Depends : vendor/blockly/* (Blockly global) — classic scripts
// Depends : js/engine/index.js (Engine, parseWorkspace) — ES module
// Exports : none (side-effect module — wires the page and starts it)
//
// Loaded via <script type="module">, so it is deferred until the DOM
// exists and its top-level scope is private (nothing leaks to window).
// ---------------------------------------------------------------------

import { Engine, parseWorkspace } from '../engine/index.js';

// -- Web bridge: Block Studio runs 100% in the browser. The hub talks over
//    Web Bluetooth (Chrome / Edge / Safari 17+ on a Mac), the engine runs in
//    JS, and saves live in localStorage. The `py` object keeps the same async
//    interface the old pywebview bridge exposed so the UI below is unchanged.
const hub = new SPIKE.WebSpikeHub();
let engine = null;

// Diagnostic log: js/log.js installs window.BSLOG as a classic script before
// this module loads, so load-time failures are already captured. Fall back to
// no-ops so the page still works if the logger is missing or blocked.
const log = window.BSLOG || {
  debug() {}, info() {}, warn() {}, error() {}, log() {},
  entries() { return []; }, onEntry() {}, setContext() {}, clear() {},
  download() {}, text() { return ''; }, toJson() { return '{}'; },
};

// Surprise link loss: halt programs, refresh the header, say so.
hub.onDisconnect = () => {
  log.warn('hub: disconnected unexpectedly');
  try { if (engine) engine.stop(); } catch (e) { log.error('engine stop on disconnect failed', e); }
  try { refreshHeader(); } catch (e) { log.error('refreshHeader on disconnect failed', e); }
  setStatus('Hub disconnected — reconnect to continue.');
};

// Everything the hub reports (connect progress, motor bridge steps, commands).
hub.onLog = (msg) => log.info('hub: ' + msg);
hub.onAttach = (motors) => log.info('hub: motors attached', motors);

function webLog(text) {
  setStatus(text);
  log.info('engine: ' + text);
}

// WebAudio beeper used by sound/beep blocks (created on first user gesture).
let _actx = null;
function tone(freq, secs) {
  try {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = _actx.currentTime;
    const osc = _actx.createOscillator();
    const gain = _actx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq || 880;
    gain.gain.setValueAtTime(0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.05, secs || 0.2));
    osc.connect(gain).connect(_actx.destination);
    osc.start(t0);
    osc.stop(t0 + Math.max(0.05, secs || 0.2) + 0.05);
  } catch (e) { log.warn('sound: tone failed', e); }
}

// Named-sound phrases: each sound is a short gesture of glide segments
// [freqFrom, freqTo, seconds, waveType?]. [0,0,rest] is silence. Returns
// the total seconds scheduled (0 when the name is unknown).
const SOUND_PHRASES = {
  'Cat Meow 1': [[600, 900, 0.16], [900, 550, 0.28]],
  'Cat Meow 2': [[650, 950, 0.12], [0, 0, 0.04], [750, 950, 0.12]],
  'Dog Bark 1': [[190, 120, 0.11, 'square'], [0, 0, 0.05], [190, 120, 0.11, 'square']],
  'Dog Bark 2': [[170, 110, 0.09, 'square'], [0, 0, 0.04], [170, 110, 0.09, 'square'], [0, 0, 0.04], [170, 110, 0.09, 'square']],
  'Elephant Call': [[200, 85, 0.6]],
  'Mimic Bear': [[130, 95, 0.2], [95, 135, 0.2]],
  'Mimic T-Rex': [[280, 70, 0.55]],
  'Mimic Mouse': [[1300, 1700, 0.07], [0, 0, 0.03], [1300, 1700, 0.07], [0, 0, 0.03], [1300, 1700, 0.07]],
  'Pig Oink': [[260, 170, 0.1], [0, 0, 0.04], [240, 170, 0.1]],
  'Rabbit Squeak': [[950, 1500, 0.16]],
  'Roar': [[110, 320, 0.5]],
  'Woof': [[210, 120, 0.14, 'square']],
  'Whistle': [[880, 880, 0.14], [1175, 1175, 0.22]],
};
function playSoundPhrase(name) {
  const phrase = SOUND_PHRASES[String(name || '')];
  if (!phrase) return 0;
  try {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    let t = _actx.currentTime + 0.02;
    for (const seg of phrase) {
      const f0 = seg[0], f1 = seg[1], d = Math.max(0.03, seg[2] || 0.1);
      if (f0 > 0) {
        const osc = _actx.createOscillator();
        const gain = _actx.createGain();
        osc.type = seg[3] || 'sine';
        osc.frequency.setValueAtTime(Math.max(30, f0), t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1 || f0), t + d);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
        osc.connect(gain).connect(_actx.destination);
        osc.start(t);
        osc.stop(t + d + 0.02);
      }
      t += d + 0.015;
    }
    return Math.round((t - _actx.currentTime) * 100) / 100;
  } catch (e) { log.warn('sound: phrase "' + name + '" failed', e); return 0; }
}

// Official recordings bundled under sounds/ (only these four exist;
// everything else falls back to the synth gestures above).
const SOUND_FILES = {
  'Cat Meow 1': 'sounds/cat-meow-1.mp3',
  'Cat Meow 2': 'sounds/cat-meow-2.mp3',
  'Dog Bark 1': 'sounds/dog-bark-1.mp3',
  'Dog Bark 2': 'sounds/dog-bark-2.mp3',
};
const _soundBuffers = {};
async function playSoundFile(name, vol) {
  const url = SOUND_FILES[String(name || '')];
  if (!url) return 0;
  try {
    if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === 'suspended') { try { await _actx.resume(); } catch (e) { log.warn('sound: AudioContext resume failed', e); } }
    let buf = _soundBuffers[url];
    if (!buf) {
      const resp = await fetch(url);
      if (!resp.ok) {
        log.warn('sound: fetch failed (' + resp.status + ') ' + url);
        return 0;
      }
      buf = await _actx.decodeAudioData(await resp.arrayBuffer());
      _soundBuffers[url] = buf;
      log.info('sound: loaded ' + url);
    }
    const src = _actx.createBufferSource();
    src.buffer = buf;
    const gain = _actx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, vol == null ? 1 : vol)) * 0.9;
    src.connect(gain).connect(_actx.destination);
    src.start();
    return Math.round(buf.duration * 100) / 100;
  } catch (e) { log.warn('sound: playback failed for ' + url, e); return 0; }
}

function loadEngine() {
  if (engine) return;
  engine = new Engine(hub, {
    log: webLog,
    tone: tone,
    toneFile: playSoundFile,
    tonePhrase: playSoundPhrase,
    bell: () => tone(880, 0.12),
    lightCb: (c) => setLight(c || undefined),
  });
}

// Web Bluetooth has no background scan list: SCAN opens the OS chooser, which
// doubles as the scan. Requests always funnel through a single pending op so
// double-clicks can't open two choosers.
let __busy = false;
async function __guarded(fn) {
  if (__busy) return;
  __busy = true;
  try {
    // Watchdog: a hung Bluetooth op must never wedge Scan/Connect/
    // Disconnect forever — give up the lock after 20 s either way.
    await Promise.race([
      fn(),
      new Promise((r) => setTimeout(r, 20000)),
    ]);
  } finally { __busy = false; }
}

const py = {
  run: async (d) => {
    loadEngine();
    log.info('run: starting program');
    const program = parseWorkspace(d);
    engine.run(program);
    return 'Started';
  },
  stop: async () => { log.info('stop: requested'); if (engine) engine.stop(); return 'Stopped'; },

  scan_hub: async () => [],
  connect_hub: async () => 'stub',

  start_scan: async () => {
    await __guarded(async () => {
      const status = document.getElementById('connStatus');
      if (status) status.textContent = 'Choose your Hub in the popup...';
      try {
        const dev = await hub.pickDevice();
        log.info('scan: device chosen', dev);
        window.__connPush('scan', [dev]);
      } catch (e) {
        log.error('scan: cancelled or failed', e);
        if (status) status.textContent = 'Scan cancelled or failed: ' + (String(e && e.message || e));
        const btn = document.getElementById('scanBtn');
        if (btn) btn.disabled = false;
      }
    });
  },

  start_connect: async () => {
    await __guarded(async () => {
      try {
        await hub.connect();
        log.info('connect: success');
        window.__connPush('connect', 'connected: ' + (hub.connectedName || 'Hub'));
      } catch (e) {
        log.error('connect: failed', e);
        __connecting = false;
        window.__connPush('connect', 'Connect failed: ' + (String(e && e.message || e)));
      }
    });
  },

  start_disconnect: async () => {
    await __guarded(async () => { log.info('disconnect: requested'); await hub.disconnect(); refreshHeader(); });
  },

  hub_status: async () => ({
    connected: hub.is_connected,
    name: hub.connectedName || '',
    protocol: hub.protocol || null,
  }),

  light: async (c) => setLight(c),
  beep: async (f, d) => tone(f, d),

  save_as: async (d, name) => {
    const base = ((name || 'Untitled').trim() || 'Untitled').replace(/\.llsp3$/i, '');
    const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: base + '.llsp3',
          types: [{ description: 'SPIKE block program',
                    accept: { 'application/json': ['.llsp3', '.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        log.info('save: wrote file ' + handle.name);
        return { name: handle.name, path: handle.name, error: null };
      } catch (e) {
        if (e && e.name === 'AbortError') { log.info('save: file picker cancelled'); return { cancelled: true }; }
        log.warn('save: file picker failed, falling back to download', e);
        return saveAsBrowser(d, base);
      }
    }
    log.info('save: file picker unavailable, using download');
    return saveAsBrowser(d, base);
  },

  save_workspace: async (d, name) => {
    try {
      const key = 'bs_save_' + name;
      localStorage.setItem(key, JSON.stringify(d));
      log.info('save: stored "' + name + '" in browser');
      return { name: name };
    } catch (e) {
      log.error('save: browser storage failed', e);
      return { name: null, error: String(e) };
    }
  },
  load_workspace: async (name) => {
    try {
      const raw = localStorage.getItem('bs_save_' + name);
      if (raw == null) { log.warn('open: no saved program named "' + name + '"'); return { data: null, name: name, error: 'No such save' }; }
      log.info('open: loaded "' + name + '" from browser storage');
      return { data: JSON.parse(raw), name: name, error: null };
    } catch (e) {
      log.error('open: could not read "' + name + '"', e);
      return { data: null, name: name, error: String(e) };
    }
  },
  list_saves: async () => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('bs_save_')) out.push({ name: k.slice('bs_save_'.length) });
    }
    out.sort((a, b) => a.name < b.name ? -1 : 1);
    return out;
  },
};

// Route the Live keyboard into the JS engine while a program is running.
const CONTROLLED_KEYS = new Set(['space', 'up', 'down', 'left', 'right']);
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const name = canonicalKeyFromEvent(e);
  if (!name) return;
  if (engine && engine.running && CONTROLLED_KEYS.has(name)) e.preventDefault();
  if (e.repeat) return;
  if (engine) engine.pressKey(name);
});
window.addEventListener('keyup', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const name = canonicalKeyFromEvent(e);
  if (name && engine) engine.releaseKey(name);
});

// -- SPIKE palette (exact hex from lego-spike-simulator) -------------------
const C = {
  motor:      '#0090f5',
  movement:   '#ff4ccd',
  light:      '#9b6af6',
  sound:      '#c061f1',
  event:      '#f5c402',
  control:    '#ffb515',
  sensor:     '#3fccf1',
  operator:   '#00b94d',
  variable:   '#ff9835',
  myblock:    '#ff5d64',
  keyboard:   '#607d8b',
};

// -- Zelos-based theme ----------------------------------------------------
const spikeTheme = Blockly.Theme.defineTheme('spike', {
  base: Blockly.Themes.Zelos,
  name: 'spike',
  startHats: true,
  componentStyles: { workspaceBackgroundColour: '#f0f0f0' },
});

// -- Custom keyboard blocks (not in the simulator) -----------------------

Blockly.Blocks['keyboard_when_key_pressed'] = {
  init: function() {
    this.appendDummyInput().appendField('when').appendField(
      new KeyCaptureField(), 'KEY').appendField('pressed');
    this.appendStatementInput('DO').appendField('');
    this.setColour(C.keyboard);
    this.setTooltip('When this key is pressed');
  }
};

Blockly.Blocks['keyboard_while_key_pressed'] = {
  init: function() {
    this.appendDummyInput().appendField('while').appendField(
      new KeyCaptureField(), 'KEY').appendField('pressed');
    this.appendStatementInput('DO').appendField('');
    this.setColour(C.keyboard);
    this.setTooltip('Repeat while this key is held');
  }
};

Blockly.Blocks['keyboard_while_key_blank'] = {
  init: function() {
    this.appendValueInput('KEY').appendField('while');
    this.appendDummyInput().appendField('pressed');
    this.appendStatementInput('DO').appendField('');
    this.setColour(C.keyboard);
    this.setTooltip('Repeat while the key condition is true');
  }
};

Blockly.Blocks['keyboard_key_is_pressed'] = {
  init: function() {
    this.appendDummyInput().appendField('key').appendField(
      new KeyCaptureField(), 'KEY').appendField('pressed?');
    this.setOutput(true, 'Boolean');
    this.setColour(C.keyboard);
    this.setTooltip('Is this key currently pressed?');
  }
};

Blockly.Blocks['keyboard_drive_wasd'] = {
  init: function() {
    this.appendDummyInput().appendField('drive with WASD, speed')
      .appendField(new Blockly.FieldNumber(50, 0, 100, 1), 'SPEED')
      .appendField('motors')
      .appendField(new Blockly.FieldDropdown([
        ['A + B', 'AB'], ['C + D', 'CD'], ['E + F', 'EF'],
      ]), 'PAIR');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(C.keyboard);
    this.setTooltip('Drive using W/A/S/D keys. Choose which two motors steer.');
  }
};

// -- Spike while block (not in Blockly core) -------------------------------
Blockly.Blocks['spike_while'] = {
  init: function() {
    this.appendValueInput('COND').appendField('while');
    this.appendStatementInput('DO').appendField('');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(C.control);
  }
};

// -- Spike program starts hat (custom, different from simulator's) ---------
Blockly.Blocks['spike_when_program_starts'] = {
  init: function() {
    this.appendDummyInput().appendField('when program starts');
    this.appendStatementInput('DO').appendField('');
    this.setColour(C.event);
  }
};

// -- Spike while-key (custom hat for keyboard control) --------------------
// Note: keyboard_while_key_pressed defined above already

// -- Toolbox definition (full SPIKE categories) ---------------------------
const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'KEYBOARD', colour: C.keyboard,
      contents: [
        { kind: 'block', type: 'keyboard_when_key_pressed' },
        { kind: 'block', type: 'keyboard_while_key_pressed' },
        { kind: 'block', type: 'keyboard_while_key_blank' },
        { kind: 'block', type: 'keyboard_key_is_pressed' },
        { kind: 'block', type: 'keyboard_drive_wasd' },
      ]
    },
    {
      kind: 'category', name: 'EVENT', colour: C.event,
      contents: [
        { kind: 'block', type: 'spike_when_program_starts' },
        { kind: 'block', type: 'flipperevents_whenProgramStarts' },
        { kind: 'block', type: 'flipperevents_whenColor' },
        { kind: 'block', type: 'flipperevents_whenPressed' },
        { kind: 'block', type: 'flipperevents_whenDistance' },
        { kind: 'block', type: 'flipperevents_whenTilted' },
        { kind: 'block', type: 'flipperevents_whenOrientation' },
        { kind: 'block', type: 'flipperevents_whenGesture' },
        { kind: 'block', type: 'flipperevents_whenButton' },
        { kind: 'block', type: 'flipperevents_whenTimer' },
        { kind: 'block', type: 'flipperevents_whenCondition' },
        { kind: 'block', type: 'event_whenbroadcastreceived' },
        { kind: 'block', type: 'event_broadcast' },
        { kind: 'block', type: 'event_broadcastandwait' },
      ]
    },
    {
      kind: 'category', name: 'MOTOR', colour: C.motor,
      contents: [
        { kind: 'block', type: 'flippermotor_motorTurnForDirection' },
        { kind: 'block', type: 'flippermotor_motorGoDirectionToPosition' },
        { kind: 'block', type: 'flippermotor_motorStartDirection' },
        { kind: 'block', type: 'flippermotor_motorStop' },
        { kind: 'block', type: 'flippermotor_motorSetSpeed' },
        { kind: 'block', type: 'flippermotor_motorChangeSpeed' },
        { kind: 'block', type: 'flippermotor_absolutePosition' },
        { kind: 'block', type: 'flippermotor_speed' },
      ]
    },
    {
      kind: 'category', name: 'MOVEMENT', colour: C.movement,
      contents: [
        { kind: 'block', type: 'flippermove_move' },
        { kind: 'block', type: 'flippermove_startMove' },
        { kind: 'block', type: 'flippermove_steer' },
        { kind: 'block', type: 'flippermove_startSteer' },
        { kind: 'block', type: 'flippermove_stopMove' },
        { kind: 'block', type: 'flippermove_movementSpeed' },
        { kind: 'block', type: 'flippermove_setMovementPair' },
        { kind: 'block', type: 'flippermove_setDistance' },
      ]
    },
    {
      kind: 'category', name: 'LIGHT', colour: C.light,
      contents: [
        { kind: 'block', type: 'flipperlight_lightDisplayImageOnForTime' },
        { kind: 'block', type: 'flipperlight_lightDisplayImageOn' },
        { kind: 'block', type: 'flipperlight_lightDisplayText' },
        { kind: 'block', type: 'flipperlight_lightDisplayOff' },
        { kind: 'block', type: 'flipperlight_lightDisplaySetBrightness' },
        { kind: 'block', type: 'flipperlight_lightDisplaySetPixel' },
        { kind: 'block', type: 'flipperlight_lightDisplayRotate' },
        { kind: 'block', type: 'flipperlight_lightDisplaySetOrientation' },
        { kind: 'block', type: 'flipperlight_centerButtonLight' },
        { kind: 'block', type: 'flipperlight_ultrasonicLightUp' },
      ]
    },
    {
      kind: 'category', name: 'SOUND', colour: C.sound,
      contents: [
        { kind: 'block', type: 'flippersound_playSoundUntilDone' },
        { kind: 'block', type: 'flippersound_playSound' },
        { kind: 'block', type: 'flippersound_beepForTime' },
        { kind: 'block', type: 'flippersound_beep' },
        { kind: 'block', type: 'flippersound_stopSound' },
        { kind: 'block', type: 'sound_changeeffectby' },
        { kind: 'block', type: 'sound_seteffectto' },
        { kind: 'block', type: 'sound_cleareffects' },
        { kind: 'block', type: 'sound_changevolumeby' },
        { kind: 'block', type: 'sound_setvolumeto' },
        { kind: 'block', type: 'sound_volume' },
      ]
    },
    {
      kind: 'category', name: 'CONTROL', colour: C.control,
      contents: [
        { kind: 'block', type: 'control_wait',
          inputs: { DURATION: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } },
        { kind: 'block', type: 'control_repeat',
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } } },
        { kind: 'block', type: 'control_forever' },
        { kind: 'block', type: 'control_if' },
        { kind: 'block', type: 'control_if_else' },
        { kind: 'block', type: 'spike_while' },
        { kind: 'block', type: 'control_wait_until' },
        { kind: 'block', type: 'control_repeat_until' },
        { kind: 'block', type: 'flippercontrol_stopOtherStacks' },
        { kind: 'block', type: 'flippercontrol_stop' },
      ]
    },
    {
      kind: 'category', name: 'SENSOR', colour: C.sensor,
      contents: [
        { kind: 'block', type: 'flippersensors_isColor' },
        { kind: 'block', type: 'flippersensors_color' },
        { kind: 'block', type: 'flippersensors_isReflectivity' },
        { kind: 'block', type: 'flippersensors_reflectivity' },
        { kind: 'block', type: 'flippersensors_isPressed' },
        { kind: 'block', type: 'flippersensors_force' },
        { kind: 'block', type: 'flippersensors_isDistance' },
        { kind: 'block', type: 'flippersensors_distance' },
        { kind: 'block', type: 'flippersensors_isTilted' },
        { kind: 'block', type: 'flippersensors_isorientation' },
        { kind: 'block', type: 'flippersensors_ismotion' },
        { kind: 'block', type: 'flippersensors_orientationAxis' },
        { kind: 'block', type: 'flippersensors_resetYaw' },
        { kind: 'block', type: 'flippersensors_buttonIsPressed' },
        { kind: 'block', type: 'flippersensors_timer' },
        { kind: 'block', type: 'flippersensors_resetTimer' },
      ]
    },
    {
      kind: 'category', name: 'OPERATOR', colour: C.operator,
      contents: [
        { kind: 'block', type: 'operator_random' },
        { kind: 'block', type: 'operator_add' },
        { kind: 'block', type: 'operator_subtract' },
        { kind: 'block', type: 'operator_multiply' },
        { kind: 'block', type: 'operator_divide' },
        { kind: 'block', type: 'operator_lt' },
        { kind: 'block', type: 'operator_equals' },
        { kind: 'block', type: 'operator_gt' },
        { kind: 'block', type: 'operator_and' },
        { kind: 'block', type: 'operator_or' },
        { kind: 'block', type: 'operator_not' },
        { kind: 'block', type: 'flipperoperator_isInBetween' },
        { kind: 'block', type: 'operator_join' },
        { kind: 'block', type: 'operator_letter_of' },
        { kind: 'block', type: 'operator_length' },
        { kind: 'block', type: 'operator_contains' },
        { kind: 'block', type: 'operator_mod' },
        { kind: 'block', type: 'operator_round' },
        { kind: 'block', type: 'operator_mathop' },
      ]
    },
    {
      kind: 'category', name: 'MORE-MOTOR', colour: C.motor,
      contents: [
        { kind: 'block', type: 'flippermoremotor_motorGoToRelativePosition' },
        { kind: 'block', type: 'flippermoremotor_motorStartPower' },
        { kind: 'block', type: 'flippermoremotor_motorSetStopMethod' },
        { kind: 'block', type: 'flippermoremotor_motorSetAcceleration' },
        { kind: 'block', type: 'flippermoremotor_motorSetDegreeCounted' },
        { kind: 'block', type: 'flippermoremotor_power' },
        { kind: 'block', type: 'flippermoremotor_position' },
      ]
    },
    {
      kind: 'category', name: 'MORE-MOVEMENT', colour: C.movement,
      contents: [
        { kind: 'block', type: 'flippermoremove_movementSetStopMethod' },
        { kind: 'block', type: 'flippermoremove_startDualSpeed' },
        { kind: 'block', type: 'flippermoremove_movementSetAcceleration' },
      ]
    },
    {
      kind: 'category', name: 'MORE-SENSOR', colour: C.sensor,
      contents: [
        { kind: 'block', type: 'flippermoresensors_setOrientation' },
        { kind: 'block', type: 'flippermoresensors_rawColor' },
        { kind: 'block', type: 'flippermoresensors_acceleration' },
        { kind: 'block', type: 'flippermoresensors_angularVelocity' },
        { kind: 'block', type: 'flippermoresensors_orientation' },
        { kind: 'block', type: 'flippermoresensors_motion' },
      ]
    },
    {
      kind: 'category', name: 'VARIABLES', colour: C.variable, custom: 'VARIABLE',
    },
    {
      kind: 'category', name: 'MY BLOCKS', colour: C.myblock, custom: 'PROCEDURE',
    },
  ]
};

// -- Workspace init -------------------------------------------------------
let workspace;
document.addEventListener('DOMContentLoaded', function() {
  workspace = Blockly.inject('blocklyDiv', {
    toolbox: toolbox,
    theme: spikeTheme,
    renderer: 'zelos',
    scrollbars: true,
    trashcan: true,
    zoom: { controls: true, startScale: 0.9 },
    grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
    sounds: false,
  });

  // Add default "when program starts" block
  const xml = Blockly.utils.xml.textToDom(
    '<xml><block type="spike_when_program_starts" x="20" y="20"><statement name="DO"><block type="keyboard_drive_wasd"><field name="SPEED">50</field></block></statement></block></xml>'
  );
  Blockly.Xml.domToWorkspace(xml, workspace);

  // Let the saved log include whatever is on the canvas at the time.
  log.setContext(() => Blockly.serialization.workspaces.save(workspace));
  log.info('workspace: Blockly injected');
  workspace.addChangeListener(onWorkspaceChange);

  // Every block — including the "when" hats — may be deleted. Old saves may
  // still carry deletable:false, so normalise after any load.
  normalizeWorkspaceBlocks();

  // Delete/Backspace deletes the selected block, even when the editor canvas
  // hasn't got keyboard focus.
  document.getElementById('blocklyDiv').addEventListener('keydown', onEditorKeyDown);

  // Show the connection popup on launch so it is easy to find.
  refreshHeader();
  setTimeout(openConn, 600);
});

// -- Workspace change logging ----------------------------------------------
// Records edits (create / delete / move / change / variables) but ignores UI
// noise such as scrolling or viewport changes, so the log stays readable.
function onWorkspaceChange(ev) {
  try {
    if (!ev || ev.isUiEvent) return;
    const typeOf = (id) => {
      const b = workspace && workspace.getBlockById ? workspace.getBlockById(id) : null;
      return b ? b.type : id;
    };
    if (ev.type === Blockly.Events.BLOCK_CREATE) {
      const ids = ev.ids || (ev.blockId ? [ev.blockId] : []);
      log.info('blocks: added ' + (ids.map(typeOf).join(', ') || '(unknown)'));
    } else if (ev.type === Blockly.Events.BLOCK_DELETE) {
      const t = ev.oldJson && ev.oldJson.type ? ev.oldJson.type : typeOf(ev.blockId);
      log.info('blocks: deleted ' + t);
    } else if (ev.type === Blockly.Events.BLOCK_MOVE) {
      log.debug('blocks: moved ' + typeOf(ev.blockId));
    } else if (ev.type === Blockly.Events.BLOCK_CHANGE) {
      log.debug('blocks: changed ' + typeOf(ev.blockId) +
        (ev.element ? ' ' + ev.element : '') + (ev.name ? ' ' + ev.name : ''));
    } else if (ev.type === Blockly.Events.VAR_CREATE || ev.type === Blockly.Events.VAR_DELETE ||
               ev.type === Blockly.Events.VAR_RENAME) {
      log.info('variables: ' + ev.type + ' "' + (ev.varName || '') + '"');
    }
  } catch (e) {
    log.error('workspace listener failed', e);
  }
}

// -- Actions --------------------------------------------------------------
function doRun() {
  let json;
  try {
    json = Blockly.serialization.workspaces.save(workspace);
  } catch (e) {
    log.error('run: could not read blocks', e);
    setStatus('Could not read blocks: ' + (e && e.message || e));
    return;
  }
  log.info('run: button pressed');
  Promise.resolve(py.run(json)).then(
    (r) => setStatus(typeof r === 'string' ? r : 'Started'),
    (e) => { log.error('run: failed', e); setStatus('Run failed: ' + (e && e.message || e)); });
}
function doStop() { log.info('stop: button pressed'); py.stop().then(() => setStatus('Stopped'), (e) => { log.error('stop: failed', e); setStatus('Stop failed: ' + (e && e.message || e)); }); }
function doSave() { log.info('save: panel opened'); openSavePanel(); }

// -- Block editing helpers -------------------------------------------------
function normalizeWorkspaceBlocks() {
  if (!workspace) return;
  const blocks = workspace.getAllBlocks(false);
  for (const b of blocks) {
    if (typeof b.setDeletable === 'function') b.setDeletable(true);
  }
}

function deleteSelectedBlock() {
  const sel = typeof Blockly.getSelected === 'function' ? Blockly.getSelected() : null;
  const b = sel ? (typeof sel.getSourceBlock === 'function' ? sel.getSourceBlock() : sel) : null;
  if (!b || typeof b.isDeletable !== 'function' || !b.isDeletable() || b.isShadow()) return false;
  b.dispose(true);
  return true;
}

function onEditorKeyDown(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (deleteSelectedBlock()) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// Replace the current canvas with a loaded program state.
function loadWorkspaceState(state, label) {
  if (!state || !state.blocks) {
    log.warn('open: file has no program blocks (' + label + ')');
    setStatus('This file has no program blocks.');
    return;
  }
  workspace.clear();
  workspace.clearUndo();
  try {
    Blockly.serialization.workspaces.load(state, workspace);
  } catch (err) {
    log.error('open: could not load program (' + label + ')', err);
    setStatus('Could not load program: ' + (err && err.message || err));
    return;
  }
  normalizeWorkspaceBlocks();
  log.info('open: loaded program "' + label + '"');
  setStatus('Opened: ' + label);
  closeSavePanel();
}

// Load a program from a user-picked file (.llsp3, .sb3 or .json).
function loadProgramFile(file) {
  log.info('open: reading file "' + file.name + '"');
  file.arrayBuffer().then((buf) => {
    const res = OpenSpike.loadProgramFromBytes(buf);
    return Promise.resolve(res).then((out) => {
      if (out.error) { log.warn('open: ' + out.error); setStatus(out.error); return; }
      let extra = [];
      if (out.json && Array.isArray(out.json.targets)) {
        const conv = OpenSpike.sb3ToBlocklyState(out.json);
        if (conv.error) { log.warn('open: ' + conv.error); setStatus(conv.error); return; }
        loadWorkspaceState(conv.state, file.name + ' (SPIKE app save)');
        extra = conv.warnings || extra;
        if (conv.skipped && conv.skipped.length) {
          extra.push('Skipped unsupported blocks: ' + conv.skipped.join(', '));
          log.warn('open: skipped blocks', conv.skipped);
        }
      } else if (out.json && out.json.blocks) {
        loadWorkspaceState(out.json, file.name);
      } else {
        log.warn('open: unrecognized program file "' + file.name + '"');
        setStatus('Unrecognized program file.');
        return;
      }
      if (extra.length) log.info('open: warnings', extra);
      if (extra.length) {
        const sc = document.getElementById('saveStatus');
        if (sc && !sc.classList.contains('hidden')) sc.textContent = extra.join(' ');
        else setStatus('Opened: ' + file.name + ' — ' + extra.join(' '));
      }
    });
  }, (err) => {
    log.error('open: could not read file "' + file.name + '"', err);
    setStatus('Could not read file: ' + (err && err.message || err));
  });
}

// Fallback "save as" from the browser: download the file to a chosen location.
function saveAsBrowser(data, suggestedName) {
  const name = ((suggestedName || 'Untitled').trim() || 'Untitled') + '.llsp3';
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return Promise.resolve({ name: name, path: name, error: null });
}

let lastSaveName = 'Untitled';

function openSavePanel() {
  document.getElementById('saveOverlay').classList.remove('hidden');
  document.getElementById('saveTitle').textContent = 'Save program';
  document.getElementById('saveStatus').textContent = '';
  document.getElementById('saveOkBtn').style.display = '';
  document.getElementById('saveOkBtn').textContent = 'Save';
  const asBtn = document.getElementById('saveAsBtn');
  if (asBtn) asBtn.style.display = '';
  const body = document.getElementById('saveBody');
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'saveFieldRow';
  const input = document.createElement('input');
  input.id = 'saveName';
  input.type = 'text';
  input.placeholder = 'Program name';
  input.value = lastSaveName;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishSave(); });
  const hint = document.createElement('div');
  hint.className = 'saveHint';
  hint.textContent = 'Save keeps it in this browser. Save As\u2026 writes a file you can keep anywhere \u2014 and open again with \u201cLoad from file\u2026\u201d.';
  wrap.appendChild(input);
  wrap.appendChild(hint);
  body.appendChild(wrap);
  setTimeout(() => input.focus(), 50);
  document.getElementById('saveName').select();
}

function finishSaveAs() {
  const input = document.getElementById('saveName');
  const name = (input && input.value.trim()) || 'Untitled';
  lastSaveName = name.replace(/\.llsp3$/i, '');
  const json = Blockly.serialization.workspaces.save(workspace);
  py.save_as(json, lastSaveName).then((r) => {
    if (r && r.cancelled) {
      contentSet('saveStatus', 'Save cancelled');
      return;
    }
    const n = (r && r.name) || (lastSaveName + '.llsp3');
    const p = r && r.path;
    setStatus('Saved: ' + n + (p && p !== n ? ' \u2192 ' + p : ''));
    closeSavePanel();
  }, (e) => { log.error('save: Save As failed', e); contentSet('saveStatus', 'Save failed: ' + (e && e.message || e)); });
}

function finishSave() {
  const input = document.getElementById('saveName');
  const name = (input && input.value.trim()) || 'Untitled';
  lastSaveName = name.replace(/\.llsp3$/i, '');
  const json = Blockly.serialization.workspaces.save(workspace);
  py.save_workspace(json, lastSaveName).then((r) => {
    const n = (r && r.name) || lastSaveName;
    setStatus('Saved: ' + n);
    closeSavePanel();
  }, (e) => { log.error('save: failed', e); contentSet('saveStatus', 'Save failed: ' + (e && e.message || e)); });
}

function doOpen() { log.info('open: panel opened'); openOpenPanel(); }

function openOpenPanel() {
  document.getElementById('saveOverlay').classList.remove('hidden');
  document.getElementById('saveTitle').textContent = 'Open program';
  document.getElementById('saveStatus').textContent = '';
  document.getElementById('saveOkBtn').style.display = 'none';
  const asBtn = document.getElementById('saveAsBtn');
  if (asBtn) asBtn.style.display = 'none';
  document.getElementById('saveBody').innerHTML = '<div class="saveEmpty">Loading saves\u2026</div>';
  loadSaveList();
}

function loadSaveList() {
  const body = document.getElementById('saveBody');
  const rows = py.list_saves ? py.list_saves() : Promise.resolve([]);
  Promise.resolve(rows).then((list) => {
    body.innerHTML = '';
    const files = Array.isArray(list) ? list : [];
    if (!files.length) {
      body.insertAdjacentHTML('beforeend', '<div class="saveEmpty">No saved programs yet.</div>');
    }
    files.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'saveRow';
      const nm = document.createElement('span');
      nm.className = 'saveName';
      nm.textContent = r.name;
      const btn = document.createElement('button');
      btn.textContent = 'Open';
      btn.onclick = () => openSave(r.name);
      row.appendChild(nm);
      row.appendChild(btn);
      body.appendChild(row);
    });
    const fb = document.createElement('button');
    fb.className = 'loadFileBtn';
    fb.textContent = 'Load from file\u2026';
    fb.onclick = () => pickProgramFile();
    body.appendChild(fb);
  });
}

function openSave(name) {
  py.load_workspace(name).then((r) => {
    if (r && r.data && typeof r.data === 'object') {
      loadWorkspaceState(r.data, r.name || name);
    } else {
      contentSet('saveStatus', (r && r.error) || ('Could not open ' + name));
    }
  });
}

function closeSavePanel() {
  document.getElementById('saveOverlay').classList.add('hidden');
}

function pickProgramFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = false;
  input.onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadProgramFile(f);
  };
  input.click();
}
// -- Python -> JS callbacks ------------------------------------------------
let __selId = null;
let __connecting = false;
let __scanning = false;

// Rendezvous for background scan/connect results pushed from Python.
window.__connPush = function (token, data) {
  log.debug('conn push: ' + token, data);
  if (token === 'scan') {
    __scanning = false;
    renderList(data || []);
    const btn = document.getElementById('scanBtn');
    if (btn) btn.disabled = false;
    const n = Array.isArray(data) ? data.length : 0;
    const spikes = Array.isArray(data) ? data.filter(d => d && d.is_prime).length : 0;
    setStatus(n
      ? (spikes
          ? 'Found ' + spikes + ' SPIKE hub' + (spikes === 1 ? '' : 's') + ' (' + n + ' device' + (n === 1 ? '' : 's') + ').'
          : 'Found ' + n + ' device' + (n === 1 ? '' : 's') + '.')
      : 'No hubs found. Make sure the Hub is on and nearby.');
  } else if (token === 'connect') {
    __connecting = false;
    const ok = typeof data === 'string' && data.startsWith('connected');
    setStatus(data);
    if (ok) closeConn();
    refreshHeader();
  } else if (token === 'disconnect') {
    refreshHeader();
  }
};

function openConn() {
  log.info('conn: dialog opened');
  document.getElementById('connOverlay').classList.remove('hidden');
  refreshHeader();
  // Web Bluetooth has no passive scan: the chooser opens only from a real
  // click on Scan below, so never auto-scan here.
}
function closeConn() {
  document.getElementById('connOverlay').classList.add('hidden');
}
function refreshHeader() {
  py.hub_status().then((s) => {
    const btn = document.getElementById('hubBtn');
    if (btn) {
      btn.textContent = s && s.connected
        ? 'Hub: ' + (s.name || 'connected')
        : 'Connect Hub';
      btn.classList.toggle('connected', !!(s && s.connected));
    }
    document.getElementById('statusLight').style.background =
      s && s.connected ? '#00b94d' : '#ccc';
  }, (e) => log.error('hub status failed', e));
}
function renderList(devices) {
  const list = document.getElementById('connList');
  if (!list) return;
  list.innerHTML = '';
  if (!devices || !devices.length) {
    const d = document.createElement('div');
    d.className = 'connEmpty';
    d.textContent = 'No hubs found. Make sure the Hub is turned on and nearby, then press Scan.';
    list.appendChild(d);
  }
  for (const dev of devices) {
    const row = document.createElement('div');
    row.className = 'devRow' + (__selId === dev.id ? ' sel' : '');
    const badge = document.createElement('span');
    badge.className = 'devBadge' + (dev.is_prime ? '' : ' other');
    badge.textContent = dev.is_prime ? 'SPIKE' : (dev.kind || 'other').toUpperCase();
    const name = document.createElement('span');
    name.className = 'devName';
    name.textContent = (dev.name || '(unnamed)') + (__selId === dev.id ? ' \u2713' : '');
    const meta = document.createElement('span');
    meta.className = 'devMeta';
    meta.textContent = dev.id;
    row.appendChild(badge);
    row.appendChild(name);
    row.appendChild(meta);
    row.onclick = () => {
      __selId = dev.id;
      renderList(devices);
      document.getElementById('connectBtn').disabled = __connecting;
    };
    list.appendChild(row);
  }
  document.getElementById('connectBtn').disabled = __connecting || !devices || !devices.length;
}
function doScan2() {
  if (__scanning) return;
  log.info('scan: button pressed');
  __scanning = true;
  const status = document.getElementById('connStatus');
  if (status) status.textContent = 'Scanning...';
  document.getElementById('scanBtn').disabled = true;
  document.getElementById('connectBtn').disabled = true;
  try {
    py.start_scan();
  } catch (e) {
    log.error('scan: start failed', e);
    __scanning = false;
    document.getElementById('scanBtn').disabled = false;
    if (status) status.textContent = 'Scan error: ' + e;
  }
  setTimeout(() => {
    __scanning = false;
    if (document.getElementById('scanBtn')) document.getElementById('scanBtn').disabled = false;
  }, 12000);
}
function doConnect() {
  if (!__selId || __connecting) return;
  log.info('connect: button pressed');
  __connecting = true;
  document.getElementById('connectBtn').disabled = true;
  const status = document.getElementById('connStatus');
  if (status) status.textContent = 'Connecting...';
  try { py.start_connect(__selId); } catch (e) {
    log.error('connect: start failed', e);
    __connecting = false;
    if (status) status.textContent = 'Connect error: ' + e;
  }
}
function doDisconnect() {
  log.info('disconnect: button pressed');
  document.getElementById('scanBtn').disabled = true;
  document.getElementById('connectBtn').disabled = true;
  // Disconnect bypasses the __busy gate on purpose: it must always run,
  // even if a scan/connect is still in flight, or the press is swallowed
  // and the UI looks stuck.
  setStatus('Disconnecting...');
  (async () => {
    try { await hub.disconnect(); } catch (e) { log.error('disconnect: failed', e); }
    try { refreshHeader(); } catch (e) { log.error('refreshHeader on disconnect failed', e); }
    document.getElementById('scanBtn').disabled = false;
    document.getElementById('connectBtn').disabled = false;
    __selId = null;
    renderList([]);
    closeConn();
    setStatus('Disconnected.');
  })();
}
function setLight(color) {
  document.getElementById('statusLight').style.background = color || '#ccc';
}
function setStatus(text) {
  document.getElementById('statusText').textContent = text;
  const cs = document.getElementById('connStatus');
  if (cs && text) cs.textContent = text;
}
function contentSet(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function setKey(name, down) {
  // Visual hook - key state is tracked inside the Python engine.
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
// These buttons used to call the handlers above through inline onclick=
// attributes. Inline handlers only reach global scope, but a module's
// top-level declarations are module-scoped, so every control is bound here.
// (The handler functions are declared with `function`, so they are hoisted
// and it is safe to bind them at the end of the module.)
// ---------------------------------------------------------------------------
document.getElementById('hubBtn').addEventListener('click', openConn);
document.getElementById('runBtn').addEventListener('click', doRun);
document.getElementById('stopBtn').addEventListener('click', doStop);
document.getElementById('saveBtn').addEventListener('click', doSave);
document.getElementById('openBtn').addEventListener('click', doOpen);
document.getElementById('connCloseBtn').addEventListener('click', closeConn);
document.getElementById('scanBtn').addEventListener('click', doScan2);
document.getElementById('connectBtn').addEventListener('click', doConnect);
document.getElementById('disconnectBtn').addEventListener('click', doDisconnect);
document.getElementById('saveCloseBtn').addEventListener('click', closeSavePanel);
document.getElementById('saveCancelBtn').addEventListener('click', closeSavePanel);
document.getElementById('saveAsBtn').addEventListener('click', finishSaveAs);
document.getElementById('saveOkBtn').addEventListener('click', finishSave);

// ---------------------------------------------------------------------------
// Diagnostic log panel
// ---------------------------------------------------------------------------
// A collapsible drawer that mirrors the log in js/log.js, plus header buttons
// to show it and to download everything as a zip. Rendering is throttled and
// capped so a busy page can never flood the DOM.
(function initLogPanel() {
  const panel = document.getElementById('logPanel');
  const body = document.getElementById('logBody');
  const count = document.getElementById('logCount');
  if (!panel || !body) return;

  const MAX_LINES = 300;
  let renderPending = false;

  function fmtData(d) {
    if (d == null) return '';
    return '  ' + d;
  }

  function render() {
    const all = log.entries();
    const shown = all.slice(-MAX_LINES);
    // Only stick to the bottom if the user is already there.
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 24;
    body.textContent = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'logEmpty';
      empty.textContent = 'No entries yet.';
      body.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      for (const e of shown) {
        const line = document.createElement('div');
        line.className = 'logLine ' + (e.level || 'info');
        const time = document.createElement('span');
        time.className = 'logTime';
        time.textContent = e.t ? String(e.t).slice(11, 19) : '';
        const lvl = document.createElement('span');
        lvl.className = 'logLvl';
        lvl.textContent = String(e.level || 'info').toUpperCase();
        line.appendChild(time);
        line.appendChild(lvl);
        line.appendChild(document.createTextNode(e.msg || ''));
        if (e.data) {
          const data = document.createElement('span');
          data.className = 'logData';
          data.textContent = fmtData(e.data);
          line.appendChild(data);
        }
        frag.appendChild(line);
      }
      body.appendChild(frag);
    }
    if (count) count.textContent = all.length + (all.length === 1 ? ' entry' : ' entries');
    if (atBottom) body.scrollTop = body.scrollHeight;
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => { renderPending = false; render(); }, 200);
  }

  function open() { panel.classList.remove('hidden'); render(); }
  function close() { panel.classList.add('hidden'); }
  function toggle() { panel.classList.contains('hidden') ? open() : close(); }

  log.onEntry(scheduleRender);
  render();

  const toggleBtn = document.getElementById('logToggleBtn');
  const saveBtn = document.getElementById('logBtn');
  const panelSave = document.getElementById('logSaveBtn');
  const clearBtn = document.getElementById('logClearBtn');
  const closeBtn = document.getElementById('logCloseBtn');
  if (toggleBtn) toggleBtn.addEventListener('click', () => { log.info('log: panel toggled'); toggle(); });
  if (saveBtn) saveBtn.addEventListener('click', () => log.download());
  if (panelSave) panelSave.addEventListener('click', () => log.download());
  if (clearBtn) clearBtn.addEventListener('click', () => { log.clear(); render(); });
  if (closeBtn) closeBtn.addEventListener('click', close);
})();
