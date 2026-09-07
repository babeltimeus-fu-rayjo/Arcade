/**
 * End-of-round titles: playful, always-positive badges picked from the round's
 * stats. Some reward good play (accuracy, speed, streaks), some celebrate silly
 * play (lots of stray presses, lots of watching), and a round always earns at
 * least three. Written for young typists, so nothing here ever scolds.
 *
 * `vocab` adapts the wording per game, e.g.
 *   { target: 'mole', targets: 'moles', stray: 'stray press', strays: 'stray presses', device: 'keyboard' }
 */

// group: only the best-matching title of a group is shown, so tiers don't stack.
const TITLES = [
  // ---- well earned ----
  {
    id: 'perfect', kind: 'good', group: 'accuracy', priority: 100, emoji: '👑', name: 'Flawless Legend',
    when: (s) => s.total > 0 && s.hits === s.total,
    blurb: (s, v) => `Every single ${v.target}. Wow!`,
  },
  {
    id: 'acc95', kind: 'good', group: 'accuracy', priority: 90, emoji: '🎯', name: 'Laser Focus',
    when: (s) => s.resolved >= 5 && s.accuracy >= 0.95,
    blurb: (s, v) => `Almost nothing got past you: ${Math.round(s.accuracy * 100)}% of the ${v.targets}.`,
  },
  {
    id: 'acc80', kind: 'good', group: 'accuracy', priority: 80, emoji: '🦅', name: 'Eagle Eyes',
    when: (s) => s.resolved >= 5 && s.accuracy >= 0.8,
    blurb: (s, v) => `You caught ${Math.round(s.accuracy * 100)}% of the ${v.targets}.`,
  },
  {
    id: 'acc60', kind: 'good', group: 'accuracy', priority: 60, emoji: '✋', name: 'Steady Hands',
    when: (s) => s.resolved >= 5 && s.accuracy >= 0.6,
    blurb: () => 'More hits than misses. Nice and steady.',
  },
  {
    id: 'fast', kind: 'good', group: 'speed', priority: 85, emoji: '⚡', name: 'Lightning Fingers',
    when: (s) => s.hits >= 3 && s.avgReactionMs != null && s.avgReactionMs <= 450,
    blurb: (s) => `About ${Math.round(s.avgReactionMs)} ms per hit. Blink and you'd miss it!`,
  },
  {
    id: 'quick', kind: 'good', group: 'speed', priority: 65, emoji: '🤠', name: 'Quick Draw',
    when: (s) => s.hits >= 3 && s.avgReactionMs != null && s.avgReactionMs <= 750,
    blurb: (s) => `Fast hands: about ${Math.round(s.avgReactionMs)} ms per hit.`,
  },
  {
    id: 'streak10', kind: 'good', group: 'streak', priority: 82, emoji: '🔥', name: 'Combo Champion',
    when: (s) => s.bestStreak >= 10,
    blurb: (s) => `${s.bestStreak} in a row without a miss!`,
  },
  {
    id: 'streak5', kind: 'good', group: 'streak', priority: 62, emoji: '🌶️', name: 'Hot Streak',
    when: (s) => s.bestStreak >= 5,
    blurb: (s) => `${s.bestStreak} in a row. Spicy!`,
  },
  {
    id: 'busy', kind: 'good', group: 'volume', priority: 55, emoji: '🐝', name: 'Busy Bee',
    when: (s) => s.hits >= 20,
    blurb: (s) => `${s.hits} hits in one round. Buzz buzz!`,
  },
  {
    id: 'clean', kind: 'good', group: 'strays', priority: 58, emoji: '🥒', name: 'Cool as a Cucumber',
    when: (s) => s.whiffs === 0 && s.hits >= 3,
    blurb: (s, v) => `Not a single ${v.stray}. So calm.`,
  },
  {
    id: 'finisher', kind: 'good', group: 'finish', priority: 20, emoji: '🏁', name: 'Round Finisher',
    when: (s) => s.reason !== 'quit',
    blurb: () => 'Played all the way to the end.',
  },
  {
    id: 'explorer', kind: 'good', group: 'base-good', priority: 5, emoji: '🧭', name: 'Brave Explorer',
    when: () => true,
    blurb: () => 'You showed up and gave it a go!',
  },

  // ---- gloriously silly ----
  {
    id: 'showoff', kind: 'silly', group: 'fun', priority: 72, emoji: '😎', name: 'Show-Off',
    when: (s) => s.total > 0 && s.hits === s.total,
    blurb: () => 'Okay, okay, we get it. You are amazing!',
  },
  {
    id: 'robot', kind: 'silly', group: 'fun', priority: 70, emoji: '🤖', name: 'Robot Suspect',
    when: (s) => s.resolved >= 5 && s.accuracy >= 0.9 && s.avgReactionMs != null && s.avgReactionMs <= 650,
    blurb: () => 'Are you secretly a robot? Just checking.',
  },
  {
    id: 'octopus', kind: 'silly', group: 'fun', priority: 25, emoji: '🐙', name: 'Octopus Arms',
    when: (s) => s.hits >= 8 && s.whiffs >= 3,
    blurb: () => 'So many keys, so little time. Eight arms would help!',
  },
  {
    id: 'oops', kind: 'silly', group: 'strays', priority: 36, emoji: '🌼', name: 'Oops-a-Daisy',
    when: (s) => s.hits >= 3 && s.whiffs >= 1 && s.whiffs <= 4,
    blurb: (s, v) => `${s.whiffs} ${s.whiffs === 1 ? v.stray : v.strays} snuck in. Happens to everyone!`,
  },
  {
    id: 'confetti', kind: 'silly', group: 'strays', priority: 75, emoji: '🎉', name: 'Confetti Cannon',
    when: (s) => s.whiffs >= 15 || (s.whiffs >= 8 && s.whiffs > s.hits),
    blurb: (s, v) => `${s.whiffs} ${v.strays}! That is a LOT of energy.`,
  },
  {
    id: 'drum', kind: 'silly', group: 'strays', priority: 50, emoji: '🥁', name: 'Drum Solo',
    when: (s) => s.whiffs >= 5,
    blurb: (s, v) => `${s.whiffs} ${v.strays}. What a beat!`,
  },
  {
    id: 'sprout', kind: 'silly', group: 'misses', priority: 48, emoji: '🌱', name: 'Fresh Sprout',
    when: (s) => s.hits === 0 && s.spawned > 0,
    blurb: () => 'Everyone starts somewhere. Time to grow!',
  },
  {
    id: 'watcher', kind: 'silly', group: 'misses', priority: 45, emoji: '🔍', name: 'Curious Watcher',
    when: (s) => s.hits > 0 && s.misses > s.hits && s.misses >= 3,
    blurb: (s, v) => `You watched ${s.misses} ${v.targets} very, very closely.`,
  },
  {
    id: 'warmup', kind: 'silly', group: 'misses', priority: 40, emoji: '🧙', name: 'Warm-Up Wizard',
    when: (s) => s.hits > 0 && s.misses >= s.hits && s.spawned >= 5,
    blurb: () => 'All warmed up now. The next round is yours!',
  },
  {
    id: 'panda', kind: 'silly', group: 'speed', priority: 42, emoji: '🐼', name: 'Patient Panda',
    when: (s) => s.hits >= 3 && s.avgReactionMs != null && s.avgReactionMs >= 1200,
    blurb: () => 'You took your time. Very, very calm.',
  },
  {
    id: 'snack', kind: 'silly', group: 'finish', priority: 44, emoji: '🍪', name: 'Snack Break Star',
    when: (s) => s.reason === 'quit',
    blurb: () => 'Stopped early. Ready when you are!',
  },
  {
    id: 'mixer', kind: 'silly', group: 'streak', priority: 30, emoji: '🎲', name: 'Mix Master',
    when: (s) => s.hits >= 3 && s.misses >= 3 && s.bestStreak <= 2,
    blurb: () => 'Hits and misses all shaken together. Fun!',
  },
  {
    id: 'buddy', kind: 'silly', group: 'base-silly', priority: 3, emoji: '🎹', name: 'Button Buddy',
    when: () => true,
    blurb: (s, v) => `You and the ${v.device} are getting to know each other.`,
  },
];

const DEFAULT_VOCAB = { target: 'target', targets: 'targets', stray: 'stray tap', strays: 'stray taps', device: 'screen' };

/**
 * Pick the round's titles: the best of each group, two well-earned then one
 * silly when both kinds apply, at least `min` in total and a bonus fourth for
 * something special.
 */
export function pickTitles(summary, vocab = {}, { min = 3, max = 4 } = {}) {
  const v = { ...DEFAULT_VOCAB, ...vocab };
  const matched = TITLES.filter((t) => t.when(summary)).sort((a, b) => b.priority - a.priority);
  const seenGroups = new Set();
  const good = [];
  const silly = [];
  for (const t of matched) {
    if (seenGroups.has(t.group)) continue;
    seenGroups.add(t.group);
    (t.kind === 'silly' ? silly : good).push(t);
  }

  const picked = [];
  const take = (list) => {
    const t = list.shift();
    if (t) picked.push(t);
  };
  take(good);
  take(silly);
  take(good);
  while (picked.length < min && (good.length || silly.length)) take(good.length ? good : silly);
  if (picked.length < max && (good[0]?.priority >= 80 || silly[0]?.priority >= 70)) {
    take(good[0]?.priority >= 80 ? good : silly);
  }

  return picked.map((t) => ({ id: t.id, kind: t.kind, emoji: t.emoji, name: t.name, blurb: t.blurb(summary, v) }));
}

/** Render title cards into a container (clears it first). */
export function renderTitles(container, titles) {
  container.replaceChildren();
  titles.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = `title-card title-${t.kind}`;
    card.style.setProperty('--i', String(i));
    const emoji = document.createElement('span');
    emoji.className = 'title-emoji';
    emoji.textContent = t.emoji;
    const name = document.createElement('strong');
    name.className = 'title-name';
    name.textContent = t.name;
    const blurb = document.createElement('small');
    blurb.className = 'title-blurb';
    blurb.textContent = t.blurb;
    card.append(emoji, name, blurb);
    container.append(card);
  });
}
