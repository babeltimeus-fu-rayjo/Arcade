import { formatDuration } from '../../shared/engine/options.js';
import { BOARD_HEIGHT_UNITS, BOARD_WIDTH_UNITS, ROWS, boardKeyFor } from '../../shared/keyboard.js';
import { pickTitles, renderTitles } from '../../shared/ui/titles.js';
import { hitStopsFor } from './clips.js';
import { fights } from './fights/index.js';
import { DuelPlayer, Phase } from './player.js';
import { Scene } from './scene.js';
import { createSounds } from './sound.js';
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from './settings.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const RING = 2 * Math.PI * 45;
const TITLE_VOCAB = { target: 'prompt', targets: 'prompts', stray: 'stray press', strays: 'stray presses', device: 'keyboard' };
const MISTAKE_LABEL = { story: 'story goes on', retry: 'try again', practice: 'practice' };
const WINDOW_LABEL = (v) => (v >= 1.4 ? 'relaxed timing' : v <= 0.8 ? 'quick timing' : 'normal timing');

let settings = loadSettings();
const player = new DuelPlayer();
const els = {
  screens: { menu: $('#screen-menu'), game: $('#screen-game'), results: $('#screen-results') },
  summary: $('#config-summary'),
  fightTitle: $('#fight-title'),
  fightBlurb: $('#fight-blurb'),
  stage: $('#stage'),
  canvas: $('#scene'),
  hearts: $('#hearts'),
  hudHits: $('#hud-hits'),
  hudMisses: $('#hud-misses'),
  caption: $('#caption'),
  prompt: $('#prompt'),
  promptKicker: $('#prompt-kicker'),
  promptKeys: $('#prompt-keys'),
  promptLabel: $('#prompt-label'),
  promptSub: $('#prompt-sub'),
  promptBar: $('#prompt-bar'),
  promptBarFill: $('#prompt-bar-fill'),
  board: $('#miniboard'),
  paused: $('#paused'),
  results: {
    kicker: $('#results-kicker'),
    headline: $('#results-headline'),
    meta: $('#results-meta'),
    titles: $('#titles'),
  },
  dialog: $('#settings-dialog'),
  form: $('#settings-form'),
};
const scene = new Scene(els.canvas);
const sounds = createSounds();
player.clipInfo = hitStopsFor;
scene.onBurst = (kind) => {
  if (!settings.sound) return;
  if (kind === 'spark') sounds.hit();
  else if (kind === 'whoosh') sounds.whoosh();
  else if (kind === 'dust') sounds.thud();
};

// ---------- screens ----------
function show(name) {
  for (const [key, node] of Object.entries(els.screens)) node.hidden = key !== name;
}

function currentFight() {
  return fights.find((f) => f.id === settings.fight) ?? fights[0];
}

function renderSummary() {
  const fight = currentFight();
  els.fightTitle.textContent = `${fight.title} (${fights.indexOf(fight) + 1} of ${fights.length})`;
  els.fightBlurb.textContent = fight.blurb;
  els.summary.textContent = [
    MISTAKE_LABEL[settings.mistakes],
    settings.keySource === 'pool' ? 'practice-pool keys' : 'fixed keys',
    WINDOW_LABEL(settings.windowScale),
    settings.slowmo >= 1 ? 'no slow motion' : 'slow motion',
  ].join(' · ');
}

// ---------- HUD ----------
function renderHearts(hearts, max) {
  els.hearts.replaceChildren();
  for (let i = 0; i < max; i++) els.hearts.append(el('span', i < hearts ? 'heart' : 'heart lost', i < hearts ? '❤' : '🖤'));
  els.hearts.hidden = settings.mistakes !== 'story';
}

// ---------- prompt overlay ----------
function keyLabel(key) {
  if (key === ' ') return 'SPACE';
  return key.length === 1 ? key.toUpperCase() : key;
}

function buildBoard() {
  els.board.replaceChildren();
  ROWS.forEach((row, r) => {
    [...row.keys].forEach((key, i) => {
      const node = el('span', 'mini-key', key.toUpperCase());
      node.dataset.key = key;
      node.style.setProperty('--col', String(row.offset + i));
      node.style.setProperty('--row', String(r));
      els.board.append(node);
    });
  });
  const space = el('span', 'mini-key space', '');
  space.dataset.key = ' ';
  space.style.setProperty('--col', '3.75');
  space.style.setProperty('--row', '4');
  els.board.append(space);
  els.board.style.setProperty('--cols', String(BOARD_WIDTH_UNITS));
  els.board.style.setProperty('--rows', String(BOARD_HEIGHT_UNITS + 1));
}

/** Light keys on the mini board. entries: [{ key, variant }] where variant is 'a' or 'b' for choice options. */
function lightBoard(entries) {
  const wanted = new Map(entries.map((e) => [e.key === ' ' ? ' ' : boardKeyFor(e.key)?.key ?? e.key, e.variant ?? 'a']));
  for (const node of els.board.querySelectorAll('.mini-key')) {
    const variant = wanted.get(node.dataset.key);
    node.classList.toggle('lit', variant !== undefined);
    node.classList.toggle('lit-b', variant === 'b');
  }
}

function keyCap(key, extraClass = '') {
  const cap = el('div', `qte-key ${extraClass}`.trim());
  cap.innerHTML = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="qte-track" cx="50" cy="50" r="45"></circle>
      <circle class="qte-ring" cx="50" cy="50" r="45"></circle>
    </svg>`;
  const label = keyLabel(key);
  if (label.length > 2) cap.classList.add('long');
  cap.append(el('span', 'qte-cap', label));
  return cap;
}

const KICKER = { key: 'Press', sequence: 'In order', hold: 'Hold', mash: 'Mash', choice: 'Pick one' };

function showPrompt(prompt) {
  els.promptKeys.replaceChildren();
  els.prompt.dataset.type = prompt.type;
  els.promptKicker.textContent = KICKER[prompt.type] ?? '';
  els.promptLabel.textContent = prompt.label || (prompt.type === 'choice' ? 'Choose!' : '');
  els.promptBar.hidden = !(prompt.type === 'hold' || prompt.type === 'mash');
  els.promptBarFill.style.transform = 'scaleX(0)';
  els.promptSub.hidden = true;
  if (prompt.type === 'choice') {
    // Two (or more) alternatives: colour-coded cards separated by "or".
    prompt.options.forEach((option, i) => {
      if (i > 0) els.promptKeys.append(el('span', 'qte-or', 'or'));
      const card = el('div', `qte-option qte-option-${i % 2 ? 'b' : 'a'}`);
      card.append(keyCap(option.key), el('span', 'qte-option-label', option.label));
      els.promptKeys.append(card);
    });
  } else if (prompt.type === 'sequence') {
    // Steps: caps joined by arrows, the current one highlighted.
    prompt.keys.forEach((key, i) => {
      if (i > 0) els.promptKeys.append(el('span', 'qte-arrow', '→'));
      els.promptKeys.append(keyCap(key, i === 0 ? 'current' : ''));
    });
  } else {
    els.promptKeys.append(keyCap(prompt.keys[0], 'current'));
    if (prompt.type === 'mash') {
      els.promptSub.textContent = `${prompt.spec.presses} presses`;
      els.promptSub.hidden = false;
    } else if (prompt.type === 'hold') {
      els.promptSub.textContent = 'keep it held down';
      els.promptSub.hidden = false;
    }
  }
  els.prompt.hidden = false;
  els.prompt.classList.remove('success', 'fail');
  if (settings.showBoard) {
    els.board.hidden = false;
    lightBoard(
      prompt.type === 'choice'
        ? prompt.options.map((o, i) => ({ key: o.key, variant: i % 2 ? 'b' : 'a' }))
        : prompt.type === 'sequence'
          ? [{ key: prompt.keys[0] }]
          : prompt.keys.map((key) => ({ key })),
    );
  } else {
    els.board.hidden = true;
  }
}

function updatePromptRings(left, window) {
  const remaining = Math.max(0, Math.min(1, left / window));
  const hue = Math.round(remaining * 130);
  for (const ring of els.promptKeys.querySelectorAll('.qte-ring')) {
    ring.style.strokeDashoffset = ((1 - remaining) * RING).toFixed(2);
    ring.style.stroke = `hsl(${hue} 90% 58%)`;
  }
}

function advanceSequence(step) {
  const caps = [...els.promptKeys.querySelectorAll('.qte-key')];
  caps.forEach((cap, i) => {
    cap.classList.toggle('done', i < step);
    cap.classList.toggle('current', i === step);
  });
  const next = player.prompt?.keys[step];
  if (next && settings.showBoard) lightBoard([{ key: next }]);
}

function hidePrompt(success) {
  els.prompt.classList.add(success ? 'success' : 'fail');
  els.board.hidden = true;
  setTimeout(() => {
    if (player.phase !== Phase.PROMPT) els.prompt.hidden = true;
  }, 260);
}

// ---------- frame loop ----------
let raf = 0;
let last = 0;
let paused = false;

function frame(now) {
  raf = 0;
  const dtReal = Math.min(100, Math.max(0, now - last));
  last = now;
  if (!paused) {
    const before = player.sceneTime;
    player.step(dtReal);
    draw(player.sceneTime - before, dtReal);
  }
  if (player.phase !== Phase.ENDED && player.phase !== Phase.IDLE) raf = requestAnimationFrame(frame);
}

function draw(dtScene, dtReal) {
  if (player.phase === Phase.IDLE) return;
  const beat = player.beat;
  const fight = player.fight;
  scene.render({
    foe: fight.foe ?? 'robot',
    projectile: fight.projectile ?? 'rock',
    theme: fight.scene ?? 'ruins',
    clip: beat.clip,
    t: player.beatTime / player.clipLength,
    beatKey: `${player.beatId}#${player.path.length}#${player.retryCount}`,
    camera: beat.camera ?? 'wide',
    timeScale: player.timeScale,
    progress: player.prompt?.progress ?? 0,
    hitStopProgress: player.hitStopProgress,
    sceneTime: player.sceneTime,
    dtScene,
    dtReal,
  });
}

function startFight() {
  const fight = currentFight();
  show('game');
  paused = false;
  els.paused.hidden = true;
  els.prompt.hidden = true;
  els.board.hidden = true;
  els.caption.textContent = '';
  els.hudHits.textContent = '0';
  els.hudMisses.textContent = '0';
  scene.fit();
  scene.cam = { x: 500, zoom: 1 };
  scene.particles = [];
  if (settings.sound) sounds.unlock(); // create the audio context on this click
  player.load(fight, settings);
  renderHearts(player.hearts, player.maxHearts);
  last = performance.now();
  draw(0, 0);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function setPaused(on) {
  if (player.phase === Phase.ENDED || player.phase === Phase.IDLE) return;
  paused = on;
  els.paused.hidden = !on;
  if (!on) {
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
}

// ---------- player events ----------
player.addEventListener('beat', ({ detail }) => {
  if (detail.beat.caption) els.caption.textContent = detail.beat.caption;
  els.caption.classList.toggle('retry', detail.retry);
  if (detail.retry) els.caption.textContent = 'Once more! ' + (detail.beat.caption ?? '');
});
player.addEventListener('prompt', ({ detail }) => showPrompt(detail.prompt));
player.addEventListener('prompttick', ({ detail }) => {
  updatePromptRings(detail.left, detail.window);
  if (player.prompt && (player.prompt.type === 'hold' || player.prompt.type === 'mash')) {
    els.promptBarFill.style.transform = `scaleX(${detail.progress.toFixed(3)})`;
  }
});
player.addEventListener('promptprogress', ({ detail }) => {
  if (player.prompt?.type === 'sequence') advanceSequence(detail.step);
  if (player.prompt?.type === 'mash') {
    const left = Math.max(0, player.prompt.spec.presses - detail.step);
    els.promptSub.textContent = left ? `${left} to go` : 'free!';
  }
  els.promptBarFill.style.transform = `scaleX(${detail.progress.toFixed(3)})`;
});
player.addEventListener('stray', ({ detail }) => {
  els.prompt.classList.remove('shake');
  void els.prompt.offsetWidth;
  els.prompt.classList.add('shake');
  if (player.prompt) updatePromptRings(detail.left, player.prompt.window);
});
player.addEventListener('resolve', ({ detail }) => {
  hidePrompt(detail.success);
  if (detail.success) els.hudHits.textContent = String(player.stats.hits);
  else els.hudMisses.textContent = String(player.stats.misses);
});
player.addEventListener('damage', ({ detail }) => {
  renderHearts(detail.hearts, detail.maxHearts);
  els.hearts.classList.remove('hurt');
  void els.hearts.offsetWidth;
  els.hearts.classList.add('hurt');
});
player.addEventListener('end', ({ detail }) => {
  const { outcome, summary } = detail;
  els.prompt.hidden = true;
  els.board.hidden = true;
  const kicker = { win: 'Victory!', lose: 'Knocked down', quit: 'Ended early' };
  const headline = {
    win: 'You beat the robot!',
    lose: 'The robot won this round.',
    quit: 'Stopped mid-fight.',
  };
  els.results.kicker.textContent = kicker[outcome] ?? 'Fight over';
  els.results.headline.textContent = headline[outcome] ?? '';
  const parts = [
    `${summary.hits} of ${summary.total} prompt${summary.total === 1 ? '' : 's'} hit`,
    `${summary.whiffs} stray press${summary.whiffs === 1 ? '' : 'es'}`,
    formatDuration(summary.elapsedMs / 1000),
  ];
  if (settings.mistakes === 'story') parts.splice(1, 0, `${summary.hearts}/${summary.maxHearts} hearts left`);
  if (settings.mistakes === 'retry') parts.splice(1, 0, `${summary.retries} retr${summary.retries === 1 ? 'y' : 'ies'}`);
  els.results.meta.textContent = parts.join(' · ');
  renderTitles(els.results.titles, pickTitles(summary, TITLE_VOCAB));
  // Let the ending clip land before the card.
  const delay = outcome === 'quit' ? 0 : 900;
  setTimeout(() => show('results'), delay);
});

// ---------- input ----------
document.addEventListener('keydown', (e) => {
  if (els.dialog.open || els.screens.game.hidden) return;
  if (e.key === 'Escape') {
    setPaused(!paused);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
  e.preventDefault();
  if (paused) return;
  player.input(e.key);
  draw(0, 0);
});
document.addEventListener('keyup', (e) => {
  if (e.key.length === 1) player.release(e.key);
});
els.paused.addEventListener('click', () => setPaused(false));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
new ResizeObserver(() => {
  scene.fit();
  if (player.phase !== Phase.IDLE) draw(0, 0);
}).observe(els.stage);

// ---------- settings dialog ----------
function fillForm(s) {
  const f = els.form.elements;
  f.namedItem('fight').value = s.fight;
  for (const radio of els.form.querySelectorAll('input[name="mistakes"]')) radio.checked = radio.value === s.mistakes;
  for (const radio of els.form.querySelectorAll('input[name="keySource"]')) radio.checked = radio.value === s.keySource;
  f.namedItem('keyLetters').checked = s.keys.letters;
  f.namedItem('keyNumbers').checked = s.keys.numbers;
  f.namedItem('keyPunctuation').checked = s.keys.punctuation;
  f.namedItem('keyPool').value = s.keys.pool;
  f.namedItem('windowScale').value = String(s.windowScale);
  f.namedItem('slowmo').value = String(s.slowmo);
  f.namedItem('showBoard').checked = s.showBoard;
  f.namedItem('sound').checked = s.sound;
  syncNested();
}

function readForm() {
  const f = els.form.elements;
  return normalizeSettings({
    fight: f.namedItem('fight').value,
    mistakes: f.namedItem('mistakes').value,
    keySource: f.namedItem('keySource').value,
    keys: {
      letters: f.namedItem('keyLetters').checked,
      numbers: f.namedItem('keyNumbers').checked,
      punctuation: f.namedItem('keyPunctuation').checked,
      pool: f.namedItem('keyPool').value,
    },
    windowScale: Number(f.namedItem('windowScale').value),
    slowmo: Number(f.namedItem('slowmo').value),
    showBoard: f.namedItem('showBoard').checked,
    sound: f.namedItem('sound').checked,
  });
}

function syncNested() {
  const usePool = els.form.elements.namedItem('keySource').value === 'pool';
  const nested = $('#pool-options');
  nested.classList.toggle('is-off', !usePool);
  for (const input of nested.querySelectorAll('input')) input.disabled = !usePool;
}

function populateFights() {
  const select = els.form.elements.namedItem('fight');
  select.replaceChildren();
  for (const fight of fights) {
    const option = el('option', null, fight.title);
    option.value = fight.id;
    select.append(option);
  }
}

els.form.addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'save') return;
  settings = readForm();
  saveSettings(settings);
  renderSummary();
});
els.form.addEventListener('change', syncNested);
$('#btn-reset').addEventListener('click', () => fillForm(normalizeSettings(DEFAULT_SETTINGS)));
const openSettings = () => {
  fillForm(settings);
  els.dialog.showModal();
};

// ---------- buttons ----------
$('#btn-start').addEventListener('click', startFight);
$('#btn-again').addEventListener('click', startFight);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-settings-2').addEventListener('click', openSettings);
$('#btn-quit').addEventListener('click', () => {
  if (player.phase === Phase.ENDED || player.phase === Phase.IDLE) show('menu');
  else player.quit();
});

populateFights();
buildBoard();
renderSummary();
show('menu');

window.__duel = { player, scene, sounds, draw, get settings() { return settings; }, startFight };
