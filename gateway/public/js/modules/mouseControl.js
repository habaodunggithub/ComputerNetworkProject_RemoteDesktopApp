// js/modules/MouseControl.js
import { getCorrectCoordinates } from '../core/utils.js';

// Các biến nội bộ (State)
let mouseTimer = null;
let rafId = null;         // requestAnimationFrame ID
let _sendFn = null;       // Hàm gửi WebSocket (sendWsMessage)
let _checkConnFn = null;  // Hàm kiểm tra kết nối (isWsConnected)
let _controlToggle = null; // Element checkbox bật/tắt quyền điều khiển
let pendingMove = null;   // Dữ liệu di chuyển chuột chờ gửi
let lastSentTime = 0;     // Thời điểm gửi lần cuối (throttle)
let lastSentPos = null;   // Vị trí gửi lần cuối (tránh gửi trùng)

// Cấu hình tối ưu cho độ trễ thấp
const MOUSE_SEND_INTERVAL = 16; // ~60fps 
const MIN_MOVE_DELTA = 0.01;   // Ngưỡng thay đổi tối thiểu để gửi

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

    // Bắt đầu vòng lặp gửi hàng đợi (sử dụng RAF + Interval hybrid)
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
 * Logic gửi hàng đợi định kỳ (16ms ~ 60fps) + RAF hybrid
 * Sử dụng kết hợp setInterval và requestAnimationFrame để tối ưu
 */
function startBatchSender() {
    if (mouseTimer) clearInterval(mouseTimer);
    if (rafId) cancelAnimationFrame(rafId);
    
    // Phương pháp Hybrid: RAF cho smooth, setInterval làm fallback
    function sendLoop() {
        const now = performance.now();
        
        if (pendingMove && shouldSend()) {
            // Throttle: chỉ gửi nếu đủ khoảng cách thời gian
            if (now - lastSentTime >= MOUSE_SEND_INTERVAL) {
                const moveData = pendingMove;
                
                // Kiểm tra có thực sự thay đổi vị trí không
                const hasMoved = !lastSentPos || 
                    Math.abs(moveData.x - lastSentPos.x) > MIN_MOVE_DELTA ||
                    Math.abs(moveData.y - lastSentPos.y) > MIN_MOVE_DELTA;
                
                if (hasMoved) {
                    pendingMove = null;
                    lastSentTime = now;
                    lastSentPos = { x: moveData.x, y: moveData.y };
                    
                    _sendFn({
                        command: 'mouse_input',
                        a: 'mv',    
                        x: moveData.x,
                        y: moveData.y
                    });
                }
            }
        }
        
        rafId = requestAnimationFrame(sendLoop);
    }
    
    // Bắt đầu loop với RAF
    rafId = requestAnimationFrame(sendLoop);
    
    // Fallback setInterval cho trường hợp tab bị background (RAF pause)
    mouseTimer = setInterval(() => {
        if (pendingMove && shouldSend() && document.hidden) {
            const moveData = pendingMove;
            pendingMove = null;
            
            _sendFn({
                command: 'mouse_input',
                a: 'mv',    
                x: moveData.x,
                y: moveData.y
            });
        }
    }, MOUSE_SEND_INTERVAL);
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
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    pendingMove = null;
    lastSentPos = null;
    lastSentTime = 0;
}