// The frame-rate governor (0.53): keeps the game at a steady frame rate on any device, slow ones included,
// by stepping down (and back up) a ladder of cheaper ways to draw, least visible first.
//
// Each step is a tier, on top of the graphics preset (TIERS below): a little less resolution first, then
// lite shading (see lite.js: Phong, then Lambert, instead of the physically based materials), fewer
// particles, no bloom, ray tracing or shadows, less resolution again, and last a shorter view. The
// governor watches the time between frames (about a second at a time, a frame over a second ignored: a
// shader compiling, the tab hidden) and moves:
//   - down when two windows in a row are below the tier's floor (DOWN: 40 fps for the first small cut in
//     resolution, then 24-26: comfortably above 18, so the slowest frames stay above 18 too, and the look
//     only changes when it has to); two steps at once when far below;
//   - up when five windows in a row have plenty of room (UP: enough that the tier above should still
//     be over its floor), unless the tier above failed lately (it waits 25 s, then 50, 100...);
//   - back up if a step down didn't make it faster (a device slow at its game logic, not its drawing:
//     a plainer picture wouldn't help), and no further down for a minute (then two, four...). It judges a
//     single step by the middle one of the three windows after the first (the first can hold a hitch: new
//     shaders), and doesn't step again meanwhile unless far below; a big step (far below) isn't judged.
// It remembers where it settled (per preset) for next time.

// cull: skip what would be drawn smaller than this many pixels across (lite.js)
export const TIERS = [
  { res: 1, lite: 0, fx: 1, view: 1, extras: true, shadows: true, cull: 1 },        // 0: the preset as it is
  { res: 0.85, lite: 0, fx: 1, view: 1, extras: true, shadows: true, cull: 1 },     // 1
  { res: 0.85, lite: 1, fx: 0.8, view: 1, extras: false, shadows: true, cull: 1.5 },  // 2: Phong, no bloom / ray tracing / sun shafts
  { res: 0.72, lite: 1, fx: 0.7, view: 1, extras: false, shadows: true, cull: 1.5 },  // 3
  { res: 0.72, lite: 2, fx: 0.6, view: 1, extras: false, shadows: false, cull: 2 }, // 4: Lambert, no shadow map
  { res: 0.6, lite: 2, fx: 0.5, view: 1, extras: false, shadows: false, cull: 2 },  // 5
  { res: 0.5, lite: 2, fx: 0.45, view: 0.85, extras: false, shadows: false, cull: 2.5 }, // 6
  { res: 0.42, lite: 2, fx: 0.4, view: 0.7, extras: false, shadows: false, cull: 3 }, // 7
  { res: 0.36, lite: 2, fx: 0.35, view: 0.6, extras: false, shadows: false, cull: 3 }, // 8
];
const DOWN = [40, 26, 24, 24, 24, 24, 23, 22, 0];
const UP = [Infinity, 55, 50, 34, 32, 36, 36, 34, 32]; // to go from tier t to t - 1

export class Governor {
  constructor({ start = 0, onChange = () => {} } = {}) {
    this.tier = Math.max(0, Math.min(TIERS.length - 1, start | 0));
    this.onChange = onChange;
    this.on = true;
    this.win = { t: 0, n: 0 };
    this.low = 0; this.high = 0;
    this.blockUntil = new Array(TIERS.length).fill(0); this.blockFor = new Array(TIERS.length).fill(25);
    this.clock = 0; this.fps = 60; this.lastMove = 0; this.history = [];
    this.check = null; this.noGainUntil = 0; this.noGainFor = 60; this.lowF = []; // (did the last step down help?)
  }
  get spec() { return TIERS[this.tier]; }
  // A frame was drawn, `dt` seconds after the one before (the real time).
  frame(dt) {
    if (!(dt > 0)) return;
    this.clock += Math.min(dt, 1);
    if (dt > 1) return; // (a hitch: a shader compiling, the tab in the background)
    const w = this.win;
    w.t += dt; w.n++;
    if (w.t < 0.8 || w.n < 6) return;
    const fps = w.n / w.t;
    this.fps = fps;
    w.t = 0; w.n = 0;
    if (!this.on) return;
    const t = this.tier;
    const far = fps < DOWN[t] * 0.6;
    const c = this.check;
    if (c && ++c.n >= 2) { // a single step down: was it worth it?
      c.f.push(fps);
      if (c.f.length >= 3) {
        this.check = null;
        const mid = c.f.sort((a, b) => a - b)[1];
        if (mid < c.before * 1.04 && t > c.from) {
          this.noGainUntil = this.clock + this.noGainFor; this.noGainFor = Math.min(480, this.noGainFor * 2);
          this.low = this.high = 0; this.lowF.length = 0; this._move(c.from, mid); return;
        }
      }
    }
    if (fps < DOWN[t] && !far && (this.clock < this.noGainUntil || this.check)) { this.low = 0; this.lowF.length = 0; return; } // (no help in stepping down / still judging the last step)
    if (fps < DOWN[t]) { this.low++; this.high = 0; this.lowF.push(fps); } else if (fps > UP[t]) { this.high++; this.low = 0; this.lowF.length = 0; } else { this.low = 0; this.high = 0; this.lowF.length = 0; }
    if (this.low >= 2 || (far && this.low >= 1)) {
      const by = far ? 2 : 1;
      if (t < TIERS.length - 1) {
        // the tier it's leaving failed: don't come back to it for a while (longer each time)
        this.blockUntil[t] = this.clock + this.blockFor[t]; this.blockFor[t] = Math.min(400, this.blockFor[t] * 2);
        this._move(Math.min(TIERS.length - 1, t + by), fps);
        const before = this.lowF.reduce((a, b) => a + b, 0) / this.lowF.length;
        this.check = by === 1 ? { from: t, before, n: 0, f: [] } : null;
      }
      this.low = 0; this.lowF.length = 0;
    } else if (this.high >= 5 && t > 0 && this.clock >= this.blockUntil[t - 1]) {
      this._move(t - 1, fps);
      this.high = 0;
    }
  }
  set(tier, quiet = false) { this.tier = Math.max(0, Math.min(TIERS.length - 1, tier | 0)); this.low = this.high = 0; this.lastMove = this.clock; if (!quiet) this.onChange(this.tier, TIERS[this.tier]); }
  _move(tier, fps) {
    this.history.push([Math.round(this.clock * 10) / 10, this.tier, tier, Math.round(fps * 10) / 10]);
    if (this.history.length > 40) this.history.shift();
    this.tier = tier; this.lastMove = this.clock;
    this.onChange(tier, TIERS[tier]);
  }
}
