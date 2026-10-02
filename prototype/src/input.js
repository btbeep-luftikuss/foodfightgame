// Player input: keyboard + mouse (pointer lock with a drag-free fallback) and touch controls.
import { clamp, forwardOf, rightOf } from './core.js';
import * as THREE from 'three';

const _f = new THREE.Vector3(), _r = new THREE.Vector3();

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0; this.pitch = -0.12;
    this.sens = 0.0024;
    this.lmb = false; this.rmbPressed = false;
    this.pressed = { jump: false, dodge: false, alt: false, sniff: false, view: false };
    this.slot = -1; this.cycle = 0; this.uslot = -1; this.ucycle = 0;
    this.locked = false;
    this.lockFails = 0; // failed lock attempts since the mouse was last locked
    this.wantLock = null; // set by main.js: is the game in a state where the mouse should be locked?
    this.enabled = false;
    this.touch = { active: false, moveId: null, moveOrigin: null, move: { x: 0, y: 0 }, lookId: null, lookLast: null, fire: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.pressed.jump = true;
      if (e.code === 'KeyC' || e.code === 'KeyV') this.pressed.dodge = true;
      if (e.code === 'KeyQ' || e.code === 'KeyF') this.pressed.alt = true;
      if (e.code === 'KeyB' || e.code === 'KeyE') this.pressed.sniff = true;
      if (e.code === 'KeyV') this.pressed.view = true;
      if (/^Digit[1-5]$/.test(e.code)) this.slot = Number(e.code.slice(5)) - 1;
      if (/^Digit[6-8]$/.test(e.code)) this.uslot = Number(e.code.slice(5)) - 6;
      if (e.code === 'KeyR') this.ucycle = 1;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouchEvent) return;
      if (!this.locked) {
        // The first click only grabs the mouse. If locking keeps failing (some app views don't
        // allow it), clicks still throw, and every click tries to lock again.
        const firstTry = this.lockFails === 0;
        this.requestLock();
        if (firstTry) return;
      }
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.pressed.alt = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled || this.isTouchEvent) return;
      // Without pointer lock (some embedded views refuse it) the camera still follows mouse movement.
      this.look(e.movementX || 0, e.movementY || 0, this.sens * this.zoomSens);
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.cycle = e.deltaY > 0 ? 1 : -1;
    }, { passive: false });
    document.addEventListener('pointerlockerror', () => { const f = this._legacyFail; this._legacyFail = null; f?.(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      this.onLockChange?.(this.locked);
    });
    this.zoomSens = 1;
  }

  // Lock the mouse to the game. Never gives up for good: a refused request (for example within
  // about a second of pressing Esc, which Chrome blocks) is retried once that second has passed
  // when `retry` is set, and the next click on the game tries again anyway.
  requestLock(retry = false) {
    if (this.locked) return;
    const fail = () => {
      this.lockFails++;
      if (retry) setTimeout(() => { if (!this.locked && this.enabled && (this.wantLock?.() ?? true)) this.requestLock(false); }, 1150);
    };
    try {
      if (!this.canvas.requestPointerLock) { fail(); return; }
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.then === 'function') r.catch(fail);
      else this._legacyFail = fail; // browsers without the promise report through 'pointerlockerror'
    } catch { fail(); /* pointer lock unavailable: the fallback mouse look still works */ }
  }
  exitLock() { try { document.exitPointerLock?.(); } catch { /* ignore */ } }

  look(dx, dy, s) {
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.25, 1.1);
  }

  // Touch: left half = floating joystick, right half = look; buttons are wired by the HUD.
  bindTouch(el) {
    this.isTouchEvent = false;
    const onStart = (e) => {
      if (!this.enabled) return;
      this.isTouchEvent = true;
      // Taps on menus and overlay buttons (death screen, pause) must stay normal taps,
      // so they are neither steering nor cancelled.
      const ui = (t) => t.target.closest && t.target.closest('.overlay, .menu-panel, select, a, button:not([data-touch-btn])');
      if ([...e.changedTouches].every(ui)) return;
      for (const t of e.changedTouches) {
        if (ui(t) || (t.target.closest && t.target.closest('[data-touch-btn]'))) continue;
        if (t.clientX < innerWidth * 0.45 && this.touch.moveId === null) {
          this.touch.moveId = t.identifier; this.touch.moveOrigin = { x: t.clientX, y: t.clientY };
          this.onStick?.('start', t.clientX, t.clientY);
        } else if (this.touch.lookId === null) {
          this.touch.lookId = t.identifier; this.touch.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      let steering = false; // only swallow drags that move or aim the Titan; menus must still scroll
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId || t.identifier === this.touch.lookId) steering = true;
        if (t.identifier === this.touch.moveId) {
          const dx = t.clientX - this.touch.moveOrigin.x, dy = t.clientY - this.touch.moveOrigin.y;
          const l = Math.hypot(dx, dy), m = Math.min(l, 60) / 60;
          this.touch.move.x = l ? (dx / l) * m : 0; this.touch.move.y = l ? (dy / l) * m : 0;
          this.onStick?.('move', this.touch.moveOrigin.x + (l ? dx / l : 0) * Math.min(l, 60), this.touch.moveOrigin.y + (l ? dy / l : 0) * Math.min(l, 60));
        } else if (t.identifier === this.touch.lookId) {
          this.look(t.clientX - this.touch.lookLast.x, t.clientY - this.touch.lookLast.y, 0.0055 * this.zoomSens);
          this.touch.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      if (steering) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.moveId) { this.touch.moveId = null; this.touch.move.x = this.touch.move.y = 0; this.onStick?.('end'); }
        if (t.identifier === this.touch.lookId) this.touch.lookId = null;
      }
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
  }

  // Build this frame's intent. Movement is relative to the camera yaw.
  intent() {
    let fx = 0, sx = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fx += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) sx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1;
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.touch.moveId !== null) {
      fx = -this.touch.move.y; sx = this.touch.move.x;
      sprint = Math.hypot(fx, sx) > 0.92;
    }
    forwardOf(this.yaw, _f); rightOf(this.yaw, _r);
    let mx = _f.x * fx + _r.x * sx, mz = _f.z * fx + _r.z * sx;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const it = {
      moveX: mx, moveZ: mz, sprint,
      jump: this.pressed.jump, dodge: this.pressed.dodge, alt: this.pressed.alt, sniff: this.pressed.sniff, view: this.pressed.view,
      primary: this.lmb || this.touch.fire, slot: this.slot, cycle: this.cycle, uslot: this.uslot, ucycle: this.ucycle,
    };
    this.pressed.jump = this.pressed.dodge = this.pressed.alt = this.pressed.sniff = this.pressed.view = false;
    this.slot = -1; this.cycle = 0; this.uslot = -1; this.ucycle = 0;
    return it;
  }
}
