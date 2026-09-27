// Entry point: renderer and quality presets (GDD 11.5), menus, and the frame loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './fx.js';
import { FOODS, FOOD_IDS, makeFoodMesh, setFoodShadows } from './foods.js';
import { TITANS } from './game.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);

// Low: no shadow map, blob shadows. Medium: shadows baked once (static scenery) plus blob
// shadows. High: shadows every frame for everything, plus bloom. All tiers scale resolution
// automatically to hold the frame rate (GDD 11.5-11.7).
const QUALITY = {
  low: { name: 'Low', pixelRatio: Math.min(devicePixelRatio || 1, 1.25) * 0.75, shadows: 0, dynamicShadows: false, bloom: false, particles: 0.4, splatRes: 1024, antialias: false },
  medium: { name: 'Medium', pixelRatio: Math.min(devicePixelRatio || 1, 1.5), shadows: 2048, dynamicShadows: false, bloom: false, particles: 0.7, splatRes: 1536, antialias: true },
  high: { name: 'High', pixelRatio: Math.min(devicePixelRatio || 1, 2), shadows: 4096, dynamicShadows: true, bloom: true, particles: 1, splatRes: 2048, antialias: true },
};

function readQuality() {
  const h = location.hash.replace('#', '');
  if (h.startsWith('q-') && QUALITY[h.slice(2)]) return h.slice(2);
  try { const s = localStorage.getItem('tt-quality'); if (s && QUALITY[s]) return s; } catch { /* storage blocked */ }
  return matchMedia('(pointer: coarse)').matches ? 'low' : 'medium';
}

// Food icons for the hotbar, rendered once from the real 3D meshes.
function renderIcons() {
  const icons = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return icons; }
  r.setSize(128, 128, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight('#fff3e0', '#6b4a2e', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const id of [...FOOD_IDS, 'peel']) {
    const m = makeFoodMesh(id);
    const pose = { carrot: [0.2, Math.PI / 2 + 0.5, 0.6], banana: [0.3, 0, 0.2], cheese: [0.6, 0, 0.15], soda: [0.25, 0.4, -0.2], peel: [0.9, 0.3, 0], ice: [0.5, 0.6, 0] }[id] || [0.3, 0.4, 0];
    m.rotation.set(pose[0], pose[1], pose[2]);
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    cam.position.set(sph.center.x, sph.center.y + sph.radius * 0.4, sph.center.z + sph.radius * 3.9);
    cam.lookAt(sph.center);
    r.render(scene, cam);
    icons[id] = r.domElement.toDataURL('image/png');
    scene.remove(m);
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss?.();
  return icons;
}

function boot() {
  const qKey = readQuality();
  const quality = QUALITY[qKey];
  $('quality').value = qKey;
  const canvas = $('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
  } catch (e) {
    $('menu-error').hidden = false;
    $('menu-error').textContent = 'WebGL is not available in this browser, so the game cannot start. Try a recent Chrome, Edge, Firefox or Safari.';
    return;
  }
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (quality.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = quality.dynamicShadows; // Medium bakes the static scenery once
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1400);
  const input = new Input(canvas);
  const sfx = new Sfx();
  const icons = renderIcons();
  setFoodShadows(quality.dynamicShadows);
  const hud = new HUD(icons, input);
  const game = new Game({ renderer, scene, camera, quality, hud, input, sfx });
  window.__game = game; // handy for debugging in the console

  // Menu food legend, using the same rendered icons.
  $('legend').innerHTML = FOOD_IDS.map((id) => {
    const f = FOODS[id];
    return `<li><img src="${icons[id] || ''}" alt=""><div><b>${f.name}</b><span>${f.hint}</span></div></li>`;
  }).join('');

  const menu = $('menu'), pause = $('pause'), end = $('end'), touch = $('touch');
  let playing = false;

  function start() {
    sfx.unlock();
    game.newMatch(true);
    game.paused = false;
    playing = true;
    input.enabled = true;
    menu.hidden = true; end.hidden = true; pause.hidden = true;
    hud.show(true);
    touch.hidden = !input.isTouch;
    if (!input.isTouch) input.requestLock();
  }
  $('play').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('end-menu').addEventListener('click', () => {
    playing = false; input.enabled = false; end.hidden = true; hud.show(false); touch.hidden = true;
    menu.hidden = false; input.exitLock();
    game.newMatch(false);
  });
  $('spectate').addEventListener('click', () => { end.hidden = true; });
  $('resume').addEventListener('click', () => { pause.hidden = true; game.paused = false; input.requestLock(); });
  $('quality').addEventListener('change', (e) => {
    const v = e.target.value;
    try { localStorage.setItem('tt-quality', v); } catch { /* storage blocked: the hash carries it */ }
    location.hash = `q-${v}`;
    location.reload();
  });

  input.onLockChange = (locked) => {
    if (!playing || input.isTouch) return;
    if (!locked && game.state !== 'over' && game.player?.alive && end.hidden) { game.paused = true; pause.hidden = false; }
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && playing && !input.isTouch) { game.paused = !game.paused; pause.hidden = !game.paused; }
  });

  game.onMatchEvent = (type, data) => {
    if (!playing) {
      if (type === 'over') setTimeout(() => { if (!playing) game.newMatch(false); }, 5000);
      return;
    }
    if (type === 'playerDown') {
      const k = data.killer ? `${data.killer.name} got you` : 'The kitchen got you';
      $('end-title').textContent = 'Splatted!';
      $('end-sub').textContent = `${k}. You placed #${data.placement} of ${TITANS}.`;
      $('end-kills').textContent = game.player.kills;
      $('end-place').textContent = `#${data.placement}`;
      $('spectate').hidden = false;
      setTimeout(() => { end.hidden = false; input.exitLock(); }, 1400);
    }
    if (type === 'over') {
      const won = data.winner && data.winner === game.player;
      $('end-title').textContent = won ? "Chef's Kiss!" : 'Match over';
      $('end-sub').textContent = won ? 'Last Bite Standing. The whole kitchen is yours.' : `${data.winner ? data.winner.name : 'Nobody'} took the Last Bite.`;
      $('end-kills').textContent = game.player.kills;
      $('end-place').textContent = `#${game.player.placement || 1}`;
      $('spectate').hidden = true;
      setTimeout(() => { end.hidden = false; input.exitLock(); }, won ? 2600 : 1600);
    }
  };

  // touch buttons
  input.bindTouch(document.body);
  const hold = (id, on, off) => {
    const b = $(id);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); off?.(); });
    b.addEventListener('touchcancel', () => off?.());
  };
  hold('tFire', () => { input.touch.fire = true; }, () => { input.touch.fire = false; });
  hold('tJump', () => { input.pressed.jump = true; });
  hold('tRoll', () => { input.pressed.dodge = true; });
  hold('tAlt', () => { input.pressed.alt = true; });
  const stick = $('stick');
  input.onStick = (phase, x, y) => {
    if (phase === 'start') { stick.style.left = `${x}px`; stick.style.top = `${y}px`; stick.classList.add('on'); stick.firstElementChild.style.transform = ''; }
    if (phase === 'move') { const r = stick.getBoundingClientRect(); stick.firstElementChild.style.transform = `translate(${x - r.left - r.width / 2}px, ${y - r.top - r.height / 2}px)`; }
    if (phase === 'end') stick.classList.remove('on');
  };

  // Bloom on High: emissive burners, honey, sunlight and the carrot glint glow.
  let composer = null;
  if (quality.bloom) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.45, 0.88));
    composer.addPass(new OutputPass());
    composer.setPixelRatio(quality.pixelRatio);
    composer.setSize(innerWidth, innerHeight);
  }

  // Dynamic resolution: drop render scale when the frame rate sags, restore it when there's headroom.
  let resScale = 1, fpsEma = 60, adjustT = 0;
  const applyScale = () => {
    renderer.setPixelRatio(quality.pixelRatio * resScale);
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(quality.pixelRatio * resScale); composer.setSize(innerWidth, innerHeight); }
  };
  game.perf = { get scale() { return resScale; }, get fps() { return fpsEma; } };

  addEventListener('resize', () => {
    applyScale();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  game.newMatch(false); // bots fight behind the menu
  let last = performance.now();
  renderer.info.autoReset = false; // count draw calls across all passes for the perf readout
  renderer.setAnimationLoop((now) => {
    renderer.info.reset();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // rAF time can precede `last`
    last = now;
    game.update(dt);
    if (game.world.shadowDirty && quality.shadows && !quality.dynamicShadows) { renderer.shadowMap.needsUpdate = true; game.world.shadowDirty = false; }
    if (composer) composer.render(dt); else renderer.render(scene, camera);

    if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
    adjustT += dt;
    if (adjustT > 1.2) {
      adjustT = 0;
      if (fpsEma < 50 && resScale > 0.55) { resScale = Math.max(0.55, resScale - 0.1); applyScale(); }
      else if (fpsEma > 58 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); applyScale(); }
    }
  });
}

boot();
