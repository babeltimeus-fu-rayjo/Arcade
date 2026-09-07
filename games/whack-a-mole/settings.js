/**
 * Whack-a-Mole settings. Shared round fields (length, count, lifetime, bursts,
 * modules) come from shared/engine/options.js; `keys` picks which keys moles use.
 */
import {
  DEFAULT_BURSTS,
  ROUND_LIMITS,
  createSettingsStore,
  deepFreeze,
  formatDuration,
  normalizeRound,
  obj,
} from '../../shared/engine/options.js';

export const STORAGE_KEY = 'arcade.whack-a-mole.settings.v1';

export const DEFAULT_SETTINGS = deepFreeze({
  durationSec: 15,
  targetCount: 25, // moles
  lifetimeMs: 2000, // how long a mole stays up before it counts as a miss
  bursts: DEFAULT_BURSTS,
  keys: { letters: true, numbers: false, punctuation: false, pool: '' },
  modules: [],
  moduleOptions: {},
});

export const LIMITS = ROUND_LIMITS;
const POOL_MAX_LENGTH = 64;

export function normalizeSettings(raw, modules = []) {
  const src = obj(raw);
  const s = normalizeRound(src, DEFAULT_SETTINGS, modules);
  const k = { ...DEFAULT_SETTINGS.keys, ...obj(src.keys) };
  s.keys = {
    letters: Boolean(k.letters),
    numbers: Boolean(k.numbers),
    punctuation: Boolean(k.punctuation),
    pool: typeof k.pool === 'string' ? k.pool.slice(0, POOL_MAX_LENGTH) : '',
  };
  return s;
}

const store = createSettingsStore(STORAGE_KEY, normalizeSettings);
export const loadSettings = (modules) => store.load(modules);
export const saveSettings = (settings) => store.save(settings);
export { formatDuration };
