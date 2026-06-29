from flask import Flask, render_template, jsonify, request
import sqlite3
import random
import math
import time
from datetime import datetime, timedelta

app = Flask(__name__)
DB_PATH = "instance/locomotive.db"

# Default safety thresholds
DEFAULT_THRESHOLDS = {
    "temp_max": 110,
    "temp_min": 40,
    "fuel_min": 20,
    "vibration_max": 7.5,
    "oil_pressure_min": 30,
    "speed_max": 120
}

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            temperature REAL,
            fuel_level REAL,
            vibration REAL,
            oil_pressure REAL,
            speed REAL,
            rpm REAL,
            load_percent REAL,
            status TEXT DEFAULT 'normal'
        );

        CREATE TABLE IF NOT EXISTS thresholds (
            key TEXT PRIMARY KEY,
            value REAL
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            type TEXT,
            message TEXT,
            severity TEXT,
            acknowledged INTEGER DEFAULT 0
        );
    """)

    # Seed thresholds if empty
    for key, val in DEFAULT_THRESHOLDS.items():
        conn.execute("INSERT OR IGNORE INTO thresholds (key, value) VALUES (?, ?)", (key, val))

    # Seed historical data (last 24 hours)
    cursor = conn.execute("SELECT COUNT(*) FROM sensor_data")
    if cursor.fetchone()[0] == 0:
        now = datetime.now()
        for i in range(288):  # 5-min intervals
            ts = (now - timedelta(minutes=5 * (288 - i))).strftime("%Y-%m-%d %H:%M:%S")
            progress = i / 288
            temp = 75 + 25 * math.sin(progress * math.pi * 4) + random.uniform(-3, 3)
            fuel = max(15, 95 - (i * 0.27) + random.uniform(-1, 1))
            vib = 3.5 + 2 * abs(math.sin(progress * math.pi * 6)) + random.uniform(-0.3, 0.3)
            oil = 45 + 10 * math.cos(progress * math.pi * 3) + random.uniform(-2, 2)
            speed = max(0, 80 + 30 * math.sin(progress * math.pi * 2) + random.uniform(-5, 5))
            rpm = speed * 22 + random.uniform(-50, 50)
            load = 60 + 20 * math.sin(progress * math.pi * 2) + random.uniform(-5, 5)
            conn.execute("""
                INSERT INTO sensor_data (timestamp, temperature, fuel_level, vibration, oil_pressure, speed, rpm, load_percent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (ts, round(temp, 1), round(fuel, 1), round(vib, 2), round(oil, 1), round(speed, 1), round(rpm), round(load, 1)))

    conn.commit()
    conn.close()

def get_thresholds():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM thresholds").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

def check_alerts(data, thresholds):
    alerts = []
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if data["temperature"] > thresholds.get("temp_max", 110):
        alerts.append((ts, "temperature", f"Engine temperature critical: {data['temperature']}°C", "critical"))
    if data["fuel_level"] < thresholds.get("fuel_min", 20):
        alerts.append((ts, "fuel", f"Low fuel warning: {data['fuel_level']}%", "warning"))
    if data["vibration"] > thresholds.get("vibration_max", 7.5):
        alerts.append((ts, "vibration", f"High vibration detected: {data['vibration']} mm/s", "critical"))
    if data["oil_pressure"] < thresholds.get("oil_pressure_min", 30):
        alerts.append((ts, "oil_pressure", f"Low oil pressure: {data['oil_pressure']} PSI", "critical"))
    if data["speed"] > thresholds.get("speed_max", 120):
        alerts.append((ts, "speed", f"Speed limit exceeded: {data['speed']} km/h", "warning"))
    return alerts

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/current")
def current_data():
    conn = get_db()
    thresholds = get_thresholds()

    # Generate live reading
    last = conn.execute("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1").fetchone()
    base_temp = last["temperature"] if last else 80
    base_fuel = last["fuel_level"] if last else 75

    data = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "temperature": round(base_temp + random.uniform(-1.5, 1.5), 1),
        "fuel_level": round(max(5, base_fuel - random.uniform(0, 0.15)), 1),
        "vibration": round(random.uniform(2.5, 6.5), 2),
        "oil_pressure": round(random.uniform(38, 58), 1),
        "speed": round(random.uniform(60, 105), 1),
        "rpm": round(random.uniform(1400, 2200)),
        "load_percent": round(random.uniform(55, 85), 1),
    }

    # Determine status
    alerts = check_alerts(data, thresholds)
    data["status"] = "critical" if any(a[3] == "critical" for a in alerts) else ("warning" if alerts else "normal")

    # Save reading
    conn.execute("""
        INSERT INTO sensor_data (timestamp, temperature, fuel_level, vibration, oil_pressure, speed, rpm, load_percent, status)
        VALUES (:timestamp, :temperature, :fuel_level, :vibration, :oil_pressure, :speed, :rpm, :load_percent, :status)
    """, data)

    # Save alerts
    for alert in alerts:
        conn.execute("INSERT INTO alerts (timestamp, type, message, severity) VALUES (?, ?, ?, ?)", alert)

    conn.commit()
    conn.close()
    return jsonify(data)

@app.route("/api/history")
def history():
    hours = int(request.args.get("hours", 6))
    conn = get_db()
    since = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
    rows = conn.execute("""
        SELECT timestamp, temperature, fuel_level, vibration, oil_pressure, speed, rpm, load_percent
        FROM sensor_data WHERE timestamp >= ? ORDER BY timestamp ASC
    """, (since,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/thresholds", methods=["GET", "POST"])
def thresholds():
    conn = get_db()
    if request.method == "POST":
        data = request.json
        for key, val in data.items():
            conn.execute("INSERT OR REPLACE INTO thresholds (key, value) VALUES (?, ?)", (key, float(val)))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    rows = conn.execute("SELECT key, value FROM thresholds").fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})

@app.route("/api/alerts")
def alerts():
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def acknowledge_alert(alert_id):
    conn = get_db()
    conn.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/stats")
def stats():
    conn = get_db()
    row = conn.execute("""
        SELECT 
            AVG(temperature) as avg_temp, MAX(temperature) as max_temp,
            MIN(fuel_level) as min_fuel, AVG(speed) as avg_speed,
            AVG(vibration) as avg_vib, COUNT(*) as readings
        FROM sensor_data WHERE timestamp >= datetime('now', '-24 hours')
    """).fetchone()
    alerts_count = conn.execute("SELECT COUNT(*) FROM alerts WHERE timestamp >= datetime('now', '-24 hours')").fetchone()[0]
    conn.close()
    result = dict(row)
    result["alerts_24h"] = alerts_count
    return jsonify(result)

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
