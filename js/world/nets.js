'use strict';
// Avspärrningsnäten längs kanterna.

// ---------- Avspärrning: skyddsnät längs kanterna ----------

const NET_SEG = 3;
const NET_POINTS = 110;
const NET_H = 1.5;
const netTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ff6d00';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const netGeo = new THREE.BufferGeometry();
const netPos = new Float32Array(2 * NET_POINTS * 2 * 3);
const netUv = new Float32Array(2 * NET_POINTS * 2 * 2);
const netIdx = [];
for (let side = 0; side < 2; side++) {
  for (let i = 0; i < NET_POINTS - 1; i++) {
    const a = (side * NET_POINTS + i) * 2;
    netIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}
netGeo.setIndex(netIdx);
netGeo.setAttribute('position', new THREE.BufferAttribute(netPos, 3));
netGeo.setAttribute('uv', new THREE.BufferAttribute(netUv, 2));
// Off-pist: bara ett rep (två trådar) mellan trästolpar istället för nät
const ropeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffb300';
  g.fillRect(0, 30, 64, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const netMat = new THREE.MeshLambertMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
const ropeMat = new THREE.MeshLambertMaterial({ map: ropeTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
const nets = new THREE.Mesh(netGeo, netMat);
nets.frustumCulled = false;
scene.add(nets);
const netPosts = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.05, 0.06, NET_H + 0.3, 6).translate(0, (NET_H + 0.3) / 2, 0),
  new THREE.MeshLambertMaterial({ color: '#263238' }), NET_POINTS,
);
netPosts.frustumCulled = false;
netPosts.castShadow = true;
scene.add(netPosts);
let netStart = null;

function updateNets(pd) {
  // Off-pist: inget nät, bara ett rep mellan trästolpar
  nets.material = course.offpiste ? ropeMat : netMat;
  netPosts.material.color.set(course.offpiste ? '#8d6e63' : '#263238');
  const start = Math.floor((pd - 30) / NET_SEG) * NET_SEG;
  if (start === netStart) return;
  netStart = start;
  let posts = 0;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < NET_POINTS; i++) {
      const d = start + i * NET_SEG;
      const x = courseX(d) + (side ? netX() : -netX());
      const y = groundY(x, d);
      const v = (side * NET_POINTS + i) * 2;
      netPos.set([x, y, -d, x, y + NET_H, -d], v * 3);
      netUv.set([d / 1.5, 0, d / 1.5, NET_H / 1.5 * 2], v * 2);
      if (d % (NET_SEG * 2) === 0) {
        dummy.position.set(x, y - 0.1, -d);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        netPosts.setMatrixAt(posts++, dummy.matrix);
      }
    }
  }
  netPosts.count = posts;
  netPosts.instanceMatrix.needsUpdate = true;
  netGeo.attributes.position.needsUpdate = true;
  netGeo.attributes.uv.needsUpdate = true;
  netGeo.computeVertexNormals();
}
