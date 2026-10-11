// Floating food pickups (spawners, drops, loot piles, grocery drops), banana-peel traps and
// stuck-in-the-wall decor.
//
// Performance: every pickup is drawn with InstancedMesh, one draw call per food part for the
// whole map, instead of one mesh per pickup.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, groundHeight, resolveHorizontal, rand } from './core.js';
import { MAX_HP } from './actors.js';
import { FOODS, FOOD_IDS, makeFoodMesh, foodParts, randomFoodId, pickupAmmo } from './foods.js';

const CAP = 200;         // instances per food part
const RESPAWN = 14;      // seconds before a picked-up spawner refills
const INST_IDS = [...FOOD_IDS, 'peel']; // everything that can lie on the ground as loot
const DRAW_IDS = [...INST_IDS, 'heal'];
// Chef's Choice: food never heals there, so green heal crosses float on every third spawner instead.
const HEAL_HP = 60, HEAL_RESPAWN = 20;
const PAD_USES = 6, PAD_LIFE = 45, PAD_BOOST = 30; // Jelly jump pads (0.31): 6 bounces, about 22 m up
const rr = (x, a, b, w, h, r) => (x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h));
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
    { // heal cross: two rounded bars, glowing green so it reads at a distance
      const bar = (w, h) => new THREE.BoxGeometry(w, h, 0.32);
      const geo = mergeGeometries([bar(0.42, 1.25), bar(1.25, 0.42)]);
      const mat = new THREE.MeshStandardMaterial({ color: '#3ddc6a', emissive: '#1faa45', emissiveIntensity: 0.9, roughness: 0.35 });
      const im = new THREE.InstancedMesh(geo, mat, CAP);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      scene.add(im);
      this.inst.heal = [im];
    }
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.85, depthWrite: false }), 200);
    this.rings.frustumCulled = false; this.rings.count = 0;
    scene.add(this.rings);
    this.fill = {};
  }

  // Loose food, e.g. a banana that hit a wall or a splatted Titan's inventory.
  drop(id, count, pos, vel = null, spawner = null) {
    if (this.game.mode === 'chef' && id !== 'heal') return null; // Chef's Choice: no food anywhere on the map
    const p = pos.clone();
    if (!vel) p.y = groundHeight(p.x, p.z, p.y + 0.5);
    const it = { id, count, pos: p, vel: vel ? vel.clone() : null, born: this.game.time, phase: rand(0, 6), visible: true, spawner };
    this.list.push(it);
    return it;
  }

  // Everything a bot might walk to for food.
  pickables() { return this.list.filter((it) => !it.vel); }

  fillSpawners(now) {
    const chef = this.game.mode === 'chef';
    for (let i = 0; i < this.spawners.length; i++) {
      const s = this.spawners[i];
      if (chef && i % 3) continue;
      if (!s.item && now >= s.respawnAt) {
        if (chef) { s.item = this.drop('heal', 1, s.pos, null, s); continue; }
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
    const net = this.game.net;
    if (net && (owner === this.game.player || (owner.isBot && !owner.isRemote && net.isHost))) net.event('p', +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), ...(owner.isBot ? [owner.id] : []));
  }
  _removeTrap(t) {
    this.game.scene.remove(t.mesh);
    this.traps.splice(this.traps.indexOf(t), 1);
  }

  // Jelly jump pads (the Jelly Cube's alt; 0.31): bounce anyone about 22 m up, good for 6 bounces
  // (the meter over the pad shows what's left), 45 s, max 2 per player. Online every game counts
  // its own Titans' bounces and tells the room ('jb'), so the meters agree.
  addTrampoline(owner, pos) {
    const mine = this.tramps.filter((t) => t.owner === owner);
    if (mine.length >= 2) this._removeTramp(mine[0]);
    const mesh = makeFoodMesh('jelly');
    mesh.scale.set(5, 1.3, 5);
    mesh.position.copy(pos).setY(pos.y + 0.35);
    this.game.scene.add(mesh);
    const meter = this._meter();
    meter.position.copy(pos).setY(pos.y + 3.3);
    this.game.scene.add(meter);
    const t = { owner, pos: pos.clone(), mesh, meter, until: this.game.time + PAD_LIFE, squish: 0, uses: PAD_USES };
    this._drawMeter(t);
    this.tramps.push(t);
    const net = this.game.net;
    if (net && (owner === this.game.player || (owner.isBot && !owner.isRemote && net.isHost))) net.event('r', +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), ...(owner.isBot ? [owner.id] : []));
  }
  _meter() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 32;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(3.4, 0.85, 1);
    sp.renderOrder = 7;
    sp.userData.canvas = c;
    return sp;
  }
  _drawMeter(t) {
    const c = t.meter.userData.canvas, x = c.getContext('2d');
    x.clearRect(0, 0, 128, 32);
    x.fillStyle = 'rgba(25,12,35,0.72)';
    x.beginPath(); rr(x, 1, 3, 126, 26, 12); x.fill();
    const k = t.uses / PAD_USES, w = 112 / PAD_USES;
    const color = k > 0.5 ? '#6be35f' : k > 0.25 ? '#ffd447' : '#ff5a3a';
    for (let i = 0; i < PAD_USES; i++) {
      x.fillStyle = i < t.uses ? color : 'rgba(255,255,255,0.16)';
      x.beginPath(); rr(x, 9 + i * w, 9, w - 4, 14, 4); x.fill();
    }
    t.meter.material.map.needsUpdate = true;
  }
  _removeTramp(t) {
    this.game.scene.remove(t.mesh);
    this.game.scene.remove(t.meter);
    t.meter.material.map.dispose(); t.meter.material.dispose();
    const i = this.tramps.indexOf(t);
    if (i >= 0) this.tramps.splice(i, 1);
  }
  // A bounce wears the pad down (local: one of my Titans bounced; tell the room).
  _bounced(t, local) {
    const game = this.game;
    t.uses--; t.squish = 1;
    if (local && game.net) game.net.event('jb', +t.pos.x.toFixed(2), +t.pos.y.toFixed(2), +t.pos.z.toFixed(2));
    if (t.uses <= 0) { // worn out: it bursts
      game.fx.burst('jelly', t.pos); game.fx.burst('jelly', t.pos);
      game.world.paintSplat(t.pos.x, t.pos.y, t.pos.z, 3, 'jelly');
      game.sfx.play('splat', t.pos, 0.9);
      this._removeTramp(t);
      return false;
    }
    this._drawMeter(t);
    return true;
  }
  // Someone else's Titan bounced on a pad (from the room).
  remoteBounce(pos) {
    let best = null, bd = 1.5;
    for (const t of this.tramps) { const d = t.pos.distanceTo(pos); if (d < bd) { bd = d; best = t; } }
    if (!best) return;
    this.game.sfx.play('boing', best.pos, 0.8);
    this.game.fx.burst('jelly', best.pos);
    this._bounced(best, false);
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
        if (it.id === 'heal') {
          if (a.hp >= (a.maxHp || MAX_HP)) continue;
          a.heal(HEAL_HP);
          game.sfx.play('eat', it.pos, a === game.player ? 1 : 0.4);
          game.fx.burst('bubbles', it.pos);
          game.floatText(a, `+${HEAL_HP} HP`, 'heal');
          if (a === game.player) game.hud.toast(`Healed +${HEAL_HP}`);
          if (it.spawner) { it.spawner.item = null; it.spawner.respawnAt = now + HEAL_RESPAWN; }
          this.list.splice(i, 1);
          break;
        }
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
      const worn = 0.65 + 0.35 * (t.uses / PAD_USES); // it flattens as it wears out
      t.mesh.scale.set(5 + t.squish, 1.3 * worn * (1 - t.squish * 0.5) + Math.sin(now * 6) * 0.04, 5 + t.squish);
      t.meter.position.y = t.pos.y + 3.3 + Math.sin(now * 2 + t.pos.x) * 0.08;
      for (const a of game.actors) {
        if (!a.alive || a.isRemote || a.vel.y > 0.5) continue;
        const dy = a.pos.y - t.pos.y;
        if (dy < -0.2 || dy > 1.4 || Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) > 2.4) continue;
        a.vel.y = PAD_BOOST; a.vel.x *= 1.15; a.vel.z *= 1.15; a.onGround = false; a.gliding = false;
        game.sfx.play('boing', t.pos, 1.2);
        game.fx.burst('jelly', t.pos);
        game.fx.burst('jump', t.pos, 1);
        if (a === game.player) { game.fovKick = Math.min(22, (game.fovKick || 0) + 8); game.fx.shake(0.05); }
        if (!this._bounced(t, true)) break;
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
    for (const id of DRAW_IDS) fill[id] = 0;
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
    for (const id of DRAW_IDS) {
      for (const im of this.inst[id]) { im.count = fill[id]; if (fill[id]) im.instanceMatrix.needsUpdate = true; }
    }
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const t of this.traps) this.game.scene.remove(t.mesh);
    for (const d of this.decor) this.game.projectiles.releaseMesh(d.food, d.mesh);
    for (const t of [...this.tramps]) this._removeTramp(t);
    this.list.length = 0; this.traps.length = 0; this.decor.length = 0; this.tramps.length = 0;
    for (const sp of this.spawners) { sp.item = null; sp.respawnAt = 0; }
  }
}
