// Online multiplayer over a "room": everyone who has the game open right now with the same room
// code. Each code is its own match. The room is the public peer-to-peer service (p2p.js), or the
// claude.ai artifact "room" capability where that can't be reached; both work the same way.
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
// Ultimate alts (0.31): a Titan's ability moves it on its own game; its area effect (a splat, a
// shockwave, spikes, a berry spiral, flames) goes out as an 'ab' event and every game applies it to its
// own Titans. Jump-pad bounces ('jb') wear the pad down on every game.
//
// Size (0.33): the claude.ai room takes at most 4 KiB of presence per player and refuses anything
// bigger (the update is lost), so every update is packed to fit: throws leave out what a receiver
// assumes anyway, a bot's name, colour and skin come round every third of a second, and the events
// that have gone out the fewest times go first while they fit (each goes out several times: an
// update can be missed). Receivers keep the numbers of the events they've had, so order doesn't matter.
//
// The floor (0.44): food and utensils lying around are the same for everyone. The food spots fill
// from a seed, the host says which hold food (sp); anything else on the floor comes from the one game
// that dropped it ('it' food, 'ut' a utensil, 'ub' a delivery box, each with a key) and taking it
// goes out by its key ('g' food, 'ug' a utensil or a box). Each carries the round number: one for a
// round that hasn't started here yet waits for it.
//
// Low internet (0.45): Settings, Online connection: Normal, Low internet or Auto (Low when the device
// says its connection is slow or saves data, or the room's line can't keep up). Low sends an update
// 10 times a second instead of 30, each event goes out at least 3 times instead of 6 (they stay in
// the log just as long), and in a peer-to-peer room the hub passes the others' updates on to a
// Low player 10 times a second too (only the latest of each). Remote Titans are drawn a little
// further ahead when updates come less often.
//
// Teams and Cooking Pot Wars (0.26): the room settings carry the mode and the team size; every
// Titan's state carries its team and the pot on its back. Players pick their team (state), the host
// fills the rest with bots. In Cooking Pot Wars the host owns the pots and shares them (pw); players
// send their pot moves as events: set the pot down (pp), a ladle hit (lh), a pot carried home (pc);
// the host announces who smashed a pot (ps). Turret shots carry their power (tm).
import * as THREE from 'three';
import { clamp, rand, FLOOR_BOUNDS, hashStr } from './core.js';
import { FOODS, FOOD_IDS, SHOOTER_DECIDES } from './foods.js';
import { Actor } from './actors.js';
import { UTENSIL_BY_ID, UTENSIL_IDS } from './utensils.js';
import { TEAMS, cleanSize } from './teams.js';
import { p2pLobby } from './p2p.js';

const COLORS = ['#ff9a1f', '#6fc2ff', '#9be15d', '#c38bff', '#ff6f91', '#4fd1c5', '#ffcf3a', '#ff7b54', '#8fa8ff', '#e0a0ff', '#63e6a5', '#f2f2f2'];
const FLAG = { charging: 1, shield: 2, frozen: 4, rooted: 8, tripped: 16, burning: 32, wet: 64, gliding: 128, eating: 256, dashing: 512, juiced: 1024, ground: 2048, ladle: 4096, turret: 8192 };
const SEND_EVERY = 1 / 30, SEND_LOW = 1 / 10; // (0.45: Low internet)
// The Online connection setting (0.45), remembered: 'auto', 'normal' or 'low'.
export function netPref() {
  try { const v = localStorage.getItem('tt-net'); if (v === 'normal' || v === 'low') return v; } catch { /* storage blocked */ }
  return 'auto';
}
export function setNetPref(v) { try { if (v === 'normal' || v === 'low') localStorage.setItem('tt-net', v); else localStorage.removeItem('tt-net'); } catch { /* storage blocked */ } }
// What the device says about its connection (Chrome and Android tell; Safari doesn't).
const slowDevice = () => { const c = navigator.connection; return !!c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType)); };
const LOG_KEEP = 1.5;   // seconds an event stays in the rolling log (pot moves: 3 s; 0.44: was 0.7, too short for a slow game)
const LOG_MAX = 90;
const MIN_SENT = 6;     // an event leaves the log once it went out this often and is past LOG_KEEP (pot moves: 5x)
const BUDGET = 3900;    // bytes of one player's presence (the claude.ai room refuses over 4096)
// (0.51) The game's version, in every update: players on different copies of the game (one browser still
// showing an older one) play by different rules, so each is told to reload. Bump it with every release.
export const NET_VERSION = 51;
// What a hit did besides its damage, merged into the claim for it (freezes add up to 3, shoves add up)
function mergeStatus(a, s) {
  for (const [k, v] of Object.entries(s)) {
    if (k === 'cc') a.cc = [...(a.cc || []), ...v].slice(-3);
    else if (k === 'k') a.k = a.k ? a.k.map((x, i) => Math.round((x + v[i]) * 10) / 10) : v;
    else a[k] = v;
  }
  return a;
}
const THROW_DEFAULTS = { g: 1, r: 0.35, l: 6, c: 1 }; // what a receiver assumes for a throw field left out (others: 0)
const POT_EVENTS = new Set(['pp', 'lh', 'pc', 'ps']);
const FLOOR_EVENTS = new Set(['it', 'ut', 'ub', 'g', 'ug']); // (0.44)
// A short check of what lies on the floor (keyed food, boxes, loose utensils): how many, and a sum of
// their hashes (order doesn't matter). The host shares it; a game that disagrees for a while asks.
const floorKeys = (g) => [...g.items.floorKeys(), ...g.utensils.floorKeys()];
const digest = (keys) => { let h = 0; for (const k of keys) h = (h + hashStr(k)) >>> 0; return [keys.length, h]; };
const MAPS_OK = ['kitchen', 'backyard', 'restaurant'], BOTS_OK = ['off', 'easy', 'medium', 'hard'];
const MODES_OK = ['classic', 'chef', 'pots'];
const cleanRS = (rs) => { // eslint-disable-line arrow-body-style
  if (!rs || typeof rs !== 'object') return null;
  const mode = MODES_OK.includes(rs.mode) ? rs.mode : 'classic';
  return { map: MAPS_OK.includes(rs.map) ? rs.map : 'kitchen', mode, team: cleanSize(rs.team, mode), bots: BOTS_OK.includes(rs.bots) ? rs.bots : 'medium', since: num(rs.since, 0, 1e15) };
};
const STATES = ['drop', 'play', 'over'];
const cleanRD = (rd) => (Array.isArray(rd) ? [num(rd[0], 0, 1e6) | 0, STATES.includes(rd[1]) ? rd[1] : 'play',
  num(rd[2], -300, 300), num(rd[3], -300, 300), num(rd[4], 0, 400, 330), num(rd[5], 0, 10) | 0, rd[6] === 'shrink' ? 'shrink' : 'wait',
  num(rd[7], 0, 120), typeof rd[8] === 'string' && rd[8] ? cleanName(rd[8]).slice(0, 16) : '', num(rd[9], 0, 1e4), num(rd[10], -300, 300), num(rd[11], -300, 300), num(rd[12], 0, 400), rd[13] === 1 ? 1 : 0] : null);
// (0.44) An id from the room (a food, utensil, skin): plain lower-case words only, so never a name every
// object has (toString, constructor...) that a table lookup would find.
const safeId = (v) => (typeof v === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(v) && v !== 'constructor' ? v : '');
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const fin = (v) => (Number.isFinite(v) ? v : 0);
// UTF-8 bytes of a string (the room's limits are in bytes)
const utf8 = (s) => { let n = s.length; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c > 0x7f) n += c > 0x7ff && (c < 0xd800 || c > 0xdfff) ? 2 : 1; } return n; };
const roundAll = (o) => (typeof o === 'number' ? r2(o) : Array.isArray(o) ? o.map(roundAll) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, roundAll(v)])) : o);
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
    via: 'mock',
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
        // as strict as the claude.ai room: plain JSON, a null field removed, at most 4 KiB in all, else refused
        async presence(patch) {
          const next = { ...mine };
          for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k]; else next[k] = v;
          const bad = (v, d) => (d > 8 || v === undefined || typeof v === 'function' || (typeof v === 'number' && !Number.isFinite(v))
            || (v && typeof v === 'object' && (Array.isArray(v) ? v.some((x) => bad(x, d + 1)) : Object.values(v).some((x) => bad(x, d + 1)))));
          const size = utf8(JSON.stringify(next));
          if (bad(next, 1) || size > 4096) {
            window.__mockRefused = (window.__mockRefused || 0) + 1;
            throw Object.assign(new Error(size > 4096 ? `presence is ${size} bytes; the limit is 4096` : 'presence is not plain JSON'), { code: 'invalid_argument' });
          }
          window.__mockMax = Math.max(window.__mockMax || 0, size);
          mine = Object.freeze(next); ch.postMessage({ peer: me, presence: mine });
        },
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

// Where online play runs (0.33). On claude.ai the page may not reach any outside server (its security
// policy allows no connections but claude.ai's own), so there it uses the claude.ai room: people signed
// in to claude.ai whom the game is shared with. Anywhere else (the public game page) it uses the public
// peer-to-peer service, which anyone with the link can use. One way per page, so that everyone who
// opens the same link meets in the same place.
const onClaude = () => !!(window.claude && typeof window.claude.use === 'function');
async function claudeRoom() {
  if (window.__fakeClaudeRoom) return mockLobby(); // (tests: a stand-in as strict as the claude.ai room)
  try { return onClaude() ? await window.claude.use('room') : null; } catch { return null; }
}
export async function roomAvailable() {
  if (window.__useMockRoom) return mockLobby();
  const p2p = p2pLobby(window.__peerServer || {});
  const lobby = {
    via: onClaude() && !window.__forceP2P ? 'claude' : 'p2p',
    async join(name) {
      if (lobby.via === 'claude') {
        const room = await claudeRoom();
        if (!room) throw Object.assign(new Error('the claude.ai room is not available to this viewer'), { code: 'claude_room' });
        try { return await room.join(name); } catch (e) { throw Object.assign(new Error(e?.message || 'could not join'), { code: e?.code === 'not_granted' || e?.code === 'not_permitted' ? 'claude_room' : e?.code || 'claude_room' }); }
      }
      return p2p.join(name); // rejects with code 'p2p_server' or 'p2p_host'
    },
  };
  return lobby;
}

export class Net {
  constructor(game) {
    this.game = game;
    this.room = null; this.connected = false;
    this.proxies = new Map(); // peer -> { actor, lastSeq, presence, recvAt, target, netVel, throws }
    this.seq = 0; this.log = []; this.claims = new Map(); this.claim = null; // log: { seq, type, arr (as sent), bytes, t, sent }
    this.frame = 0;
    this.via = '';                // how this room is reached: 'claude' (the claude.ai room) or 'p2p'
    this.refused = 0; this.lost = ''; // updates the room refused; why the room ended (if it did)
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
    this.tag = Math.random().toString(36).slice(2, 6); this.keyN = 0; // (0.44) keys for what I drop on the floor
    this.later = []; // floor events for a round that hasn't started here yet
    this.autoLow = false; this.autoLowUntil = 0; // (0.45) Auto found the line too slow (for a while at least)
  }
  // Low internet now? (the setting; on Auto, the device or the line says so)
  get low() { const m = netPref(); return m === 'low' || (m === 'auto' && (this.autoLow || slowDevice())); }
  newKey() { return `${this.tag}${(++this.keyN).toString(36)}`; }

  roomSettings() { return this.hostSettings ? { ...this.hostSettings } : { ...this.settings }; }

  async connect(lobby, roomName, name, settings = {}) {
    this.settings = cleanRS({ ...this.settings, ...settings });
    this.loadout = Array.isArray(settings.loadout) && settings.loadout.length === 3 ? settings.loadout.filter((id) => FOODS[id]) : null;
    this.utensil = UTENSIL_BY_ID[settings.utensil] ? settings.utensil : null;
    this.joinedAt = performance.now();
    this.name = cleanName(name);
    this.roomName = cleanRoom(roomName);
    this.color = COLORS[(Math.random() * COLORS.length) | 0];
    this.via = lobby.via || '';
    this.room = await lobby.join(this.roomName);
    const ended = (e) => this._ended(e);
    this.room.onConnection((c) => { this.connected = c; }, ended);
    this.room.onPeers(() => {}, ended); // (keeps the room's list of players coming, and hears if the room ends)
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

  // The room ended for good (access withdrawn, or the platform closed it).
  _ended(e) {
    if (!this.room || this.lost) return;
    this.connected = false;
    this.lost = (e && e.code) || 'ended';
    console.warn('[online] the room ended:', this.lost, e && e.message);
    this.game.hud.banner('Lost the online room', 'Leave and join again', 4);
  }

  playerCount() { return 1 + this.proxies.size; }
  // local bots (host only)
  _localBots() { return this.isHost ? this.game.actors.filter((a) => a.isBot && !a.isRemote) : []; }

  // ---------------------------------------------------------------- outgoing
  event(type, ...data) {
    this.seq++;
    const arr = JSON.parse(JSON.stringify([this.seq, type, ...data])); // (plain JSON: what the room takes)
    this.log.push({ seq: this.seq, type, arr, bytes: utf8(JSON.stringify(arr)) + 1, t: this.game.time, sent: 0 });
  }

  sendThrow(o) {
    const q = (v) => [r2(v.x), r2(v.y), r2(v.z)];
    const t = { f: o.food, p: q(o.pos), v: q(o.vel) };
    // (0.33) only what differs from what a receiver assumes (THROW_DEFAULTS, else 0 or nothing)
    const put = (k, v) => {
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (typeof v === 'number') { v = r2(v); if (v !== (THROW_DEFAULTS[k] ?? 0)) t[k] = v; } else if (typeof v === 'string' && v) t[k] = v;
    };
    put('g', o.gravity); put('r', o.radius ?? FOODS[o.food]?.radius); put('l', o.life); put('o', !!o.orient); put('rl', !!o.roll);
    put('c', o.charge); put('cv', o.curve); put('b', o.bounces); put('fu', o.fuse); put('sk', o.seek ? this._peerOf(o.seek) : '');
    put('tu', o.turn); put('rt', o.retarget); put('sh', !!o.shootable); put('br', o.bruise); put('sp', o.spin);
    if (o.u) { t.u = o.u; t.x = roundAll(o.x || {}); } // utensil-boosted throw
    if (o.owner && o.owner !== this.game.player) t.ow = o.owner.id; // one of my bots threw it
    if (o.turret) t.tm = r2(o.turret); // fired from a pot's turret
    this.event('t', t);
  }

  // (0.48) My throw hit them (a carrot, a berry, a grape: see SHOOTER_DECIDES): their game takes the damage.
  // What it does to them besides the damage (a freeze, a burn, a slow, a shove) goes with it: the status
  // calls on their Titan here land in noteStatus (before or after this, in the same instant).
  // (0.51) Hits on the same Titan by the same thrower until my next update go as one claim, their damage
  // added up: a stream of blueberries was one message a berry, crowding out the rest (throws, splats, pickups).
  claimHit(target, attacker, food, amount, head) {
    const to = this._peerOf(target), t = this.game.time;
    if (!to) return;
    const by = attacker !== this.game.player ? attacker.id : null, key = `${to}/${by}`;
    let c = this.claims.get(key);
    if (!c) this.claims.set(key, (c = { to, by, food, amt: 0, head: 0, st: {} }));
    c.amt += amount; c.food = food; if (head) c.head = 1;
    if (this.stBuf && this.stBuf.actor === target && this.stBuf.t === t) mergeStatus(c.st, this.stBuf.st);
    this.claim = { target, t, c };
  }
  noteStatus(actor, s) {
    const t = this.game.time;
    if (s.cc) s = { cc: [s.cc] };
    if (s.k) s = { k: s.k.map((v) => Math.round(v * 10) / 10) };
    if (this.claim && this.claim.target === actor && this.claim.t === t) { mergeStatus(this.claim.c.st, s); return; } // (after the hit, in the same instant)
    if (!this.stBuf || this.stBuf.actor !== actor || this.stBuf.t !== t) this.stBuf = { actor, t, st: {} };
    mergeStatus(this.stBuf.st, s);
  }
  _flushClaims() {
    for (const c of this.claims.values()) this.event('hc', c.to, c.food, Math.round(c.amt * 10) / 10, c.head, c.by, c.st);
    this.claims.clear(); this.claim = null;
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

  _sendState() {
    const p = this.game.player, g = this.game, t = g.time;
    this.frame = (this.frame + 1) % 1e6;
    this._flushClaims();
    // every field, every time: what isn't mine (any more) goes out as null, which takes it off my presence
    const msg = { v: NET_VERSION, n: this.name, c: this.color, k: this.game.playerSkin, w: this.ready ? 1 : 0, hl: g.highlights.playing?.live ? 1 : 0, s: this._stateOf(p, this.game.input.pitch), pm: null, rs: null, rd: null, b: null, pw: null, e: [] };
    if (g.mode === 'pots') msg.pm = (g.potMenu || []).map((id) => FOOD_IDS.indexOf(id).toString(36)).join(''); // my pick for my pot's menu
    if (this.isHost && g.pots.active) msg.pw = [Math.max(0, g.round.id), ...g.pots.state()]; // Cooking Pot Wars: the pots
    msg.sp = this.isHost && g.round.id >= 0 ? [g.round.id, g.items.spawnerCode()] : null; // (0.44) which food spots hold food
    msg.fh = this.isHost && g.round.id >= 0 ? [g.round.id, ...digest(floorKeys(g))] : null; // ... and a check of the rest of the floor
    msg.fq = !this.isHost && this.floorAsk ? g.round.id : null; // my floor doesn't match the host's: tell me again
    const H = g.world.honeys; // (0.44) honey pools: the host's levels; what my Titan took goes to the host
    msg.hy = this.isHost && H.length ? H.map((h) => Math.round(h.cap)) : null;
    msg.lm = this.isHost ? (g.world.landmark?.alive ? 1 : 0) : null; // (0.44) is the giant tomato standing (the host's says)
    if (!this.isHost && t > (this.honeyT || 0)) {
      this.honeyT = t + 0.5;
      H.forEach((h, i) => { if (h.owed >= 1) { this.event('hd', i, Math.round(h.owed)); h.sent = (h.sent || 0) + h.owed; h.sentAt = t; h.owed = 0; } });
    }
    if (this.isHost) {
      const R = g.round, T = g.tide, to = T.to || { x: T.x, z: T.z, r: T.r };
      msg.rs = { ...this.roomSettings(), since: this.hostSince };
      msg.rd = [Math.max(0, fin(R.id)), STATES.includes(R.state) ? R.state : 'drop', r2(T.x), r2(T.z), r2(T.r), fin(T.phase), T.mode === 'shrink' ? 'shrink' : 'wait', r2(Math.max(0, T.t)), R.winner || '', r2(R.t), r2(to.x), r2(to.z), r2(to.r), R.fresh ? 1 : 0];
      // a bot's name, colour and skin only every 10th update (receivers keep them)
      msg.b = this._localBots().map((a) => [a.id, (this.frame + a.id) % 10 ? 0 : [a.name, a.color, a.skinId || 'chef'], ...this._stateOf(a, Math.asin(clamp(a.aimDir.y, -1, 1)))]);
    }
    // the events: drop the stale ones, then pack the rest, those sent the fewest times first (a pot move
    // counts a fifth: it goes out five times as often), then the oldest first, while they fit
    const potEv = (ev) => POT_EVENTS.has(ev.type), minSent = this.low ? 3 : MIN_SENT; // (Low: fewer updates, each event in fewer)
    this.log = this.log.filter((ev) => {
      const age = t - ev.t, pot = potEv(ev);
      return age < (pot ? 6 : 4) && (ev.sent < minSent * (pot ? 5 : 1) || age < (pot ? 3 : LOG_KEEP));
    }).slice(-LOG_MAX);
    let space = this.budget() - utf8(JSON.stringify(msg));
    const out = [];
    for (const ev of [...this.log].sort((a, b) => (potEv(a) ? a.sent / 5 : a.sent) - (potEv(b) ? b.sent / 5 : b.sent) || a.seq - b.seq)) {
      if (ev.bytes <= space) { out.push(ev); space -= ev.bytes; }
    }
    out.sort((a, b) => a.seq - b.seq);
    msg.e = out.map((ev) => ev.arr);
    const json = JSON.stringify(msg);
    if (utf8(json) > this.budget()) { this._refuse({ code: 'too_big', message: `${utf8(json)} bytes` }); return; } // (can't happen: the base is under 2 KB)
    for (const ev of out) ev.sent++;
    this.lastBytes = utf8(json);
    this.room.presence(JSON.parse(json)).catch((e) => this._refuse(e)); // (plain JSON, nothing the room could call exotic)
  }
  budget() { return BUDGET; }
  // The room refused an update (it's lost, the next one follows): say so once, in the console.
  _refuse(e) {
    this.refused++;
    if (this.refused === 1 || this.refused % 300 === 0) console.warn(`[online] the room refused an update (${this.refused} so far):`, e && (e.code || ''), e && e.message);
    if (e && ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) this._ended(e);
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
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r1(p.vel.x), r1(p.vel.y), r1(p.vel.z), r2(p.yaw), r2(pitch),
      Math.round(fin(p.hp)), Math.round(fin(p.glaze)), p.alive ? 1 : 0, p.selected()?.id || '', f, fin(p.kills), r1(Math.min(99, t - p.noiseAt)), p.utensil || '', invCode(p), kitCode(p), p.team ?? -1, p.carry ?? -1];
  }

  // ---------------------------------------------------------------- incoming
  tick(dt) {
    if (!this.room) return;
    const now = this.game.time;
    // (0.44) a host whose game stopped for a while (a tab in the background) and finds someone else took
    // over meanwhile steps down at once, before it says it hosts again (else both would give way)
    const wall = performance.now();
    if (this.isHost && this.tickAt && wall - this.tickAt > 2500
      && this.room.peers().some((p) => !p.sameTab && p.kind === 'viewer' && cleanRS(p.presence?.rs))) {
      this.isHost = false; this.game.round.id = -1;
    }
    this.tickAt = wall;
    // (0.45) Auto: the room's line couldn't keep up (updates held back): Low for at least 30 s
    const jam = this.room.congested?.() || 0;
    if (jam >= 5) { if (!this.autoLow && netPref() === 'auto') this.game.hud.toast('Slow connection: low internet mode is on'); this.autoLow = true; this.autoLowUntil = wall + 30000; }
    else if (this.autoLow && wall > this.autoLowUntil) this.autoLow = false;
    const low = this.low;
    this.room.setLow?.(low); // (peer-to-peer: the hub sends me the others' updates less often)
    this.sendT += dt;
    const every = low ? SEND_LOW : SEND_EVERY;
    if (this.sendT >= every && this.game.player) { this.sendT = Math.min(this.sendT - every, every); this._sendState(); } // (the remainder carries over: 30 or 10 a second exactly)

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
    let told = false;
    for (const pr of this.proxies.values()) { // (0.44) someone new, or whose floor disagrees: the host goes over it
      if (pr.presence?.fq === this.game.round.id && pr.floorAt == null && now > (pr.floorTold || 0) + (pr.floorWait || 4)) {
        pr.floorAt = now; pr.floorWait = Math.min(30, (pr.floorWait || 2) * 2); // (asking again and again: less often)
      } else if (pr.presence?.fq == null) pr.floorWait = 0;
      if (pr.floorAt == null || now < pr.floorAt || told) continue;
      const asked = pr.presence?.fq != null;
      pr.floorAt = null; pr.floorTold = now;
      if (this.isHost && this.game.round.id >= 0) { this._tellFloor(asked); told = true; } // (once per update)
    }
    if (this.floorQueue?.length) for (const e of this.floorQueue.splice(0, 3)) this.event(...e);

    // smooth remote Titans toward where they are now (extrapolated a little)
    for (const pr of [...this.proxies.values(), ...this.botProxies.values()]) {
      const a = pr.actor;
      if (!a.alive) continue;
      pr.gap = pr.gap == null ? 0.1 : pr.gap; // (how often their updates come: further ahead when it's seldom)
      const lead = Math.min(Math.max(0.25, pr.gap * 1.6), 0.45, now - pr.recvAt);
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
      if (rs) hosts.push([peer.peer, rs.since, peer.presence, rs, num(peer.presence.rd?.[0], -1, 1e6, -1)]);
    }
    if (this.isHost && this.myPeer) hosts.push([this.myPeer, this.hostSince, null, null, this.game.round.id]);
    // (0.44) two hosts: the one on the later round (a host whose game stopped for a while, while someone
    // else took over and started a new round, steps down); on the same round, whoever hosted first
    hosts.sort((a, b) => b[4] - a[4] || a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const top = hosts[0];
    if (top && top[0] !== this.myPeer) {
      if (this.isHost) { this.isHost = false; this.game.round.id = -1; } // someone hosted first: follow them
      if (this.hostPeer !== top[0]) { this.hostPeer = top[0]; for (const key of [...this.botProxies.keys()]) if (!key.startsWith(`${top[0]}|`)) this._dropBot(key); }
      this.hostSettings = top[3];
      this.hostRound = cleanRD(top[2].rd);
      this._syncBots(top[0], top[2].b);
      const pw = top[2].pw; // Cooking Pot Wars: the host's pots (for this round only)
      if (Array.isArray(pw) && pw[0] === this.game.round.id) this.game.pots.applyState(pw.slice(1), num);
      const sp = top[2].sp; // (0.44) the host's food spots (this round's)
      if (Array.isArray(sp) && sp[0] === this.game.round.id && typeof sp[1] === 'string' && sp[1].length <= 400) this.game.items.applySpawners(sp[1]);
      const L = this.game.world.landmark, lm = top[2].lm; // (0.44) the giant tomato: as the host's (a burst here waits 2 s for the host's)
      if (L && lm === 0 && L.alive) this.game.burstLandmark(null);
      else if (L && lm === 1 && !L.alive && this.game.time - (L.burstAt ?? -9) > 2) L.regrowAt = 0;
      const hy = top[2].hy, H = this.game.world.honeys; // (0.44) the honey pools
      if (Array.isArray(hy) && hy.length === H.length) H.forEach((h, i) => { // (what I took and sent counts here until the host's level surely has it)
        if (h.sent && this.game.time - h.sentAt > 1) h.sent = 0;
        h.cap = Math.max(0, num(hy[i], 0, h.max, h.cap) - (h.owed || 0) - (h.sent || 0));
      });
      const fh = top[2].fh; // ... and the check of the rest of the floor: ask again if mine disagrees for 3 s
      if (Array.isArray(fh) && fh[0] === this.game.round.id) {
        const [n, h] = digest(floorKeys(this.game));
        if (n === fh[1] && h === fh[2]) { this.floorOff = null; this.floorAsk = false; } else {
          this.floorOff ??= this.game.time;
          if (this.game.time - this.floorOff > 3) this.floorAsk = true;
        }
      }
    } else if (!top && this.myPeer && performance.now() - this.joinedAt > 1500) {
      let lowest = this.myPeer;
      for (const peer of this.proxies.keys()) if (peer < lowest) lowest = peer;
      if (lowest === this.myPeer) { // nobody hosts (a new room, or the host left): I do
        const takeover = this.game.round.id >= 0; // the host left mid-game
        this.isHost = true; this.hostSince = Date.now(); this.hostPeer = this.myPeer;
        for (const key of [...this.botProxies.keys()]) this._dropBot(key);
        if (takeover) { // their bots left with them: a fresh round (with my bots) in 3 s
          Object.assign(this.game.round, { state: 'over', t: 3, winner: '', fresh: true }); // (fresh: nobody won it)
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
      // each: [id, its name/colour/skin (every 10th update, else 0), ...its state]
      for (const e of list.slice(0, 11)) {
        if (!Array.isArray(e) || e.length < 22) continue;
        const key = `${hostPeer}|b${num(e[0], 1, 11) | 0}`;
        const meta = Array.isArray(e[1]) ? e[1] : null;
        let pr = this.botProxies.get(key);
        if (!pr) {
          if (!meta) continue; // a new bot: it shows up once its name comes round
          const actor = new Actor(this.game, { id: 200 + this.botProxies.size, name: cleanName(meta[0]), color: /^#[0-9a-f]{6}$/i.test(meta[1]) ? meta[1] : '#f2f2f2', isBot: false });
          actor.isRemote = true; actor.isBotProxy = true; actor.gliding = false;
          actor.applySkin(safeId(meta[2]) || 'chef');
          pr = { actor, lastSeq: 0, presence: null, recvAt: this.game.time, target: new THREE.Vector3(), netVel: new THREE.Vector3(), throws: [] };
          this.botProxies.set(key, pr);
          this.game.actors.push(actor);
        }
        seen.add(key);
        if (meta) {
          pr.actor.name = cleanName(meta[0]);
          if (/^#[0-9a-f]{6}$/i.test(meta[1])) pr.actor.ownColor = meta[1];
          if (safeId(meta[2]) && meta[2] !== pr.actor.skinId) pr.actor.applySkin(meta[2]);
        }
        this._applyState(pr, e.slice(2));
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
    actor.applySkin(safeId(pres.k) || 'chef'); // unknown ids fall back to the chef
    const pr = { actor, lastSeq: null, presence: null, recvAt: game.time, target: new THREE.Vector3(), netVel: new THREE.Vector3(), throws: [] };
    pr.floorAt = game.time + 1; // (0.44) the host tells them what's on the floor, once they hear it
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
    pr.watching = pres.hl === 1; // (0.38) watching the round's highlight reel (the next round waits for them)
    pr.actor.name = cleanName(pres.n);
    this._checkVersion(pr, pres.v);
    if (/^#[0-9a-f]{6}$/i.test(pres.c)) pr.actor.ownColor = pres.c;
    pr.potMenu = typeof pres.pm === 'string' && pres.pm.length <= 5 ? [...pres.pm].map((c) => FOOD_IDS[parseInt(c, 36)]).filter(Boolean) : null;
    this._applyState(pr, pres.s);

    // events we haven't seen yet (0.33: they may come in any order: each is numbered, and we keep the
    // numbers we've had; everything at or below lastSeq counts as had)
    const ev = (Array.isArray(pres.e) ? pres.e : []).filter((e) => Array.isArray(e) && typeof e[0] === 'number');
    if (pr.lastSeq === null) { // first sight: skip history (but what's on the floor is safe to go over again)
      pr.lastSeq = ev.reduce((m, e) => Math.max(m, e[0]), 0); pr.seen = new Set();
      for (const e of ev) if (FLOOR_EVENTS.has(e[1])) this._event(pr, e[1], e.slice(2), peer, e[0]);
      return;
    }
    for (const e of ev) {
      if (e[0] <= pr.lastSeq || pr.seen.has(e[0])) continue;
      pr.seen.add(e[0]);
      this._event(pr, e[1], e.slice(2), peer, e[0]);
    }
    if (pr.seen.size > 300) { // (an update only carries a player's last 90 events: older numbers can go)
      let top = 0; for (const q of pr.seen) top = Math.max(top, q);
      pr.lastSeq = Math.max(pr.lastSeq, top - 200);
      for (const q of pr.seen) if (q <= pr.lastSeq) pr.seen.delete(q);
    }
  }

  // (0.51) Someone on a different copy of the game: tell everyone who can fix it to reload (every 30 s
  // while it lasts). Games before 0.51 don't say their version.
  _checkVersion(pr, v) {
    const theirs = typeof v === 'number' ? v : 0, now = this.game.time;
    pr.version = theirs;
    if (theirs === NET_VERSION || now < (pr.versionToldAt ?? -1e9) + 30) return;
    pr.versionToldAt = now;
    const name = pr.actor.name || 'Someone', hud = this.game.hud;
    if (theirs < NET_VERSION) hud.banner(`${name} has an older copy of the game`, 'They need to reload the game page, or online play glitches', 6);
    else hud.banner('There is a newer version of the game', `${name} has it: reload this page so you play by the same rules`, 6);
    console.warn(`[online] ${name} plays version ${theirs || 'older than 51'}, this is ${NET_VERSION}`);
  }

  // A Titan's shared state (a player's or one of the host's bots).
  _applyState(pr, s) {
    const game = this.game, a = pr.actor, now = game.time;
    if (pr.recvAt != null && now > pr.recvAt) pr.gap = (pr.gap ?? 0.1) * 0.8 + Math.min(1, now - pr.recvAt) * 0.2;
    pr.recvAt = now;
    const B = FLOOR_BOUNDS;
    pr.target.set(num(s[0], B.minX, B.maxX), num(s[1], -40, 120), num(s[2], B.minZ, B.maxZ));
    pr.netVel.set(num(s[3], -80, 80), num(s[4], -80, 80), num(s[5], -80, 80));
    a.yaw = num(s[6], -1e3, 1e3);
    a.lookPitch = num(s[7], -1.6, 1.6); // their Titan looks up and down where they aim
    const hp = num(s[8], 0, 200, 200);
    if (a.alive && hp < a.hp - 0.5) a.hitFlash = 1; // (0.48: hit: a flash, as on their own screen)
    a.hp = hp;
    a.glaze = num(s[9], 0, 100);
    const alive = s[10] === 1;
    if (!pr.placed) { // (0.44) first sight: just where they are, as they are (they were made at the map's middle, standing)
      pr.placed = true;
      a.pos.copy(pr.target);
      a.alive = alive;
      if (alive) a.root.visible = true; else a.hide();
    } else if (a.alive && !alive) { // knocked out
      a.alive = false;
      game.fx.burst('splat-out', a.center(new THREE.Vector3()));
      game.sfx.play('splatout', a.pos);
      a.hide();
    } else if (!a.alive && alive) {
      a.alive = true; a.root.visible = true;
      a.pos.copy(pr.target);
    }
    const held = FOOD_IDS.includes(s[11]) && !FOODS[s[11]].hidden ? s[11] : null;
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
    a.utensil = UTENSIL_IDS.includes(s[15]) ? s[15] : null; // drawn in their left hand
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
      if (victim) game.remoteKnockout(victim, typeof d[1] === 'string' ? this._actorOf(d[1]) : null, safeId(d[2]));
      return;
    }
    let a = pr.actor;
    if (type === 't') {
      const o = d[0];
      if (!o || typeof o !== 'object') return;
      if (o.ow !== undefined) { a = botOf(o.ow); if (!a) return; }
      const food = safeId(o.f) && FOODS[o.f];
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
      if (d[3] != null) { a = botOf(d[3]); if (!a) return; }
      const at = new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300));
      if (type === 'p') {
        game.items.addTrap(a, at);
        if (typeof d[4] === 'string') game.utensils.remoteTrapFx(d[4], a, at); // (0.44) the peel's utensil mark
      } else game.items.addTrampoline(a, at);
    } else if (type === 'hc') { // (0.48) their throw hit one of my Titans (they decide carrots, berries, grapes)
      if (d[4] != null) { a = botOf(d[4]); if (!a) return; }
      const t = typeof d[0] === 'string' ? this._actorOf(d[0]) : null, food = safeId(d[1]);
      if (!t || t.isRemote || !t.alive || !SHOOTER_DECIDES.has(food) || a.pos.distanceTo(t.pos) > 300) return;
      const now = game.time; // (no more than a knife-diced grape burst's worth a second, on each of my Titans)
      const log = (a.netClaims ||= new Map()), list = (log.get(t) || []).filter((x) => now - x < 1);
      if (list.length >= 60) return;
      list.push(now); log.set(t, list);
      game.damage(t, num(d[2], 0, 800), a, food, { head: d[3] === 1, claimed: true }); // (0.51: hits until their next update, added up)
      const st = d[5] && typeof d[5] === 'object' ? d[5] : null; // what else it did to them
      if (st && t.alive) {
        const n = (v, hi) => num(v, 0, hi);
        if (Array.isArray(st.s)) t.addSticky(n(st.s[0], 1), n(st.s[1], 8));
        if (st.b) t.burn(n(st.b, 8));
        if (st.w) t.setWet(n(st.w, 8));
        if (st.j) t.juice(n(st.j, 8));
        if (Array.isArray(st.cc)) for (const c of st.cc.slice(0, 3)) if (Array.isArray(c) && ['frozen', 'rooted', 'tripped', 'stunned'].includes(c[0])) t.applyHardCC(c[0], n(c[1], 4));
        if (Array.isArray(st.k)) t.knock(new THREE.Vector3(num(st.k[0], -40, 40), num(st.k[1], -40, 40), num(st.k[2], -40, 40)));
      }
    } else if (type === 'hd') { // (0.44) their Titan took glaze from a honey pool (the host keeps the pools)
      const h = this.isHost ? game.world.honeys[num(d[0], 0, 20) | 0] : null;
      if (h) h.cap = Math.max(0, h.cap - num(d[1], 0, 200));
    } else if (type === 'pt') { // (0.44) someone slipped on a peel: it's used up
      game.items.remoteTrapGone(num(d[0], -300, 300), num(d[1], -300, 300));
    } else if (type === 'pp' || type === 'lh' || type === 'pc') { // Cooking Pot Wars: the host handles pot moves
      if (!this.isHost || !game.pots.active) return;
      if (pr.target && !pr.actor.isBotProxy) a.pos.copy(pr.target); // where they are now (their Titan on my screen trails a little)
      if (type === 'pp') game.pots.remotePlace(a, new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300)));
      else if (type === 'lh') game.pots.remoteHit(a, num(d[0], 0, TEAMS.length - 1) | 0);
      else game.pots.remoteCapture(a, num(d[0], 0, TEAMS.length - 1) | 0);
    } else if (type === 'ps') { // the host: who smashed a pot
      if (peer === this.hostPeer && game.pots.active) game.pots.remoteSmash(num(d[0], 0, TEAMS.length - 1) | 0, typeof d[1] === 'string' ? this._actorOf(d[1]) : null);
    } else if (type === 'ab') { // an ultimate alt (0.31): its area effect runs here too, on my Titans
      if (d[2] !== undefined) { a = botOf(d[2]); if (!a) return; }
      if (typeof d[0] !== 'string' || d[0].length > 3) return;
      game.abilities.remote(a, d[0], Array.isArray(d[1]) ? d[1].slice(0, 6) : []);
    } else if (type === 'it' || type === 'ut' || type === 'ub' || type === 'g' || type === 'ug') { // (0.44) the floor
      this._floor(type, d);
    } else if (type === 'fl') { // (0.44) the host's whole floor (see _tellFloor)
      // each piece: every key the host has whose hash falls in piece b of n
      if (peer !== this.hostPeer || this.isHost || (num(d[0], -1, 1e6, -1) | 0) !== game.round.id || typeof d[3] !== 'string') return;
      const n = num(d[2], 1, 400, 1) | 0, b = num(d[1], 0, n - 1) | 0;
      const keys = new Set(d[3].split(' ').filter(Boolean)), mine = (k) => hashStr(k) % n === b;
      game.items.keepOnly(keys, mine); game.utensils.keepOnly(keys, mine);
    } else if (type === 'jb') { // someone bounced on a jelly jump pad (wears it down)
      game.items.remoteBounce(new THREE.Vector3(num(d[0], -300, 300), num(d[1], -40, 120), num(d[2], -300, 300)));
    } else if (type === 'd') { // this player was knocked out
      const killer = typeof d[0] === 'string' ? this._actorOf(d[0]) : null;
      const food = safeId(d[1]);
      game.remoteKnockout(a, killer, food);
    }
  }

  // (0.44) Food or a utensil on the floor: dropped, taken (see the top). d[0] is the round.
  _floor(type, d) {
    const game = this.game, rid = num(d[0], -1, 1e6, -1) | 0;
    if (rid !== game.round?.id) { // not this round: an older one's is stale, a newer one's waits for it
      if (rid > (game.round?.id ?? -1)) { this.later.push([type, d]); if (this.later.length > 300) this.later.shift(); }
      return;
    }
    const key = typeof d[1] === 'string' && d[1].length <= 24 ? d[1] : null;
    if (!key) return;
    const v3 = (i) => new THREE.Vector3(num(d[i], -300, 300), num(d[i + 1], -60, 200), num(d[i + 2], -300, 300));
    if (type === 'it') {
      const id = d[2];
      if (!FOOD_IDS.includes(id) && id !== 'heal' && id !== 'peel') return;
      game.items.remoteDrop(key, id, num(d[3], 1, 999, 1) | 0, v3(4), d.length >= 10 ? v3(7) : null);
    } else if (type === 'g') game.items.remoteTake(key, num(d[2], 1, 999, 999) | 0, d[3] === 1);
    else if (type === 'ug') game.utensils.remoteTake(key);
    else if (UTENSIL_IDS.includes(d[2])) {
      if (type === 'ut') game.utensils.remoteDrop(key, d[2], v3(3));
      else game.utensils.remoteBox(key, d[2], v3(3), d[6] === 1);
    }
  }
  // (host) What lies on the floor, for everyone: every key ('fl': whatever else a game has went), then
  // each thing again.
  // They go out a few per update (floorQueue), so they don't push other events out of the log. A list too
  // long for one event goes without the keys (nothing is taken off then).
  _tellFloor(withKeys) {
    const g = this.game, keys = floorKeys(g);
    const n = Math.max(1, Math.ceil(keys.join(' ').length / 240)); // pieces of about 240 characters (the host's updates are full)
    const parts = Array.from({ length: n }, () => []);
    for (const k of keys) parts[hashStr(k) % n].push(k);
    this.floorQueue = [...(withKeys ? parts.map((p, b) => ['fl', g.round.id, b, n, p.join(' ')]) : []), ...g.items.announceList(), ...g.utensils.announceList()];
  }
  // A new round started here: what came for it early.
  flushLater() {
    const l = this.later.filter(([, d]) => (num(d[0], -1, 1e6, -1) | 0) >= this.game.round.id);
    this.later = [];
    for (const [type, d] of l) this._floor(type, d);
  }
}
