// Entry point: renderer and quality presets (GDD 11.5), menus, and the frame loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './fx.js';
import { FOODS, FOOD_IDS, makeFoodMesh, setFoodShadows } from './foods.js';
import { TITANS } from './game.js';
import { Net, roomAvailable, cleanRoom } from './net.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);

// Low: no shadow map, blob shadows. Medium: shadows baked once (static scenery) plus blob
// shadows. High: shadows every frame for everything, plus bloom. All tiers scale resolution
// automatically to hold the frame rate (GDD 11.5-11.7).
// Low also shortens the view distance (fog and far clip), so less of the kitchen is drawn.
const QUALITY = {
  low: { name: 'Low', pixelRatio: Math.min(devicePixelRatio || 1, 1.25) * 0.7, shadows: 0, dynamicShadows: false, bloom: false, particles: 0.35, splatRes: 1024, antialias: false, far: 430, fog: [130, 410], minScale: 0.45 },
  medium: { name: 'Medium', pixelRatio: Math.min(devicePixelRatio || 1, 1.5), shadows: 2048, dynamicShadows: false, bloom: false, particles: 0.7, splatRes: 1536, antialias: true, far: 1400, fog: [240, 720], minScale: 0.55 },
  high: { name: 'High', pixelRatio: Math.min(devicePixelRatio || 1, 2), shadows: 4096, dynamicShadows: true, bloom: true, particles: 1, splatRes: 2048, antialias: true, far: 1400, fog: [240, 720], minScale: 0.55 },
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
  const quality = { ...QUALITY[qKey] }; // one live object shared by the whole game; the setting switches it in place
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
  renderer.shadowMap.enabled = !!quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // Medium bakes the static scenery once; High refreshes at 30 Hz

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1400);
  scene.add(camera); // the first-person viewmodel hangs off the camera
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

  function enterPlay() {
    game.paused = false;
    playing = true;
    input.enabled = true;
    menu.hidden = true; end.hidden = true; pause.hidden = true;
    hud.show(true);
    touch.hidden = !input.isTouch;
    if (!input.isTouch) input.requestLock();
  }
  function start() {
    sfx.unlock();
    game.newMatch(true);
    enterPlay();
  }
  async function toMenu() {
    if (game.online) await game.stopOnline();
    playing = false; input.enabled = false; end.hidden = true; pause.hidden = true; hud.show(false); touch.hidden = true;
    menu.hidden = false; input.exitLock();
    game.newMatch(false);
  }
  $('play').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('end-menu').addEventListener('click', toMenu);
  $('leave').addEventListener('click', toMenu);
  $('hud-menu').addEventListener('click', toMenu);

  // Online: join a room code; everyone with the same code plays together.
  const status = $('online-status');
  try { $('nick').value = localStorage.getItem('tt-nick') || ''; } catch { /* storage blocked */ }
  $('online-open').addEventListener('click', () => { $('online').hidden = !$('online').hidden; if (!$('online').hidden) $('nick').focus(); });
  $('online').addEventListener('submit', async (e) => {
    e.preventDefault();
    sfx.unlock();
    const btn = $('online-join');
    btn.disabled = true;
    status.className = ''; status.textContent = 'Connecting…';
    const lobby = await roomAvailable();
    if (!lobby) {
      status.className = 'err';
      status.textContent = "Online play isn't available here. It works on the published game page on claude.ai when you're signed in; people you share the page with can join the same room code.";
      btn.disabled = false;
      return;
    }
    try {
      const net = new Net(game);
      const nick = $('nick').value || 'Titan';
      await net.connect(lobby, cleanRoom($('roomcode').value), nick);
      try { localStorage.setItem('tt-nick', nick); } catch { /* storage blocked */ }
      game.startOnline(net);
      status.textContent = '';
      enterPlay();
    } catch (err) {
      status.className = 'err';
      status.textContent = `Couldn't join that room (${(err && (err.code || err.message)) || 'unknown error'}). Check the room code and try again.`;
    } finally { btn.disabled = false; }
  });
  $('spectate').addEventListener('click', () => { end.hidden = true; });
  $('resume').addEventListener('click', () => { pause.hidden = true; game.paused = false; input.requestLock(); });


  input.onLockChange = (locked) => {
    if (!playing || input.isTouch) return;
    if (!locked && game.state !== 'over' && game.player?.alive && end.hidden) { game.paused = !game.online; pause.hidden = false; } // online games keep running
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && playing && !input.isTouch && !game.online) { game.paused = !game.paused; pause.hidden = !game.paused; }
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
      setTimeout(() => { end.hidden = false; touch.hidden = true; input.exitLock(); }, 1400);
    }
    if (type === 'over') {
      const won = data.winner && data.winner === game.player;
      $('end-title').textContent = won ? "Chef's Kiss!" : 'Match over';
      $('end-sub').textContent = won ? 'Last Bite Standing. The whole kitchen is yours.' : `${data.winner ? data.winner.name : 'Nobody'} took the Last Bite.`;
      $('end-kills').textContent = game.player.kills;
      $('end-place').textContent = `#${game.player.placement || 1}`;
      $('spectate').hidden = true;
      setTimeout(() => { end.hidden = false; touch.hidden = true; input.exitLock(); }, won ? 2600 : 1600);
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
  // Aim stick (phones): holding it is the trigger, dragging it aims. Charge foods charge while
  // held and throw on release; blueberries stream while held; tap foods throw at once.
  const aimEl = $('tFire'), aimKnob = aimEl.querySelector('.knob');
  const aimR = 44;
  let aimId = null, aimLast = null, aimC = null;
  input.aimEdge = { x: 0, y: 0 };
  const aimEnd = () => {
    aimId = null; input.touch.fire = false; input.aimEdge.x = input.aimEdge.y = 0;
    aimKnob.style.transform = ''; aimEl.classList.remove('active');
  };
  aimEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (aimId !== null) return;
    const t = e.changedTouches[0];
    aimId = t.identifier; aimLast = { x: t.clientX, y: t.clientY };
    const r = aimEl.getBoundingClientRect();
    aimC = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    input.touch.fire = true;
    aimEl.classList.add('active');
  }, { passive: false });
  aimEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== aimId) continue;
      input.look(t.clientX - aimLast.x, t.clientY - aimLast.y, 0.006 * input.zoomSens);
      aimLast = { x: t.clientX, y: t.clientY };
      const dx = t.clientX - aimC.x, dy = t.clientY - aimC.y, l = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, aimR / l);
      aimKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      // held past the ring: keep turning, like a console stick
      const edge = Math.min(1, Math.max(0, (l - aimR) / aimR));
      input.aimEdge.x = (dx / l) * edge; input.aimEdge.y = (dy / l) * edge;
    }
  }, { passive: false });
  for (const ev of ['touchend', 'touchcancel']) {
    aimEl.addEventListener(ev, (e) => { for (const t of e.changedTouches) if (t.identifier === aimId) aimEnd(); });
  }
  hold('tJump', () => { input.pressed.jump = true; });
  hold('tDash', () => { input.pressed.dodge = true; });
  hold('tAlt', () => { input.pressed.alt = true; });
  hold('tSniff', () => { input.pressed.sniff = true; });
  const stick = $('stick');
  input.onStick = (phase, x, y) => {
    if (phase === 'start') { stick.style.left = `${x}px`; stick.style.top = `${y}px`; stick.classList.add('on'); stick.firstElementChild.style.transform = ''; }
    if (phase === 'move') { const r = stick.getBoundingClientRect(); stick.firstElementChild.style.transform = `translate(${x - r.left - r.width / 2}px, ${y - r.top - r.height / 2}px)`; }
    if (phase === 'end') stick.classList.remove('on');
  };

  // Bloom on High: emissive burners, honey, sunlight and the carrot glint glow.
  let composer = null;
  const makeComposer = () => {
    const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.45, 0.88));
    c.addPass(new OutputPass());
    c.setPixelRatio(quality.pixelRatio);
    c.setSize(innerWidth, innerHeight);
    return c;
  };
  if (quality.bloom) composer = makeComposer();

  // Dynamic resolution: drop render scale when the frame rate sags, restore it when there's headroom.
  let resScale = 1, fpsEma = 60, adjustT = 0;
  const applyScale = () => {
    renderer.setPixelRatio(quality.pixelRatio * resScale);
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(quality.pixelRatio * resScale); composer.setSize(innerWidth, innerHeight); }
  };

  // Switch the graphics setting live (no reload), in any mode, including online games.
  function applyQuality(key) {
    if (!QUALITY[key]) return;
    Object.assign(quality, QUALITY[key]);
    const sun = game.world.sun;
    renderer.shadowMap.enabled = !!quality.shadows;
    sun.castShadow = !!quality.shadows;
    if (quality.shadows && sun.shadow.mapSize.x !== quality.shadows) {
      sun.shadow.mapSize.set(quality.shadows, quality.shadows);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
    setFoodShadows(quality.dynamicShadows);
    for (const a of game.actors.concat(game.botActors)) {
      a.root.traverse((o) => { if (o.isMesh) o.castShadow = !!quality.dynamicShadows && o !== a.iceBlock; });
    }
    scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    game.fx.scale = quality.particles;
    game.world.setAtmosphere(quality.name !== 'Low');
    camera.far = quality.far; camera.updateProjectionMatrix();
    scene.fog.near = quality.fog[0]; scene.fog.far = quality.fog[1];
    if (quality.bloom && !composer) composer = makeComposer();
    resScale = 1; applyScale();
    for (const id of ['quality', 'quality2']) { const el = $(id); if (el) el.value = key; }
    try { localStorage.setItem('tt-quality', key); } catch { /* storage blocked */ }
  }
  applyQuality(qKey);
  for (const id of ['quality', 'quality2']) $(id)?.addEventListener('change', (e) => applyQuality(e.target.value));
  game.perf = { get scale() { return resScale; }, get fps() { return fpsEma; } };

  addEventListener('resize', () => {
    applyScale();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  game.newMatch(false); // bots fight behind the menu

  // Compile every shader up front (in parallel where the browser supports it) so the first
  // throw of each food doesn't stutter.
  const warm = new THREE.Group();
  for (const id of [...FOOD_IDS, 'peel', 'grape', 'melonchunk']) warm.add(makeFoodMesh(id));
  warm.position.set(0, -30, 0);
  scene.add(warm);
  renderer.compileAsync(scene, camera).catch(() => {}).finally(() => scene.remove(warm));
  let last = performance.now(), frameNo = 0;
  renderer.info.autoReset = false; // count draw calls across all passes for the perf readout
  renderer.setAnimationLoop((now) => {
    renderer.info.reset();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // rAF time can precede `last`
    last = now;
    if (input.aimEdge && (input.aimEdge.x || input.aimEdge.y)) input.look(input.aimEdge.x * 320 * dt, input.aimEdge.y * 200 * dt, 0.006 * input.zoomSens);
    game.update(dt);
    if (game.world.shadowDirty && quality.shadows && !quality.dynamicShadows) { renderer.shadowMap.needsUpdate = true; game.world.shadowDirty = false; }
    // High: moving shadows refresh at 30 Hz instead of every frame (half the shadow cost).
    if (quality.dynamicShadows) renderer.shadowMap.needsUpdate = (frameNo++ & 1) === 0;
    if (composer && quality.bloom) composer.render(dt); else renderer.render(scene, camera);
    game.lastDrawCalls = renderer.info.render.calls;

    if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
    adjustT += dt;
    if (adjustT > 1.2) {
      adjustT = 0;
      if (fpsEma < 50 && resScale > quality.minScale) { resScale = Math.max(quality.minScale, resScale - 0.1); applyScale(); }
      else if (fpsEma > 58 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); applyScale(); }
    }
  });
}

boot();
