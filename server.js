const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// API KEY
const API_SECRET = process.env.API_SECRET || "my_private_server_key_2026";

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use(express.json());

// Middleware ตรวจ API KEY
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    if (req.path === '/api/wifi_locations' && req.method === 'GET') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey !== API_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

// Database
const db = new Database('./database.sqlite');

// Create Tables
db.exec(`
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    latitude REAL,
    longitude REAL,
    speed REAL,
    accuracy REAL,
    user_name TEXT,
    zone TEXT,
    ap_zone TEXT,
    ap_floor INTEGER,
    rssi INTEGER,
    wifi_speed INTEGER,
    device_model TEXT,
    device_serial TEXT,
    ip_address TEXT,
    source TEXT,
    is_online BOOLEAN,
    is_heartbeat BOOLEAN,
    last_updated TEXT,
    net_dl_kbps REAL,
    net_ul_kbps REAL,
    command TEXT DEFAULT '',
    command_timestamp TEXT
);

CREATE TABLE IF NOT EXISTS wifi_locations (
    bssid TEXT PRIMARY KEY,
    ap_name TEXT,
    latitude REAL,
    longitude REAL,
    zone TEXT,
    location_name TEXT,
    floor INTEGER,
    is_active BOOLEAN DEFAULT 1
);
`);

console.log("✅ Database ready");

// 1. UPDATE DEVICE
app.post('/api/devices', (req, res) => {
    try {
        const data = req.body;

        const stmt = db.prepare(`
        INSERT OR REPLACE INTO devices 
        (device_id, latitude, longitude, speed, accuracy, user_name, zone, ap_zone, ap_floor, rssi, wifi_speed, 
         device_model, device_serial, ip_address, source, is_online, is_heartbeat, last_updated, net_dl_kbps, net_ul_kbps, 
         command, command_timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
         COALESCE((SELECT command FROM devices WHERE device_id = ?), ''), 
         COALESCE((SELECT command_timestamp FROM devices WHERE device_id = ?), ''))
        `);

        stmt.run(
            data.device_id, data.latitude, data.longitude, data.speed, data.accuracy, data.user_name,
            data.zone, data.ap_zone, data.ap_floor, data.rssi, data.wifi_speed, data.device_model,
            data.device_serial, data.ip_address, data.source, data.is_online, data.is_heartbeat,
            data.last_updated, data.net_dl_kbps, data.net_ul_kbps, data.device_id, data.device_id
        );

        res.json({ message: "Success" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET COMMAND
app.get('/api/devices/:device_id/command', (req, res) => {
    try {
        const row = db.prepare(
            `SELECT command, command_timestamp FROM devices WHERE device_id = ?`
        ).get(req.params.device_id);

        res.json(row || { command: "", command_timestamp: null });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. CLEAR COMMAND
app.patch('/api/devices/:device_id/clear-command', (req, res) => {
    try {
        db.prepare(
            `UPDATE devices SET command = '', command_timestamp = NULL WHERE device_id = ?`
        ).run(req.params.device_id);

        res.json({ message: "Command cleared" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. WIFI LOCATIONS
app.get('/api/wifi_locations', (req, res) => {
    try {
        const rows = db.prepare(`
        SELECT bssid, ap_name, latitude, longitude, zone, location_name, floor 
        FROM wifi_locations 
        WHERE is_active = 1 AND latitude IS NOT NULL
        `).all();

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. ADMIN COMMAND
app.post('/api/admin/command', (req, res) => {
    try {
        const { device_id, command } = req.body;
        const timestamp = new Date().toISOString();

        db.prepare(`
        UPDATE devices SET command = ?, command_timestamp = ? WHERE device_id = ?
        `).run(command, timestamp, device_id);

        res.json({ message: `Command '${command}' sent to ${device_id}` });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. GET ALL DEVICES
app.get('/api/devices', (req, res) => {
    try {
        const rows = db.prepare(`SELECT * FROM devices`).all();
        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});