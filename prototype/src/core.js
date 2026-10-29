// Shared constants, math helpers and world collision queries.
// Units are player-scale metres (a Titan is ~1.9 m tall); y is up.
import * as THREE from 'three';

export const G = 20; // gravity, tuned slightly above Earth for snappier jumps
export const COUNTER = { minX: -60, maxX: 60, minZ: -32, maxZ: 32, top: 0 };
export const FLOOR_Y = -36; // the kitchen floor, one counter-height below
export const FLOOR_BOUNDS = { minX: -240, maxX: 240, minZ: -176, maxZ: 166 };
export const STEP = 0.6;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// (0.44) Repeatable randomness: the same seed gives the same numbers on every computer, so online
// every player's game builds the same map and fills the same food spots with the same food.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Run fn with Math.random (and so rand, pick, ...) drawing from a seed; the real one comes back after.
export function withSeed(seed, fn) {
  const real = Math.random;
  Math.random = seededRandom(typeof seed === 'string' ? hashStr(seed) : seed);
  try { return fn(); } finally { Math.random = real; }
}

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Yaw convention matches the camera: yaw 0 looks down -Z.
export const forwardOf = (yaw, out = new THREE.Vector3()) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
export const rightOf = (yaw, out = new THREE.Vector3()) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));
export const yawOf = (x, z) => Math.atan2(-x, -z);

// ---------------------------------------------------------------------------
// Tiny event bus (kill feed, HUD notices).
const listeners = {};
export const bus = {
  on(type, fn) { (listeners[type] ||= []).push(fn); },
  emit(type, data) { (listeners[type] || []).forEach((fn) => fn(data)); },
};

// ---------------------------------------------------------------------------
// Static colliders: axis-aligned boxes and vertical cylinders.
export const colliders = [];

// (0.53) A grid on the floor plan, GRID_CELL metres a cell: each cell lists the colliders over it (and
// GRID_PAD around it), in the order they were made, so a question about one spot (what's solid here, how
// high is the ground) looks at a handful of colliders instead of all ~350. Colliders never move once made;
// new ones (a pot set down) go into the grid as they come. Anything beyond the floor plan sits in the edge
// cells (and in `outer`, for rays).
const GRID_CELL = 8, GRID_PAD = 2;
const GX0 = FLOOR_BOUNDS.minX - GRID_CELL, GZ0 = FLOOR_BOUNDS.minZ - GRID_CELL;
const GW = Math.ceil((FLOOR_BOUNDS.maxX - FLOOR_BOUNDS.minX) / GRID_CELL) + 3, GH = Math.ceil((FLOOR_BOUNDS.maxZ - FLOOR_BOUNDS.minZ) / GRID_CELL) + 3;
const cells = Array.from({ length: GW * GH }, () => []);
const outer = []; // colliders reaching outside the grid (rays out there test these too)
let stampN = 1;
const stamps = [];
const cellX = (x) => Math.min(GW - 1, Math.max(0, Math.floor((x - GX0) / GRID_CELL)));
const cellZ = (z) => Math.min(GH - 1, Math.max(0, Math.floor((z - GZ0) / GRID_CELL)));
function gridAdd(c, i) {
  const x0 = c.type === 'box' ? c.minX : c.x - c.r, x1 = c.type === 'box' ? c.maxX : c.x + c.r;
  const z0 = c.type === 'box' ? c.minZ : c.z - c.r, z1 = c.type === 'box' ? c.maxZ : c.z + c.r;
  for (let gx = cellX(x0 - GRID_PAD); gx <= cellX(x1 + GRID_PAD); gx++) for (let gz = cellZ(z0 - GRID_PAD); gz <= cellZ(z1 + GRID_PAD); gz++) cells[gx + gz * GW].push(i);
  if (x0 < GX0 || z0 < GZ0 || x1 > GX0 + GW * GRID_CELL || z1 > GZ0 + GH * GRID_CELL) outer.push(i);
  stamps.push(0);
}
// The colliders over (x, z), in the order they were made (pad up to GRID_PAD; more falls back to all).
function near(x, z, pad = 0) { return pad > GRID_PAD ? null : cells[cellX(x) + cellZ(z) * GW]; }
// ... over a disc of radius r around (x, z), each once, in order
const _list = [];
function nearDisc(x, z, r) {
  const gx0 = cellX(x - r), gx1 = cellX(x + r), gz0 = cellZ(z - r), gz1 = cellZ(z + r);
  if (gx0 === gx1 && gz0 === gz1) return cells[gx0 + gz0 * GW];
  const s = ++stampN; _list.length = 0;
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) for (const i of cells[gx + gz * GW]) if (stamps[i] !== s) { stamps[i] = s; _list.push(i); }
  return _list.sort((a, b) => a - b);
}

export function addBox(minX, maxX, minZ, maxZ, bottom, top, props = {}) {
  const c = { type: 'box', minX, maxX, minZ, maxZ, bottom, top, enabled: true, ...props };
  colliders.push(c); gridAdd(c, colliders.length - 1);
  return c;
}

export function addCyl(x, z, r, bottom, top, props = {}) {
  const c = { type: 'cyl', x, z, r, bottom, top, enabled: true, ...props };
  colliders.push(c); gridAdd(c, colliders.length - 1);
  return c;
}

export function clearColliders() { colliders.length = 0; for (const c of cells) c.length = 0; outer.length = 0; stamps.length = 0; }

function insideFootprint(c, x, z, pad) {
  if (c.type === 'box') return x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad;
  const dx = x - c.x, dz = z - c.z, r = c.r + pad;
  return dx * dx + dz * dz <= r * r;
}

// Highest walkable surface under (x, z) that can be reached from feetY (stepping up at most `step`).
export function groundHeight(x, z, feetY, step = STEP, pad = 0.15) {
  let h = FLOOR_Y;
  const ids = near(x, z, pad);
  if (!ids) { for (const c of colliders) if (c.enabled && c.top <= feetY + step && c.top > h && insideFootprint(c, x, z, pad)) h = c.top; return h; }
  for (let k = 0; k < ids.length; k++) {
    const c = colliders[ids[k]];
    if (!c.enabled || c.top > feetY + step || c.top <= h) continue;
    if (insideFootprint(c, x, z, pad)) h = c.top;
  }
  return h;
}

// Which collider (if any) provides the ground under a point; used for surface types.
export function groundCollider(x, z, y) {
  let best = null;
  const ids = near(x, z, 0.15);
  for (let k = 0; k < ids.length; k++) {
    const c = colliders[ids[k]];
    if (!c.enabled || Math.abs(c.top - y) > 0.25) continue;
    if (insideFootprint(c, x, z, 0.15)) best = c;
  }
  return best;
}

// Push a vertical capsule (feet at pos.y) out of colliders it overlaps horizontally.
// Returns the last push normal (x, z) or null.
const _n = { x: 0, z: 0 };
export function resolveHorizontal(pos, radius, height, step = STEP) {
  let hit = null;
  const ids = nearDisc(pos.x, pos.z, Math.max(0, radius + 0.5 - GRID_PAD)); // (a push moves it a little: room for that)
  for (let k = 0; k < ids.length; k++) {
    const c = colliders[ids[k]];
    if (!c.enabled || c.top <= pos.y + step || c.bottom >= pos.y + height) continue;
    if (c.type === 'box') {
      const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        pos.x = cx + dx * radius; pos.z = cz + dz * radius;
        _n.x = dx; _n.z = dz;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const pens = [pos.x - c.minX, c.maxX - pos.x, pos.z - c.minZ, c.maxZ - pos.z];
        const m = pens.indexOf(Math.min(...pens));
        if (m === 0) { pos.x = c.minX - radius; _n.x = -1; _n.z = 0; }
        if (m === 1) { pos.x = c.maxX + radius; _n.x = 1; _n.z = 0; }
        if (m === 2) { pos.z = c.minZ - radius; _n.x = 0; _n.z = -1; }
        if (m === 3) { pos.z = c.maxZ + radius; _n.x = 0; _n.z = 1; }
      }
      hit = _n;
    } else {
      let dx = pos.x - c.x, dz = pos.z - c.z;
      const r = c.r + radius, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 1e-4;
      dx /= d; dz /= d;
      pos.x = c.x + dx * r; pos.z = c.z + dz * r;
      _n.x = dx; _n.z = dz;
      hit = _n;
    }
  }
  pos.x = clamp(pos.x, FLOOR_BOUNDS.minX, FLOOR_BOUNDS.maxX);
  pos.z = clamp(pos.z, FLOOR_BOUNDS.minZ, FLOOR_BOUNDS.maxZ);
  return hit;
}

// Is a point inside solid geometry? Returns { collider, top: bool } or null.
export function solidAt(p, pad = 0) {
  if (p.y < FLOOR_Y) return { collider: null, top: true, groundY: FLOOR_Y };
  const ids = near(p.x, p.z, pad) || colliders.map((c, i) => i);
  for (let k = 0; k < ids.length; k++) {
    const c = colliders[ids[k]];
    if (!c.enabled || p.y > c.top + pad || p.y < c.bottom - pad) continue;
    if (insideFootprint(c, p.x, p.z, pad)) return { collider: c, top: false, groundY: c.top };
  }
  return null;
}

// Ray against colliders and the floor. dir must be normalised. Returns distance or maxDist.
export function raycastWorld(o, d, maxDist = 400, ignore = null) {
  let best = maxDist;
  if (d.y < -1e-6) {
    const t = (FLOOR_Y - o.y) / d.y;
    if (t > 0 && t < best) best = t;
  }
  // (0.53) only the colliders in the grid cells the ray crosses (walked cell by cell, nearest first:
  // it stops once a hit is nearer than the next cell), plus those reaching outside the grid
  const s = ++stampN;
  const test = (i) => {
    if (stamps[i] === s) return;
    stamps[i] = s;
    const c = colliders[i];
    if (!c.enabled || c === ignore) return;
    const t = c.type === 'box' ? rayBox(o, d, c) : rayCyl(o, d, c);
    if (t !== null && t < best) best = t;
  };
  if (o.x < GX0 || o.z < GZ0 || o.x >= GX0 + GW * GRID_CELL || o.z >= GZ0 + GH * GRID_CELL) { // (from outside the grid: every collider)
    for (let i = 0; i < colliders.length; i++) test(i);
    return best;
  }
  for (const i of outer) test(i);
  let gx = cellX(o.x), gz = cellZ(o.z);
  const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
  const ax = Math.abs(d.x) > 1e-9, az = Math.abs(d.z) > 1e-9;
  const cx0 = GX0 + gx * GRID_CELL, cz0 = GZ0 + gz * GRID_CELL;
  let tx = ax ? ((d.x > 0 ? cx0 + GRID_CELL : cx0) - o.x) / d.x : Infinity, tz = az ? ((d.z > 0 ? cz0 + GRID_CELL : cz0) - o.z) / d.z : Infinity;
  const dtx = ax ? GRID_CELL / Math.abs(d.x) : Infinity, dtz = az ? GRID_CELL / Math.abs(d.z) : Infinity;
  for (let n = 0; n < GW + GH + 2; n++) {
    for (const i of cells[gx + gz * GW]) test(i);
    const next = Math.min(tx, tz);
    if (next >= best) break; // (nothing further on can be nearer)
    if (tx < tz) { gx += stepX; tx += dtx; } else { gz += stepZ; tz += dtz; }
    if (gx < 0 || gx >= GW || gz < 0 || gz >= GH) break;
  }
  return best;
}

export const __rayOne = (o, d, c) => (c.type === 'box' ? rayBox(o, d, c) : rayCyl(o, d, c)); // (for the tests)
function rayBox(o, d, c) {
  let tmin = -Infinity, tmax = Infinity;
  const mins = [c.minX, c.bottom, c.minZ], maxs = [c.maxX, c.top, c.maxZ];
  const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - os[i]) / ds[i], t2 = (maxs[i] - os[i]) / ds[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : null; // origin inside: ignore
}

function rayCyl(o, d, c) {
  let best = null;
  const ox = o.x - c.x, oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const y = o.y + d.y * t;
      if (t >= 0 && y >= c.bottom && y <= c.top) best = t;
    }
  }
  if (Math.abs(d.y) > 1e-9) {
    for (const py of [c.top, c.bottom]) {
      const t = (py - o.y) / d.y;
      if (t < 0 || (best !== null && t >= best)) continue;
      const x = ox + d.x * t, z = oz + d.z * t;
      if (x * x + z * z <= c.r * c.r) best = t;
    }
  }
  return best;
}

export function hasLineOfSight(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if (len < 1e-3) return true;
  d.divideScalar(len);
  return raycastWorld(a, d, len) >= len - 0.3;
}

// Closest distance between segments p1-q1 and p2-q2 (squared). Standard clamp method.
export function segSegDist2(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const x = p1.x + d1x * s - (p2.x + d2x * t);
  const y = p1.y + d1y * s - (p2.y + d2y * t);
  const z = p1.z + d1z * s - (p2.z + d2z * t);
  return x * x + y * y + z * z;
}

export function segPointDist2(p, q, c) {
  const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-9 ? ((c.x - p.x) * dx + (c.y - p.y) * dy + (c.z - p.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = p.x + dx * t - c.x, y = p.y + dy * t - c.y, z = p.z + dz * t - c.z;
  return x * x + y * y + z * z;
}

// Low-arc launch direction to hit `target` from `from` at speed v under gravity g.
// Returns a unit vector, or the 45-degree max-range direction if out of reach.
export function solveLob(from, target, v, g, out = new THREE.Vector3()) {
  const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - from.y;
  const d = Math.hypot(dx, dz) || 1e-3;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  const theta = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * d));
  const c = Math.cos(theta);
  return out.set((dx / d) * c, Math.sin(theta), (dz / d) * c).normalize();
}
