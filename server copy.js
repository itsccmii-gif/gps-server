const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// ป้องกันคนนอกยิง API เล่น รหัสนี้ต้องตรงกับในฝั่งแอป Android
const API_SECRET = "my_private_server_key_2026";

// แก้ไข CORS ให้ถูกต้อง (ใส่เครื่องหมายคำพูดที่ 'OPTIONS')
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use(bodyParser.json());

// Middleware ตรวจสอบ API Key
app.use((req, res, next) => {
    // ปลดล็อคให้ CORS Preflight request (OPTIONS) ผ่านได้เลย
    if (req.method === 'OPTIONS') {
        return next();
    }
    
    // ถ้าเป็นการดึงข้อมูลจุด WiFi ไม่ต้องเช็ค Key ก็ได้ (เพื่อความสะดวกตอนเทสบนเบราว์เซอร์)
    if (req.path === '/api/wifi_locations' && req.method === 'GET') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey !== API_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

// สร้าง/เชื่อมต่อ Database SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("✅ Connected to SQLite database.");
});

// สร้างตารางข้อมูลหากยังไม่มี
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS devices (
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
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS wifi_locations (
        bssid TEXT PRIMARY KEY,
        ap_name TEXT,
        latitude REAL,
        longitude REAL,
        zone TEXT,
        location_name TEXT,
        floor INTEGER,
        is_active BOOLEAN DEFAULT 1
    )`);
});

// 1. API: อัปเดตอุปกรณ์ 
app.post('/api/devices', (req, res) => {
    const data = req.body;
    
    const sql = `INSERT OR REPLACE INTO devices 
        (device_id, latitude, longitude, speed, accuracy, user_name, zone, ap_zone, ap_floor, rssi, wifi_speed, 
         device_model, device_serial, ip_address, source, is_online, is_heartbeat, last_updated, net_dl_kbps, net_ul_kbps, 
         command, command_timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
         COALESCE((SELECT command FROM devices WHERE device_id = ?), ''), 
         COALESCE((SELECT command_timestamp FROM devices WHERE device_id = ?), ''))`;

    const params = [
        data.device_id, data.latitude, data.longitude, data.speed, data.accuracy, data.user_name, 
        data.zone, data.ap_zone, data.ap_floor, data.rssi, data.wifi_speed, data.device_model, 
        data.device_serial, data.ip_address, data.source, data.is_online, data.is_heartbeat, 
        data.last_updated, data.net_dl_kbps, data.net_ul_kbps, data.device_id, data.device_id
    ];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Success", changes: this.changes });
    });
});

// 2. API: ดึงคำสั่ง
app.get('/api/devices/:device_id/command', (req, res) => {
    const sql = `SELECT command, command_timestamp FROM devices WHERE device_id = ?`;
    db.get(sql, [req.params.device_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { command: "", command_timestamp: null });
    });
});

// 3. API: เคลียร์คำสั่ง 
app.patch('/api/devices/:device_id/clear-command', (req, res) => {
    const sql = `UPDATE devices SET command = '', command_timestamp = NULL WHERE device_id = ?`;
    db.run(sql, [req.params.device_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Command cleared" });
    });
});

// 4. API: โหลดข้อมูลจุด WiFi
app.get('/api/wifi_locations', (req, res) => {
    const sql = `SELECT bssid, ap_name, latitude, longitude, zone, location_name, floor FROM wifi_locations WHERE is_active = 1 AND latitude IS NOT NULL`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 5. API พิเศษสำหรับ Admin: ใช้สั่งให้เครื่องทำงาน เช่น ส่งเสียงร้อง
app.post('/api/admin/command', (req, res) => {
    const { device_id, command } = req.body;
    const timestamp = new Date().toISOString();
    const sql = `UPDATE devices SET command = ?, command_timestamp = ? WHERE device_id = ?`;
    db.run(sql, [command, timestamp, device_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Command '${command}' sent to ${device_id}` });
    });
});

// 6. [NEW] API: ดึงข้อมูลอุปกรณ์ทั้งหมด (สำหรับแสดงบนหน้า Tracking)
app.get('/api/devices', (req, res) => {
    const sql = `SELECT * FROM devices`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tracking API Server running on port ${PORT}`);
    console.log(`👉 API Key required in header: x-api-key: ${API_SECRET}`);
    console.log(`👉 URL สำหรับการใช้งาน http://localhost:${PORT} หรือ IP ของเครื่องนี้`);
});