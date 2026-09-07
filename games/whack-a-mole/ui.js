import { State } from '../../shared/engine/engine.js';
import { BOARD_HEIGHT_UNITS, BOARD_WIDTH_UNITS, ROWS, boardKeyFor } from '../../shared/keyboard.js';
import { createSettingsDialog } from '../../shared/ui/settings-dialog.js';
import { pickTitles, renderTitles } from '../../shared/ui/titles.js';
import { activeKeys } from './planner.js';
import { DEFAULT_SETTINGS, formatDuration, normalizeSettings } from './settings.js';

const $ = (selector) => document.querySelector(selector);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const RESOLVE_MS = 350; // how long a whacked/missed mole stays visible
const TITLE_VOCAB = { target: 'mole', targets: 'moles', stray: 'stray press', strays: 'stray presses', device: 'keyboard' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Everything DOM: screens, HUD, the keyboard board with its moles, results and
 * the settings dialog. Input is keyboard only.
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
    board: $('#board'),
    keys: $('#keys'),
    countdown: $('#countdown'),
    countdownValue: $('#countdown-value'),
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
  const keyEls = new Map(); // physical key -> { el, cap, bar, badge, mole, index, timer, pulseTimer }
  let lastShownSecond = -1;

  // ---------- screens ----------
  function show(name) {
    for (const [key, node] of Object.entries(els.screens)) node.hidden = key !== name;
  }

  function renderSummary() {
    const parts = [
      formatDuration(current.durationSec),
      `${current.targetCount} mole${current.targetCount === 1 ? '' : 's'}`,
      `${(current.lifetimeMs / 1000).toFixed(1)}s each`,
      `${activeKeys(current.keys).length} keys`,
    ];
    if (current.bursts.enabled) parts.push('bursts');
    if (current.modules.length) {
      parts.push(`${current.modules.length} module${current.modules.length === 1 ? '' : 's'}`);
    }
    els.configSummary.textContent = parts.join(' · ');
  }

  // ---------- keyboard board ----------
  function buildKeyboard() {
    els.keys.replaceChildren();
    keyEls.clear();
    ROWS.forEach((row, rowIndex) => {
      [...row.keys].forEach((key, i) => {
        const node = el('div', 'key');
        node.dataset.key = key;
        node.style.setProperty('--col', String(row.offset + i));
        node.style.setProperty('--row', String(rowIndex));
        const cap = el('span', 'cap', key.toUpperCase());
        const hole = el('div', 'hole');
        const mole = el('div', 'mole');
        mole.append(el('span', 'eye eye-l'), el('span', 'eye eye-r'), el('span', 'nose'));
        hole.append(mole);
        const bar = el('span', 'bar');
        const badge = el('span', 'badge');
        badge.hidden = true;
        node.append(cap, hole, bar, badge);
        els.keys.append(node);
        keyEls.set(key, { key, el: node, cap, bar, badge, mole, index: null, timer: 0, pulseTimer: 0 });
      });
    });
  }

  function fitKeyboard() {
    const rect = els.board.getBoundingClientRect();
    const unit = Math.max(8, Math.min(rect.width / BOARD_WIDTH_UNITS, rect.height / BOARD_HEIGHT_UNITS));
    els.keys.style.setProperty('--unit', `${unit.toFixed(2)}px`);
    els.keys.style.width = `${(unit * BOARD_WIDTH_UNITS).toFixed(1)}px`;
    els.keys.style.height = `${(unit * BOARD_HEIGHT_UNITS).toFixed(1)}px`;
  }
  new ResizeObserver(fitKeyboard).observe(els.board);

  /**
   * Hide the keys moles can't use with the current settings. Every other key
   * keeps its real position on the board (the empty spots stay blank), so
   * players can find keys without looking down at the physical keyboard.
   */
  function markActiveKeys() {
    const active = new Set(activeKeys(current.keys).map((k) => boardKeyFor(k.key)?.key));
    for (const [key, rec] of keyEls) rec.el.hidden = !active.has(key);
  }

  function recFor(target) {
    const physical = boardKeyFor(target.key);
    return physical ? keyEls.get(physical.key) : null;
  }

  function popUp(target) {
    const rec = recFor(target);
    if (!rec) return;
    clearTimeout(rec.timer);
    clearTimeout(rec.pulseTimer);
    rec.el.classList.remove('whacked', 'missed', 'tapped');
    rec.index = target.index;
    rec.cap.textContent = target.label ?? rec.key.toUpperCase();
    rec.badge.hidden = target.hitsRequired <= 1;
    rec.badge.textContent = String(target.hitsRequired - target.hitsTaken);
    rec.el.style.setProperty('--remaining', '1');
    rec.el.style.setProperty('--hue', '130');
    rec.el.style.setProperty('--scale', '1');
    rec.el.classList.add('up');
  }

  function updateMoles() {
    for (const target of engine.active.values()) {
      const rec = recFor(target);
      if (!rec || rec.index !== target.index) continue;
      const remaining = clamp(target.remaining, 0, 1);
      rec.el.style.setProperty('--remaining', remaining.toFixed(3));
      rec.el.style.setProperty('--hue', String(Math.round(remaining * 130))); // green -> red
      rec.el.style.setProperty('--scale', String(target.scale ?? 1));
    }
  }

  function partialHit(target, remaining) {
    const rec = recFor(target);
    if (!rec || rec.index !== target.index) return;
    rec.badge.textContent = String(remaining);
    rec.el.classList.remove('tapped');
    void rec.el.offsetWidth; // restart the pulse
    rec.el.classList.add('tapped');
    clearTimeout(rec.pulseTimer);
    rec.pulseTimer = setTimeout(() => rec.el.classList.remove('tapped'), 260);
  }

  function resolveMole(target, className) {
    const rec = recFor(target);
    if (!rec || rec.index !== target.index) return; // another mole took this key over
    clearTimeout(rec.pulseTimer);
    rec.el.classList.remove('up', 'tapped');
    rec.el.classList.add(className);
    rec.badge.hidden = true;
    rec.index = null;
    rec.timer = setTimeout(() => {
      rec.el.classList.remove(className);
      rec.cap.textContent = rec.key.toUpperCase();
    }, RESOLVE_MS);
  }

  function clearMoles() {
    for (const rec of keyEls.values()) {
      clearTimeout(rec.timer);
      clearTimeout(rec.pulseTimer);
      rec.el.classList.remove('up', 'whacked', 'missed', 'tapped');
      rec.badge.hidden = true;
      rec.cap.textContent = rec.key.toUpperCase();
      rec.index = null;
    }
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
    labels: {
      count: 'Number of moles',
      lifetime: 'Mole lifetime (seconds)',
      burstsLede: 'Moles pop up in random groups with random breaks in between.',
      perBurst: 'Moles per burst',
    },
    extraGroupsHtml: `
      <section class="group">
        <h3 class="group-title">Keys</h3>
        <p class="muted small group-lede">Which keys moles can pop up on. Groups can be mixed.</p>
        <label class="opt opt-check"><input type="checkbox" name="keyLetters"><span class="opt-label">Letters</span></label>
        <label class="opt opt-check"><input type="checkbox" name="keyNumbers"><span class="opt-label">Numbers</span></label>
        <label class="opt opt-check"><input type="checkbox" name="keyPunctuation"><span class="opt-label">Punctuation</span></label>
        <label class="opt opt-text">
          <span class="opt-label">Custom keys (overrides the groups above)</span>
          <input type="text" name="keyPool" placeholder="e.g. asdfjkl;" maxlength="64" autocomplete="off" spellcheck="false" autocapitalize="off">
        </label>
      </section>`,
    fillExtra(f, s) {
      f.namedItem('keyLetters').checked = s.keys.letters;
      f.namedItem('keyNumbers').checked = s.keys.numbers;
      f.namedItem('keyPunctuation').checked = s.keys.punctuation;
      f.namedItem('keyPool').value = s.keys.pool;
    },
    readExtra(f) {
      return {
        keys: {
          letters: f.namedItem('keyLetters').checked,
          numbers: f.namedItem('keyNumbers').checked,
          punctuation: f.namedItem('keyPunctuation').checked,
          pool: f.namedItem('keyPool').value,
        },
      };
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

  // ---------- keyboard input (the only way to whack) ----------
  document.addEventListener('keydown', (e) => {
    if (els.dialog.open) return;
    if (e.key === 'Escape') {
      if (engine.state === State.PAUSED) engine.resume();
      else engine.pause();
      return;
    }
    if (engine.state !== State.RUNNING) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
    e.preventDefault();
    engine.hitKey(e.key);
  });

  // ---------- engine events ----------
  engine.addEventListener('start', ({ detail }) => {
    show('game');
    clearMoles();
    markActiveKeys();
    fitKeyboard();
    resetHud(detail.schedule.targets.length);
    els.paused.hidden = true;
    els.countdown.hidden = detail.countdownMs <= 0;
    els.countdown.classList.remove('go');
    els.countdownValue.textContent = String(Math.ceil(detail.countdownMs / 1000));
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
  engine.addEventListener('spawn', ({ detail }) => popUp(detail.target));
  engine.addEventListener('partial', ({ detail }) => partialHit(detail.target, detail.remaining));
  engine.addEventListener('hit', ({ detail }) => {
    resolveMole(detail.target, 'whacked');
    els.hud.hits.textContent = String(detail.stats.hits);
  });
  engine.addEventListener('miss', ({ detail }) => {
    resolveMole(detail.target, 'missed');
    els.hud.misses.textContent = String(detail.stats.misses);
  });
  engine.addEventListener('tick', ({ detail }) => {
    updateMoles();
    updateHud(detail);
  });
  engine.addEventListener('pause', () => { els.paused.hidden = false; });
  engine.addEventListener('resume', () => { els.paused.hidden = true; });
  engine.addEventListener('end', ({ detail }) => {
    clearMoles();
    renderResults(detail.summary);
    show('results');
  });

  buildKeyboard();
  markActiveKeys();
  renderSummary();
  show('menu');

  return {
    showGame: () => show('game'),
    setSettings(next) {
      current = next;
      renderSummary();
      markActiveKeys();
    },
  };
}
