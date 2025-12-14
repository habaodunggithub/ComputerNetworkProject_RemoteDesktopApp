// =================================================================
// MODULE: WEBCAM
// Xử lý Stream, Ghi hình và Xem lại video
// =================================================================

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';

export function handleWebcamStatus(msg) {
    const webcamStatus = $('#webcam-status');
    const webcamPlaceholder = $('#webcam-placeholder');
    const webcamSpinner = $('#webcam-spinner');

    webcamStatus.textContent = msg.message;
    webcamStatus.classList.remove('hidden');

    if (msg.message.includes('Recording started')) {
        $('#btn-start-record').classList.add('hidden');
        $('#btn-stop-record').classList.remove('hidden');
        $('#btn-start-webcam-stream').classList.add('hidden');
        $('#btn-stop-webcam-stream').classList.add('hidden');
        $('#btn-save-video').classList.add('hidden');
        webcamPlaceholder.parentElement.classList.add('hidden');
        webcamSpinner.classList.remove('hidden');
        $('#webcam-video-output').classList.add('hidden');
    } else if (msg.message.includes('completed')) {
        state.webcamMode = 'playback';
        webcamSpinner.classList.add('hidden');
        webcamPlaceholder.parentElement.classList.remove('hidden');
        webcamPlaceholder.textContent = 'Processing...';
        $('#btn-start-webcam-stream').classList.remove('hidden');
    } else if (msg.message.includes('error') || msg.message.includes('cancelled') || msg.message.includes('stopped')) {
        webcamSpinner.classList.add('hidden');
        webcamPlaceholder.parentElement.classList.remove('hidden');
        webcamPlaceholder.textContent = "Ready to record or stream webcam";
        $('#btn-start-record').classList.remove('hidden');
        $('#btn-stop-record').classList.add('hidden');
        $('#btn-start-webcam-stream').classList.remove('hidden');
        $('#btn-stop-webcam-stream').classList.add('hidden');
        setTimeout(() => {
            webcamStatus.classList.add('hidden');
        }, 3000);
    }
}

export function handleWebcamVideo(b64) {
    $('#webcam-spinner').classList.add('hidden');
    $('#webcam-placeholder').parentElement.classList.add('hidden');
    $('#webcam-stream-img').classList.add('hidden');
    $('#webcam-stream-img').src = "";

    try {
        const chars = atob(b64);
        const bytes = new Uint8Array(chars.length);
        for (let i = 0; i < chars.length; i++) {
            bytes[i] = chars.charCodeAt(i);
        }

        if (state.currentVideoUrl) URL.revokeObjectURL(state.currentVideoUrl);
        state.currentVideoBlob = new Blob([bytes], {
            type: 'video/mp4'
        });
        state.currentVideoUrl = URL.createObjectURL(state.currentVideoBlob);

        const videoOut = $('#webcam-video-output');
        videoOut.src = state.currentVideoUrl;
        videoOut.load();
        videoOut.classList.remove('hidden');
        state.webcamMode = 'playback';

        $('#btn-start-record').classList.remove('hidden');
        $('#btn-stop-record').classList.add('hidden');
        $('#btn-save-video').classList.remove('hidden');
        $('#btn-start-webcam-stream').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert("Video error");
    }
}

export function handleWebcamFrame(base64) {
    if (state.webcamMode !== 'stream') return;
    $('#webcam-display-area .empty-state').classList.add('hidden');
    $('#webcam-video-output').classList.add('hidden');
    const img = $('#webcam-stream-img');
    img.classList.remove('hidden');
    img.src = "data:image/jpeg;base64," + base64;
}

export function clearWebcamStreamUI() {
    const img = $('#webcam-stream-img');
    img.src = "";
    img.classList.add('hidden');
    
    const vid = $('#webcam-video-output');
    vid.pause();
    vid.src = "";
    vid.classList.add('hidden');
    
    const empty = $('#webcam-display-area .empty-state');
    if (empty) empty.classList.remove('hidden');
    const display = $('#webcam-display-area');
    if (display) display.style.background = 'transparent';
}