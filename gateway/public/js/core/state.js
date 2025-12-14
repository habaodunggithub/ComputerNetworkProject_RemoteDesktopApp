// =================================================================
// CORE: STATE MANAGEMENT
// Lưu trữ toàn bộ trạng thái của ứng dụng để chia sẻ giữa các module
// =================================================================

export const state = {
    currentView: 'applications',
    currentAgentId: null,
    currentPath: "C:\\",
    
    // Keylogger
    lastLoggedKeyCode: null,
    isKeylogClean: true,

    // Webcam
    webcamMode: 'idle', // idle | stream | record | playback
    currentVideoBlob: null,
    currentVideoUrl: null,

    // Scan
    scanInterval: null,
    lastScanDataJson: "",

    // Stealer
    currentPasswordData: [],
    currentBrowserName: "unknown",

    // Modal Callback
    confirmCallback: null,

    // File Manager - Upload State
    uploadState: {
        active: false,
        file: null,
        offset: 0,
        chunkSize: 1024 * 1024, // 1MB mỗi chunk
        totalChunks: 0,
        currentChunkIndex: 0
    },

    // File Manager - Editor
    currentEditingFile: null
};

// Hàm reset trạng thái UI khi ngắt kết nối
export function resetAppState() {
    state.lastLoggedKeyCode = null;
    state.currentAgentId = null;
    // Các logic UI reset cụ thể sẽ được gọi từ các module tương ứng
}