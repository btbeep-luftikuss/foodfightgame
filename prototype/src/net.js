// Online multiplayer over the claude.ai artifact "room" capability (everyone who has the game
// open right now). Players pick a room code; each code is its own match.
//
// Model: every client owns its own Titan and shares it through room *presence*, about 30 times
// a second: position, velocity, aim, health, held food and status flags, plus a short rolling
// log of events (throws, peel traps, trampolines, knockouts). Presence works for every viewer
// the game is shared with, which event topics would not.
//
// Every client simulates every projectile. A hit is decided by the client of the Titan that
// got hit ("victim-side hits"), so what you see hit you is what hurts you. A client that is
// knocked out announces who did it; the thrower's client counts the splat.
//
// Everything that arrives is untrusted: numbers are clamped, food ids are checked against the
// food table, names are shown as plain text, and throws are rate-limited per player.
import * as THREE from 'three';
import { clamp, rand, FLOOR_BOUNDS } from './core.js';
import { FOODS } from './foods.js';
import { Actor } from './actors.js';

const COLORS = ['#ff9a1f', '#6fc2ff', '#9be15d', '#c38bff', '#ff6f91', '#4fd1c5', '#ffcf3a', '#ff7b54', '#8fa8ff', '#e0a0ff', '#63e6a5', '#f2f2f2'];
const FLAG = { charging: 1, shield: 2, frozen: 4, rooted: 8, tripped: 16, burning: 32, wet: 64, gliding: 128, eating: 256, dashing: 512, juiced: 1024, ground: 2048 };
const SEND_EVERY = 1 / 30;
const LOG_KEEP = 1.5;   // seconds an event stays in the rolling log
const LOG_MAX = 28;
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 16) || 'Titan';
export const cleanRoom = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40) || 'kitchen';

// A stand-in "room" for local testing across browser tabs (BroadcastChannel). Never used on
// the published page unless a test switches it on.
function mockLobby() {
  const me = Math.random().toString(36).slice(2, 10);
  return {
    async join(name) {
      const ch = new BroadcastChannel(`tt-mock-${name}`);
      const peers = new Map(); // peer -> {presence, seen}
      let mine = {};
      const handlers = new Set();
      const snapshot = () => {
        const list = [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }];
        for (const [peer, v] of peers) list.push({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.seen });
        return Object.freeze(list);
      };
      let snap = snapshot();
      const changed = () => { snap = snapshot(); handlers.forEach((h) => h({ peers: snap, joined: [], left: [], updated: [] })); };
      ch.onmessage = (e) => {
        const { peer, presence, bye } = e.data || {};
        if (!peer || peer === me) return;
        if (bye) peers.delete(peer); else peers.set(peer, { presence: Object.freeze(presence), seen: Date.now() });
        changed();
      };
      setInterval(() => { // drop peers that went silent
        let gone = false;
        for (const [p, v] of peers) if (Date.now() - v.seen > 4000) { peers.delete(p); gone = true; }
        if (gone) changed();
      }, 1000);
      addEventListener('beforeunload', () => ch.postMessage({ peer: me, bye: true }));
      return {
        name,
        async presence(patch) { mine = Object.freeze({ ...mine, ...patch }); ch.postMessage({ peer: me, presence: mine }); },
        peers: () => snap,
        onPeers(h) { handlers.add(h); queueMicrotask(() => h({ peers: snap, joined: snap, left: [], updated: [] })); return () => handlers.delete(h); },
        onConnection(h) { queueMicrotask(() => h(true)); return () => {}; },
        connected: () => true,
        async leave() { ch.postMessage({ peer: me, bye: true }); ch.close(); },
        emit: async () => {}, on: () => () => {},
      };
    },
  };
}

export async function roomAvailable() {
  if (window.__useMockRoom) return mockLobby();
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    return await window.claude.use('room');
  } catch { return null; }
}

export class Net {
  constructor(game) {
    this.game = game;
    this.room = null; this.connected = false;
    this.proxies = new Map(); // peer -> { actor, lastSeq, presence, recvAt, target, netVel, throws }
    this.seq = 0; this.log = [];
    this.myPeer = null;
    this.sendT = 0;
    this.name = 'Titan'; this.color = COLORS[0]; this.roomName = 'kitchen';
    this.lastSent = null;
  }

  async connect(lobby, roomName, name) {
    this.name = cleanName(name);
    this.roomName = cleanRoom(roomName);
    this.color = COLORS[(Math.random() * COLORS.length) | 0];
    this.room = await lobby.join(this.roomName);
    this.room.onConnection((c) => { this.connected = c; }, () => { this.connected = false; });
    this.connected = typeof this.room.connected === 'function' ? this.room.connected() : true;
  }

  async leave() {
    const r = this.room;
    this.room = null;
    for (const peer of [...this.proxies.keys()]) this._drop(peer);
    try { await r?.leave(); } catch { /* already gone */ }
  }

  playerCount() { return 1 + this.proxies.size; }

  // ---------------------------------------------------------------- outgoing
  event(type, ...data) {
    this.seq++;
    this.log.push([this.seq, type, ...data, this.game.time]);
  }

  sendThrow(o) {
    const q = (v) => [r2(v.x), r2(v.y), r2(v.z)];
    const seekPeer = o.seek ? this._peerOf(o.seek) : '';
    this.event('t', {
      f: o.food, p: q(o.pos), v: q(o.vel), g: o.gravity, r: o.radius, l: o.life, o: o.orient ? 1 : 0, rl: o.roll ? 1 : 0,
      c: o.charge, cv: o.curve, b: o.bounces, fu: o.fuse, sk: seekPeer, tu: o.turn, rt: o.retarget, sh: o.shootable ? 1 : 0, br: o.bruise, sp: o.spin,
    });
  }

  _peerOf(actor) {
    if (actor === this.game.player) return this.myPeer || '';
    for (const [peer, pr] of this.proxies) if (pr.actor === actor) return peer;
    return '';
  }
  _actorOf(peer) {
    if (!peer) return null;
    if (peer === this.myPeer) return this.game.player;
    return this.proxies.get(peer)?.actor || null;
  }

  _sendState(now) {
    const p = this.game.player;
    const t = this.game.time;
    this.log = this.log.filter((e) => t - e[e.length - 1] < LOG_KEEP).slice(-LOG_MAX);
    let f = 0;
    if (p.charging) f |= FLAG.charging;
    if (p.shieldUp) f |= FLAG.shield;
    if (p.isFrozen()) f |= FLAG.frozen;
    if (p.isRooted()) f |= FLAG.rooted;
    if (p.isTripped()) f |= FLAG.tripped;
    if (p.isBurning()) f |= FLAG.burning;
    if (p.isWet()) f |= FLAG.wet;
    if (p.gliding) f |= FLAG.gliding;
    if (p.eat) f |= FLAG.eating;
    if (p.dashT > 0) f |= FLAG.dashing;
    if (t < p.juicedUntil) f |= FLAG.juiced;
    if (p.onGround) f |= FLAG.ground;
    const s = [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r2(p.yaw), r2(this.game.input.pitch),
      Math.round(p.hp), Math.round(p.glaze), p.alive ? 1 : 0, p.selected()?.id || '', f, p.kills, r2(Math.min(99, t - p.noiseAt))];
    this.room.presence({ n: this.name, c: this.color, k: this.game.playerSkin, s, e: this.log.map((e) => e.slice(0, -1)) }).catch(() => {});
  }

  // ---------------------------------------------------------------- incoming
  tick(dt) {
    if (!this.room) return;
    const now = this.game.time;
    this.sendT += dt;
    if (this.sendT >= SEND_EVERY && this.game.player) { this.sendT = 0; this._sendState(now); }

    const list = this.room.peers();
    const seen = new Set();
    for (const peer of list) {
      if (peer.sameTab) { this.myPeer = peer.peer; continue; }
      if (peer.kind !== 'viewer') continue;
      const pres = peer.presence;
      if (!pres || !Array.isArray(pres.s)) continue;
      seen.add(peer.peer);
      let pr = this.proxies.get(peer.peer);
      if (!pr) pr = this._add(peer.peer, pres);
      if (pr.presence !== pres) this._apply(pr, pres, peer.peer);
    }
    for (const peer of [...this.proxies.keys()]) if (!seen.has(peer)) this._drop(peer);

    // smooth remote Titans toward where they are now (extrapolated a little)
    for (const pr of this.proxies.values()) {
      const a = pr.actor;
      if (!a.alive) continue;
      const lead = Math.min(0.25, now - pr.recvAt);
      const tx = pr.target.x + pr.netVel.x * lead, ty = pr.target.y + pr.netVel.y * lead, tz = pr.target.z + pr.netVel.z * lead;
      const k = 1 - Math.exp(-15 * dt);
      if (Math.hypot(tx - a.pos.x, tz - a.pos.z) > 10) a.pos.set(tx, ty, tz);
      else { a.pos.x += (tx - a.pos.x) * k; a.pos.y += (ty - a.pos.y) * k; a.pos.z += (tz - a.pos.z) * k; }
      a.vel.copy(pr.netVel);
    }
  }

  _add(peer, pres) {
    const game = this.game;
    const actor = new Actor(game, { id: 100 + this.proxies.size, name: cleanName(pres.n), color: /^#[0-9a-f]{6}$/i.test(pres.c) ? pres.c : '#f2f2f2', isBot: false });
    actor.isRemote = true;
    actor.gliding = false;
    actor.applySkin(typeof pres.k === 'string' ? pres.k : 'chef'); // unknown ids fall back to the chef
    const pr = { actor, lastSeq: null, presence: null, recvAt: game.time, target: new THREE.Vector3(), netVel: new THREE.Vector3(), throws: [] };
    this.proxies.set(peer, pr);
    game.actors.push(actor);
    game.hud.toast(`${actor.name} joined`);
    return pr;
  }

  _drop(peer) {
    const pr = this.proxies.get(peer);
    if (!pr) return;
    this.proxies.delete(peer);
    const game = this.game, a = pr.actor;
    a.alive = false; a.hide();
    game.scene.remove(a.root); game.scene.remove(a.glint);
    const i = game.actors.indexOf(a);
    if (i >= 0) game.actors.splice(i, 1);
    if (this.room) game.hud.toast(`${a.name} left`);
  }

  _apply(pr, pres, peer) {
    const game = this.game, a = pr.actor, s = pres.s, now = game.time;
    pr.presence = pres;
    pr.recvAt = now;
    a.name = cleanName(pres.n);
    const B = FLOOR_BOUNDS;
    pr.target.set(num(s[0], B.minX, B.maxX), num(s[1], -40, 120), num(s[2], B.minZ, B.maxZ));
    pr.netVel.set(num(s[3], -80, 80), num(s[4], -80, 80), num(s[5], -80, 80));
    a.yaw = num(s[6], -1e3, 1e3);
    a.lookPitch = num(s[7], -1.6, 1.6); // their Titan looks up and down where they aim
    a.hp = num(s[8], 0, 200, 200);
    a.glaze = num(s[9], 0, 100);
    const alive = s[10] === 1;
    if (a.alive && !alive) { // knocked out
      a.alive = false;
      game.fx.burst('splat-out', a.center(new THREE.Vector3()));
      game.sfx.play('splatout', a.pos);
      a.hide();
    } else if (!a.alive && alive) {
      a.alive = true; a.root.visible = true;
      a.pos.copy(pr.target);
    }
    const held = typeof s[11] === 'string' && FOODS[s[11]] && !FOODS[s[11]].hidden ? s[11] : null;
    if ((a.inv[0]?.id || null) !== held) { a.inv[0] = held ? { id: held, count: 1 } : null; a.sel = 0; a._refreshHeld(); }
    const f = num(s[12], 0, 1 << 16) | 0;
    const soon = now + 0.3;
    a.charging = !!(f & FLAG.charging); if (a.charging) a.chargeT += 1 / 30; else a.chargeT = 0;
    a.shieldUp = !!(f & FLAG.shield);
    a.frozenUntil = f & FLAG.frozen ? soon : 0;
    a.rootedUntil = f & FLAG.rooted ? soon : 0;
    a.trippedUntil = f & FLAG.tripped ? soon : 0;
    a.burnUntil = f & FLAG.burning ? soon : 0;
    a.wetUntil = f & FLAG.wet ? soon : 0;
    a.gliding = !!(f & FLAG.gliding);
    a.juicedUntil = f & FLAG.juiced ? soon : 0;
    a.dashT = f & FLAG.dashing ? 0.1 : 0;
    a.onGround = !!(f & FLAG.ground);
    a.eat = f & FLAG.eating ? (a.eat || { end: Infinity, done: () => {}, dmg: 0 }) : null;
    a.kills = num(s[13], 0, 9999) | 0;
    a.noiseAt = now - num(s[14], 0, 99, 99);

    // events we haven't seen yet
    const ev = Array.isArray(pres.e) ? pres.e : [];
    let maxSeq = pr.lastSeq ?? 0;
    for (const e of ev) {
      if (!Array.isArray(e) || typeof e[0] !== 'number') continue;
      if (pr.lastSeq === null) { maxSeq = Math.max(maxSeq, e[0]); continue; } // first sight: skip history
      if (e[0] <= pr.lastSeq) continue;
      maxSeq = Math.max(maxSeq, e[0]);
      this._event(pr, e[1], e.slice(2), peer);
    }
    pr.lastSeq = maxSeq;
  }

  _event(pr, type, d, peer) {
    const game = this.game, a = pr.actor;
    if (type === 't') {
      const o = d[0];
      if (!o || typeof o !== 'object') return;
      const food = FOODS[o.f];
      if (!food || !food.impact) return;
      const now = game.time;
      pr.throws = pr.throws.filter((t) => now - t < 1);
      if (pr.throws.length >= 40) return; // rate limit
      pr.throws.push(now);
      const v3 = (arr, lo, hi) => new THREE.Vector3(num(arr?.[0], lo, hi), num(arr?.[1], lo, hi), num(arr?.[2], lo, hi));
      const seek = o.sk ? this._actorOf(String(o.sk)) : null;
      game.projectiles.launch({
        food: o.f, owner: a, remote: true, pos: v3(o.p, -300, 300), vel: v3(o.v, -150, 150),
        gravity: num(o.g, -1, 3, 1), radius: num(o.r, 0.05, 1.5, 0.35), life: num(o.l, 0.1, 12, 6),
        orient: !!o.o, roll: !!o.rl, charge: num(o.c, 0, 1, 1), curve: num(o.cv, -5, 5), bounces: num(o.b, 0, 6) | 0,
        fuse: num(o.fu, 0, 5), seek, turn: num(o.tu, 0, 6), retarget: num(o.rt, 0, 60), shootable: !!o.sh, bruise: num(o.br, 0, 3) | 0, spin: num(o.sp, 0, 30),
      });
      a.armT = 0.3;
    } else if (type === 'p') {
      game.items.addTrap(a, new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300)));
    } else if (type === 'r') {
      game.items.addTrampoline(a, new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300)));
    } else if (type === 'd') { // this player was knocked out
      const killer = typeof d[0] === 'string' ? this._actorOf(d[0]) : null;
      const food = typeof d[1] === 'string' ? d[1] : '';
      game.remoteKnockout(a, killer, food);
    }
  }
}
