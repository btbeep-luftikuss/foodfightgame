// Highlight reels (0.36). While a match vs bots plays, the game records what you could see, 15 times
// a second: every Titan's pose (where it is and faces, its aim, moving, gliding, dashing, charging,
// what it holds), every flying food, every burst and every sound. It also scores the moments worth
// seeing again:
//   - splats: knockouts by a throw or an ability; more for a long throw, a headshot, a double or
//     triple splat (one Titan splatting several in a few seconds), and the splat that won the match;
//   - snipes: a hit from 30 m or more (a snipe splat if it knocked them out);
//   - dodges: a dangerous throw passing within a metre of a Titan who was running, dashing or in the
//     air, and missing (a double dodge when two come close together);
//   - big hits (your reel only, to fill it out): a hit of 30 or more, or a headshot.
// Only the frames around those moments are kept (plus the last 9 s), so a long match stays small.
//
// At the end a reel plays the best of them back, best last: over the thrower's shoulder, chasing the
// food through the air, slow motion as it lands with an orbit round the splat, then a crane up and
// away; letterbox bars, a caption per play, a flash and a big word on every impact, a title card
// before the best play. Two reels: the whole match ("Match highlights"), and only your own plays
// ("Your highlights"). While a reel plays the match is frozen; afterwards everything is put back.
import * as THREE from 'three';
import { clamp, damp, lerp, raycastWorld, segPointDist2, angleLerp, FLOOR_Y } from './core.js';
import { FOODS, FOOD_IDS } from './foods.js';

const HZ = 15;                // frames a second
const K = 13;                 // numbers per Titan per frame: x y z yaw pitch vx vy vz flags charge armT held hitFlash
const FL = { alive: 1, ground: 2, glide: 4, dash: 8, trip: 16, frozen: 32, rooted: 64, charging: 128, shield: 256, eating: 512, burning: 1024 };
const KEEP = 9;               // seconds of the latest frames always kept (a throw can fly for 6 s)
const SNIPE = 30;             // metres: a hit from this far is a snipe
const DODGE_R = 1.1;          // a dangerous throw passing this close to a Titan's body (and missing) is a dodge
const HELD = [...FOOD_IDS, 'peel'];
const SLOW = 0.22;            // slow-motion speed at an impact
const MAX_MOMENTS = 90;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const foodName = (id) => (FOODS[id]?.name || '').replace(/ies$/, 'y').replace(/s$/, '');

export class Highlights {
  constructor(game) {
    this.game = game;
    this.on = false;            // recording
    this.playing = null;        // the reel playing now
    this.frames = []; this.events = []; this.moments = [];
    this.actors = []; this.idx = new Map(); this.meta = [];
    this.nextPid = 1; this.sampleAt = 0; this.pruneAt = 0;
    this.lastHit = new Map();   // victim -> the last hit on them
    this.pending = null;        // the throw hitting someone this instant (its damage follows)
    // every burst and sound, so a replay looks and sounds like the match
    const fx = game.fx, sfx = game.sfx;
    const burst = fx.burst.bind(fx), play = sfx.play.bind(sfx);
    fx.burst = (kind, pos, power) => {
      if (this.on && !this.playing && pos) this.events.push({ t: game.time, fx: kind, x: pos.x, y: pos.y, z: pos.z, p: power });
      return burst(kind, pos, power);
    };
    sfx.play = (name, pos, gain) => {
      if (this.on && !this.playing) this.events.push({ t: game.time, sfx: name, pos: pos ? [pos.x, pos.y, pos.z] : null, g: gain });
      return play(name, pos, gain);
    };
  }

  // ------------------------------------------------------------------ recording
  // A new match: record it if it's yours and offline (online, other players' games decide too much).
  start() {
    this.stop();
    const g = this.game;
    this.frames = []; this.events = []; this.moments = [];
    this.lastHit.clear(); this.pending = null;
    this.on = !!g.player && !g.online;
    this.actors = [...g.actors];
    this.idx = new Map(this.actors.map((a, i) => [a, i]));
    this.meta = this.actors.map((a) => ({ name: a.name, color: a.color }));
    this.sampleAt = 0; this.pruneAt = g.time + 1;
  }
  stopRecording() { this.on = false; }

  // Every simulation step (30 a second): watch for dodges; a frame 15 times a second.
  step() {
    if (!this.on || this.playing) return;
    const g = this.game, t = g.time;
    this._watchDodges(t);
    if (t < this.sampleAt) return;
    this.sampleAt = t + 1 / HZ - 1e-4;
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
    });
    const proj = [];
    for (const p of g.projectiles.list) {
      if (p.done || !p.hl || !p.mesh?.visible) continue;
      const m = p.mesh;
      proj.push([p.hl.id, p.food, m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z, m.userData.inner?.rotation.x || 0, m.scale.x]);
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
    const keep = (x) => x >= from || wins.some(([a, b]) => x >= a && x <= b);
    this.frames = this.frames.filter((f) => keep(f.t));
    this.events = this.events.filter((e) => keep(e.t));
  }

  onLaunch(p) {
    if (!this.on || this.playing) return;
    p.hl = { id: this.nextPid++, t: this.game.time, from: (p.owner?.pos || p.pos).clone(), owner: p.owner, near: null };
  }

  // A throw hits a Titan (its damage, if any, follows in the same instant).
  onProjectileHit(p, a, head) {
    if (!this.on || !p.hl || !p.owner || p.owner === a) return;
    this.pending = { victim: a, by: p.owner, t: this.game.time, launchT: p.hl.t, dist: p.hl.from.distanceTo(a.pos), pid: p.hl.id, head: !!head, food: p.food };
  }

  onDamage(target, attacker, amt, foodId, opts = {}) {
    if (!this.on || this.playing || !attacker || attacker === target || !this.idx.has(attacker) || !this.idx.has(target)) return;
    const g = this.game;
    const pend = this.pending && this.pending.victim === target && this.pending.by === attacker && this.pending.t === g.time ? this.pending : null;
    const rec = pend ? { ...pend, amt } : { victim: target, by: attacker, t: g.time, launchT: null, dist: attacker.pos.distanceTo(target.pos), pid: 0, head: !!opts.head, food: foodId, amt };
    this.lastHit.set(target, rec);
    if (pend && rec.dist >= SNIPE && amt >= 14) this._snipe(rec); // (not a stray berry or grape)
    else if (attacker === g.player && (amt >= 30 || rec.head)) this._bigHit(rec);
  }

  _hit(rec) { return { tk: rec.t, tt: rec.launchT, b: this.idx.get(rec.victim), pid: rec.pid }; }

  _snipe(rec) {
    const a = this.idx.get(rec.by), hit = this._hit(rec);
    const old = this.moments.find((m) => m.pid === rec.pid && m.kind === 'snipe');
    if (old) return; // the same throw (it pierced on through someone else)
    this._add({
      kind: 'snipe', a, hits: [hit], pid: rec.pid, dist: rec.dist, food: rec.food, head: rec.head, amt: rec.amt, ko: false, count: 1,
      score: 32 + Math.min(36, (rec.dist - SNIPE) * 1.2) + (rec.head ? 15 : 0) + Math.min(20, rec.amt / 3),
    });
  }

  _bigHit(rec) {
    const a = this.idx.get(rec.by);
    if (this.moments.some((m) => m.a === a && Math.abs(m.hits.at(-1).tk - rec.t) < 2)) return; // already part of a play
    this._add({ kind: 'hit', a, hits: [this._hit(rec)], pid: rec.pid, dist: rec.dist, food: rec.food, head: rec.head, amt: rec.amt, ko: false, count: 1, score: 12 + rec.amt / 2 + (rec.head ? 12 : 0) });
  }

  onKill(victim, killer, foodId) {
    if (!this.on || this.playing || !killer || killer === victim || !this.idx.has(killer) || !this.idx.has(victim)) return;
    const g = this.game, t = g.time;
    const a = this.idx.get(killer), b = this.idx.get(victim);
    const h = this.lastHit.get(victim);
    const link = h && h.by === killer && t - h.t < 6 ? h : null;
    const dist = link ? link.dist : killer.pos.distanceTo(victim.pos);
    const hit = link ? this._hit(link) : { tk: t, tt: null, b, pid: 0 };
    hit.tk = t; hit.b = b;
    const air = !killer.onGround;
    const bonus = Math.min(40, dist * 0.8) + (link?.head ? 15 : 0) + (air ? 10 : 0);
    // a snipe that knocked them out: a snipe splat
    const snipe = link?.pid ? this.moments.find((m) => m.kind === 'snipe' && m.pid === link.pid && m.hits[0].b === b) : null;
    if (snipe) { snipe.ko = true; snipe.score += 45; snipe.t1 = Math.max(snipe.t1, t + 2.2); return; }
    // a double, a triple ...: the same Titan splatted someone a moment ago
    const prev = this.moments.find((m) => m.ko && m.a === a && t - m.hits.at(-1).tk < 4.5);
    if (prev) {
      prev.hits.push(hit); prev.count++;
      prev.score += 40 + bonus * 0.5;
      prev.t1 = t + 2.2;
      return;
    }
    // (a big hit that was the same throw becomes this splat)
    const big = this.moments.findIndex((m) => m.kind === 'hit' && m.a === a && Math.abs(m.hits[0].tk - t) < 0.3);
    if (big >= 0) this.moments.splice(big, 1);
    this._add({ kind: 'splat', a, hits: [hit], pid: hit.pid, dist, food: link?.food || foodId, head: !!link?.head, ko: true, count: 1, score: 48 + bonus });
  }

  // The match is over: the last splat won it.
  onOver() {
    if (!this.on) return;
    const t = this.game.time;
    const last = this.moments.filter((m) => m.ko && t - m.hits.at(-1).tk < 3).sort((p, q) => q.hits.at(-1).tk - p.hits.at(-1).tk)[0];
    if (last) { last.final = true; last.score += 35; }
  }

  // Dangerous throws passing close: how close each came to each Titan; when it moves off again
  // without hitting them, that's a dodge (if they were moving, dashing or in the air).
  _watchDodges(t) {
    const g = this.game;
    for (const p of g.projectiles.list) {
      if (p.done || !p.hl || !p.owner || p.life < 0.08) continue;
      const F = FOODS[p.food];
      if (!F || !(F.dmg >= 12)) continue; // (berries and grape shot whizz past all the time)
      for (const a of this.actors) {
        if (!a.alive || a === p.owner || g.teammates(a, p.owner)) continue;
        _a.set(a.pos.x, a.pos.y + 0.5, a.pos.z); _b.set(a.pos.x, a.pos.y + 1.74, a.pos.z);
        const d = Math.sqrt(segPointDist2(_a, _b, p.pos)) - (p.radius || 0.35);
        let e = p.hl.near?.get(a);
        if (d < DODGE_R) {
          if (!e) { e = { d: 99, done: false }; (p.hl.near ||= new Map()).set(a, e); }
          if (d < e.d && !e.done) {
            Object.assign(e, { d, t, speed: Math.hypot(a.vel.x, a.vel.z), air: !a.onGround, dash: a.dashT > 0 || !!a.tdash });
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
    const hit = { tk: e.t, tt: p.hl.t, b: bi, pid: p.hl.id };
    const score = 24 + (DODGE_R - e.d) * 16 + (e.dash ? 14 : 0) + (e.air ? 8 : 0) + Math.min(14, e.v / 4) + (FOODS[p.food]?.dmg >= 30 ? 8 : 0);
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
  // The plays for a reel: 'all' (the match) or 'me' (your own), best last.
  reel(mode) {
    const fr = this.frames;
    if (fr.length < 10) return [];
    const first = fr[0].t, last = fr.at(-1).t;
    const me = this.idx.get(this.game.player);
    let pool = this.moments.filter((m) => m.t0 >= first - 0.01 && m.hits.at(-1).tk <= last - 0.3);
    pool = mode === 'me' ? pool.filter((m) => m.a === me) : pool.filter((m) => m.kind !== 'hit');
    // a dodge that was splatted straight after isn't one to show
    for (const m of pool) if (m.kind === 'dodge' && !this._aliveAt(m.a, Math.min(last, m.hits.at(-1).tk + 1.2))) m.score *= 0.4;
    pool.sort((p, q) => q.score - p.score);
    const max = mode === 'me' ? 5 : 6, kinds = {}, out = [];
    for (const m of pool) {
      if (out.length >= max) break;
      if (out.some((o) => Math.min(o.t1, m.t1) - Math.max(o.t0, m.t0) > 0.4 * Math.min(o.t1 - o.t0, m.t1 - m.t0))) continue; // overlaps a chosen one
      if ((kinds[m.kind] || 0) >= 3 && pool.length > max) continue; // a mix of plays
      kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      out.push({ ...m, t0: Math.max(m.t0, first), t1: Math.min(m.t1, last) });
    }
    return out.sort((p, q) => p.score - q.score);
  }
  has(mode) { return this.reel(mode).length > 0; }

  play(mode, onDone) {
    if (this.playing) return false;
    const clips = this.reel(mode);
    if (!clips.length) return false;
    this.playing = new Reel(this, clips, mode, (quiet) => { this.playing = null; if (!quiet) onDone?.(); });
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
  // A Titan's middle (or feet) at time t.
  posAt(i, t, out = new THREE.Vector3(), mid = true) {
    const [j, k] = this._at(t), A = this.frames[j].a, B = this.frames[Math.min(j + 1, this.frames.length - 1)].a, o = i * K;
    out.set(lerp(A[o], B[o], k), lerp(A[o + 1], B[o + 1], k) + (mid ? 1.05 : 0), lerp(A[o + 2], B[o + 2], k));
    return out;
  }
  // A flying food at time t (null if it isn't in the air then).
  projAt(pid, t, out = new THREE.Vector3()) {
    if (!pid) return null;
    const [j, k] = this._at(t), fr = this.frames;
    const p = fr[j].p.find((q) => q[0] === pid), q = fr[Math.min(j + 1, fr.length - 1)].p.find((r) => r[0] === pid);
    if (!p && !q) return null;
    const P = p || q, Q = q || p;
    return out.set(lerp(P[2], Q[2], k), lerp(P[3], Q[3], k), lerp(P[4], Q[4], k));
  }
}

// ---------------------------------------------------------------------------------------------
// One reel playing: poses the Titans and the flying food from the recording, replays the bursts and
// sounds, directs the camera and runs the overlay. The live match waits, and is put back after.
class Reel {
  constructor(hl, clips, mode, done) {
    this.hl = hl; this.g = hl.game; this.clips = clips; this.mode = mode; this.done = done;
    this.ghosts = new Map(); // pid -> mesh
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, shot: -1 };
    this._save();
    this.el = (id) => document.getElementById(id);
    this.root = this.el('reel');
    this.root.hidden = false;
    document.body.classList.add('reeling');
    this.root.classList.remove('out');
    this.el('reel-cap').classList.remove('on');
    this.ci = -1; this.stage = 'intro'; this.st = 0; this.t = 0;
    const me = this.g.player && this.hl.idx.get(this.g.player);
    this.me = me;
    this._title(mode === 'me' ? 'Your highlights' : 'Match highlights', `${clips.length} ${clips.length === 1 ? 'play' : 'plays'}${mode === 'me' ? ' starring you' : ''}`);
    this._enterClip(0, true);
  }

  // ---------------------------------------------------------------- save and put back the live match
  _save() {
    const g = this.g;
    this.saved = {
      time: g.time, fovKick: g.fovKick, fov: g.camera.fov,
      camPos: g.camera.position.clone(), camQ: g.camera.quaternion.clone(),
      tide: [g.tide.x, g.tide.z, g.tide.r],
      actors: this.hl.actors.map((a) => ({
        a, pos: a.pos.clone(), vel: a.vel.clone(), yaw: a.yaw, aimY: a.aimDir.y, alive: a.alive, vis: a.root.visible,
        onGround: a.onGround, gliding: a.gliding, dashT: a.dashT, frozenUntil: a.frozenUntil, trippedUntil: a.trippedUntil,
        rootedUntil: a.rootedUntil, burnUntil: a.burnUntil, charging: a.charging, chargeT: a.chargeT, armT: a.armT,
        eat: a.eat, shieldUp: a.shieldUp, inv: a.inv, sel: a.sel, hitFlash: a.hitFlash, fpCam: a.fpCam,
      })),
      projVis: this.g.projectiles.list.map((p) => [p, p.mesh.visible]),
      hud: !g.hud.el.hidden,
    };
    for (const p of this.g.projectiles.list) p.mesh.visible = false;
    g.hud.show(false);
    g.previewDots.count = 0;
    g.fx.clear();
    for (const a of this.hl.actors) { a.fpCam = null; a.inv = [null, null, null, null, null]; a.sel = 0; }
  }
  _restore() {
    const g = this.g, s = this.saved;
    for (const m of this.ghosts.values()) g.projectiles.releaseMesh(m.userData.food, m);
    this.ghosts.clear();
    for (const x of s.actors) {
      const a = x.a;
      Object.assign(a, {
        yaw: x.yaw, alive: x.alive, onGround: x.onGround, gliding: x.gliding, dashT: x.dashT, frozenUntil: x.frozenUntil,
        trippedUntil: x.trippedUntil, rootedUntil: x.rootedUntil, burnUntil: x.burnUntil, charging: x.charging, chargeT: x.chargeT,
        armT: x.armT, eat: x.eat, shieldUp: x.shieldUp, inv: x.inv, sel: x.sel, hitFlash: x.hitFlash, fpCam: x.fpCam,
      });
      a.pos.copy(x.pos); a.vel.copy(x.vel); a.aimDir.y = x.aimY;
      a.root.visible = x.vis;
      a._refreshHeld();
    }
    for (const [p, v] of s.projVis) p.mesh.visible = v && !p.done;
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
    document.body.classList.remove('reeling');
    this.el('reel-title').classList.remove('on');
    this._restore();
    this.done(quiet);
  }
  skip() { this.finish(); }
  next() { if (this.stage !== 'outro') this._enterClip(this.ci + 1); }

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
    const mult = ['', '', 'Double', 'Triple', 'Quadruple'][n] || `${n}x`;
    let kind, text;
    if (c.kind === 'dodge') {
      kind = n > 1 ? `${mult} dodge` : 'Dodge';
      text = `${a} dodged ${n > 1 ? `${n} throws` : `${b}'s ${food || 'throw'}`}`;
    } else if (c.kind === 'snipe') {
      kind = c.ko ? 'Snipe splat' : 'Snipe';
      text = `${a} ${c.ko ? 'splatted' : 'hit'} ${b} from <b>${Math.round(c.dist)} m</b>${food ? ` with ${/^[aeiou]/i.test(food) ? 'an' : 'a'} ${food}` : ''}`;
    } else if (c.kind === 'hit') {
      kind = c.head ? 'Headshot' : 'Big hit';
      text = `${a} hit ${b} for <b>${Math.round(c.amt)}</b>`;
    } else {
      kind = c.final ? (n > 1 ? `${mult} splat to win` : 'Winning splat') : n > 1 ? `${mult} splat` : 'Splat';
      const victims = c.hits.map((h) => this._name(h.b));
      text = `${a} splatted ${victims.length > 1 ? `${victims.slice(0, -1).join(', ')} and ${victims.at(-1)}` : victims[0]}${c.dist >= 12 && n === 1 ? ` from <b>${Math.round(c.dist)} m</b>` : ''}`;
    }
    this.el('reel-kind').textContent = kind;
    this.el('reel-text').innerHTML = text;
    this.el('reel-n').textContent = `${this.ci + 1} / ${this.clips.length}`;
    const cap = this.el('reel-cap');
    cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on');
  }
  _pop(word) {
    const p = this.el('reel-pop');
    p.textContent = word;
    p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
    const f = this.el('reel-flash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  // ---------------------------------------------------------------- clips
  _enterClip(i, first = false) {
    if (i >= this.clips.length) { this.stage = 'outro'; this.st = 0; this.el('reel-cap').classList.remove('on'); this.root.classList.add('out'); return; }
    this.ci = i;
    const c = this.clips[i];
    this.clip = c;
    this.shots = this._plan(c);
    this.t = c.t0; this.evAt = c.t0;
    this.popped = new Set();
    this.cam.shot = -1;
    for (const m of this.ghosts.values()) this.g.projectiles.releaseMesh(m.userData.food, m);
    this.ghosts.clear();
    this.g.fx.clear();
    const best = i === this.clips.length - 1 && this.clips.length > 1;
    if (first) { this.stage = 'intro'; this.st = 0; } else if (best) {
      this.stage = 'card'; this.st = 0;
      this.el('reel-cap').classList.remove('on');
      this._title(this.mode === 'me' ? 'Your best play' : 'Play of the match', '');
    } else { this.stage = 'play'; this.st = 0; this._caption(c); }
    this.el('reel-fade').classList.remove('on'); void this.el('reel-fade').offsetWidth; this.el('reel-fade').classList.add('on');
  }

  // Camera shots for a play, in match time: per hit, over the thrower's shoulder, then chasing the
  // food (a long flight), then slow motion round the impact; a crane up to finish.
  _plan(c) {
    const shots = [];
    let at = c.t0;
    c.hits.forEach((h, n) => {
      const tt = h.tt != null ? h.tt : null;
      const close = n > 0 && h.tk - c.hits[n - 1].tk < 1.6;
      if (c.kind === 'dodge') {
        if (!close) shots.push({ type: 'wide', from: at, to: h.tk - 0.55, h });
        shots.push({ type: 'side', from: close ? at : h.tk - 0.55, to: h.tk + 0.75, h });
        at = h.tk + 0.75;
        return;
      }
      if (!close) {
        const throwEnd = tt != null ? Math.min(h.tk - 0.3, tt + 0.35) : h.tk - 0.9;
        if (throwEnd > at + 0.2) shots.push({ type: 'shoulder', from: at, to: throwEnd, h });
        at = Math.max(at, throwEnd);
        if (h.pid && tt != null && h.tk - at > 0.55) { shots.push({ type: 'chase', from: at, to: h.tk - 0.28, h }); at = h.tk - 0.28; }
      }
      shots.push({ type: 'orbit', from: at, to: h.tk + 0.95, h });
      at = h.tk + 0.95;
    });
    shots.push({ type: 'crane', from: at, to: Math.max(at + 0.5, c.t1), h: c.hits.at(-1) });
    return shots;
  }

  // Speed of play at match time t: slow motion round each impact.
  _speed(t) {
    let s = 1;
    for (const h of this.clip.hits) s = Math.min(s, lerp(1, SLOW, smooth((0.62 - Math.abs(t - h.tk)) / 0.27)));
    return s;
  }

  // ---------------------------------------------------------------- per frame
  update(realDt) {
    if (this.over) return;
    const dt = Math.min(0.05, Math.max(0, realDt));
    this.st += dt;
    if (this.titleT > 0 && (this.titleT -= dt) <= 0) this.el('reel-title').classList.remove('on');
    if (this.stage === 'outro') {
      if (this.st > 0.9) this.finish();
      else this._frame(0, dt);
      return;
    }
    if (this.stage === 'intro' || this.stage === 'card') { // the opening frame, held under the title
      this._frame(0, dt);
      if (this.st > 1.9) { this.stage = 'play'; this.st = 0; this._caption(this.clip); }
      return;
    }
    const sp = this._speed(this.t);
    const step = dt * sp;
    const prev = this.t;
    this.t += step;
    this.el('reel').classList.toggle('slow', sp < 0.6);
    this._events(prev, this.t);
    for (const h of this.clip.hits) {
      if (!this.popped.has(h) && this.t >= h.tk) {
        this.popped.add(h);
        const c = this.clip;
        this._pop(c.kind === 'dodge' ? 'Dodge!' : c.kind === 'snipe' ? (c.ko ? 'Snipe!' : 'Sniped!') : c.kind === 'hit' ? 'Bam!' : 'Splat!');
        this.g.fx.shake(c.kind === 'dodge' ? 0.05 : 0.3);
      }
    }
    this._frame(step, dt);
    const c = this.clip;
    const k = clamp((this.t - c.t0) / (c.t1 - c.t0), 0, 1);
    this.el('reel-prog').style.width = `${((this.ci + k) / this.clips.length) * 100}%`;
    if (this.t >= c.t1) this._enterClip(this.ci + 1);
  }

  // Bursts and sounds from the recording, between two moments.
  _events(a, b) {
    const g = this.g;
    for (const e of this.hl.events) {
      if (e.t <= a || e.t > b) continue;
      if (e.fx) g.fx.burst(e.fx, _c.set(e.x, e.y, e.z), e.p);
      else if (e.sfx) g.sfx.play(e.sfx, e.pos ? _d.set(e.pos[0], e.pos[1], e.pos[2]) : null, e.g);
    }
  }

  // Pose everything at the clip's time, then the camera.
  _frame(step, realDt) {
    const g = this.g, hl = this.hl, t = this.t;
    g.time = t;
    const [j, k] = hl._at(t), fr = hl.frames, F = fr[j], N = fr[Math.min(j + 1, fr.length - 1)];
    hl.actors.forEach((a, i) => {
      const o = i * K, A = F.a, B = N.a;
      const flags = (k < 0.5 ? A : B)[o + 8];
      const alive = (flags & FL.alive) !== 0;
      a.alive = alive; a.root.visible = alive;
      if (!alive) { a.glint.visible = false; return; }
      const jump = Math.hypot(B[o] - A[o], B[o + 2] - A[o + 2]) > 8 || !(B[o + 8] & FL.alive); // a respawn or a teleport: don't slide
      const kk = jump ? 0 : k;
      a.pos.set(lerp(A[o], B[o], kk), lerp(A[o + 1], B[o + 1], kk), lerp(A[o + 2], B[o + 2], kk));
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
      if ((a.inv[0]?.id || null) !== id) { a.inv[0] = id ? { id, count: 1 } : null; a.sel = 0; a._refreshHeld(); }
      const food = id ? FOODS[id] : null;
      a.chargeT = lerp(A[o + 9], B[o + 9], kk) * Math.max(0.2, food?.charge || 1);
      a.armT = lerp(A[o + 10], B[o + 10], kk);
      a.hitFlash = Math.max(a.hitFlash, lerp(A[o + 12], B[o + 12], kk));
    });
    // the flying food
    const seen = new Set();
    for (const q of F.p) {
      const pid = q[0], r = N.p.find((x) => x[0] === pid) || q;
      seen.add(pid);
      let m = this.ghosts.get(pid);
      if (!m) { m = g.projectiles.getMesh(q[1]); m.userData.food = q[1]; this.ghosts.set(pid, m); }
      m.visible = true;
      m.position.set(lerp(q[2], r[2], k), lerp(q[3], r[3], k), lerp(q[4], r[4], k));
      m.rotation.set(q[5], q[6], q[7]);
      if (m.userData.inner) m.userData.inner.rotation.x = q[8];
      m.scale.setScalar(q[9] || 1);
    }
    for (const [pid, m] of this.ghosts) if (!seen.has(pid)) { g.projectiles.releaseMesh(m.userData.food, m); this.ghosts.delete(pid); }
    g.world.setTide(lerp(F.tide[0], N.tide[0], k), lerp(F.tide[1], N.tide[1], k), lerp(F.tide[2], N.tide[2], k));
    // animate at the speed of play (slow motion slows the Titans too)
    for (const a of g.actors) a.updateVisual(Math.max(step, 1e-4), g.camera);
    g.utensils.updateVisual();
    g.fx.update(step);
    g._blobShadows();
    g.viewModel.update(realDt, g.player || g.actors[0], false);
    this._camera(realDt);
  }

  // ---------------------------------------------------------------- the camera
  _camera(dt) {
    const g = this.g, hl = this.hl, c = this.clip, t = this.t, cam = g.camera;
    let si = this.shots.findIndex((s) => t >= s.from && t < s.to);
    if (si < 0) si = t < this.shots[0].from ? 0 : this.shots.length - 1;
    const s = this.shots[si], h = s.h;
    const u = clamp((t - s.from) / Math.max(0.05, s.to - s.from), 0, 1);
    const A = hl.posAt(c.a, Math.min(t, h.tk), _a); // the star of the play
    const B = hl.posAt(h.b, h.tk, _b);              // who they hit (who threw, for a dodge)
    const pos = _e, look = _f;
    let fov = 55;
    // directions: from the star to the other one, and across
    _d.subVectors(B, A).setY(0);
    const dist = _d.length() || 1;
    _d.divideScalar(dist);
    const side = _g.set(-_d.z, 0, _d.x); // to the right of the line
    if (s.type === 'shoulder') { // behind the thrower, looking down the line of the throw
      const me = hl.posAt(c.a, t, _c);
      pos.copy(me).addScaledVector(_d, -4.2).addScaledVector(side, 1.6).add({ x: 0, y: 1.25, z: 0 });
      look.copy(me).addScaledVector(_d, Math.min(dist * 0.45, 14)).add({ x: 0, y: 0.3, z: 0 });
      fov = 52;
    } else if (s.type === 'chase') { // right behind the food
      const p = hl.projAt(h.pid, t, _c), q = hl.projAt(h.pid, t + 0.08, new THREE.Vector3());
      if (p && q) {
        const dir = q.sub(p); if (dir.lengthSq() < 1e-6) dir.copy(_d); dir.normalize();
        pos.copy(p).addScaledVector(dir, -3.4).add({ x: 0, y: 0.8, z: 0 }).addScaledVector(side, 0.5);
        look.copy(p).addScaledVector(dir, 6);
        this.lastChase = [pos.clone(), look.clone()];
      } else if (this.lastChase) { pos.copy(this.lastChase[0]); look.copy(this.lastChase[1]); }
      else { pos.copy(B).addScaledVector(side, 8).add({ x: 0, y: 3, z: 0 }); look.copy(B); }
      fov = 62;
    } else if (s.type === 'crane' && c.kind !== 'dodge') { // after the splat: turn round to the thrower, pushing in
      const me = hl.posAt(c.a, t, _c);
      pos.copy(me).addScaledVector(_d, lerp(5, 3.6, smooth(u))).addScaledVector(side, 1.4).add({ x: 0, y: lerp(0.9, 0.6, u), z: 0 });
      look.copy(me).add({ x: 0, y: 0.25, z: 0 });
      fov = lerp(50, 44, u);
    } else if (s.type === 'orbit' || s.type === 'crane') { // round the impact, slow motion; then up and away
      // round the one it's about: they may be knocked a few metres back, so follow them up to the impact
      const C = c.kind === 'dodge' ? hl.posAt(c.a, Math.min(t, h.tk + 0.3), _c) : hl.posAt(h.b, Math.min(t, h.tk), _c);
      const base = Math.atan2(side.z, side.x) + 0.5;
      const ang = s.type === 'orbit' ? base + u * 1.05 : base + 1.05 + u * 0.45;
      const R = s.type === 'orbit' ? lerp(6, 5, u) : lerp(5, 10, smooth(u));
      const y = s.type === 'orbit' ? lerp(1.3, 1.9, u) : lerp(1.9, 4.6, smooth(u));
      pos.set(C.x + Math.cos(ang) * R, C.y + y, C.z + Math.sin(ang) * R);
      look.copy(C);
      if (s.type === 'crane') look.y += 1.2 * smooth(u);
      fov = s.type === 'orbit' ? lerp(50, 44, u) : lerp(44, 62, u);
    } else if (s.type === 'wide') { // a dodge: the throw coming in, from beside both of them
      _c.addVectors(A, B).multiplyScalar(0.5);
      pos.copy(_c).addScaledVector(side, Math.min(30, dist * 0.6 + 5)).add({ x: 0, y: 3 + dist * 0.12, z: 0 });
      look.copy(_c).lerp(A, 0.35);
      fov = 58;
    } else if (s.type === 'side') { // the dodge itself, close and slow
      const me = hl.posAt(c.a, t, _c);
      const p = hl.projAt(h.pid, h.tk, new THREE.Vector3());
      const across = p ? p.sub(me).setY(0) : side.clone();
      if (across.lengthSq() < 1e-4) across.copy(side);
      across.normalize();
      const perp = new THREE.Vector3(-across.z, 0, across.x);
      pos.copy(me).addScaledVector(perp, 4.4).addScaledVector(across, -1.2).add({ x: 0, y: 0.9, z: 0 });
      look.copy(me).add({ x: 0, y: 0.2, z: 0 });
      fov = lerp(50, 44, u);
    }
    // keep the camera out of walls: pull it in front of whatever is between it and what it looks at
    _d.subVectors(pos, look);
    const len = _d.length();
    if (len > 0.01) {
      _d.divideScalar(len);
      const hit = raycastWorld(look, _d, len + 0.3);
      if (hit < len) pos.copy(look).addScaledVector(_d, Math.max(1.2, hit - 0.35));
    }
    if (pos.y < FLOOR_Y + 0.4) pos.y = FLOOR_Y + 0.4;
    // a cut between shots, smooth within one
    if (this.cam.shot !== si || this.cam.clip !== this.ci) {
      this.cam.shot = si; this.cam.clip = this.ci;
      this.cam.pos.copy(pos); this.cam.look.copy(look); this.cam.fov = fov;
    } else {
      const r = s.type === 'chase' ? 14 : 7;
      this.cam.pos.set(damp(this.cam.pos.x, pos.x, r, dt), damp(this.cam.pos.y, pos.y, r, dt), damp(this.cam.pos.z, pos.z, r, dt));
      this.cam.look.set(damp(this.cam.look.x, look.x, r, dt), damp(this.cam.look.y, look.y, r, dt), damp(this.cam.look.z, look.z, r, dt));
      this.cam.fov = damp(this.cam.fov, fov, 4, dt);
    }
    cam.position.copy(this.cam.pos);
    if (g.fx.shakeAmt > 0) { const k = g.fx.shakeAmt * 0.2; cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; }
    cam.lookAt(this.cam.look);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov = this.cam.fov; cam.updateProjectionMatrix(); }
    _d.subVectors(this.cam.look, cam.position).setY(0).normalize();
    g.sfx.setListener(cam.position, _c.set(-_d.z, 0, _d.x));
  }
}
