// Support utensils (0.15): twenty food buffers. You carry one utensil at a time; it changes how
// every food you throw behaves, but the food always stays the projectile, keeps its own effect,
// and gets one boost at one cost. Art and copy match docs/utensils.
//
// How it plugs in:
//  - Actor._release() wraps each throw in beginRelease()/endRelease() (costs, heat, recovery).
//  - Projectiles.launch() asks transform() to rewrite the launch (split into pieces, speed up,
//    flatten, ...). Rewritten launches carry `u` (utensil id) and `x` (small numbers) so online
//    players see the same projectile.
//  - Projectiles call pre()/post() around a food's own impact, and step()/end() every frame.
//  - Zones (whisk vortex, mortar cloud, fryer fire, candy web) and pickups live here.
import * as THREE from 'three';
import { G, groundHeight, rand, clamp, forwardOf } from './core.js';
import { FOODS, makeFoodMesh } from './foods.js';
import { UTENSIL_ART } from './utensil-art.js';

const SPLIT = ['tomato', 'carrot', 'ice', 'soda', 'chili', 'jelly'];            // foods that can be cut into pieces
const SINGLE = [...SPLIT, 'cookie', 'pineapple', 'banana'];                     // one food in flight per throw
const ALL = [...SINGLE, 'cheese', 'watermelon'];
const ROOT = { grape: 'grapes', berry: 'blueberry', melonchunk: 'watermelon' };
const FX_OF = { tomato: 'tomato', carrot: 'carrot', ice: 'ice', soda: 'soda', chili: 'fire', jelly: 'jelly', cookie: 'crumb', pineapple: 'pine', banana: 'banana', cheese: 'cheese', watermelon: 'melon', melonchunk: 'melon', grape: 'grape', berry: 'berry' };
const STAIN_OF = { tomato: 'tomato', carrot: 'carrot', soda: 'soda', chili: 'chili', jelly: 'jelly', cookie: 'soda', pineapple: 'banana', banana: 'banana', cheese: 'cheese', watermelon: 'melon', melonchunk: 'melon', grape: 'grape', berry: 'berry' };
const TINT = { tomato: '#e8321f', carrot: '#ff8a1c', ice: '#bfe9ff', soda: '#8a4a22', chili: '#ff3d00', jelly: '#5fd35a', cookie: '#c98a4c', pineapple: '#f2c230', banana: '#ffe14a', cheese: '#ffc93c', watermelon: '#f25a6a', melonchunk: '#f25a6a', grape: '#8e3fae', berry: '#4a52c8' };
// Mixer: which projectile's impact a second food adds
const MIX_IMPACT = { tomato: 'tomato', carrot: 'carrot', ice: 'ice', soda: 'soda', chili: 'chili', cookie: 'cookie', jelly: 'jelly', grapes: 'grape', blueberry: 'berry', watermelon: 'melonchunk' };

export const UTENSILS = [
  { id: 'knife', tip: '3 pieces per throw · uses 1 extra', name: 'Knife', role: 'Rapid-Fire Chopper', color: '#ff5a3c', works: SPLIT,
    buff: 'Chops your food into 3 quick bite-size pieces; back-to-back hits stack its effect.', trade: 'Uses 1 extra food per throw, and each piece hits softer.' },
  { id: 'ice-cream-machine', tip: 'Freezes on hit · leaves an ice patch', name: 'Ice Cream Machine', role: 'Cryo Converter', color: '#7fe3cf', works: SINGLE,
    buff: 'Coats your food in soft-serve: it freezes whoever it hits and leaves an ice patch.', trade: 'Takes half a second to churn, and the frozen shot flies slowly.' },
  { id: 'spoon', tip: '5-pellet cone · short range', name: 'Spoon', role: 'Shotgun Burst', color: '#8f9cff', works: SPLIT,
    buff: 'Flings a heaped scoop as a tight cone of 5 pellets.', trade: 'Uses 1 extra food, and the pellets only fly a short way.' },
  { id: 'blow-torch', tip: 'Hold the throw 3 s to ignite', name: 'Blow Torch', role: 'Incendiary Charge', color: '#ff8a2a', works: SINGLE,
    buff: 'Hold the throw for 3 s to set your food ablaze: harder hit plus 3 s of burning.', trade: 'You move at half speed while charging, and the torched food burns up 1 extra.' },
  { id: 'whisk', tip: 'Vortex where it lands', name: 'Whisk', role: 'Vortex Spinner', color: '#b98cff', works: SINGLE,
    buff: 'Whips your food into a vortex where it lands that pulls enemies in and keeps hitting.', trade: 'The throw flies slower and the vortex fades after 3 s.' },
  { id: 'blender', tip: '7-droplet stream · slows you', name: 'Blender', role: 'Particle Stream', color: '#ff6a78', works: SPLIT,
    buff: 'Purees your food into a stream of 7 droplets that slick the floor.', trade: 'You slow down while spraying, and it uses 1 extra food.' },
  { id: 'rolling-pin', tip: 'Ricochets off 2 walls', name: 'Rolling Pin', role: 'Kinetic Disc Ricochet', color: '#d9a464', works: SPLIT.concat('cookie'),
    buff: 'Flattens your food into a fast disc that ricochets off 2 walls and knocks back.', trade: 'Hits a bit softer, and after a bounce the disc can hit you too.' },
  { id: 'microwave', tip: 'Hold 1–2 s, let go before 2.4 s', name: 'Microwave', role: 'Charged Plasma', color: '#ffc23a', works: SINGLE,
    buff: 'Hold the throw 1 to 2 s to charge a glowing orb that explodes on impact.', trade: 'Hold it past 2.4 s and it overcharges and pops on you.' },
  { id: 'grater', tip: '8 shreds · short range', name: 'Grater', role: 'Flechette Cloud', color: '#ff9d3a', works: SPLIT,
    buff: 'Shreds your food into a fast, dense cloud of 8 shreds.', trade: 'Shreds fall apart after a few metres, and it uses 1 extra food.' },
  { id: 'spatula', tip: 'Every hit crits · banks off a wall', name: 'Spatula', role: 'Ricochet Crit', color: '#3fd0bf', works: SINGLE.filter((f) => f !== 'banana'),
    buff: 'Every hit is a critical hit (x1.75), and the shot banks off one wall.', trade: 'A smaller hitbox and a slower throw: you have to aim it.' },
  { id: 'deep-fryer', tip: 'Sets targets on fire', name: 'Deep Fryer', role: 'Napalm Coater', color: '#ffb12a', works: SINGLE,
    buff: 'Coats your food in hot oil: it sets targets on fire and leaves a burning slick.', trade: 'The slick is slippery for you too, and 4 quick fries overheat it for 5 s.' },
  { id: 'mortar-and-pestle', tip: 'Lands right on your aim point', name: 'Mortar & Pestle', role: 'Powder Mortar', color: '#9fc4e6', works: SINGLE,
    buff: 'Lobs your food high and far; it bursts into a lingering cloud of its effect.', trade: 'The shell is slow to land, and the wind blows the cloud away.' },
  { id: 'toaster', tip: 'Bounces twice', name: 'Toaster', role: 'Scorched Bounce', color: '#ff7a3a', works: SINGLE.filter((f) => f !== 'banana' && f !== 'pineapple'),
    buff: 'Toasts your food crispy: it bounces twice, splashing and scorching each time.', trade: 'Each hit is softer, and it stops after 2 bounces.' },
  { id: 'colander', tip: 'Pierces 3 Titans · recoil', name: 'Colander', role: 'Piercing Stream', color: '#ff5f6d', works: SINGLE.filter((f) => f !== 'banana' && f !== 'pineapple'),
    buff: 'Strains your food into a needle-fast shot that pierces up to 3 Titans.', trade: 'The recoil shoves and slows you, and the thin shot needs precise aim.' },
  { id: 'cotton-candy-machine', tip: 'Sticky web where it lands', name: 'Cotton Candy Machine', role: 'Sticky Web', color: '#ff8fc8', works: SINGLE,
    buff: 'Spins a sticky web where your food lands that slows and traps enemies; direct hits root.', trade: 'The web takes a moment to set, and fire or water destroys it.' },
  { id: 'popcorn-popper', tip: 'Pops into 5 pieces mid-air', name: 'Popcorn Popper', role: 'Cluster Burst', color: '#ffd23a', works: SPLIT,
    buff: 'Your food pops mid-flight into 5 exploding pieces.', trade: 'The fuse is short and the pieces scatter in random directions.' },
  { id: 'peeler', tip: 'Hit the same Titan again and again', name: 'Peeler', role: 'Layered Multi-Stage', color: '#9a6ef0', works: SINGLE,
    buff: 'Each hit on the same Titan peels a layer: x0.7, x1.15, x1.6, then x2.1 damage.', trade: 'Weak first hits, and after the last layer it needs 5 s to reset.' },
  { id: 'mixer', tip: 'Blends in a second food', name: 'Mixer', role: 'Hybrid Combiner', color: '#3fc9a8', works: ALL.filter((f) => f !== 'pineapple'),
    buff: 'Blends a second food from your hotbar into the throw: it lands with both effects.', trade: 'Uses 1 of the second food too, and takes longer to prep.' },
  { id: 'oven-mitt', tip: 'Power throw ready', name: 'Oven Mitt', role: 'Power Throw', color: '#ff6f6f', works: SINGLE,
    buff: 'Hurls your food 70% faster and further, straight through cheese shields.', trade: 'Only every 3.5 s, and 3 quick throws overheat it for 6 s.' },
  { id: 'pan', tip: 'Q: slam to fire the alt', name: 'Pan', role: 'Alt-Ability Activator', color: '#a49bc4', works: [],
    buff: "Your food's alt ability (Q) ignores its cooldown and slams a shockwave around you.", trade: 'The Pan has its own 7 s cooldown, and the slam roots you for a moment.' },
];
export const UTENSIL_BY_ID = Object.fromEntries(UTENSILS.map((u) => [u.id, u]));
export const UTENSIL_IDS = UTENSILS.map((u) => u.id);
export const randomUtensilId = () => UTENSIL_IDS[(Math.random() * UTENSIL_IDS.length) | 0];

// The art as an <img>-ready data URL (HUD, menus) and as a texture (pickups, held badges).
const urlCache = {};
export function utensilIcon(id) {
  return (urlCache[id] ||= `data:image/svg+xml;charset=utf-8,${encodeURIComponent(UTENSIL_ART[id] || '')}`);
}
const texCache = {};
function utensilTexture(id) {
  if (texCache[id]) return texCache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 256, 256); tex.needsUpdate = true; };
  img.src = utensilIcon(id);
  return (texCache[id] = tex);
}
const spriteMats = {};
const spriteMat = (id) => (spriteMats[id] ||= new THREE.SpriteMaterial({ map: utensilTexture(id), transparent: true, depthWrite: false }));

// ---------------------------------------------------------------------------- shared visuals
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const TORUS = new THREE.TorusGeometry(1, 0.32, 8, 22);
const ICO = new THREE.IcosahedronGeometry(1, 1);
const MAT = {
  cream: new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.45, emissive: '#d8f3ff', emissiveIntensity: 0.25 }),
  plasma: new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  flame: new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  oil: new THREE.MeshStandardMaterial({ color: '#ffc23a', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false }),
  shield: new THREE.MeshBasicMaterial({ color: '#9fe8ff', transparent: true, opacity: 0.22, depthWrite: false }),
  hex: new THREE.MeshBasicMaterial({ color: '#6fd8f0', wireframe: true, transparent: true, opacity: 0.6 }),
  vortex: new THREE.MeshBasicMaterial({ color: '#b98cff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
};
const col = (hex) => new THREE.Color(hex);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();

function webTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  x.strokeStyle = 'rgba(214,240,255,0.95)'; x.lineWidth = 5; x.lineCap = 'round';
  x.shadowColor = 'rgba(159,214,255,0.9)'; x.shadowBlur = 8;
  const spokes = 10;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 124, Math.sin(a) * 124); x.stroke();
  }
  for (const r of [30, 58, 86, 114]) {
    x.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2, a0 = ((i - 0.5) / spokes) * Math.PI * 2;
      if (!i) x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else x.quadraticCurveTo(Math.cos(a0) * r * 0.82, Math.sin(a0) * r * 0.82, Math.cos(a) * r, Math.sin(a) * r);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let WEB_MAT = null;

// ---------------------------------------------------------------------------- per-utensil rules
const clone = (o) => ({ ...o, pos: o.pos.clone(), vel: o.vel.clone() });
const radiusOf = (o) => o.radius ?? FOODS[o.food]?.radius ?? 0.35;
function jitter(v, s) {
  const L = v.length();
  v.x += rand(-s, s) * L; v.y += rand(-s, s) * L * 0.6; v.z += rand(-s, s) * L;
  return v.setLength(L);
}

// Each rule may define:
//  charge(a, food, U): { need, auto, over, slow } extra hold time for the throw
//  launch(o, a, rel): array of launch options (with `delay` for later pieces) or null for a plain throw
//  cost: extra food used per boosted throw; rec: recovery multiplier
//  pre(p, hit, U): runs before the food's impact; return true to skip the food's own impact
//  post(p, hit, U): runs after; step(p, dt, U): every frame in flight
const RULES = {
  knife: {
    cost: 1, rec: 0.8,
    launch: (o, a) => [0, 1, 2].map((i) => ({ ...clone(o), radius: radiusOf(o) * 0.75, x: { m: 0.45, sc: 0.62 }, delay: i * 0.07 })),
  },
  'ice-cream-machine': {
    charge: () => ({ need: 0.5, auto: true }),
    launch: (o) => [{ ...clone(o), vel: o.vel.clone().multiplyScalar(0.72), gravity: (o.gravity ?? 1) * 0.85, x: {} }],
    post(p, hit, U) {
      if (hit.actor?.alive) hit.actor.applyHardCC('frozen', 0.8);
      U.stampGround(hit.point, 3.5, 'ice', 5, { visual: 'ice', owner: p.owner });
      U.game.fx.burst('ice', hit.point, 1.2);
      U.game.sfx.play('freeze', hit.point, 0.6);
    },
  },
  spoon: {
    cost: 1,
    launch: (o) => Array.from({ length: 5 }, () => ({ ...clone(o), vel: jitter(o.vel.clone().multiplyScalar(1.05), 0.11), radius: radiusOf(o) * 0.7, life: 0.75, x: { m: 0.4, sc: 0.55 } })),
  },
  'blow-torch': {
    charge: () => ({ need: 3, auto: false, slow: 0.5 }),
    launch: (o, a, rel) => (rel.t >= 3 ? [{ ...clone(o), x: { m: 1.3 } }] : null),
    cost: 1,
    post(p, hit, U) {
      const g = U.game;
      if (hit.actor) hit.actor.burn(3);
      g.fx.burst('fire', hit.point, 1.4);
      if (!hit.actor) g.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 1.6, 'chili');
      g.sfx.play('sizzle', hit.point, 1.1);
    },
  },
  whisk: {
    launch: (o) => [{ ...clone(o), vel: o.vel.clone().multiplyScalar(0.78), x: {} }],
    post(p, hit, U) { U.once(p, 'vortex', () => U.addZone('vortex', hit.point, p, 3, 5.5)); },
  },
  blender: {
    cost: 1,
    launch: (o) => Array.from({ length: 7 }, (_, i) => ({ ...clone(o), vel: jitter(o.vel.clone().multiplyScalar(1.15), 0.025), gravity: (o.gravity ?? 1) * 0.7, radius: radiusOf(o) * 0.6, x: { m: 0.25, sc: 0.45 }, delay: i * 0.055 })),
    released(a, U) { a.surfaceSlow = 0.4; a.surfaceSlowUntil = U.game.time + 0.8; },
    post(p, hit, U) { if (hit.world && hit.top) U.stampGround(hit.point, 1.6, 'slick', 3); },
  },
  'rolling-pin': {
    launch: (o) => [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.35), gravity: (o.gravity ?? 1) * 0.45, spin: 0, x: { m: 0.75, sc: [1.5, 0.38, 1.5], wb: 2, fl: 1 } }],
    post(p, hit, U) {
      if (hit.actor) hit.actor.knock(_v.copy(p.vel).setY(0).normalize().multiplyScalar(8).setY(3));
    },
  },
  microwave: {
    charge: () => ({ need: 1, auto: false, over: 2.4 }),
    launch: (o, a, rel) => (rel.t >= 1 ? [{ ...clone(o), x: { m: 1.1 } }] : null),
    post(p, hit, U) {
      const g = U.game;
      g.explode(hit.point, 3.5, 22, p.owner, ROOT[p.food] || p.food, 9);
      g.fx.burst('fire', hit.point, 1.1);
      g.fx.spray('puffs', hit.point, 10, { speed: 4, up: 3, colors: [col('#fff3a8'), col('#ffd23a')], size: 0.9, life: 0.5, grav: 0, grow: 1.6 });
      g.sfx.play('boom', hit.point, 0.8);
    },
  },
  grater: {
    cost: 1,
    launch: (o) => Array.from({ length: 8 }, () => ({ ...clone(o), vel: jitter(o.vel.clone().multiplyScalar(1.5), 0.17), gravity: (o.gravity ?? 1) * 0.4, radius: radiusOf(o) * 0.6, life: 0.34, x: { m: 0.27, sc: 0.38 } })),
  },
  spatula: {
    rec: 1.3,
    launch: (o) => [{ ...clone(o), radius: radiusOf(o) * 0.6, x: { m: 1, wb: 1 } }],
    pre(p, hit, U) {
      if (!hit.actor) return false;
      U.game.dmgScale *= 1.75;
      U.game.floatText(hit.actor, 'CRIT!', 'crit');
      return false;
    },
  },
  'deep-fryer': {
    launch: (o, a) => (a.game.time < a.uState.overUntil ? null : [{ ...clone(o), x: {} }]),
    heat: { per: 1, max: 4, decay: 2.5, lock: 5 },
    post(p, hit, U) {
      if (hit.actor) { hit.actor.burn(2); return; }
      U.once(p, 'fire', () => {
        if (U.stampGround(hit.point, 3, 'slick', 6) === false) return;
        U.addZone('fire', hit.point, p, 6, 2.8);
        U.game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 2.6, 'cheese');
      });
    },
  },
  'mortar-and-pestle': {
    // a high shell that comes down right on the aim point
    launch(o, a) {
      const grav = (o.gravity || 1) * 0.75, g = G * grav;
      const tgt = a.aimPoint;
      const dx = tgt.x - o.pos.x, dz = tgt.z - o.pos.z, dy = tgt.y - o.pos.y;
      const D = Math.min(70, Math.hypot(dx, dz));
      const T = clamp(0.9 + D / 22, 1, 2.6);
      const k = D / Math.max(1e-3, Math.hypot(dx, dz));
      const v = new THREE.Vector3((dx * k) / T, (dy + 0.5 * g * T * T) / T, (dz * k) / T);
      return [{ ...clone(o), vel: v, gravity: grav, x: {} }];
    },
    post(p, hit, U) { U.once(p, 'cloud', () => U.addZone('cloud', hit.point, p, 4, 3.5)); },
  },
  toaster: {
    launch: (o) => [{ ...clone(o), x: { m: 0.85, fb: 2 } }],
    pre(p, hit, U) {
      if (!(hit.world && hit.top && p.x.fb > 0)) return false;
      const g = U.game, pt = hit.point;
      p.x.fb--;
      g.splash(pt, 2.4, 12, p.owner, ROOT[p.food] || p.food, {});
      g.world.paintSplat(pt.x, pt.y, pt.z, 1.4, 'soda');
      g.fx.burst('ember', pt, 1); g.fx.burst('dust', pt, 0.6);
      g.sfx.play('sizzle', pt, 0.6);
      p.pos.y = pt.y + p.radius + 0.05;
      p.vel.y = Math.abs(p.vel.y) * 0.55 + 5;
      p.x.m *= 0.85;
      return true; // keeps flying
    },
  },
  colander: {
    launch(o) {
      const v = o.vel.clone();
      if (v.length() < 70) v.multiplyScalar(1.9);
      return [{ ...clone(o), vel: v, gravity: (o.gravity ?? 1) * 0.25, radius: radiusOf(o) * 0.5, x: { m: 0.9, pc: 3 } }];
    },
    released(a, U) {
      const back = _w.copy(a.aimDir).setY(0);
      if (back.lengthSq() < 1e-4) forwardOf(a.yaw, back);
      back.normalize().multiplyScalar(-5);
      a.knock(back.setY(0.5));
      a.surfaceSlow = 0.35; a.surfaceSlowUntil = U.game.time + 0.6;
    },
  },
  'cotton-candy-machine': {
    launch: (o) => [{ ...clone(o), x: {} }],
    post(p, hit, U) {
      if (hit.actor?.alive) hit.actor.applyHardCC('rooted', 0.8);
      U.once(p, 'web', () => U.addZone('web', hit.point, p, 5.5, 3.2));
    },
  },
  'popcorn-popper': {
    launch: (o) => [{ ...clone(o), x: { pa: rand(0.4, 0.6) } }],
    step(p, dt, U) {
      if (!p.x.pa || p.life < p.x.pa) return;
      U.pop(p);
    },
    post(p, hit, U) {
      if (!p.x.pi) return;
      U.game.explode(hit.point, 1.8, 6, p.owner, ROOT[p.food] || p.food, 4);
      U.game.fx.burst('fire', hit.point, 0.4);
    },
  },
  peeler: {
    launch: (o) => [{ ...clone(o), x: {} }],
    pre(p, hit, U) {
      if (!hit.actor) return false;
      const g = U.game, a = p.owner, s = a.uState, t = g.time;
      const pl = s.peel;
      if (t < pl.cdUntil) { g.dmgScale *= 0.7; return false; }
      if (pl.target !== hit.actor || t > pl.until) { pl.target = hit.actor; pl.layer = 0; }
      else pl.layer++;
      pl.until = t + 6;
      const mul = [0.7, 1.15, 1.6, 2.1][pl.layer];
      g.dmgScale *= mul;
      if (pl.layer > 0) g.floatText(hit.actor, pl.layer === 3 ? 'PEELED!' : `LAYER ${pl.layer + 1}`, 'crit');
      if (pl.layer >= 3) { pl.cdUntil = t + 5; pl.target = null; pl.layer = 0; }
      return false;
    },
  },
  mixer: {
    charge: (a, food, U) => (U.mixSlot(a) >= 0 ? { need: 0.7, auto: true } : null),
    launch: (o, a, rel) => (rel.mx ? [{ ...clone(o), x: { mx: rel.mx } }] : null),
    post(p, hit, U) {
      const mx = p.x.mx;
      if (!mx || !FOODS[mx]?.impact) return;
      U.once(p, 'mix', () => {
        if (mx === 'carrot' && !hit.actor) { U.game.fx.burst('carrot', hit.point); return; } // carrots stick in walls: skip the decor
        const q = { ...p, food: mx, hitSet: new Set(), x: {}, u: '', charge: 1, bounces: 0, phase: 'out', mesh: p.mesh };
        FOODS[mx].impact(q, { ...hit, point: hit.point.clone() }, U.game);
      });
    },
  },
  'oven-mitt': {
    launch(o, a) {
      const s = a.uState, t = a.game.time;
      if (t < s.overUntil || t < s.cdUntil) return null;
      return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.7), gravity: (o.gravity ?? 1) * 0.55, x: { m: 1.1 } }];
    },
    heat: { per: 1, max: 3, decay: 7, lock: 6, cd: 3.5 },
  },
  pan: {},
};

// ---------------------------------------------------------------------------- the manager
const PICKUP_SPOTS = 8, RESPAWN = 25;

export class Utensils {
  constructor(game) {
    this.game = game;
    this.pickups = []; this.zones = []; this.pending = []; this.spots = [];
    this.badges = new Map(); // actor -> sprite showing the utensil they carry
    this.attachPool = {};
  }

  // ------------------------------------------------------------------ actors
  static freshState() { return { heat: 0, overUntil: 0, cdUntil: 0, peel: { target: null, layer: 0, until: 0, cdUntil: 0 } }; }

  give(a, id) {
    a.utensil = UTENSIL_BY_ID[id] ? id : null;
    a.uState = Utensils.freshState();
    if (a === this.game.player && a.utensil) {
      const u = UTENSIL_BY_ID[id];
      this.game.hud.toast(`${u.name}: ${u.role}`);
    }
  }

  works(a, foodId) {
    const u = a.utensil && UTENSIL_BY_ID[a.utensil];
    return !!u && u.works.includes(foodId);
  }

  // What the HUD says under the utensil name.
  status(a) {
    const u = a.utensil && UTENSIL_BY_ID[a.utensil];
    if (!u) return '';
    const t = this.game.time, s = a.uState, slot = a.selected();
    if (t < s.overUntil) return `Overheated: ${Math.ceil(s.overUntil - t)} s`;
    if (u.id === 'pan') return t < s.cdUntil ? `Slam ready in ${Math.ceil(s.cdUntil - t)} s` : 'Slam ready: press Q';
    if (!slot) return u.role;
    if (!u.works.includes(slot.id)) return `No effect on ${FOODS[slot.id].name}`;
    if (u.id === 'oven-mitt' && t < s.cdUntil) return `Power throw in ${Math.ceil(s.cdUntil - t)} s`;
    if (u.id === 'peeler' && t < s.peel.cdUntil) return `Re-peel in ${Math.ceil(s.peel.cdUntil - t)} s`;
    if (u.id === 'mixer') { const i = this.mixSlot(a); return i < 0 ? 'Carry a second food to mix' : `Mixing in ${FOODS[a.inv[i].id].name}`; }
    if (RULES[u.id].heat) return `${u.tip} · heat ${'●'.repeat(Math.round(s.heat))}${'○'.repeat(Math.max(0, RULES[u.id].heat.max - Math.round(s.heat)))}`;
    const c = this.chargeRule(a, FOODS[slot.id]);
    if (c && a.charging) {
      if (c.over && a.chargeT > c.need) return a.chargeT > c.over - 0.5 ? 'Let go! About to pop' : 'Charged: let go';
      return a.chargeT >= c.need ? 'Charged: let go' : `Charging ${a.chargeT.toFixed(1)} / ${c.need} s`;
    }
    return u.tip || u.role;
  }

  // Extra hold time the utensil asks for (null: none).
  chargeRule(a, food) {
    const id = a.utensil;
    if (!id || !food || food.auto) return null;
    const slot = a.selected();
    if (!slot || !UTENSIL_BY_ID[id].works.includes(slot.id)) return null;
    const r = RULES[id].charge;
    return r ? r(a, food, this) : null;
  }

  // Called every frame while the throw is held.
  whileCharging(a, food, c) {
    if (!c?.over || a.chargeT < c.over) return false;
    const g = this.game; // overcharged: it pops in your hand
    g.damage(a, 20, a, ROOT[a.selected()?.id] || a.selected()?.id || 'soda');
    a.knock(_v.set(rand(-3, 3), 6, rand(-3, 3)));
    g.fx.burst('fire', a.handPos(_c), 1.2);
    g.fx.spray('puffs', _c, 10, { speed: 4, up: 3, colors: [col('#fff3a8'), col('#ffd23a')], size: 0.8, life: 0.5, grav: 0, grow: 1.6 });
    g.sfx.play('boom', a.pos, 0.7);
    g.floatText(a, 'OVERCHARGED!', 'slip');
    a.consume(1);
    a.charging = false; a.chargeT = 0;
    a.recoverUntil = g.time + 0.8;
    return true;
  }

  // How long a bot should hold the throw so its utensil does something.
  botHold(a, food) {
    const c = this.chargeRule(a, food);
    if (!c) return 0;
    return c.over ? c.need + 0.4 : c.need + 0.15;
  }

  mixSlot(a) {
    const sel = a.selected();
    if (!sel) return -1;
    for (let i = 0; i < a.inv.length; i++) {
      const s = a.inv[i];
      if (i !== a.sel && s && s.id !== sel.id && MIX_IMPACT[s.id] && (s.inf || s.count > 0)) return i;
    }
    return -1;
  }

  beginRelease(a, food, chargeT) {
    const slot = a.selected();
    const rel = { t: chargeT, used: false, mx: null, mxSlot: -1, food: slot?.id };
    if (a.utensil === 'mixer') { const i = this.mixSlot(a); if (i >= 0) { rel.mxSlot = i; rel.mx = MIX_IMPACT[a.inv[i].id]; } }
    a.uRel = rel;
  }

  // Returns the recovery multiplier for this throw.
  endRelease(a) {
    const rel = a.uRel;
    a.uRel = null;
    if (!rel || !rel.used) return 1;
    const R = RULES[a.utensil], s = a.uState, t = this.game.time;
    if (R.cost) a.consume(R.cost);
    if (R.released) R.released(a, this);
    if (rel.mxSlot >= 0) {
      const m = a.inv[rel.mxSlot];
      if (m && !m.inf) { m.count--; if (m.count <= 0) a.inv[rel.mxSlot] = null; }
    }
    if (R.heat) {
      s.heat = Math.min(R.heat.max, s.heat + R.heat.per);
      if (R.heat.cd) s.cdUntil = t + R.heat.cd;
      if (s.heat >= R.heat.max) {
        s.overUntil = t + R.heat.lock; s.heat = 0;
        if (a === this.game.player) this.game.hud.toast(`${UTENSIL_BY_ID[a.utensil].name} overheated!`);
        this.game.fx.burst('steam', a.center(_c));
        this.game.sfx.play('sizzle', a.pos, 0.8);
      }
    }
    return R.rec || 1;
  }

  // Projectiles.launch hands every new throw here first.
  transform(o) {
    const a = o.owner;
    if (!a || !a.utensil || !a.uRel || o.remote || o.local) return null;
    if (!UTENSIL_BY_ID[a.utensil].works.includes(o.food)) return null;
    const R = RULES[a.utensil];
    if (!R.launch) return null;
    const list = R.launch(o, a, a.uRel);
    if (!list) return null;
    a.uRel.used = true;
    for (const q of list) q.u = a.utensil;
    return list;
  }

  // Remote throws: only accept what we would send.
  sanitize(u, x) {
    if (!UTENSIL_BY_ID[u] || !x || typeof x !== 'object') return null;
    const n = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : undefined);
    const out = {};
    if (x.m !== undefined) out.m = n(x.m, 0.1, 3);
    if (Array.isArray(x.sc)) out.sc = x.sc.slice(0, 3).map((v) => n(v, 0.2, 2) ?? 1);
    else if (x.sc !== undefined) out.sc = n(x.sc, 0.2, 2);
    for (const k of ['wb', 'fb', 'pc']) if (x[k] !== undefined) out[k] = n(x[k], 0, 5) | 0;
    if (x.pa !== undefined) out.pa = n(x.pa, 0, 2);
    if (x.fl) out.fl = 1;
    if (x.pi) out.pi = 1;
    if (typeof x.mx === 'string' && Object.values(MIX_IMPACT).includes(x.mx)) out.mx = x.mx;
    return out;
  }

  // ------------------------------------------------------------------ projectile hooks
  onLaunch(p) {
    if (!p.u) return;
    const x = p.x;
    if (Array.isArray(x.sc)) p.mesh.scale.set(x.sc[0], x.sc[1], x.sc[2]);
    else if (x.sc) p.mesh.scale.setScalar(x.sc);
    p.uAttach = [];
    const r = p.radius;
    const add = (kind, geo, mat, s) => {
      const pool = (this.attachPool[kind] ||= []);
      let m = pool.pop();
      if (!m) { m = new THREE.Mesh(geo, mat); m.castShadow = false; m.userData.kind = kind; this.game.scene.add(m); }
      m.visible = true; m.scale.setScalar(s); m.userData.base = s;
      m.position.copy(p.pos);
      p.uAttach.push(m);
      return m;
    };
    switch (p.u) {
      case 'ice-cream-machine': add('cream', TORUS, MAT.cream, Math.max(0.3, r * 1.25)); break;
      case 'blow-torch': add('flame', SPHERE, MAT.flame, Math.max(0.35, r * 1.9)); break;
      case 'microwave': add('plasma', SPHERE, MAT.plasma, Math.max(0.4, r * 2.2)); break;
      case 'deep-fryer': add('oil', SPHERE, MAT.oil, Math.max(0.28, r * 1.3)); break;
      case 'oven-mitt': add('shield', SPHERE, MAT.shield, Math.max(0.45, r * 2)); add('hex', ICO, MAT.hex, Math.max(0.46, r * 2.02)); break;
      case 'mixer': if (x.mx) {
        const id = ROOT[x.mx] || x.mx;
        const pool = (this.attachPool['mix:' + id] ||= []);
        let m = pool.pop();
        if (!m) { m = makeFoodMesh(id); m.userData.kind = 'mix:' + id; this.game.scene.add(m); }
        m.visible = true; m.scale.setScalar(0.55); m.userData.base = 0.55;
        p.uAttach.push(m);
      } break;
    }
  }

  step(p, dt) {
    if (!p.u) return;
    const R = RULES[p.u], g = this.game, t = g.time;
    if (R.step) { R.step(p, dt, this); if (p.done) return; }
    if (p.x.fl) { p.mesh.rotation.set(0, p.mesh.rotation.y + 14 * dt, 0); } // flat disc spins like a frisbee
    for (let i = 0; i < p.uAttach.length; i++) {
      const m = p.uAttach[i], k = m.userData.kind;
      m.position.copy(p.pos);
      if (k === 'cream') { m.rotation.x += 6 * dt; m.rotation.y += 4 * dt; }
      else if (k === 'plasma' || k === 'flame') m.scale.setScalar(m.userData.base * (1 + Math.sin(t * 30 + i) * 0.12));
      else if (k === 'hex') { m.rotation.y += 2 * dt; m.rotation.x += 1.3 * dt; }
      else if (k.startsWith('mix:')) {
        const a = t * 9;
        m.position.x += Math.cos(a) * 0.45; m.position.z += Math.sin(a) * 0.45; m.position.y += 0.15;
        m.rotation.y += 5 * dt;
      }
    }
    // trails
    p.uTrail = (p.uTrail || 0) - dt;
    if (p.uTrail > 0 || g.fx.scale <= 0) return;
    p.uTrail = 0.045;
    const P = g.fx;
    switch (p.u) {
      case 'blow-torch': case 'toaster': P.spray('blobs', p.pos, 2, { speed: 1, up: 1, colors: [col('#ff3d00'), col('#ffae00')], size: 0.1, life: 0.35, grav: -0.3 }); break;
      case 'ice-cream-machine': P.spray('puffs', p.pos, 1, { speed: 0.4, up: 0.2, colors: [col('#ffffff'), col('#dff6ff')], size: 0.3, life: 0.4, grav: 0.2, grow: 0.5 }); break;
      case 'microwave': P.spray('blobs', p.pos, 2, { speed: 2, up: 1, colors: [col('#fff6a8'), col('#ffd23a')], size: 0.08, life: 0.3, grav: 0 }); break;
      case 'deep-fryer': P.spray('blobs', p.pos, 1, { speed: 0.5, up: 0, colors: [col('#ffc23a')], size: 0.09, life: 0.5, grav: 1 }); break;
      case 'oven-mitt': P.spray('puffs', p.pos, 1, { speed: 0.3, up: 0.3, colors: [col('#ffffff')], size: 0.35, life: 0.3, grav: -0.2, grow: 0.8 }); break;
      case 'whisk': P.spray('puffs', p.pos, 1, { speed: 1.2, up: 0.4, colors: [col('#b98cff')], size: 0.25, life: 0.35, grav: 0, grow: 0.6 }); break;
      case 'cotton-candy-machine': P.spray('puffs', p.pos, 1, { speed: 0.4, up: 0.2, colors: [col('#ff8fc8'), col('#9fd6ff')], size: 0.3, life: 0.45, grav: 0, grow: 0.6 }); break;
      case 'mortar-and-pestle': P.spray('puffs', p.pos, 1, { speed: 0.4, up: 0.2, colors: [col(TINT[p.food] || '#ffffff')], size: 0.3, life: 0.5, grav: 0, grow: 0.8 }); break;
      case 'spatula': if (Math.random() < 0.5) P.spray('blobs', p.pos, 1, { speed: 1, up: 1, colors: [col('#fff6a8')], size: 0.07, life: 0.3, grav: 0 }); break;
      case 'colander': P.spray('blobs', p.pos, 1, { speed: 0.3, up: 0, colors: [col(TINT[p.food] || '#ffffff')], size: 0.07, life: 0.25, grav: 0 }); break;
      case 'popcorn-popper': if (!p.x.pi) P.spray('blobs', p.pos, 1, { speed: 1.5, up: 1.5, colors: [col('#fff3c0')], size: 0.08, life: 0.3, grav: 0.5 }); break;
    }
  }

  end(p) {
    if (!p.uAttach) return;
    for (const m of p.uAttach) { m.visible = false; (this.attachPool[m.userData.kind] ||= []).push(m); }
    p.uAttach = null;
  }

  // Pieces that run out of time burst in the air instead of just vanishing.
  expire(p) {
    if (!p.u || !p.x.sc) return;
    this.game.fx.burst(FX_OF[p.food] || 'dust', p.pos, 0.35);
  }

  pre(p, hit) {
    const R = RULES[p.u];
    return R?.pre ? R.pre(p, hit, this) : false;
  }
  post(p, hit) {
    const R = RULES[p.u];
    if (R?.post) R.post(p, hit, this);
  }
  bounced(p) { // wall ricochet (Rolling Pin, Spatula)
    const g = this.game;
    g.sfx.play('boing', p.pos, 0.5);
    g.fx.spray('blobs', p.pos, 6, { speed: 4, up: 2, colors: [col('#fff6a8'), col('#ffd23a')], size: 0.08, life: 0.3, grav: 0 });
    if (p.x.fl) { p.selfOk = true; p.selfAfter = p.life + 0.12; } // a ricocheting disc can come back at you
  }

  once(p, key, fn) {
    p.uOnce ||= {};
    if (p.uOnce[key]) return;
    p.uOnce[key] = true;
    fn();
  }

  pop(p) { // Popcorn: the food bursts mid-air into 5 exploding pieces
    const g = this.game;
    p.done = true;
    g.explode(p.pos, 2, 8, p.owner, ROOT[p.food] || p.food, 5);
    g.fx.burst(FX_OF[p.food] || 'dust', p.pos, 1);
    g.fx.spray('puffs', p.pos, 8, { speed: 5, up: 3, colors: [col('#fff3c0'), col('#ffffff')], size: 0.5, life: 0.4, grav: 0.3, grow: 1.2 });
    g.sfx.play('boom', p.pos, 0.6);
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2), s = rand(8, 14);
      g.projectiles.launch({
        food: p.food, owner: p.owner, local: true, u: 'popcorn-popper', x: { m: 0.4, sc: 0.5, pi: 1 },
        pos: p.pos.clone(), vel: new THREE.Vector3(Math.cos(a) * s + p.vel.x * 0.3, rand(2, 8), Math.sin(a) * s + p.vel.z * 0.3),
        gravity: 1, radius: Math.max(0.12, p.radius * 0.6), life: 1.6, spin: 9, charge: p.charge, orient: p.orient,
      });
    }
  }

  stampGround(pt, r, state, dur, opts) {
    const g = this.game;
    const gy = groundHeight(pt.x, pt.z, pt.y + 0.5);
    if (pt.y - gy > 2.5) return false;
    g.surface.stamp(pt.x, gy, pt.z, r, state, dur, g.time, opts);
    return gy;
  }

  // ------------------------------------------------------------------ zones
  addZone(kind, point, p, dur, r) {
    const g = this.game;
    const pos = point.clone();
    const gy = groundHeight(pos.x, pos.z, pos.y + 0.5);
    if (kind !== 'cloud' && kind !== 'vortex' && pos.y - gy > 2.5) return;
    if (kind !== 'cloud') pos.y = Math.min(pos.y, gy + 0.05);
    const z = { kind, pos, r, owner: p.owner, food: ROOT[p.food] || p.food, tint: TINT[p.food] || '#ffffff', t0: g.time, until: g.time + dur, tick: 0, mesh: null };
    if (kind === 'cloud') {
      const a = rand(0, Math.PI * 2);
      z.wind = new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
      pos.y = Math.max(pos.y, gy + 1.2);
    }
    if (kind === 'vortex') {
      const m = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40, 1, 0, Math.PI * 1.5), MAT.vortex);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15 + i * 0.6;
        ring.scale.setScalar(r * (1 - i * 0.28));
        m.add(ring);
      }
      m.position.copy(pos);
      g.scene.add(m);
      z.mesh = m;
      g.sfx.play('whirr', pos, 1);
    }
    if (kind === 'web') {
      WEB_MAT ||= new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, opacity: 0 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), WEB_MAT.clone());
      m.scale.setScalar(r);
      m.position.copy(pos).setY(pos.y + 0.07);
      m.renderOrder = 3;
      g.scene.add(m);
      z.mesh = m;
      z.activeAt = g.time + 0.5;
    }
    if (kind === 'fire') g.sfx.play('sizzle', pos, 1);
    this.zones.push(z);
  }

  _zones(dt) {
    const g = this.game, t = g.time, P = g.fx;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (t > z.until) { this._dropZone(z); this.zones.splice(i, 1); continue; }
      const life = (t - z.t0) / (z.until - z.t0);
      z.tick -= dt;
      const tick = z.tick <= 0;
      if (tick) z.tick = z.kind === 'web' ? 0.3 : 0.5;
      if (z.kind === 'cloud') z.pos.addScaledVector(z.wind, dt);
      if (z.kind === 'vortex' && z.mesh) {
        z.mesh.children.forEach((ring, k) => { ring.rotation.z += dt * (5 + k * 2); });
        z.mesh.scale.setScalar(life < 0.85 ? 1 : 1 - (life - 0.85) / 0.15);
      }
      if (z.kind === 'web' && z.mesh) z.mesh.material.opacity = t < z.activeAt ? 0.4 * (1 - (z.activeAt - t) / 0.5) : life > 0.85 ? 0.9 * (1 - (life - 0.85) / 0.15) : 0.9;

      // particles
      if (P.scale > 0 && Math.random() < dt * 14) {
        _v.set(z.pos.x + rand(-z.r, z.r) * 0.7, z.pos.y + 0.3, z.pos.z + rand(-z.r, z.r) * 0.7);
        if (z.kind === 'fire') P.burst('fire', _v, 0.3);
        else if (z.kind === 'cloud') P.spray('puffs', _v.setY(z.pos.y + rand(-0.6, 0.8)), 2, { speed: 0.6, up: 0.3, colors: [col(z.tint), col('#ffffff')], size: 1.1, life: 1.1, grav: 0, grow: 1.2 });
        else if (z.kind === 'vortex') {
          const a = rand(0, Math.PI * 2), rr = rand(0.5, z.r);
          _v.set(z.pos.x + Math.cos(a) * rr, z.pos.y + rand(0.2, 2), z.pos.z + Math.sin(a) * rr);
          _w.set(-Math.sin(a) * 9, 1, Math.cos(a) * 9);
          P.spray('puffs', _v, 1, { speed: 0.2, up: 0, colors: [col(z.tint), col('#b98cff')], size: 0.35, life: 0.5, grav: 0, drag: 1, dir: _w.multiplyScalar(0.6) });
        }
      }
      if (t < (z.activeAt || 0)) continue;

      // effects on Titans
      for (const a of g.actors) {
        if (!a.alive || a.isRemote) continue;
        const dx = a.pos.x - z.pos.x, dz = a.pos.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > z.r || Math.abs(a.pos.y + 0.9 - z.pos.y) > (z.kind === 'cloud' ? 2.6 : 2.2)) continue;
        const enemy = a !== z.owner;
        if (z.kind === 'vortex' && enemy) {
          const k = 16 * dt / Math.max(0.6, d);
          a.vel.x -= dx * k; a.vel.z -= dz * k;
          if (tick) { g.damage(a, 4, z.owner, z.food); a.addSticky(0.1, 0.6); }
        } else if (z.kind === 'cloud' && enemy && tick) {
          g.damage(a, 3, z.owner, z.food);
          a.addSticky(z.food === 'ice' ? 0.3 : 0.15, 1);
          if (z.food === 'chili') a.burn(1.5);
        } else if (z.kind === 'fire' && enemy && tick) {
          a.burn(1.5);
        } else if (z.kind === 'web') {
          if (a.isBurning() || a.isWet()) { // fire or water clears the web
            g.fx.spray('puffs', z.pos, 10, { speed: 3, up: 2, colors: [col('#ff8fc8'), col('#9fd6ff')], size: 0.6, life: 0.5, grav: 0, grow: 1 });
            if (a === g.player) g.hud.toast(a.isBurning() ? 'You burned through the web' : 'You washed off the web');
            z.until = t;
            break;
          }
          if (enemy && tick && a.slowAmount() < 0.45) a.addSticky(0.25, 0.4);
        }
      }
    }
  }

  _dropZone(z) {
    if (!z.mesh) return;
    this.game.scene.remove(z.mesh);
    z.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== MAT.vortex) o.material.dispose(); } });
  }

  // ------------------------------------------------------------------ Pan
  // Returns true if the Pan handled the alt press.
  panAlt(a, food, slot) {
    if (a.utensil !== 'pan' || !slot || slot.id === 'cheese') return false;
    const g = this.game, t = g.time, s = a.uState;
    if (t < s.cdUntil) return false;
    if (food.alt) {
      if (food.alt(a, g) === false) return true;
    }
    s.cdUntil = t + 7;
    a.rootedUntil = Math.max(a.rootedUntil, t + 0.7);
    // shockwave
    for (const b of g.actors) {
      if (!b.alive || b === a) continue;
      _v.subVectors(b.pos, a.pos).setY(0);
      const d = _v.length();
      if (d > 4 || Math.abs(b.pos.y - a.pos.y) > 2.5) continue;
      g.damage(b, 12, a, slot.id);
      b.knock(_v.normalize().multiplyScalar(9).setY(4));
    }
    g.fx.burst('jump', a.pos, 1.5); g.fx.burst('dust', a.pos, 1.5);
    g.fx.spray('blobs', _v.copy(a.pos).setY(a.pos.y + 0.2), 14, { speed: 9, up: 1, colors: [col('#a49bc4'), col('#fff6a8')], size: 0.1, life: 0.4 });
    g.sfx.play('thud', a.pos, 1.4); g.sfx.play('boom', a.pos, 0.4);
    g.fx.shake(a === g.player ? 0.25 : 0);
    if (a === g.player) g.hud.toast(`Pan slam! ${food.altName || 'Alt'} fired`);
    return true;
  }

  // ------------------------------------------------------------------ delayed pieces (Knife, Blender)
  schedule(o) { this.pending.push({ at: this.game.time + o.delay, o }); }
  _pending() {
    const g = this.game;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (g.time < e.at) continue;
      this.pending.splice(i, 1);
      const a = e.o.owner;
      if (!a.alive) continue;
      const o = { ...e.o, delay: 0 };
      o.pos = a.handPos();
      g.projectiles.launch(o);
    }
  }

  // ------------------------------------------------------------------ pickups
  reset() {
    const g = this.game;
    for (const it of this.pickups) g.scene.remove(it.sprite, it.ring);
    this.pickups.length = 0;
    for (const z of this.zones) this._dropZone(z);
    this.zones.length = 0;
    this.pending.length = 0;
    const pts = [...g.world.spawnPoints].sort(() => Math.random() - 0.5).slice(0, PICKUP_SPOTS);
    this.spots = pts.map((p) => ({ pos: p.clone().add(new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-2.5, 2.5))), item: null, respawnAt: g.time + rand(0, 4) }));
    for (const s of this.spots) s.pos.y = groundHeight(s.pos.x, s.pos.z, s.pos.y + 1);
  }

  drop(id, pos, from = null) {
    const g = this.game;
    const sprite = new THREE.Sprite(spriteMat(id));
    sprite.scale.setScalar(2.1);
    sprite.renderOrder = 5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: UTENSIL_BY_ID[id].color, transparent: true, opacity: 0.9, depthWrite: false }));
    const p = pos.clone();
    p.y = groundHeight(p.x, p.z, p.y + 1);
    ring.position.copy(p).setY(p.y + 0.07);
    g.scene.add(sprite, ring);
    const it = { id, pos: p, sprite, ring, phase: rand(0, 6), spot: null, noPick: from, noPickUntil: g.time + 4 };
    this.pickups.push(it);
    return it;
  }

  // A knocked-out Titan drops the utensil they carried.
  dropFrom(a) {
    if (!a.utensil) return;
    this.drop(a.utensil, a.pos);
    a.utensil = null;
  }

  _pickups(dt) {
    const g = this.game, t = g.time;
    for (const s of this.spots) {
      if (!s.item && t >= s.respawnAt) { s.item = this.drop(randomUtensilId(), s.pos); s.item.spot = s; s.item.noPick = null; }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const bob = Math.sin(t * 2.4 + it.phase) * 0.18;
      it.sprite.position.set(it.pos.x, it.pos.y + 1.7 + bob, it.pos.z);
      it.ring.rotation.y += dt;
      it.ring.material.opacity = 0.6 + Math.sin(t * 4 + it.phase) * 0.3;
      for (const a of g.actors) {
        if (!a.alive || a.isRemote) continue;
        if (a === it.noPick && t < it.noPickUntil) continue;
        if (a.utensil === it.id) continue;
        if (a.isBot && a.utensil) continue; // bots keep the first utensil they find
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z;
        if (dx * dx + dz * dz > 2.3 * 2.3 || Math.abs(a.pos.y - it.pos.y) > 2.2) continue;
        const old = a.utensil;
        g.scene.remove(it.sprite, it.ring);
        it.ring.geometry.dispose(); it.ring.material.dispose();
        this.pickups.splice(i, 1);
        if (it.spot) { it.spot.item = null; it.spot.respawnAt = t + RESPAWN; }
        this.give(a, it.id);
        if (old) this.drop(old, a.pos, a); // swap: leave the old one behind
        g.sfx.play('pickup', it.pos, a === g.player ? 1.1 : 0.4);
        g.fx.spray('puffs', _v.copy(it.pos).setY(it.pos.y + 1.4), 8, { speed: 3, up: 2, colors: [col(UTENSIL_BY_ID[it.id].color), col('#ffffff')], size: 0.4, life: 0.4, grav: 0, grow: 1 });
        break;
      }
    }
  }

  // Badges: the utensil a Titan carries floats over their shoulder.
  _badges() {
    const g = this.game;
    for (const a of g.actors) {
      let b = this.badges.get(a);
      const show = a.alive && a.utensil && a.root.visible && !(a === g.player && g.firstPerson);
      if (!show) { if (b) b.visible = false; continue; }
      if (!b) { b = new THREE.Sprite(spriteMat(a.utensil)); b.scale.setScalar(0.75); b.renderOrder = 6; g.scene.add(b); this.badges.set(a, b); }
      if (b.material !== spriteMat(a.utensil)) b.material = spriteMat(a.utensil);
      forwardOf(a.yaw, _w);
      b.position.set(a.pos.x + _w.z * 0.55, a.pos.y + 2.05, a.pos.z - _w.x * 0.55);
      b.visible = true;
    }
    for (const [a, b] of this.badges) if (!g.actors.includes(a)) { b.visible = false; }
  }

  update(dt) {
    this._pending();
    this._zones(dt);
    this._pickups(dt);
    const t = this.game.time;
    for (const a of this.game.actors) { // heat cools down
      if (!a.utensil || !a.uState?.heat) continue;
      const h = RULES[a.utensil].heat;
      if (h) a.uState.heat = Math.max(0, a.uState.heat - dt / h.decay);
    }
    void t;
  }
  // visuals that should follow the camera's view of the Titans (call after actor visuals)
  updateVisual() { this._badges(); }
}
