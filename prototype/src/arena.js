// Arena modes (0.54): Squads and King of the Utensil. Unlike the Last Bite Standing modes, nobody is
// out for good: a splatted Titan is back after RESPAWN seconds, and the match runs on a clock (MATCH_LEN).
// Splats are the score. No Soap Tide; food spawns all over the map as in Classic.
//
//  - Squads: everyone is put into two equal teams (Team Tomato and Team Blueberry; bots make up the
//    numbers). The team with the most splats when the clock runs out wins.
//  - King of the Utensil: every Titan for themselves. Two of the five Legendary utensils (legendary.js)
//    land in the middle of the map once everyone is down; no other utensil comes into the match. The Titan
//    with the most splats when the clock runs out wins.
//      - Pick one up: walk over it (one Legendary at a time). It's yours until you lose it.
//      - Drop it: press G (the Drop button on a touch screen). It lands at your feet.
//      - Splatted while holding one: it drops right where you went down.
//      - Stolen: hit a Titan holding one while they're frozen, tripped, rooted or stunned and it pops out
//        of their hands, toward you (they can't grab it back for 2 s).
//      - A Legendary left lying for 30 s flies back to the middle; one that's gone missing (its holder left
//        the room) comes back there too. They never wear out.
//    Whoever holds one has a beam of light over their head (the Legendary's colour), for everyone else to see.
//  - A tie when the clock runs out: sudden death, the next splat wins (a draw after another minute).
//  - Respawning: in your team's half (Squads) or wherever no enemy is close (King), with 2 tomatoes and a
//    random food, and 2 s of spawn protection (gone as soon as you throw).
// Online, the host runs the clock (its round clock) and keeps the team scores (rd), and drops, returns and
// re-sends the Legendaries; each player respawns their own Titan, the host its bots.
import * as THREE from 'three';
import { rand, groundHeight } from './core.js';
import { FOOD_IDS, pickupAmmo } from './foods.js';
import { LEGENDARY_IDS, UTENSIL_BY_ID, isLegendary } from './utensils.js';
import { TEAMS } from './teams.js';

export const ARENA_MODES = new Set(['squads', 'king']);
export const MATCH_LEN = 240, OVERTIME = 60, RESPAWN = 4, SPAWN_SHIELD = 2, LEGEND_IDLE = 30;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _v = new THREE.Vector3();
let BEAM_GEO = null;

export class Arena {
  constructor(game) {
    this.game = game;
    this.active = false; this.mode = null;
    this.score = [0, 0]; this.t = 0; this.over = false; this.legendsAt = 0; this.missing = new Map();
    this.marks = new Map(); // holder -> the beam over them
  }
  get king() { return this.active && this.mode === 'king'; }
  get squads() { return this.active && this.mode === 'squads'; }

  start(mode) {
    this.clear();
    this.active = ARENA_MODES.has(mode); this.mode = this.active ? mode : null;
    this.score = [0, 0]; this.t = 0; this.over = false; this.sudden = false; this.legendsIn = false; this.missing.clear();
  }
  clear() {
    for (const m of this.marks.values()) this.game.scene.remove(m);
    this.marks.clear();
    this.active = false; this.mode = null;
  }

  // ---------------------------------------------------------------- the clock
  // Seconds played (offline mine; online the host's round clock, from when the play began).
  clock() {
    const g = this.game;
    if (!g.online) return this.t;
    const R = g.round;
    return R && R.state !== 'drop' && R.id >= 0 ? Math.max(0, R.t - (R.playAt ?? 0)) : 0;
  }
  timeLeft() { return Math.max(0, MATCH_LEN - this.clock()); }
  pill() {
    if (this.game.state === 'drop') return 'Drop in';
    const left = this.timeLeft();
    if (left <= 0) return 'Sudden death';
    const s = Math.ceil(left);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  // Is the match decided (time's up and not level, or the overtime ran out)?
  decided() {
    const c = this.clock();
    if (c < MATCH_LEN) return false;
    if (c >= MATCH_LEN + OVERTIME) return true;
    const top = this.ranking();
    return top.length < 2 || top[0].score !== top[1].score;
  }
  // Teams (Squads) or Titans (King), best first: [{ team | actor, score, name, color }]
  ranking() {
    const g = this.game;
    if (this.squads) return [0, 1].map((t) => ({ team: t, score: this.teamScore(t), name: TEAMS[t].name, color: TEAMS[t].color })).sort((a, b) => b.score - a.score);
    return g.actors.filter((a) => a.isBot || a.isRemote || a === g.player).map((a) => ({ actor: a, score: a.kills, name: a.name, color: a.color })).sort((a, b) => b.score - a.score);
  }
  teamScore(t) {
    const g = this.game;
    if (g.online && !g.net?.isHost) return g.round?.score?.[t] ?? 0; // (the host's count)
    return this.score[t] || 0;
  }

  // ---------------------------------------------------------------- every step
  update(dt) {
    if (!this.active) return;
    const g = this.game, now = g.time;
    if (!g.online && g.state === 'play') this.t += dt;
    // respawns: my Titans (online, the others' games bring theirs back)
    for (const a of g.actors) {
      if (a.isRemote || a.alive || !a.respawnAt || g.state === 'over' || a.left) continue;
      if (a === g.player && g.online && !g.net?.ready) continue; // (online: only while I want to play)
      if (now >= a.respawnAt) this.respawn(a);
    }
    if (!g.online && g.state === 'play' && !this.over && this.decided()) this.finish();
    if (this.king) this._kingStep();
  }

  // A Titan went down (any game: called for Titans this game decides about).
  onKill(victim, killer) {
    const g = this.game;
    if (this.squads && killer && killer !== victim && killer.team != null && (!g.online || g.net?.isHost)) this.score[killer.team] = (this.score[killer.team] || 0) + 1;
    if (!victim.isRemote) victim.respawnAt = g.time + RESPAWN;
    const sudden = this.clock() >= MATCH_LEN;
    if (victim === g.player) {
      g.spectator.focusNext = killer && killer.alive ? killer : null;
      g.hud.banner('Splatted!', `${killer && killer !== victim ? `by ${esc(killer.name)} · ` : ''}back in ${RESPAWN} s`, 2.4);
    } else if (killer === g.player) g.hud.banner('Splat!', `${esc(victim.name)}${this.squads ? ` · ${TEAMS[g.player.team]?.short || ''} +1` : ''}`, 1.4);
    if (sudden && !g.online && this.decided()) this.finish();
  }
  // (host) someone else's Titan went down: the team count
  onRemoteKill(victim, killer) {
    const g = this.game;
    if (this.squads && killer && killer !== victim && killer.team != null && (!g.online || g.net?.isHost)) this.score[killer.team] = (this.score[killer.team] || 0) + 1;
  }

  respawn(a) {
    const g = this.game;
    const keep = { kills: a.kills, team: a.team, name: a.name, color: a.color, isBot: a.isBot, ownColor: a.ownColor };
    a.reset();
    Object.assign(a, keep);
    const s = this.spawnSpot(a);
    a.pos.set(s.x, s.y + 0.2, s.z); a.onGround = true; a.respawnAt = 0;
    a.yaw = Math.atan2(s.x, s.z); // (facing the middle)
    a.give('tomato', 2);
    const f = FOOD_IDS.filter((id) => id !== 'tomato')[(Math.random() * (FOOD_IDS.length - 1)) | 0];
    a.give(f, pickupAmmo(f));
    a.spawnShieldUntil = g.time + SPAWN_SHIELD;
    a.root.visible = true;
    g.fx.burst('jump', a.pos, 1.2);
    const brain = g.brains.get(a);
    if (brain) g.brains.set(a, new brain.constructor(a, g)); // (a fresh mind for a fresh life)
    if (a === g.player) {
      g.input.yaw = a.yaw; g.input.pitch = -0.15; g.camPivotY = a.pos.y;
      g.hud.banner('Back in!', this.squads ? `${TEAMS[a.team]?.name || ''} needs you` : 'Splat your way to the top', 1.4);
    }
  }
  // Squads: in your team's half, out of sight of the enemy if it can; King: the spot furthest from any enemy.
  spawnSpot(a) {
    const g = this.game, W = g.world, region = W.regions.floor;
    let best = null, bd = -1;
    for (let i = 0; i < 14; i++) {
      let p;
      if (this.squads && a.team != null) {
        const half = { ...region, minX: a.team === 0 ? region.minX : 30, maxX: a.team === 0 ? -30 : region.maxX };
        p = W.randomOpenSpot(half, 5);
      } else p = W.randomOpenSpot('floor', 5);
      let near = Infinity;
      for (const o of g.actors) if (o !== a && o.alive && !g.teammates(a, o)) near = Math.min(near, o.pos.distanceTo(p));
      if (near > bd) { bd = near; best = p; }
      if (near > 45) break;
    }
    return best || W.randomOpenSpot('floor', 5);
  }

  // ---------------------------------------------------------------- the end
  finish() {
    const g = this.game;
    if (this.over || g.state === 'over') return;
    this.over = true;
    g.state = 'over'; g.endAt = g.time;
    const rank = this.ranking(), P = g.player;
    const draw = rank.length > 1 && rank[0].score === rank[1].score;
    g.highlights.onOver();
    let won = false, text, winner = null, team = null;
    if (this.squads) {
      team = draw ? null : TEAMS[rank[0].team].name;
      won = !draw && P?.team === rank[0].team;
      text = draw ? `A draw, ${rank[0].score} splats each.` : `${team} wins, ${rank[0].score} splats to ${rank[1].score}.${P ? (won ? ' Your team took it!' : '') : ''}`;
      winner = draw ? null : g.actors.find((a) => a.team === rank[0].team) || null;
    } else {
      winner = draw ? null : rank[0]?.actor || null;
      won = !!P && winner === P;
      text = draw ? `A draw at ${rank[0]?.score ?? 0} splats.` : `${winner.name} is King of the Utensil, with ${rank[0].score} splat${rank[0].score === 1 ? '' : 's'}.`;
    }
    // placements: by score (teams: the winning team's Titans first)
    const order = this.squads ? [...g.actors].sort((x, y) => (rank.findIndex((r) => r.team === x.team) - rank.findIndex((r) => r.team === y.team)) || y.kills - x.kills) : rank.map((r) => r.actor);
    order.forEach((a, i) => { if (a) a.placement = i + 1; });
    if (won) g.sfx.play('win');
    if (P) g.hud.banner(won ? "Chef's Kiss!" : draw ? "Time's up" : 'Match over', text, 4);
    g.onMatchEvent?.('over', { winner, team, won, text });
  }

  // ---------------------------------------------------------------- King of the Utensil
  _authority() { const g = this.game; return !g.online || !!g.net?.isHost; }
  _kingStep() {
    const g = this.game, U = g.utensils, now = g.time;
    // the two Legendaries land once the drop is over (the host's game drops them for the room)
    if (!this.legendsIn && g.state === 'play' && this._authority()) {
      this.legendsIn = true;
      const ids = [...LEGENDARY_IDS].sort(() => Math.random() - 0.5).slice(0, 2);
      ids.forEach((id, i) => this.dropAtMiddle(id, i));
      g.hud.banner('Legendaries have landed!', `${ids.map((id) => UTENSIL_BY_ID[id].name).join(' and ')} · in the middle of the map`, 3.2);
    }
    if (!this._authority() && !this.legendsIn && U.pickups.some((it) => isLegendary(it.id))) { // (online: the host dropped them)
      this.legendsIn = true;
      const ids = [...new Set(U.pickups.filter((it) => isLegendary(it.id)).map((it) => it.id))];
      g.hud.banner('Legendaries have landed!', `${ids.map((id) => UTENSIL_BY_ID[id].name).join(' and ')} · in the middle of the map`, 3.2);
    }
    if (this._authority() && g.state === 'play') {
      for (const it of [...U.pickups]) { // one left lying too long flies back to the middle
        if (!isLegendary(it.id) || now - it.born < LEGEND_IDLE || it.home) continue;
        this._take(it);
        this.dropAtMiddle(it.id, LEGENDARY_IDS.indexOf(it.id) % 2);
        g.hud.toast(`${UTENSIL_BY_ID[it.id].name} flew back to the middle`);
      }
      // one gone missing (its holder left the room): back in the middle after a few seconds
      if (this.legendsIn && now >= (this.checkAt || 0)) {
        this.checkAt = now + 1;
        const have = new Set(U.pickups.filter((it) => isLegendary(it.id)).map((it) => it.id));
        for (const a of g.actors) for (const id of this.held(a)) have.add(id);
        const want = new Set(this.inPlay || []);
        for (const id of want) {
          if (have.has(id)) { this.missing.delete(id); continue; }
          if (!this.missing.has(id)) this.missing.set(id, now);
          else if (now - this.missing.get(id) > 6) { this.missing.delete(id); this.dropAtMiddle(id, 0); }
        }
      }
    }
    this._marks();
  }
  // which Legendaries a Titan has (others' games only tell what's in their hand and their kit)
  held(a) {
    if (!a.alive && !a.respawnAt && a.isRemote) return [];
    const ids = a.isRemote ? [a.utensil, ...(a.netKit?.ids || [])] : a.utensils || [];
    return [...new Set(ids.filter((id) => id && isLegendary(id)))];
  }
  holderOf(id) { return this.game.actors.find((a) => a.alive && this.held(a).includes(id)) || null; }
  dropAtMiddle(id, i = 0) {
    const g = this.game, W = g.world, R = W.regions.floor;
    let spot = null;
    for (const r of [14, 24, 40, 70]) { // as near the middle as there's open floor
      const s = W.randomOpenSpot({ ...R, minX: -r, maxX: r, minZ: -r, maxZ: r }, 3);
      if (s.lengthSq() > 0 || r === 70) { spot = s; break; }
    }
    if (!spot || spot.lengthSq() === 0) spot = W.randomOpenSpot('floor', 6);
    spot.x += i ? 3 : -3;
    spot.y = groundHeight(spot.x, spot.z, spot.y + 2);
    (this.inPlay ||= new Set()).add(id);
    const it = g.utensils.drop(id, spot);
    it.home = true; it.born = g.time;
    g.fx.burst('jump', spot, 2); g.sfx.play('thud', spot, 1.2);
    return it;
  }
  _take(it) { // (the host) take a lying Legendary away (it comes back elsewhere)
    const g = this.game, U = g.utensils;
    if (g.online && it.key) { g.net.event('ug', g.round.id, it.key); U.gone.add(it.key); }
    if (it.key) U.remoteTake(it.key);
    else { const i = U.pickups.indexOf(it); if (i >= 0) { g.scene.remove(it.model, it.ring, ...(it.extra || [])); U.pickups.splice(i, 1); } }
  }
  // G (Drop on a touch screen): put down the Legendary in hand
  dropKey(a) {
    if (!this.king || !a.alive) return;
    const id = a.utensil;
    if (!isLegendary(id)) { if (a === this.game.player) this.game.hud.toast('Nothing to drop: only a Legendary can be put down'); return; }
    this._loose(a, id, null);
    if (a === this.game.player) this.game.hud.toast(`${UTENSIL_BY_ID[id].name} dropped`);
  }
  // a hit on a helpless holder knocks the Legendary loose, toward whoever hit them
  onHit(target, attacker) {
    if (!this.king || !target.alive || target.isRemote || !attacker || attacker === target) return;
    const t = this.game.time;
    if (!(target.isFrozen() || target.isTripped() || target.isRooted() || t < target.stunUntil)) return;
    const id = (target.utensils || []).find(isLegendary);
    if (!id || t < (target.stolenAt || 0) + 1) return;
    target.stolenAt = t;
    this._loose(target, id, attacker);
    this.game.floatText(target, 'STOLEN!', 'crit');
    if (target === this.game.player) this.game.hud.banner('Butterfingers!', `${esc(attacker.name)} knocked your ${UTENSIL_BY_ID[id].name} loose`, 2);
    else if (attacker === this.game.player) this.game.hud.toast(`You knocked the ${UTENSIL_BY_ID[id].name} loose: grab it!`);
  }
  _loose(a, id, toward) {
    const g = this.game, U = g.utensils;
    const i = a.utensils.indexOf(id);
    if (i < 0) return;
    a.utensils[i] = null; a.uStates[i] = U.constructor.freshState();
    if (a.uSel === i) { a.utensil = null; a.uState = a.uStates[i]; a.streamOn = false; }
    const at = _v.copy(a.pos);
    if (toward) { const d = new THREE.Vector3(toward.pos.x - a.pos.x, 0, toward.pos.z - a.pos.z); if (d.lengthSq() > 0.01) at.addScaledVector(d.normalize(), 2.2); }
    const it = U.drop(id, at, a);
    it.noPickUntil = g.time + 2;
  }
  // a beam of light over every Titan holding a Legendary (0.55: no crown; not your own: it'd be in your way)
  _marks() {
    const g = this.game, t = g.time;
    const seen = new Set();
    for (const a of g.actors) {
      const ids = a.alive ? this.held(a) : [];
      if (!ids.length) continue;
      seen.add(a);
      let m = this.marks.get(a);
      if (!m) {
        BEAM_GEO ||= new THREE.CylinderGeometry(0.35, 0.8, 40, 12, 1, true).translate(0, 20, 0);
        m = new THREE.Group();
        const color = UTENSIL_BY_ID[ids[0]].color;
        m.add(new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })));
        m.userData.id = ids[0];
        g.scene.add(m);
        this.marks.set(a, m);
      }
      m.visible = true;
      m.children[0].visible = a !== g.player; // (your own beam would only get in your way: the others see it)
      m.position.copy(a.pos);
      m.children[0].material.opacity = 0.16 + Math.sin(t * 3) * 0.06;
    }
    for (const [a, m] of this.marks) if (!seen.has(a)) { g.scene.remove(m); this.marks.delete(a); }
  }
}
