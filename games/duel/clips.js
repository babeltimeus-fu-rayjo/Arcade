/**
 * Animation clips: for a clip time t (0..1) return rig offsets for the hero and
 * the foe plus screen effects. Rigs are offsets from each fighter's home pose:
 *   x, y     position offset (scene px; y negative is up)
 *   lean     torso tilt (radians, positive leans toward the opponent)
 *   squash   vertical scale (1 normal)
 *   armF     front arm angle: 0 hangs down, positive swings forward, about -2.4 is raised back
 *   armB     back arm angle
 *   weapon   extra weapon angle relative to the front arm
 *   rot      whole-body rotation about the feet (negative falls backward)
 *   face     expression (see FACES)
 * Effects: flash (0..1 white), red (0..1 red flash), shake (0..1), punch (0..1 camera zoom kick), tint ('gold').
 * `bursts` fire particles once when the clip passes `at` (kind spark | ring | dust | whoosh, anchored to
 * a fighter with an offset from its feet). `hitStops` freeze scene time for `ms` real milliseconds
 * when the clip reaches `at`: the classic impact frame.
 *
 * Combat timing follows the animation basics: a slow wind-up (anticipation), a strike that snaps
 * in well under 100 ms, a held impact frame, overshoot that settles back, exaggerated recoil on
 * the victim, then a relaxed recovery.
 */
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
const eo = (k) => 1 - (1 - k) ** 3;
const ei = (k) => k ** 3;
const eio = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const bell = (t, c, w) => {
  const d = Math.abs(t - c) / w;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
};

const HERO_REST = { armF: 0.5, armB: -0.4 };
const FOE_REST = { armF: -0.6, armB: 0.3 };
const FOE_WOUND = { x: -110, armF: -2.5, lean: 0.2 }; // club raised, stepped in
const FOE_LOW = { x: -100, armF: -1.25, lean: 0.3, squash: 0.85 }; // club wound low
const FOE_GRAB = { x: -230, armF: 1.4, armB: 1.4, lean: 0.3 };
const FOE_THRUST = { x: -60, armF: -1.6, armB: 1.0, lean: -0.25 }; // club pulled back for a jab
const FOE_SMASH = { x: -100, armF: -3.0, armB: -3.0, lean: -0.3 }; // club and both arms overhead
const FOE_POUND = { x: -80, armF: -2.9, armB: -2.9, lean: -0.1, squash: 0.92 };
const FOE_DOUBLE = { x: -110, armF: -2.6, lean: 0.25 };
const FOE_THROW = { x: -40, armF: -2.9, armB: 0.6, lean: -0.15 };
const CHARGED = { glow: 1 };

/** World position of a thrown rock: from the robot's raised hand toward a target, on an arc. */
function rockFlight(t, from, to, a, b, arc = 90) {
  const k = seg(t, a, b);
  return { kind: 'rock', x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) - arc * Math.sin(Math.PI * k), rot: k * 9, size: 26 };
}
const FOE_HAND_UP = { x: 670 - 16, y: 195 }; // where the robot holds a rock overhead (with FOE_THROW.x applied)

/**
 * A weapon swing: raise to `raised` (anticipation), snap to `contact` just before `at`
 * (overshooting, then settling), then recover to `rest`. Pass raise [0, 0] when the
 * arm is already raised from the previous beat.
 */
function swing(t, { rest, raised, contact, raise = [0, 0.3], at = 0.38, snap = 0.08, settle = 0.18, recover = [0.65, 0.95], overshoot = 0.3 }) {
  const snapStart = at - snap;
  if (t < snapStart) return lerp(rest, raised, eio(seg(t, raise[0], raise[1])));
  if (t < at) return lerp(raised, contact + overshoot, ei(seg(t, snapStart, at)));
  if (t < at + settle) return lerp(contact + overshoot, contact, eo(seg(t, at, at + settle)));
  return lerp(contact, rest, eio(seg(t, recover[0], recover[1])));
}

/** Whole-body commitment for the attacker: coil back, drive in on the snap, settle. dir: +1 hero, -1 foe. */
function attackerBody(t, at, { step = 60, dir = 1, coil = -0.18, drive = 0.55, recover = 0.55 } = {}) {
  const snapStart = at - 0.08;
  const lean = t < snapStart ? coil * eio(seg(t, 0, snapStart)) : t < at ? lerp(coil, drive, ei(seg(t, snapStart, at))) : lerp(drive, 0, eio(seg(t, at + 0.14, at + recover)));
  const x = dir * step * (t < at ? ei(seg(t, snapStart, at)) : 1 - eio(seg(t, at + 0.2, Math.min(1, at + recover + 0.1))));
  return { lean, x, squash: 1 - 0.1 * bell(t, at + 0.02, 0.06) };
}

/** Recoil for whoever got hit: flung back fast, stretched then squashed, a small pop off the ground. */
function hitReaction(t, at, { dist = -120, lean = -0.95, pop = 18, hold = 0.32, recover = true } = {}) {
  if (t < at) return { x: 0, lean: 0, squash: 1, y: 0 };
  const back = recover ? eio(seg(t, Math.min(at + hold + 0.08, 0.7), 0.97)) : 0;
  return {
    x: dist * eo(seg(t, at, at + hold)) * (1 - back),
    lean: lean * bell(t, at + 0.1, 0.34),
    squash: 1 + 0.16 * bell(t, at, 0.035) - 0.18 * bell(t, at + 0.09, 0.1),
    y: -pop * bell(t, at + 0.06, 0.1),
  };
}

/** Screen impact: a one-frame white pop, a shake and a camera punch. */
function impactFx(t, at, strength = 1) {
  return {
    flash: 0.85 * strength * bell(t, at, 0.03),
    shake: strength * bell(t, at + 0.03, 0.2),
    punch: strength * bell(t, at + 0.01, 0.1),
  };
}

const ringAt = (at, who, dx, dy) => ({ at, kind: 'ring', who, dx, dy });
const sparkAt = (at, who, dx, dy) => ({ at, kind: 'spark', who, dx, dy });
const whooshAt = (at, who, dx, dy) => ({ at, kind: 'whoosh', who, dx, dy });
const dustAt = (at, who, dx, dy) => ({ at, kind: 'dust', who, dx, dy });

/** The foe swings a wound-up club through (dodge clips): snap, overshoot, then walk back to rest. */
function foeSwingThrough(t, wound, contact, at = 0.14) {
  const back = eio(seg(t, 0.55, 0.95));
  return {
    x: lerp(wound.x - 40 * ei(seg(t, at - 0.1, at)), 0, back),
    armF: swing(t, { rest: FOE_REST.armF, raised: wound.armF, contact, raise: [0, 0], at, snap: 0.1, settle: 0.2, recover: [0.55, 0.95], overshoot: 0.35 }),
    lean: lerp((wound.lean ?? 0) + 0.4 * ei(seg(t, at - 0.1, at)) - 0.4 * eo(seg(t, at, at + 0.3)), 0, back),
    squash: lerp(wound.squash ?? 1, 1, back),
  };
}

export const CLIPS = {
  faceoff: {
    rig: (t) => ({
      hero: { x: -40 * (1 - eo(seg(t, 0, 0.6))), lean: 0.1 * bell(t, 0.7, 0.3) },
      foe: { x: 40 * (1 - eo(seg(t, 0, 0.6))), lean: 0.2 * bell(t, 0.75, 0.3), armF: FOE_REST.armF - 0.5 * bell(t, 0.75, 0.3) },
    }),
  },

  // ---- high swing: duck or get bonked ----
  foe_swing_high: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.5));
      const hop = -14 * Math.sin(Math.PI * seg(t, 0.05, 0.35));
      return { foe: { x: FOE_WOUND.x * k, y: hop, armF: lerp(FOE_REST.armF, FOE_WOUND.armF, k), armB: lerp(FOE_REST.armB, -0.6, k), lean: FOE_WOUND.lean * k, squash: 1 + 0.05 * k } };
    },
  },
  hero_duck: {
    rig: (t) => {
      const down = t < 0.08 ? ei(seg(t, 0, 0.08)) : t < 0.42 ? 1 : 1 - eio(seg(t, 0.42, 0.72));
      return {
        hero: { squash: 1 - 0.5 * down, lean: 0.3 * down, x: -10 * down },
        foe: foeSwingThrough(t, FOE_WOUND, 1.2),
      };
    },
    bursts: [whooshAt(0.1, 'hero', 30, -200)],
  },
  hero_hit: {
    rig: (t) => {
      const r = hitReaction(t, 0.14, { dist: -130 });
      return {
        hero: { ...r },
        foe: foeSwingThrough(t, FOE_WOUND, 1.2),
        ...impactFx(t, 0.14, 1),
        red: 0.9 * bell(t, 0.17, 0.14),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -80, -200), sparkAt(0.14, 'hero', 10, -180), ringAt(0.14, 'hero', 10, -180)],
    hitStops: [{ at: 0.14, ms: 110 }],
  },
  hero_counter: {
    rig: (t) => {
      const at = 0.36;
      const body = attackerBody(t, at, { step: 95 });
      const react = hitReaction(t, at, { dist: 90, lean: -0.75, pop: 14 });
      return {
        hero: {
          armF: swing(t, { rest: HERO_REST.armF, raised: -2.5, contact: 1.35, raise: [0, 0.28], at, snap: 0.07, settle: 0.16, recover: [0.62, 0.92] }),
          armB: t < at ? lerp(HERO_REST.armB, -1.5, eio(seg(t, 0, 0.28))) : lerp(-1.5, HERO_REST.armB, eio(seg(t, at, 0.8))),
          ...body,
        },
        foe: { ...react },
        ...impactFx(t, at, 1),
      };
    },
    bursts: [whooshAt(0.3, 'hero', 90, -150), sparkAt(0.36, 'foe', -70, -150), ringAt(0.36, 'foe', -70, -150)],
    hitStops: [{ at: 0.36, ms: 100 }],
  },

  // ---- low sweep: jump or get clipped ----
  foe_swing_low: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.5));
      return { foe: { x: FOE_LOW.x * k, armF: lerp(FOE_REST.armF, FOE_LOW.armF, k), armB: lerp(FOE_REST.armB, 1.0, k), lean: FOE_LOW.lean * k, squash: lerp(1, FOE_LOW.squash, k) } };
    },
  },
  hero_jump: {
    rig: (t) => {
      const crouch = 1 - 0.22 * bell(t, 0.04, 0.06);
      const air = Math.sin(Math.PI * seg(t, 0.08, 0.7));
      return {
        hero: { y: -170 * air, squash: crouch * (1 + 0.14 * bell(t, 0.16, 0.12)) * (1 - 0.15 * bell(t, 0.72, 0.06)), lean: 0.2 * air },
        foe: foeSwingThrough(t, FOE_LOW, 1.4, 0.18),
      };
    },
    bursts: [dustAt(0.08, 'hero', 0, 0), whooshAt(0.14, 'hero', 0, -40)],
  },
  hero_hit_low: {
    rig: (t) => {
      const r = hitReaction(t, 0.16, { dist: -100, lean: -0.6, pop: 26 });
      return {
        hero: { ...r, squash: r.squash * (1 - 0.15 * bell(t, 0.22, 0.14)) },
        foe: foeSwingThrough(t, FOE_LOW, 1.4, 0.16),
        ...impactFx(t, 0.16, 0.9),
        red: 0.9 * bell(t, 0.19, 0.14),
      };
    },
    bursts: [whooshAt(0.08, 'foe', -80, -60), sparkAt(0.16, 'hero', 10, -50), ringAt(0.16, 'hero', 10, -50)],
    hitStops: [{ at: 0.16, ms: 100 }],
  },

  // ---- the charge: roll left, roll right, or get trampled ----
  foe_charge: {
    rig: (t) => ({
      foe: {
        lean: 0.2 * eio(seg(t, 0, 0.15)) + 0.4 * eio(seg(t, 0.15, 0.4)),
        x: 30 * bell(t, 0.12, 0.12) - 330 * ei(seg(t, 0.18, 0.8)),
        squash: 1 - 0.08 * bell(t, 0.5, 0.5),
        armF: FOE_REST.armF - 1.2 * eio(seg(t, 0.15, 0.4)),
        armB: FOE_REST.armB + 1.4 * eio(seg(t, 0.15, 0.4)),
      },
    }),
    bursts: [dustAt(0.3, 'foe', 20, 0), dustAt(0.55, 'foe', 20, 0)],
  },
  hero_roll_left: {
    rig: (t) => ({
      hero: { x: -180 * eo(seg(t, 0, 0.45)) * (1 - eio(seg(t, 0.62, 0.98))), rot: -TAU * eio(seg(t, 0, 0.55)), y: -34 * bell(t, 0.25, 0.28), squash: 1 - 0.12 * bell(t, 0.56, 0.06) },
      foe: { x: lerp(-330, -580, ei(seg(t, 0, 0.4))) + 580 * eio(seg(t, 0.55, 1)), lean: 0.6 * (1 - eo(seg(t, 0.45, 0.75))), armF: FOE_REST.armF - 1.2 * (1 - eo(seg(t, 0.5, 0.8))) },
    }),
    bursts: [dustAt(0.05, 'hero', 0, 0), whooshAt(0.35, 'foe', 0, -140), dustAt(0.45, 'foe', -40, 0)],
  },
  hero_roll_right: {
    rig: (t) => ({
      hero: { x: 100 * eo(seg(t, 0, 0.45)) - 100 * eio(seg(t, 0.7, 1)), rot: TAU * eio(seg(t, 0, 0.55)), y: -26 * bell(t, 0.25, 0.28), squash: 1 - 0.12 * bell(t, 0.56, 0.06) },
      foe: { x: lerp(-330, -580, ei(seg(t, 0, 0.4))) + 580 * eio(seg(t, 0.55, 1)), lean: 0.6 * (1 - eo(seg(t, 0.45, 0.75))), armF: FOE_REST.armF - 1.2 * (1 - eo(seg(t, 0.5, 0.8))) },
    }),
    bursts: [dustAt(0.05, 'hero', 0, 0), whooshAt(0.35, 'foe', 0, -140), dustAt(0.45, 'foe', -40, 0)],
  },
  hero_trampled: {
    rig: (t) => {
      const at = 0.1;
      const r = hitReaction(t, at, { dist: -190, lean: 0, pop: 40, hold: 0.4 });
      return {
        hero: { ...r, rot: -1.4 * eo(seg(t, at, at + 0.3)) * (1 - eio(seg(t, 0.62, 1))) },
        foe: { x: lerp(-330, -580, ei(seg(t, 0, 0.42))) + 580 * eio(seg(t, 0.55, 1)), lean: 0.6 * (1 - eo(seg(t, 0.45, 0.75))) },
        ...impactFx(t, at, 1.1),
        red: 0.9 * bell(t, at + 0.03, 0.14),
      };
    },
    bursts: [sparkAt(0.1, 'hero', 0, -120), ringAt(0.1, 'hero', 0, -120), dustAt(0.3, 'hero', -60, 0), dustAt(0.42, 'foe', -40, 0)],
    hitStops: [{ at: 0.1, ms: 120 }],
  },

  // ---- the grapple: hold to push, or get squeezed ----
  grapple: {
    rig: (t, c) => {
      const k = eio(seg(t, 0, 0.35));
      const push = c.progress ?? 0;
      const strain = Math.sin((c.time ?? 0) / 60) * 3 * k;
      return {
        foe: { x: FOE_GRAB.x * k + 50 * push + strain, armF: lerp(FOE_REST.armF, FOE_GRAB.armF, k), armB: lerp(FOE_REST.armB, FOE_GRAB.armB, k), lean: FOE_GRAB.lean * k - 0.3 * push },
        hero: { squash: 1 - 0.15 * k, lean: -0.15 * k + 0.45 * push, x: -20 * k + 15 * push + strain, armF: lerp(HERO_REST.armF, 1.5, k), armB: lerp(HERO_REST.armB, 1.5, k) },
      };
    },
  },
  shove: {
    rig: (t) => {
      const at = 0.2;
      return {
        foe: { x: -180 + 260 * eo(seg(t, at, at + 0.3)) - 80 * eio(seg(t, 0.7, 1)), lean: -0.6 * bell(t, at + 0.12, 0.3), armF: lerp(1.4, FOE_REST.armF, eio(seg(t, 0.35, 0.8))), armB: lerp(1.4, FOE_REST.armB, eio(seg(t, 0.35, 0.8))), y: -20 * bell(t, at + 0.08, 0.1) },
        hero: { lean: -0.2 * eio(seg(t, 0, at - 0.06)) + 0.7 * bell(t, at + 0.03, 0.14), x: -20 + 50 * ei(seg(t, at - 0.06, at)) - 30 * eio(seg(t, 0.5, 0.9)), armF: lerp(1.5, HERO_REST.armF, eio(seg(t, 0.4, 0.9))), armB: lerp(1.5, HERO_REST.armB, eio(seg(t, 0.4, 0.9))) },
        ...impactFx(t, at, 0.6),
      };
    },
    bursts: [whooshAt(0.2, 'foe', -60, -140), ringAt(0.2, 'foe', -60, -140)],
    hitStops: [{ at: 0.2, ms: 60 }],
  },
  squeezed: {
    rig: (t) => ({
      hero: { squash: 1 - 0.35 * (t < 0.3 ? ei(seg(t, 0.2, 0.3)) : 1 - eio(seg(t, 0.45, 0.8))), lean: -0.2, x: -20 - 10 * bell(t, 0.3, 0.1), armF: lerp(1.5, HERO_REST.armF, eio(seg(t, 0.6, 1))), armB: lerp(1.5, HERO_REST.armB, eio(seg(t, 0.6, 1))) },
      foe: { x: lerp(FOE_GRAB.x, 0, eio(seg(t, 0.55, 1))), armF: lerp(FOE_GRAB.armF, FOE_REST.armF, eio(seg(t, 0.55, 1))), armB: lerp(FOE_GRAB.armB, FOE_REST.armB, eio(seg(t, 0.55, 1))), lean: (0.3 + 0.3 * bell(t, 0.3, 0.12)) * (1 - eio(seg(t, 0.55, 1))) },
      ...impactFx(t, 0.3, 0.8),
      red: 0.9 * bell(t, 0.32, 0.14),
    }),
    bursts: [sparkAt(0.3, 'hero', 0, -120), ringAt(0.3, 'hero', 0, -120)],
    hitStops: [{ at: 0.3, ms: 100 }],
  },

  // ---- pinned: mash to break free, or take a thump ----
  pinned: {
    rig: (t, c) => {
      const k = eio(seg(t, 0, 0.4));
      const free = c.progress ?? 0;
      const strain = Math.sin((c.time ?? 0) / 70) * 2 * k * (0.3 + free);
      return {
        hero: { y: (55 - 25 * free) * k, rot: (-1.4 + 0.5 * free) * k, squash: 1 - 0.1 * k, x: strain },
        foe: { x: -230 * k + 30 * free + strain, lean: (0.7 - 0.3 * free) * k, armF: lerp(FOE_REST.armF, 1.1, k), armB: lerp(FOE_REST.armB, 1.0, k) },
      };
    },
  },
  free: {
    rig: (t) => ({
      hero: { y: lerp(30, 0, eo(seg(t, 0.05, 0.35))) - 24 * bell(t, 0.3, 0.14), rot: lerp(-0.9, 0, eo(seg(t, 0.05, 0.35))), lean: 0.4 * bell(t, 0.35, 0.25), squash: 1 - 0.12 * bell(t, 0.46, 0.06) },
      foe: { x: lerp(-200, -40, eo(seg(t, 0.08, 0.4))) + 40 * eio(seg(t, 0.7, 1)), lean: lerp(0.4, -0.5, eo(seg(t, 0.08, 0.3))) * (1 - eio(seg(t, 0.55, 1))), armF: lerp(1.1, FOE_REST.armF, eio(seg(t, 0.3, 0.8))), armB: lerp(1.1, FOE_REST.armB, eio(seg(t, 0.3, 0.8))), y: -16 * bell(t, 0.2, 0.12) },
      ...impactFx(t, 0.1, 0.5),
    }),
    bursts: [dustAt(0.1, 'hero', 0, 0), ringAt(0.1, 'hero', 0, -60)],
  },
  pinned_hit: {
    rig: (t) => {
      const at = 0.3;
      return {
        hero: { y: lerp(55, 0, eo(seg(t, 0.5, 1))) - 14 * bell(t, at + 0.04, 0.08), rot: lerp(-1.4, 0, eo(seg(t, 0.5, 1))), squash: 1 - 0.22 * bell(t, at + 0.03, 0.12) },
        foe: {
          x: lerp(-230, 0, eio(seg(t, 0.55, 1))),
          lean: 0.7 * (1 - eio(seg(t, 0.5, 1))) + 0.3 * ei(seg(t, at - 0.08, at)) - 0.3 * eo(seg(t, at, at + 0.3)),
          armF: t < 0.5 ? swing(t, { rest: 1.1, raised: -2.3, contact: 1.0, raise: [0.02, 0.2], at, snap: 0.08, settle: 0.14, recover: [0.5, 0.5] }) : lerp(1.0, FOE_REST.armF, eio(seg(t, 0.5, 1))),
          armB: lerp(1.0, FOE_REST.armB, eio(seg(t, 0.5, 1))),
        },
        ...impactFx(t, at, 0.9),
        red: 0.9 * bell(t, at + 0.02, 0.14),
      };
    },
    bursts: [whooshAt(0.24, 'foe', -60, -180), sparkAt(0.3, 'hero', 20, -60), ringAt(0.3, 'hero', 20, -60)],
    hitStops: [{ at: 0.3, ms: 100 }],
  },

  // ---- the combo: three strikes, or a wild miss ----
  combo_ready: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.4));
      return { hero: { x: 95 * k, armF: lerp(HERO_REST.armF, -2.2, k), armB: lerp(HERO_REST.armB, -1.2, k), lean: -0.1 * k, squash: 1 + 0.04 * k }, foe: { lean: -0.2 * k, x: 20 * k } };
    },
  },
  combo_hit: {
    rig: (t) => {
      const hits = [0.22, 0.52, 0.82];
      let armF = -2.2;
      let step = 0;
      let foeX = 0;
      let foeLean = 0;
      let fx = { flash: 0, shake: 0, punch: 0 };
      let squash = 1;
      let pop = 0;
      for (let i = 0; i < hits.length; i++) {
        const at = hits[i];
        const next = hits[i + 1];
        if (t >= at - 0.07 && t < at) armF = lerp(-2.2, 1.7, ei(seg(t, at - 0.07, at)));
        else if (t >= at && t < at + 0.1) armF = lerp(1.7, 1.35, eo(seg(t, at, at + 0.1)));
        else if (t >= at + 0.1 && next && t < next - 0.07) armF = lerp(1.35, -2.2, eio(seg(t, at + 0.1, next - 0.07)));
        else if (t >= at + 0.1 && !next) armF = lerp(1.35, HERO_REST.armF, eio(seg(t, at + 0.1, 1)));
        step += 28 * ei(seg(t, at - 0.07, at));
        foeX += 45 * eo(seg(t, at, at + 0.25));
        foeLean += 0.7 * bell(t, at + 0.08, 0.16);
        pop += 12 * bell(t, at + 0.05, 0.08);
        squash *= 1 - 0.1 * bell(t, at + 0.02, 0.06);
        const f = impactFx(t, at, 0.9);
        fx = { flash: Math.max(fx.flash, f.flash), shake: Math.max(fx.shake, f.shake), punch: Math.max(fx.punch, f.punch) };
      }
      const lean = t < 0.15 ? -0.15 * eio(seg(t, 0, 0.15)) : 0.45 * Math.max(bell(t, 0.25, 0.14), bell(t, 0.55, 0.14), bell(t, 0.85, 0.14)) - 0.1;
      return {
        hero: { x: 95 + step, armF, armB: -1.2, lean, squash },
        foe: { x: 20 + foeX, lean: -foeLean, y: -pop, squash: 1 - 0.1 * Math.max(bell(t, 0.3, 0.1), bell(t, 0.6, 0.1), bell(t, 0.9, 0.1)) },
        ...fx,
      };
    },
    bursts: [
      whooshAt(0.16, 'hero', 90, -150), sparkAt(0.22, 'foe', -60, -150), ringAt(0.22, 'foe', -60, -150),
      whooshAt(0.46, 'hero', 90, -120), sparkAt(0.52, 'foe', -60, -110), ringAt(0.52, 'foe', -60, -110),
      whooshAt(0.76, 'hero', 90, -170), sparkAt(0.82, 'foe', -60, -170), ringAt(0.82, 'foe', -60, -170),
    ],
    hitStops: [{ at: 0.22, ms: 80 }, { at: 0.52, ms: 80 }, { at: 0.82, ms: 110 }],
  },
  combo_fumble: {
    rig: (t) => {
      const at = 0.66;
      const r = hitReaction(t, at, { dist: -140, lean: -0.8 });
      return {
        hero: {
          x: 95 + 50 * ei(seg(t, 0.2, 0.3)) - 20 * eo(seg(t, 0.3, 0.5)) + r.x,
          armF: t < 0.45 ? lerp(-2.2, 2.6, ei(seg(t, 0.2, 0.3))) - 0.3 * eo(seg(t, 0.3, 0.45)) : lerp(2.3, HERO_REST.armF, eio(seg(t, 0.45, 0.9))),
          armB: -1.2 + 0.8 * eo(seg(t, 0.4, 0.9)),
          lean: -0.2 * eio(seg(t, 0, 0.2)) + 0.9 * ei(seg(t, 0.2, 0.3)) - 0.5 * eo(seg(t, 0.3, 0.55)) + r.lean,
          squash: r.squash,
          y: r.y,
        },
        foe: { x: 20 - 30 * ei(seg(t, at - 0.08, at)), armF: swing(t, { rest: FOE_REST.armF, raised: -2.4, contact: 1.0, raise: [0.35, 0.56], at, snap: 0.08, settle: 0.14, recover: [0.82, 1] }), lean: 0.4 * ei(seg(t, at - 0.08, at)) - 0.4 * eo(seg(t, at, at + 0.3)) },
        ...impactFx(t, at, 1),
        red: 0.9 * bell(t, at + 0.02, 0.14),
      };
    },
    bursts: [whooshAt(0.3, 'hero', 110, -130), whooshAt(0.6, 'foe', -70, -190), sparkAt(0.66, 'hero', 20, -180), ringAt(0.66, 'hero', 20, -180)],
    hitStops: [{ at: 0.66, ms: 100 }],
  },

  // ---- the finisher ----
  finisher_ready: {
    rig: (t, c) => {
      const k = eio(seg(t, 0, 0.4));
      const wobble = Math.sin((c.time ?? 0) / 90) * 0.12;
      return {
        hero: { x: 120, armF: lerp(HERO_REST.armF, -2.7, k), armB: lerp(HERO_REST.armB, -1.4, k), lean: -0.2 * k, squash: 1 + 0.05 * k },
        foe: { lean: 0.3 + wobble, x: -40, armF: FOE_REST.armF + wobble, y: -3 * Math.abs(Math.sin((c.time ?? 0) / 120)) },
        tint: 'gold',
      };
    },
  },
  finisher_miss: {
    rig: (t, c) => ({
      hero: { x: 120 + 60 * ei(seg(t, 0.2, 0.3)) - 30 * eo(seg(t, 0.3, 0.6)), armF: t < 0.45 ? lerp(-2.7, 2.2, ei(seg(t, 0.2, 0.3))) - 0.4 * eo(seg(t, 0.3, 0.45)) : lerp(1.8, -2.7, eio(seg(t, 0.5, 1))), lean: 0.8 * ei(seg(t, 0.2, 0.3)) - 0.8 * eo(seg(t, 0.3, 0.7)) },
      foe: { lean: 0.3 + Math.sin((c.time ?? 0) / 90) * 0.12, x: -40 },
    }),
    bursts: [whooshAt(0.3, 'hero', 120, -120)],
  },
  victory: {
    rig: (t) => {
      const at = 0.16;
      const body = attackerBody(t, at, { step: 80, recover: 0.5 });
      const fall = ei(seg(t, at + 0.04, 0.62));
      return {
        hero: {
          armF: t < 0.8 ? swing(t, { rest: HERO_REST.armF, raised: -2.7, contact: 1.4, raise: [0, 0], at, snap: 0.08, settle: 0.16, recover: [0.5, 0.78] }) : lerp(HERO_REST.armF, -3.0, eo(seg(t, 0.8, 0.94))),
          armB: t < 0.8 ? -1.4 : lerp(-1.4, -3.0, eo(seg(t, 0.8, 0.94))),
          x: 120 + body.x,
          lean: body.lean,
          squash: body.squash,
          y: -26 * bell(t, 0.9, 0.14),
        },
        foe: { rot: -1.55 * fall, y: 62 * fall, x: -40 + 60 * eo(seg(t, at, at + 0.4)), lean: 0.3 * (1 - seg(t, at, at + 0.2)), squash: 1 + 0.15 * bell(t, at, 0.03) },
        ...impactFx(t, at, 1.3),
        shake: 1.2 * bell(t, at + 0.03, 0.2) + 0.9 * bell(t, 0.62, 0.2),
        tint: t < 0.2 ? 'gold' : null,
      };
    },
    bursts: [whooshAt(0.1, 'hero', 100, -160), sparkAt(0.16, 'foe', -70, -150), ringAt(0.16, 'foe', -70, -150), dustAt(0.6, 'foe', 40, 0), dustAt(0.62, 'foe', 90, 0)],
    hitStops: [{ at: 0.16, ms: 180 }],
  },
  knockdown: {
    rig: (t) => {
      const at = 0.2;
      const fall = ei(seg(t, at + 0.04, 0.62));
      return {
        foe: {
          x: FOE_WOUND.x - 40 * ei(seg(t, at - 0.1, at)) + (FOE_WOUND.x + 40) * -1 * eio(seg(t, 0.5, 0.9)),
          armF: t < 0.6 ? swing(t, { rest: FOE_REST.armF, raised: FOE_WOUND.armF, contact: 1.2, raise: [0, 0], at, snap: 0.1, settle: 0.2, recover: [0.6, 0.6] }) : lerp(1.2, -3.0, eo(seg(t, 0.6, 0.9))),
          armB: lerp(FOE_REST.armB, 3.0, eo(seg(t, 0.6, 0.9))),
          lean: FOE_WOUND.lean * (1 - seg(t, 0.4, 0.7)),
          y: -20 * bell(t, 0.95, 0.08),
        },
        hero: { x: -100 * eo(seg(t, at, at + 0.4)), rot: -1.4 * fall, y: 62 * fall - 30 * bell(t, at + 0.06, 0.1), squash: 1 + 0.15 * bell(t, at, 0.03) },
        ...impactFx(t, at, 1.2),
        red: 0.9 * bell(t, at + 0.02, 0.14),
        shake: 1.1 * bell(t, at + 0.03, 0.2) + 0.7 * bell(t, 0.62, 0.15),
      };
    },
    bursts: [whooshAt(0.12, 'foe', -80, -200), sparkAt(0.2, 'hero', 10, -170), ringAt(0.2, 'hero', 10, -170), dustAt(0.6, 'hero', -60, 0)],
    hitStops: [{ at: 0.2, ms: 160 }],
  },

  // ======== Act 1 additions: the jab and the rock ========
  foe_thrust_windup: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.5));
      return { foe: { x: FOE_THRUST.x * k, armF: lerp(FOE_REST.armF, FOE_THRUST.armF, k), armB: lerp(FOE_REST.armB, FOE_THRUST.armB, k), lean: FOE_THRUST.lean * k, squash: 1 + 0.04 * k } };
    },
  },
  hero_parry: {
    rig: (t) => {
      const at = 0.14;
      const thrust = ei(seg(t, at - 0.1, at));
      const knocked = eo(seg(t, at, at + 0.22));
      const back = eio(seg(t, 0.55, 0.95));
      return {
        foe: {
          x: lerp(FOE_THRUST.x - 80 * thrust + 70 * knocked, 0, back),
          armF: lerp(t < at ? lerp(FOE_THRUST.armF, 1.7, thrust) : lerp(1.7, -2.3, knocked), FOE_REST.armF, back),
          armB: lerp(FOE_THRUST.armB, FOE_REST.armB, back),
          lean: lerp(FOE_THRUST.lean + 0.7 * thrust - 1.0 * knocked, 0, back),
          y: -12 * bell(t, at + 0.08, 0.12),
        },
        hero: {
          armF: swing(t, { rest: HERO_REST.armF, raised: 1.5, contact: -1.9, raise: [0, at - 0.09], at, snap: 0.07, settle: 0.16, recover: [0.5, 0.9], overshoot: -0.35 }),
          lean: -0.15 * eio(seg(t, 0, at - 0.08)) + 0.4 * bell(t, at + 0.03, 0.16),
          x: 24 * bell(t, at + 0.05, 0.2),
          squash: 1 - 0.08 * bell(t, at + 0.02, 0.06),
        },
        ...impactFx(t, at, 0.8),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -90, -150), sparkAt(0.14, 'hero', 125, -150), ringAt(0.14, 'hero', 125, -150)],
    hitStops: [{ at: 0.14, ms: 80 }],
  },
  hero_thrust_hit: {
    rig: (t) => {
      const at = 0.14;
      const thrust = ei(seg(t, at - 0.1, at));
      const back = eio(seg(t, 0.55, 0.95));
      return {
        foe: { x: lerp(FOE_THRUST.x - 90 * thrust, 0, back), armF: lerp(t < at ? lerp(FOE_THRUST.armF, 1.7, thrust) : lerp(1.7, 1.2, eo(seg(t, at, at + 0.2))), FOE_REST.armF, back), armB: lerp(FOE_THRUST.armB, FOE_REST.armB, back), lean: lerp(FOE_THRUST.lean + 0.7 * thrust, 0, back) },
        hero: { ...hitReaction(t, at, { dist: -150, lean: -0.9, pop: 12 }) },
        ...impactFx(t, at, 1),
        red: 0.9 * bell(t, at + 0.03, 0.14),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -90, -150), sparkAt(0.14, 'hero', 20, -140), ringAt(0.14, 'hero', 20, -140)],
    hitStops: [{ at: 0.14, ms: 110 }],
  },
  foe_throw_windup: {
    rig: (t) => {
      const bend = eio(seg(t, 0, 0.3)) * (1 - eio(seg(t, 0.3, 0.6)));
      const lift = eio(seg(t, 0.3, 0.6));
      const rock = t < 0.22 ? null : t < 0.6 ? { kind: 'rock', x: lerp(670 - 100, FOE_HAND_UP.x + FOE_THROW.x, lift), y: lerp(426, FOE_HAND_UP.y, lift) - 40 * Math.sin(Math.PI * lift), rot: lift * 2, size: 26 } : { kind: 'rock', x: FOE_HAND_UP.x + FOE_THROW.x, y: FOE_HAND_UP.y + Math.sin(t * 40) * 2, rot: 1.2, size: 26 };
      return {
        foe: { x: FOE_THROW.x * eio(seg(t, 0, 0.4)), lean: 0.75 * bend + FOE_THROW.lean * lift, squash: 1 - 0.2 * bend + 0.04 * lift, armF: lerp(FOE_REST.armF, 1.3, bend) + (FOE_THROW.armF - FOE_REST.armF) * lift, armB: lerp(FOE_REST.armB, FOE_THROW.armB, lift) },
        props: rock ? [rock] : [],
      };
    },
  },
  hero_rock_duck: {
    rig: (t) => {
      const throwK = ei(seg(t, 0.02, 0.1));
      const from = { x: FOE_HAND_UP.x + FOE_THROW.x, y: FOE_HAND_UP.y };
      const rock = t < 0.42 ? rockFlight(t, from, { x: 330 - 240, y: 426 }, 0.06, 0.42, 60) : { kind: 'rock', x: 330 - 240, y: 426, rot: 3.8, size: 26, alpha: 1 - seg(t, 0.75, 1) };
      return {
        foe: { x: lerp(FOE_THROW.x - 60 * throwK, 0, eio(seg(t, 0.55, 0.95))), armF: lerp(t < 0.12 ? lerp(FOE_THROW.armF, 1.5, throwK) : 1.5, FOE_REST.armF, eio(seg(t, 0.4, 0.9))), armB: lerp(FOE_THROW.armB, FOE_REST.armB, eio(seg(t, 0.4, 0.9))), lean: lerp(FOE_THROW.lean + 0.8 * throwK, 0, eio(seg(t, 0.4, 0.9))) },
        hero: { squash: 1 - 0.5 * (t < 0.14 ? ei(seg(t, 0.06, 0.14)) : t < 0.45 ? 1 : 1 - eio(seg(t, 0.45, 0.72))), lean: 0.3 * bell(t, 0.3, 0.3) },
        props: [rock],
        shake: 0.5 * bell(t, 0.44, 0.1),
      };
    },
    bursts: [whooshAt(0.1, 'foe', -80, -240), dustAt(0.42, 'hero', -240, 0), dustAt(0.44, 'hero', -200, 0)],
  },
  hero_rock_jump: {
    rig: (t) => {
      const throwK = ei(seg(t, 0.02, 0.1));
      const from = { x: FOE_HAND_UP.x + FOE_THROW.x, y: FOE_HAND_UP.y };
      const rock = t < 0.42 ? rockFlight(t, from, { x: 330 - 240, y: 426 }, 0.06, 0.42, -20) : { kind: 'rock', x: 330 - 240, y: 426, rot: 3.8, size: 26, alpha: 1 - seg(t, 0.75, 1) };
      const air = Math.sin(Math.PI * seg(t, 0.1, 0.62));
      return {
        foe: { x: lerp(FOE_THROW.x - 60 * throwK, 0, eio(seg(t, 0.55, 0.95))), armF: lerp(t < 0.12 ? lerp(FOE_THROW.armF, 1.5, throwK) : 1.5, FOE_REST.armF, eio(seg(t, 0.4, 0.9))), armB: lerp(FOE_THROW.armB, FOE_REST.armB, eio(seg(t, 0.4, 0.9))), lean: lerp(FOE_THROW.lean + 0.8 * throwK, 0, eio(seg(t, 0.4, 0.9))) },
        hero: { y: -150 * air, squash: (1 - 0.2 * bell(t, 0.07, 0.06)) * (1 + 0.12 * bell(t, 0.2, 0.1)), lean: 0.2 * air },
        props: [rock],
        shake: 0.5 * bell(t, 0.44, 0.1),
      };
    },
    bursts: [whooshAt(0.1, 'foe', -80, -240), dustAt(0.1, 'hero', 0, 0), dustAt(0.42, 'hero', -240, 0)],
  },
  hero_rock_hit: {
    rig: (t) => {
      const at = 0.2;
      const throwK = ei(seg(t, 0.02, 0.1));
      const from = { x: FOE_HAND_UP.x + FOE_THROW.x, y: FOE_HAND_UP.y };
      const r = hitReaction(t, at, { dist: -130, lean: -0.9 });
      const rock = t < at ? rockFlight(t, from, { x: 330 + 20, y: 270 }, 0.06, at, 40) : { kind: 'rock', x: 330 + 20 - 60 * eo(seg(t, at, 0.4)) + r.x, y: lerp(270, 426, ei(seg(t, at, 0.42))), rot: 2 + seg(t, at, 0.42) * 4, size: 26, alpha: 1 - seg(t, 0.8, 1) };
      return {
        foe: { x: lerp(FOE_THROW.x - 60 * throwK, 0, eio(seg(t, 0.55, 0.95))), armF: lerp(t < 0.12 ? lerp(FOE_THROW.armF, 1.5, throwK) : 1.5, FOE_REST.armF, eio(seg(t, 0.4, 0.9))), armB: lerp(FOE_THROW.armB, FOE_REST.armB, eio(seg(t, 0.4, 0.9))), lean: lerp(FOE_THROW.lean + 0.8 * throwK, 0, eio(seg(t, 0.4, 0.9))) },
        hero: { ...r },
        props: [rock],
        ...impactFx(t, at, 1),
        red: 0.9 * bell(t, at + 0.03, 0.14),
      };
    },
    bursts: [whooshAt(0.1, 'foe', -80, -240), sparkAt(0.2, 'hero', 20, -170), ringAt(0.2, 'hero', 20, -170), dustAt(0.42, 'hero', -40, 0)],
    hitStops: [{ at: 0.2, ms: 100 }],
  },

  // ======== Act 3: the robot powers up ========
  foe_powerup: {
    rig: (t) => {
      const crouch = eio(seg(t, 0, 0.25)) * (1 - eio(seg(t, 0.25, 0.42)));
      const burst = eio(seg(t, 0.25, 0.45));
      const settle = eio(seg(t, 0.7, 1));
      return {
        foe: {
          squash: 1 - 0.14 * crouch + 0.18 * burst * (1 - settle),
          armF: lerp(FOE_REST.armF, -2.8, burst) + (FOE_REST.armF + 2.8) * settle,
          armB: lerp(FOE_REST.armB, 2.8, burst) - (2.8 - FOE_REST.armB) * settle,
          lean: -0.25 * burst * (1 - settle) + 0.3 * crouch,
          y: -34 * bell(t, 0.5, 0.16),
          glow: burst,
        },
        hero: { lean: -0.2 * eio(seg(t, 0.3, 0.5)) * (1 - eio(seg(t, 0.7, 1))), x: -20 * eio(seg(t, 0.3, 0.5)) },
        flash: 0.5 * bell(t, 0.44, 0.04),
        shake: 0.5 * bell(t, 0.46, 0.18) + 0.4 * bell(t, 0.66, 0.1),
        punch: 0.6 * bell(t, 0.45, 0.1),
      };
    },
    bursts: [sparkAt(0.44, 'foe', 0, -140), ringAt(0.44, 'foe', 0, -140), sparkAt(0.5, 'foe', 0, -200), dustAt(0.66, 'foe', 0, 0), dustAt(0.67, 'foe', 60, 0)],
  },
  foe_smash_windup: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.5));
      const hop = -18 * Math.sin(Math.PI * seg(t, 0.05, 0.4));
      return { foe: { ...CHARGED, x: FOE_SMASH.x * k, y: hop, armF: lerp(FOE_REST.armF, FOE_SMASH.armF, k), armB: lerp(FOE_REST.armB, FOE_SMASH.armB, k), lean: FOE_SMASH.lean * k, squash: 1 + 0.06 * k } };
    },
  },
  hero_block: {
    rig: (t) => {
      const at = 0.14;
      const back = eio(seg(t, 0.6, 0.95));
      return {
        foe: {
          ...CHARGED,
          x: lerp(FOE_SMASH.x - 30 * ei(seg(t, at - 0.1, at)), 0, back),
          armF: lerp(swing(t, { rest: FOE_REST.armF, raised: FOE_SMASH.armF, contact: 0.35, raise: [0, 0], at, snap: 0.1, settle: 0.2, recover: [0.6, 0.95], overshoot: 0.3 }), FOE_REST.armF, back),
          armB: lerp(t < at ? lerp(FOE_SMASH.armB, 0.6, ei(seg(t, at - 0.1, at))) : 0.6, FOE_REST.armB, back),
          lean: lerp(FOE_SMASH.lean + 0.9 * ei(seg(t, at - 0.1, at)) - 0.9 * eo(seg(t, at, at + 0.3)), 0, back),
        },
        hero: {
          armB: t < 0.5 ? lerp(HERO_REST.armB, -3.1, eo(seg(t, 0, 0.1))) : lerp(-3.1, HERO_REST.armB, eio(seg(t, 0.5, 0.85))),
          armF: lerp(HERO_REST.armF, 1.2, eo(seg(t, 0, 0.1))) * (1 - eio(seg(t, 0.5, 0.85))) + HERO_REST.armF * eio(seg(t, 0.5, 0.85)),
          squash: 1 - 0.2 * bell(t, at + 0.03, 0.1),
          lean: 0.1 + 0.15 * bell(t, at + 0.05, 0.15),
          x: -10 * bell(t, at + 0.05, 0.3),
        },
        ...impactFx(t, at, 1),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -60, -260), sparkAt(0.14, 'hero', 0, -240), ringAt(0.14, 'hero', 0, -240)],
    hitStops: [{ at: 0.14, ms: 100 }],
  },
  hero_smashed: {
    rig: (t) => {
      const at = 0.14;
      const back = eio(seg(t, 0.6, 0.95));
      const flat = t < at ? 0 : t < 0.45 ? 1 : 1 - eio(seg(t, 0.45, 0.8));
      return {
        foe: {
          ...CHARGED,
          x: lerp(FOE_SMASH.x - 40 * ei(seg(t, at - 0.1, at)), 0, back),
          armF: lerp(t < at ? lerp(FOE_SMASH.armF, 0.9, ei(seg(t, at - 0.1, at))) : t < 0.5 ? 0.9 : lerp(0.9, FOE_REST.armF, eio(seg(t, 0.5, 0.9))), FOE_REST.armF, back),
          armB: lerp(t < at ? lerp(FOE_SMASH.armB, 0.6, ei(seg(t, at - 0.1, at))) : 0.6, FOE_REST.armB, back),
          lean: lerp(FOE_SMASH.lean + 1.0 * ei(seg(t, at - 0.1, at)) - 0.5 * eo(seg(t, 0.45, 0.7)), 0, back),
        },
        hero: { squash: 1 - 0.5 * flat + 0.16 * bell(t, at, 0.03), x: -20 * flat, lean: 0.2 * flat, armB: lerp(HERO_REST.armB, 1.2, flat), armF: lerp(HERO_REST.armF, 1.6, flat) },
        ...impactFx(t, at, 1.1),
        red: 0.9 * bell(t, at + 0.03, 0.14),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -60, -260), sparkAt(0.14, 'hero', 0, -190), ringAt(0.14, 'hero', 0, -190), dustAt(0.16, 'hero', -30, 0), dustAt(0.16, 'hero', 40, 0)],
    hitStops: [{ at: 0.14, ms: 120 }],
  },
  foe_pound_windup: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.55));
      return { foe: { ...CHARGED, x: FOE_POUND.x * k, armF: lerp(FOE_REST.armF, FOE_POUND.armF, k), armB: lerp(FOE_REST.armB, FOE_POUND.armB, k), lean: FOE_POUND.lean * k, squash: lerp(1, FOE_POUND.squash, k), y: -10 * Math.sin(Math.PI * seg(t, 0.5, 1)) } };
    },
  },
  hero_brace: {
    rig: (t) => {
      const at = 0.12;
      const slam = ei(seg(t, at - 0.08, at));
      const wave = seg(t, at, 0.42);
      const back = eio(seg(t, 0.6, 0.95));
      return {
        foe: { ...CHARGED, x: lerp(FOE_POUND.x, 0, back), armF: lerp(lerp(FOE_POUND.armF, 1.3, slam), FOE_REST.armF, back), armB: lerp(lerp(FOE_POUND.armB, 1.3, slam), FOE_REST.armB, back), lean: lerp(FOE_POUND.lean + 0.9 * slam, 0, back), squash: lerp(FOE_POUND.squash - 0.12 * slam, 1, back) },
        hero: { armB: lerp(HERO_REST.armB, 0.9, eo(seg(t, 0, 0.1))) * (1 - eio(seg(t, 0.6, 0.9))) + HERO_REST.armB * eio(seg(t, 0.6, 0.9)), lean: 0.5 * eo(seg(t, 0, 0.12)) * (1 - eio(seg(t, 0.6, 0.9))), squash: 1 - 0.1 * bell(t, 0.4, 0.15), x: -40 * eo(seg(t, 0.36, 0.5)) * (1 - eio(seg(t, 0.7, 1))) },
        props: t >= at && t < 0.5 ? [{ kind: 'shock', x: lerp(670 - 130 + FOE_POUND.x, 330 + 60, wave), w: 70 + 40 * wave, alpha: 1 - seg(t, 0.4, 0.5) }] : [],
        ...impactFx(t, at, 0.9),
        shake: 0.9 * bell(t, at + 0.03, 0.2) + 0.4 * bell(t, 0.4, 0.1),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -60, -240), dustAt(0.12, 'foe', -130, 0), ringAt(0.12, 'foe', -130, -20), dustAt(0.25, 'foe', -240, 0), dustAt(0.38, 'hero', 40, 0)],
    hitStops: [{ at: 0.12, ms: 80 }],
  },
  hero_blown: {
    rig: (t) => {
      const at = 0.12;
      const hit = 0.4;
      const slam = ei(seg(t, at - 0.08, at));
      const wave = seg(t, at, hit);
      const back = eio(seg(t, 0.6, 0.95));
      const r = hitReaction(t, hit, { dist: -180, lean: 0, pop: 30, hold: 0.35 });
      return {
        foe: { ...CHARGED, x: lerp(FOE_POUND.x, 0, back), armF: lerp(lerp(FOE_POUND.armF, 1.3, slam), FOE_REST.armF, back), armB: lerp(lerp(FOE_POUND.armB, 1.3, slam), FOE_REST.armB, back), lean: lerp(FOE_POUND.lean + 0.9 * slam, 0, back), squash: lerp(FOE_POUND.squash - 0.12 * slam, 1, back) },
        hero: { ...r, rot: -1.6 * eo(seg(t, hit, hit + 0.3)) * (1 - eio(seg(t, 0.75, 1))), lean: -0.2 * eo(seg(t, 0.2, hit)) },
        props: t >= at && t < 0.5 ? [{ kind: 'shock', x: lerp(670 - 130 + FOE_POUND.x, 330 + 60, wave), w: 70 + 40 * wave, alpha: 1 - seg(t, 0.4, 0.5) }] : [],
        ...impactFx(t, hit, 1),
        shake: 0.9 * bell(t, at + 0.03, 0.2) + bell(t, hit + 0.03, 0.2),
        red: 0.9 * bell(t, hit + 0.03, 0.14),
      };
    },
    bursts: [whooshAt(0.06, 'foe', -60, -240), dustAt(0.12, 'foe', -130, 0), ringAt(0.12, 'foe', -130, -20), dustAt(0.25, 'foe', -240, 0), sparkAt(0.4, 'hero', 0, -120), ringAt(0.4, 'hero', 0, -120), dustAt(0.6, 'hero', -100, 0)],
    hitStops: [{ at: 0.12, ms: 60 }, { at: 0.4, ms: 100 }],
  },
  foe_double_windup: {
    rig: (t) => {
      const k = eio(seg(t, 0, 0.45));
      return { foe: { ...CHARGED, x: FOE_DOUBLE.x * k, armF: lerp(FOE_REST.armF, FOE_DOUBLE.armF, k), armB: lerp(FOE_REST.armB, -0.8, k), lean: FOE_DOUBLE.lean * k, squash: 1 + 0.04 * k } };
    },
  },
  hero_weave: {
    rig: (t) => {
      const a1 = 0.14;
      const a2 = 0.54;
      const back = eio(seg(t, 0.72, 0.98));
      const armF = t < a1 + 0.12 ? swing(t, { rest: 0, raised: FOE_DOUBLE.armF, contact: 1.2, raise: [0, 0], at: a1, snap: 0.08, settle: 0.12, recover: [1, 1], overshoot: 0.35 }) : t < a2 - 0.08 ? lerp(1.2, -2.4, eio(seg(t, a1 + 0.12, a2 - 0.08))) : swing(t, { rest: FOE_REST.armF, raised: -2.4, contact: 1.2, raise: [0, 0], at: a2, snap: 0.08, settle: 0.14, recover: [0.72, 0.98], overshoot: 0.35 });
      return {
        foe: { ...CHARGED, x: lerp(FOE_DOUBLE.x - 40 * eo(seg(t, a2 - 0.1, a2)), 0, back), armF, lean: lerp(FOE_DOUBLE.lean + 0.3 * bell(t, a1 + 0.05, 0.15) + 0.4 * bell(t, a2 + 0.05, 0.15), 0, back), armB: lerp(-0.8, FOE_REST.armB, back) },
        hero: {
          lean: -0.7 * bell(t, a1 + 0.02, 0.18) + 0.3 * bell(t, a2 + 0.02, 0.2),
          x: -60 * bell(t, a1 + 0.04, 0.24),
          squash: 1 - 0.5 * (t < a2 - 0.06 ? 0 : t < a2 + 0.14 ? ei(seg(t, a2 - 0.06, a2)) : 1 - eio(seg(t, a2 + 0.14, a2 + 0.4))),
        },
      };
    },
    bursts: [whooshAt(0.09, 'hero', 30, -170), whooshAt(0.49, 'hero', 30, -200)],
  },
  hero_double_hit: {
    rig: (t) => {
      const a1 = 0.14;
      const a2 = 0.5;
      const back = eio(seg(t, 0.72, 0.98));
      const armF = t < a1 + 0.12 ? swing(t, { rest: 0, raised: FOE_DOUBLE.armF, contact: 1.2, raise: [0, 0], at: a1, snap: 0.08, settle: 0.12, recover: [1, 1], overshoot: 0.35 }) : t < a2 - 0.08 ? lerp(1.2, -2.4, eio(seg(t, a1 + 0.12, a2 - 0.08))) : swing(t, { rest: FOE_REST.armF, raised: -2.4, contact: 1.2, raise: [0, 0], at: a2, snap: 0.08, settle: 0.14, recover: [0.72, 0.98], overshoot: 0.35 });
      const r1 = hitReaction(t, a1, { dist: -70, lean: -0.7, pop: 10 });
      const r2 = hitReaction(t, a2, { dist: -130, lean: -1.0, pop: 20 });
      return {
        foe: { ...CHARGED, x: lerp(FOE_DOUBLE.x - 70 * eo(seg(t, a1 + 0.1, a2 - 0.05)), 0, back), armF, lean: lerp(FOE_DOUBLE.lean + 0.3 * bell(t, a1 + 0.05, 0.15) + 0.4 * bell(t, a2 + 0.05, 0.15), 0, back), armB: lerp(-0.8, FOE_REST.armB, back) },
        hero: { x: r1.x + r2.x, lean: r1.lean + r2.lean, squash: r1.squash * r2.squash, y: r1.y + r2.y },
        flash: Math.max(impactFx(t, a1, 0.9).flash, impactFx(t, a2, 1).flash),
        shake: Math.max(impactFx(t, a1, 0.9).shake, impactFx(t, a2, 1).shake),
        punch: Math.max(impactFx(t, a1, 0.9).punch, impactFx(t, a2, 1).punch),
        red: 0.9 * Math.max(bell(t, a1 + 0.03, 0.12), bell(t, a2 + 0.03, 0.14)),
      };
    },
    bursts: [whooshAt(0.08, 'foe', -80, -200), sparkAt(0.14, 'hero', 10, -170), ringAt(0.14, 'hero', 10, -170), whooshAt(0.44, 'foe', -80, -200), sparkAt(0.5, 'hero', 10, -170), ringAt(0.5, 'hero', 10, -170)],
    hitStops: [{ at: 0.14, ms: 80 }, { at: 0.5, ms: 110 }],
  },
  foe_dizzy: {
    rig: (t, c) => {
      const time = c.time ?? 0;
      const wob = Math.sin(time / 110);
      return {
        foe: { glow: 0.6 + 0.4 * Math.sin(time / 90), lean: 0.35 * wob, x: 20 * Math.sin(time / 160), armF: FOE_REST.armF + 0.3 * wob, armB: FOE_REST.armB - 0.3 * wob, squash: 1 - 0.03 * Math.abs(wob) },
        hero: { y: -12 * Math.abs(Math.sin(time / 150)), lean: 0.1 },
        props: [{ kind: 'stars', x: 670 + 20 * Math.sin(time / 160), y: 440 - 250, phase: time / 400 }],
      };
    },
  },
  foe_dizzy_prompt: {
    rig: (t, c) => {
      const time = c.time ?? 0;
      const wob = Math.sin(time / 110);
      const run = eo(seg(t, 0, 0.3));
      const climb = c.progress ?? 0;
      return {
        foe: { glow: 0.6 + 0.4 * Math.sin(time / 90), lean: 0.3 * wob + 0.2 * climb, x: 15 * Math.sin(time / 160), armF: FOE_REST.armF + 0.3 * wob, armB: FOE_REST.armB - 0.3 * wob, squash: 1 - 0.06 * climb },
        hero: { x: 210 * run + 40 * climb, y: -190 * ei(climb), lean: 0.25 * run * (1 - climb), armF: lerp(HERO_REST.armF, -1.2, climb), armB: lerp(HERO_REST.armB, -2.6, climb) },
        props: [{ kind: 'stars', x: 670 + 15 * Math.sin(time / 160), y: 440 - 250, phase: time / 400 }],
      };
    },
    bursts: [dustAt(0.05, 'hero', 0, 0)],
  },
  hero_climb_pound: {
    rig: (t, c) => {
      const time = c.time ?? 0;
      const bonks = [0.16, 0.4, 0.64];
      let armF = -1.4;
      let squash = 1;
      let fx = { flash: 0, shake: 0, punch: 0 };
      for (let i = 0; i < bonks.length; i++) {
        const at = bonks[i];
        const next = bonks[i + 1];
        if (t >= at - 0.06 && t < at) armF = lerp(-1.4, 0.8, ei(seg(t, at - 0.06, at)));
        else if (t >= at && t < at + 0.08) armF = lerp(0.8, 0.5, eo(seg(t, at, at + 0.08)));
        else if (t >= at + 0.08 && next && t < next - 0.06) armF = lerp(0.5, -1.4, eio(seg(t, at + 0.08, next - 0.06)));
        else if (t >= at + 0.08 && !next) armF = lerp(0.5, -1.4, eio(seg(t, at + 0.08, 0.78)));
        squash *= 1 - 0.1 * bell(t, at + 0.03, 0.08);
        const f = impactFx(t, at, 0.7);
        fx = { flash: Math.max(fx.flash, f.flash), shake: Math.max(fx.shake, f.shake), punch: Math.max(fx.punch, f.punch) };
      }
      const off = eio(seg(t, 0.78, 1));
      return {
        hero: { x: lerp(250, 0, off), y: t < 0.78 ? -190 : -190 * (1 - off) - 120 * Math.sin(Math.PI * off), armF: t < 0.78 ? armF : lerp(-1.4, HERO_REST.armF, off), armB: lerp(-2.6, HERO_REST.armB, off), lean: 0.3 * (1 - off), rot: 0.6 * Math.sin(Math.PI * off) },
        foe: { glow: 0.6 + 0.4 * Math.sin(time / 90), lean: 0.2 + 0.25 * Math.sin(time / 110), squash: squash * (1 - 0.06), x: 15 * Math.sin(time / 160), armF: FOE_REST.armF + 0.4 * Math.sin(time / 100), armB: FOE_REST.armB - 0.4 * Math.sin(time / 100) },
        props: [{ kind: 'stars', x: 670 + 15 * Math.sin(time / 160), y: 440 - 250, phase: time / 400 }],
        ...fx,
      };
    },
    bursts: [sparkAt(0.16, 'foe', 0, -240), sparkAt(0.4, 'foe', 0, -240), sparkAt(0.64, 'foe', 0, -240), ringAt(0.64, 'foe', 0, -240), dustAt(0.99, 'hero', 0, 0)],
    hitStops: [{ at: 0.16, ms: 60 }, { at: 0.4, ms: 60 }, { at: 0.64, ms: 90 }],
  },
  hero_shaken_off: {
    rig: (t, c) => {
      const time = c.time ?? 0;
      const up = 1;
      const fling = seg(t, 0.28, 0.62);
      const shake = t > 0.2 && t < 0.3 ? Math.sin(time / 25) * 25 : 0;
      return {
        hero: { x: t < 0.28 ? 200 * up : lerp(200, -120, eo(fling)), y: t < 0.28 ? -130 * up : -130 * (1 - fling) - 110 * Math.sin(Math.PI * fling), rot: -TAU * 0.8 * fling * (1 - eio(seg(t, 0.72, 1))), armB: lerp(HERO_REST.armB, -2.6, up) * (1 - fling) + HERO_REST.armB * fling, lean: 0.2 * up },
        foe: { glow: 0.6 + 0.4 * Math.sin(time / 90), lean: 0.25 * Math.sin(time / 110) + 0.3 * bell(t, 0.26, 0.08), x: shake, squash: 1 - 0.05 * bell(t, 0.26, 0.1), armF: FOE_REST.armF - 1.2 * bell(t, 0.27, 0.12), armB: FOE_REST.armB + 1.2 * bell(t, 0.27, 0.12) },
        shake: 0.5 * bell(t, 0.26, 0.1) + 0.8 * bell(t, 0.64, 0.15),
        flash: 0.5 * bell(t, 0.62, 0.03),
        punch: 0.8 * bell(t, 0.63, 0.1),
        red: 0.8 * bell(t, 0.65, 0.14),
      };
    },
    bursts: [dustAt(0.03, 'hero', 0, 0), whooshAt(0.3, 'hero', 200, -140), dustAt(0.62, 'hero', -120, 0), dustAt(0.63, 'hero', -60, 0), ringAt(0.62, 'hero', -120, -40)],
    hitStops: [{ at: 0.62, ms: 90 }],
  },
  victory_bash: {
    rig: (t) => {
      const at = 0.16;
      const charge = ei(seg(t, 0.04, at));
      const fly = seg(t, at, 0.62);
      return {
        hero: {
          x: 120 + 90 * charge - 60 * eo(seg(t, at + 0.1, 0.5)),
          armB: t < 0.6 ? lerp(-1.4, 1.5, eo(seg(t, 0.04, at))) : lerp(1.5, -3.0, eo(seg(t, 0.6, 0.94))),
          armF: t < 0.6 ? lerp(-2.7, -1.0, eo(seg(t, 0.04, at))) : lerp(-1.0, -3.0, eo(seg(t, 0.6, 0.94))),
          lean: 0.7 * charge * (1 - eio(seg(t, at + 0.1, 0.5))),
          squash: 1 - 0.1 * bell(t, at + 0.02, 0.06),
          y: -26 * bell(t, 0.9, 0.14),
        },
        foe: { x: -40 + 220 * eo(fly), y: -90 * Math.sin(Math.PI * Math.min(1, fly * 1.1)) + 62 * ei(seg(t, 0.3, 0.62)), rot: -1.55 * ei(seg(t, at, 0.62)), lean: 0.3 * (1 - seg(t, at, at + 0.1)), squash: 1 + 0.18 * bell(t, at, 0.03) },
        ...impactFx(t, at, 1.3),
        shake: 1.2 * bell(t, at + 0.03, 0.2) + 1.0 * bell(t, 0.62, 0.2),
        tint: t < 0.2 ? 'gold' : null,
      };
    },
    bursts: [whooshAt(0.08, 'hero', 60, -130), sparkAt(0.16, 'foe', -60, -150), ringAt(0.16, 'foe', -60, -150), dustAt(0.6, 'foe', 120, 0), dustAt(0.63, 'foe', 200, 0)],
    hitStops: [{ at: 0.16, ms: 180 }],
  },
};

// Beats that start fresh (wind-ups, stances, endings) blend in from wherever the previous
// beat left the fighters, over this many scene milliseconds. Strike/dodge clips must not
// blend: they continue the wind-up they follow and need their snap intact.
const BLEND_IN = ['faceoff', 'foe_swing_high', 'foe_swing_low', 'foe_thrust_windup', 'foe_throw_windup', 'foe_charge', 'grapple', 'pinned', 'combo_ready', 'finisher_ready', 'foe_powerup', 'foe_smash_windup', 'foe_pound_windup', 'foe_double_windup', 'foe_dizzy', 'foe_dizzy_prompt', 'hero_shaken_off', 'knockdown'];
for (const name of BLEND_IN) CLIPS[name].blendIn = 220;

/** Expressions per clip: calm | fierce | happy | hurt | shock (hero) and calm | angry | happy | hurt | shock (foe). */
const FACES = {
  faceoff: { hero: 'calm', foe: 'angry' },
  foe_swing_high: { hero: 'shock', foe: 'angry' },
  foe_swing_low: { hero: 'shock', foe: 'angry' },
  hero_duck: { hero: 'fierce', foe: 'angry' },
  hero_jump: { hero: 'fierce', foe: 'angry' },
  hero_hit: { hero: 'hurt', foe: 'happy' },
  hero_hit_low: { hero: 'hurt', foe: 'happy' },
  hero_counter: { hero: 'fierce', foe: 'hurt' },
  foe_charge: { hero: 'shock', foe: 'angry' },
  hero_roll_left: { hero: 'fierce', foe: 'angry' },
  hero_roll_right: { hero: 'fierce', foe: 'angry' },
  hero_trampled: { hero: 'hurt', foe: 'happy' },
  grapple: { hero: 'shock', foe: 'angry' },
  shove: { hero: 'fierce', foe: 'hurt' },
  squeezed: { hero: 'hurt', foe: 'happy' },
  pinned: { hero: 'shock', foe: 'angry' },
  free: { hero: 'fierce', foe: 'hurt' },
  pinned_hit: { hero: 'hurt', foe: 'happy' },
  combo_ready: { hero: 'fierce', foe: 'shock' },
  combo_hit: { hero: 'fierce', foe: 'hurt' },
  combo_fumble: { hero: 'shock', foe: 'angry' },
  finisher_ready: { hero: 'fierce', foe: 'hurt' },
  finisher_miss: { hero: 'shock', foe: 'angry' },
  victory: { hero: 'happy', foe: 'hurt' },
  knockdown: { hero: 'hurt', foe: 'happy' },
  foe_thrust_windup: { hero: 'shock', foe: 'angry' },
  hero_parry: { hero: 'fierce', foe: 'shock' },
  hero_thrust_hit: { hero: 'hurt', foe: 'happy' },
  foe_throw_windup: { hero: 'shock', foe: 'angry' },
  hero_rock_duck: { hero: 'fierce', foe: 'angry' },
  hero_rock_jump: { hero: 'fierce', foe: 'angry' },
  hero_rock_hit: { hero: 'hurt', foe: 'happy' },
  foe_powerup: { hero: 'shock', foe: 'angry' },
  foe_smash_windup: { hero: 'shock', foe: 'angry' },
  hero_block: { hero: 'fierce', foe: 'angry' },
  hero_smashed: { hero: 'hurt', foe: 'happy' },
  foe_pound_windup: { hero: 'shock', foe: 'angry' },
  hero_brace: { hero: 'fierce', foe: 'angry' },
  hero_blown: { hero: 'hurt', foe: 'happy' },
  foe_double_windup: { hero: 'shock', foe: 'angry' },
  hero_weave: { hero: 'fierce', foe: 'angry' },
  hero_double_hit: { hero: 'hurt', foe: 'happy' },
  foe_dizzy: { hero: 'happy', foe: 'shock' },
  foe_dizzy_prompt: { hero: 'fierce', foe: 'shock' },
  hero_climb_pound: { hero: 'fierce', foe: 'hurt' },
  hero_shaken_off: { hero: 'hurt', foe: 'angry' },
  victory_bash: { hero: 'happy', foe: 'hurt' },
};

export const HERO_HOME = { x: 330, y: 440, facing: 1, rest: HERO_REST };
export const FOE_HOME = { x: 670, y: 440, facing: -1, rest: FOE_REST };

/** Hit-stop moments for a clip, for the player. */
export function hitStopsFor(name) {
  return CLIPS[name]?.hitStops ?? [];
}

/** Evaluate a clip, merging with rest poses. Unknown clips fall back to idle. */
export function evaluate(name, t, c = {}) {
  const clip = CLIPS[name] ?? CLIPS.faceoff;
  const out = clip.rig(Math.min(1, Math.max(0, t)), c) ?? {};
  const faces = FACES[name] ?? {};
  return {
    hero: { x: 0, y: 0, lean: 0, squash: 1, weapon: 0, rot: 0, alpha: 1, glow: 0, face: faces.hero ?? 'calm', ...HERO_REST, ...(out.hero ?? {}) },
    foe: { x: 0, y: 0, lean: 0, squash: 1, weapon: 0, rot: 0, alpha: 1, glow: 0, face: faces.foe ?? 'calm', ...FOE_REST, ...(out.foe ?? {}) },
    props: out.props ?? [],
    blendIn: clip.blendIn ?? 0,
    flash: out.flash ?? 0,
    red: out.red ?? 0,
    shake: out.shake ?? 0,
    punch: out.punch ?? 0,
    tint: out.tint ?? null,
    bursts: clip.bursts ?? [],
  };
}
