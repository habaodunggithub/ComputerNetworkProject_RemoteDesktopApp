// --- Module: Gateway Leader Election System ---
const dgram = require("dgram");
const os = require("os");
const { CFG } = require("./config");
const { getLanIP } = require("./utils");

// === GATEWAY LEADER ELECTION ===
const GATEWAY_ID = `${os.hostname()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
const GATEWAY_START_TIME = Date.now();

let isLeader = false;
let currentLeader = null;
let otherGateways = new Map(); // Map<gatewayId, {ip, port, lastSeen, startTime}>
let electionUdp = null;
let tunnelStarted = false;

// Callback khi trở thành leader
let onBecomeLeaderCallback = null;

console.log(`[Gateway] ID: ${GATEWAY_ID}`);

// Getter functions
function getGatewayId() { return GATEWAY_ID; }
function getIsLeader() { return isLeader; }
function getCurrentLeader() { return currentLeader; }
function getOtherGateways() { return otherGateways; }
function isTunnelStarted() { return tunnelStarted; }
function setTunnelStarted(value) { tunnelStarted = value; }

// Setter cho callback
function setOnBecomeLeader(callback) {
    onBecomeLeaderCallback = callback;
}

function initLeaderElection(agentsMap) {
    electionUdp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    electionUdp.on('message', (data, rinfo) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type !== 'gateway_election' || msg.gatewayId === GATEWAY_ID) return;
            
            // Cập nhật danh sách gateway khác
            otherGateways.set(msg.gatewayId, {
                ip: rinfo.address,
                port: msg.httpPort,
                agentPort: msg.agentPort,
                lastSeen: Date.now(),
                startTime: msg.startTime,
                isLeader: msg.isLeader
            });
            
            // Nếu có gateway khác claim là leader và khởi động sớm hơn
            if (msg.isLeader && msg.startTime < GATEWAY_START_TIME) {
                if (isLeader) {
                    console.log(`[Election] Found older leader: ${msg.gatewayId}, stepping down...`);
                    becomeFollower(msg.gatewayId);
                }
                currentLeader = msg.gatewayId;
            }
        } catch (e) {}
    });
    
    electionUdp.on('error', (e) => {
        console.log(`[Election] UDP Error: ${e.message}`);
    });
    
    electionUdp.bind(CFG.GATEWAY_ELECTION_PORT, '0.0.0.0', () => {
        electionUdp.setBroadcast(true);
        console.log(`[Election] Listening on port ${CFG.GATEWAY_ELECTION_PORT}`);
        
        // Gửi heartbeat định kỳ
        setInterval(() => sendElectionHeartbeat(agentsMap), CFG.ELECTION_INTERVAL);
        
        // Kiểm tra leader timeout
        setInterval(checkLeaderStatus, CFG.ELECTION_INTERVAL);
        
        // Bắt đầu election sau 3 giây (chờ nghe các gateway khác)
        setTimeout(startElection, 3000);
    });
}

function sendElectionHeartbeat(agentsMap) {
    const msg = JSON.stringify({
        type: 'gateway_election',
        gatewayId: GATEWAY_ID,
        hostname: os.hostname(),
        ip: getLanIP(),
        httpPort: CFG.HTTP_PORT,
        agentPort: CFG.AGENT_PORT,
        startTime: GATEWAY_START_TIME,
        isLeader: isLeader,
        agentCount: agentsMap ? agentsMap.size : 0
    });
    
    electionUdp.send(msg, 0, msg.length, CFG.GATEWAY_ELECTION_PORT, '255.255.255.255');
}

function checkLeaderStatus() {
    const now = Date.now();
    
    // Cleanup gateway không còn heartbeat
    otherGateways.forEach((gw, id) => {
        if (now - gw.lastSeen > CFG.LEADER_TIMEOUT) {
            console.log(`[Election] Gateway ${id} timed out`);
            otherGateways.delete(id);
            
            // Nếu leader timeout, bắt đầu election mới
            if (currentLeader === id) {
                console.log(`[Election] Leader timed out! Starting new election...`);
                currentLeader = null;
                startElection();
            }
        }
    });
}

function startElection() {
    // Tìm gateway khởi động sớm nhất (bao gồm cả chính mình)
    let oldestGateway = { id: GATEWAY_ID, startTime: GATEWAY_START_TIME };
    
    otherGateways.forEach((gw, id) => {
        if (gw.startTime < oldestGateway.startTime) {
            oldestGateway = { id, startTime: gw.startTime };
        }
    });
    
    console.log(`[Election] Oldest gateway: ${oldestGateway.id} (started: ${new Date(oldestGateway.startTime).toLocaleTimeString()})`);
    
    if (oldestGateway.id === GATEWAY_ID) {
        becomeLeader();
    } else {
        console.log(`[Election] Yielding to older gateway: ${oldestGateway.id}`);
        becomeFollower(oldestGateway.id);
    }
}

function becomeLeader() {
    if (isLeader) return;
    
    isLeader = true;
    currentLeader = GATEWAY_ID;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[Election] 👑 THIS GATEWAY IS NOW THE LEADER!`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Gọi callback nếu có (để start tunnel)
    if (onBecomeLeaderCallback && !tunnelStarted) {
        tunnelStarted = true;
        onBecomeLeaderCallback();
    }
}

function becomeFollower(leaderId) {
    // Cập nhật currentLeader dù có phải leader hay không
    currentLeader = leaderId;
    
    if (!isLeader) {
        // Đã là follower rồi, chỉ cập nhật leader mới
        console.log(`[Election] 📡 Current leader: ${leaderId}`);
        return;
    }
    
    isLeader = false;
    console.log(`\n[Election] 📡 Stepping down to FOLLOWER (Leader: ${leaderId})`);
    console.log(`[Election] This gateway is on STANDBY mode\n`);
}

module.exports = {
    GATEWAY_ID,
    getGatewayId,
    getIsLeader,
    getCurrentLeader,
    getOtherGateways,
    isTunnelStarted,
    setTunnelStarted,
    setOnBecomeLeader,
    initLeaderElection,
    sendElectionHeartbeat,
    checkLeaderStatus,
    startElection,
    becomeLeader,
    becomeFollower
};
