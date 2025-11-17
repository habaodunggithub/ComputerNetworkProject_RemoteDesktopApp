// gateway.js
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const net = require('net');

// --- LOG KHỞI ĐỘNG ---
console.log('[Gateway] gateway.js started');

// --- CẤU HÌNH ---
const AGENT_HOST = process.env.AGENT_HOST || '127.0.0.1';
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '9100', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);

// --- HTTP server phục vụ static (index.html, app.js, style.css) ---
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// --- WebSocket server cho browser ---
const wss = new WebSocket.Server({ server, path: '/ws' });

// Chỉ cho 1 web client điều khiển tại một thời điểm
let currentClient = null;

// --- TCP tới Agent ---
let agentSocket = null;
let agentBuffer = '';

function connectAgent() {
    if (agentSocket) {
        try { agentSocket.destroy(); } catch (e) {}
        agentSocket = null;
    }

    agentSocket = new net.Socket();
    agentSocket.setEncoding('utf8');

    console.log(`[Gateway] Connecting to agent ${AGENT_HOST}:${AGENT_PORT} ...`);
    agentSocket.connect(AGENT_PORT, AGENT_HOST, () => {
        console.log('[Gateway] Connected to agent');
    });

    agentSocket.on('data', chunk => {
        agentBuffer += chunk;
        processAgentBuffer();
    });

    agentSocket.on('error', err => {
        console.error('[Gateway] Agent error:', err.message);
    });

    agentSocket.on('close', () => {
        console.log('[Gateway] Agent connection closed. Reconnecting in 3s...');
        setTimeout(connectAgent, 3000);
    });
}

function processAgentBuffer() {
    let idx;
    while ((idx = agentBuffer.indexOf('\n')) >= 0) {
        const line = agentBuffer.slice(0, idx).trim();
        agentBuffer = agentBuffer.slice(idx + 1);
        if (!line) continue;

        if (currentClient && currentClient.readyState === WebSocket.OPEN) {
            currentClient.send(line);
        } else {
            console.log('[Gateway] Got from agent but no web client:', line);
        }
    }
}

function sendToAgent(raw) {
    if (!agentSocket || agentSocket.destroyed) {
        console.warn('[Gateway] Cannot send to agent, socket not ready');
        return;
    }
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    agentSocket.write(text + '\n');
}

// --- WebSocket handler ---
wss.on('connection', ws => {
    if (currentClient) {
        ws.close(1013, 'Another client already connected');
        return;
    }

    currentClient = ws;
    console.log('[Gateway] Web client connected');

    ws.on('message', data => {
        sendToAgent(data.toString());
    });

    ws.on('close', () => {
        if (currentClient === ws) {
            currentClient = null;
            console.log('[Gateway] Web client disconnected');
        }
    });
});


const os = require('os');

function getLanIPv4() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address; // vd: 192.168.1.10
            }
        }
    }
    return 'localhost';
}

// --- BẮT ĐẦU LẮNG NGHE HTTP + WS ---
server.listen(HTTP_PORT, '0.0.0.0', () => {
    const ip = getLanIPv4();
    console.log(`[Gateway] HTTP listening   at http://${ip}:${HTTP_PORT}`);
    console.log(`[Gateway] WebSocket path   ws://${ip}:${HTTP_PORT}/ws`);
});

// --- BẮT ĐẦU KẾT NỐI AGENT ---
connectAgent();