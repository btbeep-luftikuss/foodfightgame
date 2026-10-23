// Floating food pickups (spawners, drops, loot piles, grocery drops), banana-peel traps and
// stuck-in-the-wall decor.
//
// Online (0.44) the food on the floor is the same for everyone. The food spots refill from a seed
// (room, round, spot, refill number), so every game knows what lies there; the host decides when a
// spot refills and shares which spots hold food (spawnerCode). Any other food that lands on the floor
// is dropped by one game (share: the owner's, or the host's) and sent to the room with a key, and a
// pickup sends its key ('g'), so it goes for everyone.
//
// Performance: every pickup is drawn with InstancedMesh, one draw call per food part for the
// whole map, instead of one mesh per pickup.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, groundHeight, resolveHorizontal, rand, withSeed } from './core.js';
import { MAX_HP } from './actors.js';
import { FOODS, FOOD_IDS, makeFoodMesh, foodParts, randomFoodId, pickupAmmo } from './foods.js';

const CAP = 200;         // instances per food part
const RESPAWN = 14;      // seconds before a picked-up spawner refills
const INST_IDS = [...FOOD_IDS, 'peel']; // everything that can lie on the ground as loot
const DRAW_IDS = [...INST_IDS, 'heal'];
// Chef's Choice: food never heals there, so green heal crosses float on every third spawner instead.
const HEAL_HP = 60, HEAL_RESPAWN = 20;
const FALL_STEP = 1 / 60; // (0.44) tossed food flies in fixed steps: the same toss lands on the same spot in every game
const PAD_USES = 6, PAD_LIFE = 45, PAD_BOOST = 30; // Jelly jump pads (0.31): 6 bounces, about 22 m up
const r2 = (v) => Math.round(v * 100) / 100;
const rr = (x, a, b, w, h, r) => (x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class Items {
  constructor(game) {
    this.game = game;
    this.list = []; this.traps = []; this.decor = []; this.tramps = [];
    const scene = game.scene;

    this.setSpawners(game.world.spawnPoints);
    this.gone = new Set(); // (online) keys of food someone took before it showed up here
    this.took = new Set(); // ... and of food my Titans took (if the host still says it's there, it missed that)

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

  setSpawners(points) { this.spawners = points.map((p) => ({ pos: p.clone(), item: null, respawnAt: 0, gen: 0 })); }

  // Loose food, e.g. a banana that hit a wall or a splatted Titan's inventory (here only: see share).
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

  // (0.44) Food that lands on the floor for everyone (a splatted Titan's foods, a banana off a wall,
  // grocery drops, pot spits). Online only the game in charge drops it: the owner's (a Titan's own
  // game; the host's for its bots), or the host's when nobody owns it. It tells the room.
  share(owner, id, count, pos, vel = null) {
    const g = this.game;
    if (!g.online) return this.drop(id, count, pos, vel);
    if (!g.authFor(owner)) return null;
    const r = (v) => v && new THREE.Vector3(r2(v.x), r2(v.y), r2(v.z)); // (as the room gets them)
    const it = this.drop(id, count, r(pos), r(vel));
    if (!it) return null;
    it.key = g.net.newKey();
    this._announce(it);
    return it;
  }
  _announce(it) {
    const g = this.game, q = (v) => [r2(v.x), r2(v.y), r2(v.z)];
    g.net.event('it', g.round.id, it.key, it.id, it.count, ...q(it.pos), ...(it.vel ? q(it.vel) : []));
  }
  // Keys of the food lying around (not the food spots), and (from the host's list) drop what the host
  // doesn't have: it was taken while this game wasn't listening. Not food just dropped here (the host
  // may not have heard of it yet).
  floorKeys() { return this.list.filter((x) => x.key && !x.spawner).map((x) => x.key); }
  keepOnly(keys, mine = () => true) { // (mine: the keys this list covers)
    const now = this.game.time;
    this.list = this.list.filter((x) => !x.key || x.spawner || !mine(x.key) || keys.has(x.key) || now - x.born < 3);
  }
  // (host) Everything lying around (not the food spots: see spawnerCode), as the events that drop it.
  announceList() {
    const g = this.game, q = (v) => [r2(v.x), r2(v.y), r2(v.z)];
    return this.list.filter((x) => x.key && !x.spawner).map((it) => ['it', g.round.id, it.key, it.id, it.count, ...q(it.pos), ...(it.vel ? q(it.vel) : [])]);
  }
  // Someone else's game dropped it (from the room).
  remoteDrop(key, id, count, pos, vel) {
    if (this.took.has(key) && this.game.net) this.game.net.event('g', this.game.round.id, key, count, 1); // (I took it: the host never heard)
    if (this.gone.has(key) || this.list.some((x) => x.key === key)) return;
    const it = this.drop(id, count, pos, vel);
    if (it) it.key = key;
  }
  // Someone took n of it (from the room; emptied: none left). A food spot's key is "s<spot>.<refill mod 26>".
  remoteTake(key, n, emptied) {
    const m = /^s(\d+)\.(\d+)$/.exec(key);
    if (m) {
      const s = this.spawners[+m[1]];
      if (!s || s.gen % 26 !== +m[2] || !s.item) return; // (that one went already, or isn't here yet: applySpawners)
      if (s.item.id !== 'heal' && !emptied && n < s.item.count) { s.item.count -= n; return; }
      this._take(s);
      return;
    }
    const i = this.list.findIndex((x) => x.key === key);
    if (i < 0) { if (emptied) this.gone.add(key); return; } // (it hasn't shown up here yet)
    const it = this.list[i];
    it.count -= n;
    if (emptied || it.count <= 0 || it.id === 'heal') this.list.splice(i, 1);
  }
  // A food spot was emptied: it refills later with the next food of its seed. mine: my Titan took it.
  _take(s, mine = false) {
    this._clear(s);
    s.gen++;
    if (mine) { s.tookAt = this.game.time; s.resent = false; }
    s.respawnAt = this.game.time + (this.game.mode === 'chef' ? HEAL_RESPAWN : RESPAWN);
  }
  _clear(s) {
    if (s.item) { const k = this.list.indexOf(s.item); if (k >= 0) this.list.splice(k, 1); }
    s.item = null;
  }
  // What a food spot holds: online the same on every game (room, round, spot, refill number).
  _fill(i) {
    const g = this.game, s = this.spawners[i];
    if (g.mode === 'chef') { if (i % 3 === 0) s.item = this.drop('heal', 1, s.pos, null, s); } // Chef's Choice: heal crosses on every third
    else {
      const roll = () => { const id = randomFoodId(); return [id, pickupAmmo(id)]; };
      const [id, n] = g.online ? withSeed(`${g.net.roomName}|${g.round.id}|${i}|${s.gen % 26}`, roll) : roll();
      s.item = this.drop(id, n, s.pos, null, s);
    }
    if (s.item) s.item.key = `s${i}.${s.gen % 26}`;
  }

  fillSpawners(now) {
    if (this.game.online && !this.game.net?.isHost) return; // online the host's spots count (applySpawners)
    for (let i = 0; i < this.spawners.length; i++) {
      const s = this.spawners[i];
      if (!s.item && now >= s.respawnAt) this._fill(i);
    }
  }
  // The host's food spots, one letter each: the refill number (mod 26), lower case if food is there.
  spawnerCode() { return this.spawners.map((s) => String.fromCharCode((s.item ? 97 : 65) + (s.gen % 26))).join(''); }
  applySpawners(code) {
    if (typeof code !== 'string') return;
    const now = this.game.time;
    for (let i = 0, n = Math.min(code.length, this.spawners.length); i < n; i++) {
      const c = code.charCodeAt(i), filled = c >= 97 && c <= 122, hg = c - (filled ? 97 : 65);
      if (hg < 0 || hg > 25) continue;
      const s = this.spawners[i];
      const diff = (hg - (s.gen % 26) + 26) % 26;
      if (diff > 13 && now - (s.tookAt ?? -9) < 3) continue; // I just took it and the host hasn't heard yet
      if (diff > 13 && now - (s.tookAt ?? -9) < 6 && !s.resent && this.game.net) { // 3 s and it still hasn't: say it again, once
        this.game.net.event('g', this.game.round.id, `s${i}.${hg}`, 999, 1);
        s.resent = true; s.tookAt = now;
        continue;
      }
      s.resent = false;
      if (diff) { this._clear(s); s.gen += diff; } // (only ever forward: the same refill number, mod 26, as the host's)
      if (filled && !s.item) this._fill(i);
      else if (!filled && s.item) this._clear(s);
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
    const fx = this.game.utensils.trapFxOf(owner); // (0.44) the utensil's mark where it lands, on every game
    if (net && (owner === this.game.player || (owner.isBot && !owner.isRemote && net.isHost))) net.event('p', +pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), ...(owner.isBot || fx ? [owner.isBot ? owner.id : null] : []), ...(fx ? [fx] : []));
  }
  // Someone's Titan slipped on the peel here (from the room).
  remoteTrapGone(x, z) {
    let best = null, bd = 1.5;
    for (const t of this.traps) { const d = Math.hypot(t.pos.x - x, t.pos.z - z); if (d < bd) { bd = d; best = t; } }
    if (best) { this.game.fx.burst('banana', best.pos); this._removeTrap(best); }
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
      if (it.vel) { // tossed loot and grocery drops settle onto the ground (in fixed steps)
        it.acc = (it.acc || 0) + dt;
        while (it.vel && it.acc >= FALL_STEP) {
          it.acc -= FALL_STEP;
          it.vel.y -= G * FALL_STEP;
          it.pos.addScaledVector(it.vel, FALL_STEP);
          resolveHorizontal(it.pos, 0.4, 1);
          const gy = groundHeight(it.pos.x, it.pos.z, it.pos.y + 0.6);
          if (it.pos.y <= gy) { it.pos.y = gy; it.vel = null; }
        }
      }
      it.visible = it.pos.distanceToSquared(cam) < 110 * 110;
      if (it.vel || now - it.born < 0.4) continue;
      const net = game.online ? game.net : null;
      for (const a of game.actors) {
        if (!a.alive || a.isRemote) continue; // (online every game picks up for its own Titans and tells the room)
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z, dy = a.pos.y - it.pos.y;
        if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(dy) > 2.2) continue;
        if (it.id === 'heal') {
          if (a.hp >= (a.maxHp || MAX_HP)) continue;
          a.heal(HEAL_HP);
          game.sfx.play('eat', it.pos, a === game.player ? 1 : 0.4);
          game.fx.burst('bubbles', it.pos);
          game.floatText(a, `+${HEAL_HP} HP`, 'heal');
          if (a === game.player) game.hud.toast(`Healed +${HEAL_HP}`);
          if (net && it.key) net.event('g', game.round.id, it.key, 1, 1);
          if (it.spawner) this._take(it.spawner, true);
          else { this.list.splice(i, 1); if (it.key) { this.gone.add(it.key); this.took.add(it.key); } }
          break;
        }
        const got = a.give(it.id, it.count);
        if (!got) continue;
        it.count -= got;
        if (net && it.key) net.event('g', game.round.id, it.key, got, it.count <= 0 ? 1 : 0);
        game.sfx.play('pickup', it.pos, a === game.player ? 1 : 0.4);
        if (a === game.player) game.hud.toast(`+${got} ${FOODS[it.id].name}`);
        if (it.count <= 0) {
          if (it.spawner) this._take(it.spawner, true);
          else { this.list.splice(i, 1); if (it.key) { this.gone.add(it.key); this.took.add(it.key); } } // (a late copy of it from the room won't bring it back)
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
          if (game.online) game.net.event('pt', r2(t.pos.x), r2(t.pos.z)); // (0.44) used up for everyone
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
    for (const sp of this.spawners) { sp.item = null; sp.respawnAt = 0; sp.gen = 0; sp.tookAt = null; }
    this.gone.clear(); this.took.clear();
  }
}
