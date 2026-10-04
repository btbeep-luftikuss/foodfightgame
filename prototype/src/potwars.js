// Cooking Pot Wars (0.25): a team mode like Bed Wars, with cooking pots. Play vs bots only.
//  - 4 teams of 3. For the first 30 s each team picks where its pot goes (you: press G where you
//    stand; bot teams set theirs down where their leader is). Nobody can be hurt meanwhile.
//  - A pot spits out food every few seconds. You respawn next to your pot, as long as it stands.
//  - Every Titan carries a ladle (G): a melee swing that only hurts pots, and the only thing that does.
//  - Smash a pot and it goes on your back. Carry it home without getting splatted: your pot gets
//    more health, spits food faster, and its turret gets stronger.
//  - The turret on top of your pot fires your own food when you stand at the pot (only your team
//    can use it): harder, faster shots. A smashed pot takes its turret with it.
//  - Titans have 75 health in this mode. Utensils lie around the map. The last team standing wins.
import * as THREE from 'three';
import { clamp, rand, groundHeight, addCyl, FLOOR_Y } from './core.js';
import { FOODS, pickupAmmo, randomFoodId } from './foods.js';
import { randomUtensilId } from './utensils.js';

export const POT_TEAMS = [
  { name: 'Team Tomato', color: '#f0503a' },
  { name: 'Team Blueberry', color: '#4f8ff0' },
  { name: 'Team Lime', color: '#5fbf5f' },
  { name: 'Team Butter', color: '#ffd447' },
];
export const POT_HP = 75; // every Titan's health in this mode
const SETUP = 30, POT_LIFE = 300, LADLE_DMG = 15, LADLE_CD = 0.55, LADLE_REACH = 2.6;
const RESPAWN = 5, CAPTURE_HP = 150, SPIT_EVERY = 10, TURRET_REACH = 4.5;
const POT_R = 1.7, POT_H = 2.3;
// where each team starts, in the four corners of the floor
const CORNERS = [
  { minX: -220, maxX: -90, minZ: 45, maxZ: 150 }, { minX: 90, maxX: 220, minZ: 45, maxZ: 150 },
  { minX: -220, maxX: -90, minZ: -120, maxZ: -20 }, { minX: 90, maxX: 220, minZ: -120, maxZ: -20 },
];
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

export class PotWars {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pots = [];
    this.panel = document.getElementById('potsPanel');
    this.fpLadle = ladleMesh();
    this.fpLadle.visible = false;
    game.camera.add(this.fpLadle);
  }

  clear() {
    const g = this.game;
    for (const p of this.pots) { g.scene.remove(p.mesh); if (p.collider) p.collider.enabled = false; p.label?.remove(); }
    for (const a of g.botActors) this._dropCarry(a, false);
    this.pots = [];
    this.active = false;
    if (this.panel) this.panel.hidden = true;
  }

  // A new match: teams, team corners, 75 health, a field of utensils.
  start() {
    const g = this.game;
    this.clear();
    this.active = true; this.over = false;
    this.setupUntil = g.time + SETUP; this.setup = true;
    this.raidAllAt = g.time + SETUP + 70; // after a while every bot goes raiding
    this.pots = POT_TEAMS.map((t, i) => ({ team: i, ...t, placed: false, alive: true, hp: POT_LIFE, maxHp: POT_LIFE, captures: 0, pos: new THREE.Vector3(), mesh: null, collider: null, spitAt: 0, flash: 0, firedAt: -9, label: null }));
    g.actors.forEach((a, i) => {
      a.team = i % 4;
      a.color = POT_TEAMS[a.team].color;
      a.potRole = i >= 4 && i < 8 ? 'raid' : 'guard'; // one raider per team to start with
      const s = g.world.randomOpenSpot({ ...CORNERS[a.team], top: g.world.regions.floor.top }, 4);
      a.pos.set(s.x, s.y + 28 + rand(0, 6), s.z);
      a.yaw = Math.atan2(s.x, s.z);
      this._setHp(a);
    });
    // utensils lie around the map
    for (let i = 0; i < 12; i++) g.utensils.drop(randomUtensilId(), g.world.randomOpenSpot(null, 6));
    Object.assign(g.tide, { r: 330, phase: g.tide.phases.length, mode: 'wait', t: 0 }); // no Soap Tide
    g.world.setTide(0, 0, 330);
    if (this.panel) this.panel.hidden = false;
    if (g.player) {
      g.input.yaw = g.player.yaw;
      g.hud.banner('Cooking Pot Wars', `You're on ${POT_TEAMS[0].name}. Press G where you want your team's pot (30 s)`, 4);
    }
  }
  _setHp(a) { a.maxHp = POT_HP; a.hp = POT_HP; }

  // ---------------------------------------------------------------- pots
  _place(team, pos) {
    const g = this.game, p = this.pots[team];
    if (p.placed) return;
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
  }
  // Is this a good spot for a pot? (on the ground, not right next to another pot)
  _spotOk(pos) {
    return this.pots.every((q) => !q.placed || Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) > 25);
  }

  // The ladle (G): in the first 30 s it sets your team's pot down; then it's a swing.
  ladle(a) {
    const g = this.game, now = g.time;
    if (!this.active || now < (a.ladleReadyAt || 0) || !a.alive) return;
    if (this.setup) {
      if (a !== g.player) return;
      const p = this.pots[a.team];
      if (p.placed) { g.hud.toast('Your pot is already down'); return; }
      if (!a.onGround) { g.hud.toast('Stand on something to set the pot down'); return; }
      if (!this._spotOk(a.pos)) { g.hud.toast('Too close to another pot'); return; }
      this._place(a.team, a.pos);
      g.sfx.play('thud', a.pos, 1.2);
      g.hud.banner('Pot down!', 'Guard it: you respawn here while it stands', 2.4);
      return;
    }
    a.ladleReadyAt = now + LADLE_CD; a.ladleT = 0.3;
    g.sfx.play('dodge', a.pos, 0.6);
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    for (const p of this.pots) {
      if (!p.alive || !p.placed || p.team === a.team) continue;
      const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d - POT_R > LADLE_REACH || Math.abs(a.pos.y - p.pos.y) > 2.5) continue;
      if (d > 0.5 && (dx * fx + dz * fz) / d < -0.2) continue; // facing it (roughly)
      p.hp -= LADLE_DMG; p.flash = 1;
      a.noiseAt = now; a.actionAt = now;
      g.fx.burst('ice', _v.set(p.pos.x - dx / d * POT_R, p.pos.y + POT_H * 0.6, p.pos.z - dz / d * POT_R), 0.5);
      g.sfx.play('shield', p.pos, 1.1);
      if (a === g.player) { g.hud.hitmarker(false, p.hp <= 0); g.hud.float(_v.set(p.pos.x, p.pos.y + POT_H + 1.2, p.pos.z), LADLE_DMG, 'dmg'); }
      if (p.hp <= 0) this._smash(p, a);
      break;
    }
  }

  _smash(p, a) {
    const g = this.game;
    p.alive = false; p.hp = 0;
    g.scene.remove(p.mesh); p.collider.enabled = false; p.label.style.display = 'none';
    g.fx.burst('splat-out', _v.set(p.pos.x, p.pos.y + 1, p.pos.z), 2);
    g.sfx.play('boom', p.pos);
    g.world.paintSplat(p.pos.x, p.pos.y, p.pos.z, 4, 'tomato');
    // the smasher carries it home on their back
    this._dropCarry(a, false);
    a.carry = p.team;
    a.carryMesh = potMesh(p.color, 0.32);
    a.carryMesh.position.set(0, 1.0, -0.55);
    a.root.add(a.carryMesh);
    const mine = a.team === g.player?.team || p.team === g.player?.team;
    g.hud.feed(`<b style="color:${a.color}">${esc(a.name)}</b> <em>smashed</em> <b style="color:${p.color}">${p.name}'s pot</b>`, mine);
    if (a === g.player) g.hud.banner('Pot smashed!', 'Carry it back to your pot', 2.6);
    else if (p.team === g.player?.team) g.hud.banner('Your pot is gone!', 'No more respawns: stay alive', 3);
    this._checkWin();
  }
  _dropCarry(a, lost = true) {
    if (a.carryMesh) a.root.remove(a.carryMesh);
    if (lost && a.carry != null && a === this.game.player) this.game.hud.toast('The pot on your back is lost');
    a.carry = null; a.carryMesh = null;
  }

  // The turret: a teammate standing at their own pot fires from it, harder and faster.
  turretFor(owner) {
    if (!this.active || this.setup || !owner || owner.team == null) return null;
    const p = this.pots[owner.team];
    if (!p || !p.alive || !p.placed) return null;
    if (Math.hypot(owner.pos.x - p.pos.x, owner.pos.z - p.pos.z) > POT_R + TURRET_REACH || Math.abs(owner.pos.y - p.pos.y) > 3) return null;
    const lv = 1 + p.captures;
    const yaw = Math.atan2(-owner.aimDir.x, -owner.aimDir.z);
    p.mesh.userData.turret.rotation.y = yaw;
    p.firedAt = this.game.time;
    const muzzle = new THREE.Vector3(p.pos.x - Math.sin(yaw) * 1.5, p.pos.y + POT_H + 0.6, p.pos.z - Math.cos(yaw) * 1.5);
    return { mult: 1.6 + 0.4 * (lv - 1), speed: 1.2 + 0.05 * (lv - 1), muzzle, level: lv };
  }

  // ---------------------------------------------------------------- deaths and respawns
  // Returns true if this Titan will respawn at their pot.
  onDeath(a) {
    this._dropCarry(a);
    const p = this.pots[a.team];
    if (p && p.alive) { a.respawnAt = this.game.time + RESPAWN; return true; }
    a.respawnAt = 0;
    return false;
  }
  _respawn(a) {
    const g = this.game, p = this.pots[a.team];
    const kills = a.kills, team = a.team, name = a.name, role = a.potRole;
    a.reset();
    Object.assign(a, { kills, team, name, potRole: role, isBot: a !== g.player });
    a.color = POT_TEAMS[team].color;
    this._setHp(a);
    const ang = rand(0, Math.PI * 2);
    a.pos.set(p.pos.x + Math.cos(ang) * (POT_R + 2), p.pos.y + 0.2, p.pos.z + Math.sin(ang) * (POT_R + 2));
    a.pos.y = groundHeight(a.pos.x, a.pos.z, a.pos.y + 1);
    a.onGround = true; a.respawnAt = 0;
    a.give('tomato', 2);
    a.root.visible = true;
    const brain = g.brains.get(a);
    if (brain) g.brains.set(a, new brain.constructor(a, g)); // a fresh mind for a fresh life
    if (a === g.player) { g.input.yaw = a.yaw; g.camPivotY = a.pos.y; g.hud.banner('Back in!', 'Respawned at your pot', 1.6); }
  }

  teamAlive(t) { return this.pots[t].alive || this.game.actors.some((a) => a.team === t && a.alive); }

  _checkWin() {
    const g = this.game;
    if (this.over || this.setup) return;
    const left = this.pots.filter((p) => this.teamAlive(p.team));
    for (const p of this.pots) {
      if (!this.teamAlive(p.team) && !p.out) {
        p.out = true;
        g.hud.feed(`<b style="color:${p.color}">${p.name}</b> is out`, p.team === g.player?.team);
      }
    }
    if (left.length > 1) return;
    this.over = true;
    const t = left[0] || null;
    const w = t ? g.actors.find((a) => a.team === t.team && a.alive) || g.actors.find((a) => a.team === t.team) : null;
    g.state = 'over'; g.winner = w; g.endAt = g.time;
    if (w) w.placement = 1;
    const won = !!t && t.team === g.player?.team;
    if (won) { g.sfx.play('win'); g.hud.banner("Chef's Kiss!", `${t.name} wins Cooking Pot Wars`, 4); }
    else g.hud.banner('Match over', `${t ? t.name : 'Nobody'} wins`, 4);
    g.onMatchEvent?.('over', { winner: w, team: t?.name, won });
  }

  // ---------------------------------------------------------------- bots
  // Where a bot should head in this mode (null: fight and loot as usual).
  botGoal(a, target, targetD) {
    if (!this.active || this.setup) return null;
    const mine = this.pots[a.team];
    if (a.carry != null) return mine.alive ? { pos: mine.pos, kind: 'home' } : null;
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
    } else if (Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) > POT_R + 3) return { pos: mine.pos, kind: 'guard' };
    return null;
  }
  // Close enough to swing at the pot it's heading for?
  inReach(a, goal) { return Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z) < POT_R + LADLE_REACH - 0.4; }

  // ---------------------------------------------------------------- every step
  update(dt) {
    if (!this.active) return;
    const g = this.game, now = g.time;
    if (this.setup && now >= this.setupUntil) {
      this.setup = false;
      for (const p of this.pots) {
        if (p.placed) continue;
        // a team that didn't choose: its leader's spot if they stand on the floor, else somewhere in its corner
        const lead = (p.team === g.player?.team ? g.player : null) || g.actors.find((a) => a.team === p.team && a.alive);
        let pos = lead && lead.alive && lead.onGround && this._spotOk(lead.pos) ? lead.pos.clone() : null;
        for (let k = 0; !pos && k < 10; k++) { const s = g.world.randomOpenSpot({ ...CORNERS[p.team], top: g.world.regions.floor.top }, 6); if (this._spotOk(s)) pos = s; }
        this._place(p.team, pos || g.world.randomOpenSpot({ ...CORNERS[p.team], top: g.world.regions.floor.top }, 6));
      }
      g.hud.banner('Pots are down!', 'Smash their pots with your ladle (G) · stand at yours to use its turret', 3.2);
      g.sfx.play('tide', null, 0.6);
    }
    for (const p of this.pots) {
      if (!p.alive || !p.placed) continue;
      // the pot spits out food, faster with every pot carried home
      if (now >= p.spitAt) {
        p.spitAt = now + SPIT_EVERY / (1 + 0.6 * p.captures);
        const id = randomFoodId(), a = rand(0, Math.PI * 2);
        g.items.drop(id, pickupAmmo(id), _v.set(p.pos.x, p.pos.y + POT_H + 0.5, p.pos.z), _p.set(Math.cos(a) * 5, 9, Math.sin(a) * 5));
        g.fx.burst('steam', _v.set(p.pos.x, p.pos.y + POT_H, p.pos.z), 0.6);
      }
      p.flash = Math.max(0, p.flash - dt * 5);
      p.mesh.userData.body.material.emissive?.setRGB(p.flash * 0.6, p.flash * 0.2, 0);
    }
    for (const a of g.actors) {
      // a pot carried home
      if (a.alive && a.carry != null) {
        const mine = this.pots[a.team];
        if (mine.alive && Math.hypot(a.pos.x - mine.pos.x, a.pos.z - mine.pos.z) < POT_R + 3 && Math.abs(a.pos.y - mine.pos.y) < 3) {
          const from = this.pots[a.carry];
          this._dropCarry(a, false);
          mine.captures++; mine.maxHp += CAPTURE_HP; mine.hp = Math.min(mine.maxHp, mine.hp + CAPTURE_HP);
          g.sfx.play('pickup', mine.pos, 1.4);
          g.hud.feed(`<b style="color:${a.color}">${esc(a.name)}</b> brought <b style="color:${from.color}">${from.name}'s pot</b> home`, a.team === g.player?.team);
          if (a.team === g.player?.team) g.hud.banner('Pot brought home!', `Your pot: +${CAPTURE_HP} health, more food, turret level ${1 + mine.captures}`, 3);
        }
      }
      if (!a.alive && a.respawnAt && now >= a.respawnAt && !this.over) {
        if (this.pots[a.team].alive) this._respawn(a); else a.respawnAt = 0;
      }
    }
    this._checkWin();
  }

  // Every frame: labels over the pots, the team panel, the ladle swings.
  updateVisual(dt, camera, hud) {
    if (!this.active) { this.fpLadle.visible = false; return; }
    const g = this.game;
    for (const p of this.pots) {
      if (!p.alive || !p.placed) continue;
      if (g.time - p.firedAt > 1.5) p.mesh.userData.turret.rotation.y += dt * 0.4; // idling turret looks around
      _v.set(p.pos.x, p.pos.y + POT_H + 1.6, p.pos.z);
      const s = camera.position.distanceTo(_v) < 120 ? hud._project(_v, camera) : null;
      if (!s) { p.label.style.display = 'none'; continue; }
      p.label.style.display = '';
      p.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const txt = `${p.name.replace('Team ', '')} pot${p.captures ? ` · turret ${1 + p.captures}` : ''}`;
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
    this._panel();
  }

  _panel() {
    if (!this.panel) return;
    const g = this.game, now = g.time;
    const rows = this.pots.map((p) => {
      const n = g.actors.filter((a) => a.team === p.team && a.alive).length;
      const state = !p.placed ? 'placing…' : p.alive ? '' : this.teamAlive(p.team) ? 'pot gone' : 'out';
      return `<li class="${this.teamAlive(p.team) ? '' : 'out'}${p.team === g.player?.team ? ' me' : ''}" style="--c:${p.color}"><i></i><b>${p.name.replace('Team ', '')}</b>`
        + (state ? `<em>${state}</em>` : `<span class="php"><i style="width:${(p.hp / p.maxHp * 100).toFixed(0)}%"></i></span>${p.captures ? `<small>Lv ${1 + p.captures}</small>` : ''}`)
        + `<small>${n}/3</small></li>`;
    }).join('');
    const head = this.setup ? `<p>Place your pot: press <kbd>G</kbd> · ${Math.ceil(this.setupUntil - now)} s</p>` : '';
    const html = head + `<ul>${rows}</ul>`;
    if (html !== this.panelHtml) { this.panelHtml = html; this.panel.innerHTML = html; }
  }

  // The top pill: the setup countdown, then the mode name.
  pill() { return this.setup ? `Pots ${Math.ceil(this.setupUntil - this.game.time)}` : 'Pot Wars'; }
}
