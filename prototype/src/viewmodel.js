// First-person viewmodel: your arm and the food you're holding, attached to the camera.
import * as THREE from 'three';
import { clamp, damp } from './core.js';
import { makeFoodMesh } from './foods.js';

const HELD_SCALE = { cheese: 0.55, watermelon: 0.5, carrot: 0.75, banana: 0.8, grapes: 0.7, blueberry: 0.8, pineapple: 0.7 };

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.set(0.48, -0.42, -0.95);
    camera.add(this.root);
    this.sway = new THREE.Group();
    this.root.add(this.sway);
    // bare forearm and hand in the Titan's skin tone, with the shirt sleeve at the elbow
    this.armMat = new THREE.MeshStandardMaterial({ color: '#eab893', roughness: 0.6 });
    this.sleeveMat = new THREE.MeshPhysicalMaterial({ color: '#ff9a1f', roughness: 0.55, sheen: 0.4 });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 10), this.armMat);
    arm.rotation.x = Math.PI / 2 - 0.25;
    arm.position.set(0.06, -0.12, 0.28);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 14), this.sleeveMat);
    sleeve.rotation.x = Math.PI / 2 - 0.25;
    sleeve.position.set(0.06, -0.05, 0.55);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), this.armMat);
    hand.scale.set(1.1, 0.85, 1.2);
    hand.position.set(0.05, -0.17, -0.04);
    this.sway.add(arm, sleeve, hand);
    this.hand = new THREE.Group();
    this.hand.position.set(0, 0, -0.05);
    this.sway.add(this.hand);
    this.heldId = null; this.held = null;
    this.kick = 0; this.t = 0;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }


  update(dt, player, visible) {
    this.root.visible = visible;
    if (!visible) return;
    if (this.armColor !== player.color + player.toneMat.color.getHexString()) { // matches your Titan and skin
      this.armColor = player.color + player.toneMat.color.getHexString();
      this.sleeveMat.color.copy(player.skinMat.color); this.armMat.color.copy(player.toneMat.color);
    }
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
