// The Legendary utensils (0.54): five super-powered food buffers, two of which sit in the middle of the
// map in King of the Utensil. Each rules a different part of a fight; none is best at everything:
//
//                      one Titan        a group          reach          control           keeping it up
//   Blow Torch         good (~45/s)     great (all in    11 m cone      burning           hold and aim
//                                       the cone)
//   Blender            best (ramps to   none (one Titan) 34 m beam      none              a steady aim; the ramp
//                      120/s)                                                             starts over when it slips
//   Oven Mitt          fair             great (8.5 m     70 m, over     drives them out   a burst every 2.6 s
//                                       spot)            cover          of cover
//   Ice Cream Machine  fair (+ shatter) good (9 m wave)  a throw        best (freezes)    jump the wave
//   Popcorn Popper     good up close    best (5 rounds   a throw        some              a big target to see, one
//                                       of blasts)                                        every 1.1 s, outer rings late
//
// (The numbers are in BAL; legendary tests in the test folder measure time-to-splat on one Titan and
// damage on a group of four for each, and they're tuned to land close together overall.)
//
// They're still food buffers: it's always the loaded food that flies, splats and does what it does:
//  - Blow Torch: hold the throw for a spiralling cone of flame; pieces of the food fly out along the spiral
//    and hit as that food. Everyone in the cone burns.
//  - Blender: hold for a thin laser of the food, liquefied (its colour, its splats, its sting: a tomato beam
//    slows, a chili beam sets on fire, a jelly beam roots...). Like Clash Royale's Inferno Tower, it starts
//    weak and ramps up the longer it stays on the same Titan; off them for a moment, it starts over.
//  - Oven Mitt: a burst of 12 of the food thrown sky-high rains down at blinding speed over a wide spot
//    where you aim; each lands with a small slam besides its own splat. One burst every 2.6 s.
//  - Ice Cream Machine: each food you throw lands with a ring of ice rolling out 9 m along the floor; it
//    freezes whoever it catches on the ground (and does a little damage). Jump it.
//  - Popcorn Popper: the food flies twice as big (at its own speed); where it lands it bursts into minis of itself,
//    each of which bursts again: five rounds of explosions, each sooner than the last.
//
// Online, nothing new goes over the line but one flag: a Titan using a torch or blender has it in its
// state (each game draws the cone or beam from where that Titan aims, and decides what it does to its own
// Titans, as with every hit). Mitt bursts go out as one throw (a seed lays out the rain the same everywhere);
// waves and cascades come from the food landing, which every game sees.
import * as THREE from 'three';
import { G, clamp, rand, groundHeight, raycastWorld, hasLineOfSight, forwardOf, segSegDist2 } from './core.js';
import { FOODS } from './foods.js';

export const BAL = {
  torch: { range: 11, half: 0.42, dps: 24, burn: 2, pieceEvery: 0.2, pieceM: 0.35, useEvery: 1.0 },
  blender: { range: 34, width: 0.5, stages: [[0, 14], [1.2, 40], [2.4, 120]], gap: 0.25, useEvery: 3.5, dripEvery: 1.2 },
  mitt: { n: 14, r: 8.5, cd: 2.4, range: 70, slamR: 3, slamDmg: 22, m: 0.9, height: 24 },
  cream: { r: 9, pelletR: 5, speed: 12, freeze: 1.5, dmg: 10, jump: 0.7, lock: 0.7 },
  popper: { lock: 1.1, speed: 1, size: 2, rounds: [ // (0.55: speed 1: as fast as the food always flies)
    { r: 4.0, dmg: 34, force: 9, kids: 6, fuse: 0.55, out: [6, 9] },
    { r: 2.8, dmg: 14, force: 6, kids: 2, fuse: 0.4, out: [4, 7] },
    { r: 2.3, dmg: 10, force: 4, kids: 2, fuse: 0.28, out: [3.5, 6] },
    { r: 1.9, dmg: 7, force: 3, kids: 2, fuse: 0.2, out: [3, 5] },
    { r: 1.6, dmg: 5, force: 2, kids: 0, fuse: 0, out: [0, 0] },
  ] },
};
export const STREAMS = new Set(['gold-torch', 'gold-blender']);

// what flies for each food (a wheel or a melon can't be thrown in pieces of itself: its chunks do)
const PIECE_OF = { grapes: 'grape', blueberry: 'berry', cheese: 'cheesechunk', watermelon: 'melonchunk', banana: 'bananaslice', pineapple: 'pinechunk' };
const ROOT_OF = { grape: 'grapes', berry: 'blueberry', melonchunk: 'watermelon', cheesechunk: 'cheese', bananaslice: 'banana', pinechunk: 'pineapple' };
export const rootOf = (id) => ROOT_OF[id] || id;
export const pieceOf = (id) => PIECE_OF[id] || id;
const TINT = { tomato: '#e8321f', carrot: '#ff8a1c', ice: '#bfe9ff', soda: '#8a4a22', chili: '#ff3d00', jelly: '#5fd35a', cookie: '#c98a4c', pineapple: '#f2c230', banana: '#ffe14a', cheese: '#ffc93c', watermelon: '#f25a6a', grapes: '#8e3fae', blueberry: '#4a52c8' };
const BURST = { tomato: 'tomato', carrot: 'carrot', ice: 'ice', soda: 'soda', chili: 'fire', jelly: 'jelly', cookie: 'crumb', pineapple: 'pine', banana: 'banana', cheese: 'cheese', watermelon: 'melon', grapes: 'grape', blueberry: 'berry' };
const STAIN = { tomato: 'tomato', carrot: 'carrot', soda: 'soda', chili: 'chili', jelly: 'jelly', banana: 'banana', cheese: 'cheese', watermelon: 'melon', grapes: 'grape', blueberry: 'berry' };
export const tintOf = (id) => TINT[rootOf(id)] || '#ffffff';
export const burstOf = (id) => BURST[rootOf(id)] || 'dust';

// The Blender's sting: what each food does to the Titan the beam is on, every 1.2 s it stays on them.
const push = (d, f, up) => new THREE.Vector3(d.x * f, up, d.z * f);
const FLAVOR = {
  tomato: (T) => { T.addSticky(0.2, 2); T.juice(2); },
  banana: (T, d) => T.knock(push(d, 3, 1.5)),
  ice: (T) => T.addSticky(0.3, 1.5),
  soda: (T, d) => { T.addSticky(0.25, 2); T.knock(push(d, 4, 2)); },
  cheese: (T, d) => T.knock(push(d, 7, 2.5)),
  grapes: (T) => T.addSticky(0.15, 1.5),
  chili: (T) => T.burn(3),
  cookie: (T) => T.addSticky(0.2, 2),
  watermelon: (T, d) => T.knock(push(d, 9, 3)),
  pineapple: (T) => T.addSticky(0.2, 2),
  jelly: (T) => T.applyHardCC('rooted', 0.6),
  blueberry: (T) => T.addSticky(0.1, 1.5),
};
const BEAM_MULT = { carrot: 1.15 }; // (a carrot beam is the sharpest)

const _from = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const _e = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0), _up = new THREE.Vector3(0, 1, 0);
const col = (hex) => new THREE.Color(hex);

// A little seeded random (the Mitt's rain lands the same on every game).
function seeded(seed) { let s = (seed | 0) % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

function stripeTexture(a, b, n = 6) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = a; x.fillRect(0, 0, 64, 128);
  x.fillStyle = b;
  for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(32 + Math.sin(i * 2.1) * 14, (i / n) * 128 + 10, 9, 18, 0.5, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Legends {
  constructor(U) {
    this.U = U; this.game = U.game;
    this.waves = [];
    this.fx = new Map(); // actor -> its cone or beam meshes
    this.wavePool = [];
  }
  reset() {
    for (const w of this.waves) this._dropWave(w);
    this.waves.length = 0;
    for (const a of this.game.botActors || []) { a.streamOn = false; a.beamLock = null; }
  }

  // ---------------------------------------------------------------- the streams (Blow Torch, Blender)
  isStream(a) { return STREAMS.has(a?.utensil); }
  // A Titan's hands on the throw while holding a torch or blender (local Titans: me, my bots).
  input(a, food, primary, dt) {
    const g = this.game, slot = a.selected();
    const on = primary && !!slot && UTENSIL_WORKS(this.U, a, slot.id) && (slot.inf || slot.count > 0);
    if (!on) { a.streamOn = false; return; }
    if (!a.streamOn) { a.streamT = 0; a.streamUse = 0; }
    a.streamOn = true; a.streamAt = g.time; a.streamT += dt; a.spawnShieldUntil = 0;
    const B = a.utensil === 'gold-torch' ? BAL.torch : BAL.blender;
    a.streamUse += dt;
    const every = food.auto ? B.useEvery / 8 : B.useEvery; // (blueberries come by the handful)
    while (a.streamUse >= every && a.streamOn) {
      a.streamUse -= every;
      a.consume(1);
      if (!a.selected()) a.streamOn = false;
    }
    a.noiseAt = g.time; // (it's loud)
  }
  // where a Titan's stream comes from and where it points
  aim(a, out) {
    a.handPos(_o);
    if (a.isRemote) {
      // (another player's: their game sends where they look (yaw, pitch) from their eyes; the stream goes from
      // their hand to what that look meets, as it does on their own screen)
      const p = clamp(a.lookPitch || 0, -1.4, 1.4);
      forwardOf(a.yaw, out).multiplyScalar(Math.cos(p)); out.y = Math.sin(p); out.normalize();
      const eye = _e.copy(a.pos).setY(a.pos.y + 1.72);
      let t = raycastWorld(eye, out, 120);
      for (const b of this.game.actors) { // (or a Titan in the way, as their crosshair finds one)
        if (b === a || !b.alive) continue;
        b.center(_w).sub(eye);
        const k = _w.dot(out);
        if (k > 0 && k < t && _w.lengthSq() - k * k < 0.8) t = k;
      }
      return out.copy(eye.addScaledVector(out, t)).sub(_o).normalize();
    }
    if (a.aimPoint && a.aimPoint.distanceToSquared(_o) > 1) return out.subVectors(a.aimPoint, _o).normalize();
    return out.copy(a.aimDir).normalize();
  }

  update(dt) {
    const g = this.game, now = g.time;
    for (const a of g.actors) {
      if (!a.streamOn) { a.hlStream = null; continue; }
      if (!a.alive || !this.isStream(a) || (!a.isRemote && now - (a.streamAt || 0) > 0.15) || !a.selected()) { a.streamOn = false; a.beamLock = null; a.hlStream = null; continue; }
      const food = rootOf(a.selected().id);
      this.aim(a, _d);
      const from = _from.copy(_o);
      // (the highlight reels remember the stream, as an ability: who, which, with what, until when)
      if (!a.hlStream) a.hlStream = g.highlights?.onAbility('stream', { owner: a, u: a.utensil, food }) || { none: true };
      a.hlStream.end = now + 0.12;
      if (now >= (a.streamSnd || 0)) { a.streamSnd = now + 0.45; g.sfx.play(a.utensil === 'gold-torch' ? 'flame' : 'slosh', from, a === g.player ? 0.6 : 0.35); }
      if (a.utensil === 'gold-torch') this._torch(a, food, from, _d, dt);
      else this._blender(a, food, from, _d, dt);
    }
    this._waves(dt);
  }
  // may this game hurt b with a's stream? (each game decides for its own Titans; mine also show my hits)
  _mayHit(a, b) { return b !== a && b.alive && !(a.isRemote && b.isRemote) && !this.game.teammates(a, b); }

  _torch(a, food, from, dir, dt) {
    const g = this.game, B = BAL.torch, tanH = Math.tan(B.half);
    const reach = Math.min(B.range, raycastWorld(from, dir, B.range) + 0.6);
    a.streamReach = reach;
    for (const b of g.actors) {
      if (!this._mayHit(a, b)) continue;
      const c = b.center(_v).sub(from), along = c.dot(dir);
      if (along < 0 || along > reach + 0.5) continue;
      const perp = _w.copy(c).addScaledVector(dir, -along).length();
      if (perp > along * tanH + 0.55) continue;
      if (!hasLineOfSight(from, b.center(_w))) continue;
      b.torchAcc = (b.torchAcc || 0) + B.dps * (1 - 0.2 * clamp((along - 6) / 5, 0, 1)) * dt; // (hottest up close: 80% at the far end)
      if (b.torchAcc >= 4) {
        const amt = b.torchAcc; b.torchAcc = 0;
        if (b.shieldUp && g._inFront(b, from)) g.damageShield(b, amt, a);
        else g.damage(b, amt, a, food);
        b.burn(B.burn);
      }
    }
    // pieces of the food fly out along the spiral (every game throws its own: they're the same food,
    // flying the same way, and each game decides what they do to its own Titans)
    a.pieceAcc = (a.pieceAcc || 0) + dt;
    a.spiral = (a.spiral || 0) + dt * 11;
    while (a.pieceAcc >= B.pieceEvery) {
      a.pieceAcc -= B.pieceEvery;
      const pid = pieceOf(food), f = FOODS[pid];
      // the spiral: round the aim, 12 degrees out
      const side = _a.crossVectors(dir, _up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      const v = _b.copy(dir).applyAxisAngle(side, 0.21).applyAxisAngle(dir, a.spiral).multiplyScalar(24);
      g.projectiles.launch({
        food: pid, owner: a, local: true, u: 'gold-torch', x: { m: B.pieceM, sc: pid === food ? 0.55 : 0.9, tf: 1, pi: 1 },
        pos: from.clone().addScaledVector(dir, 0.6), vel: v.clone(), gravity: 0.35, radius: Math.max(0.12, (f.radius || 0.3) * 0.6), life: 0.48, spin: 10, charge: 0.6,
      });
    }
  }

  _blender(a, food, from, dir, dt) {
    const g = this.game, B = BAL.blender, now = g.time;
    const wall = raycastWorld(from, dir, B.range);
    let hit = null, hd = wall;
    _a.copy(from).addScaledVector(dir, wall);
    for (const b of g.actors) {
      if (b === a || !b.alive || g.teammates(a, b)) continue;
      const lo = _v.copy(b.pos).setY(b.pos.y + 0.4), hi = _w.copy(b.pos).setY(b.pos.y + 1.75);
      if (segSegDist2(from, _a, lo, hi) > (0.45 + B.width) ** 2) continue;
      const d = _c.copy(b.center(_c)).sub(from).dot(dir);
      if (d > 0 && d < hd) { hd = d; hit = b; }
    }
    a.streamReach = hit ? hd : wall;
    // the lock (as this game sees it: the beam's look, and my own hits)
    const L = a.beamLock;
    if (hit && L && L.T === hit && now - L.last < B.gap) { L.t += dt; L.last = now; }
    else if (hit) a.beamLock = { T: hit, t: 0, last: now };
    else if (L && now - L.last > B.gap) a.beamLock = null;
    if (!hit || !this._mayHit(a, hit)) return;
    // the ramp on the Titan it's on (its own game's count decides)
    const R = hit.blend && hit.blend.by === a && now - hit.blend.last < B.gap ? hit.blend : (hit.blend = { by: a, t: 0, last: now, drip: 0, acc: 0 });
    R.t += dt; R.last = now;
    let dps = 0;
    for (const [t, v] of B.stages) if (R.t >= t) dps = v;
    R.acc += dps * (BEAM_MULT[food] || 1) * dt;
    if (R.acc >= 4) {
      const amt = R.acc; R.acc = 0;
      if (hit.shieldUp && g._inFront(hit, from)) g.damageShield(hit, amt, a);
      else g.damage(hit, amt, a, food);
    }
    R.drip -= dt;
    if (R.drip <= 0 && hit.alive && !hit.isRemote) { R.drip = B.dripEvery; FLAVOR[food]?.(hit, dir); }
  }
  // how far the Blender's ramp is on its target (0, 1, 2), as this game sees it
  stage(a) {
    const L = a?.beamLock;
    if (!L) return -1;
    let s = 0;
    BAL.blender.stages.forEach(([t], i) => { if (L.t >= t) s = i; });
    return s;
  }

  // ---------------------------------------------------------------- Oven Mitt: the burst rain
  // Where a burst lands: the aim point, at most 70 m away, on the ground.
  mittTarget(a) {
    const from = a.pos, p = a.aimPoint;
    const out = new THREE.Vector3();
    if (p) out.copy(p); else out.copy(a.pos).addScaledVector(forwardOf(a.yaw, _v), 20);
    const dx = out.x - from.x, dz = out.z - from.z, h = Math.hypot(dx, dz), max = BAL.mitt.range;
    if (h > max) { out.x = from.x + (dx / h) * max; out.z = from.z + (dz / h) * max; }
    out.y = groundHeight(out.x, out.z, Math.max(out.y, from.y) + 1);
    return out;
  }
  // The burst: 12 of the food dropped from high above, spread evenly over the spot (seeded: the same on every game).
  rain(p) {
    const g = this.game, B = BAL.mitt, rnd = seeded(p.x.sd || 1), root = rootOf(p.food), pid = pieceOf(root), f = FOODS[pid];
    const c = p.pos;
    for (let i = 0; i < B.n; i++) {
      const r = B.r * Math.sqrt((i + 0.5) / B.n) * (0.85 + rnd() * 0.3), ang = i * 2.39996 + rnd() * 0.5; // (golden-angle: no gaps, no piles)
      const x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
      const y = groundHeight(x, z, c.y + 8) + B.height + rnd() * 4;
      g.projectiles.launch({
        food: pid, owner: p.owner, local: true, u: 'gold-mitt', x: { m: B.m, mp: 1, sc: pid === root ? 1 : 1.3 },
        pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3((rnd() - 0.5) * 2, -58 - rnd() * 8, (rnd() - 0.5) * 2),
        gravity: 1, radius: f.radius || 0.3, life: 2.5, spin: 12, charge: 0.6, orient: pid === 'carrot',
      });
    }
    g.fx.spray('puffs', c.clone().setY(c.y + 0.3), 10, { speed: 6, up: 0.5, colors: [col('#ff5d5d'), col('#ffffff')], size: 0.6, life: 0.5, grav: 0, grow: 1.4 });
    g.sfx.play('whirr', c, 0.8);
  }
  slam(p, at) { // each piece of the rain lands with a small slam, besides its own splat
    const g = this.game, B = BAL.mitt;
    g.dmgScale = 1;
    g.explode(at, B.slamR, B.slamDmg, p.owner, rootOf(p.food), 5);
    g.fx.burst('dust', at, 0.7);
    g.fx.burst(burstOf(p.food), at, 0.6);
    g.sfx.play('thud', at, 0.5);
  }

  // ---------------------------------------------------------------- Ice Cream Machine: the freeze wave
  wave(at, owner, food, maxR) {
    const g = this.game;
    const y = groundHeight(at.x, at.z, at.y + 0.6);
    if (at.y - y > 3) return; // (it landed on a wall high up: no floor for a wave)
    const w = { x: at.x, y, z: at.z, r: 0, max: maxR, owner, food, hit: new Set(), born: g.time, mesh: this._waveMesh() };
    w.mesh.position.set(at.x, y + 0.02, at.z);
    this.waves.push(w);
    g.highlights?.onAbility('wave', { pos: _v.set(at.x, y, at.z), r: maxR }); // (the reels show it too)
    g.sfx.play('freeze', at, 1.2); g.sfx.play('shatter', at, 0.6);
    g.fx.burst('ice', _v.set(at.x, y + 0.3, at.z), 1.4);
    this.U.icePatch(_v.set(at.x, y, at.z), owner, 6);
  }
  _waveMesh() {
    let m = this.wavePool.pop();
    if (!m) {
      WAVE_MAT ||= new THREE.MeshBasicMaterial({ color: '#bff3ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
      WALL_MAT ||= new THREE.MeshBasicMaterial({ color: '#6fe0ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
      m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2), WAVE_MAT.clone()));
      const wall = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true).translate(0, 0.5, 0);
      const p = wall.attributes.position; // a jagged ice crest
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5) p.setY(i, 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)));
      m.add(new THREE.Mesh(wall, WALL_MAT.clone()));
      this.game.scene.add(m);
    }
    m.visible = true;
    return m;
  }
  _dropWave(w) { w.mesh.visible = false; this.wavePool.push(w.mesh); }
  // (the highlight reels) how a wave looks `age` seconds after it started (null when it's done)
  waveAt(mesh, x, y, z, max, age) {
    const r = Math.min(max, BAL.cream.speed * age);
    if (age < 0 || r >= max) { if (mesh) this._dropWave({ mesh }); return null; }
    const m = mesh || this._waveMesh(), k = r / max;
    m.position.set(x, y + 0.02, z);
    m.scale.set(Math.max(0.05, r), 0.75 * (1 - k * 0.6), Math.max(0.05, r));
    m.children[0].material.opacity = 0.85 * (1 - k * 0.7);
    m.children[1].material.opacity = 0.5 * (1 - k * 0.8);
    return m;
  }
  _waves(dt) {
    const g = this.game, B = BAL.cream;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i], r0 = w.r;
      w.r = Math.min(w.max, w.r + B.speed * dt);
      const k = w.r / w.max;
      w.mesh.scale.set(Math.max(0.05, w.r), 0.75 * (1 - k * 0.6), Math.max(0.05, w.r));
      w.mesh.children[0].material.opacity = 0.85 * (1 - k * 0.7);
      w.mesh.children[1].material.opacity = 0.5 * (1 - k * 0.8);
      if (g.fx.scale > 0 && Math.random() < 0.7) {
        const ang = rand(0, Math.PI * 2);
        g.fx.spray('puffs', _v.set(w.x + Math.cos(ang) * w.r, w.y + 0.2, w.z + Math.sin(ang) * w.r), 1, { speed: 1, up: 1.5, colors: [col('#ffffff'), col('#bff3ff')], size: 0.35, life: 0.45, grav: 0, grow: 0.6 });
      }
      // who it catches: on the ground (or barely off it) where the crest passes. Each game freezes its own Titans.
      for (const b of g.actors) {
        if (!b.alive || b.isRemote || b === w.owner || w.hit.has(b) || g.teammates(w.owner, b)) continue;
        const d = Math.hypot(b.pos.x - w.x, b.pos.z - w.z);
        if (d < r0 - 0.9 || d > w.r + 0.45) continue;
        const up = b.pos.y - w.y;
        if (up < -1.2 || up > 2) continue; // (another level)
        w.hit.add(b);
        if (up > B.jump && !b.onGround) { if (b === g.player) g.hud.toast('Jumped the freeze wave!'); continue; } // jumped it
        g.damage(b, B.dmg, w.owner, w.food);
        if (b.alive && b.applyHardCC('frozen', B.freeze)) { g.sfx.play('freeze', b.pos); g.fx.burst('ice', b.center(_v), 0.8); g.floatText(b, 'FROZEN', 'slip'); }
      }
      if (w.r >= w.max) { this._dropWave(w); this.waves.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- Popcorn Popper: the cascade
  // A piece bursts (round s: 0 the giant food): a blast, and (rounds 0-3) minis of the food flung out.
  cascade(p, at) {
    const g = this.game, s = p.x.cs | 0, R = BAL.popper.rounds[Math.min(s, 4)];
    const root = rootOf(p.food), pid = pieceOf(root), f = FOODS[pid];
    const pt = at.clone(); pt.y = Math.max(pt.y, groundHeight(pt.x, pt.z, pt.y + 0.5) + 0.3);
    g.dmgScale = 1;
    g.explode(pt, R.r, R.dmg, p.owner, root, R.force);
    // (the later rounds are many small blasts: a lighter splash each, or the screen is all splash)
    if (s < 2 || Math.random() < 0.6) g.fx.burst(burstOf(root), pt, s === 0 ? 1.4 : 0.42 - s * 0.07);
    if (s < 2) g.fx.spray('puffs', pt, s === 0 ? 8 : 2, { speed: 4, up: 3, colors: [col('#fff3c0'), col('#ffffff')], size: s === 0 ? 0.6 : 0.3, life: 0.3, grav: 0.3, grow: 1 });
    else if (Math.random() < 0.5) g.fx.spray('blobs', pt, 3, { speed: 4, up: 3, colors: [col('#fff3c0'), col(tintOf(root))], size: 0.1, life: 0.3, grav: 0.8 });
    g.sfx.play(s === 0 ? 'boom' : 'thud', pt, s === 0 ? 1 : 0.3);
    if (s === 0) g.world.paintSplat(pt.x, pt.y, pt.z, 4, STAIN[root] || 'tomato');
    if (!R.kids) return;
    const base = rand(0, Math.PI * 2);
    // the minis fly outward, away from where the giant landed (each round a ring further out)
    const c0 = p.x.cx !== undefined ? _v.set(p.x.cx, pt.y, p.x.cz) : null;
    const away = c0 && c0.distanceTo(pt) > 0.3 ? Math.atan2(pt.z - c0.z, pt.x - c0.x) : null;
    for (let i = 0; i < R.kids; i++) {
      const ang = away == null ? base + (i / R.kids) * Math.PI * 2 + rand(-0.35, 0.35) : away + (i - (R.kids - 1) / 2) * 0.9 + rand(-0.3, 0.3);
      const sp = rand(R.out[0], R.out[1]);
      const q = g.projectiles.launch({
        food: pid, owner: p.owner, local: true, u: 'gold-popper', x: { cs: s + 1, m: 0.15, sc: Math.max(0.3, (pid === root ? 0.75 : 1.1) - s * 0.12), pp: 1, cx: c0 ? c0.x : pt.x, cz: c0 ? c0.z : pt.z },
        pos: pt.clone(), vel: new THREE.Vector3(Math.cos(ang) * sp, rand(4.5, 7) - s * 0.6, Math.sin(ang) * sp),
        gravity: 1, radius: Math.max(0.1, (f.radius || 0.3) * (0.6 - s * 0.08)), life: R.fuse, spin: 12, charge: 0.5,
      });
      if (q) for (const b of g.actors) q.hitSet.add(b); // (minis burst on their fuse or the floor: not on the Titans they fly past)
    }
  }
}
let WAVE_MAT = null, WALL_MAT = null;
// does the utensil in hand work with this food (the same test as Utensils.works)
const UTENSIL_WORKS = (U, a, id) => U.works(a, id);

// ---------------------------------------------------------------- what the streams look like
// (drawn every frame for every Titan using one: a flame cone, or a juice beam that thickens as it ramps)
const CONE_GEO = new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0); // tip at the origin, opening down -y
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
let FLAME_TEX = null, JUICE_TEX = null;
export function streamVisuals(L, dt) {
  const g = L.game;
  for (const a of g.actors) {
    const on = a.alive && a.streamOn && L.isStream(a) && a.selected();
    if (!on) { if (!a.replayStream) { const fx = L.fx.get(a); if (fx) fx.grp.visible = false; } continue; }
    drawStream(L, a, a.utensil, rootOf(a.selected().id), dt, a.streamReach, L.stage(a), g.time);
  }
}
// One Titan's cone or beam (also the highlight reels', for a replayed one: reach and ramp stage given then).
export function drawStream(L, a, u, food, dt, reach, st, t) {
  const g = L.game;
  {
    let fx = L.fx.get(a);
    if (!fx) {
      FLAME_TEX ||= stripeTexture('#ff7a1a', '#ffe08a');
      JUICE_TEX ||= stripeTexture('#ffffff', '#ffffff', 9);
      const grp = new THREE.Group();
      const outer = new THREE.Mesh(CONE_GEO, new THREE.MeshBasicMaterial({ map: FLAME_TEX, color: '#ff8a2a', transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const inner = new THREE.Mesh(CONE_GEO, new THREE.MeshBasicMaterial({ map: FLAME_TEX, color: '#ffe36a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      const beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ map: JUICE_TEX, color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, forceSinglePass: true }));
      const core = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
      for (const m of [outer, inner, beam, core]) { m.frustumCulled = false; m.material.map && (m.material.map = m.material.map.clone()); m.material.map && (m.material.map.needsUpdate = true); }
      grp.add(outer, inner, beam, core);
      g.scene.add(grp);
      L.fx.set(a, (fx = { grp, outer, inner, beam, core }));
    }
    fx.grp.visible = true;
    const tint = tintOf(food);
    L.aim(a, _d);
    const from = _o; // (aim() left the hand position in _o)
    const torch = u === 'gold-torch';
    const len = Math.max(0.5, reach || (torch ? BAL.torch.range : BAL.blender.range));
    fx.outer.visible = fx.inner.visible = torch;
    fx.beam.visible = fx.core.visible = !torch;
    _q.setFromUnitVectors(torch ? _down : _up, _d);
    if (torch) {
      const R = Math.tan(BAL.torch.half) * len;
      for (const [m, k] of [[fx.outer, 1], [fx.inner, 0.55]]) {
        m.position.copy(from); m.quaternion.copy(_q);
        m.scale.set(R * k, len * (k === 1 ? 1 : 0.85), R * k);
        m.material.map.offset.y = (m.material.map.offset.y - dt * (k === 1 ? 2.2 : 3.4)) % 1;
        m.material.map.offset.x = (t * 0.6 * k) % 1;
      }
      fx.outer.material.color.set('#ff8a2a').lerp(_cc.set(tint), 0.25); // (a hint of the food in the fire)
      if (g.fx.scale > 0 && Math.random() < 0.85) {
        const s = rand(0.2, 1);
        g.fx.spray('blobs', _v.copy(from).addScaledVector(_d, len * s * 0.7), 2, { speed: 3, up: 1.5, colors: [col('#ff3d00'), col('#ffae00'), col(tint)], size: 0.14, life: 0.35, grav: -0.4 });
      }
    } else {
      const w = [0.07, 0.11, 0.17][Math.max(0, st)] * (1 + Math.sin(t * 40) * 0.08);
      for (const [m, k] of [[fx.beam, 1], [fx.core, 0.35]]) { m.position.copy(from); m.quaternion.copy(_q); m.scale.set(w * k * 1.6, len, w * k * 1.6); }
      fx.beam.material.color.set(tint);
      fx.beam.material.map.offset.y = (fx.beam.material.map.offset.y - dt * 6) % 1;
      fx.beam.material.map.repeat.set(1, Math.max(1, len / 3));
      fx.core.material.opacity = 0.45 + 0.2 * st;
      if (g.fx.scale > 0) { // the juice splashing where it hits
        const end = _v.copy(from).addScaledVector(_d, len);
        if (Math.random() < 0.8) g.fx.spray('blobs', end, 2 + st, { speed: 3 + st * 2, up: 2, colors: [col(tint), col('#ffffff')], size: 0.1 + st * 0.03, life: 0.3, grav: 1 });
        if (!a.beamLock && Math.random() < dt * 3 && STAIN[food]) g.world.paintSplat(end.x, end.y, end.z, 0.8, STAIN[food]);
      }
    }
  }
}
const _cc = new THREE.Color();
