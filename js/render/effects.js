'use strict';
// Effekter: snösprut, fallande snö och skidspår.

// ---------- Partiklar: snösprut ----------

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const dotTex = makeDotTexture();

const SPRAY_MAX = 3000;
const spray = {
  pos: new Float32Array(SPRAY_MAX * 3),
  vel: new Float32Array(SPRAY_MAX * 3),
  life: new Float32Array(SPRAY_MAX),
  maxLife: new Float32Array(SPRAY_MAX).fill(1),
  baseSize: new Float32Array(SPRAY_MAX),
  size: new Float32Array(SPRAY_MAX),
  alpha: new Float32Array(SPRAY_MAX),
  next: 0,
};
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray.pos, 3).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(spray.size, 1).setUsage(THREE.DynamicDrawUsage));
sprayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spray.alpha, 1).setUsage(THREE.DynamicDrawUsage));
const sprayMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: dotTex }, scale: { value: 500 }, tint: { value: 1 } },
  vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    uniform float scale;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dist = -mv.z;
      vAlpha = aAlpha * clamp((dist - 1.5) / 3.0, 0.0, 1.0);
      gl_PointSize = min(aSize * scale / dist, scale * 0.06);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D map;
    uniform float tint;
    varying float vAlpha;
    void main() {
      float a = texture2D(map, gl_PointCoord).a * vAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * tint, a);
    }`,
  transparent: true,
  depthWrite: false,
});
const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
sprayPoints.frustumCulled = false;
scene.add(sprayPoints);

function emit(x, y, z, vx, vy, vz, size, life) {
  const i = spray.next;
  spray.next = (i + 1) % SPRAY_MAX;
  const j = i * 3;
  spray.pos[j] = x;
  spray.pos[j + 1] = y;
  spray.pos[j + 2] = z;
  spray.vel[j] = vx;
  spray.vel[j + 1] = vy;
  spray.vel[j + 2] = vz;
  spray.life[i] = life;
  spray.maxLife[i] = life;
  spray.baseSize[i] = size;
}

function burst(x, y, z, count, power, size = 0.5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.3 + Math.random() * 0.7);
    emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * power * 0.6, Math.sin(a) * sp,
      size * (0.6 + Math.random() * 0.8), 0.6 + Math.random() * 0.8);
  }
}

function updateSpray(dt) {
  const drag = Math.max(0, 1 - 2.2 * dt);
  for (let i = 0; i < SPRAY_MAX; i++) {
    if (spray.life[i] <= 0) {
      spray.alpha[i] = 0;
      spray.size[i] = 0;
      continue;
    }
    spray.life[i] -= dt;
    const j = i * 3;
    spray.vel[j] *= drag;
    spray.vel[j + 1] = spray.vel[j + 1] * drag - 9.8 * dt;
    spray.vel[j + 2] *= drag;
    spray.pos[j] += spray.vel[j] * dt;
    spray.pos[j + 1] += spray.vel[j + 1] * dt;
    spray.pos[j + 2] += spray.vel[j + 2] * dt;
    const k = Math.max(0, spray.life[i] / spray.maxLife[i]);
    spray.alpha[i] = Math.min(1, k * 1.6) * 0.75;
    spray.size[i] = spray.baseSize[i] * (1 + (1 - k) * 1.4);
  }
  sprayGeo.attributes.position.needsUpdate = true;
  sprayGeo.attributes.aSize.needsUpdate = true;
  sprayGeo.attributes.aAlpha.needsUpdate = true;
  sprayMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

// ---------- Fallande snö ----------

const FLAKES = 1500;
const FLAKE_BOX = 70;
const flakeGeo = new THREE.BufferGeometry();
const flakePos = new Float32Array(FLAKES * 3);
for (let i = 0; i < flakePos.length; i++) flakePos[i] = (Math.random() - 0.5) * FLAKE_BOX;
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3).setUsage(THREE.DynamicDrawUsage));
const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({
  size: 0.12, map: dotTex, transparent: true, depthWrite: false, opacity: 0.9,
}));
flakes.frustumCulled = false;
scene.add(flakes);

function wrap(v, center) {
  // Modulo så att flingorna hamnar rätt direkt, även när kameran hoppat långt (t.ex. vid nytt åk)
  const half = FLAKE_BOX / 2;
  return center + ((((v - center + half) % FLAKE_BOX) + FLAKE_BOX) % FLAKE_BOX) - half;
}

function updateFlakes(dt, time) {
  const c = camera.position;
  for (let i = 0; i < FLAKES; i++) {
    const j = i * 3;
    flakePos[j] = wrap(flakePos[j] + Math.sin(time * 0.7 + i) * 0.4 * dt, c.x);
    flakePos[j + 1] = wrap(flakePos[j + 1] - 1.4 * dt, c.y);
    flakePos[j + 2] = wrap(flakePos[j + 2], c.z);
  }
  flakeGeo.attributes.position.needsUpdate = true;
}

// ---------- Skidspår ----------

const TRACK_MAX = 90;
const trackPos = new Float32Array(TRACK_MAX * 2 * 6 * 3);
const trackGeo = new THREE.BufferGeometry();
trackGeo.setAttribute('position', new THREE.BufferAttribute(trackPos, 3).setUsage(THREE.DynamicDrawUsage));
const trackMesh = new THREE.Mesh(trackGeo, new THREE.MeshBasicMaterial({
  color: '#aebfd2', transparent: true, opacity: 0.5, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
}));
trackMesh.frustumCulled = false;
scene.add(trackMesh);

function rebuildTracks() {
  let n = 0;
  const put = (x, y, z) => { trackPos[n++] = x; trackPos[n++] = y; trackPos[n++] = z; };
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a.gap || b.gap) continue;
    for (const s of [-1, 1]) {
      const corners = [a, b].map((q) => {
        const rx = Math.cos(q.a);
        const rz = Math.sin(q.a);
        const cx = q.x + s * 0.14 * rx;
        const cz = -q.d + s * 0.14 * rz;
        return [cx - rx * 0.05, cz - rz * 0.05, cx + rx * 0.05, cz + rz * 0.05, q.y + 0.03];
      });
      const [p, q] = corners;
      put(p[0], p[4], p[1]); put(p[2], p[4], p[3]); put(q[2], q[4], q[3]);
      put(p[0], p[4], p[1]); put(q[2], q[4], q[3]); put(q[0], q[4], q[1]);
    }
  }
  trackGeo.setDrawRange(0, n / 3);
  trackGeo.attributes.position.needsUpdate = true;
}
