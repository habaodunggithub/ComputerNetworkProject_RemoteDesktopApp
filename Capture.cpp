#include "Capture.h"
#include <string>
#include <vector>
#include <fstream>
#include <iostream>

#ifdef _WIN32
#include <windows.h>

#include <objidl.h>  // định nghĩa PROPID
#include <objbase.h> // khai báo CLSIDFromString
#include <gdiplus.h>

#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "Ole32.lib")
#pragma comment(lib, "Gdi32.lib")
#pragma comment(lib, "User32.lib")

using namespace Gdiplus;
#endif

// Hàm chuyển file ảnh sang base64
static std::string file_to_base64(const std::string &path)
{
    std::ifstream ifs(path, std::ios::binary);
    if (!ifs.is_open())
        return "";
    std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(ifs)), {});
    static const char *base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string encoded;
    int val = 0, valb = -6;
    for (unsigned char c : bytes)
    {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0)
        {
            encoded.push_back(base64_chars[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6)
        encoded.push_back(base64_chars[((val << 8) >> (valb + 8)) & 0x3F]);
    while (encoded.size() % 4)
        encoded.push_back('=');
    return encoded;
}

#ifdef _WIN32
bool capture_screenshot(const std::string &output_path)
{
    ULONG_PTR gdiplusToken;
    GdiplusStartupInput gdiplusStartupInput;
    if (GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, nullptr) != Ok)
    {
        std::cerr << "Lỗi khởi tạo GDI+.\n";
        return false;
    }

    HDC hScreen = GetDC(nullptr);
    if (!hScreen)
        return false;

    int width = GetSystemMetrics(SM_CXSCREEN);
    int height = GetSystemMetrics(SM_CYSCREEN);

    HDC hDC = CreateCompatibleDC(hScreen);
    if (!hDC)
    { // Thêm kiểm tra
        ReleaseDC(nullptr, hScreen);
        return false;
    }

    HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, width, height);
    if (!hBitmap)
    {
        DeleteDC(hDC);
        ReleaseDC(nullptr, hScreen);
        std::cerr << "Lỗi: CreateCompatibleBitmap thất bại.\n";
        return false;
    }

    HGDIOBJ old = SelectObject(hDC, hBitmap);
    BitBlt(hDC, 0, 0, width, height, hScreen, 0, 0, SRCCOPY);
    SelectObject(hDC, old);

    CLSID clsid;
    CLSIDFromString(L"{557CF406-1A04-11D3-9A73-0000F81EF32E}", &clsid); // PNG encoder

    Bitmap bmp(hBitmap, nullptr);
    std::wstring wpath(output_path.begin(), output_path.end());
    Status status = bmp.Save(wpath.c_str(), &clsid, nullptr);

    DeleteObject(hBitmap);
    DeleteDC(hDC);
    ReleaseDC(nullptr, hScreen);

    return status == Ok;
}
#else
bool capture_screenshot(const std::string &output_path)
{
    // Linux/macOS: cần cài đặt tool như scrot / import
    std::string cmd = "scrot " + output_path;
    int ret = system(cmd.c_str());
    return ret == 0;
}
#endif

std::string capture_screenshot_base64()
{
    const std::string path = "screenshot.png";
    if (!capture_screenshot(path))
        return "";
    return file_to_base64(path);
}
