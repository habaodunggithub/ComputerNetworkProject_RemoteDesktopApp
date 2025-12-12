document.addEventListener('DOMContentLoaded', () => {
    // --- CẤU HÌNH ---
    let ws;
    let currentView = 'applications';
    let lastLoggedKeyCode = null;
    let currentVideoBlob = null;
    let isKeylogClean = true;
    let scanInterval = null; // Biến quản lý vòng lặp quét mạng
    let currentAgentId = null; // Agent hiện đang được chọn
    let currentPath = "C:\\";

    // --- BỘ CHỌN DOM ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // Elements
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

    // Connection
    const statusPill = $('#status-pill');
    const statusText = $('#status-pill .status-text');
    const wsUrlInput = $('#ws-url-input');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
    const btnScanLan = $('#btn-scan-lan');

    // Capture
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

    // Keylogger
    const keylogToggle = $('#keylog-toggle');
    const keylogOutput = $('#keylog-output');
    const btnClearKeylog = $('#btn-clear-keylog');

    const btnStartWebcamStream = $('#btn-start-webcam-stream');
    const btnStopWebcamStream = $('#btn-stop-webcam-stream');
    const webcamStreamImg = $('#webcam-stream-img');

    // System & Nav
    const sidebar = $('#sidebar');
    const themeToggle = $('#theme-toggle');
    const bodyEl = document.body;

    // --- MODAL HELPERS ---
    const modalConfirm = $('#modal-confirm');
    const confirmTitle = $('#confirm-title');
    const confirmMsg = $('#confirm-message');
    const btnConfirmYes = $('#btn-confirm-yes');
    let confirmCallback = null;

    function showConfirmModal(title, msg, type, callback) {
        confirmTitle.textContent = title;
        confirmMsg.textContent = msg;
        confirmCallback = callback;
        const iconBox = $('#confirm-icon-box');
        if (iconBox) iconBox.className = 'icon-box ' + (type === 'danger' ? 'red' : 'blue');
        modalConfirm.classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    if (btnConfirmYes) {
        btnConfirmYes.onclick = () => {
            if (confirmCallback) confirmCallback();
            handleCloseModal();
        };
    }

    function showModal(id) {
        $(`#${id}`).classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    function hideAllModals() {
        $$('.modal').forEach(m => m.classList.add('hidden'));
        $('#modal-backdrop').classList.add('hidden');
    }

    // Logic đóng modal chung + Dừng quét mạng
    const handleCloseModal = () => {
        hideAllModals();
        stopScanning(); // Dừng polling khi đóng modal
    };

    // --- LOGIC QUÉT MẠNG LAN (HTTP API + POLLING) ---
    const fetchScanList = async() => {
        try {
            // Gọi về chính server đang phục vụ trang web này
            const apiUrl = `${location.protocol}//${location.host}/api/scan`;
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error("Network response was not ok");
            const result = await response.json();
            renderScanList(result.data);
        } catch (error) {
            console.error("Scan error:", error);
            // Không báo lỗi ra UI liên tục để tránh phiền
        }
    };

    const stopScanning = () => {
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }

        if (btnScanLan) btnScanLan.classList.remove('active-scan');
    };

    // --- CONNECTION STATE ---
    function setConnectedState(isConnected, agentName = null) {
        if (isConnected) {
            statusPill.classList.remove('disconnected');
            statusPill.classList.add('connected');
            if (statusText) {
                if (agentName) {
                    statusText.textContent = `Connected: ${agentName}`;
                } else if (currentAgentId) {
                    statusText.textContent = `Connected: ${currentAgentId}`;
                } else {
                    statusText.textContent = 'Connected';
                }
            }
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

    // --- WEBSOCKET ---
    function connectWs() {
        const url = wsUrlInput.value;
        if (!url) return alert('Enter WebSocket URL');
        console.log("Connecting to:", url);

        try {
            ws = new WebSocket(url);
        } catch (e) {
            return alert("Invalid URL");
        }

        ws.onopen = () => {
            setConnectedState(true, currentAgentId);
            // Chỉ load data nếu đã có agent được chọn
            if (currentAgentId) {
                loadDataForView(currentView);
            }
        };
        ws.onclose = () => {
            setConnectedState(false);
            ws = null;
            if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
            if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
            if (keylogOutput) keylogOutput.textContent = 'System ready. Waiting...';
            if (keylogToggle) keylogToggle.checked = false;
            lastLoggedKeyCode = null;
        };
        ws.onerror = (e) => alert('Connection failed');
        ws.onmessage = onWsMessage;
    }

    function disconnectWs() { if (ws) ws.close(); }

    function performLogout() {
        // 1. Xóa session
        sessionStorage.removeItem('rcc_user'); 
        
        // 2. Ngắt kết nối socket nếu đang chạy
        disconnectWs(); 
        
        // 3. Reload lại trang (sẽ tự hiện lại bảng Login do mất session)
        location.reload(); 
    }

    function sendWsMessage(payload) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            // Thêm agentId vào mọi command nếu đã chọn agent
            if (currentAgentId) {
                payload.agentId = currentAgentId;
            } else {
                alert('Please select an agent first (click Scan button)');
                return;
            }
            ws.send(JSON.stringify(payload));
        }
        else alert('Not connected.');
    }

    // --- MAIN MESSAGE HANDLER ---
    function onWsMessage(event) {
        const msg = JSON.parse(event.data);

        const modalAppEl = document.getElementById('modal-stop-app');
        const modalProcEl = document.getElementById('modal-stop-proc');

        const isStopAppOpen = modalAppEl && !modalAppEl.classList.contains('hidden');
        const isStopProcOpen = modalProcEl && !modalProcEl.classList.contains('hidden');

        switch (msg.type) {
            case 'process_list':
                if (isStopProcOpen) {
                    renderStopProcList(msg.data);
                } else {
                    renderProcessTable(msg.data);
                }
                break;

            case 'application_list':
                if (isStopAppOpen) {
                    renderStopAppList(msg.data);
                } else {
                    renderAppTable(msg.data);
                }
                break;

            case 'screenshot':
                captureSpinner.classList.add('hidden');

                streamImg.classList.add('hidden');
                streamImg.src = "";
                capturePlaceholder.parentElement.classList.add('hidden');

                captureImg.src = `data:image/png;base64,${msg.data}`;
                captureImg.classList.remove('hidden');

                btnCopyScreenshot.classList.remove('hidden');
                btnSaveScreenshot.classList.remove('hidden');
                break;

            case 'screen_frame':
                if (btnStartStream.classList.contains('hidden')) {
                    const captureEmptyState = $('#capture-display-area .empty-state');
                    captureEmptyState.classList.add('hidden');

                    captureImg.classList.add('hidden');

                    streamImg.classList.remove('hidden');
                    streamImg.src = "data:image/jpeg;base64," + msg.data;
                }
                break;

            case 'webcam_recording_status':
                handleWebcamStatus(msg);
                break;
            case 'webcam_video':
                handleWebcamVideo(msg.data);
                break;
            case 'webcam_frame':
                if (btnStartWebcamStream.classList.contains('hidden')) {
                    $('#webcam-display-area .empty-state').classList.add('hidden');

                    webcamVideoOutput.classList.add('hidden');

                    webcamStreamImg.classList.remove('hidden');
                    webcamStreamImg.src = "data:image/jpeg;base64," + msg.data;
                }
                break;

            case 'key_event':
                handleKeyEvent(msg.key_code);
                break;

            case 'status':
                if (currentView === 'files') {
                    unlockFileUI(); // Mở khóa khi gặp lỗi
                }    

                if (msg.success) {
                    if (isStopAppOpen) sendWsMessage({ command: 'list_applications' });
                    if (isStopProcOpen) sendWsMessage({ command: 'list_processes' });

                    if (currentView.includes('process')) sendWsMessage({ command: 'list_processes' });
                    if (currentView.includes('app')) sendWsMessage({ command: 'list_applications' });
                    if (currentView === 'files') {
                        sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' });
                    }
                } else {
                    if (currentView === 'files') {
                        const grid = document.getElementById('file-grid');
                        if (grid) {
                            grid.style.opacity = '1';
                            grid.style.pointerEvents = 'auto';
                        }
                    }

                    if (msg.message === 'capture failed') {
                        captureSpinner.classList.add('hidden');
                        capturePlaceholder.parentElement.classList.remove('hidden');
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
                if (msg.success) {
                    downloadBase64File(msg.data, msg.name);
                } else {
                    alert("Download failed!");
                }
                break;
        }
    }

    // --- RENDERERS ---
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

    // --- RENDER MODAL LISTS ---
    function renderStopAppList(data) {
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
                <button class="btn-kill-sm" onclick="requestStopApp('${app.name}')" title="Stop App">
                    <i data-feather="power"></i>
                </button>
            </div>
        `).join('');

        if (typeof feather !== 'undefined') feather.replace();
    }

    function renderStopProcList(data) {
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
                    <span class="item-sub">PID: ${proc.pid} | RAM: ${(proc.workingSet/1024/1024).toFixed(1)} MB</span>
                </div>
                <button class="btn-kill-sm" onclick="requestStopProc(${proc.pid})" title="Kill PID ${proc.pid}">
                    <i data-feather="x"></i>
                </button>
            </div>
        `).join('');

        if (data.length > 100) {
            container.innerHTML += `<div class="list-loading" style="font-size:11px">...and ${data.length - 100} more processes</div>`;
        }

        if (typeof feather !== 'undefined') feather.replace();
    }

    // --- RENDER SCAN LIST ---
    // Biến lưu trữ dữ liệu lần quét trước
    let lastScanDataJson = "";

    // --- RENDER SCAN LIST ---
    function renderScanList(data) {
        const container = $('#scan-list');

        // Sắp xếp data theo IP hoặc Hostname để đảm bảo thứ tự nhất quán
        if (data && data.length > 0) {
            data.sort((a, b) => a.ip.localeCompare(b.ip));
        }

        // Nếu dữ liệu y hệt lần trước thì KHÔNG làm gì cả (giữ nguyên DOM và trạng thái Hover)
        const currentDataJson = JSON.stringify(data);
        if (currentDataJson === lastScanDataJson && container.innerHTML.trim() !== "") {
            return;
        }
        lastScanDataJson = currentDataJson; // Cập nhật dữ liệu mới

        // 2. Xử lý hiển thị
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="list-loading" style="grid-column: 1 / -1;">
                    <div class="spinner" style="border-color: #06b6d4; border-top-color: transparent;"></div>
                    <br>
                    <span style="color: #06b6d4; font-weight: 500;">Scanning Radar Active...</span>
                    <br><small style="opacity:0.7">Looking for agents on port 9102</small>
                </div>`;
            return;
        }

        container.innerHTML = data.map(agent => {
            let iconName = 'monitor';
            if (agent.os.includes('Windows')) iconName = 'layout';
            else if (agent.os.includes('Linux')) iconName = 'terminal';
            
            // Highlight agent hiện tại đang chọn
            const isSelected = agent.agentId === currentAgentId;
            const selectedClass = isSelected ? 'selected-agent' : '';

            return `
            <div class="device-card ${selectedClass}" data-os="${agent.os}" data-agent-id="${agent.agentId}" onclick="selectAgent('${agent.agentId}', '${agent.hostname}')">
                <div class="device-status" title="Online"></div>
                
                <button class="btn-connect-action" title="${isSelected ? 'Selected' : 'Select Agent'}">
                    <i data-feather="${isSelected ? 'check' : 'zap'}" style="width:18px; height:18px; fill:currentColor;"></i>
                </button>

                <div class="device-icon-large">
                    <i data-feather="${iconName}"></i>
                </div>
                
                <div class="device-info">
                    <span class="device-hostname" title="${agent.hostname}">${agent.hostname}</span>
                    <span class="device-ip">${agent.agentId || agent.ip}</span>
                </div>
            </div>
            `;
        }).join('');

        if (typeof feather !== 'undefined') feather.replace();
    }

    // Global function để chọn agent
    window.selectAgent = (agentId, hostname) => {
        currentAgentId = agentId;
        console.log('[App] Selected agent:', agentId, hostname);
        
        // Tự động kết nối WebSocket
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${location.host}/ws`;
        wsUrlInput.value = url;
        
        // Đóng modal scan
        handleCloseModal();
        
        // Ngắt kết nối cũ nếu có
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        
        // Kết nối mới
        setTimeout(() => {
            try {
                ws = new WebSocket(url);
                
                ws.onopen = () => {
                    setConnectedState(true, hostname);
                    loadDataForView(currentView);
                };
                
                ws.onclose = () => {
                    setConnectedState(false);
                    ws = null;
                    if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
                    if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
                    if (keylogOutput) keylogOutput.textContent = 'System ready. Waiting...';
                    if (keylogToggle) keylogToggle.checked = false;
                    lastLoggedKeyCode = null;
                };
                
                ws.onerror = (e) => alert('Connection failed');
                ws.onmessage = onWsMessage;
            } catch (e) {
                alert('Failed to connect to agent');
            }
        }, 300);
    };

    window.requestStopApp = (name) => {
        if (confirm(`Force stop "${name}"?`)) {
            sendWsMessage({ command: 'stop_application', app_name: name });
        }
    };

    window.requestStopProc = (pid) => {
        if (confirm(`Kill process PID ${pid}?`)) {
            sendWsMessage({ command: 'stop_process_pid', pid: parseInt(pid) });
        }
    };

    // --- KEYLOGGER ---
    function handleKeyEvent(keyCode) {
        if (keyCode === 231) return;

        const el = $('#keylog-output');

        if (isKeylogClean) {
            el.textContent = '';
            isKeylogClean = false;
        }

        function translateKeyCode(code) {
            if (code == 8) return;
            if (code >= 65 && code <= 90) return String.fromCharCode(code);
            if (code >= 48 && code <= 57) return String.fromCharCode(code);
            if (code >= 96 && code <= 105) return `[Num ${code - 96}]`;
            switch (code) {
                case 9:
                    return '[Tab]';
                case 13:
                    return '[Enter]\n';
                case 19:
                    return '[Pause]';
                case 20:
                    return '[CapsLk]';
                case 27:
                    return '[Esc]';
                case 32:
                    return '[Space]';
                case 33:
                    return '[PgUp]';
                case 34:
                    return '[PgDn]';
                case 35:
                    return '[End]';
                case 36:
                    return '[Home]';
                case 37:
                    return '[Left]';
                case 38:
                    return '[Up]';
                case 39:
                    return '[Right]';
                case 40:
                    return '[Down]';
                case 44:
                    return '[PrtSc]';
                case 45:
                    return '[Insert]';
                case 46:
                    return '[Delete]';
                case 91:
                    return '[LWin]';
                case 92:
                    return '[RWin]';
                case 93:
                    return '[Menu]';
                case 106:
                    return '[Num *]';
                case 107:
                    return '[Num +]';
                case 109:
                    return '[Num -]';
                case 110:
                    return '[Num .]';
                case 111:
                    return '[Num /]';
                case 144:
                    return '[NumLock]';
                case 112:
                    return '[F1]';
                case 113:
                    return '[F2]';
                case 114:
                    return '[F3]';
                case 115:
                    return '[F4]';
                case 116:
                    return '[F5]';
                case 117:
                    return '[F6]';
                case 118:
                    return '[F7]';
                case 119:
                    return '[F8]';
                case 120:
                    return '[F9]';
                case 121:
                    return '[F10]';
                case 122:
                    return '[F11]';
                case 123:
                    return '[F12]';
                case 160:
                    return '[LShift]';
                case 161:
                    return '[RShift]';
                case 162:
                case 163:
                    return '[LCtrl]';
                case 164:
                    return '[LAlt]';
                case 165:
                    return '[RAlt]';
                case 186:
                    return ';';
                case 187:
                    return '=';
                case 188:
                    return ',';
                case 189:
                    return '-';
                case 190:
                    return '.';
                case 191:
                    return '/';
                case 192:
                    return '`';
                case 219:
                    return '[';
                case 220:
                    return '\\';
                case 221:
                    return ']';
                case 222:
                    return "'";
                default:
                    return `[${code}]`;
            }
        }

        const char = translateKeyCode(keyCode);
        if (char) {
            el.textContent += char;
            el.scrollTop = el.scrollHeight;
        }
    }

    // --- WEBCAM ---
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
            btnStartWebcamStream.classList.remove('hidden');
            webcamSpinner.classList.add('hidden');
            webcamPlaceholder.parentElement.classList.remove('hidden');
            webcamPlaceholder.textContent = 'Processing...';
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
            const chars = atob(b64),
                bytes = new Uint8Array(chars.length);
            for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);

            if (currentVideoBlob) URL.revokeObjectURL(currentVideoBlob.src);
            currentVideoBlob = new Blob([bytes], { type: 'video/mp4' });

            webcamVideoOutput.src = URL.createObjectURL(currentVideoBlob);
            webcamVideoOutput.classList.remove('hidden');

            btnStartRecord.classList.remove('hidden');
            btnStopRecord.classList.add('hidden');
            btnSaveVideo.classList.remove('hidden');
            btnStartWebcamStream.classList.remove('hidden');

        } catch (e) {
            console.error(e);
            alert("Video error");
        }
    }

    // --- NAVIGATION ---
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
        if (id === 'processes-table') {
            sendWsMessage({ command: 'list_processes' });
        } else if (id === 'applications-table') {
            sendWsMessage({ command: 'list_applications' });
        } else if (id === 'files') {
            // [MỚI] Tự động tải danh sách ổ đĩa và thư mục gốc khi vào tab File
            sendWsMessage({ command: 'fs_drives' });
            sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' });
        }
    }

    // --- FILE MANAGER ---
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

    function unlockFileUI() {
        const grid = document.getElementById('file-grid');
        if (grid) {
            grid.style.opacity = '1';
            grid.style.pointerEvents = 'auto';
            grid.style.cursor = 'default';
        }
    }

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

    function appendTreeChildren(parentPath, items) {
        const safeId = sanitizeId(parentPath);
        const childBox = document.getElementById(`tree-child-${safeId}`);
        if(!childBox) return;
        
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

        // Khôi phục lại giao diện
        const grid = document.getElementById('file-grid');
        if (grid) {
            grid.style.opacity = '1';
            grid.style.pointerEvents = 'auto';
        }

        const input = document.getElementById('fs-path-input');
        if (input) input.value = path;
                
        if (!data || data.length === 0) {
            // ... Giữ nguyên phần Empty State ...
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
            
            // Thêm nút Download nếu là file
            // Title hiển thị tên đầy đủ khi hover
            return `
            <div class="file-item" data-type="${item.type}" ${actionAttr} title="${item.name}">
                <div class="file-actions">
                    ${!isFolder ? `
                    <button class="btn-fs-action download" onclick="requestDownloadFile('${item.name}')" title="Download">
                        <i data-feather="download" style="width:12px;"></i>
                    </button>` : ''}
                    <button class="btn-fs-action delete" onclick="requestDeleteFile('${item.name}')" title="Delete">
                        <i data-feather="trash-2" style="width:12px;"></i>
                    </button>
                </div>
                
                <div class="file-icon">
                    <i data-feather="${icon}" style="width:32px;height:32px;"></i>
                </div>
                <span class="file-name">${item.name}</span>
                ${!isFolder ? `<span style="font-size:10px;color:var(--text-muted);margin-top:2px">${(item.size/1024).toFixed(0)} KB</span>` : ''}
            </div>`;
        }).join('');

        if (typeof feather !== 'undefined') feather.replace();
    }

    function sanitizeId(str) { return str.replace(/[^a-zA-Z0-9]/g, '-'); }

    window.requestDeleteFile = (name) => {
        event.stopPropagation();
        const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
        if(confirm(`Delete "${name}"?`)) {
            sendWsMessage({ command: 'fs_delete', path: fullPath });
        }
    };

    // Hàm helper để mở thư mục (Dùng cho sự kiện Double Click)
    window.openFolder = (path) => {
        // 1. Khóa giao diện
        const grid = document.getElementById('file-grid');
        if (grid) {
            grid.style.opacity = '0.5'; 
            grid.style.pointerEvents = 'none'; // Chặn click
            grid.style.cursor = 'wait';        // Hiện con trỏ loading
        }

        // 2. Đặt bộ hẹn giờ an toàn (Safety Timer)
        setTimeout(() => {
            unlockFileUI();
        }, 1000);

        // 3. Gửi lệnh đi như bình thường
        sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
    };

    window.requestDownloadFile = (name) => {
        event.stopPropagation(); // Ngăn chọn item khi bấm nút
        const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
        // Gửi lệnh xuống Server
        sendWsMessage({ command: 'fs_download', path: fullPath });
    };
    
    function downloadBase64File(base64, fileName) {
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
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

    // --- INIT ---
    function init() {
        // --- AUTH LOGIC ---
        const authOverlay = $('#auth-overlay');
        const formLogin = $('#form-login');
        const formRegister = $('#form-register');
        const authMsg = $('#auth-msg');

        // 1. Kiểm tra Session khi vừa vào web
        const sessionUser = sessionStorage.getItem('rcc_user');
        if (!sessionUser) {
            // Chưa đăng nhập -> Hiện Overlay
            authOverlay.classList.remove('hidden');
        } else {
            // Đã đăng nhập -> Ẩn Overlay
            authOverlay.classList.add('hidden');
            console.log("Welcome back:", sessionUser);
        }

        // Chuyển đổi qua lại giữa Login/Register
        $('#link-to-register').onclick = (e) => {
            e.preventDefault();
            formLogin.classList.add('hidden');
            formRegister.classList.remove('hidden');
            authMsg.classList.add('hidden');
        };
        $('#link-to-login').onclick = (e) => {
            e.preventDefault();
            formRegister.classList.add('hidden');
            formLogin.classList.remove('hidden');
            authMsg.classList.add('hidden');
        };

        function showAuthMsg(msg, type) {
            authMsg.textContent = msg;
            authMsg.className = type; // 'error' or 'success'
            authMsg.classList.remove('hidden');
        }

        // Xử lý Đăng ký
        $('#btn-do-register').onclick = async () => {
            const u = $('#reg-user').value;
            const p = $('#reg-pass').value;
            if (!u || !p) return showAuthMsg("Please fill all fields", "error");

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (data.success) {
                    showAuthMsg(data.message, "success");
                    setTimeout(() => $('#link-to-login').click(), 2000); // Chuyển về login
                } else {
                    showAuthMsg(data.message, "error");
                }
            } catch (e) { showAuthMsg("Network error", "error"); }
        };

        // Xử lý Đăng nhập
        $('#btn-do-login').onclick = async () => {
            const u = $('#login-user').value;
            const p = $('#login-pass').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();

                if (data.success) {
                    // LƯU SESSION (Quan trọng: dùng sessionStorage để auto-logout khi đóng tab)
                    sessionStorage.setItem('rcc_user', data.username);

                    authOverlay.classList.add('hidden'); // Vào web
                    // Có thể reload trang để init lại sạch sẽ nếu muốn
                    // location.reload(); 
                } else {
                    showAuthMsg(data.message, "error");
                }
            } catch (e) { showAuthMsg("Network error", "error"); }
        };

        // Thêm nút Logout thủ công (Tùy chọn) vào thanh tiêu đề hoặc sidebar
        // Ví dụ gán vào nút Traffic Light màu đỏ
        $('.dot.red').onclick = () => {
            if(confirm("Logout?")) {
                sessionStorage.removeItem('rcc_user'); // Xóa session
                disconnectWs();
                location.reload(); // Reload để hiện lại bảng login
            }
        };


        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrlInput.value = `${proto}://${location.host}/ws`;

        btnConnect.onclick = connectWs;
        btnDisconnect.onclick = disconnectWs;

        $('#sidebar').onclick = e => {
            const item = e.target.closest('.nav-item');
            if (item) showView(item.dataset.view);
        };

        // Dashboard
        $('#main-content').onclick = e => {
            const card = e.target.closest('[data-action="show-view"]');
            if (card) showView(card.dataset.target);

            const stopBtn = e.target.closest('[data-action="stop-proc"]');
            if (stopBtn) showConfirmModal('Stop Process', `PID ${stopBtn.dataset.pid}?`, 'danger', () => sendWsMessage({ command: 'stop_process_pid', pid: parseInt(stopBtn.dataset.pid) }));
            const stopAppBtn = e.target.closest('[data-action="stop-app"]');
            if (stopAppBtn) showConfirmModal('Stop App', `Close "${stopAppBtn.dataset.name}"?`, 'danger', () => sendWsMessage({ command: 'stop_application', app_name: stopAppBtn.dataset.name }));
        };

        // SCAN LAN - Nút Quét mạng
        const stopScanning = () => {
            if (scanInterval) {
                clearInterval(scanInterval);
                scanInterval = null;
            }
            btnScanLan.classList.remove('active-scan');
        };

        // 2. Sự kiện bấm nút
        if (btnScanLan) {
            btnScanLan.onclick = () => {
                btnScanLan.classList.add('active-scan');

                showModal('modal-scan-lan');
                $('#scan-list').innerHTML = '<div class="list-loading"><div class="spinner"></div><br>Scanning network...</div>';

                // Gọi lần đầu
                fetchScanList();

                // Thiết lập vòng lặp - quét nhanh hơn (300ms)
                stopScanning(); // Clear cũ
                btnScanLan.classList.add('active-scan');
                scanInterval = setInterval(fetchScanList, 300);
            };
        }

        // Đóng Modal chung (bao gồm cả dừng quét)
        $('#modal-backdrop').onclick = handleCloseModal;
        $$('[data-action="cancel"]').forEach(b => b.onclick = handleCloseModal);

        // STOP APPS & KILL PROCESS MODALS
        const cardStopApps = $('#card-open-stop-apps');
        if (cardStopApps) {
            cardStopApps.onclick = () => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first!");
                showModal('modal-stop-app');
                $('#stop-app-list').innerHTML = '<div class="list-loading"><div class="spinner"></div><br>Fetching Apps...</div>';
                sendWsMessage({ command: 'list_applications' });
            };
        }

        const cardStopProcs = $('#card-open-stop-procs');
        if (cardStopProcs) {
            cardStopProcs.onclick = () => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first!");
                showModal('modal-stop-proc');
                $('#stop-proc-list').innerHTML = '<div class="list-loading"><div class="spinner"></div><br>Fetching Processes...</div>';
                sendWsMessage({ command: 'list_processes' });
            };
        }

        // Screen Capture
        btnTakeScreenshot.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendWsMessage({ command: 'stop_screen_stream' });

                streamImg.src = "";
                streamImg.classList.add('hidden');

                captureImg.src = "";
                captureImg.classList.add('hidden');

                sendWsMessage({ command: 'capture_screen' });

                captureSpinner.classList.remove('hidden');
                capturePlaceholder.parentElement.classList.add('hidden');
                btnSaveScreenshot.classList.add('hidden');
                btnCopyScreenshot.classList.add('hidden');

                btnStartStream.classList.remove('hidden');
                btnStopStream.classList.add('hidden');

            } else alert('Connect first');
        };

        if (btnReloadScreen) {
            btnReloadScreen.onclick = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendWsMessage({ command: 'stop_screen_stream' });
                }

                captureImg.classList.add('hidden');
                captureImg.src = "";

                streamImg.classList.add('hidden');
                streamImg.src = "";

                const emptyState = $('#capture-display-area .empty-state');
                emptyState.classList.remove('hidden');

                const emptyIcon = emptyState.querySelector('.empty-icon');
                if (emptyIcon) emptyIcon.classList.remove('hidden');

                capturePlaceholder.textContent = "Ready to capture/stream screen";
                capturePlaceholder.parentElement.classList.remove('hidden');
                captureSpinner.classList.add('hidden');

                btnSaveScreenshot.classList.add('hidden');
                btnCopyScreenshot.classList.add('hidden');

                btnStartStream.classList.remove('hidden');
                btnStopStream.classList.add('hidden');
            };
        }

        btnSaveScreenshot.onclick = () => {
            const a = document.createElement('a');
            a.href = captureImg.src;
            a.download = `screen-${Date.now()}.png`;
            a.click();
        };
        btnCopyScreenshot.onclick = async() => {
            try {
                const response = await fetch(captureImg.src);
                const blob = await response.blob();
                await navigator.clipboard.write([new ClipboardItem({
                    [blob.type]: blob
                })]);
                alert('Copied!');
            } catch (err) {
                await navigator.clipboard.writeText(captureImg.src.split(',')[1]);
                alert('Copied Base64');
            }
        };

        if (btnReloadWebcam) {
            btnReloadWebcam.onclick = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendWsMessage({ command: 'stop_webcam_stream' });
                    sendWsMessage({ command: 'stop_webcam_record' });
                }

                webcamStreamImg.classList.add('hidden');
                webcamStreamImg.src = "";

                webcamVideoOutput.classList.add('hidden');
                webcamVideoOutput.src = "";
                if (currentVideoBlob) {
                    URL.revokeObjectURL(currentVideoBlob);
                    currentVideoBlob = null;
                }

                const emptyState = $('#webcam-display-area .empty-state');
                emptyState.classList.remove('hidden');

                webcamSpinner.classList.add('hidden');
                webcamStatus.classList.add('hidden');

                const emptyIcon = emptyState.querySelector('.empty-icon');
                if (emptyIcon) emptyIcon.classList.remove('hidden');

                webcamPlaceholder.textContent = "Ready to record or stream webcam";
                webcamPlaceholder.parentElement.classList.remove('hidden');

                btnStartWebcamStream.classList.remove('hidden');
                btnStopWebcamStream.classList.add('hidden');

                btnStartRecord.classList.remove('hidden');
                btnStopRecord.classList.add('hidden');

                btnSaveVideo.classList.add('hidden');
            };
        }

        btnStartStream.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                streamImg.src = "";
                streamImg.classList.add('hidden');
                captureImg.classList.add('hidden');

                btnSaveScreenshot.classList.add('hidden');
                btnCopyScreenshot.classList.add('hidden');

                const emptyState = $('#capture-display-area .empty-state');
                emptyState.classList.remove('hidden');

                const emptyIcon = emptyState.querySelector('.empty-icon');
                if (emptyIcon) emptyIcon.classList.add('hidden');

                capturePlaceholder.textContent = "Initializing Screen Stream...";
                captureSpinner.classList.remove('hidden');

                sendWsMessage({ command: 'start_screen_stream', fps: 15 });

                btnStartStream.classList.add('hidden');
                btnStopStream.classList.remove('hidden');
            } else alert('Connect first');
        };
        btnStopStream.onclick = () => {
            sendWsMessage({ command: 'stop_screen_stream' });
            streamImg.classList.add('hidden');
            streamImg.src = "";
            captureSpinner.classList.add('hidden');
            const emptyIcon = $('#capture-display-area .empty-icon');
            if (emptyIcon) emptyIcon.classList.remove('hidden');
            capturePlaceholder.textContent = "Ready to capture/stream screen";
            capturePlaceholder.parentElement.classList.remove('hidden');
            btnStartStream.classList.remove('hidden');
            btnStopStream.classList.add('hidden');
        };

        // Webcam
        btnStartRecord.onclick = () => showModal('modal-webcam-device');
        $('#modal-webcam-device [data-action="confirm"]').onclick = () => {
            webcamVideoOutput.src = "";

            webcamStreamImg.classList.add('hidden');
            webcamStreamImg.src = "";

            currentVideoBlob = null;
            webcamVideoOutput.classList.add('hidden');

            sendWsMessage({
                command: 'start_webcam_record',
                time: parseInt(inputWebcamDuration.value) || 10,
                device_name: inputWebcamDeviceName.value
            });
            handleCloseModal();

            webcamPlaceholder.parentElement.classList.add('hidden');
            webcamSpinner.classList.remove('hidden');
        };
        btnStopRecord.onclick = () => sendWsMessage({ command: 'stop_webcam_record' });
        btnSaveVideo.onclick = () => {
            if (currentVideoBlob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(currentVideoBlob);
                a.download = `webcam-${Date.now()}.mp4`;
                a.click();
            }
        };

        btnStartWebcamStream.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                webcamStreamImg.src = "";
                webcamStreamImg.classList.add('hidden');

                webcamVideoOutput.classList.add('hidden');
                if (currentVideoBlob) {
                    URL.revokeObjectURL(currentVideoBlob);
                    currentVideoBlob = null;
                }

                btnSaveVideo.classList.add('hidden');

                const emptyState = $('#webcam-display-area .empty-state');
                emptyState.classList.remove('hidden');

                const emptyIcon = emptyState.querySelector('.empty-icon');
                if (emptyIcon) emptyIcon.classList.add('hidden');

                webcamPlaceholder.textContent = "Initializing Camera Stream...";
                webcamSpinner.classList.remove('hidden');

                sendWsMessage({ command: 'start_webcam_stream', fps: 30 });

                btnStartRecord.classList.add('hidden');
                btnStopRecord.classList.add('hidden');
                btnStartWebcamStream.classList.add('hidden');
                btnStopWebcamStream.classList.remove('hidden');
            } else alert('Connect first');
        };
        btnStopWebcamStream.onclick = () => {
            sendWsMessage({ command: 'stop_webcam_stream' });
            webcamStreamImg.classList.add('hidden');
            webcamStreamImg.src = "";
            webcamSpinner.classList.add('hidden');
            const emptyIcon = $('#webcam-display-area .empty-icon');
            if (emptyIcon) emptyIcon.classList.remove('hidden');
            webcamPlaceholder.textContent = "Ready to record or stream webcam";
            webcamPlaceholder.parentElement.classList.remove('hidden');
            btnStartWebcamStream.classList.remove('hidden');
            btnStopWebcamStream.classList.add('hidden');
            btnStartRecord.classList.remove('hidden');
        };

        // Keylog
        keylogToggle.onchange = e => {
            if (!ws) return (e.target.checked = false, alert('Connect first'));
            sendWsMessage({ command: e.target.checked ? 'start_keylog' : 'stop_keylog' });
            keylogOutput.textContent = e.target.checked ? 'Starting...' : 'Stopped.';
            isKeylogClean = true;
        };
        if (btnClearKeylog) btnClearKeylog.onclick = () => {
            keylogOutput.textContent = 'Cleared.';
            isKeylogClean = true;
        };

        // File manager
        // 1. Nút "Go": Đi đến đường dẫn nhập trong ô input
        const btnFsGo = $('#btn-fs-go');
        if (btnFsGo) {
            btnFsGo.onclick = () => {
                const path = $('#fs-path-input').value;
                if (path) sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
            };
        }

        // 2. Ô Input: Nhấn Enter cũng kích hoạt "Go"
        const inputFsPath = $('#fs-path-input');
        if (inputFsPath) {
            inputFsPath.addEventListener("keypress", (event) => {
                if (event.key === "Enter") btnFsGo.click();
            });
        }

        // 3. Nút "Up": Quay lại thư mục cha
        const btnFsUp = document.querySelector('#btn-fs-up');
        if (btnFsUp) {
            btnFsUp.onclick = () => {
                let p = currentPath;
                // Xóa dấu \ ở cuối nếu có (để tránh lỗi split)
                if (p.endsWith('\\') || p.endsWith('/')) p = p.slice(0, -1);
                
                // Tìm dấu gạch chéo cuối cùng
                const lastSlash = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
                
                if (lastSlash === -1) {
                    // Nếu không còn dấu gạch chéo nào (ví dụ đang ở C: hoặc list ổ đĩa), không làm gì hoặc load lại Drives
                    sendWsMessage({ command: 'fs_drives' });
                    return;
                }

                let parent = p.substring(0, lastSlash);
                
                // Fix trường hợp về root đĩa (VD: C: -> C:\)
                if (parent.length === 2 && parent.charAt(1) === ':') {
                    parent += "\\";
                }
                
                // Nếu chuỗi rỗng thì load drives
                if (parent === "") {
                    sendWsMessage({ command: 'fs_drives' });
                } else {
                    sendWsMessage({ command: 'fs_list', path: parent, context: 'view' });
                }
            };
        }

        // 4. Nút "Refresh": Tải lại cả Cây thư mục và Lưới file
        const btnFsRefresh = $('#btn-fs-refresh');
        if (btnFsRefresh) {
            btnFsRefresh.onclick = () => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendWsMessage({ command: 'fs_drives' }); // Reload Tree
                    sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' }); // Reload Grid
                }
            };
        }

        // 5. Nút "New Folder"
        const btnNewFolder = $('#btn-fs-new-folder');
        if (btnNewFolder) {
            btnNewFolder.onclick = () => {
                const name = prompt("Enter new folder name:");
                if (name) {
                    const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
                    sendWsMessage({ command: 'fs_mkdir', path: fullPath });
                }
            };
        }

        // 6. Nút "New File"
        const btnNewFile = $('#btn-fs-new-file');
        if (btnNewFile) {
            btnNewFile.onclick = () => {
                const name = prompt("Enter new file name (e.g., text.txt):");
                if (name) {
                    const fullPath = currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name;
                    sendWsMessage({ command: 'fs_mkfile', path: fullPath });
                    setTimeout(() => sendWsMessage({ command: 'fs_list', path: currentPath, context: 'view' }), 500);
                }
            };
        }

        // Modals Common
        $('#btn-start-process').onclick = () => showModal('modal-start-process');
        $('#btn-start-app').onclick = () => showModal('modal-start-app');

        $('#modal-start-process [data-action="confirm"]').onclick = () => {
            sendWsMessage({ command: 'start_process', path: $('#input-proc-path').value, args: $('#input-proc-args').value });
            handleCloseModal();
        };
        $('#modal-start-app [data-action="confirm"]').onclick = () => {
            sendWsMessage({ command: 'start_application', app_name: $('#input-app-name').value });
            handleCloseModal();
        };

        if ($('#btn-system-restart')) $('#btn-system-restart').onclick = () => showConfirmModal('Restart', 'Restart remote PC?', 'danger', () => sendWsMessage({ command: 'system_restart' }));
        if ($('#btn-system-shutdown')) $('#btn-system-shutdown').onclick = () => showConfirmModal('Shutdown', 'Shutdown remote PC?', 'danger', () => sendWsMessage({ command: 'system_shutdown' }));

        const btnLogoutSidebar = $('#btn-logout-sidebar');
        if (btnLogoutSidebar) {
            btnLogoutSidebar.onclick = () => {
                // Hiển thị hộp thoại xác nhận (Dùng lại modal Confirm có sẵn cho đẹp)
                if (typeof showConfirmModal === 'function') {
                    showConfirmModal('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', 'danger', () => {
                        performLogout();
                    });
                } else {
                    // Fallback nếu chưa load xong modal
                    if(confirm("Bạn có chắc muốn đăng xuất?")) performLogout();
                }
            };
        }

        // Theme & Traffic
        $('.dot.red').onclick = () => { if (ws) disconnectWs(); };
        $('.dot.yellow').onclick = () => { if (themeToggle) themeToggle.click(); };
        $('.dot.green').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

        if (themeToggle) {
            themeToggle.onchange = e => {
                // Checked (Phải) -> Dark theme
                // Unchecked (Trái) -> Light theme
                document.body.className = e.target.checked ? 'dark-theme' : '';
                localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
            };

            // LOGIC KHỞI TẠO ĐÚNG:
            const savedTheme = localStorage.getItem('theme');
            
            // Nếu lưu là 'dark' thì mới bật nút gạt (checked = true)
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
                themeToggle.checked = true; 
            } else {
                // Ngược lại (light hoặc chưa lưu) thì tắt nút gạt (checked = false)
                document.body.classList.remove('dark-theme');
                themeToggle.checked = false; 
            }
        }
    }

    // --- START ---
    init();

    setTimeout(() => { if (typeof feather !== 'undefined') feather.replace(); }, 500);
    showView(currentView);
});