'use strict';
// Three.js-renderare, scen, himmel, kamera och ljus.

// ---------- Renderer, scen & ljus ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Mobiler orkar mindre: lägre upplösning och enklare skuggor
renderer.setPixelRatio(Math.min(TOUCH ? 1.5 : 2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const FOG_COLOR = '#dfe8f2';
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 70, VIEW_AHEAD);

function makeSky(top = '#5f9bd3', mid = '#a9cbea', bottom = FOG_COLOR) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const daySky = makeSky();
scene.background = daySky;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);

const hemi = new THREE.HemisphereLight('#dbe9ff', '#f2f5fa', 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
