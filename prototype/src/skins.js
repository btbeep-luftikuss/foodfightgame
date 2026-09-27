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
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

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
