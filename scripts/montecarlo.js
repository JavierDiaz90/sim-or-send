#!/usr/bin/env node
/*
 * 200,000-run Monte Carlo over the actual game engine, reproducing the
 * table on page 2 of the concept doc. Run after any config change:
 *
 *   node scripts/montecarlo.js
 *
 * Expected (doc figures, current config):
 *   Simulate every round  avg ~$1,009,000   median ~$1,008,500   never < $1M   max ~$1,045,700
 *   Send every round      avg ~$813,000     median ~$903,900     ~87.5% hit    ~21.6% finish > $1M
 *   Send + perfect luck   $1,061,200        probability 12.5%
 */
const Engine = require('../js/engine.js');
const CONFIG = require('../js/config.js');

const RUNS = 200000;

function playAll(strategy) {
  const finals = [];
  let hitCount = 0;
  let aboveStart = 0;
  for (let i = 0; i < RUNS; i++) {
    let value = CONFIG.startingUsd;
    let hit = false;
    for (let r = 0; r < CONFIG.rounds; r++) {
      const roll = Engine.rollRound(Math.random, CONFIG);
      if (strategy === 'send') {
        const res = Engine.resolveSend(value, roll, CONFIG);
        if (res.event !== 'clean') hit = true;
        value = res.value;
      } else {
        value = Engine.resolveSimulate(value, roll, CONFIG).value;
      }
    }
    finals.push(value);
    if (hit) hitCount++;
    if (value > CONFIG.startingUsd) aboveStart++;
  }
  finals.sort((a, b) => a - b);
  const avg = finals.reduce((s, v) => s + v, 0) / RUNS;
  return {
    avg,
    median: finals[Math.floor(RUNS / 2)],
    min: finals[0],
    max: finals[RUNS - 1],
    hitPct: (hitCount / RUNS) * 100,
    abovePct: (aboveStart / RUNS) * 100,
  };
}

const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => v.toFixed(1) + '%';

const oddsSum = Object.values(CONFIG.odds).reduce((a, b) => a + b, 0);
if (oddsSum !== 100) {
  console.error(`WARNING: event odds sum to ${oddsSum}, expected 100`);
}

console.log(`SIM OR SEND — Monte Carlo (${RUNS.toLocaleString()} runs per strategy)\n`);

const sim = playAll('simulate');
console.log('Simulate every round');
console.log(`  avg ${usd(sim.avg)}   median ${usd(sim.median)}   min ${usd(sim.min)}   max ${usd(sim.max)}`);

const send = playAll('send');
console.log('Send every round');
console.log(`  avg ${usd(send.avg)}   median ${usd(send.median)}   hit by >=1 event ${pct(send.hitPct)}   finish > $1M ${pct(send.abovePct)}`);

const perfect = CONFIG.startingUsd * Math.pow(1 + CONFIG.speedBonusPct / 100, CONFIG.rounds);
const perfectOdds = Math.pow(CONFIG.odds.clean / 100, CONFIG.rounds) * 100;
console.log('Send + perfect luck');
console.log(`  ${usd(perfect)} with probability ${pct(perfectOdds)}`);
