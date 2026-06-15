# SIM OR SEND — The $1M Challenge

Conference stand game for the Enso booth, built from Hector's June 2026 concept doc.
Players get $1,000,000 USDT to move into ETH across three rapid trades. Before each
trade: **SEND IT** (blind, +2% speed bonus on a clean fill, 90% chance a failure event
hits) or **SIMULATE** (Enso Quote Simulator catches the failure first — what you see
is what you get).

No build step or third-party runtime dependencies. The vanilla frontend is served by a
small Node backend that persists the daily leaderboard to a local JSON database.

## Run it

```bash
cd game
npm start
```

- **Game (touchscreen / iPad):** http://localhost:8741/
- **Leaderboard (second screen):** http://localhost:8741/leaderboard.html

Both pages use the same local backend, so the game and leaderboard can run in separate
browser windows or devices that can reach the kiosk computer. On the iPad, add the game
to the Home Screen for fullscreen, or use Safari with Guided Access for kiosk lockdown.

The board resets itself at midnight local time. Data is stored in
`data/leaderboard.json`; the `data/` directory is ignored by Git.

## Hosted Netlify + Supabase mode

The same frontend can run on Netlify with Supabase as the persistent database.
Netlify Functions keep the Supabase service role key out of browser JavaScript.

1. Create a Supabase project.
2. Open Supabase SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. In Netlify, link this GitHub repository and set:
   - Build command: leave empty
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (also declared in `netlify.toml`)
4. Add these Netlify environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_TABLE=leaderboard_entries`
   - `LEADERBOARD_TIME_ZONE=Europe/Paris`
5. Deploy from the `main` branch.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code. It belongs only in
Netlify environment variables.

## Tuning per event / per day

Everything marketing may want to touch is in [js/config.js](js/config.js):

- Event odds (clean / overquote / decay / malicious / policy) — currently **10/32/25/18/15**
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

200k runs per strategy. With the shipped config, simulate-every-round averages
about $1,009k and never loses. Send-every-round averages about $644k, 99.9% of
runs hit at least one failure, about 0.7% finish above $1M, and perfect-luck
send finishes at $1,061,208 with 0.1% probability.

`SIMULATE` has a hard engine-level floor: its resolved portfolio can equal the
pre-trade value or increase, but can never decrease.

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
| [server.js](server.js) | Static server + daily JSON leaderboard API |
| [js/store.js](js/store.js) | Browser client for the leaderboard API |
| [netlify/functions](netlify/functions) | Hosted API routes for Supabase-backed deploys |
| [supabase/schema.sql](supabase/schema.sql) | Supabase table schema for hosted leaderboards |
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
