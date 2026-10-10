// Match orchestration: a mini "Last Bite Standing" (GDD 3.2) on one countertop.
// 8 Titans drop in on napkin gliders, loot food, and fight while the Soap Tide closes.
import * as THREE from 'three';
import {
  G, clamp, lerp, rand, damp, forwardOf, rightOf, raycastWorld, hasLineOfSight, solidAt, groundHeight, FLOOR_Y, bus,
} from './core.js';
import { World, MAPS } from './world.js';
import { Surface } from './surface.js';
import { FX } from './fx.js';
import { Actor } from './actors.js';
import { Projectiles } from './projectiles.js';
import { Items } from './items.js';
import { Utensils, randomUtensilId } from './utensils.js';
import { BotBrain, BOT_NAMES } from './bots.js';
import { ViewModel } from './viewmodel.js';
import { Spectator } from './spectator.js';
import { PotWars, POT_SETUP } from './potwars.js';
import { TEAMS, teamCount, teamHome, assignTeams, emptiest, cleanSize, sidesLeft, winningTeam, renderTeamBar } from './teams.js';
import { randomSkinId } from './skins.js';
import { FOODS, FOOD_IDS, FEED_VERB, lobSpeed, lobDir, randomFoodId, rollAmmo, pickupAmmo } from './foods.js';
import { UTENSIL_BY_ID } from './utensils.js';

const PLAYER_COLOR = '#ff9a1f';
const BOT_COLORS = ['#6fc2ff', '#9be15d', '#c38bff', '#ff6f91', '#4fd1c5', '#f2f2f2', '#ffcf3a', '#ff7b54', '#8fa8ff', '#e0a0ff', '#63e6a5'];
export const TITANS = 12;
const TIDE_PHASES = [
  { wait: 45, r: 175, shrink: 25, dps: 2 },
  { wait: 35, r: 110, shrink: 22, dps: 4 },
  { wait: 30, r: 65, shrink: 20, dps: 6 },
  { wait: 25, r: 36, shrink: 18, dps: 8 },
  { wait: 20, r: 16, shrink: 16, dps: 11 },
  { wait: 15, r: 0, shrink: 20, dps: 16 },
];
const ENV = new Set(['burner', 'burning', 'tide']);
const BOT_LEVELS_ONLINE = ['easy', 'medium', 'hard'];
const LATE_JOIN = 25; // online: seconds into a round you can still drop in
const OVER_FOR = 6;   // online: seconds between rounds
const random3 = () => [...FOOD_IDS].sort(() => Math.random() - 0.5).slice(0, 3);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3();
const _r = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3();

export class Game {
  constructor({ renderer, scene, camera, quality, hud, input, sfx, map = 'kitchen' }) {
    Object.assign(this, { renderer, scene, camera, quality, hud, input, sfx });
    this.time = 0;
    this.state = 'menu';
    this.paused = false;
    this.world = new World(scene, renderer, quality, map);
    this.surface = new Surface(scene);
    this.fx = new FX(scene, quality);
    this.projectiles = new Projectiles(this);
    this.items = new Items(this);
    this.utensils = new Utensils(this);
    this.botLevel = 'medium'; // easy | medium | hard (set from the menu)
    this.dmgScale = 1; // set while a utensil-boosted projectile's impact runs
    this.actors = [];
    for (let i = 0; i < TITANS; i++) {
      this.actors.push(new Actor(this, { id: i, name: i === 0 ? 'You' : BOT_NAMES[i], color: i === 0 ? PLAYER_COLOR : BOT_COLORS[i - 1], isBot: i > 0 }));
    }
    this.brains = new Map();
    this.botActors = this.actors;
    this.net = null; this.online = false; this.respawnAt = 0;
    this.playerSkin = 'chef'; // chosen in the Locker
    this.mode = 'classic'; // 'classic' | 'chef' (Chef's Choice: 3 bottomless foods, nothing spawns) | 'pots' (Cooking Pot Wars)
    this.teamSize = 1; // 1 Solo, 2 Duos, 3 Trios, 4 Squads (teams.js)
    this.teamBar = { html: '' };
    this.potMenu = ['tomato', 'carrot', 'blueberry', 'banana', 'ice']; // my pick for my team's pot (Cooking Pot Wars)
    this.player = null;
    this.tide = { x: 0, z: 0, r: 330, dps: 2, phase: 0, mode: 'wait', t: 99, phases: TIDE_PHASES };
    this.hitStopUntil = 0;
    this.camYaw = 0; this.camPivotY = 0; this.camDist = 5.6;
    this.firstPerson = true; // V toggles
    this.viewModel = new ViewModel(camera);
    this.spectator = new Spectator(this); // what you watch while you're out (or only watching)
    this.pots = new PotWars(this); // Cooking Pot Wars
    this.endAt = 0;

    // aim-preview dots for lobbed foods (GDD 5.1: arc shows the first part of the path only)
    this.previewDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.85, depthWrite: false }), 40);
    this.previewDots.frustumCulled = false;
    this.previewDots.count = 0;
    scene.add(this.previewDots);
    this._m = new THREE.Matrix4();
    this.spikes = [];
    this.spikeGeo = new THREE.ConeGeometry(0.35, 1.6, 6);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: '#e8b52a', roughness: 0.5, emissive: '#3a2400', emissiveIntensity: 0.3 });
    this.lockCandidate = null;

    // Soft blob shadows: cheap contact shadows under Titans and pickups (GDD 11.7).
    const tex = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return c;
    })());
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 128);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 2;
    this.blobs.count = 0;
    scene.add(this.blobs);
  }

  // ------------------------------------------------------------------ online (0.6, rounds since 0.21)
  // Online rooms play the same match as Play vs bots: a drop, the Soap Tide closing in, a winner,
  // then the next round. The room's host (see net.js) runs the round clock, the tide and the bots
  // and shares them; everyone else follows. Since 0.24 you pick 3 foods and a utensil after joining
  // and drop in with them (or only watch); knocked-out players watch until the next round.
  startOnline(net) {
    this.net = net; this.online = true;
    this.pots.clear(); this.teamSize = 1; this.autoTeam = null;
    this.surface.reset(); this.projectiles.reset(); this.items.reset(); this.fx.clear();
    this.world.resetRound(); this.hud.clearFeed(); this.brains.clear(); this.utensils.reset(); this.slickAt = 0;
    for (const a of this.botActors.slice(1)) { a.alive = false; a.hide(); }
    this.actors = [this.botActors[0]];
    this.player = this.botActors[0];
    this.player.reset();
    this.player.isBot = false; this.player.name = net.name;
    this.player.applySkin(this.playerSkin);
    this.player.kills = 0;
    this.player.alive = false; this.player.hide(); // until a round starts and you're ready
    const sp = this.world.randomOpenSpot(this.world.playerRegion);
    this.player.pos.set(sp.x, sp.y + 8, sp.z);
    Object.assign(this.tide, { x: 0, z: 0, r: 330, phase: TIDE_PHASES.length, mode: 'wait', t: 0 });
    this.world.setTide(0, 0, 330);
    this.round = { id: -1, state: 'lobby', t: 0, started: 0, winner: '', joined: false };
    this.state = 'lobby'; this.stateT = 0;
    this.respawnAt = 0;
    this.spectator.reset();
    this.hud.banner('Online food fight', `Room "${esc(net.roomName)}" · finding the room…`, 2.4);
  }

  // Players who want to play, in the round and waiting for one (the host's view of the room).
  _humans() {
    const net = this.net, me = this.player;
    let inRound = me.alive ? 1 : 0, waiting = net.ready && !me.alive ? 1 : 0, ready = net.ready ? 1 : 0;
    for (const pr of net.proxies.values()) {
      if (pr.actor.alive) inRound++;
      else if (pr.ready) waiting++;
      if (pr.ready) ready++;
    }
    return { inRound, waiting, ready };
  }

  // A round begins (on every client): fresh round state, the host brings bots. Players who want to
  // play drop in right away (see _lateJoin).
  beginRound(id, rs) {
    if (rs.map) this.setMap(rs.map);
    this.mode = rs.mode === 'chef' || rs.mode === 'pots' ? rs.mode : 'classic';
    this.teamSize = cleanSize(rs.team, this.mode);
    const nT = teamCount(this.teamSize);
    this.surface.reset(); this.projectiles.reset(); this.items.reset(); this.fx.clear();
    this.world.resetRound(); this.utensils.reset(); this.slickAt = 0;
    for (const z of this.spikes) this.scene.remove(z.group);
    this.spikes.length = 0;
    this.round = { id, state: 'drop', t: 0, started: 0, winner: '', joined: false, fresh: false, idle: 0 };
    this.state = 'drop'; this.stateT = 0; this.winner = null;
    // host: tide from the start, bots (they fill the room up to 10 Titans with the players who play)
    this.brains.clear();
    const remotes = this.actors.filter((a) => a.isRemote);
    const bots = [];
    if (this.net.isHost) {
      Object.assign(this.tide, { x: 0, z: 0, r: 330, dps: 2, phase: 0, mode: 'wait', t: TIDE_PHASES[0].wait });
      this.botLevel = BOT_LEVELS_ONLINE.includes(rs.bots) ? rs.bots : 'medium';
      const humans = Math.max(1, this._humans().ready);
      // teams: bots fill every place the players who play haven't taken
      const botTeams = [];
      if (nT) {
        const counts = new Array(nT).fill(0);
        if (this.net.ready) counts[this.myTeam()]++;
        for (const pr of this.net.proxies.values()) if (pr.ready && pr.actor.team != null && pr.actor.team < nT) counts[pr.actor.team]++;
        for (let t = 0; t < nT; t++) for (let k = counts[t]; k < this.teamSize; k++) botTeams.push(t);
      }
      const n = rs.bots === 'off' ? 0 : nT ? Math.min(TITANS - 1, botTeams.length) : Math.max(0, Math.min(TITANS - 1, 10 - humans));
      const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
      for (let i = 1; i <= n; i++) {
        const a = this.botActors[i];
        a.reset(); a.isBot = true; a.applySkin(randomSkinId()); a.name = names[i];
        a.team = nT ? botTeams[i - 1] : null;
        if (a.team != null) a.color = TEAMS[a.team].color;
        this._dropIn(a, a.team != null ? teamHome(this.world, nT, a.team) : null);
        this._kitOut(a, random3(), Math.random() < 0.6 ? randomUtensilId() : null); // bots bring a loadout too
        this.brains.set(a, new BotBrain(a, this));
        bots.push(a);
      }
    }
    for (const a of this.botActors.slice(1)) if (!bots.includes(a)) { a.alive = false; a.hide(); }
    this.actors = [this.player, ...bots, ...remotes];
    this.world.setTide(this.tide.x, this.tide.z, this.tide.r);
    this.items.fillSpawners(this.time);
    const p = this.player;
    if (p.alive) { p.alive = false; p.hide(); } // last round's winner: out until the drop
    p.team = this.myTeam();
    if (this.mode === 'pots') this.pots.start(); else this.pots.clear();
    this.spectator.newRound();
    this.onMatchEvent?.('start');
  }
  // Foods and a utensil for a Titan dropping into an online round. Classic: a stack of each food
  // (more lies around the map); Chef's Choice: the 3 foods never run out.
  _kitOut(a, foods, utensil) {
    if (this.mode === 'chef') a.giveLoadout(foods);
    else { a.inv = [null, null, null, null, null]; a.sel = 0; for (const id of foods) a.give(id, pickupAmmo(id)); }
    if (utensil && UTENSIL_BY_ID[utensil]) this.utensils.give(a, utensil);
  }
  // My Titan drops into the current round with my loadout.
  _joinRound() {
    const p = this.player, net = this.net, kills = p.kills, R = this.round;
    p.reset(); p.isBot = false; p.kills = kills; p.name = net.name;
    p.applySkin(this.playerSkin);
    p.team = this.myTeam();
    if (p.team != null) p.color = TEAMS[p.team].color;
    this._dropIn(p, p.team != null ? teamHome(this.world, teamCount(this.teamSize), p.team) : this.world.playerRegion);
    if (this.pots.active) { this.pots._setHp(p); p.potRole = 'guard'; }
    this._kitOut(p, net.loadout?.length === 3 ? net.loadout : random3(), net.utensil);
    this.input.yaw = p.yaw; this.input.pitch = -0.25;
    this.camPivotY = p.pos.y;
    R.joined = true;
    const chef = this.mode === 'chef';
    this.hud.banner(`Round ${R.id + 1}`, R.state === 'drop' ? (chef ? "Chef's Choice: your 3 foods never run out" : 'Drop in and grab food') : 'Dropping in late: watch out below', 2.4);
    this.onMatchEvent?.('joined');
  }
  // Online: could I drop into the current round right now? (the loadout card's Ready button)
  // Cooking Pot Wars: through the pot setup and a while after, while my team's pot stands.
  joinableNow() {
    const R = this.round;
    if (!this.online || !R || R.id < 0 || R.state === 'over' || R.joined || this.player?.alive) return false;
    if (!this.pots.active) return R.t < LATE_JOIN;
    const pot = this.pots.pots[this.myTeam()];
    return R.t < POT_SETUP + LATE_JOIN && (!pot || pot.alive);
  }
  // My team online: the one I picked, or (letting the game choose) the emptiest one, kept while it has room.
  myTeam() {
    const n = teamCount(this.teamSize);
    if (!n) return null;
    const pick = this.net?.teamPick ?? -1;
    if (pick >= 0 && pick < n) return pick;
    const counts = new Array(n).fill(0);
    for (const pr of this.net?.proxies.values() || []) if (pr.ready && pr.actor.team != null && pr.actor.team < n) counts[pr.actor.team]++;
    if (this.autoTeam != null && this.autoTeam < n && counts[this.autoTeam] < this.teamSize) return this.autoTeam;
    return (this.autoTeam = emptiest(counts, n));
  }
  joinNow() { if (this.online) this._lateJoin(); }
  // Every frame: if I want to play and the round is young enough, drop in.
  _lateJoin() {
    const R = this.round, p = this.player;
    if (!p.alive && R.id >= 0) p.team = this.myTeam(); // (shared, so the host fills the teams around me)
    if (!this.net.ready || p.alive || R.joined || R.id < 0 || R.state === 'over') return;
    if (this.joinableNow()) this._joinRound();
    else if (!R.toldWait) { R.toldWait = true; this.hud.banner('Round in progress', 'You drop in at the next one. Watch for now.', 3); }
  }
  _dropIn(a, region) {
    const spot = this.world.randomOpenSpot(region, 6);
    a.pos.set(spot.x, spot.y + 30 + rand(0, 7), spot.z);
    a.yaw = Math.atan2(spot.x, spot.z);
    a.gliding = true; a.onGround = false; a.alive = true; a.root.visible = true;
  }

  // Host: the round clock (drop -> play -> over -> next round).
  _hostRound(dt) {
    const R = this.round, net = this.net;
    if (R.id < 0) { this.beginRound(0, net.roomSettings()); return; }
    R.t += dt;
    const alive = this.actors.filter((a) => a.alive).length;
    if (R.state !== 'over' && R.t < (this.pots.active ? POT_SETUP + LATE_JOIN : LATE_JOIN)) this._balanceTeams(); // players drop in early on
    if (R.state === 'drop') {
      if (this.actors.every((a) => !a.alive || a.onGround) || R.t > 12) { R.state = 'play'; R.started = sidesLeft(this); this.state = 'play'; }
    } else if (R.state === 'play') {
      this._tideUpdate(dt);
      const sides = sidesLeft(this);
      R.started = Math.max(R.started, sides); // late joiners count too
      const h = this._humans();
      // Nobody who wants to play is in this round (they're all out, or just got ready), or a lone
      // Titan has the room to itself while someone waits: a fresh round soon.
      const restart = h.waiting > 0 && (h.inRound === 0 || R.started < 2);
      R.idle = restart ? (R.idle || 0) + dt : 0;
      if (R.started >= 2 && sides <= 1 && !(this.pots.active && this.pots.setup)) this._roundOver();
      else if (R.idle > (h.inRound ? 3 : 5)) this._roundOver(true);
    } else if (R.state === 'over' && R.t > OVER_FOR) {
      this.beginRound(R.id + 1, net.roomSettings());
    }
  }
  // Host, early in a round: a player joined a team the bots had already filled. One of that team's
  // bots moves to a team with room (or leaves if every team is full).
  _balanceTeams() {
    const n = teamCount(this.teamSize);
    if (!n) return;
    const members = Array.from({ length: n }, () => []);
    for (const a of this.actors) if (a.team != null && a.team < n && (a.alive || a.respawnAt)) members[a.team].push(a);
    for (let t = 0; t < n; t++) {
      if (members[t].length <= this.teamSize) continue;
      const bot = members[t].find((a) => a.isBot && !a.isRemote);
      if (!bot) continue;
      members[t].splice(members[t].indexOf(bot), 1);
      let to = -1;
      for (let u = 0; u < n; u++) if (members[u].length < this.teamSize && (to < 0 || members[u].length < members[to].length)) to = u;
      if (to < 0) { bot.alive = false; bot.respawnAt = 0; bot.hide(); this.brains.delete(bot); continue; } // no room anywhere
      bot.team = to; bot.color = TEAMS[to].color;
      members[to].push(bot);
      if (this.pots.active) bot.potRole = 'guard';
      const pot = this.pots.active ? this.pots.pots[to] : null;
      const s = pot && pot.placed ? pot.pos.clone().add(new THREE.Vector3(3, 0, 0)) : this.world.randomOpenSpot(teamHome(this.world, n, to), 4);
      bot.pos.set(s.x, s.y + (pot?.placed ? 0.2 : 20), s.z); bot.vel.set(0, 0, 0); bot.gliding = !pot?.placed;
      this.brains.set(bot, new BotBrain(bot, this));
    }
  }
  _roundOver(fresh = false) {
    const R = this.round;
    const team = !fresh && this.teamSize > 1 ? winningTeam(this) : null;
    const w = fresh ? null : this.actors.find((a) => a.alive && (team == null || a.team === team)) || null;
    const tName = team != null ? TEAMS[team].name : null;
    R.state = 'over'; R.t = fresh ? OVER_FOR - 3 : 0; R.winner = tName || (w ? w.name : ''); R.fresh = fresh;
    this.state = 'over';
    this._showRoundOver(w, fresh, tName);
  }
  _showRoundOver(w, fresh, tName = null) {
    if (!fresh) { // coins for the round (main.js pays the players who played it)
      const P = this.player;
      const won = tName ? P?.team != null && TEAMS[P.team]?.name === tName : !!w && w === P;
      this.onMatchEvent?.('roundOver', { won, placement: won ? 1 : P?.alive ? 2 : P?.placement || this.actors.length });
    }
    if (fresh) this.hud.banner('New round', 'Everyone who plays drops in · 3 s', 2.6);
    else if (tName) {
      if (this.player?.team != null && TEAMS[this.player.team]?.name === tName) { this.sfx.play('win'); this.hud.banner("Chef's Kiss!", `${tName} wins · next round in ${OVER_FOR} s`, 4); }
      else this.hud.banner('Round over', `${tName} wins · next round in ${OVER_FOR} s`, 4);
    }
    else if (w && w === this.player) { this.sfx.play('win'); this.hud.banner("Chef's Kiss!", `Last Bite Standing · next round in ${OVER_FOR} s`, 4); }
    else this.hud.banner('Round over', `${w ? esc(w.name) : 'Nobody'} took the Last Bite · next round in ${OVER_FOR} s`, 4);
  }
  // Seconds until the next round (online, between rounds), or null.
  nextRoundIn() {
    return this.online && this.round?.state === 'over' ? Math.max(0, Math.ceil(OVER_FOR - this.round.t)) : null;
  }
  // Everyone else: follow the host's round (rd) and settings (rs).
  _followRound(dt) {
    const net = this.net, rd = net.hostRound, rs = net.hostSettings;
    if (!rd || !rs) return;
    const [id, st, tx, tz, tr, phase, mode, t, winner, rt, toX, toZ, toR, fresh] = rd;
    if (id !== this.round.id) this.beginRound(id, rs);
    const prevMode = this.tide.mode;
    Object.assign(this.tide, { x: tx, z: tz, r: tr, phase, mode, t });
    if (prevMode === 'wait' && mode === 'shrink' && toR !== undefined) { this._groceryDrop({ x: toX, z: toZ, r: toR }); this.sfx.play('tide', null, 0.7); }
    this.world.setTide(tx, tz, tr);
    const R = this.round;
    R.t = rt;
    if (st !== R.state) {
      R.state = st; this.state = st;
      const tName = this.teamSize > 1 && TEAMS.some((T) => T.name === winner) ? winner : null;
      if (st === 'over') this._showRoundOver(fresh ? null : this.actors.find((a) => a.name === winner && a.alive) || (winner === this.player.name && this.player.alive ? this.player : null), !!fresh, fresh ? null : tName);
    }
  }

  // Swap the arena (between matches, or when an online room plays another map). Returns true if it changed.
  setMap(id) {
    if (!MAPS[id] || this.world.mapId === id) return false;
    this.projectiles.reset(); this.items.reset(); this.surface.reset();
    for (const z of this.spikes) this.scene.remove(z.group);
    this.spikes.length = 0;
    this.world.dispose();
    this.world = new World(this.scene, this.renderer, this.quality, id);
    this.items.spawners = this.world.spawnPoints.map((p) => ({ pos: p.clone(), item: null, respawnAt: 0 }));
    this.onMapChange?.(id);
    return true;
  }

  async stopOnline() {
    const net = this.net;
    this.net = null; this.online = false;
    if (net) await net.leave();
    this.actors = this.botActors;
  }
  // ------------------------------------------------------------------ finding players (0.5)
  // Sniff: for 3 s, point at the 4 nearest Titans that made noise in the last 6 s.
  // Quiet Titans (standing still, walking, hiding in a bush) never show up.
  sniff() {
    if (this.time < (this.sniffReadyAt || 0)) return;
    this.sniffReadyAt = this.time + 10;
    this.sniffUntil = this.time + 3;
    this.sfx.play('sniff');
  }
  // Direction markers for the HUD: nearest noisy enemies.
  noiseMarkers() {
    const p = this.player;
    if (!p || !p.alive) return [];
    const now = this.time, out = [];
    const sniffing = now < (this.sniffUntil || 0);
    for (const o of this.actors) {
      if (o === p || !o.alive) continue;
      const age = now - o.noiseAt, d = o.pos.distanceTo(p.pos);
      if (sniffing && age < 6) out.push({ actor: o, dist: d, strength: 1, sniff: true });
      else if (age < 1.2 && d < 75) out.push({ actor: o, dist: d, strength: 1 - age / 1.2, sniff: false });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, sniffing ? 4 : 6);
  }

  // ------------------------------------------------------------------ targeting helpers
  // Cooking Pot Wars: same team (nobody is a teammate in the other modes)
  teammates(a, b) { return this.teamSize > 1 && !!a && !!b && a !== b && a.team != null && a.team === b.team; }
  nearestEnemy(a, range, from = a.pos) {
    let best = null, bd = range;
    for (const o of this.actors) {
      if (o === a || !o.alive || this.teammates(a, o)) continue;
      const d = o.pos.distanceTo(from);
      if (d < bd && hasLineOfSight(_o.copy(from).setY(from.y + 1), o.center(_c))) { bd = d; best = o; }
    }
    return best;
  }
  // Chili lock-on: the enemy closest to the crosshair inside a 15 degree cone, within 45 m.
  lockTarget(a) {
    if (a.isBot) return a.botTarget;
    let best = null, bestAng = 0.26;
    const eye = a.headPos(_o);
    for (const o of this.actors) {
      if (o === a || !o.alive || this.teammates(a, o)) continue;
      _d.subVectors(o.center(_c), eye);
      const dist = _d.length();
      if (dist > 45) continue;
      const ang = Math.acos(clamp(_d.dot(a.aimDir) / dist, -1, 1));
      if (ang < bestAng && hasLineOfSight(eye, _c)) { bestAng = ang; best = o; }
    }
    return best;
  }

  // ------------------------------------------------------------------ pineapple spike fields
  addSpikeField(pos, r, dur, dps, owner) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(this.spikeGeo, this.spikeMat);
      const a = i * 2.4, d = Math.sqrt((i + 0.5) / n) * r;
      s.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      s.rotation.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25));
      s.userData.h = rand(0.7, 1.3);
      group.add(s);
    }
    this.scene.add(group);
    this.spikes.push({ pos: pos.clone(), r, until: this.time + dur, born: this.time, dps, owner, group, acc: new Map() });
  }
  _spikeStep(dt) {
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const z = this.spikes[i];
      const age = this.time - z.born, left = z.until - this.time;
      const k = Math.min(1, age / 0.15) * Math.min(1, left / 0.4);
      for (const s of z.group.children) { s.scale.set(1, Math.max(0.01, k * s.userData.h), 1); s.position.y = 0.8 * k * s.userData.h; }
      if (left <= 0) { this.scene.remove(z.group); this.spikes.splice(i, 1); continue; }
      for (const a of this.actors) {
        if (!a.alive || Math.abs(a.pos.y - z.pos.y) > 1.5 || Math.hypot(a.pos.x - z.pos.x, a.pos.z - z.pos.z) > z.r) continue;
        const acc = (z.acc.get(a) || 0) + z.dps * dt;
        if (acc >= 4) { this.damage(a, acc, z.owner === a ? null : z.owner, 'pineapple'); z.acc.set(a, 0); } else z.acc.set(a, acc);
        a.sticky.push({ amt: 0.15, until: this.time + 0.3 });
      }
    }
  }

  _blobShadows() {
    let n = 0;
    const dyn = this.quality.dynamicShadows;
    const place = (x, y, z, s) => {
      if (n >= 128) return;
      this._m.makeScale(s, 1, s).setPosition(x, y + 0.04, z);
      this.blobs.setMatrixAt(n++, this._m);
    };
    if (!dyn) {
      for (const a of this.actors) {
        if (!a.alive) continue;
        const gy = groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.3);
        const h = a.pos.y - gy;
        if (h < 40) place(a.pos.x, gy, a.pos.z, 1.5 * clamp(1 - h / 30, 0.35, 1));
      }
    }
    const cam = this.camera.position;
    for (const it of this.items.list) if (!it.vel && it.pos.distanceToSquared(cam) < 70 * 70) place(it.pos.x, it.pos.y, it.pos.z, 1.3);
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  aliveCount() { return this.actors.filter((a) => a.alive).length; }

  // opts.mode 'chef' = Chef's Choice: every Titan brings 3 foods with endless ammo and no food spawns.
  // opts.team: team size (1 Solo, 2 Duos, 3 Trios, 4 Squads); opts.myTeam: the team you picked (-1: any).
  newMatch(withPlayer, opts = {}) {
    this.mode = opts.mode === 'chef' || opts.mode === 'pots' ? opts.mode : 'classic';
    this.teamSize = withPlayer ? cleanSize(opts.team, this.mode) : 1;
    if (opts.potMenu?.length) this.potMenu = opts.potMenu;
    const nT = teamCount(this.teamSize);
    const chef = this.mode === 'chef';
    this.actors = this.botActors;
    this.surface.reset(); this.projectiles.reset(); this.items.reset(); this.fx.clear();
    this.world.resetRound();
    this.hud.clearFeed();
    this.utensils.reset();
    this.slickAt = 0;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const spots = [];
    this.brains.clear();
    this.actors.forEach((a, i) => {
      a.reset();
      a.isBot = !(withPlayer && i === 0);
      a.applySkin(a.isBot ? randomSkinId() : this.playerSkin);
      a.name = withPlayer && i === 0 ? 'You' : names[i];
    });
    // teams first: each starts together in its own home patch
    assignTeams(this.actors, this.teamSize, withPlayer && opts.myTeam >= 0 && opts.myTeam < nT ? new Map([[this.actors[0], opts.myTeam]]) : new Map());
    this.actors.forEach((a, i) => {
      let p;
      for (let k = 0; k < 30; k++) {
        p = this.world.randomOpenSpot(a.team != null ? teamHome(this.world, nT, a.team) : withPlayer && i === 0 ? this.world.playerRegion : null, a.team != null ? 4 : 6);
        if (spots.every((s) => s.distanceTo(p) > (a.team != null ? 5 : 22))) break;
      }
      spots.push(p);
      a.pos.set(p.x, p.y + 30 + rand(0, 7), p.z);
      a.yaw = Math.atan2(p.x, p.z); // face roughly toward the centre
      a.gliding = true; a.onGround = false;
      if (!chef) a.give('tomato', 2);
      else if (!a.isBot && opts.loadout?.length) a.giveLoadout(opts.loadout);
      else a.giveLoadout([...FOOD_IDS].sort(() => Math.random() - 0.5).slice(0, 3));
      if (!a.isBot && opts.utensil) this.utensils.give(a, opts.utensil);
      else if (a.isBot && chef && Math.random() < 0.6) this.utensils.give(a, randomUtensilId());
      if (a.isBot) this.brains.set(a, new BotBrain(a, this)); // skill from the bot difficulty (botLevel)
    });
    this.player = withPlayer ? this.actors[0] : null;
    if (this.player) {
      this.input.yaw = this.player.yaw; this.input.pitch = -0.25;
      this.camPivotY = this.player.pos.y;
    }
    Object.assign(this.tide, { x: 0, z: 0, r: 330, dps: 2, phase: 0, mode: 'wait', t: TIDE_PHASES[0].wait });
    this.world.setTide(0, 0, 330);
    for (const z of this.spikes) this.scene.remove(z.group);
    this.spikes.length = 0;
    this.items.fillSpawners(this.time);
    this.state = 'drop'; this.stateT = 0;
    this.endAt = 0; this.winner = null;
    this.spectator.reset();
    if (this.mode === 'pots') this.pots.start(); else this.pots.clear();
    this.onMatchEvent?.('start');
    if (withPlayer && nT && this.mode !== 'pots') this.hud.banner(`${TEAMS[this.player.team].name}`, `${{ 2: 'Duos', 3: 'Trios', 4: 'Squads' }[this.teamSize]}: stick with your team. Last team standing wins`, 3.4);
    else if (withPlayer && this.mode !== 'pots') this.hud.banner(chef ? "Chef's Choice" : 'Drop in!', chef ? 'Your 3 foods never run out. Food doesn\'t heal: grab the green crosses' : 'Steer your napkin glider onto the counter');
  }

  // ------------------------------------------------------------------ combat API used by foods
  damage(target, amount, attacker, foodId, opts = {}) {
    if (!target.alive || amount <= 0 || this.state === 'over') return 0;
    if (this.teammates(target, attacker) || (this.pots.active && this.pots.setup)) return 0; // never your own team; nobody before the pots are down
    amount *= this.dmgScale;
    this._action(target, attacker);
    if (target.isRemote) { // online: that player's own game decides; we only show our hit
      if (attacker === this.player) {
        this.hud.float(target.headPos(_c).setY(target.pos.y + 2.3), Math.round(amount), opts.head ? 'crit' : 'dmg');
        this.hud.hitmarker(opts.head, false);
        this.sfx.play(opts.head ? 'headshot' : 'hit', null, 0.9);
      }
      return amount;
    }
    let amt = amount;
    if (target.isFrozen() && !ENV.has(foodId)) { // any hit shatters the ice for bonus damage
      target.frozenUntil = 0;
      amt += 15;
      this.fx.burst('ice', target.center(_c), 1.4);
      this.sfx.play('shatter', target.pos, 1.2);
      this.floatText(target, 'SHATTER +15', 'crit');
    }
    target.takeDamage(amt);
    if (attacker && attacker !== target) { target.lastHitBy = attacker; target.lastHitFood = foodId; target.lastHitAt = this.time; }
    const byPlayer = this.player && attacker === this.player && target !== attacker;
    if (byPlayer) {
      this.hud.float(target.headPos(_c).setY(target.pos.y + 2.3), Math.round(amt), opts.head ? 'crit' : 'dmg');
      this.hud.hitmarker(opts.head, target.hp <= 0);
      this.sfx.play(opts.head ? 'headshot' : 'hit', null, 0.9);
      if (amt >= 35) this.hitStopUntil = performance.now() + 45;
    }
    if (target === this.player) {
      this.hud.hurt();
      if (!ENV.has(foodId) || amt > 4) this.fx.shake(Math.min(0.45, amt / 70));
    }
    if (target.hp <= 0) this.kill(target, attacker, foodId);
    return amt;
  }

  damageShield(a, amt, attacker) {
    const slot = a.selected();
    if (!slot || slot.id !== 'cheese') return;
    this._action(a, attacker);
    slot.hp -= amt;
    a.shieldHp = slot.hp;
    forwardOf(a.yaw, _f);
    const sp = _c.copy(a.pos).addScaledVector(_f, 1.45).setY(a.pos.y + 1);
    this.fx.burst('cheese', sp, 0.4);
    this.sfx.play('shield', sp);
    if (slot.hp < FOODS.cheese.shieldHp / 2) this.surface.stamp(sp.x, a.pos.y, sp.z, 1.2, 'sticky', 3, this.time, { slow: 0.25 });
    if (slot.hp <= 0) {
      this.surface.stamp(sp.x, a.pos.y, sp.z, 4, 'sticky', 6, this.time, { slow: 0.35, visual: 'melt' });
      this.world.paintSplat(sp.x, a.pos.y, sp.z, 3, 'cheese');
      a.shieldUp = false;
      a.shieldBrokenUntil = this.time + 4;
      a.consume(1);
      this.floatText(a, 'SHIELD MELTED', 'slip');
    }
  }

  // Who is fighting whom, for the spectator's cinematic camera (every client sees every hit land).
  // Only Titan-on-Titan hits count: the burners and the Soap Tide aren't a fight.
  _action(target, attacker) {
    if (!attacker || attacker === target) return;
    target.actionAt = attacker.actionAt = this.time;
    attacker.foe = target; target.foe = attacker; attacker.foeAt = target.foeAt = this.time;
  }

  splash(point, r, dmg, attacker, foodId, { exclude = null, onHit = null } = {}) {
    for (const a of this.actors) {
      if (!a.alive || a === exclude) continue;
      const c = a.center(_c);
      const d = Math.max(0, c.distanceTo(point) - 0.45);
      if (d > r || !hasLineOfSight(_o.copy(point).setY(point.y + 0.3), c)) continue;
      const k = 1 - 0.6 * clamp(d / r, 0, 1);
      if (a === attacker) { onHit?.(a, k); continue; }
      if (a.shieldUp && this._inFront(a, point)) { this.damageShield(a, dmg * k, attacker); continue; }
      this.damage(a, dmg * k, attacker, foodId);
      onHit?.(a, k);
    }
  }

  explode(point, r, dmg, owner, foodId, force) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      const c = a.center(_c);
      const dist = c.distanceTo(point);
      if (dist > r + 0.5 || !hasLineOfSight(_o.copy(point).setY(point.y + 0.3), c)) continue;
      const k = 1 - 0.6 * clamp(dist / r, 0, 1);
      if (a !== owner) {
        if (a.shieldUp && this._inFront(a, point)) this.damageShield(a, dmg * k, owner);
        else this.damage(a, dmg * k, owner, foodId);
      }
      if (!a.alive) continue;
      _d.subVectors(c, point); _d.y = Math.max(_d.y, 0.1);
      _d.normalize(); _d.y = Math.max(_d.y, 0.45); _d.normalize();
      a.knock(_d.multiplyScalar(force * k * (a === owner ? 0.9 : 1) * Math.min(1, Math.sqrt(this.dmgScale)))); // small utensil pieces push less
    }
    const camD = this.camera.position.distanceTo(point);
    this.fx.shake(clamp(0.6 - camD / 60, 0, 0.6));
  }

  _inFront(a, point) {
    forwardOf(a.yaw, _f);
    return (point.x - a.pos.x) * _f.x + (point.z - a.pos.z) * _f.z > 0.3;
  }

  hitLandmark(amount, attacker, point) {
    const L = this.world.landmark;
    if (!L.alive) return;
    L.hp -= amount; L.flash = 1;
    if (L.hp > 0) return;
    // burst: harvest the giant tomato (GDD 2.3 landmark foods)
    L.alive = false; L.group.visible = false; L.collider.enabled = false; L.regrowAt = this.time + 40;
    this.world.shadowDirty = true;
    const c = _c.set(L.x, L.y, L.z);
    for (let i = 0; i < 3; i++) this.fx.burst('tomato', _o.copy(c).add(_v.set(rand(-3, 3), rand(-2, 3), rand(-3, 3))), 2);
    for (let i = 0; i < 9; i++) this.world.paintSplat(L.x + rand(-8, 8), 0, L.z + rand(-8, 8), rand(2, 4), 'tomato');
    this.surface.stamp(L.x, 0, L.z, 7, 'slick', 10, this.time);
    this.sfx.play('boom', c); this.sfx.play('splat', c, 1.5);
    this.fx.shake(0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rand(-0.3, 0.3);
      this.items.drop('tomato', rollAmmo(), _o.set(L.x, 3, L.z), _v.set(Math.cos(a) * 8, 10, Math.sin(a) * 8));
    }
    if (attacker === this.player && this.mode !== 'chef') this.hud.toast('Giant Tomato harvested: 4 piles of tomatoes dropped');
  }

  kill(victim, attacker, foodId) {
    victim.alive = false; victim.hp = 0;
    let killer = attacker && attacker !== victim ? attacker : null;
    if (!killer && this.time - victim.lastHitAt < 6 && victim.lastHitBy !== victim) killer = victim.lastHitBy;
    if (killer) killer.kills++;
    victim.koBy = killer; // the spectator camera moves on to them
    victim.placement = this.aliveCount() + 1;
    const c = victim.center(_c).clone();
    this.fx.burst('splat-out', c);
    this.fx.burst('tomato', c, 0.6);
    this.sfx.play('splatout', c);
    this.world.paintSplat(c.x, victim.pos.y, c.z, 3, 'tomato');
    victim.inv.forEach((s) => {
      if (!s) return;
      const a = rand(0, Math.PI * 2);
      this.items.drop(s.id, s.count, c, _v.set(Math.cos(a) * 5, 8, Math.sin(a) * 5));
    });
    victim.inv = [null, null, null, null, null];
    this.utensils.dropFrom(victim);
    victim.hide();

    const food = foodId === 'burning' ? 'burner' : foodId;
    this._feed(victim, killer, food);

    const back = this.pots.active ? this.pots.onDeath(victim) : false; // Cooking Pot Wars: back at your pot while it stands
    if (this.online) { // online: tell the room; out until the next round (or back at the pot)
      if (victim === this.player) {
        this.net.event('d', killer ? this.net._peerOf(killer) : '', food || '');
        this.spectator.focusNext = killer && killer.alive ? killer : null;
        this.hud.banner('Splatted!', back === 'back' ? 'Back at your pot in 5 s' : back === 'wait' ? 'Your pot is being carried: you\'re back if its carrier goes down' : `${killer ? `by ${esc(killer.name)} · ` : ''}you're back next round`, 2.8);
      } else if (victim.isBot && this.net.isHost) {
        this.net.event('bd', victim.id, killer ? this.net._peerOf(killer) : '', food || '');
      }
      if (killer === this.player && victim !== this.player) this.hud.banner('Splat!', `${esc(victim.name)} ${back === 'back' ? 'is back at their pot soon' : 'is out'}`, 1.6);
      return;
    }
    if (this.pots.active) {
      if (killer === this.player) this.hud.banner('Splat!', `${esc(victim.name)} ${back === 'back' ? 'is back at their pot soon' : 'is out'}`, 1.6);
      if (victim === this.player) {
        this.spectator.focusNext = killer && killer.alive ? killer : null;
        if (back === 'back') this.hud.banner('Splatted!', 'Back at your pot in 5 s', 2.4);
        else if (back === 'wait') this.hud.banner('Splatted!', 'Your pot is being carried: you\'re back if its carrier goes down', 3);
        else this.onMatchEvent?.('playerDown', { killer, placement: victim.placement, food, note: 'Your pot is gone, so no more respawns.' });
      }
      this.pots._checkWin();
      return;
    }
    if (killer === this.player) this.hud.banner('Splat!', `${esc(victim.name)} is out · ${this.aliveCount()} left`, 1.6);
    if (victim === this.player) {
      this.spectator.focusNext = killer && killer.alive ? killer : null;
      const mates = this.teamSize > 1 && this.actors.some((a) => a.alive && a.team === victim.team);
      this.onMatchEvent?.('playerDown', { killer, placement: victim.placement, food, note: mates ? 'Your team is still in: keep watching them.' : '' });
    }
    if (sidesLeft(this) <= 1) { if (this.teamSize > 1) this.teamWins(winningTeam(this)); else this._finish(); }
  }

  // Play vs bots in teams: the last team standing wins.
  teamWins(team) {
    if (this.state === 'over') return;
    this.state = 'over'; this.endAt = this.time;
    const T = team != null ? TEAMS[team] : null;
    const w = this.actors.find((a) => a.team === team && a.alive) || this.actors.find((a) => a.team === team) || null;
    this.winner = w;
    if (w) w.placement = 1;
    const won = team != null && team === this.player?.team;
    if (won) { this.sfx.play('win'); this.hud.banner("Chef's Kiss!", `${T.name} wins`, 4); }
    else if (this.player) this.hud.banner('Match over', `${T ? T.name : 'Nobody'} wins`, 4);
    this.onMatchEvent?.('over', { winner: w, team: T?.name, won });
  }

  // Another player's game says they were knocked out (online).
  remoteKnockout(victim, killer, food) {
    if (victim.alive) { victim.alive = false; victim.hide(); }
    victim.koBy = killer;
    this._feed(victim, killer, food);
    if (killer === this.player) {
      this.player.kills++;
      this.hud.banner('Splat!', `${esc(victim.name)} is out`, 1.6);
      this.sfx.play('headshot', null, 0.8);
    }
  }

  _feed(victim, killer, food) {
    const vName = `<b style="color:${victim.color}">${esc(victim.name)}</b>`;
    let html;
    if (killer) {
      const kName = `<b style="color:${killer.color}">${esc(killer.name)}</b>`;
      if (food === 'burner') html = `${kName} cooked ${vName} on the burner`;
      else if (food === 'tide') html = `${kName} sent ${vName} into the Soap Tide`;
      else html = `${kName} <em>${FEED_VERB[food] || 'splatted'}</em> ${vName}`;
    } else {
      html = food === 'burner' ? `${vName} got cooked on the burner`
        : food === 'tide' ? `${vName} ${victim === this.player && !this.online ? 'were' : 'was'} washed away by the Soap Tide` : `${vName} splatted out`;
    }
    const mine = victim === this.player || killer === this.player;
    this.hud.feed(html, mine);
  }

  _finish() {
    if (this.state === 'over') return;
    this.state = 'over';
    const w = this.actors.find((a) => a.alive) || null;
    this.winner = w;
    if (w) w.placement = 1;
    this.endAt = this.time;
    if (w && w === this.player) { this.sfx.play('win'); this.hud.banner("Chef's Kiss!", 'Last Bite Standing', 4); }
    this.onMatchEvent?.('over', { winner: w });
  }

  floatText(actor, text, kind) {
    if (!this.player) return;
    if (actor.pos.distanceTo(this.camera.position) > 40) return;
    this.hud.float(actor.headPos(_c).setY(actor.pos.y + 2.6), text, kind);
  }

  // ------------------------------------------------------------------ main update
  update(realDt) {
    realDt = Math.max(0, realDt);
    let total = this.paused ? 0 : Math.min(realDt, 0.1);
    if (performance.now() < this.hitStopUntil) total *= 0.08; // local hit-stop on heavy hits
    // Up to 3 fixed substeps of <= 1/30 s, so a slow device plays at normal speed.
    const steps = Math.min(3, Math.max(1, Math.ceil(total * 30 - 1e-6)));
    const dt = total / steps;
    if (total > 0 && this.state !== 'menu') {
      const intent = this.input.enabled ? this.input.intent() : null;
      for (let s = 0; s < steps; s++) {
        // edge-triggered presses only count once per frame
        if (s === 1 && intent) Object.assign(intent, { jump: false, dodge: false, alt: false, sniff: false, view: false, ladle: false, turret: false, slot: -1, cycle: 0, uslot: -1, ucycle: 0 });
        this._step(dt, intent);
      }
    }
    if (this.net) this.net.tick(realDt);
    // out of the round (or only watching) while in a game: spectator mode
    const p = this.player;
    this.spectator.setActive(this.input.enabled && !!p && !p.alive && this.state !== 'menu');
    for (const a of this.actors) a.updateVisual(realDt, this.camera);
    this.utensils.updateVisual();
    this._camera(realDt);
    this._preview();
    this._blobShadows();
    const held = this.player?.alive ? this.player.selected()?.id : null;
    this.lockCandidate = held === 'chili' ? this.lockTarget(this.player) : null;
    this.hud.update(this, realDt);
    this.pots.updateVisual(realDt, this.camera, this.hud);
    renderTeamBar(this, document.getElementById('teamBar'), this.teamBar);
    if (this.spectator.active) this.spectator.updateUI(realDt);
  }

  _step(dt, intent) {
    this.time += dt;
    const p = this.player;
    if (p && p.alive && intent) {
      if (intent.sniff) this.sniff();
      if (intent.view) { this.firstPerson = !this.firstPerson; this.hud.toast(this.firstPerson ? 'First person' : 'Third person'); }
      this._playerAim();
      p.update(dt, intent);
    }
    for (const [a, brain] of this.brains) if (a.alive) a.update(dt, brain.intent(dt));
    if (this.online) {
      if (this.net.isHost) this._hostRound(dt); else this._followRound(dt);
      this._lateJoin();
    } else if (this.state === 'drop') {
      this.stateT += dt;
      if (this.actors.every((a) => !a.alive || a.onGround) || this.stateT > 12) {
        this.state = 'play';
        if (this.player) this.hud.banner('Last Bite Standing', 'Food is the only weapon. Good luck.', 2.2);
      }
    } else if (this.state === 'play') {
      this._tideUpdate(dt);
    }
    this.projectiles.update(dt);
    this.items.update(dt);
    this.pots.update(dt);
    this.utensils.update(dt);
    if (this.time >= (this.slickAt || 0)) { // permanent slippery patches (the cracked egg)
      this.slickAt = this.time + 4;
      for (const s of this.world.slickSpots) this.surface.stamp(s.x, s.y, s.z, s.r, 'slick', 5, this.time);
    }
    this.surface.update(dt, this.time);
    this._spikeStep(dt);
    this.world.update(dt, this.time, this.fx, this.sfx);
    this.fx.update(dt);
    if (this.state === 'play' && !this.pots.active && Math.random() < dt * 30) this._tideBubbles();
  }

  _tideUpdate(dt) {
    const T = this.tide;
    if (T.phase >= TIDE_PHASES.length) return;
    const P = TIDE_PHASES[T.phase];
    T.t -= dt;
    if (T.mode === 'wait') {
      if (T.t <= 0) {
        T.mode = 'shrink'; T.t = P.shrink;
        T.from = { x: T.x, z: T.z, r: T.r };
        const slack = Math.max(0, T.r - P.r);
        const a = rand(0, Math.PI * 2), d = rand(0, slack * 0.8);
        T.to = { x: clamp(T.x + Math.cos(a) * d, -170, 170), z: clamp(T.z + Math.sin(a) * d, -110, 130), r: P.r };
        T.dps = P.dps;
        this.sfx.play('tide', null, 0.7);
        this._groceryDrop(T.to);
        if (this.player) this.hud.banner('The Soap Tide is rising', 'Get inside the circle', 2);
      }
    } else {
      const k = 1 - clamp(T.t / P.shrink, 0, 1);
      T.x = lerp(T.from.x, T.to.x, k); T.z = lerp(T.from.z, T.to.z, k); T.r = lerp(T.from.r, T.to.r, k);
      if (T.t <= 0) {
        T.phase++;
        if (T.phase < TIDE_PHASES.length) { T.mode = 'wait'; T.t = TIDE_PHASES[T.phase].wait; }
      }
    }
    this.world.setTide(T.x, T.z, T.r);
  }

  // Grocery drops (GDD 3.2): fresh food falls from the ceiling inside the next safe zone.
  _groceryDrop(zone) {
    if (this.mode === 'chef') return;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * Math.max(4, zone.r * 0.85);
      const x = zone.x + Math.cos(ang) * d, z = zone.z + Math.sin(ang) * d;
      const top = groundHeight(x, z, 500, 0, 1);
      const floorish = groundHeight(x, z, top + 0.1);
      if (top > floorish + 1) continue; // landed on something tall: skip this one
      const id = randomFoodId();
      this.items.drop(id, pickupAmmo(id), _o.set(x, top + 45 + rand(0, 15), z), _v.set(0, -6, 0));
    }
    if (this.player) this.hud.toast('Grocery drop inside the circle');
  }

  _tideBubbles() {
    const T = this.tide;
    if (T.r < 1) return;
    const a = rand(0, Math.PI * 2);
    const p = _o.set(T.x + Math.cos(a) * T.r, 0, T.z + Math.sin(a) * T.r);
    p.y = groundHeight(p.x, p.z, 50);
    this.fx.burst('bubbles', p);
  }

  _playerAim() {
    const p = this.player, cam = this.camera;
    cam.getWorldDirection(_d);
    const o = _o.copy(cam.position).addScaledVector(_d, this.camDist * 0.95);
    let t = raycastWorld(o, _d, 320);
    for (const a of this.actors) {
      if (a === p || !a.alive) continue;
      a.center(_c).sub(o);
      const b = _c.dot(_d);
      if (b < 0) continue;
      const d2 = _c.lengthSq() - b * b;
      if (d2 < 0.8 && b < t) t = b;
    }
    p.aimDir.copy(_d);
    p.aimPoint.copy(o).addScaledVector(_d, t);
    p.yaw = this.input.yaw;
  }

  _camera(dt) {
    const cam = this.camera, p = this.player;
    let fov = 70;
    if (!p || this.state === 'menu') {
      const t = this.time * 0.06;
      cam.position.set(Math.cos(t) * 92, 30 + Math.sin(t * 0.7) * 6, Math.sin(t) * 64);
      cam.lookAt(0, -2, 0);
    } else if (p.alive && this.firstPerson) {
      // First person: the camera is the Titan's eyes; your arm and food are the viewmodel.
      const zoom = p.charging && p.selected()?.id === 'carrot' ? clamp(p.chargeT / FOODS.carrot.charge, 0, 1) : 0;
      fov = lerp(78, 30, zoom) + (p.dashT > 0 ? 8 : 0);
      this.camDist = 0.4;
      this.input.zoomSens = lerp(1, 0.4, zoom);
      this.camPivotY = damp(this.camPivotY, p.pos.y, 20, dt);
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const bob = p.onGround && speed > 0.5 ? Math.abs(Math.sin(p.walkPhase)) * 0.06 * Math.min(1.5, speed / 6) : 0;
      const eyeY = p.isTripped() ? 0.5 : 1.72; // the Titan's eyes
      cam.position.set(p.pos.x, this.camPivotY + eyeY + bob, p.pos.z);
      cam.rotation.set(this.input.pitch, this.input.yaw, p.dashT > 0 ? -0.03 : 0, 'YXZ');
    } else if (p.alive) {
      const zoom = p.charging && p.selected()?.id === 'carrot' ? clamp(p.chargeT / FOODS.carrot.charge, 0, 1) : 0;
      fov = lerp(70, 30, zoom);
      const dist = lerp(5.6, 3.6, zoom), shoulder = lerp(1.15, 0.75, zoom);
      this.camDist = dist;
      this.input.zoomSens = lerp(1, 0.4, zoom);
      this.camPivotY = damp(this.camPivotY, p.pos.y, 14, dt);
      const yaw = this.input.yaw, pitch = this.input.pitch;
      const pivot = _o.set(p.pos.x, this.camPivotY + 1.75, p.pos.z);
      _f.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      rightOf(yaw, _r);
      const start = _c.copy(pivot).addScaledVector(_r, shoulder * 0.6);
      _t.copy(pivot).addScaledVector(_f, -dist).addScaledVector(_r, shoulder).y += 0.35;
      _d.subVectors(_t, start);
      const len = _d.length();
      _d.divideScalar(len);
      const hit = raycastWorld(start, _d, len + 0.3);
      if (hit < len + 0.3) _t.copy(start).addScaledVector(_d, Math.max(0.3, hit - 0.35));
      cam.position.copy(_t);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      fov = this.spectator.camera(dt, cam); // cinematic, overview or following a Titan
    }
    if (this.fx.shakeAmt > 0) {
      const s = this.fx.shakeAmt * 0.25;
      cam.position.x += rand(-s, s); cam.position.y += rand(-s, s); cam.position.z += rand(-s, s);
    }
    const fp = !!(p && p.alive && this.firstPerson && this.state !== 'menu');
    if (p) { if (p.alive) p.root.visible = !fp; p.fpCam = fp ? cam : null; if (fp) p.glint.visible = false; }
    this.viewModel.update(dt, p || this.actors[0], fp);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 12, dt); cam.updateProjectionMatrix(); }
    rightOf(this.input.yaw, _r);
    this.sfx.setListener(cam.position, p ? _r : _r.set(1, 0, 0));
  }

  _preview() {
    const p = this.player;
    const food = p && p.alive ? p.selectedFood() : null;
    const id = p?.selected()?.id;
    if (!food || food.profile !== 'lob' || !p.charging) { this.previewDots.count = 0; return; }
    const c = clamp(p.chargeT / food.charge, 0, 1);
    const pos = p.handPos(_o);
    const vel = lobDir(p, _v).multiplyScalar(lobSpeed(id, c));
    const pts = [];
    for (let i = 0; i < 90; i++) {
      vel.y -= G * 0.03; pos.addScaledVector(vel, 0.03);
      if (solidAt(pos)) break;
      pts.push(pos.clone());
    }
    const shown = Math.min(40, Math.ceil(pts.length * 0.5)); // only the first half of the arc
    let n = 0;
    for (let i = 1; i < shown; i += 1) {
      const s = 1 - i / (shown + 4);
      this._m.makeScale(s, s, s).setPosition(pts[i]);
      this.previewDots.setMatrixAt(n++, this._m);
    }
    this.previewDots.count = n;
    this.previewDots.instanceMatrix.needsUpdate = true;
  }
}

export { bus };
