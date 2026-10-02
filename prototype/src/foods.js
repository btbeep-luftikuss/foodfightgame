// The six prototype foods (GDD section 6.2): Tomato, Banana (+ Peel), Carrot, Ice Cube,
// Soda Can and Cheese Wheel. Values follow the GDD's Fresh-tier numbers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  grapes() {
    const g = new THREE.Group();
    const gm = once(mat, 'grape', () => new THREE.MeshPhysicalMaterial({ color: '#6b2a86', roughness: 0.3, clearcoat: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#c9a4e0') }));
    const gg = once(geo, 'grape', () => new THREE.SphereGeometry(0.16, 12, 10));
    const rows = [[0.35, 1], [0.2, 3], [0.03, 4], [-0.14, 3], [-0.3, 2], [-0.44, 1]];
    for (const [y, n] of rows) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + y * 3, r = n > 1 ? 0.07 + n * 0.035 : 0;
        const s = new THREE.Mesh(gg, gm);
        s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        g.add(s);
      }
    }
    const stem = new THREE.Mesh(once(geo, 'stem', () => new THREE.CylinderGeometry(0.025, 0.035, 0.25, 6)), once(mat, 'stem', () => new THREE.MeshStandardMaterial({ color: '#5a4a1a', roughness: 0.8 })));
    stem.position.y = 0.55;
    g.add(stem);
    return g;
  },
  grape() {
    return new THREE.Mesh(once(geo, 'grape', () => new THREE.SphereGeometry(0.16, 12, 10)),
      once(mat, 'grape', () => new THREE.MeshPhysicalMaterial({ color: '#6b2a86', roughness: 0.3, clearcoat: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#c9a4e0') })));
  },
  chili() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(once(geo, 'chili', () => {
      const c = new THREE.ConeGeometry(0.15, 0.85, 14, 6).rotateX(-Math.PI / 2);
      const p = c.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setY(i, p.getY(i) - 0.25 * (z + 0.42) ** 2); } // curl the tip
      c.computeVertexNormals();
      return c;
    }), once(mat, 'chili', () => new THREE.MeshPhysicalMaterial({ color: '#d4140e', roughness: 0.22, clearcoat: 1 })));
    const cap = new THREE.Mesh(once(geo, 'chiliCap', () => new THREE.CylinderGeometry(0.1, 0.16, 0.12, 8).rotateX(Math.PI / 2)), once(mat, 'leaf', () => new THREE.MeshStandardMaterial({ color: '#3f8f2f', roughness: 0.6 })));
    cap.position.z = 0.45;
    g.add(body, cap);
    return g;
  },
  cookie() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(once(geo, 'cookie', () => new THREE.CylinderGeometry(0.45, 0.42, 0.14, 24)), once(mat, 'cookie', () => new THREE.MeshStandardMaterial({ color: '#c98b45', roughness: 0.85 })));
    g.add(body);
    const chipG = once(geo, 'chip', () => new THREE.SphereGeometry(0.06, 6, 5)), chipM = once(mat, 'chip', () => new THREE.MeshStandardMaterial({ color: '#3b2112', roughness: 0.5 }));
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = 0.1 + (i % 3) * 0.1;
      const c = new THREE.Mesh(chipG, chipM);
      c.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
      g.add(c);
    }
    return g;
  },
  watermelon() {
    return new THREE.Mesh(once(geo, 'melon', () => new THREE.SphereGeometry(0.8, 32, 20).scale(1, 0.88, 1.12)), once(mat, 'melon', () => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#3f8f3a'; x.fillRect(0, 0, 256, 128);
      x.fillStyle = '#1f5a24';
      for (let i = 0; i < 12; i++) { x.beginPath(); for (let y = 0; y <= 128; y += 8) x.lineTo(i * 21.3 + Math.sin(y * 0.2 + i) * 4, y); x.lineTo(i * 21.3 + 9, 128); x.lineTo(i * 21.3 + 9, 0); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.35, clearcoat: 0.7 });
    }));
  },
  melonchunk() {
    const g = new THREE.Group();
    const flesh = new THREE.Mesh(once(geo, 'chunk', () => new THREE.CylinderGeometry(0.45, 0.45, 0.22, 12, 1, false, 0, Math.PI * 0.7)), [
      once(mat, 'rind', () => new THREE.MeshStandardMaterial({ color: '#2f7a30', roughness: 0.5 })),
      once(mat, 'pinkflesh', () => new THREE.MeshStandardMaterial({ color: '#f25a6a', roughness: 0.4 })),
      once(mat, 'pinkflesh', () => new THREE.MeshStandardMaterial({ color: '#f25a6a', roughness: 0.4 })),
    ]);
    g.add(flesh);
    return g;
  },
  // pieces that utensils cut whole foods into (Knife, Spoon, Grater, Blender, Popcorn Popper)
  cheesechunk() { // a little wedge of Swiss
    const side = once(mat, 'cheeseRind', () => new THREE.MeshStandardMaterial({ color: '#f2b52a', roughness: 0.6 }));
    const face = once(mat, 'cheeseFace', () => new THREE.MeshStandardMaterial({ map: swissTex(), roughness: 0.55 }));
    return new THREE.Mesh(once(geo, 'cheeseChunk', () => new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10, 1, false, 0, Math.PI * 0.45)), [side, face, face]);
  },
  bananaslice() { // a coin of banana with a yellow rim
    return new THREE.Mesh(once(geo, 'bananaSlice', () => new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16)), [
      once(mat, 'banana', () => new THREE.MeshStandardMaterial({ color: '#ffd93b', roughness: 0.45 })),
      once(mat, 'bananaFlesh', () => new THREE.MeshStandardMaterial({ color: '#fff1bf', roughness: 0.5 })),
      once(mat, 'bananaFlesh', () => new THREE.MeshStandardMaterial({ color: '#fff1bf', roughness: 0.5 })),
    ]);
  },
  pinechunk() { // a juicy pineapple chunk
    return new THREE.Mesh(once(geo, 'pineChunk', () => new THREE.BoxGeometry(0.36, 0.3, 0.3)),
      once(mat, 'pineFlesh', () => new THREE.MeshPhysicalMaterial({ color: '#ffd23a', roughness: 0.3, clearcoat: 0.6, emissive: '#5a3a00', emissiveIntensity: 0.15 })));
  },
  pineapple() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(once(geo, 'pine', () => new THREE.SphereGeometry(0.38, 16, 12).scale(1, 1.35, 1)), once(mat, 'pine', () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#d99a1e'; x.fillRect(0, 0, 128, 128);
      x.strokeStyle = '#8a5a10'; x.lineWidth = 3;
      for (let i = -128; i < 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 0); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    }));
    g.add(body);
    const leafM = once(mat, 'pineleaf', () => new THREE.MeshStandardMaterial({ color: '#4f9a3a', roughness: 0.6 }));
    const leafG = once(geo, 'pineleaf', () => new THREE.ConeGeometry(0.07, 0.5, 4));
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(leafG, leafM);
      const a = (i / 7) * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.06, 0.62, Math.sin(a) * 0.06);
      l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(l);
    }
    return g;
  },
  blueberry() { // a handful of blueberries
    const g = new THREE.Group();
    const bm = once(mat, 'berry', () => new THREE.MeshPhysicalMaterial({ color: '#3b4ea8', roughness: 0.35, sheen: 0.8, sheenColor: new THREE.Color('#aab8f0'), clearcoat: 0.3 }));
    const bg = once(geo, 'berryBig', () => new THREE.SphereGeometry(0.17, 12, 10));
    for (const [x, y, z] of [[0, 0, 0], [0.3, 0, 0.05], [-0.28, 0.02, 0.1], [0.05, 0.02, 0.3], [0.1, 0.26, 0.12], [-0.12, 0.02, -0.26]]) {
      const b = new THREE.Mesh(bg, bm); b.position.set(x, y, z); g.add(b);
    }
    return g;
  },
  berry() { // one blueberry in flight
    const g = new THREE.Group();
    g.add(new THREE.Mesh(once(geo, 'berry', () => new THREE.SphereGeometry(0.13, 10, 8)),
      once(mat, 'berry', () => new THREE.MeshPhysicalMaterial({ color: '#3b4ea8', roughness: 0.35, sheen: 0.8, sheenColor: new THREE.Color('#aab8f0'), clearcoat: 0.3 }))));
    const crown = new THREE.Mesh(once(geo, 'crown', () => new THREE.ConeGeometry(0.05, 0.05, 5)), once(mat, 'crown', () => new THREE.MeshStandardMaterial({ color: '#1d2340' })));
    crown.position.y = 0.13; crown.rotation.x = Math.PI;
    g.add(crown);
    return g;
  },
  jelly() {
    return new THREE.Mesh(once(geo, 'jelly', () => {
      const b = new THREE.BoxGeometry(0.62, 0.62, 0.62, 3, 3, 3);
      const p = b.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.lerp(v.clone().normalize().multiplyScalar(0.44), 0.4); p.setXYZ(i, v.x, v.y, v.z); }
      b.computeVertexNormals();
      return b;
    }), once(mat, 'jelly', () => new THREE.MeshPhysicalMaterial({ color: '#5fd35a', roughness: 0.08, transparent: true, opacity: 0.8, clearcoat: 1, emissive: '#1d5a18', emissiveIntensity: 0.35 })));
  },
};

// ---------------------------------------------------------------------------
const UP_BIAS = new THREE.Vector3(0, 0.1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Launch speed for a charge fraction c (0..1). Shared with the aim-preview arc.
export function lobSpeed(id, c) {
  const f = FOODS[id];
  return id === 'soda' ? f.speed * (0.75 + 0.25 * c) : f.speed * (0.6 + 0.4 * c); // tomato, ice, jelly, pineapple
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
    name: 'Tomato', role: 'Splash · slows', maxStack: 4, give: 2, weight: 42,
    profile: 'lob', charge: 0.25, speed: 30, recovery: 0.22, radius: 0.4, dmg: 25, verb: "tomato'd",
    hint: 'Hold to power up, release to lob. Victims drip a slick trail.',
    altName: 'Tomato Bounce', altLabel: 'Tomato Bounce: squish it underfoot for a super jump (uses 1, 5 s)', altCd: 5,
    alt(a, game) {
      a.vel.y = 20; a.onGround = false; a.gliding = false;
      a.consume(1);
      game.fx.burst('tomato', a.pos, 0.6);
      game.sfx.play('splat', a.pos, 0.8);
    },
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
      game.splash(pt, 4, 10, p.owner, 'tomato', {
        exclude: hit.actor || hit.blockedBy,
        onHit: (act) => { if (act !== p.owner) { act.addSticky(0.2, 3); act.juice(3); } },
      });
      game.world.paintSplat(pt.x, pt.y, pt.z, 4.2, 'tomato'); // big juicy splat
      stampAtGround(game, pt, 3, 'slick', 5);
      if (game.world.onBurner(pt)) game.sfx.play('sizzle', pt);
      game.fx.burst('tomato', pt, 1.5);
      game.sfx.play('splat', pt);
      return true;
    },
  },

  banana: {
    name: 'Banana', role: 'Boomerang · heal', maxStack: 2, give: 1, weight: 18,
    profile: 'return', charge: 0, speed: 28, recovery: 0.7, radius: 0.4, pierce: true, verb: 'boomeranged',
    altLabel: 'Eat: +30 HP, keep the peel',
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
        a.heal(30);
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
      let pos = a.pos.clone().addScaledVector(f, 1.6);
      pos.y = groundHeight(pos.x, pos.z, a.pos.y + 0.6);
      pos = game.utensils?.trap(a, pos) || pos; // a utensil may throw it further or add a zone
      game.items.addTrap(a, pos);
      a.consume(1);
      game.sfx.play('thud', pos, 0.4);
    },
  },

  carrot: {
    name: 'Carrot', role: 'Sniper', maxStack: 4, give: 2, weight: 28,
    profile: 'line', charge: 1.6, speed: 210, recovery: 0.9, radius: 0.18, verb: 'sniped',
    hint: 'Hold to zoom and charge. Face hits deal x1.75. Your glint gives you away.',
    altName: 'Pole Vault', altLabel: 'Pole Vault: leap forward (uses 1, 4 s)', altCd: 4,
    alt(a, game) {
      const f = forwardOf(a.yaw, _v);
      a.vel.x = f.x * 17; a.vel.z = f.z * 17; a.vel.y = 15;
      a.onGround = false;
      a.consume(1);
      game.fx.burst('dust', a.pos);
      game.sfx.play('boing', a.pos, 0.7);
    },
    release(a, c, game) {
      const from = a.handPos();
      const dir = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, from).normalize().clone();
      const speed = this.speed * (0.28 + 0.72 * c * c); // a full charge is much faster than a quick flick
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
    profile: 'lob', charge: 0.2, speed: 26, recovery: 0.3, radius: 0.35, verb: 'iced',
    hint: 'Direct hit freezes (longer if Wet). Ground hit makes an ice rink.',
    altName: 'Chill Out', altLabel: 'Chill Out: shake off burning, sticky and slows (uses 1, 6 s)', altCd: 6,
    alt(a, game) {
      a.sticky.length = 0; a.burnUntil = 0; a.surfaceSlowUntil = 0; a.juicedUntil = 0;
      a.consume(1);
      game.fx.burst('ice', a.center(_v));
      game.sfx.play('freeze', a.pos, 0.5);
      if (!a.isBot) game.hud.toast('Chilled out');
    },
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
    profile: 'lob', charge: 1.2, speed: 24, recovery: 0.35, radius: 0.3, verb: 'fizzed',
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
      stampAtGround(game, pt, 5.5, 'sticky', 6, { slow: 0.3, visual: 'soda' });
      game.world.paintSplat(pt.x, pt.y, pt.z, 5, 'soda');
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
    shieldHp: 150, shieldCost: 25,
    altLabel: 'Raise the 150 HP shield (25 stamina) or lower it',
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
      if (a.shieldUp) { a.shieldUp = false; game.sfx.play('shield', a.pos, 0.4); return; }
      if (game.time < a.shieldBrokenUntil) { // a melted shield needs a moment before the next one goes up
        if (!a.isBot) game.hud.toast(`Shield ready in ${Math.ceil(a.shieldBrokenUntil - game.time)} s`);
        return;
      }
      if (!a.spendStamina(this.shieldCost)) { if (!a.isBot) game.hud.toast('Too tired to raise the shield'); return; }
      a.shieldUp = true;
      game.sfx.play('shield', a.pos, 0.6);
    },
  },
  // ---------------------------------------------------------------- added in prototype 0.6
  blueberry: {
    name: 'Blueberries', role: 'Rapid fire', maxStack: 240, give: 40, weight: 26,
    profile: 'auto', auto: true, charge: 0, speed: 75, gravity: 0.25, recovery: 1 / 12, radius: 0.13, dmg: 5, verb: 'berry-blasted',
    hint: 'Hold to fire about 12 berries a second. Aim drifts the longer you hold, so fire in bursts.',
    ammo: () => rollAmmo() * 6, // they come by the handful: 24-90 berries per pickup
    release(a, c, game) {
      const from = a.handPos();
      const dir = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, from).normalize().clone();
      // spray grows while the trigger is held and settles when you let go
      const t = game.time;
      a.berryHeat = Math.min(1, Math.max(0, (a.berryHeat || 0) - (t - (a.berryLast || 0)) * 2) + 0.12);
      a.berryLast = t;
      const s = 0.012 + 0.05 * a.berryHeat;
      dir.x += rand(-s, s); dir.y += rand(-s, s); dir.z += rand(-s, s);
      dir.normalize();
      game.projectiles.launch({ food: 'berry', owner: a, pos: from, vel: dir.multiplyScalar(this.speed), gravity: 0.25, radius: 0.13, life: 2.5, orient: false, spin: 12 });
      a.consume(1);
      if (Math.random() < 0.5) game.sfx.play('berry', a.pos, a === game.player ? 0.6 : 0.4);
    },
  },
  berry: { // one blueberry in flight (not a pickup)
    name: 'Blueberry', hidden: true, profile: 'line', radius: 0.13, dmg: 5, verb: 'berry-blasted',
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 5, p.owner, 'blueberry', { head: hit.head });
        game.fx.burst('berry', hit.point, 0.5);
        return true;
      }
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 0.5, 'berry');
      game.fx.burst('berry', hit.point, 0.3);
      return true;
    },
  },

  // ---------------------------------------------------------------- added in prototype 0.2
  grapes: {
    name: 'Grapes', role: 'Scatter shot · snack', maxStack: 2, give: 1, weight: 10,
    profile: 'spray', charge: 0, speed: 45, gravity: 0.6, recovery: 0.4, radius: 0.16, dmg: 7, verb: 'grape-shot',
    altLabel: 'Eat the bunch: +40 HP',
    hint: 'Fires 8 bouncing grapes in a cone. Deadly up close.',
    release(a, c, game) {
      const from = a.handPos();
      const base = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, from).normalize().clone();
      for (let i = 0; i < 8; i++) {
        const d = base.clone();
        d.x += rand(-0.1, 0.1); d.y += rand(-0.07, 0.07); d.z += rand(-0.1, 0.1);
        d.normalize().multiplyScalar(this.speed * rand(0.9, 1.05));
        game.projectiles.launch({ food: 'grape', owner: a, pos: from, vel: d, gravity: 0.6, radius: 0.16, life: 2, bounces: 1, spin: 6 });
      }
      a.consume(1);
      game.sfx.play('throw', a.pos, 1.1);
    },
    alt(a, game) {
      a.startEat(1.0, () => { a.heal(40); a.consume(1); game.sfx.play('eat', a.pos); });
    },
  },
  grape: { // a single grape pellet (not a pickup)
    name: 'Grape', hidden: true, profile: 'spray', radius: 0.16, dmg: 7, verb: 'grape-shot',
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 7, p.owner, 'grapes');
        if (hit.actor.slowAmount() < 0.3) hit.actor.addSticky(0.1, 1.5); // grape splats stack to 30%
        game.fx.burst('grape', hit.point, 0.4);
        game.sfx.play('hit', hit.point, 0.3);
        return true;
      }
      if (hit.world && hit.top && p.bounces > 0) {
        p.bounces--;
        p.pos.y = hit.point.y + 0.2;
        p.vel.y = Math.abs(p.vel.y) * 0.5 + 2; p.vel.x *= 0.7; p.vel.z *= 0.7;
        return false;
      }
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 1.1, 'grape');
      game.fx.burst('grape', hit.point, 0.3);
      return true;
    },
  },

  chili: {
    name: 'Chili Pepper', role: 'Homing · burn', maxStack: 3, give: 2, weight: 9,
    profile: 'seek', charge: 0, speed: 32, recovery: 1.8, radius: 0.25, dmg: 15, verb: 'torched',
    hint: 'Locks onto the Titan nearest your crosshair and sets them on fire. Water puts it out.',
    altName: 'Hot Feet', altLabel: 'Hot Feet: run 35% faster for 4 s (uses 1, 12 s)', altCd: 12,
    alt(a, game) {
      a.speedBoost(4);
      a.consume(1);
      game.fx.burst('fire', a.pos, 0.5);
      game.sfx.play('sizzle', a.pos, 0.7);
    },
    release(a, c, game) {
      const target = a.isBot ? a.botTarget : game.lockTarget(a);
      const dir = a.isBot ? a.aimDir.clone() : _v.subVectors(a.aimPoint, a.handPos()).normalize().clone();
      game.projectiles.launch({ food: 'chili', owner: a, pos: a.handPos(), vel: dir.multiplyScalar(this.speed), gravity: 0, life: 3, orient: true, seek: target || null, turn: 1.5 });
      a.consume(1);
      game.sfx.play('whirr', a.pos);
    },
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 15, p.owner, 'chili');
        hit.actor.burn(4);
        game.sfx.play('sizzle', hit.point);
      }
      game.fx.burst('fire', hit.point);
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 1.2, 'chili');
      return true;
    },
  },

  cookie: {
    name: 'Cookie', role: 'Auto-seeker', maxStack: 3, give: 2, weight: 9,
    profile: 'seek', charge: 0, speed: 18, recovery: 1.1, radius: 0.4, dmg: 18, verb: 'cookied',
    hint: 'Hunts the nearest enemy on its own. Any food thrown at it knocks it out of the air.',
    altName: 'Sugar Rush', altLabel: 'Sugar Rush: refill your stamina (uses 1, 12 s)', altCd: 12,
    alt(a, game) {
      a.stamina = 100; a.staminaFlash = 0;
      a.consume(1);
      game.fx.burst('crumb', a.center(_v));
      game.sfx.play('crunch', a.pos, 0.8);
      if (!a.isBot) game.hud.toast('Sugar rush: stamina full');
    },
    release(a, c, game) {
      const mine = game.projectiles.list.filter((p) => p.food === 'cookie' && p.owner === a && !p.done);
      if (mine.length >= 2) { mine[0].done = true; game.fx.burst('crumb', mine[0].pos); } // max 2 cookies in the air
      const dir = a.aimDir.clone(); dir.y = Math.max(dir.y, 0.15); dir.normalize();
      game.projectiles.launch({ food: 'cookie', owner: a, pos: a.handPos(), vel: dir.multiplyScalar(this.speed), gravity: 0, life: 12, spin: 5, seek: game.nearestEnemy(a, 30), turn: 1.6, retarget: 30, shootable: true });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      if (hit.actor) game.damage(hit.actor, 18, p.owner, 'cookie');
      stampAtGround(game, hit.point, 3, 'sticky', 4, { slow: 0.2, visual: 'crumbs' });
      game.fx.burst('crumb', hit.point);
      game.sfx.play('crunch', hit.point);
      return true;
    },
  },

  watermelon: {
    name: 'Watermelon', role: 'Heavy rolling bomb', maxStack: 1, give: 1, weight: 6, heavy: true,
    profile: 'roll', charge: 0, speed: 19, recovery: 1.0, radius: 0.8, pierce: true, dmg: 50, verb: 'flattened',
    hint: 'Heavy to carry. Roll it at Titans: it crushes them and bursts into bouncing chunks.',
    release(a, c, game) {
      const d = a.aimDir.clone().setY(0);
      if (d.lengthSq() < 1e-4) forwardOf(a.yaw, d);
      d.normalize();
      const pos = a.pos.clone().addScaledVector(d, 1.6); pos.y += 0.9;
      game.projectiles.launch({ food: 'watermelon', owner: a, pos, vel: d.multiplyScalar(this.speed).setY(1), gravity: 1, radius: 0.8, life: 7, roll: true });
      a.consume(1);
      game.sfx.play('thud', a.pos, 1.3);
    },
    impact(p, hit, game) {
      if (!hit.actor) return false;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      game.damage(hit.actor, sp > 6 ? 50 : 25, p.owner, 'watermelon');
      hit.actor.knock(_v2.copy(p.vel).setY(0).normalize().multiplyScalar(16).setY(7));
      this.split(p, game);
      return true;
    },
    expire(p, game) { this.split(p, game); },
    split(p, game) {
      game.fx.burst('melon', p.pos, 1.4);
      game.world.paintSplat(p.pos.x, p.pos.y - 0.8, p.pos.z, 5.5, 'melon');
      stampAtGround(game, p.pos, 3, 'slick', 5);
      game.sfx.play('splat', p.pos, 1.5); game.sfx.play('thud', p.pos, 1.2);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + rand(-0.4, 0.4);
        game.projectiles.launch({ food: 'melonchunk', owner: p.owner, local: true, pos: p.pos.clone().setY(p.pos.y + 0.3), vel: new THREE.Vector3(Math.cos(ang) * 9, 8, Math.sin(ang) * 9), gravity: 1, radius: 0.35, life: 3, spin: 9, bounces: 1 });
      }
    },
  },
  melonchunk: {
    name: 'Melon chunk', hidden: true, profile: 'lob', radius: 0.35, dmg: 15, verb: 'flattened',
    impact(p, hit, game) {
      if (hit.actor) { game.damage(hit.actor, 15, p.owner, 'watermelon'); game.fx.burst('melon', hit.point, 0.4); return true; }
      if (hit.world && hit.top && p.bounces > 0) { p.bounces--; p.pos.y = hit.point.y + 0.4; p.vel.y = Math.abs(p.vel.y) * 0.45 + 2; return false; }
      game.fx.burst('melon', hit.point, 0.3);
      return true;
    },
  },

  cheesechunk: { // a utensil-cut piece of cheese wheel (not a pickup)
    name: 'Cheese chunk', hidden: true, profile: 'lob', radius: 0.32, dmg: 14, verb: 'rolled over',
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 14, p.owner, 'cheese');
        hit.actor.addSticky(0.15, 1.5);
        game.fx.burst('cheese', hit.point, 0.5);
        game.sfx.play('thud', hit.point, 0.6);
        return true;
      }
      if (hit.world && hit.top) stampAtGround(game, hit.point, 1.6, 'sticky', 3, { slow: 0.25, visual: 'melt' });
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 1.2, 'cheese');
      game.fx.burst('cheese', hit.point, 0.3);
      return true;
    },
  },
  bananaslice: { // a utensil-cut slice of banana (not a pickup)
    name: 'Banana slice', hidden: true, profile: 'line', radius: 0.22, dmg: 9, verb: 'boomeranged',
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 9, p.owner, 'banana');
        hit.actor.knock(_v2.copy(p.vel).setY(0).normalize().multiplyScalar(2.5).setY(1));
        game.fx.burst('banana', hit.point, 0.4);
        game.sfx.play('thud', hit.point, 0.5);
        return true;
      }
      if (hit.world && hit.top) stampAtGround(game, hit.point, 1.3, 'slick', 3); // squashed banana is slippery
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 0.9, 'banana');
      game.fx.burst('banana', hit.point, 0.3);
      return true;
    },
  },
  pinechunk: { // a utensil-cut chunk of pineapple (not a pickup)
    name: 'Pineapple chunk', hidden: true, profile: 'lob', radius: 0.3, dmg: 12, verb: 'spiked',
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 12, p.owner, 'pineapple');
        game.fx.burst('pine', hit.point, 0.5);
        game.sfx.play('hit', hit.point, 0.5);
        return true;
      }
      // every other chunk leaves a little patch of spikes
      if (hit.world && hit.top && p.x?.sp) {
        const gy = groundHeight(hit.point.x, hit.point.z, hit.point.y + 0.5);
        game.addSpikeField(new THREE.Vector3(hit.point.x, gy, hit.point.z), 1.8, 3, 6, p.owner);
      }
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 0.9, 'banana');
      game.fx.burst('pine', hit.point, 0.4);
      return true;
    },
  },

  pineapple: {
    name: 'Pineapple', role: 'Sticky spike grenade', maxStack: 1, give: 1, weight: 6,
    profile: 'lob', charge: 0.25, speed: 26, recovery: 0.45, radius: 0.45, dmg: 35, verb: 'spiked',
    hint: 'Sticks to whatever it hits, then bursts into a spike field. Dash or get wet to shake it off.',
    release(a, c, game) {
      game.projectiles.launch({ food: 'pineapple', owner: a, pos: a.handPos(), vel: lobVel(a, lobSpeed('pineapple', c)), spin: 7, fuse: 2 });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      // stick to a Titan or a surface; the projectile system runs the fuse
      if (hit.actor) { p.attached = hit.actor; game.floatText(hit.actor, 'PINEAPPLE!', 'slip'); }
      else { p.stuck = true; p.pos.copy(hit.point); if (hit.top) p.pos.y += 0.4; }
      p.vel.set(0, 0, 0);
      game.sfx.play('thud', hit.point, 0.7);
      return false;
    },
    detonate(p, game) {
      const pt = p.pos.clone();
      game.explode(pt, 3, 35, p.owner, 'pineapple', 7);
      const gy = groundHeight(pt.x, pt.z, pt.y + 0.5);
      game.addSpikeField(new THREE.Vector3(pt.x, gy, pt.z), 5, 5, 8, p.owner);
      game.fx.burst('pine', pt);
      game.sfx.play('boom', pt, 0.9);
    },
  },

  jelly: {
    name: 'Jelly Cube', role: 'Root · trampoline', maxStack: 2, give: 1, weight: 8,
    profile: 'lob', charge: 0.2, speed: 24, recovery: 0.3, radius: 0.35, dmg: 12, verb: 'jellied',
    altLabel: 'Place a trampoline',
    hint: 'Bounces off walls and roots whoever it hits. Place it as a trampoline to reach high places.',
    release(a, c, game) {
      game.projectiles.launch({ food: 'jelly', owner: a, pos: a.handPos(), vel: lobVel(a, lobSpeed('jelly', c)), spin: 5, bounces: 4, life: 5 });
      a.consume(1);
      game.sfx.play('throw', a.pos);
    },
    impact(p, hit, game) {
      if (hit.actor) {
        game.damage(hit.actor, 12, p.owner, 'jelly');
        if (hit.actor.alive && hit.actor.applyHardCC('rooted', 1.0)) hit.actor.addSticky(0.3, 2);
        game.fx.burst('jelly', hit.point);
        game.sfx.play('boing', hit.point, 0.8);
        return true;
      }
      if (p.bounces > 0) {
        p.bounces--;
        if (hit.top) { p.pos.y = hit.point.y + 0.4; p.vel.y = Math.abs(p.vel.y) * 0.72 + 1; }
        else { p.pos.copy(hit.point); p.vel.x *= -0.75; p.vel.z *= -0.75; }
        game.sfx.play('boing', hit.point, 0.35);
        return false;
      }
      game.fx.burst('jelly', hit.point);
      game.world.paintSplat(hit.point.x, hit.point.y, hit.point.z, 2.4, 'jelly');
      return true;
    },
    alt(a, game) {
      const f = forwardOf(a.yaw, _v);
      const pos = a.pos.clone().addScaledVector(f, 2.4);
      pos.y = groundHeight(pos.x, pos.z, a.pos.y + 0.6);
      game.items.addTrampoline(a, pos);
      a.consume(1);
      game.sfx.play('boing', pos, 0.8);
    },
  },
};

// Every food pickup holds a random 4-15 of that food; a slot stacks up to 30.
export const AMMO_MIN = 4, AMMO_MAX = 15, STACK_MAX = 30;
export const pickupAmmo = (id) => (FOODS[id].ammo ? FOODS[id].ammo() : rollAmmo());
export const rollAmmo = () => AMMO_MIN + Math.floor(Math.random() * (AMMO_MAX - AMMO_MIN + 1));
export const FOOD_IDS = ['tomato', 'banana', 'carrot', 'ice', 'soda', 'cheese', 'grapes', 'chili', 'cookie', 'watermelon', 'pineapple', 'jelly', 'blueberry'];

// Food casts real shadows only when the shadow map updates every frame (High).
let FOOD_SHADOWS = true;
export function setFoodShadows(on) { FOOD_SHADOWS = on; }

// Each food model is built once, merged into one geometry per material, and shared by every
// copy (pickups, held food, projectiles). A bunch of grapes goes from 17 draw calls to 2.
const MERGED = {};
function bakeFood(id) {
  const src = MAKERS[id]();
  src.updateMatrixWorld(true);
  const byMat = new Map(), parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = (Array.isArray(o.material) ? o.geometry.clone() : (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone())).applyMatrix4(o.matrixWorld);
    if (Array.isArray(o.material)) { parts.push([g, o.material]); return; } // multi-material: keep its groups
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  for (const [m, gs] of byMat) parts.push([gs.length > 1 ? mergeGeometries(gs) : gs[0], m]);
  return parts;
}
// The merged [geometry, material] parts of a food, for instanced drawing.
export function foodParts(id) { return (MERGED[id] ||= bakeFood(id)); }

export function makeFoodMesh(id) {
  MERGED[id] ||= bakeFood(id);
  const grp = new THREE.Group();
  for (const [g, m] of MERGED[id]) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = FOOD_SHADOWS;
    grp.add(mesh);
  }
  return grp;
}

for (const id of FOOD_IDS) FOODS[id].maxStack = id === 'blueberry' ? 240 : STACK_MAX;

export function randomFoodId() {
  let total = 0;
  for (const id of FOOD_IDS) total += FOODS[id].weight;
  let r = rand(0, total);
  for (const id of FOOD_IDS) { r -= FOODS[id].weight; if (r <= 0) return id; }
  return 'tomato';
}

export const FEED_VERB = {
  tomato: "tomato'd", banana: 'boomeranged', peel: 'slipped up', carrot: 'sniped', ice: 'iced',
  soda: 'fizzed', cheese: 'rolled over', landmark: 'buried', grapes: 'grape-shot', chili: 'torched',
  cookie: 'cookied', watermelon: 'flattened', pineapple: 'spiked', jelly: 'jellied', blueberry: 'berry-blasted',
};
