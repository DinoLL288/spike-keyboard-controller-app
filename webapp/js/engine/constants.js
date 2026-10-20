// ==========================================================================
// Engine constants
// ==========================================================================
// Purpose : Static tables that map Blockly block types/fields onto engine ops.
// Depends : (none)
// Exports : DEG_PER_CM, COLOR_NAMES, BLOCK_MAP, HAT_TYPES, CBLOCK_TYPES, ALT_TYPES, FIELD_MAP
//
// This file was split out of engine.js (the old single closure) so the
// web Block Studio engine can be understood one concern at a time.
// ---------------------------------------------------------------------

const DEG_PER_CM = 20.57;

// Motor shaft speed used for time-based moves. The hub bridge only reports the
// motor angle about once a second, which is far too coarse to stop a motor
// after a few degrees (a 1deg move used to spin for the full safety timeout).
// So angle blocks run for an estimated duration instead, and angle feedback is
// only used as an opportunistic early stop when it is actually updating.
// ~1 rotation (360deg) per second at 100% power.
const MOTOR_DEG_PER_SEC = 360;

// Firmware colour-sensor ints reported by the hub bridge as c<port>=<int>.
const COLOR_NAMES = {
  '-1': 'none', 0: 'black', 1: 'magenta', 2: 'purple', 3: 'blue',
  4: 'azure', 5: 'turquoise', 6: 'green', 7: 'yellow', 8: 'orange',
  9: 'red', 10: 'white'
};

// -------------------------------------------------------------------
// Blockly block type -> engine op mapping (from app.py BLOCK_MAP)
// -------------------------------------------------------------------
const BLOCK_MAP = {
  spike_when_program_starts: 'program_starts',
  spike_when_button_pressed: 'when_hub_button_pressed',
  keyboard_when_key_pressed: 'when_key_pressed',
  keyboard_while_key_pressed: 'while_key',
  keyboard_while_key_blank: 'while_cond',
  keyboard_drive_wasd: 'drive_wasd',
  spike_move: 'move_cm_forward',
  spike_turn: 'turn_deg',
  spike_stop_move: 'stop_moving',
  spike_set_speed: 'set_default_speed',
  spike_motor_run: 'set_motor_angle',
  spike_motor_stop: 'stop_motor',
  spike_motor_set_speed: 'start_motor',
  spike_light_on: 'pixels_all',
  spike_light_off: 'pixels_off',
  spike_center_light: 'hub_light',
  spike_beep: 'beep',
  spike_play_sound: 'play_tone',
  spike_is_color: 'color_check',
  spike_while: 'while_cond',
  control_repeat: 'repeat',
  control_forever: 'forever',
  control_if: 'if_cond',
  control_if_else: 'if_else',
  control_wait_until: 'wait_until_cond',
  control_repeat_until: 'repeat_until',
  control_wait: 'wait',
  variables_set: 'set_var',
  math_change: 'change_var',
  flippermotor_motorTurnForDirection: 'motor_angle',
  flippermotor_motorGoDirectionToPosition: 'goto_position',
  flippermotor_motorStartDirection: 'motor_on',
  flippermotor_motorSetSpeed: 'set_motor_speed',
  flippermotor_motorChangeSpeed: 'change_speed',
  flippermotor_motorStop: 'stop_motor',
  flippermove_move: 'move_units',
  flippermove_steer: 'steer_units',
  flippermove_startMove: 'start_move',
  flippermove_startSteer: 'start_steer',
  flippermove_stopMove: 'stop_moving',
  flippermove_movementSpeed: 'set_default_speed',
  flippermove_setMovementPair: 'set_pair',
  flippermove_setDistance: 'set_dist_per_rot',
  flipperlight_centerButtonLight: 'hub_light',
  flipperlight_lightDisplayOff: 'pixels_off',
  flipperlight_lightDisplayImageOn: 'inapp',
  flipperlight_lightDisplayImageOnForTime: 'inapp',
  flipperlight_lightDisplayText: 'inapp',
  flipperlight_lightDisplaySetBrightness: 'inapp',
  flipperlight_lightDisplaySetPixel: 'inapp',
  flipperlight_lightDisplayRotate: 'inapp',
  flipperlight_lightDisplaySetOrientation: 'inapp',
  flipperlight_ultrasonicLightUp: 'inapp',
  flippersound_playSound: 'inapp',
  flippersound_playSoundUntilDone: 'inapp',
  flippersound_beep: 'beep',
  flippersound_beepForTime: 'play_tone',
  flippersound_stopSound: 'inapp',
  sound_changevolumeby: 'inapp',
  sound_setvolumeto: 'set_volume',
  sound_changeeffectby: 'inapp',
  sound_seteffectto: 'inapp',
  sound_cleareffects: 'inapp',
  flippercontrol_stop: 'stop_script',
  flippercontrol_stopOtherStacks: 'stop_others',
  flipperevents_whenProgramStarts: 'program_starts',
  flipperevents_whenCondition: 'when_cond',
  flipperevents_whenColor: 'when_cond',
  flipperevents_whenPressed: 'when_cond',
  flipperevents_whenDistance: 'when_cond',
  flipperevents_whenTilted: 'when_cond',
  flipperevents_whenOrientation: 'when_cond',
  flipperevents_whenGesture: 'when_cond',
  flipperevents_whenButton: 'when_cond',
  flipperevents_whenTimer: 'when_cond',
  event_whenbroadcastreceived: 'when_broadcast',
  event_broadcast: 'broadcast',
  event_broadcastandwait: 'broadcast',
  flippermoremotor_motorGoToRelativePosition: 'motor_angle',
  flippermoremotor_motorStartPower: 'motor_on',
  flippermoremotor_motorSetStopMethod: 'inapp',
  flippermoremotor_motorSetAcceleration: 'inapp',
  flippermoremotor_motorSetDegreeCounted: 'inapp',
  flippermoremove_startDualSpeed: 'run_dual',
  flippermoremove_movementSetStopMethod: 'inapp',
  flippermoremove_movementSetAcceleration: 'inapp',
  flippermoresensors_setOrientation: 'check_orient',
  flippermoresensors_resetYaw: 'reset_yaw',
  flippersensors_resetYaw: 'reset_yaw',
  flippersensors_resetTimer: 'reset_timer',
};

const HAT_TYPES = new Set([
  'spike_when_program_starts', 'spike_when_button_pressed',
  'keyboard_when_key_pressed',
  'flipperevents_whenProgramStarts', 'flipperevents_whenCondition',
  'flipperevents_whenColor', 'flipperevents_whenPressed',
  'flipperevents_whenDistance', 'flipperevents_whenTilted',
  'flipperevents_whenOrientation', 'flipperevents_whenGesture',
  'flipperevents_whenButton', 'flipperevents_whenTimer',
  'event_whenbroadcastreceived',
]);

const CBLOCK_TYPES = new Set([
  'keyboard_while_key_pressed', 'keyboard_while_key_blank',
  'spike_while', 'control_repeat',
  'control_forever', 'control_if', 'control_if_else',
  'control_wait_until', 'control_repeat_until',
]);

const ALT_TYPES = new Set(['control_if_else']);

const FIELD_MAP = {
  spike_move: { DIR: 'direction', STEPS: 'dist' },
  spike_turn: { DIR: 'direction', None: 'dist' },
  spike_set_speed: { SPEED: 'speed' },
  spike_motor_run: { PORT: 'port', DIR: 'direction', DEG: 'deg' },
  spike_motor_stop: { PORT: 'port' },
  spike_motor_set_speed: { PORT: 'port', SPEED: 'power' },
  spike_center_light: { COLOR: 'color' },
  spike_beep: {},
  spike_play_sound: { SOUND: 'sound' },
  keyboard_when_key_pressed: { KEY: 'key' },
  keyboard_while_key_pressed: { KEY: 'key' },
  keyboard_while_key_blank: {},
  keyboard_drive_wasd: { SPEED: 'speed' },
  spike_when_button_pressed: { BUTTON: 'button' },
  math_change: { VAR: 'var', DELTA: 'delta' },
};

export {
  DEG_PER_CM, MOTOR_DEG_PER_SEC, COLOR_NAMES, BLOCK_MAP, HAT_TYPES,
  CBLOCK_TYPES, ALT_TYPES, FIELD_MAP,
};
