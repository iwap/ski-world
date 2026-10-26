'use strict';
// Snömarken och bergen runt omkring.

// ---------- Terräng ----------

// Ett stort rutnät som följer åkaren. Det flyttas i hela rutsteg så att hörnen alltid
// ligger på samma världspunkter – då "simmar" inte backen när den räknas om.
const TERRAIN_W = 150;
const TERRAIN_L = 320;
const STEP = 1.25;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_L, TERRAIN_W / STEP, TERRAIN_L / STEP);
terrainGeo.rotateX(-Math.PI / 2);
const terrainBase = Float32Array.from(terrainGeo.attributes.position.array);
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(terrainBase.length), 3));
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
terrain.receiveShadow = true;
terrain.frustumCulled = false; // ytan flyttas långt ner i backen – låt den alltid ritas
scene.add(terrain);
let terrainKey = '';

function updateTerrain(px, pd) {
  // Flytta i hela 10 m (en jämn multipel av rutstorleken) så att hörnen alltid hamnar på samma världspunkter
  const cx = Math.round(px / 10) * 10;
  const cd = Math.round((pd + TERRAIN_L / 2 - 40) / 10) * 10;
  const key = `${cx},${cd}`;
  if (key === terrainKey) return;
  terrainKey = key;
  terrain.position.set(cx, 0, -cd);
  const pos = terrainGeo.attributes.position;
  const col = terrainGeo.attributes.color;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + terrainBase[i * 3];
    const wd = cd - terrainBase[i * 3 + 2];
    pos.setY(i, groundY(wx, wd));
    const n = hash3(Math.round(wx), Math.round(wd), 1);
    // Svackorna mellan puckarna blir lite mörkare så att puckarna syns
    const amount = mogulAmount(wx, wd);
    const trough = amount ? (0.5 - mogulY(wx, wd) / (course.moguls * amount) * 0.5) * 0.55 * amount : 0;
    tmp.copy(SNOW).lerp(SNOW_SHADE, 0.15 + n * 0.25 + Math.sin(wx * 0.05 + wd * 0.02) * 0.1 + trough);
    if (onFeatureCrest(wx, wd)) tmp.copy(PIPE_LINE); // blå linje på spinens kam och rollernas krön
    if (pipeEnv(wd) > 0.5) {
      // Halfpipe: skuggade väggar och en blå linje längs kanten, som i riktiga pipes
      const a = Math.abs(wx) - PIPE_FLAT;
      if (a > 0 && a < PIPE_R) tmp.lerp(SNOW_SHADE, 0.2 + 0.4 * a / PIPE_R);
      if (Math.abs(Math.abs(wx) - PIPE_COPING) < 0.65) tmp.copy(PIPE_LINE);
    }
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}

// Berg i fjärran: en sammanhängande bergskedja runt hela horisonten, genererad med
// "ridged noise" (skarpa åsar och dalar). Den följer med kameran och ser därför oändligt långt bort ut.
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => {
    const g = h & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v) * 0.7;
  };
}

function ridged(noise, x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let weight = 1;
  for (let o = 0; o < 6; o++) {
    let n = 1 - Math.abs(noise(x * freq, y * freq));
    n *= n * weight;
    weight = clamp(n * 1.5, 0, 1);
    sum += n * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}

const mountains = new THREE.Group();
(() => {
  const noise = makeNoise2D(1234);
  const R0 = 560;
  const R1 = 1650;
  const segA = 420;
  const segR = 70;
  const pos = [];
  const radii = [];
  for (let j = 0; j <= segR; j++) {
    const r = R0 + (R1 - R0) * Math.pow(j / segR, 1.3);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Lägre förberg närmast, höga toppar längre bort
      const env = smoothstep(R0, R0 + 260, r) * (0.55 + 0.45 * smoothstep(650, 1100, r));
      const big = 0.6 + 0.4 * noise(x / 1400 + 7, z / 1400 - 3); // vissa delar av kedjan är högre
      const h = 300 * ridged(noise, x / 520, z / 520) * env * big - 50;
      pos.push(x, h, z);
      radii.push(r);
    }
  }
  const idx = [];
  const row = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Färger: skog på lägre sluttningar, mörka klippor i branter, snö på flackare och högre partier.
  // Längre bort bleknar allt mot himlen (luftperspektiv).
  const haze = C('#c6d6e8');
  const forest = C('#2c3d3a');
  const rock = C('#56606c');
  const rockDark = C('#3e4752');
  const snow = C('#f5f8fc');
  const snowShade = C('#c9d6e6');
  const n = geo.attributes.normal;
  const colors = new Float32Array(pos.length);
  const c = new THREE.Color();
  for (let k = 0; k < pos.length / 3; k++) {
    const h = pos[k * 3 + 1];
    const ny = n.getY(k);
    const jitterH = hash3(pos[k * 3], h, pos[k * 3 + 2]);
    const snowLimit = 0.78 - clamp(h / 350, 0, 1) * 0.42 + jitterH * 0.08;
    if (h > 60 && ny > snowLimit) c.copy(ny > snowLimit + 0.12 ? snow : snowShade);
    else if (h < 45 + jitterH * 30) c.copy(forest);
    else c.copy(jitterH < 0.5 ? rock : rockDark);
    const far = clamp((radii[k] - R0) / (R1 - R0), 0, 1);
    c.lerp(haze, 0.18 + far * 0.6);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
  mountains.add(mesh);
  scene.add(mountains);
})();
