// ==========================================================================
// Engine public API
// ==========================================================================
// Purpose : Single import point for the pages, matching the old window.BLOCK_ENGINE shape.
// Depends : ./engine.js
// Depends : ./parser.js
// Depends : ./constants.js
// Exports : Engine, parseWorkspace, BLOCK_MAP, normKey, DEG_PER_CM
//
// This file was split out of engine.js (the old single closure) so the
// web Block Studio engine can be understood one concern at a time.
// ---------------------------------------------------------------------

export { Engine } from './engine.js';
export { parseWorkspace, normKey } from './parser.js';
export { BLOCK_MAP, DEG_PER_CM } from './constants.js';
