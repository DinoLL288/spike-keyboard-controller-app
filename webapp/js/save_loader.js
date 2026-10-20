// save_loader.js — shared Block Studio loader.
// Handles three inputs:
//   1) Official LEGO SPIKE *.llsp3 saves (a ZIP wrapping a Scratch SB3 project).
//   2) Raw Blockly serialization JSON (what Block Studio natively saves).
//   3) A bare Scratch "project.json" (SB3) dumped from an app project.
// The SB3 opcodes used by SPIKE match this studio's block types, so the graph
// converts almost 1:1. Blocks this studio doesn't know are skipped (with a
// warning) instead of failing the whole load.
//
// Exposed as window.OpenSpike:
//   readZipEntries(bytes)            -> {name: {method, compSize, ...}}
//   unzipEntry(bytes, entry)         -> Promise<Uint8Array>
//   loadProgramFromBytes(bytes)      -> Promise<{json, warnings, skipped, name}>
//   sb3ToBlocklyState(project)       -> {state, warnings, skipped}
//   workspaceState(blockStates)      -> Blockly-safe workspace state
window.OpenSpike = (function () {
  'use strict';

// Layout : webapp/js/save_loader.js (classic script, sets the OpenSpike global).
  // ---- Minimal ZIP reader (works without extra libraries) ----------------
  function readZipEntries(bytes) {
    const u = new Uint8Array(bytes);
    const dv = new DataView(bytes);
    // Find End Of Central Directory (PK\x05\x06) by scanning backwards.
    let eocd = -1;
    for (let i = u.length - 22; i >= 0; i--) {
      if (u[i] === 0x50 && u[i + 1] === 0x4b && u[i + 2] === 0x05 && u[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Not a ZIP file');
    const cdCount = dv.getUint16(eocd + 8, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    const entries = {};
    for (let i = 0; i < cdCount; i++) {
      if (dv.getUint32(cdOff, true) !== 0x02014b50) break; // central dir header sig
      const method = dv.getUint16(cdOff + 10, true);
      const compSize = dv.getUint32(cdOff + 20, true);
      const uncompSize = dv.getUint32(cdOff + 24, true);
      const nameLen = dv.getUint16(cdOff + 28, true);
      const extraLen = dv.getUint16(cdOff + 30, true);
      const commentLen = dv.getUint16(cdOff + 32, true);
      const localOff = dv.getUint32(cdOff + 42, true);
      const name = new TextDecoder('utf-8').decode(u.subarray(cdOff + 46, cdOff + 46 + nameLen));
      entries[name] = { method: method, compSize: compSize, uncompSize: uncompSize, localOff: localOff };
      cdOff += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function unzipEntry(bytes, entry) {
    const dv = new DataView(bytes);
    const nameLen = dv.getUint16(entry.localOff + 26, true);
    const extraLen = dv.getUint16(entry.localOff + 28, true);
    const dataStart = entry.localOff + 30 + nameLen + extraLen;
    const comp = new Uint8Array(bytes, dataStart, entry.compSize || entry.uncompSize);
    if (!entry.method) {
      return comp.slice(0, entry.uncompSize || entry.compSize);
    }
    if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress SPIKE save files (needs DecompressionStream).')
      }
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('Unsupported ZIP compression method ' + entry.method);
  }

  // ---- SB3 -> Blockly -----------------------------------------------------
  function knownType(type) {
    try {
      return !!(Blockly && Blockly.Blocks && Blockly.Blocks[type]);
    } catch (e) {
      return false;
    }
  }

  // A [depth, ref] input: ref may be a block id or a primitive like [4,"36"].
  function primitiveShadow(ref) {
    if (!Array.isArray(ref) || !Array.isArray(ref[1])) return null;
    const kind = ref[0];
    const val = ref[1][1];
    if (kind === 4 || kind === 5) {
      return { type: 'math_number', fields: { NUM: String(val) } };
    }
    if (kind === 3) {
      return { type: 'text', fields: { TEXT: String(val) } };
    }
    return null;
  }

  function convertBlock(node, blocks, warnings, skipped) {
    const type = node.opcode;
    if (!type) return null;
    if (!knownType(type)) {
      skipped.push(type);
      return null;
    }
    const out = { type: type };
    if (node.fields) {
      for (const k of Object.keys(node.fields)) {
        const v = node.fields[k];
        out.fields = out.fields || {};
        out.fields[k] = (Array.isArray(v) ? (v[0] != null ? v[0] : '') : (v != null ? v : '')).toString();
      }
    }
    if (node.inputs) {
      for (const name of Object.keys(node.inputs)) {
        const pair = node.inputs[name];
        if (!Array.isArray(pair)) continue;
        const depth = pair[0];
        const ref = pair[1];
        const shadowGuess = primitiveShadow(ref);
        let child = null;
        if (typeof ref === 'string' && blocks[ref]) {
          child = convertBlock(blocks[ref], blocks, warnings, skipped);
        }
        if (!child && !shadowGuess) continue; // empty or unrepresentable input
        out.inputs = out.inputs || {};
        if (shadowGuess) {
          out.inputs[name] = { shadow: shadowGuess };
        } else {
          out.inputs[name] = depth === 1 ? { shadow: child } : { block: child };
        }
      }
    }
    if (node.next && blocks[node.next]) {
      const nxt = convertBlock(blocks[node.next], blocks, warnings, skipped);
      if (nxt) out.next = { block: nxt };
    }
    return out;
  }

  function sb3ToBlocklyState(project) {
    const warnings = [];
    const skipped = [];
    const targets = (project && project.targets) || [];
    const target = targets.find(function (t) { return t && !t.isStage; })
      || targets[0];
    if (!target) return { error: 'No program blocks in this file.' };
    const blocks = target.blocks || {};
    const tops = Object.keys(blocks)
      .map(function (id) { return blocks[id]; })
      .filter(function (b) {
        return b && typeof b.opcode === 'string' && !b.shadow && b.parent == null;
      })
      .sort(function (a, b) {
        return (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0);
      });
    const states = [];
    for (let i = 0; i < tops.length; i++) {
      const node = tops[i];
      const st = convertBlock(node, blocks, warnings, skipped);
      if (!st) continue;
      st.x = node.x != null ? node.x : 20;
      st.y = node.y != null ? node.y : 20;
      states.push(st);
    }
    const vars = target.variables || {};
    if (Object.keys(vars).length) {
      const used = {};
      (function collect(list) {
        for (const b of (list || [])) {
          const op = b && b.opcode;
          if (op === 'data_variable' || op === 'data_setvariableto' || op === 'data_changevariableby') {
            used[op] = true;
          }
        }
      })(Object.values(blocks));
      if (Object.keys(used).length) {
        skipped.push('variables (data_*)');
        warnings.push('This program uses variables, which this studio does not support yet — those blocks were skipped.');
      }
    }
    return {
      state: workspaceState(states),
      warnings: warnings,
      skipped: skipped.filter(function (v, i, a) { return a.indexOf(v) === i; }),
    };
  }

  function workspaceState(blockStates) {
    return { blocks: { languageVersion: 0, blocks: blockStates } };
  }

  // ---- Top-level orchestration -------------------------------------------
  async function loadProgramFromBytes(bytes) {
    const u = new Uint8Array(bytes);
    if (u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b) {
      return loadLLSP3(bytes);
    }
    const text = new TextDecoder('utf-8').decode(u);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { error: 'Not a valid JSON program file: ' + e.message };
    }
    if (json && json.targets) {
      return { json: json, name: 'project.json', raw: true };
    }
    if (json && json.blocks) {
      return { json: json, name: 'blocks.json', raw: true };
    }
    return { error: 'Unrecognized file format.' };
  }

  async function loadLLSP3(bytes) {
    let entries;
    try {
      entries = readZipEntries(bytes);
    } catch (e) {
      return { error: 'Not a readable SPIKE save file: ' + e.message };
    }
    const names = Object.keys(entries);
    let sb3Name = 'scratch.sb3';
    if (!entries[sb3Name]) {
      const alt = names.find(function (n) { return n.endsWith('.sb3'); });
      if (alt) sb3Name = alt;
    }
    try {
      if (entries[sb3Name]) {
        const sb3 = await unzipEntry(bytes, entries[sb3Name]);
        const inner = readZipEntries(sb3.buffer);
        const proj = 'project.json' in inner ? 'project.json'
          : Object.keys(inner).find(function (n) { return n === 'project.json'; });
        if (!proj) return { error: 'SPIKE save has no project.json.' };
        const raw = await unzipEntry(sb3.buffer, inner[proj]);
        const project = JSON.parse(new TextDecoder('utf-8').decode(raw));
        return { json: project, name: 'SPIKE project', raw: true };
      }
      if (entries['project.json']) {
        const raw = await unzipEntry(bytes, entries['project.json']);
        const project = JSON.parse(new TextDecoder('utf-8').decode(raw));
        return { json: project, name: 'SPIKE project', raw: true };
      }
    } catch (e) {
      return { error: 'Could not read SPIKE save contents: ' + e.message };
    }
    return { error: 'Not a SPIKE save file (no project inside).' };
  }

  return {
    readZipEntries: readZipEntries,
    unzipEntry: unzipEntry,
    sb3ToBlocklyState: sb3ToBlocklyState,
    workspaceState: workspaceState,
    loadProgramFromBytes: loadProgramFromBytes,
  };
})();