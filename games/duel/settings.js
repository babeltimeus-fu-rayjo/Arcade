import { clamp, createSettingsStore, deepFreeze, num, obj } from '../../shared/engine/options.js';
import { fights } from './fights/index.js';

export const STORAGE_KEY = 'arcade.duel.settings.v1';

export const DEFAULT_SETTINGS = deepFreeze({
  fight: 'ruins-robot',
  mistakes: 'story', // 'story' (fail forward, hearts) | 'retry' (replay the beat) | 'practice' (no fail branches)
  keySource: 'fixed', // 'fixed' (keys written in the script) | 'pool' (drawn from the practice pool)
  keys: { letters: true, numbers: false, punctuation: false, pool: '' },
  windowScale: 1, // prompt window multiplier
  slowmo: 0.2, // time scale while a prompt is open (1 = no slow motion)
  showBoard: true, // draw the keyboard with the target key lit during prompts
  sound: true, // synthesised whooshes, clangs and thuds
});

const MISTAKES = ['story', 'retry', 'practice'];
const SOURCES = ['fixed', 'pool'];

export function normalizeSettings(raw) {
  const src = obj(raw);
  const s = { ...DEFAULT_SETTINGS };
  s.fight = fights.some((f) => f.id === src.fight) ? src.fight : DEFAULT_SETTINGS.fight;
  s.mistakes = MISTAKES.includes(src.mistakes) ? src.mistakes : DEFAULT_SETTINGS.mistakes;
  s.keySource = SOURCES.includes(src.keySource) ? src.keySource : DEFAULT_SETTINGS.keySource;
  const k = { ...DEFAULT_SETTINGS.keys, ...obj(src.keys) };
  s.keys = { letters: Boolean(k.letters), numbers: Boolean(k.numbers), punctuation: Boolean(k.punctuation), pool: typeof k.pool === 'string' ? k.pool.slice(0, 64) : '' };
  s.windowScale = clamp(num(src.windowScale, DEFAULT_SETTINGS.windowScale), 0.5, 2.5);
  s.slowmo = clamp(num(src.slowmo, DEFAULT_SETTINGS.slowmo), 0.05, 1);
  s.showBoard = src.showBoard === undefined ? DEFAULT_SETTINGS.showBoard : Boolean(src.showBoard);
  s.sound = src.sound === undefined ? DEFAULT_SETTINGS.sound : Boolean(src.sound);
  return s;
}

const store = createSettingsStore(STORAGE_KEY, normalizeSettings);
export const loadSettings = () => store.load();
export const saveSettings = (settings) => store.save(settings);
