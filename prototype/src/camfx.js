// Camera feel (0.86): everything that moves the view for a moment, layered onto the camera once it is
// placed. None of it moves your aim: shots go where the camera pointed before any of this (the game keeps
// that pose in Game.camBase, and Game._playerAim reads it).
//  - Shake: hits, blasts and big moves add "trauma" (fx.shake), which drains away; the view shakes with
//    it smoothly (a few layered waves: a little turn, a little roll, a little move), not in random jumps.
//  - Kicks, on springs that overshoot a touch and settle: a throw lunges the view after the food (a
//    cucumber rocket or a carrot shot snaps it back instead), a hit taken knocks it away from whoever
//    threw, a hard landing dips it, a blast pushes it, a hit you land thumps the lens and a splat you land
//    punches it in.
//  - Leans: a roll into a strafe and into a dash, and the lens opening up when you fly fast.
//  - (0.87) Speed: the lens widens from a sprint on, and more the faster you go; cartoon speed lines stream
//    past the edges of the view at high speed (a dash, a long fall, a jump pad, knocked flying), out from
//    the point you're heading for (in toward it when you fly backwards; up the screen as you fall), the
//    middle of the view kept clear; at the very fastest the view hums a little.
//  - (0.87) The dash: the lens punches out and settles, the view lags behind the burst and catches up,
//    rolls into a sideways dash and tips into a forward one, with a burst of speed lines.
// Settings: Camera effects Full / Reduced / Off (scales all of it; Off is a still camera).
import * as THREE from 'three';
import { clamp, damp } from './core.js';

const DEG = Math.PI / 180;

// A damped spring at rest at 0. kick(peak): pushed so its first swing reaches about `peak`.
class Spring {
  constructor(k, zeta) {
    this.k = k; this.c = 2 * Math.sqrt(k) * zeta; this.x = 0; this.v = 0;
    const w = Math.sqrt(k), wd = w * Math.sqrt(1 - zeta * zeta), t = Math.atan2(wd, zeta * w) / wd;
    this.gain = Math.exp(-zeta * w * t) * Math.sin(wd * t) / wd; // (peak reached per unit of push)
  }
  kick(peak) { this.v += peak / this.gain; }
  step(dt) { // small fixed steps: steady at any frame rate
    for (let t = dt; t > 1e-6; t -= 1 / 120) {
      const h = Math.min(t, 1 / 120);
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.x) < 1e-5 && Math.abs(this.v) < 1e-4) this.x = this.v = 0;
  }
  reset() { this.x = this.v = 0; }
}

// How hard each food's throw moves the view: heavy and charged throws more, rapid fire barely.
const HEFT = { tomato: 0.55, banana: 0.45, peel: 0.15, carrot: 0.8, ice: 0.4, soda: 0.6, cheese: 0.6, blueberry: 0.1, grapes: 0.45,
  chili: 0.45, cookie: 0.5, watermelon: 1, pineapple: 0.7, cucumber: 1.25, jelly: 0.4 };
const SNAP = new Set(['cucumber', 'carrot']); // a launch or a shot: the view snaps back, not forward

// smooth shake: three waves per axis at uneven rates (Hz) and offsets
const wave = (t, s) => Math.sin(t * 56.5 + s) * 0.55 + Math.sin(t * 96.1 + s * 2.3) * 0.3 + Math.sin(t * 148.9 + s * 4.1) * 0.15;

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _sz = new THREE.Vector2();
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// (0.87) Cartoon speed lines over the finished frame: one quad, one small shader, drawn only while you're fast.
// Streaks in thin slots around a focus (the point on screen you're heading for), each running out from it
// (or in toward it) at its own pace, tapering to its tail; white with a soft dark edge, so they read on the
// bright kitchen and on dark corners alike; a light vignette with them; the middle of the view stays clear.
class SpeedLines {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.u = { uT: { value: 0 }, uAmt: { value: 0 }, uAspect: { value: 1 }, uFocus: { value: new THREE.Vector2() }, uDir: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform float uT, uAmt, uAspect, uDir; uniform vec2 uFocus; varying vec2 vUv;
        float h(float n) { return fract(sin(n * 91.345 + 3.17) * 47453.5453); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0; p.x *= uAspect;            // the screen: y -1..1, x -aspect..aspect
          vec2 d = p - uFocus;
          float r = length(d);
          float s = (atan(d.y, d.x) / 6.2831853 + 0.5) * 120.0;  // 120 thin slots around the focus
          float id = floor(s), f = fract(s) - 0.5;
          float r1 = h(id), r2 = h(id + 13.7), r3 = h(id + 29.1), r4 = h(id + 47.3);
          float on = step(r1, 0.22 + 0.48 * uAmt);              // more slots carry a streak the faster you go
          float far = length(vec2(uAspect, 1.0)) + length(uFocus) + 0.8;
          float ph = fract(uT * (0.8 + 1.5 * r2) * uDir + r3);    // each streak at its own pace
          float head = mix(0.15, far, ph);
          float len = (0.3 + 0.55 * r4) * (0.55 + 0.65 * uAmt);
          float along = (uDir > 0.0 ? head - r : r - head) / len; // 0 at its head, 1 at its tail
          float body = smoothstep(0.0, 0.06, along) * (1.0 - smoothstep(0.25, 1.0, along));
          float hw = (0.0016 + 0.0034 * r2) * (0.7 + r) * (1.0 - 0.6 * clamp(along, 0.0, 1.0)); // half width, tapering
          float across = abs(f) * (6.2831853 / 120.0) * r / hw;
          float aa = min(fwidth(across), 0.6);
          float core = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, across);
          float edge = 1.0 - smoothstep(2.4 - aa, 2.4 + aa, across);
          float vis = smoothstep(0.32, 0.9, length(p)) * smoothstep(0.05, 0.35, r); // the middle stays clear
          float k = on * body * vis * uAmt;
          float white = core * k * 0.7;
          float dark = max(edge - core, 0.0) * k * 0.2 + smoothstep(0.8, 1.9, length(p)) * 0.22 * uAmt;
          float a = 1.0 - (1.0 - white) * (1.0 - dark);
          gl_FragColor = vec4(vec3(a > 0.001 ? white / a : 0.0), a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  draw(renderer, amt, t, focus, dir) {
    renderer.getDrawingBufferSize(_sz);
    const u = this.u;
    u.uAmt.value = amt; u.uT.value = t; u.uDir.value = dir; u.uFocus.value.copy(focus); u.uAspect.value = _sz.x / Math.max(1, _sz.y);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
}

export class CamFX {
  constructor(game) {
    this.g = game;
    this.level = 1;
    this.pitch = new Spring(170, 0.55); // radians, + tips the view up
    this.yaw = new Spring(170, 0.6);    // radians, + turns it left
    this.roll = new Spring(140, 0.5);   // radians, + rolls it left (counter-clockwise)
    this.back = new Spring(190, 0.62);  // metres along the view, + backward
    this.dip = new Spring(110, 0.55);   // metres, + down
    this.fov = new Spring(160, 0.6);    // degrees
    this.side = new Spring(150, 0.6);   // metres across the view, + right (0.87: the dash's lag)
    this.springs = [this.pitch, this.yaw, this.roll, this.back, this.dip, this.fov, this.side];
    this.t = 0; this.lean = 0; this.speedFov = 0;
    this.wasGround = true; this.fallV = 0; this.dashing = false;
    // (0.87) speed: lines (0..1), their clock, where they stream from, which way; the top-speed hum
    this.lines = new SpeedLines();
    this.lineAmt = 0; this.lineT = 0; this.focus = new THREE.Vector2(); this.dir = 1; this.hum = 0;
  }
  reset() {
    for (const s of this.springs) s.reset();
    this.lean = 0; this.speedFov = 0; this.wasGround = true; this.fallV = 0; this.dashing = false;
    this.lineAmt = 0; this.hum = 0; this.focus.set(0, 0); this.dir = 1;
  }
  // (0.87) The dash: the lens punches out (and settles past where it was), the view lags behind the burst and
  // catches up, rolls into a sideways dash, tips into a forward one; a burst of speed lines; a jolt.
  dashKick(ahead, side) {
    const fp = this.g.firstPerson;
    this.fov.kick(fp ? 10 : 8.5);
    this.back.kick(ahead * (fp ? 0.36 : 0.55)); // (first person moves the eyes 0.45 of it: 16 cm)
    this.side.kick(-side * (fp ? 0.12 : 0.45));
    this.roll.kick(-side * 3.6 * DEG - 0.3 * DEG);
    this.pitch.kick(-Math.max(0, ahead) * 1.4 * DEG);
    this.lineAmt = Math.max(this.lineAmt, 0.75);
    this.g.fx.shake(0.07);
  }
  // (0.87) Draw the speed lines over the finished frame (main.js, after the scene is drawn).
  drawLines(renderer) {
    const g = this.g, a = this.lineAmt * this.level;
    if (a < 0.01 || g.state === 'menu' || g.highlights.playing || !g.player?.alive) return;
    this.lines.draw(renderer, Math.min(1, a), this.lineT, this.focus, this.dir);
  }

  // ---- what kicks it (the game calls these for the player's own moments)
  throwKick(foodId, c, rapid) {
    const h = (HEFT[foodId] ?? 0.5) * (rapid ? 0.25 : 0.45 + 0.55 * clamp(c, 0, 1));
    if (SNAP.has(foodId)) { // a rocket or a shot: knocked back, tipped up
      this.pitch.kick(2.6 * DEG * h); this.back.kick(0.16 * h); this.fov.kick(1.6 * h);
    } else { // a throw: the view follows the food out a little
      this.pitch.kick(-1.1 * DEG * h); this.back.kick(-0.13 * h); this.fov.kick(2.2 * h);
      this.roll.kick((Math.random() < 0.5 ? -0.5 : 0.5) * DEG * h);
    }
  }
  hitConfirm(amt, head) { // your hit landed: a thump of the lens
    const k = clamp(amt / 30, 0.25, 1.4) * (head ? 1.5 : 1);
    this.fov.kick(-1.4 * k); this.pitch.kick(0.35 * DEG * k);
  }
  splat(last) { // you splatted someone: a punch in and a roll
    const k = last ? 1.5 : 1;
    this.fov.kick(-5 * k); this.roll.kick((Math.random() < 0.5 ? -1 : 1) * 1.6 * DEG * k); this.pitch.kick(0.8 * DEG * k);
    this.g.fx.shake(0.12 * k);
  }
  hurt(amt, from) { // a hit taken: knocked away from where it came from
    const g = this.g, p = g.player, k = clamp(amt / 30, 0.2, 1.3);
    let side = 0, front = 1;
    if (from && p) {
      _v.subVectors(from, p.pos).setY(0);
      if (_v.lengthSq() > 1e-4) {
        _v.normalize();
        const yaw = g.input.yaw;
        side = _v.dot(_r.set(Math.cos(yaw), 0, -Math.sin(yaw))); // + from the right
        front = _v.dot(_f.set(-Math.sin(yaw), 0, -Math.cos(yaw)));
      }
    }
    this.roll.kick(side * 3.2 * DEG * k);            // from the right: the head rolls left... and back
    this.yaw.kick(side * 1.6 * DEG * k);
    this.pitch.kick((front >= 0 ? 1.4 : -0.9) * DEG * k); // from the front: knocked up a little
    this.back.kick((front >= 0 ? 0.1 : -0.06) * k);
    this.fov.kick(2 * k);
  }
  blast(point, strength) { // an explosion nearby: pushed away from it
    const g = this.g, cam = g.camera;
    _v.subVectors(cam.position, point);
    const d = _v.length();
    if (d < 1e-3 || strength <= 0) return;
    _v.divideScalar(d);
    const yaw = g.input.yaw;
    const side = _v.dot(_r.set(Math.cos(yaw), 0, -Math.sin(yaw))), front = _v.dot(_f.set(-Math.sin(yaw), 0, -Math.cos(yaw)));
    this.roll.kick(-side * 2.4 * DEG * strength);
    this.pitch.kick((0.6 + Math.max(0, -front)) * 1.2 * DEG * strength);
    this.back.kick(-front * 0.18 * strength);
    this.fov.kick(2.5 * strength);
  }

  // ---- every frame: springs, leans, landings; then layered onto the placed camera
  update(dt, live) {
    const g = this.g, p = g.player;
    this.t += dt;
    for (const s of this.springs) s.step(dt);
    let leanTo = 0, fast = 0, lineTo = 0, humTo = 0;
    if (live && p && p.alive) {
      // a hard landing dips the view (the further the fall, the deeper)
      if (!p.onGround) this.fallV = Math.min(this.fallV, p.vel.y);
      if (p.onGround && !this.wasGround) {
        const k = clamp((-this.fallV - 10) / 20, 0, 1); // (a jump lands at 14 m/s: a small dip; a drop from the sky: the full one)
        if (k > 0) { this.dip.kick(0.32 * k); this.pitch.kick(-1.3 * DEG * k); }
        this.fallV = 0;
      }
      if (p.onGround) this.fallV = 0;
      this.wasGround = p.onGround;
      // a dash: a roll into it and a punch out
      const yaw = g.input.yaw, right = _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const lat = p.vel.x * right.x + p.vel.z * right.z;
      if (p.dashT > 0 && !this.dashing) {
        const hs = Math.max(1, Math.hypot(p.vel.x, p.vel.z));
        this.dashKick((p.vel.x * -Math.sin(yaw) + p.vel.z * -Math.cos(yaw)) / hs, lat / hs);
      }
      this.dashing = p.dashT > 0;
      // leaning into a strafe
      leanTo = -clamp(lat / 9, -1, 1) * (g.firstPerson ? 1.1 : 0.6) * DEG;
      // (0.87) speed: the lens widens from a sprint on (5 degrees at a sprint), up to 13 when you really fly
      // (a dash has its own punch); the lines from about twice a sprint; the hum near the top
      if (!g.paused) {
        const hs = Math.hypot(p.vel.x, p.vel.z), s3 = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
        if (p.dashT <= 0) fast = 5 * smooth(6.2, 8.8, hs) + 8 * smooth(11, 30, s3);
        lineTo = smooth(12.5, 26, s3);
        humTo = smooth(17, 34, s3);
        this._focus(p.vel, s3, dt);
      }
    } else { this.wasGround = true; this.fallV = 0; this.dashing = false; }
    this.lean = damp(this.lean, leanTo, 7, dt);
    this.speedFov = damp(this.speedFov, fast, fast > this.speedFov ? 4 : 2.5, dt);
    this.lineAmt = damp(this.lineAmt, lineTo, lineTo > this.lineAmt ? 14 : 3.5, dt);
    this.hum = damp(this.hum, humTo, 5, dt);
    this.lineT += dt * (0.7 + 1.3 * this.lineAmt);
  }
  // Where the speed lines stream from: the point on screen you're heading for; flying backwards, they
  // stream in toward the point you're leaving (straight sideways or falling: from just off the screen's edge).
  _focus(vel, s, dt) {
    if (s < 0.5) return;
    const g = this.g, cam = g.camera;
    _v.copy(vel).divideScalar(s).applyQuaternion(_qi.copy(g.camBase.quaternion).invert()); // camera space: -z ahead
    let x = _v.x, y = _v.y, z = -_v.z, dir = this.dir;
    if (z > 0.12) dir = 1; else if (z < -0.12) dir = -1; // (a little stickiness either side of straight sideways)
    if (dir < 0) { x = -x; y = -y; z = -z; }
    const k = 1 / Math.tan((cam.fov * DEG) / 2), zz = Math.max(z, 0.06);
    let fx = (x / zz) * k, fy = (y / zz) * k;
    const m = Math.max(Math.abs(fx) / (cam.aspect * 1.2), Math.abs(fy) / 1.2, 1);
    fx /= m; fy /= m;
    if (dir !== this.dir) { this.dir = dir; this.focus.set(fx, fy); }
    else this.focus.set(damp(this.focus.x, fx, 9, dt), damp(this.focus.y, fy, 9, dt));
  }
  // Layer it all onto the camera (already placed for the frame); returns degrees to add to the lens.
  apply(cam, shakeAmt, fp) {
    const L = this.level;
    if (L <= 0) return 0;
    const tr = Math.min(1, shakeAmt), s = Math.pow(tr, 1.5) * L, t = this.t;
    const turn = fp ? 1 : 0.8; // (third person: the camera is further back, so turns read bigger)
    const hum = this.hum * L; // (0.87) at the very fastest the view hums a little
    const pitch = (this.pitch.x * L + wave(t, 1.3) * 2.4 * DEG * s + wave(t * 0.55, 3.3) * 0.3 * DEG * hum) * turn;
    const yaw = (this.yaw.x * L + wave(t, 7.9) * 2.4 * DEG * s) * turn;
    const roll = this.roll.x * L + this.lean * L + wave(t, 4.2) * 3.2 * DEG * s + wave(t * 0.55, 8.8) * 0.45 * DEG * hum;
    _e.set(pitch, yaw, roll, 'YXZ');
    cam.quaternion.multiply(_q.setFromEuler(_e));
    const m = fp ? 0.45 : 1; // (first person: the eyes move less, they're in the head)
    _v.set(wave(t, 2.7) * 0.12 * s * m + this.side.x * L, (wave(t, 5.6) * 0.12 * s) * m, this.back.x * L * m).applyQuaternion(cam.quaternion);
    _v.y -= this.dip.x * L * (fp ? 1 : 0.7);
    cam.position.add(_v);
    return (this.fov.x + this.speedFov) * L;
  }
}
