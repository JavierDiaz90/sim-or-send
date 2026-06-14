# SIM OR SEND — The $1M Challenge

Conference stand game for the Enso booth, built from Hector's June 2026 concept doc.
Players get $1,000,000 USDT to move into ETH across three rapid trades. Before each
trade: **SEND IT** (blind, +2% speed bonus on a clean fill, 50% chance a failure event
hits) or **SIMULATE** (Enso Quote Simulator catches the failure first — what you see
is what you get).

No build step, no dependencies, fully offline. Vanilla HTML/CSS/JS.

## Run it

```bash
cd game
python3 -m http.server 8741
```

- **Game (touchscreen / iPad):** http://localhost:8741/
- **Leaderboard (second screen):** http://localhost:8741/leaderboard.html

Both pages share state through `localStorage`, so they must run in the **same browser
profile on the same machine** (two windows / two displays). On the iPad, add the game
to the Home Screen for fullscreen, or use Safari with Guided Access for kiosk lockdown.

The board resets itself at midnight local time (date-scoped storage keys).

## Tuning per event / per day

Everything marketing may want to touch is in [js/config.js](js/config.js):

- Event odds (clean / overquote / decay / malicious / policy) — currently **50/18/14/10/8**
- Speed bonus (+2%) and route-optimisation bonus (0.5–1.5%, 30% chance)
- Severity ranges, number of rounds, per-round timer (15s)
- Quote-decay pressure per round (visual urgency device; outcomes come from the dice)
- Malicious drain: **50%** (the doc's open decision — 100% is more dramatic, 50% keeps
  players in the game; flip `severity.maliciousDrainPct`)
- Lead capture: `'optional'` (or `'off'` / `'required'`) — email/Telegram for the daily prize
- `docsUrl` — the QR code target on the result screen

After changing odds/severities, re-verify the maths:

```bash
node scripts/montecarlo.js
```

200k runs per strategy. With the shipped config it reproduces the doc's table:
simulate-every-round avg ≈ $1,009k (never loses), send-every-round avg ≈ $813k
(87.5% hit by ≥1 event, ~21.6% finish above $1M), perfect-luck send $1,061,208 at 12.5%.

## Booth-staff demo hook

To show a prospect a specific failure mode, open the browser console and rig the next
round before the player chooses:

```js
SIMORSEND.forceNext('malicious')   // also: overquote | decay | policy | clean | opt
```

`'opt'` forces a clean round where the simulator finds a better route (the simulate
"variance" moment).

## Structure

| File | What it is |
| --- | --- |
| [index.html](index.html) + [js/main.js](js/main.js) | The kiosk game: attract → name → brief → 3 rounds → result |
| [leaderboard.html](leaderboard.html) + [js/board.js](js/board.js) | Second screen: live top-10, attract taglines, stand stats |
| [js/config.js](js/config.js) | Every tunable parameter |
| [js/engine.js](js/engine.js) | Pure game maths (dice, payouts, ranking) — shared with the verifier |
| [js/store.js](js/store.js) | Daily-reset leaderboard + stats in localStorage |
| [js/qr.js](js/qr.js) | Dependency-free QR encoder for the docs link |
| [js/bg.js](js/bg.js) | Ambient routing-graph background |
| [scripts/montecarlo.js](scripts/montecarlo.js) | Reproduces the concept doc's expected-value table |
| [scripts/verify_qr.py](scripts/verify_qr.py) | Diffs js/qr.js against the python `qrcode` reference lib |

## Game design notes

- The same hidden dice are rolled whether the player sends or simulates — the simulator
  reveals the fate a sender would have suffered. That's the "you just dodged a $500,000
  drain" money moment.
- Round timer expiry auto-executes as SEND IT (you hesitated; the market didn't).
- Score = final USD value; remaining decision-clock is the tiebreaker (simulating spends
  no clock, but earns no speed bonus — the honest trade-off from the doc).
- The four failure events map one-to-one to Quote Simulator capabilities, so staff can
  pivot from any loss screen straight into the product conversation.
- Finish ≥ $1M → "I simulate before I sign" swag callout on the result screen.

## Open decisions (doc) → what's shipped

- **Name:** SIM OR SEND (the doc's recommendation)
- **Malicious drain:** 50% (config flag to change)
- **Lead capture:** optional field at name entry, stored with the board entry
- Prize tiering: result screen highlights the daily #1; tiering still up to the booth team
