// Tiny Titans: shared by the player and bots. Movement kit, statuses and inventory follow
// GDD sections 4-5 (hard-CC diminishing returns, 50% slow cap, Wet cleansing, Glaze shield).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  G, FLOOR_Y, clamp, rand, damp, angleLerp, forwardOf, rightOf,
  groundHeight, resolveHorizontal,
} from './core.js';
import { FOODS, makeFoodMesh } from './foods.js';

const JUMP_V = Math.sqrt(2 * G * 6);   // 6 m jump: about three times a Titan's height
const JUMP2_V = Math.sqrt(2 * G * 5);  // double jump adds another 5 m
const DASH_SPEED = 28, DASH_TIME = 0.2, DASH_COOLDOWN = 0.45;
// Stamina: jumping and dashing cost it; it refills after a short pause.
export const STAMINA_MAX = 100;
const COST_JUMP = 18, COST_DOUBLE = 24, COST_DASH = 30, REGEN = 30, REGEN_DELAY = 0.6;
export const MAX_HP = 200;
const RADIUS = 0.45, HEIGHT = 1.95;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,190,80,0.8)'); g.addColorStop(1, 'rgba(255,140,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,240,0.9)';
  x.fillRect(0, 31, 64, 2); x.fillRect(31, 0, 2, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let GLINT_TEX = null;

// Merged, shared Titan body geometry (one BufferGeometry per material).
let TITAN_GEO = null;
function titanGeometry() {
  if (TITAN_GEO) return TITAN_GEO;
  const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const hat = M(0, 1.88, 0, 0, 0, -0.12);
  const put = (g, m) => g.applyMatrix4(m);
  const eyeG = () => new THREE.SphereGeometry(0.12, 12, 10), pupG = () => new THREE.SphereGeometry(0.06, 10, 8);
  const puffs = [[-0.14, 0], [0.14, 0], [0, 0.13], [0, -0.13], [0, 0]].map(([x, z]) => put(new THREE.SphereGeometry(0.2, 12, 10), hat.clone().multiply(M(x, 0.42, z))));
  TITAN_GEO = {
    skin: mergeGeometries([put(new THREE.CapsuleGeometry(0.42, 0.45, 6, 16), M(0, 0.72, 0)), put(new THREE.SphereGeometry(0.43, 24, 18), M(0, 1.52, 0))]),
    belly: put(new THREE.SphereGeometry(0.34, 16, 12), M(0, 0.66, 0.2, 0, 0, 0, 1, 1.1, 0.55)),
    white: mergeGeometries([
      put(eyeG(), M(-0.16, 1.58, 0.36)), put(eyeG(), M(0.16, 1.58, 0.36)),
      put(new THREE.CylinderGeometry(0.28, 0.26, 0.3, 20), hat.clone().multiply(M(0, 0.2, 0))), ...puffs,
    ]),
    black: mergeGeometries([
      put(pupG(), M(-0.16, 1.58, 0.46)), put(pupG(), M(0.16, 1.58, 0.46)),
      put(new THREE.TorusGeometry(0.08, 0.025, 6, 12, Math.PI), M(0, 1.4, 0.4, 0, 0, Math.PI)),
    ]),
    band: put(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 20), hat.clone()),
  };
  return TITAN_GEO;
}

// A soft rim light keeps Titans readable against busy food splats (GDD 11.1).
function addRimLight(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
      totalEmissiveRadiance += vec3(1.0, 0.9, 0.75) * 0.45 * pow(rimF, 2.6);`);
  };
  mat.customProgramCacheKey = () => 'titan-rim';
}

export class Actor {
  constructor(game, { id, name, color, isBot }) {
    this.game = game;
    this.id = id; this.name = name; this.color = color; this.isBot = isBot;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1); this.aimPoint = new THREE.Vector3();
    this._buildMesh();
    this.reset();
  }

  reset() {
    this.alive = true; this.hp = MAX_HP; this.glaze = 0; this.kills = 0;
    this.airJumps = 0; this.airDashes = 0; this.dashT = 0; this.noiseAt = -99; this.fpCam = null;
    this.stamina = STAMINA_MAX; this.staminaUsedAt = -99; this.staminaFlash = 0;
    this.vel.set(0, 0, 0); this.yaw = 0; this.onGround = false; this.gliding = false;
    this.inv = [null, null, null, null, null]; this.sel = 0;
    this.sticky = []; this.surfaceSlow = 0; this.surfaceSlowUntil = 0;
    this.frozenUntil = 0; this.trippedUntil = 0; this.rootedUntil = 0; this.lastDodgeAt = -99; this.botTarget = null; this.wetUntil = 0; this.burnUntil = 0; this.juicedUntil = 0;
    this.knockUntil = 0; this.stunUntil = 0; this.ccLog = [];
    this.dodgeReadyAt = 0; this.recoverUntil = 0; this.swapLockUntil = 0;
    this.charging = false; this.chargeT = 0; this.primaryPrev = false;
    this.eat = null; this.shieldUp = false; this.shieldHp = 0;
    this.lastHitBy = null; this.lastHitFood = null; this.lastHitAt = -99;
    this.envAcc = 0; this.burnAcc = 0; this.tideAcc = 0; this.nextDrip = 0; this.honeySfxAt = 0;
    this.fallTop = 0; this.armT = 0; this.squash = 0; this.walkPhase = 0; this.hitFlash = 0;
    this.placement = 0;
    this.root.visible = true;
    this._refreshHeld();
  }

  // ------------------------------------------------------------------ mesh
  _buildMesh() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const skin = new THREE.MeshPhysicalMaterial({ color: this.color, roughness: 0.45, clearcoat: 0.4, sheen: 0.3 });
    const belly = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.color).lerp(new THREE.Color('#fff6e6'), 0.55), roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: '#1d1620', roughness: 0.3 });
    this.skinMat = skin;

    // Static body parts are merged per material (5 draw calls instead of ~20) and shared by all Titans.
    const G = titanGeometry();
    for (const [g, m] of [[G.skin, skin], [G.belly, belly], [G.white, white], [G.black, black], [G.band, new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.5 })]]) {
      body.add(new THREE.Mesh(g, m));
    }
    addRimLight(skin);

    const armG = new THREE.CapsuleGeometry(0.1, 0.35, 4, 8);
    const mkArm = (s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.46, 1.02, 0);
      const arm = new THREE.Mesh(armG, skin);
      arm.position.y = -0.22;
      const hand = new THREE.Group();
      hand.position.y = -0.46;
      pivot.add(arm, hand);
      body.add(pivot);
      return { pivot, hand };
    };
    // The model faces local +z and is turned by yaw + PI, so local -x is the character's right.
    this.armL = mkArm(1); this.armR = mkArm(-1);
    const footG = new THREE.SphereGeometry(0.16, 10, 8);
    this.feet = [-1, 1].map((s) => {
      const f = new THREE.Mesh(footG, belly);
      f.scale.set(1, 0.6, 1.4);
      f.position.set(s * 0.2, 0.08, 0.05);
      body.add(f);
      return f;
    });

    // napkin glider
    const napkinTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#fffaf2'; x.fillRect(0, 0, 64, 64);
      x.fillStyle = 'rgba(214,38,40,0.8)';
      for (let i = 0; i < 64; i += 16) { x.fillRect(i, 0, 8, 64); x.fillRect(0, i, 64, 8); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.napkin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6, 6, 6), new THREE.MeshStandardMaterial({ map: napkinTex, side: THREE.DoubleSide, roughness: 0.9 }));
    const np = this.napkin.geometry.attributes.position;
    for (let i = 0; i < np.count; i++) np.setZ(i, -0.12 * (np.getX(i) ** 2 + np.getY(i) ** 2));
    this.napkin.geometry.computeVertexNormals();
    this.napkin.rotation.x = Math.PI / 2;
    this.napkin.position.y = 3.1;
    this.napkin.visible = false;
    root.add(this.napkin);

    // ice block shown while Frozen
    this.iceBlock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 1.4), new THREE.MeshPhysicalMaterial({
      color: '#d4f1ff', transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, depthWrite: false,
    }));
    this.iceBlock.position.y = 1.1;
    this.iceBlock.visible = false;
    root.add(this.iceBlock);

    // carrot glint (GDD: the sniper's counterplay tell)
    GLINT_TEX ||= glintTexture();
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLINT_TEX, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glint.visible = false;
    this.glint.renderOrder = 10;
    this.game.scene.add(this.glint);

    root.traverse((o) => { if (o.isMesh) { o.castShadow = !!this.game.quality.dynamicShadows; } });
    this.iceBlock.castShadow = false;
    this.root = root; this.body = body;
    this.heldMesh = null; this.heldId = null;
    this.shieldMesh = makeFoodMesh('cheese');
    this.shieldMesh.scale.setScalar(2.1);
    this.shieldMesh.rotation.x = Math.PI / 2;
    this.shieldMesh.position.set(0, 1.0, 1.45);
    this.shieldMesh.visible = false;
    root.add(this.shieldMesh);
    this.game.scene.add(root);
  }

  _refreshHeld() {
    const slot = this.inv[this.sel];
    const id = slot ? slot.id : null;
    if (id === this.heldId) return;
    if (this.heldMesh) this.armR.hand.remove(this.heldMesh);
    this.heldMesh = null; this.heldId = id;
    if (id) {
      this.heldMesh = makeFoodMesh(id);
      const s = { cheese: 0.7, carrot: 0.8, banana: 0.9 }[id] || 0.9;
      this.heldMesh.scale.setScalar(s);
      if (id === 'carrot') this.heldMesh.rotation.x = Math.PI / 2;
      this.armR.hand.add(this.heldMesh);
    }
  }

  // ------------------------------------------------------------------ queries
  handPos(out = new THREE.Vector3()) {
    if (this.fpCam) { // first person: food leaves from the viewmodel hand, lower right of the view
      const c = this.fpCam;
      return out.set(0.48, -0.36, -1.0).applyQuaternion(c.quaternion).add(c.position);
    }
    forwardOf(this.yaw, _f); rightOf(this.yaw, _r);
    return out.copy(this.pos).addScaledVector(_r, 0.5).addScaledVector(_f, 0.45).setY(this.pos.y + 1.45);
  }
  center(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 0.95); }
  headPos(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 1.55); }
  isFrozen() { return this.game.time < this.frozenUntil; }
  isTripped() { return this.game.time < this.trippedUntil; }
  isWet() { return this.game.time < this.wetUntil; }
  isBurning() { return this.game.time < this.burnUntil; }
  canControl() { const t = this.game.time; return this.alive && t >= this.frozenUntil && t >= this.trippedUntil && t >= this.stunUntil; }
  selected() { return this.inv[this.sel]; }
  selectedFood() { const s = this.inv[this.sel]; return s ? FOODS[s.id] : null; }
  heavy() { return this.shieldUp || this.inv[this.sel]?.id === 'watermelon'; }
  isRooted() { return this.game.time < this.rootedUntil; }
  slowAmount() {
    const t = this.game.time;
    let s = 0;
    for (const e of this.sticky) if (e.until > t) s += e.amt;
    if (t < this.surfaceSlowUntil) s += this.surfaceSlow;
    return Math.min(0.5, s); // GDD: total slow capped at 50%
  }
  statusList() {
    const t = this.game.time, out = [];
    if (this.isFrozen()) out.push(['frozen', 'Frozen']);
    if (this.isTripped()) out.push(['tripped', 'Slipped']);
    if (this.isRooted()) out.push(['rooted', 'Rooted']);
    if (t < this.juicedUntil) out.push(['juiced', 'Juiced']);
    const slow = this.slowAmount();
    if (slow > 0.01) out.push(['sticky', `Sticky -${Math.round(slow * 100)}%`]);
    if (this.isBurning()) out.push(['burning', 'Burning']);
    if (this.isWet()) out.push(['wet', 'Wet']);
    if (this.onSlick) out.push(['slick', 'Slick']);
    if (this.shieldUp) out.push(['shield', `Cheese shield ${Math.ceil(this.shieldHp)}`]);
    return out;
  }

  // ------------------------------------------------------------------ effects
  takeDamage(amount) {
    let a = amount;
    if (this.glaze > 0) { const g = Math.min(this.glaze, a); this.glaze -= g; a -= g; }
    this.hp -= a;
    this.hitFlash = 1;
    this.noiseAt = this.game.time; // getting splatted is loud
    if (this.eat) this.eat.dmg += amount;
    return amount;
  }
  heal(n) { this.hp = Math.min(MAX_HP, this.hp + n); }
  addSticky(amt, dur) {
    if (this.isRemote) return false; // remote Titans are moved by their own player's game
    if (this.isWet()) return;
    this.sticky.push({ amt, until: this.game.time + dur });
  }
  juice(dur) { if (this.isRemote) return false; if (!this.isWet()) this.juicedUntil = Math.max(this.juicedUntil, this.game.time + dur); }
  setWet(dur) {
    if (this.isRemote) return false; // remote Titans are moved by their own player's game
    const t = this.game.time;
    this.wetUntil = Math.max(this.wetUntil, t + dur);
    this.sticky.length = 0; this.juicedUntil = 0; this.burnUntil = 0; this.surfaceSlowUntil = 0;
  }
  burn(dur) { if (this.isRemote) return false; if (!this.isWet()) this.burnUntil = Math.max(this.burnUntil, this.game.time + dur); }
  knock(v) {
    if (this.isRemote) return false; // remote Titans are moved by their own player's game
    this.vel.add(v);
    if (v.y > 0) this.onGround = false;
    this.knockUntil = this.game.time + 0.45;
  }

  // Hard CC with shared diminishing returns: 2nd within 6 s is halved, 3rd is immune,
  // and no more than 2.5 s of hard CC in any 6 s window (GDD 5.4).
  applyHardCC(kind, dur) {
    if (this.isRemote) return false; // remote Titans are moved by their own player's game
    const t = this.game.time;
    this.ccLog = this.ccLog.filter((e) => t - e.t < 6);
    const n = this.ccLog.length;
    if (n >= 2) { this.game.floatText(this, 'IMMUNE', 'immune'); return false; }
    if (n === 1) dur *= 0.5;
    const used = this.ccLog.reduce((s, e) => s + e.dur, 0);
    dur = Math.min(dur, 2.5 - used);
    if (dur < 0.1) { this.game.floatText(this, 'IMMUNE', 'immune'); return false; }
    this.ccLog.push({ t, dur });
    if (kind === 'frozen') this.frozenUntil = t + dur;
    if (kind === 'tripped') this.trippedUntil = t + dur;
    if (kind === 'rooted') { this.rootedUntil = t + dur; return true; } // rooted Titans can still throw
    this.charging = false; this.eat = null;
    return true;
  }

  trip(owner) {
    if (this.isRemote) return false; // remote Titans are moved by their own player's game
    if (!this.applyHardCC('tripped', 1.0)) return false;
    const h = _v.set(this.vel.x, 0, this.vel.z);
    if (h.lengthSq() < 1) forwardOf(this.yaw, h);
    h.normalize();
    this.vel.x = h.x * 12; this.vel.z = h.z * 12; this.vel.y = 3;
    this.onGround = false;
    this.lastHitBy = owner; this.lastHitFood = 'peel'; this.lastHitAt = this.game.time;
    return true;
  }

  // ------------------------------------------------------------------ inventory
  give(id, count) {
    const max = FOODS[id].maxStack;
    let left = count;
    for (const s of this.inv) {
      if (s && s.id === id && s.inf) { left = 0; break; } // Chef's Choice: bottomless already
      if (s && s.id === id && s.count < max) { const k = Math.min(left, max - s.count); s.count += k; left -= k; }
      if (!left) break;
    }
    for (let i = 0; i < 5 && left > 0; i++) {
      if (!this.inv[i]) {
        const k = Math.min(left, max);
        this.inv[i] = { id, count: k };
        if (id === 'cheese') this.inv[i].hp = 300;
        left -= k;
      }
    }
    this._refreshHeld();
    return count - left;
  }
  consume(n) {
    const s = this.inv[this.sel];
    if (!s) return;
    if (s.inf) { if (s.id === 'cheese') s.hp = 300; this._refreshHeld(); return; } // Chef's Choice: never runs out
    s.count -= n;
    if (s.count <= 0) { this.inv[this.sel] = null; this.shieldUp = false; }
    else if (s.id === 'cheese') s.hp = 300; // the next wheel in the stack is a fresh shield
    this._refreshHeld();
  }
  select(i) {
    if (i === this.sel) return;
    const prev = this.inv[this.sel];
    this.sel = i;
    const next = this.inv[i];
    this.charging = false; this.eat = null; this.shieldUp = false;
    if (prev && next && prev.id !== next.id) this.swapLockUntil = this.game.time + 0.35; // GDD swap lockout
    this._refreshHeld();
  }
  // Chef's Choice: bottomless slots; food never heals there (green heal crosses on the map do).
  giveLoadout(ids) {
    this.inv = [null, null, null, null, null];
    ids.forEach((id, i) => { this.inv[i] = { id, count: FOODS[id].maxStack, inf: true }; if (id === 'cheese') this.inv[i].hp = 300; });
    this.sel = 0;
    this._refreshHeld();
  }
  startEat(dur, done) {
    if (this.game.mode === 'chef') {
      if (!this.isBot) this.game.hud.toast("No snacking in Chef's Choice: grab a green heal cross");
      return;
    }
    this.eat = { end: this.game.time + dur, done, dmg: 0 };
  }

  // ------------------------------------------------------------------ simulation
  update(dt, it) {
    if (!this.alive) return;
    const g = this.game, now = g.time, W = g.world;
    this.sticky = this.sticky.filter((e) => e.until > now);

    // environment
    if (this.onGround && W.inWater(this.pos)) this.setWet(4);
    if (this.onGround && W.onBurner(this.pos)) {
      this.envAcc += 20 * dt; this.burn(3);
      if (this.envAcc >= 5) { g.damage(this, this.envAcc, null, 'burner'); this.envAcc = 0; }
    }
    if (this.isBurning()) {
      this.burnAcc += 4 * dt;
      if (this.burnAcc >= 2) { g.damage(this, this.burnAcc, null, 'burning'); this.burnAcc = 0; }
      if (Math.random() < dt * 12) g.fx.burst('ember', this.center(_v));
    }
    const honey = this.onGround && this.glaze < 100 ? W.inHoney(this.pos) : null;
    if (honey && honey.cap > 0) {
      const gain = Math.min(30 * dt, 100 - this.glaze, honey.cap);
      this.glaze += gain; honey.cap -= gain;
      if (now > this.honeySfxAt) { g.sfx.play('glaze', this.pos, 0.6); this.honeySfxAt = now + 0.4; g.fx.burst('honey', this.center(_v)); }
    }
    const tide = g.tide;
    if (tide && Math.hypot(this.pos.x - tide.x, this.pos.z - tide.z) > tide.r) {
      this.tideAcc += tide.dps * dt; this.setWet(2);
      if (this.tideAcc >= 3) { g.damage(this, this.tideAcc, null, 'tide'); this.tideAcc = 0; }
      if (Math.random() < dt * 8) g.fx.burst('bubbles', this.center(_v));
    }
    if (!this.alive) return;

    // surface state under the feet
    const cell = this.onGround ? g.surface.query(this.pos.x, this.pos.y, this.pos.z, now) : null;
    this.onSlick = !!cell && (cell.state === 'ice' || cell.state === 'slick');
    if (cell && cell.state === 'sticky' && !this.isWet()) { this.surfaceSlow = cell.slow; this.surfaceSlowUntil = now + 0.5; }

    const control = this.canControl() && !this.isRooted();
    const slow = this.slowAmount();
    let speed = (it.sprint && !this.heavy() ? 10 : 6.5) * (1 - slow); // walk 6.5 m/s, sprint 10 m/s
    if (this.shieldUp) speed *= 0.75;
    else if (this.heavy()) speed *= 0.85; // lugging a watermelon
    if (this.eat) speed *= 0.5;
    if (this.charging && this.selected()?.id === 'carrot') speed *= 0.6;
    let accel = this.onGround ? 55 : 10;
    if (this.onSlick) { accel = 5; speed *= 1.3; }
    if (this.gliding) accel = 14;
    if (now < this.knockUntil) accel = Math.min(accel, 3);

    const wx = control ? it.moveX * speed : 0, wz = control ? it.moveZ * speed : 0;
    let dx = wx - this.vel.x, dz = wz - this.vel.z;
    const dl = Math.hypot(dx, dz), maxd = accel * dt;
    if (dl > maxd) { dx *= maxd / dl; dz *= maxd / dl; }
    if (!control && this.onGround) { dx *= 0.3; dz *= 0.3; } // frozen/slipped: slide with little friction
    this.vel.x += dx; this.vel.z += dz;

    if (this.onGround) { this.airJumps = 0; this.airDashes = 0; }
    if (now - this.staminaUsedAt > REGEN_DELAY) this.stamina = Math.min(STAMINA_MAX, this.stamina + REGEN * dt);
    this.staminaFlash = Math.max(0, this.staminaFlash - dt);
    const spend = (n) => {
      if (this.stamina < n) { this.staminaFlash = 0.4; return false; } // too tired
      this.stamina -= n; this.staminaUsedAt = now; return true;
    };
    if (control && it.jump && !this.gliding) {
      if (this.onGround) {
        if (spend(COST_JUMP)) { this.vel.y = JUMP_V; this.onGround = false; }
      } else if (this.airJumps < 1 && spend(COST_DOUBLE)) { // double jump
        this.vel.y = Math.max(this.vel.y, JUMP2_V);
        this.airJumps++;
        g.fx.burst('jump', this.pos);
        this.noiseAt = now;
        g.sfx.play('boing', this.pos, 0.35);
      }
    }
    // Dash: a quick burst in the move direction on a short cooldown; one per jump in the air.
    if (control && it.dodge && now >= this.dodgeReadyAt && !this.gliding && (this.onGround || this.airDashes < 1) && spend(COST_DASH)) {
      const d = _v.set(it.moveX, 0, it.moveZ);
      if (d.lengthSq() < 0.01) forwardOf(this.yaw, d);
      d.normalize();
      this.vel.x = d.x * DASH_SPEED; this.vel.z = d.z * DASH_SPEED;
      if (!this.onGround) { this.vel.y = Math.max(this.vel.y, 2); this.airDashes++; }
      this.dodgeReadyAt = now + DASH_COOLDOWN; this.knockUntil = now + DASH_TIME; this.dashT = DASH_TIME;
      this.lastDodgeAt = now; this.noiseAt = now;
      for (const e of this.sticky) e.until -= 1; // dashing sheds 1 s of sticky
      g.sfx.play('dodge', this.pos);
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      g.fx.burst('dash', this.center(_f));
    }

    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 8.5) this.noiseAt = now; // sprinting footsteps
    this.vel.y -= G * dt;
    if (this.gliding) this.vel.y = Math.max(this.vel.y, -7);
    if (this.onGround) this.fallTop = this.pos.y; else this.fallTop = Math.max(this.fallTop, this.pos.y);

    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    const n = resolveHorizontal(this.pos, RADIUS, HEIGHT);
    if (n) { const d = this.vel.x * n.x + this.vel.z * n.z; if (d < 0) { this.vel.x -= n.x * d; this.vel.z -= n.z * d; } }

    const gh = groundHeight(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    if (this.pos.y <= gh) {
      if (!this.onGround) this._land(this.fallTop - gh);
      this.pos.y = gh; this.vel.y = Math.max(0, this.vel.y); this.onGround = true;
    } else if (this.onGround && this.pos.y - gh < 0.4 && this.vel.y <= 0) {
      this.pos.y = gh; this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    // spatula launch pads on the floor
    if (this.onGround && this.pos.y < FLOOR_Y + 1.5) {
      for (const p of W.pads) {
        if (Math.hypot(this.pos.x - p.x, this.pos.z - p.z) < 3.4) {
          this.vel.copy(W.launchVelocity(p, this.pos));
          this.onGround = false; this.knockUntil = now + 2.5; p.pulse = 1;
          g.sfx.play('boing', this.pos, 1.2);
          g.fx.burst('dust', this.pos);
          break;
        }
      }
    }

    // juiced victims drip a slick red trail (GDD Tomato)
    if (now < this.juicedUntil && this.onGround && now > this.nextDrip) {
      g.surface.stamp(this.pos.x, this.pos.y, this.pos.z, 0.9, 'slick', 5, now);
      W.paintSplat(this.pos.x, this.pos.y, this.pos.z, 0.7, 'drip');
      this.nextDrip = now + 0.22;
    }

    this._items(dt, it);
  }

  _land(fall) {
    const g = this.game;
    this.gliding = false;
    if (fall > 6) { this.squash = Math.min(1, fall / 25); g.fx.burst('dust', this.pos, Math.min(2, fall / 15)); }
    if (fall > 40) { this.stunUntil = g.time + 0.6; g.sfx.play('thud', this.pos); } // splat landing (no fall damage)
  }

  _items(dt, it) {
    const g = this.game, now = g.time;
    if (it.slot >= 0) this.select(it.slot);
    if (it.cycle) {
      for (let k = 1; k <= 5; k++) {
        const i = (this.sel + it.cycle * k + 25) % 5;
        if (this.inv[i]) { this.select(i); break; }
      }
    }
    const slot = this.inv[this.sel];
    const food = slot ? FOODS[slot.id] : null;
    if (slot && slot.id === 'cheese') this.shieldHp = slot.hp;
    if (this.eat) {
      if (this.eat.dmg >= 25 || !this.canControl()) this.eat = null; // eating is interrupted by 25+ damage
      else if (now >= this.eat.end) { const d = this.eat.done; this.eat = null; d(); }
      this.primaryPrev = it.primary;
      return;
    }
    const ready = this.canControl() && now >= this.recoverUntil && now >= this.swapLockUntil;
    if (!food || !this.canControl()) { this.charging = false; this.primaryPrev = it.primary; return; }
    if (it.alt && food.alt && ready) food.alt(this, g);
    if (!ready) { this.primaryPrev = it.primary; return; }
    if (food.auto) { // rapid fire: keeps firing while held
      if (it.primary) this._release(food, 1);
    } else if (food.charge > 0) {
      if (it.primary && !this.charging && !this.primaryPrev) { this.charging = true; this.chargeT = 0; }
      if (this.charging) {
        this.chargeT += dt;
        if (!it.primary) this._release(food, clamp(this.chargeT / food.charge, 0, 1));
      }
    } else if (it.primary && !this.primaryPrev) {
      this._release(food, 1);
    }
    this.primaryPrev = it.primary;
  }

  _release(food, c) {
    food.release(this, c, this.game);
    this.charging = false; this.chargeT = 0;
    this.recoverUntil = this.game.time + food.recovery;
    this.noiseAt = this.game.time; // throwing is loud
    this.armT = 0.3;
  }

  // ------------------------------------------------------------------ visuals
  updateVisual(dt, camera) {
    const t = this.game.time;
    const r = this.root;
    r.position.copy(this.pos);
    r.rotation.y = angleLerp(r.rotation.y, this.yaw + Math.PI, 1 - Math.exp(-18 * dt));
    if (!this.alive) return;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && speed > 0.5 && !this.isFrozen();
    this.walkPhase += dt * speed * 2.1;
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;
    this.squash = Math.max(0, this.squash - dt * 4);
    const sq = this.squash * 0.35;
    this.body.scale.set(1 + sq * 0.6, 1 - sq + (this.charging && this.selected()?.id === 'soda' ? Math.sin(t * 40) * 0.02 : 0), 1 + sq * 0.6);
    this.body.position.y = bob;

    // lean into movement, lie flat when slipped, tumble when dodging
    const fwd = forwardOf(this.yaw, _f), right = rightOf(this.yaw, _r);
    const vf = (this.vel.x * fwd.x + this.vel.z * fwd.z) / 8, vr = (this.vel.x * right.x + this.vel.z * right.z) / 8;
    let tiltX = clamp(vf, -1, 1) * 0.18, tiltZ = -clamp(vr, -1, 1) * 0.15;
    if (this.isTripped()) tiltX = -1.45;
    if (this.dashT > 0) tiltX = 0.55; // lean hard into a dash
    else if (this.airJumps > 0 && !this.onGround && this.vel.y > 0) tiltX = -0.6 + (JUMP2_V - this.vel.y) * 0.05; // flip-ish tuck
    this.body.rotation.x = damp(this.body.rotation.x, tiltX, this.dashT > 0 ? 30 : 12, dt);
    this.body.rotation.z = damp(this.body.rotation.z, tiltZ, 12, dt);
    this.body.position.y += this.isTripped() ? 0.35 : 0;

    // arms: swing when walking, pull back while charging, snap forward on throw
    this.armT = Math.max(0, this.armT - dt);
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    let rx = -swing, lx = swing;
    if (this.charging) {
      const f = this.selectedFood();
      rx = 2.4 * Math.min(1, this.chargeT / Math.max(0.2, f ? f.charge : 1)) + 0.4;
    }
    if (this.armT > 0) rx = -1.8 * (this.armT / 0.3);
    if (this.eat) { rx = -2.4; lx = -0.6; }
    if (this.gliding) { rx = lx = Math.PI; }
    if (this.shieldUp) { rx = lx = -1.4; }
    this.armR.pivot.rotation.x = damp(this.armR.pivot.rotation.x, rx, 20, dt);
    this.armL.pivot.rotation.x = damp(this.armL.pivot.rotation.x, lx, 20, dt);
    this.feet[0].position.z = 0.05 + (moving ? Math.sin(this.walkPhase) * 0.18 : 0);
    this.feet[1].position.z = 0.05 - (moving ? Math.sin(this.walkPhase) * 0.18 : 0);

    // Level of detail: far-away Titans drop the small parts you can't see anyway (4 fewer draw calls each).
    const near = camera.position.distanceToSquared(this.pos) < 70 * 70;
    if (near !== this.lodNear) {
      this.lodNear = near;
      this.armL.pivot.visible = this.armR.pivot.visible = near;
      this.feet[0].visible = this.feet[1].visible = near;
    }
    this.napkin.visible = this.gliding;
    if (this.gliding) this.napkin.rotation.z = Math.sin(t * 3) * 0.08;
    const rooted = this.isRooted();
    this.iceBlock.visible = this.isFrozen() || rooted;
    if (this.iceBlock.visible) this.iceBlock.material.color.set(rooted && !this.isFrozen() ? '#7be07a' : '#d4f1ff');
    if (this.heldMesh) this.heldMesh.visible = !this.shieldUp;
    this.shieldMesh.visible = this.shieldUp;

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    const burnGlow = this.isBurning() ? 0.25 + 0.15 * Math.sin(t * 20) : 0;
    this.skinMat.emissive.setRGB(this.hitFlash * 0.9 + burnGlow, this.hitFlash * 0.9 + burnGlow * 0.3, this.hitFlash * 0.9);

    // carrot glint while charging
    const glinting = this.charging && this.selected()?.id === 'carrot';
    this.glint.visible = glinting;
    if (glinting) {
      this.handPos(this.glint.position);
      const s = 0.8 + 0.6 * Math.min(1, this.chargeT) + Math.sin(t * 25) * 0.15;
      const d = camera.position.distanceTo(this.glint.position);
      this.glint.scale.setScalar(s * Math.max(1, d / 25));
    }
  }

  hide() {
    this.root.visible = false;
    this.glint.visible = false;
  }
}
