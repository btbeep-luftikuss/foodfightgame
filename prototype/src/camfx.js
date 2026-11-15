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
    this.springs = [this.pitch, this.yaw, this.roll, this.back, this.dip, this.fov];
    this.t = 0; this.lean = 0; this.speedFov = 0;
    this.wasGround = true; this.fallV = 0; this.dashing = false;
  }
  reset() {
    for (const s of this.springs) s.reset();
    this.lean = 0; this.speedFov = 0; this.wasGround = true; this.fallV = 0; this.dashing = false;
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
    let leanTo = 0, fast = 0;
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
      if (p.dashT > 0 && !this.dashing) { this.roll.kick(-clamp(lat / 20, -1, 1) * 2.2 * DEG - 0.4 * DEG); if (!g.firstPerson) this.fov.kick(3); } // (first person opens up 8 degrees already)
      this.dashing = p.dashT > 0;
      // leaning into a strafe; the lens opens up at speed (knocked flying, a jump pad, a Mega Jump)
      leanTo = -clamp(lat / 9, -1, 1) * (g.firstPerson ? 1.1 : 0.6) * DEG;
      const speed = p.dashT > 0 ? 0 : Math.hypot(p.vel.x, p.vel.y * 0.6, p.vel.z); // (a dash has its own)
      fast = clamp((speed - 11) / 16, 0, 1) * 7;
    } else { this.wasGround = true; this.fallV = 0; this.dashing = false; }
    this.lean = damp(this.lean, leanTo, 7, dt);
    this.speedFov = damp(this.speedFov, fast, fast > this.speedFov ? 5 : 2.5, dt);
  }
  // Layer it all onto the camera (already placed for the frame); returns degrees to add to the lens.
  apply(cam, shakeAmt, fp) {
    const L = this.level;
    if (L <= 0) return 0;
    const tr = Math.min(1, shakeAmt), s = Math.pow(tr, 1.5) * L, t = this.t;
    const turn = fp ? 1 : 0.8; // (third person: the camera is further back, so turns read bigger)
    const pitch = (this.pitch.x * L + wave(t, 1.3) * 2.4 * DEG * s) * turn;
    const yaw = (this.yaw.x * L + wave(t, 7.9) * 2.4 * DEG * s) * turn;
    const roll = this.roll.x * L + this.lean * L + wave(t, 4.2) * 3.2 * DEG * s;
    _e.set(pitch, yaw, roll, 'YXZ');
    cam.quaternion.multiply(_q.setFromEuler(_e));
    const m = fp ? 0.45 : 1; // (first person: the eyes move less, they're in the head)
    _v.set(wave(t, 2.7) * 0.12 * s * m, (wave(t, 5.6) * 0.12 * s) * m, this.back.x * L * m).applyQuaternion(cam.quaternion);
    _v.y -= this.dip.x * L * (fp ? 1 : 0.7);
    cam.position.add(_v);
    return (this.fov.x + this.speedFov) * L;
  }
}
