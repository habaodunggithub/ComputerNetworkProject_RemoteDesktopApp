// Node Gateway: HTTPS + WebSocket Secure (WSS) + TCP Agent + UDP Discovery

// IMPORT MODULE 
const path = require("path");
const https = require("https"); // Dùng https
const fs = require("fs");       // Đọc cert/key
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const os = require("os");
const dgram = require("dgram"); // Module cho UDP

// CẤU HÌNH 
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8080", 10);
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "9100", 10);
const DISCOVERY_PORT = 9102; // Port UDP để nghe Agent la làng (phải khớp với C++)

// CẤU HÌNH SSL/TLS
let sslOptions = {};
try {
    sslOptions = {
        key: fs.readFileSync(path.join(__dirname, 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };
    console.log("[Gateway] Đã tải chứng chỉ SSL thành công.");
} catch (err) {
    console.error("[Gateway] LỖI: Không tìm thấy file key.pem hoặc cert.pem!");
    process.exit(1);
}

// HTTP SERVER (SERVE UI) 
const app = express();
app.use(express.static(path.join(__dirname, "public")));

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
    }
});

udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[Discovery] UDP listening at ${address.address}:${address.port}`);
});

// Bắt đầu lắng nghe UDP
udpServer.bind(DISCOVERY_PORT);

// Dọn dẹp danh sách: Xóa các Agent không gửi tín hiệu trong 2 giây qua
setInterval(() => {
    const now = Date.now();
    for (const [key, agent] of discoveredAgents.entries()) {
        if (now - agent.lastSeen > 2000) {
            discoveredAgents.delete(key);
        }
    }
}, 2000); // Chạy mỗi 2 giây

// --- API SCAN (HTTP GET) ---
// Frontend gọi vào đây để lấy danh sách mà không cần WebSocket
app.get('/api/scan', (req, res) => {
    const list = Array.from(discoveredAgents.values());
    res.json({
        success: true,
        data: list
    });
});

const server = https.createServer(sslOptions, app);

// WEBSOCKET SERVER (WSS)
const wss = new WebSocket.Server({ server, path: "/ws" });

let currentClient = null;

// TCP SERVER (CHO AGENT KẾT NỐI TRỰC TIẾP ĐỂ ĐIỀU KHIỂN)
let agentSocket = null;
let agentBuffer = "";

const agentServer = net.createServer((socket) => {
    console.log(`[Gateway] Agent TCP connected from ${socket.remoteAddress}:${socket.remotePort}`);
    agentSocket = socket;
    agentBuffer = "";
    agentSocket.setEncoding("utf8");

    agentSocket.on("data", (chunk) => {
        agentBuffer += chunk;
        processAgentBuffer();
    });

    agentSocket.on("error", (err) => console.error("[Gateway] Agent socket error:", err.message));
    agentSocket.on("close", () => {
        console.log("[Gateway] Agent TCP disconnected");
        agentSocket = null;
    });
});

agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] TCP listening for agents at 0.0.0.0:${AGENT_PORT}`);
});

function processAgentBuffer() {
    let idx;
    while ((idx = agentBuffer.indexOf("\n")) >= 0) {
        const line = agentBuffer.slice(0, idx).trim();
        agentBuffer = agentBuffer.slice(idx + 1);
        if (!line) continue;
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(line);
        }
    }
}

function sendToAgent(raw) {
    if (!agentSocket) {
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(JSON.stringify({ type: "status", success: false, message: "No agent connected via TCP" }));
        }
        return;
    }
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    agentSocket.write(text + "\n", (err) => {
        if (err) console.error("[Gateway] Error writing to agent:", err.message);
    });
}

// === WEBSOCKET HANDLER ===
wss.on("connection", (ws) => {
    if (currentClient) {
        ws.close(1013, "Another client already connected");
        return;
    }
    currentClient = ws;
    console.log("[Gateway] Web client connected");

    ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch (e) { return; }

        // Các lệnh điều khiển chuyển thẳng xuống Agent qua TCP
        sendToAgent(msg);
    });

    ws.on("close", () => {
        if (currentClient === ws) {
            currentClient = null;
            console.log("[Gateway] Web client disconnected");
        }
    });
});

// START SERVER
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

server.listen(HTTP_PORT, "0.0.0.0", () => {
    const ip = getLanIPv4();
    console.log("-------------------------------------------------------");
    console.log(`[Gateway] HTTPS Server running!`);
    console.log(`[Gateway] Web Control: https://${ip}:${HTTP_PORT}`);
    console.log(`[Gateway] WebSocket:   wss://${ip}:${HTTP_PORT}/ws`);
    console.log("-------------------------------------------------------");
});