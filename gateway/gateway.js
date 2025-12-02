// Gateway: HTTPS + WebSocket (WSS) + TCP cho Agent + UDP Beacon

const path = require("path");
<<<<<<< HEAD
const http = require("http");
// const https = require("https"); // Dùng https
// const fs = require("fs");       // Đọc cert/key
=======
const https = require("https");
const fs = require("fs");
>>>>>>> 44219beff93bce04341fce5113b03f18ce40c1cf
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const os = require("os");
const dgram = require("dgram");

// Cấu hình
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8080", 10);
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "9100", 10);
const BEACON_PORT = 9103;

<<<<<<< HEAD
// // CẤU HÌNH SSL/TLS
// let sslOptions = {};
// try {
//     sslOptions = {
//         key: fs.readFileSync(path.join(__dirname, 'key.pem')),
//         cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
//     };
//     console.log("[Gateway] Đã tải chứng chỉ SSL thành công.");
// } catch (err) {
//     console.error("[Gateway] LỖI: Không tìm thấy file key.pem hoặc cert.pem!");
//     process.exit(1);
// }
=======
// Load SSL certificate
let sslOptions = {};
try {
    sslOptions = {
        key: fs.readFileSync(path.join(__dirname, "key.pem")),
        cert: fs.readFileSync(path.join(__dirname, "cert.pem"))
    };
    console.log("[Gateway] SSL certificate loaded.");
} catch (err) {
    console.error("[Gateway] ERROR: key.pem or cert.pem not found!");
    process.exit(1);
}
>>>>>>> 44219beff93bce04341fce5113b03f18ce40c1cf

// HTTP server phục vụ UI
const app = express();
app.use(express.static(path.join(__dirname, "public")));

<<<<<<< HEAD
// === UDP DISCOVERY SERVER (TÍNH NĂNG MỚI) ===
// Lưu danh sách Agent tìm thấy: Map<IP, {info, lastSeen}>
const discoveredAgents = new Map();

const udpServer = dgram.createSocket('udp4');

udpServer.on('error', (err) => {
    console.error(`[Discovery] UDP error:\n${err.stack}`);
    udpServer.close();
});

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        // Chỉ xử lý gói tin có type là discovery_beacon
        if (data.type === 'discovery_beacon') {
            const key = rinfo.address;

            // Cập nhật hoặc thêm mới vào danh sách
            discoveredAgents.set(key, {
                ip: rinfo.address,
                hostname: data.hostname,
                os: data.os,
                lastSeen: Date.now() // Cập nhật thời gian nhìn thấy cuối cùng
            });
        }
    } catch (e) {
        // Bỏ qua tin nhắn rác không phải JSON chuẩn
=======
// Danh sách Agent đang kết nối TCP: Map<socket, { ip, hostname, os, connectedAt }>
const connectedAgents = new Map();

// API scan: Frontend lấy danh sách Agent đang kết nối
app.get("/api/scan", (req, res) => {
    const list = [];
    for (const [sock, info] of connectedAgents.entries()) {
        list.push({
            ip: info.ip,
            hostname: info.hostname,
            os: info.os
        });
>>>>>>> 44219beff93bce04341fce5113b03f18ce40c1cf
    }
    res.json({ success: true, data: list });
});

// const server = https.createServer(sslOptions, app);
const server = http.createServer(app);

// WebSocket server (WSS) cho Web client
const wss = new WebSocket.Server({ server, path: "/ws" });
let currentClient = null;

// TCP server cho Agent kết nối
let agentSocket = null;
let agentBuffer = "";

const agentServer = net.createServer((socket) => {
    console.log(`[Gateway] Agent TCP connected from ${socket.remoteAddress}:${socket.remotePort}`);

    // Chỉ cho phép 1 agent cùng lúc: đóng agent cũ nếu có
    if (agentSocket && agentSocket !== socket) {
        try { agentSocket.destroy(); } catch (e) {}
        connectedAgents.delete(agentSocket);
    }

    agentSocket = socket;
    agentBuffer = "";
    agentSocket.setEncoding("utf8");

    // Thêm vào danh sách agent đang kết nối
    connectedAgents.set(socket, {
        ip: socket.remoteAddress,
        hostname: "Unknown",
        os: "Unknown",
        connectedAt: Date.now()
    });

    agentSocket.on("data", (chunk) => {
        agentBuffer += chunk;
        processAgentBuffer(socket);
    });

    agentSocket.on("error", (err) => console.error("[Gateway] Agent socket error:", err.message));

    agentSocket.on("close", () => {
        console.log("[Gateway] Agent TCP disconnected");
        if (agentSocket === socket) agentSocket = null;
        connectedAgents.delete(socket);
    });
});

agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening for agents at 0.0.0.0:${AGENT_PORT}`);
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

        // Parse để bắt gói "hello" (cập nhật thông tin agent)
        try {
            const msg = JSON.parse(line);
            if (msg.type === "hello") {
                const info = connectedAgents.get(socket);
                if (info) {
                    info.hostname = msg.hostname || info.hostname;
                    info.os = msg.os || info.os;
                    info.ip = info.ip || socket.remoteAddress;
                    connectedAgents.set(socket, info);
                    console.log("[Gateway] Registered agent info:", info);
                }
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

// UDP Beacon: Quảng bá thông tin Gateway để Agent tự động tìm
const udpBeacon = dgram.createSocket("udp4");

udpBeacon.bind(0, () => {  // Bind port random (không phải 9103)
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

// WebSocket handler: Nhận lệnh từ Web client và forward xuống Agent
wss.on("connection", (ws) => {
    if (currentClient) {
        ws.close(1013, "Another client already connected");
        return;
    }
    currentClient = ws;
    console.log("[Gateway] Web client connected");

    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            sendToAgent(msg);  // Forward lệnh xuống Agent
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
});

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

// Khởi động server
server.listen(HTTP_PORT, "0.0.0.0", () => {
    const ip = getLanIPv4();
    console.log("-------------------------------------------------------");
    console.log(`[Gateway] HTTP Server running!`);
    console.log(`[Gateway] Web Control: http://${ip}:${HTTP_PORT}`);
    console.log(`[Gateway] WebSocket:   wss://${ip}:${HTTP_PORT}/ws`);
    console.log("-------------------------------------------------------");
});
