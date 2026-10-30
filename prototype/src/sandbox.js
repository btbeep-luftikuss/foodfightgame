// The Test World (0.55): a sandbox in a huge white box (map-test.js). Nobody fights you unless you ask.
// The Test panel (T, or the Test button) lets you:
//  - spawn where you look (10 m ahead): a test dummy that stands still, a dummy that walks side to side,
//    or a bot that fights back;
//  - build where you look: a wall (12 m wide, it faces you), a pillar, a box to climb, steps;
//  - give yourself any food (99, or never running out) and any utensil (the Legendary ones too);
//  - god mode (nothing hurts you); heal the dummies; clear everything you spawned.
// Dummies show the damage they take (the panel adds it up: damage in the last 5 s, and per second); a
// splatted dummy pops back up where it stood after 2 s. Up to 11 dummies and bots at once.
import * as THREE from 'three';
import { addBox, groundHeight, forwardOf, rand } from './core.js';
import { FOODS, FOOD_IDS } from './foods.js';
import { UTENSILS, UTENSIL_BY_ID } from './utensils.js';
import { BotBrain } from './bots.js';
import { randomSkinId } from './skins.js';

const DUMMY_COLORS = ['#f2f2f2', '#ffcf3a', '#6fc2ff', '#9be15d', '#ff6f91', '#c38bff'];
const _v = new THREE.Vector3();

// A dummy's "brain": stand still, or walk side to side (12 m each way), never throw.
class DummyBrain {
  constructor(a, game, walk = false) { this.a = a; this.game = game; this.walk = walk; this.dir = 1; this.home = a.pos.clone(); }
  intent() {
    const a = this.a, it = { moveX: 0, moveZ: 0, sprint: false, jump: false, dodge: false, primary: false, alt: false, ladle: false, slot: -1, cycle: 0 };
    if (this.walk) {
      const off = a.pos.x - this.home.x;
      if (off > 12) this.dir = -1; else if (off < -12) this.dir = 1;
      it.moveX = this.dir;
    }
    return it;
  }
}

export class Sandbox {
  constructor(game) {
    this.game = game; this.active = false;
    this.objects = []; // [{ mesh, colliders }]
    this.hits = []; // [time, damage] to dummies, for the meter
    this.god = false; this.endless = false;
    this.mats = null;
  }
  start() {
    const g = this.game, P = g.player;
    this.clear(); this.active = true; this.hits.length = 0;
    for (const a of g.actors) if (a !== P) { a.alive = false; a.hide(); a.respawnAt = 0; g.brains.delete(a); a.dummy = null; }
    if (P) {
      P.pos.set(0, groundHeight(0, 40, 0), 40); P.vel.set(0, 0, 0); P.gliding = false; P.onGround = true; P.yaw = 0;
      g.input.yaw = 0; g.input.pitch = -0.1; g.camPivotY = P.pos.y;
      P.inv = [null, null, null, null, null]; P.sel = 0;
      for (const id of ['tomato', 'carrot', 'blueberry', 'soda', 'ice']) this.giveFood(id, false);
      P.sel = 0;
    }
    g.state = 'play';
    g.hud.banner('Test World', `Press ${g.input.isTouch ? 'the Test button' : 'T'} for the test tools: dummies, walls, foods, utensils`, 3.5);
  }
  stop() { this.clear(); this.active = false; }

  // ---------------------------------------------------------------- what the panel does
  // a spot `d` metres ahead of you, on the ground, and which way is "ahead" (snapped to the walls' axes)
  ahead(d = 10) {
    const P = this.game.player, f = forwardOf(P.yaw, _v.clone());
    const x = P.pos.x + f.x * d, z = P.pos.z + f.z * d;
    return { x, z, y: groundHeight(x, z, P.pos.y + 3), alongX: Math.abs(f.z) >= Math.abs(f.x), f };
  }
  spawnDummy(kind = 'still') {
    const g = this.game, P = g.player;
    const a = g.botActors.find((b) => b !== P && !b.alive && !b.respawnAt);
    if (!a) { g.hud.toast('That\'s the most at once (11): clear some first'); return; }
    const s = this.ahead(10), n = g.botActors.filter((b) => b.dummy).length;
    a.reset(); a.isBot = true; a.team = null;
    a.applySkin(kind === 'bot' ? randomSkinId() : 'chef');
    a.name = kind === 'bot' ? `Bot ${n + 1}` : kind === 'walk' ? `Walker ${n + 1}` : `Dummy ${n + 1}`;
    a.color = kind === 'bot' ? '#ff7b54' : DUMMY_COLORS[n % DUMMY_COLORS.length];
    a.pos.set(s.x + rand(-1, 1), s.y + 0.2, s.z + rand(-1, 1)); a.onGround = true; a.yaw = P.yaw + Math.PI;
    a.dummy = { kind, home: a.pos.clone() };
    if (!g.actors.includes(a)) g.actors.push(a);
    if (kind === 'bot') { a.give('tomato', 30); a.give('blueberry', 120); g.brains.set(a, new BotBrain(a, g)); }
    else g.brains.set(a, new DummyBrain(a, g, kind === 'walk'));
    g.fx.burst('jump', a.pos, 1.2); g.sfx.play('pickup', a.pos, 0.6);
  }
  build(kind) {
    const g = this.game, s = this.ahead(kind === 'wall' ? 8 : 12);
    this.mats ||= {
      wall: new THREE.MeshStandardMaterial({ color: '#d9e6f7', roughness: 0.55 }),
      box: new THREE.MeshStandardMaterial({ color: '#ffe3a3', roughness: 0.55 }),
      pillar: new THREE.MeshStandardMaterial({ color: '#c9f0d8', roughness: 0.55 }),
      step: new THREE.MeshStandardMaterial({ color: '#f6c9d8', roughness: 0.55 }),
    };
    const parts = []; // [minX, maxX, minZ, maxZ, bottom, top, mat]
    const y = s.y;
    if (kind === 'wall') { // 12 m wide, 8 m high, 1.2 m thick, across your view
      const w = 6, t = 0.6;
      parts.push(s.alongX ? [s.x - w, s.x + w, s.z - t, s.z + t, y, y + 8, 'wall'] : [s.x - t, s.x + t, s.z - w, s.z + w, y, y + 8, 'wall']);
    } else if (kind === 'pillar') parts.push([s.x - 1.5, s.x + 1.5, s.z - 1.5, s.z + 1.5, y, y + 16, 'pillar']);
    else if (kind === 'box') parts.push([s.x - 3, s.x + 3, s.z - 3, s.z + 3, y, y + 3, 'box']);
    else if (kind === 'steps') { // four steps up, away from you
      for (let i = 0; i < 4; i++) {
        const c = 2 + i * 2.5;
        const cx = s.x - s.f.x * 10 + s.f.x * c, cz = s.z - s.f.z * 10 + s.f.z * c; // (starting a little closer)
        parts.push(s.alongX ? [cx - 4, cx + 4, cz - 1.25, cz + 1.25, y, y + 1 + i, 'step'] : [cx - 1.25, cx + 1.25, cz - 4, cz + 4, y, y + 1 + i, 'step']);
      }
    }
    const grp = new THREE.Group(), colliders = [];
    for (const [x0, x1, z0, z1, b, t, mat] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, t - b, z1 - z0), this.mats[mat]);
      mesh.position.set((x0 + x1) / 2, (b + t) / 2, (z0 + z1) / 2);
      mesh.castShadow = !!g.quality.dynamicShadows; mesh.receiveShadow = true;
      grp.add(mesh);
      colliders.push(addBox(x0, x1, z0, z1, b, t, { surface: 'plastic' }));
    }
    g.scene.add(grp);
    this.objects.push({ grp, colliders });
    g.world.shadowDirty = true;
    g.fx.burst('dust', _v.set(s.x, y + 0.3, s.z), 1.5); g.sfx.play('thud', _v, 0.8);
  }
  giveFood(id, toast = true) {
    const P = this.game.player;
    if (!P || !FOODS[id]) return;
    const slot = { id, count: 99, inf: this.endless };
    const have = P.inv.findIndex((s) => s?.id === id);
    const i = have >= 0 ? have : P.inv.findIndex((s) => !s) >= 0 ? P.inv.findIndex((s) => !s) : P.sel;
    P.inv[i] = slot; P.select(i); P._refreshHeld();
    if (toast) this.game.hud.toast(`${FOODS[id].name} ×${this.endless ? '∞' : 99}`);
  }
  giveUtensil(id) {
    const g = this.game, P = g.player;
    if (!P || !UTENSIL_BY_ID[id]) return;
    if (UTENSIL_BY_ID[id].legendary) { // (one Legendary at a time: this one takes the old one's place)
      const i = P.utensils?.findIndex((u) => UTENSIL_BY_ID[u]?.legendary) ?? -1;
      if (i >= 0) P.utensils[i] = null;
    }
    const old = g.utensils.give(P, id);
    if (old === false && P.utensils?.includes(id)) g.utensils.select(P, P.utensils.indexOf(id));
  }
  setEndless(on) { this.endless = on; for (const s of this.game.player?.inv || []) if (s) s.inf = on; }
  healDummies() { for (const a of this.game.actors) if (a.dummy && a.alive) { a.hp = a.maxHp; a.burnUntil = 0; a.frozenUntil = 0; a.sticky.length = 0; } }
  clear() {
    const g = this.game;
    for (const o of this.objects) { g.scene.remove(o.grp); for (const c of o.colliders) c.enabled = false; for (const m of o.grp.children) m.geometry.dispose(); }
    this.objects.length = 0;
    for (const a of g.botActors || []) if (a.dummy) { a.alive = false; a.hide(); a.respawnAt = 0; a.dummy = null; g.brains.delete(a); }
    g.actors = g.actors.filter((a) => a === g.player || a.alive || !a.isBot);
    if (g.world) g.world.shadowDirty = true;
  }

  // ---------------------------------------------------------------- the game's hooks
  onDamage(target, amount) { if (target.dummy) this.hits.push([this.game.time, amount]); }
  onKill(victim) { victim.respawnAt = this.game.time + 2; }
  update() {
    const g = this.game, now = g.time;
    for (const a of g.actors) {
      if (a.alive || !a.respawnAt || now < a.respawnAt) continue;
      if (a === g.player) { this.respawnPlayer(); continue; }
      if (!a.dummy) continue;
      const keep = { name: a.name, color: a.color, dummy: a.dummy };
      a.reset(); Object.assign(a, keep); a.isBot = true;
      a.pos.copy(a.dummy.home); a.onGround = true; a.respawnAt = 0;
      if (a.dummy.kind === 'bot') { a.give('tomato', 30); a.give('blueberry', 120); g.brains.set(a, new BotBrain(a, g)); }
      else g.brains.set(a, new DummyBrain(a, g, a.dummy.kind === 'walk'));
      g.fx.burst('jump', a.pos, 1);
    }
    while (this.hits.length && now - this.hits[0][0] > 5) this.hits.shift();
  }
  respawnPlayer() {
    const g = this.game, P = g.player, keep = { kills: P.kills, name: P.name };
    const kit = P.utensils ? [...P.utensils] : [];
    P.reset(); Object.assign(P, keep);
    P.pos.set(0, groundHeight(0, 40, 0), 40); P.onGround = true; P.respawnAt = 0;
    for (const id of ['tomato', 'carrot', 'blueberry', 'soda', 'ice']) this.giveFood(id, false);
    for (const id of kit) if (id) g.utensils.give(P, id);
    g.input.yaw = 0; g.camPivotY = P.pos.y;
    g.hud.banner('Back in!', 'Test World', 1.2);
  }
  // damage to dummies in the last 5 s (and per second)
  meter() { const d = this.hits.reduce((s, h) => s + h[1], 0); return { d: Math.round(d), dps: Math.round(d / 5) }; }
  // the panel's contents (main.js puts it on screen)
  static panelHtml(utensilIcon, foodIcon) {
    const b = (attrs, label, title = '') => `<button type="button" ${attrs}${title ? ` title="${title}"` : ''}>${label}</button>`;
    return `<div class="sb-col"><p class="sb-h">Spawn where you look</p><div class="sb-row">
      ${b('data-sb="dummy"', 'Test dummy', 'Stands still and takes hits')}${b('data-sb="walk"', 'Moving dummy', 'Walks side to side')}${b('data-sb="bot"', 'Fighting bot', 'A bot that fights back')}</div>
      <div class="sb-row">${b('data-sb="wall"', 'Wall')}${b('data-sb="pillar"', 'Pillar')}${b('data-sb="box"', 'Box')}${b('data-sb="steps"', 'Steps')}</div>
      <div class="sb-row">${b('data-sb="heal"', 'Heal dummies')}${b('data-sb="clear"', 'Clear all')}</div>
      <div class="sb-row sb-toggles"><label><input type="checkbox" data-sbt="god"> God mode</label><label><input type="checkbox" data-sbt="endless"> Endless food</label></div>
      <p class="sb-meter" id="sb-meter">Damage to dummies: 0 in the last 5 s</p></div>
      <div class="sb-col"><p class="sb-h">Foods</p><div class="sb-grid">${FOOD_IDS.map((id) => b(`data-food="${id}"`, `<img src="${foodIcon(id)}" alt=""><span>${FOODS[id].name}</span>`)).join('')}</div>
      <p class="sb-h">Utensils</p><div class="sb-grid">${UTENSILS.map((u) => b(`data-ut="${u.id}" class="${u.legendary ? 'legend' : ''}"`, `<img src="${utensilIcon(u.id)}" alt=""><span>${u.name.replace('Legendary ', '★ ')}</span>`, u.buff)).join('')}</div></div>`;
  }
}
