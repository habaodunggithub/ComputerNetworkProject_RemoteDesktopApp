document.addEventListener('DOMContentLoaded', () => {
    // --- CẤU HÌNH ---
    let ws;
    let currentView = 'applications';
    let lastLoggedKeyCode = null;
    let currentVideoBlob = null;
    let isKeylogClean = true;

    // --- BỘ CHỌN DOM ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // Elements
    const btnStartRecord = $('#btn-start-record');
    const btnStopRecord = $('#btn-stop-record');
    const btnSaveVideo = $('#btn-save-video');
    const btnReloadWebcam = $('#btn-reload-webcam'); // Nút Reload Webcam
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

    // Capture
    const btnTakeScreenshot = $('#btn-take-screenshot');
    const btnReloadScreen = $('#btn-reload-screen'); // Nút Reload Screen
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

    if(btnConfirmYes) {
        btnConfirmYes.onclick = () => {
            if (confirmCallback) confirmCallback();
            hideAllModals();
        };
    }

    function hideAllModals() {
        $$('.modal').forEach(m => m.classList.add('hidden'));
        $('#modal-backdrop').classList.add('hidden');
    }
    function showModal(id) {
        $(`#${id}`).classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    // --- CONNECTION STATE ---
    function setConnectedState(isConnected) {
        if (isConnected) {
            statusPill.classList.remove('disconnected');
            statusPill.classList.add('connected');
            if(statusText) statusText.textContent = 'Connected';
            btnConnect.classList.add('hidden');
            btnDisconnect.classList.remove('hidden');
            wsUrlInput.disabled = true;
        } else {
            statusPill.classList.remove('connected');
            statusPill.classList.add('disconnected');
            if(statusText) statusText.textContent = 'Disconnected';
            btnConnect.classList.remove('hidden');
            btnDisconnect.classList.add('hidden');
            wsUrlInput.disabled = false;
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

        ws.onopen = () => { setConnectedState(true); loadDataForView(currentView); };
        ws.onclose = () => { 
            setConnectedState(false); 
            ws = null; 
            if($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
            if($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
            if(keylogOutput) keylogOutput.textContent = 'System ready. Waiting...';
            if(keylogToggle) keylogToggle.checked = false;
            lastLoggedKeyCode = null;
        };
        ws.onerror = (e) => alert('Connection failed');
        ws.onmessage = onWsMessage;
    }

    function disconnectWs() { if (ws) ws.close(); }

    function sendWsMessage(payload) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
        else alert('Not connected.');
    }

    function onWsMessage(event) {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
            case 'process_list': renderProcessTable(msg.data); break;
            case 'application_list': renderAppTable(msg.data); break;
            case 'screenshot':
                captureSpinner.classList.add('hidden');
                captureImg.src = `data:image/png;base64,${msg.data}`;
                captureImg.classList.remove('hidden');
                capturePlaceholder.parentElement.classList.add('hidden');
                btnCopyScreenshot.classList.remove('hidden');
                btnSaveScreenshot.classList.remove('hidden');
                break;
            case 'screen_frame':
                capturePlaceholder.parentElement.classList.add('hidden');
                captureImg.classList.add('hidden');
                streamImg.classList.remove('hidden');
                streamImg.src = "data:image/jpeg;base64," + msg.data;
                break;
            case 'webcam_recording_status': handleWebcamStatus(msg); break;
            case 'webcam_video': handleWebcamVideo(msg.data); break;
            case 'webcam_frame': 
                 $('#webcam-display-area .empty-state').classList.add('hidden');
                 webcamVideoOutput.classList.add('hidden');
                 webcamStreamImg.classList.remove('hidden');
                 webcamStreamImg.src = "data:image/jpeg;base64," + msg.data;
                 break;
            case 'key_event': handleKeyEvent(msg.key_code); break;
            // case 'help': ... (Đã xóa)
            case 'status':
                if (msg.success) {
                    if (currentView.includes('process')) loadDataForView('processes-table');
                    if (currentView.includes('app')) loadDataForView('applications-table');
                } else {
                    if(msg.message === 'capture failed') {
                         captureSpinner.classList.add('hidden');
                         capturePlaceholder.parentElement.classList.remove('hidden');
                    } else alert('Error: ' + msg.message);
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
            <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-proc" data-pid="${p.pid}">Stop</button></td></tr>`
        ).join('');
    }

    function renderAppTable(data) {
        const tbody = $('#apps-table tbody');
        if (!tbody) return;
        if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="3">No data.</td></tr>'; return; }
        tbody.innerHTML = data.map(a => `
            <tr><td style="font-weight:500">${a.name}</td><td>${a.process_count}</td>
            <td class="text-right"><button class="btn btn-sm btn-danger" data-action="stop-app" data-name="${a.name}">End Task</button></td></tr>`
        ).join('');
    }

    // --- KEYLOGGER (LOGIC ĐẦY ĐỦ) ---
    function handleKeyEvent(keyCode) {
        if (keyCode === 231) return;

        const el = $('#keylog-output');

        // 2. Logic Xóa thông báo trạng thái (Dựa trên cờ isKeylogClean)
        // Nếu đây là phím đầu tiên sau khi bật/tắt/kết nối -> Xóa sạch màn hình
        if (isKeylogClean) {
            el.textContent = '';
            isKeylogClean = false; // Đánh dấu là đã xóa, các phím sau sẽ nối tiếp
        }

        // 3. Dịch mã phím
        function translateKeyCode(code) {
            if (code >= 65 && code <= 90) return String.fromCharCode(code);
            if (code >= 48 && code <= 57) return String.fromCharCode(code);
            if (code >= 96 && code <= 105) return `[Num ${code - 96}]`;
            switch (code) {
                case 8:
                    return '[Backspace]';
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
                case 91:
                    return '[Win]';
                case 93:
                    return '[Menu]';
                default:
                    return `[${code}]`;
            }
        }

        const char = translateKeyCode(keyCode);
        el.textContent += char;
        el.scrollTop = el.scrollHeight;
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
        } else if (msg.message.includes('streaming started')) {
            btnStartWebcamStream.classList.add('hidden');
            btnStopWebcamStream.classList.remove('hidden');
        } else if (msg.message.includes('completed')) {
             btnStartWebcamStream.classList.remove('hidden');
             webcamSpinner.classList.add('hidden'); webcamPlaceholder.parentElement.classList.remove('hidden'); webcamPlaceholder.textContent = 'Processing...';
        } else if (msg.message.includes('error') || msg.message.includes('cancelled')) {
            btnStartRecord.classList.remove('hidden'); btnStopRecord.classList.add('hidden');
            btnStartWebcamStream.classList.remove('hidden');
            webcamSpinner.classList.add('hidden'); webcamPlaceholder.parentElement.classList.remove('hidden');
        }
    }

    function handleWebcamVideo(b64) {
        webcamSpinner.classList.add('hidden'); webcamPlaceholder.parentElement.classList.add('hidden');
        try {
            const chars = atob(b64), bytes = new Uint8Array(chars.length);
            for(let i=0; i<chars.length; i++) bytes[i] = chars.charCodeAt(i);
            currentVideoBlob = new Blob([bytes], { type: 'video/mp4' });
            webcamVideoOutput.src = URL.createObjectURL(currentVideoBlob);
            webcamVideoOutput.classList.remove('hidden');
            btnStartRecord.classList.remove('hidden'); btnStopRecord.classList.add('hidden'); btnSaveVideo.classList.remove('hidden');
        } catch(e) { console.error(e); alert("Video error"); }
    }

    // --- NAVIGATION ---
    function showView(viewId) {
        currentView = viewId;
        $$('.content-view').forEach(v => v.classList.remove('active'));
        const targetView = $(`#view-${viewId}`);
        if(targetView) targetView.classList.add('active');
        
        $$('.nav-item').forEach(i => i.classList.remove('active'));
        const parent = targetView ? targetView.dataset.parentView : null;
        const activeItem = $(`.nav-item[data-view="${parent || viewId}"]`);
        if(activeItem) activeItem.classList.add('active');

        if (ws && ws.readyState === WebSocket.OPEN) loadDataForView(viewId);
    }

    function loadDataForView(id) {
        if(id === 'processes-table') sendWsMessage({command: 'list_processes'});
        else if(id === 'applications-table') sendWsMessage({command: 'list_applications'});
    }

    // --- INIT ---
    function init() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrlInput.value = `${proto}://${location.host}/ws`;

        btnConnect.onclick = connectWs;
        btnDisconnect.onclick = disconnectWs;
        
        $('#sidebar').onclick = e => {
            const item = e.target.closest('.nav-item');
            if(item) showView(item.dataset.view);
        };

        // Dashboard
        $('#main-content').onclick = e => {
            const card = e.target.closest('[data-action="show-view"]');
            if(card) showView(card.dataset.target);
            const stopBtn = e.target.closest('[data-action="stop-proc"]');
            if(stopBtn) showConfirmModal('Stop Process', `PID ${stopBtn.dataset.pid}?`, 'danger', () => sendWsMessage({command:'stop_process_pid', pid: parseInt(stopBtn.dataset.pid)}));
            const stopAppBtn = e.target.closest('[data-action="stop-app"]');
            if(stopAppBtn) showConfirmModal('Stop App', `Close "${stopAppBtn.dataset.name}"?`, 'danger', () => sendWsMessage({command:'stop_application', app_name: stopAppBtn.dataset.name}));
        };

        // === SCREEN CAPTURE LOGIC ===
        btnTakeScreenshot.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendWsMessage({ command: 'capture_screen' });
                
                captureSpinner.classList.remove('hidden');
                captureImg.classList.add('hidden');
                capturePlaceholder.parentElement.classList.add('hidden');
                btnSaveScreenshot.classList.add('hidden');
                btnCopyScreenshot.classList.add('hidden');
            } else {
                alert('Please connect to the server first!');
            }
        };
        btnSaveScreenshot.onclick = () => {
            const a = document.createElement('a'); a.href = captureImg.src; a.download = `screen-${Date.now()}.png`; a.click();
        };
        btnCopyScreenshot.onclick = async () => {
            if (!captureImg.src || captureImg.classList.contains('hidden')) return;
            try {
                const response = await fetch(captureImg.src);
                const blob = await response.blob();
                const item = new ClipboardItem({ [blob.type]: blob });
                await navigator.clipboard.write([item]);
                alert('Đã copy ảnh vào Clipboard!');
            } catch (err) {
                console.warn('Copy Image API failed:', err);
                try { await navigator.clipboard.writeText(captureImg.src.split(',')[1]); alert('Đã copy mã Base64 (Fallback)!'); } catch (e) { alert('Không thể copy. Kiểm tra HTTPS.'); }
            }
        };
        
        // === NÚT RELOAD SCREEN (RESET UI) ===
        if (btnReloadScreen) {
            btnReloadScreen.onclick = () => {
                // Dừng Stream nếu có (để server ngừng gửi)
                if(ws && ws.readyState === WebSocket.OPEN) sendWsMessage({ command: 'stop_screen_stream' });
                
                // Reset UI
                captureImg.classList.add('hidden'); captureImg.src = '';
                streamImg.classList.add('hidden'); streamImg.src = '';
                capturePlaceholder.parentElement.classList.remove('hidden');
                capturePlaceholder.textContent = 'Ready to capture/stream screen';
                captureSpinner.classList.add('hidden');
                
                btnSaveScreenshot.classList.add('hidden');
                btnCopyScreenshot.classList.add('hidden');
                
                btnStartStream.classList.remove('hidden');
                btnStopStream.classList.add('hidden');
            };
        }

        // Screen Stream
        btnStartStream.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendWsMessage({ command: 'start_screen_stream', fps: 10 });
                
                captureImg.classList.add('hidden'); 
                streamImg.classList.remove('hidden'); 
                capturePlaceholder.parentElement.classList.add('hidden');
                btnStartStream.classList.add('hidden'); 
                btnStopStream.classList.remove('hidden');
            } else {
                alert('Please connect to the server first!');
            }
        };
        btnStopStream.onclick = () => {
             sendWsMessage({ command: 'stop_screen_stream' });
             streamImg.classList.add('hidden'); capturePlaceholder.parentElement.classList.remove('hidden'); capturePlaceholder.textContent = "Stream stopped";
             btnStartStream.classList.remove('hidden'); btnStopStream.classList.add('hidden');
        };

        // === WEBCAM LOGIC ===
        btnStartRecord.onclick = () => showModal('modal-webcam-device');
        $('#modal-webcam-device [data-action="confirm"]').onclick = () => {
             sendWsMessage({command: 'start_webcam_record', time: parseInt(inputWebcamDuration.value)||10, device_name: inputWebcamDeviceName.value});
             hideAllModals();
        };
        btnStopRecord.onclick = () => sendWsMessage({command: 'stop_webcam_record'});
        btnSaveVideo.onclick = () => {
            if(currentVideoBlob) { const a = document.createElement('a'); a.href = URL.createObjectURL(currentVideoBlob); a.download = `webcam-${Date.now()}.mp4`; a.click(); }
        };

        // === NÚT RELOAD WEBCAM (RESET UI) ===
        if (btnReloadWebcam) {
            btnReloadWebcam.onclick = () => {
                 // Dừng stream/record phía server
                 if(ws && ws.readyState === WebSocket.OPEN) {
                     sendWsMessage({ command: 'stop_webcam_stream' });
                     sendWsMessage({ command: 'stop_webcam_record' });
                 }

                 // Reset UI
                 webcamStreamImg.classList.add('hidden'); webcamStreamImg.src = '';
                 webcamVideoOutput.classList.add('hidden'); webcamVideoOutput.src = '';
                 webcamSpinner.classList.add('hidden');
                 
                 webcamPlaceholder.parentElement.classList.remove('hidden'); // Hiện empty state
                 webcamPlaceholder.textContent = "Ready to record or stream webcam";
                 webcamStatus.classList.add('hidden');

                 btnStartWebcamStream.classList.remove('hidden');
                 btnStopWebcamStream.classList.add('hidden');
                 btnStartRecord.classList.remove('hidden');
                 btnStopRecord.classList.add('hidden');
                 btnSaveVideo.classList.add('hidden');
            };
        }

        // Webcam Stream
        btnStartWebcamStream.onclick = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendWsMessage({ command: 'start_webcam_stream', fps: 10 });
                
                webcamVideoOutput.classList.add('hidden'); 
                webcamStreamImg.classList.remove('hidden'); 
                webcamPlaceholder.parentElement.classList.add('hidden'); 
                btnSaveVideo.classList.add('hidden');
                
                btnStartRecord.classList.add('hidden'); 
                btnStopRecord.classList.add('hidden');
                
                btnStartWebcamStream.classList.add('hidden'); 
                btnStopWebcamStream.classList.remove('hidden');
                
                $('#webcam-display-area .empty-state').classList.add('hidden');
            } else {
                alert('Please connect to the server first!');
            }
        };
        btnStopWebcamStream.onclick = () => {
            sendWsMessage({ command: 'stop_webcam_stream' });
            webcamStreamImg.classList.add('hidden'); webcamPlaceholder.parentElement.classList.remove('hidden'); webcamPlaceholder.textContent = "Ready";
            btnStartWebcamStream.classList.remove('hidden'); btnStopWebcamStream.classList.add('hidden'); btnStartRecord.classList.remove('hidden');
        };

        // Keylog
        keylogToggle.onchange = e => {
            if(!ws) return (e.target.checked=false, alert('Connect first'));
            sendWsMessage({command: e.target.checked ? 'start_keylog' : 'stop_keylog'});
            keylogOutput.textContent = e.target.checked ? 'Starting...' : 'Stopped.';
            isKeylogClean = true;
        };
        if(btnClearKeylog) btnClearKeylog.onclick = () => { keylogOutput.textContent = 'Cleared.'; isKeylogClean = true; };

        // Modals
        $('#btn-start-process').onclick = () => showModal('modal-start-process');
        $('#btn-start-app').onclick = () => showModal('modal-start-app');
        $('#modal-backdrop').onclick = hideAllModals;
        $$('[data-action="cancel"]').forEach(b => b.onclick = hideAllModals);
        
        $('#modal-start-process [data-action="confirm"]').onclick = () => {
            sendWsMessage({command:'start_process', path: $('#input-proc-path').value, args: $('#input-proc-args').value}); hideAllModals();
        };
        $('#modal-start-app [data-action="confirm"]').onclick = () => {
            sendWsMessage({command:'start_application', app_name: $('#input-app-name').value}); hideAllModals();
        };

        // System
        if($('#btn-system-restart')) $('#btn-system-restart').onclick = () => showConfirmModal('Restart', 'Restart remote PC?', 'danger', () => sendWsMessage({command: 'system_restart'}));
        if($('#btn-system-shutdown')) $('#btn-system-shutdown').onclick = () => showConfirmModal('Shutdown', 'Shutdown remote PC?', 'danger', () => sendWsMessage({command: 'system_shutdown'}));

        // Traffic Lights & Theme
        $('.dot.red').onclick = () => { if(ws) disconnectWs(); };
        $('.dot.yellow').onclick = () => { if(themeToggle) themeToggle.click(); }; 
        $('.dot.green').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

        if(themeToggle) {
            themeToggle.onchange = e => {
                document.body.className = e.target.checked ? 'dark-theme' : '';
                localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
            };
            if(localStorage.getItem('theme') === 'dark') {
                document.body.classList.add('dark-theme');
                themeToggle.checked = true;
            }
        }
    }

    // --- START ---
    init();
    
    if (typeof feather !== 'undefined') {
        feather.replace();
    } else {
        console.warn("Feather Icons not loaded yet. Retrying in 500ms...");
        setTimeout(() => { if(typeof feather !== 'undefined') feather.replace(); }, 500);
    }
    
    showView(currentView);
});