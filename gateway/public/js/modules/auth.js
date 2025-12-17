// =================================================================
// MODULE: AUTHENTICATION
// Xử lý đăng nhập, đăng ký và session
// =================================================================

import { disconnectWs } from '../core/websocket.js';

export function initAuth() {
    const sessionUser = sessionStorage.getItem('rcc_user');

    // If not logged in, redirect to landing page
    if (!sessionUser) {
        window.location.href = '/';
        return;
    }
    
    console.log("Welcome back:", sessionUser);
}

// Xử lý Đăng xuất
export function performLogout() {
    sessionStorage.removeItem('rcc_user');
    disconnectWs();
    window.location.href = '/';
}