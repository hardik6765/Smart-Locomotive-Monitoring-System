from flask import Flask, render_template, jsonify
import sqlite3
import random
from datetime import datetime

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            temperature REAL,
            fuel REAL,
            vibration REAL,
            timestamp TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def insert_data():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()

    temp = round(random.uniform(60, 120), 2)
    fuel = round(random.uniform(10, 100), 2)
    vibration = round(random.uniform(0, 10), 2)

    c.execute("INSERT INTO readings (temperature, fuel, vibration, timestamp) VALUES (?, ?, ?, ?)",
              (temp, fuel, vibration, datetime.now().strftime("%H:%M:%S")))

    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/data')
def data():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 10")
    rows = c.fetchall()
    conn.close()

    data = [{
        "temp": row[1],
        "fuel": row[2],
        "vibration": row[3],
        "time": row[4]
    } for row in rows]

    return jsonify(data[::-1])

@app.route('/simulate')
def simulate():
    insert_data()
    return "Data Added"

if __name__ == '__main__':
    app.run(debug=True)
