'use strict';

// Allt ljud i Ski World genereras med Web Audio API – inga ljudfiler behövs.
// Webbläsare tillåter bara ljud efter att användaren tryckt på något, därför startas
// allt först via Sound.init() vid första tangenttryck eller klick.

const Sound = (() => {
  let ctx = null;
  let master;
  let musicBus;
  let sfxBus;
  let noiseBuf;
  let loops = null;
  let musicOn = true;
  let sfxOn = true;
  let nextNoteTime = 0;
  let step = 0;

  const MUSIC_VOL = 0.3;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    master = gainNode(0.9, comp);
    musicBus = gainNode(musicOn ? MUSIC_VOL : 0, master);
    sfxBus = gainNode(sfxOn ? 1 : 0, master);
    noiseBuf = makeNoise();
    loops = {
      wind: loopNoise('lowpass', 500, 0.7),
      carve: loopNoise('bandpass', 2600, 0.9),
      grind: loopNoise('bandpass', 3200, 6),
    };
    nextNoteTime = ctx.currentTime + 0.1;
    setInterval(schedule, 25);
  }

  function gainNode(value, dest) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    return g;
  }

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise(type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start();
    return { f, g };
  }

  const now = () => ctx.currentTime;
  const glide = (param, value, time = 0.08) => param.setTargetAtTime(value, now(), time);

  function envelope(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(freq, dur, { type = 'sine', vol = 0.3, to = null, delay = 0, bus = sfxBus, attack = 0.005, filter = null, filterType = 'lowpass', q = 1, vibrato = 0 } = {}) {
    if (!ctx) return;
    const t = now() + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vibrato) {
      // Vibrato: en långsam oscillator som vickar tonhöjden lite
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * vibrato, t + Math.min(0.25, dur * 0.5));
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    envelope(g, t, vol, attack, dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = filter;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, { type = 'bandpass', freq = 1000, to = null, q = 1, vol = 0.3, delay = 0, bus = sfxBus, attack = 0.005 } = {}) {
    if (!ctx) return;
    const t = now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    envelope(g, t, vol, attack, dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * Math.max(0, 1.9 - dur));
    src.stop(t + dur + 0.05);
  }

  // ---------- Bakgrundsmusik: tre låtar med olika karaktär ----------

  // Varje låt har egen tonart, eget tempo, egna instrument och en egen melodi.
  // chords = ett ackord per takt (MIDI-toner), melody = [steg, ton, längd i sextondelar] över 4 takter.
  const SONGS = [
    { // Lugn lo-fi i D-dur: elpiano, dämpade trummor, vinylknaster
      bpm: 80, swing: 0.12, style: 'lofi',
      chords: [[50, 54, 57, 61], [47, 50, 54, 57], [43, 47, 50, 54], [45, 49, 52, 55]],
      melody: [[2, 74, 2], [4, 76, 2], [6, 78, 4], [14, 81, 2], [18, 78, 6], [26, 76, 2], [28, 74, 4],
        [34, 71, 4], [40, 74, 2], [42, 76, 6], [50, 78, 2], [52, 76, 2], [54, 74, 8]],
    },
    { // Energisk i e-moll: bastrumma på varje slag, pumpande syntackord, pulserande bas, catchy slinga
      bpm: 140, swing: 0, style: 'drive',
      chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
      melody: [[0, 76, 2], [2, 79, 2], [4, 83, 3], [8, 81, 2], [10, 79, 2], [12, 76, 4],
        [16, 74, 2], [18, 76, 2], [20, 79, 3], [24, 78, 2], [26, 76, 2], [28, 74, 4],
        [32, 76, 2], [34, 79, 2], [36, 83, 3], [40, 81, 2], [42, 79, 2], [44, 76, 4],
        [48, 76, 2], [50, 79, 2], [52, 83, 2], [54, 86, 2], [56, 88, 6], [62, 86, 2]],
    },
    { // Kvällsjazz i swing: gåbas, ride-cymbal, visp, pianokomp och saxofonlik melodi
      bpm: 100, swing: 0.17, style: 'jazz',
      chords: [[50, 53, 57, 60], [43, 47, 53, 57], [48, 52, 55, 59], [45, 49, 52, 55]],
      walk: [[38, 41, 45, 42], [31, 35, 38, 47], [36, 40, 43, 44], [33, 37, 40, 37]],
      melody: [[0, 69, 3], [3, 72, 1], [4, 74, 4], [10, 72, 2], [12, 69, 4], [20, 67, 2], [22, 69, 2],
        [24, 71, 4], [28, 72, 4], [34, 74, 2], [36, 76, 3], [40, 74, 2], [42, 72, 2], [44, 71, 4],
        [52, 67, 2], [54, 69, 2], [56, 72, 8]],
    },
  ];
  let song = SONGS[0];

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const stepLen = () => 60 / song.bpm / 4; // sextondelar

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextNoteTime < now()) nextNoteTime = now() + 0.05; // efter paus i fliken
    while (nextNoteTime < now() + 0.12) {
      if (musicOn) playStep(step, nextNoteTime - now());
      nextNoteTime += stepLen();
      step = (step + 1) % 128;
    }
  }

  // Instrument
  const bus = () => musicBus;
  function epiano(n, dur, vol, d) {
    // Mjukt elpiano: grundton + svag oktav, snabb attack och lång avklingning
    tone(midi(n), dur, { type: 'sine', vol, delay: d, bus: bus(), attack: 0.01 });
    tone(midi(n + 12), dur * 0.6, { type: 'triangle', vol: vol * 0.25, delay: d, bus: bus(), attack: 0.01 });
  }
  const kick = (d, vol = 0.45, low = 45) => tone(150, 0.28, { to: low, vol, delay: d, bus: bus() });
  const hat = (d, vol, len = 0.04) => noise(len, { type: 'highpass', freq: 7500, vol, delay: d, bus: bus() });
  function clap(d) {
    for (let k = 0; k < 3; k++) noise(0.05, { freq: 1500, q: 1.2, vol: 0.13, delay: d + k * 0.012, bus: bus() });
  }
  function playMelody(pos16, d, opts) {
    for (const [st, n, len] of song.melody) if (st === pos16) tone(midi(n), stepLen() * len * 0.95, { delay: d, bus: bus(), ...opts });
  }

  function playStep(s, d) {
    const pos64 = s % 64;
    const bar = Math.floor(pos64 / 16);
    const pos = s % 16;
    const chord = song.chords[bar];
    const STEP = stepLen();
    const second = s >= 64;
    // Swing: andra åttondelen i varje slag kommer lite senare
    if (song.swing && pos % 4 === 2) d += STEP * song.swing * 2;

    if (song.style === 'lofi') {
      // Elpianoackord, synkoperade
      if (pos === 0 || pos === 10) for (const n of chord) epiano(n, STEP * (pos === 0 ? 9 : 6), 0.045, d);
      if (pos === 0 || pos === 7 || pos === 10) tone(midi(chord[0] - 12), STEP * 3, { type: 'sine', vol: 0.3, delay: d, bus: bus(), filter: 400 });
      if (pos === 0 || pos === 10) kick(d, 0.32, 50);
      if (pos === 4 || pos === 12) noise(0.12, { freq: 1200, q: 0.8, vol: 0.07, delay: d, bus: bus() });
      if (pos % 2 === 0) hat(d, pos % 4 === 0 ? 0.025 : 0.04);
      if (Math.random() < 0.25) noise(0.01, { type: 'highpass', freq: 3000, vol: 0.015, delay: d + Math.random() * STEP, bus: bus() }); // knaster
      if (second) playMelody(pos64, d, { type: 'triangle', vol: 0.05, filter: 1800, attack: 0.03 });
    } else if (song.style === 'drive') {
      // Pumpande syntackord på varje slag
      if (pos % 4 === 0) for (const n of chord) tone(midi(n), STEP * 3.2, { type: 'sawtooth', vol: 0.022, delay: d, bus: bus(), filter: 1600, attack: 0.04 });
      // Pulserande sextondelsbas i oktaver
      tone(midi(chord[0] - (pos % 2 ? 12 : 24)), STEP * 0.8, { type: 'sawtooth', vol: 0.09, delay: d, bus: bus(), filter: 700 });
      if (pos % 4 === 0) kick(d, 0.5, 40);
      if (pos === 4 || pos === 12) clap(d);
      if (pos % 4 === 2) hat(d, 0.06, 0.12); // öppen hi-hat på offbeat
      else hat(d, 0.025);
      if (bar === 3 && pos >= 12) noise(0.06, { freq: 2000, q: 0.7, vol: 0.06 + (pos - 12) * 0.02, delay: d, bus: bus() }); // virvelfill
      playMelody(pos64, d, { type: 'square', vol: second ? 0.035 : 0.025, filter: 3500 });
    } else {
      // Jazz: gåbas på varje slag
      if (pos % 4 === 0) tone(midi(song.walk[bar][pos / 4]), STEP * 3.6, { type: 'triangle', vol: 0.32, delay: d, bus: bus(), filter: 700 });
      // Pianokomp på offbeats ("Charleston")
      if (pos === 6 || (pos === 14 && bar % 2)) for (const n of chord) epiano(n + 12, 0.35, 0.035, d);
      // Ride-cymbal: ding, ding-da, ding, ding-da
      if (pos % 4 === 0 || pos === 6 || pos === 14) noise(0.35, { type: 'highpass', freq: 6000, vol: pos % 4 === 0 ? 0.045 : 0.03, delay: d, bus: bus() });
      if (pos === 4 || pos === 12) {
        noise(0.25, { freq: 3000, q: 0.6, vol: 0.035, delay: d, bus: bus(), attack: 0.04 }); // visp
        hat(d, 0.03);
      }
      if (pos === 0 && bar === 0) kick(d, 0.25, 55);
      // Saxofonlik melodi med vibrato (andra varvet lite starkare)
      playMelody(pos64, d, { type: 'sawtooth', vol: second ? 0.05 : 0.04, filter: 1300, filterType: 'bandpass', q: 1.5, vibrato: 0.012, attack: 0.05 });
    }
  }

  // ---------- Kontinuerliga ljud (vind, snö, grind) ----------

  function update({ active, speed, carve, braking, air, grind }) {
    if (!ctx) return;
    const v = active ? Math.min(1, speed / 28) : 0;
    glide(loops.wind.g.gain, active ? 0.03 + v * 0.14 : 0, 0.2);
    glide(loops.wind.f.frequency, 300 + v * 1200, 0.2);
    const onSnow = active && !air && !grind;
    const scrape = onSnow ? Math.min(1, carve * 1.2 + braking * 1.6) * Math.min(1, speed / 8) + 0.07 * v : 0;
    glide(loops.carve.g.gain, scrape * 0.35, 0.06);
    glide(loops.carve.f.frequency, braking > 0.3 ? 1300 : 2600, 0.1);
    glide(loops.grind.g.gain, active && grind ? (grind === 'rail' ? 0.2 : 0.3) : 0, 0.05);
    glide(loops.grind.f.frequency, grind === 'rail' ? 3400 : 650, 0.05);
    glide(loops.grind.f.Q, grind === 'rail' ? 9 : 2, 0.05);
  }

  // ---------- Engångsljud ----------

  const sfx = {
    jump(power = 0.5) {
      noise(0.35, { freq: 600, to: 2400, q: 1.2, vol: 0.2 + 0.2 * power });
      tone(180, 0.12, { vol: 0.18, to: 90 });
    },
    land(impact = 0.5) {
      noise(0.25, { type: 'lowpass', freq: 900, to: 200, vol: 0.2 + 0.35 * impact });
      tone(110, 0.18, { vol: 0.1 + 0.3 * impact, to: 50 });
    },
    crash(strength = 1) {
      noise(0.6, { type: 'lowpass', freq: 1800, to: 150, vol: 0.7 * strength });
      tone(80, 0.35, { vol: 0.5 * strength, to: 35 });
      noise(0.9, { type: 'highpass', freq: 3000, vol: 0.12 * strength, delay: 0.05 });
    },
    thud(strength = 0.5) {
      tone(90, 0.15, { vol: 0.25 * strength, to: 45 });
      noise(0.18, { type: 'lowpass', freq: 700, vol: 0.25 * strength });
    },
    star() {
      tone(1046.5, 0.18, { type: 'triangle', vol: 0.16 });
      tone(1568, 0.3, { type: 'triangle', vol: 0.16, delay: 0.08 });
    },
    highfive() {
      noise(0.08, { type: 'highpass', freq: 1500, vol: 0.5 });
      noise(0.06, { freq: 1100, q: 2, vol: 0.3, delay: 0.01 });
      tone(880, 0.15, { type: 'triangle', vol: 0.14, delay: 0.06 });
      tone(1318.5, 0.25, { type: 'triangle', vol: 0.14, delay: 0.13 });
    },
    combo(parts = 1) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.slice(0, Math.min(notes.length, 2 + parts)).forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.06 }));
    },
    rockTap() {
      tone(220, 0.08, { type: 'square', vol: 0.1, filter: 800, to: 140 });
      noise(0.1, { freq: 500, q: 3, vol: 0.3 });
    },
    bounce() {
      noise(0.2, { type: 'lowpass', freq: 500, vol: 0.4 });
      tone(140, 0.2, { vol: 0.2, to: 70 });
      noise(0.25, { freq: 2500, q: 4, vol: 0.08, delay: 0.03 });
    },
    pivot() {
      noise(0.3, { freq: 1800, to: 900, q: 0.8, vol: 0.35 });
    },
    grindStart(type) {
      if (type === 'rail') {
        tone(1200, 0.25, { type: 'triangle', vol: 0.12, to: 900 });
        noise(0.1, { type: 'highpass', freq: 2500, vol: 0.3 });
      } else {
        tone(160, 0.15, { type: 'triangle', vol: 0.25, to: 110 });
        noise(0.12, { freq: 600, q: 2, vol: 0.3 });
      }
    },
    tick() {
      tone(1400, 0.04, { vol: 0.05 });
    },
    click() {
      tone(900, 0.06, { type: 'triangle', vol: 0.1 });
    },
    buy() {
      tone(1318.5, 0.08, { type: 'square', vol: 0.07, filter: 3000 });
      tone(1975.5, 0.3, { type: 'square', vol: 0.07, filter: 3000, delay: 0.07 });
      noise(0.15, { type: 'highpass', freq: 5000, vol: 0.08, delay: 0.07 });
    },
    // Avslöjande i boxen: längre och ljusare fanfar ju sällsyntare (0–5)
    reveal(level = 1) {
      const notes = [523.3, 659.3, 784, 1046.5, 1318.5, 1568];
      const n = Math.min(notes.length, 2 + level);
      for (let i = 0; i < n; i++) tone(notes[i], 0.25 + (i === n - 1 ? 0.4 : 0), { type: 'triangle', vol: 0.12, delay: i * 0.09 });
      if (level >= 4) noise(0.8, { type: 'highpass', freq: 6000, vol: 0.12, delay: n * 0.09 });
    },
    denied() {
      tone(196, 0.15, { type: 'square', vol: 0.07, filter: 900 });
      tone(164.8, 0.2, { type: 'square', vol: 0.07, filter: 900, delay: 0.12 });
    },
  };

  // Ljudeffekterna spelas bara om de är påslagna
  const wrapped = {};
  for (const [name, fn] of Object.entries(sfx)) {
    wrapped[name] = (...args) => {
      if (ctx && sfxOn) fn(...args);
    };
  }

  return {
    init,
    update,
    ...wrapped,
    setMusic(on) {
      musicOn = on;
      if (ctx) glide(musicBus.gain, on ? MUSIC_VOL : 0, 0.1);
    },
    setSong(i) {
      song = SONGS[i] || SONGS[0];
    },
    songCount: 3,
    setSfx(on) {
      sfxOn = on;
      if (ctx) glide(sfxBus.gain, on ? 1 : 0, 0.05);
    },
  };
})();
