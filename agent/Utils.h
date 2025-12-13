#pragma once

#include <windows.h>
#include <stdio.h>
#include <fcntl.h>
#include <io.h>
#include <string>
#include <fstream>
#include <vector>
#include <filesystem>
#include <memory>

// --- BASE64 UTILITIES ---

/**
 * @brief Mã hóa Base64 siêu tốc sử dụng Lookup Table và Bitwise.
 * @param data Con trỏ dữ liệu binary.
 * @param len Độ dài dữ liệu.
 * @return Chuỗi Base64.
 */
inline std::string base64_encode(const unsigned char *data, size_t len)
{
    static const char tbl[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    // Cấp phát trước bộ nhớ để tránh re-allocation liên tục
    out.resize(((len + 2) / 3) * 4);

    size_t i = 0, j = 0;
    while (i < len)
    {
        uint32_t a = i < len ? data[i++] : 0;
        uint32_t b = i < len ? data[i++] : 0;
        uint32_t c = i < len ? data[i++] : 0;

        // Gom 3 bytes (24 bits) lại thành 1 số nguyên
        uint32_t triple = (a << 0x10) + (b << 0x08) + c;

        // Tách ra 4 ký tự Base64 (mỗi ký tự 6 bits)
        out[j++] = tbl[(triple >> 18) & 0x3F];
        out[j++] = tbl[(triple >> 12) & 0x3F];
        out[j++] = tbl[(triple >> 6) & 0x3F];
        out[j++] = tbl[triple & 0x3F];
    }

    // Xử lý Padding (=)
    if (len % 3 == 1)
    {
        out[out.size() - 1] = '=';
        out[out.size() - 2] = '=';
    }
    else if (len % 3 == 2)
    {
        out[out.size() - 1] = '=';
    }

    return out;
}

// Overload cho std::vector để tiện dùng
inline std::string base64_encode(const std::vector<unsigned char> &vec)
{
    return base64_encode(vec.data(), vec.size());
}

inline std::string base64_decode(const std::string &in)
{
    std::string out;
    std::vector<int> T(256, -1);
    static const char *code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (int i = 0; i < 64; i++)
        T[code[i]] = i;

    int val = 0, valb = -8;
    for (unsigned char c : in)
    {
        if (c == '=')
            break; // ✅ chỉ dừng khi padding
        if (T[c] == -1)
            continue; // ✅ bỏ qua ký tự lạ (newline, space)

        val = (val << 6) + T[c];
        valb += 6;
        if (valb >= 0)
        {
            out.push_back(char((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return out;
}

// Hàm chuyển đổi std::string (UTF-8) sang std::wstring (Unicode)
inline std::wstring ToWide(const std::string &str)
{
    if (str.empty())
        return std::wstring();
    // Tính độ dài buffer cần thiết
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    // Chuyển đổi
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

// Helper Functions (Converted to inline for header-only usage)

inline std::string ToUtf8(const std::wstring &wstr)
{
    if (wstr.empty())
        return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

// --- RESOURCE & SYSTEM UTILITIES ---

// Hàm trích xuất Resource ra file
inline bool ExtractResource(int resourceId, const std::string &outputFilename)
{
    HRSRC hResource = FindResource(NULL, MAKEINTRESOURCE(resourceId), RT_RCDATA);
    if (!hResource)
        return false;

    HGLOBAL hLoadedResource = LoadResource(NULL, hResource);
    if (!hLoadedResource)
        return false;

    void *pResourceData = LockResource(hLoadedResource);
    DWORD resourceSize = SizeofResource(NULL, hResource);
    if (!pResourceData || resourceSize == 0)
        return false;

    std::ofstream outFile(outputFilename, std::ios::binary);
    if (!outFile)
        return false;

    outFile.write(static_cast<const char *>(pResourceData), resourceSize);
    outFile.close();

    return true;
}

// Hàm lấy đường dẫn FFmpeg trong thư mục Temp
inline std::string getFFmpegPath()
{
    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    return std::string(tempPath) + "ffmpeg_agent.exe";
}

// Hàm popen chạy ẩn (dùng CreateProcess)
inline FILE *popen_hidden(const char *cmd, const char *mode)
{
    HANDLE hReadPipe, hWritePipe;
    SECURITY_ATTRIBUTES sa = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};

    if (!CreatePipe(&hReadPipe, &hWritePipe, &sa, 0))
        return NULL;
    SetHandleInformation(hReadPipe, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOA si = {sizeof(si)};
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = hWritePipe;
    si.hStdError = hWritePipe;

    PROCESS_INFORMATION pi = {0};
    char *cmdBuf = _strdup(cmd);

    BOOL success = CreateProcessA(NULL, cmdBuf, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi);
    free(cmdBuf);
    CloseHandle(hWritePipe);

    if (!success)
    {
        CloseHandle(hReadPipe);
        return NULL;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    int fd = _open_osfhandle((intptr_t)hReadPipe, _O_RDONLY | (_stricmp(mode, "rb") == 0 ? _O_BINARY : _O_TEXT));
    if (fd == -1)
    {
        CloseHandle(hReadPipe);
        return NULL;
    }

    return _fdopen(fd, mode);
}