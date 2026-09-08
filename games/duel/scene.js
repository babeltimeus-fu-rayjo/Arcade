import { FOE_HOME, HERO_HOME, evaluate } from './clips.js';

const TAU = Math.PI * 2;
const SCENE_W = 1000;
const SCENE_H = 560;
const CAMERAS = {
  wide: { x: 500, zoom: 1 },
  hero: { x: 430, zoom: 1.25 },
  foe: { x: 570, zoom: 1.25 },
  action: { x: 500, zoom: 1.2 },
  close: { x: 500, zoom: 1.45 },
};
const OUTLINE = '#1a1230';
const LINE = 3;

/**
 * Draws the fight on one canvas: layered parallax ruins, two shape-built and
 * outlined fighters posed by the current clip (with faces, jointed limbs,
 * stepping legs, lagging plume/antenna and weapon trails), particles, camera
 * moves and screen effects (hit flashes, shake, slow-motion tint, letterbox,
 * speed lines).
 */
export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 500, zoom: 1 };
    this.particles = [];
    this.fired = new Set();
    this.beatKey = null;
    this.size = { w: 0, h: 0, dpr: 1 };
    this.lastPose = null; // rendered rigs from the previous frame, for blend-ins
    this.blend = null; // { from, start, ms } while a beat is blending in
    /** Optional hook: (kind) => void, called when a burst fires (for sound). */
    this.onBurst = null;
    // Per-fighter dynamics that need memory between frames.
    this.dyn = {
      hero: { lastX: null, vx: 0, swing: 0, swingV: 0, lastArm: null, trail: [] },
      foe: { lastX: null, vx: 0, swing: 0, swingV: 0, lastArm: null, trail: [] },
    };
  }

  fit() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (w === this.size.w && h === this.size.h && dpr === this.size.dpr) return;
    this.size = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  /** Render one frame. s = { clip, t, beatKey, camera, timeScale, progress, sceneTime, dtScene, dtReal, snapCamera }. */
  render(s) {
    this.fit();
    const { ctx } = this;
    const { w: W, h: H, dpr } = this.size;
    const dtScene = s.dtScene ?? 16;
    const dtReal = s.dtReal ?? 16;
    const pose = evaluate(s.clip, s.t, { progress: s.progress, time: s.sceneTime });

    if (s.beatKey !== this.beatKey) {
      this.beatKey = s.beatKey;
      this.fired.clear();
      this.blend = this.lastPose && pose.blendIn > 0 ? { from: this.lastPose, start: s.sceneTime, ms: pose.blendIn } : null;
    }
    if (this.blend) {
      const k = Math.min(1, Math.max(0, (s.sceneTime - this.blend.start) / this.blend.ms));
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      for (const who of ['hero', 'foe']) {
        for (const f of ['x', 'y', 'lean', 'squash', 'armF', 'armB', 'rot', 'weapon', 'glow']) {
          pose[who][f] = this.blend.from[who][f] + (pose[who][f] - this.blend.from[who][f]) * e;
        }
      }
      if (k >= 1) this.blend = null;
    }
    this.lastPose = { hero: { ...pose.hero }, foe: { ...pose.foe } };
    for (const b of pose.bursts) {
      const key = `${b.at}:${b.kind}:${b.who}`;
      if (s.t >= b.at && !this.fired.has(key)) {
        this.fired.add(key);
        const home = b.who === 'hero' ? HERO_HOME : FOE_HOME;
        const rig = b.who === 'hero' ? pose.hero : pose.foe;
        this.burst(b.kind, home.x + rig.x + b.dx * home.facing, home.y + rig.y + b.dy);
      }
    }
    this.updateParticles(dtScene);
    this.updateDynamics('hero', HERO_HOME, pose.hero, dtScene);
    this.updateDynamics('foe', FOE_HOME, pose.foe, dtScene);

    const target = CAMERAS[s.camera] ?? CAMERAS.wide;
    if (s.snapCamera) {
      this.cam = { ...target };
    } else {
      const k = 1 - Math.exp(-dtReal / 180);
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.zoom += (target.zoom - this.cam.zoom) * k;
    }

    const scale = Math.max(W / SCENE_W, H / SCENE_H);
    const zoom = this.cam.zoom * (1 + 0.14 * (pose.punch ?? 0)); // camera kick on impacts
    const shakeAmp = pose.shake * 11;
    const shakeX = shakeAmp ? Math.sin(s.sceneTime * 0.9) * shakeAmp : 0;
    const shakeY = shakeAmp ? Math.cos(s.sceneTime * 1.3) * shakeAmp : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(scale * zoom, scale * zoom);
    ctx.translate(-this.cam.x, -300);

    this.drawBackground(ctx, s.sceneTime, THEMES[s.theme] ?? THEMES.ruins);
    const heroFeet = HERO_HOME.y + pose.hero.y;
    const foeFeet = FOE_HOME.y + pose.foe.y;
    const order = heroFeet <= foeFeet ? ['hero', 'foe'] : ['foe', 'hero'];
    const drawFoe = FOES[s.foe] ?? drawRobot;
    for (const who of order) {
      if (who === 'hero') drawKnight(ctx, HERO_HOME, pose.hero, s.sceneTime, this.dyn.hero);
      else drawFoe(ctx, FOE_HOME, pose.foe, s.sceneTime, this.dyn.foe);
    }
    drawProps(ctx, pose.props ?? [], s.projectile ?? 'rock');
    this.drawParticles(ctx);
    this.drawForeground(ctx);
    ctx.restore();

    // Screen-space effects.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The white pop fades across a held impact frame instead of staying at full strength.
    const flash = Math.min(0.92, pose.flash) * (1 - 0.8 * (s.hitStopProgress ?? 0));
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (pose.red > 0) {
      ctx.fillStyle = `rgba(255, 80, 90, ${pose.red * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (pose.tint === 'gold') {
      ctx.fillStyle = 'rgba(255, 200, 80, 0.08)';
      ctx.fillRect(0, 0, W, H);
    }
    const slow = 1 - Math.min(1, s.timeScale ?? 1);
    if (slow > 0) {
      ctx.fillStyle = `rgba(30, 40, 90, ${0.3 * slow})`;
      ctx.fillRect(0, 0, W, H);
      this.drawSpeedLines(ctx, W, H, slow, s.sceneTime);
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, `rgba(0,0,0,${0.55 * slow})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      const bar = H * 0.07 * slow;
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }
  }

  /** Velocity (for stepping legs and trails) and the plume/antenna spring. */
  updateDynamics(who, home, rig, dtScene) {
    const d = this.dyn[who];
    const x = home.x + rig.x;
    const dt = Math.max(1, dtScene);
    if (d.lastX !== null) d.vx = d.vx * 0.6 + ((x - d.lastX) / dt) * 0.4;
    d.lastX = x;
    // Spring: the plume swings against the direction of travel and settles.
    const targetSwing = Math.max(-1, Math.min(1, -d.vx * home.facing * 0.9));
    const seconds = dt / 1000;
    const accel = (targetSwing - d.swing) * 90 - d.swingV * 13;
    d.swingV += accel * seconds;
    d.swing += d.swingV * seconds;
    // Weapon trail: remember the last few front-arm angles.
    if (d.lastArm !== null && Math.abs(rig.armF - d.lastArm) > 0.08) {
      d.trail = [d.lastArm, ...d.trail].slice(0, 3);
    } else {
      d.trail = d.trail.slice(0, Math.max(0, d.trail.length - 1));
    }
    d.lastArm = rig.armF;
    d.stride = Math.min(1, Math.abs(d.vx) * 1.3);
  }

  // ---- particles ----
  burst(kind, x, y) {
    this.onBurst?.(kind);
    if (kind === 'ring') {
      this.particles.push({ kind, x, y, vx: 0, vy: 0, life: 0, max: 260, size: 120, color: '#fff' });
      return;
    }
    const n = kind === 'spark' ? 28 : kind === 'dust' ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const speed = kind === 'spark' ? 0.5 + Math.random() * 0.8 : kind === 'dust' ? 0.08 + Math.random() * 0.14 : 0.25 + Math.random() * 0.2;
      this.particles.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * speed * (kind === 'whoosh' ? 1.6 : 1),
        vy: (kind === 'dust' ? -Math.abs(Math.sin(a)) * 0.6 : Math.sin(a)) * speed,
        life: 0,
        max: kind === 'spark' ? 260 + Math.random() * 260 : kind === 'dust' ? 600 + Math.random() * 400 : 260 + Math.random() * 120,
        size: kind === 'spark' ? 3.5 + Math.random() * 4.5 : kind === 'dust' ? 4 + Math.random() * 6 : 2 + Math.random() * 2,
        color: kind === 'spark' ? (Math.random() < 0.5 ? '#ffd86b' : '#fff1b8') : kind === 'dust' ? 'rgba(200, 190, 170, 0.28)' : 'rgba(255,255,255,0.7)',
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += 0.0012 * dt;
      if (p.kind === 'dust') p.vx *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, k);
      if (p.kind === 'ring') {
        // Expanding impact ring, thick at first then thin and faint.
        const grow = 1 - k;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 + 12 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12 + p.size * (1 - (1 - grow) ** 3), 0, TAU);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.kind === 'whoosh') ctx.ellipse(p.x, p.y, p.size * 4, p.size, Math.atan2(p.vy, p.vx), 0, TAU);
      else if (p.kind === 'spark') {
        // Streaks along their motion, not dots.
        const len = p.size * (1.5 + Math.hypot(p.vx, p.vy) * 6) * k;
        ctx.ellipse(p.x, p.y, Math.max(1, len), p.size * 0.55 * k + 0.5, Math.atan2(p.vy, p.vx), 0, TAU);
      } else ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- world ----
  drawBackground(ctx, time, theme) {
    const camOff = this.cam.x - 500;
    // Sky, stars, sun and rays.
    const sky = ctx.createLinearGradient(0, -300, 0, 440);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.45, theme.sky[1]);
    sky.addColorStop(0.8, theme.sky[2]);
    sky.addColorStop(1, theme.sky[3]);
    ctx.fillStyle = sky;
    ctx.fillRect(-1400, -700, 3800, 1140);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 173) % 1400) - 200 + camOff * 0.05;
      const sy = -280 + ((i * 89) % 260);
      const tw = 0.5 + 0.5 * Math.sin(time / 700 + i);
      ctx.globalAlpha = 0.25 + 0.45 * tw;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 + (i % 3) * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sunX = 780 + camOff * 0.1;
    const sunY = 300;
    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.rotate(time / 9000);
    ctx.fillStyle = theme.rays;
    for (let i = 0; i < 7; i++) {
      ctx.rotate(TAU / 7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-90, -900);
      ctx.lineTo(90, -900);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    for (const [r, a] of [[130, 0.08], [100, 0.12], [76, 1]]) {
      ctx.fillStyle = a === 1 ? theme.sun : theme.sunGlow(a);
      ctx.beginPath();
      ctx.arc(sunX, sunY, r, 0, TAU);
      ctx.fill();
    }

    // Far hills (or peaks).
    ctx.fillStyle = theme.hills;
    ctx.beginPath();
    ctx.moveTo(-1400, 440);
    const hx = camOff * 0.12;
    for (let x = -1400; x <= 2400; x += 80) {
      const jag = theme.silhouettes === 'mountains' ? 110 * Math.abs(Math.sin((x + hx) / 210)) + 40 * Math.abs(Math.sin((x + hx) / 70)) : 60 * Math.sin((x + hx) / 260) + 30 * Math.sin((x + hx) / 90 + 2);
      ctx.lineTo(x - hx, 380 - jag);
    }
    ctx.lineTo(2400, 440);
    ctx.closePath();
    ctx.fill();

    // Mid layer: the place itself.
    const mid = camOff * 0.3;
    ctx.fillStyle = theme.mid;
    const blocks = [[-300, 140, 220], [-40, 90, 300], [180, 160, 180], [520, 120, 260], [720, 200, 200], [1000, 110, 320], [1200, 180, 210], [1450, 120, 240]];
    for (const [x, w, h] of blocks) {
      const bx = x - mid;
      if (theme.silhouettes === 'arches') {
        ctx.fillRect(bx, 440 - h * 0.8, w, h * 0.8);
        ctx.beginPath();
        ctx.arc(bx + w / 2, 440 - h * 0.8, w / 2, Math.PI, 0);
        ctx.fill();
      } else if (theme.silhouettes === 'pillars') {
        ctx.fillRect(bx + w * 0.3, 440 - h, w * 0.4, h);
        ctx.fillRect(bx - 10, 440 - h - 14, w + 20, 14);
        ctx.fillRect(bx + w * 0.3 - 8, 440 - h * 0.5, w * 0.4 + 16, 10);
      } else if (theme.silhouettes === 'mountains') {
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.6, 440);
        ctx.lineTo(bx + w * 0.5, 440 - h * 1.3);
        ctx.lineTo(bx + w * 1.6, 440);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(bx, 440 - h, w, h);
        ctx.fillRect(bx - 12, 440 - h - 16, w + 24, 18);
        ctx.fillRect(bx + 10, 440 - h - 30, w - 20, 16);
      }
    }
    ctx.fillStyle = theme.mid2;
    for (const [x, w, h] of [[-160, 60, 150], [300, 50, 190], [860, 70, 140], [1150, 55, 170]]) {
      const bx = x - camOff * 0.45;
      if (theme.silhouettes === 'arches') {
        // tombstones
        ctx.fillRect(bx, 440 - h * 0.45, w, h * 0.45);
        ctx.beginPath();
        ctx.arc(bx + w / 2, 440 - h * 0.45, w / 2, Math.PI, 0);
        ctx.fill();
      } else if (theme.silhouettes === 'mountains') {
        ctx.beginPath();
        ctx.moveTo(bx - w, 440);
        ctx.lineTo(bx + w * 0.5, 440 - h * 0.9);
        ctx.lineTo(bx + w * 2, 440);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(bx, 440 - h, w, h);
        ctx.fillRect(bx - 6, 440 - h - 10, w + 12, 12);
      }
    }
    if (theme.silhouettes === 'pillars') {
      // Rope rails across the bridge.
      ctx.strokeStyle = theme.mid2;
      ctx.lineWidth = 4;
      for (const y of [300, 340]) {
        ctx.beginPath();
        for (let x = -1400; x <= 2400; x += 200) {
          const bx = x - camOff * 0.45;
          if (x === -1400) ctx.moveTo(bx, y);
          ctx.quadraticCurveTo(bx + 100, y + 22, bx + 200, y);
        }
        ctx.stroke();
      }
    }
    // Near mounds.
    ctx.fillStyle = theme.near;
    for (const [x, rx, ry] of [[-80, 120, 40], [420, 90, 30], [1080, 150, 46], [1500, 100, 32]]) {
      ctx.beginPath();
      ctx.ellipse(x - camOff * 0.6, 442, rx, ry, 0, Math.PI, TAU);
      ctx.fill();
    }

    // Ground.
    const ground = ctx.createLinearGradient(0, 440, 0, 760);
    ground.addColorStop(0, theme.ground[0]);
    ground.addColorStop(0.3, theme.ground[1]);
    ground.addColorStop(1, theme.ground[2]);
    ctx.fillStyle = ground;
    ctx.fillRect(-1400, 440, 3800, 400);
    ctx.fillStyle = 'rgba(255, 220, 180, 0.45)';
    ctx.fillRect(-1400, 438, 3800, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (const [x, len] of [[60, 80], [380, 120], [640, 60], [980, 140], [1300, 90]]) {
      ctx.beginPath();
      ctx.moveTo(x, 470);
      ctx.lineTo(x + len * 0.4, 490);
      ctx.lineTo(x + len, 500);
      ctx.stroke();
    }
    ctx.fillStyle = theme.stones;
    for (const [x, rx, ry] of [[80, 60, 14], [250, 30, 8], [560, 45, 10], [900, 70, 16], [1150, 35, 9]]) {
      ctx.beginPath();
      ctx.ellipse(x, 452, rx, ry, 0, 0, TAU);
      ctx.fill();
    }

    // Drifting dust motes.
    ctx.fillStyle = 'rgba(255, 240, 220, 0.35)';
    for (let i = 0; i < 40; i++) {
      const bx = ((i * 257) % 1500) - 250 - camOff * 0.5;
      const by = -60 + ((i * 131) % 480);
      const mx = bx + Math.sin(time / 1300 + i) * 30 + (time / 90) % 1500 * 0.03;
      const my = by + Math.cos(time / 1700 + i * 1.3) * 20;
      ctx.globalAlpha = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(time / 900 + i * 2));
      ctx.beginPath();
      ctx.arc(mx, my, 1.5 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Dark rubble in front of the fighters, sliding faster than the camera. */
  drawForeground(ctx) {
    const off = (this.cam.x - 500) * 0.45;
    ctx.fillStyle = '#1c1626';
    for (const [x, w, h, r] of [[-200, 220, 70, 30], [430, 160, 50, 22], [1050, 260, 80, 34], [1500, 180, 60, 26]]) {
      const bx = x - off;
      ctx.beginPath();
      ctx.moveTo(bx, 560);
      ctx.lineTo(bx, 560 - h + r);
      ctx.arcTo(bx, 560 - h, bx + r, 560 - h, r);
      ctx.lineTo(bx + w - r, 560 - h + 10);
      ctx.arcTo(bx + w, 560 - h + 10, bx + w, 560 - h + 10 + r, r);
      ctx.lineTo(bx + w, 560);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawSpeedLines(ctx, W, H, slow, time) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.14 * slow})`;
    ctx.lineWidth = 2;
    const cx = W / 2;
    const cy = H * 0.46;
    const base = Math.min(W, H) * 0.3;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + 0.13;
      const wobble = ((i * 37 + time * 0.05) % 90);
      const r0 = base + wobble;
      const r1 = r0 + 50 + ((i * 53) % 90);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---- props ----

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawProps(ctx, props, projectile = 'rock') {
  for (const p of props) {
    ctx.save();
    ctx.globalAlpha = p.alpha ?? 1;
    if (p.kind === 'rock' && projectile === 'fireball') {
      ctx.translate(p.x, p.y);
      const r = (p.size ?? 26) * 0.9;
      const tail = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.9);
      tail.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
      tail.addColorStop(0.5, 'rgba(255, 120, 60, 0.45)');
      tail.addColorStop(1, 'rgba(255, 80, 40, 0)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.ellipse(r * 0.6, 0, r * 2.4, r * 1.4, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      paint(ctx, '#ff8c42', -r, 2 * r);
      ctx.fillStyle = '#fff1b8';
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.2, r * 0.45, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'rock' && projectile === 'bone') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot ?? 0);
      const r = p.size ?? 26;
      rrect(ctx, -r, -r * 0.28, 2 * r, r * 0.56, r * 0.28, '#e8e6dc');
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(ctx, sx * r, sy * r * 0.32, r * 0.36, '#e8e6dc');
    } else if (p.kind === 'rock') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot ?? 0);
      const r = (p.size ?? 26) * (projectile === 'boulder' ? 1.35 : 1);
      ctx.beginPath();
      for (const [x, y] of [[1, 0.25], [0.65, 0.9], [-0.25, 1], [-1, 0.45], [-0.85, -0.5], [-0.1, -1], [0.75, -0.65]]) ctx.lineTo(x * r, y * r);
      ctx.closePath();
      paint(ctx, '#8a8fa8', -r, 2 * r);
      ctx.strokeStyle = 'rgba(20, 18, 40, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.6);
      ctx.lineTo(r * 0.1, -r * 0.1);
      ctx.lineTo(-r * 0.2, r * 0.5);
      ctx.stroke();
    } else if (p.kind === 'shock') {
      // A ground wave: a bright crest with dust ellipses around it.
      const w = p.w ?? 80;
      ctx.strokeStyle = 'rgba(255, 245, 225, 0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(p.x, 436, w / 2, 26, 0, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 190, 170, 0.5)';
      for (const [dx, rx, ry] of [[-w * 0.35, w * 0.25, 14], [w * 0.3, w * 0.22, 12], [0, w * 0.3, 20]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + dx, 440, rx, ry, 0, 0, TAU);
        ctx.fill();
      }
    } else if (p.kind === 'stars') {
      for (let i = 0; i < 3; i++) {
        const a = (p.phase ?? 0) * TAU + (i * TAU) / 3;
        starPath(ctx, p.x + Math.cos(a) * 48, p.y + Math.sin(a) * 12 - 6, 9);
        paint(ctx, '#ffd86b', p.y - 20, 30);
      }
    }
    ctx.restore();
  }
}

// ---- foes and places ----

const FOES = { robot: drawRobot, ogre: drawOgre, skeleton: drawSkeleton, dragon: drawDragon };

const THEMES = {
  ruins: { sky: ['#120c33', '#4b2f7f', '#c96b7a', '#ffa66b'], rays: 'rgba(255, 216, 107, 0.06)', sun: '#ffd86b', sunGlow: (a) => `rgba(255, 216, 107, ${a})`, hills: '#2a1f4d', mid: '#332757', mid2: '#3f3170', near: '#4a3d70', ground: ['#7a6555', '#4f4038', '#241d2c'], stones: '#5a4a40', silhouettes: 'columns' },
  bridge: { sky: ['#0b2a4a', '#1f5f8a', '#7fb6d9', '#ffe6a6'], rays: 'rgba(255, 245, 200, 0.07)', sun: '#fff1b8', sunGlow: (a) => `rgba(255, 241, 184, ${a})`, hills: '#1c3a52', mid: '#24485f', mid2: '#2d5a74', near: '#3a6a84', ground: ['#6a7a6a', '#3f4f3f', '#1d2a22'], stones: '#4a5a4a', silhouettes: 'pillars' },
  crypt: { sky: ['#050510', '#150c2a', '#2e1a48', '#4a2a5e'], rays: 'rgba(200, 210, 240, 0.05)', sun: '#c9d0e3', sunGlow: (a) => `rgba(201, 208, 227, ${a})`, hills: '#120a1e', mid: '#1c1230', mid2: '#26183d', near: '#301f4a', ground: ['#4a4552', '#2a2630', '#141218'], stones: '#3a3540', silhouettes: 'arches' },
  peak: { sky: ['#1a0a2e', '#7a2a4a', '#ff7a5c', '#ffd86b'], rays: 'rgba(255, 200, 120, 0.07)', sun: '#ff9f6b', sunGlow: (a) => `rgba(255, 159, 107, ${a})`, hills: '#3a1a3a', mid: '#4a2440', mid2: '#5a2e4a', near: '#6a3a50', ground: ['#5a4a4a', '#3a2c30', '#1a1418'], stones: '#4a3a3a', silhouettes: 'mountains' },
};

// ---- paint helpers ----

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function roundedPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (w <= 0 || h <= 0) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fill the current path with a top-lit gradient and outline it. */
function paint(ctx, base, top, height, outline = true) {
  const g = ctx.createLinearGradient(0, top, 0, top + height);
  g.addColorStop(0, shade(base, 0.24));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = LINE;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

function rrect(ctx, x, y, w, h, r, base, outline = true) {
  roundedPath(ctx, x, y, w, h, r);
  paint(ctx, base, y, h, outline);
}

function circle(ctx, x, y, r, base, outline = true) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  paint(ctx, base, y - r, 2 * r, outline);
}

function shine(ctx, x, y, rx, ry, alpha = 0.32) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, TAU);
  ctx.fill();
}

/**
 * A two-segment limb from (x, y): angle 0 hangs down, positive swings forward
 * (+x). `bend` bends the lower segment further. Leaves ctx translated to the
 * end (the hand or foot) and rotated along the lower segment.
 */
function limb(ctx, x, y, angle, upper, lower, bend, width, base) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  rrect(ctx, -width / 2, -width / 3, width, upper + width / 3, width / 2, base);
  ctx.translate(0, upper);
  circle(ctx, 0, 0, width * 0.42, shade(base, -0.1));
  ctx.rotate(-bend);
  rrect(ctx, -width / 2 + 1, -width / 3, width - 2, lower + width / 3, width / 2, base);
  ctx.translate(0, lower);
}

/** Same transforms as limb(), drawing nothing: used to place weapon trail ghosts. */
function limbTransform(ctx, x, y, angle, upper, lower, bend) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.translate(0, upper);
  ctx.rotate(-bend);
  ctx.translate(0, lower);
}

/** Position, face, breathe, squash and rotate; the body is then drawn feet-at-origin, facing +x. */
function begin(ctx, home, rig, time) {
  ctx.save();
  ctx.translate(home.x + rig.x, home.y);
  const lift = Math.min(1, Math.abs(rig.y) / 220);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.38 * (1 - lift * 0.6)})`;
  ctx.beginPath();
  ctx.ellipse(0, 6, 52 * (1 - lift * 0.4), 11 * (1 - lift * 0.4), 0, 0, TAU);
  ctx.fill();
  ctx.translate(0, rig.y);
  ctx.scale(home.facing, 1);
  ctx.rotate(rig.rot);
  ctx.globalAlpha = rig.alpha;
  const breathe = 1 + Math.sin(time / 420) * 0.012;
  ctx.scale(1 + (1 - rig.squash) * 0.6, rig.squash * breathe);
}

/** Leg angles from stride and air time: alternate when moving, tuck when airborne. */
function legs(rig, dyn, time) {
  const stride = dyn?.stride ?? 0;
  const phase = Math.sin(time / 55);
  const air = Math.min(1, Math.max(0, -rig.y) / 160);
  return {
    front: 0.55 * stride * phase + 0.2 * air,
    back: -0.55 * stride * phase - 0.3 * air,
    bend: 0.35 * stride * (0.5 + 0.5 * phase) + 0.9 * air,
  };
}

// ---- the knight ----

const KNIGHT = { tunic: '#4f7cff', steel: '#b9c2dc', skin: '#f2c9a0', pants: '#2b3460', boot: '#4a2f1d', glove: '#7a4a22', plume: '#ff5d73', shield: '#ffd86b', wood: '#8a5a2b' };

function knightFace(ctx, face) {
  // Eyes and mouth in head-local coordinates, face turned toward +x.
  const eyes = [[0, 8], [17, 8]];
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = OUTLINE;
  if (face === 'hurt') {
    ctx.lineWidth = 3;
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(12, 23, 3.5, 0, TAU);
    ctx.fill();
    return;
  }
  const big = face === 'shock' ? 6 : 4.2;
  if (face === 'happy') {
    ctx.lineWidth = 3.5;
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.arc(x, y + 2, 4.5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else {
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.arc(x, y, big, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + 1.5, y - 1.5, big * 0.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = OUTLINE;
    }
  }
  if (face === 'fierce') {
    ctx.lineWidth = 3;
    for (const [x, y] of eyes) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 9);
      ctx.lineTo(x + 6, y - 6);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (face === 'shock') {
    ctx.ellipse(12, 24, 5, 6.5, 0, 0, TAU);
    ctx.fill();
  } else if (face === 'happy' || face === 'fierce') {
    ctx.arc(11, 19, 8, 0.15, Math.PI - 0.15);
    ctx.stroke();
  } else {
    ctx.arc(11, 21, 5, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }
}

function drawSword(ctx, ghost = false) {
  // Drawn from the hand, pointing along +y (the arm's direction).
  ctx.save();
  if (ghost) ctx.globalAlpha *= 0.14;
  rrect(ctx, -5, -16, 10, 22, 4, KNIGHT.glove, !ghost);
  rrect(ctx, -22, 4, 44, 10, 4, '#c99a3a', !ghost);
  ctx.beginPath();
  ctx.moveTo(-7, 13);
  ctx.lineTo(7, 13);
  ctx.lineTo(7, 100);
  ctx.lineTo(0, 116);
  ctx.lineTo(-7, 100);
  ctx.closePath();
  paint(ctx, '#dfe5f4', 13, 103, !ghost);
  if (!ghost) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-1.5, 16, 3, 82);
  }
  ctx.restore();
}

function drawKnight(ctx, home, rig, time, dyn) {
  begin(ctx, home, rig, time);
  const face = rig.face ?? 'calm';
  const leg = legs(rig, dyn, time);
  // Back arm with the shield, behind the body.
  limb(ctx, -14, -140, rig.armB, 30, 30, 0.25, 15, KNIGHT.tunic);
  circle(ctx, 0, 6, 34, KNIGHT.shield);
  circle(ctx, 0, 6, 22, KNIGHT.wood);
  circle(ctx, 0, 6, 8, '#c99a3a');
  shine(ctx, -12, -8, 8, 4);
  ctx.restore();
  // Legs: back then front.
  limb(ctx, -13, -64, leg.back, 34, 30, leg.bend, 17, KNIGHT.pants);
  rrect(ctx, -12, -4, 30, 16, 6, KNIGHT.boot);
  ctx.restore();
  limb(ctx, 13, -64, leg.front, 34, 30, leg.bend, 17, KNIGHT.pants);
  rrect(ctx, -12, -4, 30, 16, 6, KNIGHT.boot);
  ctx.restore();
  // Torso and head lean together from the hips.
  ctx.save();
  ctx.translate(0, -62);
  ctx.rotate(rig.lean);
  rrect(ctx, -28, -98, 56, 102, 16, KNIGHT.tunic);
  rrect(ctx, -29, -34, 58, 12, 4, KNIGHT.wood);
  rrect(ctx, -6, -36, 12, 16, 3, '#c99a3a');
  circle(ctx, 4, -70, 9, '#ffd86b'); // chest emblem
  circle(ctx, -24, -92, 14, KNIGHT.steel);
  circle(ctx, 24, -92, 14, KNIGHT.steel);
  shine(ctx, -12, -90, 5, 3, 0.25);
  // Neck and head.
  rrect(ctx, -8, -112, 18, 18, 5, KNIGHT.skin);
  ctx.save();
  ctx.translate(4, -136);
  const R = 33;
  circle(ctx, 0, 0, R, KNIGHT.skin);
  // Helmet: dome, brim, cheek guards, nose guard.
  ctx.beginPath();
  ctx.arc(0, -3, R + 5, Math.PI, 0);
  ctx.lineTo(R + 10, 4);
  ctx.lineTo(-(R + 10), 4);
  ctx.closePath();
  paint(ctx, KNIGHT.steel, -R - 8, R + 12);
  rrect(ctx, -(R + 4), -2, 14, 26, 6, KNIGHT.steel);
  rrect(ctx, R - 9, -2, 14, 26, 6, KNIGHT.steel);
  rrect(ctx, 6, 0, 8, 18, 3, KNIGHT.steel);
  shine(ctx, -14, -24, 10, 5);
  knightFace(ctx, face);
  // Plume, swinging with the spring.
  const sw = dyn?.swing ?? 0;
  ctx.lineCap = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(-4, -R - 4);
  ctx.quadraticCurveTo(-28 + sw * 18, -R - 34, -46 + sw * 34, -R - 14 + Math.abs(sw) * 10);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = KNIGHT.plume;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Front arm with the sword (plus motion trail).
  const trail = dyn?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    limbTransform(ctx, 14, -140, trail[i], 30, 28, 0.3);
    ctx.globalAlpha = 0.5 - i * 0.12;
    drawSword(ctx, true);
    ctx.restore();
  }
  limb(ctx, 14, -140, rig.armF, 30, 28, 0.3, 16, KNIGHT.tunic);
  circle(ctx, 0, 0, 10, KNIGHT.glove);
  ctx.rotate(-rig.weapon);
  drawSword(ctx);
  ctx.restore();
  ctx.restore();
}

// ---- the robot ----

const ROBOT = { body: '#ff7a5c', shade: '#c9553f', steel: '#8a8fa8', dark: '#5a5f78', eye: '#7ff7ff', club: '#6b4420' };

function robotFace(ctx, face, time, glow = 0) {
  // Visor with one big eye, in head-local coordinates (head centre at 0,0).
  rrect(ctx, -26, -14, 52, 28, 9, '#161a30');
  const eyeColor = glow > 0.5 ? '#ff5d73' : ROBOT.eye;
  const eyeR = (face === 'shock' ? 11 : face === 'angry' ? 7 : 8.5) * (1 + 0.15 * glow);
  ctx.save();
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = 12 + 14 * glow;
  ctx.fillStyle = face === 'hurt' ? (glow > 0.5 ? 'rgba(255, 93, 115, 0.4)' : 'rgba(127, 247, 255, 0.35)') : eyeColor;
  if (face === 'hurt') {
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -7);
    ctx.lineTo(18, 7);
    ctx.moveTo(18, -7);
    ctx.lineTo(4, 7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(11, 0, eyeR, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(14, -3, eyeR * 0.3 + Math.sin(time / 300) * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (face === 'angry') {
    ctx.fillStyle = '#161a30';
    ctx.beginPath();
    ctx.moveTo(-2, -16);
    ctx.lineTo(26, -16);
    ctx.lineTo(26, -4);
    ctx.closePath();
    ctx.fill();
  }
  if (face === 'happy') {
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(11, 4, 12, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  // Mouth grille.
  ctx.fillStyle = ROBOT.dark;
  for (let i = -1; i <= 1; i++) {
    const tilt = face === 'hurt' ? i * 3 : 0;
    ctx.fillRect(4 + i * 9 - 2, 20 + tilt, 4, 8);
  }
}

function drawClub(ctx, ghost = false) {
  ctx.save();
  if (ghost) ctx.globalAlpha *= 0.14;
  rrect(ctx, -7, 8, 14, 74, 6, ROBOT.club, !ghost);
  rrect(ctx, -26, 72, 52, 50, 14, ROBOT.steel, !ghost);
  if (!ghost) {
    ctx.fillStyle = ROBOT.dark;
    for (const y of [86, 108]) {
      ctx.beginPath();
      ctx.arc(-15, y, 3.2, 0, TAU);
      ctx.arc(15, y, 3.2, 0, TAU);
      ctx.fill();
    }
    shine(ctx, -10, 82, 7, 3, 0.3);
  }
  ctx.restore();
}

function drawRobot(ctx, home, rig, time, dyn) {
  begin(ctx, home, rig, time);
  const face = rig.face ?? 'calm';
  const leg = legs(rig, dyn, time);
  const glow = Math.max(0, Math.min(1, rig.glow ?? 0));
  if (glow > 0) {
    // Charged: a pulsing red aura behind the whole body.
    const pulse = 0.8 + 0.2 * Math.sin(time / 120);
    const aura = ctx.createRadialGradient(0, -130, 30, 0, -130, 230);
    aura.addColorStop(0, `rgba(255, 93, 115, ${0.4 * glow * pulse})`);
    aura.addColorStop(1, 'rgba(255, 93, 115, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-240, -370, 480, 420);
  }
  // Back arm with a claw.
  limb(ctx, -32, -162, rig.armB, 34, 30, 0.2, 22, ROBOT.shade);
  rrect(ctx, -15, -6, 30, 26, 7, ROBOT.steel);
  ctx.restore();
  // Legs.
  limb(ctx, -22, -74, leg.back, 36, 34, leg.bend, 24, ROBOT.shade);
  rrect(ctx, -16, -4, 40, 18, 6, ROBOT.dark);
  ctx.restore();
  limb(ctx, 22, -74, leg.front, 36, 34, leg.bend, 24, ROBOT.shade);
  rrect(ctx, -16, -4, 40, 18, 6, ROBOT.dark);
  ctx.restore();
  // Torso and head.
  ctx.save();
  ctx.translate(0, -70);
  ctx.rotate(rig.lean);
  rrect(ctx, -44, -112, 88, 116, 14, ROBOT.body);
  ctx.fillStyle = ROBOT.shade;
  ctx.fillRect(-44, -42, 88, 6);
  rrect(ctx, -30, -30, 60, 22, 5, ROBOT.dark);
  ctx.fillStyle = ROBOT.steel;
  for (let i = 0; i < 4; i++) ctx.fillRect(-24 + i * 14, -26, 6, 14);
  ctx.save();
  const chest = glow > 0.5 ? '#ff5d73' : ROBOT.eye;
  ctx.shadowColor = chest;
  ctx.shadowBlur = 10 + Math.sin(time / 300) * 6 + 14 * glow;
  circle(ctx, 14, -74, 10 + 2 * glow, chest);
  ctx.restore();
  ctx.fillStyle = ROBOT.dark;
  for (const [x, y] of [[-34, -100], [34, -100], [-34, -12], [34, -12]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TAU);
    ctx.fill();
  }
  shine(ctx, -26, -96, 9, 4, 0.22);
  // Neck and head.
  rrect(ctx, -12, -126, 24, 18, 4, ROBOT.dark);
  ctx.save();
  ctx.translate(0, -150);
  rrect(ctx, -38, -28, 76, 56, 12, '#ff9f6b');
  shine(ctx, -22, -18, 8, 4, 0.25);
  robotFace(ctx, face, time, glow);
  // Antenna with the spring wobble.
  const sw = dyn?.swing ?? 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-8, -28);
  ctx.quadraticCurveTo(-8 + sw * 10, -44, -8 + sw * 22, -58);
  ctx.stroke();
  ctx.strokeStyle = ROBOT.steel;
  ctx.lineWidth = 4;
  ctx.stroke();
  circle(ctx, -8 + sw * 22, -62, 7, '#ff5d73');
  ctx.restore();
  ctx.restore();
  // Front arm with the club (plus motion trail).
  const trail = dyn?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    limbTransform(ctx, 32, -162, trail[i], 36, 32, 0.15);
    ctx.globalAlpha = 0.5 - i * 0.12;
    drawClub(ctx, true);
    ctx.restore();
  }
  limb(ctx, 32, -162, rig.armF, 36, 32, 0.15, 24, ROBOT.shade);
  rrect(ctx, -15, -6, 30, 26, 7, ROBOT.steel);
  ctx.rotate(-rig.weapon);
  drawClub(ctx);
  ctx.restore();
  ctx.restore();
}


// ---- the ogre ----

const OGRE = { skin: '#6bbf59', dark: '#4a9440', cloth: '#5a3a1a', strap: '#8a5a2b', club: '#8a5a2b', knob: '#4a2f1d', tusk: '#fff8e8', hair: '#3a2a1a' };

function ogreFace(ctx, face, time) {
  const eyes = [[-2, -4], [20, -6]];
  ctx.strokeStyle = OUTLINE;
  ctx.lineCap = 'round';
  for (const [x, y] of eyes) {
    if (face === 'hurt') {
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();
      continue;
    }
    const r = face === 'shock' ? 8 : 6;
    circle(ctx, x, y, r, '#fff8e8');
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(x + 2, y, face === 'angry' ? 3.2 : 3.6, 0, TAU);
    ctx.fill();
  }
  if (face === 'angry' || face === 'happy') {
    // Heavy brow, tilted down over the eyes when angry.
    ctx.fillStyle = OGRE.dark;
    ctx.beginPath();
    ctx.moveTo(-14, face === 'angry' ? -14 : -20);
    ctx.lineTo(32, face === 'angry' ? -8 : -20);
    ctx.lineTo(32, -2);
    ctx.lineTo(-14, -8);
    ctx.closePath();
    ctx.fill();
  }
  // Mouth and tusks.
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (face === 'shock') {
    ctx.ellipse(14, 20, 9, 11, 0, 0, TAU);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  } else if (face === 'happy') {
    ctx.arc(12, 14, 14, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else {
    ctx.moveTo(-2, 20);
    ctx.quadraticCurveTo(14, face === 'hurt' ? 28 : 14, 30, 20);
    ctx.stroke();
  }
  for (const x of [2, 24]) {
    ctx.beginPath();
    ctx.moveTo(x - 5, 22);
    ctx.lineTo(x + 5, 22);
    ctx.lineTo(x, 6);
    ctx.closePath();
    paint(ctx, OGRE.tusk, 6, 16);
  }
}

function drawOgreClub(ctx, ghost = false) {
  ctx.save();
  if (ghost) ctx.globalAlpha *= 0.14;
  rrect(ctx, -7, 6, 14, 44, 6, OGRE.club, !ghost);
  ctx.beginPath();
  ctx.ellipse(0, 96, 24, 50, 0, 0, TAU);
  paint(ctx, OGRE.club, 46, 100, !ghost);
  if (!ghost) {
    for (const [x, y] of [[-12, 72], [14, 92], [-8, 118], [12, 130]]) circle(ctx, x, y, 4.5, OGRE.knob);
    shine(ctx, -9, 70, 6, 14, 0.18);
  }
  ctx.restore();
}

function drawOgre(ctx, home, rig, time, dyn) {
  begin(ctx, home, rig, time);
  const face = rig.face ?? 'calm';
  const leg = legs(rig, dyn, time);
  const glow = Math.max(0, Math.min(1, rig.glow ?? 0));
  if (glow > 0) {
    const aura = ctx.createRadialGradient(0, -120, 30, 0, -120, 240);
    aura.addColorStop(0, `rgba(255, 120, 60, ${0.4 * glow * (0.8 + 0.2 * Math.sin(time / 120))})`);
    aura.addColorStop(1, 'rgba(255, 120, 60, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-250, -370, 500, 420);
  }
  // Back arm.
  limb(ctx, -36, -150, rig.armB, 40, 36, 0.25, 28, OGRE.skin);
  circle(ctx, 0, 2, 16, OGRE.skin);
  ctx.restore();
  // Legs with bare feet.
  for (const [x, angle] of [[-24, leg.back], [24, leg.front]]) {
    limb(ctx, x, -72, angle, 34, 30, leg.bend, 30, OGRE.skin);
    rrect(ctx, -18, -4, 46, 18, 7, OGRE.dark);
    for (const tx of [10, 20, 28]) circle(ctx, tx, 8, 4, OGRE.skin);
    ctx.restore();
  }
  // Belly, loincloth, strap.
  ctx.save();
  ctx.translate(0, -68);
  ctx.rotate(rig.lean);
  rrect(ctx, -56, -122, 112, 128, 46, OGRE.skin);
  rrect(ctx, -36, -14, 72, 30, 9, OGRE.cloth);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-40, -112);
  ctx.lineTo(24, -6);
  ctx.stroke();
  ctx.strokeStyle = OGRE.strap;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = OGRE.dark;
  ctx.beginPath();
  ctx.arc(10, -40, 4, 0, TAU);
  ctx.fill();
  shine(ctx, -26, -100, 12, 6, 0.18);
  // Head.
  rrect(ctx, -12, -134, 26, 20, 6, OGRE.skin);
  ctx.save();
  ctx.translate(6, -172);
  circle(ctx, 0, 0, 42, OGRE.skin);
  circle(ctx, -40, -2, 9, OGRE.skin);
  circle(ctx, 40, -6, 8, OGRE.skin);
  const sw = dyn?.swing ?? 0;
  circle(ctx, -8 + sw * 6, -44, 12, OGRE.hair);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-8 + sw * 6, -52);
  ctx.quadraticCurveTo(-20 + sw * 18, -70, -34 + sw * 30, -66);
  ctx.stroke();
  ctx.strokeStyle = OGRE.hair;
  ctx.lineWidth = 4;
  ctx.stroke();
  ogreFace(ctx, face, time);
  ctx.restore();
  ctx.restore();
  // Front arm with the club (plus motion trail).
  const trail = dyn?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    limbTransform(ctx, 36, -150, trail[i], 42, 38, 0.2);
    ctx.globalAlpha = 0.5 - i * 0.12;
    drawOgreClub(ctx, true);
    ctx.restore();
  }
  limb(ctx, 36, -150, rig.armF, 42, 38, 0.2, 28, OGRE.skin);
  circle(ctx, 0, 0, 16, OGRE.skin);
  ctx.rotate(-rig.weapon);
  drawOgreClub(ctx);
  ctx.restore();
  ctx.restore();
}

// ---- the skeleton knight ----

const BONE = { bone: '#e8e6dc', shade: '#b8b4a6', cape: '#5a2a6a', eye: '#ff5d73', blade: '#b39b7a', hilt: '#6a4a2a' };

function skullFace(ctx, face, glow) {
  const sockets = [[-4, -4], [16, -6]];
  for (const [x, y] of sockets) {
    const r = face === 'shock' ? 10 : 7;
    ctx.fillStyle = '#161020';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (face === 'hurt') {
      ctx.strokeStyle = BONE.eye;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.shadowColor = BONE.eye;
      ctx.shadowBlur = 8 + 12 * glow;
      ctx.fillStyle = BONE.eye;
      ctx.beginPath();
      ctx.arc(x + 1, y, 2.5 + 1.5 * glow + (face === 'shock' ? 1 : 0), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  if (face === 'angry') {
    ctx.fillStyle = BONE.shade;
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.lineTo(26, -10);
    ctx.lineTo(26, -4);
    ctx.lineTo(-14, -8);
    ctx.closePath();
    ctx.fill();
  }
  // Nose hole and teeth.
  ctx.fillStyle = '#161020';
  ctx.beginPath();
  ctx.moveTo(12, 4);
  ctx.lineTo(18, 12);
  ctx.lineTo(8, 12);
  ctx.closePath();
  ctx.fill();
  const open = face === 'shock' || face === 'happy' ? 6 : 0;
  rrect(ctx, -16, 16 + open, 40, 12, 4, BONE.bone);
  ctx.fillStyle = OUTLINE;
  for (let i = 0; i < 5; i++) ctx.fillRect(-12 + i * 8, 15 + open, 1.5, 12);
}

function drawSkelSword(ctx, ghost = false) {
  ctx.save();
  if (ghost) ctx.globalAlpha *= 0.14;
  rrect(ctx, -4, -14, 8, 18, 3, BONE.hilt, !ghost);
  rrect(ctx, -17, 2, 34, 7, 3, BONE.hilt, !ghost);
  ctx.beginPath();
  ctx.moveTo(-6, 9);
  ctx.lineTo(6, 9);
  ctx.lineTo(5, 60);
  ctx.lineTo(7, 70);
  ctx.lineTo(3, 98);
  ctx.lineTo(0, 108);
  ctx.lineTo(-3, 98);
  ctx.lineTo(-5, 54);
  ctx.closePath();
  paint(ctx, BONE.blade, 9, 100, !ghost);
  ctx.restore();
}

function drawSkeleton(ctx, home, rig, time, dyn) {
  begin(ctx, home, rig, time);
  const face = rig.face ?? 'calm';
  const leg = legs(rig, dyn, time);
  const glow = Math.max(0, Math.min(1, rig.glow ?? 0));
  const sw = dyn?.swing ?? 0;
  if (glow > 0) {
    const aura = ctx.createRadialGradient(0, -120, 30, 0, -120, 220);
    aura.addColorStop(0, `rgba(120, 255, 200, ${0.35 * glow * (0.8 + 0.2 * Math.sin(time / 120))})`);
    aura.addColorStop(1, 'rgba(120, 255, 200, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-240, -370, 480, 420);
  }
  // Tattered cape behind everything.
  ctx.beginPath();
  ctx.moveTo(-22, -150);
  ctx.lineTo(18, -150);
  ctx.lineTo(-30 + sw * 20, -20);
  ctx.lineTo(-52 + sw * 30, -40);
  ctx.lineTo(-70 + sw * 36, -14);
  ctx.lineTo(-84 + sw * 40, -50);
  ctx.closePath();
  paint(ctx, BONE.cape, -150, 140);
  // Back arm.
  limb(ctx, -20, -146, rig.armB, 34, 32, 0.25, 12, BONE.bone);
  circle(ctx, 0, 0, 7, BONE.bone);
  ctx.restore();
  // Legs.
  for (const [x, angle] of [[-12, leg.back], [12, leg.front]]) {
    limb(ctx, x, -72, angle, 34, 32, leg.bend, 12, BONE.bone);
    rrect(ctx, -8, -3, 30, 11, 4, BONE.bone);
    ctx.restore();
  }
  // Pelvis, spine, ribs, shoulders.
  ctx.save();
  ctx.translate(0, -70);
  ctx.rotate(rig.lean);
  rrect(ctx, -24, -14, 48, 24, 9, BONE.bone);
  rrect(ctx, -5, -84, 10, 74, 4, BONE.shade);
  for (let i = 0; i < 3; i++) rrect(ctx, -28, -80 + i * 22, 56, 13, 6, BONE.bone);
  circle(ctx, -22, -88, 9, BONE.bone);
  circle(ctx, 22, -88, 9, BONE.bone);
  // Skull.
  rrect(ctx, -4, -104, 8, 16, 3, BONE.shade);
  ctx.save();
  ctx.translate(4, -134);
  circle(ctx, 0, 0, 30, BONE.bone);
  skullFace(ctx, face, glow);
  shine(ctx, -12, -14, 8, 4, 0.3);
  ctx.restore();
  ctx.restore();
  // Front arm with the rusty sword (plus trail).
  const trail = dyn?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    limbTransform(ctx, 20, -146, trail[i], 34, 30, 0.25);
    ctx.globalAlpha = 0.5 - i * 0.12;
    drawSkelSword(ctx, true);
    ctx.restore();
  }
  limb(ctx, 20, -146, rig.armF, 34, 30, 0.25, 12, BONE.bone);
  circle(ctx, 0, 0, 7, BONE.bone);
  ctx.rotate(-rig.weapon);
  drawSkelSword(ctx);
  ctx.restore();
  ctx.restore();
}

// ---- the dragonling ----

const DRAGON = { body: '#7c4dff', dark: '#5a2fb8', belly: '#ffd86b', wing: '#4a2490', claw: '#f4f6ff', horn: '#e8e6dc', eye: '#ffd86b', fire: '#ff8c42' };

function dragonFace(ctx, face, glow) {
  // Head-local: snout points to +x.
  const eyeColor = glow > 0.5 ? DRAGON.fire : DRAGON.eye;
  const ry = face === 'shock' ? 14 : face === 'angry' ? 7 : 11;
  ctx.beginPath();
  ctx.ellipse(8, -8, 12, ry, 0, 0, TAU);
  paint(ctx, eyeColor, -8 - ry, 2 * ry);
  if (face === 'hurt') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, -14);
    ctx.lineTo(14, -2);
    ctx.moveTo(14, -14);
    ctx.lineTo(2, -2);
    ctx.stroke();
  } else {
    ctx.fillStyle = OUTLINE;
    rrect(ctx, 7, -8 - ry * 0.8, 4, ry * 1.6, 2, OUTLINE, false);
  }
  if (face === 'angry') {
    ctx.fillStyle = DRAGON.dark;
    ctx.beginPath();
    ctx.moveTo(-8, -22);
    ctx.lineTo(24, -16);
    ctx.lineTo(24, -8);
    ctx.lineTo(-8, -14);
    ctx.closePath();
    ctx.fill();
  }
  // Nostrils and teeth along the snout.
  ctx.fillStyle = OUTLINE;
  for (const y of [2, 10]) {
    ctx.beginPath();
    ctx.arc(60, y, 2.5, 0, TAU);
    ctx.fill();
  }
  for (const x of [28, 40, 52]) {
    ctx.beginPath();
    ctx.moveTo(x - 4, 16);
    ctx.lineTo(x + 4, 16);
    ctx.lineTo(x, face === 'happy' || face === 'shock' ? 26 : 22);
    ctx.closePath();
    paint(ctx, DRAGON.claw, 16, 10);
  }
  if (face === 'happy') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(40, 12, 20, 0.2, Math.PI - 0.6);
    ctx.stroke();
  }
}

function drawClaw(ctx, ghost = false) {
  ctx.save();
  if (ghost) ctx.globalAlpha *= 0.14;
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(k * 9 - 6, 0);
    ctx.lineTo(k * 9 + 6, 0);
    ctx.quadraticCurveTo(k * 14 + 8, 26, k * 16, 44);
    ctx.quadraticCurveTo(k * 14 - 8, 26, k * 9 - 6, 0);
    ctx.closePath();
    paint(ctx, DRAGON.claw, 0, 44, !ghost);
  }
  ctx.restore();
}

function drawDragon(ctx, home, rig, time, dyn) {
  begin(ctx, home, rig, time);
  const face = rig.face ?? 'calm';
  const leg = legs(rig, dyn, time);
  const glow = Math.max(0, Math.min(1, rig.glow ?? 0));
  const sw = dyn?.swing ?? 0;
  const flap = Math.sin(time / 260) * 14;
  if (glow > 0) {
    const aura = ctx.createRadialGradient(0, -130, 30, 0, -130, 240);
    aura.addColorStop(0, `rgba(255, 140, 66, ${0.45 * glow * (0.8 + 0.2 * Math.sin(time / 110))})`);
    aura.addColorStop(1, 'rgba(255, 140, 66, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-260, -380, 520, 430);
  }
  // Tail, swaying with the spring.
  ctx.lineCap = 'round';
  for (const [w, color] of [[30, OUTLINE], [24, DRAGON.body]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(-30, -50);
    ctx.quadraticCurveTo(-100 + sw * 20, -30, -140 + sw * 40, -90 + Math.abs(sw) * 20);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-150 + sw * 40, -80 + Math.abs(sw) * 20);
  ctx.lineTo(-128 + sw * 40, -104 + Math.abs(sw) * 20);
  ctx.lineTo(-118 + sw * 40, -78 + Math.abs(sw) * 20);
  ctx.closePath();
  paint(ctx, DRAGON.belly, -104, 30);
  // Wings behind the body.
  for (const [ox, oy, dir] of [[-24, -150, 1], [-8, -140, 0.8]]) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - 70 * dir, oy - 90 - flap * dir);
    ctx.lineTo(ox - 96 * dir, oy - 20 - flap * dir * 0.5);
    ctx.lineTo(ox - 60 * dir, oy + 10);
    ctx.closePath();
    paint(ctx, DRAGON.wing, oy - 100, 120);
  }
  // Back arm with a claw.
  limb(ctx, -30, -156, rig.armB, 34, 30, 0.3, 20, DRAGON.body);
  drawClaw(ctx);
  ctx.restore();
  // Legs with talons.
  for (const [x, angle] of [[-22, leg.back], [22, leg.front]]) {
    limb(ctx, x, -76, angle, 36, 32, leg.bend, 24, DRAGON.body);
    rrect(ctx, -16, -4, 42, 16, 6, DRAGON.dark);
    for (const tx of [6, 18, 30]) {
      ctx.beginPath();
      ctx.moveTo(tx - 5, 10);
      ctx.lineTo(tx + 5, 10);
      ctx.lineTo(tx + 2, 20);
      ctx.closePath();
      paint(ctx, DRAGON.claw, 10, 10);
    }
    ctx.restore();
  }
  // Torso with belly plates.
  ctx.save();
  ctx.translate(0, -72);
  ctx.rotate(rig.lean);
  rrect(ctx, -44, -132, 88, 134, 32, DRAGON.body);
  for (let i = 0; i < 4; i++) rrect(ctx, -26, -116 + i * 27, 52, 16, 8, DRAGON.belly);
  shine(ctx, -26, -118, 10, 5, 0.2);
  // Neck and head.
  rrect(ctx, -12, -150, 24, 22, 8, DRAGON.body);
  ctx.save();
  ctx.translate(8, -180);
  rrect(ctx, -36, -30, 72, 60, 20, DRAGON.body);
  rrect(ctx, 22, -12, 48, 32, 12, DRAGON.body);
  for (const [hx, hy] of [[-22, -30], [-6, -34]]) {
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy);
    ctx.lineTo(hx + 6, hy);
    ctx.lineTo(hx - 10 + sw * 3, hy - 26);
    ctx.closePath();
    paint(ctx, DRAGON.horn, hy - 26, 26);
  }
  dragonFace(ctx, face, glow);
  ctx.restore();
  ctx.restore();
  // Front arm with the big claw (plus trail).
  const trail = dyn?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    limbTransform(ctx, 30, -156, trail[i], 36, 32, 0.25);
    ctx.globalAlpha = 0.5 - i * 0.12;
    drawClaw(ctx, true);
    ctx.restore();
  }
  limb(ctx, 30, -156, rig.armF, 36, 32, 0.25, 20, DRAGON.body);
  ctx.rotate(-rig.weapon);
  drawClaw(ctx);
  ctx.restore();
  ctx.restore();
}
