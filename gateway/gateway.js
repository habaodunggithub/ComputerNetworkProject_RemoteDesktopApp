// Gateway: HTTP + WebSocket + TCP cho Multi-Agent + UDP Beacon

const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const os = require("os");
const dgram = require("dgram");
const { spawn } = require("child_process");

// Cấu hình
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8080", 10);
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "9100", 10);
const BEACON_PORT = 9103;

// HTTP server phục vụ UI
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// Web client: chỉ cho phép 1 browser điều khiển cùng lúc
let currentClient = null;

// Danh sách agent: Map<agentId, { socket, buffer, ip, hostname, os, connectedAt, lastSeen }>
const connectedAgents = new Map();

// Lấy địa chỉ IP LAN
function getLanIPv4() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const netInfo of nets[name]) {
            if (netInfo.family === "IPv4" && !netInfo.internal) {
                return netInfo.address;
            }
        }
    }
    return "localhost";
}

// Build danh sách agent đang online
function buildAgentList() {
    const list = [];
    const now = Date.now();

    connectedAgents.forEach((info, agentId) => {
        // Bỏ qua agent không còn socket hoặc socket bị destroy
        if (!info.socket || info.socket.destroyed) return;

        // Bỏ qua agent không phản hồi quá 30s
        if (now - info.lastSeen > 30000) return;

        list.push({
            agentId: agentId,
            ip: info.ip,
            hostname: info.hostname || "Unknown",
            os: info.os || "Unknown",
            connectedAt: info.connectedAt,
            lastSeen: info.lastSeen
        });
    });

    return list;
}

// API scan: Frontend gọi để lấy danh sách Agent đang kết nối
app.get("/api/scan", (_req, res) => {
    const list = buildAgentList();
    res.json({
        success: true,
        data: list
    });
});

// HTTP server
const server = http.createServer(app);

// WebSocket server cho Web client
const wss = new WebSocket.Server({ server, path: "/ws" });

// TCP server cho Agent kết nối
const agentServer = net.createServer((socket) => {
    const agentIp = socket.remoteAddress;
    const agentId = agentIp; // Dùng IP làm unique ID
    
    console.log(`[Gateway] Agent connected: ${agentId}:${socket.remotePort}`);

    // Lấy agent info cũ (nếu reconnect) hoặc tạo mới
    let agentInfo = connectedAgents.get(agentId);

    if (agentInfo) {
        // Agent reconnect: đóng socket cũ, update socket mới
        if (agentInfo.socket && agentInfo.socket !== socket) {
            try { agentInfo.socket.destroy(); } catch (e) {}
        }
        agentInfo.socket = socket;
        agentInfo.buffer = "";
        agentInfo.lastSeen = Date.now();
        console.log(`[Gateway] Agent reconnected: ${agentId}`);
    } else {
        // Agent mới
        agentInfo = {
            socket: socket,
            buffer: "",
            ip: agentIp,
            hostname: "Unknown",
            os: "Unknown",
            connectedAt: Date.now(),
            lastSeen: Date.now()
        };
    }

    connectedAgents.set(agentId, agentInfo);
    socket.setEncoding("utf8");

    // Nhận data từ Agent
    socket.on("data", (chunk) => {
        agentInfo.buffer += chunk;
        processAgentBuffer(agentId);
    });

    socket.on("close", () => {
        console.log(`[Gateway] Agent disconnected: ${agentId}`);
        // Không xóa ngay, để UI vẫn hiển thị (sẽ cleanup sau 60s)
    });

    socket.on("error", (err) => {
        console.error(`[Gateway] Agent error (${agentId}):`, err.message);
    });
});

agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening for agents at 0.0.0.0:${AGENT_PORT}`);
});

// UDP Beacon: Gateway gửi broadcast để Agent tự động tìm
const udpBeacon = dgram.createSocket("udp4");

udpBeacon.bind(0, () => {
    udpBeacon.setBroadcast(true);
    console.log("[Gateway] UDP Beacon sender ready.");

    // Gửi beacon mỗi 500ms
    setInterval(() => {
        const payload = JSON.stringify({
            type: "gateway_beacon",
            hostname: os.hostname(),
            ip: getLanIPv4(),
            port: AGENT_PORT
        });

        // Broadcast LAN + localhost
        udpBeacon.send(payload, 0, payload.length, BEACON_PORT, "255.255.255.255");
        udpBeacon.send(payload, 0, payload.length, BEACON_PORT, "127.0.0.1");
    }, 500);
});

// Xử lý buffer từ Agent (tách theo dòng)
function processAgentBuffer(agentId) {
    const agentInfo = connectedAgents.get(agentId);
    if (!agentInfo) return;

    let idx;
    while ((idx = agentInfo.buffer.indexOf("\n")) >= 0) {
        const line = agentInfo.buffer.slice(0, idx).trim();
        agentInfo.buffer = agentInfo.buffer.slice(idx + 1);
        if (!line) continue;

        // Parse JSON từ Agent
        try {
            const msg = JSON.parse(line);
            
            // Cập nhật lastSeen cho mọi gói hợp lệ
            agentInfo.lastSeen = Date.now();

            // Xử lý gói "hello" để cập nhật thông tin agent
            if (msg.type === "hello") {
                agentInfo.hostname = msg.hostname || agentInfo.hostname;
                agentInfo.os = msg.os || agentInfo.os;
                console.log(`[Gateway] Registered agent: ${agentId}`, {
                    hostname: agentInfo.hostname,
                    os: agentInfo.os
                });
            }
            // Xử lý gói "heartbeat" (chỉ update lastSeen, đã làm ở trên)
            else if (msg.type === "heartbeat") {
                // Silent, không log
            }
            // Forward các gói khác lên Web client (kèm agentId)
            else {
                if (currentClient && currentClient.readyState === WebSocket.OPEN) {
                    msg.agentId = agentId; // Thêm agentId vào message
                    currentClient.send(JSON.stringify(msg));
                }
            }

            connectedAgents.set(agentId, agentInfo);
        } catch (e) {
            // Bỏ qua nếu không phải JSON
        }
    }
}

// Gửi lệnh xuống Agent qua TCP (route theo agentId)
function sendToAgent(agentId, raw) {
    const agentInfo = connectedAgents.get(agentId);
    
    if (!agentInfo || !agentInfo.socket || agentInfo.socket.destroyed) {
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(JSON.stringify({
                type: "status",
                success: false,
                message: `Agent ${agentId} not connected`
            }));
        }
        return;
    }

    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    agentInfo.socket.write(text + "\n", (err) => {
        if (err) console.error(`[Gateway] Error writing to agent ${agentId}:`, err.message);
    });
}

// WebSocket: Nhận lệnh từ Web client, forward xuống Agent theo agentId
wss.on("connection", (ws) => {
    // Chỉ cho phép 1 client
    if (currentClient) {
        ws.close(1013, "Another client already connected");
        return;
    }
    currentClient = ws;
    console.log("[Gateway] Web client connected");

    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            
            // Client phải gửi kèm agentId để route đúng agent
            if (!msg.agentId) {
                ws.send(JSON.stringify({
                    type: "status",
                    success: false,
                    message: "Missing agentId in command"
                }));
                return;
            }

            // Forward lệnh xuống Agent tương ứng
            sendToAgent(msg.agentId, msg);
        } catch (e) {
            console.error("[Gateway] WebSocket parse error:", e.message);
        }
    });

    ws.on("close", () => {
        if (currentClient === ws) {
            currentClient = null;
            console.log("[Gateway] Web client disconnected");
        }
    });

    ws.on("error", (err) => {
        console.error("[Gateway] WebSocket error:", err.message);
    });
});

// Cleanup agents cũ mỗi 60s
setInterval(() => {
    const now = Date.now();
    connectedAgents.forEach((info, agentId) => {
        // Xóa agent không phản hồi quá 60s
        if (now - info.lastSeen > 60000) {
            console.log(`[Gateway] Removing stale agent: ${agentId}`);
            if (info.socket) {
                try { info.socket.destroy(); } catch (e) {}
            }
            connectedAgents.delete(agentId);
        }
    });
}, 60000);

// Hàm chạy Cloudflare Tunnel tự động
function startCloudflareTunnel() {
    const cfPath = path.join(__dirname, "cloudflared.exe");

    console.log(`[Cloudflare] Starting tunnel...`);

    // Fix cứng IP 127.0.0.1 để tránh lỗi IPv6
    const tunnel = spawn(cfPath, ["tunnel", "--url", `http://127.0.0.1:${HTTP_PORT}`]);

    // Bắt log từ Cloudflare để tìm URL
    tunnel.stderr.on("data", (data) => {
        const output = data.toString();

        // Tìm chuỗi https://....trycloudflare.com
        const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);

        if (match) {
            const publicUrl = match[0];
            console.log("\n-------------------------------------------------------");
            console.log("[Cloudflare] Public url (internet):", publicUrl);
            console.log("-------------------------------------------------------\n");
        }
    });

    tunnel.on("close", (code) => {
        console.log(`[Cloudflare] Tunnel process exited with code ${code}`);
    });

    // Khi tắt Node.js, thì tắt luôn Cloudflare
    process.on("exit", () => tunnel.kill());
    process.on("SIGINT", () => {
        tunnel.kill();
        process.exit();
    });
}

// Khởi động HTTP server
server.listen(HTTP_PORT, "0.0.0.0", () => {
    const ip = getLanIPv4();
    console.log("-------------------------------------------------------");
    console.log(`[Gateway] HTTP Server running!`);
    console.log(`[Gateway] Web Control: http://${ip}:${HTTP_PORT}`);
    console.log(`[Gateway] WebSocket:   ws://${ip}:${HTTP_PORT}/ws`);
    console.log("-------------------------------------------------------");

    startCloudflareTunnel();
});
