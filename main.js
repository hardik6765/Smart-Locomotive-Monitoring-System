// LocoSense — Frontend Logic

const MAX_LIVE_POINTS = 40;
let liveLabels = [], liveTemp = [], liveSpeed = [], liveVib = [];
let liveChart, gaugeChart, vibChart;
let tempHistChart, fuelHistChart, vibHistChart, speedRpmChart;
let thresholds = {};
let refreshInterval;

// ── CLOCK ────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent =
    now.toTimeString().slice(0, 8);
}
setInterval(updateClock, 1000);
updateClock();

// ── TABS ─────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-" + tab).classList.add("active");
    if (tab === "analytics") { loadHistory(); loadStats(); }
    if (tab === "alerts") loadAlerts();
    if (tab === "settings") loadThresholds();
  });
});

// ── CHART DEFAULTS ────────────────────────────────────────
Chart.defaults.color = "#8b949e";
Chart.defaults.borderColor = "#21262d";
Chart.defaults.font.family = "'Share Tech Mono', monospace";

function makeGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  return g;
}

// ── LIVE CHARTS ───────────────────────────────────────────
function initCharts() {
  // Line chart: temp + speed
  const liveCtx = document.getElementById("liveChart").getContext("2d");
  liveChart = new Chart(liveCtx, {
    type: "line",
    data: {
      labels: liveLabels,
      datasets: [
        {
          label: "Temperature °C",
          data: liveTemp,
          borderColor: "#f85149",
          backgroundColor: "rgba(248,81,73,0.06)",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          fill: true,
          yAxisID: "yTemp"
        },
        {
          label: "Speed km/h",
          data: liveSpeed,
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,0.06)",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          fill: true,
          yAxisID: "ySpeed"
        }
      ]
    },
    options: {
      animation: { duration: 300 },
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#21262d" }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        yTemp: { position: "left", grid: { color: "#21262d" }, ticks: { font: { size: 10 } } },
        ySpeed: { position: "right", grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });

  // Doughnut: engine load
  const gaugeCtx = document.getElementById("gaugeChart").getContext("2d");
  gaugeChart = new Chart(gaugeCtx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [70, 30],
        backgroundColor: ["#E8440A", "#21262d"],
        borderWidth: 0,
        circumference: 270,
        rotation: -135
      }]
    },
    options: {
      responsive: true,
      cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [{
      id: "centerText",
      beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        const val = chart.data.datasets[0].data[0];
        ctx.font = "700 28px 'Share Tech Mono'";
        ctx.fillStyle = "#e6edf3";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val + "%", width / 2, height / 2 + 10);
        ctx.font = "11px 'Share Tech Mono'";
        ctx.fillStyle = "#8b949e";
        ctx.fillText("LOAD", width / 2, height / 2 + 30);
        ctx.restore();
      }
    }]
  });

  // Bar: vibration
  const vibCtx = document.getElementById("vibChart").getContext("2d");
  vibChart = new Chart(vibCtx, {
    type: "bar",
    data: {
      labels: Array.from({ length: 20 }, (_, i) => ""),
      datasets: [{
        data: Array(20).fill(0),
        backgroundColor: "#E8440A99",
        borderColor: "#E8440A",
        borderWidth: 1,
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: (ctx) => ctx.parsed.y.toFixed(2) + " mm/s" }
      }},
      scales: {
        x: { display: false },
        y: { grid: { color: "#21262d" }, min: 0, max: 10, ticks: { font: { size: 10 } } }
      }
    }
  });
}

// ── FETCH CURRENT DATA ────────────────────────────────────
async function fetchCurrent() {
  try {
    const res = await fetch("/api/current");
    const d = await res.json();
    updateKPIs(d);
    updateLiveChart(d);
    updateVibChart(d.vibration);
    updateGaugeChart(d.load_percent);
    updateSystemStatus(d.status);
    updateDiagnostics(d);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

function updateKPIs(d) {
  const t = thresholds;

  // Temperature
  setKPI("temp", d.temperature, 0, t.temp_max || 120,
    d.temperature > (t.temp_max || 110) ? "critical" :
    d.temperature < (t.temp_min || 40) ? "warning" : "ok");

  // Fuel
  setKPI("fuel", d.fuel_level, 0, 100,
    d.fuel_level < (t.fuel_min || 20) ? "warning" : "ok");

  // Vibration
  setKPI("vib", d.vibration, 0, 10,
    d.vibration > (t.vibration_max || 7.5) ? "critical" :
    d.vibration > 5 ? "warning" : "ok");

  // Oil
  setKPI("oil", d.oil_pressure, 0, 80,
    d.oil_pressure < (t.oil_pressure_min || 30) ? "critical" : "ok");

  // Speed
  setKPI("speed", d.speed, 0, 140,
    d.speed > (t.speed_max || 120) ? "warning" : "ok");

  // RPM
  setKPI("rpm", d.rpm, 0, 2500, "ok");
}

function setKPI(id, value, min, max, state) {
  const el = document.getElementById("kpi-" + id);
  const val = document.getElementById("val-" + id);
  const bar = document.getElementById("bar-" + id);

  el.className = "kpi " + state;
  val.textContent = typeof value === "number" && value % 1 !== 0
    ? value.toFixed(id === "vib" ? 2 : 1) : Math.round(value);

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  bar.style.width = pct + "%";
  bar.style.background = state === "critical" ? "#f85149" : state === "warning" ? "#d29922" : "#E8440A";
}

function updateLiveChart(d) {
  const t = new Date().toLocaleTimeString("en-US", { hour12: false });
  liveLabels.push(t);
  liveTemp.push(d.temperature);
  liveSpeed.push(d.speed);

  if (liveLabels.length > MAX_LIVE_POINTS) {
    liveLabels.shift(); liveTemp.shift(); liveSpeed.shift();
  }

  liveChart.update("none");
}

function updateVibChart(val) {
  const data = vibChart.data.datasets[0].data;
  data.push(parseFloat(val));
  if (data.length > 20) data.shift();
  vibChart.data.datasets[0].backgroundColor = data.map(v =>
    v > (thresholds.vibration_max || 7.5) ? "#f85149cc" :
    v > 5 ? "#d29922cc" : "#E8440A99"
  );
  vibChart.update("none");
}

function updateGaugeChart(load) {
  gaugeChart.data.datasets[0].data = [load, 100 - load];
  gaugeChart.data.datasets[0].backgroundColor[0] =
    load > 85 ? "#f85149" : load > 70 ? "#d29922" : "#E8440A";
  gaugeChart.update();
}

function updateSystemStatus(status) {
  const badge = document.getElementById("systemStatus");
  badge.className = "status-badge " + (status === "normal" ? "" : status);
  badge.querySelector(".status-text").textContent =
    status === "critical" ? "ALERT" : status === "warning" ? "WARNING" : "ONLINE";
}

function updateDiagnostics(d) {
  const t = thresholds;
  setDiag("diag-engine",
    d.temperature > (t.temp_max || 110) || d.vibration > (t.vibration_max || 7.5) ? "crit" : "ok",
    d.temperature > (t.temp_max || 110) ? "OVERHEAT" : "Nominal"
  );
  setDiag("diag-fuel",
    d.fuel_level < (t.fuel_min || 20) ? "warn" : "ok",
    d.fuel_level < (t.fuel_min || 20) ? "LOW FUEL" : "Nominal"
  );
  setDiag("diag-cooling",
    d.oil_pressure < (t.oil_pressure_min || 30) ? "crit" : "ok",
    d.oil_pressure < (t.oil_pressure_min || 30) ? "LOW OIL" : "Nominal"
  );
  setDiag("diag-brake", "ok", "Nominal");
  setDiag("diag-electrical", "ok", "Nominal");
  setDiag("diag-sensors", "ok", "Active");
}

function setDiag(id, state, label) {
  const el = document.getElementById(id);
  el.className = "diag-item " + (state === "crit" ? "crit" : state === "warn" ? "warn" : "");
  el.querySelector(".diag-state").textContent = label;
}

// ── HISTORY CHARTS ────────────────────────────────────────
async function loadHistory() {
  const hours = document.getElementById("historyRange").value;
  const res = await fetch("/api/history?hours=" + hours);
  const data = await res.json();
  if (!data.length) return;

  const labels = data.map(d => {
    const dt = new Date(d.timestamp);
    return dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  });

  buildHistChart("tempHistChart", labels, data.map(d => d.temperature),
    "tempHistChart", "Temperature °C", "#f85149", "rgba(248,81,73,0.08)");
  buildHistChart("fuelHistChart", labels, data.map(d => d.fuel_level),
    "fuelHistChart", "Fuel Level %", "#58a6ff", "rgba(88,166,255,0.08)");
  buildHistChart("vibHistChart", labels, data.map(d => d.vibration),
    "vibHistChart", "Vibration mm/s", "#E8440A", "rgba(232,68,10,0.08)");
  buildScatterChart("speedRpmChart", data);
}

function buildHistChart(canvasId, labels, values, chartVar, label, color, bg) {
  const canvas = document.getElementById(canvasId);
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label, data: values, borderColor: color, backgroundColor: bg,
        borderWidth: 2, tension: 0.3, pointRadius: 0, fill: true }]
    },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#21262d" }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: "#21262d" }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function buildScatterChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const points = data.map(d => ({ x: d.speed, y: d.rpm }));

  new Chart(canvas.getContext("2d"), {
    type: "scatter",
    data: {
      datasets: [{ label: "Speed vs RPM", data: points,
        backgroundColor: "#E8440A66", borderColor: "#E8440A",
        pointRadius: 3, pointHoverRadius: 5 }]
    },
    options: {
      responsive: true, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Speed (km/h)", font: { size: 10 } },
          grid: { color: "#21262d" }, ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: "RPM", font: { size: 10 } },
          grid: { color: "#21262d" }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

async function loadStats() {
  const res = await fetch("/api/stats");
  const s = await res.json();
  document.getElementById("stat-avgtemp").textContent = s.avg_temp ? s.avg_temp.toFixed(1) : "—";
  document.getElementById("stat-maxtemp").textContent = s.max_temp ? s.max_temp.toFixed(1) : "—";
  document.getElementById("stat-avgspeed").textContent = s.avg_speed ? s.avg_speed.toFixed(1) : "—";
  document.getElementById("stat-minfuel").textContent = s.min_fuel ? s.min_fuel.toFixed(1) : "—";
  document.getElementById("stat-alerts").textContent = s.alerts_24h ?? "—";
  document.getElementById("stat-readings").textContent = s.readings ?? "—";
}

// ── ALERTS ────────────────────────────────────────────────
async function loadAlerts() {
  const res = await fetch("/api/alerts");
  const alerts = await res.json();
  const list = document.getElementById("alertsList");
  const badge = document.getElementById("alertBadge");

  const unacked = alerts.filter(a => !a.acknowledged);
  if (unacked.length > 0) {
    badge.textContent = unacked.length;
    badge.style.display = "inline";
  } else {
    badge.style.display = "none";
  }

  if (!alerts.length) {
    list.innerHTML = '<div class="empty-state">No alerts recorded yet.</div>';
    return;
  }

  list.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.severity} ${a.acknowledged ? 'acked' : ''}" id="alert-${a.id}">
      <span class="alert-sev">${a.severity.toUpperCase()}</span>
      <span class="alert-msg">${a.message}</span>
      <span class="alert-time">${a.timestamp}</span>
      ${!a.acknowledged ? `<button class="btn-ack" onclick="ackAlert(${a.id})">ACK</button>` : '<span style="font-size:11px;color:#8b949e">ACK\'d</span>'}
    </div>
  `).join("");
}

async function ackAlert(id) {
  await fetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
  loadAlerts();
}

async function acknowledgeAll() {
  const res = await fetch("/api/alerts");
  const alerts = await res.json();
  await Promise.all(alerts.filter(a => !a.acknowledged).map(a =>
    fetch(`/api/alerts/${a.id}/acknowledge`, { method: "POST" })
  ));
  loadAlerts();
}

// ── THRESHOLDS ────────────────────────────────────────────
async function loadThresholds() {
  const res = await fetch("/api/thresholds");
  thresholds = await res.json();
  for (const [key, val] of Object.entries(thresholds)) {
    const el = document.getElementById("th-" + key);
    if (el) el.value = val;
  }
}

async function saveThresholds(e) {
  e.preventDefault();
  const data = {};
  ["temp_max","temp_min","fuel_min","vibration_max","oil_pressure_min","speed_max"].forEach(key => {
    const el = document.getElementById("th-" + key);
    if (el) data[key] = parseFloat(el.value);
  });
  await fetch("/api/thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  thresholds = data;
  const toast = document.getElementById("saveToast");
  toast.style.display = "block";
  setTimeout(() => toast.style.display = "none", 3000);
}

function resetThresholds() {
  const defaults = {
    temp_max: 110, temp_min: 40, fuel_min: 20,
    vibration_max: 7.5, oil_pressure_min: 30, speed_max: 120
  };
  for (const [key, val] of Object.entries(defaults)) {
    const el = document.getElementById("th-" + key);
    if (el) el.value = val;
  }
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  await loadThresholds();
  initCharts();
  await fetchCurrent();
  refreshInterval = setInterval(fetchCurrent, 3000);

  // Update alert badge periodically
  setInterval(async () => {
    const res = await fetch("/api/alerts");
    const alerts = await res.json();
    const badge = document.getElementById("alertBadge");
    const unacked = alerts.filter(a => !a.acknowledged).length;
    badge.textContent = unacked;
    badge.style.display = unacked > 0 ? "inline" : "none";
  }, 5000);
}

init();

// ── TRAIN SEARCH DATA (Varanasi BSB) ─────────────────────
const VARANASI_TRAINS = [
  {
    num: "22435", name: "Vande Bharat Express",
    type: "Vande Bharat", badge: "badge-vb",
    from: "Varanasi Jn (BSB)", to: "New Delhi (NDLS)",
    dep: "15:00", arr: "23:00", duration: "8h 00m",
    dist: "759 km", speed: "95 km/h",
    stops: ["Prayagraj Jn", "Kanpur Central"],
    classes: ["CC", "EC"],
    days: "Sun Mon Tue Wed Fri Sat",
    loco: "EMU / Self-Propelled"
  },
  {
    num: "20503", name: "Varanasi Rajdhani Express",
    type: "Rajdhani", badge: "badge-raj",
    from: "Varanasi Jn (BSB)", to: "New Delhi (NDLS)",
    dep: "19:25", arr: "07:00", duration: "11h 35m",
    dist: "779 km", speed: "67 km/h",
    stops: ["Prayagraj", "Kanpur"],
    classes: ["1A", "2A", "3A"],
    days: "Daily",
    loco: "WAP-7 / WDG-4"
  },
  {
    num: "12393", name: "Sampoorna Kranti SF Express",
    type: "Superfast", badge: "badge-sf",
    from: "Rajendra Nagar (RJPB)", to: "New Delhi (NDLS)",
    dep: "22:05", arr: "10:40", duration: "12h 35m",
    dist: "1015 km", speed: "81 km/h",
    stops: ["Mughalsarai", "Prayagraj", "Kanpur"],
    classes: ["1A", "2A", "3A", "SL"],
    days: "Daily",
    loco: "WAP-4 / WDG-4"
  },
  {
    num: "12391", name: "Shramjeevi Express",
    type: "Superfast", badge: "badge-sf",
    from: "Rajgir (RGD)", to: "New Delhi (NDLS)",
    dep: "06:00", arr: "21:15", duration: "15h 15m",
    dist: "1114 km", speed: "73 km/h",
    stops: ["Buxar", "DDU", "Prayagraj", "Kanpur"],
    classes: ["2A", "3A", "SL", "GN"],
    days: "Daily",
    loco: "WAP-7"
  },
  {
    num: "15636", name: "Guwahati Okha Dwarka Express",
    type: "Express", badge: "badge-exp",
    from: "Guwahati (GHY)", to: "Okha (OKHA)",
    dep: "05:10", arr: "05:35+3", duration: "72h 25m",
    dist: "3786 km", speed: "52 km/h",
    stops: ["DDU", "Prayagraj", "Kanpur", "Mathura"],
    classes: ["3A", "SL", "GN"],
    days: "Mon",
    loco: "WAP-4"
  },
  {
    num: "20401", name: "Varanasi Lucknow SF Shuttle",
    type: "Superfast", badge: "badge-sf",
    from: "Varanasi Jn (BSB)", to: "Lucknow (LKO)",
    dep: "06:00", arr: "10:30", duration: "4h 30m",
    dist: "286 km", speed: "64 km/h",
    stops: ["Shivpur", "Jalalganj", "Jaunpur", "Sultanpur"],
    classes: ["CC", "2S", "GN"],
    days: "Daily",
    loco: "WAP-5 / WAP-7"
  },
  {
    num: "12302", name: "Howrah Rajdhani Express",
    type: "Rajdhani", badge: "badge-raj",
    from: "Howrah (HWH)", to: "New Delhi (NDLS)",
    dep: "23:55", arr: "09:55", duration: "10h 00m",
    dist: "1451 km", speed: "67 km/h",
    stops: ["DDU", "Prayagraj", "Kanpur"],
    classes: ["1A", "2A", "3A"],
    days: "Daily",
    loco: "WAP-7"
  },
  {
    num: "22436", name: "Vande Bharat Express",
    type: "Vande Bharat", badge: "badge-vb",
    from: "New Delhi (NDLS)", to: "Varanasi Jn (BSB)",
    dep: "06:00", arr: "14:00", duration: "8h 00m",
    dist: "759 km", speed: "95 km/h",
    stops: ["Kanpur Central", "Prayagraj Jn"],
    classes: ["CC", "EC"],
    days: "Mon Tue Wed Fri Sat Sun",
    loco: "EMU / Self-Propelled"
  },
  {
    num: "12801", name: "Purushottam Express",
    type: "Superfast", badge: "badge-sf",
    from: "Puri (PURI)", to: "New Delhi (NDLS)",
    dep: "09:15", arr: "10:10+1", duration: "24h 55m",
    dist: "1765 km", speed: "71 km/h",
    stops: ["Bhubaneswar", "DDU", "Prayagraj"],
    classes: ["1A", "2A", "3A", "SL"],
    days: "Daily",
    loco: "WAP-4 / WAP-7"
  },
  {
    num: "15137", name: "Budh Purnima Express",
    type: "Express", badge: "badge-exp",
    from: "Banaras (BNRS)", to: "Rajgir (RGD)",
    dep: "08:30", arr: "19:00", duration: "10h 30m",
    dist: "378 km", speed: "36 km/h",
    stops: ["DDU", "Dehri On Sone", "Sasaram", "Gaya"],
    classes: ["SL", "GN"],
    days: "Tue",
    loco: "WDG-4 / WDM-3A"
  },
  {
    num: "12670", name: "Ganga Kaveri Express",
    type: "Superfast", badge: "badge-sf",
    from: "Varanasi Jn (BSB)", to: "Chennai Central (MAS)",
    dep: "14:30", arr: "20:15+1", duration: "29h 45m",
    dist: "2200 km", speed: "74 km/h",
    stops: ["Prayagraj", "Jhansi", "Bhopal", "Nagpur", "Vijayawada"],
    classes: ["2A", "3A", "SL"],
    days: "Sat",
    loco: "WAP-7"
  },
  {
    num: "22415", name: "Vande Bharat Express",
    type: "Vande Bharat", badge: "badge-vb",
    from: "Varanasi Jn (BSB)", to: "New Delhi (NDLS)",
    dep: "14:15", arr: "22:00", duration: "7h 45m",
    dist: "759 km", speed: "98 km/h",
    stops: ["Prayagraj", "Kanpur"],
    classes: ["CC", "EC"],
    days: "Mon Wed Thu Sat",
    loco: "EMU / Self-Propelled"
  },
];

// ── TRAIN RENDERING ───────────────────────────────────────
function renderTrains(trains) {
  const list = document.getElementById("trainList");
  const noRes = document.getElementById("trainNoResults");
  const countEl = document.getElementById("trainResultCount");

  if (!trains.length) {
    list.innerHTML = "";
    noRes.style.display = "block";
    countEl.textContent = "No trains found";
    return;
  }

  noRes.style.display = "none";
  countEl.textContent = `Showing ${trains.length} train${trains.length > 1 ? "s" : ""} from / through Varanasi`;

  list.innerHTML = trains.map(t => `
    <div class="train-card">
      <div class="tc-top">
        <span class="tc-num">${t.num}</span>
        <span class="tc-badge ${t.badge}">${t.type.toUpperCase()}</span>
        <div class="tc-name-block">
          <div class="tc-name">${t.name}</div>
          <div class="tc-route">${t.from} → ${t.to}</div>
        </div>
        <div class="tc-times">
          <div class="tc-time-block">
            <div class="tc-time">${t.dep}</div>
            <div class="tc-stn">${t.from.split("(")[1]?.replace(")", "") || "BSB"}</div>
          </div>
          <div class="tc-arrow">
            <div class="tc-dur">${t.duration}</div>
            <div class="tc-line"></div>
            <div class="tc-dist">${t.dist}</div>
          </div>
          <div class="tc-time-block">
            <div class="tc-time">${t.arr}</div>
            <div class="tc-stn">${t.to.split("(")[1]?.replace(")", "") || "—"}</div>
          </div>
        </div>
      </div>
      <div class="tc-bottom">
        ${t.classes.map(c => `<span class="tc-class">${c}</span>`).join("")}
        <span class="tc-stops">· ${t.stops.length} stop${t.stops.length !== 1 ? "s" : ""}: ${t.stops.slice(0, 2).join(", ")}${t.stops.length > 2 ? "…" : ""}</span>
        <span class="tc-loco">🚂 ${t.loco}</span>
        <span class="tc-days">${t.days}</span>
        <span class="tc-speed">⚡ ${t.speed}</span>
      </div>
    </div>
  `).join("");
}

function filterTrains() {
  const dest = (document.getElementById("toStation")?.value || "").toLowerCase().trim();
  const type = (document.getElementById("trainType")?.value || "").toLowerCase();
  const sort = document.getElementById("sortTrains")?.value || "depart";

  let filtered = VARANASI_TRAINS.filter(t => {
    const matchDest = !dest ||
      t.to.toLowerCase().includes(dest) ||
      t.from.toLowerCase().includes(dest) ||
      t.stops.some(s => s.toLowerCase().includes(dest));
    const matchType = !type || t.type.toLowerCase() === type;
    return matchDest && matchType;
  });

  // Sort
  if (sort === "duration") {
    filtered.sort((a, b) => {
      const toMins = s => { const [h, m] = s.split("h "); return parseInt(h)*60 + parseInt(m); };
      return toMins(a.duration) - toMins(b.duration);
    });
  } else if (sort === "name") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    filtered.sort((a, b) => a.dep.localeCompare(b.dep));
  }

  renderTrains(filtered);
}

function swapStations() {
  const from = document.getElementById("fromStation");
  const to = document.getElementById("toStation");
  const tmp = from.value;
  from.value = to.value || "Varanasi Jn (BSB)";
  to.value = tmp === "Varanasi Jn (BSB)" ? "" : tmp;
  filterTrains();
}

// Initialize train tab on first switch
const origTabInit = document.querySelectorAll(".tab");
origTabInit.forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "trains") {
      setTimeout(() => filterTrains(), 50);
    }
  });
});
