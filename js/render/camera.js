'use strict';
// Kameran: tredje person, förstapersonsvy och menyer.

// Förstapersonsvy (C): kameran sitter i hjälmen och följer huvudet, som en GoPro
const FPV_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0));
const FPV_TILT_BOARD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)); // i luften: titta ner mot brädan
const fpvPos = new THREE.Vector3();
const fpvQuat = new THREE.Quaternion();
const fpvMat = new THREE.Matrix4();
const fpvTarget = new THREE.Vector3();
const fpvNose = new THREE.Vector3();
const fpvBoardQuat = new THREE.Quaternion();
const fpvOffset = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const fpvFwd = new THREE.Vector3();
const fpvUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function toggleCamera() {
  save.fpv = !save.fpv;
  persist();
  popup(t(save.fpv ? 'cam.first' : 'cam.third'));
}

function updateFirstPerson(dt, snap) {
  const m = skier;
  m.root.updateMatrixWorld(true);
  m.head.getWorldPosition(fpvPos);
  m.head.getWorldQuaternion(fpvQuat);
  // Lite framför ansiktet (i huvudets egen riktning, inte nedåtblicken – annars hamnar kameran i bröstet)
  // Tåsidan ligger till höger om huvudet när man åker vanligt, till vänster när man åker switch
  camera.position.copy(fpvPos).add(fpvOffset.set(isBoard() ? (isSwitch() ? -0.45 : 0.45) : 0, 0.06, isBoard() ? -0.05 : -0.16).applyQuaternion(fpvQuat));
  fpvQuat.multiply(isBoard() ? FPV_TILT_BOARD : FPV_TILT);
  // På marken: behåll bara en tredjedel av huvudets lutning åt sidan (annars tippar horisonten i svängar).
  // I luften följer kameran huvudet exakt, så att volter och snurr ser ut precis som de är.
  fpvFwd.set(0, 0, -1).applyQuaternion(fpvQuat);
  fpvUp.set(0, 1, 0).applyQuaternion(fpvQuat).lerp(WORLD_UP, 0.65).normalize();
  if (isBoard() && !player.air) {
    // Snowboard: titta framåt längs backen, men tillräckligt nedåt för att brädan syns längst ner
    m.snowboard.getWorldPosition(fpvTarget);
    fpvNose.set(0, 0, -1).applyQuaternion(m.snowboard.getWorldQuaternion(fpvBoardQuat));
    fpvTarget.addScaledVector(fpvNose, isSwitch() ? -2.6 : 2.6).addScaledVector(WORLD_UP, -0.5); // switch: brädans bakände leder
    fpvMat.lookAt(camera.position, fpvTarget, fpvUp);
    fpvQuat.setFromRotationMatrix(fpvMat);
  } else if (!isBoard() && isSwitch() && !player.air) {
    // Skidor switch: titta över axeln åt det håll man åker
    const a = player.angle;
    fpvTarget.copy(camera.position).add(fpvNose.set(Math.sin(a), -0.45, -Math.cos(a)));
    fpvMat.lookAt(camera.position, fpvTarget, WORLD_UP);
    fpvQuat.setFromRotationMatrix(fpvMat);
  } else if (!player.air && Math.abs(fpvFwd.dot(fpvUp)) < 0.98) {
    fpvMat.lookAt(ORIGIN, fpvFwd, fpvUp);
    fpvQuat.setFromRotationMatrix(fpvMat);
  }
  if (snap) camera.quaternion.copy(fpvQuat);
  else camera.quaternion.slerp(fpvQuat, smooth(18, dt));
  const fov = isBoard() ? 96 : 80;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * smooth(6, dt);
    camera.updateProjectionMatrix();
  }
}

let camHeading = 0;
let wasThirdPerson = true;
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const lookCurrent = new THREE.Vector3();

function updateCamera(dt, time, snap = false) {
  const p = player;
  const f = feet();

  if (state === 'intro' || (state === 'menu' && !$('menu').classList.contains('hidden'))) {
    // Långsam svävande kamera som tittar ut över backen och bergen (startskärm och huvudmeny)
    const a = time * 0.06;
    camera.position.set(Math.sin(a) * 26, groundY(0, -15) + 13 + Math.sin(time * 0.25) * 1.5, 15 + Math.cos(a) * 6);
    lookCurrent.set(Math.sin(a * 0.7) * 10, groundY(0, 160) - 6, -160);
    camera.lookAt(lookCurrent);
    if (camera.fov !== 62) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
    return;
  }

  if (state === 'menu' && !$('characters').classList.contains('hidden')) {
    // Karaktärsval: nära kamera som sakta går runt åkaren, åkaren till vänster om panelen
    skier.head.visible = true;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    const a = Math.PI + Math.sin(time * 0.35) * 0.9;
    camera.position.set(f.x + Math.sin(a) * 4, f.y + 1.6, f.z + Math.cos(a) * 4);
    lookCurrent.set(f.x, f.y + 0.95, f.z);
    camera.lookAt(lookCurrent);
    const wideScreen = innerWidth > 760;
    if (wideScreen) camera.translateX(1.25);
    camHeading = 0;
    return;
  }

  if (state === 'menu' || state === 'shop') {
    skier.head.visible = true;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    const a = time * 0.15;
    camera.position.set(f.x + Math.sin(a) * 6, f.y + 2.2, f.z + Math.cos(a) * 6);
    lookCurrent.set(f.x, f.y + 1, f.z);
    camera.lookAt(lookCurrent);
    camHeading = 0;
    return;
  }

  // Sittliften: titta runt fritt (piltangenter/mus), C växlar mellan stolen och vy utifrån
  if (state === 'lift') {
    const fpvLift = save.fpv;
    skier.head.visible = !fpvLift;
    skier.upper.visible = true;
    for (const leg of skier.legs) leg.thigh.visible = true;
    for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = true;
    liftDir.set(Math.sin(liftView.yaw) * Math.cos(liftView.pitch), Math.sin(liftView.pitch), Math.cos(liftView.yaw) * Math.cos(liftView.pitch));
    if (fpvLift) {
      skier.root.updateMatrixWorld(true);
      skier.head.getWorldPosition(camera.position);
      camera.position.y += 0.05;
    } else {
      camera.position.copy(liftSeat).addScaledVector(liftDir, -6.5).y += 1.6;
    }
    lookCurrent.copy(fpvLift ? camera.position : liftSeat).add(liftDir);
    if (!fpvLift) lookCurrent.y += 1;
    camera.lookAt(lookCurrent);
    if (Math.abs(camera.fov - 70) > 0.05) {
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // Förstapersonsvy (inte vid krasch – då blir det för rörigt)
  const fpv = save.fpv && (state === 'playing' || state === 'paused');
  skier.head.visible = !fpv;
  // Snowboard i förstapersonsvy: axeln sitter vid kameran, så bål, lår och armar skymmer bara
  // (en ensam vante blir en svävande prick) – visa brädan och benen
  const hideBody = fpv && (isBoard() || isSwitch());
  skier.upper.visible = !hideBody;
  for (const leg of skier.legs) leg.thigh.visible = !hideBody;
  for (const arm of skier.arms) arm.upper.visible = arm.fore.visible = arm.hand.visible = !hideBody;
  if (fpv) {
    updateFirstPerson(dt, snap || wasThirdPerson);
    wasThirdPerson = false;
    return;
  }
  if (!wasThirdPerson) snap = true; // tillbaka till vanlig vy: hoppa direkt dit
  wasThirdPerson = true;

  if (inPipe(p.d)) {
    // Kameran står mitt i pipen bakom och ovanför, och siktar på åkaren
    camHeading = 0;
    const camD = p.d - 10;
    const skierY = groundY(p.x, p.d) + p.z;
    camTarget.set(p.x * 0.35, baseY(camD) + 4.5 + Math.max(0, skierY - baseY(p.d) - 5) * 0.5, -camD);
    lookTarget.set(p.x * 0.75, skierY * 0.7 + (baseY(p.d + 6) + 1.5) * 0.3, -(p.d + 3));
    if (snap) {
      camera.position.copy(camTarget);
      lookCurrent.copy(lookTarget);
    } else {
      camera.position.lerp(camTarget, smooth(6, dt));
      lookCurrent.lerp(lookTarget, smooth(8, dt));
    }
    camera.lookAt(lookCurrent);
    if (Math.abs(camera.fov - 66) > 0.05) {
      camera.fov += (66 - camera.fov) * smooth(3, dt);
      camera.updateProjectionMatrix();
    }
    return;
  }
  camHeading += (p.angle * 0.55 - camHeading) * smooth(3, dt);
  const sx = Math.sin(camHeading);
  const cz = Math.cos(camHeading);
  const back = 6;
  const camX = p.x - sx * back;
  const camD = p.d - cz * back;
  camTarget.set(camX, groundY(camX, camD) - mogulY(camX, camD) + 2.2 + p.z * 0.6, -camD);
  const lookD = p.d + cz * 10;
  const lookX = p.x + sx * 10;
  lookTarget.set(lookX, groundY(lookX, lookD) - mogulY(lookX, lookD) + 1 + p.z * 0.5, -lookD);
  if (course.mega && p.air) {
    // Big Air: marken under åkaren kan vara gapet, så kameran följer åkarens riktiga höjd
    // och siktar mellan åkaren och landningen
    const skierY = groundY(p.x, p.d) + p.z;
    const bx = p.x - sx * 10;
    const bd = p.d - cz * 10;
    camTarget.set(bx, Math.max(groundY(bx, bd) + 2, skierY + 3.5), -bd);
    lookTarget.set(p.x + sx * 6, skierY - 1, -(p.d + cz * 6)); // åkaren i mitten, landningen syns nedanför
  }

  if (snap) {
    camera.position.copy(camTarget);
    lookCurrent.copy(lookTarget);
  } else {
    camera.position.lerp(camTarget, smooth(12, dt));
    lookCurrent.lerp(lookTarget, smooth(12, dt));
  }
  camera.lookAt(lookCurrent);

  const fov = 60 + clamp(p.speed, 0, 28) * 0.55;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * smooth(3, dt);
    camera.updateProjectionMatrix();
  }
}
