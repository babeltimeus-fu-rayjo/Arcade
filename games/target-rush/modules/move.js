/**
 * Moving targets: a share of targets drift slowly along a small closed path
 * (circle, lines, diagonals, square, diamond, triangle, figure eight).
 *
 * Everything is decided while the round is planned (onPlan), before the target
 * is placed: the scheduler then reserves the path's whole reach as the target's
 * footprint, so moving targets never overlap anything. Paths are unit shapes in
 * [-1, 1]^2 traced by a phase t in [0, 1); speed is set in target widths per
 * second so it feels the same on every screen. All randomness comes from
 * engine.rng, so peers sharing a seed see the same motion.
 */
const TAU = Math.PI * 2;

/** Constant-speed trace of a closed polygon. */
function polygon(vertices) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segments.push({ a, b, length });
    total += length;
  }
  return (t) => {
    let d = (((t % 1) + 1) % 1) * total;
    for (const s of segments) {
      if (d <= s.length) {
        const k = s.length ? d / s.length : 0;
        return [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
      }
      d -= s.length;
    }
    return vertices[0];
  };
}

const RAW_PATTERNS = {
  circle: (t) => [Math.cos(TAU * t), Math.sin(TAU * t)],
  'left-right': (t) => [Math.sin(TAU * t), 0],
  'up-down': (t) => [0, Math.sin(TAU * t)],
  diagonal: (t) => [Math.sin(TAU * t), Math.sin(TAU * t)],
  'anti-diagonal': (t) => [Math.sin(TAU * t), -Math.sin(TAU * t)],
  square: polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]]),
  diamond: polygon([[0, -1], [1, 0], [0, 1], [-1, 0]]),
  triangle: polygon([[0, -1], [1, 0.8], [-1, 0.8]]),
  'figure-eight': (t) => [Math.sin(TAU * t), Math.sin(2 * TAU * t) / 2],
};

/** Farthest a unit pattern gets from its centre (a square's corner is sqrt(2) out). */
function extent(pattern, samples = 4096) {
  let max = 0;
  for (let i = 0; i < samples; i++) max = Math.max(max, Math.hypot(...pattern(i / samples)));
  return max || 1;
}

/**
 * Patterns scaled so nothing strays farther than 1 from the centre: then the
 * amplitude is exactly the reach the scheduler reserves as the footprint.
 */
export const PATTERNS = Object.fromEntries(
  Object.entries(RAW_PATTERNS).map(([name, raw]) => {
    const scale = 1 / extent(raw);
    return [name, (t) => raw(t).map((v) => v * scale)];
  }),
);

const PATTERN_NAMES = Object.keys(PATTERNS);

/** Length of one loop of a unit pattern, so speed can be expressed as distance per second. */
function loopLength(pattern, samples = 256) {
  let length = 0;
  let [px, py] = pattern(0);
  for (let i = 1; i <= samples; i++) {
    const [x, y] = pattern(i / samples);
    length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return length;
}
const LOOP_LENGTHS = Object.fromEntries(PATTERN_NAMES.map((name) => [name, loopLength(PATTERNS[name])]));

function applyMotion(target, engine, ageMs) {
  const m = target.motion;
  const { width, height } = engine.geometry;
  const phase = m.phase + (m.direction * ageMs) / m.periodMs;
  const [px, py] = PATTERNS[m.pattern](phase);
  // dx/dy are fractions of the arena, relative to the scheduled spot (the path's centre).
  target.dx = (m.amplitude * px) / width;
  target.dy = (m.amplitude * py) / height;
}

export default {
  id: 'move',
  name: 'Moving targets',
  description: 'Some targets drift along a small path: circles, lines, squares, diamonds, triangles and figure eights.',
  options: [
    { id: 'share', label: 'Moving targets', type: 'number', default: 50, min: 0, max: 100, step: 10, unit: '%' },
    { id: 'size', label: 'Path size', type: 'number', default: 100, min: 50, max: 200, step: 10, unit: '%' },
    { id: 'lifetime', label: 'Lifetime of moving targets (seconds)', type: 'range', default: [3, 4.5], min: 0.5, max: 15, step: 0.1 },
    { id: 'speed', label: 'Speed (target widths per second)', type: 'range', default: [0.5, 1], min: 0.1, max: 5, step: 0.1 },
  ],
  onPlan(planned, engine) {
    const { share, size, lifetime, speed } = engine.options('move');
    const rng = engine.rng;
    if (rng.next() * 100 >= share) return;

    const { radius } = engine.geometry;
    const pattern = PATTERN_NAMES[rng.int(0, PATTERN_NAMES.length - 1)];
    const amplitude = radius * rng.range(1.2, 1.8) * (size / 100);
    const widthsPerSec = rng.range(speed[0], speed[1]);
    const unitsPerSec = Math.max(0.001, widthsPerSec * 2 * radius); // a target is 2r wide
    const periodMs = ((LOOP_LENGTHS[pattern] * amplitude) / unitsPerSec) * 1000;

    planned.lifetimeMs = Math.round(rng.range(lifetime[0], lifetime[1]) * 1000);
    planned.footprint = radius + amplitude; // reserve the whole path
    planned.motion = {
      pattern,
      amplitude,
      phase: rng.next(),
      direction: rng.next() < 0.5 ? -1 : 1,
      periodMs,
    };
  },
  onSpawn(target, engine) {
    if (!target.motion) return;
    applyMotion(target, engine, 0);
    // Outline for the UI to draw: the closed path in arena fractions.
    const { width, height } = engine.geometry;
    const m = target.motion;
    const fn = PATTERNS[m.pattern];
    target.path = Array.from({ length: 72 }, (_, i) => {
      const [px, py] = fn(i / 72);
      return [(target.x + m.amplitude * px) / width, (target.y + m.amplitude * py) / height];
    });
  },
  onUpdate(_dtMs, engine) {
    for (const target of engine.active.values()) {
      if (target.motion) applyMotion(target, engine, engine.elapsed - target.spawnAt);
    }
  },
};
