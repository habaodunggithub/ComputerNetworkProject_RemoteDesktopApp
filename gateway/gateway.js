// --- Gateway: HTTP + WebSocket + TCP + UDP ---
// Main entry point - imports and orchestrates all modules

const path = require("path");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");

// --- Import Modules ---
const { CFG } = require("./modules/config");
const { initSQL } = require("./modules/decryption");
const election = require("./modules/election");
const beacon = require("./modules/beacon");
const tunnel = require("./modules/tunnel");
const { initTcpServer } = require("./modules/tcpServer");
const { initWebSocketServer, getWebClient } = require("./modules/wsServer");
const { setupRoutes } = require("./modules/httpRoutes");
const { startCleanup } = require("./modules/cleanup");
const Auth = require("./modules/auth");

// --- QUẢN LÝ AGENTS ---
const agents = new Map();

// --- Khởi tạo SQL.js ---
initSQL().catch(err => console.error("⛔ [Init Error] Lỗi load SQL.js:", err));

// --- 1. HTTP SERVER ---
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// --- KÍCH HOẠT AUTH MODULE ---
Auth.setup(app); // Cài đặt các route /api/register, /api/login

// --- SETUP HTTP ROUTES ---
setupRoutes(app, agents);

// --- Tạo HTTP Server ---
const server = http.createServer(app);

// --- 2. WEBSOCKET SERVER ---
initWebSocketServer(server, agents);

// --- 3. TCP SERVER ---
initTcpServer(agents, getWebClient);

// --- 4. UDP BEACON ---
beacon.initBeacon();

// --- 5. CLEANUP ---
startCleanup(agents);

// --- 6. CLOUDFLARE TUNNEL (Chỉ khi là Leader) ---
election.setOnBecomeLeader(() => {
    tunnel.startTunnel();
});

// --- START SERVER ---
server.listen(CFG.HTTP_PORT, "0.0.0.0", () => {
    console.log(`[Gateway] UI: http://localhost:${CFG.HTTP_PORT}`);
    console.log(`[Gateway] TCP Listening: ${CFG.AGENT_PORT}`);

    Auth.startCLI(); 
    
    // Khởi động Leader Election (sẽ tự động start tunnel nếu là leader)
    election.initLeaderElection(agents);
});
