// The six prototype foods (GDD section 6.2): Tomato, Banana (+ Peel), Carrot, Ice Cube,
// Soda Can and Cheese Wheel. Values follow the GDD's Fresh-tier numbers.
import * as THREE from 'three';
import { G, groundHeight, rand, forwardOf } from './core.js';

// ---------------------------------------------------------------------------
// Meshes (shared geometry and materials, one Object3D per use).
const geo = {}, mat = {};
function once(store, k, make) { return store[k] || (store[k] = make()); }

function canLabel() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#d7263d'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#fff6e6';
  x.beginPath(); x.moveTo(0, 90); x.bezierCurveTo(80, 60, 170, 120, 256, 80); x.lineTo(256, 128); x.lineTo(0, 128); x.fill();
  x.font = '900 52px "Bagel Fat One", "Arial Black", sans-serif';
  x.textAlign = 'center'; x.fillText('FIZZ', 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function swissTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffcf40'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) {
    const r = 6 + Math.random() * 14;
    x.fillStyle = '#e6a91c';
    x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f7bd2c';
    x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, r * 0.5, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAKERS = {
  tomato() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(once(geo, 'tomato', () => new THREE.SphereGeometry(0.42, 24, 16).scale(1, 0.86, 1)),
      once(mat, 'tomato', () => new THREE.MeshPhysicalMaterial({ color: '#e0271c', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })));
    const calyx = new THREE.Mesh(once(geo, 'calyx', () => new THREE.ConeGeometry(0.2, 0.12, 5)),
      once(mat, 'leaf', () => new THREE.MeshStandardMaterial({ color: '#3f8f2f', roughness: 0.6 })));
    calyx.position.y = 0.38;
    g.add(body, calyx);
    return g;
  },
  banana() {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 0.25, 0), new THREE.Vector3(-0.3, 0.02, 0), new THREE.Vector3(0, -0.06, 0),
      new THREE.Vector3(0.3, 0.02, 0), new THREE.Vector3(0.55, 0.25, 0),
    ]);
    const body = new THREE.Mesh(once(geo, 'banana', () => {
      const tg = new THREE.TubeGeometry(curve, 24, 0.13, 10, false);
      const pos = tg.attributes.position;
      // taper the ends
      for (let i = 0; i < pos.count; i++) {
        const u = (i / 11 | 0) / 24;
        const taper = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        const p = curve.getPointAt(Math.min(1, u));
        pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * taper, p.y + (pos.getY(i) - p.y) * taper, pos.getZ(i) * taper);
      }
      tg.computeVertexNormals();
      return tg;
    }), once(mat, 'banana', () => new THREE.MeshStandardMaterial({ color: '#ffd93b', roughness: 0.45 })));
    const tip = new THREE.Mesh(once(geo, 'bananaTip', () => new THREE.SphereGeometry(0.06, 8, 6)),
      once(mat, 'bananaTip', () => new THREE.MeshStandardMaterial({ color: '#4a3419', roughness: 0.8 })));
    tip.position.set(0.55, 0.25, 0);
    g.add(body, tip);
    return g;
  },
  peel() {
    const g = new THREE.Group();
    const m = once(mat, 'peel', () => new THREE.MeshStandardMaterial({ color: '#f5cf2f', roughness: 0.5, side: THREE.DoubleSide }));
    const pg = once(geo, 'peel', () => new THREE.SphereGeometry(0.5, 12, 6, 0, 0.9, 0, Math.PI / 2).scale(1, 0.25, 1.6));
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(pg, m);
      p.rotation.y = (i / 4) * Math.PI * 2;
      g.add(p);
    }
    const nub = new THREE.Mesh(once(geo, 'nub', () => new THREE.CylinderGeometry(0.1, 0.14, 0.2, 8)), once(mat, 'bananaTip', () => new THREE.MeshStandardMaterial({ color: '#4a3419' })));
    nub.position.y = 0.12;
    g.add(nub);
    return g;
  },
  carrot() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(once(geo, 'carrot', () => new THREE.ConeGeometry(0.17, 1.3, 14).rotateX(-Math.PI / 2)),
      once(mat, 'carrot', () => new THREE.MeshStandardMaterial({ color: '#ff7f11', roughness: 0.55 })));
    const leafMat = once(mat, 'leaf', () => new THREE.MeshStandardMaterial({ color: '#3f8f2f', roughness: 0.6 }));
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(once(geo, 'cleaf', () => new THREE.ConeGeometry(0.05, 0.45, 4)), leafMat);
      leaf.position.set((i - 1) * 0.06, 0, 0.75);
      leaf.rotation.set(Math.PI / 2 - 0.3 + i * 0.2, 0, (i - 1) * 0.4);
      g.add(leaf);
    }
    g.add(body);
    return g;
  },
  ice() {
    return new THREE.Mesh(once(geo, 'ice', () => {
      const b = new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2);
      const p = b.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { // round the corners a bit
        v.fromBufferAttribute(p, i);
        v.lerp(v.clone().normalize().multiplyScalar(0.42), 0.35);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      b.computeVertexNormals();
      return b;
    }), once(mat, 'ice', () => new THREE.MeshPhysicalMaterial({
      color: '#dff4ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.78, clearcoat: 1, ior: 1.31, emissive: '#1b3a4a', emissiveIntensity: 0.3,
    })));
  },
  soda() {
    const g = new THREE.Group();
    const label = once(mat, 'can', () => new THREE.MeshStandardMaterial({ map: canLabel(), metalness: 0.6, roughness: 0.28 }));
    const alu = once(mat, 'alu', () => new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.2 }));
    const body = new THREE.Mesh(once(geo, 'can', () => new THREE.CylinderGeometry(0.26, 0.26, 0.66, 24, 1, true)), label);
    const top = new THREE.Mesh(once(geo, 'canTop', () => new THREE.CylinderGeometry(0.22, 0.26, 0.08, 24)), alu);
    top.position.y = 0.37;
    const bot = new THREE.Mesh(once(geo, 'canBot', () => new THREE.CylinderGeometry(0.26, 0.22, 0.06, 24)), alu);
    bot.position.y = -0.36;
    g.add(body, top, bot);
    return g;
  },
  cheese() {
    const side = once(mat, 'cheeseRind', () => new THREE.MeshStandardMaterial({ color: '#f2b52a', roughness: 0.6 }));
    const face = once(mat, 'cheeseFace', () => new THREE.MeshStandardMaterial({ map: swissTex(), roughness: 0.55 }));
    const m = new THREE.Mesh(once(geo, 'cheese', () => new THREE.CylinderGeometry(0.75, 0.75, 0.46, 32)), [side, face, face]);
    return m;
  },
};

// ---------------------------------------------------------------------------
const UP_BIAS = new THREE.Vector3(0, 0.1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Launch speed for a charge fraction c (0..1). Shared with the aim-preview arc.
export function lobSpeed(id, c) {
  const f = FOODS[id];
  return id === 'soda' ? f.speed * (0.75 + 0.25 * c) : f.speed * (0.6 + 0.4 * c);
}

export function lobDir(actor, out = new THREE.Vector3()) {
  out.copy(actor.aimDir);
  if (!actor.isBot) out.add(UP_BIAS).normalize();
  return out;
}

function lobVel(actor, speed) {
  return lobDir(actor).multiplyScalar(speed);
}

function stampAtGround(game, p, radius, state, dur, opts) {
  const gy = groundHeight(p.x, p.z, p.y + 0.5);
  if (p.y - gy > 2.5) return false;
  game.surface.stamp(p.x, gy, p.z, radius, state, dur, game.time, opts);
  return gy;
}

export const FOODS = {
  tomato: {
    name: 'Tomato', role: 'Splash · slows', maxStack: 4, give: 2, weight: 26,
    profile: 'lob', charge: 0.4, speed: 30, recovery: 0.55, radius: 0.4, dmg: 25, verb: "tomato'd",
    hint: 'Hold to power up, release to lob. Victims drip a slick trail.',
    release(a, c, game) {
      game.projectiles.launch({ food: 'tomato', owner: a, pos: a.handPos(), vel: lobVel(a, lobSpeed('tomato', c)), spin: 8 });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      const pt = hit.point;
      if (hit.actor) {
        game.damage(hit.actor, 25, p.owner, 'tomato');
        hit.actor.addSticky(0.2, 3); hit.actor.juice(5);
      }
      game.splash(pt, 2.5, 10, p.owner, 'tomato', {
        exclude: hit.actor || hit.blockedBy,
        onHit: (act) => { if (act !== p.owner) { act.addSticky(0.2, 3); act.juice(3); } },
      });
      game.world.paintSplat(pt.x, pt.y, pt.z, 2.4, 'tomato');
      stampAtGround(game, pt, 1.8, 'slick', 5);
      if (game.world.onBurner(pt)) game.sfx.play('sizzle', pt);
      game.fx.burst('tomato', pt);
      game.sfx.play('splat', pt);
      return true;
    },
  },

  banana: {
    name: 'Banana', role: 'Boomerang · heal', maxStack: 2, give: 1, weight: 18,
    profile: 'return', charge: 0, speed: 28, recovery: 0.7, radius: 0.4, pierce: true, verb: 'boomeranged',
    altLabel: 'Eat: +15 HP, keep the peel',
    hint: 'Curves out and comes back. Catch it to throw again (it bruises: 3 throws max).',
    release(a, c, game) {
      const dir = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, a.handPos()).normalize().clone();
      dir.y = Math.max(-0.08, Math.min(0.25, dir.y)); // boomerangs fly flat
      dir.normalize();
      const curve = a.isBot ? (a.bananaCurve || 1.3) : 1.3;
      const slot = a.selected();
      const bruise = (slot && slot.bruise) || 0;
      game.projectiles.launch({ food: 'banana', owner: a, pos: a.handPos(), vel: dir.multiplyScalar(this.speed), gravity: 0, life: 3.4, curve, spin: 14, bruise });
      a.consume(1);
      game.sfx.play('whirr', a.pos);
    },
    impact(p, hit, game) {
      if (hit.actor) {
        const out = p.phase === 'out';
        game.damage(hit.actor, out ? 22 : 12, p.owner, 'banana');
        hit.actor.knock(_v2.copy(p.vel).setY(0).normalize().multiplyScalar(4).setY(2));
        game.fx.burst('banana', hit.point);
        game.sfx.play('thud', hit.point, 0.8);
        return false; // keeps flying
      }
      if (hit.world && hit.top) { // skim off floors and tabletops instead of stopping
        p.pos.y = hit.point.y + 0.5;
        p.vel.y = Math.abs(p.vel.y) * 0.4 + 1;
        return false;
      }
      // hit a wall: drop to the ground as a pickup anyone can grab
      game.items.drop('banana', 1, hit.point);
      game.sfx.play('thud', hit.point, 0.6);
      return true;
    },
    alt(a, game) {
      a.startEat(1.0, () => {
        a.heal(15);
        a.consume(1);
        a.give('peel', 1);
        game.sfx.play('eat', a.pos);
      });
    },
  },

  peel: {
    name: 'Banana Peel', role: 'Trip trap', maxStack: 2, give: 1, weight: 0,
    profile: 'place', charge: 0, recovery: 0.4, verb: 'slipped up',
    hint: 'Click to drop it at your feet. Enemies who step on it slip.',
    release(a, c, game) {
      const f = forwardOf(a.yaw, _v);
      const pos = a.pos.clone().addScaledVector(f, 1.6);
      pos.y = groundHeight(pos.x, pos.z, a.pos.y + 0.6);
      game.items.addTrap(a, pos);
      a.consume(1);
      game.sfx.play('thud', pos, 0.4);
    },
  },

  carrot: {
    name: 'Carrot', role: 'Sniper', maxStack: 4, give: 2, weight: 14,
    profile: 'line', charge: 1.0, speed: 120, recovery: 0.9, radius: 0.18, verb: 'sniped',
    hint: 'Hold to zoom and charge. Face hits deal x1.75. Your glint gives you away.',
    release(a, c, game) {
      const from = a.handPos();
      const dir = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, from).normalize().clone();
      const speed = this.speed * (0.45 + 0.55 * c);
      game.projectiles.launch({ food: 'carrot', owner: a, pos: from, vel: dir.multiplyScalar(speed), gravity: 0.3, radius: 0.18, charge: c, orient: true, life: 4 });
      a.consume(1);
      game.sfx.play('throw', a.pos, 1.2);
    },
    impact(p, hit, game) {
      if (hit.actor) {
        const dmg = Math.round(55 * (0.6 + 0.4 * p.charge) * (hit.head ? 1.75 : 1));
        game.damage(hit.actor, dmg, p.owner, 'carrot', { head: hit.head });
        game.fx.burst('carrot', hit.point);
        game.sfx.play('crunch', hit.point);
        return true;
      }
      game.fx.burst('carrot', hit.point);
      game.sfx.play('crunch', hit.point, 0.6);
      if (hit.world) {
        game.items.stickDecor(p, 3);
        p.keepMesh = true;
      }
      return true;
    },
  },

  ice: {
    name: 'Ice Cube', role: 'Freeze · rink', maxStack: 3, give: 2, weight: 15,
    profile: 'lob', charge: 0.3, speed: 26, recovery: 0.6, radius: 0.35, verb: 'iced',
    hint: 'Direct hit freezes (longer if Wet). Ground hit makes an ice rink.',
    release(a, c, game) {
      game.projectiles.launch({ food: 'ice', owner: a, pos: a.handPos(), vel: lobVel(a, lobSpeed('ice', c)), spin: 6 });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      const pt = hit.point;
      game.fx.burst('ice', pt);
      if (hit.actor) {
        game.damage(hit.actor, 10, p.owner, 'ice');
        if (hit.actor.alive) {
          const dur = hit.actor.isWet() ? 1.8 : 1.2;
          if (hit.actor.applyHardCC('frozen', dur)) game.sfx.play('freeze', pt);
        }
        return true;
      }
      if (game.world.onBurner(pt)) { // Fire + Ice = steam
        game.fx.burst('steam', pt);
        game.sfx.play('sizzle', pt, 1.3);
        return true;
      }
      if (hit.world && hit.top) {
        stampAtGround(game, pt, 6, 'ice', 8, { visual: 'ice', owner: p.owner });
      }
      game.sfx.play('shatter', pt, 0.7);
      return true;
    },
  },

  soda: {
    name: 'Soda Can', role: 'Blast · rocket jump', maxStack: 2, give: 1, weight: 14,
    profile: 'lob', charge: 1.5, speed: 24, recovery: 0.7, radius: 0.3, verb: 'fizzed',
    altLabel: 'Fizz Jump: pop it underfoot',
    hint: 'Hold to shake: a longer shake means a bigger blast. Blasts knock you back too.',
    release(a, c, game) {
      game.projectiles.launch({ food: 'soda', owner: a, pos: a.handPos(), vel: lobVel(a, lobSpeed('soda', c)), spin: 10, charge: c });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      const pt = hit.point, c = p.charge;
      const dmg = 20 + 20 * c, r = 3 + 1.5 * c, force = 12 + 8 * c;
      game.explode(pt, r, dmg, p.owner, 'soda', force, hit.actor);
      stampAtGround(game, pt, 4, 'sticky', 6, { slow: 0.3, visual: 'soda' });
      game.world.paintSplat(pt.x, pt.y, pt.z, 3.2, 'soda');
      game.fx.burst('soda', pt, 0.8 + 0.5 * c);
      game.sfx.play('boom', pt, 0.8 + 0.4 * c);
      game.sfx.play('fizz', pt);
      return true;
    },
    alt(a, game) {
      const f = forwardOf(a.yaw, _v);
      a.vel.x = f.x * 11; a.vel.z = f.z * 11; a.vel.y = 21;
      a.onGround = false;
      a.knockUntil = game.time + 0.6;
      a.consume(1);
      game.fx.burst('geyser', a.pos);
      game.sfx.play('fizz', a.pos, 1.4);
      game.sfx.play('boom', a.pos, 0.5);
      stampAtGround(game, a.pos, 3, 'sticky', 5, { slow: 0.3, visual: 'soda' });
    },
  },

  cheese: {
    name: 'Cheese Wheel', role: 'Shield · ram', maxStack: 1, give: 1, weight: 13, heavy: true,
    profile: 'roll', charge: 0, speed: 22, recovery: 0.8, radius: 0.75, pierce: true, verb: 'rolled over',
    altLabel: 'Raise or lower the 300 HP shield',
    hint: 'Right-click to push it as a shield. Click to launch it as a rolling ram.',
    release(a, c, game) {
      const d = a.aimDir.clone().setY(0);
      if (d.lengthSq() < 1e-4) forwardOf(a.yaw, d);
      d.normalize();
      const pos = a.pos.clone().addScaledVector(d, 1.4);
      pos.y += 0.8;
      game.projectiles.launch({ food: 'cheese', owner: a, pos, vel: d.multiplyScalar(this.speed).setY(1), gravity: 1, radius: 0.75, life: 7, roll: true });
      a.shieldUp = false;
      a.consume(1);
      game.sfx.play('thud', a.pos);
    },
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 40, p.owner, 'cheese');
        const k = _v2.copy(p.vel).setY(0).normalize().multiplyScalar(14).setY(6);
        hit.actor.knock(k);
        game.fx.burst('cheese', hit.point, 0.6);
        game.sfx.play('thud', hit.point, 1.3);
        return false;
      }
      return false;
    },
    expire(p, game) {
      game.fx.burst('cheese', p.pos, 1);
      stampAtGround(game, p.pos, 2.5, 'sticky', 4, { slow: 0.35, visual: 'melt' });
      game.world.paintSplat(p.pos.x, p.pos.y - 0.75, p.pos.z, 2, 'cheese');
      game.sfx.play('thud', p.pos, 0.6);
    },
    alt(a, game) {
      a.shieldUp = !a.shieldUp;
      game.sfx.play('shield', a.pos, 0.6);
    },
  },
};

export const FOOD_IDS = ['tomato', 'banana', 'carrot', 'ice', 'soda', 'cheese'];

export function makeFoodMesh(id) {
  const m = MAKERS[id]();
  m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return m;
}

export function randomFoodId() {
  let total = 0;
  for (const id of FOOD_IDS) total += FOODS[id].weight;
  let r = rand(0, total);
  for (const id of FOOD_IDS) { r -= FOODS[id].weight; if (r <= 0) return id; }
  return 'tomato';
}

export const FEED_VERB = {
  tomato: "tomato'd", banana: 'boomeranged', peel: 'slipped up', carrot: 'sniped', ice: 'iced',
  soda: 'fizzed', cheese: 'rolled over', landmark: 'buried',
};
