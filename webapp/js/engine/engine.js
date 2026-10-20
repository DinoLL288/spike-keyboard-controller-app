// ==========================================================================
// Runtime engine
// ==========================================================================
// Purpose : Executes a parsed program against a hub (motors, lights, sounds, sensors).
// Depends : ./constants.js
// Depends : ./helpers.js
// Depends : ./parser.js (normKey)
// Exports : Engine
//
// This file was split out of engine.js (the old single closure) so the
// web Block Studio engine can be understood one concern at a time.
// ---------------------------------------------------------------------

import { _hubDistance, _mmToUnit } from './helpers.js';
import { DEG_PER_CM, COLOR_NAMES, MOTOR_DEG_PER_SEC } from './constants.js';
import { normKey } from './parser.js';

function pct(value) {
  const n = Math.round(parseFloat(value));
  if (isNaN(n)) return 0;
  return Math.max(-100, Math.min(100, n));
}

function num(value) {
  return Math.round(parseFloat(value)) || 0;
}

class StopFlow extends Error {
  constructor(kind) { super(kind); this.kind = kind || 'stop_script'; }
}
class ExitLoop extends Error {}

class Engine {
  constructor(hub, opts) {
    opts = opts || {};
    this.hub = hub;
    this.log = opts.log || console.log;
    this.tone = opts.tone || null;
    this.toneFile = opts.toneFile || null;
    this.tonePhrase = opts.tonePhrase || null;
    this.bell = opts.bell || (() => {});
    this.lightCb = opts.lightCb || (() => {});
    this.volumeCb = opts.volumeCb || (() => {});
    this.pressed = new Set();
    this.vars = {};
    this.defines = {};
    this.default_speed = 50;
    this.volume = 100;
    this.broadcasts = {};
    this.cond_hats = [];
    this.t0 = 0;
    this.running = false;
    this._stop = false;
    this.tasks = new Set();   // tokens
    this.key_hats = {};
    this._sensorLogged = new Set();
    this.motorSpeeds = {};
  }

  _time() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000.0; }

  run(program) {
    this.stop();
    this._stop = false;
    this.running = true;
    this.defines = {};
    for (const script of program.scripts) {
      const hat = script[0];
      if (hat.op === 'define_block') this.defines[String(hat.params.name || 'my block')] = this._hatChain(hat, script);
    }
    this.vars = {};
    for (const script of program.scripts) {
      this._walkVars(script);
    }
    this.key_hats = {};
    this.broadcasts = {};
    this.cond_hats = [];
    this._sensorLogged = new Set();
    this.t0 = this._time();
    let started = 0;
    for (const script of program.scripts) {
      const hat = script[0];
      if (hat.op === 'program_starts') {
        this._spawn((token) => this._execChain(this._hatChain(hat, script), token));
        started += 1;
      } else if (hat.op === 'when_key_pressed') {
        const key = normKey(hat.params.key);
        (this.key_hats[key] = this.key_hats[key] || []).push(this._hatChain(hat, script));
      } else if (hat.op === 'when_hub_button_pressed') {
        this._spawn((token) => this._execChain(this._hatChain(hat, script), token));
        started += 1;
      } else if (hat.op === 'when_broadcast') {
        const name = String(hat.params.broadcast || 'message1');
        (this.broadcasts[name] = this.broadcasts[name] || []).push(this._hatChain(hat, script));
      } else if (hat.op === 'when_cond') {
        this.cond_hats.push([hat.params.cond, this._hatChain(hat, script)]);
      } else if (hat.op !== 'define_block') {
        // Standalone stacks (repeat/forever/while/wait/...) run once at start.
        this._spawn((token) => this._execChain(script.slice(), token));
        started += 1;
      }
    }
    for (const [cond, chain] of this.cond_hats) this._spawn((token) => this._condHatLoop(cond, chain, token));
    started += this.cond_hats.length;
    this.log(`Running: ${started} script(s) at start, ${Object.keys(this.key_hats).length} keyboard event(s) armed.`);
  }

  _walkVars(script) {
    const walk = (chain) => {
      for (const bl of chain) {
        if (['set_var', 'change_var', 'set_var_op', 'set_var_random', 'show_var'].includes(bl.op)) {
          const n = String(bl.params.var || 'x');
          if (!(n in this.vars)) this.vars[n] = 0;
        }
        walk(bl.body || []);
        walk(bl.alt || []);
      }
    };
    walk(script);
  }

  stop() {
    this.running = false;
    this._stop = true;
    for (const tk of this.tasks) tk.cancel();
    this.tasks.clear();
    try { this.hub.stop(); } catch (e) {}
  }

  _hatChain(hat, script) {
    return (hat.body || []).slice().concat(script.slice(1));
  }

  _motorPower(port, params) {
    let pwr = params.power;
    if (pwr == null) {
      pwr = this.motorSpeeds[String(port).trim().toUpperCase()];
      if (pwr == null) pwr = this.default_speed;
      pwr = pct(pwr);
    } else {
      pwr = pct(pwr);
    }
    if (params.reverse) pwr = -Math.abs(pwr);
    return pwr;
  }

  pressKey(name) {
    const n = normKey(name);
    if (this.pressed.has(n)) return;
    this.pressed.add(n);
    if (this.running && this.key_hats[n]) {
      for (const chain of this.key_hats[n]) this._spawn((token) => this._execChain(chain.slice(), token));
    }
  }

  releaseKey(name) {
    this.pressed.delete(normKey(name));
  }

  _spawn(fn) {
    const token = { cancelled: false, cancel() { this.cancelled = true; } };
    this.tasks.add(token);
    (async () => {
      try { await fn(token); } catch (e) {
        if (e instanceof StopFlow) {
          if (e.kind === 'stop_all') this.log('Program stopped.');
        } else if (!(e instanceof ExitLoop)) {
          if (this.running && !token.cancelled) {
            const msg = String((e && e.message) || e);
            if (/disconnect/i.test(msg)) {
              this.log('Hub disconnected — reconnect, then press Run again.');
            } else {
              this.log('Error in program: ' + e);
            }
          }
        }
      } finally {
        this.tasks.delete(token);
      }
    })();
  }

  async _condHatLoop(cond, chain, token) {
    let fired = false;
    while (this.running && !this._stop && !token.cancelled) {
      const ok = await this._evalCond(cond, token);
      if (ok && !fired) {
        fired = true;
        try { await this._execChain(chain.slice(), token); }
        catch (e) { if (e instanceof StopFlow) throw e; }
      } else if (!ok) {
        fired = false;
      }
      await sleepMs(50);
    }
  }

  async _execChain(chain, token) {
    try {
      for (const b of chain) {
        if (this._stop || (token && token.cancelled)) return;
        await this._execBlock(b, token);
      }
    } catch (e) {
      if (e instanceof StopFlow) {
        if (e.kind === 'stop_all') throw e;
        this.log('Stopped one program.');
        return;
      }
      throw e;
    }
  }

  async _execBlock(b, token) {
    const op = b.op;
    const p = b.params || {};
    const hub = this.hub;

    if (op === 'wait') {
      await sleepMs(Math.max(0, parseFloat(p.sec) || 1) * 1000);
    } else if (['move_forward', 'move_backward', 'turn_left', 'turn_right'].includes(op)) {
      let sp = pct(p.speed != null ? p.speed : this.default_speed);
      const secs = Math.max(0, parseFloat(p.time) || 1);
      if ((op === 'move_backward' || op === 'turn_right') && sp) sp = -Math.abs(sp);
      let l = sp, r = sp;
      if (op === 'turn_left') { l = -sp; r = sp; }
      if (op === 'turn_right') { l = sp; r = -sp; }
      await hub.drive(l, r);
      await sleepMs(secs * 1000);
      await hub.drive(0, 0);
    } else if (['move_deg_forward', 'move_deg_backward', 'turn_deg', 'move_cm_forward'].includes(op)) {
      let target = num(p.dist != null ? p.dist : 360);
      if (op === 'move_cm_forward') target = num(parseFloat(p.dist != null ? p.dist : 25) * DEG_PER_CM);
      let sp = pct(p.speed != null ? p.speed : this.default_speed);
      if (op === 'move_deg_backward') sp = -Math.abs(sp);
      let l = sp, r = sp;
      if (op === 'turn_deg') {
        l = -sp; r = sp;
        if (p.dir_reverse) { const t = l; l = r; r = t; }
      }
      await this._driveUntil(l, r, Math.abs(target), token);
    } else if (op === 'drive_wasd') {
      const speed = pct(p.speed != null ? p.speed : 50);
      const ports = this._pairPorts(p.pair);
      while (this.running && !this._stop && !(token && token.cancelled)) {
        let l = 0, r = 0;
        if (this.pressed.has('w')) { l = speed; r = speed; }
        if (this.pressed.has('s')) { l = -speed; r = -speed; }
        if (this.pressed.has('a')) l -= speed;
        if (this.pressed.has('d')) r -= speed;
        l = Math.max(-100, Math.min(100, l));
        r = Math.max(-100, Math.min(100, r));
        if (ports) {
          await hub.startMotor(ports[0], l);
          await hub.startMotor(ports[1], -r);
        } else {
          await hub.drive(l, r);
        }
        await sleepMs(50);
      }
      if (ports) {
        await hub.startMotor(ports[0], 0);
        await hub.startMotor(ports[1], 0);
      } else {
        await hub.drive(0, 0);
      }
    } else if (op === 'set_default_speed') {
      this.default_speed = pct(p.speed != null ? p.speed : 50);
    } else if (op === 'stop_moving') {
      await hub.drive(0, 0);
    } else if (op === 'start_motor' || op === 'motor_on') {
      await hub.startMotor(p.port || 'A', this._motorPower(p.port || 'A', p));
    } else if (op === 'stop_motor') {
      await hub.startMotor(p.port || 'A', 0);
    } else if (op === 'run_motor' || op === 'motor_time') {
      const port = p.port || 'A';
      const power = this._motorPower(port, p);
      const secs = Math.max(0, parseFloat(p.time) || 1);
      await hub.startMotor(port, power);
      await sleepMs(secs * 1000);
      await hub.startMotor(port, 0);
    } else if (op === 'set_motor_angle' || op === 'motor_angle') {
      const port = p.port || 'A';
      const power = this._motorPower(port, p);
      await this._angleDrivePort(port, num(p.deg != null ? p.deg : 90), power, token);
    } else if (op === 'goto_position') {
      const port = p.port || 'A';
      const power = this._motorPower(port, p);
      const target = num(p.deg != null ? p.deg : 0);
      const startAngle = this._portAngle(port);
      const estimate = this._estimateTurnSeconds(target - startAngle, power);
      await hub.startMotor(port, power);
      const t0 = this._time();
      const timeout = estimate + 3;
      while (this.running && !this._stop && !(token && token.cancelled)) {
        const elapsed = this._time() - t0;
        if (elapsed > timeout) break;
        const live = Math.abs(this._portAngle(port) - startAngle) > 0.5;
        if (live && Math.abs(this._portAngle(port) - target) <= 3) break;
        if (elapsed >= estimate) break;
        await sleepMs(60);
      }
      await hub.startMotor(port, 0);
    } else if (op === 'set_motor_speed') {
      const port = String(p.port || 'A');
      this.motorSpeeds[port.trim().toUpperCase()] = pct(p.power != null ? p.power : 50);
      this.log(`Motor ${port} speed = ${this.motorSpeeds[port.trim().toUpperCase()]}%`);
    } else if (op === 'change_speed') {
      const port = String(p.port || 'A').trim().toUpperCase();
      const current = this.motorSpeeds[port] != null ? this.motorSpeeds[port] : this.default_speed;
      this.motorSpeeds[port] = pct(current + num(p.amount != null ? p.amount : 0));
      this.log(`Motor ${port} speed = ${this.motorSpeeds[port]}%`);
    } else if (op === 'run_dual') {
      const power = pct(p.power != null ? p.power : this.default_speed);
      await hub.drive(pct(p.left != null ? p.left : 50) * power / 100 | 0,
        pct(p.right != null ? p.right : 50) * power / 100 | 0);
      await sleepMs(50);
    } else if (op === 'move_units' || op === 'steer_units') {
      const value = parseFloat(p.value != null ? p.value : 10);
      let unit = String(p.unit || 'cm');
      const sp = pct(p.speed != null ? p.speed : this.default_speed);
      let direction = String(p.direction || 'forward');
      let steeringRaw = p.steering;
      let steer = (typeof steeringRaw === 'number') ? steeringRaw : 100;
      if (typeof steeringRaw !== 'number') {
        steer = String(steeringRaw).toLowerCase() === 'left' ? -100 :
          (String(steeringRaw).toLowerCase() === 'right' ? 100 : parseFloat(steeringRaw) || 0);
      }
      steer = Math.max(-100, Math.min(100, steer));
      if (unit === 'seconds') {
        let l = sp, r = sp;
        if (direction === 'backward') { l = -sp; r = -sp; }
        if (op === 'steer_units') {
          const f = Math.abs(steer) / 100.0;
          if (steer < 0) { l = -sp * f; r = sp; }
          else if (steer > 0) { l = sp; r = -sp * f; }
          else { l = direction === 'backward' ? -sp : sp; r = l; }
        }
        await this._driveFor(l, r, value, token);
      } else {
        let degrees = unit === 'rotations' ? value * 360 : value;
        if (['cm', 'in (inches)', 'inches'].includes(unit)) {
          const factor = unit === 'in (inches)' ? 2.54 : 1.0;
          degrees = value * DEG_PER_CM * factor;
        }
        if (op === 'move_units') {
          if (direction === 'backward') {
            let sp2 = Math.abs(sp);
            this.log(''); // keep parity harmless
            sp = sp2; // direction handled below
            sp = -Math.abs(sp);
          }
          await this._driveUntil(sp, sp, Math.max(1, Math.round(degrees)), token);
        } else {
          const deg = Math.max(1, Math.round(degrees));
          const f = Math.abs(steer) / 100.0;
          if (steer < 0) await this._driveUntil(-sp * f, sp, deg, token);
          else if (steer > 0) await this._driveUntil(sp, -sp * f, deg, token);
          else await this._driveUntil(direction === 'backward' ? -sp : sp, direction === 'backward' ? -sp : sp, deg, token);
        }
      }
    } else if (op === 'start_move') {
      const sp = pct(p.speed != null ? p.speed : this.default_speed);
      if (String(p.direction || 'forward') === 'backward') await hub.drive(-sp, -sp);
      else await hub.drive(sp, sp);
      while (this.running && !this._stop && !(token && token.cancelled)) await sleepMs(50);
      await hub.drive(0, 0);
    } else if (op === 'start_steer') {
      const sp = pct(p.speed != null ? p.speed : this.default_speed);
      let steerv = p.steering;
      if (typeof steerv !== 'number') {
        steerv = String(steerv).toLowerCase() === 'left' ? -100 : (String(steerv).toLowerCase() === 'right' ? 100 : parseFloat(steerv) || 0);
      }
      steerv = Math.max(-100, Math.min(100, steerv));
      const f = Math.abs(steerv) / 100.0;
      if (steerv < 0) await hub.drive(-sp * f, sp);
      else if (steerv > 0) await hub.drive(sp, -sp * f);
      else await hub.drive(sp, sp);
      while (this.running && !this._stop && !(token && token.cancelled)) await sleepMs(50);
      await hub.drive(0, 0);
    } else if (op === 'start_dual') {
      const lp = pct(p.left != null ? p.left : 50);
      const rp = pct(p.right != null ? p.right : 50);
      while (this.running && !this._stop && !(token && token.cancelled)) {
        await hub.drive(lp, rp);
        await sleepMs(50);
      }
      await hub.drive(0, 0);
    } else if (op === 'set_pair' || op === 'set_dist_per_rot' || op === 'inapp') {
      this.log(p.msg != null ? p.msg : p.pair != null ? p.pair : p.value != null ? p.value + (p.unit ? ' ' + p.unit : '') : '');
    } else if (op === 'broadcast') {
      const name = String(p.broadcast || 'message1');
      const chains = this.broadcasts[name] || [];
      this.log(`Broadcast '${name}' to ${chains.length} stack(s)`);
      for (const chain of chains) this._spawn((token) => this._execChain(chain.slice(), token));
    } else if (op === 'stop_others') {
      for (const tk of Array.from(this.tasks)) {
        if (tk !== token) tk.cancel();
      }
    } else if (op === 'check_reflect') {
      const port = String(p.port || 'C');
      const cmpOp = p.op || '<';
      const value = parseFloat(p.value != null ? p.value : 50);
      while (this.running && !this._stop && !(token && token.cancelled)) {
        const reading = await this._readReflectivity(port);
        if (reading === null) { this.log(`Reflectivity sensor '${port}': no data (in-app).`); break; }
        if ((cmpOp === '<' && reading < value) || (cmpOp === '>' && reading > value) || (cmpOp === '=' && reading === value)) break;
        await sleepMs(60);
      }
    } else if (op === 'check_tilted') {
      while (this.running && !this._stop && !(token && token.cancelled)) {
        if (await this._readTilt()) break;
        await sleepMs(60);
      }
    } else if (op === 'check_orient') {
      const orientation = String(p.orientation || 'top');
      while (this.running && !this._stop && !(token && token.cancelled)) {
        if (await this._readOrientation() === orientation) break;
        await sleepMs(60);
      }
    } else if (op === 'check_pressed_btn') {
      this.log(`Waiting for ${p.button || 'left'} button (in-app).`);
    } else if (op === 'reset_yaw') {
      this.log('Yaw angle reset to 0 (in-app).');
    } else if (op === 'reset_timer') {
      this.t0 = this._time();
      this.log('Timer reset.');
    } else if (op === 'wait_timer') {
      const target = parseFloat(p.value != null ? p.value : 1);
      while (this.running && !this._stop && !(token && token.cancelled)) {
        if (this._time() - this.t0 > target) break;
        await sleepMs(50);
      }
    } else if (op === 'repeat') {
      const n = Math.max(0, num(p.n != null ? p.n : 4));
      for (let i = 0; i < n; i++) {
        if (this._stop || (token && token.cancelled)) return;
        try { await this._execChain((b.body || []).slice(), token); }
        catch (e) { if (e instanceof ExitLoop) break; if (e instanceof StopFlow) throw e; }
      }
    } else if (op === 'forever') {
      while (this.running && !this._stop && !(token && token.cancelled)) {
        try { await this._execChain((b.body || []).slice(), token); }
        catch (e) { if (e instanceof StopFlow) throw e; }
        await sleepMs(10);
      }
    } else if (op === 'while_key') {
      const key = normKey(p.key);
      while (this.running && !this._stop && !(token && token.cancelled)) {
        while (this.running && !this._stop && !(token && token.cancelled) && !this.pressed.has(key)) {
          await sleepMs(50);
        }
        while (this.running && !this._stop && !(token && token.cancelled) && this.pressed.has(key)) {
          await this._execChain((b.body || []).slice(), token);
          await sleepMs(10);
        }
      }
    } else if (op === 'while_cond') {
      while (this.running && !this._stop && !(token && token.cancelled)) {
        while (this.running && !this._stop && !(token && token.cancelled)
          && !(await this._evalCond(p.cond, token))) {
          await sleepMs(50);
        }
        while (this.running && !this._stop && !(token && token.cancelled)
          && await this._evalCond(p.cond, token)) {
          await this._execChain((b.body || []).slice(), token);
          await sleepMs(10);
        }
      }
    } else if (op === 'repeat_until') {
      while (this.running && !this._stop && !(token && token.cancelled)
        && !(await this._evalCond(p.cond, token))) {
        try { await this._execChain((b.body || []).slice(), token); }
        catch (e) { if (e instanceof ExitLoop) break; if (e instanceof StopFlow) throw e; }
        await sleepMs(10);
      }
    } else if (op === 'if_key') {
      if (this.pressed.has(normKey(p.key))) await this._execChain((b.body || []).slice(), token);
    } else if (op === 'if_cond') {
      if (await this._evalCond(p.cond, token)) await this._execChain((b.body || []).slice(), token);
    } else if (op === 'if_else') {
      if (await this._evalCond(p.cond, token)) await this._execChain((b.body || []).slice(), token);
      else await this._execChain((b.alt || []).slice(), token);
    } else if (op === 'exit_loop') {
      throw new ExitLoop();
    } else if (op === 'stop_script') {
      throw new StopFlow('stop_script');
    } else if (op === 'stop_all') {
      await hub.drive(0, 0);
      this._stop = true;
      throw new StopFlow('stop_all');
    } else if (op === 'wait_until_key') {
      const key = normKey(p.key);
      while (this.running && !this._stop && !(token && token.cancelled) && !this.pressed.has(key)) await sleepMs(50);
    } else if (op === 'wait_until_cond') {
      while (this.running && !this._stop && !(token && token.cancelled)) {
        if (await this._evalCond(p.cond, token)) break;
        await sleepMs(50);
      }
    } else if (op === 'set_var') {
      const val = this._resolveValue(p.value != null ? p.value : 0);
      if (typeof val === 'string' && isNaN(Number(val))) {
        this.vars[String(p.var || 'x')] = val;
      } else {
        this.vars[String(p.var || 'x')] = Math.round(Number(val)) || 0;
      }
      this.log(`${p.var || 'x'} = ${this.vars[String(p.var || 'x')]}`);
    } else if (op === 'change_var') {
      const name = String(p.var || 'x');
      this.vars[name] = (this.vars[name] || 0) + num(this._resolveValue(p.delta != null ? p.delta : 1));
      this.log(`${name} = ${this.vars[name]}`);
    } else if (op === 'set_var_op') {
      const name = String(p.var || 'x');
      const a = parseFloat(this._resolveValue(p.a != null ? p.a : 0));
      const b = parseFloat(this._resolveValue(p.b != null ? p.b : 0));
      const o = p.op || '+';
      let v = a + b;
      if (o === '-') v = a - b;
      else if (o === '×') v = a * b;
      else if (o === '÷') v = b ? a / b : 0;
      else if (o === 'min') v = Math.min(a, b);
      else if (o === 'max') v = Math.max(a, b);
      else if (o === 'avg') v = (a + b) / 2;
      this.vars[name] = Math.round(v);
      this.log(`${name} = ${this.vars[name]}`);
    } else if (op === 'set_var_random') {
      const name = String(p.var || 'x');
      const lo = num(p.lo != null ? p.lo : 1);
      const hi = num(p.hi != null ? p.hi : 10);
      this.vars[name] = Math.floor(Math.random() * (Math.max(lo, hi) - Math.min(lo, hi) + 1)) + Math.min(lo, hi);
      this.log(`${name} = ${this.vars[name]}`);
    } else if (op === 'show_var') {
      this.log(`${p.var || 'x'} = ${this.vars[String(p.var || 'x')] || 0}`);
    } else if (op === 'call_block') {
      const chain = this.defines[String(p.name || '')];
      if (chain) await this._execChain(chain.slice(), token);
    } else if (['wait_distance', 'color_check', 'force_check'].includes(op)) {
      await this._waitSensor(b, token);
    } else if (op === 'beep') {
      const bf = num(p.freq != null ? p.freq : 880);
      const bs = p.sec != null ? Math.max(0.05, parseFloat(p.sec)) : 0.12;
      this.log(`Beep ${bf} Hz (in-app)`);
      if (this.tone) {
        this.tone(bf, bs);
        await sleepMs(bs * 1000);
      } else {
        await this._beep();
      }
    } else if (op === 'play_tone') {
      if (!(p.sound && await this._playNamedSound(p.sound))) {
        const freq = num(p.freq != null ? p.freq : 440);
        const secs = Math.max(0.2, parseFloat(p.sec != null ? p.sec : 1));
        this.log(`Tone ${freq} Hz for ${secs.toFixed(1)}s (in-app)`);
        if (this.tone) {
          this.tone(freq, secs);
          await sleepMs(secs * 1000);
        } else {
          for (let i = 0; i < Math.round(secs); i++) {
            this.bell();
            await sleepMs(150);
          }
        }
      }
    } else if (op === 'set_volume') {
      this.volume = pct(p.vol != null ? p.vol : 100);
      this.volumeCb(this.volume / 100.0);
      this.log(`Volume set to ${this.volume}%`);
    } else if (op === 'hub_light' || op === 'pixels_all') {
      this.lightCb(String(p.color || 'green'));
      this.log(`Hub light = ${p.color} (in-app)`);
    } else if (op === 'pixels_off') {
      this.lightCb(null);
      this.log('Pixels off (in-app)');
    }
  }

  async _beep() {
    if (this.tone) this.tone(880, 0.12);
    else { this.bell(); }
    this.log('Beep (in-app)');
  }

  // Named sounds: official recording first, synth gesture next.
  // Returns true when something audible was played.
  async _playNamedSound(name) {
    if (this.toneFile) {
      try {
        const d = await this.toneFile(name, (this.volume || 100) / 100);
        if (d > 0) {
          this.log(`${name} (in-app)`);
          await sleepMs(d * 1000);
          return true;
        }
      } catch (e) {}
    }
    if (this.tonePhrase) {
      const phr = this.tonePhrase(name) || 0;
      if (phr > 0) {
        this.log(`${name} (in-app)`);
        await sleepMs(phr * 1000);
        return true;
      }
    }
    return false;
  }

  // -- movement helpers ----------------------------------------------
  // The hub bridge reports motor angles only about once a second, which is far
  // too coarse to stop a motor after a handful of degrees. So angle-based moves
  // run for an *estimated* duration and angle feedback is only used as an
  // opportunistic early stop once it is proven to be updating. A flat safety
  // timeout still guarantees we always stop.

  // Estimated seconds to turn |deg| degrees at the given speed (percent).
  _estimateTurnSeconds(deg, speedPct) {
    const speed = Math.abs(parseFloat(speedPct));
    const dps = MOTOR_DEG_PER_SEC * (isNaN(speed) || speed <= 0 ? 100 : speed) / 100;
    return Math.max(0.03, Math.abs(deg) / Math.max(1, dps));
  }

  // True once the hub has reported a changing angle for this port. Until then
  // angle feedback is unusable and moves are purely time-based.
  _angleFeedbackLive(port, startAngle) {
    return Math.abs(this._portAngle(port) - startAngle) > 0.5;
  }

  async _driveUntil(l, r, targetDeg, token) {
    const speed = Math.max(Math.abs(l), Math.abs(r));
    const estimate = this._estimateTurnSeconds(targetDeg, speed);
    await this.hub.drive(l, r);
    const base = this._travel();
    const t0 = this._time();
    const timeout = estimate + 3; // safety margin
    while (this.running && !this._stop && !(token && token.cancelled)) {
      const elapsed = this._time() - t0;
      if (elapsed > timeout) break;
      // Travel feedback is only trustworthy once it has moved off the baseline.
      if (Math.abs(this._travel() - base) > 0.5 && this._travel() - base >= targetDeg) break;
      if (elapsed >= estimate) break;
      await sleepMs(60);
    }
    await this.hub.drive(0, 0);
  }

  async _driveFor(l, r, secs, token) {
    await this.hub.drive(l, r);
    await sleepMs(Math.max(0, secs) * 1000);
    await this.hub.drive(0, 0);
  }

  async _angleDrivePort(port, deg, power, token) {
    const estimate = this._estimateTurnSeconds(deg, power);
    await this.hub.startMotor(port, power);
    const startAngle = this._portAngle(port);
    const t0 = this._time();
    const timeout = estimate + 3; // safety margin
    while (this.running && !this._stop && !(token && token.cancelled)) {
      const elapsed = this._time() - t0;
      if (elapsed > timeout) break;
      // Arrived early, but only once angle feedback is genuinely updating.
      if (this._angleFeedbackLive(port, startAngle) &&
          Math.abs(this._portAngle(port) - startAngle) >= Math.abs(deg)) break;
      if (elapsed >= estimate) break;
      await sleepMs(60);
    }
    await this.hub.startMotor(port, 0);
  }

  _pairPorts(pair) {
    const letters = String(pair || '').toUpperCase().replace(/[^A-F]/g, '').split('');
    if (letters.length < 2) return null;
    return [letters[0], letters[1]];
  }

  _portAngle(port) {
    const state = this.hub.state ? this.hub.state() : {};
    const n = normKey(port).toUpperCase();
    const v = parseFloat(state[n]);
    return isNaN(v) ? 0.0 : v;
  }

  _travel() {
    let ports = [];
    const prof = this.hub.profile;
    if (prof) ports = (prof.left_ports || []).concat(prof.right_ports || []);
    if (!ports.length) ports = ['A', 'B'];
    const angles = ports.filter(Boolean).map((p) => this._portAngle(p));
    if (!angles.length) return 0.0;
    return angles.reduce((a, b) => a + b, 0) / angles.length;
  }

  // -- values --------------------------------------------------------
  _resolveValue(value, depth) {
    depth = depth || 0;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (depth > 8) return 0.0;
      const vtype = value.type;
      if (vtype === 'sensor') {
        const sensor = value.sensor;
        if (sensor === 'timer') return this._timerElapsed();
        if (sensor === 'colour') {
          const cst = (this.hub && this.hub.state) ? this.hub.state() : null;
          const cv = cst ? cst['color_' + String(value.port || 'C').toUpperCase()] : undefined;
          if (cv === undefined || cv === null) return 0.0;
          const cn = parseInt(cv, 10);
          return isNaN(cn) ? 0.0 : cn;
        }
        if (sensor === 'distance') {
          const raw = _hubDistance(this, value.port);
          if (raw === null) {
            const key = 'distance:' + (value.port || '?');
            if (!this._sensorLogged.has(key)) {
              this._sensorLogged.add(key);
              this.log(`Sensor 'distance' on port '${value.port || '?'}': no data (in-app).`);
            }
            return 0.0;
          }
          return _mmToUnit(raw, value.unit);
        }
        const key = sensor + ':' + (value.port || '?');
        if (!this._sensorLogged.has(key)) {
          this._sensorLogged.add(key);
          this.log(`Sensor '${sensor}' on port '${value.port || '?'}': no data (in-app).`);
        }
        return 0.0;
      }
      if (vtype === 'math') {
        const op = value.op || '+';
        const a = this._resolveValue(value.a != null ? value.a : 0, depth + 1);
        const b = this._resolveValue(value.b != null ? value.b : 0, depth + 1);
        try {
          if (['+', 'add'].includes(op)) return a + b;
          if (['-', 'subtract'].includes(op)) return a - b;
          if (['*', 'multiply'].includes(op)) return a * b;
          if (op === 'divide') return b ? a / b : 0.0;
          if (op === 'mod') return b ? a % b : 0.0;
          if (op === 'min') return Math.min(a, b);
          if (op === 'max') return Math.max(a, b);
          if (op === 'join') return this._valStr(value.a) + this._valStr(value.b);
          if (op === 'round') return Math.round(a);
          if (op === 'ceil') return Math.ceil(a);
          if (op === 'floor') return Math.floor(a);
          if (op === 'sqrt') return a >= 0 ? Math.sqrt(a) : 0.0;
          if (op === 'abs') return Math.abs(a);
          if (op === 'sin') return Math.sin(a * Math.PI / 180);
          if (op === 'cos') return Math.cos(a * Math.PI / 180);
          if (op === 'tan') return Math.tan(a * Math.PI / 180);
          if (op === 'asin') return Math.asin(Math.max(-1, Math.min(1, a))) * 180 / Math.PI;
          if (op === 'acos') return Math.acos(Math.max(-1, Math.min(1, a))) * 180 / Math.PI;
          if (op === 'atan') return Math.atan(a) * 180 / Math.PI;
          if (op === 'ln') return a > 0 ? Math.log(a) : 0.0;
          if (op === 'log') return a > 0 ? Math.log10(a) : 0.0;
          if (op === 'e ^') return Math.exp(a);
          if (op === '10 ^') return Math.pow(10, a);
          if (op === 'random') {
            const lo = Math.min(Math.round(a), Math.round(b));
            const hi = Math.max(Math.round(a), Math.round(b));
            return lo === hi ? lo : Math.floor(Math.random() * (hi - lo + 1)) + lo;
          }
          if (op === 'letter') {
            const idx = Math.round(a) - 1;
            const s = this._valStr(value.s != null ? value.s : '');
            if (idx >= 0 && idx < s.length) return s[idx];
            return '';
          }
          if (op === 'length') return this._valStr(value.a).length;
        } catch (e) { return 0.0; }
      }
      return 0.0;
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (s.startsWith('{') && s.endsWith('}')) return this.vars[s.slice(1, -1)] || 0;
    }
    const n = parseFloat(value);
    return isNaN(n) ? 0.0 : n;
  }

  _valStr(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return String(this._resolveValue(value));
    if (typeof value === 'string') {
      const s = value.trim();
      if (s.startsWith('{') && s.endsWith('}')) return String(this.vars[s.slice(1, -1)] || '');
    }
    return String(value != null ? value : '');
  }

  async _evalCond(cond, token) {
    if (!cond || typeof cond !== 'object') return false;
    const kind = cond.type || 'key';
    if (kind === 'const') return !!cond.value;
    if (kind === 'neg') return !(await this._evalCond(cond.cond, token));
    if (kind === 'bool_op') {
      const l = await this._evalCond(cond.l, token);
      const r = await this._evalCond(cond.r, token);
      return cond.op === 'AND' ? (l && r) : (l || r);
    }
    if (kind === 'key') return this.pressed.has(normKey(cond.key));
    if (kind === 'contains') return String(cond.a).indexOf(String(cond.b)) >= 0;
    if (kind === 'var') {
      const name = String(cond.var || 'x');
      const a = this.vars[name] || 0;
      const b = this._resolveValue(cond.value != null ? cond.value : 0);
      const op = cond.op || '<';
      if (op === '<') return a < b;
      if (op === '>') return a > b;
      return a === b;
    }
    if (kind === 'distance') {
      const port = String(cond.port || 'C');
      const reading = await this._readDistance(port);
      if (reading === null) return false;
      if (cond.op === '>') return reading > parseFloat(cond.more != null ? cond.more : 50);
      if (cond.op === '=') return Math.trunc(reading) === parseInt(cond.eq != null ? cond.eq : 0, 10);
      return reading < parseFloat(cond.less != null ? cond.less : 50);
    }
    if (kind === 'num') {
      const a = this._resolveValue(cond.a != null ? cond.a : 0);
      const b = this._resolveValue(cond.b != null ? cond.b : 0);
      const op = cond.op || '<';
      if (op === '<') return a < b;
      if (op === '>') return a > b;
      if (op === '=') return a === b;
      if (op === '<=') return a <= b;
      if (op === '>=') return a >= b;
      return false;
    }
    if (kind === 'colour') {
      const seen = await this._readColour(String(cond.port || 'C'));
      return seen === cond.color;
    }
    if (kind === 'force') return await this._readForce(String(cond.port || 'C'));
    if (kind === 'reflect') {
      const value = this._resolveValue(cond.value != null ? cond.value : 50);
      const reading = await this._readReflectivity(String(cond.port || 'C'));
      if (reading === null) return false;
      const cmp = cond.op || '<';
      if (cmp === '>') return reading > value;
      if (cmp === '=') return reading === value;
      return reading < value;
    }
    if (kind === 'tilt') {
      const reading = await this._readOrientation();
      if (!(await this._readTilt())) return false;
      return String(reading) === String(cond.direction || 'left');
    }
    if (kind === 'orient') {
      const reading = await this._readOrientation();
      if (reading === null) return false;
      return String(reading) === String(cond.orientation || 'front');
    }
    if (kind === 'motion') return false;
    if (kind === 'button') return false;
    if (kind === 'between') {
      const v = this._resolveValue(cond.v != null ? cond.v : 0);
      const lo = this._resolveValue(cond.lo != null ? cond.lo : 0);
      const hi = this._resolveValue(cond.hi != null ? cond.hi : 0);
      return lo <= v && v <= hi;
    }
    return false;
  }

  async _waitSensor(b, token) {
    const p = b.params || {};
    const port = String(p.port || 'C');
    if (b.op === 'wait_distance') {
      const reading = await this._readDistance(port);
      if (reading === null) { this.log(`Sensor '${port}' not attached — skipped (in-app).`); return; }
      let cur = reading;
      while (cur >= parseFloat(p.dist != null ? p.dist : 50)) {
        await sleepMs(60);
        cur = await this._readDistance(port) || cur;
      }
    } else if (b.op === 'color_check') {
      let seen = await this._readColour(port);
      if (seen === null) { this.log(`Colour sensor '${port}' not attached — skipped.`); return; }
      while (seen !== (p.color != null ? p.color : 'None')) {
        await sleepMs(60);
        seen = await this._readColour(port);
      }
    } else if (b.op === 'force_check') {
      if (!(await this._readForce(port))) { this.log(`Force sensor '${port}' not attached — skipped.`); return; }
      while (await this._readForce(port)) { await sleepMs(60); }
    }
  }

  async _readDistance(port) { return _hubDistance(this, port); }
  async _readColour(port) {
    const p = String(port || 'C').toUpperCase();
    const st = (this.hub && this.hub.state) ? this.hub.state() : null;
    const v = st ? st['color_' + p] : undefined;
    if (v === undefined || v === null) { this.log(`Colour sensor '${port}': no sensor data (in-app).`); return null; }
    const key = 'colour-seen:' + p;
    if (!this._sensorLogged.has(key)) {
      this._sensorLogged.add(key);
      this.log(`Colour sensor '${p}' reads ${v} (${COLOR_NAMES[v] || 'unknown'}).`);
    }
    return String(v);
  }
  async _readForce(port) { this.log(`Force sensor '${port}': no sensor data (in-app).`); return false; }
  async _readReflectivity(port) { this.log(`Reflectivity sensor '${port}': no sensor data (in-app).`); return null; }
  async _readTilt() { this.log('Hub tilt: no data (in-app).'); return false; }
  async _readOrientation() { this.log('Hub orientation: no data (in-app).'); return null; }

  _timerElapsed() { return this._time() - this.t0; }
}

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }


export { Engine };
