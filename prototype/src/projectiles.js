// Projectile simulation. Lob and Line foods fly on simple ballistic arcs (GDD 12.1:
// analytic projectiles), Return foods steer back to the thrower, Roll foods ride the ground.
import * as THREE from 'three';
import {
  G, FLOOR_BOUNDS, clamp, solidAt, groundHeight, resolveHorizontal, segSegDist2, segPointDist2, forwardOf,
} from './core.js';
import { FOODS, makeFoodMesh } from './foods.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
const _prev = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pool = {};
  }

  getMesh(food) {
    const p = (this.pool[food] ||= []);
    let m = p.pop();
    if (!m) {
      m = new THREE.Group();
      const inner = makeFoodMesh(food);
      m.add(inner);
      m.userData.inner = inner;
      if (food === 'cheese') { inner.rotation.z = Math.PI / 2; }
      this.game.scene.add(m);
    }
    m.visible = true;
    m.rotation.set(0, 0, 0);
    m.userData.inner.rotation.x = 0;
    return m;
  }
  releaseMesh(food, m) { m.visible = false; this.pool[food].push(m); }

  launch(o) {
    const food = FOODS[o.food];
    const p = {
      food: o.food, owner: o.owner, pos: o.pos.clone(), vel: o.vel.clone(),
      gravity: o.gravity ?? 1, radius: o.radius ?? food.radius ?? 0.35, life: 0, maxLife: o.life ?? 6,
      spin: o.spin ?? 0, charge: o.charge ?? 1, orient: !!o.orient, roll: !!o.roll, curve: o.curve ?? 0,
      phase: 'out', hitSet: new Set(), done: false, keepMesh: false, rollAngle: 0, bruise: o.bruise ?? 0,
      mesh: this.getMesh(o.food),
    };
    p.mesh.position.copy(p.pos);
    this.list.push(p);
    return p;
  }

  update(dt) {
    for (const p of this.list) this._step(p, dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.done) continue;
      if (!p.keepMesh) this.releaseMesh(p.food, p.mesh);
      this.list.splice(i, 1);
    }
  }

  _end(p) { p.done = true; }

  _step(p, dt) {
    const game = this.game, food = FOODS[p.food];
    p.life += dt;
    if (p.life > p.maxLife) {
      if (p.food === 'banana') game.items.drop('banana', 1, p.pos);
      if (food.expire) food.expire(p, game);
      return this._end(p);
    }
    if (p.food === 'banana' && this._bananaSteer(p, dt)) return;

    const dist = p.vel.length() * dt;
    const n = clamp(Math.ceil(dist / 0.45), 1, 16);
    const sdt = dt / n;
    for (let s = 0; s < n && !p.done; s++) {
      _prev.copy(p.pos);
      p.vel.y -= G * p.gravity * sdt;
      p.pos.addScaledVector(p.vel, sdt);
      if (p.roll) this._rollPhysics(p, sdt);
      if (this._collide(p, food)) return this._end(p);
    }

    // visuals
    const m = p.mesh;
    m.position.copy(p.pos);
    if (p.orient) {
      m.lookAt(_t.copy(p.pos).sub(p.vel)); // carrot tip (-z) leads
    } else if (p.roll) {
      m.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      p.rollAngle += Math.hypot(p.vel.x, p.vel.z) * dt / 0.75;
      m.userData.inner.rotation.x = p.rollAngle;
    } else {
      m.rotation.x += p.spin * dt; m.rotation.y += p.spin * 0.7 * dt;
    }
    if (p.roll && p.life > 0.3 && Math.hypot(p.vel.x, p.vel.z) < 2.5) {
      if (food.expire) food.expire(p, game);
      this._end(p);
    }
  }

  // Banana: curve outward, then home back to the thrower's hand.
  _bananaSteer(p, dt) {
    const o = p.owner;
    if (p.phase === 'out') {
      const a = p.curve * dt, c = Math.cos(a), s = Math.sin(a);
      const x = p.vel.x * c - p.vel.z * s, z = p.vel.x * s + p.vel.z * c;
      p.vel.x = x; p.vel.z = z;
      if (p.life > 0.8) { p.phase = 'back'; p.hitSet.clear(); }
      if (p.life % 0.3 < dt) this.game.sfx.play('whirr', p.pos, 0.5);
      return false;
    }
    if (!o.alive) { this.game.items.drop('banana', 1, p.pos); this._end(p); return true; }
    o.handPos(_h);
    _t.subVectors(_h, p.pos);
    const d = _t.length();
    if (d < 1.6) {
      // Each catch bruises the banana; after its third throw it is mush and is not refunded.
      if (p.bruise < 2) {
        if (o.give('banana', 1)) {
          const s = o.inv.find((x) => x && x.id === 'banana');
          if (s) s.bruise = Math.max(s.bruise || 0, p.bruise + 1);
        } else this.game.items.drop('banana', 1, o.pos);
        this.game.sfx.play('pickup', o.pos, 0.8);
      } else {
        this.game.fx.burst('banana', p.pos);
        this.game.floatText(o, 'MUSH', 'slip');
      }
      this._end(p);
      return true;
    }
    _t.multiplyScalar(30 / d);
    p.vel.lerp(_t, 1 - Math.exp(-5 * dt));
    return false;
  }

  _rollPhysics(p, sdt) {
    const r = 0.75;
    const gy = groundHeight(p.pos.x, p.pos.z, p.pos.y - r + 0.6, 0.6, 0);
    if (p.pos.y - r <= gy) {
      if (p.vel.y < -8) this.game.sfx.play('thud', p.pos, 0.7);
      p.pos.y = gy + r;
      p.vel.y = p.vel.y < -8 ? -p.vel.y * 0.25 : 0;
      const k = Math.exp(-0.18 * sdt);
      p.vel.x *= k; p.vel.z *= k;
    }
    _c.set(p.pos.x, p.pos.y - r, p.pos.z);
    const nrm = resolveHorizontal(_c, r, 1.5, 0.6);
    if (nrm) {
      const d = p.vel.x * nrm.x + p.vel.z * nrm.z;
      if (d < 0) { p.vel.x -= 2 * d * nrm.x; p.vel.z -= 2 * d * nrm.z; p.vel.x *= 0.75; p.vel.z *= 0.75; this.game.sfx.play('thud', p.pos, 0.6); }
      p.pos.x = _c.x; p.pos.z = _c.z;
    }
    if (_c.x <= FLOOR_BOUNDS.minX + 0.01 || _c.x >= FLOOR_BOUNDS.maxX - 0.01) p.vel.x *= -0.7;
    if (_c.z <= FLOOR_BOUNDS.minZ + 0.01 || _c.z >= FLOOR_BOUNDS.maxZ - 0.01) p.vel.z *= -0.7;
  }

  // Returns true if the projectile is finished.
  _collide(p, food) {
    const game = this.game;
    const rad = p.radius;
    // 1) cheese shields block projectiles from the front
    for (const a of game.actors) {
      if (!a.alive || !a.shieldUp || a === p.owner || p.food === 'cheese') continue;
      forwardOf(a.yaw, _f);
      _c.copy(a.pos).addScaledVector(_f, 1.45).setY(a.pos.y + 1.0);
      if (segPointDist2(_prev, p.pos, _c) < (1.5 + rad) ** 2 && (p.vel.x * _f.x + p.vel.z * _f.z) < 0) {
        game.damageShield(a, food.dmg || 25, p.owner);
        if (p.food === 'banana') { game.items.drop('banana', 1, p.pos); return true; }
        return food.impact(p, { point: p.pos.clone(), blockedBy: a, world: false }, game);
      }
    }
    // 2) actors: body capsule plus a head sphere for face hits
    for (const a of game.actors) {
      if (!a.alive || a === p.owner || p.hitSet.has(a)) continue;
      _a.set(a.pos.x, a.pos.y + 0.5, a.pos.z); _b.set(a.pos.x, a.pos.y + 1.0, a.pos.z);
      _h.set(a.pos.x, a.pos.y + 1.55, a.pos.z);
      const headHit = segPointDist2(_prev, p.pos, _h) < (0.43 + rad) ** 2;
      const bodyHit = segSegDist2(_prev, p.pos, _a, _b) < (0.45 + rad) ** 2;
      if (!headHit && !bodyHit) continue;
      p.hitSet.add(a);
      const head = headHit && food.profile === 'line';
      const done = food.impact(p, { point: p.pos.clone(), actor: a, head, world: false }, game);
      if (done || !food.pierce) return true;
    }
    // 3) the landmark tomato
    const L = game.world.landmark;
    if (L.alive && L.collider.enabled && p.food !== 'cheese') {
      _c.set(L.x, L.y * L.group.scale.y, L.z);
      if (p.pos.distanceTo(_c) < L.r * L.group.scale.x * 0.95 + rad) {
        game.hitLandmark(food.dmg || 20, p.owner, p.pos);
        if (p.food === 'banana') { game.items.drop('banana', 1, p.pos); return true; }
        return food.impact(p, { point: p.pos.clone(), world: true, top: false }, game) || true;
      }
    }
    if (p.roll) return false;
    // 4) static world
    const s = solidAt(p.pos, rad * 0.5);
    if (s) {
      const top = _prev.y >= s.groundY - 0.05;
      const point = top ? p.pos.clone().setY(s.groundY) : _prev.clone();
      return food.impact(p, { point, world: true, top }, game);
    }
    return false;
  }

  reset() {
    for (const p of this.list) this.releaseMesh(p.food, p.mesh);
    this.list.length = 0;
  }
}
