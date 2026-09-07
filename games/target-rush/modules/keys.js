import { KEYS, keysForGroups, parsePool } from '../../../shared/keyboard.js';

/**
 * Keyboard: targets are hit by pressing the key printed on them instead of
 * tapping. The key is chosen so its spot on a US QWERTY keyboard roughly
 * matches the target's spot on screen: top-left targets get keys like 1, Q, A;
 * bottom-right ones get keys like M, / or '.
 *
 * Nested options pick which key groups are in play (letters, numbers,
 * punctuation, mixable), or a custom pool of characters that overrides the
 * groups. Needs a physical keyboard.
 */

// Key assigned to each target index this round. Exclusions are computed from
// the schedule (not from what the player has hit), so peers stay in sync.
let assigned = new Map();

export default {
  id: 'keys',
  name: 'Keyboard',
  description:
    'Press the key printed on a target instead of tapping it. Keys roughly follow where the target sits on screen. Needs a physical keyboard.',
  usesKeyboard: true,
  options: [
    { id: 'letters', label: 'Letters', type: 'checkbox', default: true },
    { id: 'numbers', label: 'Numbers', type: 'checkbox', default: false },
    { id: 'punctuation', label: 'Punctuation', type: 'checkbox', default: false },
    {
      id: 'pool',
      label: 'Custom keys (overrides the groups above)',
      type: 'text',
      default: '',
      placeholder: 'e.g. asdfjkl;',
      maxLength: 64,
    },
  ],
  onRoundStart() {
    assigned = new Map();
  },
  onSpawn(target, engine) {
    const opts = engine.options('keys');
    let pool = parsePool(opts.pool);
    if (!pool.length) pool = keysForGroups(opts);
    if (!pool.length) pool = KEYS.filter((k) => k.category === 'letters');

    // Keys already showing on earlier targets that are still up by schedule.
    const taken = new Set();
    for (const t of engine.schedule.targets) {
      if (t.index >= target.index) break;
      if (t.expiresAt > target.spawnAt && assigned.has(t.index)) taken.add(assigned.get(t.index));
    }
    const free = pool.filter((k) => !taken.has(k.key));
    // A keyboard is about three times wider than it is tall, so weight x that way:
    // "close" then means physically close on the board, not just same row.
    const candidates = (free.length ? free : pool)
      .map((k) => ({ k, d: Math.hypot((k.x - target.nx) * 3, k.y - target.ny) }))
      .sort((a, b) => a.d - b.d);
    // One of the five closest keys: roughly where the target is, with some variety.
    const pick = candidates[engine.rng.int(0, Math.min(4, candidates.length - 1))].k;

    assigned.set(target.index, pick.key);
    target.key = pick.key;
    target.label = pick.key.toUpperCase();
  },
};
