// --- Gateway: HTTP + WebSocket + TCP + UDP ---
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const dgram = require("dgram");
const os = require("os");
const { spawn } = require("child_process");

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

// --- START ---
server.listen(CFG.HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] UI Server: http://${getLanIP()}:${CFG.HTTP_PORT}`);
    startTunnel();
});