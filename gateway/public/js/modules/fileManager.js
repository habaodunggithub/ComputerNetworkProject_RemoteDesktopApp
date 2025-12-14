// =================================================================
// MODULE: FILE MANAGER
// Quản lý file, upload (chunking), download và viewer
// =================================================================

import { state } from '../core/state.js';
import { $, sanitizeId, downloadBase64File } from '../core/utils.js';
import { sendWsMessage } from '../core/websocket.js';

// --- File Viewing Logic ---
export function handleFileView(filename, base64, path) {
    const ext = filename.split('.').pop().toLowerCase();
    
    // Tạo modal viewer nếu chưa có
    let viewer = document.getElementById('file-viewer-modal');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'file-viewer-modal';
        // (CSS nội tuyến giữ nguyên như cũ để đảm bảo không đổi logic hiển thị)
        viewer.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.9); display: flex; align-items: center; justify-content: center; z-index: 9999;`;
        viewer.classList.add('hidden');
        viewer.innerHTML = `
            <div style="background-color: #1f2937; padding: 20px; border-radius: 8px; max-width: 800px; width: 90%; max-height: 90vh; overflow: auto; position: relative; display: flex; flex-direction: column; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <button id="close-viewer" style="position: absolute; top: 10px; right: 10px; color: white; background-color: #dc2626; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">X</button>
                <h3 id="viewer-title" style="color: white; margin-bottom: 15px; font-weight: bold; width: 100%; text-align: center; font-family: sans-serif;"></h3>
                <div id="viewer-content" style="width: 100%; display: flex; justify-content: center; color: #e5e7eb;"></div>
            </div>`;
        document.body.appendChild(viewer);
        viewer.querySelector('#close-viewer').onclick = () => {
            viewer.classList.add('hidden');
            viewer.querySelector('#viewer-content').innerHTML = ''; 
        };
    }

    const contentBox = viewer.querySelector('#viewer-content');
    const titleBox = viewer.querySelector('#viewer-title');
    titleBox.textContent = `Viewing: ${filename}`;
    contentBox.innerHTML = '';
    viewer.classList.remove('hidden');

    // Logic render theo loại file
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        contentBox.innerHTML = `<img src="data:image/${ext};base64,${base64}" style="max-width:100%; max-height:80vh;">`;
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for(let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        let mimeType = `video/${ext}`;
        if (ext === 'mov') mimeType = 'video/quicktime';
        const blob = new Blob([array], {type: mimeType});
        const url = URL.createObjectURL(blob);
        contentBox.innerHTML = `<video controls autoplay src="${url}" style="max-width:100%; max-height:80vh;"></video>`;
    } else if (['txt', 'log', 'ini', 'cfg', 'bat', 'cmd', 'cpp', 'h', 'js', 'html', 'css', 'json', 'xml'].includes(ext)) {
        try {
            const text = decodeURIComponent(escape(atob(base64))); 
            state.currentEditingFile = path; 
            contentBox.innerHTML = `
                <div style="display: flex; flex-direction: column; width: 100%; height: 80vh;">
                    <textarea id="file-editor-area" style="flex: 1; background: #111; color: #0f0; font-family: monospace; padding: 15px; border: 1px solid #444; resize: none; outline: none; font-size: 14px; line-height: 1.5;">${text.replace(/</g, '&lt;')}</textarea>
                    <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 10px;">
                        <span id="save-status" style="color: #0f0; margin-right: 10px; display: none;">Saved!</span>
                        <button onclick="saveCurrentFile()" style="background-color: #2563eb; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Save Changes</button>
                    </div>
                </div>`;
        } catch (e) {
            console.error(e);
            contentBox.textContent = "Error decoding text content for editing.";
        }
    } else if (ext === 'pdf') {
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        contentBox.innerHTML = `<iframe src="${url}" style="width: 100%; height: 80vh; border: none; background: #fff;"></iframe>`;
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for(let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        let mimeType = 'audio/mpeg';
        switch (ext) {
            case 'wav':  mimeType = 'audio/wav'; break;
            case 'ogg':  mimeType = 'audio/ogg'; break;
            case 'm4a':  mimeType = 'audio/aac'; break;
            case 'flac': mimeType = 'audio/flac'; break;
            case 'aac':  mimeType = 'audio/aac'; break;
        }
        const blob = new Blob([array], {type: mimeType});
        const url = URL.createObjectURL(blob);
        contentBox.innerHTML = `
            <div style="text-align: center; color: white; width: 100%;">
                <div style="margin-bottom: 20px; opacity: 0.8;"><i data-feather="music" style="width: 64px; height: 64px;"></i></div>
                <h3 style="margin-bottom: 15px; font-family: sans-serif;">${filename}</h3>
                <audio controls autoplay style="width: 80%; max-width: 500px;"><source src="${url}" type="${mimeType}">Your browser does not support the audio element.</audio>
            </div>`;
        if (typeof feather !== 'undefined') feather.replace();
    } else {
        contentBox.textContent = "Preview not supported for this file type.";
    }
}

// --- Chunk Upload Handlers ---
export function startFileUpload(file) {
    if (state.uploadState.active) return alert("Another upload is in progress!");
    
    console.log(`[Upload] Starting: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`);
    const statusPill = document.getElementById('status-pill');
    if(statusPill) statusPill.innerText = `Preparing ${file.name}...`;

    // Cập nhật state
    state.uploadState = {
        active: true,
        file: file,
        offset: 0,
        chunkSize: 512 * 1024, // 512KB
        totalChunks: Math.ceil(file.size / (512 * 1024)),
        currentChunkIndex: 0
    };

    sendNextChunk();
}

export function sendNextChunk() {
    if (!state.uploadState.active || !state.uploadState.file) return;

    const { file, offset, chunkSize, currentChunkIndex, totalChunks } = state.uploadState;

    // Kiểm tra hoàn thành
    if (offset >= file.size) {
        console.log("[Upload] Finished!");
        const statusPill = document.getElementById('status-pill');
        if(statusPill) statusPill.innerText = `Upload Complete!`;
        
        resetUploadState();
        sendWsMessage({ command: 'fs_list', path: state.currentPath, context: 'view' });
        
        setTimeout(() => {
            if(statusPill) statusPill.innerText = document.getElementById('status-text')?.textContent || "Connected";
        }, 3000);
        return;
    }

    // Cắt Chunk
    const chunkBlob = file.slice(offset, offset + chunkSize);
    
    // UI Update
    const percent = Math.round((currentChunkIndex / totalChunks) * 100);
    const statusPill = document.getElementById('status-pill');
    if(statusPill) statusPill.innerText = `Uploading: ${percent}%`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const rawBase64 = e.target.result.split(',')[1];
        const mode = (offset === 0) ? 'overwrite' : 'append';

        sendWsMessage({
            command: 'fs_upload',
            path: state.currentPath,
            name: file.name,
            data: rawBase64,
            mode: mode 
        });

        state.uploadState.offset += chunkSize;
        state.uploadState.currentChunkIndex++;
    };
    reader.readAsDataURL(chunkBlob);
}

export function resetUploadState() {
    state.uploadState = {
        active: false,
        file: null,
        offset: 0,
        chunkSize: 1024 * 1024,
        totalChunks: 0,
        currentChunkIndex: 0
    };
    const realFileInput = document.getElementById('hidden-file-input');
    if (realFileInput) realFileInput.value = '';
}

// --- Render Logic ---
export function renderDriveTree(drives) {
    const container = document.getElementById('fs-tree-container');
    container.innerHTML = drives.map(d => {
        const safePath = d.path.replace(/\\/g, '\\\\');
        return `
        <div class="tree-node" data-path="${d.path}" data-loaded="false">
            <div class="tree-item" onclick="onTreeItemClick(this, '${safePath}')">
                <span class="tree-toggle" onclick="onTreeToggle(event, this, '${safePath}')"><i data-feather="chevron-right"></i></span>
                <i data-feather="hard-drive" style="width:14px;height:14px;"></i> <span>${d.name}</span>
            </div>
            <div class="tree-children" id="tree-child-${sanitizeId(d.path)}"></div>
        </div>`;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

export function appendTreeChildren(parentPath, items) {
    const safeId = sanitizeId(parentPath);
    const childBox = document.getElementById(`tree-child-${safeId}`);
    if (!childBox) return;
    childBox.closest('.tree-node').dataset.loaded = 'true';
    const folders = items.filter(i => i.type === 'folder');

    if (folders.length === 0) {
        childBox.innerHTML = '<div style="padding:4px 0 4px 24px;font-size:11px;font-style:italic;opacity:0.6">Empty</div>';
        return;
    }

    childBox.innerHTML = folders.map(f => {
        let childPath = parentPath.endsWith('\\') ? parentPath + f.name : parentPath + '\\' + f.name;
        const safeChildPath = childPath.replace(/\\/g, '\\\\');
        return `
        <div class="tree-node" data-path="${childPath}" data-loaded="false">
            <div class="tree-item" onclick="onTreeItemClick(this, '${safeChildPath}')">
                <span class="tree-toggle" onclick="onTreeToggle(event, this, '${safeChildPath}')"><i data-feather="chevron-right"></i></span>
                <i data-feather="folder" style="width:14px;height:14px;color:#fbbf24"></i> <span>${f.name}</span>
            </div>
            <div class="tree-children" id="tree-child-${sanitizeId(childPath)}"></div>
        </div>`;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

export function renderFileList(path, data) {
    state.currentPath = path;
    const grid = document.getElementById('file-grid');
    if (grid) {
        grid.style.opacity = '1';
        grid.style.pointerEvents = 'auto';
    }
    const input = document.getElementById('fs-path-input');
    if (input) input.value = path;

    if (!data || data.length === 0) {
        grid.innerHTML = `<div style="padding:40px;text-align:center;grid-column:1/-1;color:var(--text-muted)">Empty Folder</div>`;
        return;
    }

    data.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });

    grid.innerHTML = data.map(item => {
        const isFolder = item.type === 'folder';
        const icon = isFolder ? 'folder' : 'file-text';
        let fullPath = path.endsWith('\\') ? path + item.name : path + '\\' + item.name;
        const safePath = fullPath.replace(/\\/g, '\\\\');
        const encodedName = encodeURIComponent(item.name); 

        const actionAttr = isFolder ? `ondblclick="openFolder('${safePath.replace(/'/g, "\\'")}')"` : '';

        return `
        <div class="file-item" data-type="${item.type}" ${actionAttr} title="${item.name}">
            <div class="file-actions">
                ${!isFolder ? `
                    <button class="btn-fs-action" onclick="requestViewFile('${encodedName}')" title="View"><i data-feather="eye" style="width:12px;"></i></button>
                    <button class="btn-fs-action download" onclick="requestDownloadFile('${encodedName}')" title="Download"><i data-feather="download" style="width:12px;"></i></button>
                ` : ''}
                <button class="btn-fs-action delete" onclick="requestDeleteFile('${encodedName}')" title="Delete"><i data-feather="trash-2" style="width:12px;"></i></button>
            </div>
            <div class="file-icon"><i data-feather="${icon}" style="width:32px;height:32px;"></i></div>
            <span class="file-name">${item.name}</span>
            ${!isFolder ? `<span style="font-size:10px;color:var(--text-muted);margin-top:2px">${(item.size/1024).toFixed(0)} KB</span>` : ''}
        </div>`;
    }).join('');

    if (typeof feather !== 'undefined') feather.replace();
}

export function unlockFileUI() {
    const grid = document.getElementById('file-grid');
    if (grid) {
        grid.style.opacity = '1';
        grid.style.pointerEvents = 'auto';
        grid.style.cursor = 'default';
    }
}