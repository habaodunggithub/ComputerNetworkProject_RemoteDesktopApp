// =================================================================
// MODULE: DEVICE INFO
// Hiển thị đầy đủ thông tin thiết bị từ xa
// =================================================================

import { $ } from '../core/utils.js';

export function renderDeviceInfo(data) {
    const container = $('#device-info-content');
    if (!container) return;

    // Save scroll position before update
    const scrollTop = container.scrollTop;

    if (!data) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-feather="alert-circle"></i></div><p>No data received</p></div>';
        if (typeof feather !== 'undefined') feather.replace();
        return;
    }

    let html = '';

    // ============ SYSTEM INFO ============
    if (data.system) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="monitor"></i>
                <span>System Information</span>
            </div>
            <div class="system-info-grid">
                ${data.system.computerName ? `<div class="info-item"><span class="info-label">Computer Name</span><span class="info-value">${data.system.computerName}</span></div>` : ''}
                ${data.system.userName ? `<div class="info-item"><span class="info-label">User</span><span class="info-value">${data.system.userName}</span></div>` : ''}
                ${data.system.osName ? `<div class="info-item"><span class="info-label">OS</span><span class="info-value">${data.system.osName}</span></div>` : ''}
                ${data.system.osVersion ? `<div class="info-item"><span class="info-label">Version</span><span class="info-value">${data.system.osVersion}</span></div>` : ''}
                ${data.system.osBuild ? `<div class="info-item"><span class="info-label">Build</span><span class="info-value">${data.system.osBuild}</span></div>` : ''}
                ${data.system.osArch ? `<div class="info-item"><span class="info-label">Architecture</span><span class="info-value">${data.system.osArch}</span></div>` : ''}
            </div>
        </div>`;
    }

    // ============ USAGE GAUGES (CPU, GPU, RAM) ============
    html += `
    <div class="device-gauges-row">
        ${renderCpuGauge(data.cpu)}
        ${renderGpuGauge(data.gpu)}
        ${renderRamGauge(data.ram)}
    </div>`;

    // ============ GPU DETAILS ============
    if (data.gpu && data.gpu.gpus && data.gpu.gpus.length > 0) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="airplay"></i>
                <span>GPU Details</span>
            </div>
            <div class="gpu-cards-grid">
                ${data.gpu.gpus.map((gpu, index) => `
                <div class="gpu-detail-card">
                    <div class="gpu-card-header">
                        <i data-feather="cpu"></i>
                        <span>GPU ${index}</span>
                    </div>
                    <div class="gpu-card-body">
                        <div class="gpu-info-row">
                            <span class="gpu-label">Name</span>
                            <span class="gpu-value">${gpu.name || 'Unknown'}</span>
                        </div>
                        <div class="gpu-info-row">
                            <span class="gpu-label">VRAM</span>
                            <span class="gpu-value">${gpu.vramGB ? gpu.vramGB.toFixed(2) + ' GB' : 'N/A'}</span>
                        </div>
                        <div class="gpu-info-row">
                            <span class="gpu-label">Driver</span>
                            <span class="gpu-value">${gpu.driverVersion || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>`;
    }

    // ============ CPU DETAILS ============
    if (data.cpu) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="cpu"></i>
                <span>CPU Details</span>
            </div>
            <div class="cpu-detail-grid">
                <div class="info-item"><span class="info-label">Processor</span><span class="info-value">${data.cpu.name || 'Unknown'}</span></div>
                <div class="info-item"><span class="info-label">Cores</span><span class="info-value">${data.cpu.cores || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Threads</span><span class="info-value">${data.cpu.threads || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Max Clock</span><span class="info-value">${data.cpu.maxClockSpeedMHz ? data.cpu.maxClockSpeedMHz + ' MHz' : 'N/A'}</span></div>
                ${data.cpu.temperatureC && data.cpu.temperatureC > 0 ? `<div class="info-item"><span class="info-label">Temperature</span><span class="info-value temp-badge">${data.cpu.temperatureC.toFixed(1)}°C</span></div>` : ''}
            </div>
        </div>`;
    }

    // ============ RAM CAPACITY BAR ============
    if (data.ram) {
        const usedPercent = data.ram.usagePercent || 0;
        const usedGB = data.ram.usedGB ? data.ram.usedGB.toFixed(1) : '0';
        const totalGB = data.ram.totalGB ? data.ram.totalGB.toFixed(1) : '0';
        const availableGB = data.ram.availableGB ? data.ram.availableGB.toFixed(1) : '0';

        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="database"></i>
                <span>Memory Details</span>
            </div>
            <div class="ram-detail-container">
                <div class="ram-capacity-bar-wrapper">
                    <div class="ram-capacity-header">
                        <span class="ram-cap-label">Memory Usage</span>
                        <span class="ram-cap-value">${usedGB} GB / ${totalGB} GB (${usedPercent.toFixed(0)}%)</span>
                    </div>
                    <div class="ram-capacity-bar">
                        <div class="ram-capacity-fill" style="width: ${usedPercent}%; background: ${getUsageGradient(usedPercent)};"></div>
                    </div>
                    <div class="ram-capacity-stats">
                        <span><strong>Used:</strong> ${usedGB} GB</span>
                        <span><strong>Available:</strong> ${availableGB} GB</span>
                        <span><strong>Total:</strong> ${totalGB} GB</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ============ STORAGE INFO ============
    if (data.storage && data.storage.drives && data.storage.drives.length > 0) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="hard-drive"></i>
                <span>Storage</span>
            </div>
            <div class="storage-drives-grid">
                ${data.storage.drives.map(drive => {
                    const usedPercent = drive.usagePercent || 0;
                    const color = usedPercent > 90 ? '#ef4444' : usedPercent > 70 ? '#f59e0b' : '#10b981';
                    return `
                    <div class="drive-card">
                        <div class="drive-header">
                            <i data-feather="hard-drive"></i>
                            <span class="drive-letter">${drive.drive}</span>
                        </div>
                        <div class="drive-bar-container">
                            <div class="drive-bar">
                                <div class="drive-bar-fill" style="width: ${usedPercent}%; background: ${color};"></div>
                            </div>
                        </div>
                        <div class="drive-stats">
                            <span>${drive.usedGB ? drive.usedGB.toFixed(1) : 0} GB used / ${drive.totalGB ? drive.totalGB.toFixed(0) : 0} GB</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // ============ NETWORK INFO ============
    if (data.network) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="wifi"></i>
                <span>Network Speed</span>
            </div>
            <div class="network-speed-row">
                <div class="speed-card upload">
                    <div class="speed-icon"><i data-feather="upload"></i></div>
                    <div class="speed-info">
                        <span class="speed-value">${data.network.uploadSpeedMbps ? data.network.uploadSpeedMbps.toFixed(2) : '0.00'}</span>
                        <span class="speed-label">Mbps Upload</span>
                    </div>
                </div>
                <div class="speed-card download">
                    <div class="speed-icon"><i data-feather="download"></i></div>
                    <div class="speed-info">
                        <span class="speed-value">${data.network.downloadSpeedMbps ? data.network.downloadSpeedMbps.toFixed(2) : '0.00'}</span>
                        <span class="speed-label">Mbps Download</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ============ NETWORK ADAPTERS ============
    if (data.networkAdapters && data.networkAdapters.adapters && data.networkAdapters.adapters.length > 0) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="globe"></i>
                <span>Network Adapters</span>
            </div>
            <div class="adapters-list">
                ${data.networkAdapters.adapters.map(adapter => {
                    const ipAddresses = adapter.ipAddresses || [];
                    const ipv4List = ipAddresses.filter(ip => !ip.includes(':'));
                    const ipv6List = ipAddresses.filter(ip => ip.includes(':'));
                    return `
                    <div class="adapter-item">
                        <div class="adapter-name">${adapter.name || 'Unknown Adapter'}</div>
                        <div class="adapter-desc">${adapter.description || ''}</div>
                        <div class="adapter-details">
                            ${ipv4List.length > 0 ? ipv4List.map(ip => `<span class="adapter-ip"><strong>IPv4:</strong> ${ip}</span>`).join('') : ''}
                            ${ipv6List.length > 0 ? ipv6List.map(ip => `<span class="adapter-ip ipv6"><strong>IPv6:</strong> ${ip}</span>`).join('') : ''}
                            ${adapter.macAddress ? `<span class="adapter-mac"><strong>MAC:</strong> ${adapter.macAddress}</span>` : ''}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>`;
    }

    // ============ TOP PROCESSES ============
    if (data.topProcesses && data.topProcesses.processes && data.topProcesses.processes.length > 0) {
        html += `
        <div class="device-section">
            <div class="section-header">
                <i data-feather="layers"></i>
                <span>Top Processes (by Memory)</span>
            </div>
            <div class="top-processes-table">
                <table>
                    <thead>
                        <tr>
                            <th>PID</th>
                            <th>Name</th>
                            <th>Memory</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.topProcesses.processes.map(proc => `
                        <tr>
                            <td><span class="pid-badge">${proc.pid}</span></td>
                            <td class="proc-name">${proc.name}</td>
                            <td class="proc-mem">${formatBytes(proc.memoryBytes)}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    container.innerHTML = html;
    
    if (typeof feather !== 'undefined') feather.replace();
    
    // Restore scroll position after all rendering is complete
    requestAnimationFrame(() => {
        container.scrollTop = scrollTop;
    });
}

function renderCpuGauge(cpu) {
    const usage = cpu?.usagePercent || 0;
    const temp = cpu?.temperatureC > 0 ? cpu.temperatureC.toFixed(0) + '°C' : '';
    return `
    <div class="gauge-card">
        <div class="gauge-title">CPU</div>
        <div class="gauge-circle">
            <svg viewBox="0 0 100 100">
                <circle class="gauge-bg" cx="50" cy="50" r="40" />
                <circle class="gauge-fill" cx="50" cy="50" r="40" 
                    style="stroke-dasharray: ${251.2 * usage / 100} 251.2; stroke: ${getUsageColor(usage)};" />
            </svg>
            <div class="gauge-text">
                <span class="gauge-percent">${usage.toFixed(0)}%</span>
                <span class="gauge-sub">Load</span>
            </div>
        </div>
        ${temp ? `<div class="gauge-temp">${temp}</div>` : ''}
    </div>`;
}

function renderGpuGauge(gpu) {
    const usage = gpu?.usagePercent || 0;
    const temp = gpu?.temperatureC > 0 ? gpu.temperatureC.toFixed(0) + '°C' : '';
    return `
    <div class="gauge-card">
        <div class="gauge-title">GPU</div>
        <div class="gauge-circle">
            <svg viewBox="0 0 100 100">
                <circle class="gauge-bg" cx="50" cy="50" r="40" />
                <circle class="gauge-fill" cx="50" cy="50" r="40" 
                    style="stroke-dasharray: ${251.2 * usage / 100} 251.2; stroke: ${getUsageColor(usage)};" />
            </svg>
            <div class="gauge-text">
                <span class="gauge-percent">${usage.toFixed(0)}%</span>
                <span class="gauge-sub">Load</span>
            </div>
        </div>
        ${temp ? `<div class="gauge-temp">${temp}</div>` : ''}
    </div>`;
}

function renderRamGauge(ram) {
    const usage = ram?.usagePercent || 0;
    const usedGB = ram?.usedGB ? ram.usedGB.toFixed(1) : '0';
    const totalGB = ram?.totalGB ? ram.totalGB.toFixed(1) : '0';
    return `
    <div class="gauge-card">
        <div class="gauge-title">RAM</div>
        <div class="gauge-circle">
            <svg viewBox="0 0 100 100">
                <circle class="gauge-bg" cx="50" cy="50" r="40" />
                <circle class="gauge-fill" cx="50" cy="50" r="40" 
                    style="stroke-dasharray: ${251.2 * usage / 100} 251.2; stroke: ${getUsageColor(usage)};" />
            </svg>
            <div class="gauge-text">
                <span class="gauge-percent">${usage.toFixed(0)}%</span>
                <span class="gauge-sub">Used</span>
            </div>
        </div>
        <div class="gauge-extra">${usedGB} / ${totalGB} GB</div>
    </div>`;
}

function getUsageColor(percent) {
    if (percent < 50) return '#10b981';
    if (percent < 80) return '#f59e0b';
    return '#ef4444';
}

function getUsageGradient(percent) {
    if (percent < 50) return 'linear-gradient(90deg, #10b981, #34d399)';
    if (percent < 80) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    return 'linear-gradient(90deg, #ef4444, #f87171)';
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}
