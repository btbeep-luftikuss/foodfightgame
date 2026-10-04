// Cooking Pot Wars (0.25, online and any team size since 0.26): a team mode like Bed Wars, with
// cooking pots.
//  - Duos, Trios or Squads (see teams.js). For the first 30 s each team picks where its pot goes
//    (press G where you stand; bot teams set theirs down where their leader is). Nobody can be hurt
//    meanwhile.
//  - A pot spits out food every few seconds. You respawn next to your pot, as long as it stands.
//  - Every Titan carries a ladle (G): a melee swing that only hurts pots, and the only thing that does.
//  - (0.27) A carried pot goes back to its spot if its carrier goes down; while it's carried, its
//    team's knocked-out Titans watch the carrier and come back only if the carrier falls.
//  - (0.27) Turrets fire only when someone climbs in (T at your pot) and aims them.
//  - (0.28) Each team picks the 5 foods its pot spits out (its players vote; bot teams get 5 at random).
//  - Smash a pot and it goes on your back. Carry it home without getting splatted: your pot gets
//    more health, spits food faster, and its turret gets stronger.
//  - The turret on top of your pot fires your own food when you stand at the pot (only your team
//    can use it): harder, faster shots. A smashed pot takes its turret with it.
//  - Titans have 75 health in this mode. Utensils lie around the map. The last team standing wins.
// Online, the room's host owns the pots: it places them, takes ladle hits (other players send them
// as events), decides who smashed a pot and counts pots carried home, and shares every pot's state.
// Each player respawns their own Titan; the host respawns its bots.
import * as THREE from 'three';
import { clamp, rand, groundHeight, addCyl, FLOOR_Y } from './core.js';
import { FOODS, FOOD_IDS, pickupAmmo } from './foods.js';
import { randomUtensilId } from './utensils.js';
import { TEAMS, teamCount, teamHome } from './teams.js';

export const POT_HP = 75; // every Titan's health in this mode
const SETUP = 30, POT_LIFE = 300, LADLE_DMG = 15, LADLE_CD = 0.55, LADLE_REACH = 2.6;
const RESPAWN = 5, CAPTURE_HP = 150, SPIT_EVERY = 10, TURRET_REACH = 4.5;
export const POT_SETUP = SETUP;
const POT_R = 1.7, POT_H = 2.3;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _v = new THREE.Vector3(), _p = new THREE.Vector3();

// A big cooking pot in the team's colour, with a turret on the lid.
function potMesh(color, scale = 1) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#8d949c', metalness: 0.8, roughness: 0.35 });
  const team = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(POT_R, POT_R * 0.92, POT_H, 28), steel);
  body.position.y = POT_H / 2; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(POT_R * 1.02, POT_R * 1.02, 0.45, 28), team);
  band.position.y = POT_H * 0.55; g.add(band);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(POT_R, 0.12, 8, 28).rotateX(Math.PI / 2), steel);
  rim.position.y = POT_H; g.add(rim);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 6, 12), dark);
    h.position.set(s * (POT_R + 0.22), POT_H * 0.8, 0); h.rotation.y = Math.PI / 2; g.add(h);
  }
  const lid = new THREE.Mesh(new THREE.SphereGeometry(POT_R * 0.96, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), steel);
  lid.position.y = POT_H; g.add(lid);
  // the turret: a dome that turns, with a barrel
  const turret = new THREE.Group();
  turret.position.y = POT_H + 0.5;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10), team);
  turret.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.3, 12).rotateX(Math.PI / 2), dark);
  barrel.position.set(0, 0.1, -0.75); turret.add(barrel);
  g.add(turret);
  g.userData.turret = turret; g.userData.body = body;
  g.scale.setScalar(scale);
  return g;
}

// The ladle every Titan swings.
function ladleMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.9, roughness: 0.25 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 8), steel);
  handle.position.y = 0.35; g.add(handle);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
  bowl.material.side = THREE.DoubleSide;
  bowl.position.set(0, 0.76, 0.06); bowl.rotation.x = -Math.PI / 2; g.add(bowl);
  return g;
}

const r1 = (v) => Math.round(v * 10) / 10;

export class PotWars {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pots = [];
    this.fpLadle = ladleMesh();
    this.fpLadle.visible = false;
    game.camera.add(this.fpLadle);
  }
  // Offline, or the online host: this game decides what happens to the pots.
  get auth() { const g = this.game; return !g.online || !!g.net?.isHost; }
  setupLeft() { return this.setup ? this.setupUntil - this.game.time : 0; }

  clear() {
    const g = this.game;
    for (const p of this.pots) { if (p.mesh) g.scene.remove(p.mesh); if (p.collider) p.collider.enabled = false; p.label?.remove(); }
    for (const a of g.actors.concat(g.botActors)) this.setCarry(a, null);
    this.pots = [];
    this.active = false;
  }

  // A new match or round: one pot per team (not placed yet), 75 health, a field of utensils.
  // Teams are already chosen (game.teamSize, a.team).
  start() {
    const g = this.game, n = teamCount(g.teamSize);
    this.clear();
    this.active = true; this.over = false;
    this.setupUntil = g.time + SETUP; this.setup = true;
    this.raidAllAt = g.time + SETUP + 70; // after a while every bot goes raiding
    this.pots = TEAMS.slice(0, n).map((t, i) => ({ team: i, ...t, placed: false, alive: true, menu: [], carried: false, carrier: null, gunner: null, hp: POT_LIFE, maxHp: POT_LIFE, captures: 0, pos: new THREE.Vector3(), mesh: null, collider: null, spitAt: 0, flash: 0, firedAt: -9, label: null, out: false }));
    this.menuAt = 0;
    if (this.auth) for (const p of this.pots) p.menu = this._menuFor(p.team);
    const seen = new Array(n).fill(0);
    for (const a of g.actors) {
      if (a.team == null) continue;
      a.potRole = seen[a.team]++ === 1 ? 'raid' : 'guard'; // one raider per team to start with
      if (!a.isRemote) this._setHp(a);
    }
    if (this.auth) for (let i = 0; i < 12; i++) g.utensils.drop(randomUtensilId(), g.world.randomOpenSpot(null, 6)); // utensils lie around the map
    Object.assign(g.tide, { r: 330, phase: g.tide.phases.length, mode: 'wait', t: 0 }); // no Soap Tide
    g.world.setTide(0, 0, 330);
    if (g.player?.team != null && (g.player.alive || !g.online)) {
      g.hud.banner('Cooking Pot Wars', `You're on ${TEAMS[g.player.team].name}. Press G where you want your team's pot (30 s)`, 4);
    }
  }
  _setHp(a) { a.maxHp = POT_HP; a.hp = POT_HP; }

  // The 5 foods a team's pot spits out: its players' picks, by vote (first picks count a little
  // more); a team of bots (or too few picks) gets the rest at random.
  _menuFor(team) {
    const g = this.game, picks = [];
    if (g.player?.team === team && (!g.online || g.net?.ready)) picks.push(g.potMenu);
    if (g.online) for (const pr of g.net.proxies.values()) if (pr.ready && pr.actor.team === team) picks.push(pr.potMenu);
    const votes = new Map();
    for (const list of picks) (list || []).forEach((id, i) => { if (FOOD_IDS.includes(id)) votes.set(id, (votes.get(id) || 0) + 10 - i * 0.1); });
    const menu = [...votes.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(0, 5);
    const rest = FOOD_IDS.filter((id) => !menu.includes(id)).sort(() => Math.random() - 0.5);
    while (menu.length < 5) menu.push(rest.pop());
    return menu;
  }
  home(t) { return teamHome(this.game.world, this.pots.length, t); }

  // ---------------------------------------------------------------- pots
  _place(team, pos) {
    const g = this.game, p = this.pots[team];
    if (!p || p.placed) return;
    p.placed = true;
    p.pos.copy(pos);
    p.mesh = potMesh(p.color);
    p.mesh.position.copy(pos);
    g.scene.add(p.mesh);
    p.collider = addCyl(pos.x, pos.z, POT_R, pos.y, pos.y + POT_H, { surface: 'steel' });
    p.spitAt = g.time + 4;
    const el = document.createElement('div');
    el.className = 'plate potplate';
    el.innerHTML = `<span class="name"></span><span class="mini"><i class="h"></i></span>`;
    el.style.setProperty('--c', p.color);
    document.getElementById('nameplates').appendChild(el);
    p.label = el;
    if (team === g.player?.team) g.hud.toast(`${p.short} pot is down`);
  }
  // Is this a good spot for a pot? (not right next to another pot)
  _spotOk(pos) {
    return this.pots.every((q) => !q.placed || Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) > 25);
  }

  // The ladle (G): in the first 30 s it sets your team's pot down; then it's a swing.
  ladle(a) {
    const g = this.game, now = g.time;
    if (!this.active || now < (a.ladleReadyAt || 0) || !a.alive || a.team == null) return;
    if (this.setup) {
      if (a !== g.player) return;
      const p = this.pots[a.team];
      if (p.placed) { g.hud.toast('Your pot is already down'); return; }
      if (!a.onGround) { g.hud.toast('Stand on something to set the pot down'); return; }
      if (!this._spotOk(a.pos)) { g.hud.toast('Too close to another pot'); return; }
      a.ladleReadyAt = now + 1;
      if (this.auth) this._place(a.team, a.pos);
      else g.net.event('pp', r1(a.pos.x), r1(a.pos.y), r1(a.pos.z)); // the host puts it down
      g.sfx.play('thud', a.pos, 1.2);
      g.hud.banner('Pot down!', 'Guard it: you respawn here while it stands', 2.4);
      return;
    }
    a.ladleReadyAt = now + LADLE_CD; a.ladleT = 0.3;
    g.sfx.play('dodge', a.pos, 0.6);
    const p = this._inFront(a);
    if (!p) return;
    p.flash = 1;
    a.noiseAt = now; a.actionAt = now;
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    g.fx.burst('ice', _v.set(p.pos.x - dx / d * POT_R, p.pos.y + POT_H * 0.6, p.pos.z - dz / d * POT_R), 0.5);
    g.sfx.play('shield', p.pos, 1.1);
    if (a === g.player) { g.hud.hitmarker(false, p.hp <= LADLE_DMG); g.hud.float(_v.set(p.pos.x, p.pos.y + POT_H + 1.2, p.pos.z), LADLE_DMG, 'dmg'); }
    if (this.auth) this.hitPot(p, a);
    else if (a === g.player) g.net.event('lh', p.team); // the host takes the hit off
  }
  // The enemy pot a swing reaches (in front of the Titan, roughly).
  _inFront(a, slack = 0) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const p of this.pots) {
      if (!p.alive || !p.placed || p.team === a.team) continue;
      const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d - POT_R > LADLE_REACH + slack || Math.abs(a.pos.y - p.pos.y) > 2.5 + slack) continue;
      if (!slack && d > 0.5 && (dx * fx + dz * fz) / d < -0.2) continue;
      return p;
    }
    return null;
  }
  // (offline or host) A ladle hit lands.
  hitPot(p, a) {
    if (!p.alive || !p.placed || this.setup) return;
    p.hp -= LADLE_DMG; p.flash = 1;
    if (p.hp <= 0) this._smash(p, a);
  }
  // (host) Another player says their ladle hit pot `team`: check they're close enough and not swinging too fast.
  remoteHit(a, team) {
    const p = this.pots[team], now = performance.now(); // (real time: a busy host's game clock can lag)
    if (!p || a.team == null || p.team === a.team) return;
    a.netHits = (a.netHits || []).filter((t) => now - t < 2000);
    if (a.netHits.length >= 4) return; // no faster than a ladle swings (hits can arrive bunched up)
    if (Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) - POT_R > LADLE_REACH + 5) return; // (their Titan on my screen trails a little)
    a.netHits.push(now);
    a.ladleT = 0.3;
    this.hitPot(p, a);
  }
  // (host) Another player sets their team's pot down.
  remotePlace(a, pos) {
    if (!this.setup || a.team == null || this.pots[a.team]?.placed || !this._spotOk(pos)) return;
    if (Math.hypot(pos.x - a.pos.x, pos.z - a.pos.z) > 15) return; // where they stand (their Titan on my screen may trail a little)
    this._place(a.team, pos);
  }

  _smash(p, a) {
    const g = this.game;
    if (!p.alive && !p.mesh?.parent) return;
    p.alive = false; p.hp = 0; p.carried = !!a || (!this.auth && p.carried); p.carrier = a || null;
    this._leaveTurret(p.gunner);
    if (p.mesh) g.scene.remove(p.mesh);
    if (p.collider) p.collider.enabled = false;
    if (p.label) p.label.style.display = 'none';
    g.fx.burst('splat-out', _v.set(p.pos.x, p.pos.y + 1, p.pos.z), 2);
    g.sfx.play('boom', p.pos);
    g.world.paintSplat(p.pos.x, p.pos.y, p.pos.z, 4, 'tomato');
    if (a) {
      // the smasher carries it home on their back (online: the host tells everyone who)
      if (!a.isRemote) this.setCarry(a, p.team);
      if (g.online && this.auth) g.net.event('ps', p.team, g.net._peerOf(a));
      const mine = a.team === g.player?.team || p.team === g.player?.team;
      g.hud.feed(`<b style="color:${a.color}">${esc(a.name)}</b> <em>smashed</em> <b style="color:${p.color}">${p.name}'s pot</b>`, mine);
      if (a === g.player) g.hud.banner('Pot smashed!', 'Carry it back to your pot', 2.6);
    }
    if (p.team === g.player?.team && a !== g.player) g.hud.banner('Your pot was smashed!', 'Splat the carrier before they get it home, and it comes back', 3.2);
    this._checkWin();
  }
  // A smashed pot rides on a Titan's back (team) or not (null).
  setCarry(a, team) {
    if ((a.carry ?? null) === team) return;
    if (a.carryMesh) a.root.remove(a.carryMesh);
    a.carry = team; a.carryMesh = null;
    if (team != null && TEAMS[team]) {
      a.carryMesh = potMesh(TEAMS[team].color, 0.32);
      a.carryMesh.position.set(0, 1.0, -0.55);
      a.root.add(a.carryMesh);
    }
  }
  _dropCarry(a, lost = true) {
    if (lost && a.carry != null && a === this.game.player) this.game.hud.toast('The pot on your back is lost');
    this.setCarry(a, null);
  }
  // A pot carried home (offline or host decides; a player's own game asks the host).
  _deliver(a) {
    const g = this.game, mine = this.pots[a.team], from = this.pots[a.carry];
    this.setCarry(a, null);
    if (!this.auth) { g.net.event('pc', from.team); g.hud.banner('Pot brought home!', 'Your pot gets stronger', 2.4); return; }
    this.capture(mine, from, a);
  }
  capture(mine, from, a) {
    const g = this.game;
    from.carried = false; from.carrier = null; // gone for good: its team respawns no more
    mine.captures++; mine.maxHp += CAPTURE_HP; mine.hp = Math.min(mine.maxHp, mine.hp + CAPTURE_HP);
    g.sfx.play('pickup', mine.pos, 1.4);
    g.hud.feed(`<b style="color:${a.color}">${esc(a.name)}</b> brought <b style="color:${from.color}">${from.name}'s pot</b> home`, a.team === g.player?.team);
    if (a.team === g.player?.team) g.hud.banner('Pot brought home!', `Your pot: +${CAPTURE_HP} health, more food, turret level ${1 + mine.captures}`, 3);
  }
  // (host) Another player brought a pot home.
  remoteCapture(a, fromTeam) {
    const mine = this.pots[a.team], from = this.pots[fromTeam];
    if (!mine || !from || !mine.alive || from.alive || !from.carried || a.capturedFrom === fromTeam + 100 * from.captures) return;
    if (Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) > POT_R + 8) return;
    a.capturedFrom = fromTeam + 100 * from.captures; // once per smashed pot
    this.capture(mine, from, a);
  }

  // The turret: whoever sits in their own pot's turret fires from it, harder and faster.
  turretFor(owner) {
    if (!this.active || this.setup || !owner || owner.isRemote) return null;
    const p = owner.inTurret;
    if (!p || !p.alive || !p.placed) return null;
    const lv = 1 + p.captures;
    const yaw = Math.atan2(-owner.aimDir.x, -owner.aimDir.z);
    p.mesh.userData.turret.rotation.y = yaw;
    p.firedAt = this.game.time;
    const muzzle = new THREE.Vector3(p.pos.x - Math.sin(yaw) * 1.5, p.pos.y + POT_H + 0.6, p.pos.z - Math.cos(yaw) * 1.5);
    return { mult: 1.6 + 0.4 * (lv - 1), speed: 1.2 + 0.05 * (lv - 1), muzzle, level: lv };
  }

  // (offline or host) The carrier went down (or left): the pot goes back to its spot, half full.
  _restore(p) {
    const g = this.game;
    if (p.alive) return;
    p.alive = true; p.carried = false; p.carrier = null;
    if (this.auth) p.hp = Math.max(p.hp, p.maxHp * 0.5);
    if (p.mesh) g.scene.add(p.mesh);
    if (p.collider) p.collider.enabled = true;
    if (p.label) p.label.style.display = '';
    for (const a of g.actors) if (a.carry === p.team && !a.isRemote) this.setCarry(a, null);
    g.fx.burst('steam', _v.set(p.pos.x, p.pos.y + POT_H, p.pos.z), 1.5);
    g.sfx.play('pickup', p.pos, 1.2);
    g.hud.feed(`<b style="color:${p.color}">${p.name}'s pot</b> is back at its spot`, p.team === g.player?.team);
    if (p.team === g.player?.team) g.hud.banner('Your pot is back!', 'Its carrier went down', 2.6);
  }

  // T at your own pot: climb into its turret (and T again to climb out). One gunner per turret.
  toggleTurret(a) {
    const g = this.game;
    if (!this.active || !a.alive || a.team == null) return;
    if (a.inTurret) { this._leaveTurret(a); return; }
    const p = this.pots[a.team];
    if (this.setup || !p || !p.alive || !p.placed) { if (a === g.player) g.hud.toast(this.setup ? 'The turrets open when the pots are down' : 'Your pot is gone: no turret'); return; }
    if (Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) > POT_R + TURRET_REACH || Math.abs(a.pos.y - p.pos.y) > 3) { if (a === g.player) g.hud.toast('Go to your pot to get in its turret'); return; }
    if (p.gunner && p.gunner !== a && p.gunner.alive && p.gunner.inTurret === p) { if (a === g.player) g.hud.toast(`${p.gunner.name} is in the turret`); return; }
    p.gunner = a; a.inTurret = p;
    a.pos.set(p.pos.x, p.pos.y + POT_H, p.pos.z); a.vel.set(0, 0, 0);
    if (a === g.player) g.hud.banner('In the turret', `Aim and throw: ${(1.6 + 0.4 * p.captures).toFixed(1)}× damage · T to climb out`, 2.6);
  }
  _leaveTurret(a) {
    if (!a || !a.inTurret) return;
    const p = a.inTurret;
    if (p.gunner === a) p.gunner = null;
    a.inTurret = null;
    if (a.alive && p.placed) { a.pos.set(p.pos.x + POT_R + 1.2, p.pos.y, p.pos.z); a.pos.y = groundHeight(a.pos.x, a.pos.z, a.pos.y + 1); }
  }

  // ---------------------------------------------------------------- deaths and respawns
  // Returns true if this Titan will respawn at their pot.
  // 'back': respawns at the pot; 'wait': the pot is being carried (back only if its carrier falls); false: out.
  onDeath(a) {
    this._dropCarry(a);
    this._leaveTurret(a);
    const p = this.pots[a.team];
    a.waiting = false;
    if (p && (p.alive || this.setup)) { a.respawnAt = this.game.time + RESPAWN; return 'back'; }
    a.respawnAt = 0;
    if (p && p.carried) { a.waiting = true; return 'wait'; }
    return false;
  }
  _respawn(a) {
    const g = this.game, p = this.pots[a.team];
    const kills = a.kills, team = a.team, name = a.name, role = a.potRole, color = a.color, bot = a.isBot;
    a.reset();
    Object.assign(a, { kills, team, name, potRole: role, color, isBot: bot });
    this._setHp(a);
    const ang = rand(0, Math.PI * 2);
    if (p.placed) {
      a.pos.set(p.pos.x + Math.cos(ang) * (POT_R + 2), p.pos.y + 0.2, p.pos.z + Math.sin(ang) * (POT_R + 2));
      a.pos.y = groundHeight(a.pos.x, a.pos.z, a.pos.y + 1);
    } else a.pos.copy(g.world.randomOpenSpot(this.home(team), 4));
    a.onGround = true; a.respawnAt = 0;
    a.give('tomato', 2);
    a.root.visible = true;
    const brain = g.brains.get(a);
    if (brain) g.brains.set(a, new brain.constructor(a, g)); // a fresh mind for a fresh life
    if (a === g.player) { g.input.yaw = a.yaw; g.camPivotY = a.pos.y; g.hud.banner('Back in!', 'Respawned at your pot', 1.6); }
  }

  teamAlive(t) { const p = this.pots[t]; return !!p && (p.alive || p.carried || this.game.actors.some((a) => a.team === t && a.alive)); }

  _checkWin() {
    const g = this.game;
    if (this.over || this.setup) return;
    for (const p of this.pots) {
      if (!this.teamAlive(p.team) && !p.out) {
        p.out = true;
        g.hud.feed(`<b style="color:${p.color}">${p.name}</b> is out`, p.team === g.player?.team);
      }
    }
    if (g.online) return; // online, the host's round clock ends the round (game._hostRound)
    const left = this.pots.filter((p) => this.teamAlive(p.team));
    if (left.length > 1) return;
    this.over = true;
    g.teamWins(left[0] ? left[0].team : null);
  }

  // ---------------------------------------------------------------- online: the host shares the pots
  // [seconds of setup left, then per pot: placed, alive (1; 2: carried off; 0: gone), hp, max hp, pots carried home, x, y, z]
  state() {
    return [Math.max(0, Math.round(this.setupLeft() * 10) / 10), ...this.pots.map((p) => [p.placed ? 1 : 0, p.alive ? 1 : p.carried ? 2 : 0, Math.round(p.hp), Math.round(p.maxHp), p.captures, r1(p.pos.x), r1(p.pos.y), r1(p.pos.z), p.gunner?.alive ? 1 : 0, p.menu.map((id) => FOOD_IDS.indexOf(id).toString(36)).join('')])];
  }
  applyState(st, num) {
    if (!this.active || !Array.isArray(st)) return;
    const g = this.game;
    const left = num(st[0], 0, SETUP);
    this.setup = left > 0; this.setupUntil = g.time + left;
    this.pots.forEach((p, i) => {
      const e = st[i + 1];
      if (!Array.isArray(e)) return;
      if (e[0] === 1 && !p.placed) this._place(i, new THREE.Vector3(num(e[5], -300, 300), num(e[6], -40, 120), num(e[7], -300, 300)));
      if (typeof e[9] === 'string' && e[9].length <= 5) { const m = [...e[9]].map((c) => FOOD_IDS[parseInt(c, 36)]).filter(Boolean); if (m.length) p.menu = m; }
      p.hp = num(e[2], 0, 5000); p.maxHp = num(e[3], 1, 5000, POT_LIFE); p.captures = num(e[4], 0, 20) | 0;
      if (e[1] !== 1 && p.alive && p.placed) this._smash(p, null);
      p.carried = e[1] === 2;
      if (e[1] === 1 && !p.alive && p.placed) this._restore(p);
    });
  }
  // The host says who smashed a pot: if it was me, it goes on my back.
  remoteSmash(team, by) {
    const p = this.pots[team];
    if (!p) return;
    if (p.alive && p.placed) this._smash(p, by && !by.isRemote ? by : null);
    else if (by === this.game.player && by.alive) { this.setCarry(by, team); this.game.hud.banner('Pot smashed!', 'Carry it back to your pot', 2.6); }
    if (by && by.isRemote) this.game.hud.feed(`<b style="color:${by.color}">${esc(by.name)}</b> <em>smashed</em> <b style="color:${p.color}">${p.name}'s pot</b>`, p.team === this.game.player?.team);
  }

  // ---------------------------------------------------------------- bots
  // Where a bot should head in this mode (null: fight and loot as usual).
  botGoal(a, target, targetD) {
    if (!this.active || this.setup || a.team == null) return null;
    const mine = this.pots[a.team];
    if (a.carry != null) return mine.alive ? { pos: mine.pos, kind: 'home' } : null;
    if (mine.carried) { // our pot is on someone's back: get it back
      const c = this.game.actors.find((x) => x.alive && x.carry === a.team);
      if (c) return { pos: c.pos, kind: 'hunt' };
    }
    if (a.inTurret) return null;
    if (target && targetD < 16) return null;
    const raid = a.potRole === 'raid' || !mine.alive || this.game.time > this.raidAllAt;
    if (raid) {
      let best = null, bd = Infinity;
      for (const p of this.pots) {
        if (!p.alive || !p.placed || p.team === a.team) continue;
        const d = p.pos.distanceTo(a.pos);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) return { pos: best.pos, kind: 'pot' };
    } else if (mine.placed && Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) > POT_R + 3) return { pos: mine.pos, kind: 'guard' };
    return null;
  }
  // Close enough to swing at the pot it's heading for?
  inReach(a, goal) { return Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z) < POT_R + LADLE_REACH - 0.4; }

  // ---------------------------------------------------------------- every step
  update(dt) {
    if (!this.active) return;
    const g = this.game, now = g.time;
    if (this.auth && this.setup && now >= this.menuAt) { this.menuAt = now + 0.5; for (const p of this.pots) p.menu = this._menuFor(p.team); } // the team can still change its mind
    if (this.auth && this.setup && now >= this.setupUntil) {
      this.setup = false;
      for (const p of this.pots) {
        if (p.placed) continue;
        // a team that didn't choose: a teammate's spot if they stand on the floor, else somewhere in its home
        const lead = g.actors.find((a) => a.team === p.team && a.alive && a.onGround && this._spotOk(a.pos));
        let pos = lead ? lead.pos.clone() : null;
        for (let k = 0; !pos && k < 10; k++) { const s = g.world.randomOpenSpot(this.home(p.team), 6); if (this._spotOk(s)) pos = s; }
        this._place(p.team, pos || g.world.randomOpenSpot(this.home(p.team), 6));
      }
    }
    if (this.setup !== this.wasSetup && !this.setup && this.wasSetup !== undefined) {
      g.hud.banner('Pots are down!', 'Smash their pots with your ladle (G) · press T at yours to get in its turret', 3.2);
      const mine = this.pots[g.player?.team];
      if (mine) g.hud.feed(`Your pot cooks: ${mine.menu.map((id) => FOODS[id]?.name).join(', ')}`, true);
      g.sfx.play('tide', null, 0.6);
    }
    this.wasSetup = this.setup;
    for (const p of this.pots) {
      if (!p.alive || !p.placed) continue;
      // the pot spits out food, faster with every pot carried home
      if (now >= p.spitAt) {
        p.spitAt = now + SPIT_EVERY / (1 + 0.6 * p.captures);
        const id = p.menu[(Math.random() * p.menu.length) | 0] || 'tomato', a = rand(0, Math.PI * 2); // from the team's menu
        g.items.drop(id, pickupAmmo(id), _v.set(p.pos.x, p.pos.y + POT_H + 0.5, p.pos.z), _p.set(Math.cos(a) * 5, 9, Math.sin(a) * 5));
        g.fx.burst('steam', _v.set(p.pos.x, p.pos.y + POT_H, p.pos.z), 0.6);
      }
      p.flash = Math.max(0, p.flash - dt * 5);
      p.mesh.userData.body.material.emissive?.setRGB(p.flash * 0.6, p.flash * 0.2, 0);
    }
    if (this.auth) for (const p of this.pots) {
      if (p.carried && (!p.carrier || !p.carrier.alive || !g.actors.includes(p.carrier))) this._restore(p); // its carrier fell
    }
    const P = g.player, sp = g.spectator;
    if (P && !P.alive && P.waiting) { // my pot is on someone's back: watch them
      const c = g.actors.find((x) => x.alive && x.carry === P.team);
      if (c && sp.active && sp.target !== c) { sp.follow(c); g.hud.toast(`Watching ${c.name}: if they go down, you're back`); }
    }
    for (const a of g.actors) {
      if (a.isRemote || a.team == null) continue; // other players look after their own Titans
      const mine = this.pots[a.team];
      if (!a.alive && a.waiting) { // carried off: back if it comes home, out if it's carried into their pot
        if (mine.alive) { a.waiting = false; a.respawnAt = now + 1.5; }
        else if (!mine.carried) {
          a.waiting = false;
          if (a === P && !g.online) g.onMatchEvent?.('playerDown', { killer: a.koBy, placement: a.placement, note: 'Your pot was carried off, so no more respawns.' });
          else if (a === P) g.hud.banner('Out!', 'Your pot was carried off', 2.6);
        }
      }
      if (a.inTurret) { // sitting in the turret: stays put on the lid
        const p = a.inTurret;
        if (!a.alive || !p.alive) this._leaveTurret(a);
        else { a.pos.x = p.pos.x; a.pos.z = p.pos.z; a.vel.x = a.vel.z = 0; }
      } else if (a.isBot && a.alive && a.potRole === 'guard' && mine.alive && mine.placed && !mine.gunner?.inTurret && Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) < POT_R + 3) {
        this.toggleTurret(a); // a guarding bot mans the turret
      }
      // a pot carried home
      if (a.alive && a.carry != null) {
        const mine = this.pots[a.team];
        if (mine.alive && Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) < POT_R + 3 && Math.abs(a.pos.y - mine.pos.y) < 3) this._deliver(a);
      }
      if (!a.alive && a.respawnAt && now >= a.respawnAt && !this.over && g.state !== 'over') {
        if (mine.alive) this._respawn(a);
        else { a.respawnAt = 0; a.waiting = mine.carried; }
      }
    }
    this._checkWin();
  }

  // Every frame: labels over the pots, the ladle swings.
  updateVisual(dt, camera, hud) {
    if (!this.active) { this.fpLadle.visible = false; return; }
    const g = this.game;
    for (const p of this.pots) {
      if (!p.alive || !p.placed) continue;
      const gun = p.gunner?.inTurret === p ? p.gunner : g.actors.find((a) => a.isRemote && a.alive && a.netTurret && a.team === p.team);
      if (gun) p.mesh.userData.turret.rotation.y = gun.isRemote ? gun.yaw : Math.atan2(-gun.aimDir.x, -gun.aimDir.z); // aimed by whoever sits in it
      else if (g.time - p.firedAt > 1.5) p.mesh.userData.turret.rotation.y += dt * 0.4; // empty: it idles
      _v.set(p.pos.x, p.pos.y + POT_H + 1.6, p.pos.z);
      const s = camera.position.distanceTo(_v) < 120 ? hud._project(_v, camera) : null;
      if (!s) { p.label.style.display = 'none'; continue; }
      p.label.style.display = '';
      p.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const txt = `${p.short} pot${p.captures ? ` · turret ${1 + p.captures}` : ''}`;
      const n = p.label.firstChild;
      if (n.textContent !== txt) n.textContent = txt;
      p.label.querySelector('.h').style.width = `${Math.max(0, p.hp) / p.maxHp * 100}%`;
    }
    // ladle swings: in the right hand of whoever swings (and in front of your eyes in first person)
    for (const a of g.actors) {
      a.ladleT = Math.max(0, (a.ladleT || 0) - dt);
      const show = a.ladleT > 0 && a.alive && !(a === g.player && a.fpCam);
      if (show && !a.ladleMesh) { a.ladleMesh = ladleMesh(); a.ladleMesh.scale.setScalar(1.6); a.rig.handAnchorR.add(a.ladleMesh); }
      if (a.ladleMesh) {
        a.ladleMesh.visible = show;
        if (a.heldMesh) a.heldMesh.visible = !show && !a.shieldUp;
        if (show) a.ladleMesh.rotation.set(-2.2 + (1 - a.ladleT / 0.3) * 2.6, 0, 0);
      }
    }
    const P = g.player, fp = P && P.alive && P.fpCam && P.ladleT > 0;
    this.fpLadle.visible = !!fp;
    if (fp) {
      const k = 1 - P.ladleT / 0.3;
      this.fpLadle.position.set(0.3 - k * 0.4, -0.45 + Math.sin(k * Math.PI) * 0.25, -0.75);
      this.fpLadle.rotation.set(-0.4 - k * 1.6, 0.3, 0.6 - k * 0.9);
    }
  }

  // The top pill: the setup countdown, then the mode name.
  pill() { return this.setup ? `Pots ${Math.max(0, Math.ceil(this.setupLeft()))}` : 'Pot Wars'; }
}
