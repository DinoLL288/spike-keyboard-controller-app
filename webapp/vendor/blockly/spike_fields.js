// Minimal stub field classes for simulator custom fields.
// field_grid_dropdown is the most critical - used for port/direction/color selectors.

// Register a field type on modern Blockly (fieldRegistry) while staying
// compatible with the older Field.register API.
function registerField(type, fieldClass) {
  const registry = Blockly.fieldRegistry || Blockly.Field;
  if (registry && typeof registry.register === 'function') {
    try { registry.register(type, fieldClass); } catch (e) { /* ignore */ }
  }
}

// shadow_input extension - auto-creates shadow blocks for value inputs
// based on the block definition's shadow specs (from spike_blocks.js)
Blockly.Extensions.register('shadow_input', function() {
  const thisBlock = this;
  if (!thisBlock.inputList) return;
  const blockDefinition = (window.spikeBlocks || []).find(b => b.type === thisBlock.type);
  thisBlock.inputList.forEach((input) => {
    if (input.type === Blockly.inputs.inputTypes.VALUE && input.connection) {
      let shadow = null;
      let createShadow = false;
      let isString = false;
      if (blockDefinition) {
        let n = 0;
        while (blockDefinition['args' + n]) {
          const arglist = blockDefinition['args' + n];
          if (arglist && Array.isArray(arglist)) {
            const def = arglist.find((x) => x.name === input.name);
            if (def) {
              if (def.shadow) {
                shadow = def.shadow;
                createShadow = true;
                break;
              }
              if (def.type && def.type === 'field_grid_dropdown' && def.options) {
                shadow = { type: def.name ? 'spike_num_' + def.name : 'math_number',
                           fields: {} };
              }
            }
          }
          n++;
        }
      }
      if (!shadow) {
        const checks = input.connection.getCheck();
        if (checks) {
          if (checks.indexOf('Number') >= 0) {
            createShadow = true;
          } else if (checks.indexOf('String') >= 0) {
            createShadow = true;
            isString = true;
          }
        } else {
          createShadow = true;
        }
      }
      if (createShadow) {
        if (!shadow) {
          shadow = isString
            ? { type: 'text', fields: { TEXT: 'Hello' } }
            : { type: 'math_number', fields: { NUM: 1 } };
        }
        try { input.connection.setShadowState(shadow); } catch(e) { /* ignore */ }
      }
    }
  });
});

// field_grid_dropdown: the most common custom field - used for port/direction/color selectors

// Register field_grid_dropdown as a simple dropdown that reads options from JSON config
class SpikeGridDropdown extends Blockly.FieldDropdown {
  // LEGO blocks express icon options as [{src,width,height,alt}, value]. That
  // IS Blockly 13's image-option shape, but width/height must be numbers or
  // validation throws ("Found invalid FieldDropdown options") and the icon
  // is treated as plain text. Keep the object form; coerce dims to numbers.
  static normalizeOptions(opts) {
    if (!Array.isArray(opts)) return [['--', '--']];
    return opts.map((o) => {
      if (!Array.isArray(o) || o.length < 2) return o;
      const display = o[0];
      if (display && typeof display === 'object' && display.src) {
        return [{
          src: display.src,
          width: Number(display.width) || 20,
          height: Number(display.height) || 20,
          alt: String(display.alt || display.src),
        }, o[1]];
      }
      return o;
    });
  }
  constructor(value, opt_validator, config) {
    // When called from JSON, config has the options array
    let options = [['--', '--']];
    if (config && config.options) {
      options = SpikeGridDropdown.normalizeOptions(config.options);
    } else if (value && Array.isArray(value)) {
      options = SpikeGridDropdown.normalizeOptions(value);
    }
    super(options, opt_validator);
  }
  static fromJson(config) {
    // config is the full JSON field definition object
    const options = SpikeGridDropdown.normalizeOptions(config.options || [['--', '--']]);
    return new this(options);
  }
}
registerField('field_grid_dropdown', SpikeGridDropdown);

// field_sound: sound selector. LEGO stores the value as JSON like
// {"name":"Cat Meow 1","location":"device"}; keep the display name so the
// shadow block output is a usable value and the dropdown shows real sounds.
const LEGO_SOUNDS = [
  'Cat Meow 1', 'Cat Meow 2', 'Dog Bark 1', 'Dog Bark 2', 'Elephant Call',
  'Mimic Bear', 'Mimic T-Rex', 'Mimic Mouse', 'Pig Oink', 'Rabbit Squeak',
  'Roar', 'Woof', 'Whistle',
];
class SpikeSoundField extends Blockly.FieldDropdown {
  constructor(value, opt_validator, config) {
    super(LEGO_SOUNDS.map((n) => [n, n]), opt_validator);
  }
  doClassValidation_(newValue) {
    if (typeof newValue === 'string' && newValue) {
      let name = newValue;
      try {
        const obj = JSON.parse(newValue);
        if (obj && obj.name) name = String(obj.name);
      } catch (e) { /* already a plain name */ }
      if (LEGO_SOUNDS.indexOf(name) >= 0) return name;
    }
    return LEGO_SOUNDS[0];
  }
  static fromJson(config) { return new this(); }
}
registerField('field_sound', SpikeSoundField);

// field_bitmap: editable brightness grid (e.g. the 5x5 light matrix).
// value is a string of digits 0-9 (one per cell, top-to-bottom/left-to-right).
class SpikeBitmapField extends Blockly.Field {
  constructor(value, validator, config) {
    super(value, validator, config);
    this.SERIALIZABLE = true;
  }
  configure_(config) {
    super.configure_(config);
    this.gridWidth = config ? config.width || 5 : 5;
    this.gridHeight = config ? config.height || 5 : 5;
    this.fieldHeight = config ? config.fieldHeight || 24 : 24;
    const buttons = config ? config.buttons : null;
    this.showClear = !!buttons && buttons.clear;
    this.showRandomize = !!buttons && buttons.randomize;
    this.cells = [];
  }
  static fromJson(config) {
    return new this(config.value, undefined, config);
  }
  doClassValidation_(newValue) {
    if (typeof newValue !== 'string') return null;
    const len = this.gridWidth * this.gridHeight;
    let s = newValue.slice(0, len);
    while (s.length < len) s += '0';
    return s;
  }
  initView() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const cell = Math.max(2, Math.floor(this.fieldHeight / this.gridHeight));
    this.gridGroup_ = document.createElementNS(svgNS, 'g');
    this.fieldGroup_.appendChild(this.gridGroup_);
    this.cells = [];
    for (let r = 0; r < this.gridHeight; r++) {
      for (let c = 0; c < this.gridWidth; c++) {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', c * cell);
        rect.setAttribute('y', r * cell);
        rect.setAttribute('width', cell - 1);
        rect.setAttribute('height', cell - 1);
        rect.setAttribute('stroke', '#000');
        rect.setAttribute('stroke-width', '0.5');
        this.gridGroup_.appendChild(rect);
        this.cells.push(rect);
        const idx = this.cells.length - 1;
        rect.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setBrightness_(idx);
        });
      }
    }
    if (this.showClear) {
      const btn = document.createElementNS(svgNS, 'text');
      btn.setAttribute('x', 0);
      btn.setAttribute('y', this.gridHeight * cell + 9);
      btn.setAttribute('font-size', '7');
      btn.setAttribute('fill', '#444');
      btn.textContent = 'clear';
      this.fieldGroup_.appendChild(btn);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setValue('0'.repeat(this.gridWidth * this.gridHeight));
        this.rerenderCells_();
      });
    }
  }
  setBrightness_(idx) {
    const val = this.getValue() || '';
    const chars = val.split('');
    const cur = parseInt(chars[idx] || '0', 10);
    chars[idx] = String((cur + 1) % 10);
    this.setValue(chars.join(''));
    this.rerenderCells_();
  }
  rerenderCells_() {
    if (!this.cells.length) return;
    const val = this.getValue() || '';
    this.cells.forEach((rect, i) => {
      const level = parseInt(val[i] || '0', 10);
      const b = Math.round((level / 9) * 255);
      rect.setAttribute('fill', 'rgb(' + b + ',' + b + ',' + Math.min(255, b + 40) + ')');
    });
  }
  render_() {
    this.rerenderCells_();
    this.updateSize_();
  }
  updateSize_() {
    const cell = Math.max(2, Math.floor(this.fieldHeight / this.gridHeight));
    let w = this.gridWidth * cell;
    let h = this.gridHeight * cell;
    if (this.showClear) h += 11;
    this.size_.width = w;
    this.size_.height = h;
  }
  getFocusableElement() {
    if (this.fieldGroup_) return this.fieldGroup_;
    if (this.sourceBlock_ && this.sourceBlock_.getSvgRoot) {
      return this.sourceBlock_.getSvgRoot();
    }
    throw Error('bitmap field not bound');
  }
}
registerField('field_bitmap', SpikeBitmapField);

// field_ultra_sound: ultrasonic settings
class SpikeUltraSoundField extends Blockly.FieldDropdown {
  constructor(value, opt_validator, config) {
    super([['enable', 'enable'], ['disable', 'disable']], opt_validator);
  }
  static fromJson(config) { return new this(); }
}
registerField('field_ultra_sound', SpikeUltraSoundField);

// field_metadata: metadata display
class SpikeMetadataField extends Blockly.FieldLabel {
  static fromJson(config) { return new this('[metadata]'); }
}
registerField('field_metadata', SpikeMetadataField);

// field_variable_getter: variable reference
class SpikeVariableField extends Blockly.FieldDropdown {
  constructor(value, opt_validator, config) {
    super([['x', 'x'], ['y', 'y'], ['z', 'z']], opt_validator);
  }
  static fromJson(config) { return new this(); }
}
registerField('field_variable_getter', SpikeVariableField);

// field_angle: custom angle field. Blockly 11+ removed Blockly.FieldAngle,
// so we base it on FieldNumber (still a click-to-type value field).
// FieldNumber's v13 signature is (value, min, max, precision, validator,
// config) - matching it lets Blockly configure precision/min/max properly
// and keeps full-block-field rendering working in the toolbox flyout.
class SpikeAngleField extends Blockly.FieldNumber {
  constructor(value, opt_min, opt_max, opt_precision, opt_validator, config) {
    super(value, opt_min, opt_max, opt_precision, opt_validator, config);
  }
  static fromJson(config) {
    return new this(
      config && config.value !== undefined ? config.value : 0,
      undefined, undefined, undefined, undefined, config);
  }
  getFocusableElement() {
    if (this.fieldGroup_) return this.fieldGroup_;
    if (this.sourceBlock_ && this.sourceBlock_.getSvgRoot) {
      return this.sourceBlock_.getSvgRoot();
    }
    throw Error('angle field not bound');
  }
}
registerField('field_angle', SpikeAngleField);

// field_key_record: click the field, then press any key to bind it.
// Uses event.code (physical key, layout-independent) so the recorded value
// is stable no matter which modifiers are held. Values are LOWERCASE canonical
// names that must match what the desktop pynput listener (app.py
// _pynput_key_name) and the JS engine (js/engine/parser.js normKey) produce:
//   letters/digits/punctuation -> the character itself
//   ' ', ArrowUp, Enter, Tab, Backspace, Delete, Escape, Home, End,
//   PageUp/PageDown, Insert, F1-F24, Shift, Control, Alt, Meta, CapsLock

const KEY_CODE_MAP = {
  'Space': 'space', 'Enter': 'enter', 'NumpadEnter': 'enter',
  'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
  'ShiftLeft': 'shift', 'ShiftRight': 'shift',
  'ControlLeft': 'ctrl', 'ControlRight': 'ctrl',
  'AltLeft': 'alt', 'AltRight': 'alt',
  'MetaLeft': 'cmd', 'MetaRight': 'cmd',
  'Tab': 'tab', 'Backspace': 'backspace',
  'Delete': 'delete', 'ForwardDelete': 'delete',
  'Escape': 'esc', 'Home': 'home', 'End': 'end',
  'PageUp': 'page_up', 'PageDown': 'page_down',
  'Insert': 'insert', 'CapsLock': 'caps_lock',
  'Minus': '-', 'Equal': '=', 'BracketLeft': '[', 'BracketRight': ']',
  'Backslash': '\\', 'Semicolon': ';', 'Quote': "'", 'Backquote': '`',
  'Comma': ',', 'Period': '.', 'Slash': '/', 'IntlBackslash': '\\',
  'NumpadAdd': '+', 'NumpadSubtract': '-', 'NumpadMultiply': '*',
  'NumpadDivide': '/', 'NumpadDecimal': '.',
};
function canonicalKeyFromCode(code) {
  if (!code) return null;
  if (KEY_CODE_MAP[code]) return KEY_CODE_MAP[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase();
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m) { const n = parseInt(m[1], 10); if (n >= 1 && n <= 24) return 'f' + n; }
  return null;
}
function canonicalKeyFromEvent(e) {
  if (e && e.code) {
    const n = canonicalKeyFromCode(e.code);
    if (n) return n;
  }
  if (e && typeof e.key === 'string' && e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey) {
    return e.key.toLowerCase();
  }
  return null;
}

class KeyCaptureField extends Blockly.Field {
  constructor(value, validator, config) {
    super(value === undefined ? 'w' : value, validator, config);
    this.SERIALIZABLE = true;
    this.captureActive_ = false;
    this.pendingModifier_ = null;
    this._keyHandler_ = null;
    this._keyUpHandler_ = null;
    this._pointerHandler_ = null;
  }
  static fromJson(config) {
    return new this((config && config.value !== undefined) ? config.value : 'w',
                    undefined, config);
  }
  doClassValidation_(newValue) {
    return (typeof newValue === 'string' && newValue) ? newValue : 'w';
  }
  getText_() {
    if (this.captureActive_) return 'press a key...';
    const v = (this.getValue && this.getValue() != null) ? String(this.getValue()) : '';
    return /^[a-z]$/.test(v) ? v.toUpperCase() : v;
  }
  showEditor_() {
    const block = this.getSourceBlock();
    if (this.captureActive_ || !block || block.isInFlyout) return;
    this.armCapture_();
  }
  armCapture_() {
    this.captureActive_ = true;
    this.pendingModifier_ = null;
    this.forceRerender();
    const field = this;
    const modifiers = { shift: 1, ctrl: 1, alt: 1, cmd: 1 };
    const keyHandler = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { field.cancelCapture_(); return; }
      const name = canonicalKeyFromEvent(e);
      if (name === null) return;
      if (modifiers[name]) { field.pendingModifier_ = name; return; }
      field.commitCapture_(name);
    };
    const keyUpHandler = (e) => {
      if (!field.pendingModifier_) return;
      const name = canonicalKeyFromEvent(e);
      if (name === field.pendingModifier_) field.commitCapture_(name);
    };
    const pointerHandler = (e) => {
      if (field.fieldGroup_ && field.fieldGroup_.contains(e.target)) return;
      field.cancelCapture_();
    };
    this._keyHandler_ = keyHandler;
    this._keyUpHandler_ = keyUpHandler;
    this._pointerHandler_ = pointerHandler;
    window.addEventListener('keydown', keyHandler, true);
    window.addEventListener('keyup', keyUpHandler, true);
    window.addEventListener('pointerdown', pointerHandler, true);
  }
  commitCapture_(name) {
    this.captureActive_ = false;
    this.pendingModifier_ = null;
    this.teardownCapture_();
    this.setValue(name);
  }
  cancelCapture_() {
    this.captureActive_ = false;
    this.pendingModifier_ = null;
    this.teardownCapture_();
    this.forceRerender();
  }
  teardownCapture_() {
    if (this._keyHandler_) window.removeEventListener('keydown', this._keyHandler_, true);
    if (this._keyUpHandler_) window.removeEventListener('keyup', this._keyUpHandler_, true);
    if (this._pointerHandler_) window.removeEventListener('pointerdown', this._pointerHandler_, true);
    this._keyHandler_ = this._keyUpHandler_ = this._pointerHandler_ = null;
  }
  dispose() {
    this.teardownCapture_();
    super.dispose();
  }
}
registerField('field_key_record', KeyCaptureField);