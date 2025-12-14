// =================================================================
// MODULE: KEYLOGGER
// Xử lý hiển thị và làm sạch log bàn phím
// =================================================================

import { $ } from '../core/utils.js';

export function handleKeyEvent(keyCode, keyChar) {
    const el = document.getElementById('keylog-output');
    if (!el) return;
    if (keyChar === '[BACKSPACE]') el.textContent = el.textContent.slice(0, -1);
    else if (keyChar === '\n') el.textContent += '\n';
    else if (keyChar === '\t') el.textContent += '    ';
    else el.textContent += keyChar;
    el.scrollTop = el.scrollHeight;
}