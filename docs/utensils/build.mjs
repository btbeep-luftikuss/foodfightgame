// Utensil Buffers: the 20 support utensils as cartoon game assets.
// Run `node docs/utensils/build.mjs` to write one transparent SVG per utensil into docs/utensils/svg/.
//
// Style rules shared by every asset: 400x400, transparent background, a deep-plum ink outline,
// glossy gradients with white highlights, a cartoon face on the utensil, and the loaded food
// always drawn as itself (same food art as the game) with the utensil's change shown on it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INK = '#2b1633';
const f = (n) => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ svg building blocks
class Doc {
  constructor(prefix) { this.p = prefix; this.n = 0; this.defs = []; }
  id() { return `${this.p}${++this.n}`; }
  stops(s) { return s.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a !== 1 ? ` stop-opacity="${a}"` : ''}/>`).join(''); }
  lin(s, x2 = 0, y2 = 1, x1 = 0, y1 = 0) {
    const id = this.id();
    this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${this.stops(s)}</linearGradient>`);
    return `url(#${id})`;
  }
  rad(s, cx = 0.36, cy = 0.3, r = 0.8) {
    const id = this.id();
    this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${this.stops(s)}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(inner) {
    const id = this.id();
    this.defs.push(`<clipPath id="${id}">${inner}</clipPath>`);
    return `url(#${id})`;
  }
}
const st = (o) => (o.none ? '' : ` stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 5}" stroke-linejoin="round" stroke-linecap="round"`);
const ex = (o) => (o.op != null ? ` opacity="${o.op}"` : '') + (o.fop != null ? ` fill-opacity="${o.fop}"` : '') + (o.dash ? ` stroke-dasharray="${o.dash}"` : '') + (o.clip ? ` clip-path="${o.clip}"` : '');
const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${st(o)}${ex(o)}/>`;
const C = (cx, cy, r, fill, o = {}) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${st(o)}${ex(o)}/>`;
const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${o.rot ? ` transform="rotate(${f(o.rot)} ${f(cx)} ${f(cy)})"` : ''} fill="${fill}"${st(o)}${ex(o)}/>`;
const R = (x, y, w, h, rx, fill, o = {}) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}"${st(o)}${ex(o)}/>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 4}" stroke-linecap="round"${ex(o)}/>`;
const G = (t, ...k) => `<g${t ? ` transform="${t}"` : ''}>${k.flat(Infinity).join('')}</g>`;
const GA = (attrs, ...k) => `<g ${attrs}>${k.flat(Infinity).join('')}</g>`;
const T = (x, y, rot = 0, s = 1, sy = s) => `translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}${s !== 1 || sy !== s ? ` scale(${f(s)}${sy !== s ? ` ${f(sy)}` : ''})` : ''}`;
const shine = (d, op = 0.62) => P(d, '#fff', { none: true, op });
const shadow = (cx, cy, rx, ry = rx * 0.15) => E(cx, cy, rx, ry, INK, { none: true, op: 0.13 });
// a coloured stroke with an ink outline around it
const ostroke = (d, color, w, o = {}) => P(d, 'none', { sw: w + 6, ...o }) + P(d, 'none', { ...o, stroke: color, sw: w });
function starPts(cx, cy, n, R, r, rot = -90, sy = 1) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180, rr = i % 2 ? r : R;
    pts.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr * sy)}`);
  }
  return `M${pts.join(' L')} Z`;
}
const burst = (x, y, R, r, n, fill, o = {}) => P(starPts(x, y, n, R, r, o.rot ?? -90), fill, { sw: o.sw ?? 4, ...o });
const sparkle = (x, y, s, fill = '#fff6b0', sw = 3) => P(`M${f(x)},${f(y - s)} Q${f(x + s * 0.16)},${f(y - s * 0.16)} ${f(x + s)},${f(y)} Q${f(x + s * 0.16)},${f(y + s * 0.16)} ${f(x)},${f(y + s)} Q${f(x - s * 0.16)},${f(y + s * 0.16)} ${f(x - s)},${f(y)} Q${f(x - s * 0.16)},${f(y - s * 0.16)} ${f(x)},${f(y - s)} Z`, fill, { sw });
// a puffy cloud: every blob outlined, then all fills on top so the outline only shows outside
function cloud(x, y, r, fill, blobs, sw = 4.5, op = 1) {
  const a = blobs.map(([dx, dy, rr]) => C(x + dx * r, y + dy * r, rr * r, fill, { sw }));
  const b = blobs.map(([dx, dy, rr]) => C(x + dx * r, y + dy * r, rr * r, fill, { none: true }));
  return GA(`opacity="${op}"`, a, b);
}
const PUFF = [[0, 0, 0.62], [-0.55, 0.12, 0.45], [0.55, 0.14, 0.46], [-0.22, -0.38, 0.42], [0.28, -0.34, 0.44], [0.02, 0.32, 0.45]];
function flame(x, y, s, rot = 0, cool = false) {
  const outer = cool ? '#5fc2ff' : '#ff5a1f', mid = cool ? '#bff0ff' : '#ffc23a', core = cool ? '#ffffff' : '#fff3b0';
  return G(T(x, y, rot, s),
    P('M0,30 C-24,30 -30,8 -20,-8 C-14,-18 -12,-28 -4,-42 C-2,-27 8,-22 10,-35 C23,-18 27,0 22,13 C18,26 10,30 0,30 Z', outer, { sw: 4 / s }),
    P('M0,26 C-14,26 -18,12 -10,0 C-6,-6 -4,-14 0,-21 C2,-10 8,-8 10,-15 C16,-2 16,10 12,18 C8,24 4,26 0,26 Z', mid, { none: true }),
    P('M0,24 C-7,24 -8,15 -4,8 C-2,4 0,0 2,-5 C4,4 8,6 8,12 C8,20 4,24 0,24 Z', core, { none: true }));
}
const drop = (x, y, s, fill, rot = 0) => G(T(x, y, rot, s),
  P('M0,-13 Q8,-1 7,6 A7,7 0 1 1 -7,6 Q-8,-1 0,-13 Z', fill, { sw: 3 / s }),
  shine('M-3,2 Q-2,-3 0,-6 Q-0.5,-1 -3,2 Z', 0.75));
const bubble = (x, y, r) => C(x, y, r, '#ffffff', { sw: 2.5, fop: 0.35 }) + C(x - r * 0.35, y - r * 0.35, r * 0.25, '#fff', { none: true });
function snowflake(x, y, s) {
  const arms = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3, c = Math.cos(a) * s, d = Math.sin(a) * s;
    arms.push(`M${f(x - c)},${f(y - d)} L${f(x + c)},${f(y + d)}`);
    for (const k of [-1, 1]) {
      const bx = x + c * 0.55 * k, by = y + d * 0.55 * k, b = 0.35 * s;
      const a1 = a + (k > 0 ? 0 : Math.PI);
      arms.push(`M${f(bx)},${f(by)} L${f(bx + Math.cos(a1 + 0.7) * b)},${f(by + Math.sin(a1 + 0.7) * b)} M${f(bx)},${f(by)} L${f(bx + Math.cos(a1 - 0.7) * b)},${f(by + Math.sin(a1 - 0.7) * b)}`);
    }
  }
  return ostroke(arms.join(' '), '#ffffff', 2.6, { sw: 2.6 });
}
const speed = (x1, y1, x2, y2, w = 4, op = 0.85) => L(x1, y1, x2, y2, { sw: w, op });
const arrowHead = (x, y, ang, s = 12, fill = INK) => {
  const a = (ang * Math.PI) / 180, b = 0.5;
  return P(`M${f(x)},${f(y)} L${f(x - Math.cos(a - b) * s)},${f(y - Math.sin(a - b) * s)} L${f(x - Math.cos(a + b) * s)},${f(y - Math.sin(a + b) * s)} Z`, fill, { sw: 2.5 });
};

// ------------------------------------------------------------------ faces (every utensil has one)
function face(x, y, s = 1, mood = 'happy', o = {}) {
  const [lx, ly] = o.look || [0, 0];
  const body = o.body || '#ffffff';
  const k = [];
  const eye = (cx, rx = 8.5, ry = 10.5, pr = 4.6) => {
    k.push(E(cx, 0, rx, ry, '#fff', { sw: 3.2 }));
    k.push(C(cx + lx, 1 + ly, pr, INK, { none: true }));
    k.push(C(cx + lx - pr * 0.35, 1 + ly - pr * 0.4, pr * 0.36, '#fff', { none: true }));
  };
  const cheeks = (op = 0.55) => { k.push(E(-22, 12, 5.5, 3.2, '#ff6f9f', { none: true, op }), E(22, 12, 5.5, 3.2, '#ff6f9f', { none: true, op })); };
  const tongueMouth = (w = 10, h = 26) => {
    k.push(P(`M${-w},12 Q0,${h} ${w},12 Z`, INK, { sw: 3 }));
    k.push(E(1.5, 12 + (h - 12) * 0.55, w * 0.42, (h - 12) * 0.22, '#ff6f8f', { none: true }));
  };
  switch (mood) {
    case 'fierce':
      eye(-13); eye(13);
      k.push(P('M-23,-17 L-5,-10', 'none', { sw: 4.2 }), P('M23,-17 L5,-10', 'none', { sw: 4.2 }));
      k.push(P('M-11,12 Q0,25 11,12 Z', INK, { sw: 3 }), P('M-9,13 L9,13 L8,16.5 L-8,16.5 Z', '#fff', { none: true }));
      break;
    case 'goofy':
      eye(-13, 9.5, 12, 5); eye(13, 7, 8.5, 3.6);
      tongueMouth(9, 25); cheeks();
      break;
    case 'sly':
      eye(-13); eye(13);
      k.push(P('M-21.5,-3 A8.5,10.5 0 0 1 -4.5,-3 Z', body, { sw: 3.2 }), P('M4.5,-3 A8.5,10.5 0 0 1 21.5,-3 Z', body, { sw: 3.2 }));
      k.push(P('M-22,-17 Q-14,-21 -6,-17', 'none', { sw: 3.5 }), P('M6,-21 Q14,-25 22,-19', 'none', { sw: 3.5 }));
      k.push(P('M-7,15 Q3,20 12,11', 'none', { sw: 3.4 }));
      break;
    case 'dizzy':
      for (const cx of [-13, 13]) {
        k.push(E(cx, 0, 8.5, 10.5, '#fff', { sw: 3.2 }));
        k.push(P(`M${cx},1 a2,2 0 1 1 3,-1 a4,4 0 1 1 -7,1 a6,6 0 1 1 11,-1`, 'none', { sw: 2.4 }));
      }
      k.push(P('M-10,16 Q-5,11 0,16 Q5,21 10,16', 'none', { sw: 3.2 }), E(5, 19, 3.5, 3, '#ff6f8f', { sw: 2 }));
      break;
    case 'wild':
      eye(-13, 10, 12.5, 3.2); eye(13, 10, 12.5, 3.2);
      k.push(P('M-23,-19 L-6,-16', 'none', { sw: 3.6 }), P('M23,-19 L6,-16', 'none', { sw: 3.6 }));
      tongueMouth(12, 32);
      break;
    case 'smug':
      eye(-13); eye(13);
      k.push(P('M-21.5,-1 A8.5,10.5 0 0 1 -4.5,-1 Z', body, { sw: 3.2 }), P('M4.5,-1 A8.5,10.5 0 0 1 21.5,-1 Z', body, { sw: 3.2 }));
      k.push(P('M-8,14 Q2,19 11,10', 'none', { sw: 3.4 }));
      cheeks(0.4);
      break;
    case 'grit':
      eye(-13); eye(13);
      k.push(P('M-23,-15 L-5,-9', 'none', { sw: 4.2 }), P('M23,-15 L5,-9', 'none', { sw: 4.2 }));
      k.push(R(-11, 10, 22, 10, 3, '#fff', { sw: 3 }), L(-3.7, 10, -3.7, 20, { sw: 2 }), L(3.7, 10, 3.7, 20, { sw: 2 }), L(-11, 15, 11, 15, { sw: 2 }));
      break;
    case 'wink':
      eye(-13);
      k.push(P('M5,1 Q13,-8 21,1', 'none', { sw: 3.6 }), P('M-22,-16 Q-14,-21 -6,-16', 'none', { sw: 3.4 }));
      tongueMouth(10, 25); cheeks(0.45);
      break;
    case 'sweat':
      eye(-13); eye(13);
      k.push(P('M-21,-12 L-6,-18', 'none', { sw: 3.6 }), P('M21,-12 L6,-18', 'none', { sw: 3.6 }));
      k.push(P('M-9,16 Q-4.5,12 0,16 Q4.5,20 9,16', 'none', { sw: 3.2 }));
      k.push(drop(28, -6, 1, '#7ad0ff'));
      break;
    case 'grumpy':
      eye(-13, 8.5, 9.5); eye(13, 8.5, 9.5);
      k.push(P('M-24,-11 Q-14,-21 -3,-12', 'none', { sw: 6.5, stroke: '#f2efe8' }), P('M24,-11 Q14,-21 3,-12', 'none', { sw: 6.5, stroke: '#f2efe8' }));
      k.push(P('M-24,-11 Q-14,-21 -3,-12', 'none', { sw: 2 }), P('M24,-11 Q14,-21 3,-12', 'none', { sw: 2 }));
      k.push(P('M-9,18 Q0,11 9,18', 'none', { sw: 3.4 }));
      break;
    case 'cheer':
      k.push(P('M-21,2 Q-13,-9 -5,2', 'none', { sw: 3.8 }), P('M5,2 Q13,-9 21,2', 'none', { sw: 3.8 }));
      tongueMouth(11, 28); cheeks(0.6);
      break;
    case 'focus':
      for (const cx of [-13, 13]) { k.push(E(cx, 1, 8.5, 5.2, '#fff', { sw: 3.2 }), C(cx + lx, 1.5, 3.4, INK, { none: true })); }
      k.push(P('M-23,-9 L-5,-7', 'none', { sw: 4 }), P('M23,-9 L5,-7', 'none', { sw: 4 }));
      k.push(P('M-6,15 L6,14', 'none', { sw: 3.4 }));
      break;
    case 'dreamy':
      k.push(P('M-21,-1 Q-13,7 -5,-1', 'none', { sw: 3.6 }), P('M5,-1 Q13,7 21,-1', 'none', { sw: 3.6 }));
      k.push(P('M-21,-1 L-24,-5 M-17,2.5 L-19,-3 M21,-1 L24,-5 M17,2.5 L19,-3', 'none', { sw: 2.4 }));
      k.push(P('M-5,14 Q0,18 5,14', 'none', { sw: 3.2 }));
      cheeks(0.75);
      break;
    case 'excited':
      eye(-13, 9.5, 12, 5.6); eye(13, 9.5, 12, 5.6);
      k.push(C(-10, 5, 1.6, '#fff', { none: true }), C(16, 5, 1.6, '#fff', { none: true }));
      tongueMouth(12, 30); cheeks(0.6);
      break;
    case 'determined':
      eye(-13); eye(13);
      k.push(P('M-23,-14 L-5,-11', 'none', { sw: 4.2 }), P('M23,-14 L5,-11', 'none', { sw: 4.2 }));
      k.push(P('M-9,13 Q0,20 9,13', 'none', { sw: 3.5 }));
      break;
    default: // happy
      eye(-13); eye(13);
      k.push(P('M-8,14 Q0,22 8,14', 'none', { sw: 3.4 }));
      cheeks();
  }
  return G(T(x, y, o.rot || 0, s), k);
}

// ------------------------------------------------------------------ the foods (same cast as the game)
function tomato(d, x, y, r, rot = 0, o = {}) {
  const body = d.rad([[0, o.light || '#ff9c82'], [0.5, o.mid || '#f2391f'], [1, o.dark || '#a9140b']], 0.34, 0.3, 0.85);
  const sw = clamp(r * 0.085, 2.5, 5);
  return G(T(x, y, rot),
    E(0, 0, r, r * 0.9, body, { sw }),
    P(starPts(0, -r * 0.74, 5, r * 0.46, r * 0.15, -90, 0.5), '#4cb944', { sw: sw * 0.9 }),
    P(`M0,${f(-r * 0.76)} Q${f(r * 0.04)},${f(-r * 0.92)} ${f(r * 0.14)},${f(-r * 1.0)}`, 'none', { sw: sw * 0.95, stroke: '#2d7a32' }),
    E(-r * 0.4, -r * 0.3, r * 0.26, r * 0.13, '#fff', { none: true, rot: -35, op: 0.75 }),
    E(r * 0.45, r * 0.34, r * 0.1, r * 0.06, '#fff', { none: true, rot: -35, op: 0.35 }));
}
function tomatoChunk(d, x, y, s = 1, rot = 0) {
  return G(T(x, y, rot, s),
    P('M-17,-12 Q-2,-23 15,-14 Q22,-2 14,12 Q-2,21 -16,11 Q-23,0 -17,-12 Z', '#e8321f', { sw: 3.6 / s }),
    P('M-11,-7 Q-1,-14 9,-8 Q14,0 8,8 Q-2,13 -10,6 Q-15,0 -11,-7 Z', '#ff8f78', { none: true }),
    E(-4, -2, 2.8, 1.7, '#ffe49a', { none: true, rot: 30 }), E(3.5, 3, 2.8, 1.7, '#ffe49a', { none: true, rot: -20 }), E(-3, 5, 2.4, 1.5, '#ffe49a', { none: true }),
    shine('M-14,-9 Q-6,-17 6,-15 Q-4,-12 -14,-9 Z', 0.7));
}
function banana(d, x, y, s = 1, rot = 0, o = {}) {
  const fill = d.lin([[0, o.light || '#fff07a'], [1, o.dark || '#f2b705']]);
  return G(T(x, y, rot, s),
    P('M-60,-14 C-44,30 34,36 62,-20 L56,-8 C30,-2 -36,-4 -56,-6 Q-62,-8 -60,-14 Z', fill, { sw: 4.5 / s }),
    P('M-50,-2 Q-2,36 52,-8', 'none', { stroke: o.ridge || '#e0a100', sw: 2.6 / s }),
    P('M-48,-4 Q-4,8 48,-10', 'none', { stroke: '#fff', sw: 3 / s, op: 0.55 }),
    P('M58,-20 L70,-30 L74,-25 L63,-14 Z', '#8a5a2b', { sw: 3.5 / s }),
    E(-60, -9, 4, 4.5, '#5a3a1e', { sw: 2.5 / s }));
}
function blueberry(d, x, y, r, o = {}) {
  const body = d.rad([[0, '#9aa5ff'], [0.55, '#4548c8'], [1, '#232170']], 0.35, 0.3, 0.8);
  const sw = clamp(r * 0.14, 2.2, 4.5);
  return G(T(x, y, o.rot || 0),
    C(0, 0, r, body, { sw }),
    P(starPts(r * 0.12, -r * 0.42, 5, r * 0.34, r * 0.13, -90, 0.7), '#2c2a78', { sw: sw * 0.6, stroke: '#191650' }),
    E(-r * 0.42, -r * 0.18, r * 0.22, r * 0.13, '#fff', { none: true, rot: -40, op: 0.7 }));
}
function grape(d, x, y, r) {
  const body = d.rad([[0, '#d79cf2'], [0.5, '#8d43c4'], [1, '#4c1c70']], 0.35, 0.3, 0.8);
  return G(T(x, y), C(0, 0, r, body, { sw: clamp(r * 0.14, 2.2, 4.5) }), E(-r * 0.38, -r * 0.35, r * 0.24, r * 0.14, '#fff', { none: true, rot: -40, op: 0.72 }));
}
function pineapple(d, x, y, s = 1, rot = 0, o = {}) {
  const body = d.lin([[0, o.light || '#ffd85a'], [1, o.dark || '#e8951a']], 0.4, 1);
  const clip = d.clip(E(0, 12, 40, 54, '#fff', { none: true }));
  const lines = [];
  for (let i = -6; i <= 6; i++) lines.push(`M${i * 16 - 60},-50 L${i * 16 + 60},80 M${i * 16 + 60},-50 L${i * 16 - 60},80`);
  const leaf = (rotL, len, w, shade) => G(T(0, -38, rotL), P(`M0,6 Q${-w},${-len * 0.5} 0,${-len} Q${w},${-len * 0.5} 0,6 Z`, shade, { sw: 4 / s }));
  return G(T(x, y, rot, s),
    leaf(-42, 46, 11, '#3ea53f'), leaf(42, 46, 11, '#3ea53f'), leaf(-18, 58, 12, '#4fc24a'), leaf(18, 58, 12, '#4fc24a'), leaf(0, 68, 13, '#5ed357'),
    E(0, 12, 40, 54, body, { sw: 4.5 / s }),
    P(lines.join(' '), 'none', { stroke: o.pattern || '#b8741a', sw: 2.6 / s, clip }),
    E(0, 12, 40, 54, 'none', { sw: 4.5 / s }),
    E(-16, -8, 8, 18, '#fff', { none: true, rot: 18, op: 0.45 }));
}
function cookie(d, x, y, r, o = {}) {
  const fill = d.rad([[0, o.light || '#f6cf8c'], [0.6, o.mid || '#d8964e'], [1, o.dark || '#a9662c']], 0.38, 0.32, 0.85);
  const n = 16, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (i % 2 ? 0.95 : 1.02);
    pts.push(`${f(Math.cos(a) * rr)},${f(Math.sin(a) * rr)}`);
  }
  const chips = [[-0.35, -0.3, 0.16], [0.3, -0.38, 0.13], [0.42, 0.18, 0.15], [-0.1, 0.1, 0.12], [-0.42, 0.38, 0.13], [0.12, 0.5, 0.11], [0.05, -0.62, 0.09]];
  return G(T(x, y, o.rot || 0, 1, o.sy ?? 1),
    o.edge ? E(0, r * 0.22, r * 1.02, r * 1.0, o.edge, { sw: 4.5 }) : '',
    P(`M${pts.join(' L')} Z`, fill, { sw: clamp(r * 0.1, 2.5, 4.5) }),
    chips.map(([cx, cy, cr]) => P(`M${f(cx * r - cr * r)},${f(cy * r)} Q${f(cx * r)},${f(cy * r - cr * r * 1.2)} ${f(cx * r + cr * r)},${f(cy * r)} Q${f(cx * r)},${f(cy * r + cr * r)} ${f(cx * r - cr * r)},${f(cy * r)} Z`, '#5a321c', { none: true })),
    E(-r * 0.35, -r * 0.45, r * 0.25, r * 0.12, '#fff', { none: true, rot: -25, op: 0.45 }));
}
function cheeseWheel(d, x, y, r, o = {}) {
  const fill = d.rad([[0, o.light || '#fff2a0'], [0.6, o.mid || '#ffd23a'], [1, o.dark || '#eda500']], 0.36, 0.3, 0.85);
  const holes = [[-0.35, -0.3, 0.17], [0.32, -0.42, 0.11], [0.4, 0.2, 0.19], [-0.15, 0.35, 0.13], [-0.55, 0.22, 0.09], [0.05, -0.02, 0.08]];
  return G(T(x, y, o.rot || 0),
    C(0, 0, r, fill, { sw: clamp(r * 0.09, 2.5, 5) }),
    C(0, 0, r * 0.86, 'none', { stroke: o.rind || '#f0a800', sw: r * 0.07 }),
    holes.map(([hx, hy, hr]) => E(hx * r, hy * r, hr * r, hr * r * 0.85, o.hole || '#e09a00', { none: true }) + E(hx * r + hr * r * 0.2, hy * r + hr * r * 0.18, hr * r * 0.6, hr * r * 0.5, o.holeDeep || '#c98400', { none: true })),
    E(-r * 0.38, -r * 0.5, r * 0.3, r * 0.12, '#fff', { none: true, rot: -25, op: 0.55 }));
}
function cheeseWedge(d, x, y, s = 1, rot = 0, o = {}) {
  const top = o.top || '#ffe680', front = o.front || '#ffcb2f', side = o.side || '#f0ad00';
  return G(T(x, y, rot, s),
    P('M-52,-4 L48,-26 L40,10 Z', top, { sw: 4.5 / s }),
    P('M-52,-4 L40,10 L40,38 L-52,24 Z', front, { sw: 4.5 / s }),
    P('M40,10 L48,-26 L48,4 L40,38 Z', side, { sw: 4.5 / s }),
    E(-24, 13, 7, 5, o.hole || '#e09a00', { none: true }), E(8, 22, 9, 6, o.hole || '#e09a00', { none: true }), E(26, 12, 5, 4, o.hole || '#e09a00', { none: true }),
    E(-12, -6, 6, 3, o.hole || '#e09a00', { none: true }),
    shine('M-40,-4 L30,-19 L28,-15 L-36,-1 Z', 0.55),
    o.extra || '');
}
function carrot(d, x, y, len, rot = 0, o = {}) {
  const w = len * 0.17;
  const body = d.lin([[0, '#ffbe6a'], [1, '#f0661a']], 0, 1);
  const leaf = (lr, ll) => G(T(0, 0, lr), P(`M0,0 Q${-ll * 0.5},${-ll * 0.22} ${-ll},0 Q${-ll * 0.5},${ll * 0.22} 0,0 Z`, '#4fc24a', { sw: 3.5 }));
  return G(T(x, y, rot),
    o.noLeaves ? '' : [leaf(-28, len * 0.32), leaf(28, len * 0.32), leaf(0, len * 0.4)],
    P(`M0,${f(-w)} Q${f(len * 0.5)},${f(-w * 0.8)} ${f(len)},0 Q${f(len * 0.5)},${f(w * 0.8)} 0,${f(w)} Q${f(-w * 0.35)},0 0,${f(-w)} Z`, body, { sw: clamp(len * 0.04, 2.5, 4.5) }),
    [0.24, 0.44, 0.64].map((t) => P(`M${f(len * t)},${f(-w * (1 - t) * 0.75)} Q${f(len * t + 6)},0 ${f(len * t)},${f(w * (1 - t) * 0.3)}`, 'none', { stroke: '#c94f0f', sw: 2.4 })),
    P(`M${f(len * 0.06)},${f(-w * 0.55)} Q${f(len * 0.45)},${f(-w * 0.6)} ${f(len * 0.85)},${f(-w * 0.12)}`, 'none', { stroke: '#fff', sw: 3, op: 0.55 }));
}
function jelly(d, x, y, s = 1, rot = 0, o = {}) {
  const front = o.front || '#79e06f', top = o.top || '#b8f7a6', side = o.side || '#4dbf55';
  return G(T(x, y, rot, s),
    P('M-30,-14 L32,-14 L48,-30 L-14,-30 Z', top, { sw: 4.5 / s }),
    P('M32,-14 L48,-30 L48,26 L32,42 Z', side, { sw: 4.5 / s }),
    R(-30, -14, 62, 56, 10, front, { sw: 4.5 / s }),
    R(-22, -6, 18, 12, 6, '#fff', { none: true, op: 0.45 }),
    C(12, 22, 6, '#fff', { none: true, op: 0.35 }), C(-6, 26, 3, '#fff', { none: true, op: 0.35 }),
    shine('M-12,-27 L36,-27 L42,-21 L-6,-21 Z', 0.4));
}
function chili(d, x, y, len, rot = 0, o = {}) {
  const w = len * 0.14;
  const body = d.lin([[0, '#ff7a5c'], [1, '#c4160f']], 0.3, 1);
  return G(T(x, y, rot),
    P(`M0,${f(-w)} Q${f(len * 0.55)},${f(-w * 1.4)} ${f(len)},${f(w * 1.7)} Q${f(len * 0.5)},${f(w * 0.7)} 0,${f(w)} Q${f(-w * 0.3)},0 0,${f(-w)} Z`, body, { sw: clamp(len * 0.04, 2.5, 4.5) }),
    P(`M${f(-w * 0.2)},${f(-w * 1.05)} Q${f(-w * 0.9)},${f(-w * 0.2)} ${f(-w * 0.2)},${f(w * 1.05)} Q${f(w * 0.5)},0 ${f(-w * 0.2)},${f(-w * 1.05)} Z`, '#4cb944', { sw: 3.2 }),
    P(`M${f(-w * 0.6)},0 Q${f(-w * 1.6)},${f(-w * 0.2)} ${f(-w * 1.7)},${f(-w * 1.3)}`, 'none', { stroke: '#2d7a32', sw: 4 }),
    P(`M${f(len * 0.12)},${f(-w * 0.55)} Q${f(len * 0.5)},${f(-w * 0.85)} ${f(len * 0.82)},${f(w * 0.7)}`, 'none', { stroke: '#fff', sw: 3, op: 0.6 }),
    o.extra || '');
}
function iceCube(d, x, y, s = 1, rot = 0) {
  return G(T(x, y, rot, s),
    P('M-28,-12 L28,-12 L44,-28 L-12,-28 Z', '#effcff', { sw: 4.2 / s }),
    P('M28,-12 L44,-28 L44,24 L28,40 Z', '#8fd2f2', { sw: 4.2 / s }),
    R(-28, -12, 56, 52, 8, '#c6ecff', { sw: 4.2 / s }),
    P('M-20,-4 L-6,-4 L-20,12 Z', '#fff', { none: true, op: 0.75 }),
    P('M8,26 L20,14 L22,18 L12,30 Z', '#fff', { none: true, op: 0.6 }),
    P('M-4,10 L4,18 L0,24', 'none', { stroke: '#86c9e8', sw: 2 }));
}
function sodaCan(d, x, y, s = 1, rot = 0) {
  const body = d.lin([[0, '#ff7b7b'], [0.35, '#ff3b4d'], [0.75, '#c8102e'], [1, '#8a0b1f']], 1, 0);
  const metal = d.lin([[0, '#ffffff'], [1, '#a9b5c4']], 1, 0);
  return G(T(x, y, rot, s),
    R(-24, -38, 48, 78, 7, body, { sw: 4.5 / s }),
    P('M-24,-6 Q-8,-14 4,-4 Q14,4 24,-4 L24,8 Q12,16 2,6 Q-10,-4 -24,6 Z', '#ffffff', { sw: 3 / s }),
    E(0, -38, 24, 7, metal, { sw: 4 / s }),
    E(0, -39, 17, 4.5, '#cfd8e2', { none: true }),
    R(-6, -44, 13, 6, 3, '#b8c3cf', { sw: 2.5 / s }),
    E(0, 40, 22, 5, metal, { sw: 3.5 / s }),
    R(-17, -30, 7, 58, 3.5, '#fff', { none: true, op: 0.45 }));
}
function watermelonBall(d, x, y, r) {
  const body = d.rad([[0, '#7fe07a'], [0.55, '#3aa448'], [1, '#1f6e2e']], 0.36, 0.3, 0.85);
  const clip = d.clip(C(x, y, r, '#fff', { none: true }));
  const stripes = [];
  for (let i = -3; i <= 3; i++) stripes.push(`M${f(x + i * r * 0.32 - r * 0.1)},${f(y - r)} Q${f(x + i * r * 0.32 + r * 0.14)},${f(y)} ${f(x + i * r * 0.32 - r * 0.1)},${f(y + r)}`);
  return [C(x, y, r, body, { sw: clamp(r * 0.08, 3, 5) }),
    P(stripes.join(' '), 'none', { stroke: '#1d6a2b', sw: r * 0.1, clip }),
    C(x, y, r, 'none', { sw: clamp(r * 0.08, 3, 5) }),
    E(x - r * 0.38, y - r * 0.42, r * 0.28, r * 0.13, '#fff', { none: true, rot: -30, op: 0.6 })].join('');
}
function watermelonChunk(d, x, y, s = 1, rot = 0) {
  return G(T(x, y, rot, s),
    P('M-24,10 Q0,26 24,10 L0,-30 Z', '#ff4f6e', { sw: 4 / s }),
    P('M-24,10 Q0,26 24,10 Q24,18 22,20 Q0,36 -22,20 Q-24,18 -24,10 Z', '#3aa448', { sw: 4 / s }),
    P('M-21,13 Q0,27 21,13', 'none', { stroke: '#f3ffe6', sw: 3.2 }),
    P('M-6,-4 Q-4,-9 -2,-4 Q-4,0 -6,-4 Z M5,4 Q7,-1 9,4 Q7,8 5,4 Z M-12,6 Q-10,1 -8,6 Q-10,10 -12,6 Z', '#2b1633', { none: true }),
    shine('M-4,-22 L2,-14 L-8,0 Z', 0.4));
}

// ------------------------------------------------------------------ the 20 utensils
const silver = (d) => d.lin([[0, '#ffffff'], [0.5, '#dfe6ee'], [1, '#97a6b8']]);

// 1. Knife: chops the tomato into a rapid stream of tomato chunks
function knife(d) {
  const steel = silver(d);
  const red = d.lin([[0, '#ff7f5f'], [1, '#c4291a']]);
  const stream = [[262, 252, 1.0, -25], [292, 236, 0.95, 25], [320, 220, 0.92, -45], [348, 205, 0.88, 15], [373, 190, 0.8, -20]];
  return [
    shadow(205, 372, 165),
    stream.map(([x, y]) => speed(x - 40, y + 14, x - 22, y + 7, 3.4, 0.7)),
    tomato(d, 178, 306, 60, -6),
    burst(214, 262, 26, 12, 9, '#ffe14d', { sw: 3.5 }),
    drop(232, 246, 0.9, '#ff3b2f', 40), drop(196, 246, 0.75, '#ff3b2f', -30),
    G(T(30, 66, 44),
      P('M150,-48 Q230,-62 300,-46', 'none', { sw: 4, op: 0.55 }),
      P('M170,-62 Q236,-74 290,-62', 'none', { sw: 3.5, op: 0.4 }),
      P('M0,-21 L92,-23 Q103,-23 105,-12 L105,12 Q103,23 92,23 L0,21 Q-15,19 -15,0 Q-15,-19 0,-21 Z', red),
      shine('M2,-15 L88,-16 Q95,-15 95,-10 L4,-9 Z', 0.45),
      C(22, 1, 6, '#eef2f7', { sw: 3 }), C(50, 1, 6, '#eef2f7', { sw: 3 }), C(78, 1, 6, '#eef2f7', { sw: 3 }),
      R(103, -27, 18, 54, 6, steel, { sw: 4.5 }),
      P('M120,-29 L292,-29 Q324,-27 338,-9 Q302,27 206,41 L120,41 Z', steel),
      P('M128,34 L206,34 Q290,23 326,-7', 'none', { stroke: '#ffffff', sw: 3.5 }),
      P('M124,-21 L292,-21', 'none', { stroke: '#8a98aa', sw: 3 }),
      shine('M146,-17 L236,-17 Q242,-11 236,-6 L146,-6 Z', 0.6),
      face(182, 8, 0.95, 'fierce', { look: [3, 3] })),
    stream.map(([x, y, s, r]) => tomatoChunk(d, x, y, s * 1.2, r)),
    sparkle(352, 160, 9), sparkle(300, 196, 6),
  ];
}

// 2. Ice Cream Machine: the banana comes out swirled in frozen soft-serve, freezes and leaves frost
function iceCreamMachine(d) {
  const body = d.lin([[0, '#a6f2df'], [1, '#3fbb9f']]);
  const lid = d.lin([[0, '#ff9fcb'], [1, '#e0528f']]);
  const steel = silver(d);
  const cream = d.lin([[0, '#ffffff'], [1, '#d6f1ff']]);
  return [
    shadow(170, 372, 170),
    // frost zone where it lands
    E(318, 350, 68, 15, '#d8f3ff', { sw: 4.5 }),
    P('M268,350 L276,326 L284,350 M300,352 L310,320 L320,352 M334,350 L344,328 L354,350 M362,348 L368,334 L374,348', '#ffffff', { sw: 3.5 }),
    snowflake(282, 302, 11), snowflake(366, 300, 9),
    // the machine
    R(42, 132, 150, 206, 26, body),
    R(56, 158, 104, 86, 16, '#eafffa', { sw: 4 }),
    face(108, 196, 1.1, 'happy', { look: [3, 1] }),
    R(56, 262, 104, 46, 10, '#ffe6f1', { sw: 4 }),
    C(80, 285, 9, '#ff6f9f', { sw: 3.5 }), C(106, 285, 9, '#ffd23a', { sw: 3.5 }), C(132, 285, 9, '#7ad0ff', { sw: 3.5 }),
    R(36, 106, 162, 36, 16, lid),
    P('M52,142 L58,156 L64,142 M86,142 L91,152 L96,142 M150,142 L156,158 L162,142', '#ffffff', { sw: 3 }),
    P('M148,108 L166,64', 'none', { sw: 12 }), P('M148,108 L166,64', 'none', { stroke: '#e9eef3', sw: 6 }),
    C(169, 58, 14, d.rad([[0, '#ff9aa6'], [1, '#d62a3d']])),
    shine('M163,52 Q168,47 174,50 Q168,51 165,56 Z', 0.8),
    R(36, 326, 162, 22, 10, '#ffd6e8'),
    // dispenser spout
    P('M190,246 L224,246 Q232,246 232,254 L232,276 L190,276 Z', steel),
    P('M216,276 L248,276 L240,294 L224,294 Z', steel),
    shine('M46,140 Q46,118 66,116 L66,122 Q52,124 52,140 Z', 0.55),
    // slow arc
    P('M236,300 Q244,250 258,214', 'none', { sw: 4, dash: '2 12', op: 0.75 }),
    P('M352,196 Q366,250 330,318', 'none', { sw: 4, dash: '2 12', op: 0.6 }),
    // the banana, swirled in frozen soft-serve but still a banana
    G(T(304, 160, -18),
      banana(d, 0, 0, 1.4, 0, { light: '#fff6a8', dark: '#f0bd2a' }),
      G(T(0, 6, 0, 1.4),
        P('M-20,-2 Q-24,-18 -8,-14 Q0,-28 12,-14 Q26,-18 22,0 Q30,14 18,20 Q8,28 -2,20 Q-14,28 -20,16 Q-30,8 -20,-2 Z', cream, { sw: 3.4 }),
        P('M-14,-4 Q-2,-12 8,-4 Q16,-12 22,-2', 'none', { stroke: '#a9dcf5', sw: 2.2 }),
        P('M-18,8 Q-4,2 6,8 Q16,2 24,8', 'none', { stroke: '#a9dcf5', sw: 2.2 }),
        P('M-12,20 L-10,30 L-7,20 M4,22 L6,31 L9,22', '#ffffff', { sw: 2.4 }),
        shine('M-16,-6 Q-12,-16 -4,-12 Q-10,-10 -16,-6 Z', 0.8)),
      P('M-70,6 Q-62,-2 -52,4 M52,-20 Q60,-28 70,-22', 'none', { stroke: '#ffffff', sw: 4, op: 0.9 })),
    snowflake(236, 120, 10), snowflake(372, 196, 11), sparkle(388, 140, 7, '#d8f3ff'), sparkle(258, 196, 6, '#d8f3ff'), sparkle(300, 92, 6, '#d8f3ff'),
  ];
}

// 3. Spoon: a heaped spoonful of blueberries flicked out as a tight shotgun cone
function spoon(d) {
  const steel = silver(d);
  const bowlIn = d.lin([[0, '#aab7c7'], [1, '#e9eff5']]);
  const berries = [[318, 136, 15], [342, 106, 14], [338, 160, 16], [362, 130, 15], [372, 92, 13], [380, 168, 13], [356, 194, 12], [388, 120, 12], [312, 104, 12]];
  return [
    shadow(170, 372, 160),
    P('M300,128 L392,64', 'none', { sw: 3.5, dash: '10 9', op: 0.55 }),
    P('M304,164 L392,222', 'none', { sw: 3.5, dash: '10 9', op: 0.55 }),
    berries.map(([x, y]) => speed(x - 34, y + 10, x - 20, y + 6, 3, 0.6)),
    // handle
    P('M196,222 Q132,272 72,316 Q50,332 60,350 Q74,366 96,350 Q156,302 222,246 Z', steel),
    shine('M190,230 Q130,276 80,316 Q76,312 80,306 Q132,268 186,226 Z', 0.65),
    face(96, 322, 0.8, 'goofy', { look: [4, -2], rot: -38 }),
    // bowl
    E(252, 178, 76, 52, steel, { rot: -36, sw: 5 }),
    E(255, 175, 62, 40, bowlIn, { rot: -36, sw: 3.5 }),
    blueberry(d, 236, 194, 15),
    blueberry(d, 262, 182, 16), blueberry(d, 244, 166, 14), blueberry(d, 274, 156, 15), blueberry(d, 226, 172, 12),
    cloud(292, 146, 22, '#ffffff', PUFF, 3.5, 0.95),
    berries.map(([x, y, r]) => blueberry(d, x, y, r)),
    sparkle(296, 88, 8), sparkle(392, 196, 6),
  ];
}

// 4. Blow Torch: three seconds on the pineapple sets it ablaze (and it burns away after)
function blowTorch(d) {
  const tank = d.lin([[0, '#ffa04a'], [1, '#d63b1a']], 1, 0.4);
  const brass = d.lin([[0, '#fff0a8'], [1, '#d9a21a']]);
  return [
    shadow(200, 372, 175),
    // charge ring: three seconds, nearly full
    C(310, 214, 86, 'none', { sw: 12, stroke: '#2b1633', op: 0.18 }),
    P('M310,128 A86,86 0 1 1 236,257', 'none', { sw: 16 }),
    P('M310,128 A86,86 0 1 1 236,257', 'none', { stroke: '#ffcf3a', sw: 9 }),
    C(310, 128, 7, '#fff', { sw: 3 }), C(384, 257, 7, '#fff', { sw: 3 }), C(236, 257, 7, '#ffcf3a', { sw: 3 }),
    // flames behind
    flame(268, 182, 1.15, -25), flame(352, 176, 1.25, 20), flame(310, 150, 1.35, 0), flame(338, 250, 1.0, 30),
    pineapple(d, 310, 222, 0.95, 10, { light: '#ffcf5a', dark: '#d9761a', pattern: '#9a5410' }),
    flame(282, 262, 0.9, -15), flame(320, 276, 0.8, 5), flame(352, 222, 0.75, 25),
    // ash drifting up
    R(352, 92, 7, 6, 1.5, '#8f8796', { sw: 2, op: 0.9 }), R(372, 116, 5, 5, 1.5, '#8f8796', { sw: 2, op: 0.8 }), R(330, 76, 6, 5, 1.5, '#8f8796', { sw: 2, op: 0.7 }),
    // the torch
    P('M226,150 Q262,150 290,168 Q262,174 226,170 Z', '#5fc2ff', { sw: 4 }),
    P('M226,154 Q252,156 272,166 Q252,168 226,166 Z', '#e9fbff', { none: true }),
    R(48, 176, 92, 172, 24, tank),
    R(48, 236, 92, 56, 8, '#fff1c9', { sw: 4 }),
    face(94, 262, 0.95, 'sly', { look: [4, 0], body: '#fff1c9' }),
    P('M62,176 Q62,142 94,140 Q126,142 126,176 Z', silver(d)),
    R(84, 118, 22, 24, 6, brass), R(76, 112, 38, 10, 5, '#ff5a3a', { sw: 3.5 }),
    P('M106,154 L184,154 L196,146 L226,146 L226,174 L196,174 L184,166 L106,166 Z', brass),
    L(204, 150, 204, 170, { sw: 2.5 }), L(214, 150, 214, 170, { sw: 2.5 }),
    shine('M56,190 Q56,184 62,182 L62,334 Q56,332 56,326 Z', 0.5),
    sparkle(232, 128, 7), sparkle(250, 196, 5),
  ];
}

// 5. Whisk: whips the grapes into a spinning vortex that pulls enemies in
function whisk(d) {
  const handle = d.lin([[0, '#ff8ccc'], [1, '#d63b84']], 1, 0);
  const wire = '#dde5ee';
  const grapes = [[300, 128, 15], [338, 158, 14], [318, 214, 15], [262, 196, 14], [286, 168, 12], [348, 112, 11], [250, 146, 11]];
  const arrows = [[214, 96, 40], [392, 108, 140], [392, 250, 220], [222, 280, -40]];
  return [
    shadow(170, 372, 150),
    // vortex bands
    P('M300,72 Q394,80 386,170 Q378,258 296,262 Q210,262 206,184 Q204,112 280,104 Q356,100 356,170 Q354,232 296,232 Q240,232 238,184 Q238,140 290,136 Q328,136 326,172', 'none', { sw: 16, stroke: '#b98cff', op: 0.35 }),
    P('M300,72 Q394,80 386,170 Q378,258 296,262 Q210,262 206,184 Q204,112 280,104 Q356,100 356,170 Q354,232 296,232 Q240,232 238,184 Q238,140 290,136 Q328,136 326,172', 'none', { sw: 4, stroke: '#ffffff', op: 0.9, dash: '26 14' }),
    P('M300,72 Q394,80 386,170 Q378,258 296,262 Q210,262 206,184', 'none', { sw: 3, op: 0.5 }),
    arrows.map(([x, y, a]) => G(T(x, y, a), P('M-14,-10 Q-2,-4 6,8', 'none', { sw: 4 }), arrowHead(8, 10, 55, 11))),
    grapes.map(([x, y, r]) => grape(d, x, y, r)),
    // wire loops
    [[-0.9, 0], [-0.45, 0], [0, 0], [0.45, 0], [0.9, 0]].map(([k]) => ostroke(`M150,252 Q${f(150 + 40 + k * 60)},${f(150 - 10 - k * 40)} ${f(230 + k * 18)},${f(118 - k * 22)} Q${f(258 + k * 6)},${f(104 - k * 10)} ${f(244 - k * 26)},${f(150 + k * 16)} Q${f(214 - k * 30)},${f(214 + k * 10)} 150,252`, wire, 4.5)),
    P('M108,260 Q96,300 74,330', 'none', { sw: 4, dash: '1 12', op: 0.6 }),
    // handle and collar
    P('M52,358 Q40,346 52,334 L132,250 Q144,240 156,250 Q166,262 154,274 L74,358 Q62,370 52,358 Z', handle),
    shine('M62,340 L134,264 Q140,260 144,264 L72,342 Q66,346 62,340 Z', 0.5),
    R(138, 236, 32, 24, 8, silver(d), { sw: 4 }),
    face(96, 312, 0.85, 'dizzy', { rot: -44 }),
    sparkle(214, 248, 7), sparkle(370, 64, 8),
  ];
}

// 6. Blender: tomatoes pureed into a pressure jet that coats the floor
function blender(d) {
  const base = d.lin([[0, '#ff7a86'], [1, '#c42a3a']]);
  const puree = d.lin([[0, '#ff6a52'], [1, '#c41c10']]);
  const stream = 'M240,128 Q300,110 330,160 Q352,200 334,258 Q322,300 330,330';
  return [
    shadow(190, 372, 170),
    P('M266,338 Q262,322 286,320 Q300,312 322,318 Q346,312 364,326 Q388,330 382,346 Q372,360 338,358 Q300,364 278,354 Q262,350 266,338 Z', '#e8321f', { sw: 4.5 }),
    shine('M290,328 Q306,322 326,326 Q312,330 292,332 Z', 0.6),
    // the jar
    P('M60,110 L200,110 L186,282 L74,282 Z', '#e9f7ff', { sw: 5, fop: 0.5 }),
    P('M66,176 Q100,164 130,176 Q162,186 194,172 L186,282 L74,282 Z', puree, { sw: 4 }),
    P('M80,212 Q110,196 132,214 Q150,228 176,214', 'none', { stroke: '#ff9a80', sw: 4 }),
    P('M84,248 Q112,232 138,250 Q156,262 172,250', 'none', { stroke: '#ff9a80', sw: 4 }),
    tomatoChunk(d, 108, 232, 0.8, 30), tomatoChunk(d, 156, 196, 0.7, -40),
    E(132, 260, 3, 2, '#ffe49a', { none: true }), E(92, 196, 3, 2, '#ffe49a', { none: true }), E(168, 240, 3, 2, '#ffe49a', { none: true }),
    shine('M72,124 L84,124 L80,268 L74,268 Z', 0.55), shine('M176,124 L186,124 L184,150 L178,150 Z', 0.4),
    R(52, 96, 156, 22, 9, '#3b3550'),
    R(98, 82, 64, 18, 7, '#3b3550'),
    // spout and the jet
    P('M198,138 L232,120 L240,134 L206,154 Z', silver(d), { sw: 4 }),
    ostroke(stream, '#e8321f', 18),
    P(stream, 'none', { stroke: '#ff8a70', sw: 5, op: 0.9 }),
    [[262, 117], [300, 124], [326, 152], [340, 196], [338, 236], [330, 278]].map(([x, y], i) => E(x, y, 3.2, 2, '#ffe49a', { none: true, rot: i * 40 })),
    drop(276, 98, 0.8, '#e8321f', 30), drop(356, 150, 0.7, '#e8321f', 60), drop(354, 252, 0.75, '#e8321f', 120), drop(304, 214, 0.6, '#e8321f', -20),
    P('M316,300 L322,292 L326,300 L322,304 Z', '#4cb944', { sw: 2.5 }),
    // motor base
    P('M66,282 L194,282 L206,350 L54,350 Z', base),
    face(130, 312, 1.0, 'wild', { look: [2, 0] }),
    C(76, 336, 6, '#ffd23a', { sw: 3 }), C(184, 336, 6, '#7ad0ff', { sw: 3 }),
    shine('M66,288 L80,288 L70,342 L60,342 Z', 0.4),
    speed(24, 236, 46, 236, 3.5), speed(18, 256, 44, 256, 3.5),
  ];
}

// 7. Rolling Pin: flattens cookies into fast discs that ricochet off walls
function rollingPin(d) {
  const wood = d.lin([[0, '#ffd9a0'], [1, '#c98a4c']]);
  const knob = d.lin([[0, '#c98a4c'], [1, '#8a532a']]);
  const disc = (x, y, r, rot) => G(T(x, y, rot), cookie(d, 0, 0, r, { sy: 0.52, edge: '#b87436' }));
  return [
    shadow(180, 372, 170),
    // the wall it banks off
    R(372, 30, 28, 280, 4, '#bfe2ff', { sw: 4.5 }),
    P('M372,82 L400,82 M372,138 L400,138 M372,194 L400,194 M372,250 L400,250', 'none', { sw: 3, op: 0.5 }),
    burst(372, 120, 24, 11, 8, '#ffe14d', { sw: 3.5 }),
    // ricochet path, and the risky bounce back
    P('M232,214 L366,122 L268,72', 'none', { sw: 4, dash: '3 11' }),
    arrowHead(268, 72, 205, 14),
    P('M300,200 Q250,268 196,250', 'none', { sw: 3.5, stroke: '#e0302a', dash: '6 9' }),
    arrowHead(196, 250, 195, 12, '#e0302a'),
    disc(320, 160, 36, -34), speed(268, 214, 290, 198, 3.5), speed(280, 228, 298, 214, 3.5),
    disc(250, 92, 30, 20), speed(300, 92, 282, 90, 3.5),
    // squashed cookie under the pin, crumbs spraying
    G(T(160, 330), cookie(d, 0, 0, 74, { sy: 0.2, edge: '#b87436' })),
    [[76, 312], [246, 314], [60, 326], [262, 330], [90, 296]].map(([x, y], i) => R(x, y, 7, 6, 2, '#d8964e', { sw: 2.5, op: 1 - i * 0.08 })),
    // the pin
    G(T(162, 272, -14),
      R(-176, -11, 46, 22, 11, knob), R(130, -11, 46, 22, 11, knob),
      R(-134, -36, 268, 72, 34, wood),
      P('M-100,-20 Q-40,-26 20,-18 M-60,8 Q10,2 80,10 M-110,22 Q-70,18 -30,24 M40,-24 Q80,-28 110,-20', 'none', { stroke: '#b97a3e', sw: 2.5 }),
      shine('M-110,-26 Q-120,-24 -120,-16 L-120,-10 Q-60,-22 110,-18 Q112,-26 104,-27 Z', 0.55),
      face(4, -2, 1.05, 'smug', { look: [5, 0], body: '#f0c084' })),
    sparkle(340, 60, 8), sparkle(214, 150, 6),
  ];
}

// 8. Microwave: charges the cheese into a glowing orb that detonates (overcharge pops on you)
function microwave(d) {
  const shell = d.lin([[0, '#ffe08a'], [1, '#f2a33b']]);
  const glow = d.rad([[0, '#fffbe0'], [0.5, '#ffd36b'], [1, '#ff7a2a']], 0.5, 0.5, 0.7);
  const aura = d.rad([[0, '#fff6b0', 0.9], [0.6, '#ffd23a', 0.45], [1, '#ffb000', 0]], 0.5, 0.5, 0.5);
  const bolt = (x, y, s, rot) => G(T(x, y, rot, s), P('M0,-16 L6,-3 L1,-2 L7,14 L-6,0 L-1,-1 L-6,-16 Z', '#fff36b', { sw: 3 }));
  return [
    shadow(170, 372, 165),
    // the cheese, charged into an energy orb
    C(318, 150, 82, aura, { none: true }),
    E(318, 150, 74, 26, 'none', { sw: 3.5, rot: -20, stroke: '#ffb000', op: 0.9 }),
    E(318, 150, 26, 70, 'none', { sw: 3.5, rot: -20, stroke: '#ffb000', op: 0.7 }),
    cheeseWheel(d, 318, 150, 44, { light: '#fffbe0', mid: '#ffe14a', dark: '#ffb300' }),
    bolt(254, 104, 1.1, -30), bolt(386, 112, 1, 30), bolt(372, 214, 1.1, 150), bolt(262, 206, 0.9, -140),
    sparkle(318, 52, 9), sparkle(232, 160, 7),
    speed(214, 210, 246, 192, 4), speed(222, 232, 250, 218, 4),
    // the microwave
    C(64, 344, 10, '#3b3550', { sw: 4 }), C(250, 344, 10, '#3b3550', { sw: 4 }),
    R(30, 150, 250, 190, 26, shell),
    R(50, 170, 150, 150, 18, '#3b3550', { sw: 4.5 }),
    R(58, 178, 134, 134, 14, glow, { sw: 3 }),
    cheeseWheel(d, 125, 245, 34, { light: '#fffbe0', mid: '#ffe14a', dark: '#ffb300' }),
    E(125, 286, 52, 9, '#ffffff', { none: true, op: 0.35 }),
    P('M64,186 L96,186 L64,240 Z', '#fff', { none: true, op: 0.4 }),
    R(212, 170, 52, 150, 12, '#fff4d6', { sw: 4 }),
    face(238, 200, 0.68, 'smug', { look: [-3, 0], body: '#fff4d6' }),
    // charge meter: green, yellow, red (overcharge)
    R(224, 228, 28, 76, 8, '#3b3550', { sw: 3.5 }),
    R(229, 274, 18, 24, 4, '#5ed357', { none: true }), R(229, 252, 18, 20, 4, '#ffd23a', { none: true }), R(229, 233, 18, 17, 4, '#ff4b3a', { none: true }),
    P('M256,258 L266,252 L266,264 Z', INK, { none: true }),
    // overcharge pop
    burst(262, 146, 20, 9, 8, '#ff4b3a', { sw: 3.5 }), C(262, 146, 4, '#fff', { none: true }),
    shine('M40,164 Q40,154 52,154 L130,154 Q120,158 52,160 Q46,160 46,170 Z', 0.55),
  ];
}

// 9. Grater: shreds the carrot into a dense, short-range cloud of carrot shreds
function grater(d) {
  const face1 = silver(d);
  const side = d.lin([[0, '#c9d3df'], [1, '#7f8ea3']]);
  const shreds = [];
  const rnd = mulberry(9);
  for (let i = 0; i < 34; i++) {
    const t = rnd(), a = (rnd() - 0.5) * 1.1;
    const x = 222 + t * 160, y = 238 + Math.tan(a) * t * 150 * 0.8 + (rnd() - 0.5) * 30;
    shreds.push([x, y, 14 + rnd() * 10, rnd() * 360, 1 - t * 0.55]);
  }
  const holes = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const y = 214 + r * 20, x0 = 96 - r * 2.4, x1 = 160 + r * 2.4, x = x0 + ((x1 - x0) * (c + 0.5)) / 4;
    holes.push(P(`M${f(x - 7)},${f(y + 3)} Q${f(x)},${f(y - 6)} ${f(x + 7)},${f(y + 3)} Z`, '#3b3550', { sw: 2.2 }));
  }
  return [
    shadow(190, 372, 170),
    P('M360,140 L360,336', 'none', { sw: 3, dash: '4 9', op: 0.45 }),
    shreds.map(([x, y, len, rot, op]) => GA(`opacity="${f(op)}"`, G(T(x, y, rot), ostroke(`M${f(-len / 2)},0 Q0,${f(-len * 0.35)} ${f(len / 2)},0`, '#ff8a2a', 4.2, { sw: 3 })))),
    speed(214, 210, 246, 206, 3.5), speed(214, 268, 248, 274, 3.5),
    // grater body
    P('M164,112 L196,128 L222,336 L190,342 Z', side),
    P('M86,112 L164,112 L190,342 L60,342 Z', face1),
    P('M100,112 Q100,68 126,68 Q152,68 152,112', 'none', { sw: 14 }), P('M100,112 Q100,68 126,68 Q152,68 152,112', 'none', { stroke: '#ff8a2a', sw: 7 }),
    face(125, 166, 1.05, 'grit', { look: [3, 2] }),
    holes,
    shine('M92,120 L104,120 L82,334 L70,334 Z', 0.55),
    // the carrot pressed against it, half grated
    carrot(d, 40, 290, 118, -16),
    P('M144,248 L152,262 M150,250 L160,256', 'none', { stroke: '#ff8a2a', sw: 3 }),
    sparkle(250, 170, 7),
  ];
}

// 10. Spatula: flips the jelly into a guaranteed crit that banks off the wall
function spatula(d) {
  const handle = d.lin([[0, '#5fe0d0'], [1, '#1f9c90']], 1, 0);
  const head = silver(d);
  return [
    shadow(170, 372, 150),
    R(374, 18, 26, 210, 4, '#ffd6e8', { sw: 4.5 }),
    P('M374,70 L400,70 M374,126 L400,126 M374,182 L400,182', 'none', { sw: 3, op: 0.5 }),
    // bank shot: up to the wall, down onto the target
    P('M228,186 L288,120 L372,76 L318,300', 'none', { sw: 4, dash: '3 11' }),
    burst(372, 78, 22, 10, 8, '#ffe14d', { sw: 3.5 }),
    arrowHead(318, 300, 103, 14),
    C(318, 322, 26, '#fff', { sw: 4.5 }), C(318, 322, 15, '#ff4b6e', { sw: 3.5 }), C(318, 322, 5, '#fff', { sw: 2.5 }),
    L(318, 288, 318, 300, { sw: 3.5 }), L(318, 344, 318, 356, { sw: 3.5 }), L(284, 322, 296, 322, { sw: 3.5 }), L(340, 322, 352, 322, { sw: 3.5 }),
    // crit burst behind the flipped jelly
    burst(276, 126, 66, 40, 12, '#ffd23a', { sw: 4.5 }),
    burst(276, 126, 44, 30, 12, '#fff6a8', { sw: 0, none: true }),
    P('M212,96 Q236,58 274,52', 'none', { sw: 4 }), arrowHead(274, 52, 0, 12),
    P('M340,154 Q326,192 288,200', 'none', { sw: 4 }), arrowHead(288, 200, 175, 12),
    jelly(d, 270, 130, 0.95, 24),
    sparkle(218, 158, 9), sparkle(332, 96, 7), sparkle(244, 72, 6),
    // spatula
    P('M58,360 Q44,350 54,336 L130,252 Q140,244 150,252 Q158,262 150,272 L76,356 Q66,368 58,360 Z', handle),
    shine('M64,344 L132,262 Q136,258 140,262 L72,348 Q68,350 64,344 Z', 0.5),
    P('M140,258 L162,236', 'none', { sw: 12 }), P('M140,258 L162,236', 'none', { stroke: '#d4dde8', sw: 6 }),
    G(T(196, 200, -45),
      R(-36, -48, 72, 96, 16, head),
      R(-22, -36, 9, 34, 4.5, '#3b3550', { sw: 2.5 }), R(-4.5, -36, 9, 34, 4.5, '#3b3550', { sw: 2.5 }), R(13, -36, 9, 34, 4.5, '#3b3550', { sw: 2.5 }),
      face(0, 22, 0.8, 'wink', { look: [3, -2] }),
      shine('M-30,-40 Q-30,-44 -24,-44 L-24,40 Q-30,38 -30,34 Z', 0.55)),
  ];
}

// 11. Deep Fryer: coats the chili in hot oil; it drips burning slicks (slippery for everyone)
function deepFryer(d) {
  const pot = silver(d);
  const oil = d.lin([[0, '#ffe27a'], [1, '#f0a020']]);
  const slick = d.lin([[0, '#ffd45a'], [1, '#e8930f']]);
  return [
    shadow(180, 372, 175),
    // burning, slippery oil slick
    P('M250,344 Q248,326 278,326 Q298,316 324,324 Q352,318 370,332 Q392,338 384,352 Q372,364 334,360 Q296,366 270,358 Q250,356 250,344 Z', slick, { sw: 4.5 }),
    P('M290,338 Q300,330 312,338 Q300,346 290,338 Z M332,344 Q344,334 356,344', 'none', { stroke: '#fff', sw: 3, op: 0.7 }),
    flame(286, 316, 0.6, -8), flame(330, 312, 0.72, 6), flame(366, 322, 0.55, 14),
    // the oil-coated chili flying out
    P('M214,196 Q240,170 262,166', 'none', { sw: 4, dash: '2 11', op: 0.7 }),
    flame(224, 196, 0.45, -60), flame(244, 178, 0.38, -60),
    drop(276, 222, 0.8, '#ffc93a', 10), drop(306, 236, 0.65, '#ffc93a', -10), drop(250, 214, 0.55, '#ffc93a', 20),
    chili(d, 262, 152, 112, 14, {
      extra: [
        P('M14,-15 Q62,-24 106,20', 'none', { stroke: '#ffd76a', sw: 9, op: 0.75 }),
        P('M18,-12 Q60,-20 98,14', 'none', { stroke: '#fff7cc', sw: 3.5 }),
        C(40, -6, 3.5, '#fff', { none: true, op: 0.9 }), C(72, 2, 2.5, '#fff', { none: true, op: 0.9 }),
      ],
    }),
    sparkle(372, 160, 8), sparkle(250, 128, 6),
    // the fryer
    P('M58,190 L58,150 Q50,110 24,96', 'none', { sw: 12 }), P('M58,190 L58,150 Q50,110 24,96', 'none', { stroke: '#3b3550', sw: 6 }),
    P('M40,188 L210,188 L200,322 Q198,342 176,342 L74,342 Q52,342 50,322 Z', pot),
    E(125, 190, 86, 18, oil, { sw: 4.5 }),
    bubble(96, 186, 6), bubble(146, 192, 5), bubble(170, 184, 4), bubble(116, 194, 3.5),
    P('M76,180 Q82,160 76,142 M112,176 Q120,154 112,132 M150,178 Q158,158 150,140', 'none', { sw: 3.5, op: 0.4 }),
    face(124, 252, 1.05, 'sweat', { look: [4, 0] }),
    // overheat thermometer
    R(186, 214, 16, 64, 8, '#fff', { sw: 3.5 }), R(190, 226, 8, 44, 4, '#ff4b3a', { none: true }), C(194, 284, 11, '#ff4b3a', { sw: 3.5 }),
    shine('M50,200 L62,200 L64,328 L58,328 Z', 0.55),
  ];
}

// 12. Mortar & Pestle: grinds ice into frosty powder shells that arc far and leave frost clouds
function mortarPestle(d) {
  const stone = d.lin([[0, '#b9c6da'], [1, '#6c7c97']]);
  const pestle = d.lin([[0, '#d6deea'], [1, '#8492aa']], 1, 0);
  const shell = (x, y, r) => [cloud(x, y, r, '#e3f6ff', PUFF, 4), sparkle(x + r * 0.2, y - r * 0.1, r * 0.3, '#ffffff', 2.2), R(x - r * 0.45, y + r * 0.05, r * 0.32, r * 0.32, 2, '#bfe9ff', { sw: 2 })];
  return [
    shadow(170, 372, 160),
    // long, slow arc
    P('M150,226 Q240,-30 336,262', 'none', { sw: 4, dash: '2 12', op: 0.7 }),
    // frost cloud where it lands, drifting in the wind
    cloud(318, 312, 50, '#d6f1ff', PUFF, 4.5, 0.95),
    snowflake(296, 300, 11), snowflake(340, 316, 9), snowflake(322, 284, 7),
    P('M364,262 Q384,256 392,268 M370,286 Q390,282 396,294 M358,240 Q374,234 384,244', 'none', { sw: 3.5, op: 0.55 }),
    shell(204, 112, 22), shell(262, 70, 24), shell(316, 128, 22),
    // the pestle, then the bowl with ice cubes being ground to powder
    G(T(172, 200, 32), R(-14, -96, 28, 120, 14, pestle), E(0, 26, 24, 22, pestle), shine('M-8,-88 L-4,-88 L-4,10 L-8,10 Z', 0.55)),
    P('M38,248 Q38,350 122,352 Q206,350 206,248 Z', stone),
    E(122, 248, 84, 18, '#8f9eb6', { sw: 4.5 }),
    E(122, 250, 70, 12, '#d8f2ff', { none: true }),
    cloud(116, 238, 24, '#e8f8ff', PUFF, 3.5),
    iceCube(d, 74, 222, 0.48, -15), iceCube(d, 126, 214, 0.4, 20),
    R(150, 230, 9, 8, 2, '#bfe9ff', { sw: 2.2 }), R(98, 242, 7, 7, 2, '#bfe9ff', { sw: 2.2 }), R(62, 244, 6, 6, 2, '#bfe9ff', { sw: 2 }),
    [[66, 280], [170, 290], [96, 330], [150, 322], [58, 312], [186, 266]].map(([x, y]) => C(x, y, 2.6, '#5b6a84', { none: true })),
    face(122, 296, 1.05, 'grumpy', { look: [3, 0] }),
    shine('M48,262 Q50,300 66,328 Q58,300 56,262 Z', 0.45),
  ];
}

// 13. Toaster: toasts the cheese hot and crispy; it bounces twice and leaves a scorched trail
function toaster(d) {
  const chrome = silver(d);
  const toasted = { top: '#f7c75a', front: '#e9a23a', side: '#c97d22', hole: '#b86f1a' };
  const grill = P('M-30,0 L-14,30 M-10,-4 L6,26 M10,-8 L26,22', 'none', { stroke: '#7a3f12', sw: 3.5 });
  const glow = d.rad([[0, '#ffb04a', 0.55], [1, '#ff8a2a', 0]], 0.5, 0.5, 0.5);
  return [
    shadow(200, 372, 180),
    // scorched trail along the bounces
    P('M232,352 Q262,346 286,350 M300,350 Q330,344 358,350', 'none', { sw: 10, stroke: '#5a2e14', op: 0.75 }),
    [[248, 346], [272, 350], [316, 346], [342, 350]].map(([x, y]) => C(x, y, 3, '#ff8a2a', { sw: 1.5 })),
    // two bounces only
    P('M150,128 Q214,30 286,336 Q312,204 352,336', 'none', { sw: 4, dash: '2 11' }),
    cloud(286, 340, 12, '#ffffff', PUFF, 3), cloud(352, 340, 12, '#ffffff', PUFF, 3),
    C(330, 228, 46, glow, { none: true }),
    G(T(330, 226, 18, 0.62), cheeseWedge(d, 0, 0, 1, 0, { ...toasted, extra: grill })),
    P('M318,180 Q324,170 318,160 M340,176 Q346,166 340,156', 'none', { sw: 3, op: 0.6 }),
    // the toaster
    R(46, 186, 190, 152, 34, chrome),
    R(46, 290, 190, 22, 0, '#ff5f6d', { sw: 4 }),
    R(232, 214, 18, 40, 6, '#3b3550', { sw: 3.5 }), R(244, 220, 22, 12, 6, '#ff5f6d', { sw: 3 }),
    R(78, 174, 56, 16, 8, '#3b3550', { sw: 3.5 }), R(148, 174, 56, 16, 8, '#3b3550', { sw: 3.5 }),
    face(140, 244, 1.1, 'cheer'),
    shine('M60,200 Q60,194 68,194 L68,280 L60,280 Z', 0.6), shine('M214,198 L222,198 Q226,198 226,206 L226,222 L218,222 Z', 0.45),
    R(64, 336, 26, 10, 4, '#3b3550', { sw: 3 }), R(192, 336, 26, 10, 4, '#3b3550', { sw: 3 }),
    // the next slice popping up
    G(T(108, 160, -8, 0.62), cheeseWedge(d, 0, 0, 1, 0, { ...toasted, extra: grill })),
    P('M88,124 Q92,112 88,102 M112,120 Q116,108 112,98', 'none', { sw: 3, op: 0.6 }),
  ];
}

// 14. Colander: strains the soda into a needle-tight stream that pierces a whole line of targets
function colander(d) {
  const enamel = d.lin([[0, '#ff8a92'], [1, '#c42a3a']]);
  const beamPts = [];
  for (let x = 236; x <= 396; x += 9) beamPts.push([x, 234 - (x - 236) * 0.06 + Math.sin(x * 0.7) * 2.2]);
  const holes = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7 - r * 2; c++) holes.push(C(69 + r * 22 + c * 22, 290 + r * 20, 4.2, '#fff6f0', { sw: 2 }));
  holes.push(C(60, 250, 4.2, '#fff6f0', { sw: 2 }), C(210, 250, 4.2, '#fff6f0', { sw: 2 }), C(66, 270, 4.2, '#fff6f0', { sw: 2 }), C(204, 270, 4.2, '#fff6f0', { sw: 2 }));
  const target = (x, y) => [R(x - 4, y + 20, 8, 70, 3, '#c98a4c', { sw: 3.5 }), E(x, y, 16, 34, '#fff', { sw: 4 }), E(x, y, 10, 22, '#ff4b6e', { sw: 3 }), E(x, y, 4, 9, '#fff', { sw: 2.5 })];
  return [
    shadow(190, 372, 170),
    target(300, 232), target(356, 228),
    // the piercing stream
    ostroke(`M236,234 L398,224`, '#6b2d16', 8),
    beamPts.map(([x, y], i) => C(x, y + ((i % 2) - 0.5) * 5, i % 3 ? 3 : 4, i % 3 ? '#a4502a' : '#ff5f4a', { sw: 1.6 })),
    [[262, 214], [284, 252], [322, 210], [338, 248], [376, 206], [390, 244]].map(([x, y]) => bubble(x, y, 4.5)),
    burst(300, 230, 14, 6, 7, '#fff6a8', { sw: 2.5 }), burst(356, 226, 14, 6, 7, '#fff6a8', { sw: 2.5 }),
    // the soda pouring in
    G(T(112, 112, 128, 0.82), sodaCan(d, 0, 0)),
    P('M142,136 Q146,160 140,184', 'none', { sw: 12 }), P('M142,136 Q146,160 140,184', 'none', { stroke: '#7a3a1c', sw: 6 }),
    bubble(156, 150, 5), bubble(130, 160, 4), bubble(160, 176, 3.5),
    // recoil
    speed(10, 220, 34, 214, 3.5), speed(6, 244, 30, 242, 3.5), cloud(56, 344, 14, '#ffffff', PUFF, 3),
    // the colander
    P('M30,206 Q34,236 18,240 Q8,230 22,214 Z', enamel, { sw: 4 }), P('M240,206 Q236,236 252,240 Q262,230 248,214 Z', enamel, { sw: 4 }),
    P('M36,204 Q36,334 135,336 Q234,334 234,204 Z', enamel),
    E(135, 204, 99, 22, '#ffb3b8', { sw: 4.5 }),
    E(135, 206, 82, 14, '#7a3a1c', { none: true, op: 0.9 }),
    bubble(110, 204, 4), bubble(150, 206, 3),
    holes,
    R(92, 330, 86, 18, 8, '#c42a3a', { sw: 4 }),
    face(135, 254, 1.0, 'focus', { look: [3, 0] }),
    shine('M48,218 Q52,280 80,318 Q60,280 58,218 Z', 0.45),
  ];
}

// 15. Cotton Candy Machine: spins the blueberries into a sticky, expanding sweet web
function cottonCandy(d) {
  const tub = d.lin([[0, '#ffb3d6'], [1, '#e8579a']]);
  const fluff = '#9fd6ff';
  const cx = 292, cy = 140, rings = [30, 56, 82];
  const spokes = 9, threads = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    threads.push(`M${cx},${cy} L${f(cx + Math.cos(a) * 92)},${f(cy + Math.sin(a) * 92)}`);
  }
  for (const r of rings) {
    const pts = [];
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + 0.2, a0 = ((i - 0.5) / spokes) * Math.PI * 2 + 0.2;
      pts.push(`${i ? 'Q' + f(cx + Math.cos(a0) * r * 0.8) + ',' + f(cy + Math.sin(a0) * r * 0.8) + ' ' : 'M'}${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`);
    }
    threads.push(pts.join(' '));
  }
  const nodes = [[0, 56], [3, 82], [5, 30], [6, 82], [8, 56]];
  return [
    shadow(170, 372, 165),
    // the web
    P(threads.join(' '), 'none', { stroke: fluff, sw: 11, op: 0.45 }),
    ostroke(threads.join(' '), '#d9f0ff', 3.5, { sw: 2.5 }),
    nodes.map(([i, r]) => { const a = (i / spokes) * Math.PI * 2 + 0.2; return cloud(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 16, fluff, PUFF, 3); }),
    nodes.map(([i, r], k) => { const a = (i / spokes) * Math.PI * 2 + 0.2; return blueberry(d, cx + Math.cos(a) * r + 2, cy + Math.sin(a) * r + 2, 10 + (k % 2) * 2); }),
    blueberry(d, cx, cy, 13),
    drop(250, 236, 0.7, '#9fd6ff'), drop(334, 238, 0.6, '#9fd6ff'),
    // a stretchy candy strand back to the machine
    P('M150,170 Q190,120 236,140', 'none', { stroke: fluff, sw: 10, op: 0.55 }), P('M150,170 Q190,120 236,140', 'none', { sw: 2.5, op: 0.5 }),
    // the machine
    R(98, 300, 66, 40, 6, '#ffffff', { sw: 4 }),
    P('M98,312 L164,312 M98,326 L164,326', 'none', { stroke: '#ff6fb5', sw: 6 }),
    R(72, 336, 118, 14, 7, '#e8579a', { sw: 4 }),
    cloud(130, 196, 44, fluff, PUFF, 4.5),
    blueberry(d, 112, 188, 9), blueberry(d, 148, 204, 8),
    P('M34,238 Q36,300 130,302 Q224,300 226,238 Z', tub),
    E(130, 238, 96, 22, '#ffe0ef', { sw: 4.5 }),
    E(130, 240, 82, 14, '#b9e3ff', { none: true }),
    R(122, 222, 16, 22, 4, silver(d), { sw: 3 }),
    face(130, 270, 1.0, 'dreamy'),
    P('M52,250 Q56,282 78,294', 'none', { stroke: '#fff', sw: 4, op: 0.6 }),
    sparkle(222, 92, 8), sparkle(384, 192, 7), sparkle(196, 228, 5),
  ];
}

// 16. Popcorn Popper: the watermelon pops mid-flight into a cluster of exploding chunks
function popcornPopper(d) {
  const red = d.lin([[0, '#ff7a86'], [1, '#c42a3a']]);
  const chunks = [[248, 96, -40, 0.75], [312, 40, 10, 0.7], [370, 70, 60, 0.75], [382, 150, 120, 0.7], [336, 196, 160, 0.72], [258, 168, -120, 0.7]];
  return [
    shadow(170, 372, 160),
    P('M180,154 Q214,96 270,104', 'none', { sw: 4, dash: '2 11', op: 0.7 }),
    // the pop
    burst(316, 116, 66, 40, 14, '#ffe14d', { sw: 4.5 }),
    burst(316, 116, 44, 28, 14, '#fff6c0', { none: true }),
    watermelonBall(d, 316, 116, 30),
    P('M300,92 L312,106 L304,116 L316,128', 'none', { stroke: '#ff4f6e', sw: 4 }),
    chunks.map(([x, y, r, s]) => [G(T(x, y, r, s), watermelonChunk(d, 0, 0)), burst(x + 18, y - 16, 9, 4, 6, '#fff6a8', { sw: 2 })]),
    // the popper
    R(56, 254, 150, 84, 12, red),
    R(70, 268, 122, 26, 6, '#ffd23a', { sw: 3.5 }),
    face(131, 314, 0.85, 'excited'),
    R(62, 140, 138, 118, 8, '#e9f7ff', { sw: 4.5, fop: 0.55 }),
    P('M80,232 Q106,196 132,232 Q158,196 184,232 Z', '#ffe9a0', { sw: 3.5 }),
    G(T(132, 200, -12, 0.42), watermelonChunk(d, 0, 0)), G(T(100, 214, 30, 0.36), watermelonChunk(d, 0, 0)),
    shine('M72,150 L84,150 L76,246 L70,246 Z', 0.55),
    P('M50,144 L131,104 L212,144 Z', red),
    C(131, 98, 12, '#ffd23a', { sw: 4 }), shine('M125,92 Q130,88 136,91 Q130,92 127,96 Z', 0.8),
    C(76, 346, 9, '#3b3550', { sw: 3.5 }), C(186, 346, 9, '#3b3550', { sw: 3.5 }),
    sparkle(226, 46, 8), sparkle(206, 196, 6),
  ];
}

// 17. Peeler: strips the banana layer by layer; every hit on the same target peels another stage
function peeler(d) {
  const handle = d.lin([[0, '#b98cff'], [1, '#6a3fd1']], 1, 0);
  const pip = (x, y, on) => C(x, y, 11, on ? '#ffd23a' : '#ffffff', { sw: 4 }) + (on ? C(x, y, 4, '#fff', { none: true, op: 0.8 }) : '');
  const ribbon = (dd, s = 1) => P(dd, '#ffd84a', { sw: 4 }) + P(dd, 'none', { stroke: '#e0a100', sw: 2, op: 0.6 });
  return [
    shadow(190, 372, 165),
    // stages already peeled
    pip(262, 72, true), pip(296, 72, true), pip(330, 72, false),
    P('M273,72 L285,72 M307,72 L319,72', 'none', { sw: 4 }),
    // the banana, its peel coming off in ribbons
    G(T(296, 196, -16, 1.3),
      banana(d, 0, 0, 1, 0, { light: '#fffbe4', dark: '#f1d98c', ridge: '#e2c46a' }),
      P('M38,-8 Q20,14 26,42 Q32,34 38,42 Q40,18 58,-12 Z', '#ffd84a', { sw: 3.5 }),
      P('M44,-12 Q38,-34 18,-44 Q28,-30 24,-22 Q38,-24 52,-14 Z', '#ffd84a', { sw: 3.5 }),
      P('M50,-8 Q60,-14 62,-18 Q60,-8 54,-4 Z', '#ffd84a', { sw: 3 }),
      P('M30,0 Q28,16 30,34', 'none', { stroke: '#e0a100', sw: 2 })),
    ribbon('M246,214 Q232,244 252,262 Q270,276 258,300 Q252,282 238,276 Q218,256 236,214 Z'),
    ribbon('M284,226 Q290,258 320,262 Q346,264 352,290 Q336,274 318,276 Q282,276 274,230 Z'),
    ribbon('M226,168 Q200,150 196,122 Q194,104 176,98 Q198,96 206,116 Q212,142 236,160 Z'),
    sparkle(360, 142, 8), sparkle(216, 196, 6),
    P('M340,214 Q356,200 372,206 M344,228 Q362,224 376,234', 'none', { sw: 3.5, op: 0.6 }),
    // the peeler
    G(T(126, 262, 36),
      P('M-20,-40 Q-34,-78 -10,-92 M20,-40 Q34,-78 10,-92', 'none', { sw: 11 }),
      P('M-20,-40 Q-34,-78 -10,-92 M20,-40 Q34,-78 10,-92', 'none', { stroke: '#d4dde8', sw: 5 }),
      R(-28, -104, 56, 16, 6, silver(d), { sw: 4 }), L(-20, -96, 20, -96, { sw: 2.5 }),
      R(-24, -46, 48, 140, 22, handle),
      shine('M-16,-34 Q-16,-40 -10,-40 L-10,80 Q-16,78 -16,72 Z', 0.5),
      face(0, 20, 0.9, 'sly', { look: [4, -3], body: '#9a6ef0' })),
  ];
}

// 18. Mixer: fuses two foods (chili + ice) into one hybrid projectile with both effects
function mixer(d) {
  const shell = d.lin([[0, '#7cf0d0'], [1, '#1f9c86']]);
  const hot = d.rad([[0, '#ff9a80'], [0.6, '#f2391f'], [1, '#a9140b']], 0.3, 0.3, 0.9);
  const icy = d.rad([[0, '#ffffff'], [0.6, '#bfe9ff'], [1, '#6fc3ea']], 0.7, 0.3, 0.9);
  const cx = 300, cy = 236, r = 58;
  return [
    shadow(200, 372, 175),
    // two-tone swirl from the beaters
    P('M170,300 Q214,250 246,262 Q266,268 262,250', 'none', { sw: 9, stroke: '#ff5a45', op: 0.7 }),
    P('M180,322 Q232,300 258,300 Q282,300 276,282', 'none', { sw: 9, stroke: '#8fd2f2', op: 0.8 }),
    chili(d, 196, 238, 46, -40), iceCube(d, 214, 316, 0.32, 15),
    // the hybrid: half chili, half ice, both effects at once
    C(cx, cy, r + 14, '#fff3c0', { none: true, op: 0.6 }),
    P(`M${cx},${cy - r} A${r},${r} 0 0 0 ${cx},${cy + r} A${r / 2},${r / 2} 0 0 0 ${cx},${cy} A${r / 2},${r / 2} 0 0 1 ${cx},${cy - r} Z`, hot, { sw: 4.5 }),
    P(`M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${r / 2},${r / 2} 0 0 1 ${cx},${cy} A${r / 2},${r / 2} 0 0 0 ${cx},${cy - r} Z`, icy, { sw: 4.5 }),
    P(`M${cx + 18},${cy - 38} L${cx + 36},${cy - 18} L${cx + 28},${cy + 6} M${cx + 36},${cy - 18} L${cx + 52},${cy - 22}`, 'none', { stroke: '#ffffff', sw: 3 }),
    P(`M${cx - 24},${cy - 50} Q${cx - 18},${cy - 66} ${cx - 2},${cy - 70}`, 'none', { stroke: '#2d7a32', sw: 6 }),
    P(`M${cx - 34},${cy - 54} Q${cx - 24},${cy - 64} ${cx - 10},${cy - 56} Q${cx - 20},${cy - 46} ${cx - 34},${cy - 54} Z`, '#4cb944', { sw: 3.5 }),
    shine(`M${cx - 44},${cy - 20} Q${cx - 40},${cy - 40} ${cx - 24},${cy - 46} Q${cx - 36},${cy - 30} ${cx - 44},${cy - 20} Z`, 0.6),
    flame(cx - 72, cy - 10, 0.55, -70), flame(cx - 60, cy + 40, 0.5, -120),
    snowflake(cx + 74, cy - 14, 11), snowflake(cx + 60, cy + 44, 9),
    sparkle(cx + 8, cy - 86, 8), sparkle(cx + 70, cy - 70, 6),
    // the hand mixer
    [[118, 0], [166, 1]].map(([x, k]) => [ostroke(`M${x},190 L${x},262 Q${x - 20},300 ${x},306 Q${x + 20},300 ${x},262`, '#dde5ee', 4), ostroke(`M${x},262 Q${x - 8},296 ${x},306 Q${x + 8},296 ${x},262`, '#dde5ee', 3)]),
    P('M100,292 Q118,320 144,300 M148,288 Q166,320 192,296', 'none', { sw: 3.5, op: 0.5, dash: '2 9' }),
    P('M40,190 Q30,120 100,112 L196,112 Q232,116 236,150 L232,190 Z', shell),
    P('M78,112 Q80,54 140,54 Q196,56 198,112', 'none', { sw: 18 }), P('M78,112 Q80,54 140,54 Q196,56 198,112', 'none', { stroke: '#1f9c86', sw: 10 }),
    R(110, 186, 64, 12, 5, '#3b3550', { sw: 3.5 }),
    face(136, 152, 1.0, 'cheer'),
    shine('M54,180 Q48,140 82,124 Q64,146 64,180 Z', 0.5),
  ];
}

// 19. Oven Mitt: hurls the carrot far faster, wrapped in a shield against status effects
function ovenMitt(d) {
  const mitt = d.lin([[0, '#ff8a8a'], [1, '#d42a3a']], 1, 1);
  const cuff = d.lin([[0, '#ffffff'], [1, '#e7e1ea']]);
  const shape = 'M-46,80 L-52,-10 Q-58,-92 4,-96 Q62,-96 58,-10 L58,6 Q70,-24 94,-26 Q118,-24 112,2 Q104,34 62,66 L56,80 Z';
  const quilt = d.clip(P(shape, '#fff', { none: true }));
  const lines = [];
  for (let i = -8; i <= 8; i++) lines.push(`M${i * 22 - 100},-110 L${i * 22 + 100},90 M${i * 22 + 100},-110 L${i * 22 - 100},90`);
  return [
    shadow(190, 372, 170),
    // speed streaks and the shielded carrot
    [[200, 176, 286, 176], [214, 198, 270, 198], [206, 154, 262, 154], [222, 218, 252, 216]].map(([a, b, c, e]) => speed(a, b, c, e, 4.5, 0.8)),
    C(330, 176, 60, '#bff4ff', { sw: 4, fop: 0.35 }),
    P('M300,128 L318,118 L336,128 L336,148 L318,158 L300,148 Z M336,148 L354,138 L372,148 L372,168 L354,178 L336,168 Z M300,168 L318,158 L336,168 L336,188 L318,198 L300,188 Z M336,188 L354,178 L372,188 L372,208 L354,218 L336,208 Z', 'none', { stroke: '#6fd8f0', sw: 2.2, op: 0.7 }),
    C(330, 176, 60, 'none', { sw: 4 }),
    carrot(d, 278, 176, 112, 0),
    // status effects bouncing off the shield
    G(T(392, 102, 30, 0.32), iceCube(d, 0, 0)), P('M372,112 L384,104', 'none', { sw: 3 }),
    C(384, 252, 9, '#b56cff', { sw: 3 }), C(392, 260, 5, '#b56cff', { sw: 2.5 }), P('M368,236 L378,244', 'none', { sw: 3 }),
    sparkle(286, 108, 7, '#d8f8ff'), sparkle(380, 176, 6, '#d8f8ff'),
    // the mitt, steaming as it overheats
    G(T(112, 236, 10),
      R(-60, 72, 128, 42, 16, cuff),
      P('M-44,82 L-36,104 M-20,82 L-12,104 M4,82 L12,104 M28,82 L36,104', 'none', { stroke: '#ff6f8f', sw: 4 }),
      P(shape, mitt),
      P(lines.join(' '), 'none', { stroke: '#ffffff', sw: 1.6, op: 0.35, clip: quilt }),
      P('M58,6 Q60,34 62,62', 'none', { sw: 3.5 }),
      shine('M-40,-4 Q-44,-60 -10,-80 Q-30,-56 -30,-4 Z', 0.5),
      face(4, -18, 1.1, 'wink', { look: [4, 0] })),
    P('M80,126 Q72,108 80,90 M108,120 Q100,100 108,82 M136,124 Q128,104 136,88', 'none', { sw: 3.5, op: 0.45 }),
    flame(52, 312, 0.42, -30),
  ];
}

// 20. Pan: slams the soda to force its special ability (Fizz Jump geyser) on demand; roots you briefly
function pan(d) {
  const iron = d.lin([[0, '#5a536e'], [1, '#1d1a2b']]);
  const handle = d.lin([[0, '#ff7a86'], [1, '#c42a3a']], 1, 0);
  const fizz = d.lin([[0, '#fff3e6'], [1, '#c98a5a']]);
  return [
    shadow(200, 372, 185),
    // rooted: cracks and stakes in the floor
    P('M86,356 L60,372 M110,358 L106,380 M168,358 L196,376 M190,356 L222,362', 'none', { sw: 3.5 }),
    // fizz geyser bursting from the soda
    P('M268,250 Q262,170 252,96 Q246,52 276,34 Q300,22 320,40 Q344,58 334,98 Q326,170 320,250 Z', fizz, { sw: 4.5 }),
    P('M282,236 Q276,170 270,104 M302,236 Q306,168 312,104', 'none', { stroke: '#ffffff', sw: 4, op: 0.6 }),
    cloud(294, 46, 34, '#fff7ee', PUFF, 4.5),
    [[262, 150, 6], [324, 120, 5], [284, 84, 4.5], [330, 196, 5], [254, 206, 4], [312, 64, 4]].map(([x, y, r]) => bubble(x, y, r)),
    drop(232, 80, 0.8, '#c98a5a', -40), drop(362, 70, 0.75, '#c98a5a', 40), drop(240, 140, 0.6, '#c98a5a', -60),
    // unlocked: an open padlock glint
    G(T(372, 160), P('M-10,-6 L-10,-18 Q-10,-30 2,-30 Q14,-30 14,-20', 'none', { sw: 9 }), P('M-10,-6 L-10,-18 Q-10,-30 2,-30 Q14,-30 14,-20', 'none', { stroke: '#ffd23a', sw: 4 }), R(-18, -8, 30, 26, 6, '#ffd23a', { sw: 4 }), C(-3, 4, 3.5, INK, { none: true })),
    sparkle(392, 124, 7), sparkle(346, 196, 6),
    sodaCan(d, 294, 290, 0.95, 4),
    burst(294, 330, 34, 18, 10, '#ffffff', { sw: 3.5, op: 0.85 }),
    // the pan slamming down
    G(T(158, 330, -8),
      R(-150, -13, 64, 26, 12, handle),
      R(-104, -16, 26, 30, 8, '#3b3550', { sw: 4 }),
      E(0, 0, 112, 30, iron, { sw: 5 }),
      E(0, -4, 94, 20, d.lin([[0, '#8a83a8'], [1, '#4a4361']]), { sw: 3.5 }),
      shine('M-84,-10 Q-40,-22 20,-20 Q-30,-14 -80,-4 Z', 0.35)),
    face(164, 316, 0.95, 'determined', { look: [4, 0], body: '#423b57' }),
    speed(128, 230, 138, 268, 4), speed(168, 222, 172, 262, 4), speed(208, 230, 202, 266, 4),
  ];
}

// small seeded random for repeatable scatter
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const UTENSILS = [
  { slug: 'knife', draw: knife },
  { slug: 'ice-cream-machine', draw: iceCreamMachine },
  { slug: 'spoon', draw: spoon },
  { slug: 'blow-torch', draw: blowTorch },
  { slug: 'whisk', draw: whisk },
  { slug: 'blender', draw: blender },
  { slug: 'rolling-pin', draw: rollingPin },
  { slug: 'microwave', draw: microwave },
  { slug: 'grater', draw: grater },
  { slug: 'spatula', draw: spatula },
  { slug: 'deep-fryer', draw: deepFryer },
  { slug: 'mortar-and-pestle', draw: mortarPestle },
  { slug: 'toaster', draw: toaster },
  { slug: 'colander', draw: colander },
  { slug: 'cotton-candy-machine', draw: cottonCandy },
  { slug: 'popcorn-popper', draw: popcornPopper },
  { slug: 'peeler', draw: peeler },
  { slug: 'mixer', draw: mixer },
  { slug: 'oven-mitt', draw: ovenMitt },
  { slug: 'pan', draw: pan },
];

export function render(u, i) {
  const d = new Doc(`u${i + 1}-`);
  const body = u.draw(d).flat(Infinity).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">\n<defs>${d.defs.join('')}</defs>\n${body}\n</svg>\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.join(HERE, 'svg');
  fs.mkdirSync(dir, { recursive: true });
  UTENSILS.forEach((u, i) => {
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${u.slug}.svg`);
    fs.writeFileSync(file, render(u, i));
  });
  console.log(`wrote ${UTENSILS.length} SVGs to ${dir}`);
}
