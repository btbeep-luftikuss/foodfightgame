// Surface State Grid (GDD section 12.2): a sparse 1 m grid of gameplay surface states
// (slick, sticky...) written by "stamps", plus pooled zone meshes that show them.
import * as THREE from 'three';

const CELL = 1;
const key = (level, ix, iz) => level * 16777216 + (ix + 2048) * 4096 + (iz + 2048);
const levelOf = (y) => (y > -18 ? 0 : 1);

const ZONE_LOOKS = {
  ice: { color: '#d9f3ff', opacity: 0.82, roughness: 0.04, clearcoat: 1, emissive: '#0b2a3a' },
  soda: { color: '#5b2810', opacity: 0.78, roughness: 0.08, clearcoat: 1, emissive: '#000000' },
  melt: { color: '#ffc632', opacity: 0.9, roughness: 0.25, clearcoat: 0.6, emissive: '#3a2400' },
  crumbs: { color: '#c98b45', opacity: 0.85, roughness: 0.9, clearcoat: 0, emissive: '#000000' },
};

export class Surface {
  constructor(scene) {
    this.cells = new Map();
    this.zones = [];
    this.pool = [];
    this.scene = scene;
    this.geo = new THREE.CircleGeometry(1, 40);
    this.geo.rotateX(-Math.PI / 2);
    this.sweepT = 0;
    this.layer = 0;
  }

  // state: 'slick' | 'ice' | 'sticky' ; opts: { slow, visual, owner }
  stamp(x, y, z, radius, state, duration, now, opts = {}) {
    const level = levelOf(y);
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cx = (ix + 0.5) * CELL - x, cz = (iz + 0.5) * CELL - z;
        if (cx * cx + cz * cz > r2) continue;
        this.cells.set(key(level, ix, iz), { state, until: now + duration, slow: opts.slow || 0, owner: opts.owner || null, y });
      }
    }
    if (opts.visual && ZONE_LOOKS[opts.visual]) this._addZone(x, y, z, radius, opts.visual, now, duration);
  }

  query(x, y, z, now) {
    const k = key(levelOf(y), Math.floor(x / CELL), Math.floor(z / CELL));
    const c = this.cells.get(k);
    if (!c) return null;
    if (c.until < now) { this.cells.delete(k); return null; }
    if (Math.abs(c.y - y) > 1.6) return null; // stamped on a different surface height
    return c;
  }

  // Remove states in a radius (milk / fire melting ice, etc.). Returns count cleared.
  clear(x, y, z, radius, state) {
    let n = 0;
    const level = levelOf(y);
    for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
      for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
        const k = key(level, ix, iz), c = this.cells.get(k);
        if (c && (!state || c.state === state)) { this.cells.delete(k); n++; }
      }
    }
    for (const zn of this.zones) {
      if (zn.look === state && Math.hypot(zn.x - x, zn.z - z) < radius + zn.r * 0.5) zn.until = Math.min(zn.until, zn.now + 0.4);
    }
    return n;
  }

  _addZone(x, y, z, r, look, now, duration) {
    let mesh = this.pool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.geo, new THREE.MeshPhysicalMaterial({ transparent: true, depthWrite: false }));
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
    }
    const L = ZONE_LOOKS[look];
    const m = mesh.material;
    m.color.set(L.color); m.roughness = L.roughness; m.clearcoat = L.clearcoat; m.emissive.set(L.emissive);
    m.opacity = L.opacity;
    mesh.visible = true;
    this.layer = (this.layer + 1) % 20;
    mesh.position.set(x, y + 0.03 + this.layer * 0.004, z);
    mesh.scale.setScalar(0.01);
    this.zones.push({ mesh, x, z, r, look, born: now, until: now + duration, now, baseOpacity: L.opacity });
  }

  update(dt, now) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zn = this.zones[i];
      zn.now = now;
      const age = now - zn.born, left = zn.until - now;
      if (left <= 0) {
        zn.mesh.visible = false;
        this.pool.push(zn.mesh);
        this.zones.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, age / 0.18);
      const wobble = 1 + Math.sin(now * 3 + zn.x) * 0.01;
      zn.mesh.scale.setScalar(zn.r * (0.3 + 0.7 * (1 - Math.pow(1 - grow, 3))) * wobble);
      zn.mesh.material.opacity = zn.baseOpacity * Math.min(1, left / 1.2);
    }
    this.sweepT += dt;
    if (this.sweepT > 2) {
      this.sweepT = 0;
      for (const [k, c] of this.cells) if (c.until < now) this.cells.delete(k);
    }
  }

  reset() {
    this.cells.clear();
    for (const zn of this.zones) { zn.mesh.visible = false; this.pool.push(zn.mesh); }
    this.zones.length = 0;
  }
}
