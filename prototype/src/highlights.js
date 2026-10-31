// Highlight reels (0.36; shot like a sports replay since 0.37). While a match vs bots plays, the game
// records what you could see, 15 times a second: every Titan's pose (where it is and faces, its aim,
// moving, gliding, dashing, charging, what it holds), every flying food, every burst and every sound;
// and each throw's flight, 30 times a second, from the hand to where it lands. It also scores the
// moments worth seeing again:
//   - splats: knockouts by a throw or an ability; more for a long throw, a headshot, a double or
//     triple splat (one Titan splatting several in a few seconds), and the splat that won the match;
//   - snipes: a hit by a throw that flew 30 m or more (along its flight, every climb and drop
//     counted; a snipe splat if it knocked them out);
//   - dodges: a dangerous throw passing within a metre of a Titan who was running, dashing or in the
//     air, and missing (a double dodge when two come close together);
//   - big hits (your reel only, to fill it out): a hit of 30 or more, or a headshot.
// Only the frames around those moments are kept (plus the last 9 s), so a long match stays small.
//
// At the end a reel plays the best of them back, best last, shot to show the whole play:
//   - a long throw (13 m or more): over the thrower's shoulder as they let go, then the camera rides
//     along behind the food itself, in slow motion that gets slower as it closes in, and lets it fly
//     the last few metres into its target alone; a glowing trail draws the arc and a counter the
//     distance; then the reverse angle, from behind the one it hit back along the arc to the thrower;
//   - a closer play: a wide shot from beside them that keeps thrower and target in frame, drifting
//     round them and slowing down into the impact;
//   - a dodge: bullet time, circling the dodger as the throw goes by;
//   - every impact: a freeze, a flash, a shockwave, a punch of the lens, a boom and a big word; then
//     a low "hero" shot of whoever made the play, looking past them at what they did (the winning
//     splat craning up over the arena).
// A splat (0.46) opens with the hits that wore them down: up to 3 of the foods that hit them in the
// 8 s before, in quick cuts close on them as each one flies in and bursts (the damage it did on
// screen), then the splat itself.
// Letterbox bars, a caption per play, a title card before the best play. Two reels: the whole match
// ("Match highlights"), and only your own plays ("Your highlights"). While a reel plays the match is
// frozen; afterwards everything is put back.
//
// Online (0.38) each player's game records the round as it saw it (hits on other players as it
// showed them, knockouts as the room reported them), and when a round ends a short "Round
// highlights" reel plays (the best plays, always with your best one). The match can't wait for
// one player there, so it goes on underneath: every frame the reel poses the recording for the
// frame that's drawn, then puts the live match back (see Reel.unpose). The host starts the next
// round once everyone has watched or skipped (or after REEL_WAIT in game.js).
import * as THREE from 'three';
import { clamp, damp, lerp, raycastWorld, segSegDist2, angleLerp, forwardOf, FLOOR_Y } from './core.js';
import { FOODS, FOOD_IDS } from './foods.js';
import { PALETTE } from './fx.js';
import { UTENSIL_IDS, UTENSIL_BY_ID, utensilIcon } from './utensils.js';
import { SPIKE_GAP, ULT_COLOR } from './abilities.js';
import { drawStream } from './legendary.js';

const HZ = 15;                // frames a second
const K = 14;                 // numbers per Titan per frame: x y z yaw pitch vx vy vz flags charge armT held hitFlash utensil
const FL = { alive: 1, ground: 2, glide: 4, dash: 8, trip: 16, frozen: 32, rooted: 64, charging: 128, shield: 256, eating: 512, burning: 1024 };
const KEEP = 9;               // seconds of the latest frames always kept (a throw can fly for 6 s)
const SNIPE = 30;             // metres: a hit by a throw that flew this far is a snipe
const LONG = 13;              // metres: a hit from this far is followed through the air
const DODGE_R = 1.1;          // a dangerous throw passing this close to a Titan's body (and missing) is a dodge
const HELD = [...FOOD_IDS, 'peel'];
const MAX_MOMENTS = 90;
const PATH_MAX = 4 * 240;     // numbers kept per flight path: its last 8 s
const TRAIL_N = 150;          // points along a trail
const PRE_N = 3, PRE_BACK = 8, PRE_GAP = 0.6, PRE_MIN = 4; // (0.46) the lead-up: at most 3 hits, from the last 8 s, 0.6 s apart, 4 damage or more
const PRE_IN = 0.5, PRE_OUT = 0.32; // ... each shown from this long before it lands to this long after
const KO_HOLD = 0.22;         // seconds a splatted Titan stays in the replay after the hit (squashing flat), so you see it land
const UP = new THREE.Vector3(0, 1, 0), WHITE = new THREE.Color('#ffffff'), RING = new THREE.Color('#fff1c2'), _col = new THREE.Color();

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ea = new THREE.Euler(), _eb = new THREE.Euler();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const foodName = (id) => (FOODS[id]?.name || '').replace(/ies$/, 'y').replace(/s$/, '');
const danger = (food) => FOODS[food]?.dmg ?? 25; // (most foods work out their damage as they land)
const mult = (n) => ['', '', 'Double', 'Triple', 'Quadruple'][n] || `${n}x`;
// each food's splash (fx.js bursts), for the knockout's big one
const BURST = { tomato: 'tomato', banana: 'banana', carrot: 'carrot', ice: 'ice', soda: 'soda', cheese: 'cheese', grapes: 'grape', grape: 'grape', chili: 'fire', cookie: 'crumb', watermelon: 'melon', melonchunk: 'melon', pineapple: 'pine', jelly: 'jelly', blueberry: 'berry', berry: 'berry' };
// (0.50) a splat by an ability (its damage's name): what it's called, its colour, the big word
const ABILITY = {
  storm: ['Ice Storm', ULT_COLOR.ice, 'Blizzard!'], spikes: ['Spike Line', ULT_COLOR.pineapple, 'Skewered!'],
  flames: ['Flamethrower', ULT_COLOR.chili, 'Toasted!'], tslam: ['Tomato Dash', ULT_COLOR.tomato, 'Slammed!'],
  smash: ['Melon Smash', ULT_COLOR.watermelon, 'Smashed!'], megajump: ['Mega Jump', ULT_COLOR.soda, 'Stomped!'],
  juice: ['Juice Ball', ULT_COLOR.grapes, 'Juiced!'], warp: ['Teleport', ULT_COLOR.carrot, 'Warped!'],
};
const dirOf = (az, el, out) => out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
// a Titan's colour made bright and saturated (a trail that shows up on a cream table)
const vivid = (css) => { const c = new THREE.Color(css || '#ffd447'), h = {}; c.getHSL(h); return c.setHSL(h.h, Math.max(0.75, h.s), clamp(h.l, 0.52, 0.6)); };
// one Titan in two frames: alive in both and not teleported (a respawn) between them
const linked = (A, B, o) => (A[o + 8] & B[o + 8] & FL.alive) !== 0 && Math.hypot(B[o] - A[o], B[o + 2] - A[o + 2]) < 8;
// Slow motion along a followed throw: quicker as it leaves the hand, slower and slower as it closes in.
const bulletShape = (u) => 1.8 - 1.45 * smooth(u);
const BULLET_C = (() => { let s = 0; for (let i = 0; i < 64; i++) s += 1 / bulletShape((i + 0.5) / 64); return s / 64; })();

// ---------------------------------------------------------------------------------------------
// A flight path { s: [t, x, y, z, ...], orient, food }: the launch point, where the food was after
// every step, and where it hit. Read back as a smooth curve through them (for slow motion).
function pathIdx(s, t) {
  let lo = 0, hi = s.length / 4 - 1;
  if (t <= s[0]) return 0;
  if (t >= s[hi * 4]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid * 4] <= t) lo = mid; else hi = mid; }
  return lo;
}
function slope(s, i, c, n) {
  const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
  return (s[b * 4 + c] - s[a * 4 + c]) / Math.max(1e-6, s[b * 4] - s[a * 4]);
}
function pathAt(P, t, out, vel = null) {
  const s = P.s, n = s.length / 4;
  if (n < 2) { out.set(s[1], s[2], s[3]); vel?.set(0, 0, 0); return out; }
  const i = Math.min(pathIdx(s, t), n - 2), j = i + 1;
  const t0 = s[i * 4], h = Math.max(1e-6, s[j * 4] - t0);
  const u = clamp((t - t0) / h, 0, 1), u2 = u * u, u3 = u2 * u;
  for (let c = 1; c <= 3; c++) {
    const p0 = s[i * 4 + c], p1 = s[j * 4 + c], m0 = slope(s, i, c, n) * h, m1 = slope(s, j, c, n) * h;
    out.setComponent(c - 1, (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * m1);
    if (vel) vel.setComponent(c - 1, ((6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * m0 + (6 * u - 6 * u2) * p1 + (3 * u2 - 2 * u) * m1) / h);
  }
  return out;
}
const pathEnd = (P) => P.s[P.s.length - 4];
// (0.40) How far a food has flown along its path by time t: every climb and every drop counts.
function flownTo(P, t) {
  const s = P.s;
  let d = 0;
  for (let k = 4; k < s.length; k += 4) {
    const seg = Math.hypot(s[k + 1] - s[k - 3], s[k + 2] - s[k - 2], s[k + 3] - s[k - 1]);
    if (s[k] <= t) { d += seg; continue; }
    d += seg * clamp((t - s[k - 4]) / Math.max(1e-6, s[k] - s[k - 4]), 0, 1);
    break;
  }
  return d;
}

// The nearest scenery outline (the world's sightBoxes: min xyz, max xyz) along a ray, ignoring any it
// starts inside. Some decorations aren't solid, so a camera checking only raycastWorld sees through them.
function boxHit(B, o, d, max) {
  let best = max;
  if (!B) return best;
  const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
  for (let i = 0; i < B.length; i += 6) {
    if (o.x >= B[i] && o.x <= B[i + 3] && o.y >= B[i + 1] && o.y <= B[i + 4] && o.z >= B[i + 2] && o.z <= B[i + 5]) continue;
    let t0 = (B[i] - o.x) * ix, t1 = (B[i + 3] - o.x) * ix;
    let lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    t0 = (B[i + 1] - o.y) * iy; t1 = (B[i + 4] - o.y) * iy;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    t0 = (B[i + 2] - o.z) * iz; t1 = (B[i + 5] - o.z) * iz;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (hi >= lo && lo >= 0 && lo < best) best = lo;
  }
  return best;
}

export class Highlights {
  constructor(game) {
    this.game = game;
    this.on = false;            // recording
    this.playing = null;        // the reel playing now
    this.frames = []; this.events = []; this.moments = [];
    this.actors = []; this.idx = new Map(); this.meta = [];
    this.nextPid = 1; this.sampleAt = 0; this.pruneAt = 0; this.lastStep = 0;
    this.lastHit = new Map();   // victim -> the last hit on them
    this.hitLog = new Map();    // (0.46) victim -> their latest hits (for a splat's lead-up)
    this.pending = null;        // the throw hitting someone this instant (its damage follows)
    // every burst and sound, so a replay looks and sounds like the match
    const fx = game.fx, sfx = game.sfx;
    const burst = fx.burst.bind(fx), play = sfx.play.bind(sfx);
    // (the match's own, not a reel's replay of them; under an online reel the live match's aren't shown)
    fx.burst = (kind, pos, power) => {
      const R = this.playing;
      if (this.rec && pos && !R?.emitting) this.events.push({ t: game.time, fx: kind, x: pos.x, y: pos.y, z: pos.z, p: power });
      if (R?.live && !R.emitting) return;
      return burst(kind, pos, power);
    };
    sfx.play = (name, pos, gain) => {
      const R = this.playing;
      if (this.rec && !R?.emitting) this.events.push({ t: game.time, sfx: name, pos: pos ? [pos.x, pos.y, pos.z] : null, g: gain });
      if (R?.live && !R.emitting) return;
      return play(name, pos, gain);
    };
    // (0.50) every puddle, rink and patch on the floor (soda, ice, melted cheese, a Juice Ball's...)
    const S = game.surface, addZone = S._addZone.bind(S);
    S._addZone = (x, y, z, r, look, now, duration) => {
      if (this.rec && !this.playing?.emitting) this.events.push({ t: game.time, pud: look, x, y, z, r, end: game.time + duration });
      return addZone(x, y, z, r, look, now, duration);
    };
  }
  // (0.50) An ability's storm, spike line, ground fire or flamethrower starts.
  onAbility(kind, o) {
    if (!this.rec) return;
    const t = this.game.time;
    let e;
    if (kind === 'storm') e = { ab: kind, x: o.pos.x, y: o.pos.y, z: o.pos.z, r: o.r, end: o.until };
    else if (kind === 'flame') e = { ab: kind, x: o.pos.x, y: o.pos.y, z: o.pos.z, r: o.r, seed: o.seed, end: o.until };
    else if (kind === 'spikes') e = { ab: kind, pts: o.pts.map((sp) => [sp.p.x, sp.p.y, sp.p.z, sp.s, sp.tilt, sp.spin]), end: o.until };
    else if (kind === 'flamer') { if (!this.idx.has(o.owner)) return; e = { ab: kind, a: this.idx.get(o.owner), end: t + o.dur }; }
    else if (kind === 'stream') { if (!this.idx.has(o.owner)) return null; e = { ab: kind, a: this.idx.get(o.owner), u: o.u, food: o.food, end: t + 0.12 }; } // (0.54) a Legendary torch or blender
    else if (kind === 'wave') e = { ab: kind, x: o.pos.x, y: o.pos.y, z: o.pos.z, r: o.r, end: t + o.r / 12 + 0.1 }; // (0.54) a Legendary Ice Cream Machine's freeze wave
    else return null;
    e.t = t;
    this.events.push(e);
    return e;
  }
  // (0.50) A utensil's zone (a Whisk's vortex, a Mortar's cloud, a Deep Fryer's fire, a candy web) starts.
  onZone(z) {
    if (!this.rec) return;
    const e = { t: this.game.time, zone: z.kind, x: z.pos.x, y: z.pos.y, z: z.pos.z, r: z.r, tint: z.tint, dur: z.until - z.t0, end: z.until, wind: z.wind ? [z.wind.x, z.wind.z] : null };
    z.hl = e; // (its real end, if it goes early)
    this.events.push(e);
  }

  // ------------------------------------------------------------------ recording
  // Recording now: a match (or an online round) is on, and no reel has the match waiting.
  get rec() { return this.on && !(this.playing && !this.playing.live); }
  // A new match (or online round): record it.
  start() {
    this.stop();
    const g = this.game;
    this.frames = []; this.events = []; this.moments = [];
    this.lastHit.clear(); this.hitLog.clear(); this.pending = null;
    this.on = !!g.player;
    this.actors = [...g.actors];
    this.idx = new Map(this.actors.map((a, i) => [a, i]));
    this.meta = this.actors.map((a) => ({ name: a.name, color: a.color }));
    this.sampleAt = 0; this.pruneAt = g.time + 1; this.lastStep = g.time;
  }
  stopRecording() { this.on = false; }

  // Every simulation step (30 a second): each flight path, then dodges; a frame 15 times a second.
  step() {
    if (!this.rec) return;
    const g = this.game, t = g.time;
    this.stepDt = clamp(t - this.lastStep, 1 / 120, 1 / 15);
    this.lastStep = t;
    for (const p of g.projectiles.list) {
      const s = p.hl?.path?.s;
      if (!s || p.done) continue;
      if (t > s[s.length - 4] + 1e-4) s.push(t, p.pos.x, p.pos.y, p.pos.z);
      if (s.length > PATH_MAX) s.splice(0, 4 * 60);
    }
    this._watchDodges(t);
    if (t < this.sampleAt) return;
    this.sampleAt = t + 1 / HZ - 1e-4;
    // Titans who turned up since (online: players dropping in late, the host's bots on other screens)
    for (const a of g.actors) if (!this.idx.has(a)) { this.idx.set(a, this.actors.length); this.actors.push(a); this.meta.push({ name: a.name, color: a.color }); }
    const buf = new Float32Array(this.actors.length * K);
    this.actors.forEach((a, i) => {
      const o = i * K;
      buf[o] = a.pos.x; buf[o + 1] = a.pos.y; buf[o + 2] = a.pos.z;
      buf[o + 3] = a.yaw; buf[o + 4] = Math.asin(clamp(a.aimDir.y, -1, 1));
      buf[o + 5] = a.vel.x; buf[o + 6] = a.vel.y; buf[o + 7] = a.vel.z;
      let f = 0;
      if (a.alive) f |= FL.alive;
      if (a.onGround) f |= FL.ground;
      if (a.gliding) f |= FL.glide;
      if (a.dashT > 0) f |= FL.dash;
      if (a.isTripped()) f |= FL.trip;
      if (a.isFrozen()) f |= FL.frozen;
      if (a.isRooted()) f |= FL.rooted;
      if (a.charging) f |= FL.charging;
      if (a.shieldUp) f |= FL.shield;
      if (a.eat) f |= FL.eating;
      if (a.isBurning()) f |= FL.burning;
      buf[o + 8] = f;
      const food = a.selectedFood();
      buf[o + 9] = a.charging && food ? clamp(a.chargeT / Math.max(0.2, food.charge || 1), 0, 1) : 0;
      buf[o + 10] = a.armT;
      buf[o + 11] = HELD.indexOf(a.selected()?.id);
      buf[o + 12] = a.hitFlash;
      buf[o + 13] = UTENSIL_IDS.indexOf(a.utensil); // (0.50) the utensil in their hand
    });
    const proj = [];
    for (const p of g.projectiles.list) {
      if (p.done || !p.hl || !p.mesh?.visible) continue;
      const m = p.mesh;
      // (0.50) its whole shape (a Rolling Pin flattens it into a disc) and its utensil's coat
      proj.push([p.hl.id, p.food, m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z, m.userData.inner?.rotation.x || 0, m.scale.x, m.scale.y, m.scale.z, p.hl.u]);
    }
    this.frames.push({ t, a: buf, p: proj, tide: [g.tide.x, g.tide.z, g.tide.r] });
    if (t >= this.pruneAt) this._prune();
  }

  // Drop what no moment needs (older than KEEP and outside every moment's clip).
  _prune() {
    const t = this.game.time;
    this.pruneAt = t + 1;
    const from = t - KEEP;
    const wins = this.moments.map((m) => [m.t0 - 0.7, m.t1 + 0.7]);
    for (const m of this.moments) for (const p of m.pre || []) wins.push([p.ti - PRE_IN - 0.4, p.ti + PRE_OUT + 0.4]); // (a splat's lead-up)
    for (const c of this.playing?.clips || []) wins.push([c.t0 - 1, c.t1 + 2]); // (online, the reel playing over the match)
    this.actors.forEach((a, i) => { this.meta[i].name = a.name; this.meta[i].color = a.color; });
    const keep = (x) => x >= from || wins.some(([a, b]) => x >= a && x <= b);
    this.frames = this.frames.filter((f) => keep(f.t));
    this.events = this.events.filter((e) => keep(e.t) || (e.end && (e.end >= from || wins.some(([a, b]) => e.t <= b && e.end >= a)))); // (a puddle or zone that lasts into a clip)
  }

  onLaunch(p) {
    if (!this.rec) return;
    const g = this.game;
    // (0.50) a utensil's throw: which, how big a coat, and the bits of it that change its look
    const u = p.u ? { u: p.u, r: p.radius, x: { sm: p.x.sm ? 1 : 0, mx: p.x.mx || '', pp: p.x.pp ? 1 : 0 }, pel: /^(grape|berry)$/.test(p.food) } : null;
    p.hl = {
      id: this.nextPid++, t: g.time, from: (p.owner?.pos || p.pos).clone(), owner: p.owner, near: null, u, bank: 0, hits: 0,
      // its flight, from the hand (it left at the start of this step)
      path: { s: [g.time - (this.stepDt || 1 / 30), p.pos.x, p.pos.y, p.pos.z], orient: !!p.orient, food: p.food, u },
    };
  }

  // A throw hits a Titan (its damage, if any, follows in the same instant).
  onProjectileHit(p, a, head) {
    if (!this.rec || !p.hl || !p.owner || p.owner === a) return;
    const t = this.game.time, P = p.hl.path;
    let ti = t;
    if (P) { // where it touched them, and when (part way through this step)
      const s = P.s, n = s.length, last = s[n - 4];
      const d = Math.hypot(p.pos.x - s[n - 3], p.pos.y - s[n - 2], p.pos.z - s[n - 1]);
      ti = clamp(last + d / Math.max(1, p.vel.length()), last + 1e-3, Math.max(t, last + 1e-3));
      s.push(ti, p.pos.x, p.pos.y, p.pos.z);
    }
    // how far: the length of its flight, up and down included (0.40); else thrower to target
    const dist = P ? flownTo(P, ti) : p.hl.from.distanceTo(a.pos);
    p.hl.hits++; // (a piercing shot goes on through: the 2nd, 3rd Titan it skewers)
    this.pending = { victim: a, by: p.owner, t, launchT: p.hl.t, dist, pid: p.hl.id, head: !!head, food: p.food, path: P, ti, u: p.u || '', bank: p.hl.bank, nth: p.hl.hits };
  }

  // (online, a hit on another player is their game's to decide: this is the damage it showed here)
  onDamage(target, attacker, amt, foodId, opts = {}) {
    if (!this.rec || !attacker || attacker === target || !this.idx.has(attacker) || !this.idx.has(target)) return;
    const g = this.game;
    const pend = this.pending && this.pending.victim === target && this.pending.by === attacker && this.pending.t === g.time ? this.pending : null;
    const rec = pend ? { ...pend, amt } : { victim: target, by: attacker, t: g.time, launchT: null, dist: attacker.pos.distanceTo(target.pos), pid: 0, head: !!opts.head, food: foodId, amt, path: null, ti: g.time };
    this.lastHit.set(target, rec);
    const log = this.hitLog.get(target) || [];
    log.push(rec); if (log.length > 12) log.shift();
    this.hitLog.set(target, log);
    if (pend && rec.dist >= SNIPE && amt >= 14) this._snipe(rec); // (not a stray berry or grape)
    else if (attacker === g.player && (amt >= 30 || rec.head || (pend && this._trick(rec) && amt >= 12))) this._bigHit(rec); // (a trick shot is worth seeing)
  }

  _hit(rec) { return { tk: rec.t, tt: rec.launchT, ti: rec.ti ?? rec.t, b: this.idx.get(rec.victim), pid: rec.pid, path: rec.path || null, head: !!rec.head, dist: rec.dist, food: rec.food, u: rec.u || '', bank: rec.bank || 0, nth: rec.nth || 1 }; }
  // (0.50) a throw's trick shots: banked off a wall (Rolling Pin, Spatula), on through another Titan (a piercing shot)
  _trick(rec) { return (rec?.bank ? 16 : 0) + ((rec?.nth || 1) > 1 ? 14 : 0); }

  _snipe(rec) {
    const a = this.idx.get(rec.by), hit = this._hit(rec);
    const old = this.moments.find((m) => m.pid === rec.pid && m.kind === 'snipe');
    if (old) return; // the same throw (it pierced on through someone else)
    this._add({
      kind: 'snipe', a, hits: [hit], pid: rec.pid, dist: rec.dist, food: rec.food, head: rec.head, amt: rec.amt, ko: false, count: 1, u: rec.u,
      score: 32 + Math.min(36, (rec.dist - SNIPE) * 1.2) + (rec.head ? 15 : 0) + Math.min(20, rec.amt / 3) + this._trick(rec),
    });
  }

  _bigHit(rec) {
    const a = this.idx.get(rec.by);
    if (this.moments.some((m) => m.a === a && Math.abs(m.hits.at(-1).tk - rec.t) < 2)) return; // already part of a play
    this._add({ kind: 'hit', a, hits: [this._hit(rec)], pid: rec.pid, dist: rec.dist, food: rec.food, head: rec.head, amt: rec.amt, ko: false, count: 1, u: rec.u, score: 12 + rec.amt / 2 + (rec.head ? 12 : 0) + this._trick(rec) });
  }

  // `late`: how long after the hit that knocked them out the knockout can come (online it comes over
  // the network, a moment after the hit showed here; then it's that hit's moment)
  onKill(victim, killer, foodId, late = 0.25) {
    if (!this.rec || !killer || killer === victim || !this.idx.has(killer) || !this.idx.has(victim)) return;
    const g = this.game, t = g.time;
    const a = this.idx.get(killer), b = this.idx.get(victim);
    const h = this.lastHit.get(victim);
    const link = h && h.by === killer && t - h.t < 6 ? h : null;
    const dist = link ? link.dist : killer.pos.distanceTo(victim.pos);
    const hit = link ? this._hit(link) : { tk: t, tt: null, ti: t, b, pid: 0, path: null, head: false, dist, food: foodId };
    const same = link && t - link.t <= late;
    if (link && !same) Object.assign(hit, { tt: null, ti: t, pid: 0, path: null, bank: 0, nth: 1 }); // (knocked out later, by a burn: not that throw's moment)
    hit.tk = same ? link.t : t; hit.b = b;
    const air = !killer.onGround;
    const bonus = Math.min(40, dist * 0.8) + (link?.head ? 15 : 0) + (air ? 10 : 0) + (same ? this._trick(link) : 0);
    // a snipe that knocked them out: a snipe splat
    const snipe = link?.pid ? this.moments.find((m) => m.kind === 'snipe' && m.pid === link.pid && m.hits[0].b === b) : null;
    if (snipe) { snipe.ko = true; snipe.score += 45; snipe.t1 = Math.max(snipe.t1, hit.tk + 2.2); snipe.pre = this._pre(victim, hit.tk); return; }
    // a double, a triple ...: the same Titan splatted someone a moment ago
    const prev = this.moments.find((m) => m.ko && m.a === a && t - m.hits.at(-1).tk < 4.5);
    if (prev) {
      prev.hits.push(hit); prev.count++;
      prev.score += 40 + bonus * 0.5;
      prev.t1 = hit.tk + 2.2;
      return;
    }
    // (a big hit that was the same throw becomes this splat)
    const big = this.moments.findIndex((m) => m.kind === 'hit' && m.a === a && Math.abs(m.hits[0].tk - t) < 0.3);
    if (big >= 0) this.moments.splice(big, 1);
    this._add({ kind: 'splat', a, hits: [hit], pid: hit.pid, dist, food: link?.food || foodId, head: !!link?.head, ko: true, count: 1, u: same ? link.u : '', score: 48 + bonus, pre: this._pre(victim, hit.tk) });
  }

  // (0.46) The hits that wore a Titan down before the one that splatted them: from the last PRE_BACK s,
  // at least PRE_GAP s apart (a stream of berries is one: the biggest of them), the PRE_N biggest, in order.
  _pre(victim, tk) {
    const all = [];
    for (const r of this.hitLog.get(victim) || []) {
      if (r.t >= tk - 0.2 || tk - r.t > PRE_BACK || !(r.amt >= PRE_MIN) || !this.idx.has(r.by)) continue;
      const near = all.find((p) => Math.abs(p.ti - (r.ti ?? r.t)) < PRE_GAP);
      if (near) { if (r.amt > near.amt) Object.assign(near, this._preHit(r)); } else all.push(this._preHit(r));
    }
    return all.sort((p, q) => q.amt - p.amt || q.ti - p.ti).slice(0, PRE_N).sort((p, q) => p.ti - q.ti);
  }
  _preHit(r) { return { ti: r.ti ?? r.t, tk: r.t, a: this.idx.get(r.by), b: this.idx.get(r.victim), food: r.food, amt: r.amt, head: !!r.head, pid: r.pid, path: r.path?.s?.length >= 8 ? r.path : null }; }

  // The match is over: the last splat won it (and its clip runs on, for the crane up and away).
  onOver() {
    if (!this.rec) return;
    const t = this.game.time;
    const last = this.moments.filter((m) => m.ko && t - m.hits.at(-1).tk < 3).sort((p, q) => q.hits.at(-1).tk - p.hits.at(-1).tk)[0];
    if (last) { last.final = true; last.score += 35; last.t1 = Math.max(last.t1, last.hits.at(-1).tk + 3.2); }
  }

  // Dangerous throws passing close: how close each came to each Titan; when it moves off again
  // without hitting them, that's a dodge (if they were moving, dashing or in the air).
  _watchDodges(t) {
    const g = this.game;
    for (const p of g.projectiles.list) {
      if (p.done || !p.hl || !p.owner || p.life < 0.08) continue;
      if (danger(p.food) < 12) continue; // (berries and grape shot whizz past all the time)
      // the stretch it flew this step (a fast carrot covers metres in one)
      const s = p.hl.path?.s, n = s ? s.length : 0;
      const from = n >= 8 ? _c.set(s[n - 7], s[n - 6], s[n - 5]) : _c.copy(p.pos);
      _d.subVectors(p.pos, from);
      const l2 = _d.lengthSq();
      for (const a of this.actors) {
        if (!a.alive || a === p.owner || g.teammates(a, p.owner)) continue;
        _a.set(a.pos.x, a.pos.y + 0.5, a.pos.z); _b.set(a.pos.x, a.pos.y + 1.74, a.pos.z);
        const d = Math.sqrt(segSegDist2(from, p.pos, _a, _b)) - (p.radius || 0.35);
        let e = p.hl.near?.get(a);
        if (d < DODGE_R) {
          if (!e) { e = { d: 99, done: false }; (p.hl.near ||= new Map()).set(a, e); }
          if (d < e.d && !e.done) {
            // when it was closest (part way along this step's stretch)
            const k = l2 > 1e-6 ? clamp(((a.pos.x - from.x) * _d.x + (a.pos.y + 1.1 - from.y) * _d.y + (a.pos.z - from.z) * _d.z) / l2, 0, 1) : 1;
            const tc = n >= 8 ? lerp(s[n - 8], s[n - 4], k) : t;
            Object.assign(e, { d, t: tc, speed: Math.hypot(a.vel.x, a.vel.z), air: !a.onGround, dash: a.dashT > 0 || !!a.tdash });
            e.v = p.vel.length();
          }
        } else if (e && !e.done && d > e.d + 0.9) {
          e.done = true;
          if (!p.hitSet.has(a)) this._dodge(p, a, e);
        }
      }
    }
  }

  _dodge(p, a, e) {
    if (!(e.speed > 3 || e.air || e.dash)) return; // standing still while a throw misses isn't a dodge
    const ai = this.idx.get(a), bi = this.idx.get(p.owner);
    if (ai === undefined || bi === undefined) return;
    const hit = { tk: e.t, tt: p.hl.t, ti: e.t, b: bi, pid: p.hl.id, path: p.hl.path, head: false, dist: p.hl.from.distanceTo(a.pos) };
    const score = 24 + (DODGE_R - e.d) * 16 + (e.dash ? 14 : 0) + (e.air ? 8 : 0) + Math.min(14, e.v / 4) + (danger(p.food) >= 30 ? 8 : 0);
    const prev = this.moments.find((m) => m.kind === 'dodge' && m.a === ai && e.t - m.hits.at(-1).tk < 2.5);
    if (prev) { prev.hits.push(hit); prev.count++; prev.score += 16; prev.t1 = e.t + 1.8; return; }
    this._add({ kind: 'dodge', a: ai, hits: [hit], pid: p.hl.id, dist: 0, food: p.food, ko: false, count: 1, score, close: e.d });
  }

  _add(m) {
    const h = m.hits[0];
    m.t0 = m.t0 ?? (h.tt != null ? Math.min(h.tt - 1.3, h.tk - 2.2) : h.tk - 3);
    m.t0 = Math.max(m.t0, h.tk - 4.3); // (a long, slow flight: the clip starts late in it)
    m.t1 = m.t1 ?? h.tk + (m.kind === 'dodge' ? 1.8 : 2.2);
    this.moments.push(m);
    if (this.moments.length > MAX_MOMENTS) { // forget the weakest that isn't yours
      const me = this.idx.get(this.game.player);
      let w = -1;
      this.moments.forEach((x, i) => { if (x.a !== me && (w < 0 || x.score < this.moments[w].score)) w = i; });
      if (w >= 0) this.moments.splice(w, 1);
    }
  }

  // ------------------------------------------------------------------ the reels
  // The plays for a reel: 'all' (the match) or 'me' (your own), best last. Splats first (knockouts,
  // snipe splats included), then snipes and big hits; a dodge only to fill a gap, one at most, never
  // the last play (0.39). opts.max: at most this many; opts.mine: your best play is always one of
  // them (online round reels).
  reel(mode, opts = {}) {
    const fr = this.frames;
    if (fr.length < 10) return [];
    const first = fr[0].t, last = fr.at(-1).t;
    const me = this.idx.get(this.game.player);
    let pool = this.moments.filter((m) => m.t0 >= first - 0.01 && m.hits.at(-1).tk <= last - 0.3);
    pool = mode === 'me' ? pool.filter((m) => m.a === me) : pool.filter((m) => m.kind !== 'hit');
    // a dodge that was splatted straight after isn't one to show
    for (const m of pool) if (m.kind === 'dodge' && !this._aliveAt(m.a, Math.min(last, m.hits.at(-1).tk + 1.2))) m.score *= 0.4;
    const rank = (m) => (m.ko ? 0 : m.kind === 'dodge' ? 2 : 1);
    pool.sort((p, q) => rank(p) - rank(q) || q.score - p.score);
    const max = opts.max || (mode === 'me' ? 5 : 6), kinds = {}, out = [];
    if (opts.mine) { const i = pool.findIndex((m) => m.a === me); if (i > 0) pool.unshift(...pool.splice(i, 1)); }
    for (const m of pool) {
      if (out.length >= max) break;
      if (out.some((o) => Math.min(o.t1, m.t1) - Math.max(o.t0, m.t0) > 0.4 * Math.min(o.t1 - o.t0, m.t1 - m.t0))) continue; // overlaps a chosen one
      if (m.kind === 'dodge' ? kinds.dodge >= 1 : !m.ko && (kinds[m.kind] || 0) >= 3) continue; // (splats can fill a reel)
      kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      out.push({ ...m, hits: m.hits.map((h) => ({ ...h })), pre: (m.pre || []).filter((p) => p.ti - PRE_IN >= first).map((p) => ({ ...p })), t0: Math.max(m.t0, first), t1: Math.min(m.t1, last) });
    }
    out.sort((p, q) => rank(q) - rank(p) || p.score - q.score); // best last: a splat closes the reel when there is one
    return out;
  }
  has(mode) { return this.reel(mode).length > 0; }

  // opts: max, mine (see reel); live (online: the match goes on under it); title
  play(mode, onDone, opts = {}) {
    if (this.playing) return false;
    const clips = this.reel(mode, opts);
    if (!clips.length) return false;
    this.playing = new Reel(this, clips, mode, (quiet) => { this.playing = null; if (!quiet) onDone?.(); }, opts);
    return true;
  }
  stop() { if (this.playing) this.playing.finish(true); } // (quietly: leaving for the menu, a new match)

  // ------------------------------------------------------------------ reading the recording
  _at(t) { // the frame index just before time t, and how far toward the next
    const fr = this.frames;
    let lo = 0, hi = fr.length - 1;
    if (t <= fr[0].t) return [0, 0];
    if (t >= fr[hi].t) return [hi, 0];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fr[mid].t <= t) lo = mid; else hi = mid; }
    return [lo, (t - fr[lo].t) / Math.max(1e-6, fr[lo + 1].t - fr[lo].t)];
  }
  _aliveAt(i, t) { const [j] = this._at(t); return (this.frames[j].a[i * K + 8] & FL.alive) !== 0; }
  yawAt(i, t) { const [j, k] = this._at(t), fr = this.frames, o = i * K + 3, A = fr[j].a, B = fr[Math.min(j + 1, fr.length - 1)].a; return angleLerp(A[o] ?? B[o] ?? 0, B[o] ?? A[o] ?? 0, k); }
  // A Titan's middle (or feet) at time t: a smooth curve through the frames (slow motion shows the
  // corners of straight lines between them), no sliding across a respawn.
  posAt(i, t, out = new THREE.Vector3(), mid = true) {
    const fr = this.frames, [j, k] = this._at(t), o = i * K;
    const F = fr[j], N = fr[Math.min(j + 1, fr.length - 1)], A = F.a, B = N.a, h = N.t - F.t;
    if (h <= 0 || h > 0.25 || !linked(A, B, o)) {
      let P = k < 0.5 ? A : B;
      if (P.length <= o) P = P === A ? B : A; // (a frame from before they turned up)
      out.set(P[o] || 0, P[o + 1] || 0, P[o + 2] || 0);
    } else {
      const k2 = k * k, k3 = k2 * k;
      const h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = 3 * k2 - 2 * k3, h11 = k3 - k2;
      const flat = (A[o + 8] & B[o + 8] & FL.ground) !== 0; // (walking: never dip below the ground)
      for (let c = 0; c < 3; c++) {
        if (c === 1 && flat) { out.y = lerp(A[o + 1], B[o + 1], k); continue; }
        out.setComponent(c, h00 * A[o + c] + h10 * this._slope(j, o, c) * h + h01 * B[o + c] + h11 * this._slope(j + 1, o, c) * h);
      }
    }
    if (mid) out.y += 1.05;
    return out;
  }
  _slope(j, o, c) { // how fast a Titan's coordinate changes at frame j (from the frames either side)
    const fr = this.frames, n = fr.length, P = fr[j];
    const a = j > 0 && P.t - fr[j - 1].t < 0.25 && linked(fr[j - 1].a, P.a, o) ? fr[j - 1] : P;
    const b = j < n - 1 && fr[j + 1].t - P.t < 0.25 && linked(P.a, fr[j + 1].a, o) ? fr[j + 1] : P;
    return a === b ? 0 : (b.a[o + c] - a.a[o + c]) / (b.t - a.t);
  }
}

// ---------------------------------------------------------------------------------------------
// One reel playing: poses the Titans and the flying food from the recording, replays the bursts and
// sounds, directs the camera and runs the overlay. The live match waits, and is put back after.
class Reel {
  constructor(hl, clips, mode, done, opts = {}) {
    this.hl = hl; this.g = hl.game; this.clips = clips; this.mode = mode; this.done = done;
    this.live = !!opts.live;   // online: the match goes on underneath (see unpose)
    this.rInv = new Map();     // (online) what each Titan holds in the replay, apart from what they hold live
    this.ghosts = new Map(); // pid -> mesh
    this.zg = new Map();     // (0.50) a recorded utensil zone -> its replayed one
    this.pg = new Map();     // ... a recorded puddle -> its replayed one
    this.ag = new Map();     // ... a recorded ice storm -> its replayed one
    this.wg = new Map();     // (0.54) ... a Legendary freeze wave -> its replayed ring
    this.streams = new Set(); // (0.54) Titans whose Legendary cone or beam is shown now
    this.paths = new Map();  // pid -> the flight path of a throw in this play
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, shot: -1, clip: -1, rt: 0 };
    this.freeze = 0; this.punch = 0; this.shake = 0; this.realDt = 0; this.lastSg = 1;
    this._pts = []; this._vs = [];
    this._save();
    this._makeFx();
    this.el = (id) => document.getElementById(id);
    this.root = this.el('reel');
    this.root.hidden = false;
    document.body.classList.add('reeling');
    this.root.classList.remove('out', 'slow', 'bullet');
    this.el('reel-cap').classList.remove('on');
    this.distEl = this.el('reel-dist'); this.distB = this.distEl.querySelector('b');
    this.distEl.classList.remove('on', 'hit');
    this.ci = -1; this.stage = 'intro'; this.st = 0; this.t = 0;
    const me = this.g.player && this.hl.idx.get(this.g.player);
    this.me = me;
    this._title(opts.title || (mode === 'me' ? 'Your highlights' : 'Match highlights'), `${clips.length} ${clips.length === 1 ? 'play' : 'plays'}${mode === 'me' ? ' starring you' : ''}`);
    this._enterClip(0, true);
  }

  // ---------------------------------------------------------------- save and put back the live match
  // What a reel changes on the Titans: where they are, what they're doing, what they hold.
  _grab() {
    return this.hl.actors.map((a) => ({
      a, pos: a.pos.clone(), vel: a.vel.clone(), yaw: a.yaw, aimY: a.aimDir.y, alive: a.alive, vis: a.root.visible,
      onGround: a.onGround, gliding: a.gliding, dashT: a.dashT, frozenUntil: a.frozenUntil, trippedUntil: a.trippedUntil,
      rootedUntil: a.rootedUntil, burnUntil: a.burnUntil, charging: a.charging, chargeT: a.chargeT, armT: a.armT,
      eat: a.eat, shieldUp: a.shieldUp, inv: a.inv, sel: a.sel, hitFlash: a.hitFlash, fpCam: a.fpCam, utensil: a.utensil,
    }));
  }
  _putBack(list) {
    for (const x of list) {
      const a = x.a;
      Object.assign(a, {
        yaw: x.yaw, alive: x.alive, onGround: x.onGround, gliding: x.gliding, dashT: x.dashT, frozenUntil: x.frozenUntil,
        trippedUntil: x.trippedUntil, rootedUntil: x.rootedUntil, burnUntil: x.burnUntil, charging: x.charging, chargeT: x.chargeT,
        armT: x.armT, eat: x.eat, shieldUp: x.shieldUp, inv: x.inv, sel: x.sel, hitFlash: x.hitFlash, fpCam: x.fpCam, utensil: x.utensil,
      });
      a.pos.copy(x.pos); a.vel.copy(x.vel); a.aimDir.y = x.aimY;
      a.root.visible = x.vis; a.root.scale.set(1, 1, 1);
    }
  }
  _save() {
    const g = this.g;
    this.saved = {
      time: g.time, fovKick: g.fovKick, fov: g.camera.fov,
      camPos: g.camera.position.clone(), camQ: g.camera.quaternion.clone(),
      tide: [g.tide.x, g.tide.z, g.tide.r],
      actors: this._grab(),
      projVis: this.g.projectiles.list.map((p) => [p, p.mesh.visible]),
      hud: !g.hud.el.hidden,
    };
    g.hud.show(false);
    g.previewDots.count = 0;
    g.fx.clear();
    if (this.live) return; // (online: posed and put back frame by frame, see _pose)
    for (const p of this.g.projectiles.list) p.mesh.visible = false;
    this.saved.world = this._hideWorld();
    for (const a of this.hl.actors) { a.fpCam = null; a.inv = [null, null, null, null, null]; a.sel = 0; }
  }
  // Online, the match goes on under the reel (the host still runs the room). Each frame: keep the live
  // state, hide what's live but not in the replay (thrown food, Titans who came later), pose the
  // replay, draw it; then unpose puts the live state back (main.js calls it once the frame is drawn,
  // game.update before stepping), so the match carries on exactly as if nobody watched.
  _pose() {
    const g = this.g;
    this.posed = {
      time: g.time, actors: this._grab(),
      proj: g.projectiles.list.map((p) => [p, p.mesh.visible]),
      others: g.actors.filter((a) => !this.hl.idx.has(a)).map((a) => [a, a.root.visible]),
    };
    for (const p of g.projectiles.list) p.mesh.visible = false;
    this.posed.world = this._hideWorld();
    for (const [a] of this.posed.others) { a.root.visible = false; a.glint.visible = false; }
    for (const a of this.hl.actors) {
      if (!this.rInv.has(a)) this.rInv.set(a, [null, null, null, null, null]);
      a.fpCam = null; a.inv = this.rInv.get(a); a.sel = 0;
    }
    g.previewDots.count = 0;
  }
  unpose() {
    const s = this.posed;
    if (!s) return;
    this.posed = null;
    const g = this.g;
    this._putBack(s.actors);
    for (const [p, v] of s.proj) p.mesh.visible = v && !p.done;
    this._showWorld(s.world);
    for (const [a, v] of s.others) a.root.visible = v;
    g.time = s.time;
    g.world.setTide(g.tide.x, g.tide.z, g.tide.r);
  }
  // (0.50) The live match's utensil zones and puddles, hidden while the replay shows its own.
  _hideWorld() {
    const g = this.g, list = [];
    for (const z of g.utensils.zones) if (z.mesh) list.push([z.mesh, z.mesh.visible]);
    for (const z of g.surface.zones) list.push([z.mesh, z.mesh.visible]);
    for (const v of g.abilities.vortices) list.push([v.group, v.group.visible]);
    for (const [m] of list) m.visible = false;
    return list;
  }
  _showWorld(list) {
    for (const [m, v] of list || []) m.visible = v;
    this.g.abilities.drawAt(this.g.time); // (the live ground fires and spikes again)
  }
  _clearWorld() {
    const g = this.g;
    for (const z of this.zg.values()) g.utensils._dropZone(z);
    for (const z of this.pg.values()) g.surface.dropPuddle(z);
    for (const v of this.ag.values()) g.abilities._dropVortex(v);
    for (const m of this.wg.values()) g.utensils.legend._dropWave({ mesh: m });
    for (const a of this.streams) this._endStream(a);
    this.zg.clear(); this.pg.clear(); this.ag.clear(); this.wg.clear(); this.streams.clear();
  }
  _endStream(a) { a.replayStream = false; const fx = this.g.utensils.legend.fx.get(a); if (fx && !a.streamOn) fx.grp.visible = false; }
  _drop(m) { // a replayed food (and its utensil coat) back to the pools
    this.g.utensils.releaseAttach(m.userData.att); m.userData.att = null; m.userData.uv = null;
    this.g.projectiles.releaseMesh(m.userData.food, m);
  }
  _restore() {
    const g = this.g, s = this.saved;
    for (const m of this.ghosts.values()) this._drop(m);
    this.ghosts.clear();
    this._clearWorld();
    if (this.live) { // (online: the match went on; it's back as it is now, the camera to the match)
      this.unpose();
      for (const a of this.hl.actors) { a.root.scale.set(1, 1, 1); a._refreshHeld(); }
      g.camera.fov = s.fov; g.camera.updateProjectionMatrix();
      g.fx.clear();
      g.hud.show(s.hud);
      return;
    }
    this._putBack(s.actors);
    for (const x of s.actors) x.a._refreshHeld();
    for (const [p, v] of s.projVis) p.mesh.visible = v && !p.done;
    this._showWorld(s.world);
    g.time = s.time; g.fovKick = s.fovKick;
    g.camera.position.copy(s.camPos); g.camera.quaternion.copy(s.camQ); g.camera.fov = s.fov; g.camera.updateProjectionMatrix();
    g.world.setTide(...s.tide);
    g.fx.clear();
    g.hud.show(s.hud);
  }
  finish(quiet = false) {
    if (this.over) return;
    this.over = true;
    this.root.hidden = true;
    this.root.classList.remove('slow', 'bullet');
    document.body.classList.remove('reeling');
    this.el('reel-title').classList.remove('on');
    this.distEl.classList.remove('on', 'hit');
    this._disposeFx();
    this._restore();
    this.done(quiet);
  }
  skip() { this.finish(); }
  next() { if (this.stage !== 'outro') this._enterClip(this.ci + 1); }

  // ---------------------------------------------------------------- the reel's own effects
  // Glowing trails behind the flying food, and shockwave rings where it lands.
  _makeFx() {
    const g = this.g;
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 56);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      m.visible = false; m.renderOrder = 6; m.frustumCulled = false;
      g.scene.add(m);
      this.rings.push({ m, age: 9, delay: 0, life: 0.55, size: 4 });
    }
    this.trails = [];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 9), 3).setUsage(THREE.DynamicDrawUsage);
      const col = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 12), 4).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos); geo.setAttribute('color', col);
      const idx = []; // three across each point: an edge, the bright core, the other edge
      for (let k = 0; k < TRAIL_N - 1; k++) { const a = k * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); }
      geo.setIndex(idx);
      geo.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      mesh.visible = false; mesh.renderOrder = 5; mesh.frustumCulled = false;
      g.scene.add(mesh);
      this.trails.push({ mesh, pos, col, tr: null });
    }
    this._tp = Array.from({ length: TRAIL_N }, () => new THREE.Vector3());
  }
  _disposeFx() {
    for (const o of [...this.rings.map((r) => r.m), ...this.trails.map((t) => t.mesh)]) {
      this.g.scene.remove(o); o.geometry.dispose(); o.material.dispose();
    }
  }
  _ring(at, size, delay = 0, life = 0.55, color = null) {
    const r = this.rings.find((x) => x.age - x.delay >= x.life) || this.rings[0];
    r.m.position.copy(at); Object.assign(r, { age: 0, delay, life, size });
    r.m.material.color.set(color ? _col.copy(color).lerp(WHITE, 0.3) : RING);
  }
  _drawRings(dt) { // (in real time: they spread through the freeze)
    for (const r of this.rings) {
      r.age += dt;
      const k = (r.age - r.delay) / r.life;
      if (k < 0 || k >= 1) { r.m.visible = false; continue; }
      r.m.visible = true;
      r.m.scale.setScalar(lerp(0.3, r.size, 1 - (1 - k) ** 3));
      r.m.material.opacity = 0.9 * (1 - k) ** 1.5;
      r.m.quaternion.copy(this.g.camera.quaternion);
    }
  }
  // A trail per throw in the play, in the thrower's colour: points spaced along its flight.
  _setTrails(c) {
    for (const R of this.trails) { R.tr = null; R.mesh.visible = false; }
    let i = 0;
    for (const [pid, P] of this.paths) {
      if (i >= this.trails.length) break;
      const h = c.hits.find((x) => x.pid === pid), dodge = c.kind === 'dodge';
      if (!h) continue; // (a lead-up hit's throw: no trail, it's a quick cut)
      const col = vivid(this.hl.meta[dodge ? h.b : c.a]?.color);
      const s = P.s, t1 = pathEnd(P);
      const t0 = Math.min(t1, Math.max(s[0], c.t0 - 0.5));
      let len = 0;
      for (let k = 4; k < s.length; k += 4) if (s[k] >= t0) len += Math.hypot(s[k + 1] - s[k - 3], s[k + 2] - s[k - 2], s[k + 3] - s[k - 1]);
      const gap = Math.max(0.25, len / (TRAIL_N - 4));
      const prev = pathAt(P, t0, new THREE.Vector3()), cur = new THREE.Vector3();
      const pts = [t0, prev.x, prev.y, prev.z];
      const steps = Math.min(3000, Math.ceil((t1 - t0) * 600) + 2);
      let acc = 0;
      for (let k = 1; k <= steps && pts.length < (TRAIL_N - 2) * 4; k++) {
        const tt = t0 + ((t1 - t0) * k) / steps;
        pathAt(P, tt, cur);
        acc += cur.distanceTo(prev); prev.copy(cur);
        if (acc >= gap || k === steps) { acc = 0; pts.push(tt, cur.x, cur.y, cur.z); }
      }
      this.trails[i++].tr = {
        P, pts, end: t1, fadeFrom: dodge ? h.tk + 0.35 : h.ti, after: 0, hold: h.bullet ? 1.9 : 1.1,
        edge: col.clone().multiplyScalar(0.85), core: col.clone().lerp(WHITE, 0.4),
      };
    }
  }
  _drawTrails() {
    const cp = this.g.camera.position, t = this.t;
    for (const R of this.trails) {
      const T = R.tr;
      if (!T || t < T.pts[0]) { R.mesh.visible = false; continue; }
      if (t >= T.fadeFrom) T.after += this.realDt;
      const fade = 1 - smooth((T.after - T.hold) / 0.9);
      const pts = T.pts;
      let n = 0;
      while (n * 4 < pts.length && pts[n * 4] <= t) n++;
      const head = t < T.end, m = Math.min(TRAIL_N, n + (head ? 1 : 0));
      if (fade <= 0 || m < 2) { R.mesh.visible = false; continue; }
      R.mesh.visible = true;
      const P = this._tp;
      for (let i = 0; i < m; i++) {
        if (i < n) P[i].set(pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3]);
        else pathAt(T.P, t, P[i]); // (the food itself)
      }
      const pa = R.pos.array, ca = R.col.array;
      for (let i = 0; i < m; i++) {
        const f = i / (m - 1), Q = P[i];
        _u.subVectors(P[Math.min(m - 1, i + 1)], P[Math.max(0, i - 1)]); // along it
        _v.subVectors(cp, Q);                                            // toward the camera
        const dc = _v.length();
        _w.crossVectors(_u, _v);
        if (_w.lengthSq() < 1e-10) _w.crossVectors(_u, UP);
        if (_w.lengthSq() < 1e-10) _w.set(1, 0, 0);
        _w.normalize().multiplyScalar(lerp(0.035, 0.12, f) * Math.max(1, dc / 15)); // (still a line far away)
        const o = i * 9;
        pa[o] = Q.x - _w.x; pa[o + 1] = Q.y - _w.y; pa[o + 2] = Q.z - _w.z;
        pa[o + 3] = Q.x; pa[o + 4] = Q.y; pa[o + 5] = Q.z;
        pa[o + 6] = Q.x + _w.x; pa[o + 7] = Q.y + _w.y; pa[o + 8] = Q.z + _w.z;
        const al = (0.45 + 0.55 * f) * fade * smooth((dc - 0.8) / 1.8); // (fading out right by the lens)
        const q = i * 12, E = T.edge, C = T.core;
        ca[q] = E.r; ca[q + 1] = E.g; ca[q + 2] = E.b; ca[q + 3] = al * 0.55;
        ca[q + 4] = C.r; ca[q + 5] = C.g; ca[q + 6] = C.b; ca[q + 7] = al;
        ca[q + 8] = E.r; ca[q + 9] = E.g; ca[q + 10] = E.b; ca[q + 11] = al * 0.55;
      }
      R.pos.needsUpdate = true; R.col.needsUpdate = true;
      R.mesh.geometry.setDrawRange(0, (m - 1) * 12);
    }
  }

  // ---------------------------------------------------------------- overlay
  _title(big, small, dur = 1.9) {
    const t = this.el('reel-title');
    t.innerHTML = `<strong>${big}</strong>${small ? `<span>${small}</span>` : ''}`;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    this.titleT = dur;
  }
  _name(i) {
    if (i === this.me) return '<b class="you">You</b>';
    const m = this.hl.meta[i];
    return `<b class="nm" style="--c:${m?.color || '#fff'}">${esc(m?.name || 'Titan')}</b>`;
  }
  _caption(c) {
    const n = c.count, a = this._name(c.a), b = this._name(c.hits[0].b), food = foodName(c.food);
    let kind, text;
    if (c.kind === 'dodge') {
      kind = n > 1 ? `${mult(n)} dodge` : 'Dodge';
      text = `${a} dodged ${n > 1 ? `${n} throws` : `${b}'s ${food || 'throw'}`}`;
    } else if (c.kind === 'snipe') {
      kind = c.ko ? 'Snipe splat' : 'Snipe';
      text = `${a} ${c.ko ? 'splatted' : 'hit'} ${b} from <b>${Math.round(c.dist)} m</b>${food ? ` with ${/^[aeiou]/i.test(food) ? 'an' : 'a'} ${food}` : ''}`;
    } else if (c.kind === 'hit') {
      kind = c.head ? 'Headshot' : 'Big hit';
      text = `${a} hit ${b} for <b>${Math.round(c.amt)}</b>`;
    } else {
      kind = c.final ? (n > 1 ? `${mult(n)} splat to win` : 'Winning splat') : n > 1 ? `${mult(n)} splat` : 'Splat';
      const victims = c.hits.map((h) => this._name(h.b));
      text = `${a} splatted ${victims.length > 1 ? `${victims.slice(0, -1).join(', ')} and ${victims.at(-1)}` : victims[0]}${c.dist >= 12 && n === 1 ? ` from <b>${Math.round(c.dist)} m</b>` : ''}`;
    }
    // (0.50) the utensil that made it, and its trick: banked off a wall, on through another Titan
    const u = c.kind !== 'dodge' && UTENSIL_BY_ID[c.u], bank = c.kind !== 'dodge' && c.hits.some((h) => h.bank), skew = c.kind !== 'dodge' && c.hits.some((h) => h.nth > 1);
    if (n === 1 && bank) kind = c.ko ? 'Bank shot splat' : 'Bank shot'; // (a double, a triple keeps its name)
    else if (n === 1 && skew) kind = c.ko ? 'Skewer splat' : 'Skewered';
    if (u) text += ` <span class="ut"><img src="${utensilIcon(c.u)}" alt="">${esc(u.name)}${bank ? ', off the wall' : skew ? ', on through' : ''}</span>`;
    else if (c.kind !== 'dodge' && ABILITY[c.food]) text += ` <span class="ut ab" style="--c:${ABILITY[c.food][1]}">${ABILITY[c.food][0]}</span>`;
    this.el('reel-kind').textContent = kind;
    this.el('reel-text').innerHTML = text;
    this.el('reel-n').textContent = `${this.ci + 1} / ${this.clips.length}`;
    const cap = this.el('reel-cap');
    cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on');
    this.capT = 0;
  }
  _pop(word, kind = '', flash = 0.75) {
    const p = this.el('reel-pop');
    p.textContent = word;
    p.className = `reel-pop ${kind}`; void p.offsetWidth; p.classList.add('on');
    const f = this.el('reel-flash');
    f.style.setProperty('--fl', flash);
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  // Slow motion, a speed-lines rush while the camera rides a throw, the distance it's flown; the
  // caption up as the play starts, out of the way of the action, back for the last shot.
  _overlay(sp) {
    const s = this.shots[this.cam.shot], h = s?.h;
    const cap = this.el('reel-cap'), last = this.cam.shot === this.shots.length - 1;
    this.capT += this.realDt;
    if (last && !this.capBack) { this.capBack = true; this._caption(this.clip); }
    else if (!last && cap.classList.contains('on') && (this.capT > 2.8 || (this.capT > 1.4 && (s?.type === 'bullet' || sp < 0.6)))) cap.classList.remove('on');
    this.root.classList.toggle('slow', sp < 0.6 || this.freeze > 0);
    this.root.classList.toggle('bullet', s?.type === 'bullet' && this.t < h.ti);
    const de = this.distEl;
    if (h?.bullet && (s.type === 'bullet' || s.type === 'reveal')) {
      de.classList.add('on');
      let k = 1;
      if (this.t < (h.ti0 ?? h.ti)) k = clamp(flownTo(h.path, this.t) / h.flown, 0, 1);
      const v = Math.round(h.dist * k);
      if (v !== this.distShown) { this.distShown = v; this.distB.textContent = v; }
    } else if (de.classList.contains('on')) de.classList.remove('on', 'hit');
  }

  // ---------------------------------------------------------------- clips
  _enterClip(i, first = false) {
    if (i >= this.clips.length) {
      this.stage = 'outro'; this.st = 0;
      this.el('reel-cap').classList.remove('on'); this.distEl.classList.remove('on', 'hit');
      this.root.classList.remove('slow', 'bullet'); this.root.classList.add('out');
      return;
    }
    this.ci = i;
    const c = this.clips[i];
    this.clip = c;
    this._prepare(c);
    this.shots = this._plan(c); this.mainShots = null;
    // (0.46) a splat's lead-up: each earlier hit a quick cut, close on whoever it hit (not one the play shows anyway)
    this.pre = (c.ko ? c.pre || [] : []).filter((p) => p.ti + PRE_OUT < c.t0 - 0.1 && p.ti - PRE_IN - 0.25 >= this.hl.frames[0].t && this.hl._aliveAt(p.b, p.ti)).map((p, k) => {
      if (p.path) this.paths.set(p.pid, p.path);
      const from = p.ti - PRE_IN - (k ? 0 : 0.25); // (the first a little longer: the clip fades in over it)
      return { ...p, from, to: p.ti + PRE_OUT, shot: { type: 'flash', from, to: p.ti + PRE_OUT, h: p, hs: [p], init: true, sg: k % 2 ? -1 : 1 } };
    });
    c.tEnd = Math.min(Math.max(c.t1, this.shots.at(-1).to), this.hl.frames.at(-1).t);
    // a long play (several throws or dodges, each in slow motion): quicken the slow parts to keep it short
    const best = i === this.clips.length - 1 && this.clips.length > 1, most = best ? 11 : c.kind === 'dodge' ? 8.5 : 9.5;
    const est = (b) => { let r = c.hits.length * 0.2; for (let t = c.t0; t < c.tEnd; t += 1 / 60) r += 1 / 60 / Math.min(1, this._speed(t) * b); return r; };
    c.boost = 1;
    if (est(1) > most) { let lo = 1, hi = 8; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (est(m) > most) lo = m; else hi = m; } c.boost = hi; }
    this.t = c.t0; this.evT = c.t0;
    this.popped = new Set();
    this.freeze = 0; this.punch = 0; this.shake = 0;
    this.cam.shot = -1;
    for (const m of this.ghosts.values()) this._drop(m);
    this.ghosts.clear();
    this.g.fx.clear();
    for (const r of this.rings) { r.age = 9; r.m.visible = false; }
    this._setTrails(c);
    this.distEl.classList.remove('on', 'hit');
    this.root.classList.remove('slow', 'bullet');
    this.el('reel-pop').classList.remove('on'); this.el('reel-flash').classList.remove('on');
    this.capBack = false;
    if (first) { this.stage = 'intro'; this.st = 0; } else if (best) {
      this.stage = 'card'; this.st = 0;
      this.el('reel-cap').classList.remove('on');
      this._title(this.mode === 'me' ? 'Your best play' : 'Play of the match', '');
    } else this._startPlay();
    this.el('reel-fade').classList.remove('on'); void this.el('reel-fade').offsetWidth; this.el('reel-fade').classList.add('on');
  }

  // Each hit: when it touched (ti), whether the camera follows it through the air (a long throw)
  // and how slow that ride is (it lasts 2 to 3.6 s, however fast the food).
  _prepare(c) {
    this.paths.clear();
    for (const h of c.hits) {
      h.ti ??= h.tk;
      if (!(h.ti <= h.tk && h.ti > h.tk - 0.2)) h.ti = h.tk;
      let P = h.path && h.path.s.length >= 8 ? h.path : null;
      // (0.39) a knockout: the food flew up to the edge of their body; in the replay it carries on all the
      // way into them (their chest, or their head on a headshot) and bursts there
      if (P && c.ko && Math.abs(pathEnd(P) - h.ti) < 1e-3) {
        const end = pathAt(P, h.ti, new THREE.Vector3(), _v), C = this.hl.posAt(h.b, h.ti, new THREE.Vector3(), false);
        C.y += h.head ? 1.7 : 1.05;
        const d = end.distanceTo(C);
        if (d > 0.05 && d < 3) {
          const dt = d / Math.max(4, _v.length());
          P = { ...P, s: [...P.s, h.ti + dt, C.x, C.y, C.z] };
          h.ti0 = h.ti; h.ti += dt;
        }
      }
      h.path = P;
      if (P) this.paths.set(h.pid, P);
      h.bullet = c.kind !== 'dodge' && !!P && (h.dist || 0) >= LONG && h.ti - P.s[0] > 0.05 && h.ti > c.t0 + 0.2;
      if (h.bullet) {
        h.bs = Math.max(P.s[0], h.ti - 1.5, c.t0);
        const fl = Math.max(0.02, h.ti - h.bs);
        h.s0 = (fl * BULLET_C) / clamp(1.7 + 0.9 * fl, 1.9, 3.6);
        h.flown = Math.max(0.1, flownTo(P, h.ti0 ?? h.ti)); // (the counter's full distance: up and down count)
      }
    }
    // a short look at the throw, then into the air (or the action)
    const h = c.hits[0];
    if (h.bullet) c.t0 = Math.max(c.t0, h.bs - 1.1);
    else if (c.kind === 'dodge') c.t0 = Math.max(c.t0, h.tk - 1.8);
    else c.t0 = Math.max(c.t0, Math.min(h.ti - 1.6, (h.path ? h.path.s[0] : h.ti) - 0.9));
    // who it knocks out: they stay in the replay as it lands (from the last frame they were in)
    // (knocked out: gone from the recording a moment after; online, once the room said so)
    this.kos = new Map();
    if (c.ko) {
      const fr = this.hl.frames, up = (k, b) => (fr[k].a[b * K + 8] & FL.alive) !== 0;
      for (const x of c.hits) {
        let dead = -1;
        for (let k = this.hl._at(x.tk)[0]; k < fr.length && fr[k].t <= x.tk + 1.6; k++) if (!up(k, x.b)) { dead = k; break; }
        if (dead < 0) continue;
        let j = dead;
        while (j > 0 && !up(j, x.b)) j--;
        this.kos.set(x.b, { tk: Math.max(x.tk, x.ti), j, dead: fr[dead].t }); // (squashed once the food is in)
      }
    }
  }

  // Camera shots for a play, in match time. Hits close together are one beat. A long throw: over
  // the shoulder, riding the food, the reverse angle back along it. A closer one: the wide two-shot.
  // A dodge: wide, then bullet time round the dodger. Then the hero shot.
  _plan(c) {
    const shots = [];
    let at = c.t0;
    const push = (type, to, b) => { if (to > at + 0.05) { shots.push({ type, from: at, to, h: b[0], hs: b }); at = to; } };
    const beats = [];
    for (const h of c.hits) { const b = beats.at(-1); if (b && h.ti - b.at(-1).ti < 0.8) b.push(h); else beats.push([h]); }
    beats.forEach((b, n) => {
      const h = b[0], last = b.at(-1).ti, nb = beats[n + 1];
      const lim = nb ? Math.max(last + 0.35, nb[0].bullet ? nb[0].bs - 0.5 : nb[0].ti - 0.9) : Infinity;
      if (c.kind === 'dodge') { // (thrown from far off: over the dodger's shoulder as it comes in)
        if (h.tk - 0.45 - at > 0.3) push(h.dist > 16 ? 'setup' : 'two', h.tk - 0.45, b);
        push('matrix', Math.min(b.at(-1).tk + 0.7, lim), b);
      } else if (h.bullet) {
        if (h.bs - at > 0.25) push('setup', h.bs, b);
        push('bullet', Math.min(h.ti + 0.14, lim), b);
        push('reveal', Math.min(last + 1.0, lim), b);
      } else if ((h.dist || 0) >= 16 && h.ti - at > 0.7) { // (0.47) a far play with no flight to ride
        push('setup', h.ti - 0.3, b);
        push('reveal', Math.min(last + 1.0, lim), b);
      } else push('two', Math.min(last + 0.95, lim), b);
    });
    const end = Math.max(at + 0.6, c.t1), hl = this.hl;
    if (!shots.length) push('two', end, [c.hits[0]]);
    else if (hl._aliveAt(c.a, Math.min(end, at + 0.4)) && Math.abs(hl.posAt(c.a, end, _x).y - hl.posAt(c.a, at, _p).y) < 2.5) push('hero', end, [c.hits.at(-1)]);
    else { shots.at(-1).to = end; at = end; } // (they went down straight after, or off a ledge: no hero shot)
    return shots;
  }

  // Speed of play at match time t: a slow-motion ride along a long throw; slowing into a closer
  // impact; bullet time round a dodge; slow just after every impact, then back up to speed.
  _speed(t) {
    let s = 1;
    const dodge = this.clip.kind === 'dodge';
    for (const h of this.clip.hits) {
      let v;
      if (dodge) v = t < h.tk ? lerp(1, 0.14, smooth((t - h.tk + 0.35) / 0.27)) : lerp(0.14, 1, smooth((t - h.tk - 0.08) / 0.4));
      else if (t >= h.ti) v = lerp(0.2, 1, smooth((t - h.ti - 0.15) / 0.55));
      else if (h.bullet) v = t >= h.bs ? Math.min(1, h.s0 * bulletShape((t - h.bs) / Math.max(1e-3, h.ti - h.bs))) : 1;
      else v = lerp(1, 0.25, smooth((t - h.ti + 0.45) / 0.37));
      s = Math.min(s, v);
    }
    return s;
  }

  // ---------------------------------------------------------------- per frame
  update(realDt) {
    if (this.over) return;
    if (this.live) { this.unpose(); this._pose(); } // (online: keep the live match's state, then pose the replay)
    const dt = Math.min(0.05, Math.max(0, realDt));
    this.st += dt; this.realDt = dt;
    if (this.titleT > 0 && (this.titleT -= dt) <= 0) this.el('reel-title').classList.remove('on');
    this.punch *= Math.exp(-dt * 5); this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.stage === 'outro') {
      if (this.st > 0.9) this.finish();
      else this._frame(0, dt);
      return;
    }
    if (this.stage === 'intro' || this.stage === 'card') { // the opening frame, held under the title
      this._frame(0, dt);
      if (this.st > 1.9) this._startPlay();
      return;
    }
    const c = this.clip;
    if (this.stage === 'pre') { this._preFrame(dt); return; }
    let sp = Math.min(1, this._speed(this.t) * c.boost);
    if (this.freeze > 0) { this.freeze -= dt; sp = 0.02; } // (the frame it lands, held)
    const step = dt * sp;
    this.fxStep = this.freeze > 0 ? dt * 0.12 : step; // (while it's held, the explosion still blooms)
    this.t += step;
    c.hits.forEach((h, n) => { if (!this.popped.has(h) && this.t >= h.ti) { this.popped.add(h); this._impact(h, n); } });
    // the match's bursts and sounds as they come (a hit's own wait for the food to land: see _impact)
    const upTo = Math.min(this.t, ...c.hits.filter((h) => !this.popped.has(h)).map((h) => (h.ti0 ?? h.ti) - 1e-4));
    if (upTo > this.evT) { this._events(this.evT, upTo); this.evT = upTo; }
    this._frame(step, dt);
    this._overlay(sp);
    const k = clamp((this.t - c.t0) / (c.tEnd - c.t0), 0, 1);
    this.el('reel-prog').style.width = `${((this.ci + k) / this.clips.length) * 100}%`;
    if (this.t >= c.tEnd) this._enterClip(this.ci + 1);
  }

  // The play starts (its caption up): with its lead-up first, if it has one.
  _startPlay() {
    this.st = 0;
    this._caption(this.clip);
    if (this.pre.length) { this.stage = 'pre'; this.pi = -1; this._nextPre(); } else this.stage = 'play';
  }
  // (0.46) The next hit of the lead-up (a cut to it), or on to the play itself.
  _nextPre() {
    this.pi++;
    const c = this.clip;
    this.cam.shot = -1; // (a cut)
    if (this.pi >= this.pre.length) { // the play
      this.stage = 'play';
      this.shots = this.mainShots; this.mainShots = null;
      this.t = c.t0; this.evT = c.t0; this.freeze = 0;
      for (const m of this.ghosts.values()) this._drop(m);
      this.ghosts.clear();
      return;
    }
    const p = this.pre[this.pi];
    this.mainShots ||= this.shots;
    this.shots = [p.shot];
    this.t = p.from; this.evT = p.from; p.popped = false;
  }
  _preFrame(dt) {
    const p = this.pre[this.pi];
    let sp = 1; // (at full speed: quick cuts, one after another)
    if (this.freeze > 0) { this.freeze -= dt; sp = 0.02; }
    const step = dt * sp;
    this.fxStep = step;
    this.t += step;
    if (!p.popped && this.t >= p.ti) { p.popped = true; this._preImpact(p); }
    const upTo = p.popped ? this.t : Math.min(this.t, p.ti - 1e-4);
    if (upTo > this.evT) { this._events(this.evT, upTo); this.evT = upTo; }
    this._frame(step, dt);
    this.root.classList.remove('slow', 'bullet');
    this.el('reel-prog').style.width = `${(this.ci / this.clips.length) * 100}%`;
    if (this.t >= p.to) this._nextPre();
  }
  // One of the lead-up's hits lands: a smaller pop than the play's, with what it took off them.
  _preImpact(p) {
    const g = this.g, at = p.path ? pathAt(p.path, Math.min(p.ti, pathEnd(p.path)), _h) : this.hl.posAt(p.b, p.ti, _h);
    this._events(this.evT, p.ti); this.evT = Math.max(this.evT, p.ti);
    const kind = BURST[p.food] || 'tomato';
    this.emitting = true; g.fx.burst(kind, at, 1.3); this.emitting = false;
    this._pop(`${p.head ? 'Headshot ' : ''}-${Math.round(p.amt)}`, 'pre', 0.1);
    this.freeze = 0.09; this.punch = 0.45; this.shake = Math.min(1, this.shake + 0.25);
    this._ring(at, 1.3, 0, 0.35, (PALETTE[kind] || PALETTE.tomato)[0]); // (small: the camera is close)
    this._sfx('thud', at, 0.75);
  }

  // The instant a throw lands (or whizzes past a dodger): freeze, flash, shockwave, lens punch, boom.
  _impact(h, n) {
    const c = this.clip, g = this.g, dodge = c.kind === 'dodge', ko = c.ko;
    this._events(this.evT, h.tk); this.evT = Math.max(this.evT, h.tk); // (its splat goes off as it lands)
    const at = h.path ? pathAt(h.path, h.ti, _h) : this.hl.posAt(dodge ? c.a : h.b, h.tk, _h);
    const big = ko && this.kos.has(h.b); // the splat itself
    const kind = BURST[h.food || c.food] || 'tomato', cols = PALETTE[kind] || PALETTE.tomato;
    if (big) { // (0.39) a bigger explosion than any hit: the food splattered everywhere, in its own colours
      this.emitting = true;
      g.fx.burst(kind, at, 2.6);
      g.fx.burst('splat-out', at);
      this.emitting = false;
      g.fx.spray('blobs', at, 90, { speed: 15, up: 11, colors: cols, size: 0.34, life: 1.5, grav: 0.8 });
      g.fx.spray('chunks', at, 40, { speed: 12, up: 9, colors: cols, size: 0.26, life: 1.6 });
      g.fx.spray('puffs', at, 10, { speed: 3, up: 2, colors: [cols[0]], size: 1.4, life: 0.9, grav: 0, grow: 2.2 });
    }
    let word;
    if (dodge) word = n ? `${mult(n + 1)} dodge!` : 'Dodged!';
    else if (h.head) word = 'Headshot!';
    else if (c.kind === 'snipe') word = ko ? 'Sniped!' : 'Snipe!';
    else if (c.kind === 'hit') word = 'Bam!';
    else word = n ? `${mult(n + 1)}!` : c.final && c.hits.length === 1 ? 'Winner!' : 'Splat!';
    if (!dodge && !n && !h.head && !(c.final && ko)) { // (0.50) a trick shot, an ability
      if (h.bank) word = ko ? 'Bank splat!' : 'Bank shot!';
      else if (h.nth > 1) word = 'Skewered!';
      else if (ABILITY[h.food || c.food] && c.kind !== 'snipe') word = ABILITY[h.food || c.food][2];
    }
    this._pop(word, dodge ? 'dodge' : ko ? 'ko' : '', dodge ? 0.15 : big ? 0.9 : ko ? 0.85 : 0.6);
    this.freeze = dodge ? 0.1 : big ? 0.32 : ko ? 0.24 : 0.15;
    this.punch = dodge ? 0.4 : big ? 1.35 : ko ? 1 : 0.7;
    this.shake = Math.min(1.2, this.shake + (dodge ? 0.1 : big ? 0.95 : ko ? 0.6 : 0.4));
    if (dodge) { this._sfx('whoosh', at, 0.9); return; }
    _x.subVectors(g.camera.position, at);
    const dl = _x.length();
    if (dl > 0.01) at.addScaledVector(_x, Math.min(0.6, dl * 0.3) / dl); // (just in front of them)
    this._ring(at, big ? 8 : ko ? 5.5 : 3.6, 0, big ? 0.75 : 0.55, big ? cols[0] : null); // (the splat's in the food's colour)
    if (ko) this._ring(at, big ? 5 : 3, 0.09, 0.55);
    if (big) this._ring(at, 3, 0.2, 0.5);
    this._sfx(ko ? 'boom' : 'thud', at, big ? 0.85 : ko ? 0.5 : 0.7);
    if (big) this._sfx('splatout', at, 0.8);
    if (this.distEl.classList.contains('on')) { this.distEl.classList.remove('hit'); void this.distEl.offsetWidth; this.distEl.classList.add('hit'); }
  }

  // The reel's own sounds (online, the live match's are muted while a reel plays).
  _sfx(name, pos, gain) { this.emitting = true; this.g.sfx.play(name, pos, gain); this.emitting = false; }
  // Bursts and sounds from the recording, between two moments.
  _events(a, b) {
    const g = this.g;
    for (const e of this.hl.events) {
      if (e.t <= a || e.t > b) continue;
      this.emitting = true;
      if (e.fx) g.fx.burst(e.fx, _c.set(e.x, e.y, e.z), e.p);
      else if (e.sfx) g.sfx.play(e.sfx, e.pos ? _d.set(e.pos[0], e.pos[1], e.pos[2]) : null, e.g);
      this.emitting = false;
    }
  }

  _ghost(pid, food, uv) {
    let m = this.ghosts.get(pid);
    if (!m) {
      m = this.g.projectiles.getMesh(food); m.userData.food = food; this.ghosts.set(pid, m);
      if (uv) { m.userData.uv = uv; m.userData.att = this.g.utensils.attach(uv.u, uv.x, uv.r, m.position); m.userData.trT = 0; } // (0.50) its utensil's coat
    }
    m.visible = true;
    return m;
  }
  // (0.50) A replayed utensil throw: its coat follows it, its trail puffs out behind.
  _coat(m, step) {
    const uv = m.userData.uv;
    if (!uv) return;
    const U = this.g.utensils;
    U.poseAttach(m.userData.att, m.position, uv.r, this.t, step);
    if ((m.userData.trT -= step) > 0 || this.g.fx.scale <= 0) return;
    m.userData.trT = uv.pel ? 0.09 : 0.045;
    this.emitting = true; U.trail(uv.u, m.userData.food, m.position, uv.x); this.emitting = false;
  }
  // (0.50) The utensil zones and puddles of the moment shown, as they were then.
  _world(t, step) {
    const g = this.g, U = g.utensils, S = g.surface, Ab = g.abilities, flames = [], lines = [];
    const shown = this.streams; this.streams = new Set();
    for (const e of this.hl.events) {
      if (!e.zone && !e.pud && !e.ab) continue;
      const on = t >= e.t && t < e.end;
      if (e.ab) { // an ability's storm, fires, spikes, flamethrower
        if (e.ab === 'wave' && !on && this.wg.has(e)) { U.legend._dropWave({ mesh: this.wg.get(e) }); this.wg.delete(e); continue; }
        if (e.ab === 'storm') {
          let v = this.ag.get(e);
          if (!on) { if (v) { Ab._dropVortex(v); this.ag.delete(e); } continue; }
          if (!v) { v = Ab.stormMesh({ pos: new THREE.Vector3(e.x, e.y, e.z), born: e.t, until: e.end, r: e.r }); this.ag.set(e, v); }
          Ab.stormLook(v, t, step);
        } else if (!on) continue;
        else if (e.ab === 'flame') flames.push({ pos: _u.set(e.x, e.y, e.z).clone(), r: e.r, born: e.t, until: e.end, seed: e.seed });
        else if (e.ab === 'spikes') lines.push({ born: e.t, until: e.end, pts: e.pts.map((p, i) => ({ p: new THREE.Vector3(p[0], p[1], p[2]), s: p[3], tilt: p[4], spin: p[5], up: t >= e.t + i * SPIKE_GAP })) });
        else if (e.ab === 'stream') { // (0.54) a Legendary torch's cone or blender's beam, from their hand the way they aimed
          const a = this.hl.actors[e.a];
          if (!a?.alive) continue;
          a.replayStream = true; this.streams.add(a);
          const L = U.legend;
          drawStream(L, a, e.u, e.food, step, null, Math.min(2, Math.floor((t - e.t) / 1.2)), t);
        } else if (e.ab === 'wave') {
          const m = U.legend.waveAt(this.wg.get(e), e.x, e.y, e.z, e.r, t - e.t);
          if (m) this.wg.set(e, m); else this.wg.delete(e);
        }
        else if (e.ab === 'flamer' && step > 0) { // from their hand, the way they faced
          const a = this.hl.actors[e.a];
          if (!a?.alive) continue;
          const p = Math.asin(clamp(a.aimDir.y, -0.6, 0.45));
          Ab.flamerFx(a.handPos(_rt), _up.set(-Math.sin(a.yaw) * Math.cos(p), Math.sin(p), -Math.cos(a.yaw) * Math.cos(p)));
        }
        continue;
      }
      if (e.zone) {
        let z = this.zg.get(e);
        if (!on) { if (z) { U._dropZone(z); this.zg.delete(e); } continue; }
        if (!z) {
          z = { kind: e.zone, pos: new THREE.Vector3(e.x, e.y, e.z), r: e.r, tint: e.tint, t0: e.t, until: e.t + e.dur, mesh: null };
          U.zoneMesh(z); this.zg.set(e, z);
        }
        if (e.wind) z.pos.set(e.x + e.wind[0] * (t - e.t), e.y, e.z + e.wind[1] * (t - e.t)); // (a cloud drifts on the wind)
        this.emitting = true; U.zoneLook(z, t, step); this.emitting = false;
      } else {
        let z = this.pg.get(e);
        if (!on) { if (z) { S.dropPuddle(z); this.pg.delete(e); } continue; }
        if (!z) { z = S.puddle(e.x, e.y, e.z, e.r, e.pud, e.t, e.end - e.t); this.pg.set(e, z); }
        S.posePuddle(z, t);
      }
    }
    for (const a of shown) if (!this.streams.has(a)) this._endStream(a); // (0.54: a replayed stream that stopped)
    Ab.drawAt(t, flames, lines);
  }
  _spin(m, q, r, k) { // a food's tumble between two frames
    _qa.setFromEuler(_ea.set(q[5], q[6], q[7])); _qb.setFromEuler(_eb.set(r[5], r[6], r[7]));
    m.quaternion.slerpQuaternions(_qa, _qb, k);
    if (m.userData.inner) m.userData.inner.rotation.x = angleLerp(q[8], r[8], k);
    const S = k < 0.5 ? q : r;
    m.scale.set(S[9] || 1, S[10] ?? S[9] ?? 1, S[11] ?? S[9] ?? 1); // (0.50: flat, stretched, as it flew)
  }

  // Pose everything at the clip's time, then the camera.
  _frame(step, realDt) {
    const g = this.g, hl = this.hl, t = this.t;
    g.time = t;
    const [j, k] = hl._at(t), fr = hl.frames, F = fr[j], N = fr[Math.min(j + 1, fr.length - 1)];
    hl.actors.forEach((a, i) => {
      const o = i * K;
      let A = F.a, B = N.a, flags = (k < 0.5 ? A : B)[o + 8], kk = linked(A, B, o) ? k : k < 0.5 ? 0 : 1; // (a respawn or a teleport: don't slide)
      // splatted in this play: still there as the food lands, then squashed flat into the confetti and
      // gone (online, however late the room said so)
      const ko = this.kos.get(i), inKo = ko && t >= ko.tk - 0.3 && t < Math.max(ko.dead, ko.tk + KO_HOLD) + 0.05;
      const hold = inKo && !linked(A, B, o); // (the recording has them gone already: their last pose)
      if (hold) { A = B = fr[ko.j].a; flags = A[o + 8]; kk = 0; }
      if (inKo && t >= ko.tk + KO_HOLD) flags = 0;
      const alive = (flags & FL.alive) !== 0;
      a.alive = alive; a.root.visible = alive;
      a.root.scale.set(1, 1, 1);
      if (!alive) { a.glint.visible = false; return; }
      if (hold) { const e = clamp(Math.min(t, ko.tk) - fr[ko.j].t, 0, 0.15); a.pos.set(A[o] + A[o + 5] * e, A[o + 1] + Math.max(0, A[o + 6]) * e, A[o + 2] + A[o + 7] * e); }
      else hl.posAt(i, t, a.pos, false);
      if (ko && t > ko.tk && t < ko.tk + KO_HOLD) {
        const u = (t - ko.tk) / KO_HOLD, xz = lerp(1, 1.6, smooth(u / 0.45)) * (1 - smooth((u - 0.6) / 0.4));
        a.root.scale.set(xz, lerp(1, 0.12, smooth(u / 0.7)), xz);
      }
      a.yaw = angleLerp(A[o + 3], B[o + 3], kk);
      a.aimDir.y = Math.sin(lerp(A[o + 4], B[o + 4], kk));
      a.vel.set(lerp(A[o + 5], B[o + 5], kk), lerp(A[o + 6], B[o + 6], kk), lerp(A[o + 7], B[o + 7], kk));
      a.onGround = !!(flags & FL.ground); a.gliding = !!(flags & FL.glide);
      a.dashT = flags & FL.dash ? 0.1 : 0;
      a.trippedUntil = flags & FL.trip ? t + 1 : 0; a.frozenUntil = flags & FL.frozen ? t + 1 : 0;
      a.rootedUntil = flags & FL.rooted ? t + 1 : 0; a.burnUntil = flags & FL.burning ? t + 1 : 0;
      a.charging = !!(flags & FL.charging); a.shieldUp = !!(flags & FL.shield);
      a.eat = flags & FL.eating ? (a.eat || { end: Infinity, done: () => {}, dmg: 0 }) : null;
      const held = (k < 0.5 ? A : B)[o + 11];
      const id = held >= 0 ? HELD[held] : null;
      if ((a.inv[0]?.id || null) !== id) a.inv[0] = id ? { id, count: 1 } : null;
      a.sel = 0;
      if ((a.heldId || null) !== id) a._refreshHeld();
      const ui = (k < 0.5 ? A : B)[o + 13];
      a.utensil = ui >= 0 ? UTENSIL_IDS[ui] : null; // (0.50) the utensil they had then (drawn by updateVisual)
      const food = id ? FOODS[id] : null;
      a.chargeT = lerp(A[o + 9], B[o + 9], kk) * Math.max(0.2, food?.charge || 1);
      a.armT = lerp(A[o + 10], B[o + 10], kk);
      a.hitFlash = Math.max(a.hitFlash, lerp(A[o + 12], B[o + 12], kk));
    });
    // the flying food: the throws in this play ride their flight paths, the rest their frames
    const seen = new Set();
    for (const [pid, P] of this.paths) {
      if (t < P.s[0] || t > pathEnd(P)) continue;
      seen.add(pid);
      const m = this._ghost(pid, P.food, P.u);
      pathAt(P, t, m.position, _v);
      const q = F.p.find((x) => x[0] === pid), r = N.p.find((x) => x[0] === pid);
      if (q || r) this._spin(m, q || r, r || q, k);
      if (P.orient && _v.lengthSq() > 1e-6) m.lookAt(_w.copy(m.position).sub(_v)); // (a carrot's tip leads)
      this._coat(m, step);
    }
    for (const q of F.p) {
      const pid = q[0], P = this.paths.get(pid);
      if (seen.has(pid) || (P && t >= P.s[0])) continue;
      const r = N.p.find((x) => x[0] === pid);
      if (!r && k >= 0.5) continue; // (it landed between these two frames)
      seen.add(pid);
      const m = this._ghost(pid, q[1], q[12]), R = r || q;
      m.position.set(lerp(q[2], R[2], k), lerp(q[3], R[3], k), lerp(q[4], R[4], k));
      this._spin(m, q, R, k);
      this._coat(m, step);
    }
    for (const r of N.p) { // (just thrown, between these two frames)
      const pid = r[0];
      if (seen.has(pid) || this.paths.has(pid) || k < 0.5 || F.p.some((x) => x[0] === pid)) continue;
      seen.add(pid);
      const m = this._ghost(pid, r[1], r[12]);
      m.position.set(r[2], r[3], r[4]);
      this._spin(m, r, r, 0);
      this._coat(m, step);
    }
    for (const [pid, m] of this.ghosts) if (!seen.has(pid)) { this._drop(m); this.ghosts.delete(pid); }
    this._world(t, step);
    g.world.setTide(lerp(F.tide[0], N.tide[0], k), lerp(F.tide[1], N.tide[1], k), lerp(F.tide[2], N.tide[2], k));
    // animate at the speed of play (slow motion slows the Titans too)
    for (const a of hl.actors) {
      a.updateVisual(Math.max(step, 1e-4), g.camera);
      if (a.glint.visible) a.glint.scale.multiplyScalar(0.45); // (a sniper's glint: not a flare over the whole shot)
    }
    g.utensils.updateVisual();
    g.fx.update(this.stage === 'play' ? this.fxStep ?? step : step);
    g._blobShadows();
    g.viewModel.update(realDt, g.player || g.actors[0], false);
    this._camera(realDt);
    this._drawTrails();
    this._drawRings(realDt);
  }

  // ---------------------------------------------------------------- the camera
  // How far from `look` along `w` (the way to the camera) everything in pts (and a margin r round
  // each) sits well inside the frame (kh, kv: how far toward its edges), letterbox bars and the
  // screen's shape included.
  _fitD(look, w, pts, r, fov, kh = 0.72, kv = 0.58) {
    const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const th = tv * this.g.camera.aspect * kh, tvv = tv * kv;
    _rt.crossVectors(UP, w);
    if (_rt.lengthSq() < 1e-8) _rt.set(1, 0, 0);
    _rt.normalize();
    _up.crossVectors(w, _rt);
    let D = 0;
    for (const p of pts) {
      _q.subVectors(p, look);
      const z = _q.dot(w);
      D = Math.max(D, z + (Math.abs(_q.dot(_rt)) + r) / th, z + (Math.abs(_q.dot(_up)) + r) / tvv);
    }
    return D;
  }

  // A phone held upright: a wider lens (as wide side to side as a landscape screen's, nearly), and the
  // over-the-shoulder camera closer in behind them.
  _lens(f) {
    const wide = clamp(1.2 / Math.max(0.3, this.g.camera.aspect), 1, 1.9);
    return wide > 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2) * wide)) : f;
  }
  get _side() { return 1.25 * Math.min(1, this.g.camera.aspect / 1.2); }
  // How far a camera can see from o along d (unit): to the first solid thing or drawn decoration.
  _clear(o, d, max) { return Math.min(raycastWorld(o, d, max), boxHit(this.g.world.sightBoxes, o, d, max)); }

  // Set a shot up the first time it's seen: the line from the star of the play to the other one, and
  // the side of it with room for the camera (raycasts: no shot from inside a cupboard).
  _initShot(s) {
    s.init = true;
    const hl = this.hl, c = this.clip, h = s.h;
    const kt = clamp(h.ti, s.from, s.to);
    const A = hl.posAt(c.a, s.type === 'hero' ? s.from : kt, new THREE.Vector3());
    const B = hl.posAt(h.b, Math.min(kt, h.tk), new THREE.Vector3());
    const d = new THREE.Vector3().subVectors(B, A).setY(0);
    s.dist = d.length();
    if (s.dist < 0.05) forwardOf(hl.yawAt(c.a, kt), d); else d.divideScalar(s.dist);
    s.dist = Math.max(1, s.dist); s.d = d; s.B = B; s.sg = this.lastSg;
    // (0.47) the line itself, up and down included: a throw off a shelf or up to one is framed along it
    s.d3 = new THREE.Vector3().subVectors(B, A); s.dist3 = Math.max(1, s.d3.length()); s.d3.divideScalar(s.dist3);
    if (Math.abs(s.d3.y) > 0.97) s.d3.addScaledVector(d, 0.25).normalize(); // (straight down: still a little ahead)
    const alpha = Math.atan2(d.z, d.x);
    // the first of these camera spots with a clear view of `at` (else the clearest), as [sg, ...]
    const pick = (at, list) => {
      let best = null;
      for (const [sg, spot] of list) {
        const dir = _p.subVectors(spot, at), len = dir.length();
        const free = this._clear(at, dir.divideScalar(len), len + 0.4) / len;
        if (free >= 1) return sg;
        if (!best || free > best[1]) best = [sg, free];
      }
      return best[0];
    };
    const both = (f) => [this.lastSg, -this.lastSg].map((sg) => [sg, f(sg)]);
    if (s.type === 'two') {
      const vs = s.hs.map((x) => hl.posAt(x.b, Math.min(kt, x.tk), new THREE.Vector3()));
      const Bc = vs.reduce((m, v) => m.add(v), new THREE.Vector3()).divideScalar(vs.length);
      const pts = [A, ...vs], L = A.clone().lerp(Bc, 0.5).addScaledVector(UP, 0.1);
      let best = null;
      search: for (const [beta, el] of [[0.42, 0.3], [0.42, 0.62], [1.05, 0.45]]) {
        for (const sg of [this.lastSg, -this.lastSg]) {
          const az = alpha + sg * (Math.PI / 2 + beta), w = dirOf(az, el, new THREE.Vector3());
          const D = clamp(this._fitD(L, w, pts, 1.3, this._lens(50)), 4.5, 30);
          // clear from the middle, and from each of them (none behind a cake from there)
          const C = _x.copy(L).addScaledVector(w, D);
          let free = this._clear(L, w, D + 0.6) / D;
          for (const p of pts) { const dir = _p.subVectors(C, p), len = dir.length(); if (len > 0.5) free = Math.min(free, this._clear(p, dir.divideScalar(len), len) / len + 0.001); }
          const cand = { az, el, sg, free };
          if (cand.free >= 1) { best = cand; break search; }
          if (!best || cand.free > best.free) best = cand;
        }
      }
      Object.assign(s, { az: best.az, el: best.el, sg: best.sg });
      this.lastSg = s.sg;
    } else if (s.type === 'reveal') { // beyond the one it hit, looking back along the throw
      const list = [];
      for (const [off, el] of [[0.55, 0.3], [0.9, 0.42], [0.3, 0.62]]) for (const sg of [this.lastSg, -this.lastSg]) list.push([[sg, off, el], B.clone().addScaledVector(dirOf(alpha + sg * off, el, _w), 7.5)]);
      [s.sg, s.off, s.el] = pick(B, list);
    } else if (s.type === 'setup') { // behind the star, looking down the line at the other one
      s.sg = pick(A, both((sg) => A.clone().addScaledVector(s.d3, -3.9).addScaledVector(_s.set(-d.z, 0, d.x), this._side * sg).addScaledVector(UP, 0.8)));
      this.lastSg = s.sg;
    } else if (s.type === 'hero') { // in front of the star, low, a little to one side
      s.fw = forwardOf(hl.yawAt(c.a, s.from), new THREE.Vector3());
      s.sg = pick(A, both((sg) => A.clone().addScaledVector(s.fw, 3.8).addScaledVector(_s.set(-s.fw.z, 0, s.fw.x), 2.6 * sg).addScaledVector(UP, -0.65)));
    } else if (s.type === 'bullet') {
      const P = h.path;
      s.hitP = pathAt(P, h.ti, new THREE.Vector3());
      const r = FOODS[P.food]?.radius ?? 0.35;
      s.back = 2.1 + r * 2.6; s.up = 0.3 + r * 0.5;
      // where the camera lets it go: a few metres short of the target
      const start = Math.max(s.from, P.s[0]);
      const gap = Math.min(5.5, pathAt(P, start, _x).distanceTo(s.hitP) * 0.38);
      let lo = start, hi = h.ti;
      for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (pathAt(P, mid, _x).distanceTo(s.hitP) > gap) lo = mid; else hi = mid; }
      s.tc = lo;
    } else if (s.type === 'matrix') {
      const C = hl.posAt(c.a, h.tk, new THREE.Vector3()), V = new THREE.Vector3(), Fp = new THREE.Vector3();
      if (h.path) pathAt(h.path, h.tk, Fp, V); else { V.copy(d); Fp.copy(C); }
      V.setY(0);
      if (V.lengthSq() < 1e-6) V.copy(d);
      V.normalize();
      const perp = new THREE.Vector3(-V.z, 0, V.x);
      // on the side it went past, so it flies between the camera and them (a big rolling cheese or
      // melon: the other side, or it would fill the shot)
      const big = (FOODS[h.path?.food]?.radius ?? 0.35) >= 0.5;
      const sg = (Math.sign(Fp.sub(C).dot(perp)) || 1) * (big ? -1 : 1);
      s.az = Math.atan2(perp.z * sg, perp.x * sg) - 0.75;
      // (circling into a wall or a cake: go round the other side)
      const blocked = (az) => [0, 1.1, 2.2].some((k) => this._clear(C, dirOf(az + k, 0.16, _w), 5.4) < 5);
      if (blocked(s.az)) { const alt = Math.atan2(-perp.z * sg, -perp.x * sg) - 0.75; if (!blocked(alt)) s.az = alt; }
    }
  }

  _camera(dt) {
    const g = this.g, hl = this.hl, c = this.clip, t = this.t, cam = g.camera;
    let si = this.shots.findIndex((s) => t >= s.from && t < s.to);
    if (si < 0) si = t < this.shots[0].from ? 0 : this.shots.length - 1;
    const s = this.shots[si], h = s.h;
    const cut = this.cam.shot !== si || this.cam.clip !== this.ci;
    if (cut) { this.cam.shot = si; this.cam.clip = this.ci; this.cam.rt = 0; } else if (this.stage === 'play') this.cam.rt += dt;
    if (!s.init) this._initShot(s);
    const rt = this.cam.rt, pos = _e, look = _f, star = hl.posAt(c.a, t, _a);
    let fov = 50, from = star, roll = 0;
    if (s.type === 'flash') { // (0.46) a lead-up hit: close beside whoever it hits, the food coming in across the shot
      const B = hl.posAt(h.b, t, _c);
      if (h.path) pathAt(h.path, Math.max(h.path.s[0], h.ti - 0.15), _p); else hl.posAt(h.a, h.ti, _p);
      _d.subVectors(_p, B).setY(0);
      if (_d.lengthSq() < 1e-4) forwardOf(hl.yawAt(h.b, t), _d);
      _d.normalize(); // (the way it comes from)
      _s.set(-_d.z, 0, _d.x).multiplyScalar(s.sg);
      const k = smooth((t - s.from) / (s.to - s.from));
      pos.copy(B).addScaledVector(_s, 3.6 - 0.8 * k).addScaledVector(_d, 1.5).addScaledVector(UP, 0.85);
      look.copy(B).addScaledVector(_d, 0.8).addScaledVector(UP, 0.3);
      fov = lerp(54, 45, k);
      from = B;
    } else if (s.type === 'setup') { // over the star's shoulder, down the line at the other one (the throw going out, or coming in)
      const side = _g.set(-s.d.z, 0, s.d.x).multiplyScalar(s.sg);
      pos.copy(star).addScaledVector(s.d3, -3.9 + Math.min(0.6, rt * 0.3)).addScaledVector(side, this._side).addScaledVector(UP, 0.8);
      // (0.47) down the real line, up or down included (a target far below is in the shot), the star still in it
      look.copy(star).addScaledVector(s.d3, Math.min(s.dist3 * 0.42, 15)).addScaledVector(UP, 0.4);
      fov = 50;
    } else if (s.type === 'bullet') { // riding along behind the food, the target ahead; the last metres it flies alone
      const P = h.path;
      pathAt(P, Math.min(t, s.tc), _p, _v);
      if (_v.lengthSq() < 1e-6) _v.copy(s.d);
      _v.normalize();
      _s.set(-_v.z, 0, _v.x);
      if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0);
      _s.normalize().multiplyScalar(s.sg);
      pos.copy(_p).addScaledVector(_v, -s.back).addScaledVector(UP, s.up).addScaledVector(_s, 0.5);
      const ku = smooth((t - s.from) / Math.max(0.05, h.ti - s.from));
      pathAt(P, Math.min(t, h.ti), _q, _u);
      if (_u.lengthSq() > 1e-6) _q.addScaledVector(_u.normalize(), 6);
      look.copy(_q).lerp(s.hitP, t >= h.ti ? 1 : 0.4 + 0.6 * ku);
      fov = t >= h.ti ? 44 : lerp(64, 46, ku);
      from = _p; // (walls: look from the food)
      if (this.stage === 'play' && !s.whoosh) { s.whoosh = true; this._sfx('whoosh', null, 0.75); }
      roll = 0.07 * s.sg * (t >= h.ti ? 0.3 : 1);
    } else if (s.type === 'two') { // from beside them all, drifting round, leaning to the splat after it lands
      const pts = this._pts;
      pts.length = 0; pts.push(star);
      _c.set(0, 0, 0);
      s.hs.forEach((x, i) => { const v = hl.posAt(x.b, Math.min(t, x.tk), (this._vs[i] ||= new THREE.Vector3())); pts.push(v); _c.add(v); });
      _c.divideScalar(s.hs.length); // (the ones it hit, where it hit them)
      look.copy(star).lerp(_c, 0.5 + 0.12 * smooth((t - h.ti) / 0.5)).addScaledVector(UP, 0.1);
      // (0.47) if the view is blocked (a wall, a cupboard), up higher over it, not in close (which loses them both)
      let D = 0;
      for (const lift of [0, 0.35, 0.7, 1.05]) {
        dirOf(s.az - s.sg * Math.min(0.42, rt * 0.07), Math.min(1.35, s.el + (s.lift || 0) + lift), _w);
        D = clamp(this._fitD(look, _w, pts, 1.3, this._lens(fov)) * (1 - Math.min(0.1, rt * 0.02)), 4.5, 42);
        if (this._clear(look, _w, D + 0.4) >= D * 0.9 || lift === 1.05) { if (lift) s.lift = (s.lift || 0) + lift; break; }
      }
      pos.copy(look).addScaledVector(_w, D);
      from = look;
    } else if (s.type === 'reveal') { // the reverse angle: beyond the one it hit, back along the arc to the thrower
      const Bv = hl.posAt(h.b, this.kos.has(h.b) ? Math.min(t, h.tk) : t, _c); // (knocked out: where it happened; else after them)
      pos.copy(Bv).addScaledVector(dirOf(Math.atan2(s.d.z, s.d.x) + s.sg * (s.off + Math.min(0.25, rt * 0.05)), s.el, _w), lerp(7.5, 6.6, smooth(rt / 2)));
      look.copy(Bv).lerp(star, Math.min(0.3, 7 / s.dist3)).addScaledVector(UP, 0.3);
      look.y = clamp(look.y, Bv.y - 1.6, Bv.y + 2.2); // (0.47: the thrower way up or down: the one it hit stays in the shot)
      fov = 56;
      from = Bv;
    } else if (s.type === 'matrix') { // bullet time: circling the dodger as it goes by
      const C = hl.posAt(c.a, Math.min(t, h.tk + 0.6), _c);
      pos.copy(C).addScaledVector(dirOf(s.az + 2.2 * (1 - Math.exp(-rt * 0.35)), 0.16, _w), 5.4); // (slowing as it goes round)
      look.copy(C).addScaledVector(UP, 0.05);
      fov = 48;
      roll = -0.05;
    } else { // the hero shot: low, in front of whoever made the play, looking up at them, pushing in
      const Fe = hl.posAt(c.a, t, _c, false);
      const side = _g.set(-s.fw.z, 0, s.fw.x).multiplyScalar(s.sg), R = lerp(4.6, 3.9, smooth(rt / 2.2));
      pos.copy(Fe).addScaledVector(s.fw, R * 0.82).addScaledVector(side, R * 0.57).addScaledVector(UP, 0.4);
      look.copy(Fe).addScaledVector(UP, 1.3);
      fov = 46;
      if (this.stage === 'play' && !s.sting && this.ci === this.clips.length - 1) { s.sting = true; this._sfx('win', null, 0.5); } // (the best play: a fanfare)
      if (c.final) { // the winning splat: up and away over the arena
        const k = smooth((rt - 0.9) / 1.8);
        pos.addScaledVector(s.fw, 4 * k).addScaledVector(side, 1.5 * k).addScaledVector(UP, 5.5 * k);
        fov += 12 * k;
      }
    }
    fov = this._lens(fov);
    // keep the camera out of walls: pull it in front of whatever is between it and what it's on
    // (for a shot of someone, their head too)
    const eyes = s.type === 'hero' || s.type === 'setup' ? [from, _h.copy(star).addScaledVector(UP, 0.85)] : [from];
    for (const o of eyes) {
      _d.subVectors(pos, o);
      const len = _d.length();
      if (len < 0.01) continue;
      _d.divideScalar(len);
      const hit = this._clear(o, _d, len + 0.3);
      if (hit < len) pos.copy(o).addScaledVector(_d, s.type === 'bullet' ? Math.max(0.4, hit - 0.25) : Math.max(s.type === 'flash' ? 1.8 : 1.2, hit - 0.35));
    }
    if (pos.y < FLOOR_Y + 0.4) pos.y = FLOOR_Y + 0.4;
    // a cut between shots, smooth within one
    if (cut) {
      this.cam.pos.copy(pos); this.cam.look.copy(look); this.cam.fov = fov; this.cam.roll = roll;
    } else {
      const r = s.type === 'bullet' ? 18 : s.type === 'hero' || s.type === 'setup' ? 12 : s.type === 'matrix' || (s.type === 'reveal' && !this.kos.has(h.b)) ? 10 : 6; // (0.47: over the shoulder keeps up with a dashing thrower)
      this.cam.pos.set(damp(this.cam.pos.x, pos.x, r, dt), damp(this.cam.pos.y, pos.y, r, dt), damp(this.cam.pos.z, pos.z, r, dt));
      this.cam.look.set(damp(this.cam.look.x, look.x, r, dt), damp(this.cam.look.y, look.y, r, dt), damp(this.cam.look.z, look.z, r, dt));
      this.cam.fov = damp(this.cam.fov, fov, 4, dt);
      this.cam.roll = damp(this.cam.roll || 0, roll, 3, dt);
    }
    cam.position.copy(this.cam.pos);
    if (this.shake > 0) {
      const k = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k;
    }
    cam.lookAt(this.cam.look);
    if (this.cam.roll) cam.rotateZ(this.cam.roll); // (a tilt while riding a throw, or circling a dodge)
    const f = this.cam.fov - this.punch * 9; // (the lens punches in on an impact)
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    _d.subVectors(this.cam.look, cam.position).setY(0).normalize();
    g.sfx.setListener(cam.position, _c.set(-_d.z, 0, _d.x));
  }
}
