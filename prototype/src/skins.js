// Skins (0.10, refitted for the human Titans in 0.14): battle-royale style outfits with rarity tiers.
// All original designs; nobody carries a weapon, only clothes, hats, helmets, capes and back bling.
//
// A skin has two halves:
//  - clothing colours for the body palette (shirt, sleeves, gloves, trousers, boots, belt, shoes...),
//    which cost nothing extra to draw (see human.js);
//  - costume pieces (helmets, capes, backpacks...) modelled around the human head and body and attached
//    to the head, chest or hip bone, so they turn, lean and bob with the Titan. Pieces are merged per
//    material and anchor: usually 1-4 extra draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HEAD_C, BONE_REST } from './human.js';

export const RARITY = {
  common: { name: 'Common', color: '#9aa3ad' },
  uncommon: { name: 'Uncommon', color: '#5fce3e' },
  rare: { name: 'Rare', color: '#3fa9ff' },
  epic: { name: 'Epic', color: '#b760ff' },
  legendary: { name: 'Legendary', color: '#ff9b2e' },
  mythic: { name: 'Mythic', color: '#ff4fd8' }, // (0.76) the rarest drop in a box
};

// Model space: the Titan faces +z, feet at y = 0. The skull is centred at HEAD_C (half-sizes about
// 0.148 across, 0.182 tall, 0.168 deep); shoulders at y 1.43, chest front z 0.13, back z -0.11.
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const hm = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M(HEAD_C.x + x, HEAD_C.y + y, HEAD_C.z + z, rx, ry, rz, sx, sy, sz);
const sph = (r, m, phi = Math.PI) => new THREE.SphereGeometry(r, 22, 16, 0, Math.PI * 2, 0, phi).applyMatrix4(m);
const cyl = (rt, rb, h, m, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg).applyMatrix4(m);
const ecyl = (rx, rz, h, m) => new THREE.CylinderGeometry(1, 1, h, 32).scale(rx, 1, rz).applyMatrix4(m);
const arc = (r, h, from, len, m) => new THREE.CylinderGeometry(r, r, h, 24, 1, true, from, len).applyMatrix4(m);
const box = (w, h, d, m) => new THREE.BoxGeometry(w, h, d).applyMatrix4(m);
const cone = (r, h, m, seg = 14) => new THREE.ConeGeometry(r, h, seg).applyMatrix4(m);
const torus = (R, t, m, len = Math.PI * 2) => new THREE.TorusGeometry(R, t, 10, 36, len).applyMatrix4(m);
const star = (r, m) => new THREE.OctahedronGeometry(r).applyMatrix4(m);
const HALF = Math.PI / 2;

// Clothing: shirt, accent (cuffs and trims), collar, sleeves ('short' | 'long'), gloves, pants, boots,
// belt, buckle, shoes, soles, laces; tone overrides the skin (robots, aliens); rm: roughness/metalness per part.
export const SKINS = [
  {
    id: 'chef', name: 'Head Chef', rarity: 'common', hat: true, sleeves: 'short', desc: 'Chef hat and neckerchief, in your own colour.',
    mats: { kerchief: ['#d8342c'] },
    parts: () => [
      ['kerchief', cone(0.05, 0.085, M(0, 1.455, 0.084, Math.PI, 0, 0, 1, 1, 0.35)), 'chest'],
      ['kerchief', sph(0.017, M(0, 1.503, 0.074)), 'chest'],
    ],
  },
  {
    id: 'ninja', name: 'Nori Ninja', rarity: 'rare', desc: 'Headband, face wrap, sash and crossed chopsticks.',
    color: '#2c2c3c', belly: '#23232f', sleeves: 'long', gloves: '#1b1b26', shoes: '#1b1b26', soles: '#2c2c3c', laces: '#1b1b26',
    belt: '#e0302a', buckle: '#e0302a', accent: '#1b1b26', collar: '#1b1b26',
    mats: { red: ['#e0302a'], wrap: ['#1b1b26'], wood: ['#c9964f'] },
    parts: () => [
      ['red', torus(0.142, 0.013, hm(0, 0.078, -0.004, HALF, 0, 0, 1, 1.12, 1)), 'head'],
      ['red', sph(0.022, hm(0, 0.07, -0.17)), 'head'],
      ['red', box(0.028, 0.13, 0.008, hm(0.025, -0.01, -0.182, 0.35, 0, 0.28)), 'head'],
      ['red', box(0.028, 0.115, 0.008, hm(-0.022, 0.0, -0.182, 0.3, 0, -0.22)), 'head'],
      ['wrap', ecyl(0.141, 0.194, 0.085, hm(0, -0.064, 0.006)), 'head'],
      ['wood', cyl(0.008, 0.008, 0.46, M(0, 1.24, -0.125, 0, 0, 0.6), 8), 'chest'],
      ['wood', cyl(0.008, 0.008, 0.46, M(0, 1.24, -0.125, 0, 0, -0.6), 8), 'chest'],
    ],
  },
  {
    id: 'astro', name: 'Space Sprout', rarity: 'epic', desc: 'Bubble helmet, flight suit, antenna and oxygen pack.',
    color: '#eef1f6', belly: '#dfe4ec', sleeves: 'long', gloves: '#c9ced6', accent: '#ff7a1a', collar: '#ff7a1a', boots: '#f4f4f4',
    soles: '#8a93a0', belt: '#8a93a0', buckle: '#ff7a1a',
    mats: { glass: ['#bfe8ff', { transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0.2, depthWrite: false }], orange: ['#ff7a1a'], dark: ['#3a4150'], glow: ['#7df9ff', { emissive: '#35e0ff', emissiveIntensity: 1.2 }] },
    parts: () => [
      ['glass', sph(0.248, hm(0, 0.012, 0.004)), 'head'],
      ['orange', torus(0.098, 0.022, M(0, 1.525, -0.004, HALF)), 'chest'],
      ['dark', box(0.25, 0.3, 0.1, M(0, 1.26, -0.165)), 'chest'],
      ['orange', cyl(0.042, 0.042, 0.28, M(0.072, 1.27, -0.235)), 'chest'],
      ['orange', cyl(0.042, 0.042, 0.28, M(-0.072, 1.27, -0.235)), 'chest'],
      ['dark', cyl(0.006, 0.006, 0.12, hm(0.1, 0.24, -0.02), 6), 'head'],
      ['glow', sph(0.018, hm(0.1, 0.305, -0.02)), 'head'],
    ],
  },
  {
    id: 'knight', name: 'Sir Crumb', rarity: 'epic', hideHair: true, desc: 'Steel helm, chainmail, red plume and a round back shield.',
    color: '#9aa4ae', belly: '#6e7883', sleeves: 'long', gloves: '#4a4f57', boots: '#5a5f67', belt: '#6b3a1e', buckle: '#f0c040', accent: '#d42a2a', collar: '#d42a2a',
    rm: { shirt: [0.45, 0.6], midArm: [0.45, 0.6], forearm: [0.45, 0.6], hands: [0.35, 0.8], lowerLeg: [0.4, 0.6], shoes: [0.4, 0.6] },
    mats: { steel: ['#c9d1da', { metalness: 0.85, roughness: 0.25 }], red: ['#d42a2a'], gold: ['#f0c040', { metalness: 0.8, roughness: 0.3 }] },
    parts: () => [
      ['steel', sph(0.19, hm(0, 0.02, -0.004), Math.PI * 0.5), 'head'],
      ['steel', torus(0.172, 0.011, hm(0, 0.022, -0.004, HALF, 0, 0, 1, 1.1, 1)), 'head'],
      ['steel', box(0.02, 0.085, 0.014, hm(0, -0.012, 0.192)), 'head'],
      ['steel', box(0.012, 0.12, 0.1, hm(0.158, -0.045, 0.02, 0, 0, 0.08)), 'head'],
      ['steel', box(0.012, 0.12, 0.1, hm(-0.158, -0.045, 0.02, 0, 0, -0.08)), 'head'],
      ['red', sph(0.05, hm(0, 0.23, -0.03, 0, 0, 0, 0.55, 1.5, 1.4)), 'head'],
      ['steel', cyl(0.165, 0.165, 0.022, M(0, 1.24, -0.14, HALF), 28), 'chest'],
      ['gold', star(0.055, M(0, 1.24, -0.155, 0, 0, 0, 1, 1, 0.3)), 'chest'],
    ],
  },
  {
    id: 'pirate', name: 'Captain Pickle', rarity: 'rare', hair: 'long', desc: 'Tricorn hat, eyepatch, tall boots and a parrot pal.',
    color: '#f2ead8', belly: '#3a2a22', sleeves: 'long', boots: '#241a14', belt: '#b8322a', buckle: '#f0c040', accent: '#d9c9a8', collar: '#f2ead8',
    mats: { black: ['#1d1a1f'], gold: ['#f0c040', { metalness: 0.7, roughness: 0.3 }], parrot: ['#e8322b'], beak: ['#ffcc33'], wing: ['#2f8fdc'] },
    parts: () => [
      ['black', cyl(0.25, 0.25, 0.016, hm(0, 0.148, -0.004), 3), 'head'],
      ['black', cyl(0.118, 0.13, 0.085, hm(0, 0.19, -0.004)), 'head'],
      ['gold', torus(0.128, 0.007, hm(0, 0.158, -0.004, HALF)), 'head'],
      ['black', sph(0.022, hm(-0.058, 0.012, 0.162, 0, 0, 0, 1, 0.9, 0.3)), 'head'],
      ['black', torus(0.158, 0.0035, hm(0, 0.035, 0, HALF - 0.28, 0, 0.12, 1, 1.1, 1)), 'head'],
      ['parrot', sph(0.042, M(0.2, 1.51, -0.015, 0, 0, 0, 1, 1.45, 1.1)), 'chest'],
      ['parrot', sph(0.032, M(0.2, 1.585, 0.005)), 'chest'],
      ['wing', sph(0.03, M(0.235, 1.51, -0.02, 0, 0, 0, 0.4, 1.4, 1.1)), 'chest'],
      ['beak', cone(0.011, 0.03, M(0.2, 1.58, 0.042, HALF)), 'chest'],
    ],
  },
  {
    id: 'dino', name: 'Rex Hoodie', rarity: 'uncommon', hideHair: true, desc: 'Dino hoodie with googly eyes, back spikes and a tail.',
    color: '#5cc46a', belly: '#2e7a3a', sleeves: 'long', accent: '#ffd447', collar: '#2e7a3a', shoes: '#ffd447', soles: '#2e7a3a', laces: '#2e7a3a',
    mats: { hood: ['#4fb05e'], spike: ['#ffd447'], eye: ['#fffaf2'], pupil: ['#1d1620'] },
    parts: () => {
      const p = [['hood', sph(0.205, hm(0, 0.018, -0.02, -0.38, 0, 0), Math.PI * 0.6), 'head']];
      for (const s of [1, -1]) {
        p.push(['eye', sph(0.034, hm(0.072 * s, 0.175, 0.09)), 'head'], ['pupil', sph(0.016, hm(0.072 * s, 0.18, 0.121)), 'head']);
        p.push(['spike', cone(0.012, 0.03, hm(0.05 * s, 0.1, 0.176, Math.PI)), 'head']);
      }
      for (const [y, z, r] of [[0.215, -0.04, -0.3], [0.17, -0.14, -0.9], [0.08, -0.2, -1.4]]) p.push(['spike', cone(0.026, 0.065, hm(0, y, z, r)), 'head']);
      for (const y of [1.44, 1.33, 1.21]) p.push(['spike', cone(0.028, 0.07, M(0, y, -0.125, -HALF)), 'chest']);
      p.push(['spike', cone(0.026, 0.065, M(0, 1.07, -0.118, -HALF)), 'hips']);
      p.push(['hood', cone(0.07, 0.36, M(0, 0.9, -0.28, -1.95)), 'hips']);
      return p;
    },
  },
  {
    id: 'robot', name: 'Toastbot 3000', rarity: 'legendary', hideHair: true, hideBeard: true, desc: 'Chrome body, glowing visor, antenna and twin jet boosters.',
    color: '#8d98a6', belly: '#5b6573', tone: '#a9b3bf', sleeves: 'long', gloves: '#3a4250', boots: '#3a4250', belt: '#2a3038', buckle: '#35e0ff',
    accent: '#35e0ff', collar: '#3a4250', lips: '#5b6573', iris: '#35e0ff', eyeGlow: '#35e0ff',
    rm: { skin: [0.3, 0.85], shirt: [0.35, 0.8], midArm: [0.35, 0.8], forearm: [0.35, 0.8], pants: [0.4, 0.75], lowerLeg: [0.35, 0.8], hands: [0.35, 0.8], shoes: [0.35, 0.8] },
    mats: { metal: ['#5b6573', { metalness: 0.8, roughness: 0.35 }], visor: ['#35e0ff', { emissive: '#1ad0ff', emissiveIntensity: 1.5, side: THREE.DoubleSide }], flame: ['#ff8a1a', { emissive: '#ff6a00', emissiveIntensity: 1.6 }] },
    parts: () => [
      ['visor', arc(0.176, 0.05, -1.1, 2.2, hm(0, 0.014, -0.012)), 'head'],
      ['metal', cyl(0.03, 0.03, 0.03, hm(0.152, -0.005, 0, 0, 0, HALF)), 'head'],
      ['metal', cyl(0.03, 0.03, 0.03, hm(-0.152, -0.005, 0, 0, 0, HALF)), 'head'],
      ['metal', cyl(0.006, 0.006, 0.1, hm(0, 0.225, 0), 6), 'head'],
      ['visor', sph(0.018, hm(0, 0.285, 0)), 'head'],
      ['metal', cyl(0.045, 0.045, 0.26, M(0.075, 1.26, -0.16)), 'chest'],
      ['metal', cyl(0.045, 0.045, 0.26, M(-0.075, 1.26, -0.16)), 'chest'],
      ['flame', cone(0.035, 0.12, M(0.075, 1.07, -0.16, Math.PI)), 'chest'],
      ['flame', cone(0.035, 0.12, M(-0.075, 1.07, -0.16, Math.PI)), 'chest'],
    ],
  },
  {
    id: 'wizard', name: 'Waffle Wizard', rarity: 'epic', hair: 'long', hideBeard: true, desc: 'Starry pointed hat, star-trimmed robe and a long white beard.',
    color: '#5a3cd8', belly: '#3d2a9c', sleeves: 'long', accent: '#ffd447', collar: '#ffd447', belt: '#ffd447', buckle: '#ffd447', shoes: '#3d2a9c', soles: '#2a1d6e', laces: '#3d2a9c',
    mats: { hat: ['#3d2a9c'], star: ['#ffd447', { emissive: '#ffb400', emissiveIntensity: 0.8 }], beard: ['#f7f4ee', { roughness: 0.9 }] },
    parts: () => [
      ['hat', cyl(0.26, 0.26, 0.012, hm(0, 0.15, -0.004), 32), 'head'],
      ['hat', cone(0.148, 0.38, hm(0.015, 0.34, -0.03, -0.14, 0, -0.1)), 'head'],
      ['star', star(0.034, hm(0.05, 0.3, 0.115)), 'head'],
      ['star', star(0.022, hm(-0.07, 0.24, 0.1)), 'head'],
      ['beard', cone(0.1, 0.26, hm(0, -0.23, 0.11, Math.PI - 0.22)), 'head'],
      ['beard', sph(0.03, hm(0, -0.078, 0.168, 0, 0, 0, 1.7, 0.45, 0.6)), 'head'],
    ],
  },
  {
    id: 'cat', name: 'Cool Cat', rarity: 'uncommon', desc: 'Cat ears, shades and a curly tail.',
    color: '#ffb347', belly: '#3a3a48', sleeves: 'short', accent: '#e8892a', shoes: '#f4f1ea', laces: '#e8892a',
    mats: { ear: ['#e8892a'], shades: ['#141418', { metalness: 0.6, roughness: 0.15 }], pink: ['#ff9fb8'] },
    parts: () => {
      const p = [];
      for (const s of [1, -1]) {
        p.push(['ear', cone(0.052, 0.1, hm(0.09 * s, 0.195, -0.01, 0, 0, -0.35 * s), 4), 'head']);
        p.push(['pink', cone(0.026, 0.06, hm(0.09 * s, 0.19, 0.004, 0, 0, -0.35 * s), 4), 'head']);
        p.push(['shades', box(0.066, 0.04, 0.012, hm(0.058 * s, 0.014, 0.176)), 'head']);
        p.push(['shades', box(0.006, 0.01, 0.15, hm(0.15 * s, 0.02, 0.09)), 'head']);
      }
      p.push(['shades', box(0.04, 0.01, 0.01, hm(0, 0.024, 0.18)), 'head']);
      p.push(['ear', torus(0.085, 0.02, M(0, 0.95, -0.2, 0, HALF, 0), Math.PI * 1.4), 'hips']);
      return p;
    },
  },
  {
    id: 'hero', name: 'Super Spud', rarity: 'legendary', desc: 'Hero suit, mask, red boots and gloves, flowing cape and a gold star.',
    color: '#2a55e0', belly: '#2a55e0', sleeves: 'long', gloves: '#e0302a', boots: '#e0302a', belt: '#ffd447', buckle: '#ffd447', collar: '#2a55e0', accent: '#e0302a',
    mats: { cape: ['#e0302a', { side: THREE.DoubleSide }], mask: ['#1f3fbf'], eyes: ['#fffaf2'], gold: ['#ffd447', { metalness: 0.7, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.4 }] },
    parts: () => [
      ['mask', ecyl(0.154, 0.185, 0.048, hm(0, 0.012, 0.004)), 'head'],
      ['eyes', sph(0.022, hm(0.058, 0.012, 0.18, 0, 0, 0, 1.15, 0.8, 0.25)), 'head'],
      ['eyes', sph(0.022, hm(-0.058, 0.012, 0.18, 0, 0, 0, 1.15, 0.8, 0.25)), 'head'],
      ['cape', box(0.36, 0.72, 0.012, M(0, 1.07, -0.15, 0.13)), 'chest'],
      ['cape', torus(0.1, 0.018, M(0, 1.48, -0.01, -HALF), Math.PI), 'chest'],
      ['gold', star(0.05, M(0, 1.33, 0.132, 0, 0, 0, 1, 1, 0.3)), 'chest'],
    ],
  },
  {
    id: 'viking', name: 'Viking Veg', rarity: 'rare', hideHair: true, hideBeard: true, desc: 'Horned helmet, fur-trimmed tunic and a mighty braided beard.',
    color: '#8a5a3a', belly: '#4a3a2e', sleeves: 'long', accent: '#c9b79a', collar: '#c9b79a', boots: '#5b3d24', belt: '#3a2a1e', buckle: '#c0c7cf',
    mats: { steel: ['#a8b0ba', { metalness: 0.8, roughness: 0.3 }], horn: ['#f4ead2'], beard: ['#d9772b', { roughness: 0.85 }] },
    parts: () => [
      ['steel', sph(0.19, hm(0, 0.025, -0.004), Math.PI * 0.5), 'head'],
      ['steel', torus(0.172, 0.012, hm(0, 0.027, -0.004, HALF, 0, 0, 1, 1.1, 1)), 'head'],
      ['steel', box(0.02, 0.08, 0.014, hm(0, -0.01, 0.192)), 'head'],
      ['horn', cone(0.03, 0.15, hm(0.185, 0.12, 0, 0, 0, -0.95)), 'head'],
      ['horn', cone(0.03, 0.15, hm(-0.185, 0.12, 0, 0, 0, 0.95)), 'head'],
      ['beard', cone(0.115, 0.22, hm(0, -0.21, 0.105, Math.PI - 0.28)), 'head'],
      ['beard', cyl(0.016, 0.012, 0.11, hm(0, -0.355, 0.135, 0.28), 8), 'head'],
      ['beard', sph(0.03, hm(0, -0.078, 0.168, 0, 0, 0, 1.8, 0.45, 0.6)), 'head'],
    ],
  },
  {
    id: 'galaxy', name: 'Galaxy Glaze', rarity: 'legendary', desc: 'A body full of night sky, a golden halo and orbiting stars.',
    color: '#2a1b5c', belly: '#1c1240', glow: '#3a1f9c', tone: '#4a36b8', sleeves: 'long', gloves: '#2a1b5c', shoes: '#ffe27a', soles: '#2a1b5c',
    accent: '#ffe27a', collar: '#ffe27a', belt: '#ffe27a', buckle: '#ffe27a', iris: '#ffe27a', eyeGlow: '#ffc400',
    mats: { halo: ['#ffe27a', { emissive: '#ffc400', emissiveIntensity: 1.4 }], star: ['#ffffff', { emissive: '#b9a8ff', emissiveIntensity: 1.6 }] },
    parts: () => [
      ['halo', torus(0.115, 0.011, hm(0, 0.255, -0.02, HALF - 0.25)), 'head'],
      ['star', star(0.024, hm(0.23, 0.05, 0.05)), 'head'],
      ['star', star(0.018, hm(-0.21, -0.02, -0.08)), 'head'],
      ['star', star(0.03, M(0.27, 1.3, 0.05)), 'chest'],
      ['star', star(0.022, M(-0.26, 1.15, -0.1)), 'chest'],
      ['star', star(0.02, M(0.05, 1.0, 0.17)), 'hips'],
    ],
  },
  {
    id: 'fruitpunch', name: 'Fruit Punch DJ', rarity: 'epic', hair: 'curly', desc: 'Pink hoodie, big headphones and a boombox on the back.',
    color: '#ff4f9a', belly: '#2b2b35', sleeves: 'long', accent: '#39f0c8', collar: '#39f0c8', shoes: '#f4f1ea', laces: '#39f0c8',
    mats: { phones: ['#1e1e28', { metalness: 0.4, roughness: 0.3 }], cup: ['#39f0c8', { emissive: '#12b894', emissiveIntensity: 0.8 }], box: ['#2b2b35'], speaker: ['#ffd447'] },
    parts: () => [
      ['phones', torus(0.192, 0.011, hm(0, 0.0, -0.005), Math.PI), 'head'],
      ['phones', cyl(0.044, 0.044, 0.034, hm(0.166, -0.005, -0.005, 0, 0, HALF)), 'head'],
      ['phones', cyl(0.044, 0.044, 0.034, hm(-0.166, -0.005, -0.005, 0, 0, HALF)), 'head'],
      ['cup', cyl(0.032, 0.032, 0.008, hm(0.185, -0.005, -0.005, 0, 0, HALF)), 'head'],
      ['cup', cyl(0.032, 0.032, 0.008, hm(-0.185, -0.005, -0.005, 0, 0, HALF)), 'head'],
      ['box', box(0.28, 0.17, 0.085, M(0, 1.25, -0.15)), 'chest'],
      ['speaker', cyl(0.045, 0.045, 0.01, M(0.075, 1.25, -0.195, HALF)), 'chest'],
      ['speaker', cyl(0.045, 0.045, 0.01, M(-0.075, 1.25, -0.195, HALF)), 'chest'],
    ],
  },
  // ---- The Snack Box (0.30 the Snack Pack; 0.76 a box opened for a random skin, see coins.js).
  {
    id: 'burger', name: 'Burger Boss', rarity: 'rare', pack: 'snack', hideHair: true, desc: 'A double-stacked burger hat with lettuce, cheese and sesame seeds.',
    color: '#d8342c', belly: '#5a3a26', sleeves: 'short', accent: '#ffd447', collar: '#ffd447', belt: '#3a2a1e', buckle: '#ffd447', shoes: '#ffd447', soles: '#5a3a26', laces: '#d8342c',
    mats: { bun: ['#e0953f', { roughness: 0.6 }], patty: ['#5a3320', { roughness: 0.85 }], cheese: ['#ffcf2e'], lettuce: ['#6cc24a'], seed: ['#fff3d6'] },
    parts: () => {
      const p = [
        ['bun', cyl(0.168, 0.158, 0.05, hm(0, 0.148, -0.004), 28), 'head'],
        ['lettuce', torus(0.162, 0.016, hm(0, 0.178, -0.004, HALF, 0, 0)), 'head'],
        ['patty', cyl(0.172, 0.172, 0.045, hm(0, 0.198, -0.004), 28), 'head'],
        ['cheese', box(0.29, 0.012, 0.29, hm(0, 0.226, -0.004, 0, 0.78, 0)), 'head'],
        ['bun', sph(0.172, hm(0, 0.232, -0.004, 0, 0, 0, 1, 0.62, 1), Math.PI / 2), 'head'],
      ];
      for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.05 + (i % 3) * 0.03; p.push(['seed', sph(0.011, hm(Math.cos(a) * r, 0.33 - r * 0.5, Math.sin(a) * r - 0.004, 0, a, 0, 1.6, 0.6, 1)), 'head']); }
      return p;
    },
  },
  {
    id: 'donut', name: 'Donut Dynamo', rarity: 'rare', pack: 'snack', hair: 'curly', desc: 'A giant frosted donut float ring and a sprinkle headband.',
    color: '#ff8fc0', belly: '#7a4bb0', sleeves: 'short', accent: '#fff3d6', collar: '#fff3d6', shoes: '#fff3d6', soles: '#ff8fc0', laces: '#7a4bb0',
    mats: { dough: ['#d99a52', { roughness: 0.75 }], frost: ['#ff6fae', { roughness: 0.3 }], s1: ['#4fd1ff'], s2: ['#ffe14f'], s3: ['#7cf06a'] },
    parts: () => {
      const p = [
        ['dough', torus(0.235, 0.085, M(0, 1.0, 0, HALF, 0, 0)), 'hips'],
        ['frost', torus(0.235, 0.074, M(0, 1.05, 0, HALF, 0, 0, 1, 1, 0.7)), 'hips'],
        ['frost', torus(0.15, 0.016, hm(0, 0.075, -0.004, HALF, 0, 0, 1, 1.12, 1)), 'head'],
      ];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, R = 0.235 + ((i % 2) ? 0.03 : -0.03);
        p.push([`s${1 + (i % 3)}`, box(0.03, 0.01, 0.01, M(Math.cos(a) * R, 1.103, Math.sin(a) * R, 0, a * 1.7, 0)), 'hips']);
      }
      for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; p.push([`s${1 + (i % 3)}`, box(0.022, 0.008, 0.008, hm(Math.sin(a) * 0.162, 0.09, Math.cos(a) * 0.17, 0, a, 0.5)), 'head']); }
      return p;
    },
  },
  {
    id: 'icecream', name: 'Ice Cream Ace', rarity: 'epic', pack: 'snack', hideHair: true, desc: 'Three scoops and a cherry on top, with a waffle-cone jetpack.',
    color: '#fff3d6', belly: '#c98a4b', sleeves: 'long', gloves: '#ff9fc4', accent: '#ff9fc4', collar: '#ff9fc4', boots: '#7a4a2a', belt: '#7a4a2a', buckle: '#ff9fc4',
    mats: { straw: ['#ff9fc4', { roughness: 0.55 }], mint: ['#8ff0c8', { roughness: 0.55 }], choc: ['#6b3e22', { roughness: 0.55 }], cherry: ['#e0102a', { roughness: 0.2 }], waffle: ['#d9a05b', { roughness: 0.8 }], drip: ['#fff7ec', { roughness: 0.35 }] },
    parts: () => [
      ['straw', sph(0.178, hm(0, 0.085, -0.004, 0, 0, 0, 1, 0.92, 1), Math.PI * 0.62), 'head'],
      ['mint', sph(0.13, hm(0.01, 0.235, -0.01)), 'head'],
      ['choc', sph(0.1, hm(-0.005, 0.35, -0.005)), 'head'],
      ['drip', sph(0.06, hm(0, 0.435, 0, 0, 0, 0, 1.3, 0.5, 1.3)), 'head'],
      ['cherry', sph(0.035, hm(0.012, 0.475, 0.01)), 'head'],
      ['choc', cyl(0.004, 0.004, 0.06, hm(0.02, 0.52, 0.01, 0, 0, -0.4), 6), 'head'],
      ['waffle', cone(0.11, 0.34, M(0, 1.2, -0.2, Math.PI), 16), 'chest'],
      ['straw', sph(0.105, M(0, 1.38, -0.2)), 'chest'],
      ['drip', torus(0.1, 0.02, M(0, 1.36, -0.2, HALF)), 'chest'],
    ],
  },
  {
    id: 'pizza', name: 'Pizza Pilot', rarity: 'legendary', pack: 'snack', hair: 'buzz', desc: 'Leather flying cap, goggles, a long scarf and pepperoni pizza wings.',
    color: '#7a4f2e', belly: '#3d3a33', sleeves: 'long', gloves: '#3a2618', boots: '#3a2618', belt: '#3a2618', buckle: '#c9a24a', accent: '#f4ead2', collar: '#f4ead2',
    mats: { leather: ['#6a4126', { roughness: 0.6 }], brass: ['#c9a24a', { metalness: 0.8, roughness: 0.3 }], lens: ['#8fd8ff', { metalness: 0.3, roughness: 0.05, emissive: '#1b6a9a', emissiveIntensity: 0.4 }],
      scarf: ['#f4ead2', { side: THREE.DoubleSide }], cheese: ['#ffc93c', { side: THREE.DoubleSide }], crust: ['#d98a3a'], pep: ['#c8281e'] },
    parts: () => {
      const p = [
        ['leather', sph(0.168, hm(0, 0.012, -0.012, -0.2, 0, 0, 1.03, 1.05, 1.06), Math.PI * 0.55), 'head'],
        ['leather', box(0.04, 0.11, 0.08, hm(0.15, -0.07, -0.01)), 'head'],
        ['leather', box(0.04, 0.11, 0.08, hm(-0.15, -0.07, -0.01)), 'head'],
        ['leather', torus(0.163, 0.01, hm(0, 0.105, 0.0, HALF + 0.35, 0, 0, 1, 1.1, 1)), 'head'],
        ['scarf', torus(0.105, 0.03, M(0, 1.495, -0.004, HALF)), 'chest'],
        ['scarf', box(0.07, 0.34, 0.012, M(0.07, 1.3, -0.13, 0.35, 0, -0.2)), 'chest'],
      ];
      for (const s of [1, -1]) {
        p.push(['brass', torus(0.034, 0.009, hm(0.056 * s, 0.13, 0.13, -0.5)), 'head']);
        p.push(['lens', cyl(0.03, 0.03, 0.01, hm(0.056 * s, 0.13, 0.13, HALF - 0.5)), 'head']);
        // a slice of pizza for a wing: cheese, crust along the wide end, pepperoni
        const tip = new THREE.Vector3(0.06 * s, 1.3, -0.15), sw = 0.6 * s;
        p.push(['cheese', cone(0.17, 0.42, M(tip.x + 0.2 * s, 1.36, -0.16, 0, 0, sw + HALF * s, 1, 1, 0.08), 3), 'chest']);
        p.push(['crust', cyl(0.025, 0.025, 0.3, M(tip.x + 0.38 * s, 1.47, -0.16, 0, 0, sw), 10), 'chest']);
        for (const [dx, dy] of [[0.22, 0.05], [0.3, 0.13], [0.15, -0.02]]) p.push(['pep', cyl(0.03, 0.03, 0.03, M(tip.x + dx * s, 1.36 + dy, -0.155, HALF), 14), 'chest']);
      }
      return p;
    },
  },
  {
    id: 'broccoli', name: 'Broccoli Bandit', rarity: 'uncommon', pack: 'snack', hideHair: true, desc: 'A bushy broccoli crown, a bandit mask and a loot sack.',
    color: '#3f8f3a', belly: '#24402a', sleeves: 'long', gloves: '#1d1a1f', accent: '#9be15d', collar: '#1d1a1f', shoes: '#1d1a1f', soles: '#3f8f3a', laces: '#9be15d',
    mats: { floret: ['#3d9a3a', { roughness: 0.9 }], floret2: ['#2f7d2e', { roughness: 0.9 }], mask: ['#1d1a1f'], eyes: ['#fffaf2'], sack: ['#9c7a4c', { roughness: 0.95 }], rope: ['#7a5a32'] },
    parts: () => {
      const p = [['mask', ecyl(0.153, 0.184, 0.05, hm(0, 0.014, 0.004)), 'head']];
      for (const s of [1, -1]) p.push(['eyes', sph(0.021, hm(0.058 * s, 0.014, 0.181, 0, 0, 0, 1.2, 0.75, 0.25)), 'head']);
      const fl = [[0, 0.17, 0, 0.11], [0.09, 0.14, 0.05, 0.08], [-0.09, 0.14, 0.05, 0.08], [0.08, 0.15, -0.08, 0.085], [-0.08, 0.15, -0.08, 0.085], [0, 0.22, -0.04, 0.09], [0.12, 0.08, -0.02, 0.07], [-0.12, 0.08, -0.02, 0.07], [0, 0.13, 0.11, 0.07]];
      fl.forEach(([x, y, z, r], i) => p.push([i % 2 ? 'floret' : 'floret2', sph(r, hm(x, y, z - 0.01)), 'head']));
      p.push(['sack', sph(0.13, M(0.05, 1.17, -0.24, 0, 0, 0.25, 1.1, 1, 0.8)), 'chest']);
      p.push(['sack', cone(0.05, 0.09, M(0.01, 1.32, -0.24, 0, 0, 0.25)), 'chest']);
      p.push(['rope', torus(0.035, 0.012, M(0.015, 1.29, -0.24, HALF, 0, 0.25)), 'chest']);
      p.push(['rope', cyl(0.009, 0.009, 0.5, M(0.0, 1.3, -0.04, 0, 0, 0.75), 6), 'chest']);
      return p;
    },
  },
  {
    id: 'taco', name: 'Taco Tumbler', rarity: 'uncommon', pack: 'snack', hair: 'buzz', desc: 'A crunchy taco shell backpack, lime-wedge cap and a salsa scarf.',
    color: '#f2b13c', belly: '#2e5a8a', sleeves: 'short', accent: '#e0302a', collar: '#e0302a', shoes: '#f4f1ea', laces: '#e0302a',
    mats: { shell: ['#f0c35a', { roughness: 0.7, side: THREE.DoubleSide }], lettuce: ['#6cc24a'], tomato: ['#e8322b'], meat: ['#7a4426', { roughness: 0.9 }], lime: ['#8fd14f'], rind: ['#3f8f2a'], scarf: ['#e0302a'] },
    parts: () => {
      const p = [
        ['shell', arc(0.2, 0.12, -HALF, Math.PI, M(0, 1.36, -0.22, HALF, 0, 0)), 'chest'],
        ['meat', box(0.34, 0.07, 0.08, M(0, 1.33, -0.22)), 'chest'],
        ['rind', sph(0.168, hm(0, 0.03, -0.004, -0.1, 0, 0, 1, 1, 1.03), Math.PI * 0.42), 'head'],
        ['lime', sph(0.158, hm(0, 0.038, -0.004, -0.1, 0, 0, 1, 1, 1.03), Math.PI * 0.42), 'head'],
        ['rind', cyl(0.11, 0.11, 0.012, hm(0, 0.075, 0.13, 0.2), 20), 'head'],
        ['scarf', torus(0.1, 0.028, M(0, 1.5, -0.004, HALF)), 'chest'],
        ['scarf', cone(0.06, 0.1, M(0, 1.43, 0.09, Math.PI, 0, 0, 1, 1, 0.4)), 'chest'],
      ];
      for (let i = 0; i < 6; i++) {
        const x = -0.16 + i * 0.064;
        p.push(['lettuce', sph(0.036, M(x, 1.375, -0.22 + (i % 2 ? 0.025 : -0.025))), 'chest']);
        if (i % 2) p.push(['tomato', cyl(0.026, 0.026, 0.016, M(x + 0.03, 1.395, -0.2, 0.3, 0, 0), 12), 'chest']);
      }
      return p;
    },
  },
  // ---- (0.76) The Garden Box: opened with coins for a random skin (coins.js BOXES), Blooket style.
  {
    id: 'carrotcap', name: 'Carrot Captain', rarity: 'uncommon', pack: 'garden', hair: 'buzz', desc: 'A carrot-top cap with leafy sprouts, a captain\'s sash and a gold badge.',
    color: '#ff8a2a', belly: '#2f6b3a', sleeves: 'short', accent: '#2f6b3a', collar: '#fff3d6', shoes: '#2f6b3a', soles: '#1f3a22', laces: '#ff8a2a',
    mats: { carrot: ['#ff7a1a', { roughness: 0.6 }], ridge: ['#d95a12', { roughness: 0.7 }], leaf: ['#4fbf3a', { side: THREE.DoubleSide, roughness: 0.6 }], sash: ['#fff3d6'], badge: ['#ffd447', { metalness: 0.6, roughness: 0.3 }] },
    parts: () => {
      const p = [
        ['carrot', sph(0.175, hm(0, 0.02, -0.004, -0.12, 0, 0, 1, 1, 1.04), Math.PI * 0.48), 'head'],
        ['carrot', cyl(0.11, 0.11, 0.012, hm(0, 0.06, 0.14, 0.22), 20), 'head'],
        ['ridge', torus(0.168, 0.007, hm(0, 0.07, -0.01, HALF - 0.12, 0, 0, 1, 1, 1.04)), 'head'],
        ['ridge', torus(0.14, 0.007, hm(0, 0.125, -0.016, HALF - 0.12, 0, 0, 1, 1, 1.04)), 'head'],
        ['sash', box(0.055, 0.56, 0.015, M(0, 1.22, 0.14, 0, 0, 0.62)), 'chest'],
        ['badge', star(0.03, M(0.08, 1.34, 0.15, 0, 0, 0, 1, 1, 0.3)), 'chest'],
      ];
      for (const k of [-1, -0.35, 0.35, 1]) p.push(['leaf', cone(0.032, 0.19, hm(k * 0.035, 0.27, -0.03, -0.1, k * 0.7, -k * 0.45, 1, 1, 0.3), 6), 'head']);
      return p;
    },
  },
  {
    id: 'corncob', name: 'Corn Cob Kid', rarity: 'uncommon', pack: 'garden', hideHair: true, desc: 'A tall corn-on-the-cob hat in its husk, with silky tassels on top.',
    color: '#ffd23a', belly: '#4f8a3a', sleeves: 'short', accent: '#4f8a3a', collar: '#4f8a3a', shoes: '#4f8a3a', soles: '#2e5a22', laces: '#ffd23a',
    mats: { cob: ['#f2c230', { roughness: 0.5 }], kernel: ['#ffde55', { roughness: 0.3 }], husk: ['#7cc04a', { side: THREE.DoubleSide, roughness: 0.8 }], silk: ['#e8d9a0', { roughness: 0.9 }] },
    parts: () => {
      const p = [
        ['husk', sph(0.174, hm(0, 0.025, -0.004, -0.1, 0, 0, 1, 1, 1.03), Math.PI * 0.45), 'head'],
        ['cob', cyl(0.1, 0.1, 0.2, hm(0, 0.245, -0.01), 18), 'head'],
        ['cob', sph(0.1, hm(0, 0.345, -0.01), Math.PI / 2), 'head'],
      ];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + j * 0.31, y = 0.17 + j * 0.042;
        p.push(['kernel', box(0.036, 0.036, 0.02, hm(Math.cos(a) * 0.104, y, Math.sin(a) * 0.104 - 0.01, 0, HALF - a, 0)), 'head']);
      }
      for (let k = 0; k < 3; k++) p.push(['husk', arc(0.122, 0.17, k * 2.1, 1.25, hm(0, 0.21, -0.01, 0.06 * (k - 1), 0, 0.05 * (1 - k))), 'head']);
      for (let k = 0; k < 5; k++) p.push(['silk', cone(0.012, 0.11, hm(Math.cos(k * 1.3) * 0.03, 0.47, Math.sin(k * 1.3) * 0.03 - 0.01, 0.3 * Math.sin(k), 0, 0.3 * Math.cos(k)), 5), 'head']);
      return p;
    },
  },
  {
    id: 'pumpkin', name: 'Pumpkin Patch', rarity: 'rare', pack: 'garden', hideHair: true, hideBeard: true, desc: 'A carved pumpkin head with a candle glow, a curly stem and a vine scarf.',
    color: '#2b2b35', belly: '#3a2a1e', sleeves: 'long', gloves: '#5a8a3a', accent: '#ff8a1a', collar: '#ff8a1a', boots: '#3a2a1e', belt: '#5a8a3a', buckle: '#ff8a1a',
    mats: { pump: ['#ff7a14', { roughness: 0.55 }], rib: ['#e8640e', { roughness: 0.6 }], stem: ['#5a7a2a', { roughness: 0.9 }], glow: ['#ffd23a', { emissive: '#ffb000', emissiveIntensity: 2 }], vine: ['#3f8f2a', { roughness: 0.8 }] },
    parts: () => {
      const p = [['pump', sph(0.2, hm(0, 0.03, 0.0, 0, 0, 0, 1.12, 0.93, 1.08)), 'head']];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; p.push(['rib', sph(0.1, hm(Math.cos(a) * 0.135, 0.03, Math.sin(a) * 0.13, 0, -a, 0, 0.62, 1.72, 1)), 'head']); }
      for (const s of [1, -1]) p.push(['glow', cyl(0.042, 0.042, 0.02, hm(0.075 * s, 0.075, 0.205, HALF, 0, 0), 3), 'head']);
      p.push(['glow', cyl(0.024, 0.024, 0.02, hm(0, 0.025, 0.215, HALF, 0, 0), 3), 'head']);
      p.push(['glow', box(0.17, 0.034, 0.02, hm(0, -0.06, 0.19)), 'head']);
      for (const x of [-0.05, 0, 0.05]) p.push(['pump', box(0.018, 0.02, 0.026, hm(x, -0.051, 0.19)), 'head']);
      p.push(['stem', cyl(0.024, 0.035, 0.09, hm(0.01, 0.24, 0, 0.12, 0, 0.18), 8), 'head']);
      p.push(['vine', torus(0.045, 0.008, hm(0.06, 0.22, 0.0, 0, 0, 0.4), Math.PI * 1.3), 'head']);
      p.push(['vine', torus(0.1, 0.024, M(0, 1.5, -0.004, HALF)), 'chest']);
      p.push(['vine', cone(0.05, 0.1, M(0.05, 1.42, 0.1, Math.PI, 0, 0.3, 1, 1, 0.3), 6), 'chest']);
      return p;
    },
  },
  {
    id: 'mushroom', name: 'Mushroom Mage', rarity: 'epic', pack: 'garden', hair: 'long', desc: 'A wide spotted toadstool hat, glowing spores and a tiny mushroom friend on the shoulder.',
    color: '#f4ead2', belly: '#7a4a2a', sleeves: 'long', accent: '#e0302a', collar: '#e0302a', gloves: '#7a4a2a', boots: '#5a3a22', belt: '#e0302a', buckle: '#fff3d6',
    mats: { cap: ['#e0302a', { roughness: 0.45 }], spot: ['#fffaf2', { roughness: 0.6 }], gill: ['#f4dcb0', { roughness: 0.9, side: THREE.DoubleSide }], spore: ['#b8ff7a', { emissive: '#7aff3a', emissiveIntensity: 1.6 }], stalk: ['#fff3d6', { roughness: 0.8 }] },
    parts: () => {
      const p = [
        ['cap', sph(0.3, hm(0, 0.12, -0.01, 0, 0, 0, 1, 0.55, 1), Math.PI / 2), 'head'],
        ['gill', cyl(0.295, 0.295, 0.01, hm(0, 0.12, -0.01), 32), 'head'],
      ];
      for (const [th, ph, r] of [[0.3, 0.4, 0.045], [2.0, 0.55, 0.04], [3.6, 0.5, 0.05], [5.0, 0.6, 0.038], [1.2, 0.95, 0.035], [4.3, 1.0, 0.04], [0, 0.05, 0.04]]) {
        p.push(['spot', sph(r, hm(0.3 * Math.sin(ph) * Math.cos(th), 0.12 + 0.165 * Math.cos(ph), 0.3 * Math.sin(ph) * Math.sin(th) - 0.01, 0, 0, 0, 1, 0.5, 1)), 'head']);
      }
      for (const [x, y, z] of [[0.3, 0.02, 0.1], [-0.28, 0.08, -0.05], [0.2, -0.1, -0.2], [-0.18, 0.2, 0.2]]) p.push(['spore', star(0.016, hm(x, y, z)), 'head']);
      p.push(['stalk', cyl(0.025, 0.03, 0.08, M(0.17, 1.52, -0.02), 10), 'chest']);
      p.push(['cap', sph(0.065, M(0.17, 1.56, -0.02, 0, 0, 0, 1, 0.65, 1), Math.PI / 2), 'chest']);
      p.push(['spot', sph(0.014, M(0.19, 1.6, 0.01)), 'chest']);
      p.push(['spore', star(0.02, M(-0.24, 1.25, 0.12)), 'chest']);
      return p;
    },
  },
  {
    id: 'pineking', name: 'Pineapple King', rarity: 'legendary', pack: 'garden', hideHair: true, desc: 'A spiky pineapple helm under a gold crown, a ruby and a royal leaf cape.',
    color: '#ffcf2e', belly: '#7a5a1e', sleeves: 'long', gloves: '#ffcf2e', accent: '#3f9a3a', collar: '#3f9a3a', boots: '#7a5a1e', belt: '#3f9a3a', buckle: '#ffd447',
    mats: { skin: ['#e8a92a', { roughness: 0.6 }], diamond: ['#b8781a', { roughness: 0.7 }], leaf: ['#3faa3a', { side: THREE.DoubleSide, roughness: 0.6 }], crown: ['#ffd447', { metalness: 0.85, roughness: 0.25 }],
      gem: ['#ff3f6a', { emissive: '#ff1f4a', emissiveIntensity: 0.8 }], cape: ['#2f8a3a', { side: THREE.DoubleSide }], fur: ['#fff7ec', { roughness: 0.95 }] },
    parts: () => {
      const p = [
        ['skin', sph(0.178, hm(0, 0.04, -0.004, -0.1, 0, 0, 1, 1.05, 1.03), Math.PI * 0.5), 'head'],
        ['crown', torus(0.17, 0.016, hm(0, 0.1, -0.008, HALF - 0.1, 0, 0, 1, 1, 1.03)), 'head'],
        ['gem', star(0.026, hm(0, 0.13, 0.17, 0, 0, 0, 1, 1.2, 0.5)), 'head'],
        ['cape', box(0.4, 0.75, 0.012, M(0, 1.06, -0.16, 0.13)), 'chest'],
        ['fur', torus(0.11, 0.032, M(0, 1.49, -0.01, HALF)), 'chest'],
      ];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push(['crown', cone(0.022, 0.07, hm(Math.cos(a) * 0.16, 0.15, Math.sin(a) * 0.165 - 0.008, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2), 4), 'head']); }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + j * 0.35, ph = 0.55 + j * 0.4;
        p.push(['diamond', star(0.018, hm(0.178 * Math.sin(ph) * Math.cos(a), 0.04 + 0.187 * Math.cos(ph), 0.183 * Math.sin(ph) * Math.sin(a) - 0.004, 0, -a, 0, 1, 1.3, 0.5)), 'head']);
      }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(['leaf', cone(0.034, 0.24, hm(Math.cos(a) * 0.05, 0.33, Math.sin(a) * 0.05 - 0.01, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35, 1, 1, 0.3), 5), 'head']); }
      p.push(['leaf', cone(0.03, 0.28, hm(0, 0.36, -0.01, 0, 0, 0, 1, 1, 0.3), 5), 'head']);
      return p;
    },
  },
  {
    id: 'rainbowroot', name: 'Rainbow Root', rarity: 'mythic', pack: 'garden', hideHair: true, desc: 'A glowing radish crown with rainbow leaves, a rainbow arc behind your head and a shimmering suit.',
    color: '#ff4fd8', belly: '#7a3cff', glow: '#8a1aa8', sleeves: 'long', gloves: '#ffffff', accent: '#4ff0ff', collar: '#4ff0ff', shoes: '#ffffff', soles: '#ff4fd8', laces: '#4ff0ff', iris: '#4ff0ff', eyeGlow: '#4ff0ff',
    mats: {
      bulb: ['#ff3fb0', { roughness: 0.3, emissive: '#a0106a', emissiveIntensity: 0.6 }], root: ['#fff0f8', { roughness: 0.5 }],
      r1: ['#ff4f4f', { emissive: '#ff2020', emissiveIntensity: 0.9, side: THREE.DoubleSide }], r2: ['#ff9a2e', { emissive: '#ff7a00', emissiveIntensity: 0.9, side: THREE.DoubleSide }],
      r3: ['#ffe14f', { emissive: '#ffc800', emissiveIntensity: 0.9, side: THREE.DoubleSide }], r4: ['#5fe05a', { emissive: '#20c020', emissiveIntensity: 0.9, side: THREE.DoubleSide }],
      r5: ['#4fb8ff', { emissive: '#1a8aff', emissiveIntensity: 0.9, side: THREE.DoubleSide }], r6: ['#a86bff', { emissive: '#7a2aff', emissiveIntensity: 0.9, side: THREE.DoubleSide }],
      spark: ['#ffffff', { emissive: '#ffffff', emissiveIntensity: 1.6 }],
    },
    parts: () => {
      const p = [
        ['bulb', sph(0.18, hm(0, 0.05, -0.004, -0.1, 0, 0, 1, 1.05, 1.03), Math.PI * 0.5), 'head'],
        ['root', cone(0.012, 0.09, hm(0.16, -0.02, -0.06, 0, 0, -2.2), 6), 'head'],
      ];
      [-1, -0.6, -0.2, 0.2, 0.6, 1].forEach((a, i) => p.push([`r${i + 1}`, cone(0.045, 0.26, hm(Math.sin(a) * 0.1, 0.32 + Math.cos(a) * 0.04, -0.03, 0, 0, -a, 1, 1, 0.3), 6), 'head']));
      for (let i = 0; i < 6; i++) p.push([`r${6 - i}`, torus(0.2 + i * 0.024, 0.011, hm(0, -0.02, -0.23), Math.PI), 'head']);
      for (const [x, y, z, r] of [[0.33, 0.25, -0.2, 0.022], [-0.34, 0.2, -0.22, 0.018], [0.0, 0.42, -0.23, 0.02]]) p.push(['spark', star(r, hm(x, y, z)), 'head']);
      p.push(['spark', star(0.026, M(0.27, 1.3, 0.06)), 'chest']);
      p.push(['spark', star(0.02, M(-0.26, 1.12, -0.06)), 'chest']);
      return p;
    },
  },
  // ---- (0.76) The Bakery Box
  {
    id: 'croissant', name: 'Croissant Cowboy', rarity: 'uncommon', pack: 'bakery', hair: 'buzz', desc: 'A cowboy hat with a flaky croissant band and a red bandana.',
    color: '#c98a4b', belly: '#2e4a7a', sleeves: 'long', accent: '#e0302a', collar: '#e0302a', boots: '#6a4126', belt: '#5a3a22', buckle: '#ffd447', gloves: '#6a4126',
    mats: { hat: ['#a8703a', { roughness: 0.75 }], pastry: ['#e0a456', { roughness: 0.6 }], flake: ['#b8702e', { roughness: 0.8 }], bandana: ['#e0302a', { side: THREE.DoubleSide }], dot: ['#fff3d6'] },
    parts: () => {
      const p = [
        ['hat', ecyl(0.28, 0.25, 0.014, hm(0, 0.12, -0.004)), 'head'],
        ['hat', ecyl(0.13, 0.15, 0.13, hm(0, 0.19, -0.01)), 'head'],
        ['hat', sph(0.13, hm(0, 0.255, -0.01, 0, 0, 0, 1, 0.35, 1.15), Math.PI / 2), 'head'],
        ['pastry', torus(0.15, 0.03, hm(0, 0.15, -0.01, HALF, 0, 0, 1, 1.15, 1)), 'head'],
        ['bandana', torus(0.1, 0.026, M(0, 1.5, -0.004, HALF)), 'chest'],
        ['bandana', cone(0.075, 0.13, M(0, 1.42, 0.09, Math.PI, 0, 0, 1, 1, 0.4)), 'chest'],
      ];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; p.push(['flake', torus(0.032, 0.007, hm(Math.cos(a) * 0.15, 0.15, Math.sin(a) * 0.172 - 0.01, 0, -a, 0)), 'head']); }
      for (const [x, y] of [[0.03, 1.44], [-0.025, 1.4], [0.01, 1.37]]) p.push(['dot', sph(0.008, M(x, y, 0.118)), 'chest']);
      return p;
    },
  },
  {
    id: 'cupcake', name: 'Cupcake Cutie', rarity: 'uncommon', pack: 'bakery', hideHair: true, desc: 'A swirl of pink frosting with sprinkles and a cherry, and a cupcake-wrapper skirt.',
    color: '#ff9fc4', belly: '#7a4bb0', sleeves: 'short', accent: '#fff3d6', collar: '#fff3d6', shoes: '#fff3d6', soles: '#ff6fae', laces: '#7a4bb0',
    mats: { frost: ['#ffb3d4', { roughness: 0.35 }], frost2: ['#ff8fc0', { roughness: 0.35 }], cherry: ['#e0102a', { roughness: 0.2 }], stem: ['#5a7a2a'], wrap: ['#7fd6ff', { roughness: 0.6, side: THREE.DoubleSide }],
      s1: ['#4fd1ff'], s2: ['#ffe14f'], s3: ['#7cf06a'] },
    parts: () => {
      const p = [
        ['frost', sph(0.172, hm(0, 0.04, -0.004, -0.1, 0, 0, 1, 1, 1.03), Math.PI * 0.45), 'head'],
        ['frost2', torus(0.14, 0.05, hm(0, 0.13, -0.006, HALF)), 'head'],
        ['frost', torus(0.1, 0.046, hm(0, 0.2, -0.006, HALF)), 'head'],
        ['frost2', torus(0.06, 0.04, hm(0, 0.26, -0.006, HALF)), 'head'],
        ['frost', sph(0.045, hm(0, 0.3, -0.006)), 'head'],
        ['cherry', sph(0.036, hm(0, 0.37, -0.006)), 'head'],
        ['stem', cyl(0.004, 0.004, 0.06, hm(0.015, 0.42, -0.006, 0, 0, -0.4), 6), 'head'],
        ['wrap', new THREE.CylinderGeometry(0.29, 0.22, 0.2, 24, 1, true).applyMatrix4(M(0, 0.97, 0)), 'hips'],
      ];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.push(['wrap', box(0.012, 0.2, 0.012, M(Math.cos(a) * 0.255, 0.97, Math.sin(a) * 0.255, 0, -a, Math.sin(a) * 0.0 - 0.0)), 'hips']); }
      for (let i = 0; i < 12; i++) { const a = i * 2.4, r = 0.08 + (i % 3) * 0.03, y = 0.14 + (i % 4) * 0.035; p.push([`s${1 + (i % 3)}`, box(0.026, 0.008, 0.008, hm(Math.cos(a) * (0.17 - y * 0.35), y + 0.02, Math.sin(a) * (0.17 - y * 0.35) - 0.006, 0, a * 1.7, 0.4)), 'head']); }
      return p;
    },
  },
  {
    id: 'bagel', name: 'Bagel Baron', rarity: 'rare', pack: 'bakery', hair: 'buzz', desc: 'A top hat on a sesame-bagel brim, a gold monocle and a red bow tie.',
    color: '#2b2b35', belly: '#2b2b35', sleeves: 'long', accent: '#fff3d6', collar: '#fff3d6', gloves: '#fff3d6', boots: '#1d1a1f', belt: '#1d1a1f', buckle: '#c9a24a',
    mats: { bagel: ['#c98a3a', { roughness: 0.6 }], sesame: ['#fff3d6'], hat: ['#1d1a1f', { roughness: 0.4 }], band: ['#c98a3a'], gold: ['#ffd447', { metalness: 0.8, roughness: 0.25 }], bow: ['#e0302a'],
      glass: ['#bfe8ff', { metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.45 }] },
    parts: () => {
      const p = [
        ['bagel', torus(0.165, 0.045, hm(0, 0.13, -0.004, HALF, 0, 0, 1, 1.1, 1)), 'head'],
        ['hat', cyl(0.135, 0.135, 0.24, hm(0, 0.27, -0.01), 24), 'head'],
        ['band', cyl(0.138, 0.138, 0.035, hm(0, 0.18, -0.01), 24), 'head'],
        ['gold', torus(0.034, 0.006, hm(0.058, 0.014, 0.178)), 'head'],
        ['glass', cyl(0.031, 0.031, 0.004, hm(0.058, 0.014, 0.179, HALF)), 'head'],
        ['gold', cyl(0.002, 0.002, 0.16, hm(0.085, -0.07, 0.165, 0.1, 0, 0.25), 4), 'head'],
        ['bow', sph(0.022, M(0, 1.47, 0.115)), 'chest'],
      ];
      for (const s of [1, -1]) p.push(['bow', cone(0.035, 0.07, M(0.045 * s, 1.47, 0.11, 0, 0, s * HALF, 1, 1, 0.5), 4), 'chest']);
      for (let i = 0; i < 12; i++) { const a = i * 0.53; p.push(['sesame', sph(0.009, hm(Math.cos(a) * 0.165, 0.17, Math.sin(a) * 0.18 - 0.004, 0, a, 0, 1.6, 0.6, 1)), 'head']); }
      return p;
    },
  },
  {
    id: 'ginger', name: 'Gingerbread Guard', rarity: 'epic', pack: 'bakery', hideHair: true, hideBeard: true, desc: 'A gingerbread body with icing trim, a tall guard hat, gumdrop buttons and a candy cane.',
    tone: '#b8702e', color: '#b8702e', belly: '#b8702e', sleeves: 'long', gloves: '#b8702e', accent: '#fffaf2', collar: '#fffaf2', boots: '#fffaf2', belt: '#e0302a', buckle: '#7cf06a', lips: '#fffaf2',
    mats: { icing: ['#fffaf2', { roughness: 0.3 }], hat: ['#1d1a1f', { roughness: 0.95 }], red: ['#e0302a'], g1: ['#ff4f6a', { roughness: 0.2 }], g2: ['#4fd1ff', { roughness: 0.2 }], g3: ['#7cf06a', { roughness: 0.2 }] },
    parts: () => {
      const p = [
        ['hat', ecyl(0.165, 0.18, 0.3, hm(0, 0.2, -0.01)), 'head'],
        ['hat', sph(0.165, hm(0, 0.35, -0.01, 0, 0, 0, 1, 0.5, 1.09), Math.PI / 2), 'head'],
        ['icing', torus(0.168, 0.009, hm(0, 0.07, -0.01, HALF, 0, 0, 1, 1.09, 1)), 'head'],
        ['red', cone(0.03, 0.14, hm(0.15, 0.32, -0.01, 0, 0, -0.2)), 'head'],
        ['icing', torus(0.034, 0.005, hm(0.058, 0.07, 0.165, 0, 0, 0), Math.PI), 'head'],
        ['icing', torus(0.034, 0.005, hm(-0.058, 0.07, 0.165, 0, 0, 0), Math.PI), 'head'],
        ['red', cyl(0.018, 0.018, 0.5, M(0.06, 1.2, -0.16, 0, 0, 0.5), 8), 'chest'],
        ['red', torus(0.05, 0.018, M(-0.07, 1.42, -0.16, 0, 0, 0.5), Math.PI), 'chest'],
      ];
      [1.39, 1.3, 1.21].forEach((y, i) => p.push([`g${i + 1}`, sph(0.026, M(0, y, 0.13, 0, 0, 0, 1, 0.85, 0.7), Math.PI * 0.7), 'chest']));
      for (let i = 0; i < 5; i++) p.push(['icing', torus(0.019, 0.006, M(0.06 + Math.sin(0.5) * (i * 0.1 - 0.2), 1.2 - Math.cos(0.5) * (i * 0.1 - 0.2), -0.16, HALF, 0.5, 0)), 'chest']);
      return p;
    },
  },
  {
    id: 'cakeroyale', name: 'Cake Royale', rarity: 'legendary', pack: 'bakery', hair: 'long', desc: 'A three-tier birthday-cake crown with lit candles and pearls, and a frosting-pink royal cape.',
    color: '#ff9fc4', belly: '#fff3d6', sleeves: 'long', gloves: '#fff3d6', accent: '#ffd447', collar: '#ffd447', shoes: '#ffd447', soles: '#c98a4b', belt: '#ffd447', buckle: '#ff4f9a',
    mats: { tier1: ['#fff3d6', { roughness: 0.5 }], tier2: ['#ff9fc4', { roughness: 0.45 }], drip: ['#ff6fae', { roughness: 0.3 }], candle: ['#7fd6ff'], flame: ['#ffcf3a', { emissive: '#ff9a00', emissiveIntensity: 2 }],
      gold: ['#ffd447', { metalness: 0.8, roughness: 0.25 }], cape: ['#ff6fae', { side: THREE.DoubleSide }], pearl: ['#fffaf2', { roughness: 0.2, metalness: 0.2 }] },
    parts: () => {
      const p = [
        ['tier1', cyl(0.16, 0.16, 0.07, hm(0, 0.17, -0.004), 28), 'head'],
        ['drip', torus(0.158, 0.013, hm(0, 0.205, -0.004, HALF)), 'head'],
        ['tier2', cyl(0.12, 0.12, 0.06, hm(0, 0.235, -0.004), 28), 'head'],
        ['drip', torus(0.118, 0.012, hm(0, 0.265, -0.004, HALF)), 'head'],
        ['tier1', cyl(0.08, 0.08, 0.05, hm(0, 0.29, -0.004), 24), 'head'],
        ['cape', box(0.42, 0.76, 0.012, M(0, 1.06, -0.16, 0.13)), 'chest'],
        ['gold', torus(0.105, 0.016, M(0, 1.49, -0.01, -HALF), Math.PI), 'chest'],
        ['gold', star(0.034, M(0, 1.42, 0.13, 0, 0, 0, 1, 1, 0.35)), 'chest'],
      ];
      for (const [x, z] of [[0, 0.04], [0.045, -0.03], [-0.045, -0.03]]) {
        p.push(['candle', cyl(0.009, 0.009, 0.06, hm(x, 0.345, z - 0.004), 8), 'head']);
        p.push(['flame', cone(0.011, 0.03, hm(x, 0.39, z - 0.004), 8), 'head']);
      }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.push(['pearl', sph(0.014, hm(Math.cos(a) * 0.162, 0.137, Math.sin(a) * 0.162 - 0.004)), 'head']); }
      return p;
    },
  },
  {
    id: 'cosmiccookie', name: 'Cosmic Cookie', rarity: 'mythic', pack: 'bakery', desc: 'A giant choc-chip cookie halo ringed like a planet, a starlit glowing suit and orbiting crumbs.',
    color: '#1c1240', belly: '#130c30', glow: '#4a2fd0', sleeves: 'long', gloves: '#1c1240', accent: '#ff9a3c', collar: '#ff9a3c', shoes: '#ff9a3c', soles: '#1c1240', belt: '#ff9a3c', buckle: '#ffe27a', iris: '#ff9a3c', eyeGlow: '#ffb050',
    mats: { cookie: ['#d99a52', { roughness: 0.75, emissive: '#5a3000', emissiveIntensity: 0.35 }], chip: ['#3a1f12', { roughness: 0.6 }], ring: ['#9a7aff', { emissive: '#6a3aff', emissiveIntensity: 1.4 }],
      star: ['#ffffff', { emissive: '#ffcf8a', emissiveIntensity: 1.8 }] },
    parts: () => {
      const p = [
        ['cookie', cyl(0.26, 0.26, 0.03, hm(0, 0.04, -0.25, HALF, 0, 0), 32), 'head'],
        ['ring', torus(0.37, 0.009, hm(0, 0.04, -0.25, 0.25, 0, 0.35)), 'head'],
        ['ring', torus(0.33, 0.006, hm(0, 0.04, -0.25, 0.25, 0, 0.35)), 'head'],
      ];
      for (const [x, y] of [[0.1, 0.12], [-0.12, 0.08], [0.02, -0.1], [-0.05, 0.18], [0.16, -0.06], [-0.17, -0.08], [0.07, 0.0], [-0.03, -0.18], [0.18, 0.1]]) p.push(['chip', sph(0.026, hm(x, 0.04 + y, -0.232, 0, 0, 0, 1, 1, 0.45)), 'head']);
      for (const [x, y, z, r] of [[0.3, 0.3, -0.1, 0.022], [-0.32, 0.25, -0.1, 0.018], [0.25, -0.2, 0.05, 0.016]]) p.push(['star', star(r, hm(x, y, z)), 'head']);
      for (const [x, y, z] of [[0.28, 1.28, 0.05], [-0.27, 1.12, -0.08]]) p.push(['cookie', cyl(0.035, 0.035, 0.012, M(x, y, z, HALF, 0, 0.4), 12), 'chest']);
      p.push(['star', star(0.022, M(0.05, 1.0, 0.18)), 'hips']);
      return p;
    },
  },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
// (0.76) Skin boxes, Blooket style: pay a box's price, get one of its skins at random (odds by rarity, in
// coins.js); a skin you already have pays some coins back. icon: a food whose picture is on the box.
export const PACKS = [
  { id: 'snack', name: 'Snack Box', price: 350, icon: 'cheese', color: '#ff8a3c', color2: '#c8281e', desc: 'Fast-food favourites.' },
  { id: 'garden', name: 'Garden Box', price: 400, icon: 'carrot', color: '#5fce3e', color2: '#1f6a2a', desc: 'Fresh from the veg patch, with a Mythic hiding in it.' },
  { id: 'bakery', name: 'Bakery Box', price: 400, icon: 'cookie', color: '#ff9fc4', color2: '#9a5a2a', desc: 'Warm from the oven, with a Mythic hiding in it.' },
];

// Built once per skin: one merged geometry + material per (bone, material), in that bone's space.
const OUTFIT_CACHE = new Map();
function outfitParts(skin) {
  if (OUTFIT_CACHE.has(skin.id)) return OUTFIT_CACHE.get(skin.id);
  const list = [];
  if (skin.parts) {
    const groups = {};
    for (const [key, g, anchor] of skin.parts()) {
      const bone = anchor || 'chest';
      const r = BONE_REST[bone];
      g.translate(-r.x, -r.y, -r.z);
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      (groups[`${bone}|${key}`] ||= []).push(g.index ? g.toNonIndexed() : g);
    }
    const mats = {};
    for (const [k, geos] of Object.entries(groups)) {
      const [bone, key] = k.split('|');
      if (!mats[key]) { const [color, opts = {}] = skin.mats[key]; mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts }); }
      list.push([bone, mergeGeometries(geos), mats[key]]);
    }
  }
  OUTFIT_CACHE.set(skin.id, list);
  return list;
}

// Fresh groups per bone ({ head, chest, hips }) with this skin's costume pieces.
export function makeOutfit(id) {
  const out = {};
  const skin = SKIN_BY_ID[id];
  if (!skin) return out;
  for (const [bone, geo, mat] of outfitParts(skin)) {
    const m = new THREE.Mesh(geo, mat);
    if (mat.transparent) { m.renderOrder = 3; m.castShadow = false; }
    (out[bone] ||= new THREE.Group()).add(m);
  }
  return out;
}

// Dress a HumanRig: body palette, hair, chef hat and costume pieces.
// who: the person underneath ({ tone, hairColor, hairStyle, iris, shoes, beard, baseColor }).
export function dress(rig, id, who) {
  const s = SKIN_BY_ID[id] || SKIN_BY_ID.chef;
  const shirt = s.color || who.baseColor;
  rig.setLook({
    tone: s.tone || who.tone, shirt, accent: s.accent, collar: s.collar, sleeves: s.sleeves || 'short', gloves: s.gloves,
    pants: s.belly || '#35486e', boots: s.boots, belt: s.belt, buckle: s.buckle, shoes: s.shoes || who.shoes, soles: s.soles, laces: s.laces,
    hair: who.hairColor, iris: s.iris || who.iris, lips: s.lips, glow: s.glow, eyeGlow: s.eyeGlow, rm: s.rm,
  });
  let hair = s.hideHair ? null : s.hair || who.hairStyle;
  if (hair === 'afro' && s.parts && s.id !== 'chef' && s.id !== 'galaxy') hair = 'curly'; // headbands, masks and ears need smaller hair
  rig.setHair(hair, s.hideBeard ? null : who.beard, who.hairColor);
  rig.chefHat.visible = !!s.hat;
  rig.setOutfit(makeOutfit(s.id));
  return shirt;
}

export function randomSkinId() { return SKINS[(Math.random() * SKINS.length) | 0].id; }
