// --- Module: Cloudflare Tunnel & Discord Webhook ---
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");
const { CFG } = require("./config");

// Hàm gửi link qua Discord Webhook
async function sendToDiscord(url) {
    if (!CFG.DISCORD_WEBHOOK_URL) return;
    
    try {
        const https = require('https');
        const { URL } = require('url');
        const webhookUrl = new URL(CFG.DISCORD_WEBHOOK_URL);
        
        const data = JSON.stringify({
            embeds: [{
                title: "🌐 Gateway Online!",
                color: 0x00ff00,
                fields: [
                    { name: "📍 Hostname", value: `\`${os.hostname()}\``, inline: true },
                    { name: "⏰ Time", value: new Date().toLocaleString(), inline: true },
                    { name: "🔗 Public URL", value: url }
                ],
                footer: { text: "Remote Desktop Gateway" }
            }]
        });
        
        const req = https.request(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            if (res.statusCode === 204 || res.statusCode === 200) {
                console.log("[Discord] ✓ Link sent successfully!");
            } else {
                console.log(`[Discord] ✗ Failed: ${res.statusCode}`);
            }
        });
        
        req.on('error', (e) => console.log(`[Discord] ✗ Error: ${e.message}`));
        req.write(data);
        req.end();
    } catch (e) {
        console.log(`[Discord] ✗ Error: ${e.message}`);
    }
}

function startTunnel() {
    const isPkg = typeof process.pkg !== 'undefined';
    const basePath = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
    const cfExe = path.join(basePath, "cloudflared.exe");

    console.log("[Tunnel] Starting Cloudflare...");
    const child = spawn(cfExe, ["tunnel", "--url", `http://127.0.0.1:${CFG.HTTP_PORT}`]);
    child.stderr.on("data", (d) => {
        const url = d.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (url) {
            console.log(`\n>>> PUBLIC URL: ${url[0]} <<<\n`);
            // Gửi link về Discord
            sendToDiscord(url[0]);
        }
    });
    process.on("exit", () => child.kill()); 
}

module.exports = {
    sendToDiscord,
    startTunnel
};
