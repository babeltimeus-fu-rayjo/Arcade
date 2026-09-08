import { createRng, randomSeed } from '../../shared/rng.js';
import { KNOB_DEPTH, gridFor, makeEdges, piecePath } from './pieces.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * The puzzle itself, drawn on one canvas: a frame where the picture belongs,
 * loose pieces scattered around it, drag with mouse/touch/pen, and snapping
 * into place. Emits: setup, start, move {moves}, place {placed,total}, complete {elapsedMs, moves}.
 */
export class Puzzle extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hitCtx = document.createElement('canvas').getContext('2d'); // identity transform, for isPointInPath
    this.image = null;
    this.pieces = [];
    this.loose = []; // draw order, last on top
    this.frame = { x: 0, y: 0, w: 0, h: 0 };
    this.size = { w: 0, h: 0, dpr: 1 };
    this.guide = true;
    this.peek = false;
    this.drag = null;
    this.complete = false;
    this.placed = 0;
    this.moves = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this._bind();
  }

  /** Start a fresh puzzle from a loaded image. */
  setup({ image, pieces, guide = true, seed = randomSeed() }) {
    this.image = image;
    this.guide = guide;
    this.seed = seed;
    this.rng = createRng(seed);
    this.aspect = image.naturalWidth / image.naturalHeight || 1.5;
    const grid = gridFor(pieces, this.aspect);
    this.rows = grid.rows;
    this.cols = grid.cols;
    this.edges = makeEdges(this.rows, this.cols, this.rng);
    this.pieces = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.pieces.push({ r, c, x: 0, y: 0, locked: false, path: null, sprite: null, pad: 0 });
    }
    this.loose = [...this.pieces];
    for (let i = this.loose.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [this.loose[i], this.loose[j]] = [this.loose[j], this.loose[i]];
    }
    this.placed = 0;
    this.moves = 0;
    this.complete = false;
    this.startedAt = null;
    this.finishedAt = null;
    this.drag = null;
    this.layout(true);
    this.render();
    this._emit('setup', { rows: this.rows, cols: this.cols, total: this.pieces.length });
  }

  get total() {
    return this.pieces.length;
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    return (this.finishedAt ?? performance.now()) - this.startedAt;
  }

  setGuide(on) {
    this.guide = on;
    this.render();
  }

  setPeek(on) {
    this.peek = on;
    this.render();
  }

  resize() {
    if (!this.image) return;
    this.layout(false);
    this.render();
  }

  // ---- layout ----

  layout(scatter) {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const previous = { ...this.frame };
    const a = this.aspect;
    let fw;
    let fy;
    if (W < H) {
      fw = Math.min(W * 0.9, H * 0.5 * a); // portrait: picture on top, pieces below
      fy = H * 0.05;
    } else {
      fw = Math.min(W * 0.6, H * 0.8 * a); // landscape: picture in the middle, pieces around
      fy = (H - fw / a) / 2;
    }
    const fh = fw / a;
    this.frame = { x: (W - fw) / 2, y: fy, w: fw, h: fh };
    this.size = { w: W, h: H, dpr };
    this.pw = fw / this.cols;
    this.ph = fh / this.rows;
    this.s = Math.min(this.pw, this.ph);
    this.pad = Math.ceil(KNOB_DEPTH * this.s + 3);
    this.buildSprites();

    if (scatter) {
      this.scatter();
    } else if (previous.w) {
      const k = fw / previous.w;
      for (const p of this.pieces) {
        if (p.locked) continue;
        p.x = this.frame.x + (p.x - previous.x) * k;
        p.y = this.frame.y + (p.y - previous.y) * k;
        this.clampPiece(p);
      }
    }
  }

  /** Pre-render every piece (picture clipped to its outline, with a bevelled edge). */
  buildSprites() {
    const { image, pw, ph, pad } = this;
    const dpr = this.size.dpr;
    const sx = image.naturalWidth / this.frame.w; // image pixels per board pixel
    const sy = image.naturalHeight / this.frame.h;
    const sw = pw + 2 * pad;
    const sh = ph + 2 * pad;
    for (const p of this.pieces) {
      p.path = piecePath(pw, ph, this.edges.of(p.r, p.c));
      p.pad = pad;
      const sprite = document.createElement('canvas');
      sprite.width = Math.ceil(sw * dpr);
      sprite.height = Math.ceil(sh * dpr);
      const g = sprite.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.translate(pad, pad);
      g.save();
      g.clip(p.path);
      drawImageClamped(g, image, (p.c * pw - pad) * sx, (p.r * ph - pad) * sy, sw * sx, sh * sy, -pad, -pad, sw, sh);
      g.restore();
      g.lineJoin = 'round';
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      g.stroke(p.path);
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      g.stroke(p.path);
      p.sprite = sprite;
    }
  }

  /** Spread loose pieces over the free space around the frame. */
  scatter() {
    const { w: W, h: H } = this.size;
    const f = this.frame;
    const { pw, ph, pad } = this;
    const gap = this.s * 0.3;
    const regions = [];
    const add = (x0, y0, x1, y1) => {
      const w = x1 - x0 - pw;
      const h = y1 - y0 - ph;
      if (w > 0 && h > 0) regions.push({ x0, y0, w, h, area: w * h });
    };
    add(pad, pad, f.x - gap, H - pad); // left
    add(f.x + f.w + gap, pad, W - pad, H - pad); // right
    add(f.x - gap, pad, f.x + f.w + gap, f.y - gap); // above
    add(f.x - gap, f.y + f.h + gap, f.x + f.w + gap, H - pad); // below
    if (!regions.length) regions.push({ x0: pad, y0: pad, w: Math.max(1, W - pw - 2 * pad), h: Math.max(1, H - ph - 2 * pad), area: 1 });
    const total = regions.reduce((sum, r) => sum + r.area, 0);
    for (const p of this.loose) {
      let pick = this.rng.next() * total;
      let region = regions[regions.length - 1];
      for (const r of regions) {
        if (pick < r.area) {
          region = r;
          break;
        }
        pick -= r.area;
      }
      p.x = region.x0 + this.rng.next() * region.w;
      p.y = region.y0 + this.rng.next() * region.h;
      p.locked = false;
    }
  }

  clampPiece(p) {
    p.x = clamp(p.x, -this.pw * 0.5, this.size.w - this.pw * 0.5);
    p.y = clamp(p.y, -this.ph * 0.5, this.size.h - this.ph * 0.5);
  }

  // ---- drawing ----

  render() {
    const { ctx } = this;
    const { w: W, h: H } = this.size;
    const f = this.frame;
    ctx.clearRect(0, 0, W, H);
    if (!this.image) return;

    ctx.save();
    roundRect(ctx, f.x - 6, f.y - 6, f.w + 12, f.h + 12, 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.stroke();
    ctx.restore();

    if (this.complete || this.peek || this.guide) {
      ctx.save();
      ctx.globalAlpha = this.complete ? 1 : this.peek ? 0.92 : 0.16;
      ctx.drawImage(this.image, f.x, f.y, f.w, f.h);
      ctx.restore();
    }
    if (this.complete) return;

    for (const p of this.pieces) if (p.locked) this.drawPiece(p);
    for (const p of this.loose) if (!p.locked) this.drawPiece(p, p === this.drag?.piece);
  }

  drawPiece(p, lifted = false) {
    const { ctx } = this;
    ctx.save();
    if (lifted) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
    }
    ctx.drawImage(p.sprite, p.x - p.pad, p.y - p.pad, this.pw + 2 * p.pad, this.ph + 2 * p.pad);
    ctx.restore();
  }

  // ---- interaction ----

  pointAt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.size.w / Math.max(1, r.width)),
      y: (e.clientY - r.top) * (this.size.h / Math.max(1, r.height)),
    };
  }

  /** Topmost loose piece under a board point, tested against its real outline. */
  pieceAt(x, y) {
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const p = this.loose[i];
      if (!p.locked && this.hitCtx.isPointInPath(p.path, x - p.x, y - p.y)) return p;
    }
    return null;
  }

  targetOf(p) {
    return { x: this.frame.x + p.c * this.pw, y: this.frame.y + p.r * this.ph };
  }

  /** Lock a piece if it was dropped close enough to its spot. Returns true when it snapped. */
  trySnap(p) {
    const t = this.targetOf(p);
    if (Math.hypot(p.x - t.x, p.y - t.y) > this.s * 0.4) return false;
    p.x = t.x;
    p.y = t.y;
    p.locked = true;
    this.loose.splice(this.loose.indexOf(p), 1);
    this.placed++;
    this._emit('place', { placed: this.placed, total: this.total, piece: p });
    if (this.placed === this.total) {
      this.complete = true;
      this.finishedAt = performance.now();
      this._emit('complete', { elapsedMs: this.elapsedMs, moves: this.moves, total: this.total });
    }
    return true;
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.complete || !this.image) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const { x, y } = this.pointAt(e);
      const p = this.pieceAt(x, y);
      if (!p) return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events have no capturable pointer */
      }
      this.drag = { piece: p, id: e.pointerId, dx: x - p.x, dy: y - p.y };
      this.loose.splice(this.loose.indexOf(p), 1);
      this.loose.push(p); // bring to the top
      if (!this.startedAt) {
        this.startedAt = performance.now();
        this._emit('start');
      }
      this.render();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const { x, y } = this.pointAt(e);
      const p = this.drag.piece;
      p.x = x - this.drag.dx;
      p.y = y - this.drag.dy;
      this.clampPiece(p);
      this.render();
    });
    const release = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const p = this.drag.piece;
      this.drag = null;
      this.moves++;
      this.trySnap(p);
      this.render();
      this._emit('move', { moves: this.moves });
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** drawImage that never asks for source pixels outside the image (some browsers misdraw those). */
function drawImageClamped(g, image, sx, sy, sw, sh, dx, dy, dw, dh) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(iw, sx + sw);
  const y1 = Math.min(ih, sy + sh);
  if (x1 <= x0 || y1 <= y0) return;
  const kx = dw / sw;
  const ky = dh / sh;
  g.drawImage(image, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
}
