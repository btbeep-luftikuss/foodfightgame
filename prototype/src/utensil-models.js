// The 20 support utensils as 3D models, in the same style as the food: simple rounded shapes,
// glossy plastic, polished steel and wood, no outlines. Every model is merged into one geometry
// per material (vertex-coloured), so a utensil costs at most four draw calls wherever it appears.
//
// Model space: the grip is at the origin (where the hand closes), the business end points up (+y)
// and the front faces +z. Models are about 0.7 tall. Every utensil has a handle there, and nothing
// but the handle may come inside the fist (FIST: |y| < 0.14, within 0.1 of the y axis), so no
// utensil clips through the hand that holds it (fistClearance checks this).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MATS = {}; // shared by every utensil
function mat(kind) {
  if (MATS[kind]) return MATS[kind];
  const m = {
    gloss: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    metal: () => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.3 }),
    matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
    glow: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }[kind]();
  return (MATS[kind] = m);
}

const STEEL = '#c6ced9', DARK = '#2b2836', WOOD = '#d9a464', WOOD_D = '#a8693a', CREAM = '#fff6ea';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// A model under construction: a list of painted, placed parts grouped by material.
class Kit {
  constructor() { this.parts = { gloss: [], metal: [], matte: [], glow: [] }; this.solid = []; }
  // color: a hex string, or fn(x, y, z) -> hex in the part's own space (stripes, spots)
  // grip: this part is the handle (or on it): the fist may close round it
  add(geo, color, kind = 'gloss', { p = [0, 0, 0], r = [0, 0, 0], s = 1, grip = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _c.set(typeof color === 'function' ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : color);
      cols[i * 3] = _c.r; cols[i * 3 + 1] = _c.g; cols[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const sv = Array.isArray(s) ? s : [s, s, s];
    g.applyMatrix4(_m.compose(_p.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...sv)));
    this.parts[kind].push(g);
    if (!grip) this.solid.push(g);
    return this;
  }
  bake() {
    const out = [];
    for (const [kind, gs] of Object.entries(this.parts)) if (gs.length) out.push([gs.length > 1 ? mergeGeometries(gs) : gs[0], mat(kind)]);
    return out;
  }
}

// ---------------------------------------------------------------- shape helpers
const cyl = (r0, r1, h, n = 16) => new THREE.CylinderGeometry(r1, r0, h, n);
const ball = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const caps = (r, len, n = 12) => new THREE.CapsuleGeometry(r, len, 4, n);
const tor = (R, r, arc = Math.PI * 2, n = 24) => new THREE.TorusGeometry(R, r, 8, n, arc);
function rbox(w, h, d, r = 0.03) { // a box with rounded edges
  const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4), p = g.attributes.position, v = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const d2 = v.clone().sub(c);
    if (d2.lengthSq() > 1e-9) v.copy(c).add(d2.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// a smooth bowl profile from radius r0 at the bottom to r1 at height h, with enough rows to paint on
function bowlPts(r0, r1, h, rows = 14) {
  const pts = [[0, 0]];
  for (let i = 0; i <= rows; i++) { const t = i / rows; pts.push([r0 + (r1 - r0) * Math.sin(t * Math.PI / 2), h * t]); }
  return pts;
}
// the same bowl seen from inside (an open bowl needs both surfaces)
const inner = (pts, k = 0.93) => pts.slice().reverse().map(([x, y]) => [x * k, y + 0.004]);
function lathe(pts, n = 24) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n); }
function slab(shape, depth, bevel = 0.006) { // a flat 2D outline with a little thickness (blades, spatula heads)
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const grip = (k, color, len = 0.3, r = 0.048) => { // a chunky handle centred on the grip, with a collar at the top
  k.add(caps(r, len - 2 * r), color, 'gloss', { grip: true });
  k.add(cyl(r * 1.25, r * 1.25, 0.03), color, 'gloss', { p: [0, len / 2 + 0.005, 0], grip: true });
};
const pistol = (k, color) => { // a gadget's handle: the body sits on top, clear of the fist
  k.add(caps(0.05, 0.2), color, 'gloss', { grip: true });
  k.add(cyl(0.065, 0.065, 0.03), color, 'gloss', { p: [0, 0.155, 0], grip: true });
};
const FIST = { y: 0.14, r: 0.1 };

// ---------------------------------------------------------------- the utensils
const G = { grip: true };
const MAKERS = {
  knife(k) {
    grip(k, '#b8372b', 0.3);
    for (const y of [-0.06, 0.05]) k.add(ball(0.014, 8, 6), STEEL, 'metal', { p: [0, y, 0.046], ...G });
    k.add(rbox(0.13, 0.04, 0.05, 0.015), STEEL, 'metal', { p: [0, 0.185, 0] });
    const s = new THREE.Shape();
    s.moveTo(-0.055, 0); s.lineTo(0.06, 0); s.quadraticCurveTo(0.075, 0.25, 0.0, 0.46); s.quadraticCurveTo(-0.03, 0.3, -0.055, 0.16); s.lineTo(-0.055, 0);
    k.add(slab(s, 0.012, 0.004), STEEL, 'metal', { p: [0, 0.205, 0] });
  },
  'ice-cream-machine'(k) {
    pistol(k, '#2f9f86');
    const b = 0.3; // body centre, clear of the fist
    k.add(rbox(0.3, 0.24, 0.26, 0.07), '#5fd6b8', 'gloss', { p: [0, b, 0] });
    k.add(cyl(0.05, 0.04, 0.09, 8), STEEL, 'metal', { p: [0, b, 0.16], r: [Math.PI / 2, 0, 0] });
    k.add(cyl(0.12, 0.09, 0.08), '#5fd6b8', 'gloss', { p: [0, b + 0.16, 0] });
    for (let i = 0; i < 3; i++) k.add(tor(0.1 - i * 0.028, 0.035, Math.PI * 2, 18), CREAM, 'matte', { p: [0, b + 0.22 + i * 0.05, 0], r: [Math.PI / 2, 0, 0] });
    k.add(ball(0.035), CREAM, 'matte', { p: [0, b + 0.37, 0] });
    k.add(ball(0.025), '#ff6fa8', 'gloss', { p: [0, b + 0.4, 0] }); // a cherry
  },
  spoon(k) {
    k.add(caps(0.04, 0.24), '#3f9be8', 'gloss', { s: [1, 1, 0.75], ...G });
    k.add(cyl(0.05, 0.05, 0.03), '#3f9be8', 'gloss', { p: [0, 0.155, 0], s: [1, 1, 0.75], ...G });
    k.add(cyl(0.018, 0.022, 0.16, 10), STEEL, 'metal', { p: [0, 0.25, 0], s: [1, 1, 0.5] });
    k.add(ball(0.12, 20, 14), STEEL, 'metal', { p: [0, 0.43, 0.01], s: [0.85, 1.15, 0.35] });
  },
  'blow-torch'(k) {
    k.add(cyl(0.06, 0.06, 0.3, 18), '#ff6a2a', 'gloss', G); // the gas canister is the handle
    k.add(ball(0.06, 18, 10), '#ff6a2a', 'gloss', { p: [0, -0.15, 0], s: [1, 0.5, 1], ...G });
    k.add(cyl(0.075, 0.075, 0.12, 18), '#fff4e6', 'gloss', { p: [0, 0.21, 0] });
    k.add(cyl(0.05, 0.06, 0.07), '#d9a432', 'metal', { p: [0, 0.3, 0] });
    k.add(rbox(0.05, 0.03, 0.08, 0.01), '#2b2836', 'gloss', { p: [0.06, 0.3, 0] });
    k.add(cyl(0.022, 0.026, 0.22, 10), STEEL, 'metal', { p: [0, 0.38, 0.08], r: [0.9, 0, 0] });
    k.add(new THREE.ConeGeometry(0.03, 0.12, 10), '#7fd4ff', 'glow', { p: [0, 0.47, 0.2], r: [0.9, 0, 0] });
    k.add(new THREE.ConeGeometry(0.016, 0.07, 8), '#ffffff', 'glow', { p: [0, 0.455, 0.185], r: [0.9, 0, 0] });
  },
  whisk(k) {
    grip(k, '#ff6fb3', 0.3);
    k.add(cyl(0.03, 0.05, 0.06, 12), STEEL, 'metal', { p: [0, 0.18, 0] });
    for (let i = 0; i < 4; i++) k.add(tor(0.1, 0.008, Math.PI * 2, 28), STEEL, 'metal', { p: [0, 0.42, 0], r: [0, (i / 4) * Math.PI, 0], s: [1, 2.1, 1] });
  },
  blender(k) { // a handheld blender: a grip under the motor base, the jug on top
    pistol(k, '#c43a4a');
    const b = 0.24;
    k.add(rbox(0.22, 0.14, 0.22, 0.04), '#e8475a', 'gloss', { p: [0, b, 0] });
    k.add(rbox(0.06, 0.04, 0.02, 0.008), '#fff4e6', 'gloss', { p: [0, b, 0.112] });
    k.add(lathe([[0.0, 0], [0.085, 0], [0.11, 0.3], [0.0, 0.3]]), (x, y) => (y < 0.18 ? '#ff8fb0' : '#d8f1ff'), 'gloss', { p: [0, b + 0.07, 0] });
    k.add(cyl(0.12, 0.12, 0.04), '#e8475a', 'gloss', { p: [0, b + 0.39, 0] });
    k.add(cyl(0.03, 0.03, 0.04), '#e8475a', 'gloss', { p: [0, b + 0.43, 0] });
    k.add(rbox(0.04, 0.2, 0.05, 0.02), '#e8475a', 'gloss', { p: [0.13, b + 0.23, 0] });
  },
  'rolling-pin'(k) {
    k.add(caps(0.042, 0.2), WOOD_D, 'matte', G);
    k.add(cyl(0.09, 0.09, 0.44, 20), (x, y) => (Math.abs(y) > 0.2 ? WOOD_D : WOOD), 'matte', { p: [0, 0.39, 0] });
    k.add(caps(0.042, 0.12), WOOD_D, 'matte', { p: [0, 0.7, 0] });
  },
  microwave(k) {
    pistol(k, '#c9861e');
    const b = 0.3;
    k.add(rbox(0.36, 0.25, 0.25, 0.05), '#ffc93f', 'gloss', { p: [0, b, 0] });
    k.add(rbox(0.2, 0.15, 0.02, 0.02), '#ffe58a', 'glow', { p: [-0.05, b, 0.125] });
    k.add(cyl(0.035, 0.035, 0.02, 12), '#ff9f1c', 'glow', { p: [-0.05, b, 0.135], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) k.add(cyl(0.012, 0.012, 0.02, 8), DARK, 'gloss', { p: [0.12, b + 0.05 - i * 0.045, 0.125], r: [Math.PI / 2, 0, 0] });
  },
  grater(k) { // held by a handle under it; rows of slots and a loop on top
    grip(k, '#2bbfae', 0.3);
    const b = 0.18;
    k.add(new THREE.CylinderGeometry(0.085, 0.125, 0.4, 4, 32), (x, y) => (Math.abs(y) < 0.17 && ((y * 80) % 2 + 2) % 2 < 0.8 ? '#4e5868' : STEEL), 'metal', { p: [0, b + 0.2, 0], r: [0, Math.PI / 4, 0] });
    k.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 4), '#2bbfae', 'gloss', { p: [0, b + 0.005, 0], r: [0, Math.PI / 4, 0] });
    k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 4), '#2bbfae', 'gloss', { p: [0, b + 0.41, 0], r: [0, Math.PI / 4, 0] });
    k.add(tor(0.06, 0.02, Math.PI, 14), '#2bbfae', 'gloss', { p: [0, b + 0.42, 0] });
  },
  spatula(k) {
    grip(k, '#21b3a3', 0.3);
    k.add(rbox(0.035, 0.16, 0.018, 0.008), STEEL, 'metal', { p: [0, 0.24, 0] });
    const s = new THREE.Shape();
    s.moveTo(-0.11, 0); s.lineTo(0.11, 0); s.lineTo(0.12, 0.24); s.quadraticCurveTo(0, 0.27, -0.12, 0.24); s.lineTo(-0.11, 0);
    for (const x of [-0.06, 0, 0.06]) { const h = new THREE.Path(); h.moveTo(x - 0.012, 0.05); h.lineTo(x + 0.012, 0.05); h.lineTo(x + 0.012, 0.2); h.lineTo(x - 0.012, 0.2); h.lineTo(x - 0.012, 0.05); s.holes.push(h); }
    k.add(slab(s, 0.014, 0.005), '#3fd8c6', 'gloss', { p: [0, 0.31, 0], r: [-0.15, 0, 0] });
  },
  'deep-fryer'(k) {
    grip(k, '#2b2836', 0.3);
    k.add(cyl(0.012, 0.012, 0.16, 8), STEEL, 'metal', { p: [0, 0.24, 0] });
    const fb = bowlPts(0.11, 0.15, 0.2, 16);
    for (const pts of [fb, inner(fb)]) k.add(lathe(pts, 40), (x, y, z) => ((Math.round(Math.atan2(z, x) * 6.4) + Math.round(y * 50)) % 2 ? '#7d8796' : STEEL), 'metal', { p: [0, 0.32, 0] });
    k.add(tor(0.15, 0.012, Math.PI * 2, 32), STEEL, 'metal', { p: [0, 0.52, 0], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = 0.03 + (i % 3) * 0.03;
      k.add(rbox(0.03, 0.18, 0.03, 0.01), '#f6c544', 'matte', { p: [Math.cos(a) * r, 0.44, Math.sin(a) * r], r: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3] });
    }
  },
  'mortar-and-pestle'(k) { // the stone bowl sits on a short wooden handle
    k.add(caps(0.045, 0.2), WOOD_D, 'matte', G);
    const b = 0.17;
    k.add(cyl(0.09, 0.1, 0.06, 18), '#7f8ea8', 'matte', { p: [0, b + 0.03, 0] });
    k.add(lathe([[0.0, 0.03], [0.1, 0.03], [0.17, 0.12], [0.18, 0.24], [0.15, 0.24], [0.13, 0.13], [0.0, 0.1]], 24), '#98a7c0', 'matte', { p: [0, b, 0] });
    k.add(caps(0.035, 0.3), '#c9d3e2', 'matte', { p: [0.06, b + 0.3, 0.02], r: [0, 0, -0.45] });
    k.add(ball(0.055), '#c9d3e2', 'matte', { p: [0.0, b + 0.16, 0.0] });
    k.add(cyl(0.13, 0.13, 0.01, 18), '#f1e7d0', 'matte', { p: [0, b + 0.2, 0] }); // powder
  },
  toaster(k) {
    pistol(k, '#8f97a6');
    const b = 0.3;
    k.add(rbox(0.34, 0.24, 0.2, 0.07), STEEL, 'metal', { p: [0, b, 0] });
    for (const x of [-0.07, 0.07]) {
      k.add(rbox(0.11, 0.02, 0.13, 0.01), DARK, 'gloss', { p: [x, b + 0.12, 0] });
      k.add(rbox(0.1, 0.13, 0.11, 0.025), (X, Y) => (Y > 0.05 ? '#9a5a26' : '#e3a85a'), 'matte', { p: [x, b + 0.16, 0] });
    }
    k.add(rbox(0.03, 0.05, 0.05, 0.01), '#ff8a2e', 'gloss', { p: [0.18, b + 0.04, 0] });
    k.add(cyl(0.02, 0.02, 0.02, 10), '#ff8a2e', 'gloss', { p: [0.08, b - 0.06, 0.105], r: [Math.PI / 2, 0, 0] });
  },
  colander(k) {
    grip(k, '#e8475a', 0.3, 0.042);
    const holes = (x, y, z) => { // rows of round holes
      const row = Math.round(y * 60), a = Math.atan2(z, x) * 7 + (row % 2) * 0.5;
      return y > 0.03 && y < 0.17 && row % 2 === 0 && Math.abs(a - Math.round(a)) < 0.26 ? '#7a1622' : '#e8475a';
    };
    const b = bowlPts(0.08, 0.21, 0.2, 24);
    for (const pts of [b, inner(b)]) k.add(lathe(pts, 56), holes, 'gloss', { p: [0, 0.4, -0.06], r: [Math.PI / 2 - 0.5, 0, 0] });
    k.add(tor(0.215, 0.014, Math.PI * 2, 40), '#e8475a', 'gloss', { p: [0, 0.4, -0.06], r: [-0.5, 0, 0] });
  },
  'cotton-candy-machine'(k) {
    pistol(k, '#e8579a');
    const b = 0.18;
    k.add(lathe([[0.0, 0], [0.12, 0], [0.16, 0.12], [0.14, 0.12], [0.11, 0.02], [0.0, 0.02]], 24), (x, y, z) => (Math.round(Math.atan2(z, x) * 3) % 2 ? '#ffffff' : '#ff9cc8'), 'gloss', { p: [0, b, 0] });
    for (const [x, y, z, r] of [[0, 0.22, 0, 0.13], [0.09, 0.18, 0.03, 0.09], [-0.09, 0.19, -0.02, 0.1], [0.03, 0.32, 0.02, 0.09], [-0.04, 0.28, 0.07, 0.08]]) {
      k.add(new THREE.IcosahedronGeometry(r, 2), '#ffb3d6', 'matte', { p: [x, b + y, z] });
    }
  },
  'popcorn-popper'(k) {
    pistol(k, '#c42a3a');
    const b = 0.18;
    k.add(lathe([[0.0, 0], [0.11, 0], [0.15, 0.28], [0.0, 0.28]], 24), (x, y, z) => (Math.round(Math.atan2(z, x) * 16 / Math.PI) % 2 ? '#ffffff' : '#e8475a'), 'gloss', { p: [0, b, 0] });
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39, r = 0.03 + (i % 4) * 0.03;
      k.add(new THREE.IcosahedronGeometry(0.045, 1), i % 4 ? '#fff3c8' : '#ffd36b', 'matte', { p: [Math.cos(a) * r, b + 0.3 + (i % 3) * 0.035, Math.sin(a) * r] });
    }
  },
  peeler(k) {
    grip(k, '#8a5cf0', 0.3);
    for (const x of [-0.07, 0.07]) k.add(cyl(0.014, 0.014, 0.2, 8), STEEL, 'metal', { p: [x * 0.6, 0.26, 0], r: [0, 0, -x * 3.5] });
    k.add(rbox(0.2, 0.05, 0.02, 0.008), STEEL, 'metal', { p: [0, 0.37, 0] });
    k.add(rbox(0.16, 0.01, 0.024, 0.004), '#c9d1dd', 'metal', { p: [0, 0.35, 0.004] });
  },
  mixer(k) { // a hand mixer held by its handle, the motor and beaters above
    pistol(k, '#22a88a');
    const b = 0.27;
    k.add(rbox(0.28, 0.16, 0.2, 0.07), '#2fc9a8', 'gloss', { p: [0, b, 0] });
    k.add(rbox(0.06, 0.03, 0.03, 0.01), CREAM, 'gloss', { p: [0, b + 0.09, 0.04] });
    for (const x of [-0.05, 0.05]) {
      k.add(cyl(0.01, 0.01, 0.14, 6), STEEL, 'metal', { p: [x, b + 0.15, 0.02] });
      for (let i = 0; i < 3; i++) k.add(tor(0.035, 0.006, Math.PI * 2, 14), STEEL, 'metal', { p: [x, b + 0.25, 0.02], r: [0, (i / 3) * Math.PI, 0], s: [1, 1.7, 1] });
    }
  },
  'oven-mitt'(k) { // held by its hanging loop and cuff, the quilted mitt above the fist
    k.add(caps(0.046, 0.2), (x, y) => (Math.round(y * 60) % 2 ? '#fff4e6' : '#f2e2cc'), 'matte', { s: [1, 1, 0.8], ...G });
    k.add(cyl(0.1, 0.1, 0.08, 18), (x, y) => (Math.round(y * 60) % 2 ? '#fff4e6' : '#f2e2cc'), 'matte', { p: [0, 0.2, 0], s: [1, 1, 0.75] });
    k.add(caps(0.11, 0.2, 16), (x, y, z) => ((Math.round(x * 25) + Math.round(y * 25)) % 2 ? '#e8414f' : '#d23240'), 'matte', { p: [0, 0.4, 0], s: [1, 1, 0.62] });
    k.add(caps(0.05, 0.1, 10), '#d23240', 'matte', { p: [0.11, 0.32, 0.0], r: [0, 0, -0.6], s: [1, 1, 0.75] });
  },
  pan(k) {
    k.add(caps(0.04, 0.26, 10), DARK, 'gloss', { s: [1, 1, 0.75], ...G });
    k.add(rbox(0.05, 0.08, 0.03, 0.012), STEEL, 'metal', { p: [0, 0.2, 0] });
    k.add(lathe([[0.0, 0], [0.19, 0], [0.22, 0.06], [0.205, 0.06], [0.18, 0.012], [0.0, 0.012]], 30), (x, y) => (y > 0.05 ? '#9aa3b2' : DARK), 'gloss', { p: [0, 0.45, -0.02], r: [Math.PI / 2, 0, 0] });
    k.add(cyl(0.18, 0.18, 0.004, 30), '#3b3649', 'gloss', { p: [0, 0.45, -0.006], r: [Math.PI / 2, 0, 0] }); // non-stick
  },
};

// How many points of a utensil's non-handle parts are inside the fist (0 = nothing clips the hand).
export function fistClearance(id) {
  const k = new Kit();
  MAKERS[id](k);
  let n = 0, worst = 0;
  const v = new THREE.Vector3();
  const test = () => {
    const d = FIST.r - Math.hypot(v.x, v.z);
    if (Math.abs(v.y) < FIST.y && d > 0) { n++; worst = Math.max(worst, d); }
  };
  for (const g of k.solid) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); test(); }
    for (let i = 0; i + 2 < pos.count; i += 3) { // triangle middles too (big faces)
      v.set(0, 0, 0);
      for (let j = 0; j < 3; j++) { v.x += pos.getX(i + j) / 3; v.y += pos.getY(i + j) / 3; v.z += pos.getZ(i + j) / 3; }
      test();
    }
  }
  return { points: n, depth: +worst.toFixed(3) };
}
export const UTENSIL_MODEL_IDS = () => Object.keys(MAKERS);

const BAKED = {};
export function utensilParts(id) {
  if (BAKED[id]) return BAKED[id];
  const k = new Kit();
  (MAKERS[id] || MAKERS.spoon)(k);
  return (BAKED[id] = k.bake());
}

// A fresh mesh group for a utensil (geometry and materials are shared).
export function makeUtensilMesh(id, shadows = false) {
  const g = new THREE.Group();
  for (const [geo, m] of utensilParts(id)) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadows;
    g.add(mesh);
  }
  return g;
}
