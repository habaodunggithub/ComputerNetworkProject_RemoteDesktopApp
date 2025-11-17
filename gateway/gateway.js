// Node Gateway: HTTP + WebSocket cho Web client, TCP server cho Agent (C++)

// IMPORT MODULE 
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const net = require("net");
const os = require("os");

// CẤU HÌNH 
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8080", 10);
const AGENT_PORT = parseInt(process.env.AGENT_PORT || "9100", 10);

// HTTP SERVER (SERVE UI) 
const app = express();

// Static folder: public/index.html, public/app.js, public/style.css
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// WEBSOCKET SERVER (CHO WEB CLIENT)
const wss = new WebSocket.Server({ server, path: "/ws" });

// Giả sử chỉ cho 1 web client điều khiển tại 1 thời điểm 
let currentClient = null;

// TCP SERVER (CHO AGENT KẾT NỐI TỚI)
let agentSocket = null;
let agentBuffer = "";

// Tạo TCP server lắng nghe kết nối từ agent
const agentServer = net.createServer((socket) => {
    console.log(
        "[Gateway] Agent connected from",
        socket.remoteAddress,
        ":",
        socket.remotePort
    );

    // Lưu socket hiện tại
    agentSocket = socket;
    agentBuffer = "";
    agentSocket.setEncoding("utf8");

    agentSocket.on("data", (chunk) => {
        agentBuffer += chunk;
        processAgentBuffer();
    });

    agentSocket.on("error", (err) => {
        console.error("[Gateway] Agent socket error:", err.message);
    });

    agentSocket.on("close", () => {
        console.log("[Gateway] Agent disconnected");
        agentSocket = null;
        agentBuffer = "";
    });
});

// Bắt đầu lắng nghe TCP cho agent
agentServer.listen(AGENT_PORT, "0.0.0.0", () => {
    console.log(
        `[Gateway] TCP listening for agents at 0.0.0.0:${AGENT_PORT}`
    );
});

// Xử lý buffer từ agent: tách theo '\n' => từng JSON line
function processAgentBuffer() {
    let idx;
    while ((idx = agentBuffer.indexOf("\n")) >= 0) {
        const line = agentBuffer.slice(0, idx).trim();
        agentBuffer = agentBuffer.slice(idx + 1);
        if (!line) continue;

        // Forward JSON từ agent -> web client
        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(line);
        } else {
            console.log("[Gateway] Got from agent but no web client:", line);
        }
    }
}

// Gửi JSON tới agent
function sendToAgent(raw) {
    if (!agentSocket) {
        console.warn("[Gateway] No agent connected, cannot send");

        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(
                JSON.stringify({
                    type: "status",
                    success: false,
                    message: "No agent connected",
                })
            );
        }
        return;
    }

    const text = typeof raw === "string" ? raw : JSON.stringify(raw);

    agentSocket.write(text + "\n", (err) => {
        if (err) {
            console.error("[Gateway] Error writing to agent:", err.message);
        }
    });
}

// WEBSOCKET HANDLER (WEB <-> GATEWAY)
wss.on("connection", (ws) => {
    if (currentClient) {
        // chỉ cho 1 client
        ws.close(1013, "Another client already connected");
        return;
    }

    currentClient = ws;
    console.log("[Gateway] Web client connected");

    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (e) {
            console.warn("[Gateway] Invalid JSON from web client");
            return;
        }

        // Chuyển message qua cho agent
        sendToAgent(msg);
    });

    ws.on("close", () => {
        if (currentClient === ws) {
            currentClient = null;
            console.log("[Gateway] Web client disconnected");
        }
    });
});

// HTTP + WS LISTEN 
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
    console.log(`[Gateway] HTTP listening at  http://${ip}:${HTTP_PORT}`);
    console.log(`[Gateway] WebSocket path    ws://${ip}:${HTTP_PORT}/ws`);
});

console.log("[Gateway] gateway.js started (TCP server for agent, WS+HTTP for web)");