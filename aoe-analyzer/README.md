# AgeLens — local AoE2: DE replay coach

An MVP that parses an uploaded `.aoe2record` file, presents a strategic timeline,
and lets you chat about the match.

## Run locally

```bash
cd /Users/javierdiaz/Desktop/game/aoe-analyzer
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open [http://127.0.0.1:8742](http://127.0.0.1:8742).

The app works without an API key using a small deterministic local coach. For full
AI chat:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-5.4-mini" # optional
.venv/bin/python app.py
```

The replay is uploaded only to the local Flask server. It is parsed from a temporary
file and deleted immediately afterward. Parsed match context is kept in memory until
the server restarts.

## What the MVP extracts

- Match metadata, map, players, civilizations, teams, winner, duration, and eAPM
- Age-up events exposed by the replay
- Building, research, unit queue, market, tribute, delete, and resign commands
- A filtered event timeline and a few high-confidence milestones
- Evidence-grounded AI answers using the parsed match context

## Important limitation

AoE2 replay files contain an initial game snapshot followed by player commands. They
do not contain complete state snapshots for every moment. Without running the actual
game simulation, this MVP cannot truthfully calculate exact resources, live unit
counts, kills, scouting vision, or idle TC/production time.
