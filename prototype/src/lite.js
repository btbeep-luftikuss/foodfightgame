// Lite shading (0.53): for slow devices, cheaper materials that look much the same.
//
// The game's materials are physically based (MeshStandardMaterial / MeshPhysicalMaterial, lit partly by
// the room's environment map). On a weak GPU those shaders are most of the frame: measured on a
// software-rendered GPU, a kitchen frame took 237 ms as it is, 96 ms with Phong materials and 77 ms with
// Lambert ones. Lite shading draws every such material as
//   level 1: Phong (keeps the shine of glossy things as highlights from the lights),
//   level 2: Lambert (matte, cheapest),
// without the environment map, and makes up the light it gave with an even fill (an ambient light) and a
// brighter sky/ground light, so the picture keeps its brightness.
//
// The game's code only ever sees its own materials: just around each draw (renderer.render), every visible
// mesh's material is swapped for its lite stand-in, kept in step with it (colour, flash, fade, maps), and
// swapped back afterwards. So a hit flash or a fading web still shows, and switching back is instant.
//
// Detail culling, in the same pass (any level): a mesh that would be drawn smaller than `cullPx` pixels
// across (a far Titan's hair and buttons, a far crumb) is skipped for that frame. Each costs a draw call and
// its triangles for nothing you can see. (Not the merged scenery, nor what's drawn wherever it is.)
import * as THREE from 'three';
const _sph = new THREE.Vector3();

// what a stand-in copies from its material: every frame (cheap) / when the material changes (its version)
const LIVE = ['opacity', 'transparent', 'visible', 'emissiveIntensity', 'alphaTest', 'depthWrite', 'side'];
const ONCE = ['depthTest', 'blending', 'vertexColors', 'fog', 'toneMapped', 'colorWrite', 'polygonOffset', 'polygonOffsetFactor',
  'polygonOffsetUnits', 'flatShading', 'wireframe', 'premultipliedAlpha', 'alphaToCoverage', 'dithering', 'name'];
const MAPS = ['map', 'alphaMap', 'emissiveMap', 'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity', 'normalMap', 'normalScale', 'bumpMap', 'bumpScale'];
const baseCompile = THREE.Material.prototype.onBeforeCompile;

export class LiteShading {
  constructor() {
    this.level = 0;
    this.stand = new WeakMap(); // material -> [Phong, Lambert] (forgotten with the material: a map taken down)
    this.swapped = [];
    this.lights = [];
    this.fill = new THREE.AmbientLight('#fff4e8', 0); // added to the scene while it draws
    this.cullPx = 0; this.hidden = []; this.culled = 0;
  }
  setLevel(level) { this.level = level; }

  // Around a draw of `scene`: in (swap), out (swap back).
  begin(scene, camera, heightPx) {
    if (this.swapped.length || this.hidden.length) return;
    const lite = this.level > 0, cull = this.cullPx > 0 && camera?.isPerspectiveCamera;
    if (!lite && !cull) return;
    const env = scene.environment ? (scene.environmentIntensity ?? 1) : 0;
    if (lite) {
      this.fill.intensity = 2.9 * env; // the light the environment map gave: an even fill ...
      scene.add(this.fill);
    }
    const boost = 1.1 * env; // ... and a brighter sky/ground light
    const sw = this.swapped, lights = this.lights, hid = this.hidden;
    // pixels across per metre of size at a metre away: half the drawing height over tan(half the field of view)
    const k = cull ? heightPx / Math.tan((camera.fov * Math.PI) / 360) / (this.cullPx * (camera.zoom || 1)) : 0, cp = camera?.position;
    scene.traverseVisible((o) => {
      if (cull && o.isMesh && !o.isInstancedMesh && o.frustumCulled && !o.userData.merged) {
        const g = o.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const r = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(), d = _sph.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld).distanceTo(cp);
        if (r * k < d - r && r > 0) { o.visible = false; hid.push(o); return; } // (smaller than cullPx on screen)
      }
      const m = o.material;
      // a see-through two-sided material is drawn twice a frame by three.js (back, then front), recompiling
      // its program choice each time; for an additive one (glows, beams, rings) the order makes no difference
      if (m && m.transparent && m.side === THREE.DoubleSide && m.blending === THREE.AdditiveBlending && !m.forceSinglePass) m.forceSinglePass = true;
      if (!lite) return;
      if (o.isHemisphereLight) { lights.push(o, o.intensity); o.intensity += boost; return; }
      if (!m || Array.isArray(m) || !m.isMeshStandardMaterial) return;
      const l = this._stand(m);
      sw.push(o, m);
      o.material = l;
    });
  }
  end(scene) {
    const hid = this.hidden;
    this.culled = hid.length;
    for (let i = 0; i < hid.length; i++) hid[i].visible = true;
    hid.length = 0;
    const sw = this.swapped;
    for (let i = 0; i < sw.length; i += 2) sw[i].material = sw[i + 1];
    sw.length = 0;
    const L = this.lights;
    for (let i = 0; i < L.length; i += 2) L[i].intensity = L[i + 1];
    L.length = 0;
    if (this.fill.parent) scene.remove(this.fill);
  }

  _stand(m) {
    let pair = this.stand.get(m);
    if (!pair) this.stand.set(m, (pair = [null, null]));
    const k = this.level === 2 ? 1 : 0;
    let l = pair[k];
    if (!l) {
      l = pair[k] = k ? new THREE.MeshLambertMaterial() : new THREE.MeshPhongMaterial();
      l.userData.src = -1;
      l.forceSinglePass = true; // (see-through glass in one pass, not two)
      if (m.onBeforeCompile !== baseCompile) { // (the Titans' palette shader patch works on these too)
        const key = m.customProgramCacheKey();
        l.onBeforeCompile = m.onBeforeCompile;
        l.customProgramCacheKey = () => `${key}|lite${k}`;
      }
    }
    if (l.userData.src !== m.version) { // made, or the material changed: copy it all, recompile
      l.userData.src = m.version;
      for (const p of ONCE) if (p in l) l[p] = m[p];
      for (const p of MAPS) if (p in l && m[p] !== undefined) { if (m[p]?.isVector2) l[p].copy(m[p]); else l[p] = m[p]; }
      if (!k) { // Phong: its shine from how glossy the material is (and the colour of a metal's)
        const gloss = 1 - (m.roughness ?? 1), cc = m.clearcoat || 0, metal = m.metalness || 0;
        l.shininess = 6 + 140 * gloss * gloss + 60 * cc;
        if (metal > 0.5) l.specular.copy(m.color).multiplyScalar(0.25 + 0.6 * gloss);
        else l.specular.setScalar(0.03 + 0.45 * gloss * gloss + 0.3 * cc);
      }
      l.needsUpdate = true;
    }
    for (const p of LIVE) l[p] = m[p];
    l.color.copy(m.color);
    if (m.metalness > 0.5) l.color.multiplyScalar(k ? 0.85 : 0.6); // (a metal was mostly its reflection)
    l.emissive.copy(m.emissive);
    l.map = m.map;
    return l;
  }

}
