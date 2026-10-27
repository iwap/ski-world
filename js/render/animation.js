'use strict';
// Åkarens rörelser och poser.

// ---------- Uppdatera 3D-scenen ----------

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpJ = new THREE.Vector3();
const KNEE_HINT = [new THREE.Vector3(-0.12, 0, -1), new THREE.Vector3(0.12, 0, -1)];
const ELBOW_HINT = [new THREE.Vector3(-0.6, -0.4, 0.5), new THREE.Vector3(0.6, -0.4, 0.5)];
const shoulders = [new THREE.Vector3(), new THREE.Vector3()];
const ANKLE = new THREE.Vector3(0, 0.3, 0.02);
const DOWN = new THREE.Vector3(0, -1, 0);
const KNEE_HINT_BOARD = [new THREE.Vector3(1, 0, -0.3), new THREE.Vector3(1, 0, 0.3)];

function updateSkierModel(dt, time) {
  const p = player;
  const m = skier;
  const f = feet();
  const crashed = crashBody.active;
  const seated = state === 'lift';
  const air = p.air && !p.smallAir; // små luftskutt från puckar räknas som vanlig åkning
  const carve = air || p.grind || crashed || seated ? 0 : clamp(p.turnVel / stats().turnRate, -1, 1) * Math.min(1, p.speed / 10);

  m.root.visible = seated || !(p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0);
  if (seated) {
    // Sitter i stolen vänd uppför (höfterna på sitsen)
    m.root.position.copy(liftSeat).y -= 0.5;
    m.root.rotation.set(0, 0, 0);
    m.heading.rotation.y = Math.PI;
    m.spinG.rotation.y = 0;
    m.flipG.rotation.set(0, 0, 0);
    p.facingVis = p.facing;
  } else if (crashed) {
    m.root.position.copy(crashBody.pos).y -= 0.9;
    m.root.rotation.x = 0;
    m.flipG.quaternion.copy(crashBody.q);
  } else {
    m.root.position.set(f.x, f.y + p.z, f.z);
    m.root.rotation.x = -Math.atan(slopeAt(p.d)) * 0.8;
    // Luta med halfpipe-väggen (mjukt, så att det inte rycker vid kanten)
    const rollTarget = pipeEnv(p.d) > 0 && !air ? Math.atan((pipeY(p.x + 0.25, p.d) - pipeY(p.x - 0.25, p.d)) / 0.5) * 0.9 : 0;
    m.root.rotation.z += (rollTarget - m.root.rotation.z) * smooth(10, dt);
    if (p.pipeAir) {
      // Vrid mjukt i luften: upp med blicken mot väggen, ner mot pipen igen
      const prog = clamp((p.pipeAir.vz0 - p.vz) / (2 * p.pipeAir.vz0), 0, 1);
      m.heading.rotation.y = -p.pipeAir.a0 * Math.cos(prog * Math.PI);
    } else {
      m.heading.rotation.y = -p.angle;
    }

    // Åkriktning (fram/bak) + snurr + hur skidorna står (tvärs vid rail-slide och hockeybroms)
    p.facingVis += (p.facing - p.facingVis) * smooth(9, dt);
    const twistTarget = p.grind ? p.grind.twist : p.braking * 1.1;
    p.twist += (twistTarget - p.twist) * smooth(10, dt);
    // Cork: ett varv runt den lodräta axeln (360) …
    const corkSpin = p.corking ? p.corkDir * p.corkProg * Math.PI * 2 : 0;
    m.spinG.rotation.y = -(p.spin + p.facingVis + p.twist + corkSpin);

    // Lutning in i svängen (hela kroppen + skidorna på kant)
    const leanTarget = p.grind ? -p.balance * 0.7 : -carve * 0.6;
    p.lean += (leanTarget - p.lean) * smooth(7, dt);
    p.stumble = Math.max(0, (p.stumble || 0) - dt * 1.4);
    const wobble = Math.sin(time * 22) * 0.35 * p.stumble;
    // … medan kroppen lutar ut ~125° och tillbaka – mitt i snurret är huvudet under skidorna
    const corkTilt = p.corking ? -Math.sin(p.corkProg * Math.PI) * 2.2 : 0;
    m.flipG.rotation.set(p.flipping ? p.flipDir * p.flipProg * Math.PI * 2 : -p.stumble * 0.5 + corkTilt, 0, p.lean + wobble);
  }

  const grab = !crashed && !seated && air && isGrab();
  const grabId = grab ? currentGrab().id : null;
  const tuck = !crashed && !seated && !air && !p.grind && isTuck();
  p.squash = Math.max(0, p.squash - dt * 3);

  // Benen fjädrar i gupp: titta på hur backen kröker sig under åkaren
  let absorb = 0;
  if (!air && !p.grind && !crashed && !seated) {
    const fx = Math.sin(p.angle) * 1.5;
    const fd = Math.cos(p.angle) * 1.5;
    const curv = groundY(p.x + fx, p.d + fd) + groundY(p.x - fx, p.d - fd) - 2 * f.y;
    absorb = clamp(-curv * 2.5, -0.2, 0.2);
  }

  // Pose-mål
  const pose = m.pose;
  const board = isBoard();
  // Snowboard: positivt "toe" = tåsväng (mot bröstet), negativt = hälsväng
  const toe = board ? carve * (isSwitch() ? -1 : 1) : 0;
  const onSnow = !air && !p.grind && !crashed && !seated;
  let hipY = 0.9;
  let lift = 0;
  let pitch = -0.3;
  if (board) {
    // Tåsväng: böj fram över tårna. Hälsväng: sitt bak med lägre höfter och upprätt överkropp.
    hipY = 0.82 - 0.04 * Math.abs(toe) - (toe < 0 ? 0.07 * -toe : 0);
    pitch = -0.3 - (toe > 0 ? 0.15 : 0.2) * toe;
  }
  if (tuck) { hipY = 0.62; pitch = board ? -0.75 : -1.0; }
  if (p.braking > 0.3) { hipY = board ? 0.72 : 0.78; pitch = 0.0; }
  if (air) { hipY = board ? 0.76 : 0.82; lift = board ? 0.1 : 0; pitch = -0.35; }
  if (grab) { hipY = 0.72; lift = 0.42; pitch = -0.8; }
  if (p.grind) { hipY = 0.74; pitch = -0.3; }
  if (seated) { hipY = 0.5; lift = 0; pitch = 0.05; }
  if (crashed) {
    const flail = crashBody.lie ? 0 : 1;
    hipY = 0.86;
    pitch = -0.2 + Math.sin(time * 9) * 0.5 * flail;
  }
  hipY -= p.squash * (board ? 0.32 : 0.25) + Math.abs(carve) * 0.08 - absorb;
  if (onSnow) hipY += Math.sin(time * 2.3) * 0.012; // liten fjädring, aldrig helt stilla
  const k = smooth(grab ? 9 : 12, dt);
  pose.hipY += (hipY - pose.hipY) * k;
  pose.lift += (lift - pose.lift) * k;
  pose.pitch += (pitch - pose.pitch) * k;
  pose.tweak += ((grab ? 1 : 0) - pose.tweak) * smooth(6, dt);
  // Höfterna skjuts mot tårna i tåsväng och bakåt mot hälkanten i hälsväng
  const hipXTarget = board && onSnow ? (toe > 0 ? 0.08 : 0.12) * toe : 0;
  pose.hipX = (pose.hipX || 0) + (hipXTarget - (pose.hipX || 0)) * smooth(8, dt);

  if (p.highfive && (p.highfive.t -= dt) <= 0) p.highfive = null;
  m.snowboard.position.set(0, pose.lift, 0);
  m.snowboard.rotation.set(0.15 * pose.tweak, 0, -0.35 * pose.tweak);
  if (seated) {
    // I liften hänger brädan på tvären framför stolen
    m.snowboard.position.set(0, 0.12, -0.45);
    m.snowboard.rotation.set(0, Math.PI / 2, 0);
  }

  // Fötter: innerskidan lite före i svängen, "tweak" vid grab, isär vid krasch.
  // På snowboard står fötterna på tvären på brädan (vänster fot fram).
  m.feet.forEach(({ foot }, i) => {
    const s = i ? 1 : -1;
    if (seated) {
      // Benen hänger, skidorna/brädan framför stolen
      foot.position.set(s * (board ? 0.24 : 0.14), 0.12, -0.45);
      foot.rotation.set(board ? 0 : -0.3, board ? s * 0.25 : 0, 0);
    } else if (board) {
      foot.position.set(0, pose.lift, s * 0.24);
      foot.rotation.set(0.15 * pose.tweak, Math.PI / 2 + s * 0.25, -0.35 * pose.tweak);
    } else if (crashed) {
      const flail = crashBody.lie ? 0.3 : 1;
      foot.position.set(s * (0.2 + 0.08 * flail), 0.05 + Math.max(0, Math.sin(time * 11 + i * 2)) * 0.25 * flail, Math.sin(time * 8 + i * 3) * 0.25 * flail);
      foot.rotation.set(Math.sin(time * 7 + i) * 0.5 * flail, s * 0.4, s * 0.3);
    } else {
      const inside = Math.sign(carve) === s ? 1 : -1;
      foot.position.set(s * 0.13, pose.lift, -inside * Math.abs(carve) * 0.09);
      foot.rotation.set(0.2 * pose.tweak, 0.25 * pose.tweak, -0.5 * pose.tweak);
    }
    foot.updateMatrix();
  });

  // Bäcken och överkropp: angulation (överkroppen mer upprätt än benen) och kontrarotation
  m.pelvis.position.set(pose.hipX, pose.hipY, 0);
  // Vid grind/broms står skidorna snett men överkroppen vrids tillbaka mot färdriktningen
  const counter = crashed ? 0 : p.twist;
  // Snowboardåkaren står på sidan (bröstet mot tåkanten) men tittar nedför backen
  const side = board && !seated ? -Math.PI / 2 : 0;
  m.pelvis.rotation.set(0, side * 0.95 + carve * 0.15 + counter * 0.3, Math.PI / 2);
  m.upper.position.set(pose.hipX, pose.hipY, 0);
  // YXZ: först vridning, sedan framåtböj runt kroppens egen axel (för snowboard = mot tårna)
  m.upper.rotation.order = 'YXZ';
  m.head.rotation.order = 'YXZ';
  // Switch: kroppen står kvar på brädan/skidorna men vrids och tittar i färdriktningen (mjuk övergång)
  p.swBlend = (p.swBlend || 0) + ((isSwitch() && !crashed && !seated ? 1 : 0) - (p.swBlend || 0)) * smooth(6, dt);
  const sw = p.swBlend;
  const cs = 1 - 2 * sw; // vrid åt andra hållet i svängar när man åker switch
  if (board && !seated) {
    // Bröstet mot tåkanten i båda fallen, men överkropp och huvud vänds mot färdriktningen
    const upperYaw = side * 0.75 + (-Math.PI - 2 * side * 0.75) * sw; // switch: -π − side·0,75
    const headYaw = -side * 0.65 * cs;
    m.upper.rotation.set(pose.pitch, upperYaw + (carve * 0.4 + counter * 0.6) * cs, 0);
    m.head.rotation.set(-pose.pitch * 0.5, headYaw + (-carve * 0.7 + counter * 0.3) * cs, 0);
  } else {
    // Skidor switch: titta bakåt över axeln
    m.upper.rotation.set(pose.pitch, carve * 0.3 + counter * 0.6 + sw * 0.5, -p.lean * 0.55 * (crashed ? 0 : 1));
    m.head.rotation.set(-pose.pitch * 0.4, -carve * 0.25 + counter * 0.3 + sw * 1.3, p.lean * 0.3);
  }
  m.upper.updateMatrix();

  // Ben: höft → knä → fotled
  m.legs.forEach((leg, i) => {
    const s = i ? 1 : -1;
    if (board && !seated) tmpA.set(pose.hipX, pose.hipY - 0.02, s * 0.12);
    else tmpA.set(s * 0.1, pose.hipY - 0.02, 0);
    tmpB.copy(ANKLE).applyMatrix4(m.feet[i].foot.matrix);
    ik2(tmpA, tmpB, THIGH, SHIN, board && !seated ? KNEE_HINT_BOARD[i] : KNEE_HINT[i], tmpJ);
    placeLimb(leg.thigh, tmpA, tmpJ);
    placeLimb(leg.shin, tmpJ, tmpB);
  });

  // Armar: axel → armbåge → hand
  [-1, 1].forEach((s, i) => shoulders[i].set(s * 0.22, 0.49, 0).applyMatrix4(m.upper.matrix));
  const handTarget = (i) => {
    const s = i ? 1 : -1;
    const sh = shoulders[i];
    if (seated) return tmpA.set(sh.x * 0.6, sh.y - 0.32, sh.z - 0.3); // händerna i knät
    if (crashed) {
      if (crashBody.lie) return tmpA.set(sh.x + s * 0.5, sh.y + 0.1, sh.z - 0.1);   // utsträckt i snön
      return tmpA.set(sh.x + s * 0.4, sh.y + Math.sin(time * 13 + i * 2) * 0.4, sh.z + Math.cos(time * 11 + i) * 0.35);
    }
    if (p.highfive && i === (board ? 0 : p.highfive.right ? 1 : 0)) {
      const out = p.highfive.right ? 1 : -1;
      return tmpA.set(sh.x + out * 0.35, sh.y + 0.45, sh.z - 0.1);             // high five!
    }
    if (board) {
      const zs = p.swBlend > 0.5 ? -1 : 1; // färdriktningen längs brädan
      if (grab) {
        const gb = grabId;
        if (gb === 'indy' && i === 1) return tmpA.set(0.15, pose.lift + 0.06, 0.04);          // bakre handen på tåkanten
        if (gb === 'japan' && i === 0) return tmpA.set(-0.1, pose.lift + 0.08, -0.3 * zs);    // främre handen bakom, på hälkanten
        if (gb === 'tail' && i === 1) return tmpA.set(0, pose.lift + 0.05, 0.62 * zs);        // bakre handen på tailen
        if (gb === 'chinese') return tmpA.set(0.1, pose.lift + 0.05, (i ? 0.6 : -0.6) * zs); // nose och tail samtidigt
      }
      if (grab) return tmpA.set(sh.x + 0.1, sh.y + 0.2, sh.z - 0.45 * zs);
      const sway = Math.sin(time * 1.6 + i * 1.3) * 0.03;
      // Förstapersonsvy: håll armarna ut åt tåsidan så att brädan syns
      if (save.fpv && !air && !p.grind) return i ? tmpA.set(sh.x + 0.2, sh.y - 0.55 + sway, sh.z + 0.3 * zs) : tmpA.set(sh.x + 0.28, sh.y - 0.55 + sway, sh.z - 0.22 * zs);
      if (p.grind || air) return tmpA.set(sh.x + 0.05, sh.y - 0.05 + sway, sh.z + s * 0.5);
      if (tuck) return tmpA.set(sh.x + 0.25, sh.y - 0.45, sh.z + s * 0.12);
      // Främre armen leder, bakre följer. Tåsväng: händerna ner mot tårna. Hälsväng: upp och fram för balans.
      const heel = Math.max(0, -toe);
      const toes = Math.max(0, toe);
      return i === 0
        ? tmpA.set(sh.x + 0.2 + 0.12 * toes + 0.15 * heel, sh.y - 0.27 - 0.1 * toes + 0.12 * heel + sway, sh.z - 0.25 * zs)
        : tmpA.set(sh.x + 0.12 + 0.1 * toes + 0.15 * heel, sh.y - 0.38 - 0.06 * toes + 0.1 * heel + sway, sh.z + 0.14 * zs);
    }
    if (grab) {
      const gb = grabId;
      if (gb === 'indy' && i === 1) return tmpA.set(0.25, pose.lift + 0.1, -0.24);     // höger hand på höger skida
      if (gb === 'japan' && i === 0) return tmpA.set(-0.05, pose.lift + 0.14, -0.4);   // knäna upp, skidorna dras bakåt
      if (gb === 'tail' && i === 1) return tmpA.set(0.2, pose.lift + 0.08, 0.55);      // bakänden på skidan
      if (gb === 'chinese') return tmpA.set(i ? 0.22 : -0.22, pose.lift + 0.08, 0.5); // båda händerna bak på skidorna
      return tmpA.set(sh.x + (i ? 0.5 : -0.5), sh.y + 0.2, sh.z + 0.1);                // andra armen ut för balans
    }
    if (p.grind || air || p.stumble > 0.2) return tmpA.set(sh.x + s * 0.5, sh.y - 0.05, sh.z);
    if (tuck) return tmpA.set(s * 0.12, sh.y - 0.25, sh.z - 0.42);              // händerna framför knäna
    // I förstapersonsvy: händerna framför kroppen så att de syns i bild
    if (save.fpv && !crashed) return tmpA.set(sh.x + s * 0.2, sh.y - 0.34, sh.z - 0.5);
    // Avslappnat framför kroppen; innerhanden lite längre fram i svängen
    const inside = Math.sign(carve) === s ? Math.abs(carve) : 0;
    return tmpA.set(sh.x + s * 0.2, sh.y - 0.4 + inside * 0.08, sh.z - 0.3 - inside * 0.15);
  };
  m.arms.forEach((arm, i) => {
    pose.hands[i].lerp(handTarget(i), smooth(crashed ? 20 : 14, dt));
    const sh = shoulders[i];
    ik2(sh, pose.hands[i], UPPER_ARM, FOREARM, ELBOW_HINT[i], tmpJ);
    placeLimb(arm.upper, sh, tmpJ);
    tmpB.copy(pose.hands[i]).sub(tmpJ);
    if (tmpB.length() > FOREARM) tmpB.setLength(FOREARM);
    tmpB.add(tmpJ);
    placeLimb(arm.fore, tmpJ, tmpB);
    arm.hand.position.copy(tmpB);
    arm.hand.quaternion.copy(arm.fore.quaternion);

    // Staven: från handen mot en spets som beror på hur man åker
    const pole = m.poles[i];
    if (pole.visible) {
      const s = i ? 1 : -1;
      if (crashed) tmpA.set(s * 0.4, -0.6 + Math.sin(time * 9 + i) * 0.4, 0.6);
      else if (tuck) tmpA.set(s * 0.05, -0.3, 1.1);                // under armarna
      else if (air || p.grind) tmpA.set(s * 0.3, -1.0, 0.45);      // ut åt sidorna
      else tmpA.set(s * 0.08 + (Math.sign(carve) === s ? 0.1 : 0), -1.1, 0.35); // bakåt mot snön
      pole.position.copy(tmpB);
      pole.quaternion.setFromUnitVectors(DOWN, tmpA.normalize());
    }
  });
}
