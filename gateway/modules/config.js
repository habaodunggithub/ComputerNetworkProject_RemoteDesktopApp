// --- Module: Configuration ---
const path = require("path");
const fs = require("fs");

// --- Load config từ file config.env (nếu có) ---
function loadEnvConfig() {
    const isPkg = typeof process.pkg !== 'undefined';
    const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
    const configPath = path.join(basePath, "config.env");
    
    if (fs.existsSync(configPath)) {
        console.log("[Config] Loading from config.env...");
        const content = fs.readFileSync(configPath, 'utf-8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                if (key && value) {
                    process.env[key.trim()] = value;
                }
            }
        });
    }
}

// Load config ngay khi module được import
loadEnvConfig();

// --- CẤU HÌNH ---
const CFG = {
    HTTP_PORT: parseInt(process.env.HTTP_PORT || 8080),
    AGENT_PORT: parseInt(process.env.AGENT_PORT || 9100),
    BEACON_PORT: 9103,
    GATEWAY_ELECTION_PORT: 9104,
    TIMEOUT_MS: 30000,
    CLEANUP_MS: 60000,
    ELECTION_INTERVAL: 2000,
    LEADER_TIMEOUT: 6000,
    
    // === CẤU HÌNH GỬI LINK CLOUDFLARE ===
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || ""
};

module.exports = { CFG, loadEnvConfig };
