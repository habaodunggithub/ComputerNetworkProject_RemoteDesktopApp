// Gateway: HTTP + WebSocket (WSS) + TCP cho Agent + UDP Beacon + Auto Clould Flare Tunnel

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

// ====== TRẠNG THÁI TOÀN CỤC ======

/**
 * Web client (UI) – chỉ cho phép 1 browser điều khiển tại 1 thời điểm
 */
let currentClient = null;

/**
 * Agent TCP – hiện tại vẫn giữ mô hình 1 Agent “chính”.
 * Future: có thể mở rộng multi-agent nếu muốn.
 */
let agentSocket = null;
let agentBuffer = "";

/**
 * Danh sách agent đang kết nối TCP:
 * Map<socket, { ip, hostname, os, connectedAt, lastSeen }>
 */
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

// Build danh sách agent đang online cho API /api/scan
function buildAgentList() {
    const list = [];
    const now = Date.now();

    connectedAgents.forEach((info, socket) => {
        if (socket.destroyed) return;

        list.push({
            ip: info.ip || socket.remoteAddress,
            hostname: info.hostname || "Unknown",
            os: info.os || "Unknown",
            connectedAt: info.connectedAt || now,
            lastSeen: info.lastSeen || now
        });
    });

    return list;
}

// API scan: Frontend gọi để lấy danh sách Agent đang kết nối TCP
// Dùng được cả khi Gateway nằm sau Cloudflare tunnel
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
    console.log(`[Gateway] Agent TCP connected from ${socket.remoteAddress}:${socket.remotePort}`);

    // Chỉ cho phép 1 agent cùng lúc: đóng agent cũ
    if (agentSocket && agentSocket !== socket) {
        try { agentSocket.destroy(); } catch (e) {}
        connectedAgents.delete(agentSocket);
    }

    agentSocket = socket;
    agentBuffer = "";
    agentSocket.setEncoding("utf8");

    // Thêm agent vào danh sách
    connectedAgents.set(socket, {
        ip: socket.remoteAddress,
        hostname: "Unknown",
        os: "Unknown",
        connectedAt: Date.now(),
        lastSeen: Date.now()
    });

    // Nhận data từ Agent
    agentSocket.on("data", (chunk) => {
        agentBuffer += chunk;
        processAgentBuffer(socket);
    });

    agentSocket.on("close", () => {
        console.log("[Gateway] Agent TCP disconnected");
        connectedAgents.delete(socket);
        if (agentSocket === socket) {
            agentSocket = null;
            agentBuffer = "";
        }
    });

    agentSocket.on("error", (err) => {
        console.error("[Gateway] Agent socket error:", err.message);
    });
});

agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening for agents at 0.0.0.0:${AGENT_PORT}`);
});

// UDP Beacon: Gateway gửi broadcast để Agent tự động tìm
const udpBeacon = dgram.createSocket("udp4");

udpBeacon.bind(0, () => { // Bind port random (không phải 9103)
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

        // Broadcast LAN + localhost (cho agent cùng máy)
        udpBeacon.send(payload, 0, payload.length, BEACON_PORT, "255.255.255.255");
        udpBeacon.send(payload, 0, payload.length, BEACON_PORT, "127.0.0.1");
    }, 500);
});

// Xử lý buffer từ Agent (tách theo dòng)
function processAgentBuffer(socket) {
    let idx;
    while ((idx = agentBuffer.indexOf("\n")) >= 0) {
        const line = agentBuffer.slice(0, idx).trim();
        agentBuffer = agentBuffer.slice(idx + 1);
        if (!line) continue;

        // Forward JSON lên Web client
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(line);
        }

        // Parse để bắt gói "hello" và cập nhật lastSeen
        try {
            const msg = JSON.parse(line);
            const info = connectedAgents.get(socket);
            if (info) {
                info.lastSeen = Date.now();

                if (msg.type === "hello") {
                    info.hostname = msg.hostname || info.hostname;
                    info.os = msg.os || info.os;
                    info.ip = info.ip || socket.remoteAddress;
                    console.log("[Gateway] Registered agent info:", info);
                }

                connectedAgents.set(socket, info);
            }
        } catch (e) {
            // Bỏ qua nếu không phải JSON
        }
    }
}

// Gửi lệnh xuống Agent qua TCP
function sendToAgent(raw) {
    if (!agentSocket) {
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(JSON.stringify({
                type: "status",
                success: false,
                message: "No agent connected via TCP"
            }));
        }
        return;
    }
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    agentSocket.write(text + "\n", (err) => {
        if (err) console.error("[Gateway] Error writing to agent:", err.message);
    });
}

// WebSocket: Nhận lệnh từ Web client, forward xuống Agent

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
            sendToAgent(msg); // Forward lệnh xuống Agent
        } catch (e) {
            // Bỏ qua nếu không phải JSON
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