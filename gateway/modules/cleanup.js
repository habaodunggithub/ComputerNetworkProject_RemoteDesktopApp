// --- Module: Agent Cleanup ---
const { CFG } = require("./config");

let cleanupInterval = null;

function startCleanup(agents) {
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        agents.forEach((a, id) => {
            if (now - a.lastSeen > CFG.CLEANUP_MS) {
                if (a.socket) a.socket.destroy();
                agents.delete(id);
            }
        });
    }, CFG.CLEANUP_MS);
    
    return cleanupInterval;
}

function stopCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

module.exports = { startCleanup, stopCleanup };
