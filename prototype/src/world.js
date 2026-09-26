// The arena: the island countertop of the Grand Kitchen (GDD 9.2 "Chop Block Central")
// at 1:40 scale, plus a decorative giant kitchen around it for scale.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G, COUNTER, FLOOR_Y, addBox, addCyl, clearColliders, rand, clamp } from './core.js';

// ---------------------------------------------------------------------------
// Procedural textures (no image files).
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
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

// ---------------------------------------------------------------------------
export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.quality = quality;
    clearColliders();
    this.mats = {};
    this._lights(renderer);
    this._materials();
    this._kitchen();
    this._counter();
    this._props();
    this._hazards();
    this._pads();
    this._landmark();
    this._tide();
    this._spawns();
  }

  _lights(renderer) {
    const s = this.scene;
    s.background = new THREE.Color('#e8d6bd');
    s.fog = new THREE.Fog('#e8d6bd', 170, 560);
    const pmrem = new THREE.PMREMGenerator(renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;
    pmrem.dispose();

    s.add(new THREE.HemisphereLight('#fff3e0', '#6b4a2e', 0.9));
    const sun = new THREE.DirectionalLight('#ffe0b0', 2.6);
    sun.position.set(90, 140, -70);
    sun.target.position.set(0, -10, 0);
    s.add(sun, sun.target);
    if (this.quality.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.quality.shadows, this.quality.shadows);
      const cam = sun.shadow.camera;
      cam.left = -95; cam.right = 95; cam.top = 80; cam.bottom = -80; cam.near = 20; cam.far = 380;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.4;
    }
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#cfe3ff', 0.5);
    fill.position.set(-80, 60, 90);
    s.add(fill);
  }

  _materials() {
    const m = this.mats;
    m.wood = new THREE.MeshStandardMaterial({ map: canvasTex(1024, 512, butcherBlock), roughness: 0.62 });
    m.cabinet = new THREE.MeshStandardMaterial({ color: '#7fa39a', roughness: 0.55 });
    m.cabinetDark = new THREE.MeshStandardMaterial({ color: '#5f8279', roughness: 0.6 });
    m.floor = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, floorTiles, { repeat: [40, 40] }), roughness: 0.35 });
    m.wall = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, subwayTiles, { repeat: [14, 5] }), roughness: 0.3 });
    m.steel = new THREE.MeshStandardMaterial({ color: '#d4d8dc', metalness: 0.9, roughness: 0.22 });
    m.chrome = new THREE.MeshStandardMaterial({ color: '#f2f4f6', metalness: 1, roughness: 0.08 });
    m.ceramic = new THREE.MeshPhysicalMaterial({ color: '#f7f5f0', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.mug = new THREE.MeshPhysicalMaterial({ color: '#2f6fb0', roughness: 0.2, clearcoat: 1 });
    m.glass = new THREE.MeshPhysicalMaterial({ color: '#e6f6ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false });
    m.jam = new THREE.MeshPhysicalMaterial({ color: '#8e0f2c', roughness: 0.2, clearcoat: 1, sheen: 0.4 });
    m.rubber = new THREE.MeshStandardMaterial({ color: '#e8453a', roughness: 0.7 });
    m.dark = new THREE.MeshStandardMaterial({ color: '#2b2a2e', roughness: 0.6 });
    m.ceiling = new THREE.MeshStandardMaterial({ color: '#f4ede2', roughness: 0.9 });
    m.lamp = new THREE.MeshBasicMaterial({ color: '#fff7e0' });
  }

  _mesh(geo, mat, x, y, z, { cast = true, receive = true } = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast && !!this.quality.shadows;
    mesh.receiveShadow = receive && !!this.quality.shadows;
    this.scene.add(mesh);
    return mesh;
  }

  // Decorative giant kitchen. Nothing here collides; it exists to sell the 1:40 scale.
  _kitchen() {
    const m = this.mats, F = FLOOR_Y;
    this._mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), m.floor, 0, F, 0, { cast: false });
    // back wall with counters, upper cabinets, fridge, stove, window
    this._mesh(new THREE.PlaneGeometry(700, 120), m.wall, 0, F + 60, -170, { cast: false });
    this._mesh(new THREE.BoxGeometry(420, 36, 26), m.cabinet, -20, F + 18, -157, { cast: false });
    this._mesh(new THREE.BoxGeometry(424, 2, 30), m.wood, -20, 1, -156, { cast: false });
    for (let x = -220; x < 190; x += 44) {
      this._mesh(new THREE.BoxGeometry(42, 30, 14), m.cabinetDark, x + 22, 38, -163, { cast: false });
      this._mesh(new THREE.BoxGeometry(2, 8, 2), m.chrome, x + 38, 28, -155.5, { cast: false });
    }
    // fridge tower
    this._mesh(new THREE.BoxGeometry(46, 76, 34), m.steel, -250, F + 38, -150, { cast: false });
    this._mesh(new THREE.BoxGeometry(2, 40, 3), m.chrome, -229, F + 44, -132, { cast: false });
    // stove with burners on back counter
    this._mesh(new THREE.BoxGeometry(60, 1, 24), m.dark, 90, 2, -157, { cast: false });
    for (const [bx, bz] of [[75, -163], [105, -163], [75, -151], [105, -151]]) {
      this._mesh(new THREE.TorusGeometry(6, 0.8, 8, 32).rotateX(Math.PI / 2), m.dark, bx, 3, bz, { cast: false });
    }
    this._mesh(new THREE.CylinderGeometry(12, 11, 16, 32), m.steel, 75, 11, -163, { cast: false }); // stock pot
    this._mesh(new THREE.BoxGeometry(70, 16, 30), m.steel, 90, 46, -160, { cast: false }); // hood
    // window with daylight
    const win = this._mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshBasicMaterial({ color: '#fffaf0' }), -60, 40, -169.5, { cast: false, receive: false });
    win.material.fog = false;
    for (const x of [-60]) this._mesh(new THREE.BoxGeometry(3, 50, 2), m.ceramic, x, 40, -169, { cast: false });
    // side walls, ceiling, lamps
    this._mesh(new THREE.PlaneGeometry(500, 120).rotateY(Math.PI / 2), m.wall, -300, F + 60, 0, { cast: false });
    this._mesh(new THREE.PlaneGeometry(500, 120).rotateY(-Math.PI / 2), m.wall, 300, F + 60, 0, { cast: false });
    this._mesh(new THREE.PlaneGeometry(700, 600).rotateX(Math.PI / 2), m.ceiling, 0, F + 110, 0, { cast: false });
    for (const [x, z] of [[-80, -40], [80, -40], [-80, 60], [80, 60]]) {
      this._mesh(new THREE.CylinderGeometry(7, 7, 1, 24), m.lamp, x, F + 109, z, { cast: false, receive: false });
    }
    // pot rack hanging over the island (GDD "Skyhooks")
    this._mesh(new THREE.BoxGeometry(130, 1.5, 1.5), m.steel, 0, 68, 0, { cast: false });
    for (const x of [-55, 55]) this._mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), m.steel, x, 71, 0, { cast: false });
    const pots = [[-40, 10, 6], [-12, 8, 4], [16, 12, 7], [44, 7, 3]];
    for (const [x, r, drop] of pots) {
      this._mesh(new THREE.CylinderGeometry(0.2, 0.2, drop, 6), m.steel, x, 68 - drop / 2, 0, { cast: false });
      const pot = this._mesh(new THREE.CylinderGeometry(r, r * 0.9, r * 0.9, 32, 1, true), m.chrome, x, 68 - drop - r * 0.45, 0, { cast: true });
      pot.material = m.chrome;
    }
    // a few giant crumbs on the floor as cover and texture
    const crumbMat = new THREE.MeshStandardMaterial({ color: '#d4a15a', roughness: 0.9, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2), d = rand(75, 105);
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.72;
      const r = rand(1.2, 3);
      const crumb = this._mesh(new THREE.DodecahedronGeometry(r, 0), crumbMat, x, F + r * 0.6, z);
      crumb.rotation.set(rand(0, 3), rand(0, 3), 0);
      addCyl(x, z, r * 0.85, F, F + r * 1.2, { surface: 'crumb' });
    }
  }

  _counter() {
    const { minX, maxX, minZ, maxZ } = COUNTER;
    const w = maxX - minX, d = maxZ - minZ, h = -FLOOR_Y;
    const m = this.mats;
    // cabinet body, slightly inset, then a thick butcher-block top
    this._mesh(new THREE.BoxGeometry(w - 4, h - 2, d - 4), m.cabinet, 0, FLOOR_Y + (h - 2) / 2, 0);
    const top = this._mesh(new THREE.BoxGeometry(w, 2.2, d), [m.wood, m.wood, m.wood, m.wood, m.wood, m.wood], 0, -1.1, 0);
    top.receiveShadow = true;
    // cabinet door panels and handles
    for (let x = minX + 10; x < maxX; x += 20) {
      for (const z of [maxZ - 1.9, minZ + 1.9]) {
        this._mesh(new THREE.BoxGeometry(17, 26, 0.6), m.cabinetDark, x, FLOOR_Y + 17, z, { cast: false });
        this._mesh(new THREE.BoxGeometry(1, 7, 1), m.chrome, x + 6, FLOOR_Y + 22, z + Math.sign(z) * 0.6, { cast: false });
      }
    }
    for (let z = minZ + 12; z < maxZ; z += 20) {
      for (const x of [maxX - 1.9, minX + 1.9]) {
        this._mesh(new THREE.BoxGeometry(0.6, 26, 17), m.cabinetDark, x, FLOOR_Y + 17, z, { cast: false });
      }
    }
    // toe-kick shadow strip
    this._mesh(new THREE.BoxGeometry(w - 5, 3, d - 5), m.dark, 0, FLOOR_Y + 1.5, 0, { cast: false });
    addBox(minX, maxX, minZ, maxZ, FLOOR_Y, 0, { surface: 'wood', counter: true });

    // splat canvas: persistent food stains painted onto the countertop (GDD 11.4 "splat canvas")
    const res = this.quality.splatRes;
    this.splatCanvas = document.createElement('canvas');
    this.splatCanvas.width = res; this.splatCanvas.height = Math.round(res * d / w);
    this.splatCtx = this.splatCanvas.getContext('2d');
    this.splatTex = new THREE.CanvasTexture(this.splatCanvas);
    this.splatTex.colorSpace = THREE.SRGBColorSpace;
    const splatMat = new THREE.MeshStandardMaterial({
      map: this.splatTex, transparent: true, roughness: 0.18, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const plane = this._mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), splatMat, 0, 0.015, 0, { cast: false });
    plane.renderOrder = 1;
    this.splatDirty = false; this.splatT = 0;
  }

  paintSplat(x, y, z, radius, kind) {
    const { minX, maxX, minZ, maxZ } = COUNTER;
    if (y > 0.6 || y < -0.6 || x < minX || x > maxX || z < minZ || z > maxZ) return;
    const ctx = this.splatCtx, W = this.splatCanvas.width, H = this.splatCanvas.height;
    const px = ((x - minX) / (maxX - minX)) * W, py = ((z - minZ) / (maxZ - minZ)) * H;
    const pr = (radius / (maxX - minX)) * W;
    const looks = {
      tomato: ['rgba(196,22,14,0.85)', 'rgba(230,50,30,0.7)', 'rgba(150,10,8,0.8)'],
      drip: ['rgba(200,30,20,0.55)'],
      soda: ['rgba(80,34,12,0.55)', 'rgba(110,55,20,0.45)'],
      cheese: ['rgba(255,196,40,0.75)', 'rgba(240,170,20,0.7)'],
      carrot: ['rgba(255,138,28,0.8)'],
      banana: ['rgba(250,220,60,0.6)'],
      scorch: ['rgba(40,20,10,0.35)'],
      water: ['rgba(40,70,90,0.18)'],
    }[kind];
    if (!looks) return;
    const blobs = kind === 'drip' ? 1 : 7;
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * pr * 0.8;
      const r = pr * (i === 0 ? 0.7 : rand(0.15, 0.45));
      ctx.fillStyle = looks[i % looks.length];
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, r, r * rand(0.7, 1), a, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === 'tomato') {
      ctx.fillStyle = 'rgba(245,225,150,0.9)';
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * pr;
        ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, pr * 0.05, pr * 0.03, a, 0, Math.PI * 2); ctx.fill();
      }
      // splash streaks
      ctx.strokeStyle = 'rgba(200,25,15,0.7)';
      ctx.lineWidth = Math.max(1, pr * 0.08);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * pr * rand(1.1, 1.8), py + Math.sin(a) * pr * rand(1.1, 1.8)); ctx.stroke();
      }
    }
    this.splatDirty = true;
  }

  clearSplats() {
    this.splatCtx.clearRect(0, 0, this.splatCanvas.width, this.splatCanvas.height);
    this.splatDirty = true;
  }

  _props() {
    const m = this.mats;
    const shadowy = { cast: true, receive: true };
    // Cereal boxes (cardboard walls, tall cover)
    const labelTex = canvasTex(512, 768, cerealLabel);
    const cardboard = new THREE.MeshStandardMaterial({ color: '#e9a23b', roughness: 0.8 });
    const label = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55 });
    const boxA = this._mesh(new THREE.BoxGeometry(10, 16, 4), [cardboard, cardboard, cardboard, cardboard, label, label], -29, 8, -22, shadowy);
    boxA.rotation.y = 0;
    addBox(-34, -24, -24, -20, 0, 16, { surface: 'cardboard' });
    this._mesh(new THREE.BoxGeometry(4, 16, 10), [label, label, cardboard, cardboard, cardboard, cardboard], 42, 8, 15, shadowy);
    addBox(40, 44, 10, 20, 0, 16, { surface: 'cardboard' });

    // Jam jar
    this._mesh(new THREE.CylinderGeometry(3.7, 3.7, 8.4, 40), m.jam, -6, 4.2, 22, shadowy);
    this._mesh(new THREE.CylinderGeometry(4, 4, 10, 40, 1, true), m.glass, -6, 5, 22, { cast: false });
    this._mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.6, 40), new THREE.MeshStandardMaterial({ color: '#d9c27a', metalness: 0.8, roughness: 0.3 }), -6, 10.4, 22, shadowy);
    addCyl(-6, 22, 4, 0, 11, { surface: 'glass' });

    // Mug
    this._mesh(new THREE.CylinderGeometry(4.2, 3.9, 9, 40), m.mug, 14, 4.5, -16, shadowy);
    const handle = this._mesh(new THREE.TorusGeometry(2.4, 0.6, 12, 24), m.mug, 18.5, 4.8, -16, shadowy);
    handle.rotation.y = Math.PI / 2;
    addCyl(14, -16, 4.2, 0, 9, { surface: 'ceramic' });

    // Cutting board: a low platform you jump onto
    const boardMat = new THREE.MeshStandardMaterial({ color: '#c98f55', roughness: 0.55 });
    this._mesh(new THREE.BoxGeometry(24, 1, 14), boardMat, 0, 0.5, -1, shadowy);
    this._mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.1, 20), m.dark, 10, 0.55, -1, { cast: false }); // hang hole
    addBox(-12, 12, -8, 6, 0, 1, { surface: 'wood' });

    // Plate: a walkable ceramic disc
    this._mesh(new THREE.CylinderGeometry(8, 7, 0.55, 48), m.ceramic, 30, 0.275, 0, shadowy);
    addCyl(30, 0, 8, 0, 0.55, { surface: 'ceramic' });

    // Toaster (chrome cover near the edge)
    this._mesh(new THREE.BoxGeometry(12, 9, 8), m.chrome, 32, 4.5, -26, shadowy);
    this._mesh(new THREE.BoxGeometry(8, 0.3, 1.2), m.dark, 32, 9.05, -27.6, { cast: false });
    this._mesh(new THREE.BoxGeometry(8, 0.3, 1.2), m.dark, 32, 9.05, -24.4, { cast: false });
    this._mesh(new THREE.BoxGeometry(1, 2.4, 1.4), m.dark, 38.4, 6, -26, { cast: false });
    addBox(26, 38, -30, -22, 0, 9, { surface: 'steel' });

    // Salt and pepper shakers
    const salt = new THREE.MeshPhysicalMaterial({ color: '#fbfbfb', roughness: 0.2, clearcoat: 1 });
    const pepper = new THREE.MeshPhysicalMaterial({ color: '#3a3533', roughness: 0.25, clearcoat: 1 });
    this._mesh(new THREE.CylinderGeometry(1.7, 1.9, 6, 24), salt, -50, 3, -18, shadowy);
    this._mesh(new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.chrome, -50, 6, -18, shadowy);
    addCyl(-50, -18, 1.9, 0, 7.5, { surface: 'ceramic' });
    this._mesh(new THREE.CylinderGeometry(1.7, 1.9, 6, 24), pepper, -45, 3, -23, shadowy);
    this._mesh(new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.chrome, -45, 6, -23, shadowy);
    addCyl(-45, -23, 1.9, 0, 7.5, { surface: 'ceramic' });
  }

  _hazards() {
    const m = this.mats;
    // Hot plate burner: cycles off -> warning -> on (GDD 8.4)
    const bx = -44, bz = 14;
    this._mesh(new THREE.CylinderGeometry(8, 8.4, 0.5, 48), m.dark, bx, 0.25, bz, { cast: false });
    this.coilMat = new THREE.MeshStandardMaterial({ color: '#3a3332', roughness: 0.4, metalness: 0.6, emissive: '#ff2a00', emissiveIntensity: 0 });
    for (const r of [2, 4, 6]) {
      this._mesh(new THREE.TorusGeometry(r, 0.45, 8, 48).rotateX(Math.PI / 2), this.coilMat, bx, 0.6, bz, { cast: false });
    }
    this.burnerLight = new THREE.PointLight('#ff4a10', 0, 30, 1.6);
    this.burnerLight.position.set(bx, 3, bz);
    this.scene.add(this.burnerLight);
    this.burner = { x: bx, z: bz, r: 7, state: 'off', t: 6, hot: false };

    // Spilled water: makes you Wet (cleanses sticky and fire; freezes last longer)
    const water = new THREE.MeshPhysicalMaterial({ color: '#b9e2ff', roughness: 0.03, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false });
    const spill = this._mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), water, 47, 0.03, -10, { cast: false });
    spill.scale.set(9, 1, 6.5);
    this.spill = { x: 47, z: -10, rx: 9, rz: 6.5 };

    // Honey pool: grants Glaze shield, drains and refills
    this.honeyMat = new THREE.MeshPhysicalMaterial({ color: '#f5a300', roughness: 0.1, clearcoat: 1, emissive: '#5a2a00', emissiveIntensity: 0.4, transparent: true, opacity: 0.92 });
    this.honeyMesh = this._mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.honeyMat, 22, 0.05, 22, { cast: false });
    this.honey = { x: 22, z: 22, r: 3.2, cap: 150, max: 150 };
  }

  _pads() {
    // Spatula launch pads on the floor: they fling you back up onto the counter.
    const pads = [
      [0, 46, 0, 18], [0, -46, 0, -16], [-76, 0, -48, -4], [76, 0, 50, 4],
      [-52, 44, -30, 16], [52, -46, 18, -22],
    ];
    this.pads = [];
    const padMat = new THREE.MeshStandardMaterial({ color: '#e8453a', roughness: 0.5 });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd447', transparent: true, opacity: 0.8 });
    for (const [x, z, tx, tz] of pads) {
      const base = this._mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.8, 32), padMat, x, FLOOR_Y + 0.4, z);
      const ring = this._mesh(new THREE.TorusGeometry(3.6, 0.25, 8, 40).rotateX(Math.PI / 2), ringMat, x, FLOOR_Y + 0.9, z, { cast: false, receive: false });
      const arrow = this._mesh(new THREE.ConeGeometry(1.2, 2.2, 3), m_white(), x, FLOOR_Y + 1.6, z, { cast: false });
      this.pads.push({ x, z, target: new THREE.Vector3(tx, 0, tz), base, ring, arrow, pulse: 0 });
    }
    function m_white() { return new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 0.5 }); }
  }

  launchVelocity(pad, from) {
    const apex = 14;
    const vy = Math.sqrt(2 * G * (apex - from.y));
    const tUp = vy / G, tDown = Math.sqrt((2 * apex) / G);
    const T = tUp + tDown;
    return new THREE.Vector3((pad.target.x - from.x) / T, vy, (pad.target.z - from.z) / T);
  }

  _landmark() {
    // A true-scale "landmark food" (GDD 2.3): damage it to harvest tomatoes.
    const x = -18, z = 20, r = 6;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshPhysicalMaterial({
      color: '#e0271c', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.5, sheenColor: new THREE.Color('#ff8a6a'),
    }));
    body.scale.set(1, 0.88, 1);
    body.castShadow = body.receiveShadow = !!this.quality.shadows;
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
    this.landmark = { x, z, r, y: r * 0.88, group, body, collider, hp: 120, maxHp: 120, alive: true, regrowAt: 0, flash: 0 };
  }

  _tide() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uRadius: { value: 100 } },
      vertexShader: `
        varying vec2 vUv; varying vec3 vPos;
        void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
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
          a *= smoothstep(1.0, 0.45, h);            // foam thins out as it rises
          a += smoothstep(0.62, 0.58, h) * 0.08;    // denser band at counter height
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.tideMesh = new THREE.Mesh(geo, mat);
    this.tideMesh.renderOrder = 5;
    this.tideMesh.frustumCulled = false;
    this.scene.add(this.tideMesh);
    this.setTide(0, 0, 130);
  }

  setTide(x, z, r) {
    this.tideMesh.position.set(x, FLOOR_Y + 30, z);
    this.tideMesh.scale.set(Math.max(r, 0.1), 60, Math.max(r, 0.1));
    this.tideMesh.material.uniforms.uRadius.value = r;
  }

  _spawns() {
    // Food spawn spots on the countertop and floor (hand-placed around the props).
    this.spawnPoints = [
      [-52, -4], [-40, -8], [-34, 26], [-54, 26], [-28, -10], [-20, 4], [-20, -26], [-8, -20],
      [0, 12], [2, -1], [8, 26], [22, 8], [24, -10], [40, 24], [52, 18], [54, -24],
      [16, -28], [-2, -28], [36, -12], [-14, 28],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    // a few rewards down on the floor
    for (const [x, z] of [[0, 60], [0, -60], [-92, 20], [92, -20]]) this.spawnPoints.push(new THREE.Vector3(x, FLOOR_Y, z));
  }

  randomOpenSpot(margin = 6) {
    const { minX, maxX, minZ, maxZ } = COUNTER;
    for (let i = 0; i < 80; i++) {
      const x = rand(minX + margin, maxX - margin), z = rand(minZ + margin, maxZ - margin);
      if (this.isBlocked(x, z)) continue;
      if (Math.hypot(x - this.burner.x, z - this.burner.z) < 10) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  isBlocked(x, z) {
    // true if (x, z) on the counter is inside a tall prop
    const checks = [
      [-34, -24, -24, -20], [40, 44, 10, 20], [26, 38, -30, -22],
    ];
    for (const [a, b, c, d] of checks) if (x > a - 2 && x < b + 2 && z > c - 2 && z < d + 2) return true;
    for (const [cx, cz, r] of [[-6, 22, 4], [14, -16, 4.2], [-50, -18, 2], [-45, -23, 2], [-18, 20, 6]]) {
      if (Math.hypot(x - cx, z - cz) < r + 2) return true;
    }
    return false;
  }

  update(dt, now, fx, sfx) {
    // burner cycle: off 11 s, warning 2 s, on 8 s
    const b = this.burner;
    b.t -= dt;
    if (b.t <= 0) {
      if (b.state === 'off') { b.state = 'warn'; b.t = 2; }
      else if (b.state === 'warn') { b.state = 'on'; b.t = 8; sfx.play('sizzle', new THREE.Vector3(b.x, 1, b.z), 1.4); }
      else { b.state = 'off'; b.t = 11; }
    }
    b.hot = b.state === 'on';
    const target = b.state === 'on' ? 2.6 : b.state === 'warn' ? 0.6 + 0.6 * Math.sin(now * 16) : 0;
    this.coilMat.emissiveIntensity += (target - this.coilMat.emissiveIntensity) * Math.min(1, dt * 6);
    this.burnerLight.intensity = this.coilMat.emissiveIntensity * 60;
    if (b.hot && Math.random() < dt * 20) {
      const a = rand(0, 6.28), d = rand(0, 6.5);
      fx.burst('ember', new THREE.Vector3(b.x + Math.cos(a) * d, 0.8, b.z + Math.sin(a) * d));
    }

    // honey refills slowly
    const h = this.honey;
    h.cap = Math.min(h.max, h.cap + dt * 4);
    const hs = 0.4 + 0.6 * (h.cap / h.max);
    this.honeyMesh.scale.set(h.r * hs, 1, h.r * hs);
    if (Math.random() < dt * 2) fx.burst('honey', new THREE.Vector3(h.x + rand(-1, 1), 0.3, h.z + rand(-1, 1)));

    // pads pulse
    for (const p of this.pads) {
      p.pulse = Math.max(0, p.pulse - dt * 3);
      p.ring.scale.setScalar(1 + 0.08 * Math.sin(now * 4) + p.pulse * 0.4);
      p.base.scale.y = 1 - p.pulse * 0.5;
      p.arrow.position.y = FLOOR_Y + 1.8 + Math.sin(now * 3 + p.x) * 0.3;
      p.arrow.rotation.y += dt;
    }

    // landmark tomato regrowth and hit flash
    const L = this.landmark;
    if (!L.alive && now >= L.regrowAt) {
      L.alive = true; L.hp = L.maxHp; L.group.visible = true; L.growT = 0;
    }
    if (L.alive && L.growT !== undefined && L.growT < 1) {
      L.growT = Math.min(1, L.growT + dt / 3);
      L.group.scale.setScalar(0.1 + 0.9 * L.growT);
      L.collider.enabled = L.growT > 0.6;
    }
    L.flash = Math.max(0, L.flash - dt * 4);
    L.body.material.emissive.setRGB(L.flash * 0.6, L.flash * 0.1, 0);

    this.tideMesh.material.uniforms.uTime.value = now;

    this.splatT += dt;
    if (this.splatDirty && this.splatT > 0.08) {
      this.splatTex.needsUpdate = true; this.splatDirty = false; this.splatT = 0;
    }
  }

  resetRound() {
    this.clearSplats();
    const L = this.landmark;
    L.alive = true; L.hp = L.maxHp; L.group.visible = true; L.group.scale.setScalar(1); L.collider.enabled = true; L.growT = 1;
    this.honey.cap = this.honey.max;
    this.burner.state = 'off'; this.burner.t = 8;
  }

  inSpill(p) {
    if (Math.abs(p.y) > 1.2) return false;
    const dx = (p.x - this.spill.x) / this.spill.rx, dz = (p.z - this.spill.z) / this.spill.rz;
    return dx * dx + dz * dz < 1;
  }
  onBurner(p) {
    return this.burner.hot && Math.abs(p.y - 0.5) < 1.2 && Math.hypot(p.x - this.burner.x, p.z - this.burner.z) < this.burner.r;
  }
  inHoney(p) {
    return Math.abs(p.y) < 1.2 && Math.hypot(p.x - this.honey.x, p.z - this.honey.z) < this.honey.r * clamp(0.4 + 0.6 * this.honey.cap / this.honey.max, 0.4, 1);
  }
}
