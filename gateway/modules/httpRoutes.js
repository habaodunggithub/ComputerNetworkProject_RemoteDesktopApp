// --- Module: HTTP Routes ---
const path = require("path");
const { CFG } = require("./config");
const election = require("./election");
const beacon = require("./beacon");

function setupRoutes(app, agents) {
    // --- ROUTING CHO LANDING PAGES ---
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "..", "public", "home.html"));
    });

    app.get("/features", (req, res) => {
        res.sendFile(path.join(__dirname, "..", "public", "features.html"));
    });

    app.get("/contact", (req, res) => {
        res.sendFile(path.join(__dirname, "..", "public", "contact.html"));
    });

    app.get("/dashboard", (req, res) => {
        res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
    });

    // --- API ROUTES ---
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

    // API để frontend trigger scan
    app.post("/api/start-scan", (req, res) => {
        if (!election.getIsLeader()) {
            return res.json({ 
                success: false, 
                message: "This gateway is not the leader. Only leader can scan for agents.",
                isLeader: false,
                currentLeader: election.getCurrentLeader()
            });
        }
        
        const duration = req.body?.duration || 10000;
        const started = beacon.startBeaconScan(duration);
        res.json({ 
            success: started, 
            message: started ? `Beacon scan started for ${duration/1000}s` : "Failed to start scan",
            isLeader: true
        });
    });

    app.post("/api/stop-scan", (_, res) => {
        beacon.stopBeaconScan();
        res.json({ success: true, message: "Beacon scan stopped" });
    });

    // API để kiểm tra trạng thái leader
    app.get("/api/gateway-status", (_, res) => {
        const otherGateways = election.getOtherGateways();
        const gatewayList = Array.from(otherGateways.entries()).map(([id, gw]) => ({
            id,
            ip: gw.ip,
            port: gw.port,
            isLeader: gw.isLeader,
            agentCount: gw.agentCount || 0
        }));
        
        res.json({
            success: true,
            gatewayId: election.getGatewayId(),
            isLeader: election.getIsLeader(),
            currentLeader: election.getCurrentLeader(),
            otherGateways: gatewayList,
            agentCount: agents.size
        });
    });
}

module.exports = { setupRoutes };
