// Spectator mode (0.24): what you watch when you're out of the round, waiting for the next one, or
// only watching an online room.
//  - Cinematic: a director that looks for the hottest fight and frames it like a broadcast: two
//    Titans trading shots seen from the side (it never jumps the line between them), a chase
//    behind (or ahead of) a Titan on the move, and a wide shot of the arena when it's quiet, or now
//    and then anyway, so you know where everyone is. It cuts between shots.
//  - Overview: the wide shot only, slowly circling the Soap Tide.
//  - Follow: over the shoulder of one Titan you picked.
// The spectator HUD: a minimap (a top-down picture of the map taken once per map, the Soap Tide
// and every Titan still in), a bar with every Titan still in (pick one to follow), and a card for
// the Titan you follow: their splats, how many Titans are left and what they carry.
import * as THREE from 'three';
import { clamp, damp, lerp, angleLerp, forwardOf, rightOf, raycastWorld, hasLineOfSight, solidAt, groundHeight, FLOOR_Y, FLOOR_BOUNDS, colliders } from './core.js';
import { FOODS } from './foods.js';
import { MAX_HP } from './actors.js';
import { UTENSIL_BY_ID, utensilIcon } from './utensils.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const B = FLOOR_BOUNDS;
const ASPECT = (B.maxZ - B.minZ) / (B.maxX - B.minX); // the minimap's height / width
const SNAP_TOP = 21; // the map picture shows what's below this height: floor, counters, the table
const FLOOR_TINT = { kitchen: '#cbb497', backyard: '#5c9a3c' }; // the floor on the map picture, as one flat colour
const SHOT = { duel: [4.5, 11], chase: [3.5, 7], wide: [4, 8] }; // shortest and longest a shot runs (s)
const DUEL_FOV = 50;
const WIDE_EVERY = 30; // an overall view at least this often (s)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _d = new THREE.Vector3();
const _f = new THREE.Vector3(), _r = new THREE.Vector3();

export class Spectator {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.mode = 'cinematic';  // 'cinematic' | 'overview' | 'follow'
    this.target = null;       // the Titan you follow
    this.shot = null;         // the cinematic shot on screen
    this.cut = true;          // jump the camera (a new shot) instead of gliding it
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();   // the camera, smoothed
    this.tPos = new THREE.Vector3(); this.tLook = new THREE.Vector3(); // where it wants to be
    this.fYaw = 0; this.fPitch = 0; this.fY = 0;
    this.orbit = Math.random() * Math.PI * 2;
    this.lastWideAt = -99; this.nextLook = 0;
    this.focusNext = null;    // who to follow when spectating starts (whoever splatted you)
    this.mapImg = null; this.mapWorld = null;
    this.keys = new WeakMap(); this.serial = 0;
    this.sig = ''; this.cardHtml = ''; this.uiT = 0; this.mmT = 0; this.since = 0;
    this.onPlay = null; this.onLeave = null; // set by main.js
    this._bindUI();
  }

  reset() {
    this.mode = 'cinematic'; this.target = null; this.shot = null; this.focusNext = null;
    this.cut = true; this.sig = '';
  }

  // Every frame: are we watching? (out of the round in a game, or only watching)
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.el.hidden = !on;
    this.game.hud.el.classList.toggle('spectating', on);
    if (!on) { this.shot = null; return; }
    const f = this.focusNext;
    this.focusNext = null;
    if (f && f.alive) this.follow(f);
    else if (this.mode === 'follow') this.setMode('cinematic');
    this.cut = true; this.sig = ''; this.cardHtml = ''; this.since = performance.now();
  }

  // A new online round: a bot you followed is now someone else (players stay who they are).
  newRound() {
    if (this.mode === 'follow' && this.target && !this._human(this.target)) this.setMode('cinematic');
    this.shot = null; this.lastWideAt = -99;
  }

  follow(a) {
    this.mode = 'follow'; this.target = a; this.shot = null; this.cut = true;
    this.fYaw = a.yaw; this.fPitch = -0.1; this.fY = a.pos.y;
  }
  setMode(m) { this.mode = m; this.target = null; this.shot = null; this.cut = true; }

  // Titans still in, in a steady order: players first, then bots, by name.
  roster() {
    const g = this.game;
    return g.actors.filter((a) => a.alive)
      .sort((a, b) => (this._human(b) - this._human(a)) || a.name.localeCompare(b.name) || this._key(a) - this._key(b));
  }
  step(dir) {
    const list = this.roster();
    if (!list.length) return;
    const i = this.mode === 'follow' ? list.indexOf(this.target) : -1;
    this.follow(list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length]);
  }
  _human(a) { return (a.isRemote && !a.isBotProxy) || a === this.game.player ? 1 : 0; }
  _key(a) { let k = this.keys.get(a); if (!k) { k = ++this.serial; this.keys.set(a, k); } return k; }
  _in(a) { return !!a && a.alive && this.game.actors.includes(a); }

  // ------------------------------------------------------------------ cameras
  // The camera while spectating; returns the field of view.
  camera(dt, cam) {
    const g = this.game, now = g.time;
    if (this.mode === 'follow' && !this._in(this.target)) { // they're out: watch whoever got them
      const t = this.target, k = t?.koBy;
      if (this._in(k)) { this.follow(k); g.hud.toast(`${t.name} is out · watching ${k.name}`); } else this.setMode('cinematic');
    }
    const r = this.mode === 'follow' ? this._followCam(dt) : this.mode === 'overview' ? this._wideCam(dt) : this._direct(dt, now);
    this._inside(this.tPos);
    const gy = groundHeight(this.tPos.x, this.tPos.z, this.tPos.y + 0.2); // never skimming a surface
    if (this.tPos.y < gy + 1) this.tPos.y = gy + 1;
    if (this.cut) {
      this.pos.copy(this.tPos); this.look.copy(this.tLook); this.cut = false;
      cam.fov = r.fov; cam.updateProjectionMatrix();
    } else {
      this.pos.lerp(this.tPos, 1 - Math.exp(-r.rate * dt));
      this.look.lerp(this.tLook, 1 - Math.exp(-Math.max(r.rate, 5) * dt));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    return r.fov;
  }

  // Over the shoulder of the Titan you follow, looking where they look.
  _followCam(dt) {
    const a = this.target;
    this.fYaw = angleLerp(this.fYaw, a.yaw, 1 - Math.exp(-5 * dt));
    const pitch = a.isRemote ? (a.lookPitch || 0) : Math.asin(clamp(a.aimDir.y, -1, 1));
    this.fPitch = damp(this.fPitch, clamp(pitch * 0.6, -0.45, 0.3) - 0.1, 4, dt);
    this.fY = damp(this.fY, a.pos.y, 10, dt);
    const yaw = this.fYaw, p = this.fPitch;
    _f.set(-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p));
    rightOf(yaw, _r);
    const pivot = _m.set(a.pos.x, this.fY + 1.75, a.pos.z);
    this.tLook.copy(pivot).addScaledVector(_f, 12).addScaledVector(_r, 0.8);
    this.tPos.copy(pivot).addScaledVector(_f, -6).addScaledVector(_r, 1.1);
    this.tPos.y += 0.5;
    this._safe(_a.copy(pivot).addScaledVector(_r, 0.4), this.tPos);
    return { rate: 14, fov: 68 };
  }

  // High over the arena, slowly circling the Soap Tide (or the whole map), leaning toward the Titans.
  _wideCam(dt) {
    const g = this.game, T = g.tide;
    this.orbit += dt * 0.05;
    let cx = 0, cz = -5, r = 190;
    if (T.r < 220) { cx = T.x; cz = T.z; r = Math.max(10, T.r); }
    let n = 0, sx = 0, sy = 0, sz = 0;
    for (const a of g.actors) if (a.alive) { n++; sx += a.pos.x; sy += a.pos.y; sz += a.pos.z; }
    if (n) { cx = lerp(cx, sx / n, 0.35); cz = lerp(cz, sz / n, 0.35); }
    const ly = n ? sy / n : FLOOR_Y + 2, D = r * 1.15 + 20, b = g.world.camBox;
    this.tLook.set(cx, ly + 1, cz);
    // well inside the walls, so nothing on them (cabinets, the fridge) fills the foreground
    this.tPos.set(clamp(cx + Math.cos(this.orbit) * D, b.minX + 38, b.maxX - 38), Math.min(ly + D * 0.62 + 6, b.maxY - 8), clamp(cz + Math.sin(this.orbit) * D, b.minZ + 38, b.maxZ - 38));
    return { rate: 1.2, fov: 58 };
  }

  // The director: keeps the best shot on screen, cuts to a better one.
  _direct(dt, now) {
    let s = this.shot;
    if (s && s.kind !== 'wide' && !s.outAt && !(this._in(s.a) && (!s.b || this._in(s.b)))) s.outAt = now; // someone in the shot is out: hold on it
    const due = !s || now >= s.maxEnd || (s.outAt && now - s.outAt > 1.6) || (now >= s.minEnd && now >= this.nextLook);
    if (due) {
      this.nextLook = now + 0.8;
      const pick = this._pick(now);
      if (!s || s.outAt || now >= s.maxEnd || !this._same(s, pick)) this._start(pick, now);
      else s.minEnd = now + 1.5; // still the best thing to watch: stay on it
    }
    s = this.shot;
    if (s.kind === 'duel') return this._duelCam(s, dt, now);
    if (s.kind === 'chase') return this._chaseCam(s, dt);
    return this._wideCam(dt);
  }

  // How much is going on around a Titan: hits given and taken, throws, a charge, low health.
  _heat(a, now) {
    let h = 3 * Math.exp(-(now - (a.actionAt ?? -99)) / 2.5) + Math.exp(-(now - a.noiseAt) / 1.5);
    if (a.charging) h += 0.4;
    h += (1 - clamp(a.hp / (a.maxHp || MAX_HP), 0, 1)) * 0.4;
    return h + this._human(a) * 0.5; // players are who people come to watch
  }

  _pick(now) {
    const g = this.game, alive = g.actors.filter((a) => a.alive);
    if (!alive.length) return { kind: 'wide' };
    if (g.state === 'over') return alive.length === 1 ? { kind: 'chase', a: alive[0], variant: 'front' } : { kind: 'wide' }; // the winner
    if (g.state === 'drop') { // the drop: the whole arena, then ride along with someone gliding in
      const pool = alive.filter((a) => a.gliding);
      if (!pool.length || (this.shot?.kind !== 'wide' && this.shot)) return { kind: 'wide' };
      return now - (this.shot?.t0 ?? now) > 3.5 ? { kind: 'chase', a: pool[(Math.random() * pool.length) | 0] } : { kind: 'wide' };
    }
    const H = new Map(alive.map((a) => [a, this._heat(a, now)]));
    let pair = null, pairS = 0, hot = null, hotH = 0;
    for (const a of alive) {
      const ha = H.get(a);
      if (ha > hotH) { hotH = ha; hot = a; }
      if (ha < 0.5) continue;
      let b = this._in(a.foe) && now - (a.foeAt ?? -99) < 5 && a.foe.pos.distanceTo(a.pos) < 80 ? a.foe : null;
      if (!b) { let bd = 40; for (const o of alive) { const d = o === a ? 1e9 : o.pos.distanceTo(a.pos); if (d < bd) { bd = d; b = o; } } }
      if (!b) continue;
      const sc = ha + H.get(b) + 2 * Math.exp(-a.pos.distanceTo(b.pos) / 25);
      if (sc > pairS) { pairS = sc; pair = [a, b]; }
    }
    let pick = pair && pairS > 2.6 ? { kind: 'duel', a: pair[0], b: pair[1] } : hot && hotH > 1.3 ? { kind: 'chase', a: hot } : { kind: 'wide' };
    // an overall view every half minute, unless someone on screen is about to go down
    const cur = this.shot, finish = cur && cur.kind !== 'wide' && [cur.a, cur.b].some((x) => this._in(x) && x.hp < (x.maxHp || MAX_HP) * 0.3);
    if (pick.kind !== 'wide' && now - this.lastWideAt > WIDE_EVERY && !finish) pick = { kind: 'wide' };
    // the same fight seen from either side is the same fight
    const s = this.shot;
    if (pick.kind === 'duel' && s?.kind === 'duel' && s.a === pick.b && s.b === pick.a) pick = { kind: 'duel', a: s.a, b: s.b };
    return pick;
  }
  _same(s, p) { return s.kind === p.kind && s.a === p.a && s.b === p.b; }

  _start(pick, now) {
    const prev = this.shot, [mn, mx] = SHOT[pick.kind];
    const s = { ...pick, t0: now, minEnd: now + mn, maxEnd: now + mx, side: 1, ang: 0, lost: 0, yaw: pick.a?.yaw || 0 };
    if (s.kind === 'wide' && prev && prev.kind !== 'wide') s.maxEnd = now + 5.5; // a look around, then back to the action
    if (s.kind === 'chase' && !s.variant) s.variant = Math.random() < 0.35 ? 'front' : 'behind';
    if (s.kind === 'duel') this._frame(s, prev);
    if (s.kind === 'wide') this.lastWideAt = now;
    this.shot = s;
    this.cut = !(prev && prev.kind === 'wide' && s.kind === 'wide'); // a wide shot after a wide shot just keeps drifting
  }

  // Pick the side and angle of a duel shot that sees both Titans (on the same side as before, if it can).
  _frame(s, prev) {
    const again = prev && prev.kind === 'duel' && prev.a === s.a && prev.b === s.b;
    const keep = again ? prev.side : Math.random() < 0.5 ? 1 : -1;
    const tries = this.game.camera.aspect < 1 // a tall screen: more along the line between them
      ? [[keep, 0.95], [keep, -0.95], [keep, 0.5], [keep, -0.5], [-keep, 0.95], [-keep, -0.95], [keep, 0], [-keep, 0]]
      : [[keep, 0], [keep, 0.5], [keep, -0.5], [keep, 0.95], [keep, -0.95], [-keep, 0], [-keep, 0.5], [-keep, -0.5]];
    if (again) tries.unshift(tries.splice(1 + ((Math.random() * 4) | 0), 1)[0]); // a re-cut: a fresh angle first
    let best = tries[0], bestV = -9;
    for (const [side, ang] of tries) {
      s.side = side; s.ang = ang;
      this._duelPose(s, s.t0);
      this._inside(this.tPos);
      const v = this._sees(this.tPos, s.a) + this._sees(this.tPos, s.b) - (solidAt(this.tPos) ? 3 : 0);
      if (v > bestV) { bestV = v; best = [side, ang]; if (v >= 2) break; }
    }
    [s.side, s.ang] = best;
  }
  _sees(p, a) { return hasLineOfSight(p, a.center(_d)) ? 1 : 0; }

  // Side-on to the line between two Titans, just far enough back to frame both on this screen
  // (a tall phone screen looks more along the line between them), a little above their heads.
  _duelPose(s, now) {
    const ca = s.a.center(_a), cb = s.b.center(_b);
    _m.addVectors(ca, cb).multiplyScalar(0.5);
    let dx = cb.x - ca.x, dz = cb.z - ca.z;
    const flat = Math.hypot(dx, dz);
    if (flat < 0.3) { dx = 1; dz = 0; } else { dx /= flat; dz /= flat; }
    const sep = ca.distanceTo(cb);
    const ang = s.ang + Math.sin((now - s.t0) * 0.22) * 0.1; // a slow drift, like a dolly
    const px = -dz * s.side, pz = dx * s.side, c = Math.cos(ang), sn = Math.sin(ang);
    const tanH = Math.tan((DUEL_FOV / 2) * Math.PI / 180) * Math.max(0.45, this.game.camera.aspect);
    const dist = clamp((sep * Math.abs(c) * 0.5 + 3.2) / tanH, 7, 55), h = clamp(1.6 + sep * 0.14, 2, 10);
    // look a touch low, so the Titans sit above the caption at the bottom of the screen
    this.tLook.copy(_m); this.tLook.y += 0.2 - dist * Math.tan((DUEL_FOV / 2) * Math.PI / 180) * 0.18;
    this.tPos.set(_m.x + (px * c - pz * sn) * dist, _m.y + h, _m.z + (px * sn + pz * c) * dist);
  }
  _duelCam(s, dt, now) {
    this._duelPose(s, now);
    if (!s.outAt && this._sees(this.tPos, s.a) + this._sees(this.tPos, s.b) === 0) { // lost them both behind something
      s.lost += dt;
      if (s.lost > 1.2) { this._frame(s, s); this._duelPose(s, now); this.cut = true; s.lost = 0; }
    } else s.lost = 0;
    // anything in the way: come in front of it (measured from the nearer Titan, who stands in the open)
    const near = s.a.pos.distanceToSquared(this.tPos) < s.b.pos.distanceToSquared(this.tPos) ? s.a : s.b;
    this._safe(near.headPos(_a), this.tPos);
    return { rate: 2.6, fov: DUEL_FOV };
  }

  // Riding along behind a Titan (or just ahead of them, looking back), or behind a glider.
  _chaseCam(s, dt) {
    const a = s.a;
    s.yaw = angleLerp(s.yaw, a.yaw, 1 - Math.exp(-2.5 * dt));
    forwardOf(s.yaw, _f); rightOf(s.yaw, _r);
    if (a.gliding) {
      this.tPos.copy(a.pos).addScaledVector(_f, -10); this.tPos.y += 6;
      this.tLook.copy(a.pos).addScaledVector(_f, 4); this.tLook.y -= 3;
    } else if (s.variant === 'front') {
      this.tPos.copy(a.pos).addScaledVector(_f, 6.5).addScaledVector(_r, 2.6); this.tPos.y += 1.5;
      a.center(this.tLook);
    } else {
      this.tPos.copy(a.pos).addScaledVector(_f, -7.5).addScaledVector(_r, 2.2); this.tPos.y += 3.3;
      this.tLook.copy(a.pos).addScaledVector(_f, 6); this.tLook.y += 1.3;
    }
    this._safe(a.center(_a), this.tPos);
    return { rate: 4, fov: 62 };
  }

  // Keep the camera on this side of anything between it and what it looks at.
  _safe(from, to) {
    _d.subVectors(to, from);
    const len = _d.length();
    if (len < 0.01) return;
    _d.divideScalar(len);
    const hit = raycastWorld(from, _d, len + 0.4);
    if (hit < len + 0.4) to.copy(from).addScaledVector(_d, Math.max(0.6, hit - 0.45));
  }
  // ... and inside the room (under the kitchen ceiling, inside the backyard fence).
  _inside(p) {
    const b = this.game.world.camBox;
    p.x = clamp(p.x, b.minX, b.maxX); p.z = clamp(p.z, b.minZ, b.maxZ); p.y = clamp(p.y, FLOOR_Y + 0.7, b.maxY);
  }

  // What the camera is showing, in a few words.
  caption() {
    const s = this.shot;
    if (this.mode === 'overview') return 'Overview';
    if (!s || s.kind === 'wide') return 'Wide shot';
    if (s.kind === 'duel') return `${esc(s.a.name)} <em>vs</em> ${esc(s.b.name)}`;
    return this.game.state === 'over' ? `${esc(s.a.name)} takes the Last Bite` : `Following ${esc(s.a.name)}`;
  }

  // ------------------------------------------------------------------ HUD
  _bindUI() {
    this.el = $('spec');
    this.canvas = $('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.namesEl = $('spec-names');
    this.cardEl = $('spec-card');
    this.playBtn = $('spec-play');
    this.leaveBtn = $('spec-leave');
    $('spec-cams').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cam]');
      if (b) this.setMode(b.dataset.cam);
    });
    this.namesEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      const a = this.roster().find((x) => String(this._key(x)) === b.dataset.k);
      if (a) this.follow(a);
    });
    // tap or click a Titan on the minimap to follow them
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rc = this.canvas.getBoundingClientRect();
      const px = e.clientX - rc.left, py = e.clientY - rc.top, W = rc.width, H = rc.height;
      let best = null, bd = 16;
      for (const a of this.roster()) {
        const d = Math.hypot((a.pos.x - B.minX) / (B.maxX - B.minX) * W - px, (a.pos.z - B.minZ) / (B.maxZ - B.minZ) * H - py);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) this.follow(best);
    });
    this.playBtn.addEventListener('click', () => this.onPlay?.());
    this.leaveBtn.addEventListener('click', () => this.onLeave?.());
    addEventListener('keydown', (e) => {
      if (!this.active || e.repeat || e.target?.closest?.('input, select, textarea')) return;
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { this.step(e.code === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
      else if (e.code === 'KeyC') this.setMode('cinematic');
      else if (e.code === 'KeyO') this.setMode('overview');
    });
  }

  updateUI(dt) {
    const g = this.game;
    if (this.mapWorld !== g.world) this._snapshot();
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 1 / 30; this._minimap(); }
    this.uiT -= dt;
    if (this.uiT > 0) return;
    this.uiT = 0.2;
    this._names();
    this._card();
    // the action buttons say what they do here
    const online = g.online && g.net, ready = online && g.net.ready;
    const play = online ? (ready ? 'Change loadout' : 'Play') : 'Play again', leave = online ? 'Leave room' : 'Menu';
    if (this.playBtn.textContent !== play) this.playBtn.textContent = play;
    if (this.leaveBtn.textContent !== leave) this.leaveBtn.textContent = leave;
    this.playBtn.classList.toggle('go', !ready);
    for (const b of $('spec-cams').children) b.setAttribute('aria-pressed', String(b.dataset.cam === this.mode));
  }

  // The bar of Titans still in.
  _names() {
    const list = this.roster(), online = this.game.online;
    const sig = list.map((a) => `${this._key(a)}:${a.name}:${a.kills}:${a.color}`).join('|') + (online ? '#o' : '');
    if (sig !== this.sig) {
      this.sig = sig;
      this.namesEl.replaceChildren(...list.map((a) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pchip'; b.dataset.k = this._key(a);
        const dot = document.createElement('i'); dot.className = 'pdot'; dot.style.background = a.color;
        const n = document.createElement('span'); n.textContent = a.name;
        const k = document.createElement('b'); k.title = 'Splats';
        k.append(Object.assign(document.createElement('i'), { className: 'ico splat' }), String(a.kills));
        b.append(dot, n);
        if (online && !this._human(a)) { const t = document.createElement('small'); t.textContent = 'bot'; b.append(t); }
        b.append(k);
        b.title = `Watch ${a.name}`;
        return b;
      }));
      if (!list.length) { const p = document.createElement('span'); p.className = 'pnone'; p.textContent = 'Nobody is in the round right now'; this.namesEl.append(p); }
    }
    const sel = this.mode === 'follow' && this.target ? String(this._key(this.target)) : '';
    for (const b of this.namesEl.children) {
      const on = b.dataset.k === sel;
      if (b.classList.contains('sel') !== on) {
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', String(on));
        if (on) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  // The card over the bar: the Titan you follow (splats, Titans left, what they carry), or what the
  // camera shows; and when you're back in.
  _card() {
    const g = this.game, left = g.aliveCount(), a = this.mode === 'follow' ? this.target : null;
    let html = '';
    if (a && this._in(a)) {
      const it = this._items(a), icons = g.hud.icons;
      const foods = it.foods.map((s, i) => (s ? `<span class="sc-it${i === it.sel ? ' sel' : ''}" title="${esc(FOODS[s.id]?.name || s.id)}"><img src="${icons[s.id] || ''}" alt="${esc(FOODS[s.id]?.name || s.id)}"><em>${s.inf ? '∞' : s.count}</em></span>` : '')).join('');
      const kit = it.kit.map((id, i) => (id && UTENSIL_BY_ID[id] ? `<span class="sc-it ut${i === it.uSel ? ' sel' : ''}" title="${esc(UTENSIL_BY_ID[id].name)}" style="--uc:${UTENSIL_BY_ID[id].color}"><img src="${utensilIcon(id)}" alt="${esc(UTENSIL_BY_ID[id].name)}"></span>` : '')).join('');
      const hp = clamp(a.hp / (a.maxHp || MAX_HP), 0, 1);
      html = `<div class="sc-top"><i class="sc-dot" style="background:${a.color}"></i><b class="sc-name">${esc(a.name)}</b>${g.online && !this._human(a) ? '<small class="sc-tag">bot</small>' : ''}<span class="sc-hp" title="Health ${Math.ceil(a.hp)}"><i style="width:${(hp * 100).toFixed(0)}%"></i></span></div>`
        + `<div class="sc-stats"><span><i class="ico splat"></i><b>${a.kills}</b> ${a.kills === 1 ? 'splat' : 'splats'}</span><span><i class="ico titan"></i><b>${left}</b> ${left === 1 ? 'Titan' : 'Titans'} left</span></div>`
        + `<div class="sc-items">${foods || '<span class="sc-none">No food</span>'}<span class="sc-sep"></span>${kit || '<span class="sc-none">No utensil</span>'}</div>`;
    } else {
      const fresh = performance.now() - this.since < 9000;
      html = `<div class="sc-cine"><b>${this.mode === 'overview' ? 'Overview' : 'Cinematic'}</b>${this.mode === 'overview' ? '' : ` · ${this.caption()}`}<span class="sc-left"><i class="ico titan"></i><b>${left}</b> left</span></div>`
        + (fresh ? '<div class="sc-hint">Pick a Titan below (or on the map) to follow them</div>' : '');
    }
    const st = this._status();
    if (st) html += `<div class="sc-status">${st}</div>`;
    if (html !== this.cardHtml) { this.cardHtml = html; this.cardEl.innerHTML = html; }
  }
  // When you're back in.
  _status() {
    const g = this.game;
    if (!g.online || !g.net) return g.state === 'over' ? 'Match over' : `Splatted · you placed #${g.player?.placement || '?'}`;
    const R = g.round, next = g.nextRoundIn();
    if (!R || R.id < 0) return 'Finding the room…';
    if (!g.net.ready) return 'Only watching · press Play to join in';
    if (next !== null) return `Next round in ${next} s · you drop in`;
    return 'You drop in at the next round';
  }
  // What a Titan carries (other players' and the host's bots' from their shared state).
  _items(a) {
    if (a.isRemote) {
      const inv = a.netInv, kit = a.netKit;
      return { foods: inv ? inv.slots : [a.inv[0]], sel: inv ? inv.sel : 0, kit: kit ? kit.ids : [a.utensil], uSel: kit ? kit.sel : 0 };
    }
    return { foods: a.inv, sel: a.sel, kit: a.utensils || [], uSel: a.uSel };
  }

  // ------------------------------------------------------------------ minimap
  _minimap() {
    const g = this.game, cv = this.canvas, ctx = this.ctx;
    const cssW = cv.clientWidth || 200, dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(cssW * dpr), H = Math.round(cssW * ASPECT * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const sx = W / (B.maxX - B.minX), sz = H / (B.maxZ - B.minZ);
    const mx = (x) => (x - B.minX) * sx, my = (z) => (z - B.minZ) * sz;
    ctx.imageSmoothingQuality = 'high';
    if (this.mapImg) ctx.drawImage(this.mapImg, 0, 0, W, H); else { ctx.fillStyle = '#3a2f3a'; ctx.fillRect(0, 0, W, H); }
    // the Soap Tide: everything outside the safe circle is washed blue
    const T = g.tide;
    if (T.r < 400) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.ellipse(mx(T.x), my(T.z), T.r * sx, T.r * sz, 0, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(80, 160, 220, 0.38)'; ctx.fill('evenodd');
      ctx.beginPath(); ctx.ellipse(mx(T.x), my(T.z), T.r * sx, T.r * sz, 0, 0, Math.PI * 2);
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#8fd8f0'; ctx.stroke();
      if (T.mode === 'shrink' && T.to) { // where it's heading
        ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff4e2';
        ctx.beginPath(); ctx.ellipse(mx(T.to.x), my(T.to.z), T.to.r * sx, T.to.r * sz, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    // the camera: a little cone where it looks
    const cam = g.camera;
    cam.getWorldDirection(_d);
    const ca = Math.atan2(_d.z * sz, _d.x * sx), cx = mx(cam.position.x), cy = my(cam.position.z), L = 18 * dpr;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 244, 226, 0.28)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, L, ca - 0.45, ca + 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4e2'; ctx.beginPath(); ctx.arc(cx, cy, 2.2 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // every Titan still in; players bigger, the one you watch ringed
    const s = this.shot, watched = this.mode === 'follow' ? [this.target] : s && s.kind !== 'wide' ? [s.a, s.b] : [];
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    for (const a of this.roster()) {
      const x = mx(a.pos.x), y = my(a.pos.z), human = this._human(a), r = (human ? 4.4 : 3.3) * dpr;
      if (watched.includes(a)) {
        ctx.beginPath(); ctx.arc(x, y, r + (3 + pulse * 2) * dpr, 0, Math.PI * 2);
        ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#ffd447'; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = a.color; ctx.fill();
      ctx.lineWidth = (human ? 2 : 1.4) * dpr; ctx.strokeStyle = human ? '#fff4e2' : '#22142a'; ctx.stroke();
    }
  }

  // A top-down picture of the map, taken once per map: everything below SNAP_TOP (the floor, the
  // counters, the table), straight down, without the Titans, food or the Soap Tide. It is drawn on
  // the game canvas just before the frame and copied out at once, so it is never seen there.
  _snapshot() {
    const g = this.game, r = g.renderer, scene = g.scene, world = g.world;
    this.mapWorld = world;
    const out = document.createElement('canvas');
    let pictured = false;
    const hidden = [], buf = r.getDrawingBufferSize(new THREE.Vector2()), size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const rt = r.getRenderTarget(), shadowsDue = r.shadowMap.needsUpdate, bg = scene.background;
    try {
      let w = Math.min(640, buf.x), h = Math.round(w * ASPECT);
      if (h > buf.y) { h = buf.y; w = Math.round(h / ASPECT); }
      if (w < 32 || h < 32) throw new Error('canvas too small');
      // the far plane sits just above the floor: the busy floor tiles (or grass) become one flat colour
      const cam = new THREE.OrthographicCamera(-(B.maxX - B.minX) / 2, (B.maxX - B.minX) / 2, (B.maxZ - B.minZ) / 2, -(B.maxZ - B.minZ) / 2, 0.1, SNAP_TOP - FLOOR_Y - 0.25);
      cam.position.set((B.minX + B.maxX) / 2, SNAP_TOP, (B.minZ + B.maxZ) / 2);
      cam.up.set(0, 0, -1); // north (-z) at the top
      cam.lookAt(cam.position.x, SNAP_TOP - 10, cam.position.z);
      cam.updateMatrixWorld();
      const hide = (o) => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
      for (const o of scene.children) if (o !== world.scene) hide(o);
      hide(world.tideMesh); hide(world.shaft); hide(world.motes);
      r.setRenderTarget(null); r.shadowMap.needsUpdate = false;
      scene.background = new THREE.Color(FLOOR_TINT[world.mapId] || FLOOR_TINT.kitchen);
      r.setViewport(0, 0, w / pr, h / pr); r.setScissor(0, 0, w / pr, h / pr); r.setScissorTest(true);
      r.render(scene, cam);
      out.width = w; out.height = h;
      out.getContext('2d').drawImage(r.domElement, 0, buf.y - h, w, h, 0, 0, w, h);
      pictured = true;
    } catch { /* drawn as a plan below */ } finally {
      r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y); r.setScissor(0, 0, size.x, size.y);
      r.setRenderTarget(rt); r.shadowMap.needsUpdate = shadowsDue; scene.background = bg;
      for (const o of hidden) o.visible = true;
    }
    if (!pictured) { // a plan of the colliders instead: the higher, the lighter
      out.width = 480; out.height = Math.round(480 * ASPECT);
      const x = out.getContext('2d'), sx = out.width / (B.maxX - B.minX), sz = out.height / (B.maxZ - B.minZ);
      x.fillStyle = FLOOR_TINT[world.mapId] || FLOOR_TINT.kitchen; x.fillRect(0, 0, out.width, out.height);
      for (const c of [...colliders].sort((p, q) => p.top - q.top)) {
        if (!c.enabled || c.top >= SNAP_TOP - 0.5) continue;
        const k = clamp((c.top - FLOOR_Y) / 40, 0, 1);
        x.fillStyle = `rgb(${120 + k * 110 | 0}, ${100 + k * 100 | 0}, ${90 + k * 80 | 0})`;
        if (c.type === 'box') x.fillRect((c.minX - B.minX) * sx, (c.minZ - B.minZ) * sz, (c.maxX - c.minX) * sx, (c.maxZ - c.minZ) * sz);
        else { x.beginPath(); x.ellipse((c.x - B.minX) * sx, (c.z - B.minZ) * sz, c.r * sx, c.r * sz, 0, 0, Math.PI * 2); x.fill(); }
      }
    }
    // tall things the picture cuts through (the fridge, a tree trunk): solid on the map
    const x = out.getContext('2d'), sx = out.width / (B.maxX - B.minX), sz = out.height / (B.maxZ - B.minZ);
    x.fillStyle = 'rgba(52, 33, 63, 0.9)';
    for (const c of [...colliders].sort((p, q) => p.top - q.top)) {
      if (!c.enabled || c.top < SNAP_TOP - 0.5) continue;
      if (c.type === 'box') x.fillRect((c.minX - B.minX) * sx, (c.minZ - B.minZ) * sz, (c.maxX - c.minX) * sx, (c.maxZ - c.minZ) * sz);
      else { x.beginPath(); x.ellipse((c.x - B.minX) * sx, (c.z - B.minZ) * sz, c.r * sx, c.r * sz, 0, 0, Math.PI * 2); x.fill(); }
    }
    this.mapImg = out;
  }
}
