// Afterimages (0.87): a dash leaves a short trail of see-through copies of the Titan, frozen in its pose
// as it went past and fading out, in its colour. Each copy is the Titan's own body shape (shared, not copied)
// bent by a frozen copy of its skeleton's bone matrices: one small draw each, recycled from a pool, at most
// MAX at a time (the oldest gives way).
import * as THREE from 'three';

const MAX = 28;
const _white = new THREE.Color('#ffffff');

export class Afterimages {
  constructor(scene) {
    this.scene = scene;
    this.pool = []; this.live = [];
  }
  // A copy of `actor` as it stands now: `life` seconds, starting at `alpha`.
  spawn(actor, life = 0.32, alpha = 0.62) {
    const rig = actor.rig, src = rig?.lo || rig?.hi, sk = rig?.skeleton; // (the lighter body: it's a see-through blur)
    if (!src || !sk) return;
    let g = this.pool.pop();
    if (!g && this.live.length >= MAX) g = this.live.shift();
    if (!g) {
      const skel = new THREE.Skeleton(sk.bones, sk.boneInverses);
      skel.update = () => {}; // frozen: the bone matrices stay as copied
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const mesh = new THREE.SkinnedMesh(src.geometry, mat);
      mesh.skeleton = skel; // (attached at the world's origin: the bone matrices already hold where it stood)
      mesh.frustumCulled = false; // (a skinned shape's bounds cost a pass over every vertex ...)
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6); // (... so it gets one: where it stood, for the draw order)
      mesh.renderOrder = 2;
      g = { mesh, skel, age: 0, life, alpha };
      this.scene.add(mesh);
    }
    // the pose as it is this frame
    actor.root.updateMatrixWorld(true);
    sk.update();
    const n = sk.bones.length * 16;
    g.skel.boneMatrices.set(sk.boneMatrices.subarray(0, n));
    if (g.skel.boneTexture) g.skel.boneTexture.needsUpdate = true;
    g.mesh.geometry = src.geometry;
    g.mesh.boundingSphere.center.set(actor.pos.x, actor.pos.y + 1, actor.pos.z);
    g.mesh.material.color.set(actor.color || '#ffffff').lerp(_white, 0.1);
    g.mesh.material.opacity = alpha;
    g.mesh.visible = true;
    g.age = 0; g.life = life; g.alpha = alpha;
    this.live.push(g);
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.age += dt;
      const k = 1 - g.age / g.life;
      if (k <= 0) { g.mesh.visible = false; this.live.splice(i, 1); this.pool.push(g); continue; }
      g.mesh.material.opacity = g.alpha * k * k;
    }
  }
  clear() {
    for (const g of this.live) { g.mesh.visible = false; this.pool.push(g); }
    this.live.length = 0;
  }
}
