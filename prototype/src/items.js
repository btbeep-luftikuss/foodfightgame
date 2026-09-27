// Ground pickups (spawners, drops, loot piles), banana-peel traps and stuck-in-the-wall decor.
import * as THREE from 'three';
import { G, groundHeight, resolveHorizontal, rand } from './core.js';
import { FOODS, makeFoodMesh, randomFoodId, rollAmmo } from './foods.js';

const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.85, depthWrite: false });
const _v = new THREE.Vector3();

export class Items {
  constructor(game) {
    this.game = game;
    this.list = []; this.traps = []; this.decor = []; this.tramps = [];
    this.spawners = game.world.spawnPoints.map((p) => ({ pos: p, item: null, respawnAt: 0 }));
  }

  _make(id, count, pos, vel = null, spawner = null) {
    const g = new THREE.Group();
    const m = makeFoodMesh(id);
    m.scale.setScalar(id === 'cheese' ? 1 : 1.35);
    m.position.y = 1.0;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.06;
    g.add(m, ring);
    g.position.copy(pos);
    this.game.scene.add(g);
    const it = { id, count, pos: pos.clone(), vel: vel ? vel.clone() : null, mesh: g, inner: m, spawner, born: this.game.time, phase: rand(0, 6) };
    this.list.push(it);
    return it;
  }

  // Loose food, e.g. a banana that hit a wall or a splatted Titan's inventory.
  drop(id, count, pos, vel = null) {
    const p = pos.clone();
    if (!vel) p.y = groundHeight(p.x, p.z, p.y + 0.5);
    return this._make(id, count, p, vel || null);
  }

  fillSpawners(now) {
    for (const s of this.spawners) {
      if (!s.item && now >= s.respawnAt) {
        const id = randomFoodId();
        s.item = this._make(id, rollAmmo(), s.pos, null, s);
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
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      if (it.vel) { // tossed loot settles onto the ground
        it.vel.y -= G * dt;
        it.pos.addScaledVector(it.vel, dt);
        resolveHorizontal(it.pos, 0.4, 1);
        const gy = groundHeight(it.pos.x, it.pos.z, it.pos.y + 0.6);
        if (it.pos.y <= gy) { it.pos.y = gy; it.vel = null; }
      }
      it.mesh.position.copy(it.pos);
      it.inner.rotation.y += dt * 1.6;
      it.inner.position.y = 1.0 + Math.sin(now * 3 + it.phase) * 0.18;
      if (it.vel || now - it.born < 0.4) continue;
      for (const a of game.actors) {
        if (!a.alive) continue;
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z, dy = a.pos.y - it.pos.y;
        if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(dy) > 2.2) continue;
        const got = a.give(it.id, it.count);
        if (!got) continue;
        it.count -= got;
        game.sfx.play('pickup', it.pos, a === game.player ? 1 : 0.4);
        if (a === game.player) game.hud.toast(`+${got} ${FOODS[it.id].name}`);
        if (it.count <= 0) { this._removeItem(i); break; }
      }
    }
    // peel traps
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (now > t.until) { this._removeTrap(t); continue; }
      for (const a of game.actors) {
        if (!a.alive || a === t.owner || !a.onGround) continue;
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
        if (!a.alive || a.vel.y > 0.5) continue;
        const dy = a.pos.y - t.pos.y;
        if (dy < -0.2 || dy > 1.4 || Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) > 2.4) continue;
        a.vel.y = 22; a.onGround = false; a.gliding = false;
        t.squish = 1;
        game.sfx.play('boing', t.pos, 1);
        game.fx.burst('jelly', t.pos);
      }
    }
    // hide far-away pickups (cheap distance culling on top of frustum culling)
    const cam = game.camera.position;
    for (const it of this.list) it.mesh.visible = it.pos.distanceToSquared(cam) < 130 * 130;
    for (let i = this.decor.length - 1; i >= 0; i--) {
      const d = this.decor[i];
      if (now > d.until) { game.projectiles.releaseMesh(d.food, d.mesh); this.decor.splice(i, 1); }
    }
  }

  _removeItem(i) {
    const it = this.list[i];
    this.game.scene.remove(it.mesh);
    if (it.spawner) { it.spawner.item = null; it.spawner.respawnAt = this.game.time + 14; }
    this.list.splice(i, 1);
  }

  reset() {
    for (const it of this.list) this.game.scene.remove(it.mesh);
    for (const t of this.traps) this.game.scene.remove(t.mesh);
    for (const d of this.decor) this.game.projectiles.releaseMesh(d.food, d.mesh);
    for (const t of this.tramps) this.game.scene.remove(t.mesh);
    this.list.length = 0; this.traps.length = 0; this.decor.length = 0; this.tramps.length = 0;
    for (const s of this.spawners) { s.item = null; s.respawnAt = 0; }
  }
}
