/*
 * SIM OR SEND — tunable parameters.
 * Everything marketing may want to adjust per event or per day lives here.
 * Numbers match the concept doc (June 2026) and are verified by
 * scripts/montecarlo.js against the figures on page 2.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CONFIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    gameName: 'SIM OR SEND',
    tagline: 'The $1M Challenge — powered by Enso Quote Simulator',

    startingUsd: 1000000,
    rounds: 3,
    roundSeconds: 15,        // decision window per round
    briefSeconds: 5,
    idleResetSeconds: 45,    // result/name screens fall back to attract loop

    // SEND IT dice roll, per round. Must sum to 100.
    odds: {
      clean: 10,
      overquote: 32,
      decay: 25,
      malicious: 18,
      policy: 15,
    },

    // Effect on funds when an event hits (percent of current portfolio).
    severity: {
      overquote: [3, 8],     // receive 3–8% less than quoted
      decay: [2, 5],         // stale route, 2–5% less
      maliciousDrainPct: 50, // open decision in doc: 50 keeps players in the game, 100 is more dramatic
      policyFreezePct: 15,   // funds frozen at a sanctioned venue
    },

    speedBonusPct: 2,        // clean SEND IT fill — "first in the block"

    // SIMULATE: route optimisation roll (independent of the failure dice).
    routeOpt: {
      chancePct: 30,
      range: [0.5, 1.5],     // percent improvement when a better path is found
    },
    simulateScanMs: 2000,    // scan animation length

    // Visual quote-decay pressure per round (display only — outcomes come from the dice).
    // Seconds until the on-screen quote "expires" and refreshes slightly worse.
    quoteDecay: [
      { expirySeconds: 0, refreshPenaltyPct: 0 },     // round 1: no decay timer
      { expirySeconds: 10, refreshPenaltyPct: 0.15 }, // round 2: visible decay
      { expirySeconds: 6, refreshPenaltyPct: 0.35 },  // round 3: faster decay, prices moving
    ],

    timeoutAction: 'send',   // round timer expires -> trade auto-executes blind

    // Display-only market data for the quote screens.
    ethDisplayPrice: 4200,
    gasUsdByRound: [14.2, 38.5, 22.4],

    // Leaderboard & prizes
    leaderboardSize: 10,
    swagThresholdUsd: 1000000, // finish >= $1M -> "I simulate before I sign" swag
    leadCapture: 'optional',   // 'off' | 'optional' | 'required' (email/Telegram for prize contact)

    docsUrl: 'https://docs.enso.build', // QR target on the result screen
    sound: true,
  };
});
