// Human Titans (0.14): sculpted, skinned characters.
//
// Every Titan is ONE skinned mesh (plus hair and costume pieces) instead of a stack of capsules:
//  - The body is lofted from cross-sections: a torso with chest, shoulder blades, waist, belt and hips;
//    arms and legs that bend smoothly at the elbow and knee (vertices blend between two bones); hands
//    with fingers and a thumb; sneakers with soles and laces; a sculpted head with jaw, cheekbones and
//    eye sockets, eyes with iris, pupil and a catchlight, blinking eyelids, brows, nose, lips and ears.
//  - Colours come from a per-Titan palette: each vertex stores a "part" id (skin, shirt, cuff, belt,
//    shoe, sole, iris...) and the shader looks its colour, roughness and metalness up in the palette.
//    One material and one draw call per Titan, whatever the outfit. A per-vertex ambient-occlusion
//    term darkens armpits, creases, the crotch and under the chin.
//  - An 18-bone skeleton is posed procedurally every frame (walk and run cycles, jump, glide, dash,
//    wind-up and throw, eat, shield, look up/down with the aim, blink).
//  - Two levels of detail share the skeleton: about 13k vertices up close, about 2k further away.
import * as THREE from 'three';

export const SKIN_TONES = ['#f6d3b3', '#eab893', '#d49a6a', '#b07346', '#8a5530', '#6b3f22', '#f2c6a0', '#c98b5e'];
export const HAIR_COLORS = ['#2a1c14', '#4a2f1c', '#7a4a26', '#c8923a', '#e6cf8a', '#161616', '#a3402a', '#8a8f99'];
export const HAIR_STYLES = ['short', 'spiky', 'long', 'bun', 'buzz', 'curly', 'mohawk', 'ponytail', 'bob', 'afro'];
export const IRIS_COLORS = ['#4a2e1c', '#6b4424', '#2f6fa8', '#4f8a4a', '#7a6a3a', '#5a6a7a'];
export const SHOE_COLORS = ['#f4f1ea', '#1e1e24', '#d8342c', '#2f5fd0', '#f2c230', '#7a4a2a', '#3aa860', '#ff7a2a'];
export const BEARDS = ['stubble', 'full', 'goatee'];
export const pick = (list) => list[(Math.random() * list.length) | 0];

// ---------------------------------------------------------------- small math helpers
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (v, s) => Math.exp(-(v * v) / (s * s));
const band = (v, lo, hi) => (v <= lo || v >= hi ? 0 : Math.sin((Math.PI * (v - lo)) / (hi - lo)));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const TAU = Math.PI * 2;
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// A smooth curve through keys [[x, v1, v2, ...], ...] (x ascending).
function curve(keys) {
  return (x) => {
    let i = 0;
    while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const t = clamp01((x - k1[0]) / (k2[0] - k1[0]));
    const out = [];
    for (let c = 1; c < k1.length; c++) out.push(catmull(k0[c], k1[c], k2[c], k3[c], t));
    return out;
  };
}

// ---------------------------------------------------------------- palette parts
export const P = {
  skin: 0, shirt: 1, accent: 2, midArm: 3, forearm: 4, shortCuff: 5, longCuff: 6, hands: 7, pants: 8, belt: 9,
  buckle: 10, shoes: 11, soles: 12, laces: 13, hair: 14, eyeWhite: 15, iris: 16, dark: 17, lips: 18, catch: 19,
  lowerLeg: 20, collar: 21, socks: 22,
};
const PAL_N = 24;

// ---------------------------------------------------------------- skeleton (model space: feet at y = 0, facing +z)
const D8 = THREE.MathUtils.degToRad(8);
export const HEAD_C = V(0, 1.745, 0.012); // centre of the skull
const HA = 0.148, HB = 0.182, HCZ = 0.168; // skull half-width, half-height, half-depth
const EYE = V(0.058, 1.757, 0.134), EYE_R = 0.031;
const armFrame = (side) => ({
  S: V(0.205 * side, 1.398, -0.012),                     // shoulder joint
  d: V(Math.sin(D8) * side, -Math.cos(D8), 0),           // down the arm (hanging 8 degrees out)
  ex: V(Math.cos(D8) * side, Math.sin(D8), 0),           // outward, across the arm
});
const legFrame = (side) => {
  const H = V(0.092 * side, 0.925, 0), A = V(0.097 * side, 0.085, -0.005);
  return { H, A, d: A.clone().sub(H).normalize(), len: H.distanceTo(A) };
};
const AL = armFrame(1), AR = armFrame(-1), LL = legFrame(1), LR = legFrame(-1);
export const BONE_NAMES = ['hips', 'spine', 'chest', 'neck', 'head', 'lids', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
const PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', lids: 'head',
  upperArmL: 'chest', foreArmL: 'upperArmL', handL: 'foreArmL', upperArmR: 'chest', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};
const at = (f, s) => f.S.clone().addScaledVector(f.d, s);
const atLeg = (f, s) => f.H.clone().addScaledVector(f.d, s);
export const BONE_REST = {
  hips: V(0, 0.95, 0), spine: V(0, 1.08, 0), chest: V(0, 1.27, 0), neck: V(0, 1.49, 0), head: V(0, 1.6, 0), lids: V(0, EYE.y, EYE.z),
  upperArmL: AL.S.clone(), foreArmL: at(AL, 0.29), handL: at(AL, 0.55),
  upperArmR: AR.S.clone(), foreArmR: at(AR, 0.29), handR: at(AR, 0.55),
  thighL: LL.H.clone(), shinL: atLeg(LL, 0.425), footL: LL.A.clone(),
  thighR: LR.H.clone(), shinR: atLeg(LR, 0.425), footR: LR.A.clone(),
};
export const HEAD_BONE_Y = BONE_REST.head.y;

// ---------------------------------------------------------------- geometry builder
// Collects vertices with skin weights, a palette part and an AO term. Each surface is oriented
// outward and gets smooth normals of its own (parts never share vertices, so seams stay crisp).
class Builder {
  constructor() { this.P = []; this.N = []; this.I = []; this.SI = []; this.SW = []; this.PT = []; this.AO = []; }
  get n() { return this.P.length / 3; }
  vert(x, y, z, a) {
    this.P.push(x, y, z); this.N.push(0, 0, 0);
    const b = (a.b || [[0, 1]]).filter((e) => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
    let sum = 0;
    for (const e of b) sum += e[1];
    for (let k = 0; k < 4; k++) { const e = b[k]; this.SI.push(e ? e[0] : 0); this.SW.push(e ? e[1] / sum : 0); }
    this.PT.push(a.part ?? 0); this.AO.push(a.ao ?? 1);
  }
  // orient triangles [idx0..] so they face away from `center` (or the surface centroid), then smooth normals
  finish(base, idx0, center = null) {
    const Pp = this.P, I = this.I;
    let c = center;
    if (!c) {
      c = V();
      for (let v = base; v < this.n; v++) { c.x += Pp[v * 3]; c.y += Pp[v * 3 + 1]; c.z += Pp[v * 3 + 2]; }
      c.divideScalar(Math.max(1, this.n - base));
    }
    const a = V(), b = V(), d = V(), e1 = V(), e2 = V(), fn = V();
    let vote = 0;
    const tri = (k) => { a.fromArray(Pp, I[k] * 3); b.fromArray(Pp, I[k + 1] * 3); d.fromArray(Pp, I[k + 2] * 3); e1.subVectors(b, a); e2.subVectors(d, a); fn.crossVectors(e1, e2); };
    for (let k = idx0; k < I.length; k += 3) {
      tri(k);
      const cx = (a.x + b.x + d.x) / 3 - c.x, cy = (a.y + b.y + d.y) / 3 - c.y, cz = (a.z + b.z + d.z) / 3 - c.z;
      vote += fn.x * cx + fn.y * cy + fn.z * cz;
    }
    if (vote < 0) for (let k = idx0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
    this.smooth(idx0);
  }
  smooth(idx0) {
    const Pp = this.P, I = this.I, N = this.N;
    const a = V(), b = V(), d = V(), e1 = V(), e2 = V(), fn = V();
    for (let k = idx0; k < I.length; k += 3) {
      a.fromArray(Pp, I[k] * 3); b.fromArray(Pp, I[k + 1] * 3); d.fromArray(Pp, I[k + 2] * 3);
      e1.subVectors(b, a); e2.subVectors(d, a); fn.crossVectors(e1, e2);
      for (let q = 0; q < 3; q++) { const v = I[k + q] * 3; N[v] += fn.x; N[v + 1] += fn.y; N[v + 2] += fn.z; }
    }
  }
  geometry() {
    const N = this.N;
    for (let v = 0; v < N.length; v += 3) {
      const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1;
      N[v] /= l; N[v + 1] /= l; N[v + 2] /= l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setAttribute('part', new THREE.Float32BufferAttribute(this.PT, 1));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(this.AO, 1));
    g.setIndex(this.I);
    return g;
  }
}

// A closed (or capped) surface made of rings: pos(i, j, out) fills ring i, column j of M.
function surface(B, nR, M, pos, attr, { top = null, bottom = null, center = null } = {}) {
  const base = B.n, idx0 = B.I.length, p = V();
  for (let i = 0; i < nR; i++) {
    for (let j = 0; j < M; j++) { pos(i, j, p); B.vert(p.x, p.y, p.z, typeof attr === 'function' ? attr(i, j, p) : attr); }
  }
  const id = (i, j) => base + i * M + (j % M);
  for (let i = 0; i < nR - 1; i++) {
    for (let j = 0; j < M; j++) B.I.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1));
  }
  if (top) { const t = B.n; B.vert(top.p.x, top.p.y, top.p.z, top.a); for (let j = 0; j < M; j++) B.I.push(t, id(0, j), id(0, j + 1)); }
  if (bottom) { const t = B.n; B.vert(bottom.p.x, bottom.p.y, bottom.p.z, bottom.a); for (let j = 0; j < M; j++) B.I.push(id(nR - 1, j), t, id(nR - 1, j + 1)); }
  B.finish(base, idx0, center);
}

// Ellipsoid along three axes (ax: unit vectors, r: radii). cap: 'top' or 'bottom' keeps only that cap, down to phiMax.
function ellip(B, c, axes, r, nR, M, attr, { cap = null, phiMax = Math.PI } = {}) {
  const [X, Y, Z] = axes;
  const phi0 = 0.08, rings = [];
  if (cap === 'top') for (let i = 0; i < nR; i++) rings.push(phi0 + ((phiMax - phi0) * (i + 1)) / nR);
  else if (cap === 'bottom') for (let i = 0; i < nR; i++) rings.push(Math.PI - phiMax + ((phiMax - phi0) * i) / nR);
  else for (let i = 0; i < nR; i++) rings.push(phi0 + ((Math.PI - 2 * phi0) * i) / (nR - 1));
  const pt = (phi, a, out) => {
    const sx = Math.sin(phi) * Math.sin(a) * r[0], sy = Math.cos(phi) * r[1], sz = Math.sin(phi) * Math.cos(a) * r[2];
    return out.copy(c).addScaledVector(X, sx).addScaledVector(Y, sy).addScaledVector(Z, sz);
  };
  const A = typeof attr === 'function' ? attr : () => attr;
  surface(B, rings.length, M, (i, j, p) => pt(rings[i], (j / M) * TAU, p), (i, j, p) => A(i, j, p, rings.length), {
    top: cap === 'bottom' ? null : { p: pt(0, 0, V()), a: A(-1, 0, null, rings.length) },
    bottom: cap === 'top' ? null : { p: pt(Math.PI, 0, V()), a: A(rings.length, 0, null, rings.length) },
    center: c,
  });
}
const AXES = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
const rotAxes = (euler) => { const q = new THREE.Quaternion().setFromEuler(euler); return AXES.map((a) => a.clone().applyQuaternion(q)); };
const E = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

// Capsule from a to b (radius r0 at a, r1 at b) with rounded ends.
function capsule(B, a, b, r0, r1, M, attr, nc = 3) {
  const dir = b.clone().sub(a).normalize();
  const ref = Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const e1 = V().crossVectors(dir, ref).normalize(), e2 = V().crossVectors(dir, e1);
  const rings = [];
  for (let q = 1; q <= nc; q++) { const t = (Math.PI / 2) * (1 - q / nc); rings.push([a.clone().addScaledVector(dir, -r0 * Math.sin(t)), r0 * Math.cos(t)]); }
  for (let q = nc; q >= 1; q--) { const t = (Math.PI / 2) * (1 - q / nc); rings.push([b.clone().addScaledVector(dir, r1 * Math.sin(t)), r1 * Math.cos(t)]); }
  surface(B, rings.length, M, (i, j, p) => {
    const [c, r] = rings[i], ang = (j / M) * TAU;
    p.copy(c).addScaledVector(e1, Math.cos(ang) * r).addScaledVector(e2, Math.sin(ang) * r);
  }, attr, { top: { p: a.clone().addScaledVector(dir, -r0), a: attr }, bottom: { p: b.clone().addScaledVector(dir, r1), a: attr } });
}

// ---------------------------------------------------------------- torso
const TORSO = curve([ // y, half-width, front depth, back depth
  [0.803, 0.030, 0.030, 0.030],
  [0.818, 0.075, 0.055, 0.058],
  [0.845, 0.128, 0.082, 0.090],
  [0.880, 0.162, 0.100, 0.118],
  [0.925, 0.170, 0.104, 0.122],
  [0.965, 0.160, 0.101, 0.108],
  [0.995, 0.156, 0.100, 0.104],
  [1.040, 0.150, 0.100, 0.100],
  [1.110, 0.152, 0.104, 0.098],
  [1.190, 0.164, 0.112, 0.100],
  [1.270, 0.180, 0.122, 0.104],
  [1.340, 0.196, 0.128, 0.110],
  [1.400, 0.206, 0.118, 0.112],
  [1.440, 0.200, 0.102, 0.105],
  [1.475, 0.172, 0.088, 0.094],
  [1.510, 0.118, 0.072, 0.080],
  [1.535, 0.075, 0.062, 0.066],
  [1.548, 0.058, 0.052, 0.058],
]);
const TORSO_Y_HI = [1.548, 1.54, 1.528, 1.5175, 1.5165, 1.505, 1.4955, 1.4945, 1.485, 1.47, 1.45, 1.43, 1.41, 1.39, 1.37, 1.345, 1.32, 1.29, 1.26, 1.23, 1.2, 1.17,
  1.14, 1.11, 1.08, 1.05, 1.025, 1.013, 1.011, 1.0, 0.997, 0.9935, 0.98, 0.967, 0.963, 0.95, 0.935, 0.92, 0.905, 0.89, 0.875, 0.86, 0.848,
  0.836, 0.826, 0.816, 0.809];
const TORSO_Y_LO = [1.548, 1.5175, 1.5165, 1.4955, 1.4945, 1.45, 1.38, 1.28, 1.16, 1.04, 0.997, 0.9935, 0.967, 0.963, 0.92, 0.87, 0.825];
const torsoPart = (y) => (y > 1.517 ? P.skin : y >= 1.495 ? P.collar : y >= 0.995 ? P.shirt : y >= 0.965 ? P.belt : P.pants);
const torsoScale = (y) => (y > 1.517 ? 1 : y >= 1.495 ? 1.05 : y >= 0.995 && y < 1.012 ? 1.025 : y >= 0.965 && y < 0.995 ? 1.045 : 1);
function torsoBones(x, y) {
  const t1 = sstep(0.98, 1.13, y), t2 = sstep(1.13, 1.3, y), t3 = sstep(1.47, 1.56, y) * 0.6;
  const wa = sstep(0.12, 0.2, Math.abs(x)) * sstep(1.3, 1.42, y) * 0.35;
  const k = 1 - wa;
  return [[BI.hips, (1 - t1) * k], [BI.spine, t1 * (1 - t2) * k], [BI.chest, t1 * t2 * (1 - t3) * k], [BI.neck, t1 * t2 * t3 * k], [x > 0 ? BI.upperArmL : BI.upperArmR, wa]];
}
function torso(B, hi) {
  const ys = hi ? TORSO_Y_HI : TORSO_Y_LO, M = hi ? 28 : 12, ex = 2 / 2.5;
  let lastU = 0;
  surface(B, ys.length, M, (i, j, p) => {
    const y = ys[i], a = (j / M) * TAU, s = Math.sin(a), c = Math.cos(a);
    let [w, df, db] = TORSO(y);
    w *= 1 + 0.07 * sstep(1.05, 1.3, y) * (1 - sstep(1.47, 1.53, y)) + 0.03 * band(y, 0.84, 1.0);
    const x = w * spow(s, ex);
    let z = (c >= 0 ? df : db) * spow(c, ex);
    const u = x / w, au = Math.abs(u);
    if (c > 0) {
      z += 0.008 * gauss(au - 0.5, 0.3) * band(y, 1.26, 1.4) * c;   // chest
      z += 0.004 * gauss(u, 0.5) * band(y, 1.02, 1.12) * c;          // belly
    } else {
      z -= 0.008 * gauss(au - 0.5, 0.3) * band(y, 1.3, 1.44) * -c;   // shoulder blades
      z += 0.006 * gauss(u, 0.12) * band(y, 1.02, 1.45);             // spine groove
      z -= 0.012 * gauss(au - 0.48, 0.32) * band(y, 0.84, 0.97) * -c; // glutes
      z += 0.008 * gauss(u, 0.08) * band(y, 0.83, 0.95);
    }
    const k = torsoScale(y);
    lastU = au;
    p.set(x * k, y, z * k);
  }, (i, j, p) => {
    const y = p.y;
    let ao = 0.86 + 0.14 * sstep(0.82, 1.32, y);
    ao *= 1 - 0.22 * sstep(0.78, 0.98, lastU) * band(y, 1.26, 1.44);       // armpits
    if (y < 0.86) ao *= 0.75 + 0.25 * sstep(0.8, 0.86, y);                  // crotch
    if (y > 1.49 && y < 1.496) ao *= 0.85;                                  // under the collar
    if (y > 0.988 && y < 0.996) ao *= 0.8;                                  // shirt hem over the belt
    return { b: torsoBones(p.x, y), part: torsoPart(y), ao };
  }, {
    top: { p: V(0, 1.556, 0), a: { b: [[BI.neck, 0.5], [BI.chest, 0.5]], part: P.skin } },
    bottom: { p: V(0, 0.8, 0.005), a: { b: [[BI.hips, 1]], part: P.pants, ao: 0.6 } },
    center: V(0, 1.2, 0),
  });
  // belt buckle
  ellip(B, V(0, 0.98, 0.1075), AXES, [0.021, 0.014, 0.0045], hi ? 5 : 3, hi ? 12 : 6, { b: [[BI.hips, 1]], part: P.buckle, ao: 1 });
}

// ---------------------------------------------------------------- neck and head
function neck(B, hi) {
  const ys = hi ? [1.69, 1.67, 1.64, 1.61, 1.58, 1.55, 1.52, 1.49, 1.47] : [1.69, 1.6, 1.53, 1.47], M = hi ? 16 : 8;
  surface(B, ys.length, M, (i, j, p) => {
    const y = ys[i], a = (j / M) * TAU, s = Math.sin(a), c = Math.cos(a);
    const flare = 1 + Math.max(0, 1.52 - y) * 2.2;
    p.set(0.058 * s * flare, y, -0.004 + (c >= 0 ? 0.052 : 0.06) * c * (1 + Math.max(0, 1.52 - y) * 0.8));
  }, (i, j, p) => {
    const y = p.y, wh = sstep(1.6, 1.67, y);
    const b = y < 1.53 ? [[BI.chest, 0.45], [BI.neck, 0.55]] : [[BI.neck, 1 - wh], [BI.head, wh]];
    return { b, part: P.skin, ao: p.z > 0.02 && y > 1.58 ? 0.8 : 0.93 };
  }, { top: { p: V(0, 1.705, -0.004), a: { b: [[BI.head, 1]], part: P.skin } }, bottom: { p: V(0, 1.46, 0), a: { b: [[BI.chest, 1]], part: P.skin } } });
}
export function headPoint(ux, uy, uz, out = V()) {
  let x = ux * HA, y = uy * HB, z = uz * HCZ;
  if (uy < 0) x *= 1 - 0.26 * Math.pow(-uy, 1.4);                    // jaw narrows toward the chin
  if (uy < -0.72) y = HB * (-0.72 + (uy + 0.72) * 0.7);                // flatter under the chin
  if (uz > 0 && uy < -0.35) z += 0.02 * (-uy - 0.35) * uz;            // chin forward
  if (uz < 0) z *= 1 + 0.08 * sstep(-0.4, 0.4, uy);                    // back of the skull
  if (uz > 0.4 && uy > 0.2) z *= 1 - 0.05 * (uy - 0.2);                // forehead
  const ax = Math.abs(ux);
  z += 0.009 * Math.exp(-((ax - 0.55) ** 2 + (uy + 0.1) ** 2 + (uz - 0.8) ** 2) / 0.03);  // cheekbones
  z -= 0.012 * Math.exp(-((ax - 0.37) ** 2 + (uy - 0.12) ** 2 + (uz - 0.92) ** 2) / 0.012); // eye sockets
  x -= Math.sign(ux) * 0.005 * Math.exp(-((ax - 0.85) ** 2 + (uy - 0.35) ** 2) / 0.03);  // temples
  return out.set(x + HEAD_C.x, y + HEAD_C.y, z + HEAD_C.z);
}
function head(B, hi) {
  const nR = hi ? 30 : 12, M = hi ? 40 : 16;
  const phi = (i) => 0.05 + ((Math.PI - 0.1) * i) / (nR - 1);
  const u = V();
  surface(B, nR, M, (i, j, p) => {
    const f = phi(i), a = (j / M) * TAU;
    u.set(Math.sin(f) * Math.sin(a), Math.cos(f), Math.sin(f) * Math.cos(a));
    headPoint(u.x, u.y, u.z, p);
  }, () => {
    let ao = 1;
    if (u.y < -0.62) ao *= 0.8 + 0.2 * sstep(-1, -0.62, u.y);
    ao *= 1 - 0.12 * Math.exp(-((Math.abs(u.x) - 0.37) ** 2 + (u.y - 0.1) ** 2 + (u.z - 0.92) ** 2) / 0.02);
    const az = Math.abs(Math.atan2(u.x, u.z));
    if (az > 1.5 && az < 2.1 && u.y < 0.05 && u.y > -0.45) ao *= 0.9;
    return { b: [[BI.head, 1]], part: P.skin, ao };
  }, { top: { p: headPoint(0, 1, 0, V()), a: { b: [[BI.head, 1]], part: P.skin } }, bottom: { p: headPoint(0, -1, 0, V()), a: { b: [[BI.head, 1]], part: P.skin, ao: 0.8 } }, center: HEAD_C });
}
function face(B, hi) {
  const H = { b: [[BI.head, 1]] };
  const at = (part, ao = 1) => ({ ...H, part, ao });
  for (const s of [1, -1]) {
    const e = V(EYE.x * s, EYE.y, EYE.z);
    ellip(B, e, AXES, [EYE_R, EYE_R, EYE_R], hi ? 10 : 6, hi ? 16 : 8, at(P.eyeWhite));
    if (hi) {
      ellip(B, e.clone().add(V(0, 0, 0.0282)), AXES, [0.0158, 0.0158, 0.0035], 5, 14, at(P.iris));
      ellip(B, e.clone().add(V(0, 0, 0.0312)), AXES, [0.0075, 0.0075, 0.0016], 4, 10, at(P.dark));
      ellip(B, e.clone().add(V(0.006, 0.0085, 0.0318)), AXES, [0.0038, 0.0038, 0.0012], 3, 8, at(P.catch));
      // upper lid on the blinking "lids" bone; its rim is the lash line
      ellip(B, e, AXES, [EYE_R + 0.0026, EYE_R + 0.0026, EYE_R + 0.0026], 7, 18, (i, j, p, n) => ({ b: [[BI.lids, 1]], part: i >= n - 1 ? P.dark : P.skin, ao: 0.95 }), { cap: 'top', phiMax: 1.22 });
      ellip(B, e, AXES, [EYE_R + 0.0022, EYE_R + 0.0022, EYE_R + 0.0022], 4, 18, at(P.skin, 0.92), { cap: 'bottom', phiMax: 0.8 });
    } else {
      ellip(B, e.clone().add(V(0, 0, 0.027)), AXES, [0.016, 0.016, 0.006], 3, 8, at(P.dark));
    }
    // brow
    ellip(B, V(0.062 * s, 1.806, 0.1545), rotAxes(E(0.1, 0.38 * s, -0.12 * s)), [0.034, 0.0068, 0.0075], hi ? 6 : 3, hi ? 14 : 6, at(P.hair));
    // ear (+ a darker inner bowl up close)
    ellip(B, V(0.147 * s, 1.738, -0.004), rotAxes(E(0, 0.42 * s, 0)), [0.016, 0.038, 0.027], hi ? 7 : 4, hi ? 12 : 6, at(P.skin, 0.9));
    if (hi) ellip(B, V(0.1555 * s, 1.736, 0.0), rotAxes(E(0, 0.42 * s, 0)), [0.0065, 0.021, 0.013], 4, 10, at(P.skin, 0.62));
    // nose wings and nostrils
    ellip(B, V(0.0135 * s, 1.704, 0.17), AXES, [0.011, 0.009, 0.011], hi ? 5 : 3, hi ? 10 : 6, at(P.skin, 0.95));
    if (hi) {
      ellip(B, V(0.0085 * s, 1.6985, 0.1855), rotAxes(E(0.45, 0, 0)), [0.0045, 0.0026, 0.0038], 3, 8, at(P.dark));
      ellip(B, V(0.034 * s, 1.6555, 0.152), AXES, [0.0045, 0.004, 0.004], 3, 8, at(P.dark));
    }
  }
  ellip(B, V(0, 1.748, 0.161), rotAxes(E(-0.22, 0, 0)), [0.012, 0.034, 0.012], hi ? 6 : 3, hi ? 10 : 6, at(P.skin));        // nose bridge
  ellip(B, V(0, 1.712, 0.178), AXES, [0.02, 0.019, 0.02], hi ? 7 : 4, hi ? 12 : 6, at(P.skin));                           // nose tip
  ellip(B, V(0, 1.6605, 0.158), rotAxes(E(0.18, 0, 0)), [0.034, 0.0085, 0.0125], hi ? 6 : 3, hi ? 16 : 6, at(P.lips));  // upper lip
  ellip(B, V(0, 1.6455, 0.156), rotAxes(E(-0.2, 0, 0)), [0.03, 0.0105, 0.013], hi ? 6 : 3, hi ? 16 : 6, at(P.lips));    // lower lip
  ellip(B, V(0, 1.6535, 0.1625), AXES, [0.035, 0.0024, 0.0075], 3, hi ? 12 : 6, at(P.dark));                              // mouth line
}

// ---------------------------------------------------------------- arms and hands
const ARM = curve([ // s along the arm, radius across, radius front-back, front offset
  [0.00, 0.072, 0.072, 0.000],
  [0.05, 0.077, 0.075, 0.000],
  [0.12, 0.070, 0.073, 0.004],
  [0.20, 0.064, 0.069, 0.006],
  [0.27, 0.058, 0.058, 0.000],
  [0.29, 0.055, 0.055, -0.002],
  [0.32, 0.056, 0.057, 0.000],
  [0.38, 0.056, 0.060, 0.002],
  [0.46, 0.046, 0.052, 0.001],
  [0.53, 0.036, 0.045, 0.000],
  [0.55, 0.034, 0.043, 0.000],
]);
const CAP = 0.046; // how far the rounded shoulder end reaches above the joint
const ARM_S_HI = [-0.054, -0.05, -0.042, -0.03, -0.016, 0, 0.03, 0.06, 0.09, 0.115, 0.128, 0.1295, 0.1375, 0.145, 0.1465, 0.17, 0.2, 0.23, 0.26,
  0.28, 0.3, 0.32, 0.35, 0.38, 0.41, 0.44, 0.47, 0.5, 0.519, 0.5205, 0.535, 0.55];
const ARM_S_LO = [-0.045, -0.022, 0, 0.1, 0.128, 0.1295, 0.1465, 0.24, 0.29, 0.38, 0.47, 0.519, 0.5205, 0.55];
const armPart = (s) => (s < 0.1295 ? P.shirt : s < 0.1465 ? P.shortCuff : s < 0.29 ? P.midArm : s < 0.5205 ? P.forearm : P.longCuff);
const armExtra = (s) => (s < 0.1295 ? 0.009 : s < 0.1465 ? 0.011 : s >= 0.5205 ? 0.005 : 0);
function armProfile(s) {
  if (s < 0) { const [rx, rz] = ARM(0); const k = Math.sqrt(Math.max(0, 1 - (s / CAP) ** 2)); return [rx * k, rz * k, 0]; }
  return ARM(Math.min(s, 0.55));
}
function arm(B, side, hi, sStart = -1) {
  const f = side > 0 ? AL : AR, F = V(0, 0, 1);
  const up = side > 0 ? BI.upperArmL : BI.upperArmR, fore = side > 0 ? BI.foreArmL : BI.foreArmR;
  const list = (hi ? ARM_S_HI : ARM_S_LO).filter((s) => s >= sStart), M = hi ? 16 : 8;
  surface(B, list.length, M, (i, j, p) => {
    const s = list[i], [rx, rz, cz] = armProfile(s), e = armExtra(s) * (s < 0 ? Math.sqrt(Math.max(0, 1 - (s / CAP) ** 2)) : 1);
    const a = (j / M) * TAU;
    p.copy(f.S).addScaledVector(f.d, s).addScaledVector(f.ex, (rx + e) * Math.sin(a)).addScaledVector(F, (rz + e) * Math.cos(a) + cz);
  }, (i, j) => {
    const s = list[i], a = (j / M) * TAU, med = -Math.sin(a), front = Math.cos(a);
    const wf = sstep(0.25, 0.33, s), wc = 0.3 * (1 - sstep(-0.04, 0.03, s));
    let ao = 1;
    ao *= 1 - 0.16 * gauss(s - 0.29, 0.03) * sstep(0.2, 0.8, front);        // inner elbow
    ao *= 1 - 0.2 * sstep(0.3, 0.9, med) * (1 - sstep(0.0, 0.08, s));       // armpit
    if (s > 0.1295 && s < 0.137) ao *= 0.9;
    return { b: [[up, (1 - wf) * (1 - wc)], [fore, wf * (1 - wc)], [BI.chest, wc]], part: armPart(s), ao };
  }, {
    top: { p: f.S.clone().addScaledVector(f.d, list[0] < 0 ? -CAP - 0.004 : list[0]), a: { b: [[up, 0.7], [BI.chest, 0.3]], part: P.shirt } },
    bottom: { p: f.S.clone().addScaledVector(f.d, 0.562), a: { b: [[fore, 1]], part: P.longCuff } },
  });
}
// Hand hanging from the wrist, palm toward the body, thumb forward. curl bends each finger joint toward the palm.
function hand(B, side, hi, curl = 0.32, thumbCurl = 0.25, bone = null) {
  const f = side > 0 ? AL : AR;
  const D = f.d, Md = f.ex.clone().negate(), F = V(0, 0, 1);
  const W = f.S.clone().addScaledVector(D, 0.55);
  const b = bone ?? (side > 0 ? BI.handL : BI.handR);
  const A = (part, ao = 1) => ({ b: [[b, 1]], part, ao });
  const pt = (d, m, fr) => W.clone().addScaledVector(D, d).addScaledVector(Md, m).addScaledVector(F, fr);
  ellip(B, pt(0.052, 0.002, 0), [Md, D, F], [0.019, 0.054, 0.043], hi ? 8 : 4, hi ? 14 : 8, A(P.hands));
  const bend = (k) => D.clone().multiplyScalar(Math.cos(k)).addScaledVector(Md, Math.sin(k)).normalize();
  if (hi) {
    const Z = [0.029, 0.01, -0.009, -0.026], L = [0.072, 0.08, 0.075, 0.06], R = [0.0115, 0.012, 0.0112, 0.0098];
    for (let k = 0; k < 4; k++) {
      const p0 = pt(0.094, 0.003, Z[k]);
      const p1 = p0.clone().addScaledVector(bend(curl * 0.5), 0.44 * L[k]);
      const p2 = p1.clone().addScaledVector(bend(curl * 1.5), 0.31 * L[k]);
      const p3 = p2.clone().addScaledVector(bend(curl * 2.4), 0.25 * L[k]);
      capsule(B, p0, p1, R[k], R[k] * 0.96, 8, A(P.hands, 0.97));
      capsule(B, p1, p2, R[k] * 0.95, R[k] * 0.9, 8, A(P.hands));
      capsule(B, p2, p3, R[k] * 0.9, R[k] * 0.82, 8, A(P.hands));
    }
    const t0 = pt(0.03, 0.01, 0.028);
    const td = D.clone().multiplyScalar(0.5).addScaledVector(F, 0.62).addScaledVector(Md, 0.35).normalize();
    const tb = (k) => td.clone().multiplyScalar(Math.cos(k)).addScaledVector(Md, Math.sin(k)).normalize();
    const t1 = t0.clone().addScaledVector(td, 0.04), t2 = t1.clone().addScaledVector(tb(thumbCurl), 0.032), t3 = t2.clone().addScaledVector(tb(thumbCurl * 2), 0.026);
    capsule(B, t0, t1, 0.0145, 0.0135, 8, A(P.hands));
    capsule(B, t1, t2, 0.0133, 0.0125, 8, A(P.hands));
    capsule(B, t2, t3, 0.0122, 0.011, 8, A(P.hands));
  } else {
    ellip(B, pt(0.118, 0.008, 0.0), [Md, bend(curl), F], [0.015, 0.045, 0.041], 4, 8, A(P.hands));
    ellip(B, pt(0.058, 0.012, 0.036), [Md, bend(0.4), F], [0.012, 0.03, 0.012], 3, 6, A(P.hands));
  }
}

// ---------------------------------------------------------------- legs and shoes
const LEG = curve([
  [0.000, 0.084, 0.090, 0.000],
  [0.080, 0.089, 0.098, 0.004],
  [0.200, 0.083, 0.091, 0.006],
  [0.320, 0.073, 0.079, 0.006],
  [0.400, 0.064, 0.068, 0.008],
  [0.425, 0.060, 0.064, 0.012],
  [0.460, 0.060, 0.061, 0.004],
  [0.530, 0.063, 0.069, -0.012],
  [0.600, 0.062, 0.068, -0.012],
  [0.680, 0.053, 0.058, -0.005],
  [0.760, 0.046, 0.047, 0.000],
  [0.840, 0.044, 0.045, 0.004],
]);
const LEG_S_HI = [-0.06, -0.055, -0.045, -0.03, -0.015, 0, 0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.33, 0.37, 0.4, 0.425, 0.4495, 0.4505, 0.48, 0.52, 0.56,
  0.6, 0.64, 0.68, 0.71, 0.735, 0.76, 0.7865, 0.7875, 0.8, 0.815, 0.83, 0.84];
const LEG_S_LO = [-0.05, -0.02, 0.05, 0.2, 0.35, 0.425, 0.4495, 0.4505, 0.62, 0.72, 0.7865, 0.7875, 0.84];
const legPart = (s) => (s < 0.45 ? P.pants : s < 0.7875 ? P.lowerLeg : P.socks);
function leg(B, side, hi) {
  const f = side > 0 ? LL : LR, X = V(side, 0, 0), F = V(0, 0, 1);
  const th = side > 0 ? BI.thighL : BI.thighR, sh = side > 0 ? BI.shinL : BI.shinR;
  const list = hi ? LEG_S_HI : LEG_S_LO, M = hi ? 16 : 8;
  surface(B, list.length, M, (i, j, p) => {
    const s = list[i];
    let [rx, rz, cz] = LEG(Math.max(0, s));
    let e = s < 0.7875 ? 0.008 + 0.014 * sstep(0.68, 0.7865, s) : 0;
    if (s < 0) { const k = Math.sqrt(Math.max(0, 1 - (s / 0.064) ** 2)); rx *= k; rz *= k; e *= k; }
    const a = (j / M) * TAU;
    p.copy(f.H).addScaledVector(f.d, s).addScaledVector(X, (rx + e) * Math.sin(a)).addScaledVector(F, (rz + e) * Math.cos(a) + cz);
  }, (i, j) => {
    const s = list[i], a = (j / M) * TAU, med = -Math.sin(a), front = Math.cos(a);
    const w = sstep(0.38, 0.47, s), wh = 0.3 * (1 - sstep(-0.03, 0.03, s));
    let ao = 1;
    ao *= 1 - 0.2 * sstep(0.2, 0.9, med) * (1 - sstep(0.02, 0.14, s));   // inner thigh
    ao *= 1 - 0.14 * gauss(s - 0.43, 0.04) * sstep(0.2, 0.9, -front);   // back of the knee
    ao *= 1 - 0.06 * (0.5 + 0.5 * Math.sin(s * 150 + a * 2)) * (gauss(s - 0.43, 0.05) + gauss(s - 0.76, 0.04)); // creases
    if (s >= 0.7875) ao *= 0.9;
    return { b: [[th, (1 - w) * (1 - wh)], [sh, w * (1 - wh)], [BI.hips, wh]], part: legPart(s), ao };
  }, {
    top: { p: f.H.clone().addScaledVector(f.d, -0.066), a: { b: [[th, 0.7], [BI.hips, 0.3]], part: P.pants } },
    bottom: { p: f.H.clone().addScaledVector(f.d, 0.848), a: { b: [[sh, 1]], part: P.socks } },
  });
}
const SHOE = curve([ // z from the ankle, half-width, height
  [-0.087, 0.012, 0.05],
  [-0.08, 0.03, 0.09],
  [-0.07, 0.04, 0.112],
  [-0.05, 0.046, 0.122],
  [-0.02, 0.049, 0.124],
  [0.01, 0.05, 0.118],
  [0.04, 0.052, 0.1],
  [0.08, 0.056, 0.084],
  [0.12, 0.057, 0.068],
  [0.15, 0.054, 0.056],
  [0.175, 0.045, 0.044],
  [0.192, 0.028, 0.034],
  [0.2, 0.01, 0.025],
]);
const SHOE_Z_HI = [-0.084, -0.078, -0.07, -0.06, -0.045, -0.025, 0, 0.03, 0.06, 0.09, 0.115, 0.14, 0.16, 0.175, 0.186, 0.194];
const SHOE_Z_LO = [-0.08, -0.05, 0.0, 0.08, 0.15, 0.19];
function shoe(B, side, hi) {
  const f = side > 0 ? LL : LR, bone = side > 0 ? BI.footL : BI.footR;
  const zs = hi ? SHOE_Z_HI : SHOE_Z_LO, M = hi ? 20 : 8;
  let lastY = 0, lastCa = 0;
  surface(B, zs.length, M, (i, j, p) => {
    const z = zs[i], [w, h] = SHOE(z), a = (j / M) * TAU, sa = Math.sin(a), ca = Math.cos(a);
    let x = w * spow(sa, 0.55), y = h * 0.5 + h * 0.5 * spow(ca, 0.55);
    if (y < 0.028) x *= 1.07;
    if (ca < 0) y += 0.014 * sstep(0.1, 0.2, z) * -ca;       // toe spring
    const ox = side * (0.003 + 0.008 * sstep(0, 0.19, z));
    lastY = y; lastCa = ca;
    p.set(f.A.x + ox + x * side, y, f.A.z + z);
  }, (i) => {
    const z = zs[i];
    let part = P.shoes;
    if (lastY < 0.028 || (z > 0.15 && lastY < 0.048)) part = P.soles;
    else if (lastCa > 0.8 && z > -0.005 && z < 0.115 && Math.floor((z + 0.005) / 0.021) % 2 === 0) part = P.laces;
    else if (z < -0.07 && lastCa > 0.5) part = P.laces;
    return { b: [[bone, 1]], part, ao: lastY < 0.01 ? 0.55 : 1 };
  }, {
    top: { p: V(f.A.x, 0.05, f.A.z - 0.09), a: { b: [[bone, 1]], part: P.shoes } },
    bottom: { p: V(f.A.x + side * 0.011, 0.022, f.A.z + 0.203), a: { b: [[bone, 1]], part: P.soles } },
    center: V(f.A.x, 0.05, f.A.z + 0.06),
  });
}

// ---------------------------------------------------------------- whole body
const BODY_CACHE = {};
export function bodyGeometry(hi) {
  const key = hi ? 'hi' : 'lo';
  if (BODY_CACHE[key]) return BODY_CACHE[key];
  const B = new Builder();
  torso(B, hi); neck(B, hi); head(B, hi); face(B, hi);
  for (const s of [1, -1]) { arm(B, s, hi); hand(B, s, hi); leg(B, s, hi); shoe(B, s, hi); }
  const g = B.geometry();
  g.boundingSphere = new THREE.Sphere(V(0, 1, 0), 1.45);
  BODY_CACHE[key] = g;
  return g;
}

// First-person arm: the right forearm and a hand cupped around the food, wrist at the origin.
// The forearm runs back toward the lower right of the screen; the palm faces up and left, under the food.
export const FP_ARM_UP = V(0.32, -0.5, 0.8).normalize();
export const FP_PALM_N = (() => { const n = V(-0.3, 1, 0.05); return n.addScaledVector(FP_ARM_UP, -n.dot(FP_ARM_UP)).normalize(); })();
export function fpArmGeometry(curl = 0.62, thumbCurl = 0.35) { // (a fist around a handle: curl about 1.2)
  const B = new Builder();
  arm(B, -1, true, 0.1);
  hand(B, -1, true, curl, thumbCurl, 0);
  const g = B.geometry();
  const f = AR, W = f.S.clone().addScaledVector(f.d, 0.55);
  const rest = new THREE.Matrix4().makeBasis(f.ex.clone().negate(), f.d.clone().negate(), V(0, 0, 1)).setPosition(W);
  const y = FP_ARM_UP, x = FP_PALM_N, z = V().crossVectors(x, y);
  const place = new THREE.Matrix4().makeBasis(x, y, z);
  g.applyMatrix4(place.multiply(rest.invert()));
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  return g;
}

// ---------------------------------------------------------------- hair and beards (head-bone space)
const HAIRLINE = curve([[0, 0.4], [0.35, 0.36], [0.7, 0.22], [1.2, 0.08], [1.55, 0.02], [1.9, -0.1], [2.4, -0.35], [Math.PI, -0.5]]);
const noise3 = (x, y, z) => Math.sin(x * 9.1 + Math.sin(y * 7.3)) * Math.sin(y * 8.7 + Math.sin(z * 6.1)) * Math.sin(z * 9.9 + Math.sin(x * 5.3));
const HAIR = {
  short: { th: 0.016, groove: 0.004 },
  buzz: { th: 0.005, front: 0.03 },
  spiky: { th: 0.012, groove: 0.003 },
  long: { th: 0.018, groove: 0.003, back: -0.78 },
  bun: { th: 0.014, groove: 0.004, front: 0.02 },
  curly: { th: 0.026, bump: 0.012 },
  mohawk: { th: 0.004, crest: true },
  ponytail: { th: 0.014, groove: 0.004, front: 0.03 },
  bob: { th: 0.022, groove: 0.002, sides: -0.42, fringe: 0.2 },
  afro: { th: 0.065, bump: 0.016 },
};
const HAIR_CACHE = {};
// A shell over the scalp: outward offset th(u) where the mask keeps it; it sinks into the skin at its edge.
function shell(B, thick, nR = 34, M = 56, maxPhi = Math.PI * 0.82) {
  const base = B.n, idx0 = B.I.length, keep = [], u = V(), p = V(), n = V();
  for (let i = 0; i < nR; i++) {
    const f = 0.04 + ((maxPhi - 0.04) * i) / (nR - 1);
    for (let j = 0; j < M; j++) {
      const a = (j / M) * TAU;
      u.set(Math.sin(f) * Math.sin(a), Math.cos(f), Math.sin(f) * Math.cos(a));
      headPoint(u.x, u.y, u.z, p);
      n.subVectors(p, HEAD_C).normalize();
      const t = thick(u, Math.atan2(u.x, u.z));
      keep.push(t > -0.5);
      p.addScaledVector(n, (t > -0.5 ? t : 0) + 0.0016);
      B.vert(p.x, p.y, p.z, { part: 0 });
    }
  }
  const id = (i, j) => base + i * M + (j % M);
  for (let i = 0; i < nR - 1; i++) {
    for (let j = 0; j < M; j++) {
      const q = [id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1)];
      if (keep[q[0] - base] && keep[q[1] - base] && keep[q[2] - base]) B.I.push(q[0], q[1], q[2]);
      if (keep[q[2] - base] && keep[q[1] - base] && keep[q[3] - base]) B.I.push(q[2], q[1], q[3]);
    }
  }
  // cap the crown
  const top = B.n; headPoint(0, 1, 0, p); B.vert(p.x, p.y + Math.max(0, thick(V(0, 1, 0), 0)) + 0.0016, p.z, { part: 0 });
  for (let j = 0; j < M; j++) if (keep[j]) B.I.push(top, id(0, j), id(0, j + 1));
  orientAway(B, idx0, HEAD_C);
}
function orientAway(B, idx0, c) {
  const Pp = B.P, I = B.I, a = V(), b = V(), d = V(), e1 = V(), e2 = V(), fn = V();
  for (let k = idx0; k < I.length; k += 3) {
    a.fromArray(Pp, I[k] * 3); b.fromArray(Pp, I[k + 1] * 3); d.fromArray(Pp, I[k + 2] * 3);
    fn.crossVectors(e1.subVectors(b, a), e2.subVectors(d, a));
    const cx = (a.x + b.x + d.x) / 3 - c.x, cy = (a.y + b.y + d.y) / 3 - c.y, cz = (a.z + b.z + d.z) / 3 - c.z;
    if (fn.x * cx + fn.y * cy + fn.z * cz < 0) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  }
  B.smooth(idx0);
}
const onScalp = (ux, uy, uz, out = 0) => { const p = headPoint(ux, uy, uz); return p.addScaledVector(p.clone().sub(HEAD_C).normalize(), out); };
function hairExtras(B, style) {
  const A = { part: 0 };
  const coneAt = (base, dir, r, len, flat = 1) => {
    const d = dir.clone().normalize(), tip = base.clone().addScaledVector(d, len);
    const ref = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    const e1 = V().crossVectors(d, ref).normalize(), e2 = V().crossVectors(d, e1);
    const rings = [[base.clone().addScaledVector(d, -0.01), r], [base.clone().addScaledVector(d, len * 0.45), r * 0.62], [base.clone().addScaledVector(d, len * 0.8), r * 0.25]];
    surface(B, rings.length, 8, (i, j, p) => {
      const [c, rr] = rings[i], ang = (j / 8) * TAU;
      p.copy(c).addScaledVector(e1, Math.cos(ang) * rr * flat).addScaledVector(e2, Math.sin(ang) * rr);
    }, A, { top: { p: base.clone().addScaledVector(d, -0.012), a: A }, bottom: { p: tip, a: A } });
  };
  if (style === 'short') { // a fringe of tufts falling onto the forehead
    for (let k = -2; k <= 2; k++) {
      const az = k * 0.2, uy = 0.44, s = Math.sqrt(1 - uy * uy);
      const b = onScalp(Math.sin(az) * s, uy, Math.cos(az) * s, 0.012);
      coneAt(b, V(Math.sin(az) * 0.4 - k * 0.05, -0.55, 0.75), 0.024, 0.055);
    }
  } else if (style === 'spiky') {
    for (let k = 0; k < 15; k++) {
      const az = (k / 15) * TAU + 0.2, uy = k % 3 === 0 ? 0.92 : 0.62 + (k % 2) * 0.12, s = Math.sqrt(1 - uy * uy);
      const ux = Math.sin(az) * s, uz = Math.cos(az) * s;
      const b = onScalp(ux, uy, uz, 0.01);
      coneAt(b, V(ux, uy + 0.35, uz - 0.25), 0.027, 0.07 + (k % 4) * 0.012);
    }
  } else if (style === 'long') { // hair falling down the back to the shoulders
    const ys = [1.74, 1.68, 1.62, 1.56, 1.5, 1.45, 1.42], M = 18, a0 = Math.PI * 0.42, a1 = Math.PI * 1.58;
    const base = B.n, idx0 = B.I.length;
    for (let i = 0; i < ys.length; i++) {
      for (let j = 0; j <= M; j++) {
        const a = a0 + ((a1 - a0) * j) / M, y = ys[i], k = sstep(1.74, 1.45, y);
        const r = 0.168 - 0.03 * k + 0.012 * Math.sin(j * 1.7) * k, zr = 0.188 - 0.04 * k;
        const tip = i === ys.length - 1 ? 0.03 * Math.abs(Math.sin(j * 1.3)) : 0;
        B.vert(Math.sin(a) * r, y + tip, HEAD_C.z - 0.02 + Math.cos(a) * zr, A);
      }
    }
    for (let i = 0; i < ys.length - 1; i++) {
      for (let j = 0; j < M; j++) {
        const q = base + i * (M + 1) + j;
        B.I.push(q, q + M + 1, q + 1, q + 1, q + M + 1, q + M + 2);
      }
    }
    orientAway(B, idx0, V(0, 1.6, 0.02));
  } else if (style === 'bun') {
    ellip(B, V(0, 1.912, -0.085), AXES, [0.056, 0.05, 0.056], 8, 14, A);
  } else if (style === 'ponytail') {
    ellip(B, V(0, 1.83, -0.178), rotAxes(E(0.9, 0, 0)), [0.024, 0.012, 0.024], 4, 10, A);
    const pts = [V(0, 1.83, -0.19), V(0, 1.76, -0.225), V(0, 1.66, -0.225), V(0, 1.57, -0.205), V(0, 1.5, -0.185)];
    const rs = [0.032, 0.036, 0.03, 0.022, 0.01];
    for (let k = 0; k < pts.length - 1; k++) capsule(B, pts[k], pts[k + 1], rs[k], rs[k + 1], 10, A, 2);
  } else if (style === 'mohawk') { // a crest along the middle, from the forehead over the top to the back
    for (let k = 0; k < 9; k++) {
      const beta = 0.6 + (k / 8) * 2.1, uy = Math.sin(beta), uz = Math.cos(beta);
      coneAt(onScalp(0, uy, uz, 0.004), V(0, uy + 0.25, uz - 0.1), 0.03, 0.08 + 0.025 * Math.sin((k / 8) * Math.PI), 0.42);
    }
  }
}
const NOSE_DIR = V(0, -0.18, 0.98).normalize();
function beard(B, kind) {
  const mouth = V(0, -0.47, 0.88).normalize();
  const thick = kind === 'full' ? 0.014 : kind === 'goatee' ? 0.011 : 0.0022;
  shell(B, (u, az) => {
    const aaz = Math.abs(az);
    const dm = u.distanceTo(mouth);
    let m;
    if (kind === 'goatee') m = sstep(0.55, 0.35, aaz) * sstep(-0.35, -0.55, u.y);
    else m = sstep(1.95, 1.7, aaz) * sstep(-0.3 + 0.28 * sstep(0.8, 1.6, aaz), -0.42 + 0.28 * sstep(0.8, 1.6, aaz), u.y);
    m *= sstep(0.15, 0.22, dm) * sstep(0.2, 0.3, u.distanceTo(NOSE_DIR));
    if (u.y > 0.3 || aaz > 2.3) return -1;
    return thick * m - 0.005 * (1 - sstep(0, 0.3, m));
  }, 30, 48, Math.PI * 0.98);
  if (kind !== 'stubble') ellip(B, V(0, 1.672, 0.166), AXES, [0.042, 0.01, 0.012], 4, 12, { part: 0 }); // moustache
}
export function hairGeometry(style, beardKind = null) {
  const key = `${style}|${beardKind}`;
  if (HAIR_CACHE[key]) return HAIR_CACHE[key];
  const B = new Builder();
  if (style && HAIR[style]) {
    const h = HAIR[style];
    shell(B, (u, az) => {
      const aaz = Math.abs(az);
      let T = HAIRLINE(aaz)[0] + (h.front || 0) * sstep(1.2, 0.3, aaz);
      if (h.back !== undefined) T = Math.min(T, h.back * sstep(1.2, 2.0, aaz) + T * (1 - sstep(1.2, 2.0, aaz)));
      if (h.sides !== undefined) T = aaz > 0.75 ? Math.min(T, h.sides) : T;
      if (h.fringe !== undefined && aaz < 0.9) T = Math.min(T, h.fringe);
      const p = u.y - T;
      if (p < -0.14) return -1;
      let t = h.th;
      if (h.crest) t = Math.abs(u.x) < 0.2 ? 0.012 : h.th;
      if (h.groove) t += h.groove * (0.5 + 0.5 * Math.sin(az * 18 + u.y * 4));
      if (h.bump) t += h.bump * (0.5 + 0.5 * noise3(u.x * 1.3, u.y * 1.3, u.z * 1.3));
      return t * sstep(-0.03, 0.08, p) - 0.007 * (1 - sstep(-0.03, 0.02, p));
    });
    hairExtras(B, style);
  }
  if (beardKind) beard(B, beardKind);
  const g = B.geometry();
  for (const n of ['skinIndex', 'skinWeight', 'part', 'ao']) g.deleteAttribute(n);
  g.translate(0, -HEAD_BONE_Y, 0);
  HAIR_CACHE[key] = g;
  return g;
}

// ---------------------------------------------------------------- chef hat (head-bone space)
let HAT_GEO = null;
function chefHatGeometry() {
  if (HAT_GEO) return HAT_GEO;
  const m = (x, y, z, rx = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(E(rx, 0, 0)), V(1, 1, 1));
  const puffs = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; puffs.push(new THREE.SphereGeometry(0.075, 12, 10).applyMatrix4(m(Math.sin(a) * 0.085, 1.995, Math.cos(a) * 0.085 - 0.01))); }
  puffs.push(new THREE.SphereGeometry(0.08, 12, 10).applyMatrix4(m(0, 2.03, -0.01)));
  const crown = new THREE.CylinderGeometry(0.162, 0.15, 0.13, 24).applyMatrix4(m(0, 1.93, -0.01, -0.12));
  const white = mergeSimple([crown, ...puffs]);
  const band = new THREE.CylinderGeometry(0.162, 0.162, 0.045, 24).applyMatrix4(m(0, 1.868, -0.006, -0.12));
  for (const g of [white, band]) g.translate(0, -HEAD_BONE_Y, 0);
  HAT_GEO = { white, band };
  return HAT_GEO;
}
function mergeSimple(list) {
  const pos = [], nor = [], idx = [];
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const off = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.index) for (const i of g.index.array) idx.push(i + off);
    else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + off);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// ---------------------------------------------------------------- palette material
export function makeHumanMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  const u = mat.userData.pal = {
    uPal: { value: Array.from({ length: PAL_N }, () => new THREE.Color(1, 1, 1)) },
    uPalR: { value: new Array(PAL_N).fill(0.6) },
    uPalM: { value: new Array(PAL_N).fill(0) },
    uPalE: { value: Array.from({ length: PAL_N }, () => new THREE.Color(0, 0, 0)) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    // The palette is looked up per vertex and the colours interpolated, so where two parts meet the
    // colour blends between those two (interpolating the part id itself would pass through others).
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float part;
attribute float ao;
uniform vec3 uPal[${PAL_N}];
uniform float uPalR[${PAL_N}];
uniform float uPalM[${PAL_N}];
uniform vec3 uPalE[${PAL_N}];
varying vec3 vPalC;
varying vec3 vPalE;
varying vec2 vPalRM;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
int pIdx = int(part + 0.5);
vPalC = uPal[pIdx] * ao;
vPalE = uPalE[pIdx];
vPalRM = vec2(uPalR[pIdx], uPalM[pIdx]);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPalC;\nvarying vec3 vPalE;\nvarying vec2 vPalRM;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPalC;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPalRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPalRM.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vPalE;
float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
totalEmissiveRadiance += (vec3(1.0, 0.92, 0.8) * 0.18 + diffuseColor.rgb * 0.35) * pow(rimF, 2.8);`);
  };
  mat.customProgramCacheKey = () => 'human-palette-2';
  return mat;
}

// Colours for every part from an outfit spec (see skins.js dress()).
function fillPalette(mat, s) {
  const { uPal, uPalR, uPalM, uPalE } = mat.userData.pal;
  const c = new THREE.Color();
  const set = (k, hex, r = 0.6, m = 0) => { uPal.value[k].set(hex); uPalR.value[k] = r; uPalM.value[k] = m; uPalE.value[k].setRGB(0, 0, 0); };
  const dim = (hex, k) => '#' + c.set(hex).multiplyScalar(k).getHexString();
  const long = s.sleeves === 'long';
  const accent = s.accent || dim(s.shirt, 0.78);
  set(P.skin, s.tone, 0.55);
  set(P.shirt, s.shirt, 0.82);
  set(P.accent, accent, 0.75);
  set(P.collar, s.collar || accent, 0.8);
  set(P.midArm, long ? s.shirt : s.tone, long ? 0.82 : 0.55);
  set(P.forearm, long ? s.shirt : s.tone, long ? 0.82 : 0.55);
  set(P.shortCuff, long ? s.shirt : accent, 0.8);
  set(P.longCuff, long ? accent : s.tone, long ? 0.78 : 0.55);
  set(P.hands, s.gloves || s.tone, s.gloves ? 0.6 : 0.55);
  set(P.pants, s.pants, 0.88);
  set(P.lowerLeg, s.boots || s.pants, s.boots ? 0.45 : 0.88);
  set(P.belt, s.belt || '#3a2a1e', 0.5);
  set(P.buckle, s.buckle || '#c9b27a', 0.3, 0.9);
  set(P.shoes, s.boots || s.shoes, 0.45);
  set(P.soles, s.soles || '#f1ede4', 0.8);
  set(P.laces, s.laces || '#f4f1ea', 0.8);
  set(P.socks, s.socks || '#ece8e0', 0.9);
  set(P.hair, s.hair, 0.5);
  set(P.eyeWhite, '#f7f3ee', 0.15);
  set(P.iris, s.iris, 0.12);
  set(P.dark, '#231a1c', 0.5);
  set(P.lips, s.lips || '#' + c.set(s.tone).lerp(new THREE.Color('#a8453f'), 0.5).getHexString(), 0.38);
  set(P.catch, '#ffffff', 0.2);
  uPalE.value[P.catch].setRGB(1.6, 1.6, 1.6);
  for (const [k, [r, m]] of Object.entries(s.rm || {})) { uPalR.value[P[k]] = r; uPalM.value[P[k]] = m; }
  if (s.glow) {
    const parts = ['shirt', 'pants', 'collar', 'lowerLeg', 'shortCuff', ...(long ? ['midArm', 'forearm'] : []), ...(s.gloves ? ['hands'] : [])];
    for (const k of parts) uPalE.value[P[k]].set(s.glow);
  }
  if (s.eyeGlow) uPalE.value[P.iris].set(s.eyeGlow);
}

// ---------------------------------------------------------------- the rig
const _tg = {};
for (const n of BONE_NAMES) _tg[n] = [0, 0, 0];

export class HumanRig {
  constructor({ lod = true } = {}) {
    this.object = new THREE.Group();
    this.bones = {};
    const list = BONE_NAMES.map((n) => { const b = new THREE.Bone(); b.name = n; this.bones[n] = b; return b; });
    for (const n of BONE_NAMES) {
      const b = this.bones[n], p = PARENT[n];
      if (p) { this.bones[p].add(b); b.position.copy(BONE_REST[n]).sub(BONE_REST[p]); } else { this.object.add(b); b.position.copy(BONE_REST[n]); }
    }
    this.skeleton = new THREE.Skeleton(list);
    this.material = makeHumanMaterial();
    this.hi = new THREE.SkinnedMesh(bodyGeometry(true), this.material);
    this.object.add(this.hi);
    this.object.updateMatrixWorld(true);
    this.hi.bind(this.skeleton);
    this.meshes = [this.hi];
    if (lod) {
      this.lo = new THREE.SkinnedMesh(bodyGeometry(false), this.material);
      this.object.add(this.lo);
      this.lo.bind(this.skeleton, this.hi.bindMatrix);
      this.lo.visible = false;
      this.meshes.push(this.lo);
    }
    for (const m of this.meshes) m.boundingSphere = new THREE.Sphere(V(0, 1, 0), 1.6);
    this.hairMat = new THREE.MeshStandardMaterial({ color: '#4a2f1c', roughness: 0.5, side: THREE.DoubleSide });
    this.hair = new THREE.Mesh(hairGeometry('short'), this.hairMat);
    this.bones.head.add(this.hair);
    const hat = chefHatGeometry();
    this.hatWhite = new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.7 });
    this.hatBand = new THREE.MeshStandardMaterial({ color: '#ff9a1f', roughness: 0.6 });
    this.chefHat = new THREE.Group();
    this.chefHat.add(new THREE.Mesh(hat.white, this.hatWhite), new THREE.Mesh(hat.band, this.hatBand));
    this.bones.head.add(this.chefHat);
    // where held food sits: in the right palm (bone space of handR)
    this.handAnchorR = new THREE.Group();
    this.handAnchorR.position.copy(AR.d).multiplyScalar(0.075).addScaledVector(AR.ex, -0.035);
    this.bones.handR.add(this.handAnchorR);
    // ... and the utensil in the left fist: the tool points forward out of the fist (up when the forearm is raised)
    this.handAnchorL = new THREE.Group();
    this.handAnchorL.position.copy(AL.d).multiplyScalar(0.07).addScaledVector(AL.ex, -0.02).add(V(0, 0, 0.012));
    this.handAnchorL.rotation.x = Math.PI / 2;
    this.bones.handL.add(this.handAnchorL);
    this.outfit = [];
    this.blinkT = 1 + Math.random() * 3; this.blinkK = 0;
    this.near = true;
  }
  setLook(spec) { fillPalette(this.material, spec); this.hatBand.color.set(spec.shirt); }
  setHair(style, beardKind, color) {
    this.hairMat.color.set(color);
    this.hair.visible = !!(style || beardKind);
    if (this.hair.visible) this.hair.geometry = hairGeometry(style, beardKind);
    // the chef hat sits on top of big hair instead of sinking into it
    const lift = { afro: 0.07, curly: 0.025, spiky: 0.02, mohawk: 0.03 }[style] || 0;
    this.chefHat.position.y = lift;
    this.chefHat.scale.set(1 + lift * 3, 1, 1 + lift * 3);
  }
  setOutfit(groups) {
    for (const g of this.outfit) g.parent?.remove(g);
    this.outfit = [];
    for (const [anchor, g] of Object.entries(groups || {})) {
      if (!g || !g.children.length) continue;
      this.bones[anchor].add(g);
      this.outfit.push(g);
    }
    this.setShadows(this.shadows);
  }
  setShadows(on) {
    this.shadows = !!on;
    for (const m of this.meshes) m.castShadow = this.shadows;
    this.hair.castShadow = this.shadows;
    this.chefHat.traverse((o) => { if (o.isMesh) o.castShadow = this.shadows; });
    for (const g of this.outfit) g.traverse((o) => { if (o.isMesh) o.castShadow = this.shadows && !o.material.transparent; });
  }
  setNear(near) {
    if (!this.lo || near === this.near) return;
    this.near = near;
    this.hi.visible = near; this.lo.visible = !near;
  }

  // Pose the skeleton for this frame. s: see Actor.updateVisual.
  pose(s, dt) {
    if (s.frozen) return; // frozen in ice: hold the pose
    const T = _tg;
    for (const n of BONE_NAMES) { T[n][0] = 0; T[n][1] = 0; T[n][2] = 0; }
    const t = s.t, a = s.stride || 0, ph = s.phase || 0, sn = Math.sin(ph), cs = Math.cos(ph);
    const idle = 1 - Math.min(1, a * 2.5), br = Math.sin(t * 2.2), pitch = s.pitch || 0;
    let bob = (Math.abs(cs) - 1) * 0.04 * a;
    // --- walk / run / idle
    T.hips[1] = sn * 0.12 * a; T.hips[2] = sn * 0.035 * a + idle * 0.018 * Math.sin(t * 0.7);
    T.spine[0] = 0.05 * a + (s.sprint ? 0.08 : 0); T.spine[1] = -sn * 0.06 * a;
    T.chest[0] = -pitch * 0.18 + br * 0.012 * idle; T.chest[1] = -sn * 0.14 * a; T.chest[2] = -sn * 0.02 * a;
    T.neck[0] = -pitch * 0.2; T.neck[1] = sn * 0.04 * a;
    T.head[0] = -pitch * 0.32 - 0.04 * a; T.head[1] = sn * 0.06 * a + idle * (s.lookAround ? 0.25 : 0.08) * Math.sin(t * 0.37);
    T.upperArmL[0] = sn * 0.55 * a - 0.04; T.upperArmL[2] = 0.09 + 0.06 * a;
    T.upperArmR[0] = -sn * 0.55 * a - 0.04; T.upperArmR[2] = -(0.09 + 0.06 * a);
    T.foreArmL[0] = -(0.2 + 0.5 * a) - Math.max(0, -sn) * 0.4 * a;
    T.foreArmR[0] = -(0.2 + 0.5 * a) - Math.max(0, sn) * 0.4 * a;
    T.handL[0] = -0.08; T.handR[0] = -0.08;
    const tL = -sn * 0.62 * a, tR = sn * 0.62 * a;
    const kL = 0.08 + a * (0.15 + 1.1 * Math.max(0, cs)), kR = 0.08 + a * (0.15 + 1.1 * Math.max(0, -cs));
    T.thighL[0] = tL - 0.03; T.thighL[2] = 0.015; T.shinL[0] = kL;
    T.thighR[0] = tR - 0.03; T.thighR[2] = -0.015; T.shinR[0] = kR;
    T.footL[0] = -(tL + kL) * 0.85 + (sn < 0 ? -sn * 0.35 * a : 0);
    T.footR[0] = -(tR + kR) * 0.85 + (sn > 0 ? sn * 0.35 * a : 0);
    // --- a utensil in the left hand: forearm raised so it's held out in front, swinging a little less
    if (s.tool) {
      T.upperArmL[0] = sn * 0.2 * a - 0.32; T.upperArmL[2] = 0.18;
      T.foreArmL[0] = -1.15; T.foreArmL[1] = -0.25; T.handL[0] = -0.1; T.handL[2] = 0.15;
    }
    // --- airborne
    if (!s.onGround && !s.gliding && !s.tripped) {
      const up = (s.vy || 0) > 1;
      T.thighL[0] = up ? -0.8 : -0.35; T.shinL[0] = up ? 1.25 : 0.55; T.footL[0] = 0.25;
      T.thighR[0] = up ? -0.25 : 0.05; T.shinR[0] = up ? 0.7 : 0.4; T.footR[0] = 0.15;
      T.upperArmL[0] = up ? -0.55 : -0.25; T.upperArmL[2] = 0.5;
      T.upperArmR[0] = up ? -0.55 : -0.25; T.upperArmR[2] = -0.5;
      T.foreArmL[0] = T.foreArmR[0] = -0.55;
      bob = 0;
    }
    if (s.gliding) {
      const sw = Math.sin(t * 2.3) * 0.12;
      T.upperArmL[0] = -2.8; T.upperArmL[2] = 0.3; T.upperArmR[0] = -2.8; T.upperArmR[2] = -0.3;
      T.foreArmL[0] = T.foreArmR[0] = -0.25;
      T.thighL[0] = -0.25 + sw; T.shinL[0] = 0.45; T.thighR[0] = 0.05 - sw; T.shinR[0] = 0.55; T.footL[0] = T.footR[0] = 0.3;
      T.chest[0] -= 0.08; T.head[0] -= 0.15; bob = 0;
    }
    if (s.dashing) {
      T.spine[0] = 0.2; T.chest[0] += 0.1;
      T.upperArmL[0] = 1.0; T.upperArmL[2] = 0.35; T.upperArmR[0] = 1.0; T.upperArmR[2] = -0.35;
      T.foreArmL[0] = T.foreArmR[0] = -0.3;
      T.thighL[0] = -0.85; T.shinL[0] = 0.6; T.thighR[0] = 0.55; T.shinR[0] = 0.9;
    }
    if (s.tripped) {
      T.upperArmL[0] = 0; T.upperArmL[2] = 1.3; T.upperArmR[0] = 0; T.upperArmR[2] = -1.3;
      T.foreArmL[0] = T.foreArmR[0] = -0.3;
      T.thighL[0] = T.thighR[0] = -0.1; T.shinL[0] = T.shinR[0] = 0.15; T.head[0] = -0.35;
    }
    // --- hands and arms: food actions (right hand throws)
    if (s.holding && !s.charging) T.foreArmR[0] -= 0.35;
    if (s.charging) {
      const c = s.charge || 0;
      T.upperArmR[0] = 0.35 + 2.1 * c; T.upperArmR[2] = -0.35 - 0.2 * c; T.foreArmR[0] = -0.8 - 0.7 * c; T.handR[0] = -0.3 * c;
      T.chest[1] -= 0.4 * c; T.spine[1] -= 0.15 * c;
      T.upperArmL[0] = -1.2 * c - 0.1; T.upperArmL[2] = 0.15; T.foreArmL[0] = -0.3;
    }
    if (s.auto) { // rapid fire: arm straight out at the target, the other hand steadying it
      T.upperArmR[0] = -1.42 - pitch * 0.8 + Math.sin(t * 60) * 0.03; T.upperArmR[2] = 0.05; T.foreArmR[0] = -0.12;
      T.upperArmL[0] = -1.22 - pitch * 0.8; T.upperArmL[2] = -0.32; T.foreArmL[0] = -0.55;
    } else if ((s.throwK || 0) > 0 && !s.charging) {
      const k = s.throwK;
      T.upperArmR[0] = -1.5 * k - 0.3 * (1 - k); T.upperArmR[2] = -0.25; T.foreArmR[0] = -0.25;
      T.chest[1] += 0.3 * k; T.upperArmL[0] += 0.3 * k;
    }
    if (s.eating) { T.upperArmR[0] = -1.95; T.upperArmR[2] = 0.3; T.foreArmR[0] = -2.15; T.handR[0] = -0.3; T.head[0] += 0.12; }
    if (s.shield) { T.upperArmL[0] = -1.25; T.upperArmL[2] = -0.2; T.upperArmR[0] = -1.25; T.upperArmR[2] = 0.2; T.foreArmL[0] = T.foreArmR[0] = -0.6; }
    else if (s.heavy) { T.upperArmL[0] = -0.85; T.upperArmL[2] = -0.1; T.upperArmR[0] = -0.85; T.upperArmR[2] = 0.1; T.foreArmL[0] = T.foreArmR[0] = -1.0; }
    if (s.wave) { const w = Math.sin(t * 9); T.upperArmR[0] = -0.35; T.upperArmR[2] = -2.55; T.foreArmR[0] = -0.2; T.foreArmR[2] = w * 0.45; T.head[2] = 0.08; }
    if (s.hit) { T.head[0] -= 0.3 * s.hit; T.chest[0] -= 0.08 * s.hit; }
    // --- apply, smoothed so poses blend instead of snapping
    const k = 1 - Math.exp(-(s.snap ? 1e3 : 22) * dt);
    for (const n of BONE_NAMES) {
      const r = this.bones[n].rotation, g = T[n];
      r.x += (g[0] - r.x) * k; r.y += (g[1] - r.y) * k; r.z += (g[2] - r.z) * k;
    }
    const hp = this.bones.hips.position;
    hp.y += (BONE_REST.hips.y + bob - hp.y) * k;
    // blink every few seconds (and squint when hit)
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2 + Math.random() * 3.5; this.blinkK = 0.14; }
    let lid = 0;
    if (this.blinkK > 0) { this.blinkK -= dt; lid = 0.95 * Math.sin(Math.PI * clamp01(1 - this.blinkK / 0.14)); }
    this.bones.lids.rotation.x = Math.max(lid, (s.hit || 0) * 0.6);
  }
}
