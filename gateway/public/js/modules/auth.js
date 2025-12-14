// =================================================================
// MODULE: AUTHENTICATION
// Xử lý đăng nhập, đăng ký và session
// =================================================================

import { $ } from '../core/utils.js';
import { disconnectWs } from '../core/websocket.js';

export function initAuth() {
    const authOverlay = $('#auth-overlay');
    const formLogin = $('#form-login');
    const formRegister = $('#form-register');
    const authMsg = $('#auth-msg');
    const sessionUser = sessionStorage.getItem('rcc_user');

    if (!sessionUser) authOverlay.classList.remove('hidden');
    else {
        authOverlay.classList.add('hidden');
        console.log("Welcome back:", sessionUser);
    }

    // Chuyển đổi giữa form Login/Register
    $('#link-to-register').onclick = (e) => {
        e.preventDefault();
        formLogin.classList.add('hidden');
        formRegister.classList.remove('hidden');
        authMsg.classList.add('hidden');
    };
    $('#link-to-login').onclick = (e) => {
        e.preventDefault();
        formRegister.classList.add('hidden');
        formLogin.classList.remove('hidden');
        authMsg.classList.add('hidden');
    };

    function showAuthMsg(msg, type) {
        authMsg.textContent = msg;
        authMsg.className = type;
        authMsg.classList.remove('hidden');
    }

    // Xử lý Đăng ký
    $('#btn-do-register').onclick = async () => {
        const u = $('#reg-user').value;
        const p = $('#reg-pass').value;
        if (!u || !p) return showAuthMsg("Please fill all fields", "error");
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p })
            });
            const data = await res.json();
            if (data.success) {
                showAuthMsg(data.message, "success");
                setTimeout(() => $('#link-to-login').click(), 2000);
            } else showAuthMsg(data.message, "error");
        } catch (e) {
            showAuthMsg("Network error", "error");
        }
    };

    // Xử lý Đăng nhập
    $('#btn-do-login').onclick = async () => {
        const u = $('#login-user').value;
        const p = $('#login-pass').value;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p })
            });
            const data = await res.json();
            if (data.success) {
                sessionStorage.setItem('rcc_user', data.username);
                authOverlay.classList.add('hidden');
            } else showAuthMsg(data.message, "error");
        } catch (e) {
            showAuthMsg("Network error", "error");
        }
    };
}

// Xử lý Đăng xuất
export function performLogout() {
    sessionStorage.removeItem('rcc_user');
    disconnectWs();
    location.reload();
}