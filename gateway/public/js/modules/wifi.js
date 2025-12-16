// =================================================================
// MODULE: WIFI MANAGER
// Xử lý logic quét, hiển thị và copy mật khẩu Wifi
// =================================================================

import { $ } from '../core/utils.js';
import { sendWsMessage, isWsConnected } from '../core/websocket.js';

/**
 * Khởi tạo các sự kiện lắng nghe cho module Wifi
 * (Được gọi 1 lần khi ứng dụng khởi động)
 */
export function initWifiManager() {
    // 1. Sự kiện nút Scan
    const btnScanWifi = $('#btn-scan-wifi');
    if (btnScanWifi) {
        btnScanWifi.onclick = () => requestWifiScan();
    }

    // 2. Sự kiện nút Copy All
    const btnCopyAllWifi = $('#btn-copy-all-wifi');
    if (btnCopyAllWifi) {
        btnCopyAllWifi.onclick = () => {
            const cards = document.querySelectorAll('.wifi-card');
            if (cards.length === 0) return;
            
            let text = "=== WIFI PROFILES ===\n";
            cards.forEach(c => {
                const ssid = c.querySelector('.wifi-ssid').innerText;
                const pass = c.querySelector('.wifi-pass').innerText;
                text += `SSID: ${ssid} | Pass: ${pass}\n`;
            });

            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => alert("Copied all profiles!"));
            } else {
                alert("Clipboard API not supported");
            }
        };
    }
}

/**
 * Gửi lệnh yêu cầu quét Wifi qua WebSocket
 * Tự động hiển thị trạng thái Loading
 */
export function requestWifiScan() {
    if (!isWsConnected()) return;
    
    const grid = $('#wifi-grid');
    // Chỉ hiện loading nếu grid đang trống hoặc muốn refresh rõ ràng
    if (grid) {
        grid.innerHTML = '<div class="list-loading">Scanning networks...</div>';
    }
    
    sendWsMessage({ command: 'wifi_info' });
}

/**
 * Xử lý dữ liệu Wifi trả về từ Server và render lên UI
 * @param {Object} data - Dữ liệu JSON từ packet 'wifi_info'
 */
export function renderWifiData(data) {
    const grid = $('#wifi-grid');
    const badge = $('#wifi-current-badge');
    const badgeName = $('#wifi-current-name');

    if (!grid) return;

    // 1. Cập nhật Badge trên Header (Mạng đang kết nối)
    if (data.current) {
        if (badge) badge.classList.remove('hidden');
        if (badgeName) badgeName.textContent = data.current;
    } else {
        if (badge) badge.classList.add('hidden');
    }

    // 2. Xóa trạng thái loading cũ
    grid.innerHTML = '';

    // 3. Xử lý trường hợp không có dữ liệu
    if (!data.networks || data.networks.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i data-feather="slash"></i></div>
                <p>No WiFi profiles found</p>
            </div>`;
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    // 4. Sắp xếp: Mạng đang kết nối lên đầu
    data.networks.sort((a, b) => (b.connected === true) - (a.connected === true));

    // 5. Render từng Card
    data.networks.forEach(net => {
        const isConnected = net.connected;
        const card = document.createElement('div');
        card.className = `wifi-card ${isConnected ? 'is-current' : ''}`;
        
        // Xử lý hiển thị mật khẩu (nếu trống hoặc Absent)
        const passDisplay = net.password && net.password !== 'Absent' 
            ? net.password 
            : '<span style="color:var(--text-muted); font-style:italic">No Password</span>';
        
        // Escape SSID để tránh XSS đơn giản
        const safeSsid = net.ssid.replace(/"/g, '&quot;');
        const safePass = net.password ? net.password.replace(/'/g, "\\'") : "";

        card.innerHTML = `
            <div class="wifi-header">
                <div class="wifi-icon">
                    <i data-feather="${isConnected ? 'wifi' : 'rss'}"></i>
                </div>
                <div class="wifi-ssid" title="${safeSsid}">${net.ssid}</div>
            </div>
            <div class="wifi-details">
                <span class="wifi-label">Password</span>
                <div class="wifi-pass" onclick="navigator.clipboard.writeText('${safePass}')">${passDisplay}</div>
            </div>
            <button class="wifi-copy-btn" title="Copy Password" onclick="navigator.clipboard.writeText('${safePass}')">
                <i data-feather="copy" style="width:14px; height:14px;"></i>
            </button>
        `;
        grid.appendChild(card);
    });

    // Refresh icon
    if (typeof feather !== 'undefined') feather.replace();
}
