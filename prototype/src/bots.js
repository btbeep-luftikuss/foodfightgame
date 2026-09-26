// Bot brains: pick a target, pick the right food for the range, lead shots with the
// same ballistic math the projectiles use, strafe, dodge, loot and heal.
import * as THREE from 'three';
import {
  G, COUNTER, FLOOR_Y, clamp, rand, pick, yawOf, forwardOf, hasLineOfSight, solveLob,
} from './core.js';
import { FOODS } from './foods.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _aim = new THREE.Vector3();

export const BOT_NAMES = ['Pip', 'Crouton', 'Waffles', 'Nibbles', 'Sprout', 'Mochi', 'Biscuit', 'Pickles', 'Dumpling', 'Truffle'];

// Preferred engagement ranges per food [min, max, score].
const RANGE = {
  carrot: [20, 70, 3.2], tomato: [6, 28, 2.6], ice: [5, 24, 2.3], soda: [5, 22, 2.5],
  banana: [4, 20, 1.9], cheese: [4, 20, 2.4], peel: [0, 7, 1.2],
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
  }

  think() {
    const a = this.a, g = this.game, now = g.time;
    // choose target: whoever hit me recently, else the nearest visible enemy
    let best = null, bestD = 48;
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
      if (onFloor) this._goPad(); else { this.goal = new THREE.Vector3(tide.x, a.pos.y, tide.z); this.goalKind = 'tide'; }
    } else if (onFloor) {
      this._goPad();
    } else if (!a.inv.some(Boolean) || (!this.target && a.inv.filter(Boolean).length < 3)) {
      const it = this._nearestItem(this.target ? 25 : 70);
      if (it) { this.goal = it.pos; this.goalKind = 'item'; }
    }
    if (!this.goal && a.glaze < 40 && g.world.honey.cap > 30 && (!this.target || bestD > 18)) {
      const h = g.world.honey;
      if (Math.hypot(a.pos.x - h.x, a.pos.z - h.z) < 35) { this.goal = new THREE.Vector3(h.x, 0, h.z); this.goalKind = 'honey'; }
    }

    // heal with a banana when hurt and not under pressure
    const bananaSlot = a.inv.findIndex((s) => s && s.id === 'banana');
    if (a.hp < 60 && bananaSlot >= 0 && (!this.target || bestD > 14) && !a.eat) {
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

  _goPad() {
    const a = this.a;
    let best = null, bd = Infinity;
    for (const p of this.game.world.pads) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { this.goal = new THREE.Vector3(best.x, FLOOR_Y, best.z); this.goalKind = 'pad'; }
  }

  _nearestItem(maxD) {
    const a = this.a;
    let best = null, bd = maxD;
    for (const it of this.game.items.list) {
      if (it.vel || Math.abs(it.pos.y - a.pos.y) > 3) continue;
      const d = it.pos.distanceTo(a.pos);
      if (d < bd && a.inv.some((s) => !s || (s.id === it.id && s.count < FOODS[it.id].maxStack))) { bd = d; best = it; }
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
      if (Math.random() < dt * 0.35) it.jump = true;
    } else {
      // wander toward the middle of the tide circle
      const tide = g.tide;
      mv.set((tide ? tide.x : 0) - a.pos.x + Math.sin(now * 0.3 + a.id) * 20, 0, (tide ? tide.z : 0) - a.pos.z + Math.cos(now * 0.23 + a.id) * 12);
    }
    if (now < this.unstickUntil) mv.copy(this.unstickDir);

    // stay off the edge unless heading for a pad; avoid a hot burner
    if (a.pos.y > -2 && this.goalKind !== 'pad') {
      const m = 4;
      if (a.pos.x < COUNTER.minX + m) mv.x = Math.max(mv.x, 1);
      if (a.pos.x > COUNTER.maxX - m) mv.x = Math.min(mv.x, -1);
      if (a.pos.z < COUNTER.minZ + m) mv.z = Math.max(mv.z, 1);
      if (a.pos.z > COUNTER.maxZ - m) mv.z = Math.min(mv.z, -1);
    }
    const b = g.world.burner;
    if (b.state !== 'off') {
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
      if (food.profile === 'lob') {
        solveLob(from, _aim, speed, G, a.aimDir);
      } else if (food.profile === 'line') {
        _aim.y += 0.5 * G * 0.3 * tFlight * tFlight;
        a.aimDir.subVectors(_aim, from).normalize();
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
      const inRange = d >= r[0] * 0.6 && d <= r[1] * 1.15;
      if (slot.id === 'cheese') {
        if (!a.shieldUp && d > 12 && now > this.nextShotAt) { this.pendingAlt = true; this.nextShotAt = now + 1; }
        else if (d < 13 && now > this.nextShotAt) { it.primary = true; this.nextShotAt = now + rand(0.6, 1.2); }
      } else if (slot.id === 'peel') {
        if (d < 7 && now > this.nextShotAt) { it.primary = true; this.nextShotAt = now + 2; }
      } else if (food.charge > 0) {
        if (a.charging) it.primary = now < this.holdUntil;
        else if (inRange && now > this.nextShotAt && now >= a.recoverUntil) {
          it.primary = true;
          this.holdUntil = now + food.charge * rand(1.02, 1.15); // full charge matches the aim solution
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
    if (this.pendingJump) { it.jump = true; this.pendingJump = false; }
    return it;
  }
}
