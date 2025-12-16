import { $ } from '../core/utils.js';

let _sendFn = null; // Biến lưu hàm gửi WebSocket

/**
 * Khởi tạo Module Chat
 * @param {Function} sendFunction - Hàm sendWsMessage từ websocket.js
 */
export function initChat(sendFunction) {
    _sendFn = sendFunction;

    // 1. Gán các hàm vào window để gọi từ HTML
    window.toggleChat = toggleChat;      
    window.minimizeChat = minimizeChat;  
    window.killChatSession = killChatSession; 
    window.sendChatMessage = sendChatMessage;

    // 2. Thêm sự kiện nhấn Enter để gửi và Focus để tắt badge
    const chatInput = $('#chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });

        // Khi bấm vào ô nhập liệu thì tắt thông báo đỏ ngay
        chatInput.addEventListener('focus', hideBadge);
    }
}

// --- CÁC HÀM LOGIC NỘI BỘ ---

// Hàm ẩn chấm đỏ 
function hideBadge() {
    const badge = $('#chat-badge');
    const btn = $('#btn-toggle-chat');
    
    if (badge) badge.classList.add('hidden');
    if (btn) btn.classList.remove('alert-pulse'); 
}

// Hàm Nút Trừ (-): Chỉ thu nhỏ UI, KHÔNG gửi lệnh stop
function minimizeChat() {
    const chatBox = $('#chat-box');
    const btn = $('#btn-toggle-chat');
    
    if (chatBox) chatBox.classList.add('hidden');
    if (btn) btn.classList.remove('active');
}

// Hàm Nút X: Tắt hẳn session
function killChatSession() {
    minimizeChat(); 
    
    // Gửi lệnh chat_stop qua WebSocket để Agent tắt cửa sổ
    if (_sendFn) {
        _sendFn({ command: 'chat_stop' });
        console.log("Sent chat_stop to agent");
    }

    // Xóa lịch sử chat để lần sau mở lên như mới
    const history = $('#chat-history');
    if (history) history.innerHTML = '';
}

// Hàm Bật/Tắt Chat (Nút tròn ở Footer)
function toggleChat() {
    const chatBox = $('#chat-box');
    
    if (chatBox.classList.contains('hidden')) {
        // ĐANG ĐÓNG -> MỞ
        startChat();
    } else {
        // ĐANG MỞ -> THU NHỎ (Giống nút -)
        minimizeChat();
    }
}

// Hàm logic mở chat
function startChat() {
    const chatBox = $('#chat-box');
    const btn = $('#btn-toggle-chat');

    if (chatBox) {
        chatBox.classList.remove('hidden');
        // Focus vào ô nhập liệu sau khi mở
        setTimeout(() => $('#chat-input')?.focus(), 100);
    }
    
    if (btn) btn.classList.add('active'); // Sáng nút footer
    
    // Gửi lệnh mở/đảm bảo cửa sổ bên Agent hiển thị
    if (_sendFn) _sendFn({ command: 'chat_start' });

    hideBadge();
}

// Hàm reset toàn bộ (Dùng khi logout hoặc mất kết nối)
export function resetChat() {
    const chatBox = $('#chat-box');
    if (chatBox) chatBox.classList.add('hidden');

    const history = $('#chat-history');
    if (history) history.innerHTML = '';

    const btn = $('#btn-toggle-chat');
    if (btn) btn.classList.remove('active');
    
    hideBadge();
}

function sendChatMessage() {
    const input = $('#chat-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;

    hideBadge();
    
    // Hiển thị tin nhắn của mình (Me)
    appendLog("Me", text, true);
    
    // Gửi qua WebSocket
    if (_sendFn) _sendFn({ command: 'chat_message', text: text });
    
    input.value = ''; 
    input.focus();
}

/**
 * Hàm xử lý khi nhận tin nhắn từ Server (Được gọi bởi websocket.js)
 */
export function handleIncomingChat(text) {
    appendLog("Agent", text, false);
    
    // Nếu chat đang ĐÓNG (Minimize) thì mới hiện chấm đỏ
    const chatBox = $('#chat-box');
    if (chatBox && chatBox.classList.contains('hidden')) {
        const badge = $('#chat-badge');
        if (badge) badge.classList.remove('hidden'); // Hiện chấm đỏ
        
        // Hiệu ứng rung nút chat ở footer
        const btn = $('#btn-toggle-chat');
        if (btn) btn.classList.add('alert-pulse'); 
    }
}

// --- HELPER UI ---

function appendLog(sender, text, isMe) {
    const history = $('#chat-history');
    if (!history) return;

    const div = document.createElement('div');
    div.textContent = text;
    
    div.classList.add('chat-msg');
    div.classList.add(isMe ? 'me' : 'agent');

    history.appendChild(div);
    // Tự động cuộn xuống cuối
    history.scrollTop = history.scrollHeight;
}