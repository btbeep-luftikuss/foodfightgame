// Shared constants, math helpers and world collision queries.
// Units are player-scale metres (a Titan is ~1.9 m tall); y is up.
import * as THREE from 'three';

export const G = 20; // gravity, tuned slightly above Earth for snappier jumps
export const COUNTER = { minX: -60, maxX: 60, minZ: -32, maxZ: 32, top: 0 };
export const FLOOR_Y = -36; // the kitchen floor, one counter-height below
export const FLOOR_BOUNDS = { minX: -118, maxX: 118, minZ: -84, maxZ: 84 };
export const STEP = 0.6;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

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

export function addBox(minX, maxX, minZ, maxZ, bottom, top, props = {}) {
  const c = { type: 'box', minX, maxX, minZ, maxZ, bottom, top, enabled: true, ...props };
  colliders.push(c);
  return c;
}

export function addCyl(x, z, r, bottom, top, props = {}) {
  const c = { type: 'cyl', x, z, r, bottom, top, enabled: true, ...props };
  colliders.push(c);
  return c;
}

export function clearColliders() { colliders.length = 0; }

function insideFootprint(c, x, z, pad) {
  if (c.type === 'box') return x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad;
  const dx = x - c.x, dz = z - c.z, r = c.r + pad;
  return dx * dx + dz * dz <= r * r;
}

// Highest walkable surface under (x, z) that can be reached from feetY (stepping up at most `step`).
export function groundHeight(x, z, feetY, step = STEP, pad = 0.15) {
  let h = FLOOR_Y;
  for (const c of colliders) {
    if (!c.enabled || c.top > feetY + step || c.top <= h) continue;
    if (insideFootprint(c, x, z, pad)) h = c.top;
  }
  return h;
}

// Which collider (if any) provides the ground under a point; used for surface types.
export function groundCollider(x, z, y) {
  let best = null;
  for (const c of colliders) {
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
  for (const c of colliders) {
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
  for (const c of colliders) {
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
  for (const c of colliders) {
    if (!c.enabled || c === ignore) continue;
    const t = c.type === 'box' ? rayBox(o, d, c) : rayCyl(o, d, c);
    if (t !== null && t < best) best = t;
  }
  return best;
}

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
