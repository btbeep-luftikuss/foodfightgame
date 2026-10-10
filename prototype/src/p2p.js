// Peer-to-peer rooms (0.29): online play for anyone with the game's link, signed in or not, on
// claude.ai or on any website. It speaks the same small "room" interface as the claude.ai room
// capability (presence, peers, onPeers, onConnection, connected, leave), so net.js doesn't care
// which one it got.
//
// How: PeerJS (WebRTC data channels; its free public server only introduces players to each other,
// the game's traffic then goes directly between browsers, through its relay only when a network
// won't allow a direct line). In each room one player's browser is the hub: it claims the room's
// well-known id ("tinytitans-v1-<room code>"), everyone else connects to it, and it passes every
// player's presence on to everyone. If the hub leaves, the others race to claim the id; the winner
// becomes the new hub and the rest reconnect. A player keeps their own id through all of that.
//
// Everything that arrives is untrusted: the hub ties each connection to one player id, drops
// oversized or malformed messages, and net.js checks every value it reads.
import { Peer } from 'peerjs';

const PREFIX = 'tinytitans-foodfight-v1-';
// PeerJS ids allow letters and digits joined by single dashes; room codes are lower case, so the
// other characters a code may have become capitals.
const hubIdFor = (name) => PREFIX + String(name).toLowerCase().replace(/[^a-z0-9]/g, (c) => ({ '.': 'D', '_': 'U', '-': 'H' }[c] || ''));
const STALE_MS = 5000;     // a player not heard from in this long has gone
const HUB_LOST_MS = 3500;  // the hub (or a player's line to it) silent this long: it's gone (a closed tab doesn't always say so)
const MAX_BYTES = 48000;   // one presence message
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class P2PRoom {
  constructor(name, opts) {
    this.name = name;
    this.hubId = hubIdFor(name);
    this.opts = { debug: 0, ...opts };
    this.me = rid();
    this.mine = Object.freeze({});
    this.others = new Map(); // player id -> { presence, seen }
    this.peerHandlers = new Set(); this.connHandlers = new Set();
    this.isHub = false; this.hub = null; this.client = null; this.conn = null; this.links = new Map(); this.heard = new Map(); // (hub) conn -> player id, conn -> last heard
    this.hubSeen = 0;
    this.ok = false; this.closed = false;
    this.snap = this._snapshot();
    this.sweep = setInterval(() => this._sweep(), 1000); // also the keep-alive both ways
  }

  // ------------------------------------------------------------------ the room interface
  async presence(patch) {
    this.mine = Object.freeze({ ...this.mine, ...patch });
    const msg = { t: 'p', id: this.me, p: this.mine };
    if (this.isHub) this._broadcast(msg, null);
    else if (this.conn?.open) try { this.conn.send(msg); } catch { /* dropped: the next one follows */ }
  }
  peers() { return this.snap; }
  onPeers(h) { this.peerHandlers.add(h); queueMicrotask(() => h({ peers: this.snap, joined: this.snap, left: [], updated: [] })); return () => this.peerHandlers.delete(h); }
  onConnection(h) { this.connHandlers.add(h); queueMicrotask(() => h(this.ok)); return () => this.connHandlers.delete(h); }
  connected() { return this.ok; }
  emit() { return Promise.resolve(); }
  on() { return () => {}; }
  async leave() {
    this.closed = true;
    clearInterval(this.sweep);
    const bye = { t: 'bye', id: this.me };
    try { if (this.isHub) this._broadcast(bye, null); else if (this.conn?.open) this.conn.send(bye); } catch { /* gone anyway */ }
    await wait(60);
    this.hub?.destroy(); this.client?.destroy();
  }

  // ------------------------------------------------------------------ connecting
  // Resolves once this player is in the room (as the hub or connected to it); rejects if the
  // introduction server can't be reached at all.
  async start(timeoutMs = 7000) {
    const until = performance.now() + timeoutMs;
    while (!this.closed) {
      const r = await this._attempt();
      if (r === 'ok') return;
      if (r === 'fatal' || performance.now() > until) throw Object.assign(new Error('peer-to-peer service unreachable'), { code: 'p2p_unreachable' });
      await wait(300 + Math.random() * 700);
    }
  }
  _setOk(ok) {
    if (ok === this.ok) return;
    this.ok = ok;
    for (const h of this.connHandlers) try { h(ok); } catch { /* a handler's problem */ }
  }
  // One try: claim the room's id (be the hub), or connect to whoever has it.
  async _attempt() {
    const asHub = await new Promise((resolve) => {
      const p = new Peer(this.hubId, this.opts);
      const done = (v) => { clearTimeout(t); resolve(v); };
      const t = setTimeout(() => { p.destroy(); done('fatal'); }, 6000);
      p.on('open', () => { this.hub = p; done('ok'); });
      p.on('error', (e) => { p.destroy(); done(e.type === 'unavailable-id' ? 'taken' : 'fatal'); });
    });
    if (asHub === 'ok') { this._becomeHub(); return 'ok'; }
    if (asHub === 'fatal') return 'fatal';
    return this._joinHub();
  }
  _becomeHub() {
    this.isHub = true; this.client?.destroy(); this.client = null; this.conn = null;
    this.hub.on('connection', (c) => this._accept(c));
    this.hub.on('disconnected', () => { if (!this.closed) this.hub.reconnect(); }); // lost the introduction server: keep the players, take new ones again when it's back
    this._setOk(true);
  }
  async _joinHub() {
    if (!this.client || this.client.destroyed) {
      const ok = await new Promise((resolve) => {
        const p = new Peer(this.opts);
        const t = setTimeout(() => { p.destroy(); resolve(false); }, 6000);
        p.on('open', () => { clearTimeout(t); this.client = p; resolve(true); });
        p.on('error', (e) => { if (e.type === 'peer-unavailable') this.missing?.(); }); // nobody has the room's id (any more)
        p.on('error', () => { if (this.client !== p) { clearTimeout(t); p.destroy(); resolve(false); } });
        p.on('disconnected', () => { if (!this.closed && !p.destroyed) p.reconnect(); });
      });
      if (!ok) return 'fatal';
    }
    return new Promise((resolve) => {
      const c = this.client.connect(this.hubId, { reliable: false, serialization: 'json' });
      const t = setTimeout(() => { c.close(); resolve('retry'); }, 5000);
      c.on('open', () => {
        clearTimeout(t);
        this.conn = c; this.missing = null; this.hubSeen = Date.now(); this._setOk(true);
        c.send({ t: 'p', id: this.me, p: this.mine });
        resolve('ok');
      });
      c.on('data', (m) => this._fromHub(m));
      c.on('close', () => this._hubGone(c));
      c.on('error', () => this._hubGone(c));
      this.missing = () => { clearTimeout(t); this.missing = null; resolve('retry'); };
    });
  }
  // The hub left: someone else takes over (whoever claims the id first), the rest reconnect.
  async _hubGone(c) {
    if (this.conn !== c || this.closed) return;
    this.conn = null; this._setOk(false);
    await wait(150 + Math.random() * 900);
    while (!this.closed && !this.ok) {
      const r = await this._attempt();
      if (r === 'ok') break;
      await wait(800 + Math.random() * 800);
    }
  }

  // ------------------------------------------------------------------ messages
  _valid(m) { return m && typeof m === 'object' && typeof m.id === 'string' && m.id.length <= 24 && (m.t === 'p' || m.t === 'bye' || m.t === 'k'); }
  _take(m) {
    if (m.id === this.me || m.t === 'k') return;
    if (m.t === 'bye') { if (this.others.delete(m.id)) this._changed(); return; }
    if (!m.p || typeof m.p !== 'object') return;
    this.others.set(m.id, { presence: Object.freeze(m.p), seen: Date.now() });
    this._changed();
  }
  _fromHub(m) {
    this.hubSeen = Date.now();
    if (m && m.t === 'k') return; // keep-alive
    if (Array.isArray(m)) { for (const x of m.slice(0, 64)) if (this._valid(x)) this._take(x); return; } // everyone, on arrival
    if (this._valid(m)) this._take(m);
  }
  // (hub) a player connects: tell them about everyone, then pass on what they send.
  _accept(c) {
    c.on('open', () => {
      const all = [{ t: 'p', id: this.me, p: this.mine }];
      for (const [id, v] of this.others) all.push({ t: 'p', id, p: v.presence });
      try { c.send(all); } catch { /* they'll hear the next round */ }
    });
    this.heard.set(c, Date.now());
    c.on('data', (m) => {
      this.heard.set(c, Date.now());
      if (!this._valid(m)) return;
      const bound = this.links.get(c);
      if (bound && bound !== m.id) return; // one player per connection: no speaking for others
      if (!bound) { if (m.id === this.me) return; this.links.set(c, m.id); }
      if (m.t === 'k') return; // keep-alive
      try { if (JSON.stringify(m).length > MAX_BYTES) return; } catch { return; }
      this._take(m);
      this._broadcast(m, c);
    });
    c.gone = () => {
      const id = this.links.get(c);
      this.links.delete(c); this.heard.delete(c);
      if (id && this.others.delete(id)) { this._changed(); this._broadcast({ t: 'bye', id }, null); }
    };
    c.on('close', c.gone); c.on('error', c.gone);
  }
  _broadcast(m, except) {
    for (const c of this.heard.keys()) if (c !== except && c.open) try { c.send(m); } catch { /* a slow line drops one */ }
  }
  _sweep() {
    const now = Date.now();
    if (this.isHub) {
      this._broadcast({ t: 'k' }, null);
      for (const [c, t] of this.heard) if (now - t > STALE_MS) { c.gone(); try { c.close(); } catch { /* already */ } }
    } else if (this.conn) {
      try { this.conn.send({ t: 'k', id: this.me }); } catch { /* the check below decides */ }
      if (now - this.hubSeen > HUB_LOST_MS) { const c = this.conn; try { c.close(); } catch { /* already */ } this._hubGone(c); }
    }
    let gone = false;
    for (const [id, v] of this.others) if (now - v.seen > STALE_MS) { this.others.delete(id); gone = true; }
    if (gone) this._changed();
  }
  _snapshot() {
    const list = [{ peer: this.me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: this.mine, updatedAt: Date.now() }];
    for (const [peer, v] of this.others) list.push({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.seen });
    return Object.freeze(list);
  }
  _changed() {
    this.snap = this._snapshot();
    for (const h of this.peerHandlers) try { h({ peers: this.snap, joined: [], left: [], updated: [] }); } catch { /* a handler's problem */ }
  }
}

// A lobby like the claude.ai room capability's: join(name) gives that room.
export function p2pLobby(opts = {}) {
  return {
    kind: 'p2p',
    async join(name) {
      const room = new P2PRoom(name, opts);
      try { await room.start(); } catch (e) { await room.leave(); throw e; }
      return room;
    },
  };
}
