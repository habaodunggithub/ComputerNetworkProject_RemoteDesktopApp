// =================================================================
// MODULE: SCANNER (RADAR)
// Xử lý quét mạng LAN và hiển thị danh sách agent
// =================================================================

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';

export function renderScanList(data) {
    const container = $('#scan-list');
    if (data && data.length > 0) data.sort((a, b) => a.ip.localeCompare(b.ip));
    
    // Tránh render lại nếu dữ liệu không đổi
    const currentDataJson = JSON.stringify(data);
    if (currentDataJson === state.lastScanDataJson && container.innerHTML.trim() !== "") return;
    state.lastScanDataJson = currentDataJson;

    if (!data || data.length === 0) {
        container.innerHTML = `
        <div class="list-loading" style="grid-column: 1 / -1;">
            <div class="spinner" style="border-color: #06b6d4; border-top-color: transparent;"></div>
            <br><span style="color: #06b6d4; font-weight: 500;">Scanning Radar Active...</span>
            <br><small style="opacity:0.7">Looking for agents on port 9102</small>
        </div>`;
        return;
    }

    container.innerHTML = data.map(agent => {
        const isSelected = agent.agentId === state.currentAgentId;
        const selectedClass = isSelected ? 'selected-agent' : '';

        return `
        <div class="device-card ${selectedClass}" data-os="${agent.os}" data-agent-id="${agent.agentId}" onclick="selectAgent('${agent.agentId}', '${agent.hostname}')">
            <div class="device-status" title="Online"></div>
            <div class="device-info"><span class="device-hostname" title="${agent.hostname}">${agent.hostname}</span><span class="device-ip">${agent.agentId || agent.ip}</span></div>
        </div>`;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}