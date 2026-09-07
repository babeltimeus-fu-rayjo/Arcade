import { State } from '../../shared/engine/engine.js';
import { createSettingsDialog } from '../../shared/ui/settings-dialog.js';
import { pickTitles, renderTitles } from '../../shared/ui/titles.js';
import { DEFAULT_SETTINGS, formatDuration, normalizeSettings } from './settings.js';

const $ = (selector) => document.querySelector(selector);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const TARGET_MIN_PX = 36;
const TARGET_MAX_PX = 110;
const RING_CIRCUMFERENCE = 2 * Math.PI * 45; // matches r="45" in the target SVG
const SVG_NS = 'http://www.w3.org/2000/svg';
const TITLE_VOCAB = { target: 'target', targets: 'targets', stray: 'stray tap', strays: 'stray taps', device: 'screen' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Everything DOM: screens, HUD, arena targets, path outlines, results and the
 * settings dialog. Talks to the engine through its public methods and events only.
 */
export function createUI({ engine, modules, settings, onSettingsChange, onStart }) {
  const els = {
    screens: { menu: $('#screen-menu'), game: $('#screen-game'), results: $('#screen-results') },
    configSummary: $('#config-summary'),
    hud: {
      time: $('#hud-time'),
      hits: $('#hud-hits'),
      misses: $('#hud-misses'),
      spawned: $('#hud-spawned'),
      total: $('#hud-total'),
    },
    arena: $('#arena'),
    paths: $('#paths'),
    countdown: $('#countdown'),
    countdownValue: $('#countdown-value'),
    countdownHint: $('#countdown-hint'),
    paused: $('#paused'),
    results: {
      kicker: $('#results-kicker'),
      accuracy: $('#res-accuracy'),
      hits: $('#res-hits'),
      misses: $('#res-misses'),
      reaction: $('#res-reaction'),
      streak: $('#res-streak'),
      whiffs: $('#res-whiffs'),
      spawned: $('#res-spawned'),
      titles: $('#titles'),
    },
    dialog: $('#settings-dialog'),
  };

  let current = settings;
  const targetEls = new Map(); // target index -> { el, ring, badge, path, pulseTimer }
  const arenaSize = { w: 0, h: 0, targetPx: 48 };
  let lastShownSecond = -1;

  // ---------- screens ----------
  function show(name) {
    for (const [key, node] of Object.entries(els.screens)) node.hidden = key !== name;
  }

  function renderSummary() {
    const parts = [
      formatDuration(current.durationSec),
      `${current.targetCount} target${current.targetCount === 1 ? '' : 's'}`,
      `${(current.lifetimeMs / 1000).toFixed(1)}s each`,
    ];
    if (current.bursts.enabled) parts.push('bursts');
    if (current.modules.length) {
      parts.push(`${current.modules.length} module${current.modules.length === 1 ? '' : 's'}`);
    }
    els.configSummary.textContent = parts.join(' · ');
  }

  // ---------- arena sizing ----------
  function measureArena() {
    const rect = els.arena.getBoundingClientRect();
    arenaSize.w = rect.width;
    arenaSize.h = rect.height;
    const shortSide = Math.max(1, Math.min(rect.width, rect.height));
    arenaSize.targetPx = clamp((current.sizePct / 100) * shortSide, TARGET_MIN_PX, TARGET_MAX_PX);
    els.arena.style.setProperty('--size', `${arenaSize.targetPx.toFixed(1)}px`);
  }
  new ResizeObserver(measureArena).observe(els.arena);

  /** Geometry the scheduler needs. Call with the game screen visible. */
  function getArenaMetrics() {
    measureArena();
    if (arenaSize.w < 50 || arenaSize.h < 50) {
      // Arena not laid out yet (or absurdly small): fall back to a plausible shape
      // instead of feeding the scheduler a radius bigger than the arena.
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      return { aspect: clamp(vw / vh, 0.4, 2.5), radiusFrac: current.sizePct / 200 };
    }
    const shortSide = Math.min(arenaSize.w, arenaSize.h);
    return {
      aspect: arenaSize.w / arenaSize.h,
      radiusFrac: arenaSize.targetPx / 2 / shortSide,
    };
  }

  // ---------- targets ----------
  function spawnTarget(target) {
    const root = el('div', 'target');
    root.dataset.index = String(target.index);
    const body = el('div', 'target-body');
    body.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" r="45"></circle>
        <circle class="ring" cx="50" cy="50" r="45"></circle>
      </svg>`;
    const core = el('span', 'core');
    core.append(el('span', 'label', target.label ?? ''));
    const badge = el('span', 'badge', String(target.hitsRequired - target.hitsTaken));
    badge.hidden = target.hitsRequired <= 1;
    body.append(core, badge);
    root.append(body);
    if (target.label) root.classList.add('has-key');
    if (target.motion) root.classList.add('moving');
    positionTarget(root, target);
    els.arena.appendChild(root);

    // Outline of the path a moving target follows, drawn underneath the targets.
    let path = null;
    if (target.path?.length) {
      path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathData(target.path));
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.classList.add('path-line');
      els.paths.appendChild(path);
    }
    targetEls.set(target.index, { el: root, ring: root.querySelector('.ring'), badge, path, pulseTimer: 0 });
  }

  /** SVG path data for normalised points; the overlay's viewBox is 0..100 in both axes. */
  function pathData(points) {
    return `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join(' ')} Z`;
  }

  function positionTarget(node, target) {
    node.style.left = `${((target.nx + (target.dx || 0)) * 100).toFixed(3)}%`;
    node.style.top = `${((target.ny + (target.dy || 0)) * 100).toFixed(3)}%`;
    node.style.setProperty('--scale', String(target.scale ?? 1));
  }

  function updateTargets() {
    for (const target of engine.active.values()) {
      const rec = targetEls.get(target.index);
      if (!rec) continue;
      const remaining = clamp(target.remaining, 0, 1);
      rec.ring.style.strokeDashoffset = ((1 - remaining) * RING_CIRCUMFERENCE).toFixed(2);
      rec.el.style.setProperty('--hue', String(Math.round(remaining * 130))); // green -> red
      positionTarget(rec.el, target);
    }
  }

  function partialHit(target, remaining) {
    const rec = targetEls.get(target.index);
    if (!rec) return;
    rec.badge.textContent = String(remaining);
    rec.el.classList.remove('tapped');
    void rec.el.offsetWidth; // restart the pulse animation
    rec.el.classList.add('tapped');
    clearTimeout(rec.pulseTimer);
    // Drop the pulse once it has played so the hit/miss animation can take over later.
    rec.pulseTimer = setTimeout(() => rec.el.classList.remove('tapped'), 260);
  }

  function resolveTarget(index, className) {
    const rec = targetEls.get(index);
    if (!rec) return;
    targetEls.delete(index);
    clearTimeout(rec.pulseTimer);
    rec.el.classList.remove('tapped');
    rec.el.classList.add(className);
    setTimeout(() => rec.el.remove(), 320);
    if (rec.path) {
      rec.path.classList.add('gone');
      setTimeout(() => rec.path.remove(), 320);
    }
  }

  function clearTargets() {
    for (const { el: node } of targetEls.values()) node.remove();
    targetEls.clear();
    for (const stale of els.arena.querySelectorAll('.target')) stale.remove();
    els.paths.replaceChildren();
  }

  // ---------- HUD ----------
  function resetHud(total) {
    els.hud.hits.textContent = '0';
    els.hud.misses.textContent = '0';
    els.hud.spawned.textContent = '0';
    els.hud.total.textContent = String(total);
    els.hud.time.textContent = formatDuration(engine.durationMs / 1000);
    els.hud.time.classList.remove('urgent');
    lastShownSecond = -1;
  }

  function updateHud({ remainingMs }) {
    const second = Math.ceil(remainingMs / 1000);
    if (second !== lastShownSecond) {
      lastShownSecond = second;
      els.hud.time.textContent = formatDuration(second);
      els.hud.time.classList.toggle('urgent', second <= 10);
    }
    els.hud.spawned.textContent = String(engine.nextIndex);
  }

  // ---------- results ----------
  function renderResults(summary) {
    const kicker = { timeup: "Time's up!", cleared: 'Round complete', quit: 'Ended early' };
    const perfect = summary.total > 0 && summary.hits === summary.total;
    els.results.kicker.textContent = perfect ? 'Perfect round!' : kicker[summary.reason] ?? 'Round over';
    els.results.accuracy.textContent = summary.resolved ? Math.round(summary.accuracy * 100) : '—';
    els.results.hits.textContent = String(summary.hits);
    els.results.misses.textContent = String(summary.misses);
    els.results.reaction.textContent = summary.avgReactionMs == null ? '—' : `${Math.round(summary.avgReactionMs)} ms`;
    els.results.streak.textContent = String(summary.bestStreak);
    els.results.whiffs.textContent = String(summary.whiffs);
    els.results.spawned.textContent = `${summary.spawned}/${summary.total}`;
    renderTitles(els.results.titles, pickTitles(summary, TITLE_VOCAB));
  }

  // ---------- settings dialog ----------
  const dialog = createSettingsDialog({
    dialog: els.dialog,
    modules,
    defaults: DEFAULT_SETTINGS,
    normalize: normalizeSettings,
    roundExtraHtml: `
      <label class="field">
        <span class="field-label">Target size <output data-role="size-output">14%</output></span>
        <input type="range" name="sizePct" min="6" max="30" step="1">
      </label>`,
    fillExtra(f, s) {
      f.namedItem('sizePct').value = String(s.sizePct);
    },
    readExtra(f) {
      return { sizePct: Number(f.namedItem('sizePct').value) };
    },
    onChange(form) {
      const output = form.querySelector('[data-role="size-output"]');
      if (output) output.textContent = `${form.elements.namedItem('sizePct').value}%`;
    },
    onSave: onSettingsChange,
  });
  const openSettings = () => dialog.open(current);

  // ---------- buttons ----------
  $('#btn-start').addEventListener('click', onStart);
  $('#btn-again').addEventListener('click', onStart);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings-2').addEventListener('click', openSettings);
  $('#btn-quit').addEventListener('click', () => engine.end('quit'));
  els.paused.addEventListener('click', () => engine.resume());

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (els.dialog.open) return;
    if (e.key === 'Escape') {
      if (engine.state === State.PAUSED) engine.resume();
      else engine.pause();
      return;
    }
    if (engine.state !== State.RUNNING || !engine.usesKeys) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
    e.preventDefault();
    engine.hitKey(e.key);
  });

  // ---------- arena input ----------
  // pointerdown (not click) so mouse and touch both register instantly.
  els.arena.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (engine.state !== State.RUNNING) return;
    const targetEl = e.target.closest?.('.target');
    if (targetEl && !targetEl.classList.contains('hit') && !targetEl.classList.contains('miss')) {
      engine.hit(Number(targetEl.dataset.index)); // keyboard targets refuse taps; that's not a stray tap
    } else {
      engine.whiff();
    }
  });
  els.arena.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- engine events ----------
  engine.addEventListener('start', ({ detail }) => {
    show('game');
    clearTargets();
    resetHud(detail.schedule.targets.length);
    els.paused.hidden = true;
    els.countdown.hidden = detail.countdownMs <= 0;
    els.countdown.classList.remove('go');
    els.countdownValue.textContent = String(Math.ceil(detail.countdownMs / 1000));
    els.countdownHint.textContent = engine.usesKeys ? 'Type the key shown on each target' : '';
    els.countdownHint.hidden = !engine.usesKeys;
  });
  engine.addEventListener('countdown', ({ detail }) => {
    const n = Math.ceil(detail.remainingMs / 1000);
    els.countdownValue.textContent = n > 0 ? String(n) : 'GO';
  });
  engine.addEventListener('go', () => {
    els.countdownValue.textContent = 'GO';
    els.countdown.classList.add('go');
    setTimeout(() => { els.countdown.hidden = true; }, 500);
  });
  engine.addEventListener('spawn', ({ detail }) => spawnTarget(detail.target));
  engine.addEventListener('partial', ({ detail }) => partialHit(detail.target, detail.remaining));
  engine.addEventListener('hit', ({ detail }) => {
    resolveTarget(detail.target.index, 'hit');
    els.hud.hits.textContent = String(detail.stats.hits);
  });
  engine.addEventListener('miss', ({ detail }) => {
    resolveTarget(detail.target.index, 'miss');
    els.hud.misses.textContent = String(detail.stats.misses);
  });
  engine.addEventListener('tick', ({ detail }) => {
    updateTargets();
    updateHud(detail);
  });
  engine.addEventListener('pause', () => { els.paused.hidden = false; });
  engine.addEventListener('resume', () => { els.paused.hidden = true; });
  engine.addEventListener('end', ({ detail }) => {
    clearTargets();
    renderResults(detail.summary);
    show('results');
  });

  renderSummary();
  show('menu');

  return {
    getArenaMetrics,
    showGame: () => show('game'),
    setSettings(next) {
      current = next;
      renderSummary();
      measureArena();
    },
  };
}
