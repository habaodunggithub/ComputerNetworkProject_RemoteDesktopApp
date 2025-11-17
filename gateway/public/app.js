document.addEventListener('DOMContentLoaded', () => {

    // --- CẤU HÌNH ---

    // --- BIẾN TOÀN CỤC ---
    let ws;
    let currentView = 'applications'; // View mặc định
    let lastLoggedKeyCode = null;

    // --- BỘ CHỌN DOM (DOM Selectors) ---
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => document.querySelectorAll(selector);

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

    // Help View
    const helpContent = $('#help-content');

    // Nút bấm
    const btnStartApp = $('#btn-start-app');

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

        if (msg.success && (command === 'stop_process_pid' || command === 'start_process')) {
            if (currentView === 'processes') loadDataForView('processes');
        }
        if (msg.success && (command === 'stop_application' || command === 'start_application')) {
            if (currentView === 'applications') loadDataForView('applications');
        }
    }

    // --- LOGIC GIAO DIỆN (UI Logic) ---

    function showView(viewId) {
        currentView = viewId;
        contentViews.forEach(view => view.classList.remove('active'));
        $(`#view-${viewId}`).classList.add('active');

        $$('#sidebar .nav-item').forEach(item => item.classList.remove('active'));
        $(`#sidebar .nav-item[data-view="${viewId}"]`).classList.add('active');

        // Chỉ tải dữ liệu nếu đã kết nối
        if (ws && ws.readyState === WebSocket.OPEN) {
            loadDataForView(viewId);
        }
    }

    function loadDataForView(viewId) {
        if (viewId === 'processes') {
            sendWsMessage({ command: 'list_processes' });
        } else if (viewId === 'applications') {
            sendWsMessage({ command: 'list_applications' });
        } else if (viewId === 'help') {
            sendWsMessage({ command: 'help' });
        }

        lastLoggedKeyCode = null;
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
            sendWsMessage({ command: 'capture_screen' });
        });

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
                sendWsMessage({ command: 'start_process', path: path, args: args });
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
                sendWsMessage({ command: 'start_application', app_name: name });
                hideAllModals();
                $('#input-app-name').value = '';
            } else {
                alert('App Name is required.');
            }
        });

        // Nút Stop (trong bảng)
        $('#main-content').addEventListener('click', (e) => {
            const target = e.target;
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
    }

    // --- KHỞI ĐỘNG ---
    initTheme();
    initEventListeners();

    showView(currentView);
    feather.replace(); // Kích hoạt icon
});