const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const csv = require('csv-parser');

// เชื่อมต่อฐานข้อมูล SQLite
const db = new sqlite3.Database('./database.sqlite');
const results = [];

console.log("กำลังอ่านไฟล์ wifi_locations_rows.csv...");

// อ่านไฟล์ CSV
fs.createReadStream('wifi_locations_rows.csv')
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    
    // เมื่ออ่านไฟล์เสร็จ ให้เริ่มบันทึกลงฐานข้อมูล
    db.serialize(() => {
        // เตรียมคำาั่ง SQL ถ้ามี bssid ซ้ำให้ทับจ้อมูลเก่า
        const stmt = db.prepare(`INSERT OR REPLACE INTO wifi_locations (bssid, ap_name, latitude, longitude, zone, location_name, floor, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

        let count = 0;

        // วนลูปรำข้อมูลแค่ละบรรทัดใส่ลงตาราง
        results.forEach(row => {
            const bssid = row.bssid;
            const ap_name = row.ap_name;
            const lat = parseFloat(row.latitude);
            const lng = parseFloat(row.longitude);
            const zone = row.zone;
            const loc_name = row.location_name || "";
            const floor = parseInt(row.floor) || 1;
            
            // แปลงคำว่า 'true' หรือ 'false' ใน CSV เป็น 1 หรือ 0 สำหรับ SQLite
            const isActive = row.is_active === 'true' ? 1 : 0;

            // ตรวจสอบว่าที BSSID และพิกัดไม่ใช่ค่าว่าง
            if (bssid && !isNaN(lat) && !isNaN(lng)) {
                stmt.run(bssid, ap_name, lat, lng, zone, loc_name, floor, isActive);
                count++;
            }
        });

        stmt.finalize();
        console.log(`นำเข้าข้อมูลสำเร็จ! บันทึกจุด WiFi ทั้งหมด ${count} รายการลงในฐานข้อมูล.`);
    });

    db.close();
  })
  .on('error', (err) => {
      console.error("เกิดข้อผิดพลาดในการอ่านไฟล์:", err.message);
  });