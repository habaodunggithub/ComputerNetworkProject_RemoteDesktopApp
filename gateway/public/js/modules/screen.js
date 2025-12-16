// =================================================================
// MODULE: SCREEN (MONITOR)
// Xử lý hiển thị màn hình và sự kiện điều khiển (Screen Control)
// =================================================================

import { $ } from '../core/utils.js';

let jmuxer = null;

// Khởi tạo Player
function initMuxer() {
    if (jmuxer) return;
    const videoEl = document.getElementById('stream-video');
    
    // Reset video element
    if (videoEl) {
        videoEl.classList.remove('hidden');
    }

    jmuxer = new JMuxer({
        node: 'stream-video',
        mode: 'video',
        flushingTime: 0,
        fps: 30,
        debug: false
    });
}

export function handleScreenshotResult(base64) {
    $('#capture-spinner').classList.add('hidden');
    $('#stream-video').classList.add('hidden');
    $('#stream-video').src = "";
    $('#capture-placeholder').parentElement.classList.add('hidden');
    
    const captureImg = $('#capture-img');
    captureImg.src = `data:image/png;base64,${base64}`;
    captureImg.classList.remove('hidden');
    
    $('#btn-copy-screenshot').classList.remove('hidden');
    $('#btn-save-screenshot').classList.remove('hidden');
    $('#stream-video').classList.add('hidden');
}

export function handleVideoChunk(base64) {
    // 1. Ẩn các thành phần thừa
    const emptyState = $('#capture-display-area .empty-state');
    const captureImg = $('#capture-img');
    const streamVideo = $('#stream-video');
    
    if (emptyState && !emptyState.classList.contains('hidden')) emptyState.classList.add('hidden');
    if (captureImg && !captureImg.classList.contains('hidden')) captureImg.classList.add('hidden');
    if (streamVideo.classList.contains('hidden')) streamVideo.classList.remove('hidden');
    // 2. Khởi tạo Muxer nếu chưa có
    if (!jmuxer) initMuxer();

    // 3. Decode Base64 -> Uint8Array
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // 4. Đẩy dữ liệu vào Player
    try {
        if (jmuxer) {
            jmuxer.feed({
                video: bytes
            });
        }
    } catch (e) {
        console.error("Lỗi feed video:", e);
        jmuxer = null;
    }
}

export function resetScreenUI() {
    if (jmuxer) {
        try {
            jmuxer.destroy();
        } catch (e) {
            console.log("Jmuxer destroy error", e);
        }
        jmuxer = null; 
    }

    $('#stream-video').classList.add('hidden');
    $('#stream-video').src = "";
    $('#capture-img').classList.add('hidden');
    $('#capture-spinner').classList.add('hidden');
    $('#capture-display-area .empty-state').classList.remove('hidden');
    
    $('#btn-start-stream').classList.remove('hidden');
    $('#btn-stop-stream').classList.add('hidden');
    $('#btn-save-screenshot').classList.add('hidden');
    $('#btn-copy-screenshot').classList.add('hidden');
    
    const controlToggle = $('#toggle-control');
    if (controlToggle) controlToggle.checked = false;
    
    // Reset Block Input toggle
    const blockInputToggle = $('#toggle-block-input');
    if (blockInputToggle) {
        blockInputToggle.checked = false;
        blockInputToggle.disabled = true;
    }
}