// Entry point: renderer and quality presets (GDD 11.5), menus, and the frame loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './fx.js';
import { FOODS, FOOD_IDS, makeFoodMesh, setFoodShadows } from './foods.js';
import { SKINS, SKIN_BY_ID, RARITY } from './skins.js';
import { titanPreview } from './actors.js';
import { TITANS } from './game.js';
import { Net, roomAvailable, cleanRoom } from './net.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';

// Screen-space passes can leave a stray NaN pixel (e.g. right at the camera); bloom would smear it across
// the whole screen, so it is replaced before bloom runs.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(32.0)), 1.0);
    }`,
};

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
  // Locker thumbnails: each skin on a standing Titan, turned a little toward the light.
  for (const s of SKINS) {
    const m = titanPreview(s.id);
    m.rotation.y = 0.45;
    scene.add(m);
    cam.position.set(0, 1.25, 4.1);
    cam.lookAt(0, 1.08, 0);
    r.render(scene, cam);
    icons['skin:' + s.id] = r.domElement.toDataURL('image/png');
    scene.remove(m);
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss?.();
  return icons;
}

function boot() {
  let qKey = readQuality();
  const quality = { ...QUALITY[qKey] }; // one live object shared by the whole game; the setting switches it in place
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
  let matchOpts = {}; // what "Play again" repeats
  function start(opts = matchOpts) {
    sfx.unlock();
    matchOpts = opts;
    game.newMatch(true, opts);
    enterPlay();
  }
  async function toMenu() {
    if (game.online) await game.stopOnline();
    playing = false; input.enabled = false; end.hidden = true; pause.hidden = true; hud.show(false); touch.hidden = true;
    menu.hidden = false; input.exitLock();
    $('modes').hidden = true; $('chef').hidden = true; $('mode-chef').setAttribute('aria-expanded', 'false');
    game.newMatch(false);
  }
  // Play opens the mode chooser: Classic starts right away, Chef's Choice opens the food picker.
  const reveal = (el) => requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  $('play').addEventListener('click', () => {
    $('modes').hidden = false; $('online').hidden = true; $('locker').hidden = true;
    reveal($('modes'));
  });
  $('mode-classic').addEventListener('click', () => start({}));
  $('mode-chef').addEventListener('click', () => {
    const open = $('chef').hidden;
    $('chef').hidden = !open; $('mode-chef').setAttribute('aria-expanded', String(open));
    if (open) reveal($('chef'));
  });
  $('again').addEventListener('click', () => start());

  // Locker: pick a skin. Remembered on this device and shown to everyone online.
  let skinId = 'chef';
  try { skinId = SKIN_BY_ID[localStorage.getItem('tt-skin')] ? localStorage.getItem('tt-skin') : 'chef'; } catch { /* storage blocked */ }
  game.playerSkin = skinId;
  const lockerGrid = $('locker-grid');
  lockerGrid.innerHTML = SKINS.map((s) => `<button type="button" data-id="${s.id}" aria-pressed="false" style="--rar:${RARITY[s.rarity].color}" title="${s.desc}"><img src="${icons['skin:' + s.id] || ''}" alt=""><b>${s.name}</b><small>${RARITY[s.rarity].name}</small></button>`).join('');
  function renderLocker() {
    for (const b of lockerGrid.children) b.setAttribute('aria-pressed', b.dataset.id === skinId ? 'true' : 'false');
    const s = SKIN_BY_ID[skinId];
    $('locker-now').innerHTML = `Wearing <b style="color:${RARITY[s.rarity].color}">${s.name}</b>: ${s.desc}`;
    $('locker-open').textContent = `Locker · ${s.name}`;
  }
  lockerGrid.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    skinId = b.dataset.id; game.playerSkin = skinId;
    try { localStorage.setItem('tt-skin', skinId); } catch { /* storage blocked */ }
    renderLocker();
  });
  renderLocker();
  $('locker-open').addEventListener('click', () => {
    $('locker').hidden = !$('locker').hidden; $('modes').hidden = true; $('online').hidden = true;
    if (!$('locker').hidden) reveal($('locker'));
  });

  // Chef's Choice: pick 3 foods that never run out; nothing spawns on the map.
  let chefPick = [];
  try { chefPick = JSON.parse(localStorage.getItem('tt-chef') || '[]').filter((id) => FOOD_IDS.includes(id)).slice(0, 3); } catch { /* storage blocked */ }
  const chefGrid = $('chef-grid');
  chefGrid.innerHTML = FOOD_IDS.map((id) => `<button type="button" data-id="${id}" aria-pressed="false"><img src="${icons[id] || ''}" alt=""><span>${FOODS[id].name}</span><small>${FOODS[id].role.replace(/ · (heal|snack)$/, '')}</small></button>`).join('');
  function renderChef() {
    for (const b of chefGrid.children) {
      const i = chefPick.indexOf(b.dataset.id);
      b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      b.dataset.n = i >= 0 ? i + 1 : '';
      b.disabled = i < 0 && chefPick.length >= 3;
    }
    const left = 3 - chefPick.length;
    $('chef-play').disabled = left > 0;
    $('chef-play').textContent = left > 0 ? `Pick ${left} more food${left > 1 ? 's' : ''}` : 'Start Chef\'s Choice';
  }
  chefGrid.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.id, i = chefPick.indexOf(id);
    if (i >= 0) chefPick.splice(i, 1); else if (chefPick.length < 3) chefPick.push(id);
    try { localStorage.setItem('tt-chef', JSON.stringify(chefPick)); } catch { /* storage blocked */ }
    renderChef();
  });
  renderChef();
  $('chef-play').addEventListener('click', () => { if (chefPick.length === 3) start({ mode: 'chef', loadout: [...chefPick] }); });
  $('end-menu').addEventListener('click', toMenu);
  $('leave').addEventListener('click', toMenu);
  $('hud-menu').addEventListener('click', toMenu);

  // Online: join a room code; everyone with the same code plays together.
  const status = $('online-status');
  try { $('nick').value = localStorage.getItem('tt-nick') || ''; } catch { /* storage blocked */ }
  $('online-open').addEventListener('click', () => { $('online').hidden = !$('online').hidden; $('modes').hidden = true; $('locker').hidden = true; if (!$('online').hidden) $('nick').focus(); });
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

  // Graphics settings on top of the preset: ray tracing, resolution and particles ('auto' follows the preset).
  const RT_LABEL = { off: 'Off', reflections: 'Reflections', full: 'Reflections + ambient occlusion' };
  const RES = { auto: 0, 50: 0.5, 75: 0.75, 100: 1, 125: 1.25 };
  const PARTICLES = { off: 0, low: 0.35, medium: 0.7, high: 1, ultra: 1.6 };
  let gfx = { rt: 'off', res: 'auto', particles: 'auto' };
  try { gfx = { ...gfx, ...JSON.parse(localStorage.getItem('tt-gfx') || '{}') }; } catch { /* storage blocked */ }
  if (!RT_LABEL[gfx.rt]) gfx.rt = 'off';
  if (!(gfx.res in RES)) gfx.res = 'auto';
  if (gfx.particles !== 'auto' && !(gfx.particles in PARTICLES)) gfx.particles = 'auto';

  // Post-processing. Bloom on High: burners, honey, sunlight and the carrot glint glow.
  // Ray tracing (screen-space, the kind browsers can run): rays are marched through the depth buffer.
  //  - Reflections (SSR): shiny floors, tiles, steel and glazed pots reflect Titans and food.
  //  - Ambient occlusion (GTAO): soft contact shadows in corners, under counters and around props.
  let composer = null;
  const shinyMeshes = () => scene.children.filter((o) => o.isMesh && (o.userData.merged || o.userData.world) && !o.material.transparent
    && (o.material.roughness ?? 1) <= 0.35);
  const disposeComposer = () => {
    if (!composer) return;
    for (const p of composer.passes) p.dispose?.();
    composer.dispose?.();
    composer = null;
  };
  const makeComposer = () => {
    disposeComposer();
    const rt = gfx.rt !== 'off';
    if (!quality.bloom && !rt) return null;
    // screen-space passes read depth/normals from their own targets, so MSAA is only used without them
    const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: rt ? 0 : 4 }));
    if (rt) {
      const ssr = new SSRPass({ renderer, scene, camera, width: innerWidth, height: innerHeight, selects: shinyMeshes() });
      ssr.opacity = 0.5; ssr.maxDistance = 40; ssr.thickness = 0.35;
      ssr.fresnel = true; ssr.distanceAttenuation = true; ssr.infiniteThick = false;
      c.addPass(ssr);
    } else c.addPass(new RenderPass(scene, camera));
    if (gfx.rt === 'full') {
      const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
      ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1, thickness: 1.5, scale: 1, samples: 12 });
      ao.blendIntensity = 0.9;
      c.addPass(ao);
    }
    if (rt) c.addPass(new ShaderPass(SanitizeShader));
    if (quality.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.3, 1.9));
    c.addPass(new OutputPass());
    if (rt) c.addPass(new FXAAPass()); // no MSAA with the screen-space passes, so smooth edges afterwards
    c.setPixelRatio(quality.pixelRatio * resScale);
    c.setSize(innerWidth, innerHeight);
    return c;
  };

  // Dynamic resolution: drop render scale when the frame rate sags, restore it when there's headroom.
  // A fixed Resolution setting turns this off.
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
    game.fx.scale = gfx.particles === 'auto' ? quality.particles : PARTICLES[gfx.particles];
    game.world.setAtmosphere(quality.name !== 'Low');
    camera.far = quality.far; camera.updateProjectionMatrix();
    scene.fog.near = quality.fog[0]; scene.fog.far = quality.fog[1];
    resScale = RES[gfx.res] || 1;
    composer = makeComposer();
    applyScale();
    for (const el of document.querySelectorAll('[data-gfx="preset"]')) el.value = key;
    qKey = key;
    try { localStorage.setItem('tt-quality', key); } catch { /* storage blocked */ }
  }
  // One settings panel is rendered into the menu and into the pause card; every copy stays in sync.
  const gfxPanel = (presetId) => `
    <label class="field" for="${presetId}">Preset <select id="${presetId}" data-gfx="preset"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
    <label class="field">Ray tracing <select data-gfx="rt">${Object.entries(RT_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="field">Resolution <select data-gfx="res"><option value="auto">Auto (keeps it smooth)</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option><option value="125">125% (sharpest)</option></select></label>
    <label class="field">Particle effects <select data-gfx="particles"><option value="auto">Preset</option><option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
    <p class="gfx-note">Ray tracing is heavy: it traces reflections and soft shadows on screen every frame. Best on a strong computer; on phones, try Reflections with Resolution at 75%.</p>`;
  $('gfx-menu').innerHTML = gfxPanel('quality');
  $('gfx-pause').innerHTML = gfxPanel('quality2');
  const syncGfx = () => {
    for (const el of document.querySelectorAll('[data-gfx]')) el.value = el.dataset.gfx === 'preset' ? qKey : gfx[el.dataset.gfx];
  };
  document.addEventListener('change', (e) => {
    const k = e.target.dataset?.gfx;
    if (!k) return;
    if (k === 'preset') applyQuality(e.target.value);
    else {
      gfx[k] = e.target.value;
      try { localStorage.setItem('tt-gfx', JSON.stringify(gfx)); } catch { /* storage blocked */ }
      applyQuality(qKey); // rebuilds passes, resolution and particle density
    }
    syncGfx();
  });
  $('gfx-open').addEventListener('click', () => {
    $('gfx-menu').hidden = !$('gfx-menu').hidden;
    if (!$('gfx-menu').hidden) requestAnimationFrame(() => $('gfx-menu').scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  });
  applyQuality(qKey);
  syncGfx();
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
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    game.lastDrawCalls = renderer.info.render.calls;

    if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
    adjustT += dt;
    if (adjustT > 1.2) {
      adjustT = 0;
      if (gfx.res !== 'auto') { /* fixed resolution chosen in settings */ } else if (fpsEma < 50 && resScale > quality.minScale) { resScale = Math.max(quality.minScale, resScale - 0.1); applyScale(); }
      else if (fpsEma > 58 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); applyScale(); }
    }
  });
}

boot();
