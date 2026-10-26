'use strict';
// Hjälpare för 3D-modeller: träd, stenar, snögubbar, hopp.

// ---------- Geometri-hjälpare ----------

// Slår ihop flera geometrier till en med vertexfärger, så varje modell blir ett enda draw call.
function buildGeometry(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    if (part.matrix) g.applyMatrix4(part.matrix);
    const p = g.attributes.position;
    const nm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      n.fromBufferAttribute(nm, i);
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      const c = typeof part.color === 'function' ? part.color(v, n) : part.color;
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Rubbar hörnen slumpmässigt (samma förskjutning för delade hörn så att inga hål uppstår).
function jitter(geo, amount, rand, keep = () => false) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const offsets = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let off = offsets.get(key);
    if (!off) {
      off = keep(v) ? [0, 0, 0] : [(rand() - 0.5) * amount, (rand() - 0.5) * amount * 0.7, (rand() - 0.5) * amount];
      offsets.set(key, off);
    }
    p.setXYZ(i, v.x + off[0], v.y + off[1], v.z + off[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const m4 = () => new THREE.Matrix4();
const C = (hex) => new THREE.Color(hex);
const SNOW = C('#f3f7fc');
const SNOW_SHADE = C('#d3deea');

// Gran: stam + tät mörk kärna + grenvarv med nedhängande grenar. Snö på grenarnas ovansidor.
function makeSpruce(seed) {
  const rand = mulberry32(seed);
  const height = 6.2;
  const greens = ['#1b3626', '#21402c', '#284a33', '#1d3a2b'].map(C);
  const core = C('#14281c');
  const parts = [
    { geo: new THREE.CylinderGeometry(0.07, 0.2, height * 0.95, 7), matrix: m4().makeTranslation(0, height * 0.475, 0), color: C('#3e2c20') },
    // Kärnan fyller hålen mellan grenarna så att granen inte ser genomskinlig ut
    { geo: new THREE.ConeGeometry(0.95, height - 1.0, 9, 1), matrix: m4().makeTranslation(0, 1.0 + (height - 1.0) / 2, 0), color: core },
  ];

  const whorls = 13;
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1); // 0 = nederst, 1 = toppen
    const y = 0.75 + t * (height - 1.4) + (rand() - 0.5) * 0.15;
    const len = (2.1 * Math.pow(1 - t, 0.9) + 0.25) * (0.9 + rand() * 0.2);
    const count = Math.max(4, Math.round(7 - t * 3));
    const droop = 0.2 + (1 - t) * 0.4; // de nedre grenarna hänger mer
    const az0 = rand() * Math.PI * 2;
    for (let b = 0; b < count; b++) {
      const az = az0 + (b / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const l = len * (0.85 + rand() * 0.3);
      const geo = jitter(new THREE.ConeGeometry(l * 0.34, l, 6, 2).translate(0, l / 2, 0), l * 0.08, rand, (v) => v.y < 0.01);
      // Platt gren som pekar utåt och lite nedåt: platta till → vrid ut → vrid runt stammen
      const matrix = m4().makeRotationY(az)
        .multiply(m4().makeRotationZ(-Math.PI / 2 - droop))
        .multiply(m4().makeScale(0.32, 1, 1))
        .setPosition(0, y, 0);
      const green = greens[Math.floor(rand() * greens.length)];
      const under = green.clone().multiplyScalar(0.5);
      parts.push({
        geo,
        matrix,
        color: (v, n) => {
          if (n.y < 0.1) return under;
          const h = hash3(v.x * 3, v.y * 3, v.z * 3);
          if (n.y > 0.45 && h < 0.72) return h < 0.4 ? SNOW : SNOW_SHADE;
          return green;
        },
      });
    }
  }
  // Smal topp
  parts.push({ geo: new THREE.ConeGeometry(0.14, 1.0, 6), matrix: m4().makeTranslation(0, height - 0.2, 0), color: greens[1] });
  parts.push({ geo: new THREE.ConeGeometry(0.1, 0.35, 6), matrix: m4().makeTranslation(0, height - 0.05, 0), color: SNOW });
  return buildGeometry(parts);
}

// Tall: hög, bar stam med en snöig krona i toppen
function makePine(seed) {
  const rand = mulberry32(seed);
  const bark = C('#8a5534');
  const barkDark = C('#5a3a26');
  const parts = [{
    geo: new THREE.CylinderGeometry(0.1, 0.22, 9, 7),
    matrix: m4().makeTranslation(0, 4.5, 0),
    color: (v) => (v.y < 1.5 ? barkDark : bark),
  }];
  const greens = ['#22402a', '#2a4b2f', '#1d3825'].map(C);
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const y = 5.2 + t * 4;
    const a = rand() * Math.PI * 2;
    const spread = (1 - t) * (0.6 + rand() * 0.9);
    const r = 0.7 + (1 - t) * 0.6 + rand() * 0.3;
    const pos = [Math.cos(a) * spread, y, Math.sin(a) * spread];
    if (spread > 0.4) {
      parts.push({
        geo: new THREE.CylinderGeometry(0.04, 0.07, spread, 5),
        matrix: m4().makeRotationZ(Math.PI / 2).premultiply(m4().makeRotationY(-a)).setPosition(pos[0] / 2, y - 0.2, pos[2] / 2),
        color: bark,
      });
    }
    const green = greens[i % greens.length];
    const under = green.clone().multiplyScalar(0.6);
    parts.push({
      geo: jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.4, rand),
      matrix: m4().makeScale(1, 0.5, 1).setPosition(...pos),
      color: (v, n) => (n.y < -0.1 ? under : n.y > 0.5 && hash3(v.x, v.y, v.z) < 0.6 ? SNOW : green),
    });
  }
  return buildGeometry(parts);
}

function makeRock(seed) {
  const rand = mulberry32(seed);
  const grey = C('#6c747d');
  const geo = jitter(new THREE.IcosahedronGeometry(1, 1), 0.45, rand);
  return buildGeometry([{
    geo,
    matrix: m4().makeScale(1.2, 0.65, 1).setPosition(0, 0.25, 0),
    color: (v, n) => (n.y > 0.6 ? SNOW : n.y > 0.4 ? SNOW_SHADE : grey),
  }]);
}

function makeStump() {
  return buildGeometry([
    { geo: new THREE.CylinderGeometry(0.33, 0.42, 0.6, 10), matrix: m4().makeTranslation(0, 0.3, 0), color: C('#5b4030') },
    { geo: new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), matrix: m4().makeTranslation(0, 0.63, 0), color: SNOW },
  ]);
}

function makeSnowman() {
  const black = C('#1b1f24');
  const parts = [
    { geo: new THREE.SphereGeometry(0.55, 16, 12), matrix: m4().makeTranslation(0, 0.5, 0), color: SNOW },
    { geo: new THREE.SphereGeometry(0.4, 16, 12), matrix: m4().makeTranslation(0, 1.25, 0), color: SNOW },
    { geo: new THREE.SphereGeometry(0.28, 16, 12), matrix: m4().makeTranslation(0, 1.8, 0), color: SNOW },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), matrix: m4().makeTranslation(0, 2.03, 0), color: black },
    { geo: new THREE.CylinderGeometry(0.19, 0.2, 0.32, 16), matrix: m4().makeTranslation(0, 2.2, 0), color: black },
    { geo: new THREE.ConeGeometry(0.05, 0.3, 8), matrix: m4().makeRotationX(Math.PI / 2).setPosition(0, 1.8, 0.4), color: C('#ef6c00') },
  ];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.SphereGeometry(0.035, 6, 6), matrix: m4().makeTranslation(s * 0.1, 1.88, 0.24), color: black });
    parts.push({
      geo: new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5),
      matrix: m4().makeRotationZ(s * 1.0).setPosition(s * 0.65, 1.45, 0),
      color: C('#4e342e'),
    });
  }
  return buildGeometry(parts);
}

// Hoppbacke: en snökil som är högst i nedförsbacke-änden, med orange markeringspinnar
function makeRamp(w, l, h) {
  const a = [-w, 0, l], b = [w, 0, l], c = [w, h, -l], d = [-w, h, -l], e = [-w, 0, -l], f = [w, 0, -l];
  const tris = [a, b, c, a, c, d, d, c, f, d, f, e, a, d, e, b, f, c];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  const parts = [{ geo, color: (v, n) => (n.y > 0.5 ? C('#e4eef8') : C('#bcd0e4')) }];
  for (const s of [-1, 1]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), matrix: m4().makeTranslation(s * w, h + 0.6, -l), color: C('#ff6d00') });
  }
  return buildGeometry(parts);
}
