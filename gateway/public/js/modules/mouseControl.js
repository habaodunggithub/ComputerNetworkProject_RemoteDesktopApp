// js/modules/MouseControl.js
import { getCorrectCoordinates } from '../core/utils.js';

// Các biến nội bộ (State)
let mouseTimer = null;
let _sendFn = null;       // Hàm gửi WebSocket (sendWsMessage)
let _checkConnFn = null;  // Hàm kiểm tra kết nối (isWsConnected)
let _controlToggle = null; // Element checkbox bật/tắt quyền điều khiển
let pendingMove = null; // Dữ liệu di chuyển chuột chờ gửi

/**
 * Khởi tạo Mouse Control
 * @param {Object} options - Các tham số cấu hình
 */
export function initMouseControl(options) {
    const {
        videoElement,   // Thẻ <video> hoặc <img> hiển thị stream
        controlToggle,  // Nút checkbox bật/tắt control
        sendFunction,   // Hàm sendWsMessage từ websocket.js
        checkConnFunction // Hàm isWsConnected từ websocket.js
    } = options;

    _sendFn = sendFunction;
    _checkConnFn = checkConnFunction;
    _controlToggle = controlToggle;

    // Gán sự kiện cho video element
    attachListeners(videoElement);

    // Bắt đầu vòng lặp gửi hàng đợi (Batch Sender)
    startBatchSender();
}

/**
 * Gán các sự kiện chuột (Move, Click, Scroll)
 */
function attachListeners(element) {
    // 1. Mouse Move (Gom nhóm - Batching)
    element.addEventListener('mousemove', (e) => {
        if (!shouldSend()) return;

        // Tính tọa độ chuẩn
        const coords = getCorrectCoordinates(element, e);
        
        // Đẩy vào hàng đợi
        pendingMove = { x: coords.x, y: coords.y };
    });

    // 2. Mouse Down (Gửi ngay lập tức)
    element.addEventListener('mousedown', (e) => {
        if (!shouldSend()) return;
        e.preventDefault(); // Ngăn focus/drag
        
        const coords = getCorrectCoordinates(element, e);
        sendClick(e.button, 'down', coords.x, coords.y);
    });

    // 3. Mouse Up (Gửi ngay lập tức)
    element.addEventListener('mouseup', (e) => {
        if (!shouldSend()) return;
        e.preventDefault();
        
        const coords = getCorrectCoordinates(element, e);
        sendClick(e.button, 'up', coords.x, coords.y);
    });

    // 4. Scroll (Gửi ngay hoặc batch tùy nhu cầu, ở đây gửi ngay cho đơn giản)
    element.addEventListener('wheel', (e) => {
        if (!shouldSend()) return;
        e.preventDefault();

        // Windows scroll: 120 là 1 nấc. e.deltaY > 0 là lăn xuống (âm trong SendInput)
        const delta = e.deltaY > 0 ? -120 : 120;
        
        _sendFn({
            command: 'mouse_input',
            a: 'sc', // action: scroll
            d: delta // delta
        });
    }, { passive: false });
    
    // 5. Chặn context menu chuột phải
    element.addEventListener('contextmenu', (e) => {
        if (shouldSend()) e.preventDefault();
    });
}

/**
 * Logic gửi hàng đợi định kỳ (30ms)
 */
function startBatchSender() {
    if (mouseTimer) clearInterval(mouseTimer);
    
    mouseTimer = setInterval(() => {
        if (pendingMove && shouldSend()) {
            
            const moveData = pendingMove;

            pendingMove = null; 
            
            _sendFn({
                command: 'mouse_input',
                a: 'mv',    
                x: moveData.x,
                y: moveData.y
            });
        }
    }, 50);
}

/**
 * Helper: Gửi sự kiện click
 */
function sendClick(btnIndex, state, x, y) {
    // Mapping button: 0=left, 1=middle, 2=right
    const btnMap = { 0: 'left', 1: 'middle', 2: 'right' };
    
    _sendFn({
        command: 'mouse_input',
        a: 'cl', // click
        b: btnMap[btnIndex] || 'left',
        s: state, // down/up
        x: x,
        y: y
    });
}

/**
 * Helper: Kiểm tra điều kiện có được phép gửi không
 */
function shouldSend() {
    // Phải có kết nối + Checkbox Control đang bật
    return _checkConnFn() && _controlToggle && _controlToggle.checked;
}

/**
 * Dọn dẹp khi cần (ví dụ khi đóng ứng dụng)
 */
export function destroyMouseControl() {
    if (mouseTimer) {
        clearInterval(mouseTimer);
        mouseTimer = null;
    }
    pendingMove = null;
}