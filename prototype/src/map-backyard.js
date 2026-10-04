// The Backyard BBQ (0.21): the second map. A lawn under an open sky, fenced in, with a giant picnic
// table in the middle (the main high ground, y 0, like the kitchen island), two benches alongside it,
// a kettle grill whose coals heat up like the stove burners, a cooler to climb, a kiddie pool that
// gets you Wet, a picnic blanket spread with giant food, two trees and a hedge for cover.
// It uses the kitchen's frame (lawn at FLOOR_Y, the same footprint), so everything else just works.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { addBox, addCyl, rand } from './core.js';
import { canvasTex, paint, mixHex, lumpy, F } from './world.js';

export const BACKYARD_REGIONS = {
  table: { minX: -66, maxX: 66, minZ: -30, maxZ: 30, top: 0, weight: 0.3 },
  floor: { minX: -225, maxX: 225, minZ: -160, maxZ: 150, top: F, weight: 0.47 },
  bench: { minX: -60, maxX: 60, minZ: -56, maxZ: 56, top: -18, weight: 0.17 },
  cooler: { minX: -166, maxX: -134, minZ: -110, maxZ: -90, top: -10, weight: 0.06 },
};

// ---------------------------------------------------------------- textures
function grass(x, w, h) {
  x.fillStyle = '#5f9e3b'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(120,180,70,0.35)'; x.fillRect(0, 0, w / 2, h); // mown stripes
  for (let i = 0; i < 2600; i++) {
    const g = 80 + Math.random() * 90 | 0;
    x.fillStyle = `rgba(${g * 0.55 | 0},${g + 40},${g * 0.35 | 0},0.5)`;
    x.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 4);
  }
}
function gingham(x, w, h) {
  x.fillStyle = '#fbf6ee'; x.fillRect(0, 0, w, h);
  const n = 8, s = w / n;
  for (let i = 0; i < n; i++) {
    x.fillStyle = 'rgba(214,44,44,0.55)';
    if (i % 2 === 0) { x.fillRect(i * s, 0, s, h); x.fillRect(0, i * s, w, s); }
  }
  for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) { x.fillStyle = 'rgba(200,30,30,0.5)'; x.fillRect(i * s, j * s, s, s); }
}
function planks(x, w, h) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = 150 + (i * 37 % 40);
    x.fillStyle = `rgb(${t + 40},${t - 10},${t - 70})`; x.fillRect(i * w / n, 0, w / n, h);
    x.fillStyle = 'rgba(70,40,20,0.5)'; x.fillRect(i * w / n, 0, 2, h);
    for (let k = 0; k < 12; k++) { x.fillStyle = 'rgba(90,55,25,0.18)'; x.fillRect(i * w / n + Math.random() * w / n, Math.random() * h, 1, 20 + Math.random() * 40); }
  }
}
function plaid(x, w, h) {
  x.fillStyle = '#2f5fa8'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    x.fillStyle = 'rgba(250,210,60,0.55)'; x.fillRect(i * w / 6 + 6, 0, 8, h); x.fillRect(0, i * h / 6 + 6, w, 8);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(i * w / 6 + 24, 0, 3, h); x.fillRect(0, i * h / 6 + 24, w, 3);
  }
}
function fence(x, w, h) {
  x.fillStyle = '#f3ede2'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(150,130,110,0.5)'; x.fillRect(i * w / 8, 0, 3, h); }
  x.fillStyle = 'rgba(150,130,110,0.35)'; x.fillRect(0, h * 0.18, w, 6); x.fillRect(0, h * 0.75, w, 6);
}

export function buildBackyard(W) {
  const S = W.scene, R = W.real, m = W.mats;
  // ---------------------------------------------------------------- sky and sun
  R.background = new THREE.Color('#9fd3f2');
  R.fog = new THREE.Fog('#cde8f6', 260, 820);
  const pmrem = new THREE.PMREMGenerator(W.renderer);
  R.environment?.dispose();
  R.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  R.environmentIntensity = 0.6;
  pmrem.dispose();
  S.add(new THREE.HemisphereLight('#e3f3ff', '#5d8a3a', 1.05));
  const sun = new THREE.DirectionalLight('#fff0d2', 3.0);
  sun.position.set(140, 230, 110);
  sun.target.position.set(0, -20, 0);
  S.add(sun, sun.target);
  sun.castShadow = !!W.quality.shadows;
  sun.shadow.mapSize.set(W.quality.shadows || 2048, W.quality.shadows || 2048);
  Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 230, bottom: -230, near: 20, far: 640 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  W.sun = sun;
  { // a sky dome fading to a pale horizon, with a few clouds
    const g = new THREE.SphereGeometry(1100, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    paint(g, (px, py, pz, c) => mixHex('#d9effa', '#5fa8e0', Math.pow(Math.max(0, py / 1100), 0.6), c));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.y = F - 40; sky.renderOrder = -1;
    S.add(sky);
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#cfe3f2', emissiveIntensity: 0.5, fog: false });
    for (let i = 0; i < 9; i++) {
      const cl = new THREE.Group(), a = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3), d = rand(420, 760);
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(rand(22, 40), 12, 8), cloudMat);
        b.position.set(k * 30 - 60, rand(-6, 10), rand(-15, 15)); b.scale.y = 0.55;
        cl.add(b);
      }
      cl.position.set(Math.cos(a) * d, rand(170, 260), Math.sin(a) * d); cl.lookAt(0, cl.position.y, 0);
      S.add(cl);
    }
  }

  // ---------------------------------------------------------------- materials
  m.grass = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, grass, { repeat: [90, 90] }), roughness: 0.95 });
  m.planks = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, planks, { repeat: [3, 1] }), roughness: 0.7 });
  m.wood = new THREE.MeshStandardMaterial({ color: '#b9773f', roughness: 0.7 });
  m.woodDark = new THREE.MeshStandardMaterial({ color: '#8a5530', roughness: 0.7 });
  m.cloth = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, gingham, { repeat: [6, 3] }), roughness: 0.9, side: THREE.DoubleSide });
  m.fence = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, fence, { repeat: [20, 1] }), roughness: 0.8 });
  m.steel = new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.9, roughness: 0.25 });
  m.dark = new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.5, metalness: 0.4 });
  m.grill = new THREE.MeshPhysicalMaterial({ color: '#c62f2a', roughness: 0.35, clearcoat: 0.8 });
  m.cooler = new THREE.MeshPhysicalMaterial({ color: '#2f86d6', roughness: 0.35, clearcoat: 0.6 });
  m.white = new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.5 });
  m.pool = new THREE.MeshPhysicalMaterial({ color: '#4fb8e8', roughness: 0.25, clearcoat: 1 });
  m.water = new THREE.MeshPhysicalMaterial({ color: '#9fdcff', roughness: 0.03, transparent: true, opacity: 0.6, clearcoat: 1, depthWrite: false });
  m.leaves = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.bark = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 });
  m.food = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  m.foodMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const food = (geo, color, x, y, z, matte = false) => W._mesh(paint(geo, color), matte ? m.foodMatte : m.food, x, y, z);

  // ---------------------------------------------------------------- lawn, fence, the house beyond
  W._mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), m.grass, 0, F, -5, { cast: false });
  const fenceH = 34;
  W._mesh(new THREE.PlaneGeometry(500, fenceH), m.fence, 0, F + fenceH / 2, -178, { cast: false });
  W._mesh(new THREE.PlaneGeometry(500, fenceH).rotateY(Math.PI), m.fence, 0, F + fenceH / 2, 168, { cast: false });
  W._mesh(new THREE.PlaneGeometry(350, fenceH).rotateY(Math.PI / 2), m.fence, -243, F + fenceH / 2, -5, { cast: false });
  W._mesh(new THREE.PlaneGeometry(350, fenceH).rotateY(-Math.PI / 2), m.fence, 243, F + fenceH / 2, -5, { cast: false });
  for (const [x0, x1, z0, z1] of [[-245, 245, -180, -177], [-245, 245, 167, 170], [-246, -243, -180, 170], [243, 246, -180, 170]]) {
    W._box(x0, x1, z0, z1, F + fenceH - 1.5, F + fenceH + 0.5, m.white, { cast: false });
  }
  { // the house behind the back fence, and treetops over the side fences
    const wall = new THREE.MeshStandardMaterial({ color: '#e9c9a0', roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: '#8b4a3a', roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe8f6', roughness: 0.1, metalness: 0.2, emissive: '#6f93ad', emissiveIntensity: 0.15 });
    W._box(-200, 120, -330, -250, F, F + 120, wall, { cast: false });
    W._mesh(new THREE.CylinderGeometry(52, 52, 340, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.75, 1), roof, -40, F + 139, -290, { cast: false }); // a gable roof
    for (const x of [-160, -100, 20, 80]) W._box(x - 16, x + 16, -251, -249, F + 60, F + 92, glass, { cast: false });
    W._box(-58, -22, -251, -249, F, F + 50, m.woodDark, { cast: false });
    for (const [x, z] of [[-320, -60], [-330, 90], [330, -40], [320, 110], [200, -300], [260, 240], [-260, 250]]) {
      W._mesh(new THREE.CylinderGeometry(6, 9, 120, 10), m.bark, x, F + 60, z, { cast: false });
      W._mesh(lumpy(paint(new THREE.IcosahedronGeometry(52, 3), (px, py, pz, c) => mixHex('#3f7d2a', '#79b84a', 0.5 + py / 104, c)), 0.12), m.leaves, x, F + 140, z, { cast: false });
    }
  }

  // ---------------------------------------------------------------- the picnic table (y 0) and benches (y -18)
  W._box(-70, 70, -34, 34, -3, 0, m.planks);
  addBox(-70, 70, -34, 34, -3, 0, { surface: 'wood' });
  W._mesh(new THREE.PlaneGeometry(132, 64).rotateX(-Math.PI / 2), m.cloth, 0, 0.06, 0, { cast: false });
  for (const sz of [-1, 1]) W._mesh(new THREE.PlaneGeometry(132, 7), m.cloth, 0, -3.4, sz * 32.1, { cast: false }); // cloth hanging over the sides
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) { // A-frame legs
      const leg = W._mesh(new THREE.BoxGeometry(4, 40, 4), m.wood, sx * 56, F + 17, sz * 22);
      leg.rotation.x = sz * 0.28; leg.updateMatrix();
      addBox(sx * 56 - 2, sx * 56 + 2, sz * 22 - 7, sz * 22 + 7, F, -3, { surface: 'wood' });
    }
    W._box(sx * 56 - 2, sx * 56 + 2, -62, 62, -22, -19, m.wood); // the beam that carries the benches
    addBox(sx * 56 - 2, sx * 56 + 2, -62, 62, -22, -19, { surface: 'wood' });
    for (const sz of [-1, 1]) addBox(sx * 56 - 2, sx * 56 + 2, sz * 62 - (sz > 0 ? 4 : 0), sz * 62 + (sz > 0 ? 0 : 4), F, -19, { surface: 'wood' }); // (the posts under the ends of the beam)
  }
  for (const sz of [-1, 1]) {
    const z0 = sz > 0 ? 46 : -58, z1 = sz > 0 ? 58 : -46;
    W._box(-64, 64, z0, z1, -21, -18, m.planks);
    addBox(-64, 64, z0, z1, -21, -18, { surface: 'wood' });
  }

  // ---------------------------------------------------------------- the kettle grill (coals heat up like the burners)
  {
    const gx = 150, gz = -95, top = -8;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = W._mesh(new THREE.CylinderGeometry(1.1, 1.1, 30, 8), m.dark, gx + Math.cos(a) * 12, F + 13, gz + Math.sin(a) * 12);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); leg.updateMatrix();
      addCyl(gx + Math.cos(a) * 12, gz + Math.sin(a) * 12, 1.6, F, F + 12, { surface: 'steel' });
    }
    W._mesh(new THREE.SphereGeometry(22, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.grill, gx, top, gz);
    W._mesh(new THREE.TorusGeometry(22, 0.7, 8, 48).rotateX(Math.PI / 2), m.steel, gx, top, gz, { cast: false });
    W._mesh(new THREE.CylinderGeometry(21, 21, 0.4, 48), m.dark, gx, top - 0.3, gz, { cast: false });
    addCyl(gx, gz, 21.5, F + 12, top, { surface: 'steel' });
    for (const [x, z] of [[gx - 7, gz - 4], [gx + 7, gz - 4], [gx, gz + 8]]) W._burner(x, top, z, 4.2, x === gx);
    // a bag of charcoal propped against it: cover from one side
    W._box(gx + 26, gx + 38, gz - 14, gz + 10, F, F + 22, new THREE.MeshStandardMaterial({ color: '#3b3b44', roughness: 0.9 }));
    W._box(gx + 25.8, gx + 38.2, gz - 6, gz + 2, F + 6, F + 16, new THREE.MeshStandardMaterial({ color: '#f2b51c', roughness: 0.7 }), { cast: false });
    addBox(gx + 26, gx + 38, gz - 14, gz + 10, F, F + 22, { surface: 'plastic' });
    // sausages and a burger sizzling on the grate
    food(new THREE.CapsuleGeometry(1.6, 8, 6, 12).rotateZ(Math.PI / 2), (px, py, pz, c) => mixHex('#c2552e', '#6e2c14', 0.5 + 0.5 * Math.sin(px * 1.5), c), gx - 2, top + 1.6, gz + 14);
    food(new THREE.CylinderGeometry(5, 5, 1.8, 24), '#5a3420', gx + 12, top + 0.9, gz + 9, true);
    addCyl(gx + 12, gz + 9, 5, top, top + 1.8, { surface: 'fruit' });
  }

  // ---------------------------------------------------------------- the cooler (y -10) and a melt puddle
  W._box(-168, -132, -112, -88, F, -12, m.cooler);
  W._box(-169, -131, -113, -87, -12, -10, m.white);
  addBox(-169, -131, -113, -87, F, -10, { surface: 'plastic' });
  addBox(-156, -144, -88, -86, -18, -14, { surface: 'plastic' }); // its handle
  W._box(-156, -144, -88, -86, -18, -14, m.white, { cast: false }); // handle
  W._water(-128, F, -80, 14, 9);
  for (const [x, z] of [[-122, -70], [-135, -76]]) {
    addBox(x - 2.3, x + 2.3, z - 2.3, z + 2.3, F, F + 5, { surface: 'ice' });
    W._mesh(new THREE.BoxGeometry(5, 5, 5).rotateY(rand(0, 1)), new THREE.MeshPhysicalMaterial({ color: '#e3f6ff', roughness: 0.05, transparent: true, opacity: 0.8, clearcoat: 1 }), x, F + 2.5, z);
  }

  // ---------------------------------------------------------------- kiddie pool: get Wet
  {
    const px = -140, pz = 95, r = 30;
    // (0.28) an inflatable rim you climb over (a ring of solid sections) and water you wade in
    W._mesh(new THREE.TorusGeometry(r, 2.4, 12, 56).rotateX(Math.PI / 2), m.pool, px, F + 2.4, pz);
    W._mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), m.pool, px, F + 0.1, pz, { cast: false });
    for (let i = 0; i < 44; i++) { const a = (i / 44) * Math.PI * 2; addCyl(px + Math.cos(a) * r, pz + Math.sin(a) * r, 2.5, F, F + 4.8, { surface: 'plastic' }); }
    W._water(px, F + 1, pz, r - 2.4, r - 2.4);
    // a rubber duck to hide behind
    food(lumpy(new THREE.SphereGeometry(5, 20, 14), 0.02).scale(1.3, 0.9, 1), '#ffd23f', px + 8, F + 7.5, pz - 6);
    food(new THREE.SphereGeometry(3.4, 18, 12), '#ffd23f', px + 12, F + 12, pz - 6);
    food(new THREE.ConeGeometry(1.4, 3, 12).rotateZ(-Math.PI / 2), '#ff8a1f', px + 16.5, F + 11.5, pz - 6);
    addCyl(px + 9, pz - 6, 6, F + 3.5, F + 15, { surface: 'plastic' });
  }

  // ---------------------------------------------------------------- the picnic blanket and its giant food
  {
    const bx = 60, bz = 110;
    W._mesh(new THREE.PlaneGeometry(120, 70).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, plaid, { repeat: [3, 2] }), roughness: 0.95 }), bx, F + 0.05, bz, { cast: false });
    // a sandwich: bread, lettuce, cheese, ham, bread
    const sx = bx - 30, sz = bz - 8, layers = [['#e9c27a', 3.2], ['#6cc04a', 1.2], ['#ffd23f', 1], ['#f29a9a', 1.6], ['#e9c27a', 3.2]];
    let y = F;
    for (const [c, h] of layers) { food(new THREE.BoxGeometry(c === '#6cc04a' ? 24 : 22, h, c === '#6cc04a' ? 24 : 22, 4, 1, 4), c, sx, y + h / 2, sz, true); y += h; }
    addBox(sx - 11, sx + 11, sz - 11, sz + 11, F, y, { surface: 'fruit' });
    // a burger
    const ux = bx + 2, uz = bz + 18;
    let uy = F;
    for (const [c, r, h] of [['#d99a4a', 11, 3.5], ['#5a3420', 11.5, 3], ['#ffd23f', 12, 0.8], ['#6cc04a', 12.5, 0.8], ['#e0271c', 11, 1.2]]) {
      food(new THREE.CylinderGeometry(r, r, h, 32), c, ux, uy + h / 2, uz, c !== '#e0271c'); uy += h;
    }
    food(new THREE.SphereGeometry(11, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.65, 1), (px, py, pz, c) => mixHex('#e2a052', '#c8782e', py / 8, c), ux, uy, uz);
    addCyl(ux, uz, 12, F, uy + 6, { surface: 'fruit' });
    // a corn cob
    const corn = lumpy(new THREE.CapsuleGeometry(4, 22, 8, 16).rotateZ(Math.PI / 2), 0.04);
    food(corn, (px, py, pz, c) => mixHex('#ffd84a', '#f2b81c', 0.5 + 0.5 * Math.sin(px * 4) * Math.sin(Math.atan2(pz, py) * 10), c), bx + 34, F + 4, bz - 14);
    addBox(bx + 19, bx + 49, bz - 18, bz - 10, F, F + 8, { surface: 'fruit' });
    // ketchup and mustard
    for (const [x, z, c] of [[bx - 4, bz - 20, '#d62a1e'], [bx + 6, bz - 24, '#f2c21c']]) {
      food(new THREE.CylinderGeometry(4, 4.4, 18, 24), c, x, F + 9, z);
      food(new THREE.ConeGeometry(4, 6, 24), c, x, F + 21, z);
      food(new THREE.CylinderGeometry(0.6, 0.9, 3, 10), '#f6f3ee', x, F + 25, z);
      addCyl(x, z, 4.4, F, F + 24, { surface: 'plastic' });
    }
    // a slice of watermelon lying on its side, and paper cups
    const wedge = new THREE.CylinderGeometry(14, 14, 4, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2);
    food(wedge, (px, py, pz, c) => { const d = Math.hypot(px, py); if (d > 12.8) c.set('#2f8a3a'); else if (d > 11.6) c.set('#d6f2b0'); else mixHex('#ff4f64', '#e8344c', 0.5 + 0.5 * Math.sin(px * 3 + py * 2), c); }, bx + 40, F + 0.1, bz + 22);
    addBox(bx + 26, bx + 54, bz + 20, bz + 24, F, F + 14, { surface: 'fruit' });
    for (const [x, z] of [[bx - 40, bz + 22], [bx - 30, bz + 28]]) {
      W._mesh(new THREE.CylinderGeometry(4, 3, 11, 24, 1, true), m.white, x, F + 5.5, z);
      addCyl(x, z, 4, F, F + 11, { surface: 'plastic' });
    }
    W._honey(bx + 22, F, bz - 30, 5);
  }

  // ---------------------------------------------------------------- trees and a hedge for cover
  for (const [x, z, r] of [[-200, -30, 7], [205, 70, 8]]) {
    W._mesh(new THREE.CylinderGeometry(r * 0.8, r * 1.2, 110, 14), m.bark, x, F + 55, z);
    addCyl(x, z, r * 1.1, F, F + 110, { surface: 'wood' });
    W._mesh(lumpy(paint(new THREE.IcosahedronGeometry(40, 3), (px, py, pz, c) => mixHex('#3c7a28', '#7cbb4c', 0.5 + py / 80, c)), 0.15), m.leaves, x, F + 120, z);
  }
  for (const [x0, x1, z0, z1] of [[-238, -222, -150, -70], [222, 238, -40, 30], [-120, -40, 150, 162]]) {
    W._mesh(lumpy(paint(new THREE.BoxGeometry(x1 - x0, 14, z1 - z0, 8, 3, 8), (px, py, pz, c) => mixHex('#2f6e22', '#5da43a', 0.5 + py / 14, c)), 0.04), m.leaves, (x0 + x1) / 2, F + 7, (z0 + z1) / 2);
    addBox(x0, x1, z0, z1, F, F + 14, { surface: 'wood' });
  }
  // a garden gnome and a watering can
  food(new THREE.CylinderGeometry(3, 4, 10, 16), '#3a6fd0', 120, F + 5, 60, true);
  food(new THREE.SphereGeometry(3, 16, 12), '#f2c9a0', 120, F + 12, 60, true);
  food(new THREE.ConeGeometry(3.3, 8, 16), '#d62a1e', 120, F + 17.5, 60);
  food(new THREE.SphereGeometry(2.6, 12, 8).scale(1, 1.2, 0.8), '#f6f3ee', 120, F + 9.5, 62.5, true);
  addCyl(120, 60, 4, F, F + 21, { surface: 'plastic' });
  W._mesh(new THREE.CylinderGeometry(7, 7, 12, 24), m.steel, -60, F + 6, -130);
  W._mesh(new THREE.CylinderGeometry(1, 1.4, 16, 10).rotateZ(-0.9), m.steel, -50, F + 10, -130);
  addBox(-53, -45, -131.4, -128.6, F + 6, F + 15, { surface: 'steel' }); // the spout
  addCyl(-60, -130, 7, F, F + 12, { surface: 'steel' });

  // ---------------------------------------------------------------- pads, the giant tomato, the tide, spawns
  W._pads([
    [-84, 0, -52, 0, 0], [84, 0, 52, 0, 0], [-84, 18, -44, 0, 14], [84, -18, 44, 0, -14],
    [-150, 30, -50, 0, 20], [150, 30, 50, 0, -20], [0, 120, 10, 0, 22], [-30, -120, -20, 0, -22],
    [0, 74, 0, -18, 52], [0, -74, 0, -18, -52], [-40, 76, -36, -18, 52], [40, -76, 36, -18, -52],
    [-120, -100, -150, -10, -100], [118, -122, 150, -8, -112],
  ]);
  W._landmark(-34, 12);
  W._tide();
  // spawn spots for food: the table, the benches, the cooler and around the lawn
  const pts = [];
  for (let i = 0; i < 18; i++) pts.push(W.randomOpenSpot('table', 4));
  for (let i = 0; i < 8; i++) pts.push(W.randomOpenSpot('bench', 2));
  for (let i = 0; i < 2; i++) pts.push(W.randomOpenSpot('cooler', 3));
  for (let i = 0; i < 30; i++) pts.push(W.randomOpenSpot('floor', 4));
  W.spawnPoints = pts;
}
