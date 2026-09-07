/**
 * Settings helpers shared by the round-based games: limits, bursts, nested
 * module options, localStorage persistence and small coercion utilities.
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const obj = (value) => (value && typeof value === 'object' ? value : {});
const within = (value, { min, max }) => clamp(value, min, max);

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export const ROUND_LIMITS = deepFreeze({
  durationSec: { min: 5, max: 3600 },
  targetCount: { min: 1, max: 1000 },
  lifetimeMs: { min: 300, max: 10000 },
  burstSize: { min: 1, max: 50 },
  burstDelayMs: { min: 0, max: 30000 },
});

/** Bursts: targets arrive in random groups with random breaks in between. */
export const DEFAULT_BURSTS = deepFreeze({ enabled: false, minSize: 3, maxSize: 6, minDelayMs: 1000, maxDelayMs: 3000 });

/**
 * Coerce the fields every round-based game shares (durationSec, targetCount,
 * lifetimeMs, bursts, modules, moduleOptions). `defaults` supplies the game's
 * values; `modules` is its module registry (known ids + option schemas).
 */
export function normalizeRound(raw, defaults, modules = []) {
  const src = obj(raw);
  const s = {};
  s.durationSec = within(Math.round(num(src.durationSec, defaults.durationSec)), ROUND_LIMITS.durationSec);
  s.targetCount = within(Math.round(num(src.targetCount, defaults.targetCount)), ROUND_LIMITS.targetCount);
  s.lifetimeMs = within(Math.round(num(src.lifetimeMs, defaults.lifetimeMs)), ROUND_LIMITS.lifetimeMs);
  s.lifetimeMs = Math.min(s.lifetimeMs, s.durationSec * 1000); // a target can't outlive the round
  s.bursts = normalizeBursts(src.bursts, defaults.bursts ?? DEFAULT_BURSTS);

  const ids = modules.map((m) => m.id);
  const wanted = Array.isArray(src.modules) ? src.modules : defaults.modules ?? [];
  s.modules = wanted.filter((id) => ids.includes(id));
  s.moduleOptions = {};
  const rawOptions = obj(src.moduleOptions);
  for (const mod of modules) s.moduleOptions[mod.id] = resolveModuleOptions(mod, rawOptions[mod.id]);
  return s;
}

export function normalizeBursts(raw, defaults = DEFAULT_BURSTS) {
  const b = { ...defaults, ...obj(raw) };
  b.enabled = Boolean(b.enabled);
  b.minSize = within(Math.round(num(b.minSize, defaults.minSize)), ROUND_LIMITS.burstSize);
  b.maxSize = within(Math.round(num(b.maxSize, defaults.maxSize)), ROUND_LIMITS.burstSize);
  if (b.minSize > b.maxSize) [b.minSize, b.maxSize] = [b.maxSize, b.minSize];
  b.minDelayMs = within(Math.round(num(b.minDelayMs, defaults.minDelayMs)), ROUND_LIMITS.burstDelayMs);
  b.maxDelayMs = within(Math.round(num(b.maxDelayMs, defaults.maxDelayMs)), ROUND_LIMITS.burstDelayMs);
  if (b.minDelayMs > b.maxDelayMs) [b.minDelayMs, b.maxDelayMs] = [b.maxDelayMs, b.minDelayMs];
  return b;
}

/**
 * Merge a module's declared option defaults with whatever the player saved.
 * Option types: checkbox (boolean), number, range ([lo, hi] pair) and text (string).
 */
export function resolveModuleOptions(mod, raw) {
  const src = obj(raw);
  const out = {};
  const bound = (n, opt) => {
    if (opt.min !== undefined) n = Math.max(opt.min, n);
    if (opt.max !== undefined) n = Math.min(opt.max, n);
    return n;
  };
  for (const opt of mod.options ?? []) {
    const value = src[opt.id];
    if (opt.type === 'checkbox') {
      out[opt.id] = value === undefined ? Boolean(opt.default) : Boolean(value);
    } else if (opt.type === 'range') {
      const def = Array.isArray(opt.default) ? opt.default : [opt.min ?? 0, opt.max ?? 1];
      const pair = Array.isArray(value) ? value : def;
      let lo = bound(num(pair[0], def[0]), opt);
      let hi = bound(num(pair[1], def[1]), opt);
      if (lo > hi) [lo, hi] = [hi, lo];
      out[opt.id] = [lo, hi];
    } else if (opt.type === 'text') {
      let text = typeof value === 'string' ? value : String(opt.default ?? '');
      if (opt.maxLength) text = text.slice(0, opt.maxLength);
      out[opt.id] = text;
    } else {
      out[opt.id] = bound(num(value, opt.default ?? 0), opt);
    }
  }
  return out;
}

/** localStorage-backed settings, always passed through the game's normaliser. */
export function createSettingsStore(storageKey, normalize) {
  return {
    load(modules) {
      let raw = null;
      try {
        raw = JSON.parse(localStorage.getItem(storageKey));
      } catch {
        raw = null;
      }
      return normalize(raw, modules);
    },
    save(settings) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
      } catch {
        /* private mode / storage disabled: settings just won't persist */
      }
    },
  };
}

export function formatDuration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
