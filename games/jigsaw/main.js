import { formatDuration } from '../../shared/engine/options.js';
import { renderTitles } from '../../shared/ui/titles.js';
import { PICTURES, loadImage, pictureUrl } from './pictures.js';
import { gridFor } from './pieces.js';
import { Puzzle } from './puzzle.js';
import { DEFAULT_SETTINGS, PIECE_LIMITS, loadSettings, normalizeSettings, saveSettings } from './settings.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let settings = loadSettings();
let custom = null; // { url, image, name } for a picture the player loaded this session
const images = new Map(); // picture id -> loaded Image

const els = {
  screens: { menu: $('#screen-menu'), game: $('#screen-game') },
  summary: $('#config-summary'),
  board: $('#board'),
  canvas: $('#puzzle'),
  hud: { time: $('#hud-time'), placed: $('#hud-placed'), total: $('#hud-total'), moves: $('#hud-moves') },
  done: $('#done'),
  doneTime: $('#done-time'),
  doneMeta: $('#done-meta'),
  titles: $('#titles'),
  dialog: $('#settings-dialog'),
  form: $('#settings-form'),
  pictureGrid: $('#picture-grid'),
  piecesHint: $('#pieces-hint'),
  uploadName: $('#upload-name'),
};

const puzzle = new Puzzle(els.canvas);
let timer = 0;
let doneTimer = 0;

// ---------- pictures ----------
function currentPicture() {
  if (settings.picture === 'custom' && custom) return { id: 'custom', name: custom.name, url: custom.url };
  const p = PICTURES.find((x) => x.id === settings.picture) ?? PICTURES[0];
  return { id: p.id, name: p.name, url: pictureUrl(p) };
}

async function imageFor(picture) {
  if (picture.id === 'custom') return custom.image;
  if (!images.has(picture.id)) images.set(picture.id, await loadImage(picture.url));
  return images.get(picture.id);
}

function aspectOf(pictureId) {
  if (pictureId === 'custom' && custom) return custom.image.naturalWidth / custom.image.naturalHeight;
  return 3 / 2; // every built-in picture
}

// ---------- screens ----------
function show(name) {
  for (const [key, node] of Object.entries(els.screens)) node.hidden = key !== name;
}

function renderSummary() {
  const picture = currentPicture();
  const grid = gridFor(settings.pieces, aspectOf(picture.id));
  els.summary.textContent = [`${grid.count} pieces`, picture.name, settings.guide ? 'guide on' : 'guide off'].join(' · ');
}

// ---------- game ----------
async function start() {
  const picture = currentPicture();
  const image = await imageFor(picture);
  show('game');
  els.done.hidden = true;
  clearTimeout(doneTimer);
  puzzle.setup({ image, pieces: settings.pieces, guide: settings.guide });
  els.hud.total.textContent = String(puzzle.total);
  els.hud.placed.textContent = '0';
  els.hud.moves.textContent = '0';
  els.hud.time.textContent = '0:00';
  clearInterval(timer);
  timer = setInterval(() => {
    if (!puzzle.complete) els.hud.time.textContent = formatDuration(puzzle.elapsedMs / 1000);
  }, 250);
}

function quit() {
  clearInterval(timer);
  clearTimeout(doneTimer);
  show('menu');
}

puzzle.addEventListener('place', ({ detail }) => {
  els.hud.placed.textContent = String(detail.placed);
});
puzzle.addEventListener('move', ({ detail }) => {
  els.hud.moves.textContent = String(detail.moves);
});
puzzle.addEventListener('complete', ({ detail }) => {
  clearInterval(timer);
  els.hud.time.textContent = formatDuration(detail.elapsedMs / 1000);
  els.doneTime.textContent = formatDuration(detail.elapsedMs / 1000);
  els.doneMeta.textContent = `${detail.total} pieces · ${detail.moves} move${detail.moves === 1 ? '' : 's'} · ${currentPicture().name}`;
  renderTitles(els.titles, puzzleTitles(detail));
  // Let the finished picture shine for a moment before the card slides in.
  doneTimer = setTimeout(() => { els.done.hidden = false; }, 1200);
});

/** Three cheerful titles for a finished puzzle: pace, precision, and one just for fun. */
function puzzleTitles({ elapsedMs, moves, total }) {
  const seconds = elapsedMs / 1000;
  const perPiece = seconds / total;
  const wasted = moves - total; // drops that didn't snap
  const pace =
    perPiece < 2.5
      ? { kind: 'good', emoji: '🚀', name: 'Rocket Solver', blurb: `${total} pieces in ${formatDuration(seconds)}. Zoom!` }
      : perPiece < 6
        ? { kind: 'good', emoji: '🧩', name: 'Puzzle Pro', blurb: `All ${total} pieces in ${formatDuration(seconds)}.` }
        : { kind: 'good', emoji: '🐢', name: 'Steady Solver', blurb: 'Slow and steady finished the picture.' };
  const precision =
    wasted <= Math.max(1, total * 0.1)
      ? { kind: 'good', emoji: '🎯', name: 'Snap Wizard', blurb: 'Nearly every piece went straight to its spot.' }
      : wasted > total
        ? { kind: 'silly', emoji: '🌪️', name: 'Piece Tornado', blurb: `${moves} moves for ${total} pieces. What a whirlwind!` }
        : { kind: 'silly', emoji: '🔍', name: 'Piece Detective', blurb: `${moves} moves to crack the case.` };
  const fun = { kind: 'silly', emoji: '🖼️', name: 'Picture Perfect', blurb: 'The whole picture, all in one piece again.' };
  return [pace, precision, fun];
}

// ---------- settings dialog ----------
function renderPictureOptions() {
  els.pictureGrid.replaceChildren();
  const options = PICTURES.map((p) => ({ id: p.id, name: p.name, url: pictureUrl(p) }));
  if (custom) options.push({ id: 'custom', name: custom.name, url: custom.url });
  for (const option of options) {
    const label = el('label', 'picture-option');
    const input = el('input');
    input.type = 'radio';
    input.name = 'picture';
    input.value = option.id;
    const img = el('img');
    img.src = option.url;
    img.alt = option.name;
    label.append(input, img, el('span', null, option.name));
    els.pictureGrid.append(label);
  }
}

function updatePiecesHint() {
  const f = els.form.elements;
  const pictureId = f.namedItem('picture').value || settings.picture;
  const grid = gridFor(Number(f.namedItem('pieces').value) || settings.pieces, aspectOf(pictureId));
  els.piecesHint.textContent = `${grid.cols} × ${grid.rows} = ${grid.count} pieces`;
}

function fillForm(s) {
  const f = els.form.elements;
  f.namedItem('pieces').value = String(s.pieces);
  f.namedItem('guide').checked = s.guide;
  const pictureId = s.picture === 'custom' && !custom ? DEFAULT_SETTINGS.picture : s.picture;
  for (const radio of els.form.querySelectorAll('input[name="picture"]')) radio.checked = radio.value === pictureId;
  f.namedItem('upload').value = '';
  els.uploadName.textContent = custom ? `Loaded: ${custom.name}` : '';
  updatePiecesHint();
}

function readForm() {
  const f = els.form.elements;
  return normalizeSettings({
    pieces: Number(f.namedItem('pieces').value),
    picture: f.namedItem('picture').value,
    guide: f.namedItem('guide').checked,
  });
}

function openSettings() {
  renderPictureOptions();
  fillForm(settings);
  els.dialog.showModal();
}

els.form.addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'save') return;
  settings = readForm();
  saveSettings(settings);
  renderSummary();
  if (!els.screens.game.hidden && puzzle.image) puzzle.setGuide(settings.guide);
});
els.form.addEventListener('input', updatePiecesHint);
els.form.addEventListener('change', updatePiecesHint);
$('#btn-reset').addEventListener('click', () => fillForm(normalizeSettings(DEFAULT_SETTINGS)));
els.form.elements.namedItem('upload').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const url = URL.createObjectURL(file);
    const image = await loadImage(url);
    if (custom) URL.revokeObjectURL(custom.url);
    custom = { url, image, name: file.name.replace(/\.[^.]+$/, '') || 'Your picture' };
    renderPictureOptions();
    for (const radio of els.form.querySelectorAll('input[name="picture"]')) radio.checked = radio.value === 'custom';
    els.uploadName.textContent = `Loaded: ${custom.name}`;
    updatePiecesHint();
  } catch {
    els.uploadName.textContent = "That file couldn't be opened as a picture.";
  }
});

// ---------- buttons ----------
$('#btn-start').addEventListener('click', start);
$('#btn-again').addEventListener('click', start);
$('#btn-shuffle').addEventListener('click', start);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-settings-2').addEventListener('click', openSettings);
$('#btn-quit').addEventListener('click', quit);
const peek = $('#btn-peek');
const peekOn = () => puzzle.setPeek(true);
const peekOff = () => puzzle.setPeek(false);
peek.addEventListener('pointerdown', peekOn);
peek.addEventListener('pointerup', peekOff);
peek.addEventListener('pointercancel', peekOff);
peek.addEventListener('pointerleave', peekOff);
peek.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') peekOn(); });
peek.addEventListener('keyup', peekOff);

new ResizeObserver(() => puzzle.resize()).observe(els.board);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.dialog.open && !els.screens.game.hidden) quit();
});

renderSummary();
show('menu');

window.__jigsaw = { puzzle, get settings() { return settings; }, start };
