// The Test World (0.55): a huge white box to try things out in (see sandbox.js for what you can spawn).
// A white floor with a faint grid (every square is 5 m: handy for judging ranges), white walls, a raised
// white block at the back with two launch pads up to it, and the giant tomato on top as a target.
// It uses the kitchen's frame (the floor at FLOOR_Y, the same footprint), so everything else just works.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { addBox } from './core.js';
import { canvasTex, F } from './world.js';

export const TEST_REGIONS = {
  floor: { minX: -225, maxX: 225, minZ: -125, maxZ: 155, top: F, weight: 0.85 },
  block: { minX: -60, maxX: 60, minZ: -160, maxZ: -130, top: 0, weight: 0.15 },
};

function grid(x, w, h) { // one 5 m square: white, a soft line round it, a darker one every 25 m
  x.fillStyle = '#eef1f5'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(110,125,155,0.45)'; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
}
function grid25(x, w, h) {
  x.clearRect(0, 0, w, h);
  x.fillStyle = 'rgba(60,85,135,0.4)'; x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h);
}

export function buildTestWorld(W) {
  const S = W.scene, R = W.real, m = W.mats;
  R.background = new THREE.Color('#eef1f5');
  R.fog = new THREE.Fog('#eef1f5', 320, 900);
  const pmrem = new THREE.PMREMGenerator(W.renderer);
  R.environment?.dispose();
  R.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  R.environmentIntensity = 0.3;
  pmrem.dispose();
  S.add(new THREE.HemisphereLight('#ffffff', '#b9c4d4', 0.75));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(-120, 200, 90);
  sun.target.position.set(0, -20, 0);
  S.add(sun, sun.target);
  sun.castShadow = !!W.quality.shadows;
  sun.shadow.mapSize.set(W.quality.shadows || 2048, W.quality.shadows || 2048);
  Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 230, bottom: -230, near: 20, far: 640 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  W.sun = sun;

  m.floor = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, grid, { repeat: [104, 76] }), roughness: 0.6 });
  m.lines = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, grid25, { repeat: [520 / 25, 380 / 25] }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  m.wall = new THREE.MeshStandardMaterial({ color: '#f6f7f9', roughness: 0.7 });
  m.skirt = new THREE.MeshStandardMaterial({ color: '#b8c4d6', roughness: 0.6 });
  m.block = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
  m.edge = new THREE.MeshStandardMaterial({ color: '#cfd8e6', roughness: 0.5 });
  m.white = m.block;

  // the floor, its 25 m lines, the walls and a ceiling of light
  W._mesh(new THREE.PlaneGeometry(520, 380).rotateX(-Math.PI / 2), m.floor, 0, F, -5, { cast: false });
  W._mesh(new THREE.PlaneGeometry(520, 380).rotateX(-Math.PI / 2), m.lines, 0, F + 0.02, -5, { cast: false, receive: false });
  const H = 110;
  W._mesh(new THREE.PlaneGeometry(520, H), m.wall, 0, F + H / 2, -178, { cast: false });
  W._mesh(new THREE.PlaneGeometry(520, H).rotateY(Math.PI), m.wall, 0, F + H / 2, 170, { cast: false });
  W._mesh(new THREE.PlaneGeometry(360, H).rotateY(Math.PI / 2), m.wall, -245, F + H / 2, -4, { cast: false });
  W._mesh(new THREE.PlaneGeometry(360, H).rotateY(-Math.PI / 2), m.wall, 245, F + H / 2, -4, { cast: false });
  // a grey-blue strip along the foot of each wall, so you can see where the floor ends
  for (const [x0, x1, z0, z1] of [[-245, 245, -178, -177], [-245, 245, 169, 170], [-245, -244, -178, 170], [244, 245, -178, 170]]) W._box(x0, x1, z0, z1, F, F + 2.5, m.skirt, { cast: false });
  for (const [x0, x1, z0, z1] of [[-250, 250, -183, -178], [-250, 250, 170, 175], [-250, -245, -183, 175], [245, 250, -183, 175]]) addBox(x0, x1, z0, z1, F, F + H, { surface: 'plastic' });

  // the raised block at the back (as high as the kitchen counters), its edge trim, two pads up
  W._box(-60, 60, -170, -130, F, 0, m.block);
  W._box(-60.4, 60.4, -130.4, -129.6, -0.6, 0.1, m.edge, { cast: false });
  addBox(-60, 60, -170, -130, F, 0, { surface: 'plastic' });
  W._pads([[-40, -110, -40, 0, -150], [40, -110, 40, 0, -150]]);
  W._landmark(0, -150);
  W._tide();

  // food spots all over the floor, a few on the block
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push(W.randomOpenSpot('block', 4));
  for (let i = 0; i < 40; i++) pts.push(W.randomOpenSpot('floor', 6));
  W.spawnPoints = pts;
}
