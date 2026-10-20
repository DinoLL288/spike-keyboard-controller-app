// ==========================================================================
// Workspace -> program parser
// ==========================================================================
// Purpose : Turns a Blockly workspace JSON into the engine's {scripts: [[op,...]]} model.
// Depends : ./helpers.js
// Exports : parseWorkspace, normKey
//
// This file was split out of engine.js (the old single closure) so the
// web Block Studio engine can be understood one concern at a time.
// ---------------------------------------------------------------------

import { _chainFrom, _singleToModel } from './helpers.js';

// -------------------------------------------------------------------
// Workspace JSON -> { scripts: [[block, ...], ...] }
// -------------------------------------------------------------------
function parseWorkspace(workspaceJson) {
  const blocks = workspaceJson && typeof workspaceJson === 'object'
    ? (workspaceJson.blocks || {}) : {};
  let blist = Array.isArray(blocks) ? blocks
    : (Array.isArray(workspaceJson) ? workspaceJson
      : (Array.isArray(blocks.blocks) ? blocks.blocks : []));
  const programs = [];
  for (const bd of blist) {
    const chain = _chainFrom(bd);
    if (chain.length) programs.push(chain);
  }
  if (!programs.length) {
    programs.push([_singleToModel({ type: 'spike_when_program_starts', inputs: {}, fields: {} })]);
  }
  return { scripts: programs };
}
function normKey(name) {
  return String(name || 'space').trim().toLowerCase();
}

export { parseWorkspace, normKey };
