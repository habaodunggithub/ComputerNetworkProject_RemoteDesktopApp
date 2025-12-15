#pragma once

#include <iostream>
#include <vector>
#include <string>
#include <memory>
#include <cstring>

#include <windows.h>
#include <objbase.h>
#include <objidl.h>
#include <gdiplus.h>
#include "Utils.h"

// Link thư viện tự động
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "Ole32.lib")
#pragma comment(lib, "Gdi32.lib")
#pragma comment(lib, "User32.lib")

// Helper: Lấy CLSID của encoder
inline int GetEncoderClsid(const WCHAR *format, CLSID *pClsid)
{
    using namespace Gdiplus;
    UINT num = 0, size = 0;
    GetImageEncodersSize(&num, &size);
    if (size == 0)
        return -1;

    std::unique_ptr<char[]> pImageCodecInfo(new char[size]);
    GetImageEncoders(num, size, (ImageCodecInfo *)pImageCodecInfo.get());

    ImageCodecInfo *pImageCodecInfoCast = (ImageCodecInfo *)pImageCodecInfo.get();
    for (UINT j = 0; j < num; ++j)
    {
        if (wcscmp(pImageCodecInfoCast[j].MimeType, format) == 0)
        {
            *pClsid = pImageCodecInfoCast[j].Clsid;
            return j;
        }
    }
    return -1;
}

inline std::string capture_screenshot_base64()
{
    using namespace Gdiplus;

    // 1. Chuẩn bị GDI
    HDC hScreen = GetDC(nullptr);
    HDC hDC = CreateCompatibleDC(hScreen);
    int width = GetSystemMetrics(SM_CXSCREEN);
    int height = GetSystemMetrics(SM_CYSCREEN);
    HBITMAP hBitmap = CreateCompatibleBitmap(hScreen, width, height);
    HGDIOBJ oldObj = SelectObject(hDC, hBitmap);

    // 2. Chụp màn hình (BitBlt)
    BitBlt(hDC, 0, 0, width, height, hScreen, 0, 0, SRCCOPY);

    // 3. Chuẩn bị Encoder (PNG)
    static CLSID pngClsid;
    static bool clsidFound = false;
    if (!clsidFound)
    {
        GetEncoderClsid(L"image/png", &pngClsid);
        clsidFound = true;
    }

    // 4. Lưu vào MEMORY
    IStream *pStream = nullptr;
    std::string resultBase64;

    if (CreateStreamOnHGlobal(nullptr, TRUE, &pStream) == S_OK)
    {
        Bitmap bmp(hBitmap, nullptr);

        // Lưu ảnh vào Stream
        if (bmp.Save(pStream, &pngClsid, nullptr) == Ok)
        {
            // Đọc dữ liệu từ Stream ra buffer
            HGLOBAL hMem = nullptr;
            GetHGlobalFromStream(pStream, &hMem);
            void *pData = GlobalLock(hMem);
            size_t len = GlobalSize(hMem);

            // Encode Base64 trực tiếp
            if (pData)
            {
                resultBase64 = base64_encode(static_cast<unsigned char *>(pData), len);
                GlobalUnlock(hMem);
            }
        }
        pStream->Release();
    }

    // 5. Cleanup
    SelectObject(hDC, oldObj);
    DeleteObject(hBitmap);
    DeleteDC(hDC);
    ReleaseDC(nullptr, hScreen);

    return resultBase64;
}