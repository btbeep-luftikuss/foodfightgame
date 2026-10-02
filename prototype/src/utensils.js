// Support utensils (0.15, widened in 0.16): twenty food buffers. You carry one utensil at a
// time; it changes how every food you throw behaves, but the food always stays the projectile,
// keeps its own effect, and gets one boost at one cost. Art and copy match docs/utensils.
//
// How it plugs in:
//  - Actor._release() wraps each throw in beginRelease()/endRelease() (costs, heat, recovery).
//  - Projectiles.launch() asks transform() to rewrite the launch (split into pieces, speed up,
//    flatten, ...). Rewritten launches carry `u` (utensil id) and `x` (small numbers) so online
//    players see the same projectile.
//  - Projectiles call pre()/post() around a food's own impact, and step()/expire()/end().
//  - Zones (whisk vortex, mortar cloud, fryer fire, candy web), delivery boxes and loose
//    utensils lying on the floor live here too.
//
// Foods come in four shapes as far as utensils care:
//  - single: one food in flight (tomato, carrot, ice, soda, chili, jelly, cookie, pineapple, banana)
//  - roll:   rolled along the ground (cheese wheel, watermelon)
//  - pellet: volleys (a bunch of grapes is 8 pellets; blueberries fire 12 a second). Zone and
//            status effects ride on one pellet per throw (one blueberry in six) so a volley
//            isn't eight vortexes; plain boosts (speed, damage, bounces) apply to every pellet.
//  - peel:   the banana-peel trap. A few utensils change where it lands or what it leaves.
import * as THREE from 'three';
import { G, groundHeight, rand, clamp, forwardOf, raycastWorld, segPointDist2 } from './core.js';
import { FOODS, makeFoodMesh } from './foods.js';
import { UTENSIL_ART } from './utensil-art.js';

const SINGLE = ['tomato', 'carrot', 'ice', 'soda', 'chili', 'jelly', 'cookie', 'pineapple', 'banana'];
const ROLL = ['cheese', 'watermelon'];
const PELLET = ['grape', 'berry']; // projectile ids of the volley foods
const THROWN = [...SINGLE, ...ROLL, 'grapes', 'blueberry']; // everything you throw, by hotbar id
const WITH_PEEL = [...THROWN, 'peel'];
// projectile id -> hotbar food
const ROOT = { grape: 'grapes', berry: 'blueberry', melonchunk: 'watermelon', cheesechunk: 'cheese', bananaslice: 'banana', pinechunk: 'pineapple' };
// Whole foods that are cut into a different kind of piece (a wheel can't be cut into wheels)
const PIECE = { cheese: 'cheesechunk', watermelon: 'melonchunk', banana: 'bananaslice', pineapple: 'pinechunk' };
const FX_OF = { tomato: 'tomato', carrot: 'carrot', ice: 'ice', soda: 'soda', chili: 'fire', jelly: 'jelly', cookie: 'crumb', pineapple: 'pine', banana: 'banana', cheese: 'cheese', watermelon: 'melon', melonchunk: 'melon', grape: 'grape', berry: 'berry', cheesechunk: 'cheese', bananaslice: 'banana', pinechunk: 'pine' };
const TINT = { tomato: '#e8321f', carrot: '#ff8a1c', ice: '#bfe9ff', soda: '#8a4a22', chili: '#ff3d00', jelly: '#5fd35a', cookie: '#c98a4c', pineapple: '#f2c230', banana: '#ffe14a', cheese: '#ffc93c', watermelon: '#f25a6a', melonchunk: '#f25a6a', grape: '#8e3fae', berry: '#4a52c8', cheesechunk: '#ffc93c', bananaslice: '#ffe14a', pinechunk: '#f2c230' };
// Mixer: which projectile's impact a second food adds
const MIX_IMPACT = { tomato: 'tomato', carrot: 'carrot', ice: 'ice', soda: 'soda', chili: 'chili', cookie: 'cookie', jelly: 'jelly', grapes: 'grape', blueberry: 'berry', watermelon: 'melonchunk', cheese: 'cheesechunk', banana: 'bananaslice', pineapple: 'pinechunk' };

export const UTENSILS = [
  { id: 'knife', tip: '3 pieces per throw · uses 1 extra', name: 'Knife', role: 'Rapid-Fire Chopper', color: '#ff5a3c', works: THROWN,
    buff: 'Chops your food into 3 quick pieces (wheels and melons into chunks, grapes and berries in two); back-to-back hits stack its effect.', trade: 'Uses 1 extra food per throw, and each piece hits softer.' },
  { id: 'ice-cream-machine', tip: 'Freezes on hit · leaves an ice patch', peelTip: 'Your peel lands on an ice patch', name: 'Ice Cream Machine', role: 'Cryo Converter', color: '#7fe3cf', works: WITH_PEEL,
    buff: 'Coats your food in soft-serve: it freezes whoever it hits and leaves an ice patch. A dropped peel gets an ice patch too.', trade: 'Takes half a second to churn, and the frozen shot flies slowly.' },
  { id: 'spoon', tip: '5-pellet cone · short range', name: 'Spoon', role: 'Shotgun Burst', color: '#8f9cff', works: THROWN,
    buff: 'Flings a heaped scoop as a tight cone of 5 pellets; grapes and blueberries come out in a fuller, tighter spray.', trade: 'Uses 1 extra food, and the pellets only fly a short way.' },
  { id: 'blow-torch', tip: 'Hold the throw 3 s to ignite', name: 'Blow Torch', role: 'Incendiary Charge', color: '#ff8a2a', works: THROWN,
    buff: 'Hold the throw for 3 s to set your food ablaze: harder hit plus 3 s of burning. Blueberries catch fire after 3 s of steady fire.', trade: 'You move at half speed while charging, and the torched food burns up 1 extra.' },
  { id: 'whisk', tip: 'Vortex where it lands', peelTip: 'Your peel gets a vortex that pulls enemies onto it', name: 'Whisk', role: 'Vortex Spinner', color: '#b98cff', works: WITH_PEEL,
    buff: 'Whips your food into a vortex where it lands that pulls enemies in and keeps hitting. Around a dropped peel, it drags them onto it.', trade: 'The throw flies slower and the vortex fades after 3 s.' },
  { id: 'blender', tip: 'A juicy stream · slows you', name: 'Blender', role: 'Particle Stream', color: '#ff6a78', works: THROWN,
    buff: 'Purees your food into a stream of 7 droplets that slick the floor; grapes and blueberries fly in a dead-straight jet.', trade: 'You slow down while spraying, and it uses 1 extra food.' },
  { id: 'rolling-pin', tip: 'Ricochets off walls', name: 'Rolling Pin', role: 'Kinetic Disc Ricochet', color: '#d9a464', works: THROWN,
    buff: 'Flattens your food into a fast disc that ricochets off 2 walls and knocks back. Wheels and melons roll out faster.', trade: 'Hits a bit softer, and after a bounce the disc can hit you too.' },
  { id: 'microwave', tip: 'Hold 1–2 s, let go before 2.4 s', name: 'Microwave', role: 'Charged Plasma', color: '#ffc23a', works: THROWN,
    buff: 'Hold the throw 1 to 2 s to charge a glowing orb that explodes on impact. With blueberries, every 1.5 s of fire sends a plasma berry.', trade: 'Hold it past 2.4 s and it overcharges and pops on you.' },
  { id: 'grater', tip: '8 shreds · short range', name: 'Grater', role: 'Flechette Cloud', color: '#ff9d3a', works: THROWN,
    buff: 'Shreds your food into a fast, dense cloud of 8 shreds (grated cheese included).', trade: 'Shreds fall apart after a few metres, and it uses 1 extra food.' },
  { id: 'spatula', tip: 'Every hit crits · banks off a wall', name: 'Spatula', role: 'Ricochet Crit', color: '#3fd0bf', works: THROWN,
    buff: 'Every hit is a critical hit (x1.75), and thrown food banks off one wall.', trade: 'A smaller hitbox and a slower throw: you have to aim it.' },
  { id: 'deep-fryer', tip: 'Sets targets on fire', peelTip: 'Your peel lands in an oil slick', name: 'Deep Fryer', role: 'Napalm Coater', color: '#ffb12a', works: WITH_PEEL,
    buff: 'Coats your food in hot oil: it sets targets on fire and leaves a burning slick. A dropped peel sits in an oil slick.', trade: 'The slick is slippery for you too, and frying too fast overheats it for 5 s.' },
  { id: 'mortar-and-pestle', tip: 'Lands right on your aim point', peelTip: 'Your peel lands on your aim point', name: 'Mortar & Pestle', role: 'Powder Mortar', color: '#9fc4e6', works: WITH_PEEL.filter((f) => f !== 'banana'),
    buff: 'Lobs your food high onto your aim point; it bursts into a lingering cloud of its effect. It even lobs a peel trap.', trade: 'The shell is slow to land, homing food stops homing, and the wind blows the cloud away.' },
  { id: 'toaster', tip: 'Bounces twice', name: 'Toaster', role: 'Scorched Bounce', color: '#ff7a3a', works: THROWN,
    buff: 'Toasts your food crispy: it bounces twice, splashing and scorching each time. Rolled food leaves a scorched trail and burns.', trade: 'Each hit is softer, and it stops after 2 bounces.' },
  { id: 'colander', tip: 'Pierces through Titans · recoil', name: 'Colander', role: 'Piercing Stream', color: '#ff5f6d', works: THROWN,
    buff: 'Strains your food into a needle-fast shot that pierces up to 3 Titans (grapes and berries pierce 1).', trade: 'The recoil shoves and slows you, and the thin shot needs precise aim.' },
  { id: 'cotton-candy-machine', tip: 'Sticky web where it lands', peelTip: 'Your peel lands in a sticky web', name: 'Cotton Candy Machine', role: 'Sticky Web', color: '#ff8fc8', works: WITH_PEEL,
    buff: 'Spins a sticky web where your food lands that slows and traps enemies; direct hits root. Works around a dropped peel too.', trade: 'The web takes a moment to set, and fire or water destroys it.' },
  { id: 'popcorn-popper', tip: 'Pops into pieces mid-air', name: 'Popcorn Popper', role: 'Cluster Burst', color: '#ffd23a', works: THROWN,
    buff: 'Your food pops mid-flight into 5 exploding pieces; a rolling wheel or melon pops into chunks.', trade: 'The fuse is short and the pieces scatter in random directions.' },
  { id: 'peeler', tip: 'Hit the same Titan again and again', name: 'Peeler', role: 'Layered Multi-Stage', color: '#9a6ef0', works: THROWN,
    buff: 'Each hit on the same Titan peels a layer: x0.7, x1.15, x1.6, then x2.1 damage (volleys peel a layer every 6 hits).', trade: 'Weak first hits, and after the last layer it needs 5 s to reset.' },
  { id: 'mixer', tip: 'Blends in a second food', name: 'Mixer', role: 'Hybrid Combiner', color: '#3fc9a8', works: THROWN,
    buff: 'Blends a second food from your hotbar into the throw: it lands with both effects. Any two foods mix.', trade: 'Uses 1 of the second food too, and takes longer to prep.' },
  { id: 'oven-mitt', tip: 'Power throw ready', peelTip: 'Hurls your peel far ahead', name: 'Oven Mitt', role: 'Power Throw', color: '#ff6f6f', works: WITH_PEEL,
    buff: 'Hurls your food 70% faster and further, straight through cheese shields. It can even throw a peel trap 18 m.', trade: 'Only every 3.5 s, and quick throws overheat it for 6 s.' },
  { id: 'pan', tip: 'Q: slam to fire the alt', name: 'Pan', role: 'Alt-Ability Activator', color: '#a49bc4', works: WITH_PEEL,
    buff: "Your food's alt ability (Q) ignores its cooldown and slams a shockwave around you. Foods without an alt get one: smash a melon, plant pineapple spikes, fire a ring of berries.", trade: 'The Pan has its own 7 s cooldown, and the slam roots you for a moment.' },
];
export const UTENSIL_BY_ID = Object.fromEntries(UTENSILS.map((u) => [u.id, u]));
export const UTENSIL_IDS = UTENSILS.map((u) => u.id);
export const KIT = 3; // utensils a Titan can carry
export const utensilHeat = (id) => RULES[id]?.heat || null; // heat limits, for the HUD
export const randomUtensilId = () => UTENSIL_IDS[(Math.random() * UTENSIL_IDS.length) | 0];

// The art as an <img>-ready data URL (HUD, menus) and as a texture (pickups, badges, boxes).
const urlCache = {};
export function utensilIcon(id) {
  return (urlCache[id] ||= `data:image/svg+xml;charset=utf-8,${encodeURIComponent(UTENSIL_ART[id] || '')}`);
}
const imgCache = {};
function withArt(id, draw) { // draws the utensil art once it has loaded
  let e = imgCache[id];
  if (!e) {
    e = imgCache[id] = { img: new Image(), ready: false, waiting: [] };
    e.img.onload = () => { e.ready = true; for (const f of e.waiting) f(e.img); e.waiting.length = 0; };
    e.img.src = utensilIcon(id);
  }
  if (e.ready) draw(e.img); else e.waiting.push(draw);
}
const texCache = {};
function utensilTexture(id) {
  if (texCache[id]) return texCache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  withArt(id, (img) => { c.getContext('2d').drawImage(img, 0, 0, 256, 256); tex.needsUpdate = true; });
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

// ---------------------------------------------------------------------------- launch helpers
const clone = (o) => ({ ...o, pos: o.pos.clone(), vel: o.vel.clone() });
const radiusOf = (o) => o.radius ?? FOODS[o.food]?.radius ?? 0.35;
function jitter(v, s) {
  const L = v.length();
  v.x += rand(-s, s) * L; v.y += rand(-s, s) * L * 0.6; v.z += rand(-s, s) * L;
  return v.setLength(L);
}
// On a volley, only the lead pellet carries zone and status effects ("nf": no effect).
const lead = (q, I) => { if (I.kind === 'pellet' && !I.lead) q.x.nf = 1; return q; };
const isPellet = (p) => PELLET.includes(p.food);
function aimOf(a) {
  const d = a.aimDir.clone();
  if (d.lengthSq() < 1e-4) forwardOf(a.yaw, d);
  return d.normalize();
}
// One piece of a cut-up food. Wheels, melons, bananas and pineapples become chunks thrown
// along the aim like any other food (a melon can't be cut into little rolling melons).
function piece(o, a, opts) {
  const pf = PIECE[o.food];
  let q;
  if (pf) {
    const dir = aimOf(a); dir.y += 0.08; dir.normalize();
    q = { food: pf, owner: o.owner, pos: a.handPos(), vel: dir.multiplyScalar(26), gravity: pf === 'bananaslice' ? 0.35 : 1, radius: FOODS[pf].radius, life: 4, spin: 9 };
  } else q = clone(o);
  if (opts.speed) q.vel.multiplyScalar(opts.speed);
  if (opts.jit) jitter(q.vel, opts.jit);
  if (opts.grav !== undefined) q.gravity = (q.gravity ?? 1) * opts.grav;
  q.radius = (q.radius ?? radiusOf(o)) * (opts.r ?? 0.75);
  if (opts.life) q.life = opts.life;
  q.delay = opts.delay || 0;
  q.x = { m: opts.m, sc: pf ? Math.min(1, opts.sc * 1.6) : opts.sc, pi: 1, ...(opts.x || {}) };
  return q;
}
function pieces(o, a, n, opts) {
  return Array.from({ length: n }, (_, i) => {
    const q = piece(o, a, { ...opts, delay: (opts.delay || 0) * i });
    if (q.food === 'pinechunk' && i % 2 === 0) q.x.sp = 1; // every other pineapple chunk plants spikes
    return q;
  });
}
// A high arc that comes down on `tgt` (Mortar & Pestle).
function arcTo(from, tgt, grav) {
  const g = G * grav;
  const dx = tgt.x - from.x, dz = tgt.z - from.z, dy = tgt.y - from.y;
  const h = Math.hypot(dx, dz), D = Math.min(70, h);
  const T = clamp(0.9 + D / 22, 1, 2.6);
  const k = D / Math.max(1e-3, h);
  return new THREE.Vector3((dx * k) / T, (dy + 0.5 * g * T * T) / T, (dz * k) / T);
}

// ---------------------------------------------------------------------------- per-utensil rules
// Each rule may define:
//  charge(a, food, U): { need, auto, over, slow } extra hold time for the throw
//  launch(o, a, rel, I): launch options (with `delay` for later pieces), or null for a plain throw.
//      I = { kind: 'single' | 'roll' | 'pellet', k: launch index in this throw, lead }
//  cost: extra food per boosted throw; rec: recovery multiplier; heat: overheating
//  released(a, U, rel): after a boosted throw (recoil, self-slow)
//  pre(p, hit, U): before the food's impact (return true to skip the food's own impact)
//  post(p, hit, U): after it; step(p, dt, U): every frame; expire(p, U): flight or roll ended
//  trap(a, pos, U): a banana peel is being dropped; may return a new spot for it
const RULES = {
  knife: {
    cost: 1, rec: 0.8,
    launch(o, a, rel, I) {
      if (I.kind === 'pellet') return [0, 1].map(() => ({ ...clone(o), vel: jitter(o.vel.clone(), 0.035), x: { m: 0.6, sc: 0.8 } }));
      return pieces(o, a, 3, { m: 0.45, sc: 0.62, delay: 0.07 });
    },
  },
  'ice-cream-machine': {
    charge: () => ({ need: 0.5, auto: true }),
    launch: (o, a, rel, I) => [lead({ ...clone(o), vel: o.vel.clone().multiplyScalar(0.72), gravity: (o.gravity ?? 1) * 0.85, x: {} }, I)],
    post(p, hit, U) {
      if (p.x.nf) return;
      if (hit.actor?.alive) hit.actor.applyHardCC('frozen', 0.8);
      U.once(p, 'ice', () => U.icePatch(hit.point, p.owner, 5));
    },
    expire(p, U) { if (p.roll && !p.x.nf) U.once(p, 'ice', () => U.icePatch(p.pos, p.owner, 5)); },
    trap(a, pos, U) { U.icePatch(pos, a, 8); return pos; },
  },
  spoon: {
    cost: 1,
    launch(o, a, rel, I) {
      if (I.kind === 'pellet') { // a fuller, tighter spray along the aim
        const n = rel.auto || I.k % 2 === 0 ? 2 : 1, L = o.vel.length();
        return Array.from({ length: n }, () => ({ ...clone(o), vel: jitter(aimOf(a).setLength(L), 0.05), x: { m: 0.7, sc: 0.9 } }));
      }
      return pieces(o, a, 5, { m: 0.4, sc: 0.55, jit: 0.11, life: 0.75, speed: 1.05, r: 0.7 });
    },
  },
  'blow-torch': {
    cost: 1,
    charge: () => ({ need: 3, auto: false, slow: 0.5 }),
    launch(o, a, rel) {
      const lit = rel.auto ? a.uState.fire >= 3 : rel.t >= 3; // blueberries: after 3 s of steady fire
      return lit ? [{ ...clone(o), x: { m: rel.auto ? 1.1 : 1.3 } }] : null;
    },
    post(p, hit, U) {
      const g = U.game, pel = isPellet(p);
      if (hit.actor) hit.actor.burn(pel ? 1.5 : 3);
      g.fx.burst('fire', hit.point, pel ? 0.4 : 1.4);
      if (pel) return;
      if (!hit.actor) g.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 1.6, 'chili');
      g.sfx.play('sizzle', hit.point, 1.1);
    },
    expire(p, U) { if (p.roll) U.game.fx.burst('fire', p.pos, 1.2); },
  },
  whisk: {
    launch: (o, a, rel, I) => [lead({ ...clone(o), vel: o.vel.clone().multiplyScalar(0.78), x: {} }, I)],
    post(p, hit, U) { if (!p.x.nf) U.once(p, 'vortex', () => U.addZone('vortex', hit.point, p, 3, 5.5)); },
    expire(p, U) { if (p.roll && !p.x.nf) U.once(p, 'vortex', () => U.addZone('vortex', p.pos, p, 3, 5.5)); },
    trap(a, pos, U) { U.addZone('vortex', pos, { owner: a, food: 'banana' }, 3.5, 6.5); return pos; },
  },
  blender: {
    cost: 1,
    launch(o, a, rel, I) {
      if (I.kind === 'pellet') { // a dead-straight juice jet
        return [{ ...clone(o), vel: aimOf(a).setLength(o.vel.length() * 1.1), delay: rel.auto ? 0 : I.k * 0.045, x: { m: 0.9, sc: 0.85, ...(I.lead ? { sl: 1 } : {}) } }];
      }
      return pieces(o, a, 7, { m: 0.25, sc: 0.45, jit: 0.025, delay: 0.055, speed: 1.15, grav: 0.7, r: 0.6, x: { sl: 1 } });
    },
    released(a, U) { a.surfaceSlow = 0.4; a.surfaceSlowUntil = U.game.time + 0.8; },
    post(p, hit, U) { if (p.x.sl && hit.world && hit.top) U.stampGround(hit.point, 1.6, 'slick', 3); },
  },
  'rolling-pin': {
    launch(o, a, rel, I) {
      if (I.kind === 'roll') return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.35), x: { m: 0.75, kb: 1 } }];
      if (I.kind === 'pellet') return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.2), spin: 0, x: { m: 0.85, sc: [1.4, 0.45, 1.4], wb: 1, fl: 1 } }];
      return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.35), gravity: (o.gravity ?? 1) * 0.45, spin: 0, x: { m: 0.75, sc: [1.5, 0.38, 1.5], wb: 2, fl: 1, kb: 1 } }];
    },
    post(p, hit) {
      if (hit.actor && p.x.kb) hit.actor.knock(_v.copy(p.vel).setY(0).normalize().multiplyScalar(8).setY(3));
    },
  },
  microwave: {
    charge: () => ({ need: 1, auto: false, over: 2.4 }),
    launch(o, a, rel, I) {
      if (rel.auto) { // blueberries: every 1.5 s of steady fire, one berry comes out as a small plasma orb
        const s = a.uState;
        if (s.fire - s.lastOrb < 1.5) return null;
        s.lastOrb = s.fire;
        return [{ ...clone(o), x: { m: 1, sm: 1 } }];
      }
      return rel.t >= 1 ? [lead({ ...clone(o), x: { m: 1.1 } }, I)] : null;
    },
    post(p, hit, U) { if (!p.x.nf) U.once(p, 'boom', () => U.plasma(hit.point, p)); },
    expire(p, U) { if (p.roll && !p.x.nf) U.once(p, 'boom', () => U.plasma(p.pos, p)); },
  },
  grater: {
    cost: 1,
    launch(o, a, rel, I) {
      if (I.kind === 'pellet') return [0, 1].map(() => ({ ...clone(o), vel: jitter(o.vel.clone().multiplyScalar(1.3), 0.12), life: 0.4, x: { m: 0.5, sc: 0.6 } }));
      return pieces(o, a, 8, { m: 0.27, sc: 0.38, jit: 0.17, life: 0.34, speed: 1.5, grav: 0.4, r: 0.6 });
    },
  },
  spatula: {
    rec: 1.3,
    launch(o, a, rel, I) {
      if (I.kind === 'roll') return [{ ...clone(o), x: { m: 1 } }];
      return [{ ...clone(o), radius: radiusOf(o) * 0.6, x: { m: 1, wb: 1 } }];
    },
    pre(p, hit, U) {
      if (!hit.actor) return false;
      U.game.dmgScale *= 1.75;
      if (!isPellet(p) || Math.random() < 0.3) U.game.floatText(hit.actor, 'CRIT!', 'crit');
      return false;
    },
  },
  'deep-fryer': {
    heat: { per: 1, perAuto: 0.15, max: 4, decay: 2.5, lock: 5 },
    launch: (o, a, rel, I) => (a.game.time < a.uState.overUntil ? null : [{ ...clone(o), x: I.kind === 'pellet' && !I.lead ? { ns: 1 } : {} }]),
    post(p, hit, U) {
      if (hit.actor) { hit.actor.burn(isPellet(p) ? 1.2 : 2); return; }
      if (!p.x.ns) U.once(p, 'fire', () => U.fireSlick(hit.point, p));
    },
    expire(p, U) { if (p.roll) U.once(p, 'fire', () => U.fireSlick(p.pos, p)); },
    trap(a, pos, U) {
      if (U.stampGround(pos, 3.2, 'slick', 8) !== false) U.game.world.paintSplat(pos.x, pos.y, pos.z, 2.8, 'cheese');
      U.game.fx.spray('blobs', pos, 10, { speed: 3, up: 3, colors: [col('#ffc23a'), col('#ffe08a')], size: 0.12, life: 0.5 });
      U.game.sfx.play('sizzle', pos, 0.7);
      return pos;
    },
  },
  'mortar-and-pestle': {
    launch(o, a, rel, I) {
      const tgt = a.aimPoint.clone();
      if (I.kind === 'pellet') { tgt.x += rand(-1.8, 1.8); tgt.z += rand(-1.8, 1.8); }
      const grav = (o.gravity || 1) * 0.75;
      return [lead({ ...clone(o), vel: arcTo(o.pos, tgt, grav), gravity: grav, seek: null, turn: 0, retarget: 0, x: {} }, I)];
    },
    post(p, hit, U) { if (!p.x.nf) U.once(p, 'cloud', () => U.addZone('cloud', hit.point, p, 4, 3.5)); },
    expire(p, U) { if (p.roll && !p.x.nf) U.once(p, 'cloud', () => U.addZone('cloud', p.pos, p, 4, 3.5)); },
    trap(a, pos, U) { // lob the peel onto the aim point (up to 45 m away)
      const t = a.aimPoint, dx = t.x - a.pos.x, dz = t.z - a.pos.z, d = Math.hypot(dx, dz);
      const k = Math.min(1, 45 / Math.max(d, 1e-3));
      const x = a.pos.x + dx * k, z = a.pos.z + dz * k;
      const at = new THREE.Vector3(x, groundHeight(x, z, Math.max(t.y, a.pos.y) + 1), z);
      U.game.fx.spray('puffs', at, 8, { speed: 2, up: 1, colors: [col('#e3f6ff'), col('#ffffff')], size: 0.8, life: 0.6, grav: 0, grow: 1.2 });
      U.game.sfx.play('whirr', a.pos, 0.6);
      return at;
    },
  },
  toaster: {
    launch(o, a, rel, I) {
      if (I.kind === 'roll') return [{ ...clone(o), x: { m: 0.9, tr: 1 } }];
      return [{ ...clone(o), x: { m: 0.85, fb: 2, ...(I.kind === 'pellet' ? { ps: 1 } : {}) } }];
    },
    pre(p, hit, U) {
      if (!(hit.world && hit.top && p.x.fb > 0)) return false;
      const g = U.game, pt = hit.point;
      p.x.fb--;
      g.splash(pt, 2.4, p.x.ps ? 3 : 12, p.owner, ROOT[p.food] || p.food, {});
      if (!p.x.ps || Math.random() < 0.3) g.world.paintSplat(pt.x, pt.y, pt.z, 1.4, 'soda');
      g.fx.burst('ember', pt, p.x.ps ? 0.4 : 1); if (!p.x.ps) g.fx.burst('dust', pt, 0.6);
      if (!p.x.ps) g.sfx.play('sizzle', pt, 0.6);
      p.pos.y = pt.y + p.radius + 0.05;
      p.vel.y = Math.abs(p.vel.y) * 0.55 + 5;
      p.x.m *= 0.85;
      return true; // keeps flying
    },
    post(p, hit) { if (hit.actor && p.x.tr) hit.actor.burn(1.5); },
    step(p, dt, U) { // a toasted wheel scorches the floor it rolls over
      if (!p.x.tr || !p.roll) return;
      p.uScorch = (p.uScorch || 0) - dt;
      if (p.uScorch > 0) return;
      p.uScorch = 0.22;
      const gy = groundHeight(p.pos.x, p.pos.z, p.pos.y);
      U.game.world.paintSplat(p.pos.x, gy, p.pos.z, p.radius * 1.3, 'soda');
      U.game.fx.burst('ember', _v.set(p.pos.x, gy + 0.2, p.pos.z), 0.5);
    },
  },
  colander: {
    launch(o, a, rel, I) {
      if (I.kind === 'roll') return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.9), x: { m: 0.9 } }];
      if (I.kind === 'pellet') return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.4), gravity: (o.gravity ?? 1) * 0.5, radius: radiusOf(o) * 0.7, x: { m: 0.9, pc: 1 } }];
      const v = o.vel.clone();
      if (v.length() < 70) v.multiplyScalar(1.9);
      return [{ ...clone(o), vel: v, gravity: (o.gravity ?? 1) * 0.25, radius: radiusOf(o) * 0.5, x: { m: 0.9, pc: 3 } }];
    },
    released(a, U, rel) {
      const back = _w.copy(a.aimDir).setY(0);
      if (back.lengthSq() < 1e-4) forwardOf(a.yaw, back);
      back.normalize().multiplyScalar(rel.auto ? -0.9 : -5);
      a.knock(back.setY(rel.auto ? 0 : 0.5));
      a.surfaceSlow = 0.35; a.surfaceSlowUntil = U.game.time + 0.6;
    },
  },
  'cotton-candy-machine': {
    launch: (o, a, rel, I) => [lead({ ...clone(o), x: {} }, I)],
    post(p, hit, U) {
      if (p.x.nf) return;
      if (hit.actor?.alive) hit.actor.applyHardCC('rooted', 0.8);
      U.once(p, 'web', () => U.addZone('web', hit.point, p, 5.5, 3.2));
    },
    expire(p, U) { if (p.roll && !p.x.nf) U.once(p, 'web', () => U.addZone('web', p.pos, p, 5.5, 3.2)); },
    trap(a, pos, U) { U.addZone('web', pos, { owner: a, food: 'banana' }, 8, 3.4); return pos; },
  },
  'popcorn-popper': {
    launch(o, a, rel, I) {
      if (I.kind === 'pellet' && !I.lead) return null;
      return [{ ...clone(o), x: { pa: rand(0.4, 0.6) } }];
    },
    step(p, dt, U) { if (p.x.pa && p.life >= p.x.pa) U.pop(p); },
    post(p, hit, U) {
      if (!p.x.pp) return;
      U.game.explode(hit.point, 1.8, 6, p.owner, ROOT[p.food] || p.food, 4);
      U.game.fx.burst('fire', hit.point, 0.4);
    },
  },
  peeler: {
    launch: (o, a, rel, I) => [{ ...clone(o), x: I.kind === 'pellet' ? { pe: 1 } : {} }],
    pre(p, hit, U) {
      if (!hit.actor) return false;
      const g = U.game, pl = p.owner.uState.peel, t = g.time;
      if (t < pl.cdUntil) { g.dmgScale *= 0.7; return false; }
      let up = false;
      if (pl.target !== hit.actor || t > pl.until) { pl.target = hit.actor; pl.layer = 0; pl.hits = 0; }
      else if (!p.x.pe || ++pl.hits >= 6) { pl.layer++; pl.hits = 0; up = true; } // a volley peels a layer every 6 hits
      pl.until = t + 6;
      g.dmgScale *= [0.7, 1.15, 1.6, 2.1][pl.layer];
      if (up) g.floatText(hit.actor, pl.layer === 3 ? 'PEELED!' : `LAYER ${pl.layer + 1}`, 'crit');
      if (pl.layer >= 3) { pl.cdUntil = t + 5; pl.target = null; pl.layer = 0; }
      return false;
    },
  },
  mixer: {
    charge: (a, food, U) => (U.mixSlot(a) >= 0 ? { need: 0.7, auto: true } : null),
    launch(o, a, rel, I) {
      if (!rel.mx || (I.kind === 'pellet' && !I.lead)) return null;
      return [{ ...clone(o), x: { mx: rel.mx } }];
    },
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
    heat: { per: 1, perAuto: 0.08, max: 3, decay: 7, lock: 6, cd: 3.5 },
    launch(o, a, rel) {
      const s = a.uState, t = a.game.time;
      if (t < s.overUntil) return null;
      if (rel.auto) return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.5), x: { m: 1 } }];
      if (t < s.cdUntil) return null;
      return [{ ...clone(o), vel: o.vel.clone().multiplyScalar(1.7), gravity: (o.gravity ?? 1) * 0.55, x: { m: 1.1 } }];
    },
    trap(a, pos, U) { // hurl the peel up to 18 m ahead
      const s = a.uState, t = U.game.time;
      if (t < s.overUntil || t < s.cdUntil) return pos;
      const f = forwardOf(a.yaw, new THREE.Vector3());
      const d = Math.max(1.6, Math.min(18, raycastWorld(_c.set(a.pos.x, a.pos.y + 1, a.pos.z), f, 18) - 1));
      const x = a.pos.x + f.x * d, z = a.pos.z + f.z * d;
      s.cdUntil = t + 3.5;
      U.game.sfx.play('throw', a.pos, 1.2);
      return new THREE.Vector3(x, groundHeight(x, z, a.pos.y + 1), z);
    },
  },
  pan: {},
};

// The Pan gives foods without an alt ability one of their own.
const PAN_SPECIAL = {
  watermelon(a, g) { // smash it at your feet: chunks fly everywhere
    const f = forwardOf(a.yaw, new THREE.Vector3());
    FOODS.watermelon.split({ pos: a.pos.clone().addScaledVector(f, 2).setY(a.pos.y + 0.9), owner: a }, g);
    a.consume(1);
  },
  pineapple(a, g) { // plant a spike field just ahead
    const f = forwardOf(a.yaw, new THREE.Vector3());
    const pt = a.pos.clone().addScaledVector(f, 6);
    pt.y = groundHeight(pt.x, pt.z, a.pos.y + 1);
    g.explode(pt, 3, 30, a, 'pineapple', 7);
    g.addSpikeField(pt, 3.5, 4, 8, a);
    g.fx.burst('pine', pt);
    a.consume(1);
  },
  blueberry(a, g) { // a ring of berries in every direction
    const slot = a.selected();
    const n = slot.inf ? 16 : Math.min(16, slot.count);
    const from = a.center(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      g.projectiles.launch({ food: 'berry', owner: a, pos: from.clone(), vel: new THREE.Vector3(Math.cos(ang) * 60, 1, Math.sin(ang) * 60), gravity: 0.25, radius: 0.13, life: 1.5, spin: 12 });
    }
    a.consume(n);
    g.sfx.play('berry', a.pos, 1);
  },
};

// ---------------------------------------------------------------------------- delivery boxes
const BOX_W = 2.4, BOX_H = 1.9, MAX_BOXES = 6, DROP_FROM = 55, FALL_SPEED = 7;
let BOX_GEO = null, CHUTE_GEO = null, CHUTE_MAT = null, STRING_MAT = null, BEAM_GEO = null, BOX_TOP = null, BOX_TAPE = null;
const boxSides = {};
function cardboard(x, w, h) {
  x.fillStyle = '#c8955a'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { // fibres
    x.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,40,0.10)' : 'rgba(255,230,190,0.10)';
    x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1);
  }
  x.strokeStyle = 'rgba(90,55,25,0.55)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
}
function boxSide(id) { // cardboard with packing tape and a label showing the utensil inside
  if (boxSides[id]) return boxSides[id];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  cardboard(x, 256, 256);
  x.fillStyle = 'rgba(214,176,112,0.85)'; x.fillRect(0, 0, 256, 34); // tape over the lid edge
  x.fillStyle = '#fffaf0';
  x.beginPath(); if (x.roundRect) x.roundRect(46, 52, 164, 174, 14); else x.rect(46, 52, 164, 174); x.fill();
  x.strokeStyle = UTENSIL_BY_ID[id].color; x.lineWidth = 6; x.stroke();
  x.fillStyle = '#2b1633'; x.font = '900 17px "Bagel Fat One", "Arial Black", sans-serif'; x.textAlign = 'center';
  x.fillText('SPECIAL DELIVERY', 128, 214);
  x.fillStyle = '#2b1633'; // "this way up" arrows
  for (const ax of [18, 238]) { x.beginPath(); x.moveTo(ax, 70); x.lineTo(ax - 10, 86); x.lineTo(ax + 10, 86); x.fill(); x.fillRect(ax - 3, 86, 6, 16); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  withArt(id, (img) => { x.drawImage(img, 60, 50, 136, 136); tex.needsUpdate = true; });
  return (boxSides[id] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
}
function boxTop() {
  if (BOX_TOP) return BOX_TOP;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  cardboard(x, 128, 128);
  x.fillStyle = 'rgba(214,176,112,0.9)'; x.fillRect(48, 0, 32, 128);
  x.strokeStyle = 'rgba(90,55,25,0.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (BOX_TOP = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
}
function chuteMat() {
  if (CHUTE_MAT) return CHUTE_MAT;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fffaf2' : '#e2483a'; x.fillRect(i * 16, 0, 16, 32); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (CHUTE_MAT = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------------------- the manager
export class Utensils {
  constructor(game) {
    this.game = game;
    this.pickups = []; this.zones = []; this.pending = []; this.boxes = [];
    this.nextDrop = 0;
    this.badges = new Map(); // actor -> sprite showing the utensil they carry
    this.attachPool = {};
  }

  // ------------------------------------------------------------------ actors
  static freshState() {
    return { heat: 0, overUntil: 0, cdUntil: 0, fire: 0, autoAt: -9, shots: 0, lastOrb: 0, peel: { target: null, layer: 0, hits: 0, until: 0, cdUntil: 0 } };
  }

  // A Titan carries up to KIT utensils; `a.utensil` / `a.uState` are always the one in hand.
  static emptyKit(a) {
    a.utensils = new Array(KIT).fill(null);
    a.uStates = a.utensils.map(() => Utensils.freshState());
    a.uSel = 0; a.utensil = null; a.uState = a.uStates[0];
  }

  // Take a utensil in hand (an empty slot just shows empty hands).
  select(a, i) {
    if (!a.utensils || i < 0 || i >= KIT || i === a.uSel) return;
    const was = a.utensil;
    a.uSel = i; a.utensil = a.utensils[i]; a.uState = a.uStates[i];
    if (was !== a.utensil && a.charging) { a.charging = false; a.chargeT = 0; } // no carrying a charge over to another utensil
  }
  cycle(a, dir) {
    if (!a.utensils) return;
    for (let k = 1; k <= KIT; k++) {
      const i = (a.uSel + dir * k + KIT * 4) % KIT;
      if (a.utensils[i]) { this.select(a, i); return; }
    }
  }

  // Add a utensil to the kit: an empty slot first (taken in hand if the hand is empty), otherwise
  // it swaps out the one in hand. Returns the swapped-out id, null, or false if already carried.
  give(a, id) {
    if (!UTENSIL_BY_ID[id]) return false;
    if (!a.utensils) Utensils.emptyKit(a);
    if (a.utensils.includes(id)) return false;
    let i = a.utensils[a.uSel] ? a.utensils.indexOf(null) : a.uSel;
    const swap = i < 0;
    if (swap) i = a.uSel;
    const old = a.utensils[i];
    a.utensils[i] = id; a.uStates[i] = Utensils.freshState();
    if (i === a.uSel) { a.utensil = id; a.uState = a.uStates[i]; a.charging = false; }
    if (a === this.game.player) {
      const u = UTENSIL_BY_ID[id];
      const how = i === a.uSel ? u.role : this.game.input?.isTouch ? 'turn the utensil plate to use it' : `press ${i + 6} to use it`;
      this.game.hud.toast(`${u.name}: ${how}`);
    }
    return swap ? old : null;
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
    if (!slot) return u.tip;
    if (!u.works.includes(slot.id)) return `No effect on ${FOODS[slot.id].name}`;
    if (slot.id === 'peel') return u.peelTip || u.tip;
    const food = FOODS[slot.id];
    const firing = t - s.autoAt < 0.3;
    if (food.auto && u.id === 'blow-torch') return firing && s.fire >= 3 ? 'Berries ablaze!' : firing ? `Keep firing: ${s.fire.toFixed(1)} / 3 s` : 'Keep firing 3 s to ignite';
    if (food.auto && u.id === 'microwave') return 'Every 1.5 s of fire: a plasma berry';
    if (u.id === 'oven-mitt' && !food.auto && t < s.cdUntil) return `Power throw in ${Math.ceil(s.cdUntil - t)} s`;
    if (u.id === 'peeler' && t < s.peel.cdUntil) return `Re-peel in ${Math.ceil(s.peel.cdUntil - t)} s`;
    if (u.id === 'mixer') { const i = this.mixSlot(a); return i < 0 ? 'Carry a second food to mix' : `Mixing in ${FOODS[a.inv[i].id].name}`; }
    const R = RULES[u.id];
    if (R.heat) return `${u.tip} · heat ${'●'.repeat(Math.round(s.heat))}${'○'.repeat(Math.max(0, R.heat.max - Math.round(s.heat)))}`;
    const c = this.chargeRule(a, food);
    if (c && a.charging) {
      if (c.over && a.chargeT > c.need) return a.chargeT > c.over - 0.5 ? 'Let go! About to pop' : 'Charged: let go';
      return a.chargeT >= c.need ? 'Charged: let go' : `Charging ${a.chargeT.toFixed(1)} / ${c.need} s`;
    }
    return u.tip || u.role;
  }

  // The in-play HUD's short version: only what needs attention right now (null: nothing to say).
  brief(a) {
    const u = a.utensil && UTENSIL_BY_ID[a.utensil];
    if (!u) return null;
    const t = this.game.time, s = a.uState, slot = a.selected();
    if (t < s.overUntil) return { text: `Overheated ${Math.ceil(s.overUntil - t)}`, warn: true };
    if (u.id === 'pan') return t < s.cdUntil ? { text: `Slam ${Math.ceil(s.cdUntil - t)}` } : null;
    if (!slot) return null;
    if (!u.works.includes(slot.id)) return { text: 'No effect', warn: true };
    const food = FOODS[slot.id];
    if (food.auto && u.id === 'blow-torch' && t - s.autoAt < 0.3) return s.fire >= 3 ? { text: 'Ablaze!' } : { text: `Ignite ${'●'.repeat(Math.floor(s.fire))}${'○'.repeat(3 - Math.floor(s.fire))}` };
    if (u.id === 'oven-mitt' && !food.auto && t < s.cdUntil) return { text: `Mitt ${Math.ceil(s.cdUntil - t)}` };
    if (u.id === 'peeler' && t < s.peel.cdUntil) return { text: `Re-peel ${Math.ceil(s.peel.cdUntil - t)}` };
    if (u.id === 'mixer' && this.mixSlot(a) < 0) return { text: 'Needs a 2nd food', warn: true };
    const R = RULES[u.id];
    if (R.heat && s.heat >= 0.5) return { text: `${'●'.repeat(Math.round(s.heat))}${'○'.repeat(Math.max(0, R.heat.max - Math.round(s.heat)))}`, warn: s.heat > R.heat.max - 1 };
    const c = this.chargeRule(a, food);
    if (c && a.charging && c.over && a.chargeT > c.over - 0.5) return { text: 'Let go!', warn: true };
    return null;
  }

  // Extra hold time the utensil asks for (null: none).
  chargeRule(a, food) {
    const id = a.utensil;
    if (!id || !food || food.auto) return null;
    const slot = a.selected();
    if (!slot || slot.id === 'peel' || !UTENSIL_BY_ID[id].works.includes(slot.id)) return null;
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
    const slot = a.selected(), s = a.uState, t = this.game.time;
    const rel = { t: chargeT, used: false, mx: null, mxSlot: -1, food: slot?.id, k: 0, auto: !!food.auto, lead: true };
    if (food.auto && s) { // blueberries: track steady fire and pick the lead berry (one in six)
      if (t - s.autoAt < 0.25) s.fire += t - s.autoAt; else { s.fire = 0; s.lastOrb = 0; }
      s.autoAt = t;
      s.shots = (s.shots + 1) % 6;
      rel.lead = s.shots === 1;
    }
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
    if (R.released) R.released(a, this, rel);
    if (rel.mxSlot >= 0) {
      const m = a.inv[rel.mxSlot];
      if (m && !m.inf) { m.count--; if (m.count <= 0) a.inv[rel.mxSlot] = null; }
    }
    if (R.heat) {
      s.heat = Math.min(R.heat.max, s.heat + (rel.auto ? R.heat.perAuto ?? R.heat.per : R.heat.per));
      if (R.heat.cd && !rel.auto) s.cdUntil = t + R.heat.cd;
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
    const root = ROOT[o.food] || o.food;
    if (!UTENSIL_BY_ID[a.utensil].works.includes(root)) return null;
    const R = RULES[a.utensil];
    if (!R.launch) return null;
    const rel = a.uRel;
    const kind = ROLL.includes(o.food) ? 'roll' : PELLET.includes(o.food) ? 'pellet' : 'single';
    const k = rel.k++;
    const I = { kind, k, lead: kind !== 'pellet' || (rel.auto ? rel.lead : k === 0) };
    const list = R.launch(o, a, rel, I);
    if (!list) return null;
    rel.used = true;
    for (const q of list) q.u = a.utensil;
    return list;
  }

  // A banana peel is being dropped: some utensils move it or add a zone around it.
  trap(a, pos) {
    const id = a.utensil;
    if (!id || !UTENSIL_BY_ID[id].works.includes('peel')) return pos;
    const R = RULES[id];
    return (R.trap && R.trap(a, pos, this)) || pos;
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
    for (const k of ['fl', 'pi', 'pp', 'nf', 'ns', 'sl', 'sp', 'sm', 'kb', 'tr', 'ps', 'pe']) if (x[k]) out[k] = 1;
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
      case 'microwave': add('plasma', SPHERE, MAT.plasma, Math.max(0.4, r * (x.sm ? 3 : 2.2))); break;
      case 'deep-fryer': add('oil', SPHERE, MAT.oil, Math.max(0.28, r * 1.3)); break;
      case 'oven-mitt': add('shield', SPHERE, MAT.shield, Math.max(0.45, r * 2)); add('hex', ICO, MAT.hex, Math.max(0.46, r * 2.02)); break;
      case 'mixer': if (x.mx) {
        const id = x.mx;
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
        m.position.x += Math.cos(a) * (p.radius + 0.3); m.position.z += Math.sin(a) * (p.radius + 0.3); m.position.y += 0.15;
        m.rotation.y += 5 * dt;
      }
    }
    // trails
    p.uTrail = (p.uTrail || 0) - dt;
    if (p.uTrail > 0 || g.fx.scale <= 0) return;
    p.uTrail = isPellet(p) ? 0.09 : 0.045;
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
      case 'popcorn-popper': if (!p.x.pp) P.spray('blobs', p.pos, 1, { speed: 1.5, up: 1.5, colors: [col('#fff3c0')], size: 0.08, life: 0.3, grav: 0.5 }); break;
    }
  }

  end(p) {
    if (!p.uAttach) return;
    for (const m of p.uAttach) { m.visible = false; (this.attachPool[m.userData.kind] ||= []).push(m); }
    p.uAttach = null;
  }

  // The flight ran out or a rolled food came to a stop.
  expire(p) {
    if (!p.u) return;
    RULES[p.u]?.expire?.(p, this);
    if (p.x.pi || p.x.pp) this.game.fx.burst(FX_OF[p.food] || 'dust', p.pos, 0.35); // cut pieces burst instead of vanishing
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
    g.sfx.play('boing', p.pos, isPellet(p) ? 0.2 : 0.5);
    g.fx.spray('blobs', p.pos, isPellet(p) ? 2 : 6, { speed: 4, up: 2, colors: [col('#fff6a8'), col('#ffd23a')], size: 0.08, life: 0.3, grav: 0 });
    if (p.x.fl) { p.selfOk = true; p.selfAfter = p.life + 0.12; } // a ricocheting disc can come back at you
  }

  once(p, key, fn) {
    p.uOnce ||= {};
    if (p.uOnce[key]) return;
    p.uOnce[key] = true;
    fn();
  }

  pop(p) { // Popcorn: the food bursts mid-air into exploding pieces
    const g = this.game;
    p.done = true;
    const pf = PIECE[p.food] || p.food, pel = isPellet(p);
    g.explode(p.pos, 2, pel ? 4 : 8, p.owner, ROOT[p.food] || p.food, pel ? 3 : 5);
    g.fx.burst(FX_OF[p.food] || 'dust', p.pos, pel ? 0.5 : 1);
    g.fx.spray('puffs', p.pos, pel ? 4 : 8, { speed: 5, up: 3, colors: [col('#fff3c0'), col('#ffffff')], size: 0.5, life: 0.4, grav: 0.3, grow: 1.2 });
    g.sfx.play('boom', p.pos, pel ? 0.35 : 0.6);
    const n = pel ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(8, 14);
      g.projectiles.launch({
        food: pf, owner: p.owner, local: true, u: 'popcorn-popper', x: { m: pel ? 0.6 : 0.4, sc: pf !== p.food ? 1 : 0.5, pp: 1, ...(pf === 'pinechunk' && i % 2 ? { sp: 1 } : {}) },
        pos: p.pos.clone(), vel: new THREE.Vector3(Math.cos(a) * s + p.vel.x * 0.3, rand(2, 8), Math.sin(a) * s + p.vel.z * 0.3),
        gravity: 1, radius: pf !== p.food ? FOODS[pf].radius : Math.max(0.12, p.radius * 0.6), life: 1.6, spin: 9, charge: p.charge, orient: pf === p.food && p.orient,
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
  icePatch(pt, owner, dur) {
    const g = this.game;
    this.stampGround(pt, 3.5, 'ice', dur, { visual: 'ice', owner });
    g.fx.burst('ice', pt, 1.2);
    g.sfx.play('freeze', pt, 0.6);
  }
  fireSlick(pt, p) {
    if (this.stampGround(pt, 3, 'slick', 6) === false) return;
    this.addZone('fire', pt, p, 6, 2.8);
    this.game.world.paintSplat(pt.x, pt.y, pt.z, 2.6, 'cheese');
  }
  plasma(pt, p) { // Microwave: the charged orb goes off
    const g = this.game, sm = !!p.x.sm;
    g.explode(pt, sm ? 2.4 : 3.5, sm ? 12 : 22, p.owner, ROOT[p.food] || p.food, sm ? 5 : 9);
    g.fx.burst('fire', pt, sm ? 0.6 : 1.1);
    g.fx.spray('puffs', pt, sm ? 5 : 10, { speed: 4, up: 3, colors: [col('#fff3a8'), col('#ffd23a')], size: sm ? 0.6 : 0.9, life: 0.5, grav: 0, grow: 1.6 });
    g.sfx.play('boom', pt, sm ? 0.45 : 0.8);
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
    if (a.utensil !== 'pan' || !slot) return false;
    const g = this.game, t = g.time, s = a.uState;
    if (t < s.cdUntil) return false;
    if (slot.id === 'cheese') {
      if (a.shieldUp) return false; // lowering the shield works as usual
      a.shieldUp = true; a.shieldBrokenUntil = 0; // up at once, tired or not
      g.sfx.play('shield', a.pos, 0.8);
    } else if (PAN_SPECIAL[slot.id]) PAN_SPECIAL[slot.id](a, g, this);
    else if (food.alt) {
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
    if (a === g.player) g.hud.toast(`Pan slam! ${PAN_SPECIAL[slot.id] ? 'Special fired' : `${food.altName || 'Alt'} fired`}`);
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

  // ------------------------------------------------------------------ delivery boxes
  // Utensils arrive in cardboard delivery boxes that parachute into the kitchen. Walk into a
  // box to open it and take the utensil, or splat it open with food from range: then the
  // utensil lies on the floor for whoever gets there first.
  _deliver(landed) {
    const g = this.game;
    let pos = null;
    for (let k = 0; k < 12 && !pos; k++) {
      const p = g.world.randomOpenSpot(null, 6);
      if (this.boxes.every((b) => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 30)) pos = p;
    }
    if (!pos) return;
    const id = randomUtensilId();
    BOX_GEO ||= new THREE.BoxGeometry(BOX_W, BOX_H, BOX_W);
    const side = boxSide(id), top = boxTop();
    const grp = new THREE.Group();
    const box = new THREE.Mesh(BOX_GEO, [side, side, top, top, side, side]);
    box.castShadow = !!g.quality.dynamicShadows;
    grp.add(box);
    // napkin parachute with four strings
    CHUTE_GEO ||= new THREE.SphereGeometry(2.8, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.6, 1);
    const chute = new THREE.Group();
    chute.add(new THREE.Mesh(CHUTE_GEO, chuteMat()));
    STRING_MAT ||= new THREE.LineBasicMaterial({ color: '#5a4636' });
    const pts = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pts.push(new THREE.Vector3(sx * 2.3, 0.9, sz * 2.3), new THREE.Vector3(sx * BOX_W / 2, -2.6, sz * BOX_W / 2));
    chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), STRING_MAT));
    chute.position.y = BOX_H / 2 + 2.6;
    chute.visible = !landed;
    grp.add(chute);
    // landing ring and a light beam so it can be found across the kitchen
    const color = UTENSIL_BY_ID[id].color;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.set(pos.x, pos.y + 0.08, pos.z);
    BEAM_GEO ||= new THREE.CylinderGeometry(0.45, 1.1, 36, 12, 1, true);
    const beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(pos.x, pos.y + 18, pos.z);
    const y = landed ? pos.y : pos.y + DROP_FROM;
    grp.position.set(pos.x, y + BOX_H / 2, pos.z);
    grp.rotation.y = rand(0, Math.PI * 2);
    g.scene.add(grp, ring, beam);
    this.boxes.push({ id, pos, y, grp, box, chute, ring, beam, falling: !landed, sway: rand(0, 6), wob: rand(1.5, 4), wig: 0 });
    if (!landed && g.player?.alive && g.state !== 'menu') g.hud.toast('A utensil delivery is parachuting in');
  }

  _removeBox(b) {
    this.game.scene.remove(b.grp, b.ring, b.beam);
    b.ring.geometry.dispose(); b.ring.material.dispose(); b.beam.material.dispose();
    b.chute.children[1].geometry.dispose();
  }

  // Open a box: the opener takes the utensil (null: it was splatted open and lands on the floor).
  openBox(b, a = null) {
    const g = this.game, i = this.boxes.indexOf(b);
    if (i < 0) return;
    this.boxes.splice(i, 1);
    this._removeBox(b);
    const c = _c.set(b.pos.x, b.y + BOX_H / 2, b.pos.z);
    g.fx.spray('chunks', c, 18, { speed: 7, up: 6, colors: [col('#c8955a'), col('#a87240'), col('#e8c48a')], size: 0.35, life: 0.9 });
    g.fx.spray('puffs', c, 10, { speed: 4, up: 3, colors: [col(UTENSIL_BY_ID[b.id].color), col('#ffffff')], size: 0.5, life: 0.6, grav: 0.2, grow: 1 });
    g.sfx.play('thud', c, a === g.player ? 1 : 0.5);
    const got = a ? this.give(a, b.id) : false;
    if (got === false) this.drop(b.id, c, a); // splatted open, or the opener already carries one
    else {
      if (got) this.drop(got, a.pos, a); // all slots full: leave the one in hand behind
      g.sfx.play('pickup', c, a === g.player ? 1.1 : 0.4);
    }
  }

  // A thrown food bursts open any box it passes through (the food keeps flying).
  hitBox(from, to, rad) {
    for (const b of this.boxes) {
      _w.set(b.pos.x, b.y + BOX_H / 2, b.pos.z);
      if (segPointDist2(from, to, _w) < (1.5 + rad) ** 2) { this.openBox(b, null); return true; }
    }
    return false;
  }

  _deliveries(dt) {
    const g = this.game, t = g.time;
    if (t >= this.nextDrop && g.state !== 'over') {
      if (this.boxes.length < MAX_BOXES) this._deliver(false);
      this.nextDrop = t + rand(16, 24);
    }
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (b.falling) {
        b.y -= FALL_SPEED * dt;
        const sw = Math.sin(t * 1.7 + b.sway);
        if (b.y <= b.pos.y) {
          b.y = b.pos.y; b.falling = false;
          b.chute.visible = false; b.grp.rotation.x = b.grp.rotation.z = 0;
          g.fx.burst('dust', _w.set(b.pos.x, b.pos.y + 0.2, b.pos.z), 1.3);
          g.sfx.play('thud', _w, 0.8);
        } else { b.grp.rotation.z = sw * 0.14; b.grp.rotation.x = Math.cos(t * 1.3 + b.sway) * 0.1; }
        b.grp.position.set(b.pos.x + (b.falling ? sw * 0.6 : 0), b.y + BOX_H / 2, b.pos.z);
      } else { // something inside wiggles now and then
        b.wob -= dt;
        if (b.wob <= 0) { b.wob = rand(2.5, 5); b.wig = 0.6; }
        if (b.wig > 0) { b.wig = Math.max(0, b.wig - dt); b.box.rotation.z = Math.sin(b.wig * 38) * 0.08 * b.wig; b.box.position.y = Math.abs(Math.sin(b.wig * 19)) * 0.15 * b.wig; }
      }
      b.ring.material.opacity = 0.55 + Math.sin(t * 4 + b.sway) * 0.3;
      b.beam.material.opacity = 0.16 + Math.sin(t * 2 + b.sway) * 0.06;
      for (const a of g.actors) { // walk into it to open it
        if (!a.alive || a.isRemote) continue;
        if (a.isBot && a.utensil) continue; // bots keep the first utensil they find
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        if (dx * dx + dz * dz > 2.4 * 2.4 || Math.abs(a.pos.y + 0.9 - (b.y + BOX_H / 2)) > 2.2) continue;
        this.openBox(b, a);
        break;
      }
    }
  }

  // The closest box or loose utensil a bot could walk to.
  nearestFor(a, maxD) {
    let best = null, bd = maxD;
    for (const b of this.boxes) {
      if (b.falling || Math.abs(b.pos.y - a.pos.y) > 3) continue;
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    for (const it of this.pickups) {
      if (Math.abs(it.pos.y - a.pos.y) > 3) continue;
      const d = Math.hypot(it.pos.x - a.pos.x, it.pos.z - a.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ------------------------------------------------------------------ loose utensils on the floor
  reset() {
    const g = this.game;
    for (const it of this.pickups) g.scene.remove(it.sprite, it.ring);
    this.pickups.length = 0;
    for (const z of this.zones) this._dropZone(z);
    this.zones.length = 0;
    this.pending.length = 0;
    for (const b of this.boxes) this._removeBox(b);
    this.boxes.length = 0;
    for (let i = 0; i < 3; i++) this._deliver(true); // a few boxes are already waiting
    this.nextDrop = g.time + rand(7, 10);
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
    const it = { id, pos: p, sprite, ring, phase: rand(0, 6), noPick: from, noPickUntil: g.time + 4 };
    this.pickups.push(it);
    return it;
  }

  // A knocked-out Titan drops the utensil they carried.
  dropFrom(a) {
    // (online, other players' kits aren't sent: only the one in their hand is known)
    const ids = a.utensils && !a.isRemote ? a.utensils.filter(Boolean) : a.utensil ? [a.utensil] : [];
    ids.forEach((id, i) => {
      const ang = (i / ids.length) * Math.PI * 2 + a.yaw;
      this.drop(id, ids.length > 1 ? _v.set(a.pos.x + Math.sin(ang) * 1.6, a.pos.y, a.pos.z + Math.cos(ang) * 1.6) : a.pos);
    });
    Utensils.emptyKit(a);
  }

  _pickups(dt) {
    const g = this.game, t = g.time;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const bob = Math.sin(t * 2.4 + it.phase) * 0.18;
      it.sprite.position.set(it.pos.x, it.pos.y + 1.7 + bob, it.pos.z);
      it.ring.rotation.y += dt;
      it.ring.material.opacity = 0.6 + Math.sin(t * 4 + it.phase) * 0.3;
      for (const a of g.actors) {
        if (!a.alive || a.isRemote) continue;
        const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z, near = dx * dx + dz * dz <= 2.3 * 2.3 && Math.abs(a.pos.y - it.pos.y) <= 2.2;
        if (a === it.noPick) { // the Titan who left it there must step away first (no swapping back and forth)
          if (near || t < it.noPickUntil) continue;
          it.noPick = null;
        }
        if (!near || a.utensils?.includes(it.id) || a.utensil === it.id) continue;
        if (a.isBot && a.utensil) continue; // bots keep the first utensil they find
        g.scene.remove(it.sprite, it.ring);
        it.ring.geometry.dispose(); it.ring.material.dispose();
        this.pickups.splice(i, 1);
        const old = this.give(a, it.id);
        if (old) this.drop(old, a.pos, a); // all slots full: leave the one in hand behind
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
    this._deliveries(dt);
    this._pickups(dt);
    for (const a of this.game.actors) { // heat cools down, in the hand and in the pocket
      if (!a.utensils) continue;
      for (let i = 0; i < KIT; i++) {
        const id = a.utensils[i], s = a.uStates[i];
        if (!id || !s.heat) continue;
        const h = RULES[id].heat;
        if (h) s.heat = Math.max(0, s.heat - dt / h.decay);
      }
    }
  }
  // visuals that should follow the camera's view of the Titans (call after actor visuals)
  updateVisual() { this._badges(); }
}
