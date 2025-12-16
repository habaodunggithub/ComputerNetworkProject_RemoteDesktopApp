import { $ } from '../core/utils.js';

let _sendFn = null; // Biến lưu hàm gửi WebSocket

/**
 * Khởi tạo Module Chat
 * @param {Function} sendFunction - Hàm sendWsMessage từ websocket.js
 */
export function initChat(sendFunction) {
    _sendFn = sendFunction;

    // 1. Gán các hàm vào window để các nút HTML onclick="..." gọi được
    window.toggleChat = toggleChat;
    window.startChat = startChat;
    window.stopChat = toggleChat;
    window.sendChatMessage = sendChatMessage;

    // 2. Thêm sự kiện nhấn Enter để gửi
    const chatInput = $('#chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });

        chatInput.addEventListener('focus', hideBadge);
    }
}

// --- CÁC HÀM LOGIC NỘI BỘ ---

// Hàm ẩn chấm đỏ 
function hideBadge() {
    const badge = $('#chat-badge');
    const btn = $('#btn-toggle-chat');
    
    // Thêm class hidden để ẩn chấm đỏ
    if (badge) badge.classList.add('hidden');
    
    // Tắt hiệu ứng rung/sáng của nút icon nếu có
    if (btn) btn.classList.remove('alert-pulse'); 
}

// Hàm Bật/Tắt Chat (Gắn vào nút Footer)
function toggleChat() {
    const chatBox = $('#chat-box');
    const btn = $('#btn-toggle-chat');
    
    if (chatBox.classList.contains('hidden')) {
        // ĐANG ĐÓNG -> MỞ
        startChat();
        if (btn) btn.classList.add('active'); // Nút sáng lên
        hideBadge();
    } else {
        // ĐANG MỞ -> ĐÓNG
        chatBox.classList.add('hidden');
        if (btn) btn.classList.remove('active'); // Nút tắt sáng
    }
}

function startChat() {
    const chatBox = $('#chat-box');
    if (chatBox) {
        chatBox.classList.remove('hidden');
        setTimeout(() => $('#chat-input')?.focus(), 100);
    }
        
    
    if (_sendFn) _sendFn({ command: 'chat_start' });

    hideBadge();
}

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
    
    // Nếu chat đang ĐÓNG thì mới hiện chấm đỏ
    const chatBox = $('#chat-box');
    if (chatBox && chatBox.classList.contains('hidden')) {
        const badge = $('#chat-badge');
        if (badge) badge.classList.remove('hidden'); // Hiện chấm đỏ
        
        // (Tùy chọn) Hiệu ứng rung nút chat
        const btn = $('#btn-toggle-chat');
        if (btn) {
            btn.classList.add('alert-pulse'); 
        }
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