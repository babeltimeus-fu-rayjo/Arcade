import { createRng } from '../rng.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const PLACEMENT_ATTEMPTS = 40;
const FADE_MS = 300; // an expired target is still fading out for about this long

/** Gap between consecutive targets inside one burst. Short lifetimes get tighter bursts. */
export function burstStagger(lifetimeMs) {
  return clamp(lifetimeMs * 0.12, 60, 220);
}

/**
 * Build the complete, deterministic plan for a round: when every target
 * appears, how long it lives and where it sits.
 *
 * Everything needed to reproduce the round is (seed, settings, arena), so two
 * peers given the same inputs play the exact same round. Positions are stored
 * normalised (0..1 across the arena) so they scale to any screen.
 *
 * Targets never overlap: each one reserves a circular footprint (its radius,
 * plus the reach of its path if it moves) and is only placed where that
 * footprint clears every target that is on screen at the same time. When the
 * arena is too crowded, a mover stands still instead, and a target that still
 * has no room waits for a neighbour to expire before it appears.
 *
 * @param {object} input
 * @param {number} input.seed
 * @param {object} input.settings  durationSec, targetCount, lifetimeMs, bursts
 * @param {{aspect:number,radiusFrac:number}} input.arena
 *        aspect = width / height, radiusFrac = target radius / shorter side.
 * @param {(planned: object, geometry: object) => void} [input.onPlan]
 *        Called for each target before it is placed. Modules use it to change
 *        `lifetimeMs`, widen `footprint` (radius + path amplitude) or attach `motion`.
 */
export function buildSchedule({ seed, settings, arena, onPlan }) {
  const rng = createRng(seed);
  const { durationSec, targetCount, lifetimeMs } = settings;
  const durationMs = durationSec * 1000;

  // Spawns are spread so the last target expires before time is up.
  const spawnWindow = Math.max(0, durationMs - lifetimeMs);
  const useBursts = Boolean(settings.bursts?.enabled);
  const spawnTimes = useBursts
    ? burstSpawnTimes(rng, settings, spawnWindow)
    : steadySpawnTimes(rng, targetCount, spawnWindow);

  // Work in "shorter-side units": the arena's shorter side is 1.
  const aspect = arena.aspect > 0 ? arena.aspect : 1;
  const geometry = {
    width: aspect >= 1 ? aspect : 1,
    height: aspect >= 1 ? 1 : 1 / aspect,
    radius: Math.max(0.01, arena.radiusFrac || 0.07),
  };
  const { width, height, radius } = geometry;
  const gap = radius * 0.3; // breathing room between neighbours

  const targets = [];
  let delayed = 0;
  for (let index = 0; index < targetCount; index++) {
    const planned = { index, spawnAt: spawnTimes[index], lifetimeMs, expiresAt: 0, footprint: radius, motion: null };
    onPlan?.(planned, geometry);
    planned.footprint = Math.max(radius, planned.footprint || radius);
    fitLifetime(planned, durationMs);
    if (placeTarget(rng, planned, targets, geometry, gap, { baseLifetimeMs: lifetimeMs, durationMs })) delayed++;
    targets.push(planned);
  }

  // Waiting for room can reorder spawns; the engine spawns in array order.
  targets.sort((a, b) => a.spawnAt - b.spawnAt || a.index - b.index);
  targets.forEach((t, i) => {
    t.index = i;
  });

  return { seed, durationMs, geometry, mode: useBursts ? 'bursts' : 'steady', targets, delayed };
}

/** Modules may change a target's life, but nothing outlives the round. */
function fitLifetime(planned, durationMs) {
  planned.lifetimeMs = clamp(Math.round(planned.lifetimeMs), 1, Math.max(1, durationMs - planned.spawnAt));
  planned.expiresAt = planned.spawnAt + planned.lifetimeMs;
}

/**
 * Place a target where its footprint clears everything on screen at the same
 * time *by schedule* (not by what the player did, so every peer computes the
 * same layout). Fallbacks, in order: random tries, a grid sweep, standing still
 * instead of moving, waiting for a neighbour to expire, and finally the
 * least-bad spot. Returns true if the spawn had to be delayed.
 */
function placeTarget(rng, planned, placed, geometry, gap, { baseLifetimeMs, durationMs }) {
  const MAX_WAITS = 12;
  const MIN_LIFE_MS = 500;
  let waits = 0;
  let spot;
  for (;;) {
    const neighbours = placed.filter(
      (t) => t.expiresAt + FADE_MS > planned.spawnAt && t.spawnAt < planned.expiresAt + FADE_MS,
    );
    spot = findSpot(rng, planned.footprint, neighbours, geometry, gap);
    if (!spot.clear) spot = sweepSpot(planned.footprint, neighbours, geometry, gap, spot);
    if (spot.clear) break;

    if (planned.motion) {
      // No room for the whole path: keep the target, but let it stand still.
      planned.motion = null;
      planned.footprint = geometry.radius;
      planned.lifetimeMs = baseLifetimeMs;
      fitLifetime(planned, durationMs);
      continue;
    }

    // No room at all right now: appear once the first neighbour is gone.
    const nextFree = Math.min(...neighbours.map((n) => n.expiresAt)) + FADE_MS + 1;
    if (waits >= MAX_WAITS || nextFree + MIN_LIFE_MS > durationMs) break;
    waits++;
    planned.spawnAt = nextFree;
    fitLifetime(planned, durationMs);
  }

  planned.x = spot.x; // shorter-side units
  planned.y = spot.y;
  planned.nx = spot.x / geometry.width; // normalised 0..1 for CSS percentages
  planned.ny = spot.y / geometry.height;
  return waits > 0;
}

function clearanceAt(x, y, footprint, neighbours) {
  let clearance = Infinity;
  for (const n of neighbours) {
    clearance = Math.min(clearance, Math.hypot(x - n.x, y - n.y) - (footprint + n.footprint));
  }
  return clearance;
}

/** A random spot whose footprint clears every neighbour's, or the least-bad one found. */
function findSpot(rng, footprint, neighbours, { width, height }, gap) {
  const margin = footprint * 1.1;
  let best = null;
  let bestClearance = -Infinity;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const x = width > 2 * margin ? rng.range(margin, width - margin) : width / 2;
    const y = height > 2 * margin ? rng.range(margin, height - margin) : height / 2;
    const clearance = clearanceAt(x, y, footprint, neighbours);
    if (clearance > bestClearance) {
      bestClearance = clearance;
      best = { x, y, clearance };
    }
    if (clearance >= gap) break;
  }
  return { ...best, clear: bestClearance >= gap };
}

/** Systematic sweep of the arena on a grid, for when random tries came up empty. */
function sweepSpot(footprint, neighbours, { width, height }, gap, fallback) {
  const margin = footprint * 1.1;
  const step = Math.max(footprint / 2, 0.01);
  const cols = Math.min(80, Math.max(1, Math.floor((width - 2 * margin) / step) + 1));
  const rows = Math.min(80, Math.max(1, Math.floor((height - 2 * margin) / step) + 1));
  let best = fallback;
  let bestClearance = fallback.clearance ?? -Infinity;
  for (let i = 0; i < cols; i++) {
    const x = cols === 1 ? width / 2 : margin + ((width - 2 * margin) * i) / (cols - 1);
    for (let j = 0; j < rows; j++) {
      const y = rows === 1 ? height / 2 : margin + ((height - 2 * margin) * j) / (rows - 1);
      const clearance = clearanceAt(x, y, footprint, neighbours);
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = { x, y, clearance };
      }
    }
  }
  return { ...best, clear: bestClearance >= gap };
}

/** Evenly spaced slots with jitter: ordered but not metronomic. */
function steadySpawnTimes(rng, count, window) {
  const slot = window / count;
  return Array.from({ length: count }, (_, i) => slot * (i + rng.range(0.1, 0.9)));
}

/**
 * Random-sized groups of rapid spawns separated by random breaks.
 * Group sizes and breaks are drawn from the configured ranges, then the breaks
 * are stretched or compressed so the whole plan fills the round exactly
 * (bursts themselves stay tight; only if the bursts alone don't fit do they compress).
 */
function burstSpawnTimes(rng, settings, window) {
  const { targetCount, lifetimeMs, bursts } = settings;
  const stagger = burstStagger(lifetimeMs);
  const lead = Math.min(500, window * 0.05); // don't drop the first target on top of "GO"
  const fit = Math.max(0, window - lead);

  const sizes = [];
  for (let left = targetCount; left > 0; ) {
    const size = Math.min(left, rng.int(bursts.minSize, bursts.maxSize));
    sizes.push(size);
    left -= size;
  }
  const breaks = sizes.slice(1).map(() => rng.range(bursts.minDelayMs, bursts.maxDelayMs));

  const burstTime = (targetCount - sizes.length) * stagger;
  const breakTime = breaks.reduce((sum, b) => sum + b, 0);
  let staggerScale = 1;
  let breakScale = 1;
  if (burstTime >= fit) {
    staggerScale = burstTime > 0 ? fit / burstTime : 0;
    breakScale = 0;
  } else if (breakTime > 0) {
    breakScale = (fit - burstTime) / breakTime;
  }

  const times = [];
  let t = lead;
  sizes.forEach((size, b) => {
    for (let j = 0; j < size; j++) times.push(t + j * stagger * staggerScale);
    t += (size - 1) * stagger * staggerScale + (breaks[b] ?? 0) * breakScale;
  });
  return times;
}

/** Expected shape of a bursts round, for the settings hint. */
export function estimateBursts(settings) {
  const { targetCount, lifetimeMs, durationSec, bursts } = settings;
  const window = Math.max(0, durationSec * 1000 - lifetimeMs);
  const avgSize = (bursts.minSize + bursts.maxSize) / 2;
  const count = Math.max(1, Math.round(targetCount / avgSize));
  const burstTime = (targetCount - count) * burstStagger(lifetimeMs);
  const breakTime = ((count - 1) * (bursts.minDelayMs + bursts.maxDelayMs)) / 2;
  const breakScale = breakTime > 0 ? Math.max(0, (window - burstTime) / breakTime) : 1;
  return { count, breakScale };
}
