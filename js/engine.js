/*
 * SIM OR SEND — pure game logic. No DOM, no timers.
 * Used by the browser UI (js/main.js) and the Monte Carlo verifier
 * (scripts/montecarlo.js), so the maths on screen is exactly the maths
 * in the concept doc.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var EVENT_ORDER = ['clean', 'overquote', 'decay', 'malicious', 'policy'];

  function uniform(rng, range) {
    return range[0] + rng() * (range[1] - range[0]);
  }

  /*
   * Roll the hidden dice for one round. The same roll is used whether the
   * player sends or simulates — the simulator "catches" the fate the sender
   * would have suffered.
   */
  function rollRound(rng, cfg) {
    var total = 0;
    for (var i = 0; i < EVENT_ORDER.length; i++) total += cfg.odds[EVENT_ORDER[i]];
    var x = rng() * total;
    var event = EVENT_ORDER[EVENT_ORDER.length - 1];
    var acc = 0;
    for (var j = 0; j < EVENT_ORDER.length; j++) {
      acc += cfg.odds[EVENT_ORDER[j]];
      if (x < acc) { event = EVENT_ORDER[j]; break; }
    }

    var severityPct = 0;
    if (event === 'overquote') severityPct = uniform(rng, cfg.severity.overquote);
    else if (event === 'decay') severityPct = uniform(rng, cfg.severity.decay);
    else if (event === 'malicious') severityPct = cfg.severity.maliciousDrainPct;
    else if (event === 'policy') severityPct = cfg.severity.policyFreezePct;

    var routeOptPct = 0;
    if (rng() * 100 < cfg.routeOpt.chancePct) routeOptPct = uniform(rng, cfg.routeOpt.range);

    return { event: event, severityPct: severityPct, routeOptPct: routeOptPct };
  }

  /* Execute blind. Clean fill earns the speed bonus; anything else hits the funds. */
  function resolveSend(value, roll, cfg) {
    if (roll.event === 'clean') {
      return { value: value * (1 + cfg.speedBonusPct / 100), event: 'clean', pct: cfg.speedBonusPct, lostUsd: 0 };
    }
    var newValue = value * (1 - roll.severityPct / 100);
    return { value: newValue, event: roll.event, pct: -roll.severityPct, lostUsd: value - newValue };
  }

  /*
   * Run the trade through Quote Simulator first. A failure that would have
   * hit is caught (no loss — the player gets the fair quote); independently,
   * the simulator may find a better route. Never a speed bonus.
   */
  function resolveSimulate(value, roll, cfg) {
    var caught = roll.event === 'clean' ? null : roll.event;
    var dodgedUsd = caught ? value * (roll.severityPct / 100) : 0;
    return {
      value: value * (1 + roll.routeOptPct / 100),
      event: 'sim',
      caught: caught,
      dodgedUsd: dodgedUsd,
      pct: roll.routeOptPct,
    };
  }

  /* Higher score wins; remaining clock time breaks ties. */
  function compareEntries(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return (b.remainingMs || 0) - (a.remainingMs || 0);
  }

  return {
    EVENT_ORDER: EVENT_ORDER,
    rollRound: rollRound,
    resolveSend: resolveSend,
    resolveSimulate: resolveSimulate,
    compareEntries: compareEntries,
  };
});
