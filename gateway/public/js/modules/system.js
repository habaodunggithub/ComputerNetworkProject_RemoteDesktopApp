// =================================================================
// MODULE: SYSTEM
// Quản lý Processes và Applications
// =================================================================

import { $ } from '../core/utils.js';

export function renderProcessTable(data) {
    const tbody = $('#processes-table tbody');
    if (!tbody) return;
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="4">No data.</td></tr>';
        return;
    }
    const fmt = new Intl.NumberFormat('en-US');
    tbody.innerHTML = data.map(p => `
    <tr><td><span class="status-pill" style="background:rgba(0,0,0,0.05);color:var(--text-main)">${p.pid}</span></td>
    <td>${p.name}</td><td>${p.workingSet ? fmt.format(p.workingSet) + ' B' : 'N/A'}</td>
    <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-proc" data-pid="${p.pid}">Stop</button></td></tr>`).join('');
}

export function renderAppTable(data) {
    const tbody = $('#apps-table tbody');
    if (!tbody) return;
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="3">No data.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(a => `
    <tr><td style="font-weight:500">${a.name}</td><td>${a.process_count}</td>
    <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-app" data-name="${a.name}">End Task</button></td></tr>`).join('');
}

export function renderStopProcList(data) {
    const container = $('#stop-proc-list');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="list-loading">No processes found.</div>';
        return;
    }
    const displayData = data.slice(0, 100);
    container.innerHTML = displayData.map(proc => `
    <div class="list-item">
    <div class="item-info">
    <span class="item-name">${proc.name}</span>
    <span class="item-sub">PID: ${proc.pid} | RAM: ${(proc.workingSet / 1024 / 1024).toFixed(1)} MB</span>
    </div>
    <button class="btn-kill-sm" onclick="requestStopProc(${proc.pid})" title="Kill PID ${proc.pid}"><i data-feather="x"></i></button>
    </div>`).join('');
    if (data.length > 100) container.innerHTML += `<div class="list-loading" style="font-size:11px">...and ${data.length - 100} more processes</div>`;
    if (typeof feather !== 'undefined') feather.replace();
}

export function renderStopAppList(data) {
    const container = $('#stop-app-list');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="list-loading">No running apps found.</div>';
        return;
    }
    container.innerHTML = data.map(app => `
    <div class="list-item">
    <div class="item-info">
    <span class="item-name">${app.name}</span>
    <span class="item-sub">${app.process_count} process(es)</span>
    </div>
    <button class="btn-kill-sm" onclick="requestStopApp('${app.name}')" title="Stop App"><i data-feather="power"></i></button>
    </div>`).join('');
    if (typeof feather !== 'undefined') feather.replace();
}