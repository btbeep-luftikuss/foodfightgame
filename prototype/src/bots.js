// Bot brains: pick a target, pick the right food for the range, lead shots with the
// same ballistic math the projectiles use, strafe, dodge, loot and heal.
import * as THREE from 'three';
import {
  G, FLOOR_Y, clamp, rand, pick, yawOf, forwardOf, hasLineOfSight, solveLob, groundHeight, raycastWorld,
} from './core.js';
import { FOODS } from './foods.js';
import { MAX_HP } from './actors.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _aim = new THREE.Vector3(), _q = new THREE.Vector3();

export const BOT_NAMES = ['Pip', 'Crouton', 'Waffles', 'Nibbles', 'Sprout', 'Mochi', 'Biscuit', 'Pickles', 'Dumpling', 'Truffle', 'Nacho', 'Gnocchi', 'Tofu', 'Pretzel', 'Kiwi', 'Muffin'];

// Preferred engagement ranges per food [min, max, score].
const RANGE = {
  carrot: [20, 70, 3.2], tomato: [6, 28, 2.6], ice: [5, 24, 2.3], soda: [5, 22, 2.5],
  banana: [4, 20, 1.9], cheese: [4, 20, 2.4], peel: [0, 7, 1.2],
  grapes: [2, 14, 2.6], chili: [6, 40, 2.5], cookie: [5, 30, 1.9], watermelon: [4, 22, 2.4],
  pineapple: [6, 24, 2.4], jelly: [5, 22, 2.1], blueberry: [2, 35, 2.7],
};

export class BotBrain {
  constructor(actor, game, skill) {
    this.a = actor; this.game = game; this.skill = skill;
    this.thinkT = rand(0, 0.3);
    this.target = null; this.goal = null; this.goalKind = null;
    this.strafeDir = pick([-1, 1]); this.strafeT = 0;
    this.holdUntil = 0; this.wantFire = false; this.nextShotAt = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.unstickUntil = 0; this.unstickDir = new THREE.Vector3();
    this.foodLockUntil = 0; this.aimErr = new THREE.Vector3();
    this.pendingDodge = false; this.pendingAlt = false; this.pendingJump = false;
    this.aimYaw = 0;
    this.detourUntil = 0; this.detourSide = 1; this.doubleJumpAt = 0;
  }

  think() {
    const a = this.a, g = this.game, now = g.time;
    // choose target: whoever hit me recently, else the nearest visible enemy
    let best = null, bestD = 65;
    const eye = a.headPos(_v);
    for (const o of g.actors) {
      if (o === a || !o.alive) continue;
      const d = o.pos.distanceTo(a.pos);
      const bias = o === a.lastHitBy && now - a.lastHitAt < 4 ? 15 : 0;
      if (d - bias < bestD && hasLineOfSight(eye, o.headPos(_w))) { best = o; bestD = d - bias; }
    }
    this.target = best;

    // goals, most urgent first
    this.goal = null; this.goalKind = null;
    const tide = g.tide;
    const onFloor = a.pos.y < FLOOR_Y + 5;
    if (tide && Math.hypot(a.pos.x - tide.x, a.pos.z - tide.z) > tide.r - 4) {
      // The safe zone may be up on a counter: then take the spatula pad that lands closest to it.
      const zoneY = groundHeight(tide.x, tide.z, 50);
      let allHigh = zoneY > a.pos.y + 3;
      for (let k = 0; k < 8 && allHigh; k++) { // is any part of the zone down at my level?
        const ang = (k / 8) * Math.PI * 2;
        if (groundHeight(tide.x + Math.cos(ang) * tide.r * 0.8, tide.z + Math.sin(ang) * tide.r * 0.8, a.pos.y + 1) <= a.pos.y + 3) allHigh = false;
      }
      const it = !a.inv.some(Boolean) ? this._nearestItem(40, tide) : null;
      if (it) { this.goal = it.pos; this.goalKind = 'item'; }
      else if (allHigh) this._goPad(new THREE.Vector3(tide.x, zoneY, tide.z));
      else { this.goal = new THREE.Vector3(tide.x, a.pos.y, tide.z); this.goalKind = 'tide'; } // may mean jumping off a counter
    } else if (g.mode === 'chef' && a.hp < MAX_HP * 0.6 && (!this.target || bestD > 14) && this._nearestItem(90)) {
      this.goal = this._nearestItem(90).pos; this.goalKind = 'item'; // hurt: go get a heal cross
    } else if (!a.inv.some(Boolean) || (!this.target && a.inv.filter(Boolean).length < 3)) {
      const it = this._nearestItem(this.target ? 25 : 80);
      if (it) { this.goal = it.pos; this.goalKind = 'item'; }
    }
    // No utensil yet: go open a delivery box (or grab a utensil lying on the floor).
    if (!this.goal && !a.utensil && a.inv.some(Boolean) && (!this.target || bestD > 16)) {
      const u = g.utensils.nearestFor(a, this.target ? 30 : 70);
      if (u) { this.goal = u.pos.clone(); this.goalKind = 'item'; }
    }
    // Nobody in sight: go hunting. Titans can hear the fighting across the kitchen.
    if (!this.goal && !this.target && a.inv.some(Boolean)) {
      let prey = null, pd = Infinity;
      for (const o of g.actors) {
        if (o === a || !o.alive || now - o.noiseAt > 6) continue; // only hunt Titans making noise
        const d = o.pos.distanceTo(a.pos);
        if (d < pd) { pd = d; prey = o; }
      }
      if (prey) {
        if (prey.pos.y > a.pos.y + 3 && onFloor) this._goPad(); // they're up high: take a spatula pad
        else { this.goal = prey.pos.clone(); this.goalKind = 'hunt'; }
      }
    }
    const hn = g.world.nearestHoney(a.pos);
    if (!this.goal && a.glaze < 40 && hn && hn.h.cap > 30 && hn.d < 40 && (!this.target || bestD > 18)) {
      this.goal = new THREE.Vector3(hn.h.x, hn.h.y, hn.h.z); this.goalKind = 'honey';
    }

    // heal with a banana when hurt and not under pressure
    const bananaSlot = a.inv.findIndex((s) => s && (s.id === 'banana' || s.id === 'grapes'));
    if (a.hp < MAX_HP * 0.6 && bananaSlot >= 0 && (!this.target || bestD > 14) && !a.eat && g.mode !== 'chef') {
      a.select(bananaSlot);
      this.pendingAlt = true;
      this.foodLockUntil = now + 1.4;
    } else if (this.target && now > this.foodLockUntil && !a.charging) {
      this._chooseFood(bestD);
    }

    // dodge incoming food
    for (const p of g.projectiles.list) {
      if (p.owner === a) continue;
      _w.subVectors(a.pos, p.pos);
      const d = _w.length();
      if (d > 10 || d < 0.5) continue;
      const along = _w.dot(p.vel) / (d * (p.vel.length() || 1));
      if (along > 0.85 && Math.random() < this.skill * 0.55) { this.pendingDodge = true; break; }
    }

    // stuck detection
    if (a.pos.distanceTo(this.lastPos) < 0.4 && (this.goal || this.target) && a.onGround) this.stuckT += 0.25;
    else this.stuckT = 0;
    this.lastPos.copy(a.pos);
    if (this.stuckT > 0.75) {
      this.stuckT = 0; this.unstickUntil = now + 0.8; this.pendingJump = true;
      this.unstickDir.set(rand(-1, 1), 0, rand(-1, 1)).normalize();
    }
    // fresh aim error per decision (worse at range, better with skill)
    const err = (1.25 - this.skill) * 2.8 + bestD * 0.03 * (1.1 - this.skill * 0.5);
    this.aimErr.set(rand(-1, 1), rand(-0.6, 0.6), rand(-1, 1)).multiplyScalar(err);
  }

  _goPad(toward = null) {
    const a = this.a;
    let best = null, bd = Infinity;
    for (const p of this.game.world.pads) {
      const d = toward
        ? p.target.distanceTo(toward) + Math.hypot(a.pos.x - p.x, a.pos.z - p.z) * 0.3
        : Math.hypot(a.pos.x - p.x, a.pos.z - p.z) + rand(0, 40); // not always the same pad
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { this.goal = new THREE.Vector3(best.x, FLOOR_Y, best.z); this.goalKind = 'pad'; }
  }

  _nearestItem(maxD, insideTide = null) {
    const a = this.a;
    let best = null, bd = maxD;
    for (const it of this.game.items.pickables()) {
      if (Math.abs(it.pos.y - a.pos.y) > 3) continue;
      if (insideTide && Math.hypot(it.pos.x - insideTide.x, it.pos.z - insideTide.z) > insideTide.r) continue;
      const d = it.pos.distanceTo(a.pos);
      const wants = it.id === 'heal' ? a.hp < MAX_HP : a.inv.some((s) => !s || (s.id === it.id && s.count < FOODS[it.id].maxStack));
      if (d < bd && wants) { bd = d; best = it; }
    }
    return best;
  }

  _chooseFood(d) {
    const a = this.a, t = this.target;
    let bestI = -1, bestS = -1;
    a.inv.forEach((s, i) => {
      if (!s) return;
      const r = RANGE[s.id];
      let score = d >= r[0] && d <= r[1] ? r[2] : 0.4;
      if (s.id === 'ice' && t.isFrozen()) score = 0.2;
      if ((s.id === 'carrot' || s.id === 'tomato') && t.isFrozen()) score += 1.5; // shatter combo
      if (s.id === 'cheese' && d > 12 && !a.shieldUp) score = 2.6; // advance behind the shield
      if (i === a.sel) score += 0.6; // avoid swap lockouts
      score += Math.random() * 0.4;
      if (score > bestS) { bestS = score; bestI = i; }
    });
    if (bestI >= 0 && bestI !== a.sel) a.select(bestI);
    this.foodLockUntil = this.game.time + rand(1.2, 2.2);
  }

  intent(dt) {
    const a = this.a, g = this.game, now = g.time;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.think(); this.thinkT = 0.25; }
    const it = { moveX: 0, moveZ: 0, sprint: false, jump: false, dodge: false, primary: false, alt: false, slot: -1, cycle: 0 };
    const t = this.target && this.target.alive ? this.target : null;
    const slot = a.selected();
    const food = slot ? FOODS[slot.id] : null;

    // ---- movement
    const mv = _v.set(0, 0, 0);
    if (this.goal) {
      mv.set(this.goal.x - a.pos.x, 0, this.goal.z - a.pos.z);
      it.sprint = mv.length() > 6;
    } else if (t) {
      const r = RANGE[slot?.id] || [8, 20];
      const want = (r[0] + Math.min(r[1], 30)) / 2;
      _w.set(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z);
      const d = _w.length() || 1;
      _w.divideScalar(d);
      const approach = clamp((d - want) / 6, -1, 1);
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(0.8, 2.4); }
      mv.set(_w.x * approach - _w.z * this.strafeDir * 0.8, 0, _w.z * approach + _w.x * this.strafeDir * 0.8);
      if (Math.random() < dt * 0.35) { it.jump = true; if (Math.random() < 0.35) this.doubleJumpAt = now + 0.4; }
    } else {
      // wander toward the middle of the tide circle
      const tide = g.tide;
      mv.set((tide ? tide.x : 0) - a.pos.x + Math.sin(now * 0.3 + a.id) * 20, 0, (tide ? tide.z : 0) - a.pos.z + Math.cos(now * 0.23 + a.id) * 12);
    }
    if (now < this.unstickUntil) mv.copy(this.unstickDir);

    // Walls in the way (the island, the fridge, chairs): follow the wall until the way is clear.
    if (this.goal && mv.lengthSq() > 1e-4) {
      _q.copy(mv).setY(0).normalize();
      _w.set(a.pos.x, a.pos.y + 1, a.pos.z);
      if (raycastWorld(_w, _q, 5) < 5) {
        if (now > this.detourUntil) this.detourSide = pick([-1, 1]);
        this.detourUntil = now + 1.2;
      }
      if (now < this.detourUntil) mv.set(-_q.z * this.detourSide, 0, _q.x * this.detourSide).addScaledVector(_q, 0.15);
    }

    // Don't walk off a counter or the table unless the goal (or the target) is down there.
    if (a.onGround && a.pos.y > FLOOR_Y + 2 && mv.lengthSq() > 1e-4) {
      const wantDown = this.goalKind === 'tide' || (this.goal && this.goal.y < a.pos.y - 3) || (t && t.pos.y < a.pos.y - 3 && !this.goal);
      if (!wantDown) {
        _w.copy(mv).normalize();
        const gh = groundHeight(a.pos.x + _w.x * 3, a.pos.z + _w.z * 3, a.pos.y + 0.6);
        if (a.pos.y - gh > 3) { mv.set(-_w.x, 0, -_w.z).add(_q.set(-_w.z * this.strafeDir, 0, _w.x * this.strafeDir)); }
      }
    }
    for (const b of g.world.burners) {
      if (b.state === 'off' || Math.abs(a.pos.y - b.y) > 2) continue;
      _w.set(a.pos.x - b.x, 0, a.pos.z - b.z);
      const d = _w.length();
      if (d < b.r + 3) mv.addScaledVector(_w.normalize(), 3);
    }
    if (mv.lengthSq() > 1e-4) { mv.normalize(); it.moveX = mv.x; it.moveZ = mv.z; }

    // ---- aiming and throwing
    if (t && food && a.canControl()) {
      const from = a.handPos(_w);
      _aim.copy(t.pos).setY(t.pos.y + (food.profile === 'line' ? 1.0 : 0.8));
      const d = from.distanceTo(_aim);
      const speed = food.speed || 25;
      const tFlight = d / speed;
      _aim.addScaledVector(t.vel, tFlight * this.skill).add(this.aimErr);
      a.botTarget = t;
      if (food.profile === 'lob') {
        solveLob(from, _aim, speed, G * (food.gravity ?? 1), a.aimDir);
      } else if (food.profile === 'line' || food.profile === 'spray' || food.profile === 'auto') {
        _aim.y += 0.5 * G * (food.gravity ?? 0.3) * tFlight * tFlight;
        a.aimDir.subVectors(_aim, from).normalize();
      } else if (food.profile === 'seek') {
        a.aimDir.subVectors(_aim, from).normalize();
        a.aimDir.y += 0.15; a.aimDir.normalize();
      } else if (food.profile === 'return') {
        a.aimDir.subVectors(_aim, from).normalize();
        const off = -1.3 * (d / speed) * 0.5; // counter the banana's curve
        const c = Math.cos(off), s = Math.sin(off);
        const x = a.aimDir.x * c - a.aimDir.z * s, z = a.aimDir.x * s + a.aimDir.z * c;
        a.aimDir.x = x; a.aimDir.z = z; a.aimDir.normalize();
      } else {
        a.aimDir.subVectors(_aim, from).setY(0).normalize();
      }
      a.aimPoint.copy(_aim);
      this.aimYaw = yawOf(a.aimDir.x, a.aimDir.z);
      a.yaw = this.aimYaw;

      const r = RANGE[slot.id] || [0, 30];
      const inRange = d <= r[1] * 1.15; // no minimum: point-blank throws are fine
      if (slot.id === 'cheese') {
        if (!a.shieldUp && d > 12 && now > this.nextShotAt) { this.pendingAlt = true; this.nextShotAt = now + 1; }
        else if (d < 13 && now > this.nextShotAt) { it.primary = true; this.nextShotAt = now + rand(0.6, 1.2); }
      } else if (food.auto) { // blueberries: fire in bursts
        if (this.burstEnd && now > this.burstEnd) { this.burstEnd = 0; this.nextShotAt = now + rand(0.4, 0.9) * (1.4 - this.skill); }
        else if (this.burstEnd) it.primary = true;
        else if (inRange && now > this.nextShotAt) { this.burstEnd = now + rand(0.6, 1.2); it.primary = true; }
      } else if (slot.id === 'peel') {
        if (d < 7 && now > this.nextShotAt) { it.primary = true; this.nextShotAt = now + 2; }
      } else if (food.charge > 0 || this.game.utensils.botHold(a, food) > 0) {
        if (a.charging) it.primary = now < this.holdUntil;
        else if (inRange && now > this.nextShotAt && now >= a.recoverUntil) {
          it.primary = true;
          // full charge matches the aim solution; a utensil that needs a longer hold gets it
          this.holdUntil = now + Math.max(food.charge * rand(1.02, 1.15), this.game.utensils.botHold(a, food));
          this.nextShotAt = now + food.recovery + rand(0.5, 1.4) * (1.4 - this.skill);
        }
      } else if (inRange && now > this.nextShotAt) {
        it.primary = true;
        this.nextShotAt = now + food.recovery + rand(0.5, 1.4) * (1.4 - this.skill);
      }
    } else {
      if (mv.lengthSq() > 0.01) a.yaw = yawOf(mv.x, mv.z);
      if (a.charging) it.primary = false;
    }

    if (this.pendingDodge) {
      it.dodge = true;
      const f = forwardOf(a.yaw, _v);
      it.moveX = -f.z * this.strafeDir; it.moveZ = f.x * this.strafeDir;
      this.pendingDodge = false;
    }
    if (this.pendingAlt) { it.alt = true; this.pendingAlt = false; }
    if (this.pendingJump) { it.jump = true; this.pendingJump = false; this.doubleJumpAt = now + 0.35; } // hop over whatever is in the way
    if (this.doubleJumpAt && now >= this.doubleJumpAt) { it.jump = true; this.doubleJumpAt = 0; }
    // dash to cover long distances quickly
    if (this.goal && !it.dodge && a.onGround && Math.hypot(this.goal.x - a.pos.x, this.goal.z - a.pos.z) > 25 && Math.random() < dt * 0.9) it.dodge = true;
    return it;
  }
}
