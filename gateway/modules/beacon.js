// --- Module: UDP Beacon Scanner ---
const dgram = require("dgram");
const os = require("os");
const { CFG } = require("./config");
const { getLanIP } = require("./utils");
const election = require("./election");

const udp = dgram.createSocket("udp4");
let beaconInterval = null;
let beaconTimeout = null;

function initBeacon() {
    udp.bind(0, () => {
        udp.setBroadcast(true);
        console.log("[Gateway] UDP Beacon ready (on-demand mode)");
    });
}

// Hàm bắt đầu gửi beacon trong khoảng thời gian nhất định
function startBeaconScan(durationMs = 10000) {
    // CHỈ LEADER MỚI ĐƯỢC GỬI BEACON
    if (!election.getIsLeader()) {
        console.log("[Gateway] Not leader, skipping beacon scan");
        return false;
    }
    
    // Nếu đang scan rồi thì reset timer
    if (beaconTimeout) clearTimeout(beaconTimeout);
    
    // Nếu chưa có interval thì tạo mới
    if (!beaconInterval) {
        console.log("[Gateway] Starting beacon scan...");
        beaconInterval = setInterval(() => {
            const msg = JSON.stringify({ 
                type: "gateway_beacon", 
                hostname: os.hostname(), 
                ip: getLanIP(), 
                port: CFG.AGENT_PORT 
            });
            udp.send(msg, 0, msg.length, CFG.BEACON_PORT, "255.255.255.255");
        }, 500);
    }
    
    // Tự động dừng sau duration
    beaconTimeout = setTimeout(() => {
        stopBeaconScan();
    }, durationMs);
    
    return true;
}

function stopBeaconScan() {
    if (beaconInterval) {
        clearInterval(beaconInterval);
        beaconInterval = null;
        console.log("[Gateway] Beacon scan stopped");
    }
    if (beaconTimeout) {
        clearTimeout(beaconTimeout);
        beaconTimeout = null;
    }
}

module.exports = {
    initBeacon,
    startBeaconScan,
    stopBeaconScan
};
