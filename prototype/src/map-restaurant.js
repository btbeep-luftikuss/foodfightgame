// The Restaurant, "Chez Titan" (0.31): the third map. A candle-lit dining room after closing time:
//   - a long skirted buffet in the middle (y 0, the main high ground) with chafing dishes, a tiered
//     wedding cake to climb, a punch bowl that gets you Wet, a cheese board with a hot warming plate
//     and the giant tomato;
//   - the bar along the back wall (y 0) with beer taps, an ice bucket, a mirror, shelves of bottles,
//     a neon sign and a row of tall bar stools in front of it;
//   - the open kitchen pass on the east wall (y 0) with a flat-top griddle (it heats up like the stove)
//     and plates waiting under the heat lamps;
//   - round tables (y -6) with chairs, red leather booths along the south wall, and a stage with a grand
//     piano you can stand on (y 0) or hide under;
//   - on the floor: a dropped olive, a champagne bottle on its side, a croissant, a spilled glass of
//     wine (slippery), a tipped-over mop bucket (wet), a fork, a dinner roll.
// It uses the kitchen's frame (floor at FLOOR_Y, the same footprint), so everything else just works.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { addBox, addCyl, rand } from './core.js';
import { canvasTex, paint, mixHex, lumpy, F } from './world.js';

export const RESTAURANT_REGIONS = {
  buffet: { minX: -66, maxX: 66, minZ: -27, maxZ: 27, top: 0, weight: 0.3 },
  floor: { minX: -225, maxX: 225, minZ: -118, maxZ: 120, top: F, weight: 0.42 },
  bar: { minX: -205, maxX: 105, minZ: -168, maxZ: -147, top: 0, weight: 0.12 },
  pass: { minX: 201, maxX: 237, minZ: -110, maxZ: 70, top: 0, weight: 0.06 },
  tables: { minX: -222, maxX: 158, minZ: -72, maxZ: 166, top: -6, weight: 0.1 },
};

// ---------------------------------------------------------------- textures
function plankFloor(x, w, h) {
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = -Math.random() * w * 0.3;
    while (px < w) {
      const len = w * (0.22 + Math.random() * 0.33), t = 112 + Math.random() * 38;
      x.fillStyle = `rgb(${t + 38},${t - 2},${t - 46})`;
      x.fillRect(px, r * rh, len, rh);
      for (let k = 0; k < 7; k++) { x.fillStyle = `rgba(70,35,12,${0.08 + Math.random() * 0.14})`; x.fillRect(px, r * rh + Math.random() * rh, len, 1); }
      x.fillStyle = 'rgba(38,16,6,0.6)'; x.fillRect(px, r * rh, 2, rh);
      px += len;
    }
    x.fillStyle = 'rgba(38,16,6,0.55)'; x.fillRect(0, r * rh, w, 2);
  }
}
function damask(x, w, h) {
  x.fillStyle = '#5a1a20'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(i * w / 8, 0, w / 16, h); } // faint stripes
  const motif = (cx, cy) => {
    x.fillStyle = 'rgba(214,170,96,0.33)';
    x.beginPath(); x.ellipse(cx, cy, w * 0.07, h * 0.13, 0, 0, Math.PI * 2); x.fill();
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(cx, cy + s * h * 0.28); x.lineTo(cx + w * 0.05, cy + s * h * 0.18); x.lineTo(cx, cy + s * h * 0.1); x.lineTo(cx - w * 0.05, cy + s * h * 0.18); x.fill();
      x.strokeStyle = 'rgba(214,170,96,0.3)'; x.lineWidth = 3;
      x.beginPath(); x.arc(cx + s * w * 0.12, cy, w * 0.07, s > 0 ? Math.PI * 0.6 : -Math.PI * 0.4, s > 0 ? Math.PI * 1.6 : Math.PI * 0.6); x.stroke();
    }
  };
  motif(w * 0.25, h * 0.25); motif(w * 0.75, h * 0.75); motif(w * 0.75, h * -0.25); motif(w * 0.25, h * 1.25);
}
function wainscot(x, w, h) {
  x.fillStyle = '#4a2a18'; x.fillRect(0, 0, w, h);
  const n = 2;
  for (let i = 0; i < n; i++) {
    const px = i * w / n + 10, pw = w / n - 20;
    x.fillStyle = '#5b3420'; x.fillRect(px, 14, pw, h - 28);
    x.strokeStyle = 'rgba(20,8,2,0.6)'; x.lineWidth = 4; x.strokeRect(px, 14, pw, h - 28);
    x.strokeStyle = 'rgba(255,220,170,0.12)'; x.lineWidth = 2; x.strokeRect(px + 6, 20, pw - 12, h - 40);
  }
  x.fillStyle = '#c9a24a'; x.fillRect(0, 0, w, 5); // brass rail on top
}
function nightWindow(x, w, h) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1230'); g.addColorStop(0.6, '#2a1f4a'); g.addColorStop(1, '#4a2a3a');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,240,${Math.random() * 0.8})`; x.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5); }
  x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(w * 0.72, h * 0.18, w * 0.07, 0, Math.PI * 2); x.fill(); // the moon
  x.fillStyle = '#0b1230'; x.beginPath(); x.arc(w * 0.75, h * 0.16, w * 0.06, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 9; i++) { // the street across the way
    const bw = w * (0.1 + Math.random() * 0.14), bx = (i / 9) * w - bw * 0.3, bh = h * (0.25 + Math.random() * 0.3);
    x.fillStyle = '#120c1c'; x.fillRect(bx, h - bh, bw, bh);
    for (let k = 0; k < 14; k++) if (Math.random() < 0.55) { x.fillStyle = Math.random() < 0.7 ? '#ffcf6a' : '#8fd8ff'; x.fillRect(bx + 4 + (k % 3) * bw / 3.2, h - bh + 8 + Math.floor(k / 3) * 14, bw / 6, 7); }
  }
  // window bars
  x.fillStyle = '#2a1810'; x.fillRect(w / 2 - 4, 0, 8, h); x.fillRect(0, h * 0.45, w, 8);
}
function neon(x, w, h) {
  x.clearRect(0, 0, w, h);
  x.font = `900 ${h * 0.62}px "Bagel Fat One", "Arial Black", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ff4fa3'; x.shadowBlur = 28;
  x.fillStyle = '#ffd1ea'; x.fillText('CHEZ TITAN', w / 2, h * 0.55);
  x.shadowBlur = 12; x.fillText('CHEZ TITAN', w / 2, h * 0.55);
}
function chalkboard(x, w, h) {
  x.fillStyle = '#1f2a24'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(Math.random() * w, Math.random() * h, 20, 2); }
  x.strokeStyle = '#7a4a2a'; x.lineWidth = 18; x.strokeRect(0, 0, w, h);
  x.fillStyle = '#f2efe6'; x.textAlign = 'center';
  x.font = `900 ${h * 0.11}px "Bagel Fat One", "Arial Black", sans-serif`; x.fillText("TODAY'S SPECIALS", w / 2, h * 0.17);
  x.font = `700 ${h * 0.065}px sans-serif`;
  ['Tomato Dash Soup', 'Ice Storm Sorbet', 'Melon Smash', 'Chili Flambé (careful!)', 'Berry Spiral Tart'].forEach((t, i) => x.fillText(t, w / 2, h * (0.33 + i * 0.13)));
}
function pianoKeys(x, w, h) {
  x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, w, h);
  const n = 36, kw = w / n;
  x.strokeStyle = '#9a948a'; x.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * kw, 0); x.lineTo(i * kw, h); x.stroke(); }
  x.fillStyle = '#16131a';
  for (let i = 0; i < n; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) x.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
}
function velvet(x, w, h) {
  for (let i = 0; i < w; i += 4) { const t = 0.5 + 0.5 * Math.sin(i * 0.08); x.fillStyle = `rgb(${110 + t * 60 | 0},${12 + t * 10 | 0},${20 + t * 12 | 0})`; x.fillRect(i, 0, 4, h); }
}
function gingham(x, w, h) {
  x.fillStyle = '#fbf6ee'; x.fillRect(0, 0, w, h);
  const n = 8, s = w / n;
  for (let i = 0; i < n; i += 2) { x.fillStyle = 'rgba(190,30,36,0.5)'; x.fillRect(i * s, 0, s, h); x.fillRect(0, i * s, w, s); }
}
function label(text, bg, fg) {
  return canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = fg; x.font = `900 ${h * 0.4}px "Bagel Fat One", "Arial Black", sans-serif`; x.textAlign = 'center';
    x.fillText(text, w / 2, h * 0.64);
  });
}

export function buildRestaurant(W) {
  const S = W.scene, R = W.real, m = W.mats;
  // ---------------------------------------------------------------- evening light
  R.background = new THREE.Color('#2b1d16');
  R.fog = new THREE.Fog('#3a281d', 260, 780);
  const pmrem = new THREE.PMREMGenerator(W.renderer);
  R.environment?.dispose();
  R.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  R.environmentIntensity = 0.5;
  pmrem.dispose();
  S.add(new THREE.HemisphereLight('#ffe2b8', '#4a2e1e', 0.85));
  const sun = new THREE.DirectionalLight('#ffd6a0', 2.3); // the warm glow of the chandeliers, as one light
  sun.position.set(90, 210, 150);
  sun.target.position.set(0, -20, 0);
  S.add(sun, sun.target);
  sun.castShadow = !!W.quality.shadows;
  sun.shadow.mapSize.set(W.quality.shadows || 2048, W.quality.shadows || 2048);
  Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 230, bottom: -230, near: 20, far: 640 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  W.sun = sun;
  const moon = new THREE.DirectionalLight('#9fb6ff', 0.4); // cool moonlight through the windows
  moon.position.set(-150, 90, 160);
  S.add(moon);

  // ---------------------------------------------------------------- materials
  m.floor = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, plankFloor, { repeat: [34, 26] }), roughness: 0.42 });
  m.wallpaper = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, damask, { repeat: [26, 3] }), roughness: 0.85 });
  m.panel = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, wainscot, { repeat: [30, 1] }), roughness: 0.5 });
  m.wood = new THREE.MeshStandardMaterial({ color: '#5a3320', roughness: 0.42 });
  m.woodLight = new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.5 });
  m.basket = new THREE.MeshStandardMaterial({ color: '#b07a40', roughness: 0.7, side: THREE.DoubleSide });
  m.barTop = new THREE.MeshPhysicalMaterial({ color: '#3d2416', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 });
  m.cloth = new THREE.MeshStandardMaterial({ color: '#f6f1e7', roughness: 0.88 });
  m.redCloth = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, gingham, { repeat: [3, 3] }), roughness: 0.9 });
  m.runner = new THREE.MeshStandardMaterial({ color: '#9c1f2a', roughness: 0.8 });
  m.brass = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.3 });
  m.steel = new THREE.MeshStandardMaterial({ color: '#d4d8dc', metalness: 0.9, roughness: 0.22 });
  m.chrome = new THREE.MeshStandardMaterial({ color: '#f2f4f6', metalness: 1, roughness: 0.08 });
  m.dark = new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.6 });
  m.ceramic = new THREE.MeshPhysicalMaterial({ color: '#f7f5f0', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  m.glass = new THREE.MeshPhysicalMaterial({ color: '#d8ecff', roughness: 0.05, transparent: true, opacity: 0.68, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }); // (0.40) mostly solid, from both sides (it was 0.36: you saw straight through)
  m.leather = new THREE.MeshPhysicalMaterial({ color: '#8a1d24', roughness: 0.45, clearcoat: 0.4 });
  m.piano = new THREE.MeshPhysicalMaterial({ color: '#141118', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  m.ceiling = new THREE.MeshStandardMaterial({ color: '#3a2418', roughness: 0.9 });
  m.water = new THREE.MeshPhysicalMaterial({ color: '#b9e2ff', roughness: 0.03, transparent: true, opacity: 0.82, clearcoat: 1, depthWrite: false }); // (0.40) 0.55 before
  m.white = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.5 });
  m.martini = new THREE.MeshPhysicalMaterial({ color: '#e8f0b0', roughness: 0.05, clearcoat: 1 });
  m.wine = new THREE.MeshStandardMaterial({ color: '#8e1530', roughness: 0.15 });
  m.glow = new THREE.MeshBasicMaterial({ color: '#ffe0a0' });
  m.flame = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  m.food = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  m.foodMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const food = (geo, color, x, y, z, matte = false) => W._mesh(paint(geo, color), matte ? m.foodMatte : m.food, x, y, z);
  const fruit = { surface: 'fruit' };

  // ---------------------------------------------------------------- the room
  W._mesh(new THREE.PlaneGeometry(520, 380).rotateX(-Math.PI / 2), m.floor, 0, F, -5, { cast: false });
  const PH = 30; // wainscot height
  for (const [geo, x, z] of [
    [new THREE.PlaneGeometry(520, 120), 0, -178], [new THREE.PlaneGeometry(520, 120).rotateY(Math.PI), 0, 170],
    [new THREE.PlaneGeometry(360, 120).rotateY(Math.PI / 2), -245, -4], [new THREE.PlaneGeometry(360, 120).rotateY(-Math.PI / 2), 245, -4],
  ]) W._mesh(geo, m.wallpaper, x, F + 60, z, { cast: false });
  for (const [geo, x, z] of [
    [new THREE.PlaneGeometry(520, PH), 0, -177.6], [new THREE.PlaneGeometry(520, PH).rotateY(Math.PI), 0, 169.6],
    [new THREE.PlaneGeometry(360, PH).rotateY(Math.PI / 2), -244.6, -4], [new THREE.PlaneGeometry(360, PH).rotateY(-Math.PI / 2), 244.6, -4],
  ]) W._mesh(geo, m.panel, x, F + PH / 2, z, { cast: false });
  W._mesh(new THREE.PlaneGeometry(520, 380).rotateX(Math.PI / 2), m.ceiling, 0, F + 110, -5, { cast: false });
  for (let x = -200; x <= 200; x += 80) W._box(x - 2, x + 2, -178, 170, F + 104, F + 110, m.wood, { cast: false }); // ceiling beams
  W._box(-245, 245, 167, 170, F, F + 4, m.wood, { cast: false });
  W._box(-245, -242, -178, 170, F, F + 4, m.wood, { cast: false });
  W._box(242, 245, -178, 170, F, F + 4, m.wood, { cast: false });
  // tall windows onto the night street (south wall), with brass frames
  const winMat = new THREE.MeshBasicMaterial({ map: canvasTex(256, 384, nightWindow) });
  for (const x of [-190, -100, -10]) { // (over the booths; the stage curtain covers the east end)
    W._mesh(new THREE.PlaneGeometry(54, 70).rotateY(Math.PI), winMat, x, F + 72, 169.4, { cast: false, receive: false });
    W._box(x - 29, x + 29, 168, 170, F + 35, F + 37, m.brass, { cast: false });
    W._box(x - 29, x + 29, 168, 170, F + 107, F + 109, m.brass, { cast: false });
    for (const sx of [-1, 1]) W._box(x + sx * 28 - 1, x + sx * 28 + 1, 168, 170, F + 36, F + 108, m.brass, { cast: false });
  }
  // chandeliers: brass rings of glowing candles (out of reach, they only light the mood)
  for (const [x, z, r] of [[0, 0, 16], [-150, 10, 11], [150, -20, 11], [-60, 140, 9], [100, -140, 9]]) {
    W._mesh(new THREE.CylinderGeometry(0.3, 0.3, 20, 6), m.brass, x, F + 100, z, { cast: false });
    W._mesh(new THREE.TorusGeometry(r, 0.6, 8, 40).rotateX(Math.PI / 2), m.brass, x, F + 90, z, { cast: false });
    W._mesh(new THREE.SphereGeometry(r * 0.25, 16, 10), m.brass, x, F + 88, z, { cast: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      W._mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 8), m.white, x + Math.cos(a) * r, F + 92, z + Math.sin(a) * r, { cast: false });
      W._mesh(new THREE.SphereGeometry(0.75, 8, 6), m.glow, x + Math.cos(a) * r, F + 94.2, z + Math.sin(a) * r, { cast: false, receive: false });
    }
  }
  // the specials board (west wall)
  W._mesh(new THREE.PlaneGeometry(60, 45).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 384, chalkboard), roughness: 0.9 }), -244, F + 62, -60, { cast: false });

  // ---------------------------------------------------------------- the bar (back wall, y 0)
  W._box(-210, 110, -178, -148, F, -2.5, m.wood); // (0.35) down to the wall (there was a hollow under the top)
  for (let x = -200; x < 110; x += 20) W._box(x - 8, x + 8, -147.9, -147.4, F + 6, -8, m.woodLight, { cast: false }); // front panels
  W._box(-212, 112, -178, -144, -2.5, 0, m.barTop);
  addBox(-210, 110, -178, -147.4, F, -2.5, { surface: 'wood', counter: true }); // (0.35) the bar's front, then its top that overhangs it
  addBox(-212, 112, -178, -144, -2.5, 0, { surface: 'wood', counter: true });
  W._box(-210, 110, -143.2, -142.2, F + 5, F + 6.6, m.brass, { cast: false }); // foot rail
  // back shelves: a mirror, three shelves of bottles, the neon sign
  W._box(-212, 112, -178, -175, 0, 52, m.wood);
  addBox(-212, 112, -178, -175, 0, 52, { surface: 'wood' }); // (0.35) the back panel, the shelves and each bottle (it was one deep block)
  for (const y of [14, 30, 46]) addBox(-212, 112, -178, -171, y - 1, y, { surface: 'wood' });
  W._mesh(new THREE.PlaneGeometry(300, 44), new THREE.MeshStandardMaterial({ color: '#b8c4cc', metalness: 1, roughness: 0.06 }), -50, 26, -174.9, { cast: false });
  for (const y of [14, 30, 46]) W._box(-212, 112, -178, -171, y - 1, y, m.wood);
  const bottleCols = ['#2f6a3a', '#7a4a1a', '#a8c8d8', '#7a1a2a', '#d9a23a', '#3a5a8a'];
  for (const y of [14, 30, 46]) {
    for (let x = -200; x < 100; x += 9 + (Math.abs(Math.sin(x * 7.1 + y)) * 6 | 0)) {
      const h = 8 + Math.abs(Math.sin(x * 3.3 + y)) * 5, c = bottleCols[Math.abs(Math.round(x * 0.37 + y)) % bottleCols.length], z = -173.5;
      food(new THREE.CylinderGeometry(2, 2, h, 12), c, x, y + h / 2, z);
      food(new THREE.CylinderGeometry(0.6, 1.6, 3.5, 10), c, x, y + h + 1.75, z);
      food(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 8), '#e9d9b0', x, y + h + 4, z, true);
      addCyl(x, z, 2, y, y + h, { surface: 'glass' });
      addCyl(x, z, 1.1, y + h, y + h + 4.6, { surface: 'glass' });
    }
  }
  const sign = W._mesh(new THREE.PlaneGeometry(120, 19), new THREE.MeshBasicMaterial({ map: canvasTex(1024, 160, neon), transparent: true, depthWrite: false }), -50, 64, -175.5, { cast: false, receive: false, dyn: true });
  sign.renderOrder = 2;
  // on the bar: beer taps, an ice bucket (water on top: Wet), a bowl of limes, cocktail glasses, the till
  W._box(-126, -114, -162, -154, 0, 18, m.chrome);
  for (const [dx, c] of [[-4, '#d62a1e'], [0, '#f2c21c'], [4, '#2f6fb0']]) {
    W._mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 8).rotateX(0.3), m.chrome, -120 + dx, 15, -152.5, { cast: false });
    food(new THREE.CylinderGeometry(0.9, 0.6, 5, 10), c, -120 + dx, 21, -153);
  }
  addBox(-126, -114, -162, -154, 0, 18, { surface: 'steel' });
  W._mesh(new THREE.CylinderGeometry(7, 6, 10, 32), m.steel, -40, 5, -158);
  W._mesh(new THREE.TorusGeometry(7, 0.5, 8, 32).rotateX(Math.PI / 2), m.chrome, -40, 10, -158, { cast: false });
  for (const [dx, dz, a] of [[-2, -2, 0.3], [2.5, 1, 1.1], [-1, 3, 2]]) {
    const ice = W._mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshPhysicalMaterial({ color: '#e3f6ff', roughness: 0.05, transparent: true, opacity: 0.92, clearcoat: 1 }), -40 + dx, 10.4, -158 + dz, { cast: false });
    ice.rotation.set(a, a * 0.7, 0.3);
  }
  W._water(-40, 10.05, -158, 6, 6);
  addCyl(-40, -158, 7, 0, 10, { surface: 'steel' });
  W._bowl(-80, 5.5, -160, 8, new THREE.MeshPhysicalMaterial({ color: '#c7384a', roughness: 0.2, clearcoat: 1 }), '#f6efe2'); // (0.35) a red bowl with a cream inside (its top showed the bar top through it)
  for (const [dx, dz] of [[-2.5, -1], [2, 1.5], [0, -3], [3, -2.5], [-2, 3]]) {
    food(lumpy(new THREE.SphereGeometry(2.6, 18, 12), 0.03).scale(1.2, 1, 1), (px, py, pz, c) => mixHex('#5aa62a', '#8fd14f', 0.5 + py / 5, c), -80 + dx, 6.2, -160 + dz);
  }
  W._roundCols(-80, -160, 0, 5.5, 3, (y) => Math.sqrt(Math.max(0, 64 - (5.5 - y) ** 2)), fruit);
  addCyl(-80, -160, 5, 5.5, 8, fruit); // the limes
  for (const [x, z] of [[-172, -156], [-160, -151], [16, -154]]) { // martini glasses with an olive
    W._mesh(new THREE.ConeGeometry(4, 5, 24, 1, true).rotateX(Math.PI), m.glass, x, 9.5, z, { cast: false });
    W._mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), m.glass, x, 3.5, z, { cast: false });
    W._mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 20), m.glass, x, 0.2, z, { cast: false });
    W._glassRim(x, 12, z, 4);
    W._mesh(new THREE.CircleGeometry(3.3, 24).rotateX(-Math.PI / 2), m.martini, x, 11.1, z, { cast: false }); // (0.35) the drink
    food(new THREE.SphereGeometry(0.9, 12, 8), '#6b8e23', x, 10.6, z);
    // (0.35) solid where the glass is: its foot, its stem, its cone up to the drink, then its rim
    addCyl(x, z, 2.4, 0, 0.4, { surface: 'glass' });
    addCyl(x, z, 0.5, 0.4, 7, { surface: 'glass' });
    W._roundCols(x, z, 7, 11.1, 3, (y) => (4 * (y - 7)) / 5, { surface: 'glass' });
    W._ring(x, z, 4, 0.5, 11.1, 12, 10, { surface: 'glass' });
  }
  W._box(60, 80, -166, -152, 0, 12, m.dark);
  W._box(61, 79, -167, -160, 12, 18, new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.4, emissive: '#1f6a3a', emissiveIntensity: 0.25 }));
  addBox(60, 80, -166, -152, 0, 12, { surface: 'steel' }); // (0.35) the till, then its screen at the back
  addBox(61, 79, -167, -160, 12, 18, { surface: 'steel' });
  W._box(-200, -190, -164, -156, 0, 8, m.chrome); // the napkin holder
  W._box(-199, -191, -163, -157, 0, 9.5, m.white, { cast: false });
  addBox(-200, -190, -164, -156, 0, 9.5, { surface: 'steel' });
  W._honey(-5, 0, -158, 3);
  // bar stools (seats at y -12: too tall to jump onto, fine to drop onto from the bar)
  for (let x = -195; x <= 75; x += 30) {
    W._mesh(new THREE.CylinderGeometry(6.5, 6, 2.5, 28), m.leather, x, -13.25, -128);
    W._mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.6, 28), m.chrome, x, -14.6, -128, { cast: false });
    W._mesh(new THREE.CylinderGeometry(1.1, 1.1, -14.5 - F, 10), m.chrome, x, (F - 14.5) / 2, -128);
    W._mesh(new THREE.TorusGeometry(4.5, 0.4, 8, 24).rotateX(Math.PI / 2), m.chrome, x, F + 10, -128, { cast: false });
    W._mesh(new THREE.CylinderGeometry(5, 5.4, 1.2, 24), m.chrome, x, F + 0.6, -128);
    addCyl(x, -128, 6.5, -14.5, -12, { surface: 'wood' });
    addCyl(x, -128, 1.1, F, -14.5, { surface: 'steel' });
    addCyl(x, -128, 5.4, F, F + 1.2, { surface: 'steel' });
  }

  // ---------------------------------------------------------------- the buffet (the middle, y 0)
  W._box(-70, 70, -30, 30, F, -1.5, m.cloth);
  for (let x = -66; x <= 66; x += 6) { // pleats in the skirt
    for (const z of [-30.3, 30.3]) W._box(x - 0.5, x + 0.5, z - 0.3, z + 0.3, F + 1, -2, m.white, { cast: false });
  }
  W._box(-71, 71, -31, 31, -1.5, 0, m.cloth);
  W._mesh(new THREE.PlaneGeometry(132, 12).rotateX(-Math.PI / 2), m.runner, 0, 0.05, 0, { cast: false });
  addBox(-70.3, 70.3, -30.6, 30.6, F, -1.5, { surface: 'wood', counter: true }); // (0.35) the skirt, then the top that overhangs it
  addBox(-71, 71, -31, 31, -1.5, 0, { surface: 'wood', counter: true });
  for (const x of [-45, -18, 9]) { // chafing dishes: domes on stands
    W._mesh(new THREE.CylinderGeometry(8, 7.5, 2, 32), m.steel, x, 1, -14);
    W._mesh(new THREE.SphereGeometry(7.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), m.chrome, x, 2, -14);
    W._mesh(new THREE.TorusGeometry(1.2, 0.35, 8, 16), m.brass, x, 8.6, -14, { cast: false });
    addCyl(x, -14, 7.8, 0, 2, { surface: 'steel' }); // (0.35) the pan, then the dome
    W._roundCols(x, -14, 2, 8, 4, (y) => 7.5 * Math.sqrt(Math.max(0, 1 - ((y - 2) / 6) ** 2)), { surface: 'steel' });
  }
  { // the wedding cake: three tiers to climb, strawberries on top
    const cx = 42, cz = 6;
    let y = 0;
    for (const [r, h] of [[13, 8], [9.5, 7], [6, 6]]) {
      food(new THREE.CylinderGeometry(r, r, h, 40), (px, py, pz, c) => mixHex('#fbf3e6', '#f3e2cf', 0.5 + 0.5 * Math.sin(Math.atan2(pz, px) * 12), c), cx, y + h / 2, cz, true);
      food(new THREE.TorusGeometry(r, 0.6, 8, 40).rotateX(Math.PI / 2), '#ff9fc4', cx, y + h, cz);
      addCyl(cx, cz, r, y, y + h, { surface: 'bread' });
      y += h;
    }
    for (const [dx, dz] of [[-2, -1], [2, 1.5], [0.5, -2.5]]) food(lumpy(new THREE.SphereGeometry(1.6, 14, 10), 0.05).scale(1, 1.2, 1), '#e0271c', cx + dx, y + 1.5, cz + dz);
  }
  { // the punch bowl: wade in to get Wet
    const px = -48, pz = 14;
    W._mesh(new THREE.CylinderGeometry(9.4, 7, 2.6, 40, 1, true), m.glass, px, 1.3, pz, { cast: false });
    const punch = W._mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#e0405a', roughness: 0.05, transparent: true, opacity: 0.88, clearcoat: 1, depthWrite: false }), px, 2.45, pz, { cast: false, dyn: true });
    punch.scale.set(8.6, 1, 8.6);
    W.waters.push({ x: px, y: 2.4, z: pz, rx: 8.6, rz: 8.6 });
    for (const [dx, dz] of [[-3, 2], [4, -1], [1, 4]]) food(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 16), '#ffd23a', px + dx, 2.6, pz + dz); // lemon slices
    W._mesh(new THREE.TorusGeometry(9.4, 0.4, 8, 40).rotateX(Math.PI / 2), m.glass, px, 2.6, pz, { cast: false });
    W._roundCols(px, pz, 0, 2.4, 2, (y) => 7 + (2.4 * y) / 2.6, { surface: 'glass' }); // (0.35) it widens to the rim
  }
  { // the cheese board (0.35: it was a roast): a big wheel of cheese, and a warming plate that heats up like a burner
    W._box(4, 20, 10, 22, 0, 1, m.woodLight);
    addBox(4, 20, 10, 22, 0, 1, { surface: 'wood' });
    food(new THREE.CylinderGeometry(6, 6, 5, 40, 2), (px, py, pz, c) => (Math.abs(py) > 2.4 && Math.hypot(px, pz) < 5.4 ? c.set('#ffd65a') : c.set('#e3a52a')), 12, 3.5, 16);
    for (const [dx, dz, r] of [[-2, 1, 0.9], [1.5, -2, 0.7], [2.2, 2, 0.5]]) food(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2), '#d9a530', 12 + dx, 6.02, 16 + dz, true); // holes
    W._roundCols(12, 16, 1, 6, 1, () => 5.8, { surface: 'cheese' });
    W._burner(-14, 0, 18, 5.5, true);
  }
  { // a fruit platter, a bread basket and a stack of plates
    W._mesh(new THREE.CylinderGeometry(7.5, 6.5, 0.6, 32), m.ceramic, -60, 0.3, -14);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, r = 1.5 + (i % 3) * 1.8;
      food(new THREE.SphereGeometry(1.4, 14, 10), ['#e0271c', '#7fbf3a', '#ff8c1a', '#6b2a86'][i % 4], -60 + Math.cos(a) * r, 1.6, -14 + Math.sin(a) * r);
    }
    addCyl(-60, -14, 7.2, 0, 0.6, fruit); // (0.35) the platter, then each fruit on it
    for (let i = 0; i < 9; i++) { const a = i * 2.39, r = 1.5 + (i % 3) * 1.8; addCyl(-60 + Math.cos(a) * r, -14 + Math.sin(a) * r, 1.3, 0.6, 3, fruit); }
    W._mesh(new THREE.CylinderGeometry(6, 5, 3.5, 24, 1, true), m.basket, 30, 1.75, -18); // (0.35) its inside shows now
    W._mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), m.woodLight, 30, 0.05, -18, { cast: false });
    for (const a of [0.3, -0.4, 1.2]) {
      food(new THREE.CapsuleGeometry(1.3, 9, 6, 12).rotateZ(Math.PI / 2 - 0.4).rotateY(a), (px, py, pz, c) => mixHex('#d68a3c', '#9a5520', 0.5 + py / 3, c), 30, 4.5, -18, true);
    }
    addCyl(30, -18, 5.6, 0, 3.5, { surface: 'bread' }); // (0.35) the basket, then the rolls in it
    addCyl(30, -18, 3.4, 3.5, 5.8, { surface: 'bread' });
    for (let i = 0; i < 6; i++) W._mesh(new THREE.CylinderGeometry(7 - (i % 2) * 0.3, 6.4, 0.85, 36), m.ceramic, 62, 0.43 + i * 0.88, 16);
    addCyl(62, 16, 7, 0, 5.3, { surface: 'ceramic' });
  }
  W._honey(58, 0, -18, 3.2);

  // ---------------------------------------------------------------- the open kitchen pass (east wall, y 0)
  W._box(198, 240, -112, 72, F, -1, m.steel);
  for (let z = -100; z < 70; z += 24) W._box(197.4, 198, z - 10, z + 10, F + 4, -6, m.chrome, { cast: false });
  W._box(197, 241, -113, 73, -1, 0, m.steel);
  addBox(198, 240, -112, 72, F, -1, { surface: 'steel', counter: true }); // (0.35) the counter, then its top that overhangs it
  addBox(197, 241, -113, 73, -1, 0, { surface: 'steel', counter: true });
  W._box(205, 236, -93, -47, 0, 0.6, m.dark, { cast: false }); // the flat-top griddle
  addBox(205, 236, -93, -47, 0, 0.6, { surface: 'steel' });
  W._burner(220, 0.6, -82, 6.5, true);
  W._burner(220, 0.6, -58, 6.5, false);
  W._box(210, 234, 8, 32, 0, 14, m.steel); // the deep fryer
  W._mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d9a23a', roughness: 0.15, emissive: '#5a3000', emissiveIntensity: 0.4 }), 222, 14.05, 20, { cast: false });
  addBox(210, 234, 8, 32, 0, 14, { surface: 'steel' });
  for (const [x, z, kind] of [[214, -30, 0], [227, -14, 1], [214, 0, 2]]) { // plates waiting under the heat lamps
    W._mesh(new THREE.CylinderGeometry(6.5, 5.6, 0.6, 32), m.ceramic, x, 0.3, z);
    if (kind === 0) food(lumpy(new THREE.SphereGeometry(4, 18, 12), 0.15).scale(1, 0.5, 1), (px, py, pz, c) => mixHex('#f2c94a', '#e0a82a', 0.5 + Math.sin(px * 3 + pz * 2) * 0.5, c), x, 1.8, z); // spaghetti
    if (kind === 0) for (const [dx, dz] of [[-1, 1], [1.5, -0.5], [0, -1.6]]) food(new THREE.SphereGeometry(1, 12, 8), '#e0271c', x + dx, 3, z + dz); // cherry tomatoes (0.35: they were meatballs)
    if (kind === 0) food(new THREE.SphereGeometry(1, 10, 6).scale(1.3, 0.2, 0.8), '#3f8f2f', x + 0.8, 3.6, z + 0.4, true); // a basil leaf
    if (kind === 1) { // a stack of pancakes with butter and syrup (0.35: it was a steak)
      for (let i = 0; i < 4; i++) food(new THREE.CylinderGeometry(4.2, 4.2, 0.7, 28), (px, py, pz, c) => mixHex('#e9b45a', '#c47a2a', Math.abs(py) > 0.3 ? 0.8 : 0.1, c), x, 0.95 + i * 0.72, z, true);
      food(new THREE.CylinderGeometry(3.6, 4, 0.2, 28), '#9a4a10', x, 3.8, z); // syrup
      food(new THREE.BoxGeometry(1.6, 0.7, 1.6), '#ffe38a', x, 4.2, z, true); // butter
    }
    if (kind === 2) for (let i = 0; i < 7; i++) food(lumpy(new THREE.IcosahedronGeometry(1.5, 1), 0.1), i % 3 ? '#5aa83e' : '#e0271c', x + Math.cos(i) * 2.4, 1.6, z + Math.sin(i) * 2.4, true); // salad
    addCyl(x, z, 6.2, 0, 0.6, fruit); // (0.35) the plate, then the food on it
    addCyl(x, z, kind === 1 ? 4.2 : 3.6, 0.6, kind === 1 ? 4.5 : kind === 2 ? 3.1 : 3.6, fruit);
  }
  W._box(203, 239, -110, 70, 30, 32, m.steel, { cast: false }); // the heat-lamp rail
  for (let z = -100; z <= 60; z += 32) {
    W._mesh(new THREE.ConeGeometry(3, 3, 16, 1, true), m.steel, 220, 28, z, { cast: false });
    W._mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff5a2a' }), 220, 27, z, { cast: false, receive: false });
  }

  // ---------------------------------------------------------------- round tables (y -6) with chairs
  const chair = (x, z, back) => { // back: the side the backrest is on ('n', 's', 'e' or 'w')
    const seatTop = F + 17.5, ns = back === 'n' || back === 's';
    const hx = ns ? 9 : 8, hz = ns ? 8 : 9;
    W._box(x - hx, x + hx, z - hz, z + hz, seatTop - 2, seatTop, m.wood);
    W._box(x - hx + 0.5, x + hx - 0.5, z - hz + 0.5, z + hz - 0.5, seatTop, seatTop + 0.8, m.leather, { cast: false });
    addBox(x - hx, x + hx, z - hz, z + hz, seatTop - 2, seatTop + 0.8, { surface: 'wood' });
    for (const [lx, lz] of [[-hx + 1.5, -hz + 1.5], [hx - 1.5, -hz + 1.5], [-hx + 1.5, hz - 1.5], [hx - 1.5, hz - 1.5]]) {
      W._mesh(new THREE.CylinderGeometry(0.9, 1, 17.5, 10), m.wood, x + lx, F + 8.75, z + lz);
      addCyl(x + lx, z + lz, 1, F, seatTop - 2, { surface: 'wood' });
    }
    const bx0 = back === 'e' ? x + hx - 2 : back === 'w' ? x - hx : x - hx, bx1 = back === 'e' ? x + hx : back === 'w' ? x - hx + 2 : x + hx;
    const bz0 = back === 's' ? z + hz - 2 : back === 'n' ? z - hz : z - hz, bz1 = back === 's' ? z + hz : back === 'n' ? z - hz + 2 : z + hz;
    W._box(bx0, bx1, bz0, bz1, seatTop, seatTop + 20, m.wood);
    addBox(bx0, bx1, bz0, bz1, seatTop, seatTop + 20, { surface: 'wood' });
  };
  const roundTable = (x, z) => {
    const top = -6, r = 22;
    W._mesh(new THREE.CylinderGeometry(r + 0.8, r + 0.8, 2.5, 48), m.cloth, x, top - 1.25, z);
    W._mesh(new THREE.CylinderGeometry(r + 1, r + 1.8, 7, 48, 1, true), m.cloth, x, top - 6, z, { cast: false });
    W._mesh(new THREE.CylinderGeometry(3, 3.5, top - 2.5 - F, 16), m.wood, x, (F + top - 2.5) / 2, z);
    W._mesh(new THREE.CylinderGeometry(10, 11, 1.5, 32), m.wood, x, F + 0.75, z);
    addCyl(x, z, r + 0.8, top - 2.5, top, { surface: 'wood' });
    addCyl(x, z, 3.5, F, top - 2.5, { surface: 'wood' });
    addCyl(x, z, 10.5, F, F + 1.5, { surface: 'wood' });
    for (const [dx, dz] of [[13, 0], [-13, 0], [0, 13], [0, -13]]) { // place settings
      W._mesh(new THREE.CylinderGeometry(6, 5.2, 0.5, 32), m.ceramic, x + dx, top + 0.25, z + dz);
      addCyl(x + dx, z + dz, 6, top, top + 0.5, { surface: 'ceramic' });
    }
    for (const [dx, dz] of [[8, 8], [-8, -8]]) { // wine glasses
      W._mesh(new THREE.CylinderGeometry(2.6, 1.8, 5, 20, 1, true), m.glass, x + dx, top + 8.5, z + dz, { cast: false });
      W._mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), m.glass, x + dx, top + 3, z + dz, { cast: false });
      W._mesh(new THREE.CylinderGeometry(2.05, 1.55, 3.2, 16), m.wine, x + dx, top + 7.75, z + dz); // (0.35) fuller, and clear of the glass
      W._mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 16), m.glass, x + dx, top + 0.15, z + dz, { cast: false }); // its foot
      W._glassRim(x + dx, top + 11, z + dz, 2.6);
      // (0.35) solid where the glass is: foot, stem, the bowl up to the wine, then its rim
      addCyl(x + dx, z + dz, 1.8, top, top + 0.3, { surface: 'glass' });
      addCyl(x + dx, z + dz, 0.45, top + 0.3, top + 6, { surface: 'glass' });
      addCyl(x + dx, z + dz, 2.2, top + 6, top + 9.4, { surface: 'glass' });
      W._ring(x + dx, z + dz, 2.6, 0.45, top + 9.4, top + 11, 8, { surface: 'glass' });
    }
    W._mesh(new THREE.CylinderGeometry(1.4, 1.4, 6, 12), m.white, x, top + 3, z); // the candle
    W._mesh(new THREE.ConeGeometry(0.6, 1.8, 8), m.flame, x, top + 6.9, z, { cast: false, receive: false });
    addCyl(x, z, 1.6, top, top + 6, { surface: 'ceramic' });
    chair(x + 31, z, 'e'); chair(x - 31, z, 'w'); chair(x, z + 31, 's'); chair(x, z - 31, 'n');
  };
  roundTable(-165, -45); roundTable(-165, 55); roundTable(130, -60); roundTable(130, 40);
  W._honey(139, -6, 31, 3);

  // ---------------------------------------------------------------- booths (south wall)
  const booth = (x0, x1) => {
    const z0 = 128, z1 = 166;
    for (const [bx0, bx1, backX0, backX1] of [[x0 + 3, x0 + 14, x0, x0 + 3], [x1 - 14, x1 - 3, x1 - 3, x1]]) {
      W._box(bx0, bx1, z0, z1, F, -21, m.wood);
      W._box(bx0, bx1, z0, z1, -21, -18, m.leather);
      W._box(backX0, backX1, z0, z1, F, -2, m.leather);
      W._box(backX0 - 0.2, backX1 + 0.2, z0 - 0.2, z1, -3, -1.6, m.wood, { cast: false });
      addBox(bx0, bx1, z0, z1, F, -18, { surface: 'wood' });
      addBox(backX0, backX1, z0, z1, F, -1.6, { surface: 'wood' });
    }
    const tx0 = x0 + 16, tx1 = x1 - 16, tz0 = 136;
    W._box(tx0, tx1, tz0, z1, -8.5, -6, m.wood);
    W._mesh(new THREE.PlaneGeometry(tx1 - tx0 + 1, z1 - tz0).rotateX(-Math.PI / 2), m.redCloth, (tx0 + tx1) / 2, -5.94, (tz0 + z1) / 2, { cast: false });
    W._mesh(new THREE.CylinderGeometry(2.4, 3, -8.5 - F, 12), m.wood, (tx0 + tx1) / 2, (F - 8.5) / 2, (tz0 + z1) / 2);
    addBox(tx0, tx1, tz0, z1, -8.5, -6, { surface: 'wood' });
    addCyl((tx0 + tx1) / 2, (tz0 + z1) / 2, 3, F, -8.5, { surface: 'wood' });
    const cx = (tx0 + tx1) / 2;
    W._mesh(new THREE.CylinderGeometry(5.5, 4.8, 0.5, 28), m.ceramic, cx, -5.75, 158); // a plate with a slice of pie
    const pie = new THREE.CylinderGeometry(3.6, 3.6, 2, 3, 1, false, 0, Math.PI * 0.5).rotateY(0.6);
    food(pie, (px, py, pz, c) => mixHex('#e9b24a', '#c47a2a', py + 0.5, c), cx, -4.5, 158, true);
    pie.computeBoundingBox(); const pc = pie.boundingBox.getCenter(new THREE.Vector3()); // (0.35) where the slice really is
    addCyl(cx, 158, 5.3, -6, -5.5, fruit); // (0.35) the plate, then the slice of pie on it
    addCyl(cx + pc.x, 158 + pc.z, 1.4, -5.5, -3.5, fruit);
    W._mesh(new THREE.CylinderGeometry(0.2, 0.2, 40, 6), m.brass, cx, F + 92, 150, { cast: false }); // a pendant lamp
    W._mesh(new THREE.ConeGeometry(4, 4, 20, 1, true), m.brass, cx, F + 70, 150, { cast: false });
    W._mesh(new THREE.SphereGeometry(1.5, 12, 8), m.glow, cx, F + 68.5, 150, { cast: false, receive: false });
  };
  booth(-225, -165); booth(-155, -95); booth(-85, -25);

  // ---------------------------------------------------------------- the stage and the grand piano
  W._box(60, 232, 105, 166, F, F + 8, m.woodLight);
  W._box(60, 232, 104.4, 105, F + 1, F + 7.4, m.brass, { cast: false });
  addBox(60, 232, 105, 166, F, F + 8, { surface: 'wood' });
  { // a red velvet curtain behind it
    const curtain = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, velvet, { repeat: [8, 1] }), roughness: 0.85, side: THREE.DoubleSide });
    W._mesh(new THREE.PlaneGeometry(176, 100).rotateY(Math.PI), curtain, 146, F + 58, 168.6, { cast: false });
    W._box(56, 236, 166, 170, F + 104, F + 110, m.brass, { cast: false });
  }
  { // the grand piano: stand on its lid (y 0) or hide under it
    const s = F + 8;
    W._box(110, 190, 118, 158, F + 22, F + 34.5, m.piano);
    W._box(109.5, 190.5, 117.5, 158.5, F + 34.5, F + 36, m.piano);
    W._box(110, 190, 112, 118, F + 22, F + 25.5, m.piano);
    W._mesh(new THREE.PlaneGeometry(78, 5.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 64, pianoKeys), roughness: 0.4 }), 150, F + 25.55, 115, { cast: false });
    for (const [x, z] of [[116, 124], [184, 124], [150, 154]]) {
      W._mesh(new THREE.CylinderGeometry(2.2, 1.6, F + 22 - s, 12), m.piano, x, (s + F + 22) / 2, z);
      W._mesh(new THREE.SphereGeometry(1.8, 12, 8), m.brass, x, s + 0.9, z, { cast: false });
      addCyl(x, z, 2.2, s, F + 22, { surface: 'wood' });
    }
    W._box(147, 153, 120, 122, s, F + 22, m.piano); // the pedal lyre
    addBox(110, 190, 118, 158, F + 22, F + 36, { surface: 'wood' });
    addBox(110, 190, 112, 118, F + 22, F + 25.5, { surface: 'wood' });
    W._box(160, 176, 150, 151, F + 36, F + 46, m.piano); // a music stand with a sheet of music
    W._mesh(new THREE.PlaneGeometry(14, 9), m.white, 168, F + 41, 149.4, { cast: false });
    // the piano bench, on the stage in front of the keys
    W._box(135, 165, 105.5, 110.5, s + 9, s + 12, m.leather);
    for (const [x, z] of [[137, 106.5], [163, 106.5], [137, 109.5], [163, 109.5]]) W._mesh(new THREE.CylinderGeometry(0.8, 0.8, 9, 8), m.piano, x, s + 4.5, z);
    addBox(135, 165, 105.5, 110.5, s + 9, s + 12, { surface: 'wood' });
    for (const [x, z] of [[137, 106.5], [163, 106.5], [137, 109.5], [163, 109.5]]) addCyl(x, z, 0.8, s, s + 9, { surface: 'wood' });
  }
  for (const x of [72, 220]) { // speakers
    W._box(x - 8, x + 8, 140, 156, F + 8, F + 32, m.dark);
    for (const y of [F + 15, F + 26]) W._mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.6, 24).rotateX(Math.PI / 2), m.chrome, x, y, 139.6, { cast: false });
    addBox(x - 8, x + 8, 140, 156, F + 8, F + 32, { surface: 'plastic' });
  }
  W._mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8), m.chrome, 92, F + 23, 122); // the microphone
  W._mesh(new THREE.SphereGeometry(1.6, 14, 10), m.dark, 92, F + 38.5, 122);
  addCyl(92, 122, 0.5, F + 8, F + 37, { surface: 'steel' }); // (0.35) as thin as the stand
  addCyl(92, 122, 1.6, F + 37, F + 40, { surface: 'steel' });

  // ---------------------------------------------------------------- dropped on the floor
  { // a giant green olive with its red pimento (0.35: it was a meatball)
    food(new THREE.SphereGeometry(1, 32, 20).scale(5.8, 4.2, 4.2), (px, py, pz, c) => mixHex('#6f8f2a', '#9ab83f', 0.5 + py / 8, c), -40, F + 4.2, 72);
    food(new THREE.CylinderGeometry(1.7, 1.7, 0.6, 20).rotateZ(Math.PI / 2), '#d6283a', -40 + 5.6, F + 4.2, 72);
    for (let i = 0; i < 4; i++) { // slices along it, each round in cross-section
      const a = -5.8 + (11.6 * i) / 4, b = -5.8 + (11.6 * (i + 1)) / 4, k = Math.sqrt(1 - (((a + b) / 2) / 5.8) ** 2);
      W._lyingCyl('x', -40 + a, -40 + b, F + 4.2, 72, 4.2 * k, fruit);
    }
  }
  { // a glass of wine knocked over: a slippery red puddle
    food(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2).scale(7.5, 1, 5.5), '#7a0f24', 40, F + 0.08, 76);
    W.slickSpots.push({ x: 40, y: F, z: 76, r: 6 });
    // (0.35) its mouth toward the spill, its stem and foot behind (the stem stuck out of its mouth)
    W._mesh(new THREE.CylinderGeometry(2.6, 1.8, 5, 20, 1, true).rotateZ(-Math.PI / 2), m.glass, 30, F + 2.6, 70, { cast: false });
    W._mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 28).rotateY(Math.PI / 2), m.rim, 32.5, F + 2.6, 70, { cast: false });
    W._mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8).rotateZ(Math.PI / 2), m.glass, 24.5, F + 2.6, 70, { cast: false });
    W._mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 20).rotateZ(Math.PI / 2), m.glass, 21.5, F + 2.6, 70, { cast: false });
    W._mesh(new THREE.CircleGeometry(1.8, 20).rotateY(-Math.PI / 2), m.glass, 27.5, F + 2.6, 70, { cast: false }); // its bottom (it was open)
    W._lyingCyl('x', 27.5, 31.5, F + 2.6, 70, 2, { surface: 'glass' });
    addBox(21.6, 27.5, 69.6, 70.4, F + 2.2, F + 3, { surface: 'glass' });
    addBox(21.3, 21.7, 68.4, 71.6, F + 1, F + 4.2, { surface: 'glass' });
  }
  { // a champagne bottle on its side
    const x = -80, z = -88;
    const glass = new THREE.MeshPhysicalMaterial({ color: '#1f4a2a', roughness: 0.08, clearcoat: 1 });
    W._mesh(new THREE.CylinderGeometry(5, 5, 26, 32).rotateZ(Math.PI / 2), glass, x, F + 5, z);
    W._mesh(new THREE.CylinderGeometry(1.8, 5, 8, 32).rotateZ(-Math.PI / 2), glass, x + 17, F + 5, z);
    W._mesh(new THREE.CylinderGeometry(1.9, 1.9, 6, 20).rotateZ(Math.PI / 2), m.brass, x + 24, F + 5, z);
    W._mesh(new THREE.CylinderGeometry(5.06, 5.06, 10, 32, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: label('CHAMPAGNE', '#f2e6c8', '#8a6a1a'), roughness: 0.6 }), x - 2, F + 5, z, { cast: false });
    W._lyingCyl('x', x - 13, x + 13, F + 5, z, 5, { surface: 'glass' }); // (0.35) round: body, neck, cork
    W._lyingCyl('x', x + 13, x + 16.5, F + 5, z, 4, { surface: 'glass' });
    W._lyingCyl('x', x + 16.5, x + 21, F + 5, z, 2.5, { surface: 'glass' });
    W._lyingCyl('x', x + 21, x + 27, F + 5, z, 1.9, { surface: 'glass' });
  }
  { // a croissant
    const g = new THREE.TorusGeometry(7, 3, 14, 30, Math.PI * 1.15).rotateX(Math.PI / 2).rotateY(-0.4);
    food(lumpy(g, 0.06), (px, py, pz, c) => mixHex('#c9782a', '#f2c46a', 0.5 + Math.sin(Math.atan2(pz, px) * 9) * 0.5, c), 70, F + 3, -92);
    for (const t of [0, Math.PI * 1.15]) { // (0.35) rounded tips (its ends were open: you could see inside it)
      const cx = 7 * Math.cos(t), cz = 7 * Math.sin(t);
      food(new THREE.SphereGeometry(2.6, 16, 12), '#c9782a', 70 + cx * Math.cos(0.4) - cz * Math.sin(0.4), F + 3, -92 + cx * Math.sin(0.4) + cz * Math.cos(0.4), true);
    }
    const arc = []; // (0.35) solid along the crescent (it was a block, empty in its middle)
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI * 1.15, cx = 7 * Math.cos(t), cz = 7 * Math.sin(t);
      arc.push(new THREE.Vector3(70 + cx * Math.cos(0.4) - cz * Math.sin(0.4), F + 3, -92 + cx * Math.sin(0.4) + cz * Math.cos(0.4)));
    }
    for (let i = 0; i < 12; i++) W._rod(arc[i], arc[i + 1], 2.7, 1, { surface: 'bread' });
  }
  { // a mop bucket tipped over, its water across the floor
    W._water(-100, F, 100, 10, 7);
    const yellow = new THREE.MeshPhysicalMaterial({ color: '#f2c21c', roughness: 0.35, clearcoat: 0.5 });
    // (0.35) its mouth toward the spill and its bottom closed (it was the other way round, open at the back);
    // solid and round
    W._mesh(new THREE.CylinderGeometry(8, 6.5, 14, 28, 1, true).rotateZ(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#f2c21c', roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide }), -120, F + 8, 98);
    W._mesh(new THREE.CircleGeometry(6.5, 28).rotateY(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#d9a816', roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide }), -127, F + 8, 98); // (seen from inside and out)
    W._mesh(new THREE.TorusGeometry(8, 0.5, 8, 28).rotateY(Math.PI / 2), yellow, -113, F + 8, 98, { cast: false });
    W._lyingCyl('x', -127, -120, F + 8, 98, 6.8, { surface: 'plastic' });
    W._lyingCyl('x', -120, -114.5, F + 8, 98, 7.6, { surface: 'plastic' });
  }
  { // a fork
    W._box(130, 170, -108, -105, F, F + 1.2, m.steel);
    for (let i = 0; i < 4; i++) W._box(170, 182, -110 + i * 2.2, -109 + i * 2.2, F, F + 1, m.steel);
    addBox(130, 170, -108, -105, F, F + 1.2, { surface: 'steel' }); // (0.35) the handle, then the tines
    for (let i = 0; i < 4; i++) addBox(170, 182, -110 + i * 2.2, -109 + i * 2.2, F, F + 1, { surface: 'steel' });
  }
  { // a dinner roll
    food(lumpy(new THREE.SphereGeometry(4, 22, 14), 0.05).scale(1.4, 0.8, 1), (px, py, pz, c) => mixHex('#d68a3c', '#9a5520', 0.5 + py / 4, c), 100, F + 3, 86, true);
    addBox(95, 105, 83.4, 88.6, F, F + 4.6, { surface: 'bread' }); // (0.35) an oval roll
    addBox(96.7, 103.3, 82.3, 89.7, F, F + 4.6, { surface: 'bread' });
    addBox(96.5, 103.5, 83.5, 88.5, F + 4.6, F + 5.9, { surface: 'bread' });
  }
  { // a napkin dropped by the west wall, and a cork
    W._box(-215, -195, -112, -94, F, F + 1, m.runner);
    addBox(-215, -195, -112, -94, F, F + 1, { surface: 'cardboard' });
    food(new THREE.CylinderGeometry(2.2, 2.6, 4.5, 16).rotateZ(Math.PI / 2), '#c9a06a', 175, F + 2.3, -30, true);
    W._lyingCyl('x', 172.75, 177.25, F + 2.3, -30, 2.4, { surface: 'wood' }); // (0.35) round
  }

  // ---------------------------------------------------------------- pads, the giant tomato, the tide, spawns
  W._pads([ // (each pad sits far enough back for the arc to clear the edge it lands you over)
    [-82, 0, -58, 0, -1], [82, 0, 58, 0, -4], [0, 42, 0, 0, 24], [0, -42, -4, 0, -25], // onto the buffet
    [-150, -130, -150, 0, -153], [-30, -130, -30, 0, -153], [93, -130, 95, 0, -153], // the bar (between the stools)
    [180, -100, 210, 0, -104], [178, 62, 210, 0, 56], // the kitchen pass
    [-135.3, -74.7, -156, -6, -54], [-135.3, 25.3, -156, -6, 46], [100.3, -89.7, 121, -6, -69], [100.3, 10.3, 121, -6, 31], // the round tables (between the chairs)
    [-195, 122, -195, -6, 146], [-125, 122, -125, -6, 146], [-55, 122, -55, -6, 146], // the booth tables
    [150, 100.5, 150, 0, 126], // the piano
  ]);
  W._landmark(-28, 18);
  W._tide();
  const pts = [];
  for (let i = 0; i < 18; i++) pts.push(W.randomOpenSpot('buffet', 3));
  for (let i = 0; i < 8; i++) pts.push(W.randomOpenSpot('bar', 3));
  for (let i = 0; i < 4; i++) pts.push(W.randomOpenSpot('pass', 3));
  for (let i = 0; i < 8; i++) pts.push(W.randomOpenSpot('tables', 3));
  pts.push(new THREE.Vector3(140, 0, 136), new THREE.Vector3(170, 0, 128));
  for (let i = 0; i < 28; i++) pts.push(W.randomOpenSpot('floor', 4));
  W.spawnPoints = pts;
}
