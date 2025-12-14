// =================================================================
// MODULE: SCREEN (MONITOR)
// Xử lý hiển thị màn hình và sự kiện điều khiển (Screen Control)
// =================================================================

import { $ } from '../core/utils.js';

let pendingFrame = null;
let isRenderPending = false;

export function handleScreenshotResult(base64) {
    $('#capture-spinner').classList.add('hidden');
    $('#stream-img').classList.add('hidden');
    $('#stream-img').src = "";
    $('#capture-placeholder').parentElement.classList.add('hidden');
    
    const captureImg = $('#capture-img');
    captureImg.src = `data:image/png;base64,${base64}`;
    captureImg.classList.remove('hidden');
    
    $('#btn-copy-screenshot').classList.remove('hidden');
    $('#btn-save-screenshot').classList.remove('hidden');
}

export function handleScreenFrame(base64) {
    pendingFrame = base64;

    if (!isRenderPending) {
        isRenderPending = true;
        requestAnimationFrame(renderLoop);
    }
}

function renderLoop() {
    if (!pendingFrame) {
        isRenderPending = false;
        return;
    }

    const streamImg = $('#stream-img');
    const startStreamBtn = $('#btn-start-stream');

    // Chỉ vẽ nếu đang ở chế độ xem
    if (startStreamBtn && startStreamBtn.classList.contains('hidden')) {
        const emptyState = $('#capture-display-area .empty-state');
        const captureImg = $('#capture-img');
        
        if (emptyState && !emptyState.classList.contains('hidden')) emptyState.classList.add('hidden');
        if (captureImg && !captureImg.classList.contains('hidden')) captureImg.classList.add('hidden');
        if (streamImg.classList.contains('hidden')) streamImg.classList.remove('hidden');

        // Cập nhật ảnh
        streamImg.src = "data:image/jpeg;base64," + pendingFrame;
    }

    // Reset cờ
    pendingFrame = null;
    isRenderPending = false;
}

export function resetScreenUI() {
    $('#stream-img').classList.add('hidden');
    $('#stream-img').src = "";
    $('#capture-img').classList.add('hidden');
    $('#capture-spinner').classList.add('hidden');
    $('#capture-display-area .empty-state').classList.remove('hidden');
    
    $('#btn-start-stream').classList.remove('hidden');
    $('#btn-stop-stream').classList.add('hidden');
    $('#btn-save-screenshot').classList.add('hidden');
    $('#btn-copy-screenshot').classList.add('hidden');
    
    const controlToggle = $('#toggle-control');
    if (controlToggle) controlToggle.checked = false;
}