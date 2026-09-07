import { buildSchedule } from './schedule.js';
import { resolveModuleOptions } from './options.js';
import { createRng, randomSeed } from '../rng.js';

export const State = Object.freeze({
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended',
});

const MAX_FRAME_MS = 250; // a hiccup or hidden tab never advances the clock by more than this

/**
 * Round engine shared by the games: owns the clock, spawns targets from the
 * schedule, resolves hits/misses and keeps the stats. It knows nothing about
 * the DOM; each game's UI listens to its events. Modules hook into the same
 * lifecycle (see games/target-rush/modules/shrink.js for the hook list).
 *
 * Events (CustomEvent, payload in `detail`):
 *   start {seed, settings, schedule, countdownMs}
 *   countdown {remainingMs}     go
 *   spawn {target}              hit {target, reactionMs, stats}
 *   partial {target, remaining} (a multi-hit target took a hit but isn't done)
 *   miss {target, stats}        whiff {stats}
 *   tick {elapsed, remainingMs, stats}
 *   pause                       resume
 *   end {summary}
 *
 * Live target fields modules may read or set:
 *   nx, ny        scheduled position (0..1 of the arena)
 *   footprint     radius reserved around the target when it was placed (shorter-side units)
 *   x, y          same position in shorter-side units (see engine.geometry)
 *   dx, dy        offset from the scheduled position (0..1 of the arena)
 *   scale         1 = normal size
 *   hitsRequired  taps needed to count (default 1)
 *   key, label    keyboard key that hits this target (lowercase) and what to print on it
 */
export class Engine extends EventTarget {
  constructor() {
    super();
    this.state = State.IDLE;
    this.modules = [];
    this.active = new Map(); // index -> live target
    this.schedule = null;
    this.geometry = null;
    this.rng = null;
    this.usesKeys = false;
    this._moduleOptions = {};
    this._raf = 0;
  }

  /**
   * Start a round. `arena` comes from the UI ({aspect, radiusFrac}). Pass the
   * same `seed` on two devices to play an identical round.
   */
  start({ settings, arena, modules = [], seed = randomSeed(), countdownMs = 3000 }) {
    this._stopLoop();
    this.modules = modules;
    this.settings = modules.reduce((s, m) => m.modifySettings?.(s) ?? s, { ...settings });
    this._moduleOptions = Object.fromEntries(
      modules.map((m) => [m.id, resolveModuleOptions(m, this.settings.moduleOptions?.[m.id])]),
    );
    this.usesKeys = modules.some((m) => m.usesKeyboard);
    this.seed = seed;
    this.arena = arena;
    // Separate stream from the schedule's so modules can add variance without disturbing it.
    this.rng = createRng((seed ^ 0x9e3779b9) >>> 0);
    for (const m of modules) m.onPlanStart?.(this);
    this.schedule = buildSchedule({
      seed,
      settings: this.settings,
      arena,
      // Modules get a say in each target (lifetime, footprint, motion) before it is placed.
      onPlan: (planned, geometry) => {
        this.geometry = geometry;
        for (const m of modules) m.onPlan?.(planned, this);
      },
    });
    this.geometry = this.schedule.geometry;
    this.durationMs = this.schedule.durationMs;

    this.active = new Map();
    this.nextIndex = 0;
    this.elapsed = 0; // game clock in ms; excludes the countdown and pauses
    this.stats = { hits: 0, misses: 0, whiffs: 0, reactionTotalMs: 0, streak: 0, bestStreak: 0 };
    this.endReason = null;
    this._countdownLeft = countdownMs;
    this._resumeTo = State.RUNNING;

    this.state = countdownMs > 0 ? State.COUNTDOWN : State.RUNNING;
    this._emit('start', { seed, settings: this.settings, schedule: this.schedule, countdownMs });
    for (const m of this.modules) m.onRoundStart?.(this);

    this._lastFrame = performance.now();
    this._loop();
  }

  /** Resolved nested options for a module: its declared defaults merged with the player's choices. */
  options(moduleId) {
    return this._moduleOptions[moduleId] ?? {};
  }

  pause() {
    if (this.state !== State.RUNNING && this.state !== State.COUNTDOWN) return;
    this._resumeTo = this.state;
    this.state = State.PAUSED;
    this._stopLoop();
    this._emit('pause');
  }

  resume() {
    if (this.state !== State.PAUSED) return;
    this.state = this._resumeTo;
    this._lastFrame = performance.now();
    this._emit('resume');
    this._loop();
  }

  /**
   * Player hit the target with this index. `source` is 'pointer' or 'key';
   * targets that carry a key only accept key hits. Returns true if it counted.
   */
  hit(index, source = 'pointer') {
    if (this.state !== State.RUNNING) return false;
    const target = this.active.get(index);
    if (!target) return false;
    if (target.key && source !== 'key') return false;

    target.hitsTaken++;
    if (target.hitsTaken < target.hitsRequired) {
      const remaining = target.hitsRequired - target.hitsTaken;
      for (const m of this.modules) m.onPartialHit?.(target, this);
      this._emit('partial', { target, remaining });
      return true;
    }

    const now = this._preciseElapsed();
    this.active.delete(index);
    target.state = 'hit';
    target.resolvedAt = now;
    target.reactionMs = Math.max(0, now - target.spawnAt);

    const s = this.stats;
    s.hits++;
    s.reactionTotalMs += target.reactionMs;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);

    for (const m of this.modules) m.onHit?.(target, this);
    this._emit('hit', { target, reactionMs: target.reactionMs, stats: s });
    return true;
  }

  /** A key was pressed: hits the live target showing that key, otherwise counts a stray press. */
  hitKey(key) {
    if (this.state !== State.RUNNING) return false;
    const wanted = String(key).toLowerCase();
    for (const target of this.active.values()) {
      if (target.key === wanted) return this.hit(target.index, 'key');
    }
    this.whiff();
    return false;
  }

  /** Player tapped empty arena (or pressed a key nothing wanted). Not a miss, but worth tracking. */
  whiff() {
    if (this.state !== State.RUNNING) return;
    this.stats.whiffs++;
    this._emit('whiff', { stats: this.stats });
  }

  /** End the round. reason: 'timeup' | 'cleared' | 'quit' */
  end(reason = 'timeup') {
    if (this.state === State.ENDED || this.state === State.IDLE) return;
    this._stopLoop();
    this.state = State.ENDED;
    this.endReason = reason;
    const summary = this.summary();
    for (const m of this.modules) m.onRoundEnd?.(summary, this);
    this._emit('end', { summary });
  }

  summary() {
    const s = this.stats;
    const resolved = s.hits + s.misses;
    return {
      hits: s.hits,
      misses: s.misses,
      whiffs: s.whiffs,
      bestStreak: s.bestStreak,
      resolved,
      spawned: this.nextIndex,
      total: this.schedule?.targets.length ?? 0,
      accuracy: resolved ? s.hits / resolved : 0,
      avgReactionMs: s.hits ? s.reactionTotalMs / s.hits : null,
      elapsedMs: this.elapsed,
      durationMs: this.durationMs,
      reason: this.endReason,
      seed: this.seed,
    };
  }

  // ---- internals ----

  _loop() {
    this._raf = requestAnimationFrame((now) => {
      this._raf = 0;
      const dt = Math.min(Math.max(0, now - this._lastFrame), MAX_FRAME_MS);
      this._lastFrame = now;
      this._step(dt);
      if (this.state === State.COUNTDOWN || this.state === State.RUNNING) this._loop();
    });
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _step(dt) {
    if (this.state === State.COUNTDOWN) {
      this._countdownLeft -= dt;
      this._emit('countdown', { remainingMs: Math.max(0, this._countdownLeft) });
      if (this._countdownLeft <= 0) {
        this.state = State.RUNNING;
        this._emit('go');
      }
      return;
    }
    if (this.state !== State.RUNNING) return;

    this.elapsed += dt;
    const plan = this.schedule.targets;

    // Expire first so a spot frees up before anything new lands on it.
    for (const target of this.active.values()) {
      target.remaining = 1 - (this.elapsed - target.spawnAt) / target.lifetimeMs;
      if (target.remaining <= 0) this._miss(target);
    }

    while (this.nextIndex < plan.length && plan[this.nextIndex].spawnAt <= this.elapsed) {
      this._spawn(plan[this.nextIndex++]);
    }

    for (const m of this.modules) m.onUpdate?.(dt, this);

    this._emit('tick', {
      elapsed: this.elapsed,
      remainingMs: Math.max(0, this.durationMs - this.elapsed),
      stats: this.stats,
    });

    if (this.elapsed >= this.durationMs) this.end('timeup');
    else if (this.nextIndex >= plan.length && this.active.size === 0) this.end('cleared');
  }

  _spawn(planned) {
    const target = {
      ...planned,
      state: 'active',
      remaining: 1,
      scale: 1,
      dx: 0,
      dy: 0,
      hitsRequired: planned.hitsRequired ?? 1,
      hitsTaken: 0,
      key: planned.key ?? null,
      label: planned.label ?? null,
      motion: planned.motion ?? null,
    };
    this.active.set(target.index, target);
    for (const m of this.modules) m.onSpawn?.(target, this);
    this._emit('spawn', { target });
  }

  _miss(target) {
    this.active.delete(target.index);
    target.state = 'missed';
    target.resolvedAt = this.elapsed;
    this.stats.misses++;
    this.stats.streak = 0;
    for (const m of this.modules) m.onMiss?.(target, this);
    this._emit('miss', { target, stats: this.stats });
  }

  /** Game clock right now, including the time since the last frame (for reaction times). */
  _preciseElapsed() {
    if (this.state !== State.RUNNING) return this.elapsed;
    return this.elapsed + Math.min(Math.max(0, performance.now() - this._lastFrame), MAX_FRAME_MS);
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
