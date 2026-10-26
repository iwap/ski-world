'use strict';
// Kvällsläget och uppdatering av 3D-världen.

// ---------- Kvällsläge: mörk himmel, stjärnor och belysta backar ----------

const NIGHT_FOG = '#16233a';
const nightSky = makeSky('#02060f', '#0a1730', NIGHT_FOG);
const POLE_STEP = 16;          // en stolpe var 16:e meter, varannan sida
const POLE_X = NET_X - 4;
const POLE_H = 11;
const LAMP_COUNT = 6;          // så många lampor lyser på riktigt (närmast åkaren)
const LAMP_INTENSITY = 2600;

// Stjärnhimmel som följer kameran
const stars = (() => {
  const pos = [];
  for (let i = 0; i < 1800; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.asin(Math.random()) * 0.95 + 0.03;
    pos.push(Math.cos(a) * Math.cos(e) * 1800, Math.sin(e) * 1800, Math.sin(a) * Math.cos(e) * 1800);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  pts.visible = false;
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
})();

// Belysningsstolpar längs kanterna: stolpe, arm, lampa, ljussken och en svag ljuskägla
const lampGlowMat = new THREE.SpriteMaterial({ map: dotTex, color: '#ffd59a', blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const coneMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const poleMat = new THREE.MeshLambertMaterial({ color: '#3a4450' });
const lampHeadMat = new THREE.MeshBasicMaterial({ color: '#fff1d6' });
const poleGroup = new THREE.Group();
poleGroup.visible = false;
scene.add(poleGroup);
const poles = Array.from({ length: 18 }, () => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, POLE_H, 8).translate(0, POLE_H / 2, 0), poleMat);
  pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12).translate(1.2, POLE_H, 0), poleMat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5).translate(2.2, POLE_H - 0.15, 0), lampHeadMat);
  const glow = new THREE.Sprite(lampGlowMat);
  glow.position.set(2.2, POLE_H - 0.4, 0);
  glow.scale.setScalar(4);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, POLE_H, 20, 1, true).translate(0, POLE_H / 2, 0), coneMat);
  cone.position.set(2.2, -0.3, 0);
  g.add(pole, arm, head, glow, cone);
  poleGroup.add(g);
  return g;
});
// Stolpe nr k: sida och läge längs backen
const poleInfo = (k) => ({ side: k % 2 ? 1 : -1, d: k * POLE_STEP });

const lamps = Array.from({ length: LAMP_COUNT }, () => {
  const l = new THREE.SpotLight('#ffd7a0', 0, 80, 0.95, 0.6, 2);
  return l;
});
const playerLight = new THREE.PointLight('#cfe0ff', 0, 16, 2);

function updateLamps() {
  if (!save.night) return;
  const p = player;
  const first = Math.floor((p.d - 40) / POLE_STEP);
  poles.forEach((g, i) => {
    const { side, d } = poleInfo(first + i);
    const x = side * POLE_X;
    g.position.set(x, groundY(x, d), -d);
    g.rotation.y = side > 0 ? Math.PI : 0; // armen pekar in mot backen
  });
  const near = Math.floor((p.d - 12) / POLE_STEP);
  lamps.forEach((l, i) => {
    const { side, d } = poleInfo(near + i);
    const x = side * (POLE_X - 2.2);
    const gy = groundY(x, d);
    l.position.set(x, gy + POLE_H - 0.3, -d);
    l.target.position.set(side * (POLE_X - 22), groundY(side * (POLE_X - 22), d + 4), -(d + 4));
  });
  const f = feet();
  playerLight.position.set(f.x, f.y + 4, f.z + 2);
  stars.position.copy(camera.position);
}

function applyTime() {
  const night = !!save.night;
  scene.background = night ? nightSky : daySky;
  scene.fog.color.set(night ? NIGHT_FOG : FOG_COLOR);
  scene.fog.near = night ? 20 : 70;
  scene.fog.far = night ? 200 : VIEW_AHEAD;
  hemi.intensity = night ? 0.3 : 1.3;
  hemi.color.set(night ? '#4a5f8f' : '#dbe9ff');
  hemi.groundColor.set(night ? '#1a2238' : '#f2f5fa');
  sun.intensity = night ? 0.4 : 2.4; // på kvällen: svagt blått månsken
  sun.color.set(night ? '#a8c0ff' : '#fff3e0');
  stars.visible = night;
  poleGroup.visible = night;
  // Lamporna läggs bara till på kvällen (färre ljuskällor = snabbare på dagen)
  for (const l of lamps) {
    if (night) scene.add(l, l.target);
    else scene.remove(l, l.target);
    l.intensity = night ? LAMP_INTENSITY : 0;
  }
  if (night) scene.add(playerLight);
  else scene.remove(playerLight);
  playerLight.intensity = night ? 60 : 0;
  flakes.material.opacity = night ? 0.5 : 0.9;
  sprayMat.uniforms.tint.value = night ? 0.55 : 1;
  renderer.toneMappingExposure = night ? 1.2 : 1.05;
}

function updateWorld(dt, time) {
  const p = player;
  const f = feet();
  // I liften: visa backen bredvid och både upp- och nedåt
  const lifting = state === 'lift';
  updateTerrain(lifting ? -20 : p.x, lifting ? p.d - 140 : p.d);
  updateNets(lifting ? p.d - 150 : p.d);
  updateLamps();
  syncInstances(time);
  updateSkierModel(dt, time);
  if (state !== 'paused') stepLooseSkis(dt);
  sun.position.set(f.x - 30, f.y + 50, f.z + 25);
  sun.target.position.set(f.x, f.y, f.z);
  mountains.position.set(camera.position.x, camera.position.y - 170, camera.position.z);
}
