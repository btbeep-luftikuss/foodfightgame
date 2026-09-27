// Food stains on every surface (0.13): the floor, the top of every counter, table, chair and prop,
// the sides of boxes and cabinets, and the kitchen walls.
//
// Every flat surface is a "stain layer": a rectangle (or disc, for round tops) described by an origin and
// two in-plane axes. A layer is cut into square tiles, and a tile only gets a canvas, a texture and a mesh
// the first time something splats on it, so clean surfaces cost nothing. Each splat is generated once as
// a list of blobs in metres and then drawn into every tile it touches, so splats cross tile seams cleanly.
// Texture uploads are batched: dirty tiles are re-uploaded at most every 80 ms.
import * as THREE from 'three';
import { colliders, groundHeight, rand } from './core.js';

const LOOKS = {
  tomato: ['rgba(196,22,14,0.85)', 'rgba(230,50,30,0.7)', 'rgba(150,10,8,0.8)'],
  drip: ['rgba(200,30,20,0.55)'],
  soda: ['rgba(80,34,12,0.55)', 'rgba(110,55,20,0.45)'],
  cheese: ['rgba(255,196,40,0.75)', 'rgba(240,170,20,0.7)'],
  carrot: ['rgba(255,138,28,0.8)'],
  banana: ['rgba(250,220,60,0.6)'],
  grape: ['rgba(110,30,120,0.7)', 'rgba(140,50,150,0.55)'],
  melon: ['rgba(240,70,90,0.8)', 'rgba(255,110,120,0.65)'],
  jelly: ['rgba(90,200,90,0.5)'],
  berry: ['rgba(45,55,140,0.7)', 'rgba(80,60,150,0.55)'],
  chili: ['rgba(40,20,10,0.35)'],
};
const CURVED = new Set(['glass', 'fruit', 'tomato', 'crumb']); // round props: a flat decal would float off them
const TILE_PX = 512;

// A splat as shapes in metres around its centre: ellipses, seeds and streaks.
function makeSplat(r, kind) {
  const looks = LOOKS[kind];
  const shapes = [];
  const blobs = kind === 'drip' ? 1 : 7;
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
    const rr = r * (i === 0 ? 0.7 : rand(0.15, 0.45));
    shapes.push({ t: 'e', x: Math.cos(a) * d, y: Math.sin(a) * d, rx: rr, ry: rr * rand(0.7, 1), rot: a, c: looks[i % looks.length] });
  }
  if (kind === 'tomato' || kind === 'melon') {
    const seed = kind === 'melon' ? 'rgba(30,20,20,0.85)' : 'rgba(245,225,150,0.9)';
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      shapes.push({ t: 'e', x: Math.cos(a) * d, y: Math.sin(a) * d, rx: r * 0.05, ry: r * 0.03, rot: a, c: seed });
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, l = r * rand(1.1, 1.8);
      shapes.push({ t: 'l', x: Math.cos(a) * l, y: Math.sin(a) * l, w: Math.max(0.05, r * 0.08), c: looks[0] });
    }
  }
  return shapes;
}

class Layer {
  // origin: world point at (u, v) = (0, 0); ua, va: unit in-plane axes; n: outward normal
  constructor(set, { origin, ua, va, n, U, V, ppm, disc = null, key }) {
    Object.assign(this, { set, origin, ua, va, n, U, V, ppm, disc, key });
    this.tileM = disc ? Math.max(U, V) : TILE_PX / ppm; // a round top is always one tile
    this.tiles = new Map();
  }
  toUV(p) {
    const dx = p.x - this.origin.x, dy = p.y - this.origin.y, dz = p.z - this.origin.z;
    return [dx * this.ua.x + dy * this.ua.y + dz * this.ua.z, dx * this.va.x + dy * this.va.y + dz * this.va.z,
      dx * this.n.x + dy * this.n.y + dz * this.n.z];
  }
  paint(u, v, shapes, reach) {
    const T = this.tileM;
    const i0 = Math.max(0, Math.floor((u - reach) / T)), i1 = Math.min(Math.ceil(this.U / T) - 1, Math.floor((u + reach) / T));
    const j0 = Math.max(0, Math.floor((v - reach) / T)), j1 = Math.min(Math.ceil(this.V / T) - 1, Math.floor((v + reach) / T));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const tile = this._tile(i, j);
        if (!tile) return;
        const ctx = tile.ctx, s = tile.pxPerM, cx = (u - tile.u0) * s, cy = (v - tile.v0) * s;
        for (const sh of shapes) {
          if (sh.t === 'e') {
            ctx.fillStyle = sh.c;
            ctx.beginPath(); ctx.ellipse(cx + sh.x * s, cy + sh.y * s, sh.rx * s, sh.ry * s, sh.rot, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.strokeStyle = sh.c; ctx.lineWidth = Math.max(1, sh.w * s);
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sh.x * s, cy + sh.y * s); ctx.stroke();
          }
        }
        tile.dirty = true;
        this.set.dirty.add(tile);
      }
    }
  }
  _tile(i, j) {
    const k = i * 4096 + j;
    let t = this.tiles.get(k);
    if (t) return t;
    if (this.set.tileCount >= this.set.maxTiles) return null; // budget reached: surfaces already stained keep taking paint
    const T = this.tileM, u0 = i * T, v0 = j * T, tw = Math.min(T, this.U - u0), th = Math.min(T, this.V - v0);
    const pxPerM = this.ppm;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(16, Math.ceil(tw * pxPerM)); canvas.height = Math.max(16, Math.ceil(th * pxPerM));
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = this._geometry(u0, v0, tw, th, canvas.width / pxPerM, canvas.height / pxPerM);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, envMapIntensity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.set.scene.add(mesh);
    t = { canvas, ctx, tex, mesh, u0, v0, pxPerM, dirty: false };
    this.tiles.set(k, t);
    this.set.tileCount++;
    return t;
  }
  // A quad (or disc) lying on the surface, nudged off it along the normal; uv (0,0) is the canvas's top-left.
  _geometry(u0, v0, tw, th, cw, ch) {
    const lift = this.n.y > 0.5 ? 0.02 : 0.04;
    const P = (u, v) => new THREE.Vector3().copy(this.origin).addScaledVector(this.ua, u).addScaledVector(this.va, v).addScaledVector(this.n, lift);
    const pos = [], uv = [], nor = [];
    const push = (u, v) => { const p = P(u, v); pos.push(p.x, p.y, p.z); uv.push((u - u0) / cw, 1 - (v - v0) / ch); nor.push(this.n.x, this.n.y, this.n.z); };
    if (this.disc) {
      const { cu, cv, r } = this.disc, seg = 32;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        push(cu, cv); push(cu + Math.cos(a0) * r, cv + Math.sin(a0) * r); push(cu + Math.cos(a1) * r, cv + Math.sin(a1) * r);
      }
    } else {
      push(u0, v0); push(u0 + tw, v0); push(u0 + tw, v0 + th);
      push(u0, v0); push(u0 + tw, v0 + th); push(u0, v0 + th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  clear() {
    for (const t of this.tiles.values()) {
      this.set.scene.remove(t.mesh);
      t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.tex.dispose();
    }
    this.set.tileCount -= this.tiles.size;
    this.tiles.clear();
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Stains {
  constructor(scene, quality, room) {
    this.scene = scene;
    this.dirty = new Set(); this.flushT = 0; this.tileCount = 0;
    const ppmTop = quality.splatRes / 120; // same sharpness the island counter always had
    const ppm = ppmTop * 0.6;                // floor and walls are seen from further away
    this.maxTiles = quality.splatRes >= 2048 ? 110 : quality.splatRes >= 1536 ? 90 : 70;
    this.tops = []; this.faces = [];
    const { minX, maxX, minZ, maxZ, floorY, wallTop } = room;
    // floor and the four walls
    this.floor = new Layer(this, { origin: V3(minX, floorY, minZ), ua: V3(1, 0, 0), va: V3(0, 0, 1), n: V3(0, 1, 0), U: maxX - minX, V: maxZ - minZ, ppm, key: 'floor' });
    const wall = (origin, ua, n, U) => this.faces.push(new Layer(this, { origin, ua, va: V3(0, 1, 0), n, U, V: wallTop - floorY, ppm, key: 'wall' }));
    wall(V3(minX, floorY, minZ), V3(1, 0, 0), V3(0, 0, 1), maxX - minX);
    wall(V3(minX, floorY, maxZ), V3(1, 0, 0), V3(0, 0, -1), maxX - minX);
    wall(V3(minX, floorY, minZ), V3(0, 0, 1), V3(1, 0, 0), maxZ - minZ);
    wall(V3(maxX, floorY, minZ), V3(0, 0, 1), V3(-1, 0, 0), maxZ - minZ);
    // every collider: its top, and for boxes the four sides
    for (const c of colliders) {
      if (CURVED.has(c.surface)) continue;
      if (c.type === 'cyl') {
        this.tops.push({ c, layer: new Layer(this, { origin: V3(c.x - c.r, c.top, c.z - c.r), ua: V3(1, 0, 0), va: V3(0, 0, 1), n: V3(0, 1, 0), U: c.r * 2, V: c.r * 2, ppm: ppmTop, disc: { cu: c.r, cv: c.r, r: c.r } }) });
        continue;
      }
      const w = c.maxX - c.minX, d = c.maxZ - c.minZ, h = c.top - c.bottom;
      this.tops.push({ c, layer: new Layer(this, { origin: V3(c.minX, c.top, c.minZ), ua: V3(1, 0, 0), va: V3(0, 0, 1), n: V3(0, 1, 0), U: w, V: d, ppm: ppmTop }) });
      if (h < 0.4) continue;
      const side = (origin, ua, n, U) => this.faces.push(new Layer(this, { origin, ua, va: V3(0, 1, 0), n, U, V: h, ppm, key: c }));
      side(V3(c.minX, c.bottom, c.minZ), V3(1, 0, 0), V3(0, 0, -1), w);
      side(V3(c.minX, c.bottom, c.maxZ), V3(1, 0, 0), V3(0, 0, 1), w);
      side(V3(c.minX, c.bottom, c.minZ), V3(0, 0, 1), V3(-1, 0, 0), d);
      side(V3(c.maxX, c.bottom, c.minZ), V3(0, 0, 1), V3(1, 0, 0), d);
    }
  }

  // Stain the surface under/at (x, y, z). Big splashes also run up nearby walls and cabinet sides.
  paint(x, y, z, r, kind) {
    if (!LOOKS[kind] || r <= 0) return;
    const p = _p.set(x, y, z);
    let hit = this._top(p) || this._face(p, 1.2);
    if (!hit) { // e.g. a Titan was hit mid-air: the juice lands on the ground below, if it's close
      const gy = groundHeight(x, z, y + 0.5);
      if (y - gy < 3.5) { p.y = gy; hit = this._top(p); }
    }
    if (!hit) return;
    const shapes = makeSplat(r, kind);
    hit.layer.paint(hit.u, hit.v, shapes, r * 1.9);
    if (r < 1.5 || hit.layer.n.y < 0.5) return;
    // splash-up: walls and sides within reach of a floor/counter splat get a smaller stain at their base
    for (const f of this.faces) {
      const [u, v, dist] = f.toUV(p);
      if (dist < -0.2 || dist > r * 0.7 || u < -r || u > f.U + r || v < -0.5 || v > f.V) continue;
      f.paint(u, Math.max(0, v), makeSplat(r * 0.55, kind), r);
    }
  }
  _top(p) {
    let best = null, bestTop = -Infinity;
    for (const t of this.tops) {
      const c = t.c;
      if (!c.enabled || Math.abs(p.y - c.top) > 0.9 || c.top < bestTop) continue;
      const [u, v] = t.layer.toUV(p);
      if (t.layer.disc) { if (Math.hypot(u - c.r, v - c.r) > c.r) continue; } else if (u < 0 || v < 0 || u > t.layer.U || v > t.layer.V) continue;
      best = { layer: t.layer, u, v }; bestTop = c.top;
    }
    if (best) return best;
    const [u, v, dist] = this.floor.toUV(p);
    if (Math.abs(dist) < 0.9 && u >= 0 && v >= 0 && u <= this.floor.U && v <= this.floor.V) return { layer: this.floor, u, v };
    return null;
  }
  _face(p, tol) {
    let best = null, bd = tol;
    for (const f of this.faces) {
      if (f.key !== 'wall' && !f.key.enabled) continue;
      const [u, v, dist] = f.toUV(p);
      if (dist < -0.3 || dist > bd || u < 0 || u > f.U || v < 0 || v > f.V) continue;
      best = { layer: f, u, v }; bd = Math.max(dist, 0.001);
    }
    return best;
  }

  update(dt) {
    this.flushT += dt;
    if (!this.dirty.size || this.flushT < 0.08) return;
    for (const t of this.dirty) { t.tex.needsUpdate = true; t.dirty = false; }
    this.dirty.clear(); this.flushT = 0;
  }
  clear() {
    this.floor.clear();
    for (const t of this.tops) t.layer.clear();
    for (const f of this.faces) f.clear();
    this.dirty.clear();
  }
}
const _p = new THREE.Vector3();
