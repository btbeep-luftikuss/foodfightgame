// Human-shaped Titans (0.11): head with a face and hair, neck, torso, arms with hands, legs with shoes.
// Stylised battle-royale proportions: a slightly big head on a 1.95 m body.
//
// Performance: the static parts (head, torso, hips, face) are merged per material and shared by all
// Titans; each arm and leg is one pivot with two meshes so it can swing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HEAD_Y = 1.7, HEAD_R = 0.22;
export const SKIN_TONES = ['#f6d3b3', '#eab893', '#d49a6a', '#b07346', '#8a5530', '#6b3f22', '#f2c6a0', '#c98b5e'];
export const HAIR_COLORS = ['#2a1c14', '#4a2f1c', '#7a4a26', '#c8923a', '#e6cf8a', '#161616', '#a3402a', '#8a8f99'];
export const HAIR_STYLES = ['short', 'spiky', 'long', 'bun', 'buzz', 'curly'];

const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const put = (g, m) => g.applyMatrix4(m);

// Costume pieces in skins.js were modelled on the old round Titan (head r 0.43 at y 1.52, body
// capsule centred at y 0.72). These map them onto the human head and torso.
export const HEAD_MAP = new THREE.Matrix4().makeTranslation(0, HEAD_Y, 0)
  .multiply(new THREE.Matrix4().makeScale(0.55, 0.55, 0.55)).multiply(new THREE.Matrix4().makeTranslation(0, -1.52, 0));
export const BODY_MAP = new THREE.Matrix4().makeTranslation(0, 1.17, 0)
  .multiply(new THREE.Matrix4().makeScale(0.6, 0.6, 0.6)).multiply(new THREE.Matrix4().makeTranslation(0, -0.72, 0));

let GEO = null;
export function humanGeometry() {
  if (GEO) return GEO;
  const hat = HEAD_MAP.clone().multiply(M(0, 1.88, 0, 0, 0, -0.12, 1.3, 1.3, 1.3));
  const puffs = [[-0.14, 0], [0.14, 0], [0, 0.13], [0, -0.13], [0, 0]].map(([x, z]) => put(new THREE.SphereGeometry(0.2, 12, 10), hat.clone().multiply(M(x, 0.42, z))));
  GEO = {
    tone: mergeGeometries([
      put(new THREE.SphereGeometry(HEAD_R, 24, 18), M(0, HEAD_Y, 0, 0, 0, 0, 1, 1.1, 1.02)),
      put(new THREE.CylinderGeometry(0.075, 0.09, 0.16, 12), M(0, 1.47, 0)),
      put(new THREE.SphereGeometry(0.032, 10, 8), M(0, 1.68, 0.215, 0, 0, 0, 1, 1.2, 1)), // nose
      put(new THREE.SphereGeometry(0.045, 10, 8), M(0.215, 1.7, 0, 0, 0, 0, 0.5, 1, 0.8)), // ears
      put(new THREE.SphereGeometry(0.045, 10, 8), M(-0.215, 1.7, 0, 0, 0, 0, 0.5, 1, 0.8)),
    ]),
    shirt: put(new THREE.CapsuleGeometry(0.22, 0.3, 6, 16), M(0, 1.16, 0, 0, 0, 0, 1.08, 0.8, 0.82)),
    pants: put(new THREE.CapsuleGeometry(0.19, 0.12, 6, 14), M(0, 0.9, 0, 0, 0, 0, 1.05, 0.8, 0.8)),
    white: mergeGeometries([
      put(new THREE.SphereGeometry(0.042, 12, 10), M(-0.078, 1.735, 0.19)), put(new THREE.SphereGeometry(0.042, 12, 10), M(0.078, 1.735, 0.19)),
    ]),
    black: mergeGeometries([
      put(new THREE.SphereGeometry(0.022, 10, 8), M(-0.078, 1.735, 0.225)), put(new THREE.SphereGeometry(0.022, 10, 8), M(0.078, 1.735, 0.225)),
      put(new THREE.BoxGeometry(0.075, 0.016, 0.02), M(-0.08, 1.795, 0.2, 0, 0, 0.12)), put(new THREE.BoxGeometry(0.075, 0.016, 0.02), M(0.08, 1.795, 0.2, 0, 0, -0.12)),
      put(new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI), M(0, 1.635, 0.2, -0.2, 0, Math.PI)), // smile
    ]),
    hat: mergeGeometries([put(new THREE.CylinderGeometry(0.28, 0.26, 0.3, 20), hat.clone().multiply(M(0, 0.2, 0))), ...puffs]),
    band: put(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 20), hat.clone()),
    // limbs, modelled hanging from their pivot at y = 0
    sleeve: put(new THREE.CapsuleGeometry(0.075, 0.22, 4, 10), M(0, -0.16, 0)),
    forearm: mergeGeometries([put(new THREE.CapsuleGeometry(0.062, 0.2, 4, 10), M(0, -0.42, 0)), put(new THREE.SphereGeometry(0.075, 10, 8), M(0, -0.58, 0.01))]),
    leg: put(new THREE.CapsuleGeometry(0.095, 0.56, 4, 10), M(0, -0.4, 0)),
    shoe: put(new THREE.BoxGeometry(0.17, 0.1, 0.28, 1, 1, 1), M(0, -0.83, 0.05)),
  };
  return GEO;
}

// Hair shapes, cached per style; all built around the head at HEAD_Y.
const HAIR_CACHE = {};
export function hairGeometry(style) {
  if (HAIR_CACHE[style]) return HAIR_CACHE[style];
  const cap = (r, phi, tilt = -0.25) => put(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, phi), M(0, HEAD_Y + 0.02, -0.01, tilt, 0, 0, 1, 1.12, 1.05));
  let parts;
  switch (style) {
    case 'spiky':
      parts = [cap(0.228, Math.PI * 0.5)];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(put(new THREE.ConeGeometry(0.05, 0.14, 6), M(Math.cos(a) * 0.1, HEAD_Y + 0.22, Math.sin(a) * 0.1 - 0.02, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)));
      }
      break;
    case 'long':
      parts = [cap(0.232, Math.PI * 0.55), put(new THREE.BoxGeometry(0.4, 0.4, 0.1), M(0, HEAD_Y - 0.14, -0.15, 0.08))];
      break;
    case 'bun':
      parts = [cap(0.228, Math.PI * 0.52), put(new THREE.SphereGeometry(0.09, 12, 10), M(0, HEAD_Y + 0.18, -0.16))];
      break;
    case 'buzz':
      parts = [cap(0.224, Math.PI * 0.42, -0.35)];
      break;
    case 'curly':
      parts = [cap(0.226, Math.PI * 0.5)];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, up = i % 2 ? 0.16 : 0.2;
        parts.push(put(new THREE.SphereGeometry(0.075, 10, 8), M(Math.cos(a) * 0.15, HEAD_Y + up, Math.sin(a) * 0.15 - 0.03)));
      }
      break;
    default: // short, with a little fringe
      parts = [cap(0.23, Math.PI * 0.5), put(new THREE.BoxGeometry(0.26, 0.05, 0.08), M(0.03, HEAD_Y + 0.15, 0.17, 0.5, 0, -0.15))];
  }
  HAIR_CACHE[style] = mergeGeometries(parts);
  return HAIR_CACHE[style];
}

// Assemble a human into `body`. mats: { tone, shirt, pants, hair, white, black, band, shoe }.
// The model faces local +z; local -x is the character's right.
export function buildHuman(body, mats, hairStyle = 'short') {
  const G = humanGeometry();
  for (const [g, m] of [[G.tone, mats.tone], [G.shirt, mats.shirt], [G.pants, mats.pants], [G.white, mats.white], [G.black, mats.black]]) body.add(new THREE.Mesh(g, m));
  const hair = new THREE.Mesh(hairGeometry(hairStyle), mats.hair);
  body.add(hair);
  const chefHat = new THREE.Group();
  chefHat.add(new THREE.Mesh(G.hat, mats.white), new THREE.Mesh(G.band, mats.band));
  body.add(chefHat);
  const mkArm = (s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 1.4, 0);
    pivot.rotation.z = s * 0.08;
    const hand = new THREE.Group();
    hand.position.y = -0.6;
    pivot.add(new THREE.Mesh(G.sleeve, mats.shirt), new THREE.Mesh(G.forearm, mats.tone), hand);
    body.add(pivot);
    return { pivot, hand };
  };
  const mkLeg = (s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.12, 0.88, 0);
    pivot.add(new THREE.Mesh(G.leg, mats.pants), new THREE.Mesh(G.shoe, mats.shoe));
    body.add(pivot);
    return pivot;
  };
  return { armL: mkArm(1), armR: mkArm(-1), legs: [mkLeg(1), mkLeg(-1)], hair, chefHat };
}

export function pick(list) { return list[(Math.random() * list.length) | 0]; }
