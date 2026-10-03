// Food stains on every surface (0.19): splats are decals cut out of the real scenery triangles, so
// they wrap over counter edges, run up walls, curl around the giant fruit, cans and chair legs, and
// land on anything static (floor, walls, counters, props, giant food, fallen chairs).
//
// How it works:
// - At start-up every static scenery triangle (about 60k) goes into a grid on the floor plan.
// - A splat finds the nearest surface to where it landed and takes that surface's normal. It then
//   collects the triangles inside a box around it (as wide as the splat, as deep as it is wide), clips
//   them to the box, and maps the splat picture onto them "unfolded": the further a point lies below
//   or above the splat's plane, the further out in the picture it is, so a splat bends over an edge
//   instead of stretching down it. Triangles facing away, or hidden under the surface that was hit
//   (a table's legs under its top), are skipped.
// - The pictures are drawn once into one atlas (two looks per kind), and every splat's triangles go
//   into one ring buffer, so all the stains in the kitchen are a single draw call. When the buffer is
//   full the oldest stains are painted over.
import * as THREE from 'three';
import { groundHeight, rand } from './core.js';

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
const KINDS = Object.keys(LOOKS);
const VARIANTS = 2;
const GRID = 5;          // atlas cells per side (25 >= 11 kinds x 2 looks)
const REACH = 1.9;       // a splat of radius r reaches 1.9 r with its streaks
const CELL = 6;          // floor-plan grid cell for the triangle lookup, metres
const CAP = 210000;      // ring buffer size in vertices (70k triangles of stain)

// A splat as shapes around its centre, in units of its radius: ellipses, seeds and streaks.
function makeSplat(kind) {
  const looks = LOOKS[kind], shapes = [];
  const blobs = kind === 'drip' ? 1 : 7;
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.8;
    const rr = i === 0 ? 0.7 : rand(0.15, 0.45);
    shapes.push({ t: 'e', x: Math.cos(a) * d, y: Math.sin(a) * d, rx: rr, ry: rr * rand(0.7, 1), rot: a, c: looks[i % looks.length] });
  }
  if (kind === 'tomato' || kind === 'melon') {
    const seed = kind === 'melon' ? 'rgba(30,20,20,0.85)' : 'rgba(245,225,150,0.9)';
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random();
      shapes.push({ t: 'e', x: Math.cos(a) * d, y: Math.sin(a) * d, rx: 0.05, ry: 0.03, rot: a, c: seed });
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, l = rand(1.1, 1.8);
      shapes.push({ t: 'l', x: Math.cos(a) * l, y: Math.sin(a) * l, w: 0.08, c: looks[0] });
    }
  }
  return shapes;
}

function buildAtlas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), cell = size / GRID, s = (cell / 2) / REACH * 0.94;
  KINDS.forEach((kind, k) => {
    for (let v = 0; v < VARIANTS; v++) {
      const i = k * VARIANTS + v, cx = (i % GRID + 0.5) * cell, cy = (Math.floor(i / GRID) + 0.5) * cell;
      x.save(); x.beginPath(); x.rect(cx - cell / 2 + 2, cy - cell / 2 + 2, cell - 4, cell - 4); x.clip(); // keep a clear border
      x.lineCap = 'round';
      for (const sh of makeSplat(kind)) {
        if (sh.t === 'e') { x.fillStyle = sh.c; x.beginPath(); x.ellipse(cx + sh.x * s, cy + sh.y * s, sh.rx * s, sh.ry * s, sh.rot, 0, Math.PI * 2); x.fill(); }
        else { x.strokeStyle = sh.c; x.lineWidth = Math.max(1, sh.w * s); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + sh.x * s, cy + sh.y * s); x.stroke(); }
      }
      x.restore();
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// closest point on triangle (a, b, c) to p (Ericson, Real-Time Collision Detection 5.1.5)
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3(), _bp = new THREE.Vector3(), _cp = new THREE.Vector3();
function closestOnTri(p, a, b, c, out) {
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(_ab, d1 / (d1 - d3));
  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(_ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return out.copy(b).addScaledVector(_bp.subVectors(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(_ab, vb * den).addScaledVector(_ac, vc * den);
}

export class Stains {
  constructor(scene, quality) {
    this.scene = scene;
    this._collect(scene);
    this.stamp = new Uint32Array(this.count); this.stampN = 0;
    // one ring buffer of stain triangles, one material, one draw call
    const g = new THREE.BufferGeometry();
    const attr = (n) => new THREE.BufferAttribute(new Float32Array(CAP * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(3)); g.setAttribute('normal', attr(3)); g.setAttribute('uv', attr(2));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.atlas = buildAtlas((quality.splatRes || 1536) <= 1024 ? 1024 : 2048);
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas, transparent: true, roughness: 0.5, envMapIntensity: 0.35, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.head = 0; this.used = 0; this.dirtyFrom = Infinity; this.dirtyTo = -1; this.wrapped = false; this.flushT = 0;
  }

  // Every static, opaque scenery triangle in world space, with vertex normals, in a floor-plan grid.
  _collect(scene) {
    scene.updateMatrixWorld(true);
    const P = [], N = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const o of scene.children) {
      if (!o.isMesh || o.isInstancedMesh || !(o.userData.world || o.userData.merged) || o.userData.dyn) continue;
      if (Array.isArray(o.material) || o.material.transparent || !o.visible) continue;
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
      if (!nor) continue;
      nm.getNormalMatrix(o.matrixWorld);
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) {
        const k = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
      }
    }
    this.P = new Float32Array(P); this.N = new Float32Array(N);
    this.count = P.length / 9;
    this.F = new Float32Array(this.count * 3); // face normals
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const cells = new Map();
    for (let t = 0; t < this.count; t++) {
      this._tri(t, a, b, c);
      const f = b.clone().sub(a).cross(c.clone().sub(a));
      const l = f.length();
      if (l < 1e-8) continue; // degenerate
      f.divideScalar(l);
      this.F[t * 3] = f.x; this.F[t * 3 + 1] = f.y; this.F[t * 3 + 2] = f.z;
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const key = (ix + 2048) * 4096 + iz + 2048;
        let list = cells.get(key);
        if (!list) cells.set(key, list = []);
        list.push(t);
      }
    }
    this.cells = new Map();
    for (const [k, list] of cells) this.cells.set(k, Int32Array.from(list));
  }
  _tri(t, a, b, c) {
    const P = this.P, o = t * 9;
    a.set(P[o], P[o + 1], P[o + 2]); b.set(P[o + 3], P[o + 4], P[o + 5]); c.set(P[o + 6], P[o + 7], P[o + 8]);
  }
  // triangles whose grid cells overlap a square around (x, z); each listed once
  _near(x, z, rad, out) {
    out.length = 0;
    const s = ++this.stampN;
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL), z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const list = this.cells.get((ix + 2048) * 4096 + iz + 2048);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) { const t = list[i]; if (this.stamp[t] !== s) { this.stamp[t] = s; out.push(t); } }
    }
    return out;
  }
  // the closest surface point to p within rad: { point, tri } or null
  _surface(p, rad) {
    let best = null, bd = rad * rad;
    for (const t of this._near(p.x, p.z, rad, _list)) {
      if (this.F[t * 3] === 0 && this.F[t * 3 + 1] === 0 && this.F[t * 3 + 2] === 0) continue;
      this._tri(t, _a, _b, _c);
      closestOnTri(p, _a, _b, _c, _q);
      const d = _q.distanceToSquared(p);
      if (d < bd) { bd = d; best = { point: _q.clone(), tri: t }; }
    }
    return best;
  }
  // does a short segment from o along dir (length len) hit any scenery triangle?
  _blocked(o, dir, len) {
    for (const t of this._near(o.x + dir.x * len * 0.5, o.z + dir.z * len * 0.5, len * 0.5 + 0.5, _list2)) {
      this._tri(t, _a, _b, _c);
      // Moller-Trumbore
      _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _h.crossVectors(dir, _e2);
      const det = _e1.dot(_h);
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det; _s.subVectors(o, _a);
      const u = inv * _s.dot(_h); if (u < 0 || u > 1) continue;
      _qq.crossVectors(_s, _e1);
      const v = inv * dir.dot(_qq); if (v < 0 || u + v > 1) continue;
      const d = inv * _e2.dot(_qq);
      if (d > 0.02 && d < len) return true;
    }
    return false;
  }

  // Stain whatever surface is at (x, y, z), radius r.
  paint(x, y, z, r, kind) {
    if (!LOOKS[kind] || r <= 0) return;
    const p = _p.set(x, y, z);
    let hit = this._surface(p, Math.max(1.2, r * 0.6));
    if (!hit) { // e.g. a Titan was hit mid-air: the juice lands on the ground below, if it's close
      const gy = groundHeight(x, z, y + 0.5);
      if (y - gy < 3.5) { p.y = gy; hit = this._surface(p, 1.2); }
    }
    if (!hit) return;
    const t = hit.tri, c = hit.point;
    const n = _n.set(this.F[t * 3], this.F[t * 3 + 1], this.F[t * 3 + 2]);
    // the picture's axes, turned at random on the surface
    const t1 = _t1.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
    const t2 = _t2.crossVectors(n, t1);
    const ang = Math.random() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    _t3.copy(t1).multiplyScalar(ca).addScaledVector(t2, sa); t2.multiplyScalar(ca).addScaledVector(t1, -sa); t1.copy(_t3);
    const S = r * REACH, D = Math.max(0.5, r * 0.9);
    const cellI = KINDS.indexOf(kind) * VARIANTS + ((Math.random() * VARIANTS) | 0);
    const cu = (cellI % GRID) / GRID, cv = Math.floor(cellI / GRID) / GRID;
    const verts = [];
    for (const tt of this._near(c.x, c.z, S + D, _list3)) {
      const fx = this.F[tt * 3], fy = this.F[tt * 3 + 1], fz = this.F[tt * 3 + 2];
      if (fx * n.x + fy * n.y + fz * n.z < -0.15) continue; // facing away from the splat
      // to the splat's frame: x, y across the picture, z along the normal
      let poly = [];
      for (let k = 0; k < 3; k++) {
        const o = tt * 9 + k * 3, on = o;
        _v.set(this.P[o] - c.x, this.P[o + 1] - c.y, this.P[o + 2] - c.z);
        poly.push([_v.dot(t1), _v.dot(t2), _v.dot(n), this.N[on], this.N[on + 1], this.N[on + 2]]);
      }
      if (poly.every((q) => q[0] > S) || poly.every((q) => q[0] < -S) || poly.every((q) => q[1] > S) || poly.every((q) => q[1] < -S) || poly.every((q) => q[2] > D) || poly.every((q) => q[2] < -D)) continue;
      for (const [axis, sign, lim] of CLIP(S, D)) { poly = clip(poly, axis, sign, lim); if (poly.length < 3) break; }
      if (poly.length < 3) continue;
      // below the hit surface: only if nothing covers it (wrapping over an edge, not painting a table's legs)
      let cz = 0; for (const q of poly) cz += q[2]; cz /= poly.length;
      if (cz < -0.08) {
        let mx = 0, my = 0; for (const q of poly) { mx += q[0]; my += q[1]; } mx /= poly.length; my /= poly.length;
        _o.copy(c).addScaledVector(t1, mx).addScaledVector(t2, my).addScaledVector(n, cz).add(_v.set(fx, fy, fz).multiplyScalar(0.06));
        if (this._blocked(_o, n, -cz + 0.4)) continue;
      }
      for (let k = 1; k < poly.length - 1; k++) split(poly[0], poly[k], poly[k + 1], S * 0.32, verts, 10);
    }
    if (!verts.length) return;
    this._write(verts, c, t1, t2, n, S, cu, cv);
  }

  _write(verts, c, t1, t2, n, S, cu, cv) {
    const count = verts.length;
    if (count > CAP) return;
    if (this.head + count > CAP) { this.head = 0; this.wrapped = true; }
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array, uv = this.geo.attributes.uv.array;
    const g = 1 / GRID, m = 0.5 / GRID * 0.985;
    for (let i = 0; i < count; i++) {
      const [x, y, z, nx, ny, nz] = verts[i], j = this.head + i;
      // unfold: points below/above the splat's plane sit further out in the picture
      const d = Math.hypot(x, y), k = d > 1e-5 ? (d + Math.abs(z) * 0.9) / d : 1;
      const u = Math.max(-1, Math.min(1, (x * k) / S)), v = Math.max(-1, Math.min(1, (y * k) / S));
      const lift = 0.02;
      pos[j * 3] = c.x + t1.x * x + t2.x * y + n.x * z + nx * lift;
      pos[j * 3 + 1] = c.y + t1.y * x + t2.y * y + n.y * z + ny * lift;
      pos[j * 3 + 2] = c.z + t1.z * x + t2.z * y + n.z * z + nz * lift;
      nor[j * 3] = nx; nor[j * 3 + 1] = ny; nor[j * 3 + 2] = nz;
      uv[j * 2] = cu + g / 2 + u * m; uv[j * 2 + 1] = 1 - (cv + g / 2 + v * m);
    }
    this.dirtyFrom = Math.min(this.dirtyFrom, this.head); this.dirtyTo = Math.max(this.dirtyTo, this.head + count);
    this.head += count;
    this.used = this.wrapped ? CAP : Math.max(this.used, this.head);
    this.geo.setDrawRange(0, this.used);
  }

  update(dt) {
    this.flushT += dt;
    if (this.dirtyTo < 0 || this.flushT < 0.05) return;
    for (const [name, n] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const a = this.geo.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(this.dirtyFrom * n, (this.dirtyTo - this.dirtyFrom) * n);
      a.needsUpdate = true;
    }
    this.dirtyFrom = Infinity; this.dirtyTo = -1; this.flushT = 0;
  }
  clear() {
    this.head = 0; this.used = 0; this.wrapped = false;
    this.geo.setDrawRange(0, 0);
    this.dirtyFrom = Infinity; this.dirtyTo = -1;
  }
}

// Where a triangle leaves the splat's plane (over an edge, round a curve) the picture is unfolded,
// which isn't linear across a big triangle: cut those into small ones. Flat parts stay as they are.
const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function split(a, b, c, maxLen, out, depth) {
  const bent = Math.max(Math.abs(a[2]), Math.abs(b[2]), Math.abs(c[2])) > 0.03;
  const L2 = Math.max(d2(a, b), d2(b, c), d2(c, a));
  if (!bent || depth <= 0 || L2 <= maxLen * maxLen) { out.push(a, b, c); return; }
  // halve the longest edge (long thin slivers don't get over-cut)
  if (L2 === d2(a, b)) { const m = mid(a, b); split(a, m, c, maxLen, out, depth - 1); split(m, b, c, maxLen, out, depth - 1); }
  else if (L2 === d2(b, c)) { const m = mid(b, c); split(a, b, m, maxLen, out, depth - 1); split(a, m, c, maxLen, out, depth - 1); }
  else { const m = mid(c, a); split(a, b, m, maxLen, out, depth - 1); split(m, b, c, maxLen, out, depth - 1); }
}

// Sutherland-Hodgman against one plane of the splat's box: keep q[axis] * sign <= lim
const CLIP = (S, D) => [[0, 1, S], [0, -1, S], [1, 1, S], [1, -1, S], [2, 1, D], [2, -1, D]];
function clip(poly, axis, sign, lim) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a[axis] * sign - lim, db = b[axis] * sign - lim;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return out;
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Vector3();
const _list = [], _list2 = [], _list3 = [];
