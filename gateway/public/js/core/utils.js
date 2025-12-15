// =================================================================
// CORE: UTILITIES
// Các hàm hỗ trợ dùng chung cho toàn bộ dự án
// =================================================================

// Selector ngắn gọn (giống jQuery)
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

// Hàm làm sạch ID (chỉ giữ lại chữ và số)
export function sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '-');
}

// Hàm tải file từ chuỗi Base64
export function downloadBase64File(base64, fileName) {
    try {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
            type: "application/octet-stream"
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error("Download error", e);
        alert("Error saving file.");
    }
}

// Hàm tính toán tọa độ chuẩn (bỏ qua black bars)
export function getCorrectCoordinates(element, event) {
    const rect = element.getBoundingClientRect();
    
    // Kích thước thật của thẻ HTML
    const viewWidth = rect.width;
    const viewHeight = rect.height;

    // Kích thước gốc của video/ảnh (Resolution của máy victim)
    // Lưu ý: Với thẻ <video>, dùng videoWidth/videoHeight. Với <img>, dùng naturalWidth/naturalHeight
    const videoWidth = element.videoWidth || element.naturalWidth;
    const videoHeight = element.videoHeight || element.naturalHeight;

    if (!videoWidth || !videoHeight) return { x: 0, y: 0 };

    // Tỷ lệ khung hình
    const videoRatio = videoWidth / videoHeight;
    const viewRatio = viewWidth / viewHeight;

    let renderWidth, renderHeight, offsetX, offsetY;

    // Tính toán kích thước hiển thị thực tế (Rendered Dimensions)
    if (viewRatio > videoRatio) {
        // Khoảng đen ở 2 bên trái/phải (Pillarbox)
        renderHeight = viewHeight;
        renderWidth = viewHeight * videoRatio;
        offsetX = (viewWidth - renderWidth) / 2;
        offsetY = 0;
    } else {
        // Khoảng đen ở trên/dưới (Letterbox)
        renderWidth = viewWidth;
        renderHeight = viewWidth / videoRatio;
        offsetX = 0;
        offsetY = (viewHeight - renderHeight) / 2;
    }

    // Tọa độ chuột trên thẻ HTML
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    // Chuẩn hóa tọa độ về 0.0 -> 1.0 dựa trên vùng Render
    let x = (clientX - offsetX) / renderWidth;
    let y = (clientY - offsetY) / renderHeight;

    // Kẹp giá trị trong khoảng 0.0 - 1.0 (để tránh click ra ngoài vùng đen mà vẫn gửi lệnh)
    x = Math.max(0.0, Math.min(1.0, x));
    y = Math.max(0.0, Math.min(1.0, y));

    return { x, y };
}
