'use strict';
// Åkarens 3D-modell: kropp, skidor/bräda, pjäxor, kostymer och utseende.

// ---------- Åkaren ----------

// Armar och ben räknas ut med enkel tvåleds-IK: vi bestämmer var höfter, fötter, axlar
// och händer ska vara, och knän/armbågar hamnar där de naturligt böjer sig.
const UP = new THREE.Vector3(0, 1, 0);
const THIGH = 0.44;
const SHIN = 0.44;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;

const ikDir = new THREE.Vector3();
const ikPerp = new THREE.Vector3();
const limbDir = new THREE.Vector3();

function ik2(a, b, l1, l2, hint, out) {
  const dir = ikDir.subVectors(b, a);
  const d = clamp(dir.length(), 0.01, l1 + l2 - 0.001);
  dir.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const perp = ikPerp.copy(hint).addScaledVector(dir, -hint.dot(dir)).normalize();
  return out.copy(a).addScaledVector(dir, along).addScaledVector(perp, h);
}

function placeLimb(mesh, a, b) {
  const dir = limbDir.subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len || 1));
  mesh.scale.set(1, len / mesh.userData.len, 1);
}

// Bygger en skida/bräda som ringar av tvärsnitt längs längden (rundade kanter istället för en låda).
// halfWidth(u), halfThick(u) och rise(u) anger form, tjocklek och uppböjning, u = 0 bak … 1 spets.
function makeBladeGeometry({ length, tailZ, halfWidth, halfThick, rise, rings = 56, segs = 14 }) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = tailZ - u * length;
    const w = halfWidth(u);
    const ht = halfThick(u);
    const lift = rise(u);
    for (let j = 0; j < segs; j++) {
      // Superellips: platt ovan- och undersida med rundade kanter
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pos.push(w * Math.sign(c) * Math.pow(Math.abs(c), 0.3), lift + ht * Math.sign(sn) * Math.pow(Math.abs(sn), 0.3), z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Ändarna stängs med en solfjäder
  const tail = pos.length / 3;
  pos.push(0, rise(0), tailZ);
  const tip = tail + 1;
  pos.push(0, rise(1), tailZ - length);
  for (let j = 0; j < segs; j++) {
    const j2 = (j + 1) % segs;
    idx.push(tail, j, j2);
    idx.push(tip, rings * segs + j2, rings * segs + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Rundar av ändarna: bredden krymper som en halvcirkel de sista bitarna
const roundEnds = (u, w, tailEnd, tipStart) => {
  if (u > tipStart) return w * Math.sqrt(Math.max(0.03, 1 - ((u - tipStart) / (1 - tipStart)) ** 2));
  if (u < tailEnd) return w * Math.sqrt(Math.max(0.12, 1 - ((tailEnd - u) / tailEnd) ** 2));
  return w;
};

function makeSkiGeometry() {
  // Riktig skida: midja (sidecut), bredare spets och bakände, uppböjd spets, lätt twin tip och tunnare ändar
  const geo = makeBladeGeometry({
    length: 1.78,
    tailZ: 0.84,
    halfWidth: (u) => roundEnds(u, 0.04 + 0.013 * ((u - 0.48) / 0.4) ** 2, 0.05, 0.9),
    halfThick: (u) => 0.009 - 0.005 * Math.min(1, Math.abs(u - 0.45) / 0.55),
    rise: (u) => (u > 0.8 ? 0.1 * ((u - 0.8) / 0.2) ** 2 : u < 0.1 ? 0.035 * ((0.1 - u) / 0.1) ** 2 : 0),
  });
  const top = C('#ffffff');
  const stripe = C('#30363b');
  const edge = C('#8e979f');
  const base = C('#1f2428');
  return buildGeometry([{
    geo,
    color: (v, n) => {
      if (n.y < -0.45) return base;            // belag
      if (n.y < 0.45) return edge;             // stålkanter
      // Ovansida: färgen kommer från materialet (stilbutiken), plus en rand och en logga mot spetsen
      return Math.abs(v.x) < 0.007 || (v.z < -0.55 && v.z > -0.68) ? stripe : top;
    },
  }]);
}

function makeBoardGeometry() {
  // Snowboard: bred, lätt midjad, rundade och uppböjda ändar åt båda håll (twin tip)
  const geo = makeBladeGeometry({
    length: 1.5,
    tailZ: 0.75,
    halfWidth: (u) => roundEnds(u, 0.124 + 0.018 * ((u - 0.5) / 0.4) ** 2, 0.09, 0.91),
    halfThick: (u) => 0.01 - 0.004 * Math.min(1, Math.abs(u - 0.5) / 0.5),
    rise: (u) => 0.075 * Math.max(0, Math.abs(u - 0.5) - 0.36) ** 2 / 0.14 ** 2,
    rings: 60,
    segs: 16,
  });
  const base = C('#1f2428');
  const edge = C('#8e979f');
  return buildGeometry([{
    geo,
    color: (v, n) => {
      if (n.y < -0.45) return base;
      if (n.y < 0.45) return edge;
      return Math.abs(v.z + v.x * 1.5) < 0.06 ? C('#30363b') : C('#ffffff');
    },
  }]);
}

// Extra delar för karaktärerna (hår, mössor, masker …). Framåt är -z, huvudets radie ca 0,11.
function makeCostumes(add, mat, head, upper, mats) {
  const parts = {};
  const group = (id, parent) => {
    const g = new THREE.Group();
    g.visible = false;
    parent.add(g);
    (parts[id] = parts[id] || []).push(g);
    return g;
  };
  const hairM = mat('#8d5a2b', { roughness: 0.9 });
  mats.hair = hairM;
  const white = mat('#ffffff', { roughness: 0.95 });
  const black = mat('#141414', { roughness: 0.6 });
  const red = mat('#c62828', { roughness: 0.7 });
  const gold = mat('#d4af37', { roughness: 0.3, metalness: 0.8 });

  // Ansikte: ögon, ögonbryn och leende för karaktärerna som syns utan goggles
  let g = group('face', head);
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.016, 8, 6), black, sx * 0.04, 0.02, -0.108, g);
    add(new THREE.BoxGeometry(0.035, 0.007, 0.01), black, sx * 0.042, 0.05, -0.108, g).rotation.z = sx * -0.15;
  }
  add(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), mat('#8d3b3b'), 0, -0.035, -0.11, g).rotation.z = Math.PI;

  // Tjej: hårkalott, hästsvans och slingor vid kinderna
  g = group('hairLong', head);
  add(new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hairM, 0, 0.012, 0.01, g).scale.set(1.02, 1.12, 1.07);
  const tail = add(new THREE.CapsuleGeometry(0.042, 0.2, 6, 10), hairM, 0, -0.05, 0.16, g);
  tail.rotation.x = 0.55;
  add(new THREE.SphereGeometry(0.03, 8, 6), red, 0, 0.04, 0.125, g);
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), hairM, sx * 0.1, -0.05, -0.02, g);

  // Kille: kort hår med lugg
  g = group('hairShort', head);
  add(new THREE.SphereGeometry(0.119, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.015, 0.012, g).scale.set(1.02, 1.12, 1.07);
  add(new THREE.BoxGeometry(0.15, 0.03, 0.04), hairM, 0, 0.085, -0.095, g).rotation.x = -0.4;

  // Ninja: ögonspringa, pannband med knyte och fladdrande band
  g = group('ninja', head);
  add(new THREE.CylinderGeometry(0.114, 0.114, 0.034, 20, 1, true, Math.PI - 0.9, 1.8), mat('#e8b98f'), 0, 0.012, 0, g);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.014, 8, 6), black, sx * 0.04, 0.012, -0.112, g);
  add(new THREE.CylinderGeometry(0.121, 0.121, 0.032, 20, 1, true), red, 0, 0.06, 0, g);
  add(new THREE.SphereGeometry(0.026, 8, 6), red, 0, 0.06, 0.125, g);
  for (const sx of [-1, 1]) {
    const band = add(new THREE.BoxGeometry(0.03, 0.006, 0.22), red, sx * 0.025, 0.04, 0.23, g);
    band.rotation.set(-0.45, sx * 0.25, 0);
  }

  // Jultomte: luva med vit kant och tofs, skägg och mustasch, svart bälte
  g = group('santa', head);
  const hat = new THREE.Group();
  hat.position.set(0, 0.08, 0.02);
  hat.rotation.x = 0.55;
  g.add(hat);
  add(new THREE.ConeGeometry(0.125, 0.3, 18), red, 0, 0.15, 0, hat);
  add(new THREE.SphereGeometry(0.04, 10, 8), white, 0, 0.3, 0, hat);
  add(new THREE.TorusGeometry(0.122, 0.032, 8, 24), white, 0, 0.0, 0, hat).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.1, 14, 10), white, 0, -0.085, -0.07, g).scale.set(1.15, 1.35, 0.7);
  add(new THREE.CapsuleGeometry(0.022, 0.1, 4, 8), white, 0, -0.03, -0.112, g).rotation.z = Math.PI / 2;
  add(new THREE.SphereGeometry(0.02, 8, 6), mat('#e57373'), 0, -0.005, -0.12, g);
  g = group('santa', upper);
  add(new THREE.CylinderGeometry(0.158, 0.158, 0.05, 20), black, 0, 0.12, 0, g);
  add(new THREE.BoxGeometry(0.07, 0.06, 0.02), gold, 0, 0.12, -0.16, g);

  // Robot: lådhuvud, lysande visir, antenn och bultar
  g = group('robot', head);
  const metal = mat('#cfd8dc', { roughness: 0.3, metalness: 0.4 });
  add(new THREE.BoxGeometry(0.24, 0.25, 0.24), metal, 0, 0.015, 0, g);
  add(new THREE.BoxGeometry(0.19, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: '#00e5ff', emissive: '#00b8d4', emissiveIntensity: 1.2 }), 0, 0.03, -0.123, g);
  add(new THREE.BoxGeometry(0.1, 0.02, 0.01), black, 0, -0.06, -0.122, g);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), metal, 0, 0.2, 0, g);
  add(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff1744', emissive: '#d50000' }), 0, 0.27, 0, g);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), metal, sx * 0.13, 0.01, 0, g).rotation.z = Math.PI / 2;

  // Utomjording: stora svarta ögon och antenner med kulor
  g = group('alien', head);
  for (const sx of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.042, 12, 10), mat('#0d0d0d', { roughness: 0.1, metalness: 0.3 }), sx * 0.048, 0.015, -0.088, g);
    eye.scale.set(0.8, 1.3, 0.55);
    eye.rotation.z = sx * -0.55;
    const ant = add(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 6), mats.skin, sx * 0.05, 0.16, 0, g);
    ant.rotation.z = sx * -0.35;
    add(new THREE.SphereGeometry(0.025, 10, 8), mat('#76ff03', { emissive: '#33691e' }), sx * 0.075, 0.23, 0, g);
  }

  // Pirat: trekantig hatt med dödskalle, ögonlapp och skägg
  g = group('pirate', head);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 3), black, 0, 0.085, 0.01, g).rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 16), black, 0, 0.13, 0.01, g);
  add(new THREE.SphereGeometry(0.022, 8, 6), white, 0, 0.14, -0.105, g);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), black, 0.042, 0.012, -0.108, g).rotation.x = Math.PI / 2;
  const strap = add(new THREE.CylinderGeometry(0.114, 0.114, 0.01, 20, 1, true), black, 0, 0.03, 0, g);
  strap.rotation.z = 0.35;
  add(new THREE.SphereGeometry(0.09, 12, 10), mat('#3e2723', { roughness: 0.95 }), 0, -0.09, -0.06, g).scale.set(1.1, 0.9, 0.7);
  g = group('pirate', upper);
  add(new THREE.CylinderGeometry(0.157, 0.157, 0.05, 20), mat('#3e2723'), 0, 0.12, 0, g);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.02), gold, 0, 0.12, -0.16, g);

  // Pingvin: vit ansiktsmask, ögon, orange näbb och vit mage
  g = group('penguin', head);
  add(new THREE.SphereGeometry(0.1, 14, 10), white, 0, -0.01, -0.035, g).scale.set(0.95, 0.95, 0.85);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.016, 8, 6), black, sx * 0.04, 0.025, -0.118, g);
  add(new THREE.ConeGeometry(0.03, 0.08, 10), mat('#ff9800'), 0, -0.02, -0.15, g).rotation.x = -Math.PI / 2;
  g = group('penguin', upper);
  add(new THREE.SphereGeometry(0.16, 14, 12), white, 0, 0.28, -0.085, g).scale.set(0.95, 1.45, 0.55);

  // Viking: hjälm med horn och nässkydd, stort skägg
  g = group('viking', head);
  const iron = mat('#9e9e9e', { roughness: 0.35, metalness: 0.7 });
  add(new THREE.SphereGeometry(0.124, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), iron, 0, 0.03, 0.005, g);
  add(new THREE.TorusGeometry(0.122, 0.012, 6, 24), mat('#795548'), 0, 0.03, 0.005, g).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.02, 0.07, 0.012), iron, 0, 0.0, -0.125, g);
  for (const sx of [-1, 1]) {
    const horn = add(new THREE.ConeGeometry(0.028, 0.15, 10), mat('#efebe9', { roughness: 0.5 }), sx * 0.15, 0.12, 0, g);
    horn.rotation.z = sx * -0.75;
  }
  add(new THREE.SphereGeometry(0.095, 12, 10), hairM, 0, -0.09, -0.06, g).scale.set(1.15, 1.3, 0.7);
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.018, 0.12, 4, 8), hairM, sx * 0.035, -0.2, -0.07, g);

  // Zombie: olika stora ögon, sydda ärr och trasig mun
  g = group('zombie', head);
  add(new THREE.SphereGeometry(0.026, 10, 8), mat('#fffde7'), -0.042, 0.02, -0.1, g);
  add(new THREE.SphereGeometry(0.011, 8, 6), mat('#b71c1c'), -0.042, 0.02, -0.124, g);
  add(new THREE.SphereGeometry(0.014, 8, 6), black, 0.042, 0.018, -0.108, g);
  add(new THREE.BoxGeometry(0.07, 0.022, 0.01), mat('#3e2723'), 0, -0.045, -0.108, g).rotation.z = 0.12;
  for (const sx of [-0.02, 0.012]) add(new THREE.BoxGeometry(0.012, 0.014, 0.012), mat('#fff8e1'), sx, -0.038, -0.112, g);
  add(new THREE.BoxGeometry(0.11, 0.006, 0.01), black, 0.01, 0.08, -0.095, g).rotation.z = -0.3;
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.005, 0.022, 0.01), black, -0.035 + k * 0.025, 0.08 - k * 0.0075 + 0.001, -0.098, g);
  add(new THREE.SphereGeometry(0.119, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mat('#33291f', { roughness: 1 }), 0, 0.02, 0.01, g).scale.set(1.02, 1.1, 1.06);

  // Astronaut: glashjälm med guldvisir, krage och kontrollpanel på bröstet
  g = group('astro', head);
  add(new THREE.SphereGeometry(0.175, 24, 18), new THREE.MeshStandardMaterial({ color: '#e3f2fd', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false }), 0, 0.01, 0, g).castShadow = false;
  add(new THREE.SphereGeometry(0.178, 24, 12, Math.PI * 0.5 - 0.7, 1.4, Math.PI * 0.18, Math.PI * 0.32), new THREE.MeshStandardMaterial({ color: '#ffca28', metalness: 0.95, roughness: 0.12, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 0.01, 0, g).rotation.y = Math.PI;
  add(new THREE.TorusGeometry(0.13, 0.03, 8, 24), mat('#b0bec5', { metalness: 0.5, roughness: 0.3 }), 0, -0.14, 0, g).rotation.x = Math.PI / 2;
  g = group('astro', upper);
  add(new THREE.BoxGeometry(0.16, 0.1, 0.03), mat('#90a4ae'), 0, 0.33, -0.155, g);
  [['#f44336', -0.045], ['#ffeb3b', 0], ['#4caf50', 0.045]].forEach(([c, x]) => add(new THREE.SphereGeometry(0.014, 8, 6), mat(c, { emissive: c, emissiveIntensity: 0.4 }), x, 0.33, -0.172, g));
  add(new THREE.BoxGeometry(0.07, 0.045, 0.01), mat('#1565c0'), 0.11, 0.43, -0.135, g).rotation.y = 0.5;

  // Superhjälte: ögonmask, emblem på bröstet och mantel
  g = group('hero', head);
  add(new THREE.CylinderGeometry(0.116, 0.116, 0.04, 20, 1, true, Math.PI - 1.1, 2.2), black, 0, 0.022, 0, g);
  g = group('hero', upper);
  add(new THREE.BoxGeometry(0.09, 0.09, 0.02), mat('#ffeb3b'), 0, 0.37, -0.15, g).rotation.z = Math.PI / 4;
  add(new THREE.BoxGeometry(0.05, 0.05, 0.022), mat('#c62828'), 0, 0.37, -0.152, g).rotation.z = Math.PI / 4;
  add(new THREE.CylinderGeometry(0.158, 0.158, 0.045, 20), mat('#ffeb3b'), 0, 0.1, 0, g);
  const cape = (color) => {
    const c = add(new THREE.BoxGeometry(0.44, 0.78, 0.016), mat(color, { roughness: 0.6, side: THREE.DoubleSide }), 0, 0.12, 0.27, g);
    c.rotation.x = 0.22;
    return c;
  };
  cape('#c62828');

  // Guldkungen: krona med ädelstenar och lila mantel
  g = group('crown', head);
  const crownM = mat('#ffd54f', { roughness: 0.3, metalness: 0.4 });
  add(new THREE.CylinderGeometry(0.105, 0.11, 0.06, 20, 1, true), crownM, 0, 0.12, 0, g);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    add(new THREE.ConeGeometry(0.022, 0.06, 6), crownM, Math.sin(a) * 0.1, 0.18, Math.cos(a) * 0.1, g);
    add(new THREE.SphereGeometry(0.013, 8, 6), mat(k % 2 ? '#e53935' : '#1e88e5', { roughness: 0.1, metalness: 0.3 }), Math.sin(a) * 0.108, 0.12, Math.cos(a) * 0.108, g);
  }
  g = group('kingcape', upper);
  cape('#6a1b9a');
  add(new THREE.TorusGeometry(0.15, 0.035, 8, 24), white, 0, 0.53, 0.02, g).rotation.x = Math.PI / 2;

  return parts;
}

// Pjäxans sidoprofil (z framåt negativt, y uppåt) som extruderas på bredden med rundade kanter
function makeBootGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.15, 0.025);                               // häl, nere
  shape.lineTo(-0.15, 0.025);                              // sulan fram till tån
  shape.quadraticCurveTo(-0.172, 0.03, -0.168, 0.065);     // tåns front
  shape.quadraticCurveTo(-0.162, 0.11, -0.115, 0.125);     // tåhättan
  shape.quadraticCurveTo(-0.07, 0.14, -0.05, 0.21);        // vristen
  shape.lineTo(-0.035, 0.37);                              // skaftets framsida (lutar framåt)
  shape.lineTo(0.105, 0.38);                               // skaftets överkant
  shape.quadraticCurveTo(0.12, 0.25, 0.135, 0.17);         // vaden
  shape.quadraticCurveTo(0.16, 0.12, 0.158, 0.05);         // hälen
  shape.quadraticCurveTo(0.157, 0.027, 0.15, 0.025);
  const w = 0.1;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.014, bevelSegments: 3, curveSegments: 8,
  });
  geo.rotateY(-Math.PI / 2); // profilens x blir z, bredden blir x
  geo.translate(w / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function makeSkier() {
  const root = new THREE.Group();
  const heading = new THREE.Group();
  const spinG = new THREE.Group();
  const flipG = new THREE.Group();
  const model = new THREE.Group();
  root.add(heading);
  heading.add(spinG);
  spinG.add(flipG);
  flipG.position.y = 0.9;
  flipG.add(model);
  model.position.y = -0.9;

  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra });
  const jacket = mat('#d84315', { roughness: 0.55 });
  const accent = mat('#1a2a3a', { roughness: 0.6 });
  const pants = mat('#2b3a4a', { roughness: 0.85 });
  const bootM = mat('#eceff1', { roughness: 0.35 });
  const buckleM = mat('#ff6f00', { roughness: 0.3, metalness: 0.4 });
  const bindM = mat('#37474f', { roughness: 0.4, metalness: 0.5 });
  const skin = mat('#e8b98f');
  const helmetM = mat('#1565c0', { roughness: 0.2, metalness: 0.25 });
  const stripeM = mat('#ffffff', { roughness: 0.3 });
  const darkM = mat('#15191d', { roughness: 0.5 });
  const lensM = new THREE.MeshStandardMaterial({
    color: '#ff9100', emissive: '#5a2a00', metalness: 0.9, roughness: 0.12, side: THREE.DoubleSide,
  });
  const packM = mat('#3d4650', { roughness: 0.8 });
  const skiM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
  const mats = { jacket, helmet: helmetM, gear: skiM, pants, accent, skin, pack: packM, boot: bootM };

  const add = (geo, m, x, y, z, parent = model) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const limb = (r, len, m) => {
    const o = add(new THREE.CapsuleGeometry(r, len - r, 6, 12), m, 0, 0, 0);
    o.userData.len = len;
    return o;
  };

  // Fötter: skida (kan lossna vid krasch) + pjäxa (sitter kvar på foten)
  const skiGeo = makeSkiGeometry();
  const bootGeo = makeBootGeometry();
  const feet = [-1, 1].map((s) => {
    const foot = new THREE.Group();
    foot.position.set(s * 0.13, 0, 0);
    model.add(foot);
    const board = new THREE.Group();
    foot.add(board);
    add(skiGeo, skiM, 0, 0.012, -0.05, board);
    add(new THREE.BoxGeometry(0.075, 0.035, 0.11), bindM, 0, 0.04, -0.2, board);
    add(new THREE.BoxGeometry(0.075, 0.045, 0.13), bindM, 0, 0.045, 0.19, board);
    add(new THREE.BoxGeometry(0.06, 0.02, 0.3), bindM, 0, 0.03, 0, board);
    // Pjäxa: skal med tåhätta, vrist och framåtlutat skaft, sula med klackar, spännen och powerstrap
    add(bootGeo, bootM, 0, 0, 0, foot);
    add(new THREE.BoxGeometry(0.13, 0.024, 0.335), darkM, 0, 0.013, -0.005, foot);           // sula
    add(new THREE.BoxGeometry(0.1, 0.03, 0.03), darkM, 0, 0.035, -0.172, foot);              // tåklack
    add(new THREE.BoxGeometry(0.1, 0.035, 0.035), darkM, 0, 0.04, 0.165, foot);              // hälklack
    for (const [y, z, rx] of [[0.13, -0.11, -0.75], [0.19, -0.065, -0.45], [0.27, -0.045, -0.1], [0.33, -0.045, -0.05]]) {
      const band = add(new THREE.BoxGeometry(0.145, 0.014, 0.034), buckleM, 0, y, z, foot);
      band.rotation.x = rx;
      add(new THREE.BoxGeometry(0.018, 0.03, 0.05), buckleM, s * 0.078, y, z + 0.035, foot).rotation.x = rx; // spak på utsidan
    }
    add(new THREE.CylinderGeometry(0.083, 0.083, 0.035, 16, 1, true), darkM, 0, 0.36, 0.035, foot).scale.set(0.95, 1, 1.05); // powerstrap
    add(new THREE.CylinderGeometry(0.06, 0.062, 0.04, 14), darkM, 0, 0.385, 0.035, foot);    // innersko
    return { foot, board };
  });

  // Snowboard med bindningar (visas i snowboard-läge)
  const snowboard = new THREE.Group();
  model.add(snowboard);
  add(makeBoardGeometry(), skiM, 0, 0.012, 0, snowboard);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.25, 0.03, 0.2), bindM, 0, 0.035, s * 0.24, snowboard).rotation.y = s * 0.25;
    add(new THREE.BoxGeometry(0.03, 0.2, 0.18), bindM, -0.12, 0.13, s * 0.24, snowboard).rotation.set(0, s * 0.25, 0.25);
  }

  // Bäcken
  const pelvis = add(new THREE.CapsuleGeometry(0.115, 0.14, 6, 12), pants, 0, 0.9, 0);
  pelvis.rotation.z = Math.PI / 2;

  // Överkropp (vrids/lutar runt höften)
  const upper = new THREE.Group();
  model.add(upper);
  add(new THREE.CapsuleGeometry(0.15, 0.12, 6, 14), jacket, 0, 0.13, 0, upper);
  add(new THREE.CapsuleGeometry(0.18, 0.18, 6, 14), jacket, 0, 0.36, 0, upper).scale.set(1.05, 1, 0.82);
  add(new THREE.CapsuleGeometry(0.1, 0.3, 6, 12), accent, 0, 0.5, 0, upper).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.075, 0.1, 0.1, 14), accent, 0, 0.6, 0, upper);
  add(new THREE.BoxGeometry(0.26, 0.32, 0.12), packM, 0, 0.33, 0.19, upper);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 12, 10), jacket, s * 0.22, 0.49, 0, upper);

  // Huvud med hjälm, goggles och band
  const head = new THREE.Group();
  head.position.set(0, 0.75, -0.01);
  upper.add(head);
  add(new THREE.SphereGeometry(0.11, 18, 14), skin, 0, 0, 0, head).scale.set(1, 1.12, 1.05);
  const helmetStart = head.children.length;
  add(new THREE.SphereGeometry(0.14, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), helmetM, 0, 0.02, 0.008, head);
  for (const phi of [Math.PI / 2, Math.PI * 1.5]) {
    add(new THREE.SphereGeometry(0.142, 4, 12, phi - 0.1, 0.2, 0, Math.PI * 0.5), stripeM, 0, 0.02, 0.008, head);
  }
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.045, 10, 8), helmetM, s * 0.125, -0.03, 0.01, head).scale.set(0.5, 1, 1);
  add(new THREE.BoxGeometry(0.2, 0.012, 0.05), helmetM, 0, 0.075, -0.13, head).rotation.x = 0.35; // skärm
  const helmetParts = head.children.slice(helmetStart);
  const goggleParts = [
    add(new THREE.CylinderGeometry(0.143, 0.143, 0.032, 24, 1, true), darkM, 0, 0.0, 0.008, head),
    add(new THREE.CylinderGeometry(0.138, 0.138, 0.08, 20, 1, true, Math.PI - 1.1, 2.2), lensM, 0, 0.0, 0.004, head),
  ];
  add(new THREE.BoxGeometry(0.03, 0.06, 0.04), darkM, 0, -0.08, -0.09, head); // halskrage/buff

  const legs = [-1, 1].map(() => ({ thigh: limb(0.1, THIGH, pants), shin: limb(0.085, SHIN, pants) }));
  const arms = [-1, 1].map(() => ({
    upper: limb(0.068, UPPER_ARM, jacket),
    fore: limb(0.06, FOREARM, jacket),
    hand: add(new THREE.SphereGeometry(0.058, 10, 8), darkM, 0, 0, 0),
  }));
  arms.forEach((a) => a.hand.scale.set(0.9, 1.25, 1));

  // Stavar (väljs i butiken): pekar nedåt från handen, längd 1,2 m
  const poleMat = mat('#b0bec5', { roughness: 0.3, metalness: 0.7 });
  mats.poles = poleMat;
  const poles = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 1.2, 6).translate(0, -0.6, 0), poleMat));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.14, 8).translate(0, -0.04, 0), darkM));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).translate(0, -1.08, 0), darkM));
    g.traverse((o) => { o.castShadow = true; });
    g.visible = false;
    model.add(g);
    return g;
  });

  const costumes = makeCostumes(add, mat, head, upper, mats);

  scene.add(root);
  return {
    root, heading, spinG, flipG, model, feet, snowboard, pelvis, upper, head, legs, arms, mats, poles, helmetParts, goggleParts, costumes,
    pose: {
      hipY: 0.9, lift: 0, pitch: -0.25, tweak: 0,
      hands: [new THREE.Vector3(-0.4, 1.0, -0.3), new THREE.Vector3(0.4, 1.0, -0.3)],
    },
  };
}

const skier = makeSkier();

// Färger från stilbutiken + skidor eller snowboard
const currentCharacter = () => CHARACTERS.find((c) => c.id === save.character) || CHARACTERS[0];

function applyLook(ch = currentCharacter()) {
  const m = skier.mats;
  m.jacket.color.set(ch.jacket || styleColor('jacket'));
  m.jacket.metalness = ch.metal ? 0.35 : ch.gold ? 0.45 : 0;
  m.jacket.roughness = ch.metal ? 0.35 : ch.gold ? 0.3 : 0.55;
  for (const k of ['pants', 'accent', 'skin', 'pack', 'boot']) m[k].color.set(ch[k] || CHAR_DEFAULT[k]);
  m.pants.metalness = ch.metal ? 0.3 : ch.gold ? 0.4 : 0;
  m.pants.roughness = ch.gold ? 0.3 : 0.85;
  m.boot.metalness = ch.gold ? 0.4 : 0;
  m.skin.metalness = ch.metal ? 0.4 : 0;
  if (ch.hair) m.hair.color.set(ch.hair);
  for (const [id, groups] of Object.entries(skier.costumes)) {
    for (const g of groups) g.visible = !!ch.parts && ch.parts.includes(id);
  }
  for (const part of skier.goggleParts) part.visible = !ch.noGoggles;
  skier.mats.helmet.color.set(styleColor('helmet'));
  const chrome = save.style.helmet === 'helmet-chrome';
  skier.mats.helmet.metalness = chrome ? 0.95 : 0.25;
  skier.mats.helmet.roughness = chrome ? 0.08 : 0.2;
  skier.mats.gear.color.set(styleColor('gear'));
  skier.snowboard.visible = isBoard();
  for (const part of skier.helmetParts) part.visible = save.helmetOn !== false && !ch.noHelmet;
  const poleStyle = save.style.poles || 'poles-none';
  for (const pole of skier.poles) pole.visible = !isBoard() && poleStyle !== 'poles-none';
  if (poleStyle !== 'poles-none') skier.mats.poles.color.set(styleColor('poles'));
  skier.mats.poles.metalness = poleStyle === 'poles-alu' || poleStyle === 'poles-gold' ? 0.75 : 0.2;
  for (const f of skier.feet) f.board.visible = !isBoard();
}
applyLook();
