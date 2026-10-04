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
//
// Rounds and bots (0.21): one player hosts the room: the one who has hosted longest (the first to
// arrive), or, when nobody hosts, the player with the lowest id. The host publishes the room
// settings (rs: map, mode, bots), the round (rd: number, state, Soap Tide) and its bots (b), which
// it simulates like Play vs bots; their throws and knockouts go out as the host's events. Hits on
// a bot are decided by the host's game, just as hits on a player are decided by that player's.
//
// Loadouts and spectators (0.24): each player says whether they want to play (w) or only watch;
// only players who want to play drop in, and the host fills the room with bots around them. Every
// Titan's state also carries what it carries (foods and utensils, as short codes), so someone
// spectating can see a player's items.
//
// Teams and Cooking Pot Wars (0.26): the room settings carry the mode and the team size; every
// Titan's state carries its team and the pot on its back. Players pick their team (state), the host
// fills the rest with bots. In Cooking Pot Wars the host owns the pots and shares them (pw); players
// send their pot moves as events: set the pot down (pp), a ladle hit (lh), a pot carried home (pc);
// the host announces who smashed a pot (ps). Turret shots carry their power (tm).
import * as THREE from 'three';
import { clamp, rand, FLOOR_BOUNDS } from './core.js';
import { FOODS, FOOD_IDS } from './foods.js';
import { Actor } from './actors.js';
import { UTENSIL_BY_ID, UTENSIL_IDS } from './utensils.js';
import { TEAMS, cleanSize } from './teams.js';

const COLORS = ['#ff9a1f', '#6fc2ff', '#9be15d', '#c38bff', '#ff6f91', '#4fd1c5', '#ffcf3a', '#ff7b54', '#8fa8ff', '#e0a0ff', '#63e6a5', '#f2f2f2'];
const FLAG = { charging: 1, shield: 2, frozen: 4, rooted: 8, tripped: 16, burning: 32, wet: 64, gliding: 128, eating: 256, dashing: 512, juiced: 1024, ground: 2048, ladle: 4096, turret: 8192 };
const SEND_EVERY = 1 / 30;
const LOG_KEEP = 0.7;   // seconds an event stays in the rolling log
const LOG_MAX = 90;
const POT_EVENTS = new Set(['pp', 'lh', 'pc', 'ps']);
const MAPS_OK = ['kitchen', 'backyard'], BOTS_OK = ['off', 'easy', 'medium', 'hard'];
const MODES_OK = ['classic', 'chef', 'pots'];
const cleanRS = (rs) => { // eslint-disable-line arrow-body-style
  if (!rs || typeof rs !== 'object') return null;
  const mode = MODES_OK.includes(rs.mode) ? rs.mode : 'classic';
  return { map: MAPS_OK.includes(rs.map) ? rs.map : 'kitchen', mode, team: cleanSize(rs.team, mode), bots: BOTS_OK.includes(rs.bots) ? rs.bots : 'medium', since: num(rs.since, 0, 1e15) };
};
const STATES = ['drop', 'play', 'over'];
const cleanRD = (rd) => (Array.isArray(rd) ? [num(rd[0], 0, 1e6) | 0, STATES.includes(rd[1]) ? rd[1] : 'play',
  num(rd[2], -300, 300), num(rd[3], -300, 300), num(rd[4], 0, 400, 330), num(rd[5], 0, 10) | 0, rd[6] === 'shrink' ? 'shrink' : 'wait',
  num(rd[7], 0, 120), cleanName(rd[8]).slice(0, 16), num(rd[9], 0, 1e4), num(rd[10], -300, 300), num(rd[11], -300, 300), num(rd[12], 0, 400), rd[13] === 1 ? 1 : 0] : null);
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 16) || 'Titan';
// What a Titan carries, as short codes: foods "<food code><count or *>" per slot, then the slot in
// hand ("04,3*,,,|0"); utensils "<utensil code>" per slot, then the one in hand ("a,,5|0").
const INV_IDS = [...FOOD_IDS, 'peel'];
const invCode = (a) => a.inv.map((s) => (s && INV_IDS.includes(s.id) ? INV_IDS.indexOf(s.id).toString(36) + (s.inf ? '*' : Math.min(999, s.count | 0)) : '')).join(',') + '|' + (a.sel | 0);
const kitCode = (a) => (a.utensils || []).map((id) => (id && UTENSIL_IDS.includes(id) ? UTENSIL_IDS.indexOf(id).toString(36) : '')).join(',') + '|' + (a.uSel | 0);
function readInv(code) {
  if (typeof code !== 'string' || code.length > 60) return null;
  const [list = '', sel = '0'] = code.split('|');
  const slots = list.split(',').slice(0, 5).map((t) => {
    const id = t ? INV_IDS[parseInt(t[0], 36)] : null;
    if (!id) return null;
    return t.slice(1) === '*' ? { id, count: 1, inf: true } : { id, count: clamp(parseInt(t.slice(1), 10) || 0, 0, 999) };
  });
  while (slots.length < 5) slots.push(null);
  return { slots, sel: clamp(parseInt(sel, 10) || 0, 0, 4) };
}
function readKit(code) {
  if (typeof code !== 'string' || code.length > 30) return null;
  const [list = '', sel = '0'] = code.split('|');
  const ids = list.split(',').slice(0, 3).map((t) => (t ? UTENSIL_IDS[parseInt(t, 36)] || null : null));
  while (ids.length < 3) ids.push(null);
  return { ids, sel: clamp(parseInt(sel, 10) || 0, 0, 2) };
}
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
    this.settings = { map: 'kitchen', mode: 'classic', team: 1, bots: 'medium' }; // what I'd host with
    this.teamPick = -1;           // the team I picked (-1: let the game choose)
    this.loadout = null;          // my 3 foods (picked after joining)
    this.utensil = null;          // ... and my utensil
    this.ready = false;           // I want to play (false: only watching)
    this.isHost = false; this.hostPeer = null; this.hostSince = 0;
    this.hostSettings = null; this.hostRound = null; // the room's, from the host
    this.botProxies = new Map();  // `${hostPeer}|b${id}` -> proxy of one of the host's bots
    this.joinedAt = 0;
  }

  roomSettings() { return this.hostSettings ? { ...this.hostSettings } : { ...this.settings }; }

  async connect(lobby, roomName, name, settings = {}) {
    this.settings = cleanRS({ ...this.settings, ...settings });
    this.loadout = Array.isArray(settings.loadout) && settings.loadout.length === 3 ? settings.loadout.filter((id) => FOODS[id]) : null;
    this.utensil = UTENSIL_BY_ID[settings.utensil] ? settings.utensil : null;
    this.joinedAt = performance.now();
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
    for (const key of [...this.botProxies.keys()]) this._dropBot(key);
    this.isHost = false;
    try { await r?.leave(); } catch { /* already gone */ }
  }

  playerCount() { return 1 + this.proxies.size; }
  // local bots (host only)
  _localBots() { return this.isHost ? this.game.actors.filter((a) => a.isBot && !a.isRemote) : []; }

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
      ...(o.u ? { u: o.u, x: o.x || {} } : {}), // utensil-boosted throw
      ...(o.owner && o.owner !== this.game.player ? { ow: o.owner.id } : {}), // one of my bots threw it
      ...(o.turret ? { tm: r2(o.turret) } : {}), // fired from a pot's turret
    });
  }

  _peerOf(actor) {
    if (actor === this.game.player) return this.myPeer || '';
    if (actor.isBot && !actor.isRemote) return `${this.myPeer}|b${actor.id}`;
    for (const [peer, pr] of this.proxies) if (pr.actor === actor) return peer;
    for (const [key, pr] of this.botProxies) if (pr.actor === actor) return key;
    return '';
  }
  _actorOf(peer) {
    if (!peer) return null;
    if (peer === this.myPeer) return this.game.player;
    if (this.myPeer && peer.startsWith(`${this.myPeer}|b`)) return this.game.botActors[num(+peer.split('|b')[1], 1, 11) | 0] || null;
    return this.proxies.get(peer)?.actor || this.botProxies.get(peer)?.actor || null;
  }

  _sendState(now) {
    const p = this.game.player, g = this.game;
    const t = this.game.time;
    this.log = this.log.filter((e) => t - e[e.length - 1] < (POT_EVENTS.has(e[1]) ? 3 : LOG_KEEP)).slice(-LOG_MAX); // (pot moves stay longer: they must not be missed)
    const msg = { n: this.name, c: this.color, k: this.game.playerSkin, w: this.ready ? 1 : 0, s: this._stateOf(p, this.game.input.pitch), e: this.log.map((e) => e.slice(0, -1)) };
    if (this.isHost && g.pots.active) msg.pw = [Math.max(0, g.round.id), ...g.pots.state()]; // Cooking Pot Wars: the pots
    if (this.isHost) {
      const R = g.round, T = g.tide, to = T.to || { x: T.x, z: T.z, r: T.r };
      msg.rs = { ...this.roomSettings(), since: this.hostSince };
      msg.rd = [Math.max(0, R.id), STATES.includes(R.state) ? R.state : 'drop', r2(T.x), r2(T.z), r2(T.r), T.phase, T.mode, r2(Math.max(0, T.t)), R.winner || '', r2(R.t), r2(to.x), r2(to.z), r2(to.r), R.fresh ? 1 : 0];
      msg.b = this._localBots().map((a) => [a.id, a.name, a.color, a.skinId, ...this._stateOf(a, Math.asin(clamp(a.aimDir.y, -1, 1)))]);
    }
    this.room.presence(msg).catch(() => {});
  }
  _stateOf(p, pitch) {
    const t = this.game.time;
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
    if (p.ladleT > 0) f |= FLAG.ladle;
    if (p.inTurret) f |= FLAG.turret;
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r2(p.yaw), r2(pitch),
      Math.round(p.hp), Math.round(p.glaze), p.alive ? 1 : 0, p.selected()?.id || '', f, p.kills, r2(Math.min(99, t - p.noiseAt)), p.utensil || '', invCode(p), kitCode(p), p.team ?? -1, p.carry ?? -1];
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
    this._elect(list);

    // smooth remote Titans toward where they are now (extrapolated a little)
    for (const pr of [...this.proxies.values(), ...this.botProxies.values()]) {
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

  // Who hosts: whoever has hosted longest; if nobody does, the lowest id takes over.
  _elect(list) {
    const hosts = [];
    for (const peer of list) {
      if (peer.sameTab || peer.kind !== 'viewer' || !this.proxies.has(peer.peer)) continue;
      const rs = cleanRS(peer.presence?.rs);
      if (rs) hosts.push([peer.peer, rs.since, peer.presence, rs]);
    }
    if (this.isHost && this.myPeer) hosts.push([this.myPeer, this.hostSince, null, null]);
    hosts.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const top = hosts[0];
    if (top && top[0] !== this.myPeer) {
      if (this.isHost) { this.isHost = false; this.game.round.id = -1; } // someone hosted first: follow them
      if (this.hostPeer !== top[0]) { this.hostPeer = top[0]; for (const key of [...this.botProxies.keys()]) if (!key.startsWith(`${top[0]}|`)) this._dropBot(key); }
      this.hostSettings = top[3];
      this.hostRound = cleanRD(top[2].rd);
      this._syncBots(top[0], top[2].b);
      const pw = top[2].pw; // Cooking Pot Wars: the host's pots (for this round only)
      if (Array.isArray(pw) && pw[0] === this.game.round.id) this.game.pots.applyState(pw.slice(1), num);
    } else if (!top && this.myPeer && performance.now() - this.joinedAt > 1500) {
      let lowest = this.myPeer;
      for (const peer of this.proxies.keys()) if (peer < lowest) lowest = peer;
      if (lowest === this.myPeer) { // nobody hosts (a new room, or the host left): I do
        const takeover = this.game.round.id >= 0; // the host left mid-game
        this.isHost = true; this.hostSince = Date.now(); this.hostPeer = this.myPeer;
        for (const key of [...this.botProxies.keys()]) this._dropBot(key);
        if (takeover) { // their bots left with them: a fresh round (with my bots) in 3 s
          Object.assign(this.game.round, { state: 'over', t: 3, winner: '' });
          this.game.state = 'over';
          this.game.hud.banner('The host left', 'You host the room now · new round in 3 s', 3);
        } else this.game.hud.toast('You are hosting this room');
      }
    }
  }

  // The host's bots, as proxies (positions smoothed like players').
  _syncBots(hostPeer, list) {
    const seen = new Set();
    if (Array.isArray(list)) {
      for (const e of list.slice(0, 11)) {
        if (!Array.isArray(e) || e.length < 20) continue;
        const key = `${hostPeer}|b${num(e[0], 1, 11) | 0}`;
        seen.add(key);
        let pr = this.botProxies.get(key);
        if (!pr) {
          const actor = new Actor(this.game, { id: 200 + this.botProxies.size, name: cleanName(e[1]), color: /^#[0-9a-f]{6}$/i.test(e[2]) ? e[2] : '#f2f2f2', isBot: false });
          actor.isRemote = true; actor.isBotProxy = true; actor.gliding = false;
          actor.applySkin(typeof e[3] === 'string' ? e[3] : 'chef');
          pr = { actor, lastSeq: 0, presence: null, recvAt: this.game.time, target: new THREE.Vector3(), netVel: new THREE.Vector3(), throws: [] };
          this.botProxies.set(key, pr);
          this.game.actors.push(actor);
        }
        pr.actor.name = cleanName(e[1]);
        if (/^#[0-9a-f]{6}$/i.test(e[2])) pr.actor.ownColor = e[2];
        this._applyState(pr, e.slice(4));
      }
    }
    for (const key of [...this.botProxies.keys()]) if (!seen.has(key)) this._dropBot(key);
  }
  _dropBot(key) {
    const pr = this.botProxies.get(key);
    if (!pr) return;
    this.botProxies.delete(key);
    const game = this.game, a = pr.actor;
    a.alive = false; a.hide();
    game.scene.remove(a.root); game.scene.remove(a.glint);
    const i = game.actors.indexOf(a);
    if (i >= 0) game.actors.splice(i, 1);
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
    for (const key of [...this.botProxies.keys()]) if (key.startsWith(`${peer}|`)) this._dropBot(key);
    if (this.room) game.hud.toast(`${a.name} left`);
  }

  _apply(pr, pres, peer) {
    pr.presence = pres;
    pr.ready = pres.w !== 0; // wants to play (older games always did)
    pr.actor.name = cleanName(pres.n);
    if (/^#[0-9a-f]{6}$/i.test(pres.c)) pr.actor.ownColor = pres.c;
    this._applyState(pr, pres.s);

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

  // A Titan's shared state (a player's or one of the host's bots).
  _applyState(pr, s) {
    const game = this.game, a = pr.actor, now = game.time;
    pr.recvAt = now;
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
    a.utensil = typeof s[15] === 'string' && UTENSIL_BY_ID[s[15]] ? s[15] : null; // drawn in their left hand
    a.netInv = readInv(s[16]); // what they carry (shown to spectators)
    a.netKit = readKit(s[17]);
    // teams: their team (its colour on the HUD), and a smashed pot on their back (Cooking Pot Wars)
    const tm = num(s[18], -1, TEAMS.length - 1, -1) | 0;
    a.team = game.teamSize > 1 && tm >= 0 ? tm : null;
    a.color = a.team != null ? TEAMS[a.team].color : a.ownColor || a.color;
    a.maxHp = game.pots.active ? 75 : 200;
    const carry = num(s[19], -1, TEAMS.length - 1, -1) | 0;
    game.pots.setCarry(a, game.pots.active && a.alive && carry >= 0 ? carry : null);
    if (f & FLAG.ladle && !(a.ladleT > 0)) a.ladleT = 0.3;
    a.netTurret = !!(f & FLAG.turret); // sitting in their pot's turret (it turns with them)
  }

  _event(pr, type, d, peer) {
    const game = this.game;
    // the host's events may be for one of its bots (ow: the bot's id)
    const botOf = (id) => (peer === this.hostPeer && id !== undefined ? this.botProxies.get(`${peer}|b${num(+id, 1, 11) | 0}`)?.actor : null);
    if (type === 'bd') { // one of the host's bots was knocked out
      const victim = botOf(d[0]);
      if (victim) game.remoteKnockout(victim, typeof d[1] === 'string' ? this._actorOf(d[1]) : null, typeof d[2] === 'string' ? d[2] : '');
      return;
    }
    let a = pr.actor;
    if (type === 't') {
      const o = d[0];
      if (!o || typeof o !== 'object') return;
      if (o.ow !== undefined) { a = botOf(o.ow); if (!a) return; }
      const food = FOODS[o.f];
      if (!food || !food.impact) return;
      const now = game.time;
      a.netThrows = (a.netThrows || []).filter((t) => now - t < 1);
      if (a.netThrows.length >= 40) return; // rate limit, per Titan
      a.netThrows.push(now);
      const v3 = (arr, lo, hi) => new THREE.Vector3(num(arr?.[0], lo, hi), num(arr?.[1], lo, hi), num(arr?.[2], lo, hi));
      const seek = o.sk ? this._actorOf(String(o.sk)) : null;
      const ux = o.u ? game.utensils.sanitize(String(o.u), o.x) : null;
      game.projectiles.launch({
        ...(ux ? { u: String(o.u), x: ux } : { u: '' }),
        food: o.f, owner: a, remote: true, pos: v3(o.p, -300, 300), vel: v3(o.v, -150, 150),
        gravity: num(o.g, -1, 3, 1), radius: num(o.r, 0.05, 1.5, 0.35), life: num(o.l, 0.1, 12, 6),
        orient: !!o.o, roll: !!o.rl, charge: num(o.c, 0, 1, 1), curve: num(o.cv, -5, 5), bounces: num(o.b, 0, 6) | 0,
        fuse: num(o.fu, 0, 5), seek, turn: num(o.tu, 0, 6), retarget: num(o.rt, 0, 60), shootable: !!o.sh, bruise: num(o.br, 0, 3) | 0, spin: num(o.sp, 0, 30),
        turret: o.tm ? num(o.tm, 1, 4, 1) : 0,
      });
      a.armT = 0.3;
    } else if (type === 'p' || type === 'r') {
      if (d[3] !== undefined) { a = botOf(d[3]); if (!a) return; }
      const at = new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300));
      if (type === 'p') game.items.addTrap(a, at); else game.items.addTrampoline(a, at);
    } else if (type === 'pp' || type === 'lh' || type === 'pc') { // Cooking Pot Wars: the host handles pot moves
      if (!this.isHost || !game.pots.active) return;
      if (pr.target && !pr.actor.isBotProxy) a.pos.copy(pr.target); // where they are now (their Titan on my screen trails a little)
      if (type === 'pp') game.pots.remotePlace(a, new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300)));
      else if (type === 'lh') game.pots.remoteHit(a, num(d[0], 0, TEAMS.length - 1) | 0);
      else game.pots.remoteCapture(a, num(d[0], 0, TEAMS.length - 1) | 0);
    } else if (type === 'ps') { // the host: who smashed a pot
      if (peer === this.hostPeer && game.pots.active) game.pots.remoteSmash(num(d[0], 0, TEAMS.length - 1) | 0, typeof d[1] === 'string' ? this._actorOf(d[1]) : null);
    } else if (type === 'd') { // this player was knocked out
      const killer = typeof d[0] === 'string' ? this._actorOf(d[0]) : null;
      const food = typeof d[1] === 'string' ? d[1] : '';
      game.remoteKnockout(a, killer, food);
    }
  }
}
