// ==========================================================================
// Blockly-JSON conversion helpers
// ==========================================================================
// Purpose : Pure functions that read Blockly block JSON and build engine params.
// Depends : ./constants.js
// Exports : the _* helpers used by the parser and by Engine
//
// This file was split out of engine.js (the old single closure) so the
// web Block Studio engine can be understood one concern at a time.
// ---------------------------------------------------------------------

import {
  DEG_PER_CM, BLOCK_MAP, HAT_TYPES, CBLOCK_TYPES, ALT_TYPES, FIELD_MAP,
} from './constants.js';

// -------------------------------------------------------------------
// Blockly JSON helpers
// -------------------------------------------------------------------
function _numFloat(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0.0 : n;
}

function _field(fields, name, def) {
  if (!fields) return def == null ? '' : def;
  const v = fields[name];
  if (Array.isArray(v)) return (v.length ? v[0] : (def == null ? '' : def));
  if (v && typeof v === 'object') return v.name != null ? v.name : (v.id != null ? v.id : v);
  return v != null ? v : (def == null ? '' : def);
}

function _inputBlock(blk, name) {
  const inputs = blk.inputs || {};
  const entry = inputs[name];
  if (entry && typeof entry === 'object') {
    if (entry.block && typeof entry.block === 'object') return entry.block;
    if (entry.shadow && typeof entry.shadow === 'object') return entry.shadow;
  }
  return null;
}

function _firstFieldVal(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const vals = Object.values(sub.fields || {});
  if (!vals.length) return null;
  const v = vals[0];
  if (Array.isArray(v)) return v.length ? v[0] : null;
  if (v && typeof v === 'object') return v.name != null ? v.name : v.id;
  return v;
}

function _inputVal(blk, name, def) {
  const sub = _inputBlock(blk, name);
  if (sub === null) return def;
  const t = sub.type || '';
  const f = _firstFieldVal(sub);
  if (t === 'math_number') return _numFloat(f == null ? def : f);
  if (t === 'text') return String(f == null ? def : f);
  if (f != null) {
    if (typeof f === 'number') return f;
    const n = parseFloat(f);
    if (!isNaN(n)) return n;
    return f;
  }
  return def;
}

function _inputNum(blk, name, def) {
  const sub = _inputBlock(blk, name);
  if (sub === null) return def;
  const t = sub.type || '';
  if (t === 'math_number') return _numFloat(_firstFieldVal(sub) == null ? def : _firstFieldVal(sub));
  const n = _numberFromBlock(sub);
  if (n != null) return n;
  const f = _firstFieldVal(sub);
  if (f != null && !isNaN(parseFloat(f))) return parseFloat(f);
  return def;
}

function _booleanBlock(blk, name) {
  return _condFromReporter(_inputBlock(blk, name));
}

function _normaliseDirection(v) {
  const s = String(v).toLowerCase();
  if (s === 'back' || s === 'backward') return 'backward';
  return 'forward';
}

function _soundFreq(name, sec) {
  const notes = [523.25, 587.33, 659.26, 783.99, 880.0];
  const n = String(name || '');
  let idx = 3;
  if (n) { let s = 0; for (let i = 0; i < n.length; i++) s += n.charCodeAt(i); idx = s; }
  return [Math.round(notes[idx % notes.length]), sec];
}

function _soundName(raw) {
  // Sound values arrive as '{"name":"Cat Meow 1",...}' or a plain name.
  let s = String(raw == null ? '' : raw);
  try {
    const o = JSON.parse(s);
    if (o && o.name) return String(o.name);
  } catch (e) {}
  return s || 'Cat Meow 1';
}

function _condFromReporter(blk) {
  if (!blk) return null;
  const btype = blk.type || '';
  const fields = blk.fields || {};
  if (btype === 'keyboard_key_is_pressed') {
    return { type: 'key', key: _field(fields, 'KEY', 'w') };
  }
  if (btype === 'spike_tilt') {
    return { type: 'tilt', direction: _field(fields, 'DIR', 'left') };
  }
  if (btype === 'spike_is_color') {
    return { type: 'colour', color: _field(fields, 'COLOR', '5'), port: 'C' };
  }
  if (['logic_compare', 'operator_lt', 'operator_equals', 'operator_gt'].includes(btype)) {
    const opMap = { EQ: '=', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=', '=': '=', '<': '<', '>': '>' };
    const op = opMap[_field(fields, 'OP', '=')] || '=';
    const hasA = 'A' in (blk.inputs || {});
    const a = hasA ? _inputNum(blk, 'A', 0) : _inputNum(blk, 'OPERAND1', 0);
    const hasB = 'B' in (blk.inputs || {});
    const b = hasB ? _inputNum(blk, 'B', 0) : _inputNum(blk, 'OPERAND2', 0);
    return { type: 'num', a: a, b: b, op: op };
  }
  if (['operator_and', 'logic_operation'].includes(btype)) {
    const op = _field(fields, 'OP', 'AND');
    return { type: 'bool_op', op: op, l: _booleanBlock(blk, 'OPERAND1') || _booleanBlock(blk, 'A'), r: _booleanBlock(blk, 'OPERAND2') || _booleanBlock(blk, 'B') };
  }
  if (['operator_not', 'logic_negate'].includes(btype)) {
    const inner = _booleanBlock(blk, 'OPERAND') || _booleanBlock(blk, 'BOOL');
    return { type: 'neg', cond: inner || { type: 'const', value: false } };
  }
  if (btype === 'logic_boolean') {
    return { type: 'const', value: _field(fields, 'BOOL', 'TRUE') !== 'FALSE' };
  }
  if (btype === 'operator_contains') {
    return { type: 'contains', a: String(_inputVal(blk, 'STRING1', '')), b: String(_inputVal(blk, 'STRING2', '')) };
  }
  if (btype === 'flippersensors_isColor') {
    return { type: 'colour', port: String(_inputVal(blk, 'PORT', 'C')), color: String(_inputVal(blk, 'VALUE', '1')) };
  }
  if (btype === 'flippersensors_isReflectivity') {
    return { type: 'reflect', port: String(_inputVal(blk, 'PORT', 'C')), op: String(_field(fields, 'COMPARATOR', '<')), value: _inputNum(blk, 'VALUE', 50) };
  }
  if (btype === 'flippersensors_isPressed') {
    return { type: 'force', port: String(_inputVal(blk, 'PORT', 'C')) };
  }
  if (btype === 'flippersensors_isDistance') {
    const val = _inputNum(blk, 'VALUE', 50);
    const cmp = String(_field(fields, 'COMPARATOR', '<'));
    const mm = _distMm(val, _field(fields, 'UNIT', '%'));
    const port = String(_inputVal(blk, 'PORT', 'C'));
    if (cmp === '>') return { type: 'distance', port: port, op: '>', less: 0, more: mm };
    if (cmp === '=') return { type: 'distance', port: port, op: '=', eq: Math.trunc(mm) };
    return { type: 'distance', port: port, op: '<', less: mm, more: 0 };
  }
  if (btype === 'flippersensors_isTilted') {
    const v = String(_inputVal(blk, 'VALUE', '1'));
    const tiltMap = { '1': 'forward', '2': 'backward', '3': 'left', '4': 'right', forward: 'forward', backward: 'backward', left: 'left', right: 'right' };
    return { type: 'tilt', direction: tiltMap[v] || v };
  }
  if (btype === 'flippersensors_isorientation') {
    return { type: 'orient', orientation: _field(fields, 'ORIENTATION', 'front') };
  }
  if (btype === 'flippersensors_ismotion') {
    return { type: 'motion', motion: _field(fields, 'MOTION', 'shake') };
  }
  if (btype === 'flippersensors_buttonIsPressed') {
    return { type: 'button', button: _field(fields, 'BUTTON', 'left'), event: _field(fields, 'EVENT', 'pressed') };
  }
  if (btype === 'flipperoperator_isInBetween') {
    return { type: 'between', v: _inputNum(blk, 'VALUE', 0), lo: _inputNum(blk, 'LOW', 0), hi: _inputNum(blk, 'HIGH', 100) };
  }
  return null;
}

function _numberFromBlock(blk) {
  if (!blk) return null;
  const btype = blk.type || '';
  const fields = blk.fields || {};
  if (btype === 'math_number') return _numFloat(_field(fields, 'NUM', 0));
  if (btype === 'text') return String(_field(fields, 'TEXT', ''));
  if (btype === 'variables_get') return '{' + _field(fields, 'VAR', 'x') + '}';
  if (['operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide', 'operator_mod'].includes(btype)) {
    const op = { operator_add: '+', operator_subtract: '-', operator_multiply: '*', operator_divide: 'divide', operator_mod: 'mod' }[btype];
    return { type: 'math', op: op, a: _inputNum(blk, 'NUM1', 0), b: _inputNum(blk, 'NUM2', 0) };
  }
  if (btype === 'operator_random') {
    return { type: 'math', op: 'random', a: _inputNum(blk, 'FROM', 1), b: _inputNum(blk, 'TO', 10) };
  }
  if (btype === 'operator_round') {
    return { type: 'math', op: 'round', a: _inputNum(blk, 'NUM', 0) };
  }
  if (btype === 'operator_mathop') {
    return { type: 'math', op: _field(fields, 'OPERATOR', 'abs'), a: _inputNum(blk, 'NUM', 0) };
  }
  if (btype === 'operator_join') {
    return { type: 'math', op: 'join', a: String(_inputVal(blk, 'STRING1', '')), b: String(_inputVal(blk, 'STRING2', '')) };
  }
  if (btype === 'operator_letter_of') {
    return { type: 'math', op: 'letter', a: Math.round(_inputNum(blk, 'LETTER', 1)), s: String(_inputVal(blk, 'STRING', '')) };
  }
  if (btype === 'operator_length') {
    return { type: 'math', op: 'length', a: String(_inputVal(blk, 'STRING', '')) };
  }
  const port = _inputVal(blk, 'PORT', 'C');
  if (btype === 'flippersensors_distance') {
    return { type: 'sensor', sensor: 'distance', port: String(port),
             unit: String(_field(fields, 'UNIT', '%')) };
  }
  const sensorMap = {
    flippersensors_color: 'colour',
    flippersensors_reflectivity: 'reflectivity',
    flippersensors_force: 'force',
  };
  if (sensorMap[btype]) return { type: 'sensor', sensor: sensorMap[btype], port: String(port) };
  if (btype === 'flippersensors_timer') return { type: 'sensor', sensor: 'timer' };
  if (btype === 'flippermotor_absolutePosition' || btype === 'flippermoremotor_position') {
    return { type: 'sensor', sensor: 'position', port: String(port) };
  }
  if (btype === 'flippermotor_speed' || btype === 'flippermoremotor_power') {
    return { type: 'sensor', sensor: 'power', port: String(port) };
  }
  if (btype === 'flippermoresensors_orientation') return { type: 'sensor', sensor: 'orientation', port: String(port) };
  if (btype === 'flippermoresensors_motion') return { type: 'sensor', sensor: 'gesture', port: String(port) };
  if (btype === 'flippersensors_orientationAxis') return { type: 'sensor', sensor: 'angle', port: String(port), axis: _field(fields, 'AXIS', 'pitch') };
  if (btype === 'sound_volume') return 0.0;
  return null;
}

// Raw ultrasonic reading in mm (upstream simulator units), or null.
function _hubDistance(eng, port) {
  let state = {};
  try {
    state = (eng.hub && eng.hub.state) ? eng.hub.state() : {};
  } catch (e) { state = {}; }
  if (!state || typeof state !== 'object') return null;
  const sensors = state.distance || {};
  const v = parseFloat(sensors[String(port || 'C').trim().toUpperCase()]);
  return isNaN(v) ? null : v;
}

// Threshold value converted to mm, mirroring the upstream simulator.
function _distMm(value, unit) {
  const v = parseFloat(value);
  if (isNaN(v)) return 0;
  const u = String(unit || '%');
  if (u === '%') return (v / 100.0) * 2000.0;
  if (u === 'cm') return v * 10.0;
  if (u === 'in' || u === 'inches') return v * 25.4;
  return v;
}

// Raw mm converted to the block's display unit.
function _mmToUnit(mm, unit) {
  const u = String(unit || '%');
  if (u === '%') return (mm * 100.0) / 2000.0;
  if (u === 'cm') return mm / 10.0;
  if (u === 'in' || u === 'inches') return mm / 25.4;
  return mm;
}

function _statementChain(blk, inputName) {
  const entry = (blk.inputs || {})[inputName];
  if (entry && typeof entry === 'object' && entry.block && typeof entry.block === 'object') {
    return _chainFrom(entry.block);
  }
  return [];
}

function _chainFrom(blk) {
  const out = [];
  const seen = new Set();
  let cur = blk;
  while (cur && typeof cur === 'object') {
    if (cur.id && seen.has(cur.id)) break;
    if (cur.id) seen.add(cur.id);
    out.push(_singleToModel(cur));
    const nxt = cur.next;
    if (nxt && typeof nxt === 'object' && nxt.block && typeof nxt.block === 'object') {
      cur = nxt.block;
    } else {
      break;
    }
  }
  return out;
}

function _singleToModel(blk) {
  const btype = blk.type || '';
  const fields = blk.fields || {};
  let op = BLOCK_MAP[btype] || btype;
  const KNOWN = new Set(Object.values(BLOCK_MAP)).add('inapp');
  op = KNOWN.has(op) ? op : 'inapp';

  const b = { op: op, params: {}, body: [], alt: [] };
  b.is_hat = HAT_TYPES.has(btype);
  b.is_cblock = CBLOCK_TYPES.has(btype);
  b.has_alt = ALT_TYPES.has(btype);

  const fl = FIELD_MAP[btype] || {};
  for (const fname of Object.keys(fl)) {
    if (fname) b.params[fl[fname]] = _field(fields, fname);
  }

  // -- original statement blocks ----------------------------------------
  if (btype === 'spike_move') {
    if (_field(fields, 'DIR', 'forward') === 'backward') {
      b.op = 'move_deg_backward';
      b.params.dist = _numFloat(_field(fields, 'STEPS', 10)) * DEG_PER_CM;
    } else {
      b.op = 'move_cm_forward';
      b.params.dist = _field(fields, 'STEPS', 10);
    }
    b.params.speed = 50;
  } else if (btype === 'spike_turn') {
    b.params.dist = _field(fields, 'DIST', 30);
    b.params.speed = 50;
    if (_field(fields, 'DIR', 'right') === 'left') b.params.dir_reverse = true;
  } else if (btype === 'spike_motor_run') {
    if (_field(fields, 'DIR', 'forward') === 'backward') b.params.reverse = true;
    b.params.deg = _field(fields, 'DEG', 90);
  } else if (btype === 'spike_motor_set_speed') {
    b.params.power = _numFloat(_field(fields, 'SPEED', 50));
  } else if (btype === 'spike_play_sound') {
    const snd = _numFloat(_field(fields, 'SOUND', 1));
    b.params.freq = Math.round(300 + snd * 80);
    b.params.sec = 1;
  } else if (btype === 'spike_center_light') {
    const c = String(_field(fields, 'COLOR', 'green')).toLowerCase();
    b.params.color = ({ on: 'green', red: 'red', green: 'green', blue: 'blue', yellow: 'yellow', off: 'black' })[c] || c;
  } else if (btype === 'control_wait') {
    b.params.sec = _inputNum(blk, 'DURATION', 1);
  } else if (btype === 'control_repeat') {
    b.params.n = parseInt(_inputNum(blk, 'TIMES', 4), 10);
  } else if (btype === 'variables_set') {
    b.params.var = _field(fields, 'VAR', 'x');
    const val = _inputBlock(blk, 'VALUE');
    const n = _numberFromBlock(val);
    b.params.value = n != null ? n : 0;
  } else if (btype === 'flippermove_move') {
    b.params.direction = _normaliseDirection(_inputVal(blk, 'DIRECTION', 'forward'));
    b.params.value = _inputNum(blk, 'VALUE', 10);
    b.params.unit = _field(fields, 'UNIT', 'cm');
  } else if (btype === 'flippermove_startMove') {
    b.params.direction = _normaliseDirection(_inputVal(blk, 'DIRECTION', 'forward'));
  } else if (btype === 'flippermove_steer') {
    b.params.steering = String(_inputVal(blk, 'STEERING', 'left')).toLowerCase();
    b.params.value = _inputNum(blk, 'VALUE', 10);
    b.params.unit = _field(fields, 'UNIT', 'cm');
  } else if (btype === 'flippermove_startSteer') {
    b.params.steering = String(_inputVal(blk, 'STEERING', 'left')).toLowerCase();
  } else if (btype === 'flippermove_movementSpeed') {
    b.params.speed = _inputNum(blk, 'SPEED', 50);
  } else if (btype === 'flippermove_setMovementPair') {
    b.params.pair = String(_inputVal(blk, 'PAIR', 'A,B'));
  } else if (btype === 'flippermove_setDistance') {
    b.params.value = _inputNum(blk, 'DISTANCE', 8.4);
    b.params.unit = _field(fields, 'UNIT', 'cm');
  } else if (btype === 'flippermotor_motorTurnForDirection') {
    const port = _inputVal(blk, 'PORT', 'A');
    const direction = String(_inputVal(blk, 'DIRECTION', 'clockwise'));
    const value = _inputNum(blk, 'VALUE', 1);
    const unit = _field(fields, 'UNIT', 'rotations');
    b.params.port = String(port);
    if (direction === 'counterclockwise') b.params.reverse = true;
    if (unit === 'seconds') {
      b.op = 'motor_time';
      b.params.time = Math.max(0, value);
    } else {
      b.op = 'motor_angle';
      b.params.deg = value * (String(unit).toLowerCase().indexOf('rotat') >= 0 ? 360 : 1);
    }
  } else if (btype === 'flippermotor_motorGoDirectionToPosition') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    b.params.deg = _inputNum(blk, 'POSITION', 90);
    if (String(_field(fields, 'DIRECTION', 'shortest')).toLowerCase() === 'counterclockwise') b.params.reverse = true;
  } else if (btype === 'keyboard_drive_wasd') {
    b.params.speed = _numFloat(_field(fields, 'SPEED', 50));
    b.params.pair = String(_field(fields, 'PAIR', 'AB'));
  } else if (btype === 'flippermotor_motorStartDirection') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    if (String(_inputVal(blk, 'DIRECTION', 'clockwise')) === 'counterclockwise') b.params.reverse = true;
  } else if (btype === 'flippermotor_motorStop') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
  } else if (btype === 'flippermotor_motorSetSpeed') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    b.params.power = _inputNum(blk, 'SPEED', 50);
  } else if (btype === 'flippermotor_motorChangeSpeed') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    b.params.amount = _inputNum(blk, 'AMOUNT', 0);
  } else if (btype === 'flippermoremotor_motorGoToRelativePosition') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    b.params.deg = _inputNum(blk, 'POSITION', 0);
    b.params.power = _inputNum(blk, 'SPEED', 50);
  } else if (btype === 'flippermoremotor_motorStartPower') {
    b.params.port = String(_inputVal(blk, 'PORT', 'A'));
    b.params.power = _inputNum(blk, 'POWER', 50);
  } else if (btype === 'flippermoremotor_motorSetStopMethod') {
    b.params.msg = 'stop method=' + _field(fields, 'STOP', 'brake');
  } else if (btype === 'flippermoremotor_motorSetAcceleration') {
    b.params.msg = 'acceleration=' + _inputNum(blk, 'ACCELERATION', 1000);
  } else if (btype === 'flippermoremotor_motorSetDegreeCounted') {
    b.params.msg = 'relative position=' + _inputNum(blk, 'VALUE', 0);
  } else if (btype === 'flippermoremove_startDualSpeed') {
    b.params.left = _inputNum(blk, 'LEFT', 0);
    b.params.right = _inputNum(blk, 'RIGHT', 0);
  } else if (btype === 'flippermoremove_movementSetStopMethod') {
    b.params.msg = 'movement stop=' + _field(fields, 'STOP', 'brake');
  } else if (btype === 'flippermoremove_movementSetAcceleration') {
    b.params.msg = 'movement accel=' + _inputNum(blk, 'ACCELERATION', 1000);
  } else if (btype === 'flipperlight_lightDisplayImageOn') {
    b.params.msg = 'image=' + _inputVal(blk, 'MATRIX', '');
  } else if (btype === 'flipperlight_lightDisplayImageOnForTime') {
    b.params.msg = 'image=' + _inputVal(blk, 'MATRIX', '') + ' for ' + _inputNum(blk, 'VALUE', 1) + 's';
  } else if (btype === 'flipperlight_lightDisplayText') {
    b.params.msg = 'text=' + _inputVal(blk, 'TEXT', '');
  } else if (btype === 'flipperlight_lightDisplaySetBrightness') {
    b.params.msg = 'brightness=' + _inputNum(blk, 'BRIGHTNESS', 50);
  } else if (btype === 'flipperlight_lightDisplaySetPixel') {
    b.params.msg = 'pixel ' + _inputNum(blk, 'X', 0) + ',' + _inputNum(blk, 'Y', 0) + '=' + _inputNum(blk, 'BRIGHTNESS', 50);
  } else if (btype === 'flipperlight_lightDisplayRotate') {
    b.params.msg = 'rotate=' + _inputVal(blk, 'DIRECTION', 'right');
  } else if (btype === 'flipperlight_lightDisplaySetOrientation') {
    b.params.msg = 'orientation=' + _inputVal(blk, 'ORIENTATION', 'front');
  } else if (btype === 'flipperlight_ultrasonicLightUp') {
    b.params.msg = 'ultrasonic ' + _inputVal(blk, 'PORT', 'A') + '=' + _inputVal(blk, 'VALUE', 'off');
  } else if (btype === 'flippersound_playSound') {
    const [f, s] = _soundFreq(_inputVal(blk, 'SOUND', 'Cat Meow 1'), 0.5);
    b.params.freq = f; b.params.sec = s;
    b.params.sound = _soundName(_inputVal(blk, 'SOUND', 'Cat Meow 1'));
    b.op = 'play_tone';
  } else if (btype === 'flippersound_playSoundUntilDone') {
    const [f, s] = _soundFreq(_inputVal(blk, 'SOUND', 'Cat Meow 1'), 1.4);
    b.params.freq = f; b.params.sec = s;
    b.params.sound = _soundName(_inputVal(blk, 'SOUND', 'Cat Meow 1'));
    b.op = 'play_tone';
  } else if (btype === 'flippersound_stopSound') {
    b.params.msg = 'stop all sounds';
  } else if (btype === 'flippersound_beep') {
    b.params.freq = Math.round(440 * Math.pow(2, (_inputNum(blk, 'NOTE', 60) - 69) / 12));
  } else if (btype === 'flippersound_beepForTime') {
    b.params.freq = Math.round(440 * Math.pow(2, (_inputNum(blk, 'NOTE', 60) - 69) / 12));
    b.params.sec = Math.max(0, _inputNum(blk, 'DURATION', 1));
    b.op = 'play_tone';
  } else if (btype === 'flipperlight_centerButtonLight') {
    let colorRaw = _inputVal(blk, 'COLOR', '2');
    let colorVal = String(colorRaw);
    const n = parseInt(parseFloat(colorRaw), 10);
    if (!isNaN(n)) colorVal = String(n);
    const colorMap = { '1': 'black', '2': 'blue', '3': 'green', '4': 'cyan', '5': 'red', '6': 'magenta', '7': 'yellow', '8': 'white', '9': 'orange', '10': 'pink' };
    b.params.color = colorMap[colorVal] || colorVal;
  } else if (btype === 'flippercontrol_stop') {
    const stop = _field(fields, 'STOP_OPTION', 'all');
    b.op = stop === 'other' ? 'stop_script' : 'stop_all';
  } else if (btype === 'event_broadcast' || btype === 'event_broadcastandwait') {
    b.params.broadcast = String(_inputVal(blk, 'BROADCAST_INPUT', 'message1'));
  } else if (btype === 'flippermoresensors_setOrientation') {
    b.params.msg = 'yaw axis=' + _field(fields, 'UP', 'front');
  } else if (btype === 'sound_changeeffectby') {
    b.params.msg = _field(fields, 'EFFECT', 'pitch') + ' + ' + _inputNum(blk, 'VALUE', 1);
  } else if (btype === 'sound_seteffectto') {
    b.params.msg = _field(fields, 'EFFECT', 'pitch') + '=' + _inputNum(blk, 'VALUE', 100);
  } else if (btype === 'sound_cleareffects') {
    b.params.msg = 'clear effects';
  } else if (btype === 'sound_changevolumeby') {
    b.params.msg = 'volume + ' + _inputNum(blk, 'VOLUME', 10);
  } else if (btype === 'sound_setvolumeto') {
    b.params.vol = _inputNum(blk, 'VOLUME', 100);
  }

  // -- C-block bodies ----------------------------------------------------
  if (b.is_cblock) {
    if (btype === 'keyboard_while_key_blank') {
      const inner = _inputBlock(blk, 'KEY');
      let cond = _condFromReporter(inner);
      if (cond === null) cond = { type: 'key', key: String(_inputVal(blk, 'KEY', 'space')) };
      b.params.cond = cond;
    } else {
      const condInputs = {
        keyboard_while_key_pressed: 'KEY', spike_while: 'COND',
        control_if: 'CONDITION', control_if_else: 'CONDITION',
        control_repeat_until: 'CONDITION', control_wait_until: 'CONDITION',
      };
      let cond = null;
      if (condInputs[btype]) cond = _condFromReporter(_inputBlock(blk, condInputs[btype]));
      if (cond === null) {
        if (btype === 'keyboard_while_key_pressed') {
          cond = { type: 'key', key: _field(fields, 'KEY', 'space') };
        } else {
          cond = { type: 'const', value: true };
        }
      }
      b.params.cond = cond;
    }
    const bodyIn = (btype === 'control_repeat' || btype === 'control_if' || btype === 'control_if_else' || btype === 'control_wait' || btype === 'control_wait_until' || btype === 'control_repeat_until' || btype === 'control_forever') ? 'SUBSTACK' : 'DO';
    b.body = _statementChain(blk, bodyIn);
    if (b.has_alt) b.alt = _statementChain(blk, 'SUBSTACK2');
  }

  // -- event hats --------------------------------------------------------
  if (b.is_hat) b.body = _statementChain(blk, 'DO');
  if (btype === 'flipperevents_whenCondition') {
    b.params.cond = _condFromReporter(_inputBlock(blk, 'CONDITION')) || { type: 'const', value: true };
  } else if (btype === 'flipperevents_whenColor') {
    let color = _inputVal(blk, 'OPTION', '1');
    const n = parseInt(parseFloat(color), 10);
    if (!isNaN(n)) color = n;
    b.params.cond = { type: 'colour', port: String(_inputVal(blk, 'PORT', 'C')), color: String(color) };
  } else if (btype === 'flipperevents_whenPressed') {
    b.params.cond = { type: 'force', port: String(_inputVal(blk, 'PORT', 'C')) };
  } else if (btype === 'flipperevents_whenDistance') {
    const value = _inputNum(blk, 'VALUE', 50);
    const cmp = _field(fields, 'COMPARATOR', '<');
    const mm = _distMm(value, _field(fields, 'UNIT', '%'));
    const port = String(_inputVal(blk, 'PORT', 'C'));
    if (cmp === '=') {
      b.params.cond = { type: 'distance', port: port, op: '=', eq: Math.trunc(mm) };
    } else {
      b.params.cond = cmp === '>'
        ? { type: 'distance', port: port, op: '>', less: 0, more: mm }
        : { type: 'distance', port: port, op: '<', less: mm, more: 0 };
    }
  } else if (btype === 'flipperevents_whenTilted') {
    let raw = _inputVal(blk, 'VALUE', '1');
    const n = parseInt(parseFloat(raw), 10);
    if (!isNaN(n)) raw = n;
    const v = String(raw);
    const tiltMap = { '1': 'forward', '2': 'backward', '3': 'left', '4': 'right', forward: 'forward', backward: 'backward', left: 'left', right: 'right' };
    b.params.cond = { type: 'tilt', direction: tiltMap[v] || v };
  } else if (btype === 'flipperevents_whenOrientation') {
    b.params.cond = { type: 'orient', orientation: _field(fields, 'VALUE', 'front') };
  } else if (btype === 'flipperevents_whenGesture') {
    b.params.cond = { type: 'motion', motion: _field(fields, 'EVENT', 'shake') };
  } else if (btype === 'flipperevents_whenButton') {
    b.params.cond = { type: 'button', button: _field(fields, 'BUTTON', 'left'), event: _field(fields, 'EVENT', 'pressed') };
  } else if (btype === 'flipperevents_whenTimer') {
    const value = _inputNum(blk, 'VALUE', 1);
    b.params.cond = { type: 'num', a: { type: 'sensor', sensor: 'timer' }, b: value, op: '>' };
  } else if (btype === 'event_whenbroadcastreceived') {
    b.params.broadcast = _field(fields, 'BROADCAST_OPTION', 'message1');
  }

  return b;
}

export {
  _numFloat, _field, _inputBlock, _firstFieldVal, _inputVal, _inputNum,
  _booleanBlock, _normaliseDirection, _soundFreq, _soundName,
  _condFromReporter, _numberFromBlock, _hubDistance, _distMm, _mmToUnit,
  _statementChain, _chainFrom, _singleToModel,
};
