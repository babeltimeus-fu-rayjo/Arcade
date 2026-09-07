/**
 * Target Rush settings: defaults, limits, normalisation and persistence.
 * Shared round fields (length, count, lifetime, bursts, modules) come from shared/engine/options.js.
 */
import {
  DEFAULT_BURSTS,
  ROUND_LIMITS,
  clamp,
  createSettingsStore,
  deepFreeze,
  formatDuration,
  normalizeRound,
  num,
  obj,
  resolveModuleOptions,
} from '../../shared/engine/options.js';

export const STORAGE_KEY = 'arcade.target-rush.settings.v1';

export const DEFAULT_SETTINGS = deepFreeze({
  durationSec: 15,
  targetCount: 25,
  lifetimeMs: 2000, // how long a target stays up before it counts as a miss
  sizePct: 14, // target diameter as % of the arena's shorter side
  bursts: DEFAULT_BURSTS,
  modules: [], // ids of enabled modules (see modules/index.js)
  moduleOptions: {}, // nested per-module options: { [moduleId]: { [optionId]: value } }
});

export const LIMITS = deepFreeze({ ...ROUND_LIMITS, sizePct: { min: 6, max: 30 } });

/** Coerce anything (form values, old localStorage blobs) into a valid settings object. */
export function normalizeSettings(raw, modules = []) {
  const src = obj(raw);
  const s = normalizeRound(src, DEFAULT_SETTINGS, modules);
  s.sizePct = clamp(Math.round(num(src.sizePct, DEFAULT_SETTINGS.sizePct)), LIMITS.sizePct.min, LIMITS.sizePct.max);
  return s;
}

const store = createSettingsStore(STORAGE_KEY, normalizeSettings);
export const loadSettings = (modules) => store.load(modules);
export const saveSettings = (settings) => store.save(settings);
export { formatDuration, resolveModuleOptions };
