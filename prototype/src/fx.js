// Visual and audio feedback: pooled instanced particles, synthesized sound, camera shake.
import * as THREE from 'three';
import { G, rand, clamp } from './core.js';

// ---------------------------------------------------------------------------
// Particles: one InstancedMesh per look, structure-of-arrays storage, swap-remove.
class ParticlePool {
  constructor(scene, geometry, material, capacity) {
    this.cap = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    const n = capacity;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.size = new Float32Array(n); this.grav = new Float32Array(n);
    this.drag = new Float32Array(n); this.grow = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.count = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._e = new THREE.Euler(); this._pos = new THREE.Vector3();
  }
  spawn(px, py, pz, vx, vy, vz, life, size, color, grav = 1, drag = 0.3, grow = 0) {
    let i = this.count;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; // recycle a random live particle
    else this.count++;
    const i3 = i * 3;
    this.p[i3] = px; this.p[i3 + 1] = py; this.p[i3 + 2] = pz;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.rot[i] = Math.random() * 6.28;
    this.mesh.instanceColor.setXYZ(i, color.r, color.g, color.b);
  }
  update(dt) {
    const { p, v } = this;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); i--; continue; }
      const i3 = i * 3, k = Math.exp(-this.drag[i] * dt);
      v[i3] *= k; v[i3 + 1] = v[i3 + 1] * k - G * this.grav[i] * dt; v[i3 + 2] *= k;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      this.rot[i] += dt * 4;
    }
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.max[i];
      const s = this.size[i] * (this.grow[i] ? 1 + this.grow[i] * (1 - t) : Math.min(1, t * 3));
      this._s.set(s, s, s);
      this._e.set(this.rot[i], this.rot[i] * 0.7, 0);
      this._q.setFromEuler(this._e);
      this._pos.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this._m.compose(this._pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3;
    for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[l3 + k]; this.v[i3 + k] = this.v[l3 + k]; }
    this.life[i] = this.life[last]; this.max[i] = this.max[last]; this.size[i] = this.size[last];
    this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last]; this.grow[i] = this.grow[last];
    this.rot[i] = this.rot[last];
    const c = this.mesh.instanceColor;
    c.setXYZ(i, c.getX(last), c.getY(last), c.getZ(last));
  }
  clear() { this.count = 0; this.mesh.count = 0; }
}

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  tomato: [C('#d8231b'), C('#ff4a2e'), C('#b3120f')],
  seed: [C('#f3e3a0'), C('#e9d27a')],
  ice: [C('#dff6ff'), C('#aee4ff'), C('#ffffff')],
  soda: [C('#6b2f14'), C('#8a4a22'), C('#f6e7d0')],
  carrot: [C('#ff8a1c'), C('#f06f0a'), C('#ffb14d')],
  banana: [C('#ffe14a'), C('#f5d020'), C('#fff3a8')],
  cheese: [C('#ffc93c'), C('#f5b20f'), C('#ffe08a')],
  steam: [C('#ffffff'), C('#eef4f7')],
  foam: [C('#ffffff'), C('#e8f7ff'), C('#d7f0ff')],
  honey: [C('#ffb300'), C('#ffd35c')],
  ember: [C('#ff6a00'), C('#ffae00'), C('#ff3d00')],
  water: [C('#bfe8ff'), C('#8fd3ff'), C('#ffffff')],
  dust: [C('#d9c7a8'), C('#c9b490')],
  crumb: [C('#d4a15a'), C('#b98240'), C('#3b2112')],
  grape: [C('#6b2a86'), C('#8e3fae'), C('#c9a4e0')],
  melon: [C('#f25a6a'), C('#ff8a94'), C('#2f7a30'), C('#1d1616')],
  pine: [C('#f2c230'), C('#d99a1e'), C('#4f9a3a')],
  jelly: [C('#5fd35a'), C('#9cf09a'), C('#3fae3a')],
  fire: [C('#ff3d00'), C('#ff8a00'), C('#ffd000')],
};

export class FX {
  constructor(scene, quality) {
    this.scale = quality.particles;
    const glossy = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0 });
    const matte = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
    const puff = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
    const cap = Math.round(2400 * this.scale);
    this.blobs = new ParticlePool(scene, new THREE.IcosahedronGeometry(1, 0), glossy, cap);
    this.chunks = new ParticlePool(scene, new THREE.BoxGeometry(1, 1, 1), matte, Math.round(cap * 0.6));
    this.puffs = new ParticlePool(scene, new THREE.IcosahedronGeometry(1, 1), puff, Math.round(cap * 0.5));
    this.shakeAmt = 0;
  }
  update(dt) {
    this.blobs.update(dt); this.chunks.update(dt); this.puffs.update(dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
  }
  clear() { this.blobs.clear(); this.chunks.clear(); this.puffs.clear(); }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  n(count) { return Math.max(1, Math.round(count * this.scale)); }

  spray(pool, pos, count, { speed = 8, up = 4, spread = 1, life = 0.8, size = 0.15, colors, grav = 1, drag = 0.4, grow = 0, dir = null }) {
    const P = this[pool];
    for (let i = 0; i < this.n(count); i++) {
      let vx = rand(-1, 1) * spread, vy = rand(0.2, 1), vz = rand(-1, 1) * spread;
      if (dir) { vx += dir.x * 1.5; vy += dir.y * 1.5; vz += dir.z * 1.5; }
      const sp = speed * rand(0.4, 1.1);
      const col = colors[(Math.random() * colors.length) | 0];
      P.spawn(pos.x, pos.y, pos.z, vx * sp, vy * up + rand(0, up * 0.5), vz * sp, life * rand(0.6, 1.2),
        size * rand(0.6, 1.3), col, grav, drag, grow);
    }
  }

  burst(kind, pos, power = 1) {
    const P = PALETTE;
    switch (kind) {
      case 'tomato':
        this.spray('blobs', pos, 34 * power, { speed: 9 * power, up: 7, colors: P.tomato, size: 0.2, life: 0.9 });
        this.spray('blobs', pos, 14 * power, { speed: 6, up: 5, colors: P.seed, size: 0.07, life: 1.1 });
        this.spray('puffs', pos, 6, { speed: 2, up: 1.5, colors: [P.tomato[1]], size: 0.6, life: 0.4, grav: 0, grow: 1.5 });
        break;
      case 'ice':
        this.spray('chunks', pos, 26 * power, { speed: 8, up: 6, colors: P.ice, size: 0.18, life: 1.0 });
        this.spray('puffs', pos, 8, { speed: 3, up: 1, colors: P.steam, size: 0.5, life: 0.6, grav: -0.05, grow: 1.2 });
        break;
      case 'soda':
        this.spray('puffs', pos, 30 * power, { speed: 7 * power, up: 9, colors: P.foam, size: 0.55, life: 0.9, grav: 0.3, grow: 0.8 });
        this.spray('blobs', pos, 30 * power, { speed: 10 * power, up: 8, colors: P.soda, size: 0.16, life: 0.8 });
        break;
      case 'geyser':
        this.spray('puffs', pos, 30, { speed: 2, up: 16, spread: 0.3, colors: P.foam, size: 0.5, life: 0.9, grav: 0.8, grow: 0.8 });
        this.spray('blobs', pos, 20, { speed: 3, up: 14, spread: 0.4, colors: P.soda, size: 0.14, life: 0.8 });
        break;
      case 'carrot':
        this.spray('chunks', pos, 14, { speed: 7, up: 5, colors: P.carrot, size: 0.14, life: 0.8 });
        break;
      case 'banana':
        this.spray('blobs', pos, 12, { speed: 5, up: 4, colors: P.banana, size: 0.14, life: 0.7 });
        break;
      case 'cheese':
        this.spray('chunks', pos, 22 * power, { speed: 7, up: 6, colors: P.cheese, size: 0.28, life: 1.1 });
        break;
      case 'steam':
        this.spray('puffs', pos, 26, { speed: 2.5, up: 3, colors: P.steam, size: 1.0, life: 2.2, grav: -0.12, drag: 1, grow: 2 });
        break;
      case 'honey':
        this.spray('blobs', pos, 3, { speed: 1, up: 3, colors: P.honey, size: 0.12, life: 0.7, grav: 0.4 });
        break;
      case 'ember':
        this.spray('blobs', pos, 2, { speed: 1.5, up: 3, colors: P.ember, size: 0.08, life: 0.7, grav: -0.3 });
        break;
      case 'water':
        this.spray('blobs', pos, 16, { speed: 5, up: 6, colors: P.water, size: 0.13, life: 0.6 });
        break;
      case 'dust':
        this.spray('puffs', pos, 10 * power, { speed: 4, up: 0.5, colors: P.dust, size: 0.35, life: 0.6, grav: 0, drag: 3, grow: 1.5 });
        break;
      case 'crumb':
        this.spray('chunks', pos, 16, { speed: 6, up: 5, colors: P.crumb, size: 0.18, life: 1 });
        break;
      case 'splat-out': {
        const cols = [C('#ffffff'), C('#ffd447'), C('#8fd8f0'), C('#f0503a'), C('#6ed3b0')];
        this.spray('chunks', pos, 60, { speed: 12, up: 12, colors: cols, size: 0.22, life: 1.8, grav: 0.6, drag: 1.2 });
        this.spray('puffs', pos, 12, { speed: 4, up: 3, colors: P.foam, size: 0.9, life: 0.8, grav: 0, grow: 1.5 });
        break;
      }
      case 'grape':
        this.spray('blobs', pos, 14 * power, { speed: 5, up: 4, colors: P.grape, size: 0.12, life: 0.6 });
        break;
      case 'melon':
        this.spray('blobs', pos, 40 * power, { speed: 10 * power, up: 8, colors: P.melon, size: 0.22, life: 1 });
        this.spray('chunks', pos, 10 * power, { speed: 8, up: 7, colors: [P.melon[2]], size: 0.25, life: 1.2 });
        break;
      case 'pine':
        this.spray('chunks', pos, 40, { speed: 12, up: 8, colors: P.pine, size: 0.2, life: 1 });
        this.spray('puffs', pos, 10, { speed: 3, up: 2, colors: [P.pine[0]], size: 0.8, life: 0.5, grav: 0, grow: 1.5 });
        break;
      case 'jelly':
        this.spray('blobs', pos, 22, { speed: 6, up: 6, colors: P.jelly, size: 0.18, life: 0.8 });
        break;
      case 'fire':
        this.spray('blobs', pos, 20, { speed: 5, up: 6, colors: P.fire, size: 0.14, life: 0.6, grav: -0.2 });
        this.spray('puffs', pos, 6, { speed: 2, up: 3, colors: [P.fire[1]], size: 0.6, life: 0.4, grav: -0.1, grow: 1.4 });
        break;
      case 'bubbles':
        this.spray('puffs', pos, 2, { speed: 0.8, up: 2, colors: P.foam, size: 0.5, life: 1.4, grav: -0.1, drag: 0.8 });
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Sound: everything is synthesized with WebAudio, no files needed.
export class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.active = 0;
    this.listener = new THREE.Vector3(); this.listenerRight = new THREE.Vector3(1, 0, 0);
    this.volume = 0.7;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  setListener(pos, right) { this.listener.copy(pos); this.listenerRight.copy(right); }

  // Returns an output node positioned in stereo space, or null if culled.
  _out(pos, gain = 1, dur = 0.6) {
    if (!this.ctx || this.active > 28) return null;
    let g = gain, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      g *= 1 / (1 + d / 14);
      if (g < 0.02) return null;
      pan = clamp((dx * this.listenerRight.x + dz * this.listenerRight.z) / (d + 1), -0.9, 0.9);
    }
    const out = this.ctx.createGain();
    out.gain.value = g;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(this.master);
    this.active++;
    setTimeout(() => { this.active--; out.disconnect(); }, (dur + 0.1) * 1000);
    return out;
  }
  _noise(out, t0, dur, { type = 'lowpass', f0 = 1200, f1 = 300, q = 1, vol = 1 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.8, 1.2);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }
  _tone(out, t0, dur, { type = 'sine', f0 = 440, f1 = f0, vol = 0.5, attack = 0.005 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  play(name, pos = null, gain = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this._out(pos, gain, 1.6);
    if (!o) return;
    switch (name) {
      case 'splat':
        this._noise(o, t, 0.28, { f0: 2400, f1: 250, vol: 0.9 });
        this._tone(o, t, 0.16, { f0: 180, f1: 60, vol: 0.6 });
        break;
      case 'throw':
        this._noise(o, t, 0.22, { type: 'bandpass', f0: 500, f1: 2400, q: 1.4, vol: 0.5 });
        break;
      case 'crunch':
        for (let i = 0; i < 3; i++) this._noise(o, t + i * 0.035, 0.05, { type: 'highpass', f0: 2500, f1: 1500, vol: 0.8 });
        this._tone(o, t, 0.1, { f0: 300, f1: 120, vol: 0.4 });
        break;
      case 'freeze':
        this._tone(o, t, 0.5, { type: 'triangle', f0: 1800, f1: 2600, vol: 0.25 });
        this._tone(o, t + 0.02, 0.4, { type: 'sine', f0: 2900, f1: 3300, vol: 0.15 });
        this._noise(o, t, 0.3, { type: 'highpass', f0: 6000, f1: 3000, vol: 0.4 });
        break;
      case 'shatter':
        for (let i = 0; i < 4; i++) this._tone(o, t + i * 0.02, 0.25, { type: 'triangle', f0: rand(2000, 4000), f1: rand(1500, 3000), vol: 0.18 });
        this._noise(o, t, 0.2, { type: 'highpass', f0: 5000, f1: 2500, vol: 0.6 });
        break;
      case 'boom':
        this._noise(o, t, 0.7, { f0: 1600, f1: 80, vol: 1 });
        this._tone(o, t, 0.5, { f0: 120, f1: 35, vol: 0.9 });
        break;
      case 'fizz':
        this._noise(o, t, 0.9, { type: 'highpass', f0: 3000, f1: 7000, vol: 0.45 });
        break;
      case 'slip':
        this._tone(o, t, 0.25, { type: 'sine', f0: 500, f1: 1400, vol: 0.35 });
        this._tone(o, t + 0.25, 0.35, { type: 'sine', f0: 1400, f1: 300, vol: 0.35 });
        break;
      case 'boing':
        this._tone(o, t, 0.4, { type: 'sine', f0: 160, f1: 520, vol: 0.5 });
        break;
      case 'thud':
        this._tone(o, t, 0.2, { f0: 110, f1: 45, vol: 0.7 });
        this._noise(o, t, 0.12, { f0: 800, f1: 100, vol: 0.5 });
        break;
      case 'whirr':
        this._noise(o, t, 0.35, { type: 'bandpass', f0: 900, f1: 700, q: 6, vol: 0.4 });
        break;
      case 'hit':
        this._tone(o, t, 0.07, { type: 'square', f0: 1300, f1: 1100, vol: 0.12 });
        break;
      case 'headshot':
        this._tone(o, t, 0.12, { type: 'triangle', f0: 1760, f1: 1760, vol: 0.3 });
        this._tone(o, t + 0.07, 0.2, { type: 'triangle', f0: 2640, f1: 2640, vol: 0.25 });
        break;
      case 'eat':
        this._noise(o, t, 0.08, { type: 'highpass', f0: 2000, f1: 1000, vol: 0.6 });
        this._noise(o, t + 0.15, 0.08, { type: 'highpass', f0: 2000, f1: 1000, vol: 0.6 });
        this._tone(o, t + 0.3, 0.3, { f0: 520, f1: 880, vol: 0.25 });
        break;
      case 'pickup':
        this._tone(o, t, 0.12, { type: 'triangle', f0: 660, f1: 990, vol: 0.25 });
        break;
      case 'sizzle':
        this._noise(o, t, 0.6, { type: 'highpass', f0: 4000, f1: 5000, vol: 0.35 });
        break;
      case 'glaze':
        this._tone(o, t, 0.25, { type: 'sine', f0: 880, f1: 1320, vol: 0.2 });
        break;
      case 'charge':
        this._tone(o, t, 0.12, { type: 'sine', f0: 1500, f1: 1500, vol: 0.12 });
        break;
      case 'splatout':
        this._tone(o, t, 0.5, { type: 'sawtooth', f0: 600, f1: 90, vol: 0.25 });
        this._noise(o, t, 0.5, { f0: 3000, f1: 200, vol: 0.8 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(o, t + i * 0.12, 0.35, { type: 'triangle', f0: f, f1: f, vol: 0.3 }));
        break;
      case 'tide':
        this._noise(o, t, 1.4, { f0: 500, f1: 900, vol: 0.4 });
        break;
      case 'dodge':
        this._noise(o, t, 0.15, { type: 'bandpass', f0: 1500, f1: 600, q: 1, vol: 0.4 });
        break;
      case 'shield':
        this._tone(o, t, 0.12, { f0: 240, f1: 180, vol: 0.4 });
        this._noise(o, t, 0.1, { f0: 1500, f1: 400, vol: 0.5 });
        break;
    }
  }
}
