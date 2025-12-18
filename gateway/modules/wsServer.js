// --- Module: WebSocket Server ---
const WebSocket = require("ws");

let webClient = null;

function initWebSocketServer(server, agents) {
    const wss = new WebSocket.Server({ server, path: "/ws" });

    wss.on("connection", (ws) => {
        if (webClient) { ws.close(1013, "Busy"); return; }
        webClient = ws;
        
        // Enable TCP NoDelay for WebSocket underlying socket
        if (ws._socket) {
            ws._socket.setNoDelay(true);
        }
        
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

    return wss;
}

function getWebClient() {
    return webClient;
}

function setWebClient(client) {
    webClient = client;
}

module.exports = {
    initWebSocketServer,
    getWebClient,
    setWebClient
};
