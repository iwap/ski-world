'use strict';
// Banorna, svårighetsgraderna, priser och vald bana.

// ---------- Banor & svårighetsgrader ----------

// slope = genomsnittligt höjdfall per meter. waves = långa vågor i lutningen [amplitud, frekvens, fas]
// som ger branta partier och flackare platåer. weights = hur vanliga olika hinder är.
const COURSES = {
  classic: {
    slope: 0.32, waves: [[0.12, 0.012, 0], [0.06, 0.031, 1]], bumps: 1, moguls: 0, density: 1,
    weights: { tree: 44, pine: 10, rock: 13, stump: 6, snowman: 4, ramp: 9, star: 8, rail: 4, log: 5, box: 0, spine: 2, rollers: 2 },
  },
  park: {
    slope: 0.27, waves: [[0.05, 0.015, 0]], bumps: 0.35, moguls: 0, density: 0.7,
    weights: { tree: 3, pine: 0, rock: 2, stump: 0, snowman: 3, ramp: 32, star: 14, rail: 20, log: 8, box: 16, spine: 8, rollers: 6 },
  },
  moguls: {
    slope: 0.36, waves: [[0.06, 0.012, 0]], bumps: 0.4, moguls: 0.5, density: 0.45,
    weights: { tree: 40, pine: 8, rock: 0, stump: 4, snowman: 6, ramp: 14, star: 30, rail: 0, log: 0, box: 0, rollers: 2 },
  },
  pipe: {
    slope: 0.28, waves: [], bumps: 0, moguls: 0, density: 0.12, pipe: true,
    weights: { tree: 0, pine: 0, rock: 0, stump: 0, snowman: 0, ramp: 0, star: 1, rail: 0, log: 0, box: 0 },
  },
  slalom: {
    // Smal korridor med nät på båda sidor, breda portar och glest med träd
    slope: 0.28, waves: [[0.06, 0.012, 0]], bumps: 0.3, moguls: 0, density: 0.15, slalom: true, netX: 13,
    weights: { tree: 8, pine: 3, rock: 0, stump: 0, snowman: 2, ramp: 0, star: 12, rail: 0, log: 0, box: 0 },
  },
  // Big Air: nästan bara stora hopp (rampSizes = vikter för liten/mellan/stor/Big Air)
  // Big Air: ett jättehopp i taget över hela bredden, med riktig landning – inget annat i vägen
  bigair: {
    slope: 0.3, waves: [], bumps: 0, moguls: 0, density: 0.6, mega: true, netX: BIGAIR_NET, rampSizes: [0, 0, 0, 0, 1, 1, 1],
    weights: { tree: 30, pine: 12, rock: 0, stump: 16, snowman: 0, ramp: 0, star: 4, rail: 0, log: 0, box: 0 },
  },
  // Off-pist: åk genom skogen. Inga byggda hopp eller räcken – bara omkullfallna träd att grinda på
  // och naturliga snöpuckar (bump) att hoppa från
  offpiste: {
    // Halva längden men tre gånger så många träd (övriga hinder lika många som förut)
    slope: 0.34, waves: [[0.1, 0.014, 0.5], [0.05, 0.037, 2]], bumps: 1.6, moguls: 0, density: 4.4, offpiste: true, lengthMult: 0.5,
    weights: { tree: 138, pine: 54, rock: 20, stump: 14, snowman: 0, ramp: 0, star: 6, rail: 0, log: 16, box: 0, bump: 40 },
  },
};
// Banorna låses upp med pengar (classic är gratis). Dyrare bana = mer pengar per åk och trick.
const COURSE_PRICE = { classic: 0, park: 3000, moguls: 6000, pipe: 9000, slalom: 12000, bigair: 15000, offpiste: 18000 };
// Poäng ×2 på alla banor utom halfpipe (×1,5) och Big Air
const COURSE_POINTS = { classic: 2, park: 2, moguls: 2, pipe: 1.5, slalom: 2, bigair: 1, offpiste: 2 };
// Klarar man hela banan dubblas poängen för åket
const FINISH_MULT = 2;
const COURSE_REWARD = { classic: 1, park: 1.25, moguls: 1.5, pipe: 1.75, slalom: 2, bigair: 2.25, offpiste: 2.5 };
const DIFFICULTIES = {
  // finishBonus = extra pengar för att ta sig hela vägen i mål
  easy:   { length: 1000, density: 0.6,  speed: 0.9,  balance: 0.6, points: 0.75, finishBonus: 0 },
  normal: { length: 1500, density: 1,    speed: 1,    balance: 1,   points: 1,    finishBonus: 750 },
  hard:   { length: 2000, density: 1.45, speed: 1.12, balance: 1.4, points: 1.5,  finishBonus: 2000 },
};
let course = COURSES.classic;
const netX = () => course.netX || NET_X; // avspärrningsnätens läge för den valda banan
let difficulty = DIFFICULTIES.normal;
// Backens längd beror på svårighetsgraden – vid målet väntar sittliften
const runLength = () => difficulty.length * (course.lengthMult || 1);
