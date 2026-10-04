// The Grand Kitchen at 1:40 scale (GDD 2.2, 9): the island, the back counter with sink,
// stove and fridge, the dining table and the whole floor are playable.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, COUNTER, FLOOR_Y, addBox, addCyl, clearColliders, groundHeight, rand, clamp } from './core.js';
import { Stains } from './stains.js';
import { buildBackyard, BACKYARD_REGIONS } from './map-backyard.js';

// ---------------------------------------------------------------------------
// Procedural textures (no image files).
export function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function butcherBlock(ctx, w, h) {
  const strips = 30;
  const sw = w / strips;
  for (let i = 0; i < strips; i++) {
    const tone = 150 + Math.random() * 45;
    ctx.fillStyle = `rgb(${tone + 40},${tone - 5},${tone - 60})`;
    ctx.fillRect(i * sw, 0, sw + 1, h);
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(90,50,20,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const x = i * sw + Math.random() * sw;
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + g) * 3, y);
      ctx.stroke();
    }
    // end-grain joints along the strip
    for (let j = 0; j < 3; j++) {
      const y = Math.random() * h;
      ctx.fillStyle = 'rgba(60,30,10,0.35)';
      ctx.fillRect(i * sw, y, sw, 2);
    }
    ctx.fillStyle = 'rgba(40,20,5,0.45)';
    ctx.fillRect(i * sw, 0, 2, h);
  }
  // knife marks and wear
  for (let k = 0; k < 160; k++) {
    ctx.strokeStyle = `rgba(255,240,220,${Math.random() * 0.12})`;
    ctx.lineWidth = 1;
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, l = 10 + Math.random() * 40;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
}

function floorTiles(ctx, w, h) {
  const n = 2, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#e9e2d4' : '#2f3a44';
    ctx.fillRect(i * s, j * s, s, s);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = (i + j) % 2 ? 'rgba(120,110,95,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
    }
  }
  ctx.strokeStyle = '#b9ad98'; ctx.lineWidth = 6;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke();
  }
}

function subwayTiles(ctx, w, h) {
  ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, w, h);
  const tw = w / 4, th = h / 8;
  ctx.strokeStyle = '#cfc6b6'; ctx.lineWidth = 3;
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    const x = c * tw + (r % 2 ? tw / 2 : 0);
    ctx.strokeRect(x, r * th, tw, th);
  }
}

function cerealLabel(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffcc2e'); g.addColorStop(1, '#ff8c1a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8331f'; ctx.fillRect(0, h * 0.08, w, h * 0.24);
  ctx.fillStyle = '#fff6e6';
  ctx.font = `900 ${h * 0.14}px "Bagel Fat One", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CRUNCH', w / 2, h * 0.24);
  ctx.fillStyle = '#7a2d0c';
  ctx.font = `900 ${h * 0.09}px "Bagel Fat One", "Arial Black", sans-serif`;
  ctx.fillText("O's", w / 2, h * 0.42);
  // bowl of rings
  for (let i = 0; i < 26; i++) {
    const x = w * 0.2 + Math.random() * w * 0.6, y = h * 0.55 + Math.random() * h * 0.25;
    ctx.strokeStyle = ['#f0a93b', '#e07b24', '#f7c85a'][i % 3];
    ctx.lineWidth = w * 0.025;
    ctx.beginPath(); ctx.arc(x, y, w * 0.04, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#fff6e6';
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.84, w * 0.36, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a2d0c';
  ctx.font = `700 ${h * 0.035}px sans-serif`;
  ctx.fillText('PART OF A BALANCED BREAKFAST', w / 2, h * 0.96);
}

function rugTex(ctx, w, h) {
  ctx.fillStyle = '#b84a3a'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2d7a6'; ctx.lineWidth = w * 0.03;
  ctx.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
  ctx.lineWidth = w * 0.012;
  ctx.strokeRect(w * 0.12, h * 0.12, w * 0.76, h * 0.76);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const x = w * (0.22 + i * 0.112), y = h * (0.26 + j * 0.16);
    ctx.fillStyle = (i + j) % 2 ? '#f2d7a6' : '#3f5f6b';
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.05); ctx.lineTo(x + w * 0.035, y); ctx.lineTo(x, y + h * 0.05); ctx.lineTo(x - w * 0.035, y); ctx.fill();
  }
  for (let k = 0; k < 4000; k++) { // woven fibres
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,210'},0.06)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  }
}

function softSpot(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function shaftTex(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,240,205,0.9)'); g.addColorStop(1, 'rgba(255,240,205,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const s = ctx.createLinearGradient(0, 0, w, 0);
  s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.2, 'rgba(0,0,0,0)'); s.addColorStop(0.8, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
}

export const SOFT_SPOT = () => canvasTex(64, 64, softSpot, { srgb: false });

// Bake a colour (or a colour picked per vertex position) into a geometry for the vertex-coloured
// giant-food materials, so every giant food merges into a couple of draw calls.
const _col = new THREE.Color(), _col2 = new THREE.Color(), _gv = new THREE.Vector3();
export function paint(geo, color) {
  const pos = geo.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
  const fn = typeof color === 'function' ? color : null;
  if (!fn) _col.set(color);
  for (let i = 0; i < n; i++) {
    if (fn) fn(pos.getX(i), pos.getY(i), pos.getZ(i), _col);
    arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
export const mixHex = (a, b, t, out) => out.set(a).lerp(_col2.set(b), clamp(t, 0, 1));
// Deterministic bumpiness from a position (same point, same bump), for lumpy fruit and florets.
const bump = (x, y, z) => Math.sin(x * 3.1 + y * 1.7) * Math.sin(y * 2.3 - z * 2.9) * Math.sin(z * 1.9 + x * 2.2);
export function lumpy(geo, amount) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _gv.fromBufferAttribute(p, i);
    _gv.multiplyScalar(1 + amount * bump(_gv.x, _gv.y, _gv.z));
    p.setXYZ(i, _gv.x, _gv.y, _gv.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// A banana: a tube along a curve, tapered at both ends, yellow with brown tips.
function bananaGeo(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = 36, radial = 14;
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.floor(i / (radial + 1)) / segs;
    const taper = 0.3 + 0.7 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.6;
    const c = curve.getPointAt(Math.min(1, u));
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * taper, c.y + (pos.getY(i) - c.y) * taper, c.z + (pos.getZ(i) - c.z) * taper);
    const ridge = Math.abs(Math.sin((i % (radial + 1)) / radial * Math.PI * 5)) > 0.96;
    if (u < 0.04 || u > 0.95) _col.set('#5a3a1e');
    else mixHex('#ffd93b', '#e9b51c', ridge ? 1 : 0.15 + 0.2 * Math.sin(u * 9), _col);
    cols[i * 3] = _col.r; cols[i * 3 + 1] = _col.g; cols[i * 3 + 2] = _col.b;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// ---------------------------------------------------------------------------
// The playable Grand Kitchen, all at 1:40 scale (GDD 2.2, 9.1). Walkable levels:
//   floor (y -36), island counter and back counter (y 0), dining table (y -6).
export const F = FLOOR_Y;
export const REGIONS = {
  island: { minX: -58, maxX: 58, minZ: -30, maxZ: 30, top: 0, weight: 0.34 },
  floor: { minX: -225, maxX: 225, minZ: -125, maxZ: 155, top: F, weight: 0.36 },
  back: { minX: -190, maxX: 230, minZ: -170, maxZ: -150, top: 0, weight: 0.18 },
  table: { minX: -56, maxX: 56, minZ: 85, maxZ: 125, top: -6, weight: 0.12 },
};

// The maps you can pick. Both share the same frame (floor at FLOOR_Y, the same footprint), so the
// physics, bots, Soap Tide and online clamps work the same on either.
export const MAPS = {
  kitchen: { name: 'The Grand Kitchen', blurb: 'Counters, a sink and stove, a dining table to hide under and a floor the size of a town.' },
  backyard: { name: 'The Backyard BBQ', blurb: 'A picnic table on the lawn, a smoking grill, a cooler, a kiddie pool and a picnic spread under the open sky.' },
};

export class World {
  constructor(scene, renderer, quality, mapId = 'kitchen') {
    // Everything the map builds goes into one group, so a map can be taken down and another built.
    this.real = scene;
    this.scene = new THREE.Group();
    this.scene.name = 'world';
    scene.add(this.scene);
    this.mapId = MAPS[mapId] ? mapId : 'kitchen';
    this.renderer = renderer;
    this.quality = quality;
    clearColliders();
    this.mats = {};
    this.burners = []; this.waters = []; this.honeys = []; this.pads = [];
    this.slickSpots = []; // permanent slippery patches (the egg white), re-stamped by the game
    this.shadowDirty = true;
    if (this.mapId === 'backyard') {
      this.regions = BACKYARD_REGIONS; this.playerRegion = 'table';
      buildBackyard(this);
    } else {
      this.regions = REGIONS; this.playerRegion = 'island';
      this._lights(renderer);
      this._materials();
      this._room();
      this._island();
      this._backCounter();
      this._dining();
      this._obstacles();
      this._giants();
      this._floorClutter();
      this._pads();
      this._landmark();
      this._tide();
      this._atmosphere();
      this._spawns();
    }
    // where a spectator camera may go: inside the walls (or the fence) and under the kitchen ceiling
    this.camBox = this.mapId === 'backyard' ? { minX: -239, maxX: 239, minZ: -175, maxZ: 165, maxY: F + 220 }
      : { minX: -242, maxX: 242, minZ: -175, maxZ: 167, maxY: F + 104 };
    this.drawCallsBefore = this._countMeshes();
    this._mergeStatic();
    // food stains on every surface (built after all colliders exist)
    this.stains = new Stains(this.scene, this.quality, { minX: -245, maxX: 245, minZ: -178, maxZ: 170, floorY: F, wallTop: F + 110 });
  }

  // ------------------------------------------------------------------ lighting and materials
  _lights(renderer) {
    const s = this.scene;
    const R = this.real;
    R.background = new THREE.Color('#e8d6bd');
    R.fog = new THREE.Fog('#e8d6bd', 240, 720);
    const pmrem = new THREE.PMREMGenerator(renderer);
    R.environment?.dispose();
    R.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    R.environmentIntensity = 0.55;
    pmrem.dispose();
    s.add(new THREE.HemisphereLight('#fff3e0', '#6b4a2e', 0.9));
    const sun = new THREE.DirectionalLight('#ffe0b0', 2.6);
    sun.position.set(-110, 190, -120); // pouring in through the window over the sink
    sun.target.position.set(0, -20, 0);
    s.add(sun, sun.target);
    { // shadow settings are always prepared so the graphics setting can switch them live
      sun.castShadow = !!this.quality.shadows;
      sun.shadow.mapSize.set(this.quality.shadows || 2048, this.quality.shadows || 2048);
      const cam = sun.shadow.camera;
      cam.left = -270; cam.right = 270; cam.top = 230; cam.bottom = -230; cam.near = 20; cam.far = 620;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.6;
    }
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#cfe3ff', 0.55);
    fill.position.set(120, 80, 140);
    s.add(fill);
  }

  _materials() {
    const m = this.mats;
    m.wood = new THREE.MeshStandardMaterial({ map: canvasTex(1024, 512, butcherBlock), roughness: 0.62 });
    m.cabinet = new THREE.MeshStandardMaterial({ color: '#7fa39a', roughness: 0.55 });
    m.cabinetDark = new THREE.MeshStandardMaterial({ color: '#5f8279', roughness: 0.6 });
    m.floor = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, floorTiles, { repeat: [45, 40] }), roughness: 0.32 });
    m.wall = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, subwayTiles, { repeat: [16, 5] }), roughness: 0.3 });
    m.steel = new THREE.MeshStandardMaterial({ color: '#d4d8dc', metalness: 0.9, roughness: 0.22 });
    m.chrome = new THREE.MeshStandardMaterial({ color: '#f2f4f6', metalness: 1, roughness: 0.08 });
    m.ceramic = new THREE.MeshPhysicalMaterial({ color: '#f7f5f0', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.mug = new THREE.MeshPhysicalMaterial({ color: '#2f6fb0', roughness: 0.2, clearcoat: 1 });
    m.glass = new THREE.MeshPhysicalMaterial({ color: '#e6f6ff', roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false });
    m.jam = new THREE.MeshPhysicalMaterial({ color: '#8e0f2c', roughness: 0.2, clearcoat: 1, sheen: 0.4 });
    m.dark = new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.6 });
    m.ceiling = new THREE.MeshStandardMaterial({ color: '#f4ede2', roughness: 0.9 });
    m.lamp = new THREE.MeshBasicMaterial({ color: '#fff7e0' });
    m.walnut = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.45 });
    m.walnutTop = new THREE.MeshPhysicalMaterial({ color: '#8a5530', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    m.water = new THREE.MeshPhysicalMaterial({ color: '#b9e2ff', roughness: 0.03, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false });
    m.white = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.5 });
  }

  // Every scenery mesh goes through here. Static ones are merged later to cut draw calls.
  _mesh(geo, mat, x, y, z, { cast = true, receive = true, dyn = false } = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;       // only matters while the renderer's shadows are on
    mesh.receiveShadow = receive;
    mesh.userData.world = true;
    mesh.userData.dyn = dyn;
    this.scene.add(mesh);
    return mesh;
  }
  _box(minX, maxX, minZ, maxZ, bottom, top, mat, opts) {
    return this._mesh(new THREE.BoxGeometry(maxX - minX, top - bottom, maxZ - minZ), mat, (minX + maxX) / 2, (bottom + top) / 2, (minZ + maxZ) / 2, opts);
  }

  // ------------------------------------------------------------------ the room
  _room() {
    const m = this.mats;
    this._mesh(new THREE.PlaneGeometry(520, 380).rotateX(-Math.PI / 2), m.floor, 0, F, -5, { cast: false });
    this._mesh(new THREE.PlaneGeometry(520, 120), m.wall, 0, F + 60, -178, { cast: false });
    this._mesh(new THREE.PlaneGeometry(520, 120).rotateY(Math.PI), m.wall, 0, F + 60, 170, { cast: false });
    this._mesh(new THREE.PlaneGeometry(360, 120).rotateY(Math.PI / 2), m.wall, -245, F + 60, -4, { cast: false });
    this._mesh(new THREE.PlaneGeometry(360, 120).rotateY(-Math.PI / 2), m.wall, 245, F + 60, -4, { cast: false });
    this._mesh(new THREE.PlaneGeometry(520, 380).rotateX(Math.PI / 2), m.ceiling, 0, F + 110, -5, { cast: false });
    // skirting boards
    this._box(-245, 245, 167, 170, F, F + 4, m.cabinetDark, { cast: false });
    this._box(-245, -242, -178, 170, F, F + 4, m.cabinetDark, { cast: false });
    this._box(242, 245, -178, 170, F, F + 4, m.cabinetDark, { cast: false });
    // window over the sink, with daylight
    const win = this._mesh(new THREE.PlaneGeometry(76, 44), new THREE.MeshBasicMaterial({ color: '#fffaf0' }), -100, 34, -177.5, { cast: false, receive: false });
    win.material.fog = false;
    this._box(-101.5, -98.5, -178, -176, 12, 56, m.ceramic, { cast: false });
    this._box(-140, -60, -178, -174, 10, 12, m.ceramic, { cast: false });
    for (const [x, z] of [[-150, -60], [0, -60], [150, -60], [-150, 90], [0, 90], [150, 90]]) {
      this._mesh(new THREE.CylinderGeometry(8, 8, 1, 24), m.lamp, x, F + 109, z, { cast: false, receive: false });
    }
    // pot rack hanging over the island (GDD "Skyhooks")
    this._box(-65, 65, -0.75, 0.75, 67.25, 68.75, m.steel, { cast: false });
    for (const x of [-55, 55]) this._mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), m.steel, x, 71, 0, { cast: false });
    for (const [x, r, drop] of [[-40, 10, 6], [-12, 8, 4], [16, 12, 7], [44, 7, 3]]) {
      this._mesh(new THREE.CylinderGeometry(0.2, 0.2, drop, 6), m.steel, x, 68 - drop / 2, 0, { cast: false });
      this._mesh(new THREE.CylinderGeometry(r, r * 0.9, r * 0.9, 32, 1, true), m.chrome, x, 68 - drop - r * 0.45, 0);
    }
  }

  // ------------------------------------------------------------------ the island (original arena)
  _island() {
    const { minX, maxX, minZ, maxZ } = COUNTER;
    const w = maxX - minX, d = maxZ - minZ, h = -F;
    const m = this.mats;
    this._mesh(new THREE.BoxGeometry(w - 4, h - 2, d - 4), m.cabinet, 0, F + (h - 2) / 2, 0);
    this._mesh(new THREE.BoxGeometry(w, 2.2, d), m.wood, 0, -1.1, 0);
    for (let x = minX + 10; x < maxX; x += 20) {
      for (const z of [maxZ - 1.9, minZ + 1.9]) {
        this._mesh(new THREE.BoxGeometry(17, 26, 0.6), m.cabinetDark, x, F + 17, z, { cast: false });
        this._mesh(new THREE.BoxGeometry(1, 7, 1), m.chrome, x + 6, F + 22, z + Math.sign(z) * 0.6, { cast: false });
      }
    }
    for (let z = minZ + 12; z < maxZ; z += 20) {
      for (const x of [maxX - 1.9, minX + 1.9]) this._mesh(new THREE.BoxGeometry(0.6, 26, 17), m.cabinetDark, x, F + 17, z, { cast: false });
    }
    this._mesh(new THREE.BoxGeometry(w - 5, 3, d - 5), m.dark, 0, F + 1.5, 0, { cast: false });
    addBox(minX, maxX, minZ, maxZ, F, 0, { surface: 'wood', counter: true });


    // props (same layout as the first prototype)
    const shadowy = {};
    const labelTex = canvasTex(512, 768, cerealLabel);
    const cardboard = new THREE.MeshStandardMaterial({ color: '#e9a23b', roughness: 0.8 });
    const label = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55 });
    this.mats.cardboard = cardboard; this.mats.label = label;
    this._mesh(new THREE.BoxGeometry(10, 16, 4), [cardboard, cardboard, cardboard, cardboard, label, label], -29, 8, -22, shadowy);
    addBox(-34, -24, -24, -20, 0, 16, { surface: 'cardboard' });
    this._mesh(new THREE.BoxGeometry(4, 16, 10), [label, label, cardboard, cardboard, cardboard, cardboard], 42, 8, 15, shadowy);
    addBox(40, 44, 10, 20, 0, 16, { surface: 'cardboard' });
    this._mesh(new THREE.CylinderGeometry(3.7, 3.7, 8.4, 40), m.jam, -6, 4.2, 22, shadowy);
    this._mesh(new THREE.CylinderGeometry(4, 4, 10, 40, 1, true), m.glass, -6, 5, 22, { cast: false });
    const lid = new THREE.MeshStandardMaterial({ color: '#d9c27a', metalness: 0.8, roughness: 0.3 });
    this._mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.6, 40), lid, -6, 10.4, 22, shadowy);
    addCyl(-6, 22, 4, 0, 11, { surface: 'glass' });
    this._mesh(new THREE.CylinderGeometry(4.2, 3.9, 9, 40), m.mug, 14, 4.5, -16, shadowy);
    this._mesh(new THREE.TorusGeometry(2.4, 0.6, 12, 24).rotateY(Math.PI / 2), m.mug, 18.5, 4.8, -16, shadowy);
    addCyl(14, -16, 4.2, 0, 9, { surface: 'ceramic' });
    const boardMat = new THREE.MeshStandardMaterial({ color: '#c98f55', roughness: 0.55 });
    this._mesh(new THREE.BoxGeometry(24, 1, 14), boardMat, 0, 0.5, -1, shadowy);
    this._mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.1, 20), m.dark, 10, 0.55, -1, { cast: false });
    addBox(-12, 12, -8, 6, 0, 1, { surface: 'wood' });
    this._mesh(new THREE.CylinderGeometry(8, 7, 0.55, 48), m.ceramic, 30, 0.275, 0, shadowy);
    addCyl(30, 0, 8, 0, 0.55, { surface: 'ceramic' });
    this._mesh(new THREE.BoxGeometry(12, 9, 8), m.chrome, 32, 4.5, -26, shadowy);
    this._mesh(new THREE.BoxGeometry(8, 0.3, 1.2), m.dark, 32, 9.05, -27.6, { cast: false });
    this._mesh(new THREE.BoxGeometry(8, 0.3, 1.2), m.dark, 32, 9.05, -24.4, { cast: false });
    this._mesh(new THREE.BoxGeometry(1, 2.4, 1.4), m.dark, 38.4, 6, -26, { cast: false });
    addBox(26, 38, -30, -22, 0, 9, { surface: 'steel' });
    const salt = new THREE.MeshPhysicalMaterial({ color: '#fbfbfb', roughness: 0.2, clearcoat: 1 });
    const pepper = new THREE.MeshPhysicalMaterial({ color: '#3a3533', roughness: 0.25, clearcoat: 1 });
    for (const [x, z, mat] of [[-50, -18, salt], [-45, -23, pepper]]) {
      this._mesh(new THREE.CylinderGeometry(1.7, 1.9, 6, 24), mat, x, 3, z, shadowy);
      this._mesh(new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.chrome, x, 6, z, shadowy);
      addCyl(x, z, 1.9, 0, 7.5, { surface: 'ceramic' });
    }
    this._burner(-44, 0, 14, 7, true);
    this._water(47, 0, -10, 9, 6.5);
    this._honey(22, 0, 22, 3.2);
  }

  // ------------------------------------------------------------------ back counter: sink, stove, fridge
  _backCounter() {
    const m = this.mats;
    const minX = -200, maxX = 240, minZ = -178, maxZ = -146;
    this._box(minX, maxX, minZ + 2, maxZ - 2, F, -2, m.cabinet);
    this._mesh(new THREE.BoxGeometry(maxX - minX, 2, maxZ - minZ), m.wood, (minX + maxX) / 2, -1, (minZ + maxZ) / 2);
    for (let x = minX + 11; x < maxX - 5; x += 22) {
      this._box(x - 9.5, x + 9.5, maxZ - 2, maxZ - 1.4, F + 4, F + 30, m.cabinetDark, { cast: false });
      this._box(x + 5, x + 6, maxZ - 1.4, maxZ - 0.8, F + 20, F + 27, m.chrome, { cast: false });
    }
    this._box(minX, maxX, minZ + 4, maxZ - 5, F, F + 3, m.dark, { cast: false });
    addBox(minX, maxX, minZ, maxZ, F, 0, { surface: 'wood', counter: true });
    // backsplash and upper cabinets (overhead, out of reach)
    for (let x = minX + 20; x < maxX; x += 40) {
      if (x > -130 && x < -70) continue; // leave the window clear
      this._box(x - 19, x + 19, -178, -164, 22, 54, m.cabinetDark, { cast: false });
      this._box(x + 13, x + 15, -164, -163, 25, 33, m.chrome, { cast: false });
    }
    // fridge tower
    this._box(-242, -200, -178, -138, F, F + 78, m.steel);
    this._box(-203, -201, -140, -137, F + 34, F + 70, m.chrome, { cast: false });
    this._box(-241, -201, -137.5, -137, F + 44, F + 45, m.dark, { cast: false });
    addBox(-242, -200, -178, -138, F, F + 78, { surface: 'steel' });
    // sink with a faucet (the basin is filled with water: makes you Wet)
    this._box(-120, -80, -172, -150, -0.2, 0.3, m.steel, { cast: false });
    this._water(-100, 0.35, -161, 17, 9);
    this._mesh(new THREE.CylinderGeometry(1.6, 2, 16, 16), m.chrome, -100, 8, -174);
    this._mesh(new THREE.TorusGeometry(5, 1.1, 10, 20, Math.PI).rotateY(Math.PI / 2), m.chrome, -100, 16, -169);
    addCyl(-100, -174, 2, 0, 18, { surface: 'steel' });
    // stove: two burners that cycle, a big stock pot and a range hood
    this._box(58, 132, -176, -148, 0, 0.6, m.dark, { cast: false });
    this._burner(78, 0.6, -162, 7, false);
    this._burner(112, 0.6, -162, 7, false);
    this._box(60, 130, -178, -150, 40, 52, m.steel, { cast: false });
    this._mesh(new THREE.CylinderGeometry(12, 11, 16, 36), m.steel, 170, 8, -162);
    this._mesh(new THREE.TorusGeometry(12, 0.8, 8, 36).rotateX(Math.PI / 2), m.chrome, 170, 16, -162, { cast: false });
    addCyl(170, -162, 12, 0, 16, { surface: 'steel' });
    // coffee maker (tall cover)
    this._box(-178, -152, -176, -160, 0, 26, m.dark);
    this._mesh(new THREE.CylinderGeometry(6, 6.5, 10, 24), m.glass, -165, 6, -158, { cast: false });
    addBox(-178, -152, -176, -156, 0, 26, { surface: 'steel' });
    this._honey(20, 0, -160, 3.2);
  }

  // ------------------------------------------------------------------ dining area
  _dining() {
    const m = this.mats;
    const tTop = -6, tBot = -8.5;
    // rug under the table
    this._mesh(new THREE.PlaneGeometry(190, 110).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 300, rugTex), roughness: 0.95 }), 0, F + 0.06, 105, { cast: false });
    this._box(-62, 62, 80, 130, tBot, tTop, m.walnutTop);
    addBox(-62, 62, 80, 130, tBot, tTop, { surface: 'wood' });
    for (const [x, z] of [[-56, 85], [56, 85], [-56, 125], [56, 125]]) {
      this._mesh(new THREE.CylinderGeometry(2, 2.6, tBot - F, 16), m.walnut, x, (F + tBot) / 2, z);
      addCyl(x, z, 2.6, F, tBot, { surface: 'wood' });
    }
    // chairs: you can walk under them and use the seats as cover
    for (const [x, z, s] of [[-32, 70, -1], [32, 70, -1], [-32, 140, 1], [32, 140, 1]]) {
      const seatTop = F + 17.5;
      this._box(x - 9, x + 9, z - 8, z + 8, seatTop - 2, seatTop, m.walnut);
      addBox(x - 9, x + 9, z - 8, z + 8, seatTop - 2, seatTop, { surface: 'wood' });
      for (const [lx, lz] of [[-7.5, -6.5], [7.5, -6.5], [-7.5, 6.5], [7.5, 6.5]]) {
        this._mesh(new THREE.CylinderGeometry(0.9, 1, 17.5, 10), m.walnut, x + lx, F + 8.75, z + lz);
        addCyl(x + lx, z + lz, 1, F, seatTop - 2, { surface: 'wood' });
      }
      const bz = z + s * 7.5;
      this._box(x - 9, x + 9, bz - 1, bz + 1, seatTop, seatTop + 20, m.walnut);
      addBox(x - 9, x + 9, bz - 1, bz + 1, seatTop, seatTop + 20, { surface: 'wood' });
    }
    // on the table: plates, glasses, a fruit bowl
    for (const [x, z] of [[-32, 94], [32, 94], [-32, 118], [32, 118]]) {
      this._mesh(new THREE.CylinderGeometry(7, 6.2, 0.5, 40), m.ceramic, x, tTop + 0.25, z);
      addCyl(x, z, 7, tTop, tTop + 0.5, { surface: 'ceramic' });
    }
    for (const [x, z] of [[-14, 90], [16, 124]]) {
      this._mesh(new THREE.CylinderGeometry(2.8, 2.4, 11, 24, 1, true), m.glass, x, tTop + 5.5, z, { cast: false });
      this._mesh(new THREE.CylinderGeometry(2.3, 2.3, 5, 24), new THREE.MeshPhysicalMaterial({ color: '#ff9a3c', roughness: 0.1, transmission: 0, clearcoat: 1 }), x, tTop + 2.6, z);
      addCyl(x, z, 2.8, tTop, tTop + 11, { surface: 'glass' });
    }
    this._mesh(new THREE.SphereGeometry(8, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.ceramic, 0, tTop + 5, 106);
    addCyl(0, 106, 7.5, tTop, tTop + 5, { surface: 'ceramic' });
    this._honey(46, tTop, 106, 3);
  }

  // ------------------------------------------------------------------ obstacles (0.4): cover and things to climb
  // With the double jump a Titan reaches about 9.5 m, so sugar cubes, plates and the colander are climbable.
  _obstacles() {
    const m = this.mats;
    const canLabel = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = '#c8332a'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f6e7c8'; x.fillRect(0, h * 0.28, w, h * 0.44);
      x.fillStyle = '#7a1d15'; x.font = `900 ${h * 0.3}px "Bagel Fat One", "Arial Black", sans-serif`; x.textAlign = 'center';
      for (let i = 0; i < 2; i++) x.fillText('BEANS', w * (0.25 + i * 0.5), h * 0.62);
    });
    const canMat = new THREE.MeshStandardMaterial({ map: canLabel, metalness: 0.5, roughness: 0.35 });
    const tin = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.9, roughness: 0.25 });
    const standingCan = (x, z) => {
      this._mesh(new THREE.CylinderGeometry(6, 6, 15, 36, 1, true), canMat, x, F + 8, z);
      this._mesh(new THREE.CylinderGeometry(6.1, 6.1, 0.6, 36), tin, x, F + 15.7, z);
      this._mesh(new THREE.TorusGeometry(5.6, 0.35, 8, 36).rotateX(Math.PI / 2), tin, x, F + 16, z, { cast: false });
      addCyl(x, z, 6, F, F + 16, { surface: 'steel' });
    };
    standingCan(-120, -60);
    standingCan(170, 90);
    // a can lying on its side
    this._mesh(new THREE.CylinderGeometry(6, 6, 16, 36, 1, true).rotateZ(Math.PI / 2), canMat, 110, F + 6, -80);
    for (const ex of [102, 118]) this._mesh(new THREE.CylinderGeometry(6, 6, 0.4, 36).rotateZ(Math.PI / 2), tin, ex, F + 6, -80);
    addBox(102, 118, -86, -74, F, F + 12, { surface: 'steel' });

    // rolling pin (low wall you can hop onto)
    const pinWood = new THREE.MeshStandardMaterial({ color: '#e0b27a', roughness: 0.55 });
    this._mesh(new THREE.CylinderGeometry(2.6, 2.6, 40, 24).rotateX(Math.PI / 2), pinWood, -150, F + 2.6, 120);
    for (const hz of [95, 145]) this._mesh(new THREE.CylinderGeometry(1.1, 1.3, 10, 16).rotateX(Math.PI / 2), m.walnut, -150, F + 2.6, hz);
    addBox(-152.6, -147.4, 92, 148, F, F + 5.2, { surface: 'wood' });

    // colander dome
    const colander = new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
    this._mesh(new THREE.SphereGeometry(10, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), colander, 180, F, -40);
    this._mesh(new THREE.TorusGeometry(10.2, 0.6, 8, 40).rotateX(Math.PI / 2), tin, 180, F + 0.5, -40, { cast: false });
    addCyl(180, -40, 9.6, F, F + 9, { surface: 'steel' });

    // sugar cubes: stacked steps
    const sugar = new THREE.MeshStandardMaterial({ color: '#fbfaf4', roughness: 0.95 });
    const cube = (x, z, s, level = 0) => {
      const y0 = F + level * s;
      this._box(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y0, y0 + s, sugar);
      addBox(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y0, y0 + s, { surface: 'sugar' });
    };
    cube(-100, -30, 4.5); cube(-100, -30, 4.5, 1); cube(-94, -24, 4.5); cube(-104.5, -20.5, 4.5);
    cube(100, -20, 4.5); cube(100, -20, 4.5, 1); cube(106, -14, 4.5);
    cube(30, 150, 4.5); cube(36, 146, 4.5);

    // a stack of plates
    for (let i = 0; i < 6; i++) this._mesh(new THREE.CylinderGeometry(9 - (i % 2) * 0.3, 8.4, 0.9, 40), m.ceramic, -190, F + 0.45 + i * 0.92, 20);
    addCyl(-190, 20, 9, F, F + 5.5, { surface: 'ceramic' });

    // milk carton (tall cover)
    const milkLabel = canvasTex(256, 512, (x, w, h) => {
      x.fillStyle = '#f7f7f2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2d6fb7'; x.fillRect(0, h * 0.55, w, h * 0.45);
      x.fillStyle = '#2d6fb7'; x.font = `900 ${w * 0.3}px "Bagel Fat One", "Arial Black", sans-serif`; x.textAlign = 'center';
      x.fillText('MILK', w / 2, h * 0.42);
      x.fillStyle = '#f7f7f2'; x.beginPath(); x.arc(w / 2, h * 0.75, w * 0.18, 0, Math.PI * 2); x.fill();
    });
    const milkMat = new THREE.MeshStandardMaterial({ map: milkLabel, roughness: 0.6 });
    this._mesh(new THREE.BoxGeometry(12, 22, 12), milkMat, 200, F + 11, 140);
    this._mesh(new THREE.CylinderGeometry(0.01, 8.5, 5, 4, 1).rotateY(Math.PI / 4), milkMat, 200, F + 24.5, 140);
    addBox(194, 206, 134, 146, F, F + 26, { surface: 'cardboard' });

    // lemons
    const lemon = new THREE.MeshPhysicalMaterial({ color: '#f7d63a', roughness: 0.45, clearcoat: 0.5 });
    for (const [x, z, a] of [[-75, 60, 0.4], [150, -10, 1.2]]) {
      const l = this._mesh(new THREE.SphereGeometry(3.5, 28, 18).scale(1.3, 1, 1), lemon, x, F + 3.4, z);
      l.rotation.y = a;
      addCyl(x, z, 3.8, F, F + 6.8, { surface: 'fruit' });
    }

    // island: a stick of butter and a sugar cube
    const butter = new THREE.MeshStandardMaterial({ color: '#fbe8a0', roughness: 0.35 });
    this._box(-40, -33, 5, 8, 0, 2.5, butter);
    addBox(-40, -33, 5, 8, 0, 2.5, { surface: 'butter' });
    this._box(50.5, 53.5, 2.5, 5.5, 0, 3, sugar);
    addBox(50.5, 53.5, 2.5, 5.5, 0, 3, { surface: 'sugar' });

    // back counter: a stack of bowls and a row of spice jars
    const bowl = new THREE.MeshPhysicalMaterial({ color: '#e98c5a', roughness: 0.25, clearcoat: 1 });
    for (let i = 0; i < 3; i++) this._mesh(new THREE.CylinderGeometry(7 - i * 0.2, 4.5, 2.4, 36), bowl, -15, 1.2 + i * 1.6, -163);
    addCyl(-15, -163, 7, 0, 5.5, { surface: 'ceramic' });
    const spices = ['#b5471b', '#d9a21b', '#6b8e23', '#7a3b1b', '#c2410c'];
    const spiceIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 1.6, 5.2, 20), new THREE.MeshStandardMaterial({ roughness: 0.9 }), spices.length);
    this.scene.add(spiceIM); // one draw call, a colour per jar
    spices.forEach((col, i) => {
      const x = 190 + i * 8;
      spiceIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.6, -171));
      spiceIM.setColorAt(i, new THREE.Color(col));
      this._mesh(new THREE.CylinderGeometry(1.8, 1.8, 6, 20, 1, true), m.glass, x, 3, -171, { cast: false });
      this._mesh(new THREE.CylinderGeometry(1.9, 1.9, 1.2, 20), tin, x, 6.6, -171);
      addCyl(x, -171, 1.9, 0, 7.2, { surface: 'glass' });
    });

    // table: a pepper mill and a napkin holder
    this._mesh(new THREE.CylinderGeometry(1.6, 2, 9, 20), m.walnut, -8, -6 + 4.5, 124);
    this._mesh(new THREE.SphereGeometry(1.5, 16, 10), m.chrome, -8, -6 + 9.6, 124);
    addCyl(-8, 124, 2, -6, 4.5, { surface: 'wood' });
    this._box(7, 13, 91, 93, -6, 1, m.chrome);
    this._box(7.6, 12.4, 91.3, 92.7, -6, 2, m.white);
    addBox(7, 13, 91, 93, -6, 1, { surface: 'steel' });
  }

  // ------------------------------------------------------------------ giant foods and knocked-over chairs (0.16)
  // More cover and more to climb, all over the kitchen. Giant foods are vertex-coloured with two
  // shared materials, so all of them together cost two draw calls.
  _giants() {
    const m = this.mats;
    m.food = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3 });
    m.foodMatte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    m.lidGold = new THREE.MeshStandardMaterial({ color: '#d9b34a', metalness: 0.85, roughness: 0.3 });
    const food = (geo, color, x, y, z, matte = false) => this._mesh(paint(geo, color), matte ? m.foodMatte : m.food, x, y, z);
    const fruit = { surface: 'fruit' };

    // --- floor: a bitten apple that rolled away
    {
      const x = 62, z = -88, R = 4.5;
      const prof = [[0, -0.84], [0.28, -0.88], [0.62, -0.8], [0.9, -0.46], [1, -0.02], [0.96, 0.4], [0.8, 0.74], [0.5, 0.92], [0.22, 0.86], [0.06, 0.74], [0, 0.72]]
        .map(([r, y]) => new THREE.Vector2(r * R, y * R));
      const cy = F + 0.86 * R;
      food(new THREE.LatheGeometry(prof, 40), (px, py, pz, c) => {
        mixHex('#b51c17', '#e2483a', (0.5 + 0.5 * Math.sin(Math.atan2(pz, px) * 11 + py * 0.9)) * 0.6, c);
        if (py > 0.55 * R) c.lerp(_col2.set('#e7b23c'), (py / R - 0.55) * 1.2); // yellow shoulder round the stem
      }, x, cy, z);
      food(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 8).rotateZ(0.25), '#5a3a1e', x + 0.2, cy + R * 0.86, z, true);
      food(new THREE.SphereGeometry(1, 12, 8).scale(1.4, 0.12, 0.6).rotateZ(-0.35).rotateY(0.6), '#4f9a3a', x + 1.2, cy + R * 0.95, z + 0.6, true);
      food(new THREE.CircleGeometry(R * 0.5, 24).rotateY(Math.PI / 2), '#f6eccb', x + R * 0.9, cy + R * 0.05, z, true); // the bite
      addCyl(x, z, R * 0.93, F, cy + R * 0.9, fruit);
    }

    // --- floor: a whole watermelon on its side
    {
      const x = -185, z = -80;
      food(new THREE.SphereGeometry(1, 48, 32).scale(11, 7.4, 7.6), (px, py, pz, c) => {
        const s = Math.sin(Math.atan2(pz, py) * 8 + Math.sin(px * 0.35) * 0.8);
        mixHex('#4c9a3e', '#1f5a24', s > 0.25 ? 1 : s > -0.1 ? 0.5 : 0, c);
        if (py < -5.8) c.lerp(_col2.set('#d9d27a'), 0.6); // the pale spot it grew on
      }, x, F + 7.1, z);
      addCyl(x, z, 7.4, F, F + 14.4, fruit);
      addCyl(x - 6.5, z, 5.6, F, F + 12.2, fruit);
      addCyl(x + 6.5, z, 5.6, F, F + 12.2, fruit);
    }

    // --- floor: a broccoli tree you can hide under
    {
      const x = -30, z = -92;
      food(new THREE.CylinderGeometry(2.2, 3.2, 10, 16), (px, py, pz, c) => mixHex('#a7cf6a', '#7fae4a', (py + 5) / 10, c), x, F + 5, z);
      for (let i = 0; i < 5; i++) {
        const g = new THREE.CylinderGeometry(0.8, 1.3, 7, 10).translate(0, 3.5, 0).rotateZ(0.8).rotateY((i / 5) * Math.PI * 2);
        food(g, '#8fbf5a', x, F + 8.5, z);
      }
      const florets = [[0, 1.4, 0, 4.4]];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; florets.push([Math.cos(a) * 4.4, 0.4, Math.sin(a) * 4.4, 3.4]); }
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; florets.push([Math.cos(a) * 7.4, -1.8, Math.sin(a) * 7.4, 2.8]); }
      for (const [ox, oy, oz, s] of florets) {
        food(lumpy(new THREE.IcosahedronGeometry(s, 2), 0.12), (px, py, pz, c) => mixHex('#2f7a2a', '#5aa83e', 0.5 + bump(px + ox, py, pz + oz) * 1.4, c), x + ox, F + 13 + oy, z + oz, true);
      }
      addCyl(x, z, 3.2, F, F + 10, fruit);
      addCyl(x, z, 9.2, F + 9.4, F + 16.6, fruit);
    }

    // --- floor: a dropped donut (stand in the hole)
    {
      const x = 172, z = 122, R = 5.5, r = 2.3;
      food(new THREE.TorusGeometry(R, r, 18, 44).rotateX(Math.PI / 2), (px, py, pz, c) => {
        if (py > 0.35 + 0.25 * Math.sin(Math.atan2(pz, px) * 7)) c.set('#ff7eb6'); // icing with a wavy edge
        else mixHex('#e0a45e', '#b8743a', -py / r, c);
      }, x, F + r, z);
      const sprinkle = ['#fff6e6', '#5fd3ff', '#ffd23a', '#7ae05a', '#b98cff'];
      for (let i = 0; i < 50; i++) {
        const a = (i / 50) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3, off = Math.sin(i * 3.7) * r * 0.55;
        const h = Math.sqrt(Math.max(0, r * r - off * off));
        const g = new THREE.CapsuleGeometry(0.14, 0.75, 2, 6).rotateZ(Math.PI / 2).rotateY(i * 1.3);
        food(g, sprinkle[i % sprinkle.length], x + Math.cos(a) * (R + off), F + r + h + 0.05, z + Math.sin(a) * (R + off), true);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        addCyl(x + Math.cos(a) * R, z + Math.sin(a) * R, r * 0.95, F, F + r * 2 - 0.1, fruit);
      }
    }

    // --- floor: a carrot lying along the back of the room
    {
      const x = 65, z = -118, L = 38, R = 3.3;
      const cone = new THREE.ConeGeometry(R, L, 28, 10).rotateZ(-Math.PI / 2).rotateZ(-0.085); // tip toward +x, resting on the floor
      food(cone, (px, py, pz, c) => mixHex('#f2761a', '#d0590c', (0.5 + 0.5 * Math.sin(px * 1.7)) * 0.55, c), x, F + R, z);
      for (let i = 0; i < 6; i++) {
        const g = new THREE.ConeGeometry(0.9, 9, 6).translate(0, 4.5, 0).rotateZ(Math.PI / 2 + Math.sin(i * 2.1) * 0.4).rotateY(Math.sin(i * 1.3) * 0.5);
        food(g, '#3f8f2f', x - L / 2, F + R + 1.4, z + Math.sin(i * 4.1) * 1.2, true);
      }
      addBox(x - 19, x - 6.3, z - 3.2, z + 3.2, F, F + 6.4, fruit);
      addBox(x - 6.3, x + 6.3, z - 2.4, z + 2.4, F, F + 4.6, fruit);
      addBox(x + 6.3, x + 18, z - 1.4, z + 1.4, F, F + 2.6, fruit);
    }

    // --- floor: a giant banana curled on its side
    {
      const pts = [[-135, -114], [-126, -104], [-116, -100.5], [-106, -103.5], [-99, -112]].map(([px, pz]) => new THREE.Vector3(px, 0, pz));
      this._mesh(bananaGeo(pts, 2.7), m.food, 0, F + 2.5, 0);
      addBox(-137, -123, -118, -103, F, F + 4.8, fruit);
      addBox(-124, -108, -106, -97, F, F + 5.2, fruit);
      addBox(-109, -96, -116, -99, F, F + 4.8, fruit);
    }

    // --- floor: a red pepper and an orange
    {
      const x = 205, z = -100;
      const pep = new THREE.SphereGeometry(4.4, 32, 24), p = pep.attributes.position;
      for (let i = 0; i < p.count; i++) {
        _gv.fromBufferAttribute(p, i);
        const lobe = 1 + 0.1 * Math.cos(Math.atan2(_gv.z, _gv.x) * 4);
        if (_gv.y > 2.8) _gv.y -= (_gv.y - 2.8) * 0.6; // dimple round the stem
        p.setXYZ(i, _gv.x * lobe, _gv.y * 1.12, _gv.z * lobe);
      }
      pep.computeVertexNormals();
      food(pep, (px, py, pz, c) => mixHex('#b80f0a', '#ec3a24', 0.5 + 0.5 * Math.cos(Math.atan2(pz, px) * 4), c), x, F + 4.6, z);
      food(new THREE.CylinderGeometry(0.55, 0.9, 2.6, 10).rotateZ(0.3), '#3f8f2f', x + 0.3, F + 9.5, z, true);
      food(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), '#4f9a3a', x, F + 8.4, z, true);
      addCyl(x, z, 4.6, F, F + 9.4, fruit);
    }
    {
      const x = 205, z = 32;
      food(lumpy(new THREE.IcosahedronGeometry(4, 4), 0.012), (px, py, pz, c) => mixHex('#ff8c1a', '#f07510', 0.5 + bump(px * 3, py * 3, pz * 3), c), x, F + 3.9, z);
      food(new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2), '#b86f1a', x, F + 7.92, z, true); // the navel
      addCyl(x, z, 3.9, F, F + 7.9, fruit);
    }

    // --- floor: a block of Swiss cheese
    {
      const x = -205, z = 118, w = 14, h = 9, d = 11;
      food(new THREE.BoxGeometry(w, h, d), '#ffcc3a', x, F + h / 2, z, true);
      const hole = (r, px, py, pz, rot) => {
        const g = new THREE.CircleGeometry(r, 18);
        if (rot === 'x') g.rotateY(Math.PI / 2);
        if (rot === 'y') g.rotateX(-Math.PI / 2);
        food(g, '#d99a14', px, py, pz, true);
      };
      for (const [r, oy, oz] of [[1.6, 2, -2], [1.1, -2.2, 2.6], [0.8, 1.4, 3.6], [1.3, -1.2, -3.4]]) hole(r, x + w / 2 + 0.03, F + h / 2 + oy, z + oz, 'x');
      for (const [r, ox, oy] of [[1.4, -3, 1.6], [1, 3.4, -1.8], [0.7, 5, 2.4]]) { hole(r, x + ox, F + h / 2 + oy, z + d / 2 + 0.03, 'z'); hole(r * 0.9, x - ox, F + h / 2 - oy, z - d / 2 - 0.03, 'z'); }
      for (const [r, ox, oz] of [[1.2, -3.5, -2], [0.9, 2.5, 2.4], [0.6, 4.8, -3.6]]) hole(r, x + ox, F + h + 0.03, z + oz, 'y');
      addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, F, F + h, { surface: 'cheese' });
    }

    // --- floor: a cracked egg, its slippery white spilling out
    {
      const x = 32, z = -98;
      food(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(6.5, 1, 5), '#f7f3e8', x, F + 0.09, z);
      this.slickSpots.push({ x, y: F, z, r: 5.2 });
      food(new THREE.SphereGeometry(2.5, 28, 16).scale(1, 0.5, 1), (px, py, pz, c) => mixHex('#ff9f12', '#ffd23a', py / 1.25 + 0.4, c), x + 1, F + 0.7, z + 0.5);
      addCyl(x + 1, z + 0.5, 2.4, F, F + 1.3, fruit);
      // two half shells: a thick lathe profile with a jagged rim
      const R = 3.2, H = 4.2, t = 0.28, prof = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; prof.push(new THREE.Vector2(R * Math.sin(a), -H * Math.cos(a))); }
      for (let i = 10; i >= 0; i--) { const a = (i / 10) * Math.PI / 2; prof.push(new THREE.Vector2((R - t) * Math.sin(a), -(H - t) * Math.cos(a))); }
      const shell = () => {
        const g = new THREE.LatheGeometry(prof, 36), q = g.attributes.position;
        for (let i = 0; i < q.count; i++) if (q.getY(i) > -0.05) q.setY(i, 0.55 * Math.sin(Math.atan2(q.getZ(i), q.getX(i)) * 9) ** 2);
        g.computeVertexNormals();
        return g;
      };
      food(shell(), '#f5efe2', x - 7, F + H, z + 2);                                 // a cup, open side up
      food(shell().rotateX(Math.PI), '#f5efe2', x + 8, F, z - 3);                    // a cap, open side down
      addCyl(x - 7, z + 2, R - 0.1, F, F + H, fruit);
      addCyl(x + 8, z - 3, R - 0.1, F, F + H, fruit);
    }

    // --- floor: a glass pickle jar on its side: walk in at the open end
    {
      const x = -150, z = -10, R = 7, L = 26;
      const jarGlass = new THREE.MeshPhysicalMaterial({ color: '#d6f0dc', roughness: 0.05, transparent: true, opacity: 0.42, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
      this._mesh(new THREE.CylinderGeometry(R, R, L, 40, 1, true).rotateZ(Math.PI / 2), jarGlass, x, F + R, z, { cast: false });
      this._mesh(new THREE.TorusGeometry(R + 0.1, 0.45, 8, 40).rotateY(Math.PI / 2), jarGlass, x + L / 2 - 1.2, F + R, z, { cast: false });
      const label = canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#f6efd8'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#3f7a2a'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
        c.font = `900 ${h * 0.46}px "Bagel Fat One", "Arial Black", sans-serif`; c.textAlign = 'center';
        for (const lx of [0.25, 0.75]) c.fillText('PICKLES', w * lx, h * 0.68);
      });
      this._mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 9, 40, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: label, roughness: 0.7, side: THREE.DoubleSide }), x - 3, F + R, z);
      this._mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 1.4, 40).rotateZ(Math.PI / 2), m.lidGold, x - L / 2 - 0.6, F + R, z);
      for (const [px, pz, a] of [[-6, -2.4, 0.2], [-1, 2.2, -0.4], [4, -1, 1.2]]) {
        food(lumpy(new THREE.CapsuleGeometry(1.1, 5, 6, 12), 0.03).rotateZ(Math.PI / 2).rotateY(a), (qx, qy, qz, c) => mixHex('#4f7a2a', '#7fa64a', 0.5 + bump(qx * 2, qy * 2, qz * 2), c), x + px, F + 1.1, z + pz);
        addBox(x + px - 3, x + px + 3, z + pz - 1.4, z + pz + 1.4, F, F + 2.2, fruit);
      }
      addBox(x - L / 2 - 1.3, x + L / 2, z - R - 0.3, z - R + 1.4, F, F + 11, { surface: 'glass' });
      addBox(x - L / 2 - 1.3, x + L / 2, z + R - 1.4, z + R + 0.3, F, F + 11, { surface: 'glass' });
      addBox(x - L / 2 - 1.3, x + L / 2, z - R + 1.4, z + R - 1.4, F + 11, F + 2 * R + 0.2, { surface: 'glass' });
      addBox(x - L / 2 - 1.3, x - L / 2 + 0.1, z - R, z + R, F, F + 2 * R, { surface: 'steel' });
    }

    // --- knocked-over dining chairs
    this._fallenChair(-88, 66, 'side', 0);
    this._fallenChair(98, 60, 'back', 1);
    this._fallenChair(180, -82, 'back', 2);

    // --- spilled cereal round the fallen cereal box
    {
      const n = 46;
      const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1.1, 0.42, 8, 16), new THREE.MeshStandardMaterial({ roughness: 0.75 }), n);
      const o = new THREE.Object3D(), tones = ['#f0a93b', '#e07b24', '#f7c85a'];
      for (let i = 0, k = 0; i < n && k < 600; k++) {
        const px = rand(106, 170), pz = rand(16, 58);
        if (px > 117 && px < 155 && pz > 25 && pz < 47) continue; // not inside the box
        o.position.set(px, F + 0.42, pz);
        o.rotation.set(Math.PI / 2 + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0, Math.PI));
        o.updateMatrix();
        rings.setMatrixAt(i, o.matrix);
        rings.setColorAt(i, new THREE.Color(tones[i % 3]));
        i++;
      }
      rings.castShadow = rings.receiveShadow = true;
      this.scene.add(rings);
    }

    // --- the dining table: fruit piled high in the bowl
    {
      const tTop = -6, bx = 0, bz = 106;
      const apple = (x, y, z, r, a, b) => food(new THREE.SphereGeometry(r, 24, 16).scale(1, 0.92, 1), (px, py, pz, c) => mixHex(a, b, 0.5 + 0.5 * Math.sin(Math.atan2(pz, px) * 9 + py), c), x, y, z);
      apple(bx - 3, tTop + 5.6, bz - 1.5, 2.7, '#b51c17', '#e2483a');
      apple(bx + 0.5, tTop + 5.2, bz - 4.5, 2.5, '#7fbf3a', '#a8d65a');
      food(lumpy(new THREE.IcosahedronGeometry(2.6, 3), 0.02), (px, py, pz, c) => mixHex('#ff8c1a', '#f07510', 0.5 + bump(px * 4, py * 4, pz * 4), c), bx + 2.8, tTop + 5.4, bz + 1.5);
      for (const [dz, dy] of [[0, 0], [1.6, 0.5]]) {
        this._mesh(bananaGeo([new THREE.Vector3(-6, 0.4, 4 + dz), new THREE.Vector3(-2, -0.6, 2.5 + dz), new THREE.Vector3(2.5, 0, 0.5 + dz), new THREE.Vector3(6, 1.4, -1.5 + dz)], 1.05), m.food, bx, tTop + 7.4 + dy, bz);
      }
      for (let i = 0; i < 12; i++) { // a bunch of grapes on top
        const a = i * 2.39, r = 0.4 + (i % 4) * 0.45;
        food(new THREE.SphereGeometry(0.85, 12, 10), (px, py, pz, c) => mixHex('#5a2276', '#8e3fae', 0.5 + py, c), bx - 1 + Math.cos(a) * r, tTop + 8.8 - (i % 4) * 0.55, bz + 3 + Math.sin(a) * r);
      }
      addCyl(bx, bz, 6.8, tTop, tTop + 8.8, fruit);
    }

    // --- the back counter: a loaf of bread, a pineapple and a bunch of bananas
    {
      const x = 40, z = -163;
      food(new THREE.CapsuleGeometry(5.2, 14, 8, 20).rotateZ(Math.PI / 2).scale(1, 0.85, 1), (px, py, pz, c) => {
        mixHex('#d68a3c', '#9a5520', clamp(py / 4.4, 0, 1), c);
        if (py > 2.4 && Math.abs(Math.sin((px + pz * 0.6) * 0.75)) > 0.93) c.set('#f2d2a0'); // scored top
      }, x, 4, z, true);
      addBox(x - 12, x + 12, z - 5.2, z + 5.2, 0, 8.4, { surface: 'bread' });
    }
    {
      const x = 146, z = -165;
      food(new THREE.SphereGeometry(4.2, 28, 20).scale(1, 1.35, 1), (px, py, pz, c) => {
        const a = Math.atan2(pz, px) * 4.2;
        const d = Math.abs(Math.sin(a + py * 0.9)) * Math.abs(Math.sin(a - py * 0.9));
        mixHex('#e0a12a', '#8a5a10', d > 0.55 ? 0.85 : d * 0.6, c);
      }, x, 5.4, z);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, tilt = 0.25 + (i % 2) * 0.3;
        const g = new THREE.ConeGeometry(0.8, 6 + (i % 3), 4).translate(0, 3, 0).rotateZ(tilt).rotateY(a);
        food(g, i % 2 ? '#3f8f2f' : '#5aa83e', x, 10.6, z, true);
      }
      addCyl(x, z, 4.1, 0, 11, fruit);
    }
    {
      const s = new THREE.Vector3(-36, 2.2, -164);
      for (const tip of [[-53, 2.6, -170], [-55, 2.8, -163.5], [-53, 3, -158]]) {
        const t = new THREE.Vector3(...tip);
        const mid = s.clone().lerp(t, 0.5).setY(1.5);
        this._mesh(bananaGeo([s.clone(), mid, t], 1.6), m.food, 0, 0, 0);
      }
      food(new THREE.CylinderGeometry(0.6, 0.8, 2.4, 8).rotateZ(Math.PI / 2), '#6b4a22', s.x + 1.2, s.y, s.z, true);
      addBox(-56, -34, -171, -157, 0, 4.4, fruit);
    }

    // --- the island: a strawberry
    {
      const x = -4, z = -15;
      const prof = [[0, 3.4], [1.2, 2.9], [2.3, 1.6], [2.9, -0.2], [2.8, -1.6], [2.1, -2.5], [0.9, -2.9], [0, -2.95]].map(([r, y]) => new THREE.Vector2(r, y)).reverse();
      food(new THREE.LatheGeometry(prof, 28), (px, py, pz, c) => mixHex('#c4120c', '#e8321f', 0.5 + 0.5 * Math.sin(py * 1.3), c), x, 2.95, z);
      for (let i = 0; i < 40; i++) { // seeds
        const yy = -2.3 + (i / 40) * 5.2, a = i * 2.39;
        const rr = yy > 1.6 ? 2.3 - (yy - 1.6) * 1.1 : yy < -1.6 ? 2.1 + (yy + 1.6) * 0.3 : 2.85;
        food(new THREE.SphereGeometry(0.16, 6, 4).scale(1, 1.6, 1), '#ffe08a', x + Math.cos(a) * rr, 2.95 + yy, z + Math.sin(a) * rr, true);
      }
      for (let i = 0; i < 6; i++) {
        const g = new THREE.ConeGeometry(0.7, 3, 4).scale(1, 1, 0.3).translate(0, 1.5, 0).rotateZ(1.2).rotateY((i / 6) * Math.PI * 2);
        food(g, '#3f8f2f', x, 0.3, z, true);
      }
      addCyl(x, z, 2.8, 0, 6.3, fruit);
    }
  }

  // A dining chair knocked over: 'side' (lying on its side) or 'back' (fallen backwards),
  // turned by `q` quarter turns. Its seat, backrest and legs become walls, ledges and hurdles.
  _fallenChair(x, z, mode, q) {
    const seatTop = 17.5;
    const R = mode === 'side' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const lift = mode === 'side' ? 9 : 8.5;
    const M = new THREE.Matrix4().makeTranslation(x, F + lift, z).multiply(new THREE.Matrix4().makeRotationY((q * Math.PI) / 2)).multiply(R);
    const part = (geo) => {
      geo.applyMatrix4(M);
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      this._mesh(geo, this.mats.walnut, 0, 0, 0);
      addBox(b.min.x, b.max.x, b.min.z, b.max.z, b.min.y, b.max.y, { surface: 'wood' });
    };
    part(new THREE.BoxGeometry(18, 2, 16).translate(0, seatTop - 1, 0));
    part(new THREE.BoxGeometry(18, 20, 2).translate(0, seatTop + 10, 7.5));
    for (const [lx, lz] of [[-7.5, -6.5], [7.5, -6.5], [-7.5, 6.5], [7.5, 6.5]]) {
      part(new THREE.CylinderGeometry(0.9, 1, seatTop - 2, 10).translate(lx, (seatTop - 2) / 2, lz));
    }
  }

  // ------------------------------------------------------------------ floor cover
  _floorClutter() {
    const m = this.mats;
    const crumbMat = new THREE.MeshStandardMaterial({ color: '#d4a15a', roughness: 0.9, flatShading: true });
    const spots = [];
    for (let i = 0; i < 30; i++) {
      let x, z;
      for (let k = 0; k < 40; k++) {
        x = rand(-215, 215); z = rand(-120, 150);
        const inIsland = Math.abs(x) < 72 && Math.abs(z) < 44;
        const nearTable = Math.abs(x) < 80 && z > 55 && z < 155;
        const clear = groundHeight(x, z, 500, 0, 5) < F + 0.5; // keep clear of the bigger obstacles
        if (!inIsland && !nearTable && clear && spots.every(([a, b]) => Math.hypot(a - x, b - z) > 18)) break;
      }
      spots.push([x, z]);
      const r = rand(1.4, 3.4);
      const crumb = this._mesh(new THREE.DodecahedronGeometry(r, 0), crumbMat, x, F + r * 0.6, z);
      crumb.rotation.set(rand(0, 3), rand(0, 3), 0);
      addCyl(x, z, r * 0.85, F, F + r * 1.2, { surface: 'crumb' });
    }
    this.crumbSpots = spots;
    // a fallen cereal box and a dropped wooden spoon
    this._mesh(new THREE.BoxGeometry(32, 10, 16), [this.mats.cardboard, this.mats.cardboard, this.mats.label, this.mats.label, this.mats.cardboard, this.mats.cardboard], 136, F + 5, 36);
    addBox(120, 152, 28, 44, F, F + 10, { surface: 'cardboard' });
    const spoonMat = new THREE.MeshStandardMaterial({ color: '#d9a766', roughness: 0.6 });
    this._box(-175, -115, 40, 44, F, F + 2, spoonMat);
    this._mesh(new THREE.SphereGeometry(8, 24, 10).scale(1, 0.3, 0.7), spoonMat, -107, F + 1.5, 42);
    addBox(-175, -115, 40, 44, F, F + 2, { surface: 'wood' });
    addCyl(-107, 42, 7, F, F + 2.4, { surface: 'wood' });
  }

  // ------------------------------------------------------------------ hazards
  _burner(x, y, z, r, withLight) {
    const m = this.mats;
    this._mesh(new THREE.CylinderGeometry(r + 1, r + 1.4, 0.5, 48), m.dark, x, y + 0.25, z, { cast: false });
    const coilMat = new THREE.MeshStandardMaterial({ color: '#3a3332', roughness: 0.4, metalness: 0.6, emissive: '#ff2a00', emissiveIntensity: 0 });
    for (const rr of [r * 0.28, r * 0.57, r * 0.86]) {
      this._mesh(new THREE.TorusGeometry(rr, 0.45, 8, 48).rotateX(Math.PI / 2), coilMat, x, y + 0.6, z, { cast: false });
    }
    let light = null;
    if (withLight) {
      light = new THREE.PointLight('#ff4a10', 0, 34, 1.6);
      light.position.set(x, y + 3, z);
      this.scene.add(light);
    }
    this.burners.push({ x, y, z, r, coilMat, light, state: 'off', t: rand(4, 12) });
  }
  _water(x, y, z, rx, rz) {
    const w = this._mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), this.mats.water, x, y + 0.03, z, { cast: false, dyn: true });
    w.scale.set(rx, 1, rz);
    this.waters.push({ x, y, z, rx, rz });
  }
  _honey(x, y, z, r) {
    const mat = new THREE.MeshPhysicalMaterial({ color: '#f5a300', roughness: 0.1, clearcoat: 1, emissive: '#5a2a00', emissiveIntensity: 0.4, transparent: true, opacity: 0.92 });
    const mesh = this._mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), mat, x, y + 0.05, z, { cast: false, dyn: true });
    this.honeys.push({ x, y, z, r, cap: 150, max: 150, mesh });
  }

  _pads(list = null) {
    // Spatula launch pads on the floor fling you up onto the counters and the table.
    const pads = list || [
      [0, 46, 0, 0, 18], [0, -46, 0, 0, -16], [-76, 0, -48, 0, -4], [76, 0, 50, 0, 4], [-52, 44, -30, 0, 16], [52, -46, 18, 0, -22],
      [-150, -124, -140, 0, -158], [-40, -124, -40, 0, -158], [140, -124, 150, 0, -156],
      [0, 64, 0, -6, 98], [-92, 104, -40, -6, 104], [92, 104, 40, -6, 104],
    ];
    const padMat = new THREE.MeshStandardMaterial({ color: '#e8453a', roughness: 0.5 });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.8 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.5 });
    const baseG = new THREE.CylinderGeometry(3.2, 3.6, 0.8, 32), ringG = new THREE.TorusGeometry(3.6, 0.25, 8, 40).rotateX(Math.PI / 2), arrowG = new THREE.ConeGeometry(1.2, 2.2, 3);
    // All pads share three instanced meshes (3 draw calls instead of 36), animated per instance.
    const mk = (g, mat) => {
      const im = new THREE.InstancedMesh(g, mat, pads.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.receiveShadow = true;
      this.scene.add(im);
      return im;
    };
    this.padMeshes = { base: mk(baseG, padMat), ring: mk(ringG, ringMat), arrow: mk(arrowG, arrowMat) };
    for (const [x, z, tx, ty, tz] of pads) this.pads.push({ x, z, target: new THREE.Vector3(tx, ty, tz), pulse: 0 });
  }

  launchVelocity(pad, from) {
    const apex = Math.max(pad.target.y, from.y) + 14;
    const vy = Math.sqrt(2 * G * (apex - from.y));
    const T = vy / G + Math.sqrt((2 * (apex - pad.target.y)) / G);
    return new THREE.Vector3((pad.target.x - from.x) / T, vy, (pad.target.z - from.z) / T);
  }

  _landmark(x = -18, z = 20) { // the giant tomato, sitting on the main raised level (y 0)
    const r = 6;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshPhysicalMaterial({
      color: '#e0271c', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.5, sheenColor: new THREE.Color('#ff8a6a'),
    }));
    body.scale.set(1, 0.88, 1);
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8f2f', roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.6, 5), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, r * 0.86, Math.sin(a) * 1.4);
      leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      group.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2, 8), leafMat);
    stem.position.y = r * 0.95;
    group.add(stem);
    group.position.set(x, r * 0.88, z);
    this.scene.add(group);
    const collider = addCyl(x, z, r * 0.9, 0, r * 1.7, { surface: 'tomato' });
    this.landmark = { x, z, r, y: r * 0.88, group, body, collider, hp: 120, maxHp: 120, alive: true, regrowAt: 0, flash: 0, growT: 1 };
  }

  _tide() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uRadius: { value: 100 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uRadius; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          vec2 g = vec2(vUv.x * uRadius * 6.2831 / 3.0, vUv.y * 60.0 / 3.0 - uTime * 0.6);
          vec2 id = floor(g), f = fract(g) - 0.5;
          float r = 0.18 + 0.28 * hash(id);
          vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.3;
          float d = length(f - o);
          float ring = smoothstep(r, r - 0.06, d) - smoothstep(r - 0.06, r - 0.16, d);
          float shine = smoothstep(0.08, 0.0, length(f - o - vec2(-r*0.35, r*0.35)));
          float h = vUv.y;
          float base = 0.07 + 0.04 * sin(vUv.x * 80.0 + uTime * 2.0);
          vec3 col = mix(vec3(0.78, 0.9, 1.0), vec3(1.0), ring * 0.8 + shine);
          col += vec3(0.25, 0.1, 0.35) * ring * 0.35 * sin(d * 30.0 + uTime);
          float a = base + ring * 0.28 + shine * 0.45;
          a *= smoothstep(1.0, 0.45, h);
          a += smoothstep(0.62, 0.58, h) * 0.08;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.tideMesh = new THREE.Mesh(geo, mat);
    this.tideMesh.renderOrder = 5;
    this.tideMesh.frustumCulled = false;
    this.scene.add(this.tideMesh);
    this.setTide(0, 0, 330);
  }

  setTide(x, z, r) {
    this.tideMesh.position.set(x, F + 30, z);
    this.tideMesh.scale.set(Math.max(r, 0.1), 60, Math.max(r, 0.1));
    this.tideMesh.material.uniforms.uRadius.value = r;
    this.tideMesh.visible = r < 300;
  }

  // Sunbeam through the window and floating dust (Medium and High only).
  setAtmosphere(on) { if (this.shaft) { this.shaft.visible = on; this.motes.visible = on; } }
  _atmosphere() {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(70, 190), new THREE.MeshBasicMaterial({
      map: canvasTex(64, 256, shaftTex), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    shaft.position.set(-80, -2, -105);
    shaft.rotation.set(-0.95, 0.12, 0);
    shaft.renderOrder = 6;
    this.scene.add(shaft);
    this.shaft = shaft;
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-140, -40); pos[i * 3 + 1] = rand(F + 2, 50); pos[i * 3 + 2] = rand(-170, -30);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.35, map: SOFT_SPOT(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff2d0',
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
    this.setAtmosphere(this.quality.name !== 'Low');
  }

  // ------------------------------------------------------------------ spawning
  _spawns() {
    const pts = [
      [-52, -4], [-40, -8], [-34, 26], [-54, 26], [-28, -10], [-20, 4], [-20, -26], [-8, -20],
      [0, 12], [2, -1], [8, 26], [22, 8], [24, -10], [40, 24], [52, 18], [54, -24],
      [16, -28], [-2, -28], [36, -12], [-14, 28],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    for (const x of [-185, -140, -60, -30, 0, 45, 95, 140, 200, 225]) pts.push(new THREE.Vector3(x, 0, -152));
    for (const [x, z] of [[-48, 100], [-16, 112], [16, 98], [48, 120], [-48, 124], [0, 88]]) pts.push(new THREE.Vector3(x, -6, z));
    for (let i = 0; i < 26; i++) pts.push(this.randomOpenSpot('floor', 4));
    this.spawnPoints = pts;
  }

  // Random standing spot on a walkable level, clear of tall props and hazards.
  randomOpenSpot(regionName = null, margin = 5) {
    let name = regionName;
    if (!name) {
      let r = Math.random();
      for (const [k, v] of Object.entries(this.regions)) { r -= v.weight; if (r <= 0) { name = k; break; } }
      name ||= 'floor';
    }
    const R = this.regions[name] || this.regions.floor;
    for (let i = 0; i < 120; i++) {
      const x = rand(R.minX + margin, R.maxX - margin), z = rand(R.minZ + margin, R.maxZ - margin);
      const h = groundHeight(x, z, R.top + 0.5, 0.6, 1.2);
      if (Math.abs(h - R.top) > 0.7) continue;                       // not on this level
      if (groundHeight(x, z, 500, 0, 1.5) > R.top + 0.7) continue;    // under or next to something tall
      if (this.burners.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 3)) continue;
      return new THREE.Vector3(x, h, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  // Take the whole map down (before building another): meshes, materials, textures, lights.
  dispose() {
    this.real.remove(this.scene);
    const seen = new Set();
    this.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
        m.dispose();
      }
    });
    clearColliders();
  }

  // ------------------------------------------------------------------ food stains (see stains.js)
  paintSplat(x, y, z, radius, kind) { this.stains?.paint(x, y, z, radius, kind); }
  clearSplats() { this.stains?.clear(); }

  // ------------------------------------------------------------------ optimisation: merge static scenery
  _countMeshes() { let n = 0; this.scene.traverse((o) => { if (o.isMesh) n++; }); return n; }

  // Scenery never moves, so meshes that share a material are merged into one draw call
  // (GDD 11.7). Transparent and multi-material meshes are left alone.
  _mergeStatic() {
    this.scene.updateMatrixWorld(true);
    const groups = new Map();
    for (const o of [...this.scene.children]) {
      if (!o.isMesh || !o.userData.world || o.userData.dyn || Array.isArray(o.material) || o.material.transparent) continue;
      const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const vc = !!list[0].material.vertexColors;
      const keep = vc ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
      const geos = list.map((o) => {
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
        for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (vc && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        g.morphAttributes = {};
        g.clearGroups();
        return g.applyMatrix4(o.matrixWorld);
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow;
      mesh.userData.merged = true;
      this.scene.add(mesh);
      for (const o of list) this.scene.remove(o);
      geos.forEach((g) => g.dispose());
    }
    this.drawCallsAfter = this._countMeshes();
    // Scenery never moves: freeze its matrices so three.js skips recomputing them every frame.
    for (const o of this.scene.children) {
      if (o.isMesh && !o.userData.dyn && (o.userData.world || o.userData.merged)) { o.updateMatrix(); o.matrixAutoUpdate = false; }
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, now, fx, sfx) {
    for (const b of this.burners) {
      b.t -= dt;
      if (b.t <= 0) {
        if (b.state === 'off') { b.state = 'warn'; b.t = 2; }
        else if (b.state === 'warn') { b.state = 'on'; b.t = 8; sfx.play('sizzle', new THREE.Vector3(b.x, b.y + 1, b.z), 1.4); }
        else { b.state = 'off'; b.t = rand(9, 13); }
      }
      b.hot = b.state === 'on';
      const target = b.state === 'on' ? 2.6 : b.state === 'warn' ? 0.6 + 0.6 * Math.sin(now * 16) : 0;
      b.coilMat.emissiveIntensity += (target - b.coilMat.emissiveIntensity) * Math.min(1, dt * 6);
      if (b.light) b.light.intensity = b.coilMat.emissiveIntensity * 60;
      if (b.hot && Math.random() < dt * 20) {
        const a = rand(0, 6.28), d = rand(0, b.r * 0.9);
        fx.burst('ember', new THREE.Vector3(b.x + Math.cos(a) * d, b.y + 0.8, b.z + Math.sin(a) * d));
      }
    }
    for (const h of this.honeys) {
      h.cap = Math.min(h.max, h.cap + dt * 4);
      const hs = h.r * (0.4 + 0.6 * (h.cap / h.max));
      h.mesh.scale.set(hs, 1, hs);
      if (Math.random() < dt * 1.5) fx.burst('honey', new THREE.Vector3(h.x + rand(-1, 1), h.y + 0.3, h.z + rand(-1, 1)));
    }
    const PM = this.padMeshes, m4 = this._pm ||= new THREE.Matrix4(), q = this._pq ||= new THREE.Quaternion(), v = this._pv ||= new THREE.Vector3(), s = this._ps ||= new THREE.Vector3();
    const up = this._up ||= new THREE.Vector3(0, 1, 0);
    this.pads.forEach((p, i) => {
      p.pulse = Math.max(0, p.pulse - dt * 3);
      q.identity();
      PM.base.setMatrixAt(i, m4.compose(v.set(p.x, F + 0.4, p.z), q, s.set(1, 1 - p.pulse * 0.5, 1)));
      const rs = 1 + 0.08 * Math.sin(now * 4) + p.pulse * 0.4;
      PM.ring.setMatrixAt(i, m4.compose(v.set(p.x, F + 0.9, p.z), q, s.set(rs, rs, rs)));
      q.setFromAxisAngle(up, now + p.x);
      PM.arrow.setMatrixAt(i, m4.compose(v.set(p.x, F + 1.8 + Math.sin(now * 3 + p.x) * 0.3, p.z), q, s.set(1, 1, 1)));
    });
    for (const k in PM) PM[k].instanceMatrix.needsUpdate = true;
    const L = this.landmark;
    if (!L.alive && now >= L.regrowAt) { L.alive = true; L.hp = L.maxHp; L.group.visible = true; L.growT = 0; }
    if (L.alive && L.growT < 1) {
      L.growT = Math.min(1, L.growT + dt / 3);
      L.group.scale.setScalar(0.1 + 0.9 * L.growT);
      L.collider.enabled = L.growT > 0.6;
      if (L.growT >= 1) this.shadowDirty = true;
    }
    L.flash = Math.max(0, L.flash - dt * 4);
    L.body.material.emissive.setRGB(L.flash * 0.6, L.flash * 0.1, 0);
    this.tideMesh.material.uniforms.uTime.value = now;
    if (this.motes) { this.motes.rotation.y = Math.sin(now * 0.05) * 0.02; this.motes.position.y = Math.sin(now * 0.3) * 0.8; }
    this.stains.update(dt);
  }

  resetRound() {
    this.clearSplats();
    const L = this.landmark;
    Object.assign(L, { alive: true, hp: L.maxHp, growT: 1 });
    L.group.visible = true; L.group.scale.setScalar(1); L.collider.enabled = true;
    for (const h of this.honeys) h.cap = h.max;
    for (const b of this.burners) { b.state = 'off'; b.t = rand(4, 12); }
    this.shadowDirty = true;
  }

  inWater(p) {
    for (const w of this.waters) {
      if (Math.abs(p.y - w.y) > 1.2) continue;
      const dx = (p.x - w.x) / w.rx, dz = (p.z - w.z) / w.rz;
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }
  onBurner(p) {
    for (const b of this.burners) if (b.hot && Math.abs(p.y - b.y - 0.5) < 1.2 && Math.hypot(p.x - b.x, p.z - b.z) < b.r) return true;
    return false;
  }
  inHoney(p) {
    for (const h of this.honeys) {
      if (Math.abs(p.y - h.y) < 1.2 && Math.hypot(p.x - h.x, p.z - h.z) < h.r * clamp(0.4 + 0.6 * h.cap / h.max, 0.4, 1)) return h;
    }
    return null;
  }
  nearestHoney(p) {
    let best = null, bd = Infinity;
    for (const h of this.honeys) {
      if (Math.abs(p.y - h.y) > 3) continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best ? { h: best, d: bd } : null;
  }
}
