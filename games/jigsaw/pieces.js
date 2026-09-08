/**
 * Jigsaw geometry: how many rows and columns a piece count becomes, which
 * edges get a knob or a notch, and the outline path of a piece.
 */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** How far a knob sticks out, as a fraction of the shorter piece side. */
export const KNOB_DEPTH = 0.34;

// One edge from (0,0) to (1,0) in edge-local units: u along the edge, v outward.
// Four cubic segments: ease into the neck, round head (two halves), ease back out.
const KNOB = [
  [0.33, 0.0, 0.44, 0.03, 0.42, 0.09],
  [0.28, 0.16, 0.3, 0.34, 0.5, 0.34],
  [0.7, 0.34, 0.72, 0.16, 0.58, 0.09],
  [0.56, 0.03, 0.67, 0.0, 1.0, 0.0],
];

/** Rows x cols for a wanted piece count and picture aspect (width / height). Pieces come out near-square. */
export function gridFor(count, aspect) {
  const n = clamp(Math.round(Number(count) || 12), 4, 400);
  const cols = Math.max(2, Math.round(Math.sqrt(n * aspect)));
  const rows = Math.max(2, Math.round(n / cols));
  return { rows, cols, count: rows * cols };
}

/**
 * Decide every interior edge once (shared by both neighbours) so the pieces
 * interlock. +1 on a horizontal edge means the knob points down (belongs to the
 * upper piece); +1 on a vertical edge means it points right (belongs to the left piece).
 */
export function makeEdges(rows, cols, rng) {
  const h = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => (r === 0 ? 0 : rng.next() < 0.5 ? 1 : -1)));
  const v = Array.from({ length: rows }, () => Array.from({ length: cols }, (_, c) => (c === 0 ? 0 : rng.next() < 0.5 ? 1 : -1)));
  return {
    /** Signs for one piece, seen from its own outside: +1 knob out, -1 notch in, 0 straight border. */
    of(r, c) {
      return {
        top: r === 0 ? 0 : -h[r][c],
        bottom: r === rows - 1 ? 0 : h[r + 1][c],
        left: c === 0 ? 0 : -v[r][c],
        right: c === cols - 1 ? 0 : v[r][c + 1],
      };
    },
  };
}

/** Append one edge to `path`, from (x0,y0) along (dx,dy). `unit` scales the knob depth. */
function edge(path, x0, y0, dx, dy, sign, unit) {
  if (!sign) {
    path.lineTo(x0 + dx, y0 + dy);
    return;
  }
  const length = Math.hypot(dx, dy);
  // Outward normal for a clockwise outline (screen coordinates): (dy, -dx) / length.
  const nx = (sign * unit * dy) / length;
  const ny = (-sign * unit * dx) / length;
  const px = (u, v) => x0 + u * dx + v * nx;
  const py = (u, v) => y0 + u * dy + v * ny;
  for (const [c1u, c1v, c2u, c2v, u, v] of KNOB) {
    path.bezierCurveTo(px(c1u, c1v), py(c1u, c1v), px(c2u, c2v), py(c2u, c2v), px(u, v), py(u, v));
  }
}

/** Outline of a piece whose cell is (0,0)-(pw,ph), knobs poking past the cell. */
export function piecePath(pw, ph, edges) {
  const unit = Math.min(pw, ph);
  const path = new Path2D();
  path.moveTo(0, 0);
  edge(path, 0, 0, pw, 0, edges.top, unit);
  edge(path, pw, 0, 0, ph, edges.right, unit);
  edge(path, pw, ph, -pw, 0, edges.bottom, unit);
  edge(path, 0, ph, 0, -ph, edges.left, unit);
  path.closePath();
  return path;
}
