import move from './move.js';
import double from './double.js';
import keys from './keys.js';
import shrink from './shrink.js';

/**
 * Module registry. Every module listed here appears as a checkbox in Settings
 * (with its nested options, if it declares any), and the enabled ones are handed
 * to the engine for each round. Modules stack. See shrink.js for the hook API.
 */
export const modules = [move, double, keys, shrink];
