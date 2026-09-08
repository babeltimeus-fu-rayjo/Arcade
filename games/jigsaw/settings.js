import { clamp, createSettingsStore, deepFreeze, num, obj } from '../../shared/engine/options.js';
import { PICTURES } from './pictures.js';

export const STORAGE_KEY = 'arcade.jigsaw.settings.v1';

export const DEFAULT_SETTINGS = deepFreeze({
  pieces: 12, // wanted piece count; the grid rounds it to rows x cols
  picture: 'meadow', // a built-in picture id ('custom' means the player's own, kept for the session only)
  guide: true, // faint copy of the picture in the frame
});

export const PIECE_LIMITS = { min: 4, max: 200 };

export function normalizeSettings(raw) {
  const src = obj(raw);
  const s = { ...DEFAULT_SETTINGS };
  s.pieces = clamp(Math.round(num(src.pieces, DEFAULT_SETTINGS.pieces)), PIECE_LIMITS.min, PIECE_LIMITS.max);
  s.picture = PICTURES.some((p) => p.id === src.picture) || src.picture === 'custom' ? src.picture : DEFAULT_SETTINGS.picture;
  s.guide = src.guide === undefined ? DEFAULT_SETTINGS.guide : Boolean(src.guide);
  return s;
}

const store = createSettingsStore(STORAGE_KEY, normalizeSettings);
export const loadSettings = () => {
  const s = store.load();
  if (s.picture === 'custom') s.picture = DEFAULT_SETTINGS.picture; // uploads don't survive a reload
  return s;
};
export const saveSettings = (settings) => store.save(settings.picture === 'custom' ? { ...settings, picture: DEFAULT_SETTINGS.picture } : settings);
