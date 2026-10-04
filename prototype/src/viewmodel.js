// First-person viewmodel: your arm and the food you're holding, attached to the camera.
import * as THREE from 'three';
import { clamp, damp } from './core.js';
import { makeFoodMesh } from './foods.js';
import { fpArmGeometry, FP_ARM_UP, FP_PALM_N, GRIP } from './human.js';
import { makeUtensilMesh, utensilHold } from './utensil-models.js';

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
    // Your left arm, a mirror image of the right, holding the utensil in hand (only while you have one).
    this.rootL = new THREE.Group();
    this.rootL.position.set(-0.5, -0.44, -0.92);
    camera.add(this.rootL);
    this.swayL = new THREE.Group();
    this.rootL.add(this.swayL);
    // two hands: a fist round a handle (its fingers curled to fit, see GRIP) and an open palm for gadgets
    this.fistGeo = fpArmGeometry(GRIP.fp.curl, GRIP.fp.thumb);
    this.palmGeo = fpArmGeometry(0.62, 0.35);
    this.armL = new THREE.Mesh(this.fistGeo, this.arm.material);
    this.armL.frustumCulled = false;
    this.armL.scale.set(-1.3, 1.3, 1.3); // mirrored (three.js flips the face winding for a negative scale)
    this.swayL.add(this.armL);
    this.handL = new THREE.Group();
    this.swayL.add(this.handL);
    const m = (v) => v.clone().setX(-v.x);
    this.palmNL = m(this.palmN); this.armUpL = m(this.armUp);
    // the fist: wrist just below and behind the grip; where its hollow is and which way the knuckles run
    this.fistPos = this.handL.position.clone().addScaledVector(this.palmNL, -0.045).addScaledVector(this.armUpL, 0.095);
    const G = GRIP.fp, Zp = new THREE.Vector3().crossVectors(this.palmN, this.armUp);
    const q = this.palmN.clone().multiplyScalar(G.m).addScaledVector(this.armUp, -G.d).addScaledVector(Zp, G.f);
    this.fistHollow = this.fistPos.clone().add(q.multiply(new THREE.Vector3(-1.3, 1.3, 1.3)));
    this.fistAxis = Zp.clone().setX(-Zp.x).normalize(); // along the knuckles, out past the thumb
    this.armL.position.copy(this.fistPos);
    this.toolId = null; this.tool = null; this.kickL = 0; this.toolIn = 0;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }


  // Put the palm under the food: wrist = food centre - palm normal * reach, back up the arm to the palm's middle.
  _grip(r) {
    const s = this.arm.scale.x;
    this.arm.position.copy(this.hand.position).addScaledVector(this.palmN, -(r * 1.0 + 0.012 * s)).addScaledVector(this.armUp, 0.07 * s);
  }

  update(dt, player, visible) {
    this.root.visible = visible;
    this.rootL.visible = visible && !!this.tool && this.toolIn > 0.02;
    if (!visible) return;
    if (player.rig && this.arm.material !== player.rig.material) this.arm.material = this.armL.material = player.rig.material; // your skin's colours
    this._left(dt, player);
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

  // Put the utensil in the left hand: a handle through the hollow of the fist (along the knuckles,
  // the business end out past the thumb, its face toward you), or a gadget resting on the open palm.
  _holdTool(id) {
    const t = this.tool;
    t.scale.setScalar(0.5);
    if (utensilHold(id) === 'grip') {
      this.armL.geometry = this.fistGeo;
      this.armL.position.copy(this.fistPos);
      const y = this.fistAxis, z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z).normalize(), x = new THREE.Vector3().crossVectors(y, z);
      t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      t.position.copy(this.fistHollow);
      this.swayL.add(t);
    } else {
      this.armL.geometry = this.palmGeo;
      // like food in the right hand: centred over the palm, the palm one bounding radius below it
      const y = this.palmNL.clone().normalize(), z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z).normalize(), x = new THREE.Vector3().crossVectors(y, z);
      t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      t.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(t), sph = box.getBoundingSphere(new THREE.Sphere());
      const c = sph.center.clone().sub(t.getWorldPosition(new THREE.Vector3()));
      t.position.copy(this.handL.position).sub(c);
      this.swayL.add(t);
      const r = sph.radius / Math.max(1e-3, t.parent.matrixWorld.getMaxScaleOnAxis());
      this.armL.position.copy(this.handL.position).addScaledVector(this.palmNL, -(r + 0.012 * 1.3)).addScaledVector(this.armUpL, 0.07 * 1.3);
    }
  }

  // The left hand: swaps utensils by dipping out of view and back, kicks forward when the utensil fires.
  _left(dt, player) {
    const id = player.alive ? player.utensil : null;
    if (id !== this.toolId) {
      if (this.toolIn > 0.05 && this.tool) { this.toolIn = Math.max(0, this.toolIn - dt * 7); } // lower the old one first
      else {
        if (this.tool) this.tool.parent?.remove(this.tool);
        this.tool = id ? makeUtensilMesh(id) : null;
        if (this.tool) this._holdTool(id);
        this.toolId = id;
      }
    } else this.toolIn = Math.min(1, this.toolIn + dt * (this.tool ? 5 : -7));
    if (!this.tool) { this.toolIn = 0; return; }
    if (player.armT > 0.25 && player.uRel?.used !== false) this.kickL = Math.min(1, this.kickL + 0.7);
    this.kickL = damp(this.kickL, 0, 9, dt);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const bob = player.onGround && speed > 0.5 ? Math.sin(player.walkPhase + Math.PI) * 0.02 * Math.min(1.5, speed / 6) : Math.sin(this.t * 1.5 + 1) * 0.004;
    const y = bob - (1 - this.toolIn) * 0.45 + (player.charging ? -0.03 : 0);
    const z = -0.16 * this.kickL;
    this.swayL.position.set(damp(this.swayL.position.x, 0, 16, dt), damp(this.swayL.position.y, y, 16, dt), damp(this.swayL.position.z, z, 16, dt));
    this.swayL.rotation.x = damp(this.swayL.rotation.x, -0.5 * this.kickL, 16, dt);
    this.swayL.rotation.z = damp(this.swayL.rotation.z, player.dashT > 0 ? 0.25 : 0, 10, dt);
  }
}
