# LocoSense — Smart Locomotive Monitoring System

A real-time web dashboard for monitoring locomotive engine health, built with Python (Flask), SQLite, and Chart.js.

---

## Features

- **Live Dashboard** — Real-time KPIs: temperature, fuel level, vibration, oil pressure, speed, RPM
- **Analytics** — Historical trend charts with selectable time ranges (1h, 6h, 12h, 24h)
- **Alert System** — Auto-generated alerts for threshold violations, with acknowledge workflow
- **Threshold Configuration** — Configurable safety limits for all engine parameters
- **System Diagnostics** — Visual health status panel for all subsystems

---

## Project Structure

```
locomotive/
├── app.py                  # Flask backend + SQLite logic
├── requirements.txt
├── instance/
│   └── locomotive.db       # SQLite database (auto-created)
├── templates/
│   └── index.html          # Main dashboard template
└── static/
    ├── css/style.css        # Industrial dark theme
    └── js/main.js           # Chart.js + live polling logic
```

---

## Setup & Run

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the app
python app.py

# 3. Open in browser
http://localhost:5000
```

No additional setup needed — the SQLite database is created automatically with 24 hours of seeded historical data on first run.

---


## Tech Stack

- **Backend**: Python 3, Flask 3
- **Database**: SQLite (via Python's built-in `sqlite3`)
- **Frontend**: Vanilla JS + Chart.js 4
- **Fonts**: Share Tech Mono, Barlow Condensed, Inter
