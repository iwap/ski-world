'use strict';
// Hjälpfunktioner och grundkonstanter som allt annat använder.

/* global THREE */

// Ski World – samma spelregler som v1 men i 3D med tredjepersonskamera.
// Enheter: 1 = 1 meter. Åkaren rör sig nedför backen i -z; "d" är sträcka nedför.

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString(locale());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

const GRAVITY = 20;                  // lite tyngre än verkligheten för snabbare hopp
const ROW = 3;                       // hinder genereras i rader om 3 m
const NET_X = 50;                    // avspärrningsnäten står vid x = ±50 m
const BAND = 2 * (NET_X - 3);        // bredd på området där hinder genereras
const BIGAIR_NET = 14;               // Big Air-banan är en smal korridor
const VIEW_AHEAD = 240;
const LIFT_TIME = 15;                // sekunder upp med liften
const LIFT_X = -(NET_X + 14);        // liften går utanför skogen på vänster sida
