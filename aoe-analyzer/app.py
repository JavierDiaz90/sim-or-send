import json
import os
import tempfile
import uuid
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from mgz.model import parse_match
from openai import OpenAI
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
ALLOWED_EXTENSIONS = {".aoe2record", ".mgz", ".mgx", ".mgl"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MATCHES: dict[str, dict] = {}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES


def seconds(value: timedelta | None) -> int:
    return max(0, int(value.total_seconds())) if value else 0


def clock(total_seconds: int) -> str:
    total_seconds = max(0, int(total_seconds))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def clean_value(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [clean_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): clean_value(item) for key, item in value.items()}
    if hasattr(value, "name"):
        return value.name.replace("_", " ").title()
    return str(value)


def player_ref(player):
    if not player:
        return None
    return {
        "number": player.number,
        "name": player.name,
    }


def event_from_input(item):
    if not item.player:
        return None
    event_type = str(item.type)
    interesting = {
        "Build",
        "Research",
        "Queue",
        "De Queue",
        "Resign",
        "Buy",
        "Sell",
        "Tribute",
        "Delete",
        "Attack Move",
    }
    if event_type not in interesting:
        return None
    timestamp = seconds(item.timestamp)
    label = event_type
    if item.param:
        label = f"{event_type}: {item.param}"
    if event_type == "Research" and str(item.param).endswith("Age"):
        label = f"Advance clicked: {item.param}"
    return {
        "time": timestamp,
        "clock": clock(timestamp),
        "type": event_type,
        "label": label,
        "player": player_ref(item.player),
        "position": (
            {"x": round(item.position.x, 1), "y": round(item.position.y, 1)}
            if item.position
            else None
        ),
    }


def first_event(events, player_number, event_type, contains=None):
    for event in events:
        if event["player"]["number"] != player_number or event["type"] != event_type:
            continue
        if contains and contains.lower() not in event["label"].lower():
            continue
        return event
    return None


def build_player_summary(player, events, uptimes):
    own_events = [event for event in events if event["player"]["number"] == player.number]
    builds = Counter(
        event["label"].split(": ", 1)[-1]
        for event in own_events
        if event["type"] == "Build"
    )
    queues = Counter(
        event["label"].split(": ", 1)[-1]
        for event in own_events
        if event["type"] in {"Queue", "De Queue"}
    )
    researches = [
        event
        for event in own_events
        if event["type"] == "Research"
    ]
    initial_objects = Counter(obj.name or f"Object {obj.object_id}" for obj in player.objects)
    age_times = {
        uptime["age"]: uptime["clock"]
        for uptime in uptimes
        if uptime["player"]["number"] == player.number
    }
    return {
        "number": player.number,
        "name": player.name,
        "civilization": player.civilization,
        "color": player.color,
        "color_id": player.color_id,
        "team": list(player.team_id) if not isinstance(player.team_id, int) and player.team_id else player.team_id,
        "winner": player.winner,
        "eapm": player.eapm,
        "rating": player.rate_snapshot,
        "profile_id": player.profile_id,
        "start_position": (
            {"x": round(player.position.x, 1), "y": round(player.position.y, 1)}
            if player.position and player.position.x is not None
            else None
        ),
        "age_times": age_times,
        "initial_objects": dict(initial_objects.most_common(10)),
        "buildings": dict(builds.most_common()),
        "units_queued": dict(queues.most_common()),
        "technologies": [
            {"name": event["label"].split(": ", 1)[-1], "time": event["clock"]}
            for event in researches
        ],
        "event_count": len(own_events),
    }


def make_insights(players, events, uptimes, duration):
    insights = []
    for player in players:
        first_military = next(
            (
                event
                for event in events
                if event["player"]["number"] == player["number"]
                and event["type"] in {"Queue", "De Queue"}
                and "Villager" not in event["label"]
            ),
            None,
        )
        if first_military:
            insights.append(
                {
                    "time": first_military["time"],
                    "clock": first_military["clock"],
                    "tone": "neutral",
                    "title": f"{player['name']} begins military production",
                    "detail": first_military["label"].split(": ", 1)[-1],
                }
            )
        for uptime in (item for item in uptimes if item["player"]["number"] == player["number"]):
            insights.append(
                {
                    "time": uptime["time"],
                    "clock": uptime["clock"],
                    "tone": "good",
                    "title": f"{player['name']} reaches {uptime['age']}",
                    "detail": (
                        "Check whether production and upgrades were ready for the timing."
                        if uptime["age"] != "Feudal Age"
                        else "A key opening benchmark."
                    ),
                }
            )

    resigns = [event for event in events if event["type"] == "Resign"]
    for event in resigns:
        insights.append(
            {
                "time": event["time"],
                "clock": event["clock"],
                "tone": "danger",
                "title": f"{event['player']['name']} resigns",
                "detail": "The recorded game ends around this decision.",
            }
        )
    if not insights:
        insights.append(
            {
                "time": duration,
                "clock": clock(duration),
                "tone": "neutral",
                "title": "Replay parsed successfully",
                "detail": "No high-confidence milestone events were exposed by this replay version.",
            }
        )
    return sorted(insights, key=lambda item: item["time"])[:20]


def analyze_replay(path: Path, original_name: str):
    with path.open("rb") as handle:
        match = parse_match(handle)

    events = [event_from_input(item) for item in match.inputs]
    events = sorted((event for event in events if event), key=lambda item: item["time"])
    uptimes = [
        {
            "time": seconds(item.timestamp),
            "clock": clock(seconds(item.timestamp)),
            "age": clean_value(item.age),
            "player": player_ref(item.player),
        }
        for item in match.uptimes
        if item.player
    ]
    duration = seconds(match.duration)
    players = [build_player_summary(player, events, uptimes) for player in match.players]
    perspective = match.file.perspective.number if match.file.perspective else players[0]["number"]

    return {
        "id": uuid.uuid4().hex,
        "filename": original_name,
        "meta": {
            "map": match.map.name,
            "map_size": match.map.size,
            "duration": duration,
            "duration_label": clock(duration),
            "game_type": match.type,
            "rated": match.rated,
            "speed": match.speed,
            "population_limit": match.population,
            "completed": match.completed,
            "timestamp": str(match.timestamp) if match.timestamp else None,
            "version": str(match.version.name),
            "game_version": match.game_version,
            "build_version": match.build_version,
            "dataset": match.dataset,
            "perspective_player": perspective,
        },
        "players": players,
        "uptimes": uptimes,
        "timeline": events[:3000],
        "insights": make_insights(players, events, uptimes, duration),
        "limits": [
            "The replay contains commands, not a complete frame-by-frame game state.",
            "Exact resource stockpiles, unit counts, kills, and idle time are not available in this MVP.",
            "Queued units show player intent; cancellations and completed production may differ.",
        ],
    }


def compact_context(match):
    return {
        "file": match["filename"],
        "meta": match["meta"],
        "players": match["players"],
        "age_events": match["uptimes"],
        "key_moments": match["insights"],
        "timeline": match["timeline"][:900],
        "data_limits": match["limits"],
    }


def local_coach(match, question):
    question_lower = question.lower()
    perspective_number = match["meta"]["perspective_player"]
    player = next(
        (item for item in match["players"] if item["number"] == perspective_number),
        match["players"][0],
    )
    opponent = next((item for item in match["players"] if item["number"] != player["number"]), None)

    if any(word in question_lower for word in ("summary", "summarize", "what happened", "overview")):
        result = "won" if player["winner"] else "lost" if any(p["winner"] for p in match["players"]) else "finished"
        age_copy = ", ".join(f"{age}: {time}" for age, time in player["age_times"].items()) or "no age-up messages found"
        return (
            f"{player['name']} ({player['civilization']}) {result} on {match['meta']['map']} "
            f"after {match['meta']['duration_label']}. Recorded age timings: {age_copy}. "
            f"The replay exposes {player['event_count']} strategic events and an eAPM of "
            f"{player['eapm'] if player['eapm'] is not None else 'unknown'}. "
            "Add an OPENAI_API_KEY for a deeper evidence-grounded coaching answer."
        )
    if "age" in question_lower or "castle" in question_lower or "feudal" in question_lower:
        lines = []
        for candidate in match["players"]:
            timings = ", ".join(f"{age} {time}" for age, time in candidate["age_times"].items())
            lines.append(f"{candidate['name']}: {timings or 'no age timings detected'}")
        return "Age-up timings from the replay:\n\n" + "\n".join(lines)
    if "military" in question_lower or "unit" in question_lower or "army" in question_lower:
        units = ", ".join(f"{name} ×{count}" for name, count in player["units_queued"].items()) or "none detected"
        return (
            f"For {player['name']}, recorded military/unit queue commands were: {units}. "
            "These are queue commands, not confirmed surviving army counts."
        )
    if "apm" in question_lower or "active" in question_lower:
        comparison = f"; {opponent['name']} had {opponent['eapm']} eAPM" if opponent else ""
        return f"{player['name']} recorded {player['eapm']} effective actions per minute{comparison}."
    return (
        "The replay is parsed, but richer natural-language coaching needs an OpenAI API key. "
        "You can still ask me for the match summary, age timings, military queues, or eAPM. "
        "I will not guess exact resources, kills, unit counts, or idle TC time from this file."
    )


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "ai_enabled": bool(os.getenv("OPENAI_API_KEY")),
            "model": os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        }
    )


@app.post("/api/upload")
def upload():
    uploaded = request.files.get("replay")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose an AoE2 recorded game first."}), 400

    original_name = secure_filename(uploaded.filename)
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "Expected an .aoe2record, .mgz, .mgx, or .mgl file."}), 400

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            temp_path = Path(handle.name)
            uploaded.save(handle)
        match = analyze_replay(temp_path, original_name)
        MATCHES[match["id"]] = match
        return jsonify(match)
    except Exception as exc:
        app.logger.exception("Replay parsing failed")
        return jsonify(
            {
                "error": "This replay could not be parsed.",
                "detail": str(exc),
                "hint": "AoE2 updates occasionally change the replay format. Try a replay from the current game build.",
            }
        ), 422
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


@app.get("/api/matches/<match_id>")
def get_match(match_id):
    match = MATCHES.get(match_id)
    if not match:
        return jsonify({"error": "That in-memory match is no longer available. Upload the replay again."}), 404
    return jsonify(match)


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    match = MATCHES.get(payload.get("match_id"))
    question = str(payload.get("message", "")).strip()
    history = payload.get("history", [])[-8:]
    if not match:
        return jsonify({"error": "Upload a replay before chatting."}), 400
    if not question:
        return jsonify({"error": "Ask a question about the match."}), 400

    if not os.getenv("OPENAI_API_KEY"):
        return jsonify({"answer": local_coach(match, question), "mode": "local"})

    try:
        client = OpenAI()
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
            reasoning={"effort": "low"},
            text={"verbosity": "low"},
            input=[
                {
                    "role": "developer",
                    "content": (
                        "You are an evidence-grounded Age of Empires II: Definitive Edition coach. "
                        "Answer only from the supplied replay analysis. Separate facts from strategic "
                        "interpretation. Cite exact players and timestamps when available. Never invent "
                        "resources, kills, unit counts, idle time, scouting vision, or completed units. "
                        "Queued units represent commands, not confirmed production. If the data cannot "
                        "answer the question, say so directly and suggest what can be inspected instead. "
                        "Be concise, candid, and useful."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "REPLAY DATA:\n"
                        + json.dumps(compact_context(match), ensure_ascii=False)
                        + "\n\nRECENT CONVERSATION:\n"
                        + json.dumps(history, ensure_ascii=False)
                        + "\n\nQUESTION:\n"
                        + question
                    ),
                },
            ],
        )
        return jsonify({"answer": response.output_text, "mode": "ai"})
    except Exception as exc:
        app.logger.exception("AI request failed")
        return jsonify({"error": "The AI coach request failed.", "detail": str(exc)}), 502


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "Replay is larger than the 100 MB MVP limit."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8742")), debug=True)
