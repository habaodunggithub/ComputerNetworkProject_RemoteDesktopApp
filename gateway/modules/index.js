// --- Module Index ---
// Export all modules for easy access

module.exports = {
    config: require('./config'),
    utils: require('./utils'),
    decryption: require('./decryption'),
    election: require('./election'),
    beacon: require('./beacon'),
    tunnel: require('./tunnel'),
    tcpServer: require('./tcpServer'),
    wsServer: require('./wsServer'),
    httpRoutes: require('./httpRoutes'),
    cleanup: require('./cleanup'),
    auth: require('./auth')
};
