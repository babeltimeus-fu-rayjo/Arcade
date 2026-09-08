import { activeKeys, boardKeyFor } from '../../shared/keyboard.js';
import { createRng, randomSeed } from '../../shared/rng.js';

export const Phase = Object.freeze({ IDLE: 'idle', PLAYING: 'playing', PROMPT: 'prompt', ENDED: 'ended' });

const MAX_RETRIES = 5;
const STRAY_PENALTY = 0.25; // a wrong key burns this share of the prompt window

/**
 * Plays a fight script: advances beats on a time-scaled clock, opens prompts
 * (slowing time), judges input, follows branches, and applies the mistake mode
 * from settings. No DOM; the UI drives step() from its frame loop and listens.
 *
 * Events: beat {id, beat, retry}, prompt {prompt, beat}, prompttick {left, window, progress},
 *         stray {left}, resolve {success, reaction, beat}, damage {hearts}, end {outcome, summary}
 */
export class DuelPlayer extends EventTarget {
  constructor() {
    super();
    this.phase = Phase.IDLE;
    this.timeScale = 1;
    /** Optional: (clipName) => [{ at, ms }] hit-stops, so impacts can freeze the scene briefly. */
    this.clipInfo = null;
    this.hitStopLeft = 0;
  }

  /** True while an impact frame is being held. */
  get frozen() {
    return this.hitStopLeft > 0;
  }

  /** 0 at the start of an impact frame, 1 when it releases (0 when not frozen). */
  get hitStopProgress() {
    if (this.hitStopLeft <= 0 || !this.hitStopMs) return 0;
    return 1 - this.hitStopLeft / this.hitStopMs;
  }

  load(fight, settings, seed = randomSeed()) {
    this.fight = fight;
    this.settings = settings;
    this.seed = seed;
    this.rng = createRng(seed);
    this.maxHearts = fight.hearts ?? 3;
    this.hearts = this.maxHearts;
    this.stats = { prompts: 0, hits: 0, misses: 0, strays: 0, retries: 0, streak: 0, bestStreak: 0, reactionTotal: 0 };
    this.path = [];
    this.sceneTime = 0;
    this.realTime = 0;
    this.lastKey = null;
    this.retryCount = 0;
    this.pendingLose = false;
    this.outcome = null;
    this.prompt = null;
    this.timeScale = 1;
    this.phase = Phase.PLAYING;
    this.enter(fight.start);
  }

  get beat() {
    return this.fight.beats[this.beatId];
  }

  /** How long the current clip is meant to run, for the renderer's 0..1 time. */
  get clipLength() {
    const b = this.beat;
    return b.prompt ? b.length ?? (b.windup ?? 600) * 2 : b.duration ?? 1000;
  }

  enter(id, { retry = false } = {}) {
    const beat = this.fight.beats[id];
    if (!beat) throw new Error(`Unknown beat "${id}"`);
    this.beatId = id;
    this.beatTime = 0;
    this.prompt = null;
    this.timeScale = 1;
    this.hitStopLeft = 0;
    this.hitStops = (this.clipInfo?.(beat.clip) ?? []).map((h) => ({ ...h, done: false }));
    if (!retry) {
      this.path.push(id);
      if (beat.damage && this.settings.mistakes === 'story') {
        this.hearts = Math.max(0, this.hearts - beat.damage);
        this._emit('damage', { hearts: this.hearts, maxHearts: this.maxHearts });
        if (this.hearts === 0 && !beat.end) this.pendingLose = true;
      }
    }
    this._emit('beat', { id, beat, retry });
  }

  /** Advance by real milliseconds. */
  step(dt) {
    if (this.phase === Phase.ENDED || this.phase === Phase.IDLE) return;
    const beat = this.beat;
    this.realTime += dt;
    if (this.hitStopLeft > 0) {
      // Impact frame: real time passes, the scene holds still.
      this.hitStopLeft -= dt;
      return;
    }
    this.sceneTime += dt * this.timeScale;
    this.beatTime += dt * this.timeScale;

    if (this.prompt) {
      this._tickPrompt(dt);
      return;
    }
    for (const h of this.hitStops) {
      if (!h.done && this.beatTime >= h.at * this.clipLength) {
        h.done = true;
        this.hitStopLeft = h.ms;
        this.hitStopMs = h.ms;
        this._emit('impact', { at: h.at, ms: h.ms });
        return;
      }
    }
    const cue = beat.prompt ? beat.windup ?? 600 : beat.duration ?? 1000;
    if (this.beatTime < cue) return;
    if (beat.prompt) this._openPrompt(beat);
    else if (beat.end) this._finish(beat.end);
    else if (this.pendingLose) this.enter(this.fight.lose);
    else this.enter(beat.next);
  }

  // ---- prompts ----

  _openPrompt(beat) {
    const spec = beat.prompt;
    const window = spec.window * (this.settings.windowScale ?? 1) * (1 + 0.25 * this.retryCount);
    const keys = this._assignKeys(spec);
    this.prompt = {
      type: spec.type,
      spec,
      keys: keys.list,
      options: keys.options ?? null,
      label: spec.label ?? '',
      window,
      left: window,
      progress: 0,
      step: 0,
      count: 0,
      holding: false,
      openedAt: this.realTime,
    };
    this.timeScale = this.settings.slowmo ?? 0.2;
    this.phase = Phase.PROMPT;
    this.stats.prompts++;
    this._emit('prompt', { prompt: this.prompt, beat });
  }

  /** Fixed keys from the script, or fresh ones from the practice pool. */
  _assignKeys(spec) {
    const fixed = this.settings.keySource !== 'pool';
    if (spec.type === 'choice') {
      if (fixed) {
        const options = spec.options.map((o) => ({ ...o, key: o.keys[0].toLowerCase() }));
        return { list: options.map((o) => o.key), options };
      }
      const pool = this._pool();
      const left = pool.filter((k) => (boardKeyFor(k)?.x ?? 0.5) < 0.5);
      const right = pool.filter((k) => (boardKeyFor(k)?.x ?? 0.5) >= 0.5);
      const used = new Set();
      const options = spec.options.map((o, i) => {
        const side = (i % 2 === 0 ? left : right).filter((k) => !used.has(k));
        const key = this._pick(side.length ? side : pool.filter((k) => !used.has(k)));
        used.add(key);
        return { ...o, key };
      });
      return { list: options.map((o) => o.key), options };
    }
    if (fixed) return { list: spec.keys.map((k) => k.toLowerCase()) };
    const pool = this._pool();
    const list = [];
    const wanted = spec.type === 'sequence' ? spec.keys.length : 1;
    while (list.length < wanted && list.length < pool.length) {
      const key = this._pick(pool.filter((k) => !list.includes(k)));
      list.push(key);
    }
    return { list };
  }

  _pool() {
    const keys = activeKeys(this.settings.keys).map((k) => k.key);
    const fresh = keys.filter((k) => k !== this.lastKey);
    return fresh.length ? fresh : keys;
  }

  _pick(list) {
    return list[this.rng.int(0, list.length - 1)];
  }

  _tickPrompt(dt) {
    const p = this.prompt;
    p.left -= dt;
    if (p.type === 'hold' && p.holding) {
      p.progress = Math.min(1, p.progress + dt / p.spec.holdMs);
      if (p.progress >= 1) {
        this._resolve(true);
        return;
      }
    }
    this._emit('prompttick', { left: Math.max(0, p.left), window: p.window, progress: p.progress });
    if (p.left <= 0) this._resolve(false);
  }

  /** A key went down. Returns true if it advanced the prompt. */
  input(key) {
    if (this.phase !== Phase.PROMPT) return false;
    const p = this.prompt;
    const k = String(key).toLowerCase();
    switch (p.type) {
      case 'key':
        return k === p.keys[0] ? this._resolve(true) : this._stray();
      case 'sequence':
        if (k !== p.keys[p.step]) return this._stray();
        p.step++;
        p.progress = p.step / p.keys.length;
        this._emit('promptprogress', { progress: p.progress, step: p.step });
        return p.step >= p.keys.length ? this._resolve(true) : true;
      case 'mash':
        if (k !== p.keys[0]) return this._stray();
        p.count++;
        p.progress = Math.min(1, p.count / p.spec.presses);
        this._emit('promptprogress', { progress: p.progress, step: p.count });
        return p.count >= p.spec.presses ? this._resolve(true) : true;
      case 'hold':
        if (k !== p.keys[0]) return this._stray();
        p.holding = true;
        return true;
      case 'choice': {
        const option = p.options.find((o) => o.key === k);
        return option ? this._resolve(true, option.next) : this._stray();
      }
      default:
        return false;
    }
  }

  /** A key came up (matters for hold prompts). */
  release(key) {
    if (this.phase === Phase.PROMPT && this.prompt.type === 'hold' && String(key).toLowerCase() === this.prompt.keys[0]) {
      this.prompt.holding = false;
    }
  }

  _stray() {
    const p = this.prompt;
    this.stats.strays++;
    p.left -= p.window * STRAY_PENALTY;
    this._emit('stray', { left: Math.max(0, p.left) });
    if (p.left <= 0) this._resolve(false);
    return false;
  }

  _resolve(success, nextOverride) {
    const p = this.prompt;
    const beat = this.beat;
    const reaction = this.realTime - p.openedAt;
    this.prompt = null;
    this.timeScale = 1;
    this.phase = Phase.PLAYING;
    this.lastKey = p.keys[p.keys.length - 1];

    if (success) {
      this.stats.hits++;
      this.stats.streak++;
      this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
      this.stats.reactionTotal += reaction;
      this.retryCount = 0;
      this._emit('resolve', { success: true, reaction, beat });
      this.enter(nextOverride ?? beat.success);
      return true;
    }

    this.stats.misses++;
    this.stats.streak = 0;
    this._emit('resolve', { success: false, reaction, beat });
    const mode = this.settings.mistakes;
    if (mode === 'retry' && this.retryCount < MAX_RETRIES) {
      this.retryCount++;
      this.stats.retries++;
      this.enter(this.beatId, { retry: true });
      return false;
    }
    this.retryCount = 0;
    if (mode === 'practice') {
      this.enter(beat.success ?? beat.prompt.options?.[0]?.next ?? beat.fail);
      return false;
    }
    this.enter(beat.fail);
    return false;
  }

  // ---- ending ----

  quit() {
    if (this.phase === Phase.ENDED || this.phase === Phase.IDLE) return;
    this._finish('quit');
  }

  _finish(outcome) {
    this.phase = Phase.ENDED;
    this.outcome = outcome;
    this.prompt = null;
    this.timeScale = 1;
    this._emit('end', { outcome, summary: this.summary() });
  }

  /** Shaped like the round engine's summary so the shared titles can read it. */
  summary() {
    const s = this.stats;
    const resolved = s.hits + s.misses;
    return {
      outcome: this.outcome,
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      hits: s.hits,
      misses: s.misses,
      whiffs: s.strays,
      retries: s.retries,
      bestStreak: s.bestStreak,
      resolved,
      spawned: s.prompts,
      total: s.prompts,
      accuracy: resolved ? s.hits / resolved : 0,
      avgReactionMs: s.hits ? s.reactionTotal / s.hits : null,
      elapsedMs: this.realTime,
      reason: this.outcome === 'quit' ? 'quit' : this.outcome === 'win' ? 'cleared' : 'timeup',
      path: [...this.path],
    };
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
