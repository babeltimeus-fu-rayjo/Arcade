import { KEYS, boardKeyFor, keysForGroups, parsePool } from '../../shared/keyboard.js';

const FADE_MS = 300; // a whacked or missed mole is still animating for about this long
const MIN_LIFE_MS = 500;

/** Keys moles may use for these settings: the custom pool if given, else the enabled groups. */
export function activeKeys(keySettings) {
  const pool = parsePool(keySettings?.pool).filter((k) => boardKeyFor(k.key));
  if (pool.length) return pool;
  const groups = keysForGroups(keySettings);
  return groups.length ? groups : KEYS.filter((k) => k.category === 'letters');
}

// Which key each mole gets is decided while the round is planned, from the
// schedule alone, so every peer sharing a seed sees the same moles.
let assignments = [];

/**
 * Always-on core "module": gives every planned mole a key that no other mole
 * holds at the same time. If every key is busy, the mole waits for one to free
 * up; only a pool too small for the pace makes moles double up.
 */
export const molePlanner = {
  id: 'moles',
  usesKeyboard: true,
  onPlanStart() {
    assignments = [];
  },
  onPlan(planned, engine) {
    const pool = activeKeys(engine.settings.keys);
    const durationMs = engine.settings.durationSec * 1000;
    const lifetime = planned.lifetimeMs;
    let spawnAt = planned.spawnAt;

    for (let tries = 0; tries < 24; tries++) {
      const busy = assignments.filter((a) => a.expiresAt + FADE_MS > spawnAt && a.spawnAt < spawnAt + lifetime + FADE_MS);
      const free = pool.filter((k) => !busy.some((a) => a.key === k.key));
      if (free.length) {
        assign(planned, free[engine.rng.int(0, free.length - 1)], spawnAt);
        return;
      }
      const nextFree = Math.min(...busy.map((a) => a.expiresAt)) + FADE_MS + 1;
      if (nextFree + MIN_LIFE_MS > durationMs) break;
      spawnAt = nextFree;
    }
    assign(planned, pool[engine.rng.int(0, pool.length - 1)], planned.spawnAt); // pool too small: double up
  },
};

function assign(planned, entry, spawnAt) {
  planned.spawnAt = spawnAt;
  planned.key = entry.key;
  planned.label = entry.key.toUpperCase();
  assignments.push({ key: entry.key, spawnAt, expiresAt: spawnAt + planned.lifetimeMs });
}
