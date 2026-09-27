// Food bushes (the spawners), loose pickups (drops, loot piles, grocery drops), banana-peel
// traps and stuck-in-the-wall decor.
//
// Performance: every pickup and every piece of food on a bush is drawn with InstancedMesh, one
// draw call per food part for the whole map, instead of one mesh per pickup. Bushes are a single
// instanced mesh too.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, groundHeight, resolveHorizontal, rand } from './core.js';
import { FOODS, FOOD_IDS, makeFoodMesh, foodParts, randomFoodId, rollAmmo } from './foods.js';

const CAP = 420;                 // instances per food part (62 bushes x 5 shown + drops)
const BUSH_R = 3.2;              // collect radius around a bush
const COLLECT_EVERY = 0.09;      // seconds per food while standing at a bush
const BUSH_REGROW = 12;          // seconds before an empty bush grows new food
const SHOWN_ON_BUSH = 5;
const INST_IDS = [...FOOD_IDS, 'peel']; // everything that can lie on the ground as loot
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

function bushGeometry() {
  const parts = [[0, 1.2, 0, 1.6], [1.2, 0.95, 0.3, 1.2], [-1.1, 1.0, -0.4, 1.25], [0.2, 1.0, 1.15, 1.15], [-0.3, 0.9, -1.2, 1.1], [0.5, 2.05, -0.2, 1.0]];
  return mergeGeometries(parts.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z))); // 120 triangles, flat-shaded
}

export class Items {
  constructor(game) {
    this.game = game;
    this.list = []; this.traps = []; this.decor = []; this.tramps = [];
    const scene = game.scene;

    // bushes: one instanced mesh for all of them
    this.bushes = game.world.spawnPoints.map((p, i) => ({ pos: p.clone(), id: null, count: 0, regrowAt: 0, grow: 1, phase: i * 1.7, collectAcc: new Map() }));
    const leaf = new THREE.MeshStandardMaterial({ color: '#4f9a3a', roughness: 0.85, flatShading: true });
    this.bushMesh = new THREE.InstancedMesh(bushGeometry(), leaf, this.bushes.length);
    this.bushMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.bushes.length * 3), 3);
    this.bushMesh.frustumCulled = false;
    this.bushMesh.receiveShadow = !!game.quality.shadows;
    const c = new THREE.Color();
    this.bushes.forEach((b, i) => {
      c.setHSL(0.27 + rand(-0.03, 0.04), 0.5, 0.36 + rand(-0.05, 0.05));
      this.bushMesh.setColorAt(i, c);
    });
    scene.add(this.bushMesh);

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
  drop(id, count, pos, vel = null) {
    const p = pos.clone();
    if (!vel) p.y = groundHeight(p.x, p.z, p.y + 0.5);
    const it = { id, count, pos: p, vel: vel ? vel.clone() : null, born: this.game.time, phase: rand(0, 6), visible: true };
    this.list.push(it);
    return it;
  }

  // Everything a bot might walk to for food: loose pickups plus bushes that have food.
  pickables() {
    const out = this.list.filter((it) => !it.vel);
    for (const b of this.bushes) if (b.count > 0) out.push(b);
    return out;
  }

  fillSpawners(now) {
    for (const b of this.bushes) {
      if (b.count <= 0 && now >= b.regrowAt) { b.id = randomFoodId(); b.count = rollAmmo(); b.grow = 0; }
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

  // Is a Titan tucked inside a bush? (Used to keep hiding spots hidden.)
  inBush(a) {
    for (const b of this.bushes) {
      if (Math.abs(a.pos.y - b.pos.y) < 1.5 && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 2.2) return true;
    }
    return false;
  }

  update(dt) {
    const game = this.game, now = game.time;
    this.fillSpawners(now);

    // bushes hand out their food one piece at a time to whoever stands in them
    for (const b of this.bushes) {
      b.grow = Math.min(1, b.grow + dt * 1.5);
      if (b.count <= 0) continue;
      for (const a of game.actors) {
        if (!a.alive || Math.abs(a.pos.y - b.pos.y) > 2.5 || Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > BUSH_R) { b.collectAcc.delete(a); continue; }
        let acc = (b.collectAcc.get(a) ?? COLLECT_EVERY) + dt;
        while (acc >= COLLECT_EVERY && b.count > 0) {
          acc -= COLLECT_EVERY;
          if (!a.give(b.id, 1)) { acc = 0; break; } // inventory full
          b.count--;
          if (a === game.player) {
            game.sfx.play('pickup', null, 0.35);
            this._tally(b.id);
          }
          game.fx.burst('leaf', _p.set(b.pos.x, b.pos.y + 1.8, b.pos.z), 0.3);
        }
        b.collectAcc.set(a, acc);
        if (b.count <= 0) { b.regrowAt = now + BUSH_REGROW; b.collectAcc.clear(); break; }
      }
    }
    if (this.tallyT > 0) { this.tallyT -= dt; if (this.tallyT <= 0) this.tallies = null; }

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
        if (!a.alive) continue;
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z, dy = a.pos.y - it.pos.y;
        if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(dy) > 2.2) continue;
        const got = a.give(it.id, it.count);
        if (!got) continue;
        it.count -= got;
        game.sfx.play('pickup', it.pos, a === game.player ? 1 : 0.4);
        if (a === game.player) game.hud.toast(`+${got} ${FOODS[it.id].name}`);
        if (it.count <= 0) { this.list.splice(i, 1); break; }
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
    for (let i = this.decor.length - 1; i >= 0; i--) {
      const d = this.decor[i];
      if (now > d.until) { game.projectiles.releaseMesh(d.food, d.mesh); this.decor.splice(i, 1); }
    }
    this._draw(now, cam);
  }

  // Bush pickups arrive one at a time; show them as one running total, e.g. "+11 Tomato".
  _tally(id) {
    this.tallies ||= {};
    this.tallies[id] = (this.tallies[id] || 0) + 1;
    this.tallyT = 1.2;
    const txt = Object.entries(this.tallies).map(([k, n]) => `+${n} ${FOODS[k].name}`).join('  ');
    this.game.hud.toast(txt);
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
    // Level of detail: 5 pieces of food on a bush up close, 1 at mid range, none far away.
    const near2 = 45 * 45, far2 = 100 * 100;
    this.bushes.forEach((b, i) => {
      const s = b.count > 0 ? 0.55 + 0.45 * b.grow : 0.8; // empty bushes look picked over
      _m.compose(_p.copy(b.pos), _q.identity(), _s.set(s, s * (0.95 + Math.sin(now * 1.3 + b.phase) * 0.02), s));
      this.bushMesh.setMatrixAt(i, _m);
      const d2 = b.pos.distanceToSquared(cam);
      if (b.count <= 0 || d2 > far2) return;
      const shown = d2 < near2 ? Math.min(b.count, SHOWN_ON_BUSH) : 1;
      for (let k = 0; k < shown; k++) {
        const a = (k / SHOWN_ON_BUSH) * Math.PI * 2 + b.phase;
        const r = k === 0 ? 0 : 1.55;
        put(b.id, b.pos.x + Math.cos(a) * r, b.pos.y + (k === 0 ? 3.1 : 1.9) * s + Math.sin(now * 2 + k) * 0.08, b.pos.z + Math.sin(a) * r, 0.85 * b.grow, a);
      }
    });
    this.bushMesh.instanceMatrix.needsUpdate = true;
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
    for (const b of this.bushes) { b.count = 0; b.regrowAt = 0; b.collectAcc.clear(); }
    this.tallies = null;
  }
}
