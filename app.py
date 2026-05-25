"""
Daily English Journal — A simple Flask + SQLite app
that gives the user a daily English writing prompt,
then uses OpenAI to correct the writing and explain
mistakes in Arabic.
"""

import os
import json
import sqlite3
import hashlib
from datetime import datetime, date
from pathlib import Path

from flask import Flask, render_template, request, jsonify, g
from dotenv import load_dotenv
from openai import OpenAI

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "database.db"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

app = Flask(__name__)

# Lazy OpenAI client — only create if a key is provided.
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


# ---------------------------------------------------------------------------
# Daily writing prompts (chosen deterministically by date)
# ---------------------------------------------------------------------------
PROMPTS = [
    "Write 5 sentences about your day.",
    "Describe something good that happened today.",
    "Write about your family today.",
    "Describe your morning routine.",
    "Write about one thing you learned today.",
    "Describe the weather and how it made you feel.",
    "Write about a meal you enjoyed today.",
    "Describe a person you talked to today.",
    "Write about a small goal you want to finish this week.",
    "Describe your favorite place in your home.",
    "Write about a habit you want to build.",
    "Describe a sound you noticed today.",
    "Write about a moment that made you smile.",
    "Describe what you usually do in the evening.",
    "Write about a book, video, or article you saw recently.",
]


def get_today_prompt() -> str:
    """Pick today's prompt deterministically based on the date.
    Same day → same prompt; next day → next prompt in the cycle."""
    today = date.today()
    # Number of days since a fixed epoch keeps things stable and rotating.
    days = (today - date(2024, 1, 1)).days
    return PROMPTS[days % len(PROMPTS)]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the entries table on first run."""
    with sqlite3.connect(DATABASE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entries (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                date            TEXT    NOT NULL,
                prompt          TEXT    NOT NULL,
                original_text   TEXT    NOT NULL,
                corrected_text  TEXT,
                explanation_ar  TEXT,
                score           INTEGER,
                created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


# ---------------------------------------------------------------------------
# OpenAI correction
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are an English teacher for an Arabic-speaking student.
The student writes a short paragraph in English about their day.
Your job:
1. Produce a corrected, natural English version of the text.
2. List every meaningful mistake (grammar, spelling, word choice, punctuation).
3. For each mistake, explain in clear, simple Arabic WHY it is a mistake.
4. Give one short overall feedback paragraph in Arabic.
5. Score the writing from 1 to 10 (10 = native-like).

You MUST reply with ONLY valid JSON in exactly this shape, no extra text:
{
  "corrected_text": "string",
  "mistakes": [
    {"wrong": "string", "correct": "string", "explanation_ar": "string"}
  ],
  "general_explanation_ar": "string",
  "score": 8
}

Rules:
- The "explanation_ar" and "general_explanation_ar" fields MUST be in Arabic.
- "corrected_text" MUST be in English.
- If the text has no mistakes, return an empty "mistakes" array and a score of 10.
- Keep explanations short, kind, and focused on learning.
"""


def correct_with_openai(prompt: str, text: str) -> dict:
    """Call OpenAI and return the parsed correction dict.
    Raises RuntimeError on failure so the route can return a clean error."""
    if client is None:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. "
            "Copy .env.example to .env and add your key."
        )

    user_message = (
        f"Today's prompt: {prompt}\n\n"
        f"Student's writing:\n\"\"\"\n{text}\n\"\"\""
    )

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)

    # Light validation / defaults so the frontend never crashes.
    data.setdefault("corrected_text", text)
    data.setdefault("mistakes", [])
    data.setdefault("general_explanation_ar", "")
    data.setdefault("score", 0)
    return data


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template(
        "index.html",
        today_prompt=get_today_prompt(),
        today_date=date.today().isoformat(),
    )


@app.route("/api/correct", methods=["POST"])
def api_correct():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    prompt = (payload.get("prompt") or get_today_prompt()).strip()

    if not text:
        return jsonify({"error": "Empty text"}), 400
    if len(text) > 5000:
        return jsonify({"error": "Text is too long (max 5000 chars)"}), 400

    try:
        result = correct_with_openai(prompt, text)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned invalid JSON, please try again."}), 502
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"AI request failed: {e}"}), 502

    # Save to DB
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO entries
            (date, prompt, original_text, corrected_text,
             explanation_ar, score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            date.today().isoformat(),
            prompt,
            text,
            result.get("corrected_text", ""),
            json.dumps(
                {
                    "mistakes": result.get("mistakes", []),
                    "general_explanation_ar": result.get(
                        "general_explanation_ar", ""
                    ),
                },
                ensure_ascii=False,
            ),
            int(result.get("score") or 0),
            datetime.utcnow().isoformat(timespec="seconds"),
        ),
    )
    db.commit()

    return jsonify({"id": cursor.lastrowid, **result})


@app.route("/api/entries")
def api_entries():
    db = get_db()
    rows = db.execute(
        "SELECT id, date, prompt, original_text, corrected_text, "
        "explanation_ar, score, created_at FROM entries "
        "ORDER BY created_at DESC LIMIT 200"
    ).fetchall()

    items = []
    for r in rows:
        try:
            explanation = json.loads(r["explanation_ar"] or "{}")
        except json.JSONDecodeError:
            explanation = {"mistakes": [], "general_explanation_ar": ""}
        items.append(
            {
                "id": r["id"],
                "date": r["date"],
                "prompt": r["prompt"],
                "original_text": r["original_text"],
                "corrected_text": r["corrected_text"],
                "mistakes": explanation.get("mistakes", []),
                "general_explanation_ar": explanation.get(
                    "general_explanation_ar", ""
                ),
                "score": r["score"],
                "created_at": r["created_at"],
            }
        )
    return jsonify(items)


@app.route("/api/entries/<int:entry_id>", methods=["DELETE"])
def api_delete_entry(entry_id):
    db = get_db()
    db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    db.commit()
    return jsonify({"ok": True})


# Health check (handy when deploying later)
@app.route("/healthz")
def healthz():
    return {"status": "ok", "model": OPENAI_MODEL, "has_key": bool(OPENAI_API_KEY)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    # host=0.0.0.0 so an iPad on the same Wi-Fi can reach the laptop.
    # PORT env var is used by Render/Railway in production.
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)


# Initialize DB also when imported by gunicorn (production)
init_db()
