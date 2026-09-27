// First-person viewmodel: your arm and the food you're holding, attached to the camera.
import * as THREE from 'three';
import { clamp, damp } from './core.js';
import { makeFoodMesh } from './foods.js';
import { fpArmGeometry, FP_ARM_UP, FP_PALM_N } from './human.js';

const HELD_SCALE = { cheese: 0.55, watermelon: 0.5, carrot: 0.75, banana: 0.8, grapes: 0.7, blueberry: 0.8, pineapple: 0.7 };

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.set(0.48, -0.42, -0.95);
    camera.add(this.root);
    this.sway = new THREE.Group();
    this.root.add(this.sway);
    // Your own forearm and hand (same model and palette as your Titan: skin tone, sleeve, gloves),
    // curled into a grip around the food. The wrist sits at the arm mesh's origin.
    this.arm = new THREE.Mesh(fpArmGeometry(), new THREE.MeshStandardMaterial());
    this.arm.frustumCulled = false;
    this.arm.scale.setScalar(1.3); // first-person hands read better a little larger than life
    this.sway.add(this.arm);
    this.hand = new THREE.Group();
    this.hand.position.set(0, 0, -0.05);
    this.sway.add(this.hand);
    // grip frame of fpArmGeometry: palm normal and the direction back up the arm
    this.palmN = FP_PALM_N;
    this.armUp = FP_ARM_UP;
    this._grip(0.06);
    this.heldId = null; this.held = null;
    this.kick = 0; this.t = 0;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }


  // Put the palm under the food: wrist = food centre - palm normal * reach, back up the arm to the palm's middle.
  _grip(r) {
    const s = this.arm.scale.x;
    this.arm.position.copy(this.hand.position).addScaledVector(this.palmN, -(r * 1.0 + 0.012 * s)).addScaledVector(this.armUp, 0.07 * s);
  }

  update(dt, player, visible) {
    this.root.visible = visible;
    if (!visible) return;
    if (player.rig && this.arm.material !== player.rig.material) this.arm.material = player.rig.material; // your skin's colours
    const slot = player.selected();
    const id = slot ? slot.id : null;
    if (id !== this.heldId) {
      if (this.held) this.hand.remove(this.held);
      this.held = id ? makeFoodMesh(id) : null;
      if (this.held) {
        this.held.scale.setScalar((HELD_SCALE[id] || 0.9) * 0.42);
        if (id === 'carrot') this.held.rotation.y = 0.2;
        this.held.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        this.hand.add(this.held);
      }
      this._grip(this.held ? new THREE.Box3().setFromObject(this.held).getBoundingSphere(new THREE.Sphere()).radius / Math.max(1e-3, this.root.matrixWorld.getMaxScaleOnAxis()) : 0.06);
      this.heldId = id;
      this.kick = -0.6; // swap: the new food comes up from below
    }
    this.t += dt;
    // throws kick the hand forward, rapid fire gives a small recoil
    if (player.armT > 0.25) this.kick = Math.min(1, this.kick + 1);
    this.kick = damp(this.kick, 0, 10, dt);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const walking = player.onGround && speed > 0.5;
    const bob = walking ? Math.sin(player.walkPhase) * 0.02 * Math.min(1.5, speed / 6) : Math.sin(this.t * 1.5) * 0.004;
    let x = 0, y = bob, z = 0, rx = 0, rz = 0;
    if (player.charging) { // wind up: pull back and down
      const c = clamp(player.chargeT / Math.max(0.2, player.selectedFood()?.charge || 1), 0, 1);
      z += 0.14 * c; y -= 0.06 * c; rx += 0.35 * c;
    }
    if (this.kick > 0) { z -= 0.22 * this.kick; rx -= 0.4 * this.kick; }
    else { y += 0.25 * this.kick; } // coming up after a swap
    if (player.eat) { x -= 0.25; y += 0.12; z += 0.1; rx += 0.6; }
    if (player.shieldUp) { x -= 0.3; y += 0.05; z -= 0.1; }
    if (player.dashT > 0) rz -= 0.25;
    this.sway.position.set(damp(this.sway.position.x, x, 16, dt), damp(this.sway.position.y, y, 16, dt), damp(this.sway.position.z, z, 16, dt));
    this.sway.rotation.x = damp(this.sway.rotation.x, rx, 16, dt);
    this.sway.rotation.z = damp(this.sway.rotation.z, rz, 10, dt);
    if (this.held) this.held.rotation.y += dt * (id === 'blueberry' ? 0 : 0.3);
  }
}
