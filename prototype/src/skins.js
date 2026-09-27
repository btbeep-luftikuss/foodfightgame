// Skins (0.10): costume outfits for Titans, with rarity tiers like a battle-royale locker.
// All original designs; nobody carries a weapon, only hats, helmets, capes and back bling.
//
// Each outfit is a handful of primitives merged per material, so a costume costs
// 1-3 extra draw calls per Titan. Geometry and materials are built once per skin and shared.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HEAD_MAP, BODY_MAP } from './human.js';

export const RARITY = {
  common: { name: 'Common', color: '#9aa3ad' },
  uncommon: { name: 'Uncommon', color: '#5fce3e' },
  rare: { name: 'Rare', color: '#3fa9ff' },
  epic: { name: 'Epic', color: '#b760ff' },
  legendary: { name: 'Legendary', color: '#ff9b2e' },
};

// Model space: the Titan faces +z; head is a 0.43 m sphere at y 1.52, eyes at z 0.36-0.48; body capsule to y 1.1.
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const sph = (r, m, phi = Math.PI) => new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, phi).applyMatrix4(m);
const cyl = (rt, rb, h, m, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg).applyMatrix4(m);
const box = (w, h, d, m) => new THREE.BoxGeometry(w, h, d).applyMatrix4(m);
const cone = (r, h, m, seg = 12) => new THREE.ConeGeometry(r, h, seg).applyMatrix4(m);
const torus = (r, t, m, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, 24, arc).applyMatrix4(m);
const star = (r, m) => new THREE.OctahedronGeometry(r).applyMatrix4(m);
const HALF = Math.PI / 2;
const _c = new THREE.Vector3();

export const SKINS = [
  { id: 'chef', name: 'Head Chef', rarity: 'common', hat: true, desc: 'The classic chef hat.' },
  {
    id: 'ninja', name: 'Nori Ninja', rarity: 'rare', color: '#2c2c3c', belly: '#23232f', desc: 'Headband, face wrap and crossed chopsticks.',
    mats: { red: ['#e0302a'], wrap: ['#1b1b26'], wood: ['#c9964f'] },
    parts: () => [
      ['red', torus(0.435, 0.05, M(0, 1.7, 0, HALF))],
      ['red', box(0.08, 0.34, 0.03, M(0.08, 1.56, -0.46, 0.3, 0, 0.35))],
      ['red', box(0.08, 0.3, 0.03, M(-0.06, 1.58, -0.46, 0.3, 0, -0.25))],
      ['wrap', cyl(0.44, 0.42, 0.16, M(0, 1.37, 0.01))],
      ['wood', cyl(0.035, 0.035, 1.1, M(0, 0.95, -0.44, 0, 0, 0.6))],
      ['wood', cyl(0.035, 0.035, 1.1, M(0, 0.95, -0.44, 0, 0, -0.6))],
    ],
  },
  {
    id: 'astro', name: 'Space Sprout', rarity: 'epic', color: '#eef1f6', belly: '#dfe4ec', desc: 'Bubble helmet, antenna and oxygen pack.',
    mats: { glass: ['#bfe8ff', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }], orange: ['#ff7a1a'], dark: ['#3a4150'], glow: ['#7df9ff', { emissive: '#35e0ff', emissiveIntensity: 1.2 }] },
    parts: () => [
      ['glass', sph(0.56, M(0, 1.54, 0.02))],
      ['orange', torus(0.42, 0.07, M(0, 1.1, 0, HALF))],
      ['dark', box(0.6, 0.7, 0.3, M(0, 0.85, -0.5))],
      ['orange', cyl(0.1, 0.1, 0.6, M(0.2, 0.88, -0.66))],
      ['orange', cyl(0.1, 0.1, 0.6, M(-0.2, 0.88, -0.66))],
      ['dark', cyl(0.015, 0.015, 0.35, M(0.25, 2.2, 0))],
      ['glow', sph(0.06, M(0.25, 2.4, 0))],
    ],
  },
  {
    id: 'knight', name: 'Sir Crumb', rarity: 'epic', color: '#b9c2cc', belly: '#8e98a4', hideHair: true, desc: 'Steel helm, red plume and a round back shield.',
    mats: { steel: ['#c9d1da', { metalness: 0.85, roughness: 0.25 }], red: ['#d42a2a'], gold: ['#f0c040', { metalness: 0.8, roughness: 0.3 }] },
    parts: () => [
      ['steel', sph(0.47, M(0, 1.55, 0), Math.PI * 0.42)],
      ['steel', box(0.08, 0.3, 0.06, M(0, 1.52, 0.47))],
      ['red', sph(0.16, M(0, 2.05, -0.1, 0, 0, 0, 0.6, 1.6, 1.4))],
      ['steel', cyl(0.42, 0.42, 0.06, M(0, 0.85, -0.47, HALF), 24)],
      ['gold', star(0.14, M(0, 0.85, -0.52, 0, 0, 0, 1, 1, 0.3))],
    ],
  },
  {
    id: 'pirate', name: 'Captain Pickle', rarity: 'rare', color: '#f2ead8', belly: '#3a2a22', hair: 'long', desc: 'Tricorn hat, eyepatch and a parrot pal.',
    mats: { black: ['#1d1a1f'], gold: ['#f0c040', { metalness: 0.7, roughness: 0.3 }], parrot: ['#e8322b'], beak: ['#ffcc33'] },
    parts: () => [
      ['black', cyl(0.56, 0.56, 0.05, M(0, 1.9, 0), 3)],
      ['black', cyl(0.3, 0.34, 0.3, M(0, 2.05, 0))],
      ['gold', torus(0.33, 0.025, M(0, 1.94, 0, HALF))],
      ['black', cyl(0.11, 0.11, 0.03, M(-0.16, 1.58, 0.49, HALF))],
      ['black', torus(0.44, 0.012, M(0, 1.62, 0, HALF - 0.3))],
      ['parrot', sph(0.14, M(0.5, 1.25, -0.05, 0, 0, 0, 1, 1.3, 1))],
      ['parrot', sph(0.1, M(0.5, 1.48, 0))],
      ['beak', cone(0.04, 0.1, M(0.5, 1.47, 0.11, HALF))],
    ],
  },
  {
    id: 'dino', name: 'Rex Hoodie', rarity: 'uncommon', color: '#5cc46a', belly: '#2e7a3a', hideHair: true, desc: 'Dino hood with back spikes and a tail.',
    mats: { hood: ['#2e7a3a'], spike: ['#ffd447'], eye: ['#fffaf2'], pupil: ['#1d1620'] },
    parts: () => {
      const p = [['hood', sph(0.48, M(0, 1.52, -0.06, -0.35), Math.PI * 0.55)]];
      for (const s of [1, -1]) { // the dino's own googly eyes on top of the hood
        p.push(['eye', sph(0.1, M(s * 0.17, 1.98, 0.18))], ['pupil', sph(0.05, M(s * 0.17, 2.0, 0.26))]);
        p.push(['spike', cone(0.035, 0.08, M(s * 0.12, 1.72, 0.44, Math.PI))]); // little fangs over the face
      }
      for (let i = 0; i < 5; i++) p.push(['spike', cone(0.09, 0.22, M(0, 1.95 - i * 0.27, -0.28 - Math.sin(i * 0.5) * 0.18, -0.4 - i * 0.2))]);
      p.push(['hood', cone(0.2, 0.7, M(0, 0.35, -0.6, -1.3))]);
      return p;
    },
  },
  {
    id: 'robot', name: 'Toastbot 3000', rarity: 'legendary', color: '#8d98a6', belly: '#5b6573', tone: '#a9b3bf', hideHair: true, desc: 'Glowing visor, antenna and twin jet boosters.',
    mats: { metal: ['#5b6573', { metalness: 0.8, roughness: 0.35 }], visor: ['#35e0ff', { emissive: '#1ad0ff', emissiveIntensity: 1.5 }], flame: ['#ff8a1a', { emissive: '#ff6a00', emissiveIntensity: 1.6 }] },
    parts: () => [
      ['visor', box(0.66, 0.16, 0.2, M(0, 1.58, 0.36))],
      ['metal', cyl(0.08, 0.08, 0.14, M(0.44, 1.52, 0, 0, 0, HALF))],
      ['metal', cyl(0.08, 0.08, 0.14, M(-0.44, 1.52, 0, 0, 0, HALF))],
      ['metal', cyl(0.02, 0.02, 0.4, M(0, 2.1, 0))],
      ['visor', sph(0.06, M(0, 2.32, 0))],
      ['metal', cyl(0.13, 0.13, 0.62, M(0.18, 0.9, -0.5))],
      ['metal', cyl(0.13, 0.13, 0.62, M(-0.18, 0.9, -0.5))],
      ['flame', cone(0.1, 0.25, M(0.18, 0.46, -0.5, Math.PI))],
      ['flame', cone(0.1, 0.25, M(-0.18, 0.46, -0.5, Math.PI))],
    ],
  },
  {
    id: 'wizard', name: 'Waffle Wizard', rarity: 'epic', color: '#5a3cd8', belly: '#3d2a9c', hair: 'long', desc: 'Starry pointed hat and a long white beard.',
    mats: { hat: ['#3d2a9c'], star: ['#ffd447', { emissive: '#ffb400', emissiveIntensity: 0.8 }], beard: ['#f7f4ee'] },
    parts: () => [
      ['hat', cyl(0.62, 0.62, 0.05, M(0, 1.86, 0), 24)],
      ['hat', cone(0.42, 1.0, M(0.05, 2.35, -0.05, -0.15, 0, -0.12))],
      ['star', star(0.1, M(0.12, 2.25, 0.36))],
      ['star', star(0.06, M(-0.2, 2.05, 0.3))],
      ['beard', cone(0.3, 0.6, M(0, 1.1, 0.3, Math.PI - 0.25))],
    ],
  },
  {
    id: 'cat', name: 'Cool Cat', rarity: 'uncommon', color: '#ffb347', belly: '#3a3a48', desc: 'Cat ears, shades and a curly tail.',
    mats: { ear: ['#e8892a'], shades: ['#141418', { metalness: 0.6, roughness: 0.15 }], pink: ['#ff9fb8'] },
    parts: () => [
      ['ear', cone(0.14, 0.28, M(0.24, 1.92, 0, 0, 0, -0.35), 4)],
      ['ear', cone(0.14, 0.28, M(-0.24, 1.92, 0, 0, 0, 0.35), 4)],
      ['pink', cone(0.07, 0.16, M(0.24, 1.9, 0.04, 0, 0, -0.35), 4)],
      ['pink', cone(0.07, 0.16, M(-0.24, 1.9, 0.04, 0, 0, 0.35), 4)],
      ['shades', box(0.2, 0.12, 0.04, M(0.16, 1.59, 0.5))],
      ['shades', box(0.2, 0.12, 0.04, M(-0.16, 1.59, 0.5))],
      ['shades', box(0.14, 0.03, 0.03, M(0, 1.62, 0.5))],
      ['ear', torus(0.22, 0.05, M(0, 0.62, -0.62, 0, HALF, 0), Math.PI * 1.4)],
    ],
  },
  {
    id: 'hero', name: 'Super Spud', rarity: 'legendary', color: '#2a55e0', belly: '#1f3fbf', desc: 'Hero mask, flowing cape and a gold star emblem.',
    mats: { cape: ['#e0302a', { side: THREE.DoubleSide }], mask: ['#1f3fbf'], eyes: ['#fffaf2'], pupil: ['#1d1620'], gold: ['#ffd447', { metalness: 0.7, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.4 }] },
    parts: () => [
      ['mask', cyl(0.445, 0.445, 0.13, M(0, 1.6, 0), 24)],
      ['eyes', sph(0.075, M(0.142, 1.585, 0.44, 0, 0, 0, 1.1, 0.8, 0.5))], ['eyes', sph(0.075, M(-0.142, 1.585, 0.44, 0, 0, 0, 1.1, 0.8, 0.5))],
      ['pupil', sph(0.035, M(0.142, 1.585, 0.475))], ['pupil', sph(0.035, M(-0.142, 1.585, 0.475))],
      ['cape', box(0.8, 1.2, 0.03, M(0, 0.62, -0.5, 0.18))],
      ['cape', torus(0.36, 0.05, M(0, 1.12, -0.05, HALF), Math.PI)],
      ['gold', star(0.14, M(0, 0.82, 0.44, 0, 0, 0, 1, 1, 0.35))],
    ],
  },
  {
    id: 'viking', name: 'Viking Veg', rarity: 'rare', color: '#8a5a3a', belly: '#4a3a2e', hideHair: true, desc: 'Horned helmet and a mighty braided beard.',
    mats: { steel: ['#a8b0ba', { metalness: 0.8, roughness: 0.3 }], horn: ['#f4ead2'], beard: ['#d9772b'] },
    parts: () => [
      ['steel', sph(0.47, M(0, 1.56, 0), Math.PI * 0.4)],
      ['steel', torus(0.42, 0.04, M(0, 1.8, 0, HALF))],
      ['horn', cone(0.09, 0.42, M(0.5, 1.95, 0, 0, 0, -0.9))],
      ['horn', cone(0.09, 0.42, M(-0.5, 1.95, 0, 0, 0, 0.9))],
      ['beard', cone(0.32, 0.55, M(0, 1.15, 0.3, Math.PI - 0.3))],
      ['beard', cyl(0.05, 0.05, 0.3, M(0, 0.8, 0.44))],
    ],
  },
  {
    id: 'galaxy', name: 'Galaxy Glaze', rarity: 'legendary', color: '#2a1b5c', belly: '#1c1240', glow: '#3a1f9c', tone: '#4a36b8', desc: 'A body full of night sky, a golden halo and orbiting stars.',
    mats: { halo: ['#ffe27a', { emissive: '#ffc400', emissiveIntensity: 1.4 }], star: ['#ffffff', { emissive: '#b9a8ff', emissiveIntensity: 1.6 }] },
    parts: () => [
      ['halo', torus(0.3, 0.035, M(0, 2.12, 0, HALF - 0.2))],
      ['star', star(0.08, M(0.62, 1.3, 0.1))],
      ['star', star(0.06, M(-0.58, 1.0, -0.2))],
      ['star', star(0.07, M(0.1, 0.7, -0.6))],
      ['star', star(0.05, M(-0.2, 1.1, 0.44))],
      ['star', star(0.04, M(0.22, 0.55, 0.42))],
    ],
  },
  {
    id: 'fruitpunch', name: 'Fruit Punch DJ', rarity: 'epic', color: '#ff4f9a', belly: '#2b2b35', hair: 'curly', desc: 'Big headphones and a boombox on the back.',
    mats: { phones: ['#1e1e28', { metalness: 0.4, roughness: 0.3 }], cup: ['#39f0c8', { emissive: '#12b894', emissiveIntensity: 0.8 }], box: ['#2b2b35'], speaker: ['#ffd447'] },
    parts: () => [
      ['phones', torus(0.46, 0.04, M(0, 1.55, 0, 0, HALF, 0), Math.PI)],
      ['cup', cyl(0.14, 0.14, 0.1, M(0.46, 1.52, 0, 0, 0, HALF))],
      ['cup', cyl(0.14, 0.14, 0.1, M(-0.46, 1.52, 0, 0, 0, HALF))],
      ['box', box(0.7, 0.42, 0.24, M(0, 0.9, -0.52))],
      ['speaker', cyl(0.12, 0.12, 0.04, M(0.18, 0.9, -0.66, HALF))],
      ['speaker', cyl(0.12, 0.12, 0.04, M(-0.18, 0.9, -0.66, HALF))],
    ],
  },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

// Built once per skin: one merged geometry + material per material key.
const OUTFIT_CACHE = new Map();
function outfitParts(skin) {
  if (OUTFIT_CACHE.has(skin.id)) return OUTFIT_CACHE.get(skin.id);
  const list = [];
  if (skin.parts) {
    const groups = {};
    for (const [key, g] of skin.parts()) {
      // Pieces were modelled on the old round Titan: fit head pieces to the human head, the rest to the torso.
      g.computeBoundingBox();
      g.applyMatrix4(g.boundingBox.getCenter(_c).y >= 1.0 ? HEAD_MAP : BODY_MAP);
      (groups[key] ||= []).push(g);
    }
    for (const [key, geos] of Object.entries(groups)) {
      const [color, opts = {}] = skin.mats[key];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts });
      list.push([mergeGeometries(geos), mat]);
    }
  }
  OUTFIT_CACHE.set(skin.id, list);
  return list;
}

// A fresh Group with this skin's costume pieces (meshes share the cached geometry/materials).
export function makeOutfit(id) {
  const g = new THREE.Group();
  const skin = SKIN_BY_ID[id];
  if (!skin) return g;
  for (const [geo, mat] of outfitParts(skin)) {
    const m = new THREE.Mesh(geo, mat);
    if (mat.transparent) { m.renderOrder = 3; m.castShadow = false; }
    g.add(m);
  }
  return g;
}

export function randomSkinId() { return SKINS[(Math.random() * SKINS.length) | 0].id; }
