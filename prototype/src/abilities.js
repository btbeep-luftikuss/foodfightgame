// The ultimate alt abilities (0.31). Every food's alt (Q, F or right click) is a big power move:
//
//   Tomato       Dash: a tackle for half a dash's stamina. Slam into a Titan or a wall and a second
//                tomato bursts in a big, damaging splat.
//   Ice Cube     Ice Storm: a ball of 3 ice cubes. Where it lands a whirlwind pulls every enemy toward
//                its eye and slows them (and nibbles at them while they're inside).
//   Watermelon   Smash: in mid-air, slam down. The higher you fall from, the harder and wider the hit.
//   Soda Can     Mega Jump: from the ground, a geyser launches you sky-high and blasts everyone close.
//   Grapes       Juice Ball: a giant ball of juice; its puddle slows everyone who wades through it.
//   Pineapple    Spike Line: giant spikes burst up one after another; one that comes up under a
//                Titan throws them back.
//   Jelly Cube   Jump Pad: bounces higher than before, with a durability meter (see items.js).
//   Carrot       Teleport: 3 carrots and a long wind-up (a hit cancels it), then a slow, glowing
//                carrot you warp to wherever it lands.
//   Blueberries  Berry Spiral: 2 s of berries spiralling out in every direction.
//   Chili        Flamethrower: very close range; the flames stay burning on the ground for a while.
//
// Online: the Titan using an ability moves on its own game (dashes, smashes, jumps and teleports are
// just movement). The area effects (splats, shockwaves, whirlwinds, spikes, spirals, flames) run on
// every game from a short 'ab' event, and each game applies them only to its own Titans, like every
// other hit ("victim-side"). Thrown ability foods (the storm ball, the juice ball, the teleport
// carrot) are ordinary throws.
import * as THREE from 'three';
import { G, clamp, rand, forwardOf, groundHeight, hasLineOfSight, solidAt, resolveHorizontal, solveLob, FLOOR_BOUNDS } from './core.js';
import { lobDir } from './foods.js';

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const _ap = new THREE.Vector3(), _los = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const r2 = (v) => Math.round(v * 100) / 100;
const N = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const col = (hex) => new THREE.Color(hex);

// Ability colours (screen flashes, shockwaves, call-outs).
export const ULT_COLOR = {
  tomato: '#ff3b2a', ice: '#8fdcff', watermelon: '#ff5a6e', soda: '#ffb347', grapes: '#b05be0',
  pineapple: '#ffd23a', jelly: '#5fd35a', carrot: '#c77dff', blueberry: '#6f7bff', chili: '#ff7a1a',
};
const FIRE = [col('#ff3d00'), col('#ff8a00'), col('#ffd000'), col('#ffb000')];
const ICE = [col('#e8f8ff'), col('#aee4ff'), col('#ffffff')];
const TELE = [col('#c77dff'), col('#9d4edd'), col('#f3c4ff'), col('#ffffff')];
const BERRY = [col('#3b4ea8'), col('#6f7bff'), col('#c7cff5')];
const TOMATO = [col('#d8231b'), col('#ff4a2e'), col('#b3120f')];
const MELON = [col('#f25a6a'), col('#ff8a94'), col('#2f7a30')];

const TP_SPEED = 42, TP_GRAV = 0.75; // the teleport carrot: much slower than a carrot (up to 210 m/s), about 115 m at most
const SPIKE_EVERY = 1.5, SPIKE_COUNT = 15, SPIKE_GAP = 0.055, SPIKE_STAY = 3.2;
const FLAME_CAP = 330, SPIKE_CAP = 220;

function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(190,232,255,0.22)'; x.fillRect(0, 0, 256, 256); // a frosty body, so the funnel reads against a pale room
  for (let i = 0; i < 70; i++) { // slanted streaks of wind and snow
    const y = Math.random() * 256, w = 30 + Math.random() * 110, a = 0.4 + Math.random() * 0.55;
    const tint = Math.random() < 0.45 ? `rgba(120,200,255,${a})` : `rgba(240,252,255,${a})`;
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, tint); g.addColorStop(1, 'rgba(255,255,255,0)');
    for (const dx of [-256, 0, 256]) { // wrapped, so the seam doesn't show
      x.save(); x.translate(Math.random() * 256 + dx, y); x.rotate(-0.35); x.fillStyle = g; x.fillRect(0, -3, w, 5 + Math.random() * 9); x.restore();
    }
  }
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function spiralTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  for (let arm = 0; arm < 4; arm++) {
    x.beginPath();
    for (let k = 0; k <= 60; k++) { const t = k / 60, r = 8 + t * 118, a = arm * Math.PI / 2 + t * 4.2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.strokeStyle = 'rgba(225,246,255,0.9)'; x.lineWidth = 9; x.lineCap = 'round'; x.stroke();
  }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, 'rgba(200,240,255,0.5)'); g.addColorStop(1, 'rgba(200,240,255,0)');
  x.fillStyle = g; x.fillRect(-128, -128, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class Abilities {
  constructor(game) {
    this.game = game;
    this.vortices = []; this.flames = []; this.lines = []; this.spirals = []; this.flamers = [];
    this.waves = []; this.beams = []; this.trails = [];
    const scene = game.scene;
    // whirlwinds: shared geometry and textures, a material set per storm (they fade on their own)
    this.swirl = swirlTexture(); this.swirl.repeat.set(3, 2);
    this.spiralTex = spiralTexture();
    this.funnelGeo = new THREE.CylinderGeometry(7.5, 1.3, 14, 36, 8, true).translate(0, 7, 0);
    this.innerGeo = new THREE.CylinderGeometry(4.2, 0.7, 11.5, 28, 6, true).translate(0, 5.75, 0);
    this.baseGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    // ground flames: every flame of every fire patch is one instance (one draw call), plus a glow disc
    const flameGeo = new THREE.ConeGeometry(0.5, 1.8, 8, 1, true).translate(0, 0.9, 0);
    this.flameIM = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), FLAME_CAP);
    this.flameIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLAME_CAP * 3), 3);
    this.glowIM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff6a10', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 120);
    // spike lines: one instanced mesh for every spike
    this.spikeIM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 3.4, 7).translate(0, 1.7, 0),
      new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.45, emissive: '#5a3a00', emissiveIntensity: 0.35 }), SPIKE_CAP);
    for (const im of [this.flameIM, this.glowIM, this.spikeIM]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      scene.add(im);
    }
    this.glowIM.renderOrder = 3;
    // shockwave rings and teleport beams, pooled
    this.waveGeo = new THREE.RingGeometry(0.8, 1, 64).rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.9, 0.9, 1, 20, 1, true).translate(0, 0.5, 0);
    this.wavePool = []; this.beamPool = [];
  }

  // ------------------------------------------------------------------ small helpers
  isLocal(a) { return !!a && !a.isRemote && (a === this.game.player || a.isBot); }
  // An ability on my own Titan (or, hosting, one of my bots) tells the room.
  send(a, kind, data = []) {
    const net = this.game.net;
    if (!net || !a) return;
    if (a === this.game.player) net.event('ab', kind, data);
    else if (a.isBot && !a.isRemote && net.isHost) net.event('ab', kind, data, a.id);
  }
  _no(a, msg) { if (a === this.game.player) this.game.hud.toast(msg); return false; }
  _foe(owner, b) { return !!b && b !== owner && b.alive && !this.game.teammates(owner, b); }
  // How much of a food a Titan has (Chef's Choice slots never run out).
  has(a, id, n) { return a.inv.some((s) => s && s.id === id && (s.inf || s.count >= n)); }
  // Use n of a food, from the slot in hand if it is that food, else from any slot holding it.
  take(a, id, n) {
    const ok = (s) => s && s.id === id && (s.inf || s.count >= n);
    const i = ok(a.inv[a.sel]) ? a.sel : a.inv.findIndex(ok);
    if (i < 0) return false;
    const s = a.inv[i];
    if (s.inf) return true;
    if (s.count < n) return false;
    s.count -= n;
    if (s.count <= 0) a.inv[i] = null;
    a._refreshHeld();
    return true;
  }
  // A slow that refreshes instead of stacking up (whirlwinds, spikes).
  slow(a, key, amt, dur) {
    if (a.isRemote || a.isWet()) return;
    const e = a.sticky.find((s) => s.key === key);
    if (e) e.until = this.game.time + dur; else a.sticky.push({ amt, until: this.game.time + dur, key });
  }
  // Feel it: for the player who used the ability (camera kick, shake, hit-stop, a coloured flash).
  punch(a, { fov = 0, shake = 0, stop = 0, flash = null, call = null } = {}) {
    const g = this.game;
    if (a !== g.player) return;
    if (fov) g.fovKick = clamp((g.fovKick || 0) + fov, -14, 22);
    if (shake) g.fx.shake(shake);
    if (stop) g.hitStopUntil = Math.max(g.hitStopUntil, performance.now() + stop);
    if (flash) g.hud.ultFlash?.(flash);
    if (call) g.hud.ultCall?.(call, flash);
  }
  // Everyone near a big hit feels it a little.
  _rumble(pos, amt, range = 40) {
    const d = this.game.camera.position.distanceTo(pos);
    if (d < range) this.game.fx.shake(amt * (1 - d / range));
  }
  // Area damage around a point, with knockback away from it (and along `dir` for a tackle).
  area(owner, at, r, dmg, foodId, { up = 6, push = 10, minK = 0.4, dy = 3, dir = null, onHit = null } = {}) {
    const g = this.game, point = _ap.copy(at);
    let hits = 0;
    for (const b of g.actors) {
      if (!this._foe(owner, b)) continue;
      const dx = b.pos.x - point.x, dz = b.pos.z - point.z, d = Math.hypot(dx, dz);
      if (d > r + 0.45 || Math.abs(b.pos.y + 0.9 - point.y) > dy + r * 0.25) continue;
      if (!hasLineOfSight(_los.set(point.x, point.y + 0.6, point.z), b.center(_c))) continue;
      const k = 1 - (1 - minK) * clamp(d / r, 0, 1);
      if (b.shieldUp && g._inFront(b, point)) g.damageShield(b, dmg * k, owner);
      else g.damage(b, dmg * k, owner, foodId);
      hits++;
      if (!b.alive) continue;
      let nx = d > 0.05 ? dx / d : rand(-1, 1), nz = d > 0.05 ? dz / d : rand(-1, 1);
      if (dir) { nx += dir.x * 1.2; nz += dir.z * 1.2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
      b.knock(_v.set(nx * push * k, up * (0.55 + 0.45 * k), nz * push * k));
      onHit?.(b, k);
    }
    return hits;
  }
  // Where a lobbed ability food should go: the player's aim, or a bot's target.
  lobVel(a, from, speed, gravity = 1) {
    const t = a.isBot ? a.botTarget : null;
    if (t && t.alive) return solveLob(from, _c.copy(t.pos).setY(t.pos.y + 0.6), speed, G * gravity, new THREE.Vector3()).multiplyScalar(speed);
    return lobDir(a, new THREE.Vector3()).multiplyScalar(speed);
  }

  // ------------------------------------------------------------------ 1. Tomato: Dash
  tomatoDash(a) {
    const g = this.game, now = g.time;
    if (a.inTurret) return this._no(a, 'Not from the turret');
    if (!a.spendStamina(15)) return this._no(a, 'Too tired to dash'); // half a normal dash (30)
    const dir = forwardOf(a.yaw, new THREE.Vector3());
    a.consume(1);
    a.tdash = { until: now + 0.42, dir, hit: false };
    a.vel.x = dir.x * 34; a.vel.z = dir.z * 34;
    if (!a.onGround) a.vel.y = Math.max(a.vel.y, 2.5);
    a.knockUntil = now + 0.42; a.dashT = 0.42; a.lastDodgeAt = now; a.noiseAt = now;
    for (const e of a.sticky) e.until -= 1;
    g.sfx.play('whoosh', a.pos, 1.2);
    g.fx.burst('tomato', a.center(_c), 0.6);
    this.punch(a, { fov: 12, shake: 0.06, flash: ULT_COLOR.tomato, call: 'TOMATO DASH' });
    this.send(a, 'td');
    return true;
  }
  // The dash hit a Titan (target) or a wall (n: the wall's normal).
  tomatoImpact(a, target, n = null) {
    const g = this.game, T = a.tdash;
    if (!T || T.hit) return;
    T.hit = true; a.tdash = null; a.dashT = 0;
    const point = target ? target.center(new THREE.Vector3()).lerp(a.center(_c), 0.3) : a.center(new THREE.Vector3()).addScaledVector(T.dir, 0.7);
    const bx = n ? n.x : -T.dir.x, bz = n ? n.z : -T.dir.z; // bounce back off it
    a.vel.set(bx * 7, 7, bz * 7); a.onGround = false; a.knockUntil = g.time + 0.35;
    if (!this.take(a, 'tomato', 1)) { // no second tomato: just a bump
      if (target) {
        g.damage(target, 8, a, 'tomato'); target.knock(_v.set(T.dir.x * 8, 4, T.dir.z * 8));
        if (target.isRemote && g.net) this.send(a, 'tb', [g.net._peerOf(target), r2(T.dir.x), r2(T.dir.z)]); // (0.44) their game decides
      }
      g.sfx.play('thud', point, 1.2);
      this._no(a, 'Out of tomatoes: no splat');
      return;
    }
    this.tomatoSplat(a, point, T.dir);
    this.send(a, 'ts', [r2(point.x), r2(point.y), r2(point.z), r2(T.dir.x), r2(T.dir.z)]);
  }
  tomatoSplat(owner, point, dir) {
    const g = this.game;
    const hits = this.area(owner, point, 5.5, 48, 'tslam', { up: 8, push: 14, minK: 0.45, dir, onHit: (b) => { b.addSticky(0.25, 3); b.juice(5); } });
    const gy = groundHeight(point.x, point.z, point.y + 0.5);
    g.world.paintSplat(point.x, gy, point.z, 7.5, 'tomato');
    if (point.y - gy > 1.2) g.world.paintSplat(point.x, point.y, point.z, 4, 'tomato'); // up the wall too
    g.surface.stamp(point.x, gy, point.z, 5, 'slick', 6, g.time);
    g.fx.burst('tomato', point, 3.2);
    g.fx.burst('tomato', _o.copy(point).addScaledVector(dir, 1.5), 1.8);
    g.fx.spray('puffs', point, 10, { speed: 6, up: 2, colors: [TOMATO[1]], size: 1.1, life: 0.5, grav: 0, grow: 2 });
    this.wave(_o.set(point.x, gy, point.z), 7, ULT_COLOR.tomato);
    g.sfx.play('splat', point, 1.8); g.sfx.play('boom', point, 0.7);
    this._rumble(point, 0.35);
    this.punch(owner, { fov: 6, shake: 0.25, stop: hits ? 90 : 40, call: hits ? 'SPLAT!' : null, flash: hits ? ULT_COLOR.tomato : null });
  }

  // ------------------------------------------------------------------ 2. Ice Cube: Ice Storm
  iceStorm(a) {
    const g = this.game;
    if (!this.has(a, 'ice', 3)) return this._no(a, 'Ice Storm needs 3 ice cubes');
    this.take(a, 'ice', 3);
    const from = a.handPos();
    g.projectiles.launch({ food: 'icestorm', owner: a, pos: from, vel: this.lobVel(a, from, 27), radius: 0.75, spin: 5, life: 6, u: '' });
    g.sfx.play('throw', a.pos, 1.3); g.sfx.play('freeze', a.pos, 0.7);
    this.punch(a, { fov: 5, shake: 0.05, flash: ULT_COLOR.ice, call: 'ICE STORM' });
    return true;
  }
  addVortex(pos, owner) {
    const g = this.game;
    const group = new THREE.Group();
    group.position.copy(pos);
    const mat = (opacity, color) => new THREE.MeshBasicMaterial({ map: this.swirl, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const outer = new THREE.Mesh(this.funnelGeo, mat(0.8, '#e6f7ff'));
    const inner = new THREE.Mesh(this.innerGeo, mat(0.9, '#9fdcff'));
    const base = new THREE.Mesh(this.baseGeo, new THREE.MeshBasicMaterial({ map: this.spiralTex, color: '#cfefff', transparent: true, opacity: 0.55, depthWrite: false }));
    base.position.y = 0.12; base.renderOrder = 3;
    outer.renderOrder = inner.renderOrder = 6;
    group.add(outer, inner, base);
    group.scale.setScalar(0.01);
    g.scene.add(group);
    this.vortices.push({ pos: pos.clone(), owner, born: g.time, until: g.time + 3.8, r: 10, group, outer, inner, base, acc: new Map(), sndAt: 0 });
    g.sfx.play('storm', pos, 1.3);
    g.fx.burst('ice', _o.copy(pos).setY(pos.y + 1), 2);
    this.wave(pos, 10, ULT_COLOR.ice);
    this._rumble(pos, 0.2);
  }
  _vortexStep(v, dt) {
    const g = this.game, now = g.time;
    const age = now - v.born, left = v.until - now;
    if (left <= 0) { this._dropVortex(v); return false; }
    const k = Math.min(1, age / 0.3) * Math.min(1, left / 0.5);
    v.group.scale.set(k * (1 + 0.04 * Math.sin(now * 9)), k, k * (1 + 0.04 * Math.cos(now * 9)));
    v.outer.rotation.y += dt * 4.5; v.inner.rotation.y -= dt * 7; v.base.rotation.y += dt * 3;
    v.base.scale.setScalar(v.r);
    v.outer.material.map.offset.x = (v.outer.material.map.offset.x + dt * 0.6) % 1;
    if (now > v.sndAt) { v.sndAt = now + 0.9; g.sfx.play('storm', v.pos, 0.8); }
    // swirling ice and snow
    for (let i = 0; i < g.fx.n(8); i++) {
      const a = rand(0, Math.PI * 2), r = rand(1, v.r * 0.85), h = rand(0.3, 11);
      const tx = -Math.sin(a), tz = Math.cos(a), sp = rand(8, 14);
      (Math.random() < 0.5 ? g.fx.chunks : g.fx.blobs).spawn(v.pos.x + Math.cos(a) * r, v.pos.y + h, v.pos.z + Math.sin(a) * r,
        tx * sp - Math.cos(a) * 3, rand(1, 4), tz * sp - Math.sin(a) * 3, rand(0.35, 0.6), rand(0.08, 0.2), ICE[(Math.random() * 3) | 0], 0, 0.3);
    }
    // pull every enemy toward the eye of the storm (my Titans only; the others' games pull theirs)
    for (const b of g.actors) {
      if (!b.alive || b.isRemote || !this._foe(v.owner, b)) continue;
      const dx = v.pos.x - b.pos.x, dz = v.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > v.r || b.pos.y - v.pos.y > 10 || b.pos.y < v.pos.y - 3) continue;
      const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : 0;
      const pull = (d < 1.2 ? d / 1.2 : 1) * (4 + 6 * (d / v.r)) * k; // stronger at the rim, easing off in the eye
      b.extVel.x += nx * pull - nz * 4.5 * k; // ... and spun around it
      b.extVel.z += nz * pull + nx * 4.5 * k;
      this.slow(b, v, 0.35, 0.3);
      const acc = (v.acc.get(b) || 0) + 7 * dt;
      if (acc >= 3.5) { g.damage(b, acc, v.owner, 'storm'); v.acc.set(b, 0); } else v.acc.set(b, acc);
      if (b === g.player && Math.random() < dt * 4) g.fx.shake(0.05);
    }
    return true;
  }
  _dropVortex(v) {
    this.game.scene.remove(v.group);
    for (const m of [v.outer, v.inner, v.base]) m.material.dispose();
  }

  // ------------------------------------------------------------------ 3. Watermelon: Smash
  melonSmash(a) {
    const g = this.game;
    if (a.inTurret) return this._no(a, 'Not from the turret');
    if (a.onGround) return this._no(a, 'Jump first, then smash down');
    a.consume(1);
    a.smash = { fromY: Math.max(a.pos.y, a.fallTop || a.pos.y), t0: g.time };
    a.vel.x *= 0.25; a.vel.z *= 0.25; a.vel.y = Math.min(a.vel.y, -38);
    a.gliding = false; a.knockUntil = g.time + 0.5;
    g.sfx.play('whoosh', a.pos, 1.3);
    this.punch(a, { fov: -8, flash: ULT_COLOR.watermelon, call: 'MELON SMASH' });
    this.send(a, 'wd');
    return true;
  }
  // Called when a smashing Titan lands (Actor._land), on its own game.
  smashLand(a, gy) {
    const S = a.smash;
    a.smash = null;
    const h = clamp(S.fromY - gy, 0, 60);
    const pos = new THREE.Vector3(a.pos.x, gy, a.pos.z);
    a.vel.set(0, 6, 0); a.knockUntil = this.game.time + 0.2;
    this.smashFx(a, pos, h);
    this.send(a, 'ws', [r2(pos.x), r2(pos.y), r2(pos.z), r2(h)]);
  }
  smashFx(owner, pos, h) {
    const g = this.game;
    const r = clamp(4 + h * 0.24, 4, 16), dmg = clamp(26 + h * 1.5, 26, 100);
    const hits = this.area(owner, _o.copy(pos).setY(pos.y + 0.5), r, dmg, 'smash', { up: 8 + h * 0.15, push: 10 + h * 0.2, minK: 0.4, dy: 2.5 });
    this.wave(pos, r, ULT_COLOR.watermelon, 0.5);
    this.wave(pos, r * 0.6, '#2f7a30', 0.35);
    const top = _c.copy(pos).setY(pos.y + 0.6);
    g.fx.burst('melon', top, 1.6 + h / 30);
    g.fx.burst('dust', pos, 2 + h / 15);
    g.fx.burst('jump', pos, 1);
    g.world.paintSplat(pos.x, pos.y, pos.z, r * 0.7, 'melon');
    g.surface.stamp(pos.x, pos.y, pos.z, r * 0.45, 'slick', 5, g.time);
    for (let i = 0; i < 6; i++) { // chunks fly everywhere (each game throws its own)
      const ang = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
      g.projectiles.launch({ food: 'melonchunk', owner, local: true, u: '', pos: top.clone(), vel: new THREE.Vector3(Math.cos(ang) * 10, 9, Math.sin(ang) * 10), gravity: 1, radius: 0.35, life: 3, spin: 9, bounces: 1 });
    }
    g.sfx.play('boom', pos, 1.3); g.sfx.play('thud', pos, 1.6); g.sfx.play('splat', pos, 1.2);
    this._rumble(pos, 0.25 + h / 80, 50);
    this.punch(owner, { fov: 8, shake: 0.3 + h / 100, stop: hits ? 110 : 50, call: `SMASH! ${Math.round(h)} m`, flash: ULT_COLOR.watermelon });
  }

  // ------------------------------------------------------------------ 4. Soda Can: Mega Jump
  megaJump(a) {
    const g = this.game;
    if (a.inTurret) return this._no(a, 'Not from the turret');
    if (!a.onGround) return this._no(a, 'Mega Jump needs solid ground under you');
    a.consume(1);
    const pos = a.pos.clone();
    a.vel.y = 31; a.vel.x *= 1.2; a.vel.z *= 1.2;
    a.onGround = false; a.gliding = false; a.knockUntil = g.time + 0.3; a.noiseAt = g.time;
    this.megaJumpFx(a, pos);
    this.send(a, 'sj', [r2(pos.x), r2(pos.y), r2(pos.z)]);
    return true;
  }
  megaJumpFx(owner, pos) {
    const g = this.game;
    const hits = this.area(owner, _o.copy(pos).setY(pos.y + 0.6), 6.5, 34, 'megajump', { up: 15, push: 9, minK: 0.5, dy: 2.5 });
    g.fx.burst('geyser', pos); g.fx.burst('geyser', pos); g.fx.burst('soda', pos, 1.5);
    this.wave(pos, 7, '#f6e7d0');
    g.surface.stamp(pos.x, pos.y, pos.z, 4.5, 'sticky', 6, g.time, { slow: 0.3, visual: 'soda' });
    g.world.paintSplat(pos.x, pos.y, pos.z, 5, 'soda');
    g.sfx.play('fizz', pos, 1.6); g.sfx.play('boom', pos, 1.0); g.sfx.play('boing', pos, 0.6);
    this._rumble(pos, 0.25);
    this.punch(owner, { fov: 14, shake: 0.3, stop: hits ? 70 : 0, flash: ULT_COLOR.soda, call: 'MEGA JUMP' });
  }

  // ------------------------------------------------------------------ 5. Grapes: Juice Ball
  juiceBall(a) {
    const g = this.game;
    a.consume(1);
    const from = a.handPos();
    g.projectiles.launch({ food: 'juiceball', owner: a, pos: from, vel: this.lobVel(a, from, 25), radius: 0.8, spin: 3, life: 6, u: '' });
    g.sfx.play('throw', a.pos, 1.3); g.sfx.play('slosh', a.pos, 0.8);
    this.punch(a, { fov: 4, shake: 0.04, flash: ULT_COLOR.grapes, call: 'JUICE BALL' });
    return true;
  }
  juicePuddle(hit, owner) {
    const g = this.game, pt = hit.point;
    const gy = groundHeight(pt.x, pt.z, pt.y + 1);
    g.surface.stamp(pt.x, gy, pt.z, 6.5, 'sticky', 8, g.time, { slow: 0.45, visual: 'juice' });
    g.world.paintSplat(pt.x, gy, pt.z, 7.5, 'grape');
    if (pt.y - gy > 1.2) g.world.paintSplat(pt.x, pt.y, pt.z, 4, 'grape');
    g.fx.burst('juice', pt, 2.6);
    this.wave(_o.set(pt.x, gy, pt.z), 7, ULT_COLOR.grapes);
    g.sfx.play('splat', pt, 1.6); g.sfx.play('slosh', pt, 1.2);
    this._rumble(pt, 0.2);
    // everyone caught in the splash is slowed at once
    for (const b of g.actors) {
      if (!b.alive || b === owner || Math.hypot(b.pos.x - pt.x, b.pos.z - pt.z) > 6.5 || Math.abs(b.pos.y - gy) > 2.5) continue;
      if (this._foe(owner, b)) g.damage(b, 8, owner, 'juice');
      b.addSticky(0.3, 2.5);
    }
  }

  // ------------------------------------------------------------------ 6. Pineapple: Spike Line
  spikeLine(a) {
    const g = this.game;
    a.consume(1);
    const dir = forwardOf(a.yaw, new THREE.Vector3());
    const start = a.pos.clone();
    this.addSpikeLine(a, start, dir);
    this.send(a, 'pl', [r2(start.x), r2(start.y), r2(start.z), r2(dir.x), r2(dir.z)]);
    this.punch(a, { fov: 6, shake: 0.12, flash: ULT_COLOR.pineapple, call: 'SPIKE LINE' });
    return true;
  }
  addSpikeLine(owner, start, dir) {
    const g = this.game, B = FLOOR_BOUNDS, pts = [];
    let y = start.y;
    for (let i = 1; i <= SPIKE_COUNT; i++) { // along the ground; stops at a wall or a big drop
      const d = 0.6 + i * SPIKE_EVERY, x = start.x + dir.x * d, z = start.z + dir.z * d;
      if (x < B.minX + 1 || x > B.maxX - 1 || z < B.minZ + 1 || z > B.maxZ - 1) break;
      const gy = groundHeight(x, z, y + 1.2);
      if (y - gy > 6 || solidAt(_c.set(x, gy + 1.4, z))) break;
      pts.push({ p: new THREE.Vector3(x, gy, z), up: false, s: rand(0.85, 1.25), tilt: rand(-0.2, 0.2), spin: rand(0, 6) });
      y = gy;
    }
    if (!pts.length) { g.sfx.play('thud', start, 0.6); return; }
    this.lines.push({ owner, pts, born: g.time, dir: dir.clone(), hit: new Set(), acc: new Map(), until: g.time + pts.length * SPIKE_GAP + SPIKE_STAY });
    g.sfx.play('boom', start, 0.6);
  }
  _lineStep(L, dt) {
    const g = this.game, now = g.time;
    if (now > L.until) return false;
    L.pts.forEach((sp, i) => {
      const t0 = L.born + i * SPIKE_GAP;
      if (now < t0 || sp.up) return;
      sp.up = true;
      g.fx.burst('dust', sp.p, 0.8);
      g.fx.spray('chunks', _c.copy(sp.p).setY(sp.p.y + 0.4), 6, { speed: 6, up: 6, colors: [col('#f2c230'), col('#d99a1e'), col('#4f9a3a')], size: 0.18, life: 0.6 });
      if (i % 2 === 0) g.sfx.play('spike', sp.p, 0.9);
      // whoever it comes up under flies back
      for (const b of g.actors) {
        if (!this._foe(L.owner, b) || L.hit.has(b)) continue;
        const dx = b.pos.x - sp.p.x, dz = b.pos.z - sp.p.z;
        if (dx * dx + dz * dz > 1.8 * 1.8 || Math.abs(b.pos.y - sp.p.y) > 2.5) continue;
        L.hit.add(b);
        g.damage(b, 24, L.owner, 'spikes');
        if (!b.alive) continue;
        const side = Math.sign(L.dir.x * dz - L.dir.z * dx) || 1; // thrown to the side the Titan is on
        b.knock(_v.set(-L.dir.z * side * 9 + L.dir.x * 5, 12, L.dir.x * side * 9 + L.dir.z * 5));
        g.floatText(b, 'SKEWERED!', 'crit');
        this._rumble(sp.p, 0.15);
      }
    });
    // spikes that are up hurt (and slow) whoever touches them
    for (const b of g.actors) {
      if (!b.alive || b.isRemote || !this._foe(L.owner, b)) continue;
      for (const sp of L.pts) {
        if (!sp.up || Math.abs(b.pos.y - sp.p.y) > 2.2 || Math.hypot(b.pos.x - sp.p.x, b.pos.z - sp.p.z) > 1.15) continue;
        const acc = (L.acc.get(b) || 0) + 10 * dt;
        if (acc >= 4) { g.damage(b, acc, L.owner, 'spikes'); L.acc.set(b, 0); } else L.acc.set(b, acc);
        this.slow(b, L, 0.25, 0.3);
        break;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ 7. Jelly Cube: Jump Pad
  jumpPad(a) {
    const g = this.game;
    const f = forwardOf(a.yaw, _v);
    const pos = a.pos.clone().addScaledVector(f, 3.4); // just clear of your feet: step on when you're ready
    pos.y = groundHeight(pos.x, pos.z, a.pos.y + 0.6);
    g.items.addTrampoline(a, pos);
    a.consume(1);
    g.sfx.play('boing', pos, 1);
    g.fx.burst('jelly', pos);
    this.wave(pos, 3, ULT_COLOR.jelly, 0.3);
    this.punch(a, { fov: 3, flash: ULT_COLOR.jelly, call: 'JUMP PAD' });
    return true;
  }

  // ------------------------------------------------------------------ 8. Carrot: Teleport
  teleportStart(a) {
    const g = this.game;
    if (a.inTurret) return this._no(a, 'Not from the turret');
    if (a.channel) return false;
    const s = a.selected();
    if (!s || s.id !== 'carrot' || (!s.inf && s.count < 3)) return this._no(a, 'Teleport needs 3 carrots');
    a.channel = { kind: 'tp', t: 0, need: 1.4, slot: a.sel, tick: 0 };
    a.charging = false;
    g.sfx.play('tpcharge', a.pos, 1);
    this.punch(a, { flash: ULT_COLOR.carrot, call: 'TELEPORT CHARGING' });
    this.send(a, 'tc');
    return true;
  }
  _channelStep(a, dt) {
    const g = this.game, C = a.channel;
    const s = a.selected();
    if (!a.alive || !a.canControl() || a.sel !== C.slot || s?.id !== 'carrot') { this.cancelChannel(a, false); return; }
    C.t += dt;
    // purple sparks spiral in, faster as it charges
    const k = C.t / C.need;
    for (let i = 0; i < g.fx.n(3); i++) {
      const ang = rand(0, Math.PI * 2), r = rand(0.9, 1.6) * (1.2 - k * 0.5);
      g.fx.blobs.spawn(a.pos.x + Math.cos(ang) * r, a.pos.y + rand(0.2, 2), a.pos.z + Math.sin(ang) * r,
        -Math.sin(ang) * 4 - Math.cos(ang) * 2, rand(0.5, 2.5), Math.cos(ang) * 4 - Math.sin(ang) * 2, 0.4, 0.09, TELE[(Math.random() * 4) | 0], -0.2, 0.5);
    }
    if (C.t >= C.tick) { C.tick += 0.35; g.sfx.play('charge', a.pos, 0.5 + k * 0.6); }
    if (C.t >= C.need) this._teleportThrow(a);
  }
  // A hit (or losing control) stops the wind-up; the carrots stay in your hand.
  cancelChannel(a, hit) {
    const g = this.game;
    if (!a.channel) return;
    a.channel = null;
    a.altReadyAt.carrot = g.time + 2;
    g.fx.spray('puffs', a.center(_c), 8, { speed: 3, up: 1, colors: [TELE[0]], size: 0.6, life: 0.4, grav: 0, grow: 1.2 });
    g.sfx.play('fizz', a.pos, 0.4);
    if (a === g.player) g.hud.toast(hit ? 'Teleport interrupted: you got hit' : 'Teleport cancelled');
    this.send(a, 'tx');
  }
  _teleportThrow(a) {
    const g = this.game;
    a.channel = null;
    if (!this.take(a, 'carrot', 3)) { this.cancelChannel(a, false); return; }
    const from = a.handPos();
    let vel;
    if (a.isBot && a.tpAim) vel = solveLob(from, a.tpAim, TP_SPEED, G * TP_GRAV, new THREE.Vector3()).multiplyScalar(TP_SPEED);
    else vel = (a.isBot ? a.aimDir.clone() : _d.subVectors(a.aimPoint, from).normalize().clone()).multiplyScalar(TP_SPEED);
    a.tpAim = null;
    g.projectiles.launch({ food: 'tpcarrot', owner: a, pos: from, vel, gravity: TP_GRAV, radius: 0.24, orient: true, life: 5, spin: 0, u: '' });
    a.altReadyAt.carrot = g.time + 6;
    g.sfx.play('whoosh', a.pos, 1); g.sfx.play('throw', a.pos, 1.2);
    this.punch(a, { fov: 6, flash: ULT_COLOR.carrot });
    this.send(a, 'tx');
  }
  // The teleport carrot landed (or ran out of time): its thrower appears there.
  teleportTo(p, hit) {
    const g = this.game, a = p.owner, B = FLOOR_BOUNDS;
    const back = _d.set(-p.vel.x, 0, -p.vel.z);
    if (back.lengthSq() < 1e-4) back.set(0, 0, 1); else back.normalize();
    let pt = hit ? hit.point.clone() : p.pos.clone();
    if (hit?.actor) pt = hit.actor.pos.clone().addScaledVector(back, 1.5);
    else if (hit && !hit.top) pt.addScaledVector(back, 0.9); // off the wall, not into it
    pt.x = clamp(pt.x, B.minX + 1, B.maxX - 1); pt.z = clamp(pt.z, B.minZ + 1, B.maxZ - 1);
    pt.y = groundHeight(pt.x, pt.z, pt.y + 0.8);
    const inside = solidAt(_c.set(pt.x, pt.y + 1, pt.z));
    if (inside) pt.y = inside.groundY;
    const myEyes = a === g.player && g.firstPerson && a.alive; // (don't fill my own view with the pillar of light)
    if (!myEyes) { this.beam(pt, ULT_COLOR.carrot); g.fx.burst('tele', _c.copy(pt).setY(pt.y + 1), 1.5); }
    g.sfx.play('teleport', pt, 1.2);
    if (!this.isLocal(a) || !a.alive) return;
    this.beam(a.pos, ULT_COLOR.carrot);
    g.fx.burst('tele', a.center(_c), 1.2);
    a.pos.copy(pt); a.vel.set(0, 0, 0);
    resolveHorizontal(a.pos, 0.45, 1.95);
    a.fallTop = a.pos.y; a.onGround = false; a.gliding = false; a.tdash = null; a.smash = null; a.noiseAt = g.time;
    if (a === g.player) g.camPivotY = a.pos.y;
    this.punch(a, { fov: 16, shake: 0.12, flash: ULT_COLOR.carrot, call: 'WARP!' });
  }

  // ------------------------------------------------------------------ 9. Blueberries: Berry Spiral
  berrySpiral(a) {
    if (!this.has(a, 'blueberry', 30) || (a.selected()?.id !== 'blueberry')) return this._no(a, 'Berry Spiral needs 30 blueberries');
    this.take(a, 'blueberry', 30);
    this.startSpiral(a);
    this.send(a, 'bs');
    this.punch(a, { fov: 5, shake: 0.08, flash: ULT_COLOR.blueberry, call: 'BERRY SPIRAL' });
    return true;
  }
  startSpiral(owner) {
    this.spirals.push({ owner, t: 0, dur: 2, ang: rand(0, Math.PI * 2), acc: 0, snd: 0 });
    this.game.sfx.play('whoosh', owner.pos, 0.8);
  }
  _spiralStep(S, dt) {
    const g = this.game, a = S.owner;
    S.t += dt;
    if (S.t > S.dur || !a.alive) return false;
    S.ang += dt * Math.PI * 2 * 2.2;
    S.acc += dt;
    const from = a.center(new THREE.Vector3()).setY(a.pos.y + 1.15);
    while (S.acc >= 0.05) { // 20 volleys a second, 3 arms each
      S.acc -= 0.05;
      for (let k = 0; k < 3; k++) {
        const ang = S.ang + (k * Math.PI * 2) / 3;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        g.projectiles.launch({ food: 'berry', owner: a, local: true, u: '', pos: _c.set(from.x + dx * 0.6, from.y, from.z + dz * 0.6), vel: _v.set(dx * 52, 1.2, dz * 52), gravity: 0.25, radius: 0.14, life: 1.1, spin: 12 });
      }
    }
    if (S.t > S.snd) { S.snd = S.t + 0.09; g.sfx.play('berry', a.pos, 0.9); }
    for (let i = 0; i < g.fx.n(3); i++) { // a ring of blue sparks around the thrower
      const ang = S.ang + rand(-0.3, 0.3) + (i * Math.PI * 2) / 3;
      g.fx.blobs.spawn(from.x + Math.cos(ang) * 1.1, from.y + rand(-0.2, 0.2), from.z + Math.sin(ang) * 1.1, Math.cos(ang) * 6, rand(0, 1), Math.sin(ang) * 6, 0.3, 0.08, BERRY[(Math.random() * 3) | 0], 0, 1);
    }
    if (a === g.player) g.fx.shake(0.015);
    return true;
  }

  // ------------------------------------------------------------------ 10. Chili: Flamethrower
  flamethrower(a) {
    a.consume(1);
    this.startFlamer(a);
    this.send(a, 'cf');
    this.punch(a, { fov: 6, shake: 0.06, flash: ULT_COLOR.chili, call: 'FLAMETHROWER' });
    return true;
  }
  startFlamer(owner) {
    this.flamers.push({ owner, t: 0, dur: 1.8, tick: 0, patch: 0, snd: 0 });
  }
  _flameDir(a, out) {
    if (a.isRemote) { // their aim, from their yaw and pitch
      const p = clamp(a.lookPitch || 0, -0.6, 0.5);
      return out.set(-Math.sin(a.yaw) * Math.cos(p), Math.sin(p), -Math.cos(a.yaw) * Math.cos(p));
    }
    out.copy(a.aimDir);
    out.y = clamp(out.y, -0.6, 0.45);
    return out.normalize();
  }
  _flamerStep(F, dt) {
    const g = this.game, a = F.owner;
    F.t += dt;
    if (F.t > F.dur || !a.alive) return false;
    const from = a.handPos(new THREE.Vector3());
    const dir = this._flameDir(a, new THREE.Vector3());
    g.fx.stream('blobs', from, dir, 9, { speed: 13, spread: 0.22, life: 0.45, size: 0.2, colors: FIRE, grav: -0.35, drag: 1.2 });
    g.fx.stream('puffs', from, dir, 3, { speed: 10, spread: 0.18, life: 0.5, size: 0.55, colors: [FIRE[1], FIRE[2]], grav: -0.5, drag: 1.5, grow: 1.4 });
    if (Math.random() < 0.4) g.fx.stream('puffs', _c.copy(from).addScaledVector(dir, 6), dir, 1, { speed: 2, spread: 0.5, life: 0.9, size: 0.9, colors: [col('#4a3a32')], grav: -0.6, drag: 1, grow: 1.5 });
    if (F.t > F.snd) { F.snd = F.t + 0.28; g.sfx.play('flame', from, 1); }
    if (a === g.player) g.fx.shake(0.012);
    // the cone: 7.5 m, about 32 degrees either side
    F.tick -= dt;
    if (F.tick <= 0) {
      F.tick = 0.1;
      for (const b of g.actors) {
        if (!this._foe(a, b)) continue;
        _d.subVectors(b.center(_c), from);
        const dist = _d.length();
        if (dist > 7.5 || _d.dot(dir) / (dist || 1) < 0.85 || !hasLineOfSight(from, _c)) continue;
        g.damage(b, 4.5, a, 'flames');
        b.burn(2.5);
      }
    }
    // flames left burning on the ground along the cone
    F.patch -= dt;
    if (F.patch <= 0) {
      F.patch = 0.13;
      const d = rand(2.2, 7), side = rand(-1.1, 1.1);
      const x = from.x + dir.x * d - dir.z * side, z = from.z + dir.z * d + dir.x * side;
      const gy = groundHeight(x, z, from.y + 0.5);
      if (from.y - gy < 7) this.addFlame(new THREE.Vector3(x, gy, z), a, rand(1.3, 1.8), 5);
    }
    return true;
  }
  addFlame(pos, owner, r, life) {
    const g = this.game;
    if (this.flames.length >= 100) this.flames.shift();
    this.flames.push({ pos, owner, r, born: g.time, until: g.time + life, acc: new Map(), seed: rand(0, 100) });
    g.world.paintSplat(pos.x, pos.y, pos.z, r * 1.2, 'chili');
  }
  _flameStep(f, dt) {
    const g = this.game, now = g.time;
    if (now > f.until) return false;
    if (Math.random() < dt * 6) g.fx.burst('ember', _c.set(f.pos.x + rand(-f.r, f.r) * 0.6, f.pos.y + 0.4, f.pos.z + rand(-f.r, f.r) * 0.6));
    for (const b of g.actors) {
      if (!b.alive || b.isRemote || b === f.owner || g.teammates(f.owner, b)) continue;
      if (Math.abs(b.pos.y - f.pos.y) > 1.5 || Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z) > f.r) continue;
      const acc = (f.acc.get(b) || 0) + 10 * dt;
      if (acc >= 3) { g.damage(b, acc, f.owner, 'flames'); f.acc.set(b, 0); } else f.acc.set(b, acc);
      b.burn(2);
    }
    return true;
  }

  // ------------------------------------------------------------------ chili: too spicy
  // Throwing a chili has a 30% chance to set your own mouth (and the rest of you) on fire.
  spicy(a) {
    const g = this.game;
    if (Math.random() >= 0.3 || a.isWet()) return;
    a.burn(3);
    g.fx.burst('fire', a.headPos(_c), 0.8);
    g.sfx.play('sizzle', a.pos, 0.9);
    g.floatText(a, 'TOO SPICY!', 'slip');
    if (a === g.player) { g.hud.toast('Too spicy! You caught fire (water puts it out)'); g.fx.shake(0.08); }
  }

  // ------------------------------------------------------------------ shockwaves, beams, trails
  wave(pos, r, color, dur = 0.45) {
    let mesh = this.wavePool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      mesh.renderOrder = 4;
      this.game.scene.add(mesh);
    }
    mesh.material.color.set(color);
    mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    mesh.visible = true;
    mesh.scale.setScalar(0.3);
    this.waves.push({ mesh, born: this.game.time, dur, r });
  }
  beam(pos, color) {
    let mesh = this.beamPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      mesh.renderOrder = 4;
      this.game.scene.add(mesh);
    }
    mesh.material.color.set(color);
    mesh.position.copy(pos);
    mesh.visible = true;
    this.beams.push({ mesh, born: this.game.time, dur: 0.6 });
  }
  trail(actor, kind, dur) {
    this.trails = this.trails.filter((t) => t.actor !== actor || t.kind !== kind);
    if (dur > 0) this.trails.push({ actor, kind, until: this.game.time + dur });
  }

  // ------------------------------------------------------------------ the room's abilities
  // Another player's ability (or one of the host's bots'): run its area effect here.
  remote(a, kind, d) {
    const g = this.game, now = g.time, B = FLOOR_BOUNDS;
    a.netAb = (a.netAb || []).filter((t) => now - t < 2);
    if (a.netAb.length >= 8) return; // rate limit, per Titan
    a.netAb.push(now);
    const P = () => new THREE.Vector3(N(d[0], B.minX, B.maxX), N(d[1], -40, 120), N(d[2], B.minZ, B.maxZ));
    const D = (i) => { const v = new THREE.Vector3(N(d[i], -1, 1), 0, N(d[i + 1], -1, 1)); return v.lengthSq() > 1e-4 ? v.normalize() : v.set(0, 0, -1); };
    switch (kind) {
      case 'td': this.trail(a, 'tomato', 0.45); g.sfx.play('whoosh', a.pos, 1); break;
      case 'ts': this.trail(a, 'tomato', 0); this.tomatoSplat(a, P(), D(3)); break;
      case 'wd': this.trail(a, 'melon', 3); g.sfx.play('whoosh', a.pos, 1); break;
      case 'ws': this.trail(a, 'melon', 0); this.smashFx(a, P(), N(d[3], 0, 60)); break;
      case 'sj': this.megaJumpFx(a, P()); break;
      case 'pl': this.addSpikeLine(a, P(), D(3)); break;
      case 'bs': this.startSpiral(a); break;
      case 'cf': this.startFlamer(a); break;
      case 'tc': this.trail(a, 'tp', 1.6); g.sfx.play('tpcharge', a.pos, 0.8); break;
      case 'tx': this.trail(a, 'tp', 0); break;
      case 'pn': g.utensils.panShock(a, P(), typeof d[3] === 'string' ? d[3] : 'tomato', true); break; // (0.44) a Pan slam
      case 'tb': { // (0.44) a tomato dash bumped one of my Titans (no second tomato: no splat)
        const t = typeof d[0] === 'string' ? g.net?._actorOf(d[0]) : null;
        if (t && !t.isRemote && t.alive) { const v = D(1); g.damage(t, 8, a, 'tomato'); t.knock(v.set(v.x * 8, 4, v.z * 8)); }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ per step
  update(dt) {
    const g = this.game, now = g.time;
    // my Titans' dashes, smashes and teleport wind-ups
    for (const a of g.actors) {
      if (a.isRemote) continue;
      if (a.tdash) {
        if (!a.alive || now > a.tdash.until) a.tdash = null;
        else {
          g.fx.spray('blobs', a.center(_c), 3, { speed: 2, up: 1, colors: TOMATO, size: 0.18, life: 0.45 });
          if (Math.random() < dt * 14) g.world.paintSplat(a.pos.x, a.pos.y, a.pos.z, 0.8, 'drip');
          for (const b of g.actors) {
            if (!this._foe(a, b)) continue;
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
            if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(b.pos.y - a.pos.y) < 1.8) { this.tomatoImpact(a, b); break; }
          }
        }
      }
      if (a.smash) {
        if (!a.alive || now - a.smash.t0 > 5) a.smash = null;
        else g.fx.spray('blobs', a.center(_c), 2, { speed: 1, up: 3, colors: MELON, size: 0.16, life: 0.4, grav: -0.5 });
      }
      if (a.channel) { if (a.alive) this._channelStep(a, dt); else a.channel = null; }
    }
    this.vortices = this.vortices.filter((v) => this._vortexStep(v, dt));
    this.lines = this.lines.filter((L) => this._lineStep(L, dt));
    this.spirals = this.spirals.filter((S) => this._spiralStep(S, dt));
    this.flamers = this.flamers.filter((F) => this._flamerStep(F, dt));
    this.flames = this.flames.filter((f) => this._flameStep(f, dt));
    // other players' moves, seen here
    this.trails = this.trails.filter((t) => {
      if (now > t.until || !t.actor.alive) return false;
      const a = t.actor;
      if (t.kind === 'tomato') g.fx.spray('blobs', a.center(_c), 3, { speed: 2, up: 1, colors: TOMATO, size: 0.18, life: 0.45 });
      else if (t.kind === 'melon') g.fx.spray('blobs', a.center(_c), 2, { speed: 1, up: 3, colors: MELON, size: 0.16, life: 0.4, grav: -0.5 });
      else if (t.kind === 'tp') {
        const ang = rand(0, Math.PI * 2);
        g.fx.blobs.spawn(a.pos.x + Math.cos(ang) * 1.2, a.pos.y + rand(0.2, 2), a.pos.z + Math.sin(ang) * 1.2, -Math.sin(ang) * 4, rand(0.5, 2), Math.cos(ang) * 4, 0.4, 0.09, TELE[(Math.random() * 4) | 0], -0.2, 0.5);
      }
      return true;
    });
    this.waves = this.waves.filter((w) => {
      const k = (now - w.born) / w.dur;
      if (k >= 1) { w.mesh.visible = false; this.wavePool.push(w.mesh); return false; }
      w.mesh.scale.setScalar(Math.max(0.3, w.r * (1 - (1 - k) ** 3)));
      w.mesh.material.opacity = 0.9 * (1 - k);
      return true;
    });
    this.beams = this.beams.filter((b) => {
      const k = (now - b.born) / b.dur;
      if (k >= 1) { b.mesh.visible = false; this.beamPool.push(b.mesh); return false; }
      b.mesh.scale.set(1 - k * 0.6, 4 + 18 * Math.min(1, k * 3), 1 - k * 0.6);
      b.mesh.material.opacity = 0.75 * (1 - k);
      return true;
    });
    this._drawFlames(now);
    this._drawSpikes(now);
  }

  _drawFlames(now) {
    let n = 0, gN = 0;
    const im = this.flameIM, gl = this.glowIM, c = _c;
    for (const f of this.flames) {
      const fade = Math.min(1, (now - f.born) / 0.2) * Math.min(1, (f.until - now) / 0.6);
      if (gN < 120) { _m.compose(_o.set(f.pos.x, f.pos.y + 0.06, f.pos.z), _q.identity(), _s.set(f.r * 1.3 * fade, 1, f.r * 1.3 * fade)); gl.setMatrixAt(gN++, _m); }
      for (let k = 0; k < 3 && n < FLAME_CAP; k++) {
        const a = f.seed + k * 2.1, off = k === 0 ? 0 : f.r * 0.45;
        const h = (0.75 + 0.35 * Math.sin(now * 17 + f.seed * 3 + k * 1.7) + 0.15 * Math.sin(now * 31 + k)) * fade * (k === 0 ? 1.25 : 0.85);
        _e.set(Math.sin(now * 7 + a) * 0.12, a, Math.cos(now * 9 + a) * 0.12);
        _q.setFromEuler(_e);
        _m.compose(_o.set(f.pos.x + Math.cos(a) * off, f.pos.y, f.pos.z + Math.sin(a) * off), _q, _s.set(f.r * 0.7 * fade, Math.max(0.01, h * f.r * 0.9), f.r * 0.7 * fade));
        im.setMatrixAt(n, _m);
        c.copy(FIRE[(k + Math.floor(f.seed)) % 3]);
        im.instanceColor.setXYZ(n, c.r, c.g, c.b);
        n++;
      }
    }
    im.count = n; gl.count = gN;
    if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    if (gN) gl.instanceMatrix.needsUpdate = true;
  }
  _drawSpikes(now) {
    let n = 0;
    const im = this.spikeIM;
    for (const L of this.lines) {
      const end = L.until;
      L.pts.forEach((sp, i) => {
        if (!sp.up || n >= SPIKE_CAP) return;
        const age = now - (L.born + i * SPIKE_GAP);
        const pop = age < 0.18 ? 1 + 0.35 * Math.sin((age / 0.18) * Math.PI) : 1; // overshoot as it bursts up
        const k = Math.min(1, age / 0.08) * Math.min(1, (end - now) / 0.35);
        _e.set(sp.tilt, sp.spin, sp.tilt * 0.6);
        _q.setFromEuler(_e);
        _m.compose(sp.p, _q, _s.set(sp.s, Math.max(0.01, k * pop * sp.s), sp.s));
        im.setMatrixAt(n++, _m);
      });
    }
    im.count = n;
    if (n) im.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const v of this.vortices) this._dropVortex(v);
    this.vortices.length = 0; this.flames.length = 0; this.lines.length = 0; this.spirals.length = 0; this.flamers.length = 0; this.trails.length = 0;
    for (const w of this.waves) { w.mesh.visible = false; this.wavePool.push(w.mesh); }
    for (const b of this.beams) { b.mesh.visible = false; this.beamPool.push(b.mesh); }
    this.waves.length = 0; this.beams.length = 0;
    this.flameIM.count = 0; this.glowIM.count = 0; this.spikeIM.count = 0;
  }
}
