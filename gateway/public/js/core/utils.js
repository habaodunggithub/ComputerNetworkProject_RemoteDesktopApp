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