/**
 * US QWERTY layout, shared by everything keyboard-driven: the Target Rush
 * keyboard module and the Whack-a-Mole board.
 *
 * Positions are physical: `offset` is a row's left inset in key widths, `x`/`y`
 * are normalised board coordinates (0..1) used to relate keys to screen spots.
 */
export const ROWS = [
  { y: 0, offset: 0, keys: '`1234567890-=' },
  { y: 1 / 3, offset: 1.5, keys: 'qwertyuiop[]' },
  { y: 2 / 3, offset: 1.75, keys: "asdfghjkl;'" },
  { y: 1, offset: 2.25, keys: 'zxcvbnm,./' },
];
export const COLUMNS = 13; // key x positions are normalised by this
export const BOARD_WIDTH_UNITS = 13.5; // widest row extent, in key widths
export const BOARD_HEIGHT_UNITS = 4;

export function categoryOf(key) {
  if (/[a-z]/.test(key)) return 'letters';
  if (/[0-9]/.test(key)) return 'numbers';
  if (key === '`') return 'other'; // only via a custom pool
  return 'punctuation';
}

export const KEYS = ROWS.flatMap((row, rowIndex) =>
  [...row.keys].map((key, i) => ({
    key,
    x: (row.offset + i) / COLUMNS,
    y: row.y,
    row: rowIndex,
    col: row.offset + i,
    category: categoryOf(key),
  })),
);
export const BY_KEY = new Map(KEYS.map((k) => [k.key, k]));

// Shifted symbols sit on the same physical key as their base character.
export const SHIFTED = {
  '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '+': '=', '{': '[', '}': ']', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
};

/** The physical key a character lives on, if it is on the board at all. */
export function boardKeyFor(char) {
  return BY_KEY.get(char) ?? BY_KEY.get(SHIFTED[char]) ?? null;
}

/** Turn custom-pool text into key entries; unknown characters sit mid-board. */
export function parsePool(text) {
  const pool = [];
  const seen = new Set();
  for (const raw of [...String(text ?? '')]) {
    const ch = raw.toLowerCase();
    if (/\s/.test(ch) || seen.has(ch)) continue;
    seen.add(ch);
    const base = boardKeyFor(ch);
    pool.push(base ? { key: ch, x: base.x, y: base.y, row: base.row, col: base.col } : { key: ch, x: 0.5, y: 0.5 });
  }
  return pool;
}

/** Keys from the enabled groups ({ letters, numbers, punctuation }). */
export function keysForGroups(groups) {
  return KEYS.filter((k) => groups?.[k.category]);
}
