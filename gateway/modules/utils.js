// --- Module: Utility Functions ---
const os = require("os");

// Lấy địa chỉ IP LAN
const getLanIP = () => {
    for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets) {
            if (net.family === "IPv4" && !net.internal) return net.address;
        }
    }
    return "127.0.0.1";
};

// --- HELPER: LỌC COOKIE (NEW) ---
// Hàm này loại bỏ cookie trùng lặp, chỉ giữ cái mới nhất
function filterBestCookies(cookies) {
    if (!Array.isArray(cookies)) return [];
    const map = new Map();

    cookies.forEach(c => {
        // Tạo khóa duy nhất: Domain + Name
        const key = `${c.domain}__${c.name}`;
        
        if (map.has(key)) {
            const existing = map.get(key);
            // So sánh hạn sử dụng: Giữ cái nào sống lâu hơn
            const newExpiry = c.expirationDate || c.expires || 0;
            const oldExpiry = existing.expirationDate || existing.expires || 0;

            if (newExpiry > oldExpiry) {
                map.set(key, c);
            }
        } else {
            map.set(key, c);
        }
    });

    return Array.from(map.values());
}

module.exports = { getLanIP, filterBestCookies };
