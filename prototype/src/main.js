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
import { BOT_LEVELS } from './bots.js';
import { MAPS } from './world.js';
import { TEAMS, TEAM_LABEL, teamCount, cleanSize } from './teams.js';
import { Net, roomAvailable, cleanRoom } from './net.js';
import { UTENSILS, UTENSIL_BY_ID, UTENSIL_IDS, utensilIcon, setUtensilIcons } from './utensils.js';
import { makeUtensilMesh } from './utensil-models.js';
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
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  // Utensil icons from the 3D models, tilted a little so they read as objects
  const uicons = {};
  for (const id of UTENSIL_IDS) {
    const m = makeUtensilMesh(id);
    m.rotation.set(0.25, -0.5, -0.5);
    scene.add(m);
    const sph = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere());
    cam.position.set(sph.center.x, sph.center.y + sph.radius * 0.3, sph.center.z + sph.radius * 3.7);
    cam.lookAt(sph.center);
    r.render(scene, cam);
    uicons[id] = r.domElement.toDataURL('image/png');
    scene.remove(m);
  }
  setUtensilIcons(uicons);
  // Locker thumbnails: each skin on a standing Titan, turned a little toward the light (2x for sharp cards).
  r.setSize(192, 192, false);
  const rim = new THREE.DirectionalLight('#bfe0ff', 1.4);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  for (const s of SKINS) {
    const rig = titanPreview(s.id);
    rig.object.rotation.y = 0.42;
    scene.add(rig.object);
    cam.position.set(0, 1.08, 4.35);
    cam.lookAt(0, 1.0, 0);
    r.render(scene, cam);
    icons['skin:' + s.id] = r.domElement.toDataURL('image/png');
    scene.remove(rig.object);
    rig.material.dispose();
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
  const hud = new HUD(icons, input, sfx);
  let mapId = 'kitchen'; // the arena (see MAPS in world.js), remembered between visits
  try { const v = localStorage.getItem('tt-map'); if (MAPS[v]) mapId = v; } catch { /* storage blocked */ }
  const game = new Game({ renderer, scene, camera, quality, hud, input, sfx, map: mapId });
  window.__game = game; // handy for debugging in the console

  // Menu food legend, using the same rendered icons.
  $('legend').innerHTML = FOOD_IDS.map((id) => {
    const f = FOODS[id];
    return `<li><img src="${icons[id] || ''}" alt=""><div><b>${f.name}</b><span>${f.hint}</span></div></li>`;
  }).join('');

  // ... and the support utensils, with the same art as the design sheet
  $('ulegend').innerHTML = UTENSILS.map((u) => `<li><img src="${utensilIcon(u.id)}" alt=""><div><b>${u.name} · ${u.role}</b><span>${u.buff}</span><em>${u.trade}</em></div></li>`).join('');

  const menu = $('menu'), pause = $('pause'), end = $('end'), touch = $('touch');
  let playing = false;

  function enterPlay(lock = true) {
    closeStage();
    $('locker').hidden = true;
    game.paused = false;
    playing = true;
    input.enabled = true;
    menu.hidden = true; end.hidden = true; pause.hidden = true;
    hud.show(true);
    touch.hidden = !input.isTouch;
    $('tLadle').hidden = $('tTurret').hidden = game.mode !== 'pots';
    if (lock && !input.isTouch) input.requestLock(true);
  }
  let matchOpts = {}; // what "Play again" repeats
  // Match settings, remembered between visits and shared by Play vs bots and Play online: mode, team
  // size, map, bot difficulty (online rooms can also have no bots: onlineBots 'off'), your team.
  let botLevel = 'medium', onlineBots = 'medium', selMode = 'classic', teamSize = 1, myTeamPick = -1;
  try {
    const v = localStorage.getItem('tt-bots'); if (BOT_LEVELS[v]) botLevel = v;
    const o = localStorage.getItem('tt-online-bots'); if (BOT_LEVELS[o] || o === 'off') onlineBots = o;
    const m = localStorage.getItem('tt-mode') || localStorage.getItem('tt-online-mode'); if (['classic', 'chef', 'pots'].includes(m)) selMode = m;
    teamSize = cleanSize(localStorage.getItem('tt-team'), selMode);
    myTeamPick = Number(localStorage.getItem('tt-myteam') ?? -1);
    if (!Number.isInteger(myTeamPick)) myTeamPick = -1;
  } catch { /* storage blocked */ }
  const save = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage blocked */ } };
  const settings = $('match-settings');
  const forOnline = () => settings.classList.contains('online');
  const TEAM_NOTE = {
    1: 'Every Titan for themselves.',
    2: '6 teams of 2. Teammates can\'t hurt each other; the last team standing wins.',
    3: '4 teams of 3. Teammates can\'t hurt each other; the last team standing wins.',
    4: '3 teams of 4. Teammates can\'t hurt each other; the last team standing wins.',
  };
  const syncLevel = () => {
    const lv = forOnline() ? onlineBots : botLevel;
    teamSize = cleanSize(teamSize, selMode);
    document.querySelectorAll('#botlevel button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === lv)));
    document.querySelectorAll('#mappick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.map === mapId)));
    document.querySelectorAll('#onlinemode button, .modes .mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === selMode)));
    document.querySelectorAll('#teamsize button').forEach((b) => {
      b.setAttribute('aria-pressed', String(+b.dataset.team === teamSize));
      b.disabled = selMode === 'pots' && b.dataset.team === '1'; // Cooking Pot Wars is a team game
    });
    $('team-note').textContent = TEAM_NOTE[teamSize] + (selMode === 'pots' ? ' Cooking Pot Wars needs teams.' : '');
    $('map-note').textContent = MAPS[mapId].blurb;
    renderTeamPick();
    $('chef').hidden = selMode !== 'chef';
    renderStart();
  };
  // Your team (Play vs bots): a team, or "Any" (the emptiest one, with bots for teammates).
  function renderTeamPick() {
    const n = teamCount(teamSize);
    $('teampick-row').hidden = !n;
    if (!n) return;
    if (myTeamPick >= n) myTeamPick = -1;
    const html = `<button type="button" data-t="-1" aria-pressed="${myTeamPick < 0}"><b>Any team</b><small>The game picks</small></button>`
      + TEAMS.slice(0, n).map((T, t) => `<button type="button" data-t="${t}" aria-pressed="${myTeamPick === t}" style="--c:${T.color}"><b>${T.short}</b><small>You + ${teamSize - 1} bot${teamSize > 2 ? 's' : ''}</small></button>`).join('');
    if ($('teampick').innerHTML !== html) $('teampick').innerHTML = html;
  }
  $('teampick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    myTeamPick = +b.dataset.t; save('tt-myteam', myTeamPick);
    renderTeamPick();
  });
  $('botlevel').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    if (forOnline()) { onlineBots = b.dataset.level; save('tt-online-bots', onlineBots); }
    else { botLevel = b.dataset.level; save('tt-bots', botLevel); }
    syncLevel();
  });
  const pickMode = (m) => { selMode = m; save('tt-mode', selMode); if (m === 'pots' && teamSize < 2) { teamSize = 3; save('tt-team', 3); } syncLevel(); };
  $('onlinemode').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) pickMode(b.dataset.mode); });
  for (const b of document.querySelectorAll('.modes .mode')) b.addEventListener('click', () => pickMode(b.dataset.mode));
  $('teamsize').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-team]');
    if (!b || b.disabled) return;
    teamSize = +b.dataset.team; save('tt-team', teamSize);
    syncLevel();
  });
  // Picking a map rebuilds the kitchen (or the yard) right away: the bots behind the menu move there too.
  $('mappick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-map]');
    if (!b || b.dataset.map === mapId) return;
    mapId = b.dataset.map;
    save('tt-map', mapId);
    syncLevel();
    if (!playing && game.setMap(mapId)) game.newMatch(false);
  });
  // The settings block lives in whichever screen is open: Play vs bots or Play online.
  const placeSettings = (online) => {
    if (online) $('online-settings').appendChild(settings); else $('play-settings').appendChild(settings);
    settings.classList.toggle('online', online);
    syncLevel();
  };
  game.onMapChange = () => applyQuality(qKey); // fog distance, shadows and atmosphere for the new map
  function start(opts = matchOpts) {
    game.botLevel = botLevel;
    game.setMap(mapId);
    sfx.unlock();
    matchOpts = opts;
    game.newMatch(true, opts);
    enterPlay();
  }
  async function toMenu() {
    $('loadout').hidden = true;
    if (game.online) await game.stopOnline();
    playing = false; input.enabled = false; end.hidden = true; pause.hidden = true; hud.show(false); touch.hidden = true;
    menu.hidden = false; input.exitLock();
    showScreen('home');
    game.setMap(mapId); // an online room may have played the other map
    game.newMatch(false);
  }
  // Menu screens: home, Play vs bots, Play online, Locker, Settings, How to play.
  const panel = document.querySelector('.menu-panel');
  function showScreen(name) {
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.dataset.screen !== name;
    if (name === 'locker') openStage(); else closeStage();
    if (name === 'play') placeSettings(false);
    if (name === 'online') placeSettings(true);
    panel.scrollTop = 0;
    const focus = name === 'online' ? $('nick') : document.querySelector(`.screen[data-screen="${name}"] .back`) || $('play');
    requestAnimationFrame(() => focus?.focus({ preventScroll: true }));
  }
  for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => showScreen(b.dataset.go));
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menu.hidden && !playing) showScreen('home'); });
  // The Start button says what it starts (Chef's Choice needs 3 foods first).
  function renderStart() {
    const btn = $('play-start'), left = 3 - chefPick.length;
    const name = { classic: 'Classic', chef: "Chef's Choice", pots: 'Cooking Pot Wars' }[selMode];
    btn.disabled = selMode === 'chef' && left > 0;
    btn.textContent = btn.disabled ? `Pick ${left} more food${left > 1 ? 's' : ''}` : `Start ${name}${teamSize > 1 ? ` · ${TEAM_LABEL[teamSize]}` : ''}`;
  }
  $('play-start').addEventListener('click', () => {
    if (selMode === 'chef' && chefPick.length !== 3) return;
    start({ mode: selMode, team: teamSize, myTeam: myTeamPick, ...(selMode === 'chef' ? { loadout: [...chefPick], utensil: chefUtensil || null } : {}) });
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
    $('locker-open').querySelector('span').textContent = `Wearing ${s.name} · pick your skin`;
  }
  lockerGrid.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    skinId = b.dataset.id; game.playerSkin = skinId;
    try { localStorage.setItem('tt-skin', skinId); } catch { /* storage blocked */ }
    renderLocker();
    showOnStage(skinId);
  });
  renderLocker();

  // Locker stage: the selected skin on a live turntable (idles, blinks, waves when picked; drag to spin).
  // Its own small renderer, only alive while the Locker is open.
  let stage = null;
  function openStage() {
    if (stage) return;
    const box = $('locker-stage');
    let r;
    try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { box.hidden = true; return; }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    box.appendChild(r.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.add(new THREE.HemisphereLight('#fff3e0', '#6b4a2e', 0.8));
    const key = new THREE.DirectionalLight('#ffffff', 2.3); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd0ff', 1.8); rim.position.set(-3, 2.5, -3); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })()),
      transparent: true, depthWrite: false,
    }));
    scene.add(floor);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    stage = { r, scene, cam, box, rig: null, spin: 0.5, vel: 0.45, drag: null, t: 0, waveUntil: 0, last: performance.now(), raf: 0 };
    const cv = r.domElement;
    cv.addEventListener('pointerdown', (e) => { stage.drag = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!stage || stage.drag === null) return; const d = (e.clientX - stage.drag) * 0.012; stage.spin += d; stage.vel = d * 30; stage.drag = e.clientX; });
    const up = () => { if (stage) stage.drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    showOnStage(skinId);
    const loop = (now) => {
      if (!stage) return;
      stage.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - stage.last) / 1000);
      stage.last = now; stage.t += dt;
      const w = box.clientWidth, h = box.clientHeight;
      if (w && (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio()))) {
        r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      }
      const dist = cam.aspect < 0.9 ? 7 : 5.7; // room for tall hats and the wave
      cam.position.set(0, 1.18, dist); cam.lookAt(0, 1.06, 0);
      if (stage.drag === null) { stage.vel += (0.45 - stage.vel) * Math.min(1, dt * 2); stage.spin += stage.vel * dt; }
      if (stage.rig) {
        stage.rig.object.rotation.y = stage.spin;
        stage.rig.pose({ t: stage.t, onGround: true, lookAround: true, wave: stage.t < stage.waveUntil }, dt);
      }
      r.render(scene, cam);
    };
    stage.raf = requestAnimationFrame(loop);
  }
  function showOnStage(id) {
    if (!stage) return;
    if (stage.rig) { stage.scene.remove(stage.rig.object); stage.rig.material.dispose(); }
    stage.rig = titanPreview(id);
    stage.scene.add(stage.rig.object);
    stage.waveUntil = stage.t + 1.8;
    stage.box.style.setProperty('--rar', RARITY[SKIN_BY_ID[id].rarity].color);
  }
  function closeStage() {
    if (!stage) return;
    cancelAnimationFrame(stage.raf);
    stage.r.domElement.remove();
    stage.r.dispose(); stage.r.forceContextLoss?.();
    stage = null;
  }

  // Chef's Choice and the online loadout card share one pick (3 foods and a utensil), remembered.
  let chefPick = [];
  try { chefPick = JSON.parse(localStorage.getItem('tt-chef') || '[]').filter((id) => FOOD_IDS.includes(id)).slice(0, 3); } catch { /* storage blocked */ }
  const foodGrids = [$('chef-grid'), $('lo-foods')];
  const foodHtml = FOOD_IDS.map((id) => `<button type="button" data-id="${id}" aria-pressed="false"><img src="${icons[id] || ''}" alt=""><span>${FOODS[id].name}</span><small>${FOODS[id].role.replace(/ · (heal|snack)$/, '')}</small></button>`).join('');
  for (const el of foodGrids) el.innerHTML = foodHtml;
  // online: picks made while ready count from your next drop
  const pushLoadout = () => { if (game.net?.ready && chefPick.length === 3) { game.net.loadout = [...chefPick]; game.net.utensil = chefUtensil || null; } };
  function renderChef() {
    for (const grid of foodGrids) {
      for (const b of grid.children) {
        const i = chefPick.indexOf(b.dataset.id);
        b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
        b.dataset.n = i >= 0 ? i + 1 : '';
        b.disabled = i < 0 && chefPick.length >= 3;
      }
    }
    const left = 3 - chefPick.length;
    renderStart();
    renderLoadout();
  }
  for (const grid of foodGrids) {
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = b.dataset.id, i = chefPick.indexOf(id);
      if (i >= 0) chefPick.splice(i, 1); else if (chefPick.length < 3) chefPick.push(id);
      try { localStorage.setItem('tt-chef', JSON.stringify(chefPick)); } catch { /* storage blocked */ }
      pushLoadout();
      renderChef();
    });
  }
  // a starting utensil (optional in Chef's Choice; online you bring one too, or none)
  let chefUtensil = '';
  try { chefUtensil = UTENSIL_BY_ID[localStorage.getItem('tt-utensil')] ? localStorage.getItem('tt-utensil') : ''; } catch { /* storage blocked */ }
  const uGrids = [$('chef-utensils'), $('lo-utensils')];
  const uHtml = `<button type="button" data-id="" aria-pressed="false"><span>None</span><small>Find one on the map</small></button>`
    + UTENSILS.map((u) => `<button type="button" data-id="${u.id}" aria-pressed="false" title="${u.buff} Trade-off: ${u.trade}"><img src="${utensilIcon(u.id)}" alt=""><span>${u.name}</span><small>${u.role}</small></button>`).join('');
  for (const el of uGrids) el.innerHTML = uHtml;
  const syncUtensils = () => { for (const grid of uGrids) for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.id === chefUtensil)); };
  for (const grid of uGrids) {
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      chefUtensil = b.dataset.id;
      try { localStorage.setItem('tt-utensil', chefUtensil); } catch { /* storage blocked */ }
      pushLoadout();
      syncUtensils();
      renderLoadout();
    });
  }

  // Online: after joining a room, pick what you drop in with (or only watch). It opens again from
  // the spectator bar between rounds.
  const loadout = $('loadout');
  function renderLoadout() {
    if (loadout.hidden || !game.net) return;
    const net = game.net, R = game.round, rs = net.roomSettings(), left = 3 - chefPick.length;
    $('lo-count').textContent = left > 0 ? `${left} more to pick` : 'all set';
    const bots = rs.bots === 'off' ? 'no bots' : `${rs.bots[0].toUpperCase()}${rs.bots.slice(1)} bots`;
    const mode = rs.mode === 'chef' ? "Chef's Choice: your 3 foods never run out" : rs.mode === 'pots' ? 'Cooking Pot Wars: you start with a stack of each; guard your pot, smash theirs'
      : 'Classic: you start with a stack of each, and find more';
    const size = cleanSize(rs.team, rs.mode);
    const room = `Room <b>${esc(net.roomName)}</b> · ${MAPS[rs.map]?.name || 'The Grand Kitchen'} · ${TEAM_LABEL[size]} · ${bots}. ${mode}.`;
    if ($('lo-room').innerHTML !== room) $('lo-room').innerHTML = room;
    renderLoTeams(size);
    let note;
    if (!R || R.id < 0) note = 'Finding the room…';
    else if (game.player?.alive) note = 'You are in this round: a new pick counts from your next drop.';
    else if (game.joinableNow()) note = 'A round is starting: press Ready to drop in now.';
    else if (R.state === 'over') note = 'The next round starts in a few seconds.';
    else note = 'A round is on: you drop in at the next one (watch until then).';
    if ($('lo-note').textContent !== note) $('lo-note').textContent = note;
    const btn = $('lo-ready');
    btn.disabled = left > 0;
    const label = left > 0 ? `Pick ${left} more food${left > 1 ? 's' : ''}` : game.joinableNow() ? 'Drop in' : 'Ready';
    if (btn.textContent !== label) btn.textContent = label;
  }
  // Online: pick your team (players who picked are listed; bots fill the empty places).
  function renderLoTeams(size) {
    const net = game.net, n = teamCount(size);
    $('lo-teams-row').hidden = !n;
    if (!n) return;
    const names = TEAMS.slice(0, n).map(() => []);
    for (const pr of net.proxies.values()) if (pr.ready && pr.actor.team != null && pr.actor.team < n) names[pr.actor.team].push(pr.actor.name);
    const mine = game.teamSize === size ? game.myTeam() : (net.teamPick >= 0 && net.teamPick < n ? net.teamPick : null);
    const html = `<button type="button" data-t="-1" aria-pressed="${net.teamPick < 0}"><b>Any team</b><small>${mine != null && net.teamPick < 0 ? `Now: ${TEAMS[mine].short}` : 'The emptiest one'}</small></button>`
      + TEAMS.slice(0, n).map((T, t) => {
        const who = names[t], full = who.length >= size && net.teamPick !== t;
        return `<button type="button" data-t="${t}" aria-pressed="${net.teamPick === t}" style="--c:${T.color}"${full ? ' disabled' : ''}><b>${T.short}</b><small>${who.length ? esc(who.join(', ')) : 'Bots for now'}${full ? ' · full' : ''}</small></button>`;
      }).join('');
    if ($('lo-teams').innerHTML !== html) $('lo-teams').innerHTML = html;
  }
  $('lo-teams').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b || b.disabled || !game.net) return;
    game.net.teamPick = +b.dataset.t;
    game.autoTeam = null;
    if (!game.player.alive) game.player.team = game.myTeam(); // (a pick in the middle of a round counts from the next one)
    renderLoadout();
  });
  function openLoadout() {
    loadout.hidden = false;
    input.exitLock();
    renderChef(); syncUtensils();
    requestAnimationFrame(() => loadout.scrollTop = 0);
  }
  $('lo-ready').addEventListener('click', () => {
    const net = game.net;
    if (chefPick.length !== 3 || !net) return;
    net.loadout = [...chefPick]; net.utensil = chefUtensil || null; net.ready = true;
    loadout.hidden = true;
    game.joinNow(); // in a young round, drop in right away
    if (game.player?.alive && !input.isTouch) input.requestLock(true);
  });
  $('lo-watch').addEventListener('click', () => { if (game.net) game.net.ready = false; loadout.hidden = true; });
  $('lo-leave').addEventListener('click', toMenu);
  game.spectator.onPlay = () => { if (game.online) openLoadout(); else start(); };
  game.spectator.onLeave = toMenu;
  renderChef();
  syncUtensils();
  placeSettings(false); // (also the first syncLevel)
  $('end-menu').addEventListener('click', toMenu);
  $('leave').addEventListener('click', toMenu);
  $('hud-menu').addEventListener('click', () => { // the pause button on phones (online games keep running)
    if (!playing || !end.hidden) return;
    game.paused = !game.online; pause.hidden = false;
  });

  // Online: join a room code; everyone with the same code plays together.
  const status = $('online-status');
  try { $('nick').value = localStorage.getItem('tt-nick') || ''; } catch { /* storage blocked */ }
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
      // what I'd host with (if the room has no host yet); joiners take the room's settings
      await net.connect(lobby, cleanRoom($('roomcode').value), nick, { map: mapId, mode: selMode, team: teamSize, bots: onlineBots, loadout: chefPick.length === 3 ? [...chefPick] : null, utensil: chefUtensil || null });
      try { localStorage.setItem('tt-nick', nick); } catch { /* storage blocked */ }
      game.startOnline(net);
      status.textContent = '';
      enterPlay(false);
      openLoadout(); // pick 3 foods and a utensil (or spectate)
    } catch (err) {
      status.className = 'err';
      status.textContent = `Couldn't join that room (${(err && (err.code || err.message)) || 'unknown error'}). Check the room code and try again.`;
    } finally { btn.disabled = false; }
  });
  $('spectate').addEventListener('click', () => { end.hidden = true; });
  $('resume').addEventListener('click', () => { pause.hidden = true; game.paused = false; if (!input.isTouch && !game.spectator.active) input.requestLock(true); });
  input.wantLock = () => playing && !game.paused && pause.hidden && end.hidden && loadout.hidden && !game.spectator.active && !input.isTouch;
  input.blockClicks = () => game.spectator.active || !loadout.hidden; // clicks there are for the spectator bar and the card


  input.onLockChange = (locked) => {
    if (!playing || input.isTouch) return;
    if (!locked && game.state !== 'over' && game.player?.alive && end.hidden) { game.paused = !game.online; pause.hidden = false; } // online games keep running
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && playing && !input.isTouch && !game.online) { game.paused = !game.paused; pause.hidden = !game.paused; }
  });

  game.onMatchEvent = (type, data) => {
    if (type === 'joined') { loadout.hidden = true; return; } // online: dropped into a round
    if (!playing || !game.player) {
      if (type === 'over') setTimeout(() => { if (!playing) game.newMatch(false); }, 5000);
      return;
    }
    if (type === 'playerDown') {
      const k = data.killer ? `${data.killer.name} got you` : 'The kitchen got you';
      $('end-title').textContent = 'Splatted!';
      $('end-sub').textContent = data.note ? `${k}. ${data.note}` : `${k}. You placed #${data.placement} of ${TITANS}.`;
      $('end-kills').textContent = game.player.kills;
      $('end-place').textContent = `#${data.placement}`;
      $('spectate').hidden = false;
      setTimeout(() => { end.hidden = false; touch.hidden = true; input.exitLock(); }, 1400);
    }
    if (type === 'over') {
      const won = data.won ?? (data.winner && data.winner === game.player);
      $('end-title').textContent = won ? "Chef's Kiss!" : 'Match over';
      $('end-sub').textContent = data.team ? `${data.team} wins${game.mode === 'pots' ? ' Cooking Pot Wars' : ''}${won ? '! Your team took it.' : '.'}`
        : won ? 'Last Bite Standing. The whole kitchen is yours.' : `${data.winner ? data.winner.name : 'Nobody'} took the Last Bite.`;
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
  hold('tLadle', () => { input.pressed.ladle = true; });
  hold('tTurret', () => { input.pressed.turret = true; });
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
  let last = performance.now(), frameNo = 0, specOn = false, loadoutT = 0;
  renderer.info.autoReset = false; // count draw calls across all passes for the perf readout
  renderer.setAnimationLoop((now) => {
    renderer.info.reset();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // rAF time can precede `last`
    last = now;
    if (input.aimEdge && (input.aimEdge.x || input.aimEdge.y)) input.look(input.aimEdge.x * 320 * dt, input.aimEdge.y * 200 * dt, 0.006 * input.zoomSens);
    game.update(dt);
    const spec = playing && game.spectator.active; // watching: free the mouse for the spectator bar, no touch controls
    if (spec !== specOn) {
      specOn = spec;
      if (spec) { input.exitLock(); touch.hidden = true; } else if (playing) touch.hidden = !input.isTouch;
    }
    if (!loadout.hidden && (loadoutT -= dt) <= 0) { loadoutT = 0.4; renderLoadout(); }
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
