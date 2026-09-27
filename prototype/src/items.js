// Floating food pickups (spawners, drops, loot piles, grocery drops), banana-peel traps and
// stuck-in-the-wall decor.
//
// Performance: every pickup is drawn with InstancedMesh, one draw call per food part for the
// whole map, instead of one mesh per pickup.
import * as THREE from 'three';
import { G, groundHeight, resolveHorizontal, rand } from './core.js';
import { FOODS, FOOD_IDS, makeFoodMesh, foodParts, randomFoodId, pickupAmmo } from './foods.js';

const CAP = 200;         // instances per food part
const RESPAWN = 14;      // seconds before a picked-up spawner refills
const INST_IDS = [...FOOD_IDS, 'peel']; // everything that can lie on the ground as loot
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class Items {
  constructor(game) {
    this.game = game;
    this.list = []; this.traps = []; this.decor = []; this.tramps = [];
    const scene = game.scene;

    this.spawners = game.world.spawnPoints.map((p) => ({ pos: p.clone(), item: null, respawnAt: 0 }));

    // instanced food: one InstancedMesh per merged part of every food
    this.inst = {};
    for (const id of INST_IDS) {
      this.inst[id] = foodParts(id).map(([geo, mat]) => {
        const im = new THREE.InstancedMesh(geo, mat, CAP);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false; im.count = 0;
        scene.add(im);
        return im;
      });
    }
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.85, depthWrite: false }), 200);
    this.rings.frustumCulled = false; this.rings.count = 0;
    scene.add(this.rings);
    this.fill = {};
  }

  // Loose food, e.g. a banana that hit a wall or a splatted Titan's inventory.
  drop(id, count, pos, vel = null, spawner = null) {
    const p = pos.clone();
    if (!vel) p.y = groundHeight(p.x, p.z, p.y + 0.5);
    const it = { id, count, pos: p, vel: vel ? vel.clone() : null, born: this.game.time, phase: rand(0, 6), visible: true, spawner };
    this.list.push(it);
    return it;
  }

  // Everything a bot might walk to for food.
  pickables() { return this.list.filter((it) => !it.vel); }

  fillSpawners(now) {
    for (const s of this.spawners) {
      if (!s.item && now >= s.respawnAt) {
        const id = randomFoodId();
        s.item = this.drop(id, pickupAmmo(id), s.pos, null, s);
      }
    }
  }

  addTrap(owner, pos) {
    const mine = this.traps.filter((t) => t.owner === owner);
    if (mine.length >= 2) this._removeTrap(mine[0]); // GDD: max 2 active peels per player
    const mesh = makeFoodMesh('peel');
    mesh.scale.setScalar(1.3);
    mesh.position.copy(pos).setY(pos.y + 0.05);
    mesh.rotation.y = rand(0, 6.28);
    this.game.scene.add(mesh);
    this.traps.push({ owner, pos: pos.clone(), mesh, until: this.game.time + 40 });
    if (this.game.net && owner === this.game.player) this.game.net.event('p', +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2));
  }
  _removeTrap(t) {
    this.game.scene.remove(t.mesh);
    this.traps.splice(this.traps.indexOf(t), 1);
  }

  // Jelly trampolines (GDD Jelly Cube alt): 30 s, max 2 per player, launch anyone 12 m up.
  addTrampoline(owner, pos) {
    const mine = this.tramps.filter((t) => t.owner === owner);
    if (mine.length >= 2) this._removeTramp(mine[0]);
    const mesh = makeFoodMesh('jelly');
    mesh.scale.set(5, 1.3, 5);
    mesh.position.copy(pos).setY(pos.y + 0.35);
    this.game.scene.add(mesh);
    this.tramps.push({ owner, pos: pos.clone(), mesh, until: this.game.time + 30, squish: 0 });
    if (this.game.net && owner === this.game.player) this.game.net.event('r', +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2));
  }
  _removeTramp(t) {
    this.game.scene.remove(t.mesh);
    this.tramps.splice(this.tramps.indexOf(t), 1);
  }

  stickDecor(p, seconds) {
    this.decor.push({ food: p.food, mesh: p.mesh, until: this.game.time + seconds });
  }

  update(dt) {
    const game = this.game, now = game.time;
    this.fillSpawners(now);

    // loose pickups
    const cam = game.camera.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      if (it.vel) { // tossed loot and grocery drops settle onto the ground
        it.vel.y -= G * dt;
        it.pos.addScaledVector(it.vel, dt);
        resolveHorizontal(it.pos, 0.4, 1);
        const gy = groundHeight(it.pos.x, it.pos.z, it.pos.y + 0.6);
        if (it.pos.y <= gy) { it.pos.y = gy; it.vel = null; }
      }
      it.visible = it.pos.distanceToSquared(cam) < 110 * 110;
      if (it.vel || now - it.born < 0.4) continue;
      for (const a of game.actors) {
        if (!a.alive || a.isRemote) continue; // pickups are per player online
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z, dy = a.pos.y - it.pos.y;
        if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(dy) > 2.2) continue;
        const got = a.give(it.id, it.count);
        if (!got) continue;
        it.count -= got;
        game.sfx.play('pickup', it.pos, a === game.player ? 1 : 0.4);
        if (a === game.player) game.hud.toast(`+${got} ${FOODS[it.id].name}`);
        if (it.count <= 0) {
          if (it.spawner) { it.spawner.item = null; it.spawner.respawnAt = now + RESPAWN; }
          this.list.splice(i, 1);
          break;
        }
      }
    }

    // peel traps
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (now > t.until) { this._removeTrap(t); continue; }
      for (const a of game.actors) {
        if (!a.alive || a.isRemote || a === t.owner || !a.onGround) continue;
        if (Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) < 1.3 && Math.abs(a.pos.y - t.pos.y) < 1) {
          if (a.trip(t.owner)) {
            game.sfx.play('slip', a.pos, 1.2);
            game.fx.burst('banana', a.pos);
            game.floatText(a, 'SLIP!', 'slip');
          }
          this._removeTrap(t);
          break;
        }
      }
    }
    for (let i = this.tramps.length - 1; i >= 0; i--) {
      const t = this.tramps[i];
      if (now > t.until) { this._removeTramp(t); continue; }
      t.squish = Math.max(0, t.squish - dt * 4);
      t.mesh.scale.set(5 + t.squish, 1.3 * (1 - t.squish * 0.5) + Math.sin(now * 6) * 0.04, 5 + t.squish);
      for (const a of game.actors) {
        if (!a.alive || a.isRemote || a.vel.y > 0.5) continue;
        const dy = a.pos.y - t.pos.y;
        if (dy < -0.2 || dy > 1.4 || Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) > 2.4) continue;
        a.vel.y = 22; a.onGround = false; a.gliding = false;
        t.squish = 1;
        game.sfx.play('boing', t.pos, 1);
        game.fx.burst('jelly', t.pos);
      }
    }
    for (let i = this.decor.length - 1; i >= 0; i--) {
      const d = this.decor[i];
      if (now > d.until) { game.projectiles.releaseMesh(d.food, d.mesh); this.decor.splice(i, 1); }
    }
    this._draw(now, cam);
  }

  // Write every visible food into its instanced meshes.
  _draw(now, cam) {
    const fill = this.fill;
    for (const id of INST_IDS) fill[id] = 0;
    const put = (id, x, y, z, s, ry) => {
      const n = fill[id];
      if (n >= CAP) return;
      _e.set(0, ry, 0); _q.setFromEuler(_e); _s.set(s, s, s); _p.set(x, y, z);
      _m.compose(_p, _q, _s);
      for (const im of this.inst[id]) im.setMatrixAt(n, _m);
      fill[id] = n + 1;
    };
    let rings = 0;
    for (const it of this.list) {
      if (!it.visible) continue;
      put(it.id, it.pos.x, it.pos.y + 1 + Math.sin(now * 3 + it.phase) * 0.18, it.pos.z, it.id === 'cheese' ? 1 : 1.35, now * 1.6 + it.phase);
      if (!it.vel && rings < 200) { _m.makeTranslation(it.pos.x, it.pos.y + 0.06, it.pos.z); this.rings.setMatrixAt(rings++, _m); }
    }
    for (const id of INST_IDS) {
      for (const im of this.inst[id]) { im.count = fill[id]; if (fill[id]) im.instanceMatrix.needsUpdate = true; }
    }
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const t of this.traps) this.game.scene.remove(t.mesh);
    for (const d of this.decor) this.game.projectiles.releaseMesh(d.food, d.mesh);
    for (const t of this.tramps) this.game.scene.remove(t.mesh);
    this.list.length = 0; this.traps.length = 0; this.decor.length = 0; this.tramps.length = 0;
    for (const sp of this.spawners) { sp.item = null; sp.respawnAt = 0; }
  }
}
